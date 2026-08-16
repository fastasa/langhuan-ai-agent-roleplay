import type { AgentModelConfig, AiProviderMode, ApiPreset, DailyActivity, DailyReport, HistoryItem, ServerData, PromptPreset, Task, TaskLog, UserLevel, CustomTag, EventStackItem } from './index'

export type WorkspaceSnapshotKind = 'bootstrap' | 'workspace' | 'archive'
export type WorkspaceSnapshotVersion = 1

export type WorkspaceSettingsSnapshot = Record<string, unknown> & {
  apiPresets: ApiPreset[]
  defaultPreset: ApiPreset | null
  aiProviderMode?: AiProviderMode
  promptPresets: PromptPreset[]
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
  agentModelConfigs?: AgentModelConfig[]
}

type LegacySettingsMirrorKeys =
  | 'apiPresets'
  | 'defaultPreset'
  | 'promptPresets'
  | 'settings'
  | 'currentChatTarget'
  | 'currentSession'
  | 'currentMessages'

type WorkspaceSnapshotData = Omit<ServerData, LegacySettingsMirrorKeys>

export type WorkspaceSnapshotV1 = WorkspaceSnapshotData & {
  version: WorkspaceSnapshotVersion
  snapshotKind: WorkspaceSnapshotKind
  workspaceTarget?: string
  workspaceSessionId?: string
  exportTime?: string
  settings: WorkspaceSettingsSnapshot
  timers?: unknown[]
  history?: HistoryItem[]
  tasks?: Task[]
  taskLogs?: TaskLog[]
  dailyReports?: DailyReport[]
  userLevel?: UserLevel | null
  dailyActivity?: DailyActivity | null
  recentMarkTypes?: string[]
  customTags?: CustomTag[]
  eventStack?: EventStackItem[]
}

export interface WorkspaceSnapshotEnvelope<TPayload = WorkspaceSnapshotV1> {
  version: WorkspaceSnapshotVersion
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

export type WorkspaceCommandLifecycle =
  | 'accepted'
  | 'running'
  | 'committed'
  | 'rolledBack'
  | 'cancelled'

export type WorkspaceCommandTarget =
  | 'workspace'
  | 'chat'
  | 'pending'
  | 'task'
  | 'archive'
  | 'data'
  | 'settings'
  | 'unknown'

export type WorkspaceRollbackPolicyMode = 'none' | 'manual' | 'auto'
export type WorkspaceResumePolicyMode = 'none' | 'manual' | 'resume' | 'resume-latest'
export type WorkspaceFeedbackPolicyMode = 'silent' | 'toast' | 'blocking'

export interface WorkspaceRollbackPolicy {
  mode: WorkspaceRollbackPolicyMode
  reason?: string
}

export interface WorkspaceResumePolicy {
  mode: WorkspaceResumePolicyMode
  reason?: string
}

export interface WorkspaceFeedbackPolicy {
  mode: WorkspaceFeedbackPolicyMode
  successMessage?: string
  errorMessage?: string
  runningMessage?: string
  duration?: number
}

export interface WorkspaceCommandMetadata {
  commandId: string
  type: string
  target: WorkspaceCommandTarget
  optimistic: boolean
  issuedAt: number
  idempotencyKey?: string
  rollbackPolicy: WorkspaceRollbackPolicy
  resumePolicy: WorkspaceResumePolicy
  feedbackPolicy: WorkspaceFeedbackPolicy
}

export interface WorkspaceCommandResult<TResult = unknown> {
  ok: true
  command: string
  target: WorkspaceCommandTarget
  optimistic: boolean
  status: Extract<WorkspaceCommandLifecycle, 'committed'>
  state: Extract<WorkspaceCommandLifecycle, 'committed'>
  commandId: string
  data: TResult
  warnings?: string[]
  retryable?: boolean
  error?: null
  snapshotVersion?: string | null
}

export interface WorkspaceCommandError {
  ok: false
  command: string
  target: WorkspaceCommandTarget
  optimistic: boolean
  status: Exclude<WorkspaceCommandLifecycle, 'accepted' | 'running' | 'committed'>
  state: Exclude<WorkspaceCommandLifecycle, 'accepted' | 'running' | 'committed'>
  commandId: string
  message: string
  cause?: unknown
  warnings?: string[]
  retryable?: boolean
  error?: string
  snapshotVersion?: string | null
}

export interface WorkspaceStreamingEvent {
  commandId: string
  event: 'started' | 'delta' | 'final' | 'error' | 'aborted'
  sessionId: string
  targetId?: string
  speakerName?: string
  content?: string
  error?: string
  updatedAt: number
}
