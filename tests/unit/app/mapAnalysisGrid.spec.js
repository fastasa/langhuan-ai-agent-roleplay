import { describe, expect, it } from 'vitest'
import {
  CELL_LAKE,
  CELL_LAND,
  CELL_SEA,
  SEA_BASE_ELEV,
  buildAnalysisGrid,
  buildAnalysisGridMemoized,
  clearAnalysisGridMemo,
  computeAnalysisGridSpec,
  computeFlow,
  fillDepressions,
  findContinuousWaterRuns,
  findNearestLegalBank,
  rasterizeElevation,
  roadCostTrial,
  sampleElevationProfile,
  validatePathGrade,
  validateRiverPath
} from '../../../src/app/mapAnalysisGrid.ts'

// 地图分阶段作画与笔刷约束系统·批B（2026-07-11）：分析网格纯函数链路锁行为——
// 栅格化→填洼→D8流向/流量→拟画河流合法性/道路代价试算/桥接岸原语→全链装配。

function mkRegion(id, category, pts, elevationM, layer = 'terrain') {
  return { id, kind: 'region', category, name: id, layer, pts, elevationM }
}

/** 测试专用：点→格下标（与模块内部换算同一公式，用于白盒断言 grid.filled/cellType）。 */
function gridIndexOf(spec, x, y) {
  const col = Math.min(spec.n - 1, Math.max(0, Math.floor((x - spec.minX) / spec.cellSize)))
  const row = Math.min(spec.n - 1, Math.max(0, Math.floor((y - spec.minY) / spec.cellSize)))
  return row * spec.n + col
}

/** 沿折线密集重采样后检查每个采样点所在格是否为陆地——用于断言 roadCostTrial 返回的路径确实绕开水体。 */
function pathAvoidsWater(path, grid) {
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]
    const b = path[i]
    const steps = 24
    for (let s = 0; s <= steps; s++) {
      const t = s / steps
      const x = a[0] + (b[0] - a[0]) * t
      const y = a[1] + (b[1] - a[1]) * t
      if (grid.cellType[gridIndexOf(grid.spec, x, y)] !== CELL_LAND) return false
    }
  }
  return true
}

// ── 合成台阶世界（海+平原+山+湖）────────────────────────────────────────────
// 0..2400 方形域，n=48，cellSize=50。x<600 无要素覆盖=自动背景海；plain 覆盖 x:[600,2400] 全域；
// mountain/lake 嵌套在 plain 内部，均不触边界、互不重叠——典型的"台阶状海拔场"合成用例。
const WORLD_SPEC = { n: 48, minX: 0, minY: 0, cellSize: 50 }
const WORLD_FEATURES = [
  mkRegion('plain', 'grass', [[600, 0], [2400, 0], [2400, 2400], [600, 2400]], 80),
  mkRegion('mountain', 'mountain', [[1800, 1000], [2200, 1000], [2200, 1400], [1800, 1400]], 800),
  mkRegion('lake', 'water', [[900, 900], [1100, 900], [1100, 1100], [900, 1100]], 20)
]
// water 类目缺省判定为"海"；这里显式把 lake 要素标记为 CELL_LAKE，让 CellType 的三个取值
// （陆/海/湖）在测试里都被真实走到——背景海=无要素覆盖处的缺省 CELL_SEA，lake=本世界唯一 water 要素。
const WORLD_OPTS = { cellTypeOf: (f) => (f.category === 'water' ? CELL_LAKE : CELL_LAND) }
const WORLD_RASTER = rasterizeElevation(WORLD_FEATURES, WORLD_SPEC, WORLD_OPTS)
const WORLD_FILLED = fillDepressions(WORLD_RASTER.elev, WORLD_RASTER.cellType, WORLD_SPEC)
const WORLD_GRID = buildAnalysisGrid(WORLD_FEATURES, WORLD_SPEC, WORLD_OPTS)

describe('computeAnalysisGridSpec（由包围盒推导网格规格）', () => {
  it('cellSize = 跨度较大一边 / n，保证正方形格覆盖整个包围盒', () => {
    const spec = computeAnalysisGridSpec({ minX: 0, minY: 0, maxX: 1000, maxY: 500 }, 100)
    expect(spec.n).toBe(100)
    expect(spec.minX).toBe(0)
    expect(spec.minY).toBe(0)
    expect(spec.cellSize).toBeCloseTo(10)
  })
})

describe('rasterizeElevation（Step A：栅格化+"后烧者赢"）', () => {
  it('合成世界：山/湖/背景海/纯平原的海拔与地表类型栅格化正确', () => {
    const { elev, cellType } = WORLD_RASTER
    expect(elev[gridIndexOf(WORLD_SPEC, 2000, 1200)]).toBe(800) // 山中心
    expect(cellType[gridIndexOf(WORLD_SPEC, 2000, 1200)]).toBe(CELL_LAND)
    expect(elev[gridIndexOf(WORLD_SPEC, 1000, 1000)]).toBe(20) // 湖中心
    expect(cellType[gridIndexOf(WORLD_SPEC, 1000, 1000)]).toBe(CELL_LAKE)
    expect(elev[gridIndexOf(WORLD_SPEC, 300, 1200)]).toBe(SEA_BASE_ELEV) // 无要素覆盖=背景海
    expect(cellType[gridIndexOf(WORLD_SPEC, 300, 1200)]).toBe(CELL_SEA)
    expect(elev[gridIndexOf(WORLD_SPEC, 1400, 300)]).toBe(80) // 纯平原
    expect(cellType[gridIndexOf(WORLD_SPEC, 1400, 300)]).toBe(CELL_LAND)
  })

  it('"后烧者赢"：同层重叠时按面积降序排列，小而具体的嵌套要素盖住大而笼统的底图要素（与海拔高低无关）', () => {
    const overlapSpec = { n: 10, minX: 0, minY: 0, cellSize: 10 }
    const big = mkRegion('big', 'grass', [[0, 0], [100, 0], [100, 100], [0, 100]], 50)
    // 嵌套要素比底图海拔更高（山）：按面积降序，小的山依然正确盖住大的平原
    const small = mkRegion('small', 'mountain', [[30, 30], [70, 30], [70, 70], [30, 70]], 500)
    const { elev: elevHigh } = rasterizeElevation([big, small], overlapSpec)
    expect(elevHigh[gridIndexOf(overlapSpec, 50, 50)]).toBe(500)
    expect(elevHigh[gridIndexOf(overlapSpec, 5, 5)]).toBe(50)

    // 回归锁定：嵌套要素比底图海拔更低（湖/水域，真实世界最常见的情形）——若误用"按海拔升序"，
    // 低海拔的水域会被高海拔的大块陆地背景整体盖掉（批B 开发中实测踩中的 bug，见 defaultPaintOrderOf 注释）
    const lowSmall = mkRegion('pond', 'water', [[30, 30], [70, 30], [70, 70], [30, 70]], 5)
    const { elev: elevLow, cellType: cellTypeLow } = rasterizeElevation([big, lowSmall], overlapSpec)
    expect(elevLow[gridIndexOf(overlapSpec, 50, 50)]).toBe(5)
    expect(cellTypeLow[gridIndexOf(overlapSpec, 50, 50)]).toBe(CELL_SEA)
    expect(elevLow[gridIndexOf(overlapSpec, 5, 5)]).toBe(50)
  })

  it('allTouchedOf=true 时窄要素改用"碰到即算"，比纯中心采样命中更多格子（防止窄要素被规则网格断裂）', () => {
    const narrowSpec = { n: 20, minX: 0, minY: 0, cellSize: 10 }
    // 一条贯穿整个网格、只有 8 个单位宽的窄条，且刻意跨在两行格子的中心点之间（y=95/105 均不落在
    // [96,104] 内）——中心采样会完全漏判，ALL_TOUCHED 应正确命中。
    const ridge = mkRegion('ridge', 'mountain', [[0, 96], [200, 96], [200, 104], [0, 104]], 900)
    const centerOnly = rasterizeElevation([ridge], narrowSpec)
    const allTouched = rasterizeElevation([ridge], narrowSpec, { allTouchedOf: () => true })
    const countLand = (cellType) => {
      let n = 0
      for (let i = 0; i < cellType.length; i++) if (cellType[i] === CELL_LAND) n++
      return n
    }
    expect(countLand(centerOnly.cellType)).toBe(0)
    expect(countLand(allTouched.cellType)).toBeGreaterThan(0)
  })
})

describe('fillDepressions（Step B：填洼）', () => {
  it('填洼后处处 filled >= elev（Planchon-Darboux 准则1）', () => {
    for (let i = 0; i < WORLD_FILLED.length; i++) {
      expect(WORLD_FILLED[i]).toBeGreaterThanOrEqual(WORLD_RASTER.elev[i])
    }
  })

  it('种子格（海/湖/图缘）填洼后原值不变（seed 不参与被抬升）', () => {
    const lakeIdx = gridIndexOf(WORLD_SPEC, 1000, 1000)
    expect(WORLD_FILLED[lakeIdx]).toBe(WORLD_RASTER.elev[lakeIdx])
    const seaIdx = gridIndexOf(WORLD_SPEC, 300, 1200)
    expect(WORLD_FILLED[seaIdx]).toBe(WORLD_RASTER.elev[seaIdx])
  })
})

describe('computeFlow（Step C：D8流向+流量累积）', () => {
  it('合成世界全链不抛错，且陆地格 flowDir 恒 >=0 或 -2（无 -1 残留，处处可排水）', () => {
    let grid
    expect(() => { grid = buildAnalysisGrid(WORLD_FEATURES, WORLD_SPEC, WORLD_OPTS) }).not.toThrow()
    for (let i = 0; i < grid.cellType.length; i++) {
      if (grid.cellType[i] !== CELL_LAND) continue
      expect(grid.flowDir[i]).not.toBe(-1)
      expect(grid.flowDir[i] >= 0 || grid.flowDir[i] === -2).toBe(true)
    }
  })

  it('流量累积确有发生：存在汇入格 flux>1，也存在未汇入的源头格 flux===1', () => {
    const max = Math.max(...WORLD_GRID.flux)
    const min = Math.min(...WORLD_GRID.flux)
    expect(max).toBeGreaterThan(1)
    expect(min).toBe(1)
  })

  it('内陆地格是未真正填洼的局部极小值时抛错（断言 fillDepressions 有 bug，不静默吞掉 -1）', () => {
    const spec = { n: 3, minX: 0, minY: 0, cellSize: 10 }
    // 3x3 网格：中心格(1,1)是唯一非边界格；四周全部比它高，且没有经过填洼抬升——制造一个
    // "填洼后仍是内陆汇"的坏输入，直接检验 computeFlow 自身的断言行为。
    const filled = Float32Array.from([10, 10, 10, 10, 0, 10, 10, 10, 10])
    const cellType = new Uint8Array(9).fill(CELL_LAND)
    expect(() => computeFlow(filled, cellType, spec)).toThrow()
  })
})

describe('validateRiverPath（Step D：拟画河流合法性四例）', () => {
  it('顺流入海：过', () => {
    const result = validateRiverPath([[700, 1200], [400, 1200]], WORLD_GRID)
    expect(result.ok).toBe(true)
    expect(result.problems).toEqual([])
  })

  it('上坡（平原冲进山体）：拒，且 problems 带格中心坐标与超升米数', () => {
    const result = validateRiverPath([[1700, 1200], [2000, 1200]], WORLD_GRID)
    expect(result.ok).toBe(false)
    const uphill = result.problems.find((p) => p.kind === 'uphill')
    expect(uphill).toBeTruthy()
    expect(typeof uphill.at.x).toBe('number')
    expect(typeof uphill.at.y).toBe('number')
    expect(uphill.detailM).toBeGreaterThan(100)
  })

  it('入湖：过', () => {
    const result = validateRiverPath([[1000, 750], [1000, 1000]], WORLD_GRID)
    expect(result.ok).toBe(true)
    expect(result.problems).toEqual([])
  })

  it('断头无终点（留在平原内部）：拒，且 suggestion 非空、按填洼后场单调不升、语义位置真', () => {
    const result = validateRiverPath([[1400, 60], [1400, 140]], WORLD_GRID)
    expect(result.ok).toBe(false)
    expect(result.problems.some((p) => p.kind === 'bad-terminus')).toBe(true)
    expect(result.allowInlandLakeTerminus).toBe(true)
    expect(result.suggestion && result.suggestion.length).toBeGreaterThanOrEqual(2)
    // 建议线起点应贴近拟画源头
    const [sx, sy] = result.suggestion[0]
    expect(Math.hypot(sx - 1400, sy - 60)).toBeLessThan(60)
    // 建议线沿途按【填洼后场】单调不升（容忍浮点误差）
    for (let i = 1; i < result.suggestion.length; i++) {
      const prevElev = WORLD_GRID.filled[gridIndexOf(WORLD_GRID.spec, result.suggestion[i - 1][0], result.suggestion[i - 1][1])]
      const curElev = WORLD_GRID.filled[gridIndexOf(WORLD_GRID.spec, result.suggestion[i][0], result.suggestion[i][1])]
      expect(curElev).toBeLessThanOrEqual(prevElev + 1e-6)
    }
  })

  it('退化输入（少于 2 个点）：拒并标 off-grid，不抛错', () => {
    const result = validateRiverPath([[0, 0]], WORLD_GRID)
    expect(result.ok).toBe(false)
    expect(result.problems[0].kind).toBe('off-grid')
  })
})

describe('roadCostTrial（Step E：道路坡度/水体代价试算）', () => {
  it('平坦世界：对角直线，代价接近直线距离，起止点替换为调用方原始坐标', () => {
    const spec = { n: 20, minX: 0, minY: 0, cellSize: 50 }
    const flat = [mkRegion('land', 'grass', [[0, 0], [1000, 0], [1000, 1000], [0, 1000]], 10)]
    const grid = buildAnalysisGrid(flat, spec)
    const result = roadCostTrial([50, 50], [950, 950], grid)
    expect(result.ok).toBe(true)
    expect(result.path[0]).toEqual([50, 50])
    expect(result.path[result.path.length - 1]).toEqual([950, 950])
    expect(result.totalCost).toBeGreaterThan(1200)
    expect(result.totalCost).toBeLessThan(1500)
  })

  it('水体有缺口可绕行：避水成功，绕行代价明显高于直线距离', () => {
    const spec = { n: 20, minX: 0, minY: 0, cellSize: 50 }
    const land = mkRegion('land', 'grass', [[0, 0], [1000, 0], [1000, 1000], [0, 1000]], 10)
    // 竖直水带 x:[450,550]，只到 y=700，y:[700,1000] 留缺口可绕行
    const waterGap = mkRegion('strait', 'water', [[450, 0], [550, 0], [550, 700], [450, 700]], 0)
    const grid = buildAnalysisGrid([land, waterGap], spec)
    const result = roadCostTrial([100, 500], [900, 500], grid)
    expect(result.ok).toBe(true)
    expect(pathAvoidsWater(result.path, grid)).toBe(true)
    expect(result.totalCost).toBeGreaterThan(840) // 直线距离 800，绕行必然更长
  })

  it('水体贯穿全高无缺口：不可通行，返回 ok=false（代价=Infinity 语义）', () => {
    const spec = { n: 20, minX: 0, minY: 0, cellSize: 50 }
    const land = mkRegion('land', 'grass', [[0, 0], [1000, 0], [1000, 1000], [0, 1000]], 10)
    const waterFull = mkRegion('strait-full', 'water', [[450, 0], [550, 0], [550, 1000], [450, 1000]], 0)
    const grid = buildAnalysisGrid([land, waterFull], spec)
    const result = roadCostTrial([100, 500], [900, 500], grid)
    expect(result.ok).toBe(false)
  })

  it('陡坡贯穿全高无缓坡：阈值外无穷，不可通行', () => {
    const spec = { n: 20, minX: 0, minY: 0, cellSize: 50 }
    const lowPlain = mkRegion('low', 'grass', [[0, 0], [500, 0], [500, 1000], [0, 1000]], 10)
    const highPlateau = mkRegion('high', 'plateau', [[500, 0], [1000, 0], [1000, 1000], [500, 1000]], 5000)
    const grid = buildAnalysisGrid([lowPlain, highPlateau], spec)
    const result = roadCostTrial([100, 500], [900, 500], grid)
    expect(result.ok).toBe(false)
  })
})

describe('findContinuousWaterRuns / findNearestLegalBank（桥接岸原语）', () => {
  const spec = { n: 20, minX: 0, minY: 0, cellSize: 50 }
  const land = mkRegion('land', 'grass', [[0, 0], [1000, 0], [1000, 1000], [0, 1000]], 10)
  const waterFull = mkRegion('strait-full', 'water', [[450, 0], [550, 0], [550, 1000], [450, 1000]], 0)
  const grid = buildAnalysisGrid([land, waterFull], spec)

  it('findContinuousWaterRuns：一条横穿水带的路径识别出恰好一段连续水域', () => {
    const runs = findContinuousWaterRuns([[100, 500], [900, 500]], grid)
    expect(runs.length).toBe(1)
    expect(runs[0].from[0]).toBeGreaterThan(400)
    expect(runs[0].from[0]).toBeLessThan(600)
    expect(runs[0].to[0]).toBeGreaterThan(400)
    expect(runs[0].to[0]).toBeLessThan(600)
  })

  it('findNearestLegalBank：水体边缘就近找到合法接岸点（非水+坡度不超限）', () => {
    const result = findNearestLegalBank([460, 500], grid)
    expect(result.found).toBe(true)
    expect(grid.cellType[gridIndexOf(spec, result.point[0], result.point[1])]).toBe(CELL_LAND)
    expect(result.distanceM).toBeLessThan(150)
  })

  it('周围全是水、没有陆地可接岸：找不到，found=false', () => {
    const allWaterSpec = { n: 10, minX: 0, minY: 0, cellSize: 50 }
    const allWater = [mkRegion('ocean', 'water', [[0, 0], [500, 0], [500, 500], [0, 500]], 0)]
    const allWaterGrid = buildAnalysisGrid(allWater, allWaterSpec)
    const result = findNearestLegalBank([250, 250], allWaterGrid)
    expect(result.found).toBe(false)
  })

  it('接岸坡度语义修正（批C）：水面到岸有巨大高差(500m)但岸自身局部平坦时，仍应就近找到合法接岸点——不再把"水面到岸"的落差误判为坡度', () => {
    // 陆地(500m)与水域(0m)落差 500m，若仍按旧版"水面到岸"语义算坡度，紧邻水域的岸格会被误杀
    // （500m/50m≈10=1000%，远超默认 maxGradeRatio 0.35，只能被迫舍近求远甚至搜索超限找不到）；
    // 新语义只看"岸格与其陆地邻居"的局部起伏——陆地本身处处等高（500m 均匀平坦），局部坡度≈0，
    // 应该在很小的搜索半径内（maxSearchRings 限3圈内）就找到，且 gradeRatio 远小于 0.35。
    const stepSpec = { n: 20, minX: 0, minY: 0, cellSize: 50 }
    const stepLand = mkRegion('high-land', 'grass', [[0, 0], [1000, 0], [1000, 1000], [0, 1000]], 500)
    const stepPond = mkRegion('deep-pond', 'water', [[400, 400], [600, 400], [600, 600], [400, 600]], 0)
    const stepGrid = buildAnalysisGrid([stepLand, stepPond], stepSpec)
    const result = findNearestLegalBank([500, 500], stepGrid, { maxSearchRings: 3 })
    expect(result.found).toBe(true)
    expect(stepGrid.cellType[gridIndexOf(stepSpec, result.point[0], result.point[1])]).toBe(CELL_LAND)
    expect(result.gradeRatio).toBeLessThan(0.35)
    expect(result.distanceM).toBeLessThan(150)
  })
})

describe('sampleElevationProfile（批C：海拔剖面采样）', () => {
  it('返回含首尾端点的采样序列，海拔数值来自【填洼后场】，沿下坡方向单调不增', () => {
    const profile = sampleElevationProfile([[700, 1200], [400, 1200]], WORLD_GRID, 6)
    expect(profile.length).toBeGreaterThanOrEqual(2)
    expect(profile[0].x).toBeCloseTo(700, 0)
    expect(profile[profile.length - 1].x).toBeCloseTo(400, 0)
    for (const p of profile) expect(typeof p.elevM).toBe('number')
    // plain(80m) → 背景海方向：应下降（不给笼统描述，profile 数值本身即可验证趋势）
    expect(profile[0].elevM).toBeGreaterThan(profile[profile.length - 1].elevM)
  })

  it('单点路径返回单点；空路径返回空数组', () => {
    const single = sampleElevationProfile([[1400, 300]], WORLD_GRID)
    expect(single.length).toBe(1)
    expect(single[0].elevM).toBeCloseTo(80, 0)
    expect(sampleElevationProfile([], WORLD_GRID)).toEqual([])
  })
})

describe('validatePathGrade（批C：路径滑动窗口坡度判定，画路/画运河前的硬门同款算法）', () => {
  it('平坦路径：maxGradeRatio 接近 0，不给 hardMaxRatio 时始终 ok=true', () => {
    const result = validatePathGrade([[700, 300], [2000, 300]], WORLD_GRID)
    expect(result.ok).toBe(true)
    expect(result.maxGradeRatio).toBeLessThan(0.05)
  })

  it('陡坡超硬上限：problems 非空且带坐标+坡度比数值，ok=false', () => {
    const result = validatePathGrade([[1700, 1200], [2000, 1200]], WORLD_GRID, { hardMaxRatio: 0.5 })
    expect(result.ok).toBe(false)
    expect(result.problems.length).toBeGreaterThan(0)
    expect(typeof result.problems[0].at.x).toBe('number')
    expect(typeof result.problems[0].at.y).toBe('number')
    expect(result.problems[0].gradeRatio).toBeGreaterThan(0.5)
  })

  it('不给 hardMaxRatio（体检分档用途）：只求 maxGradeRatio 不拒绝，同一路径 ok 恒为 true', () => {
    const result = validatePathGrade([[1700, 1200], [2000, 1200]], WORLD_GRID)
    expect(result.ok).toBe(true)
    expect(result.maxGradeRatio).toBeGreaterThan(0.5)
  })

  it('滑动窗口防台阶单格假峭壁：窗口越大，单点陡峭瞬变对最大坡度比的影响越被稀释', () => {
    // 路径从平原深处(x=1000)一路走到山体内部(x=1850)，边界(x=1800)距路径起点有 800m"陆地跑道"——
    // 窗口必须有足够跑道才能真正"够到"稀释用的参照点：窗口=100（远小于 800m 跑道）时参照点几乎贴着
    // 边界，退化成近似"相邻两格"的原始坡度；窗口=600（仍小于 800m 跑道，可以充分展开）时参照点被
    // 推远到平原深处，同一段落差被摊薄到更长跨度上——窗口越大，坡度比应显著更小（不是消灭坡度，
    // 是防止单格边界被当成路径本身的坡度）。
    const smallWindow = validatePathGrade([[1000, 1200], [1850, 1200]], WORLD_GRID, { windowM: 100 })
    const bigWindow = validatePathGrade([[1000, 1200], [1850, 1200]], WORLD_GRID, { windowM: 600 })
    expect(smallWindow.maxGradeRatio).toBeGreaterThan(bigWindow.maxGradeRatio * 2)
  })

  it('退化输入（少于 2 个点）：ok=true 且 maxGradeRatio=0，不抛错', () => {
    const result = validatePathGrade([[0, 0]], WORLD_GRID)
    expect(result.ok).toBe(true)
    expect(result.maxGradeRatio).toBe(0)
    expect(result.problems).toEqual([])
  })
})

describe('buildAnalysisGridMemoized（单槽会话 memo）', () => {
  it('同 key 命中缓存返回同一对象；terrainRevision 变化则重算', () => {
    clearAnalysisGridMemo()
    const spec = { n: 10, minX: 0, minY: 0, cellSize: 20 }
    const features = [mkRegion('land', 'grass', [[0, 0], [200, 0], [200, 200], [0, 200]], 10)]
    const key = { mapId: 'w1', terrainRevision: 1, n: 10 }
    const g1 = buildAnalysisGridMemoized(key, features, spec)
    const g2 = buildAnalysisGridMemoized(key, features, spec)
    expect(g2).toBe(g1)
    const g3 = buildAnalysisGridMemoized({ ...key, terrainRevision: 2 }, features, spec)
    expect(g3).not.toBe(g1)
    clearAnalysisGridMemo()
  })
})

describe('全链性能（128² 宽松断言）', () => {
  it('128×128 网格、约 20 个要素的全链（栅格化+填洼+流向/流量）耗时 < 500ms', () => {
    const spec = { n: 128, minX: 0, minY: 0, cellSize: 50 }
    const features = [
      mkRegion('plain', 'grass', [[600, 0], [6400, 0], [6400, 6400], [600, 6400]], 80),
      mkRegion('mountain', 'mountain', [[4800, 2600], [5800, 2600], [5800, 3800], [4800, 3800]], 800),
      mkRegion('lake', 'water', [[2400, 2400], [2900, 2400], [2900, 2900], [2400, 2900]], 20)
    ]
    let seed = 1
    for (let i = 0; i < 16; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff
      const cx = 700 + (seed % 5600)
      seed = (seed * 1103515245 + 12345) & 0x7fffffff
      const cy = 100 + (seed % 6200)
      const half = 80
      features.push(mkRegion(
        `patch-${i}`,
        i % 2 === 0 ? 'forest' : 'hill',
        [[cx - half, cy - half], [cx + half, cy - half], [cx + half, cy + half], [cx - half, cy + half]],
        i % 2 === 0 ? 200 : 350
      ))
    }
    const t0 = Date.now()
    const grid = buildAnalysisGrid(features, spec)
    const elapsed = Date.now() - t0
    expect(grid.flowDir.length).toBe(128 * 128)
    // wall-clock 断言在 vitest 并行 worker 高负载下偶发超线（2026-07-12 星依实测 flaky·批E 八 spec 组合
    // 首轮曾偶发 1 失败、复跑两轮全绿）：原 100ms 上限只保数量级不保精确计时，放宽到 500ms 仍能抓真正的
    // 算法退化（O(n²) 之类的量级劣化），不会因为共享 CPU 被误判失败。
    expect(elapsed).toBeLessThan(500)
  })
})
