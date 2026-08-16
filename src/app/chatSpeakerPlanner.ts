import type { ChatReplyPipelineMode } from './chatReplyPipelineMode'

export interface GroupReplyPlanItem {
  characterId?: string
  mustReply?: boolean
  probability?: number
}

export interface ResolvedGroupReplyPlanItem {
  characterId: string
  mustReply: true
  probability: 1
}

export interface GroupReplyMember {
  characterId: string
  probability?: number
}

export interface ChatSpeakerPlannerCharacter {
  id?: string
  name?: string
}

export interface PlannedGroupSpeakerView {
  id: string
  name: string
}

export function resolvePlannedGroupSpeakerViews(input: {
  replyOrder: GroupReplyPlanItem[]
  characters: ChatSpeakerPlannerCharacter[]
}): PlannedGroupSpeakerView[] {
  const characters = Array.isArray(input.characters) ? input.characters : []
  return (input.replyOrder || [])
    .map((item) => {
      const id = String(item.characterId || '').trim()
      const matchedCharacter = characters.find((character) => String(character?.id || '').trim() === id)
      const name = String(matchedCharacter?.name || '').trim()
      if (!id || !name) return null
      return { id, name }
    })
    .filter((item): item is PlannedGroupSpeakerView => Boolean(item))
}

export function resolveFinalGroupReplyOrder(input: {
  plannedReplyOrder: GroupReplyPlanItem[]
  groupMembers: GroupReplyMember[]
  normalizeReplyProbability: (value: unknown) => number
  random?: () => number
}): ResolvedGroupReplyPlanItem[] {
  const random = input.random || Math.random
  const replyOrder = input.plannedReplyOrder.length > 0
    ? input.plannedReplyOrder
    : input.groupMembers.map((member) => ({
        characterId: member.characterId,
        mustReply: true,
        probability: member.probability ?? 100
      }))

  const resolvedReplyOrder = replyOrder
    .filter((item) => item.mustReply || random() <= input.normalizeReplyProbability(item.probability))
    .map((item) => String(item.characterId || '').trim())
    .filter(Boolean)
    .map((characterId) => ({
      characterId,
      mustReply: true as const,
      probability: 1 as const
    }))

  return resolvedReplyOrder.length > 0
    ? resolvedReplyOrder
    : replyOrder
      .map((item) => String(item.characterId || '').trim())
      .filter(Boolean)
      .slice(0, 1)
      .map((characterId) => ({
        characterId,
        mustReply: true as const,
        probability: 1 as const
      }))
}

export function collectCapsNetworkGroupSpeakers(
  replyOrder: GroupReplyPlanItem[],
  resolveReplyMode: (characterId: string) => ChatReplyPipelineMode
): string[] {
  void replyOrder
  void resolveReplyMode
  return []
}
