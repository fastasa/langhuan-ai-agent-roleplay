import { useLocalArchiveDataOps } from './useLocalArchiveDataOps'
import { useTagEventOps } from './useTagEventOps'
import { useTicketOps } from './useTicketOps'
import { useTaskRuntime } from './useTaskRuntime'
import { usePresetUserOps } from './usePresetUserOps'

function buildLocalArchiveDataOpsContext(ctx: any, tagEventOps: any) {
  return {
    localArchiveSync: ctx.localArchiveSync,
    localArchiveLabel: ctx.localArchiveLabel,
    localArchiveNote: ctx.localArchiveNote,
    resourceStore: ctx.resourceStore,
    charStore: ctx.charStore,
    chatStore: ctx.chatStore,
    settingStore: ctx.settingStore,
    taskStore: ctx.taskStore,
    timerComposable: ctx.timerComposable,
    customTags: ctx.customTags,
    eventStack: ctx.eventStack,
    toast: ctx.toast,
    workspaceKernel: ctx.workspaceKernel,
    workspaceRuntimeStore: ctx.workspaceRuntimeStore,
    loadCustomTags: tagEventOps.loadCustomTags,
    loadEventStack: tagEventOps.loadEventStack
  }
}

function buildTagEventOpsContext(ctx: any) {
  return {
    API: ctx.API,
    customTags: ctx.customTags,
    newTagName: ctx.newTagName,
    newTagColor: ctx.newTagColor,
    editingTagId: ctx.editingTagId,
    eventStack: ctx.eventStack,
    eventStackSummary: ctx.eventStackSummary,
    taskStore: ctx.taskStore,
    buildEventTimelinePayload: ctx.buildEventTimelinePayload,
    settingStore: ctx.settingStore,
    openConfirmDialog: ctx.openConfirmDialog,
    toast: ctx.toast
  }
}

function buildTicketOpsContext(ctx: any, tagEventOps: any) {
  return {
    resourceStore: ctx.resourceStore,
    timerComposable: ctx.timerComposable,
    settingStore: ctx.settingStore,
    charStore: ctx.charStore,
    chatStore: ctx.chatStore,
    showEditTicket: ctx.showEditTicket,
    showAddTicket: ctx.showAddTicket,
    editingTicketId: ctx.editingTicketId,
    ticketForm: ctx.ticketForm,
    spendAmount: ctx.spendAmount,
    spendReason: ctx.spendReason,
    batchTicket: ctx.batchTicket,
    batchAmount: ctx.batchAmount,
    newCategoryName: ctx.newCategoryName,
    categoryEditList: ctx.categoryEditList,
    showCategoryEditor: ctx.showCategoryEditor,
    addResourceEventToStack: tagEventOps.addResourceEventToStack,
    buildSystemPrompt: ctx.buildSystemPrompt,
    getAIOptions: (targetId: string) => ctx.getAIOptionsForTickets(targetId),
    callAIStream: ctx.callAIStream,
    openConfirmDialog: ctx.openConfirmDialog,
    toast: ctx.toast
  }
}

function buildTaskRuntimeContext(ctx: any, tagEventOps: any) {
  return {
    taskStore: ctx.taskStore,
    resourceStore: ctx.resourceStore,
    toast: ctx.toast,
    newTaskName: ctx.newTaskName,
    newTaskReward: ctx.newTaskReward,
    newTaskDesc: ctx.newTaskDesc,
    newTaskCategory: ctx.newTaskCategory,
    newTaskBonus: ctx.newTaskBonus,
    currentTaskTab: ctx.currentTaskTab,
    taskTimerUpdateInterval: ctx.taskTimerUpdateInterval,
    customMarkType: ctx.customMarkType,
    customMarkNote: ctx.customMarkNote,
    expandedTaskId: ctx.expandedTaskId,
    addToEventStack: tagEventOps.addToEventStack,
    openConfirmDialog: ctx.openConfirmDialog,
    openPromptDialog: ctx.openPromptDialog
  }
}

function buildPresetUserOpsContext(ctx: any) {
  return {
    settingStore: ctx.settingStore,
    charStore: ctx.charStore,
    userForm: ctx.userForm,
    showUserEditor: ctx.showUserEditor,
    workspaceBootSession: ctx.workspaceBootSession,
    presetSceneFilter: ctx.presetSceneFilter,
    editingPresetIndex: ctx.editingPresetIndex,
    promptPresetForm: ctx.promptPresetForm,
    showPromptPresetEditor: ctx.showPromptPresetEditor,
    openConfirmDialog: ctx.openConfirmDialog,
    toast: ctx.toast
  }
}

export function useAppShellOpsHub(ctx: any) {
  const tagEventOps = useTagEventOps(buildTagEventOpsContext(ctx))
  const localArchiveDataOps = useLocalArchiveDataOps(buildLocalArchiveDataOpsContext(ctx, tagEventOps))

  const ticketOps = useTicketOps(buildTicketOpsContext(ctx, tagEventOps))
  ctx.timerComposable.setTimerCompleteHandler(ticketOps.handleTimerComplete)

  const taskRuntime = useTaskRuntime(buildTaskRuntimeContext(ctx, tagEventOps))

  const presetUserOps = usePresetUserOps(buildPresetUserOpsContext(ctx))

  return {
    ...localArchiveDataOps,
    ...tagEventOps,
    ...ticketOps,
    ...taskRuntime,
    ...presetUserOps
  }
}
