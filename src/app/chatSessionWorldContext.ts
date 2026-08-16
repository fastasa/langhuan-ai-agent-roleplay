import type { ChatSession } from '../types'
import { normalizeChatSession } from '../repositories/chatRepository'
import { createLocalRecallRoundPoolCache } from './recallRoundPoolCache'
import { reconcileWorldPoolDocumentScope } from './recallRoundPool'
import { readDocLibraryDocumentIdFromUnitId, readSessionWorldDocLibraryScope } from './worldDocLibraryScope'

function sessionEntities(chatStore: any): Record<string, ChatSession> {
  return (chatStore?.entities?.chatSessions || chatStore?.chatSessions || {}) as Record<string, ChatSession>
}

/** 把 attach/detach 的服务端回包写回当前前端读模型，并立刻裁掉不再属于该世界的检索卡。 */
export function applyChatSessionWorldReadModel(chatStore: any, session: ChatSession): ChatSession {
  const normalized = normalizeChatSession(session)
  if (!normalized.id) return normalized
  const entities = sessionEntities(chatStore)
  entities[normalized.id] = { ...(entities[normalized.id] || {}), ...normalized }
  const current = typeof chatStore?.getCurrentSession === 'function' ? chatStore.getCurrentSession() : null
  if (String(current?.id || '').trim() === normalized.id) Object.assign(current, normalized)

  const cache = createLocalRecallRoundPoolCache()
  const pools = cache.load(normalized.id)
  if (pools && reconcileWorldPoolDocumentScope(
    pools,
    readSessionWorldDocLibraryScope(normalized),
    readDocLibraryDocumentIdFromUnitId
  )) cache.save(pools)
  return normalized
}

/** 世界挂载文档变动后，同步刷新所有已挂该世界的本地会话只读投影。 */
export function applyWorldDocLinksToMountedSessions(chatStore: any, worldId: string, documentIds: string[]): number {
  const normalizedWorldId = String(worldId || '').trim()
  if (!normalizedWorldId) return 0
  const ids = Array.from(new Set((documentIds || []).map((id) => String(id || '').trim()).filter(Boolean)))
  const entities = sessionEntities(chatStore)
  let changed = 0
  for (const session of Object.values(entities)) {
    const scope = readSessionWorldDocLibraryScope(session)
    if (scope.worldId !== normalizedWorldId) continue
    applyChatSessionWorldReadModel(chatStore, { ...session, worldDocLibraryDocumentIds: ids })
    changed += 1
  }
  const current = typeof chatStore?.getCurrentSession === 'function' ? chatStore.getCurrentSession() : null
  if (current && !entities[String(current.id || '')] && readSessionWorldDocLibraryScope(current).worldId === normalizedWorldId) {
    applyChatSessionWorldReadModel(chatStore, { ...current, worldDocLibraryDocumentIds: ids })
    changed += 1
  }
  return changed
}
