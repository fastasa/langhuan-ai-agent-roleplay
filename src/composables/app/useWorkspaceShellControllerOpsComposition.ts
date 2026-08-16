import { API } from '../../config/api'
import { buildEventTimelinePayload } from '../../utils/taskTimeline'
import { useAppShellOpsHub } from './useAppShellOpsHub'
import { buildAppShellOpsHubContext } from './useAppShellAssemblers'
import { buildWorkspaceShellOpsHubArgs } from './useWorkspaceShellControllerAssemblers'

export function useWorkspaceShellControllerOpsComposition(ctx: any) {
  const { boot, transactionFacade } = ctx
  const {
    resourceStore,
    charStore,
    chatStore,
    settingStore,
    taskStore,
    callAIStream,
    buildSystemPrompt,
    timerComposable,
    localArchiveSync,
    toast,
    appState,
    workspaceRuntime
  } = boot

  const opsHub = useAppShellOpsHub(buildAppShellOpsHubContext(buildWorkspaceShellOpsHubArgs({
    API,
    localArchiveSync,
    localArchiveLabel: appState.localArchiveLabel,
    localArchiveNote: appState.localArchiveNote,
    resourceStore,
    charStore,
    chatStore,
    settingStore,
    taskStore,
    timerComposable,
    customTags: appState.customTags,
    eventStack: appState.eventStack,
    toast,
    workspaceKernel: workspaceRuntime.workspaceKernel,
    workspaceBootSession: workspaceRuntime.workspaceBootSession,
    workspaceRuntimeStore: workspaceRuntime.workspaceRuntimeStore,
    newTagName: appState.newTagName,
    newTagColor: appState.newTagColor,
    editingTagId: appState.editingTagId,
    eventStackSummary: appState.eventStackSummary,
    buildEventTimelinePayload,
    showEditTicket: appState.showEditTicket,
    showAddTicket: appState.showAddTicket,
    editingTicketId: appState.editingTicketId,
    ticketForm: appState.ticketForm,
    spendAmount: appState.spendAmount,
    spendReason: appState.spendReason,
    batchTicket: appState.batchTicket,
    batchAmount: appState.batchAmount,
    newCategoryName: appState.newCategoryName,
    categoryEditList: appState.categoryEditList,
    showCategoryEditor: appState.showCategoryEditor,
    buildSystemPrompt,
    getAIOptionsForTickets: transactionFacade.getAIOptionsForTickets,
    callAIStream,
    newTaskName: appState.newTaskName,
    newTaskReward: appState.newTaskReward,
    newTaskDesc: appState.newTaskDesc,
    newTaskCategory: appState.newTaskCategory,
    newTaskBonus: appState.newTaskBonus,
    currentTaskTab: appState.currentTaskTab,
    taskTimerUpdateInterval: appState.taskTimerUpdateInterval,
    customMarkType: appState.customMarkType,
    customMarkNote: appState.customMarkNote,
    expandedTaskId: appState.expandedTaskId,
    userForm: appState.userForm,
    showUserEditor: appState.showUserEditor,
    presetSceneFilter: appState.presetSceneFilter,
    editingPresetIndex: appState.editingPresetIndex,
    promptPresetForm: appState.promptPresetForm,
    showPromptPresetEditor: appState.showPromptPresetEditor
  })))

  workspaceRuntime.configurePostHydrationSync?.({
    reloadCustomTags: opsHub.loadCustomTags,
    reloadEventStack: opsHub.loadEventStack
  })

  return opsHub
}
