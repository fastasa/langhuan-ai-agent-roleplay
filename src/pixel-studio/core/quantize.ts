import { addColor, rgbToHex } from './palette'
import { PixelPalette, TRANSPARENT_CODE } from './types'

export interface QuantizeInput {
  rgba: Uint8ClampedArray
  srcWidth: number
  srcHeight: number
  targetWidth: number
  targetHeight: number
  maxColors: number
  alphaThreshold?: number
}

export interface QuantizeResult {
  palette: PixelPalette
  grid: string[]
}

export interface DownsampleInput {
  rgba: Uint8ClampedArray
  srcWidth: number
  srcHeight: number
  targetWidth: number
  targetHeight: number
  alphaThreshold?: number
}

/** 降采样结果：cells[i] === null 表示该目标格判定为透明，否则是该格的降采样平均 RGB */
export interface DownsampleResult {
  targetWidth: number
  targetHeight: number
  cells: Array<{ r: number; g: number; b: number } | null>
}

interface RgbEntry {
  r: number
  g: number
  b: number
  id: number
}

type Channel = 'r' | 'g' | 'b'

/** 计算一批颜色在 r/g/b 三个通道上的最大跨度，返回跨度最大的那个通道 */
function widestChannel(entries: RgbEntry[]): { channel: Channel; range: number } {
  let best: { channel: Channel; range: number } = { channel: 'r', range: -1 }
  for (const channel of ['r', 'g', 'b'] as Channel[]) {
    let min = Infinity
    let max = -Infinity
    for (const e of entries) {
      const v = e[channel]
      if (v < min) min = v
      if (v > max) max = v
    }
    const range = max - min
    if (range > best.range) {
      best = { channel, range }
    }
  }
  return best
}

interface Box {
  entries: RgbEntry[]
  channel: Channel
  range: number
}

/** 桶只在新建（初始桶/分裂出的子桶）时算一次 widestChannel，避免每轮循环对未分裂的桶重复全量扫描 */
function makeBox(entries: RgbEntry[]): Box {
  if (entries.length < 2) {
    return { entries, channel: 'r', range: -1 }
  }
  const { channel, range } = widestChannel(entries)
  return { entries, channel, range }
}

/** median-cut 量化：把颜色条目切分为 <= maxColors 个桶，返回每个桶的成员列表 */
function medianCut(entries: RgbEntry[], maxColors: number): RgbEntry[][] {
  if (entries.length === 0) return []
  const boxes: Box[] = [makeBox(entries)]

  while (boxes.length < maxColors) {
    let splitIndex = -1
    let bestRange = -1
    boxes.forEach((box, i) => {
      if (box.entries.length < 2) return
      if (box.range > bestRange) {
        bestRange = box.range
        splitIndex = i
      }
    })
    // 所有桶都只剩单一颜色或已无法再分，停止
    if (splitIndex === -1 || bestRange <= 0) break

    const box = boxes[splitIndex]
    box.entries.sort((a, b) => a[box.channel] - b[box.channel])
    const mid = Math.floor(box.entries.length / 2)
    const boxA = box.entries.slice(0, mid)
    const boxB = box.entries.slice(mid)
    boxes.splice(splitIndex, 1, makeBox(boxA), makeBox(boxB))
  }

  return boxes.map((b) => b.entries)
}

function boxAverage(box: RgbEntry[]): { r: number; g: number; b: number } {
  let r = 0
  let g = 0
  let b = 0
  for (const e of box) {
    r += e.r
    g += e.g
    b += e.b
  }
  const n = box.length
  return { r: Math.round(r / n), g: Math.round(g / n), b: Math.round(b / n) }
}

/**
 * 降采样：把源图按盒平均缩放到目标分辨率，每个目标格取源区域内 alpha>=阈值像素的 RGB 均值；
 * 不透明像素占比<50% 的格判为透明。只做这一步，供 UI 在只调色数变化时跳过重跑。
 */
export function downsampleImage(input: DownsampleInput): DownsampleResult {
  const { rgba, srcWidth, srcHeight, targetWidth, targetHeight } = input
  const alphaThreshold = input.alphaThreshold ?? 128

  const cellColors: Array<{ r: number; g: number; b: number } | null> = []

  for (let ty = 0; ty < targetHeight; ty++) {
    const sy0 = Math.floor((ty * srcHeight) / targetHeight)
    const sy1 = Math.max(sy0 + 1, Math.floor(((ty + 1) * srcHeight) / targetHeight))
    for (let tx = 0; tx < targetWidth; tx++) {
      const sx0 = Math.floor((tx * srcWidth) / targetWidth)
      const sx1 = Math.max(sx0 + 1, Math.floor(((tx + 1) * srcWidth) / targetWidth))

      let total = 0
      let opaque = 0
      let sumR = 0
      let sumG = 0
      let sumB = 0
      for (let sy = sy0; sy < sy1 && sy < srcHeight; sy++) {
        for (let sx = sx0; sx < sx1 && sx < srcWidth; sx++) {
          const offset = (sy * srcWidth + sx) * 4
          const a = rgba[offset + 3]
          total++
          if (a >= alphaThreshold) {
            opaque++
            sumR += rgba[offset]
            sumG += rgba[offset + 1]
            sumB += rgba[offset + 2]
          }
        }
      }

      if (total === 0 || opaque / total < 0.5) {
        cellColors.push(null)
      } else {
        cellColors.push({
          r: Math.round(sumR / opaque),
          g: Math.round(sumG / opaque),
          b: Math.round(sumB / opaque)
        })
      }
    }
  }

  return { targetWidth, targetHeight, cells: cellColors }
}

/**
 * 量化：对降采样结果里的非透明格颜色跑 median-cut，量化到 <= maxColors 种，分配短码并生成 grid。
 * 只做这一步，供 UI 在滑动颜色数滑条时只重跑本函数，不重跑降采样。
 */
export function quantizeCells(sample: DownsampleResult, maxColors: number): QuantizeResult {
  const { cells, targetWidth, targetHeight } = sample
  const clampedMaxColors = Math.max(2, Math.min(64, maxColors))

  const entries: RgbEntry[] = []
  cells.forEach((c, id) => {
    if (c) entries.push({ ...c, id })
  })
  const boxes = medianCut(entries, clampedMaxColors)

  // id -> 量化后代表色
  const resolved = new Map<number, { r: number; g: number; b: number }>()
  for (const box of boxes) {
    const avg = boxAverage(box)
    for (const e of box) {
      resolved.set(e.id, avg)
    }
  }

  const palette: PixelPalette = {}
  const grid: string[] = []
  let cursor = 0
  for (let ty = 0; ty < targetHeight; ty++) {
    let row = ''
    for (let tx = 0; tx < targetWidth; tx++) {
      const c = cells[cursor]
      if (!c) {
        row += TRANSPARENT_CODE
      } else {
        const avg = resolved.get(cursor)!
        const hex = rgbToHex(avg.r, avg.g, avg.b)
        row += addColor(palette, hex)
      }
      cursor++
    }
    grid.push(row)
  }

  return { palette, grid }
}

/** 图片量化：降采样 + 量化两步的组合封装，签名保持不变，供既有调用方零改动使用 */
export function quantizeImage(input: QuantizeInput): QuantizeResult {
  const { maxColors, ...downsampleInput } = input
  const sample = downsampleImage(downsampleInput)
  return quantizeCells(sample, maxColors)
}
