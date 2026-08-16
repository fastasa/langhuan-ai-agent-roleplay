export type CurtainSettingsDraft = {
  sceneName: string
  sceneDescription: string
  locationSheetId: string
  mapFeatureId: string
  locationLarge: string
  locationMiddle: string
  locationSmall: string
  realLocation: string
  time: string
  timeRate: number
  weatherMode: 'real' | 'custom'
  weather: string
}

export type CurtainTimeFlowPatch = {
  virtualTime: string
  virtualTimeAnchor: number
  virtualTimeBase: number
  virtualTimeRate: number
}

const text = (value: unknown) => String(value ?? '').trim()

function clampTimeRate(value: unknown): number {
  const raw = Number(value ?? 1)
  if (!Number.isFinite(raw)) return 1
  return Math.min(60, Math.max(0, Math.round(raw * 10) / 10))
}

function parseLocalCurtainTime(value: string): number {
  if (!value) return 0
  const normalized = value.length === 16 ? `${value}:00` : value
  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/)
  const date = new Date(match ? 0 : normalized)
  if (match) {
    date.setFullYear(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
    date.setHours(Number(match[4]), Number(match[5]), Number(match[6] || 0), 0)
  }
  return Number.isNaN(date.getTime()) ? 0 : date.getTime()
}

export function createCurtainSettingsDraft(value: Record<string, unknown> = {}, now = Date.now()): CurtainSettingsDraft {
  const timeRate = clampTimeRate(value.timeRate)
  const timeBase = Number(value.timeBase ?? value.virtualTimeBase ?? 0)
  const rawTimeAnchor = Number(value.timeAnchor ?? value.virtualTimeAnchor ?? 0)
  const timeAnchor = Number.isFinite(rawTimeAnchor) && rawTimeAnchor > 0 ? rawTimeAnchor : now
  const flowingTime = Number.isFinite(timeBase) && timeBase !== 0
    ? timeBase + Math.max(0, now - timeAnchor) * timeRate
    : 0
  return {
    sceneName: text(value.sceneName),
    sceneDescription: text(value.sceneDescription),
    locationSheetId: text(value.mapSheetId ?? value.locationSheetId),
    mapFeatureId: text(value.mapFeatureId),
    locationLarge: text(value.locationLarge),
    locationMiddle: text(value.locationMiddle),
    locationSmall: text(value.locationSmall),
    realLocation: text(value.realLocation),
    time: flowingTime ? formatLocalCurtainTime(new Date(flowingTime)) : text(value.time),
    timeRate,
    weatherMode: value.weatherMode === 'custom' ? 'custom' : 'real',
    weather: text(value.weather)
  }
}

/**
 * datetime-local 只是帷幕时间的编辑形态；正式写入必须同时重建流动时钟三元组，
 * 否则聊天头部会继续按旧 base/anchor 推进，与工作台保存值形成两套时间。
 */
export function createCurtainTimeFlowPatch(time: string, timeRate: number, now = Date.now()): CurtainTimeFlowPatch {
  const virtualTime = text(time)
  const virtualTimeBase = parseLocalCurtainTime(virtualTime)
  return {
    virtualTime,
    virtualTimeAnchor: virtualTimeBase ? now : 0,
    virtualTimeBase,
    virtualTimeRate: clampTimeRate(timeRate)
  }
}

export function createRealityCurtainDraft(): CurtainSettingsDraft {
  return createCurtainSettingsDraft()
}

export function formatLocalCurtainTime(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  const seconds = String(date.getSeconds()).padStart(2, '0')
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`
}
