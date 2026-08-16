import { describe, expect, it } from 'vitest'
import {
  addBlankTimelineFrame,
  createDocument,
  createTimeline,
  deleteTimelineFrame,
  duplicateTimelineFrame,
  frameIndexAtTimelineFrame,
  reorderTimelineFrame,
  resizeTimelineFrameExposure,
  setTimelineRangeBoundary,
  timelineFrameStart,
  validateDocument
} from '@/pixel-studio/core'

describe('pixel-studio/core/timeline', () => {
  it('把静态文档创建为整数帧时间轴，第一画帧覆盖完整范围', () => {
    const source = createDocument({ name: '眨眼', width: 2, height: 2 })
    const doc = createTimeline(source, 10, 20)
    expect(doc.timeline).toEqual({ fps: 10, rangeStartFrame: 1, rangeEndFrame: 20 })
    expect(doc.frames[0].exposureFrames).toBe(20)
    expect(validateDocument(doc)).toEqual([])
    expect(source.timeline).toBeNull()
  })

  it('复制画帧做深拷贝并从当前曝光中分配一格', () => {
    const source = createTimeline(createDocument({ name: '眨眼', width: 1, height: 1 }), 10, 4)
    source.frames[0].layers[0].palette.a1 = { hex: '#ff0000' }
    source.frames[0].layers[0].grid[0] = 'a1'
    const doc = duplicateTimelineFrame(source, 0)
    expect(doc.frames.map((frame) => frame.exposureFrames)).toEqual([3, 1])
    doc.frames[1].layers[0].palette.a1.hex = '#00ff00'
    expect(doc.frames[0].layers[0].palette.a1.hex).toBe('#ff0000')
    expect(frameIndexAtTimelineFrame(doc, 4)).toBe(1)
    expect(timelineFrameStart(doc, 1)).toBe(4)
  })

  it('新增空白帧、删除与排序始终保持曝光总数等于播放范围', () => {
    let doc = createTimeline(createDocument({ name: '动作', width: 1, height: 1 }), 12, 6)
    doc = addBlankTimelineFrame(doc, 0)
    expect(doc.frames[1].layers[0].grid).toEqual(['..'])
    doc = duplicateTimelineFrame(doc, 1)
    const ids = doc.frames.map((frame) => frame.id)
    doc = reorderTimelineFrame(doc, 2, 0)
    expect(doc.frames[0].id).toBe(ids[2])
    doc = deleteTimelineFrame(doc, 1)
    expect(doc.frames.reduce((sum, frame) => sum + frame.exposureFrames, 0)).toBe(6)
    expect(validateDocument(doc)).toEqual([])
  })

  it('曝光边界与蓝色播放边界只按整数帧调整', () => {
    let doc = createTimeline(createDocument({ name: '节奏', width: 1, height: 1 }), 10, 8)
    doc = duplicateTimelineFrame(doc, 0)
    doc = resizeTimelineFrameExposure(doc, 0, 4)
    expect(doc.frames.map((frame) => frame.exposureFrames)).toEqual([4, 4])
    doc = setTimelineRangeBoundary(doc, 'start', 2)
    expect(doc.timeline).toEqual({ fps: 10, rangeStartFrame: 2, rangeEndFrame: 8 })
    expect(doc.frames.map((frame) => frame.exposureFrames)).toEqual([3, 4])
    doc = setTimelineRangeBoundary(doc, 'end', 10)
    expect(doc.frames.map((frame) => frame.exposureFrames)).toEqual([3, 6])
    expect(validateDocument(doc)).toEqual([])
  })

  it('总帧数等于画帧数时拒绝继续新增，避免零曝光画帧', () => {
    let doc = createTimeline(createDocument({ name: '满格', width: 1, height: 1 }), 10, 2)
    doc = duplicateTimelineFrame(doc, 0)
    expect(() => duplicateTimelineFrame(doc, 0)).toThrow(/空余时间格/)
    expect(() => setTimelineRangeBoundary(doc, 'end', 1)).toThrow(/最后画帧/)
  })
})
