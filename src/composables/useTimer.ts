/**
 * composables/useTimer.ts
 * 前端计时器逻辑：轮询服务端计时器状态
 */
import { ref, onMounted, onUnmounted } from 'vue'
import { BACKGROUND_POLL_INTERVAL_MS, POLL_INTERVAL_MS } from '../constants'
import {
  createTimerRecord,
  deleteTimerRecord,
  fetchTimerRecords,
  pauseTimerRecord,
  replaceTimerRecords,
  resumeTimerRecord
} from '../repositories/timerRepository'

// 计时器数据类型
interface TimerData {
  id: string
  ticketId: string
  ticketName: string
  endTime: number
  paused: boolean
  remainingMs: number
  done?: boolean
  created_at?: string
}

interface TimerCompleteEvent {
  timerId: string
  ticketId: string
  ticketName: string
}

interface TimerCompleteResult {
  title?: string
  type?: 'info' | 'success' | 'warning'
  notificationTitle?: string
  notificationBody?: string
  modalMessage?: string
}

interface UseTimerOptions {
  onTimerComplete?: (event: TimerCompleteEvent) => Promise<TimerCompleteResult | void> | TimerCompleteResult | void
}

// 创建全局事件发射器用于计时完成通知
const timerEventEmitter = new EventTarget()

export function useTimer(options: UseTimerOptions = {}) {
  // 活跃的计时器列表（从服务端同步）
  const activeTimers = ref<TimerData[]>([])
  const notificationSupported = ref(false)
  const notificationPermission = ref<NotificationPermission | 'unsupported'>('unsupported')
  // 服务端暂不可用时停止轮询，避免控制台持续 500 报错刷屏
  const timerApiUnavailable = ref(false)
  const timerRateLimitedUntil = ref(0)
  const timerRateLimitBackoffMs = ref(5000)
  // 轮询间隔ID
  let pollTimerId: ReturnType<typeof setTimeout> | null = null
  let secondTickerId: ReturnType<typeof setInterval> | null = null
  let isFetchingTimers = false
  // 是否全局暂停
  const isTimerPaused = ref(false)
  let onTimerComplete = options.onTimerComplete || null

  function withLiveRemaining(timer: TimerData): TimerData {
    const paused = Boolean(timer.paused)
    const fallbackRemaining = Math.max(0, Number(timer.remainingMs || 0))
    const endTime = Number(timer.endTime || 0)
    const remainingMs = paused || !endTime
      ? fallbackRemaining
      : Math.max(0, endTime - Date.now())
    return {
      ...timer,
      paused,
      remainingMs
    }
  }

  function syncLiveRemaining(): void {
    if (!activeTimers.value.length) return
    activeTimers.value = activeTimers.value.map((timer) => withLiveRemaining(timer))
  }

  /**
   * 从服务端获取所有计时器状态
   */
  async function fetchTimers(): Promise<void> {
    if (timerApiUnavailable.value || isFetchingTimers) return
    if (timerRateLimitedUntil.value && Date.now() < timerRateLimitedUntil.value) return
    isFetchingTimers = true
    try {
      const res = await fetchTimerRecords()
      if (!res.ok) {
        if (res.status === 429) {
          timerRateLimitedUntil.value = Date.now() + timerRateLimitBackoffMs.value
          timerRateLimitBackoffMs.value = Math.min(timerRateLimitBackoffMs.value * 2, 60000)
          return
        }
        if (res.status >= 500) {
          timerApiUnavailable.value = true
          stopPolling()
        }
        return
      }
      timerRateLimitedUntil.value = 0
      timerRateLimitBackoffMs.value = 5000
      const data = await res.json() as TimerData[]
      activeTimers.value = data.map((timer) => withLiveRemaining(timer))

      // 检查是否有计时器已完成
      for (const t of data) {
        if (t.done) {
          const eventPayload: TimerCompleteEvent = {
            timerId: t.id,
            ticketId: t.ticketId,
            ticketName: t.ticketName
          }
          let extra: TimerCompleteResult | void = undefined
          if (onTimerComplete) {
            try {
              extra = await onTimerComplete(eventPayload)
            } catch (error) {
              console.error('处理计时完成回调失败:', error)
            }
          }

          const notificationTitle = extra?.notificationTitle || `${t.ticketName} 计时结束`
          const notificationBody = extra?.notificationBody || '票据时间已用完'

          // 发送浏览器通知（后台标签页也可见）
          sendNotification(notificationTitle, notificationBody)

          // 发送自定义事件供前端显示弹窗
          timerEventEmitter.dispatchEvent(new CustomEvent('timer-complete', {
            detail: {
              ...eventPayload,
              title: extra?.title || '票据计时完成',
              type: extra?.type || 'info',
              message: extra?.modalMessage || notificationBody
            }
          }))
          // 删除已完成的计时器
          await removeTimer(t.id)
        }
      }
    } catch (err) {
      console.error('获取计时器状态失败:', err)
    } finally {
      isFetchingTimers = false
    }
  }

  function getCurrentPollInterval(): number {
    if (typeof document !== 'undefined' && document.hidden) {
      return BACKGROUND_POLL_INTERVAL_MS
    }
    return POLL_INTERVAL_MS
  }

  function scheduleNextPoll(): void {
    if (pollTimerId || timerApiUnavailable.value) return
    pollTimerId = setTimeout(async () => {
      pollTimerId = null
      await fetchTimers()
      if (!timerApiUnavailable.value) {
        scheduleNextPoll()
      }
    }, getCurrentPollInterval())
  }

  /**
   * 创建新计时器
   */
  async function startTimer(ticketId: string, ticketName: string, durationMinutes: number): Promise<{ ok: boolean; error?: string }> {
    if (timerApiUnavailable.value) {
      return { ok: false, error: '计时器服务暂不可用' }
    }
    syncNotificationPermission()
    const id = `timer_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
    try {
      const data = await createTimerRecord({
        id,
        ticketId,
        ticketName,
        durationMs: durationMinutes * 60 * 1000
      })
      if (data.ok) {
        await fetchTimers()
        startPolling()
      }
      return data
    } catch {
      return { ok: false, error: '创建计时器失败' }
    }
  }

  /**
   * 暂停计时器
   */
  async function pauseTimer(timerId: string): Promise<void> {
    if (timerApiUnavailable.value) return
    await pauseTimerRecord(timerId)
    await fetchTimers()
    startPolling()
  }

  /**
   * 恢复计时器
   */
  async function resumeTimer(timerId: string): Promise<void> {
    if (timerApiUnavailable.value) return
    await resumeTimerRecord(timerId)
    await fetchTimers()
    startPolling()
  }

  /**
   * 删除计时器
   */
  async function removeTimer(timerId: string): Promise<void> {
    if (timerApiUnavailable.value) {
      activeTimers.value = activeTimers.value.filter(t => t.id !== timerId)
      return
    }
    await deleteTimerRecord(timerId)
    activeTimers.value = activeTimers.value.filter(t => t.id !== timerId)
    startPolling()
  }

  /**
   * 全局暂停/恢复所有计时器
   */
  async function togglePauseAll(): Promise<void> {
    isTimerPaused.value = !isTimerPaused.value
    for (const t of activeTimers.value) {
      if (isTimerPaused.value) {
        await pauseTimer(t.id)
      } else {
        await resumeTimer(t.id)
      }
    }
  }

  /**
   * 发送浏览器通知
   */
  function sendNotification(title: string, body: string): void {
    syncNotificationPermission()
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, {
        body,
        tag: 'langhuan-ticket-timer'
      })
      if ('vibrate' in navigator) {
        navigator.vibrate([200, 120, 200])
      }
    }
  }

  function syncNotificationPermission(): NotificationPermission | 'unsupported' {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      notificationSupported.value = false
      notificationPermission.value = 'unsupported'
      return 'unsupported'
    }
    notificationSupported.value = true
    notificationPermission.value = Notification.permission
    return notificationPermission.value
  }

  async function requestNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
    const currentPermission = syncNotificationPermission()
    if (currentPermission === 'unsupported') {
      return currentPermission
    }
    if (Notification.permission === 'default') {
      try {
        const result = await Notification.requestPermission()
        notificationPermission.value = result
        return result
      } catch (error) {
        console.warn('请求通知权限失败:', error)
      }
    }
    return syncNotificationPermission()
  }

  /**
   * 格式化剩余时间
   */
  function formatRemaining(ms: number): string {
    if (ms <= 0) return '00:00'
    const totalSec = Math.max(0, Math.floor(ms / 1000))
    const min = Math.floor(totalSec / 60)
    const sec = totalSec % 60
    return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  }

  /**
   * 获取指定票据的计时器（返回剩余时间）
   */
  function getTicketTimer(ticketId: string): TimerData | undefined {
    return activeTimers.value.find(t => t.ticketId === ticketId)
  }

  /**
   * 获取指定票据的计时器数量（排队中的）
   */
  function getTicketTimerCount(ticketId: string): number {
    return activeTimers.value.filter(t => t.ticketId === ticketId).length
  }

  function getTicketTimers(ticketId: string): TimerData[] {
    return activeTimers.value
      .filter(t => t.ticketId === ticketId)
      .sort((a, b) => Number(a.remainingMs || 0) - Number(b.remainingMs || 0))
  }

  function getSerializableTimers() {
    return activeTimers.value.map((timer) => ({
      id: timer.id,
      ticketId: timer.ticketId,
      ticketName: timer.ticketName,
      endTime: timer.endTime,
      paused: Boolean(timer.paused),
      remainingMs: Math.max(0, Number(timer.remainingMs || 0))
    }))
  }

  async function replaceTimersFromLocalArchive(timers: any[]): Promise<void> {
    if (timerApiUnavailable.value) return
    await replaceTimerRecords(timers)
    await fetchTimers()
    startPolling()
  }

  function setTimerCompleteHandler(handler: UseTimerOptions['onTimerComplete']) {
    onTimerComplete = handler || null
  }

  // 开始轮询（每秒更新一次）
  function startPolling(): void {
    if (timerApiUnavailable.value) return
    stopPolling()
    fetchTimers().finally(() => {
      if (!timerApiUnavailable.value) {
        scheduleNextPoll()
      }
    })
  }

  // 停止轮询
  function stopPolling(): void {
    if (pollTimerId) {
      clearTimeout(pollTimerId)
      pollTimerId = null
    }
  }

  function handleVisibilityChange() {
    startPolling()
  }

  function startSecondTicker(): void {
    if (secondTickerId) return
    secondTickerId = setInterval(() => {
      syncLiveRemaining()
    }, 1000)
  }

  function stopSecondTicker(): void {
    if (!secondTickerId) return
    clearInterval(secondTickerId)
    secondTickerId = null
  }

  // 自动启停轮询
  onMounted(() => {
    syncNotificationPermission()
    startPolling()
    startSecondTicker()
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange)
    }
  })
  onUnmounted(() => {
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
    stopPolling()
    stopSecondTicker()
  })

  return {
    activeTimers,
    notificationSupported,
    notificationPermission,
    isTimerPaused,
    fetchTimers,
    startTimer,
    pauseTimer,
    resumeTimer,
    removeTimer,
    togglePauseAll,
    formatRemaining,
    getTicketTimer,
    getTicketTimers,
    getTicketTimerCount,
    getSerializableTimers,
    replaceTimersFromLocalArchive,
    syncNotificationPermission,
    requestNotificationPermission,
    setTimerCompleteHandler,
    startPolling,
    stopPolling,
    timerEventEmitter  // 导出事件发射器供外部监听
  }
}

// 导出事件发射器供其他模块直接监听
export { timerEventEmitter }
export type { TimerCompleteEvent, TimerCompleteResult }
