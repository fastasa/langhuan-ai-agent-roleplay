import type { useAppState } from './useAppState'

type WorkspaceShellDomainsAppState = Pick<ReturnType<typeof useAppState>,
  | 'chatStickToBottom'
  | 'showCharacterEditor'
  | 'chatTransferDialog'
  | 'showChatTransferDialog'
  | 'newCharForm'
  | 'charEditForm'
  | 'collapsedDays'
  | 'copyingFromDay'
  | 'copyingSlot'
  | 'copyTargetDays'
  | 'newRelationshipTarget'
  | 'newNicknameInput'
  | 'newActivityInput'
  | 'newLocationInput'
  | 'showAddCharacter'
  | 'showCurtainPanel'
  | 'curtainFocusMessageId'
  | 'showPromptLogPanel'
  | 'promptLogFocusMessageId'
  | 'showSceneEditor'
  | 'sceneForm'
  | 'showAliasSelector'
  | 'showAliasEditor'
  | 'editingAliasId'
  | 'aliasForm'
  | 'newGroupName'
  | 'newGroupEmoji'
  | 'editingGroupId'
  | 'groupForm'
  | 'groupEditForm'
  | 'showCreateGroup'
  | 'showGroupEditor'
  | 'editingCrowdId'
  | 'crowdForm'
  | 'showCrowdEditor'
  | 'apiPresetForm'
  | 'modelList'
  | 'showAddApiPreset'
  | 'showEditApiPreset'
  | 'currentApiPresetIndex'
  | 'isLoadingModels'
  | 'isTestingApi'
  | 'currentTaskTab'
  | 'currentTicketCategory'
  | 'showCopySlotDialog'
>

type WorkspaceShellControllerDomainContextBoot = {
  resourceStore: unknown
  charStore: unknown
  chatStore: unknown
  settingStore: unknown
  taskStore: unknown
  toast: (msg: string, type?: 'success' | 'error' | 'info' | 'warning') => void
  appState: WorkspaceShellDomainsAppState
  shellSupport: {
    editingCharacter: { value: unknown }
    editCharacter: (char: unknown) => void
  }
  chatUiState: {
    atSearchText: { value: string }
  }
  uiHelpers: {
    openConfirmDialog?: (title: string, message: string, onConfirm: () => void, options?: Record<string, unknown>) => void
    openPromptDialog?: (options: {
      title: string
      message?: string
      inputLabel?: string
      placeholder?: string
      confirmText?: string
      initialValue?: string
      validator?: (value: string) => string
      onConfirm: (value: string) => void
    }) => void
  }
  appSmallHelpers: {
    normalizeAvatarUrl: (path?: string | null) => string
  }
}

export function buildWorkspaceShellControllerDomainContext(boot: WorkspaceShellControllerDomainContextBoot) {
  return {
    resourceStore: boot.resourceStore,
    charStore: boot.charStore,
    chatStore: boot.chatStore,
    settingStore: boot.settingStore,
    taskStore: boot.taskStore,
    toast: boot.toast,
    appState: boot.appState,
    shellSupport: boot.shellSupport,
    chatUiState: boot.chatUiState,
    uiHelpers: boot.uiHelpers,
    appSmallHelpers: boot.appSmallHelpers
  }
}
