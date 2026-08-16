export type FocusedActionVisibility = 'private' | 'public'

export const FOCUSED_ACTION_SOURCE_KIND = 'focused_action'
export const FOCUSED_ACTION_DEFAULT_VISIBILITY: FocusedActionVisibility = 'private'

export function normalizeFocusedActionVisibility(value: unknown): FocusedActionVisibility {
  const text = String(value ?? '').trim().toLowerCase()
  return text === 'public' || text === '公开' || text === '非私密'
    ? 'public'
    : FOCUSED_ACTION_DEFAULT_VISIBILITY
}

export function normalizeMessageSourceKind(value: unknown): '' | typeof FOCUSED_ACTION_SOURCE_KIND {
  return String(value ?? '').trim() === FOCUSED_ACTION_SOURCE_KIND ? FOCUSED_ACTION_SOURCE_KIND : ''
}

export function isFocusedActionMessage(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  return normalizeMessageSourceKind(record.messageSourceKind ?? record.message_source_kind) === FOCUSED_ACTION_SOURCE_KIND
}

export function readFocusedActionGroupId(value: unknown): string {
  if (!value || typeof value !== 'object') return ''
  const record = value as Record<string, unknown>
  return String(record.focusedActionGroupId ?? record.focused_action_group_id ?? '').trim()
}

export function readFocusedActionVisibility(value: unknown): FocusedActionVisibility {
  if (!value || typeof value !== 'object') return FOCUSED_ACTION_DEFAULT_VISIBILITY
  const record = value as Record<string, unknown>
  return normalizeFocusedActionVisibility(record.focusedActionVisibility ?? record.focused_action_visibility)
}

/** 私密动作只允许提调做后台核账；任何新增旁白或角色回复都可能把观察意图/结果反向泄给角色。 */
export function shouldSuppressFocusedActionAudienceOutputs(value: unknown): boolean {
  return isFocusedActionMessage(value) && readFocusedActionVisibility(value) === 'private'
}

export function buildFocusedActionGroupId(sessionId: unknown, inputMessageId: unknown): string {
  const session = String(sessionId ?? '').trim()
  const messageId = Number(inputMessageId || 0)
  if (!session || !Number.isInteger(messageId) || messageId <= 0) return ''
  return `focused-action:${session}:${messageId}`
}
