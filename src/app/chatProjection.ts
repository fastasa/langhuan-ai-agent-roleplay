import { computed } from 'vue'
import {
  getChatStoreActiveSessionId,
  getChatStoreActiveSessionTargetId,
  getChatStoreActiveTargetId,
  getChatStoreCurrentSession,
  getChatStoreDisplayMessages,
  getChatStoreEntityMap,
  getChatStoreLoadedSummaryRecords,
  readChatStoreValue
} from '../repositories/chatRepository'

type ChatProjectionDeps = {
  chatStore: any
  charStore: any
}

export function createChatProjection({ chatStore, charStore }: ChatProjectionDeps) {
  const readCurrent = <T>(key: string, fallback?: T): T | undefined => {
    const currentRecord = chatStore.current as Record<string, T | { value: T }> | undefined
    return readChatStoreValue(currentRecord?.[key]) ?? fallback
  }

  const getActiveTargetId = () => getChatStoreActiveTargetId(chatStore)

  const getActiveSession = () => (
    getChatStoreCurrentSession(chatStore)
    || chatStore.getSessionByTargetId?.(getActiveTargetId())
    || null
  )

  const getDisplayMessages = () => getChatStoreDisplayMessages(chatStore, getActiveTargetId())

  const getCurrentCharacter = () => {
    const targetId = getActiveTargetId()
    if (!targetId || targetId.startsWith('group_') || targetId.startsWith('crowd_')) return null
    return charStore.getCharacter?.(targetId) || null
  }

  const getLoadedSummaryRecords = () => {
    return getChatStoreLoadedSummaryRecords(chatStore, getActiveSession())
  }

  const chatHeaderInfo = computed(() => {
    const targetId = getActiveTargetId()
    const activeSession = getActiveSession()
    const sessionId = String(getChatStoreActiveSessionId(chatStore) || activeSession?.id || '')
    const chatTargets = getChatStoreEntityMap<Record<string, any>>(chatStore, 'chatTargets') || {}
    const targetKind = String(chatTargets?.[targetId]?.kind || '')
    const character = targetKind === 'character' ? charStore.getCharacter?.(targetId) : null
    return {
      targetId,
      sessionId,
      targetKind,
      title: character?.name || '',
      avatarPath: character?.avatarPath || character?.avatar_path || ''
    }
  })

  const loadedSummaryBadges = computed(() => {
    return getLoadedSummaryRecords().map(({ id, name }) => ({ id, name }))
  })

  const chatPanelViewModel = computed(() => ({
    activeChatTargetId: getActiveTargetId(),
    activeChatSessionId: String(getChatStoreActiveSessionId(chatStore) || getActiveSession()?.id || ''),
    activeChatSessionTargetId: String(getChatStoreActiveSessionTargetId(chatStore) || getActiveTargetId()),
    displayMessages: getDisplayMessages(),
    loadedSummaryBadges: loadedSummaryBadges.value,
    chatHeaderInfo: chatHeaderInfo.value
  }))

  return {
    getActiveTargetId,
    getActiveSession,
    getDisplayMessages,
    getCurrentCharacter,
    getLoadedSummaryRecords,
    chatHeaderInfo,
    displayMessages: computed(() => chatPanelViewModel.value.displayMessages),
    currentCharacterViewModel: computed(() => getCurrentCharacter()),
    loadedSummaryBadges,
    chatPanelViewModel
  }
}
