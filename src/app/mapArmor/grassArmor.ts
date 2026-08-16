import { mulberry32, type MapPoint } from '../mapGeometry'

export interface GrassArmorParams {
  center: MapPoint
  widthM: number
  heightM: number
  /** exact=规整椭圆；organic=确定性轻微碎折。 */
  shape?: 'exact' | 'organic'
  /** 0~1，仅 organic 生效。 */
  ruggedness?: number
}

export interface GrassArmorExpansion {
  feature: {
    kind: 'region'
    category: 'grass'
    name: string
    layer: 'terrain'
    pts: MapPoint[]
    elevationM: number
  }
  resolvedParams: Required<GrassArmorParams>
  summary: string
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Number(value)))
}

/** 草原装甲始终只展开为一个 region；不会再自动补一层“默认陆地底”。 */
export function expandGrassArmor(params: GrassArmorParams, seed: number): GrassArmorExpansion {
  const center: MapPoint = [Number(params.center?.[0]), Number(params.center?.[1])]
  const widthM = Number(params.widthM)
  const heightM = Number(params.heightM)
  if (!center.every(Number.isFinite)) throw new Error('grassArmor.center 含非法坐标')
  if (!Number.isFinite(widthM) || widthM <= 0 || !Number.isFinite(heightM) || heightM <= 0) {
    throw new Error('grassArmor.widthM/heightM 必须大于 0')
  }
  const shape = params.shape === 'exact' ? 'exact' : 'organic'
  const ruggedness = clamp(params.ruggedness ?? 0.28, 0, 1)
  const rng = mulberry32(seed)
  const segmentCount = 64
  const rawNoise = Array.from({ length: segmentCount }, () => rng() * 2 - 1)
  const smoothNoise = rawNoise.map((_, index) => {
    const before = rawNoise[(index - 1 + segmentCount) % segmentCount]
    const current = rawNoise[index]
    const after = rawNoise[(index + 1) % segmentCount]
    return (before + current * 2 + after) / 4
  })
  const pts = Array.from({ length: segmentCount }, (_, index) => {
    const angle = -Math.PI / 2 + index / segmentCount * Math.PI * 2
    const radial = shape === 'exact' ? 1 : 1 + smoothNoise[index] * ruggedness * 0.12
    return [
      center[0] + Math.cos(angle) * widthM / 2 * radial,
      center[1] + Math.sin(angle) * heightM / 2 * radial
    ] as MapPoint
  })
  return {
    feature: { kind: 'region', category: 'grass', name: '草原', layer: 'terrain', pts, elevationM: 150 },
    resolvedParams: { center, widthM, heightM, shape, ruggedness },
    summary: `${shape === 'exact' ? '规整' : '自然'}草原 ${Math.round(widthM / 1000)}×${Math.round(heightM / 1000)}km · 单区域 · seed ${seed}`
  }
}
