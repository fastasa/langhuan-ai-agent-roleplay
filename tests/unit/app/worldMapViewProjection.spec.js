import { describe, expect, it } from 'vitest'
import {
  deriveWorldMapFeatureBank,
  orderWorldMapFeaturesForRender,
  projectWorldMapSheet
} from '../../../src/app/worldMapViewProjection.ts'

function record(id, elevationM, overrides = {}) {
  return {
    id,
    sheetId: 'sheet_1',
    worldId: 'world_1',
    kind: 'region',
    category: 'mountain',
    name: id,
    layer: 'terrain',
    geometry: { pts: [[0, 0], [10, 0], [0, 10]], elevationM },
    meta: { armor: { type: 'mountain', groupId: 'mountain_1' } },
    ...overrides
  }
}

describe('worldMapViewProjection mountain render order', () => {
  it('同组山脉无论数据库 id 顺序如何，正式投影都按低海拔到高海拔绘制', () => {
    const middle = record('中层', 1855)
    const low = record('外层', 927.5)
    const high = record('峰线', 2650)
    const source = [middle, low, high]

    expect(orderWorldMapFeaturesForRender(source).map((item) => item.id)).toEqual(['外层', '中层', '峰线'])
    expect(source.map((item) => item.id)).toEqual(['中层', '外层', '峰线'])

    const sheet = { id: 'sheet_1', worldId: 'world_1', name: '主图', explored: null, features: source }
    const bundle = { world: { id: 'world_1', name: '世界' }, defaultMapSheetId: 'sheet_1', sheets: [sheet] }
    expect(projectWorldMapSheet(bundle, sheet).features.map((item) => item.id)).toEqual(['外层', '中层', '峰线'])
  })

  it('不重排无装甲组的普通要素，并用层名称兼容缺少海拔的旧山脉', () => {
    const plainA = record('普通甲', 300, { category: 'grass', meta: {} })
    const ridge = record('旧岭·山脊带', undefined)
    const body = record('旧岭·主山体', undefined)
    const peak = record('旧岭·峰线', undefined)
    const plainB = record('普通乙', 100, { category: 'water', meta: {} })

    expect(orderWorldMapFeaturesForRender([plainA, ridge, body, peak, plainB]).map((item) => item.id))
      .toEqual(['普通甲', '旧岭·主山体', '旧岭·山脊带', '旧岭·峰线', '普通乙'])
  })
})

describe('worldMapViewProjection river bank', () => {
  it('新河流从 meta.armor 参数派生河岸，旧 meta.shape 仍只读兼容', () => {
    const river = record('river', undefined, {
      kind: 'path', category: 'river', name: '青河',
      geometry: { pts: [[0, 0], [10_000, 1000], [20_000, 0]] },
      meta: { armor: { type: 'river', seed: 7, params: { sourceWidthM: 20, mouthWidthM: 300, growthExponent: 0.5, bankRoughness: 0.1 } } }
    })
    expect(deriveWorldMapFeatureBank(river).length).toBeGreaterThan(3)
    expect(deriveWorldMapFeatureBank({ ...river, meta: {} })).toBeUndefined()
  })
})

describe('worldMapViewProjection water depth', () => {
  it('同组水体按 surface 到深水层绘制，并把深度比例投影给画布', () => {
    const deep = record('deep', undefined, { category: 'water', geometry: { pts: [[3, 3], [7, 3], [3, 7]], depthM: 100 }, meta: { armor: { type: 'water', groupId: 'wg', role: 'depth-band', layerIndex: 2, depthRatio: 1 } } })
    const surface = record('surface', undefined, { category: 'water', geometry: { pts: [[0, 0], [10, 0], [0, 10]], depthM: 8 }, meta: { armor: { type: 'water', groupId: 'wg', role: 'surface', layerIndex: 0, depthRatio: 0.08 } } })
    const middle = record('middle', undefined, { category: 'water', geometry: { pts: [[2, 2], [8, 2], [2, 8]], depthM: 45 }, meta: { armor: { type: 'water', groupId: 'wg', role: 'depth-band', layerIndex: 1, depthRatio: 0.45 } } })
    expect(orderWorldMapFeaturesForRender([deep, surface, middle]).map((item) => item.id)).toEqual(['surface', 'middle', 'deep'])
    const sheet = { id: 'sheet_1', worldId: 'world_1', name: '主图', explored: null, features: [deep, surface, middle] }
    const bundle = { world: { id: 'world_1', name: '世界' }, defaultMapSheetId: 'sheet_1', sheets: [sheet] }
    const projected = projectWorldMapSheet(bundle, sheet).features
    expect(projected.map((item) => item.waterDepthRatio)).toEqual([0.08, 0.45, 1])
    expect(projected.map((item) => item.waterRole)).toEqual(['surface', 'depth-band', 'depth-band'])
  })
})
