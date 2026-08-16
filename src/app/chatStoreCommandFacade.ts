type CreateChatStoreCommandFacadeDeps = {
  remoteActions: {
    clearMessages: (targetId: string) => Promise<void>
    clearSessionContext?: (targetId: string, options?: {
      clearSessionTemporaryCharacters?: boolean
    }) => Promise<void>
    deleteSmallSummary: (id: string) => Promise<void>
    deleteBigSummary: (id: string) => Promise<void>
  }
  summaryState: {
    removeLoadedSummaryReference: (summaryId: string) => Promise<void>
  }
}

export function createChatStoreCommandFacade(deps: CreateChatStoreCommandFacadeDeps) {
  async function clearChat(targetId: string): Promise<void> {
    await deps.remoteActions.clearMessages(targetId)
  }

  async function clearChatContext(targetId: string, options: {
    clearSessionTemporaryCharacters?: boolean
  } = {}): Promise<void> {
    if (typeof deps.remoteActions.clearSessionContext === 'function') {
      await deps.remoteActions.clearSessionContext(targetId, options)
      return
    }
    await deps.remoteActions.clearMessages(targetId)
  }

  async function deleteSmallSummary(id: string): Promise<void> {
    await deps.remoteActions.deleteSmallSummary(id)
    await deps.summaryState.removeLoadedSummaryReference(id)
  }

  async function deleteBigSummary(id: string): Promise<void> {
    await deps.remoteActions.deleteBigSummary(id)
    await deps.summaryState.removeLoadedSummaryReference(id)
  }

  return {
    clearChat,
    clearChatContext,
    deleteSmallSummary,
    deleteBigSummary
  }
}
