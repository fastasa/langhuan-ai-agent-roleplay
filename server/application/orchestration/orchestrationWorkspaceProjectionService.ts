import { createHash } from 'node:crypto'
import {
  assertOrchestrationProjectionWorldScope,
  selectDirectorOrchestrationCandidates,
  type DirectorOrchestrationProjection,
  type OrchestrationCastRosterItem,
  type OrchestrationConflict,
  type OrchestrationPresenceRecord,
  type OrchestrationProjectionItem,
  type OrchestrationTimelineEntry,
  type OrchestrationWorkspaceProjection
} from '../../../shared/orchestrationWorkspace.js'
import {
  createOrchestrationWorkspaceProjectionRepository,
  orchestrationWorkspaceProjectionRepository
} from '../../repositories/orchestrationWorkspaceProjectionRepository.js'
import type { OrchestrationWorkspaceReadInput, OrchestrationWorkspaceReadResult } from './orchestrationWorkspaceTypes.js'
import { resolveFlowingVirtualTimeMs } from '../../../shared/virtualTimeFlow.js'

type Repository = ReturnType<typeof createOrchestrationWorkspaceProjectionRepository>
type Row = Record<string, any>
type ServiceResult = { ok: true; data: OrchestrationWorkspaceReadResult } | { ok: false; status: number; error: string }
type ReadOptions = { forcedCharacterIds?: string[]; maxPromptChars?: number }

const text = (value: unknown, max = 1000) => String(value ?? '').trim().slice(0, max)
const number = (value: unknown, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback
const parseObject = (value: unknown): Record<string, unknown> => {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>
  try {
    const parsed = JSON.parse(String(value || '{}'))
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch { return {} }
}
const parseArray = (value: unknown): unknown[] => {
  if (Array.isArray(value)) return value
  try {
    const parsed = JSON.parse(String(value || '[]'))
    return Array.isArray(parsed) ? parsed : []
  } catch { return [] }
}
const changedAt = (row: Row | null | undefined) => text(row?.updatedAt ?? row?.createdAt) || '1970-01-01T00:00:00.000Z'

function item<T>(value: T, sourceRef: string, row: Row | null | undefined, scope: 'world' | 'session' | 'round', visibility: 'user' | 'director_only' | 'participants' | 'public' = 'director_only'): OrchestrationProjectionItem<T> {
  return { value, sourceRef, version: Math.max(0, Math.trunc(number(row?.version, 1))), updatedAt: changedAt(row), scope, visibility }
}

function seedKnowledgeBoundary(row: Row): string {
  if (row.visibilityMode === 'public') return '前台公开'
  if (row.visibilityMode === 'participants') return '仅相关参与者知情'
  if (row.visibilityMode === 'custom') return '自定义知情范围；提调须读详情核对'
  return '仅提调可知'
}

function seedValue(row: Row, currentCurtainTimeMs: number | null) {
  const startAt = Date.parse(text(row.startTime, 120))
  const overdueByMs = Number.isFinite(startAt) && currentCurtainTimeMs !== null
    ? Math.max(0, currentCurtainTimeMs - startAt)
    : 0
  return {
    id: text(row.id, 160), type: text(row.type, 80), title: text(row.title, 160),
    description: text(row.description, 500), currentProgress: text(row.currentProgress, 400),
    expectedOutcome: text(row.expectedOutcome, 400), status: text(row.status, 80),
    startTime: text(row.startTime, 120), locationText: text(row.locationText, 160),
    impactScope: text(row.impactScope, 300), visibilityMode: text(row.visibilityMode, 80),
    allowFrontstage: Boolean(row.allowFrontstage), knowledgeBoundary: seedKnowledgeBoundary(row),
    currentCurtainTime: currentCurtainTimeMs === null ? '' : new Date(currentCurtainTimeMs).toISOString(),
    overdueByMs,
    relevanceScore: row.status === 'ready_to_trigger' ? 200 : overdueByMs > 0 ? 100 : 0,
    relevanceReasons: row.status === 'ready_to_trigger'
      ? ['帷幕时间已越过开始时间，种子待引爆']
      : overdueByMs > 0 ? ['已超过开始时间'] : []
  }
}

function statusValue(row: Row) {
  const values = parseObject(row.valuesJson)
  const bindingValues = parseObject(row.bindingValues)
  const fields = parseArray(row.fieldsJson)
  return {
    id: text(row.id, 160), name: text(row.name, 160), templateId: text(row.templateId, 160),
    hostType: text(row.hostType, 80), hostId: text(row.hostId, 160),
    description: text(row.description ?? row.templateDescription, 600),
    values,
    bindingValues,
    fields
  }
}

function statusCatalogValue(row: Row) {
  const fields = parseArray(row.fieldsJson).map((field) => {
    const item = field && typeof field === 'object' ? field as Row : {}
    return {
      key: text(item.key, 100), label: text(item.label, 120),
      valueType: text(item.valueType ?? item.value_type, 40) || 'text',
      description: text(item.description, 300)
    }
  })
  return {
    id: text(row.id, 160), name: text(row.name, 160), templateId: text(row.templateId, 160),
    kind: text(row.templateKind, 120), description: text(row.description ?? row.templateDescription, 600),
    hostType: text(row.hostType, 80), hostId: text(row.hostId, 160), fields
  }
}

function materialValue(row: Row | null) {
  if (!row) return null
  const copy: Record<string, unknown> = {}
  for (const key of ['id', 'content', 'text', 'acceptance', 'scope', 'status', 'scenarioCode', 'scenarioLabel', 'scenarioSummary', 'anchorMessageId', 'sourceArtifactId', 'source']) {
    if (row[key] !== undefined) copy[key] = typeof row[key] === 'string' ? text(row[key], 800) : row[key]
  }
  return copy
}

function isReadyDirectorSeed(entry: OrchestrationProjectionItem<Record<string, unknown>>) {
  return text(entry.value?.status, 80) === 'ready_to_trigger'
}

/**
 * 提调常驻只需要种子目录；完整因果必须再按 id 读取。
 * 这里压短目录项，给“所有待引爆种子必须同轮结算”留出稳定预算。
 */
function compactDirectorSeed(entry: OrchestrationProjectionItem<Record<string, unknown>>) {
  const value = entry.value || {}
  return {
    ...entry,
    value: {
      id: text(value.id, 160),
      title: text(value.title, 160),
      status: text(value.status, 80),
      startTime: text(value.startTime, 120),
      locationText: text(value.locationText, 160),
      impactScope: text(value.impactScope, 200),
      knowledgeBoundary: text(value.knowledgeBoundary, 120),
      currentCurtainTime: text(value.currentCurtainTime, 120),
      overdueByMs: number(value.overdueByMs),
      currentProgress: text(value.currentProgress, 180),
      relevanceScore: number(value.relevanceScore),
      relevanceReasons: parseArray(value.relevanceReasons).map((reason) => text(reason, 120)).filter(Boolean)
    }
  }
}

function selectDirectorSeeds(seedItems: Array<OrchestrationProjectionItem<Record<string, unknown>>>) {
  const ready = seedItems.filter(isReadyDirectorSeed)
  const ordinary = seedItems.filter((entry) => !isReadyDirectorSeed(entry))
  // 普通相关种子仍维持最多 8 条的旧预算；待引爆种子不受这个数量上限裁切。
  return [...ready, ...ordinary.slice(0, Math.max(0, 8 - ready.length))]
}

function enforceDirectorBudget(projection: DirectorOrchestrationProjection, maxChars: number) {
  const cap = Math.max(4000, Math.min(24000, Math.trunc(maxChars || 16000)))
  const size = () => JSON.stringify(projection).length
  const removeLastOrdinarySeed = () => {
    const index = projection.relevantNarrativeSeeds.findLastIndex((entry) => !isReadyDirectorSeed(entry))
    if (index < 0) return false
    projection.relevantNarrativeSeeds.splice(index, 1)
    return true
  }

  while (size() > cap && (projection.statusCatalog.length > 1 || projection.relevantNarrativeSeeds.some((entry) => !isReadyDirectorSeed(entry)))) {
    if (projection.statusCatalog.length > 1) projection.statusCatalog.pop()
    else removeLastOrdinarySeed()
  }
  if (size() > cap && projection.statusCatalog.length) projection.statusCatalog = []
  while (size() > cap && removeLastOrdinarySeed()) { /* 待引爆目录绝不因预算被裁掉。 */ }
  if (size() > cap && projection.relevantNarrativeSeeds.some(isReadyDirectorSeed)) {
    projection.relevantNarrativeSeeds = projection.relevantNarrativeSeeds.map((entry) => (
      isReadyDirectorSeed(entry) ? compactDirectorSeed(entry) : entry
    ))
  }
  return projection
}

export function createOrchestrationWorkspaceProjectionService(repository: Repository = orchestrationWorkspaceProjectionRepository) {
  return {
    read(raw: OrchestrationWorkspaceReadInput, options: ReadOptions = {}): ServiceResult {
      const sessionId = text(raw.sessionId, 160)
      const userId = text(raw.userId, 160)
      const workspaceId = text(raw.workspaceId, 160)
      if (!sessionId || !userId || !workspaceId) return { ok: false, status: 400, error: '统一编排投影缺少 userId、workspaceId 或 sessionId' }
      const session = repository.findSessionById(sessionId)
      if (!session) return { ok: false, status: 404, error: '会话不存在' }
      if ((text(session.userId) && text(session.userId) !== userId) || (text(session.workspaceId) && text(session.workspaceId) !== workspaceId)) {
        return { ok: false, status: 403, error: '无权读取该会话的统一编排投影' }
      }

      const worldId = text(session.worldId, 160)
      const currentCurtainTimeMs = resolveFlowingVirtualTimeMs(session)
      const participants = repository.listCharacterParticipants(sessionId)
      const characterById = new Map(participants.map((participant) => {
        const characterId = text(participant.participantTargetId, 160)
        return [characterId, characterId ? repository.findCharacterById(characterId) : null]
      }))
      const persistedPresences = worldId ? repository.listPresences(sessionId, worldId) : []
      const pendingPresenceTransitions = worldId ? repository.listPendingPresenceTransitions(sessionId, worldId) : []
      const recentPresenceFacts = worldId ? repository.listRecentPresenceFacts(sessionId, worldId) : []
      const recentMessages = repository.listRecentMessages(sessionId)
      const recentSeedFacts = worldId ? repository.listRecentNarrativeSeedFacts(worldId) : []
      const pendingTransitionByParticipant = new Map<string, Row>()
      for (const transition of pendingPresenceTransitions) {
        const participantId = text(transition.participantId, 160)
        if (participantId && !pendingTransitionByParticipant.has(participantId)) {
          pendingTransitionByParticipant.set(participantId, transition)
        }
      }
      const persistedByParticipant = new Map(persistedPresences.map((row) => [text(row.participantId, 160), row]))
      const presences: OrchestrationPresenceRecord[] = participants.map((participant) => {
        const row = persistedByParticipant.get(text(participant.id, 160))
        return {
          participantId: text(participant.id, 160), worldId,
          state: row?.presenceState === 'present' || row?.presenceState === 'offstage' ? row.presenceState : 'unknown',
          version: Math.max(0, Math.trunc(number(row?.version))), locationText: text(row?.locationText, 160),
          mapSheetId: text(row?.mapSheetId, 160), mapFeatureId: text(row?.mapFeatureId, 160), sinceMessageId: text(row?.sinceMessageId, 160)
        }
      })
      const presenceByParticipantId = Object.fromEntries(presences.map((presence) => [presence.participantId, presence.state]))
      const forcedCharacterIds = new Set((options.forcedCharacterIds || []).map((id) => text(id, 160)).filter(Boolean))
      const forcedParticipantIds = participants.filter((p) => forcedCharacterIds.has(text(p.participantTargetId, 160))).map((p) => text(p.id, 160))
      const selected = selectDirectorOrchestrationCandidates({
        participantIds: participants.map((p) => text(p.id, 160)), presenceByParticipantId, forcedParticipantIds
      })
      const candidateMeta = new Map(participants.map((p) => [text(p.id, 160), p]))
      const candidates = selected.map((candidate) => {
        const participant = candidateMeta.get(candidate.participantId) || {}
        const characterId = text(participant.participantTargetId, 160)
        const character = characterById.get(characterId) || null
        return { ...candidate, characterId, displayName: text(character?.name ?? participant.displayName ?? characterId, 160) }
      })

      const config = worldId ? repository.findNarrativeConfig(worldId) : null
      const seeds = worldId ? repository.listNarrativeSeeds(worldId) : []
      const entities = worldId ? repository.listWorldEntities(worldId) : []
      const panels = repository.listStatusPanels(sessionId, worldId)
      const override = repository.findNarrativeOverride(sessionId, worldId)
      const state = repository.findOrchestrationState(sessionId, worldId)
      const recent = repository.findRecentRoundArtifact(sessionId, text(raw.anchorMessageId, 160))

      const seedItems = seeds.map((row) => item(seedValue(row, currentCurtainTimeMs), `world:${worldId}:narrative-seed:${text(row.id, 160)}`, row, 'world'))
      const entityItems = entities.map((row) => item({
        id: text(row.id, 160), kind: text(row.kind, 80), name: text(row.name, 160),
        markdown: text(row.markdown, 800), mapSheetId: text(row.mapSheetId, 160), mapFeatureId: text(row.mapFeatureId, 160)
      }, `world:${worldId}:entity:${text(row.id, 160)}`, row, 'world'))
      const statusItems = panels.map((row) => item(statusValue(row), `chat-session:${sessionId}:status-panel:${text(row.id, 160)}`, row, worldId ? 'world' : 'session', 'participants'))
      const directorStatusItems = panels.map((row) => item(statusCatalogValue(row), `chat-session:${sessionId}:status-panel:${text(row.id, 160)}`, row, worldId ? 'world' : 'session', 'participants'))
      const overrideItem = override ? item(materialValue(override)!, `chat-session:${sessionId}:narrative-override`, override, 'session') : null
      const stateItem = state ? item(materialValue(state)!, `chat-session:${sessionId}:orchestration-state`, state, 'session') : null
      const recentItem = recent ? item({
        id: text(recent.id, 160), attemptId: text(recent.attemptId, 160), artifactKind: text(recent.artifactKind, 80),
        messageId: number(recent.messageId), payload: parseObject(recent.payloadJson)
      }, `chat-session:${sessionId}:generation-artifact:${text(recent.id, 160)}`, recent, 'round') : null

      const participantNameById = new Map(participants.map((participant) => {
        const characterId = text(participant.participantTargetId, 160)
        return [text(participant.id, 160), text(characterById.get(characterId)?.name ?? participant.displayName ?? characterId, 160)]
      }))
      const timeline: Array<OrchestrationProjectionItem<OrchestrationTimelineEntry>> = [
        ...recentMessages.map((row) => item({
          kind: 'message' as const,
          title: text(row.memberName ?? row.name, 120) || (text(row.role) === 'user' ? '用户' : text(row.messageKind, 80) || '角色输出'),
          summary: text(row.content, 360), targetId: text(row.role, 80), messageId: text(row.id, 160)
        }, `chat-session:${sessionId}:message:${text(row.id, 160)}`, row, 'round', 'participants')),
        ...recentPresenceFacts.map((row) => item({
          kind: 'presence_fact' as const,
          title: participantNameById.get(text(row.participantId, 160)) || '会话角色',
          summary: `${text(row.fromState, 40) || 'unknown'} → ${text(row.toState, 40)} · ${text(row.evidenceSummary, 240)}`,
          targetId: text(row.participantId, 160), messageId: text(row.sourceMessageId, 160)
        }, `chat-session:${sessionId}:presence-event:${text(row.id, 160)}`, row, 'round', 'participants')),
        ...recentSeedFacts.map((row) => item({
          kind: 'seed_fact' as const,
          title: text(row.seedTitle, 160) || '叙事种子',
          summary: text(row.evidenceSummary, 320) || text(row.diffJson, 320), targetId: text(row.seedId, 160), messageId: text(row.sourceMessageId, 160)
        }, `world:${worldId}:narrative-seed-event:${text(row.id, 160)}`, row, 'round')),
        ...statusItems.map((panel) => item({
          kind: 'status_update' as const,
          title: text(panel.value.name, 160) || '状态栏',
          summary: `当前版本 v${panel.version}`, targetId: text(panel.value.id, 160)
        }, `${panel.sourceRef}:latest-update`, { id: panel.sourceRef, version: panel.version, updatedAt: panel.updatedAt }, panel.scope === 'world' ? 'world' : 'session', 'participants'))
      ].sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))).slice(0, 30)

      const conflicts: OrchestrationConflict[] = []
      const statusRefsByParticipant = new Map<string, string[]>()
      for (const panel of panels) {
        if (text(panel.hostType) !== 'session_character') continue
        const hostId = text(panel.hostId, 160)
        statusRefsByParticipant.set(hostId, [...(statusRefsByParticipant.get(hostId) || []), text(panel.id, 160)])
      }
      const castRoster: OrchestrationCastRosterItem[] = participants.map((participant, index) => {
        const participantId = text(participant.id, 160)
        const characterId = text(participant.participantTargetId, 160)
        const character = characterById.get(characterId) || null
        const mode = participant.characterStateMode === 'independent_snapshot' ? 'independent_snapshot' : 'follow_main'
        const branchId = text(participant.characterBranchId, 160)
        const presence = presences[index]
        if (presence.state === 'unknown') conflicts.push({ code: 'unknown_presence', targetRef: { kind: 'session_character', participantId }, message: '角色尚未建立正式在场事实，兼容期按 unknown 参与。' })
        if (mode === 'independent_snapshot' && !branchId) conflicts.push({ code: 'missing_branch', targetRef: { kind: 'session_character', participantId }, message: '独立快照角色缺少正式分支，禁止回退主角色真值。' })
        const pendingTransition = pendingTransitionByParticipant.get(participantId)
        return {
          participantId, characterId, displayName: text(character?.name ?? participant.displayName ?? characterId, 160),
          characterStateMode: mode, characterBranchId: branchId, presence,
          pendingTransition: pendingTransition ? item({
            eventId: text(pendingTransition.id, 160),
            transition: pendingTransition.transition,
            toState: pendingTransition.toState
          }, `chat-session:${sessionId}:presence-event:${text(pendingTransition.id, 160)}`, pendingTransition, 'round') : null,
          statusPanelRefs: statusRefsByParticipant.get(participantId) || []
        }
      })

      const curtainValue = {
        sceneName: text(session.virtualSceneName, 200), sceneDescription: text(session.virtualSceneDesc, 600),
        locationLarge: text(session.virtualLocationLarge, 160), locationMiddle: text(session.virtualLocationMiddle, 160),
        locationSmall: text(session.virtualLocationSmall, 160), realLocation: text(session.virtualRealLocation, 160),
        time: text(session.virtualTime, 160), timeAnchor: number(session.virtualTimeAnchor, 0),
        timeBase: number(session.virtualTimeBase, 0), timeRate: number(session.virtualTimeRate, 1),
        weather: text(session.virtualWeather, 160), weatherMode: text(session.virtualWeatherMode, 40) === 'custom' ? 'custom' : 'real',
        worldId: text(session.virtualSceneWorldId, 160), mapSheetId: text(session.virtualLocationSheetId, 160),
        mapFeatureId: text(session.virtualLocationFeatureId, 160)
      }
      const revisionSources = [session, ...participants, ...characterById.values(), config, ...seeds, ...entities, ...panels, ...persistedPresences, ...pendingPresenceTransitions, ...recentPresenceFacts, ...recentMessages, ...recentSeedFacts, override, state, recent]
        .filter(Boolean).map((row: any) => [text(row.id ?? row.worldId), number(row.version, 1), changedAt(row)])
      const viewRevision = createHash('sha256').update(JSON.stringify(revisionSources)).digest('hex').slice(0, 24)
      const scope = { userId, workspaceId, sessionId, sessionTitle: text(session.title, 200), worldId, viewRevision }
      const workspace: OrchestrationWorkspaceProjection = {
        scope,
        world: {
          narrativeConfig: config ? item({ content: text(config.content, 1600) }, `world:${worldId}:narrative-config`, config, 'world') : null,
          narrativeSeeds: seedItems, worldEntities: entityItems
        },
        scene: {
          curtain: item(curtainValue, `chat-session:${sessionId}:curtain`, { ...session, version: number(session.curtainVersion, 0) }, 'session', 'participants'),
          mapRefs: [
            curtainValue.mapSheetId ? item({ id: curtainValue.mapSheetId, kind: 'map_sheet' }, `world:${worldId}:map-sheet:${curtainValue.mapSheetId}`, session, 'session', 'participants') : null,
            curtainValue.mapFeatureId ? item({ id: curtainValue.mapFeatureId, kind: 'map_feature' }, `world:${worldId}:map-feature:${curtainValue.mapFeatureId}`, session, 'session', 'participants') : null
          ].filter(Boolean) as Array<OrchestrationProjectionItem<Record<string, unknown>>>
        },
        castRoster,
        statusPanels: statusItems,
        orchestration: { sessionOverride: overrideItem, lastCommittedScenario: stateItem },
        recentRound: recentItem,
        timeline,
        conflicts
      }
      assertOrchestrationProjectionWorldScope(workspace)
      const director = enforceDirectorBudget({
        scope, curtain: workspace.scene.curtain, candidates, presences,
        relevantNarrativeSeeds: selectDirectorSeeds(seedItems), statusCatalog: directorStatusItems.slice(0, 12),
        sessionOverride: overrideItem, lastCommittedScenario: stateItem
      }, options.maxPromptChars || 16000)
      return { ok: true, data: { workspace, director } }
    }
  }
}

export const orchestrationWorkspaceProjectionService = createOrchestrationWorkspaceProjectionService()
