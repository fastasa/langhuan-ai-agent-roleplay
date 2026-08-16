import { segmentsIntersect, shoelace, type MapPoint } from './mapGeometry'

export type MapGeometryEditTarget = 'mountain-skeleton' | 'river-spine' | 'water-outline' | 'polygon-vertices' | 'path-vertices'
export type MapGeometryTopology = 'open' | 'closed'

export interface MapGeometrySemanticSnapCandidate {
  id: string
  label: string
  role: 'source' | 'mouth' | 'junction' | 'shore'
  point: MapPoint
  featureId?: string
}

/**
 * 人工几何编辑的统一运行态。
 *
 * points 只是一份尚未保存的编辑草稿；正式保存时必须投回 armor.skeleton 或
 * meta.vectorPrimitive.points，不能把本结构作为第三套持久化真值写入地图要素。
 */
export interface MapGeometryEditDraft {
  target: MapGeometryEditTarget
  topology: MapGeometryTopology
  points: MapPoint[]
  snapEnabled: boolean
  snapStepM: number
  /** 只属于编辑运行态：河流源头/入海/汇流等跨要素候选，不写入地图真值。 */
  semanticCandidates?: MapGeometrySemanticSnapCandidate[]
}

export interface MapGeometryPointInsertResult {
  geometry: MapGeometryEditDraft
  index: number
}

const SNAP_STEPS_M = [100, 250, 500, 1000, 2500, 5000, 10000, 25000]

function finitePoint(point: MapPoint, field: string): MapPoint {
  const x = Number(point?.[0])
  const y = Number(point?.[1])
  if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error(`${field} 含非法坐标`)
  return [x, y]
}

function minimumPointCount(target: MapGeometryEditTarget): number {
  if (target === 'water-outline') return 5
  return target === 'polygon-vertices' ? 3 : 2
}

export function mapGeometryMinimumPointCount(geometry: MapGeometryEditDraft): number {
  return minimumPointCount(geometry.target)
}

export function resolveMapGeometrySnapStep(points: MapPoint[]): number {
  if (!points.length) return 500
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const point of points) {
    const [x, y] = finitePoint(point, 'points')
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x)
    maxY = Math.max(maxY, y)
  }
  const target = Math.max(maxX - minX, maxY - minY, 1000) / 32
  return SNAP_STEPS_M.find((step) => step >= target) || SNAP_STEPS_M[SNAP_STEPS_M.length - 1]
}

export function createMapGeometryEditDraft(
  target: MapGeometryEditTarget,
  points: MapPoint[],
  options: { snapEnabled?: boolean; snapStepM?: number; semanticCandidates?: MapGeometrySemanticSnapCandidate[] } = {}
): MapGeometryEditDraft {
  const normalizedPoints = points.map((point, index) => finitePoint(point, `points[${index}]`))
  const geometry: MapGeometryEditDraft = {
    target,
    topology: target === 'polygon-vertices' || target === 'water-outline' ? 'closed' : 'open',
    points: normalizedPoints,
    snapEnabled: options.snapEnabled !== false,
    snapStepM: Number(options.snapStepM) > 0 ? Number(options.snapStepM) : resolveMapGeometrySnapStep(normalizedPoints),
    ...(options.semanticCandidates?.length
      ? { semanticCandidates: options.semanticCandidates.map((candidate) => ({ ...candidate, point: finitePoint(candidate.point, 'semanticCandidate') })) }
      : {})
  }
  validateMapGeometryEditDraft(geometry)
  return geometry
}

function samePoint(left: MapPoint, right: MapPoint): boolean {
  return Math.abs(left[0] - right[0]) < 1e-6 && Math.abs(left[1] - right[1]) < 1e-6
}

function polygonSelfIntersects(points: MapPoint[]): boolean {
  const count = points.length
  for (let left = 0; left < count; left += 1) {
    const leftNext = (left + 1) % count
    for (let right = left + 1; right < count; right += 1) {
      const rightNext = (right + 1) % count
      if (left === right || leftNext === right || rightNext === left) continue
      if (left === 0 && rightNext === 0) continue
      if (segmentsIntersect(points[left], points[leftNext], points[right], points[rightNext])) return true
    }
  }
  return false
}

export function validateMapGeometryEditDraft(geometry: MapGeometryEditDraft): void {
  const minimum = minimumPointCount(geometry.target)
  if (!Array.isArray(geometry.points) || geometry.points.length < minimum) {
    throw new Error(`${geometry.topology === 'closed' ? '多边形' : '开放骨架'}至少需要 ${minimum} 个点`)
  }
  const points = geometry.points.map((point, index) => finitePoint(point, `points[${index}]`))
  for (let index = 1; index < points.length; index += 1) {
    if (samePoint(points[index - 1], points[index])) throw new Error('相邻控制点不能重合')
  }
  if (geometry.topology === 'closed') {
    if (samePoint(points[0], points[points.length - 1])) throw new Error('闭合图形不重复保存首尾点')
    if (polygonSelfIntersects(points)) throw new Error('多边形边界不能自相交')
    if (shoelace(points) < 1) throw new Error('多边形面积必须大于 0')
  }
  if (!Number.isFinite(geometry.snapStepM) || geometry.snapStepM <= 0) throw new Error('吸附间距必须大于 0')
}

export function snapMapGeometryPoint(
  geometry: MapGeometryEditDraft,
  movingIndex: number,
  point: MapPoint,
  options: { disableSnap?: boolean } = {}
): MapPoint {
  const normalized = finitePoint(point, 'point')
  if (!geometry.snapEnabled || options.disableSnap) return normalized
  const step = geometry.snapStepM
  if (geometry.target === 'river-spine' && geometry.semanticCandidates?.length) {
    const lastIndex = geometry.points.length - 1
    const eligible = geometry.semanticCandidates.filter((candidate) => {
      if (movingIndex === 0) return candidate.role === 'source' || candidate.role === 'shore'
      if (movingIndex === lastIndex) return candidate.role === 'mouth' || candidate.role === 'junction' || candidate.role === 'shore'
      return candidate.role === 'junction'
    })
    const nearest = eligible
      .map((candidate) => ({ candidate, distance: Math.hypot(candidate.point[0] - normalized[0], candidate.point[1] - normalized[1]) }))
      .sort((left, right) => left.distance - right.distance)[0]
    if (nearest && nearest.distance <= step * 1.25) return nearest.candidate.point.slice() as MapPoint
  }
  let snapped: MapPoint = [Math.round(normalized[0] / step) * step, Math.round(normalized[1] / step) * step]
  const tolerance = step * 0.42
  for (let index = 0; index < geometry.points.length; index += 1) {
    if (index === movingIndex) continue
    const candidate = geometry.points[index]
    const snapX = Math.abs(normalized[0] - candidate[0]) <= tolerance
    const snapY = Math.abs(normalized[1] - candidate[1]) <= tolerance
    if (snapX) snapped = [candidate[0], snapped[1]]
    if (snapY) snapped = [snapped[0], candidate[1]]
  }
  return snapped
}

export function moveMapGeometryPoint(
  geometry: MapGeometryEditDraft,
  index: number,
  point: MapPoint,
  options: { disableSnap?: boolean } = {}
): MapGeometryEditDraft {
  if (!Number.isInteger(index) || index < 0 || index >= geometry.points.length) throw new Error('控制点序号无效')
  const points = geometry.points.map((item) => item.slice() as MapPoint)
  points[index] = snapMapGeometryPoint(geometry, index, point, options)
  return { ...geometry, points }
}

export function insertMapGeometryPointOnSegment(
  geometry: MapGeometryEditDraft,
  segmentIndex: number,
  point: MapPoint
): MapGeometryPointInsertResult {
  const segmentCount = geometry.topology === 'closed' ? geometry.points.length : geometry.points.length - 1
  if (!Number.isInteger(segmentIndex) || segmentIndex < 0 || segmentIndex >= segmentCount) throw new Error('线段序号无效')
  const insertIndex = segmentIndex + 1
  const snapped = snapMapGeometryPoint(geometry, -1, point)
  const points = geometry.points.map((item) => item.slice() as MapPoint)
  points.splice(insertIndex, 0, snapped)
  return { geometry: { ...geometry, points }, index: insertIndex }
}

export function insertMapGeometryPointNearIndex(
  geometry: MapGeometryEditDraft,
  selectedIndex: number | null
): MapGeometryPointInsertResult {
  const count = geometry.points.length
  const index = selectedIndex === null || selectedIndex < 0 || selectedIndex >= count ? count - 1 : selectedIndex
  let segmentIndex = index
  if (geometry.topology === 'open' && index >= count - 1) segmentIndex = count - 2
  const nextIndex = geometry.topology === 'closed' ? (segmentIndex + 1) % count : segmentIndex + 1
  const left = geometry.points[segmentIndex]
  const right = geometry.points[nextIndex]
  return insertMapGeometryPointOnSegment(geometry, segmentIndex, [(left[0] + right[0]) / 2, (left[1] + right[1]) / 2])
}

export function removeMapGeometryPoint(
  geometry: MapGeometryEditDraft,
  index: number
): MapGeometryEditDraft {
  if (!Number.isInteger(index) || index < 0 || index >= geometry.points.length) throw new Error('控制点序号无效')
  const minimum = minimumPointCount(geometry.target)
  if (geometry.points.length <= minimum) throw new Error(`至少保留 ${minimum} 个控制点`)
  const points = geometry.points.map((item) => item.slice() as MapPoint)
  points.splice(index, 1)
  return { ...geometry, points }
}

export function setMapGeometrySnap(
  geometry: MapGeometryEditDraft,
  enabled: boolean
): MapGeometryEditDraft {
  return { ...geometry, snapEnabled: enabled }
}
