import { describe, expect, it, vi } from 'vitest'
import { buildRiverDotMatrix } from '../../../src/app/mapArmor/dotMatrix.ts'
import { expandRiverArmor } from '../../../src/app/mapArmor/riverArmor.ts'
import {
  collectRiverAnchorCandidates,
  resolveRiverAnchorCandidate,
  snapRiverSpineToAnchors
} from '../../../src/app/mapArmor/riverAnchors.ts'
import { runRiverPainter } from '../../../src/app/mapArmor/riverPainter.ts'
import { runRiverArmorWork } from '../../../src/app/mapArmor/riverOrchestration.ts'

function feature(overrides = {}) {
  return {
    id: 'f1', sheetId: 's1', worldId: 'w1', kind: 'region', category: 'water', name: '水域', layer: 'terrain',
    geometry: { pts: [[0, 0], [10_000, 0], [10_000, 10_000], [0, 10_000]] }, meta: {}, ...overrides
  }
}

describe('river armor pure protocol', () => {
  it('同一脊线/参数/seed 恒定派生河岸，正式参数拒绝河口比源头更窄', () => {
    const spine = [[0, 0], [10_000, 2000], [20_000, 0]]
    const params = { sourceWidthM: 20, mouthWidthM: 300, growthExponent: 0.6, bankRoughness: 0.1 }
    const first = expandRiverArmor(spine, params, 42)
    const replay = expandRiverArmor(spine, params, 42)
    expect(replay).toEqual(first)
    expect(first.projectedSpine.length).toBeGreaterThan(spine.length)
    expect(first.bank.length).toBeGreaterThan(3)
    expect(first.resolvedParams).toMatchObject(params)
    expect(() => expandRiverArmor(spine, { sourceWidthM: 500, mouthWidthM: 100 }, 1)).toThrow(/河口宽度/)
  })

  it('收集山地/水域/既有河流语义候选，并把首尾精确吸附到目标几何', () => {
    const mountain = feature({
      id: 'mountain', name: '北岭', category: 'mountain',
      geometry: { pts: [[0, 0], [20_000, 0], [20_000, 20_000], [0, 20_000]], spine: [[5000, 5000], [15_000, 15_000]] },
      meta: { armor: { type: 'mountain', groupId: 'g1' } }
    })
    const sea = feature({ id: 'sea', name: '东海', geometry: { pts: [[80_000, 0], [100_000, 0], [100_000, 20_000], [80_000, 20_000]] } })
    const oldRiver = feature({ id: 'old-river', name: '旧河', kind: 'path', category: 'river', geometry: { pts: [[40_000, 0], [60_000, 10_000]] } })
    const candidates = collectRiverAnchorCandidates([mountain, sea, oldRiver])
    expect(candidates.filter((candidate) => candidate.role === 'source').map((candidate) => candidate.name)).toEqual(['北岭', '东海'])
    expect(candidates.filter((candidate) => candidate.role === 'mouth').map((candidate) => candidate.name)).toEqual(['东海', '旧河'])
    const source = resolveRiverAnchorCandidate(candidates, 'source', 'mountain')
    const mouth = resolveRiverAnchorCandidate(candidates, 'mouth', '东海')
    const snapped = snapRiverSpineToAnchors([[10_000, 0], [50_000, 5000], [85_000, 5000]], source, mouth)
    expect(snapped.spine[0]).toEqual([5000, 5000])
    expect(snapped.spine.at(-1)).toEqual([85_000, 0])
    expect(snapped.anchors).toMatchObject({ source: { featureId: 'mountain' }, mouth: { featureId: 'sea' } })
  })

  it('河流画师按准确 JSON/锚点/点阵协议校验，错误一次后可带原因重试', async () => {
    const projection = buildRiverDotMatrix({ framePts: [[0, 0], [40_000, 0], [40_000, 40_000], [0, 40_000]], gridN: 21 })
    const candidates = [{ id: 'S1', role: 'source', featureId: 'm1', name: '山', kind: 'region', category: 'mountain', point: [5000, 5000], targetPoints: [[0, 0], [10_000, 0], [0, 10_000]] }]
    const callModel = vi.fn()
      .mockResolvedValueOnce('{"stroke":{"points":[[5,5],[12,12]]},"sourceAnchor":"M9","mouthAnchor":null,"params":{},"name":"河"}')
      .mockResolvedValueOnce('{"stroke":{"type":"smooth","points":[[5,5],[12,12],[18,18]]},"sourceAnchor":"S1","mouthAnchor":null,"params":{"sourceWidthM":10,"mouthWidthM":100},"name":"河"}')
    const result = await runRiverPainter({ task: '画河', projection, candidates, requiredSourceAnchorId: 'S1', callModel })
    expect(result.ok, result.error).toBe(true)
    expect(result.attempts).toBe(2)
    expect(result.sourceAnchorId).toBe('S1')
    expect(result.attemptTrace[0].error).toMatch(/连接编号|源头/)
  })
})

describe('runRiverArmorWork', () => {
  it('经过语义吸附、真实河岸预览与确认后只保存 spine/params，不保存第二份 bank 真值', async () => {
    const mountain = feature({
      id: 'mountain', name: '北岭', category: 'mountain',
      geometry: { pts: [[0, 0], [20_000, 0], [20_000, 20_000], [0, 20_000]], spine: [[5000, 5000], [15_000, 15_000]] },
      meta: { armor: { type: 'mountain', groupId: 'g1' } }
    })
    const sea = feature({ id: 'sea', name: '东海', geometry: { pts: [[80_000, 0], [100_000, 0], [100_000, 20_000], [80_000, 20_000]] } })
    const sheet = { id: 's1', worldId: 'w1', name: '主图', explored: null, features: [mountain, sea] }
    const bundle = { world: { id: 'w1', name: '世界' }, defaultMapSheetId: 's1', sheets: [sheet] }
    const saveFeatures = vi.fn(async () => [])
    const reviewDraft = vi.fn(async (request) => {
      expect(request.items[0].previewFeatures[0].bank.length).toBeGreaterThan(3)
      return { status: 'submitted', decision: { confirmed: [request.items[0].id], modified: [], deleted: [], comments: {} } }
    })
    const callModel = vi.fn(async () => '{"stroke":{"type":"smooth","points":[[21,8],[19,16],[23,24],[21,34]]},"sourceAnchor":"S1","mouthAnchor":"M1","params":{"sourceWidthM":20,"mouthWidthM":300},"name":"青河"}')
    const result = await runRiverArmorWork({
      worldId: 'w1', task: '从北岭流入东海', sourceFeature: 'mountain', mouthFeature: 'sea', callModel,
      deps: { fetchBundle: vi.fn(async () => bundle), saveFeatures, reviewDraft }
    })
    expect(result.ok, result.error).toBe(true)
    expect(saveFeatures).toHaveBeenCalledTimes(1)
    const item = saveFeatures.mock.calls[0][1][0]
    expect(item).toMatchObject({ kind: 'path', category: 'river', name: '青河' })
    expect(item.meta.armor).toMatchObject({ type: 'river', anchors: { source: { featureId: 'mountain' }, mouth: { featureId: 'sea' } } })
    expect(item.meta.shape).toBeUndefined()
    expect(item.geometry.bank).toBeUndefined()
  })
})
