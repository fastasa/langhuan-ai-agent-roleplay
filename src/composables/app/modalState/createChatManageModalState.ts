import { computed } from 'vue'

export function createChatManageModalState(input: any) {
  const readStateValue = <T>(value: T | { value: T } | undefined): T | undefined => {
    if (value && typeof value === 'object' && 'value' in value) {
      return (value as { value: T }).value
    }
    return value as T | undefined
  }

  const summaryLibrary = computed(() => {
    const groupedSummaryLibrary = readStateValue<any[]>(input?.chatStore?.summaries?.summaryLibrary)
    if (Array.isArray(groupedSummaryLibrary)) {
      return groupedSummaryLibrary
    }
    return []
  })

  const currentTargetId = computed(() => String(
    input?.chatStore?.current?.getActiveTargetId?.()
    ||
    input?.chatStore?.getActiveTargetId?.()
    || readStateValue(input?.chatStore?.current?.workspaceCurrentTarget)
    || readStateValue(input?.chatStore?.current?.currentChatTarget)
    || input?.chatStore?.getWorkspaceCurrentTarget?.()
    || input?.chatStore?.activeChatTargetId
    || ''
  ))

  const currentSession = computed(() => {
    const direct = input?.chatStore?.current?.getCurrentSession?.()
      ?? input?.chatStore?.getCurrentSession?.()
      ?? readStateValue(input?.chatStore?.current?.currentSession)
    return direct && typeof direct === 'object' ? direct : null
  })

  const currentMessageCount = computed(() => {
    const messages = input?.currentMessages?.value
    return Array.isArray(messages) ? messages.length : 0
  })

  const currentMessages = computed(() => {
    const messages = input?.currentMessages?.value
    return Array.isArray(messages) ? messages : []
  })

  const chatArchives = computed(() => {
    const groupedArchives = readStateValue<any[]>(input?.chatStore?.summaries?.chatArchives)
    if (Array.isArray(groupedArchives)) {
      return groupedArchives
    }
    return []
  })

  return {
    showSummaryList: input.showSummaryList,
    showSummaryEditor: input.showSummaryEditor,
    showConversationManager: input.showConversationManager,
    showSlotManager: input.showSlotManager,
    summaryEditForm: input.summaryEditForm,
    viewModel: {
      currentMessageCount,
      currentMessages,
      summaryLibrary,
      currentTargetId,
      currentSession,
      chatArchives,
      allChatTargets: input.allChatTargets,
      getTargetName: input.getTargetName,
      isSummaryLoaded: input.isSummaryLoaded
    },
    actions: {
      editSummaryItem: input.editSummaryItem,
      deleteSummary: (summaryId: string) => input.chatStore?.deleteSummary?.(summaryId),
      switchChat: input.switchChat,
      clearChat: (targetId: string) => input.chatStore?.clearChat?.(targetId),
      loadChatArchives: () => input.chatStore?.loadChatArchives?.(),
      startNewChat: (targetId: string) => input.chatStore?.startNewChat?.(targetId),
      updateCurrentSession: (targetId: string, payload: { archiveName?: string; archiveCategory?: string }) => input.chatStore?.updateSession?.(targetId, payload),
      updateChatArchive: (archiveId: string, payload: { name?: string; category?: string }) => input.chatStore?.updateChatArchive?.(archiveId, payload),
      deleteChatArchives: (ids: string[]) => input.chatStore?.deleteChatArchives?.(ids),
      loadChatArchiveIntoCurrentTarget: (archiveId: string, targetId: string) => input.chatStore?.loadChatArchiveIntoCurrentTarget?.(archiveId, targetId),
      exportChatArchives: (ids: string[]) => input.chatStore?.exportChatArchives?.(ids),
      importChatArchives: (payload: any) => input.chatStore?.importChatArchives?.(payload),
      toggleSummarySlot: input.toggleSummarySlot,
      saveSummaryEdit: input.saveSummaryEdit,
      syncSummaryAiOptions: input.syncSummaryAiOptions
    }
  }
}
