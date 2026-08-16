import type { MapFeature, MapPoint } from './mapGeometry'
import { polygonsOverlap, snapIntoRegion } from './mapGeometry'
import { bumpTerrainRevision } from './mapTerrainRevision'
import { validatePointSetsInTaskPlacement, type ResolvedMapTaskPlacement } from './mapTaskPlacement'
import { expandGrassArmor } from './mapArmor/grassArmor'
import { expandMountainArmor } from './mapArmor/mountainArmor'
import { expandRiverArmor } from './mapArmor/riverArmor'
import { expandWaterArmor } from './mapArmor/waterArmor'
import { anchorPointForCandidate, collectRiverAnchorCandidates } from './mapArmor/riverAnchors'
import type { MountainArmorParams, RiverArmorParams, WaterArmorParams } from './mapArmor/types'
import { compileVectorPrimitive, type MapVectorPrimitive } from './mapDrawing/vectorPrimitive'
import {
  createMapGeometryEditDraft,
  validateMapGeometryEditDraft,
  type MapGeometryEditDraft,
  type MapGeometrySemanticSnapCandidate
} from './mapGeometryEditing'
import { projectWorldMapFeature } from './worldMapViewProjection'
import { saveWorldMapFeaturesRemote } from '../repositories/chatRepository'
import type { WorldMapFeatureRecord } from '../types'

type TerrainEditType = 'mountain' | 'river' | 'water' | 'grass' | 'circle' | 'ellipse' | 'rect' | 'polygon' | 'path'

export interface MapTerrainEditSession {
  type: TerrainEditType
  name: string
  sourceFeatureId: string
  featureIds: string[]
  records: WorldMapFeatureRecord[]
  worldRecords: WorldMapFeatureRecord[]
  seed?: number
  geometry?: MapGeometryEditDraft
  noiseSkip?: number
  placement?: ResolvedMapTaskPlacement
  values: Record<string, number | string>
}

export interface MapTerrainEditBuild {
  previewFeatures: MapFeature[]
  items: Array<Record<string, unknown>>
}

export type MapTerrainEditSelection =
  | { ok: true; session: MapTerrainEditSession }
  | { ok: false; reason: string; selectedFeatureIds: string[] }

type ArmorMeta = {
  type?: string
  groupId?: string
  seed?: number
  skeleton?: MapPoint[]
  spine?: MapPoint[]
  params?: Record<string, unknown>
  resolvedParams?: Record<string, unknown>
  placement?: ResolvedMapTaskPlacement
  version?: number
  noiseSkip?: number
  anchors?: Record<string, unknown>
  outline?: MapPoint[]
  role?: string
  layerIndex?: number
}

function recordMeta(record: WorldMapFeatureRecord): Record<string, any> {
  return record.meta && typeof record.meta === 'object' ? record.meta as Record<string, any> : {}
}

function finite(value: unknown, field: string): number {
  const normalized = Number(value)
  if (!Number.isFinite(normalized)) throw new Error(`${field} 必须是有限数值`)
  return normalized
}

function positive(value: unknown, field: string): number {
  const normalized = finite(value, field)
  if (normalized <= 0) throw new Error(`${field} 必须大于 0`)
  return normalized
}

function ranged(value: unknown, field: string, min: number, max: number): number {
  const normalized = finite(value, field)
  if (normalized < min || normalized > max) throw new Error(`${field} 必须在 ${min}~${max} 之间`)
  return normalized
}

function baseTerrainName(name: string): string {
  return String(name || '').replace(/·(?:主山体|山脊带|峰线|深水\d+)$/, '').trim() || '未命名地形'
}

function mountainLayerRank(record: WorldMapFeatureRecord): number {
  if (record.name.endsWith('·主山体')) return 0
  if (record.name.endsWith('·山脊带')) return 1
  if (record.name.endsWith('·峰线')) return 2
  return Number(record.geometry?.elevationM ?? Number.MAX_SAFE_INTEGER)
}

function armorOf(record: WorldMapFeatureRecord): ArmorMeta | null {
  const armor = recordMeta(record).armor
  return armor && typeof armor === 'object' ? armor as ArmorMeta : null
}

function selectionFailure(reason: string, featureIds: string[] = []): MapTerrainEditSelection {
  return { ok: false, reason, selectedFeatureIds: featureIds }
}

/**
 * 地图要素 → 人工参数编辑会话。
 *
 * 只接受拥有稳定参数真值的装甲或结构化图元。polygon/path 直接编辑
 * meta.vectorPrimitive.points；没有该元数据的旧点列仍不反猜、不升级成第三套真值。
 */
export function createMapTerrainEditSession(
  records: WorldMapFeatureRecord[],
  featureId: string
): MapTerrainEditSelection {
  const selected = records.find((record) => record.id === featureId)
  if (!selected) return selectionFailure('没有找到这个地图要素')

  const armor = armorOf(selected)
  if (armor?.type === 'mountain') {
    if (selected.layer !== 'terrain') return selectionFailure('山脉装甲必须位于自然地形层', [selected.id])
    const groupId = String(armor.groupId || '')
    const group = (groupId
      ? records.filter((record) => String(armorOf(record)?.groupId || '') === groupId)
      : [selected]).slice().sort((left, right) => mountainLayerRank(left) - mountainLayerRank(right))
    const skeleton = Array.isArray(armor.skeleton) ? armor.skeleton.map((point) => [Number(point[0]), Number(point[1])] as MapPoint) : []
    const seed = Math.trunc(Number(armor.seed))
    if (skeleton.length < 2 || !Number.isFinite(seed)) {
      return selectionFailure('这座旧山脉缺少可重放的骨架或 seed，暂时不能参数化编辑', group.map((record) => record.id))
    }
    const originalParams = (armor.params || {}) as MountainArmorParams
    const current = armor.version === 2
      ? expandMountainArmor(skeleton, originalParams, seed, { paramsResolved: true, noiseSkip: Number(armor.noiseSkip) || 0 })
      : expandMountainArmor(skeleton, originalParams, seed)
    const resolved = current.resolvedParams
    const noiseSkip = armor.version === 2
      ? Math.max(0, Math.min(2, Math.trunc(Number(armor.noiseSkip) || 0)))
      : Number(originalParams.peakElevationM === undefined) + Number(originalParams.baseWidthM === undefined)
    return {
      ok: true,
      session: {
        type: 'mountain',
        name: baseTerrainName(selected.name),
        sourceFeatureId: selected.id,
        featureIds: group.map((record) => record.id),
        records: group,
        worldRecords: records,
        seed,
        geometry: createMapGeometryEditDraft('mountain-skeleton', skeleton),
        noiseSkip,
        placement: armor.placement,
        values: {
          peakElevationM: resolved.peakElevationM,
          baseWidthM: resolved.baseWidthM,
          steepness: resolved.steepness,
          ruggedness: resolved.ruggedness,
          asymmetry: resolved.asymmetry,
          layers: resolved.layers
        }
      }
    }
  }

  if (armor?.type === 'grass') {
    if (selected.layer !== 'terrain') return selectionFailure('草原装甲必须位于自然地形层', [selected.id])
    const groupId = String(armor.groupId || '')
    const group = groupId
      ? records.filter((record) => String(armorOf(record)?.groupId || '') === groupId)
      : [selected]
    const params = { ...(armor.params || {}), ...(armor.resolvedParams || {}) } as Record<string, any>
    const center = Array.isArray(params.center) ? params.center : [0, 0]
    const seed = Math.trunc(Number(armor.seed))
    if (!Number.isFinite(seed)) return selectionFailure('这片旧草原缺少可重放的 seed，暂时不能参数化编辑', group.map((record) => record.id))
    return {
      ok: true,
      session: {
        type: 'grass',
        name: baseTerrainName(selected.name),
        sourceFeatureId: selected.id,
        featureIds: group.map((record) => record.id),
        records: group,
        worldRecords: records,
        seed,
        placement: armor.placement,
        values: {
          centerX: finite(center[0], 'centerX'),
          centerY: finite(center[1], 'centerY'),
          widthM: positive(params.widthM, 'widthM'),
          heightM: positive(params.heightM, 'heightM'),
          shape: params.shape === 'exact' ? 'exact' : 'organic',
          ruggedness: finite(params.ruggedness ?? 0.28, 'ruggedness')
        }
      }
    }
  }

  if (armor?.type === 'river') {
    if (selected.kind !== 'path' || selected.category !== 'river' || selected.layer !== 'terrain') {
      return selectionFailure('河流装甲必须是自然地形层的 river path', [selected.id])
    }
    const spine = Array.isArray(armor.spine)
      ? armor.spine.map((point) => [Number(point[0]), Number(point[1])] as MapPoint)
      : []
    const seed = Math.trunc(Number(armor.seed))
    if (spine.length < 2 || !Number.isFinite(seed)) {
      return selectionFailure('这条旧河流缺少可重放的脊线或 seed，暂时不能参数化编辑', [selected.id])
    }
    const params = { ...(armor.params || {}), ...(armor.resolvedParams || {}) } as Record<string, any>
    const sourcePoint = spine[0]
    const mouthPoint = spine[spine.length - 1]
    const semanticCandidates: MapGeometrySemanticSnapCandidate[] = collectRiverAnchorCandidates(records)
      .filter((candidate) => candidate.featureId !== selected.id)
      .map((candidate) => ({
        id: candidate.id,
        label: candidate.name,
        featureId: candidate.featureId,
        role: candidate.role === 'source' ? 'source' : candidate.category === 'river' ? 'junction' : 'shore',
        point: anchorPointForCandidate(candidate, candidate.role === 'source' ? sourcePoint : mouthPoint)
      }))
    return {
      ok: true,
      session: {
        type: 'river',
        name: baseTerrainName(selected.name),
        sourceFeatureId: selected.id,
        featureIds: [selected.id],
        records: [selected],
        worldRecords: records,
        seed,
        geometry: createMapGeometryEditDraft('river-spine', spine, { semanticCandidates }),
        placement: armor.placement,
        values: {
          sourceWidthM: positive(params.sourceWidthM, 'sourceWidthM'),
          mouthWidthM: positive(params.mouthWidthM, 'mouthWidthM'),
          growthExponent: finite(params.growthExponent ?? 0.5, 'growthExponent'),
          bankRoughness: finite(params.bankRoughness ?? 0.18, 'bankRoughness'),
          mouthCap: params.mouthCap === 'flare' ? 'flare' : 'flat',
          mouthFlareRatio: finite(params.mouthFlareRatio ?? 5, 'mouthFlareRatio')
        }
      }
    }
  }

  if (armor?.type === 'water') {
    if (selected.kind !== 'region' || selected.category !== 'water' || selected.layer !== 'terrain') {
      return selectionFailure('水体装甲必须是自然地形层的 water region', [selected.id])
    }
    const groupId = String(armor.groupId || '')
    const group = (groupId
      ? records.filter((record) => String(armorOf(record)?.groupId || '') === groupId)
      : [selected]).slice().sort((left, right) => Number(armorOf(left)?.layerIndex || 0) - Number(armorOf(right)?.layerIndex || 0))
    const surface = group.find((record) => armorOf(record)?.role === 'surface') || group[0]
    const surfaceArmor = armorOf(surface) || armor
    const outline = Array.isArray(surfaceArmor.outline)
      ? surfaceArmor.outline.map((point) => [Number(point[0]), Number(point[1])] as MapPoint)
      : []
    const seed = Math.trunc(Number(surfaceArmor.seed))
    const params = { ...(surfaceArmor.params || {}), ...(surfaceArmor.resolvedParams || {}) } as Record<string, any>
    if (outline.length < 5 || !Number.isFinite(seed)) {
      return selectionFailure('这片旧水体缺少可重放的表面轮廓或 seed，暂时不能参数化编辑', group.map((record) => record.id))
    }
    return {
      ok: true,
      session: {
        type: 'water',
        name: baseTerrainName(surface.name),
        sourceFeatureId: surface.id,
        featureIds: group.map((record) => record.id),
        records: group,
        worldRecords: records,
        seed,
        geometry: createMapGeometryEditDraft('water-outline', outline),
        placement: surfaceArmor.placement,
        values: {
          waterKind: params.waterKind === 'ocean' ? 'ocean' : 'lake',
          maxDepthM: positive(params.maxDepthM, 'maxDepthM'),
          shoreShelfRatio: finite(params.shoreShelfRatio ?? 0.22, 'shoreShelfRatio'),
          depthCurve: finite(params.depthCurve ?? 1.15, 'depthCurve'),
          ruggedness: finite(params.ruggedness ?? 0.3, 'ruggedness'),
          layers: Math.trunc(positive(params.layers ?? group.length, 'layers')),
          connectionGapM: positive(params.connectionGapM ?? 300, 'connectionGapM')
        }
      }
    }
  }

  const primitive = recordMeta(selected).vectorPrimitive as MapVectorPrimitive | undefined
  if (primitive) {
    const values: Record<string, number | string> = {}
    let geometry: MapGeometryEditDraft | undefined
    if (primitive.type === 'circle' || primitive.type === 'ellipse' || primitive.type === 'rect') {
      const center = primitive.center
      values.centerX = finite(center[0], 'centerX')
      values.centerY = finite(center[1], 'centerY')
      if (primitive.type === 'circle') values.radiusM = positive(primitive.radiusM, 'radiusM')
      else {
        values.widthM = positive(primitive.widthM, 'widthM')
        values.heightM = positive(primitive.heightM, 'heightM')
      }
    } else {
      geometry = createMapGeometryEditDraft(
        primitive.type === 'polygon' ? 'polygon-vertices' : 'path-vertices',
        primitive.points
      )
    }
    return {
      ok: true,
      session: {
        type: primitive.type,
        name: baseTerrainName(selected.name),
        sourceFeatureId: selected.id,
        featureIds: [selected.id],
        records: [selected],
        worldRecords: records,
        placement: recordMeta(selected).placement as ResolvedMapTaskPlacement | undefined,
        geometry,
        values
      }
    }
  }

  return selectionFailure('这个要素没有稳定的参数或结构化顶点真值，不能从渲染点列反猜', [selected.id])
}

function validatePlacement(pointSets: MapPoint[][], placement: ResolvedMapTaskPlacement | undefined): void {
  if (!placement) return
  const check = validatePointSetsInTaskPlacement(pointSets, placement)
  if (!check.ok) throw new Error(check.reason || '调整后的地形越过原作画任务域')
}

function updateMeta(record: WorldMapFeatureRecord, patch: Record<string, unknown>): Record<string, unknown> {
  return { ...recordMeta(record), ...patch }
}

export function buildMapTerrainEdit(session: MapTerrainEditSession): MapTerrainEditBuild {
  const name = String(session.name || '').trim()
  if (!name) throw new Error('地形名称不能为空')

  if (session.type === 'mountain') {
    if (!session.geometry || session.geometry.target !== 'mountain-skeleton') throw new Error('山脉缺少可编辑骨架')
    const editGeometry = session.geometry
    validateMapGeometryEditDraft(editGeometry)
    const layers = Math.trunc(positive(session.values.layers, 'layers'))
    if (layers !== session.records.length) {
      throw new Error('当前批次不改变山脉层数；层数增删需要服务端原子混合写删后再开放')
    }
    const params: Required<MountainArmorParams> = {
      peakElevationM: positive(session.values.peakElevationM, 'peakElevationM'),
      baseWidthM: positive(session.values.baseWidthM, 'baseWidthM'),
      steepness: ranged(session.values.steepness, 'steepness', 0, 1),
      ruggedness: ranged(session.values.ruggedness, 'ruggedness', 0, 1),
      asymmetry: ranged(session.values.asymmetry, 'asymmetry', -1, 1),
      layers: layers as 2 | 3
    }
    const expansion = expandMountainArmor(editGeometry.points, params, Number(session.seed), {
      paramsResolved: true,
      noiseSkip: session.noiseSkip
    })
    validatePlacement(expansion.features.map((feature) => feature.pts), session.placement)
    const base = expansion.features[0]?.pts || []
    const groupIds = new Set(session.featureIds)
    for (const record of session.worldRecords) {
      if (groupIds.has(record.id) || record.kind !== 'region') continue
      const pts = record.geometry?.pts as MapPoint[]
      if (!pts?.length) continue
      if ((record.category === 'water' || record.category === 'mountain') && polygonsOverlap(base, pts)) {
        throw new Error(`调整后的山体与已有${record.category === 'water' ? '水域' : '山体'}「${record.name}」重叠`)
      }
    }
    const previewFeatures: MapFeature[] = []
    const items = expansion.features.map((draft, index) => {
      const record = session.records[index]
      if (!record) throw new Error('山脉层数与已存要素不一致')
      const geometry = { pts: draft.pts, ...(draft.spine ? { spine: draft.spine } : {}), elevationM: draft.elevationM }
      const armor = {
        ...(armorOf(record) || {}),
        version: 2,
        type: 'mountain',
        skeleton: editGeometry.points,
        params,
        resolvedParams: params,
        seed: session.seed,
        noiseSkip: session.noiseSkip
      }
      const updated: WorldMapFeatureRecord = {
        ...record,
        name: `${name}·${draft.name}`,
        geometry,
        meta: updateMeta(record, { armor })
      }
      previewFeatures.push(projectWorldMapFeature(updated))
      return { id: record.id, name: updated.name, geometry, meta: updated.meta }
    })
    return { previewFeatures, items }
  }

  if (session.type === 'grass') {
    const record = session.records[0]
    const params = {
      center: [finite(session.values.centerX, 'centerX'), finite(session.values.centerY, 'centerY')] as MapPoint,
      widthM: positive(session.values.widthM, 'widthM'),
      heightM: positive(session.values.heightM, 'heightM'),
      shape: session.values.shape === 'exact' ? 'exact' as const : 'organic' as const,
      ruggedness: ranged(session.values.ruggedness, 'ruggedness', 0, 1)
    }
    const expansion = expandGrassArmor(params, Number(session.seed))
    validatePlacement([expansion.feature.pts], session.placement)
    const geometry = { pts: expansion.feature.pts, elevationM: expansion.feature.elevationM }
    const armor = {
      ...(armorOf(record) || {}), type: 'grass', params, resolvedParams: expansion.resolvedParams, seed: session.seed
    }
    const updated: WorldMapFeatureRecord = { ...record, name, geometry, meta: updateMeta(record, { armor }) }
    return {
      previewFeatures: [projectWorldMapFeature(updated)],
      items: [{ id: record.id, name, geometry, meta: updated.meta }]
    }
  }

  if (session.type === 'river') {
    if (!session.geometry || session.geometry.target !== 'river-spine') throw new Error('河流缺少可编辑脊线')
    validateMapGeometryEditDraft(session.geometry)
    const params: RiverArmorParams = {
      sourceWidthM: positive(session.values.sourceWidthM, 'sourceWidthM'),
      mouthWidthM: positive(session.values.mouthWidthM, 'mouthWidthM'),
      growthExponent: ranged(session.values.growthExponent, 'growthExponent', 0.1, 2),
      bankRoughness: ranged(session.values.bankRoughness, 'bankRoughness', 0, 0.6),
      mouthCap: session.values.mouthCap === 'flare' ? 'flare' : 'flat',
      mouthFlareRatio: ranged(session.values.mouthFlareRatio, 'mouthFlareRatio', 1, 10)
    }
    const expansion = expandRiverArmor(session.geometry.points, params, Number(session.seed))
    validatePlacement([expansion.projectedSpine, expansion.bank], session.placement)
    const endpointCandidates = session.geometry.semanticCandidates || []
    const findAttached = (point: MapPoint, roles: Set<string>) => endpointCandidates.find((candidate) =>
      roles.has(candidate.role) && Math.hypot(candidate.point[0] - point[0], candidate.point[1] - point[1]) < 1
    )
    const sourceCandidate = findAttached(expansion.spine[0], new Set(['source', 'shore']))
    const mouthCandidate = findAttached(expansion.spine[expansion.spine.length - 1], new Set(['mouth', 'junction', 'shore']))
    const connectedFeatureIds = new Set([sourceCandidate?.featureId, mouthCandidate?.featureId].filter(Boolean))
    for (const existing of session.worldRecords) {
      if (existing.id === session.sourceFeatureId || connectedFeatureIds.has(existing.id) || existing.kind !== 'region' || armorOf(existing)?.role === 'depth-band') continue
      if (existing.category !== 'water' && existing.category !== 'mountain') continue
      const pts = existing.geometry?.pts as MapPoint[]
      if (pts?.length >= 3 && polygonsOverlap(expansion.bank, pts)) {
        throw new Error(`调整后的河岸与未连接的${existing.category === 'water' ? '水域' : '山体'}「${existing.name}」重叠`)
      }
    }
    const anchors = {
      ...(sourceCandidate ? { source: { candidateId: sourceCandidate.id, featureId: sourceCandidate.featureId, name: sourceCandidate.label, role: 'source', point: expansion.spine[0] } } : {}),
      ...(mouthCandidate ? { mouth: { candidateId: mouthCandidate.id, featureId: mouthCandidate.featureId, name: mouthCandidate.label, role: 'mouth', point: expansion.spine[expansion.spine.length - 1] } } : {})
    }
    const record = session.records[0]
    const armor = {
      ...(armorOf(record) || {}),
      version: 1,
      type: 'river',
      spine: expansion.spine,
      params: expansion.resolvedParams,
      resolvedParams: expansion.resolvedParams,
      seed: session.seed,
      anchors
    }
    const geometry = { ...record.geometry, pts: expansion.projectedSpine }
    const updated: WorldMapFeatureRecord = { ...record, name, geometry, meta: updateMeta(record, { armor }) }
    return {
      previewFeatures: [projectWorldMapFeature(updated)],
      items: [{ id: record.id, name, geometry, meta: updated.meta }]
    }
  }


  if (session.type === 'water') {
    if (!session.geometry || session.geometry.target !== 'water-outline') throw new Error('水体缺少可编辑表面轮廓')
    validateMapGeometryEditDraft(session.geometry)
    const layers = Math.trunc(positive(session.values.layers, 'layers'))
    if (layers !== session.records.length) throw new Error('当前批次不改变水深层数；层数增删需要服务端原子混合写删后再开放')
    const params: WaterArmorParams = {
      waterKind: session.values.waterKind === 'ocean' ? 'ocean' : 'lake',
      maxDepthM: ranged(session.values.maxDepthM, 'maxDepthM', 1, 12_000),
      shoreShelfRatio: ranged(session.values.shoreShelfRatio, 'shoreShelfRatio', 0.05, 0.45),
      depthCurve: ranged(session.values.depthCurve, 'depthCurve', 0.4, 3),
      ruggedness: ranged(session.values.ruggedness, 'ruggedness', 0, 1),
      layers: layers as 2 | 3,
      connectionGapM: ranged(session.values.connectionGapM, 'connectionGapM', 10, 5_000)
    }
    const expansion = expandWaterArmor(session.geometry.points, params, Number(session.seed))
    validatePlacement(expansion.layers.map((layer) => layer.pts), session.placement)
    const groupIds = new Set(session.featureIds)
    for (const existing of session.worldRecords) {
      if (groupIds.has(existing.id) || existing.kind !== 'region' || existing.category !== 'water' || armorOf(existing)?.role === 'depth-band') continue
      const pts = existing.geometry?.pts as MapPoint[]
      if (pts?.length >= 3 && polygonsOverlap(expansion.layers[0].pts, pts)) throw new Error(`调整后的水面与已有水域「${existing.name}」重叠`)
    }
    const previewFeatures: MapFeature[] = []
    const items: Array<Record<string, unknown>> = expansion.layers.map((layer, index) => {
      const record = session.records[index]
      if (!record) throw new Error('水深层数与已存要素不一致')
      const armor = {
        ...(armorOf(record) || {}), type: 'water', outline: expansion.outline,
        params: expansion.resolvedParams, resolvedParams: expansion.resolvedParams, seed: session.seed,
        role: layer.role, layerIndex: layer.layerIndex, depthRatio: layer.depthRatio
      }
      const geometry = { pts: layer.pts, depthM: layer.depthM }
      const updated: WorldMapFeatureRecord = {
        ...record,
        name: index === 0 ? name : `${name}·深水${index}`,
        geometry,
        meta: updateMeta(record, { armor })
      }
      previewFeatures.push(projectWorldMapFeature(updated))
      return { id: record.id, name: updated.name, geometry, meta: updated.meta }
    })
    const surfaceId = session.sourceFeatureId
    for (const river of session.worldRecords) {
      const riverArmor = armorOf(river)
      if (river.kind !== 'path' || river.category !== 'river' || riverArmor?.type !== 'river' || !Array.isArray(riverArmor.spine)) continue
      const anchors = riverArmor.anchors && typeof riverArmor.anchors === 'object' ? riverArmor.anchors as Record<string, any> : {}
      const endpoint = anchors.mouth?.featureId === surfaceId ? 'mouth' : anchors.source?.featureId === surfaceId ? 'source' : null
      if (!endpoint) continue
      const spine = (riverArmor.spine as MapPoint[]).map((point) => point.slice() as MapPoint)
      const index = endpoint === 'mouth' ? spine.length - 1 : 0
      spine[index] = snapIntoRegion(spine[index], expansion.layers[0].pts, 30)
      const riverExpansion = expandRiverArmor(spine, riverArmor.params || {}, riverArmor.seed ?? river.id)
      validatePlacement([riverExpansion.projectedSpine, riverExpansion.bank], riverArmor.placement as ResolvedMapTaskPlacement | undefined)
      const nextAnchors = { ...anchors, [endpoint]: { ...anchors[endpoint], point: spine[index] } }
      const nextArmor = { ...riverArmor, spine: riverExpansion.spine, anchors: nextAnchors }
      const geometry = { ...river.geometry, pts: riverExpansion.projectedSpine }
      const meta = updateMeta(river, { armor: nextArmor })
      items.push({ id: river.id, geometry, meta })
      previewFeatures.push(projectWorldMapFeature({ ...river, geometry, meta }))
    }
    return { previewFeatures, items }
  }

  const record = session.records[0]
  if (session.type === 'polygon' || session.type === 'path') {
    if (!session.geometry) throw new Error('图元缺少可编辑顶点')
    validateMapGeometryEditDraft(session.geometry)
    const primitive: MapVectorPrimitive = { type: session.type, points: session.geometry.points }
    const compiled = compileVectorPrimitive({ primitive, category: record.category, name, layer: record.layer as 'terrain' | 'civic' })
    validatePlacement([compiled.pts], session.placement)
    const geometry = { ...record.geometry, pts: compiled.pts }
    const meta = updateMeta(record, { vectorPrimitive: compiled.primitive })
    const updated: WorldMapFeatureRecord = { ...record, name, geometry, meta }
    return {
      previewFeatures: [projectWorldMapFeature(updated)],
      items: [{ id: record.id, name, geometry, meta }]
    }
  }
  const center: MapPoint = [finite(session.values.centerX, 'centerX'), finite(session.values.centerY, 'centerY')]
  let primitive: MapVectorPrimitive
  if (session.type === 'circle') primitive = { type: 'circle', center, radiusM: positive(session.values.radiusM, 'radiusM') }
  else primitive = {
    type: session.type,
    center,
    widthM: positive(session.values.widthM, 'widthM'),
    heightM: positive(session.values.heightM, 'heightM')
  }
  const compiled = compileVectorPrimitive({ primitive, category: record.category, name, layer: record.layer as 'terrain' | 'civic' })
  validatePlacement([compiled.pts], session.placement)
  const geometry = { ...record.geometry, pts: compiled.pts }
  const meta = updateMeta(record, { vectorPrimitive: compiled.primitive })
  const updated: WorldMapFeatureRecord = { ...record, name, geometry, meta }
  return {
    previewFeatures: [projectWorldMapFeature(updated)],
    items: [{ id: record.id, name, geometry, meta }]
  }
}

export async function saveMapTerrainEdit(
  worldId: string,
  session: MapTerrainEditSession,
  build: MapTerrainEditBuild
): Promise<void> {
  const runKey = `terrain-edit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  await saveWorldMapFeaturesRemote(worldId, build.items, { runKey, runLabel: `编辑地图·${session.name.trim()}` })
  bumpTerrainRevision(worldId)
}
