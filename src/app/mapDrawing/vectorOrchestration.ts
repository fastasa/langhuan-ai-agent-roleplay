import { fetchWorldMapBundle, saveWorldMapFeaturesRemote } from '../../repositories/chatRepository'
import type { MapLayer, MapPoint } from '../mapGeometry'
import {
  resolveMapTaskPlacement,
  validatePointSetsInTaskPlacement,
  type MapTaskPlacementRequest
} from '../mapTaskPlacement'
import type { MapDrawTrace } from '../mapArmor/types'
import {
  buildMapDraftReviewItem,
  createMapSheetRevision,
  runMapDraftReviewGate,
  type ReviewMapDraft
} from '../mapDraftReview'
import { compileVectorPrimitive, type MapVectorPrimitive } from './vectorPrimitive'

export const VECTOR_SUBAGENT_ID_PREFIX = 'map-vector'

export function renderVectorBrief(input: { task: string; instructions: string }): string {
  return [`【矢量任务】${String(input.task || '').trim()}`, '', '【任务书】', String(input.instructions || '').trim()].join('\n')
}

export function extractVectorTaskTitle(input: string | undefined): string {
  const firstLine = String(input || '').split('\n', 1)[0] || ''
  const match = firstLine.match(/^【矢量任务】(.*)$/)
  return match ? match[1].trim() : ''
}

export interface VectorPrimitiveWorkInput {
  worldId: string
  shape: 'circle' | 'ellipse' | 'rect' | 'polygon' | 'path'
  category: string
  name?: string
  layer?: MapLayer
  /** 圆心/矩形中心相对当前内容工作框中心的偏移。 */
  offsetXM?: number
  offsetYM?: number
  radiusM?: number
  widthM?: number
  heightM?: number
  /** polygon/path 的点，单位米，全部相对本次作画任务域中心。 */
  pointsRelativeM?: MapPoint[]
  placement?: MapTaskPlacementRequest
  deps?: {
    fetchBundle?: typeof fetchWorldMapBundle
    saveFeatures?: typeof saveWorldMapFeaturesRemote
    reviewDraft?: ReviewMapDraft
  }
}

export interface VectorPrimitiveWorkResult {
  ok: boolean
  summary: string
  featureId?: string
  trace?: MapDrawTrace
  error?: string
  reviewStatus?: 'confirmed' | 'modify' | 'deleted' | 'cancelled' | 'stale'
  reviewFeedback?: string
}

/** 结构化图元直画：不调用第二个模型，不接收原始 SVG/XML；图元与 SVG 渲染投影一起持久化。 */
export async function runVectorPrimitiveWork(input: VectorPrimitiveWorkInput): Promise<VectorPrimitiveWorkResult> {
  const fetchBundle = input.deps?.fetchBundle ?? fetchWorldMapBundle
  const saveFeatures = input.deps?.saveFeatures ?? saveWorldMapFeaturesRemote
  let bundle: Awaited<ReturnType<typeof fetchWorldMapBundle>>
  try {
    bundle = await fetchBundle(input.worldId)
  } catch (error) {
    return { ok: false, summary: '', error: `读取舆图失败：${(error as Error)?.message || String(error)}` }
  }
  const sheet = bundle.sheets?.[0]
  if (!sheet) return { ok: false, summary: '', error: '这个世界还没有舆图图纸，请先创建图纸再画矢量图元。' }
  const baseRevision = createMapSheetRevision(sheet)
  let placement: ReturnType<typeof resolveMapTaskPlacement>
  try {
    placement = resolveMapTaskPlacement({
      features: (sheet.features || []).map((feature) => ({
        id: String(feature.id), name: String(feature.name || ''), kind: feature.kind as 'region' | 'path' | 'marker',
        category: String(feature.category || ''), pts: (feature.geometry?.pts || []) as MapPoint[]
      })),
      request: input.placement
    })
  } catch (error) {
    return { ok: false, summary: '', error: `作画任务域无效：${(error as Error)?.message || String(error)}` }
  }
  const frame = placement.frame
  const trace: MapDrawTrace = { version: 1, kind: 'vector-primitive', steps: [{ key: 'task-frame', label: '作画任务域', status: 'success', data: { placement } }] }
  const center: MapPoint = [frame.center[0] + Number(input.offsetXM || 0), frame.center[1] + Number(input.offsetYM || 0)]
  let primitive: MapVectorPrimitive
  if (input.shape === 'circle') primitive = { type: 'circle', center, radiusM: Number(input.radiusM) }
  else if (input.shape === 'ellipse') primitive = { type: 'ellipse', center, widthM: Number(input.widthM), heightM: Number(input.heightM) }
  else if (input.shape === 'rect') primitive = { type: 'rect', center, widthM: Number(input.widthM), heightM: Number(input.heightM) }
  else {
    const points = (input.pointsRelativeM || []).map((point) => [frame.center[0] + Number(point[0]), frame.center[1] + Number(point[1])] as MapPoint)
    primitive = { type: input.shape, points } as MapVectorPrimitive
  }

  let compiled: ReturnType<typeof compileVectorPrimitive>
  try {
    compiled = compileVectorPrimitive({ primitive, category: input.category, name: input.name, layer: input.layer })
  } catch (error) {
    const message = `矢量图元参数无效：${(error as Error)?.message || String(error)}`
    trace.steps.push({ key: 'compile', label: '结构化命令与 SVG 几何投影', status: 'error', data: { primitive, error: message } })
    return { ok: false, summary: '', error: message, trace }
  }
  trace.steps.push({ key: 'compile', label: '结构化命令与 SVG 几何投影', status: 'success', data: compiled })
  const placementCheck = validatePointSetsInTaskPlacement([compiled.pts], placement)
  if (!placementCheck.ok) {
    trace.steps.push({ key: 'final-geometry-validation', label: '最终图元占地校验', status: 'error', data: placementCheck })
    return { ok: false, summary: '', error: `最终图元占地校验失败：${placementCheck.reason}。本次没有写入地图。`, trace }
  }
  trace.steps.push({ key: 'final-geometry-validation', label: '最终图元占地校验', status: 'success', data: { mode: placement.mode, anchor: placement.anchor } })
  trace.steps.push({ key: 'save-validation', label: '落库前校验', status: 'success', data: { featureCount: 1, sheetId: sheet.id } })
  const runKey = `vector-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const item = {
    sheetId: sheet.id,
    kind: compiled.kind,
    category: compiled.category,
    name: compiled.name,
    layer: compiled.layer,
    geometry: { pts: compiled.pts },
    // 图元投影就是最终几何；禁用按服务端随机 id 的二次粗糙化，保证草稿与成图逐点一致。
    style: { rough: { iter: 0, amp: 0 } },
    meta: { vectorPrimitive: compiled.primitive, placement, source: 'structured-vector', drawTrace: trace }
  }
  if (input.deps?.reviewDraft) {
    const reviewId = `vector:${runKey}`
    const request = {
      kind: 'map-final-draft-review' as const,
      worldId: input.worldId,
      sheetId: sheet.id,
      baseRevision,
      title: `确认「${compiled.name}」的最终落笔`,
      items: [buildMapDraftReviewItem({
        id: reviewId,
        label: compiled.name,
        category: compiled.category,
        kind: compiled.kind,
        change: `新增一个 ${compiled.primitive.type} 图元；当前形状与范围就是确认后的成图`,
        basis: '已通过图元协议、类目兼容、任务域与最终占地校验',
        features: [item]
      })]
    }
    let gate: Awaited<ReturnType<typeof runMapDraftReviewGate>>
    try {
      gate = await runMapDraftReviewGate({
        request,
        review: input.deps.reviewDraft,
        reloadSheet: async () => {
          const fresh = await fetchBundle(input.worldId)
          return fresh.sheets?.find((candidate) => candidate.id === sheet.id) || null
        }
      })
    } catch (error) {
      const message = `最终草稿审阅失败：${(error as Error)?.message || String(error)}`
      trace.steps.push({ key: 'draft-review', label: '最终草稿审阅', status: 'error', data: { error: message } })
      return { ok: false, summary: '', error: message, trace }
    }
    if (gate.status !== 'submitted') {
      const message = gate.status === 'cancelled' ? '已取消这次最终草稿，地图没有写入。' : gate.error
      trace.steps.push({ key: 'draft-review', label: '最终草稿审阅', status: gate.status === 'cancelled' ? 'success' : 'error', data: { status: gate.status, message } })
      return { ok: false, summary: message, error: message, trace, reviewStatus: gate.status === 'stale' ? 'stale' : 'cancelled' }
    }
    if (gate.decision.modified.includes(reviewId)) {
      const feedback = String(gate.decision.comments[reviewId] || '').trim()
      const message = `用户要求修改「${compiled.name}」：${feedback}。当前草稿已丢弃，地图没有写入。`
      trace.steps.push({ key: 'draft-review', label: '最终草稿审阅', status: 'success', data: { status: 'modify', feedback } })
      return { ok: false, summary: message, error: message, trace, reviewStatus: 'modify', reviewFeedback: feedback }
    }
    if (gate.decision.deleted.includes(reviewId)) {
      const note = String(gate.decision.notes?.[reviewId] || '').trim()
      const message = `已删除图元草稿「${compiled.name}」，地图没有写入。${note ? ` 备注：${note}` : ''}`
      trace.steps.push({ key: 'draft-review', label: '最终草稿审阅', status: 'success', data: { status: 'deleted' } })
      return { ok: false, summary: message, trace, reviewStatus: 'deleted' }
    }
    const itemNote = String(gate.decision.notes?.[reviewId] || '').trim()
    Object.assign(item.meta, {
      draftReview: {
        decision: 'confirmed',
        ...(itemNote ? { note: itemNote } : {}),
        ...(gate.decision.note ? { overallNote: gate.decision.note } : {})
      }
    })
    trace.steps.push({ key: 'draft-review', label: '最终草稿审阅', status: 'success', data: { status: 'confirmed' } })
  }
  try {
    const saved = await saveFeatures(input.worldId, [item], { runKey, runLabel: `矢量直画·${compiled.name}` })
    const summary = `已用 ${compiled.primitive.type} 图元绘制「${compiled.name}」 · ${compiled.pts.length} 个渲染点 · 落库 1 件`
    trace.steps.push({ key: 'save-result', label: '落库结果', status: 'success', data: { summary, featureCount: 1 } })
    return {
      ok: true,
      summary,
      trace,
      ...(input.deps?.reviewDraft ? { reviewStatus: 'confirmed' as const } : {}),
      ...(saved[0]?.id ? { featureId: saved[0].id } : {})
    }
  } catch (error) {
    const message = `落库失败：${(error as Error)?.message || String(error)}`
    trace.steps.push({ key: 'save-result', label: '落库结果', status: 'error', data: { error: message } })
    return { ok: false, summary: '', error: message, trace }
  }
}
