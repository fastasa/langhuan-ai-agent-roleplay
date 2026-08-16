// 像素中控台核心引擎——正式数据契约
// 铁律：本目录零 Vue、零 DOM、零琅嬛业务 import，仅纯 TS 计算代码

/** 两字符短码；'..' 固定为透明 */
export type PixelCode = string

export const TRANSPARENT_CODE = '..'

export interface PixelColor {
  hex: string // 形如 '#f9c247'（小写）
  name?: string
}

/** 调色板：短码 -> 颜色，不含透明短码 '..' */
export type PixelPalette = Record<PixelCode, PixelColor>

export interface PixelLayer {
  id: string
  name: string
  visible: boolean
  /** 图层私有色卡；短码只在本图层内有意义，不得跨层解析。 */
  palette: PixelPalette
  /** 行字符串数组，行数=height，每行长度=width*2（每格两字符短码拼接） */
  grid: string[]
}

export interface PixelFrame {
  id: string
  /** 当前画帧在时间轴上连续显示的整数时间格数量。 */
  exposureFrames: number
  /** 从下到上的图层栈；最后一项是视觉最上层 */
  layers: PixelLayer[]
}

export interface PixelTimeline {
  /** 每秒时间格数量。 */
  fps: number
  /** 正式播放范围，首尾均为从 1 开始的包含式帧号。 */
  rangeStartFrame: number
  rangeEndFrame: number
}

export interface PixelDocument {
  version: 4
  name: string
  width: number
  height: number
  frames: PixelFrame[]
  /** null 表示静态文档；静态文档只允许一个画帧。 */
  timeline: PixelTimeline | null
  playback: { loop: boolean }
}
