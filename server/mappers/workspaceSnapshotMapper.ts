import type {
  BootstrapSnapshotV1,
  LocalArchiveSnapshotV1,
  WorkspaceSettingsSnapshot,
  WorkspaceSnapshotEnvelope,
  WorkspaceSnapshotKind,
  WorkspaceSnapshotV1
} from '../snapshots/contracts.js'

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

function toRecord(input: unknown): Record<string, any> {
  return input && typeof input === 'object' ? input as Record<string, any> : {}
}

function unwrapWorkspaceEnvelope(input: unknown): Record<string, any> {
  const record = toRecord(input)
  if (record.payload && typeof record.payload === 'object') {
    return toRecord(record.payload)
  }
  return record
}

function stripLegacySettingsMirror(snapshot: Record<string, any>): Record<string, any> {
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

function readLegacySettingsMirror(snapshot: Record<string, any>) {
  return Object.fromEntries(LEGACY_SETTINGS_KEYS.map((key) => [key, snapshot[key]])) as Record<string, any>
}

export function buildWorkspaceSettingsSnapshot(input?: unknown): WorkspaceSettingsSnapshot {
  const snapshot = toRecord(input)
  const settings = toRecord(snapshot.settings)
  const legacySettings = readLegacySettingsMirror(snapshot)

  return {
    apiPresets: Array.isArray(settings.apiPresets) ? settings.apiPresets : (Array.isArray(legacySettings.apiPresets) ? legacySettings.apiPresets : []),
    defaultPreset: (settings.defaultPreset ?? legacySettings.defaultPreset ?? null) as Record<string, unknown> | null,
    promptPresets: Array.isArray(settings.promptPresets) ? settings.promptPresets : (Array.isArray(legacySettings.promptPresets) ? legacySettings.promptPresets : []),
    currentTime: String(settings.currentTime ?? legacySettings.currentTime ?? ''),
    currentWeather: String(settings.currentWeather ?? legacySettings.currentWeather ?? ''),
    currentLocation: String(settings.currentLocation ?? legacySettings.currentLocation ?? ''),
    weatherDetail: settings.weatherDetail ?? legacySettings.weatherDetail ?? null,
    locationHistory: Array.isArray(settings.locationHistory) ? settings.locationHistory : (Array.isArray(legacySettings.locationHistory) ? legacySettings.locationHistory : []),
    weatherHistory: Array.isArray(settings.weatherHistory) ? settings.weatherHistory : (Array.isArray(legacySettings.weatherHistory) ? legacySettings.weatherHistory : []),
    darkMode: settings.darkMode ?? legacySettings.darkMode ?? null,
    aiEvaluationEnabled: settings.aiEvaluationEnabled ?? legacySettings.aiEvaluationEnabled ?? null,
    summaryPrompt: String(settings.summaryPrompt ?? legacySettings.summaryPrompt ?? ''),
    bigSummaryPrompt: String(settings.bigSummaryPrompt ?? legacySettings.bigSummaryPrompt ?? ''),
    dailyReportPrompt: String(settings.dailyReportPrompt ?? legacySettings.dailyReportPrompt ?? ''),
    chatSummaryPresetName: String(settings.chatSummaryPresetName ?? legacySettings.chatSummaryPresetName ?? ''),
    chatSummaryModel: String(settings.chatSummaryModel ?? legacySettings.chatSummaryModel ?? ''),
    agentModelConfigs: Array.isArray(settings.agentModelConfigs)
      ? settings.agentModelConfigs
      : (Array.isArray(legacySettings.agentModelConfigs) ? legacySettings.agentModelConfigs : [])
  }
}

function materializeWorkspaceSnapshot(
  input: unknown,
  snapshotKind: WorkspaceSnapshotKind
): WorkspaceSnapshotV1 {
  const snapshot = toRecord(input)
  const settings = buildWorkspaceSettingsSnapshot(snapshot)
  const snapshotBody = stripLegacySettingsMirror(snapshot)

  return {
    ...snapshotBody,
    version: WORKSPACE_SNAPSHOT_VERSION,
    snapshotKind,
    settings
  }
}

export function toBootstrapSnapshot(input: unknown): BootstrapSnapshotV1 {
  return materializeWorkspaceSnapshot(input, 'bootstrap') as BootstrapSnapshotV1
}

export function toLocalArchiveSnapshot(input: unknown): LocalArchiveSnapshotV1 {
  return materializeWorkspaceSnapshot(input, 'archive') as LocalArchiveSnapshotV1
}

export function normalizeWorkspaceSnapshot(input: unknown, snapshotKind: WorkspaceSnapshotKind = 'workspace'): WorkspaceSnapshotV1 {
  const raw = unwrapWorkspaceEnvelope(input)
  const resolvedKind = typeof raw.snapshotKind === 'string'
    ? raw.snapshotKind as WorkspaceSnapshotKind
    : snapshotKind
  return materializeWorkspaceSnapshot(raw, resolvedKind)
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
