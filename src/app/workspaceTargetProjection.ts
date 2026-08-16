import type { WorkspaceSnapshotV1 } from '../types/workspace'
import type { Character, ChatSession, Crowd, Group } from '../types'
import { getChatStoreCurrentTarget } from '../repositories/chatRepository'
import type { useCharacterStore } from '../stores/characterStore'
import type { useChatStore } from '../stores/chatStore'

type WorkspaceTargetProjectionDeps = {
  chatStore: ReturnType<typeof useChatStore>
  charStore: ReturnType<typeof useCharacterStore>
}

export function createWorkspaceTargetProjection({ chatStore, charStore }: WorkspaceTargetProjectionDeps) {
  function getSessionById(snapshot: WorkspaceSnapshotV1, sessionId = ''): ChatSession | null {
    const normalizedSessionId = String(sessionId || '').trim()
    if (!normalizedSessionId || !Array.isArray(snapshot?.chatSessions)) return null
    return snapshot.chatSessions.find((session: ChatSession) => String(session?.id || '').trim() === normalizedSessionId) || null
  }

  function listSnapshotSessionTargetIds(snapshot: WorkspaceSnapshotV1): string[] {
    if (!Array.isArray(snapshot?.chatSessions)) return []
    return snapshot.chatSessions
      .map((session: ChatSession) => String(session?.targetId ?? session?.target_id ?? session?.id ?? '').trim())
      .filter(Boolean)
  }

  function listKnownTargetIds(): string[] {
    const characterIds = Array.isArray(charStore?.characters)
      ? charStore.characters.map((item: Character) => String(item.id || ''))
      : []
    const groupIds = Array.isArray(charStore?.groups)
      ? charStore.groups.flatMap((item: Group) => {
          const id = String(item.id || '')
          return id ? [id, `group_${id}`] : []
        })
      : []
    const crowdIds = Array.isArray(charStore?.crowds)
      ? charStore.crowds.flatMap((item: Crowd) => {
          const id = String(item.id || '')
          return id ? [id, `crowd_${id}`] : []
        })
      : []

    return [...characterIds, ...groupIds, ...crowdIds].filter(Boolean)
  }

  function hasTarget(targetId: string): boolean {
    const normalizedTargetId = String(targetId || '').trim()
    if (!normalizedTargetId) return false
    return listKnownTargetIds().includes(normalizedTargetId)
  }

  function pickBootstrapTarget(snapshot: WorkspaceSnapshotV1, rememberedTarget = ''): string {
    const fallbackTarget = String(rememberedTarget || '').trim()
    const snapshotWorkspaceTarget = String(snapshot?.workspaceTarget || '').trim()
    if (hasTarget(snapshotWorkspaceTarget)) return snapshotWorkspaceTarget
    if (hasTarget(fallbackTarget)) return fallbackTarget
    const snapshotSessionTarget = listSnapshotSessionTargetIds(snapshot).find((targetId) => hasTarget(targetId))
    if (snapshotSessionTarget) return snapshotSessionTarget
    const storeTarget = String(getChatStoreCurrentTarget(chatStore) || '').trim()
    if (hasTarget(storeTarget)) return storeTarget
    return ''
  }

  function pickBootstrapSession(snapshot: WorkspaceSnapshotV1): ChatSession | null {
    const session = getSessionById(snapshot, snapshot?.workspaceSessionId)
    if (!session) return null
    const targetId = String(session.targetId ?? session.target_id ?? '').trim()
    return hasTarget(targetId) ? session : null
  }

  async function restoreBootstrapTarget(snapshot: WorkspaceSnapshotV1, rememberedTarget = ''): Promise<string> {
    const selectedSession = pickBootstrapSession(snapshot)
    if (selectedSession?.id && typeof chatStore.switchSession === 'function') {
      await chatStore.switchSession(String(selectedSession.id))
      return String(selectedSession.targetId ?? selectedSession.target_id ?? '')
    }
    const nextTarget = pickBootstrapTarget(snapshot, rememberedTarget)
    if (!nextTarget) return ''
    if (typeof chatStore.switchChat === 'function') {
      await chatStore.switchChat(nextTarget)
      return nextTarget
    }
    if (chatStore.current && 'currentChatTarget' in chatStore.current) {
      const currentTarget = chatStore.current.currentChatTarget
      if (currentTarget && typeof currentTarget === 'object' && 'value' in currentTarget) {
        currentTarget.value = nextTarget
      } else {
        chatStore.current.currentChatTarget = nextTarget
      }
    }
    if (typeof chatStore.current?.setWorkspaceCurrentTarget === 'function') {
      chatStore.current.setWorkspaceCurrentTarget(nextTarget)
    } else {
      chatStore.setWorkspaceCurrentTarget?.(nextTarget)
    }
    return nextTarget
  }

  return {
    listKnownTargetIds,
    hasTarget,
    pickBootstrapTarget,
    pickBootstrapSession,
    restoreBootstrapTarget
  }
}
