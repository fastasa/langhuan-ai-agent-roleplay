/**
 * Agent 原始可见上下文的跨端稳定协议。
 *
 * 领域真值继续由各自 application service 维护；这里仅定义可重建 read model 的
 * 来源、作用域、可信层、知情视角和失败语义，禁止把投影持久化成第二业务真值。
 */

export const AGENT_CONTEXT_PROJECTION_KINDS = [
  'chat.visible_context',
  'session.world_context',
  'orchestration.workspace',
  'session.cast_presence',
  'status.panel_catalog',
  'status.panels',
  'world.narrative_seeds',
  'character.private_profile',
  'character.observable_profile',
  'character.knowledge',
  'game.rimworld_pawn',
  'world.knowledge_scope'
] as const

export type AgentContextProjectionKind = (typeof AGENT_CONTEXT_PROJECTION_KINDS)[number]

export const AGENT_CONTEXT_CLASSIFICATIONS = [
  'world_truth',
  'session_truth',
  'character_private',
  'observable',
  'candidate',
  'audit'
] as const
export type AgentContextClassification = (typeof AGENT_CONTEXT_CLASSIFICATIONS)[number]

export const AGENT_CONTEXT_VISIBILITIES = [
  'director_only',
  'user',
  'character_known',
  'scene_observable',
  'participants',
  'public'
] as const
export type AgentContextVisibility = (typeof AGENT_CONTEXT_VISIBILITIES)[number]

export type AgentContextPerspective =
  | { kind: 'system_director' }
  | { kind: 'user' }
  | { kind: 'character'; characterId: string }

export type AgentContextScope = {
  userId: string
  workspaceId: string
  worldId?: string
  sessionId?: string
  roundId?: string
}

export type AgentContextContinuation = {
  toolName: string
  ref: string
}

export type AgentContextProjection<T = unknown> = {
  kind: AgentContextProjectionKind
  schemaVersion: string
  sourceRef: string
  sourceVersion: string | number
  generatedAt: string
  scope: AgentContextScope
  classification: AgentContextClassification
  visibility: AgentContextVisibility
  perspective: AgentContextPerspective
  value: T
  truncated: boolean
  continuation?: AgentContextContinuation
  warnings: string[]
}

export type AgentContextUnavailableReason =
  | 'not_mounted'
  | 'empty_scope'
  | 'not_implemented'
  | 'not_authorized'
  | 'not_found'
  | 'source_failed'

export type AgentContextUnavailableProjection = {
  kind: AgentContextProjectionKind
  status: 'unavailable'
  reason: AgentContextUnavailableReason
  scope: AgentContextScope
  perspective: AgentContextPerspective
  message: string
  warnings: string[]
}

export type AgentContextProjectionResult<T = unknown> =
  | { status: 'available'; projection: AgentContextProjection<T> }
  | AgentContextUnavailableProjection

export type AgentContextBundle = {
  agentKind: string
  recipeVersion: string
  scope: AgentContextScope
  perspective: AgentContextPerspective
  generatedAt: string
  projections: AgentContextProjectionResult[]
  omitted: Array<{ kind: AgentContextProjectionKind; reason: 'budget' | 'not_requested' }>
}

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

export function isAgentContextProjectionKind(value: unknown): value is AgentContextProjectionKind {
  return AGENT_CONTEXT_PROJECTION_KINDS.includes(value as AgentContextProjectionKind)
}

export function assertAgentContextProjection(projection: AgentContextProjection): void {
  if (!isAgentContextProjectionKind(projection.kind)) throw new Error(`未知 Agent 上下文投影：${String(projection.kind)}`)
  if (!nonEmpty(projection.schemaVersion)) throw new Error(`${projection.kind} 缺少 schemaVersion`)
  if (!nonEmpty(projection.sourceRef)) throw new Error(`${projection.kind} 缺少 sourceRef`)
  if (projection.sourceVersion === '' || projection.sourceVersion === undefined || projection.sourceVersion === null) {
    throw new Error(`${projection.kind} 缺少 sourceVersion`)
  }
  if (!nonEmpty(projection.generatedAt)) throw new Error(`${projection.kind} 缺少 generatedAt`)
  if (!nonEmpty(projection.scope.userId) || !nonEmpty(projection.scope.workspaceId)) {
    throw new Error(`${projection.kind} 缺少本地数据作用域`)
  }
  if (projection.perspective.kind === 'character' && !nonEmpty(projection.perspective.characterId)) {
    throw new Error(`${projection.kind} 的角色视角缺少 characterId`)
  }
  if (!Array.isArray(projection.warnings)) throw new Error(`${projection.kind} 的 warnings 必须是数组`)
}

export function createAgentContextProjection<T>(projection: AgentContextProjection<T>): AgentContextProjection<T> {
  assertAgentContextProjection(projection)
  return projection
}

export function unavailableAgentContextProjection(input: Omit<AgentContextUnavailableProjection, 'status'>): AgentContextUnavailableProjection {
  return { status: 'unavailable', ...input }
}
