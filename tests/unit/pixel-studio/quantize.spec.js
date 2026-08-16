import { describe, expect, it } from 'vitest'
import { quantizeImage, downsampleImage, quantizeCells } from '@/pixel-studio/core/quantize'

/** 构造一个 4x4 RGBA 图：左上 2x2 全红不透明，右上 2x2 全蓝不透明，下半 2x4 全透明 */
function buildFourByFour() {
  const rgba = new Uint8ClampedArray(4 * 4 * 4)
  const setPixel = (x, y, r, g, b, a) => {
    const offset = (y * 4 + x) * 4
    rgba[offset] = r
    rgba[offset + 1] = g
    rgba[offset + 2] = b
    rgba[offset + 3] = a
  }
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
      if (y < 2 && x < 2) setPixel(x, y, 255, 0, 0, 255)
      else if (y < 2 && x >= 2) setPixel(x, y, 0, 0, 255, 255)
      else setPixel(x, y, 0, 0, 0, 0)
    }
  }
  return rgba
}

describe('pixel-studio/core/quantize', () => {
  it('降采样 4x4 -> 2x2：不透明区取均色，不透明占比<50% 的格判透明', () => {
    const rgba = buildFourByFour()
    const result = quantizeImage({
      rgba,
      srcWidth: 4,
      srcHeight: 4,
      targetWidth: 2,
      targetHeight: 2,
      maxColors: 8
    })

    expect(result.grid).toHaveLength(2)
    expect(result.grid[1]).toBe('....') // 下半整行透明
    const topRow = result.grid[0]
    const leftCode = topRow.slice(0, 2)
    const rightCode = topRow.slice(2, 4)
    expect(leftCode).not.toBe('..')
    expect(rightCode).not.toBe('..')
    expect(result.palette[leftCode].hex).toBe('#ff0000')
    expect(result.palette[rightCode].hex).toBe('#0000ff')
    expect(Object.keys(result.palette)).toHaveLength(2)
  })

  it('maxColors 限制调色板色数上限', () => {
    // 4x4 四种不同颜色的 2x2 分块，量化到不降采样的 4x4，但限制 maxColors=2
    const rgba = new Uint8ClampedArray(4 * 4 * 4)
    const colors = [
      [255, 0, 0],
      [0, 255, 0],
      [0, 0, 255],
      [255, 255, 0]
    ]
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        const quadrant = (y < 2 ? 0 : 2) + (x < 2 ? 0 : 1)
        const [r, g, b] = colors[quadrant]
        const offset = (y * 4 + x) * 4
        rgba[offset] = r
        rgba[offset + 1] = g
        rgba[offset + 2] = b
        rgba[offset + 3] = 255
      }
    }
    const result = quantizeImage({
      rgba,
      srcWidth: 4,
      srcHeight: 4,
      targetWidth: 4,
      targetHeight: 4,
      maxColors: 2
    })
    expect(Object.keys(result.palette).length).toBeLessThanOrEqual(2)
  })

  it('alphaThreshold 默认 128，可整块判定透明/不透明边界', () => {
    const rgba = new Uint8ClampedArray(2 * 2 * 4)
    // 4 个像素中 3 个 alpha=200(不透明)，1 个 alpha=0，占比 75% >= 50% -> 判不透明
    const px = [
      [10, 10, 10, 200],
      [10, 10, 10, 200],
      [10, 10, 10, 200],
      [10, 10, 10, 0]
    ]
    px.forEach(([r, g, b, a], i) => {
      rgba[i * 4] = r
      rgba[i * 4 + 1] = g
      rgba[i * 4 + 2] = b
      rgba[i * 4 + 3] = a
    })
    const result = quantizeImage({
      rgba,
      srcWidth: 2,
      srcHeight: 2,
      targetWidth: 1,
      targetHeight: 1,
      maxColors: 4
    })
    expect(result.grid[0]).not.toBe('..')
  })

  it('downsampleImage + quantizeCells 分步结果与 quantizeImage 一次调用逐字节相等（4x4 双色场景）', () => {
    const rgba = buildFourByFour()
    const input = {
      rgba,
      srcWidth: 4,
      srcHeight: 4,
      targetWidth: 2,
      targetHeight: 2,
      maxColors: 8
    }
    const oneShot = quantizeImage(input)
    const sample = downsampleImage(input)
    const stepped = quantizeCells(sample, input.maxColors)
    expect(stepped).toEqual(oneShot)
  })

  it('downsampleImage + quantizeCells 分步结果与 quantizeImage 一次调用逐字节相等（4x4 四色 maxColors=2 场景）', () => {
    const rgba = new Uint8ClampedArray(4 * 4 * 4)
    const colors = [
      [255, 0, 0],
      [0, 255, 0],
      [0, 0, 255],
      [255, 255, 0]
    ]
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        const quadrant = (y < 2 ? 0 : 2) + (x < 2 ? 0 : 1)
        const [r, g, b] = colors[quadrant]
        const offset = (y * 4 + x) * 4
        rgba[offset] = r
        rgba[offset + 1] = g
        rgba[offset + 2] = b
        rgba[offset + 3] = 255
      }
    }
    const input = {
      rgba,
      srcWidth: 4,
      srcHeight: 4,
      targetWidth: 4,
      targetHeight: 4,
      maxColors: 2
    }
    const oneShot = quantizeImage(input)
    const sample = downsampleImage(input)
    const stepped = quantizeCells(sample, input.maxColors)
    expect(stepped).toEqual(oneShot)
  })

  it('quantizeCells 复用同一份 downsampleImage 结果，只改 maxColors 重跑量化', () => {
    const rgba = buildFourByFour()
    const sample = downsampleImage({
      rgba,
      srcWidth: 4,
      srcHeight: 4,
      targetWidth: 2,
      targetHeight: 2
    })
    const result1 = quantizeCells(sample, 8)
    const result2 = quantizeCells(sample, 2)
    expect(Object.keys(result1.palette).length).toBeLessThanOrEqual(8)
    expect(Object.keys(result2.palette).length).toBeLessThanOrEqual(2)
  })
})
