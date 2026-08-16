// 地图系统 · 宏笔刷生成器（地图分阶段作画与笔刷约束系统 · 批E · 2026-07-12）
//
// 宏笔刷="一笔生成一整套关联要素"（山脉链/水系树/城区路网/城际道路），是笔刷 DSL 的下一步演化（计划书
// 二.6"下一步抽象升级方向=宏笔刷"）：模型只做语义决策（哪里、多大、什么走向），自然形态与合法性全部交给
// 算法。本文件纯函数库：只依赖 mapGeometry.ts 的造形/几何原语与 mapAnalysisGrid.ts 的分析网格查询，不
// import 工具层/组件层/服务端任何东西（同 mapAnalysisGrid.ts 批B 定下的纯度纪律：huiyuMapTools.ts 单向
// 依赖本文件，本文件不反向依赖 huiyuMapTools.ts）——工具注册/写库链/Lock/阶段过滤归 huiyuMapTools.ts。
//
// 构造性合法优先（计划书批E任务书）：每个生成器都通过"用网格/寻路/裁剪算法保证合法"而非事后校验——
// 山脉核心用 clipPolygonToParent 强制嵌套（不可能戳出底座）、水系树用 traceFlowDownhill 沿真实地势
// 下坡（不可能逆流）、城际道路用 roadCostTrial 代价寻路避坡（不可能踩坡度硬上限）。四件都强制要素量帽
// （超限自动收敛+result.notes 注明），帽值由工具层落库前的生成阶段就已封顶，不依赖体检事后删减。
//
// 已知边界（诚实标注，非本批要治的范围）：宏笔刷内部只覆盖水文/坡度/嵌套核心三个最容易出错的维度；对
// "生成结果是否与既有要素触犯 crossRules 禁叠"等边界情形不做二次孤立防御（如城区中心恰好选在已有水域上），
// 交给工具层落库后的 auditMap 报告兜底——同 submitMap 既有"体检放行不阻塞"哲学一致，见 huiyuMapTools.ts
// persistMacroBrushResult 的调用点注释。

import {
  bboxOf,
  buildMeanderPath,
  buildRidgePolygon,
  buildShapePolygon,
  centroid,
  clipPolygonToParent,
  closeRing,
  hashStr,
  mulberry32,
  nearestPointOnPolyline,
  resolvePlacementClear,
  segmentIntersectionDetail,
  alongPolyline,
  BRUSH_SPEC,
  type MapPoint
} from './mapGeometry'
import {
  findContinuousWaterRuns,
  findNearestLegalBank,
  roadCostTrial,
  traceFlowDownhill,
  validateRiverPath,
  type AnalysisGrid
} from './mapAnalysisGrid'

// ── 公共类型 ──────────────────────────────────────────────────────────────

/** 宏笔刷产出的单个要素草案：工具层据此批量落库（补 meta.stage 出生戳、一次性 saveWorldMapFeaturesRemote）。 */
export interface MacroBrushDraftFeature {
  kind: 'region' | 'path' | 'marker'
  category: string
  name: string
  layer: 'terrain' | 'civic'
  pts: MapPoint[]
  spine?: MapPoint[]
  elevationM?: number
  meta?: Record<string, unknown>
}

export interface MacroBrushResult {
  features: MacroBrushDraftFeature[]
  /** 生成过程说明（挂接吸附成败/自动收敛/跳过的候选等），工具层拼进回执正文。 */
  notes: string[]
  /** 量化统计（如 quarter 估算数/Strahler 阶数分布），供测试与回执附注读取，不落库。 */
  stats: Record<string, unknown>
}

function emptyResult(note: string): MacroBrushResult {
  return { features: [], notes: [note], stats: {} }
}

function numOr(value: unknown, fallback: number): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function clamp(value: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, value))
}

/** 折线累计弧长表（首元素恒 0）。 */
function cumulativeLengths(pts: MapPoint[]): number[] {
  const cum = [0]
  for (let i = 1; i < pts.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]))
  }
  return cum
}

/** 折线上按弧长比例 t(0~1) 插值取点（本文件自有小工具·mapGeometry.ts/mapAnalysisGrid.ts 各自也维护一份
 *  同类私有实现，非共享状态——不到 15 行的纯几何小工具，重复成本可接受，见 mapAnalysisGrid.ts
 *  downsampleKeepEnds 函数注释的既有先例）。 */
function pointAtFraction(pts: MapPoint[], cum: number[], t: number): MapPoint {
  const total = cum[cum.length - 1] || 0
  const target = clamp(t, 0, 1) * total
  for (let i = 1; i < pts.length; i++) {
    if (target <= cum[i] || i === pts.length - 1) {
      const segLen = cum[i] - cum[i - 1] || 1
      const localT = clamp((target - cum[i - 1]) / segLen, 0, 1)
      return [
        pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * localT,
        pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * localT
      ]
    }
  }
  return pts[pts.length - 1]
}

/** 单段折线是否顺流（无 uphill 问题）：复用 validateRiverPath 本体做判据——同一套 cellSize/2 稠密采样
 *  与容差逻辑，保证"这里说合法"与"硬门/体检说合法"永远同口径（bad-terminus 忽略：段中点必然在陆上）。 */
function segmentFlowsDownhill(a: MapPoint, b: MapPoint, grid: AnalysisGrid, upTolM: number): boolean {
  const check = validateRiverPath([a, b], grid, { upTolM })
  return check.ok || check.problems.every((p) => p.kind === 'bad-terminus')
}

/** 顺流保持的折线简化（buildRiverSystem 专用）：D8 追踪出的逐格中心点太密（几十~几百点），朴素等距
 *  下采样会让直连段抄近路穿过更高的格子破坏单调性（实测踩中）；这里贪心拉直——每次从锚点尽量向前跳，
 *  跳段本身过 segmentFlowsDownhill 才接受，保证简化后整条路径仍顺流（构造性合法在简化环节不丢失）。
 *  输出点数无严格上限（全程拉不直时退化为原样），实践中 ≈raw/maxJump。 */
function simplifyFlowPath(raw: MapPoint[], grid: AnalysisGrid, upTolM: number, targetMax = 16): MapPoint[] {
  if (raw.length <= targetMax) return raw
  const maxJump = Math.max(2, Math.ceil(raw.length / Math.max(1, targetMax - 1)) * 2)
  const out: MapPoint[] = [raw[0]]
  let anchor = 0
  while (anchor < raw.length - 1) {
    let chosen = anchor + 1
    const cap = Math.min(raw.length - 1, anchor + maxJump)
    for (let next = cap; next > anchor + 1; next--) {
      if (segmentFlowsDownhill(raw[anchor], raw[next], grid, upTolM)) { chosen = next; break }
    }
    out.push(raw[chosen])
    anchor = chosen
  }
  return out
}

// ═══ 一、山脉链 buildMountainChain ═══════════════════════════════════════════
// 研究_03 §8.3 原则一/二：全局目标（走向骨架 anchor 链）与局部约束（既有地形最小间距/海拔过渡）分离；
// 主链/支链两层结构。山脉普适数值稀缺（研究_05 §5.3 如实标注多数参数"查无普适值"），本函数缺省值按
// 审美缺省给定，非科学结论——与研究_05 一致的诚实标注风格。

export interface MountainChainOptions {
  /** 走向骨架点列（≥2 点·底座主脊 from→…→to）。 */
  anchors: MapPoint[]
  /** 底座满宽（米）。 */
  chainWidthM: number
  /** 底座海拔（米·缺省 1400，同 BRUSH_SPEC.mountain 附近中低值）。 */
  baseElevationM?: number
  /** 高海拔核心海拔（米·缺省=底座+1600）。 */
  coreElevationM?: number
  /** 核心宽度=底座宽度的比例 0~1（缺省 0.45）。 */
  coreWidthRatio?: number
  /** 核心覆盖主链弧长的比例，居中截取（缺省 0.5）。 */
  coreLengthRatio?: number
  /** 每个候选分叉点生成支脉的概率 0~1（缺省 0.5）。 */
  spurProbability?: number
  /** 支脉相对脊线法向的角度扰动上限（度·缺省 35：支脉方向=法向±35°内随机）。 */
  spurAngleDeg?: number
  /** 支脉长度=底座满宽的倍数（缺省 2.2）。 */
  spurLengthRatio?: number
  /** 支脉宽度=底座满宽的比例（缺省 0.4）。 */
  spurWidthRatio?: number
  /** 名称前缀（缺省"山脉链"）。 */
  namePrefix?: string
  seed: number | string
}

export const MOUNTAIN_CHAIN_MAX_FEATURES = 15
/** 支脉候选上限（独立于要素总量帽·避免密度过高导致视觉拥挤）。 */
const MOUNTAIN_CHAIN_MAX_SPURS = 6

export function buildMountainChain(opts: MountainChainOptions): MacroBrushResult {
  const anchors = Array.isArray(opts.anchors) ? opts.anchors : []
  if (anchors.length < 2) return emptyResult('anchors 不足两点，无法生成山脉链（至少给起止两点描出走向）')
  const chainWidthM = Math.max(1, opts.chainWidthM)
  const baseElevationM = numOr(opts.baseElevationM, 1400)
  const coreElevationM = numOr(opts.coreElevationM, baseElevationM + 1600)
  const coreWidthRatio = clamp(numOr(opts.coreWidthRatio, 0.45), 0.1, 0.9)
  const coreLengthRatio = clamp(numOr(opts.coreLengthRatio, 0.5), 0.15, 0.9)
  const spurProbability = clamp(numOr(opts.spurProbability, 0.5), 0, 1)
  const spurAngleDeg = clamp(numOr(opts.spurAngleDeg, 35), 0, 80)
  const spurLengthRatio = Math.max(0.5, numOr(opts.spurLengthRatio, 2.2))
  const spurWidthRatio = clamp(numOr(opts.spurWidthRatio, 0.4), 0.1, 1)
  const namePrefix = String(opts.namePrefix || '山脉链').trim() || '山脉链'
  const seedBase = typeof opts.seed === 'string' ? opts.seed : String(opts.seed)

  const notes: string[] = []
  const features: MacroBrushDraftFeature[] = []

  // 底座主脊：串接整条 anchors（from=首/to=末/waypoints=中间点），构造性保证=buildRidgePolygon 出口断言
  // （自身不自交，见 mapGeometry.ts 该函数注释）。
  const from = anchors[0]
  const to = anchors[anchors.length - 1]
  const waypoints = anchors.slice(1, -1)
  const basePts = buildRidgePolygon({ from, to, width: chainWidthM, waypoints, taper: 0.55, roughness: 0.22, seed: `${seedBase}-base` })
  features.push({
    kind: 'region', category: 'mountain', name: `${namePrefix}·底座`, layer: 'terrain',
    pts: basePts, elevationM: baseElevationM, spine: anchors,
    meta: { shape: { form: 'macroChainBase', seed: `${seedBase}-base`, anchors, chainWidthM } }
  })

  // 高海拔核心：沿主链居中截取一段更短的骨架，clipPolygonToParent 强制裁进底座内部——不可能戳出
  // （构造性合法，呼应"分批拔升"家族语义，同批A/批D的地形嵌套教学一致）。
  const cum = cumulativeLengths(anchors)
  const coreStartT = (1 - coreLengthRatio) / 2
  const coreEndT = 1 - coreStartT
  const total = cum[cum.length - 1] || 1
  const coreFrom = pointAtFraction(anchors, cum, coreStartT)
  const coreTo = pointAtFraction(anchors, cum, coreEndT)
  const coreWaypoints = anchors.filter((_, i) => i > 0 && i < anchors.length - 1 && cum[i] / total > coreStartT && cum[i] / total < coreEndT)
  const coreRawPts = buildRidgePolygon({
    from: coreFrom, to: coreTo, width: chainWidthM * coreWidthRatio, waypoints: coreWaypoints,
    taper: 0.6, roughness: 0.16, seed: `${seedBase}-core`
  })
  const corePts = clipPolygonToParent(coreRawPts, basePts)
  features.push({
    kind: 'region', category: 'mountain', name: `${namePrefix}·核心`, layer: 'terrain',
    pts: corePts, elevationM: coreElevationM,
    meta: { shape: { form: 'macroChainCore', seed: `${seedBase}-core` } }
  })

  // 支脉：沿底座脊线等距采样候选分叉点（alongPolyline 给点+法向量），逐点掷 rng 决定是否生成；
  // 根点起步于候选点，方向=法向（左右交替）±随机角度扰动；用 resolvePlacementClear（既有"放置卫兵"
  // 原语）把整条支脉推到不与底座/核心重叠为止——不做手工边距估算（roughen 后的边界不是解析可算的
  // 精确值），复用已验证过的通用避让工具（同 drawMapRegion 的 form=ridge 障碍推移同一套手法）。
  const sampleStep = Math.max(chainWidthM * 0.9, 200)
  const candidates = alongPolyline(anchors, sampleStep)
  const obstacles = [basePts, corePts]
  const spurElevationM = Math.round(baseElevationM * 0.78)
  const spurBudget = Math.min(MOUNTAIN_CHAIN_MAX_SPURS, MOUNTAIN_CHAIN_MAX_FEATURES - features.length)
  let spurIndex = 0
  for (const stop of candidates) {
    if (spurIndex >= spurBudget) break
    const rollRng = mulberry32(hashStr(`${seedBase}-spur-roll-${spurIndex}`))
    if (rollRng() > spurProbability) { spurIndex++; continue }
    const jitterRng = mulberry32(hashStr(`${seedBase}-spur-angle-${spurIndex}`))
    const side = spurIndex % 2 === 0 ? 1 : -1
    const jitterRad = (jitterRng() * 2 - 1) * (spurAngleDeg * Math.PI / 180)
    const normalAngle = Math.atan2(stop.ny, stop.nx)
    const dirAngle = normalAngle + (side < 0 ? Math.PI : 0) + jitterRad
    const dir: MapPoint = [Math.cos(dirAngle), Math.sin(dirAngle)]
    const spurLenM = chainWidthM * spurLengthRatio
    const spurWidthM = Math.max(50, chainWidthM * spurWidthRatio)
    const rootStart: MapPoint = [stop.x, stop.y]
    const tipOf = (root: MapPoint): MapPoint => [root[0] + dir[0] * spurLenM, root[1] + dir[1] * spurLenM]
    const buildAt = (center: MapPoint): MapPoint[] => buildRidgePolygon({
      from: center, to: tipOf(center), width: spurWidthM, taper: 0.65, roughness: 0.25, seed: `${seedBase}-spur-${spurIndex}`
    })
    const cleared = resolvePlacementClear({ start: rootStart, build: buildAt, obstacles, stepM: Math.max(60, spurWidthM * 0.5), maxSteps: 10 })
    if (!cleared.clear) { notes.push(`支脉候选 ${spurIndex + 1} 与主体持续重叠未能推开，已跳过`); spurIndex++; continue }
    features.push({
      kind: 'region', category: 'mountain', name: `${namePrefix}·支脉${spurIndex + 1}`, layer: 'terrain',
      pts: cleared.pts, elevationM: spurElevationM,
      meta: { shape: { form: 'macroChainSpur', seed: `${seedBase}-spur-${spurIndex}` } }
    })
    spurIndex++
  }

  if (features.length >= MOUNTAIN_CHAIN_MAX_FEATURES) notes.push(`要素数已达上限 ${MOUNTAIN_CHAIN_MAX_FEATURES}，超出候选未再生成`)
  return { features, notes, stats: { spurCount: features.length - 2, baseElevationM, coreElevationM } }
}

// ═══ 二、水系树 buildRiverSystem ═════════════════════════════════════════════
// 干流=traceFlowDownhill 沿分析网格 flowDir 真实下坡（构造性单调不升，validateRiverPath 必然通过）；
// 支流=45°~75°汇入角（研究_05 §5.2 气候无关缺省 60°区间）挂接吸附到干流；Strahler 分级（研究_02 §4.2）
// 定河宽档位——meta.shape.widthProfile 口径同批W drawMapPath（宽度存 meta，bank 渲染端派生，不落库）。

export interface RiverSystemOptions {
  /** 源头附近坐标（读图后由调用方自定；本函数不判断"这是不是山"，纯网格/几何）。 */
  source: MapPoint
  /** 支流数量档（缺省 medium）：low=1/medium=2/high=3。 */
  tributaryTier?: 'low' | 'medium' | 'high'
  /** 名称前缀（缺省"水系"）。 */
  namePrefix?: string
  seed: number | string
}

export const RIVER_SYSTEM_MAX_FEATURES = 20
const RIVER_TRIBUTARY_COUNT_BY_TIER: Record<string, number> = { low: 1, medium: 2, high: 3 }
const RIVER_TRIBUTARY_FRACTIONS: Record<number, number[]> = { 1: [0.5], 2: [0.35, 0.65], 3: [0.25, 0.5, 0.75] }
/** Strahler widthTier(1~5) → widthProfile 绝对米数（本函数手设·研究_02 §4.2"五档封顶"惯例，参照批W
 *  river 类目缺省剖面 6→160m 在 tier 2~4 附近取值，风格同批W"v1=参数化手设"定位，具体数值待画廊调优）。 */
const RIVER_WIDTH_BY_TIER: Record<number, { sourceWidthM: number; mouthWidthM: number }> = {
  1: { sourceWidthM: 3, mouthWidthM: 12 },
  2: { sourceWidthM: 6, mouthWidthM: 45 },
  3: { sourceWidthM: 10, mouthWidthM: 95 },
  4: { sourceWidthM: 16, mouthWidthM: 160 },
  5: { sourceWidthM: 24, mouthWidthM: 260 }
}

/** Strahler 合并公式（研究_02 §4.2）：同级相遇才升级，小支流汇入不升级。 */
function mergeStrahler(a: number, b: number): number {
  return a === b ? a + 1 : Math.max(a, b)
}

export function buildRiverSystem(opts: RiverSystemOptions, grid: AnalysisGrid): MacroBrushResult {
  const namePrefix = String(opts.namePrefix || '水系').trim() || '水系'
  const seedBase = typeof opts.seed === 'string' ? opts.seed : String(opts.seed)

  const trunkRaw = traceFlowDownhill(opts.source, grid)
  if (trunkRaw.length < 2) {
    return emptyResult('源头坐标已处于水域/图缘，无法追出一条向下游延伸的干流——换一个更靠内陆的源头点')
  }
  // 简化必须走顺流保持版（见 simplifyFlowPath 注释——朴素等距下采样会抄近路穿更高格子破坏单调性），
  // 简化后仍跑一次完整 validateRiverPath 兜底断言；失败退回未简化的逐格路径（必然合法，只是点更密）。
  let trunkPts = simplifyFlowPath(trunkRaw, grid, 0.5, 16)
  if (!validateRiverPath(trunkPts, grid).ok) trunkPts = trunkRaw

  const notes: string[] = []
  const tributaryCount = clamp(RIVER_TRIBUTARY_COUNT_BY_TIER[opts.tributaryTier || 'medium'] ?? 2, 0, 3)
  const fractions = RIVER_TRIBUTARY_FRACTIONS[tributaryCount] || []
  const trunkCum = cumulativeLengths(trunkPts)
  const trunkTotalLen = trunkCum[trunkCum.length - 1] || 1

  const tributaries: Array<{ pts: MapPoint[]; joined: boolean }> = []
  for (let i = 0; i < fractions.length; i++) {
    if (2 + tributaries.length >= RIVER_SYSTEM_MAX_FEATURES) break
    const junction = pointAtFraction(trunkPts, trunkCum, fractions[i])
    const nearIdx = clamp(Math.round(fractions[i] * (trunkPts.length - 1)), 1, trunkPts.length - 1)
    const prevPt = trunkPts[nearIdx - 1]
    const nextPt = trunkPts[nearIdx]
    const tangent = Math.atan2(nextPt[1] - prevPt[1], nextPt[0] - prevPt[0])
    const angleRng = mulberry32(hashStr(`${seedBase}-trib-${i}`))
    const confluenceDeg = 45 + angleRng() * 30 // 研究_05 §5.2：45°~75°气候无关缺省区间
    const side = i % 2 === 0 ? 1 : -1
    // 支流"进入干流时的流向"近似=干流切线按 confluenceDeg 旋转；源头取该方向反向回退一段距离作为候选。
    const approachAngle = tangent + side * (confluenceDeg * Math.PI / 180)
    const approachDir: MapPoint = [Math.cos(approachAngle), Math.sin(approachAngle)]
    const searchDistM = Math.max(grid.spec.cellSize * 8, trunkTotalLen * 0.12)
    const candidateSource: MapPoint = [junction[0] - approachDir[0] * searchDistM, junction[1] - approachDir[1] * searchDistM]

    const tribRaw = traceFlowDownhill(candidateSource, grid)
    if (tribRaw.length < 2) { notes.push(`支流候选 ${i + 1} 源头落在水域/图缘，已跳过`); continue }
    const tribDown = simplifyFlowPath(tribRaw, grid, 1, 12)
    // 尾段挂接吸附（45°~75°汇入角挂接吸附）：把终点吸附到干流最近点。合法性判据=吸附后沿线**无 uphill
    // 问题**（顺流铁律不破坏），刻意不要求 validateRiverPath 的 terminus 判据——网格里的水只来自 water
    // region、干流是 path 不印进网格（批B 已文档化的语义边界），支流终点落在干流线上必然被网格判成
    // "陆上悬空终点"，但那正是"汇入干流"的合法形态；落库后的 MAP-1060 体检同样只查 uphill 不查 terminus
    // （findNonMonotonicFlowFindings 同一口径），悬空判定由 endpoint_snap 审计负责（river 的 snapTargets
    // 含 river path·距离 0 恒着陆），三处口径一致不会误报。吸附产生 uphill 时保留独立追踪出的入海/入湖
    // 路径（不强行制造一条实际逆坡的假挂接）。
    const snapped = nearestPointOnPolyline(tribDown[tribDown.length - 1], trunkPts).point
    const snappedPts = [...tribDown.slice(0, -1), snapped]
    const snappedCheck = validateRiverPath(snappedPts, grid, { upTolM: 1 })
    const snappedOk = snappedCheck.ok || snappedCheck.problems.every((p) => p.kind === 'bad-terminus')
    const finalPts = snappedOk ? snappedPts : tribDown
    if (!snappedOk) notes.push(`支流候选 ${i + 1} 挂接干流会产生逆坡，改保留其独立入海/入湖路径`)
    tributaries.push({ pts: finalPts, joined: snappedOk })
  }

  // Strahler 分级：干流建模为单一线段（无法表达多级递归树），简化=把干流自身视为隐式1阶源头，逐条
  // 已挂接支流按标准合并公式滚动合并得到干流最终阶数——v1 只支持"干流+直接汇入的支流"两层，未挂接的
  // 独立支流不参与合并（它们本就是各自入海/入湖的独立河，不是这棵树的一部分）。如实标注非完整递归树。
  let trunkOrder = 1
  for (const trib of tributaries) if (trib.joined) trunkOrder = mergeStrahler(trunkOrder, 1)
  const trunkTier = Math.min(5, trunkOrder)
  const trunkWidth = RIVER_WIDTH_BY_TIER[trunkTier]

  // widthProfile 存放位置=meta.shape.widthProfile（批W 口径单点：渲染端 MapViewerDialog.deriveBankFromMeta
  // 只认这个路径重派生 bank——放错层级渲染端会当"无宽度剖面存量河"退回细线）。
  const features: MacroBrushDraftFeature[] = [{
    kind: 'path', category: 'river', name: `${namePrefix}·干流`, layer: 'terrain', pts: trunkPts,
    meta: {
      shape: {
        kind: 'macroRiverSystem', role: 'trunk', seed: `${seedBase}-trunk`, strahlerOrder: trunkOrder, widthTier: trunkTier,
        widthProfile: { sourceWidthM: trunkWidth.sourceWidthM, mouthWidthM: trunkWidth.mouthWidthM, growthExponent: 0.5 }
      }
    }
  }]
  tributaries.forEach((trib, i) => {
    const width = RIVER_WIDTH_BY_TIER[1]
    features.push({
      kind: 'path', category: 'river', name: `${namePrefix}·支流${i + 1}`, layer: 'terrain', pts: trib.pts,
      meta: {
        shape: {
          kind: 'macroRiverSystem', role: 'tributary', seed: `${seedBase}-trib-${i}`, strahlerOrder: 1, widthTier: 1, joinedTrunk: trib.joined,
          widthProfile: { sourceWidthM: width.sourceWidthM, mouthWidthM: width.mouthWidthM, growthExponent: 0.5 }
        }
      }
    })
  })

  if (features.length >= RIVER_SYSTEM_MAX_FEATURES) notes.push(`要素数已达上限 ${RIVER_SYSTEM_MAX_FEATURES}`)
  return {
    features, notes,
    stats: { trunkOrder, tributaryCount: tributaries.length, joinedCount: tributaries.filter((t) => t.joined).length }
  }
}

// ═══ 三、城区路网 buildCityLayout ════════════════════════════════════════════
// 研究_03 §7.1 配方：中心↔城门代价寻路主干道（贯穿由构造保证）→ 街道网格/有机二档细分（贯穿同样由
// "端点=边界交点"的构造保证，不依赖事后校验）→ 可选城墙+城门。quarter 用解析估算（诚实标注：非真实
// 多边形提取——本项目未引入计算几何 union/平面图面提取库，见文件头"已知边界"），供回执/测试读取。

export interface CityLayoutOptions {
  center: MapPoint
  radiusM: number
  /** 主方向角度（度·缺省 0）：研究_03 §6 节"主方向+垂直支方向"简化张量场模型。 */
  orientationDeg?: number
  streetPattern?: 'grid' | 'organic'
  /** 街区尺度基准（米·缺省按 radiusM 自动估算）。 */
  blockSizeM?: number
  /** 有机档弯曲度 0~1（仅 streetPattern=organic 生效，缺省 0.3）。 */
  meander?: number
  /** 对外连接锚点（缺省按东南西北四方位自动推导边界交点）。 */
  gateAnchors?: MapPoint[]
  wallEnabled?: boolean
  namePrefix?: string
  seed: number | string
}

export const CITY_LAYOUT_MAX_FEATURES = 40
const CITY_MAX_LINES_PER_AXIS = 5
const CITY_DEFAULT_BEARING_VECTORS: MapPoint[] = [[1, 0], [0, 1], [-1, 0], [0, -1]] // 东/南/西/北（y向南）

/** 射线与闭合多边形的最近交点（沿 from→to 方向 t 最小的一个）。 */
function firstBoundaryCrossing(from: MapPoint, to: MapPoint, poly: MapPoint[]): MapPoint | null {
  const n = poly.length
  let best: { point: MapPoint; t: number } | null = null
  for (let i = 0; i < n; i++) {
    const hit = segmentIntersectionDetail(from, to, poly[i], poly[(i + 1) % n])
    if (hit && (!best || hit.t < best.t)) best = hit
  }
  return best ? best.point : null
}

/** 线段与闭合多边形的最外侧交点区间（用于把跨越整个边界的直线裁成"贯穿城区"的一段·取最小/最大参数
 *  两个交点，不是精确的单段进出——非凸边界可能有更多交点，这里只取最外沿，够用于"横纵贯穿"这一诉求）。 */
function clipSegmentToPolygon(p1: MapPoint, p2: MapPoint, poly: MapPoint[]): { a: MapPoint; b: MapPoint } | null {
  const n = poly.length
  const hitTs: number[] = []
  const hitPts: MapPoint[] = []
  for (let i = 0; i < n; i++) {
    const hit = segmentIntersectionDetail(p1, p2, poly[i], poly[(i + 1) % n])
    if (hit) { hitTs.push(hit.t); hitPts.push(hit.point) }
  }
  if (hitTs.length < 2) return null
  let minI = 0; let maxI = 0
  for (let i = 1; i < hitTs.length; i++) {
    if (hitTs[i] < hitTs[minI]) minI = i
    if (hitTs[i] > hitTs[maxI]) maxI = i
  }
  return { a: hitPts[minI], b: hitPts[maxI] }
}

function autoGateAnchors(center: MapPoint, boundaryPts: MapPoint[]): MapPoint[] {
  const box = bboxOf(boundaryPts)
  const farDist = Math.hypot(box.maxX - box.minX, box.maxY - box.minY) * 2 + 1
  const out: MapPoint[] = []
  for (const [dx, dy] of CITY_DEFAULT_BEARING_VECTORS) {
    const far: MapPoint = [center[0] + dx * farDist, center[1] + dy * farDist]
    const hit = firstBoundaryCrossing(center, far, boundaryPts)
    if (hit) out.push(hit)
  }
  return out.length ? out : [boundaryPts[0]]
}

export function buildCityLayout(opts: CityLayoutOptions, grid: AnalysisGrid): MacroBrushResult {
  const namePrefix = String(opts.namePrefix || '城区').trim() || '城区'
  const seedBase = typeof opts.seed === 'string' ? opts.seed : String(opts.seed)
  const radiusM = Math.max(100, opts.radiusM)
  const orientationRad = numOr(opts.orientationDeg, 0) * Math.PI / 180
  const streetPattern = opts.streetPattern === 'organic' ? 'organic' : 'grid'
  const blockSizeM = Math.max(40, numOr(opts.blockSizeM, Math.max(80, radiusM * 0.18)))
  const meander = clamp(numOr(opts.meander, streetPattern === 'organic' ? 0.3 : 0.08), 0, 1)
  const wallEnabled = Boolean(opts.wallEnabled)

  const notes: string[] = []
  const features: MacroBrushDraftFeature[] = []
  const budgetLeft = () => features.length < CITY_LAYOUT_MAX_FEATURES

  const boundaryPts = buildShapePolygon({
    cx: opts.center[0], cy: opts.center[1], rx: radiusM, ry: radiusM * 0.85,
    form: 'rect', roughness: 0.02, seed: `${seedBase}-boundary`
  })
  features.push({
    // elevationM 显式给（同 BRUSH_SPEC.urban.defaultElevationM=50）：宏笔刷产出不依赖调用方另查缺省表，
    // 生成即带物理真值（渲染端不给也能靠类目缺省表兜底，这里显式给是更干净的产出习惯，非必需修正）。
    kind: 'region', category: 'urban', name: namePrefix, layer: 'civic', pts: boundaryPts, elevationM: 50,
    meta: { shape: { form: 'macroCityBoundary', seed: `${seedBase}-boundary`, orientationDeg: opts.orientationDeg ?? 0 } }
  })

  const gateAnchors = Array.isArray(opts.gateAnchors) && opts.gateAnchors.length
    ? opts.gateAnchors
    : autoGateAnchors(opts.center, boundaryPts)

  // 主干道：中心↔各城门代价寻路（研究_03 §7.1 Step1）；寻不到路的城门跳过并记回执，不整体失败。
  let majorRoadCount = 0
  const routedGateAnchors: MapPoint[] = []
  for (let i = 0; i < gateAnchors.length; i++) {
    if (!budgetLeft()) break
    const trial = roadCostTrial(opts.center, gateAnchors[i], grid, { allowWaterCrossing: false })
    if (!trial.ok || !trial.path) { notes.push(`城门候选 ${i + 1} 未找到可通行主干道路径，已跳过`); continue }
    features.push({
      kind: 'path', category: 'road', name: `${namePrefix}·主干道${majorRoadCount + 1}`, layer: 'civic', pts: trial.path,
      meta: { shape: { form: 'macroCityMajorRoad', seed: `${seedBase}-major-${i}` } }
    })
    routedGateAnchors.push(gateAnchors[i])
    majorRoadCount++
  }

  // 街道网格：沿 orientationDeg（及其垂直方向）以 blockSizeM 间距布线，每条线与边界求交裁剪成
  // "贯穿城区"的一段（横纵跨度互覆由构造保证：端点即边界交点，不依赖事后校验）；organic 档在同一套
  // 骨架端点上加 buildMeanderPath 弯曲——骨架端点不变，贯穿性质不受影响。
  const axisA: MapPoint = [Math.cos(orientationRad), Math.sin(orientationRad)]
  const axisB: MapPoint = [Math.cos(orientationRad + Math.PI / 2), Math.sin(orientationRad + Math.PI / 2)]
  const box = bboxOf(boundaryPts)
  const diag = Math.hypot(box.maxX - box.minX, box.maxY - box.minY)
  const boundaryCenter = centroid(boundaryPts)
  const lineCount = clamp(Math.round(diag / blockSizeM) - 1, 1, CITY_MAX_LINES_PER_AXIS)
  let streetCount = 0
  const buildAxisStreets = (axis: MapPoint, perp: MapPoint, label: string) => {
    const half = diag / 2
    for (let k = 1; k <= lineCount; k++) {
      if (!budgetLeft()) break
      const offset = (k - (lineCount + 1) / 2) * blockSizeM
      const base: MapPoint = [boundaryCenter[0] + perp[0] * offset, boundaryCenter[1] + perp[1] * offset]
      const p1: MapPoint = [base[0] - axis[0] * half, base[1] - axis[1] * half]
      const p2: MapPoint = [base[0] + axis[0] * half, base[1] + axis[1] * half]
      const hit = clipSegmentToPolygon(p1, p2, boundaryPts)
      if (!hit) continue
      const pts = streetPattern === 'organic'
        ? buildMeanderPath({ from: hit.a, to: hit.b, meander, seed: `${seedBase}-street-${label}-${k}` })
        : [hit.a, hit.b]
      features.push({
        kind: 'path', category: 'street', name: `${namePrefix}·街道${label}${k}`, layer: 'civic', pts,
        meta: { shape: { form: 'macroCityStreet', seed: `${seedBase}-street-${label}-${k}` } }
      })
      streetCount++
    }
  }
  buildAxisStreets(axisA, axisB, '横')
  buildAxisStreets(axisB, axisA, '纵')

  let wallCount = 0
  let gateMarkerCount = 0
  if (wallEnabled && budgetLeft()) {
    const wallPts = closeRing(boundaryPts)
    features.push({
      kind: 'path', category: 'wall', name: `${namePrefix}·城墙`, layer: 'civic', pts: wallPts,
      meta: { shape: { form: 'macroCityWall', seed: `${seedBase}-wall` } }
    })
    wallCount = 1
    for (const anchor of routedGateAnchors) {
      if (!budgetLeft()) break
      const gatePt = nearestPointOnPolyline(anchor, wallPts).point
      features.push({ kind: 'marker', category: 'gate', name: `${namePrefix}·城门${gateMarkerCount + 1}`, layer: 'civic', pts: [gatePt] })
      gateMarkerCount++
    }
  }

  if (features.length >= CITY_LAYOUT_MAX_FEATURES) notes.push(`要素数已达上限 ${CITY_LAYOUT_MAX_FEATURES}，超出部分未生成`)
  // quarter 数量=解析估算（两轴同一套 lineCount 公式·(lineCount+1)²），非真实多边形提取，见文件头声明。
  const quarterEstimate = (lineCount + 1) ** 2
  return {
    features, notes,
    stats: { gateCount: gateAnchors.length, majorRoadCount, streetCount, quarterEstimate, wallCount, gateMarkerCount }
  }
}

// ═══ 四、城际道路 buildInterCityRoad ═════════════════════════════════════════
// 研究_03 §7.2：代价寻路避坡（阈值同 BRUSH_SPEC.road/trail.slopeHardMaxPct，单点真值不重开一份数值）+
// 允许限量跨水（不做detour无穷代价，只是显著更贵）→ 识别连续水体段 → 逐段接岸建议 → 自动放置 bridge。

export interface InterCityRoadOptions {
  from: MapPoint
  to: MapPoint
  /** 必须途经的坐标点（可选）。 */
  via?: MapPoint[]
  /** 道路等级（缺省 trunk）：trunk=官道(更直更缓)；trail=小径(更能爬坡)。 */
  grade?: 'trunk' | 'trail'
  namePrefix?: string
  seed: number | string
}

export function buildInterCityRoad(opts: InterCityRoadOptions, grid: AnalysisGrid): MacroBrushResult {
  const namePrefix = String(opts.namePrefix || '城际道路').trim() || '城际道路'
  const seedBase = typeof opts.seed === 'string' ? opts.seed : String(opts.seed)
  const grade = opts.grade === 'trail' ? 'trail' : 'trunk'
  const category = grade === 'trail' ? 'trail' : 'road'
  // 坡度硬上限单点真值=BRUSH_SPEC（road 150%/trail 300%，同批C 落笔硬门同一张表，不另开一份数值）。
  const slopeHardMaxPct = BRUSH_SPEC[category]?.slopeHardMaxPct ?? (grade === 'trail' ? 300 : 150)
  const maxGradeRatio = slopeHardMaxPct / 100
  const via = Array.isArray(opts.via) ? opts.via : []
  const legs: MapPoint[] = [opts.from, ...via, opts.to]

  const fullPath: MapPoint[] = [legs[0]]
  for (let i = 1; i < legs.length; i++) {
    const trial = roadCostTrial(legs[i - 1], legs[i], grid, {
      allowWaterCrossing: true, maxGradeRatio, bridgeCostPerM: 6,
      turnPenalty: grade === 'trunk' ? grid.spec.cellSize * 0.08 : grid.spec.cellSize * 0.2
    })
    if (!trial.ok || !trial.path) {
      return emptyResult(`第 ${i} 段（经停点之间）在坡度限制内找不到通行路径——地形过于陡峭或被完全阻隔，可尝试改用 grade:'trail' 或调整途经点`)
    }
    fullPath.push(...trial.path.slice(1))
  }

  const notes: string[] = []
  const features: MacroBrushDraftFeature[] = [{
    kind: 'path', category, name: namePrefix, layer: 'civic', pts: fullPath,
    meta: { shape: { form: 'macroInterCityRoad', seed: `${seedBase}-road`, grade } }
  }]

  // 连续水体段识别→接岸建桥（研究_03 §7.2）：每段水体各自找最近合法接岸点；找不到的记入 notes（不阻断
  // 整条路生成，只是那一段暂缺桥，回执如实说明，呼应"违规回执四要素"的建议替代动作精神）。
  const waterRuns = findContinuousWaterRuns(fullPath, grid)
  let bridgeCount = 0
  waterRuns.forEach((run, i) => {
    const bankFrom = findNearestLegalBank(run.from, grid)
    const bankTo = findNearestLegalBank(run.to, grid)
    if (!bankFrom.found || !bankTo.found || !bankFrom.point || !bankTo.point) {
      notes.push(`第 ${i + 1} 处水体段未能找到合法接岸点，未自动置桥——需人工检查该处地形`)
      return
    }
    features.push({
      kind: 'path', category: 'bridge', name: `${namePrefix}·桥${bridgeCount + 1}`, layer: 'civic',
      pts: [bankFrom.point, bankTo.point],
      meta: { shape: { form: 'macroInterCityBridge', seed: `${seedBase}-bridge-${i}` } }
    })
    bridgeCount++
  })

  return { features, notes, stats: { legCount: legs.length - 1, bridgeCount, waterRunCount: waterRuns.length } }
}
