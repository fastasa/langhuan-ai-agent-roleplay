import {
  createWorkspaceCommandActions,
  registerWorkspaceCommandBridge,
  type WorkspaceCommandBridgeContext
} from './workspaceCommandHandlers'

export function buildWorkspaceShellControllerViewCommandBindings(ctx: any) {
  const {
    workspaceCommandRegistry,
    opsHub,
    flowHub,
    transactionFacade,
    apiPresetManager,
    environmentOps,
    domains
  } = ctx

  const commandBridgeContext: WorkspaceCommandBridgeContext = {
    workspaceCommandRegistry,
    switchChat: domains.chatTargetHelpers.switchChat,
    runChatSendCommand: flowHub.runChatSendCommand,
    sendChat: flowHub.sendChat,
    runStageTransactionCommand: flowHub.runAddTransactionCommand,
    addTransaction: transactionFacade.addTransaction,
    runClearTransactionsCommand: flowHub.runClearTransactionsCommand,
    clearTransactions: flowHub.clearTransactions,
    runConfirmTransactionsCommand: flowHub.runConfirmTransactionsCommand,
    confirmTransactions: flowHub.confirmTransactions,
    runConfirmTransactionAtCommand: flowHub.runConfirmTransactionAtCommand,
    confirmTransactionAt: flowHub.confirmTransactionAt,
    runRemoveTransactionCommand: flowHub.runRemoveTransactionCommand,
    removeTransactionAt: flowHub.removeTransactionAt,
    runDispatchAITaskCommand: flowHub.runDispatchAITaskCommand,
    dispatchAITask: flowHub.dispatchAITask,
    runAddCustomTaskCommand: opsHub.runAddCustomTaskCommand,
    addCustomTask: opsHub.addCustomTask,
    runStartTaskTimerCommand: opsHub.runStartTaskTimerCommand,
    startTaskTimer: opsHub.startTaskTimer,
    runPauseTaskTimerCommand: opsHub.runPauseTaskTimerCommand,
    pauseTaskTimer: opsHub.pauseTaskTimer,
    runResetTaskTimerCommand: opsHub.runResetTaskTimerCommand,
    resetTaskTimer: opsHub.resetTaskTimer,
    runAddTaskMarkCommand: opsHub.runAddTaskMarkCommand,
    addTaskMark: opsHub.addTaskMark,
    runCompleteTaskCommand: flowHub.runCompleteTaskCommand,
    completeTaskWithPause: transactionFacade.completeTaskWithPause,
    runFailTaskCommand: flowHub.runFailTaskCommand,
    queueTaskFailure: transactionFacade.queueTaskFailure,
    runDeleteTaskCommand: opsHub.runDeleteTaskCommand,
    deleteTask: opsHub.deleteTask,
    runLocalArchiveUploadCommand: opsHub.runLocalArchiveUploadCommand,
    localArchiveUpload: opsHub.localArchiveUpload,
    runLocalArchiveDownloadCommand: opsHub.runLocalArchiveDownloadCommand,
    localArchiveDownload: opsHub.localArchiveDownload,
    runCreateLocalArchiveSaveCommand: opsHub.runCreateLocalArchiveSaveCommand,
    createLocalArchiveSave: opsHub.createLocalArchiveSave,
    runUpdateLocalArchiveSaveNoteCommand: opsHub.runUpdateLocalArchiveSaveNoteCommand,
    updateLocalArchiveSaveNote: opsHub.updateLocalArchiveSaveNote,
    runRenameLocalArchiveSaveCommand: opsHub.runRenameLocalArchiveSaveCommand,
    renameLocalArchiveSave: opsHub.renameLocalArchiveSave,
    runDeleteLocalArchiveSaveCommand: opsHub.runDeleteLocalArchiveSaveCommand,
    deleteLocalArchiveSave: opsHub.deleteLocalArchiveSave,
    runImportAllDataCommand: opsHub.runImportAllDataCommand,
    importAllData: opsHub.importAllData,
    runResetAllDataCommand: opsHub.runResetAllDataCommand,
    resetAllData: opsHub.resetAllData,
    runSaveApiPresetCommand: apiPresetManager.runSaveApiPresetCommand,
    saveApiPreset: apiPresetManager.saveApiPreset,
    runSaveWeatherApiConfigCommand: environmentOps.runSaveWeatherApiConfigCommand,
    saveWeatherApiConfig: environmentOps.saveWeatherApiConfig
  }

  registerWorkspaceCommandBridge(commandBridgeContext)

  return createWorkspaceCommandActions((type, payload) => workspaceCommandRegistry.executeCommand(type, payload))
}
