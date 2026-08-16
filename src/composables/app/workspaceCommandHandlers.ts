import type { WorkspaceCommandHandler } from '../../app/workspaceCommandBus'
import type {
  WorkspaceFeedbackPolicy,
  WorkspaceResumePolicy,
  WorkspaceRollbackPolicy,
  WorkspaceCommandTarget
} from '../../types/workspace'
import type { LocalArchiveModuleName } from './localArchiveShared'
import {
  normalizeChatSendPayload,
  type ChatSendPayload
} from '../../app/chatSendProtocol'

export type WorkspaceCommandRegistry = {
  registerCommand: <TPayload = unknown, TResult = unknown>(
    type: string,
    handler: WorkspaceCommandHandler<TPayload, TResult>
  ) => void
  executeCommand: (type: string, payload?: unknown) => Promise<unknown>
}

export type TaskMutationPayload = Record<string, unknown>

export type TransactionStagePayload = {
  type: string
  desc: string
  extra?: Record<string, unknown>
}

export type LocalArchiveCommandPayload = {
  name?: string
  modules?: LocalArchiveModuleName[]
}

export type LocalArchiveCreatePayload = LocalArchiveCommandPayload & {
  note?: string
}

export type LocalArchiveRenamePayload = {
  oldName: string
  nextName: string
}

export type ImportDataPayload = {
  event: Event
  modules?: LocalArchiveModuleName[]
}

export type ChatSwitchPayload = {
  targetId?: string
}

export type TransactionConfirmAllPayload = {
  indices?: number[]
}

export type TransactionIndexPayload = {
  index?: number
}

export type TaskTimerCommandPayload = {
  taskId?: string
}

export type WorkspaceCommandBridgeContext = {
  workspaceCommandRegistry: WorkspaceCommandRegistry
  runSwitchChatCommand?: (targetId: string) => Promise<unknown> | unknown
  switchChat: (targetId: string) => Promise<unknown> | unknown
  runChatSendCommand?: (payload?: string | ChatSendPayload) => Promise<unknown> | unknown
  sendChat: (payload?: string | ChatSendPayload) => Promise<unknown> | unknown
  runStageTransactionCommand?: (type: string, desc: string, extra?: Record<string, unknown>) => Promise<unknown> | unknown
  addTransaction: (type: string, desc: string, extra?: Record<string, unknown>) => Promise<unknown> | unknown
  runClearTransactionsCommand?: () => Promise<unknown> | unknown
  clearTransactions: () => Promise<unknown> | unknown
  runConfirmTransactionsCommand?: (indices?: number[]) => Promise<unknown> | unknown
  confirmTransactions: (indices?: number[]) => Promise<unknown> | unknown
  runConfirmTransactionAtCommand?: (index: number) => Promise<unknown> | unknown
  confirmTransactionAt: (index: number) => Promise<unknown> | unknown
  runRemoveTransactionCommand?: (index: number) => Promise<unknown> | unknown
  removeTransactionAt: (index: number) => Promise<unknown> | unknown
  runDispatchAITaskCommand?: () => Promise<unknown> | unknown
  dispatchAITask: () => Promise<unknown> | unknown
  runAddCustomTaskCommand?: () => Promise<unknown> | unknown
  addCustomTask: () => Promise<unknown> | unknown
  runStartTaskTimerCommand?: (taskId: string) => Promise<unknown> | unknown
  startTaskTimer: (taskId: string) => Promise<unknown> | unknown
  runPauseTaskTimerCommand?: (taskId: string) => Promise<unknown> | unknown
  pauseTaskTimer: (taskId: string) => Promise<unknown> | unknown
  runResetTaskTimerCommand?: (taskId: string) => Promise<unknown> | unknown
  resetTaskTimer: (taskId: string) => Promise<unknown> | unknown
  runAddTaskMarkCommand?: (taskId: string) => Promise<unknown> | unknown
  addTaskMark: (taskId: string) => Promise<unknown> | unknown
  runCompleteTaskCommand?: (task: TaskMutationPayload) => Promise<unknown> | unknown
  completeTaskWithPause: (task: TaskMutationPayload) => Promise<unknown> | unknown
  runFailTaskCommand?: (task: TaskMutationPayload) => Promise<unknown> | unknown
  queueTaskFailure: (task: TaskMutationPayload) => Promise<unknown> | unknown
  runDeleteTaskCommand?: (taskId: string) => Promise<unknown> | unknown
  deleteTask: (taskId: string) => Promise<unknown> | unknown
  runLocalArchiveUploadCommand?: (name?: string, modules?: LocalArchiveModuleName[]) => Promise<unknown> | unknown
  localArchiveUpload: (name?: string, modules?: LocalArchiveModuleName[]) => Promise<unknown> | unknown
  runLocalArchiveDownloadCommand?: (name?: string, modules?: LocalArchiveModuleName[]) => Promise<unknown> | unknown
  localArchiveDownload: (name?: string, modules?: LocalArchiveModuleName[]) => Promise<unknown> | unknown
  runCreateLocalArchiveSaveCommand?: (name?: string, note?: string, modules?: LocalArchiveModuleName[]) => Promise<unknown> | unknown
  createLocalArchiveSave: (name?: string, note?: string, modules?: LocalArchiveModuleName[]) => Promise<unknown> | unknown
  runUpdateLocalArchiveSaveNoteCommand?: (name?: string, note?: string) => Promise<unknown> | unknown
  updateLocalArchiveSaveNote: (name?: string, note?: string) => Promise<unknown> | unknown
  runRenameLocalArchiveSaveCommand?: (oldName: string, nextName: string) => Promise<unknown> | unknown
  renameLocalArchiveSave: (oldName: string, nextName: string) => Promise<unknown> | unknown
  runDeleteLocalArchiveSaveCommand?: (slotName: string) => Promise<unknown> | unknown
  deleteLocalArchiveSave: (slotName: string) => Promise<unknown> | unknown
  runImportAllDataCommand?: (event: Event, modules?: LocalArchiveModuleName[]) => Promise<unknown> | unknown
  importAllData: (event: Event, modules?: LocalArchiveModuleName[]) => Promise<unknown> | unknown
  runResetAllDataCommand?: () => Promise<unknown> | unknown
  resetAllData: () => Promise<unknown> | unknown
  runSaveApiPresetCommand?: () => Promise<unknown> | unknown
  saveApiPreset: () => Promise<unknown> | unknown
  runSaveWeatherApiConfigCommand?: () => Promise<unknown> | unknown
  saveWeatherApiConfig: () => Promise<unknown> | unknown
}

export type WorkspaceCommandActions = ReturnType<typeof createWorkspaceCommandActions>

export type WorkspaceCommandDefinition = {
  type: string
  target?: WorkspaceCommandTarget
  optimistic?: boolean
  rollbackPolicy?: WorkspaceRollbackPolicy | WorkspaceRollbackPolicy['mode']
  resumePolicy?: WorkspaceResumePolicy | WorkspaceResumePolicy['mode']
  feedbackPolicy?: WorkspaceFeedbackPolicy | WorkspaceFeedbackPolicy['mode']
  handle: (payload?: any) => Promise<unknown> | unknown
}

type WorkspaceCommandExecutor = (type: string, payload?: any) => Promise<unknown>

function inferCommandTarget(type: string): WorkspaceCommandTarget {
  if (type.startsWith('chat/')) return 'chat'
  if (type.startsWith('transaction/')) return 'pending'
  if (type.startsWith('task/')) return 'task'
  if (type.startsWith('archive/')) return 'archive'
  if (type.startsWith('data/')) return 'data'
  if (type.startsWith('settings/')) return 'settings'
  if (type.startsWith('workspace/')) return 'workspace'
  return 'unknown'
}

async function runBooleanCommand(action: () => Promise<unknown>, failureMessage: string) {
  const result = await action()
  if (result === false) {
    throw new Error(failureMessage)
  }
  return result
}

function readChatSendPayload(payload?: string | ChatSendPayload) {
  return normalizeChatSendPayload(payload)
}

function readChatSwitchPayload(payload?: string | ChatSwitchPayload) {
  if (typeof payload === 'string') {
    return payload
  }
  if (payload && typeof payload === 'object' && typeof payload.targetId === 'string') {
    return payload.targetId
  }
  return ''
}

function readConfirmIndices(payload?: number[] | TransactionConfirmAllPayload) {
  if (Array.isArray(payload)) {
    return payload
      .map((item) => Number(item))
      .filter((item) => Number.isInteger(item) && item >= 0)
  }
  if (payload && typeof payload === 'object' && Array.isArray(payload.indices)) {
    return payload.indices
      .map((item) => Number(item))
      .filter((item) => Number.isInteger(item) && item >= 0)
  }
  return undefined
}

function readTransactionIndex(payload?: number | TransactionIndexPayload) {
  if (typeof payload === 'number' && Number.isInteger(payload)) {
    return payload
  }
  if (payload && typeof payload === 'object' && Number.isInteger(payload.index)) {
    return Number(payload.index)
  }
  return -1
}

function readTaskId(payload?: string | TaskTimerCommandPayload) {
  if (typeof payload === 'string') return payload
  if (payload && typeof payload === 'object' && typeof payload.taskId === 'string') {
    return payload.taskId
  }
  return ''
}

function createTransactionCommandDefinitions(
  context: WorkspaceCommandBridgeContext
): WorkspaceCommandDefinition[] {
  return [
    {
      type: 'transaction/stage',
      optimistic: true,
      handle: async (payload?: TransactionStagePayload) =>
        await (context.runStageTransactionCommand || context.addTransaction)(payload?.type || '', payload?.desc || '', payload?.extra)
    },
    {
      type: 'transaction/clear',
      feedbackPolicy: { mode: 'toast', successMessage: '待处理事务已清空' },
      handle: async () => await (context.runClearTransactionsCommand || context.clearTransactions)()
    },
    {
      type: 'transaction/confirmAll',
      optimistic: true,
      rollbackPolicy: 'auto',
      handle: async (payload?: number[] | TransactionConfirmAllPayload) => await (
        context.runConfirmTransactionsCommand || context.confirmTransactions
      )(readConfirmIndices(payload))
    },
    {
      type: 'transaction/confirmOne',
      optimistic: true,
      rollbackPolicy: 'auto',
      handle: async (payload?: number | TransactionIndexPayload) => await (
        context.runConfirmTransactionAtCommand || context.confirmTransactionAt
      )(readTransactionIndex(payload))
    },
    {
      type: 'transaction/remove',
      optimistic: true,
      handle: async (payload?: number | TransactionIndexPayload) => await (
        context.runRemoveTransactionCommand || context.removeTransactionAt
      )(readTransactionIndex(payload))
    }
  ]
}

function createTaskCommandDefinitions(
  context: WorkspaceCommandBridgeContext
): WorkspaceCommandDefinition[] {
  return [
    {
      type: 'task/dispatchAi',
      optimistic: true,
      handle: async () => await (context.runDispatchAITaskCommand || context.dispatchAITask)()
    },
    {
      type: 'task/addCustom',
      optimistic: true,
      handle: async () => await (context.runAddCustomTaskCommand || context.addCustomTask)()
    },
    {
      type: 'task/start',
      optimistic: true,
      resumePolicy: 'resume',
      handle: async (payload?: string | TaskTimerCommandPayload) => await (
        context.runStartTaskTimerCommand || context.startTaskTimer
      )(readTaskId(payload))
    },
    {
      type: 'task/pause',
      optimistic: true,
      handle: async (payload?: string | TaskTimerCommandPayload) => await (
        context.runPauseTaskTimerCommand || context.pauseTaskTimer
      )(readTaskId(payload))
    },
    {
      type: 'task/reset',
      optimistic: true,
      handle: async (payload?: string | TaskTimerCommandPayload) => await (
        context.runResetTaskTimerCommand || context.resetTaskTimer
      )(readTaskId(payload))
    },
    {
      type: 'task/mark',
      optimistic: true,
      handle: async (payload?: string | TaskTimerCommandPayload) => await (
        context.runAddTaskMarkCommand || context.addTaskMark
      )(readTaskId(payload))
    },
    {
      type: 'task/complete',
      optimistic: true,
      rollbackPolicy: 'auto',
      handle: async (task?: TaskMutationPayload) => await (context.runCompleteTaskCommand || context.completeTaskWithPause)(task || {})
    },
    {
      type: 'task/fail',
      optimistic: true,
      rollbackPolicy: 'auto',
      handle: async (task?: TaskMutationPayload) => await (context.runFailTaskCommand || context.queueTaskFailure)(task || {})
    },
    {
      type: 'task/delete',
      optimistic: true,
      rollbackPolicy: 'auto',
      handle: async (payload?: string | TaskTimerCommandPayload) => await (
        context.runDeleteTaskCommand || context.deleteTask
      )(readTaskId(payload))
    }
  ]
}

function createLocalArchiveCommandDefinitions(
  context: WorkspaceCommandBridgeContext
): WorkspaceCommandDefinition[] {
  return [
    {
      type: 'archive/upload',
      resumePolicy: 'resume-latest',
      feedbackPolicy: {
        mode: 'toast',
        runningMessage: '正在保存本机存档...',
        successMessage: '本机存档保存完成',
        errorMessage: '本机存档保存失败'
      },
      handle: async (payload?: LocalArchiveCommandPayload) => await runBooleanCommand(
        async () => await (context.runLocalArchiveUploadCommand || context.localArchiveUpload)(payload?.name, payload?.modules),
        '本机存档保存失败'
      )
    },
    {
      type: 'archive/download',
      rollbackPolicy: 'auto',
      resumePolicy: 'resume-latest',
      feedbackPolicy: {
        mode: 'toast',
        runningMessage: '正在恢复本机存档...',
        successMessage: '本机存档恢复完成',
        errorMessage: '本机存档恢复失败'
      },
      handle: async (payload?: LocalArchiveCommandPayload) => await runBooleanCommand(
        async () => await (context.runLocalArchiveDownloadCommand || context.localArchiveDownload)(payload?.name, payload?.modules),
        '本机存档恢复失败'
      )
    },
    {
      type: 'archive/create',
      feedbackPolicy: { mode: 'toast', successMessage: '本机存档已创建', errorMessage: '本机存档创建失败' },
      handle: async (payload?: LocalArchiveCreatePayload) => await runBooleanCommand(
        async () => await (context.runCreateLocalArchiveSaveCommand || context.createLocalArchiveSave)(payload?.name, payload?.note, payload?.modules),
        '本机存档创建失败'
      )
    },
    {
      type: 'archive/updateNote',
      feedbackPolicy: { mode: 'toast', successMessage: '本机存档备注已更新', errorMessage: '本机存档备注更新失败' },
      handle: async (payload?: LocalArchiveCreatePayload) => await runBooleanCommand(
        async () => await (context.runUpdateLocalArchiveSaveNoteCommand || context.updateLocalArchiveSaveNote)(payload?.name, payload?.note),
        '本机存档备注更新失败'
      )
    },
    {
      type: 'archive/rename',
      feedbackPolicy: { mode: 'toast', successMessage: '本机存档名称已更新', errorMessage: '本机存档名称更新失败' },
      handle: async (payload?: LocalArchiveRenamePayload) => await runBooleanCommand(
        async () => await (context.runRenameLocalArchiveSaveCommand || context.renameLocalArchiveSave)(payload?.oldName || '', payload?.nextName || ''),
        '本机存档名称更新失败'
      )
    },
    {
      type: 'archive/delete',
      feedbackPolicy: { mode: 'toast', successMessage: '本机存档已删除', errorMessage: '本机存档删除失败' },
      handle: async (slotName?: string) => await runBooleanCommand(
        async () => await (context.runDeleteLocalArchiveSaveCommand || context.deleteLocalArchiveSave)(slotName || ''),
        '本机存档删除失败'
      )
    }
  ]
}

export function createWorkspaceCommandDefinitions(
  context: WorkspaceCommandBridgeContext
): WorkspaceCommandDefinition[] {
  return [
    {
      type: 'chat/switchTarget',
      optimistic: true,
      handle: async (payload?: string | ChatSwitchPayload) => await (
        context.runSwitchChatCommand || context.switchChat
      )(readChatSwitchPayload(payload))
    },
    {
      type: 'chat/send',
      optimistic: true,
      handle: async (payload?: string | ChatSendPayload) => await (
        context.runChatSendCommand || context.sendChat
      )(readChatSendPayload(payload))
    },
    ...createTransactionCommandDefinitions(context),
    ...createTaskCommandDefinitions(context),
    ...createLocalArchiveCommandDefinitions(context),
    {
      type: 'data/import',
      rollbackPolicy: 'auto',
      feedbackPolicy: {
        mode: 'toast',
        runningMessage: '正在导入数据...',
        successMessage: '数据导入完成',
        errorMessage: '数据导入失败'
      },
      handle: async (payload?: ImportDataPayload) => await (
        context.runImportAllDataCommand || context.importAllData
      )(payload?.event as Event, payload?.modules)
    },
    {
      type: 'data/reset',
      rollbackPolicy: 'auto',
      feedbackPolicy: { mode: 'blocking', errorMessage: '重置数据失败' },
      handle: async () => await (context.runResetAllDataCommand || context.resetAllData)()
    },
    {
      type: 'settings/saveApiPreset',
      feedbackPolicy: { mode: 'toast', successMessage: '接口预设已保存', errorMessage: '接口预设保存失败' },
      handle: async () => await (context.runSaveApiPresetCommand || context.saveApiPreset)()
    },
    {
      type: 'settings/saveWeather',
      feedbackPolicy: { mode: 'toast', successMessage: '天气配置已保存', errorMessage: '天气配置保存失败' },
      handle: async () => await (context.runSaveWeatherApiConfigCommand || context.saveWeatherApiConfig)()
    }
  ]
}

export function registerWorkspaceCommandDefinitions(
  registry: WorkspaceCommandRegistry,
  definitions: WorkspaceCommandDefinition[]
) {
  definitions.forEach((definition) => {
    registry.registerCommand(definition.type, {
      handle: definition.handle,
      target: definition.target || inferCommandTarget(definition.type),
      optimistic: Boolean(definition.optimistic),
      rollbackPolicy: definition.rollbackPolicy || 'manual',
      resumePolicy: definition.resumePolicy || 'none',
      feedbackPolicy: definition.feedbackPolicy || 'silent'
    })
  })
}

export function registerWorkspaceCommandBridge(
  context: WorkspaceCommandBridgeContext,
  registeredWorkspaceCommands = new Set<string>()
) {
  for (const definition of createWorkspaceCommandDefinitions(context)) {
    if (registeredWorkspaceCommands.has(definition.type)) continue
    registerWorkspaceCommandDefinitions(context.workspaceCommandRegistry, [definition])
    registeredWorkspaceCommands.add(definition.type)
  }
  return registeredWorkspaceCommands
}

export function createWorkspaceCommandActions(runWorkspaceCommand: WorkspaceCommandExecutor) {
  const runTransactionCommand = (
    action: 'stage' | 'clear' | 'confirmAll' | 'confirmOne' | 'remove',
    payload?: number | number[] | TransactionIndexPayload | TransactionStagePayload
  ) => runWorkspaceCommand(`transaction/${action}`, payload)

  return {
    commandSwitchChat: (targetId: string | ChatSwitchPayload) => runWorkspaceCommand('chat/switchTarget', targetId),
    commandSendChat: (payload?: string | ChatSendPayload) => runWorkspaceCommand('chat/send', payload),
    commandAddTransaction: (type: string, desc: string, extra?: Record<string, unknown>) =>
      runTransactionCommand('stage', { type, desc, extra }),
    commandClearTransactions: () => runTransactionCommand('clear'),
    commandConfirmTransactions: (indices?: number[]) => runTransactionCommand('confirmAll', indices),
    commandConfirmTransactionAt: (index: number | TransactionIndexPayload) => runTransactionCommand('confirmOne', index),
    commandRemoveTransactionAt: (index: number | TransactionIndexPayload) => runTransactionCommand('remove', index),
    commandDispatchAiTask: () => runWorkspaceCommand('task/dispatchAi'),
    commandAddCustomTask: () => runWorkspaceCommand('task/addCustom'),
    commandStartTaskTimer: (taskId: string | TaskTimerCommandPayload) => runWorkspaceCommand('task/start', taskId),
    commandPauseTaskTimer: (taskId: string | TaskTimerCommandPayload) => runWorkspaceCommand('task/pause', taskId),
    commandResetTaskTimer: (taskId: string | TaskTimerCommandPayload) => runWorkspaceCommand('task/reset', taskId),
    commandAddTaskMark: (taskId: string | TaskTimerCommandPayload) => runWorkspaceCommand('task/mark', taskId),
    commandCompleteTaskWithPause: (task: TaskMutationPayload) => runWorkspaceCommand('task/complete', task),
    commandQueueTaskFailure: (task: TaskMutationPayload) => runWorkspaceCommand('task/fail', task),
    commandDeleteTask: (taskId: string | TaskTimerCommandPayload) => runWorkspaceCommand('task/delete', taskId),
    commandLocalArchiveUpload: (name?: string, modules?: LocalArchiveModuleName[]) => runWorkspaceCommand('archive/upload', { name, modules }),
    commandLocalArchiveDownload: (name?: string, modules?: LocalArchiveModuleName[]) => runWorkspaceCommand('archive/download', { name, modules }),
    commandCreateLocalArchiveSave: (name: string, note: string, modules?: LocalArchiveModuleName[]) =>
      runWorkspaceCommand('archive/create', { name, note, modules }),
    commandUpdateLocalArchiveSaveNote: (name: string, note: string) => runWorkspaceCommand('archive/updateNote', { name, note }),
    commandRenameLocalArchiveSave: (oldName: string, nextName: string) => runWorkspaceCommand('archive/rename', { oldName, nextName }),
    commandDeleteLocalArchiveSave: (slotName: string) => runWorkspaceCommand('archive/delete', slotName),
    commandSaveApiPreset: () => runWorkspaceCommand('settings/saveApiPreset'),
    commandSaveWeatherApiConfig: () => runWorkspaceCommand('settings/saveWeather'),
    commandResetAllData: () => runWorkspaceCommand('data/reset'),
    commandImportAllData: (event: Event, modules?: LocalArchiveModuleName[]) => runWorkspaceCommand('data/import', { event, modules })
  }
}

export function pickWorkspaceCommandActions(source: WorkspaceCommandActions) {
  return {
    commandSwitchChat: source.commandSwitchChat,
    commandSendChat: source.commandSendChat,
    commandAddTransaction: source.commandAddTransaction,
    commandClearTransactions: source.commandClearTransactions,
    commandConfirmTransactions: source.commandConfirmTransactions,
    commandConfirmTransactionAt: source.commandConfirmTransactionAt,
    commandRemoveTransactionAt: source.commandRemoveTransactionAt,
    commandDispatchAiTask: source.commandDispatchAiTask,
    commandAddCustomTask: source.commandAddCustomTask,
    commandStartTaskTimer: source.commandStartTaskTimer,
    commandPauseTaskTimer: source.commandPauseTaskTimer,
    commandResetTaskTimer: source.commandResetTaskTimer,
    commandAddTaskMark: source.commandAddTaskMark,
    commandCompleteTaskWithPause: source.commandCompleteTaskWithPause,
    commandQueueTaskFailure: source.commandQueueTaskFailure,
    commandDeleteTask: source.commandDeleteTask,
    commandLocalArchiveUpload: source.commandLocalArchiveUpload,
    commandLocalArchiveDownload: source.commandLocalArchiveDownload,
    commandCreateLocalArchiveSave: source.commandCreateLocalArchiveSave,
    commandUpdateLocalArchiveSaveNote: source.commandUpdateLocalArchiveSaveNote,
    commandRenameLocalArchiveSave: source.commandRenameLocalArchiveSave,
    commandDeleteLocalArchiveSave: source.commandDeleteLocalArchiveSave,
    commandSaveApiPreset: source.commandSaveApiPreset,
    commandSaveWeatherApiConfig: source.commandSaveWeatherApiConfig,
    commandResetAllData: source.commandResetAllData,
    commandImportAllData: source.commandImportAllData
  }
}
