import type { Alias, ChatSession, UserProfile } from '../types'
import { getChatSessionBoundAlias } from '../repositories/chatRepository'

function normalizeName(value: unknown): string {
  return String(value || '').trim()
}

export function resolvePromptUserName(
  userProfile: Partial<UserProfile> | null | undefined,
  aliases: Array<Partial<Alias>> | null | undefined,
  session: Partial<ChatSession> | null | undefined
): string {
  const boundAliasId = getChatSessionBoundAlias(session)
  if (boundAliasId && Array.isArray(aliases)) {
    const alias = aliases.find((item) => normalizeName(item?.id) === boundAliasId)
    const aliasName = normalizeName(alias?.name)
    if (aliasName) return aliasName
  }

  return normalizeName(userProfile?.name) || normalizeName(userProfile?.displayName) || '用户'
}
