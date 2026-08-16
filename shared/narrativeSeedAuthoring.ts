export const NARRATIVE_SEED_TYPES = [
  'foreshadow',
  'countdown',
  'offscreen_process',
  'threat_or_opportunity',
  'promise_or_debt',
  'relationship_change',
  'world_change'
] as const

export const NARRATIVE_SEED_STATUSES = [
  'dormant',
  'active',
  'ready_to_trigger',
  'pending_effect',
  'triggered',
  'resolved',
  'expired',
  'stalled',
  'review_required',
  'transformed'
] as const

export const NARRATIVE_SEED_LINK_TYPES = [
  'depends_on',
  'conflicts_with',
  'caused_by',
  'transforms_into',
  'replaces'
] as const

export const NARRATIVE_SEED_PARTICIPANT_TYPES = [
  'character',
  'temporary_entity',
  'world_object',
  'user',
  'freeform'
] as const

export const NARRATIVE_SEED_VISIBILITY_MODES = [
  'director_only',
  'participants',
  'public',
  'custom'
] as const

/** 只有这些字段允许模型写入；mapSheetId/worldId/version 等归属与审计字段由代码维护。 */
export const NARRATIVE_SEED_AUTHOR_FIELDS = [
  'type',
  'title',
  'description',
  'cause',
  'currentProgress',
  'expectedOutcome',
  'startTime',
  'mapFeatureId',
  'locationText',
  'impactScope',
  'status',
  'visibilityMode',
  'allowFrontstage',
  'participants',
  'links'
] as const

export type NarrativeSeedAuthorField = (typeof NARRATIVE_SEED_AUTHOR_FIELDS)[number]

/**
 * 会改变种子身份、既有因果、调度时间、地点命中、生命周期或知情边界的字段。
 * 编剧工作区修改这些字段必须让用户确认；描述、当前进展和期待兑现可在版本锁与账本下直接补写。
 */
export const NARRATIVE_SEED_HIGH_RISK_AUTHOR_FIELDS = [
  'type',
  'title',
  'cause',
  'startTime',
  'mapFeatureId',
  'locationText',
  'impactScope',
  'status',
  'visibilityMode',
  'allowFrontstage',
  'participants',
  'links'
] as const satisfies readonly NarrativeSeedAuthorField[]

export const NARRATIVE_SEED_REQUIRED_TEXT_FIELDS = [
  'title',
  'description',
  'cause',
  'currentProgress',
  'expectedOutcome',
  'startTime',
  'locationText',
  'impactScope'
] as const

export const NARRATIVE_SEED_REMOVED_AUTHOR_FIELDS = [
  'unattendedOutcome',
  'expectedTriggerTime',
  'overdueTime',
  'mapSheetId'
] as const

export const NARRATIVE_SEED_LOCATION_FORMAT = '大地点/中地点/小地点'

export function validateNarrativeSeedLocationText(value: unknown): string | null {
  const text = String(value ?? '').trim()
  const parts = text.split('/').map((part) => part.trim())
  if (parts.length !== 3 || parts.some((part) => !part)) {
    return `必须使用“${NARRATIVE_SEED_LOCATION_FORMAT}”三段格式，例如“中国/上海/外滩钟楼”`
  }
  return null
}

export function pickNarrativeSeedAuthorFields(value: Record<string, unknown> | null | undefined): Record<string, unknown> {
  const source = value || {}
  return Object.fromEntries(
    NARRATIVE_SEED_AUTHOR_FIELDS
      .filter((field) => Object.prototype.hasOwnProperty.call(source, field))
      .map((field) => [field, source[field]])
  )
}

export function validateCompleteNarrativeSeedAuthoring(value: Record<string, unknown> | null | undefined): string[] {
  const source = value || {}
  const errors: string[] = []
  const missing = NARRATIVE_SEED_AUTHOR_FIELDS.filter((field) => !Object.prototype.hasOwnProperty.call(source, field))
  if (missing.length) errors.push(`缺少字段：${missing.join('、')}`)

  const emptyText = NARRATIVE_SEED_REQUIRED_TEXT_FIELDS.filter((field) => !String(source[field] ?? '').trim())
  if (emptyText.length) errors.push(`字段不能为空：${emptyText.join('、')}`)
  if (source.type !== undefined && !NARRATIVE_SEED_TYPES.includes(String(source.type) as typeof NARRATIVE_SEED_TYPES[number])) {
    errors.push(`type 非法：${String(source.type)}`)
  }
  if (source.status !== undefined && !NARRATIVE_SEED_STATUSES.includes(String(source.status) as typeof NARRATIVE_SEED_STATUSES[number])) {
    errors.push(`status 非法：${String(source.status)}`)
  }
  if (source.visibilityMode !== undefined && !NARRATIVE_SEED_VISIBILITY_MODES.includes(String(source.visibilityMode) as typeof NARRATIVE_SEED_VISIBILITY_MODES[number])) {
    errors.push(`visibilityMode 非法：${String(source.visibilityMode)}`)
  }
  if (Object.prototype.hasOwnProperty.call(source, 'allowFrontstage') && typeof source.allowFrontstage !== 'boolean') {
    errors.push('allowFrontstage 必须是 boolean')
  }
  if (Object.prototype.hasOwnProperty.call(source, 'mapFeatureId') && typeof source.mapFeatureId !== 'string') {
    errors.push('mapFeatureId 必须是字符串；没有已核实要素时显式填写空字符串')
  }
  if (Object.prototype.hasOwnProperty.call(source, 'participants') && !Array.isArray(source.participants)) {
    errors.push('participants 必须是数组；没有关联项时显式填写 []')
  }
  if (Object.prototype.hasOwnProperty.call(source, 'links') && !Array.isArray(source.links)) {
    errors.push('links 必须是数组；没有关系时显式填写 []')
  }
  if (String(source.locationText ?? '').trim()) {
    const locationError = validateNarrativeSeedLocationText(source.locationText)
    if (locationError) errors.push(`locationText ${locationError}`)
  }
  return errors
}
