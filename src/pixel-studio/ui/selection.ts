import type { CellPos, PixelCode, PixelLayer } from '../core'
import { TRANSPARENT_CODE } from '../core'
import type { PixelClipboard, PixelRect, SelectionCombineMode, SelectionMask, SelectionRect } from './uiTypes'

function indexOf(width: number, x: number, y: number): number {
  return y * width + x
}

function inBounds(width: number, height: number, x: number, y: number): boolean {
  return x >= 0 && x < width && y >= 0 && y < height
}

export function createRectSelection(width: number, height: number, rect: SelectionRect): SelectionMask {
  const cells = new Set<number>()
  const minX = Math.max(0, Math.min(rect.x0, rect.x1))
  const maxX = Math.min(width - 1, Math.max(rect.x0, rect.x1))
  const minY = Math.max(0, Math.min(rect.y0, rect.y1))
  const maxY = Math.min(height - 1, Math.max(rect.y0, rect.y1))
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) cells.add(indexOf(width, x, y))
  }
  return { width, height, cells }
}

export function createFullSelection(width: number, height: number): SelectionMask {
  return createRectSelection(width, height, { x0: 0, y0: 0, x1: width - 1, y1: height - 1 })
}

/** 反转整张画板内的选区；全选反转后没有选区。 */
export function invertSelection(selection: SelectionMask): SelectionMask | null {
  const cells = new Set<number>()
  const total = selection.width * selection.height
  for (let index = 0; index < total; index++) {
    if (!selection.cells.has(index)) cells.add(index)
  }
  return cells.size > 0 ? { width: selection.width, height: selection.height, cells } : null
}

/** 按 8 邻域逐像素扩展，保持像素选区的硬边，不引入抗锯齿或亚像素状态。 */
export function growSelection(selection: SelectionMask, amount: number): SelectionMask {
  let cells = new Set(selection.cells)
  const steps = Math.max(0, Math.floor(amount))
  for (let step = 0; step < steps; step++) {
    const next = new Set(cells)
    for (const index of cells) {
      const x = index % selection.width
      const y = Math.floor(index / selection.width)
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx
          const ny = y + dy
          if (inBounds(selection.width, selection.height, nx, ny)) next.add(indexOf(selection.width, nx, ny))
        }
      }
    }
    cells = next
  }
  return { width: selection.width, height: selection.height, cells }
}

/** 按 8 邻域逐像素收缩；触及画板边界也视为外部，保证轮廓向内退让。 */
export function shrinkSelection(selection: SelectionMask, amount: number): SelectionMask | null {
  let cells = new Set(selection.cells)
  const steps = Math.max(0, Math.floor(amount))
  for (let step = 0; step < steps && cells.size > 0; step++) {
    const next = new Set<number>()
    for (const index of cells) {
      const x = index % selection.width
      const y = Math.floor(index / selection.width)
      let surrounded = true
      for (let dy = -1; dy <= 1 && surrounded; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx
          const ny = y + dy
          if (!inBounds(selection.width, selection.height, nx, ny) || !cells.has(indexOf(selection.width, nx, ny))) {
            surrounded = false
            break
          }
        }
      }
      if (surrounded) next.add(index)
    }
    cells = next
  }
  return cells.size > 0 ? { width: selection.width, height: selection.height, cells } : null
}

export function getSelectionBounds(selection: SelectionMask | null): PixelRect | null {
  if (!selection || selection.cells.size === 0) return null
  let minX = selection.width
  let minY = selection.height
  let maxX = -1
  let maxY = -1
  for (const index of selection.cells) {
    const x = index % selection.width
    const y = Math.floor(index / selection.width)
    if (!inBounds(selection.width, selection.height, x, y)) continue
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x)
    maxY = Math.max(maxY, y)
  }
  return maxX >= minX && maxY >= minY
    ? { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 }
    : null
}

/** 套索按格中心是否位于多边形内选格；不足三点时退化为选中路径经过的格。 */
export function createLassoSelection(width: number, height: number, points: CellPos[]): SelectionMask {
  const cells = new Set<number>()
  if (points.length < 3) {
    for (const point of points) {
      if (inBounds(width, height, point.x, point.y)) cells.add(indexOf(width, point.x, point.y))
    }
    return { width, height, cells }
  }

  const minX = Math.max(0, Math.min(...points.map((point) => point.x)))
  const maxX = Math.min(width - 1, Math.max(...points.map((point) => point.x)))
  const minY = Math.max(0, Math.min(...points.map((point) => point.y)))
  const maxY = Math.min(height - 1, Math.max(...points.map((point) => point.y)))
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const px = x + 0.5
      const py = y + 0.5
      let inside = false
      for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const a = points[i]
        const b = points[j]
        const crosses = (a.y > py) !== (b.y > py)
          && px < ((b.x - a.x) * (py - a.y)) / ((b.y - a.y) || Number.EPSILON) + a.x
        if (crosses) inside = !inside
      }
      if (inside) cells.add(indexOf(width, x, y))
    }
  }
  for (const point of points) {
    if (inBounds(width, height, point.x, point.y)) cells.add(indexOf(width, point.x, point.y))
  }
  return { width, height, cells }
}

export function combineSelection(current: SelectionMask | null, incoming: SelectionMask, mode: SelectionCombineMode): SelectionMask | null {
  if (mode === 'replace' || !current || current.width !== incoming.width || current.height !== incoming.height) {
    return incoming.cells.size > 0 ? { ...incoming, cells: new Set(incoming.cells) } : null
  }
  const cells = new Set(current.cells)
  if (mode === 'add') {
    for (const index of incoming.cells) cells.add(index)
  } else {
    for (const index of incoming.cells) cells.delete(index)
  }
  return cells.size > 0 ? { width: current.width, height: current.height, cells } : null
}

function codeAt(grid: string[], width: number, x: number, y: number): PixelCode {
  return grid[y].slice(x * 2, x * 2 + 2)
}

function setCode(rows: string[][], x: number, y: number, code: PixelCode): void {
  rows[y][x] = code
}

function gridRows(grid: string[], width: number): string[][] {
  return grid.map((row) => Array.from({ length: width }, (_, x) => row.slice(x * 2, x * 2 + 2)))
}

export function copySelectionPixels(grid: string[], selection: SelectionMask | null): PixelClipboard | null {
  const bounds = getSelectionBounds(selection)
  if (!selection || !bounds) return null
  const cells: PixelClipboard['cells'] = []
  for (const index of selection.cells) {
    const x = index % selection.width
    const y = Math.floor(index / selection.width)
    if (!inBounds(selection.width, selection.height, x, y)) continue
    const code = codeAt(grid, selection.width, x, y)
    if (code === TRANSPARENT_CODE) continue
    cells.push({ x: x - bounds.x, y: y - bounds.y, code })
  }
  return { originX: bounds.x, originY: bounds.y, width: bounds.width, height: bounds.height, cells }
}

export function deleteSelectionPixels(grid: string[], selection: SelectionMask | null): { grid: string[]; changed: boolean } {
  if (!selection || selection.cells.size === 0) return { grid: [...grid], changed: false }
  const rows = gridRows(grid, selection.width)
  let changed = false
  for (const index of selection.cells) {
    const x = index % selection.width
    const y = Math.floor(index / selection.width)
    if (!inBounds(selection.width, selection.height, x, y) || codeAt(grid, selection.width, x, y) === TRANSPARENT_CODE) continue
    setCode(rows, x, y, TRANSPARENT_CODE)
    changed = true
  }
  return { grid: rows.map((row) => row.join('')), changed }
}

export function pasteClipboardPixels(
  grid: string[],
  canvasWidth: number,
  canvasHeight: number,
  clipboard: PixelClipboard
): { grid: string[]; selection: SelectionMask | null; changed: boolean } {
  const rows = gridRows(grid, canvasWidth)
  const selected = new Set<number>()
  let changed = false
  for (const cell of clipboard.cells) {
    const x = clipboard.originX + cell.x
    const y = clipboard.originY + cell.y
    if (!inBounds(canvasWidth, canvasHeight, x, y)) continue
    const code = cell.code as PixelCode
    if (codeAt(grid, canvasWidth, x, y) !== code) changed = true
    setCode(rows, x, y, code)
    selected.add(indexOf(canvasWidth, x, y))
  }
  return {
    grid: rows.map((row) => row.join('')),
    selection: selected.size > 0 ? { width: canvasWidth, height: canvasHeight, cells: selected } : null,
    changed
  }
}

/** 最近邻缩放正式选区；原区域先清空，目标包围盒只写入源掩码实际覆盖的格。 */
export function transformSelectionPixels(
  sourceGrid: string[],
  canvasWidth: number,
  canvasHeight: number,
  selection: SelectionMask,
  target: PixelRect
): { grid: string[]; selection: SelectionMask | null; changed: boolean } {
  const source = getSelectionBounds(selection)
  if (!source) return { grid: [...sourceGrid], selection: null, changed: false }
  const rows = gridRows(sourceGrid, canvasWidth)
  for (const index of selection.cells) {
    const x = index % canvasWidth
    const y = Math.floor(index / canvasWidth)
    if (inBounds(canvasWidth, canvasHeight, x, y)) setCode(rows, x, y, TRANSPARENT_CODE)
  }
  const nextCells = new Set<number>()
  for (let ty = 0; ty < target.height; ty++) {
    for (let tx = 0; tx < target.width; tx++) {
      const sourceX = source.x + Math.min(source.width - 1, Math.floor(((tx + 0.5) * source.width) / target.width))
      const sourceY = source.y + Math.min(source.height - 1, Math.floor(((ty + 0.5) * source.height) / target.height))
      const sourceIndex = indexOf(canvasWidth, sourceX, sourceY)
      if (!selection.cells.has(sourceIndex)) continue
      const x = target.x + tx
      const y = target.y + ty
      if (!inBounds(canvasWidth, canvasHeight, x, y)) continue
      setCode(rows, x, y, codeAt(sourceGrid, canvasWidth, sourceX, sourceY))
      nextCells.add(indexOf(canvasWidth, x, y))
    }
  }
  const grid = rows.map((row) => row.join(''))
  return {
    grid,
    selection: nextCells.size > 0 ? { width: canvasWidth, height: canvasHeight, cells: nextCells } : null,
    changed: grid.some((row, index) => row !== sourceGrid[index])
  }
}

/** 从同一份源快照计算位移，重叠区域不会因原地写入而污染；越界像素按画布边界裁掉。 */
export function moveLayerPixels(
  sourceGrid: string[],
  width: number,
  height: number,
  selection: SelectionMask | null,
  dx: number,
  dy: number
): { grid: string[]; selection: SelectionMask | null; changedCells: CellPos[] } {
  if (dx === 0 && dy === 0) return { grid: [...sourceGrid], selection, changedCells: [] }
  const sourceIndexes = selection?.cells ?? new Set(Array.from({ length: width * height }, (_, index) => index))
  const rows = gridRows(sourceGrid, width)
  const changed = new Set<number>()
  for (const index of sourceIndexes) {
    const x = index % width
    const y = Math.floor(index / width)
    if (!inBounds(width, height, x, y)) continue
    setCode(rows, x, y, TRANSPARENT_CODE)
    changed.add(index)
  }
  const movedSelectionCells = new Set<number>()
  for (const index of sourceIndexes) {
    const x = index % width
    const y = Math.floor(index / width)
    const targetX = x + dx
    const targetY = y + dy
    if (!inBounds(width, height, x, y) || !inBounds(width, height, targetX, targetY)) continue
    setCode(rows, targetX, targetY, codeAt(sourceGrid, width, x, y))
    const targetIndex = indexOf(width, targetX, targetY)
    changed.add(targetIndex)
    if (selection) movedSelectionCells.add(targetIndex)
  }
  return {
    grid: rows.map((row) => row.join('')),
    selection: selection && movedSelectionCells.size > 0 ? { width, height, cells: movedSelectionCells } : null,
    changedCells: [...changed].map((index) => ({ x: index % width, y: Math.floor(index / width) }))
  }
}

/** 从点击格开始收集四向连通、短码相同的闭合区域；只读当前层，不跨图层判断边界。 */
export function collectFloodFillCells(grid: readonly string[], width: number, height: number, startX: number, startY: number): CellPos[] {
  if (startX < 0 || startX >= width || startY < 0 || startY >= height) return []
  const codeAt = (x: number, y: number) => grid[y]?.slice(x * 2, x * 2 + 2)
  const target = codeAt(startX, startY)
  if (!target || target.length !== 2) return []
  const queue: number[] = [startY * width + startX]
  const visited = new Set<number>(queue)
  const cells: CellPos[] = []
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const index = queue[cursor]
    const x = index % width
    const y = Math.floor(index / width)
    cells.push({ x, y })
    const neighbors = [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]
    for (const [nx, ny] of neighbors) {
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue
      const nextIndex = ny * width + nx
      if (visited.has(nextIndex) || codeAt(nx, ny) !== target) continue
      visited.add(nextIndex)
      queue.push(nextIndex)
    }
  }
  return cells
}

export function applyGridToLayer(layer: PixelLayer, grid: string[]): void {
  layer.grid = grid
}
