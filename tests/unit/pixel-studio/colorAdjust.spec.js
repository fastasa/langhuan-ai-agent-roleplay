import { describe, expect, it } from 'vitest'
import { adjustHexHsv, adjustLayerColors, averageHexHsv, hexToHsv } from '../../../src/pixel-studio/core/colorAdjust'

function makeDoc() {
  return {
    version: 3,
    name: '调色测试',
    width: 3,
    height: 2,
    frames: [{
      id: 'f1',
      durationMs: 200,
      layers: [{ id: 'l1', name: '图层 1', visible: true, palette: { a1: { hex: '#ff0000', name: '红' }, a2: { hex: '#0000ff' } }, grid: ['a1a1a2', 'a1....'] }]
    }],
    playback: { loop: true }
  }
}

describe('HSV 区域调色', () => {
  it('循环平均色相：359° 与 1° 平均落在 0° 附近而不是 180°', () => {
    const hue = hexToHsv(averageHexHsv(['#ff0004', '#ff0400'])).h
    expect(Math.min(hue, 360 - hue)).toBeLessThan(2)
  })
  it('色相按角度偏移，饱和度和明度按百分点钳位', () => {
    expect(adjustHexHsv('#ff0000', { hue: 120, saturation: 0, brightness: 0 })).toBe('#00ff00')
    expect(adjustHexHsv('#808080', { hue: 0, saturation: 100, brightness: 100 })).toBe('#ff0000')
  })

  it('有选区时只替换当前层选区格，不修改源文档或选区外同短码像素', () => {
    const source = makeDoc()
    const result = adjustLayerColors(source, 'l1', { x0: 0, y0: 0, x1: 0, y1: 0 }, { hue: 120, saturation: 0, brightness: 0 })
    const grid = result.doc.frames[0].layers[0].grid
    const adjustedCode = grid[0].slice(0, 2)

    expect(result.changedCellCount).toBe(1)
    expect(result.doc.frames[0].layers[0].palette[adjustedCode].hex).toBe('#00ff00')
    expect(grid[0].slice(2, 4)).toBe('a1')
    expect(source.frames[0].layers[0].grid[0]).toBe('a1a1a2')
  })

  it('不规则掩码选区只调整 cells 中列出的格子', () => {
    const source = makeDoc()
    const result = adjustLayerColors(source, 'l1', { cells: new Set([1, 3]) }, { hue: 120, saturation: 0, brightness: 0 })
    expect(result.changedCellCount).toBe(2)
    expect(result.doc.frames[0].layers[0].grid[0].slice(0, 2)).toBe('a1')
    expect(result.doc.frames[0].layers[0].grid[0].slice(2, 4)).not.toBe('a1')
    expect(result.doc.frames[0].layers[0].grid[1].slice(0, 2)).not.toBe('a1')
  })

  it('无选区时处理当前图层全部非透明像素，零调整不制造新短码', () => {
    const source = makeDoc()
    const changed = adjustLayerColors(source, 'l1', null, { hue: 0, saturation: -100, brightness: 0 })
    expect(changed.changedCellCount).toBe(4)

    const unchanged = adjustLayerColors(source, 'l1', null, { hue: 0, saturation: 0, brightness: 0 })
    expect(unchanged.changedCellCount).toBe(0)
    expect(unchanged.doc.frames[0].layers[0].palette).toEqual(source.frames[0].layers[0].palette)
  })
})
