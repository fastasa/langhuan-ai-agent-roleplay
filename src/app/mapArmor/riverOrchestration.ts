import { fetchWorldMapBundle, saveWorldMapFeaturesRemote } from '../../repositories/chatRepository'
import { polygonsOverlap, type MapPoint } from '../mapGeometry'
import {
  buildMapDraftReviewItem,
  createMapSheetRevision,
  runMapDraftReviewGate
} from '../mapDraftReview'
import { resolveMapTaskPlacement, validatePointSetsInTaskPlacement, type MapTaskPlacementRequest } from '../mapTaskPlacement'
import { resolveWorldDefaultMapSheet } from '../worldMapDefaultSheet'
import type { RunMountainArmorWorkDeps, RunMountainArmorWorkResult } from './armorOrchestration'
import type { ArmorPainterCallModel } from './armorPainter'
import { buildRiverDotMatrix, strokeToWorldSkeleton, worldToGrid } from './dotMatrix'
import { expandRiverArmor } from './riverArmor'
import {
  collectRiverAnchorCandidates,
  resolveRiverAnchorCandidate,
  snapRiverSpineToAnchors
} from './riverAnchors'
import { runRiverPainter } from './riverPainter'
import type { MapDrawTrace, RiverArmorParams } from './types'
import {
  autoConnectRiverEndpoints,
  collectWaterConnectionTargets,
  DEFAULT_RIVER_WATER_CONNECTION_GAP_M
} from './waterConnections'

export interface RunRiverArmorWorkInput {
  worldId: string
  task: string
  name?: string
  sourceFeature?: string
  mouthFeature?: string
  params?: RiverArmorParams
  seed?: number
  callModel: ArmorPainterCallModel
  placement?: MapTaskPlacementRequest
  deps?: RunMountainArmorWorkDeps
}

function candidateInsideProjection(point: MapPoint, projection: ReturnType<typeof buildRiverDotMatrix>): boolean {
  const [row, col] = worldToGrid(projection.spec, point)
  return row >= 1 && row <= projection.spec.rows && col >= 1 && col <= projection.spec.cols
}

function definedParams(params: RiverArmorParams | undefined): RiverArmorParams {
  if (!params) return {}
  return Object.fromEntries(Object.entries(params).filter(([, value]) => value !== undefined)) as RiverArmorParams
}

/** 新水系唯一写链：局部点阵只让模型规划河流脊线；代码负责语义锚点、河岸派生、最终校验、审阅与写库。 */
export async function runRiverArmorWork(input: RunRiverArmorWorkInput): Promise<RunMountainArmorWorkResult> {
  const fetchBundle = input.deps?.fetchBundle ?? fetchWorldMapBundle
  const saveFeatures = input.deps?.saveFeatures ?? saveWorldMapFeaturesRemote
  let bundle: Awaited<ReturnType<typeof fetchWorldMapBundle>>
  try {
    bundle = await fetchBundle(input.worldId)
  } catch (error) {
    return { ok: false, summary: '', error: `读取舆图失败：${(error as Error)?.message || String(error)}` }
  }
  const sheet = resolveWorldDefaultMapSheet(bundle)
  if (!sheet) return { ok: false, summary: '', error: '这个世界还没有舆图图纸，请先创建图纸再来画河流。' }
  const baseRevision = createMapSheetRevision(sheet)
  let placement: ReturnType<typeof resolveMapTaskPlacement>
  try {
    placement = resolveMapTaskPlacement({
      features: (sheet.features || []).map((feature) => ({
        id: String(feature.id),
        name: String(feature.name || ''),
        kind: feature.kind as 'region' | 'path' | 'marker',
        category: String(feature.category || ''),
        pts: (feature.geometry?.pts || []) as MapPoint[]
      })),
      request: input.placement
    })
  } catch (error) {
    return { ok: false, summary: '', error: `作画任务域无效：${(error as Error)?.message || String(error)}` }
  }
  const trace: MapDrawTrace = {
    version: 1,
    kind: 'river-armor',
    steps: [{ key: 'task-frame', label: '作画任务域', status: 'success', data: { placement } }]
  }
  let projection: ReturnType<typeof buildRiverDotMatrix>
  try {
    projection = buildRiverDotMatrix({ framePts: placement.frame.pts, containmentRegion: placement.containmentRegion })
    trace.steps.push({ key: 'dot-matrix', label: '河流点阵投影', status: 'success', data: { spec: projection.spec, text: projection.text } })
  } catch (error) {
    const message = `河流点阵投影失败：${(error as Error)?.message || String(error)}`
    trace.steps.push({ key: 'dot-matrix', label: '河流点阵投影', status: 'error', data: { error: message } })
    return { ok: false, summary: '', error: message, trace }
  }

  const allCandidates = collectRiverAnchorCandidates(sheet.features || [])
  let requestedSource
  let requestedMouth
  try {
    requestedSource = resolveRiverAnchorCandidate(allCandidates, 'source', input.sourceFeature)
    requestedMouth = resolveRiverAnchorCandidate(allCandidates, 'mouth', input.mouthFeature)
  } catch (error) {
    const message = `河流连接目标无效：${(error as Error)?.message || String(error)}`
    trace.steps.push({ key: 'semantic-anchors', label: '源头、汇流与入海候选', status: 'error', data: { error: message } })
    return { ok: false, summary: '', error: message, trace }
  }
  const candidates = allCandidates.filter((candidate) => candidateInsideProjection(candidate.point, projection))
  if ((requestedSource && !candidates.some((candidate) => candidate.id === requestedSource?.id))
    || (requestedMouth && !candidates.some((candidate) => candidate.id === requestedMouth?.id))) {
    const message = '点名的河流连接目标不在本次作画任务域内；请扩大 widthKm/heightKm，或调整 placementMode/方向。'
    trace.steps.push({ key: 'semantic-anchors', label: '源头、汇流与入海候选', status: 'error', data: { error: message } })
    return { ok: false, summary: '', error: message, trace }
  }
  trace.steps.push({
    key: 'semantic-anchors',
    label: '源头、汇流与入海候选',
    status: 'success',
    data: candidates.map(({ targetPoints, ...candidate }) => candidate)
  })

  const paint = await runRiverPainter({
    task: input.task,
    projection,
    candidates,
    requiredSourceAnchorId: requestedSource?.id,
    requiredMouthAnchorId: requestedMouth?.id,
    callModel: input.callModel
  })
  trace.steps.push({ key: 'model-output', label: '模型原文、河流命令与逐次校验', status: paint.ok ? 'success' : 'error', data: paint.attemptTrace })
  if (!paint.ok || !paint.stroke) return { ok: false, summary: '', error: paint.error || '地貌师未能产出合法河流脊线', trace }

  const source = requestedSource || candidates.find((candidate) => candidate.id === paint.sourceAnchorId)
  const mouth = requestedMouth || candidates.find((candidate) => candidate.id === paint.mouthAnchorId)
  let snapped
  try {
    const rawSpine = strokeToWorldSkeleton(paint.stroke, projection.spec)
    snapped = snapRiverSpineToAnchors(rawSpine, source, mouth)
    const nearby = autoConnectRiverEndpoints(
      snapped.spine,
      collectWaterConnectionTargets(sheet.features || []),
      DEFAULT_RIVER_WATER_CONNECTION_GAP_M,
      { source: Boolean(source), mouth: Boolean(mouth) }
    )
    snapped.spine = nearby.spine
    if (nearby.source) {
      snapped.anchors.source = {
        candidateId: `auto:${nearby.source.target.featureId}`,
        featureId: nearby.source.target.featureId,
        name: nearby.source.target.name,
        role: 'source',
        point: nearby.spine[0]
      }
    }
    if (nearby.mouth) {
      snapped.anchors.mouth = {
        candidateId: `auto:${nearby.mouth.target.featureId}`,
        featureId: nearby.mouth.target.featureId,
        name: nearby.mouth.target.name,
        role: 'mouth',
        point: nearby.spine[nearby.spine.length - 1]
      }
    }
    if (nearby.source || nearby.mouth) {
      trace.steps.push({
        key: 'river-auto-connect', label: '近距水体自动连通', status: 'success',
        data: {
          thresholdM: DEFAULT_RIVER_WATER_CONNECTION_GAP_M,
          source: nearby.source && { featureId: nearby.source.target.featureId, gapM: nearby.source.distanceM },
          mouth: nearby.mouth && { featureId: nearby.mouth.target.featureId, gapM: nearby.mouth.distanceM }
        }
      })
    }
  } catch (error) {
    const message = `河流连接失败：${(error as Error)?.message || String(error)}`
    trace.steps.push({ key: 'world-skeleton', label: '世界脊线与语义吸附', status: 'error', data: { error: message } })
    return { ok: false, summary: '', error: message, trace }
  }
  trace.steps.push({ key: 'world-skeleton', label: '世界脊线与语义吸附', status: 'success', data: snapped })

  const seed = Number.isFinite(Number(input.seed)) ? Math.trunc(Number(input.seed)) : Math.floor(Math.random() * 0x7fffffff)
  const groupId = `armor-river-${seed}-${Math.random().toString(36).slice(2, 8)}`
  const usedParams = { ...definedParams(paint.params), ...definedParams(input.params) }
  let expansion: ReturnType<typeof expandRiverArmor>
  try {
    expansion = expandRiverArmor(snapped.spine, usedParams, seed)
  } catch (error) {
    const message = `河流参数或河岸派生失败：${(error as Error)?.message || String(error)}`
    trace.steps.push({ key: 'armor-expansion', label: '代码派生河岸', status: 'error', data: { error: message } })
    return { ok: false, summary: '', error: message, trace }
  }
  trace.steps.push({
    key: 'armor-expansion', label: '代码派生河岸', status: 'success',
    data: { seed, inputParams: usedParams, resolvedParams: expansion.resolvedParams, projectedSpine: expansion.projectedSpine, bank: expansion.bank }
  })

  const placementCheck = validatePointSetsInTaskPlacement([expansion.projectedSpine, expansion.bank], placement)
  const connectedFeatureIds = new Set([
    source?.featureId,
    mouth?.featureId,
    snapped.anchors.source?.featureId,
    snapped.anchors.mouth?.featureId
  ].filter(Boolean))
  let conflict = ''
  for (const feature of sheet.features || []) {
    if (connectedFeatureIds.has(feature.id) || feature.kind !== 'region') continue
    if (feature.category !== 'water' && feature.category !== 'mountain') continue
    if ((feature.meta as any)?.armor?.type === 'water' && (feature.meta as any)?.armor?.role === 'depth-band') continue
    const points = (feature.geometry?.pts || []) as MapPoint[]
    if (points.length >= 3 && polygonsOverlap(expansion.bank, points)) {
      conflict = `河岸与未选作连接目标的${feature.category === 'water' ? '水域' : '山体'}「${feature.name}」重叠`
      break
    }
  }
  if (!placementCheck.ok || conflict) {
    const reason = placementCheck.reason || conflict
    trace.steps.push({ key: 'final-geometry-validation', label: '最终河岸占地校验', status: 'error', data: { reason } })
    return { ok: false, summary: '', error: `最终河岸占地校验失败：${reason}。本次没有写入地图。`, trace }
  }
  trace.steps.push({ key: 'final-geometry-validation', label: '最终河岸占地校验', status: 'success', data: { placement, anchors: snapped.anchors } })

  const name = String(input.name || paint.name || '').trim() || '新河流'
  const armor = {
    version: 1,
    type: 'river',
    spine: expansion.spine,
    params: expansion.resolvedParams,
    resolvedParams: expansion.resolvedParams,
    seed,
    groupId,
    placement,
    anchors: snapped.anchors
  }
  const item = {
    sheetId: sheet.id,
    kind: 'path' as const,
    category: 'river',
    name,
    layer: 'terrain' as const,
    geometry: { pts: expansion.projectedSpine },
    style: { rough: { iter: 0, amp: 0 } },
    meta: { armor, drawTrace: trace } as Record<string, unknown>
  }
  trace.steps.push({ key: 'save-validation', label: '落库前校验', status: 'success', data: { sheetId: sheet.id, groupId, featureCount: 1 } })

  if (input.deps?.reviewDraft) {
    const reviewId = `terrain:${groupId}`
    const request = {
      kind: 'map-final-draft-review' as const,
      worldId: input.worldId,
      sheetId: sheet.id,
      baseRevision,
      title: `确认河流「${name}」的最终落笔`,
      items: [buildMapDraftReviewItem({
        id: reviewId,
        label: name,
        category: 'river',
        kind: 'path',
        change: '新增一条参数化河流；当前中心线、宽度变化与河岸就是确认后的成图',
        basis: '已通过脊线命令、语义吸附、任务域、地形冲突与最终河岸校验',
        features: [{ ...item, geometry: { ...item.geometry, bank: expansion.bank } }]
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
      const message = gate.status === 'cancelled' ? '已取消这次河流草稿，地图没有写入。' : gate.error
      trace.steps.push({ key: 'draft-review', label: '最终草稿审阅', status: gate.status === 'cancelled' ? 'success' : 'error', data: { status: gate.status, message } })
      return { ok: false, summary: message, error: message, trace, reviewStatus: gate.status === 'stale' ? 'stale' : 'cancelled' }
    }
    if (gate.decision.modified.includes(reviewId)) {
      const feedback = String(gate.decision.comments[reviewId] || '').trim()
      const message = `用户要求修改「${name}」：${feedback}。当前草稿已丢弃，地图没有写入。`
      trace.steps.push({ key: 'draft-review', label: '最终草稿审阅', status: 'success', data: { status: 'modify', feedback } })
      return { ok: false, summary: message, error: message, trace, reviewStatus: 'modify', reviewFeedback: feedback }
    }
    if (gate.decision.deleted.includes(reviewId)) {
      const note = String(gate.decision.notes?.[reviewId] || '').trim()
      const message = `已删除河流草稿「${name}」，地图没有写入。${note ? ` 备注：${note}` : ''}`
      trace.steps.push({ key: 'draft-review', label: '最终草稿审阅', status: 'success', data: { status: 'deleted' } })
      return { ok: false, summary: message, trace, reviewStatus: 'deleted' }
    }
    const itemNote = String(gate.decision.notes?.[reviewId] || '').trim()
    item.meta = {
      ...item.meta,
      draftReview: {
        decision: 'confirmed',
        ...(itemNote ? { note: itemNote } : {}),
        ...(gate.decision.note ? { overallNote: gate.decision.note } : {})
      }
    }
    trace.steps.push({ key: 'draft-review', label: '最终草稿审阅', status: 'success', data: { status: 'confirmed' } })
  }

  try {
    await saveFeatures(input.worldId, [item], { runKey: `armor-${groupId}`, runLabel: `地貌绘制·${name}` })
  } catch (error) {
    const message = `落库失败：${(error as Error)?.message || String(error)}`
    trace.steps.push({ key: 'save-result', label: '落库结果', status: 'error', data: { error: message } })
    return { ok: false, summary: '', error: message, trace }
  }
  const summary = `${expansion.summary} · 河名「${name}」 · 落库 1 件`
  trace.steps.push({ key: 'save-result', label: '落库结果', status: 'success', data: { summary, featureCount: 1 } })
  return { ok: true, summary, groupId, trace, ...(input.deps?.reviewDraft ? { reviewStatus: 'confirmed' as const } : {}) }
}
