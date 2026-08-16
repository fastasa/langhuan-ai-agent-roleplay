// 像素中控台 UI 层纯函数：不依赖 Vue/DOM，方便单测；供 CanvasBoard / PixelStudioPage / ImportDialog 复用。
import type { PixelCode, PixelDocument, PixelPalette } from '../core'
import { addColor, createDocument, hexToRgb, rgbToHex } from '../core'

const MIN_DOC_SIZE = 8
const MAX_DOC_SIZE = 512

/**
 * 新建文档调色板种子色：黑/白/灰/红/黄/蓝/绿/肤色，共 8 色，短码从 a1 顺序分配。
 * 根因修复的一部分——core createDocument 的 palette 保持纯净空白，避免"新建即默认透明色作画不可见"。
 */
export const NEW_DOC_SEED_COLORS: { hex: string; name: string }[] = [
  { hex: '#1a1a1a', name: '黑' },
  { hex: '#ffffff', name: '白' },
  { hex: '#8a8a8a', name: '灰' },
  { hex: '#e63946', name: '红' },
  { hex: '#f4d35e', name: '黄' },
  { hex: '#3a86ff', name: '蓝' },
  { hex: '#43aa8b', name: '绿' },
  { hex: '#f2c9a1', name: '肤色' }
]

/**
 * 新建文档统一入口：NewDocDialog 流程与页面初始默认文档共用本函数，保证行为一致。
 * 联动标注：三期 AI 建文档工具需要复用同一套种子逻辑，若迁移分层结构或调整色表，须同步改这里。
 */
export function createSeededDocument(opts: { name: string; width: number; height: number }): PixelDocument {
  const doc = createDocument(opts)
  const layer = doc.frames[0].layers[0]
  for (const seed of NEW_DOC_SEED_COLORS) {
    addColor(layer.palette, seed.hex, seed.name)
  }
  return doc
}

/** 调色板中第一个短码（按插入顺序），调色板为空返回 null；供"当前色校正"复用 */
export function firstPaletteCode(palette: PixelPalette): PixelCode | null {
  const codes = Object.keys(palette)
  return codes.length > 0 ? codes[0] : null
}

/** 新建文档宽高钳制：整数、限定在 8~512（UI 层比核心引擎的 1~512 更收窄，避免误建超小画布） */
export function clampNewDocSize(value: number): number {
  const n = Math.round(Number.isFinite(value) ? value : MIN_DOC_SIZE)
  return Math.max(MIN_DOC_SIZE, Math.min(MAX_DOC_SIZE, n))
}

/** 导出 PNG 像素尺寸 = 文档尺寸 × 放大倍数 */
export function computeExportPixelSize(width: number, height: number, scale: number): { width: number; height: number } {
  return { width: Math.round(width * scale), height: Math.round(height * scale) }
}

/**
 * 导入图片时，按预设的"长边"目标像素数换算另一边，保持源图宽高比。
 * 换算结果钳制到 1~512（核心引擎 model.ts 的合法区间），且不小于 1。
 */
export function computeImportTargetSize(srcWidth: number, srcHeight: number, longEdge: number): { width: number; height: number } {
  const edge = Math.max(1, Math.round(longEdge))
  if (srcWidth <= 0 || srcHeight <= 0) {
    return { width: edge, height: edge }
  }
  let width: number
  let height: number
  if (srcWidth >= srcHeight) {
    width = edge
    height = Math.round((srcHeight * edge) / srcWidth)
  } else {
    height = edge
    width = Math.round((srcWidth * edge) / srcHeight)
  }
  const clamp = (v: number) => Math.max(1, Math.min(512, v))
  return { width: clamp(width), height: clamp(height) }
}

/** 文件名去掉扩展名，作为导入后的默认文档名；无扩展名或空文件名给兜底 */
export function filenameToDocName(filename: string): string {
  const trimmed = (filename || '').trim()
  if (!trimmed) return '导入图片'
  const dotIndex = trimmed.lastIndexOf('.')
  if (dotIndex <= 0) return trimmed
  return trimmed.slice(0, dotIndex)
}

/** hex 颜色格式校验：'#' + 6 位小写/大写十六进制 */
export function isValidHexColor(hex: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(hex)
}

/** 判断事件目标是否处于文本录入态（输入框/文本域/可编辑元素），录入态下全局快捷键分发必须挂起，避免打字触发工具切换等动作 */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || !!target.isContentEditable
}

// ---- HSV <-> hex：供 PixelColorPicker.vue 经典拾色器复用，纯函数便于单测 ----
export interface HsvColor {
  /** 色相 0~360 */
  h: number
  /** 饱和度 0~1 */
  s: number
  /** 明度 0~1 */
  v: number
}

function rgbToHsvInternal(r: number, g: number, b: number): HsvColor {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const d = max - min
  let h = 0
  if (d !== 0) {
    if (max === rn) h = ((gn - bn) / d) % 6
    else if (max === gn) h = (bn - rn) / d + 2
    else h = (rn - gn) / d + 4
    h *= 60
    if (h < 0) h += 360
  }
  const s = max === 0 ? 0 : d / max
  return { h, s, v: max }
}

function hsvToRgbInternal(h: number, s: number, v: number): { r: number; g: number; b: number } {
  const hh = ((h % 360) + 360) % 360
  const c = v * s
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1))
  const m = v - c
  let rp = 0
  let gp = 0
  let bp = 0
  if (hh < 60) { rp = c; gp = x; bp = 0 }
  else if (hh < 120) { rp = x; gp = c; bp = 0 }
  else if (hh < 180) { rp = 0; gp = c; bp = x }
  else if (hh < 240) { rp = 0; gp = x; bp = c }
  else if (hh < 300) { rp = x; gp = 0; bp = c }
  else { rp = c; gp = 0; bp = x }
  return { r: (rp + m) * 255, g: (gp + m) * 255, b: (bp + m) * 255 }
}

/** hex -> HSV，供拾色器把已知色（如详情窗当前色）转换为 SV 方块/色相条初始位置 */
export function hexToHsv(hex: string): HsvColor {
  const { r, g, b } = hexToRgb(hex)
  return rgbToHsvInternal(r, g, b)
}

/** HSV -> hex（小写），供拾色器拖动取值时实时产出可写回调色板的颜色值 */
export function hsvToHex(h: number, s: number, v: number): string {
  const { r, g, b } = hsvToRgbInternal(h, s, v)
  return rgbToHex(r, g, b)
}
