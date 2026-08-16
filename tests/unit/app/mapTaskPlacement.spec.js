import { describe, expect, it } from 'vitest'
import {
  resolveMapTaskPlacement,
  validatePointSetsInTaskPlacement
} from '../../../src/app/mapTaskPlacement.ts'

const GRASS = {
  id: 'grass-1', name: '中央草原', kind: 'region', category: 'grass',
  pts: [[-10_000, -8_000], [10_000, -8_000], [10_000, 8_000], [-10_000, 8_000]]
}

describe('mapTaskPlacement', () => {
  it('inside 缺省自动锚定唯一 region，任务域不超过草原且保留真实包含轮廓', () => {
    const placement = resolveMapTaskPlacement({ features: [GRASS] })
    expect(placement.mode).toBe('inside')
    expect(placement.source).toBe('single-region')
    expect(placement.anchor).toMatchObject({ id: 'grass-1', name: '中央草原' })
    expect(placement.frame.widthM).toBe(20_000)
    expect(placement.frame.heightM).toBe(16_000)
    expect(placement.containmentRegion).toEqual(GRASS.pts)
  })

  it('inside 的尺寸或偏移越过锚点时显式失败，不静默缩放', () => {
    expect(() => resolveMapTaskPlacement({ features: [GRASS], request: { widthM: 30_000 } })).toThrow(/超过锚点范围/)
    expect(() => resolveMapTaskPlacement({ features: [GRASS], request: { widthM: 10_000, heightM: 8_000, offsetXM: 8_000 } })).toThrow(/偏移后越过/)
  })

  it('expand 只有显式方向才成立，并把任务域放到锚点外而非扩大旧地图边界', () => {
    expect(() => resolveMapTaskPlacement({ features: [GRASS], request: { mode: 'expand' } })).toThrow(/必须明确 direction/)
    const placement = resolveMapTaskPlacement({
      features: [GRASS],
      request: { mode: 'expand', anchorFeature: '中央草原', direction: 'east', widthM: 6_000, heightM: 10_000, gapM: 2_000 }
    })
    expect(placement.frame.minX).toBe(12_000)
    expect(placement.frame.maxX).toBe(18_000)
    expect(placement.frame.center[1]).toBe(0)
    expect(placement.containmentRegion).toBeUndefined()
    expect(() => resolveMapTaskPlacement({
      features: [GRASS],
      request: { mode: 'expand', direction: 'east', widthM: 6_000, heightM: 10_000, offsetXM: -4_000 }
    })).toThrow(/退回锚点范围/)
  })

  it('最终几何同时检查矩形任务域与 inside 锚点真实轮廓', () => {
    const diamond = { ...GRASS, pts: [[0, -10_000], [10_000, 0], [0, 10_000], [-10_000, 0]] }
    const placement = resolveMapTaskPlacement({ features: [diamond] })
    expect(validatePointSetsInTaskPlacement([[[0, 0], [2_000, 0]]], placement).ok).toBe(true)
    const outsideDiamond = validatePointSetsInTaskPlacement([[[9_000, 9_000]]], placement)
    expect(outsideDiamond.ok).toBe(false)
    expect(outsideDiamond.reason).toContain('真实轮廓')
  })
})
