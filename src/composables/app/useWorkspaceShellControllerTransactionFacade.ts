import type {
  TaskItemViewModel,
  TransactionOperationViewModel
} from '../../types/panelContracts'

type TransactionExtraPayload = TransactionOperationViewModel['extra'] | null
type TransactionAiOptions = { presetName: string; model: string }

export function createWorkspaceShellControllerTransactionFacade() {
  let addTransactionImpl: ((type: string, desc: string, extra?: TransactionExtraPayload) => Promise<unknown>) | null = null
  let completeTaskWithPauseImpl: ((task: TaskItemViewModel) => void) | null = null
  let queueTaskFailureImpl: ((task: TaskItemViewModel) => void) | null = null
  let getAIOptionsForTicketsImpl: ((targetId: string) => TransactionAiOptions) | null = null

  async function addTransaction(type: string, desc: string, extra: TransactionExtraPayload = null) {
    if (!addTransactionImpl) {
      throw new Error('addTransaction 尚未初始化')
    }
    return addTransactionImpl(type, desc, extra)
  }

  function completeTaskWithPause(task: TaskItemViewModel) {
    if (!completeTaskWithPauseImpl) {
      throw new Error('completeTaskWithPause 尚未初始化')
    }
    return completeTaskWithPauseImpl(task)
  }

  function queueTaskFailure(task: TaskItemViewModel) {
    if (!queueTaskFailureImpl) {
      throw new Error('queueTaskFailure 尚未初始化')
    }
    return queueTaskFailureImpl(task)
  }

  function getAIOptionsForTickets(targetId: string) {
    if (!getAIOptionsForTicketsImpl) {
      return { presetName: '', model: '' }
    }
    return getAIOptionsForTicketsImpl(targetId)
  }

  function bindImplementations({
    addTransaction,
    completeTaskWithPause,
    queueTaskFailure,
    getAIOptionsForTickets
  }: {
    addTransaction: (type: string, desc: string, extra?: TransactionExtraPayload) => Promise<unknown>
    completeTaskWithPause: (task: TaskItemViewModel) => void
    queueTaskFailure: (task: TaskItemViewModel) => void
    getAIOptionsForTickets: (targetId: string) => TransactionAiOptions
  }) {
    addTransactionImpl = addTransaction
    completeTaskWithPauseImpl = completeTaskWithPause
    queueTaskFailureImpl = queueTaskFailure
    getAIOptionsForTicketsImpl = getAIOptionsForTickets
  }

  return {
    addTransaction,
    completeTaskWithPause,
    queueTaskFailure,
    getAIOptionsForTickets,
    bindImplementations
  }
}
