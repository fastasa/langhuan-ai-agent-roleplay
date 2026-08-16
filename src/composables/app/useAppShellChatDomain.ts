import { createChatManageModalState } from './modalState/createChatManageModalState'
import { useChatMessageOps } from './useChatMessageOps'
import { useChatSummaryManager } from './useChatSummaryManager'
import { useChatSendPipeline } from './useChatSendPipeline'

export function useAppShellChatDomain(deps: any) {
  let replayGroupChatFromMessageOps: ((targetId: string, userText: string) => Promise<void>) | null = null
  let replayExistingUserMessageFromMessageOps: ((text: string, inputMessageId?: number, options?: { parentAttemptId?: string; replacedMessageIds?: number[] }) => Promise<unknown>) | null = null
  // 批次 M1a：单聊角色消息重试走导演 loop（晚绑定，sendPipeline 创建后再接，仿 resendUserMessage）。
  let regenerateAssistantViaDirectorFromMessageOps: ((messageId: number, options?: { instruction?: string; correctionText?: string }) => Promise<{ replyText: string; model: string; promptLogId: string; directorStream: import('../../app/tidiaoDirectorStream').TidiaoDirectorStream | null } | null>) | null = null
  // 批次2 步骤2b：定向重掷轻量重试（晚绑定）。
  let regenerateAssistantViaDirectedRecastFromMessageOps: ((messageId: number) => Promise<{ status: 'recast'; replyText: string; model: string; promptLogId: string } | { status: 'softstop' | 'unavailable' }>) | null = null
  let regenerateFocusedActionFromMessageOps: ((messageId: number) => Promise<boolean>) | null = null
  // 批次 M3：提调式锚定精修（晚绑定）。
  let editChatMessagesViaDirectorFromMessageOps: ((refsText: string, options?: { correctionText?: string; anchorMessageId?: number }) => Promise<{ edits: Array<{ messageId: number; ref: string; speakerName: string; content: string }>; directorStream?: import('../../app/tidiaoDirectorStream').TidiaoDirectorStream | null; anchorAssistantMessageId?: number } | null>) | null = null
  // 批次 P3a：纠偏三策统一 loop（晚绑定）。
  let correctChatMessageViaDirectorFromMessageOps: ((targetMessageId: number, options?: { correctionText?: string; anchorMessageId?: number; userInstruction?: string }) => Promise<{ strategy: 'direct-edit' | 'prompt-regen' | 'escalate' | 'create-narration' | 'create-cast' | 'ask-user' | 'chat-only' | 'resume-orchestration'; edits: Array<{ messageId: number; ref: string; speakerName: string; content: string }>; regenerations: Array<{ messageId: number; ref: string; speakerName: string; content: string; promptLogId: string }>; escalation: { reason: string } | null; narrationCreations: Array<{ messageId: number; content: string; profileName: string }>; castCreations?: Array<{ speakerName: string; ok: boolean; message?: string }>; directorStream?: import('../../app/tidiaoDirectorStream').TidiaoDirectorStream | null; anchorAssistantMessageId?: number; escalationHandledInline?: boolean; resumeHandledInline?: boolean } | null>) | null = null
  // 批次1(D)：续接读回「用户原始纠偏指令」（晚绑定，pipeline 创建后再接）。
  let resolveDirectorOriginalInstructionFromMessageOps: ((messageId: number) => Promise<string>) | null = null

  const messageOps = useChatMessageOps({
    charStore: deps.charStore,
    chatStore: deps.chatStore,
    settingStore: deps.settingStore,
    settingEnvironmentService: deps.settingEnvironmentService,
    callAI: deps.callAI,
    callAIStream: deps.callAIStream,
    cleanAiPrefix: deps.cleanAiPrefix,
    buildSystemPrompt: deps.buildSystemPrompt,
    buildPromptMessages: deps.buildPromptMessages,
    toast: deps.toast,
    openConfirmDialog: deps.openConfirmDialog,
    currentMessages: deps.currentMessages,
    currentScene: deps.currentScene,
    streamingText: deps.streamingText,
    getTargetName: deps.getTargetName,
    scrollToBottom: deps.scrollToBottom,
    runGroupChatReplay: async (targetId: string, userText: string) => {
      if (!replayGroupChatFromMessageOps) {
        throw new Error('group chat replay is not initialized')
      }
      await replayGroupChatFromMessageOps(targetId, userText)
    },
    resendUserMessage: async (text: string, inputMessageId?: number, options?: { parentAttemptId?: string; replacedMessageIds?: number[] }) => {
      if (!replayExistingUserMessageFromMessageOps) {
        throw new Error('user message replay is not initialized')
      }
      return await replayExistingUserMessageFromMessageOps(text, inputMessageId, options)
    },
    regenerateAssistantViaDirector: async (messageId: number, options?: { instruction?: string; correctionText?: string }) => {
      if (!regenerateAssistantViaDirectorFromMessageOps) {
        throw new Error('director retry is not initialized')
      }
      return await regenerateAssistantViaDirectorFromMessageOps(messageId, options)
    },
    regenerateAssistantViaDirectedRecast: async (messageId: number) => {
      if (!regenerateAssistantViaDirectedRecastFromMessageOps) {
        return { status: 'unavailable' as const }
      }
      return await regenerateAssistantViaDirectedRecastFromMessageOps(messageId)
    },
    regenerateFocusedAction: async (messageId: number) => {
      if (!regenerateFocusedActionFromMessageOps) throw new Error('focused action retry is not initialized')
      return await regenerateFocusedActionFromMessageOps(messageId)
    },
    editChatMessagesViaDirector: async (refsText: string, options?: { correctionText?: string; anchorMessageId?: number }) => {
      if (!editChatMessagesViaDirectorFromMessageOps) {
        throw new Error('director precision edit is not initialized')
      }
      return await editChatMessagesViaDirectorFromMessageOps(refsText, options)
    },
    correctChatMessageViaDirector: async (targetMessageId: number, options?: { correctionText?: string; anchorMessageId?: number; userInstruction?: string }) => {
      if (!correctChatMessageViaDirectorFromMessageOps) {
        throw new Error('director correction is not initialized')
      }
      return await correctChatMessageViaDirectorFromMessageOps(targetMessageId, options)
    },
    resolveDirectorOriginalInstruction: async (messageId: number) => {
      if (!resolveDirectorOriginalInstructionFromMessageOps) return ''
      return await resolveDirectorOriginalInstructionFromMessageOps(messageId)
    },
    prepareAIRecall: deps.prepareAIRecall
  })

  const summaryManager = useChatSummaryManager({
    chatStore: deps.chatStore,
    charStore: deps.charStore,
    settingStore: deps.settingStore,
    currentMessages: deps.currentMessages,
    callAI: deps.callAI,
    getAIOptions: messageOps.getAIOptions
  })

  const chatManageModalState = createChatManageModalState({
    currentMessages: deps.currentMessages,
    showSummaryList: summaryManager.showSummaryList,
    chatStore: deps.chatStore,
    editSummaryItem: summaryManager.editSummaryItem,
    showSummaryEditor: summaryManager.showSummaryEditor,
    summaryEditForm: summaryManager.summaryEditForm,
    saveSummaryEdit: summaryManager.saveSummaryEdit,
    showConversationManager: summaryManager.showConversationManager,
    allChatTargets: summaryManager.allChatTargets,
    switchChat: deps.switchChat,
    getTargetName: deps.getTargetName,
    showSlotManager: summaryManager.showSlotManager,
    isSummaryLoaded: summaryManager.isSummaryLoaded,
    toggleSummarySlot: summaryManager.toggleSummarySlot,
    syncSummaryAiOptions: summaryManager.syncSummaryAiOptions
  })

  const sendPipeline = useChatSendPipeline({
    charStore: deps.charStore,
    chatStore: deps.chatStore,
    settingStore: deps.settingStore,
    settingEnvironmentService: deps.settingEnvironmentService,
    chatInputText: deps.chatInputText,
    plusMenuOpen: deps.plusMenuOpen,
    atMenuOpen: deps.atMenuOpen,
    mentionSelectedChars: deps.mentionSelectedChars,
    mentionExcludedChars: deps.mentionExcludedChars,
    takeImageAttachments: deps.takeImageAttachments,
    filteredAtCharacters: deps.filteredAtCharacters,
    currentAlias: deps.currentAlias,
    streamingText: deps.streamingText,
    currentStreamingSpeakerName: deps.currentStreamingSpeakerName,
    currentStreamingTargetId: deps.currentStreamingTargetId,
    environmentNarrationLoading: deps.environmentNarrationLoading,
    plannedGroupSpeakers: deps.plannedGroupSpeakers,
    buildChatMessages: messageOps.buildChatMessages,
    buildPromptMessages: deps.buildPromptMessages,
    prepareAIRecall: deps.prepareAIRecall,
    buildTidiaoRetrievalContext: deps.buildTidiaoRetrievalContext,
    fillRoundRecallPools: deps.fillRoundRecallPools,
    getAIOptions: messageOps.getAIOptions,
    callAI: deps.callAI,
    callAIWithTools: deps.callAIWithTools,
    callAIStream: deps.callAIStream,
    cleanAiPrefix: deps.cleanAiPrefix,
    getTargetName: deps.getTargetName,
    scrollToBottom: deps.scrollToBottom,
    toast: deps.toast,
    runtimeStore: deps.workspaceRuntimeStore,
    canSeeNarrationDebug: deps.canSeeNarrationDebug
  })

  // 批次4-投影 灰度开关·真机对照控制台入口（增量5·2026-07-02 已翻默认 ON·退役后续删本块）：
  //（unifiedSingleChat / directedRecast / recallPool 均已转正退役；下列开关单聊/群聊同口径生效。）
  // DevTools 控制台：__langhuanChatFlags.directorProjection(false) 可临时关「协议优先投影 + 下发分镜投影上下文」作真机对照；
  //   层3·对话可见历史已无条件走投影可见壳、不受本开关左右。传 true/省略=开；status() 看当前态。
  if (typeof window !== 'undefined') {
    (window as Window & { __langhuanChatFlags?: Record<string, (on?: boolean) => string> }).__langhuanChatFlags = {
      // 增量5 后本开关只管 grounding/决策 step1「默认读投影、原文仅按需」+ 投影态上下文下发各分镜（默认 ON）。
      directorProjection: (on = true) => { sendPipeline.setDirectorProjectionContext(on); return `directorProjectionContext=${on}（刷新后仍生效；层3投影历史不受此开关影响）` },
      // 批次D（2026-07-02·默认 ON）：群聊统筹 loop 每 turn 重建 0-6 prompt（层5=结构化操作日志）；显式 OFF=回 append-only 真机对照。
      directorPromptRebuild: (on = true) => { sendPipeline.setDirectorPromptRebuild(on); return `directorPromptRebuild=${on}（刷新后仍生效；OFF=统筹 loop 回 raw transcript 原样转发）` },
      status: () => {
        try {
          const raw = window.localStorage.getItem('langhuan_chat_gray_flags_v1')
          return raw || '{}（全部默认关）'
        } catch {
          return '读取失败'
        }
      }
    }
  }

  replayGroupChatFromMessageOps = sendPipeline.runGroupChat
  replayExistingUserMessageFromMessageOps = async (text: string, inputMessageId?: number, options?: { parentAttemptId?: string; replacedMessageIds?: number[] }) => {
    return await sendPipeline.replayUserMessage(text, inputMessageId, options)
  }
  regenerateAssistantViaDirectorFromMessageOps = async (messageId: number, options?: { instruction?: string; correctionText?: string }) => {
    return await sendPipeline.regenerateAssistantViaDirector(messageId, options)
  }
  regenerateAssistantViaDirectedRecastFromMessageOps = async (messageId: number) => {
    return await sendPipeline.regenerateAssistantViaDirectedRecast(messageId)
  }
  regenerateFocusedActionFromMessageOps = async (messageId: number) => {
    return await sendPipeline.regenerateFocusedActionViaTidiao(messageId)
  }
  editChatMessagesViaDirectorFromMessageOps = async (refsText: string, options?: { correctionText?: string; anchorMessageId?: number }) => {
    return await sendPipeline.editChatMessagesViaDirector(refsText, options)
  }
  correctChatMessageViaDirectorFromMessageOps = async (targetMessageId: number, options?: { correctionText?: string; anchorMessageId?: number; userInstruction?: string }) => {
    return await sendPipeline.correctChatMessageViaDirector(targetMessageId, options)
  }
  resolveDirectorOriginalInstructionFromMessageOps = async (messageId: number) => {
    return await sendPipeline.resolveMessageDirectorOriginalInstruction(messageId)
  }

  return {
    ...messageOps,
    ...summaryManager,
    ...sendPipeline,
    chatManageModalState
  }
}
