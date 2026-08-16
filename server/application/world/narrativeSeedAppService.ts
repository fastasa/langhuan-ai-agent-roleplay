import { randomUUID } from 'crypto'
import { narrativeSeedRepository, createNarrativeSeedRepository } from '../../repositories/narrativeSeedRepository.js'
import {
  NARRATIVE_SEED_EVENT_TYPES,
  NARRATIVE_SEED_LINK_TYPES,
  NARRATIVE_SEED_PARTICIPANT_TYPES,
  NARRATIVE_SEED_STATUSES,
  NARRATIVE_SEED_TYPES,
  NARRATIVE_SEED_VISIBILITY_MODES,
  type NarrativeSeedEventType,
  type NarrativeSeedImpactInput,
  type NarrativeSeedWriteInput
} from './narrativeSeedProtocol.js'
import {
  NARRATIVE_SEED_REMOVED_AUTHOR_FIELDS,
  validateCompleteNarrativeSeedAuthoring
} from '../../../shared/narrativeSeedAuthoring.js'
import { resolveFlowingVirtualTimeMs } from '../../../shared/virtualTimeFlow.js'

type Repository = ReturnType<typeof createNarrativeSeedRepository>
type ServiceResult = { ok: true; data: any } | { ok: false; status: number; error: string; details?: any }

const ok = (data: any): ServiceResult => ({ ok: true, data })
const fail = (status: number, error: string, details?: any): ServiceResult => ({ ok: false, status, error, details })
const text = (value: unknown, max: number) => String(value ?? '').trim().slice(0, max)
const hasOwn = (value: unknown, key: string) => Boolean(value && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, key))
const uniqueId = (prefix: string) => `${prefix}_${randomUUID()}`
const RELEVANT_SEED_LIMIT = 8
const OVERDUE_EVOLUTION_LIMIT = 3
const INACTIVE_RELEVANCE_STATUSES = new Set(['resolved', 'transformed'])
const DEPENDENCY_SATISFIED_STATUSES = new Set(['triggered', 'resolved', 'transformed'])
const TIME_GATE_ARMED_STATUSES = new Set(['dormant', 'active', 'pending_effect'])

function normalizedSearchText(value: unknown): string {
  return String(value ?? '').toLocaleLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '')
}

function textOverlaps(left: unknown, right: unknown): boolean {
  const a = normalizedSearchText(left)
  const b = normalizedSearchText(right)
  return a.length >= 2 && b.length >= 2 && (a.includes(b) || b.includes(a))
}

function parseTimestamp(value: unknown): number | null {
  const raw = String(value ?? '').trim()
  if (!raw) return null
  const timestamp = Date.parse(raw)
  return Number.isFinite(timestamp) ? timestamp : null
}

function readVisibility(seed: any): Record<string, unknown> {
  const raw = seed?.visibilityJson
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw)
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
    } catch {
      return {}
    }
  }
  return {}
}

function renderKnowledgeBoundary(seed: any, participantIds: Set<string>, seedParticipants: any[]): string {
  if (seed.visibilityMode === 'public') return '前台公开'
  if (seed.visibilityMode === 'director_only') return '仅提调可知'
  const currentSeedParticipants = seedParticipants.filter((participant) => participantIds.has(String(participant.participantId || '')))
  if (seed.visibilityMode === 'participants') {
    return currentSeedParticipants.length ? `当前 ${currentSeedParticipants.length} 位参与者知情` : '当前参与者均不知情'
  }
  const visibility = readVisibility(seed)
  const knownIds = Array.isArray(visibility.knownByParticipantIds)
    ? visibility.knownByParticipantIds.map((id) => String(id || '').trim()).filter(Boolean)
    : []
  const hiddenIds = Array.isArray(visibility.hiddenFromParticipantIds)
    ? visibility.hiddenFromParticipantIds.map((id) => String(id || '').trim()).filter(Boolean)
    : []
  const visibleCurrentCount = currentSeedParticipants.filter((participant) => (
    !hiddenIds.includes(String(participant.id || ''))
    && !hiddenIds.includes(String(participant.participantId || ''))
    && (knownIds.includes(String(participant.id || '')) || knownIds.includes(String(participant.participantId || '')))
  )).length
  return visibleCurrentCount ? `自定义可见；当前 ${visibleCurrentCount} 位参与者知情` : '自定义可见；仅提调掌握'
}

function isEnumValue<T extends readonly string[]>(values: T, value: unknown): value is T[number] {
  return values.includes(String(value || '') as T[number])
}

function normalizeVisibility(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const record = value as Record<string, unknown>
  const normalizeIds = (raw: unknown) => Array.isArray(raw)
    ? [...new Set(raw.map((item) => text(item, 120)).filter(Boolean))].slice(0, 100)
    : []
  return {
    knownByParticipantIds: normalizeIds(record.knownByParticipantIds),
    hiddenFromParticipantIds: normalizeIds(record.hiddenFromParticipantIds)
  }
}

function publicSeed(seed: any, participants: any[] = [], links: any[] = [], events: any[] = []) {
  return {
    ...seed,
    allowFrontstage: Boolean(seed?.allowFrontstage),
    visibility: seed?.visibilityJson && typeof seed.visibilityJson === 'object' ? seed.visibilityJson : {},
    visibilityJson: undefined,
    participants,
    links,
    events
  }
}

function buildSeedRow(worldId: string, input: NarrativeSeedWriteInput, current?: any, boundMapSheetId?: string) {
  const value = <T>(key: keyof NarrativeSeedWriteInput, fallback: T): T => (
    hasOwn(input, String(key)) ? input[key] as T : fallback
  )
  return {
    id: current?.id || text(input.id, 160) || uniqueId('nseed'),
    worldId,
    type: value('type', current?.type || 'foreshadow'),
    title: text(value('title', current?.title || ''), 120),
    description: text(value('description', current?.description || ''), 4000),
    cause: text(value('cause', current?.cause || ''), 2000),
    currentProgress: text(value('currentProgress', current?.currentProgress || ''), 2000),
    expectedOutcome: text(value('expectedOutcome', current?.expectedOutcome || ''), 2000),
    startTime: text(value('startTime', current?.startTime || ''), 120),
    lastAdvancedAt: text(value('lastAdvancedAt', current?.lastAdvancedAt || ''), 120),
    mapSheetId: text(boundMapSheetId ?? current?.mapSheetId ?? '', 160),
    mapFeatureId: text(value('mapFeatureId', current?.mapFeatureId || ''), 160),
    locationText: text(value('locationText', current?.locationText || ''), 500),
    impactScope: text(value('impactScope', current?.impactScope || ''), 500),
    status: value('status', current?.status || 'dormant'),
    visibilityMode: value('visibilityMode', current?.visibilityMode || 'director_only'),
    visibility: hasOwn(input, 'visibility') ? normalizeVisibility(input.visibility) : normalizeVisibility(current?.visibilityJson),
    allowFrontstage: hasOwn(input, 'allowFrontstage') ? input.allowFrontstage === true : Boolean(current?.allowFrontstage),
    version: Number(current?.version || 1),
    lastModifiedSource: text(value('lastModifiedSource', current?.lastModifiedSource || 'user'), 80) || 'user',
    createdAt: current?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
}

function diffSeed(before: any, after: any) {
  const diff: Record<string, { before: unknown; after: unknown }> = {}
  for (const key of Object.keys(after)) {
    if (['updatedAt', 'version'].includes(key)) continue
    if (JSON.stringify(before?.[key] ?? null) !== JSON.stringify(after[key] ?? null)) {
      diff[key] = { before: before?.[key] ?? null, after: after[key] ?? null }
    }
  }
  return diff
}

function normalizeParticipants(input: unknown, now: string) {
  if (!Array.isArray(input)) return { ok: true as const, rows: [] }
  if (input.length > 100) return { ok: false as const, error: '参与者最多 100 项' }
  const rows: any[] = []
  for (const raw of input) {
    const participantType = String(raw?.participantType || '')
    if (!isEnumValue(NARRATIVE_SEED_PARTICIPANT_TYPES, participantType)) {
      return { ok: false as const, error: `非法参与者类型：${participantType || '空'}` }
    }
    const participantId = text(raw?.participantId, 160)
    const displayName = text(raw?.displayName, 120)
    if (participantType === 'freeform' && !displayName) return { ok: false as const, error: 'freeform 参与者必须提供 displayName' }
    if (participantType !== 'freeform' && participantType !== 'user' && !participantId) {
      return { ok: false as const, error: `${participantType} 参与者必须提供 participantId` }
    }
    rows.push({
      id: text(raw?.id, 160) || uniqueId('npart'),
      participantType,
      participantId,
      displayName,
      relationRole: text(raw?.relationRole, 80) || 'involved',
      createdAt: now
    })
  }
  return { ok: true as const, rows }
}

export function createNarrativeSeedAppService(repository: Repository = narrativeSeedRepository) {
  function ensureWorld(worldId: string): ServiceResult | null {
    return repository.findWorldById(worldId) ? null : fail(404, '当前本地工作区中不存在该世界')
  }

  function rejectRemovedAuthorFields(input: unknown): ServiceResult | null {
    const record = input && typeof input === 'object' ? input as Record<string, unknown> : {}
    const present = NARRATIVE_SEED_REMOVED_AUTHOR_FIELDS.filter((field) => hasOwn(record, field))
    return present.length
      ? fail(400, `以下字段已退出叙事种子写协议：${present.join('、')}；mapSheetId 由目标会话与世界自动绑定，其余字段不再存储。`)
      : null
  }

  function resolveBoundMapSheetId(worldId: string, input: NarrativeSeedWriteInput, current?: any): ServiceResult | string {
    const world = repository.findWorldById(worldId) as any
    const sourceSessionId = text(input?.sourceSessionId, 160)
    if (sourceSessionId) {
      const session = repository.findSessionById(sourceSessionId) as any
      if (!session || String(session.worldId ?? session.world_id ?? '') !== worldId) {
        return fail(400, '叙事种子的来源会话不存在、未挂目标世界或不属于当前世界')
      }
      return text(
        session.virtualLocationSheetId
          ?? session.virtual_location_sheet_id
          ?? world?.defaultMapSheetId
          ?? world?.default_map_sheet_id,
        160
      )
    }
    return text(current?.mapSheetId ?? world?.defaultMapSheetId ?? world?.default_map_sheet_id, 160)
  }

  function validateCompleteSeed(row: any, participants: unknown, links: unknown): ServiceResult | null {
    const errors = validateCompleteNarrativeSeedAuthoring({ ...row, participants, links })
    return errors.length ? fail(400, `叙事种子必填字段不完整：${errors.join('；')}`) : null
  }

  function validateSeedRow(row: any): ServiceResult | null {
    if (!isEnumValue(NARRATIVE_SEED_TYPES, row.type)) return fail(400, `非法叙事种子类型：${row.type}`)
    if (!isEnumValue(NARRATIVE_SEED_STATUSES, row.status)) return fail(400, `非法叙事种子状态：${row.status}`)
    if (!isEnumValue(NARRATIVE_SEED_VISIBILITY_MODES, row.visibilityMode)) return fail(400, `非法可见性模式：${row.visibilityMode}`)
    if (!row.title) return fail(400, '叙事种子标题不能为空')
    const sheet = row.mapSheetId ? repository.findMapSheetById(row.mapSheetId) : null
    if (row.mapSheetId && (!sheet || String((sheet as any).worldId || '') !== row.worldId)) {
      return fail(400, '地图图纸不属于当前世界')
    }
    const feature = row.mapFeatureId ? repository.findMapFeatureById(row.mapFeatureId) : null
    if (row.mapFeatureId && (!feature || String((feature as any).worldId || '') !== row.worldId)) {
      return fail(400, '地图要素不属于当前世界')
    }
    if (feature && row.mapSheetId && String((feature as any).sheetId || '') !== row.mapSheetId) {
      return fail(400, '地图要素不属于指定图纸')
    }
    if (feature && !row.mapSheetId) row.mapSheetId = String((feature as any).sheetId || '')
    return null
  }

  function normalizeLinks(worldId: string, seedId: string, input: unknown, now: string) {
    if (!Array.isArray(input)) return { ok: true as const, rows: [] }
    if (input.length > 100) return { ok: false as const, error: '种子关系最多 100 项' }
    const rows: any[] = []
    const seen = new Set<string>()
    for (const raw of input) {
      const targetSeedId = text(raw?.targetSeedId, 160)
      const relationType = String(raw?.relationType || '')
      if (!targetSeedId || targetSeedId === seedId) return { ok: false as const, error: '种子关系必须指向另一个种子' }
      if (!isEnumValue(NARRATIVE_SEED_LINK_TYPES, relationType)) return { ok: false as const, error: `非法种子关系：${relationType || '空'}` }
      const target = repository.findSeedById(targetSeedId) as any
      if (!target || String(target.worldId || '') !== worldId) return { ok: false as const, error: '关系目标不存在或不属于当前世界' }
      const key = `${targetSeedId}\u0000${relationType}`
      if (seen.has(key)) continue
      seen.add(key)
      rows.push({ id: text(raw?.id, 160) || uniqueId('nlink'), targetSeedId, relationType, createdAt: now })
    }
    return { ok: true as const, rows }
  }

  function eventRow(seed: any, input: NarrativeSeedWriteInput, eventType: NarrativeSeedEventType, diff: any, fromStatus = '') {
    return {
      id: uniqueId('nevent'),
      seedId: seed.id,
      worldId: seed.worldId,
      eventType,
      fromStatus,
      toStatus: seed.status,
      diff,
      sourceSessionId: text(input.sourceSessionId, 160),
      sourceMessageId: Math.max(0, Math.trunc(Number(input.sourceMessageId || 0))),
      sourceDirectorRunId: text(input.sourceDirectorRunId, 160),
      sourceAgentRunId: text(input.sourceAgentRunId, 160),
      evidenceSummary: text(input.evidenceSummary, 1000),
      createdAt: seed.updatedAt
    }
  }

  function impactEventExists(seedId: string, idempotencyKey: string): boolean {
    if (!idempotencyKey) return false
    return repository.listEvents(seedId).some((event: any) => {
      let diff = event?.diffJson && typeof event.diffJson === 'object' ? event.diffJson : event?.diff
      if (!diff && typeof event?.diffJson === 'string') {
        try { diff = JSON.parse(event.diffJson) } catch { diff = null }
      }
      return String(diff?.idempotencyKey || '') === idempotencyKey
    })
  }

  function getSeed(worldId: string, seedId: string): ServiceResult {
    const worldError = ensureWorld(worldId)
    if (worldError) return worldError
    const seed = repository.findSeedById(seedId) as any
    if (!seed || String(seed.worldId || '') !== worldId) return fail(404, '叙事种子不存在')
    return ok(publicSeed(seed, repository.listParticipants(seedId), repository.listLinks(seedId), repository.listEvents(seedId)))
  }

  /**
   * 时间越界只把种子切到“待引爆”，不臆造具体剧情事实。
   * 具体发生了什么仍由下一轮提调安排，并在正式消息落库后由事实核账/编剧推进。
   */
  function syncTimeGatesForSession(sessionIdValue: string, nowMs = Date.now()): ServiceResult {
    const sessionId = text(sessionIdValue, 160)
    if (!sessionId) return fail(400, '叙事种子时间门同步缺少 sessionId')
    const session = repository.findSessionById(sessionId) as any
    if (!session) return fail(404, '当前本地工作区中不存在该会话')
    const worldId = text(session.worldId ?? session.world_id, 160)
    if (!worldId) return ok({ sessionId, worldId: '', currentTime: '', transitionedCount: 0, transitionedSeedIds: [] })

    const currentTimeMs = resolveFlowingVirtualTimeMs(session, nowMs)
    const currentTime = currentTimeMs === null ? '' : new Date(currentTimeMs).toISOString()
    if (currentTimeMs === null) {
      return ok({ sessionId, worldId, currentTime, transitionedCount: 0, transitionedSeedIds: [], requiresTemporalJudgment: true })
    }

    const candidates = (repository.listSeeds(worldId) as any[]).filter((seed: any) => {
      if (!TIME_GATE_ARMED_STATUSES.has(String(seed.status || ''))) return false
      const startAt = parseTimestamp(seed.startTime)
      if (startAt === null || startAt > currentTimeMs) return false
      const lastAdvancedAt = parseTimestamp(seed.lastAdvancedAt)
      return lastAdvancedAt === null || lastAdvancedAt < startAt
    })
    if (!candidates.length) return ok({ sessionId, worldId, currentTime, transitionedCount: 0, transitionedSeedIds: [] })

    const transitionedSeedIds: string[] = []
    repository.transaction(() => {
      for (const candidate of candidates) {
        const seedId = text(candidate.id, 160)
        const current = repository.findSeedById(seedId) as any
        if (!current || String(current.worldId || '') !== worldId || !TIME_GATE_ARMED_STATUSES.has(String(current.status || ''))) continue
        const startAt = parseTimestamp(current.startTime)
        const lastAdvancedAt = parseTimestamp(current.lastAdvancedAt)
        if (startAt === null || startAt > currentTimeMs || (lastAdvancedAt !== null && lastAdvancedAt >= startAt)) continue

        const input: NarrativeSeedWriteInput = {
          status: 'ready_to_trigger',
          lastModifiedSource: 'system:curtain-clock',
          sourceSessionId: sessionId,
          evidenceSummary: `帷幕时间 ${currentTime} 已达到开始时间 ${String(current.startTime || '')}；这里只确认时间门已越过，具体后果待下一轮提调与编剧核定。`
        }
        const row = buildSeedRow(worldId, input, current, current.mapSheetId)
        const changed = repository.updateSeedOptimistic(seedId, worldId, Number(current.version || 0), row)
        if (!changed) continue
        repository.appendEvent(eventRow(
          row,
          input,
          'time_gate_reached',
          {
            startTime: current.startTime,
            currentCurtainTime: currentTime,
            overdueByMs: Math.max(0, currentTimeMs - startAt),
            factCommitted: false
          },
          current.status
        ))
        transitionedSeedIds.push(seedId)
      }
    })

    return ok({ sessionId, worldId, currentTime, transitionedCount: transitionedSeedIds.length, transitionedSeedIds })
  }

  return {
    protocol() {
      return ok({
        types: NARRATIVE_SEED_TYPES,
        statuses: NARRATIVE_SEED_STATUSES,
        participantTypes: NARRATIVE_SEED_PARTICIPANT_TYPES,
        linkTypes: NARRATIVE_SEED_LINK_TYPES,
        visibilityModes: NARRATIVE_SEED_VISIBILITY_MODES,
        eventTypes: NARRATIVE_SEED_EVENT_TYPES,
        optimisticLock: 'PATCH 必须携带 expectedVersion；版本不符返回 409，调用方重读后再决定。'
      })
    },
    listSeeds(worldId: string): ServiceResult {
      const worldError = ensureWorld(worldId)
      if (worldError) return worldError
      return ok({ items: repository.listSeeds(worldId).map((seed: any) => publicSeed(seed)) })
    },
    syncTimeGatesForSession(sessionId: string, input: { nowMs?: number } = {}): ServiceResult {
      return syncTimeGatesForSession(sessionId, Number.isFinite(Number(input.nowMs)) ? Number(input.nowMs) : Date.now())
    },
    selectRelevantSeeds(worldId: string, input: Record<string, unknown>): ServiceResult {
      const worldError = ensureWorld(worldId)
      if (worldError) return worldError
      const sessionId = text(input?.sessionId, 160)
      if (!sessionId) return fail(400, '确定性取料必须提供 sessionId')
      const session = repository.findSessionById(sessionId) as any
      if (!session || String(session.worldId ?? session.world_id ?? '') !== worldId) {
        return fail(400, '会话不存在、未挂世界或不属于目标世界')
      }
      const synced = syncTimeGatesForSession(sessionId)
      if (!synced.ok) return synced

      const participantIds = new Set(
        repository.listSessionParticipants(sessionId)
          .map((row: any) => text(row?.participantTargetId ?? row?.participant_target_id, 160))
          .filter(Boolean)
      )
      const userText = text(input?.userText, 4000)
      const curtainText = [
        session.virtualLocationLarge,
        session.virtualLocationMiddle,
        session.virtualLocationSmall,
        session.virtualLocation,
        session.virtualTime
      ].filter(Boolean).join(' ')
      const currentFeatureId = text(session.virtualLocationFeatureId, 160)
      const currentTime = resolveFlowingVirtualTimeMs(session)
      const allSeeds = repository.listSeeds(worldId) as any[]
      const allLinks = repository.listWorldLinks(worldId) as any[]
      const linksBySource = new Map<string, any[]>()
      for (const link of allLinks) {
        const sourceId = String(link?.sourceSeedId || '')
        linksBySource.set(sourceId, [...(linksBySource.get(sourceId) || []), link])
      }

      const ranked = allSeeds.flatMap((seed: any) => {
        if (INACTIVE_RELEVANCE_STATUSES.has(String(seed.status || ''))) return []
        const links = linksBySource.get(String(seed.id || '')) || []
        const dependencies = links.filter((link) => link.relationType === 'depends_on')
        const dependenciesSatisfied = dependencies.every((link) => {
          const target = repository.findSeedById(String(link.targetSeedId || '')) as any
          return target && String(target.worldId || '') === worldId && DEPENDENCY_SATISFIED_STATUSES.has(String(target.status || ''))
        })
        if (!dependenciesSatisfied) return []

        const reasons: string[] = []
        let score = 0
        const startAt = parseTimestamp(seed.startTime)
        if (startAt !== null && currentTime !== null && startAt <= currentTime) {
          score += 100
          reasons.push('已超过开始时间')
        } else if (seed.startTime && textOverlaps(seed.startTime, `${session.virtualTime || ''} ${userText}`)) {
          score += 70
          reasons.push('开始时间文字命中')
        }

        if (currentFeatureId && String(seed.mapFeatureId || '') === currentFeatureId) {
          score += 100
          reasons.push('命中当前帷幕精确地点')
        }
        if (textOverlaps(seed.locationText, `${curtainText} ${userText}`) || textOverlaps(seed.impactScope, `${curtainText} ${userText}`)) {
          score += 45
          reasons.push('地点或影响范围相关')
        }

        const participants = repository.listParticipants(String(seed.id || '')) as any[]
        const matchedParticipant = participants.find((participant) => participantIds.has(String(participant.participantId || '')))
        const userParticipant = participants.find((participant) => participant.participantType === 'user')
        const namedParticipant = participants.find((participant) => textOverlaps(participant.displayName, userText))
        if (matchedParticipant || userParticipant) {
          score += 65
          reasons.push('涉及当前参与者')
        } else if (namedParticipant) {
          score += 45
          reasons.push('用户本轮提及相关人物')
        }
        if (seed.status === 'expired') {
          score += 60
          reasons.push('种子已超期待处理')
        }
        if (score <= 0) return []

        return [{
          seed,
          participants,
          score,
          reasons,
          knowledgeBoundary: renderKnowledgeBoundary(seed, participantIds, participants),
          startAt: startAt ?? Number.POSITIVE_INFINITY,
          overdueByMs: startAt !== null && currentTime !== null ? Math.max(0, currentTime - startAt) : 0
        }]
      }).sort((left, right) => (
        right.score - left.score
        || left.startAt - right.startAt
        || String(right.seed.updatedAt || '').localeCompare(String(left.seed.updatedAt || ''))
        || String(left.seed.id || '').localeCompare(String(right.seed.id || ''))
      )).slice(0, Math.min(Math.max(1, Math.trunc(Number(input?.limit || RELEVANT_SEED_LIMIT))), RELEVANT_SEED_LIMIT))

      return ok({
        worldId,
        sessionId,
        deterministic: true,
        scannedCount: allSeeds.length,
        currentTime: currentTime === null ? String(session.virtualTime || '') : new Date(currentTime).toISOString(),
        items: ranked.map(({ seed, score, reasons, knowledgeBoundary, overdueByMs }) => ({
          id: seed.id,
          type: seed.type,
          title: seed.title,
          currentProgress: seed.currentProgress,
          expectedOutcome: seed.expectedOutcome,
          startTime: seed.startTime,
          locationText: seed.locationText,
          impactScope: seed.impactScope,
          status: seed.status,
          allowFrontstage: Boolean(seed.allowFrontstage),
          knowledgeBoundary,
          currentCurtainTime: currentTime === null ? String(session.virtualTime || '') : new Date(currentTime).toISOString(),
          overdueByMs,
          relevanceScore: score,
          relevanceReasons: reasons
        }))
      })
    },
    selectOverdueSeeds(worldId: string, input: Record<string, unknown>): ServiceResult {
      const worldError = ensureWorld(worldId)
      if (worldError) return worldError
      const sessionId = text(input?.sessionId, 160)
      if (!sessionId) return fail(400, '后台演化必须提供 sessionId')
      const session = repository.findSessionById(sessionId) as any
      if (!session || String(session.worldId ?? session.world_id ?? '') !== worldId) {
        return fail(400, '会话不存在、未挂世界或不属于目标世界')
      }
      const synced = syncTimeGatesForSession(sessionId)
      if (!synced.ok) return synced
      const enabled = Boolean(session.dynamicWorldEnabled ?? session.dynamic_world_enabled)
      const requestedLimit = Math.max(1, Math.trunc(Number(input?.limit || 2)))
      const limit = Math.min(OVERDUE_EVOLUTION_LIMIT, requestedLimit)
      if (!enabled) return ok({ worldId, sessionId, enabled: false, limit, scannedCount: 0, items: [] })

      const currentTime = resolveFlowingVirtualTimeMs(session)
      const currentFeatureId = text(session.virtualLocationFeatureId, 160)
      const curtainText = [session.virtualLocationLarge, session.virtualLocationMiddle, session.virtualLocationSmall, session.virtualLocation]
        .filter(Boolean).join(' ')
      const inactive = new Set(['resolved', 'transformed', 'expired'])
      const candidates = (repository.listSeeds(worldId) as any[]).flatMap((seed: any) => {
        if (inactive.has(String(seed.status || ''))) return []
        const startTime = text(seed.startTime, 120)
        if (!startTime) return []
        const dueAt = parseTimestamp(startTime)
        if (dueAt !== null && (currentTime === null || dueAt > currentTime)) return []
        const lastAdvancedAt = parseTimestamp(seed.lastAdvancedAt)
        if (dueAt !== null && lastAdvancedAt !== null && lastAdvancedAt >= dueAt) return []
        const dueKey = dueAt === null ? `text:${startTime}` : new Date(dueAt).toISOString()
        if (impactEventExists(String(seed.id || ''), `background:${dueKey}:${String(seed.id || '')}`)) return []
        const exactFeature = Boolean(currentFeatureId && String(seed.mapFeatureId || '') === currentFeatureId)
        const locationMatch = Boolean(seed.locationText && curtainText && textOverlaps(seed.locationText, curtainText))
        const impactScopeMatch = Boolean(seed.impactScope && curtainText && textOverlaps(seed.impactScope, curtainText))
        return [{
          ...publicSeed(seed, repository.listParticipants(seed.id), repository.listLinks(seed.id), repository.listEvents(seed.id).slice(-12)),
          dueAt: dueKey,
          requiresTemporalJudgment: dueAt === null,
          affectsCurrentCurtain: Boolean(seed.allowFrontstage && (exactFeature || locationMatch || impactScopeMatch)),
          curtainMatchReasons: [exactFeature ? '精确地图要素' : '', locationMatch ? '地点文字命中' : '', impactScopeMatch ? '影响范围命中' : ''].filter(Boolean)
        }]
      }).sort((a: any, b: any) => {
        const aTime = parseTimestamp(a.dueAt) ?? Number.POSITIVE_INFINITY
        const bTime = parseTimestamp(b.dueAt) ?? Number.POSITIVE_INFINITY
        return aTime - bTime || String(a.dueAt).localeCompare(String(b.dueAt)) || String(a.id).localeCompare(String(b.id))
      })

      return ok({
        worldId,
        sessionId,
        enabled: true,
        limit,
        currentTime: currentTime === null ? String(session.virtualTime || '') : new Date(currentTime).toISOString(),
        scannedCount: candidates.length,
        items: candidates.slice(0, limit)
      })
    },
    getSeed,
    createSeed(worldId: string, input: NarrativeSeedWriteInput): ServiceResult {
      const worldError = ensureWorld(worldId)
      if (worldError) return worldError
      const removedError = rejectRemovedAuthorFields(input)
      if (removedError) return removedError
      const boundMapSheetId = resolveBoundMapSheetId(worldId, input || {})
      if (typeof boundMapSheetId !== 'string') return boundMapSheetId
      const row = buildSeedRow(worldId, input || {}, undefined, boundMapSheetId)
      const validationError = validateSeedRow(row)
      if (validationError) return validationError
      const participants = normalizeParticipants(input?.participants, row.createdAt)
      if (!participants.ok) return fail(400, participants.error)
      // 新种子尚未落库，关系可以指向既有种子；派生来源必须显式链接，由调用方给 links。
      const links = normalizeLinks(worldId, row.id, input?.links, row.createdAt)
      if (!links.ok) return fail(400, links.error)
      const completenessError = validateCompleteSeed(row, input?.participants, input?.links)
      if (completenessError) return completenessError
      repository.transaction(() => {
        repository.insertSeed(row)
        repository.replaceParticipants(row.id, worldId, participants.rows)
        repository.replaceLinks(row.id, worldId, links.rows)
        repository.appendEvent(eventRow(row, input, 'created', { seed: row }))
      })
      return getSeed(worldId, row.id)
    },
    updateSeed(worldId: string, seedId: string, input: NarrativeSeedWriteInput): ServiceResult {
      const worldError = ensureWorld(worldId)
      if (worldError) return worldError
      const current = repository.findSeedById(seedId) as any
      if (!current || String(current.worldId || '') !== worldId) return fail(404, '叙事种子不存在')
      const removedError = rejectRemovedAuthorFields(input)
      if (removedError) return removedError
      const expectedVersion = Number(input?.expectedVersion)
      if (!Number.isInteger(expectedVersion) || expectedVersion < 1) return fail(400, 'PATCH 必须提供正整数 expectedVersion')
      if (expectedVersion !== Number(current.version)) {
        return fail(409, '叙事种子版本冲突，请重读后再提交', { currentVersion: Number(current.version) })
      }
      const boundMapSheetId = resolveBoundMapSheetId(worldId, input || {}, current)
      if (typeof boundMapSheetId !== 'string') return boundMapSheetId
      const row = buildSeedRow(worldId, input || {}, current, boundMapSheetId)
      const validationError = validateSeedRow(row)
      if (validationError) return validationError
      const participants = hasOwn(input, 'participants') ? normalizeParticipants(input.participants, row.updatedAt) : null
      if (participants && !participants.ok) return fail(400, participants.error)
      const links = hasOwn(input, 'links') ? normalizeLinks(worldId, seedId, input.links, row.updatedAt) : null
      if (links && !links.ok) return fail(400, links.error)
      const completenessError = validateCompleteSeed(
        row,
        hasOwn(input, 'participants') ? input.participants : repository.listParticipants(seedId),
        hasOwn(input, 'links') ? input.links : repository.listLinks(seedId)
      )
      if (completenessError) return completenessError
      const diff = diffSeed(current, row)
      const eventType: NarrativeSeedEventType = current.status !== row.status ? 'status_changed' : 'updated'
      const changed = repository.transaction(() => {
        const count = repository.updateSeedOptimistic(seedId, worldId, expectedVersion, row)
        if (!count) return 0
        if (participants?.ok) repository.replaceParticipants(seedId, worldId, participants.rows)
        if (links?.ok) repository.replaceLinks(seedId, worldId, links.rows)
        repository.appendEvent(eventRow(row, input, eventType, diff, current.status))
        return count
      })
      if (!changed) {
        const latest = repository.findSeedById(seedId) as any
        return fail(409, '叙事种子版本冲突，请重读后再提交', { currentVersion: Number(latest?.version || 0) })
      }
      return getSeed(worldId, seedId)
    },
    deleteSeed(worldId: string, seedId: string, input: Record<string, unknown>): ServiceResult {
      const worldError = ensureWorld(worldId)
      if (worldError) return worldError
      const current = repository.findSeedById(seedId) as any
      if (!current || String(current.worldId || '') !== worldId) return fail(404, '叙事种子不存在')
      const expectedVersion = Number(input?.expectedVersion)
      if (!Number.isInteger(expectedVersion) || expectedVersion < 1) return fail(400, '删除必须提供正整数 expectedVersion')
      if (expectedVersion !== Number(current.version)) {
        return fail(409, '叙事种子版本冲突，请重读后再删除', { currentVersion: Number(current.version) })
      }
      const changed = repository.transaction(() => repository.deleteSeedOptimistic(seedId, worldId, expectedVersion))
      if (!changed) return fail(409, '叙事种子版本冲突，请重读后再删除')
      return ok({ id: seedId, deleted: true })
    },
    recordImpact(worldId: string, seedId: string, input: NarrativeSeedImpactInput): ServiceResult {
      const worldError = ensureWorld(worldId)
      if (worldError) return worldError
      const current = repository.findSeedById(seedId) as any
      if (!current || String(current.worldId || '') !== worldId) return fail(404, '叙事种子不存在')
      const removedError = rejectRemovedAuthorFields(input)
      if (removedError) return removedError
      const eventType = String(input?.eventType || '')
      if (eventType !== 'predicted_effect' && eventType !== 'fact_committed') {
        return fail(400, '影响事件只允许 predicted_effect 或 fact_committed')
      }
      const idempotencyKey = text(input?.idempotencyKey, 240)
      if (!idempotencyKey) return fail(400, '影响事件必须提供 idempotencyKey')
      if (impactEventExists(seedId, idempotencyKey)) return getSeed(worldId, seedId)
      const effectSummary = text(input?.effectSummary, 2000)
      if (!effectSummary) return fail(400, '影响事件必须提供 effectSummary')

      if (eventType === 'predicted_effect') {
        const now = new Date().toISOString()
        repository.appendEvent(eventRow(
          { ...current, updatedAt: now },
          input,
          'predicted_effect',
          { idempotencyKey, effectSummary, provisional: true },
          current.status
        ))
        return getSeed(worldId, seedId)
      }

      const expectedVersion = Number(input?.expectedVersion)
      if (!Number.isInteger(expectedVersion) || expectedVersion < 1) return fail(400, '事实提交必须提供正整数 expectedVersion')
      if (expectedVersion !== Number(current.version)) {
        return fail(409, '叙事种子版本冲突，请重读后再提交', { currentVersion: Number(current.version) })
      }
      const comparisonOutcome = String(input?.comparisonOutcome || '')
      if (!['occurred', 'partial', 'not_occurred', 'opposite'].includes(comparisonOutcome)) {
        return fail(400, '事实提交必须给出合法 comparisonOutcome')
      }
      const patchInput: NarrativeSeedWriteInput = {
        ...(hasOwn(input, 'currentProgress') ? { currentProgress: input.currentProgress } : {}),
        ...(hasOwn(input, 'status') ? { status: input.status } : {}),
        ...(hasOwn(input, 'lastAdvancedAt') ? { lastAdvancedAt: input.lastAdvancedAt } : {}),
        ...(hasOwn(input, 'startTime') ? { startTime: input.startTime } : {}),
        lastModifiedSource: 'narrative_fact_commit'
      }
      const row = buildSeedRow(worldId, patchInput, current)
      const validationError = validateSeedRow(row)
      if (validationError) return validationError
      const completenessError = validateCompleteSeed(row, repository.listParticipants(seedId), repository.listLinks(seedId))
      if (completenessError) return completenessError
      const diff = diffSeed(current, row)
      const changed = repository.transaction(() => {
        const count = repository.updateSeedOptimistic(seedId, worldId, expectedVersion, row)
        if (!count) return 0
        repository.appendEvent(eventRow(
          row,
          input,
          'fact_committed',
          { idempotencyKey, effectSummary, comparisonOutcome, seedChanges: diff },
          current.status
        ))
        return count
      })
      if (!changed) {
        const latest = repository.findSeedById(seedId) as any
        return fail(409, '叙事种子版本冲突，请重读后再提交', { currentVersion: Number(latest?.version || 0) })
      }
      return getSeed(worldId, seedId)
    },
    getConfig(worldId: string): ServiceResult {
      const worldError = ensureWorld(worldId)
      if (worldError) return worldError
      return ok(repository.getConfig(worldId) || {
        worldId,
        content: '',
        version: 0
      })
    },
    saveConfig(worldId: string, input: Record<string, unknown>): ServiceResult {
      const worldError = ensureWorld(worldId)
      if (worldError) return worldError
      const current = repository.getConfig(worldId) as any
      const expectedVersion = Number(input?.expectedVersion)
      const currentVersion = Number(current?.version || 0)
      if (!Number.isInteger(expectedVersion) || expectedVersion !== currentVersion) {
        return fail(409, '世界剧本配置版本冲突，请重读后再提交', { currentVersion })
      }
      const row = {
        worldId,
        content: text(hasOwn(input, 'content') ? input.content : current?.content, 6000),
        createdAt: current?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
      if (!current) repository.insertConfig(row)
      else if (!repository.updateConfigOptimistic(worldId, expectedVersion, row)) {
        const latest = repository.getConfig(worldId) as any
        return fail(409, '世界剧本配置版本冲突，请重读后再提交', { currentVersion: Number(latest?.version || 0) })
      }
      return ok(repository.getConfig(worldId))
    },
    previewLegacyMigration(worldId: string, input: Record<string, any>): ServiceResult {
      const worldError = ensureWorld(worldId)
      if (worldError) return worldError
      const scripts = Array.isArray(input?.legacyScripts) ? input.legacyScripts.slice(0, 500) : []
      const existingTitles = new Set(repository.listSeeds(worldId).map((seed: any) => text(seed?.title, 120).toLocaleLowerCase()).filter(Boolean))
      const proposedSeeds: any[] = []
      const configCandidates: any[] = []
      const routeMaterials: any[] = []
      const conflicts: any[] = []
      for (const entry of scripts) {
        const sessionId = text(entry?.sessionId, 160)
        const session = sessionId ? repository.findSessionById(sessionId) as any : null
        if (!session || String(session.worldId || session.world_id || '') !== worldId) {
          conflicts.push({ sessionId, code: 'SESSION_WORLD_MISMATCH', message: '会话不存在、无世界或不属于目标世界' })
          continue
        }
        const script = entry?.script && typeof entry.script === 'object' && !Array.isArray(entry.script) ? entry.script : {}
        if (text(script.theme, 500)) configCandidates.push({ sessionId, field: 'theme', value: text(script.theme, 500), requiresConfirmation: true })
        const routeFields = ['logline', 'longArc', 'chapter', 'stage', 'stageGoal', 'arc', 'threads', 'nextBeat']
        const material = Object.fromEntries(routeFields.filter((key) => script[key] !== undefined).map((key) => [key, script[key]]))
        if (Object.keys(material).length) routeMaterials.push({ sessionId, material, promotableAsFact: false })
        for (const item of Array.isArray(script.foreshadows) ? script.foreshadows : []) {
          if (String(item?.status || '') === '已回收') continue
          const description = text(item?.text, 4000)
          if (!description) continue
          const title = description.slice(0, 120)
          const normalizedTitle = title.toLocaleLowerCase()
          const duplicate = existingTitles.has(normalizedTitle)
          if (duplicate) conflicts.push({ sessionId, code: 'POSSIBLE_DUPLICATE', title, message: '与现役种子标题重复，需人工合并判断' })
          else existingTitles.add(normalizedTitle)
          proposedSeeds.push({
            source: { kind: 'legacy_script_foreshadow', sessionId, legacyId: text(item?.id, 80) },
            type: 'foreshadow',
            title,
            description,
            currentProgress: String(item?.status || '') === '已激活' ? '旧剧本标记为已激活' : '',
            expectedOutcome: text(item?.fireWhen, 2000),
            status: 'review_required',
            reviewReasons: ['缺少可核验的时间、地点与类型化参与者', ...(duplicate ? ['疑似重复'] : [])]
          })
        }
        for (const cast of Array.isArray(script.cast) ? script.cast : []) {
          const hidden = text(cast?.hidden, 4000)
          if (!hidden) continue
          proposedSeeds.push({
            source: { kind: 'legacy_script_cast_hidden', sessionId, characterName: text(cast?.name, 120) },
            type: 'foreshadow',
            title: hidden.slice(0, 120),
            description: hidden,
            status: 'review_required',
            visibilityMode: 'director_only',
            reviewReasons: ['需人工确认这是角色秘密而非静态角色设定', '缺少正式角色引用']
          })
        }
      }
      return ok({
        worldId,
        readOnly: true,
        writesPerformed: 0,
        legacyScripts: { inspected: scripts.length, configCandidates, routeMaterials, proposedSeeds },
        legacyEventCandidates: {
          sourceStatus: 'retired',
          availableCount: 0,
          message: '旧 chat_event_pool_batches 已按正式退役迁移删除；没有现役候选行可盘点，不从提示词日志或消息反推伪造。'
        },
        conflicts
      })
    },
    executeLegacyMigration(worldId: string, input: Record<string, any>): ServiceResult {
      if (input?.confirmed !== true) return fail(400, '迁移执行前必须人工确认')
      const preview = this.previewLegacyMigration(worldId, input)
      if (!preview.ok) return preview
      const proposed = Array.isArray(preview.data?.legacyScripts?.proposedSeeds)
        ? preview.data.legacyScripts.proposedSeeds
        : []
      const selectedIndexes = [...new Set((Array.isArray(input?.selectedSeedIndexes) ? input.selectedSeedIndexes : [])
        .map((value: unknown) => Math.trunc(Number(value)))
        .filter((value: number) => Number.isInteger(value) && value >= 0 && value < proposed.length))]
      if (!selectedIndexes.length) return fail(400, '至少选择一条迁移候选')
      const existingTitles = new Set((repository.listSeeds(worldId) as any[])
        .map((seed) => normalizedSearchText(seed?.title)).filter(Boolean))
      const createdIds: string[] = []
      try {
        repository.transaction(() => {
          for (const index of selectedIndexes) {
            const candidate = proposed[index]
            const normalizedTitle = normalizedSearchText(candidate?.title)
            if (!normalizedTitle || existingTitles.has(normalizedTitle)) {
              throw new Error(`迁移候选与现役种子重复：${text(candidate?.title, 120) || `#${index + 1}`}`)
            }
            existingTitles.add(normalizedTitle)
            const source = candidate?.source && typeof candidate.source === 'object' ? candidate.source : {}
            const row = buildSeedRow(worldId, {
              type: candidate.type,
              title: candidate.title,
              description: candidate.description,
              currentProgress: candidate.currentProgress,
              expectedOutcome: candidate.expectedOutcome,
              status: 'review_required',
              visibilityMode: candidate.visibilityMode || 'director_only',
              lastModifiedSource: 'legacy_migration'
            })
            const validationError = validateSeedRow(row)
            if (validationError) throw new Error(validationError.ok ? '迁移候选校验失败' : validationError.error)
            repository.insertSeed(row)
            repository.replaceParticipants(row.id, worldId, [])
            repository.replaceLinks(row.id, worldId, [])
            repository.appendEvent(eventRow(row, {
              sourceSessionId: text(source.sessionId, 160),
              evidenceSummary: `由旧会话剧本人工确认迁移；来源=${text(source.kind, 80) || 'legacy_script'}`
            }, 'migrated', { source, reviewReasons: candidate.reviewReasons || [] }))
            createdIds.push(row.id)
          }
        })
      } catch (error) {
        return fail(409, error instanceof Error ? error.message : '迁移失败，已回滚全部写入')
      }
      return ok({ worldId, migratedCount: createdIds.length, createdIds, transaction: 'committed' })
    }
  }
}

export const narrativeSeedAppService = createNarrativeSeedAppService()
