// 像素中控台 UI 层共享绘制：CanvasBoard 全量重绘 / PixelStudioPage 导出 PNG / ImportDialog 预览三处
// 原本各自重复"遍历行 -> 切短码 -> 查 palette -> fillRect"的逐字同构循环，收编到这一处。
import type { PixelPalette } from '../core'
import { TRANSPARENT_CODE } from '../core'

export interface DrawGridSource {
  width: number
  height: number
  grid: string[]
  palette: PixelPalette
}

/**
 * 把网格数据整体绘制到 canvas 2D 上下文；透明格跳过不画。
 * cellSize 为每个网格格对应的画布像素边长（默认 1，即一格一像素，适用于位图分辨率=网格分辨率的场景；
 * 导出 PNG 等放大场景传实际缩放倍数）。调用方负责在绘制前自行 clearRect / 设置画布尺寸。
 */
export function drawGridToCanvas(ctx: CanvasRenderingContext2D, source: DrawGridSource, cellSize = 1): void {
  const { width, height, grid, palette } = source
  for (let y = 0; y < height; y++) {
    const row = grid[y]
    if (!row) continue
    for (let x = 0; x < width; x++) {
      const code = row.slice(x * 2, x * 2 + 2)
      if (code === TRANSPARENT_CODE) continue
      const hex = palette[code]?.hex
      if (!hex) continue
      ctx.fillStyle = hex
      ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize)
    }
  }
}
