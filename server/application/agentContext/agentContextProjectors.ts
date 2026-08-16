import {
  createAgentContextProjection,
  type AgentContextPerspective,
  type AgentContextProjection,
  type AgentContextScope
} from '../../../shared/agentContextProjection.js'
import { createChatMessageReference } from '../../../shared/chatMessageReference.js'
import { createStatusPanelReference } from '../../../shared/statusPanelReference.js'
import { summarizeStatusPanelPresentation } from '../../../shared/statusPanelPresentation.js'
import type { RimWorldPawnSnapshotV1 } from '../../../shared/rimworldBridge.js'

type AnyRecord = Record<string, any>

function text(value: unknown, max = 1000): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function structuredText(value: unknown, max = 2000, depth = 0): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return text(value, max)
  if (depth > 2) return ''
  if (Array.isArray(value)) return value.map((item) => structuredText(item, max, depth + 1)).filter(Boolean).join('、').slice(0, max)
  if (typeof value !== 'object') return ''
  return Object.entries(value as AnyRecord).map(([key, item]) => {
    const rendered = structuredText(item, max, depth + 1)
    return rendered ? `${key}：${rendered}` : ''
  }).filter(Boolean).join('；').slice(0, max)
}

function array<T = AnyRecord>(value: unknown): T[] {
  return Array.isArray(value) ? value : []
}

function parseObject(value: unknown): AnyRecord {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as AnyRecord
  if (typeof value !== 'string' || !value.trim()) return {}
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function parseArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value
  if (typeof value !== 'string' || !value.trim()) return []
  try { return Array.isArray(JSON.parse(value)) ? JSON.parse(value) : [] } catch { return [] }
}

function versionFromRows(rows: AnyRecord[], fallback: string): string {
  const tail = rows[rows.length - 1]
  return text(tail?.updatedAt ?? tail?.updated_at ?? tail?.createdAt ?? tail?.created_at ?? fallback, 160) || fallback
}

function projection<T>(input: {
  kind: AgentContextProjection<T>['kind']
  schemaVersion?: string
  sourceRef: string
  sourceVersion: string | number
  scope: AgentContextScope
  classification: AgentContextProjection<T>['classification']
  visibility: AgentContextProjection<T>['visibility']
  perspective: AgentContextPerspective
  value: T
  truncated?: boolean
  warnings?: string[]
  continuation?: AgentContextProjection<T>['continuation']
  generatedAt: string
}): AgentContextProjection<T> {
  return createAgentContextProjection({
    schemaVersion: input.schemaVersion || 'v1', truncated: Boolean(input.truncated), warnings: input.warnings || [], ...input
  })
}

export function projectChatVisibleContext(input: {
  sessionId: string
  scope: AgentContextScope
  perspective: AgentContextPerspective
  rows: AnyRecord[]
  anchorMessageId?: number
  maxItems: number
  generatedAt: string
}) {
  const latestByMessageId = new Map<number, AnyRecord>()
  array<AnyRecord>(input.rows).forEach((row) => {
    const messageId = Number(row.messageId ?? row.message_id ?? 0)
    const status = text(row.status, 40)
    if (!Number.isInteger(messageId) || messageId <= 0) return
    if (input.anchorMessageId && messageId > input.anchorMessageId) return
    if (status !== 'complete' && status !== 'partial') return
    latestByMessageId.set(messageId, row)
  })
  const all = [...latestByMessageId.values()].sort((a, b) => Number(a.messageId ?? a.message_id) - Number(b.messageId ?? b.message_id))
  const selected = all.slice(-Math.max(1, input.maxItems))
  return projection({
    kind: 'chat.visible_context', sourceRef: `chat-session:${input.sessionId}:message-projections`,
    sourceVersion: versionFromRows(selected, `empty:${input.anchorMessageId || 0}`), scope: input.scope,
    classification: 'session_truth', visibility: input.perspective.kind === 'character' ? 'character_known' : 'participants',
    perspective: input.perspective, generatedAt: input.generatedAt, truncated: all.length > selected.length,
    continuation: all.length > selected.length ? { toolName: 'searchChatProjection', ref: `chat-session:${input.sessionId}` } : undefined,
    value: {
      sessionId: input.sessionId,
      anchorMessageId: input.anchorMessageId || null,
      items: selected.map((row) => ({
        ref: createChatMessageReference(input.sessionId, Number(row.messageId ?? row.message_id)),
        projectionId: text(row.id, 160),
        speakerId: text(row.speakerId ?? row.speaker_id, 160),
        speakerName: text(row.speakerName ?? row.speaker_name, 120) || '未知说话人',
        fact: text(row.objectiveFact ?? row.objective_fact, 1600),
        changed: parseObject(row.changed ?? row.changedJson ?? row.changed_json),
        uncertainty: text(row.uncertainty ?? row.failureReason ?? row.failure_reason, 600),
        status: text(row.status, 40)
      }))
    }
  })
}

export function projectSessionWorldContext(input: {
  session: AnyRecord
  scope: AgentContextScope
  perspective: AgentContextPerspective
  generatedAt: string
}) {
  const session = input.session || {}
  const worldId = text(session.worldId ?? session.world_id, 160)
  const curtainWorldId = text(session.curtainWorldId ?? session.curtain_world_id ?? session.virtualSceneWorldId ?? session.virtual_scene_world_id, 160)
  const curtainMatches = Boolean(worldId && (!curtainWorldId || curtainWorldId === worldId))
  const documentIds = worldId
    ? [...new Set(array(session.worldDocLibraryDocumentIds ?? session.world_doc_library_document_ids).map((id) => text(id, 160)).filter(Boolean))]
    : []
  const entities = worldId
    ? array<AnyRecord>(session.worldEntitySummaries ?? session.world_entity_summaries).map((item) => ({ id: text(item.id, 160), kind: text(item.kind, 80), name: text(item.name, 160) })).filter((item) => item.id)
    : []
  const updatedAt = text(session.updatedAt ?? session.updated_at, 160) || 'unversioned'
  return projection({
    kind: 'session.world_context', sourceRef: `chat-session:${text(session.id, 160)}:world-read-model`, sourceVersion: updatedAt,
    scope: input.scope, classification: 'session_truth', visibility: 'participants', perspective: input.perspective, generatedAt: input.generatedAt,
    warnings: worldId ? [] : ['当前会话未挂世界；世界文档范围为空，不得回退全库或其它世界。'],
    value: {
      mounted: Boolean(worldId),
      world: worldId ? { id: worldId, name: text(session.worldName ?? session.world_name, 160) } : null,
      documentScope: { ids: documentIds, count: documentIds.length },
      entities: { count: Number(session.worldEntityCount ?? session.world_entity_count ?? entities.length) || 0, items: entities.slice(0, 80) },
      defaultMapSheet: worldId && text(session.worldDefaultMapSheetId ?? session.world_default_map_sheet_id, 160)
        ? { id: text(session.worldDefaultMapSheetId ?? session.world_default_map_sheet_id, 160) }
        : null,
      curtain: worldId && curtainMatches ? {
        worldId,
        mapSheetId: text(session.curtainMapSheetId ?? session.curtain_map_sheet_id ?? session.virtualLocationSheetId ?? session.virtual_location_sheet_id, 160),
        mapFeatureId: text(session.virtualLocationFeatureId ?? session.virtual_location_feature_id, 160),
        mapFeatureName: text(session.curtainMapFeatureName ?? session.curtain_map_feature_name, 160),
        locationLarge: text(session.virtualLocationLarge ?? session.virtual_location_large, 200),
        locationMiddle: text(session.virtualLocationMiddle ?? session.virtual_location_middle, 200),
        locationSmall: text(session.virtualLocationSmall ?? session.virtual_location_small, 200),
        location: text(session.virtualLocation ?? session.virtual_location, 400),
        time: text(session.virtualTime ?? session.virtual_time, 200),
        weather: text(session.virtualWeather ?? session.virtual_weather, 200)
      } : null
    }
  })
}

export function projectCastPresence(input: {
  sessionId: string
  worldId: string
  participants: AnyRecord[]
  presences: AnyRecord[]
  roundCandidateIds?: string[]
  scope: AgentContextScope
  perspective: AgentContextPerspective
  generatedAt: string
}) {
  const presenceMap = new Map(array<AnyRecord>(input.presences).map((item) => [text(item.participantId ?? item.participant_id, 160), item]))
  const members = array<AnyRecord>(input.participants).filter((participant) => text(participant.participantType ?? participant.participant_type, 40) === 'char').map((participant) => {
    const participantId = text(participant.id, 160)
    const character = participant.resolvedCharacter || {}
    const characterId = text(participant.participantTargetId ?? participant.participant_target_id, 160)
    return {
      participantId, characterId, displayName: text(character.name ?? participant.name ?? characterId, 160),
      characterStateMode: text(participant.characterStateMode ?? participant.character_state_mode, 80) || 'follow_main',
      characterBranchId: text(participant.characterBranchId ?? participant.character_branch_id, 160)
    }
  })
  const presences = members.map((member) => {
    const row = presenceMap.get(member.participantId)
    return {
      participantId: member.participantId,
      presenceState: text(row?.presenceState ?? row?.presence_state, 40) || 'unknown',
      version: Number(row?.version || 0),
      persisted: Boolean(row?.persisted),
      locationText: text(row?.locationText ?? row?.location_text, 300),
      mapSheetId: text(row?.mapSheetId ?? row?.map_sheet_id, 160),
      mapFeatureId: text(row?.mapFeatureId ?? row?.map_feature_id, 160)
    }
  })
  const roundSet = new Set(array<string>(input.roundCandidateIds).map((id) => text(id, 160)).filter(Boolean))
  return projection({
    kind: 'session.cast_presence', sourceRef: `chat-session:${input.sessionId}:cast-presence`,
    sourceVersion: versionFromRows(input.presences, `members:${members.length}`), scope: input.scope,
    classification: 'session_truth', visibility: 'participants', perspective: input.perspective, generatedAt: input.generatedAt,
    warnings: presences.some((item) => item.presenceState === 'unknown') ? ['unknown 是未确认兼容态，不得解释为当前在场。'] : [],
    value: {
      sessionId: input.sessionId,
      worldId: input.worldId,
      members,
      presences,
      roundCandidates: members.filter((item) => roundSet.has(item.participantId) || roundSet.has(item.characterId))
    }
  })
}

const OBSERVABLE_FIELD_PATTERN = /(appearance|outfit|clothes|clothing|weapon|equipment|visible|injury|wound|外貌|穿着|衣着|服装|武器|装备|伤|可见)/i

function fieldsOfPanel(panel: AnyRecord, templateMap: Map<string, AnyRecord>): AnyRecord[] {
  const own = parseArray(panel.fields ?? panel.fieldsJson ?? panel.fields_json)
  if (own.length) return own as AnyRecord[]
  const template = templateMap.get(text(panel.templateId ?? panel.template_id, 160))
  return parseArray(template?.fields ?? template?.fieldsJson ?? template?.fields_json) as AnyRecord[]
}

export function projectStatusPanelCatalog(input: {
  sessionId: string
  templates: AnyRecord[]
  panels: AnyRecord[]
  scope: AgentContextScope
  perspective: AgentContextPerspective
  generatedAt: string
}) {
  const templateMap = new Map(array<AnyRecord>(input.templates).map((item) => [text(item.id, 160), item]))
  const panels = array<AnyRecord>(input.panels).map((panel) => {
    const templateId = text(panel.templateId ?? panel.template_id, 160)
    const template = templateMap.get(templateId)
    return {
      id: text(panel.id, 160),
      ref: createStatusPanelReference(input.sessionId, text(panel.id, 160)),
      name: text(panel.name, 160),
      kind: text(template?.kind, 120),
      description: text(panel.description ?? template?.description, 600),
      templateId,
      hostType: text(panel.hostType ?? panel.host_type, 80),
      hostId: text(panel.hostId ?? panel.host_id, 160),
      fields: fieldsOfPanel(panel, templateMap).map((field) => ({
        key: text(field.key, 100),
        label: text(field.label, 120),
        ...(text(field.unit, 60) ? { unit: text(field.unit, 60) } : {}),
        valueType: text(field.valueType ?? field.value_type, 40) || 'text',
        description: text(field.description, 300)
      })),
      presentationSummary: summarizeStatusPanelPresentation(parseObject(panel.presentation ?? panel.presentationJson ?? panel.presentation_json)),
      version: Math.max(1, Number(panel.version || 1)),
      updatedAt: text(panel.updatedAt ?? panel.updated_at, 80)
    }
  })
  return projection({
    kind: 'status.panel_catalog', schemaVersion: 'v1',
    sourceRef: `chat-session:${input.sessionId}:status-panel-catalog`,
    sourceVersion: versionFromRows(input.panels, `empty:${input.templates.length}`),
    scope: input.scope, classification: 'session_truth', visibility: 'director_only',
    perspective: input.perspective, generatedAt: input.generatedAt,
    value: { sessionId: input.sessionId, panels }
  })
}

export function projectStatusPanels(input: {
  sessionId: string
  templates: AnyRecord[]
  panels: AnyRecord[]
  visibleCharacterIds: Set<string>
  knownCharacterIds?: Set<string>
  visibleCharacterRefs?: Map<string, string>
  participantCharacterIds?: Map<string, string>
  ownCharacterId?: string
  scope: AgentContextScope
  perspective: AgentContextPerspective
  generatedAt: string
}) {
  const templateMap = new Map(array<AnyRecord>(input.templates).map((item) => [text(item.id, 160), item]))
  const prepared = array<AnyRecord>(input.panels).flatMap((panel) => {
    const hostType = text(panel.hostType ?? panel.host_type, 80)
    const hostId = text(panel.hostId ?? panel.host_id, 160)
    const hostCharacterId = hostType === 'session_character'
      ? text(input.participantCharacterIds?.get(hostId), 160)
      : ''
    if (input.perspective.kind === 'character' && hostCharacterId && hostCharacterId !== input.ownCharacterId && !input.visibleCharacterIds.has(hostCharacterId)) return []
    const values = parseObject(panel.values ?? panel.valuesJson ?? panel.values_json)
    const bindingValues = parseObject(panel.bindingValues ?? panel.binding_values)
    const fields = fieldsOfPanel(panel, templateMap)
    const visibleFields = input.perspective.kind !== 'character' || hostCharacterId === input.ownCharacterId
      ? fields
      : fields.filter((field) => OBSERVABLE_FIELD_PATTERN.test(`${text(field.key, 100)} ${text(field.label, 100)} ${text(field.description, 200)}`))
    const knownHost = input.perspective.kind !== 'character' || !hostCharacterId || hostCharacterId === input.ownCharacterId || input.knownCharacterIds?.has(hostCharacterId)
    const projectedHostId = knownHost ? hostId : (input.visibleCharacterRefs?.get(hostCharacterId) || 'unidentified-character')
    return [{
      id: text(panel.id, 160), name: knownHost ? text(panel.name, 160) : '未识别角色状态',
      templateId: text(panel.templateId ?? panel.template_id, 160), hostType, hostId: projectedHostId,
      visibleFields, values, bindingValues,
      presentationSummary: summarizeStatusPanelPresentation(parseObject(panel.presentation ?? panel.presentationJson ?? panel.presentation_json))
    }]
  })
  const accessibleById = new Map(prepared.map((panel) => [panel.id, panel]))
  const projected = prepared.map((panel) => ({
    id: panel.id,
    ref: createStatusPanelReference(input.sessionId, panel.id),
    name: panel.name,
    templateId: panel.templateId,
    hostType: panel.hostType,
    hostId: panel.hostId,
    presentationSummary: panel.presentationSummary,
    fields: panel.visibleFields.map((field: AnyRecord) => {
      const key = text(field.key, 100)
      const valueType = text(field.valueType ?? field.value_type, 40) || 'text'
      const rawValue = text(field.binding, 120) ? panel.bindingValues[key] : panel.values[key]
      const base = {
        key, label: text(field.label, 120), ...(text(field.unit, 60) ? { unit: text(field.unit, 60) } : {}), valueType, description: text(field.description, 300),
        binding: text(field.binding, 120), value: rawValue
      }
      if (valueType !== 'ref') return base
      const ids = (Array.isArray(rawValue) ? rawValue : rawValue ? [rawValue] : []).map((item) => text(item, 160)).filter(Boolean)
      return {
        ...base,
        value: undefined,
        references: ids.map((panelId) => {
          const target = accessibleById.get(panelId)
          return target
            ? { status: 'available', name: target.name, ref: createStatusPanelReference(input.sessionId, panelId) }
            : { status: 'unavailable', reason: 'not_visible' }
        })
      }
    })
  }))
  return projection({
    kind: 'status.panels', schemaVersion: 'v2', sourceRef: `chat-session:${input.sessionId}:status-panels`, sourceVersion: versionFromRows(input.panels, `empty:${input.templates.length}`),
    scope: input.scope, classification: 'session_truth', visibility: input.perspective.kind === 'character' ? 'scene_observable' : 'director_only',
    perspective: input.perspective, generatedAt: input.generatedAt, value: { sessionId: input.sessionId, panels: projected }
  })
}

function characterProfile(participant: AnyRecord) {
  const character = participant.resolvedCharacter || {}
  return {
    participantId: text(participant.id, 160), characterId: text(participant.participantTargetId ?? participant.participant_target_id, 160),
    sourceMode: text(participant.characterStateMode ?? participant.character_state_mode, 80) || 'follow_main',
    branchId: text(participant.characterBranchId ?? participant.character_branch_id, 160),
    name: text(character.name, 160), gender: text(character.gender, 80), age: text(character.age, 80), introduction: text(character.desc, 1600),
    personality: text(character.personality, 1600), hobbies: text(character.hobbies, 1200), abilities: text(character.abilities, 1600),
    experience: text(character.experience, 2000), worldview: text(character.worldview, 1600), background: text(character.background, 2000),
    speakingStyle: text(character.speakingStyle ?? character.speaking_style, 1600),
    appearance: text(character.appearance, 1600), outfit: text(character.outfit, 1200), relationships: structuredText(character.relationships, 2000)
  }
}

function explicitlyKnows(observer: ReturnType<typeof characterProfile>, target: ReturnType<typeof characterProfile>): boolean {
  if (!observer.relationships || (!target.name && !target.characterId)) return false
  const relation = observer.relationships.toLocaleLowerCase()
  return Boolean((target.name && relation.includes(target.name.toLocaleLowerCase())) || relation.includes(target.characterId.toLocaleLowerCase()))
}

function renderRelationshipKnowledge(profile: ReturnType<typeof characterProfile>, profiles: Array<ReturnType<typeof characterProfile>>): string {
  let rendered = profile.relationships
  for (const target of profiles) {
    if (!target.characterId || !target.name || target.characterId === profile.characterId) continue
    rendered = rendered.split(target.characterId).join(target.name)
  }
  return rendered
}

export function resolveKnownCharacterIds(input: {
  participants: AnyRecord[]
  perspective: AgentContextPerspective
}): Set<string> {
  const profiles = array<AnyRecord>(input.participants)
    .filter((item) => text(item.participantType ?? item.participant_type, 40) === 'char' && item.resolvedCharacter)
    .map(characterProfile)
  if (input.perspective.kind === 'system_director') return new Set(profiles.map((item) => item.characterId).filter(Boolean))
  if (input.perspective.kind !== 'character') return new Set()
  const observer = profiles.find((item) => item.characterId === input.perspective.characterId)
  if (!observer) return new Set()
  return new Set(profiles
    .filter((target) => target.characterId === observer.characterId || explicitlyKnows(observer, target))
    .map((target) => target.characterId)
    .filter(Boolean))
}

export function projectCharacterInformation(input: {
  kind: 'character.private_profile' | 'character.observable_profile' | 'character.knowledge'
  sessionId: string
  participants: AnyRecord[]
  presences: AnyRecord[]
  statusPanels?: AnyRecord[]
  scope: AgentContextScope
  perspective: AgentContextPerspective
  generatedAt: string
}) {
  const profiles = array<AnyRecord>(input.participants).filter((item) => text(item.participantType ?? item.participant_type, 40) === 'char' && item.resolvedCharacter).map(characterProfile)
  const observer = input.perspective.kind === 'character'
    ? profiles.find((item) => item.characterId === input.perspective.characterId)
    : null
  const knownCharacterIds = resolveKnownCharacterIds({ participants: input.participants, perspective: input.perspective })
  const presenceByParticipant = new Map(array<AnyRecord>(input.presences).map((item) => [text(item.participantId ?? item.participant_id, 160), text(item.presenceState ?? item.presence_state, 40) || 'unknown']))

  if (input.kind === 'character.private_profile') {
    const visible = input.perspective.kind === 'system_director'
      ? profiles
      : profiles.filter((target) => knownCharacterIds.has(target.characterId))
    return projection({
      kind: input.kind, sourceRef: `chat-session:${input.sessionId}:resolved-character-private`, sourceVersion: versionFromRows(input.participants, `profiles:${profiles.length}`),
      scope: input.scope, classification: 'character_private', visibility: input.perspective.kind === 'system_director' ? 'director_only' : 'character_known',
      perspective: input.perspective, generatedAt: input.generatedAt,
      value: { profiles: visible.map(({ appearance: _appearance, outfit: _outfit, relationships: _relationships, ...profile }) => profile) }
    })
  }

  if (input.kind === 'character.observable_profile') {
    const visible = profiles.filter((target) => presenceByParticipant.get(target.participantId) === 'present')
    return projection({
      kind: input.kind, sourceRef: `chat-session:${input.sessionId}:observable-character-profile`, sourceVersion: versionFromRows(input.presences, `present:${visible.length}`),
      scope: input.scope, classification: 'observable', visibility: 'scene_observable', perspective: input.perspective, generatedAt: input.generatedAt,
      warnings: input.presences.length ? [] : ['没有正式在场资料，未把会话成员自动视为可观察对象。'],
      value: { profiles: visible.map((target) => {
        const known = input.perspective.kind !== 'character' || knownCharacterIds.has(target.characterId)
        return {
          ref: `participant:${target.participantId}`,
          ...(known ? { characterId: target.characterId, name: target.name } : { name: '未识别角色' }),
          appearance: target.appearance,
          outfit: target.outfit
        }
      }) }
    })
  }

  const knownFacts = input.perspective.kind === 'system_director'
    ? profiles.filter((item) => item.relationships).map((item) => ({ ownerCharacterId: item.characterId, fact: renderRelationshipKnowledge(item, profiles), source: 'character.relationships' }))
    : observer?.relationships ? [{ ownerCharacterId: observer.characterId, fact: renderRelationshipKnowledge(observer, profiles), source: 'character.relationships' }] : []
  return projection({
    kind: input.kind, sourceRef: `chat-session:${input.sessionId}:character-knowledge`, sourceVersion: versionFromRows(input.participants, `knowledge:${knownFacts.length}`),
    scope: input.scope, classification: 'character_private', visibility: input.perspective.kind === 'system_director' ? 'director_only' : 'character_known',
    perspective: input.perspective, generatedAt: input.generatedAt, value: { knownFacts }
  })
}

export function projectNarrativeSeeds(input: {
  worldId: string
  seeds: AnyRecord[]
  scope: AgentContextScope
  perspective: AgentContextPerspective
  generatedAt: string
  selected: boolean
}) {
  return projection({
    kind: 'world.narrative_seeds', sourceRef: `world:${input.worldId}:narrative-seeds`, sourceVersion: versionFromRows(input.seeds, 'empty'),
    scope: input.scope, classification: input.selected ? 'candidate' : 'world_truth', visibility: 'director_only', perspective: input.perspective, generatedAt: input.generatedAt,
    warnings: input.selected ? ['这些条目是本轮相关候选，不是已发生事实。'] : [],
    value: { worldId: input.worldId, selected: input.selected, items: input.seeds }
  })
}

export function projectWorldKnowledgeScope(input: {
  worldProjection: AgentContextProjection<any>
  generatedAt: string
}) {
  const value = input.worldProjection.value || {}
  return projection({
    kind: 'world.knowledge_scope', sourceRef: `${input.worldProjection.sourceRef}:knowledge-scope`, sourceVersion: input.worldProjection.sourceVersion,
    scope: input.worldProjection.scope, classification: 'world_truth', visibility: input.worldProjection.visibility,
    perspective: input.worldProjection.perspective, generatedAt: input.generatedAt,
    warnings: input.worldProjection.warnings,
    value: { mounted: Boolean(value.mounted), world: value.world || null, documentIds: value.documentScope?.ids || [], entities: value.entities?.items || [] }
  })
}

export function projectRimWorldPawnSnapshot(input: {
  snapshot: RimWorldPawnSnapshotV1
  scope: AgentContextScope
  perspective: AgentContextPerspective
  generatedAt: string
}) {
  return projection({
    kind: 'game.rimworld_pawn',
    sourceRef: 'rimworld:live-pawn-snapshot',
    sourceVersion: input.snapshot.capturedAtTick,
    scope: input.scope,
    classification: 'session_truth',
    visibility: 'character_known',
    perspective: input.perspective,
    generatedAt: input.generatedAt,
    value: input.snapshot
  })
}
