import { describe, expect, it, vi } from 'vitest'
import { useTransactionActions } from '../../../src/composables/app/useTransactionActions.js'
import { useTransactionConfirm } from '../../../src/composables/app/useTransactionConfirm.js'

describe('transaction entry adapters', () => {
  it('正式事务动作入口只暴露 transaction 语义', async () => {
    const stageTransaction = vi.fn(async () => ({ id: 'transaction_1' }))
    const taskStore = { pauseTaskTimer: vi.fn() }

    const transactionActions = useTransactionActions({ taskStore, stageTransaction })

    await transactionActions.addTransaction('完成任务', '完成任务: 复盘')
    transactionActions.runCompleteTaskCommand({ id: 'task_0', title: '整理', timerState: { isRunning: false } })
    transactionActions.queueTaskFailure({ id: 'task_1', title: '复盘', timerState: { isRunning: true } })
    transactionActions.runFailTaskCommand({ id: 'task_2', title: '复查', timerState: { isRunning: true } })

    expect(stageTransaction).toHaveBeenCalledWith('完成任务', '完成任务: 复盘', null)
    expect(taskStore.pauseTaskTimer).toHaveBeenCalledWith('task_1')
    expect(stageTransaction).toHaveBeenCalledWith('完成任务', '完成任务: 整理', {
      task: { id: 'task_0', title: '整理', timerState: { isRunning: false } }
    })
    expect(stageTransaction).toHaveBeenCalledWith('任务失败', '任务失败: 复查', {
      task: { id: 'task_2', title: '复查', timerState: { isRunning: true } }
    })
  })

  it('正式事务确认入口以 pendingTransactions 为准', async () => {
    const workspaceRuntimeStore = {
      pendingTransactions: [{ id: 'transaction_1' }]
    }
    const confirmTransactions = vi.fn()

    const transactionConfirm = useTransactionConfirm({ workspaceRuntimeStore, confirmTransactions })

    await transactionConfirm.confirmTransactionAt(0)
    await transactionConfirm.confirmTransactionAt(2)

    expect(confirmTransactions).toHaveBeenCalledTimes(1)
    expect(confirmTransactions).toHaveBeenCalledWith([0])
  })
})
