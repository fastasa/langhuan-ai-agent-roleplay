import { nearestPointOnPolyline, type MapPoint } from '../mapGeometry'
import type { WorldMapFeatureRecord } from '../../types'

export type RiverAnchorRole = 'source' | 'mouth'

export interface RiverAnchorCandidate {
  id: string
  role: RiverAnchorRole
  featureId: string
  name: string
  kind: 'region' | 'path'
  category: string
  /** 给模型看的代表点；正式吸附仍按目标几何求最近点。 */
  point: MapPoint
  targetPoints: MapPoint[]
}

export interface RiverAnchorRef {
  candidateId: string
  featureId: string
  name: string
  role: RiverAnchorRole
  point: MapPoint
}

function centroid(points: MapPoint[]): MapPoint {
  if (!points.length) return [0, 0]
  return [
    points.reduce((sum, point) => sum + Number(point[0] || 0), 0) / points.length,
    points.reduce((sum, point) => sum + Number(point[1] || 0), 0) / points.length
  ]
}

function recordArmor(record: WorldMapFeatureRecord): Record<string, unknown> | null {
  const armor = (record.meta as { armor?: unknown } | null | undefined)?.armor
  return armor && typeof armor === 'object' ? armor as Record<string, unknown> : null
}

function mountainSourceRecords(records: WorldMapFeatureRecord[]): WorldMapFeatureRecord[] {
  const groups = new Map<string, WorldMapFeatureRecord>()
  const plain: WorldMapFeatureRecord[] = []
  for (const record of records) {
    if (record.kind !== 'region' || record.category !== 'mountain') continue
    const armor = recordArmor(record)
    const groupId = armor?.type === 'mountain' && typeof armor.groupId === 'string' ? armor.groupId : ''
    if (!groupId) {
      plain.push(record)
      continue
    }
    const current = groups.get(groupId)
    if (!current || (!current.geometry?.spine?.length && record.geometry?.spine?.length)) groups.set(groupId, record)
  }
  return [...groups.values(), ...plain]
}

function candidateGeometry(record: WorldMapFeatureRecord): MapPoint[] {
  const spine = record.geometry?.spine as MapPoint[] | undefined
  if (record.category === 'mountain' && Array.isArray(spine) && spine.length >= 2) return spine
  return (record.geometry?.pts || []) as MapPoint[]
}

function isWaterSurfaceRecord(record: WorldMapFeatureRecord): boolean {
  if (record.kind !== 'region' || record.category !== 'water') return false
  const armor = recordArmor(record)
  return armor?.type !== 'water' || armor.role === 'surface' || Number(armor.layerIndex) === 0
}

/** 现有面状山地/水域可作源头，水域/既有河流可作终点或汇流点。 */
export function collectRiverAnchorCandidates(records: WorldMapFeatureRecord[]): RiverAnchorCandidate[] {
  const sourceRecords = [
    ...mountainSourceRecords(records),
    ...records.filter(isWaterSurfaceRecord)
  ]
  const mouthRecords = records.filter((record) =>
    isWaterSurfaceRecord(record)
    || (record.kind === 'path' && record.category === 'river')
  )
  const build = (record: WorldMapFeatureRecord, role: RiverAnchorRole, index: number): RiverAnchorCandidate => {
    const targetPoints = candidateGeometry(record)
    return {
      id: `${role === 'source' ? 'S' : 'M'}${index + 1}`,
      role,
      featureId: record.id,
      name: record.name,
      kind: record.kind as 'region' | 'path',
      category: record.category,
      point: record.kind === 'path' ? (targetPoints[targetPoints.length - 1] || [0, 0]) : centroid(targetPoints),
      targetPoints
    }
  }
  return [
    ...sourceRecords.filter((record) => candidateGeometry(record).length >= 2).map((record, index) => build(record, 'source', index)),
    ...mouthRecords.filter((record) => candidateGeometry(record).length >= 2).map((record, index) => build(record, 'mouth', index))
  ]
}

export function resolveRiverAnchorCandidate(
  candidates: RiverAnchorCandidate[],
  role: RiverAnchorRole,
  identifier: string | undefined
): RiverAnchorCandidate | undefined {
  const value = String(identifier || '').trim()
  if (!value) return undefined
  const available = candidates.filter((candidate) => candidate.role === role)
  const exact = available.filter((candidate) => candidate.id === value || candidate.featureId === value || candidate.name === value)
  if (exact.length === 1) return exact[0]
  if (exact.length > 1) throw new Error(`${role === 'source' ? '源头' : '终点'}「${value}」对应多个要素，请改用 featureId`)
  throw new Error(`没有找到可作${role === 'source' ? '源头' : '终点'}的要素「${value}」`)
}

export function anchorPointForCandidate(candidate: RiverAnchorCandidate, from: MapPoint): MapPoint {
  const points = candidate.kind === 'region'
    ? [...candidate.targetPoints, candidate.targetPoints[0]]
    : candidate.targetPoints
  return nearestPointOnPolyline(from, points).point
}

export function snapRiverSpineToAnchors(
  spine: MapPoint[],
  source: RiverAnchorCandidate | undefined,
  mouth: RiverAnchorCandidate | undefined
): { spine: MapPoint[]; anchors: { source?: RiverAnchorRef; mouth?: RiverAnchorRef } } {
  if (spine.length < 2) throw new Error('河流脊线至少需要 2 个点')
  if (source && mouth && source.featureId === mouth.featureId) throw new Error('河流源头和终点不能是同一个地图要素')
  const result = spine.map((point) => point.slice() as MapPoint)
  const anchors: { source?: RiverAnchorRef; mouth?: RiverAnchorRef } = {}
  if (source) {
    const point = anchorPointForCandidate(source, result[0])
    result[0] = point
    anchors.source = { candidateId: source.id, featureId: source.featureId, name: source.name, role: 'source', point }
  }
  if (mouth) {
    const last = result.length - 1
    const point = anchorPointForCandidate(mouth, result[last])
    result[last] = point
    anchors.mouth = { candidateId: mouth.id, featureId: mouth.featureId, name: mouth.name, role: 'mouth', point }
  }
  return { spine: result, anchors }
}
