import { fetchWorldMapBundle, saveWorldMapFeaturesRemote } from '../../repositories/chatRepository'
import type { WorldMapFeatureRecord } from '../../types'
import { polygonsOverlap, type MapPoint } from '../mapGeometry'
import { buildMapDraftReviewItem, createMapSheetRevision, runMapDraftReviewGate } from '../mapDraftReview'
import { resolveMapTaskPlacement, validatePointSetsInTaskPlacement, type MapTaskPlacementRequest } from '../mapTaskPlacement'
import { resolveWorldDefaultMapSheet } from '../worldMapDefaultSheet'
import type { RunMountainArmorWorkDeps, RunMountainArmorWorkResult } from './armorOrchestration'
import type { ArmorPainterCallModel } from './armorPainter'
import { buildWaterDotMatrix, strokeToWorldSkeleton } from './dotMatrix'
import { expandRiverArmor } from './riverArmor'
import type { MapDrawTrace, WaterArmorParams } from './types'
import { expandWaterArmor } from './waterArmor'
import { autoConnectRiverEndpoints, type WaterConnectionTarget } from './waterConnections'
import { runWaterPainter } from './waterPainter'

export interface RunWaterArmorWorkInput {
  worldId: string
  task: string
  name?: string
  waterKind?: 'lake' | 'ocean'
  params?: WaterArmorParams
  seed?: number
  callModel: ArmorPainterCallModel
  placement?: MapTaskPlacementRequest
  deps?: RunMountainArmorWorkDeps
}

function definedParams(params: WaterArmorParams | undefined): WaterArmorParams {
  if (!params) return {}
  return Object.fromEntries(Object.entries(params).filter(([, value]) => value !== undefined)) as WaterArmorParams
}

function armorOf(record: WorldMapFeatureRecord): Record<string, any> | undefined {
  const meta = record.meta as { armor?: Record<string, any> } | null | undefined
  return meta?.armor
}

/** 新面状水体唯一写链：模型只画闭合表面，代码展开深度层并把近距自由河端补接到岸线。 */
export async function runWaterArmorWork(input: RunWaterArmorWorkInput): Promise<RunMountainArmorWorkResult> {
  const fetchBundle = input.deps?.fetchBundle ?? fetchWorldMapBundle
  const saveFeatures = input.deps?.saveFeatures ?? saveWorldMapFeaturesRemote
  let bundle: Awaited<ReturnType<typeof fetchWorldMapBundle>>
  try {
    bundle = await fetchBundle(input.worldId)
  } catch (error) {
    return { ok: false, summary: '', error: `读取舆图失败：${(error as Error)?.message || String(error)}` }
  }
  const sheet = resolveWorldDefaultMapSheet(bundle)
  if (!sheet) return { ok: false, summary: '', error: '这个世界还没有舆图图纸，请先创建图纸再来画水体。' }
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
  const trace: MapDrawTrace = {
    version: 1,
    kind: 'water-armor',
    steps: [{ key: 'task-frame', label: '作画任务域', status: 'success', data: { placement } }]
  }
  let projection: ReturnType<typeof buildWaterDotMatrix>
  try {
    const waterRegions = (sheet.features || [])
      .filter((feature) => feature.kind === 'region' && feature.category === 'water' && armorOf(feature)?.role !== 'depth-band')
      .map((feature) => feature.geometry.pts as MapPoint[])
    projection = buildWaterDotMatrix({
      framePts: placement.frame.pts,
      containmentRegion: placement.containmentRegion,
      waterRegions
    })
    trace.steps.push({ key: 'dot-matrix', label: '水体点阵投影', status: 'success', data: { spec: projection.spec, text: projection.text } })
  } catch (error) {
    const message = `水体点阵投影失败：${(error as Error)?.message || String(error)}`
    trace.steps.push({ key: 'dot-matrix', label: '水体点阵投影', status: 'error', data: { error: message } })
    return { ok: false, summary: '', error: message, trace }
  }

  const paint = await runWaterPainter({ task: input.task, projection, waterKind: input.waterKind, callModel: input.callModel })
  trace.steps.push({ key: 'model-output', label: '模型原文、水面命令与逐次校验', status: paint.ok ? 'success' : 'error', data: paint.attemptTrace })
  if (!paint.ok || !paint.outline) return { ok: false, summary: '', error: paint.error || '地貌师未能产出合法水体轮廓', trace }

  const seed = Number.isFinite(Number(input.seed)) ? Math.trunc(Number(input.seed)) : Math.floor(Math.random() * 0x7fffffff)
  const groupId = `armor-water-${seed}-${Math.random().toString(36).slice(2, 8)}`
  const usedParams = { ...definedParams(paint.params), ...definedParams(input.params), ...(input.waterKind ? { waterKind: input.waterKind } : {}) }
  let expansion: ReturnType<typeof expandWaterArmor>
  try {
    expansion = expandWaterArmor(strokeToWorldSkeleton(paint.outline, projection.spec), usedParams, seed)
  } catch (error) {
    const message = `水体参数或深度层派生失败：${(error as Error)?.message || String(error)}`
    trace.steps.push({ key: 'armor-expansion', label: '代码派生水深', status: 'error', data: { error: message } })
    return { ok: false, summary: '', error: message, trace }
  }
  trace.steps.push({
    key: 'armor-expansion', label: '代码派生水深', status: 'success',
    data: { seed, inputParams: usedParams, resolvedParams: expansion.resolvedParams, outline: expansion.outline, layers: expansion.layers }
  })

  const placementCheck = validatePointSetsInTaskPlacement(expansion.layers.map((layer) => layer.pts), placement)
  let conflict = ''
  for (const feature of sheet.features || []) {
    if (feature.kind !== 'region' || feature.category !== 'water' || armorOf(feature)?.role === 'depth-band') continue
    const points = feature.geometry?.pts as MapPoint[]
    if (points?.length >= 3 && polygonsOverlap(expansion.layers[0].pts, points)) {
      conflict = `水面与已有水域「${feature.name}」重叠`
      break
    }
  }
  if (!placementCheck.ok || conflict) {
    const reason = placementCheck.reason || conflict
    trace.steps.push({ key: 'final-geometry-validation', label: '最终水体占地校验', status: 'error', data: { reason } })
    return { ok: false, summary: '', error: `最终水体占地校验失败：${reason}。本次没有写入地图。`, trace }
  }

  const name = String(input.name || paint.name || '').trim() || (expansion.resolvedParams.waterKind === 'ocean' ? '新海域' : '新湖泊')
  const surfaceId = `water-${seed}-${Math.random().toString(36).slice(2, 8)}`
  const armorBase = {
    version: 1,
    type: 'water',
    outline: expansion.outline,
    params: expansion.resolvedParams,
    resolvedParams: expansion.resolvedParams,
    seed,
    groupId,
    placement
  }
  const waterItems = expansion.layers.map((layer) => ({
    id: layer.layerIndex === 0 ? surfaceId : `${surfaceId}-depth-${layer.layerIndex}`,
    sheetId: sheet.id,
    kind: 'region' as const,
    category: 'water',
    name: layer.layerIndex === 0 ? name : `${name}·深水${layer.layerIndex}`,
    layer: 'terrain' as const,
    geometry: { pts: layer.pts, depthM: layer.depthM },
    style: { rough: { iter: 0, amp: 0 } },
    meta: {
      armor: { ...armorBase, role: layer.role, layerIndex: layer.layerIndex, depthRatio: layer.depthRatio },
      drawTrace: trace
    } as Record<string, unknown>
  }))

  const target: WaterConnectionTarget = { featureId: surfaceId, name, pts: expansion.layers[0].pts }
  const riverUpdates: Array<Record<string, unknown>> = []
  const riverPreviewFeatures: Parameters<typeof buildMapDraftReviewItem>[0]['features'] = []
  const connectedRivers: Array<{ featureId: string; name: string; endpoint: 'source' | 'mouth'; gapM: number }> = []
  for (const river of sheet.features || []) {
    const armor = armorOf(river)
    if (river.kind !== 'path' || river.category !== 'river' || armor?.type !== 'river' || !Array.isArray(armor.spine)) continue
    const anchors = armor.anchors && typeof armor.anchors === 'object' ? armor.anchors as Record<string, unknown> : {}
    const connected = autoConnectRiverEndpoints(armor.spine as MapPoint[], [target], expansion.resolvedParams.connectionGapM, {
      source: Boolean(anchors.source), mouth: Boolean(anchors.mouth)
    })
    const endpoint = connected.mouth ? 'mouth' : connected.source ? 'source' : null
    const match = connected.mouth || connected.source
    if (!endpoint || !match) continue
    try {
      const riverExpansion = expandRiverArmor(connected.spine, armor.params || {}, armor.seed ?? river.id)
      const nextAnchors = {
        ...anchors,
        [endpoint]: { candidateId: `auto:${surfaceId}`, featureId: surfaceId, name, role: endpoint, point: endpoint === 'mouth' ? connected.spine[connected.spine.length - 1] : connected.spine[0], autoConnected: true }
      }
      const updatedMeta = { ...(river.meta || {}), armor: { ...armor, spine: riverExpansion.spine, anchors: nextAnchors } }
      riverUpdates.push({
        id: river.id,
        geometry: { ...river.geometry, pts: riverExpansion.projectedSpine },
        meta: updatedMeta
      })
      riverPreviewFeatures.push({
        kind: river.kind,
        category: river.category,
        name: river.name,
        layer: river.layer,
        geometry: { ...river.geometry, pts: riverExpansion.projectedSpine, bank: riverExpansion.bank },
        style: river.style,
        meta: updatedMeta
      })
      connectedRivers.push({ featureId: river.id, name: river.name, endpoint, gapM: match.distanceM })
    } catch (error) {
      const message = `近距河流「${river.name}」自动连通失败：${(error as Error)?.message || String(error)}`
      trace.steps.push({ key: 'river-auto-connect', label: '近距河流自动连通', status: 'error', data: { error: message } })
      return { ok: false, summary: '', error: message, trace }
    }
  }
  trace.steps.push({ key: 'river-auto-connect', label: '近距河流自动连通', status: 'success', data: { thresholdM: expansion.resolvedParams.connectionGapM, connectedRivers } })
  trace.steps.push({ key: 'final-geometry-validation', label: '最终水体占地校验', status: 'success', data: { placement } })

  const items = [...waterItems, ...riverUpdates]
  trace.steps.push({ key: 'save-validation', label: '落库前校验', status: 'success', data: { sheetId: sheet.id, groupId, featureCount: items.length } })
  if (input.deps?.reviewDraft) {
    const reviewId = `terrain:${groupId}`
    const request = {
      kind: 'map-final-draft-review' as const,
      worldId: input.worldId,
      sheetId: sheet.id,
      baseRevision,
      title: `确认水体「${name}」的最终落笔`,
      items: [buildMapDraftReviewItem({
        id: reviewId,
        label: name,
        category: 'water',
        kind: 'region',
        change: `新增同组浅水与深水层${connectedRivers.length ? `，并自动接通 ${connectedRivers.length} 条近距河流` : ''}`,
        basis: '已通过闭合轮廓、任务域、水域冲突、深度展开与近距连通校验',
        features: [...waterItems, ...riverPreviewFeatures]
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
      const message = gate.status === 'cancelled' ? '已取消这次水体草稿，地图没有写入。' : gate.error
      trace.steps.push({ key: 'draft-review', label: '最终草稿审阅', status: gate.status === 'cancelled' ? 'success' : 'error', data: { status: gate.status, message } })
      return { ok: false, summary: message, error: message, trace, reviewStatus: gate.status === 'stale' ? 'stale' : 'cancelled' }
    }
    if (gate.decision.modified.includes(reviewId)) {
      const feedback = String(gate.decision.comments[reviewId] || '').trim()
      const message = `用户要求修改「${name}」：${feedback}。当前草稿已丢弃，地图没有写入。`
      return { ok: false, summary: message, error: message, trace, reviewStatus: 'modify', reviewFeedback: feedback }
    }
    if (gate.decision.deleted.includes(reviewId)) {
      const message = `已删除水体草稿「${name}」，地图没有写入。`
      return { ok: false, summary: message, trace, reviewStatus: 'deleted' }
    }
    trace.steps.push({ key: 'draft-review', label: '最终草稿审阅', status: 'success', data: { status: 'confirmed' } })
  }

  try {
    await saveFeatures(input.worldId, items, { runKey: `armor-${groupId}`, runLabel: `地貌绘制·${name}` })
  } catch (error) {
    const message = `落库失败：${(error as Error)?.message || String(error)}`
    trace.steps.push({ key: 'save-result', label: '落库结果', status: 'error', data: { error: message } })
    return { ok: false, summary: '', error: message, trace }
  }
  const summary = `${expansion.summary} · 水体「${name}」 · ${connectedRivers.length ? `接通 ${connectedRivers.length} 条河流 · ` : ''}落库 ${items.length} 件`
  trace.steps.push({ key: 'save-result', label: '落库结果', status: 'success', data: { summary, featureCount: items.length } })
  return { ok: true, summary, groupId, trace, ...(input.deps?.reviewDraft ? { reviewStatus: 'confirmed' as const } : {}) }
}
