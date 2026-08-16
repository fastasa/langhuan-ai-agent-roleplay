import {
  formatVirtualSceneDate,
  parseVirtualSceneDisplayTime,
  resolveEffectiveVirtualScene
} from '../utils/virtualScene'
import type {
  ReplyPlanCurtainSceneUpdateResult,
  ReplyPlanCurtainSceneUpdateToolCall
} from './replyPlanOrchestratorHarness'

export interface CurtainSceneDefaults {
  currentTime?: string
  currentWeather?: string
  currentLocation?: string
}

export interface PrepareCurtainSceneUpdateInput {
  session: Record<string, unknown> | null | undefined
  defaults?: CurtainSceneDefaults
  toolCall: ReplyPlanCurtainSceneUpdateToolCall
  now?: number
  successHeading?: string
  successTail?: readonly string[]
}

/**
 * 帷幕修改的纯准备层：提调、星依等入口都先在这里生成同一份 patch、前后快照与撤销数据，
 * 各入口只负责自己的权限确认和正式持久化命令。
 */
export function readCurtainSceneSnapshot(
  session: Record<string, unknown> | null | undefined,
  defaults: CurtainSceneDefaults = {},
  now = Date.now()
): Record<string, unknown> {
  const scene = resolveEffectiveVirtualScene(session as never, defaults as never, now)
  return {
    time: scene?.time || '',
    location: scene?.location || '',
    weather: scene?.weather || '',
    virtualTime: session?.virtualTime ?? session?.virtual_time ?? '',
    virtualTimeBase: session?.virtualTimeBase ?? session?.virtual_time_base ?? 0,
    virtualTimeAnchor: session?.virtualTimeAnchor ?? session?.virtual_time_anchor ?? 0,
    virtualTimeRate: session?.virtualTimeRate ?? session?.virtual_time_rate ?? 1,
    virtualLocation: session?.virtualLocation ?? session?.virtual_location ?? '',
    virtualLocationLarge: session?.virtualLocationLarge ?? session?.virtual_location_large ?? '',
    virtualLocationMiddle: session?.virtualLocationMiddle ?? session?.virtual_location_middle ?? '',
    virtualLocationSmall: session?.virtualLocationSmall ?? session?.virtual_location_small ?? '',
    virtualLocationSheetId: session?.virtualLocationSheetId ?? session?.virtual_location_sheet_id ?? '',
    virtualLocationFeatureId: session?.virtualLocationFeatureId ?? session?.virtual_location_feature_id ?? ''
  }
}

function isConcreteCurtainTimeText(text: string): boolean {
  return /(\d{1,4}[年/-]\d{1,2}[月/-]\d{1,2}|\d{4}-\d{2}-\d{2}T|\d{1,2}:\d{2})/.test(text)
}

function buildCurtainTimePatch(targetTime: string, now: number): Record<string, unknown> {
  const text = String(targetTime || '').trim()
  if (!text) return {}
  if (!isConcreteCurtainTimeText(text)) {
    return {
      virtualTime: text,
      virtualTimeBase: 0,
      virtualTimeAnchor: 0,
      virtualTimeRate: 1
    }
  }
  const parsed = parseVirtualSceneDisplayTime(text, new Date(now))
  const timestamp = parsed.getTime()
  if (!Number.isFinite(timestamp)) {
    return {
      virtualTime: text,
      virtualTimeBase: 0,
      virtualTimeAnchor: 0,
      virtualTimeRate: 1
    }
  }
  return {
    virtualTime: formatVirtualSceneDate(timestamp),
    virtualTimeBase: timestamp,
    virtualTimeAnchor: now,
    virtualTimeRate: 1
  }
}

function splitCurtainLocationText(text: string): string[] {
  return String(text || '')
    .split(/\s*(?:\/|／|>|＞|\||｜|，|,)\s*/)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 3)
}

const CURTAIN_LOCATION_PLACEHOLDER_PATTERN = /^(未知|未命中|未明确|未设置|未指定|无|不详|暂无|null|undefined|n\/a)$/i
const CURTAIN_LOCATION_SUSPICIOUS_SUFFIX_PATTERN = /(下面|底下|里面|上面|身上|身下|怀里|怀中|之间|之下)$/
const CURTAIN_LOCATION_SENTENCE_PATTERN = /[。！？；!?;，,]/

export function sanitizeCurtainLocationPart(text: string): string {
  const value = String(text || '').trim()
  if (!value) return ''
  if (CURTAIN_LOCATION_PLACEHOLDER_PATTERN.test(value)) return ''
  if (CURTAIN_LOCATION_SUSPICIOUS_SUFFIX_PATTERN.test(value)) return ''
  if (CURTAIN_LOCATION_SENTENCE_PATTERN.test(value)) return ''
  if (value.length > 30) return ''
  return value
}

function buildCurtainLocationPatch(toolCall: ReplyPlanCurtainSceneUpdateToolCall): Record<string, unknown> {
  const large = sanitizeCurtainLocationPart(toolCall.locationLarge || '')
  const middle = sanitizeCurtainLocationPart(toolCall.locationMiddle || '')
  const small = sanitizeCurtainLocationPart(toolCall.locationSmall || '')
  if (large || middle || small) {
    const virtualLocation = [large, middle, small].filter(Boolean).join(' / ')
    return {
      virtualLocationLarge: large,
      virtualLocationMiddle: middle,
      virtualLocationSmall: small,
      virtualLocation
    }
  }
  const targetLocation = sanitizeCurtainLocationPart(toolCall.targetLocation || '')
  if (!targetLocation) return {}
  const parts = splitCurtainLocationText(targetLocation)
    .map((part) => sanitizeCurtainLocationPart(part))
    .filter(Boolean)
  if (parts.length > 1) {
    return {
      virtualLocationLarge: parts[0] || '',
      virtualLocationMiddle: parts[1] || '',
      virtualLocationSmall: parts[2] || '',
      virtualLocation: parts.join(' / ')
    }
  }
  if (parts.length === 1) return { virtualLocation: parts[0] }
  return {}
}

function buildCurtainCoordinatePatch(
  toolCall: ReplyPlanCurtainSceneUpdateToolCall,
  locationPatch: Record<string, unknown>
): Record<string, unknown> {
  const mapSheetId = String(toolCall.mapSheetId || '').trim()
  const mapFeatureId = String(toolCall.mapFeatureId || '').trim()
  const patch: Record<string, unknown> = {}
  if (mapSheetId) patch.virtualLocationSheetId = mapSheetId
  if (mapFeatureId) patch.virtualLocationFeatureId = mapFeatureId
  if (Object.keys(locationPatch).length && !mapFeatureId) patch.virtualLocationFeatureId = ''
  return patch
}

function buildCurtainWeatherPatch(targetWeather: string): Record<string, unknown> {
  const value = String(targetWeather || '').trim()
  if (!value || CURTAIN_LOCATION_PLACEHOLDER_PATTERN.test(value)) return {}
  return {
    virtualWeather: value,
    virtualWeatherMode: 'custom'
  }
}

function unchangedResult(
  notice: string,
  previous: Record<string, unknown>,
  reason: string | undefined
): ReplyPlanCurtainSceneUpdateResult {
  return {
    changed: false,
    notice,
    previous,
    next: previous,
    patch: {},
    undoPatch: {},
    reason
  }
}

export function prepareCurtainSceneUpdate(
  input: PrepareCurtainSceneUpdateInput
): ReplyPlanCurtainSceneUpdateResult {
  const now = Number.isFinite(input.now) ? Number(input.now) : Date.now()
  const defaults = input.defaults || {}
  const previous = readCurtainSceneSnapshot(input.session, defaults, now)
  const locationPatch = buildCurtainLocationPatch(input.toolCall)
  const patch = {
    ...buildCurtainTimePatch(String(input.toolCall.targetTime || '').trim(), now),
    ...locationPatch,
    ...buildCurtainCoordinatePatch(input.toolCall, locationPatch),
    ...buildCurtainWeatherPatch(String(input.toolCall.targetWeather || '').trim())
  }
  const normalizedPatch = Object.fromEntries(Object.entries(patch).filter(([key, value]) => (
    String(value ?? '').trim()
    || value === 0
    || key === 'virtualLocationFeatureId'
  )))
  if (!Object.keys(normalizedPatch).length) {
    return unchangedResult(
      '帷幕未变化：updateCurtainScene 没有收到可写入的目标时间、地点、天气或地图坐标。',
      previous,
      input.toolCall.reason
    )
  }

  const next = readCurtainSceneSnapshot({ ...(input.session || {}), ...normalizedPatch }, defaults, now)
  if (
    String(previous.time || '') === String(next.time || '')
    && String(previous.location || '') === String(next.location || '')
    && String(previous.weather || '') === String(next.weather || '')
    && String(previous.virtualLocationSheetId || '') === String(next.virtualLocationSheetId || '')
    && String(previous.virtualLocationFeatureId || '') === String(next.virtualLocationFeatureId || '')
  ) {
    return unchangedResult(
      '帷幕未变化：提交的目标与当前帷幕一致，未执行修改。',
      previous,
      input.toolCall.reason
    )
  }

  const undoPatch = {
    virtualTime: previous.virtualTime,
    virtualTimeBase: previous.virtualTimeBase,
    virtualTimeAnchor: previous.virtualTimeAnchor,
    virtualTimeRate: previous.virtualTimeRate,
    virtualLocation: previous.virtualLocation,
    virtualLocationLarge: previous.virtualLocationLarge,
    virtualLocationMiddle: previous.virtualLocationMiddle,
    virtualLocationSmall: previous.virtualLocationSmall,
    virtualLocationSheetId: previous.virtualLocationSheetId,
    virtualLocationFeatureId: previous.virtualLocationFeatureId
  }
  const timeLine = previous.time !== next.time
    ? `时间：${String(previous.time || '未设置')} -> ${String(next.time || '未设置')}`
    : ''
  const locationLine = previous.location !== next.location
    ? `地点：${String(previous.location || '未设置')} -> ${String(next.location || '未设置')}`
    : ''
  const coordinateLine = (
    previous.virtualLocationSheetId !== next.virtualLocationSheetId
    || previous.virtualLocationFeatureId !== next.virtualLocationFeatureId
  )
    ? `地图坐标：图纸 ${String(previous.virtualLocationSheetId || '默认')} / 要素 ${String(previous.virtualLocationFeatureId || '无')} -> 图纸 ${String(next.virtualLocationSheetId || '默认')} / 要素 ${String(next.virtualLocationFeatureId || '无')}`
    : ''
  return {
    changed: true,
    notice: [
      input.successHeading || '【当前会话帷幕已更新】',
      input.toolCall.reason ? `触发原因：${input.toolCall.reason}` : '',
      timeLine,
      locationLine,
      coordinateLine,
      ...(input.successTail || [])
    ].filter(Boolean).join('\n'),
    previous,
    next,
    patch: normalizedPatch,
    undoPatch,
    reason: input.toolCall.reason
  }
}
