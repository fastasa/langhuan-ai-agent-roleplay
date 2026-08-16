import { describe, expect, it, vi } from 'vitest'
import {
  buildAppShellPanelsContext,
  buildAppShellCommandFlowContext,
  buildAppShellControllerFlowHubContext,
  buildAppShellControllerViewBridgeContext,
  buildAppShellViewBridgeContext,
  buildModalStateBundlesContext
} from '../../../src/composables/app/useAppShellAssemblers.ts'
import { buildWorkspaceShellViewBridgeArgs } from '../../../src/composables/app/useWorkspaceShellControllerAssemblers.ts'
import { buildWorkspaceShellControllerViewBridgeScalars } from '../../../src/composables/app/useWorkspaceShellControllerViewBridgeScalars.ts'
import { buildWorkspaceShellControllerFlowRuntimeBindings } from '../../../src/composables/app/useWorkspaceShellControllerFlowRuntimeBindings.ts'

describe('useAppShellAssemblers', () => {
  it('面板上下文会保留帷幕地点三段临时草稿', () => {
    const tempLocationLarge = { value: '维斯珂' }
    const tempLocationMiddle = { value: '博瑞利尔' }
    const tempLocationSmall = { value: '柜台' }
    const ctx = buildAppShellPanelsContext({
      tempLocationLarge,
      tempLocationMiddle,
      tempLocationSmall
    })

    expect(ctx.tempLocationLarge).toBe(tempLocationLarge)
    expect(ctx.tempLocationMiddle).toBe(tempLocationMiddle)
    expect(ctx.tempLocationSmall).toBe(tempLocationSmall)
  })

  it('面板上下文会保留全局运行状态，供后台任务提示灯使用', () => {
    const workspaceRuntimeStore = {
      startAgentTaskNotice: vi.fn()
    }
    const ctx = buildAppShellPanelsContext({
      workspaceRuntimeStore
    })

    expect(ctx.workspaceRuntimeStore).toBe(workspaceRuntimeStore)
  })

  it('面板上下文会转发 applyDirectorPrecisionEdits（批次 O-A：纠偏栏接线根因，与 regenerateMsg 同源）', () => {
    const regenerateMsg = vi.fn()
    const applyDirectorPrecisionEdits = vi.fn()
    const ctx = buildAppShellPanelsContext({ regenerateMsg, applyDirectorPrecisionEdits })
    // 漏挂会导致单聊纠偏栏 v-if 的 actions.applyDirectorPrecisionEdits 永远 undefined、浮条不渲染。
    expect(ctx.regenerateMsg).toBe(regenerateMsg)
    expect(ctx.applyDirectorPrecisionEdits).toBe(applyDirectorPrecisionEdits)
  })

  it('会把角色动作分组保留到 flow hub 上下文里', () => {
    const saveCrowd = vi.fn()
    const saveTicket = vi.fn()
    const addTransaction = vi.fn()
    const ctx = buildAppShellControllerFlowHubContext({
      appState: {},
      timerComposable: {},
      resourceStore: {},
      settingStore: {},
      charStore: {},
      chatStore: {},
      taskStore: {},
      cloudSync: {},
      workspaceKernel: {},
      workspaceBootSession: {},
      workspaceRuntimeStore: {},
      toast: vi.fn(),
      stopTaskTimerUpdate: vi.fn(),
      loadCloudSaves: vi.fn(),
      loadApiPreset: vi.fn(),
      loadCustomTags: vi.fn(),
      loadEventStack: vi.fn(),
      currentTargetId: {},
      editorCharacter: {},
      characterManagement: {
        saveCrowd,
        saveTicket,
        addTransaction
      },
      uiHelpers: {},
      environmentOps: {},
      appSmallHelpers: {},
      chatTargetHelpers: {},
      derivedState: {},
      runtimeState: {},
      taskState: {},
      aiRuntime: {}
    })

    expect(ctx.characterOps.saveCrowd).toBe(saveCrowd)
    expect(ctx.ticketOps.saveTicket).toBe(saveTicket)
    expect(ctx.transactionActions.addTransaction).toBe(addTransaction)
  })

  it('模态状态上下文会优先读取角色动作分组', () => {
    const saveCrowd = vi.fn()
    const saveCharacterEdit = vi.fn()
    const saveTicket = vi.fn()
    const editCustomTag = vi.fn()
    const addTransaction = vi.fn()
    const ctx = buildModalStateBundlesContext({
      appState: {},
      timerComposable: {},
      resourceStore: {},
      settingStore: {},
      charStore: {},
      ticketOps: {
        saveTicket
      },
      tagOps: {
        editCustomTag
      },
      uiHelpers: {},
      characterOps: {
        saveCrowd,
        saveCharacterEdit
      },
      saveTicket: vi.fn(),
      editCustomTag: vi.fn(),
      transactionActions: {
        addTransaction
      }
    })

    expect(ctx.characterOps.saveCrowd).toBe(saveCrowd)
    expect(ctx.characterOps.saveCharacterEdit).toBe(saveCharacterEdit)
    expect(ctx.ticketOps.saveTicket).toBe(saveTicket)
    expect(ctx.tagOps.editCustomTag).toBe(editCustomTag)
    expect(ctx.transactionActions.addTransaction).toBe(addTransaction)
  })

  it('视图桥上下文只暴露 transaction 事务动作', () => {
    const commandAddTransaction = vi.fn()
    const commandClearTransactions = vi.fn()
    const commandConfirmTransactions = vi.fn()
    const commandConfirmTransactionAt = vi.fn()
    const commandRemoveTransactionAt = vi.fn()

    const ctx = buildAppShellViewBridgeContext({
      commandAddTransaction,
      commandClearTransactions,
      commandConfirmTransactions,
      commandConfirmTransactionAt,
      commandRemoveTransactionAt
    })

    expect(ctx.commandAddTransaction).toBe(commandAddTransaction)
    expect(ctx.commandClearTransactions).toBe(commandClearTransactions)
    expect(ctx.commandConfirmTransactions).toBe(commandConfirmTransactions)
    expect(ctx.commandConfirmTransactionAt).toBe(commandConfirmTransactionAt)
    expect(ctx.commandRemoveTransactionAt).toBe(commandRemoveTransactionAt)
  })

  it('命令流上下文会保留全局确认弹窗入口给聊天消息删除使用', () => {
    const openConfirmDialog = vi.fn()
    const prepareAIRecall = vi.fn()

    const ctx = buildAppShellCommandFlowContext({
      openConfirmDialog,
      prepareAIRecall,
      appState: {},
      timerComposable: {},
      charStore: {},
      chatStore: {},
      taskStore: {},
      cloudSync: {},
      workspaceKernel: {},
      workspaceBootSession: {},
      workspaceRuntimeStore: {},
      settingStore: {},
      toast: vi.fn(),
      stopTaskTimerUpdate: vi.fn(),
      loadCloudSaves: vi.fn(),
      loadApiPreset: vi.fn(),
      loadCustomTags: vi.fn(),
      loadEventStack: vi.fn()
    })

    expect(ctx.openConfirmDialog).toBe(openConfirmDialog)
    expect(ctx.prepareAIRecall).toBe(prepareAIRecall)
  })

  it('运行时绑定会把 AI 召回入口透传到聊天命令流', () => {
    const prepareAIRecall = vi.fn()
    const ctx = buildWorkspaceShellControllerFlowRuntimeBindings({
      boot: {
        appState: {},
        chatUiState: {},
        shellSupport: {},
        callAI: vi.fn(),
        callAIStream: vi.fn(),
        cleanAiPrefix: vi.fn(),
        detectLocationChange: vi.fn(),
        buildSystemPrompt: vi.fn(),
        buildPromptMessages: vi.fn(),
        prepareAIRecall
      },
      opsHub: {
        addResourceEventToStack: vi.fn(),
        getWeatherEmoji: vi.fn()
      }
    })

    expect(ctx.prepareAIRecall).toBe(prepareAIRecall)
  })

  it('视图桥参数会保留 callAI 给事件线管理使用', () => {
    const callAI = vi.fn()
    const callAIStream = vi.fn()
    const ctx = buildWorkspaceShellViewBridgeArgs({
      callAI,
      callAIStream
    })

    expect(ctx.callAI).toBe(callAI)
    expect(ctx.callAIStream).toBe(callAIStream)
  })

  it('视图桥参数会保留全局运行状态给提示灯使用', () => {
    const workspaceRuntimeStore = { startAgentTaskNotice: vi.fn() }
    const ctx = buildWorkspaceShellViewBridgeArgs({
      workspaceRuntimeStore
    })

    expect(ctx.workspaceRuntimeStore).toBe(workspaceRuntimeStore)
  })

  it('控制器视图桥标量会保留全局运行状态给提示灯使用', () => {
    const workspaceRuntimeStore = { startAgentTaskNotice: vi.fn() }
    const ctx = buildWorkspaceShellControllerViewBridgeScalars({
      boot: {
        shellSupport: {},
        workspaceRuntime: {
          workspaceKernel: {},
          workspaceCommandRegistry: {},
          workspaceRuntimeStore,
          isBootLoading: false,
          cloudActionState: {}
        },
        appState: {},
        resourceStore: {},
        charStore: {},
        chatStore: {},
        settingStore: {},
        taskStore: {},
        timerComposable: {},
        cloudSync: {}
      },
      domains: {
        apiPresetManager: {},
        characterManagement: {}
      },
      opsHub: {}
    })

    expect(ctx.workspaceRuntimeStore).toBe(workspaceRuntimeStore)
  })

  it('控制器视图桥上下文会保留 callAI 给事件线管理使用', () => {
    const callAI = vi.fn()
    const callAIStream = vi.fn()
    const ctx = buildAppShellControllerViewBridgeContext({
      callAI,
      callAIStream
    })

    expect(ctx.callAI).toBe(callAI)
    expect(ctx.callAIStream).toBe(callAIStream)
  })

  it('控制器视图桥上下文会保留全局运行状态给提示灯使用', () => {
    const workspaceRuntimeStore = { startAgentTaskNotice: vi.fn() }
    const ctx = buildAppShellControllerViewBridgeContext({
      workspaceRuntimeStore
    })

    expect(ctx.workspaceRuntimeStore).toBe(workspaceRuntimeStore)
  })

  it('完整视图桥组装链不会丢失全局运行状态', () => {
    const workspaceRuntimeStore = { startAgentTaskNotice: vi.fn() }
    const scalars = buildWorkspaceShellControllerViewBridgeScalars({
      boot: {
        shellSupport: {},
        workspaceRuntime: {
          workspaceKernel: {},
          workspaceCommandRegistry: {},
          workspaceRuntimeStore,
          isBootLoading: false,
          cloudActionState: {}
        },
        appState: {},
        resourceStore: {},
        charStore: {},
        chatStore: {},
        settingStore: {},
        taskStore: {},
        timerComposable: {},
        cloudSync: {}
      },
      domains: {
        apiPresetManager: {},
        characterManagement: {}
      },
      opsHub: {}
    })
    const bridgeArgs = buildWorkspaceShellViewBridgeArgs(scalars)
    const ctx = buildAppShellControllerViewBridgeContext(bridgeArgs)

    expect(ctx.workspaceRuntimeStore).toBe(workspaceRuntimeStore)
  })
})
