import { computed } from 'vue'
import { useCharacterManagement } from './useCharacterManagement'
import { useApiPresetManager } from './useApiPresetManager'
import { useChatTargetHelpers } from './useChatTargetHelpers'
import { useAppDerivedState } from './useAppDerivedState'
import { useChatTransfer } from './useChatTransfer'
import type { useAppState } from './useAppState'
import {
  buildCharacterManagementContext,
  buildChatTargetHelpersContext,
  buildAppDerivedStateContext
} from './useAppShellAssemblers'

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

type WorkspaceShellControllerDomainsInput = {
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

export function useWorkspaceShellControllerDomains({
  resourceStore,
  charStore,
  chatStore,
  settingStore,
  taskStore,
  toast,
  appState,
  shellSupport,
  chatUiState,
  uiHelpers,
  appSmallHelpers
}: WorkspaceShellControllerDomainsInput) {
  const {
    chatStickToBottom,
    showCharacterEditor,
    chatTransferDialog,
    showChatTransferDialog,
    newCharForm,
    charEditForm,
    collapsedDays,
    copyingFromDay,
    copyingSlot,
    copyTargetDays,
    newRelationshipTarget,
    newNicknameInput,
    newActivityInput,
    newLocationInput,
    showAddCharacter,
    showCurtainPanel,
    curtainFocusMessageId,
    showPromptLogPanel,
    promptLogFocusMessageId,
    showSceneEditor,
    sceneForm,
    showAliasSelector,
    showAliasEditor,
    editingAliasId,
    aliasForm,
    newGroupName,
    newGroupEmoji,
    editingGroupId,
    groupForm,
    groupEditForm,
    showCreateGroup,
    showGroupEditor,
    editingCrowdId,
    crowdForm,
    showCrowdEditor,
    apiPresetForm,
    modelList,
    showAddApiPreset,
    showEditApiPreset,
    currentApiPresetIndex,
    isLoadingModels,
    isTestingApi,
    currentTaskTab,
    currentTicketCategory
  } = appState

  const {
    editingCharacter,
    editCharacter
  } = shellSupport

  const {
    normalizeAvatarUrl
  } = appSmallHelpers

  let currentChatTitleRef: { value?: string } | null = null

  const chatTargetHelpers = useChatTargetHelpers(buildChatTargetHelpersContext({
    charStore,
    chatStore,
    chatStickToBottom,
    normalizeAvatarUrl,
    getCurrentChatTitle: () => currentChatTitleRef?.value || '',
    onEditCharacter: (char: unknown) => {
      editCharacter(char)
      showCharacterEditor.value = true
    }
  }))

  const derivedState = useAppDerivedState(buildAppDerivedStateContext({
    chatStore,
    charStore,
    resourceStore,
    taskStore,
    settingStore,
    currentTaskTab,
    currentTicketCategory,
    atSearchText: chatUiState.atSearchText,
    getTargetName: chatTargetHelpers.getTargetName,
    normalizeAvatarUrl
  }))
  currentChatTitleRef = derivedState.currentChatTitle

  const editorCharacter = computed(() => editingCharacter.value || derivedState.currentCharacter.value)

  const chatTransfer = useChatTransfer({
    charStore,
    chatStore,
    chatTransferDialog,
    showChatTransferDialog,
    closeChatTransferDialog: () => {
      chatTransferDialog.title = ''
      chatTransferDialog.sourceTarget = ''
      chatTransferDialog.toSingle = false
      chatTransferDialog.candidates = []
      chatTransferDialog.input = ''
      chatTransferDialog.targetId = ''
      chatTransferDialog.loading = false
      chatTransferDialog.onConfirm = null
      showChatTransferDialog.value = false
    },
    scrollToBottom: chatTargetHelpers.scrollToBottom,
    toast
  })

  const characterManagement = useCharacterManagement(buildCharacterManagementContext({
    charStore,
    chatStore,
    settingStore,
    editorCharacter,
    showAddCharacter,
    newCharForm,
    charEditForm,
    collapsedDays,
    copyingFromDay,
    copyingSlot,
    copyTargetDays,
    showCopySlotDialog: appState.showCopySlotDialog,
    newRelationshipTarget,
    newNicknameInput,
    newActivityInput,
    newLocationInput,
    showCharacterEditor,
    showCurtainPanel,
    curtainFocusMessageId,
    showPromptLogPanel,
    promptLogFocusMessageId,
    showSceneEditor,
    sceneForm,
    showAliasSelector,
    showAliasEditor,
    editingAliasId,
    aliasForm,
    newGroupName,
    newGroupEmoji,
    editingGroupId,
    groupForm,
    groupEditForm,
    showCreateGroup,
    showGroupEditor,
    editingCrowdId,
    crowdForm,
    showCrowdEditor,
    openConfirmDialog: uiHelpers.openConfirmDialog,
    openPromptDialog: uiHelpers.openPromptDialog,
    toast
  }))

  const apiPresetManager = useApiPresetManager({
    settingStore: settingStore as {
      apiPresets: Array<{
        name?: string
        providerType?: string
        provider_type?: string
        baseUrl?: string
        apiUrl?: string
        apiKey?: string
        model?: string
        availableModels?: string[]
        temperature?: number
        maxTokens?: number
        fallbackPreset?: string
        isDefault?: boolean
      }>
      updateApiPreset: (name: string, data: Partial<{
        name?: string
        providerType?: string
        provider_type?: string
        baseUrl?: string
        apiUrl?: string
        apiKey?: string
        model?: string
        availableModels?: string[]
        temperature?: number
        maxTokens?: number
        fallbackPreset?: string
        isDefault?: boolean
      }>) => Promise<void>
      addApiPreset: (data: {
        name: string
        model: string
        providerType?: string
        provider_type?: string
        baseUrl?: string
        apiUrl?: string
        apiKey?: string
        availableModels?: string[]
        temperature?: number
        maxTokens?: number
        fallbackPreset?: string
        isDefault?: boolean
      }) => Promise<void>
    },
    apiPresetForm,
    modelList,
    showAddApiPreset,
    showEditApiPreset,
    currentApiPresetIndex,
    isLoadingModels,
    isTestingApi,
    toast
  })

  return {
    chatTargetHelpers,
    derivedState,
    editorCharacter,
    chatTransfer,
    characterManagement,
    apiPresetManager
  }
}
