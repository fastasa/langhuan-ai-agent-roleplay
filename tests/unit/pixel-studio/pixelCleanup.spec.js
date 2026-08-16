import { describe, expect, it } from 'vitest'
import { PIXEL_CLEANUP_PRESETS, cleanupLayerPixels } from '../../../src/pixel-studio/core/pixelCleanup'

function makeDoc({ width, height, palette, grid, secondLayer = false }) {
  return {
    version: 3,
    name: '净化测试',
    width,
    height,
    frames: [{
      id: 'f1',
      durationMs: 200,
      layers: [
        { id: 'l1', name: '当前层', visible: true, palette, grid },
        ...(secondLayer ? [{ id: 'l2', name: '其他层', visible: true, palette: { b1: { hex: '#224466' } }, grid: Array.from({ length: height }, () => 'b1'.repeat(width)) }] : [])
      ]
    }],
    playback: { loop: true }
  }
}

function options(overrides = {}) {
  return {
    ...PIXEL_CLEANUP_PRESETS.portrait,
    strength: 100,
    lineExpansion: 0,
    gapClosing: 0,
    haloCleanup: 0,
    edgeRegularity: 0,
    ...overrides
  }
}

describe('像素去除杂色内核', () => {
  it('把相邻近似色归入主色，同时不修改源文档', () => {
    const source = makeDoc({
      width: 3,
      height: 2,
      palette: { a1: { hex: '#ef9f50' }, a2: { hex: '#f0a052' } },
      grid: ['a1a2a1', 'a1a1a1']
    })
    const result = cleanupLayerPixels(source, 'l1', null, options({ colorTolerance: 100, minRegionArea: 0 }))

    expect(result.doc.frames[0].layers[0].grid).toEqual(['a1a1a1', 'a1a1a1'])
    expect(result.report.usedColorCountBefore).toBe(2)
    expect(result.report.usedColorCountAfter).toBe(1)
    expect(source.frames[0].layers[0].grid[0]).toBe('a1a2a1')
  })

  it('保留面积稳定且明度分层明确的体积阶调', () => {
    const source = makeDoc({
      width: 4,
      height: 2,
      palette: { a1: { hex: '#ef9f50' }, a2: { hex: '#d98236' } },
      grid: ['a1a1a2a2', 'a1a1a2a2']
    })
    const result = cleanupLayerPixels(source, 'l1', null, options({ colorTolerance: 100, minRegionArea: 1, toneLevels: 4 }))
    expect(result.report.usedColorCountAfter).toBe(2)
    expect(result.doc.frames[0].layers[0].grid).toEqual(source.frames[0].layers[0].grid)
  })

  it('清除被同一主体色包围的单格杂点', () => {
    const source = makeDoc({
      width: 3,
      height: 3,
      palette: { a1: { hex: '#e7b27c' }, a2: { hex: '#39a85a' } },
      grid: ['a1a1a1', 'a1a2a1', 'a1a1a1']
    })
    const result = cleanupLayerPixels(source, 'l1', null, options({ colorTolerance: 0, minRegionArea: 1, detailProtection: 0 }))
    expect(result.doc.frames[0].layers[0].grid[1]).toBe('a1a1a1')
    expect(result.report.removedSpeckleCellCount).toBe(1)
  })

  it('识别并连接亮色块内部的一格暗线断点', () => {
    const source = makeDoc({
      width: 5,
      height: 3,
      palette: { a1: { hex: '#ded8cf' }, a2: { hex: '#29231f' }, a3: { hex: '#aaa39b' } },
      grid: ['a1a1a2a1a1', 'a1a1a3a1a1', 'a1a1a2a1a1']
    })
    const result = cleanupLayerPixels(source, 'l1', null, options({ colorTolerance: 0, minRegionArea: 0, lineSensitivity: 100, gapClosing: 1 }))
    expect(result.doc.frames[0].layers[0].grid[1].slice(4, 6)).toBe('a2')
    expect(result.report.processedLineCellCount).toBeGreaterThan(0)
  })

  it('把暗线旁的过渡色归入线条或主体色，不留下脏色带', () => {
    const source = makeDoc({
      width: 5,
      height: 3,
      palette: { a1: { hex: '#ded8cf' }, a2: { hex: '#29231f' }, a3: { hex: '#817971' } },
      grid: ['a1a3a2a3a1', 'a1a3a2a3a1', 'a1a3a2a3a1']
    })
    const result = cleanupLayerPixels(source, 'l1', null, options({ colorTolerance: 0, minRegionArea: 0, lineSensitivity: 100, lineExpansion: 1, haloCleanup: 100 }))
    expect(result.doc.frames[0].layers[0].grid.join('')).not.toContain('a3')
    expect(result.report.processedLineCellCount).toBeGreaterThan(0)
  })

  it('严格遵守不规则选区和当前图层边界', () => {
    const source = makeDoc({
      width: 3,
      height: 2,
      palette: { a1: { hex: '#ef9f50' }, a2: { hex: '#f0a052' }, b1: { hex: '#224466' } },
      grid: ['a2a2a1', 'a1a1a1'],
      secondLayer: true
    })
    const result = cleanupLayerPixels(source, 'l1', { cells: new Set([0]) }, options({ colorTolerance: 100, minRegionArea: 0 }))
    expect(result.doc.frames[0].layers[0].grid[0]).toBe('a1a2a1')
    expect(result.doc.frames[0].layers[1].grid).toEqual(source.frames[0].layers[1].grid)
  })

  it('同一输入与参数始终得到相同结果，强度 0 严格无操作', () => {
    const source = makeDoc({
      width: 3,
      height: 2,
      palette: { a1: { hex: '#ef9f50' }, a2: { hex: '#f0a052' } },
      grid: ['a1a2a1', 'a1a1a1']
    })
    const first = cleanupLayerPixels(source, 'l1', null, options({ colorTolerance: 100 }))
    const second = cleanupLayerPixels(source, 'l1', null, options({ colorTolerance: 100 }))
    expect(first).toEqual(second)

    const noOp = cleanupLayerPixels(source, 'l1', null, options({ strength: 0 }))
    expect(noOp.doc).toEqual(source)
    expect(noOp.report.changedCellCount).toBe(0)
  })
})
