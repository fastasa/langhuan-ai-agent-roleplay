import { ref } from 'vue'
import {
  fetchSessionTemporaryCharacters,
  normalizeSessionTemporaryCharacter
} from '../repositories/chatRepository'
import type { ChatSessionTemporaryCharacter } from '../types'

const SESSION_TEMPORARY_MENTION_PREFIX = 'session-temp:'

export const sessionTemporaryCharactersBySessionId = ref<Record<string, ChatSessionTemporaryCharacter[]>>({})

export function toSessionTemporaryCharacterMentionId(characterId: string): string {
  return `${SESSION_TEMPORARY_MENTION_PREFIX}${characterId}`
}

export function parseSessionTemporaryCharacterMentionId(mentionId: string): string {
  const value = String(mentionId || '')
  return value.startsWith(SESSION_TEMPORARY_MENTION_PREFIX)
    ? value.slice(SESSION_TEMPORARY_MENTION_PREFIX.length)
    : ''
}

export function setSessionTemporaryCharacters(sessionId: string, items: ChatSessionTemporaryCharacter[]): void {
  const key = String(sessionId || '').trim()
  if (!key) return
  sessionTemporaryCharactersBySessionId.value = {
    ...sessionTemporaryCharactersBySessionId.value,
    [key]: (Array.isArray(items) ? items : []).map(normalizeSessionTemporaryCharacter)
  }
}

export function upsertSessionTemporaryCharacterInCache(sessionId: string, item: ChatSessionTemporaryCharacter): void {
  const key = String(sessionId || '').trim()
  if (!key) return
  const normalized = normalizeSessionTemporaryCharacter(item)
  const current = sessionTemporaryCharactersBySessionId.value[key] || []
  const next = current.some((entry) => entry.id === normalized.id)
    ? current.map((entry) => entry.id === normalized.id ? normalized : entry)
    : [...current, normalized]
  setSessionTemporaryCharacters(key, next)
}

export function removeSessionTemporaryCharacterFromCache(sessionId: string, characterId: string): void {
  const key = String(sessionId || '').trim()
  if (!key) return
  setSessionTemporaryCharacters(key, (sessionTemporaryCharactersBySessionId.value[key] || []).filter((item) => item.id !== characterId))
}

export async function loadSessionTemporaryCharactersIntoCache(sessionId: string): Promise<ChatSessionTemporaryCharacter[]> {
  const key = String(sessionId || '').trim()
  if (!key) return []
  const items = await fetchSessionTemporaryCharacters(key)
  setSessionTemporaryCharacters(key, items)
  return items
}

export function getSessionTemporaryCharacterMentionName(mentionId: string): string {
  const characterId = parseSessionTemporaryCharacterMentionId(mentionId)
  if (!characterId) return ''
  for (const items of Object.values(sessionTemporaryCharactersBySessionId.value)) {
    const found = items.find((item) => item.id === characterId)
    if (found?.name) return found.name
  }
  return ''
}
