import { describe, expect, it } from 'vitest'
import {
  buildTaskDurationSummary,
  buildTimerMarkIntervals,
  getOpenTimerMarkIntervals
} from '../../../src/utils/taskTimeline.ts'

function legacyIntervals(marksInput, elapsedMs) {
  const marks = [...(marksInput || [])].sort((a, b) => Number(a.time || 0) - Number(b.time || 0))
  const open = []
  const intervals = []
  for (const mark of marks) {
    const tagId = String(mark.tagId || '')
    const type = String(mark.type || '工作')
    const time = Math.max(0, Number(mark.time || 0))
    if (mark.isStart !== false) {
      open.push({ key: tagId || type || '工作', label: type, start: time, tagId, type })
      continue
    }
    let index = -1
    if (tagId) {
      for (let cursor = open.length - 1; cursor >= 0; cursor -= 1) {
        if (open[cursor].tagId === tagId) { index = cursor; break }
      }
    }
    if (index < 0) {
      for (let cursor = open.length - 1; cursor >= 0; cursor -= 1) {
        if (open[cursor].type === type) { index = cursor; break }
      }
    }
    if (index < 0) continue
    const current = open[index]
    const end = Math.max(current.start, time)
    intervals.push({ key: current.key, label: current.label, start: current.start, end, duration: end - current.start })
    open.splice(index, 1)
  }
  open.forEach((current) => {
    const end = Math.max(current.start, Math.max(0, elapsedMs))
    intervals.push({ key: current.key, label: current.label, start: current.start, end, duration: end - current.start })
  })
  return { intervals, open: open.map(({ tagId, type }) => ({ tagId, type })) }
}

function legacySummary(marks, elapsedMs) {
  const elapsed = Math.max(0, Number(elapsedMs || 0))
  const intervals = legacyIntervals(marks, elapsed).intervals
  const points = new Set([0, elapsed])
  intervals.forEach(({ start, end }) => { points.add(start); points.add(end) })
  const sorted = [...points].sort((a, b) => a - b)
  const durations = new Map()
  for (let index = 0; index < sorted.length - 1; index += 1) {
    const start = sorted[index]
    const end = sorted[index + 1]
    const duration = Math.max(0, end - start)
    if (!duration) continue
    const active = intervals.filter((interval) => interval.start <= start && interval.end >= end)
    if (!active.length) durations.set('工作', (durations.get('工作') || 0) + duration)
    else active.forEach((interval) => durations.set(interval.label, (durations.get(interval.label) || 0) + duration / active.length))
  }
  return [...durations.entries()]
    .map(([name, durationMs]) => ({ name, durationMs: Math.round(durationMs) }))
    .filter((item) => item.durationMs > 0)
    .sort((a, b) => b.durationMs - a.durationMs)
}

describe('taskTimeline interval index', () => {
  it('保持乱序、同刻度、未闭合、跨段重叠与按标签回退配对语义', () => {
    const marks = [
      { id: 'b_end', time: 9000, type: '沟通', tagId: 'b', isStart: false },
      { id: 'a_start', time: 1000, type: '编写', tagId: 'a', isStart: true },
      { id: 'b_start', time: 3000, type: '沟通', tagId: 'b', isStart: true },
      { id: 'same_start', time: 9000, type: '复盘', tagId: 'same', isStart: true },
      { id: 'same_end', time: 9000, type: '复盘', tagId: 'same', isStart: false },
      { id: 'fallback_start', time: 11000, type: '阅读', tagId: '', isStart: true },
      { id: 'fallback_end', time: 14000, type: '阅读', tagId: 'missing', isStart: false },
      { id: 'open', time: 15000, type: '编写', tagId: 'open', isStart: true }
    ]

    expect(buildTimerMarkIntervals(marks, 20000)).toEqual(legacyIntervals(marks, 20000).intervals)
    expect(getOpenTimerMarkIntervals(marks)).toEqual(legacyIntervals(marks, 0).open)
    expect(buildTaskDurationSummary(marks, 20000)).toEqual(legacySummary(marks, 20000))
  })

  it('4000 标记与大量重叠资源仍保持旧算法结果', () => {
    const marks = []
    for (let index = 0; index < 2000; index += 1) {
      const tagId = `tag_${index % 37}`
      const type = `类型_${index % 11}`
      marks.push({ id: `start_${index}`, time: index * 5, tagId, type, isStart: true })
      marks.push({ id: `end_${index}`, time: index * 5 + 40 + (index % 7), tagId, type, isStart: false })
    }
    const elapsed = 12000

    expect(buildTimerMarkIntervals(marks, elapsed)).toEqual(legacyIntervals(marks, elapsed).intervals)
    expect(buildTaskDurationSummary(marks, elapsed)).toEqual(legacySummary(marks, elapsed))
  })
})
