import { PixelCode, TRANSPARENT_CODE } from './types'

export interface PixelGridSource {
  grid: string[]
}

export interface CellPos {
  x: number
  y: number
}

/** 读取指定格子的短码；越界返回透明码 */
export function getCell(source: PixelGridSource, width: number, x: number, y: number): PixelCode {
  const row = source.grid[y]
  if (row === undefined || x < 0 || x >= width) {
    return TRANSPARENT_CODE
  }
  return row.slice(x * 2, x * 2 + 2)
}

/** 批量写入格子，越界格静默跳过 */
export function setCells(source: PixelGridSource, width: number, cells: CellPos[], code: PixelCode): void {
  const height = source.grid.length
  for (const { x, y } of cells) {
    if (x < 0 || x >= width || y < 0 || y >= height) {
      continue
    }
    const row = source.grid[y]
    source.grid[y] = row.slice(0, x * 2) + code + row.slice(x * 2 + 2)
  }
}

/** Bresenham 直线光栅化，含首尾两端点 */
export function rasterLine(x0: number, y0: number, x1: number, y1: number): CellPos[] {
  const points: CellPos[] = []
  let x = x0
  let y = y0
  const dx = Math.abs(x1 - x0)
  const dy = -Math.abs(y1 - y0)
  const sx = x0 < x1 ? 1 : -1
  const sy = y0 < y1 ? 1 : -1
  let err = dx + dy
  // eslint-disable-next-line no-constant-condition
  while (true) {
    points.push({ x, y })
    if (x === x1 && y === y1) break
    const e2 = 2 * err
    if (e2 >= dy) {
      err += dy
      x += sx
    }
    if (e2 <= dx) {
      err += dx
      y += sy
    }
  }
  return points
}

/** 矩形光栅化：外接矩形由 (x0,y0)-(x1,y1) 两角定义，filled=false 只描边 */
export function rasterRect(x0: number, y0: number, x1: number, y1: number, filled: boolean): CellPos[] {
  const minX = Math.min(x0, x1)
  const maxX = Math.max(x0, x1)
  const minY = Math.min(y0, y1)
  const maxY = Math.max(y0, y1)
  const points: CellPos[] = []
  if (filled) {
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        points.push({ x, y })
      }
    }
    return points
  }
  for (let x = minX; x <= maxX; x++) {
    points.push({ x, y: minY })
    if (maxY !== minY) points.push({ x, y: maxY })
  }
  for (let y = minY + 1; y < maxY; y++) {
    points.push({ x: minX, y })
    if (maxX !== minX) points.push({ x: maxX, y })
  }
  return points
}

/** 椭圆光栅化：外接矩形由 (x0,y0)-(x1,y1) 定义 */
export function rasterEllipse(x0: number, y0: number, x1: number, y1: number, filled: boolean): CellPos[] {
  const minX = Math.min(x0, x1)
  const maxX = Math.max(x0, x1)
  const minY = Math.min(y0, y1)
  const maxY = Math.max(y0, y1)
  const cx = (minX + maxX) / 2
  const cy = (minY + maxY) / 2
  const rx = (maxX - minX) / 2
  const ry = (maxY - minY) / 2
  const seen = new Set<string>()
  const points: CellPos[] = []
  const add = (x: number, y: number) => {
    const key = `${x},${y}`
    if (!seen.has(key)) {
      seen.add(key)
      points.push({ x, y })
    }
  }

  // 半径为 0（单行/单列）时退化为直线
  if (rx === 0 && ry === 0) {
    add(Math.round(cx), Math.round(cy))
    return points
  }

  if (filled) {
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const nx = rx === 0 ? 0 : (x - cx) / rx
        const ny = ry === 0 ? 0 : (y - cy) / ry
        // 用格子中心 (x - cx) 判定是否落在椭圆内（含边界附近的近似），保证退化轴仍能覆盖整行/整列
        if (nx * nx + ny * ny <= 1 + 1e-9) {
          add(x, y)
        }
      }
    }
    return points
  }

  // 描边：沿角度采样，采样密度按周长估算，避免大椭圆出现缝隙
  const steps = Math.max(36, Math.ceil((rx + ry) * 8))
  for (let i = 0; i < steps; i++) {
    const theta = (i / steps) * Math.PI * 2
    const x = Math.round(cx + rx * Math.cos(theta))
    const y = Math.round(cy + ry * Math.sin(theta))
    add(x, y)
  }
  return points
}

/** 方形笔刷：size 为边长，中心对齐在 (x,y)；入口负责钳到 1~32 整数，这里只做防御性钳到 >=1 */
export function rasterBrush(x: number, y: number, size: number): CellPos[] {
  const clamped = Math.max(1, Math.round(Number.isFinite(size) ? size : 1))
  const before = Math.floor((clamped - 1) / 2)
  const after = Math.ceil((clamped - 1) / 2)
  const points: CellPos[] = []
  for (let dy = -before; dy <= after; dy++) {
    for (let dx = -before; dx <= after; dx++) {
      points.push({ x: x + dx, y: y + dy })
    }
  }
  return points
}

/** 整帧替换短码，返回改动格数 */
export function replaceCode(source: PixelGridSource, from: PixelCode, to: PixelCode): number {
  let count = 0
  for (let y = 0; y < source.grid.length; y++) {
    const row = source.grid[y]
    let changed = false
    let next = ''
    for (let i = 0; i < row.length; i += 2) {
      const code = row.slice(i, i + 2)
      if (code === from) {
        next += to
        count++
        changed = true
      } else {
        next += code
      }
    }
    if (changed) {
      source.grid[y] = next
    }
  }
  return count
}
