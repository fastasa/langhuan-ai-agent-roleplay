import { describe, expect, it } from 'vitest'
import {
  normalizeSquarePhotoCropPreset,
  resolveSquarePhotoCropRect
} from '../../../src/utils/photoFile.ts'

describe('照片正方形裁剪参数', () => {
  it('缺省取中心最大正方形', () => {
    expect(resolveSquarePhotoCropRect(1200, 800)).toEqual({
      sourceX: 200,
      sourceY: 0,
      sourceSize: 800,
      preset: { focusX: 0.5, focusY: 0.5, zoom: 1 }
    })
  })

  it('按焦点和缩放计算原图区域并在边界内收口', () => {
    expect(resolveSquarePhotoCropRect(1000, 1600, { focusX: 0.8, focusY: 0.2, zoom: 2 })).toEqual({
      sourceX: 500,
      sourceY: 70,
      sourceSize: 500,
      preset: { focusX: 0.8, focusY: 0.2, zoom: 2 }
    })

    expect(resolveSquarePhotoCropRect(1000, 1600, { focusX: 1, focusY: 0, zoom: 2 })).toMatchObject({
      sourceX: 500,
      sourceY: 0,
      sourceSize: 500
    })
  })

  it('非法参数回退并把有效数值限制在正式范围', () => {
    expect(normalizeSquarePhotoCropPreset({ focusX: -1, focusY: 9, zoom: Number.NaN })).toEqual({
      focusX: 0,
      focusY: 1,
      zoom: 1
    })
  })
})
