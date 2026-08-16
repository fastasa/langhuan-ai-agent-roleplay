import { describe, expect, it } from 'vitest'

// 宏笔刷四件生成器（地图分阶段作画与笔刷约束系统·批E·2026-07-12）：纯函数层断言——
// 同 seed 恒形/水系树顺流+宽度 meta 落位/城区街道贯穿+quarter 合理/城际遇水自动置桥+桥过硬门语义/要素量帽。
// 工具注册与阶段过滤断言在 huiyuSubagent.spec.js（buildHuiyuToolset 层）；画廊装配断言在 mapBrushShowcase.spec.js。

import {
  buildCityLayout,
  buildInterCityRoad,
  buildMountainChain,
  buildRiverSystem,
  CITY_LAYOUT_MAX_FEATURES,
  MOUNTAIN_CHAIN_MAX_FEATURES,
  RIVER_SYSTEM_MAX_FEATURES
} from '../../../src/app/mapMacroBrushes.ts'
import {
  buildAnalysisGrid,
  findContinuousWaterRuns,
  validateRiverPath,
  CELL_LAND
} from '../../../src/app/mapAnalysisGrid.ts'
import { pointInPoly, nearestPointOnPolyline, pathLength } from '../../../src/app/mapGeometry.ts'

function mkRegion(id, category, pts, elevationM, layer = 'terrain') {
  return { id, kind: 'region', category, name: id, layer, pts, elevationM }
}

/** 测试专用：点→格下标（与模块内部换算同一公式）。 */
function gridIndexOf(spec, x, y) {
  const col = Math.min(spec.n - 1, Math.max(0, Math.floor((x - spec.minX) / spec.cellSize)))
  const row = Math.min(spec.n - 1, Math.max(0, Math.floor((y - spec.minY) / spec.cellSize)))
  return row * spec.n + col
}

// ── 合成世界一（山地世界·水系树/城区用）：0..6400 域，n=64，cellSize=100 ──
// x<800 无要素覆盖=背景海；plain 覆盖 [800,6400] 全域；mountain 嵌套 plain 内部。
const HILL_SPEC = { n: 64, minX: 0, minY: 0, cellSize: 100 }
const HILL_FEATURES = [
  mkRegion('plain', 'grass', [[800, 0], [6400, 0], [6400, 6400], [800, 6400]], 80),
  mkRegion('mountain', 'mountain', [[4000, 1600], [5600, 1600], [5600, 3200], [4000, 3200]], 800)
]
const HILL_GRID = buildAnalysisGrid(HILL_FEATURES, HILL_SPEC)

// ── 合成世界二（海峡世界·城际道路用）：全域平原+中央纵向水带，跨海峡必须置桥 ──
const STRAIT_SPEC = { n: 64, minX: 0, minY: 0, cellSize: 100 }
const STRAIT_WATER_PTS = [[2900, 0], [3500, 0], [3500, 6400], [2900, 6400]]
const STRAIT_FEATURES = [
  mkRegion('plain', 'grass', [[0, 0], [6400, 0], [6400, 6400], [0, 6400]], 80),
  mkRegion('strait', 'water', STRAIT_WATER_PTS, 0)
]
const STRAIT_GRID = buildAnalysisGrid(STRAIT_FEATURES, STRAIT_SPEC)

describe('buildMountainChain（山脉链）', () => {
  const opts = {
    anchors: [[1500, 4200], [3000, 4600], [4400, 5400]],
    chainWidthM: 900,
    baseElevationM: 1200,
    namePrefix: '测试山系',
    seed: 'mtn-1'
  }

  it('同 seed 恒形：两次调用产物深度相等；换 seed 形状不同', () => {
    const a = buildMountainChain(opts)
    const b = buildMountainChain(opts)
    expect(a).toEqual(b)
    const c = buildMountainChain({ ...opts, seed: 'mtn-2' })
    expect(JSON.stringify(c.features)).not.toBe(JSON.stringify(a.features))
  })

  it('结构：底座+核心恒在；核心全部顶点裁进底座内（clipPolygonToParent 构造性嵌套）；核心海拔>底座', () => {
    const result = buildMountainChain(opts)
    const base = result.features.find((f) => f.name === '测试山系·底座')
    const core = result.features.find((f) => f.name === '测试山系·核心')
    expect(base).toBeTruthy()
    expect(core).toBeTruthy()
    expect(base.category).toBe('mountain')
    expect(base.spine).toEqual(opts.anchors)
    expect(core.elevationM).toBeGreaterThan(base.elevationM)
    for (const [x, y] of core.pts) {
      expect(pointInPoly(x, y, base.pts)).toBe(true)
    }
  })

  it('支脉：spurProbability=1 时产出支脉且带独立海拔（低于底座）；要素量帽 ≤15', () => {
    const result = buildMountainChain({ ...opts, spurProbability: 1 })
    const spurs = result.features.filter((f) => f.name.includes('支脉'))
    expect(spurs.length).toBeGreaterThan(0)
    for (const spur of spurs) {
      expect(spur.category).toBe('mountain')
      expect(spur.elevationM).toBeLessThan(1200)
    }
    expect(result.features.length).toBeLessThanOrEqual(MOUNTAIN_CHAIN_MAX_FEATURES)
  })

  it('anchors 不足两点：诚实空产出+说明，不抛错', () => {
    const result = buildMountainChain({ ...opts, anchors: [[100, 100]] })
    expect(result.features).toHaveLength(0)
    expect(result.notes.join('')).toContain('anchors')
  })
})

describe('buildRiverSystem（水系树）', () => {
  const opts = { source: [4800, 2400], tributaryTier: 'high', namePrefix: '测试水系', seed: 'river-1' }

  it('同 seed 恒形：两次调用产物深度相等（同一张网格）', () => {
    const a = buildRiverSystem(opts, HILL_GRID)
    const b = buildRiverSystem(opts, HILL_GRID)
    expect(a).toEqual(b)
  })

  it('干流全程顺流（validateRiverPath 完整通过）；全部支流沿线无 uphill（顺流铁律）', () => {
    const result = buildRiverSystem(opts, HILL_GRID)
    const trunk = result.features.find((f) => f.name === '测试水系·干流')
    expect(trunk).toBeTruthy()
    expect(validateRiverPath(trunk.pts, HILL_GRID).ok).toBe(true)
    const tributaries = result.features.filter((f) => f.name.includes('支流'))
    expect(tributaries.length).toBeGreaterThan(0)
    for (const trib of tributaries) {
      const check = validateRiverPath(trib.pts, HILL_GRID, { upTolM: 1 })
      // 挂接干流的支流允许 bad-terminus（终点=干流线上，网格只认 region 水域·批B 语义），但绝不许 uphill
      expect(check.problems.filter((p) => p.kind === 'uphill')).toHaveLength(0)
    }
  })

  it('挂接吸附：joined 支流终点恰落在干流折线上（距离≈0）', () => {
    const result = buildRiverSystem(opts, HILL_GRID)
    const trunk = result.features.find((f) => f.name === '测试水系·干流')
    const joined = result.features.filter((f) => f.meta.shape.joinedTrunk === true)
    expect(joined.length).toBeGreaterThan(0)
    for (const trib of joined) {
      const end = trib.pts[trib.pts.length - 1]
      expect(nearestPointOnPolyline(end, trunk.pts).distance).toBeLessThan(1)
    }
  })

  it('宽度 meta 落位（批W 口径）：每段 meta.shape.widthProfile 齐备且数值有限；干流 widthTier=min(5,Strahler阶)', () => {
    const result = buildRiverSystem(opts, HILL_GRID)
    for (const f of result.features) {
      expect(f.category).toBe('river')
      const wp = f.meta.shape.widthProfile
      expect(Number.isFinite(wp.sourceWidthM)).toBe(true)
      expect(Number.isFinite(wp.mouthWidthM)).toBe(true)
      expect(wp.mouthWidthM).toBeGreaterThanOrEqual(wp.sourceWidthM)
      expect(f.meta.shape.widthTier).toBeGreaterThanOrEqual(1)
      expect(f.meta.shape.widthTier).toBeLessThanOrEqual(5)
    }
    const trunk = result.features.find((f) => f.name === '测试水系·干流')
    expect(trunk.meta.shape.widthTier).toBe(Math.min(5, trunk.meta.shape.strahlerOrder))
    // 干流有支流同级汇入时阶数>1，宽度档位应高于支流（1 阶）
    expect(trunk.meta.shape.strahlerOrder).toBeGreaterThan(1)
    const trib = result.features.find((f) => f.name.includes('支流'))
    expect(trunk.meta.shape.widthProfile.mouthWidthM).toBeGreaterThan(trib.meta.shape.widthProfile.mouthWidthM)
  })

  it('要素量帽 ≤20；源头落在水域/图缘时诚实空产出', () => {
    const result = buildRiverSystem(opts, HILL_GRID)
    expect(result.features.length).toBeLessThanOrEqual(RIVER_SYSTEM_MAX_FEATURES)
    const onSea = buildRiverSystem({ ...opts, source: [200, 3000] }, HILL_GRID)
    expect(onSea.features).toHaveLength(0)
  })
})

describe('buildCityLayout（城区路网）', () => {
  const opts = { center: [2400, 4600], radiusM: 1100, streetPattern: 'grid', wallEnabled: true, namePrefix: '测试城', seed: 'city-1' }

  it('同 seed 恒形：两次调用产物深度相等', () => {
    const a = buildCityLayout(opts, HILL_GRID)
    const b = buildCityLayout(opts, HILL_GRID)
    expect(a).toEqual(b)
  })

  it('街道贯穿（横纵跨度互覆）：横街 x 跨度覆盖纵街 x 位置，纵街 y 跨度覆盖横街 y 位置；街道端点落在城区边界上（贯穿由构造保证）', () => {
    const result = buildCityLayout(opts, HILL_GRID)
    const urban = result.features.find((f) => f.category === 'urban')
    const hStreets = result.features.filter((f) => f.category === 'street' && f.name.includes('横'))
    const vStreets = result.features.filter((f) => f.category === 'street' && f.name.includes('纵'))
    expect(hStreets.length).toBeGreaterThan(0)
    expect(vStreets.length).toBeGreaterThan(0)
    const h = hStreets[0]
    const v = vStreets[0]
    const hx = [Math.min(h.pts[0][0], h.pts[h.pts.length - 1][0]), Math.max(h.pts[0][0], h.pts[h.pts.length - 1][0])]
    const vy = [Math.min(v.pts[0][1], v.pts[v.pts.length - 1][1]), Math.max(v.pts[0][1], v.pts[v.pts.length - 1][1])]
    const vMidX = (v.pts[0][0] + v.pts[v.pts.length - 1][0]) / 2
    const hMidY = (h.pts[0][1] + h.pts[h.pts.length - 1][1]) / 2
    expect(vMidX).toBeGreaterThan(hx[0])
    expect(vMidX).toBeLessThan(hx[1])
    expect(hMidY).toBeGreaterThan(vy[0])
    expect(hMidY).toBeLessThan(vy[1])
    // 端点=边界交点（构造保证贯穿整个城区，不是悬在城内的短线）
    const boundaryRing = [...urban.pts, urban.pts[0]]
    for (const street of [...hStreets, ...vStreets]) {
      expect(nearestPointOnPolyline(street.pts[0], boundaryRing).distance).toBeLessThan(1)
      expect(nearestPointOnPolyline(street.pts[street.pts.length - 1], boundaryRing).distance).toBeLessThan(1)
    }
  })

  it('quarter 数量合理（≥4 且与街线数解析一致）；主干道从中心通到城门（代价寻路产物非空）', () => {
    const result = buildCityLayout(opts, HILL_GRID)
    expect(result.stats.quarterEstimate).toBeGreaterThanOrEqual(4)
    expect(result.stats.quarterEstimate).toBeLessThanOrEqual(36)
    expect(result.stats.majorRoadCount).toBeGreaterThan(0)
    const majors = result.features.filter((f) => f.category === 'road')
    expect(majors.length).toBe(result.stats.majorRoadCount)
    for (const major of majors) {
      expect(major.pts.length).toBeGreaterThanOrEqual(2)
      expect(pathLength(major.pts)).toBeGreaterThan(0)
    }
  })

  it('wallEnabled 二态：true 产城墙（首尾闭合）+城门 marker；organic 档街道更弯（长度>直线距离）', () => {
    const withWall = buildCityLayout(opts, HILL_GRID)
    const wall = withWall.features.find((f) => f.category === 'wall')
    expect(wall).toBeTruthy()
    expect(wall.pts[0]).toEqual(wall.pts[wall.pts.length - 1])
    expect(withWall.features.some((f) => f.category === 'gate')).toBe(true)
    const noWall = buildCityLayout({ ...opts, wallEnabled: false }, HILL_GRID)
    expect(noWall.features.some((f) => f.category === 'wall')).toBe(false)
    expect(noWall.features.some((f) => f.category === 'gate')).toBe(false)

    const organic = buildCityLayout({ ...opts, streetPattern: 'organic', meander: 0.4, wallEnabled: false }, HILL_GRID)
    const organicStreet = organic.features.find((f) => f.category === 'street')
    const chord = Math.hypot(
      organicStreet.pts[organicStreet.pts.length - 1][0] - organicStreet.pts[0][0],
      organicStreet.pts[organicStreet.pts.length - 1][1] - organicStreet.pts[0][1]
    )
    expect(pathLength(organicStreet.pts)).toBeGreaterThan(chord * 1.01)
  })

  it('要素量帽：塞 45 个城门锚点也硬顶在 40 件并回执注明', () => {
    const manyGates = []
    for (let i = 0; i < 45; i++) {
      const theta = (i / 45) * Math.PI * 2
      manyGates.push([2400 + Math.cos(theta) * 1100, 4600 + Math.sin(theta) * 935])
    }
    const result = buildCityLayout({ ...opts, gateAnchors: manyGates }, HILL_GRID)
    expect(result.features.length).toBeLessThanOrEqual(CITY_LAYOUT_MAX_FEATURES)
    expect(result.notes.join('')).toContain('上限')
  })
})

describe('buildInterCityRoad（城际道路）', () => {
  const opts = { from: [1200, 3200], to: [5200, 3200], grade: 'trunk', namePrefix: '测试官道', seed: 'road-1' }

  it('同 seed 恒形：两次调用产物深度相等', () => {
    const a = buildInterCityRoad(opts, STRAIT_GRID)
    const b = buildInterCityRoad(opts, STRAIT_GRID)
    expect(a).toEqual(b)
  })

  it('遇水自动置桥：跨海峡必产 bridge 要素，桥两端落陆（批C 桥硬门语义①）', () => {
    const result = buildInterCityRoad(opts, STRAIT_GRID)
    const bridges = result.features.filter((f) => f.category === 'bridge')
    expect(bridges.length).toBeGreaterThan(0)
    expect(result.stats.bridgeCount).toBe(bridges.length)
    for (const bridge of bridges) {
      const from = bridge.pts[0]
      const to = bridge.pts[bridge.pts.length - 1]
      // 端点不在水域多边形内（矢量判定）+ 端点所在格是陆地（网格判定）——两口径同时成立
      expect(pointInPoly(from[0], from[1], STRAIT_WATER_PTS)).toBe(false)
      expect(pointInPoly(to[0], to[1], STRAIT_WATER_PTS)).toBe(false)
      expect(STRAIT_GRID.cellType[gridIndexOf(STRAIT_SPEC, from[0], from[1])]).toBe(CELL_LAND)
      expect(STRAIT_GRID.cellType[gridIndexOf(STRAIT_SPEC, to[0], to[1])]).toBe(CELL_LAND)
    }
  })

  it('桥确实跨水（批C 桥硬门语义②）：桥身路径与网格水域相交（findContinuousWaterRuns 非空）', () => {
    const result = buildInterCityRoad(opts, STRAIT_GRID)
    const bridge = result.features.find((f) => f.category === 'bridge')
    expect(findContinuousWaterRuns(bridge.pts, STRAIT_GRID).length).toBeGreaterThan(0)
  })

  it('道路本体：trunk 档产 road 类目；trail 档产 trail 类目；via 途经点使路径经过其附近', () => {
    const trunk = buildInterCityRoad(opts, STRAIT_GRID)
    expect(trunk.features[0].category).toBe('road')
    expect(trunk.features[0].meta.shape.grade).toBe('trunk')
    const trail = buildInterCityRoad({ ...opts, grade: 'trail' }, STRAIT_GRID)
    expect(trail.features[0].category).toBe('trail')

    const viaPt = [1800, 1400]
    const withVia = buildInterCityRoad({ ...opts, via: [viaPt] }, STRAIT_GRID)
    const road = withVia.features[0]
    expect(nearestPointOnPolyline(viaPt, road.pts).distance).toBeLessThan(STRAIT_SPEC.cellSize * 1.5)
  })

  it('无水路线不置桥（不平白多出要素）；完全不可达时诚实空产出', () => {
    // 同侧两点（都在海峡西侧）：全程陆路，无桥
    const dryRoad = buildInterCityRoad({ ...opts, from: [800, 1000], to: [2200, 5000] }, STRAIT_GRID)
    expect(dryRoad.features.filter((f) => f.category === 'bridge')).toHaveLength(0)
    expect(dryRoad.features).toHaveLength(1)
  })
})
