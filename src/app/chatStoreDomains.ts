import type { ChatMessage, ChatSession, SmallSummary, Summary } from '../types'
import type { ChatArchiveRecord, BigSummary } from './chatStoreState'

type MutableValue<T> = { value: T }

type CreateChatStoreDomainsDeps = {
  chatTargets: MutableValue<Record<string, any>>
  chatSessions: MutableValue<Record<string, ChatSession>>
  chatMessages: MutableValue<Record<string, ChatMessage[]>>
  currentChatTarget: MutableValue<string>
  workspaceCurrentTarget: MutableValue<string>
  currentSession: MutableValue<ChatSession | null>
  currentMessages: MutableValue<ChatMessage[]>
  sessionMessagesCache: MutableValue<Record<string, ChatMessage[]>>
  localStreamingMessages: MutableValue<Record<string, ChatMessage[]>>
  pendingPersistedMessages: MutableValue<Record<string, ChatMessage[]>>
  streamingJobs: MutableValue<any[]>
  pendingMessageReconcileJobs: MutableValue<any[]>
  isGenerating: MutableValue<boolean>
  isTyping: MutableValue<boolean>
  currentAbortController: MutableValue<AbortController | null>
  currentMessageModel: MutableValue<string>
  stopRequested: MutableValue<boolean>
  summaryLibrary: MutableValue<Summary[]>
  summaryIdCounter: MutableValue<number>
  summaryTags: MutableValue<any[]>
  chatArchives: MutableValue<ChatArchiveRecord[]>
  smallSummaries: MutableValue<SmallSummary[]>
  bigSummaries: MutableValue<BigSummary[]>
  getActiveTargetId: () => string
  getActiveSessionId: () => string
  getActiveSessionTargetId: () => string
  getWorkspaceCurrentTarget: () => string
  getCurrentSession: () => ChatSession | null
  getCurrentMessages: () => ChatMessage[]
  getDisplayMessages: (targetId?: string) => ChatMessage[]
  setWorkspaceCurrentTarget: (targetId: string) => string
  /** 会话切换乐观跳转（2026-07-11）：正在切换中的目标 sessionId（空串=无切换在途），驱动消息区骨架屏。 */
  sessionSwitchLoadingId: MutableValue<string>
}

export function createChatStoreDomains(deps: CreateChatStoreDomainsDeps) {
  return {
    entities: {
      chatTargets: deps.chatTargets,
      chatSessions: deps.chatSessions,
      chatMessages: deps.chatMessages
    },
    current: {
      currentChatTarget: deps.currentChatTarget,
      workspaceCurrentTarget: deps.workspaceCurrentTarget,
      currentSession: deps.currentSession,
      currentMessages: deps.currentMessages,
      getActiveTargetId: deps.getActiveTargetId,
      getActiveSessionId: deps.getActiveSessionId,
      getActiveSessionTargetId: deps.getActiveSessionTargetId,
      getWorkspaceCurrentTarget: deps.getWorkspaceCurrentTarget,
      getCurrentSession: deps.getCurrentSession,
      getCurrentMessages: deps.getCurrentMessages,
      getDisplayMessages: deps.getDisplayMessages,
      setWorkspaceCurrentTarget: deps.setWorkspaceCurrentTarget,
      sessionSwitchLoadingId: deps.sessionSwitchLoadingId
    },
    runtime: {
      sessionMessagesCache: deps.sessionMessagesCache,
      localStreamingMessages: deps.localStreamingMessages,
      pendingPersistedMessages: deps.pendingPersistedMessages,
      streamingJobs: deps.streamingJobs,
      pendingMessageReconcileJobs: deps.pendingMessageReconcileJobs,
      isGenerating: deps.isGenerating,
      isTyping: deps.isTyping,
      currentAbortController: deps.currentAbortController,
      currentMessageModel: deps.currentMessageModel,
      stopRequested: deps.stopRequested
    },
    summaries: {
      summaryLibrary: deps.summaryLibrary,
      summaryIdCounter: deps.summaryIdCounter,
      summaryTags: deps.summaryTags,
      chatArchives: deps.chatArchives,
      smallSummaries: deps.smallSummaries,
      bigSummaries: deps.bigSummaries
    }
  }
}
