import type { Ref } from 'vue'
import type { ApiPreset } from '../types'
import type { useResourceStore } from '../stores/resourceStore'
import type { useCharacterStore } from '../stores/characterStore'
import type { useChatStore } from '../stores/chatStore'
import type { useSettingStore } from '../stores/settingStore'
import type { useTaskStore } from '../stores/taskStore'
import type {
  BootstrapSnapshotV1,
  LocalArchiveSnapshotV1,
  WorkspaceSnapshotEnvelope,
  WorkspaceSettingsSnapshot,
  WorkspaceSnapshotKind,
  WorkspaceSnapshotV1
} from '../types/workspace'

type ResourceStore = ReturnType<typeof useResourceStore>
type CharacterStore = ReturnType<typeof useCharacterStore>
type ChatStore = ReturnType<typeof useChatStore>
type SettingStore = ReturnType<typeof useSettingStore>
type TaskStore = ReturnType<typeof useTaskStore>
type UnknownRecord = Record<string, unknown>

type BuildWorkspaceSnapshotDeps = {
  resourceStore: ResourceStore
  charStore: CharacterStore
  chatStore: ChatStore
  settingStore: SettingStore
  taskStore: TaskStore
  timerComposable?: {
    getSerializableTimers?: () => unknown[]
  }
  customTags?: Ref<unknown[]>
  eventStack?: Ref<unknown[]>
}

const WORKSPACE_SNAPSHOT_VERSION = 1 as const
const LEGACY_SETTINGS_KEYS = [
  'apiPresets',
  'defaultPreset',
  'promptPresets',
  'currentTime',
  'currentWeather',
  'currentLocation',
  'weatherDetail',
  'locationHistory',
  'weatherHistory',
  'darkMode',
  'aiEvaluationEnabled',
  'summaryPrompt',
  'bigSummaryPrompt',
  'dailyReportPrompt',
  'chatSummaryPresetName',
  'chatSummaryModel',
  'agentModelConfigs'
] as const

function toRecord(input: unknown): UnknownRecord {
  return input && typeof input === 'object' ? input as UnknownRecord : {}
}

function unwrapWorkspaceEnvelope(input: unknown): UnknownRecord {
  const record = toRecord(input)
  if (record.payload && typeof record.payload === 'object') {
    return toRecord(record.payload)
  }
  return record
}

function normalizeDefaultPreset(input: unknown): ApiPreset | null {
  const value = input && typeof input === 'object' ? input as ApiPreset : null
  return value ?? null
}

function readLegacySettingsMirror(snapshot: UnknownRecord) {
  return Object.fromEntries(LEGACY_SETTINGS_KEYS.map((key) => [key, snapshot[key]])) as UnknownRecord
}

function stripLegacySettingsMirror(snapshot: UnknownRecord): UnknownRecord {
  const {
    apiPresets,
    defaultPreset,
    promptPresets,
    currentTime,
    currentWeather,
    currentLocation,
    weatherDetail,
    locationHistory,
    weatherHistory,
    darkMode,
    aiEvaluationEnabled,
    summaryPrompt,
    bigSummaryPrompt,
    dailyReportPrompt,
    chatSummaryPresetName,
    chatSummaryModel,
    agentModelConfigs,
    ...rest
  } = snapshot

  void apiPresets
  void defaultPreset
  void promptPresets
  void currentTime
  void currentWeather
  void currentLocation
  void weatherDetail
  void locationHistory
  void weatherHistory
  void darkMode
  void aiEvaluationEnabled
  void summaryPrompt
  void bigSummaryPrompt
  void dailyReportPrompt
  void chatSummaryPresetName
  void chatSummaryModel
  void agentModelConfigs

  return rest
}

function stripLegacyChatProjection(snapshot: UnknownRecord): UnknownRecord {
  const {
    currentChatTarget,
    currentSession,
    currentMessages,
    ...rest
  } = snapshot

  void currentChatTarget
  void currentSession
  void currentMessages

  return rest
}

function readStoreState<T>(container: unknown, key: string): T | undefined {
  const record = container && typeof container === 'object'
    ? container as Record<string, T | { value: T }>
    : undefined
  const value = record?.[key]
  if (value && typeof value === 'object' && 'value' in value) {
    return (value as { value: T }).value
  }
  return value as T | undefined
}

function readUnknownArray(input: unknown): unknown[] {
  return Array.isArray(input) ? input : []
}

function readEntityCollection(input: unknown): unknown[] {
  if (Array.isArray(input)) {
    return input
  }
  if (input && typeof input === 'object') {
    return Object.values(input as Record<string, unknown>)
  }
  return []
}

function readChatSessionSnapshot(chatStore: ChatStore): unknown[] {
  const entitySessions = readStoreState<Record<string, unknown> | unknown[]>(chatStore, 'entities')
  const sessions = entitySessions && typeof entitySessions === 'object'
    ? (entitySessions as Record<string, unknown>).chatSessions
    : undefined

  return readEntityCollection(sessions ?? readStoreState(chatStore, 'chatSessions'))
}

function readChatMessageSnapshot(chatStore: ChatStore): unknown[] {
  const entities = readStoreState<Record<string, unknown>>(chatStore, 'entities')
  const entityMessages = entities && typeof entities === 'object'
    ? (entities as Record<string, unknown>).chatMessages
    : undefined

  if (Array.isArray(entityMessages)) {
    return entityMessages
  }
  if (entityMessages && typeof entityMessages === 'object') {
    return Object.values(entityMessages as Record<string, unknown>).flatMap((value) => readUnknownArray(value))
  }

  return readUnknownArray(readStoreState(chatStore, 'chatMessages'))
}

function readChatSessionParticipantSnapshot(chatStore: ChatStore): unknown[] {
  const sessions = readChatSessionSnapshot(chatStore)
  return sessions.flatMap((session) => {
    if (!session || typeof session !== 'object') return []
    const sessionRecord = session as Record<string, unknown>
    const sessionId = String(sessionRecord.id || '').trim()
    const participants = readUnknownArray(sessionRecord.participants)
    return participants.map((participant, index) => {
      if (!participant || typeof participant !== 'object') return participant
      return {
        ...participant as Record<string, unknown>,
        sessionId: String((participant as Record<string, unknown>).sessionId || sessionId),
        displayOrder: Number((participant as Record<string, unknown>).displayOrder ?? index)
      }
    })
  })
}

function readString(input: unknown, fallback = ''): string {
  return typeof input === 'string' ? input : fallback
}

function readCurrentSessionId(chatStore: ChatStore): string {
  const currentState = readStoreState<Record<string, unknown>>(chatStore, 'current')
  const currentSession = readStoreState<UnknownRecord>(currentState, 'currentSession')
    ?? readStoreState<UnknownRecord>(chatStore, 'currentSession')
  return String(currentSession?.id || '').trim()
}

function readNullableBoolean(input: unknown): boolean | null {
  return typeof input === 'boolean' ? input : null
}

function readNullableRecord(input: unknown): Record<string, unknown> | null {
  return input && typeof input === 'object' && !Array.isArray(input)
    ? input as Record<string, unknown>
    : null
}

function readWeatherDetail(input: unknown): Record<string, unknown> | string | null {
  if (typeof input === 'string') return input
  return readNullableRecord(input)
}

export function buildWorkspaceSettingsSnapshot(input?: unknown): WorkspaceSettingsSnapshot {
  const snapshot = toRecord(input)
  const settings = toRecord(snapshot.settings)
  const legacySettings = readLegacySettingsMirror(snapshot)

  return {
    apiPresets: readUnknownArray(settings.apiPresets ?? legacySettings.apiPresets) as ApiPreset[],
    defaultPreset: normalizeDefaultPreset(settings.defaultPreset ?? legacySettings.defaultPreset),
    aiProviderMode: 'custom',
    promptPresets: readUnknownArray(settings.promptPresets ?? legacySettings.promptPresets) as WorkspaceSettingsSnapshot['promptPresets'],
    currentTime: readString(settings.currentTime ?? legacySettings.currentTime),
    currentWeather: readString(settings.currentWeather ?? legacySettings.currentWeather),
    currentLocation: readString(settings.currentLocation ?? legacySettings.currentLocation),
    weatherDetail: readWeatherDetail(settings.weatherDetail ?? legacySettings.weatherDetail),
    locationHistory: readUnknownArray(settings.locationHistory ?? legacySettings.locationHistory),
    weatherHistory: readUnknownArray(settings.weatherHistory ?? legacySettings.weatherHistory),
    darkMode: readNullableBoolean(settings.darkMode ?? legacySettings.darkMode),
    aiEvaluationEnabled: readNullableBoolean(settings.aiEvaluationEnabled ?? legacySettings.aiEvaluationEnabled),
    summaryPrompt: readString(settings.summaryPrompt ?? legacySettings.summaryPrompt),
    bigSummaryPrompt: readString(settings.bigSummaryPrompt ?? legacySettings.bigSummaryPrompt),
    dailyReportPrompt: readString(settings.dailyReportPrompt ?? legacySettings.dailyReportPrompt),
    chatSummaryPresetName: readString(settings.chatSummaryPresetName ?? legacySettings.chatSummaryPresetName),
    chatSummaryModel: readString(settings.chatSummaryModel ?? legacySettings.chatSummaryModel),
    agentModelConfigs: readUnknownArray(settings.agentModelConfigs ?? legacySettings.agentModelConfigs) as WorkspaceSettingsSnapshot['agentModelConfigs']
  }
}

function materializeWorkspaceSnapshot(
  snapshot: UnknownRecord,
  snapshotKind: WorkspaceSnapshotKind
): WorkspaceSnapshotV1 {
  const settings = buildWorkspaceSettingsSnapshot(snapshot)
  const snapshotBody = stripLegacyChatProjection(stripLegacySettingsMirror(snapshot))
  const workspaceTarget = String(
    snapshot.workspaceTarget
    || snapshot.workspaceCurrentTarget
    || snapshot.currentChatTarget
    || ''
  ).trim()
  const workspaceSessionId = String(
    snapshot.workspaceSessionId
    || toRecord(snapshot.currentSession).id
    || ''
  ).trim()

  return {
    ...snapshotBody,
    version: WORKSPACE_SNAPSHOT_VERSION,
    snapshotKind,
    workspaceTarget: workspaceTarget || undefined,
    workspaceSessionId: workspaceSessionId || undefined,
    settings
  }
}

export function normalizeWorkspaceSnapshot(
  input: unknown,
  snapshotKind: WorkspaceSnapshotKind = 'workspace'
): WorkspaceSnapshotV1 {
  const snapshot = unwrapWorkspaceEnvelope(input)
  const resolvedKind = typeof snapshot.snapshotKind === 'string'
    ? snapshot.snapshotKind as WorkspaceSnapshotKind
    : snapshotKind
  return materializeWorkspaceSnapshot(snapshot, resolvedKind)
}

export function buildWorkspaceSnapshotFromStores(
  deps: BuildWorkspaceSnapshotDeps,
  baseSnapshot?: unknown,
  snapshotKind: WorkspaceSnapshotKind = 'workspace'
): WorkspaceSnapshotV1 {
  const base = toRecord(baseSnapshot)
  const baseSettings = buildWorkspaceSettingsSnapshot(base)
  const summaryState = deps.chatStore.summaries
  const currentState = deps.chatStore.current

  const snapshot = {
    ...base,
    resources: base.resources ?? {
      points: deps.resourceStore.points,
      bigTimeCount: deps.resourceStore.bigTimeCount,
      smallTimeCount: deps.resourceStore.smallTimeCount,
      money: deps.resourceStore.money
    },
    tickets: base.tickets ?? deps.resourceStore.tickets,
    ticketCategories: base.ticketCategories ?? deps.resourceStore.ticketCategories,
    history: base.history ?? deps.resourceStore.history,
    timers: base.timers ?? deps.timerComposable?.getSerializableTimers?.() ?? [],
    characters: base.characters ?? deps.charStore.characters,
    characterGroups: base.characterGroups ?? deps.charStore.characterGroups,
    groups: base.groups ?? deps.charStore.groups,
    crowds: base.crowds ?? deps.charStore.crowds,
    aliases: base.aliases ?? deps.charStore.aliases,
    userProfile: base.userProfile ?? deps.charStore.userProfile,
    documents: base.documents ?? deps.charStore.documents ?? [],
    brainNeurons: base.brainNeurons ?? deps.charStore.brainNeurons ?? [],
    summaryLibrary: base.summaryLibrary ?? readStoreState(summaryState, 'summaryLibrary') ?? [],
    smallSummaries: base.smallSummaries ?? readStoreState(summaryState, 'smallSummaries') ?? [],
    bigSummaries: base.bigSummaries ?? readStoreState(summaryState, 'bigSummaries') ?? [],
    workspaceTarget: base.workspaceTarget
      ?? currentState?.getWorkspaceCurrentTarget?.()
      ?? deps.chatStore.getWorkspaceCurrentTarget?.()
      ?? currentState?.getActiveTargetId?.()
      ?? deps.chatStore.getActiveTargetId?.()
      ?? readStoreState(currentState, 'workspaceCurrentTarget')
      ?? readStoreState(currentState, 'currentChatTarget')
      ?? '',
    workspaceSessionId: base.workspaceSessionId ?? readCurrentSessionId(deps.chatStore) ?? '',
    chatSessions: base.chatSessions ?? readChatSessionSnapshot(deps.chatStore),
    chatSessionParticipants: base.chatSessionParticipants ?? readChatSessionParticipantSnapshot(deps.chatStore),
    chatSessionTemporaryCharacters: base.chatSessionTemporaryCharacters ?? [],
    chatSessionTemporaryEntities: base.chatSessionTemporaryEntities ?? [],
    chatMessages: base.chatMessages ?? readChatMessageSnapshot(deps.chatStore),
    chatMessageNotes: base.chatMessageNotes ?? [],
    chatPromptLogs: base.chatPromptLogs ?? [],
    tasks: base.tasks ?? deps.taskStore.tasks,
    taskLogs: base.taskLogs ?? deps.taskStore.taskLogs,
    dailyReports: base.dailyReports ?? deps.taskStore.dailyReports,
    userLevel: base.userLevel ?? deps.taskStore.userLevel,
    dailyActivity: base.dailyActivity ?? deps.taskStore.dailyActivity,
    recentMarkTypes: base.recentMarkTypes ?? deps.taskStore.recentMarkTypes,
    customTags: base.customTags ?? deps.customTags?.value ?? [],
    eventStack: base.eventStack ?? deps.eventStack?.value ?? [],
    exportTime: base.exportTime ?? new Date().toISOString(),
    settings: {
      apiPresets: deps.settingStore.apiPresets ?? baseSettings.apiPresets,
      defaultPreset: deps.settingStore.defaultPreset ?? baseSettings.defaultPreset,
      aiProviderMode: deps.settingStore.aiProviderMode ?? baseSettings.aiProviderMode,
      promptPresets: deps.settingStore.promptPresets ?? baseSettings.promptPresets,
      currentTime: deps.settingStore.currentTime ?? baseSettings.currentTime,
      currentWeather: deps.settingStore.currentWeather ?? baseSettings.currentWeather,
      currentLocation: deps.settingStore.currentLocation ?? baseSettings.currentLocation,
      weatherDetail: deps.settingStore.weatherDetail ?? baseSettings.weatherDetail,
      locationHistory: deps.settingStore.locationHistory ?? baseSettings.locationHistory,
      weatherHistory: deps.settingStore.weatherHistory ?? baseSettings.weatherHistory,
      darkMode: deps.settingStore.darkMode ?? baseSettings.darkMode,
      aiEvaluationEnabled: deps.settingStore.aiEvaluationEnabled ?? baseSettings.aiEvaluationEnabled,
      summaryPrompt: deps.settingStore.summaryPrompt ?? baseSettings.summaryPrompt,
      bigSummaryPrompt: deps.settingStore.bigSummaryPrompt ?? baseSettings.bigSummaryPrompt,
      dailyReportPrompt: deps.settingStore.dailyReportPrompt ?? baseSettings.dailyReportPrompt,
      chatSummaryPresetName: deps.settingStore.chatSummaryPresetName ?? baseSettings.chatSummaryPresetName,
      chatSummaryModel: deps.settingStore.chatSummaryModel ?? baseSettings.chatSummaryModel,
      agentModelConfigs: deps.settingStore.agentModelConfigs ?? baseSettings.agentModelConfigs
    }
  }

  return materializeWorkspaceSnapshot(snapshot, snapshotKind)
}

export function toBootstrapSnapshot(input: unknown): BootstrapSnapshotV1 {
  return normalizeWorkspaceSnapshot(input, 'bootstrap') as BootstrapSnapshotV1
}

export function toLocalArchiveSnapshot(input: unknown): LocalArchiveSnapshotV1 {
  return normalizeWorkspaceSnapshot(input, 'archive') as LocalArchiveSnapshotV1
}

export function buildLocalArchiveRestorePayload(input: unknown): WorkspaceSnapshotV1 {
  return normalizeWorkspaceSnapshot(input, 'archive')
}

export function wrapWorkspaceSnapshotEnvelope(
  input: unknown,
  snapshotKind: WorkspaceSnapshotKind = 'workspace',
  workspaceId = 'default-workspace'
): WorkspaceSnapshotEnvelope {
  return {
    version: WORKSPACE_SNAPSHOT_VERSION,
    workspaceId,
    generatedAt: new Date().toISOString(),
    payload: normalizeWorkspaceSnapshot(input, snapshotKind)
  }
}
