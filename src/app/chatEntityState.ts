import { createChatTargetEntity } from '../repositories/chatRepository'
import { resolveChatSessionTargetId } from '../repositories/chatRepository'

type MutableValue<T> = { value: T }

type ChatEntityStateDeps = {
  sessionMessagesCache: MutableValue<Record<string, any[]>>
  chatTargets: MutableValue<Record<string, any>>
  chatSessions: MutableValue<Record<string, any>>
  chatMessages: MutableValue<Record<string, any[]>>
  normalizeTargetId: (targetId: string) => string
  normalizeSession?: (session: any) => any
  normalizeMessageForTarget?: (targetId: string, message: any) => any
}

export function createChatEntityState(deps: ChatEntityStateDeps) {
  function ensureContainers(): void {
    if (!deps.chatTargets.value || typeof deps.chatTargets.value !== 'object') {
      deps.chatTargets.value = {}
    }
    if (!deps.chatSessions.value || typeof deps.chatSessions.value !== 'object') {
      deps.chatSessions.value = {}
    }
    if (!deps.chatMessages.value || typeof deps.chatMessages.value !== 'object') {
      deps.chatMessages.value = {}
    }
    if (!deps.sessionMessagesCache.value || typeof deps.sessionMessagesCache.value !== 'object') {
      deps.sessionMessagesCache.value = {}
    }
  }

  function registerTarget(targetId: string): any {
    ensureContainers()
    const normalizedTargetId = deps.normalizeTargetId(targetId)
    if (!normalizedTargetId) return null
    const targetEntity = createChatTargetEntity(normalizedTargetId)
    if (!targetEntity) return null
    deps.chatTargets.value[normalizedTargetId] = targetEntity
    return targetEntity
  }

  function upsertSession(session: any): any {
    ensureContainers()
    if (!session) return null
    const normalizedSession = deps.normalizeSession ? deps.normalizeSession(session) : session
    if (!normalizedSession?.id) return null
    deps.chatSessions.value[normalizedSession.id] = normalizedSession
    return normalizedSession
  }

  function replaceSessions(sessions: any[]): Record<string, any> {
    ensureContainers()
    if (!Array.isArray(sessions)) {
      deps.chatSessions.value = {}
      return deps.chatSessions.value
    }
    deps.chatSessions.value = Object.fromEntries(
      sessions
        .map((session) => upsertSession(session))
        .filter(Boolean)
        .map((session) => [session.id, session])
    )
    return deps.chatSessions.value
  }

  function replaceMessagesForTarget(targetId: string, messages: any[]): any[] {
    return replaceMessagesForSession(targetId, targetId, messages)
  }

  function replaceMessagesForSession(sessionId: string, targetId: string, messages: any[]): any[] {
    ensureContainers()
    const messageKey = String(sessionId || '').trim()
    const normalizedTargetId = deps.normalizeTargetId(targetId)
    if (!messageKey) return []
    const normalizedMessages = Array.isArray(messages)
      ? messages.map((message) => (
          deps.normalizeMessageForTarget
            ? deps.normalizeMessageForTarget(normalizedTargetId, message)
            : message
        ))
      : []
    deps.sessionMessagesCache.value[messageKey] = normalizedMessages
    deps.chatMessages.value[messageKey] = [...normalizedMessages]
    return normalizedMessages
  }

  function replaceGroupedMessages(groupedMessages: Record<string, any[]>): Record<string, any[]> {
    ensureContainers()
    const normalizedGroupedMessages: Record<string, any[]> = {}
    Object.entries(groupedMessages || {}).forEach(([targetId, messages]) => {
      const messageKey = String(targetId || '').trim()
      if (!messageKey) return
      const session = deps.chatSessions.value?.[messageKey]
      const normalizedTargetId = deps.normalizeTargetId(resolveChatSessionTargetId(session) || targetId)
      normalizedGroupedMessages[messageKey] = replaceMessagesForSession(messageKey, normalizedTargetId, messages)
    })
    deps.sessionMessagesCache.value = normalizedGroupedMessages
    deps.chatMessages.value = Object.fromEntries(
      Object.entries(normalizedGroupedMessages).map(([targetId, messages]) => [targetId, [...messages]])
    )
    return normalizedGroupedMessages
  }

  function clearMessagesForTarget(targetId: string): void {
    clearMessagesForSession(targetId)
  }

  function clearMessagesForSession(sessionId: string): void {
    ensureContainers()
    const messageKey = String(sessionId || '').trim()
    if (!messageKey) return
    delete deps.sessionMessagesCache.value[messageKey]
    delete deps.chatMessages.value[messageKey]
  }

  return {
    ensureContainers,
    registerTarget,
    upsertSession,
    replaceSessions,
    replaceMessagesForTarget,
    replaceMessagesForSession,
    replaceGroupedMessages,
    clearMessagesForTarget,
    clearMessagesForSession
  }
}
