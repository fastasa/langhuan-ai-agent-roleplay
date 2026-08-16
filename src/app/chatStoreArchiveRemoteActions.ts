import type { ChatStoreRemoteActionDeps } from './chatStoreRemoteActionTypes'
import {
  deleteChatArchives,
  exportChatArchives,
  fetchChatArchives,
  importChatArchives,
  loadChatArchiveIntoTarget,
  patchChatCollectionItem,
  removeChatArchiveItems,
  renameChatArchive
} from '../repositories/chatRepository'

type ArchiveDeps = ChatStoreRemoteActionDeps & {
  switchChat: (targetId: string) => Promise<void>
  startNewChat: (targetId: string) => Promise<string | void>
}

export function createChatStoreArchiveRemoteActions(deps: ArchiveDeps) {
  async function loadArchives(): Promise<void> {
    deps.chatArchives.value = await fetchChatArchives()
  }

  async function startNewChat(targetId: string): Promise<string | void> {
    const sessionId = await deps.startNewChat(targetId)
    await loadArchives()
    return sessionId
  }

  async function updateArchive(archiveId: string, payload: { name?: string; category?: string }): Promise<void> {
    await renameChatArchive(archiveId, payload)
    deps.chatArchives.value = patchChatCollectionItem(deps.chatArchives.value, archiveId, {
      ...(payload.name !== undefined ? { name: payload.name } : {}),
      ...(payload.category !== undefined ? { category: payload.category } : {})
    })
  }

  async function removeArchives(ids: string[]): Promise<void> {
    await deleteChatArchives(ids)
    deps.chatArchives.value = removeChatArchiveItems(deps.chatArchives.value, ids)
  }

  async function loadArchiveIntoCurrentTarget(archiveId: string, targetId: string): Promise<void> {
    const normalizedTargetId = deps.normalizeTargetId(targetId)
    await loadChatArchiveIntoTarget(archiveId, normalizedTargetId)
    await deps.switchChat(normalizedTargetId)
    await loadArchives()
  }

  async function exportArchives(ids: string[]): Promise<any> {
    return await exportChatArchives(ids)
  }

  async function importArchives(payload: any): Promise<void> {
    await importChatArchives(payload)
    await loadArchives()
  }

  return {
    loadArchives,
    startNewChat,
    updateArchive,
    removeArchives,
    loadArchiveIntoCurrentTarget,
    exportArchives,
    importArchives
  }
}
