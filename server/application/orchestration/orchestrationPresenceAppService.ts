import { createHash, randomUUID } from 'crypto'
import {
  ORCHESTRATION_ERROR_CODES,
  ORCHESTRATION_PRESENCE_STATES,
  ORCHESTRATION_PRESENCE_TRANSITIONS,
  type OrchestrationPresenceState,
  type OrchestrationPresenceTransition
} from '../../../shared/orchestrationWorkspace.js'
import {
  createOrchestrationPresenceRepository,
  orchestrationPresenceRepository
} from '../../repositories/orchestrationPresenceRepository.js'

type Repository = ReturnType<typeof createOrchestrationPresenceRepository>
type ServiceResult = { ok: true; data: any } | { ok: false; status: number; error: string; details?: any }

const ok = (data: any): ServiceResult => ({ ok: true, data })
const fail = (status: number, error: string, details?: any): ServiceResult => ({ ok: false, status, error, details })
const text = (value: unknown, max = 500) => String(value ?? '').trim().slice(0, max)
const nowIso = () => new Date().toISOString()
const eventId = () => `presence_event_${randomUUID()}`

function stablePresenceId(sessionId: string, worldId: string, participantId: string) {
  const digest = createHash('sha256').update(`${sessionId}\u0000${worldId}\u0000${participantId}`).digest('hex').slice(0, 24)
  return `presence_${digest}`
}

function isPresenceState(value: unknown): value is OrchestrationPresenceState {
  return ORCHESTRATION_PRESENCE_STATES.includes(String(value || '') as OrchestrationPresenceState)
}

function isTransition(value: unknown): value is OrchestrationPresenceTransition {
  return ORCHESTRATION_PRESENCE_TRANSITIONS.includes(String(value || '') as OrchestrationPresenceTransition)
}

function inferTransition(fromState: OrchestrationPresenceState, toState: OrchestrationPresenceState): OrchestrationPresenceTransition {
  if (fromState === toState) return 'stay'
  if (fromState === 'unknown' && toState === 'present') return 'unknown_to_present'
  if (fromState === 'unknown' && toState === 'offstage') return 'unknown_to_offstage'
  return toState === 'present' ? 'enter' : 'exit'
}

export function createOrchestrationPresenceAppService(repository: Repository = orchestrationPresenceRepository) {
  function resolveContext(sessionIdInput: unknown, worldIdInput: unknown, participantIdInput?: unknown) {
    const sessionId = text(sessionIdInput, 160)
    if (!sessionId) return { error: fail(400, '缺少 sessionId') }
    const session = repository.findSessionById(sessionId)
    if (!session) return { error: fail(404, '会话不存在') }
    const worldId = text(session.worldId, 160)
    const requestedWorldId = text(worldIdInput, 160)
    if (requestedWorldId && requestedWorldId !== worldId) {
      return {
        error: fail(409, '目标世界与会话当前挂载世界不一致', {
          code: ORCHESTRATION_ERROR_CODES.scopeMismatch,
          currentWorldId: worldId,
          requestedWorldId
        })
      }
    }
    const participantId = text(participantIdInput, 160)
    const participant = participantId ? repository.findParticipantById(sessionId, participantId) : null
    if (participantId && !participant) {
      return { error: fail(404, '目标不是当前会话的正式角色参与者', { code: ORCHESTRATION_ERROR_CODES.invalidTargetRef }) }
    }
    return { sessionId, worldId, session, participantId, participant }
  }

  function currentVersion(sessionId: string, worldId: string, participantId: string) {
    const current = repository.findPresence(sessionId, worldId, participantId)
    return { current, version: Number(current?.version || 0) }
  }

  function assertExpectedVersion(expectedVersion: unknown, currentVersionValue: number) {
    const expected = Number(expectedVersion)
    if (!Number.isInteger(expected) || expected < 0) return fail(400, 'expectedVersion 必须是非负整数')
    if (expected !== currentVersionValue) {
      return fail(409, '角色在场状态版本已变化，请重读后再提交', {
        code: ORCHESTRATION_ERROR_CODES.versionConflict,
        expectedVersion: expected,
        currentVersion: currentVersionValue
      })
    }
    return null
  }

  function validateMapRefs(worldId: string, payload: Record<string, any>) {
    const hasMapSheetId = Object.prototype.hasOwnProperty.call(payload, 'mapSheetId')
    const hasMapFeatureId = Object.prototype.hasOwnProperty.call(payload, 'mapFeatureId')
    const mapSheetId = text(payload.mapSheetId, 160)
    const mapFeatureId = text(payload.mapFeatureId, 160)
    if (!worldId && (mapSheetId || mapFeatureId)) return fail(400, '无世界会话不能写入地图图纸或要素引用')
    let sheet: any = null
    if (mapSheetId) {
      sheet = repository.findMapSheetById(mapSheetId)
      if (!sheet || text(sheet.worldId, 160) !== worldId) return fail(400, '地图图纸不属于当前世界')
    }
    if (mapFeatureId) {
      const feature = repository.findMapFeatureById(mapFeatureId)
      if (!feature || text(feature.worldId, 160) !== worldId) return fail(400, '地图要素不属于当前世界')
      if (mapSheetId && text(feature.sheetId, 160) !== mapSheetId) return fail(400, '地图要素不属于目标图纸')
      if (!mapSheetId) sheet = repository.findMapSheetById(text(feature.sheetId, 160))
    }
    return { mapSheetId: mapSheetId || text(sheet?.id, 160), mapFeatureId, hasMapSheetId, hasMapFeatureId }
  }

  function buildEventRow(input: Record<string, any>, context: any, event: {
    eventType: 'proposed' | 'committed' | 'cancelled' | 'corrected'
    transition: OrchestrationPresenceTransition
    fromState: OrchestrationPresenceState
    toState: OrchestrationPresenceState
    provisional: boolean
  }) {
    return {
      id: eventId(),
      presenceId: stablePresenceId(context.sessionId, context.worldId, context.participantId),
      sessionId: context.sessionId,
      worldId: context.worldId,
      participantId: context.participantId,
      eventType: event.eventType,
      transition: event.transition,
      fromState: event.fromState,
      toState: event.toState,
      provisional: event.provisional,
      proposalEventId: text(input.proposalEventId, 160),
      sourceMessageId: text(input.sourceMessageId, 160),
      sourceDirectorRunId: text(input.sourceDirectorRunId, 160),
      sourceAgentRunId: text(input.sourceAgentRunId, 160),
      evidenceSummary: text(input.evidenceSummary, 1000),
      idempotencyKey: text(input.idempotencyKey, 240),
      createdAt: nowIso()
    }
  }

  function idempotentResult(
    input: Record<string, any>,
    context: any,
    expectedEventTypes: Array<'proposed' | 'committed' | 'cancelled' | 'corrected'>
  ) {
    const key = text(input.idempotencyKey, 240)
    if (!key) return { error: fail(400, '在场事件必须携带 idempotencyKey') }
    const existingEvent = repository.findEventByIdempotencyKey(key)
    if (!existingEvent) return { key }
    if (existingEvent.sessionId !== context.sessionId || existingEvent.worldId !== context.worldId || existingEvent.participantId !== context.participantId) {
      return { error: fail(409, '幂等键已被其它在场目标占用', { code: ORCHESTRATION_ERROR_CODES.idempotencyConflict }) }
    }
    if (!expectedEventTypes.includes(existingEvent.eventType)) {
      return { error: fail(409, '幂等键已被其它在场操作占用', { code: ORCHESTRATION_ERROR_CODES.idempotencyConflict }) }
    }
    return {
      result: ok({
        presence: repository.findPresence(context.sessionId, context.worldId, context.participantId),
        event: existingEvent,
        idempotent: true
      })
    }
  }

  function commitPresence(sessionIdInput: unknown, input: Record<string, any>, eventType: 'committed' | 'corrected' = 'committed'): ServiceResult {
    const context = resolveContext(sessionIdInput, input.worldId, input.participantId)
    if ('error' in context) return context.error
    const idempotency = idempotentResult(input, context, [eventType])
    if ('error' in idempotency) return idempotency.error
    if ('result' in idempotency) return idempotency.result
    const state = input.toState ?? input.presenceState
    if (!isPresenceState(state) || state === 'unknown') return fail(400, '正式在场事实必须是 present 或 offstage')
    const { current, version } = currentVersion(context.sessionId, context.worldId, context.participantId)
    const versionError = assertExpectedVersion(input.expectedVersion, version)
    if (versionError) return versionError
    const mapRefs = validateMapRefs(context.worldId, input)
    if ('ok' in mapRefs && mapRefs.ok === false) return mapRefs
    const fromState = (current?.presenceState || 'unknown') as OrchestrationPresenceState
    const transition = input.transition || inferTransition(fromState, state)
    if (!isTransition(transition)) return fail(400, `非法在场 transition：${String(transition || '空')}`)
    const proposalEventId = text(input.proposalEventId, 160)
    if (proposalEventId) {
      const proposal = repository.findEventById(proposalEventId)
      if (
        !proposal
        || proposal.eventType !== 'proposed'
        || proposal.sessionId !== context.sessionId
        || proposal.worldId !== context.worldId
        || proposal.participantId !== context.participantId
        || proposal.toState !== state
      ) {
        return fail(409, '预计登退场事件与本次事实提交不匹配')
      }
    }
    const timestamp = nowIso()
    const row = {
      id: current?.id || stablePresenceId(context.sessionId, context.worldId, context.participantId),
      sessionId: context.sessionId,
      worldId: context.worldId,
      participantId: context.participantId,
      presenceState: state,
      locationText: text(input.locationText ?? current?.locationText, 500),
      mapSheetId: mapRefs.hasMapSheetId || mapRefs.hasMapFeatureId ? mapRefs.mapSheetId : text(current?.mapSheetId, 160),
      mapFeatureId: mapRefs.hasMapFeatureId
        ? mapRefs.mapFeatureId
        : mapRefs.hasMapSheetId && !mapRefs.mapSheetId
          ? ''
          : text(current?.mapFeatureId, 160),
      sinceMessageId: text(input.sinceMessageId ?? input.sourceMessageId ?? current?.sinceMessageId, 160),
      version: current ? version + 1 : 1,
      lastModifiedSource: text(input.lastModifiedSource, 80) || (eventType === 'corrected' ? 'user_manual' : 'fact_reconciliation'),
      createdAt: current?.createdAt || timestamp,
      updatedAt: timestamp
    }
    const event = buildEventRow(input, context, {
      eventType,
      transition,
      fromState,
      toState: state,
      provisional: false
    })
    try {
      repository.transaction(() => {
        if (current) {
          if (!repository.updatePresenceOptimistic(row, version)) {
            throw Object.assign(new Error('VERSION_CONFLICT'), { code: ORCHESTRATION_ERROR_CODES.versionConflict })
          }
        } else {
          repository.insertPresence(row)
        }
        repository.insertEvent(event)
      })
    } catch (error) {
      if ((error as any)?.code === ORCHESTRATION_ERROR_CODES.versionConflict || (error as Error).message === 'VERSION_CONFLICT') {
        return fail(409, '角色在场状态版本已变化，请重读后再提交', { code: ORCHESTRATION_ERROR_CODES.versionConflict })
      }
      throw error
    }
    return ok({ presence: repository.findPresence(context.sessionId, context.worldId, context.participantId), event, idempotent: false })
  }

  return {
    list(sessionIdInput: unknown, worldIdInput?: unknown): ServiceResult {
      const context = resolveContext(sessionIdInput, worldIdInput)
      if ('error' in context) return context.error
      const persisted = new Map(repository.listPresences(context.sessionId, context.worldId).map((item: any) => [item.participantId, item]))
      const participants = repository.listCharacterParticipants(context.sessionId)
      return ok({
        sessionId: context.sessionId,
        worldId: context.worldId,
        items: participants.map((participant: any) => persisted.get(participant.id) || {
          id: '',
          sessionId: context.sessionId,
          worldId: context.worldId,
          participantId: participant.id,
          presenceState: 'unknown',
          locationText: '',
          mapSheetId: '',
          mapFeatureId: '',
          sinceMessageId: '',
          version: 0,
          lastModifiedSource: '',
          persisted: false
        })
      })
    },
    read(sessionIdInput: unknown, participantIdInput: unknown, worldIdInput?: unknown): ServiceResult {
      const context = resolveContext(sessionIdInput, worldIdInput, participantIdInput)
      if ('error' in context) return context.error
      const current = repository.findPresence(context.sessionId, context.worldId, context.participantId)
      return ok(current || {
        id: '', sessionId: context.sessionId, worldId: context.worldId, participantId: context.participantId,
        presenceState: 'unknown', version: 0, persisted: false
      })
    },
    set(sessionIdInput: unknown, input: Record<string, any>): ServiceResult {
      return commitPresence(sessionIdInput, input, 'corrected')
    },
    propose(sessionIdInput: unknown, input: Record<string, any>): ServiceResult {
      const context = resolveContext(sessionIdInput, input.worldId, input.participantId)
      if ('error' in context) return context.error
      const idempotency = idempotentResult(input, context, ['proposed'])
      if ('error' in idempotency) return idempotency.error
      if ('result' in idempotency) return idempotency.result
      const { current, version } = currentVersion(context.sessionId, context.worldId, context.participantId)
      const versionError = assertExpectedVersion(input.expectedVersion, version)
      if (versionError) return versionError
      const toState = input.toState
      if (!isPresenceState(toState) || toState === 'unknown') return fail(400, '预计登退场必须给出 present 或 offstage')
      const fromState = (current?.presenceState || 'unknown') as OrchestrationPresenceState
      const transition = input.transition || inferTransition(fromState, toState)
      if (!isTransition(transition)) return fail(400, `非法在场 transition：${String(transition || '空')}`)
      const event = buildEventRow(input, context, {
        eventType: 'proposed', transition, fromState, toState, provisional: true
      })
      repository.insertEvent(event)
      return ok({ presence: current, event, idempotent: false })
    },
    commit(sessionIdInput: unknown, input: Record<string, any>): ServiceResult {
      return commitPresence(sessionIdInput, input, 'committed')
    },
    cancel(sessionIdInput: unknown, input: Record<string, any>): ServiceResult {
      const context = resolveContext(sessionIdInput, input.worldId, input.participantId)
      if ('error' in context) return context.error
      const idempotency = idempotentResult(input, context, ['cancelled'])
      if ('error' in idempotency) return idempotency.error
      if ('result' in idempotency) return idempotency.result
      const proposalEventId = text(input.proposalEventId, 160)
      const proposal = proposalEventId ? repository.findEventById(proposalEventId) : null
      if (!proposal || proposal.eventType !== 'proposed' || proposal.sessionId !== context.sessionId || proposal.participantId !== context.participantId) {
        return fail(404, '待取消的预计登退场事件不存在或不属于当前目标')
      }
      const { current, version } = currentVersion(context.sessionId, context.worldId, context.participantId)
      const versionError = assertExpectedVersion(input.expectedVersion, version)
      if (versionError) return versionError
      const event = buildEventRow(input, context, {
        eventType: 'cancelled',
        transition: proposal.transition,
        fromState: proposal.fromState,
        toState: proposal.toState,
        provisional: true
      })
      repository.insertEvent(event)
      return ok({ presence: current, event, idempotent: false })
    },
    listEvents(sessionIdInput: unknown, query: Record<string, any> = {}): ServiceResult {
      const context = resolveContext(sessionIdInput, query.worldId, query.participantId)
      if ('error' in context) return context.error
      return ok(repository.listEvents(context.sessionId, context.worldId, context.participantId))
    }
  }
}

export const orchestrationPresenceAppService = createOrchestrationPresenceAppService()
