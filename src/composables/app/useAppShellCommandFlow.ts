import { useAppShellChatDomain } from './useAppShellChatDomain'
import { useTransactionActions } from './useTransactionActions'
import { useTransactionConfirm } from './useTransactionConfirm'
import { useTransactionFlow } from './useTransactionFlow'
import { useTaskDispatch } from './useTaskDispatch'

export function useAppShellCommandFlow(ctx: any) {
  let getAIOptionsForTickets = (_targetId: string) => ({ presetName: '', model: '' })

  const chatDomain = useAppShellChatDomain({
    charStore: ctx.charStore,
    chatStore: ctx.chatStore,
    settingStore: ctx.settingStore,
    settingEnvironmentService: ctx.settingEnvironmentService,
    callAI: ctx.callAI,
    callAIWithTools: ctx.callAIWithTools,
    callAIStream: ctx.callAIStream,
    cleanAiPrefix: ctx.cleanAiPrefix,
    detectLocationChange: ctx.detectLocationChange,
    buildSystemPrompt: ctx.buildSystemPrompt,
    buildPromptMessages: ctx.buildPromptMessages,
    prepareAIRecall: ctx.prepareAIRecall,
    // 提调取料三件套接缝：与 prepareAIRecall 同源透传，漏传会让 chatDomain→sendPipeline 接缝为空（报「未注册取料接缝」）。
    buildTidiaoRetrievalContext: ctx.buildTidiaoRetrievalContext,
    // 轮级资料池填池接缝（批次3·3b-2）：同源透传，漏传则 chatDomain→sendPipeline 填池接缝为空（降级 docLibraryOnly）。
    fillRoundRecallPools: ctx.fillRoundRecallPools,
    toast: ctx.toast,
    openConfirmDialog: ctx.openConfirmDialog,
    currentMessages: ctx.currentMessages,
    currentScene: ctx.currentScene,
    currentAlias: ctx.currentAlias,
    streamingText: ctx.streamingText,
    currentStreamingSpeakerName: ctx.currentStreamingSpeakerName,
    currentStreamingTargetId: ctx.currentStreamingTargetId,
    environmentNarrationLoading: ctx.environmentNarrationLoading,
    plannedGroupSpeakers: ctx.plannedGroupSpeakers,
    getTargetName: ctx.getTargetName,
    scrollToBottom: ctx.scrollToBottom,
    switchChat: ctx.switchChat,
    chatInputText: ctx.chatInputText,
    plusMenuOpen: ctx.plusMenuOpen,
    atMenuOpen: ctx.atMenuOpen,
    mentionSelectedChars: ctx.mentionSelectedChars,
    mentionExcludedChars: ctx.mentionExcludedChars,
    takeImageAttachments: ctx.takeImageAttachments,
    filteredAtCharacters: ctx.filteredAtCharacters
  })
  getAIOptionsForTickets = chatDomain.getAIOptions

  const transactionFlow = useTransactionFlow({
    workspaceRuntimeStore: ctx.workspaceRuntimeStore,
    resourceStore: ctx.resourceStore,
    timerComposable: ctx.timerComposable,
    addResourceEventToStack: ctx.addResourceEventToStack,
    chatStore: ctx.chatStore,
    charStore: ctx.charStore,
    settingStore: ctx.settingStore,
    toast: ctx.toast,
    submitTask: ctx.submitTask,
    failTaskConfirm: ctx.failTaskConfirm,
    buildSystemPrompt: ctx.buildSystemPrompt,
    getAIOptions: chatDomain.getAIOptions,
    callAIStream: ctx.callAIStream,
    transactionExecuting: ctx.transactionExecuting
  })

  const transactionActions = useTransactionActions({
    taskStore: ctx.taskStore,
    stageTransaction: transactionFlow.stageTransaction
  })

  const transactionConfirm = useTransactionConfirm({
    workspaceRuntimeStore: ctx.workspaceRuntimeStore,
    confirmTransactions: transactionFlow.confirmTransactions
  })

  const taskDispatch = useTaskDispatch({
    taskAssignerChar: ctx.taskAssignerChar,
    taskLoadContact: ctx.taskLoadContact,
    isRequestingTask: ctx.isRequestingTask,
    currentTaskTab: ctx.currentTaskTab,
    charStore: ctx.charStore,
    settingStore: ctx.settingStore,
    taskStore: ctx.taskStore,
    chatStore: ctx.chatStore,
    buildSystemPrompt: ctx.buildSystemPrompt,
    callAI: ctx.callAI,
    toast: ctx.toast
  })

  return {
    ...chatDomain,
    ...transactionFlow,
    ...transactionActions,
    ...transactionConfirm,
    ...taskDispatch,
    getAIOptionsForTickets
  }
}
