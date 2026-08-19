/**
 * 剧本统一编排协议。
 *
 * 这里只定义跨前端、服务端和 Agent 共用的稳定语义与纯规则；数据库归属、权限、
 * 事务和具体领域写入继续由服务端 application service 负责。
 */

export const ORCHESTRATION_PRESENCE_STATES = ['unknown', 'present', 'offstage'] as const
export type OrchestrationPresenceState = (typeof ORCHESTRATION_PRESENCE_STATES)[number]

export const ORCHESTRATION_PRESENCE_EVENT_TYPES = [
  'proposed',
  'committed',
  'cancelled',
  'corrected'
] as const
export type OrchestrationPresenceEventType = (typeof ORCHESTRATION_PRESENCE_EVENT_TYPES)[number]

export const ORCHESTRATION_PRESENCE_TRANSITIONS = [
  'enter',
  'exit',
  'stay',
  'unknown_to_present',
  'unknown_to_offstage'
] as const
export type OrchestrationPresenceTransition = (typeof ORCHESTRATION_PRESENCE_TRANSITIONS)[number]

export const ORCHESTRATION_SCOPES = ['world', 'session', 'round'] as const
export type OrchestrationScopeKind = (typeof ORCHESTRATION_SCOPES)[number]

export const ORCHESTRATION_VISIBILITIES = ['user', 'director_only', 'participants', 'public'] as const
export type OrchestrationVisibility = (typeof ORCHESTRATION_VISIBILITIES)[number]

export const SESSION_CHARACTER_STATE_MODES = ['follow_main', 'independent_snapshot'] as const
export type SessionCharacterStateMode = (typeof SESSION_CHARACTER_STATE_MODES)[number]

export const ORCHESTRATION_COMMAND_NAMES = [
  'setCharacterPresence',
  'proposePresenceTransition',
  'commitPresenceTransition',
  'cancelPresenceTransition',
  'patchCharacterStatus',
  'patchWorldEntityStatus',
  'saveStatusPanelTemplate',
  'saveStatusPanel',
  'saveWorldNarrativeConfig',
  'createNarrativeSeed',
  'updateNarrativeSeed',
  'deleteNarrativeSeed',
  'updateCurtainScene',
  'saveSessionNarrativeOverride'
] as const
export type OrchestrationCommandName = (typeof ORCHESTRATION_COMMAND_NAMES)[number]

export const ORCHESTRATION_ERROR_CODES = {
  invalidCommand: 'ORCHESTRATION_INVALID_COMMAND',
  invalidTargetRef: 'ORCHESTRATION_INVALID_TARGET_REF',
  scopeMismatch: 'ORCHESTRATION_SCOPE_MISMATCH',
  versionConflict: 'ORCHESTRATION_VERSION_CONFLICT',
  missingCharacterBranch: 'ORCHESTRATION_MISSING_CHARACTER_BRANCH',
  worldScopeViolation: 'ORCHESTRATION_WORLD_SCOPE_VIOLATION',
  idempotencyConflict: 'ORCHESTRATION_IDEMPOTENCY_CONFLICT'
} as const
export type OrchestrationErrorCode = (typeof ORCHESTRATION_ERROR_CODES)[keyof typeof ORCHESTRATION_ERROR_CODES]

export class OrchestrationProtocolError extends Error {
  readonly code: OrchestrationErrorCode
  readonly details?: Record<string, unknown>

  constructor(code: OrchestrationErrorCode, message: string, details?: Record<string, unknown>) {
    super(message)
    this.name = 'OrchestrationProtocolError'
    this.code = code
    this.details = details
  }
}

export type SessionCharacterTargetRef = {
  kind: 'session_character'
  participantId: string
}

export type StatusPanelTargetRef = {
  kind: 'status_panel'
  panelId: string
}

export type StatusPanelTemplateTargetRef = {
  kind: 'status_panel_template'
  templateId: string
}

export type WorldEntityTargetRef = {
  kind: 'world_entity'
  entityId: string
}

export type NarrativeSeedTargetRef = {
  kind: 'narrative_seed'
  seedId: string
}

export type NarrativeConfigTargetRef = {
  kind: 'narrative_config'
  worldId: string
}

export type CurtainTargetRef = {
  kind: 'curtain'
  sessionId: string
}

export type SessionNarrativeOverrideTargetRef = {
  kind: 'session_narrative_override'
  sessionId: string
}

export type OrchestrationTargetRef =
  | SessionCharacterTargetRef
  | StatusPanelTargetRef
  | StatusPanelTemplateTargetRef
  | WorldEntityTargetRef
  | NarrativeConfigTargetRef
  | NarrativeSeedTargetRef
  | CurtainTargetRef
  | SessionNarrativeOverrideTargetRef

export type OrchestrationCommandSource = {
  sourceMessageId?: string
  sourceDirectorRunId?: string
  sourceAgentRunId?: string
  evidenceSummary: string
}

export type OrchestrationCommandEnvelope<TPayload = Record<string, unknown>> = {
  command: OrchestrationCommandName
  sessionId: string
  worldId: string
  targetRef: OrchestrationTargetRef
  expectedVersion: number
  idempotencyKey: string
  source: OrchestrationCommandSource
  payload: TPayload
}

export type OrchestrationProjectionItem<T> = {
  value: T
  sourceRef: string
  version: number
  updatedAt: string
  scope: OrchestrationScopeKind
  visibility: OrchestrationVisibility
}

export type OrchestrationWorkspaceScope = {
  userId: string
  workspaceId: string
  sessionId: string
  sessionTitle: string
  worldId: string
  viewRevision: string
}

export type OrchestrationPresenceRecord = {
  participantId: string
  worldId: string
  state: OrchestrationPresenceState
  version: number
  locationText?: string
  mapSheetId?: string
  mapFeatureId?: string
  sinceMessageId?: string
}

export type OrchestrationCastRosterItem = {
  participantId: string
  characterId: string
  displayName: string
  characterStateMode: SessionCharacterStateMode
  characterBranchId: string
  presence: OrchestrationPresenceRecord
  pendingTransition?: OrchestrationProjectionItem<{
    eventId: string
    transition: OrchestrationPresenceTransition
    toState: OrchestrationPresenceState
  }> | null
  statusPanelRefs: string[]
}

export type OrchestrationConflict = {
  code: 'stale_version' | 'unresolved_legacy_host' | 'missing_branch' | 'unknown_presence'
  targetRef: OrchestrationTargetRef
  message: string
  currentVersion?: number
}

export type OrchestrationTimelineEntry = {
  kind: 'message' | 'presence_fact' | 'seed_fact' | 'status_update'
  title: string
  summary: string
  targetId?: string
  messageId?: string
}

export type OrchestrationWorkspaceProjection = {
  scope: OrchestrationWorkspaceScope
  world: {
    narrativeConfig: OrchestrationProjectionItem<Record<string, unknown>> | null
    narrativeSeeds: Array<OrchestrationProjectionItem<Record<string, unknown>>>
    worldEntities: Array<OrchestrationProjectionItem<Record<string, unknown>>>
  }
  scene: {
    curtain: OrchestrationProjectionItem<Record<string, unknown>>
    mapRefs: Array<OrchestrationProjectionItem<Record<string, unknown>>>
  }
  castRoster: OrchestrationCastRosterItem[]
  /** 用户工作台读取的完整状态栏投影；不得复用只含索引信息的 director.statusCatalog。 */
  statusPanels: Array<OrchestrationProjectionItem<Record<string, unknown>>>
  orchestration: {
    sessionOverride: OrchestrationProjectionItem<Record<string, unknown>> | null
    lastCommittedScenario: OrchestrationProjectionItem<Record<string, unknown>> | null
  }
  recentRound: OrchestrationProjectionItem<Record<string, unknown>> | null
  timeline: Array<OrchestrationProjectionItem<OrchestrationTimelineEntry>>
  conflicts: OrchestrationConflict[]
}

export type SessionNarrativeOverride = {
  id: string
  sessionId: string
  worldId: string
  content: string
  version: number
  source: string
  createdAt: string
  updatedAt: string
}

export type SessionOrchestrationState = {
  id: string
  sessionId: string
  worldId: string
  scenarioCode: string
  scenarioLabel: string
  scenarioSummary: string
  anchorMessageId: string
  sourceArtifactId: string
  /** 情境检查点依赖版本向量的持久化 JSON；读取适配器会解析为 dependencySnapshot。 */
  dependencySnapshotJson?: string
  dependencySnapshot?: {
    fingerprint?: string
    values: Readonly<Record<string, string | number | boolean | null | undefined>>
  }
  version: number
  source: string
  createdAt: string
  updatedAt: string
}

export type SessionOrchestrationMaterials = {
  sessionId: string
  worldId: string
  narrativeOverride: SessionNarrativeOverride | null
  state: SessionOrchestrationState | null
}

export type DirectorOrchestrationCandidate = {
  participantId: string
  characterId?: string
  displayName?: string
  presenceState: OrchestrationPresenceState
  reason: 'present' | 'unknown_compatibility' | 'forced_offstage'
}

/** 提调实际消费的有界投影；每项保留 sourceRef/version，便于提示词追踪与工作台对账。 */
export type DirectorOrchestrationProjection = {
  scope: OrchestrationWorkspaceScope
  curtain: OrchestrationProjectionItem<Record<string, unknown>>
  candidates: DirectorOrchestrationCandidate[]
  presences: OrchestrationPresenceRecord[]
  relevantNarrativeSeeds: Array<OrchestrationProjectionItem<Record<string, unknown>>>
  /** 提示词常驻短目录，不含字段当前值；命中后按 sourceRef/状态栏工具读取详情。 */
  statusCatalog: Array<OrchestrationProjectionItem<Record<string, unknown>>>
  sessionOverride: OrchestrationProjectionItem<Record<string, unknown>> | null
  lastCommittedScenario: OrchestrationProjectionItem<Record<string, unknown>> | null
}

export type SessionCharacterStateTarget =
  | { kind: 'character_main'; characterId: string }
  | { kind: 'character_branch'; characterId: string; branchId: string; participantId: string }

export type PresenceEventMutation = {
  eventType: OrchestrationPresenceEventType
  provisional: boolean
  transition: OrchestrationPresenceTransition
  toState?: OrchestrationPresenceState
}

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

export function isOrchestrationPresenceState(value: unknown): value is OrchestrationPresenceState {
  return ORCHESTRATION_PRESENCE_STATES.includes(value as OrchestrationPresenceState)
}

export function createSessionCharacterTargetRef(participantId: string): SessionCharacterTargetRef {
  if (!nonEmpty(participantId)) {
    throw new OrchestrationProtocolError(
      ORCHESTRATION_ERROR_CODES.invalidTargetRef,
      '角色在场目标必须指向正式会话参与者。'
    )
  }
  return { kind: 'session_character', participantId: participantId.trim() }
}

/** 独立快照缺分支时必须失败，禁止回退角色主线。 */
export function resolveSessionCharacterStateTarget(input: {
  participantId: string
  characterId: string
  characterStateMode: SessionCharacterStateMode
  characterBranchId?: string | null
}): SessionCharacterStateTarget {
  if (!nonEmpty(input.participantId) || !nonEmpty(input.characterId)) {
    throw new OrchestrationProtocolError(
      ORCHESTRATION_ERROR_CODES.invalidTargetRef,
      '会话角色目标缺少 participantId 或 characterId。'
    )
  }
  if (input.characterStateMode === 'follow_main') {
    return { kind: 'character_main', characterId: input.characterId.trim() }
  }
  if (input.characterStateMode !== 'independent_snapshot') {
    throw new OrchestrationProtocolError(
      ORCHESTRATION_ERROR_CODES.invalidTargetRef,
      `未知角色状态挂载模式：${String(input.characterStateMode)}`
    )
  }
  if (!nonEmpty(input.characterBranchId)) {
    throw new OrchestrationProtocolError(
      ORCHESTRATION_ERROR_CODES.missingCharacterBranch,
      '独立快照参与者缺少合法分支，禁止回退角色主真值。',
      { participantId: input.participantId, characterId: input.characterId }
    )
  }
  return {
    kind: 'character_branch',
    characterId: input.characterId.trim(),
    branchId: input.characterBranchId.trim(),
    participantId: input.participantId.trim()
  }
}

/**
 * 正式成员是候选上限；在场默认可参与，unknown 只在兼容期可参与，离场只有被强制点名才交提调判断。
 */
export function selectDirectorOrchestrationCandidates(input: {
  participantIds: readonly string[]
  presenceByParticipantId: Readonly<Record<string, OrchestrationPresenceState | undefined>>
  forcedParticipantIds?: readonly string[]
}): DirectorOrchestrationCandidate[] {
  const forced = new Set((input.forcedParticipantIds || []).filter(nonEmpty))
  const seen = new Set<string>()
  const result: DirectorOrchestrationCandidate[] = []
  for (const rawParticipantId of input.participantIds) {
    const participantId = String(rawParticipantId || '').trim()
    if (!participantId || seen.has(participantId)) continue
    seen.add(participantId)
    const presenceState = input.presenceByParticipantId[participantId] || 'unknown'
    if (presenceState === 'present') {
      result.push({ participantId, presenceState, reason: 'present' })
    } else if (presenceState === 'unknown') {
      result.push({ participantId, presenceState, reason: 'unknown_compatibility' })
    } else if (forced.has(participantId)) {
      result.push({ participantId, presenceState, reason: 'forced_offstage' })
    }
  }
  return result
}

/**
 * 预计事件只进事件账本，不改变当前在场事实；只有 committed/corrected 才检查版本并推进当前态。
 */
export function applyPresenceEventToCurrent(
  current: OrchestrationPresenceRecord,
  event: PresenceEventMutation,
  expectedVersion: number
): OrchestrationPresenceRecord {
  if (event.eventType === 'proposed' || event.eventType === 'cancelled') return { ...current }
  if (event.provisional || !event.toState) {
    throw new OrchestrationProtocolError(
      ORCHESTRATION_ERROR_CODES.invalidCommand,
      '正式在场提交必须是非 provisional 且明确给出 toState。'
    )
  }
  if (current.version !== expectedVersion) {
    throw new OrchestrationProtocolError(
      ORCHESTRATION_ERROR_CODES.versionConflict,
      '角色在场状态版本已变化，请重读后再提交。',
      { expectedVersion, currentVersion: current.version, participantId: current.participantId }
    )
  }
  return {
    ...current,
    state: event.toState,
    version: current.version + 1
  }
}

/** 无世界投影不允许携带任何世界种子或世界实体，避免跨世界回退。 */
export function assertOrchestrationProjectionWorldScope(projection: OrchestrationWorkspaceProjection): void {
  if (projection.scope.worldId) return
  if (projection.world.narrativeConfig || projection.world.narrativeSeeds.length || projection.world.worldEntities.length) {
    throw new OrchestrationProtocolError(
      ORCHESTRATION_ERROR_CODES.worldScopeViolation,
      '无世界会话的编排投影必须保持世界资料空范围。',
      { sessionId: projection.scope.sessionId }
    )
  }
}

export function assertOrchestrationCommandEnvelope(
  command: OrchestrationCommandEnvelope
): asserts command is OrchestrationCommandEnvelope {
  if (!ORCHESTRATION_COMMAND_NAMES.includes(command.command)) {
    throw new OrchestrationProtocolError(
      ORCHESTRATION_ERROR_CODES.invalidCommand,
      `未知编排命令：${String(command.command)}`
    )
  }
  if (!nonEmpty(command.sessionId) || !nonEmpty(command.idempotencyKey)) {
    throw new OrchestrationProtocolError(
      ORCHESTRATION_ERROR_CODES.invalidCommand,
      '编排命令缺少 sessionId 或 idempotencyKey。'
    )
  }
  if (!Number.isInteger(command.expectedVersion) || command.expectedVersion < 0) {
    throw new OrchestrationProtocolError(
      ORCHESTRATION_ERROR_CODES.invalidCommand,
      'expectedVersion 必须是非负整数。'
    )
  }
  if (!nonEmpty(command.source?.evidenceSummary)) {
    throw new OrchestrationProtocolError(
      ORCHESTRATION_ERROR_CODES.invalidCommand,
      '编排命令必须携带可审计的 evidenceSummary。'
    )
  }
}
