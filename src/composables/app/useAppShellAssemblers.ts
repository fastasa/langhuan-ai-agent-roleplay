import type { WorkspaceCommandBridgeContext } from './workspaceCommandHandlers'

type LooseRecord = Record<string, unknown>
type AppShellControllerFlowHubParts = LooseRecord & {
  appState: unknown
  timerComposable: unknown
  resourceStore: unknown
  settingStore: unknown
  charStore: unknown
  chatStore: unknown
  taskStore: unknown
  localArchiveSync: unknown
  workspaceKernel: unknown
  workspaceBootSession: unknown
  workspaceRuntimeStore: unknown
  toast: unknown
  stopTaskTimerUpdate: unknown
  loadLocalArchiveSaves: unknown
  loadApiPreset: unknown
  loadCustomTags: unknown
  loadEventStack: unknown
  currentTargetId: unknown
  editorCharacter: unknown
  characterManagement: LooseRecord
  uiHelpers: LooseRecord
  environmentOps: LooseRecord
  appSmallHelpers: LooseRecord
  chatTargetHelpers: LooseRecord
  derivedState: LooseRecord
  runtimeState: LooseRecord
  taskState: LooseRecord
  aiRuntime: LooseRecord
  formatters?: {
    getWeatherEmoji?: unknown
  }
}

type AppShellControllerViewBridgeParts = LooseRecord & {
  workspaceKernel: unknown
  workspaceCommandRegistry: unknown
  workspaceRuntimeStore: unknown
  sections: unknown
  settingStore: unknown
  charStore: unknown
  chatStore: unknown
  taskStore: unknown
  resourceStore: unknown
  timerComposable: unknown
  localArchiveSync: unknown
  currentTicketCategory: unknown
  isBootLoading: unknown
  currentApiPresetIndex: unknown
  apiPresetForm: unknown
  showEditApiPreset: unknown
  localArchiveAvailable: unknown
  localArchiveName: unknown
  localArchiveLabel: unknown
  localArchiveNote: unknown
  localArchiveSaves: unknown
  selectedLocalArchiveSlot: unknown
  selectedSyncModules: unknown
  localArchiveModuleDefinitions: unknown
  localArchiveActionState: unknown
  currentTaskTab: unknown
  customTags: unknown
  importFileInput: unknown
  fullscreenImage: unknown
  sidebarOpen: unknown
  collapsedGroups: unknown
  showWeatherDetail: unknown
  showPromptLogPanel: unknown
  promptLogFocusMessageId: unknown
  chatSummaryWriting: unknown
  chatSummaryWritingText: unknown
  showSessionTemporaryCharactersPanel: unknown
  callAI: unknown
  callAIStream: unknown
  commandActions: unknown
  uiHelpers: unknown
  environmentOps: unknown
  chatTargetHelpers: unknown
  derivedState: unknown
  runtimeState: unknown
  taskState: unknown
  localArchiveState: unknown
  apiState: unknown
  chatUiState: unknown
  formatters: unknown
}

type AppShellCommandBridgeSource = {
  workspaceCommandRegistry: WorkspaceCommandBridgeContext['workspaceCommandRegistry']
} & WorkspaceCommandBridgeContext

export function buildModalStateBundlesContext(ctx: any) {
  const ticketOps = ctx.ticketOps || {}
  const tagOps = ctx.tagOps || {}
  const transactionActions = ctx.transactionActions || {}
  const characterOps = ctx.characterOps || {}

  return {
    appState: ctx.appState,
    timerComposable: ctx.timerComposable,
    notificationSupported: ctx.timerComposable.notificationSupported,
    notificationPermission: ctx.timerComposable.notificationPermission,
    requestNotificationPermission: ctx.timerComposable.requestNotificationPermission,
    stores: {
      resourceStore: ctx.resourceStore,
      settingStore: ctx.settingStore,
      charStore: ctx.charStore,
      chatStore: ctx.chatStore
    },
    ticketOps: {
      saveTicket: ticketOps.saveTicket ?? ctx.saveTicket,
      deleteEditingTicket: ticketOps.deleteEditingTicket ?? ctx.deleteEditingTicket,
      addCategory: ticketOps.addCategory ?? ctx.addCategory,
      saveCategories: ticketOps.saveCategories ?? ctx.saveCategories
    },
    tagOps: {
      editCustomTag: tagOps.editCustomTag ?? ctx.editCustomTag,
      deleteCustomTag: tagOps.deleteCustomTag ?? ctx.deleteCustomTag,
      saveCustomTag: tagOps.saveCustomTag ?? ctx.saveCustomTag
    },
    transactionActions: {
      addTransaction: transactionActions.addTransaction ?? ctx.addTransaction
    },
    uiHelpers: {
      toast: ctx.toast,
      handleConfirmClick: ctx.handleConfirmClick,
      openConfirmDialog: ctx.openConfirmDialog,
      handlePromptSubmit: ctx.handlePromptSubmit,
      openPromptDialog: ctx.openPromptDialog,
      closePromptDialog: ctx.closePromptDialog,
      getCharactersByGroup: ctx.getCharactersByGroup
    },
    characterOps: {
      editCharGroup: characterOps.editCharGroup ?? ctx.editCharGroup,
      addNewCharGroup: characterOps.addNewCharGroup ?? ctx.addNewCharGroup,
      saveCrowd: characterOps.saveCrowd ?? ctx.saveCrowd,
      deleteCrowd: characterOps.deleteCrowd ?? ctx.deleteCrowd,
      openCurtainPanel: characterOps.openCurtainPanel ?? ctx.openCurtainPanel,
      openPromptLogPanel: characterOps.openPromptLogPanel ?? ctx.openPromptLogPanel,
      openSceneEditor: characterOps.openSceneEditor ?? ctx.openSceneEditor,
      clearScene: characterOps.clearScene ?? ctx.clearScene,
      saveScene: characterOps.saveScene ?? ctx.saveScene,
      saveSessionSceneDraft: characterOps.saveSessionSceneDraft ?? ctx.saveSessionSceneDraft,
      deleteAlias: characterOps.deleteAlias ?? ctx.deleteAlias,
      openAliasEditor: characterOps.openAliasEditor ?? ctx.openAliasEditor,
      saveAlias: characterOps.saveAlias ?? ctx.saveAlias,
      bindAlias: characterOps.bindAlias ?? ctx.bindAlias,
      saveGroup: characterOps.saveGroup ?? ctx.saveGroup,
      deleteGroup: characterOps.deleteGroup ?? ctx.deleteGroup,
      saveGroupEdit: characterOps.saveGroupEdit ?? ctx.saveGroupEdit,
      openChatSessionCreator: characterOps.openChatSessionCreator ?? ctx.openChatSessionCreator,
      addNewCharacter: characterOps.addNewCharacter ?? ctx.addNewCharacter,
      handleNewCharacterAvatarUpload: characterOps.handleNewCharacterAvatarUpload ?? ctx.handleNewCharacterAvatarUpload,
      importCharacterJson: characterOps.importCharacterJson ?? ctx.importCharacterJson,
      exportCharacterJsonTemplate: characterOps.exportCharacterJsonTemplate ?? ctx.exportCharacterJsonTemplate,
      exportCurrentCharacterJson: characterOps.exportCurrentCharacterJson ?? ctx.exportCurrentCharacterJson,
      handleAvatarUpload: characterOps.handleAvatarUpload ?? ctx.handleAvatarUpload,
      getAffectionDesc: characterOps.getAffectionDesc ?? ctx.getAffectionDesc,
      removeNickname: characterOps.removeNickname ?? ctx.removeNickname,
      addNickname: characterOps.addNickname ?? ctx.addNickname,
      toggleDayCollapse: characterOps.toggleDayCollapse ?? ctx.toggleDayCollapse,
      openCopySlotDialog: characterOps.openCopySlotDialog ?? ctx.openCopySlotDialog,
      removeScheduleSlot: characterOps.removeScheduleSlot ?? ctx.removeScheduleSlot,
      addScheduleSlot: characterOps.addScheduleSlot ?? ctx.addScheduleSlot,
      confirmCopySlot: characterOps.confirmCopySlot ?? ctx.confirmCopySlot,
      removeRelationship: characterOps.removeRelationship ?? ctx.removeRelationship,
      getAvailableRelationTargets: characterOps.getAvailableRelationTargets ?? ctx.getAvailableRelationTargets,
      addRelationship: characterOps.addRelationship ?? ctx.addRelationship,
      removeYearlyEntry: characterOps.removeYearlyEntry ?? ctx.removeYearlyEntry,
      addYearlyEntry: characterOps.addYearlyEntry ?? ctx.addYearlyEntry,
      removeActivity: characterOps.removeActivity ?? ctx.removeActivity,
      addActivity: characterOps.addActivity ?? ctx.addActivity,
      removeLocation: characterOps.removeLocation ?? ctx.removeLocation,
      addLocation: characterOps.addLocation ?? ctx.addLocation,
      deleteCurrentCharacter: characterOps.deleteCurrentCharacter ?? ctx.deleteCurrentCharacter,
      saveCharacterEdit: characterOps.saveCharacterEdit ?? ctx.saveCharacterEdit,
      editCharacter: characterOps.editCharacter ?? ctx.editCharacter
    },
    derived: {
      currentBoundAlias: ctx.currentBoundAlias,
      currentCharacter: ctx.editorCharacter,
      activeCharacter: ctx.currentCharacter,
      currentScene: ctx.currentScene,
      currentAlias: ctx.currentAlias,
      currentTargetId: ctx.currentTargetId
    },
    getWeatherEmoji: ctx.getWeatherEmoji,
    savePromptPresetEdit: ctx.savePromptPresetEdit,
    settingEnvironmentService: ctx.settingEnvironmentService
  }
}

export function buildCharacterManagementContext(ctx: any) {
  return {
    charStore: ctx.charStore,
    chatStore: ctx.chatStore,
    settingStore: ctx.settingStore,
    currentCharacter: ctx.editorCharacter,
    showAddCharacter: ctx.showAddCharacter,
    newCharForm: ctx.newCharForm,
    charEditForm: ctx.charEditForm,
    collapsedDays: ctx.collapsedDays,
    copyingFromDay: ctx.copyingFromDay,
    copyingSlot: ctx.copyingSlot,
    copyTargetDays: ctx.copyTargetDays,
    showCopySlotDialog: ctx.showCopySlotDialog,
    newRelationshipTarget: ctx.newRelationshipTarget,
    newNicknameInput: ctx.newNicknameInput,
    newActivityInput: ctx.newActivityInput,
    newLocationInput: ctx.newLocationInput,
    showCharacterEditor: ctx.showCharacterEditor,
    showCurtainPanel: ctx.showCurtainPanel,
    curtainFocusMessageId: ctx.curtainFocusMessageId,
    showPromptLogPanel: ctx.showPromptLogPanel,
    promptLogFocusMessageId: ctx.promptLogFocusMessageId,
    chatSummaryWriting: ctx.chatSummaryWriting,
    chatSummaryWritingText: ctx.chatSummaryWritingText,
    showSessionTemporaryCharactersPanel: ctx.showSessionTemporaryCharactersPanel,
    showSceneEditor: ctx.showSceneEditor,
    sceneForm: ctx.sceneForm,
    showAliasSelector: ctx.showAliasSelector,
    showAliasEditor: ctx.showAliasEditor,
    editingAliasId: ctx.editingAliasId,
    aliasForm: ctx.aliasForm,
    newGroupName: ctx.newGroupName,
    newGroupEmoji: ctx.newGroupEmoji,
    editingGroupId: ctx.editingGroupId,
    groupForm: ctx.groupForm,
    groupEditForm: ctx.groupEditForm,
    showCreateGroup: ctx.showCreateGroup,
    showGroupEditor: ctx.showGroupEditor,
    editingCrowdId: ctx.editingCrowdId,
    crowdForm: ctx.crowdForm,
    showCrowdEditor: ctx.showCrowdEditor,
    openConfirmDialog: ctx.openConfirmDialog,
    openPromptDialog: ctx.openPromptDialog,
    toast: ctx.toast
  }
}

export function buildAppShellOpsHubContext(ctx: any) {
  return {
    API: ctx.API,
    localArchiveSync: ctx.localArchiveSync,
    localArchiveLabel: ctx.localArchiveLabel,
    localArchiveNote: ctx.localArchiveNote,
    resourceStore: ctx.resourceStore,
    charStore: ctx.charStore,
    chatStore: ctx.chatStore,
    settingStore: ctx.settingStore,
    taskStore: ctx.taskStore,
    timerComposable: ctx.timerComposable,
    customTags: ctx.customTags,
    eventStack: ctx.eventStack,
    toast: ctx.toast,
    workspaceKernel: ctx.workspaceKernel,
    workspaceRuntimeStore: ctx.workspaceRuntimeStore,
    newTagName: ctx.newTagName,
    newTagColor: ctx.newTagColor,
    editingTagId: ctx.editingTagId,
    eventStackSummary: ctx.eventStackSummary,
    buildEventTimelinePayload: ctx.buildEventTimelinePayload,
    showEditTicket: ctx.showEditTicket,
    showAddTicket: ctx.showAddTicket,
    editingTicketId: ctx.editingTicketId,
    ticketForm: ctx.ticketForm,
    spendAmount: ctx.spendAmount,
    spendReason: ctx.spendReason,
    batchTicket: ctx.batchTicket,
    batchAmount: ctx.batchAmount,
    newCategoryName: ctx.newCategoryName,
    categoryEditList: ctx.categoryEditList,
    showCategoryEditor: ctx.showCategoryEditor,
    buildSystemPrompt: ctx.buildSystemPrompt,
    getAIOptionsForTickets: ctx.getAIOptionsForTickets,
    callAIStream: ctx.callAIStream,
    newTaskName: ctx.newTaskName,
    newTaskReward: ctx.newTaskReward,
    newTaskDesc: ctx.newTaskDesc,
    newTaskCategory: ctx.newTaskCategory,
    newTaskBonus: ctx.newTaskBonus,
    currentTaskTab: ctx.currentTaskTab,
    taskTimerUpdateInterval: ctx.taskTimerUpdateInterval,
    customMarkType: ctx.customMarkType,
    customMarkNote: ctx.customMarkNote,
    expandedTaskId: ctx.expandedTaskId,
    userForm: ctx.userForm,
    showUserEditor: ctx.showUserEditor,
    presetSceneFilter: ctx.presetSceneFilter,
    editingPresetIndex: ctx.editingPresetIndex,
    promptPresetForm: ctx.promptPresetForm,
    showPromptPresetEditor: ctx.showPromptPresetEditor
  }
}

export function buildEnvironmentOpsContext(ctx: any) {
  return {
    settingStore: ctx.settingStore,
    settingEnvironmentService: ctx.settingEnvironmentService,
    isLoadingLocation: ctx.isLoadingLocation,
    isLoadingWeather: ctx.isLoadingWeather,
    editingLocation: ctx.editingLocation,
    tempLocation: ctx.tempLocation,
    weatherApiKey: ctx.weatherApiKey,
    weatherApiDomain: ctx.weatherApiDomain,
    toast: ctx.toast,
    logger: ctx.logger
  }
}

export function buildChatTargetHelpersContext(ctx: any) {
  return {
    charStore: ctx.charStore,
    chatStore: ctx.chatStore,
    chatStickToBottom: ctx.chatStickToBottom,
    normalizeAvatarUrl: ctx.normalizeAvatarUrl,
    getCurrentChatTitle: ctx.getCurrentChatTitle,
    onEditCharacter: ctx.onEditCharacter
  }
}

export function buildAppDerivedStateContext(ctx: any) {
  return {
    chatStore: ctx.chatStore,
    charStore: ctx.charStore,
    resourceStore: ctx.resourceStore,
    taskStore: ctx.taskStore,
    settingStore: ctx.settingStore,
    currentTaskTab: ctx.currentTaskTab,
    currentTicketCategory: ctx.currentTicketCategory,
    atSearchText: ctx.atSearchText,
    getTargetName: ctx.getTargetName,
    normalizeAvatarUrl: ctx.normalizeAvatarUrl
  }
}

function buildAppShellPanelTransactionActions(ctx: any) {
  return {
    commandAddTransaction: ctx.commandAddTransaction,
    commandClearTransactions: ctx.commandClearTransactions,
    commandConfirmTransactions: ctx.commandConfirmTransactions,
    commandConfirmTransactionAt: ctx.commandConfirmTransactionAt,
    commandRemoveTransactionAt: ctx.commandRemoveTransactionAt
  }
}

function buildAppShellPanelLocalArchiveActions(ctx: any) {
  return {
    openLocalArchive: ctx.openLocalArchive,
    initializeLocalArchive: ctx.initializeLocalArchive,
    loadLocalArchiveSaves: ctx.loadLocalArchiveSaves,
    setSelectedSyncModules: ctx.setSelectedSyncModules,
    selectLocalArchiveSave: ctx.selectLocalArchiveSave,
    commandLocalArchiveUpload: ctx.commandLocalArchiveUpload,
    commandLocalArchiveDownload: ctx.commandLocalArchiveDownload,
    commandCreateLocalArchiveSave: ctx.commandCreateLocalArchiveSave,
    commandUpdateLocalArchiveSaveNote: ctx.commandUpdateLocalArchiveSaveNote,
    commandRenameLocalArchiveSave: ctx.commandRenameLocalArchiveSave,
    commandDeleteLocalArchiveSave: ctx.commandDeleteLocalArchiveSave,
    closeLocalArchive: ctx.closeLocalArchive
  }
}

function buildAppShellPanelApiActions(ctx: any) {
  return {
    loadApiPreset: ctx.loadApiPreset,
    addNewApiPreset: ctx.addNewApiPreset,
    loadModels: ctx.loadModels,
    commandSaveApiPreset: ctx.commandSaveApiPreset,
    testApiConnection: ctx.testApiConnection,
    commandSaveWeatherApiConfig: ctx.commandSaveWeatherApiConfig,
    showPresetVars: ctx.showPresetVars,
    resetPresetToDefault: ctx.resetPresetToDefault,
    dragPresetStart: ctx.dragPresetStart,
    dragPresetDrop: ctx.dragPresetDrop,
    editPromptPreset: ctx.editPromptPreset,
    togglePromptPresetEnabled: ctx.togglePromptPresetEnabled,
    addPromptPreset: ctx.addPromptPreset,
    exportAllData: ctx.exportAllData,
    commandImportAllData: ctx.commandImportAllData,
    commandResetAllData: ctx.commandResetAllData
  }
}

function buildAppShellPanelTaskActions(ctx: any) {
  return {
    commandDispatchAiTask: ctx.commandDispatchAiTask,
    commandAddCustomTask: ctx.commandAddCustomTask,
    commandStartTaskTimer: ctx.commandStartTaskTimer,
    commandPauseTaskTimer: ctx.commandPauseTaskTimer,
    commandResetTaskTimer: ctx.commandResetTaskTimer,
    commandAddTaskMark: ctx.commandAddTaskMark,
    commandCompleteTaskWithPause: ctx.commandCompleteTaskWithPause,
    commandQueueTaskFailure: ctx.commandQueueTaskFailure,
    commandDeleteTask: ctx.commandDeleteTask,
    useCustomTag: ctx.useCustomTag
  }
}

function buildAppShellPanelChatActions(ctx: any) {
  return {
    openCurtainPanel: ctx.openCurtainPanel,
    openPromptLogPanel: ctx.openPromptLogPanel,
    openSceneEditor: ctx.openSceneEditor,
    openAliasSelector: ctx.openAliasSelector,
    transferCurrentChat: ctx.transferCurrentChat,
    switchChat: ctx.commandSwitchChat ?? ctx.switchChat,
    switchSession: ctx.commandSwitchSession ?? ctx.switchSession ?? ctx.chatStore?.switchSession,
    clearCurrentChat: ctx.clearCurrentChat,
    requestClearCurrentChatContext: ctx.requestClearCurrentChatContext,
    addMentionChar: ctx.addMentionChar,
    removeMentionChar: ctx.removeMentionChar,
    toggleExcludeChar: ctx.toggleExcludeChar,
    togglePlusMenu: ctx.togglePlusMenu,
    commandSendChat: ctx.commandSendChat,
    abortChat: ctx.abortChat,
    openCharSettingsByName: ctx.openCharSettingsByName,
    openChatSessionCreator: ctx.openChatSessionCreator,
    editGroup: ctx.editGroup,
    editCrowd: ctx.editCrowd,
    startEditMessage: ctx.startEditMessage,
    cancelEditMessage: ctx.cancelEditMessage,
    saveEditMessage: ctx.saveEditMessage,
    saveAndRegenerate: ctx.saveAndRegenerate,
    // 批次5b：导演模式纠偏继续/取消/输入。
    updateCorrectionText: ctx.updateCorrectionText,
    continueCorrection: ctx.continueCorrection,
    cancelCorrection: ctx.cancelCorrection,
    deleteMessage: ctx.deleteMessage,
    selectMessageVersion: ctx.selectMessageVersion,
    copyMessage: ctx.copyMessage,
    toggleMessagePromptVisibility: ctx.toggleMessagePromptVisibility,
    regenerateMsg: ctx.regenerateMsg,
    // 批次 O-A：持久纠偏栏接线根因——功能区 D 漏在此 flowHub 装配层挂载 applyDirectorPrecisionEdits，
    // 导致 viewStateBindings 读到 undefined、单聊纠偏栏 v-if 永远不成立。与 regenerateMsg 同源（ops spread）。
    applyDirectorPrecisionEdits: ctx.applyDirectorPrecisionEdits
  }
}

function buildAppShellPanelFormatting(ctx: any) {
  return {
    getTemperatureFromWeather: ctx.getTemperatureFromWeather,
    formatDateOnly: ctx.formatDateOnly,
    formatTimeOnly: ctx.formatTimeOnly,
    formatObsTime: ctx.formatObsTime,
    getWeatherIcon: ctx.getWeatherIcon,
    getWeatherEmoji: ctx.getWeatherEmoji
  }
}

export function buildAppShellPanelsContext(ctx: any) {
  return {
    sections: ctx.sections,
    settingStore: ctx.settingStore,
    charStore: ctx.charStore,
    chatStore: ctx.chatStore,
    taskStore: ctx.taskStore,
    resourceStore: ctx.resourceStore,
    timerComposable: ctx.timerComposable,
    filteredTickets: ctx.filteredTickets,
    currentTicketCategory: ctx.currentTicketCategory,
    localArchiveSync: ctx.localArchiveSync,
    getWeatherText: ctx.getWeatherText,
    isLoadingLocation: ctx.isLoadingLocation,
    isLoadingWeather: ctx.isLoadingWeather,
    editingLocation: ctx.editingLocation,
    tempLocation: ctx.tempLocation,
    tempLocationLarge: ctx.tempLocationLarge,
    tempLocationMiddle: ctx.tempLocationMiddle,
    tempLocationSmall: ctx.tempLocationSmall,
    isBootLoading: ctx.isBootLoading,
    currentMessages: ctx.currentMessages,
    currentChatTitle: ctx.currentChatTitle,
    streamingText: ctx.streamingText,
    currentStreamingSpeakerName: ctx.currentStreamingSpeakerName,
    currentStreamingTargetId: ctx.currentStreamingTargetId,
    environmentNarrationLoading: ctx.environmentNarrationLoading,
    plannedGroupSpeakers: ctx.plannedGroupSpeakers,
    currentAlias: ctx.currentAlias,
    currentScene: ctx.currentScene,
    loadedSummaryItems: ctx.loadedSummaryItems,
    chatPanelViewModel: ctx.chatPanelViewModel,
    settingsPanelViewModel: ctx.settingsPanelViewModel,
    taskPanelMeta: ctx.taskPanelMeta,
    editingMessageIndex: ctx.editingMessageIndex,
    editingMessageContent: ctx.editingMessageContent,
    regeneratingMessageIndex: ctx.regeneratingMessageIndex,
    getDisplayedMessageContent: ctx.getDisplayedMessageContent,
    mentionSelectedChars: ctx.mentionSelectedChars,
    mentionExcludedChars: ctx.mentionExcludedChars,
    filteredAtCharacters: ctx.filteredAtCharacters,
    getGoldTicketCount: ctx.getGoldTicketCount,
    localArchiveAvailable: ctx.localArchiveAvailable,
    localArchiveName: ctx.localArchiveName,
    localArchiveLabel: ctx.localArchiveLabel,
    localArchiveNote: ctx.localArchiveNote,
    localArchiveSaves: ctx.localArchiveSaves,
    selectedLocalArchiveSlot: ctx.selectedLocalArchiveSlot,
    selectedSyncModules: ctx.selectedSyncModules,
    localArchiveModuleDefinitions: ctx.localArchiveModuleDefinitions,
    localArchiveActionState: ctx.localArchiveActionState,
    currentApiPresetIndex: ctx.currentApiPresetIndex,
    apiPresetForm: ctx.apiPresetForm,
    showEditApiPreset: ctx.showEditApiPreset,
    isLoadingModels: ctx.isLoadingModels,
    isTestingApi: ctx.isTestingApi,
    modelList: ctx.modelList,
    weatherApiKey: ctx.weatherApiKey,
    weatherApiDomain: ctx.weatherApiDomain,
    presetSceneFilter: ctx.presetSceneFilter,
    filteredPresets: ctx.filteredPresets,
    getOriginalIndex: ctx.getOriginalIndex,
    runtimeTransactions: ctx.runtimeTransactions,
    transactionExecuting: ctx.transactionExecuting,
    filteredTasks: ctx.filteredTasks,
    hasTaskTimeline: ctx.hasTaskTimeline,
    getTaskTimelineNodes: ctx.getTaskTimelineNodes,
    isRequestingTask: ctx.isRequestingTask,
    expandedTaskId: ctx.expandedTaskId,
    customMarkType: ctx.customMarkType,
    customMarkNote: ctx.customMarkNote,
    customTags: ctx.customTags,
    currentTaskTab: ctx.currentTaskTab,
    newTaskName: ctx.newTaskName,
    newTaskDesc: ctx.newTaskDesc,
    newTaskReward: ctx.newTaskReward,
    newTaskCategory: ctx.newTaskCategory,
    newTaskBonus: ctx.newTaskBonus,
    taskAssignerChar: ctx.taskAssignerChar,
    taskLoadContact: ctx.taskLoadContact,
    newCharForm: ctx.newCharForm,
    charGroupEditForm: ctx.charGroupEditForm,
    editingGroupId: ctx.editingGroupId,
    groupForm: ctx.groupForm,
    groupEditForm: ctx.groupEditForm,
    showGroupEditor: ctx.showGroupEditor,
    sceneForm: ctx.sceneForm,
    editingCrowdId: ctx.editingCrowdId,
    crowdForm: ctx.crowdForm,
    showAddCharacter: ctx.showAddCharacter,
    showCharGroupManager: ctx.showCharGroupManager,
    showCreateGroup: ctx.showCreateGroup,
    showCrowdEditor: ctx.showCrowdEditor,
    showChatSummary: ctx.showChatSummary,
    showConversationManager: ctx.showConversationManager,
    showPromptPresetEditor: ctx.showPromptPresetEditor,
    showUserEditor: ctx.showUserEditor,
    showSpendMoney: ctx.showSpendMoney,
    toast: ctx.toast,
    showConfirmDialog: ctx.showConfirmDialog,
    openConfirmDialog: ctx.openConfirmDialog,
    confirmDialog: ctx.confirmDialog,
    showPromptDialog: ctx.showPromptDialog,
    openPromptDialog: ctx.openPromptDialog,
    promptDialog: ctx.promptDialog,
    importFileInput: ctx.importFileInput,
    editLocation: ctx.editLocation,
    saveLocation: ctx.saveLocation,
    cancelLocationEdit: ctx.cancelLocationEdit,
    updateCurrentTime: ctx.updateCurrentTime,
    syncWeather: ctx.syncWeather,
    openCategoryEditor: ctx.openCategoryEditor,
    batchTicket: ctx.batchTicket,
    batchAmount: ctx.batchAmount,
    showBatchExchange: ctx.showBatchExchange,
    showBatchUse: ctx.showBatchUse,
    openEditTicket: ctx.openEditTicket,
    showAddTicket: ctx.showAddTicket,
    showTagManager: ctx.showTagManager,
    sidebarOpen: ctx.sidebarOpen,
    showWeatherDetail: ctx.showWeatherDetail,
    collapsedGroups: ctx.collapsedGroups,
    ungroupedCharacters: ctx.ungroupedCharacters,
    getCharactersByGroup: ctx.getCharactersByGroup,
    getCharAvatarById: ctx.getCharAvatarById,
    toggleGroupCollapse: ctx.toggleGroupCollapse,
    loadedSummaryCount: ctx.loadedSummaryCount,
    currentCharacter: ctx.currentCharacter,
    showCharacterEditor: ctx.showCharacterEditor,
    showCurtainPanel: ctx.showCurtainPanel,
    showPromptLogPanel: ctx.showPromptLogPanel,
    promptLogFocusMessageId: ctx.promptLogFocusMessageId,
    chatSummaryWriting: ctx.chatSummaryWriting,
    chatSummaryWritingText: ctx.chatSummaryWritingText,
    workspaceRuntimeStore: ctx.workspaceRuntimeStore,
    callAI: ctx.callAI,
    callAIStream: ctx.callAIStream,
    showAliasSelector: ctx.showAliasSelector,
    formatChatText: ctx.formatChatText,
    getCharAvatar: ctx.getCharAvatar,
    getCharEmoji: ctx.getCharEmoji,
    currentCharacterAvatar: ctx.currentCharacterAvatar,
    setMessagesAreaRef: ctx.setMessagesAreaRef,
    chatStickToBottom: ctx.chatStickToBottom,
    fullscreenImage: ctx.fullscreenImage,
    plusMenuOpen: ctx.plusMenuOpen,
    atMenuOpen: ctx.atMenuOpen,
    chatInputText: ctx.chatInputText,
    getCharNameById: ctx.getCharNameById,
    onInputChatText: ctx.onInputChatText,
    setMenuContainerRef: ctx.setMenuContainerRef,
    setChatInputRef: ctx.setChatInputRef,
    editCharacter: ctx.editCharacter,
    operationDetail: ctx.operationDetail,
    // 图片附件（批4）：随 runtimeState 一路透传到 ChatInputBar 哑组件。
    pendingImageAttachments: ctx.pendingImageAttachments,
    handleImageAttachmentPaste: ctx.handleImageAttachmentPaste,
    handleImageAttachmentDrop: ctx.handleImageAttachmentDrop,
    handleImageAttachmentDragOver: ctx.handleImageAttachmentDragOver,
    removeImageAttachment: ctx.removeImageAttachment,
    retryImageAttachmentUpload: ctx.retryImageAttachmentUpload,
    ...buildAppShellPanelTransactionActions(ctx),
    ...buildAppShellPanelLocalArchiveActions(ctx),
    ...buildAppShellPanelApiActions(ctx),
    ...buildAppShellPanelTaskActions(ctx),
    ...buildAppShellPanelChatActions(ctx),
    ...buildAppShellPanelFormatting(ctx)
  }
}

export function buildWorkspaceCommandBridgeContext(ctx: AppShellCommandBridgeSource): WorkspaceCommandBridgeContext {
  return {
    workspaceCommandRegistry: ctx.workspaceCommandRegistry,
    switchChat: ctx.switchChat,
    sendChat: ctx.sendChat,
    addTransaction: ctx.addTransaction,
    clearTransactions: ctx.clearTransactions,
    confirmTransactions: ctx.confirmTransactions,
    confirmTransactionAt: ctx.confirmTransactionAt,
    removeTransactionAt: ctx.removeTransactionAt,
    dispatchAITask: ctx.dispatchAITask,
    addCustomTask: ctx.addCustomTask,
    startTaskTimer: ctx.startTaskTimer,
    pauseTaskTimer: ctx.pauseTaskTimer,
    resetTaskTimer: ctx.resetTaskTimer,
    addTaskMark: ctx.addTaskMark,
    completeTaskWithPause: ctx.completeTaskWithPause,
    queueTaskFailure: ctx.queueTaskFailure,
    deleteTask: ctx.deleteTask,
    localArchiveUpload: ctx.localArchiveUpload,
    localArchiveDownload: ctx.localArchiveDownload,
    createLocalArchiveSave: ctx.createLocalArchiveSave,
    updateLocalArchiveSaveNote: ctx.updateLocalArchiveSaveNote,
    renameLocalArchiveSave: ctx.renameLocalArchiveSave,
    deleteLocalArchiveSave: ctx.deleteLocalArchiveSave,
    importAllData: ctx.importAllData,
    resetAllData: ctx.resetAllData,
    saveApiPreset: ctx.saveApiPreset,
    saveWeatherApiConfig: ctx.saveWeatherApiConfig
  }
}

export function buildAppLifecycleContext(ctx: any) {
  const fallbackCurrentCharacter = {
    get value() {
      return ctx.editorCharacter?.value || ctx.currentCharacter?.value || null
    }
  }

  return {
    showCharacterEditor: ctx.showCharacterEditor,
    currentCharacter: fallbackCurrentCharacter,
    charEditForm: ctx.charEditForm,
    normalizeAvatarUrl: ctx.normalizeAvatarUrl,
    showDetailSettings: ctx.showDetailSettings,
    showScheduleEditor: ctx.showScheduleEditor,
    showRelationshipEditor: ctx.showRelationshipEditor,
    showYearlyScheduleEditor: ctx.showYearlyScheduleEditor,
    showActivitiesEditor: ctx.showActivitiesEditor,
    showLocationsEditor: ctx.showLocationsEditor,
    affectionLocked: ctx.affectionLocked,
    showUserEditor: ctx.showUserEditor,
    charStore: ctx.charStore,
    userForm: ctx.userForm,
    handleClickOutside: ctx.handleClickOutside,
    settingStore: ctx.settingStore,
    settingEnvironmentService: ctx.settingEnvironmentService,
    autoSyncTime: ctx.autoSyncTime,
    updateCurrentTimeSilent: ctx.updateCurrentTimeSilent,
    loadWeatherConfig: ctx.loadWeatherConfig,
    resourceStore: ctx.resourceStore,
    taskStore: ctx.taskStore,
    loadApiPreset: ctx.loadApiPreset,
    apiPresetForm: ctx.apiPresetForm,
    currentApiPresetIndex: ctx.currentApiPresetIndex,
    loadCustomTags: ctx.loadCustomTags,
    loadEventStack: ctx.loadEventStack,
    localArchiveSync: ctx.localArchiveSync,
    loadLocalArchiveSaves: ctx.loadLocalArchiveSaves,
    resetEditingCharacter: ctx.resetEditingCharacter,
    toast: ctx.toast,
    stopTaskTimerUpdate: ctx.stopTaskTimerUpdate,
    workspaceKernel: ctx.workspaceKernel,
    workspaceBootSession: ctx.workspaceBootSession,
    workspaceRuntimeStore: ctx.workspaceRuntimeStore
  }
}

export function buildWorkspaceDialogsContext(ctx: any) {
  return {
    ...buildModalStateBundlesContext(ctx),
    ...buildAppLifecycleContext(ctx),
    chatStore: ctx.chatStore,
    taskStore: ctx.taskStore,
    switchChat: ctx.switchChat,
    localArchiveSync: ctx.localArchiveSync,
    loadLocalArchiveSaves: ctx.loadLocalArchiveSaves,
    toast: ctx.toast,
    stopTaskTimerUpdate: ctx.stopTaskTimerUpdate,
    workspaceKernel: ctx.workspaceKernel,
    workspaceBootSession: ctx.workspaceBootSession,
    workspaceRuntimeStore: ctx.workspaceRuntimeStore
  }
}

export function buildAppShellCommandFlowContext(ctx: any) {
  return {
    charStore: ctx.charStore,
    chatStore: ctx.chatStore,
    settingStore: ctx.settingStore,
    callAI: ctx.callAI,
    callAIWithTools: ctx.callAIWithTools,
    callAIStream: ctx.callAIStream,
    cleanAiPrefix: ctx.cleanAiPrefix,
    detectLocationChange: ctx.detectLocationChange,
    buildSystemPrompt: ctx.buildSystemPrompt,
    buildPromptMessages: ctx.buildPromptMessages,
    prepareAIRecall: ctx.prepareAIRecall,
    // 提调取料三件套接缝：与 prepareAIRecall 同源、走同一条透传链，缺这行会让 sendPipeline 拿不到接缝，
    // 提调调 searchWorldText/recallSemantic/fetchUnitDetail 时报「未注册取料接缝」。
    buildTidiaoRetrievalContext: ctx.buildTidiaoRetrievalContext,
    // 轮级资料池填池接缝（批次3·3b-2）：与取料同源透传，缺则 recallRoundPool 开关开了也填不了池（降级 docLibraryOnly）。
    fillRoundRecallPools: ctx.fillRoundRecallPools,
    toast: ctx.toast,
    openConfirmDialog: ctx.openConfirmDialog,
    currentMessages: ctx.currentMessages,
    currentScene: ctx.currentScene,
    currentAlias: ctx.currentAlias,
    streamingText: ctx.streamingText,
    currentStreamingSpeakerName: ctx.currentStreamingSpeakerName,
    currentStreamingTargetId: ctx.currentStreamingTargetId,
    environmentNarrationLoading: ctx.environmentNarrationLoading,
    plannedGroupSpeakers: ctx.plannedGroupSpeakers,
    getTargetName: ctx.getTargetName,
    scrollToBottom: ctx.scrollToBottom,
    switchChat: ctx.switchChat,
    chatInputText: ctx.chatInputText,
    plusMenuOpen: ctx.plusMenuOpen,
    atMenuOpen: ctx.atMenuOpen,
    mentionSelectedChars: ctx.mentionSelectedChars,
    mentionExcludedChars: ctx.mentionExcludedChars,
    takeImageAttachments: ctx.takeImageAttachments,
    workspaceRuntimeStore: ctx.workspaceRuntimeStore,
    resourceStore: ctx.resourceStore,
    timerComposable: ctx.timerComposable,
    addResourceEventToStack: ctx.addResourceEventToStack,
    submitTask: ctx.submitTask,
    failTaskConfirm: ctx.failTaskConfirm,
    transactionExecuting: ctx.transactionExecuting,
    taskStore: ctx.taskStore,
    taskAssignerChar: ctx.taskAssignerChar,
    taskLoadContact: ctx.taskLoadContact,
    isRequestingTask: ctx.isRequestingTask,
    currentTaskTab: ctx.currentTaskTab
  }
}

export function buildAppShellFlowHubContext(ctx: any) {
  return {
    ...buildWorkspaceDialogsContext(ctx),
    ...buildAppShellCommandFlowContext(ctx)
  }
}

export function buildAppShellControllerFlowHubContext(parts: AppShellControllerFlowHubParts) {
  return buildAppShellFlowHubContext({
    appState: parts.appState,
    timerComposable: parts.timerComposable,
    resourceStore: parts.resourceStore,
    settingStore: parts.settingStore,
    charStore: parts.charStore,
    chatStore: parts.chatStore,
    taskStore: parts.taskStore,
    localArchiveSync: parts.localArchiveSync,
    workspaceKernel: parts.workspaceKernel,
    workspaceBootSession: parts.workspaceBootSession,
    workspaceRuntimeStore: parts.workspaceRuntimeStore,
    toast: parts.toast,
    stopTaskTimerUpdate: parts.stopTaskTimerUpdate,
    loadLocalArchiveSaves: parts.loadLocalArchiveSaves,
    loadApiPreset: parts.loadApiPreset,
    loadCustomTags: parts.loadCustomTags,
    loadEventStack: parts.loadEventStack,
    switchChat: parts.chatTargetHelpers.switchChat,
    getWeatherEmoji: parts.formatters?.getWeatherEmoji,
    currentTargetId: parts.currentTargetId,
    editorCharacter: parts.editorCharacter,
    ticketOps: {
      saveTicket: parts.characterManagement.saveTicket,
      deleteEditingTicket: parts.characterManagement.deleteEditingTicket,
      addCategory: parts.characterManagement.addCategory,
      saveCategories: parts.characterManagement.saveCategories
    },
    tagOps: {
      editCustomTag: parts.characterManagement.editCustomTag,
      deleteCustomTag: parts.characterManagement.deleteCustomTag,
      saveCustomTag: parts.characterManagement.saveCustomTag
    },
    transactionActions: {
      addTransaction: parts.characterManagement.addTransaction
    },
    characterOps: parts.characterManagement,
    ...parts.characterManagement,
    ...parts.uiHelpers,
    ...parts.environmentOps,
    ...parts.appSmallHelpers,
    ...parts.chatTargetHelpers,
    ...parts.derivedState,
    ...parts.runtimeState,
    ...parts.taskState,
    ...parts.aiRuntime
  })
}

export function buildAppShellViewBridgeContext(ctx: any) {
  return {
    ...buildAppShellPanelsContext(ctx),
    workspaceKernel: ctx.workspaceKernel,
    workspaceCommandRegistry: ctx.workspaceCommandRegistry,
    commandSendChat: ctx.commandSendChat,
    ...buildAppShellPanelTransactionActions(ctx),
    commandDispatchAiTask: ctx.commandDispatchAiTask,
    commandAddCustomTask: ctx.commandAddCustomTask,
    commandStartTaskTimer: ctx.commandStartTaskTimer,
    commandPauseTaskTimer: ctx.commandPauseTaskTimer,
    commandResetTaskTimer: ctx.commandResetTaskTimer,
    commandAddTaskMark: ctx.commandAddTaskMark,
    commandCompleteTaskWithPause: ctx.commandCompleteTaskWithPause,
    commandQueueTaskFailure: ctx.commandQueueTaskFailure,
    commandDeleteTask: ctx.commandDeleteTask,
    commandLocalArchiveUpload: ctx.commandLocalArchiveUpload,
    commandLocalArchiveDownload: ctx.commandLocalArchiveDownload,
    commandCreateLocalArchiveSave: ctx.commandCreateLocalArchiveSave,
    commandUpdateLocalArchiveSaveNote: ctx.commandUpdateLocalArchiveSaveNote,
    commandRenameLocalArchiveSave: ctx.commandRenameLocalArchiveSave,
    commandDeleteLocalArchiveSave: ctx.commandDeleteLocalArchiveSave,
    commandImportAllData: ctx.commandImportAllData,
    commandResetAllData: ctx.commandResetAllData,
    commandSaveApiPreset: ctx.commandSaveApiPreset,
    commandSaveWeatherApiConfig: ctx.commandSaveWeatherApiConfig
  }
}

export function buildAppShellControllerViewBridgeContext(parts: AppShellControllerViewBridgeParts) {
  return buildAppShellViewBridgeContext({
    workspaceKernel: parts.workspaceKernel,
    workspaceCommandRegistry: parts.workspaceCommandRegistry,
    workspaceRuntimeStore: parts.workspaceRuntimeStore,
    sections: parts.sections,
    settingStore: parts.settingStore,
    charStore: parts.charStore,
    chatStore: parts.chatStore,
    taskStore: parts.taskStore,
    resourceStore: parts.resourceStore,
    timerComposable: parts.timerComposable,
    localArchiveSync: parts.localArchiveSync,
    currentTicketCategory: parts.currentTicketCategory,
    isBootLoading: parts.isBootLoading,
    currentApiPresetIndex: parts.currentApiPresetIndex,
    apiPresetForm: parts.apiPresetForm,
    showEditApiPreset: parts.showEditApiPreset,
    localArchiveAvailable: parts.localArchiveAvailable,
    localArchiveName: parts.localArchiveName,
    localArchiveLabel: parts.localArchiveLabel,
    localArchiveNote: parts.localArchiveNote,
    localArchiveSaves: parts.localArchiveSaves,
    selectedLocalArchiveSlot: parts.selectedLocalArchiveSlot,
    selectedSyncModules: parts.selectedSyncModules,
    localArchiveModuleDefinitions: parts.localArchiveModuleDefinitions,
    localArchiveActionState: parts.localArchiveActionState,
    currentTaskTab: parts.currentTaskTab,
    customTags: parts.customTags,
    importFileInput: parts.importFileInput,
    fullscreenImage: parts.fullscreenImage,
    sidebarOpen: parts.sidebarOpen,
    collapsedGroups: parts.collapsedGroups,
    showWeatherDetail: parts.showWeatherDetail,
    showPromptLogPanel: parts.showPromptLogPanel,
    promptLogFocusMessageId: parts.promptLogFocusMessageId,
    chatSummaryWriting: parts.chatSummaryWriting,
    chatSummaryWritingText: parts.chatSummaryWritingText,
    callAI: parts.callAI,
    callAIWithTools: parts.callAIWithTools,
    callAIStream: parts.callAIStream,
    ...(parts.commandActions as LooseRecord),
    ...(parts.uiHelpers as LooseRecord),
    ...(parts.environmentOps as LooseRecord),
    ...(parts.chatTargetHelpers as LooseRecord),
    ...(parts.derivedState as LooseRecord),
    ...(parts.runtimeState as LooseRecord),
    ...(parts.taskState as LooseRecord),
    ...(parts.localArchiveState as LooseRecord),
    ...(parts.apiState as LooseRecord),
    ...(parts.chatUiState as LooseRecord),
    ...(parts.formatters as LooseRecord)
  })
}

export function buildAppShellControllerReturn(ctx: any) {
  return {
    settingStore: ctx.settingStore,
    toastVisible: ctx.toastVisible,
    toastMessage: ctx.toastMessage,
    toastType: ctx.toastType,
    timerCompleteVisible: ctx.timerCompleteVisible,
    timerCompleteTicketName: ctx.timerCompleteTicketName,
    timerCompleteMessage: ctx.timerCompleteMessage,
    timerCompleteTitle: ctx.timerCompleteTitle,
    timerCompleteType: ctx.timerCompleteType,
    closeTimerCompleteModal: ctx.closeTimerCompleteModal,
    desktopState: ctx.desktopState,
    utilityModalState: ctx.utilityModalState,
    showUserEditor: ctx.showUserEditor,
    userForm: ctx.userForm,
    handleUserSave: ctx.handleUserSave,
    characterEditorModalState: ctx.characterEditorModalState,
    settingsModalState: ctx.settingsModalState,
    roleModalState: ctx.roleModalState,
    chatManageModalState: ctx.chatManageModalState,
    promptPresetModalState: ctx.promptPresetModalState,
    fullscreenModalState: ctx.fullscreenModalState,
    workspaceLoadingStage: ctx.workspaceLoadingStage,
    workspaceLoadingMessage: ctx.workspaceLoadingMessage
  }
}
