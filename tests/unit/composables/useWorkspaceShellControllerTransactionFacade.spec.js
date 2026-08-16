import { describe, expect, it, vi } from 'vitest'
import { createWorkspaceShellControllerTransactionFacade } from '../../../src/composables/app/useWorkspaceShellControllerTransactionFacade.ts'

describe('useWorkspaceShellControllerTransactionFacade', () => {
  it('会在实现绑定后统一代理事务入口', async () => {
    const facade = createWorkspaceShellControllerTransactionFacade()
    const addTransaction = vi.fn(async () => ({ id: 'transaction_1' }))
    const completeTaskWithPause = vi.fn()
    const queueTaskFailure = vi.fn()
    const getAIOptionsForTickets = vi.fn(() => ({ presetName: '默认预设', model: 'gpt-test' }))

    facade.bindImplementations({
      addTransaction,
      completeTaskWithPause,
      queueTaskFailure,
      getAIOptionsForTickets
    })

    await facade.addTransaction('完成任务', '完成任务: 复盘', { taskId: 'task_1' })
    facade.completeTaskWithPause({ id: 'task_1' })
    facade.queueTaskFailure({ id: 'task_2' })

    expect(facade.getAIOptionsForTickets('char_1')).toEqual({ presetName: '默认预设', model: 'gpt-test' })
    expect(addTransaction).toHaveBeenCalledWith('完成任务', '完成任务: 复盘', { taskId: 'task_1' })
    expect(completeTaskWithPause).toHaveBeenCalledWith({ id: 'task_1' })
    expect(queueTaskFailure).toHaveBeenCalledWith({ id: 'task_2' })
  })
})
