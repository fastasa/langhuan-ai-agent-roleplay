import { centroid, mulberry32, roughen, shoelace, type MapPoint } from '../mapGeometry'
import type { WaterArmorParams } from './types'

export interface ResolvedWaterArmorParams {
  waterKind: 'lake' | 'ocean'
  maxDepthM: number
  shoreShelfRatio: number
  depthCurve: number
  ruggedness: number
  layers: 2 | 3
  connectionGapM: number
}

export interface WaterArmorLayer {
  role: 'surface' | 'depth-band'
  pts: MapPoint[]
  depthM: number
  depthRatio: number
  layerIndex: number
}

export interface WaterArmorExpansion {
  outline: MapPoint[]
  layers: WaterArmorLayer[]
  resolvedParams: ResolvedWaterArmorParams
  summary: string
}

function finite(value: unknown, field: string): number {
  const normalized = Number(value)
  if (!Number.isFinite(normalized)) throw new Error(`${field} 必须是有限数值`)
  return normalized
}

function ranged(value: unknown, field: string, min: number, max: number): number {
  const normalized = finite(value, field)
  if (normalized < min || normalized > max) throw new Error(`${field} 必须在 ${min}~${max} 之间`)
  return normalized
}

function normalizeOutline(points: MapPoint[]): MapPoint[] {
  if (!Array.isArray(points) || points.length < 5) throw new Error('水体表面轮廓至少需要 5 个控制点')
  const normalized = points.map((point, index) => [
    finite(point?.[0], `outline[${index}].x`),
    finite(point?.[1], `outline[${index}].y`)
  ] as MapPoint)
  const first = normalized[0]
  const last = normalized[normalized.length - 1]
  if (Math.hypot(first[0] - last[0], first[1] - last[1]) < 1) normalized.pop()
  if (normalized.length < 5 || shoelace(normalized) < 100) throw new Error('水体表面轮廓没有形成有效面积')
  return normalized
}

export function resolveWaterArmorParams(params: WaterArmorParams = {}): ResolvedWaterArmorParams {
  const waterKind = params.waterKind === 'ocean' ? 'ocean' : 'lake'
  const defaultDepth = waterKind === 'ocean' ? 3600 : 80
  const defaultGap = waterKind === 'ocean' ? 800 : 300
  const layers = Math.trunc(Number(params.layers ?? 3))
  if (layers !== 2 && layers !== 3) throw new Error('layers 必须是 2 或 3')
  return {
    waterKind,
    maxDepthM: ranged(params.maxDepthM ?? defaultDepth, 'maxDepthM', 1, 12_000),
    shoreShelfRatio: ranged(params.shoreShelfRatio ?? 0.22, 'shoreShelfRatio', 0.05, 0.45),
    depthCurve: ranged(params.depthCurve ?? 1.15, 'depthCurve', 0.4, 3),
    ruggedness: ranged(params.ruggedness ?? 0.3, 'ruggedness', 0, 1),
    layers: layers as 2 | 3,
    connectionGapM: ranged(params.connectionGapM ?? defaultGap, 'connectionGapM', 10, 5_000)
  }
}

function scaleTowardCenter(points: MapPoint[], center: MapPoint, ratio: number): MapPoint[] {
  return points.map((point) => [
    center[0] + (point[0] - center[0]) * ratio,
    center[1] + (point[1] - center[1]) * ratio
  ])
}

/** 湖泊/海洋统一展开：稀疏闭合外轮廓 + 深度参数 → 浅水表面与确定性嵌套深水带。 */
export function expandWaterArmor(
  outline: MapPoint[],
  params: WaterArmorParams = {},
  seed: number
): WaterArmorExpansion {
  const normalized = normalizeOutline(outline)
  const resolvedParams = resolveWaterArmorParams(params)
  const rng = mulberry32(seed)
  const surface = roughen(normalized.map((point) => [...point] as MapPoint), 2, resolvedParams.ruggedness * 0.075, rng, true)
  if (shoelace(surface) < 100) throw new Error('海岸展开失败：没有形成有效水面')
  const center = centroid(surface)
  const ratios = resolvedParams.layers === 2
    ? [1, Math.max(0.28, 1 - resolvedParams.shoreShelfRatio * 1.8)]
    : [1, 1 - resolvedParams.shoreShelfRatio, Math.max(0.2, (1 - resolvedParams.shoreShelfRatio) * 0.52)]
  const depthFractions = resolvedParams.layers === 2 ? [0.12, 1] : [0.08, 0.46, 1]
  const layers = ratios.map((ratio, layerIndex) => {
    const depthRatio = Math.pow(depthFractions[layerIndex], resolvedParams.depthCurve)
    return {
      role: layerIndex === 0 ? 'surface' as const : 'depth-band' as const,
      pts: layerIndex === 0 ? surface : scaleTowardCenter(surface, center, ratio),
      depthM: resolvedParams.maxDepthM * depthRatio,
      depthRatio,
      layerIndex
    }
  })
  return {
    outline: normalized,
    layers,
    resolvedParams,
    summary: `${resolvedParams.waterKind === 'ocean' ? '海洋' : '湖泊'} · 最大水深 ${Math.round(resolvedParams.maxDepthM)}m · ${resolvedParams.layers} 层水深`
  }
}
