import {
  widenSpine,
  type MapFeature,
  type MapFeatureKind,
  type MapLayer,
  type MapPoint,
  type MapWorldData,
  type WidenSpineWidthProfile
} from './mapGeometry'
import type { WorldMapBundle, WorldMapFeatureRecord, WorldMapSheet } from '../types'
import { resolveWorldDefaultMapSheet } from './worldMapDefaultSheet'

/**
 * 服务端地图真值到 MapCanvas 视图模型的唯一投影入口。
 * 完整舆图弹窗与头部悬浮预览必须共用它，避免两处对 style、河岸派生的解释逐渐分叉。
 */
export function deriveWorldMapFeatureBank(record: WorldMapFeatureRecord): MapPoint[] | undefined {
  if (record.kind !== 'path' || (record.category !== 'river' && record.category !== 'canal')) return undefined
  const meta = record.meta as { armor?: Record<string, unknown>; shape?: Record<string, unknown> } | null | undefined
  const armor = meta?.armor?.type === 'river' ? meta.armor : undefined
  const armorParams = armor?.params as Record<string, unknown> | undefined
  // 新河流只认 meta.armor；meta.shape 是旧数据读兼容，禁止新写链同时保存两份宽度真值。
  const shape = meta?.shape
  const widthProfile = (armorParams || shape?.widthProfile) as Partial<WidenSpineWidthProfile> | undefined
  if (!widthProfile || !Number.isFinite(Number(widthProfile.sourceWidthM)) || !Number.isFinite(Number(widthProfile.mouthWidthM))) {
    return undefined
  }
  const pts = record.geometry.pts as MapPoint[]
  if (!Array.isArray(pts) || pts.length < 2) return undefined
  const bankRoughness = Number(armorParams?.bankRoughness)
  const mouthFlareRatio = Number(armorParams?.mouthFlareRatio)
  return widenSpine({
    spine: pts,
    widthProfile: {
      sourceWidthM: Number(widthProfile.sourceWidthM),
      mouthWidthM: Number(widthProfile.mouthWidthM),
      ...(Number.isFinite(Number(widthProfile.growthExponent))
        ? { growthExponent: Number(widthProfile.growthExponent) }
        : {})
    },
    seed: String(armor?.seed || (shape as { seed?: unknown } | undefined)?.seed || record.id),
    ...(Number.isFinite(bankRoughness) ? { leftRoughness: bankRoughness, rightRoughness: bankRoughness } : {}),
    ...(armorParams?.mouthCap === 'flare' ? { mouthCap: 'flare' as const } : {}),
    ...(Number.isFinite(mouthFlareRatio) ? { mouthFlareRatio } : {})
  })
}

export function projectWorldMapFeature(record: WorldMapFeatureRecord): MapFeature {
  const style = (record.style || {}) as Record<string, any>
  const armor = (record.meta as { armor?: Record<string, unknown> } | null | undefined)?.armor
  const isWaterArmor = record.category === 'water' && armor?.type === 'water'
  return {
    id: record.id,
    kind: record.kind as MapFeatureKind,
    category: record.category,
    name: record.name,
    layer: record.layer as MapLayer,
    pts: record.geometry.pts as MapPoint[],
    spine: record.geometry.spine as MapPoint[] | undefined,
    bank: deriveWorldMapFeatureBank(record),
    elevationM: record.geometry.elevationM,
    ...(isWaterArmor && Number.isFinite(Number(record.geometry.depthM)) ? { waterDepthM: Number(record.geometry.depthM) } : {}),
    ...(isWaterArmor && Number.isFinite(Number(armor?.depthRatio)) ? { waterDepthRatio: Number(armor?.depthRatio) } : {}),
    ...(isWaterArmor && armor?.role === 'depth-band' ? { waterRole: 'depth-band' as const } : isWaterArmor ? { waterRole: 'surface' as const } : {}),
    rough: style.rough,
    labelMode: style.labelMode,
    labelAt: style.labelAt,
    labelNudge: style.labelNudge,
    labelDx: style.labelDx,
    labelDy: style.labelDy,
    labelMin: style.labelMin,
    minScale: style.minScale,
    links: record.links || undefined
  }
}

function renderArmorGroupKey(record: WorldMapFeatureRecord): string {
  if (record.kind !== 'region' || (record.category !== 'mountain' && record.category !== 'water')) return ''
  const armor = (record.meta as { armor?: Record<string, unknown> } | null | undefined)?.armor
  if (armor?.type !== record.category) return ''
  const groupId = typeof armor.groupId === 'string' ? armor.groupId.trim() : ''
  return groupId ? `${record.category}:${groupId}` : ''
}

function mountainLayerFallbackRank(record: WorldMapFeatureRecord): number {
  if (record.name.endsWith('主山体')) return 0
  if (record.name.endsWith('山脊带')) return 1
  if (record.name.endsWith('峰线')) return 2
  return 3
}

/**
 * 同一装甲山脉的 region 是一座逻辑地形：必须先画低海拔大外层，再画高海拔小内层。
 * 服务端的稳定顺序只保证 created_at + id；同批记录时间相同而随机 id 不承载层级，不能直接拿它当 SVG z 序。
 * 这里只收拢明确带同一 armor.groupId 的山脉，不全局重排普通 region，避免改变江心洲等依赖数组顺序的既有叠放。
 */
export function orderWorldMapFeaturesForRender(records: WorldMapFeatureRecord[]): WorldMapFeatureRecord[] {
  const groups = new Map<string, Array<{ record: WorldMapFeatureRecord; sourceIndex: number }>>()
  records.forEach((record, sourceIndex) => {
    const groupId = renderArmorGroupKey(record)
    if (!groupId) return
    const entries = groups.get(groupId) || []
    entries.push({ record, sourceIndex })
    groups.set(groupId, entries)
  })

  const emitted = new Set<string>()
  const ordered: WorldMapFeatureRecord[] = []
  records.forEach((record) => {
    const groupId = renderArmorGroupKey(record)
    if (!groupId) {
      ordered.push(record)
      return
    }
    if (emitted.has(groupId)) return
    emitted.add(groupId)
    const entries = groups.get(groupId) || []
    entries.sort((left, right) => {
      if (left.record.category === 'water' && right.record.category === 'water') {
        const leftLayer = Number(((left.record.meta as any)?.armor)?.layerIndex)
        const rightLayer = Number(((right.record.meta as any)?.armor)?.layerIndex)
        if (Number.isFinite(leftLayer) && Number.isFinite(rightLayer) && leftLayer !== rightLayer) return leftLayer - rightLayer
      }
      const leftElevation = Number(left.record.geometry.elevationM)
      const rightElevation = Number(right.record.geometry.elevationM)
      const leftHasElevation = Number.isFinite(leftElevation)
      const rightHasElevation = Number.isFinite(rightElevation)
      if (leftHasElevation && rightHasElevation && leftElevation !== rightElevation) return leftElevation - rightElevation
      if (leftHasElevation !== rightHasElevation) return leftHasElevation ? -1 : 1
      const rankDelta = mountainLayerFallbackRank(left.record) - mountainLayerFallbackRank(right.record)
      return rankDelta || left.sourceIndex - right.sourceIndex
    })
    ordered.push(...entries.map((entry) => entry.record))
  })
  return ordered
}

export function projectWorldMapSheet(bundle: WorldMapBundle, sheet: WorldMapSheet): MapWorldData {
  return {
    name: String(bundle.world?.name || ''),
    sheet: sheet.name,
    explored: { pts: (sheet.explored?.pts || []) as MapPoint[] },
    features: orderWorldMapFeaturesForRender(sheet.features).map(projectWorldMapFeature)
  }
}

export function projectPrimaryWorldMap(bundle: WorldMapBundle | null): MapWorldData | null {
  const sheet = resolveWorldDefaultMapSheet(bundle)
  return bundle && sheet ? projectWorldMapSheet(bundle, sheet) : null
}
