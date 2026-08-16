import { describe, expect, it } from 'vitest'
import { createLayer, getCompositePixel } from '@/pixel-studio/core/layers'

describe('pixel-studio/core/layers', () => {
  it('按下到上合成，顶层透明格会露出底层颜色', () => {
    const frame = {
      id: 'f1', durationMs: 200, layers: [
        { id: 'bottom', name: '底层', visible: true, palette: { a1: { hex: '#ff0000' } }, grid: ['a1a1'] },
        { id: 'top', name: '顶层', visible: true, palette: { b1: { hex: '#00ff00' } }, grid: ['..b1'] }
      ]
    }
    expect(getCompositePixel(frame, 2, 0, 0)).toEqual({ code: 'a1', hex: '#ff0000', layerId: 'bottom' })
    expect(getCompositePixel(frame, 2, 1, 0)).toEqual({ code: 'b1', hex: '#00ff00', layerId: 'top' })
  })

  it('隐藏层不参与普通合成，对照模式可只看指定层且不改 visible', () => {
    const frame = {
      id: 'f1', durationMs: 200, layers: [
        { id: 'bottom', name: '底层', visible: true, palette: { a1: { hex: '#ff0000' } }, grid: ['a1'] },
        { id: 'top', name: '顶层', visible: false, palette: { b1: { hex: '#00ff00' } }, grid: ['b1'] }
      ]
    }
    expect(getCompositePixel(frame, 1, 0, 0)).toEqual({ code: 'a1', hex: '#ff0000', layerId: 'bottom' })
    expect(getCompositePixel(frame, 1, 0, 0, 'top')).toEqual({ code: 'b1', hex: '#00ff00', layerId: 'top' })
    expect(frame.layers[1].visible).toBe(false)
  })

  it('新图层是指定尺寸的全透明网格', () => {
    const layer = createLayer({ id: 'l2', name: '图层 2', width: 2, height: 2 })
    expect(layer.grid).toEqual(['....', '....'])
    expect(layer.palette).toEqual({})
  })

  it('不同图层可复用同一短码表达不同颜色，合成读取顶层自己的色卡', () => {
    const frame = {
      id: 'f1', durationMs: 200, layers: [
        { id: 'bottom', name: '底层', visible: true, palette: { a1: { hex: '#ff0000' } }, grid: ['a1'] },
        { id: 'top', name: '顶层', visible: true, palette: { a1: { hex: '#00ff00' } }, grid: ['a1'] }
      ]
    }
    expect(getCompositePixel(frame, 1, 0, 0)).toEqual({ code: 'a1', hex: '#00ff00', layerId: 'top' })
  })
})
