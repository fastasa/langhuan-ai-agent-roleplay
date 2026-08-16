import { getCell } from './grid'
import type { PixelCode, PixelFrame, PixelLayer, PixelPalette } from './types'
import { TRANSPARENT_CODE } from './types'

export const MAX_LAYER_COUNT = 64

function blankGrid(width: number, height: number): string[] {
  return Array.from({ length: height }, () => TRANSPARENT_CODE.repeat(width))
}

export function createLayer(opts: { id: string; name: string; width: number; height: number; palette?: PixelPalette }): PixelLayer {
  return { id: opts.id, name: opts.name, visible: true, palette: { ...(opts.palette ?? {}) }, grid: blankGrid(opts.width, opts.height) }
}

export function getLayer(frame: PixelFrame, id?: string): PixelLayer {
  const layer = id ? frame.layers.find((item) => item.id === id) : frame.layers[frame.layers.length - 1]
  if (!layer) throw new Error(`图层不存在: ${id ?? '(top)'}`)
  return layer
}

/** 读取当前显示合成色；图层数组从下到上，最上方非透明格获胜。 */
export interface CompositePixel {
  code: PixelCode
  hex: string | null
  layerId: string | null
}

export function getCompositePixel(frame: PixelFrame, width: number, x: number, y: number, soloLayerId?: string | null): CompositePixel {
  if (soloLayerId) {
    const layer = getLayer(frame, soloLayerId)
    const code = getCell(layer, width, x, y)
    return { code, hex: code === TRANSPARENT_CODE ? null : layer.palette[code]?.hex ?? null, layerId: code === TRANSPARENT_CODE ? null : layer.id }
  }
  for (let i = frame.layers.length - 1; i >= 0; i--) {
    const layer = frame.layers[i]
    if (!layer.visible) continue
    const code = getCell(layer, width, x, y)
    if (code !== TRANSPARENT_CODE) return { code, hex: layer.palette[code]?.hex ?? null, layerId: layer.id }
  }
  return { code: TRANSPARENT_CODE, hex: null, layerId: null }
}
