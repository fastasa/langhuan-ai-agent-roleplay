import { nearestPointOnPolyline, pointInPoly, snapIntoRegion, type MapPoint } from '../mapGeometry'
import type { WorldMapFeatureRecord } from '../../types'

export interface WaterConnectionTarget {
  featureId: string
  name: string
  pts: MapPoint[]
}

export interface NearbyWaterConnection {
  target: WaterConnectionTarget
  distanceM: number
  point: MapPoint
}

export const DEFAULT_RIVER_WATER_CONNECTION_GAP_M = 500

function armorOf(record: WorldMapFeatureRecord): Record<string, unknown> | undefined {
  const meta = record.meta as { armor?: Record<string, unknown> } | null | undefined
  return meta?.armor
}

/** 水体装甲只让 surface 层参与连接；旧单层 water 仍作为兼容连接目标。 */
export function collectWaterConnectionTargets(records: WorldMapFeatureRecord[]): WaterConnectionTarget[] {
  return records
    .filter((record) => {
      if (record.kind !== 'region' || record.category !== 'water') return false
      const armor = armorOf(record)
      return armor?.type !== 'water' || armor.role === 'surface' || Number(armor.layerIndex) === 0
    })
    .map((record) => ({
      featureId: record.id,
      name: record.name,
      pts: (record.geometry?.pts || []) as MapPoint[]
    }))
    .filter((target) => target.pts.length >= 3)
}

export function findNearbyWaterConnection(
  point: MapPoint,
  targets: WaterConnectionTarget[],
  maxGapM: number
): NearbyWaterConnection | null {
  let best: NearbyWaterConnection | null = null
  for (const target of targets) {
    const inside = pointInPoly(point[0], point[1], target.pts)
    const nearest = inside
      ? { point, distance: 0 }
      : nearestPointOnPolyline(point, [...target.pts, target.pts[0]])
    if (nearest.distance > maxGapM || (best && nearest.distance >= best.distanceM)) continue
    best = {
      target,
      distanceM: nearest.distance,
      point: inside ? point : snapIntoRegion(point, target.pts, Math.min(30, Math.max(3, maxGapM * 0.05)))
    }
  }
  return best
}

/** 只补河流开放端点，不把中游横向拽进邻近水域。河口优先，其次才检查源头。 */
export function autoConnectRiverEndpoints(
  spine: MapPoint[],
  targets: WaterConnectionTarget[],
  maxGapM: number,
  locked: { source?: boolean; mouth?: boolean } = {}
): {
  spine: MapPoint[]
  source?: NearbyWaterConnection
  mouth?: NearbyWaterConnection
} {
  if (spine.length < 2) return { spine }
  const next = spine.map((point) => [...point] as MapPoint)
  const mouth = locked.mouth ? null : findNearbyWaterConnection(next[next.length - 1], targets, maxGapM)
  if (mouth) next[next.length - 1] = mouth.point
  const sourceTargets = mouth ? targets.filter((target) => target.featureId !== mouth.target.featureId) : targets
  const source = locked.source ? null : findNearbyWaterConnection(next[0], sourceTargets, maxGapM)
  if (source) next[0] = source.point
  return {
    spine: next,
    ...(source ? { source } : {}),
    ...(mouth ? { mouth } : {})
  }
}
