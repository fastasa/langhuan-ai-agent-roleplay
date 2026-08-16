import { computed, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const useChatTargetHelpersMock = vi.fn()
const useAppDerivedStateMock = vi.fn()
const useChatTransferMock = vi.fn()
const useCharacterManagementMock = vi.fn()
const useApiPresetManagerMock = vi.fn()
const buildChatTargetHelpersContextMock = vi.fn((ctx) => ctx)
const buildAppDerivedStateContextMock = vi.fn((ctx) => ctx)
const buildCharacterManagementContextMock = vi.fn((ctx) => ctx)

vi.mock('../../../src/composables/app/useChatTargetHelpers.ts', () => ({
  useChatTargetHelpers: useChatTargetHelpersMock
}))
vi.mock('../../../src/composables/app/useAppDerivedState.ts', () => ({
  useAppDerivedState: useAppDerivedStateMock
}))
vi.mock('../../../src/composables/app/useChatTransfer.ts', () => ({
  useChatTransfer: useChatTransferMock
}))
vi.mock('../../../src/composables/app/useCharacterManagement.ts', () => ({
  useCharacterManagement: useCharacterManagementMock
}))
vi.mock('../../../src/composables/app/useApiPresetManager.ts', () => ({
  useApiPresetManager: useApiPresetManagerMock
}))
vi.mock('../../../src/composables/app/useAppShellAssemblers.ts', () => ({
  buildChatTargetHelpersContext: buildChatTargetHelpersContextMock,
  buildAppDerivedStateContext: buildAppDerivedStateContextMock,
  buildCharacterManagementContext: buildCharacterManagementContextMock
}))

describe('useWorkspaceShellControllerDomains', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('会把聊天目标、派生状态、角色管理和预设管理统一分组返回', async () => {
    useChatTargetHelpersMock.mockReturnValue({
      getTargetName: vi.fn(),
      getCharEmoji: vi.fn(),
      getCharAvatar: vi.fn(),
      getCharAvatarById: vi.fn(),
      openCharSettingsByName: vi.fn(),
      scrollToBottom: vi.fn(),
      switchChat: vi.fn()
    })
    useAppDerivedStateMock.mockReturnValue({
      currentChatTitle: computed(() => '标题'),
      currentCharacter: computed(() => ({ id: 'char_1' }))
    })
    useChatTransferMock.mockReturnValue({ transferCurrentChat: vi.fn() })
    useCharacterManagementMock.mockReturnValue({ saveCharacterEdit: vi.fn() })
    useApiPresetManagerMock.mockReturnValue({ loadApiPreset: vi.fn() })

    const { useWorkspaceShellControllerDomains } = await import('../../../src/composables/app/useWorkspaceShellControllerDomains.ts')
    const result = useWorkspaceShellControllerDomains({
      resourceStore: {},
      charStore: {},
      chatStore: {},
      settingStore: {},
      taskStore: {},
      toast: vi.fn(),
      appState: {
        messagesArea: ref(null),
        showCharacterEditor: ref(false),
        chatTransferDialog: {},
        showChatTransferDialog: ref(false),
        newCharForm: {},
        charEditForm: {},
        collapsedDays: {},
        copyingFromDay: '',
        copyingSlot: '',
        copyTargetDays: [],
        newRelationshipTarget: '',
        newNicknameInput: '',
        newActivityInput: '',
        newLocationInput: '',
        showAddCharacter: ref(false),
        showCurtainPanel: ref(false),
        showSceneEditor: ref(false),
        sceneForm: {},
        showAliasSelector: ref(false),
        showAliasEditor: ref(false),
        editingAliasId: '',
        aliasForm: {},
        newGroupName: '',
        newGroupEmoji: '',
        editingGroupId: '',
        groupForm: {},
        groupEditForm: {},
        showCreateGroup: ref(false),
        showGroupEditor: ref(false),
        editingCrowdId: '',
        crowdForm: {},
        showCrowdEditor: ref(false),
        apiPresetForm: {},
        modelList: [],
        showAddApiPreset: ref(false),
        showEditApiPreset: ref(false),
        currentApiPresetIndex: ref(0),
        isLoadingModels: ref(false),
        isTestingApi: ref(false),
        currentTaskTab: ref('all'),
        currentTicketCategory: ref(''),
        atSearchText: ref(''),
        showCopySlotDialog: ref(false)
      },
      shellSupport: {
        editingCharacter: ref(null),
        editCharacter: vi.fn()
      },
      chatUiState: {
        atSearchText: ref('')
      },
      uiHelpers: {},
      appSmallHelpers: {
        normalizeAvatarUrl: vi.fn()
      }
    })

    expect(result.chatTargetHelpers.switchChat).toBeTypeOf('function')
    expect(result.derivedState.currentChatTitle.value).toBe('标题')
    expect(result.characterManagement.saveCharacterEdit).toBeTypeOf('function')
    expect(result.apiPresetManager.loadApiPreset).toBeTypeOf('function')
  })
})
