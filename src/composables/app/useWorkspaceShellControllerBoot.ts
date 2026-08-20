import { useResourceStore } from '../../stores/resourceStore'
import { useCharacterStore } from '../../stores/characterStore'
import { useChatStore } from '../../stores/chatStore'
import { useSettingStore } from '../../stores/settingStore'
import { useTaskStore } from '../../stores/taskStore'
import { storeToRefs } from 'pinia'
import { useAI } from '../useAI'
import { useTimer, timerEventEmitter } from '../useTimer'
import { useLocalArchiveSync } from '../useLocalArchiveSync'
import { useToast } from '../useToast'
import { useChatUiState } from './useChatUiState'
import { useUiHelpers } from './useUiHelpers'
import { useTaskTimelineHelpers } from './useTaskTimelineHelpers'
import { useAppState } from './useAppState'
import { useAppSmallHelpers } from './useAppSmallHelpers'
import { useAppShellSupport } from './useAppShellSupport'
import { useWorkspaceRuntime } from './useWorkspaceRuntime'
import { useEnvironmentOps } from './useEnvironmentOps'
import { buildEnvironmentOpsContext } from './useAppShellAssemblers'
import { logger } from '../../utils/logger'
import { useWorkspaceRuntimeStore } from '../../app/workspaceRuntimeStore'
import { createSettingEnvironmentService } from '../../app/settingEnvironmentService'

export function useWorkspaceShellControllerBoot() {
  const resourceStore = useResourceStore()
  const charStore = useCharacterStore()
  const chatStore = useChatStore()
  const settingStore = useSettingStore()
  const taskStore = useTaskStore()

  const { callAI, callAIWithTools, callAIStream, cleanAiPrefix, detectLocationChange, buildSystemPrompt, buildPromptMessages, prepareAIRecall, buildTidiaoRetrievalContext, fillRoundRecallPools } = useAI()
  const timerComposable = useTimer()
  const localArchiveSync = useLocalArchiveSync()

  const runtimeFeedbackStore = useWorkspaceRuntimeStore()
  const { toastVisible, toastMessage, toastType, toast } = useToast(runtimeFeedbackStore)
  const appState = useAppState({ localArchiveSync })

  const shellSupport = useAppShellSupport({ chatStore })

  const workspaceRuntime = useWorkspaceRuntime({
    resourceStore,
    charStore,
    chatStore,
    settingStore,
    taskStore,
    timerComposable,
    customTags: appState.customTags,
    eventStack: appState.eventStack,
    streamingText: shellSupport.streamingText,
    currentStreamingSpeakerName: shellSupport.currentStreamingSpeakerName
  })

  const uiHelpers = useUiHelpers({
    charStore,
    collapsedGroups: shellSupport.collapsedGroups,
    chatStore,
    streamingText: shellSupport.streamingText,
    showConfirmDialog: appState.showConfirmDialog,
    confirmDialog: appState.confirmDialog,
    showPromptDialog: appState.showPromptDialog,
    promptDialog: appState.promptDialog,
    showChatTransferDialog: appState.showChatTransferDialog,
    chatTransferDialog: appState.chatTransferDialog,
    timerEventEmitter,
    workspaceRuntimeStore: workspaceRuntime.workspaceRuntimeStore
  })

  const chatUiState = useChatUiState({
    charStore,
    chatStore,
    // 图片附件 caption 依赖（批4）：与 chatInputText 同层实例化，agentConfig/callAI 同源于本函数顶部 useAI()。
    settingStore,
    callAI,
    toast,
    openConfirmDialog: uiHelpers.openConfirmDialog,
    openClearChatContextDialog: (onConfirm) => {
      appState.clearChatContextDialog.clearSessionTemporaryCharacters = false
      appState.clearChatContextDialog.onConfirm = onConfirm
      appState.showClearChatContextDialog.value = true
    }
  })

  const taskTimelineHelpers = useTaskTimelineHelpers({
    taskStore,
    customTags: appState.customTags
  })

  const appSmallHelpers = useAppSmallHelpers({
    settingStore
  })
  const settingStoreRefs = storeToRefs(settingStore)

  const settingEnvironmentService = createSettingEnvironmentService({
    store: settingStore,
    refs: {
      apiPresets: settingStoreRefs.apiPresets,
      defaultPreset: settingStoreRefs.defaultPreset,
      aiProviderMode: settingStoreRefs.aiProviderMode,
      promptPresets: settingStoreRefs.promptPresets,
      currentTime: settingStoreRefs.currentTime,
      currentWeather: settingStoreRefs.currentWeather,
      currentLocation: settingStoreRefs.currentLocation,
      weatherDetail: settingStoreRefs.weatherDetail,
      locationHistory: settingStoreRefs.locationHistory,
      weatherHistory: settingStoreRefs.weatherHistory,
      darkMode: settingStoreRefs.darkMode,
      aiEvaluationEnabled: settingStoreRefs.aiEvaluationEnabled,
      summaryPrompt: settingStoreRefs.summaryPrompt,
      bigSummaryPrompt: settingStoreRefs.bigSummaryPrompt,
      dailyReportPrompt: settingStoreRefs.dailyReportPrompt,
      chatSummaryPresetName: settingStoreRefs.chatSummaryPresetName,
      chatSummaryModel: settingStoreRefs.chatSummaryModel,
      agentModelConfigs: settingStoreRefs.agentModelConfigs
    }
  })

  const environmentOps = useEnvironmentOps(buildEnvironmentOpsContext({
    settingStore,
    settingEnvironmentService,
    isLoadingLocation: appState.isLoadingLocation,
    isLoadingWeather: appState.isLoadingWeather,
    editingLocation: appState.editingLocation,
    tempLocation: appState.tempLocation,
    weatherApiKey: appState.weatherApiKey,
    weatherApiDomain: appState.weatherApiDomain,
    toast,
    logger
  }))

  return {
    resourceStore,
    charStore,
    chatStore,
    settingStore,
    taskStore,
    callAI,
    callAIWithTools,
    callAIStream,
    cleanAiPrefix,
    detectLocationChange,
    buildSystemPrompt,
    buildPromptMessages,
    prepareAIRecall,
    buildTidiaoRetrievalContext,
    fillRoundRecallPools,
    timerComposable,
    localArchiveSync,
    toastVisible,
    toastMessage,
    toastType,
    toast,
    appState,
    chatUiState,
    shellSupport,
    workspaceRuntime,
    uiHelpers,
    taskTimelineHelpers,
    appSmallHelpers,
    settingEnvironmentService,
    environmentOps
  }
}
