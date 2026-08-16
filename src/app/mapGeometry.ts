// 地图系统 · 几何纯函数库 + 要素类型（批1 渲染样例·2026-07-10 地图系统计划书）
// 全部函数确定性：随机只来自 mulberry32(seed)，同 seed 永远同图（渲染端禁不可复现随机——计划书关键点）。
// 坐标系：平面直角，单位=米；x 向东，y 向南（北=−y，与 SVG 一致）。

export type MapPoint = [number, number]

export type MapFeatureKind = 'region' | 'path' | 'marker'
export type MapLayer = 'terrain' | 'civic'

/** 地图要素（批4 数据骨架的视图形状；批1 由样例数据提供） */
export type MapFeature = {
  id: string
  kind: MapFeatureKind
  /** 地形类：mountain/forest/grass/plateau/water；人文类：urban/river/road/street/building/organization/landmark/ferry/character */
  category: string
  name: string
  layer: MapLayer
  /** region=轮廓多边形；path=折线；marker=单点 */
  pts: MapPoint[]
  /** 山脉走向脊线（category=mountain 专用，符号沿脊两排布阵） */
  spine?: MapPoint[]
  /** 变宽水体两岸闭合多边形（笔刷约束系统批W·category=river/canal 专用，widenSpine 产物）：只在渲染端
   *  出现，不落库——geometry.pts 中心线才是持久真值，bank 永远由「中心线+seed+宽度剖面」单向派生（禁止
   *  独立修改 bank，改中心线后重新算）；有 bank 才走填色渲染，无 bank（存量河/未设 widthProfile）仍细线
   *  渲染，见 MapCanvas.vue。派生逻辑见 MapViewerDialog.vue（真世界从
   *  meta.shape.widthProfile 重算）两处调用点。 */
  bank?: MapPoint[]
  /** 碎折参数（水域/城镇/高原边缘中点位移） */
  rough?: { iter: number; amp: number }
  /** 海拔米数（批1·地图视觉大改·物理真值）：驱动地形视图的海拔分层设色与人文视图的山地/陆地判定；
   *  缺省按类目走 CATEGORY_DEFAULT_ELEVATION_M 兜底表（旧数据永久兜底口径，非过渡层）。 */
  elevationM?: number
  /** 水体装甲视图字段：水深与层级由 meta.armor 投影，旧单层水域均缺省。 */
  waterDepthM?: number
  waterDepthRatio?: number
  waterRole?: 'surface' | 'depth-band'
  /** sprawl=沿主轴斜排大字距铺满；spread=labelAt 定点大字距；缺省=小标 */
  labelMode?: 'sprawl' | 'spread'
  labelAt?: MapPoint
  labelNudge?: MapPoint
  labelDx?: number
  labelDy?: number
  /** 标签 LOD：比例小于该值时隐藏标签 */
  labelMin?: number
  /** 要素 LOD：比例小于该值时整体隐藏 */
  minScale?: number
  /** 状态系统联动锚点（批7 实装真数据；批1 指向样例状态卡） */
  links?: { panelId?: string; hostType?: string; hostId?: string }
}

export type MapWorldData = {
  name: string
  sheet?: string
  /** 已探范围多边形：迷雾挖洞 + 陆地底色 + 已探面积三合一真值（正式版=绘舆agent 随冒险扩张） */
  explored: { pts: MapPoint[] }
  features: MapFeature[]
}

/** 对照模式高亮配置（批L 地图版本历史）：MapCanvas 按此把变更集三色强调（add=绿描边/update=琥珀描边）、
 *  其余要素整体变灰；deleteGhosts=已删除要素的快照几何（红色虚线幽灵轮廓，不参与交互点选）。
 *  作为 prop 随 :key 重挂生效（MapCanvas 命令式建景，不动态改景）。 */
export type MapChangeHighlight = {
  addIds: string[]
  updateIds: string[]
  deleteGhosts: Array<{ id: string; kind: MapFeatureKind | string; pts: MapPoint[] }>
}

/** 确定性伪随机（同 seed 同序列） */
export function mulberry32(seed: number): () => number {
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed)
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t
    return ((t ^ t >>> 14) >>> 0) / 4294967296
  }
}

export function hashStr(s: string): number {
  let h = 1779033703
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 3432918353)
    h = h << 13 | h >>> 19
  }
  return h >>> 0
}

export function pointInPoly(x: number, y: number, pts: MapPoint[]): boolean {
  let inside = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0]; const yi = pts[i][1]; const xj = pts[j][0]; const yj = pts[j][1]
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/** 鞋带公式多边形面积（m²） */
export function shoelace(pts: MapPoint[]): number {
  let s = 0
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]; const b = pts[(i + 1) % pts.length]
    s += a[0] * b[1] - b[0] * a[1]
  }
  return Math.abs(s) / 2
}

export function pathLength(pts: MapPoint[]): number {
  let s = 0
  for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])
  return s
}

export function centroid(pts: MapPoint[]): MapPoint {
  let x = 0; let y = 0
  for (let i = 0; i < pts.length; i++) { x += pts[i][0]; y += pts[i][1] }
  return [x / pts.length, y / pts.length]
}

export type MapBBox = { minX: number; minY: number; maxX: number; maxY: number }

export function bboxOf(pts: MapPoint[]): MapBBox {
  const b: MapBBox = { minX: 1e18, minY: 1e18, maxX: -1e18, maxY: -1e18 }
  for (const p of pts) {
    b.minX = Math.min(b.minX, p[0]); b.maxX = Math.max(b.maxX, p[0])
    b.minY = Math.min(b.minY, p[1]); b.maxY = Math.max(b.maxY, p[1])
  }
  return b
}

/** 点集主轴（PCA 单轴）：大区域标签沿主轴斜排的方向与跨度来源 */
export function principalAxis(pts: MapPoint[]): { c: MapPoint; theta: number; span: number } {
  const c = centroid(pts)
  let sxx = 0; let syy = 0; let sxy = 0
  for (const p of pts) {
    const dx = p[0] - c[0]; const dy = p[1] - c[1]
    sxx += dx * dx; syy += dy * dy; sxy += dx * dy
  }
  const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy)
  const cos = Math.cos(theta); const sin = Math.sin(theta)
  let min = 1e18; let max = -1e18
  for (const p of pts) {
    const t = (p[0] - c[0]) * cos + (p[1] - c[1]) * sin
    min = Math.min(min, t); max = Math.max(max, t)
  }
  return { c, theta, span: max - min }
}

/** 中点位移碎折：让海岸线/城郭边缘曲折尖锐（amp=位移幅度占段长比例） */
export function roughen(pts: MapPoint[], iter: number, amp: number, rng: () => number, closed = true): MapPoint[] {
  for (let it = 0; it < iter; it++) {
    const out: MapPoint[] = []
    const n = pts.length
    const segs = closed ? n : n - 1
    for (let i = 0; i < segs; i++) {
      const a = pts[i]; const b = pts[(i + 1) % n]
      out.push(a)
      const mx = (a[0] + b[0]) / 2; const my = (a[1] + b[1]) / 2
      const dx = b[0] - a[0]; const dy = b[1] - a[1]
      const len = Math.hypot(dx, dy) || 1
      const d = (rng() - 0.5) * 2 * amp * len
      out.push([mx - dy / len * d, my + dx / len * d])
    }
    if (!closed) out.push(pts[n - 1])
    pts = out
  }
  return pts
}

/** 多边形内符号播撒：行序抖动网格，y 升序遍历天然产生前后遮挡次序 */
export function scatterInPoly(pts: MapPoint[], spacing: number, rng: () => number, keep?: (x: number, y: number) => boolean): MapPoint[] {
  const b = bboxOf(pts)
  const out: MapPoint[] = []
  let row = 0
  for (let y = b.minY + spacing * 0.5; y < b.maxY; y += spacing * 0.82, row++) {
    for (let x = b.minX + (row % 2 ? spacing * 0.5 : 0); x < b.maxX; x += spacing) {
      const px = x + (rng() - 0.5) * spacing * 0.7
      const py = y + (rng() - 0.5) * spacing * 0.5
      if (!pointInPoly(px, py, pts)) continue
      if (keep && !keep(px, py)) continue
      out.push([px, py])
    }
  }
  return out
}

export type PolylineStop = { x: number; y: number; nx: number; ny: number }

/** 沿折线等距取点（带单位法向量）：山脉沿 spine 脊线布阵的采样器 */
export function alongPolyline(pts: MapPoint[], step: number, startOffset?: number): PolylineStop[] {
  const out: PolylineStop[] = []
  let acc = 0
  let next = startOffset === undefined ? step * 0.5 : startOffset
  for (let i = 1; i < pts.length; i++) {
    const ax = pts[i - 1][0]; const ay = pts[i - 1][1]; const bx = pts[i][0]; const by = pts[i][1]
    const len = Math.hypot(bx - ax, by - ay) || 1
    while (next <= acc + len) {
      const t = (next - acc) / len
      out.push({ x: ax + (bx - ax) * t, y: ay + (by - ay) * t, nx: -(by - ay) / len, ny: (bx - ax) / len })
      next += step
    }
    acc += len
  }
  return out
}

function cSeg(p0: MapPoint, p1: MapPoint, p2: MapPoint, p3: MapPoint): string {
  const c1x = p1[0] + (p2[0] - p0[0]) / 6; const c1y = p1[1] + (p2[1] - p0[1]) / 6
  const c2x = p2[0] - (p3[0] - p1[0]) / 6; const c2y = p2[1] - (p3[1] - p1[1]) / 6
  return `C${c1x.toFixed(1)} ${c1y.toFixed(1)},${c2x.toFixed(1)} ${c2y.toFixed(1)},${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`
}

/** Catmull-Rom 闭合平滑 path d（渲染端平滑=AI 画对四件套之一） */
export function catmullRomClosed(pts: MapPoint[]): string {
  const n = pts.length
  if (n < 3) return ''
  let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`
  for (let i = 0; i < n; i++) d += cSeg(pts[(i - 1 + n) % n], pts[i], pts[(i + 1) % n], pts[(i + 2) % n])
  return d + 'Z'
}

export function catmullRomOpen(pts: MapPoint[]): string {
  const n = pts.length
  if (n < 2) return ''
  let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`
  for (let i = 0; i < n - 1; i++) d += cSeg(pts[Math.max(0, i - 1)], pts[i], pts[i + 1], pts[Math.min(n - 1, i + 2)])
  return d
}

export function polyToPath(pts: MapPoint[], closed: boolean): string {
  let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`
  for (let i = 1; i < pts.length; i++) d += `L${pts[i][0].toFixed(1)} ${pts[i][1].toFixed(1)}`
  return closed ? d + 'Z' : d
}

/** 把开放顶点串闭合成环（首点重复到末尾）——环形城墙/疆界的画法出口（笔刷约束系统批A 收编：原为
 *  历史上多个地图入口曾重复定义，逻辑现单点收编于此。
 *  无条件追加首点（不判断是否已闭合）——调用方需自行判断闭合状态后再决定是否调用（见 huiyuMapTools 硬门用法）。 */
export function closeRing(pts: MapPoint[]): MapPoint[] {
  return pts.length ? [...pts, pts[0]] : pts
}

/** 环是否已闭合（首尾点坐标相同）。points<3 视为不构成环，按未闭合处理。 */
export function isClosedRing(pts: MapPoint[]): boolean {
  if (pts.length < 3) return false
  const first = pts[0]; const last = pts[pts.length - 1]
  return first[0] === last[0] && first[1] === last[1]
}

// ── 参数化造形（AI 画对四件套第1条·地图系统批5）──────────────
// 绘舆不裸写多边形：给中心/半径/形态/粗糙度/seed，这里确定性生成自然轮廓（同 seed 永远同形状），
// 渲染端 Catmull-Rom 再平滑。精修出口保留：绘舆也可直给顶点数组（drawMapPath 等）。

export type MapShapeForm = 'blob' | 'ellipse' | 'rect'

export function buildShapePolygon(opts: {
  cx: number
  cy: number
  /** 东西向半径（米）。 */
  rx: number
  /** 南北向半径（米）。 */
  ry: number
  /** blob=有机地块（山林湖泊·缺省）；ellipse=规整椭圆（湖/盆地）；rect=近矩形（城区/地块）。 */
  form?: MapShapeForm
  /** 边界抖动幅度 0~1（占半径比例）：blob 缺省 0.22、ellipse 0.1、rect 0.08。 */
  roughness?: number
  /** 确定性随机种子（数字或字符串·缺省用尺寸派生）——同 seed 同形状是持久性根基。 */
  seed?: number | string
  /** 采样顶点数（缺省 blob/ellipse=10·rect 固定 8=四角+边中点）。 */
  points?: number
  /** 海岸破碎度 0~1（可选·地图视觉大改批2）：在 roughness 基础上叠加更大抖动+更密顶点，
   *  画出曲折破碎的海岸线/群岛边界观感（参考图6/7）；不给=不叠加，原 roughness 行为不变。
   *  典型用于 category=water 的 region；数值越大越碎（建议 0.2 低碎～0.8 高碎）。 */
  coastRoughness?: number
}): MapPoint[] {
  const form: MapShapeForm = opts.form || 'blob'
  const seedNum = typeof opts.seed === 'string'
    ? hashStr(opts.seed)
    : (Number.isFinite(opts.seed as number) ? Number(opts.seed) : hashStr(`${opts.rx}x${opts.ry}`))
  const rng = mulberry32(seedNum)
  const rx = Math.max(1, Math.abs(opts.rx))
  const ry = Math.max(1, Math.abs(opts.ry))
  const baseRoughness = Math.max(0, Math.min(1, opts.roughness ?? (form === 'blob' ? 0.22 : form === 'ellipse' ? 0.1 : 0.08)))
  const coastBoost = Math.max(0, Math.min(1, opts.coastRoughness ?? 0))
  // 碎化幅度可超出普通 roughness 的 [0,1] 上限（海岸要比普通地块边界更夸张），封顶 1.6 防止自相交失控
  const roughness = coastBoost > 0 ? Math.min(1.6, baseRoughness + coastBoost * 1.1) : baseRoughness
  if (form === 'rect') {
    // 四角+边中点，法向抖动让边缘不死板；顶点顺序保持顺时针闭合
    const base: MapPoint[] = [
      [-rx, -ry], [0, -ry], [rx, -ry], [rx, 0],
      [rx, ry], [0, ry], [-rx, ry], [-rx, 0]
    ]
    const amp = roughness * Math.min(rx, ry)
    return base.map(([dx, dy]) => [
      opts.cx + dx + (rng() - 0.5) * 2 * amp,
      opts.cy + dy + (rng() - 0.5) * 2 * amp
    ])
  }
  // 碎化越高顶点越密（更多湾岬起伏）：普通形态顶点数上限 24，coastRoughness>0 时放宽到 32
  const n = Math.max(6, Math.min(coastBoost > 0 ? 32 : 24, Math.round((opts.points ?? 10) + coastBoost * 14)))
  const out: MapPoint[] = []
  for (let i = 0; i < n; i++) {
    // 角度均匀+轻抖（防顶点等距的机械感）：抖动幅度恒 < 步长一半（±0.45*(π/n)，相邻两点抖动之和上限
    // 0.9*(π/n) < 步长 2π/n），theta 数学上恒单调递增，不是自相交根因，故不改此式。
    const theta = (i / n) * Math.PI * 2 + (rng() - 0.5) * (Math.PI / n) * 0.9
    // radial 下限钳位 0.15（真机修 #27）：coastRoughness 把 roughness 上限推到 1.6 时，
    // 1+(rng-0.5)*2*roughness 理论上可低至 -0.6（负值=顶点翻到对面），导致相邻边自交；钳位后恒为正，
    // 配合上面恒单调的 theta，可数学保证生成的多边形是简单多边形（星形域：极角单调+半径恒正必不自交）。
    const radial = Math.max(0.15, 1 + (rng() - 0.5) * 2 * roughness)
    out.push([
      opts.cx + Math.cos(theta) * rx * radial,
      opts.cy + Math.sin(theta) * ry * radial
    ])
  }
  return out
}

/** 汉字八方位 → 单位向量（锚点相对定位用·y 向南故「北」=-y）。不认识的方位返回 null。 */
export function bearingToVector(bearing: string): MapPoint | null {
  const s = String(bearing || '').trim()
  const table: Record<string, MapPoint> = {
    '东': [1, 0], '西': [-1, 0], '南': [0, 1], '北': [0, -1],
    '东北': [Math.SQRT1_2, -Math.SQRT1_2], '东南': [Math.SQRT1_2, Math.SQRT1_2],
    '西北': [-Math.SQRT1_2, -Math.SQRT1_2], '西南': [-Math.SQRT1_2, Math.SQRT1_2]
  }
  return table[s] || null
}

// ── 笔刷属性表 BRUSH_SPEC（地图分阶段作画与笔刷约束系统批A·2026-07-11）───────────────────
// 单点真值：region(12)/path(8)/marker(15) 三态共 35 类目的约束描述全部收编于此一张表（列可空，不同
// kind 用不同列）；三画笔硬门（huiyuMapTools drawMapRegion/drawMapPath/drawMapMarker）与体检
// （auditMap）共读同一张表，不许两处各写一份。旧散落常量（REGION_SIZE_RANGE/FORBIDDEN_OVERLAP_PAIRS/
// CATEGORY_DEFAULT_ELEVATION_M/meander 硬编 if-else/水域卫兵白名单）全部改造成本表的派生视图或直接消费本表，
// 调用方旧名不断裂。
//
// 三层校验框架判据（研究_01 §4·Esri Attribute Rules 三分法照应）：造形层=确定性函数出口断言（不进本表）；
// 硬门层=落笔前只看自身+明确挂接的少量邻居（本表 crossRules/allowedSurface/connectivity/nesting 驱动）；
// 体检层=auditMap 事后全图扫描（只报不拦，本表同样驱动但走宽松阈值）。
//
// slopeMode/slopeHardMaxPct/slopeGradeBands 本批只建列不激活、不预设数值——具体坡度阈值待批C 结合
// 分析网格/坡度算法一并设计（避免本批凭空造未经验证的数值）；connectivity 里的 directional_flow 同理只登记，
// 判定逻辑（顺应地势单调不增）留给批C 的 elevationAt 接线。

export type BrushCategoryKind = MapFeatureKind
/** 可画地表：land=只能陆地／water=只能水域／both=不限（含"本身即定义水面"的 water 类目，以及
 *  ferry/port/character/bridge/river/canal/border 等天然贴水或跨水类目）。 */
export type BrushAllowedSurface = 'land' | 'water' | 'both'
/** 类目对跨类目关系（region-region 放置卫兵用）：forbid=禁止重叠／require_bridge=需借桥梁类语义跨越
 *  （本批未激活任何判定，仅登记占位供未来 path-region 交叉校验挂接，呼应 iD"Intersection without junction"
 *  的桥例外思路）／allow=不限（缺省，未登记的类目对一律视为 allow，不需要逐对穷举）。 */
export type BrushCrossRuleValue = 'forbid' | 'require_bridge' | 'allow'
/** 连通性需求集合（一个类目可同时具备多种，故设计成数组而非单值枚举——如 river 需要同时具备
 *  endpoint_snap 与 directional_flow）：endpoint_snap=端点须吸附到 snapTargets 指定类目／
 *  closed_ring=须首尾闭合成环／directional_flow=须顺应地势单调流向（本批只登记不判定，批C 接）。 */
export type BrushConnectivityKind = 'endpoint_snap' | 'closed_ring' | 'directional_flow'
/** 坡度模式（本批只建列不激活）。 */
export type BrushSlopeMode = 'none' | 'hard_ceiling' | 'graded'

/** 端点吸附目标（connectivity 含 endpoint_snap 时生效）：逐条列出"落在哪类要素的多少米内视为合法着陆"——
 *  不同目标类型容差不同（画对硬化批A/B 既有 evaluateEndpointLanding 设计），不能拍平成一个数。 */
export type BrushSnapTarget =
  | { targetKind: 'region'; categories: string[]; okWithinM: number }
  | { targetKind: 'path'; categories: string[]; okWithinM: number }
  | { targetKind: 'marker'; okWithinM: number }
  | { targetKind: 'exploredBoundary'; okWithinM: number }

export interface BrushSpecRow {
  kind: BrushCategoryKind
  allowedSurface: BrushAllowedSurface
  /** 跨类目重叠规则：key=对方 category；未登记的对一律 allow（用 resolveCrossRule 查，不要直接读本字段）。 */
  crossRules?: Record<string, BrushCrossRuleValue>
  /** region 专用：半径合理区间（米，量级卫兵用）——半径=中心到边缘距离，等于知识库第四节"整体跨度"的
   *  一半（例：知识库写丘陵跨度 0.5~20km，本表 hill.sizeRange 对应 rxM/ryM≈250~10000，不是 500~20000）。
   *  真机事故对症（笔刷约束系统批B·2026-07-12）：曾把跨度数字原样填进 rxM 导致 7 笔连续撞硬顶，
   *  drawMapRegion 的 rxM/ryM 参数描述与超限回执都必须明确这条换算关系，不能只写"半径"两个字。 */
  sizeRange?: { min: number; max: number }
  /** path 专用：蜿蜒度缺省值 0~1。 */
  meanderDefault?: number
  connectivity: BrushConnectivityKind[]
  /** connectivity 含 endpoint_snap 时的吸附目标列表；无此需求留空。 */
  snapTargets?: BrushSnapTarget[]
  nesting: 'none' | 'must_be_inside_parent'
  /** nesting=must_be_inside_parent 时：允许当"父"的类目集合。 */
  nestingParentCategories?: string[]
  slopeMode: BrushSlopeMode
  slopeHardMaxPct?: number
  slopeGradeBands?: number[]
  /** region 专用：类目缺省海拔（米）；path/marker 当前无消费路径，留空（同旧 CATEGORY_DEFAULT_ELEVATION_M 口径）。 */
  defaultElevationM?: number
  /** path 专用（笔刷约束系统批W·仅 river/canal 登记）：widenSpine 宽度剖面缺省值——drawMapPath 未显式给
   *  widthProfile 时按此兜底。数值口径见 widenSpine 函数注释与 widenSpine 定义上方的研究引用。 */
  widthProfileDefault?: WidenSpineWidthProfile
}

const SNAP_WATER_100: BrushSnapTarget = { targetKind: 'region', categories: ['water'], okWithinM: 100 }
const SNAP_EXPLORED_200: BrushSnapTarget = { targetKind: 'exploredBoundary', okWithinM: 200 }
/** civic 基础设施类端点吸附目标（road/street/trail/bridge 共用：marker/urban region/civic path 三类·各 100m 容差）。
 *  bridge 本批沿用此通用组（批C 再升级为 findNearestLegalBank 真实接岸感知，见计划书 7.4）。 */
function civicInfraSnapTargets(pathCategories: string[]): BrushSnapTarget[] {
  return [
    { targetKind: 'marker', okWithinM: 100 },
    { targetKind: 'region', categories: ['urban'], okWithinM: 100 },
    { targetKind: 'path', categories: pathCategories, okWithinM: 100 },
    SNAP_EXPLORED_200
  ]
}

/** 地形族 region 类目（笔刷约束系统批D·阶段管线「地形阶段分层拔升」泛化）：批A 只有 mountain 自嵌套一例
 *  （nestingParentCategories:['mountain']），本批把"高有效海拔叠低者→自动 clipPolygonToParent 裁进内部；
 *  否则硬拒"泛化到整个陆地地形族（不含 water——water×mountain 走批W 独立的尺寸帽机制，若把 water 也塞进
 *  这张表会被当普通嵌套误裁/误拒，与"合法则原地放行"语义冲突，见 drawMapRegion 内 water×mountain 大注释）。
 *  行为影响（对照旧真相需知悉）：以前 forest/grass/hill 等类目互相重叠没有任何嵌套判定（自由重叠）；本批后，
 *  同族任意两个类目部分重叠时，新画的一方必须海拔更高才允许（自动裁进对方内部），否则硬拒——这是"分批拔升"
 *  思想在地形层的必然要求，不是意外收紧。 */
const TERRAIN_NESTING_FAMILY = ['mountain', 'forest', 'grass', 'plateau', 'hill', 'desert', 'swamp', 'ice', 'jungle']

export const BRUSH_SPEC: Record<string, BrushSpecRow> = {
  // ── region（12）── mountain/forest/grass/plateau/hill/desert/swamp/ice/jungle 九类共享 TERRAIN_NESTING_FAMILY
  // （笔刷约束系统批D 泛化，见上方常量注释）；water/urban/farmland 不在此列（各自另有独立跨类目规则）。
  mountain: {
    kind: 'region', allowedSurface: 'land',
    crossRules: {},
    sizeRange: { min: 500, max: 80000 },
    connectivity: [], nesting: 'must_be_inside_parent', nestingParentCategories: TERRAIN_NESTING_FAMILY,
    slopeMode: 'none', defaultElevationM: 2500
  },
  forest: {
    kind: 'region', allowedSurface: 'land', sizeRange: { min: 300, max: 30000 }, connectivity: [],
    nesting: 'must_be_inside_parent', nestingParentCategories: TERRAIN_NESTING_FAMILY, slopeMode: 'none', defaultElevationM: 300
  },
  grass: {
    kind: 'region', allowedSurface: 'land', sizeRange: { min: 200, max: 50000 }, connectivity: [],
    nesting: 'must_be_inside_parent', nestingParentCategories: TERRAIN_NESTING_FAMILY, slopeMode: 'none', defaultElevationM: 150
  },
  plateau: {
    kind: 'region', allowedSurface: 'land', sizeRange: { min: 500, max: 50000 }, connectivity: [],
    nesting: 'must_be_inside_parent', nestingParentCategories: TERRAIN_NESTING_FAMILY, slopeMode: 'none', defaultElevationM: 1200
  },
  water: {
    kind: 'region', allowedSurface: 'both',
    // water 自身即定义水面：与 urban/water 自身/farmland/desert 禁止重叠（收编自旧 FORBIDDEN_OVERLAP_PAIRS
    // 四对 + crossRules 定稿①新增两对，计划书 7.11）。⚠️mountain 不在此列：water×mountain 改判「条件放行」
    // （山中水体尺寸帽+海拔继承，7.11②），实装为 drawMapRegion 内独立的尺寸帽硬门，不走这张 forbid 表——
    // 若在此重新登记 mountain:'forbid'，会被当普通禁叠对待自动推开，破坏"合法则原地放行"的语义。
    crossRules: { urban: 'forbid', water: 'forbid', farmland: 'forbid', desert: 'forbid' },
    sizeRange: { min: 50, max: 100000 },
    connectivity: [], nesting: 'none', slopeMode: 'none', defaultElevationM: 0
  },
  urban: {
    kind: 'region', allowedSurface: 'land',
    // urban×farmland 新增（crossRules 定稿①）：建成区与农田同地矛盾，相邻即可不必重叠。
    crossRules: { urban: 'forbid', farmland: 'forbid' },
    // urban 上限 200km（2026-07-11 真机复盘放宽·原 5km）：见旧 REGION_SIZE_RANGE 注释，大笔造城已有草案确认环人门。
    sizeRange: { min: 100, max: 200000 },
    connectivity: [], nesting: 'none', slopeMode: 'none', defaultElevationM: 50
  },
  hill: {
    kind: 'region', allowedSurface: 'land', sizeRange: { min: 200, max: 12000 }, connectivity: [],
    nesting: 'must_be_inside_parent', nestingParentCategories: TERRAIN_NESTING_FAMILY, slopeMode: 'none', defaultElevationM: 400
  },
  // desert×swamp/desert×jungle 新增（crossRules 定稿①·干湿矛盾）：登记在 desert 一侧即可，resolveCrossRule 双向查询。
  desert: {
    kind: 'region', allowedSurface: 'land', crossRules: { swamp: 'forbid', jungle: 'forbid' }, sizeRange: { min: 500, max: 60000 }, connectivity: [],
    nesting: 'must_be_inside_parent', nestingParentCategories: TERRAIN_NESTING_FAMILY, slopeMode: 'none', defaultElevationM: 300
  },
  swamp: {
    kind: 'region', allowedSurface: 'land', sizeRange: { min: 100, max: 12000 }, connectivity: [],
    nesting: 'must_be_inside_parent', nestingParentCategories: TERRAIN_NESTING_FAMILY, slopeMode: 'none', defaultElevationM: 50
  },
  // ice×jungle 新增（crossRules 定稿①·冰原雨林矛盾）。
  ice: {
    kind: 'region', allowedSurface: 'land', crossRules: { jungle: 'forbid' }, sizeRange: { min: 500, max: 80000 }, connectivity: [],
    nesting: 'must_be_inside_parent', nestingParentCategories: TERRAIN_NESTING_FAMILY, slopeMode: 'none', defaultElevationM: 4500
  },
  jungle: {
    kind: 'region', allowedSurface: 'land', sizeRange: { min: 300, max: 40000 }, connectivity: [],
    nesting: 'must_be_inside_parent', nestingParentCategories: TERRAIN_NESTING_FAMILY, slopeMode: 'none', defaultElevationM: 350
  },
  // farmland 不入地形族（civic 层农田，不参与"地形分层拔升"嵌套裁剪）。
  farmland: { kind: 'region', allowedSurface: 'land', sizeRange: { min: 100, max: 25000 }, connectivity: [], nesting: 'none', slopeMode: 'none', defaultElevationM: 100 },

  // ── path（8）── meanderDefault 收编自旧 drawMapPath 硬编 if/else；snapTargets 收编自旧
  // evaluateEndpointLanding 两硬编分支（river/road-or-street），canal/trail/bridge 为批A 新覆盖（沿用同族语义，
  // 具体真实语义待批C 精修，见计划书 7.2/7.4）。
  river: {
    kind: 'path', allowedSurface: 'both', meanderDefault: 0.5,
    connectivity: ['endpoint_snap', 'directional_flow'],
    snapTargets: [SNAP_WATER_100, { targetKind: 'path', categories: ['river'], okWithinM: 100 }, { targetKind: 'region', categories: ['mountain'], okWithinM: 0 }, SNAP_EXPLORED_200],
    nesting: 'none', slopeMode: 'none',
    // 宽度剖面缺省（笔刷约束系统批W·研究_05 §5.1"批W 变宽河流笔刷参数表"）：源头6m 小溪→入海口160m 大河
    // 口径为本批手设（研究稿给的是比例/指数，不是绝对米数，符合计划书"v1=参数化手设"定位）；growthExponent
    // 取研究_05 §1.2/§5.1"河宽沿程增长指数 b（W∝Q^b）≈0.5"实测值（可直接抄）——width(t)=source+(mouth-source)·
    // t^0.5，用弧长比例 t 代理真实流量 Q（批E 接 Strahler/flux 前的诚实简化，非精确水力学）。
    widthProfileDefault: { sourceWidthM: 6, mouthWidthM: 160, growthExponent: 0.5 }
  },
  // slopeHardMaxPct/slopeGradeBands 单位=坡度百分比（Δ海拔/水平距离×100，天际线式表达）：批C 接线激活，
  // 取值=保守宽松的初版防荒谬值（只拦"100m 爬升 3000m"级荒谬地形，正常画法不受影响），具体阈值待批F
  // 画廊调优收紧。滑动窗口判定见 mapAnalysisGrid.validatePathGrade（窗口=max(2×cellSize,500m)，
  // 防台阶单格假峭壁把数值推到无穷）；gradeBands 最高档只进 auditMap 体检 warning，不拦落笔。
  road: {
    kind: 'path', allowedSurface: 'land', meanderDefault: 0.25,
    connectivity: ['endpoint_snap'], snapTargets: civicInfraSnapTargets(['road', 'street']),
    nesting: 'none', slopeMode: 'hard_ceiling', slopeHardMaxPct: 150, slopeGradeBands: [25, 60, 100]
  },
  street: {
    kind: 'path', allowedSurface: 'land', meanderDefault: 0.15,
    connectivity: ['endpoint_snap'], snapTargets: civicInfraSnapTargets(['road', 'street']),
    nesting: 'none', slopeMode: 'hard_ceiling', slopeHardMaxPct: 100, slopeGradeBands: [15, 40]
  },
  wall: { kind: 'path', allowedSurface: 'land', meanderDefault: 0.08, connectivity: ['closed_ring'], nesting: 'none', slopeMode: 'none' },
  border: { kind: 'path', allowedSurface: 'both', meanderDefault: 0.2, connectivity: ['closed_ring'], nesting: 'none', slopeMode: 'none' },
  canal: {
    kind: 'path', allowedSurface: 'both', meanderDefault: 0.1,
    connectivity: ['endpoint_snap'],
    snapTargets: [SNAP_WATER_100, { targetKind: 'path', categories: ['river', 'canal'], okWithinM: 100 }, SNAP_EXPLORED_200],
    nesting: 'none', slopeMode: 'hard_ceiling', slopeHardMaxPct: 15, slopeGradeBands: [5, 10],
    // 运河=人工水道，近恒宽（工程线，非自然沿程递增）：源头10m→末端14m 轻微放宽，growthExponent 对近恒宽
    // 场景影响很小，仍写 1（线性）保持公式统一、不特判。
    widthProfileDefault: { sourceWidthM: 10, mouthWidthM: 14, growthExponent: 1 }
  },
  trail: {
    kind: 'path', allowedSurface: 'land', meanderDefault: 0.35,
    connectivity: ['endpoint_snap'], snapTargets: civicInfraSnapTargets(['road', 'street', 'trail']),
    nesting: 'none', slopeMode: 'hard_ceiling', slopeHardMaxPct: 300, slopeGradeBands: [60, 150]
  },
  bridge: {
    kind: 'path', allowedSurface: 'both', meanderDefault: 0.03,
    connectivity: ['endpoint_snap'], snapTargets: civicInfraSnapTargets(['road', 'street']),
    nesting: 'none', slopeMode: 'none'
  },

  // ── marker（15）── allowedSurface='both' 三类=旧水域卫兵白名单原样收编（ferry/port 贴水语义、character 可能在船上）。
  building: { kind: 'marker', allowedSurface: 'land', connectivity: [], nesting: 'none', slopeMode: 'none' },
  organization: { kind: 'marker', allowedSurface: 'land', connectivity: [], nesting: 'none', slopeMode: 'none' },
  landmark: { kind: 'marker', allowedSurface: 'land', connectivity: [], nesting: 'none', slopeMode: 'none' },
  ferry: { kind: 'marker', allowedSurface: 'both', connectivity: [], nesting: 'none', slopeMode: 'none' },
  character: { kind: 'marker', allowedSurface: 'both', connectivity: [], nesting: 'none', slopeMode: 'none' },
  capital: { kind: 'marker', allowedSurface: 'land', connectivity: [], nesting: 'none', slopeMode: 'none' },
  castle: { kind: 'marker', allowedSurface: 'land', connectivity: [], nesting: 'none', slopeMode: 'none' },
  temple: { kind: 'marker', allowedSurface: 'land', connectivity: [], nesting: 'none', slopeMode: 'none' },
  ruin: { kind: 'marker', allowedSurface: 'land', connectivity: [], nesting: 'none', slopeMode: 'none' },
  mine: { kind: 'marker', allowedSurface: 'land', connectivity: [], nesting: 'none', slopeMode: 'none' },
  cave: { kind: 'marker', allowedSurface: 'land', connectivity: [], nesting: 'none', slopeMode: 'none' },
  port: { kind: 'marker', allowedSurface: 'both', connectivity: [], nesting: 'none', slopeMode: 'none' },
  gate: { kind: 'marker', allowedSurface: 'land', connectivity: [], nesting: 'none', slopeMode: 'none' },
  inn: { kind: 'marker', allowedSurface: 'land', connectivity: [], nesting: 'none', slopeMode: 'none' },
  tower: { kind: 'marker', allowedSurface: 'land', connectivity: [], nesting: 'none', slopeMode: 'none' }
}

/** 按 kind 派生的类目集合（旧名 TERRAIN/REGION/PATH/MARKER_CATEGORIES 的 REGION/PATH/MARKER 三个改造派生视图，
 *  huiyuMapTools.ts 改引用本表·调用方不断裂）。TERRAIN_CATEGORIES 是图层归属维度，不属于本表覆盖范围，仍留在
 *  huiyuMapTools.ts 本地维护。 */
export const BRUSH_REGION_CATEGORIES: Set<string> = new Set(Object.keys(BRUSH_SPEC).filter((c) => BRUSH_SPEC[c].kind === 'region'))
export const BRUSH_PATH_CATEGORIES: Set<string> = new Set(Object.keys(BRUSH_SPEC).filter((c) => BRUSH_SPEC[c].kind === 'path'))
export const BRUSH_MARKER_CATEGORIES: Set<string> = new Set(Object.keys(BRUSH_SPEC).filter((c) => BRUSH_SPEC[c].kind === 'marker'))

/** 旧名派生视图：region 量级区间表（原 huiyuMapTools.ts 本地 REGION_SIZE_RANGE，现由 BRUSH_SPEC.sizeRange 派生）。 */
export const REGION_SIZE_RANGE: Record<string, { min: number; max: number }> = Object.fromEntries(
  Object.entries(BRUSH_SPEC).filter(([, row]) => row.sizeRange).map(([category, row]) => [category, row.sizeRange as { min: number; max: number }])
)

/** 跨类目重叠规则查询（对称）：先查 a 行登记的对 b 的规则，没有再查 b 行登记的对 a 的规则，都没有则 allow。
 *  region-region 放置卫兵（resolvePlacementClear 障碍收集）与 auditMap 违禁重叠体检共读本函数，不各写一份判断。 */
export function resolveCrossRule(categoryA: string, categoryB: string): BrushCrossRuleValue {
  const forward = BRUSH_SPEC[categoryA]?.crossRules?.[categoryB]
  if (forward) return forward
  const backward = BRUSH_SPEC[categoryB]?.crossRules?.[categoryA]
  if (backward) return backward
  return 'allow'
}

// ── 阶段状态机（笔刷约束系统批D·阶段管线）────────────────────────────────────
// 阶段=从要素 meta.confirmedAtStage 戳推导（零迁移·meta_json 透传，GIS Editor Tracking 范式·研究_04 §1.5）；
// 阶段引擎本身无状态——不新增表/不加会话级缓存，任何时刻的"当前阶段"都能从图纸要素现查现算。

/** 三大阶段（用户 2026-07-11 拍板：地形→水系→人文，各过确认环）。 */
export type MapStageId = 'terrain' | 'water' | 'civic'
export const MAP_STAGE_ORDER: MapStageId[] = ['terrain', 'water', 'civic']

function isMapStageId(value: unknown): value is MapStageId {
  return value === 'terrain' || value === 'water' || value === 'civic'
}

/** 某要素的阶段确认戳（meta.confirmedAtStage 合法值才认，脏数据/存量无戳一律 null——存量豁免哲学）。 */
export function featureConfirmedStage(feature: { meta?: unknown } | null | undefined): MapStageId | null {
  const meta = feature?.meta as { confirmedAtStage?: unknown } | null | undefined
  return isMapStageId(meta?.confirmedAtStage) ? meta!.confirmedAtStage as MapStageId : null
}

/** 某要素的「出生阶段」戳（meta.stage，写工具在 staged 模式下创建时打上；非 staged 调用画的要素恒为 null，
 *  永不参与阶段收尾批量盖戳——同存量豁免哲学的自然延伸：只有走过阶段管线的笔画才进入这套簿记）。 */
export function featureBornStage(feature: { meta?: unknown } | null | undefined): MapStageId | null {
  const meta = feature?.meta as { stage?: unknown } | null | undefined
  return isMapStageId(meta?.stage) ? meta!.stage as MapStageId : null
}

/** 推导当前阶段：取全部要素里"已确认阶段"的最高档位+1（terrain 已确认过→当前=water；water 已确认过→
 *  当前=civic；civic 已确认过或已是最高档→当前维持 civic，不再前进——人文阶段可以持续追加内容，没有"阶段4"）。
 *  没有任何要素带确认戳（新世界/纯存量世界）→当前=terrain（从第一阶段开始）。 */
export function deriveCurrentStage(features: Array<{ meta?: unknown } | null | undefined>): MapStageId {
  let highestIndex = -1
  for (const feature of features) {
    const stage = featureConfirmedStage(feature)
    if (!stage) continue
    const idx = MAP_STAGE_ORDER.indexOf(stage)
    if (idx > highestIndex) highestIndex = idx
  }
  if (highestIndex < 0) return MAP_STAGE_ORDER[0]
  return MAP_STAGE_ORDER[Math.min(highestIndex + 1, MAP_STAGE_ORDER.length - 1)]
}

/** Lock 保护判定（CAD Lock 语义：可见可查询不可写——研究_04 §1.4/核心产出①）：要素已确认阶段早于
 *  currentStage 才算被保护；未盖戳（存量豁免/非 staged 笔画）或确认阶段=当前/更晚（理论不会晚于，防御性判断）
 *  一律不保护。落笔硬门与 auditMap 体检可以共读本函数，不用各写一份阶段序比较。 */
export function isFeatureLockedAtStage(feature: { meta?: unknown } | null | undefined, currentStage: MapStageId): boolean {
  const confirmed = featureConfirmedStage(feature)
  if (!confirmed) return false
  return MAP_STAGE_ORDER.indexOf(confirmed) < MAP_STAGE_ORDER.indexOf(currentStage)
}

// ── 海拔分层设色 hypsometric tinting（地图视觉大改批1·2026-07-11）──────────────
// 地形视图=按海拔上色的传统制图法取代散布图标；人文视图=山地/陆地/水域三色底。
// 两套渲染都读同一份 elevationM 物理真值，颜色决策集中在这里（单点·渲染端与工具端共用）。

/** 类目缺省海拔表（米·长期兜底口径，不是过渡层）：旧数据/未挂 elevationM 的要素渲染时按类目推断海拔档位。
 *  批2（2026-07-11）新增 hill/desert/swamp/ice/jungle/farmland 六类，值=用户拍板提案。
 *  笔刷约束系统批A：改造为 BRUSH_SPEC.defaultElevationM 的派生视图（真值只在 BRUSH_SPEC 一处），旧名与旧值不变。 */
export const CATEGORY_DEFAULT_ELEVATION_M: Record<string, number> = Object.fromEntries(
  Object.entries(BRUSH_SPEC).filter(([, row]) => typeof row.defaultElevationM === 'number').map(([category, row]) => [category, row.defaultElevationM as number])
)

/** 要素有效海拔（米）：显式给了用显式值，否则按类目缺省表兜底（未知类目按 150m 近似平地兜底）。 */
export function resolveElevationM(category: string, elevationM?: number): number {
  if (Number.isFinite(elevationM)) return elevationM as number
  return CATEGORY_DEFAULT_ELEVATION_M[category] ?? 150
}

export type ElevationBand = { min: number; max: number; color: string }

/** 陆地 8 档海拔色带（低→高·色彩规格=计划书拍板值；4000~5000/≥5000 两档已按 2026-07-12 真机反馈改红棕/深红棕，
 *  原淡紫/近白会在高山中心形成"挖空"视觉，改后与纸底/迷雾色距离拉满）：max=Infinity 为最高档（≥5000m）。 */
export const ELEVATION_BANDS: ElevationBand[] = [
  { min: 0, max: 100, color: '#94BF8B' },
  { min: 100, max: 500, color: '#ACD08E' },
  { min: 500, max: 1000, color: '#E8E1A2' },
  { min: 1000, max: 2000, color: '#F5D28C' },
  { min: 2000, max: 3000, color: '#E8A55F' },
  { min: 3000, max: 4000, color: '#C97E4E' },
  { min: 4000, max: 5000, color: '#A85C42' },
  { min: 5000, max: Infinity, color: '#7E4433' }
]

/** 海拔 → 地形视图色带颜色。 */
export function elevationTint(m: number): string {
  const v = Number.isFinite(m) ? m : 0
  const band = ELEVATION_BANDS.find((b) => v < b.max) || ELEVATION_BANDS[ELEVATION_BANDS.length - 1]
  return band.color
}

/** 人文三色底「山地绿」判定类目（批2 hill/jungle 正式注册·随类目扩容生效）。 */
const CIVIC_GREEN_CATEGORIES = new Set(['mountain', 'hill', 'forest', 'jungle'])

/** 人文视图三色底判定（water 不进本函数，渲染端单独走水蓝）：类目属山地系或海拔≥600m 记绿，其余记白。
 *  desert/swamp/farmland 缺省海拔均<600m 记白；ice 缺省 4500m≥600m 会自然记绿——批2 拍板接受的规则自然结果，
 *  不额外特判（冰原雪山在人文图归入"山地绿"桶属可接受的规则副作用，非 bug）。 */
export function civicRegionBucket(category: string, elevationM?: number): 'green' | 'white' {
  if (CIVIC_GREEN_CATEGORIES.has(category)) return 'green'
  return resolveElevationM(category, elevationM) >= 600 ? 'green' : 'white'
}

/** 特殊地表专色（地图视觉大改批2·用户拍板）：desert/swamp/ice 三类在地形视图用专色盖过海拔色带（不随海拔变化）。
 *  category → CSS 变量名映射是唯一判定点（渲染端只查表消费，不自行判断"这个类目是不是特殊地表"）；
 *  实际色值落在 mapPresentation.ts 的 MAP_COLOR_VARS（沿用 --mc-* 单点配色机制）。 */
export const SPECIAL_SURFACE_COLOR_VARS: Record<string, string> = {
  desert: '--mc-special-desert',
  swamp: '--mc-special-swamp',
  ice: '--mc-special-ice'
}

/** 查某类目是否有特殊地表专色（有则返回其 CSS 变量名，渲染端直接 var() 引用）。 */
export function specialSurfaceColorVar(category: string): string | undefined {
  return SPECIAL_SURFACE_COLOR_VARS[category]
}

// ── 造形笔刷参数扩展（地图视觉大改批2·2026-07-11）──────────────────────────
// ridge（条状山脊）/buildArcPath（城墙规整弧）/buildIsletCluster（伴生小岛群）：
// 与 buildShapePolygon/buildMeanderPath 同一套确定性引擎（同 seed 永远同形），
// 各自解决一种画法诉求，不合并进 buildShapePolygon——按 buildMeanderPath 已有的
// 独立函数先例（from/to 语义 vs 中心+半径语义不是一回事，硬塞进同一签名反而绕）。

/** 条状山脊造形（画"山脉一条一条"专用）：主脊 from→to（可经 waypoints 拐点）+两端收窄（taper）+边缘碎化，
 *  返回闭合多边形（左边缘正向+右边缘反向）。同 seed 永远同形状。
 *  与下方 widenSpine（笔刷约束系统批W）同族（都是"脊线/中心线+厚度→闭合多边形"）：评估过收编为同引擎
 *  两预设，结论=保持两函数，见 widenSpine 主注释前的说明——以后若统一造形引擎，两处要一起改。 */
export function buildRidgePolygon(opts: {
  from: MapPoint
  to: MapPoint
  /** 主脊满宽（米·中段宽度，两端按 taper 收窄）。 */
  width: number
  /** 途经拐点（可选，脊线走向不是直线时用）。 */
  waypoints?: MapPoint[]
  /** 两端收窄比例 0~1（缺省 0.7：两端宽度收到中段的 30%，越大越尖）。 */
  taper?: number
  /** 边缘碎化幅度 0~1（占半宽比例·缺省 0.25）。 */
  roughness?: number
  seed: number | string
}): MapPoint[] {
  const seedNum = typeof opts.seed === 'string'
    ? hashStr(opts.seed)
    : (Number.isFinite(opts.seed as number) ? Number(opts.seed) : hashStr(`${opts.from.join(',')}-${opts.to.join(',')}`))
  const rng = mulberry32(seedNum)
  const taper = Math.max(0, Math.min(1, opts.taper ?? 0.7))
  const roughness = Math.max(0, Math.min(1, opts.roughness ?? 0.25))
  const halfWidth = Math.max(1, opts.width) / 2
  const spine: MapPoint[] = [opts.from, ...(opts.waypoints || []), opts.to]
  const n = spine.length
  const left: MapPoint[] = []
  const right: MapPoint[] = []
  for (let i = 0; i < n; i++) {
    // 沿脊线方向估计切线（首尾用相邻段，中段用前后段连线近似）；法向量=切线旋转90度
    const prev = spine[Math.max(0, i - 1)]
    const next = spine[Math.min(n - 1, i + 1)]
    const dx = next[0] - prev[0]; const dy = next[1] - prev[1]
    const len = Math.hypot(dx, dy) || 1
    const nx = -dy / len; const ny = dx / len
    // 两端权重按 taper 收窄，中段满宽
    const edgeFactor = (i === 0 || i === n - 1) ? (1 - taper) : 1
    const w = Math.max(1, halfWidth * edgeFactor)
    left.push([spine[i][0] + nx * w, spine[i][1] + ny * w])
    right.push([spine[i][0] - nx * w, spine[i][1] - ny * w])
  }
  const ring: MapPoint[] = [...left, ...right.slice().reverse()]
  return roughen(ring, 1, roughness * 0.4, rng, true)
}

// ── 变宽水体形体引擎 widenSpine（地图分阶段作画与笔刷约束系统批W·2026-07-11）──────────────
// 与 buildRidgePolygon 同族（都是"脊线/中心线+厚度→闭合多边形"）：评估过收编成同引擎两预设
// （山=对称厚度+单 rng 碎边／河=非对称厚度剖面+左右独立 rng 碎边），结论=保持两函数（计划书 7.5④ 允许的
// 退路）——buildRidgePolygon 的 from/to(+waypoints)+taper 标量签名与 widenSpine 的整条 spine 点列+
// 逐点半宽/剖面签名不是同一回事（同文件 buildMeanderPath vs buildShapePolygon 已有"语义不同不硬塞同签名"
// 先例）；buildRidgePolygon 由地图绘制链调用。
// 依赖其当前坐标序列做同 seed 恒形断言，强行合并有改变既有山脊输出的回归风险，收编收益（省一个函数）
// 小于风险，故不做。
//
// 宽度剖面参数来自研究_05《河网山系形态参数调研》§5.1"批W 变宽河流笔刷参数表"（.assets 同名文件）：
// growthExponent 缺省 0.5=该表"河宽沿程增长指数 b（W∝Q^b）"实测值（可直接抄）；两岸碎边幅度缺省 0.22=
// 该表"两岸非对称碎边抖动幅度占半宽 15%~30%"区间中值（星依外推·纯审美参数，非实测）；入海喇叭倍数/
// 作用区间见下方常量注释。sourceWidthM/mouthWidthM 绝对米数本身研究稿未给（只给比例/指数），按本项目
// 世界坐标尺度手设，属计划书 7.5.7 明确的"v1=参数化手设"范畴。

/** 宽度剖面：源头→末端沿弧长比例插值（数值口径见上方模块注释）。 */
export type WidenSpineWidthProfile = {
  /** 源头处满宽（米，非半宽）。 */
  sourceWidthM: number
  /** 末端（入海/入湖口）处满宽（米，非半宽）。 */
  mouthWidthM: number
  /** 沿程递增曲线形状指数（缺省 0.5）：width(t)=sourceWidthM+(mouthWidthM-sourceWidthM)·t^growthExponent，
   *  t=沿弧长的 0~1 比例。诚实声明：用弧长比例 t 代理真实流量 Q 的简化（批E 接入 Strahler/flux 前无法算
   *  真实 Q）——指数本身（0.5）是研究_05 §1.2 的实测值，但"t 能代表 Q"这一步是本函数的近似，非物理精确。 */
  growthExponent?: number
}

const DEFAULT_WIDEN_SPINE_WIDTH_PROFILE: WidenSpineWidthProfile = { sourceWidthM: 10, mouthWidthM: 60, growthExponent: 0.5 }
/** 顶点数帽（沿用 downsampleClosed 惯例）：长河稠密采样后下采样到渲染友好上限。 */
const WIDEN_SPINE_MAX_VERTICES = 60
/** 入海喇叭展开缺省倍数（研究_05 §5.1"河口喇叭末端/源头宽度倍数"，区间 3~8·星依外推，取中值 5）。
 *  倍数基准=喇叭区起点处的河身宽（研究稿该表语境的"源头"指入河口段之前的河身，不是最上游细流——若按
 *  最上游宽算，mouthWidthM 较大的剖面会算出比河身还窄的"喇叭"，展开变收窄，语义荒谬）。 */
const WIDEN_SPINE_MOUTH_FLARE_RATIO = 5
/** 入海喇叭作用区间（研究_05 §4.2"在最后 10~20% 河长内完成大部分展宽"，取区间上沿更利于画廊肉眼可辨）。 */
const WIDEN_SPINE_MOUTH_FLARE_ZONE = 0.2

export interface WidenSpineOptions {
  /** 中心线（≥2 点，与 geometry.pts 语义相同——widenSpine 不修改也不消费这条线之外的任何真值）。 */
  spine: MapPoint[]
  /** 逐点半宽（米）精修出口：给出时优先于 widthProfile，长度必须与 spine 相等，否则退回 widthProfile。 */
  halfWidths?: number[]
  /** 参数化宽度剖面（与 halfWidths 二选一，都不给则用内置缺省剖面）。 */
  widthProfile?: WidenSpineWidthProfile
  seed: number | string
  /** 左岸碎边幅度 0~1（占该点半宽比例·缺省 0.22，见上方模块注释）。 */
  leftRoughness?: number
  /** 右岸碎边幅度 0~1（与左岸独立派生 rng，缺省同 leftRoughness）。 */
  rightRoughness?: number
  /** 源头端收口：'taper'=收尖到 0（缺省——源头细流天然尖收；研究_05"源头长度≈2~3倍河宽内收尖"在本函数
   *  典型顶点密度下与"单点收尖"视觉上无法区分，不额外插点）／'flat'=不收，按剖面/半宽数组给定值不动。 */
  sourceCap?: 'taper' | 'flat'
  /** 末端收口：'flare'=入海喇叭展开（对末尾 WIDEN_SPINE_MOUTH_FLARE_ZONE 比例的采样点做加速拓宽，终宽
   *  ≈喇叭区起点处河身宽×mouthFlareRatio，用 ease-in 幂函数近似研究_05 §4.2 的指数收敛喇叭口形状——
   *  非严格 exp()，v1 参数化手设的诚实简化）／'flat'=不展开（缺省）。 */
  mouthCap?: 'flare' | 'flat'
  /** mouthCap='flare' 时的展开倍数（缺省 WIDEN_SPINE_MOUTH_FLARE_RATIO·基准见该常量注释）。 */
  mouthFlareRatio?: number
}

/** 变宽水体形体引擎（计划书 7.5①）：中心线+逐点半宽/参数化宽度剖面+两岸独立碎边→闭合多边形（左岸
 *  正向+右岸反向首尾相连，同 buildRidgePolygon 环序）。要点：①法向量偏移（首尾用相邻点近似切线，同
 *  buildRidgePolygon 手法）；②自交防护=半宽钳位（急弯/收窄处单点半宽不超过相邻两段中较短一段的约
 *  48%，碎边抖动后仍强制二次钳位——局部启发式，非全局多边形碰撞检测：假设中心线自身不自交
 *  （buildMeanderPath/合法 pts 输入保证），能防"单点越界导致相邻两岸顶点交叉"的常见情形，极端连续锐角
 *  仍有残余风险，同 clipPolygonToParent 的诚实局限声明风格）；③左右岸各自派生独立 rng（seed 派生自
 *  "${seed}-bank-left"/"-right"，同 buildIsletCluster 已有的字符串派生 seed 惯例），天然非对称。
 *  同 seed 永远同形状。 */
export function widenSpine(opts: WidenSpineOptions): MapPoint[] {
  const spine = opts.spine
  const n = spine.length
  if (n < 2) return []

  const dist = (a: MapPoint, b: MapPoint) => Math.hypot(b[0] - a[0], b[1] - a[1])
  const cum: number[] = [0]
  for (let i = 1; i < n; i++) cum.push(cum[i - 1] + dist(spine[i - 1], spine[i]))
  const total = cum[n - 1] || 0

  // 半宽序列解析：halfWidths 精修出口优先（长度须匹配 spine），否则按 widthProfile 沿弧长比例插值。
  let rawHalf: number[]
  if (opts.halfWidths && opts.halfWidths.length === n) {
    rawHalf = opts.halfWidths.map((w) => Math.max(0, w))
  } else {
    const profile = opts.widthProfile ?? DEFAULT_WIDEN_SPINE_WIDTH_PROFILE
    const growthExponent = profile.growthExponent ?? 0.5
    rawHalf = cum.map((s) => {
      const t = total > 0 ? s / total : 0
      const width = profile.sourceWidthM + (profile.mouthWidthM - profile.sourceWidthM) * Math.pow(t, growthExponent)
      return Math.max(0, width) / 2
    })
  }

  // 端点收口（研究_05 §4.2/§5.1，见 WidenSpineOptions 类型注释）
  const sourceCap = opts.sourceCap ?? 'taper'
  if (sourceCap === 'taper') rawHalf[0] = 0
  const mouthCap = opts.mouthCap ?? 'flat'
  if (mouthCap === 'flare') {
    const flareRatio = opts.mouthFlareRatio ?? WIDEN_SPINE_MOUTH_FLARE_RATIO
    const zoneStart = total * (1 - WIDEN_SPINE_MOUTH_FLARE_ZONE)
    // 倍数基准=喇叭区起点处河身半宽（取区外最后一个采样点，无区外点时退回首点，再兜底 1m 防零基准）。
    let refHalf = rawHalf[0]
    for (let i = 0; i < n; i++) { if (cum[i] < zoneStart) refHalf = rawHalf[i]; else break }
    const flareTargetHalf = Math.max(refHalf, 1) * flareRatio
    for (let i = 0; i < n; i++) {
      if (cum[i] < zoneStart) continue
      const localT = total > zoneStart ? (cum[i] - zoneStart) / (total - zoneStart) : 1
      // ease-in（localT²）：多数展宽集中在最后一小段，近似研究_05 §4.2 指数收敛喇叭口"越靠近河口越陡"的形状。
      const eased = localT * localT
      rawHalf[i] = Math.max(rawHalf[i], rawHalf[i] + (flareTargetHalf - rawHalf[i]) * eased)
    }
  }

  // 自交防护：半宽钳位到相邻两段中较短一段的约 48%（安全边际，见函数顶部注释）。
  const maxHalfArr = rawHalf.map((_, i) => {
    const distPrev = i > 0 ? dist(spine[i], spine[i - 1]) : Infinity
    const distNext = i < n - 1 ? dist(spine[i], spine[i + 1]) : Infinity
    const localSpan = Math.min(distPrev, distNext)
    return Number.isFinite(localSpan) ? Math.max(1, localSpan * 0.48) : Math.max(1, rawHalf[i] || 1)
  })
  const baseHalf = rawHalf.map((hw, i) => Math.min(hw, maxHalfArr[i]))

  // 两岸独立碎边（占半宽比例，非占段长比例——与 roughen() 的 amp 语义不同，是 widenSpine 自有的宽度抖动）。
  const seedBase = typeof opts.seed === 'string' ? opts.seed : String(opts.seed)
  const leftRng = mulberry32(hashStr(`${seedBase}-bank-left`))
  const rightRng = mulberry32(hashStr(`${seedBase}-bank-right`))
  const leftRoughness = Math.max(0, Math.min(1, opts.leftRoughness ?? 0.22))
  const rightRoughness = Math.max(0, Math.min(1, opts.rightRoughness ?? 0.22))

  const left: MapPoint[] = []
  const right: MapPoint[] = []
  for (let i = 0; i < n; i++) {
    const prev = spine[Math.max(0, i - 1)]
    const next = spine[Math.min(n - 1, i + 1)]
    const dx = next[0] - prev[0]; const dy = next[1] - prev[1]
    const len = Math.hypot(dx, dy) || 1
    const nx = -dy / len; const ny = dx / len
    const leftJitter = 1 + (leftRng() - 0.5) * 2 * leftRoughness
    const rightJitter = 1 + (rightRng() - 0.5) * 2 * rightRoughness
    // 抖动后二次钳位到 maxHalfArr：保证无论抖动方向如何，两岸偏移距离恒不超过自交防护上限。
    const leftHw = Math.min(maxHalfArr[i], Math.max(0, baseHalf[i] * leftJitter))
    const rightHw = Math.min(maxHalfArr[i], Math.max(0, baseHalf[i] * rightJitter))
    left.push([spine[i][0] + nx * leftHw, spine[i][1] + ny * leftHw])
    right.push([spine[i][0] - nx * rightHw, spine[i][1] - ny * rightHw])
  }
  const ring: MapPoint[] = [...left, ...right.slice().reverse()]
  return downsampleClosed(ring, WIDEN_SPINE_MAX_VERTICES)
}

/** 规整圆弧路径（城墙笔直/规整弧线不歪扭专用）：角度制用弧度，0=正东、顺时针为正。
 *  jitter=0（缺省）时零随机——同参数逐点完全确定；jitter>0 才需要 seed。 */
export function buildArcPath(opts: {
  center: MapPoint
  /** 半径（米）。 */
  radiusM: number
  /** 起始角（弧度）。 */
  fromAngle: number
  /** 终止角（弧度）。 */
  toAngle: number
  /** 采样顶点数（缺省按弧长自适应，8~32 钳位）。 */
  points?: number
  /** 近零抖动 0~0.05（占半径比例·缺省 0=最规整）——城墙"笔直/规整弧线"诉求，别给太大。 */
  jitter?: number
  seed?: number | string
}): MapPoint[] {
  const radius = Math.max(1, opts.radiusM)
  const span = opts.toAngle - opts.fromAngle
  const n = Math.max(4, Math.min(32, Math.round(opts.points ?? (8 + Math.abs(span) * 4))))
  const jitter = Math.max(0, Math.min(0.05, opts.jitter ?? 0))
  const rng = jitter > 0
    ? mulberry32(typeof opts.seed === 'string' ? hashStr(opts.seed) : (Number.isFinite(opts.seed as number) ? Number(opts.seed) : hashStr(`arc-${opts.center.join(',')}-${radius}`)))
    : null
  const out: MapPoint[] = []
  for (let i = 0; i <= n; i++) {
    const t = i / n
    const a = opts.fromAngle + span * t
    const r = rng ? radius * (1 + (rng() - 0.5) * 2 * jitter) : radius
    out.push([opts.center[0] + Math.cos(a) * r, opts.center[1] + Math.sin(a) * r])
  }
  return out
}

/** 伴生小岛群（海岸破碎观感的延伸·治"海岸线该有零散小岛"的表达缺口）：确定性散布 count 个小型多边形
 *  于 around 周边 spreadM 范围内，每个岛独立形状（各自派生 seed）。同 seed 永远同一群。 */
export function buildIsletCluster(opts: {
  /** 散布中心（米，通常取海岸线/海域边缘附近一点）。 */
  around: MapPoint
  /** 小岛数量（钳位 1~12）。 */
  count: number
  /** 散布半径（米·缺省 800）。 */
  spreadM?: number
  /** 单岛最小/最大半径（米·缺省 80~220）。 */
  minSizeM?: number
  maxSizeM?: number
  seed: number | string
}): MapPoint[][] {
  const seedBase = typeof opts.seed === 'string' ? opts.seed : String(opts.seed)
  const rng = mulberry32(hashStr(`${seedBase}-cluster-${opts.around.join(',')}`))
  const count = Math.max(1, Math.min(12, Math.round(opts.count)))
  const spread = Math.max(1, opts.spreadM ?? 800)
  const minSize = Math.max(10, opts.minSizeM ?? 80)
  const maxSize = Math.max(minSize, opts.maxSizeM ?? 220)
  const out: MapPoint[][] = []
  for (let i = 0; i < count; i++) {
    const theta = rng() * Math.PI * 2
    const dist = rng() * spread
    const cx = opts.around[0] + Math.cos(theta) * dist
    const cy = opts.around[1] + Math.sin(theta) * dist
    const size = minSize + rng() * (maxSize - minSize)
    out.push(buildShapePolygon({
      cx, cy, rx: size, ry: size * (0.7 + rng() * 0.5), form: 'blob', roughness: 0.3,
      seed: `${seedBase}-islet-${i}`
    }))
  }
  return out
}

export function fmtArea(m2: number): string {
  if (m2 >= 100000) return (m2 / 1e6).toFixed(m2 >= 1e7 ? 0 : 2) + ' km²'
  return Math.round(m2).toLocaleString() + ' m²'
}

export function fmtDist(m: number): string {
  if (m >= 1000) return (m / 1000).toFixed(m >= 10000 ? 0 : 1) + ' km'
  return Math.round(m) + ' m'
}

// ── 断连吸附与关系约束：贴岸/避让/自动推开/探索包络（地图画对硬化批A·2026-07-11）──────
// 治「河海断连/要素重叠/迷雾手画」三病：坐标全部工具确定性生成，模型只给语义（挂谁/多远/什么方位）。

/** 线段是否相交（含端点相触算相交）。 */
export function segmentsIntersect(a1: MapPoint, a2: MapPoint, b1: MapPoint, b2: MapPoint): boolean {
  const cross = (o: MapPoint, a: MapPoint, b: MapPoint) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const onSeg = (p: MapPoint, q: MapPoint, r: MapPoint) =>
    Math.min(p[0], r[0]) <= q[0] && q[0] <= Math.max(p[0], r[0]) &&
    Math.min(p[1], r[1]) <= q[1] && q[1] <= Math.max(p[1], r[1])
  const d1 = cross(b1, b2, a1)
  const d2 = cross(b1, b2, a2)
  const d3 = cross(a1, a2, b1)
  const d4 = cross(a1, a2, b2)
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true
  if (d1 === 0 && onSeg(b1, a1, b2)) return true
  if (d2 === 0 && onSeg(b1, a2, b2)) return true
  if (d3 === 0 && onSeg(a1, b1, a2)) return true
  if (d4 === 0 && onSeg(a1, b2, a2)) return true
  return false
}

/** 线段-线段交点与沿 p1→p2 的参数 t（无交点返回 null）。笔刷约束系统批W 导出：huiyuMapTools 的
 *  「路河相交无桥/城墙跨河」体检需要精确交点坐标（不只是布尔相交），复用本函数不重复实现一遍线段求交。 */
export function segmentIntersectionDetail(p1: MapPoint, p2: MapPoint, p3: MapPoint, p4: MapPoint): { point: MapPoint; t: number } | null {
  const d1x = p2[0] - p1[0]; const d1y = p2[1] - p1[1]
  const d2x = p4[0] - p3[0]; const d2y = p4[1] - p3[1]
  const denom = d1x * d2y - d1y * d2x
  if (Math.abs(denom) < 1e-9) return null
  const t = ((p3[0] - p1[0]) * d2y - (p3[1] - p1[1]) * d2x) / denom
  const u = ((p3[0] - p1[0]) * d1y - (p3[1] - p1[1]) * d1x) / denom
  if (t < 0 || t > 1 || u < 0 || u > 1) return null
  const point: MapPoint = [p1[0] + d1x * t, p1[1] + d1y * t]
  return { point, t }
}

/** 点到折线最近点（逐段投影取最近，不闭合）。 */
export function nearestPointOnPolyline(pt: MapPoint, pts: MapPoint[]): { point: MapPoint; distance: number } {
  if (pts.length === 1) return { point: pts[0], distance: Math.hypot(pt[0] - pts[0][0], pt[1] - pts[0][1]) }
  let bestPoint: MapPoint = pts[0]
  let bestDistance = Infinity
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]; const b = pts[i]
    const dx = b[0] - a[0]; const dy = b[1] - a[1]
    const lenSq = dx * dx + dy * dy
    let t = lenSq > 0 ? ((pt[0] - a[0]) * dx + (pt[1] - a[1]) * dy) / lenSq : 0
    t = Math.max(0, Math.min(1, t))
    const proj: MapPoint = [a[0] + dx * t, a[1] + dy * t]
    const d = Math.hypot(pt[0] - proj[0], pt[1] - proj[1])
    if (d < bestDistance) { bestDistance = d; bestPoint = proj }
  }
  return { point: bestPoint, distance: bestDistance }
}

/** 点到多边形边界的最近距离（边界当闭合折线，不区分内外）。 */
export function distanceToPolygonBoundary(pt: MapPoint, poly: MapPoint[]): number {
  if (poly.length < 2) return Infinity
  return nearestPointOnPolyline(pt, [...poly, poly[0]]).distance
}

/** 端点吸附进 region：已在内原样返回；否则取 from→质心连线与边界最近交点，沿该方向向内推 insetM。
 *  河流/道路入海/进城「必然贴岸」的几何根基——不靠模型猜坐标。 */
export function snapIntoRegion(from: MapPoint, poly: MapPoint[], insetM = 30): MapPoint {
  if (pointInPoly(from[0], from[1], poly)) return from
  const center = centroid(poly)
  const n = poly.length
  let bestT = Infinity
  let bestPoint: MapPoint | null = null
  for (let i = 0; i < n; i++) {
    const detail = segmentIntersectionDetail(from, center, poly[i], poly[(i + 1) % n])
    if (detail && detail.t < bestT) { bestT = detail.t; bestPoint = detail.point }
  }
  if (!bestPoint) bestPoint = nearestPointOnPolyline(from, [...poly, poly[0]]).point
  const dx = center[0] - bestPoint[0]; const dy = center[1] - bestPoint[1]
  const len = Math.hypot(dx, dy) || 1
  return [bestPoint[0] + dx / len * insetM, bestPoint[1] + dy / len * insetM]
}

/** 内部：开链下采样保留首尾端点。 */
function downsampleKeepEnds(pts: MapPoint[], target: number): MapPoint[] {
  if (pts.length <= target || target < 2) return pts
  const out: MapPoint[] = []
  for (let i = 0; i < target; i++) out.push(pts[Math.round((i * (pts.length - 1)) / (target - 1))])
  return out
}

/** 骨架（from+途经点+to）→ 确定性蜿蜒折线：中点位移细分直到顶点数落入 8~14，首尾端点钉死不动。
 *  河流/道路的手抄坐标断连病根根治点——渲染端 Catmull-Rom 平滑前的顶点来源。 */
export function buildMeanderPath(opts: { from: MapPoint; to: MapPoint; waypoints?: MapPoint[]; meander?: number; seed: number | string }): MapPoint[] {
  const seedNum = typeof opts.seed === 'string'
    ? hashStr(opts.seed)
    : (Number.isFinite(opts.seed as number) ? Number(opts.seed) : hashStr(`${opts.from.join(',')}-${opts.to.join(',')}`))
  const rng = mulberry32(seedNum)
  const meander = Math.max(0, Math.min(1, opts.meander ?? 0.3))
  let pts: MapPoint[] = [opts.from, ...(opts.waypoints || []), opts.to].map((p) => [p[0], p[1]])
  let iterations = 0
  while (pts.length < 8 && iterations < 5) {
    pts = roughen(pts, 1, meander * 0.35, rng, false)
    iterations++
  }
  if (pts.length > 14) pts = downsampleKeepEnds(pts, 12)
  pts[0] = [opts.from[0], opts.from[1]]
  pts[pts.length - 1] = [opts.to[0], opts.to[1]]
  return pts
}

/** 两多边形是否重叠（顶点互相包含 或 边相交）。 */
export function polygonsOverlap(a: MapPoint[], b: MapPoint[]): boolean {
  for (const p of a) if (pointInPoly(p[0], p[1], b)) return true
  for (const p of b) if (pointInPoly(p[0], p[1], a)) return true
  const na = a.length; const nb = b.length
  for (let i = 0; i < na; i++) {
    for (let j = 0; j < nb; j++) {
      if (segmentsIntersect(a[i], a[(i + 1) % na], b[j], b[(j + 1) % nb])) return true
    }
  }
  return false
}

const BEARING_UNIT_VECTORS: Array<[string, MapPoint]> = [
  ['东', [1, 0]], ['东南', [Math.SQRT1_2, Math.SQRT1_2]], ['南', [0, 1]], ['西南', [-Math.SQRT1_2, Math.SQRT1_2]],
  ['西', [-1, 0]], ['西北', [-Math.SQRT1_2, -Math.SQRT1_2]], ['北', [0, -1]], ['东北', [Math.SQRT1_2, -Math.SQRT1_2]]
]

/** 向量 → 最近的汉字八方位（bearingToVector 的反查，y 向南）。回执「已自动向东南推移」用。 */
export function vectorToBearing(dx: number, dy: number): string {
  const len = Math.hypot(dx, dy) || 1
  const nx = dx / len; const ny = dy / len
  let best = BEARING_UNIT_VECTORS[0][0]
  let bestDot = -Infinity
  for (const [name, vec] of BEARING_UNIT_VECTORS) {
    const dot = nx * vec[0] + ny * vec[1]
    if (dot > bestDot) { bestDot = dot; best = name }
  }
  return best
}

/** 放置推开：从 start 出发沿「远离各重叠障碍质心」的固定方向逐步 stepM 重建，直到不撞或超 maxSteps。
 *  确定性（无随机）——用户拍板「自动推开+回执如实报」的几何执行者。 */
export function resolvePlacementClear(opts: {
  start: MapPoint
  build: (center: MapPoint) => MapPoint[]
  obstacles: MapPoint[][]
  stepM: number
  maxSteps?: number
}): { center: MapPoint; pts: MapPoint[]; shiftedM: number; clear: boolean } {
  const maxSteps = opts.maxSteps ?? 12
  let center: MapPoint = [opts.start[0], opts.start[1]]
  let pts = opts.build(center)
  const hitting = () => opts.obstacles.filter((ob) => polygonsOverlap(pts, ob))
  let hits = hitting()
  if (!hits.length) return { center, pts, shiftedM: 0, clear: true }
  let dx = 0; let dy = 0
  for (const ob of hits) {
    const c = centroid(ob)
    const vx = opts.start[0] - c[0]; const vy = opts.start[1] - c[1]
    const len = Math.hypot(vx, vy) || 1
    dx += vx / len; dy += vy / len
  }
  let dirLen = Math.hypot(dx, dy)
  if (dirLen < 1e-9) { dx = 1; dy = 0; dirLen = 1 }
  dx /= dirLen; dy /= dirLen
  let shiftedM = 0
  for (let step = 1; step <= maxSteps; step++) {
    shiftedM = step * opts.stepM
    center = [opts.start[0] + dx * shiftedM, opts.start[1] + dy * shiftedM]
    pts = opts.build(center)
    hits = hitting()
    if (!hits.length) return { center, pts, shiftedM, clear: true }
  }
  return { center, pts, shiftedM, clear: false }
}

/** 内部：Andrew 单调链凸包。 */
function convexHull(points: MapPoint[]): MapPoint[] {
  const pts = [...points].sort((a, b) => (a[0] - b[0]) || (a[1] - b[1]))
  const cross = (o: MapPoint, a: MapPoint, b: MapPoint) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const lower: MapPoint[] = []
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop()
    lower.push(p)
  }
  const upper: MapPoint[] = []
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i]
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop()
    upper.push(p)
  }
  lower.pop(); upper.pop()
  return lower.concat(upper)
}

/** 内部：闭合多边形下采样（按索引等间隔，用于封顶顶点数）。 */
function downsampleClosed(poly: MapPoint[], maxCount: number): MapPoint[] {
  if (poly.length <= maxCount) return poly
  const out: MapPoint[] = []
  for (let i = 0; i < maxCount; i++) out.push(poly[Math.floor((i * poly.length) / maxCount)])
  return out
}

/** 内部：闭合多边形细分到最少顶点数（每次在最长边插中点）。 */
function subdivideToMinCount(poly: MapPoint[], minCount: number): MapPoint[] {
  const pts: MapPoint[] = poly.map((p) => [p[0], p[1]])
  while (pts.length < minCount) {
    let bestI = 0; let bestLen = -1
    const n = pts.length
    for (let i = 0; i < n; i++) {
      const a = pts[i]; const b = pts[(i + 1) % n]
      const len = Math.hypot(b[0] - a[0], b[1] - a[1])
      if (len > bestLen) { bestLen = len; bestI = i }
    }
    const a = pts[bestI]; const b = pts[(bestI + 1) % pts.length]
    pts.splice(bestI + 1, 0, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2])
  }
  return pts
}

/** 探索范围自动包络：多组点 → 凸包 → 沿质心方向外推 paddingM → 轻微碎折造自然感（顶点数落在 12~16）。
 *  正确性优先于观感：碎折后若有原始点跑到外面，回退纯凸包外扩（不牺牲「探索只增不减」）。 */
export function expandedHullOf(ptSets: MapPoint[][], paddingM: number, seed?: number | string): MapPoint[] {
  const all: MapPoint[] = []
  for (const set of ptSets) for (const p of set) all.push(p)
  if (all.length < 3) return all.map((p) => [p[0], p[1]])
  let hull = convexHull(all)
  if (hull.length < 3) {
    const box = bboxOf(all)
    hull = [[box.minX, box.minY], [box.maxX, box.minY], [box.maxX, box.maxY], [box.minX, box.maxY]]
  }
  hull = downsampleClosed(hull, 8)
  hull = subdivideToMinCount(hull, 6)
  const c = centroid(hull)
  const expanded: MapPoint[] = hull.map((p) => {
    const dx = p[0] - c[0]; const dy = p[1] - c[1]
    const len = Math.hypot(dx, dy) || 1
    return [p[0] + dx / len * paddingM, p[1] + dy / len * paddingM]
  })
  const seedNum = typeof seed === 'string'
    ? hashStr(seed)
    : (Number.isFinite(seed as number) ? Number(seed) : hashStr(`hull-${hull.length}-${paddingM}`))
  const rng = mulberry32(seedNum)
  const roughened = roughen(expanded.map((p) => [p[0], p[1]]), 1, 0.06, rng, true)
  const allInside = all.every((p) => pointInPoly(p[0], p[1], roughened))
  return allInside ? roughened : expanded
}

/** 闭合多边形边稠密化（clipPolygonToParent 内部用·笔刷约束系统批D 非凸 parent 极限验证后新增）：把每条边
 *  （含首尾闭合边）长度限制在 maxSegM 以内，超长边等分插入共线中点——插入点仍落在原直线上，不改变多边形
 *  的几何形状，只提高顶点密度。用途：让"逐顶点投影"裁剪在长边跨越 parent 深凹口时也能被中途的插入点拉回，
 *  缓解"两个被拉回的顶点之间连线短暂穿出凹口"的失真（研究_00 障碍6·投影法局限）——边越密，穿出距离上界
 *  越小。确定性（无随机）。 */
function densifyClosedPolygon(pts: MapPoint[], maxSegM: number): MapPoint[] {
  if (pts.length < 2 || maxSegM <= 0) return pts.map((p) => [p[0], p[1]])
  const out: MapPoint[] = []
  const n = pts.length
  for (let i = 0; i < n; i++) {
    const a = pts[i]; const b = pts[(i + 1) % n]
    out.push([a[0], a[1]])
    const segLen = Math.hypot(b[0] - a[0], b[1] - a[1])
    const extra = Math.floor(segLen / maxSegM)
    for (let k = 1; k <= extra; k++) {
      const t = k / (extra + 1)
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t])
    }
  }
  return out
}

/** 多边形凸性判定（clipPolygonToParent 内部用）：逐三连续顶点取转向叉积，全程同号=凸；出现异号=非凸。
 *  三点以下（三角形）恒凸。用于分支选择——凸 parent 下纯顶点投影已是精确解（凸性保证任意两条边界投影点
 *  的连线不会穿出多边形），走批A 原实现，保持现役凸 parent 场景（现役造形绝大多数属此类）的输出顶点数/
 *  顺序/坐标与批A 完全一致（真机行为零回归）；只有非凸 parent 才走下方"稠密化+边界巡边"分支。 */
function isConvexPolygon(pts: MapPoint[]): boolean {
  const n = pts.length
  if (n < 4) return true
  let sign = 0
  for (let i = 0; i < n; i++) {
    const a = pts[i]; const b = pts[(i + 1) % n]; const c = pts[(i + 2) % n]
    const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0])
    if (Math.abs(cross) < 1e-9) continue
    const s = cross > 0 ? 1 : -1
    if (sign === 0) sign = s
    else if (s !== sign) return false
  }
  return true
}

/** 最近边界点+所在边序号（clipPolygonToParent 非凸分支专用）：与 nearestPointOnPolyline 同一套投影算法，
 *  多返回落在 parent 哪一条边上（segIndex：边 i 指 parent[i]→parent[(i+1)%n]）——供下方边界巡边判断
 *  "两个相邻投影点是否落在相距很远的两条边上"（纯顶点投影的失效根因：深凹口场景两侧墙各自最近，
 *  中间连线直接穿出，稠密化本身治不了这个——密度再高也只会在贴墙处产生更多重复投影点，不会产生
 *  "沿凹口底部绕行"的点，因为凹口底部从来不是任何采样点的最近边）。 */
function nearestPointOnClosedPolygonWithEdge(pt: MapPoint, poly: MapPoint[]): { point: MapPoint; distance: number; segIndex: number } {
  const n = poly.length
  let bestPoint: MapPoint = poly[0]
  let bestDistance = Infinity
  let bestSeg = 0
  for (let i = 0; i < n; i++) {
    const a = poly[i]; const b = poly[(i + 1) % n]
    const dx = b[0] - a[0]; const dy = b[1] - a[1]
    const lenSq = dx * dx + dy * dy
    let t = lenSq > 0 ? ((pt[0] - a[0]) * dx + (pt[1] - a[1]) * dy) / lenSq : 0
    t = Math.max(0, Math.min(1, t))
    const proj: MapPoint = [a[0] + dx * t, a[1] + dy * t]
    const d = Math.hypot(pt[0] - proj[0], pt[1] - proj[1])
    if (d < bestDistance) { bestDistance = d; bestPoint = proj; bestSeg = i }
  }
  return { point: bestPoint, distance: bestDistance, segIndex: bestSeg }
}

/** 把单个投影点朝 parent 质心方向内收极小量（避免恰好落在边界上被 pointInPoly 边界浮点误差判成"仍在外面"）。 */
function insetTowardCenter(point: MapPoint, center: MapPoint): MapPoint {
  const dx = center[0] - point[0]; const dy = center[1] - point[1]
  const len = Math.hypot(dx, dy) || 1
  const inset = Math.min(len, 0.01)
  return [point[0] + dx / len * inset, point[1] + dy / len * inset]
}

/** 非凸 parent 裁剪分支（笔刷约束系统批D·研究_00 障碍6 极限验证后新增）：稠密化+逐点投影+边界巡边 splice。
 *  验证发现（见 mapGeometry.spec.js "非凸 parent"用例）：child 边跨越深凹口时，纯稠密化+逐点独立投影
 *  仍会失效——凹口两侧墙各自是最近边，中间一段连续点全部收敛到同一侧墙上的几乎同一点，相邻两簇分属
 *  两侧墙的点之间仍是直连（因为凹口底部从不是任何采样点的最近边，密度再高也点不到它），穿出距离不降反而
 *  等于凹口开口宽度。根治=检测相邻投影点 segIndex 跳变（说明中间"跳过"了一段 parent 边界），此时把
 *  parent 边界上被跳过的顶点原样插入两点之间（forward/backward 两个方向序号本身已是"从 prev 走向 cur"
 *  的自然插入顺序，不需要额外反转——见下方两段循环注释），选顶点数更少的方向绕行，让输出路径贴着凹口
 *  内壁走，而不是直接穿过开口。诚实边界：child 被凹口整个切成两块互不连通区域时（全程不触达凹口底部），
 *  单多边形表达法结构性做不到——巡边会在凹口底部产生一段来回重叠的退化窄缝，这不是本函数试图解决的场景
 *  （见 clipPolygonToParent 顶部注释④）。 */
function clipPolygonToParentConcave(child: MapPoint[], parent: MapPoint[]): MapPoint[] {
  const center = centroid(parent)
  const parentBox = bboxOf(parent)
  const diag = Math.hypot(parentBox.maxX - parentBox.minX, parentBox.maxY - parentBox.minY)
  const maxSegM = Math.min(800, Math.max(5, diag * 0.025))
  const densified = densifyClosedPolygon(child, maxSegM)
  const n = parent.length

  type Projected = { point: MapPoint; outside: boolean; segIndex: number | null }
  const projected: Projected[] = densified.map((p) => {
    if (pointInPoly(p[0], p[1], parent)) return { point: [p[0], p[1]], outside: false, segIndex: null }
    const nearest = nearestPointOnClosedPolygonWithEdge(p, parent)
    return { point: insetTowardCenter(nearest.point, center), outside: true, segIndex: nearest.segIndex }
  })

  const out: MapPoint[] = []
  for (let i = 0; i < projected.length; i++) {
    const cur = projected[i]
    const prev = i > 0 ? projected[i - 1] : null
    // 相邻两点都在外、且落在不相邻的两条 parent 边上：说明中间跳过了一段边界——把跳过的 parent 顶点
    // 原样插入（内收同一极小量，保持"贴边但不恰好在边界浮点上"的一致语义），走顶点数更少的方向绕行。
    // 两个方向的序号都已经是「从 prev 走向 cur」的自然插入顺序（forward 递增含终点 cur.segIndex 本身；
    // backward 递减含 cur.segIndex+1，即恰好在 cur 所在边的起点处止步），都不需要额外反转。
    if (prev && prev.outside && cur.outside && prev.segIndex !== null && cur.segIndex !== null && prev.segIndex !== cur.segIndex) {
      const forward: number[] = []
      for (let s = (prev.segIndex + 1) % n; ; s = (s + 1) % n) {
        forward.push(s)
        if (s === cur.segIndex) break
      }
      const backward: number[] = []
      for (let s = prev.segIndex; ; s = (s - 1 + n) % n) {
        backward.push(s)
        if (s === (cur.segIndex + 1) % n) break
      }
      const viaIdx = forward.length <= backward.length ? forward : backward
      for (const vi of viaIdx) out.push(insetTowardCenter(parent[vi], center))
    }
    out.push(cur.point)
  }
  // 去重连续重合点（尖锐凹口/密集稠密化下常见：多个相邻投影点收敛到同一 parent 顶点，产生零长度边）——
  // 零长度边本身不构成有效几何，且会让自相交检测把"退化重合点"误判成真交叉，去重后不改变多边形形状
  // （跳过的都是与前一个输出点坐标相同的点），只清理冗余顶点。
  const deduped: MapPoint[] = []
  for (const p of out) {
    const last = deduped[deduped.length - 1]
    if (!last || last[0] !== p[0] || last[1] !== p[1]) deduped.push(p)
  }
  if (deduped.length > 1 && deduped[0][0] === deduped[deduped.length - 1][0] && deduped[0][1] === deduped[deduped.length - 1][1]) {
    deduped.pop() // 首尾重合（闭合多边形按惯例不重复存首点）
  }
  return deduped
}

/** 把 child 多边形裁进 parent 多边形内部（真机修 #24 几何基建：嵌套海拔面/山脊内核不超出外层）。
 *  **凸 parent（现役绝大多数造形属此类）**：逐顶点投影已是精确解——顶点已在 parent 内原样保留；越界
 *  顶点投影到 parent 边界最近点，再朝质心内收极小量。逐字保留批A 原实现与输出（顶点数/顺序/坐标不变，
 *  真机行为零回归）。
 *  **非凸 parent（笔刷约束系统批D 新处理·研究_00 障碍6 极限验证，见 mapGeometry.spec.js 星形凹口用例）**：
 *  转 clipPolygonToParentConcave（稠密化+边界巡边 splice）。**验证结论**：①纯逐顶点投影对非凸 parent
 *  会让"两端点都在内"的边直穿凹口；②光加稠密化不够——凹口两侧墙各自最近，密度再高也不会有采样点落在
 *  凹口底部，两簇独立收敛点之间仍直连；③巡边 splice（检测到相邻投影点跨越了不相邻的 parent 边，就把
 *  跳过的 parent 顶点插回去）才是根治——对"裁剪后应保持单一连通区域"的现实场景（分批拔升典型形态：小
 *  核心整体压在大轮廓内部/边缘，与凹口底部仍有交集）验证近乎精确（残留穿出≈inset 极小量级，比旧版
 *  50m 级穿出收窄两个数量级）；④诚实边界——child 被凹口整个切成两块互不连通的区域时（如 child 横跨凹口
 *  但全程不触达凹口底部），单多边形表达法结构性做不到完美裁剪，巡边会在凹口底部产生一段来回重叠的退化
 *  窄缝；这是"结果只能是一个多边形"的本质局限，本批不升级到可输出多个多边形的 Weiler-Atherton 等通用
 *  布尔裁剪库（复杂度/收益比不划算，真实地形嵌套场景里子要素被凹口完全切两半的概率很低）。
 *  确定性（无随机/seed，两分支皆然）。 */
export function clipPolygonToParent(child: MapPoint[], parent: MapPoint[]): MapPoint[] {
  if (parent.length < 3) return child.map((p) => [p[0], p[1]])
  if (isConvexPolygon(parent)) {
    const closedParent = [...parent, parent[0]]
    const center = centroid(parent)
    return child.map((p) => {
      if (pointInPoly(p[0], p[1], parent)) return [p[0], p[1]]
      const nearest = nearestPointOnPolyline(p, closedParent).point
      const dx = center[0] - nearest[0]; const dy = center[1] - nearest[1]
      const len = Math.hypot(dx, dy) || 1
      const inset = Math.min(len, 0.01)
      return [nearest[0] + dx / len * inset, nearest[1] + dy / len * inset]
    })
  }
  return clipPolygonToParentConcave(child, parent)
}

// ── 网格坐标系（地图草案剪影可视化计划批4·2026-07-12）─────────────────────────────
// 给人读的网格坐标：列字母+行数字（如 D5），帮助人图对位「模型说的哪块=地图上哪里」。精确坐标给机器、
// 网格格号给人，换算全在前端做（模型不做格号算术，绘舆/双坞均不感知这套坐标）。纯函数，不依赖 DOM。

/** 网格档位表（米，10/20/50/100/200/500km）：从最小档开始试，取第一个使 max(列数,行数)≤14 的档；
 *  世界大到连最大档都超出 14 格，也用最大档封顶（不再无限放大格边长）。 */
const MAP_GRID_CELL_STEPS_M = [10000, 20000, 50000, 100000, 200000, 500000]

export type MapGridSpec = { cellM: number; originX: number; originY: number; cols: number; rows: number }

/** 按世界 bounds 算自适应网格规格（约 12×12）：origin=bounds 左上角对齐格线（向下取整到 cellM 整数倍——
 *  格线对齐后 cols/rows 按新 origin 到 bounds 右下角重算，因此判定"是否满足 14 格封顶"必须用对齐后的
 *  最终值，不能用对齐前的估算值，否则临界世界可能在对齐后超出 14 格）。 */
export function computeMapGridSpec(bounds: MapBBox): MapGridSpec {
  let spec: MapGridSpec = { cellM: MAP_GRID_CELL_STEPS_M[0], originX: 0, originY: 0, cols: 1, rows: 1 }
  for (const cellM of MAP_GRID_CELL_STEPS_M) {
    const originX = Math.floor(bounds.minX / cellM) * cellM
    const originY = Math.floor(bounds.minY / cellM) * cellM
    const cols = Math.max(1, Math.ceil((bounds.maxX - originX) / cellM))
    const rows = Math.max(1, Math.ceil((bounds.maxY - originY) / cellM))
    spec = { cellM, originX, originY, cols, rows }
    if (Math.max(cols, rows) <= 14) return spec
  }
  return spec // 都超出：用最大档（500km）封顶，spec 已是循环最后一档的结果
}

/** 列号 → 字母（0 起 A/B/…/Z/AA/AB…，Excel 风格进位）：正常网格 ≤14 格用不到两位，超 26 列时防御性续写。 */
export function mapGridColumnLetter(index: number): string {
  let n = index
  let label = ''
  do {
    label = String.fromCharCode(65 + (n % 26)) + label
    n = Math.floor(n / 26) - 1
  } while (n >= 0)
  return label
}

/** 坐标 → 网格格号（如 D5）：列字母从西向东（x 正向），行数字从北向南（y 正向）恒 1 起。越界（含 NaN）返回空串。 */
export function formatMapGridRef(x: number, y: number, spec: MapGridSpec): string {
  const col = Math.floor((x - spec.originX) / spec.cellM)
  const row = Math.floor((y - spec.originY) / spec.cellM)
  if (!Number.isFinite(col) || !Number.isFinite(row) || col < 0 || col >= spec.cols || row < 0 || row >= spec.rows) return ''
  return mapGridColumnLetter(col) + String(row + 1)
}
