export type WorkspaceSnapshotKind = 'bootstrap' | 'workspace' | 'archive'

export type WorkspaceSettingsSnapshot = Record<string, unknown> & {
  apiPresets: unknown[]
  defaultPreset: Record<string, unknown> | null
  promptPresets: unknown[]
  currentTime?: string
  currentWeather?: string
  currentLocation?: string
  weatherDetail?: Record<string, unknown> | string | null
  locationHistory?: unknown[]
  weatherHistory?: unknown[]
  darkMode?: boolean | null
  aiEvaluationEnabled?: boolean | null
  summaryPrompt?: string
  bigSummaryPrompt?: string
  dailyReportPrompt?: string
  chatSummaryPresetName?: string
  chatSummaryModel?: string
  agentModelConfigs?: unknown[]
}

export type WorkspaceSnapshotV1 = Record<string, unknown> & {
  version: 1
  snapshotKind: WorkspaceSnapshotKind
  settings: WorkspaceSettingsSnapshot
  documents?: unknown[]
  documentTreeOrders?: Record<string, string[]>
  docLibrarySchemaVersion?: 1 | 2
  docLibraryTreeNodes?: unknown[]
  docLibraryTreeOrders?: Record<string, string[]>
  docLibraryTreeMigrationMeta?: Record<string, unknown>
  docLibraryTreeDiffReport?: Record<string, unknown>
  docLibraryRelationSystemState?: Record<string, unknown>
  chatSessionTemporaryCharacters?: unknown[]
  chatSessionTemporaryEntities?: unknown[]
  chatSessionCharacterPresences?: unknown[]
  chatSessionCharacterPresenceEvents?: unknown[]
  chatSessionNarrativeOverrides?: unknown[]
  chatSessionOrchestrationStates?: unknown[]
  chatStatusPanelEvents?: unknown[]
  worldEntities?: unknown[]
  chatAffectGateAudits?: unknown[]
  chatAffectLedgerEntries?: unknown[]
  chatAffectResidueCheckpoints?: unknown[]
  worldNarrativeConfigs?: unknown[]
  worldNarrativeSeeds?: unknown[]
  worldNarrativeSeedParticipants?: unknown[]
  worldNarrativeSeedLinks?: unknown[]
  worldNarrativeSeedEvents?: unknown[]
}

export type WorkspaceSnapshotEnvelope<TPayload = WorkspaceSnapshotV1> = {
  version: 1
  workspaceId: string
  generatedAt: string
  payload: TPayload
}

export type BootstrapSnapshotV1 = WorkspaceSnapshotV1 & {
  snapshotKind: 'bootstrap'
}

export type LocalArchiveSnapshotV1 = WorkspaceSnapshotV1 & {
  snapshotKind: 'archive'
}
