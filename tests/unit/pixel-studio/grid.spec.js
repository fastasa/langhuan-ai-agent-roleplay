import { describe, expect, it } from 'vitest'
import {
  getCell,
  setCells,
  rasterLine,
  rasterRect,
  rasterEllipse,
  rasterBrush,
  replaceCode
} from '@/pixel-studio/core/grid'

describe('pixel-studio/core/grid', () => {
  it('getCell 读取指定格子', () => {
    const frame = { id: 'f1', durationMs: 200, grid: ['a1a2..', '..b1b2'] }
    expect(getCell(frame, 3, 0, 0)).toBe('a1')
    expect(getCell(frame, 3, 1, 0)).toBe('a2')
    expect(getCell(frame, 3, 2, 1)).toBe('b2')
  })

  it('setCells 写入格子，越界格静默跳过', () => {
    const frame = { id: 'f1', durationMs: 200, grid: ['....', '....'] }
    setCells(frame, 2, [{ x: 0, y: 0 }, { x: 5, y: 5 }, { x: -1, y: 0 }, { x: 1, y: 1 }], 'a1')
    expect(frame.grid).toEqual(['a1..', '..a1'])
  })

  it('rasterLine 输出 Bresenham 直线格点，含首尾', () => {
    const points = rasterLine(0, 0, 3, 0)
    expect(points).toEqual([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }])
  })

  it('rasterLine 支持对角线', () => {
    const points = rasterLine(0, 0, 2, 2)
    expect(points).toEqual([{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }])
  })

  it('rasterRect 描边只覆盖边框', () => {
    const points = rasterRect(0, 0, 2, 2, false)
    const keys = points.map((p) => `${p.x},${p.y}`).sort()
    // 3x3 边框应为 8 格（去掉中心）
    expect(keys).toHaveLength(8)
    expect(keys).not.toContain('1,1')
  })

  it('rasterRect 填充覆盖整个矩形', () => {
    const points = rasterRect(0, 0, 1, 1, true)
    const keys = points.map((p) => `${p.x},${p.y}`).sort()
    expect(keys.sort()).toEqual(['0,0', '0,1', '1,0', '1,1'])
  })

  it('rasterEllipse 填充覆盖近似圆形区域（3x3 应含中心与四邻）', () => {
    const points = rasterEllipse(0, 0, 2, 2, true)
    const keys = new Set(points.map((p) => `${p.x},${p.y}`))
    expect(keys.has('1,1')).toBe(true) // 中心
    expect(keys.has('0,0')).toBe(false) // 角落应被椭圆排除
  })

  it('rasterEllipse 退化为单行时覆盖整行', () => {
    const points = rasterEllipse(0, 0, 3, 0, true)
    const keys = points.map((p) => `${p.x},${p.y}`).sort()
    expect(keys).toEqual([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }].map((p) => `${p.x},${p.y}`).sort())
  })

  it('rasterBrush size=1 只覆盖单格', () => {
    expect(rasterBrush(5, 5, 1)).toEqual([{ x: 5, y: 5 }])
  })

  it('rasterBrush size=2 覆盖 2x2 且中心对齐在 (x,y) 起始', () => {
    const points = rasterBrush(5, 5, 2)
    const keys = points.map((p) => `${p.x},${p.y}`).sort()
    expect(keys.sort()).toEqual(['5,5', '5,6', '6,5', '6,6'])
  })

  it('rasterBrush size=3 以 (x,y) 为中心覆盖 3x3', () => {
    const points = rasterBrush(5, 5, 3)
    expect(points).toHaveLength(9)
    const keys = new Set(points.map((p) => `${p.x},${p.y}`))
    expect(keys.has('5,5')).toBe(true)
    expect(keys.has('4,4')).toBe(true)
    expect(keys.has('6,6')).toBe(true)
  })

  it('rasterBrush size=4 覆盖 4x4', () => {
    const points = rasterBrush(5, 5, 4)
    expect(points).toHaveLength(16)
  })

  it('rasterBrush size>4（放宽到 1~32）以 (x,y) 为中心覆盖对应正方形，如 size=12 覆盖 12x12', () => {
    const points = rasterBrush(10, 10, 12)
    expect(points).toHaveLength(144)
    const keys = new Set(points.map((p) => `${p.x},${p.y}`))
    expect(keys.has('10,10')).toBe(true)
    expect(keys.has('5,5')).toBe(true)
    expect(keys.has('16,16')).toBe(true)
    expect(keys.has('4,4')).toBe(false)
  })

  it('replaceCode 整帧替换并返回改动格数', () => {
    const frame = { id: 'f1', durationMs: 200, grid: ['a1a1..', 'a1..a1'] }
    const count = replaceCode(frame, 'a1', 'b2')
    expect(count).toBe(4)
    expect(frame.grid).toEqual(['b2b2..', 'b2..b2'])
  })
})
