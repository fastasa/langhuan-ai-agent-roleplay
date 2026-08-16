import { parseStrictMentions, type StrictMentionCandidate } from '../app/strictMentionParser'

interface GroupMember {
  characterId: string
  probability?: number
}

interface CharacterLite {
  id: string
  name: string
  nicknames?: string[]
}

interface ReplyPlanItem {
  characterId: string
  mustReply: boolean
  probability?: number
}

interface BuildReplyPlanOptions {
  userText: string
  groupMembers: GroupMember[]
  characters: CharacterLite[]
  mentionSelectedChars: string[]
  mentionExcludedChars: string[]
}

function escapeRegExp(text: string): string {
  return String(text || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function shuffleArray<T>(items: T[]): T[] {
  const next = [...items]
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    const temp = next[i]
    next[i] = next[j]
    next[j] = temp
  }
  return next
}

function normalizeReplyProbability(val: unknown): number {
  const num = Number(val)
  if (!Number.isFinite(num)) return 0.3
  if (num <= 0) return 0
  if (num > 1) return Math.min(num, 100) / 100
  return num
}

function pushUnique(plan: ReplyPlanItem[], characterId: string, item: ReplyPlanItem): void {
  if (!plan.some(p => p.characterId === characterId)) {
    plan.push(item)
  }
}

export function useGroupReplyPlan() {
  function buildReplyPlan(options: BuildReplyPlanOptions): ReplyPlanItem[] {
    const {
      userText,
      groupMembers,
      characters,
      mentionSelectedChars,
      mentionExcludedChars
    } = options

    const plan: ReplyPlanItem[] = []
    const excluded = new Set(mentionExcludedChars || [])

    // 1) 显式选择（最高优先级，按顺序）
    if (mentionSelectedChars?.length > 0) {
      for (const charId of mentionSelectedChars) {
        if (excluded.has(charId)) continue
        const exists = characters.some(c => c.id === charId)
        if (exists) {
          plan.push({ characterId: charId, mustReply: true })
        }
      }
      return plan
    }

    // 2) 严格解析 @角色：必须以空白或文本结束作为边界，避免 @角色名后续正文 误触发。
    const mentionCandidates: StrictMentionCandidate[] = []
    for (const member of groupMembers) {
      if (!member.characterId) continue
      if (excluded.has(member.characterId)) continue
      const char = characters.find(c => c.id === member.characterId)
      if (!char) continue
      mentionCandidates.push({
        id: char.id,
        name: char.name,
        nicknames: char.nicknames,
        kind: 'formal'
      })
    }

    for (const match of parseStrictMentions(userText, mentionCandidates)) {
      pushUnique(plan, match.candidate.id, { characterId: match.candidate.id, mustReply: true })
    }

    // 3) 检测文本提及角色名/昵称（非@）
    for (const member of groupMembers) {
      if (!member.characterId) continue
      if (excluded.has(member.characterId)) continue
      const char = characters.find(c => c.id === member.characterId)
      if (!char) continue

      const nameRegex = new RegExp(`(?<!@)${escapeRegExp(char.name)}`)
      if (nameRegex.test(userText)) {
        pushUnique(plan, char.id, { characterId: char.id, mustReply: true })
        continue
      }

      if (char.nicknames?.length) {
        for (const nick of char.nicknames) {
          const nickRegex = new RegExp(`(?<!@)${escapeRegExp(nick)}`)
          if (nickRegex.test(userText)) {
            pushUnique(plan, char.id, { characterId: char.id, mustReply: true })
            break
          }
        }
      }
    }

    // 4) 其余成员按概率
    for (const member of shuffleArray(groupMembers)) {
      if (!member.characterId) continue
      if (excluded.has(member.characterId)) continue
      pushUnique(plan, member.characterId, {
        characterId: member.characterId,
        mustReply: false,
        probability: normalizeReplyProbability(member.probability)
      })
    }

    // 兜底
    if (plan.length === 0) {
      for (const member of shuffleArray(groupMembers)) {
        if (!member.characterId) continue
        if (excluded.has(member.characterId)) continue
        plan.push({
          characterId: member.characterId,
          mustReply: false,
          probability: normalizeReplyProbability(member.probability)
        })
      }
    }

    return plan
  }

  return {
    buildReplyPlan,
    normalizeReplyProbability
  }
}
