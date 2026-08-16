import type { ChatMessage } from '../types'
import { cleanMessageProjectionSourceText } from './messageProjectionAgent'
import { readMessageAttachments, type ChatImageAttachment } from '../utils/chatAttachments'

export type ProjectionFirstFallbackSource =
  | 'projection'
  | 'projection_failed_fallback'
  | 'missing_projection_message_fallback'

export type ProjectionFirstEnv = {
  time?: string
  date?: string
  weather?: string
  location?: string
}

export type ProjectionFirstChanged = {
  time?: boolean
  location?: boolean
  weather?: boolean
}

export type ProjectionFirstMessageView = {
  id: number
  sessionId: string
  messageId: number
  projectionId: string
  projectionStatus: string
  role: 'user' | 'assistant' | 'system'
  messageKind: string
  speakerName: string
  name: string
  memberName: string
  content: string
  fact: string
  // 图片附件（输入框图片上传计划批4）：投影优先视图重构消息时按固定字段拷贝，attachmentsJson/attachments
  // 等原始键名不在此清单里会被丢——单独摘出存好，formatHistoryMessage 用 readMessageAttachments(view) 读它。
  attachments: ChatImageAttachment[]
  startEnv: ProjectionFirstEnv
  endEnv: ProjectionFirstEnv
  changed: ProjectionFirstChanged
  fallbackSource: ProjectionFirstFallbackSource
  fallbackReason: string
  needsProjectionRun: boolean
}

export type ProjectionFirstFallbackJob = {
  sessionId: string
  messageId: number
  characterId: string
  fallbackSource: ProjectionFirstFallbackSource
  fallbackReason: string
  requestedAt: string
}

export type ProjectionFirstMessageViewResult = {
  sessionId: string
  characterId: string
  items: ProjectionFirstMessageView[]
  fallbackJobs: ProjectionFirstFallbackJob[]
  windowSize: number
}

export type BuildProjectionFirstMessageViewInput = {
  sessionId: string
  characterId: string
  messages: Array<Partial<ChatMessage> & Record<string, unknown>>
  projections?: Array<Record<string, unknown>>
  windowSize?: number
  currentMessageIds?: Array<number | string>
  requestedAt?: string
}

const DEFAULT_PROJECTION_FIRST_WINDOW_SIZE = 23

function toText(value: unknown): string {
  return String(value ?? '').trim()
}

function toNumber(value: unknown): number {
  const number = Number(value ?? 0)
  return Number.isInteger(number) && number > 0 ? number : 0
}

function parseJsonObject(value: unknown): Record<string, unknown> {
  if (!value) return {}
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {}
    } catch {
      return {}
    }
  }
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function readMessageKind(message: Record<string, unknown>): string {
  return toText(message.messageKind ?? message.message_kind) || 'chat'
}

function readRole(message: Record<string, unknown>): ProjectionFirstMessageView['role'] {
  const role = toText(message.role)
  return role === 'user' || role === 'system' ? role : 'assistant'
}

function isTruthyFlag(value: unknown): boolean {
  return value === true || value === 1 || value === '1' || value === 'true'
}

function isFalseyIncludeFlag(value: unknown): boolean {
  return value === false || value === 0 || value === '0' || value === 'false'
}

export function isProjectionFirstEligibleMessage(message: Record<string, unknown>): boolean {
  if (!message || typeof message.content !== 'string') return false
  const role = readRole(message)
  const messageKind = readMessageKind(message)
  if (role === 'system' || messageKind === 'system' || messageKind === 'narration_debug' || messageKind === 'caps_reply') return false
  if (isTruthyFlag(message.autoWriteHidden ?? message.auto_write_hidden)) return false
  if (isFalseyIncludeFlag(message.includeInContext ?? message.include_in_context)) return false
  return Boolean(cleanMessageProjectionSourceText(String(message.content || ''), { isUserMessage: role === 'user' }).trim())
}

function readMessageId(message: Record<string, unknown>): number {
  return toNumber(message.id ?? message.messageId ?? message.message_id)
}

function readSessionId(message: Record<string, unknown>, fallback: string): string {
  return toText(message.sessionId ?? message.session_id) || fallback
}

function readMessageSpeakerName(message: Record<string, unknown>): string {
  const role = readRole(message)
  return toText(message.name ?? message.memberName ?? message.member_name)
    || (role === 'user' ? '用户' : role === 'assistant' ? '角色' : '系统')
}

function buildMessageEnv(message: Record<string, unknown>): ProjectionFirstEnv {
  return {
    time: toText(message.time),
    date: toText(message.envDate ?? message.env_date),
    weather: toText(message.envWeather ?? message.env_weather),
    location: toText(message.envLocation ?? message.env_location)
  }
}

function readProjectionMessageId(projection: Record<string, unknown>): number {
  return toNumber(projection.messageId ?? projection.message_id)
}

function readProjectionCreatedAt(projection: Record<string, unknown>): string {
  return toText(projection.createdAt ?? projection.created_at)
}

function compareProjectionByCreatedAt(left: Record<string, unknown>, right: Record<string, unknown>): number {
  const leftTime = Date.parse(readProjectionCreatedAt(left)) || 0
  const rightTime = Date.parse(readProjectionCreatedAt(right)) || 0
  if (leftTime !== rightTime) return leftTime - rightTime
  return toText(left.id).localeCompare(toText(right.id))
}

function indexLatestProjectionByMessage(projections: Array<Record<string, unknown>> = []): Map<number, Record<string, unknown>> {
  const map = new Map<number, Record<string, unknown>>()
  projections
    .filter((projection) => readProjectionMessageId(projection) > 0)
    .slice()
    .sort(compareProjectionByCreatedAt)
    .forEach((projection) => {
      map.set(readProjectionMessageId(projection), projection)
    })
  return map
}

function normalizeWindowSize(value: unknown): number {
  const size = Math.floor(Number(value) || DEFAULT_PROJECTION_FIRST_WINDOW_SIZE)
  return Math.max(1, Math.min(100, size))
}

function buildWindowMessages(
  messages: Array<Record<string, unknown>>,
  windowSize: number,
  currentMessageIds: Array<number | string> = []
): Array<Record<string, unknown>> {
  const eligible = messages
    .filter(isProjectionFirstEligibleMessage)
    .filter((message) => readMessageId(message) > 0)
    .sort((left, right) => readMessageId(left) - readMessageId(right))
  const currentIds = new Set(currentMessageIds.map(toNumber).filter(Boolean))
  const selected = new Map<number, Record<string, unknown>>()
  eligible.slice(-windowSize).forEach((message) => selected.set(readMessageId(message), message))
  eligible.forEach((message) => {
    const messageId = readMessageId(message)
    if (currentIds.has(messageId)) selected.set(messageId, message)
  })
  return Array.from(selected.values()).sort((left, right) => readMessageId(left) - readMessageId(right))
}

function projectionFact(projection: Record<string, unknown>): string {
  return toText(projection.objectiveFact ?? projection.objective_fact)
}

function projectionFallbackText(projection: Record<string, unknown>): string {
  return toText(projection.fallbackCleanText ?? projection.fallback_clean_text)
}

function buildProjectionView(input: {
  sessionId: string
  characterId: string
  message: Record<string, unknown>
  projection: Record<string, unknown>
  requestedAt: string
}): { view: ProjectionFirstMessageView; fallbackJob: ProjectionFirstFallbackJob | null } {
  const { sessionId, characterId, message, projection, requestedAt } = input
  const messageId = readMessageId(message)
  const status = toText(projection.status) || 'complete'
  const speakerName = toText(projection.speakerName ?? projection.speaker_name) || readMessageSpeakerName(message)
  const fact = projectionFact(projection)
  const fallbackText = projectionFallbackText(projection)
  const useFailedFallback = status === 'failed'
  const isUserMessage = readRole(message) === 'user'
  const content = useFailedFallback
    ? (fallbackText || cleanMessageProjectionSourceText(String(message.content || ''), { isUserMessage }))
    : (fact || cleanMessageProjectionSourceText(String(message.content || ''), { isUserMessage }))
  const fallbackSource: ProjectionFirstFallbackSource = useFailedFallback
    ? 'projection_failed_fallback'
    : fact
      ? 'projection'
      : 'missing_projection_message_fallback'
  const fallbackReason = useFailedFallback
    ? (toText(projection.failureReason ?? projection.failure_reason) || 'projection_failed')
    : fact
      ? ''
      : `projection_${status || 'incomplete'}_without_fact`
  const needsProjectionRun = fallbackSource !== 'projection'
  return {
    view: {
      id: messageId,
      sessionId: readSessionId(message, sessionId),
      messageId,
      projectionId: toText(projection.id),
      projectionStatus: status,
      role: readRole(message),
      messageKind: readMessageKind(message),
      speakerName,
      name: speakerName,
      memberName: speakerName,
      content,
      fact: content,
      attachments: readMessageAttachments(message),
      startEnv: parseJsonObject(projection.startEnv ?? projection.start_env_json) as ProjectionFirstEnv,
      endEnv: parseJsonObject(projection.endEnv ?? projection.end_env_json) as ProjectionFirstEnv,
      changed: parseJsonObject(projection.changed ?? projection.changed_json) as ProjectionFirstChanged,
      fallbackSource,
      fallbackReason,
      needsProjectionRun
    },
    fallbackJob: needsProjectionRun
      ? { sessionId, messageId, characterId, fallbackSource, fallbackReason, requestedAt }
      : null
  }
}

function buildMissingProjectionView(input: {
  sessionId: string
  characterId: string
  message: Record<string, unknown>
  requestedAt: string
}): { view: ProjectionFirstMessageView; fallbackJob: ProjectionFirstFallbackJob } {
  const { sessionId, characterId, message, requestedAt } = input
  const messageId = readMessageId(message)
  const speakerName = readMessageSpeakerName(message)
  const fact = cleanMessageProjectionSourceText(String(message.content || ''), { isUserMessage: readRole(message) === 'user' })
  const env = buildMessageEnv(message)
  const fallbackReason = 'missing_projection'
  return {
    view: {
      id: messageId,
      sessionId: readSessionId(message, sessionId),
      messageId,
      projectionId: '',
      projectionStatus: 'missing',
      role: readRole(message),
      messageKind: readMessageKind(message),
      speakerName,
      name: speakerName,
      memberName: speakerName,
      content: fact,
      fact,
      attachments: readMessageAttachments(message),
      startEnv: env,
      endEnv: env,
      changed: { time: false, location: false, weather: false },
      fallbackSource: 'missing_projection_message_fallback',
      fallbackReason,
      needsProjectionRun: true
    },
    fallbackJob: {
      sessionId,
      messageId,
      characterId,
      fallbackSource: 'missing_projection_message_fallback',
      fallbackReason,
      requestedAt
    }
  }
}

export function buildProjectionFirstMessageView(input: BuildProjectionFirstMessageViewInput): ProjectionFirstMessageViewResult {
  const sessionId = toText(input.sessionId)
  const characterId = toText(input.characterId)
  const windowSize = normalizeWindowSize(input.windowSize)
  const requestedAt = toText(input.requestedAt) || new Date().toISOString()
  const messages = (Array.isArray(input.messages) ? input.messages : []) as Array<Record<string, unknown>>
  const projectionByMessageId = indexLatestProjectionByMessage(input.projections || [])
  const windowMessages = buildWindowMessages(messages, windowSize, input.currentMessageIds || [])
  const items: ProjectionFirstMessageView[] = []
  const fallbackJobs: ProjectionFirstFallbackJob[] = []

  windowMessages.forEach((message) => {
    const messageId = readMessageId(message)
    const projection = projectionByMessageId.get(messageId)
    const result = projection
      ? buildProjectionView({ sessionId, characterId, message, projection, requestedAt })
      : buildMissingProjectionView({ sessionId, characterId, message, requestedAt })
    items.push(result.view)
    if (result.fallbackJob) fallbackJobs.push(result.fallbackJob)
  })

  return {
    sessionId,
    characterId,
    items,
    fallbackJobs,
    windowSize
  }
}
