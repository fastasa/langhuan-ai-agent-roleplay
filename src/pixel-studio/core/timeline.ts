import { cloneDocument, MAX_FRAME_COUNT, MAX_TIMELINE_FPS, MAX_TIMELINE_FRAMES, MIN_TIMELINE_FPS } from './model'
import { createLayer } from './layers'
import type { PixelDocument, PixelFrame } from './types'

function assertTimeline(doc: PixelDocument) {
  if (!doc.timeline) throw new Error('当前文档尚未创建时间轴')
  return doc.timeline
}

function nextFrameId(doc: PixelDocument): string {
  let index = doc.frames.length + 1
  const ids = new Set(doc.frames.map((frame) => frame.id))
  while (ids.has(`f${index}`)) index++
  return `f${index}`
}

function claimExposureSlot(doc: PixelDocument, preferredIndex: number): boolean {
  const preferred = doc.frames[preferredIndex]
  if (preferred?.exposureFrames > 1) {
    preferred.exposureFrames--
    return true
  }
  let donorIndex = -1
  let donorExposure = 1
  doc.frames.forEach((frame, index) => {
    if (frame.exposureFrames > donorExposure) {
      donorExposure = frame.exposureFrames
      donorIndex = index
    }
  })
  if (donorIndex < 0) return false
  doc.frames[donorIndex].exposureFrames--
  return true
}

export function createTimeline(doc: PixelDocument, fps: number, totalFrames: number): PixelDocument {
  if (doc.timeline) throw new Error('当前文档已经存在时间轴')
  if (!Number.isInteger(fps) || fps < MIN_TIMELINE_FPS || fps > MAX_TIMELINE_FPS) throw new Error(`帧速率必须为 ${MIN_TIMELINE_FPS}~${MAX_TIMELINE_FPS} 的整数`)
  if (!Number.isInteger(totalFrames) || totalFrames < 1 || totalFrames > MAX_TIMELINE_FRAMES) throw new Error(`总帧数必须为 1~${MAX_TIMELINE_FRAMES} 的整数`)
  const next = cloneDocument(doc)
  next.frames = [next.frames[0]]
  next.frames[0].exposureFrames = totalFrames
  next.timeline = { fps, rangeStartFrame: 1, rangeEndFrame: totalFrames }
  return next
}

export function timelineFrameStart(doc: PixelDocument, index: number): number {
  const timeline = assertTimeline(doc)
  if (index < 0 || index >= doc.frames.length) throw new Error(`画帧越界: ${index}`)
  return timeline.rangeStartFrame + doc.frames.slice(0, index).reduce((sum, frame) => sum + frame.exposureFrames, 0)
}

export function frameIndexAtTimelineFrame(doc: PixelDocument, timelineFrame: number): number {
  const timeline = assertTimeline(doc)
  const clamped = Math.max(timeline.rangeStartFrame, Math.min(timeline.rangeEndFrame, Math.round(timelineFrame)))
  let cursor = timeline.rangeStartFrame
  for (let index = 0; index < doc.frames.length; index++) {
    cursor += doc.frames[index].exposureFrames
    if (clamped < cursor) return index
  }
  return doc.frames.length - 1
}

export function duplicateTimelineFrame(doc: PixelDocument, index: number): PixelDocument {
  assertTimeline(doc)
  if (doc.frames.length >= MAX_FRAME_COUNT) throw new Error(`画帧数量不能超过 ${MAX_FRAME_COUNT}`)
  const next = cloneDocument(doc)
  if (!next.frames[index]) throw new Error(`画帧越界: ${index}`)
  if (!claimExposureSlot(next, index)) throw new Error('播放范围没有可分配的空余时间格')
  const copy = JSON.parse(JSON.stringify(next.frames[index])) as PixelFrame
  copy.id = nextFrameId(next)
  copy.exposureFrames = 1
  next.frames.splice(index + 1, 0, copy)
  return next
}

export function addBlankTimelineFrame(doc: PixelDocument, index: number): PixelDocument {
  assertTimeline(doc)
  if (doc.frames.length >= MAX_FRAME_COUNT) throw new Error(`画帧数量不能超过 ${MAX_FRAME_COUNT}`)
  const next = cloneDocument(doc)
  if (!next.frames[index]) throw new Error(`画帧越界: ${index}`)
  if (!claimExposureSlot(next, index)) throw new Error('播放范围没有可分配的空余时间格')
  const frameId = nextFrameId(next)
  const frame: PixelFrame = {
    id: frameId,
    exposureFrames: 1,
    layers: [createLayer({ id: `l-${frameId}-1`, name: '图层 1', width: next.width, height: next.height })]
  }
  next.frames.splice(index + 1, 0, frame)
  return next
}

export function deleteTimelineFrame(doc: PixelDocument, index: number): PixelDocument {
  assertTimeline(doc)
  if (doc.frames.length <= 1) throw new Error('时间轴至少保留一个画帧')
  const next = cloneDocument(doc)
  const removed = next.frames[index]
  if (!removed) throw new Error(`画帧越界: ${index}`)
  next.frames.splice(index, 1)
  const receiver = next.frames[Math.max(0, index - 1)]
  receiver.exposureFrames += removed.exposureFrames
  return next
}

export function reorderTimelineFrame(doc: PixelDocument, sourceIndex: number, targetIndex: number): PixelDocument {
  assertTimeline(doc)
  if (!doc.frames[sourceIndex] || !doc.frames[targetIndex]) throw new Error('画帧排序索引越界')
  if (sourceIndex === targetIndex) return doc
  const next = cloneDocument(doc)
  const [frame] = next.frames.splice(sourceIndex, 1)
  next.frames.splice(targetIndex, 0, frame)
  return next
}

export function resizeTimelineFrameExposure(doc: PixelDocument, index: number, exposureFrames: number): PixelDocument {
  const timeline = assertTimeline(doc)
  if (!Number.isInteger(exposureFrames) || exposureFrames < 1) throw new Error('曝光长度必须为正整数')
  const current = doc.frames[index]
  if (!current) throw new Error(`画帧越界: ${index}`)
  const next = cloneDocument(doc)
  const delta = exposureFrames - current.exposureFrames
  if (index < next.frames.length - 1) {
    const neighbor = next.frames[index + 1]
    if (neighbor.exposureFrames - delta < 1) throw new Error('相邻画帧至少保留 1 格曝光')
    next.frames[index].exposureFrames = exposureFrames
    neighbor.exposureFrames -= delta
  } else {
    const nextLength = timeline.rangeEndFrame - timeline.rangeStartFrame + 1 + delta
    if (nextLength < next.frames.length || nextLength > MAX_TIMELINE_FRAMES) throw new Error('调整后的播放范围不合法')
    next.frames[index].exposureFrames = exposureFrames
    next.timeline!.rangeEndFrame += delta
  }
  return next
}

export function setTimelineRangeBoundary(doc: PixelDocument, edge: 'start' | 'end', frameNumber: number): PixelDocument {
  const timeline = assertTimeline(doc)
  if (!Number.isInteger(frameNumber) || frameNumber < 1) throw new Error('边界必须落在正整数帧')
  const next = cloneDocument(doc)
  if (edge === 'start') {
    const delta = frameNumber - timeline.rangeStartFrame
    if (next.frames[0].exposureFrames - delta < 1) throw new Error('起始边界不能越过第一画帧')
    next.frames[0].exposureFrames -= delta
    next.timeline!.rangeStartFrame = frameNumber
  } else {
    const delta = frameNumber - timeline.rangeEndFrame
    if (next.frames[next.frames.length - 1].exposureFrames + delta < 1) throw new Error('结束边界不能越过最后画帧')
    const nextLength = frameNumber - timeline.rangeStartFrame + 1
    if (nextLength > MAX_TIMELINE_FRAMES) throw new Error(`时间轴总帧数不能超过 ${MAX_TIMELINE_FRAMES}`)
    next.frames[next.frames.length - 1].exposureFrames += delta
    next.timeline!.rangeEndFrame = frameNumber
  }
  return next
}
