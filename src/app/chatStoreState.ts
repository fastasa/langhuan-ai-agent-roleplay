import { computed, ref, type ComputedRef, type Ref } from 'vue'
import { storeToRefs } from 'pinia'
import type { ChatMessage, ChatSession, SmallSummary, Summary } from '../types'
import type { WorkspaceStreamingEvent } from '../types/workspace'
import { useCharacterStore } from '../stores/characterStore'
import { createChatCurrentState } from './chatCurrentState'
import { useWorkspaceRuntimeStore } from './workspaceRuntimeStore'
import {
  createChatTargetEntity,
  normalizeChatMessageForTarget,
  normalizeChatSession,
  normalizeChatTargetId
} from '../repositories/chatRepository'

export interface BigSummary {
  id: string
  name: string
  content: string
  merged_summary_ids: string[]
  created_at: string
  updated_at: string
}

export interface ChatArchiveRecord {
  id?: string
  name?: string
  targetId?: string
  createdAt?: string
  [key: string]: unknown
}

type ChatStoreState = {
  normalizeTargetId: (targetId: string) => string
  normalizeMessage: (message: ChatMessage) => ChatMessage
  normalizeMessageForTarget: (targetId: string, message: ChatMessage) => ChatMessage
  normalizeSession: (session: ChatSession) => ChatSession
  currentChatTarget: ComputedRef<string>
  workspaceCurrentTarget: ComputedRef<string>
  currentSession: ComputedRef<ChatSession | null>
  currentMessages: ComputedRef<ChatMessage[]>
  sessionMessagesCache: ComputedRef<Record<string, ChatMessage[]>>
  localStreamingMessages: ComputedRef<Record<string, ChatMessage[]>>
  pendingPersistedMessages: ComputedRef<Record<string, ChatMessage[]>>
  chatTargets: Ref<Record<string, ReturnType<typeof createChatTargetEntity>>>
  chatSessions: Ref<Record<string, ChatSession>>
  chatMessages: Ref<Record<string, ChatMessage[]>>
  summaryLibrary: Ref<Summary[]>
  summaryIdCounter: Ref<number>
  chatArchives: Ref<ChatArchiveRecord[]>
  smallSummaries: Ref<SmallSummary[]>
  bigSummaries: Ref<BigSummary[]>
  streamingJobs: ComputedRef<Array<WorkspaceStreamingEvent & { id: string }>>
  pendingMessageReconcileJobs: ComputedRef<Array<{ id: string; targetId: string; sessionId: string; messageId?: number; updatedAt: number }>>
  isGenerating: Ref<boolean>
  currentAbortController: Ref<AbortController | null>
  currentMessageModel: Ref<string>
  stopRequested: Ref<boolean>
  switchRequestSeqRef: Ref<number>
  /** 会话切换乐观跳转（2026-07-11）：正在切换中的目标 sessionId（空串=无切换在途），驱动消息区骨架屏。 */
  sessionSwitchLoadingId: Ref<string>
  setWorkspaceCurrentTarget: (targetId: string) => string
  setSmallSummaries: (nextSummaries: SmallSummary[]) => void
  setBigSummaries: (nextSummaries: BigSummary[]) => void
}

export function createChatStoreState(): ChatStoreState {
  function normalizeTargetId(targetId: string): string {
    return normalizeChatTargetId(targetId)
  }

  function normalizeMessage(message: ChatMessage): ChatMessage {
    return normalizeChatMessageForTarget('', message)
  }

  function normalizeMessageForTarget(targetId: string, message: ChatMessage): ChatMessage {
    const normalizedTargetId = normalizeTargetId(targetId)
    const charStore = useCharacterStore()
    const currentCharacter = charStore.getCharacter(normalizedTargetId)
    return normalizeChatMessageForTarget(normalizedTargetId, message, currentCharacter?.name || '')
  }

  function normalizeSession(session: ChatSession): ChatSession {
    return normalizeChatSession(session)
  }

  const currentState = createChatCurrentState({ normalizeTargetId })
  const workspaceRuntimeStore = useWorkspaceRuntimeStore()
  const workspaceRuntimeRefs = storeToRefs(workspaceRuntimeStore)
  const currentChatTarget = computed({
    get: () => currentState.currentChatTarget.value,
    set: (targetId: string) => {
      currentState.setCurrentChatTarget(targetId)
    }
  })
  const workspaceCurrentTarget = computed({
    get: () => currentState.workspaceCurrentTarget.value,
    set: (targetId: string) => {
      currentState.setWorkspaceCurrentTarget(targetId)
    }
  })
  const currentSession = computed({
    get: () => currentState.currentSession.value,
    set: (session: ChatSession | null) => {
      if (
        session
        && typeof session === 'object'
        && !('target_id' in session)
        && !('targetId' in session)
      ) {
        const sessionRecord = session as Record<string, unknown>
        const fallbackTargetId = normalizeTargetId(
          String((session as ChatSession).id || currentState.currentChatTarget.value || '')
        )
        currentState.setCurrentSession({
          ...sessionRecord,
          target_id: fallbackTargetId
        } as ChatSession)
        return
      }
      currentState.setCurrentSession(session)
    }
  })
  const currentMessages = computed({
    get: () => currentState.currentMessages.value,
    set: (messages: ChatMessage[]) => {
      currentState.setCurrentMessages(messages)
    }
  })
  const sessionMessagesCache = computed({
    get: () => currentState.sessionMessagesCache.value,
    set: (cache: Record<string, ChatMessage[]>) => {
      currentState.sessionMessagesCache.value = cache || {}
    }
  })
  const localStreamingMessages = computed({
    get: () => workspaceRuntimeRefs.localStreamingMessages.value,
    set: (cache: Record<string, ChatMessage[]>) => {
      workspaceRuntimeStore.replaceLocalStreamingMessages(cache || {})
    }
  })
  const pendingPersistedMessages = computed({
    get: () => workspaceRuntimeRefs.pendingPersistedMessages.value,
    set: (cache: Record<string, ChatMessage[]>) => {
      workspaceRuntimeStore.replacePendingPersistedMessages(cache || {})
    }
  })

  const chatTargets = ref<Record<string, ReturnType<typeof createChatTargetEntity>>>({})
  const chatSessions = ref<Record<string, ChatSession>>({})
  const chatMessages = ref<Record<string, ChatMessage[]>>({})

  const summaryLibrary = ref<Summary[]>([])
  const summaryIdCounter = ref(1)
  const chatArchives = ref<ChatArchiveRecord[]>([])
  const smallSummaries = ref<SmallSummary[]>([])
  const bigSummaries = ref<BigSummary[]>([])
  const switchRequestSeqRef = ref(0)
  const sessionSwitchLoadingId = ref('')

  function setSmallSummaries(nextSummaries: SmallSummary[]): void {
    smallSummaries.value = Array.isArray(nextSummaries) ? [...nextSummaries] : []
  }

  function setBigSummaries(nextSummaries: BigSummary[]): void {
    bigSummaries.value = Array.isArray(nextSummaries) ? [...nextSummaries] : []
  }

  return {
    normalizeTargetId,
    normalizeMessage,
    normalizeMessageForTarget,
    normalizeSession,
    currentChatTarget,
    workspaceCurrentTarget,
    currentSession,
    currentMessages,
    sessionMessagesCache,
    localStreamingMessages,
    pendingPersistedMessages,
    chatTargets,
    chatSessions,
    chatMessages,
    summaryLibrary,
    summaryIdCounter,
    chatArchives,
    smallSummaries,
    bigSummaries,
    streamingJobs: workspaceRuntimeRefs.streamingJobs,
    pendingMessageReconcileJobs: workspaceRuntimeRefs.pendingMessageReconcileJobs,
    isGenerating: workspaceRuntimeRefs.isGenerating,
    currentAbortController: workspaceRuntimeRefs.currentAbortController,
    currentMessageModel: workspaceRuntimeRefs.currentMessageModel,
    stopRequested: workspaceRuntimeRefs.stopRequested,
    switchRequestSeqRef,
    sessionSwitchLoadingId,
    setWorkspaceCurrentTarget: currentState.setWorkspaceCurrentTarget,
    setSmallSummaries,
    setBigSummaries
  }
}
