import { ref } from 'vue'
import type { ChatMessage, ChatSession } from '../types'
import { resolveChatSessionTargetId } from '../repositories/chatRepository'

type ChatRuntimeMessage = ChatMessage & {
  _localStreamingKey?: string
  _localInsertAfterMessageId?: number
}

type ResolveChatSessionByTargetInput = {
  targetId?: string
  currentChatTarget?: string
  workspaceCurrentTarget?: string
  currentSession?: ChatSession | null
  chatSessions?: Record<string, ChatSession>
  normalizeTargetId: (targetId: string) => string
}

type BuildChatDisplayMessagesInput = {
  targetId?: string
  sessionId?: string
  sessionMessagesCache?: Record<string, ChatRuntimeMessage[]>
  pendingPersistedMessages?: Record<string, ChatRuntimeMessage[]>
  localStreamingMessages?: Record<string, ChatRuntimeMessage[]>
  normalizeTargetId: (targetId: string) => string
  normalizeMessageForTarget: (targetId: string, message: ChatRuntimeMessage) => ChatRuntimeMessage
}

function readMessageBucket(record: Record<string, ChatRuntimeMessage[]> | undefined, targetId: string): ChatRuntimeMessage[] {
  if (!record || typeof record !== 'object') return []
  return Array.isArray(record[targetId]) ? record[targetId] : []
}

function getLocalInsertAfterMessageId(message: ChatRuntimeMessage): number {
  const raw = Number(message?._localInsertAfterMessageId || 0)
  return Number.isFinite(raw) && raw > 0 ? raw : 0
}

function appendDisplayMessage(merged: ChatRuntimeMessage[], message: ChatRuntimeMessage): void {
  const insertAfterMessageId = getLocalInsertAfterMessageId(message)
  if (!insertAfterMessageId) {
    merged.push(message)
    return
  }
  const anchorIndex = merged.findIndex((item) => Number(item?.id || 0) === insertAfterMessageId)
  if (anchorIndex < 0) {
    merged.push(message)
    return
  }
  let insertIndex = anchorIndex + 1
  while (
    insertIndex < merged.length
    && Number(merged[insertIndex]?._localInsertAfterMessageId || 0) === insertAfterMessageId
  ) {
    insertIndex += 1
  }
  merged.splice(insertIndex, 0, message)
}

type CreateChatCurrentStateDeps = {
  normalizeTargetId: (targetId: string) => string
}

export function createChatCurrentState({ normalizeTargetId }: CreateChatCurrentStateDeps) {
  const currentChatTarget = ref('')
  const workspaceCurrentTarget = ref('')
  const currentSession = ref<ChatSession | null>(null)
  const currentMessages = ref<ChatRuntimeMessage[]>([])
  const sessionMessagesCache = ref<Record<string, ChatRuntimeMessage[]>>({})
  const localStreamingMessages = ref<Record<string, ChatRuntimeMessage[]>>({})
  const pendingPersistedMessages = ref<Record<string, ChatRuntimeMessage[]>>({})

  function setWorkspaceCurrentTarget(targetId: string): string {
    const normalizedTargetId = normalizeTargetId(String(targetId || ''))
    workspaceCurrentTarget.value = normalizedTargetId
    return normalizedTargetId
  }

  function setCurrentChatTarget(targetId: string): string {
    const normalizedTargetId = normalizeTargetId(String(targetId || ''))
    currentChatTarget.value = normalizedTargetId
    return normalizedTargetId
  }

  function setCurrentSession(session: ChatSession | null) {
    currentSession.value = session || null
    return currentSession.value
  }

  function setCurrentMessages(messages: ChatRuntimeMessage[]) {
    currentMessages.value = Array.isArray(messages) ? messages : []
    return currentMessages.value
  }

  return {
    currentChatTarget,
    workspaceCurrentTarget,
    currentSession,
    currentMessages,
    sessionMessagesCache,
    localStreamingMessages,
    pendingPersistedMessages,
    setWorkspaceCurrentTarget,
    setCurrentChatTarget,
    setCurrentSession,
    setCurrentMessages
  }
}

export function resolveChatSessionByTargetId({
  targetId,
  currentChatTarget = '',
  workspaceCurrentTarget = '',
  currentSession = null,
  chatSessions = {},
  normalizeTargetId
}: ResolveChatSessionByTargetInput) {
  const resolvedTargetId = normalizeTargetId(String(targetId || currentChatTarget || workspaceCurrentTarget || ''))
  if (!resolvedTargetId) {
    return currentSession || null
  }

  if (resolveChatSessionTargetId(currentSession) === resolvedTargetId) {
    return currentSession
  }

  const directEntitySession = chatSessions?.[resolvedTargetId]
  if (directEntitySession && resolveChatSessionTargetId(directEntitySession) === resolvedTargetId) {
    return directEntitySession
  }

  const entitySession = Object.values(chatSessions || {}).find((session) => {
    return resolveChatSessionTargetId(session) === resolvedTargetId
  })
  if (entitySession) return entitySession

  return null
}

export function buildChatDisplayMessages({
  targetId,
  sessionId,
  sessionMessagesCache = {},
  pendingPersistedMessages = {},
  localStreamingMessages = {},
  normalizeTargetId,
  normalizeMessageForTarget
}: BuildChatDisplayMessagesInput) {
  const normalizedTargetId = normalizeTargetId(String(targetId || ''))
  const messageKey = String(sessionId || normalizedTargetId || '').trim()
  if (!messageKey) return []
  const messageTargetId = normalizedTargetId || messageKey

  const merged = [...readMessageBucket(sessionMessagesCache, messageKey)]

  readMessageBucket(pendingPersistedMessages, messageKey).forEach((message) => {
    if (message?.id && merged.some((item) => item?.id === message.id)) return
    appendDisplayMessage(merged, normalizeMessageForTarget(messageTargetId, { ...message }))
  })

  readMessageBucket(localStreamingMessages, messageKey).forEach((message) => {
    const localKey = message?._localStreamingKey
    if (localKey && merged.some((item) => item?._localStreamingKey === localKey)) return
    appendDisplayMessage(merged, normalizeMessageForTarget(messageTargetId, { ...message }))
  })

  return merged
}
