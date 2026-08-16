import { API } from '../config/api'

export type TimerRecord = {
  id: string
  ticketId: string
  ticketName: string
  endTime: number
  paused: boolean
  remainingMs: number
  done?: boolean
  created_at?: string
}

type TimerStartResult = {
  ok: boolean
  error?: string
}

async function ensureTimerOk(response: Response, fallbackMessage: string): Promise<void> {
  if (response.ok) return
  throw new Error(fallbackMessage)
}

export async function fetchTimerRecords(): Promise<Response> {
  return await fetch(API.TIMERS)
}

export async function readTimerRecords(): Promise<TimerRecord[]> {
  const response = await fetchTimerRecords()
  await ensureTimerOk(response, '读取计时器失败')
  return await response.json() as TimerRecord[]
}

export async function createTimerRecord(payload: {
  id: string
  ticketId: string
  ticketName: string
  durationMs: number
}): Promise<TimerStartResult> {
  const response = await fetch(API.TIMERS, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  await ensureTimerOk(response, '创建计时器失败')
  return await response.json() as TimerStartResult
}

export async function pauseTimerRecord(timerId: string): Promise<void> {
  const response = await fetch(`${API.TIMERS}/${timerId}/pause`, { method: 'PUT' })
  await ensureTimerOk(response, '暂停计时器失败')
}

export async function resumeTimerRecord(timerId: string): Promise<void> {
  const response = await fetch(`${API.TIMERS}/${timerId}/resume`, { method: 'PUT' })
  await ensureTimerOk(response, '恢复计时器失败')
}

export async function deleteTimerRecord(timerId: string): Promise<void> {
  const response = await fetch(`${API.TIMERS}/${timerId}`, { method: 'DELETE' })
  await ensureTimerOk(response, '删除计时器失败')
}

export async function replaceTimerRecords(timers: unknown[]): Promise<void> {
  const response = await fetch(`${API.TIMERS}/replace`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ timers: Array.isArray(timers) ? timers : [] })
  })
  await ensureTimerOk(response, '替换计时器失败')
}
