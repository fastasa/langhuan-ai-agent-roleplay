import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../src/repositories/chatRepository', () => ({
  saveWorldMapFeaturesRemote: vi.fn(async () => [])
}))
vi.mock('../../../src/app/mapTerrainRevision', () => ({ bumpTerrainRevision: vi.fn() }))

import { expandMountainArmor } from '../../../src/app/mapArmor/mountainArmor'
import { expandRiverArmor } from '../../../src/app/mapArmor/riverArmor'
import { expandWaterArmor } from '../../../src/app/mapArmor/waterArmor'
import {
  buildMapTerrainEdit,
  createMapTerrainEditSession,
  saveMapTerrainEdit
} from '../../../src/app/mapTerrainEditing'
import { saveWorldMapFeaturesRemote } from '../../../src/repositories/chatRepository'
import { bumpTerrainRevision } from '../../../src/app/mapTerrainRevision'

function record(overrides = {}) {
  return {
    id: 'f1', sheetId: 's1', worldId: 'w1', kind: 'region', category: 'grass', name: '草原', layer: 'terrain',
    geometry: { pts: [[0, 0], [10, 0], [10, 10]] }, meta: {}, ...overrides
  }
}

describe('mapTerrainEditing', () => {
  beforeEach(() => {
    vi.mocked(saveWorldMapFeaturesRemote).mockClear()
    vi.mocked(bumpTerrainRevision).mockClear()
  })

  it('把整座山脉作为一个逻辑对象选择，并在未改参数时逐点保持旧版轮廓', () => {
    const skeleton = [[0, 0], [7000, 2500], [14000, 0]]
    const params = { steepness: 0.4 }
    const seed = 42
    const expansion = expandMountainArmor(skeleton, params, seed)
    const groupId = 'armor-group-1'
    const records = expansion.features.map((feature, index) => record({
      id: `m${index + 1}`,
      category: 'mountain',
      name: `玄岳·${feature.name}`,
      geometry: { pts: feature.pts, ...(feature.spine ? { spine: feature.spine } : {}), elevationM: feature.elevationM },
      meta: { armor: { type: 'mountain', groupId, skeleton, params, seed } }
    }))

    const selected = createMapTerrainEditSession([...records].reverse(), 'm2')
    expect(selected.ok).toBe(true)
    expect(selected.session.featureIds).toEqual(['m1', 'm2', 'm3'])

    const built = buildMapTerrainEdit(selected.session)
    expect(built.previewFeatures.map((feature) => feature.pts)).toEqual(expansion.features.map((feature) => feature.pts))
    expect(built.items[0].meta.armor).toMatchObject({ version: 2, noiseSkip: 2, params: expansion.resolvedParams })
  })

  it('山脉参数变化实时重展开整组，但不允许在非原子协议下改变层数', () => {
    const skeleton = [[0, 0], [10000, 0]]
    const seed = 8
    const expansion = expandMountainArmor(skeleton, { peakElevationM: 1800 }, seed)
    const records = expansion.features.map((feature, index) => record({
      id: `m${index}`,
      category: 'mountain',
      name: `长岭·${feature.name}`,
      geometry: { pts: feature.pts, elevationM: feature.elevationM },
      meta: { armor: { type: 'mountain', groupId: 'g1', skeleton, params: { peakElevationM: 1800 }, seed } }
    }))
    const selected = createMapTerrainEditSession(records, 'm0')
    selected.session.values.baseWidthM = 8000
    const built = buildMapTerrainEdit(selected.session)
    expect(built.items).toHaveLength(3)
    expect(built.items[0].geometry.pts).not.toEqual(expansion.features[0].pts)

    selected.session.values.layers = 2
    expect(() => buildMapTerrainEdit(selected.session)).toThrow(/不改变山脉层数/)
  })

  it('草原可调整中心、尺寸、自然度，并生成单要素预览', () => {
    const grass = record({
      id: 'grass1', name: '中央草原',
      meta: { armor: { type: 'grass', groupId: 'gg', seed: 7, params: { center: [1000, 2000], widthM: 12000, heightM: 9000, shape: 'organic', ruggedness: 0.2 } } }
    })
    const selected = createMapTerrainEditSession([grass], 'grass1')
    expect(selected.ok).toBe(true)
    selected.session.values.widthM = 18000
    selected.session.values.shape = 'exact'
    const built = buildMapTerrainEdit(selected.session)
    expect(built.previewFeatures).toHaveLength(1)
    expect(built.items[0]).toMatchObject({ id: 'grass1', name: '中央草原' })
    expect(built.items[0].meta.armor.params).toMatchObject({ widthM: 18000, shape: 'exact' })
  })

  it('河流复用统一控制点编辑，调整脊线与宽度后实时重派生河岸并只写回 armor 真值', () => {
    const spine = [[0, 0], [10_000, 2000], [20_000, 0]]
    const params = { sourceWidthM: 20, mouthWidthM: 300, growthExponent: 0.5, bankRoughness: 0.1, mouthCap: 'flat', mouthFlareRatio: 5 }
    const expansion = expandRiverArmor(spine, params, 9)
    const river = record({
      id: 'river1', kind: 'path', category: 'river', name: '青河',
      geometry: { pts: expansion.projectedSpine },
      meta: { armor: { type: 'river', groupId: 'river-g', spine, params, seed: 9 } }
    })
    const selected = createMapTerrainEditSession([river], 'river1')
    expect(selected.ok).toBe(true)
    expect(selected.session.geometry).toMatchObject({ target: 'river-spine', topology: 'open' })
    selected.session.geometry.points[1] = [10_000, 5000]
    selected.session.values.mouthWidthM = 600
    const built = buildMapTerrainEdit(selected.session)
    expect(built.previewFeatures[0].bank.length).toBeGreaterThan(3)
    expect(built.items[0].meta.armor).toMatchObject({ type: 'river', spine: [[0, 0], [10_000, 5000], [20_000, 0]], params: { mouthWidthM: 600 } })
    expect(built.items[0].meta.shape).toBeUndefined()
    expect(built.items[0].geometry.bank).toBeUndefined()
  })

  it('水体按组编辑外轮廓与深度参数，实时重建浅水到深水层', () => {
    const outline = [[0, 0], [12_000, 0], [18_000, 5000], [14_000, 13_000], [5000, 16_000], [-2000, 8000]]
    const params = { waterKind: 'lake', maxDepthM: 100, shoreShelfRatio: 0.2, depthCurve: 1.1, ruggedness: 0.2, layers: 3, connectionGapM: 300 }
    const expansion = expandWaterArmor(outline, params, 11)
    const records = expansion.layers.map((layer, index) => record({
      id: `water-${index}`, category: 'water', name: index ? `镜湖·深水${index}` : '镜湖',
      geometry: { pts: layer.pts, depthM: layer.depthM },
      meta: { armor: { type: 'water', groupId: 'wg', outline, params, seed: 11, role: layer.role, layerIndex: index, depthRatio: layer.depthRatio } }
    }))
    const riverSpine = [[-8000, 8000], [1000, 8000]]
    const riverExpansion = expandRiverArmor(riverSpine, { sourceWidthM: 10, mouthWidthM: 80 }, 7)
    const river = record({
      id: 'river-linked', kind: 'path', category: 'river', name: '入湖河', geometry: { pts: riverExpansion.projectedSpine },
      meta: { armor: { type: 'river', spine: riverSpine, params: riverExpansion.resolvedParams, seed: 7, anchors: { mouth: { featureId: 'water-0', point: riverSpine.at(-1) } } } }
    })
    const selected = createMapTerrainEditSession([...records, river], 'water-2')
    expect(selected.ok).toBe(true)
    expect(selected.session.geometry).toMatchObject({ target: 'water-outline', topology: 'closed' })
    selected.session.values.maxDepthM = 220
    const built = buildMapTerrainEdit(selected.session)
    expect(built.previewFeatures.filter((item) => item.category === 'water')).toHaveLength(3)
    expect(built.items.find((item) => item.id === 'water-2').geometry.depthM).toBe(220)
    expect(built.items[0].meta.armor).toMatchObject({ type: 'water', params: { maxDepthM: 220 }, role: 'surface' })
    expect(built.items.find((item) => item.id === 'river-linked').meta.armor.anchors.mouth.featureId).toBe('water-0')
  })

  it('circle/ellipse/rect 复用结构化参数，polygon/path 直接编辑正式顶点真值', () => {
    const circle = record({
      id: 'circle1', name: '圆形草原',
      meta: { vectorPrimitive: { type: 'circle', center: [3000, 4000], radiusM: 5000 } }
    })
    const selected = createMapTerrainEditSession([circle], 'circle1')
    expect(selected.ok).toBe(true)
    selected.session.values.radiusM = 7000
    const built = buildMapTerrainEdit(selected.session)
    expect(built.items[0].meta.vectorPrimitive).toEqual({ type: 'circle', center: [3000, 4000], radiusM: 7000 })
    expect(built.items[0].geometry.pts).toHaveLength(64)

    const polygon = record({ id: 'poly', meta: { vectorPrimitive: { type: 'polygon', points: [[0, 0], [1000, 0], [0, 1000]] } } })
    const polygonSelection = createMapTerrainEditSession([polygon], 'poly')
    expect(polygonSelection.session.geometry).toMatchObject({ target: 'polygon-vertices', topology: 'closed' })
    polygonSelection.session.geometry.points[1] = [2000, 0]
    expect(buildMapTerrainEdit(polygonSelection.session).items[0].meta.vectorPrimitive.points[1]).toEqual([2000, 0])

    const path = record({ id: 'road', kind: 'path', category: 'road', layer: 'civic', meta: { vectorPrimitive: { type: 'path', points: [[0, 0], [1000, 0]] } } })
    const pathSelection = createMapTerrainEditSession([path], 'road')
    expect(pathSelection.session.geometry).toMatchObject({ target: 'path-vertices', topology: 'open' })
    pathSelection.session.geometry.points.push([2000, 500])
    expect(buildMapTerrainEdit(pathSelection.session).items[0].geometry.pts).toEqual([[0, 0], [1000, 0], [2000, 500]])

    const legacyPolygon = record({ id: 'legacy', geometry: { pts: [[0, 0], [1, 0], [1, 1]] }, meta: {} })
    expect(createMapTerrainEditSession([legacyPolygon], 'legacy')).toMatchObject({ ok: false, selectedFeatureIds: ['legacy'] })
  })

  it('拖动山脉统一骨架后重展开整组三层，并把新骨架写回 armor 真值', () => {
    const skeleton = [[0, 0], [5000, 2000], [10_000, 0]]
    const seed = 13
    const expansion = expandMountainArmor(skeleton, { peakElevationM: 2200, baseWidthM: 4000 }, seed)
    const records = expansion.features.map((feature, index) => record({
      id: `ridge-${index}`,
      category: 'mountain',
      name: `北岭·${feature.name}`,
      geometry: { pts: feature.pts, elevationM: feature.elevationM },
      meta: { armor: { type: 'mountain', groupId: 'ridge', skeleton, params: { peakElevationM: 2200, baseWidthM: 4000 }, seed } }
    }))
    const selected = createMapTerrainEditSession(records, 'ridge-1')
    selected.session.geometry.points[1] = [5000, 5000]
    const built = buildMapTerrainEdit(selected.session)
    expect(built.items).toHaveLength(3)
    expect(built.items[0].meta.armor.skeleton).toEqual([[0, 0], [5000, 5000], [10_000, 0]])
    expect(built.items[0].geometry.pts).not.toEqual(expansion.features[0].pts)
  })

  it('正式保存按一次批量更新写历史，并同步失效空间分析缓存', async () => {
    const circle = record({ id: 'circle1', meta: { vectorPrimitive: { type: 'circle', center: [0, 0], radiusM: 5000 } } })
    const selected = createMapTerrainEditSession([circle], 'circle1')
    const built = buildMapTerrainEdit(selected.session)
    await saveMapTerrainEdit('w1', selected.session, built)
    expect(saveWorldMapFeaturesRemote).toHaveBeenCalledWith('w1', built.items, expect.objectContaining({ runKey: expect.stringContaining('terrain-edit-'), runLabel: '编辑地图·草原' }))
    expect(bumpTerrainRevision).toHaveBeenCalledWith('w1')
  })
})
