/**
 * 「绘舆」地图工具集（地图系统批5·2026-07-11；批B/C 画对硬化·2026-07-11 追加）。
 *
 * 绘舆私有工具（只活在绘舆 registry，不进提调语义表）：读图两级（readMapSummary 摘要不吐坐标海 →
 * readMapFeature 按需钻取全量几何）+ 图纸两件（createMapSheet/expandExplored，后者可 coverFeatureIds 自动包络）
 * + 画改删四件（drawMapRegion 参数化造形+放置卫兵/drawMapPath 支持 from/to 挂接吸附/drawMapMarker 水域卫兵/
 * updateMapFeature/deleteMapFeature）+ auditMap 交稿前体检。
 *
 * 数据面：全部经前端 chatRepository 的世界舆图 HTTP 端点读写（与弹窗同一真值·服务端批4 校验闸门兜底）；
 * 每次执行现拉 bundle 取最新格局（本地 sql.js 快·不做工具层缓存，防同任务多工具间用到陈旧坐标）。
 *
 * AI 画对四件套在工具层的落位：①参数化造形=drawMapRegion（buildShapePolygon 确定性）；②锚点相对定位=
 * center/at 可用 anchor{featureId,bearing,distanceM} 表达；③读回摘要=readMapSummary；④渲染端平滑=MapCanvas 既有。
 *
 * 画对硬化（治重叠/参数病/河海断连·用户拍板"工具握笔、模型当大脑"）：drawMapPath from/to 挂接由
 * mapGeometry 的 snapIntoRegion/buildMeanderPath 确定性生成顶点；drawMapRegion/drawMapMarker 的放置卫兵
 * 命中重叠时用 resolvePlacementClear 自动推开（回执如实报，不硬拒绝）；auditMap+createHuiyuAuditRunner
 * 是交稿前后的确定性体检（autofix 只做≤150m 机械吸附，绝不删除/挪 region/改 explored）。
 */

import type { ToolDefinition, ToolExecutionResult } from './agentRuntime/toolRegistry'
import {
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
  centroid,
  clipPolygonToParent,
  closeRing,
  distanceToPolygonBoundary,
  expandedHullOf,
  fmtArea,
  isClosedRing,
  nearestPointOnPolyline,
  pathLength,
  pointInPoly,
  polygonsOverlap,
  REGION_SIZE_RANGE,
  resolveCrossRule,
  resolveElevationM,
  resolvePlacementClear,
  segmentIntersectionDetail,
  segmentsIntersect,
  shoelace,
  snapIntoRegion,
  vectorToBearing,
  // 阶段状态机（笔刷约束系统批D·阶段管线）：Lock 保护硬门+阶段过滤共用同一套推导，见下方各用法。
  deriveCurrentStage,
  isFeatureLockedAtStage,
  type BrushSnapTarget,
  type MapBBox,
  type MapFeature,
  type MapFeatureKind,
  type MapLayer,
  type MapPoint,
  type MapShapeForm,
  type MapStageId,
  type WidenSpineWidthProfile
} from './mapGeometry'
import { bumpTerrainRevision, currentTerrainRevision } from './mapTerrainRevision'
export { bumpTerrainRevision, resetTerrainRevisionForTest } from './mapTerrainRevision'
import {
  buildAnalysisGridMemoized,
  computeAnalysisGridSpec,
  DEFAULT_GRID_N,
  findContinuousWaterRuns,
  findNearestLegalBank,
  roadCostTrial,
  sampleElevationProfile,
  SEA_BASE_ELEV,
  validatePathGrade,
  validateRiverPath,
  type AnalysisGrid,
  type RiverProblem
} from './mapAnalysisGrid'
import {
  buildCityLayout,
  buildInterCityRoad,
  buildMountainChain,
  buildRiverSystem,
  type MacroBrushResult
} from './mapMacroBrushes'
import {
  deleteWorldMapFeatureRemote,
  fetchWorldMapBundle,
  saveWorldMapFeaturesRemote,
  saveWorldMapSheetRemote
} from '../repositories/chatRepository'
import type { WorldMapBundle, WorldMapFeatureRecord, WorldMapSheet } from '../types'
import { resolveWorldDefaultMapSheet } from './worldMapDefaultSheet'
// 知识库按需钻取层（提速批·2026-07-12）：readMapManual 消费 loadHuiyuManualSections，与 manifest
// 常驻的 buildHuiyuResidentCoreSkillBody 共用同一份章节解析，两处对同一份 md 不各写一套解析逻辑。
import { loadHuiyuManualSections, type HuiyuManualSection } from './agentKnowledge/huiyuKnowledge'

export interface HuiyuMapToolsDeps {
  worldId: string
  worldName?: string
  /** 阶段过滤（笔刷约束系统批D·阶段管线，可选）：给了才①按 STAGE_REGION/PATH_CATEGORIES 过滤可画类目
   *  ②给新落笔要素打 meta.stage 出生戳。不给=行为与批A~W完全一致（全量类目可用、不打戳）——旧版
   *  draft/draw 两段式派发不传本字段，零回归；星依/提调走 mode:'staged' 时由共享编排引擎传入。 */
  stage?: MapStageId
  /** terraform 高门槛改造已获准（笔刷约束系统批D·阶段管线，可选）：true 时写工具遇到写调用参数里的
   *  override:'terraform' 才会放行对 Lock 保护要素（confirmedAtStage 早于当前阶段）的写；由共享编排引擎
   *  在拿到人工确认后才置 true——绘舆自身工具层只认这个布尔开关，不能自行决定放行，人裁发生在更上层。 */
  terraformApproved?: boolean
  /** 派发运行标识（批L 地图版本历史，可选）：{runKey, runLabel} 随本工具集全部写调用透传到服务端变更日志，
   *  「历史」面板据此按 run 分组展示；由 huiyuOrchestration.buildMapToolsDeps 注入（runKey=taskKey、
   *  runLabel=任务标题）。不给=服务端记 'manual'（旧调用方零回归）。 */
  runMeta?: { runKey?: string; runLabel?: string }
}

// 阶段→region/path 类目白名单（笔刷约束系统批D·阶段管线「每阶段工具集过滤」，立论=防误伤已确权内容）：
// 与下面 TERRAIN_CATEGORIES（渲染图层归属维度）是两个不同轴，不要混用——地形阶段=陆地地形 region（不含
// water，water 归水系阶段）；水系阶段=water region + river/canal path；人文阶段=civic 层 region
// （urban/farmland）+ 全部 civic path（含 trail——计划书任务书列举未提但同属人文阶段基础设施，判断为
// 疏漏而非刻意排除，已在批D 回执向星依说明这处判断）。marker 类目只在人文阶段开放（地形/水系阶段放
// 建筑/地标/角色没有意义，与计划书"人文阶段...+全 marker"字面一致）。deps.stage 未给时不做任何过滤。
const STAGE_REGION_CATEGORIES: Record<MapStageId, string[]> = {
  terrain: ['mountain', 'forest', 'grass', 'plateau', 'hill', 'desert', 'swamp', 'ice', 'jungle'],
  water: ['water'],
  civic: ['urban', 'farmland']
}
const STAGE_PATH_CATEGORIES: Record<MapStageId, string[]> = {
  terrain: [],
  water: ['river', 'canal'],
  civic: ['road', 'street', 'bridge', 'wall', 'border', 'trail']
}

// 宏笔刷阶段归属（笔刷约束系统批E·计划书 7.7）：山脉链=terrain；水系树=water；城区/城际=civic。
// 未传 stage 时四件全量可用（非 staged 兼容，同其余画笔工具口径一致）。
const MACRO_BRUSH_STAGE: Record<string, MapStageId> = {
  drawMountainChain: 'terrain',
  drawRiverSystem: 'water',
  drawCityLayout: 'civic',
  drawInterCityRoad: 'civic'
}

// 类目扩容（地图视觉大改批2·2026-07-11 用户拍板照单全收）：region +6/path +4/marker +10。
// farmland 归 civic 层（不进 TERRAIN_CATEGORIES）；hill/desert/swamp/ice/jungle 归 terrain 层。
// TERRAIN_CATEGORIES 是图层归属维度（不属于笔刷约束系统批A 的 BRUSH_SPEC 覆盖范围），仍本地维护。
const TERRAIN_CATEGORIES = new Set(['mountain', 'forest', 'grass', 'plateau', 'water', 'river', 'hill', 'desert', 'swamp', 'ice', 'jungle'])
// REGION/PATH/MARKER_CATEGORIES 三个改造为 BRUSH_SPEC 派生视图（笔刷约束系统批A·单点真值收编），旧名不断裂。
const REGION_CATEGORIES = BRUSH_REGION_CATEGORIES
const PATH_CATEGORIES = BRUSH_PATH_CATEGORIES
const MARKER_CATEGORIES = BRUSH_MARKER_CATEGORIES
/** drawMapRegion 的 form 参数（工具层专用扩展）：ridge 不复用 MapShapeForm——中心+半径语义与 from/to 脊线语义不是一回事，
 *  借 buildMeanderPath 已有先例（独立函数不硬塞进 buildShapePolygon 签名），这里同理独立分支。 */
type RegionDrawForm = MapShapeForm | 'ridge'

function toolError(message: string): ToolExecutionResult {
  return { content: message, status: 'error', error: { type: 'INVALID_ARGUMENT', message } }
}

/** category → 图层缺省推断（绘舆可显式给 layer 覆盖）。 */
function inferLayer(category: string, explicit?: unknown): 'terrain' | 'civic' {
  const given = String(explicit || '').trim()
  if (given === 'terrain' || given === 'civic') return given
  return TERRAIN_CATEGORIES.has(category) ? 'terrain' : 'civic'
}

function parsePointArg(value: unknown): MapPoint | null {
  if (!Array.isArray(value) || value.length < 2) return null
  const x = Number(value[0])
  const y = Number(value[1])
  return Number.isFinite(x) && Number.isFinite(y) ? [x, y] : null
}

function parsePointListArg(value: unknown, minCount: number): MapPoint[] | null {
  if (!Array.isArray(value) || value.length < minCount) return null
  const pts: MapPoint[] = []
  for (const item of value) {
    const pt = parsePointArg(item)
    if (!pt) return null
    pts.push(pt)
  }
  return pts
}

function featureCenter(feature: WorldMapFeatureRecord): MapPoint | null {
  const pts = (feature.geometry?.pts || []) as MapPoint[]
  if (!pts.length) return null
  return feature.kind === 'marker' ? pts[0] : centroid(pts)
}

/** 目标图纸解析：给 sheetId 找它；缺省=世界显式默认图纸（旧响应才回退第一张）。 */
function resolveSheet(bundle: WorldMapBundle, sheetId?: unknown): WorldMapSheet | null {
  const id = String(sheetId || '').trim()
  if (id) return bundle.sheets.find((sheet) => sheet.id === id) || null
  return resolveWorldDefaultMapSheet(bundle)
}

function findFeature(bundle: WorldMapBundle, featureId: string): WorldMapFeatureRecord | null {
  for (const sheet of bundle.sheets) {
    const hit = sheet.features.find((feature) => feature.id === featureId)
    if (hit) return hit
  }
  return null
}

/** 锚点相对定位解析（四件套第2条）：以既有要素中心为基，按汉字八方位+距离推算绝对坐标。 */
function resolveAnchorPoint(
  bundle: WorldMapBundle,
  anchor: Record<string, unknown>
): { point: MapPoint } | { error: string } {
  const featureId = String(anchor.featureId ?? anchor.feature_id ?? '').trim()
  if (!featureId) return { error: 'anchor 缺少 featureId（相对哪个既有要素定位）' }
  const feature = findFeature(bundle, featureId)
  if (!feature) return { error: `anchor.featureId=${featureId} 不存在——先 readMapSummary 拿准确要素 id` }
  const base = featureCenter(feature)
  if (!base) return { error: `anchor 要素 ${featureId} 没有几何中心可用` }
  const vector = bearingToVector(String(anchor.bearing || ''))
  if (!vector) return { error: 'anchor.bearing 必须是汉字八方位之一（东/南/西/北/东北/东南/西北/西南）' }
  const distance = Number(anchor.distanceM ?? anchor.distance_m)
  if (!Number.isFinite(distance) || distance <= 0) return { error: 'anchor.distanceM 必须是正数（米）' }
  return { point: [base[0] + vector[0] * distance, base[1] + vector[1] * distance] }
}

/** center/at 直给 或 anchor 相对定位，二选一。 */
function resolvePlacement(
  bundle: WorldMapBundle,
  args: Record<string, unknown>,
  directKey: 'center' | 'at'
): { point: MapPoint } | { error: string } {
  const direct = parsePointArg(args[directKey])
  if (direct) return { point: direct }
  if (args.anchor && typeof args.anchor === 'object') {
    return resolveAnchorPoint(bundle, args.anchor as Record<string, unknown>)
  }
  return { error: `${directKey}=[x,y] 与 anchor{featureId,bearing,distanceM} 必须给其中一个` }
}

/** style/links 透传归一（自由对象·非对象忽略）。 */
function pickObjectArg(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function describeSize(pts: MapPoint[]): string {
  const box = bboxOf(pts)
  return `约${Math.round(box.maxX - box.minX)}×${Math.round(box.maxY - box.minY)}m`
}

/** 读图摘要渲染（四件套第3条）：格局全貌不吐坐标海——每要素只给中心/尺寸，钻取细节走 readMapFeature。
 *  导出供 huiyuOrchestration.ts 的任务书前置格局快照直调复用（提速批·2026-07-12）——同一份 digest 生成逻辑，
 *  readMapSummary 工具与派发时快照都调它，不重复写一份。 */
export function renderMapSummary(bundle: WorldMapBundle): string {
  const worldName = String(bundle.world?.name || '').trim() || '未命名世界'
  if (!bundle.sheets.length) {
    return `世界「${worldName}」还没有任何图纸——先用 createMapSheet 建主图纸（建议名「主世界」），并给出初始探索范围。`
  }
  const defaultSheet = resolveWorldDefaultMapSheet(bundle)
  const lines: string[] = [`世界「${worldName}」舆图摘要（图纸 ${bundle.sheets.length} 张·默认图纸=${defaultSheet?.id || '无'}）：`]
  bundle.sheets.forEach((sheet) => {
    const explored = sheet.explored?.pts || []
    const exploredText = explored.length >= 3
      ? (() => {
          const box = bboxOf(explored as MapPoint[])
          const center = centroid(explored as MapPoint[])
          return `已探范围：中心(${Math.round(center[0])},${Math.round(center[1])})·跨约${Math.round(box.maxX - box.minX)}×${Math.round(box.maxY - box.minY)}m·${fmtArea(shoelace(explored as MapPoint[]))}`
        })()
      : '⚠️ 尚无探索范围（用户看到的是全迷雾空态）——先 expandExplored 给出范围'
    lines.push(`【图纸 ${sheet.id}「${sheet.name}」${sheet.id === defaultSheet?.id ? '·默认' : ''}】${exploredText}`)
    const byLayer: Record<string, WorldMapFeatureRecord[]> = { terrain: [], civic: [] }
    sheet.features.forEach((feature) => {
      (byLayer[feature.layer] || (byLayer[feature.layer] = [])).push(feature)
    })
    for (const [layer, label] of [['terrain', '地形层'], ['civic', '人文层']] as const) {
      const features = byLayer[layer] || []
      if (!features.length) continue
      lines.push(`- ${label}：`)
      features.forEach((feature) => {
        const center = featureCenter(feature)
        const at = center ? `(${Math.round(center[0])},${Math.round(center[1])})` : '(?)'
        const size = feature.kind === 'marker' ? '' : ` ${describeSize((feature.geometry?.pts || []) as MapPoint[])}`
        lines.push(`  - ${feature.id}｜${feature.name}｜${feature.kind}/${feature.category}｜中心${at}${size}`)
      })
    }
    if (!sheet.features.length) lines.push('- （还没有要素）')
  })
  lines.push('要看某要素的完整几何/样式/锚点，用 readMapFeature 钻取；不要凭印象猜坐标。')
  return lines.join('\n')
}

/** 违禁重叠对判定：改造为查 mapGeometry.resolveCrossRule（笔刷约束系统批A·单点真值 BRUSH_SPEC.crossRules）；
 *  旧本地 FORBIDDEN_OVERLAP_PAIRS 四对已收编进 BRUSH_SPEC 的 water/urban 两行，函数名与行为不变。 */
function isForbiddenOverlap(a: string, b: string): boolean {
  return resolveCrossRule(a, b) === 'forbid'
}

// REGION_SIZE_RANGE 改由 mapGeometry.ts 的 BRUSH_SPEC.sizeRange 派生导入（笔刷约束系统批A），旧名与旧值不变。

/** 违规回执四要素助手（笔刷约束系统批A·统一硬门+体检共用）：位置/原因（带具体数值边界）/建议替代动作/
 *  规则 ID（huiyuSubagent 落笔 loop 的按规则连续违规熔断计数器据此归类，不按"完全相同调用"去重）。
 *  中文自然语言拼句 + 结构化字段（details.ruleId 等）并存——模型读正文即懂，loop 层读 details 做熔断判定。 */
export interface ViolationReceiptInput {
  /** 规则 ID（熔断计数器归类键，如 'allowed-surface-land'/'nesting-must-be-inside-parent'）。 */
  ruleId: string
  /** 位置：哪个调用/哪个要素/哪个坐标区域。 */
  location: string
  /** 原因：带具体数值边界（如"该点海拔 320m，河流要求 ≤50m"）。 */
  reason: string
  /** 建议替代动作（按"工具选错/参数缺失/参数超界"三分话术给）。 */
  suggestion: string
  /** 附加结构化字段（可选·批C 新增）：河流/坡度类硬门用于附带 problems 坐标、D8 建议线等原始数据；
   *  正文摘要仍只读 reason/suggestion 拼句，这里只给需要结构化读取的调用方（如 loop 层/前端渲染）。 */
  details?: Record<string, unknown>
}

export function buildViolationReceipt(input: ViolationReceiptInput): ToolExecutionResult {
  const message = `${input.location}：${input.reason}——建议${input.suggestion}`
  return {
    content: message,
    status: 'error',
    error: {
      type: 'INVALID_ARGUMENT',
      message,
      retryable: true,
      details: { ruleId: input.ruleId, location: input.location, reason: input.reason, suggestion: input.suggestion, ...(input.details || {}) }
    }
  }
}

// ── Lock 保护硬门（笔刷约束系统批D·阶段管线）─────────────────────────────────

/** Lock 保护硬门：普通笔刷对 `confirmedAtStage` 早于当前阶段的既有要素做几何/删除写操作→硬拒（规则 ID
 *  `protected-stage-feature`）；写调用参数带 `override:'terraform'` 且 deps.terraformApproved=true 才放行
 *  ——terraform 通道的人工确认发生在共享编排引擎层（runHuiyuStage），绘舆自身工具层只认这个布尔开关，不能
 *  自行决定放行。currentStage：deps.stage 给了就用它（staged 派发已知当前在哪个阶段）；没给（旧版非 staged
 *  派发/deps.stage 未透传场景）就现查 deriveCurrentStage(sheet.features)——Lock 是要素自身的属性，不因为
 *  "这次调用没走 staged 模式"就失去保护，两条路径必须给出同一个判断。查询三件（elevationAt/surfaceAt/
 *  featuresAlong）与 auditMap 体检不经过这里——Lock 只挡写，不挡读（CAD Lock 语义，非 Freeze）。
 *  existing=null（新建/id 不存在）时不检查——只有改写既有要素才可能触犯保护。 */
function checkStageLock(
  existing: WorldMapFeatureRecord | null,
  args: Record<string, unknown>,
  sheet: WorldMapSheet,
  deps: HuiyuMapToolsDeps,
  location: string
): ToolExecutionResult | null {
  if (!existing) return null
  const currentStage = deps.stage ?? deriveCurrentStage(sheet.features as never)
  if (!isFeatureLockedAtStage(existing, currentStage)) return null
  const override = String(args.override || '').trim()
  if (override === 'terraform' && deps.terraformApproved) return null
  const confirmedAt = (existing.meta as { confirmedAtStage?: string } | null | undefined)?.confirmedAtStage
  return buildViolationReceipt({
    ruleId: 'protected-stage-feature',
    location,
    reason: `该要素已在「${confirmedAt}」阶段确认收尾，当前处于「${currentStage}」阶段——常规笔刷不能改动更早阶段已确认的内容`,
    suggestion: '若确需改造（隧道/运河/削坡等），走高门槛 terraform 通道（写调用带 override:"terraform"，须先经人工确认才会放行）；若不是真的要动这处，检查是不是认错了要素 id'
  })
}

// ── 分析网格接线（批C·水文坡度接线+空间查询三件）───────────────────────────────
// terrainRevision=会话内地形写版本号（模块级 Map，key=worldId）：地图写工具（drawMapRegion/drawMapPath/
// drawMapMarker/updateMapFeature/deleteMapFeature）每次成功写库后自增，buildAnalysisGridMemoized 据此
// 判定网格是否可复用。模块级而非 deps 级：buildHuiyuDispatchSeam 每次派发都会 new 一个新 deps 对象
//（见 useChatSendPipeline.ts），deps 级计数器每次派发都会归零，会让"同一世界、跨多次派发"累积的陈旧
// 网格缓存被新派发的 revision=0 误命中；模块级 Map 按 worldId 累计才能保证只要这个世界写过一次地形，
// 缓存判定就不会走回头路。不持久化、不落库——纯前端会话内状态，页面刷新即归零（与 mapAnalysisGrid.ts
// 的单槽 memo 同属一次模块加载生命周期，两者一起归零，不会出现"版本号归零但旧缓存还在"的错配）。
/** WorldMapFeatureRecord（geometry 嵌套）→ mapAnalysisGrid 期望的扁平 MapFeature（rasterizeElevation
 *  直读 .pts/.elevationM，不认 .geometry.*）。 */
function toAnalysisFeatures(sheet: WorldMapSheet): MapFeature[] {
  return sheet.features.map((f) => ({
    id: f.id,
    kind: f.kind as MapFeatureKind,
    category: f.category,
    name: f.name,
    layer: f.layer as MapLayer,
    pts: (f.geometry?.pts || []) as MapPoint[],
    ...(f.geometry?.elevationM !== undefined ? { elevationM: f.geometry.elevationM } : {})
  }))
}

/** 图纸分析网格包围盒：只取要素几何点，不含任何具体查询坐标——必须是"图纸当前状态"的纯函数，不能
 *  随查询坐标浮动，否则会破坏 buildAnalysisGridMemoized 的缓存判定（memo key 只含 mapId+terrainRevision+n，
 *  不含 bbox 本身；若同一 revision 下两次查询算出不同 bbox，命中缓存会把"用旧 bbox 建的网格"当成新
 *  bbox 的结果返回，坐标全错）。留边=max(3000, 跨度×0.3)，容纳贴着已有地形边缘查询/画的场景；仍落在
 *  网格外的极端查询会被钳位到边界格（cellIndexOfPoint 钳位语义，已知简化，留给批F 视实测需要收紧）。 */
function sheetTerrainBBox(sheet: WorldMapSheet): MapBBox {
  const pts: MapPoint[] = []
  for (const f of sheet.features) {
    const fpts = (f.geometry?.pts || []) as MapPoint[]
    if (fpts.length) pts.push(...fpts)
  }
  if (!pts.length) return { minX: -3000, minY: -3000, maxX: 3000, maxY: 3000 }
  const box = bboxOf(pts)
  const spanX = Math.max(1, box.maxX - box.minX)
  const spanY = Math.max(1, box.maxY - box.minY)
  const padX = Math.max(3000, spanX * 0.3)
  const padY = Math.max(3000, spanY * 0.3)
  return { minX: box.minX - padX, minY: box.minY - padY, maxX: box.maxX + padX, maxY: box.maxY + padY }
}

/** 批C 统一网格构建入口：水文/坡度硬门+auditMap 体检+空间查询三件共用同一份网格，同 worldId+sheetId+
 *  terrainRevision 命中缓存直接复用（研究_02 §7.2 单槽会话 memo）。mapId 用 `worldId:sheetId` 区分
 *  多图纸世界，避免跨图纸误命中。 */
function resolveSheetAnalysisGrid(worldId: string, sheet: WorldMapSheet): AnalysisGrid {
  const bbox = sheetTerrainBBox(sheet)
  const spec = computeAnalysisGridSpec(bbox, DEFAULT_GRID_N)
  return buildAnalysisGridMemoized(
    { mapId: `${worldId}:${sheet.id}`, terrainRevision: currentTerrainRevision(worldId), n: spec.n },
    toAnalysisFeatures(sheet),
    spec
  )
}

/** 叠放排序键：与 mapAnalysisGrid.rasterizeElevation 的默认烧制序（defaultPaintOrderOf）同构——civic
 *  层压 terrain 层，同层内小面积（更具体/更内层的嵌套要素）压大面积。键越大＝越晚烧＝叠在越上层。
 *  elevationAt/surfaceAt 的"最上层"判定与网格栅格化取到的"最上层"必须是同一套排序，否则纯矢量查询
 *  与网格判定会对同一坐标给出不同答案（自相矛盾）。 */
function topmostSortKey(f: WorldMapFeatureRecord): number {
  const layerRank = f.layer === 'terrain' ? 0 : 1
  const pts = (f.geometry?.pts || []) as MapPoint[]
  const area = pts.length >= 3 ? shoelace(pts) : 0
  return layerRank * 1e12 - area
}

/** 某点叠放最上层的 region（elevationAt/surfaceAt 共用）：点不落在任何 region 内返回 null（调用方按
 *  背景海处理，与 mapAnalysisGrid 栅格化的"无要素覆盖处=背景海"缺省口径一致）。 */
function pickTopmostRegionAt(x: number, y: number, sheet: WorldMapSheet): WorldMapFeatureRecord | null {
  let best: WorldMapFeatureRecord | null = null
  let bestKey = -Infinity
  for (const f of sheet.features) {
    if (f.kind !== 'region') continue
    const pts = (f.geometry?.pts || []) as MapPoint[]
    if (pts.length < 3 || !pointInPoly(x, y, pts)) continue
    const key = topmostSortKey(f)
    if (!best || key > bestKey) { best = f; bestKey = key }
  }
  return best
}

/** 最上层有效地表判定（笔刷约束系统批W·crossRules 定稿③）：新造形候选与某个 water region 几何重叠，
 *  但若候选完全落在压住该水域的更上层陆地要素（岛屿）内，则不算真正接触水域——放置卫兵据此豁免"新造形
 *  完全落在压住水域的陆地地表内"这种误杀（矢量模型无洞，岛只是画在水面上层的多边形，见计划书 7.11）。
 *  判定逻辑复用批C pickTopmostRegionAt（"最上层"同一套排序）：用候选顶点+质心抽样（同 overflowCheckPoints
 *  惯例），只要落在该水域内的抽样点全部被更上层的非水域要素覆盖，即判豁免；抽样非精确面积布尔运算，
 *  属已知简化（同 evaluateEndpointLanding 一类抽样近似的一贯风格）。 */
function waterObstacleExcusedByTopSurface(candidatePts: MapPoint[], waterFeature: WorldMapFeatureRecord, sheet: WorldMapSheet): boolean {
  const waterPts = (waterFeature.geometry?.pts || []) as MapPoint[]
  if (waterPts.length < 3 || candidatePts.length < 3) return false
  const samplePts: MapPoint[] = [...candidatePts, centroid(candidatePts)]
  let touchesOpenWater = false
  for (const [x, y] of samplePts) {
    if (!pointInPoly(x, y, waterPts)) continue // 该抽样点根本不在这块水域内，不需要判定
    const topmost = pickTopmostRegionAt(x, y, sheet)
    if (!topmost || topmost.id === waterFeature.id || topmost.category === 'water') { touchesOpenWater = true; break }
  }
  return !touchesOpenWater
}

/** 开放折线是否与多边形相交（顶点落在多边形内，或任一段与多边形任一边相交）。 */
function polylineCrossesPolygon(path: MapPoint[], poly: MapPoint[]): boolean {
  if (path.some((p) => pointInPoly(p[0], p[1], poly))) return true
  const n = poly.length
  for (let i = 0; i < path.length - 1; i++) {
    for (let j = 0; j < n; j++) {
      if (segmentsIntersect(path[i], path[i + 1], poly[j], poly[(j + 1) % n])) return true
    }
  }
  return false
}

/** 两条开放折线是否相交（逐段对逐段）。 */
function polylineCrossesPolyline(path: MapPoint[], other: MapPoint[]): boolean {
  for (let i = 0; i < path.length - 1; i++) {
    for (let j = 0; j < other.length - 1; j++) {
      if (segmentsIntersect(path[i], path[i + 1], other[j], other[j + 1])) return true
    }
  }
  return false
}

/** 两条开放折线的首个交点坐标（无交点返回 null；笔刷约束系统批W crossRules④ 两条新体检用，
 *  需要精确坐标写进回执，不能只有布尔相交）。 */
function findPolylineCrossingPoint(a: MapPoint[], b: MapPoint[]): MapPoint | null {
  for (let i = 0; i < a.length - 1; i++) {
    for (let j = 0; j < b.length - 1; j++) {
      const hit = segmentIntersectionDetail(a[i], a[i + 1], b[j], b[j + 1])
      if (hit) return hit.point
    }
  }
  return null
}

export type FeatureAlongHit = { featureId: string; name: string; kind: string; category: string }

/** 路径沿途穿越的要素清单（featuresAlong 查询工具用）：region=顶点落入或边相交；path=与既有折线相交；
 *  marker 太小、"穿越"语义不明显，不纳入清单（避免过度噪声）。 */
function findFeaturesAlongPath(path: MapPoint[], sheet: WorldMapSheet): FeatureAlongHit[] {
  const out: FeatureAlongHit[] = []
  for (const f of sheet.features) {
    const pts = (f.geometry?.pts || []) as MapPoint[]
    if (f.kind === 'region' && pts.length >= 3) {
      if (polylineCrossesPolygon(path, pts)) out.push({ featureId: f.id, name: f.name, kind: f.kind, category: f.category })
    } else if (f.kind === 'path' && pts.length >= 2) {
      if (polylineCrossesPolyline(path, pts)) out.push({ featureId: f.id, name: f.name, kind: f.kind, category: f.category })
    }
  }
  return out
}

/** 点是否落在某个 water region 内（桥接岸硬门用："落陆地"＝不在任何 water region 内，纯矢量判定，
 *  与网格背景缺省口径无关——呼应计划书④条"两端点落陆地（非 water region 内）"的字面定义）。 */
function pointOnWaterRegion(point: MapPoint, sheet: WorldMapSheet): boolean {
  return sheet.features.some((f) => f.kind === 'region' && f.category === 'water' && pointInPoly(point[0], point[1], (f.geometry?.pts || []) as MapPoint[]))
}

/** 距查询点最近的 water region（河流/运河终点"差半步"自动收尾用）：距离=已在内则 0，否则到边界的
 *  最近距离；excludeId 排除正在被判定的要素自身。 */
function findNearestWaterRegion(point: MapPoint, sheet: WorldMapSheet, excludeId: string): { region: WorldMapFeatureRecord; distance: number } | null {
  let best: { region: WorldMapFeatureRecord; distance: number } | null = null
  for (const f of sheet.features) {
    if (f.kind !== 'region' || f.category !== 'water' || (excludeId && f.id === excludeId)) continue
    const pts = (f.geometry?.pts || []) as MapPoint[]
    if (pts.length < 3) continue
    const distance = pointInPoly(point[0], point[1], pts) ? 0 : distanceToPolygonBoundary(point, pts)
    if (!best || distance < best.distance) best = { region: f, distance }
  }
  return best
}

/** 河流/运河合法性问题的数值化中文描述（回执 reason 用，"不给笼统描述"）。 */
function describeRiverProblems(problems: RiverProblem[]): string {
  const uphill = problems.find((p) => p.kind === 'uphill')
  if (uphill) return `沿线在坐标(${Math.round(uphill.at.x)},${Math.round(uphill.at.y)})附近出现逆坡，超出单调不升容差约 ${uphill.detailM}m`
  const terminus = problems.find((p) => p.kind === 'bad-terminus')
  if (terminus) return `终点(${Math.round(terminus.at.x)},${Math.round(terminus.at.y)})未能连接到海/湖/图缘（既非水域内，也非一步可达水域的下游）`
  return '路径没有落在有效分析范围内（起点/终点坐标异常）'
}

/** 落笔出探索范围检测（治「迷雾手画」病之外的漏网）：抽查代表点是否落在 explored 外，超出才提醒——取代无脑静态提示。
 *  导出供 huiyuOrchestration.ts 编排层自动扩探复用同一份"是否出范围"判定（笔刷约束系统批B 事故根因3对症），
 *  不许两处各写一份 pointInPoly 扫描逻辑。 */
export function exploredOverflowNote(sheet: WorldMapSheet, checkPts: MapPoint[]): string {
  const explored = (sheet.explored?.pts || []) as MapPoint[]
  if (explored.length < 3 || !checkPts.length) return ''
  const outside = checkPts.some((p) => !pointInPoly(p[0], p[1], explored))
  if (!outside) return ''
  return ' ⚠️ 本要素在探索范围外，用户看不见——记得 expandExplored（推荐带 coverFeatureIds 自动包络）。'
}

/** 导出理由同 exploredOverflowNote：编排层复用同一份"检查代表点怎么取"逻辑。 */
export function overflowCheckPoints(kind: 'marker' | 'region' | 'path', center: MapPoint | null, pts: MapPoint[]): MapPoint[] {
  if (kind === 'marker') return pts.length ? [pts[0]] : []
  const box = bboxOf(pts)
  const corners: MapPoint[] = [[box.minX, box.minY], [box.maxX, box.minY], [box.maxX, box.maxY], [box.minX, box.maxY]]
  return center ? [center, ...corners] : corners
}

/** 端点粗位置解析（B1·drawMapPath 参数化挂接）：at 直给即精确点；featureId→用要素中心当粗位置，留给 refineEndpoint 按类型吸附精化。 */
function resolveRoughEndpoint(
  bundle: WorldMapBundle,
  endpoint: Record<string, unknown>
): { point: MapPoint; feature?: WorldMapFeatureRecord } | { error: string } {
  const at = parsePointArg(endpoint.at)
  if (at) return { point: at }
  const featureId = String(endpoint.featureId ?? endpoint.feature_id ?? '').trim()
  if (!featureId) return { error: 'from/to 必须给 at:[x,y] 或 featureId 之一' }
  const feature = findFeature(bundle, featureId)
  if (!feature) return { error: `from/to.featureId=${featureId} 不存在——先 readMapSummary 拿准确要素 id` }
  const center = featureCenter(feature)
  if (!center) return { error: `要素 ${featureId} 没有几何中心可用` }
  return { point: center, feature }
}

/** 端点精化：marker→原点；region→snapIntoRegion(approach,…)贴岸；path→折线最近点（支流汇入干流）。 */
function refineEndpoint(rough: { point: MapPoint; feature?: WorldMapFeatureRecord }, approach: MapPoint): MapPoint {
  const feature = rough.feature
  if (!feature) return rough.point
  const pts = (feature.geometry?.pts || []) as MapPoint[]
  if (feature.kind === 'region' && pts.length >= 3) return snapIntoRegion(approach, pts, 30)
  if (feature.kind === 'path' && pts.length >= 2) return nearestPointOnPolyline(approach, pts).point
  return rough.point
}

// ── auditMap 体检（批C·2026-07-11）：确定性检查悬空端点/违禁重叠/出探索范围/尺度异常。──────
// 绝不删除、不挪 region、不改 explored；autofix 只限「悬空端点≤150m」的机械吸附。

export type MapAuditSeverity = 'error' | 'warning' | 'info'
type MapAuditFinding = { featureId: string; code: string; message: string; severity: MapAuditSeverity; number: string }

/** 问题编号目录（笔刷约束系统批A 新增·Osmose"带编号问题清单+严重度分级"组织范式，研究_01 §3.2）：
 *  每种 finding.code 对应稳定编号+严重度。存量豁免（计划书 7.0 第10条）：auditMap 是全图事后扫描，
 *  无法区分"新落笔"与"存量数据"，硬门天然只作用于新落笔不追溯——体检层严重度统一封顶 warning/info，
 *  只报不拒（不出现 error：error 语义留给硬门自身的拒绝回执，不是体检报告的严重度）。 */
const AUDIT_FINDING_CATALOG: Record<string, { number: string; severity: MapAuditSeverity }> = {
  'dangling-endpoint': { number: 'MAP-1010', severity: 'warning' },
  'forbidden-overlap': { number: 'MAP-1020', severity: 'warning' },
  'unclosed-ring': { number: 'MAP-1030', severity: 'warning' },
  'out-of-range': { number: 'MAP-1040', severity: 'info' },
  'size-anomaly': { number: 'MAP-1050', severity: 'info' },
  // 批C 新增：水文/坡度体检（需要分析网格，见 runSheetAudit 内 resolveSheetAnalysisGrid 调用）。
  'non-monotonic-flow': { number: 'MAP-1060', severity: 'warning' },
  'slope-grade-band': { number: 'MAP-1070', severity: 'warning' },
  // 批W 新增：crossRules 定稿②山谷软引导提示 + ④两条路河/城墙跨水体检（计划书 7.11）。
  'water-in-mountain-valley-hint': { number: 'MAP-1080', severity: 'info' },
  'missing-bridge-crossing': { number: 'MAP-1100', severity: 'warning' },
  'wall-water-crossing': { number: 'MAP-1110', severity: 'warning' }
}

function auditFinding(featureId: string, code: string, message: string): MapAuditFinding {
  const entry = AUDIT_FINDING_CATALOG[code]
  return { featureId, code, message, severity: entry?.severity ?? 'info', number: entry?.number ?? 'MAP-0000' }
}

/** 端点合法着陆判定：返回是否已落地、以及最近合法着陆点/距离（供 autofix 判断是否可机械吸附）。
 *  excludeFeatureId=正在被判定的要素自身 id——否则"距另一条河/路≤100m"的判据会拿要素自己的折线当邻居，
 *  距离恒为 0 而永远判定"已着陆"（自比对假阴性）。 */
function evaluateEndpointLanding(point: MapPoint, category: string, sheet: WorldMapSheet, excludeFeatureId: string): { landed: boolean; nearestDistance: number; nearestPoint: MapPoint } {
  const explored = (sheet.explored?.pts || []) as MapPoint[]
  const candidates: Array<{ distance: number; point: MapPoint; okWithin: number }> = []

  const pushRegionCandidates = (categories: string[], okWithin: number) => {
    for (const f of sheet.features) {
      if (f.id === excludeFeatureId || f.kind !== 'region' || !categories.includes(f.category)) continue
      const pts = (f.geometry?.pts || []) as MapPoint[]
      if (pts.length < 3) continue
      if (pointInPoly(point[0], point[1], pts)) { candidates.push({ distance: 0, point, okWithin }); continue }
      const nearest = nearestPointOnPolyline(point, [...pts, pts[0]])
      candidates.push({ distance: nearest.distance, point: nearest.point, okWithin })
    }
  }
  const pushPathCandidates = (categories: string[], okWithin: number) => {
    for (const f of sheet.features) {
      if (f.id === excludeFeatureId || f.kind !== 'path' || !categories.includes(f.category)) continue
      const pts = (f.geometry?.pts || []) as MapPoint[]
      if (pts.length < 2) continue
      const nearest = nearestPointOnPolyline(point, pts)
      candidates.push({ distance: nearest.distance, point: nearest.point, okWithin })
    }
  }
  const pushMarkerCandidates = (okWithin: number) => {
    for (const f of sheet.features) {
      if (f.id === excludeFeatureId || f.kind !== 'marker') continue
      const pts = (f.geometry?.pts || []) as MapPoint[]
      if (!pts.length) continue
      candidates.push({ distance: Math.hypot(point[0] - pts[0][0], point[1] - pts[0][1]), point: pts[0], okWithin })
    }
  }
  const pushExploredCandidate = (okWithin: number) => {
    if (explored.length < 3 || !pointInPoly(point[0], point[1], explored)) {
      candidates.push({ distance: 0, point, okWithin }) // 无探索范围 或 已在范围外（流向迷雾）视为已着陆
      return
    }
    candidates.push({ distance: distanceToPolygonBoundary(point, explored), point, okWithin })
  }

  // 笔刷约束系统批A：着陆判定改按 BRUSH_SPEC[category].snapTargets 表驱动（原 river/road-or-street 两硬编分支
  // 收编为通用循环，行为对这两者完全不变）；connectivity 不含 endpoint_snap 的类目（wall/border 走闭合体检）
  // snapTargets 恒空，candidates 恒空即 landed=true——不在本函数内被判定为悬空。
  const spec = BRUSH_SPEC[category]
  const snapTargets: BrushSnapTarget[] = spec?.connectivity.includes('endpoint_snap') ? (spec.snapTargets || []) : []
  for (const target of snapTargets) {
    if (target.targetKind === 'region') pushRegionCandidates(target.categories, target.okWithinM)
    else if (target.targetKind === 'path') pushPathCandidates(target.categories, target.okWithinM)
    else if (target.targetKind === 'marker') pushMarkerCandidates(target.okWithinM)
    else if (target.targetKind === 'exploredBoundary') pushExploredCandidate(target.okWithinM)
  }

  if (!candidates.length) return { landed: true, nearestDistance: 0, nearestPoint: point }
  let best = candidates[0]
  for (const c of candidates) if (c.distance < best.distance) best = c
  return { landed: candidates.some((c) => c.distance <= c.okWithin), nearestDistance: best.distance, nearestPoint: best.point }
}

/** 悬空端点扫描：按 connectivity=endpoint_snap 的类目全覆盖（笔刷约束系统批A·river/road/street 三硬编类目
 *  扩展为 canal/trail/bridge 一并覆盖，行为收编自 BRUSH_SPEC.snapTargets）。
 *  wall/border 不扫（走 findUnclosedRingCandidates 闭合体检）：环形墙/疆界首尾同点=合法闭合、直墙段/规整弧
 *  端点本就允许悬空——着陆语义只适用于"该连去别处"的河/路/桥类。 */
function findDanglingEndpoints(sheet: WorldMapSheet): Array<{ featureId: string; which: 'from' | 'to'; nearestPoint: MapPoint; nearestDistance: number }> {
  const out: Array<{ featureId: string; which: 'from' | 'to'; nearestPoint: MapPoint; nearestDistance: number }> = []
  for (const feature of sheet.features) {
    if (feature.kind !== 'path') continue
    const spec = BRUSH_SPEC[feature.category]
    if (!spec || !spec.connectivity.includes('endpoint_snap')) continue
    const pts = (feature.geometry?.pts || []) as MapPoint[]
    if (pts.length < 2) continue
    const endpoints: Array<['from' | 'to', MapPoint]> = [['from', pts[0]], ['to', pts[pts.length - 1]]]
    for (const [which, point] of endpoints) {
      const evaluated = evaluateEndpointLanding(point, feature.category, sheet, feature.id)
      if (!evaluated.landed) out.push({ featureId: feature.id, which, nearestPoint: evaluated.nearestPoint, nearestDistance: evaluated.nearestDistance })
    }
  }
  return out
}

/** 未闭合环扫描（笔刷约束系统批A·新增）：connectivity=closed_ring 的类目（border/wall）里，凡是"疑似想画环"
 *  （非 arc/meander 造形来源，即 meta.shape.kind 不是 arc/meander——直给 pts 的手画/精修出口）但首尾未闭合的，
 *  一律视为问题。arc（规整弧墙）与 meander（from/to 直墙段）造形来源天然合法开放，不在本扫描范围——闭合诉求
 *  只针对"打算围一圈却漏合"的 pts 手画模式（drawMapPath 硬门在此模式下已自动补闭，本扫描主要兜底存量数据）。 */
function findUnclosedRingCandidates(sheet: WorldMapSheet): Array<{ featureId: string; name: string; category: string; pts: MapPoint[] }> {
  const out: Array<{ featureId: string; name: string; category: string; pts: MapPoint[] }> = []
  for (const feature of sheet.features) {
    if (feature.kind !== 'path') continue
    const spec = BRUSH_SPEC[feature.category]
    if (!spec || !spec.connectivity.includes('closed_ring')) continue
    const shapeKind = (feature.meta as { shape?: { kind?: string } } | null | undefined)?.shape?.kind
    if (shapeKind === 'arc' || shapeKind === 'meander') continue
    const pts = (feature.geometry?.pts || []) as MapPoint[]
    if (pts.length < 3 || isClosedRing(pts)) continue
    out.push({ featureId: feature.id, name: feature.name, category: feature.category, pts })
  }
  return out
}

/** 违禁重叠扫描（同图纸 region 两两对照 FORBIDDEN_OVERLAP_PAIRS）。 */
function findForbiddenOverlaps(sheet: WorldMapSheet): MapAuditFinding[] {
  const regions = sheet.features.filter((f) => f.kind === 'region')
  const out: MapAuditFinding[] = []
  for (let i = 0; i < regions.length; i++) {
    for (let j = i + 1; j < regions.length; j++) {
      const a = regions[i]; const b = regions[j]
      if (!isForbiddenOverlap(a.category, b.category)) continue
      const aPts = (a.geometry?.pts || []) as MapPoint[]
      const bPts = (b.geometry?.pts || []) as MapPoint[]
      if (aPts.length < 3 || bPts.length < 3 || !polygonsOverlap(aPts, bPts)) continue
      out.push(auditFinding(a.id, 'forbidden-overlap', `「${a.name}」（${a.category}）与「${b.name}」（${b.category}）重叠`))
    }
  }
  return out
}

/** 出探索范围扫描（复用批B 抽查法：marker=自身点，region/path=中心+bbox 四角）。 */
function findOutOfRangeFeatures(sheet: WorldMapSheet): MapAuditFinding[] {
  const explored = (sheet.explored?.pts || []) as MapPoint[]
  if (explored.length < 3) return []
  const out: MapAuditFinding[] = []
  for (const feature of sheet.features) {
    const pts = (feature.geometry?.pts || []) as MapPoint[]
    if (!pts.length) continue
    const kind = feature.kind as 'marker' | 'region' | 'path'
    const center = kind === 'marker' ? null : centroid(pts)
    const checkPts = overflowCheckPoints(kind, center, pts)
    if (checkPts.some((p) => !pointInPoly(p[0], p[1], explored))) {
      out.push(auditFinding(feature.id, 'out-of-range', `「${feature.name}」落在探索范围外——建议 expandExplored 带 coverFeatureIds:["${feature.id}"]`))
    }
  }
  return out
}

/** 尺度异常扫描（对照 REGION_SIZE_RANGE·只报不拒，存量数据可能早于本批约束）。 */
function findSizeAnomalies(sheet: WorldMapSheet): MapAuditFinding[] {
  const out: MapAuditFinding[] = []
  for (const feature of sheet.features) {
    if (feature.kind !== 'region') continue
    const range = REGION_SIZE_RANGE[feature.category]
    if (!range) continue
    const pts = (feature.geometry?.pts || []) as MapPoint[]
    if (pts.length < 3) continue
    const box = bboxOf(pts)
    const rx = (box.maxX - box.minX) / 2
    const ry = (box.maxY - box.minY) / 2
    if (rx < range.min || rx > range.max || ry < range.min || ry > range.max) {
      out.push(auditFinding(feature.id, 'size-anomaly', `「${feature.name}」（${feature.category}）尺度约 ${Math.round(rx)}×${Math.round(ry)}m，超出常见区间 ${range.min}~${range.max}m`))
    }
  }
  return out
}

/** 水文方向巡检（批C 新增）：river/canal 沿线在【填洼后场】是否单调不升（容差同硬门口径 0.5m/2m）——
 *  只报 uphill 类问题，不重复报 bad-terminus（悬空/接不上水域已由 dangling-endpoint 体检覆盖）。
 *  只报不拒：存量数据、或落笔后地形被后续改动牵连而变得不合法的河流，都会在这里现形但不会被删改。 */
function findNonMonotonicFlowFindings(sheet: WorldMapSheet, grid: AnalysisGrid): MapAuditFinding[] {
  const out: MapAuditFinding[] = []
  for (const feature of sheet.features) {
    if (feature.kind !== 'path' || (feature.category !== 'river' && feature.category !== 'canal')) continue
    const pts = (feature.geometry?.pts || []) as MapPoint[]
    if (pts.length < 2) continue
    const upTolM = feature.category === 'canal' ? 2 : 0.5
    const result = validateRiverPath(pts, grid, { upTolM })
    const uphill = result.problems.find((p) => p.kind === 'uphill')
    if (uphill) {
      out.push(auditFinding(feature.id, 'non-monotonic-flow', `「${feature.name}」（${feature.category}）在坐标(${Math.round(uphill.at.x)},${Math.round(uphill.at.y)})附近逆坡爬升约 ${uphill.detailM}m（超出容差 ${upTolM}m）`))
    }
  }
  return out
}

/** 分档坡度巡检（批C 新增）：road/street/trail/canal 沿线滑动窗口最大坡度进入 slopeGradeBands 最高档
 *  即报 warning（不拒绝）——教学/提醒性质，硬拒绝已由落笔硬门（slopeHardMaxPct）负责。 */
function findSlopeGradeBandFindings(sheet: WorldMapSheet, grid: AnalysisGrid): MapAuditFinding[] {
  const out: MapAuditFinding[] = []
  for (const feature of sheet.features) {
    if (feature.kind !== 'path') continue
    const spec = BRUSH_SPEC[feature.category]
    if (!spec || spec.slopeMode !== 'hard_ceiling' || !spec.slopeGradeBands?.length) continue
    const pts = (feature.geometry?.pts || []) as MapPoint[]
    if (pts.length < 2) continue
    const topBandPct = spec.slopeGradeBands[spec.slopeGradeBands.length - 1]
    const result = validatePathGrade(pts, grid)
    const maxPct = result.maxGradeRatio * 100
    if (maxPct >= topBandPct) {
      out.push(auditFinding(feature.id, 'slope-grade-band', `「${feature.name}」（${feature.category}）沿线最陡坡度约 ${Math.round(maxPct)}%，进入最高分档（≥${topBandPct}%）——建议人工复核是否需要改道或降级为小径`))
    }
  }
  return out
}

/** 山中水体山谷软引导体检（笔刷约束系统批W crossRules②·MAP-1080）：water 与 mountain 重叠（已被落笔
 *  硬门的尺寸帽放行，或为批W 之前的存量数据）时，提醒"宜置于山谷/两脊之间"——真正的山谷检测（两高核
 *  之间低带判定）留待地形分层拔升机制更成熟后再评估，本批只做固定提示，只报不拦。 */
function findWaterInMountainHintFindings(sheet: WorldMapSheet): MapAuditFinding[] {
  const out: MapAuditFinding[] = []
  const waters = sheet.features.filter((f) => f.kind === 'region' && f.category === 'water')
  const mountains = sheet.features.filter((f) => f.kind === 'region' && f.category === 'mountain')
  for (const water of waters) {
    const waterPts = (water.geometry?.pts || []) as MapPoint[]
    if (waterPts.length < 3) continue
    for (const mountain of mountains) {
      const mountainPts = (mountain.geometry?.pts || []) as MapPoint[]
      if (mountainPts.length < 3 || !polygonsOverlap(waterPts, mountainPts)) continue
      out.push(auditFinding(water.id, 'water-in-mountain-valley-hint', `「${water.name}」与「${mountain.name}」（mountain）重叠——山中水体宜置于两脊之间或山体边缘凹处（山谷），本条仅供参考不校验`))
      break
    }
  }
  return out
}

/** road/street/trail 与 river/canal 相交处无 bridge 跨接体检（笔刷约束系统批W crossRules④·MAP-1100）：
 *  两者路径相交即找交点，交点附近（150m 容差，同既有 snapTargets 惯例）若没有任何 bridge 要素的折线
 *  经过，判定"该处可能需要一座桥却没有"——只报 warning，渡口/浅滩本就合法，不进硬门。 */
function findMissingBridgeFindings(sheet: WorldMapSheet): MapAuditFinding[] {
  const out: MapAuditFinding[] = []
  const waterPaths = sheet.features.filter((f) => f.kind === 'path' && (f.category === 'river' || f.category === 'canal'))
  const roadPaths = sheet.features.filter((f) => f.kind === 'path' && ['road', 'street', 'trail'].includes(f.category))
  const bridgePaths = sheet.features.filter((f) => f.kind === 'path' && f.category === 'bridge')
  for (const water of waterPaths) {
    const waterPts = (water.geometry?.pts || []) as MapPoint[]
    if (waterPts.length < 2) continue
    for (const road of roadPaths) {
      const roadPts = (road.geometry?.pts || []) as MapPoint[]
      if (roadPts.length < 2) continue
      const crossing = findPolylineCrossingPoint(roadPts, waterPts)
      if (!crossing) continue
      const bridged = bridgePaths.some((bridge) => {
        const bridgePts = (bridge.geometry?.pts || []) as MapPoint[]
        return bridgePts.length >= 2 && nearestPointOnPolyline(crossing, bridgePts).distance <= 150
      })
      if (!bridged) {
        out.push(auditFinding(road.id, 'missing-bridge-crossing', `「${road.name}」（${road.category}）与「${water.name}」（${water.category}）在坐标(${Math.round(crossing[0])},${Math.round(crossing[1])})附近相交，附近未找到跨接的 bridge 要素（若是渡口/浅滩可忽略）`))
      }
    }
  }
  return out
}

/** wall 与 river/canal 相交体检（笔刷约束系统批W crossRules④·MAP-1110，水门提示）：城墙线与河/运河
 *  路径相交，提示宜设水门——不判定是否已有水门要素（现役类目表没有专门的"水门"子类目/marker，
 *  只报提醒，判定粒度留给未来水门类目落地后再收紧）。 */
function findWallWaterCrossingFindings(sheet: WorldMapSheet): MapAuditFinding[] {
  const out: MapAuditFinding[] = []
  const waterPaths = sheet.features.filter((f) => f.kind === 'path' && (f.category === 'river' || f.category === 'canal'))
  const wallPaths = sheet.features.filter((f) => f.kind === 'path' && f.category === 'wall')
  for (const wall of wallPaths) {
    const wallPts = (wall.geometry?.pts || []) as MapPoint[]
    if (wallPts.length < 2) continue
    for (const water of waterPaths) {
      const waterPts = (water.geometry?.pts || []) as MapPoint[]
      if (waterPts.length < 2) continue
      const crossing = findPolylineCrossingPoint(wallPts, waterPts)
      if (!crossing) continue
      out.push(auditFinding(wall.id, 'wall-water-crossing', `「${wall.name}」（wall）与「${water.name}」（${water.category}）在坐标(${Math.round(crossing[0])},${Math.round(crossing[1])})附近相交——城墙跨水处宜设水门`))
    }
  }
  return out
}

/** 单图纸体检：autofix=true 时把悬空端点里距最近合法着陆点 ≤150m 的机械吸附掉（同 id 增量落库），其余只报。
 *  runMeta（批L）：autofix 落库也是真实写，透传派发运行标识进变更日志。 */
async function runSheetAudit(
  worldId: string,
  sheet: WorldMapSheet,
  autofix: boolean,
  runMeta?: { runKey?: string; runLabel?: string }
): Promise<{ fixNotes: string[]; findings: MapAuditFinding[]; fixedCount: number }> {
  const fixNotes: string[] = []
  const findings: MapAuditFinding[] = []
  let fixedCount = 0

  for (const dangling of findDanglingEndpoints(sheet)) {
    if (autofix && dangling.nearestDistance <= 150) {
      const feature = sheet.features.find((f) => f.id === dangling.featureId)
      if (feature) {
        const pts = ((feature.geometry?.pts || []) as MapPoint[]).map((p) => [p[0], p[1]] as MapPoint)
        if (dangling.which === 'from') pts[0] = dangling.nearestPoint
        else pts[pts.length - 1] = dangling.nearestPoint
        const spine = feature.geometry?.spine
        await saveWorldMapFeaturesRemote(worldId, [{ id: feature.id, sheetId: feature.sheetId, geometry: spine ? { pts, spine } : { pts } }], runMeta)
        fixedCount += 1
        fixNotes.push(`已自动吸附「${feature.name}」（${feature.id}）${dangling.which === 'from' ? '起点' : '终点'}到合法着陆点（原距约 ${Math.round(dangling.nearestDistance)}m）。`)
        continue
      }
    }
    findings.push(auditFinding(dangling.featureId, 'dangling-endpoint', `「${dangling.featureId}」${dangling.which === 'from' ? '起点' : '终点'}悬空（距最近合法着陆约 ${Math.round(dangling.nearestDistance)}m）`))
  }

  // 未闭合环自动补闭（笔刷约束系统批A 新增·同悬空端点一样"机械可修就自动修"）：closeRing 无条件追加首点，
  // 前面 findUnclosedRingCandidates 已保证只对"未闭合"的候选调用，不会对已闭合的重复追加。
  for (const ring of findUnclosedRingCandidates(sheet)) {
    if (autofix) {
      const feature = sheet.features.find((f) => f.id === ring.featureId)
      if (feature) {
        const closedPts = closeRing(ring.pts)
        const spine = feature.geometry?.spine
        await saveWorldMapFeaturesRemote(worldId, [{ id: feature.id, sheetId: feature.sheetId, geometry: spine ? { pts: closedPts, spine } : { pts: closedPts } }], runMeta)
        fixedCount += 1
        fixNotes.push(`已自动补闭「${ring.name}」（${ring.featureId}）首尾顶点成环（${ring.category} 类目须闭合）。`)
        continue
      }
    }
    findings.push(auditFinding(ring.featureId, 'unclosed-ring', `「${ring.name}」（${ring.category}）首尾未闭合成环——建议补闭或改用 pts 出口重画闭合环`))
  }

  findings.push(
    ...findForbiddenOverlaps(sheet), ...findOutOfRangeFeatures(sheet), ...findSizeAnomalies(sheet),
    // 批W：山谷软引导提示 + 路河无桥/城墙跨河两条体检——纯矢量检查，不需要分析网格，可与上面几条同批跑。
    ...findWaterInMountainHintFindings(sheet), ...findMissingBridgeFindings(sheet), ...findWallWaterCrossingFindings(sheet)
  )

  // 批C：水文/坡度体检需要分析网格——同一份图纸只建一次（resolveSheetAnalysisGrid 内部按
  // worldId+sheetId+terrainRevision 命中 memo，这里的调用与查询三件/落笔硬门共享同一张缓存）。
  const grid = resolveSheetAnalysisGrid(worldId, sheet)
  findings.push(...findNonMonotonicFlowFindings(sheet, grid), ...findSlopeGradeBandFindings(sheet, grid))

  return { fixNotes, findings, fixedCount }
}

/** submitMap 交稿门专用：跑一次全部图纸的 report-only 体检（不 autofix——交稿时背着模型改图会让回执与实况不符）。
 *  无发现项返回 null（放行不阻塞，见计划书用户拍板②）。 */
export function createHuiyuAuditRunner(deps: HuiyuMapToolsDeps): () => Promise<{ report: string; findingsCount: number } | null> {
  return async () => {
    const bundle = await fetchWorldMapBundle(deps.worldId)
    const allFindings: Array<{ sheetName: string; finding: MapAuditFinding }> = []
    for (const sheet of bundle.sheets) {
      const result = await runSheetAudit(deps.worldId, sheet, false)
      for (const finding of result.findings) allFindings.push({ sheetName: sheet.name, finding })
    }
    if (!allFindings.length) return null
    const report = allFindings.map((item) => `- [${item.finding.number}][${item.finding.severity}][${item.finding.code}]（${item.sheetName}）${item.finding.message}`).join('\n')
    return { report, findingsCount: allFindings.length }
  }
}

/** 当前推导阶段（笔刷约束系统批D·阶段管线）：拉取世界舆图现状，对目标图纸的要素跑 deriveCurrentStage——
 *  阶段引擎无状态，任何时刻的"当前阶段"都能现查现算，不依赖任何持久化的阶段字段。sheetId 缺省=主图纸
 *  （与其余读写工具同一套缺省口径）；图纸不存在时兜底返回 'terrain'（新世界从第一阶段开始，不报错阻断——
 *  调用方通常紧接着会 createMapSheet，此时还没有图纸可查是正常状态）。 */
export async function resolveCurrentMapStage(worldId: string, sheetId?: string): Promise<MapStageId> {
  const bundle = await fetchWorldMapBundle(worldId)
  const sheet = resolveSheet(bundle, sheetId)
  return deriveCurrentStage((sheet?.features || []) as never)
}

/** 阶段收尾批量盖戳（笔刷约束系统批D·阶段管线）：把「meta.stage===stage 且尚未 confirmedAtStage」的要素
 *  批量补上 confirmedAtStage=stage 戳——只这样精确定位"本阶段画的、还没确认过的"要素，不会误伤存量数据
 *  （存量要素 meta.stage 恒为 undefined，天然被这条筛选排除，同存量豁免哲学）。meta 是整体替换字段（服务端
 *  saveWorldMapFeatures 语义=带这个 key 就整体替换，不合并），这里显式带上原 meta 全部内容只追加
 *  confirmedAtStage，不会连带丢失 shape/stage 等既有字段。返回被盖戳的要素 id 列表（空=本阶段没有待确认
 *  的新画内容——正常情况，不算错误）。 */
export async function confirmStageFeatures(
  worldId: string,
  stage: MapStageId,
  sheetId?: string,
  runMeta?: { runKey?: string; runLabel?: string }
): Promise<string[]> {
  const bundle = await fetchWorldMapBundle(worldId)
  const sheet = resolveSheet(bundle, sheetId)
  if (!sheet) return []
  const pending = sheet.features.filter((f) => {
    const meta = f.meta as { stage?: string; confirmedAtStage?: string } | null | undefined
    return meta?.stage === stage && !meta?.confirmedAtStage
  })
  if (!pending.length) return []
  const items = pending.map((f) => ({
    id: f.id,
    sheetId: f.sheetId,
    meta: { ...(f.meta || {}), confirmedAtStage: stage }
  }))
  await saveWorldMapFeaturesRemote(worldId, items, runMeta)
  return pending.map((f) => f.id)
}

/** 只读地图两件（读格局摘要+钻取单要素）：地图严谨协作计划批3 草案轮工具集专用（不挂任何写工具，
 *  天然无副作用）；buildHuiyuMapTools 内部也调用本函数复用同一份实现，避免两处各长各的（联动能力：
 *  改这两个工具的 brief/行为，草案轮与落笔轮同步生效）。 */
export function buildHuiyuReadOnlyMapTools(deps: HuiyuMapToolsDeps): ToolDefinition[] {
  const loadBundle = () => fetchWorldMapBundle(deps.worldId)

  const readMapSummary: ToolDefinition = {
    name: 'readMapSummary',
    brief: '读当前世界舆图格局摘要（图纸清单+每要素的 id/名称/类型/中心/尺寸·不含逐点坐标）。任何画/改/删动作之前必须先读它——新要素的位置要与既有格局自洽。',
    schema: { type: 'object', properties: {} },
    execute: async () => {
      const bundle = await loadBundle()
      return { content: renderMapSummary(bundle), details: { kind: 'huiyuMapSummary' } }
    }
  }

  const readMapManual: ToolDefinition = {
    name: 'readMapManual',
    brief: '钻取绘舆知识库正文（笔刷画法手册细节/示例/长篇技巧等未常驻在 system 里的章节——常驻的只有类目白名单/量级表/三条铁律/交稿体检要求）。'
      + 'sections=按标题精确或前缀匹配指定要读的章节（如 ["十三、笔刷画法手册（每类目怎么画才对味·谓词化）"] 或简写 ["十三"]）；'
      + 'query=按关键词匹配章节（标题或正文任一处命中即整节返回，如 "drawCityLayout" 或 "minScale"）；两者都不给则返回全部章节标题目录（很便宜，先看目录再点名要哪节）。',
    schema: {
      type: 'object',
      properties: {
        sections: {
          type: 'array',
          items: { type: 'string' },
          description: '章节标题（精确或前缀均可，如「十三、笔刷画法手册（每类目怎么画才对味·谓词化）」或简写「十三」）。'
        },
        query: { type: 'string', description: '关键词（标题或正文命中即返回该章节全文，如「drawCityLayout」「minScale」）。' }
      }
    },
    execute: async (toolCall) => {
      const sections: HuiyuManualSection[] = loadHuiyuManualSections()
      if (!sections.length) return { content: '知识库暂不可用（源文档读取失败）。', details: { kind: 'huiyuMapManual', matched: [] } }
      const args = toolCall.args as Record<string, unknown>
      const wanted = (Array.isArray(args.sections) ? args.sections : []).map((item) => String(item || '').trim()).filter(Boolean)
      const query = String(args.query || '').trim()
      const directoryLines = sections.map((s) => `- ${s.title}`)
      if (!wanted.length && !query) {
        return {
          content: ['绘舆知识库章节目录（readMapManual 传 sections 或 query 可钻取全文）：', ...directoryLines].join('\n'),
          details: { kind: 'huiyuMapManual', matched: [], directory: sections.map((s) => s.title) }
        }
      }
      const matched = new Map<string, HuiyuManualSection>()
      for (const want of wanted) {
        const exact = sections.filter((s) => s.title === want)
        const hits = exact.length ? exact : sections.filter((s) => s.title.startsWith(want))
        hits.forEach((s) => matched.set(s.title, s))
      }
      if (query) {
        const needle = query.toLowerCase()
        sections
          .filter((s) => s.title.toLowerCase().includes(needle) || s.body.toLowerCase().includes(needle))
          .forEach((s) => matched.set(s.title, s))
      }
      if (!matched.size) {
        return {
          content: [`没有命中任何章节（sections=${JSON.stringify(wanted)}, query=${JSON.stringify(query)}）。可用章节目录：`, ...directoryLines].join('\n'),
          details: { kind: 'huiyuMapManual', matched: [] }
        }
      }
      const matchedList = [...matched.values()]
      return {
        content: matchedList.map((s) => s.body).join('\n\n---\n\n'),
        details: { kind: 'huiyuMapManual', matched: matchedList.map((s) => s.title) }
      }
    }
  }

  const readMapFeature: ToolDefinition = {
    name: 'readMapFeature',
    brief: '钻取单个要素的全量数据（完整顶点/spine/样式/状态锚点/来源）——要精修某要素或精确对齐边界时用；日常定位用 readMapSummary 的中心坐标就够。',
    schema: {
      type: 'object',
      properties: { featureId: { type: 'string', description: '要素 id（readMapSummary 里列出的）。' } },
      required: ['featureId']
    },
    validateArgs: (args) => (String(args.featureId || '').trim() ? null : 'readMapFeature 缺少 featureId'),
    execute: async (toolCall) => {
      const featureId = String(toolCall.args.featureId || '').trim()
      const bundle = await loadBundle()
      const feature = findFeature(bundle, featureId)
      if (!feature) return toolError(`要素 ${featureId} 不存在——先 readMapSummary 拿准确 id`)
      return { content: JSON.stringify(feature, null, 2), details: { kind: 'huiyuMapFeature', featureId } }
    }
  }

  // 空间查询三件（批C·地图分阶段作画与笔刷约束系统）：只读、可自主调用，前置鼓励而非强制——真正的
  // 硬性拦截在落笔硬门（drawMapPath 的水文/坡度/桥接岸三门），无论查没查都会跑。三件输出均="中文摘要+
  // 结构化 details"，反馈按研究_04 §3.1 数值化（给具体海拔/坡度/代价数字，不给"这里不太行"式笼统描述）。

  const elevationAt: ToolDefinition = {
    name: 'elevationAt',
    brief: '查询地图上某点的有效海拔（纯矢量：取该点叠放最上层的 region 海拔，未被任何要素覆盖处按背景海处理，约 ' + SEA_BASE_ELEV + 'm）。画河/画路前建议先查一下沿线几个关键点，能提前发现"这段路要爬多高"——落笔硬门是后置强制兜底，这里只是前置自查，不查也不影响硬门照常生效。',
    schema: {
      type: 'object',
      properties: {
        sheetId: { type: 'string', description: '图纸 id（缺省=主图纸）。' },
        at: { type: 'array', items: { type: 'number' }, description: '查询点 [x,y]（米）。' }
      },
      required: ['at']
    },
    validateArgs: (args) => (parsePointArg(args.at) ? null : 'elevationAt 缺少合法的 at:[x,y]'),
    execute: async (toolCall) => {
      const args = toolCall.args as Record<string, unknown>
      const bundle = await loadBundle()
      const sheet = resolveSheet(bundle, args.sheetId)
      if (!sheet) return toolError('目标图纸不存在——先 createMapSheet')
      const at = parsePointArg(args.at) as MapPoint
      const region = pickTopmostRegionAt(at[0], at[1], sheet)
      const elevM = region ? resolveElevationM(region.category, region.geometry?.elevationM) : SEA_BASE_ELEV
      const content = region
        ? `坐标(${Math.round(at[0])},${Math.round(at[1])})位于「${region.name}」（${region.category}）内，有效海拔约 ${Math.round(elevM)}m。`
        : `坐标(${Math.round(at[0])},${Math.round(at[1])})未被任何已绘制要素覆盖，按背景海处理，海拔约 ${Math.round(elevM)}m。`
      return {
        content,
        details: {
          kind: 'huiyuElevationAt',
          elevationM: Math.round(elevM * 10) / 10,
          featureId: region?.id ?? null,
          featureName: region?.name ?? null,
          category: region?.category ?? null
        }
      }
    }
  }

  const surfaceAt: ToolDefinition = {
    name: 'surfaceAt',
    brief: '查询地图上某点的地表类目与所在要素（含是否为水域判定）。画路/放建筑前建议先查一下落点——避免把陆地类笔刷落进水域；落笔仍有硬门兜底，这里只是前置自查。',
    schema: {
      type: 'object',
      properties: {
        sheetId: { type: 'string', description: '图纸 id（缺省=主图纸）。' },
        at: { type: 'array', items: { type: 'number' }, description: '查询点 [x,y]（米）。' }
      },
      required: ['at']
    },
    validateArgs: (args) => (parsePointArg(args.at) ? null : 'surfaceAt 缺少合法的 at:[x,y]'),
    execute: async (toolCall) => {
      const args = toolCall.args as Record<string, unknown>
      const bundle = await loadBundle()
      const sheet = resolveSheet(bundle, args.sheetId)
      if (!sheet) return toolError('目标图纸不存在——先 createMapSheet')
      const at = parsePointArg(args.at) as MapPoint
      const region = pickTopmostRegionAt(at[0], at[1], sheet)
      const isWater = region ? region.category === 'water' : true
      const content = region
        ? `坐标(${Math.round(at[0])},${Math.round(at[1])})地表类目为「${region.category}」（要素「${region.name}」），${isWater ? '属于水域' : '属于陆地'}。`
        : `坐标(${Math.round(at[0])},${Math.round(at[1])})未被任何已绘制要素覆盖，按背景海处理，属于水域。`
      return {
        content,
        details: {
          kind: 'huiyuSurfaceAt',
          category: region?.category ?? null,
          isWater,
          featureId: region?.id ?? null,
          featureName: region?.name ?? null
        }
      }
    }
  }

  const featuresAlong: ToolDefinition = {
    name: 'featuresAlong',
    brief: '查询一条拟画路径沿途穿越的要素清单+海拔剖面（数值化，非笼统描述）；可选 costTrial:true 附带道路代价试算摘要（是否可通行/总代价/最陡坡度）。画河/画路前建议先查一遍——落笔硬门是后置强制兜底，这里帮你提前发现"会不会穿山/会不会下水/坡度多陡"，避免反复试错撞硬门。',
    schema: {
      type: 'object',
      properties: {
        sheetId: { type: 'string', description: '图纸 id（缺省=主图纸）。' },
        path: { type: 'array', description: '查询折线 [[x,y],…]（≥2 点，可以就是打算画的 from/to 粗坐标）。', items: { type: 'array', items: { type: 'number' } } },
        costTrial: { type: 'boolean', description: '可选：附带道路代价试算（Dijkstra 最优路径，陆地外默认不可通行）——仅供参考决策用，不代表最终落笔一定走这条线。' }
      },
      required: ['path']
    },
    validateArgs: (args) => (parsePointListArg(args.path, 2) ? null : 'featuresAlong 缺少合法的 path（≥2 个 [x,y] 数值点）'),
    execute: async (toolCall) => {
      const args = toolCall.args as Record<string, unknown>
      const bundle = await loadBundle()
      const sheet = resolveSheet(bundle, args.sheetId)
      if (!sheet) return toolError('目标图纸不存在——先 createMapSheet')
      const path = parsePointListArg(args.path, 2) as MapPoint[]
      const crossed = findFeaturesAlongPath(path, sheet)
      const grid = resolveSheetAnalysisGrid(deps.worldId, sheet)
      const profile = sampleElevationProfile(path, grid, 10)

      const lines = [`路径沿途穿越 ${crossed.length} 个要素：`]
      lines.push(...(crossed.length ? crossed.map((c) => `- ${c.name}（${c.kind}/${c.category}）`) : ['- （未穿越任何已绘制要素）']))
      lines.push('', '海拔剖面（起点→终点，米）：' + profile.map((p) => Math.round(p.elevM)).join(' → '))
      const elevs = profile.map((p) => p.elevM)
      const rise = elevs.length ? Math.max(...elevs) - Math.min(...elevs) : 0
      lines.push(`直线距离约 ${Math.round(pathLength(path))}m，剖面海拔落差约 ${Math.round(rise)}m。`)

      let costTrialDetails: Record<string, unknown> | undefined
      if (args.costTrial) {
        const trial = roadCostTrial(path[0], path[path.length - 1], grid)
        if (trial.ok) {
          const maxGradePct = Math.round((trial.maxGradeRatio ?? 0) * 1000) / 10
          lines.push('', `代价试算：可通行，总代价约 ${Math.round(trial.totalCost ?? 0)}，沿途最陡坡度约 ${maxGradePct}%。`)
          costTrialDetails = { ok: true, totalCost: Math.round((trial.totalCost ?? 0) * 10) / 10, maxGradePct }
        } else {
          lines.push('', '代价试算：不可通行（陆路绕不开水体，或坡度全部超出阈值）——如需跨水，考虑改用桥。')
          costTrialDetails = { ok: false }
        }
      }

      return {
        content: lines.join('\n'),
        details: {
          kind: 'huiyuFeaturesAlong',
          crossed,
          profile,
          ...(costTrialDetails ? { costTrial: costTrialDetails } : {})
        }
      }
    }
  }

  return [readMapSummary, readMapManual, readMapFeature, elevationAt, surfaceAt, featuresAlong]
}

/** coverFeatureIds → 新探索范围 pts（探索只增不减内建：previous 有效时，expandedHullOf 结构性保证结果
 *  包络涵盖它，见该函数注释）：给要素 id 列表算出「旧范围+这些要素」的自然包络。expandExplored 工具与
 *  编排自动扩探（huiyuOrchestration.ts 事故根因3对症）共用同一份计算，不许两处各写一份。 */
function computeCoverFeatureIdsExpansion(
  bundle: WorldMapBundle,
  sheet: WorldMapSheet,
  featureIds: string[],
  paddingM?: number
): { pts: MapPoint[] } | { error: 'missing-feature'; missingId: string } | { error: 'no-geometry' } {
  const previous = (sheet.explored?.pts || []) as MapPoint[]
  const newSets: MapPoint[][] = []
  for (const fid of featureIds) {
    const feature = findFeature(bundle, fid)
    if (!feature) return { error: 'missing-feature', missingId: fid }
    const fpts = (feature.geometry?.pts || []) as MapPoint[]
    if (fpts.length) newSets.push(fpts)
  }
  if (!newSets.length) return { error: 'no-geometry' }
  const newSpan = bboxOf(newSets.flat())
  const spanExtent = Math.max(newSpan.maxX - newSpan.minX, newSpan.maxY - newSpan.minY)
  const resolvedPadding = Number.isFinite(paddingM) ? Number(paddingM) : Math.max(200, spanExtent * 0.15)
  const sets = previous.length >= 3 ? [previous, ...newSets] : newSets
  return { pts: expandedHullOf(sets, resolvedPadding, sheet.id) }
}

/** 自动扩探直调口径（编排层用·笔刷约束系统批B 事故根因3对症·2026-07-12）：不经模型工具调用，直接把
 *  给定要素 id 纳入探索范围（复用 expandExplored 同一份 coverFeatureIds 计算，铁律"探索只增不减"照样
 *  成立）——事故复盘：绘舆两次提示"记得 expandExplored"都因预算耗尽没能执行，新落笔要素对用户不可见；
 *  编排侧交稿后现查现补，不占绘舆自己的工具调用预算。featureIds 都不存在/都没几何 → 视为无事可做，
 *  返回 null（不报错，调用方按"无需扩探"处理，不阻塞落笔轮收尾）。 */
export async function expandExploredCoverFeatureIds(
  worldId: string,
  sheetId: string | undefined,
  featureIds: string[],
  runMeta?: { runKey?: string; runLabel?: string }
): Promise<{ areaText: string; sheetId: string } | null> {
  if (!featureIds.length) return null
  const bundle = await fetchWorldMapBundle(worldId)
  const sheet = resolveSheet(bundle, sheetId)
  if (!sheet) return null
  const expansion = computeCoverFeatureIdsExpansion(bundle, sheet, featureIds)
  if ('error' in expansion) return null
  const saved = await saveWorldMapSheetRemote(worldId, { id: sheet.id, explored: { pts: expansion.pts } }, runMeta)
  const area = saved.explored ? fmtArea(shoelace(saved.explored.pts as MapPoint[])) : '?'
  return { areaText: area, sheetId: saved.id }
}

export function buildHuiyuMapTools(deps: HuiyuMapToolsDeps): ToolDefinition[] {
  const loadBundle = () => fetchWorldMapBundle(deps.worldId)
  const readOnlyTools = buildHuiyuReadOnlyMapTools(deps)

  const createMapSheet: ToolDefinition = {
    name: 'createMapSheet',
    brief: '新建图纸。默认全画在主图纸上，只有物理不连通的空间（异世界/位面）才建新纸；世界还没有任何图纸时必须先建主图纸。',
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: '图纸名（如「主世界」「碧落位面」·≤50字）。' },
        explored: {
          type: 'array',
          description: '初始探索范围多边形 [[x,y],…]（≥3点·建议 10~14 个顶点画自然轮廓）。强烈建议同时给——没有探索范围用户看到的是全迷雾空态。',
          items: { type: 'array', items: { type: 'number' } }
        }
      },
      required: ['name']
    },
    validateArgs: (args) => (String(args.name || '').trim() ? null : 'createMapSheet 缺少 name'),
    execute: async (toolCall) => {
      const exploredPts = toolCall.args.explored === undefined ? undefined : parsePointListArg(toolCall.args.explored, 3)
      if (toolCall.args.explored !== undefined && !exploredPts) {
        return toolError('explored 必须是至少 3 个 [x,y] 数值点')
      }
      const sheet = await saveWorldMapSheetRemote(deps.worldId, {
        name: String(toolCall.args.name || '').trim(),
        ...(exploredPts ? { explored: { pts: exploredPts } } : {})
      }, deps.runMeta)
      return { content: `图纸已建：${sheet.id}「${sheet.name}」${sheet.explored ? '' : '（⚠️ 还没有探索范围，记得 expandExplored）'}`, details: { kind: 'huiyuSheetCreated', sheetId: sheet.id } }
    }
  }

  const expandExplored: ToolDefinition = {
    name: 'expandExplored',
    brief: '扩张图纸的已探索范围（迷雾真值）。推荐给 coverFeatureIds（刚画的要素 id）系统自动算自然包络；也可手画 pts。铁律：探索只增不减（代码保证，新范围必完整涵盖旧范围）。',
    schema: {
      type: 'object',
      properties: {
        sheetId: { type: 'string', description: '图纸 id（缺省=主图纸）。' },
        coverFeatureIds: {
          type: 'array',
          description: '推荐用法：给刚画的要素 id 列表，系统自动算出「旧范围+这些要素」的自然包络——不用自己画多边形。与 pts 二选一。',
          items: { type: 'string' }
        },
        paddingM: { type: 'number', description: '包络外扩留边（米·可选，缺省按新增要素 bbox 跨度自动估算）。仅 coverFeatureIds 模式生效。' },
        pts: {
          type: 'array',
          description: '手画模式（不推荐）：新的完整探索范围多边形 [[x,y],…]（整体替换·必须涵盖旧范围+新地物）。与 coverFeatureIds 二选一。',
          items: { type: 'array', items: { type: 'number' } }
        }
      }
    },
    validateArgs: (args) => {
      const hasPts = args.pts !== undefined
      const hasCover = args.coverFeatureIds !== undefined
      if (!hasPts && !hasCover) return 'expandExplored 必须给 pts 或 coverFeatureIds 之一'
      if (hasPts && hasCover) return 'pts 与 coverFeatureIds 只能二选一'
      if (hasCover && (!Array.isArray(args.coverFeatureIds) || !args.coverFeatureIds.length)) return 'coverFeatureIds 必须是非空字符串数组'
      return null
    },
    execute: async (toolCall) => {
      const args = toolCall.args as Record<string, unknown>
      const bundle = await loadBundle()
      const sheet = resolveSheet(bundle, args.sheetId)
      if (!sheet) return toolError('目标图纸不存在——世界还没有图纸就先 createMapSheet')
      const previous = (sheet.explored?.pts || []) as MapPoint[]

      let pts: MapPoint[]
      if (args.coverFeatureIds !== undefined) {
        const ids = (args.coverFeatureIds as unknown[]).map((v) => String(v || '').trim()).filter(Boolean)
        const paddingM = Number.isFinite(Number(args.paddingM)) ? Number(args.paddingM) : undefined
        const expansion = computeCoverFeatureIdsExpansion(bundle, sheet, ids, paddingM)
        if ('error' in expansion) {
          if (expansion.error === 'missing-feature') return toolError(`coverFeatureIds 里 ${expansion.missingId} 不存在——先 readMapSummary 拿准确要素 id`)
          return toolError('coverFeatureIds 指向的要素都没有可用几何点')
        }
        pts = expansion.pts
      } else {
        const rawPts = parsePointListArg(args.pts, 3)
        if (!rawPts) return toolError('pts 必须是至少 3 个 [x,y] 数值点')
        pts = rawPts
      }

      if (previous.length >= 3) {
        // 探索只增不减：新范围包围盒必须涵盖旧范围（留 2% 容差防浮点/轻微修边误伤）
        const oldBox = bboxOf(previous)
        const newBox = bboxOf(pts)
        const tolX = (oldBox.maxX - oldBox.minX) * 0.02
        const tolY = (oldBox.maxY - oldBox.minY) * 0.02
        if (newBox.minX > oldBox.minX + tolX || newBox.minY > oldBox.minY + tolY
          || newBox.maxX < oldBox.maxX - tolX || newBox.maxY < oldBox.maxY - tolY) {
          return toolError(`新范围没有涵盖旧范围（旧包围盒 x:${Math.round(oldBox.minX)}~${Math.round(oldBox.maxX)} y:${Math.round(oldBox.minY)}~${Math.round(oldBox.maxY)}）——探索只增不减，把旧范围整个包进去再扩新边（或改用 coverFeatureIds 自动包络）`)
        }
      }
      const saved = await saveWorldMapSheetRemote(deps.worldId, { id: sheet.id, explored: { pts } }, deps.runMeta)
      const area = saved.explored ? fmtArea(shoelace(saved.explored.pts as MapPoint[])) : '?'
      return { content: `图纸「${saved.name}」探索范围已更新：${area}`, details: { kind: 'huiyuExploredExpanded', sheetId: saved.id } }
    }
  }

  /** 画/改共用的落库（要素 upsert 单条）。runMeta 随 deps 透传进变更日志（批L）。 */
  const saveFeature = async (item: Record<string, unknown>) => {
    const saved = await saveWorldMapFeaturesRemote(deps.worldId, [item], deps.runMeta)
    return saved[0]
  }

  /** 宏笔刷公共落库助手（笔刷约束系统批E）：草案要素批量整理成保存 payload（layer 由生成器给定；meta.stage
   *  出生戳按 deps.stage 统一补，同单要素写工具口径一致）+ 一次性批量写库（整批校验通过才落库，走
   *  saveWorldMapFeaturesRemote 既有批量端点，不是逐条单独写）+ terrainRevision 自增一次 + 落库后跑一次
   *  report-only 体检（不阻塞，findings 供调用方拼进回执）——宏笔刷内部构造性保证只覆盖水文/坡度/嵌套核心
   *  三个最容易出错的维度，对"生成结果是否与既有要素触犯 crossRules 禁叠"等边界情形不做二次孤立防御，交给
   *  这里的落库后体检兜底，同 submitMap 既有"体检放行不阻塞"哲学一致（见 mapMacroBrushes.ts 文件头声明）。 */
  const persistMacroBrushResult = async (
    sheet: WorldMapSheet,
    result: MacroBrushResult
  ): Promise<{ savedIds: string[]; auditNote: string }> => {
    if (!result.features.length) return { savedIds: [], auditNote: '' }
    const items = result.features.map((f) => ({
      sheetId: sheet.id,
      kind: f.kind,
      category: f.category,
      name: f.name,
      layer: f.layer,
      geometry: { pts: f.pts, ...(f.spine ? { spine: f.spine } : {}), ...(f.elevationM !== undefined ? { elevationM: f.elevationM } : {}) },
      meta: { ...(f.meta || {}), ...(deps.stage ? { stage: deps.stage } : {}) }
    }))
    const saved = await saveWorldMapFeaturesRemote(deps.worldId, items, deps.runMeta)
    bumpTerrainRevision(deps.worldId) // 批C：地形写版本号自增，网格 memo 据此失效重算（整批只算一次账）
    // 体检必须吃落库后的最新图纸：传入的 sheet 是落库前快照（真后端每次 fetch 返回全新反序列化对象，
    // 拿旧快照体检会漏掉本批刚写的要素——spec 的 mock 原地改同一对象看不出差别，别被测试假象骗）。
    const freshBundle = await fetchWorldMapBundle(deps.worldId)
    const freshSheet = freshBundle.sheets.find((s) => s.id === sheet.id) || sheet
    const audit = await runSheetAudit(deps.worldId, freshSheet, false)
    const auditNote = audit.findings.length
      ? `\n体检提示：\n${audit.findings.map((finding) => `- [${finding.number}][${finding.severity}][${finding.code}] ${finding.message}`).join('\n')}`
      : ''
    return { savedIds: saved.map((s) => s.id), auditNote }
  }

  /** 宏笔刷回执拼装（四件共用）：headline + 探索范围溢出提醒（聚合全部产出要素的检查点）+ 生成过程说明
   *  （挂接吸附成败/自动收敛等）+ 落库后体检提示。 */
  const renderMacroBrushReceipt = (headline: string, sheet: WorldMapSheet, result: MacroBrushResult, auditNote: string): string => {
    const checkPts = result.features.flatMap((f) => overflowCheckPoints(f.kind, f.kind === 'marker' ? null : centroid(f.pts), f.pts))
    const overflowNote = exploredOverflowNote(sheet, checkPts)
    const notesText = result.notes.length ? `\n${result.notes.map((n) => `- ${n}`).join('\n')}` : ''
    return `${headline}${overflowNote}${notesText}${auditNote}`
  }

  const drawMapRegion: ToolDefinition = {
    name: 'drawMapRegion',
    brief: '画面状要素（山/林/草/原/水/城区/丘陵/沙漠/沼泽/冰原/雨林/农田）——参数化造形：给中心（或 anchor 相对定位）+半径+形态，系统确定性生成自然轮廓（同 seed 同形状），不要自己硬编多边形。带同 id 重画=重造形替换。form=ridge 可画条状山脊（画"山脉一条一条"）；coastRoughness 加大海岸破碎度；isletCluster 顺带生成伴生小岛群。',
    schema: {
      type: 'object',
      properties: {
        sheetId: { type: 'string', description: '图纸 id（缺省=主图纸）。' },
        id: { type: 'string', description: '语义 id（如 mt-xuanyue·缺省自动生成；带已存在的 id=重画替换）。' },
        name: { type: 'string', description: '名称（必填·贴世界观）。' },
        category: {
          type: 'string',
          // 阶段过滤（笔刷约束系统批D）：deps.stage 给了就把 enum 收窄到本阶段可画类目（教模型正确选项，
          // 不指望它自己读文字描述猜）；未给=全量 12 类（旧版 draft/draw 两段式派发零回归）。
          enum: deps.stage ? STAGE_REGION_CATEGORIES[deps.stage] : ['mountain', 'forest', 'grass', 'plateau', 'water', 'urban', 'hill', 'desert', 'swamp', 'ice', 'jungle', 'farmland'],
          description: '类别（决定图层与配色，画法要领见知识库第十二节）：mountain=山脉（宜 form=ridge 成条画）；forest=森林；grass=草地/草原；plateau=高原（同森林/草原规则，无特殊质感）；water=水域(海/湖，海岸破碎用 coastRoughness；山中水体宜落在两脊之间/山体边缘凹处的山谷，尺寸不可越过所叠山体太多——短轴≤6000m 且面积≤山体25%，超界硬拒，未显式给 elevationM 时会自动继承所叠山体海拔)；urban=城镇/城区（宜方正 form=rect+低 roughness）；hill=丘陵(显著小于mountain·地形层)；desert=沙漠(地形层·专色盖过海拔色·宜大块低roughness)；swamp=沼泽(地形层·专色·宜贴水域画)；ice=冰原雪山(地形层·专色·宜高elevationM)；jungle=雨林(地形层·比forest更茂密·人文视图归绿桶)；farmland=农田(civic层·近城/村的耕地·宜贴urban边缘不进城内)。'
        },
        center: { type: 'array', items: { type: 'number' }, description: '中心/起点 [x,y]（米）。与 anchor 二选一（form=ridge 时此为山脊起点）。' },
        anchor: {
          type: 'object',
          description: '相对定位（推荐）：以既有要素为基。{featureId, bearing:汉字八方位, distanceM:距离米}。',
          properties: {
            featureId: { type: 'string' },
            bearing: { type: 'string', description: '东/南/西/北/东北/东南/西北/西南' },
            distanceM: { type: 'number' }
          }
        },
        rxM: { type: 'number', description: '东西向半径（米=中心到边缘距离，等于知识库第四节"整体跨度"的一半——例：知识库写丘陵跨度 0.5~20km，应填 rxM=250~10000，不要把跨度数字原样填进来）。form=ridge 时不需要（用 ridgeWidthM）。' },
        ryM: { type: 'number', description: '南北向半径（米，换算同 rxM：知识库给的是整体跨度，这里填跨度的一半）。form=ridge 时不需要。' },
        form: { type: 'string', enum: ['blob', 'ellipse', 'rect', 'ridge'], description: 'blob=有机地块（缺省）；ellipse=规整；rect=城区/地块；ridge=条状山脊（主脊 center→ridgeTo+两端收窄，画"山脉一条一条"专用，配 ridgeTo/ridgeWidthM，不用 rxM/ryM）。' },
        roughness: { type: 'number', description: '边界抖动 0~1（缺省按 form 给）。' },
        coastRoughness: { type: 'number', description: '海岸破碎度 0~1（可选·在 roughness 基础上叠加更大幅度+更密顶点，画曲折破碎的海岸线/群岛边界；典型配 category=water，越大越碎，参考画廊三档 0.2 低碎/0.5 中碎/0.65 高碎；>0.65 易触底钳位过尖不建议）。form=ridge 不支持。' },
        seed: { type: 'string', description: '造形种子（缺省用 id·同 seed 永远同形状；重画想保形状就不改它）。' },
        ridgeTo: { type: 'array', items: { type: 'number' }, description: 'form=ridge 专用（必填）：山脊另一端点 [x,y]（米），center/anchor 是起点。' },
        ridgeWidthM: { type: 'number', description: 'form=ridge 专用（必填）：主脊满宽（米，两端按 ridgeTaper 收窄）。' },
        ridgeTaper: { type: 'number', description: 'form=ridge 专用（可选）：两端收窄比例 0~1（缺省 0.7，越大两端越尖）。' },
        spine: { type: 'array', description: '山脉走向脊线 [[x,y],…]（category=mountain 强烈建议给·用于大区域名沿脊斜排）。', items: { type: 'array', items: { type: 'number' } } },
        elevationM: { type: 'number', description: '海拔米数（可选·物理真值，驱动地形视图海拔分层设色与人文视图山地判定）。缺省按类目兜底：mountain 2500/plateau 1200/forest 300/grass 150/urban 50/water 0/hill 400/desert 300/swamp 50/ice 4500/jungle 350/farmland 100。' },
        layer: { type: 'string', enum: ['terrain', 'civic'], description: '图层（缺省按 category 推断）。' },
        isletCluster: {
          type: 'object',
          description: '伴生小岛群（可选·画海岸破碎观感的延伸，一般配 category=water 用）：以本要素为中心自动生成 count 个独立落库的小型陆地要素（islet）。{count(1~12), spreadM?(散布半径米，缺省800), minSizeM?/maxSizeM?(单岛半径米，缺省80~220), category?(缺省grass)}。',
          properties: {
            count: { type: 'number' },
            spreadM: { type: 'number' },
            minSizeM: { type: 'number' },
            maxSizeM: { type: 'number' },
            category: { type: 'string' }
          }
        },
        style: { type: 'object', description: '渲染微调（可选）：labelMode(sprawl/spread)/labelAt/labelMin/minScale/rough 等。' },
        links: { type: 'object', description: '状态锚点（可选）：{panelId?/hostType?/hostId?}。' },
        override: { type: 'string', enum: ['terraform'], description: '高门槛改造通道（可选·仅阶段管线 staged 模式且已获人工确认才有意义）：改动已确认阶段锁定的既有要素（隧道/运河/削坡等）时才需要，未获批准会被硬拒。' }
      },
      required: ['name', 'category']
    },
    validateArgs: (args) => {
      if (!String(args.name || '').trim()) return 'drawMapRegion 缺少 name'
      const category = String(args.category || '')
      if (!REGION_CATEGORIES.has(category)) return 'category 必须是 mountain/forest/grass/plateau/water/urban/hill/desert/swamp/ice/jungle/farmland'
      // 阶段过滤（笔刷约束系统批D）：deps.stage 给了才卡——防误伤已确权内容，不是降低模型认知负担
      // （schema 的 enum 收窄已经教了正确选项，这里是兜底硬门，防模型忽略 schema 硬塞旧类目）。
      if (deps.stage && !STAGE_REGION_CATEGORIES[deps.stage].includes(category)) {
        return `当前阶段「${deps.stage}」不开放 region 类目「${category}」——本阶段可画：${STAGE_REGION_CATEGORIES[deps.stage].join('/') || '（无）'}`
      }
      if (args.elevationM !== undefined && !Number.isFinite(Number(args.elevationM))) return 'elevationM 必须是数值（米）'
      const form = String(args.form || 'blob')
      if (form === 'ridge') {
        if (!Array.isArray(args.ridgeTo) || args.ridgeTo.length < 2) return 'form=ridge 需要 ridgeTo:[x,y]（山脊另一端点）'
        if (!Number.isFinite(Number(args.ridgeWidthM)) || Number(args.ridgeWidthM) <= 0) return 'form=ridge 需要 ridgeWidthM（正数·主脊满宽米数）'
      } else {
        if (!Number.isFinite(Number(args.rxM)) || Number(args.rxM) <= 0) return 'rxM 必须是正数（米）'
        if (!Number.isFinite(Number(args.ryM)) || Number(args.ryM) <= 0) return 'ryM 必须是正数（米）'
        // 量级区间不再在这里硬拒（美观与迅捷优先·2026-07-13 用户拍板）：超界改到 execute 里钳制到边界+
        // 回执附注，不再打回重想；此处只保留"必须是正数"这一基本形状校验。
      }
      if (args.isletCluster !== undefined) {
        const cluster = pickObjectArg(args.isletCluster)
        if (!cluster || !Number.isFinite(Number(cluster.count)) || Number(cluster.count) <= 0) return 'isletCluster 需要 count（正整数·小岛数量）'
      }
      return null
    },
    execute: async (toolCall) => {
      const args = toolCall.args as Record<string, unknown>
      const bundle = await loadBundle()
      const sheet = resolveSheet(bundle, args.sheetId)
      if (!sheet) return toolError('目标图纸不存在——先 createMapSheet')
      const placed = resolvePlacement(bundle, args, 'center')
      if ('error' in placed) return toolError(placed.error)
      const id = String(args.id || '').trim()
      // Lock 保护硬门（笔刷约束系统批D）：id 命中既有要素=重画替换（几何写），检查是否越阶段锁——
      // 早于造形/避让/嵌套等一切耗时计算，越权直接拒绝不浪费算力。新建（id 不存在/未给）不受影响。
      if (id) {
        const existing = sheet.features.find((f) => f.id === id) || null
        const lockRejection = checkStageLock(existing, args, sheet, deps, `region「${String(args.name || id).trim()}」（${id}）`)
        if (lockRejection) return lockRejection
      }
      const seed = String(args.seed || '').trim() || id || String(args.name || '').trim()
      const form = (['blob', 'ellipse', 'rect', 'ridge'].includes(String(args.form)) ? String(args.form) : 'blob') as RegionDrawForm
      const roughness = Number.isFinite(Number(args.roughness)) ? Number(args.roughness) : undefined
      const coastRoughness = Number.isFinite(Number(args.coastRoughness)) ? Number(args.coastRoughness) : undefined
      const category = String(args.category)
      // elevationM 提前到此解析（笔刷约束系统批A）：下面的嵌套海拔面硬门要在造形完成后立即用它判断"是否比重叠的
      // 既有要素更高"，原先这行在函数尾部会晚于该判断。let（非 const）：批W water×mountain 尺寸帽通过后，
      // 若调用方未显式给 elevationM，会在此基础上继承所叠山体海拔（可显式覆盖，7.11②）。
      let elevationM = Number.isFinite(Number(args.elevationM)) ? Number(args.elevationM) : undefined

      let rxM = 0; let ryM = 0
      let ridgeTo: MapPoint | null = null
      let ridgeWidthM = 0
      let ridgeTaper: number | undefined
      let buildAt: (center: MapPoint) => MapPoint[]
      let stepSize: number
      // 量级钳制附注（美观与迅捷优先·2026-07-13 用户拍板）：rxM/ryM 超类目 sizeRange 时不再拒绝，
      // 钳到边界值照常落笔，回执如实附注——只有极其不合理的才该拦，尺度偏差属于"允许自动修改"。
      let sizeClampNote = ''

      if (form === 'ridge') {
        ridgeTo = parsePointArg(args.ridgeTo)
        if (!ridgeTo) return toolError('form=ridge 需要合法的 ridgeTo:[x,y]')
        ridgeWidthM = Number(args.ridgeWidthM)
        ridgeTaper = Number.isFinite(Number(args.ridgeTaper)) ? Number(args.ridgeTaper) : undefined
        const fromBase = placed.point
        const toBase = ridgeTo
        buildAt = (center: MapPoint) => {
          const dx = center[0] - fromBase[0]; const dy = center[1] - fromBase[1]
          return buildRidgePolygon({
            from: [fromBase[0] + dx, fromBase[1] + dy],
            to: [toBase[0] + dx, toBase[1] + dy],
            width: ridgeWidthM, seed,
            ...(ridgeTaper !== undefined ? { taper: ridgeTaper } : {}),
            ...(roughness !== undefined ? { roughness } : {})
          })
        }
        stepSize = Math.max(ridgeWidthM, 200) * 0.3
      } else {
        rxM = Number(args.rxM); ryM = Number(args.ryM)
        const range = REGION_SIZE_RANGE[category]
        if (range) {
          const clampedRx = Math.min(Math.max(rxM, range.min), range.max)
          const clampedRy = Math.min(Math.max(ryM, range.min), range.max)
          if (clampedRx !== rxM || clampedRy !== ryM) {
            const parts: string[] = []
            if (clampedRx !== rxM) parts.push(`rxM ${rxM}→${clampedRx}`)
            if (clampedRy !== ryM) parts.push(`ryM ${ryM}→${clampedRy}`)
            sizeClampNote = ` ⚠️已钳制：${parts.join('、')}（超出 ${category} 合理区间 ${range.min}~${range.max}m）。`
            rxM = clampedRx; ryM = clampedRy
          }
        }
        buildAt = (center: MapPoint) => buildShapePolygon({
          cx: center[0], cy: center[1], rx: rxM, ry: ryM, form: form as MapShapeForm, seed,
          ...(roughness !== undefined ? { roughness } : {}),
          ...(coastRoughness !== undefined ? { coastRoughness } : {})
        })
        stepSize = Math.max(rxM, ryM) * 0.3
      }

      let pts = buildAt(placed.point)
      let finalCenter = placed.point
      let pushNote = ''

      // 违禁重叠卫兵：同图纸上与本类构成禁止对的既有 region（重画排除自身 id）当障碍——water 障碍额外过
      // 「最上层有效地表」豁免（笔刷约束系统批W crossRules③）：初始候选形状若整个落在压住该水域的陆地要素
      // （岛屿）内，不算真正接触水域，不列入障碍，防止误杀"岛上建山/城"。
      const obstacles: MapPoint[][] = []
      for (const feature of sheet.features) {
        if (feature.kind !== 'region') continue
        if (id && feature.id === id) continue
        if (!isForbiddenOverlap(category, feature.category)) continue
        const obPts = (feature.geometry?.pts || []) as MapPoint[]
        if (obPts.length < 3) continue
        if (feature.category === 'water' && waterObstacleExcusedByTopSurface(pts, feature, sheet)) continue
        obstacles.push(obPts)
      }
      if (obstacles.length) {
        const cleared = resolvePlacementClear({ start: placed.point, build: buildAt, obstacles, stepM: stepSize })
        pts = cleared.pts
        finalCenter = cleared.center
        if (!cleared.clear) {
          // 美观与迅捷优先（2026-07-13 用户拍板）：推不开不再拒绝——按已尝试的最后位置放行落笔，
          // 回执如实附注仍有重叠，交给用户/后续笔画自行调整，不烧一轮模型重想。
          pushNote = ` ⚠️ 与既有要素持续重叠且未能完全推开（${category} 与水域/城区/山体等禁止叠·已尝试自动推移约${Math.round(cleared.shiftedM)}m 仍有重叠）——已放行落笔，如需精确避让可再调整位置或尺寸。`
        } else if (cleared.shiftedM > 0) {
          const bearing = vectorToBearing(finalCenter[0] - placed.point[0], finalCenter[1] - placed.point[1])
          pushNote = ` ⚠️ 与既有要素重叠，已自动向${bearing}推移约${Math.round(cleared.shiftedM)}m 避开。`
        }
      }

      // 嵌套海拔面硬门（批A 仅 mountain 自嵌套；批D 泛化到整个陆地地形族 TERRAIN_NESTING_FAMILY——
      // 山/林/草/高原/丘/漠/沼/冰/雨林互为父候选，water/urban/farmland 不参与）：
      // 新造形与既有"父类目"要素部分重叠（非完全不沾、也非已完全包住）才判定。
      // 二分：新有效海拔＞既有（嵌套拔升场景）→自动 clipPolygonToParent 裁进外层+回执注明（保留纠正）；
      // 否则（美观与迅捷优先·2026-07-13 用户拍板）→不再硬拒，原样放行落笔+回执附注，交由后续笔画调整。
      let nestingNote = ''
      const nestingSpec = BRUSH_SPEC[category]
      if (nestingSpec.nesting === 'must_be_inside_parent' && nestingSpec.nestingParentCategories?.length) {
        const parentCandidates = sheet.features.filter((f) =>
          f.kind === 'region' && (!id || f.id !== id) && nestingSpec.nestingParentCategories!.includes(f.category)
        )
        for (const parent of parentCandidates) {
          const parentPts = (parent.geometry?.pts || []) as MapPoint[]
          if (parentPts.length < 3 || !polygonsOverlap(pts, parentPts)) continue
          if (pts.every((p) => pointInPoly(p[0], p[1], parentPts))) continue // 已完全在父要素内，不算违规
          const parentElevation = resolveElevationM(parent.category, parent.geometry?.elevationM)
          const newElevation = resolveElevationM(category, elevationM)
          if (newElevation > parentElevation) {
            pts = clipPolygonToParent(pts, parentPts)
            nestingNote = ` 已裁进「${parent.name}」内部（嵌套海拔面自动处理：本要素海拔${newElevation}m＞「${parent.name}」海拔${parentElevation}m）。`
          } else {
            nestingNote = ` ⚠️已放行：与既有「${parent.name}」（海拔${parentElevation}m）部分重叠但未完全被其包住，本要素海拔${newElevation}m 未高于对方，不构成合法的嵌套海拔核心——地形可能出现视觉穿插，建议后续把本要素画到「${parent.name}」轮廓外侧作为独立 hill/山麓，或把海拔抬高到${parentElevation}m 以上。`
          }
          break
        }
      }

      // water×mountain 尺寸帽（笔刷约束系统批W crossRules②）：短轴≤6000m 且面积≤所叠山体面积25%——
      // 超帽不再硬拒（美观与迅捷优先·2026-07-13 用户拍板），原样放行落笔+回执附注；未显式给 elevationM 时
      // 海拔缺省继承所叠山体海拔（而非全局 water 缺省 0m，纠正保留）——否则水文网格里山中湖会变成山体海拔中的
      // 一个 0m 深坑，出湖河永远判定"逆坡"违规（批C validateRiverPath 用填洼后场判单调不升，水体海拔必须与
      // 所嵌入的地形海拔同一量级才自洽）。山谷软引导（宜置两脊之间/山体边缘凹处）不在此硬判，归 auditMap
      // info 提示（findWaterInMountainHintFindings）+ 本工具 brief 教学一句，真"山谷检测"留待后续。
      let mountainHintNote = ''
      if (category === 'water') {
        const overlappedMountain = sheet.features.find((f) => {
          if (f.kind !== 'region' || f.category !== 'mountain' || (id && f.id === id)) return false
          const mPts = (f.geometry?.pts || []) as MapPoint[]
          return mPts.length >= 3 && polygonsOverlap(pts, mPts)
        })
        if (overlappedMountain) {
          const mountainPts = (overlappedMountain.geometry?.pts || []) as MapPoint[]
          const waterBox = bboxOf(pts)
          const shortAxisM = Math.min(waterBox.maxX - waterBox.minX, waterBox.maxY - waterBox.minY)
          const waterArea = shoelace(pts)
          const mountainArea = shoelace(mountainPts)
          if (shortAxisM > 6000 || (mountainArea > 0 && waterArea > mountainArea * 0.25)) {
            mountainHintNote = ` ⚠️已放行：与「${overlappedMountain.name}」（mountain）重叠，短轴约${Math.round(shortAxisM)}m/面积约占山体${mountainArea > 0 ? Math.round(waterArea / mountainArea * 100) : '?'}%，超出山中水体尺寸帽（短轴≤6000m 且面积≤山体25%）——建议后续视需要缩小或移出山体。`
          }
          if (elevationM === undefined) {
            elevationM = resolveElevationM(overlappedMountain.category, overlappedMountain.geometry?.elevationM)
            mountainHintNote += ` 海拔已按所叠山体「${overlappedMountain.name}」继承为${Math.round(elevationM)}m（水文一致性缺省，可用 elevationM 参数显式覆盖）。`
          }
        }
      }

      const spine = args.spine === undefined ? null : parsePointListArg(args.spine, 2)
      if (args.spine !== undefined && !spine) return toolError('spine 必须是至少 2 个 [x,y] 数值点')
      const style = pickObjectArg(args.style)
      const links = pickObjectArg(args.links)
      const saved = await saveFeature({
        ...(id ? { id } : {}),
        sheetId: sheet.id,
        kind: 'region',
        category,
        name: String(args.name).trim(),
        layer: inferLayer(category, args.layer),
        geometry: { pts, ...(spine ? { spine } : {}), ...(elevationM !== undefined ? { elevationM } : {}) },
        // meta 记录造形参数（同 seed 恒形的追溯依据）+ 阶段出生戳（笔刷约束系统批D·deps.stage 给了才打，
        // 非 staged 派发不打——存量豁免哲学的自然延伸，只有走过阶段管线的笔画才进入阶段簿记）。
        meta: {
          shape: form === 'ridge'
            ? { form, seed, ridgeTo, ridgeWidthM, ridgeTaper }
            : { form, seed, rxM, ryM, ...(coastRoughness !== undefined ? { coastRoughness } : {}) },
          ...(deps.stage ? { stage: deps.stage } : {})
        },
        ...(style ? { style } : {}),
        ...(links ? { links } : {})
      })
      bumpTerrainRevision(deps.worldId) // 批C：地形写版本号自增，网格 memo 据此失效重算

      // 伴生小岛群（可选）：main region 落库成功后再各自独立落库，围绕本要素几何质心散布
      let isletNote = ''
      const isletArg = pickObjectArg(args.isletCluster)
      if (isletArg && Number.isFinite(Number(isletArg.count)) && Number(isletArg.count) > 0) {
        const isletCategory = String(isletArg.category || 'grass').trim() || 'grass'
        const islets = buildIsletCluster({
          around: centroid(pts),
          count: Number(isletArg.count),
          seed: `${seed}-islets`,
          ...(Number.isFinite(Number(isletArg.spreadM)) ? { spreadM: Number(isletArg.spreadM) } : {}),
          ...(Number.isFinite(Number(isletArg.minSizeM)) ? { minSizeM: Number(isletArg.minSizeM) } : {}),
          ...(Number.isFinite(Number(isletArg.maxSizeM)) ? { maxSizeM: Number(isletArg.maxSizeM) } : {})
        })
        const isletIds: string[] = []
        for (let i = 0; i < islets.length; i++) {
          const isletSaved = await saveFeature({
            sheetId: sheet.id,
            kind: 'region',
            category: isletCategory,
            name: `${String(args.name).trim()}·伴生小岛${i + 1}`,
            layer: inferLayer(isletCategory),
            geometry: { pts: islets[i] },
            meta: { shape: { form: 'islet', parentId: saved.id, seed: `${seed}-islets-${i}` }, ...(deps.stage ? { stage: deps.stage } : {}) }
          })
          isletIds.push(isletSaved.id)
        }
        isletNote = ` 伴生小岛已生成 ${isletIds.length} 个（${isletIds.join('、')}）。`
      }

      const overflowNote = exploredOverflowNote(sheet, overflowCheckPoints('region', finalCenter, pts))
      return {
        content: `已画 region「${saved.name}」（${saved.id}·${category}·中心(${Math.round(finalCenter[0])},${Math.round(finalCenter[1])})·${describeSize(pts)}）。${sizeClampNote}${pushNote}${nestingNote}${mountainHintNote}${isletNote}${overflowNote}`,
        details: { kind: 'huiyuFeatureSaved', featureId: saved.id }
      }
    }
  }

  const drawMapPath: ToolDefinition = {
    name: 'drawMapPath',
    brief: '画线状要素（河流/道路/街道/城墙/疆界/运河/小径/桥）：推荐给 from/to 挂既有要素（河流终点挂海洋/湖泊 region 会自动吸附到岸边，治「河海断连」），系统确定性生成蜿蜒折线+渲染端自动平滑。arc 出口画规整圆弧（城墙弧段等"圆弧不歪扭"诉求）；裸给顶点数组是精修高级出口；环形城墙必须首尾同点闭合（用 pts 出口画环）。',
    schema: {
      type: 'object',
      properties: {
        sheetId: { type: 'string', description: '图纸 id（缺省=主图纸）。' },
        id: { type: 'string', description: '语义 id（缺省自动生成；带已存在 id=替换）。' },
        name: { type: 'string', description: '名称（必填）。' },
        category: {
          type: 'string',
          // 阶段过滤（笔刷约束系统批D）：deps.stage 给了就把 enum 收窄到本阶段可画类目；地形阶段本工具
          // 整个不装配（不会走到这里）；未给=全量 8 类（旧版 draft/draw 两段式派发零回归）。
          enum: deps.stage ? STAGE_PATH_CATEGORIES[deps.stage] : ['river', 'road', 'street', 'wall', 'border', 'canal', 'trail', 'bridge'],
          description: 'river=河流(地形层·宜 from 挂山地/湖泊、to 挂海/湖/干流；源头宜出自山谷——两脊之间/山体边缘凹处；可选 widthProfile 定制变宽水体宽度剖面，缺省沿程自动递增)；road=官道(宜 from/to 挂城门/城区/渡口，城外延伸不悬空)；street=街道(建议 minScale≈0.1，宜 2 横 2 纵起步贯穿城区)；wall=城墙/关隘(实线厚重·环形墙首尾必须同点闭合)；border=疆界(civic层·灰虚点线·国境/领地界，宜沿山脊或河流走)；canal=运河(civic层·水蓝·人工水道多近直线·同 river 支持 widthProfile，缺省近恒宽)；trail=小径(civic层·细弱线·人行小道，蜿蜒度可比官道更高)；bridge=桥(civic层·短线跨水，两端须落地陆地，宜近直)。'
        },
        from: {
          type: 'object',
          description: '起点（推荐）：挂既有要素自动贴合——{featureId}（region 贴岸/marker 落点/path 汇入最近点）或直给 {at:[x,y]}。与 to 必须同时给。与 arc/pts 三选一。',
          properties: { featureId: { type: 'string' }, at: { type: 'array', items: { type: 'number' } } }
        },
        to: {
          type: 'object',
          description: '终点（推荐）：同 from 用法。河流终点挂海洋/湖泊 region 是治「河海断连」的关键——系统把端点吸附到区域边界内侧，不再靠猜坐标。',
          properties: { featureId: { type: 'string' }, at: { type: 'array', items: { type: 'number' } } }
        },
        waypoints: { type: 'array', description: '途经粗坐标（可选）[[x,y],…]——只影响大致走势，精确蜿蜒由系统生成。', items: { type: 'array', items: { type: 'number' } } },
        meander: { type: 'number', description: '蜿蜒度 0~1（可选，缺省按 category：river 0.5/road 0.25/trail 0.35/border 0.2/canal 0.1/wall 0.08/bridge 0.03/street 0.15）。' },
        seed: { type: 'string', description: '造形种子（可选，缺省用 id∥name·同 seed 永远同蜿蜒形状）。' },
        widthProfile: {
          type: 'object',
          description: '仅 river/canal 生效（可选）：变宽水体宽度剖面，源头→末端沿程递增，不给则按 category 缺省剖面（river 源头约6m→末端约160m；canal 源头约10m→末端约14m 近恒宽）。给中心线（pts/from-to/arc 均可），系统另算两岸闭合水面（geometry.pts 仍是中心线，不受影响）。',
          properties: {
            sourceWidthM: { type: 'number', description: '源头处满宽（米）。' },
            mouthWidthM: { type: 'number', description: '末端（入海/入湖口）处满宽（米）。' },
            growthExponent: { type: 'number', description: '沿程递增曲线形状指数（可选，缺省 0.5）。' }
          }
        },
        arc: {
          type: 'object',
          description: '规整圆弧出口（城墙弧段/环形关隘等"圆弧不歪扭"诉求专用）：{center:[x,y], radiusM, fromAngleDeg, toAngleDeg（角度制，0=正东、顺时针为正）, jitter?(0~0.05，缺省0=零抖动最规整)}。与 from/to、pts 三选一。',
          properties: {
            center: { type: 'array', items: { type: 'number' } },
            radiusM: { type: 'number' },
            fromAngleDeg: { type: 'number' },
            toAngleDeg: { type: 'number' },
            jitter: { type: 'number' }
          }
        },
        pts: { type: 'array', description: '高级精修出口：仅当 from/to/arc 表达不了想要的走向时用，直给折线顶点 [[x,y],…]（≥2点）。与 from/to、arc 三选一。', items: { type: 'array', items: { type: 'number' } } },
        style: { type: 'object', description: '渲染微调（可选）：labelAt/labelMin/minScale 等。' },
        links: { type: 'object', description: '状态锚点（可选）。' },
        override: { type: 'string', enum: ['terraform'], description: '高门槛改造通道（可选·仅阶段管线 staged 模式且已获人工确认才有意义）：改动已确认阶段锁定的既有要素时才需要，未获批准会被硬拒。' }
      },
      required: ['name', 'category']
    },
    validateArgs: (args) => {
      if (!String(args.name || '').trim()) return 'drawMapPath 缺少 name'
      if (!PATH_CATEGORIES.has(String(args.category || ''))) return 'category 必须是 river/road/street/wall/border/canal/trail/bridge'
      // 阶段过滤（笔刷约束系统批D）：deps.stage 给了才卡，理由同 drawMapRegion。
      if (deps.stage && !STAGE_PATH_CATEGORIES[deps.stage].includes(String(args.category || ''))) {
        return `当前阶段「${deps.stage}」不开放 path 类目「${args.category}」——本阶段可画：${STAGE_PATH_CATEGORIES[deps.stage].join('/') || '（无，地形阶段没有线状笔刷）'}`
      }
      const hasPts = args.pts !== undefined
      const hasFromTo = args.from !== undefined || args.to !== undefined
      const hasArc = args.arc !== undefined
      const modeCount = [hasPts, hasFromTo, hasArc].filter(Boolean).length
      if (modeCount === 0) return 'drawMapPath 必须给 pts、from+to、arc 三者之一'
      if (modeCount > 1) return 'pts / from+to / arc 只能三选一'
      if (hasFromTo && (args.from === undefined || args.to === undefined)) return 'from 和 to 必须同时给出'
      if (hasArc) {
        const arc = pickObjectArg(args.arc)
        if (!arc || !Array.isArray(arc.center) || arc.center.length < 2) return 'arc 需要 center:[x,y]'
        if (!Number.isFinite(Number(arc.radiusM)) || Number(arc.radiusM) <= 0) return 'arc 需要 radiusM（正数）'
        if (!Number.isFinite(Number(arc.fromAngleDeg)) || !Number.isFinite(Number(arc.toAngleDeg))) return 'arc 需要 fromAngleDeg/toAngleDeg（数值角度）'
      }
      if (args.widthProfile !== undefined) {
        const wp = pickObjectArg(args.widthProfile)
        if (!wp || !Number.isFinite(Number(wp.sourceWidthM)) || Number(wp.sourceWidthM) <= 0) return 'widthProfile 需要 sourceWidthM（正数·米）'
        if (!Number.isFinite(Number(wp.mouthWidthM)) || Number(wp.mouthWidthM) <= 0) return 'widthProfile 需要 mouthWidthM（正数·米）'
      }
      return null
    },
    execute: async (toolCall) => {
      const args = toolCall.args as Record<string, unknown>
      const bundle = await loadBundle()
      const sheet = resolveSheet(bundle, args.sheetId)
      if (!sheet) return toolError('目标图纸不存在——先 createMapSheet')
      const category = String(args.category)
      const id = String(args.id || '').trim()
      // Lock 保护硬门（笔刷约束系统批D）：id 命中既有要素=重画替换（几何写），早于造形计算先查越阶段锁。
      if (id) {
        const existing = sheet.features.find((f) => f.id === id) || null
        const lockRejection = checkStageLock(existing, args, sheet, deps, `path「${String(args.name || id).trim()}」（${id}）`)
        if (lockRejection) return lockRejection
      }

      let pts: MapPoint[]
      let meta: Record<string, unknown> | undefined
      if (args.arc !== undefined) {
        const arc = pickObjectArg(args.arc) as Record<string, unknown>
        const center = parsePointArg(arc.center)
        if (!center) return toolError('arc.center 必须是合法的 [x,y] 数值点')
        const radiusM = Number(arc.radiusM)
        const fromAngleDeg = Number(arc.fromAngleDeg)
        const toAngleDeg = Number(arc.toAngleDeg)
        const jitter = Number.isFinite(Number(arc.jitter)) ? Number(arc.jitter) : undefined
        const seed = String(args.seed || '').trim() || id || String(args.name || '').trim()
        pts = buildArcPath({
          center, radiusM,
          fromAngle: fromAngleDeg * Math.PI / 180,
          toAngle: toAngleDeg * Math.PI / 180,
          seed,
          ...(jitter !== undefined ? { jitter } : {})
        })
        meta = { shape: { kind: 'arc', center, radiusM, fromAngleDeg, toAngleDeg, jitter, seed } }
      } else if (args.from !== undefined || args.to !== undefined) {
        const fromArg = pickObjectArg(args.from)
        const toArg = pickObjectArg(args.to)
        if (!fromArg || !toArg) return toolError('from 和 to 必须同时给出，且均为对象 {at:[x,y]} 或 {featureId}')
        const fromRough = resolveRoughEndpoint(bundle, fromArg)
        if ('error' in fromRough) return toolError(fromRough.error)
        const toRough = resolveRoughEndpoint(bundle, toArg)
        if ('error' in toRough) return toolError(toRough.error)
        const waypoints = args.waypoints === undefined ? [] : parsePointListArg(args.waypoints, 1)
        if (args.waypoints !== undefined && !waypoints) return toolError('waypoints 必须是至少 1 个 [x,y] 数值点')
        const waypointList = waypoints || []
        const fromApproach = waypointList[0] || toRough.point
        const toApproach = waypointList[waypointList.length - 1] || fromRough.point
        const fromPoint = refineEndpoint(fromRough, fromApproach)
        const toPoint = refineEndpoint(toRough, toApproach)
        const seed = String(args.seed || '').trim() || id || String(args.name || '').trim()
        // 蜿蜒缺省改查 BRUSH_SPEC.meanderDefault（笔刷约束系统批A·收编自旧硬编 if/else，8 类目数值不变；
        // wall/bridge/canal 蜿蜒最低：工程线，近直/规整观感才对；trail 最高：人行小道天然更曲折）。
        const defaultMeander = BRUSH_SPEC[category]?.meanderDefault ?? 0.15
        const meander = args.meander === undefined ? defaultMeander : Number(args.meander)
        if (!Number.isFinite(meander) || meander < 0 || meander > 1) return toolError('meander 必须是 0~1 之间的数值')
        pts = buildMeanderPath({ from: fromPoint, to: toPoint, waypoints: waypointList, meander, seed })
        meta = { shape: { kind: 'meander', from: fromArg, to: toArg, waypoints: waypointList, meander, seed } }
      } else {
        const rawPts = parsePointListArg(args.pts, 2)
        if (!rawPts) return toolError('必须给 pts（≥2 点，高级精修出口）、from+to（推荐，自动挂接吸附）或 arc（规整圆弧）之一')
        pts = rawPts
        // pts 精修出口打上造形来源标记（笔刷约束系统批A 新增）：闭合环诉求（border/wall）只在这个"手画/精修"出口
        // 判定——arc（规整弧墙）与 from/to（直墙段等）天然合法开放，不该被强行闭合；auditMap 的未闭合环体检
        // 据此 meta.shape.kind 区分"疑似想画环却漏合"与"本就该开放"两种情况，不能只看首尾点是否相同瞎猜意图。
        meta = { shape: { kind: 'pts' } }
      }

      // 宽度剖面（笔刷约束系统批W）：仅 river/canal 生效——把 widthProfile（显式给或按 BRUSH_SPEC 缺省）
      // 写进 meta.shape.widthProfile（meta 是 schemaless 透传字段，天然经得住服务端往返）；真正的两岸闭合
      // 多边形（bank）不落库，由渲染端/画廊按「中心线+seed+widthProfile」重新派生（bank 单向派生铁律，
      // 见 mapGeometry.ts MapFeature.bank 注释）——geometry.pts 中心线才是持久真值，一行不受此影响。
      if ((category === 'river' || category === 'canal') && meta && typeof meta.shape === 'object' && meta.shape) {
        const explicitWp = pickObjectArg(args.widthProfile)
        const defaultWp = BRUSH_SPEC[category].widthProfileDefault ?? { sourceWidthM: 10, mouthWidthM: 60, growthExponent: 0.5 }
        const widthProfile: WidenSpineWidthProfile = explicitWp
          ? {
              sourceWidthM: Number(explicitWp.sourceWidthM),
              mouthWidthM: Number(explicitWp.mouthWidthM),
              growthExponent: Number.isFinite(Number(explicitWp.growthExponent)) ? Number(explicitWp.growthExponent) : defaultWp.growthExponent
            }
          : defaultWp
        ;(meta.shape as Record<string, unknown>).widthProfile = widthProfile
      }

      // closed_ring 硬门（笔刷约束系统批A 新增·仅 pts 精修出口生效）：border/wall 首尾未闭合→自动补闭
      // （违规分流三路之"几何可自动修正"，同放置卫兵"自动推开"同哲学，不硬拒绝）。
      let closeRingNote = ''
      if (BRUSH_SPEC[category].connectivity.includes('closed_ring') && meta?.shape && (meta.shape as { kind?: string }).kind === 'pts' && !isClosedRing(pts)) {
        pts = closeRing(pts)
        closeRingNote = ' 首尾未闭合，已自动补闭成环。'
      }

      // allowedSurface 门（笔刷约束系统批A 新增·研究_01 §5"可画地表"）：land 类目主体落水域，
      // 美观与迅捷优先（2026-07-13 用户拍板）不再硬拒——放行落笔+回执附注建议改桥，不烧一轮模型重想。
      // 只在存在既有水域要素时检查（无水域=无从判断，跳过）；按"过半顶点落水域"判定"主体"，避免端点轻触误伤。
      let allowedSurfaceNote = ''
      if (BRUSH_SPEC[category].allowedSurface === 'land') {
        const waterRegions = sheet.features.filter((f) => f.kind === 'region' && f.category === 'water' && (!id || f.id !== id))
        if (waterRegions.length && pts.length) {
          const submergedCount = pts.filter(([x, y]) => waterRegions.some((wr) => pointInPoly(x, y, (wr.geometry?.pts || []) as MapPoint[]))).length
          const fraction = submergedCount / pts.length
          if (fraction > 0.5) {
            allowedSurfaceNote = ` ⚠️已放行：约 ${Math.round(fraction * 100)}% 的顶点落在水域内（${submergedCount}/${pts.length}）——${category} 类目通常只画陆地，若确需跨越水域建议改用 bridge（桥）类目，或调整走向绕开水域。`
          }
        }
      }

      // 水文硬门（批C·river/canal）：落笔前跑 validateRiverPath——只差 bad-terminus 且附近(≤150m)确有
      // 水域→复用 snapIntoRegion 自动收尾（违规分流三路之"几何可自动修正"）；明确非法（逆坡/附近无水域可收）
      // →硬拒+建议线+"或改内流湖"话术。canal 同 river 但 upTolM 放宽到 2m（人工水道语义，容许闸控/轻微逆坡）。
      let hydrologyNote = ''
      if (category === 'river' || category === 'canal') {
        const grid = resolveSheetAnalysisGrid(deps.worldId, sheet)
        const upTolM = category === 'canal' ? 2 : 0.5
        let riverCheck = validateRiverPath(pts, grid, { upTolM })
        if (!riverCheck.ok && riverCheck.problems.every((p) => p.kind === 'bad-terminus')) {
          const nearestWater = findNearestWaterRegion(pts[pts.length - 1], sheet, id)
          if (nearestWater && nearestWater.distance <= 150) {
            const waterPts = (nearestWater.region.geometry?.pts || []) as MapPoint[]
            pts = [...pts.slice(0, -1), snapIntoRegion(pts[pts.length - 1], waterPts, 30)]
            hydrologyNote = ` 终点未精确落入水域（原距约${Math.round(nearestWater.distance)}m），已自动吸附到「${nearestWater.region.name}」。`
            riverCheck = validateRiverPath(pts, grid, { upTolM })
          }
        }
        if (!riverCheck.ok) {
          const suggestParts: string[] = []
          if (riverCheck.suggestion?.length) suggestParts.push('可参考 details.suggestionLine 给出的建议线改道')
          if (riverCheck.allowInlandLakeTerminus) suggestParts.push('或将终点改为内流湖')
          return buildViolationReceipt({
            ruleId: 'hydrology-invalid-path',
            location: `path「${String(args.name).trim()}」（${category}）`,
            reason: describeRiverProblems(riverCheck.problems),
            suggestion: suggestParts.length ? suggestParts.join('，') : '调整走向使其顺应地势并接到海/湖/图缘',
            details: {
              problems: riverCheck.problems.map((p) => ({ kind: p.kind, x: Math.round(p.at.x), y: Math.round(p.at.y), detailM: p.detailM ?? null })),
              suggestionLine: riverCheck.suggestion ? riverCheck.suggestion.map(([x, y]) => [Math.round(x), Math.round(y)]) : null
            }
          })
        }
      }

      // 坡度门（批C·road/street/trail/canal）：滑动窗口坡度（窗口=max(2×cellSize,500m)，防台阶单格假
      // 峭壁）超 BRUSH_SPEC.slopeHardMaxPct 不再硬拒（美观与迅捷优先·2026-07-13 用户拍板）——放行落笔+
      // 回执附注建议改索道/天梯或改道；落在 slopeGradeBands 高档仍进 auditMap 体检 warning 供事后复核。
      let slopeNote = ''
      const slopeSpec = BRUSH_SPEC[category]
      if (slopeSpec.slopeMode === 'hard_ceiling' && slopeSpec.slopeHardMaxPct !== undefined) {
        const grid = resolveSheetAnalysisGrid(deps.worldId, sheet)
        const hardMaxRatio = slopeSpec.slopeHardMaxPct / 100
        const gradeCheck = validatePathGrade(pts, grid, { hardMaxRatio })
        if (!gradeCheck.ok) {
          const worst = gradeCheck.problems.reduce((a, b) => (b.gradeRatio > a.gradeRatio ? b : a))
          slopeNote = ` ⚠️已放行：坐标(${Math.round(worst.at.x)},${Math.round(worst.at.y)})附近约 ${Math.round(worst.windowM)}m 窗口内坡度约 ${Math.round(worst.gradeRatio * 100)}%，超出 ${category} 硬上限 ${slopeSpec.slopeHardMaxPct}%——建议后续改用索道/天梯类特殊笔刷跨越，或改走坡度更缓的路线。`
        }
      }

      // 桥接岸门（批C·bridge）：两端点宜落陆地（非 water region 内，findNearestLegalBank 辅助自动吸附，
      // 纠正保留）；路径宜跨水——网格面状水域(findContinuousWaterRuns) 或与既有 river/canal path 矢量相交
      // (segmentsIntersect)，二者满足其一即算跨水（网格看不见 path 河，这是已知语义，故补矢量相交这条）。
      // 找不到合法接岸点/未检测到跨水不再硬拒（美观与迅捷优先·2026-07-13 用户拍板）——放行落笔+回执附注。
      let bridgeNote = ''
      if (category === 'bridge') {
        const grid = resolveSheetAnalysisGrid(deps.worldId, sheet)
        const bankFix = (point: MapPoint, which: string): MapPoint => {
          if (!pointOnWaterRegion(point, sheet)) return point
          const bank = findNearestLegalBank(point, grid)
          if (!bank.found || !bank.point) {
            bridgeNote += ` ⚠️已放行：${which}落在水域内，附近搜索未找到坡度不超限的合法接岸陆地——建议后续调整该端点位置，或缩短桥身贴近真实岸线。`
            return point
          }
          bridgeNote += ` ${which}已自动吸附到最近接岸点（原落水域内，距约${Math.round(bank.distanceM || 0)}m）。`
          return bank.point
        }
        pts[0] = bankFix(pts[0], '起点')
        pts[pts.length - 1] = bankFix(pts[pts.length - 1], '终点')

        const crossesGridWater = findContinuousWaterRuns(pts, grid).length > 0
        const crossesPathWater = sheet.features.some((f) =>
          f.kind === 'path' && (f.category === 'river' || f.category === 'canal') && (!id || f.id !== id) &&
          polylineCrossesPolyline(pts, (f.geometry?.pts || []) as MapPoint[])
        )
        if (!crossesGridWater && !crossesPathWater) {
          bridgeNote += ' ⚠️已放行：未检测到跨越任何水域（网格未见面状水域、也未与河流/运河路径相交）——若不跨水建议改用 road/street 类目；若确实跨水，检查端点/走向是否精确覆盖水体。'
        }
      }

      // 阶段出生戳（笔刷约束系统批D）：deps.stage 给了才打，塞进既有 meta（不覆盖 shape 等已有字段）。
      if (deps.stage) meta = { ...(meta || {}), stage: deps.stage }
      const style = pickObjectArg(args.style)
      const links = pickObjectArg(args.links)
      const saved = await saveFeature({
        ...(id ? { id } : {}),
        sheetId: sheet.id,
        kind: 'path',
        category,
        name: String(args.name).trim(),
        layer: inferLayer(category, args.layer),
        geometry: { pts },
        ...(meta ? { meta } : {}),
        ...(style ? { style } : {}),
        ...(links ? { links } : {})
      })
      bumpTerrainRevision(deps.worldId) // 批C：地形写版本号自增，网格 memo 据此失效重算
      const overflowNote = exploredOverflowNote(sheet, overflowCheckPoints('path', null, pts))
      return { content: `已画 path「${saved.name}」（${saved.id}·${category}·${pts.length} 顶点）。${closeRingNote}${allowedSurfaceNote}${hydrologyNote}${slopeNote}${bridgeNote}${overflowNote}`, details: { kind: 'huiyuFeatureSaved', featureId: saved.id } }
    }
  }

  const drawMapMarker: ToolDefinition = {
    name: 'drawMapMarker',
    brief: '画点状要素（建筑/组织驻地/地标/渡口/角色位置/都城/城堡/神庙/遗迹/矿坑/洞穴/港口/城门/驿站/哨塔）：at=[x,y] 直给或 anchor 相对定位。角色位置用 category=character；需要关联状态栏时在 links 挂 {panelId:状态栏id}，不要用角色 id 猜宿主。',
    schema: {
      type: 'object',
      properties: {
        sheetId: { type: 'string', description: '图纸 id（缺省=主图纸）。' },
        id: { type: 'string', description: '语义 id（缺省自动生成；带已存在 id=替换）。' },
        name: { type: 'string', description: '名称（必填）。' },
        category: {
          type: 'string',
          enum: ['building', 'organization', 'landmark', 'ferry', 'character', 'capital', 'castle', 'temple', 'ruin', 'mine', 'cave', 'port', 'gate', 'inn', 'tower'],
          description: '类别：building=建筑；organization=组织驻地；landmark=地标；ferry=渡口(贴内河/湖岸，量级小于port)；character=角色当前位置；capital=都城(一国首府·宜落在都城urban区域内)；castle=城堡；temple=神庙；ruin=遗迹(废弃建筑/古战场)；mine=矿坑(宜贴山地)；cave=洞穴(宜贴山地)；port=港口(海港·区别于ferry小渡口·宜贴海岸线)；gate=城门(关隘/城墙出入口·宜落在城墙与道路交点)；inn=驿站(旅途歇脚·宜沿官道分布)；tower=哨塔(瞭望/戍守·宜沿疆界或城墙分布)。'
        },
        at: { type: 'array', items: { type: 'number' }, description: '位置 [x,y]（米）。与 anchor 二选一。' },
        anchor: {
          type: 'object',
          description: '相对定位：{featureId, bearing:汉字八方位, distanceM}。',
          properties: {
            featureId: { type: 'string' },
            bearing: { type: 'string' },
            distanceM: { type: 'number' }
          }
        },
        style: { type: 'object', description: '渲染微调（可选）：minScale（街区级建筑建议 0.1~0.11）/labelDx/labelDy 等。' },
        links: { type: 'object', description: '状态锚点（可选）：{panelId?/hostType?/hostId?}。' },
        override: { type: 'string', enum: ['terraform'], description: '高门槛改造通道（可选·仅阶段管线 staged 模式且已获人工确认才有意义）：改动已确认阶段锁定的既有要素时才需要，未获批准会被硬拒。' }
      },
      required: ['name', 'category']
    },
    validateArgs: (args) => {
      if (!String(args.name || '').trim()) return 'drawMapMarker 缺少 name'
      if (!MARKER_CATEGORIES.has(String(args.category || ''))) return 'category 必须是 building/organization/landmark/ferry/character/capital/castle/temple/ruin/mine/cave/port/gate/inn/tower'
      // 阶段过滤（笔刷约束系统批D）：全部 marker 类目只在人文阶段开放（地形/水系阶段没有意义）；正常情况下
      // buildHuiyuMapTools 已按 stage 整个不装配本工具，这里是防御性兜底（belt and suspenders）。
      if (deps.stage && deps.stage !== 'civic') return `当前阶段「${deps.stage}」不开放 marker 类目——marker 只在人文阶段可用`
      return null
    },
    execute: async (toolCall) => {
      const args = toolCall.args as Record<string, unknown>
      const bundle = await loadBundle()
      const sheet = resolveSheet(bundle, args.sheetId)
      if (!sheet) return toolError('目标图纸不存在——先 createMapSheet')
      const placed = resolvePlacement(bundle, args, 'at')
      if ('error' in placed) return toolError(placed.error)
      const id = String(args.id || '').trim()
      const category = String(args.category)
      // Lock 保护硬门（笔刷约束系统批D）：id 命中既有要素=替换（几何写：位置/类目都可能变），先查越阶段锁。
      if (id) {
        const existing = sheet.features.find((f) => f.id === id) || null
        const lockRejection = checkStageLock(existing, args, sheet, deps, `marker「${String(args.name || id).trim()}」（${id}）`)
        if (lockRejection) return lockRejection
      }

      // 水域卫兵：allowedSurface='land' 的类目落点若在 water region 内，自动推到岸边（笔刷约束系统批A 改查
      // BRUSH_SPEC，旧白名单 ferry/port/character 收编为这三者 allowedSurface='both'，行为不变——
      // ferry/port 贴水是正常语义·港口本就建在水岸边；character 可能在船上）。
      let point = placed.point
      let pushNote = ''
      if (BRUSH_SPEC[category]?.allowedSurface === 'land') {
        for (const feature of sheet.features) {
          if (feature.kind !== 'region' || feature.category !== 'water') continue
          const waterPts = (feature.geometry?.pts || []) as MapPoint[]
          if (waterPts.length < 3 || !pointInPoly(point[0], point[1], waterPts)) continue
          const shore = nearestPointOnPolyline(point, [...waterPts, waterPts[0]]).point
          const wc = centroid(waterPts)
          const dx = shore[0] - wc[0]; const dy = shore[1] - wc[1]
          const len = Math.hypot(dx, dy) || 1
          point = [shore[0] + dx / len * 30, shore[1] + dy / len * 30]
          pushNote = ' ⚠️ 落点在水域内，已自动推到岸边。'
          break
        }
      }

      const style = pickObjectArg(args.style)
      const links = pickObjectArg(args.links)
      const saved = await saveFeature({
        ...(id ? { id } : {}),
        sheetId: sheet.id,
        kind: 'marker',
        category,
        name: String(args.name).trim(),
        layer: inferLayer(category, args.layer),
        geometry: { pts: [point] },
        // 阶段出生戳（笔刷约束系统批D）：deps.stage 给了才打（marker 只在 civic 阶段可画，恒为 'civic'）。
        ...(deps.stage ? { meta: { stage: deps.stage } } : {}),
        ...(style ? { style } : {}),
        ...(links ? { links } : {})
      })
      bumpTerrainRevision(deps.worldId) // 批C：地形写版本号自增，网格 memo 据此失效重算
      const overflowNote = exploredOverflowNote(sheet, overflowCheckPoints('marker', null, [point]))
      return { content: `已放 marker「${saved.name}」（${saved.id}·${category}·位于(${Math.round(point[0])},${Math.round(point[1])})）。${pushNote}${overflowNote}`, details: { kind: 'huiyuFeatureSaved', featureId: saved.id } }
    }
  }

  const updateMapFeature: ToolDefinition = {
    name: 'updateMapFeature',
    brief: '增量改既有要素：改名/挪 marker 位置（角色移动的标准动作·at 或 anchor）/换 style/换 links。region 要重造形请用 drawMapRegion 带同 id 重画（保形状就复用原 seed）。',
    schema: {
      type: 'object',
      properties: {
        featureId: { type: 'string', description: '要素 id（必填）。' },
        name: { type: 'string', description: '新名称（可选）。' },
        at: { type: 'array', items: { type: 'number' }, description: '新位置 [x,y]（仅 marker·可选）。' },
        anchor: { type: 'object', description: '新位置相对定位（仅 marker·可选）：{featureId,bearing,distanceM}。', properties: { featureId: { type: 'string' }, bearing: { type: 'string' }, distanceM: { type: 'number' } } },
        style: { type: 'object', description: '整体替换 style（可选）。' },
        links: { type: 'object', description: '整体替换 links（可选）。' },
        override: { type: 'string', enum: ['terraform'], description: '高门槛改造通道（可选·仅阶段管线 staged 模式且已获人工确认才有意义）：挪动已确认阶段锁定的 marker 时才需要，未获批准会被硬拒（改名/换 style/links 不受阶段锁约束，随时可改）。' }
      },
      required: ['featureId']
    },
    validateArgs: (args) => (String(args.featureId || '').trim() ? null : 'updateMapFeature 缺少 featureId'),
    execute: async (toolCall) => {
      const args = toolCall.args as Record<string, unknown>
      const featureId = String(args.featureId || '').trim()
      const bundle = await loadBundle()
      const existing = findFeature(bundle, featureId)
      if (!existing) return toolError(`要素 ${featureId} 不存在——先 readMapSummary 拿准确 id`)
      const item: Record<string, unknown> = { id: featureId }
      if (String(args.name || '').trim()) item.name = String(args.name).trim()
      const wantsMove = args.at !== undefined || args.anchor !== undefined
      if (wantsMove) {
        if (existing.kind !== 'marker') return toolError(`要素 ${featureId} 是 ${existing.kind}，只有 marker 能用 at/anchor 挪位；region 请用 drawMapRegion 带同 id 重画`)
        // Lock 保护硬门（笔刷约束系统批D）：挪位=几何写，改名/换 style/links 不算（GIS"仅改属性"式豁免，
        // 呼应研究_04 产出①的正交维度矩阵——本 v1 只落地"挪位/删除受锁、纯属性编辑不受锁"这一刀）。
        const ownerSheet = bundle.sheets.find((s) => s.id === existing.sheetId)
        if (ownerSheet) {
          const lockRejection = checkStageLock(existing, args, ownerSheet, deps, `marker「${existing.name}」（${featureId}）`)
          if (lockRejection) return lockRejection
        }
        const placed = resolvePlacement(bundle, args, 'at')
        if ('error' in placed) return toolError(placed.error)
        item.geometry = { pts: [placed.point] }
      }
      const style = pickObjectArg(args.style)
      const links = pickObjectArg(args.links)
      if (style) item.style = style
      if (links) item.links = links
      if (Object.keys(item).length === 1) return toolError('updateMapFeature 至少给一项要改的内容（name/at/anchor/style/links）')
      const saved = await saveFeature(item)
      bumpTerrainRevision(deps.worldId) // 批C：地形写版本号自增，网格 memo 据此失效重算
      const center = featureCenter(saved)
      return {
        content: `要素「${saved.name}」（${saved.id}）已更新${wantsMove && center ? `，现位于(${Math.round(center[0])},${Math.round(center[1])})` : ''}。`,
        details: { kind: 'huiyuFeatureSaved', featureId: saved.id }
      }
    }
  }

  const deleteMapFeature: ToolDefinition = {
    name: 'deleteMapFeature',
    brief: '删除要素（软删可追溯）。只在剧情明确抹除某地物（烧毁/拆除且不再需要显示）时用；角色离开某地不是删除，是挪 marker。',
    schema: {
      type: 'object',
      properties: {
        featureId: { type: 'string', description: '要素 id（必填）。' },
        override: { type: 'string', enum: ['terraform'], description: '高门槛改造通道（可选·仅阶段管线 staged 模式且已获人工确认才有意义）：删除已确认阶段锁定的要素时才需要，未获批准会被硬拒。' }
      },
      required: ['featureId']
    },
    validateArgs: (args) => (String(args.featureId || '').trim() ? null : 'deleteMapFeature 缺少 featureId'),
    execute: async (toolCall) => {
      const args = toolCall.args as Record<string, unknown>
      const featureId = String(args.featureId || '').trim()
      // Lock 保护硬门（笔刷约束系统批D）：删除恒算几何写（最彻底的一种），先取现状核对越阶段锁——
      // 旧版本删除不查现状直接落，本批新增这一步查询（多一次 loadBundle，可接受的代价）。
      const bundle = await loadBundle()
      const existing = findFeature(bundle, featureId)
      if (existing) {
        const ownerSheet = bundle.sheets.find((s) => s.id === existing.sheetId)
        if (ownerSheet) {
          const lockRejection = checkStageLock(existing, args, ownerSheet, deps, `要素「${existing.name}」（${featureId}）`)
          if (lockRejection) return lockRejection
        }
      }
      await deleteWorldMapFeatureRemote(deps.worldId, featureId, deps.runMeta)
      bumpTerrainRevision(deps.worldId) // 批C：地形写版本号自增，网格 memo 据此失效重算
      return { content: `要素 ${featureId} 已删除。`, details: { kind: 'huiyuFeatureDeleted', featureId } }
    }
  }

  // ── 宏笔刷四件（笔刷约束系统批E·2026-07-12）：一笔生成一整套关联要素，模型只给语义参数，自然形态
  // 与合法性交给 mapMacroBrushes.ts 的确定性生成器（构造性合法优先，见该文件头声明）。v1 只能新建
  // （不支持带 id 重画/覆盖既有要素，故不接 checkStageLock——新建从不触犯 Lock）；阶段归属见
  // MACRO_BRUSH_STAGE；量帽/降级说明由生成器自身给出，工具层只负责落库+回执拼装。

  const drawMountainChain: ToolDefinition = {
    name: 'drawMountainChain',
    brief: '宏笔刷：一笔生成一整条嵌套山系（底座+高海拔核心自动嵌套裁剪+支脉分叉），比逐条 drawMapRegion 更快出"主脊高两翼低"的层叠观感。给一串 anchor 描出整体走向（2~6 个点足够），系统自动产出底座/核心/若干支脉共 15 件以内的要素套装。仅地形阶段可用。',
    schema: {
      type: 'object',
      properties: {
        sheetId: { type: 'string', description: '图纸 id（缺省=主图纸）。' },
        name: { type: 'string', description: '名称前缀（必填·如"玄岳"，各要素会自动加"·底座/核心/支脉N"后缀）。' },
        anchors: { type: 'array', description: '走向骨架 [[x,y],…]（必填·≥2 点，描出山脉链整体走势，2~6 点足够）。', items: { type: 'array', items: { type: 'number' } } },
        chainWidthM: { type: 'number', description: '底座满宽（米·必填，对照知识库 mountain 量级）。' },
        baseElevationM: { type: 'number', description: '底座海拔（米·可选，缺省 1400）。' },
        coreElevationM: { type: 'number', description: '高海拔核心海拔（米·可选，缺省=底座+1600）。' },
        coreWidthRatio: { type: 'number', description: '核心宽度=底座宽度的比例 0~1（可选，缺省 0.45）。' },
        coreLengthRatio: { type: 'number', description: '核心覆盖主链弧长的比例，居中截取（可选，缺省 0.5）。' },
        spurProbability: { type: 'number', description: '每个候选点生成支脉的概率 0~1（可选，缺省 0.5）。' },
        spurAngleDeg: { type: 'number', description: '支脉相对脊线法向的角度扰动上限（度·可选，缺省 35）。' },
        spurLengthRatio: { type: 'number', description: '支脉长度=底座满宽的倍数（可选，缺省 2.2）。' },
        seed: { type: 'string', description: '造形种子（可选，缺省用 name·同 seed 永远同形状）。' }
      },
      required: ['name', 'anchors', 'chainWidthM']
    },
    validateArgs: (args) => {
      if (!String(args.name || '').trim()) return 'drawMountainChain 缺少 name（名称前缀）'
      if (!parsePointListArg(args.anchors, 2)) return 'drawMountainChain 需要 anchors（至少 2 个 [x,y] 数值点，描出走向）'
      if (!Number.isFinite(Number(args.chainWidthM)) || Number(args.chainWidthM) <= 0) return 'drawMountainChain 需要 chainWidthM（正数·米）'
      if (deps.stage && deps.stage !== MACRO_BRUSH_STAGE.drawMountainChain) {
        return `当前阶段「${deps.stage}」不开放 drawMountainChain（山脉链只在地形阶段可用）`
      }
      return null
    },
    execute: async (toolCall) => {
      const args = toolCall.args as Record<string, unknown>
      const bundle = await loadBundle()
      const sheet = resolveSheet(bundle, args.sheetId)
      if (!sheet) return toolError('目标图纸不存在——先 createMapSheet')
      const anchors = parsePointListArg(args.anchors, 2) as MapPoint[]
      const name = String(args.name).trim()
      const seed = String(args.seed || '').trim() || name
      const result = buildMountainChain({
        anchors, chainWidthM: Number(args.chainWidthM), namePrefix: name, seed,
        ...(Number.isFinite(Number(args.baseElevationM)) ? { baseElevationM: Number(args.baseElevationM) } : {}),
        ...(Number.isFinite(Number(args.coreElevationM)) ? { coreElevationM: Number(args.coreElevationM) } : {}),
        ...(Number.isFinite(Number(args.coreWidthRatio)) ? { coreWidthRatio: Number(args.coreWidthRatio) } : {}),
        ...(Number.isFinite(Number(args.coreLengthRatio)) ? { coreLengthRatio: Number(args.coreLengthRatio) } : {}),
        ...(Number.isFinite(Number(args.spurProbability)) ? { spurProbability: Number(args.spurProbability) } : {}),
        ...(Number.isFinite(Number(args.spurAngleDeg)) ? { spurAngleDeg: Number(args.spurAngleDeg) } : {}),
        ...(Number.isFinite(Number(args.spurLengthRatio)) ? { spurLengthRatio: Number(args.spurLengthRatio) } : {})
      })
      if (!result.features.length) return toolError(`drawMountainChain 未能生成任何要素：${result.notes.join('；') || '未知原因'}`)
      const persisted = await persistMacroBrushResult(sheet, result)
      const spurCount = Number(result.stats.spurCount) || 0
      const headline = `已生成山脉链「${name}」共 ${persisted.savedIds.length} 个要素（底座+核心${spurCount ? `+${spurCount}条支脉` : ''}）。`
      return {
        content: renderMacroBrushReceipt(headline, sheet, result, persisted.auditNote),
        details: { kind: 'huiyuMacroBrushSaved', featureIds: persisted.savedIds, stats: result.stats }
      }
    }
  }

  const drawRiverSystem: ToolDefinition = {
    name: 'drawRiverSystem',
    brief: '宏笔刷：从源头一笔生成一整棵水系树（干流沿地势自动追踪下坡+支流以自然汇入角挂接吸附+Strahler 分级定河宽），比逐条 drawMapPath 画河更快且天然顺流合法。source 给源头附近坐标，系统读分析网格自动找下坡路径，不需要手工试坐标。仅水系阶段可用。',
    schema: {
      type: 'object',
      properties: {
        sheetId: { type: 'string', description: '图纸 id（缺省=主图纸）。' },
        name: { type: 'string', description: '名称前缀（必填·如"玄岳水系"，干流/支流会自动加后缀）。' },
        source: { type: 'array', items: { type: 'number' }, description: '源头附近坐标 [x,y]（必填，米；系统从这里开始沿地势追踪下坡，不必精确到山谷底）。' },
        tributaryTier: { type: 'string', enum: ['low', 'medium', 'high'], description: '支流数量档（可选，缺省 medium）：low=1条/medium=2条/high=3条。' },
        seed: { type: 'string', description: '造形种子（可选，缺省用 name）。' }
      },
      required: ['name', 'source']
    },
    validateArgs: (args) => {
      if (!String(args.name || '').trim()) return 'drawRiverSystem 缺少 name（名称前缀）'
      if (!parsePointArg(args.source)) return 'drawRiverSystem 需要合法的 source:[x,y]'
      if (args.tributaryTier !== undefined && !['low', 'medium', 'high'].includes(String(args.tributaryTier))) return 'tributaryTier 必须是 low/medium/high 之一'
      if (deps.stage && deps.stage !== MACRO_BRUSH_STAGE.drawRiverSystem) {
        return `当前阶段「${deps.stage}」不开放 drawRiverSystem（水系树只在水系阶段可用）`
      }
      return null
    },
    execute: async (toolCall) => {
      const args = toolCall.args as Record<string, unknown>
      const bundle = await loadBundle()
      const sheet = resolveSheet(bundle, args.sheetId)
      if (!sheet) return toolError('目标图纸不存在——先 createMapSheet')
      const grid = resolveSheetAnalysisGrid(deps.worldId, sheet)
      const source = parsePointArg(args.source) as MapPoint
      const name = String(args.name).trim()
      const seed = String(args.seed || '').trim() || name
      const result = buildRiverSystem({
        source, namePrefix: name, seed,
        ...(args.tributaryTier ? { tributaryTier: args.tributaryTier as 'low' | 'medium' | 'high' } : {})
      }, grid)
      if (!result.features.length) return toolError(`drawRiverSystem 未能生成任何要素：${result.notes.join('；') || '未知原因'}`)
      const persisted = await persistMacroBrushResult(sheet, result)
      const tribCount = Number(result.stats.tributaryCount) || 0
      const headline = `已生成水系树「${name}」共 ${persisted.savedIds.length} 个要素（干流${tribCount ? `+${tribCount}条支流` : ''}）。`
      return {
        content: renderMacroBrushReceipt(headline, sheet, result, persisted.auditNote),
        details: { kind: 'huiyuMacroBrushSaved', featureIds: persisted.savedIds, stats: result.stats }
      }
    }
  }

  const drawCityLayout: ToolDefinition = {
    name: 'drawCityLayout',
    brief: '宏笔刷：一笔生成一整座城的路网骨架（中心↔城门代价寻路主干道+方正/有机街道网格贯穿+可选城墙城门），比逐条画城区/街道更快且街道天然贯穿。给中心+范围，系统自动产出 urban 区+主干道+街道网格（可选城墙+城门），要素上限 40。仅人文阶段可用。',
    schema: {
      type: 'object',
      properties: {
        sheetId: { type: 'string', description: '图纸 id（缺省=主图纸）。' },
        name: { type: 'string', description: '城市名（必填，会用作 urban 区与各要素名称前缀）。' },
        center: { type: 'array', items: { type: 'number' }, description: '城区中心 [x,y]（米）。与 anchor 二选一。' },
        anchor: {
          type: 'object', description: '相对定位（推荐）：以既有要素为基。{featureId, bearing:汉字八方位, distanceM}。',
          properties: { featureId: { type: 'string' }, bearing: { type: 'string' }, distanceM: { type: 'number' } }
        },
        radiusM: { type: 'number', description: '城区半径（米·必填，对照知识库 urban 量级）。' },
        orientationDeg: { type: 'number', description: '主干道走向角度（度·可选，缺省 0=正东西/南北向）。' },
        streetPattern: { type: 'string', enum: ['grid', 'organic'], description: '街道细分档位（可选，缺省 grid）：grid=方正网格；organic=有机弯曲。' },
        blockSizeM: { type: 'number', description: '街区尺度基准（米·可选，缺省按 radiusM 自动估算）。' },
        meander: { type: 'number', description: '有机档弯曲度 0~1（可选，仅 streetPattern=organic 生效，缺省 0.3）。' },
        gateAnchors: { type: 'array', description: '对外连接锚点坐标 [[x,y],…]（可选，缺省按东南西北四方位自动推导边界交点）。', items: { type: 'array', items: { type: 'number' } } },
        wallEnabled: { type: 'boolean', description: '是否生成环形城墙+城门 marker（可选，缺省 false）。' },
        seed: { type: 'string', description: '造形种子（可选，缺省用 name）。' }
      },
      required: ['name', 'radiusM']
    },
    validateArgs: (args) => {
      if (!String(args.name || '').trim()) return 'drawCityLayout 缺少 name'
      if (!Number.isFinite(Number(args.radiusM)) || Number(args.radiusM) <= 0) return 'drawCityLayout 需要 radiusM（正数·米）'
      if (args.center === undefined && args.anchor === undefined) return 'drawCityLayout 需要 center 或 anchor 之一'
      if (args.streetPattern !== undefined && !['grid', 'organic'].includes(String(args.streetPattern))) return 'streetPattern 必须是 grid/organic 之一'
      if (args.gateAnchors !== undefined && !parsePointListArg(args.gateAnchors, 1)) return 'gateAnchors 必须是至少 1 个 [x,y] 数值点的数组'
      if (deps.stage && deps.stage !== MACRO_BRUSH_STAGE.drawCityLayout) {
        return `当前阶段「${deps.stage}」不开放 drawCityLayout（城区路网只在人文阶段可用）`
      }
      return null
    },
    execute: async (toolCall) => {
      const args = toolCall.args as Record<string, unknown>
      const bundle = await loadBundle()
      const sheet = resolveSheet(bundle, args.sheetId)
      if (!sheet) return toolError('目标图纸不存在——先 createMapSheet')
      const placed = resolvePlacement(bundle, args, 'center')
      if ('error' in placed) return toolError(placed.error)
      const grid = resolveSheetAnalysisGrid(deps.worldId, sheet)
      const name = String(args.name).trim()
      const seed = String(args.seed || '').trim() || name
      const gateAnchors = args.gateAnchors !== undefined ? (parsePointListArg(args.gateAnchors, 1) as MapPoint[]) : undefined
      const result = buildCityLayout({
        center: placed.point, radiusM: Number(args.radiusM), namePrefix: name, seed,
        ...(Number.isFinite(Number(args.orientationDeg)) ? { orientationDeg: Number(args.orientationDeg) } : {}),
        ...(args.streetPattern ? { streetPattern: args.streetPattern as 'grid' | 'organic' } : {}),
        ...(Number.isFinite(Number(args.blockSizeM)) ? { blockSizeM: Number(args.blockSizeM) } : {}),
        ...(Number.isFinite(Number(args.meander)) ? { meander: Number(args.meander) } : {}),
        ...(gateAnchors ? { gateAnchors } : {}),
        ...(args.wallEnabled !== undefined ? { wallEnabled: Boolean(args.wallEnabled) } : {})
      }, grid)
      if (!result.features.length) return toolError(`drawCityLayout 未能生成任何要素：${result.notes.join('；') || '未知原因'}`)
      const persisted = await persistMacroBrushResult(sheet, result)
      const majorRoadCount = Number(result.stats.majorRoadCount) || 0
      const streetCount = Number(result.stats.streetCount) || 0
      const quarterEstimate = result.stats.quarterEstimate
      const headline = `已生成城区「${name}」共 ${persisted.savedIds.length} 个要素（含 ${majorRoadCount} 条主干道/${streetCount} 条街道，quarter 估算约 ${quarterEstimate}块）。`
      return {
        content: renderMacroBrushReceipt(headline, sheet, result, persisted.auditNote),
        details: { kind: 'huiyuMacroBrushSaved', featureIds: persisted.savedIds, stats: result.stats }
      }
    }
  }

  const drawInterCityRoad: ToolDefinition = {
    name: 'drawInterCityRoad',
    brief: '宏笔刷：一笔生成两地之间的城际道路（代价寻路避坡+遇水自动接岸置桥），比手动摸索桥的位置更快。给起止点（挂既有城区/marker 用 featureId），系统自动选线并在必经水域处补齐桥。仅人文阶段可用。',
    schema: {
      type: 'object',
      properties: {
        sheetId: { type: 'string', description: '图纸 id（缺省=主图纸）。' },
        name: { type: 'string', description: '道路名（必填）。' },
        from: { type: 'object', description: '起点：{at:[x,y]} 或 {featureId}（挂既有城区/marker）。', properties: { featureId: { type: 'string' }, at: { type: 'array', items: { type: 'number' } } } },
        to: { type: 'object', description: '终点：同 from 用法。', properties: { featureId: { type: 'string' }, at: { type: 'array', items: { type: 'number' } } } },
        via: { type: 'array', description: '必须途经的坐标点（可选）[[x,y],…]。', items: { type: 'array', items: { type: 'number' } } },
        grade: { type: 'string', enum: ['trunk', 'trail'], description: '道路等级（可选，缺省 trunk）：trunk=官道(更直更缓)；trail=小径(更能爬坡)。' },
        seed: { type: 'string', description: '造形种子（可选，缺省用 name）。' }
      },
      required: ['name', 'from', 'to']
    },
    validateArgs: (args) => {
      if (!String(args.name || '').trim()) return 'drawInterCityRoad 缺少 name'
      if (!args.from || typeof args.from !== 'object') return 'drawInterCityRoad 需要 from（{at} 或 {featureId}）'
      if (!args.to || typeof args.to !== 'object') return 'drawInterCityRoad 需要 to（{at} 或 {featureId}）'
      if (args.grade !== undefined && !['trunk', 'trail'].includes(String(args.grade))) return 'grade 必须是 trunk/trail 之一'
      if (deps.stage && deps.stage !== MACRO_BRUSH_STAGE.drawInterCityRoad) {
        return `当前阶段「${deps.stage}」不开放 drawInterCityRoad（城际道路只在人文阶段可用）`
      }
      return null
    },
    execute: async (toolCall) => {
      const args = toolCall.args as Record<string, unknown>
      const bundle = await loadBundle()
      const sheet = resolveSheet(bundle, args.sheetId)
      if (!sheet) return toolError('目标图纸不存在——先 createMapSheet')
      const fromRough = resolveRoughEndpoint(bundle, pickObjectArg(args.from) || {})
      if ('error' in fromRough) return toolError(fromRough.error)
      const toRough = resolveRoughEndpoint(bundle, pickObjectArg(args.to) || {})
      if ('error' in toRough) return toolError(toRough.error)
      const via = args.via === undefined ? undefined : parsePointListArg(args.via, 1)
      if (args.via !== undefined && !via) return toolError('via 必须是至少 1 个 [x,y] 数值点的数组')
      const grid = resolveSheetAnalysisGrid(deps.worldId, sheet)
      const name = String(args.name).trim()
      const seed = String(args.seed || '').trim() || name
      const result = buildInterCityRoad({
        from: fromRough.point, to: toRough.point, namePrefix: name, seed,
        ...(via ? { via } : {}),
        ...(args.grade ? { grade: args.grade as 'trunk' | 'trail' } : {})
      }, grid)
      if (!result.features.length) return toolError(`drawInterCityRoad 未能生成任何要素：${result.notes.join('；') || '未知原因'}`)
      const persisted = await persistMacroBrushResult(sheet, result)
      const bridgeCount = Number(result.stats.bridgeCount) || 0
      const headline = `已生成城际道路「${name}」（${persisted.savedIds.length} 个要素${bridgeCount ? `，含 ${bridgeCount} 座自动置桥` : ''}）。`
      return {
        content: renderMacroBrushReceipt(headline, sheet, result, persisted.auditNote),
        details: { kind: 'huiyuMacroBrushSaved', featureIds: persisted.savedIds, stats: result.stats }
      }
    }
  }

  const auditMap: ToolDefinition = {
    name: 'auditMap',
    brief: '交稿前自查：确定性体检当前图纸（悬空河口/断头路、违禁重叠、出探索范围、尺度异常）。autofix=true（缺省）自动吸附 ≤150m 的机械断连；其余只报不改（绝不删除/挪 region/改 explored）。',
    schema: {
      type: 'object',
      properties: {
        sheetId: { type: 'string', description: '图纸 id（缺省=主图纸）。' },
        autofix: { type: 'boolean', description: '缺省 true：自动吸附可机械修复的轻微断连（≤150m）。设 false 只报不改。' }
      }
    },
    execute: async (toolCall) => {
      const args = toolCall.args as Record<string, unknown>
      const bundle = await loadBundle()
      const sheet = resolveSheet(bundle, args.sheetId)
      if (!sheet) return toolError('目标图纸不存在——先 createMapSheet')
      const autofix = args.autofix === undefined ? true : Boolean(args.autofix)
      const result = await runSheetAudit(deps.worldId, sheet, autofix, deps.runMeta)
      const lines = [`图纸「${sheet.name}」体检报告：`, ...result.fixNotes]
      if (!result.findings.length) {
        lines.push(result.fixNotes.length ? '其余项目全部体检通过。' : '体检通过，未发现问题。')
      } else {
        lines.push('发现项：', ...result.findings.map((f) => `- [${f.number}][${f.severity}][${f.code}] ${f.message}`))
      }
      return {
        content: lines.join('\n'),
        details: { kind: 'huiyuMapAudit', fixedCount: result.fixedCount, findings: result.findings }
      }
    }
  }

  // 阶段工具集过滤（笔刷约束系统批D）：deps.stage 给了才裁——drawMapRegion 三阶段都有对应类目（只裁
  // schema/validateArgs 内的 category 白名单，工具本身恒装配，见前面 STAGE_REGION_CATEGORIES 三档均非空）；
  // 地形阶段没有线状笔刷（STAGE_PATH_CATEGORIES.terrain 为空数组）就整个不装配 drawMapPath；非人文阶段
  // 没有 marker 就整个不装配 drawMapMarker。createMapSheet/expandExplored/updateMapFeature/deleteMapFeature/
  // auditMap 是结构性/跨阶段工具，任何阶段都保留（Lock 硬门在各自 execute 内部按需拦截，不靠"整个不给
  // 工具"这种粗粒度过滤）。deps.stage 未给=旧版非 staged 派发，全量不裁，零回归。
  const hidePath = Boolean(deps.stage && !STAGE_PATH_CATEGORIES[deps.stage].length)
  const hideMarker = Boolean(deps.stage && deps.stage !== 'civic')
  // 宏笔刷四件同款过滤（笔刷约束系统批E）：deps.stage 给了才按 MACRO_BRUSH_STAGE 单值裁（每件只属一个
  // 阶段，不像 region/path 有类目子集可裁——不匹配就整个不装配）；未给=全量四件均可用。
  const showMacroBrush = (toolName: keyof typeof MACRO_BRUSH_STAGE) => !deps.stage || deps.stage === MACRO_BRUSH_STAGE[toolName]

  return [
    ...readOnlyTools,
    createMapSheet,
    expandExplored,
    drawMapRegion,
    ...(hidePath ? [] : [drawMapPath]),
    ...(hideMarker ? [] : [drawMapMarker]),
    updateMapFeature,
    deleteMapFeature,
    ...(showMacroBrush('drawMountainChain') ? [drawMountainChain] : []),
    ...(showMacroBrush('drawRiverSystem') ? [drawRiverSystem] : []),
    ...(showMacroBrush('drawCityLayout') ? [drawCityLayout] : []),
    ...(showMacroBrush('drawInterCityRoad') ? [drawInterCityRoad] : []),
    auditMap
  ]
}
