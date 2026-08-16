import { describe, expect, it, vi, beforeEach } from 'vitest'

const useResourceStoreMock = vi.fn()
const useCharacterStoreMock = vi.fn()
const useChatStoreMock = vi.fn()
const useSettingStoreMock = vi.fn()
const useTaskStoreMock = vi.fn()
const useAuthStoreMock = vi.fn()
const useAIMock = vi.fn()
const useTimerMock = vi.fn()
const useCloudSyncMock = vi.fn()
const useToastMock = vi.fn()
const useChatUiStateMock = vi.fn()
const useUiHelpersMock = vi.fn()
const useTaskTimelineHelpersMock = vi.fn()
const useAppStateMock = vi.fn()
const useAppSmallHelpersMock = vi.fn()
const useAppShellSupportMock = vi.fn()
const useWorkspaceRuntimeMock = vi.fn()
const useEnvironmentOpsMock = vi.fn()
const useWorkspaceRuntimeStoreMock = vi.fn()
const buildEnvironmentOpsContextMock = vi.fn((ctx) => ctx)

vi.mock('../../../src/stores/resourceStore.ts', () => ({ useResourceStore: useResourceStoreMock }))
vi.mock('../../../src/stores/characterStore.ts', () => ({ useCharacterStore: useCharacterStoreMock }))
vi.mock('../../../src/stores/chatStore.ts', () => ({ useChatStore: useChatStoreMock }))
vi.mock('../../../src/stores/settingStore.ts', () => ({ useSettingStore: useSettingStoreMock }))
vi.mock('../../../src/stores/taskStore.ts', () => ({ useTaskStore: useTaskStoreMock }))
vi.mock('../../../src/stores/authStore.ts', () => ({ useAuthStore: useAuthStoreMock }))
vi.mock('../../../src/composables/useAI.ts', () => ({ useAI: useAIMock }))
vi.mock('../../../src/composables/useTimer.ts', () => ({ useTimer: useTimerMock, timerEventEmitter: 'timer-emitter' }))
vi.mock('../../../src/composables/useCloudSync.ts', () => ({ useCloudSync: useCloudSyncMock }))
vi.mock('../../../src/composables/useToast.ts', () => ({ useToast: useToastMock }))
vi.mock('../../../src/composables/app/useChatUiState.ts', () => ({ useChatUiState: useChatUiStateMock }))
vi.mock('../../../src/composables/app/useUiHelpers.ts', () => ({ useUiHelpers: useUiHelpersMock }))
vi.mock('../../../src/composables/app/useTaskTimelineHelpers.ts', () => ({ useTaskTimelineHelpers: useTaskTimelineHelpersMock }))
vi.mock('../../../src/composables/app/useAppState.ts', () => ({ useAppState: useAppStateMock }))
vi.mock('../../../src/composables/app/useAppSmallHelpers.ts', () => ({ useAppSmallHelpers: useAppSmallHelpersMock }))
vi.mock('../../../src/composables/app/useAppShellSupport.ts', () => ({ useAppShellSupport: useAppShellSupportMock }))
vi.mock('../../../src/composables/app/useWorkspaceRuntime.ts', () => ({ useWorkspaceRuntime: useWorkspaceRuntimeMock }))
vi.mock('../../../src/composables/app/useEnvironmentOps.ts', () => ({ useEnvironmentOps: useEnvironmentOpsMock }))
vi.mock('../../../src/app/workspaceRuntimeStore.ts', () => ({ useWorkspaceRuntimeStore: useWorkspaceRuntimeStoreMock }))
vi.mock('../../../src/composables/app/useAppShellAssemblers.ts', async () => {
  const actual = await vi.importActual('../../../src/composables/app/useAppShellAssemblers.ts')
  return {
    ...actual,
    buildEnvironmentOpsContext: buildEnvironmentOpsContextMock
  }
})

describe('useWorkspaceShellControllerBoot', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('会统一创建壳层启动阶段依赖，并把 runtimeStore 传给界面辅助层', async () => {
    const resourceStore = {}
    const charStore = {}
    const chatStore = {}
    const settingStore = {}
    const taskStore = {}
    const authStore = {}
    const aiRuntime = {
      callAI: vi.fn(),
      callAIStream: vi.fn(),
      cleanAiPrefix: vi.fn(),
      detectLocationChange: vi.fn(),
      buildSystemPrompt: vi.fn(),
      buildPromptMessages: vi.fn()
    }
    const timerComposable = {}
    const cloudSync = {}
    const runtimeFeedbackStore = { id: 'runtime-feedback' }
    const toastState = { toastVisible: true, toastMessage: 'ok', toastType: 'success', toast: vi.fn() }
    const appState = {
      customTags: [],
      eventStack: [],
      showConfirmDialog: {},
      confirmDialog: {},
      showChatTransferDialog: {},
      chatTransferDialog: {},
      isLoadingLocation: {},
      isLoadingWeather: {},
      editingLocation: {},
      tempLocation: {},
      weatherApiKey: {},
      weatherApiDomain: {}
    }
    const chatUiState = { chatInputText: '' }
    const shellSupport = {
      collapsedGroups: {},
      streamingText: {},
      currentStreamingSpeakerName: {}
    }
    const workspaceRuntime = {
      workspaceRuntimeStore: { id: 'runtime-store' }
    }
    const uiHelpers = { abortChat: vi.fn() }
    const taskTimelineHelpers = { hasTaskTimeline: vi.fn() }
    const appSmallHelpers = { normalizeAvatarUrl: vi.fn() }
    const environmentOps = { loadWeatherConfig: vi.fn() }

    useResourceStoreMock.mockReturnValue(resourceStore)
    useCharacterStoreMock.mockReturnValue(charStore)
    useChatStoreMock.mockReturnValue(chatStore)
    useSettingStoreMock.mockReturnValue(settingStore)
    useTaskStoreMock.mockReturnValue(taskStore)
    useAuthStoreMock.mockReturnValue(authStore)
    useAIMock.mockReturnValue(aiRuntime)
    useTimerMock.mockReturnValue(timerComposable)
    useCloudSyncMock.mockReturnValue(cloudSync)
    useWorkspaceRuntimeStoreMock.mockReturnValue(runtimeFeedbackStore)
    useToastMock.mockReturnValue(toastState)
    useAppStateMock.mockReturnValue(appState)
    useChatUiStateMock.mockReturnValue(chatUiState)
    useAppShellSupportMock.mockReturnValue(shellSupport)
    useWorkspaceRuntimeMock.mockReturnValue(workspaceRuntime)
    useUiHelpersMock.mockReturnValue(uiHelpers)
    useTaskTimelineHelpersMock.mockReturnValue(taskTimelineHelpers)
    useAppSmallHelpersMock.mockReturnValue(appSmallHelpers)
    useEnvironmentOpsMock.mockReturnValue(environmentOps)

    const { useWorkspaceShellControllerBoot } = await import('../../../src/composables/app/useWorkspaceShellControllerBoot.ts')
    const result = useWorkspaceShellControllerBoot()

    expect(result.resourceStore).toBe(resourceStore)
    expect(result.workspaceRuntime).toBe(workspaceRuntime)
    expect(result.uiHelpers).toBe(uiHelpers)
    expect(useUiHelpersMock).toHaveBeenCalledWith(expect.objectContaining({
      workspaceRuntimeStore: workspaceRuntime.workspaceRuntimeStore
    }))
    expect(useWorkspaceRuntimeMock).toHaveBeenCalledWith(expect.objectContaining({
      resourceStore,
      charStore,
      chatStore,
      settingStore,
      taskStore,
      timerComposable
    }))
  })
})
