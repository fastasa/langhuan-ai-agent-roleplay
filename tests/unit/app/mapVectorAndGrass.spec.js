import { describe, expect, it, vi } from 'vitest'
import { expandGrassArmor } from '../../../src/app/mapArmor/grassArmor.ts'
import { runGrassArmorWork } from '../../../src/app/mapArmor/armorOrchestration.ts'
import { compileVectorPrimitive } from '../../../src/app/mapDrawing/vectorPrimitive.ts'
import { runVectorPrimitiveWork } from '../../../src/app/mapDrawing/vectorOrchestration.ts'

function blankBundle() {
  return {
    world: { id: 'world-1', name: '空白世界' },
    sheets: [{ id: 'sheet-1', name: '主图', explored: null, features: [] }]
  }
}

describe('结构化矢量图元', () => {
  it('circle 保留规范图元真值，并确定性投影为单个 region', () => {
    const result = compileVectorPrimitive({
      primitive: { type: 'circle', center: [100, 200], radiusM: 5000 },
      category: 'grass',
      name: '正圆草原'
    })
    expect(result.kind).toBe('region')
    expect(result.category).toBe('grass')
    expect(result.primitive).toEqual({ type: 'circle', center: [100, 200], radiusM: 5000 })
    expect(result.pts).toHaveLength(64)
    expect(result.pts[0][0]).toBeCloseTo(100)
    expect(result.pts[0][1]).toBeCloseTo(-4800)
  })

  it('rect/polygon/path 分别映射为正确 kind，非法参数显式失败', () => {
    expect(compileVectorPrimitive({ primitive: { type: 'rect', center: [0, 0], widthM: 10, heightM: 20 }, category: 'grass' }).kind).toBe('region')
    expect(compileVectorPrimitive({ primitive: { type: 'polygon', points: [[0, 0], [10, 0], [0, 10]] }, category: 'grass' }).kind).toBe('region')
    expect(compileVectorPrimitive({ primitive: { type: 'path', points: [[0, 0], [10, 0]] }, category: 'road' }).kind).toBe('path')
    expect(() => compileVectorPrimitive({ primitive: { type: 'circle', center: [0, 0], radiusM: 0 }, category: 'grass' })).toThrow()
    expect(() => compileVectorPrimitive({ primitive: { type: 'path', points: [[0, 0], [10, 0]] }, category: 'mountain' })).toThrow(/armor/)
    expect(() => compileVectorPrimitive({ primitive: { type: 'path', points: [[0, 0], [10, 0]] }, category: 'grass' })).toThrow(/正式 kind 是 region/)
    expect(() => compileVectorPrimitive({ primitive: { type: 'polygon', points: [[0, 0], [10, 0], [0, 10]] }, category: 'road' })).toThrow(/正式 kind 是 path/)
  })

  it('空图上直画正圆草原：默认以 100km 工作框中心为圆心，只落一件并持久化 primitive', async () => {
    const fetchBundle = vi.fn().mockResolvedValue(blankBundle())
    const saveFeatures = vi.fn().mockResolvedValue([{ id: 'feature-1' }])
    const result = await runVectorPrimitiveWork({
      worldId: 'world-1', shape: 'circle', category: 'grass', name: '中央草原', radiusM: 12_000,
      deps: { fetchBundle, saveFeatures }
    })
    expect(result.ok).toBe(true)
    expect(result.featureId).toBe('feature-1')
    const item = saveFeatures.mock.calls[0][1][0]
    expect(item.kind).toBe('region')
    expect(item.category).toBe('grass')
    expect(item.geometry.pts).toHaveLength(64)
    expect(item.meta.vectorPrimitive).toEqual({ type: 'circle', center: [0, 0], radiusM: 12_000 })
    expect(item.meta.drawTrace.kind).toBe('vector-primitive')
    expect(result.trace.steps.map((step) => step.key)).toEqual(['task-frame', 'compile', 'final-geometry-validation', 'save-validation', 'save-result'])
  })

  it('inside 的任意 path 坐标越过当前内容任务域时硬拒，不写库', async () => {
    const fetchBundle = vi.fn().mockResolvedValue({
      world: { id: 'world-1', name: '测试世界' },
      sheets: [{
        id: 'sheet-1', name: '主图', features: [{
          id: 'grass-1', kind: 'region', category: 'grass', name: '中央草原',
          geometry: { pts: [[-10_000, -10_000], [10_000, -10_000], [10_000, 10_000], [-10_000, 10_000]] }
        }]
      }]
    })
    const saveFeatures = vi.fn()
    const result = await runVectorPrimitiveWork({
      worldId: 'world-1', shape: 'path', category: 'road', name: '越界道路',
      pointsRelativeM: [[-60_000, -55_000], [60_000, 55_000]],
      deps: { fetchBundle, saveFeatures }
    })
    expect(result.ok).toBe(false)
    expect(result.error).toContain('最终图元占地校验失败')
    expect(saveFeatures).not.toHaveBeenCalled()
  })

  it('显式 expand 会在锚点东侧建立独立任务域，允许受控扩图', async () => {
    const fetchBundle = vi.fn().mockResolvedValue({
      world: { id: 'world-1', name: '测试世界' },
      sheets: [{
        id: 'sheet-1', name: '主图', features: [{
          id: 'grass-1', kind: 'region', category: 'grass', name: '中央草原',
          geometry: { pts: [[-10_000, -10_000], [10_000, -10_000], [10_000, 10_000], [-10_000, 10_000]] }
        }]
      }]
    })
    const saveFeatures = vi.fn().mockResolvedValue([{ id: 'forest-east' }])
    const result = await runVectorPrimitiveWork({
      worldId: 'world-1', shape: 'circle', category: 'forest', name: '东部森林', radiusM: 5_000,
      placement: { mode: 'expand', anchorFeature: '中央草原', direction: 'east', widthM: 10_000, heightM: 10_000 },
      deps: { fetchBundle, saveFeatures }
    })
    expect(result.ok).toBe(true)
    const primitive = saveFeatures.mock.calls[0][1][0].meta.vectorPrimitive
    expect(primitive.center).toEqual([15_000, 0])
    expect(saveFeatures.mock.calls[0][1][0].meta.placement.mode).toBe('expand')
  })

  it('最终矢量先交地图审阅，确认后才写入正式要素', async () => {
    const bundle = blankBundle()
    const fetchBundle = vi.fn().mockResolvedValue(bundle)
    const saveFeatures = vi.fn().mockResolvedValue([{ id: 'feature-reviewed' }])
    const reviewDraft = vi.fn(async (request) => ({
      status: 'submitted',
      decision: { confirmed: [request.items[0].id], modified: [], deleted: [], comments: {} }
    }))
    const result = await runVectorPrimitiveWork({
      worldId: 'world-1', shape: 'circle', category: 'grass', name: '审阅圆', radiusM: 5_000,
      deps: { fetchBundle, saveFeatures, reviewDraft }
    })
    expect(reviewDraft).toHaveBeenCalledTimes(1)
    expect(reviewDraft.mock.calls[0][0].items[0].previewFeatures[0].pts).toHaveLength(64)
    expect(fetchBundle).toHaveBeenCalledTimes(2)
    expect(saveFeatures).toHaveBeenCalledTimes(1)
    expect(result.reviewStatus).toBe('confirmed')
    expect(saveFeatures.mock.calls[0][1][0].style.rough).toEqual({ iter: 0, amp: 0 })
    expect(saveFeatures.mock.calls[0][1][0].meta.draftReview).toEqual({ decision: 'confirmed' })
  })
})

describe('草原装甲', () => {
  it('同 seed 同参数逐字节一致，且无论形状都只产出一个 grass region', () => {
    const params = { center: [0, 0], widthM: 30_000, heightM: 20_000, shape: 'organic', ruggedness: 0.5 }
    const a = expandGrassArmor(params, 42)
    const b = expandGrassArmor(params, 42)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
    expect(a.feature.kind).toBe('region')
    expect(a.feature.category).toBe('grass')
    expect(a.feature.pts).toHaveLength(64)
  })

  it('空图可直接画草原，不要求 explored，不生成底层陆地', async () => {
    const fetchBundle = vi.fn().mockResolvedValue(blankBundle())
    const saveFeatures = vi.fn().mockResolvedValue([])
    const result = await runGrassArmorWork({
      worldId: 'world-1', name: '新月草原', widthM: 40_000, heightM: 40_000, shape: 'exact', seed: 7,
      deps: { fetchBundle, saveFeatures }
    })
    expect(result.ok).toBe(true)
    expect(saveFeatures).toHaveBeenCalledTimes(1)
    const items = saveFeatures.mock.calls[0][1]
    expect(items).toHaveLength(1)
    expect(items[0].category).toBe('grass')
    expect(items[0].meta.armor.type).toBe('grass')
    expect(items[0].meta.armor.resolvedParams.center).toEqual([0, 0])
    expect(items[0].meta.drawTrace.kind).toBe('grass-armor')
    expect(result.trace.steps.map((step) => step.key)).toEqual(['task-frame', 'armor-expansion', 'final-geometry-validation', 'save-validation', 'save-result'])
  })

  it('用户要求修改草原时保留逐项意见但不写库', async () => {
    const fetchBundle = vi.fn().mockResolvedValue(blankBundle())
    const saveFeatures = vi.fn()
    const result = await runGrassArmorWork({
      worldId: 'world-1', name: '待改草原', widthM: 20_000, heightM: 10_000, seed: 9,
      deps: {
        fetchBundle,
        saveFeatures,
        reviewDraft: async (request) => ({
          status: 'submitted',
          decision: { confirmed: [], modified: [request.items[0].id], deleted: [], comments: { [request.items[0].id]: '东西向拉长一倍' } }
        })
      }
    })
    expect(result.ok).toBe(false)
    expect(result.reviewStatus).toBe('modify')
    expect(result.reviewFeedback).toBe('东西向拉长一倍')
    expect(saveFeatures).not.toHaveBeenCalled()
  })
})
