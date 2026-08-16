import { replaceCode } from './grid'
import { PixelCode, PixelLayer, PixelPalette, TRANSPARENT_CODE } from './types'

const LETTERS = 'abcdefghijklmnopqrstuvwxyz'
const DIGITS = '123456789'

/** 按 a1..a9,b1..b9,...,z9 顺序分配下一个未占用短码；占满抛错 */
export function nextCode(palette: PixelPalette): PixelCode {
  for (const letter of LETTERS) {
    for (const digit of DIGITS) {
      const code = letter + digit
      if (!(code in palette)) {
        return code
      }
    }
  }
  throw new Error('调色板已满，无法分配新短码（a1~z9 共 234 个已用尽）')
}

/** 新增颜色：若同 hex 已存在直接复用短码，否则分配新短码 */
export function addColor(palette: PixelPalette, hex: string, name?: string): PixelCode {
  for (const code of Object.keys(palette)) {
    if (palette[code].hex === hex) {
      return code
    }
  }
  const code = nextCode(palette)
  palette[code] = name ? { hex, name } : { hex }
  return code
}

/** 删除图层私有短码：只替换该层网格并从该层 palette 清除。 */
export function removeColor(layer: PixelLayer, code: PixelCode, replaceWith: PixelCode): void {
  if (!(code in layer.palette)) {
    throw new Error(`要删除的短码 ${code} 不在调色板中`)
  }
  if (code === replaceWith) {
    throw new Error('替换短码不能与被删除短码相同，否则该短码会从调色板消失但仍残留在帧数据中')
  }
  if (replaceWith !== TRANSPARENT_CODE && !(replaceWith in layer.palette)) {
    throw new Error(`替换短码 ${replaceWith} 不在调色板中`)
  }
  replaceCode(layer, code, replaceWith)
  delete layer.palette[code]
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const normalized = hex.replace('#', '')
  const r = parseInt(normalized.slice(0, 2), 16)
  const g = parseInt(normalized.slice(2, 4), 16)
  const b = parseInt(normalized.slice(4, 6), 16)
  return { r, g, b }
}

export function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)))
  const toHex = (v: number) => clamp(v).toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}
