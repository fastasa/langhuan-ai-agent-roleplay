import { logger } from '../../logger.js'
import { createTimerRepository, timerRepository } from '../../repositories/timerRepository.js'

export interface TimerData {
  ticketId: string
  ticketName: string
  endTime: number
  paused: boolean
  remainingMs: number
  intervalHandle: NodeJS.Timeout | null
  done: boolean
  cleanupHandle: NodeJS.Timeout | null
}

export interface TimerStatus {
  id: string
  ticketId: string
  ticketName: string
  endTime: number
  remainingMs: number
  paused: boolean
  done: boolean
}

export function createTimerAppService(
  repository: ReturnType<typeof createTimerRepository> = timerRepository,
  appLogger: Pick<typeof logger, 'system' | 'error'> = logger
) {
  const timers = new Map<string, TimerData>()

  function clearTimer(timerId: string) {
    const t = timers.get(timerId)
    if (t?.intervalHandle) clearTimeout(t.intervalHandle)
    if (t?.cleanupHandle) clearTimeout(t.cleanupHandle)
    timers.delete(timerId)
  }

  function clearTimerCleanup(timerId: string) {
    const timer = timers.get(timerId)
    if (timer?.cleanupHandle) {
      clearTimeout(timer.cleanupHandle)
      timer.cleanupHandle = null
    }
  }

  function scheduleCompletedCleanup(timerId: string, delayMs = 60_000) {
    const timer = timers.get(timerId)
    if (!timer) return
    clearTimerCleanup(timerId)
    timer.cleanupHandle = setTimeout(() => {
      clearTimer(timerId)
      try {
        repository.deleteTimer(timerId)
      } catch (e) {
        appLogger.error('延迟删除计时器失败:', e)
      }
    }, delayMs)
  }

  function markTimerDone(timerId: string) {
    const timer = timers.get(timerId)
    if (!timer) return
    if (timer.intervalHandle) {
      clearTimeout(timer.intervalHandle)
      timer.intervalHandle = null
    }
    timer.endTime = Date.now()
    timer.remainingMs = 0
    timer.paused = false
    timer.done = true
    try {
      repository.updateTimerAfterDone(timerId, timer.endTime)
    } catch (e) {
      appLogger.error('更新完成态计时器失败:', e)
    }
    scheduleCompletedCleanup(timerId)
  }

  function createRunningTimeout(timerId: string, remainingMs: number) {
    return setTimeout(() => {
      markTimerDone(timerId)
    }, remainingMs)
  }

  function getTimerStatus(timerId: string): TimerStatus | null {
    const t = timers.get(timerId)
    if (!t) return null
    const now = Date.now()
    const remainingMs = t.paused ? t.remainingMs : (t.endTime - now)
    return {
      id: timerId,
      ticketId: t.ticketId,
      ticketName: t.ticketName,
      endTime: t.endTime,
      remainingMs: Math.max(0, remainingMs),
      paused: t.paused,
      done: t.done || remainingMs <= 0
    }
  }

  function loadTimersFromDb() {
    try {
      if (repository.ensureTable()) {
        appLogger.system('timers表不存在，正在创建...')
        appLogger.system('timers表创建完成')
        return
      }
      const rows = repository.listTimers()
      const now = Date.now()
      for (const row of rows) {
        if (!row.paused && row.end_time <= now) {
          repository.deleteTimer(row.id)
          continue
        }
        const remainingMs = row.paused ? row.remaining_ms : (row.end_time - now)
        if (remainingMs <= 0) continue
        const intervalHandle = row.paused ? null : createRunningTimeout(row.id, remainingMs)
        timers.set(row.id, {
          ticketId: row.ticket_id,
          ticketName: row.ticket_name,
          endTime: row.end_time,
          paused: !!row.paused,
          remainingMs,
          intervalHandle,
          done: false,
          cleanupHandle: null
        })
      }
      appLogger.system(`已从数据库加载 ${timers.size} 个计时器`)
    } catch (err) {
      appLogger.error('加载计时器失败:', err)
    }
  }

  loadTimersFromDb()

  return {
    listTimers() {
      const result: TimerStatus[] = []
      for (const id of timers.keys()) {
        const status = getTimerStatus(id)
        if (status) result.push(status)
      }
      return result
    },
    createTimer(payload: Record<string, any>) {
      const { id, ticketId, ticketName, durationMs } = payload
      if (!id || !durationMs) {
        return { ok: false as const, status: 400, error: '缺少参数' }
      }
      clearTimer(id)
      const endTime = Date.now() + durationMs
      const handle = createRunningTimeout(id, durationMs)
      timers.set(id, {
        ticketId,
        ticketName,
        endTime,
        paused: false,
        remainingMs: durationMs,
        intervalHandle: handle,
        done: false,
        cleanupHandle: null
      })
      repository.upsertTimer({ id, ticketId, ticketName, endTime, paused: false, remainingMs: durationMs })
      return { ok: true as const, data: { ok: true, ...getTimerStatus(id)! } }
    },
    pauseTimer(timerId: string) {
      const t = timers.get(timerId)
      if (!t) return { ok: false as const, status: 404, error: '计时器不存在' }
      if (t.paused) return { ok: true as const, data: getTimerStatus(timerId) }
      clearTimeout(t.intervalHandle!)
      t.remainingMs = t.endTime - Date.now()
      t.paused = true
      t.done = false
      t.intervalHandle = null
      repository.updateTimerAfterPause(timerId, t.remainingMs)
      return { ok: true as const, data: getTimerStatus(timerId) }
    },
    resumeTimer(timerId: string) {
      const t = timers.get(timerId)
      if (!t) return { ok: false as const, status: 404, error: '计时器不存在' }
      if (!t.paused) return { ok: true as const, data: getTimerStatus(timerId) }
      t.endTime = Date.now() + t.remainingMs
      t.paused = false
      t.done = false
      t.intervalHandle = createRunningTimeout(timerId, t.remainingMs)
      repository.updateTimerAfterResume(timerId, t.endTime)
      return { ok: true as const, data: getTimerStatus(timerId) }
    },
    replaceTimers(payload: Record<string, any>) {
      const list = Array.isArray(payload?.timers) ? payload.timers : []
      for (const [id, timer] of timers.entries()) {
        if (timer.intervalHandle) clearTimeout(timer.intervalHandle)
        timers.delete(id)
      }
      const now = Date.now()
      const nextRows: Array<{
        id: string
        ticketId: string
        ticketName: string
        endTime: number
        paused: boolean
        remainingMs: number
      }> = []
      for (const item of list) {
        const timerId = String(item?.id || '')
        const ticketId = String(item?.ticketId || item?.ticket_id || '')
        const ticketName = String(item?.ticketName || item?.ticket_name || '票据')
        const paused = Boolean(item?.paused)
        const remainingMs = Math.max(0, Number(item?.remainingMs ?? item?.remaining_ms ?? 0))
        if (!timerId || !ticketId || remainingMs <= 0) continue
        const endTimeFromPayload = Number(item?.endTime ?? item?.end_time ?? 0)
        const endTime = paused
          ? now + remainingMs
          : (Number.isFinite(endTimeFromPayload) && endTimeFromPayload > now ? endTimeFromPayload : now + remainingMs)
        const effectiveRemaining = paused ? remainingMs : Math.max(0, endTime - now)
        if (effectiveRemaining <= 0) continue
        const intervalHandle = paused ? null : createRunningTimeout(timerId, effectiveRemaining)
        timers.set(timerId, {
          ticketId,
          ticketName,
          endTime,
          paused,
          remainingMs: effectiveRemaining,
          intervalHandle,
          done: false,
          cleanupHandle: null
        })
        nextRows.push({ id: timerId, ticketId, ticketName, endTime, paused, remainingMs: effectiveRemaining })
      }
      repository.replaceTimers(nextRows)
      return { ok: true as const, data: { ok: true, timers: this.listTimers() } }
    },
    deleteTimer(timerId: string) {
      clearTimer(timerId)
      repository.deleteTimer(timerId)
      return { ok: true as const, data: { ok: true } }
    }
  }
}

export const timerAppService = createTimerAppService()
