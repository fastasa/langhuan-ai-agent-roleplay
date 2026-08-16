import type { DirectorOrchestrationCandidate } from '../../shared/orchestrationWorkspace'

export interface FastReplyCandidate {
  participantId: string
  characterId: string
  displayName: string
  probability: number
  forced: boolean
}

export interface FastReplyPlanItem extends FastReplyCandidate {
  order: number
}

function normalizeProbability(value: unknown): number {
  const number = Number(value)
  if (!Number.isFinite(number)) return 1
  return Math.min(1, Math.max(0, number > 1 ? number / 100 : number))
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const result = [...items]
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.min(0.999999999, Math.max(0, random())) * (index + 1))
    ;[result[index], result[swapIndex]] = [result[swapIndex], result[index]]
  }
  return result
}

/**
 * 快速回复只消费统一编排投影中的正式 present。unknown/offstage 即使被强制点名也不进入本模式，
 * 避免绕过提调把“远程联系/回忆/安排登场”偷偷当成已经在场。
 */
export function planFastReplySpeakers(input: {
  candidates: DirectorOrchestrationCandidate[]
  probabilitiesByCharacterId?: Record<string, number>
  forcedCharacterIds?: string[]
  random?: () => number
}): FastReplyPlanItem[] {
  const random = input.random || Math.random
  const forced = new Set((input.forcedCharacterIds || []).map((id) => String(id || '').trim()).filter(Boolean))
  const seen = new Set<string>()
  const pool: FastReplyCandidate[] = []

  for (const candidate of input.candidates || []) {
    const characterId = String(candidate.characterId || '').trim()
    if (candidate.presenceState !== 'present' || candidate.reason !== 'present' || !characterId || seen.has(characterId)) continue
    seen.add(characterId)
    pool.push({
      participantId: String(candidate.participantId || '').trim(),
      characterId,
      displayName: String(candidate.displayName || characterId).trim(),
      probability: normalizeProbability(input.probabilitiesByCharacterId?.[characterId]),
      forced: forced.has(characterId)
    })
  }

  if (!pool.length) return []
  const selected = pool.filter((candidate) => candidate.forced || random() <= candidate.probability)
  if (!selected.length) selected.push(pool[Math.floor(Math.min(0.999999999, Math.max(0, random())) * pool.length)])

  return shuffle(selected, random)
    .sort((left, right) => Number(right.forced) - Number(left.forced))
    .map((candidate, index) => ({ ...candidate, order: index }))
}

/** 给快速回复提调规划器的边界提示，不是可直接交给正文模型的最终回复计划。 */
export function buildFastReplyPlanningHint(input: {
  speakerName: string
  userText: string
  priorSpeakerNames?: string[]
}): string {
  const prior = (input.priorSpeakerNames || []).filter(Boolean)
  return [
    `以${input.speakerName}的身份自然承接这次互动，只处理${input.speakerName}当前这一轮的反应。`,
    `只使用${input.speakerName}明确知道、亲历或现场能够观察到的信息。`,
    prior.length ? `本轮已有这些角色先发言：${prior.join('、')}。自然承接他们已经落库的内容，不重复抢答。` : '',
    '把当前应有的动作、态度或言语完整写出来；避免敷衍短句，也不要无事扩写。'
  ].filter(Boolean).join('\n')
}
