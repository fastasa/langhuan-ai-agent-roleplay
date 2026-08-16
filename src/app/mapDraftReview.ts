import type { MapFeature, MapLayer, MapPoint } from './mapGeometry'
import type { WorldMapFeatureRecord, WorldMapSheet } from '../types'

/**
 * 最终落笔草稿审阅协议。
 *
 * 候选要素已经走完模型/参数展开与占地校验，但仍是瞬时态；只有用户明确确认、且图纸版本未变化时，
 * 调用方才可以把对应 saveItems 写入 world_map_features。它与旧绘舆“粗剪影再重画”协议是两条链：
 * 旧剪影只表达意图，本协议展示的 previewFeatures 就是准备提交的最终几何。
 */
export type MapDraftReviewMark = 'accepted' | 'rejected' | 'commented'

export interface MapDraftReviewItem {
  /** 一次审阅请求内唯一；一座多层装甲山脉只占一个逻辑项。 */
  id: string
  action: 'add'
  kind: 'region' | 'path' | 'marker'
  category: string
  label: string
  confidence: 'ready'
  /** 兼容既有锚定卡/网格定位的轻量几何；正式显示以 previewFeatures 为准。 */
  sketch: { center?: MapPoint; rx?: number; ry?: number; points?: MapPoint[] }
  card: { change: string; basis?: string; risk?: string }
  /** 与确认后成图同坐标、同层序的最终矢量；多层山脉放在同一项里。 */
  previewFeatures: MapFeature[]
}

export interface MapDraftReviewDecision {
  confirmed: string[]
  modified: string[]
  deleted: string[]
  /** 修改项必须有逐项意见；确认/删除项不要求意见。 */
  comments: Record<string, string>
  /** 确认/删除项也可附逐项备注；它不改变决策类型。 */
  notes?: Record<string, string>
  note?: string
}

export type MapDraftReviewResolution =
  | { status: 'submitted'; decision: MapDraftReviewDecision }
  | { status: 'cancelled' }

export interface MapDraftReviewRequest {
  kind: 'map-final-draft-review'
  worldId: string
  sheetId: string
  /** 候选生成前的图纸签名；确认提交前必须重新读取并逐字比较。 */
  baseRevision: string
  title: string
  items: MapDraftReviewItem[]
}

export type ReviewMapDraft = (request: MapDraftReviewRequest) => Promise<MapDraftReviewResolution>

export type MapDraftReviewGateResult =
  | { status: 'cancelled' }
  | { status: 'stale'; error: string }
  | { status: 'invalid'; error: string }
  | { status: 'submitted'; decision: MapDraftReviewDecision }

export interface MapDraftReviewValidation {
  ok: boolean
  error?: string
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue)
  if (!value || typeof value !== 'object') return value
  const source = value as Record<string, unknown>
  const result: Record<string, unknown> = {}
  Object.keys(source).sort().forEach((key) => { result[key] = stableValue(source[key]) })
  return result
}

/** 图纸并发签名：不依赖视图缓存；任何正式要素增删改都会改变签名。 */
export function createMapSheetRevision(sheet: Pick<WorldMapSheet, 'id' | 'features'>): string {
  const features = [...(sheet.features || [])]
    .sort((left, right) => String(left.id).localeCompare(String(right.id)))
    .map((feature) => stableValue({
      id: feature.id,
      kind: feature.kind,
      category: feature.category,
      name: feature.name,
      layer: feature.layer,
      geometry: feature.geometry,
      style: feature.style,
      links: feature.links,
      meta: feature.meta,
      updatedAt: feature.updatedAt
    }))
  return JSON.stringify({ sheetId: sheet.id, features })
}

/**
 * 提交前硬校验：每个候选必须且只能落在确认/修改/删除三类之一；修改项必须有非空逐项意见。
 * 未决项不允许靠默认值偷偷确认。
 */
export function validateMapDraftReviewDecision(
  items: Array<Pick<MapDraftReviewItem, 'id'>>,
  decision: MapDraftReviewDecision
): MapDraftReviewValidation {
  const validIds = new Set(items.map((item) => item.id))
  if (!validIds.size) return { ok: false, error: '没有可审阅的候选地形' }
  const seen = new Set<string>()
  const groups: Array<[string, string[]]> = [
    ['确认', decision.confirmed || []],
    ['修改', decision.modified || []],
    ['删除', decision.deleted || []]
  ]
  for (const [label, ids] of groups) {
    for (const id of ids) {
      if (!validIds.has(id)) return { ok: false, error: `${label}列表含未知地形「${id}」` }
      if (seen.has(id)) return { ok: false, error: `地形「${id}」被重复归入多个决策` }
      seen.add(id)
    }
  }
  const missing = items.map((item) => item.id).filter((id) => !seen.has(id))
  if (missing.length) return { ok: false, error: `还有 ${missing.length} 个地形未选择确认、修改或删除` }
  for (const id of decision.modified || []) {
    if (!String(decision.comments?.[id] || '').trim()) {
      return { ok: false, error: `要修改地形「${id}」时必须填写具体意见` }
    }
  }
  for (const id of Object.keys(decision.notes || {})) {
    if (!validIds.has(id)) return { ok: false, error: `逐项备注含未知地形「${id}」` }
  }
  return { ok: true }
}

/**
 * 通用确认门：UI 决策校验 + 确认前并发复查。调用方只能在 status=submitted 后按 confirmed 过滤写入。
 */
export async function runMapDraftReviewGate(input: {
  request: MapDraftReviewRequest
  review: ReviewMapDraft
  reloadSheet: () => Promise<Pick<WorldMapSheet, 'id' | 'features'> | null>
}): Promise<MapDraftReviewGateResult> {
  const resolution = await input.review(input.request)
  if (resolution.status === 'cancelled') return { status: 'cancelled' }
  const validation = validateMapDraftReviewDecision(input.request.items, resolution.decision)
  if (!validation.ok) return { status: 'invalid', error: validation.error || '草稿决策无效' }
  if (resolution.decision.confirmed.length) {
    const sheet = await input.reloadSheet()
    if (!sheet || sheet.id !== input.request.sheetId || createMapSheetRevision(sheet) !== input.request.baseRevision) {
      return { status: 'stale', error: '审阅期间地图已经发生变化，这份草稿已失效；请让星依按最新地图重新生成。' }
    }
  }
  return { status: 'submitted', decision: resolution.decision }
}

export function buildMapDraftReviewItem(input: {
  id: string
  label: string
  category: string
  kind: 'region' | 'path' | 'marker'
  change: string
  basis?: string
  features: Array<{
    kind: string
    category: string
    name: string
    layer: string
    geometry: { pts: MapPoint[]; spine?: MapPoint[]; bank?: MapPoint[]; elevationM?: number; depthM?: number }
    style?: Record<string, unknown> | null
    meta?: Record<string, unknown> | null
  }>
}): MapDraftReviewItem {
  const previewFeatures: MapFeature[] = input.features.map((feature, index) => {
    const style = (feature.style || {}) as Record<string, any>
    const armor = (feature.meta as { armor?: Record<string, unknown> } | null | undefined)?.armor
    const isWaterArmor = feature.category === 'water' && armor?.type === 'water'
    return {
      id: `${input.id}:preview:${index + 1}`,
      kind: feature.kind as MapFeature['kind'],
      category: feature.category,
      name: feature.name,
      layer: feature.layer as MapLayer,
      pts: feature.geometry.pts,
      spine: feature.geometry.spine,
      bank: feature.geometry.bank,
      elevationM: feature.geometry.elevationM,
      ...(isWaterArmor && Number.isFinite(Number(feature.geometry.depthM)) ? { waterDepthM: Number(feature.geometry.depthM) } : {}),
      ...(isWaterArmor && Number.isFinite(Number(armor?.depthRatio)) ? { waterDepthRatio: Number(armor?.depthRatio) } : {}),
      ...(isWaterArmor ? { waterRole: armor?.role === 'depth-band' ? 'depth-band' as const : 'surface' as const } : {}),
      rough: style.rough
    }
  })
  const allPoints = previewFeatures.flatMap((feature) => feature.pts || [])
  const center: MapPoint | undefined = allPoints.length
    ? [allPoints.reduce((sum, point) => sum + point[0], 0) / allPoints.length, allPoints.reduce((sum, point) => sum + point[1], 0) / allPoints.length]
    : undefined
  return {
    id: input.id,
    action: 'add',
    kind: input.kind,
    category: input.category,
    label: input.label,
    confidence: 'ready',
    sketch: {
      ...(center ? { center } : {}),
      ...(previewFeatures[0]?.pts?.length ? { points: previewFeatures[0].pts } : {})
    },
    card: { change: input.change, ...(input.basis ? { basis: input.basis } : {}) },
    previewFeatures
  }
}

/** 只给测试/适配器使用的最小记录转视图函数。 */
export function mapRecordToDraftFeature(record: WorldMapFeatureRecord): MapFeature {
  const style = (record.style || {}) as Record<string, any>
  return {
    id: record.id,
    kind: record.kind as MapFeature['kind'],
    category: record.category,
    name: record.name,
    layer: record.layer as MapLayer,
    pts: record.geometry.pts,
    spine: record.geometry.spine,
    elevationM: record.geometry.elevationM,
    rough: style.rough
  }
}
