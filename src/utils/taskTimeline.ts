import type { EventStackItem, Task, TimerMark } from '../types'

export interface TimelineNode {
  id: string
  label: string
  time: number
  isStart: boolean
  note?: string
  color?: string
}

const START_COLOR = '#5f9f6f'
const END_COLOR = '#c97b63'

export function formatTimelineTime(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '00:00'
  const totalSec = Math.floor(ms / 1000)
  const hours = Math.floor(totalSec / 3600)
  const minutes = Math.floor((totalSec % 3600) / 60)
  const seconds = totalSec % 60

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  }

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function getMarkColor(mark: Pick<TimerMark, 'isStart'>) {
  return mark.isStart ? START_COLOR : END_COLOR
}

export function buildTaskTimelineNodes(
  task: Pick<Task, 'id' | 'title' | 'timerState'>,
  elapsedMs?: number,
  options?: { resolveMarkColor?: (mark: TimerMark) => string | undefined }
): TimelineNode[] {
  const totalMs = Math.max(0, elapsedMs ?? task.timerState?.accumulatedTime ?? 0)
  const marks = Array.isArray(task.timerState?.marks)
    ? [...task.timerState.marks].sort((a, b) => a.time - b.time)
    : []

  const nodes: TimelineNode[] = [
    {
      id: `${task.id}_task_start`,
      label: '任务开始',
      time: 0,
      isStart: true,
      color: START_COLOR
    },
    ...marks.map((mark) => ({
      id: mark.id,
      label: mark.type || '标记',
      time: Math.max(0, mark.time || 0),
      isStart: mark.isStart !== false,
      note: mark.note || '',
      color: options?.resolveMarkColor?.(mark) || getMarkColor(mark)
    })),
    {
      id: `${task.id}_task_end`,
      label: '任务结束',
      time: totalMs,
      isStart: false,
      color: END_COLOR
    }
  ]

  return dedupeTimelineNodes(nodes)
}

export function buildEventTimelineNodes(event: Pick<EventStackItem, 'id' | 'durationSeconds' | 'timelineJson'>): TimelineNode[] {
  if (Array.isArray(event.timelineJson) && event.timelineJson.length > 0) {
    return dedupeTimelineNodes(event.timelineJson.map((item, index) => ({
      id: `${event.id}_${index}_${item.label}`,
      label: item.label,
      time: Math.max(0, item.time || 0),
      isStart: item.isStart !== false,
      note: item.note || '',
      color: item.color || (item.isStart === false ? END_COLOR : START_COLOR)
    })))
  }

  const totalMs = Math.max(0, (event.durationSeconds || 0) * 1000)
  return dedupeTimelineNodes([
    { id: `${event.id}_start`, label: '任务开始', time: 0, isStart: true, color: START_COLOR },
    { id: `${event.id}_end`, label: '任务结束', time: totalMs, isStart: false, color: END_COLOR }
  ])
}

export function buildEventTimelinePayload(
  task: Pick<Task, 'id' | 'title' | 'timerState'>,
  elapsedMs: number,
  options?: { resolveMarkColor?: (mark: TimerMark) => string | undefined }
) {
  return buildTaskTimelineNodes(task, elapsedMs, options).map((node) => ({
    label: node.label,
    time: node.time,
    isStart: node.isStart,
    note: node.note || '',
    color: node.color
  }))
}

export interface TimerMarkInterval {
  key: string
  label: string
  start: number
  end: number
  duration: number
}

interface OpenTimerInterval {
  key: string
  label: string
  start: number
  tagId: string
  type: string
  closed?: boolean
}

function normalizeMarkTagId(mark: TimerMark | undefined) {
  return String(mark?.tagId || '')
}

function normalizeMarkType(mark: TimerMark | undefined) {
  return String(mark?.type || '工作')
}

function buildIntervalKey(tagId: string, type: string) {
  return tagId || type || '工作'
}

function popLatestOpen(stack: OpenTimerInterval[] | undefined) {
  while (stack?.length) {
    const current = stack.pop()
    if (current && !current.closed) return current
  }
  return undefined
}

function pairTimerMarkIntervals(marks: TimerMark[], elapsedMs: number) {
  const openIntervals: OpenTimerInterval[] = []
  const openByTag = new Map<string, OpenTimerInterval[]>()
  const openByType = new Map<string, OpenTimerInterval[]>()
  const intervals: TimerMarkInterval[] = []

  const pushOpen = (index: Map<string, OpenTimerInterval[]>, key: string, current: OpenTimerInterval) => {
    const stack = index.get(key)
    if (stack) stack.push(current)
    else index.set(key, [current])
  }

  for (const mark of marks) {
    const tagId = normalizeMarkTagId(mark)
    const type = normalizeMarkType(mark)
    const time = Math.max(0, Number(mark.time || 0))
    if (mark.isStart !== false) {
      const current = { key: buildIntervalKey(tagId, type), label: type, start: time, tagId, type }
      openIntervals.push(current)
      if (tagId) pushOpen(openByTag, tagId, current)
      pushOpen(openByType, type, current)
      continue
    }

    const current = (tagId ? popLatestOpen(openByTag.get(tagId)) : undefined)
      || popLatestOpen(openByType.get(type))
    if (!current) continue
    current.closed = true
    const end = Math.max(current.start, time)
    intervals.push({
      key: current.key,
      label: current.label,
      start: current.start,
      end,
      duration: Math.max(0, end - current.start)
    })
  }

  const remaining = openIntervals.filter((current) => !current.closed)
  remaining.forEach((current) => {
    const end = Math.max(current.start, Math.max(0, elapsedMs))
    intervals.push({
      key: current.key,
      label: current.label,
      start: current.start,
      end,
      duration: Math.max(0, end - current.start)
    })
  })
  return { intervals, remaining }
}

export function buildTimerMarkIntervals(
  marksInput: TimerMark[] | undefined,
  elapsedMs: number
): TimerMarkInterval[] {
  const marks = Array.isArray(marksInput)
    ? [...marksInput].sort((a, b) => Number(a.time || 0) - Number(b.time || 0))
    : []

  return pairTimerMarkIntervals(marks, elapsedMs).intervals
}

export function getOpenTimerMarkIntervals(marksInput: TimerMark[] | undefined) {
  const marks = Array.isArray(marksInput)
    ? [...marksInput].sort((a, b) => Number(a.time || 0) - Number(b.time || 0))
    : []
  return pairTimerMarkIntervals(marks, 0).remaining.map(({ tagId, type }) => ({ tagId, type }))
}

export function buildTaskDurationSummary(
  marksInput: TimerMark[] | undefined,
  elapsedMs: number
): Array<{ name: string; durationMs: number }> {
  const elapsed = Math.max(0, Number(elapsedMs || 0))
  const intervals = buildTimerMarkIntervals(marksInput, elapsed)
  const events = new Map<number, { starts: number[]; ends: number[] }>()
  const ensureEvents = (time: number) => {
    const current = events.get(time)
    if (current) return current
    const created = { starts: [] as number[], ends: [] as number[] }
    events.set(time, created)
    return created
  }
  ensureEvents(0)
  ensureEvents(elapsed)
  intervals.forEach((interval, index) => {
    if (interval.end <= interval.start) return
    ensureEvents(interval.start).starts.push(index)
    ensureEvents(interval.end).ends.push(index)
  })

  const sortedPoints = [...events.keys()].sort((a, b) => a - b)
  const durations = new Map<string, number>()
  const startedAtWeight = new Map<number, number>()
  let activeCount = 0
  let cumulativeWeight = 0
  let previousTime = sortedPoints[0] || 0

  for (const time of sortedPoints) {
    const duration = Math.max(0, time - previousTime)
    if (activeCount > 0) cumulativeWeight += duration / activeCount
    else if (duration > 0) durations.set('工作', (durations.get('工作') || 0) + duration)

    const pointEvents = events.get(time)
    for (const intervalIndex of pointEvents?.ends || []) {
      const interval = intervals[intervalIndex]
      const contribution = Math.max(0, cumulativeWeight - (startedAtWeight.get(intervalIndex) || 0))
      durations.set(interval.label, (durations.get(interval.label) || 0) + contribution)
      startedAtWeight.delete(intervalIndex)
      activeCount -= 1
    }
    for (const intervalIndex of pointEvents?.starts || []) {
      startedAtWeight.set(intervalIndex, cumulativeWeight)
      activeCount += 1
    }
    previousTime = time
  }

  return [...durations.entries()]
    .map(([name, durationMs]) => ({ name, durationMs: Math.round(durationMs) }))
    .filter((item) => item.durationMs > 0)
    .sort((a, b) => b.durationMs - a.durationMs)
}

function dedupeTimelineNodes(nodes: TimelineNode[]) {
  const seen = new Set<string>()
  return nodes
    .filter((node) => node.label)
    .sort((a, b) => a.time - b.time)
    .filter((node) => {
      const key = `${node.label}_${node.time}_${node.isStart ? 'start' : 'end'}_${node.note || ''}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
}
