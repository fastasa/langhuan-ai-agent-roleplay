import type { Ref } from 'vue'
import type {
  LocalArchiveActionPhase as WorkspaceLocalArchiveActionPhase,
  LocalArchiveArchiveItem as WorkspaceLocalArchiveArchiveItem,
  LocalArchiveModuleDefinition as WorkspaceLocalArchiveModuleDefinition,
  LocalArchiveModuleName as WorkspaceLocalArchiveModuleName
} from '../composables/app/localArchiveShared'
import type { EffectiveVirtualScene } from '../utils/virtualScene'
import type { TimelineNode } from '../utils/taskTimeline'
import type { AgentModelConfig, AiProviderMode, TimerMark } from './index'
import type { PendingImageAttachment } from '../composables/app/useImageAttachments'
import type { UseStickToBottomResult } from '../composables/useStickToBottom'
import type { ChatSendPayload } from '../app/chatSendProtocol'

export type KeyValueMap = Record<string, unknown>
export type UnknownRecord = Record<string, unknown>
export type NamedEntity = UnknownRecord & { id?: string; name?: string }
export type ChatSummaryListItem = { id: string; name: string; content?: string; kind?: string }
export type PlannedGroupSpeakerViewModel = { id: string; name: string }
export type ChatSessionRowKind = 'session' | 'crowd'
export type ChatUtilityPanelId = 'dataSafety' | 'api' | 'operation' | 'resource' | 'task' | 'ticket' | 'archive' | 'changelog'
export type ChatSessionRow = {
  sessionId: string
  targetId: string
  kind: ChatSessionRowKind
  isArchived?: boolean
  title: string
  label: string
  preview: string
  updatedAt: string
  avatarPath?: string
  emoji?: string
  participantCount: number
  messageCount: number
}
export type TimelineTaskLike = NamedEntity & { id?: string }
export type EntityId = string
export type MessageIndex = number
export type MentionIndex = number
export type GroupKey = string
export type PanelActionResult = unknown
export type PanelEntityRef = NamedEntity | EntityId
export type TaskActionTarget = TimelineTaskLike | EntityId
export type ManualNarrationTriggerOptions = {
  kind?: 'environment' | 'appearance' | 'event_push'
  profileId?: EntityId
  candidateBatchId?: EntityId
  candidateId?: EntityId
}
export type CustomTagLike = NamedEntity & { color?: string }
export type TaskPanelTab = 'all' | 'bounty' | 'longterm' | 'daily'
export type PromptPresetDragPayload = { index: number; event: DragEvent }
export type PromptPresetReorderPayload = { draggedIndexes: number[]; targetIndex: number; position: 'before' | 'after' }
export type WeatherDetailViewModel = {
  text: string
  temp: number
  feelsLike: number
  humidity: number
  windDir: string
  windScale: number
  windSpeed: number
  precip: number
  pressure: number
  vis: number
  cloud: number
  dew: number
  icon: string
  obsTime: string
}
export type ChatMessageVersionViewModel = {
  content?: string
}
export type ChatMessageViewModel = {
  id?: string | number
  role?: string
  name?: string
  memberName?: string
  content?: string
  image?: string
  /** 图片附件（输入框图片上传计划批4）：真实键名随消息来源浮动（服务端 toCamel 后的 attachmentsJson·
   *  主路径 / 本地乐观回显的 attachments / 兜底 attachments_json），渲染前统一经 readMessageAttachments(msg)
   *  探测解析——不要直接读某个具体字段，见 src/utils/chatAttachments.ts 该函数 JSDoc。 */
  attachmentsJson?: unknown
  attachments?: unknown
  attachments_json?: unknown
  time?: string
  envDate?: string
  envWeather?: string
  envLocation?: string
  model?: string
  autoWriteHidden?: boolean
  autoWriteHiddenAt?: string
  autoWriteBatchId?: string
  autoWriteHiddenReason?: string
  messageKind?: string
  message_kind?: string
  messageSourceKind?: string
  message_source_kind?: string
  focusedActionGroupId?: string
  focused_action_group_id?: string
  focusedActionVisibility?: 'private' | 'public' | string
  focused_action_visibility?: 'private' | 'public' | string
  debugPlan?: KeyValueMap
  versionList?: ChatMessageVersionViewModel[]
  activeVersionIndex?: number
  _localStreamingKey?: string
  _sessionId?: string
  /** 回复过程轨：实时本地态（发送链路写入）；六步状态 + 是否失败 + 用时。 */
  _processTrace?: ChatProcessTraceViewModel
  /** 回复过程轨：历史持久化态（来自 personality_model_trace artifact 的 processSummary）。 */
  processTrace?: ChatProcessTraceViewModel
}
export type ChatProcessTraceViewModel = {
  steps: Record<string, 'waiting' | 'running' | 'done' | 'failed' | 'retry'>
  failed?: boolean
  elapsed?: string
  /** 回复工作流模式：personality_model 七步含评审 / normal_recall 六步无评审；缺省按 personality_model 兜底。 */
  mode?: string
  /** 旁白陪跑结论：本轮是否生成旁白 + 理由（点击旁白步可查看）；未决出时缺省。 */
  narration?: { willGenerate: boolean; reason: string } | null
}
export type ChatMessageNoteCreatePayload = {
  messageId: number
  sourceMode: 'selection' | 'message'
  sourceText: string
  messageSnapshot: string
  messageIndex: number
  floorLabel?: string
  speakerName?: string
  role?: string
  envDate?: string
  envWeather?: string
  envLocation?: string
  model?: string
}
export type TicketTimerViewModel = {
  id?: string | number
  remainingMs?: number
  paused?: boolean | number
}
export type UserProfileViewModel = {
  displayName?: string
  avatarPath?: string
  emoji?: string
  name?: string
  gender?: string
  age?: string | number
  appearance?: string
  personality?: string
  outfit?: string
  hobbies?: string
  abilities?: string
}
export type ApiPresetFormViewModel = {
  originalName?: string
  name: string
  providerType: string
  apiUrl: string
  apiKey: string
  hasApiKey?: boolean
  model?: string
  temperature?: number
  maxTokens?: number
  fallbackPreset?: string
  maxConcurrency?: number
  minInterval?: number
  // 识图标记（输入框图片上传计划批2）：预设编辑弹窗勾选框，图片双通道分流据此判断。
  supportsVision?: boolean
}
export type ApiPresetFormUpdatePayload = {
  [K in keyof ApiPresetFormViewModel]-?: {
    key: K
    value: ApiPresetFormViewModel[K]
  }
}[keyof ApiPresetFormViewModel]
export type PanelSections = Record<string, boolean>
export type TicketLike = NamedEntity & {
  cost?: number
  count?: number
  desc?: string
  timerMinutes?: number
}
export type PromptPresetLike = NamedEntity & {
  enabled?: boolean
  scene?: string
  role?: string
  content?: string
  frequency?: string | number
}
export type TaskTimerStateViewModel = {
  accumulatedTime?: number
  isRunning?: boolean
  marks?: TimerMark[]
}
export type TaskItemViewModel = TimelineTaskLike & {
  type?: string
  status?: string
  category?: string
  from?: string
  desc?: string
  resetTime?: string | number | Date | null
  reward?: number
  expReward?: number
  completionNote?: string
  completion_note?: string
  timerState?: TaskTimerStateViewModel
}
export type TransactionTaskLike = TimelineTaskLike & {
  title?: string
  desc?: string
  assignerName?: string
  from?: string
  completionNote?: string
}
export type TransactionOperationViewModel = {
  id?: string
  type?: string
  desc?: string
  extra?: {
    task?: TransactionTaskLike
    note?: string
  }
}
export type OperationDetailState = TransactionOperationViewModel | null

export type EnvironmentViewModel = {
  currentLocation: string
  currentLocationLarge?: string
  currentLocationMiddle?: string
  currentLocationSmall?: string
  currentTime: string
  timeRate?: number
  weatherDetail: WeatherDetailViewModel | null
  weatherText: string
  temperatureText: string
  isLoadingLocation: boolean
  isLoadingWeather: boolean
  editingLocation: boolean
  tempLocation: string
  tempLocationLarge?: string
  tempLocationMiddle?: string
  tempLocationSmall?: string
  showWeatherDetail: boolean
}

export type EnvironmentActions = {
  editLocation: () => void
  saveLocation: () => void
  cancelLocationEdit: () => void
  updateTempLocation: (value: string) => void
  updateTempLocationLarge?: (value: string) => void
  updateTempLocationMiddle?: (value: string) => void
  updateTempLocationSmall?: (value: string) => void
  syncWeather: (locationOverride?: string) => void
  toggleSceneTimePaused: () => void
  toggleWeatherDetail: () => void
  closeWeatherDetail: () => void
  syncTime: () => void
}

export type ChatPanelViewModel = {
  activeSessionId?: string
  sidebarOpen: boolean
  collapsedGroups: Record<string, boolean>
  ungroupedCharacters: NamedEntity[]
  characters: NamedEntity[]
  characterGroups: NamedEntity[]
  groups: NamedEntity[]
  crowds: NamedEntity[]
  chatSessionRows?: ChatSessionRow[]
  userProfile: UserProfileViewModel
  currentTarget: string
  currentChatTitle: string
  loadedSummaryCount: number
  loadedSummaryItems: ChatSummaryListItem[]
  isBootLoading: boolean
  isTyping: boolean
  hasForegroundChatTask?: boolean
  foregroundChatTaskLabel?: string
  runningChatTaskCount?: number
  currentCharacter: NamedEntity | null
  currentSession?: UnknownRecord | null
  currentScene: EffectiveVirtualScene | null
  currentAlias: NamedEntity | null
  currentMessages: ChatMessageViewModel[]
  hasOlderMessages?: boolean
  loadingOlderMessages?: boolean
  /** 会话切换乐观跳转（2026-07-11）：正在切换中（fetch 尚未回来）——消息区渲染骨架屏代替 currentMessages。 */
  isSessionSwitching?: boolean
  editingMessageIndex: number
  editingMessageContent: string
  regeneratingMessageIndex: number
  currentCharacterAvatar: string | null
  streamingText: string
  currentStreamingSpeakerName: string
  currentStreamingTargetId: string
  environmentNarrationLoading?: boolean
  plannedGroupSpeakers: PlannedGroupSpeakerViewModel[]
  plusMenuOpen: boolean
  atMenuOpen: boolean
  chatInputText: string
  /** 图片附件（输入框图片上传计划批4）：与 chatInputText 同层同源，ChatInputBar 只读展示 + 判断发送按钮可用性。 */
  pendingImageAttachments: PendingImageAttachment[]
  mentionSelectedChars: string[]
  mentionExcludedChars: string[]
  filteredAtCharacters: NamedEntity[]
  evaluationEnabled: boolean
  recallActivityVisible?: boolean
  recallActivityStatus?: 'idle' | 'running' | 'completed' | 'failed'
  recallActivityLabel?: string
  promptLogPanelOpen?: boolean
  promptLogFocusMessageId?: number
  chatSummaryWriting?: boolean
  chatSummaryWritingText?: string
  sessionTemporaryCharactersPanelOpen?: boolean
  darkMode: boolean
}

export type ChatPanelActions = {
  getCharactersByGroup: (groupId?: GroupKey) => NamedEntity[]
  updateSidebarOpen: (value: boolean) => void
  toggleGroupCollapse: (groupId: GroupKey) => PanelActionResult
  switchChat: (targetId: EntityId) => PanelActionResult
  switchSession?: (sessionId: EntityId) => PanelActionResult
  loadOlderMessages?: (sessionId?: EntityId, beforeId?: number) => PanelActionResult
  openCharGroupManager: (kind?: 'char' | 'group' | 'crowd') => void
  editCharGroup: (payload: { kind: 'char' | 'group' | 'crowd'; groupId: EntityId }) => void
  openAddCharacter: (groupId?: EntityId, options?: { collapseSidebar?: boolean }) => void
  openCreateGroup: (groupId?: EntityId) => void
  openCrowdEditor: (groupId?: EntityId) => void
  openUserEditor: () => void
  saveWorkspaceData: () => PanelActionResult
  openChatHistory: () => PanelActionResult
  openChatSessionCreator?: () => PanelActionResult
  renameChatSession?: (sessionId: EntityId, title: string) => Promise<void> | void
  deleteChatSession?: (sessionId: EntityId) => Promise<void> | void
  deleteChatSessions?: (sessionIds: EntityId[]) => Promise<void> | void
  archiveChatSession?: (sessionId: EntityId) => Promise<void> | void
  toggleDarkMode: () => void
  editGroup: (group: PanelEntityRef) => PanelActionResult
  editCrowd: (crowd: PanelEntityRef) => PanelActionResult
  openContactSort: () => PanelActionResult
  reorderContacts?: (payload: {
    items: Array<{ kind: 'char' | 'group' | 'crowd'; id: EntityId }>
    target?: { kind: 'char' | 'group' | 'crowd'; id: EntityId }
    targetGroupId?: EntityId
    position?: 'before' | 'after'
  }) => PanelActionResult
  createGroupFromContacts?: (items: Array<{ kind: 'char' | 'group' | 'crowd'; id: EntityId }>) => PanelActionResult
  deleteContacts: (items: Array<{ kind: 'char' | 'group' | 'crowd'; id: EntityId }>) => PanelActionResult
  importCharacterCoreMarkdown?: (payload: { characterId: EntityId; changes: Record<string, unknown> }) => PanelActionResult
  deleteCharGroup?: (groupId: EntityId) => PanelActionResult
  reorderCharacterGroups?: (payload: {
    draggedIds: EntityId[]
    targetId: EntityId
    position?: 'before' | 'after'
  }) => PanelActionResult
  undoContactOps?: () => PanelActionResult
  redoContactOps?: () => PanelActionResult
  transferChat: () => PanelActionResult
  openCharacterEditor: (char?: PanelEntityRef) => PanelActionResult
  openCurtainPanel: (messageId?: number) => void
  // 帷幕场景设置 / 马甲选择直达入口：复用桌面“虚拟场景设置”“选择马甲”全局弹窗与写入链路
  openSceneEditor?: () => void
  openAliasSelector?: () => void
  openPromptLogPanel: (messageId?: number) => void
  closePromptLogPanel?: () => void
  openSessionTemporaryCharactersPanel?: () => void
  closeSessionTemporaryCharactersPanel?: () => void
  openRecallActivityPanel: () => void
  unloadSummary: (summaryId: EntityId) => void
  openCharSettings: (charNameOrId: EntityId) => PanelActionResult
  openFullscreenImage: (image: string) => void
  updateEditingMessageContent: (value: string) => void
  cancelEditMessage: () => void
  saveEditMessage: (index?: MessageIndex) => PanelActionResult
  saveAndRegenerate: (index?: MessageIndex) => PanelActionResult
  // 批次5b：导演模式纠偏——输入纠偏文本 / 继续（带纠偏重跑）/ 取消（还原旧消息）。
  updateCorrectionText?: (text: string) => void
  continueCorrection?: () => void
  cancelCorrection?: () => void
  startEditMessage: (index: MessageIndex) => PanelActionResult
  deleteMessage: (index: MessageIndex) => PanelActionResult
  // 批次M1b：第三参 directorOptions.instruction = hover 提调输入框的重试修改意见（仅单聊角色导演重试用）。
  regenerateMessage: (index: MessageIndex, mode?: 'recall' | 'prompt_replay', directorOptions?: { instruction?: string }) => PanelActionResult
  // 批次M3：持久提调精修输入框触发——按楼层引用「角色N/旁白M（含范围/多目标）」对会话消息做锚定精修。
  applyDirectorPrecisionEdits?: (refsText: string, options?: { correctionText?: string; anchorMessageId?: number }) => PanelActionResult
  selectMessageVersion: (index: MessageIndex, nextIndex: number) => PanelActionResult
  copyMessage: (index: MessageIndex) => PanelActionResult
  toggleMessagePromptVisibility?: (index: MessageIndex) => PanelActionResult
  togglePlusMenu: () => void
  clearCurrentChat: () => PanelActionResult
  requestClearCurrentChatContext?: () => PanelActionResult
  addMentionChar: (charId: EntityId) => PanelActionResult
  removeMentionChar: (index: MentionIndex) => PanelActionResult
  toggleExcludeChar: (charId: EntityId) => PanelActionResult
  sendChat: (payload?: string | ChatSendPayload) => PanelActionResult
  updateDynamicWorldEnabled?: (enabled: boolean) => PanelActionResult
  triggerManualNarration?: (options?: ManualNarrationTriggerOptions) => PanelActionResult
  abortChat: () => PanelActionResult
  openChatSummary: () => PanelActionResult
  toggleEvaluation: () => void
  inputChatText: (value: string) => PanelActionResult
  // 图片附件（输入框图片上传计划批4）：ChatInputBar 哑组件不持有附件状态，粘贴/拖拽/删除/重试经这五个 action 回调宿主层。
  handleImageAttachmentPaste: (event: ClipboardEvent) => boolean
  handleImageAttachmentDrop: (event: DragEvent) => void
  handleImageAttachmentDragOver: (event: DragEvent) => void
  removeImageAttachment: (id: string) => void
  retryImageAttachmentUpload: (id: string) => void
  setMenuContainerRef: (el: unknown) => void
  setChatInputRef: (el: unknown) => void
  updatePlusMenuOpen: (value: boolean) => void
  updateAtMenuOpen: (value: boolean) => void
  clearMentionSelected: () => void
}

export type TransactionPanelViewModel = {
  operations: TransactionOperationViewModel[]
  isExecuting: boolean
  hasTaskTimeline: (task: TimelineTaskLike) => boolean
  getTaskTimelineNodes: (task: TimelineTaskLike) => TimelineNode[]
  formatTimerTime: (seconds: number) => string
  getTaskElapsedTime: (taskId: string) => number
}

export type TransactionPanelActions = {
  clear: () => PanelActionResult
  confirm: () => PanelActionResult
  confirmOne: (index: number) => PanelActionResult
  remove: (index: number) => PanelActionResult
  clearTransactions?: () => PanelActionResult
  confirmTransactions?: () => PanelActionResult
  confirmTransaction?: (index: number) => PanelActionResult
  removeTransaction?: (index: number) => PanelActionResult
}

export type ResourcePanelViewModel = {
  points: number
  money: number
  bigTime: number
  smallTime: number
  goldTickets: number
  canExchangePoints: boolean
}

export type ResourcePanelActions = {
  addBigTime: () => PanelActionResult
  addSmallTime: () => PanelActionResult
  exchangePoints: () => PanelActionResult
  spendMoney: () => PanelActionResult
}

export type TaskPanelViewModel = {
  sections: PanelSections
  userLevel: {
    level: number
    exp: number
    expToNext: number
    dailyActive: number
  }
  dailyActivity: {
    completedCount: number
    targetCount: number
  }
  recentMarkTypes: string[]
  assignerOptions: NamedEntity[]
  loadContactCharacters: NamedEntity[]
  loadContactGroups: NamedEntity[]
  filteredTasks: TaskItemViewModel[]
  hasTaskTimeline: (task: TaskItemViewModel) => boolean
  getTaskTimelineNodes: (task: TaskItemViewModel) => TimelineNode[]
  formatTimerTime: (seconds: number) => string
  getTaskElapsedTime: (taskId: string) => number
  isTaskExpired: (task: TaskItemViewModel) => boolean
  formatResetTime: (resetTime: unknown) => string
  updateTask: (taskId: string, updates: Partial<TaskItemViewModel>) => PanelActionResult
  isRequestingTask: boolean
  expandedTaskId: string | null
  customMarkType: string
  customMarkNote: string
  customTags: CustomTagLike[]
  currentTaskTab: TaskPanelTab
  newTaskName: string
  newTaskDesc: string
  newTaskReward: string
  newTaskCategory: string
  newTaskBonus: string
  taskAssignerChar: string
  taskLoadContact: string
}

export type TaskPanelActions = {
  dispatchAiTask: () => PanelActionResult
  updateExpandedTaskId: (value: string | null) => void
  updateTaskAssignerChar: (value: string) => void
  updateTaskLoadContact: (value: string) => void
  startTask: (taskId: EntityId) => PanelActionResult
  pauseTask: (taskId: EntityId) => PanelActionResult
  resetTask: (taskId: EntityId) => PanelActionResult
  updateCustomMarkType: (value: string) => void
  updateCustomMarkNote: (value: string) => void
  addTaskMark: (taskId: EntityId) => PanelActionResult
  openTagManager: () => void
  useCustomTag: (tag: CustomTagLike) => PanelActionResult
  quickMark: (payload: { type: string; taskId: EntityId }) => PanelActionResult
  completeTask: (task: TaskActionTarget) => PanelActionResult
  failTask: (task: TaskActionTarget) => PanelActionResult
  deleteTask: (taskId: EntityId) => PanelActionResult
  updateCurrentTaskTab: (value: TaskPanelTab) => void
  updateNewTaskName: (value: string) => void
  updateNewTaskDesc: (value: string) => void
  updateNewTaskReward: (value: string) => void
  updateNewTaskCategory: (value: string) => void
  updateNewTaskBonus: (value: string) => void
  addCustomTask: () => PanelActionResult
}

export type TicketPanelViewModel = {
  sections: PanelSections
  categories: string[]
  points: number
  filteredTickets: TicketLike[]
  currentTicketCategory: string
  getTicketTimers: (ticketId: string) => TicketTimerViewModel[]
  getTicketTimerCount: (ticketId: string) => number
  formatRemaining: (remainingMs: number) => string
}

export type TicketPanelActions = {
  updateCurrentTicketCategory: (value: string) => void
  openCategoryEditor: () => void
  openBatchExchange: (ticket: TicketLike) => void
  openBatchUse: (ticket: TicketLike) => void
  editTicket: (ticket: TicketLike) => void
  openAddTicket: () => void
  pauseTicketTimer: (timerId: string) => void
  resumeTicketTimer: (timerId: string) => void
}

export type LocalArchiveModuleDefinition = WorkspaceLocalArchiveModuleDefinition

export type LocalArchiveSaveItem = WorkspaceLocalArchiveArchiveItem

export type LocalArchiveActionStateViewModel = {
  type?: 'idle' | 'info' | 'success' | 'error'
  phase?: WorkspaceLocalArchiveActionPhase
  message?: string
  slotName?: string
}

export type LocalArchiveSyncPanelViewModel = {
  sections: PanelSections
  localArchiveAvailable: boolean
  localArchiveName: string
  localArchiveLabel: string
  localArchiveNote: string
  localArchiveSaves: LocalArchiveSaveItem[]
  selectedLocalArchiveSlot: string
  selectedSyncModules: WorkspaceLocalArchiveModuleName[]
  localArchiveModuleDefinitions: LocalArchiveModuleDefinition[]
  localArchiveActionState?: LocalArchiveActionStateViewModel
  isSyncing: boolean
  isRestoringArchive?: boolean
  error: string
}

export type LocalArchiveSyncPanelActions = {
  updateLocalArchiveLabel: (value: string) => void
  updateLocalArchiveNote: (value: string) => void
  updateSelectedSyncModules: (value: WorkspaceLocalArchiveModuleName[]) => void
  refreshLocalArchiveSaves: () => void
  selectLocalArchiveSlot: (name: string) => void
  openLocalArchive: () => void
  initializeLocalArchive: () => void
  localArchiveUpload: (payload?: { name?: string; modules?: WorkspaceLocalArchiveModuleName[] }) => PanelActionResult
  localArchiveDownload: (payload?: { name?: string; modules?: WorkspaceLocalArchiveModuleName[] }) => PanelActionResult
  createLocalArchiveSave: (payload: { name: string; note: string; modules?: WorkspaceLocalArchiveModuleName[] }) => void
  updateLocalArchiveSaveNote: (payload: { name: string; note: string }) => void
  renameLocalArchiveSave: (payload: { oldName: string; nextName: string }) => void
  deleteLocalArchiveSave: (name: string) => void
  closeLocalArchive: () => void
}

export type ApiConfigPanelViewModel = {
  sections: PanelSections
  apiPresets: NamedEntity[]
  apiProviderTemplates: NamedEntity[]
  defaultPresetName: string
  aiProviderMode: AiProviderMode
  apiPresetCount: number
  currentApiPresetIndex: number
  apiPresetForm: ApiPresetFormViewModel
  showEditApiPreset: boolean
  isLoadingModels: boolean
  isTestingApi: boolean
  modelList: NamedEntity[]
  weatherApiKey: string
  weatherApiDomain: string
  agentModelConfigs: AgentModelConfig[]
}

export type ApiConfigPanelActions = {
  loadApiPreset: (index: number) => void
  addNewApiPreset: () => void
  setAiProviderMode: (mode: AiProviderMode) => void
  updateApiPresetForm: (payload: ApiPresetFormUpdatePayload) => void
  applyProviderTemplate: (providerType: string) => void
  loadModels: () => void
  saveApiPreset: () => void
  setDefaultPreset: (name: string) => void
  deleteCurrentApiPreset: () => void
  testApiConnection: () => void
  updateWeatherApiKey: (value: string) => void
  updateWeatherApiDomain: (value: string) => void
  saveWeatherApiConfig: () => void
  updateAgentModelConfig: (payload: { id: string; changes: Partial<AgentModelConfig> }) => void
  saveAgentModelConfig: () => void
}

export type PresetManagerPanelViewModel = {
  sections: PanelSections
  presetSceneFilter: string
  filteredPresets: PromptPresetLike[]
  getOriginalIndex: (index: number) => number
  isLockedPreset: (preset: PromptPresetLike) => boolean
}

export type PresetManagerPanelActions = {
  updatePresetSceneFilter: (value: string) => void
  showPresetVars: () => void
  resetPresetToDefault: () => void
  exportPromptPresets: () => void
  importPromptPresetsFromFile: (file: File) => Promise<number>
  dragPresetStart: (payload: PromptPresetDragPayload) => PanelActionResult
  dragPresetDrop: (index: number) => PanelActionResult
  reorderPromptPresets: (payload: PromptPresetReorderPayload) => PanelActionResult
  editPromptPreset: (index: number) => PanelActionResult
  togglePresetEnabled: (index: number) => PanelActionResult
  deletePromptPreset: (index: number) => void
  addPromptPreset: () => void
}

export type DataManagePanelViewModel = {
  sections: PanelSections
}

export type DataManagePanelActions = {
  exportData: () => void
  importData: () => void
  resetData: () => void
}

export type DesktopPanelViewModels = {
  transaction: TransactionPanelViewModel
  resource: ResourcePanelViewModel
  task: TaskPanelViewModel
  ticket: TicketPanelViewModel
  localArchiveSync: LocalArchiveSyncPanelViewModel
  apiConfig: ApiConfigPanelViewModel
  presetManager: PresetManagerPanelViewModel
  dataManage: DataManagePanelViewModel
}

export type DesktopPanelActions = {
  transaction: TransactionPanelActions
  resource: ResourcePanelActions
  task: TaskPanelActions
  ticket: TicketPanelActions
  localArchiveSync: LocalArchiveSyncPanelActions
  apiConfig: ApiConfigPanelActions
  presetManager: PresetManagerPanelActions
  dataManage: DataManagePanelActions
}

export type DesktopPanelState = {
  panelViewModels: DesktopPanelViewModels
  panelActions: DesktopPanelActions
  environmentViewModel: EnvironmentViewModel
  environmentActions: EnvironmentActions
  chatViewModel: ChatPanelViewModel
  chatActions: ChatPanelActions
  formatDateOnly: (value: string) => string
  formatTimeOnly: (value: string) => string
  formatObsTime: (value: string) => string
  getWeatherIcon: (value: string) => string
  getWeatherEmoji: (value: string) => string
  formatChatText: (value: string) => string
  getCharAvatarById: (char: PanelEntityRef) => string
  getCharAvatar: (name: string) => string
  getCharEmoji: (name: string) => string
  setMessagesAreaRef: (el: unknown) => void
  // 智能跟底滚动（2026-07-12）：主聊天唯一共享 stick 实例，与 setMessagesAreaRef 同层同源同一条透传通道。
  chatStickToBottom: UseStickToBottomResult
  getDisplayedMessageContent: (index: number) => string
  getCharNameById: (charId: string) => string
  operationDetail: Ref<OperationDetailState>
  showPresetVars: Ref<boolean>
  importFileInput: Ref<HTMLInputElement | null>
  importAllData: (event: Event, moduleNames?: WorkspaceLocalArchiveModuleName[]) => void
}
