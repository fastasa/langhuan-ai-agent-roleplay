import { describe, expect, it } from 'vitest'
import { collectFloodFillCells, combineSelection, copySelectionPixels, createFullSelection, createLassoSelection, createRectSelection, deleteSelectionPixels, moveLayerPixels, pasteClipboardPixels, transformSelectionPixels } from '../../../src/pixel-studio/ui/selection'

describe('pixel-studio 隐形选区', () => {
  it('油漆桶洪泛只收集四向连通且短码相同的闭合区域', () => {
    const grid = ['a1a1a2', 'a1a2a2', 'a3a3a2']
    expect(collectFloodFillCells(grid, 3, 3, 0, 0)).toEqual([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }])
    expect(collectFloodFillCells(grid, 3, 3, -1, 0)).toEqual([])
  })
  it('矩形选区裁到画布内，并支持新增与减去', () => {
    const base = createRectSelection(4, 4, { x0: 0, y0: 0, x1: 1, y1: 1 })
    const added = createRectSelection(4, 4, { x0: 1, y0: 1, x1: 2, y1: 2 })
    const union = combineSelection(base, added, 'add')
    expect([...union.cells].sort((a, b) => a - b)).toEqual([0, 1, 4, 5, 6, 9, 10])
    const subtracted = combineSelection(union, createRectSelection(4, 4, { x0: 1, y0: 0, x1: 1, y1: 3 }), 'subtract')
    expect([...subtracted.cells].sort((a, b) => a - b)).toEqual([0, 4, 6, 10])
  })

  it('套索按闭合路径选中内部格子', () => {
    const mask = createLassoSelection(5, 5, [{ x: 1, y: 1 }, { x: 3, y: 1 }, { x: 3, y: 3 }, { x: 1, y: 3 }])
    expect(mask.cells.has(2 * 5 + 2)).toBe(true)
    expect(mask.cells.has(0)).toBe(false)
  })

  it('移动选区使用源快照，源位置清空、目标位置写入并同步平移选区', () => {
    const grid = ['a1a2....', '........']
    const selection = { width: 4, height: 2, cells: new Set([0, 1]) }
    const result = moveLayerPixels(grid, 4, 2, selection, 1, 0)
    expect(result.grid).toEqual(['..a1a2..', '........'])
    expect([...result.selection.cells]).toEqual([1, 2])
  })

  it('无选区时移动当前图层全部像素，越界部分裁掉', () => {
    const result = moveLayerPixels(['a1......'], 4, 1, null, -1, 0)
    expect(result.grid).toEqual(['........'])
    expect(result.selection).toBeNull()
  })

  it('全选覆盖整张画板；复制只记录选区内非透明像素，剪切只清当前选区', () => {
    const full = createFullSelection(3, 2)
    expect([...full.cells]).toHaveLength(6)
    const selected = createRectSelection(3, 2, { x0: 0, y0: 0, x1: 1, y1: 0 })
    const clipboard = copySelectionPixels(['a1..a2', '......'], selected)
    expect(clipboard).toEqual({ originX: 0, originY: 0, width: 2, height: 1, cells: [{ x: 0, y: 0, code: 'a1' }] })
    expect(deleteSelectionPixels(['a1..a2', '......'], selected)).toEqual({ grid: ['....a2', '......'], changed: true })
    expect(deleteSelectionPixels(['a1..a2', '......'], null).changed).toBe(false)
  })

  it('粘贴回原坐标并把实际粘贴像素变成正式选区', () => {
    const result = pasteClipboardPixels(['......'], 3, 1, { originX: 1, originY: 0, width: 2, height: 1, cells: [{ x: 0, y: 0, code: 'a1' }, { x: 1, y: 0, code: 'a2' }] })
    expect(result.grid).toEqual(['..a1a2'])
    expect([...result.selection.cells]).toEqual([1, 2])
  })

  it('自由变换按最近邻拉伸选中像素，并清空源区域', () => {
    const selection = createRectSelection(5, 1, { x0: 0, y0: 0, x1: 1, y1: 0 })
    const result = transformSelectionPixels(['a1a2......'], 5, 1, selection, { x: 1, y: 0, width: 4, height: 1 })
    expect(result.grid).toEqual(['..a1a1a2a2'])
    expect([...result.selection.cells]).toEqual([1, 2, 3, 4])
  })
})
