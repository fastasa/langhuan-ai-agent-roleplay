import { describe, expect, it } from 'vitest'
import { nextCode, addColor, removeColor, hexToRgb, rgbToHex } from '@/pixel-studio/core/palette'
import { createDocument } from '@/pixel-studio/core/model'

describe('pixel-studio/core/palette', () => {
  it('nextCode 按 a1..a9,b1..b9 顺序分配，跳过已占用', () => {
    const palette = {}
    expect(nextCode(palette)).toBe('a1')
    palette.a1 = { hex: '#000000' }
    expect(nextCode(palette)).toBe('a2')
    for (let i = 2; i <= 9; i++) palette[`a${i}`] = { hex: '#000000' }
    expect(nextCode(palette)).toBe('b1')
  })

  it('nextCode 满载抛错', () => {
    const palette = {}
    for (const letter of 'abcdefghijklmnopqrstuvwxyz') {
      for (const digit of '123456789') {
        palette[letter + digit] = { hex: '#000000' }
      }
    }
    expect(() => nextCode(palette)).toThrow()
  })

  it('addColor 分配新短码', () => {
    const palette = {}
    const code = addColor(palette, '#f9c247', '头发')
    expect(code).toBe('a1')
    expect(palette.a1).toEqual({ hex: '#f9c247', name: '头发' })
  })

  it('addColor 同 hex 已存在时直接复用短码', () => {
    const palette = {}
    const code1 = addColor(palette, '#f9c247')
    const code2 = addColor(palette, '#f9c247', '别名')
    expect(code2).toBe(code1)
    expect(Object.keys(palette)).toHaveLength(1)
  })

  it('removeColor 只替换目标图层并从该层 palette 清除', () => {
    const doc = createDocument({ name: 'v', width: 1, height: 1 })
    const layer = doc.frames[0].layers[0]
    layer.palette.a1 = { hex: '#ff0000' }
    layer.grid[0] = 'a1'

    removeColor(layer, 'a1', '..')

    expect(layer.palette.a1).toBeUndefined()
    expect(layer.grid[0]).toBe('..')
  })

  it('hexToRgb / rgbToHex 互为逆运算', () => {
    expect(hexToRgb('#f9c247')).toEqual({ r: 249, g: 194, b: 71 })
    expect(rgbToHex(249, 194, 71)).toBe('#f9c247')
  })

  it('removeColor code===replaceWith 时抛错，不产生自毁数据', () => {
    const doc = createDocument({ name: 'v', width: 1, height: 1 })
    const layer = doc.frames[0].layers[0]
    layer.palette.a1 = { hex: '#ff0000' }
    layer.grid[0] = 'a1'
    expect(() => removeColor(layer, 'a1', 'a1')).toThrow()
    expect(layer.palette.a1).toEqual({ hex: '#ff0000' })
    expect(layer.grid[0]).toBe('a1')
  })

  it('removeColor replaceWith 既非透明码也不在 palette 时抛错', () => {
    const doc = createDocument({ name: 'v', width: 1, height: 1 })
    const layer = doc.frames[0].layers[0]
    layer.palette.a1 = { hex: '#ff0000' }
    layer.grid[0] = 'a1'
    expect(() => removeColor(layer, 'a1', 'zz')).toThrow()
    expect(layer.palette.a1).toEqual({ hex: '#ff0000' })
  })

  it('removeColor code 不在 palette 时抛错', () => {
    const doc = createDocument({ name: 'v', width: 1, height: 1 })
    expect(() => removeColor(doc.frames[0].layers[0], 'zz', '..')).toThrow()
  })
})
