import { getCell, setCells, type CellPos } from './grid'
import { getLayer } from './layers'
import { cloneDocument, getFrame } from './model'
import { addColor, hexToRgb, rgbToHex } from './palette'
import { TRANSPARENT_CODE, type PixelCode, type PixelDocument } from './types'

export interface HsvAdjustment {
  /** 色相相对偏移，单位为角度，正式入口钳在 -180~180。 */
  hue: number
  /** 饱和度相对偏移，单位为百分点，正式入口钳在 -100~100。 */
  saturation: number
  /** 明度（HSV Value）相对偏移，单位为百分点，正式入口钳在 -100~100。 */
  brightness: number
}

export interface PixelRegion {
  x0: number
  y0: number
  x1: number
  y1: number
}

export interface PixelCellSelection {
  cells: ReadonlySet<number>
}

export interface ColorAdjustResult {
  doc: PixelDocument
  changedCellCount: number
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

export function rgbToHsv(r: number, g: number, b: number): { h: number; s: number; v: number } {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const delta = max - min
  let h = 0
  if (delta !== 0) {
    if (max === rn) h = 60 * (((gn - bn) / delta) % 6)
    else if (max === gn) h = 60 * ((bn - rn) / delta + 2)
    else h = 60 * ((rn - gn) / delta + 4)
  }
  if (h < 0) h += 360
  return { h, s: max === 0 ? 0 : delta / max, v: max }
}

export function hsvToRgb(h: number, s: number, v: number): { r: number; g: number; b: number } {
  const c = v * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = v - c
  let rgb: [number, number, number]
  if (h < 60) rgb = [c, x, 0]
  else if (h < 120) rgb = [x, c, 0]
  else if (h < 180) rgb = [0, c, x]
  else if (h < 240) rgb = [0, x, c]
  else if (h < 300) rgb = [x, 0, c]
  else rgb = [c, 0, x]
  return { r: (rgb[0] + m) * 255, g: (rgb[1] + m) * 255, b: (rgb[2] + m) * 255 }
}

export function hexToHsv(hex: string): { h: number; s: number; v: number } {
  const { r, g, b } = hexToRgb(hex)
  return rgbToHsv(r, g, b)
}

export function hsvToHex(h: number, s: number, v: number): string {
  const rgb = hsvToRgb(((h % 360) + 360) % 360, clamp(s, 0, 1), clamp(v, 0, 1))
  return rgbToHex(rgb.r, rgb.g, rgb.b)
}

/** 色相按单位圆平均，避免 359° 与 1° 被错误平均成 180°。 */
export function averageHexHsv(hexes: readonly string[]): string {
  if (hexes.length === 0) throw new Error('平均颜色至少需要一个颜色')
  let sinSum = 0
  let cosSum = 0
  let saturationSum = 0
  let brightnessSum = 0
  for (const hex of hexes) {
    const hsv = hexToHsv(hex)
    const radians = hsv.h * Math.PI / 180
    sinSum += Math.sin(radians)
    cosSum += Math.cos(radians)
    saturationSum += hsv.s
    brightnessSum += hsv.v
  }
  const hue = sinSum === 0 && cosSum === 0 ? 0 : ((Math.atan2(sinSum, cosSum) * 180 / Math.PI) + 360) % 360
  return hsvToHex(hue, saturationSum / hexes.length, brightnessSum / hexes.length)
}

export function adjustHexHsv(hex: string, adjustment: HsvAdjustment): string {
  const rgb = hexToRgb(hex)
  const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b)
  const hue = ((hsv.h + clamp(adjustment.hue, -180, 180)) % 360 + 360) % 360
  const saturation = clamp(hsv.s + clamp(adjustment.saturation, -100, 100) / 100, 0, 1)
  const brightness = clamp(hsv.v + clamp(adjustment.brightness, -100, 100) / 100, 0, 1)
  const next = hsvToRgb(hue, saturation, brightness)
  return rgbToHex(next.r, next.g, next.b)
}

/**
 * 调整当前层目标区域内的颜色。图层 palette 私有，但选区外仍可能复用同短码；
 * 因此为调整结果复用/新增本层短码，只替换目标格。返回新文档，调用方可安全用作预览投影。
 */
export function adjustLayerColors(
  source: PixelDocument,
  layerId: string,
  region: PixelRegion | PixelCellSelection | null,
  adjustment: HsvAdjustment,
  frameIndex = 0
): ColorAdjustResult {
  const doc = cloneDocument(source)
  const layer = getLayer(getFrame(doc, frameIndex), layerId)
  const rectRegion = region && 'x0' in region ? region : null
  const cellSelection = region && 'cells' in region ? region.cells : null
  const minX = clamp(Math.min(rectRegion?.x0 ?? 0, rectRegion?.x1 ?? doc.width - 1), 0, doc.width - 1)
  const maxX = clamp(Math.max(rectRegion?.x0 ?? 0, rectRegion?.x1 ?? doc.width - 1), 0, doc.width - 1)
  const minY = clamp(Math.min(rectRegion?.y0 ?? 0, rectRegion?.y1 ?? doc.height - 1), 0, doc.height - 1)
  const maxY = clamp(Math.max(rectRegion?.y0 ?? 0, rectRegion?.y1 ?? doc.height - 1), 0, doc.height - 1)
  const replacementByCode = new Map<PixelCode, PixelCode>()
  const cellsByCode = new Map<PixelCode, CellPos[]>()
  let changedCellCount = 0

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      if (cellSelection && !cellSelection.has(y * doc.width + x)) continue
      const code = getCell(layer, doc.width, x, y)
      if (code === TRANSPARENT_CODE) continue
      let replacement = replacementByCode.get(code)
      if (!replacement) {
        const color = layer.palette[code]
        if (!color) continue
        const adjustedHex = adjustHexHsv(color.hex, adjustment)
        replacement = adjustedHex === color.hex.toLowerCase() ? code : addColor(layer.palette, adjustedHex)
        replacementByCode.set(code, replacement)
      }
      if (replacement === code) continue
      const cells = cellsByCode.get(replacement) ?? []
      cells.push({ x, y })
      cellsByCode.set(replacement, cells)
      changedCellCount++
    }
  }

  for (const [code, cells] of cellsByCode) setCells(layer, doc.width, cells, code)
  return { doc, changedCellCount }
}
