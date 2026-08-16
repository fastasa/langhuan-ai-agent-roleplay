import { bboxOf, pointInPoly, type MapFeatureKind, type MapPoint } from './mapGeometry'
import {
  computeMapTaskFrame,
  mapTaskFrameFromBounds,
  type MapTaskFrame
} from './mapTaskFrame'

export type MapPlacementMode = 'inside' | 'expand'
export type MapExpandDirection = 'north' | 'north-east' | 'east' | 'south-east' | 'south' | 'south-west' | 'west' | 'north-west'

export interface MapTaskPlacementFeature {
  id: string
  name: string
  kind: MapFeatureKind
  category: string
  pts: MapPoint[]
}

export interface MapTaskPlacementRequest {
  mode?: MapPlacementMode
  anchorFeature?: string
  direction?: MapExpandDirection
  widthM?: number
  heightM?: number
  gapM?: number
  offsetXM?: number
  offsetYM?: number
}

export interface ResolvedMapTaskPlacement {
  mode: MapPlacementMode
  frame: MapTaskFrame
  /** inside 且锚定单个 region 时，最终几何必须真正落在该多边形内，不能只守住外接矩形。 */
  containmentRegion?: MapPoint[]
  anchor?: { id: string; name: string; category: string }
  source: 'empty-default' | 'content-bounds' | 'single-region' | 'named-anchor'
  direction?: MapExpandDirection
}

function positiveOrUndefined(value: number | undefined, field: string): number | undefined {
  if (value === undefined) return undefined
  const normalized = Number(value)
  if (!Number.isFinite(normalized) || normalized <= 0) throw new Error(`${field} 必须是大于 0 的有限数值`)
  return normalized
}

function finiteOffset(value: number | undefined, field: string): number {
  const normalized = Number(value ?? 0)
  if (!Number.isFinite(normalized)) throw new Error(`${field} 必须是有限数值`)
  return normalized
}

function resolveAnchor(features: MapTaskPlacementFeature[], identifier: string | undefined): MapTaskPlacementFeature | undefined {
  const needle = String(identifier || '').trim()
  if (needle) {
    const matches = features.filter((feature) => feature.id === needle || feature.name === needle)
    if (matches.length !== 1) {
      throw new Error(matches.length
        ? `锚点「${needle}」不唯一，请改用 featureId`
        : `没有找到锚点要素「${needle}」，请先读图确认准确名称或 featureId`)
    }
    return matches[0]
  }
  const regions = features.filter((feature) => feature.kind === 'region' && feature.pts.length >= 3)
  return regions.length === 1 ? regions[0] : undefined
}

function frameForFeature(feature: MapTaskPlacementFeature): MapTaskFrame {
  const bbox = bboxOf(feature.pts)
  return mapTaskFrameFromBounds(bbox.minX, bbox.minY, bbox.maxX, bbox.maxY)
}

function directionVector(direction: MapExpandDirection): MapPoint {
  const diagonal = Math.SQRT1_2
  const vectors: Record<MapExpandDirection, MapPoint> = {
    north: [0, -1], 'north-east': [diagonal, -diagonal], east: [1, 0], 'south-east': [diagonal, diagonal],
    south: [0, 1], 'south-west': [-diagonal, diagonal], west: [-1, 0], 'north-west': [-diagonal, -diagonal]
  }
  return vectors[direction]
}

/**
 * 放置意图 → 本次作画任务域。
 *
 * inside 是安全缺省：不指定规模时使用锚点/当前内容的真实外接框；指定规模和偏移也必须完全留在该框内。
 * expand 只有显式请求才成立：任务域被放到锚点外侧，因而可以扩展无限工作平面，但仍有明确尺寸和方向。
 */
export function resolveMapTaskPlacement(input: {
  features: MapTaskPlacementFeature[]
  request?: MapTaskPlacementRequest
}): ResolvedMapTaskPlacement {
  const features = (input.features || []).filter((feature) => feature.pts?.length)
  const request = input.request || {}
  const mode: MapPlacementMode = request.mode || 'inside'
  const widthM = positiveOrUndefined(request.widthM, 'widthM')
  const heightM = positiveOrUndefined(request.heightM, 'heightM')
  const gapM = finiteOffset(request.gapM, 'gapM')
  if (gapM < 0) throw new Error('gapM 必须大于等于 0')
  const offsetXM = finiteOffset(request.offsetXM, 'offsetXM')
  const offsetYM = finiteOffset(request.offsetYM, 'offsetYM')
  const anchor = resolveAnchor(features, request.anchorFeature)
  const contentFrame = computeMapTaskFrame(features.map((feature) => feature.pts), { paddingRatio: 0, minPaddingM: 0 })
  const baseFrame = anchor ? frameForFeature(anchor) : contentFrame
  const source: ResolvedMapTaskPlacement['source'] = anchor
    ? (request.anchorFeature ? 'named-anchor' : 'single-region')
    : (contentFrame.empty ? 'empty-default' : 'content-bounds')
  const targetWidth = widthM ?? baseFrame.widthM
  const targetHeight = heightM ?? baseFrame.heightM

  if (mode === 'inside') {
    if (targetWidth > baseFrame.widthM || targetHeight > baseFrame.heightM) {
      throw new Error(`inside 作画任务域 ${Math.round(targetWidth)}×${Math.round(targetHeight)}m 超过锚点范围 ${Math.round(baseFrame.widthM)}×${Math.round(baseFrame.heightM)}m；若要向外拓展请显式使用 placementMode="expand"`)
    }
    const centerX = baseFrame.center[0] + offsetXM
    const centerY = baseFrame.center[1] + offsetYM
    const frame = mapTaskFrameFromBounds(
      centerX - targetWidth / 2,
      centerY - targetHeight / 2,
      centerX + targetWidth / 2,
      centerY + targetHeight / 2,
      baseFrame.empty
    )
    if (frame.minX < baseFrame.minX || frame.maxX > baseFrame.maxX || frame.minY < baseFrame.minY || frame.maxY > baseFrame.maxY) {
      throw new Error('inside 作画任务域经偏移后越过锚点范围；请缩小尺寸/偏移，或显式使用 expand')
    }
    return {
      mode,
      frame,
      source,
      ...(anchor ? { anchor: { id: anchor.id, name: anchor.name, category: anchor.category } } : {}),
      ...(anchor?.kind === 'region' ? { containmentRegion: anchor.pts } : {})
    }
  }

  if (contentFrame.empty) throw new Error('空地图不能使用 expand；请先用 inside/结构化图元建立第一块地形')
  if (!request.direction) throw new Error('placementMode="expand" 必须明确 direction（north/east/south/west 或斜向）')
  const [dx, dy] = directionVector(request.direction)
  // 正交方向贴住对应边；斜向同时越过横纵两条边。offset 只负责沿目标中心做显式微调，不改变“必须在外侧”的语义。
  const centerX = dx > 0
    ? baseFrame.maxX + gapM + targetWidth / 2
    : dx < 0 ? baseFrame.minX - gapM - targetWidth / 2 : baseFrame.center[0]
  const centerY = dy > 0
    ? baseFrame.maxY + gapM + targetHeight / 2
    : dy < 0 ? baseFrame.minY - gapM - targetHeight / 2 : baseFrame.center[1]
  const frame = mapTaskFrameFromBounds(
    centerX + offsetXM - targetWidth / 2,
    centerY + offsetYM - targetHeight / 2,
    centerX + offsetXM + targetWidth / 2,
    centerY + offsetYM + targetHeight / 2
  )
  if ((dx > 0 && frame.minX < baseFrame.maxX + gapM)
    || (dx < 0 && frame.maxX > baseFrame.minX - gapM)
    || (dy > 0 && frame.minY < baseFrame.maxY + gapM)
    || (dy < 0 && frame.maxY > baseFrame.minY - gapM)) {
    throw new Error('expand 作画任务域经偏移后退回锚点范围；请减小反向偏移或改用 inside')
  }
  return {
    mode,
    frame,
    source,
    direction: request.direction,
    ...(anchor ? { anchor: { id: anchor.id, name: anchor.name, category: anchor.category } } : {})
  }
}

/** 星依/舆图师共用：把模型传的公里制放置参数（含放置模式/锚点/方向/间隔/偏移）转成米制的
 *  MapTaskPlacementRequest；intrinsicSize 是调用方已知的成图尺寸（米），非必填。
 *  原为 XingyiDock.vue::buildXingyiMapPlacement 与 cartographerAgentHarness.ts::buildMapPlacement
 *  两处手抄副本，收编于 2026-07-17。 */
export function buildMapTaskPlacementRequest(input: {
  placementMode?: MapPlacementMode
  anchorFeature?: string
  direction?: MapExpandDirection
  gapKm?: number
  offsetXKm?: number
  offsetYKm?: number
}, intrinsicSize?: { widthM?: number; heightM?: number }): MapTaskPlacementRequest {
  return {
    mode: input.placementMode || 'inside',
    ...(input.anchorFeature ? { anchorFeature: input.anchorFeature } : {}),
    ...(input.direction ? { direction: input.direction } : {}),
    ...(Number.isFinite(Number(input.gapKm)) ? { gapM: Math.max(0, Number(input.gapKm)) * 1000 } : {}),
    ...(Number.isFinite(Number(input.offsetXKm)) ? { offsetXM: Number(input.offsetXKm) * 1000 } : {}),
    ...(Number.isFinite(Number(input.offsetYKm)) ? { offsetYM: Number(input.offsetYKm) * 1000 } : {}),
    ...(Number(intrinsicSize?.widthM) > 0 ? { widthM: Number(intrinsicSize?.widthM) } : {}),
    ...(Number(intrinsicSize?.heightM) > 0 ? { heightM: Number(intrinsicSize?.heightM) } : {})
  }
}

export function validatePointSetsInTaskPlacement(
  pointSets: MapPoint[][],
  placement: ResolvedMapTaskPlacement
): { ok: boolean; reason?: string } {
  const points = pointSets.flat()
  const frame = placement.frame
  for (const point of points) {
    if (point[0] < frame.minX || point[0] > frame.maxX || point[1] < frame.minY || point[1] > frame.maxY) {
      return { ok: false, reason: `最终几何越过 ${placement.mode} 作画任务域` }
    }
    if (placement.containmentRegion && !pointInPoly(point[0], point[1], placement.containmentRegion)) {
      return { ok: false, reason: `最终几何越过锚点「${placement.anchor?.name || '未命名区域'}」的真实轮廓` }
    }
  }
  return { ok: true }
}
