import { buildWorkspaceShellControllerChatTargetHelpers } from './useWorkspaceShellControllerChatTargetHelpers'
import { buildWorkspaceShellControllerDerivedState } from './useWorkspaceShellControllerDerivedState'
import { buildWorkspaceShellControllerEnvironmentOps } from './useWorkspaceShellControllerEnvironmentOps'
import { buildWorkspaceShellControllerRuntimeState } from './useWorkspaceShellControllerRuntimeState'
import { buildWorkspaceShellControllerTaskState } from './useWorkspaceShellControllerTaskState'
import { buildWorkspaceShellControllerUiHelpers } from './useWorkspaceShellControllerUiHelpers'

type WorkspaceShellViewBindingContext = {
  boot: {
    toast: (...args: unknown[]) => unknown
    appState: Record<string, unknown>
    chatUiState: Record<string, unknown>
    shellSupport: Record<string, unknown>
    workspaceRuntime: Record<string, unknown>
    uiHelpers: Record<string, unknown>
    taskTimelineHelpers: Record<string, unknown>
    appSmallHelpers: Record<string, unknown>
    environmentOps: Record<string, unknown>
  }
  domains: {
    chatTargetHelpers: Record<string, unknown>
    derivedState: Record<string, unknown>
    chatTransfer: Record<string, unknown>
    characterManagement: Record<string, unknown>
  }
  opsHub: Record<string, unknown>
  flowHub: Record<string, unknown>
}

type UiHelperBindingsInput = {
  toast: (...args: unknown[]) => unknown
  uiHelpers: Record<string, unknown>
  flowHub: Record<string, unknown>
  opsHub: Record<string, unknown>
  appState: Record<string, unknown>
}

type EnvironmentBindingsInput = {
  environmentOps: Record<string, unknown>
  appState: Record<string, unknown>
  appSmallHelpers: Record<string, unknown>
}

type ChatTargetBindingsInput = {
  chatTransfer: Record<string, unknown>
  chatTargetHelpers: Record<string, unknown>
  characterManagement: Record<string, unknown>
  chatUiState: Record<string, unknown>
}

type DerivedStateBindingsInput = {
  derivedState: Record<string, unknown>
  shellSupport: Record<string, unknown>
}

function buildUiHelperBindings({ toast, uiHelpers, flowHub, opsHub, appState }: UiHelperBindingsInput) {
  return buildWorkspaceShellControllerUiHelpers({
    toast,
    abortChat: uiHelpers.abortChat as () => unknown,
    getDisplayedMessageContent: flowHub.getDisplayedMessageContent as (index: number) => string,
    getGoldTicketCount: opsHub.getGoldTicketCount as () => number,
    openCategoryEditor: opsHub.openCategoryEditor as () => unknown,
    handleConfirmClick: uiHelpers.handleConfirmClick as () => unknown,
    openConfirmDialog: uiHelpers.openConfirmDialog as ((title: string, message: string, onConfirm: () => void, options?: Record<string, unknown>) => unknown) | undefined,
    confirmDialog: appState.confirmDialog as Record<string, unknown> | undefined,
    toggleGroupCollapse: uiHelpers.toggleGroupCollapse as (groupId?: string) => unknown,
    getCharactersByGroup: uiHelpers.getCharactersByGroup as (groupId?: string) => import('../../types/panelContracts').NamedEntity[],
    formatChatText: uiHelpers.formatChatText as (value: string) => string
  })
}

function buildEnvironmentBindings({ environmentOps, appState, appSmallHelpers }: EnvironmentBindingsInput) {
  return buildWorkspaceShellControllerEnvironmentOps({
    getWeatherText: environmentOps.getWeatherText as () => string,
    isLoadingLocation: appState.isLoadingLocation as boolean | { value?: boolean },
    isLoadingWeather: appState.isLoadingWeather as boolean | { value?: boolean },
    editingLocation: appState.editingLocation as boolean | { value?: boolean },
    tempLocation: appState.tempLocation as string | { value?: string },
    tempLocationLarge: appState.tempLocationLarge as string | { value?: string },
    tempLocationMiddle: appState.tempLocationMiddle as string | { value?: string },
    tempLocationSmall: appState.tempLocationSmall as string | { value?: string },
    editLocation: environmentOps.editLocation as () => unknown,
    saveLocation: environmentOps.saveLocation as () => unknown,
    cancelLocationEdit: environmentOps.cancelLocationEdit as () => unknown,
    updateCurrentTime: environmentOps.updateCurrentTime as () => unknown,
    syncWeather: environmentOps.syncWeather as () => unknown,
    weatherApiKey: appState.weatherApiKey as string | { value?: string },
    weatherApiDomain: appState.weatherApiDomain as string | { value?: string },
    getTemperatureFromWeather: appSmallHelpers.getTemperatureFromWeather as () => string
  })
}

function buildChatTargetBindings({
  chatTransfer,
  chatTargetHelpers,
  characterManagement,
  chatUiState
}: ChatTargetBindingsInput) {
  return buildWorkspaceShellControllerChatTargetHelpers({
    transferCurrentChat: chatTransfer.transferCurrentChat as (...args: unknown[]) => unknown,
    switchChat: chatTargetHelpers.switchChat as (...args: unknown[]) => unknown,
    switchSession: chatTargetHelpers.switchSession as (...args: unknown[]) => unknown,
    openCharSettingsByName: chatTargetHelpers.openCharSettingsByName as (...args: unknown[]) => unknown,
    openChatSessionCreator: characterManagement.openChatSessionCreator as (() => unknown) | undefined,
    editGroup: characterManagement.editGroup as (...args: unknown[]) => unknown,
    editCrowd: characterManagement.editCrowd as (...args: unknown[]) => unknown,
    getCharAvatarById: chatTargetHelpers.getCharAvatarById as (...args: unknown[]) => unknown,
    getCharAvatar: chatTargetHelpers.getCharAvatar as (...args: unknown[]) => unknown,
    getCharEmoji: chatTargetHelpers.getCharEmoji as (...args: unknown[]) => unknown,
    getCharNameById: chatUiState.getCharNameById as (...args: unknown[]) => unknown
  })
}

function buildDerivedStateBindings({ derivedState, shellSupport }: DerivedStateBindingsInput) {
  return buildWorkspaceShellControllerDerivedState({
    filteredTickets: derivedState.filteredTickets,
    currentMessages: derivedState.currentMessages,
    currentChatTitle: derivedState.currentChatTitle,
    currentAlias: derivedState.currentAlias,
    currentScene: derivedState.currentScene,
    loadedSummaryItems: shellSupport.loadedSummaryItems,
    chatPanelViewModel: derivedState.chatPanelViewModel,
    settingsPanelViewModel: derivedState.settingsPanelViewModel,
    taskPanelMeta: derivedState.taskPanelMeta,
    filteredAtCharacters: derivedState.filteredAtCharacters,
    filteredTasks: derivedState.filteredTasks,
    ungroupedCharacters: derivedState.ungroupedCharacters,
    loadedSummaryCount: derivedState.loadedSummaryCount,
    currentCharacter: derivedState.currentCharacter,
    currentCharacterAvatar: derivedState.currentCharacterAvatar
  })
}

function buildRuntimeStateBindings({
  shellSupport,
  flowHub,
  chatUiState,
  workspaceRuntime,
  taskTimelineHelpers,
  appState
}: {
  shellSupport: Record<string, unknown>
  flowHub: Record<string, unknown>
  chatUiState: Record<string, unknown>
  workspaceRuntime: Record<string, unknown>
  taskTimelineHelpers: Record<string, unknown>
  appState: Record<string, unknown>
}) {
  return buildWorkspaceShellControllerRuntimeState({
    streamingText: shellSupport.streamingText,
    currentStreamingSpeakerName: shellSupport.currentStreamingSpeakerName,
    currentStreamingTargetId: shellSupport.currentStreamingTargetId,
    environmentNarrationLoading: shellSupport.environmentNarrationLoading,
    plannedGroupSpeakers: shellSupport.plannedGroupSpeakers,
    editingMessageIndex: flowHub.editingMessageIndex,
    editingMessageContent: flowHub.editingMessageContent,
    regeneratingMessageIndex: flowHub.regeneratingMessageIndex,
    mentionSelectedChars: chatUiState.mentionSelectedChars,
    mentionExcludedChars: chatUiState.mentionExcludedChars,
    runtimeTransactions: workspaceRuntime.runtimeTransactions,
    transactionExecuting: shellSupport.transactionExecuting,
    hasTaskTimeline: taskTimelineHelpers.hasTaskTimeline,
    getTaskTimelineNodes: taskTimelineHelpers.getTaskTimelineNodes as (task: unknown) => unknown,
    isRequestingTask: appState.isRequestingTask,
    expandedTaskId: appState.expandedTaskId,
    customMarkType: appState.customMarkType,
    customMarkNote: appState.customMarkNote,
    newTaskName: appState.newTaskName,
    newTaskDesc: appState.newTaskDesc,
    newTaskReward: appState.newTaskReward,
    newTaskCategory: appState.newTaskCategory,
    newTaskBonus: appState.newTaskBonus,
    taskAssignerChar: appState.taskAssignerChar,
    taskLoadContact: appState.taskLoadContact,
    newCharForm: appState.newCharForm,
    charGroupEditForm: appState.charGroupEditForm,
    editingGroupId: appState.editingGroupId,
    groupForm: appState.groupForm,
    groupEditForm: appState.groupEditForm,
    showGroupEditor: appState.showGroupEditor,
    sceneForm: appState.sceneForm,
    editingCrowdId: appState.editingCrowdId,
    crowdForm: appState.crowdForm,
    showAddCharacter: appState.showAddCharacter,
    showCharGroupManager: appState.showCharGroupManager,
    showCreateGroup: appState.showCreateGroup,
    showCrowdEditor: appState.showCrowdEditor,
    showChatSummary: flowHub.showChatSummary,
    showConversationManager: flowHub.showConversationManager,
    showPromptPresetEditor: appState.showPromptPresetEditor,
    showUserEditor: appState.showUserEditor,
    showSpendMoney: appState.showSpendMoney,
    clearCurrentChat: chatUiState.clearCurrentChat as () => unknown,
    requestClearCurrentChatContext: chatUiState.requestClearCurrentChatContext as () => void,
    addMentionChar: chatUiState.addMentionChar as (charId: string) => unknown,
    removeMentionChar: chatUiState.removeMentionChar as (index: number) => unknown,
    toggleExcludeChar: chatUiState.toggleExcludeChar as (charId: string) => unknown,
    togglePlusMenu: chatUiState.togglePlusMenu as () => unknown,
    startEditMessage: flowHub.startEditMessage as (index: number) => unknown,
    cancelEditMessage: flowHub.cancelEditMessage as () => unknown,
    saveEditMessage: flowHub.saveEditMessage as (index?: number) => unknown,
    saveAndRegenerate: flowHub.saveAndRegenerate as (index?: number) => unknown,
    // 批次5b：导演模式纠偏继续/取消/输入。
    updateCorrectionText: flowHub.updateCorrectionText as ((text: string) => unknown) | undefined,
    continueCorrection: flowHub.continueCorrection as (() => unknown) | undefined,
    cancelCorrection: flowHub.cancelCorrection as (() => unknown) | undefined,
    deleteMessage: flowHub.deleteMessage as (index: number) => unknown,
    selectMessageVersion: flowHub.selectMessageVersion as (index: number, nextIndex: number) => unknown,
    copyMessage: flowHub.copyMessage as (index: number) => unknown,
    toggleMessagePromptVisibility: flowHub.toggleMessagePromptVisibility as ((index: number) => unknown) | undefined,
    regenerateMsg: flowHub.regenerateMsg as (index: number, mode?: 'recall' | 'prompt_replay', directorOptions?: { instruction?: string }) => unknown,
    applyDirectorPrecisionEdits: flowHub.applyDirectorPrecisionEdits as ((refsText: string, options?: { correctionText?: string; anchorMessageId?: number }) => unknown) | undefined,
    sidebarOpen: shellSupport.sidebarOpen,
    collapsedGroups: shellSupport.collapsedGroups,
    editCharacter: shellSupport.editCharacter as (target?: unknown) => unknown,
    showCharacterEditor: appState.showCharacterEditor,
    showCurtainPanel: appState.showCurtainPanel,
    showAliasSelector: appState.showAliasSelector,
    setMessagesAreaRef: appState.setMessagesAreaRef as (element: unknown) => unknown,
    chatStickToBottom: appState.chatStickToBottom,
    plusMenuOpen: chatUiState.plusMenuOpen,
    atMenuOpen: chatUiState.atMenuOpen,
    chatInputText: chatUiState.chatInputText,
    onInputChatText: chatUiState.onInputChatText as (value: string) => unknown,
    setMenuContainerRef: chatUiState.setMenuContainerRef as (element: unknown) => unknown,
    setChatInputRef: chatUiState.setChatInputRef as (element: unknown) => unknown,
    operationDetail: appState.operationDetail,
    // 图片附件（批4）：与 chatInputText 同源同层，从 chatUiState 透传给 ChatInputBar 哑组件。
    pendingImageAttachments: chatUiState.pendingImageAttachments,
    handleImageAttachmentPaste: chatUiState.handleImageAttachmentPaste as (event: unknown) => unknown,
    handleImageAttachmentDrop: chatUiState.handleImageAttachmentDrop as (event: unknown) => unknown,
    handleImageAttachmentDragOver: chatUiState.handleImageAttachmentDragOver as (event: unknown) => unknown,
    removeImageAttachment: chatUiState.removeImageAttachment as (id: string) => unknown,
    retryImageAttachmentUpload: chatUiState.retryImageAttachmentUpload as (id: string) => unknown
  })
}

function buildTaskStateBindings({ appState, opsHub }: {
  appState: Record<string, unknown>
  opsHub: Record<string, unknown>
}) {
  return buildWorkspaceShellControllerTaskState({
    batchTicket: appState.batchTicket,
    batchAmount: appState.batchAmount,
    showBatchExchange: appState.showBatchExchange,
    showBatchUse: appState.showBatchUse,
    openEditTicket: opsHub.openEditTicket as (ticket: unknown) => unknown,
    showAddTicket: appState.showAddTicket,
    showTagManager: appState.showTagManager,
    useCustomTag: opsHub.useCustomTag as (tag: unknown) => unknown
  })
}

export function buildWorkspaceShellControllerViewStateBindings(ctx: WorkspaceShellViewBindingContext) {
  const {
    boot,
    domains,
    opsHub,
    flowHub
  } = ctx
  const {
    toast,
    appState,
    chatUiState,
    shellSupport,
    workspaceRuntime,
    uiHelpers,
    taskTimelineHelpers,
    appSmallHelpers,
    environmentOps
  } = boot
  const {
    chatTargetHelpers,
    derivedState,
    chatTransfer,
    characterManagement
  } = domains

  return {
    uiHelperBindings: buildUiHelperBindings({ toast, uiHelpers, flowHub, opsHub, appState }),
    environmentBindings: buildEnvironmentBindings({ environmentOps, appState, appSmallHelpers }),
    chatTargetBindings: buildChatTargetBindings({ chatTransfer, chatTargetHelpers, characterManagement, chatUiState }),
    derivedStateBindings: buildDerivedStateBindings({ derivedState, shellSupport }),
    runtimeStateBindings: buildRuntimeStateBindings({
      shellSupport,
      flowHub,
      chatUiState,
      workspaceRuntime,
      taskTimelineHelpers,
      appState
    }),
    taskStateBindings: buildTaskStateBindings({ appState, opsHub })
  }
}
