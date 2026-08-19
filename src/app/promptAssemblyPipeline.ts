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
  /**
   * 正式 Agent 可逐步启用的严格校验。默认关闭，以兼容旧 UI preset 的宽松归一化行为。
   */
  strict?: boolean
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
  strict: boolean
  /** 本地装配诊断指纹，不是供应商 cache key 或 cache hit 证明。 */
  assemblyDigest: string
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
  identity: PromptAssemblyIdentity
}

export interface PromptAssemblyFromMessagesOptions {
  mode?: PromptAssemblyMode
  policyId?: string
  sourceKind?: PromptSourceKind
  idPrefix?: string
  titlePrefix?: string
  strict?: boolean
}

const VALID_ROLES = new Set<PromptAssemblyRole>(['system', 'user', 'assistant'])
const VALID_KINDS = new Set<PromptSourceKind>([
  'prompt_library',
  'scenario_mounted',
  'character_identity',
  'recall',
  'history',
  'current_user_input',
  'personality_context',
  'plan_synthesis',
  'runtime_notice',
  'manual',
  'other'
])

export type PromptAssemblyValidationCode =
  | 'prompt_policy_invalid_default_role'
  | 'prompt_source_duplicate_id'
  | 'prompt_source_invalid_role'
  | 'prompt_source_invalid_kind'
  | 'prompt_source_invalid_order'
  | 'prompt_source_order_conflict'
  | 'prompt_source_unresolved_template_variable'

export class PromptAssemblyValidationError extends Error {
  readonly code: PromptAssemblyValidationCode
  readonly fragmentId: string

  constructor(input: { code: PromptAssemblyValidationCode; fragmentId: string; message: string }) {
    super(input.message)
    this.name = 'PromptAssemblyValidationError'
    this.code = input.code
    this.fragmentId = input.fragmentId
  }
}

export interface PromptAssemblyIdentityFragment {
  id: string
  title: string
  kind: PromptSourceKind
  role: PromptAssemblyRole
  placement: PromptPlacementSlot
  content: string
  orderIndex: number
  modelVisible: boolean
  logVisible: boolean
}

export interface PromptAssemblyIdentity {
  schemaVersion: 'prompt-assembly-fragments-v1'
  /** FNV-1a 仅用于比较两次本地装配结果，不代表供应商缓存命中。 */
  digest: string
  fragments: PromptAssemblyIdentityFragment[]
}

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
  return VALID_KINDS.has(kind as PromptSourceKind) ? kind as PromptSourceKind : 'other'
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

function strictError(
  code: PromptAssemblyValidationCode,
  fragmentId: string,
  message: string
): never {
  throw new PromptAssemblyValidationError({ code, fragmentId, message })
}

function findUnresolvedTemplateVariable(content: string): string {
  const matched = content.match(/\{\{\s*[^{}\r\n]+?\s*\}\}/)
  return matched?.[0] || ''
}

function validateStrictSources(
  rawSources: PromptSource[],
  normalizedSources: NormalizedPromptSource[],
  policy: PromptPlacementPolicy
): void {
  if (policy.defaultRole !== undefined && !VALID_ROLES.has(String(policy.defaultRole).trim() as PromptAssemblyRole)) {
    strictError(
      'prompt_policy_invalid_default_role',
      'policy',
      `Prompt 装配策略 defaultRole 非法：${String(policy.defaultRole)}`
    )
  }

  const seenIds = new Set<string>()
  const explicitOrders = new Map<number, string>()

  rawSources.forEach((source, index) => {
    const fragment = normalizedSources[index]
    const fragmentId = fragment.id

    if (source.role !== undefined && !VALID_ROLES.has(String(source.role).trim() as PromptAssemblyRole)) {
      strictError(
        'prompt_source_invalid_role',
        fragmentId,
        `Prompt 片段 ${fragmentId} 的 role 非法：${String(source.role)}`
      )
    }
    if (source.kind !== undefined && !VALID_KINDS.has(String(source.kind).trim() as PromptSourceKind)) {
      strictError(
        'prompt_source_invalid_kind',
        fragmentId,
        `Prompt 片段 ${fragmentId} 的 kind 非法：${String(source.kind)}`
      )
    }
    if (source.orderIndex !== undefined) {
      if (typeof source.orderIndex !== 'number' || !Number.isFinite(source.orderIndex)) {
        strictError(
          'prompt_source_invalid_order',
          fragmentId,
          `Prompt 片段 ${fragmentId} 的 orderIndex 必须是有限数字`
        )
      }
      const conflictingFragmentId = explicitOrders.get(source.orderIndex)
      if (conflictingFragmentId) {
        strictError(
          'prompt_source_order_conflict',
          fragmentId,
          `Prompt 片段 ${fragmentId} 与 ${conflictingFragmentId} 的显式 orderIndex 冲突：${source.orderIndex}`
        )
      }
      explicitOrders.set(source.orderIndex, fragmentId)
    }
    if (seenIds.has(fragmentId)) {
      strictError(
        'prompt_source_duplicate_id',
        fragmentId,
        `Prompt 片段 id 重复：${fragmentId}`
      )
    }
    seenIds.add(fragmentId)

    const unresolvedVariable = findUnresolvedTemplateVariable(fragment.content)
    if (unresolvedVariable) {
      strictError(
        'prompt_source_unresolved_template_variable',
        fragmentId,
        `Prompt 片段 ${fragmentId} 仍含未解析模板变量：${unresolvedVariable}`
      )
    }
  })
}

function compareSourceOrder(left: NormalizedPromptSource, right: NormalizedPromptSource): number {
  if (left.orderIndex !== right.orderIndex) return left.orderIndex - right.orderIndex
  return left.sequenceIndex - right.sequenceIndex
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => stableValue(item))
  if (!value || typeof value !== 'object') return value
  const record = value as Record<string, unknown>
  return Object.fromEntries(
    Object.keys(record)
      .sort((left, right) => left.localeCompare(right, 'en'))
      .map((key) => [key, stableValue(record[key])])
  )
}

function hashPromptAssemblyFragments(value: unknown): string {
  const text = JSON.stringify(stableValue(value))
  let hash = 0x811c9dc5
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return `fnv1a32:${hash.toString(16).padStart(8, '0')}`
}

function buildPromptAssemblyIdentity(sources: NormalizedPromptSource[]): PromptAssemblyIdentity {
  const fragments: PromptAssemblyIdentityFragment[] = sources.map((source) => ({
    id: source.id,
    title: source.title,
    kind: source.kind,
    role: source.role,
    placement: source.placement,
    content: source.content,
    orderIndex: source.orderIndex,
    modelVisible: source.modelVisible,
    logVisible: source.logVisible
  }))
  return {
    schemaVersion: 'prompt-assembly-fragments-v1',
    digest: hashPromptAssemblyFragments(fragments),
    fragments
  }
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
  const rawSources = request.sources || []
  const normalizedSources = rawSources.map((source, index) => normalizeSource(source, index, policy))
  if (request.strict) validateStrictSources(rawSources, normalizedSources, policy)
  const sources = normalizedSources.sort(compareSourceOrder)
  const { messages, messageTraces } = buildMessages(sources, policy)
  const promptBlocks = buildPromptBlocks(sources)
  const mode = request.mode || 'other'
  const policyId = toText(policy.id) || 'default'
  const identity = buildPromptAssemblyIdentity(sources)

  return {
    messages,
    promptBlocks,
    sources,
    identity,
    trace: {
      mode,
      policyId,
      strict: Boolean(request.strict),
      assemblyDigest: identity.digest,
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
    // strict 时保留调用方原值交给统一校验，避免在校验前把非法 role 静默改成 system。
    const role = options.strict ? message?.role : normalizeRole(message?.role, 'system')
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
    sources,
    strict: options.strict
  })
}
