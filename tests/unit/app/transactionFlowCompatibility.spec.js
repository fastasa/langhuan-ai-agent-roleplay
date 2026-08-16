import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { useTransactionFlow } from '../../../src/composables/app/useTransactionFlow.js'
import { useTransactionConfirm } from '../../../src/composables/app/useTransactionConfirm.js'

function createFlowDeps() {
  const runtimeList = []
  const workspaceRuntimeStore = {
    pendingTransactions: runtimeList,
    replacePendingTransactions(nextList) {
      runtimeList.splice(0, runtimeList.length, ...nextList)
    }
  }

  const toast = vi.fn()

  const sharedDeps = {
    workspaceRuntimeStore,
    resourceStore: {
      points: 0,
      bigTimeCount: 0,
      smallTimeCount: 0,
      money: 0,
      tickets: [],
      async saveResources() {},
      async updateTicket() {},
      async addHistory() {}
    },
    timerComposable: {
      async startTimer() { return null },
      async removeTimer() {}
    },
    addResourceEventToStack: vi.fn(),
    chatStore: { currentChatTarget: '' },
    charStore: { groups: [], characters: [], getCharacter() { return null } },
    settingStore: { aiEvaluationEnabled: false },
    toast,
    submitTask: vi.fn(),
    failTaskConfirm: vi.fn(),
    buildSystemPrompt: vi.fn(),
    getAIOptions: vi.fn(),
    callAIStream: vi.fn(),
    transactionExecuting: ref(false)
  }

  return {
    runtimeList,
    toast,
    workspaceRuntimeStore,
    transactionFlow: useTransactionFlow(sharedDeps)
  }
}

describe('transaction flow entries', () => {
  it('正式 transaction flow 只写入统一 runtime 事务列表', async () => {
    const { transactionFlow, runtimeList, toast } = createFlowDeps()

    await transactionFlow.stageTransaction('完成任务', '完成任务: 正式入口', {
      task: { id: 'task_0', title: '正式入口' }
    })
    await transactionFlow.stageTransaction('完成任务', '完成任务: 整理笔记', {
      task: { id: 'task_1', title: '整理笔记' }
    })

    expect(runtimeList).toHaveLength(2)
    expect(runtimeList[0].desc).toBe('完成任务: 正式入口')
    expect(runtimeList[1].type).toBe('完成任务')

    await transactionFlow.clearTransactions()

    expect(runtimeList).toEqual([])
    expect(toast).toHaveBeenLastCalledWith('待处理事务已全部撤销', 'info')
  })

  it('正式 transaction confirm 只认 runtime store', async () => {
    const { workspaceRuntimeStore } = createFlowDeps()
    workspaceRuntimeStore.replacePendingTransactions([{ id: 'transaction_1', type: '完成任务' }])
    const confirmTransactions = vi.fn()

    const transactionConfirm = useTransactionConfirm({ workspaceRuntimeStore, confirmTransactions })

    await transactionConfirm.confirmTransactionAt(0)
    await transactionConfirm.confirmTransactionAt(0)
    await transactionConfirm.confirmTransactionAt(2)

    expect(confirmTransactions).toHaveBeenCalledTimes(2)
    expect(confirmTransactions.mock.calls[0][0]).toEqual([0])
    expect(confirmTransactions.mock.calls[1][0]).toEqual([0])
  })
})
