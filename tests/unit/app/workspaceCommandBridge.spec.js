import { describe, expect, it, vi } from 'vitest'
import { useWorkspaceCommandBridge } from '../../../src/composables/app/useWorkspaceCommandBridge.ts'

describe('useWorkspaceCommandBridge transaction commands', () => {
  it('registers and executes transaction commands through one naming set', async () => {
    const handlers = new Map()
    const workspaceCommandRegistry = {
      registerCommand: vi.fn((type, command) => {
        handlers.set(type, command)
      }),
      executeCommand: vi.fn(async (type, payload) => {
        const command = handlers.get(type)
        return await command.handle(payload)
      })
    }
    const addTransaction = vi.fn(async () => true)
    const clearTransactions = vi.fn(async () => true)
    const confirmTransactions = vi.fn(async () => true)
    const confirmTransactionAt = vi.fn(async () => true)
    const removeTransactionAt = vi.fn(async () => true)

    const bridge = useWorkspaceCommandBridge({
      workspaceCommandRegistry,
      switchChat: vi.fn(async () => true),
      sendChat: vi.fn(),
      addTransaction,
      clearTransactions,
      confirmTransactions,
      confirmTransactionAt,
      removeTransactionAt,
      dispatchAITask: vi.fn(),
      addCustomTask: vi.fn(),
      startTaskTimer: vi.fn(),
      pauseTaskTimer: vi.fn(),
      resetTaskTimer: vi.fn(),
      addTaskMark: vi.fn(),
      completeTaskWithPause: vi.fn(),
      queueTaskFailure: vi.fn(),
      deleteTask: vi.fn(),
      cloudUpload: vi.fn(),
      cloudDownload: vi.fn(),
      createCloudSave: vi.fn(),
      updateCloudSaveNote: vi.fn(),
      renameCloudSave: vi.fn(),
      deleteCloudSave: vi.fn(),
      importAllData: vi.fn(),
      resetAllData: vi.fn(),
      saveApiPreset: vi.fn(),
      saveWeatherApiConfig: vi.fn()
    })

    await bridge.commandAddTransaction('完成任务', '完成任务: 复盘', { taskId: 'task_1' })
    await bridge.commandClearTransactions()
    await bridge.commandSwitchChat({ targetId: 'char_bridge_1' })
    await bridge.commandSendChat({ text: '桥接发送' })
    await bridge.commandConfirmTransactions([0, 2])
    await bridge.commandConfirmTransactionAt(2)
    await bridge.commandRemoveTransactionAt(1)

    expect(workspaceCommandRegistry.executeCommand).toHaveBeenCalledWith('chat/switchTarget', { targetId: 'char_bridge_1' })
    expect(workspaceCommandRegistry.executeCommand).toHaveBeenCalledWith('chat/send', { text: '桥接发送' })
    expect(workspaceCommandRegistry.executeCommand).toHaveBeenCalledWith('transaction/confirmAll', [0, 2])
    expect(addTransaction).toHaveBeenCalledWith('完成任务', '完成任务: 复盘', { taskId: 'task_1' })
    expect(clearTransactions).toHaveBeenCalledTimes(1)
    expect(confirmTransactions).toHaveBeenCalledWith([0, 2])
    expect(confirmTransactionAt).toHaveBeenCalledWith(2)
    expect(removeTransactionAt).toHaveBeenCalledWith(1)
    expect(workspaceCommandRegistry.registerCommand).toHaveBeenCalledWith(
      'transaction/confirmAll',
      expect.objectContaining({ target: 'pending' })
    )
  })
})
