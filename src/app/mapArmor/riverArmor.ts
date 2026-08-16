import {
  BRUSH_SPEC,
  pathLength,
  shoelace,
  widenSpine,
  type MapPoint
} from '../mapGeometry'
import { sampleSmoothArmorSkeleton } from './mountainArmor'
import type { RiverArmorParams } from './types'

export interface ResolvedRiverArmorParams {
  sourceWidthM: number
  mouthWidthM: number
  growthExponent: number
  bankRoughness: number
  mouthCap: 'flat' | 'flare'
  mouthFlareRatio: number
}

export interface RiverArmorExpansion {
  /** 可人工编辑、可重放的稀疏控制脊线。 */
  spine: MapPoint[]
  /** 供现有 path 渲染器消费的平滑中心线投影。 */
  projectedSpine: MapPoint[]
  /** 只存在于展开/视图层，正式记录不单独保存。 */
  bank: MapPoint[]
  resolvedParams: ResolvedRiverArmorParams
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

function normalizeSpine(spine: MapPoint[]): MapPoint[] {
  if (!Array.isArray(spine) || spine.length < 2) throw new Error('河流脊线至少需要 2 个控制点')
  return spine.map((point, index) => {
    const normalized: MapPoint = [finite(point?.[0], `spine[${index}].x`), finite(point?.[1], `spine[${index}].y`)]
    if (index > 0 && Math.hypot(normalized[0] - spine[index - 1][0], normalized[1] - spine[index - 1][1]) < 1) {
      throw new Error('河流相邻控制点不能重合')
    }
    return normalized
  })
}

export function resolveRiverArmorParams(params: RiverArmorParams = {}): ResolvedRiverArmorParams {
  const defaults = BRUSH_SPEC.river?.widthProfileDefault || { sourceWidthM: 6, mouthWidthM: 160, growthExponent: 0.5 }
  const sourceWidthM = ranged(params.sourceWidthM ?? defaults.sourceWidthM, 'sourceWidthM', 1, 20_000)
  const mouthWidthM = ranged(params.mouthWidthM ?? defaults.mouthWidthM, 'mouthWidthM', 1, 100_000)
  if (mouthWidthM < sourceWidthM) throw new Error('河口宽度不能小于源头宽度')
  return {
    sourceWidthM,
    mouthWidthM,
    growthExponent: ranged(params.growthExponent ?? defaults.growthExponent ?? 0.5, 'growthExponent', 0.1, 2),
    bankRoughness: ranged(params.bankRoughness ?? 0.18, 'bankRoughness', 0, 0.6),
    mouthCap: params.mouthCap === 'flare' ? 'flare' : 'flat',
    mouthFlareRatio: ranged(params.mouthFlareRatio ?? 5, 'mouthFlareRatio', 1, 10)
  }
}

/** 河流确定性展开：稀疏脊线+参数+seed → 平滑中心线+派生河岸。 */
export function expandRiverArmor(
  spine: MapPoint[],
  params: RiverArmorParams = {},
  seed: number | string
): RiverArmorExpansion {
  const normalizedSpine = normalizeSpine(spine)
  const resolvedParams = resolveRiverArmorParams(params)
  const projectedSpine = sampleSmoothArmorSkeleton(normalizedSpine)
  if (pathLength(projectedSpine) < 10) throw new Error('河流长度过短')
  const bank = widenSpine({
    spine: projectedSpine,
    widthProfile: {
      sourceWidthM: resolvedParams.sourceWidthM,
      mouthWidthM: resolvedParams.mouthWidthM,
      growthExponent: resolvedParams.growthExponent
    },
    seed,
    leftRoughness: resolvedParams.bankRoughness,
    rightRoughness: resolvedParams.bankRoughness,
    sourceCap: 'taper',
    mouthCap: resolvedParams.mouthCap,
    mouthFlareRatio: resolvedParams.mouthFlareRatio
  })
  if (bank.length < 3 || shoelace(bank) < 1) throw new Error('河岸派生失败：没有形成有效水面')
  return {
    spine: normalizedSpine,
    projectedSpine,
    bank,
    resolvedParams,
    summary: `河流 ${Number((pathLength(projectedSpine) / 1000).toFixed(1))}km · ${Math.round(resolvedParams.sourceWidthM)}→${Math.round(resolvedParams.mouthWidthM)}m`
  }
}
