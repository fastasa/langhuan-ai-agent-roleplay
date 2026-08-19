import type {
  ChatMessage,
  ChatMessageNote,
  ChatPromptLogBlock,
  ChatPromptLogEntry,
  ChatPromptLogLocateResult,
  ChatPromptLogPage,
  ChatRecallActivityLogEntry,
  ChatRecallActivityLogPage,
  ChatSession,
  ChatSessionTemporaryEntity,
  ChatSessionTemporaryCharacter,
  ChatSessionParticipant,
  ChatSessionCharacterPresence,
  ChatSessionCharacterPresenceBundle,
  ChatSessionCharacterPresenceEvent,
  SessionOrchestrationMaterials,
  SessionNarrativeOverride,
  SessionOrchestrationState,
  ChatStatusPanel,
  ChatStatusPanelEvent,
  ChatStatusPanelTemplate,
  ChatStatusAsset,
  StatusPanelAssetRef,
  ServerData,
  World,
  WorldEntity,
  WorldEntityKind,
  WorldMapBundle,
  WorldMapChangeRunGroup,
  WorldMapFeatureRecord,
  WorldMapSheet,
  WorldMapWriteRunMeta
} from '../types'
import { API } from '../config/api'
import { normalizeStatusPanelPresentation } from '../../shared/statusPanelPresentation'
import { normalizeChatSessionReplyPipelineMode, resolveSessionReplyPipelineMode } from '../app/chatReplyPipelineMode'
import type { RelevantNarrativeSeedBundle, RelevantNarrativeSeedSummary } from '../app/narrativeSeedDirectorContext'
import { bumpChatProjectionObservationTick } from '../app/chatProjectionObservationSignal'
import { bumpWorldMapRevision } from '../app/worldMapRevision'
import { normalizeLoadedSummaryIds } from '../utils/chatSummary'
import type { ChatImageAttachment } from '../utils/chatAttachments'
import type { ImprovisedCharacterContextBuildResult, ImprovisedCharacterExtractionOutput } from '../app/improvisedCharacterCommand'
import type { PersonalityModelContextBundle, PersonalityModelContextInput } from '../app/personalityModelContext'
import type { ProjectionFirstMessageViewResult } from '../app/projectionFirstMessageView'
import type { AgentContextBundle } from '../../shared/agentContextProjection'
import type { AgentContextAgentKind } from '../../shared/agentContextRecipes'
import type { DirectorOrchestrationProjection, OrchestrationCommandEnvelope, OrchestrationTargetRef, OrchestrationWorkspaceProjection } from '../../shared/orchestrationWorkspace'
import type { CreatePostRoundRunInput, PostRoundOrchestrationRun, PostRoundRunStatus } from '../../shared/postRoundOrchestration'
import {
  decodeRecallActivityLogValue,
  encodeRecallActivityLogForTransport
} from '../../shared/recallActivityLogCodec'
import type { WorkspaceAgentKind } from '../../shared/agentSessionKinds'

export type ChatTargetKind = 'character' | 'group' | 'crowd' | 'unknown'

export interface ChatTargetEntity {
  id: string
  kind: ChatTargetKind
}

export interface ChatRuntimeStreamingJob {
  id: string
  targetId: string
  sessionId: string
  speakerName: string
  content: string
  updatedAt: number
}

export interface ChatPendingReconcileJob {
  id: string
  targetId: string
  sessionId: string
  messageId?: number
  updatedAt: number
}

export interface ChatSessionBundle {
  session: ChatSession
  participants?: ChatSessionParticipant[]
  messages: ChatMessage[]
  pageInfo?: {
    hasMore?: boolean
    oldestMessageId?: number
  }
}

export interface ChatSessionMessagePageOptions {
  limit?: number
  beforeId?: number
}

export interface ChatPromptLogCreatePayload {
  speakerName?: string
  targetId?: string
  finalPrompt: string
  promptBlocks: ChatPromptLogBlock[]
  logKind?: 'final_reply' | 'internal_agent' | 'message_projection' | 'manual_projection'
}

export interface ChatRecallActivityLogCreatePayload {
  speakerName?: string
  targetId?: string
  inputMessageId?: number
  assistantMessageId?: number
  activity: Record<string, unknown>
}

export interface ChatRecallActivityLogBindPayload {
  inputMessageId?: number
  activity?: Record<string, unknown>
  speakerName?: string
  targetId?: string
}

export interface ChatGenerationAttemptEntry {
  id: string
  sessionId?: string
  anchorMessageId?: number
  parentAttemptId?: string
  triggerType?: string
  mode?: 'clean' | 'prompt_replay' | string
  status?: string
  targetId?: string
  speakerName?: string
  tidiaoRunId?: string
  assistantMessageIds?: number[]
  replacedMessageIds?: number[]
  sourcePromptLogId?: string
  outputPromptLogId?: string
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

export interface ChatGenerationAttemptPayload {
  anchorMessageId?: number
  parentAttemptId?: string
  triggerType?: string
  mode?: 'clean' | 'prompt_replay'
  status?: string
  targetId?: string
  speakerName?: string
  tidiaoRunId?: string
  assistantMessageIds?: number[]
  replacedMessageIds?: number[]
  sourcePromptLogId?: string
  outputPromptLogId?: string
  errorJson?: Record<string, unknown>
}

export interface ChatGenerationAttemptArtifactPayload {
  /** 可选稳定 id（批次2·决策流即时持久化）：传了就用它，后端 INSERT OR REPLACE 按 id 覆盖=真 upsert（不传则后端自动生成、向后兼容）。 */
  id?: string
  attemptId: string
  artifactKind: string
  messageId?: number
  promptLogId?: string
  recallActivityLogId?: string
  payload?: Record<string, unknown>
  /** 可选 createdAt（批次2）：upsert 同一条 artifact 时固定它，避免每次刷位、读回 last-wins 稳定取最新。 */
  createdAt?: string
}

export interface ChatGenerationAttemptArtifactEntry extends ChatGenerationAttemptArtifactPayload {
  id: string
  sessionId?: string
  payloadJson?: string
  createdAt?: string
}

export interface ChatPersonalityModelObservationProjection {
  id: string
  sessionId?: string
  messageId?: number
  attemptId?: string
  status?: string
  messageKind?: string
  speakerId?: string
  speakerName?: string
  audienceIds?: string[]
  audienceNames?: string[]
  participants?: Array<Record<string, unknown>>
  objectiveFact?: string
  fallbackCleanText?: string
  startEnv?: Record<string, unknown>
  endEnv?: Record<string, unknown>
  changed?: Record<string, unknown>
  sourceProjectionIds?: string[]
  failureStage?: string
  failureReason?: string
  createdAt?: string
  updatedAt?: string
  completedAt?: string
}

export interface ChatPersonalityModelObservationVisibility {
  id?: string
  projectionId?: string
  messageId?: number
  characterId?: string
  characterName?: string
  visibility?: string
  reason?: string
  writebackRunId?: string
  createdAt?: string
  updatedAt?: string
}

export interface ChatPersonalityModelObservationPage {
  sessionId: string
  projections: ChatPersonalityModelObservationProjection[]
  visibility: ChatPersonalityModelObservationVisibility[]
  attempts: ChatGenerationAttemptEntry[]
  traces: ChatGenerationAttemptArtifactEntry[]
}

export interface ChatProjectionWritebackRunPayload {
  characterId: string
  runKind?: 'auto' | 'manual' | string
  mode?: 'auto' | 'manual' | string
}

export type ChatPersonalityModelContextPayload = Pick<
  PersonalityModelContextInput,
  'characterId' | 'characterName' | 'characterIdentity' | 'candidatePlanSystemPromptPrefix' | 'promptLibrarySystemPrompt' | 'scenarioMountedPromptText' | 'currentUserInput' | 'userName' | 'recallSections' | 'sceneChangeNotice' | 'compressedContext' | 'fallbackMessageIds' | 'excludedMessageIds' | 'candidatePlans' | 'topPlans' | 'expressionMix'
>

export interface ChatProjectionFirstMessageViewPayload {
  characterId: string
  windowSize?: number
  currentMessageIds?: Array<number | string>
}

export interface ChatArchiveRecord {
  id: string
  targetId: string
  targetKind: ChatTargetKind
  name: string
  category: string
  messageCount: number
  lastMessagePreview?: string
  linkedArchiveId?: string
  createdAt: string
  updatedAt: string
  sourceTargetId: string
}

export interface ChatArchiveExportBundle {
  version: number
  exportedAt: string
  items: Array<{
    session: ChatSession
    messages: ChatMessage[]
    messageCount: number
  }>
}

export interface ChatSummaryRecord {
  id: string
  title?: string
  name?: string
  content: string
  tags?: string[]
  char_id?: string
  session_id?: string
  merged_summary_ids?: string[]
  created_at?: string
  updated_at?: string
}

export interface LoadedChatSummaryRecord {
  id: string
  name: string
  content: string
  kind: 'small' | 'big' | 'legacy'
}

export interface ChatSnapshotPayload {
  workspaceTarget?: string
  workspaceSessionId?: string
  summaryLibrary?: ServerData['summaryLibrary']
  smallSummaries?: ServerData['smallSummaries']
  bigSummaries?: ServerData['bigSummaries']
  chatSessions?: ServerData['chatSessions']
  chatSessionParticipants?: ServerData['chatSessionParticipants']
  chatSessionTemporaryCharacters?: ServerData['chatSessionTemporaryCharacters']
  chatSessionTemporaryEntities?: ServerData['chatSessionTemporaryEntities']
  chatMessages?: ServerData['chatMessages']
  chatMessageNotes?: ServerData['chatMessageNotes']
  chatAffectGateAudits?: ServerData['chatAffectGateAudits']
  chatAffectLedgerEntries?: ServerData['chatAffectLedgerEntries']
  chatPromptLogs?: ServerData['chatPromptLogs']
  currentChatTarget?: ServerData['currentChatTarget']
  currentSession?: ServerData['currentSession']
  currentMessages?: ServerData['currentMessages']
}

export interface ChatSummaryExportPayload {
  summaryLibrary: unknown[]
  summaryIdCounter: number
}

export interface ChatSessionCreatePayload {
  targetId?: string
  targetType?: string
  title?: string
  participants?: Array<{
    id?: string
    targetId?: string
    targetType?: string
    participantTargetId?: string
    participantType?: string
    displayName?: string
    role?: string
    displayOrder?: number
    probability?: number
    replyProbability?: number
    characterStateMode?: 'follow_main' | 'independent_snapshot'
    sourceSnapshotId?: string
  }>
  conversationAvatarPath?: string
  conversationEmoji?: string
  virtualSceneName?: string
  virtualSceneDesc?: string
  virtualLocation?: string
  virtualLocationLarge?: string
  virtualLocationMiddle?: string
  virtualLocationSmall?: string
  virtualRealLocation?: string
  virtualTime?: string
  virtualTimeAnchor?: number
  virtualTimeBase?: number
  virtualTimeRate?: number
  virtualWeather?: string
  virtualWeatherMode?: string
  boundAlias?: string
  narrationFrequency?: string
  narrationTemperature?: string
  narrationProfiles?: string | unknown[]
  chatFontScale?: number
  replyPipelineMode?: string
}

export interface SessionTemporaryCharacterSavePayload {
  id?: string
  name?: string
  aliases?: string[]
  markdown?: string
  sourceLedger?: Array<Record<string, unknown>>
  lockedFields?: string[]
}

export interface SessionTemporaryCharacterMentionResolveResult {
  ok?: boolean
  item?: ChatSessionTemporaryCharacter
  created?: boolean
  updated?: boolean
  pendingJudge?: boolean
  context?: Record<string, unknown>
  judgeResults?: Array<Record<string, unknown>>
  promptLogId?: string
}

export interface SessionTemporaryEntityOrganizeResult {
  ok?: boolean
  item?: ChatSessionTemporaryEntity
  created?: boolean
  updated?: boolean
  context?: Record<string, unknown>
  promptLogId?: string
  rawOutput?: string
}

export interface SessionTemporaryEntityPersistResult {
  ok?: boolean
  item?: ChatSessionTemporaryEntity
  character?: Record<string, unknown>
  group?: Record<string, unknown>
  persistedTarget?: Record<string, unknown>
  placement?: Record<string, unknown>
}

export function readChatStoreValue<T>(input: T | { value: T } | undefined): T | undefined {
  if (input && typeof input === 'object' && 'value' in input) {
    return (input as { value: T }).value
  }
  return input as T | undefined
}

export function normalizeChatTargetId(targetId: string): string {
  const raw = String(targetId || '').trim()
  if (raw.startsWith('group_group_')) return raw.replace(/^group_/, '')
  if (raw.startsWith('crowd_crowd_')) return raw.replace(/^crowd_/, '')
  return raw
}

export function resolveChatTargetKind(targetId: string): ChatTargetKind {
  const normalized = normalizeChatTargetId(targetId)
  if (!normalized) return 'unknown'
  if (normalized.startsWith('group_')) return 'group'
  if (normalized.startsWith('crowd_')) return 'crowd'
  return 'character'
}

export interface NormalizedChatSessionCharacterParticipant {
  participantId?: string
  characterId: string
  probability?: number
  displayOrder: number
  characterStateMode?: 'follow_main' | 'independent_snapshot'
  characterBranchId?: string
}

export function normalizeChatSessionCharacterParticipants(session: unknown): NormalizedChatSessionCharacterParticipant[] {
  const participants = Array.isArray((session as { participants?: unknown[] } | null | undefined)?.participants)
    ? ((session as { participants?: unknown[] }).participants || [])
    : []
  const seen = new Set<string>()
  return participants
    .map((participant: unknown, index): NormalizedChatSessionCharacterParticipant | null => {
      const row = participant as Record<string, unknown>
      const participantType = String(row?.participantType ?? row?.participant_type ?? 'char').trim() || 'char'
      if (participantType !== 'char') return null
      const characterId = normalizeChatTargetId(String(
        row?.participantTargetId
        ?? row?.participant_target_id
        ?? row?.targetId
        ?? row?.target_id
        ?? row?.id
        ?? ''
      ))
      if (!characterId || characterId.startsWith('group_') || characterId.startsWith('crowd_')) return null
      const probability = Number(row?.replyProbability ?? row?.reply_probability ?? row?.probability)
      const displayOrder = Number(row?.displayOrder ?? row?.display_order ?? index)
      const normalized: NormalizedChatSessionCharacterParticipant = {
        participantId: String(row?.id || '').trim(),
        characterId,
        displayOrder: Number.isFinite(displayOrder) ? displayOrder : index,
        characterStateMode: String(row?.characterStateMode ?? row?.character_state_mode) === 'independent_snapshot'
          ? 'independent_snapshot'
          : 'follow_main',
        characterBranchId: String(row?.characterBranchId ?? row?.character_branch_id ?? '')
      }
      if (Number.isFinite(probability)) normalized.probability = probability
      return normalized
    })
    .filter((item): item is NormalizedChatSessionCharacterParticipant => item !== null)
    .sort((left, right) => left.displayOrder - right.displayOrder)
    .filter((item) => {
      if (seen.has(item.characterId)) return false
      seen.add(item.characterId)
      return true
    })
}

export function countChatSessionCharacterParticipants(session: unknown): number {
  return normalizeChatSessionCharacterParticipants(session).length
}

export function isMultiCharacterChatSession(session: unknown, fallbackTargetId = ''): boolean {
  const participantCount = countChatSessionCharacterParticipants(session)
  if (participantCount > 1) return true
  if (participantCount === 1) return false
  return normalizeChatTargetId(fallbackTargetId).startsWith('group_')
}

function trimText(value: unknown): string {
  return String(value ?? '').trim()
}

function readBooleanFlag(value: unknown): boolean {
  return value === true || value === 1 || value === '1' || String(value ?? '').toLowerCase() === 'true'
}

function normalizeChatFontScale(value: unknown): number {
  const raw = Number(value ?? 1)
  if (!Number.isFinite(raw)) return 1
  return Math.round(Math.min(1.25, Math.max(0.85, raw)) * 100) / 100
}

function composeVirtualSceneLocationLabel(
  large: unknown,
  middle: unknown,
  small: unknown,
  legacy: unknown = ''
): string {
  const largeText = trimText(large)
  const middleText = trimText(middle)
  const smallText = trimText(small)
  const legacyText = trimText(legacy)
  const tail = smallText || (!largeText && !middleText ? legacyText : '')
  const parts = [largeText, middleText, tail].filter(Boolean)
  if (parts.length) return parts.join(' / ')
  return legacyText
}

function splitLegacyVirtualSceneLocation(value: unknown): { large: string; middle: string; small: string } {
  const text = trimText(value)
  if (!text) return { large: '', middle: '', small: '' }
  const parts = text
    .split(/\s*(?:\/|／|｜|\||>|＞)\s*/g)
    .map((item) => item.trim())
    .filter(Boolean)
  if (parts.length >= 3) {
    return {
      large: parts[0],
      middle: parts[1],
      small: parts.slice(2).join(' / ')
    }
  }
  if (parts.length === 2) {
    return {
      large: parts[0],
      middle: parts[1],
      small: ''
    }
  }
  return {
    large: '',
    middle: '',
    small: text
  }
}

export function normalizeChatSession(session: ChatSession): ChatSession {
  const next = { ...session }
  next.id = String(next.id || '').trim()
  const normalizedTargetId = normalizeChatTargetId(
    String((next as ChatSession & { targetId?: string }).targetId ?? next.target_id ?? next.id ?? '')
  )
  ;(next as ChatSession & { targetId?: string }).targetId = normalizedTargetId
  next.target_id = normalizedTargetId
  next.isArchived = Boolean(next.isArchived ?? next.is_archived)
  next.is_archived = next.isArchived
  next.archiveName = String(next.archiveName ?? next.archive_name ?? '').trim()
  next.archive_name = next.archiveName
  next.archiveCategory = String(next.archiveCategory ?? next.archive_category ?? '').trim()
  next.archive_category = next.archiveCategory
  next.linkedArchiveId = String(next.linkedArchiveId ?? next.linked_archive_id ?? '').trim()
  next.linked_archive_id = next.linkedArchiveId
  next.sourceTargetId = normalizeChatTargetId(String(next.sourceTargetId ?? next.source_target_id ?? normalizedTargetId))
  next.source_target_id = next.sourceTargetId
  next.created_at = String(next.created_at || '')
  next.title = String(next.title ?? '').trim()
  next.conversationAvatarPath = String(next.conversationAvatarPath ?? next.conversation_avatar_path ?? '').trim()
  next.conversation_avatar_path = next.conversationAvatarPath
  next.conversationEmoji = String(next.conversationEmoji ?? next.conversation_emoji ?? '').trim()
  next.conversation_emoji = next.conversationEmoji
  next.worldId = String(next.worldId ?? next.world_id ?? '').trim()
  next.world_id = next.worldId
  next.worldName = String(next.worldName || '').trim()
  next.worldDocLibraryDocumentIds = Array.from(new Set(
    (Array.isArray(next.worldDocLibraryDocumentIds) ? next.worldDocLibraryDocumentIds : [])
      .map((id) => String(id || '').trim())
      .filter(Boolean)
  ))
  next.worldEntityCount = Math.max(0, Number(next.worldEntityCount ?? (next as ChatSession).world_entity_count ?? 0) || 0)
  next.worldEntitySummaries = (Array.isArray(next.worldEntitySummaries) ? next.worldEntitySummaries : [])
    .map((item: unknown) => {
      const row = (item && typeof item === 'object' ? item : {}) as Record<string, any>
      return { id: String(row.id || '').trim(), kind: String(row.kind || 'other').trim(), name: String(row.name || '').trim() }
    })
    .filter((item: { id: string }) => item.id)
  next.participants = Array.isArray(next.participants)
    ? next.participants.map((participant) => normalizeChatSessionParticipant(participant))
    : []

  const loadedSummaryIds = normalizeLoadedSummaryIds(next.loadedSummaryIds ?? next.loaded_summary_ids)
  next.loadedSummaryIds = loadedSummaryIds as unknown as string
  next.loaded_summary_ids = loadedSummaryIds as unknown as string
  next.virtualSceneName = next.virtualSceneName ?? next.virtual_scene_name ?? ''
  next.virtual_scene_name = next.virtualSceneName
  next.virtualSceneDesc = next.virtualSceneDesc ?? next.virtual_scene_desc ?? ''
  next.virtual_scene_desc = next.virtualSceneDesc
  const legacyLocation = trimText(next.virtualLocation ?? next.virtual_location)
  let virtualLocationLarge = trimText((next as Record<string, unknown>).virtualLocationLarge ?? (next as Record<string, unknown>).virtual_location_large)
  let virtualLocationMiddle = trimText((next as Record<string, unknown>).virtualLocationMiddle ?? (next as Record<string, unknown>).virtual_location_middle)
  let virtualLocationSmall = trimText((next as Record<string, unknown>).virtualLocationSmall ?? (next as Record<string, unknown>).virtual_location_small)
  if (!virtualLocationSmall && !virtualLocationLarge && !virtualLocationMiddle && legacyLocation) {
    const legacyParts = splitLegacyVirtualSceneLocation(legacyLocation)
    virtualLocationLarge = legacyParts.large
    virtualLocationMiddle = legacyParts.middle
    virtualLocationSmall = legacyParts.small
  }
  const normalizedLocation = composeVirtualSceneLocationLabel(virtualLocationLarge, virtualLocationMiddle, virtualLocationSmall, legacyLocation)
  next.virtualLocationLarge = virtualLocationLarge
  next.virtual_location_large = virtualLocationLarge
  next.virtualLocationMiddle = virtualLocationMiddle
  next.virtual_location_middle = virtualLocationMiddle
  next.virtualLocationSmall = virtualLocationSmall
  next.virtual_location_small = virtualLocationSmall
  next.virtualLocation = normalizedLocation
  next.virtual_location = normalizedLocation
  next.virtualSceneWorldId = String(next.virtualSceneWorldId ?? next.virtual_scene_world_id ?? '').trim()
  next.virtual_scene_world_id = next.virtualSceneWorldId
  next.virtualLocationSheetId = String(next.virtualLocationSheetId ?? next.virtual_location_sheet_id ?? '').trim()
  next.virtual_location_sheet_id = next.virtualLocationSheetId
  next.virtualLocationFeatureId = String(next.virtualLocationFeatureId ?? next.virtual_location_feature_id ?? '').trim()
  next.virtual_location_feature_id = next.virtualLocationFeatureId
  next.worldDefaultMapSheetId = String(next.worldDefaultMapSheetId || '').trim()
  next.worldMapSheets = (Array.isArray(next.worldMapSheets) ? next.worldMapSheets : [])
    .map((sheet) => ({ id: String(sheet?.id || '').trim(), name: String(sheet?.name || '').trim() }))
    .filter((sheet) => sheet.id)
  next.curtainWorldId = String(next.curtainWorldId || '').trim()
  next.curtainMapSheetId = String(next.curtainMapSheetId || '').trim()
  next.curtainMapFeatureName = String(next.curtainMapFeatureName || '').trim()
  next.virtualRealLocation = next.virtualRealLocation ?? next.virtual_real_location ?? ''
  next.virtual_real_location = next.virtualRealLocation
  next.virtualTime = next.virtualTime ?? next.virtual_time ?? ''
  next.virtual_time = next.virtualTime
  next.virtualTimeAnchor = next.virtualTimeAnchor ?? next.virtual_time_anchor ?? 0
  next.virtual_time_anchor = next.virtualTimeAnchor
  next.virtualTimeBase = next.virtualTimeBase ?? next.virtual_time_base ?? 0
  next.virtual_time_base = next.virtualTimeBase
  next.virtualTimeRate = next.virtualTimeRate ?? next.virtual_time_rate ?? 1
  next.virtual_time_rate = next.virtualTimeRate
  next.virtualWeather = next.virtualWeather ?? next.virtual_weather ?? ''
  next.virtual_weather = next.virtualWeather
  next.virtualWeatherMode = next.virtualWeatherMode ?? next.virtual_weather_mode ?? 'real'
  next.virtual_weather_mode = next.virtualWeatherMode
  next.boundAlias = next.boundAlias ?? next.bound_alias ?? ''
  next.bound_alias = next.boundAlias
  next.narrationFrequency = next.narrationFrequency ?? next.narration_frequency ?? 'standard'
  next.narration_frequency = next.narrationFrequency
  next.narrationTemperature = next.narrationTemperature ?? next.narration_temperature ?? 'standard'
  next.narration_temperature = next.narrationTemperature
  next.narrationProfiles = next.narrationProfiles ?? next.narration_profiles ?? '[]'
  next.narration_profiles = next.narrationProfiles
  next.narrationForceEnabled = readBooleanFlag((next as Record<string, unknown>).narrationForceEnabled ?? (next as Record<string, unknown>).narration_force_enabled)
  ;(next as Record<string, unknown>).narration_force_enabled = next.narrationForceEnabled ? 1 : 0
  const chatFontScale = normalizeChatFontScale((next as Record<string, unknown>).chatFontScale ?? (next as Record<string, unknown>).chat_font_scale)
  ;(next as Record<string, unknown>).chatFontScale = chatFontScale
  ;(next as Record<string, unknown>).chat_font_scale = chatFontScale
  next.dynamicWorldEnabled = readBooleanFlag((next as Record<string, unknown>).dynamicWorldEnabled ?? (next as Record<string, unknown>).dynamic_world_enabled)
  ;(next as Record<string, unknown>).dynamic_world_enabled = next.dynamicWorldEnabled ? 1 : 0
  next.replyPipelineMode = resolveSessionReplyPipelineMode(next as Record<string, unknown>)
  ;(next as Record<string, unknown>).reply_pipeline_mode = next.replyPipelineMode
  next.tempModel = next.tempModel ?? next.temp_model ?? ''
  next.temp_model = next.tempModel
  next.tempPreset = next.tempPreset ?? next.temp_preset ?? ''
  next.temp_preset = next.tempPreset
  return next
}

export function normalizeChatSessionParticipant(participant: ChatSessionParticipant): ChatSessionParticipant {
  const next = { ...participant }
  next.id = String(next.id || '').trim()
  next.sessionId = String(next.sessionId ?? next.session_id ?? '').trim()
  next.session_id = next.sessionId
  next.participantTargetId = normalizeChatTargetId(String(next.participantTargetId ?? next.participant_target_id ?? ''))
  next.participant_target_id = next.participantTargetId
  next.participantType = String(next.participantType ?? next.participant_type ?? 'char').trim() || 'char'
  next.participant_type = next.participantType
  next.displayOrder = Number(next.displayOrder ?? next.display_order ?? 0) || 0
  next.display_order = next.displayOrder
  next.replyProbability = Number(next.replyProbability ?? next.reply_probability ?? 100) || 100
  next.reply_probability = next.replyProbability
  next.role = String(next.role || 'member').trim() || 'member'
  next.characterStateMode = String(next.characterStateMode ?? next.character_state_mode ?? '') === 'independent_snapshot'
    ? 'independent_snapshot'
    : 'follow_main'
  next.character_state_mode = next.characterStateMode
  next.characterBranchId = next.characterStateMode === 'independent_snapshot'
    ? String(next.characterBranchId ?? next.character_branch_id ?? '').trim()
    : ''
  next.character_branch_id = next.characterBranchId
  next.createdAt = String(next.createdAt ?? next.created_at ?? '').trim()
  next.created_at = next.createdAt
  next.updatedAt = String(next.updatedAt ?? next.updated_at ?? '').trim()
  next.updated_at = next.updatedAt
  return next
}

function getNormalizedChatSession(session: any): any | null {
  if (!session || typeof session !== 'object') return null
  return normalizeChatSession(session)
}

export function getChatStoreCurrentSession(chatStore: any): any | null {
  return (
    chatStore?.current?.getCurrentSession?.()
    || chatStore?.getCurrentSession?.()
    || readChatStoreValue(chatStore?.current?.currentSession)
    || null
  )
}

/** 会话切换乐观跳转（2026-07-11）：正在切换中的目标 sessionId（空串=无切换在途），驱动消息区骨架屏。 */
export function getChatStoreSessionSwitchLoadingId(chatStore: any): string {
  return String(readChatStoreValue(chatStore?.current?.sessionSwitchLoadingId) || '')
}

export function getChatStoreCurrentTarget(chatStore: any): string {
  return String(
    chatStore?.current?.getWorkspaceCurrentTarget?.()
    || readChatStoreValue(chatStore?.current?.workspaceCurrentTarget)
    || readChatStoreValue(chatStore?.current?.currentChatTarget)
    || chatStore?.activeChatTargetId
    || chatStore?.currentChatTarget
    || ''
  )
}

export function getChatStoreActiveTargetId(chatStore: any): string {
  return String(
    chatStore?.current?.getActiveTargetId?.()
    || chatStore?.getActiveTargetId?.()
    || getChatStoreCurrentTarget(chatStore)
  )
}

export function getChatStoreActiveSessionId(chatStore: any): string {
  return String(
    chatStore?.current?.getActiveSessionId?.()
    || chatStore?.getActiveSessionId?.()
    || getChatStoreCurrentSession(chatStore)?.id
    || chatStore?.activeChatSessionId
    || ''
  )
}

export function getChatStoreActiveSessionTargetId(chatStore: any): string {
  return String(
    chatStore?.current?.getActiveSessionTargetId?.()
    || chatStore?.getActiveSessionTargetId?.()
    || getChatStoreCurrentSession(chatStore)?.target_id
    || getChatStoreCurrentSession(chatStore)?.targetId
    || getChatStoreActiveTargetId(chatStore)
  )
}

export function getChatSessionLoadedSummaryIds(session: any): string[] {
  const normalizedSession = getNormalizedChatSession(session)
  const raw = normalizedSession?.loadedSummaryIds
  if (Array.isArray(raw)) {
    return raw.map((item) => String(item || '').trim()).filter(Boolean)
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim()
    if (!trimmed) return []
    try {
      const parsed = JSON.parse(trimmed)
      return Array.isArray(parsed)
        ? parsed.map((item) => String(item || '').trim()).filter(Boolean)
        : [trimmed]
    } catch {
      return [trimmed]
    }
  }
  return []
}

export function setChatSessionLoadedSummaryIds(session: any, ids: string[]): void {
  if (!session || typeof session !== 'object') return
  const nextIds = Array.isArray(ids)
    ? ids.map((item) => String(item || '').trim()).filter(Boolean)
    : []
  session.loadedSummaryIds = nextIds as unknown as string
  session.loaded_summary_ids = nextIds as unknown as string
}

export function getChatSessionVirtualSceneName(session: any): string {
  return String(getNormalizedChatSession(session)?.virtualSceneName || '').trim()
}

export function getChatSessionVirtualSceneDesc(session: any): string {
  return String(getNormalizedChatSession(session)?.virtualSceneDesc || '').trim()
}

export function getChatSessionBoundAlias(session: any): string {
  return String(getNormalizedChatSession(session)?.boundAlias || '').trim()
}

// 提调可见性口径（正式真值 · 2026-06-27 拍板 P21）：并集——只要任一候选角色可见该消息，提调即可见；
// 仅当「所有候选角色都被隐藏」时该消息才对提调不可见。hiddenForCharacterIds 是黑名单（列出看不到该消息的角色 id）。
// 边界：候选为空、黑名单为空时一律可见（保守不隐藏）。本 helper 为口径载体；投影热路径接入（把候选角色 id
// 穿进投影构造收窄）留待 R3 呈现层落地，详见 docs/features/chat/DEVELOPMENT.md「提调可见性口径」。
export function isMessageVisibleToDirector(
  hiddenForCharacterIds: readonly string[] | null | undefined,
  candidateCharacterIds: readonly string[]
): boolean {
  const hidden = hiddenForCharacterIds || []
  if (!hidden.length) return true
  if (!candidateCharacterIds.length) return true
  const hiddenSet = new Set(hidden.map((id) => String(id)))
  // 任一候选角色不在黑名单 → 该角色可见 → 提调可见（并集）
  return candidateCharacterIds.some((id) => !hiddenSet.has(String(id)))
}

export function getChatSessionVirtualScene(session: any): Record<string, unknown> {
  const normalizedSession = getNormalizedChatSession(session)
  let virtualLocationLarge = trimText(normalizedSession?.virtualLocationLarge ?? normalizedSession?.virtual_location_large)
  let virtualLocationMiddle = trimText(normalizedSession?.virtualLocationMiddle ?? normalizedSession?.virtual_location_middle)
  let virtualLocationSmall = trimText(normalizedSession?.virtualLocationSmall ?? normalizedSession?.virtual_location_small)
  const legacyLocation = trimText(normalizedSession?.virtualLocation ?? normalizedSession?.virtual_location)
  if (!virtualLocationLarge && !virtualLocationMiddle && !virtualLocationSmall && legacyLocation) {
    const legacyParts = splitLegacyVirtualSceneLocation(legacyLocation)
    virtualLocationLarge = legacyParts.large
    virtualLocationMiddle = legacyParts.middle
    virtualLocationSmall = legacyParts.small
  }
  const virtualLocation = composeVirtualSceneLocationLabel(
    virtualLocationLarge,
    virtualLocationMiddle,
    virtualLocationSmall,
    legacyLocation
  )
  return {
    virtualSceneName: String(normalizedSession?.virtualSceneName || '').trim(),
    virtualSceneDesc: String(normalizedSession?.virtualSceneDesc || '').trim(),
    virtualLocationLarge,
    virtualLocationMiddle,
    virtualLocationSmall,
    virtualLocation,
    virtualSceneWorldId: String(normalizedSession?.virtualSceneWorldId || '').trim(),
    virtualLocationSheetId: String(normalizedSession?.virtualLocationSheetId || '').trim(),
    virtualLocationFeatureId: String(normalizedSession?.virtualLocationFeatureId || '').trim(),
    worldId: String(normalizedSession?.worldId || '').trim(),
    worldDefaultMapSheetId: String(normalizedSession?.worldDefaultMapSheetId || '').trim(),
    worldMapSheets: Array.isArray(normalizedSession?.worldMapSheets) ? normalizedSession.worldMapSheets : [],
    curtainMapSheetId: String(normalizedSession?.curtainMapSheetId || '').trim(),
    virtualRealLocation: String(normalizedSession?.virtualRealLocation || '').trim(),
    virtualTime: String(normalizedSession?.virtualTime || '').trim(),
    virtualTimeAnchor: Number(normalizedSession?.virtualTimeAnchor || 0) || 0,
    virtualTimeBase: Number(normalizedSession?.virtualTimeBase || 0) || 0,
    virtualTimeRate: normalizedSession?.virtualTimeRate === 0 ? 0 : Number(normalizedSession?.virtualTimeRate || 1),
    virtualWeather: String(normalizedSession?.virtualWeather || '').trim(),
    virtualWeatherMode: String(normalizedSession?.virtualWeatherMode || 'real').trim() || 'real'
  }
}

export function getChatStoreCurrentMessages(chatStore: any): any[] {
  const messages = typeof chatStore?.current?.getCurrentMessages === 'function'
    ? chatStore.current.getCurrentMessages()
    : typeof chatStore?.getCurrentMessages === 'function'
      ? chatStore.getCurrentMessages()
      : readChatStoreValue(chatStore?.current?.currentMessages) ?? chatStore?.currentMessages
  return Array.isArray(messages) ? messages : []
}

export function getChatStoreDisplayMessages(chatStore: any, targetId?: string): any[] {
  const resolvedTargetId = String(targetId || getChatStoreActiveTargetId(chatStore) || '')
  const messages = typeof chatStore?.current?.getDisplayMessages === 'function'
    ? chatStore.current.getDisplayMessages(resolvedTargetId)
    : typeof chatStore?.getDisplayMessages === 'function'
      ? chatStore.getDisplayMessages(resolvedTargetId)
      : getChatStoreCurrentMessages(chatStore)
  return Array.isArray(messages) ? messages : []
}

export function getChatStoreEntityMap<T>(chatStore: any, key: string): T {
  return (
    readChatStoreValue<T>(chatStore?.entities?.[key])
    ?? chatStore?.[key]
    ?? {} as T
  )
}

export function getChatStoreSummaryList<T>(chatStore: any, key: string): T[] {
  const list = readChatStoreValue<T[]>(chatStore?.summaries?.[key])
    ?? chatStore?.[key]
  return Array.isArray(list) ? list : []
}

export function findChatSummaryRecordById(chatStore: any, summaryId: string): LoadedChatSummaryRecord | null {
  const id = String(summaryId || '').trim()
  if (!id) return null

  const small = getChatStoreSummaryList<any>(chatStore, 'smallSummaries')
    .find((item: any) => String(item?.id || '') === id)
  if (small) {
    return {
      id,
      name: String(small.name || small.title || '小总结'),
      content: String(small.content || ''),
      kind: 'small'
    }
  }

  const big = getChatStoreSummaryList<any>(chatStore, 'bigSummaries')
    .find((item: any) => String(item?.id || '') === id)
  if (big) {
    return {
      id,
      name: String(big.name || big.title || '大总结'),
      content: String(big.content || ''),
      kind: 'big'
    }
  }

  const legacy = getChatStoreSummaryList<any>(chatStore, 'summaryLibrary')
    .find((item: any) => String(item?.id || '') === id)
  if (legacy) {
    return {
      id,
      name: String(legacy.name || legacy.title || id),
      content: String(legacy.content || ''),
      kind: 'legacy'
    }
  }

  return null
}

export function getChatStoreLoadedSummaryRecords(chatStore: any, session?: any): LoadedChatSummaryRecord[] {
  const loadedSummaryIds = getChatSessionLoadedSummaryIds(session ?? getChatStoreCurrentSession(chatStore))
  return loadedSummaryIds.map((id) => findChatSummaryRecordById(chatStore, id) || {
    id: String(id),
    name: String(id),
    content: '',
    kind: 'legacy' as const
  })
}

export function getChatStoreAbortController(chatStore: any): AbortController | null {
  return readChatStoreValue<AbortController | null>(chatStore?.runtime?.currentAbortController)
    ?? chatStore?.currentAbortController
    ?? null
}

export function getChatStoreTyping(chatStore: any): boolean {
  return Boolean(readChatStoreValue(chatStore?.runtime?.isTyping) ?? chatStore?.isTyping)
}

export function setChatStoreTyping(chatStore: any, value: boolean): void {
  if (typeof chatStore?.setTyping === 'function') {
    chatStore.setTyping(value)
    return
  }
  if (chatStore?.runtime && 'isTyping' in chatStore.runtime) {
    const runtimeTyping = chatStore.runtime.isTyping
    if (runtimeTyping && typeof runtimeTyping === 'object' && 'value' in runtimeTyping) {
      runtimeTyping.value = value
      return
    }
    chatStore.runtime.isTyping = value
    return
  }
  if (chatStore) {
    chatStore.isTyping = value
  }
}

export function resolveChatSessionTargetId(session: Partial<ChatSession> & { targetId?: string } | null | undefined): string {
  if (!session || typeof session !== 'object') return ''
  return normalizeChatTargetId(String(session.targetId ?? session.target_id ?? ''))
}

export function normalizeChatMessageVersionList(message: ChatMessage): ChatMessage {
  const next = { ...message }
  const messageKind = String(
    (next as ChatMessage & { messageKind?: unknown }).messageKind
    ?? (next as ChatMessage & { message_kind?: unknown }).message_kind
    ?? (next.role === 'system' ? 'system' : 'chat')
  ).trim() || 'chat'
  ;(next as ChatMessage & { messageKind?: string }).messageKind = messageKind
  ;(next as ChatMessage & { message_kind?: string }).message_kind = messageKind
  const rawVersionList = (next as ChatMessage & { versionList?: unknown; versionsJson?: unknown; versions_json?: unknown }).versionList
    ?? (next as ChatMessage & { versionsJson?: unknown }).versionsJson
    ?? (next as ChatMessage & { versions_json?: unknown }).versions_json
  const versionList = Array.isArray(rawVersionList) ? rawVersionList : []
  ;(next as ChatMessage & { versionList?: unknown[] }).versionList = versionList
  ;(next as ChatMessage & { versionsJson?: unknown[] }).versionsJson = versionList
  ;(next as ChatMessage & { versions_json?: unknown[] }).versions_json = versionList

  const activeVersionIndex = Number((next as ChatMessage & { activeVersionIndex?: unknown; active_version_index?: unknown }).activeVersionIndex
    ?? (next as ChatMessage & { active_version_index?: unknown }).active_version_index)
  const safeIndex = Number.isInteger(activeVersionIndex) ? activeVersionIndex : Math.max(versionList.length - 1, 0)
  ;(next as ChatMessage & { activeVersionIndex?: number }).activeVersionIndex = safeIndex
  ;(next as ChatMessage & { active_version_index?: number }).active_version_index = safeIndex
  const autoWriteHidden = Boolean(
    (next as ChatMessage & { autoWriteHidden?: unknown }).autoWriteHidden
    ?? (next as ChatMessage & { auto_write_hidden?: unknown }).auto_write_hidden
  )
  ;(next as ChatMessage & { autoWriteHidden?: boolean }).autoWriteHidden = autoWriteHidden
  ;(next as ChatMessage & { auto_write_hidden?: boolean }).auto_write_hidden = autoWriteHidden
  ;(next as ChatMessage & { autoWriteHiddenAt?: string }).autoWriteHiddenAt = String(
    (next as ChatMessage & { autoWriteHiddenAt?: unknown }).autoWriteHiddenAt
    ?? (next as ChatMessage & { auto_write_hidden_at?: unknown }).auto_write_hidden_at
    ?? ''
  )
  ;(next as ChatMessage & { auto_write_hidden_at?: string }).auto_write_hidden_at = (next as ChatMessage & { autoWriteHiddenAt?: string }).autoWriteHiddenAt
  ;(next as ChatMessage & { autoWriteBatchId?: string }).autoWriteBatchId = String(
    (next as ChatMessage & { autoWriteBatchId?: unknown }).autoWriteBatchId
    ?? (next as ChatMessage & { auto_write_batch_id?: unknown }).auto_write_batch_id
    ?? ''
  )
  ;(next as ChatMessage & { auto_write_batch_id?: string }).auto_write_batch_id = (next as ChatMessage & { autoWriteBatchId?: string }).autoWriteBatchId
  ;(next as ChatMessage & { autoWriteHiddenReason?: string }).autoWriteHiddenReason = String(
    (next as ChatMessage & { autoWriteHiddenReason?: unknown }).autoWriteHiddenReason
    ?? (next as ChatMessage & { auto_write_hidden_reason?: unknown }).auto_write_hidden_reason
    ?? ''
  )
  ;(next as ChatMessage & { auto_write_hidden_reason?: string }).auto_write_hidden_reason = (next as ChatMessage & { autoWriteHiddenReason?: string }).autoWriteHiddenReason
  ;(next as ChatMessage & { narrationProfileId?: string }).narrationProfileId = String(
    (next as ChatMessage & { narrationProfileId?: unknown }).narrationProfileId
    ?? (next as ChatMessage & { narration_profile_id?: unknown }).narration_profile_id
    ?? ''
  )
  ;(next as ChatMessage & { narration_profile_id?: string }).narration_profile_id = (next as ChatMessage & { narrationProfileId?: string }).narrationProfileId
  ;(next as ChatMessage & { narrationProfileName?: string }).narrationProfileName = String(
    (next as ChatMessage & { narrationProfileName?: unknown }).narrationProfileName
    ?? (next as ChatMessage & { narration_profile_name?: unknown }).narration_profile_name
    ?? ''
  )
  ;(next as ChatMessage & { narration_profile_name?: string }).narration_profile_name = (next as ChatMessage & { narrationProfileName?: string }).narrationProfileName
  ;(next as ChatMessage & { narrationProfileKind?: string }).narrationProfileKind = String(
    (next as ChatMessage & { narrationProfileKind?: unknown }).narrationProfileKind
    ?? (next as ChatMessage & { narration_profile_kind?: unknown }).narration_profile_kind
    ?? ''
  )
  ;(next as ChatMessage & { narration_profile_kind?: string }).narration_profile_kind = (next as ChatMessage & { narrationProfileKind?: string }).narrationProfileKind
  ;(next as ChatMessage & { messageSourceKind?: string }).messageSourceKind = String(
    (next as ChatMessage & { messageSourceKind?: unknown }).messageSourceKind
    ?? (next as ChatMessage & { message_source_kind?: unknown }).message_source_kind
    ?? ''
  )
  ;(next as ChatMessage & { message_source_kind?: string }).message_source_kind = (next as ChatMessage & { messageSourceKind?: string }).messageSourceKind
  ;(next as ChatMessage & { focusedActionGroupId?: string }).focusedActionGroupId = String(
    (next as ChatMessage & { focusedActionGroupId?: unknown }).focusedActionGroupId
    ?? (next as ChatMessage & { focused_action_group_id?: unknown }).focused_action_group_id
    ?? ''
  )
  ;(next as ChatMessage & { focused_action_group_id?: string }).focused_action_group_id = (next as ChatMessage & { focusedActionGroupId?: string }).focusedActionGroupId
  ;(next as ChatMessage & { focusedActionVisibility?: string }).focusedActionVisibility = String(
    (next as ChatMessage & { focusedActionVisibility?: unknown }).focusedActionVisibility
    ?? (next as ChatMessage & { focused_action_visibility?: unknown }).focused_action_visibility
    ?? ''
  )
  ;(next as ChatMessage & { focused_action_visibility?: string }).focused_action_visibility = (next as ChatMessage & { focusedActionVisibility?: string }).focusedActionVisibility
  const includeInContext: unknown = (next as ChatMessage & { includeInContext?: unknown }).includeInContext
    ?? (next as ChatMessage & { include_in_context?: unknown }).include_in_context
  const normalizedIncludeInContext = !(includeInContext === false || includeInContext === 0 || includeInContext === '0' || includeInContext === 'false')
  ;(next as ChatMessage & { includeInContext?: boolean }).includeInContext = normalizedIncludeInContext
  ;(next as ChatMessage & { include_in_context?: boolean }).include_in_context = normalizedIncludeInContext
  return next
}

export function normalizeChatMessageForTarget(
  targetId: string,
  message: ChatMessage,
  characterName = ''
): ChatMessage {
  const normalizedTargetId = normalizeChatTargetId(targetId)
  const next = normalizeChatMessageVersionList(message)
  next.envDate = String(next.envDate ?? next.env_date ?? '').trim()
  next.env_date = next.envDate
  next.envWeather = String(next.envWeather ?? next.env_weather ?? '').trim()
  next.env_weather = next.envWeather
  next.envLocation = String(next.envLocation ?? next.env_location ?? '').trim()
  next.env_location = next.envLocation

  const memberName = String(next.memberName ?? next.member_name ?? '').trim()
  if (memberName) {
    next.memberName = memberName
    next.member_name = memberName
  }
  if (!(next as ChatMessage & { name?: string }).name && next.role === 'assistant' && memberName) {
    ;(next as ChatMessage & { name?: string }).name = memberName
  }

  if (!normalizedTargetId || normalizedTargetId.startsWith('group_') || normalizedTargetId.startsWith('crowd_')) {
    return next
  }

  const rawRole = String(next.role || '').trim()
  if (rawRole === normalizedTargetId) {
    next.role = 'assistant'
  }

  if (!(next as ChatMessage & { name?: string }).name && next.role === 'assistant' && characterName) {
    ;(next as ChatMessage & { name?: string }).name = characterName
  }

  return next
}

export function createChatTargetEntity(targetId: string): ChatTargetEntity | null {
  const normalized = normalizeChatTargetId(targetId)
  if (!normalized) return null
  return {
    id: normalized,
    kind: resolveChatTargetKind(normalized)
  }
}

export function buildChatSessionPatch(changes: Record<string, any>): Record<string, unknown> {
  const apiChanges: Record<string, unknown> = { ...changes }
  if (changes.archiveName !== undefined) {
    apiChanges.archive_name = String(changes.archiveName || '')
    delete apiChanges.archiveName
  }
  if (changes.archiveCategory !== undefined) {
    apiChanges.archive_category = String(changes.archiveCategory || '')
    delete apiChanges.archiveCategory
  }
  if (changes.conversationAvatarPath !== undefined) {
    apiChanges.conversation_avatar_path = String(changes.conversationAvatarPath || '')
    delete apiChanges.conversationAvatarPath
  }
  if (changes.conversationEmoji !== undefined) {
    apiChanges.conversation_emoji = String(changes.conversationEmoji || '')
    delete apiChanges.conversationEmoji
  }
  if (changes.loaded_summary_ids !== undefined) {
    apiChanges.loaded_summary_ids = changes.loaded_summary_ids
  }
  if (changes.loadedSummaryIds !== undefined) {
    apiChanges.loaded_summary_ids = changes.loadedSummaryIds
    delete apiChanges.loadedSummaryIds
  }
  delete apiChanges.capsResidueState
  delete apiChanges.capsResidueStateJson
  delete apiChanges.caps_residue_state_json
  if (changes.virtualSceneName !== undefined) {
    apiChanges.virtual_scene_name = changes.virtualSceneName
    delete apiChanges.virtualSceneName
  }
  if (changes.virtualSceneDesc !== undefined) {
    apiChanges.virtual_scene_desc = changes.virtualSceneDesc
    delete apiChanges.virtualSceneDesc
  }
  if (changes.virtualLocationLarge !== undefined) {
    apiChanges.virtual_location_large = changes.virtualLocationLarge
    delete apiChanges.virtualLocationLarge
  }
  if (changes.virtualLocationMiddle !== undefined) {
    apiChanges.virtual_location_middle = changes.virtualLocationMiddle
    delete apiChanges.virtualLocationMiddle
  }
  if (changes.virtualLocationSmall !== undefined) {
    apiChanges.virtual_location_small = changes.virtualLocationSmall
    delete apiChanges.virtualLocationSmall
  }
  if (changes.virtualLocation !== undefined) {
    const hasStructuredLocation =
      changes.virtualLocationLarge !== undefined
      || changes.virtualLocationMiddle !== undefined
      || changes.virtualLocationSmall !== undefined
      || changes.virtual_location_large !== undefined
      || changes.virtual_location_middle !== undefined
      || changes.virtual_location_small !== undefined
    if (!hasStructuredLocation) {
      const legacyParts = splitLegacyVirtualSceneLocation(changes.virtualLocation)
      apiChanges.virtual_location_large = legacyParts.large
      apiChanges.virtual_location_middle = legacyParts.middle
      apiChanges.virtual_location_small = legacyParts.small
    }
    delete apiChanges.virtualLocation
  }
  if (changes.virtualRealLocation !== undefined) {
    apiChanges.virtual_real_location = changes.virtualRealLocation
    delete apiChanges.virtualRealLocation
  }
  if (changes.virtualTime !== undefined) {
    apiChanges.virtual_time = changes.virtualTime
    delete apiChanges.virtualTime
  }
  if (changes.virtualTimeAnchor !== undefined) {
    apiChanges.virtual_time_anchor = changes.virtualTimeAnchor
    delete apiChanges.virtualTimeAnchor
  }
  if (changes.virtualTimeBase !== undefined) {
    apiChanges.virtual_time_base = changes.virtualTimeBase
    delete apiChanges.virtualTimeBase
  }
  if (changes.virtualTimeRate !== undefined) {
    apiChanges.virtual_time_rate = changes.virtualTimeRate
    delete apiChanges.virtualTimeRate
  }
  if (changes.virtualWeather !== undefined) {
    apiChanges.virtual_weather = changes.virtualWeather
    delete apiChanges.virtualWeather
  }
  if (changes.virtualWeatherMode !== undefined) {
    apiChanges.virtual_weather_mode = changes.virtualWeatherMode
    delete apiChanges.virtualWeatherMode
  }
  const hasAnyLocationChange =
    changes.virtualLocationLarge !== undefined
    || changes.virtualLocationMiddle !== undefined
    || changes.virtualLocationSmall !== undefined
    || changes.virtualLocation !== undefined
    || changes.virtual_location_large !== undefined
    || changes.virtual_location_middle !== undefined
    || changes.virtual_location_small !== undefined
    || changes.virtual_location !== undefined
  const composedLocation = composeVirtualSceneLocationLabel(
    apiChanges.virtual_location_large ?? changes.virtual_location_large ?? changes.virtualLocationLarge,
    apiChanges.virtual_location_middle ?? changes.virtual_location_middle ?? changes.virtualLocationMiddle,
    apiChanges.virtual_location_small ?? changes.virtual_location_small ?? changes.virtualLocationSmall,
    apiChanges.virtual_location_small ?? changes.virtualLocation ?? changes.virtual_location ?? ''
  )
  if (hasAnyLocationChange) {
    apiChanges.virtual_location = composedLocation
  }
  if (changes.boundAlias !== undefined) {
    apiChanges.bound_alias = changes.boundAlias
    delete apiChanges.boundAlias
  }
  if (changes.narrationFrequency !== undefined) {
    apiChanges.narration_frequency = changes.narrationFrequency
    delete apiChanges.narrationFrequency
  }
  if (changes.narrationTemperature !== undefined) {
    apiChanges.narration_temperature = changes.narrationTemperature
    delete apiChanges.narrationTemperature
  }
  if (changes.narrationProfiles !== undefined) {
    apiChanges.narration_profiles = Array.isArray(changes.narrationProfiles)
      ? JSON.stringify(changes.narrationProfiles)
      : changes.narrationProfiles
    delete apiChanges.narrationProfiles
  }
  if (changes.narrationForceEnabled !== undefined) {
    apiChanges.narration_force_enabled = readBooleanFlag(changes.narrationForceEnabled) ? 1 : 0
    delete apiChanges.narrationForceEnabled
  }
  if (changes.narration_force_enabled !== undefined) {
    apiChanges.narration_force_enabled = readBooleanFlag(changes.narration_force_enabled) ? 1 : 0
  }
  if (changes.chatFontScale !== undefined) {
    apiChanges.chat_font_scale = normalizeChatFontScale(changes.chatFontScale)
    delete apiChanges.chatFontScale
  }
  if (changes.replyPipelineMode !== undefined) {
    apiChanges.reply_pipeline_mode = normalizeChatSessionReplyPipelineMode(changes.replyPipelineMode)
    delete apiChanges.replyPipelineMode
  }
  if (changes.reply_pipeline_mode !== undefined) {
    apiChanges.reply_pipeline_mode = normalizeChatSessionReplyPipelineMode(changes.reply_pipeline_mode)
  }
  return apiChanges
}

export function extractChatSnapshotPayload(data: ServerData | ChatSnapshotPayload): ChatSnapshotPayload {
  const root = data && typeof data === 'object' ? data : {}
  return {
    summaryLibrary: Array.isArray(root.summaryLibrary) ? root.summaryLibrary : [],
    smallSummaries: Array.isArray(root.smallSummaries) ? root.smallSummaries : [],
    bigSummaries: Array.isArray(root.bigSummaries) ? root.bigSummaries : [],
    chatSessions: Array.isArray(root.chatSessions) ? root.chatSessions : [],
    chatSessionParticipants: Array.isArray(root.chatSessionParticipants) ? root.chatSessionParticipants : [],
    chatSessionTemporaryCharacters: Array.isArray(root.chatSessionTemporaryCharacters) ? root.chatSessionTemporaryCharacters : [],
    chatSessionTemporaryEntities: Array.isArray(root.chatSessionTemporaryEntities) ? root.chatSessionTemporaryEntities : [],
    chatMessages: Array.isArray(root.chatMessages) ? root.chatMessages : [],
    chatMessageNotes: Array.isArray(root.chatMessageNotes) ? root.chatMessageNotes : [],
    chatPromptLogs: Array.isArray(root.chatPromptLogs) ? root.chatPromptLogs : [],
    currentChatTarget: typeof root.currentChatTarget === 'string' ? root.currentChatTarget : '',
    currentSession: root.currentSession ?? null,
    currentMessages: Array.isArray(root.currentMessages) ? root.currentMessages : []
  }
}

function parseJsonArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value
  if (typeof value !== 'string') return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function parseJsonObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>
  if (typeof value !== 'string') return {}
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {}
  } catch {
    return {}
  }
}

export function normalizeSessionTemporaryEntity(input: ChatSessionTemporaryEntity): ChatSessionTemporaryEntity {
  const source = input && typeof input === 'object' ? input : {} as ChatSessionTemporaryEntity
  const aliases = parseJsonArray(source.aliases ?? source.aliasesJson ?? source.aliases_json)
    .map((item) => String(item || '').trim())
    .filter(Boolean)
  const tags = parseJsonArray(source.tags ?? source.tagsJson ?? source.tags_json)
    .map((item) => String(item || '').trim())
    .filter(Boolean)
  const sourceLedger = parseJsonArray(source.sourceLedger ?? source.sourceLedgerJson ?? source.source_ledger_json)
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object' && !Array.isArray(item)))
  const persistedTarget = parseJsonObject(source.persistedTarget ?? source.persistedTargetJson ?? source.persisted_target_json)
  return {
    ...source,
    id: String(source.id || '').trim(),
    session_id: String(source.session_id ?? source.sessionId ?? '').trim(),
    sessionId: String(source.sessionId ?? source.session_id ?? '').trim(),
    kind: String(source.kind || 'character').trim() || 'character',
    name: String(source.name || '').trim(),
    aliases,
    aliases_json: JSON.stringify(aliases),
    aliasesJson: JSON.stringify(aliases),
    markdown: String(source.markdown || '').trim(),
    tags,
    tags_json: JSON.stringify(tags),
    tagsJson: JSON.stringify(tags),
    sourceLedger,
    source_ledger_json: JSON.stringify(sourceLedger),
    sourceLedgerJson: JSON.stringify(sourceLedger),
    status: String(source.status || 'active').trim() || 'active',
    persistedTarget,
    persisted_target_json: JSON.stringify(persistedTarget),
    persistedTargetJson: JSON.stringify(persistedTarget),
    created_at: String(source.created_at ?? source.createdAt ?? '').trim(),
    createdAt: String(source.createdAt ?? source.created_at ?? '').trim(),
    updated_at: String(source.updated_at ?? source.updatedAt ?? '').trim(),
    updatedAt: String(source.updatedAt ?? source.updated_at ?? '').trim()
  }
}

export function normalizeSessionTemporaryCharacter(input: ChatSessionTemporaryCharacter): ChatSessionTemporaryCharacter {
  const source = input && typeof input === 'object' ? input : {} as ChatSessionTemporaryCharacter
  const parseList = (value: unknown): string[] => {
    if (Array.isArray(value)) return value.map(item => String(item || '').trim()).filter(Boolean)
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value)
        if (Array.isArray(parsed)) return parsed.map(item => String(item || '').trim()).filter(Boolean)
      } catch {}
    }
    return []
  }
  const parseLedger = (value: unknown): Array<Record<string, unknown>> => {
    if (Array.isArray(value)) return value.filter(item => item && typeof item === 'object') as Array<Record<string, unknown>>
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value)
        if (Array.isArray(parsed)) return parsed.filter(item => item && typeof item === 'object') as Array<Record<string, unknown>>
      } catch {}
    }
    return []
  }
  return {
    ...source,
    id: String(source.id || '').trim(),
    session_id: String(source.session_id || source.sessionId || '').trim(),
    sessionId: String(source.sessionId || source.session_id || '').trim(),
    name: String(source.name || '').trim(),
    aliases: parseList(source.aliases ?? source.aliasesJson ?? source.aliases_json),
    markdown: String(source.markdown || ''),
    sourceLedger: parseLedger(source.sourceLedger ?? source.sourceLedgerJson ?? source.source_ledger_json),
    lockedFields: parseList(source.lockedFields ?? source.lockedFieldsJson ?? source.locked_fields_json),
    status: String(source.status || 'active'),
    createdAt: String(source.createdAt || source.created_at || ''),
    updatedAt: String(source.updatedAt || source.updated_at || '')
  }
}

export function extractChatSummarySnapshotPayload(data: ServerData | ChatSnapshotPayload): Pick<ChatSnapshotPayload, 'summaryLibrary' | 'smallSummaries' | 'bigSummaries'> {
  const root = data && typeof data === 'object' ? data : {}
  return {
    summaryLibrary: Array.isArray(root.summaryLibrary) ? root.summaryLibrary : [],
    smallSummaries: Array.isArray(root.smallSummaries) ? root.smallSummaries : [],
    bigSummaries: Array.isArray(root.bigSummaries) ? root.bigSummaries : []
  }
}

export function buildChatSummaryExportPayload(summaryLibrary: unknown[], summaryIdCounter: number): ChatSummaryExportPayload {
  return {
    summaryLibrary: Array.isArray(summaryLibrary) ? summaryLibrary : [],
    summaryIdCounter: Number.isFinite(Number(summaryIdCounter)) ? Number(summaryIdCounter) : 1
  }
}

export function prependChatCollectionItem<T>(items: T[], item: T): T[] {
  return [item, ...(Array.isArray(items) ? items : [])]
}

export function appendChatCollectionItem<T>(items: T[], item: T): T[] {
  return [...(Array.isArray(items) ? items : []), item]
}

export function patchChatCollectionItem<T extends { id?: string }>(
  items: T[],
  id: string,
  changes: Partial<T>
): T[] {
  return (Array.isArray(items) ? items : []).map((item) => (
    String(item?.id || '') === String(id || '')
      ? { ...item, ...changes }
      : item
  ))
}

export function removeChatCollectionItem<T extends { id?: string }>(items: T[], id: string): T[] {
  return (Array.isArray(items) ? items : []).filter((item) => String(item?.id || '') !== String(id || ''))
}

export function removeChatArchiveItems<T extends { id?: string }>(items: T[], ids: string[]): T[] {
  const idSet = new Set((Array.isArray(ids) ? ids : []).map((item) => String(item || '')))
  return (Array.isArray(items) ? items : []).filter((item) => !idSet.has(String(item?.id || '')))
}

async function ensureOk(response: Response, fallbackMessage: string) {
  if (response.ok) return
  let detail = ''
  try {
    const rawText = await response.text()
    if (rawText) {
      try {
        const parsed = JSON.parse(rawText) as { error?: unknown; message?: unknown }
        detail = String(parsed?.error ?? parsed?.message ?? '').trim()
      } catch {
        // HTML 错误页（如 Express「Cannot POST」404/网关 502）不当错误详情裸奔进 UI，回退 fallbackMessage
        detail = /^\s*<(!doctype|html)/i.test(rawText) ? '' : rawText.trim().slice(0, 200)
      }
    }
  } catch {
    detail = ''
  }
  const error = new Error(detail || fallbackMessage) as Error & { status?: number }
  error.status = response.status
  throw error
}

function readCreatedMessageId(responseBody: unknown): number {
  const id = Number((responseBody as { id?: unknown } | null)?.id)
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error('发送消息失败: 响应缺少消息编号')
  }
  return id
}

function encodeRecallActivityLogPayload<T extends ChatRecallActivityLogCreatePayload | ChatRecallActivityLogBindPayload>(payload: T): T {
  if (!payload?.activity) return payload
  return {
    ...payload,
    activity: encodeRecallActivityLogForTransport(payload.activity)
  }
}

function buildChatMessagePageQuery(options?: ChatSessionMessagePageOptions): string {
  const query = new URLSearchParams()
  const limit = Math.floor(Number(options?.limit) || 0)
  const beforeId = Math.floor(Number(options?.beforeId) || 0)
  if (limit > 0) query.set('limit', String(limit))
  if (beforeId > 0) query.set('beforeId', String(beforeId))
  const suffix = query.toString()
  return suffix ? `?${suffix}` : ''
}

export async function fetchChatSessionBundle(targetId: string, options?: ChatSessionMessagePageOptions): Promise<ChatSessionBundle> {
  const normalizedTargetId = normalizeChatTargetId(targetId)
  const response = await fetch(`${API.chatSession(normalizedTargetId)}${buildChatMessagePageQuery(options)}`)
  await ensureOk(response, '加载聊天会话失败')
  return await response.json() as ChatSessionBundle
}

export async function createChatSession(payload: ChatSessionCreatePayload): Promise<ChatSessionBundle> {
  const response = await fetch(API.CHAT_SESSIONS, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  await ensureOk(response, '创建会话失败')
  return await response.json() as ChatSessionBundle
}

export async function patchChatSessionCharacterState(
  sessionId: string,
  characterId: string,
  changes: Record<string, unknown>
): Promise<Record<string, any>> {
  const response = await fetch(API.chatSessionCharacterState(sessionId, characterId), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ changes })
  })
  await ensureOk(response, '更新会话角色分支失败')
  return await response.json() as Record<string, any>
}

export async function fetchChatSessionBundleById(sessionId: string, options?: ChatSessionMessagePageOptions): Promise<ChatSessionBundle> {
  const response = await fetch(`${API.chatSessionById(sessionId)}${buildChatMessagePageQuery(options)}`)
  await ensureOk(response, '加载聊天会话失败')
  return await response.json() as ChatSessionBundle
}

export async function fetchAgentContextBundle(input: {
  sessionId: string
  agentKind: AgentContextAgentKind
  characterId?: string
  anchorMessageId?: number
  userText?: string
  roundCandidateIds?: string[]
  forcedCharacterIds?: string[]
}): Promise<AgentContextBundle> {
  const response = await fetch(API.chatSessionAgentContextResolve(input.sessionId), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      agentKind: input.agentKind,
      characterId: input.characterId || '',
      anchorMessageId: input.anchorMessageId || 0,
      userText: input.userText || '',
      roundCandidateIds: input.roundCandidateIds || [],
      forcedCharacterIds: input.forcedCharacterIds || []
    })
  })
  await ensureOk(response, '加载 Agent 原始可见上下文失败')
  return await response.json() as AgentContextBundle
}

/** 星依总agent常驻会话：存在即返回、不存在才创建（服务端幂等，kind='xingyi'，不进联系人侧栏）。 */
export async function ensureXingyiChatSession(): Promise<ChatSessionBundle> {
  const response = await fetch(`${API.CHAT_SESSIONS}/xingyi/ensure`, { method: 'POST' })
  await ensureOk(response, '打开星依会话失败')
  return await response.json() as ChatSessionBundle
}

/** 星依 /resume 清单项：展示名=首条用户输入前20字（服务端算好，不落库）。 */
export interface XingyiSessionSummary {
  id: string
  name: string
  messageCount: number
  createdAt: string
  updatedAt: string
}

/** 星依 /clear：新开一条星依会话（旧会话保留可 /resume 找回；最新会话为空时服务端直接复用）。 */
export async function createXingyiChatSession(): Promise<ChatSessionBundle> {
  const response = await fetch(`${API.CHAT_SESSIONS}/xingyi/new`, { method: 'POST' })
  await ensureOk(response, '开启新对话失败')
  return await response.json() as ChatSessionBundle
}

/** 星依 /resume：过往会话清单（含当前活动会话，按活跃时间倒序）。 */
export async function listXingyiChatSessions(): Promise<XingyiSessionSummary[]> {
  const response = await fetch(`${API.CHAT_SESSIONS}/xingyi/list`)
  await ensureOk(response, '读取过往对话失败')
  const data = await response.json() as { sessions?: XingyiSessionSummary[] }
  return Array.isArray(data?.sessions) ? data.sessions : []
}

/** 星依 /resume 选中：把目标会话提为活动会话（服务端 touch updated_at）并返回完整 bundle。 */
export async function activateXingyiChatSession(sessionId: string): Promise<ChatSessionBundle> {
  const response = await fetch(`${API.CHAT_SESSIONS}/xingyi/${encodeURIComponent(sessionId)}/activate`, { method: 'POST' })
  await ensureOk(response, '恢复过往对话失败')
  return await response.json() as ChatSessionBundle
}

/** 工作区专业Agent种类（编剧/舆图师），与服务端 chat_sessions.kind 取值一致；单一真值见 shared/agentSessionKinds.ts。 */
export type WorkspaceAgentSessionKind = WorkspaceAgentKind

/** 工作区专业Agent常驻会话：按 kind+targetId（世界或世界:图纸）幂等取/建；不读星依会话。 */
export async function ensureWorkspaceAgentChatSession(kind: WorkspaceAgentSessionKind, targetId: string, title: string): Promise<ChatSessionBundle> {
  const response = await fetch(`${API.CHAT_SESSIONS}/workspace-agent/ensure`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind, targetId, title })
  })
  await ensureOk(response, '打开专业会话失败')
  return await response.json() as ChatSessionBundle
}

/** 工作区专业Agent"新建对话"：同scope最新会话为空则复用，否则新开一条。 */
export async function createWorkspaceAgentChatSession(kind: WorkspaceAgentSessionKind, targetId: string, title: string): Promise<ChatSessionBundle> {
  const response = await fetch(`${API.CHAT_SESSIONS}/workspace-agent/new`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind, targetId, title })
  })
  await ensureOk(response, '开启新对话失败')
  return await response.json() as ChatSessionBundle
}

/** 工作区专业Agent"历史对话"清单：范围收窄到当前 kind+targetId。 */
export async function listWorkspaceAgentChatSessions(kind: WorkspaceAgentSessionKind, targetId: string): Promise<XingyiSessionSummary[]> {
  const response = await fetch(`${API.CHAT_SESSIONS}/workspace-agent/list?kind=${encodeURIComponent(kind)}&targetId=${encodeURIComponent(targetId)}`)
  await ensureOk(response, '读取过往对话失败')
  const data = await response.json() as { sessions?: XingyiSessionSummary[] }
  return Array.isArray(data?.sessions) ? data.sessions : []
}

/** 工作区专业Agent"历史对话"选中：激活前服务端会校验 kind+targetId 与当前作用域一致。 */
export async function activateWorkspaceAgentChatSession(sessionId: string, kind: WorkspaceAgentSessionKind, targetId: string): Promise<ChatSessionBundle> {
  const response = await fetch(`${API.CHAT_SESSIONS}/workspace-agent/${encodeURIComponent(sessionId)}/activate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind, targetId })
  })
  await ensureOk(response, '恢复过往对话失败')
  return await response.json() as ChatSessionBundle
}

/** 星依日记化归档（2026-07-16 批次3）：日记视角——星依第一人称改写 or 客观第三人称记叙。 */
export type XingyiDiaryViewpoint = 'xingyi' | 'objective'

/** 读取当前本地工作区的日记视角设置（未设置过时服务端缺省 'xingyi'）。 */
export async function getXingyiDiaryViewpoint(): Promise<XingyiDiaryViewpoint> {
  const response = await fetch(API.XINGYI_DIARY_VIEWPOINT)
  await ensureOk(response, '读取星依日记视角设置失败')
  const data = await response.json() as { viewpoint?: string }
  return data?.viewpoint === 'objective' ? 'objective' : 'xingyi'
}

/** 保存日记视角设置（点选即生效，不需要额外保存按钮）。 */
export async function setXingyiDiaryViewpoint(viewpoint: XingyiDiaryViewpoint): Promise<void> {
  const response = await fetch(API.XINGYI_DIARY_VIEWPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ viewpoint })
  })
  await ensureOk(response, '保存星依日记视角设置失败')
}

export interface XingyiDiaryGenerateNowResult {
  dateStr: string
  viewpoint: XingyiDiaryViewpoint
}

/** 立即生成当前逻辑日的日记（05:00 换日；凌晨 00:00～04:59 仍归前一天）。 */
export async function triggerXingyiDiaryGenerateNow(): Promise<XingyiDiaryGenerateNowResult> {
  const response = await fetch(API.XINGYI_DIARY_GENERATE_NOW, { method: 'POST' })
  await ensureOk(response, '生成当前逻辑日的星依日记失败')
  const data = await response.json() as { dateStr?: string; viewpoint?: string }
  return { dateStr: String(data?.dateStr || ''), viewpoint: data?.viewpoint === 'objective' ? 'objective' : 'xingyi' }
}

export async function fetchChatMessagesForTransfer(targetId: string): Promise<ChatMessage[]> {
  const normalizedTargetId = normalizeChatTargetId(targetId)
  const response = await fetch(`${API.chatSession(normalizedTargetId)}?limit=5000`)
  await ensureOk(response, '读取当前聊天记录失败')
  const data = await response.json() as { messages?: ChatMessage[] }
  return Array.isArray(data.messages) ? data.messages : []
}

export async function fetchChatContextForTaskDispatch(targetId: string): Promise<{
  session: ChatSession | null
  messages: ChatMessage[]
}> {
  const normalizedTargetId = normalizeChatTargetId(targetId)
  const response = await fetch(API.chatSession(normalizedTargetId))
  await ensureOk(response, '读取任务上下文失败')
  const data = await response.json() as { session?: ChatSession | null; messages?: ChatMessage[] }
  return {
    session: data?.session ?? null,
    messages: Array.isArray(data?.messages) ? data.messages : []
  }
}

export async function copyChatMessagesToTarget(targetId: string, messages: ChatMessage[]): Promise<void> {
  const normalizedTargetId = normalizeChatTargetId(targetId)
  const sourceMessages = Array.isArray(messages) ? messages : []
  if (!sourceMessages.length) return
  const response = await fetch(API.chatMessagesBatchCopy(normalizedTargetId), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: sourceMessages.map((message) => ({
        role: message.role,
        messageKind: (message as ChatMessage & { messageKind?: string; message_kind?: string }).messageKind
          ?? (message as ChatMessage & { message_kind?: string }).message_kind
          ?? 'chat',
        content: message.content,
        time: message.time,
        envDate: (message as ChatMessage & { envDate?: string; env_date?: string }).envDate
          ?? (message as ChatMessage & { env_date?: string }).env_date
          ?? '',
        envWeather: (message as ChatMessage & { envWeather?: string; env_weather?: string }).envWeather
          ?? (message as ChatMessage & { env_weather?: string }).env_weather
          ?? '',
        envLocation: (message as ChatMessage & { envLocation?: string; env_location?: string }).envLocation
          ?? (message as ChatMessage & { env_location?: string }).env_location
          ?? '',
        image: message.image,
        model: message.model,
        crowdName: (message as ChatMessage & { crowdName?: string; crowd_name?: string }).crowdName
          ?? (message as ChatMessage & { crowd_name?: string }).crowd_name
          ?? '',
        memberName: (message as ChatMessage & { memberName?: string; member_name?: string; name?: string }).memberName
          ?? (message as ChatMessage & { member_name?: string }).member_name
          ?? (message as ChatMessage & { name?: string }).name
          ?? '',
        versionList: (message as ChatMessage & { versionList?: unknown[]; versionsJson?: unknown[]; versions_json?: unknown[] }).versionList
          ?? (message as ChatMessage & { versionsJson?: unknown[] }).versionsJson
          ?? (message as ChatMessage & { versions_json?: unknown[] }).versions_json
          ?? [],
        activeVersionIndex: (message as ChatMessage & { activeVersionIndex?: number; active_version_index?: number }).activeVersionIndex
          ?? (message as ChatMessage & { active_version_index?: number }).active_version_index
          ?? 0,
        narrationProfileId: (message as ChatMessage & { narrationProfileId?: string; narration_profile_id?: string }).narrationProfileId
          ?? (message as ChatMessage & { narration_profile_id?: string }).narration_profile_id
          ?? '',
        narrationProfileName: (message as ChatMessage & { narrationProfileName?: string; narration_profile_name?: string }).narrationProfileName
          ?? (message as ChatMessage & { narration_profile_name?: string }).narration_profile_name
          ?? '',
        narrationProfileKind: (message as ChatMessage & { narrationProfileKind?: string; narration_profile_kind?: string }).narrationProfileKind
          ?? (message as ChatMessage & { narration_profile_kind?: string }).narration_profile_kind
          ?? '',
        includeInContext: (message as ChatMessage & { includeInContext?: unknown; include_in_context?: unknown }).includeInContext
          ?? (message as ChatMessage & { include_in_context?: unknown }).include_in_context,
        attachmentsJson: (message as ChatMessage & { attachmentsJson?: string; attachments_json?: string }).attachmentsJson
          ?? (message as ChatMessage & { attachments_json?: string }).attachments_json,
        attachments: (message as ChatMessage & { attachments?: unknown[] }).attachments,
        turnStreamJson: (message as ChatMessage & { turnStreamJson?: string; turn_stream_json?: string }).turnStreamJson
          ?? (message as ChatMessage & { turn_stream_json?: string }).turn_stream_json,
        autoWriteHidden: (message as ChatMessage & { autoWriteHidden?: unknown; auto_write_hidden?: unknown }).autoWriteHidden
          ?? (message as ChatMessage & { auto_write_hidden?: unknown }).auto_write_hidden,
        autoWriteHiddenAt: (message as ChatMessage & { autoWriteHiddenAt?: string; auto_write_hidden_at?: string }).autoWriteHiddenAt
          ?? (message as ChatMessage & { auto_write_hidden_at?: string }).auto_write_hidden_at,
        autoWriteBatchId: (message as ChatMessage & { autoWriteBatchId?: string; auto_write_batch_id?: string }).autoWriteBatchId
          ?? (message as ChatMessage & { auto_write_batch_id?: string }).auto_write_batch_id,
        autoWriteHiddenReason: (message as ChatMessage & { autoWriteHiddenReason?: string; auto_write_hidden_reason?: string }).autoWriteHiddenReason
          ?? (message as ChatMessage & { auto_write_hidden_reason?: string }).auto_write_hidden_reason
      }))
    })
  })
  await ensureOk(response, '复制聊天记录时中断了')
}

export async function createChatMessage(targetId: string, payload: Record<string, unknown>): Promise<number> {
  const normalizedTargetId = normalizeChatTargetId(targetId)
  const response = await fetch(API.chatMessages(normalizedTargetId), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  await ensureOk(response, '发送消息失败')
  const result = await response.json()
  return readCreatedMessageId(result)
}

export async function fetchSessionTemporaryCharacters(sessionId: string): Promise<ChatSessionTemporaryCharacter[]> {
  const response = await fetch(API.chatSessionTemporaryCharacters(sessionId))
  await ensureOk(response, '加载会话临时角色失败')
  const data = await response.json() as { items?: ChatSessionTemporaryCharacter[] }
  return (Array.isArray(data.items) ? data.items : []).map(normalizeSessionTemporaryCharacter)
}

export async function fetchSessionTemporaryEntities(sessionId: string): Promise<ChatSessionTemporaryEntity[]> {
  const response = await fetch(API.chatSessionTemporaryEntities(sessionId))
  await ensureOk(response, '加载会话临时实体失败')
  const data = await response.json() as { items?: ChatSessionTemporaryEntity[] }
  return (Array.isArray(data.items) ? data.items : []).map(normalizeSessionTemporaryEntity)
}

export async function saveSessionTemporaryEntity(
  sessionId: string,
  payload: Partial<ChatSessionTemporaryEntity>
): Promise<ChatSessionTemporaryEntity> {
  const response = await fetch(API.chatSessionTemporaryEntities(sessionId), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {})
  })
  await ensureOk(response, '保存会话临时实体失败')
  return normalizeSessionTemporaryEntity(await response.json() as ChatSessionTemporaryEntity)
}

export async function organizeSessionTemporaryEntity(
  sessionId: string,
  rawText: string
): Promise<SessionTemporaryEntityOrganizeResult> {
  const response = await fetch(API.chatSessionTemporaryEntityOrganize(sessionId), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rawText })
  })
  await ensureOk(response, '整理会话临时资料失败')
  const data = await response.json() as SessionTemporaryEntityOrganizeResult
  return {
    ...data,
    item: data.item ? normalizeSessionTemporaryEntity(data.item) : undefined
  }
}

export async function deleteSessionTemporaryEntity(sessionId: string, entityId: string): Promise<void> {
  const response = await fetch(API.chatSessionTemporaryEntity(sessionId, entityId), { method: 'DELETE' })
  await ensureOk(response, '删除会话临时资料失败')
}

// ── 状态栏积木（模板 + 实例）：对话级骨架，计划书 2026-07-08_状态系统积木骨架计划 ──

export function normalizeStatusPanelTemplate(input: ChatStatusPanelTemplate): ChatStatusPanelTemplate {
  const source = (input && typeof input === 'object' ? input : {}) as Record<string, any>
  const fields = parseJsonArray(source.fields ?? source.fieldsJson ?? source.fields_json)
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object' && !Array.isArray(item))) as unknown as ChatStatusPanelTemplate['fields']
  const presentationResult = normalizeStatusPanelPresentation(
    source.presentation ?? source.presentationJson ?? source.presentation_json,
    fields
  )
  const presentation = presentationResult.ok ? presentationResult.presentation : null
  return {
    ...source,
    id: String(source.id || '').trim(),
    sessionId: String(source.sessionId ?? source.session_id ?? '').trim(),
    kind: String(source.kind || '').trim(),
    name: String(source.name || '').trim(),
    description: String(source.description || ''),
    fields,
    fieldsJson: JSON.stringify(fields),
    presentation,
    presentationJson: presentation ? JSON.stringify(presentation) : '',
    createdBy: String(source.createdBy ?? source.created_by ?? 'user').trim() || 'user',
    version: Math.max(1, Number(source.version || 1)),
    status: String(source.status || 'active').trim() || 'active',
    createdAt: String(source.createdAt ?? source.created_at ?? '').trim(),
    updatedAt: String(source.updatedAt ?? source.updated_at ?? '').trim()
  }
}

export function normalizeStatusPanel(input: ChatStatusPanel): ChatStatusPanel {
  const source = (input && typeof input === 'object' ? input : {}) as Record<string, any>
  const values = parseJsonObject(source.values ?? source.valuesJson ?? source.values_json)
  const bindingValues = parseJsonObject(source.bindingValues ?? source.binding_values)
  // 实例字段快照（批次B）：空串/缺失归一成空数组，消费方以「fields 为空 → 回退模板字段」为约定
  const fields = parseJsonArray(source.fields ?? source.fieldsJson ?? source.fields_json)
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object' && !Array.isArray(item))) as unknown as NonNullable<ChatStatusPanel['fields']>
  const presentationResult = normalizeStatusPanelPresentation(
    source.presentation ?? source.presentationJson ?? source.presentation_json,
    fields
  )
  const presentation = presentationResult.ok ? presentationResult.presentation : null
  return {
    ...source,
    id: String(source.id || '').trim(),
    sessionId: String(source.sessionId ?? source.session_id ?? '').trim(),
    templateId: String(source.templateId ?? source.template_id ?? '').trim(),
    name: String(source.name || '').trim(),
    description: String(source.description || '').trim(),
    hostType: (String(source.hostType ?? source.host_type ?? 'none').trim() || 'none') as ChatStatusPanel['hostType'],
    hostId: String(source.hostId ?? source.host_id ?? '').trim(),
    values,
    valuesJson: JSON.stringify(values),
    fields,
    fieldsJson: JSON.stringify(fields),
    presentation,
    presentationJson: presentation ? JSON.stringify(presentation) : '',
    bindingValues: Object.fromEntries(Object.entries(bindingValues).map(([key, value]) => [key, String(value ?? '')])),
    version: Math.max(1, Number(source.version || 1)),
    status: String(source.status || 'active').trim() || 'active',
    createdAt: String(source.createdAt ?? source.created_at ?? '').trim(),
    updatedAt: String(source.updatedAt ?? source.updated_at ?? '').trim()
  }
}

// ── 世界（跨会话共享一等实体·地图系统批2）────────────────────
function normalizeWorld(input: unknown): World {
  const source = (input && typeof input === 'object' ? input : {}) as Record<string, any>
  return {
    id: String(source.id || '').trim(),
    name: String(source.name || '').trim(),
    description: String(source.description || ''),
    status: String(source.status || 'active').trim() || 'active',
    createdAt: String(source.createdAt ?? source.created_at ?? '').trim(),
    updatedAt: String(source.updatedAt ?? source.updated_at ?? '').trim(),
    sessionCount: Number(source.sessionCount ?? source.session_count ?? 0) || 0,
    mapSheetCount: Number(source.mapSheetCount ?? source.map_sheet_count ?? 0) || 0,
    defaultMapSheetId: String(source.defaultMapSheetId ?? source.default_map_sheet_id ?? '').trim()
  }
}

export async function fetchWorlds(): Promise<World[]> {
  const response = await fetch(API.worlds())
  await ensureOk(response, '加载世界列表失败')
  const data = await response.json() as { items?: unknown[] }
  return (Array.isArray(data.items) ? data.items : []).map(normalizeWorld)
}

export async function createWorld(payload: { name: string; description?: string }): Promise<World> {
  const response = await fetch(API.worlds(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {})
  })
  await ensureOk(response, '创建世界失败')
  return normalizeWorld(await response.json())
}

function normalizeWorldEntity(input: unknown): WorldEntity {
  const source = (input && typeof input === 'object' ? input : {}) as Record<string, any>
  return {
    id: String(source.id || '').trim(),
    worldId: String(source.worldId ?? source.world_id ?? '').trim(),
    kind: String(source.kind || 'other').trim() as WorldEntityKind,
    name: String(source.name || '').trim(),
    aliases: parseJsonArray(source.aliases ?? source.aliasesJson ?? source.aliases_json).map((item) => String(item || '').trim()).filter(Boolean),
    markdown: String(source.markdown || ''),
    tags: parseJsonArray(source.tags ?? source.tagsJson ?? source.tags_json).map((item) => String(item || '').trim()).filter(Boolean),
    sourceLedger: parseJsonArray(source.sourceLedger ?? source.sourceLedgerJson ?? source.source_ledger_json),
    mapSheetId: String(source.mapSheetId ?? source.map_sheet_id ?? '').trim(),
    mapFeatureId: String(source.mapFeatureId ?? source.map_feature_id ?? '').trim(),
    status: String(source.status || 'active').trim() || 'active',
    version: Math.max(1, Number(source.version || 1)),
    createdAt: String(source.createdAt ?? source.created_at ?? ''),
    updatedAt: String(source.updatedAt ?? source.updated_at ?? '')
  }
}

export async function fetchWorldEntities(worldId: string): Promise<WorldEntity[]> {
  const response = await fetch(API.worldEntities(worldId))
  await ensureOk(response, '加载世界实体失败')
  const data = await response.json() as { items?: unknown[] }
  return (Array.isArray(data.items) ? data.items : []).map(normalizeWorldEntity).filter((item) => item.id)
}

export async function saveWorldEntity(
  worldId: string,
  payload: Partial<WorldEntity> & { kind?: WorldEntityKind; name?: string; expectedVersion?: number }
): Promise<WorldEntity> {
  const entityId = String(payload.id || '').trim()
  const response = await fetch(entityId ? API.worldEntity(worldId, entityId) : API.worldEntities(worldId), {
    method: entityId ? 'PATCH' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {})
  })
  await ensureOk(response, entityId ? '更新世界实体失败' : '新建世界实体失败')
  return normalizeWorldEntity(await response.json())
}

export async function deleteWorldEntity(worldId: string, entityId: string): Promise<void> {
  const response = await fetch(API.worldEntity(worldId, entityId), { method: 'DELETE' })
  await ensureOk(response, '删除世界实体失败')
}

/** 会话挂世界唯一入口：{ worldId } 挂已有 / { name } 一键创建并挂 / { detach: true } 解绑（返回 world=null） */
export async function attachSessionWorld(
  sessionId: string,
  payload: { worldId?: string; name?: string; description?: string; detach?: boolean }
): Promise<{ world: World | null; session: ChatSession }> {
  const response = await fetch(API.chatSessionWorld(sessionId), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {})
  })
  await ensureOk(response, '设置会话世界失败')
  const data = await response.json() as { world?: unknown; session?: unknown }
  return {
    world: data.world ? normalizeWorld(data.world) : null,
    session: normalizeChatSession((data.session || {}) as ChatSession)
  }
}

// ── 世界管理页（世界一等公民 P1）：单世界维度 CRUD 补全（改名/简介、软删、详情聚合、文档库挂载）──

export interface WorldDetail {
  world: World
  defaultMapSheetId: string
  maps: Array<{ id: string; name: string }>
  sessions: Array<{ id: string; name: string }>
  /** 该世界会话 participants 里 participant_type='char' 的去重集合（群聊成员不展开，P1 限制） */
  characterIds: string[]
  /** 世界挂文档库的 documentId 平铺列表（快照式勾选） */
  docLinks: string[]
  entities: WorldEntity[]
}

function normalizeWorldDetail(input: unknown): WorldDetail {
  const source = (input && typeof input === 'object' ? input : {}) as Record<string, any>
  const maps = Array.isArray(source.maps) ? source.maps : []
  const sessions = Array.isArray(source.sessions) ? source.sessions : []
  const characterIds = Array.isArray(source.characterIds) ? source.characterIds : []
  const docLinks = Array.isArray(source.docLinks) ? source.docLinks : []
  const entities = Array.isArray(source.entities) ? source.entities : []
  return {
    world: normalizeWorld(source.world),
    defaultMapSheetId: String(source.defaultMapSheetId ?? source.default_map_sheet_id ?? source.world?.defaultMapSheetId ?? source.world?.default_map_sheet_id ?? '').trim(),
    maps: maps
      .map((item: unknown) => {
        const row = (item && typeof item === 'object' ? item : {}) as Record<string, any>
        return { id: String(row.id || '').trim(), name: String(row.name || '').trim() }
      })
      .filter((item) => item.id),
    sessions: sessions
      .map((item: unknown) => {
        const row = (item && typeof item === 'object' ? item : {}) as Record<string, any>
        return { id: String(row.id || '').trim(), name: String(row.name || '').trim() }
      })
      .filter((item) => item.id),
    characterIds: characterIds.map((id: unknown) => String(id || '').trim()).filter(Boolean),
    docLinks: docLinks.map((id: unknown) => String(id || '').trim()).filter(Boolean),
    entities: entities.map(normalizeWorldEntity).filter((item) => item.id)
  }
}

/** 改世界名称/简介：name 非空≤50、desc≤500、世界不存在 404 均由服务端校验，走通用 ensureOk 错误文案。 */
export async function updateWorld(worldId: string, payload: { name?: string; description?: string; defaultMapSheetId?: string }): Promise<World> {
  const response = await fetch(API.world(worldId), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {})
  })
  await ensureOk(response, '更新世界失败')
  const data = await response.json() as { world?: unknown }
  return normalizeWorld(data.world ?? data)
}

/** 删世界（软删）冲突态：有地图或世界级状态面板拒绝删除，携带 reason/count——
 *  不能走通用 ensureOk（它只提取 error 文案会丢 reason/count），单独定义可辨识错误类型透传给 UI。 */
export class WorldDeleteConflictError extends Error {
  reason: 'maps' | 'statusPanels' | 'narrativeSeeds' | 'worldEntities'
  count: number
  constructor(message: string, reason: 'maps' | 'statusPanels' | 'narrativeSeeds' | 'worldEntities', count: number) {
    super(message)
    this.name = 'WorldDeleteConflictError'
    this.reason = reason
    this.count = count
  }
}

export async function deleteWorld(worldId: string): Promise<{ detachedSessionCount: number }> {
  const response = await fetch(API.world(worldId), { method: 'DELETE' })
  if (!response.ok) {
    let payload: Record<string, unknown> | null = null
    try {
      payload = await response.json() as Record<string, unknown>
    } catch {
      // 非 JSON 错误体（如网关 HTML 页）走下方兜底消息
    }
    const reason = payload?.reason
    if (response.status === 409 && (reason === 'maps' || reason === 'statusPanels' || reason === 'narrativeSeeds' || reason === 'worldEntities')) {
      throw new WorldDeleteConflictError(String(payload?.error || '') || '删除世界失败', reason, Number(payload?.count) || 0)
    }
    throw new Error(String(payload?.error || '') || '删除世界失败')
  }
  const data = await response.json() as { detachedSessionCount?: number }
  return { detachedSessionCount: Number(data.detachedSessionCount) || 0 }
}

export async function fetchWorldDetail(worldId: string): Promise<WorldDetail> {
  const response = await fetch(API.worldDetail(worldId))
  await ensureOk(response, '加载世界详情失败')
  return normalizeWorldDetail(await response.json())
}

function normalizeRelevantNarrativeSeed(input: unknown): RelevantNarrativeSeedSummary {
  const source = (input && typeof input === 'object' ? input : {}) as Record<string, any>
  return {
    id: String(source.id || '').trim(),
    type: String(source.type || '').trim(),
    title: String(source.title || '').trim(),
    currentProgress: String(source.currentProgress ?? source.current_progress ?? ''),
    expectedOutcome: String(source.expectedOutcome ?? source.expected_outcome ?? ''),
    startTime: String(source.startTime ?? source.start_time ?? ''),
    locationText: String(source.locationText ?? source.location_text ?? ''),
    impactScope: String(source.impactScope ?? source.impact_scope ?? ''),
    status: String(source.status || '').trim(),
    allowFrontstage: Boolean(source.allowFrontstage ?? source.allow_frontstage),
    knowledgeBoundary: String(source.knowledgeBoundary ?? source.knowledge_boundary ?? '').trim(),
    currentCurtainTime: String(source.currentCurtainTime ?? source.current_curtain_time ?? '').trim() || undefined,
    overdueByMs: Math.max(0, Number(source.overdueByMs ?? source.overdue_by_ms ?? 0) || 0),
    relevanceScore: Number(source.relevanceScore ?? source.relevance_score ?? 0) || 0,
    relevanceReasons: (Array.isArray(source.relevanceReasons ?? source.relevance_reasons) ? source.relevanceReasons ?? source.relevance_reasons : [])
      .map((value: unknown) => String(value || '').trim()).filter(Boolean)
  }
}

/** 当前会话的世界级种子确定性取料；服务端以会话帷幕和正式参与者为准，不采信客户端伪造坐标。 */
export async function fetchRelevantNarrativeSeeds(
  worldId: string,
  input: { sessionId: string; userText?: string; limit?: number }
): Promise<RelevantNarrativeSeedBundle> {
  const response = await fetch(API.worldNarrativeSeedsRelevant(worldId), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input || {})
  })
  await ensureOk(response, '加载本轮相关叙事种子失败')
  const data = await response.json() as Record<string, any>
  return {
    worldId: String(data.worldId ?? data.world_id ?? worldId).trim(),
    sessionId: String(data.sessionId ?? data.session_id ?? input.sessionId).trim(),
    deterministic: data.deterministic === true,
    scannedCount: Number(data.scannedCount ?? data.scanned_count ?? 0) || 0,
    items: (Array.isArray(data.items) ? data.items : []).map(normalizeRelevantNarrativeSeed).filter((item) => item.id)
  }
}

export async function fetchOverdueNarrativeSeeds(
  worldId: string,
  input: { sessionId: string; limit?: number }
): Promise<{ worldId: string; sessionId: string; enabled: boolean; currentTime?: string; scannedCount: number; items: Array<Record<string, any>> }> {
  const response = await fetch(API.worldNarrativeSeedsOverdueScan(worldId), {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input || {})
  })
  await ensureOk(response, '扫描到期叙事种子失败')
  const data = await response.json() as Record<string, any>
  return {
    worldId: String(data.worldId || worldId),
    sessionId: String(data.sessionId || input.sessionId),
    enabled: data.enabled === true,
    currentTime: String(data.currentTime || '') || undefined,
    scannedCount: Number(data.scannedCount || 0),
    items: Array.isArray(data.items) ? data.items : []
  }
}

export async function syncNarrativeSeedTimeGates(sessionId: string): Promise<{
  sessionId: string
  worldId: string
  currentTime: string
  transitionedCount: number
  transitionedSeedIds: string[]
}> {
  const response = await fetch(API.chatSessionNarrativeSeedTimeGateSync(sessionId), { method: 'POST' })
  await ensureOk(response, '同步叙事种子时间门失败')
  const data = await response.json() as Record<string, any>
  return {
    sessionId: String(data.sessionId || sessionId),
    worldId: String(data.worldId || ''),
    currentTime: String(data.currentTime || ''),
    transitionedCount: Number(data.transitionedCount || 0),
    transitionedSeedIds: Array.isArray(data.transitionedSeedIds)
      ? data.transitionedSeedIds.map((id: unknown) => String(id || '').trim()).filter(Boolean)
      : []
  }
}

export async function fetchNarrativeSeeds(worldId: string): Promise<Array<Record<string, any>>> {
  const response = await fetch(API.worldNarrativeSeeds(worldId))
  await ensureOk(response, '加载叙事种子列表失败')
  const data = await response.json() as { items?: Array<Record<string, any>> }
  return Array.isArray(data.items) ? data.items : []
}

export async function fetchNarrativeScriptConfig(worldId: string): Promise<Record<string, any>> {
  const response = await fetch(API.worldNarrativeScriptConfig(worldId))
  await ensureOk(response, '加载世界剧本基调失败')
  return await response.json() as Record<string, any>
}

export async function saveNarrativeScriptConfig(worldId: string, input: Record<string, unknown>): Promise<Record<string, any>> {
  const response = await fetch(API.worldNarrativeScriptConfig(worldId), {
    method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(input||{})
  })
  await ensureOk(response, '保存世界剧本基调失败')
  return await response.json() as Record<string, any>
}

export async function fetchNarrativeSeedDetail(worldId: string, seedId: string): Promise<Record<string, any>> {
  const response = await fetch(API.worldNarrativeSeed(worldId, seedId))
  await ensureOk(response, '读取叙事种子详情失败')
  return await response.json() as Record<string, any>
}

export async function createNarrativeSeed(worldId: string, input: Record<string, unknown>): Promise<Record<string, any>> {
  const response = await fetch(API.worldNarrativeSeeds(worldId), {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input || {})
  })
  await ensureOk(response, '创建叙事种子失败')
  return await response.json() as Record<string, any>
}

export async function updateNarrativeSeed(worldId: string, seedId: string, input: Record<string, unknown>): Promise<Record<string, any>> {
  const response = await fetch(API.worldNarrativeSeed(worldId, seedId), {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input || {})
  })
  await ensureOk(response, '更新叙事种子失败')
  return await response.json() as Record<string, any>
}

export async function deleteNarrativeSeed(worldId: string, seedId: string, expectedVersion: number): Promise<void> {
  const response = await fetch(API.worldNarrativeSeed(worldId, seedId), {
    method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedVersion })
  })
  await ensureOk(response, '删除叙事种子失败')
}

export async function previewNarrativeMigration(worldId: string, legacyScripts: Array<Record<string, unknown>>): Promise<Record<string, any>> {
  const response = await fetch(API.worldNarrativeMigrationPreview(worldId), {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ legacyScripts })
  })
  await ensureOk(response, '生成旧剧本迁移预览失败')
  return await response.json() as Record<string, any>
}

export async function executeNarrativeMigration(
  worldId: string,
  legacyScripts: Array<Record<string, unknown>>,
  selectedSeedIndexes: number[]
): Promise<Record<string, any>> {
  const response = await fetch(API.worldNarrativeMigrationExecute(worldId), {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ legacyScripts, selectedSeedIndexes, confirmed: true })
  })
  await ensureOk(response, '执行旧剧本迁移失败')
  return await response.json() as Record<string, any>
}

export async function recordNarrativeSeedImpact(worldId: string, seedId: string, input: Record<string, unknown>): Promise<Record<string, any>> {
  const response = await fetch(API.worldNarrativeSeedImpactEvents(worldId, seedId), {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input || {})
  })
  await ensureOk(response, '提交叙事种子影响失败')
  return await response.json() as Record<string, any>
}

function normalizeCharacterPresence(value: Record<string, any>): ChatSessionCharacterPresence {
  return {
    id: String(value.id || ''),
    sessionId: String(value.sessionId ?? value.session_id ?? ''),
    worldId: String(value.worldId ?? value.world_id ?? ''),
    participantId: String(value.participantId ?? value.participant_id ?? ''),
    presenceState: (value.presenceState ?? value.presence_state ?? 'unknown') as ChatSessionCharacterPresence['presenceState'],
    locationText: String(value.locationText ?? value.location_text ?? ''),
    mapSheetId: String(value.mapSheetId ?? value.map_sheet_id ?? ''),
    mapFeatureId: String(value.mapFeatureId ?? value.map_feature_id ?? ''),
    sinceMessageId: String(value.sinceMessageId ?? value.since_message_id ?? ''),
    version: Number(value.version || 0),
    lastModifiedSource: String(value.lastModifiedSource ?? value.last_modified_source ?? ''),
    createdAt: String(value.createdAt ?? value.created_at ?? ''),
    updatedAt: String(value.updatedAt ?? value.updated_at ?? ''),
    persisted: value.persisted !== false && Boolean(value.id)
  }
}

function normalizeCharacterPresenceEvent(value: Record<string, any>): ChatSessionCharacterPresenceEvent {
  return {
    id: String(value.id || ''),
    presenceId: String(value.presenceId ?? value.presence_id ?? ''),
    sessionId: String(value.sessionId ?? value.session_id ?? ''),
    worldId: String(value.worldId ?? value.world_id ?? ''),
    participantId: String(value.participantId ?? value.participant_id ?? ''),
    eventType: (value.eventType ?? value.event_type) as ChatSessionCharacterPresenceEvent['eventType'],
    transition: value.transition as ChatSessionCharacterPresenceEvent['transition'],
    fromState: (value.fromState ?? value.from_state) as ChatSessionCharacterPresenceEvent['fromState'],
    toState: (value.toState ?? value.to_state) as ChatSessionCharacterPresenceEvent['toState'],
    provisional: value.provisional === true || value.provisional === 1,
    proposalEventId: String(value.proposalEventId ?? value.proposal_event_id ?? ''),
    sourceMessageId: String(value.sourceMessageId ?? value.source_message_id ?? ''),
    sourceDirectorRunId: String(value.sourceDirectorRunId ?? value.source_director_run_id ?? ''),
    sourceAgentRunId: String(value.sourceAgentRunId ?? value.source_agent_run_id ?? ''),
    evidenceSummary: String(value.evidenceSummary ?? value.evidence_summary ?? ''),
    idempotencyKey: String(value.idempotencyKey ?? value.idempotency_key ?? ''),
    createdAt: String(value.createdAt ?? value.created_at ?? '')
  }
}

export async function fetchChatSessionCharacterPresence(sessionId: string): Promise<ChatSessionCharacterPresenceBundle> {
  const response = await fetch(API.chatSessionCharacterPresence(sessionId))
  await ensureOk(response, '加载角色在场状态失败')
  const data = await response.json() as Record<string, any>
  return {
    sessionId: String(data.sessionId ?? data.session_id ?? sessionId),
    worldId: String(data.worldId ?? data.world_id ?? ''),
    items: (Array.isArray(data.items) ? data.items : []).map(normalizeCharacterPresence)
  }
}

export async function fetchChatSessionCharacterPresenceEvents(
  sessionId: string,
  query: { participantId?: string; worldId?: string } = {}
): Promise<ChatSessionCharacterPresenceEvent[]> {
  const params = new URLSearchParams()
  if (query.participantId) params.set('participantId', query.participantId)
  if (query.worldId) params.set('worldId', query.worldId)
  const response = await fetch(`${API.chatSessionCharacterPresenceEvents(sessionId)}${params.size ? `?${params}` : ''}`)
  await ensureOk(response, '加载角色登退场历史失败')
  const data = await response.json() as Array<Record<string, any>>
  return (Array.isArray(data) ? data : []).map(normalizeCharacterPresenceEvent)
}

async function postCharacterPresenceCommand(
  url: string,
  payload: Record<string, unknown>,
  errorMessage: string
): Promise<{ presence: ChatSessionCharacterPresence | null; event: ChatSessionCharacterPresenceEvent; idempotent: boolean }> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {})
  })
  await ensureOk(response, errorMessage)
  const data = await response.json() as Record<string, any>
  return {
    presence: data.presence ? normalizeCharacterPresence(data.presence) : null,
    event: normalizeCharacterPresenceEvent(data.event || {}),
    idempotent: data.idempotent === true
  }
}

export function setChatSessionCharacterPresence(sessionId: string, payload: Record<string, unknown>) {
  return postCharacterPresenceCommand(API.chatSessionCharacterPresenceSet(sessionId), payload, '设置角色在场状态失败')
}

export function proposeChatSessionCharacterPresence(sessionId: string, payload: Record<string, unknown>) {
  return postCharacterPresenceCommand(API.chatSessionCharacterPresencePropose(sessionId), payload, '提出角色登退场失败')
}

export function commitChatSessionCharacterPresence(sessionId: string, payload: Record<string, unknown>) {
  return postCharacterPresenceCommand(API.chatSessionCharacterPresenceCommit(sessionId), payload, '提交角色登退场事实失败')
}

export function cancelChatSessionCharacterPresence(sessionId: string, payload: Record<string, unknown>) {
  return postCharacterPresenceCommand(API.chatSessionCharacterPresenceCancel(sessionId), payload, '取消预计角色登退场失败')
}

export async function fetchSessionOrchestrationMaterials(sessionId: string): Promise<SessionOrchestrationMaterials> {
  const response = await fetch(API.chatSessionOrchestrationMaterials(sessionId))
  await ensureOk(response, '加载会话编排资料失败')
  return await response.json() as SessionOrchestrationMaterials
}

export async function fetchOrchestrationWorkspaceProjection(sessionId: string): Promise<{
  workspace: OrchestrationWorkspaceProjection
  director: DirectorOrchestrationProjection
}> {
  const response = await fetch(API.chatSessionOrchestrationWorkspace(sessionId))
  if (!response.ok) throw new Error((await response.json().catch(() => ({})))?.error || '读取统一编排工作台失败')
  return await response.json()
}

export async function fetchDirectorOrchestrationProjection(input: {
  sessionId: string
  userText?: string
  anchorMessageId?: string | number
  forcedCharacterIds?: string[]
  /** 仅供调用侧/测试装配核对；服务端候选上限始终取正式参与者，不信任客户端名单。 */
  candidateCharacterIds?: string[]
  maxPromptChars?: number
}): Promise<DirectorOrchestrationProjection> {
  const response = await fetch(API.chatSessionDirectorOrchestrationProjection(input.sessionId), {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userText: input.userText || '', anchorMessageId: input.anchorMessageId || '',
      forcedCharacterIds: input.forcedCharacterIds || [], maxPromptChars: input.maxPromptChars || 16000
    })
  })
  if (!response.ok) throw new Error((await response.json().catch(() => ({})))?.error || '读取提调统一编排投影失败')
  return await response.json()
}

export async function executeOrchestrationCommands(
  sessionId: string,
  operations: OrchestrationCommandEnvelope[]
): Promise<{ viewRevision: string; operations: Array<{ command: string; targetRef: OrchestrationTargetRef; version: number; resultRef?: string }> }> {
  const response = await fetch(API.chatSessionOrchestrationWorkspaceCommands(sessionId), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ operations })
  })
  await ensureOk(response, '统一编排命令提交失败')
  return await response.json()
}

export async function createPostRoundOrchestrationRun(input: CreatePostRoundRunInput): Promise<PostRoundOrchestrationRun> {
  const response = await fetch(API.chatSessionPostRoundRuns(input.sessionId), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input)
  })
  await ensureOk(response, '创建轮后提调运行记录失败')
  return response.json()
}

export async function listUnresolvedPostRoundOrchestrationRuns(sessionId: string): Promise<PostRoundOrchestrationRun[]> {
  const response = await fetch(API.chatSessionPostRoundRuns(sessionId))
  await ensureOk(response, '读取轮后提调运行记录失败')
  const result = await response.json()
  return Array.isArray(result) ? result : []
}

export async function transitionPostRoundOrchestrationRun(input: {
  sessionId: string
  runId: string
  status: Exclude<PostRoundRunStatus, 'pending'>
  errorStage?: string
  errorMessage?: string
  resultJson?: Record<string, unknown>
}): Promise<PostRoundOrchestrationRun> {
  const response = await fetch(API.chatSessionPostRoundRun(input.sessionId, input.runId), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input)
  })
  await ensureOk(response, '更新轮后提调运行记录失败')
  return response.json()
}

async function mutateOrchestrationMaterial<T>(url: string, method: 'POST' | 'PUT' | 'PATCH', payload: Record<string, unknown>, fallback: string): Promise<T> {
  const response = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {})
  })
  await ensureOk(response, fallback)
  return await response.json() as T
}

export async function saveSessionNarrativeOverride(
  sessionId: string,
  payload: { content: string; expectedVersion: number; worldId?: string; source?: string }
): Promise<SessionNarrativeOverride | null> {
  const data = await mutateOrchestrationMaterial<{ narrativeOverride: SessionNarrativeOverride | null }>(
    API.chatSessionNarrativeOverride(sessionId), 'PUT', payload, '保存会话剧情覆盖失败'
  )
  return data.narrativeOverride
}

export async function saveSessionOrchestrationState(
  sessionId: string,
  payload: Partial<SessionOrchestrationState> & { expectedVersion: number }
): Promise<SessionOrchestrationState> {
  const data = await mutateOrchestrationMaterial<{ state: SessionOrchestrationState }>(
    API.chatSessionOrchestrationState(sessionId), 'PUT', payload, '保存最近情境失败'
  )
  return data.state
}

/** 世界挂文档库：全量替换 documentId 列表（去重、上限 500，服务端校验），采用快照式勾选。
 * 世界挂载的文档 id 是会话召回范围的唯一正式真值；本函数走服务端原子替换。
 *  world_doc_library_links 表，绝不碰会话级 localStorage 缓存。 */
export async function saveWorldDocLinks(worldId: string, documentIds: string[]): Promise<string[]> {
  const response = await fetch(API.worldDocLinks(worldId), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ documentIds: Array.isArray(documentIds) ? documentIds : [] })
  })
  await ensureOk(response, '保存世界文档库挂载失败')
  const data = await response.json() as { documentIds?: unknown[] }
  return (Array.isArray(data.documentIds) ? data.documentIds : []).map((id) => String(id || '').trim()).filter(Boolean)
}

// ── 地图数据骨架（地图系统批4）：用户 UI 只读（v1 唯一写手=绘舆子agent，走服务端工具面）──
function normalizeMapPointList(value: unknown): Array<[number, number]> {
  if (!Array.isArray(value)) return []
  const pts: Array<[number, number]> = []
  for (const item of value) {
    if (!Array.isArray(item) || item.length < 2) continue
    const x = Number(item[0])
    const y = Number(item[1])
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue
    pts.push([x, y])
  }
  return pts
}

function normalizeWorldMapFeature(input: unknown): WorldMapFeatureRecord {
  const source = (input && typeof input === 'object' ? input : {}) as Record<string, any>
  const geometry = (source.geometry && typeof source.geometry === 'object' ? source.geometry : {}) as Record<string, any>
  const spine = normalizeMapPointList(geometry.spine)
  // 海拔真值透传（地图视觉大改批1）：服务端 geometry_json 已带 elevationM，这里若漏归一会静默丢真值
  const elevationRaw = Number(geometry.elevationM)
  const elevationM = Number.isFinite(elevationRaw) ? elevationRaw : undefined
  const depthRaw = Number(geometry.depthM)
  const depthM = Number.isFinite(depthRaw) ? depthRaw : undefined
  return {
    id: String(source.id || '').trim(),
    sheetId: String(source.sheetId ?? source.sheet_id ?? '').trim(),
    worldId: String(source.worldId ?? source.world_id ?? '').trim(),
    kind: String(source.kind || '').trim(),
    category: String(source.category || '').trim(),
    name: String(source.name || '').trim(),
    layer: String(source.layer || 'terrain').trim() || 'terrain',
    geometry: {
      pts: normalizeMapPointList(geometry.pts),
      ...(spine.length ? { spine } : {}),
      ...(elevationM !== undefined ? { elevationM } : {}),
      ...(depthM !== undefined ? { depthM } : {})
    },
    style: source.style && typeof source.style === 'object' ? source.style as Record<string, unknown> : null,
    links: source.links && typeof source.links === 'object' ? source.links as WorldMapFeatureRecord['links'] : null,
    meta: source.meta && typeof source.meta === 'object' ? source.meta as Record<string, unknown> : null,
    createdAt: String(source.createdAt ?? source.created_at ?? '').trim(),
    updatedAt: String(source.updatedAt ?? source.updated_at ?? '').trim()
  }
}

function normalizeWorldMapSheet(input: unknown): WorldMapSheet {
  const source = (input && typeof input === 'object' ? input : {}) as Record<string, any>
  const exploredPts = normalizeMapPointList((source.explored as Record<string, any> | null)?.pts)
  return {
    id: String(source.id || '').trim(),
    worldId: String(source.worldId ?? source.world_id ?? '').trim(),
    name: String(source.name || '').trim(),
    explored: exploredPts.length >= 3 ? { pts: exploredPts } : null,
    features: (Array.isArray(source.features) ? source.features : []).map(normalizeWorldMapFeature),
    createdAt: String(source.createdAt ?? source.created_at ?? '').trim(),
    updatedAt: String(source.updatedAt ?? source.updated_at ?? '').trim()
  }
}

/** 世界舆图 bundle：显式默认图纸 + 各图纸要素；历史空值由服务端稳定回退。 */
export async function fetchWorldMapBundle(worldId: string): Promise<WorldMapBundle> {
  const response = await fetch(API.worldMap(worldId))
  await ensureOk(response, '加载舆图失败')
  const data = await response.json() as { world?: unknown; defaultMapSheetId?: unknown; sheets?: unknown[] }
  const world = normalizeWorld(data.world)
  return {
    world,
    defaultMapSheetId: String(data.defaultMapSheetId ?? world.defaultMapSheetId ?? '').trim(),
    sheets: (Array.isArray(data.sheets) ? data.sheets : []).map(normalizeWorldMapSheet)
  }
}

// ⚠️ 以下地图写口只允许由应用层编排（Agent 工具或正式人工编辑服务）调用；Vue 组件不得直接写 repository。
// runMeta（批L 地图版本历史·可选）：派发运行标识 {runKey, runLabel}，服务端据此把变更日志按 run 分组；
// 不传=服务端记 'manual'。图纸端点服务端本批不记日志，透传只为口径统一（真正记日志的是要素存/删两口）。
/** 存图纸（不带 id=新建·带 id=更新；explored 键缺省保留、null 清空）。 */
export async function saveWorldMapSheetRemote(
  worldId: string,
  payload: { id?: string; name?: string; explored?: { pts: Array<[number, number]> } | null },
  runMeta?: WorldMapWriteRunMeta
): Promise<WorldMapSheet> {
  const response = await fetch(API.worldMapSheets(worldId), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...(payload || {}), ...(runMeta ? { runMeta } : {}) })
  })
  await ensureOk(response, '保存舆图图纸失败')
  const sheet = normalizeWorldMapSheet(await response.json())
  bumpWorldMapRevision(worldId)
  return sheet
}

/** 批量存要素（整批校验通过才落库·带 id 存在=增量继承·带 id 不存在=语义 id 新建）。 */
export async function saveWorldMapFeaturesRemote(
  worldId: string,
  items: Array<Record<string, unknown>>,
  runMeta?: WorldMapWriteRunMeta
): Promise<WorldMapFeatureRecord[]> {
  const response = await fetch(API.worldMapFeatures(worldId), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items, ...(runMeta ? { runMeta } : {}) })
  })
  await ensureOk(response, '保存舆图要素失败')
  const data = await response.json() as { items?: unknown[] }
  const savedItems = (Array.isArray(data.items) ? data.items : []).map(normalizeWorldMapFeature)
  bumpWorldMapRevision(worldId)
  return savedItems
}

/** 删要素（服务端软删=持久痕迹）。runMeta 走 query 透传（DELETE 请求体在部分代理下不可靠）。 */
export async function deleteWorldMapFeatureRemote(
  worldId: string,
  featureId: string,
  runMeta?: WorldMapWriteRunMeta
): Promise<void> {
  const query = runMeta && (runMeta.runKey || runMeta.runLabel)
    ? `?runKey=${encodeURIComponent(runMeta.runKey || '')}&runLabel=${encodeURIComponent(runMeta.runLabel || '')}`
    : ''
  const response = await fetch(API.worldMapFeature(worldId, featureId) + query, { method: 'DELETE' })
  await ensureOk(response, '删除舆图要素失败')
  bumpWorldMapRevision(worldId)
}

/** 地图版本历史（批L）：按 run 分组的变更历史（最多最近 50 组），弹窗「历史」面板消费。 */
export async function fetchWorldMapChangeLog(worldId: string): Promise<WorldMapChangeRunGroup[]> {
  const response = await fetch(API.worldMapChangeLog(worldId))
  await ensureOk(response, '加载舆图历史失败')
  const data = await response.json() as { groups?: unknown[] }
  return (Array.isArray(data.groups) ? data.groups : []).map((raw) => {
    const source = (raw && typeof raw === 'object' ? raw : {}) as Record<string, any>
    const counts = (source.counts && typeof source.counts === 'object' ? source.counts : {}) as Record<string, unknown>
    return {
      groupId: String(source.groupId || ''),
      runKey: String(source.runKey || 'manual'),
      runLabel: String(source.runLabel || ''),
      startedAt: String(source.startedAt || ''),
      endedAt: String(source.endedAt || ''),
      counts: {
        add: Number(counts.add) || 0,
        update: Number(counts.update) || 0,
        delete: Number(counts.delete) || 0
      },
      items: (Array.isArray(source.items) ? source.items : []).map((item: Record<string, any>) => ({
        id: String(item?.id || ''),
        op: String(item?.op || ''),
        featureId: String(item?.featureId || ''),
        snapshot: (item?.snapshot && typeof item.snapshot === 'object' ? item.snapshot : {}),
        createdAt: String(item?.createdAt || '')
      }))
    }
  })
}

export async function fetchStatusPanelTemplates(sessionId: string): Promise<ChatStatusPanelTemplate[]> {
  const response = await fetch(API.chatStatusPanelTemplates(sessionId))
  await ensureOk(response, '加载状态栏模板失败')
  const data = await response.json() as { items?: ChatStatusPanelTemplate[] }
  return (Array.isArray(data.items) ? data.items : []).map(normalizeStatusPanelTemplate)
}

export async function saveStatusPanelTemplate(
  sessionId: string,
  payload: Partial<ChatStatusPanelTemplate> & { expectedVersion?: number }
): Promise<ChatStatusPanelTemplate> {
  const expectedVersion = Number.isInteger(payload.expectedVersion)
    ? Number(payload.expectedVersion)
    : (payload.id ? Math.max(1, Number(payload.version || 1)) : 0)
  const response = await fetch(API.chatStatusPanelTemplates(sessionId), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...(payload || {}), expectedVersion })
  })
  await ensureOk(response, '保存状态栏模板失败')
  return normalizeStatusPanelTemplate(await response.json() as ChatStatusPanelTemplate)
}

export async function deleteStatusPanelTemplate(sessionId: string, templateId: string): Promise<void> {
  const response = await fetch(API.chatStatusPanelTemplate(sessionId, templateId), { method: 'DELETE' })
  await ensureOk(response, '删除状态栏模板失败')
}

/** 状态栏实例清单带世界归属信息（批3）：worldId=会话当前归属（空=会话级）；
 *  pendingSessionScopeCount=挂世界后仍留在会话级未并入的模板+实例数（供 UI 提示一键并入）。 */
export interface StatusPanelsBundle {
  items: ChatStatusPanel[]
  worldId: string
  pendingSessionScopeCount: number
}

export async function fetchStatusPanelsBundle(sessionId: string): Promise<StatusPanelsBundle> {
  const response = await fetch(API.chatStatusPanels(sessionId))
  await ensureOk(response, '加载状态栏失败')
  const data = await response.json() as { items?: ChatStatusPanel[]; worldId?: string; pendingSessionScopeCount?: number }
  return {
    items: (Array.isArray(data.items) ? data.items : []).map(normalizeStatusPanel),
    worldId: String(data.worldId || '').trim(),
    pendingSessionScopeCount: Number(data.pendingSessionScopeCount || 0) || 0
  }
}

export async function fetchStatusPanels(sessionId: string): Promise<ChatStatusPanel[]> {
  return (await fetchStatusPanelsBundle(sessionId)).items
}

export async function fetchStatusPanelEvents(sessionId: string, panelId: string): Promise<ChatStatusPanelEvent[]> {
  const response = await fetch(API.chatStatusPanelEvents(sessionId, panelId))
  await ensureOk(response, '加载状态栏事件失败')
  const data = await response.json() as { items?: Array<Record<string, any>> }
  return (Array.isArray(data.items) ? data.items : []).map((source) => ({
    id: String(source.id || ''),
    panelId: String(source.panelId ?? source.panel_id ?? ''),
    sessionId: String(source.sessionId ?? source.session_id ?? ''),
    worldId: String(source.worldId ?? source.world_id ?? ''),
    eventType: String(source.eventType ?? source.event_type ?? 'patched') as ChatStatusPanelEvent['eventType'],
    fromVersion: Math.max(0, Number(source.fromVersion ?? source.from_version ?? 0)),
    toVersion: Math.max(0, Number(source.toVersion ?? source.to_version ?? 0)),
    patchJson: String(source.patchJson ?? source.patch_json ?? '{}'),
    source: String(source.source || ''),
    idempotencyKey: String(source.idempotencyKey ?? source.idempotency_key ?? ''),
    createdAt: String(source.createdAt ?? source.created_at ?? '')
  }))
}

export async function fetchStatusPanelMigrationPreview(sessionId: string): Promise<{
  zeroWrite: boolean
  total: number
  migratable: number
  blocked: number
  items: Array<Record<string, unknown>>
}> {
  const response = await fetch(API.chatStatusPanelMigrationPreview(sessionId))
  await ensureOk(response, '加载旧角色状态栏迁移预览失败')
  const data = await response.json() as Record<string, any>
  return {
    zeroWrite: data.zeroWrite === true,
    total: Math.max(0, Number(data.total || 0)),
    migratable: Math.max(0, Number(data.migratable || 0)),
    blocked: Math.max(0, Number(data.blocked || 0)),
    items: Array.isArray(data.items) ? data.items : []
  }
}

/** 状态栏并入世界（批3）：把本会话全部会话级状态栏（模板+实例）升为世界级。 */
export async function mergeStatusPanelsIntoWorld(sessionId: string): Promise<{ worldId: string; mergedTemplates: number; mergedPanels: number }> {
  const response = await fetch(API.chatStatusPanelsMergeIntoWorld(sessionId), { method: 'POST' })
  await ensureOk(response, '状态栏并入世界失败')
  const data = await response.json() as { worldId?: string; mergedTemplates?: number; mergedPanels?: number }
  return {
    worldId: String(data.worldId || '').trim(),
    mergedTemplates: Number(data.mergedTemplates || 0) || 0,
    mergedPanels: Number(data.mergedPanels || 0) || 0
  }
}

export async function saveStatusPanel(
  sessionId: string,
  payload: Partial<ChatStatusPanel> & { expectedVersion?: number; idempotencyKey?: string; source?: string }
): Promise<ChatStatusPanel> {
  const expectedVersion = Number.isInteger(payload.expectedVersion)
    ? Number(payload.expectedVersion)
    : (payload.id ? Math.max(1, Number(payload.version || 1)) : 0)
  const idempotencyKey = String(payload.idempotencyKey || `status-panel-save-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`)
  const response = await fetch(API.chatStatusPanels(sessionId), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...(payload || {}), expectedVersion, idempotencyKey })
  })
  await ensureOk(response, '保存状态栏失败')
  return normalizeStatusPanel(await response.json() as ChatStatusPanel)
}

export async function fetchStatusAssets(sessionId: string): Promise<ChatStatusAsset[]> {
  const response = await fetch(API.chatStatusAssets(sessionId))
  await ensureOk(response, '加载状态栏图片失败')
  const data = await response.json() as { items?: Array<Record<string, any>> }
  return (Array.isArray(data.items) ? data.items : []).map((source) => ({
    id: String(source.id || ''),
    sessionId: String(source.sessionId ?? source.session_id ?? ''),
    worldId: String(source.worldId ?? source.world_id ?? ''),
    kind: 'image',
    originalFilename: String(source.originalFilename ?? source.original_filename ?? ''),
    mimeType: String(source.mimeType ?? source.mime_type ?? ''),
    sizeBytes: Math.max(0, Number(source.sizeBytes ?? source.size_bytes ?? 0)),
    sourceType: String(source.sourceType ?? source.source_type ?? 'upload') === 'pixel_snapshot' ? 'pixel_snapshot' : 'upload',
    sourceRef: parseJsonObject(source.sourceRef ?? source.sourceRefJson ?? source.source_ref_json),
    status: String(source.status || 'active'),
    createdAt: String(source.createdAt ?? source.created_at ?? ''),
    updatedAt: String(source.updatedAt ?? source.updated_at ?? '')
  }))
}

export async function uploadStatusAsset(
  sessionId: string,
  payload: {
    dataUri: string
    fileName: string
    alt: string
    caption?: string
    sourceType?: 'upload' | 'pixel_snapshot'
    sourceRef?: Record<string, unknown>
    bind?: { panelId: string; fieldKey: string; expectedVersion: number; idempotencyKey: string }
  }
): Promise<{ asset: ChatStatusAsset; ref: StatusPanelAssetRef; panel?: ChatStatusPanel }> {
  const response = await fetch(API.chatStatusAssets(sessionId), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  await ensureOk(response, '上传状态栏图片失败')
  const source = await response.json() as Record<string, any>
  const assetSource = source.asset || {}
  return {
    asset: {
      id: String(assetSource.id || ''),
      sessionId: String(assetSource.sessionId ?? assetSource.session_id ?? sessionId),
      worldId: String(assetSource.worldId ?? assetSource.world_id ?? ''),
      kind: 'image',
      originalFilename: String(assetSource.originalFilename ?? assetSource.original_filename ?? ''),
      mimeType: String(assetSource.mimeType ?? assetSource.mime_type ?? ''),
      sizeBytes: Number(assetSource.sizeBytes ?? assetSource.size_bytes ?? 0),
      sourceType: String(assetSource.sourceType ?? assetSource.source_type ?? 'upload') === 'pixel_snapshot' ? 'pixel_snapshot' : 'upload',
      sourceRef: parseJsonObject(assetSource.sourceRef ?? assetSource.source_ref_json),
      status: String(assetSource.status || 'active'),
      createdAt: String(assetSource.createdAt ?? assetSource.created_at ?? ''),
      updatedAt: String(assetSource.updatedAt ?? assetSource.updated_at ?? '')
    },
    ref: {
      assetId: String(source.ref?.assetId || assetSource.id || ''),
      kind: 'image',
      alt: String(source.ref?.alt || payload.alt || '').trim(),
      ...(String(source.ref?.caption || payload.caption || '').trim() ? { caption: String(source.ref?.caption || payload.caption || '').trim() } : {})
    },
    ...(source.panel ? { panel: normalizeStatusPanel(source.panel as ChatStatusPanel) } : {})
  }
}

export async function deleteStatusPanel(
  sessionId: string,
  panelId: string,
  expectedVersion: number,
  options: { idempotencyKey?: string; source?: string } = {}
): Promise<void> {
  const query = new URLSearchParams({
    expectedVersion: String(expectedVersion),
    idempotencyKey: String(options.idempotencyKey || `status-panel-delete-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`),
    source: String(options.source || 'user_manual')
  })
  const response = await fetch(`${API.chatStatusPanel(sessionId, panelId)}?${query.toString()}`, { method: 'DELETE' })
  await ensureOk(response, '删除状态栏失败')
}

export async function persistSessionTemporaryEntity(
  sessionId: string,
  entityId: string,
  payload: Record<string, unknown> = {}
): Promise<SessionTemporaryEntityPersistResult> {
  const response = await fetch(API.chatSessionTemporaryEntityPersist(sessionId, entityId), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {})
  })
  await ensureOk(response, '持久化会话临时资料失败')
  const data = await response.json() as SessionTemporaryEntityPersistResult
  return {
    ...data,
    item: data.item ? normalizeSessionTemporaryEntity(data.item) : undefined
  }
}

export async function saveSessionTemporaryCharacter(
  sessionId: string,
  payload: SessionTemporaryCharacterSavePayload
): Promise<ChatSessionTemporaryCharacter> {
  const characterId = String(payload?.id || '').trim()
  const response = await fetch(
    characterId ? API.chatSessionTemporaryCharacter(sessionId, characterId) : API.chatSessionTemporaryCharacters(sessionId),
    {
      method: characterId ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload || {})
    }
  )
  await ensureOk(response, '保存会话临时角色失败')
  return normalizeSessionTemporaryCharacter(await response.json() as ChatSessionTemporaryCharacter)
}

export async function deleteSessionTemporaryCharacter(sessionId: string, characterId: string): Promise<void> {
  const response = await fetch(API.chatSessionTemporaryCharacter(sessionId, characterId), { method: 'DELETE' })
  await ensureOk(response, '删除会话临时角色失败')
}

export async function resolveSessionTemporaryCharacterMention(
  sessionId: string,
  targetName: string
): Promise<SessionTemporaryCharacterMentionResolveResult> {
  const response = await fetch(API.chatSessionTemporaryCharacterResolveMention(sessionId), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ targetName })
  })
  await ensureOk(response, '创建会话临时角色失败')
  const data = await response.json() as SessionTemporaryCharacterMentionResolveResult
  return {
    ...data,
    item: data.item ? normalizeSessionTemporaryCharacter(data.item) : undefined
  }
}

/** 上传输入框图片：dataUri 走 /api/data/chat-images，返回可直接塞进 ChatImageAttachment 的基础字段。 */
export async function uploadChatImage(dataUri: string, name?: string): Promise<Pick<ChatImageAttachment, 'id' | 'url' | 'mime'> & { size: number }> {
  const response = await fetch(API.CHAT_IMAGES, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dataUri, name })
  })
  await ensureOk(response, '上传图片失败')
  return await response.json()
}

export async function createChatMessageBySessionId(sessionId: string, payload: Record<string, unknown>): Promise<number> {
  const response = await fetch(API.chatSessionMessages(sessionId), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  await ensureOk(response, '发送消息失败')
  const result = await response.json()
  return readCreatedMessageId(result)
}

export async function fetchChatPersonalityModelContextBySessionId(
  sessionId: string,
  payload: ChatPersonalityModelContextPayload
): Promise<PersonalityModelContextBundle> {
  const response = await fetch(API.chatSessionPersonalityModelContext(sessionId), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {})
  })
  await ensureOk(response, '构建人格模型上下文失败')
  return await response.json() as PersonalityModelContextBundle
}

export async function fetchProjectionFirstMessageViewBySessionId(
  sessionId: string,
  payload: ChatProjectionFirstMessageViewPayload
): Promise<ProjectionFirstMessageViewResult> {
  const response = await fetch(API.chatSessionProjectionFirstMessageView(sessionId), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {})
  })
  await ensureOk(response, '构建投影优先消息视图失败')
  return await response.json() as ProjectionFirstMessageViewResult
}

export async function fetchChatPersonalityModelObservationsBySessionId(
  sessionId: string
): Promise<ChatPersonalityModelObservationPage> {
  const response = await fetch(API.chatSessionPersonalityModelObservations(sessionId))
  await ensureOk(response, '读取人格模型观察数据失败')
  const data = await response.json() as Partial<ChatPersonalityModelObservationPage>
  return {
    sessionId: String(data.sessionId || sessionId),
    projections: Array.isArray(data.projections) ? data.projections : [],
    visibility: Array.isArray(data.visibility) ? data.visibility : [],
    attempts: Array.isArray(data.attempts) ? data.attempts : [],
    traces: Array.isArray(data.traces) ? data.traces : []
  }
}

export async function runChatMessageProjectionBySessionId(
  sessionId: string,
  messageId: number | string,
  // 消耗溯源：批量投影传 op:batch_projection:… 单元 id；不传=服务端并入消息所在轮。
  usageUnit?: { unitId?: string; unitKind?: string; promptLogMode?: 'manual' | 'background' }
): Promise<Record<string, unknown>> {
  const response = await fetch(API.chatSessionMessageProjectionRun(sessionId, messageId), {
    method: 'POST',
    ...(usageUnit ? {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(usageUnit)
    } : {})
  })
  await ensureOk(response, '运行消息投影失败')
  const result = await response.json() as Record<string, unknown>
  // 投影行已写入（成功或失败行都算），通知两端投影灯重拉观察数据。
  bumpChatProjectionObservationTick()
  return result
}

export async function saveEmbeddedChatMessageProjectionBySessionId(
  sessionId: string,
  messageId: number | string,
  payload: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const response = await fetch(API.chatSessionMessageProjectionEmbedded(sessionId, messageId), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {})
  })
  await ensureOk(response, '保存内嵌消息投影失败')
  const result = await response.json() as Record<string, unknown>
  // 内嵌投影行已写入，通知两端投影灯重拉观察数据。
  bumpChatProjectionObservationTick()
  return result
}

export async function runChatProjectionWritebackBySessionId(
  sessionId: string,
  payload: ChatProjectionWritebackRunPayload
): Promise<Record<string, unknown>> {
  const response = await fetch(API.chatSessionPersonalityProjectionWritebackRun(sessionId), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {})
  })
  await ensureOk(response, '运行投影写轨迹失败')
  return await response.json() as Record<string, unknown>
}

export async function fetchChatMessageNotesBySessionId(sessionId: string): Promise<ChatMessageNote[]> {
  const response = await fetch(API.chatSessionMessageNotes(sessionId))
  await ensureOk(response, '加载消息笔记失败')
  const data = await response.json() as { notes?: ChatMessageNote[] }
  return Array.isArray(data.notes) ? data.notes : []
}

export async function createChatMessageNoteBySessionId(
  sessionId: string,
  payload: Record<string, unknown>
): Promise<ChatMessageNote> {
  const response = await fetch(API.chatSessionMessageNotes(sessionId), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {})
  })
  await ensureOk(response, '添加消息笔记失败')
  const data = await response.json() as { note?: ChatMessageNote }
  if (!data.note) throw new Error('添加消息笔记失败: 响应缺少 note')
  return data.note
}

export async function deleteChatMessageNoteBySessionId(sessionId: string, noteId: string): Promise<void> {
  const response = await fetch(API.chatSessionMessageNote(sessionId, noteId), { method: 'DELETE' })
  await ensureOk(response, '删除消息笔记失败')
}

export async function updateChatMessage(targetId: string, messageId: number, payload: Record<string, unknown>): Promise<void> {
  const normalizedTargetId = normalizeChatTargetId(targetId)
  const response = await fetch(API.chatMessage(normalizedTargetId, messageId), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  await ensureOk(response, '编辑消息失败')
}

export async function updateChatMessageBySessionId(sessionId: string, messageId: number, payload: Record<string, unknown>): Promise<void> {
  const response = await fetch(API.chatSessionMessage(sessionId, messageId), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  await ensureOk(response, '编辑消息失败')
}

export async function removeChatMessage(targetId: string, messageId: number): Promise<void> {
  const normalizedTargetId = normalizeChatTargetId(targetId)
  const response = await fetch(API.chatMessage(normalizedTargetId, messageId), {
    method: 'DELETE'
  })
  await ensureOk(response, '删除消息失败')
}

export async function removeChatMessageBySessionId(sessionId: string, messageId: number): Promise<void> {
  const response = await fetch(API.chatSessionMessage(sessionId, messageId), {
    method: 'DELETE'
  })
  await ensureOk(response, '删除消息失败')
}

export async function clearChatMessageList(targetId: string): Promise<void> {
  const normalizedTargetId = normalizeChatTargetId(targetId)
  const response = await fetch(API.chatMessages(normalizedTargetId), {
    method: 'DELETE'
  })
  await ensureOk(response, '清空聊天失败')
}

export async function clearChatMessageListBySessionId(sessionId: string): Promise<void> {
  const response = await fetch(API.chatSessionMessages(sessionId), {
    method: 'DELETE'
  })
  await ensureOk(response, '清空聊天失败')
}

export type ClearChatSessionContextOptions = {
  clearSessionTemporaryCharacters?: boolean
}

export async function clearChatSessionContextById(
  sessionId: string,
  options: ClearChatSessionContextOptions = {}
): Promise<void> {
  const response = await fetch(API.chatSessionClearContext(sessionId), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      clearSessionTemporaryCharacters: Boolean(options.clearSessionTemporaryCharacters)
    })
  })
  await ensureOk(response, '清空对话失败')
}

export async function createChatGenerationAttemptBySessionId(
  sessionId: string,
  payload: ChatGenerationAttemptPayload
): Promise<{ id: string }> {
  const response = await fetch(API.chatSessionGenerationAttempts(sessionId), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {})
  })
  await ensureOk(response, '保存生成尝试失败')
  const raw = await response.json() as { id?: string }
  return { id: String(raw?.id || '') }
}

export async function updateChatGenerationAttemptBySessionId(
  sessionId: string,
  attemptId: string,
  payload: ChatGenerationAttemptPayload
): Promise<void> {
  const response = await fetch(API.chatSessionGenerationAttempt(sessionId, attemptId), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {})
  })
  await ensureOk(response, '更新生成尝试失败')
}

export async function fetchLatestChatGenerationAttemptByAnchor(
  sessionId: string,
  anchorMessageId: number
): Promise<ChatGenerationAttemptEntry | null> {
  const response = await fetch(API.chatSessionGenerationAttemptLatest(sessionId, anchorMessageId))
  await ensureOk(response, '读取生成尝试失败')
  const data = await response.json() as ChatGenerationAttemptEntry | null
  return data && data.id ? data : null
}

export async function fetchChatGenerationAttemptsBySessionId(
  sessionId: string,
  limit = 200
): Promise<ChatGenerationAttemptEntry[]> {
  const response = await fetch(`${API.chatSessionGenerationAttempts(sessionId)}?limit=${encodeURIComponent(String(limit || 200))}`)
  await ensureOk(response, '读取生成尝试列表失败')
  const data = await response.json() as ChatGenerationAttemptEntry[]
  return Array.isArray(data) ? data.filter((item) => item && item.id) : []
}

// 按轮级提调主键聚合一轮所有 attempt（编排带一轮一条、按轮审计的数据入口）。
export async function fetchChatGenerationAttemptsByRunId(
  sessionId: string,
  tidiaoRunId: string,
  limit = 200
): Promise<ChatGenerationAttemptEntry[]> {
  const runId = String(tidiaoRunId || '').trim()
  if (!sessionId || !runId) return []
  const response = await fetch(API.chatSessionGenerationAttemptsByRun(sessionId, runId, limit))
  await ensureOk(response, '读取生成尝试列表失败')
  const data = await response.json() as ChatGenerationAttemptEntry[]
  return Array.isArray(data) ? data.filter((item) => item && item.id) : []
}

export async function createChatGenerationAttemptArtifactBySessionId(
  sessionId: string,
  payload: ChatGenerationAttemptArtifactPayload
): Promise<{ id: string }> {
  const response = await fetch(API.chatSessionGenerationAttemptArtifacts(sessionId), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {})
  })
  await ensureOk(response, '保存生成尝试产物失败')
  const raw = await response.json() as { id?: string }
  return { id: String(raw?.id || '') }
}

export async function saveChatSessionPatch(targetId: string, payload: Record<string, unknown>): Promise<void> {
  const normalizedTargetId = normalizeChatTargetId(targetId)
  const response = await fetch(API.chatSessionPatch(normalizedTargetId), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  await ensureOk(response, '更新会话设置失败')
}

export async function saveChatSessionPatchById(sessionId: string, payload: Record<string, unknown>): Promise<void> {
  const response = await fetch(API.chatSessionById(sessionId), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  await ensureOk(response, '更新会话设置失败')
}

export async function deleteChatSessionById(sessionId: string): Promise<void> {
  const response = await fetch(API.chatSessionById(sessionId), {
    method: 'DELETE'
  })
  await ensureOk(response, '删除会话失败')
}

export async function deleteChatSessionsByIds(sessionIds: string[]): Promise<void> {
  const response = await fetch(API.CHAT_SESSIONS_BATCH_DELETE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionIds })
  })
  await ensureOk(response, '批量删除会话失败')
}

export async function archiveChatSessionById(sessionId: string, payload: { name?: string; category?: string } = {}): Promise<ChatArchiveRecord> {
  const response = await fetch(API.chatSessionArchive(sessionId), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  await ensureOk(response, '归档会话失败')
  return await response.json() as ChatArchiveRecord
}

export async function fetchChatPromptLogs(targetId: string, page = 1): Promise<ChatPromptLogPage> {
  const normalizedTargetId = normalizeChatTargetId(targetId)
  const response = await fetch(`${API.chatPromptLogs(normalizedTargetId)}?page=${encodeURIComponent(String(page || 1))}`)
  await ensureOk(response, '加载提示词日志失败')
  const raw = await response.json() as {
    entries?: ChatPromptLogEntry[]
    page?: number
    pageSize?: number
    total?: number
    totalPages?: number
  }
  return {
    sessionId: normalizedTargetId,
    currentPage: Number(raw.page || page || 1),
    pageSize: Number(raw.pageSize || 30),
    totalEntries: Number(raw.total || 0),
    totalPages: Number(raw.totalPages || 1),
    items: Array.isArray(raw.entries) ? raw.entries : []
  }
}

export async function fetchChatPromptLogsBySessionId(sessionId: string, page = 1): Promise<ChatPromptLogPage> {
  const response = await fetch(`${API.chatSessionPromptLogs(sessionId)}?page=${encodeURIComponent(String(page || 1))}`)
  await ensureOk(response, '加载提示词日志失败')
  const raw = await response.json() as {
    entries?: ChatPromptLogEntry[]
    page?: number
    pageSize?: number
    total?: number
    totalPages?: number
  }
  return {
    sessionId,
    currentPage: Number(raw.page || page || 1),
    pageSize: Number(raw.pageSize || 30),
    totalEntries: Number(raw.total || 0),
    totalPages: Number(raw.totalPages || 1),
    items: Array.isArray(raw.entries) ? raw.entries : []
  }
}

export async function createChatPromptLog(targetId: string, payload: ChatPromptLogCreatePayload): Promise<{ id: string }> {
  const normalizedTargetId = normalizeChatTargetId(targetId)
  const response = await fetch(API.chatPromptLogs(normalizedTargetId), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  await ensureOk(response, '保存提示词日志失败')
  const raw = await response.json() as { id?: string }
  return { id: String(raw?.id || '') }
}

export async function createChatPromptLogBySessionId(sessionId: string, payload: ChatPromptLogCreatePayload): Promise<{ id: string }> {
  const response = await fetch(API.chatSessionPromptLogs(sessionId), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  await ensureOk(response, '保存提示词日志失败')
  const raw = await response.json() as { id?: string }
  return { id: String(raw?.id || '') }
}

export async function bindChatPromptLogMessage(targetId: string, logId: string, assistantMessageId: number): Promise<void> {
  const normalizedTargetId = normalizeChatTargetId(targetId)
  const response = await fetch(API.chatPromptLogBind(normalizedTargetId, logId), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messageId: assistantMessageId, assistantMessageId })
  })
  await ensureOk(response, '绑定提示词日志失败')
}

export async function deleteChatPromptLogsByMessageId(targetId: string, assistantMessageId: number, keepLogId = ''): Promise<void> {
  const normalizedTargetId = normalizeChatTargetId(targetId)
  const response = await fetch(API.chatPromptLogsByMessage(normalizedTargetId, assistantMessageId, keepLogId), {
    method: 'DELETE'
  })
  await ensureOk(response, '清理提示词日志失败')
}

export async function bindChatPromptLogMessageBySessionId(sessionId: string, logId: string, assistantMessageId: number): Promise<void> {
  const response = await fetch(API.chatSessionPromptLogBind(sessionId, logId), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messageId: assistantMessageId, assistantMessageId })
  })
  await ensureOk(response, '绑定提示词日志失败')
}

export async function deleteChatPromptLogsBySessionMessageId(sessionId: string, assistantMessageId: number, keepLogId = ''): Promise<void> {
  const response = await fetch(API.chatSessionPromptLogsByMessage(sessionId, assistantMessageId, keepLogId), {
    method: 'DELETE'
  })
  await ensureOk(response, '清理提示词日志失败')
}

export async function locateChatPromptLog(targetId: string, assistantMessageId: number, kind = ''): Promise<ChatPromptLogLocateResult> {
  const normalizedTargetId = normalizeChatTargetId(targetId)
  const response = await fetch(API.chatPromptLogLocate(normalizedTargetId, assistantMessageId, kind))
  await ensureOk(response, '定位提示词日志失败')
  return await response.json() as ChatPromptLogLocateResult
}

export async function locateChatPromptLogBySessionId(sessionId: string, assistantMessageId: number, kind = ''): Promise<ChatPromptLogLocateResult> {
  const response = await fetch(API.chatSessionPromptLogLocate(sessionId, assistantMessageId, kind))
  await ensureOk(response, '定位提示词日志失败')
  return await response.json() as ChatPromptLogLocateResult
}

export async function locateChatPromptLogByLogId(targetId: string, logId: string): Promise<ChatPromptLogLocateResult> {
  const normalizedTargetId = normalizeChatTargetId(targetId)
  const response = await fetch(API.chatPromptLogLocateByLogId(normalizedTargetId, logId))
  await ensureOk(response, '定位提示词日志失败')
  return await response.json() as ChatPromptLogLocateResult
}

export async function locateChatPromptLogBySessionLogId(sessionId: string, logId: string): Promise<ChatPromptLogLocateResult> {
  const response = await fetch(API.chatSessionPromptLogLocateByLogId(sessionId, logId))
  await ensureOk(response, '定位提示词日志失败')
  return await response.json() as ChatPromptLogLocateResult
}

export async function fetchLatestChatPromptLogByMessageId(targetId: string, assistantMessageId: number): Promise<ChatPromptLogEntry | null> {
  const location = await locateChatPromptLog(targetId, assistantMessageId)
  if (location.entry) return location.entry
  const page = await fetchChatPromptLogs(targetId, location.page || 1)
  return page.items.find((item) => String(item.id) === String(location.logId)) || null
}

export async function fetchLatestChatPromptLogBySessionMessageId(sessionId: string, assistantMessageId: number): Promise<ChatPromptLogEntry | null> {
  const location = await locateChatPromptLogBySessionId(sessionId, assistantMessageId)
  if (location.entry) return location.entry
  const page = await fetchChatPromptLogsBySessionId(sessionId, location.page || 1)
  return page.items.find((item) => String(item.id) === String(location.logId)) || null
}

export async function fetchChatRecallActivityLogsBySessionId(
  sessionId: string,
  page = 1,
  options: { signal?: AbortSignal } = {}
): Promise<ChatRecallActivityLogPage> {
  const response = await fetch(`${API.chatSessionRecallActivityLogs(sessionId)}?page=${encodeURIComponent(String(page || 1))}`, {
    signal: options.signal
  })
  await ensureOk(response, '加载召回活动日志失败')
  const raw = await response.json() as {
    entries?: ChatRecallActivityLogEntry[]
    page?: number
    pageSize?: number
    total?: number
    totalPages?: number
  }
  return {
    sessionId,
    currentPage: Number(raw.page || page || 1),
    pageSize: Number(raw.pageSize || 30),
    totalEntries: Number(raw.total || 0),
    totalPages: Number(raw.totalPages || 1),
    items: Array.isArray(raw.entries) ? raw.entries : []
  }
}

export async function loadAllChatRecallActivityLogsBySessionId(
  sessionId: string,
  options: { signal?: AbortSignal; concurrency?: number } = {}
): Promise<ChatRecallActivityLogEntry[]> {
  const firstPage = await fetchChatRecallActivityLogsBySessionId(sessionId, 1, { signal: options.signal })
  const totalPages = Math.max(1, Number(firstPage.totalPages || 1))
  if (totalPages === 1) return [...firstPage.items]

  const pages: ChatRecallActivityLogEntry[][] = Array.from({ length: totalPages }, () => [])
  pages[0] = firstPage.items
  const pageNumbers = Array.from({ length: totalPages - 1 }, (_, index) => index + 2)
  const concurrency = Math.max(1, Math.min(8, Math.floor(Number(options.concurrency) || 4), pageNumbers.length))
  let cursor = 0
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (cursor < pageNumbers.length) {
      if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
      const page = pageNumbers[cursor]
      cursor += 1
      const result = await fetchChatRecallActivityLogsBySessionId(sessionId, page, { signal: options.signal })
      pages[page - 1] = result.items
    }
  }))
  return pages.flat()
}

function normalizeCreatedRecallActivityLog(raw: unknown): ChatRecallActivityLogEntry {
  const record = raw && typeof raw === 'object' ? raw as Partial<ChatRecallActivityLogEntry> : {}
  return {
    ...(record as ChatRecallActivityLogEntry),
    id: String(record.id || ''),
    sessionId: String(record.sessionId || ''),
    pageIndex: Number(record.pageIndex || 0),
    entryIndex: Number(record.entryIndex || 0),
    inputMessageId: Number(record.inputMessageId || 0),
    assistantMessageId: Number(record.assistantMessageId || 0),
    activity: decodeRecallActivityLogValue(record.activity),
    createdAt: String(record.createdAt || '')
  }
}

export async function createChatRecallActivityLog(targetId: string, payload: ChatRecallActivityLogCreatePayload): Promise<ChatRecallActivityLogEntry> {
  const normalizedTargetId = normalizeChatTargetId(targetId)
  const response = await fetch(API.chatRecallActivityLogs(normalizedTargetId), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(encodeRecallActivityLogPayload(payload))
  })
  await ensureOk(response, '保存召回活动日志失败')
  return normalizeCreatedRecallActivityLog(await response.json())
}

export async function createChatRecallActivityLogBySessionId(sessionId: string, payload: ChatRecallActivityLogCreatePayload): Promise<ChatRecallActivityLogEntry> {
  const response = await fetch(API.chatSessionRecallActivityLogs(sessionId), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(encodeRecallActivityLogPayload(payload))
  })
  await ensureOk(response, '保存召回活动日志失败')
  return normalizeCreatedRecallActivityLog(await response.json())
}

export async function bindChatRecallActivityLogMessage(
  targetId: string,
  logId: string,
  assistantMessageId: number,
  inputMessageId = 0,
  payload: ChatRecallActivityLogBindPayload = {}
): Promise<void> {
  const normalizedTargetId = normalizeChatTargetId(targetId)
  const response = await fetch(API.chatRecallActivityLogBind(normalizedTargetId, logId), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(encodeRecallActivityLogPayload({ messageId: assistantMessageId, assistantMessageId, inputMessageId, ...payload }))
  })
  await ensureOk(response, '绑定召回活动日志失败')
}

export async function bindChatRecallActivityLogMessageBySessionId(
  sessionId: string,
  logId: string,
  assistantMessageId: number,
  inputMessageId = 0,
  payload: ChatRecallActivityLogBindPayload = {}
): Promise<void> {
  const response = await fetch(API.chatSessionRecallActivityLogBind(sessionId, logId), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(encodeRecallActivityLogPayload({ messageId: assistantMessageId, assistantMessageId, inputMessageId, ...payload }))
  })
  await ensureOk(response, '绑定召回活动日志失败')
}

export async function locateChatRecallActivityLog(targetId: string, assistantMessageId: number): Promise<ChatRecallActivityLogEntry | null> {
  const normalizedTargetId = normalizeChatTargetId(targetId)
  const response = await fetch(API.chatRecallActivityLogLocate(normalizedTargetId, assistantMessageId))
  if (response.status === 404) return null
  await ensureOk(response, '定位召回活动日志失败')
  return await response.json() as ChatRecallActivityLogEntry
}

export async function locateChatRecallActivityLogBySessionId(sessionId: string, assistantMessageId: number): Promise<ChatRecallActivityLogEntry | null> {
  const response = await fetch(API.chatSessionRecallActivityLogLocate(sessionId, assistantMessageId))
  if (response.status === 404) return null
  await ensureOk(response, '定位召回活动日志失败')
  return await response.json() as ChatRecallActivityLogEntry
}

export async function prepareImprovisedCharacterContextBySessionId(
  sessionId: string,
  targetName: string
): Promise<ImprovisedCharacterContextBuildResult> {
  const response = await fetch(API.chatSessionImprovisedCharacterContext(sessionId), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ targetName })
  })
  await ensureOk(response, '收集即兴角色上下文失败')
  return await response.json() as ImprovisedCharacterContextBuildResult
}

export interface ImprovisedCharacterExtractResult extends ImprovisedCharacterExtractionOutput {
  ok?: boolean
  command: ImprovisedCharacterContextBuildResult['command']
  context: ImprovisedCharacterContextBuildResult
  rawOutput: string
  promptLogId: string
  auditMessageId: number
  usedModel?: string
  usedPreset?: string
  nextStage?: string
}

export interface ImprovisedCharacterCreateResult extends ImprovisedCharacterExtractResult {
  character: Record<string, unknown>
  group: Record<string, unknown>
  participant: Record<string, unknown>
}

export async function extractImprovisedCharacterBySessionId(
  sessionId: string,
  targetName: string
): Promise<ImprovisedCharacterExtractResult> {
  const response = await fetch(API.chatSessionImprovisedCharacterExtract(sessionId), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ targetName })
  })
  await ensureOk(response, '提取即兴角色资料失败')
  return await response.json() as ImprovisedCharacterExtractResult
}

export async function createImprovisedCharacterBySessionId(
  sessionId: string,
  targetName: string,
  options: { finalName?: string; allowDuplicateName?: boolean } = {}
): Promise<ImprovisedCharacterCreateResult> {
  const response = await fetch(API.chatSessionImprovisedCharacterCreate(sessionId), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      targetName,
      finalName: options.finalName,
      allowDuplicateName: options.allowDuplicateName === true
    })
  })
  await ensureOk(response, '创建即兴角色失败')
  return await response.json() as ImprovisedCharacterCreateResult
}

export async function fetchChatArchives(): Promise<ChatArchiveRecord[]> {
  const response = await fetch(API.chatArchives)
  await ensureOk(response, '加载聊天记录失败')
  return await response.json() as ChatArchiveRecord[]
}

export async function startNewChatSession(targetId: string): Promise<ChatSessionBundle> {
  const normalizedTargetId = normalizeChatTargetId(targetId)
  const response = await fetch(API.chatArchiveNewChat(normalizedTargetId), {
    method: 'POST'
  })
  await ensureOk(response, '开始新对话失败')
  return await response.json() as ChatSessionBundle
}

export async function renameChatArchive(archiveId: string, payload: { name?: string; category?: string }): Promise<void> {
  const response = await fetch(API.chatArchive(archiveId), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  await ensureOk(response, '更新聊天记录失败')
}

export async function deleteChatArchives(ids: string[]): Promise<void> {
  const response = await fetch(API.chatArchives, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids })
  })
  await ensureOk(response, '删除聊天记录失败')
}

export async function loadChatArchiveIntoTarget(archiveId: string, targetId: string): Promise<void> {
  const normalizedTargetId = normalizeChatTargetId(targetId)
  const response = await fetch(API.chatArchiveLoad(archiveId, normalizedTargetId), {
    method: 'POST'
  })
  await ensureOk(response, '加载聊天记录失败')
}

export async function exportChatArchives(ids: string[]): Promise<ChatArchiveExportBundle> {
  const response = await fetch(API.chatArchiveExport, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids })
  })
  await ensureOk(response, '导出聊天记录失败')
  return await response.json() as ChatArchiveExportBundle
}

export async function importChatArchives(payload: ChatArchiveExportBundle): Promise<void> {
  const response = await fetch(API.chatArchiveImport, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  await ensureOk(response, '导入聊天记录失败')
}

export async function createSummaryRecord(
  endpoint: string,
  payload: ChatSummaryRecord,
  fallbackMessage: string
): Promise<void> {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  await ensureOk(response, fallbackMessage)
}

export async function updateSummaryRecord(
  endpoint: string,
  id: string,
  payload: Partial<ChatSummaryRecord>,
  fallbackMessage: string
): Promise<void> {
  const response = await fetch(`${endpoint}/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  await ensureOk(response, fallbackMessage)
}

export async function deleteSummaryRecord(
  endpoint: string,
  id: string,
  fallbackMessage: string
): Promise<void> {
  const response = await fetch(`${endpoint}/${id}`, {
    method: 'DELETE'
  })
  await ensureOk(response, fallbackMessage)
}
