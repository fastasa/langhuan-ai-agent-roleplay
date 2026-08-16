import { shallowReactive, watchEffect } from 'vue'
import type { DesktopPanelState } from '../../types/panelContracts'
import {
  buildApiConfigBridge,
  buildChatBridge,
  buildLocalArchiveSyncBridge,
  buildDataManageBridge,
  buildEnvironmentBridge,
  buildTransactionBridge,
  buildPresetManagerBridge,
  buildResourceBridge,
  buildTaskBridge,
  buildTicketBridge
} from './useAppShellPanelBuilders'

export function useWorkspacePanels(ctx: any) {
  const { environmentViewModel, environmentActions } = buildEnvironmentBridge(ctx)
  const { chatViewModel, chatActions } = buildChatBridge(ctx)
  const {
    transactionPanelViewModel,
    transactionPanelActions
  } = buildTransactionBridge(ctx)
  const { taskPanelViewModel, taskPanelActions } = buildTaskBridge(ctx)
  const { localArchiveSyncPanelViewModel, localArchiveSyncPanelActions } = buildLocalArchiveSyncBridge(ctx)
  const { resourcePanelViewModel, resourcePanelActions } = buildResourceBridge(ctx)
  const { ticketPanelViewModel, ticketPanelActions } = buildTicketBridge(ctx)
  const { apiConfigPanelViewModel, apiConfigPanelActions } = buildApiConfigBridge(ctx)
  const { presetManagerPanelViewModel, presetManagerPanelActions } = buildPresetManagerBridge(ctx)
  const { dataManagePanelViewModel, dataManagePanelActions } = buildDataManageBridge(ctx)
  // 桌面面板里有少量 Ref 需要原样透传给子组件，不能被 reactive 自动解包。
  const desktopState = shallowReactive({} as DesktopPanelState)

  watchEffect(() => {
    Object.assign(desktopState, {
      panelViewModels: {
        resource: resourcePanelViewModel.value,
        transaction: {
          ...transactionPanelViewModel.value,
          hasTaskTimeline: ctx.hasTaskTimeline,
          getTaskTimelineNodes: ctx.getTaskTimelineNodes,
          formatTimerTime: ctx.taskStore.formatTimerTime,
          getTaskElapsedTime: ctx.taskStore.getTaskElapsedTime
        },
        task: taskPanelViewModel.value,
        ticket: ticketPanelViewModel.value,
        localArchiveSync: localArchiveSyncPanelViewModel.value,
        apiConfig: apiConfigPanelViewModel.value,
        presetManager: presetManagerPanelViewModel.value,
        dataManage: dataManagePanelViewModel.value
      },
      panelActions: {
        resource: resourcePanelActions,
        transaction: transactionPanelActions,
        task: taskPanelActions,
        ticket: ticketPanelActions,
        localArchiveSync: localArchiveSyncPanelActions,
        apiConfig: apiConfigPanelActions,
        presetManager: presetManagerPanelActions,
        dataManage: dataManagePanelActions
      },
      environmentViewModel: environmentViewModel.value,
      environmentActions,
      chatViewModel: chatViewModel.value,
      chatActions,
      formatDateOnly: ctx.formatDateOnly,
      formatTimeOnly: ctx.formatTimeOnly,
      formatObsTime: ctx.formatObsTime,
      getWeatherIcon: ctx.getWeatherIcon,
      getWeatherEmoji: ctx.getWeatherEmoji,
      getCharAvatarById: ctx.getCharAvatarById,
      formatChatText: ctx.formatChatText,
      getCharAvatar: ctx.getCharAvatar,
      getCharEmoji: ctx.getCharEmoji,
      setMessagesAreaRef: ctx.setMessagesAreaRef,
      chatStickToBottom: ctx.chatStickToBottom,
      getDisplayedMessageContent: ctx.getDisplayedMessageContent,
      getCharNameById: ctx.getCharNameById,
      operationDetail: ctx.operationDetail,
      showPresetVars: ctx.showPresetVars,
      importFileInput: ctx.importFileInput,
      importAllData: ctx.commandImportAllData
    })
  })

  return {
    desktopState
  }
}
