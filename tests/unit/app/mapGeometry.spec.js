import { describe, expect, it } from 'vitest'
import {
  alongPolyline,
  bboxOf,
  bearingToVector,
  BRUSH_MARKER_CATEGORIES,
  BRUSH_PATH_CATEGORIES,
  BRUSH_REGION_CATEGORIES,
  BRUSH_SPEC,
  buildArcPath,
  buildIsletCluster,
  buildMeanderPath,
  buildRidgePolygon,
  buildShapePolygon,
  catmullRomClosed,
  catmullRomOpen,
  CATEGORY_DEFAULT_ELEVATION_M,
  centroid,
  civicRegionBucket,
  clipPolygonToParent,
  closeRing,
  computeMapGridSpec,
  distanceToPolygonBoundary,
  ELEVATION_BANDS,
  elevationTint,
  expandedHullOf,
  fmtArea,
  fmtDist,
  formatMapGridRef,
  hashStr,
  isClosedRing,
  mapGridColumnLetter,
  mulberry32,
  nearestPointOnPolyline,
  pathLength,
  pointInPoly,
  polygonsOverlap,
  polyToPath,
  principalAxis,
  REGION_SIZE_RANGE,
  resolveCrossRule,
  resolveElevationM,
  resolvePlacementClear,
  roughen,
  scatterInPoly,
  segmentsIntersect,
  shoelace,
  snapIntoRegion,
  specialSurfaceColorVar,
  vectorToBearing,
  widenSpine,
  // 阶段状态机（笔刷约束系统批D·阶段管线）
  MAP_STAGE_ORDER,
  deriveCurrentStage,
  featureBornStage,
  featureConfirmedStage,
  isFeatureLockedAtStage
} from '../../../src/app/mapGeometry.ts'

// 地图系统批1（2026-07-10）：几何纯函数锁行为——重点锁「确定性」（同 seed 永远同图，
// 这是绘舆 agent 读回摘要与渲染端一致的地基）与坐标语义（y 向南为正）。

const square = [[0, 0], [10, 0], [10, 10], [0, 10]]

describe('mulberry32 / hashStr（确定性随机源）', () => {
  it('同 seed 产出完全相同的序列', () => {
    const a = mulberry32(42)
    const b = mulberry32(42)
    const seqA = [a(), a(), a(), a()]
    const seqB = [b(), b(), b(), b()]
    expect(seqA).toEqual(seqB)
  })

  it('值域落在 [0, 1)', () => {
    const rng = mulberry32(7)
    for (let i = 0; i < 200; i++) {
      const v = rng()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })

  it('hashStr 确定且区分不同输入', () => {
    expect(hashStr('mt-xuanyue')).toBe(hashStr('mt-xuanyue'))
    expect(hashStr('mt-xuanyue')).not.toBe(hashStr('sea-canglan'))
  })
})

describe('pointInPoly / shoelace / pathLength / centroid / bboxOf', () => {
  it('点在多边形内外判定正确', () => {
    expect(pointInPoly(5, 5, square)).toBe(true)
    expect(pointInPoly(15, 5, square)).toBe(false)
    expect(pointInPoly(-1, -1, square)).toBe(false)
  })

  it('凹多边形的凹口判为外部', () => {
    // U 形：中间上方的缺口不属于内部
    const concave = [[0, 0], [10, 0], [10, 10], [6, 10], [6, 4], [4, 4], [4, 10], [0, 10]]
    expect(pointInPoly(5, 8, concave)).toBe(false)
    expect(pointInPoly(2, 8, concave)).toBe(true)
  })

  it('鞋带公式面积与点序无关', () => {
    expect(shoelace(square)).toBe(100)
    expect(shoelace([...square].reverse())).toBe(100)
  })

  it('折线长度累加', () => {
    expect(pathLength([[0, 0], [3, 4], [3, 4]])).toBe(5)
  })

  it('质心与包围盒', () => {
    expect(centroid(square)).toEqual([5, 5])
    expect(bboxOf(square)).toEqual({ minX: 0, minY: 0, maxX: 10, maxY: 10 })
  })
})

describe('principalAxis（大字标签主轴）', () => {
  it('水平长条主轴接近水平且跨度约等于长边', () => {
    const strip = [[0, 0], [100, 0], [100, 10], [0, 10]]
    const ax = principalAxis(strip)
    expect(Math.abs(Math.tan(ax.theta))).toBeLessThan(0.05)
    expect(ax.span).toBeGreaterThan(90)
  })
})

describe('roughen（中点位移碎折）', () => {
  it('同 seed 输出逐点一致（确定性）', () => {
    const a = roughen(square.map((p) => p.slice()), 2, 0.1, mulberry32(1))
    const b = roughen(square.map((p) => p.slice()), 2, 0.1, mulberry32(1))
    expect(a).toEqual(b)
  })

  it('闭合链每轮迭代点数翻倍', () => {
    const once = roughen(square.map((p) => p.slice()), 1, 0.1, mulberry32(1))
    expect(once.length).toBe(8)
    const twice = roughen(square.map((p) => p.slice()), 2, 0.1, mulberry32(1))
    expect(twice.length).toBe(16)
  })

  it('开链保持首尾端点不动', () => {
    const line = [[0, 0], [10, 0], [20, 5]]
    const out = roughen(line.map((p) => p.slice()), 2, 0.2, mulberry32(3), false)
    expect(out[0]).toEqual([0, 0])
    expect(out[out.length - 1]).toEqual([20, 5])
  })
})

describe('scatterInPoly（符号播撒）', () => {
  it('播撒点全部落在多边形内且确定', () => {
    const big = [[0, 0], [100, 0], [100, 100], [0, 100]]
    const a = scatterInPoly(big, 10, mulberry32(9))
    const b = scatterInPoly(big, 10, mulberry32(9))
    expect(a.length).toBeGreaterThan(0)
    expect(a).toEqual(b)
    for (const p of a) expect(pointInPoly(p[0], p[1], big)).toBe(true)
  })

  it('keep 过滤器生效', () => {
    const big = [[0, 0], [100, 0], [100, 100], [0, 100]]
    const kept = scatterInPoly(big, 10, mulberry32(9), (x) => x < 50)
    expect(kept.length).toBeGreaterThan(0)
    for (const p of kept) expect(p[0]).toBeLessThan(50)
  })
})

describe('alongPolyline（脊线布点）', () => {
  it('按步距取点并给出单位法向量', () => {
    const stops = alongPolyline([[0, 0], [100, 0]], 10)
    expect(stops.length).toBe(10)
    expect(stops[0].x).toBeCloseTo(5)
    for (const q of stops) {
      expect(Math.hypot(q.nx, q.ny)).toBeCloseTo(1)
      // 水平向东的线段，法向量指向 -y（北侧）
      expect(q.nx).toBeCloseTo(0)
      expect(q.ny).toBeCloseTo(1)
    }
  })

  it('startOffset 生效', () => {
    const stops = alongPolyline([[0, 0], [100, 0]], 40, 20)
    expect(stops.map((q) => q.x)).toEqual([20, 60, 100])
  })
})

describe('path 序列化', () => {
  it('catmullRomClosed 以 M 开头 Z 结尾，点少返回空串', () => {
    const d = catmullRomClosed(square)
    expect(d.startsWith('M0.0 0.0')).toBe(true)
    expect(d.endsWith('Z')).toBe(true)
    expect(catmullRomClosed([[0, 0], [1, 1]])).toBe('')
  })

  it('catmullRomOpen 不闭合，点少返回空串', () => {
    const d = catmullRomOpen([[0, 0], [10, 0], [20, 5]])
    expect(d.startsWith('M0.0 0.0')).toBe(true)
    expect(d.endsWith('Z')).toBe(false)
    expect(catmullRomOpen([[0, 0]])).toBe('')
  })

  it('polyToPath 直线段序列化且可闭合', () => {
    expect(polyToPath([[0, 0], [10, 0]], false)).toBe('M0.0 0.0L10.0 0.0')
    expect(polyToPath([[0, 0], [10, 0]], true)).toBe('M0.0 0.0L10.0 0.0Z')
  })
})

describe('fmtArea / fmtDist（人读单位）', () => {
  it('面积档位：小于 10 万平米用 m²，以上换 km²', () => {
    expect(fmtArea(99999)).toBe('99,999 m²')
    expect(fmtArea(2500000)).toBe('2.50 km²')
    expect(fmtArea(25000000)).toBe('25 km²')
  })

  it('距离档位：千米以下用 m，以上换 km', () => {
    expect(fmtDist(999)).toBe('999 m')
    expect(fmtDist(1500)).toBe('1.5 km')
    expect(fmtDist(12000)).toBe('12 km')
  })
})

// ── 参数化造形（AI 画对四件套第1条·地图系统批5）──
describe('buildShapePolygon / bearingToVector（绘舆造形）', () => {
  it('确定性：同 seed 永远同形状，不同 seed 形状不同（持久性根基）', () => {
    const a = buildShapePolygon({ cx: 100, cy: 200, rx: 500, ry: 300, seed: 'mt-north' })
    const b = buildShapePolygon({ cx: 100, cy: 200, rx: 500, ry: 300, seed: 'mt-north' })
    const c = buildShapePolygon({ cx: 100, cy: 200, rx: 500, ry: 300, seed: 'mt-south' })
    expect(a).toEqual(b)
    expect(a).not.toEqual(c)
  })

  it('形态：blob/ellipse 采样顶点数可控（6~24 钳位），rect 固定 8 点（四角+边中点）', () => {
    expect(buildShapePolygon({ cx: 0, cy: 0, rx: 100, ry: 100, points: 12 })).toHaveLength(12)
    expect(buildShapePolygon({ cx: 0, cy: 0, rx: 100, ry: 100, points: 99 })).toHaveLength(24)
    expect(buildShapePolygon({ cx: 0, cy: 0, rx: 100, ry: 100, form: 'rect', seed: 1 })).toHaveLength(8)
  })

  it('几何合理：顶点围绕中心、半径不超 roughness 抖幅上限；质心贴近给定中心', () => {
    const pts = buildShapePolygon({ cx: 1000, cy: -500, rx: 400, ry: 200, roughness: 0.2, seed: 7 })
    for (const [x, y] of pts) {
      const nx = (x - 1000) / 400
      const ny = (y + 500) / 200
      const radial = Math.hypot(nx, ny)
      expect(radial).toBeGreaterThan(0.5)
      expect(radial).toBeLessThan(1.5)
    }
    const c = centroid(pts)
    expect(Math.abs(c[0] - 1000)).toBeLessThan(120)
    expect(Math.abs(c[1] + 500)).toBeLessThan(80)
  })

  it('bearingToVector：汉字八方位单位向量（y 向南故北=-y）；不认识的返回 null', () => {
    expect(bearingToVector('北')).toEqual([0, -1])
    expect(bearingToVector('东')).toEqual([1, 0])
    const ne = bearingToVector('东北')
    expect(ne[0]).toBeCloseTo(Math.SQRT1_2)
    expect(ne[1]).toBeCloseTo(-Math.SQRT1_2)
    expect(bearingToVector('北偏东')).toBeNull()
    expect(bearingToVector('')).toBeNull()
  })
})

// ── 地图画对硬化批A（2026-07-11）：关系几何——贴岸吸附/避让推开/探索包络 ──
describe('segmentsIntersect / nearestPointOnPolyline / distanceToPolygonBoundary', () => {
  it('相交线段判定为真，平行不相交线段判定为假', () => {
    expect(segmentsIntersect([0, 0], [10, 10], [0, 10], [10, 0])).toBe(true)
    expect(segmentsIntersect([0, 0], [10, 0], [0, 5], [10, 5])).toBe(false)
  })

  it('端点相触与共线重叠均算相交', () => {
    expect(segmentsIntersect([0, 0], [10, 0], [10, 0], [10, 10])).toBe(true)
    expect(segmentsIntersect([0, 0], [0, 10], [0, 5], [0, 15])).toBe(true)
  })

  it('点到折线最近点为垂足投影，超出端点范围钳位到端点', () => {
    const line = [[0, 0], [10, 0]]
    const mid = nearestPointOnPolyline([5, 3], line)
    expect(mid.point).toEqual([5, 0])
    expect(mid.distance).toBeCloseTo(3)
    const beyond = nearestPointOnPolyline([20, 4], line)
    expect(beyond.point).toEqual([10, 0])
  })

  it('点到多边形边界距离：内部点与外部点都按边界折线算', () => {
    expect(distanceToPolygonBoundary([5, 5], square)).toBeCloseTo(5)
    expect(distanceToPolygonBoundary([15, 5], square)).toBeCloseTo(5)
  })
})

describe('snapIntoRegion（河海贴岸吸附·AI 画对四件套之外的新增连接根基）', () => {
  it('起点已在 region 内时原样返回', () => {
    expect(snapIntoRegion([5, 5], square)).toEqual([5, 5])
  })

  it('起点在外时吸附到边界并向内推进 insetM', () => {
    const snapped = snapIntoRegion([-20, 5], square, 2)
    expect(snapped[0]).toBeGreaterThan(0)
    expect(snapped[0]).toBeLessThan(5)
    expect(pointInPoly(snapped[0], snapped[1], square)).toBe(true)
  })
})

describe('buildMeanderPath（河流/道路确定性蜿蜒·治手抄坐标断连）', () => {
  it('首尾端点钉死不动，顶点数落在 8~14', () => {
    const from = [0, 0]
    const to = [1000, 200]
    const path = buildMeanderPath({ from, to, meander: 0.5, seed: 'river-1' })
    expect(path[0]).toEqual(from)
    expect(path[path.length - 1]).toEqual(to)
    expect(path.length).toBeGreaterThanOrEqual(8)
    expect(path.length).toBeLessThanOrEqual(14)
  })

  it('同 seed 恒形，不同 seed 不同形', () => {
    const a = buildMeanderPath({ from: [0, 0], to: [500, 500], meander: 0.4, seed: 'x' })
    const b = buildMeanderPath({ from: [0, 0], to: [500, 500], meander: 0.4, seed: 'x' })
    const c = buildMeanderPath({ from: [0, 0], to: [500, 500], meander: 0.4, seed: 'y' })
    expect(a).toEqual(b)
    expect(a).not.toEqual(c)
  })

  it('途经点参与骨架，首尾仍钉死', () => {
    const path = buildMeanderPath({ from: [0, 0], to: [100, 0], waypoints: [[50, 30]], meander: 0.3, seed: 'w' })
    expect(path[0]).toEqual([0, 0])
    expect(path[path.length - 1]).toEqual([100, 0])
  })
})

describe('polygonsOverlap / vectorToBearing / resolvePlacementClear（重叠检测与自动推开）', () => {
  it('相交/包含判为重叠，相离判为不重叠', () => {
    const near = [[5, 5], [15, 5], [15, 15], [5, 15]]
    const far = [[100, 100], [110, 100], [110, 110], [100, 110]]
    expect(polygonsOverlap(square, near)).toBe(true)
    expect(polygonsOverlap(square, far)).toBe(false)
  })

  it('vectorToBearing 命中八方位（y 向南）', () => {
    expect(vectorToBearing(1, 0)).toBe('东')
    expect(vectorToBearing(0, -1)).toBe('北')
    expect(vectorToBearing(1, 1)).toBe('东南')
  })

  it('推开后不再与障碍重叠，位移量为 stepM 整数倍', () => {
    const build = (c) => [[c[0] - 3, c[1] - 3], [c[0] + 3, c[1] - 3], [c[0] + 3, c[1] + 3], [c[0] - 3, c[1] + 3]]
    const result = resolvePlacementClear({ start: [5, 5], build, obstacles: [square], stepM: 4 })
    expect(result.clear).toBe(true)
    expect(polygonsOverlap(result.pts, square)).toBe(false)
    expect(result.shiftedM % 4).toBe(0)
  })

  it('超出 maxSteps 仍撞时 clear=false', () => {
    const hugeObstacle = [[-1000, -1000], [1000, -1000], [1000, 1000], [-1000, 1000]]
    const build = (c) => [[c[0] - 1, c[1] - 1], [c[0] + 1, c[1] - 1], [c[0] + 1, c[1] + 1], [c[0] - 1, c[1] + 1]]
    const result = resolvePlacementClear({ start: [0, 0], build, obstacles: [hugeObstacle], stepM: 10, maxSteps: 2 })
    expect(result.clear).toBe(false)
  })

  it('确定性：同输入多次调用位移一致（无随机）', () => {
    const build = (c) => [[c[0] - 3, c[1] - 3], [c[0] + 3, c[1] - 3], [c[0] + 3, c[1] + 3], [c[0] - 3, c[1] + 3]]
    const a = resolvePlacementClear({ start: [5, 5], build, obstacles: [square], stepM: 4 })
    const b = resolvePlacementClear({ start: [5, 5], build, obstacles: [square], stepM: 4 })
    expect(a).toEqual(b)
  })
})

describe('expandedHullOf（探索范围自动包络·迷雾不再手画）', () => {
  const oldExplored = [[0, 0], [100, 0], [100, 100], [0, 100]]

  it('外扩后仍完整涵盖所有输入点', () => {
    const newFeaturePts = [[150, 50]]
    const hull = expandedHullOf([oldExplored, newFeaturePts], 50, 'sheet-1')
    for (const p of [...oldExplored, ...newFeaturePts]) {
      expect(pointInPoly(p[0], p[1], hull)).toBe(true)
    }
  })

  it('新包围盒涵盖旧包围盒（能通过 expandExplored 只增不减检查）', () => {
    const oldBox = bboxOf(oldExplored)
    const hull = expandedHullOf([oldExplored, [[150, 50]]], 50, 'sheet-1')
    const newBox = bboxOf(hull)
    expect(newBox.minX).toBeLessThanOrEqual(oldBox.minX)
    expect(newBox.minY).toBeLessThanOrEqual(oldBox.minY)
    expect(newBox.maxX).toBeGreaterThanOrEqual(oldBox.maxX)
    expect(newBox.maxY).toBeGreaterThanOrEqual(oldBox.maxY)
  })

  it('顶点数落在 10~16', () => {
    const hull = expandedHullOf([oldExplored], 30, 'seed-a')
    expect(hull.length).toBeGreaterThanOrEqual(10)
    expect(hull.length).toBeLessThanOrEqual(16)
  })

  it('确定性：同 seed 恒形', () => {
    const a = expandedHullOf([oldExplored], 30, 'seed-a')
    const b = expandedHullOf([oldExplored], 30, 'seed-a')
    expect(a).toEqual(b)
  })
})

// ── 海拔分层设色（地图视觉大改批1·2026-07-11）：resolveElevationM/elevationTint/civicRegionBucket ──
describe('resolveElevationM（类目缺省海拔兜底）', () => {
  it('显式给了海拔用显式值，哪怕是 0', () => {
    expect(resolveElevationM('mountain', 800)).toBe(800)
    expect(resolveElevationM('water', 0)).toBe(0)
  })

  it('未给按类目缺省表兜底：山2500/高原1200/林300/草150/城50/水0', () => {
    expect(resolveElevationM('mountain')).toBe(CATEGORY_DEFAULT_ELEVATION_M.mountain)
    expect(resolveElevationM('plateau')).toBe(1200)
    expect(resolveElevationM('forest')).toBe(300)
    expect(resolveElevationM('grass')).toBe(150)
    expect(resolveElevationM('urban')).toBe(50)
    expect(resolveElevationM('water')).toBe(0)
  })

  it('批2 新增六类缺省海拔：丘陵400/沙漠300/沼泽50/冰原4500/雨林350/农田100', () => {
    expect(resolveElevationM('hill')).toBe(400)
    expect(resolveElevationM('desert')).toBe(300)
    expect(resolveElevationM('swamp')).toBe(50)
    expect(resolveElevationM('ice')).toBe(4500)
    expect(resolveElevationM('jungle')).toBe(350)
    expect(resolveElevationM('farmland')).toBe(100)
  })

  it('真正未知的类目才兜底 150m（近似平地）', () => {
    expect(resolveElevationM('nonexistent-category')).toBe(150)
  })
})

describe('elevationTint（8 档海拔色带）', () => {
  it('边界值落入正确档位（左闭右开，末档 ≥5000 兜底）', () => {
    expect(elevationTint(0)).toBe(ELEVATION_BANDS[0].color)
    expect(elevationTint(99)).toBe(ELEVATION_BANDS[0].color)
    expect(elevationTint(100)).toBe(ELEVATION_BANDS[1].color)
    expect(elevationTint(4999)).toBe(ELEVATION_BANDS[6].color)
    expect(elevationTint(5000)).toBe(ELEVATION_BANDS[7].color)
    expect(elevationTint(9000)).toBe(ELEVATION_BANDS[7].color)
  })

  it('非法输入按 0 处理', () => {
    expect(elevationTint(NaN)).toBe(ELEVATION_BANDS[0].color)
  })
})

describe('civicRegionBucket（人文三色底判定）', () => {
  it('山地系类目（含批2 hill/jungle）恒记绿，哪怕海拔低', () => {
    expect(civicRegionBucket('mountain', 10)).toBe('green')
    expect(civicRegionBucket('forest', 50)).toBe('green')
    expect(civicRegionBucket('hill', 10)).toBe('green')
    expect(civicRegionBucket('jungle', 10)).toBe('green')
  })

  it('非山地类目按海拔阈值 600m 判定', () => {
    expect(civicRegionBucket('grass')).toBe('white') // 缺省 150m
    expect(civicRegionBucket('plateau')).toBe('green') // 缺省 1200m
    expect(civicRegionBucket('grass', 700)).toBe('green')
    expect(civicRegionBucket('grass', 599)).toBe('white')
  })

  it('批2 desert/swamp/farmland 缺省海拔<600m 记白；ice 缺省4500m≥600m 自然记绿（拍板接受的规则副作用）', () => {
    expect(civicRegionBucket('desert')).toBe('white')
    expect(civicRegionBucket('swamp')).toBe('white')
    expect(civicRegionBucket('farmland')).toBe('white')
    expect(civicRegionBucket('ice')).toBe('green')
  })
})

describe('specialSurfaceColorVar（特殊地表专色单点判定·批2）', () => {
  it('desert/swamp/ice 三类返回对应 CSS 变量名', () => {
    expect(specialSurfaceColorVar('desert')).toBe('--mc-special-desert')
    expect(specialSurfaceColorVar('swamp')).toBe('--mc-special-swamp')
    expect(specialSurfaceColorVar('ice')).toBe('--mc-special-ice')
  })

  it('非特殊地表类目返回 undefined（渲染端据此回退到正常海拔色带）', () => {
    expect(specialSurfaceColorVar('mountain')).toBeUndefined()
    expect(specialSurfaceColorVar('hill')).toBeUndefined()
    expect(specialSurfaceColorVar('grass')).toBeUndefined()
  })
})

// ── 造形笔刷参数扩展（地图视觉大改批2·2026-07-11）：buildRidgePolygon/buildArcPath/buildIsletCluster/coastRoughness ──
describe('buildShapePolygon coastRoughness（海岸破碎度）', () => {
  it('不给 coastRoughness 时行为与批1 完全一致（无回归）', () => {
    const withOpt = buildShapePolygon({ cx: 0, cy: 0, rx: 500, ry: 500, seed: 'x' })
    const without = buildShapePolygon({ cx: 0, cy: 0, rx: 500, ry: 500, seed: 'x', coastRoughness: 0 })
    expect(withOpt).toEqual(without)
  })

  it('coastRoughness 越大顶点越密、抖动幅度越大（同 seed 对照）', () => {
    const low = buildShapePolygon({ cx: 0, cy: 0, rx: 500, ry: 500, seed: 'coast', coastRoughness: 0.2 })
    const high = buildShapePolygon({ cx: 0, cy: 0, rx: 500, ry: 500, seed: 'coast', coastRoughness: 0.9 })
    expect(high.length).toBeGreaterThanOrEqual(low.length)
    const maxRadial = (pts) => Math.max(...pts.map(([x, y]) => Math.hypot(x, y) / 500))
    expect(maxRadial(high)).toBeGreaterThan(maxRadial(low))
  })

  it('确定性：同 seed+coastRoughness 恒形', () => {
    const a = buildShapePolygon({ cx: 100, cy: 200, rx: 400, ry: 400, seed: 'coast-2', coastRoughness: 0.6 })
    const b = buildShapePolygon({ cx: 100, cy: 200, rx: 400, ry: 400, seed: 'coast-2', coastRoughness: 0.6 })
    expect(a).toEqual(b)
  })
})

describe('buildRidgePolygon（条状山脊·画"山脉一条一条"）', () => {
  it('确定性：同 seed 永远同形状，不同 seed 不同形状', () => {
    const a = buildRidgePolygon({ from: [0, 0], to: [1000, 3000], width: 800, seed: 'ridge-a' })
    const b = buildRidgePolygon({ from: [0, 0], to: [1000, 3000], width: 800, seed: 'ridge-a' })
    const c = buildRidgePolygon({ from: [0, 0], to: [1000, 3000], width: 800, seed: 'ridge-b' })
    expect(a).toEqual(b)
    expect(a).not.toEqual(c)
  })

  it('闭合多边形（≥4 顶点，region 最少点数要求满足）', () => {
    const pts = buildRidgePolygon({ from: [0, 0], to: [2000, 0], width: 600, seed: 'ridge-line' })
    expect(pts.length).toBeGreaterThanOrEqual(4)
  })

  it('两端收窄（taper）：taper 越大，端部宽度相对中段越窄', () => {
    const noTaper = buildRidgePolygon({ from: [0, 0], to: [0, 4000], width: 1000, taper: 0, roughness: 0, seed: 'taper-0' })
    const bigTaper = buildRidgePolygon({ from: [0, 0], to: [0, 4000], width: 1000, taper: 0.9, roughness: 0, seed: 'taper-0' })
    // roughness=0 时首点即端点左边缘，x 坐标偏移量=端部半宽；taper 越大端部半宽越小
    const endHalfWidthNoTaper = Math.abs(noTaper[0][0])
    const endHalfWidthBigTaper = Math.abs(bigTaper[0][0])
    expect(endHalfWidthBigTaper).toBeLessThan(endHalfWidthNoTaper)
  })
})

describe('buildArcPath（规整圆弧·"城墙笔直/规整弧线不歪扭"）', () => {
  it('jitter=0 时零随机：全部顶点到圆心距离恒等于半径', () => {
    const pts = buildArcPath({ center: [100, 200], radiusM: 500, fromAngle: 0, toAngle: Math.PI })
    for (const [x, y] of pts) {
      expect(Math.hypot(x - 100, y - 200)).toBeCloseTo(500, 6)
    }
  })

  it('起止角命中：首点=fromAngle 处坐标，末点=toAngle 处坐标', () => {
    const pts = buildArcPath({ center: [0, 0], radiusM: 100, fromAngle: 0, toAngle: Math.PI / 2 })
    expect(pts[0][0]).toBeCloseTo(100, 6)
    expect(pts[0][1]).toBeCloseTo(0, 6)
    expect(pts[pts.length - 1][0]).toBeCloseTo(0, 6)
    expect(pts[pts.length - 1][1]).toBeCloseTo(100, 6)
  })

  it('jitter>0 时需要 seed 保证确定性：同 seed 恒形，不同 seed 不同形', () => {
    const a = buildArcPath({ center: [0, 0], radiusM: 500, fromAngle: 0, toAngle: Math.PI, jitter: 0.03, seed: 'arc-a' })
    const b = buildArcPath({ center: [0, 0], radiusM: 500, fromAngle: 0, toAngle: Math.PI, jitter: 0.03, seed: 'arc-a' })
    const c = buildArcPath({ center: [0, 0], radiusM: 500, fromAngle: 0, toAngle: Math.PI, jitter: 0.03, seed: 'arc-b' })
    expect(a).toEqual(b)
    expect(a).not.toEqual(c)
  })
})

describe('buildIsletCluster（伴生小岛群）', () => {
  it('确定性：同 seed 恒形，不同 seed 不同形', () => {
    const a = buildIsletCluster({ around: [0, 0], count: 4, seed: 'cluster-a' })
    const b = buildIsletCluster({ around: [0, 0], count: 4, seed: 'cluster-a' })
    const c = buildIsletCluster({ around: [0, 0], count: 4, seed: 'cluster-b' })
    expect(a).toEqual(b)
    expect(a).not.toEqual(c)
  })

  it('count 钳位 1~12，返回对应数量的多边形，每个多边形≥3点', () => {
    expect(buildIsletCluster({ around: [0, 0], count: 4, seed: 'x' }).length).toBe(4)
    expect(buildIsletCluster({ around: [0, 0], count: 30, seed: 'x' }).length).toBe(12)
    expect(buildIsletCluster({ around: [0, 0], count: 0, seed: 'x' }).length).toBe(1)
    for (const poly of buildIsletCluster({ around: [0, 0], count: 3, seed: 'x' })) {
      expect(poly.length).toBeGreaterThanOrEqual(3)
    }
  })

  it('各小岛质心与 around 的距离不超过 spreadM+单岛最大半径（散布范围可控）', () => {
    const spreadM = 800
    const maxSizeM = 200
    const islets = buildIsletCluster({ around: [500, 500], count: 6, spreadM, maxSizeM, seed: 'bound' })
    for (const poly of islets) {
      const cx = poly.reduce((s, p) => s + p[0], 0) / poly.length
      const cy = poly.reduce((s, p) => s + p[1], 0) / poly.length
      expect(Math.hypot(cx - 500, cy - 500)).toBeLessThanOrEqual(spreadM + maxSizeM)
    }
  })
})

// ── 真机反馈底层修复（2026-07-11）：buildShapePolygon 自相交防护 + clipPolygonToParent ──────
function hasSelfIntersection(poly) {
  const n = poly.length
  for (let i = 0; i < n; i++) {
    const a1 = poly[i]; const a2 = poly[(i + 1) % n]
    for (let j = i + 1; j < n; j++) {
      // 跳过共享端点的相邻边（含首尾闭合的那对相邻边）
      if (j === i || (j + 1) % n === i || j === (i + 1) % n) continue
      const b1 = poly[j]; const b2 = poly[(j + 1) % n]
      if (segmentsIntersect(a1, a2, b1, b2)) return true
    }
  }
  return false
}

describe('buildShapePolygon 自相交防护（真机修 #27：coastRoughness 高档不再自交）', () => {
  const levels = [0.2, 0.5, 0.8]
  const seeds = ['coast-simple-a', 'coast-simple-b', 'coast-simple-c']

  for (const cr of levels) {
    it(`coastRoughness=${cr} 时生成的多边形无自相交（多 seed 抽样）`, () => {
      for (const seed of seeds) {
        const poly = buildShapePolygon({ cx: 0, cy: 0, rx: 600, ry: 350, seed: `${seed}-${cr}`, coastRoughness: cr })
        expect(hasSelfIntersection(poly)).toBe(false)
      }
    })
  }

  it('同 seed 两次生成完全相等（确定性未被修复破坏）', () => {
    const a = buildShapePolygon({ cx: 0, cy: 0, rx: 500, ry: 300, seed: 'coast-repeat', coastRoughness: 0.8 })
    const b = buildShapePolygon({ cx: 0, cy: 0, rx: 500, ry: 300, seed: 'coast-repeat', coastRoughness: 0.8 })
    expect(a).toEqual(b)
  })
})

describe('clipPolygonToParent（嵌套内核裁进外层边界内·真机修 #24 几何基建）', () => {
  const bigSquare = [[0, 0], [100, 0], [100, 100], [0, 100]]

  it('child 明显超出 parent：裁剪后所有顶点都落在 parent 内', () => {
    const child = [[-50, -50], [150, -50], [150, 150], [-50, 150]]
    const clipped = clipPolygonToParent(child, bigSquare)
    expect(clipped).toHaveLength(child.length)
    for (const [x, y] of clipped) {
      expect(pointInPoly(x, y, bigSquare)).toBe(true)
    }
  })

  it('child 完全在 parent 内：形状不变', () => {
    const child = [[10, 10], [40, 10], [40, 40], [10, 40]]
    const clipped = clipPolygonToParent(child, bigSquare)
    expect(clipped).toEqual(child)
  })

  it('部分顶点在外、部分在内：在内的原样保留，在外的被收回边界内', () => {
    const child = [[50, 50], [150, 50], [50, 150]]
    const clipped = clipPolygonToParent(child, bigSquare)
    expect(clipped[0]).toEqual([50, 50])
    expect(pointInPoly(clipped[1][0], clipped[1][1], bigSquare)).toBe(true)
    expect(pointInPoly(clipped[2][0], clipped[2][1], bigSquare)).toBe(true)
  })

  it('确定性：无随机，重复调用输出一致', () => {
    const child = [[-20, 50], [120, 50], [50, 150], [50, -20]]
    const a = clipPolygonToParent(child, bigSquare)
    const b = clipPolygonToParent(child, bigSquare)
    expect(a).toEqual(b)
  })
})

// ── 非凸 parent 极限验证（笔刷约束系统批D·地形阶段分层拔升泛化·研究_00 障碍6）──────────────
// 验证结论（写进 clipPolygonToParent/clipPolygonToParentConcave 注释，此处用可复现用例锁定）：
// ①纯"逐顶点投影"对非凸 parent 失效——两个都判定"已在内"的相邻顶点，连线仍可能直穿凹口（straddle 用例）；
// ②"稠密化+逐点独立投影"仍不够——凹口两侧墙各自最近，密度再高也不会有采样点最近于凹口底部，两簇独立
// 收敛点之间依旧直连；③根治="稠密化+边界巡边 splice"（检测到相邻投影点跨越不相邻的 parent 边就把跳过的
// parent 顶点插回去）——对"分批拔升"典型形态（child 与 parent 大致同心/同量级重叠，不是被凹口整个横向
// 切成两半）验证近乎精确（残留穿出量≈inset 极小量级）且不自相交；④诚实边界：child 相对 parent 凹口
// 严重不对称偏置、或被凹口整个切成两块完全不连通区域时，单多边形表达法结构性做不到完美——前者巡边顶点
// 选择仍可能产生局部自相交，后者会在凹口底部产生一段来回重叠的退化窄缝；两者都不升级到 Weiler-Atherton
// 等可输出多个多边形的通用布尔裁剪库（复杂度/收益比不划算，真实地形嵌套场景子要素多与 parent 大致同心
// 重叠或被完全切两半概率都很低，中间地带的"偏置"个案留给批F 画廊真机复看再评估是否需要收紧）。
describe('clipPolygonToParent 非凸 parent 极限（星形凹口验证+稠密化/边界巡边修复）', () => {
  // 5 角星（凹五边形）非凸 parent：外接半径 1000，内凹半径 350——比矩形凹口更贴近"造形函数常见的
  // 破碎/带凹口海岸线"观感。同心稍大 child（半径 1100 八边形）是本函数真正服务的现实用例（地形阶段
  // 分层拔升：小/中核心整体压在不规则大轮廓内部/边缘，与 parent 大致同心，不会被凹口横向切两半）。
  function starPolygon(cx, cy, rOuter, rInner, points) {
    const pts = []
    for (let i = 0; i < points * 2; i++) {
      const r = i % 2 === 0 ? rOuter : rInner
      const angle = (Math.PI * i) / points - Math.PI / 2
      pts.push([cx + r * Math.cos(angle), cy + r * Math.sin(angle)])
    }
    return pts
  }
  function octagon(cx, cy, r) {
    const pts = []
    for (let i = 0; i < 8; i++) {
      const angle = (Math.PI * 2 * i) / 8
      pts.push([cx + r * Math.cos(angle), cy + r * Math.sin(angle)])
    }
    return pts
  }
  const starParent = starPolygon(0, 0, 1000, 350, 5)
  const concentricChild = octagon(0, 0, 1100)
  // 凹口方向上的一点（沿内凹顶点 1 的射线、半径 500——超出内凹半径 350 但仍在外接半径 1000 内）：
  // 验证 parent 确实非凸（这个方向上比外凸尖角更早"出界"）。
  const bayAngle = (Math.PI * 1) / 5 - Math.PI / 2
  const bayProbe = [500 * Math.cos(bayAngle), 500 * Math.sin(bayAngle)]

  it('前提验证：星形 parent 确实非凸（凹口方向上的点判外）；同心 child 明显超出星形范围', () => {
    expect(pointInPoly(bayProbe[0], bayProbe[1], starParent)).toBe(false)
    for (const [x, y] of concentricChild) expect(pointInPoly(x, y, starParent)).toBe(false)
  })

  it('稠密化+边界巡边修复后：裁剪结果沿每条边采样都落在 parent 内（残留穿出≈inset 极小量级），不自相交', () => {
    const clipped = clipPolygonToParent(concentricChild, starParent)
    // 修复生效的直接证据：顶点数显著多于输入（凸 parent 场景不会发生，见下一条用例对照）
    expect(clipped.length).toBeGreaterThan(concentricChild.length)
    expect(hasSelfIntersection(clipped)).toBe(false)
    const n = clipped.length
    for (let i = 0; i < n; i++) {
      const a = clipped[i]; const b = clipped[(i + 1) % n]
      for (let t = 0; t <= 1; t += 0.05) {
        const x = a[0] + (b[0] - a[0]) * t
        const y = a[1] + (b[1] - a[1]) * t
        const inside = pointInPoly(x, y, starParent)
        // 阈值 1m：验证"近乎精确"而非仅仅"比旧实现好一点"——真实旧 bug（straddle 用例）穿出量级是
        // 50m（notch 半宽），这里锁定到 1m 内证明巡边确实找回了凹口边界，不是碰巧压线。
        const closeToBoundary = distanceToPolygonBoundary([x, y], starParent) < 1
        expect(inside || closeToBoundary).toBe(true)
      }
    }
  })

  it('确定性：非凸分支同样无随机，重复调用输出一致', () => {
    const a = clipPolygonToParent(concentricChild, starParent)
    const b = clipPolygonToParent(concentricChild, starParent)
    expect(a).toEqual(b)
  })

  it('凸 parent 不触发稠密化/巡边：输出与批A 原实现逐顶点一致，真机行为零回归', () => {
    const convexParent = [[0, 0], [100, 0], [100, 100], [0, 100]]
    const child = [[-50, -50], [150, -50], [150, 150], [-50, 150]]
    const clipped = clipPolygonToParent(child, convexParent)
    expect(clipped).toHaveLength(child.length)
  })

  it('诚实边界（不做过度宣称）：child 被凹口完全切成两块互不连通的区域时，纯顶点投影两端点都判"已在内"不会被拉回——连接两者的边仍会直穿凹口', () => {
    // U 形凹口：0~300 方形，凹口 x:100~200 从 y:150 一路凹到顶边 y:300。
    const uShapeParent = [[0, 0], [300, 0], [300, 300], [200, 300], [200, 150], [100, 150], [100, 300], [0, 300]]
    // 跨凹口矩形：四角落在 U 的左右两翼内且全程不触达凹口底部（y:150）——两翼之间在这个 child 的
    // 范围内本就是两块不连通区域，单多边形裁剪结构性做不到完美表达（结论③④的可复现证据）。
    const straddleChild = [[50, 200], [250, 200], [250, 280], [50, 280]]
    for (const [x, y] of straddleChild) expect(pointInPoly(x, y, uShapeParent)).toBe(true)
    expect(pointInPoly(150, 200, uShapeParent)).toBe(false)
  })
})

// ── 笔刷属性表 BRUSH_SPEC（地图分阶段作画与笔刷约束系统批A·2026-07-11）──
describe('closeRing / isClosedRing（收编自 mapSampleWorld/mapBrushShowcase 两处私有重复定义）', () => {
  it('closeRing 无条件把首点追加到末尾；空数组原样返回', () => {
    const pts = [[0, 0], [10, 0], [10, 10]]
    expect(closeRing(pts)).toEqual([[0, 0], [10, 0], [10, 10], [0, 0]])
    expect(closeRing([])).toEqual([])
  })

  it('isClosedRing：首尾坐标相同且≥3点判真；否则判假（含<3点恒假）', () => {
    expect(isClosedRing([[0, 0], [10, 0], [10, 10], [0, 0]])).toBe(true)
    expect(isClosedRing([[0, 0], [10, 0], [10, 10]])).toBe(false)
    expect(isClosedRing([[0, 0], [0, 0]])).toBe(false)
  })
})

describe('BRUSH_SPEC（笔刷属性表单点真值）', () => {
  const REGION_LIST = ['mountain', 'forest', 'grass', 'plateau', 'water', 'urban', 'hill', 'desert', 'swamp', 'ice', 'jungle', 'farmland']
  const PATH_LIST = ['river', 'road', 'street', 'wall', 'border', 'canal', 'trail', 'bridge']
  const MARKER_LIST = [
    'building', 'organization', 'landmark', 'ferry', 'character',
    'capital', 'castle', 'temple', 'ruin', 'mine', 'cave', 'port', 'gate', 'inn', 'tower'
  ]

  it('region(12)/path(8)/marker(15) 全类目建行，kind 与旧三集合分组一致', () => {
    for (const c of REGION_LIST) expect(BRUSH_SPEC[c]?.kind).toBe('region')
    for (const c of PATH_LIST) expect(BRUSH_SPEC[c]?.kind).toBe('path')
    for (const c of MARKER_LIST) expect(BRUSH_SPEC[c]?.kind).toBe('marker')
    expect(Object.keys(BRUSH_SPEC)).toHaveLength(REGION_LIST.length + PATH_LIST.length + MARKER_LIST.length)
  })

  it('BRUSH_REGION/PATH/MARKER_CATEGORIES 派生集合与旧三集合成员一致', () => {
    expect(new Set(BRUSH_REGION_CATEGORIES)).toEqual(new Set(REGION_LIST))
    expect(new Set(BRUSH_PATH_CATEGORIES)).toEqual(new Set(PATH_LIST))
    expect(new Set(BRUSH_MARKER_CATEGORIES)).toEqual(new Set(MARKER_LIST))
  })

  it('REGION_SIZE_RANGE 派生视图与旧值一致（抽查代表类目）', () => {
    expect(REGION_SIZE_RANGE.mountain).toEqual({ min: 500, max: 80000 })
    expect(REGION_SIZE_RANGE.urban).toEqual({ min: 100, max: 200000 })
    expect(REGION_SIZE_RANGE.hill).toEqual({ min: 200, max: 12000 })
    expect(REGION_SIZE_RANGE.farmland).toEqual({ min: 100, max: 25000 })
    // path/marker 无量级区间（列可空）
    expect(REGION_SIZE_RANGE.river).toBeUndefined()
    expect(REGION_SIZE_RANGE.building).toBeUndefined()
  })

  it('meanderDefault 收编自旧硬编 if/else：8 个 path 类目数值不变', () => {
    expect(BRUSH_SPEC.river.meanderDefault).toBe(0.5)
    expect(BRUSH_SPEC.road.meanderDefault).toBe(0.25)
    expect(BRUSH_SPEC.trail.meanderDefault).toBe(0.35)
    expect(BRUSH_SPEC.border.meanderDefault).toBe(0.2)
    expect(BRUSH_SPEC.canal.meanderDefault).toBe(0.1)
    expect(BRUSH_SPEC.wall.meanderDefault).toBe(0.08)
    expect(BRUSH_SPEC.bridge.meanderDefault).toBe(0.03)
    expect(BRUSH_SPEC.street.meanderDefault).toBe(0.15)
  })

  it('allowedSurface：land 类目落笔硬门覆盖对象（road/street/wall/trail/大部分 marker）；ferry/port/character/bridge/river/canal/border/water=both', () => {
    for (const c of ['road', 'street', 'wall', 'trail', 'building', 'landmark', 'capital', 'gate']) {
      expect(BRUSH_SPEC[c].allowedSurface).toBe('land')
    }
    for (const c of ['ferry', 'port', 'character', 'bridge', 'river', 'canal', 'border', 'water']) {
      expect(BRUSH_SPEC[c].allowedSurface).toBe('both')
    }
  })

  it('connectivity：wall/border=closed_ring；river/road/street/canal/trail/bridge=endpoint_snap（river 额外 directional_flow 只登记不激活）', () => {
    expect(BRUSH_SPEC.wall.connectivity).toEqual(['closed_ring'])
    expect(BRUSH_SPEC.border.connectivity).toEqual(['closed_ring'])
    for (const c of ['river', 'road', 'street', 'canal', 'trail', 'bridge']) {
      expect(BRUSH_SPEC[c].connectivity).toContain('endpoint_snap')
    }
    expect(BRUSH_SPEC.river.connectivity).toContain('directional_flow')
  })

  it('nesting（批D 泛化：地形族 9 类目共享同一父类目集，非 mountain 独占）：mountain/forest/grass/plateau/hill/desert/swamp/ice/jungle=must_be_inside_parent 且父类目集互相包含彼此+自身；water/urban/farmland/building 仍=none', () => {
    const TERRAIN_FAMILY = ['mountain', 'forest', 'grass', 'plateau', 'hill', 'desert', 'swamp', 'ice', 'jungle']
    for (const c of TERRAIN_FAMILY) {
      expect(BRUSH_SPEC[c].nesting).toBe('must_be_inside_parent')
      expect(new Set(BRUSH_SPEC[c].nestingParentCategories)).toEqual(new Set(TERRAIN_FAMILY))
    }
    for (const c of ['water', 'urban', 'farmland', 'building']) {
      expect(BRUSH_SPEC[c].nesting).toBe('none')
    }
  })

  it('slopeMode 批C 接线：road/street/trail/canal=hard_ceiling 带初版防荒谬值；其余类目仍=none（批A"全类目=none"断言已被批C 接线取代）', () => {
    const ACTIVATED = {
      road: { slopeHardMaxPct: 150, slopeGradeBands: [25, 60, 100] },
      street: { slopeHardMaxPct: 100, slopeGradeBands: [15, 40] },
      trail: { slopeHardMaxPct: 300, slopeGradeBands: [60, 150] },
      canal: { slopeHardMaxPct: 15, slopeGradeBands: [5, 10] }
    }
    for (const c of [...REGION_LIST, ...PATH_LIST, ...MARKER_LIST]) {
      if (ACTIVATED[c]) {
        expect(BRUSH_SPEC[c].slopeMode).toBe('hard_ceiling')
        expect(BRUSH_SPEC[c].slopeHardMaxPct).toBe(ACTIVATED[c].slopeHardMaxPct)
        expect(BRUSH_SPEC[c].slopeGradeBands).toEqual(ACTIVATED[c].slopeGradeBands)
      } else {
        expect(BRUSH_SPEC[c].slopeMode).toBe('none')
        expect(BRUSH_SPEC[c].slopeHardMaxPct).toBeUndefined()
        expect(BRUSH_SPEC[c].slopeGradeBands).toBeUndefined()
      }
    }
  })

  it('CATEGORY_DEFAULT_ELEVATION_M 由 BRUSH_SPEC.defaultElevationM 派生，旧值不变（含批2 六类）', () => {
    expect(CATEGORY_DEFAULT_ELEVATION_M).toEqual({
      mountain: 2500, plateau: 1200, forest: 300, grass: 150, urban: 50, water: 0,
      hill: 400, desert: 300, swamp: 50, ice: 4500, jungle: 350, farmland: 100
    })
  })

  it('widthProfileDefault（批W）：仅 river/canal 登记宽度剖面缺省，其余类目不带', () => {
    expect(BRUSH_SPEC.river.widthProfileDefault).toEqual({ sourceWidthM: 6, mouthWidthM: 160, growthExponent: 0.5 })
    expect(BRUSH_SPEC.canal.widthProfileDefault).toEqual({ sourceWidthM: 10, mouthWidthM: 14, growthExponent: 1 })
    expect(BRUSH_SPEC.road.widthProfileDefault).toBeUndefined()
    expect(BRUSH_SPEC.water.widthProfileDefault).toBeUndefined()
  })
})

describe('resolveCrossRule（跨类目重叠规则·crossRules 定稿·计划书 7.11·批W 实装）', () => {
  it('禁叠 9 对定稿恒 forbid，参数顺序不影响（对称查询）', () => {
    const FORBID_PAIRS = [
      ['water', 'water'], ['urban', 'urban'], ['water', 'urban'],
      ['water', 'farmland'], ['water', 'desert'], ['urban', 'farmland'],
      ['desert', 'swamp'], ['desert', 'jungle'], ['ice', 'jungle']
    ]
    for (const [a, b] of FORBID_PAIRS) {
      expect(resolveCrossRule(a, b)).toBe('forbid')
      expect(resolveCrossRule(b, a)).toBe('forbid')
    }
  })

  it('water×mountain 不再是 forbid（旧四对之一改判条件放行：尺寸帽硬门在工具层单独实装，不走禁叠表）', () => {
    expect(resolveCrossRule('water', 'mountain')).toBe('allow')
    expect(resolveCrossRule('mountain', 'water')).toBe('allow')
  })

  it('原拿不准五对用户全数放行：desert-ice/swamp-urban/urban-ice/swamp-ice/swamp-farmland', () => {
    expect(resolveCrossRule('desert', 'ice')).toBe('allow')
    expect(resolveCrossRule('swamp', 'urban')).toBe('allow')
    expect(resolveCrossRule('urban', 'ice')).toBe('allow')
    expect(resolveCrossRule('swamp', 'ice')).toBe('allow')
    expect(resolveCrossRule('swamp', 'farmland')).toBe('allow')
  })

  it('未登记的类目对缺省 allow（地形分层拔升嵌套/滨水植被等不需要逐对穷举）', () => {
    expect(resolveCrossRule('forest', 'water')).toBe('allow')
    expect(resolveCrossRule('mountain', 'mountain')).toBe('allow')
    expect(resolveCrossRule('road', 'urban')).toBe('allow')
    expect(resolveCrossRule('water', 'swamp')).toBe('allow')
    expect(resolveCrossRule('ice', 'mountain')).toBe('allow')
  })
})

// ── widenSpine 变宽水体形体引擎（地图分阶段作画与笔刷约束系统批W·2026-07-11）──
describe('widenSpine（中心线+宽度剖面→两岸闭合多边形）', () => {
  // 直线中心线（沿 x 正向）：法向量=(0,1)/(0,-1)，左右岸 y 偏移即有向半宽，断言最直观
  const straightSpine = [[0, 0], [500, 0], [1000, 0], [1500, 0], [2000, 0], [2500, 0], [3000, 0], [3500, 0], [4000, 0], [4500, 0], [5000, 0]]

  it('确定性：同 seed 恒形，不同 seed 不同形', () => {
    const opts = { spine: straightSpine, widthProfile: { sourceWidthM: 10, mouthWidthM: 60 } }
    const a = widenSpine({ ...opts, seed: 'ws-a' })
    const b = widenSpine({ ...opts, seed: 'ws-a' })
    const c = widenSpine({ ...opts, seed: 'ws-b' })
    expect(a).toEqual(b)
    expect(a).not.toEqual(c)
  })

  it('输出闭合多边形语义：顶点数=2×中心线点数（≤帽值时），<2 点中心线返回空数组', () => {
    const ring = widenSpine({ spine: straightSpine, seed: 'ws-ring' })
    expect(ring.length).toBe(straightSpine.length * 2)
    expect(widenSpine({ spine: [[0, 0]], seed: 'x' })).toEqual([])
    expect(widenSpine({ spine: [], seed: 'x' })).toEqual([])
  })

  it('顶点数帽：超长中心线（200 点）产出顶点数不超过 60（downsample 惯例）', () => {
    const longSpine = Array.from({ length: 200 }, (_, i) => [i * 100, 0])
    const ring = widenSpine({ spine: longSpine, seed: 'ws-long' })
    expect(ring.length).toBeLessThanOrEqual(60)
    expect(ring.length).toBeGreaterThanOrEqual(3)
  })

  it('宽度沿程递增（缺省剖面 t^0.5）：下游对应点对的间距大于上游点对', () => {
    const ring = widenSpine({ spine: straightSpine, widthProfile: { sourceWidthM: 8, mouthWidthM: 120 }, leftRoughness: 0, rightRoughness: 0, seed: 'ws-grow' })
    const n = straightSpine.length
    // 环序=left 正向 + right 反向：left[i]=ring[i]，right[i]=ring[2n-1-i]
    const widthAt = (i) => Math.abs(ring[i][1] - ring[2 * n - 1 - i][1])
    expect(widthAt(2)).toBeLessThan(widthAt(n - 2))
    // 剖面中点宽度界于源头/末端之间（单调递增形状）
    expect(widthAt(Math.floor(n / 2))).toBeGreaterThan(widthAt(1))
    expect(widthAt(Math.floor(n / 2))).toBeLessThan(widthAt(n - 1))
  })

  it('源头收口缺省 taper：首点两岸重合于中心线起点；sourceCap=flat 时不收', () => {
    const tapered = widenSpine({ spine: straightSpine, widthProfile: { sourceWidthM: 40, mouthWidthM: 40 }, seed: 'ws-cap' })
    const n = straightSpine.length
    expect(tapered[0]).toEqual([0, 0])
    expect(tapered[2 * n - 1]).toEqual([0, 0])
    const flat = widenSpine({ spine: straightSpine, widthProfile: { sourceWidthM: 40, mouthWidthM: 40 }, sourceCap: 'flat', seed: 'ws-cap' })
    expect(Math.abs(flat[0][1] - flat[2 * n - 1][1])).toBeGreaterThan(10)
  })

  it('入海喇叭 mouthCap=flare：末端宽度显著大于 flat 版，且展开只增不减', () => {
    const profile = { sourceWidthM: 10, mouthWidthM: 40 }
    const flat = widenSpine({ spine: straightSpine, widthProfile: profile, seed: 'ws-flare' })
    const flared = widenSpine({ spine: straightSpine, widthProfile: profile, mouthCap: 'flare', seed: 'ws-flare' })
    const n = straightSpine.length
    const widthOf = (ring, i) => Math.abs(ring[i][1] - ring[2 * n - 1 - i][1])
    expect(widthOf(flared, n - 1)).toBeGreaterThan(widthOf(flat, n - 1) * 2)
    // 喇叭区外（上游 60% 处）不受影响
    expect(widthOf(flared, 6)).toBeCloseTo(widthOf(flat, 6), 6)
  })

  it('两岸非对称：左右岸独立 rng——对称直线中心线上左右偏移量不逐点互为镜像', () => {
    const ring = widenSpine({ spine: straightSpine, widthProfile: { sourceWidthM: 60, mouthWidthM: 60 }, sourceCap: 'flat', seed: 'ws-asym' })
    const n = straightSpine.length
    let asymmetricCount = 0
    for (let i = 0; i < n; i++) {
      const leftAbs = Math.abs(ring[i][1])
      const rightAbs = Math.abs(ring[2 * n - 1 - i][1])
      if (Math.abs(leftAbs - rightAbs) > 0.5) asymmetricCount++
    }
    expect(asymmetricCount).toBeGreaterThan(n / 2)
  })

  it('leftRoughness/rightRoughness 独立生效：右岸高碎时右岸相邻点偏移方差明显大于左岸', () => {
    const ring = widenSpine({
      spine: straightSpine, widthProfile: { sourceWidthM: 60, mouthWidthM: 60 },
      leftRoughness: 0.02, rightRoughness: 0.5, sourceCap: 'flat', seed: 'ws-rough'
    })
    const n = straightSpine.length
    const spreadOf = (values) => Math.max(...values) - Math.min(...values)
    const leftOffsets = []
    const rightOffsets = []
    for (let i = 1; i < n; i++) {
      leftOffsets.push(Math.abs(ring[i][1]))
      rightOffsets.push(Math.abs(ring[2 * n - 1 - i][1]))
    }
    expect(spreadOf(rightOffsets)).toBeGreaterThan(spreadOf(leftOffsets) * 3)
  })

  it('半宽钳位防自交：急弯短段中心线+超大宽度，两岸偏移不超过相邻段长 48%+抖动上限，多边形无自相交', () => {
    const zigzag = [[0, 0], [100, 0], [100, 100], [0, 100], [0, 200], [100, 200]]
    const ring = widenSpine({ spine: zigzag, widthProfile: { sourceWidthM: 400, mouthWidthM: 400 }, sourceCap: 'flat', seed: 'ws-clamp' })
    // 每个顶点到中心线的距离 ≤ 48（相邻段最短 100m × 0.48）+ 数值容差
    for (const pt of ring) {
      expect(nearestPointOnPolyline(pt, zigzag).distance).toBeLessThanOrEqual(48 + 1e-6)
    }
    expect(hasSelfIntersection(ring)).toBe(false)
  })

  it('halfWidths 逐点半宽精修出口：长度匹配时优先于 widthProfile 生效', () => {
    const spine = [[0, 0], [1000, 0], [2000, 0]]
    const ring = widenSpine({ spine, halfWidths: [0, 200, 30], leftRoughness: 0, rightRoughness: 0, sourceCap: 'flat', seed: 'ws-hw' })
    expect(Math.abs(ring[1][1] - ring[4][1])).toBeCloseTo(400, 6)
    expect(Math.abs(ring[2][1] - ring[3][1])).toBeCloseTo(60, 6)
  })
})

// ── 阶段状态机（笔刷约束系统批D·阶段管线·零迁移 meta.stage/meta.confirmedAtStage）──────────────
describe('阶段状态机：featureConfirmedStage/featureBornStage/deriveCurrentStage/isFeatureLockedAtStage', () => {
  it('MAP_STAGE_ORDER 三阶段固定顺序：地形→水系→人文', () => {
    expect(MAP_STAGE_ORDER).toEqual(['terrain', 'water', 'civic'])
  })

  it('featureConfirmedStage/featureBornStage：合法枚举值才认，脏数据/无 meta/无字段一律 null（存量豁免）', () => {
    expect(featureConfirmedStage({ meta: { confirmedAtStage: 'water' } })).toBe('water')
    expect(featureConfirmedStage({ meta: { confirmedAtStage: 'not-a-stage' } })).toBeNull()
    expect(featureConfirmedStage({ meta: null })).toBeNull()
    expect(featureConfirmedStage(null)).toBeNull()
    expect(featureConfirmedStage(undefined)).toBeNull()
    expect(featureBornStage({ meta: { stage: 'terrain' } })).toBe('terrain')
    expect(featureBornStage({ meta: {} })).toBeNull()
  })

  it('deriveCurrentStage：无任何确认戳=terrain（新世界/纯存量世界）；最高确认戳+1 前进；civic 已确认后维持 civic 不再前进', () => {
    expect(deriveCurrentStage([])).toBe('terrain')
    expect(deriveCurrentStage([{ meta: null }, { meta: { shape: {} } }])).toBe('terrain')
    expect(deriveCurrentStage([{ meta: { confirmedAtStage: 'terrain' } }])).toBe('water')
    expect(deriveCurrentStage([
      { meta: { confirmedAtStage: 'terrain' } },
      { meta: { confirmedAtStage: 'water' } }
    ])).toBe('civic')
    expect(deriveCurrentStage([{ meta: { confirmedAtStage: 'civic' } }])).toBe('civic')
    // 只看最高档：即便同时存在 terrain/civic 混杂确认戳（理论不该发生，防御性验证），取最高
    expect(deriveCurrentStage([
      { meta: { confirmedAtStage: 'civic' } },
      { meta: { confirmedAtStage: 'terrain' } }
    ])).toBe('civic')
  })

  it('isFeatureLockedAtStage：Lock 语义——已确认阶段早于当前阶段才锁；未盖戳/同阶段/晚于当前一律不锁', () => {
    expect(isFeatureLockedAtStage({ meta: { confirmedAtStage: 'terrain' } }, 'water')).toBe(true)
    expect(isFeatureLockedAtStage({ meta: { confirmedAtStage: 'terrain' } }, 'civic')).toBe(true)
    expect(isFeatureLockedAtStage({ meta: { confirmedAtStage: 'water' } }, 'water')).toBe(false)
    expect(isFeatureLockedAtStage({ meta: null }, 'civic')).toBe(false)
    expect(isFeatureLockedAtStage({ meta: { confirmedAtStage: 'civic' } }, 'terrain')).toBe(false)
  })
})

// ── 网格坐标系（地图草案剪影可视化计划批4·2026-07-12）：computeMapGridSpec/formatMapGridRef/mapGridColumnLetter ──
// 给人读的列字母+行数字网格（如 D5）：档位表 10/20/50/100/200/500km，取满足 max(cols,rows)≤14 的最小档；
// 精确坐标给机器、格号给人，换算全在前端做（纯函数，不依赖 DOM）。
describe('computeMapGridSpec（网格档位选择·自适应约12×12）', () => {
  it('小世界选最小档：跨度远小于 10km×14 时 cellM=10000（米）', () => {
    const spec = computeMapGridSpec({ minX: 0, minY: 0, maxX: 5000, maxY: 3000 })
    expect(spec.cellM).toBe(10000)
    expect(spec.cols).toBe(1)
    expect(spec.rows).toBe(1)
  })

  it('世界跨度增大时逐档升级到满足 max(cols,rows)≤14 的最小档', () => {
    const cases = [
      { span: 50000, expectedCellM: 10000 }, // 50km：10km 档 5 格
      { span: 200000, expectedCellM: 20000 }, // 200km：10km 档 20 格超限，20km 档 10 格
      { span: 500000, expectedCellM: 50000 }, // 500km：20km 档 25 格超限，50km 档 10 格
      { span: 900000, expectedCellM: 100000 }, // 900km：50km 档 18 格超限，100km 档 9 格
      { span: 2000000, expectedCellM: 200000 }, // 2000km：100km 档 20 格超限，200km 档 10 格
      { span: 5000000, expectedCellM: 500000 } // 5000km：200km 档 25 格超限，500km 档 10 格（恰好满足，非封顶兜底）
    ]
    for (const { span, expectedCellM } of cases) {
      const spec = computeMapGridSpec({ minX: 0, minY: 0, maxX: span, maxY: span })
      expect(spec.cellM).toBe(expectedCellM)
      expect(Math.max(spec.cols, spec.rows)).toBeLessThanOrEqual(14)
    }
  })

  it('大世界封顶 500km：连最大档都无法满足 ≤14 格时仍用 500km（不再无限放大格边长）', () => {
    const spec = computeMapGridSpec({ minX: 0, minY: 0, maxX: 20000000, maxY: 20000000 })
    expect(spec.cellM).toBe(500000)
    expect(Math.max(spec.cols, spec.rows)).toBeGreaterThan(14)
  })

  it('origin 对齐格线：向下取整到 cellM 整数倍（含负坐标），且不晚于 bounds 左上角', () => {
    const spec = computeMapGridSpec({ minX: -12345, minY: -500, maxX: 3000, maxY: 8000 })
    // “整数倍”只看数值是否整除，不关心 JS 取模在整除时可能产出 -0（Object.is 会区分 -0/0，故不用 toBe(0)）
    expect(spec.originX % spec.cellM === 0).toBe(true)
    expect(spec.originY % spec.cellM === 0).toBe(true)
    expect(spec.originX).toBeLessThanOrEqual(-12345)
    expect(spec.originY).toBeLessThanOrEqual(-500)
  })
})

describe('formatMapGridRef / mapGridColumnLetter（坐标→格号，人读列字母+行数字）', () => {
  const spec = { cellM: 1000, originX: 0, originY: 0, cols: 5, rows: 3 }

  it('四角命中：西北=A1，东北=末列首行，西南=首列末行，东南=末列末行', () => {
    expect(formatMapGridRef(0, 0, spec)).toBe('A1')
    expect(formatMapGridRef(4999, 0, spec)).toBe('E1')
    expect(formatMapGridRef(0, 2999, spec)).toBe('A3')
    expect(formatMapGridRef(4999, 2999, spec)).toBe('E3')
  })

  it('越界（含恰好等于右/下边界）返回空串', () => {
    expect(formatMapGridRef(-1, 0, spec)).toBe('')
    expect(formatMapGridRef(5000, 0, spec)).toBe('') // 恰好=cols*cellM，右越界
    expect(formatMapGridRef(0, -1, spec)).toBe('')
    expect(formatMapGridRef(0, 3000, spec)).toBe('') // 恰好=rows*cellM，下越界
  })

  it('mapGridColumnLetter：0~25=A~Z，26 起 AA/AB 续列（防御性，正常 ≤14 格用不到）', () => {
    expect(mapGridColumnLetter(0)).toBe('A')
    expect(mapGridColumnLetter(25)).toBe('Z')
    expect(mapGridColumnLetter(26)).toBe('AA')
    expect(mapGridColumnLetter(27)).toBe('AB')
    expect(mapGridColumnLetter(51)).toBe('AZ')
    expect(mapGridColumnLetter(52)).toBe('BA')
  })

  it('formatMapGridRef 越过 26 列时格号带 AA 续列', () => {
    const wideSpec = { cellM: 1000, originX: 0, originY: 0, cols: 30, rows: 1 }
    expect(formatMapGridRef(26500, 0, wideSpec)).toBe('AA1')
  })
})
