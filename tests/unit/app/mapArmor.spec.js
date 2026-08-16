import { describe, expect, it } from 'vitest'
import { shoelace } from '../../../src/app/mapGeometry.ts'
import {
  buildMountainDotMatrix,
  gridToWorld,
  rasterizeStroke,
  strokeToWorldSkeleton,
  validateStrokeOnMatrix,
  worldToGrid
} from '../../../src/app/mapArmor/dotMatrix.ts'
import { expandMountainArmor } from '../../../src/app/mapArmor/mountainArmor.ts'

// 装甲地图系统批A1（2026-07-13）：纯函数核心层锁行为。
// 点阵：合法性谓词/文本格式/grid↔world 往返/Bresenham 连贯/越界检出。
// 展开：同 seed 逐字节确定性/不同 seed 不同/层数与参数一致/海拔递增/基座面积>0/2点骨架不抛错/
// 缺省补参落在文档范围/steepness 与 asymmetry 的几何效果（用户 07-13 二次拍板新增参数）。

describe('mapArmor/dotMatrix', () => {
  describe('buildMountainDotMatrix', () => {
    it('framePts 缺失或点数不足时抛错（不静默丢掉坐标换算依据）', () => {
      expect(() => buildMountainDotMatrix({ framePts: null, waterRegions: [], mountainRegions: [] })).toThrow()
      expect(() => buildMountainDotMatrix({ framePts: [[0, 0], [1, 1]], waterRegions: [], mountainRegions: [] })).toThrow()
    })

    it('合法性谓词：工作框不是边界，外圈仍可画；水域/旧山体才是禁区', () => {
      const frame = [[0, 0], [4000, 0], [4000, 4000], [0, 4000]]
      const gridN = 21
      const projClean = buildMountainDotMatrix({ framePts: frame, waterRegions: [], mountainRegions: [], gridN })
      const centerRow = Math.ceil(gridN / 2)
      const centerCol = Math.ceil(gridN / 2)
      expect(projClean.legal[centerRow - 1][centerCol - 1]).toBe(true)
      expect(projClean.legal[0][0]).toBe(true)

      // 用中心格世界坐标构造一小块障碍，重建投影后该格应变禁区
      const centerWorld = gridToWorld(projClean.spec, centerRow, centerCol)
      const half = projClean.spec.cellM * 2
      const block = [
        [centerWorld[0] - half, centerWorld[1] - half],
        [centerWorld[0] + half, centerWorld[1] - half],
        [centerWorld[0] + half, centerWorld[1] + half],
        [centerWorld[0] - half, centerWorld[1] + half]
      ]
      const projWithWater = buildMountainDotMatrix({ framePts: frame, waterRegions: [block], mountainRegions: [], gridN })
      expect(projWithWater.legal[centerRow - 1][centerCol - 1]).toBe(false)
      const projWithMountain = buildMountainDotMatrix({ framePts: frame, waterRegions: [], mountainRegions: [block], gridN })
      expect(projWithMountain.legal[centerRow - 1][centerCol - 1]).toBe(false)
    })

    it('占地感知：clearance 会收缩任务域/锚点并膨胀障碍，给最终山体半宽留空间', () => {
      const frame = [[0, 0], [10_000, 0], [10_000, 10_000], [0, 10_000]]
      const containmentRegion = [[500, 500], [9_500, 500], [9_500, 9_500], [500, 9_500]]
      const water = [[4_500, 4_500], [5_500, 4_500], [5_500, 5_500], [4_500, 5_500]]
      const proj = buildMountainDotMatrix({
        framePts: frame,
        waterRegions: [water],
        mountainRegions: [],
        containmentRegion,
        clearanceM: 1_000,
        gridN: 21
      })
      expect(proj.legal[0][0]).toBe(false)
      expect(proj.legal[10][10]).toBe(false)
      expect(proj.legal[10][7]).toBe(false)
      expect(proj.legal[4][4]).toBe(true)
    })

    it('text 行列号格式：每行长度=3+cols（默认两位行号），总行数=表头2行+rows', () => {
      const frame = [[0, 0], [2000, 0], [2000, 2000], [0, 2000]]
      const gridN = 41
      const proj = buildMountainDotMatrix({ framePts: frame, waterRegions: [], mountainRegions: [], gridN })
      const lines = proj.text.split('\n')
      expect(lines.length).toBe(gridN + 2)
      for (const line of lines) expect(line.length).toBe(3 + gridN)
      expect(lines[2].startsWith('01 ')).toBe(true)
      expect(lines[lines.length - 1].startsWith('41 ')).toBe(true)
    })
  })

  it('gridToWorld/worldToGrid：格子中心往返一致', () => {
    const spec = { originX: -500, originY: 200, cellM: 111.5, rows: 41, cols: 41 }
    const samples = [[1, 1], [1, 41], [41, 1], [41, 41], [21, 21], [7, 33]]
    for (const [row, col] of samples) {
      const world = gridToWorld(spec, row, col)
      const [row2, col2] = worldToGrid(spec, world)
      expect(row2).toBe(row)
      expect(col2).toBe(col)
    }
  })

  it('rasterizeStroke：八方向连贯（相邻格切比雪夫距离≤1），起止点保留', () => {
    const stroke = { type: 'straight', points: [[1, 1], [10, 3], [10, 20], [25, 5]] }
    const cells = rasterizeStroke(stroke)
    expect(cells.length).toBeGreaterThan(1)
    for (let i = 1; i < cells.length; i++) {
      const dRow = Math.abs(cells[i][0] - cells[i - 1][0])
      const dCol = Math.abs(cells[i][1] - cells[i - 1][1])
      expect(Math.max(dRow, dCol)).toBeLessThanOrEqual(1)
    }
    expect(cells[0]).toEqual([1, 1])
    expect(cells[cells.length - 1]).toEqual([25, 5])
  })

  it('validateStrokeOnMatrix：检出越界格（出网格/落在禁区两类），干净路径判 ok', () => {
    const frame = [[0, 0], [2000, 0], [2000, 2000], [0, 2000]]
    const gridN = 21
    const proj = buildMountainDotMatrix({ framePts: frame, waterRegions: [], mountainRegions: [], gridN })

    const outOfGrid = validateStrokeOnMatrix({ type: 'straight', points: [[-5, -5], [10, 10]] }, proj)
    expect(outOfGrid.ok).toBe(false)
    expect(outOfGrid.illegalCells.length).toBeGreaterThan(0)

    const clean = validateStrokeOnMatrix({ type: 'smooth', points: [[10, 10], [11, 11], [12, 12]] }, proj)
    expect(clean.ok).toBe(true)
    expect(clean.illegalCells.length).toBe(0)
  })

  it('strokeToWorldSkeleton：只转关键点（不是光栅化密集格）', () => {
    const spec = { originX: 0, originY: 0, cellM: 100, rows: 41, cols: 41 }
    const stroke = { type: 'smooth', points: [[1, 1], [20, 20], [41, 41]] }
    const skeleton = strokeToWorldSkeleton(stroke, spec)
    expect(skeleton.length).toBe(3)
    expect(skeleton[0]).toEqual(gridToWorld(spec, 1, 1))
    expect(skeleton[2]).toEqual(gridToWorld(spec, 41, 41))
  })
})

describe('mapArmor/mountainArmor · expandMountainArmor', () => {
  const skeleton3 = [[0, 0], [3000, -1000], [6000, 500]]

  it('同 seed 同输入输出逐字节一致（JSON.stringify 相等）', () => {
    const a = expandMountainArmor(skeleton3, {}, 42)
    const b = expandMountainArmor(skeleton3, {}, 42)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })

  it('不同 seed 输出不同', () => {
    const a = expandMountainArmor(skeleton3, {}, 42)
    const c = expandMountainArmor(skeleton3, {}, 43)
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(c))
  })

  it('layers 数与 params.layers 一致（显式覆盖优先）', () => {
    const with2 = expandMountainArmor(skeleton3, { layers: 2 }, 1)
    expect(with2.features.length).toBe(2)
    const with3 = expandMountainArmor(skeleton3, { layers: 3 }, 1)
    expect(with3.features.length).toBe(3)
  })

  it('layers 缺省按海拔推导：peakElevationM<1200 取2，否则取3', () => {
    const low = expandMountainArmor(skeleton3, { peakElevationM: 1000 }, 1)
    expect(low.features.length).toBe(2)
    const high = expandMountainArmor(skeleton3, { peakElevationM: 1500 }, 1)
    expect(high.features.length).toBe(3)
  })

  it('elevationM 严格递增（内层 > 外层）', () => {
    const r = expandMountainArmor(skeleton3, { layers: 3, peakElevationM: 2000 }, 7)
    const elevations = r.features.map((f) => f.elevationM)
    for (let i = 1; i < elevations.length; i++) expect(elevations[i]).toBeGreaterThan(elevations[i - 1])
  })

  it('骨架只有 2 点也能展开不抛错；基座多边形点数≥8 且面积>0', () => {
    expect(() => expandMountainArmor([[0, 0], [1000, 1000]], {}, 5)).not.toThrow()
    const r = expandMountainArmor([[0, 0], [1000, 1000]], {}, 5)
    const base = r.features[0]
    expect(base.pts.length).toBeGreaterThanOrEqual(8)
    expect(shoelace(base.pts)).toBeGreaterThan(0)
  })

  it('缺省补参在文档范围：peakElevationM∈[800,2500]', () => {
    const r = expandMountainArmor([[0, 0], [0, 5000]], {}, 99)
    const impliedPeak = r.features[0].elevationM / 0.35
    expect(impliedPeak).toBeGreaterThanOrEqual(800)
    expect(impliedPeak).toBeLessThanOrEqual(2500)
  })

  it('缺省补参在文档范围：baseWidthM∈脊线长×[0.15,0.25]（几何量测，noise/asymmetry 清零排除干扰）', () => {
    const ridgeLen = 6000
    const skeleton = [[0, 0], [0, ridgeLen]] // 南北向直线骨架，x 恒为 0，半宽可直接量测 |x|
    const r = expandMountainArmor(skeleton, { peakElevationM: 1000, steepness: 0.5, ruggedness: 0, asymmetry: 0 }, 123)
    const base = r.features[0]
    const n = base.pts.length / 2
    const midIdx = Math.floor(n / 2) // 中段 taper=1（局部 t≈0.5，落在 [0.25,0.75] 平坦区）
    const halfWidthMid = Math.abs(base.pts[midIdx][0])
    expect(halfWidthMid).toBeGreaterThanOrEqual(ridgeLen * 0.15 / 2)
    expect(halfWidthMid).toBeLessThan(ridgeLen * 0.25 / 2)
  })

  it('steepness 越高 layer1 半宽越紧贴脊线（比值断言，同 seed 消除随机干扰）', () => {
    const skeleton = [[0, 0], [0, 8000]]
    const seed = 7
    const base = { peakElevationM: 1000, baseWidthM: 4000, ruggedness: 0, asymmetry: 0, layers: 2 }
    const low = expandMountainArmor(skeleton, { ...base, steepness: 0.1 }, seed)
    const high = expandMountainArmor(skeleton, { ...base, steepness: 0.9 }, seed)
    const midHalfWidth = (feature) => {
      const n = feature.pts.length / 2
      const midIdx = Math.floor(n / 2)
      return Math.abs(feature.pts[midIdx][0])
    }
    const hwLow = midHalfWidth(low.features[1])
    const hwHigh = midHalfWidth(high.features[1])
    expect(hwHigh).toBeLessThan(hwLow * 0.8) // 理论比值 lerp(0.75,0.45,0.9)/lerp(0.75,0.45,0.1) ≈ 0.667
  })

  it('resolvedParams 携带补参后的完整数值（批A2 最小扩展），与实际展开结果一致', () => {
    const r = expandMountainArmor(skeleton3, { peakElevationM: 1800 }, 55)
    expect(r.resolvedParams.peakElevationM).toBe(1800)
    expect(r.resolvedParams.layers).toBe(r.features.length)
    expect(r.features[r.features.length - 1].elevationM).toBe(r.resolvedParams.peakElevationM)
    // 缺省字段（baseWidthM 等）也必须被补齐成具体数值，不留 undefined。
    expect(Number.isFinite(r.resolvedParams.baseWidthM)).toBe(true)
    expect(Number.isFinite(r.resolvedParams.steepness)).toBe(true)
    expect(Number.isFinite(r.resolvedParams.ruggedness)).toBe(true)
    expect(Number.isFinite(r.resolvedParams.asymmetry)).toBe(true)
  })

  it('resolvedParams 不是重现基准：原 params 有残缺字段时，拿 resolvedParams 重新展开不逐字节相同（rng 消耗序列错位，是已知限制非 bug）', () => {
    const original = expandMountainArmor(skeleton3, { peakElevationM: 1800 }, 55) // baseWidthM 缺省=消耗1次rng
    const replay = expandMountainArmor(skeleton3, original.resolvedParams, 55) // 全字段显式=不消耗该次rng，游标错位
    expect(JSON.stringify(replay)).not.toBe(JSON.stringify(original))
    // 真正的重现基准：原样传入本次实际用的（可能残缺的）params 对象才逐字节相同。
    const trueReplay = expandMountainArmor(skeleton3, { peakElevationM: 1800 }, 55)
    expect(JSON.stringify(trueReplay)).toBe(JSON.stringify(original))
  })

  it('原 params 已全字段显式给出时，resolvedParams 与之相等，重新展开也逐字节相同（无残缺字段可短路，不踩上面的坑）', () => {
    const fullParams = { peakElevationM: 1500, baseWidthM: 3000, steepness: 0.4, ruggedness: 0.6, asymmetry: 0.2, layers: 3 }
    const r = expandMountainArmor(skeleton3, fullParams, 55)
    expect(r.resolvedParams).toEqual(fullParams)
    const replay = expandMountainArmor(skeleton3, r.resolvedParams, 55)
    expect(JSON.stringify(replay)).toBe(JSON.stringify(r))
  })

  it('asymmetry=0.8 时基座多边形相对脊线两侧不对称（左右最大偏距不等）', () => {
    const skeleton = [[0, 0], [0, 8000]] // 竖直骨架：沿前进方向的左手法向指向 -x
    const r = expandMountainArmor(skeleton, { peakElevationM: 1000, baseWidthM: 4000, ruggedness: 0, steepness: 0.5, asymmetry: 0.8, layers: 2 }, 11)
    const base = r.features[0]
    const n = base.pts.length / 2
    const midIdx = Math.floor(n / 2)
    const leftHalfWidth = Math.abs(base.pts[midIdx][0])
    const rightHalfWidth = Math.abs(base.pts[base.pts.length - 1 - midIdx][0])
    expect(leftHalfWidth).toBeGreaterThan(rightHalfWidth * 2) // 理论比值 1.48/0.52 ≈ 2.85
  })
})
