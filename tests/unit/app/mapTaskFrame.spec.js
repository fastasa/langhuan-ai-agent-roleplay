import { describe, expect, it } from 'vitest'
import { computeMapTaskFrame, DEFAULT_EMPTY_MAP_SPAN_M } from '../../../src/app/mapTaskFrame.ts'

describe('mapTaskFrame', () => {
  it('空图返回 100km 初始观察窗，但标记为派生空框', () => {
    const frame = computeMapTaskFrame([])
    expect(frame.empty).toBe(true)
    expect(frame.widthM).toBe(DEFAULT_EMPTY_MAP_SPAN_M)
    expect(frame.heightM).toBe(DEFAULT_EMPTY_MAP_SPAN_M)
    expect(frame.center).toEqual([0, 0])
  })

  it('有内容时按内容边界加留白，不读取 explored', () => {
    const frame = computeMapTaskFrame([[[0, 0], [10_000, 0], [10_000, 5_000], [0, 5_000]]], {
      paddingRatio: 0.1,
      minPaddingM: 0
    })
    expect(frame.empty).toBe(false)
    expect(frame.minX).toBe(-1_000)
    expect(frame.maxX).toBe(11_000)
    expect(frame.minY).toBe(-1_000)
    expect(frame.maxY).toBe(6_000)
  })

  it('单点内容仍给最小可操作范围', () => {
    const frame = computeMapTaskFrame([[[20, 30]]], { minSpanM: 1_000, minPaddingM: 100, paddingRatio: 0 })
    expect(frame.center).toEqual([20, 30])
    expect(frame.widthM).toBe(1_200)
    expect(frame.heightM).toBe(1_200)
  })
})
