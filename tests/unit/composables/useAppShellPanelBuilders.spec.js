import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import {
  buildEnvironmentBridge,
  buildChatBridge,
  buildLocalArchiveSyncBridge,
  buildDataManageBridge,
  buildTransactionBridge
} from '../../../src/composables/app/useAppShellPanelBuilders.ts'

vi.mock('../../../src/app/manualNarrationCommand', () => ({
  runManualNarrationCommand: vi.fn(async () => ({
    ok: true,
    content: '门外传来一阵很轻的敲门声。',
    messageId: 88
  }))
}))

vi.mock('../../../src/repositories/chatRepository', async () => {
  const actual = await vi.importActual('../../../src/repositories/chatRepository')
  return {
    ...actual,
    runChatMessageProjectionBySessionId: vi.fn(async () => ({ ok: true })),
    runChatProjectionWritebackBySessionId: vi.fn(async () => ({
      status: 'complete',
      hiddenProjectionCount: 20,
      successEventIds: ['event_1'],
      failedEvents: []
    }))
  }
})

vi.mock('../../../src/repositories/aiRepository', () => ({
  requestAiEmbeddings: vi.fn(async () => ({
    ok: true,
    json: async () => ({ data: [] }),
    text: async () => ''
  }))
}))

vi.mock('../../../src/app/narrationOrchestrator', () => ({
  planNarration: vi.fn(() => ({ shouldInsert: true, narrationKind: 'event_push' }))
}))

const { runManualNarrationCommand } = await import('../../../src/app/manualNarrationCommand')
const { runChatMessageProjectionBySessionId, runChatProjectionWritebackBySessionId } = await import('../../../src/repositories/chatRepository')

function createChatTaskRunMocks() {
  const runningTaskIds = new Set()
  const taskControllers = new Map()
  const workspaceRuntimeStore = {
    startAgentTaskNotice: vi.fn(() => 'notice_manual_event'),
    updateAgentTaskNotice: vi.fn(),
    completeAgentTaskNotice: vi.fn(),
    failAgentTaskNotice: vi.fn(),
    startChatTaskRun: vi.fn((payload) => {
      const id = `task_${runningTaskIds.size + 1}`
      const abortController = payload.abortController || new AbortController()
      runningTaskIds.add(id)
      taskControllers.set(id, abortController)
      return {
        id,
        ...payload,
        abortController
      }
    }),
    completeChatTaskRun: vi.fn((id) => { runningTaskIds.delete(id) }),
    failChatTaskRun: vi.fn((id) => { runningTaskIds.delete(id) }),
    stopChatTaskRun: vi.fn((id) => {
      const controller = taskControllers.get(id)
      if (controller && !controller.signal.aborted) controller.abort()
      runningTaskIds.delete(id)
    }),
    isChatTaskRunActive: vi.fn((id) => runningTaskIds.has(id))
  }
  return workspaceRuntimeStore
}

async function flushAsyncTurns(count = 3) {
  for (let index = 0; index < count; index += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
}

describe('useAppShellPanelBuilders environment bridge', () => {
  it('右上角地点编辑写回当前会话三段帷幕地点', async () => {
    const updateSession = vi.fn(async () => {})
    const ctx = {
      currentScene: ref(null),
      settingStore: {
        currentLocation: '现实地点',
        currentTime: '现实时间',
        currentWeather: '晴',
        weatherDetail: null
      },
      chatStore: {
        current: {
          getActiveSessionId: vi.fn(() => 'session-1'),
          getCurrentSession: vi.fn(() => ({
            id: 'session-1',
            virtualLocationLarge: '维斯珂',
            virtualLocationMiddle: '旧宅',
            virtualLocationSmall: '书房',
            virtualLocation: '维斯珂 / 旧宅 / 书房'
          }))
        },
        updateSession
      },
      isLoadingLocation: ref(false),
      isLoadingWeather: ref(false),
      editingLocation: ref(false),
      tempLocation: ref(''),
      tempLocationLarge: ref(''),
      tempLocationMiddle: ref(''),
      tempLocationSmall: ref(''),
      showWeatherDetail: ref(false),
      getTemperatureFromWeather: vi.fn(() => ''),
      editLocation: vi.fn(),
      saveLocation: vi.fn(),
      cancelLocationEdit: vi.fn(),
      syncWeather: vi.fn(),
      updateCurrentTime: vi.fn(),
      toast: vi.fn()
    }
    const { environmentViewModel, environmentActions } = buildEnvironmentBridge(ctx)

    expect(environmentViewModel.value.currentLocationLarge).toBe('维斯珂')
    environmentActions.editLocation()
    environmentActions.updateTempLocationLarge?.('维斯珂')
    environmentActions.updateTempLocationMiddle?.('西翼')
    environmentActions.updateTempLocationSmall?.('会客室')
    await environmentActions.saveLocation()

    expect(updateSession).toHaveBeenCalledWith('session-1', expect.objectContaining({
      virtualLocationLarge: '维斯珂',
      virtualLocationMiddle: '西翼',
      virtualLocationSmall: '会客室',
      virtualLocation: '维斯珂 / 西翼 / 会客室'
    }))
    expect(ctx.toast).toHaveBeenCalledWith('帷幕地点已保存', 'success')
  })

  it('当前会话没有地点字段时右上角不继承全局地点', async () => {
    const ctx = {
      currentScene: ref(null),
      settingStore: {
        currentLocation: '维斯珂',
        currentTime: '现实时间',
        currentWeather: '晴',
        weatherDetail: null
      },
      chatStore: {
        current: {
          getActiveSessionId: vi.fn(() => 'session-empty'),
          getCurrentSession: vi.fn(() => ({
            id: 'session-empty'
          }))
        },
        updateSession: vi.fn(async () => {})
      },
      isLoadingLocation: ref(false),
      isLoadingWeather: ref(false),
      editingLocation: ref(false),
      tempLocation: ref(''),
      tempLocationLarge: ref(''),
      tempLocationMiddle: ref(''),
      tempLocationSmall: ref(''),
      showWeatherDetail: ref(false),
      getTemperatureFromWeather: vi.fn(() => ''),
      editLocation: vi.fn(),
      saveLocation: vi.fn(),
      cancelLocationEdit: vi.fn(),
      syncWeather: vi.fn(),
      updateCurrentTime: vi.fn(),
      toast: vi.fn()
    }

    const { environmentViewModel } = buildEnvironmentBridge(ctx)

    expect(environmentViewModel.value.currentLocation).toBe('')
    expect(environmentViewModel.value.currentTime).toBe('现实时间')
    expect(environmentViewModel.value.weatherText).toBe('晴')
  })

  it('当前会话只有现实地点时右上角显示会话自己的现实地点', async () => {
    const ctx = {
      currentScene: ref({
        location: '',
        realLocation: '临平',
        time: '现实时间',
        weather: '晴',
        usesVirtualWeather: false
      }),
      settingStore: {
        currentLocation: '维斯珂',
        currentTime: '现实时间',
        currentWeather: '晴',
        weatherDetail: null
      },
      chatStore: {
        current: {
          getActiveSessionId: vi.fn(() => 'session-real'),
          getCurrentSession: vi.fn(() => ({
            id: 'session-real',
            virtualRealLocation: '临平'
          }))
        },
        updateSession: vi.fn(async () => {})
      },
      isLoadingLocation: ref(false),
      isLoadingWeather: ref(false),
      editingLocation: ref(false),
      tempLocation: ref(''),
      tempLocationLarge: ref(''),
      tempLocationMiddle: ref(''),
      tempLocationSmall: ref(''),
      showWeatherDetail: ref(false),
      getTemperatureFromWeather: vi.fn(() => ''),
      editLocation: vi.fn(),
      saveLocation: vi.fn(),
      cancelLocationEdit: vi.fn(),
      syncWeather: vi.fn(),
      updateCurrentTime: vi.fn(),
      toast: vi.fn()
    }

    const { environmentViewModel } = buildEnvironmentBridge(ctx)

    expect(environmentViewModel.value.currentLocation).toBe('临平')
  })

  it('右上角地点编辑会把旧完整地点拆开，不再塞进小地点', async () => {
    const updateSession = vi.fn(async () => {})
    const ctx = {
      currentScene: ref(null),
      settingStore: {
        currentLocation: '现实地点',
        currentTime: '现实时间',
        currentWeather: '晴',
        weatherDetail: null
      },
      chatStore: {
        current: {
          getActiveSessionId: vi.fn(() => 'session-legacy'),
          getCurrentSession: vi.fn(() => ({
            id: 'session-legacy',
            virtualLocation: '维斯珂 / 博瑞利尔 / 柜台后'
          }))
        },
        updateSession
      },
      isLoadingLocation: ref(false),
      isLoadingWeather: ref(false),
      editingLocation: ref(false),
      tempLocation: ref(''),
      tempLocationLarge: ref(''),
      tempLocationMiddle: ref(''),
      tempLocationSmall: ref(''),
      showWeatherDetail: ref(false),
      getTemperatureFromWeather: vi.fn(() => ''),
      editLocation: vi.fn(),
      saveLocation: vi.fn(),
      cancelLocationEdit: vi.fn(),
      syncWeather: vi.fn(),
      updateCurrentTime: vi.fn(),
      toast: vi.fn()
    }
    const { environmentActions } = buildEnvironmentBridge(ctx)

    environmentActions.editLocation()

    expect(ctx.tempLocationLarge.value).toBe('维斯珂')
    expect(ctx.tempLocationMiddle.value).toBe('博瑞利尔')
    expect(ctx.tempLocationSmall.value).toBe('柜台后')

    environmentActions.updateTempLocationSmall?.('前台')
    await environmentActions.saveLocation()

    expect(updateSession).toHaveBeenCalledWith('session-legacy', expect.objectContaining({
      virtualLocationLarge: '维斯珂',
      virtualLocationMiddle: '博瑞利尔',
      virtualLocationSmall: '前台',
      virtualLocation: '维斯珂 / 博瑞利尔 / 前台'
    }))
  })
})

describe('useAppShellPanelBuilders transaction bridge', () => {
  it('only exposes transaction bridge state and actions', () => {
    const ctx = {
      runtimeTransactions: { value: [{ id: 'tx_1' }] },
      transactionExecuting: { value: false },
      commandClearTransactions: vi.fn(),
      commandConfirmTransactions: vi.fn(),
      commandConfirmTransactionAt: vi.fn(),
      commandRemoveTransactionAt: vi.fn()
    }

    const transactionBridge = buildTransactionBridge(ctx)

    expect(transactionBridge.transactionPanelViewModel.value.operations).toEqual([{ id: 'tx_1' }])
    expect(transactionBridge.transactionPanelActions.clearTransactions).toBe(ctx.commandClearTransactions)
    expect(transactionBridge.transactionPanelActions.confirmTransactions).toBe(ctx.commandConfirmTransactions)
    expect(transactionBridge.transactionPanelActions.confirmTransaction).toBe(ctx.commandConfirmTransactionAt)
    expect(transactionBridge.transactionPanelActions.removeTransaction).toBe(ctx.commandRemoveTransactionAt)
  })
})

describe('useAppShellPanelBuilders local archive bridge', () => {
  it('删除本机存档时会先打开正式确认弹窗', () => {
    const deleteSave = vi.fn()
    const openConfirmDialog = vi.fn((title, message, onConfirm) => {
      onConfirm()
    })
    const ctx = {
      sections: {},
      localArchiveAvailable: ref(true),
      localArchiveName: ref('本机'),
      localArchiveLabel: ref(''),
      localArchiveNote: ref(''),
      localArchiveSaves: ref([]),
      selectedLocalArchiveSlot: ref('slot_a'),
      selectedSyncModules: ref(['tasks']),
      localArchiveModuleDefinitions: ref([]),
      localArchiveActionState: ref({ phase: 'idle', type: 'idle', message: '' }),
      localArchiveSync: { isSyncing: ref(false), isRestoringArchive: ref(false), error: ref('') },
      setSelectedSyncModules: vi.fn(),
      openConfirmDialog,
      confirmDialog: {},
      localArchiveCommands: {
        archive: {
          loadSaves: vi.fn(),
          selectSave: vi.fn(),
          upload: vi.fn(),
          download: vi.fn(),
          createSave: vi.fn(),
          updateSaveNote: vi.fn(),
          renameSave: vi.fn(),
          deleteSave
        }
      }
    }

    const bridge = buildLocalArchiveSyncBridge(ctx)
    bridge.localArchiveSyncPanelActions.deleteLocalArchiveSave('slot_a')

    expect(openConfirmDialog).toHaveBeenCalledWith(
      '删除本机存档',
      '确定删除本机存档「slot_a」吗？删除后本机服务对应分片也会一起移除。',
      expect.any(Function)
    )
    expect(ctx.confirmDialog.confirmText).toBe('删除')
    expect(deleteSave).toHaveBeenCalledWith('slot_a')
  })
})

describe('useAppShellPanelBuilders data bridge', () => {
  it('重置数据时会先打开正式确认弹窗', () => {
    const resetAll = vi.fn()
    const openConfirmDialog = vi.fn((title, message, onConfirm) => {
      onConfirm()
    })
    const ctx = {
      sections: {},
      importFileInput: ref(null),
      exportAllData: vi.fn(),
      openConfirmDialog,
      confirmDialog: {},
      localArchiveCommands: {
        data: {
          exportAll: vi.fn(),
          resetAll
        }
      }
    }

    const bridge = buildDataManageBridge(ctx)
    bridge.dataManagePanelActions.resetData()

    expect(openConfirmDialog).toHaveBeenCalledWith(
      '重置全部数据',
      '确定要重置全部数据吗？此操作会清空当前工作区内容，并立即刷新页面。',
      expect.any(Function)
    )
    expect(ctx.confirmDialog.confirmText).toBe('确认重置')
    expect(resetAll).toHaveBeenCalledTimes(1)
  })
})

describe('useAppShellPanelBuilders chat bridge', () => {
  it('新建会话入口打开共用会话编辑弹窗', () => {
    const openChatSessionCreator = vi.fn()
    const ctx = {
      sidebarOpen: ref(false),
      charStore: {
        characters: [
          { id: 'char_a', name: '陈星依' },
          { id: 'char_b', name: '林晚' },
          { id: 'char_c', name: '姜序' }
        ],
        characterGroups: [],
        groups: [],
        crowds: []
      },
      chatStore: {
        entities: {
          chatSessions: ref({}),
          chatMessages: ref({})
        },
        runtime: {
          isTyping: ref(false)
        }
      },
      chatPanelViewModel: ref({
        activeChatSessionId: '',
        activeChatTargetId: '',
        displayMessages: []
      }),
      settingsPanelViewModel: ref({ aiEvaluationEnabled: false, isDarkMode: false }),
      getCharactersByGroup: vi.fn(),
      toggleGroupCollapse: vi.fn(),
      openChatSessionCreator,
      toast: vi.fn(),
      currentChatTitle: ref(''),
      loadedSummaryCount: ref(0),
      loadedSummaryItems: ref([]),
      isBootLoading: ref(false),
      currentCharacter: ref(null),
      currentScene: ref(null),
      currentAlias: ref(null),
      editingMessageIndex: ref(-1),
      editingMessageContent: ref(''),
      regeneratingMessageIndex: ref(-1),
      currentCharacterAvatar: ref(''),
      streamingText: ref(''),
      currentStreamingSpeakerName: ref(''),
      currentStreamingTargetId: ref(''),
      plannedGroupSpeakers: ref([]),
      plusMenuOpen: ref(false),
      atMenuOpen: ref(false),
      chatInputText: ref(''),
      mentionSelectedChars: ref([]),
      mentionExcludedChars: ref([]),
      filteredAtCharacters: ref([]),
      settingStore: { toggleDarkMode: vi.fn() }
    }

    const bridge = buildChatBridge(ctx)
    bridge.chatActions.openChatSessionCreator()

    expect(openChatSessionCreator).toHaveBeenCalledTimes(1)
  })

  it('会话侧栏保留归档状态供筛选', () => {
    const ctx = {
      sidebarOpen: ref(false),
      collapsedGroups: {},
      ungroupedCharacters: ref([]),
      charStore: {
        characters: [
          { id: 'char_a', name: '陈星依', avatarPath: 'avatars/character.png', emoji: '星' }
        ],
        characterGroups: [],
        groups: [],
        crowds: [],
        userProfile: {}
      },
      chatStore: {
        entities: {
          chatSessions: ref({
            session_a: {
              id: 'session_a',
              targetId: 'char_a',
              title: '当前会话',
              isArchived: false,
              updatedAt: '2026-04-28T02:00:00.000Z',
              conversationAvatarPath: 'avatars/session.png',
              conversationEmoji: '会'
            },
            archive_a: { id: 'archive_a', targetId: 'char_a', title: '历史归档', isArchived: true, updatedAt: '2026-04-28T03:00:00.000Z' }
          }),
          chatMessages: ref({
            session_a: [{ content: '现在的消息', createdAt: '2026-04-28T02:00:00.000Z' }],
            archive_a: [{ content: '归档消息', createdAt: '2026-04-28T03:00:00.000Z' }]
          })
        },
        runtime: {
          isTyping: ref(false)
        },
        getActiveSessionId: vi.fn(() => 'session_a'),
        getCurrentSession: vi.fn(() => null)
      },
      chatPanelViewModel: ref({
        activeChatSessionId: 'session_a',
        activeChatTargetId: 'char_a',
        displayMessages: []
      }),
      settingsPanelViewModel: ref({ aiEvaluationEnabled: false, isDarkMode: false }),
      getCharactersByGroup: vi.fn(),
      toggleGroupCollapse: vi.fn(),
      openChatSessionCreator: vi.fn(),
      toast: vi.fn(),
      currentChatTitle: ref(''),
      loadedSummaryCount: ref(0),
      loadedSummaryItems: ref([]),
      isBootLoading: ref(false),
      currentCharacter: ref(null),
      currentScene: ref(null),
      currentAlias: ref(null),
      editingMessageIndex: ref(-1),
      editingMessageContent: ref(''),
      regeneratingMessageIndex: ref(-1),
      currentCharacterAvatar: ref(''),
      streamingText: ref(''),
      currentStreamingSpeakerName: ref(''),
      currentStreamingTargetId: ref(''),
      plannedGroupSpeakers: ref([]),
      plusMenuOpen: ref(false),
      atMenuOpen: ref(false),
      chatInputText: ref(''),
      mentionSelectedChars: ref([]),
      mentionExcludedChars: ref([]),
      filteredAtCharacters: ref([]),
      settingStore: { toggleDarkMode: vi.fn() }
    }

    const bridge = buildChatBridge(ctx)

    expect(bridge.chatViewModel.value.chatSessionRows.map((row) => row.sessionId)).toEqual(['archive_a', 'session_a'])
    expect(bridge.chatViewModel.value.chatSessionRows.find((row) => row.sessionId === 'archive_a')?.isArchived).toBe(true)
    expect(bridge.chatViewModel.value.chatSessionRows.find((row) => row.sessionId === 'session_a')?.avatarPath).toBe('avatars/session.png')
    expect(bridge.chatViewModel.value.chatSessionRows.find((row) => row.sessionId === 'session_a')?.emoji).toBe('会')
  })

  it('会话侧栏预览只读取当前 sessionId 的消息', () => {
    const ctx = {
      sidebarOpen: ref(false),
      collapsedGroups: {},
      ungroupedCharacters: ref([]),
      charStore: {
        characters: [
          { id: 'char_a', name: '陈星依' }
        ],
        characterGroups: [],
        groups: [],
        crowds: [],
        userProfile: {}
      },
      chatStore: {
        entities: {
          chatSessions: ref({
            session_empty: { id: 'session_empty', targetId: 'char_a', title: '新会话', isArchived: false, updatedAt: '2026-04-29T01:00:00.000Z' }
          }),
          chatMessages: ref({
            char_a: [{ content: '旧会话的消息不该显示', createdAt: '2026-04-28T02:00:00.000Z' }]
          })
        },
        runtime: {
          isTyping: ref(false)
        },
        getActiveSessionId: vi.fn(() => 'session_empty'),
        getCurrentSession: vi.fn(() => null)
      },
      chatPanelViewModel: ref({
        activeChatSessionId: 'session_empty',
        activeChatTargetId: 'char_a',
        displayMessages: []
      }),
      settingsPanelViewModel: ref({ aiEvaluationEnabled: false, isDarkMode: false }),
      getCharactersByGroup: vi.fn(),
      toggleGroupCollapse: vi.fn(),
      openChatSessionCreator: vi.fn(),
      toast: vi.fn(),
      currentChatTitle: ref(''),
      loadedSummaryCount: ref(0),
      loadedSummaryItems: ref([]),
      isBootLoading: ref(false),
      currentCharacter: ref(null),
      currentScene: ref(null),
      currentAlias: ref(null),
      editingMessageIndex: ref(-1),
      editingMessageContent: ref(''),
      regeneratingMessageIndex: ref(-1),
      currentCharacterAvatar: ref(''),
      streamingText: ref(''),
      currentStreamingSpeakerName: ref(''),
      currentStreamingTargetId: ref(''),
      plannedGroupSpeakers: ref([]),
      plusMenuOpen: ref(false),
      atMenuOpen: ref(false),
      chatInputText: ref(''),
      mentionSelectedChars: ref([]),
      mentionExcludedChars: ref([]),
      filteredAtCharacters: ref([]),
      settingStore: { toggleDarkMode: vi.fn() }
    }

    const bridge = buildChatBridge(ctx)

    expect(bridge.chatViewModel.value.chatSessionRows[0]?.preview).toBe('暂无消息')
  })

  it('星依总agent会话（kind=xingyi）不进联系人侧栏会话行', () => {
    const ctx = {
      sidebarOpen: ref(false),
      collapsedGroups: {},
      ungroupedCharacters: ref([]),
      charStore: {
        characters: [
          { id: 'char_a', name: '陈星依' }
        ],
        characterGroups: [],
        groups: [],
        crowds: [],
        userProfile: {}
      },
      chatStore: {
        entities: {
          chatSessions: ref({
            session_normal: { id: 'session_normal', targetId: 'char_a', title: '普通会话', isArchived: false, updatedAt: '2026-07-04T01:00:00.000Z' },
            session_xingyi: { id: 'session_xingyi', targetId: 'xingyi_agent', kind: 'xingyi', title: '星依', isArchived: false, updatedAt: '2026-07-04T02:00:00.000Z' }
          }),
          chatMessages: ref({})
        },
        runtime: {
          isTyping: ref(false)
        },
        getActiveSessionId: vi.fn(() => 'session_normal'),
        getCurrentSession: vi.fn(() => null)
      },
      chatPanelViewModel: ref({
        activeChatSessionId: 'session_normal',
        activeChatTargetId: 'char_a',
        displayMessages: []
      }),
      settingsPanelViewModel: ref({ aiEvaluationEnabled: false, isDarkMode: false }),
      getCharactersByGroup: vi.fn(),
      toggleGroupCollapse: vi.fn(),
      openChatSessionCreator: vi.fn(),
      toast: vi.fn(),
      currentChatTitle: ref(''),
      loadedSummaryCount: ref(0),
      loadedSummaryItems: ref([]),
      isBootLoading: ref(false),
      currentCharacter: ref(null),
      currentScene: ref(null),
      currentAlias: ref(null),
      editingMessageIndex: ref(-1),
      editingMessageContent: ref(''),
      regeneratingMessageIndex: ref(-1),
      currentCharacterAvatar: ref(''),
      streamingText: ref(''),
      currentStreamingSpeakerName: ref(''),
      currentStreamingTargetId: ref(''),
      plannedGroupSpeakers: ref([]),
      plusMenuOpen: ref(false),
      atMenuOpen: ref(false),
      chatInputText: ref(''),
      mentionSelectedChars: ref([]),
      mentionExcludedChars: ref([]),
      filteredAtCharacters: ref([]),
      settingStore: { toggleDarkMode: vi.fn() }
    }

    const bridge = buildChatBridge(ctx)

    const rowIds = bridge.chatViewModel.value.chatSessionRows.map((row) => row.sessionId)
    expect(rowIds).toContain('session_normal')
    expect(rowIds).not.toContain('session_xingyi')
  })

  it('本地消息未加载时回落到快照自带的最后消息预览与条数', () => {
    const ctx = {
      sidebarOpen: ref(false),
      collapsedGroups: {},
      ungroupedCharacters: ref([]),
      charStore: {
        characters: [
          { id: 'char_a', name: '陈星依' }
        ],
        characterGroups: [],
        groups: [],
        crowds: [],
        userProfile: {}
      },
      chatStore: {
        entities: {
          chatSessions: ref({
            session_lazy: {
              id: 'session_lazy',
              targetId: 'char_a',
              title: '懒加载会话',
              isArchived: false,
              updatedAt: '2026-07-04T01:00:00.000Z',
              lastMessagePreview: '**今晚**见呀',
              lastMessageAt: '2026-07-04T00:59:00.000Z',
              messageCount: 12
            }
          }),
          chatMessages: ref({})
        },
        runtime: {
          isTyping: ref(false)
        },
        getActiveSessionId: vi.fn(() => 'session_lazy'),
        getCurrentSession: vi.fn(() => null)
      },
      chatPanelViewModel: ref({
        activeChatSessionId: 'session_lazy',
        activeChatTargetId: 'char_a',
        displayMessages: []
      }),
      settingsPanelViewModel: ref({ aiEvaluationEnabled: false, isDarkMode: false }),
      getCharactersByGroup: vi.fn(),
      toggleGroupCollapse: vi.fn(),
      openChatSessionCreator: vi.fn(),
      toast: vi.fn(),
      currentChatTitle: ref(''),
      loadedSummaryCount: ref(0),
      loadedSummaryItems: ref([]),
      isBootLoading: ref(false),
      currentCharacter: ref(null),
      currentScene: ref(null),
      currentAlias: ref(null),
      editingMessageIndex: ref(-1),
      editingMessageContent: ref(''),
      regeneratingMessageIndex: ref(-1),
      currentCharacterAvatar: ref(''),
      streamingText: ref(''),
      currentStreamingSpeakerName: ref(''),
      currentStreamingTargetId: ref(''),
      plannedGroupSpeakers: ref([]),
      plusMenuOpen: ref(false),
      atMenuOpen: ref(false),
      chatInputText: ref(''),
      mentionSelectedChars: ref([]),
      mentionExcludedChars: ref([]),
      filteredAtCharacters: ref([]),
      settingStore: { toggleDarkMode: vi.fn() }
    }

    const bridge = buildChatBridge(ctx)

    const row = bridge.chatViewModel.value.chatSessionRows[0]
    expect(row?.preview).toBe('今晚见呀')
    expect(row?.messageCount).toBe(12)
  })

  it('手动旁白写入后触发自动写入事实采集', async () => {
    vi.clearAllMocks()
    const ctx = {
      sidebarOpen: ref(false),
      collapsedGroups: {},
      ungroupedCharacters: ref([]),
      charStore: {
        characters: [
          { id: 'char_a', name: '陈星依' }
        ],
        characterGroups: [],
        groups: [],
        crowds: [],
        documents: [],
        userProfile: {},
        updateCharacter: vi.fn()
      },
      chatStore: {
        entities: {
          chatSessions: ref({}),
          chatMessages: ref({})
        },
        runtime: {
          isTyping: ref(false)
        },
        getActiveSessionId: vi.fn(() => 'session_a'),
        getActiveTargetId: vi.fn(() => 'char_a'),
        getCurrentSession: vi.fn(() => ({ id: 'session_a', targetId: 'char_a' })),
        getCurrentMessages: vi.fn(() => [
          { id: 1, role: 'user', content: '太安静了。' }
        ]),
        setTyping: vi.fn((value) => { ctx.chatStore.runtime.isTyping.value = value }),
        switchSession: vi.fn()
      },
      chatPanelViewModel: ref({
        activeChatSessionId: 'session_a',
        activeChatTargetId: 'char_a',
        displayMessages: []
      }),
      settingsPanelViewModel: ref({ aiEvaluationEnabled: false, isDarkMode: false }),
      getCharactersByGroup: vi.fn(),
      toggleGroupCollapse: vi.fn(),
      openChatSessionCreator: vi.fn(),
      toast: vi.fn(),
      currentChatTitle: ref(''),
      loadedSummaryCount: ref(0),
      loadedSummaryItems: ref([]),
      isBootLoading: ref(false),
      currentCharacter: ref(null),
      currentScene: ref(null),
      currentAlias: ref(null),
      editingMessageIndex: ref(-1),
      editingMessageContent: ref(''),
      regeneratingMessageIndex: ref(-1),
      currentCharacterAvatar: ref(''),
      streamingText: ref(''),
      currentStreamingSpeakerName: ref(''),
      currentStreamingTargetId: ref(''),
      plannedGroupSpeakers: ref([]),
      plusMenuOpen: ref(false),
      atMenuOpen: ref(false),
      chatInputText: ref(''),
      mentionSelectedChars: ref([]),
      mentionExcludedChars: ref([]),
      filteredAtCharacters: ref([]),
      settingStore: {
        toggleDarkMode: vi.fn(),
        agentModelConfigs: [{ id: 'brain_agent', presetName: '强模型' }]
      },
      callAI: vi.fn(),
      getTargetName: vi.fn((id) => id),
      scrollToBottom: vi.fn(),
      runtimeStore: { replaceAutoWriteFailureTags: vi.fn() },
      workspaceRuntimeStore: createChatTaskRunMocks()
    }

    const bridge = buildChatBridge(ctx)
    await bridge.chatActions.triggerManualNarration()

    expect(runManualNarrationCommand).toHaveBeenCalledWith(expect.objectContaining({
      session: { id: 'session_a', targetId: 'char_a' },
      messages: [{ id: 1, role: 'user', content: '太安静了。' }],
      agentConfig: { id: 'brain_agent', presetName: '强模型' },
      abortSignal: expect.any(AbortSignal)
    }))
    expect(ctx.workspaceRuntimeStore.startChatTaskRun).toHaveBeenCalledWith(expect.objectContaining({
      taskKind: 'narrationGenerate',
      label: '事件旁白生成',
      targetId: 'char_a',
      sessionId: 'session_a',
      foreground: true,
      abortController: expect.any(AbortController)
    }))
    expect(ctx.workspaceRuntimeStore.startAgentTaskNotice).not.toHaveBeenCalled()
    expect(ctx.workspaceRuntimeStore.updateAgentTaskNotice).not.toHaveBeenCalled()
    expect(ctx.workspaceRuntimeStore.completeAgentTaskNotice).not.toHaveBeenCalled()
    expect(ctx.workspaceRuntimeStore.failAgentTaskNotice).not.toHaveBeenCalled()
    expect(ctx.workspaceRuntimeStore.completeChatTaskRun).toHaveBeenCalledWith('task_1')
    expect(ctx.workspaceRuntimeStore.failChatTaskRun).not.toHaveBeenCalled()
    expect(ctx.chatStore.setTyping).not.toHaveBeenCalled()
    expect(ctx.chatStore.switchSession).toHaveBeenCalledWith('session_a')
    await flushAsyncTurns(3)
    expect(runChatMessageProjectionBySessionId).toHaveBeenCalledWith('session_a', 88, { promptLogMode: 'background' })
    expect(runChatProjectionWritebackBySessionId).toHaveBeenCalledWith('session_a', {
      characterId: 'char_a',
      runKind: 'auto'
    })
  })

  it('旧 caps_network 会话手动旁白写入后按普通链路触发自动写入', async () => {
    vi.clearAllMocks()
    const ctx = {
      sidebarOpen: ref(false),
      collapsedGroups: {},
      ungroupedCharacters: ref([]),
      charStore: {
        characters: [{ id: 'char_a', name: '陈星依' }],
        characterGroups: [],
        groups: [],
        crowds: [],
        documents: [],
        userProfile: {},
        updateCharacter: vi.fn()
      },
      chatStore: {
        entities: { chatSessions: ref({}), chatMessages: ref({}) },
        runtime: { isTyping: ref(false) },
        getActiveSessionId: vi.fn(() => 'session_a'),
        getActiveTargetId: vi.fn(() => 'char_a'),
        getCurrentSession: vi.fn(() => ({ id: 'session_a', targetId: 'char_a', replyPipelineMode: 'caps_network' })),
        getCurrentMessages: vi.fn(() => [{ id: 1, role: 'user', content: '太安静了。' }]),
        setTyping: vi.fn((value) => { ctx.chatStore.runtime.isTyping.value = value }),
        switchSession: vi.fn()
      },
      chatPanelViewModel: ref({
        activeChatSessionId: 'session_a',
        activeChatTargetId: 'char_a',
        displayMessages: []
      }),
      settingsPanelViewModel: ref({ aiEvaluationEnabled: false, isDarkMode: false }),
      getCharactersByGroup: vi.fn(),
      toggleGroupCollapse: vi.fn(),
      openChatSessionCreator: vi.fn(),
      toast: vi.fn(),
      currentChatTitle: ref(''),
      loadedSummaryCount: ref(0),
      loadedSummaryItems: ref([]),
      isBootLoading: ref(false),
      currentCharacter: ref(null),
      currentScene: ref(null),
      currentAlias: ref(null),
      editingMessageIndex: ref(-1),
      editingMessageContent: ref(''),
      regeneratingMessageIndex: ref(-1),
      currentCharacterAvatar: ref(''),
      streamingText: ref(''),
      currentStreamingSpeakerName: ref(''),
      currentStreamingTargetId: ref(''),
      plannedGroupSpeakers: ref([]),
      plusMenuOpen: ref(false),
      atMenuOpen: ref(false),
      chatInputText: ref(''),
      mentionSelectedChars: ref([]),
      mentionExcludedChars: ref([]),
      filteredAtCharacters: ref([]),
      settingStore: {
        toggleDarkMode: vi.fn(),
        agentModelConfigs: [{ id: 'brain_agent', presetName: '强模型' }]
      },
      callAI: vi.fn(),
      getTargetName: vi.fn((id) => id),
      scrollToBottom: vi.fn(),
      runtimeStore: { replaceAutoWriteFailureTags: vi.fn() },
      workspaceRuntimeStore: createChatTaskRunMocks()
    }

    const bridge = buildChatBridge(ctx)
    await bridge.chatActions.triggerManualNarration()

    expect(ctx.chatStore.switchSession).toHaveBeenCalledWith('session_a')
    await flushAsyncTurns(3)
    expect(runChatMessageProjectionBySessionId).toHaveBeenCalledWith('session_a', 88, { promptLogMode: 'background' })
    expect(runChatProjectionWritebackBySessionId).toHaveBeenCalledWith('session_a', {
      characterId: 'char_a',
      runKind: 'auto'
    })
  })

  it('指定事件候选推进已退役且不启动旁白任务', async () => {
    vi.clearAllMocks()
    const ctx = {
      sidebarOpen: ref(false),
      collapsedGroups: {},
      ungroupedCharacters: ref([]),
      charStore: {
        characters: [{ id: 'char_a', name: '陈星依' }],
        characterGroups: [],
        groups: [],
        crowds: [],
        documents: [],
        userProfile: {},
        updateCharacter: vi.fn()
      },
      chatStore: {
        entities: {
          chatSessions: ref({}),
          chatMessages: ref({})
        },
        runtime: {
          isTyping: ref(false)
        },
        getActiveSessionId: vi.fn(() => 'session_a'),
        getActiveTargetId: vi.fn(() => 'char_a'),
        getCurrentSession: vi.fn(() => ({ id: 'session_a', targetId: 'char_a' })),
        getCurrentMessages: vi.fn(() => [
          { id: 1, role: 'user', content: '太安静了。' }
        ]),
        setTyping: vi.fn((value) => { ctx.chatStore.runtime.isTyping.value = value }),
        switchSession: vi.fn()
      },
      chatPanelViewModel: ref({
        activeChatSessionId: 'session_a',
        activeChatTargetId: 'char_a',
        displayMessages: []
      }),
      settingsPanelViewModel: ref({ aiEvaluationEnabled: false, isDarkMode: false }),
      getCharactersByGroup: vi.fn(),
      toggleGroupCollapse: vi.fn(),
      openChatSessionCreator: vi.fn(),
      toast: vi.fn(),
      currentChatTitle: ref(''),
      loadedSummaryCount: ref(0),
      loadedSummaryItems: ref([]),
      isBootLoading: ref(false),
      currentCharacter: ref(null),
      currentScene: ref(null),
      currentAlias: ref(null),
      editingMessageIndex: ref(-1),
      editingMessageContent: ref(''),
      regeneratingMessageIndex: ref(-1),
      currentCharacterAvatar: ref(''),
      streamingText: ref(''),
      currentStreamingSpeakerName: ref(''),
      currentStreamingTargetId: ref(''),
      plannedGroupSpeakers: ref([]),
      plusMenuOpen: ref(false),
      atMenuOpen: ref(false),
      chatInputText: ref(''),
      mentionSelectedChars: ref([]),
      mentionExcludedChars: ref([]),
      filteredAtCharacters: ref([]),
      settingStore: {
        toggleDarkMode: vi.fn(),
        agentModelConfigs: [{ id: 'brain_agent', presetName: '强模型' }]
      },
      callAI: vi.fn(),
      getTargetName: vi.fn((id) => id),
      scrollToBottom: vi.fn(),
      runtimeStore: { replaceAutoWriteFailureTags: vi.fn() },
      workspaceRuntimeStore: createChatTaskRunMocks()
    }

    const bridge = buildChatBridge(ctx)
    await bridge.chatActions.triggerManualNarration({
      kind: 'event_push',
      candidateBatchId: 'candidate_batch_1',
      candidateId: 'candidate_a'
    })

    expect(runManualNarrationCommand).not.toHaveBeenCalled()
    expect(ctx.toast).toHaveBeenCalledWith(expect.stringContaining('事件候选推进链路已退役'), 'info')
    expect(ctx.workspaceRuntimeStore.startChatTaskRun).not.toHaveBeenCalled()
    expect(ctx.workspaceRuntimeStore.startAgentTaskNotice).not.toHaveBeenCalled()
    expect(ctx.workspaceRuntimeStore.updateAgentTaskNotice).not.toHaveBeenCalled()
    expect(ctx.workspaceRuntimeStore.completeAgentTaskNotice).not.toHaveBeenCalled()
    expect(ctx.workspaceRuntimeStore.completeChatTaskRun).not.toHaveBeenCalled()
    expect(ctx.workspaceRuntimeStore.failAgentTaskNotice).not.toHaveBeenCalled()
    expect(ctx.chatStore.setTyping).not.toHaveBeenCalled()
  })

  it('手动旁白停止后不刷新会话也不提示成功', async () => {
    vi.clearAllMocks()
    const ctx = {
      sidebarOpen: ref(false),
      collapsedGroups: {},
      ungroupedCharacters: ref([]),
      charStore: {
        characters: [{ id: 'char_a', name: '陈星依' }],
        characterGroups: [],
        groups: [],
        crowds: [],
        documents: [],
        userProfile: {},
        updateCharacter: vi.fn()
      },
      chatStore: {
        entities: {
          chatSessions: ref({}),
          chatMessages: ref({})
        },
        runtime: {
          isTyping: ref(true)
        },
        getActiveSessionId: vi.fn(() => 'session_a'),
        getActiveTargetId: vi.fn(() => 'char_a'),
        getCurrentSession: vi.fn(() => ({ id: 'session_a', targetId: 'char_a' })),
        getCurrentMessages: vi.fn(() => [
          { id: 1, role: 'user', content: '推进一下。' }
        ]),
        setTyping: vi.fn((value) => { ctx.chatStore.runtime.isTyping.value = value }),
        switchSession: vi.fn()
      },
      chatPanelViewModel: ref({
        activeChatSessionId: 'session_a',
        activeChatTargetId: 'char_a',
        displayMessages: []
      }),
      settingsPanelViewModel: ref({ aiEvaluationEnabled: false, isDarkMode: false }),
      getCharactersByGroup: vi.fn(),
      toggleGroupCollapse: vi.fn(),
      openChatSessionCreator: vi.fn(),
      toast: vi.fn(),
      currentChatTitle: ref(''),
      loadedSummaryCount: ref(0),
      loadedSummaryItems: ref([]),
      isBootLoading: ref(false),
      currentCharacter: ref(null),
      currentScene: ref(null),
      currentAlias: ref(null),
      editingMessageIndex: ref(-1),
      editingMessageContent: ref(''),
      regeneratingMessageIndex: ref(-1),
      currentCharacterAvatar: ref(''),
      streamingText: ref(''),
      currentStreamingSpeakerName: ref(''),
      currentStreamingTargetId: ref(''),
      plannedGroupSpeakers: ref([]),
      plusMenuOpen: ref(false),
      atMenuOpen: ref(false),
      chatInputText: ref(''),
      mentionSelectedChars: ref([]),
      mentionExcludedChars: ref([]),
      filteredAtCharacters: ref([]),
      settingStore: {
        toggleDarkMode: vi.fn(),
        agentModelConfigs: [{ id: 'brain_agent', presetName: '强模型' }]
      },
      callAI: vi.fn(),
      getTargetName: vi.fn((id) => id),
      scrollToBottom: vi.fn(),
      runtimeStore: { replaceAutoWriteFailureTags: vi.fn() },
      workspaceRuntimeStore: createChatTaskRunMocks()
    }
    runManualNarrationCommand.mockImplementationOnce(async () => {
      ctx.workspaceRuntimeStore.stopChatTaskRun('task_1')
      return {
        ok: true,
        content: '门外传来一阵很轻的敲门声。',
        messageId: 88
      }
    })

    const bridge = buildChatBridge(ctx)
    await bridge.chatActions.triggerManualNarration({ kind: 'event_push' })

    expect(runManualNarrationCommand).toHaveBeenCalledWith(expect.objectContaining({
      abortSignal: expect.any(AbortSignal)
    }))
    expect(ctx.workspaceRuntimeStore.startChatTaskRun).toHaveBeenCalledWith(expect.objectContaining({
      taskKind: 'narrationGenerate',
      label: '事件旁白生成'
    }))
    expect(ctx.workspaceRuntimeStore.stopChatTaskRun).toHaveBeenCalledWith('task_1')
    expect(ctx.chatStore.switchSession).not.toHaveBeenCalled()
    expect(ctx.toast).not.toHaveBeenCalledWith(expect.any(String), 'success')
    expect(ctx.workspaceRuntimeStore.completeChatTaskRun).not.toHaveBeenCalled()
    expect(ctx.workspaceRuntimeStore.failChatTaskRun).not.toHaveBeenCalled()
    expect(ctx.workspaceRuntimeStore.failAgentTaskNotice).not.toHaveBeenCalled()
    expect(ctx.chatStore.setTyping).not.toHaveBeenCalled()
  })

  it('手动总结只有真实投影写轨迹结果后才提示成功', async () => {
    vi.clearAllMocks()
    vi.mocked(runChatProjectionWritebackBySessionId).mockResolvedValue({
      status: 'complete',
      hiddenProjectionCount: 20,
      successEventIds: ['event_1'],
      failedEvents: []
    })
    const openConfirmDialog = vi.fn((_title, _message, onConfirm) => onConfirm())
    const ctx = {
      sidebarOpen: ref(false),
      collapsedGroups: {},
      ungroupedCharacters: ref([]),
      charStore: {
        characters: [{ id: 'char_a', name: '陈星依' }],
        characterGroups: [],
        groups: [],
        crowds: [],
        userProfile: {},
        updateCharacter: vi.fn()
      },
      chatStore: {
        entities: { chatSessions: ref({}), chatMessages: ref({}) },
        runtime: { isTyping: ref(false) },
        getActiveSessionId: vi.fn(() => 'session_a'),
        getActiveTargetId: vi.fn(() => 'char_a'),
        getCurrentSession: vi.fn(() => ({ id: 'session_a', targetId: 'char_a' })),
        getCurrentMessages: vi.fn(() => [{ id: 1, role: 'user', content: '整理一下。' }]),
        queuePendingPersistedMessage: vi.fn()
      },
      chatPanelViewModel: ref({ activeChatSessionId: 'session_a', activeChatTargetId: 'char_a', displayMessages: [] }),
      settingsPanelViewModel: ref({ aiEvaluationEnabled: false, isDarkMode: false }),
      getCharactersByGroup: vi.fn(),
      toggleGroupCollapse: vi.fn(),
      openChatSessionCreator: vi.fn(),
      toast: vi.fn(),
      currentChatTitle: ref(''),
      loadedSummaryCount: ref(0),
      loadedSummaryItems: ref([]),
      isBootLoading: ref(false),
      currentCharacter: ref(null),
      currentScene: ref(null),
      currentAlias: ref(null),
      editingMessageIndex: ref(-1),
      editingMessageContent: ref(''),
      regeneratingMessageIndex: ref(-1),
      currentCharacterAvatar: ref(''),
      streamingText: ref(''),
      currentStreamingSpeakerName: ref(''),
      currentStreamingTargetId: ref(''),
      plannedGroupSpeakers: ref([]),
      plusMenuOpen: ref(false),
      atMenuOpen: ref(false),
      chatInputText: ref(''),
      mentionSelectedChars: ref([]),
      mentionExcludedChars: ref([]),
      filteredAtCharacters: ref([]),
      chatSummaryWriting: ref(false),
      chatSummaryWritingText: ref(''),
      settingStore: { toggleDarkMode: vi.fn(), agentModelConfigs: [{ id: 'brain_agent', presetName: '强模型' }] },
      callAI: vi.fn(async (_messages, options) => {
        options?.onUsageInfo?.({ promptTokens: 10, completionTokens: 5, totalTokens: 15 })
        return 'ok'
      }),
      openConfirmDialog,
      getTargetName: vi.fn((id) => id),
      scrollToBottom: vi.fn(),
      workspaceRuntimeStore: createChatTaskRunMocks()
    }

    const bridge = buildChatBridge(ctx)
    bridge.chatActions.openChatSummary()
    await flushAsyncTurns(12)

    expect(openConfirmDialog).toHaveBeenCalledWith(
      '总结对话',
      expect.stringContaining('写入对应角色轨迹'),
      expect.any(Function),
      expect.objectContaining({ confirmText: '开始写入', size: 'md' })
    )
    expect(runChatProjectionWritebackBySessionId).toHaveBeenCalledWith('session_a', {
      characterId: 'char_a',
      runKind: 'manual'
    })
    expect(ctx.chatStore.queuePendingPersistedMessage).not.toHaveBeenCalled()
    expect(ctx.workspaceRuntimeStore.completeAgentTaskNotice).toHaveBeenCalledWith(expect.objectContaining({
      message: '总结对话完成',
      detail: expect.stringContaining('写入 1 个事件')
    }))
  })

  it('手动总结遇到投影写轨迹失败时提示失败诊断', async () => {
    vi.clearAllMocks()
    vi.mocked(runChatProjectionWritebackBySessionId).mockResolvedValue({
      status: 'failed',
      hiddenProjectionCount: 0,
      successEventIds: [],
      failedEvents: [{ reason: '事件拆分输出没有可写入事件' }]
    })
    const openConfirmDialog = vi.fn((_title, _message, onConfirm) => onConfirm())
    const ctx = {
      sidebarOpen: ref(false),
      collapsedGroups: {},
      ungroupedCharacters: ref([]),
      charStore: {
        characters: [{ id: 'char_a', name: '陈星依' }],
        characterGroups: [],
        groups: [],
        crowds: [],
        userProfile: {},
        updateCharacter: vi.fn()
      },
      chatStore: {
        entities: { chatSessions: ref({}), chatMessages: ref({}) },
        runtime: { isTyping: ref(false) },
        getActiveSessionId: vi.fn(() => 'session_a'),
        getActiveTargetId: vi.fn(() => 'char_a'),
        getCurrentSession: vi.fn(() => ({ id: 'session_a', targetId: 'char_a' })),
        getCurrentMessages: vi.fn(() => [{ id: 1, role: 'user', content: '整理一下。' }]),
        queuePendingPersistedMessage: vi.fn()
      },
      chatPanelViewModel: ref({ activeChatSessionId: 'session_a', activeChatTargetId: 'char_a', displayMessages: [] }),
      settingsPanelViewModel: ref({ aiEvaluationEnabled: false, isDarkMode: false }),
      getCharactersByGroup: vi.fn(),
      toggleGroupCollapse: vi.fn(),
      openChatSessionCreator: vi.fn(),
      toast: vi.fn(),
      currentChatTitle: ref(''),
      loadedSummaryCount: ref(0),
      loadedSummaryItems: ref([]),
      isBootLoading: ref(false),
      currentCharacter: ref(null),
      currentScene: ref(null),
      currentAlias: ref(null),
      editingMessageIndex: ref(-1),
      editingMessageContent: ref(''),
      regeneratingMessageIndex: ref(-1),
      currentCharacterAvatar: ref(''),
      streamingText: ref(''),
      currentStreamingSpeakerName: ref(''),
      currentStreamingTargetId: ref(''),
      plannedGroupSpeakers: ref([]),
      plusMenuOpen: ref(false),
      atMenuOpen: ref(false),
      chatInputText: ref(''),
      mentionSelectedChars: ref([]),
      mentionExcludedChars: ref([]),
      filteredAtCharacters: ref([]),
      chatSummaryWriting: ref(false),
      chatSummaryWritingText: ref(''),
      settingStore: { toggleDarkMode: vi.fn(), agentModelConfigs: [{ id: 'brain_agent', presetName: '强模型' }] },
      callAI: vi.fn(),
      openConfirmDialog,
      getTargetName: vi.fn((id) => id),
      runtimeStore: { replaceAutoWriteFailureTags: vi.fn() },
      workspaceRuntimeStore: createChatTaskRunMocks()
    }

    const bridge = buildChatBridge(ctx)
    bridge.chatActions.openChatSummary()
    await flushAsyncTurns(12)

    expect(ctx.chatStore.queuePendingPersistedMessage).not.toHaveBeenCalled()
    expect(ctx.workspaceRuntimeStore.failAgentTaskNotice).toHaveBeenCalledWith(expect.objectContaining({
      message: '总结对话写轨迹部分失败'
    }))
    expect(ctx.toast).not.toHaveBeenCalled()
  })

})
