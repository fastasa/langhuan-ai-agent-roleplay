import { describe, expect, it, vi } from 'vitest'
import { shoelace } from '../../../src/app/mapGeometry.ts'
import { buildWaterDotMatrix } from '../../../src/app/mapArmor/dotMatrix.ts'
import { collectRiverAnchorCandidates } from '../../../src/app/mapArmor/riverAnchors.ts'
import { expandWaterArmor } from '../../../src/app/mapArmor/waterArmor.ts'
import { autoConnectRiverEndpoints, collectWaterConnectionTargets } from '../../../src/app/mapArmor/waterConnections.ts'
import { runWaterPainter } from '../../../src/app/mapArmor/waterPainter.ts'
import { runWaterArmorWork } from '../../../src/app/mapArmor/waterOrchestration.ts'

function feature(overrides = {}) {
  return {
    id: 'f1', sheetId: 's1', worldId: 'w1', kind: 'region', category: 'water', name: '水域', layer: 'terrain',
    geometry: { pts: [[0, 0], [10_000, 0], [10_000, 10_000], [0, 10_000]] }, meta: {}, ...overrides
  }
}

describe('water armor pure protocol', () => {
  it('湖泊和海洋共用确定性展开，外浅内深且深水层严格缩小', () => {
    const outline = [[0, 0], [12_000, 0], [18_000, 5000], [14_000, 13_000], [5000, 16_000], [-2000, 8000]]
    const params = { waterKind: 'lake', maxDepthM: 120, shoreShelfRatio: 0.2, depthCurve: 1.1, ruggedness: 0.25, layers: 3 }
    const first = expandWaterArmor(outline, params, 42)
    expect(expandWaterArmor(outline, params, 42)).toEqual(first)
    expect(first.layers).toHaveLength(3)
    expect(first.layers.map((layer) => layer.depthM)).toEqual([...first.layers.map((layer) => layer.depthM)].sort((a, b) => a - b))
    const areas = first.layers.map((layer) => shoelace(layer.pts))
    expect(areas).toEqual([...areas].sort((a, b) => b - a))
    expect(first.layers[0].role).toBe('surface')
    expect(first.resolvedParams.maxDepthM).toBe(120)
  })

  it('河流候选和连接目标只认水体 surface，不把深水内层重复暴露给模型', () => {
    const surface = feature({ id: 'lake', name: '镜湖', meta: { armor: { type: 'water', groupId: 'wg', role: 'surface', layerIndex: 0 } } })
    const depth = feature({ id: 'lake-depth', name: '镜湖·深水1', geometry: { pts: [[2000, 2000], [8000, 2000], [8000, 8000], [2000, 8000]] }, meta: { armor: { type: 'water', groupId: 'wg', role: 'depth-band', layerIndex: 1 } } })
    expect(collectWaterConnectionTargets([surface, depth]).map((item) => item.featureId)).toEqual(['lake'])
    expect(collectRiverAnchorCandidates([surface, depth]).filter((item) => item.category === 'water')).toHaveLength(2)
  })

  it('自由河端只差小段距离时补到水面内部，超过阈值不乱接', () => {
    const target = { featureId: 'lake', name: '镜湖', pts: [[1000, -1000], [5000, -1000], [5000, 1000], [1000, 1000]] }
    const connected = autoConnectRiverEndpoints([[-5000, 0], [600, 0]], [target], 500)
    expect(connected.mouth?.target.featureId).toBe('lake')
    expect(connected.spine.at(-1)[0]).toBeGreaterThan(999)
    const far = autoConnectRiverEndpoints([[-5000, 0], [0, 0]], [target], 500)
    expect(far.mouth).toBeUndefined()
  })

  it('水体画师验证最后一点回首点的闭合边，失败后可重试', async () => {
    const projection = buildWaterDotMatrix({ framePts: [[0, 0], [40_000, 0], [40_000, 40_000], [0, 40_000]], waterRegions: [], gridN: 21 })
    const callModel = vi.fn()
      .mockResolvedValueOnce('{"outline":{"points":[[0,1],[1,18],[18,18],[18,1],[9,9]]},"params":{"waterKind":"lake"}}')
      .mockResolvedValueOnce('{"outline":{"type":"smooth","points":[[5,6],[5,15],[9,18],[16,15],[17,7],[10,4]]},"params":{"waterKind":"lake","maxDepthM":80},"name":"镜湖"}')
    const result = await runWaterPainter({ task: '画湖', projection, waterKind: 'lake', callModel })
    expect(result.ok, result.error).toBe(true)
    expect(result.attempts).toBe(2)
  })
})

describe('runWaterArmorWork', () => {
  it('审阅展示真实深度层，确认后同批保存水体并接通近距自由河口', async () => {
    const grass = feature({ id: 'grass', name: '平原', category: 'grass', geometry: { pts: [[0, 0], [100_000, 0], [100_000, 100_000], [0, 100_000]] } })
    const river = feature({
      id: 'river', name: '青河', kind: 'path', category: 'river',
      geometry: { pts: [[20_000, 35_000], [34_500, 35_000]] },
      meta: { armor: { type: 'river', spine: [[20_000, 35_000], [34_500, 35_000]], params: { sourceWidthM: 20, mouthWidthM: 120 }, seed: 9, anchors: {} } }
    })
    const sheet = { id: 's1', worldId: 'w1', name: '主图', explored: null, features: [grass, river] }
    const bundle = { world: { id: 'w1', name: '世界' }, defaultMapSheetId: 's1', sheets: [sheet] }
    const saveFeatures = vi.fn(async () => [])
    const reviewDraft = vi.fn(async (request) => {
      expect(request.items[0].previewFeatures.filter((item) => item.category === 'water')).toHaveLength(3)
      expect(request.items[0].previewFeatures.map((item) => item.waterDepthRatio)).toEqual(expect.arrayContaining([1]))
      expect(request.items[0].previewFeatures.find((item) => item.category === 'river').bank.length).toBeGreaterThan(3)
      return { status: 'submitted', decision: { confirmed: [request.items[0].id], modified: [], deleted: [], comments: {} } }
    })
    const callModel = vi.fn(async () => '{"outline":{"type":"smooth","points":[[15,15],[15,20],[15,25],[20,27],[25,25],[25,20],[25,15],[20,13]]},"params":{"waterKind":"lake","maxDepthM":100,"connectionGapM":1500},"name":"镜湖"}')
    const result = await runWaterArmorWork({
      worldId: 'w1', task: '在平原内画镜湖', waterKind: 'lake', callModel,
      deps: { fetchBundle: vi.fn(async () => bundle), saveFeatures, reviewDraft }
    })
    expect(result.ok, result.error).toBe(true)
    const items = saveFeatures.mock.calls[0][1]
    expect(items.filter((item) => item.category === 'water')).toHaveLength(3)
    const riverUpdate = items.find((item) => item.id === 'river')
    expect(riverUpdate.meta.armor.anchors.mouth.autoConnected).toBe(true)
    expect(riverUpdate.meta.armor.spine.at(-1)).not.toEqual([34_500, 35_000])
  })
})
