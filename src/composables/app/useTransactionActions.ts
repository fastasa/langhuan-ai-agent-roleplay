export function useTransactionActions({
  taskStore,
  stageTransaction
}: any) {
  async function addTransaction(type: string, desc: string, extra: any = null) {
    return stageTransaction(type, desc, extra)
  }

  async function runAddTransactionCommand(type: string, desc: string, extra: any = null) {
    return stageTransaction(type, desc, extra)
  }

  function completeTaskWithPause(task: any) {
    return executeCompleteTaskCommand({
      taskStore,
      addTransaction
    }, task)
  }

  function queueTaskFailure(task: any) {
    return executeFailTaskCommand({
      taskStore,
      addTransaction
    }, task)
  }

  function runCompleteTaskCommand(task: any) {
    return executeCompleteTaskCommand({
      taskStore,
      addTransaction
    }, task)
  }

  function runFailTaskCommand(task: any) {
    return executeFailTaskCommand({
      taskStore,
      addTransaction
    }, task)
  }

  return {
    addTransaction,
    runAddTransactionCommand,
    completeTaskWithPause,
    queueTaskFailure,
    runCompleteTaskCommand,
    runFailTaskCommand
  }
}

export function executeCompleteTaskCommand({
  taskStore,
  addTransaction
}: any, task: any) {
  if (task.timerState?.isRunning) {
    taskStore.pauseTaskTimer(task.id)
  }
  return addTransaction('完成任务', `完成任务: ${task.name || task.title}`, {
    task: { ...task, timerState: task.timerState }
  })
}

export function executeFailTaskCommand({
  taskStore,
  addTransaction
}: any, task: any) {
  if (task.timerState?.isRunning) {
    taskStore.pauseTaskTimer(task.id)
  }
  return addTransaction('任务失败', `任务失败: ${task.name || task.title}`, {
    task: { ...task, timerState: task.timerState }
  })
}
