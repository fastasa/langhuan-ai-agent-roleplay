import {
  unavailableAgentContextProjection,
  type AgentContextBundle,
  type AgentContextPerspective,
  type AgentContextProjectionKind,
  type AgentContextProjectionResult,
  type AgentContextScope
} from '../../../shared/agentContextProjection.js'
import {
  AGENT_CONTEXT_KINDS,
  getAgentContextRecipe,
  resolveAgentContextPerspective,
  type AgentContextAgentKind,
  type AgentContextProjectionRequest
} from '../../../shared/agentContextRecipes.js'
import {
  projectCastPresence,
  projectCharacterInformation,
  projectChatVisibleContext,
  projectNarrativeSeeds,
  resolveKnownCharacterIds,
  projectSessionWorldContext,
  projectStatusPanelCatalog,
  projectStatusPanels,
  projectWorldKnowledgeScope,
  projectRimWorldPawnSnapshot
} from './agentContextProjectors.js'
import type { RimWorldPawnSnapshotV1 } from '../../../shared/rimworldBridge.js'

type AnyRecord = Record<string, any>
type ServiceResult = { ok: true; data: AgentContextBundle } | { ok: false; status: number; error: string; details?: unknown }

export type ResolveAgentContextInput = {
  agentKind: AgentContextAgentKind
  sessionId: string
  userId: string
  workspaceId: string
  characterId?: string
  anchorMessageId?: number
  userText?: string
  roundCandidateIds?: string[]
  forcedCharacterIds?: string[]
}

export type AgentContextProjectionSource = {
  session: AnyRecord
  participants: AnyRecord[]
  projections: AnyRecord[]
  chatProjectionVisibility:
    | { kind: 'all' }
    | { kind: 'character'; characterId: string }
  statusTemplates: AnyRecord[]
  statusPanels: AnyRecord[]
  presences: AnyRecord[]
  narrativeSeeds: AnyRecord[]
  narrativeSeedsSelected: boolean
  orchestrationWorkspace?: AnyRecord | null
  roundCandidateIds?: string[]
  sourceFailures?: Partial<Record<AgentContextProjectionKind, string>>
  warnings?: string[]
  rimworldPawnSnapshot?: RimWorldPawnSnapshotV1 | null
}

export type AgentContextProjectionLoaders = {
  loadSource: (input: ResolveAgentContextInput, perspective: AgentContextPerspective) => Promise<AgentContextProjectionSource> | AgentContextProjectionSource
  now?: () => string
}

function text(value: unknown): string {
  return String(value ?? '').trim()
}

function isAgentKind(value: unknown): value is AgentContextAgentKind {
  return AGENT_CONTEXT_KINDS.includes(value as AgentContextAgentKind)
}

function unavailable(
  kind: AgentContextProjectionKind,
  scope: AgentContextScope,
  perspective: AgentContextPerspective,
  reason: Parameters<typeof unavailableAgentContextProjection>[0]['reason'],
  message: string,
  warnings: string[] = []
): AgentContextProjectionResult {
  return unavailableAgentContextProjection({ kind, scope, perspective, reason, message, warnings })
}

function estimateProjectionSize(result: AgentContextProjectionResult): number {
  try { return JSON.stringify(result).length } catch { return 1000 }
}

export function createAgentContextProjectionService(loaders: AgentContextProjectionLoaders) {
  return {
    async resolve(rawInput: ResolveAgentContextInput): Promise<ServiceResult> {
      if (!isAgentKind(rawInput.agentKind)) return { ok: false, status: 400, error: `未知 Agent 上下文配方：${String(rawInput.agentKind || '')}` }
      const sessionId = text(rawInput.sessionId)
      const userId = text(rawInput.userId)
      const workspaceId = text(rawInput.workspaceId)
      if (!sessionId || !userId || !workspaceId) return { ok: false, status: 400, error: 'Agent 上下文缺少 sessionId、userId 或 workspaceId' }

      const recipe = getAgentContextRecipe(rawInput.agentKind)
      let perspective: AgentContextPerspective
      try {
        perspective = resolveAgentContextPerspective(recipe, rawInput.characterId)
      } catch (error) {
        return { ok: false, status: 400, error: (error as Error).message }
      }
      const generatedAt = loaders.now?.() || new Date().toISOString()
      let source: AgentContextProjectionSource
      try {
        source = await loaders.loadSource({ ...rawInput, sessionId, userId, workspaceId }, perspective)
      } catch (error) {
        return { ok: false, status: 500, error: `Agent 上下文来源读取失败：${(error as Error).message}` }
      }
      const chatVisibility = source.chatProjectionVisibility
      if (perspective.kind === 'character') {
        if (chatVisibility?.kind !== 'character' || text(chatVisibility.characterId) !== perspective.characterId) {
          return { ok: false, status: 500, error: '角色聊天投影来源没有按当前角色可见范围过滤' }
        }
      } else if (chatVisibility?.kind !== 'all') {
        return { ok: false, status: 500, error: '导演/用户聊天投影来源不是完整作用域' }
      }
      const worldId = text(source.session?.worldId ?? source.session?.world_id)
      const scope: AgentContextScope = { userId, workspaceId, sessionId, ...(worldId ? { worldId } : {}) }
      const ownParticipant = perspective.kind === 'character'
        ? source.participants.find((item) => text(item.participantTargetId ?? item.participant_target_id) === perspective.characterId)
        : null
      if (perspective.kind === 'character' && !ownParticipant) {
        return { ok: false, status: 403, error: '角色视角必须指向当前会话正式角色参与者' }
      }

      const presenceByParticipant = new Map(source.presences.map((item) => [text(item.participantId ?? item.participant_id), text(item.presenceState ?? item.presence_state)]))
      const visibleCharacterIds = new Set(source.participants.filter((item) => {
        const participantId = text(item.id)
        return presenceByParticipant.get(participantId) === 'present'
      }).map((item) => text(item.participantTargetId ?? item.participant_target_id)).filter(Boolean))
      const knownCharacterIds = resolveKnownCharacterIds({ participants: source.participants, perspective })
      const visibleCharacterRefs = new Map(source.participants.map((item) => [
        text(item.participantTargetId ?? item.participant_target_id),
        `participant:${text(item.id)}`
      ]).filter(([characterId]) => Boolean(characterId)))
      const participantCharacterIds = new Map(source.participants.map((item) => [
        text(item.id), text(item.participantTargetId ?? item.participant_target_id)
      ]).filter(([participantId, characterId]) => Boolean(participantId && characterId)))

      let worldProjection: ReturnType<typeof projectSessionWorldContext> | null = null
      const build = (request: AgentContextProjectionRequest): AgentContextProjectionResult => {
        const kind = request.kind
        const sourceFailure = text(source.sourceFailures?.[kind]
          ?? (kind === 'status.panel_catalog' ? source.sourceFailures?.['status.panels'] : ''))
        if (sourceFailure) return unavailable(kind, scope, perspective, 'source_failed', sourceFailure)
        if (kind === 'chat.visible_context') {
          return { status: 'available', projection: projectChatVisibleContext({
            sessionId, scope, perspective, rows: source.projections, anchorMessageId: rawInput.anchorMessageId,
            maxItems: request.maxItems || 24, generatedAt
          }) }
        }
        if (kind === 'session.world_context') {
          worldProjection ||= projectSessionWorldContext({ session: source.session, scope, perspective, generatedAt })
          return { status: 'available', projection: worldProjection }
        }
        if (kind === 'world.knowledge_scope') {
          worldProjection ||= projectSessionWorldContext({ session: source.session, scope, perspective, generatedAt })
          return { status: 'available', projection: projectWorldKnowledgeScope({ worldProjection, generatedAt }) }
        }
        if (kind === 'game.rimworld_pawn') {
          if (perspective.kind !== 'character') {
            return unavailable(kind, scope, perspective, 'not_authorized', '只有对应殖民者的角色视角可以读取 Pawn 当前切片。')
          }
          if (!source.rimworldPawnSnapshot) {
            return unavailable(kind, scope, perspective, 'empty_scope', '本轮没有环世界 Pawn 当前切片。')
          }
          return { status: 'available', projection: projectRimWorldPawnSnapshot({
            snapshot: source.rimworldPawnSnapshot, scope, perspective, generatedAt
          }) }
        }
        if (kind === 'session.cast_presence') {
          return { status: 'available', projection: projectCastPresence({
            sessionId, worldId, participants: source.participants, presences: source.presences,
            roundCandidateIds: source.roundCandidateIds ?? rawInput.roundCandidateIds, scope, perspective, generatedAt
          }) }
        }
        if (kind === 'status.panels') {
          return { status: 'available', projection: projectStatusPanels({
            sessionId, templates: source.statusTemplates, panels: source.statusPanels, visibleCharacterIds,
            knownCharacterIds, visibleCharacterRefs, participantCharacterIds,
            ownCharacterId: perspective.kind === 'character' ? perspective.characterId : '', scope, perspective, generatedAt
          }) }
        }
        if (kind === 'status.panel_catalog') {
          if (perspective.kind !== 'system_director') {
            return unavailable(kind, scope, perspective, 'not_authorized', '角色或用户视角不得读取导演用状态栏短目录。')
          }
          return { status: 'available', projection: projectStatusPanelCatalog({
            sessionId, templates: source.statusTemplates, panels: source.statusPanels,
            scope, perspective, generatedAt
          }) }
        }
        if (kind === 'world.narrative_seeds') {
          if (perspective.kind !== 'system_director') return unavailable(kind, scope, perspective, 'not_authorized', '角色或用户视角不得读取导演专用叙事种子摘要。')
          if (!worldId) return unavailable(kind, scope, perspective, 'not_mounted', '当前会话未挂世界，叙事种子范围为空。')
          return { status: 'available', projection: projectNarrativeSeeds({
            worldId, seeds: source.narrativeSeeds.slice(0, request.maxItems || 8), scope, perspective, generatedAt, selected: source.narrativeSeedsSelected
          }) }
        }
        if (kind === 'character.private_profile' || kind === 'character.observable_profile' || kind === 'character.knowledge') {
          return { status: 'available', projection: projectCharacterInformation({
            kind, sessionId, participants: source.participants, presences: source.presences, statusPanels: source.statusPanels,
            scope, perspective, generatedAt
          }) }
        }
        if (kind === 'orchestration.workspace') {
          if (!source.orchestrationWorkspace) {
            return unavailable(kind, scope, perspective, 'not_implemented', '统一编排工作台投影服务尚未接线；不得用会话成员或旧缓存替代。')
          }
          return {
            status: 'available',
            projection: {
              kind, schemaVersion: 'v1', sourceRef: `chat-session:${sessionId}:orchestration-workspace`,
              sourceVersion: text(source.orchestrationWorkspace?.scope?.viewRevision) || 'unversioned', generatedAt, scope,
              classification: 'session_truth', visibility: 'director_only', perspective, value: source.orchestrationWorkspace,
              truncated: false, warnings: []
            }
          }
        }
        return unavailable(kind, scope, perspective, 'not_implemented', `${kind} 尚未实现。`)
      }

      const projections: AgentContextProjectionResult[] = []
      const omitted: AgentContextBundle['omitted'] = []
      let itemCount = 0
      let charCount = 0
      const requiredKinds = new Set(recipe.required.map((item) => item.kind))
      for (const request of [...recipe.required, ...recipe.optional]) {
        const result = build(request)
        const size = estimateProjectionSize(result)
        const isRequired = requiredKinds.has(request.kind)
        if (!isRequired && (itemCount >= recipe.preloadBudget.maxItems || charCount + size > recipe.preloadBudget.maxChars)) {
          omitted.push({ kind: request.kind, reason: 'budget' })
          continue
        }
        projections.push(result)
        itemCount += 1
        charCount += size
        if (isRequired && result.status === 'unavailable' && recipe.failurePolicy === 'abort') {
          return {
            ok: false, status: result.reason === 'not_authorized' ? 403 : 409,
            error: `${recipe.agentKind} 缺少必需上下文 ${request.kind}：${result.message}`,
            details: { kind: request.kind, reason: result.reason }
          }
        }
      }

      return {
        ok: true,
        data: { agentKind: recipe.agentKind, recipeVersion: recipe.version, scope, perspective, generatedAt, projections, omitted }
      }
    }
  }
}
