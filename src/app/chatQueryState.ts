import { computed } from 'vue'
import { resolveChatSessionTargetId } from '../repositories/chatRepository'
import { buildChatDisplayMessages, resolveChatSessionByTargetId } from './chatCurrentState'

type MutableValue<T> = { value: T }

type ChatQueryStateDeps = {
  currentChatTarget: MutableValue<string>
  workspaceCurrentTarget: MutableValue<string>
  currentSession: MutableValue<any>
  sessionMessagesCache: MutableValue<Record<string, any[]>>
  pendingPersistedMessages: MutableValue<Record<string, any[]>>
  localStreamingMessages: MutableValue<Record<string, any[]>>
  chatSessions: MutableValue<Record<string, any>>
  normalizeTargetId: (targetId: string) => string
  normalizeMessageForTarget: (targetId: string, message: any) => any
}

export function createChatQueryState(deps: ChatQueryStateDeps) {
  const activeChatTargetId = computed(() => deps.normalizeTargetId(deps.currentChatTarget.value))

  const activeChatSessionId = computed(() => {
    return String(deps.currentSession.value?.id || '')
  })

  const activeChatSessionTargetId = computed(() => {
    const sessionTargetId = resolveChatSessionTargetId(deps.currentSession.value)
    return deps.normalizeTargetId(sessionTargetId || activeChatTargetId.value)
  })

  function getWorkspaceCurrentTarget(): string {
    return deps.normalizeTargetId(deps.workspaceCurrentTarget.value || deps.currentChatTarget.value)
  }

  function getSessionByTargetId(targetId?: string): any | null {
    return resolveChatSessionByTargetId({
      targetId,
      currentChatTarget: deps.currentChatTarget.value,
      workspaceCurrentTarget: deps.workspaceCurrentTarget.value,
      currentSession: deps.currentSession.value,
      chatSessions: deps.chatSessions.value,
      normalizeTargetId: deps.normalizeTargetId
    })
  }

  function getCurrentSession(): any | null {
    return deps.currentSession.value || null
  }

  function resolveDisplaySession(targetId?: string): any | null {
    const requestedTargetId = deps.normalizeTargetId(String(targetId || ''))
    const currentSession = deps.currentSession.value
    if (!requestedTargetId) return currentSession || null
    if (deps.normalizeTargetId(resolveChatSessionTargetId(currentSession)) === requestedTargetId) {
      return currentSession
    }
    return getSessionByTargetId(requestedTargetId)
  }

  function buildDisplayMessages(targetId: string, sessionId?: string): any[] {
    const session = sessionId ? deps.chatSessions.value?.[sessionId] : resolveDisplaySession(targetId)
    const resolvedSessionId = String(sessionId || session?.id || '').trim()
    const resolvedTargetId = deps.normalizeTargetId(resolveChatSessionTargetId(session) || targetId)
    return buildChatDisplayMessages({
      targetId: resolvedTargetId,
      sessionId: resolvedSessionId,
      sessionMessagesCache: deps.sessionMessagesCache.value,
      pendingPersistedMessages: deps.pendingPersistedMessages.value,
      localStreamingMessages: deps.localStreamingMessages.value,
      normalizeTargetId: deps.normalizeTargetId,
      normalizeMessageForTarget: deps.normalizeMessageForTarget
    })
  }

  function getDisplayMessages(targetId?: string): any[] {
    const resolvedTargetId = deps.normalizeTargetId(targetId || activeChatTargetId.value)
    if (!resolvedTargetId) return []
    return buildDisplayMessages(resolvedTargetId)
  }

  function getCurrentMessages(): any[] {
    return getDisplayMessages(deps.currentChatTarget.value || deps.workspaceCurrentTarget.value)
  }

  function getActiveTargetId(): string {
    return activeChatTargetId.value
  }

  function getActiveSessionId(): string {
    return activeChatSessionId.value
  }

  function getActiveSessionTargetId(): string {
    return activeChatSessionTargetId.value
  }

  return {
    activeChatTargetId,
    activeChatSessionId,
    activeChatSessionTargetId,
    getWorkspaceCurrentTarget,
    getSessionByTargetId,
    getCurrentSession,
    buildDisplayMessages,
    getDisplayMessages,
    getCurrentMessages,
    getActiveTargetId,
    getActiveSessionId,
    getActiveSessionTargetId
  }
}
