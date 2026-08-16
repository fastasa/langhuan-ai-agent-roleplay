type CreateChatStoreExportsDeps = {
  chatDomains: any
  queryState: any
  runtimeState: any
  remoteActions: any
  summaryState: any
  generationState: any
  state: any
  applyServerSnapshot: (data: any) => Promise<void>
  clearChat: (targetId: string) => Promise<void>
  clearChatContext: (targetId: string, options?: {
    clearSessionTemporaryCharacters?: boolean
  }) => Promise<void>
  deleteSmallSummary: (id: string) => Promise<void>
  deleteBigSummary: (id: string) => Promise<void>
}

export function createChatStoreExports(deps: CreateChatStoreExportsDeps) {
  return {
    entities: deps.chatDomains.entities,
    current: deps.chatDomains.current,
    runtime: deps.chatDomains.runtime,
    summaries: deps.chatDomains.summaries,
    activeChatTargetId: deps.queryState.activeChatTargetId,
    activeChatSessionId: deps.queryState.activeChatSessionId,
    activeChatSessionTargetId: deps.queryState.activeChatSessionTargetId,
    summaryIdCounter: deps.state.summaryIdCounter,
    summaryTags: deps.summaryState.summaryTags,
    isGenerating: deps.state.isGenerating,
    isTyping: deps.generationState.isTyping,
    currentAbortController: deps.state.currentAbortController,
    currentMessageModel: deps.state.currentMessageModel,
    stopRequested: deps.state.stopRequested,
    applyServerSnapshot: deps.applyServerSnapshot,
    switchChat: deps.remoteActions.switchChat,
    switchSession: deps.remoteActions.switchSession,
    refreshSessionMeta: deps.remoteActions.refreshSessionMeta,
    loadOlderMessages: deps.remoteActions.loadOlderMessages,
    queuePendingPersistedMessage: deps.runtimeState.queuePendingPersistedMessage,
    flushPendingPersistedMessages: deps.runtimeState.flushPendingPersistedMessages,
    upsertLocalStreamingMessage: deps.runtimeState.upsertLocalStreamingMessage,
    removeLocalStreamingMessage: deps.runtimeState.removeLocalStreamingMessage,
    finalizeLocalStreamingMessage: deps.runtimeState.finalizeLocalStreamingMessage,
    clearLocalStreamingMessages: deps.runtimeState.clearLocalStreamingMessages,
    addMessage: deps.remoteActions.addMessage,
    editMessage: deps.remoteActions.editMessage,
    deleteMessage: deps.remoteActions.deleteMessage,
    clearMessages: deps.remoteActions.clearMessages,
    clearChat: deps.clearChat,
    clearChatContext: deps.clearChatContext,
    updateSession: deps.remoteActions.updateSession,
    renameSession: deps.remoteActions.renameSession,
    deleteSession: deps.remoteActions.deleteSession,
    deleteSessions: deps.remoteActions.deleteSessions,
    archiveSession: deps.remoteActions.archiveSession,
    addSummary: deps.remoteActions.addSummary,
    updateSummary: deps.remoteActions.updateSummary,
    deleteSummary: deps.remoteActions.deleteSummary,
    addSmallSummary: deps.remoteActions.addSmallSummary,
    updateSmallSummary: deps.remoteActions.updateSmallSummary,
    deleteSmallSummary: deps.deleteSmallSummary,
    addBigSummary: deps.remoteActions.addBigSummary,
    updateBigSummary: deps.remoteActions.updateBigSummary,
    deleteBigSummary: deps.deleteBigSummary,
    setSmallSummaries: deps.state.setSmallSummaries,
    setBigSummaries: deps.state.setBigSummaries,
    loadChatArchives: deps.remoteActions.loadArchives,
    startNewChat: deps.remoteActions.startNewChat,
    updateChatArchive: deps.remoteActions.updateArchive,
    deleteChatArchives: deps.remoteActions.removeArchives,
    loadChatArchiveIntoCurrentTarget: deps.remoteActions.loadArchiveIntoCurrentTarget,
    exportChatArchives: deps.remoteActions.exportArchives,
    importChatArchives: deps.remoteActions.importArchives,
    setTyping: deps.generationState.setTyping,
    setAbortController: deps.generationState.setAbortController,
    setCurrentMessageModel: deps.generationState.setCurrentMessageModel,
    shouldStop: deps.generationState.shouldStop,
    stopGeneration: deps.generationState.stopGeneration,
    clearStopRequest: deps.generationState.clearStopRequest,
    exportSummaries: deps.summaryState.exportSummaries,
    loadSummary: deps.summaryState.loadSummary,
    unloadSummary: deps.summaryState.unloadSummary,
    setWorkspaceCurrentTarget: deps.state.setWorkspaceCurrentTarget,
    getActiveTargetId: deps.queryState.getActiveTargetId,
    getActiveSessionId: deps.queryState.getActiveSessionId,
    getActiveSessionTargetId: deps.queryState.getActiveSessionTargetId,
    getLoadedSummaryIds: deps.summaryState.getLoadedSummaryIds,
    getDisplayMessages: deps.queryState.getDisplayMessages,
    getWorkspaceCurrentTarget: deps.queryState.getWorkspaceCurrentTarget,
    getSessionByTargetId: deps.queryState.getSessionByTargetId,
    getCurrentSession: deps.queryState.getCurrentSession,
    getCurrentMessages: deps.queryState.getCurrentMessages
  }
}
