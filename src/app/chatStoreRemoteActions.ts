import { createChatStoreArchiveRemoteActions } from './chatStoreArchiveRemoteActions'
import { createChatStoreMessageRemoteActions } from './chatStoreMessageRemoteActions'
import { createChatStoreSummaryRemoteActions } from './chatStoreSummaryRemoteActions'
import type { ChatStoreRemoteActionDeps } from './chatStoreRemoteActionTypes'

export function createChatStoreRemoteActions(deps: ChatStoreRemoteActionDeps) {
  const messageActions = createChatStoreMessageRemoteActions(deps)
  const archiveActions = createChatStoreArchiveRemoteActions({
    ...deps,
    switchChat: messageActions.switchChat,
    startNewChat: messageActions.startNewChat
  })
  const summaryActions = createChatStoreSummaryRemoteActions(deps)

  return {
    switchChat: messageActions.switchChat,
    switchSession: messageActions.switchSession,
    refreshSessionMeta: messageActions.refreshSessionMeta,
    loadOlderMessages: messageActions.loadOlderMessages,
    addMessage: messageActions.addMessage,
    editMessage: messageActions.editMessage,
    deleteMessage: messageActions.deleteMessage,
    clearMessages: messageActions.clearMessages,
    clearSessionContext: messageActions.clearSessionContext,
    updateSession: messageActions.updateSession,
    renameSession: messageActions.renameSession,
    deleteSession: messageActions.deleteSession,
    deleteSessions: messageActions.deleteSessions,
    archiveSession: messageActions.archiveSession,
    addSummary: summaryActions.addSummary,
    updateSummary: summaryActions.updateSummary,
    deleteSummary: summaryActions.deleteSummary,
    addSmallSummary: summaryActions.addSmallSummary,
    updateSmallSummary: summaryActions.updateSmallSummary,
    deleteSmallSummary: summaryActions.deleteSmallSummary,
    addBigSummary: summaryActions.addBigSummary,
    updateBigSummary: summaryActions.updateBigSummary,
    deleteBigSummary: summaryActions.deleteBigSummary,
    loadArchives: archiveActions.loadArchives,
    startNewChat: archiveActions.startNewChat,
    updateArchive: archiveActions.updateArchive,
    removeArchives: archiveActions.removeArchives,
    loadArchiveIntoCurrentTarget: archiveActions.loadArchiveIntoCurrentTarget,
    exportArchives: archiveActions.exportArchives,
    importArchives: archiveActions.importArchives
  }
}
