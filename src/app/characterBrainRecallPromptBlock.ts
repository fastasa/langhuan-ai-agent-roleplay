import type { BrainRecallCandidateCard } from '../types'

type RecallPromptCard = Pick<BrainRecallCandidateCard, 'id' | 'k' | 'p' | 't' | 's' | 'eventDate' | 'scheduleActivation'>

type RecallPromptEntry = {
  title: string
  content: string
  card: RecallPromptCard
  orderIndex: number
  includeTitle: boolean
}

export type CleanRecallPromptSections = {
  profile: string
  general: string
  arrangement: string
  expression: string
}

function toCleanText(value: unknown): string {
  return String(value ?? '').trim()
}

function resolveRecallContent(card: RecallPromptCard, contentMap?: Map<string, string>): string {
  const body = toCleanText(contentMap?.get(card.id))
  if (body) return body
  return toCleanText(card.s)
}

function isExpressionCoreCard(card: RecallPromptCard): boolean {
  const id = toCleanText(card.id)
  const title = toCleanText(card.t)
  return id === 'brain:speaking_style'
    || id === 'brain:personality'
    || title === '说话风格'
    || title === '性格'
}

function isProfileCoreCard(card: RecallPromptCard): boolean {
  const id = toCleanText(card.id)
  const title = toCleanText(card.t)
  return id === 'brain:desc'
    || id === 'brain:appearance'
    || id === 'brain:outfit'
    || title === '简介'
    || title === '外貌特征'
    || title === '穿着'
}

function isArrangementCard(card: RecallPromptCard): boolean {
  const title = toCleanText(card.t)
  const path = toCleanText(card.p)
  return card.k === 'character_arrangement'
    || Boolean(card.scheduleActivation)
    || title.includes('安排')
    || path.includes('/安排/')
}

function isTrajectoryCard(card: RecallPromptCard): boolean {
  return card.k === 'character_trace'
}

function parseTimeOrder(value: unknown): number[] {
  const text = toCleanText(value)
  if (!text) return []
  const numbers = text.match(/\d+/g)
  if (!numbers) return []
  return numbers.map((item) => Number(item)).filter(Number.isFinite)
}

function compareTimeOrder(left: number[], right: number[]): number {
  if (!left.length && !right.length) return 0
  if (!left.length) return 1
  if (!right.length) return -1
  const length = Math.max(left.length, right.length)
  for (let index = 0; index < length; index += 1) {
    const diff = (left[index] ?? 0) - (right[index] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

function compareTrajectoryEntries(left: RecallPromptEntry, right: RecallPromptEntry): number {
  const dateDiff = compareTimeOrder(parseTimeOrder(left.card.eventDate), parseTimeOrder(right.card.eventDate))
  if (dateDiff !== 0) return dateDiff
  const pathDiff = compareTimeOrder(parseTimeOrder(left.card.p), parseTimeOrder(right.card.p))
  if (pathDiff !== 0) return pathDiff
  const titleDiff = compareTimeOrder(parseTimeOrder(left.card.t), parseTimeOrder(right.card.t))
  if (titleDiff !== 0) return titleDiff
  return left.orderIndex - right.orderIndex
}

function sortGeneralEntries(entries: RecallPromptEntry[]): RecallPromptEntry[] {
  const normalEntries = entries.filter((entry) => !isTrajectoryCard(entry.card))
  const trajectoryEntries = entries.filter((entry) => isTrajectoryCard(entry.card)).sort(compareTrajectoryEntries)
  return [...normalEntries, ...trajectoryEntries]
}

function formatEntries(title: string, entries: Array<{ title: string; content: string }>): string {
  if (!entries.length) return ''
  const lines: string[] = [title, '']
  for (const entry of entries) {
    if ('includeTitle' in entry && entry.includeTitle === false) {
      lines.push(entry.content, '')
    } else {
      lines.push(`## ${entry.title}`, entry.content, '')
    }
  }
  return lines.join('\n').trim()
}

function pushEntry(
  target: RecallPromptEntry[],
  card: RecallPromptCard,
  orderIndex: number,
  contentMap?: Map<string, string>
): void {
  const title = toCleanText(card.t) || '未命名资料'
  const content = resolveRecallContent(card, contentMap)
  if (!content) return
  const hasReadBody = Boolean(toCleanText(contentMap?.get(card.id)))
  const includeTitle = !(card.k === 'session_temporary_entity' && hasReadBody)
  target.push({ title, content, card, orderIndex, includeTitle })
}

export function buildCleanRecallPromptSections(
  characterName: string,
  cards: RecallPromptCard[],
  contentMap?: Map<string, string>
): CleanRecallPromptSections {
  const profileEntries: RecallPromptEntry[] = []
  const generalEntries: RecallPromptEntry[] = []
  const arrangementEntries: RecallPromptEntry[] = []
  const expressionEntries: RecallPromptEntry[] = []

  const safeCharacterName = toCleanText(characterName) || '未命名角色'
  for (let orderIndex = 0; orderIndex < cards.length; orderIndex += 1) {
    const card = cards[orderIndex]
    if (card.k === 'candidate_change') continue
    if (isArrangementCard(card)) {
      pushEntry(arrangementEntries, card, orderIndex, contentMap)
    } else if (isExpressionCoreCard(card)) {
      pushEntry(expressionEntries, card, orderIndex, contentMap)
    } else if (isProfileCoreCard(card)) {
      pushEntry(profileEntries, card, orderIndex, contentMap)
    } else {
      pushEntry(generalEntries, card, orderIndex, contentMap)
    }
  }

  const profile = profileEntries.length
    ? [
        '【当前人物】',
        `名称：${safeCharacterName}`,
        '',
        ...profileEntries.flatMap((entry) => entry.includeTitle ? [`## ${entry.title}`, entry.content, ''] : [entry.content, ''])
      ].join('\n').trim()
    : ''

  return {
    profile,
    general: formatEntries('【本轮相关资料】', sortGeneralEntries(generalEntries)),
    arrangement: formatEntries('【当前安排】', arrangementEntries),
    expression: formatEntries('【表达核心】', expressionEntries)
  }
}

/**
 * 最终聊天提示词专用召回块。
 * 只输出标题和可用正文；没有正文时才使用摘要，不输出标签、来源、类型或召回决策。
 */
export function buildCleanRecallPromptBlock(
  characterName: string,
  cards: RecallPromptCard[],
  contentMap?: Map<string, string>
): string {
  const sections = buildCleanRecallPromptSections(characterName, cards, contentMap)
  return [
    sections.profile,
    sections.general,
    sections.arrangement,
    sections.expression
  ].filter(Boolean).join('\n\n').trim()
}
