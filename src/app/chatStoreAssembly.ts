import { createChatEntityState } from './chatEntityState'
import { createChatGenerationState } from './chatGenerationState'
import { createChatQueryState } from './chatQueryState'
import { createChatRuntimeState } from './chatRuntimeState'
import { createChatSnapshotApplier } from './chatSnapshotApplier'
import { createChatStoreCommandFacade } from './chatStoreCommandFacade'
import { createChatStoreDomains } from './chatStoreDomains'
import { createChatStoreExports } from './chatStoreExports'
import { createChatStoreLoader } from './chatStoreLoader'
import { createChatStoreRemoteActions } from './chatStoreRemoteActions'
import { createChatStoreState } from './chatStoreState'
import { createChatSummaryState } from './chatSummaryState'
import { resolveChatSessionTargetId } from '../repositories/chatRepository'

export function createChatStoreAssembly() {
  const state = createChatStoreState()
  const entityState = createChatEntityState({
    sessionMessagesCache: state.sessionMessagesCache,
    chatTargets: state.chatTargets,
    chatSessions: state.chatSessions,
    chatMessages: state.chatMessages,
    normalizeTargetId: state.normalizeTargetId,
    normalizeSession: state.normalizeSession,
    normalizeMessageForTarget: state.normalizeMessageForTarget
  })
  const queryState = createChatQueryState({
    currentChatTarget: state.currentChatTarget,
    workspaceCurrentTarget: state.workspaceCurrentTarget,
    currentSession: state.currentSession,
    sessionMessagesCache: state.sessionMessagesCache,
    pendingPersistedMessages: state.pendingPersistedMessages,
    localStreamingMessages: state.localStreamingMessages,
    chatSessions: state.chatSessions,
    normalizeTargetId: state.normalizeTargetId,
    normalizeMessageForTarget: state.normalizeMessageForTarget
  })

  const applyChatSnapshot = createChatSnapshotApplier({
    summaryLibrary: state.summaryLibrary,
    smallSummaries: state.smallSummaries,
    bigSummaries: state.bigSummaries,
    chatArchives: state.chatArchives,
    currentChatTarget: state.currentChatTarget,
    workspaceCurrentTarget: state.workspaceCurrentTarget,
    currentSession: state.currentSession,
    currentMessages: state.currentMessages,
    sessionMessagesCache: state.sessionMessagesCache,
    chatTargets: state.chatTargets,
    chatSessions: state.chatSessions,
    chatMessages: state.chatMessages,
    normalizeTargetId: state.normalizeTargetId,
    normalizeMessageForTarget: state.normalizeMessageForTarget,
    normalizeSession: state.normalizeSession,
    setWorkspaceCurrentTarget: state.setWorkspaceCurrentTarget,
    buildDisplayMessages: queryState.buildDisplayMessages
  })

  entityState.ensureContainers()

  const loader = createChatStoreLoader({ applyChatSnapshot })

  const runtimeState = createChatRuntimeState({
    currentChatTarget: state.currentChatTarget,
    currentSession: state.currentSession,
    currentMessages: state.currentMessages,
    sessionMessagesCache: state.sessionMessagesCache,
    pendingPersistedMessages: state.pendingPersistedMessages,
    localStreamingMessages: state.localStreamingMessages,
    chatMessages: state.chatMessages,
    normalizeTargetId: state.normalizeTargetId,
    resolveSessionTargetId: resolveChatSessionTargetId,
    normalizeMessage: state.normalizeMessage,
    normalizeMessageForTarget: state.normalizeMessageForTarget,
    buildDisplayMessages: queryState.buildDisplayMessages
  })

  const remoteActions = createChatStoreRemoteActions({
    currentChatTarget: state.currentChatTarget,
    currentSession: state.currentSession,
    currentMessages: state.currentMessages,
    sessionMessagesCache: state.sessionMessagesCache,
    pendingPersistedMessages: state.pendingPersistedMessages,
    localStreamingMessages: state.localStreamingMessages,
    chatTargets: state.chatTargets,
    chatSessions: state.chatSessions,
    chatMessages: state.chatMessages,
    summaryLibrary: state.summaryLibrary,
    smallSummaries: state.smallSummaries,
    bigSummaries: state.bigSummaries,
    chatArchives: state.chatArchives,
    normalizeTargetId: state.normalizeTargetId,
    normalizeMessage: state.normalizeMessage,
    normalizeMessageForTarget: state.normalizeMessageForTarget,
    normalizeSession: state.normalizeSession,
    refreshCurrentMessages: runtimeState.refreshCurrentMessages,
    upsertCachedMessage: runtimeState.upsertCachedMessage,
    removeCachedMessage: runtimeState.removeCachedMessage,
    getCachedMessages: runtimeState.getCachedMessages,
    buildDisplayMessages: queryState.buildDisplayMessages,
    setWorkspaceCurrentTarget: state.setWorkspaceCurrentTarget,
    flushPendingPersistedMessages: runtimeState.flushPendingPersistedMessages,
    switchRequestSeqRef: state.switchRequestSeqRef,
    sessionSwitchLoadingId: state.sessionSwitchLoadingId
  })

  const summaryState = createChatSummaryState({
    summaryLibrary: state.summaryLibrary,
    summaryIdCounter: state.summaryIdCounter,
    currentSession: state.currentSession,
    currentChatTarget: state.currentChatTarget,
    getCurrentSession: queryState.getCurrentSession,
    getActiveTargetId: queryState.getActiveTargetId,
    updateSession: remoteActions.updateSession
  })

  const generationState = createChatGenerationState({
    isGenerating: state.isGenerating,
    currentAbortController: state.currentAbortController,
    currentMessageModel: state.currentMessageModel,
    stopRequested: state.stopRequested,
    clearLocalStreamingMessages: runtimeState.clearLocalStreamingMessages
  })

  const chatDomains = createChatStoreDomains({
    chatTargets: state.chatTargets,
    chatSessions: state.chatSessions,
    chatMessages: state.chatMessages,
    currentChatTarget: state.currentChatTarget,
    workspaceCurrentTarget: state.workspaceCurrentTarget,
    currentSession: state.currentSession,
    currentMessages: state.currentMessages,
    sessionMessagesCache: state.sessionMessagesCache,
    localStreamingMessages: state.localStreamingMessages,
    pendingPersistedMessages: state.pendingPersistedMessages,
    streamingJobs: state.streamingJobs,
    pendingMessageReconcileJobs: state.pendingMessageReconcileJobs,
    isGenerating: state.isGenerating,
    isTyping: generationState.isTyping,
    currentAbortController: state.currentAbortController,
    currentMessageModel: state.currentMessageModel,
    stopRequested: state.stopRequested,
    summaryLibrary: state.summaryLibrary,
    summaryIdCounter: state.summaryIdCounter,
    summaryTags: summaryState.summaryTags,
    chatArchives: state.chatArchives,
    smallSummaries: state.smallSummaries,
    bigSummaries: state.bigSummaries,
    getActiveTargetId: queryState.getActiveTargetId,
    getActiveSessionId: queryState.getActiveSessionId,
    getActiveSessionTargetId: queryState.getActiveSessionTargetId,
    getWorkspaceCurrentTarget: queryState.getWorkspaceCurrentTarget,
    getCurrentSession: queryState.getCurrentSession,
    getCurrentMessages: queryState.getCurrentMessages,
    getDisplayMessages: queryState.getDisplayMessages,
    setWorkspaceCurrentTarget: state.setWorkspaceCurrentTarget,
    sessionSwitchLoadingId: state.sessionSwitchLoadingId
  })

  const commandFacade = createChatStoreCommandFacade({
    remoteActions,
    summaryState
  })

  return createChatStoreExports({
    chatDomains,
    queryState,
    runtimeState,
    remoteActions,
    summaryState,
    generationState,
    state,
    applyServerSnapshot: loader.applyServerSnapshot,
    clearChat: commandFacade.clearChat,
    clearChatContext: commandFacade.clearChatContext,
    deleteSmallSummary: commandFacade.deleteSmallSummary,
    deleteBigSummary: commandFacade.deleteBigSummary
  })
}
