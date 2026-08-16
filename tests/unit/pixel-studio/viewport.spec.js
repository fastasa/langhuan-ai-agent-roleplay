import { describe, expect, it } from 'vitest'
import {
  MAX_ZOOM,
  MIN_ZOOM,
  ZOOM_STEP,
  clampZoom,
  docRectToScreen,
  fitToViewport,
  formatZoomPercent,
  panBy,
  screenToCell,
  zoomAtPointer,
  zoomToward
} from '../../../src/pixel-studio/ui/viewport'

describe('pixel-studio viewport', () => {
  it('clampZoom 钳制到 0.25~32，非法值兜底为 MIN_ZOOM', () => {
    expect(clampZoom(0.1)).toBe(MIN_ZOOM)
    expect(clampZoom(100)).toBe(MAX_ZOOM)
    expect(clampZoom(1)).toBe(1)
    expect(clampZoom(0)).toBe(MIN_ZOOM)
    expect(clampZoom(NaN)).toBe(MIN_ZOOM)
  })

  it('screenToCell 按 zoom/pan 逆变换取整', () => {
    // zoom=16，pan=(10,10)：屏幕点(42,58) -> 局部(32,48) -> 格(2,3)
    expect(screenToCell({ screenX: 42, screenY: 58, zoom: 16, panX: 10, panY: 10 })).toEqual({ x: 2, y: 3 })
    // 负偏移也应正确取整（不是简单截断）
    expect(screenToCell({ screenX: 5, screenY: 5, zoom: 10, panX: 10, panY: 10 })).toEqual({ x: -1, y: -1 })
  })

  it('zoomToward 保持锚点处的画布内容点不变', () => {
    const state = { zoom: 4, panX: 0, panY: 0 }
    // 锚点(40,40) 在 zoom=4 时对应画布坐标 (10,10)
    const next = zoomToward(state, 8, 40, 40)
    expect(next.zoom).toBe(8)
    // 缩放后同一锚点仍应映射回画布坐标 (10,10)：(40 - panX)/8 === 10
    expect((40 - next.panX) / next.zoom).toBeCloseTo(10)
    expect((40 - next.panY) / next.zoom).toBeCloseTo(10)
  })

  it('zoomToward 越界目标被钳制', () => {
    const next = zoomToward({ zoom: 1, panX: 0, panY: 0 }, 999, 0, 0)
    expect(next.zoom).toBe(MAX_ZOOM)
  })

  it('zoomAtPointer 向上滚动（deltaY<0）放大，向下滚动缩小，步进为 ZOOM_STEP', () => {
    const zoomIn = zoomAtPointer({ zoom: 1, panX: 0, panY: 0, pointerX: 0, pointerY: 0, deltaY: -100 })
    expect(zoomIn.zoom).toBeCloseTo(ZOOM_STEP)
    const zoomOut = zoomAtPointer({ zoom: 1, panX: 0, panY: 0, pointerX: 0, pointerY: 0, deltaY: 100 })
    expect(zoomOut.zoom).toBeCloseTo(1 / ZOOM_STEP)
  })

  it('fitToViewport 让位图完整可见并居中，缩放取宽高中更小的比例', () => {
    // 文档 64x32，视口 200x200，padding 默认 24：可用 152x152，取更小边约束 -> 152/64=2.375
    const result = fitToViewport({ docWidth: 64, docHeight: 32, viewportWidth: 200, viewportHeight: 200 })
    expect(result.zoom).toBeCloseTo(152 / 64)
    // 居中：panX = (200 - 64*zoom)/2
    expect(result.panX).toBeCloseTo((200 - 64 * result.zoom) / 2)
    expect(result.panY).toBeCloseTo((200 - 32 * result.zoom) / 2)
  })

  it('fitToViewport 极端小视口下缩放钳制不小于 MIN_ZOOM', () => {
    const result = fitToViewport({ docWidth: 512, docHeight: 512, viewportWidth: 10, viewportHeight: 10 })
    expect(result.zoom).toBeGreaterThanOrEqual(MIN_ZOOM)
  })

  it('panBy 仅平移不改变缩放', () => {
    const next = panBy({ zoom: 2, panX: 5, panY: 5 }, 10, -3)
    expect(next).toEqual({ zoom: 2, panX: 15, panY: 2 })
  })

  it('docRectToScreen 按 zoom/pan 正向换算，且与 screenToCell 互为逆运算', () => {
    const state = { zoom: 5, panX: 12, panY: -8 }
    const rect = docRectToScreen({ x: 3, y: 4, w: 2, h: 2 }, state)
    expect(rect).toEqual({ left: 12 + 3 * 5, top: -8 + 4 * 5, width: 10, height: 10 })
    // 逆运算回格坐标应等于原始 (x, y)（矩形左上角本身就对应格 (3,4) 的屏幕位置）
    expect(screenToCell({ screenX: rect.left, screenY: rect.top, ...state })).toEqual({ x: 3, y: 4 })
  })

  it('formatZoomPercent 四舍五入为整数百分比', () => {
    expect(formatZoomPercent(1)).toBe('100%')
    expect(formatZoomPercent(0.25)).toBe('25%')
    expect(formatZoomPercent(1.4142135)).toBe('141%')
  })
})
