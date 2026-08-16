import type { ChatPromptLogBlock } from '../types'

export type PromptAssemblyRole = ChatPromptLogBlock['role']

export type PromptAssemblyMode =
  | 'normal_recall'
  | 'personality_model'
  | 'pure_prompt'
  | 'replay_prompt'
  | 'other'

export type PromptSourceKind =
  | 'prompt_library'
  | 'scenario_mounted'
  | 'character_identity'
  | 'recall'
  | 'history'
  | 'current_user_input'
  | 'personality_context'
  | 'plan_synthesis'
  | 'runtime_notice'
  | 'manual'
  | 'other'

export type PromptPlacementSlot =
  | 'system'
  | 'user'
  | 'assistant'
  | 'history'
  | 'metadata'

export interface PromptSource {
  id?: string
  title?: string
  kind?: PromptSourceKind
  role?: PromptAssemblyRole
  placement?: PromptPlacementSlot
  content?: unknown
  orderIndex?: number
  modelVisible?: boolean
  logVisible?: boolean
  metadata?: Record<string, unknown>
}

export interface PromptPlacementPolicy {
  id?: string
  label?: string
  defaultRole?: PromptAssemblyRole
  mergeAdjacentSameRole?: boolean
  messageJoiner?: string
}

export interface PromptAssemblyRequest {
  mode?: PromptAssemblyMode
  policy?: PromptPlacementPolicy
  sources?: PromptSource[]
  metadata?: Record<string, unknown>
}

export interface NormalizedPromptSource {
  id: string
  title: string
  kind: PromptSourceKind
  role: PromptAssemblyRole
  placement: PromptPlacementSlot
  content: string
  orderIndex: number
  sequenceIndex: number
  modelVisible: boolean
  logVisible: boolean
  metadata: Record<string, unknown>
}

export interface PromptAssemblyMessage {
  role: PromptAssemblyRole
  content: string
}

export interface PromptAssemblyMessageTrace {
  role: PromptAssemblyRole
  sourceIds: string[]
  contentLength: number
}

export interface PromptAssemblySourceTrace {
  id: string
  title: string
  kind: PromptSourceKind
  role: PromptAssemblyRole
  placement: PromptPlacementSlot
  orderIndex: number
  modelVisible: boolean
  logVisible: boolean
  contentLength: number
  metadata?: Record<string, unknown>
}

export interface PromptAssemblyTrace {
  mode: PromptAssemblyMode
  policyId: string
  sourceCount: number
  modelVisibleSourceCount: number
  logVisibleSourceCount: number
  messageCount: number
  promptBlockCount: number
  sources: PromptAssemblySourceTrace[]
  messages: PromptAssemblyMessageTrace[]
}

export interface PromptAssemblyResult {
  messages: PromptAssemblyMessage[]
  promptBlocks: ChatPromptLogBlock[]
  trace: PromptAssemblyTrace
  sources: NormalizedPromptSource[]
}

export interface PromptAssemblyFromMessagesOptions {
  mode?: PromptAssemblyMode
  policyId?: string
  sourceKind?: PromptSourceKind
  idPrefix?: string
  titlePrefix?: string
}

const VALID_ROLES = new Set<PromptAssemblyRole>(['system', 'user', 'assistant'])

function toText(value: unknown): string {
  return String(value ?? '').trim()
}

function normalizeRole(value: unknown, fallback: PromptAssemblyRole): PromptAssemblyRole {
  const role = String(value ?? '').trim()
  return VALID_ROLES.has(role as PromptAssemblyRole) ? role as PromptAssemblyRole : fallback
}

function normalizePlacement(value: unknown, role: PromptAssemblyRole): PromptPlacementSlot {
  const placement = String(value ?? '').trim()
  if (placement === 'system' || placement === 'user' || placement === 'assistant' || placement === 'history' || placement === 'metadata') {
    return placement
  }
  return role
}

function normalizeKind(value: unknown): PromptSourceKind {
  const kind = String(value ?? '').trim()
  switch (kind) {
    case 'prompt_library':
    case 'scenario_mounted':
    case 'character_identity':
    case 'recall':
    case 'history':
    case 'current_user_input':
    case 'personality_context':
    case 'plan_synthesis':
    case 'runtime_notice':
    case 'manual':
    case 'other':
      return kind
    default:
      return 'other'
  }
}

function normalizeBoolean(value: unknown, fallback: boolean): boolean {
  if (value === true || value === 1 || value === '1' || value === 'true') return true
  if (value === false || value === 0 || value === '0' || value === 'false') return false
  return fallback
}

function normalizeOrderIndex(value: unknown, fallback: number): number {
  const next = Number(value)
  return Number.isFinite(next) ? next : fallback
}

function normalizeSource(source: PromptSource, index: number, policy: PromptPlacementPolicy): NormalizedPromptSource {
  const content = toText(source.content)
  const role = normalizeRole(source.role, policy.defaultRole || 'system')
  const id = toText(source.id) || `source_${index + 1}`
  return {
    id,
    title: toText(source.title) || id,
    kind: normalizeKind(source.kind),
    role,
    placement: normalizePlacement(source.placement, role),
    content,
    orderIndex: normalizeOrderIndex(source.orderIndex, index),
    sequenceIndex: index,
    modelVisible: normalizeBoolean(source.modelVisible, Boolean(content)),
    logVisible: normalizeBoolean(source.logVisible, Boolean(content)),
    metadata: source.metadata && typeof source.metadata === 'object' && !Array.isArray(source.metadata)
      ? { ...source.metadata }
      : {}
  }
}

function compareSourceOrder(left: NormalizedPromptSource, right: NormalizedPromptSource): number {
  if (left.orderIndex !== right.orderIndex) return left.orderIndex - right.orderIndex
  return left.sequenceIndex - right.sequenceIndex
}

function buildMessages(
  sources: NormalizedPromptSource[],
  policy: PromptPlacementPolicy
): { messages: PromptAssemblyMessage[]; messageTraces: PromptAssemblyMessageTrace[] } {
  const joiner = policy.messageJoiner ?? '\n\n'
  const messages: PromptAssemblyMessage[] = []
  const messageTraces: PromptAssemblyMessageTrace[] = []

  for (const source of sources) {
    if (!source.modelVisible || !source.content) continue
    const lastMessage = messages[messages.length - 1]
    const lastTrace = messageTraces[messageTraces.length - 1]
    if (policy.mergeAdjacentSameRole && lastMessage && lastTrace && lastMessage.role === source.role) {
      lastMessage.content = [lastMessage.content, source.content].filter(Boolean).join(joiner)
      lastTrace.sourceIds.push(source.id)
      lastTrace.contentLength = lastMessage.content.length
      continue
    }
    messages.push({
      role: source.role,
      content: source.content
    })
    messageTraces.push({
      role: source.role,
      sourceIds: [source.id],
      contentLength: source.content.length
    })
  }

  return { messages, messageTraces }
}

function buildPromptBlocks(sources: NormalizedPromptSource[]): ChatPromptLogBlock[] {
  return sources
    .filter((source) => source.logVisible && source.content)
    .map((source) => ({
      role: source.role,
      title: source.title,
      content: source.content
    }))
}

export function assemblePromptFromSources(request: PromptAssemblyRequest): PromptAssemblyResult {
  const policy = request.policy || {}
  const sources = (request.sources || [])
    .map((source, index) => normalizeSource(source, index, policy))
    .sort(compareSourceOrder)
  const { messages, messageTraces } = buildMessages(sources, policy)
  const promptBlocks = buildPromptBlocks(sources)
  const mode = request.mode || 'other'
  const policyId = toText(policy.id) || 'default'

  return {
    messages,
    promptBlocks,
    sources,
    trace: {
      mode,
      policyId,
      sourceCount: sources.length,
      modelVisibleSourceCount: sources.filter((source) => source.modelVisible && source.content).length,
      logVisibleSourceCount: sources.filter((source) => source.logVisible && source.content).length,
      messageCount: messages.length,
      promptBlockCount: promptBlocks.length,
      sources: sources.map((source) => ({
        id: source.id,
        title: source.title,
        kind: source.kind,
        role: source.role,
        placement: source.placement,
        orderIndex: source.orderIndex,
        modelVisible: source.modelVisible,
        logVisible: source.logVisible,
        contentLength: source.content.length,
        ...(Object.keys(source.metadata).length ? { metadata: { ...source.metadata } } : {})
      })),
      messages: messageTraces
    }
  }
}

export function assemblePromptFromMessages(
  messages: PromptAssemblyMessage[],
  options: PromptAssemblyFromMessagesOptions = {}
): PromptAssemblyResult {
  const sourceKind = options.sourceKind || 'manual'
  const idPrefix = toText(options.idPrefix) || 'message'
  const titlePrefix = toText(options.titlePrefix) || ''
  const sources: PromptSource[] = (Array.isArray(messages) ? messages : []).map((message, index) => {
    const role = normalizeRole(message?.role, 'system')
    const roleLabel = role === 'system' ? '系统' : role === 'user' ? '用户' : '助手'
    return {
      id: `${idPrefix}_${index + 1}`,
      title: titlePrefix ? `${titlePrefix} ${index + 1}` : `${roleLabel}区块 ${index + 1}`,
      kind: sourceKind,
      role,
      content: message?.content || '',
      orderIndex: index
    }
  })
  return assemblePromptFromSources({
    mode: options.mode || 'other',
    policy: { id: options.policyId || 'messages' },
    sources
  })
}
