import type { Ref } from 'vue'
import type { ChatMessage, ChatSession } from '../types'

type ChatRuntimeMessage = ChatMessage & {
  _localStreamingKey?: string
  _localInsertAfterMessageId?: number
}

type ChatRuntimeStateDeps = {
  currentChatTarget: Ref<string>
  currentSession: Ref<ChatSession | null>
  currentMessages: Ref<ChatRuntimeMessage[]>
  sessionMessagesCache: Ref<Record<string, ChatRuntimeMessage[]>>
  pendingPersistedMessages: Ref<Record<string, ChatRuntimeMessage[]>>
  localStreamingMessages: Ref<Record<string, ChatRuntimeMessage[]>>
  chatMessages: Ref<Record<string, ChatRuntimeMessage[]>>
  normalizeTargetId: (targetId: string) => string
  resolveSessionTargetId: (session: ChatSession | null) => string
  normalizeMessage: (message: ChatRuntimeMessage) => ChatRuntimeMessage
  normalizeMessageForTarget: (targetId: string, message: ChatRuntimeMessage) => ChatRuntimeMessage
  buildDisplayMessages: (targetId: string, sessionId?: string) => ChatRuntimeMessage[]
}

export function createChatRuntimeState(deps: ChatRuntimeStateDeps) {
  function getCurrentSessionId(): string {
    return String(deps.currentSession.value?.id || '').trim()
  }

  function getCurrentSessionTargetId(): string {
    const currentSessionTargetId = deps.normalizeTargetId(deps.resolveSessionTargetId(deps.currentSession.value))
    return currentSessionTargetId
  }

  function resolveMessageCacheKey(targetId: string): string {
    const raw = String(targetId || '').trim()
    const currentSessionId = getCurrentSessionId()
    if (raw && raw === currentSessionId) return raw
    const normalizedTargetId = deps.normalizeTargetId(raw)
    if (
      currentSessionId
      && normalizedTargetId
      && deps.normalizeTargetId(deps.currentChatTarget.value) === normalizedTargetId
      && getCurrentSessionTargetId() === normalizedTargetId
    ) {
      return currentSessionId
    }
    return normalizedTargetId || raw
  }

  function resolveMessageTargetId(targetId: string): string {
    const raw = String(targetId || '').trim()
    const currentSessionId = getCurrentSessionId()
    if (raw && raw === currentSessionId) return getCurrentSessionTargetId()
    return deps.normalizeTargetId(raw) || getCurrentSessionTargetId()
  }

  function isTargetReady(targetId: string): boolean {
    const key = resolveMessageCacheKey(targetId)
    const currentSessionId = getCurrentSessionId()
    if (currentSessionId && key === currentSessionId) return true
    const normalizedTargetId = deps.normalizeTargetId(targetId)
    if (!normalizedTargetId) return false
    return deps.normalizeTargetId(deps.currentChatTarget.value) === normalizedTargetId
      && getCurrentSessionTargetId() === normalizedTargetId
  }

  function getCachedMessages(targetId: string): ChatRuntimeMessage[] {
    const key = resolveMessageCacheKey(targetId)
    return Array.isArray(deps.sessionMessagesCache.value[key]) ? deps.sessionMessagesCache.value[key] : []
  }

  function getPendingMessages(targetId: string): ChatRuntimeMessage[] {
    const key = resolveMessageCacheKey(targetId)
    return Array.isArray(deps.pendingPersistedMessages.value[key]) ? deps.pendingPersistedMessages.value[key] : []
  }

  function getLocalStreamingMessages(targetId: string): ChatRuntimeMessage[] {
    const key = resolveMessageCacheKey(targetId)
    return Array.isArray(deps.localStreamingMessages.value[key]) ? deps.localStreamingMessages.value[key] : []
  }

  function getLocalInsertAfterMessageId(message: ChatRuntimeMessage): number {
    const raw = Number(message?._localInsertAfterMessageId || 0)
    return Number.isFinite(raw) && raw > 0 ? raw : 0
  }

  function findAnchoredInsertIndex(list: ChatRuntimeMessage[], insertAfterMessageId: number): number {
    if (!insertAfterMessageId) return -1
    const anchorIndex = list.findIndex((item) => Number(item?.id || 0) === insertAfterMessageId)
    if (anchorIndex < 0) return -1
    let insertIndex = anchorIndex + 1
    while (
      insertIndex < list.length
      && Number(list[insertIndex]?._localInsertAfterMessageId || 0) === insertAfterMessageId
    ) {
      insertIndex += 1
    }
    return insertIndex
  }

  function refreshCurrentMessages(targetId: string): void {
    const key = resolveMessageCacheKey(targetId)
    if (!isTargetReady(key)) return
    const messageTargetId = resolveMessageTargetId(targetId)
    deps.currentMessages.value = deps.buildDisplayMessages(messageTargetId, key)
    deps.chatMessages.value[key] = [...deps.currentMessages.value]
  }

  function upsertCachedMessage(targetId: string, message: ChatRuntimeMessage): void {
    const key = resolveMessageCacheKey(targetId)
    if (!key) return
    const list = [...getCachedMessages(key)]
    const normalized = deps.normalizeMessageForTarget(resolveMessageTargetId(targetId), { ...message })
    const index = list.findIndex((item) => normalized.id && item.id === normalized.id)
    if (index >= 0) {
      list[index] = { ...list[index], ...normalized }
    } else {
      const insertIndex = findAnchoredInsertIndex(list, getLocalInsertAfterMessageId(normalized))
      if (insertIndex >= 0) {
        list.splice(insertIndex, 0, normalized)
      } else {
        list.push(normalized)
      }
    }
    deps.sessionMessagesCache.value[key] = list
    deps.chatMessages.value[key] = [...list]
  }

  function removeCachedMessage(targetId: string, msgId: number): void {
    const key = resolveMessageCacheKey(targetId)
    if (!key) return
    deps.sessionMessagesCache.value[key] = getCachedMessages(key).filter((item) => item.id !== msgId)
    deps.chatMessages.value[key] = [...deps.sessionMessagesCache.value[key]]
  }

  function queuePendingPersistedMessage(targetId: string, message: ChatRuntimeMessage): void {
    const key = resolveMessageCacheKey(targetId)
    if (!key) return
    const normalized = deps.normalizeMessageForTarget(resolveMessageTargetId(targetId), { ...message })
    const current = Array.isArray(deps.pendingPersistedMessages.value[key]) ? deps.pendingPersistedMessages.value[key] : []
    if (normalized.id && current.some((item) => item.id === normalized.id)) return
    deps.pendingPersistedMessages.value[key] = [...current, normalized]
    if (isTargetReady(key)) {
      flushPendingPersistedMessages(key)
    }
  }

  function flushPendingPersistedMessages(targetId: string): void {
    const key = resolveMessageCacheKey(targetId)
    if (!key || !isTargetReady(key)) return
    const queued = Array.isArray(deps.pendingPersistedMessages.value[key]) ? deps.pendingPersistedMessages.value[key] : []
    if (!queued.length) return
    queued.forEach((message) => {
      upsertCachedMessage(key, message)
    })
    delete deps.pendingPersistedMessages.value[key]
    refreshCurrentMessages(key)
  }

  function upsertLocalStreamingMessage(targetId: string, messageKey: string, message: ChatRuntimeMessage): void {
    const key = resolveMessageCacheKey(targetId)
    if (!key || !messageKey) return
    const list = [...getLocalStreamingMessages(key)]
    const nextMessage = deps.normalizeMessage({
      ...message,
      _localStreamingKey: messageKey
    })
    const index = list.findIndex((item) => item?._localStreamingKey === messageKey)
    if (index >= 0) {
      list[index] = deps.normalizeMessageForTarget(resolveMessageTargetId(targetId), { ...list[index], ...nextMessage })
    } else {
      list.push(deps.normalizeMessageForTarget(resolveMessageTargetId(targetId), nextMessage))
    }
    deps.localStreamingMessages.value[key] = list
    refreshCurrentMessages(key)
  }

  function removeLocalStreamingMessage(targetId: string, messageKey: string): void {
    const key = resolveMessageCacheKey(targetId)
    if (!key || !messageKey) return
    deps.localStreamingMessages.value[key] = getLocalStreamingMessages(key).filter((item) => item?._localStreamingKey !== messageKey)
    refreshCurrentMessages(key)
  }

  function finalizeLocalStreamingMessage(targetId: string, messageKey: string, message: ChatRuntimeMessage): boolean {
    const key = resolveMessageCacheKey(targetId)
    if (!key || !messageKey) return false
    const hasLocal = getLocalStreamingMessages(key).some((item) => item?._localStreamingKey === messageKey)
    deps.localStreamingMessages.value[key] = getLocalStreamingMessages(key).filter((item) => item?._localStreamingKey !== messageKey)
    if (!isTargetReady(key)) {
      return false
    }
    upsertCachedMessage(key, message)
    refreshCurrentMessages(key)
    return hasLocal
  }

  function removeReplyStreamingMessages(messages: ChatRuntimeMessage[]): ChatRuntimeMessage[] {
    return (messages || []).filter((message) => String(message?.role || '').trim() === 'user')
  }

  function clearLocalStreamingMessages(targetId?: string): void {
    const rawTargetId = String(targetId || '').trim()
    if (!rawTargetId) {
      const nextBuckets: Record<string, ChatRuntimeMessage[]> = {}
      Object.entries(deps.localStreamingMessages.value || {}).forEach(([key, messages]) => {
        const keptMessages = removeReplyStreamingMessages(Array.isArray(messages) ? messages : [])
        if (keptMessages.length) {
          nextBuckets[key] = keptMessages
        }
      })
      deps.localStreamingMessages.value = nextBuckets
      refreshCurrentMessages(getCurrentSessionId() || getCurrentSessionTargetId())
      return
    }
    const key = resolveMessageCacheKey(rawTargetId)
    if (!key) return
    const keptMessages = removeReplyStreamingMessages(getLocalStreamingMessages(key))
    if (keptMessages.length) {
      deps.localStreamingMessages.value[key] = keptMessages
    } else {
      delete deps.localStreamingMessages.value[key]
    }
    refreshCurrentMessages(key)
  }

  return {
    isTargetReady,
    getCachedMessages,
    getPendingMessages,
    getLocalStreamingMessages,
    refreshCurrentMessages,
    upsertCachedMessage,
    removeCachedMessage,
    queuePendingPersistedMessage,
    flushPendingPersistedMessages,
    upsertLocalStreamingMessage,
    removeLocalStreamingMessage,
    finalizeLocalStreamingMessage,
    clearLocalStreamingMessages
  }
}
