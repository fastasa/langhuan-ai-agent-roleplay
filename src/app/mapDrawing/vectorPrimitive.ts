import { BRUSH_SPEC, type MapLayer, type MapPoint } from '../mapGeometry'

export type MapVectorPrimitive =
  | { type: 'circle'; center: MapPoint; radiusM: number }
  | { type: 'ellipse'; center: MapPoint; widthM: number; heightM: number }
  | { type: 'rect'; center: MapPoint; widthM: number; heightM: number }
  | { type: 'polygon'; points: MapPoint[] }
  | { type: 'path'; points: MapPoint[] }

export interface CompiledVectorPrimitive {
  kind: 'region' | 'path'
  category: string
  name: string
  layer: MapLayer
  pts: MapPoint[]
  primitive: MapVectorPrimitive
}

export function validateVectorPrimitiveCategory(
  shape: MapVectorPrimitive['type'],
  category: string
): string | null {
  const normalizedCategory = String(category || '').trim()
  const spec = BRUSH_SPEC[normalizedCategory]
  if (!spec) return `未知地图类目「${normalizedCategory || '空'}」，不能生成可渲染图元`
  if (normalizedCategory === 'mountain') return 'mountain 必须使用 armor 山脉装甲，禁止作为基础矢量图元直画'
  const primitiveKind = shape === 'path' ? 'path' : 'region'
  if (spec.kind !== primitiveKind) {
    return `图元 ${shape} 会生成 ${primitiveKind}，但类目 ${normalizedCategory} 的正式 kind 是 ${spec.kind}`
  }
  return null
}

function finitePositive(value: number, field: string): number {
  const normalized = Number(value)
  if (!Number.isFinite(normalized) || normalized <= 0) throw new Error(`${field} 必须是大于 0 的有限数值`)
  return normalized
}

function finitePoint(point: MapPoint, field: string): MapPoint {
  const x = Number(point?.[0])
  const y = Number(point?.[1])
  if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error(`${field} 含非法坐标`)
  return [x, y]
}

function ellipsePoints(center: MapPoint, widthM: number, heightM: number, segments = 64): MapPoint[] {
  const [cx, cy] = finitePoint(center, 'center')
  const rx = finitePositive(widthM, 'widthM') / 2
  const ry = finitePositive(heightM, 'heightM') / 2
  return Array.from({ length: Math.max(16, Math.round(segments)) }, (_, index) => {
    const angle = -Math.PI / 2 + index / Math.max(16, Math.round(segments)) * Math.PI * 2
    return [cx + Math.cos(angle) * rx, cy + Math.sin(angle) * ry] as MapPoint
  })
}

/**
 * 结构化矢量图元 → 当前地图要素几何。
 *
 * primitive 会原样存进 meta.vectorPrimitive，pts 只是当前 SVG 渲染器消费的确定性投影；以后编辑器可直接改
 * primitive 再重投影，不需要从 64 边形反猜圆。这里不接受任意 SVG/XML，避免脚本、样式和坐标真值散落。
 */
export function compileVectorPrimitive(input: {
  primitive: MapVectorPrimitive
  category: string
  name?: string
  layer?: MapLayer
}): CompiledVectorPrimitive {
  const category = String(input.category || '').trim()
  if (!category) throw new Error('category 不能为空')
  const name = String(input.name || '').trim() || '未命名图元'
  const layer = input.layer || 'terrain'
  const primitive = input.primitive
  const compatibilityError = validateVectorPrimitiveCategory(primitive.type, category)
  if (compatibilityError) throw new Error(compatibilityError)

  if (primitive.type === 'circle') {
    const radiusM = finitePositive(primitive.radiusM, 'radiusM')
    const center = finitePoint(primitive.center, 'center')
    const normalized: MapVectorPrimitive = { type: 'circle', center, radiusM }
    return { kind: 'region', category, name, layer, pts: ellipsePoints(center, radiusM * 2, radiusM * 2), primitive: normalized }
  }
  if (primitive.type === 'ellipse') {
    const center = finitePoint(primitive.center, 'center')
    const widthM = finitePositive(primitive.widthM, 'widthM')
    const heightM = finitePositive(primitive.heightM, 'heightM')
    const normalized: MapVectorPrimitive = { type: 'ellipse', center, widthM, heightM }
    return { kind: 'region', category, name, layer, pts: ellipsePoints(center, widthM, heightM), primitive: normalized }
  }
  if (primitive.type === 'rect') {
    const [cx, cy] = finitePoint(primitive.center, 'center')
    const widthM = finitePositive(primitive.widthM, 'widthM')
    const heightM = finitePositive(primitive.heightM, 'heightM')
    const halfW = widthM / 2
    const halfH = heightM / 2
    const normalized: MapVectorPrimitive = { type: 'rect', center: [cx, cy], widthM, heightM }
    return {
      kind: 'region', category, name, layer, primitive: normalized,
      pts: [[cx - halfW, cy - halfH], [cx + halfW, cy - halfH], [cx + halfW, cy + halfH], [cx - halfW, cy + halfH]]
    }
  }

  const minimum = primitive.type === 'polygon' ? 3 : 2
  if (!Array.isArray(primitive.points) || primitive.points.length < minimum) {
    throw new Error(`${primitive.type} 至少需要 ${minimum} 个点`)
  }
  const points = primitive.points.map((point, index) => finitePoint(point, `points[${index}]`))
  const normalized = { type: primitive.type, points } as MapVectorPrimitive
  return { kind: primitive.type === 'path' ? 'path' : 'region', category, name, layer, pts: points, primitive: normalized }
}
