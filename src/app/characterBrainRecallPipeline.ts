/**
 * 角色大脑智能召回管线（第一版）
 *
 * 相比旧的"按时间取前 N 张"，本版本：
 * 1. 按脑链复杂度决定首批切片大小（复杂度 < 10 取 80%，≥ 10 先取 10 张）
 * 2. 对核心 / 灵魂卡按当前聊天关键词评分排序
 * 3. 对轨迹卡优先取关键词最相关 + 最新的前 5 张
 * 4. 候选变更卡在 limit 范围内全量纳入
 * 5. 关联扩展：选中卡 [[文档名]] 关联的其它卡单跳补入（不超 limit）
 *
 * 后续升级方向：在首批切片前加 AI 上下文压缩步骤，
 * 替换本地关键词提取为多轮模型判断（见 characterBrainRecallPrompts.ts）。
 */

import type { BrainDocumentRecord, BrainRecallCandidateCard, Character } from '../types'
import type { DocLibraryRecallStructureOptions } from './characterBrainRecallStructure'
import { createCharacterBrainReadContext, readCharacterBrainCompilePage, type CharacterBrainReadContext } from './characterBrain'
import {
  buildCharacterBrainRecallCandidateCards,
  buildCharacterBrainRecallPromptBlock
} from './characterBrainRecall'
import { buildCleanRecallPromptBlock } from './characterBrainRecallPromptBlock'
import { extractKeywordsFromMessages } from './characterBrainRecallPrompts'
import { parseRelationHintLine } from './relationHintParser'

function toText(value: unknown, fallback = ''): string {
  if (value === undefined || value === null) return fallback
  return String(value)
}

type MessageLike = {
  role?: string
  name?: string
  content?: string
  text?: string
}
type LocalRecallOptions = {
  currentDate?: Date
  docLibraryStructure?: DocLibraryRecallStructureOptions
}

// ── 关联协议：只用合法声明关系做单跳扩展 ─────────────────────────────────────

function buildTitleToIdMap(cards: BrainRecallCandidateCard[]): Map<string, string> {
  return new Map(cards.map((card) => [card.t, card.id]))
}

/** 读取每张卡的编译页 relationHints，解析成目标卡 ID 索引 */
function buildRelationIndex(
  character: Character,
  cards: BrainRecallCandidateCard[],
  titleToId: Map<string, string>,
  readContext: CharacterBrainReadContext
): Map<string, string[]> {
  const index = new Map<string, string[]>()
  for (const card of cards) {
    const compilePage = readCharacterBrainCompilePage(character, card.id, readContext)
    const hints = compilePage?.relationHints?.length
      ? compilePage.relationHints
      : card.relationHints || []
    hints.forEach((hint, lineIndex) => {
      const parsed = parseRelationHintLine(hint, lineIndex)
      parsed.assertions.forEach((assertion) => {
        const sourceId = titleToId.get(assertion.normalizedSourceTitle)
        const targetId = titleToId.get(assertion.normalizedTargetTitle)
        if (!sourceId || !targetId || sourceId === targetId) return
        addRelationIndexEdge(index, sourceId, targetId)
        addRelationIndexEdge(index, targetId, sourceId)
      })
      parsed.legacyHints.forEach((legacyHint) => {
        const targetId = titleToId.get(legacyHint.targetTitle)
        if (!targetId || targetId === card.id) return
        addRelationIndexEdge(index, card.id, targetId)
        addRelationIndexEdge(index, targetId, card.id)
      })
    })
  }
  return index
}

function addRelationIndexEdge(index: Map<string, string[]>, sourceId: string, targetId: string) {
  const current = index.get(sourceId) || []
  if (!current.includes(targetId)) index.set(sourceId, [...current, targetId])
}

// ── 评分 ──────────────────────────────────────────────────────────────────────

function scoreCardRelevance(card: BrainRecallCandidateCard, keywords: Set<string>): number {
  if (!keywords.size) return 0
  const searchText = [card.s, ...(card.tags || []), ...(card.relationHints || [])].join(' ')
  let score = 0
  for (const kw of keywords) {
    if (searchText.includes(kw)) score++
  }
  return score
}

// ── 批次规则 ──────────────────────────────────────────────────────────────────

function computeBrainComplexity(cards: BrainRecallCandidateCard[]): number {
  return cards.filter(
    (c) => c.k === 'character_core' || c.k === 'character_soul' || c.k === 'public_compile_page'
  ).length
}

/**
 * 首批切片大小规则（摘自重整稿第七节）：
 * - 复杂度 < 10：取 80%（小图场景）
 * - 复杂度 ≥ 10：固定取 10 张（大图场景第一轮）
 */
function computeFirstBatchSize(complexity: number): number {
  if (complexity < 10) return Math.max(1, Math.ceil(complexity * 0.8))
  return 10
}

// ── 关联扩展 ──────────────────────────────────────────────────────────────────

function expandByRelations(
  selectedIds: Set<string>,
  relationIndex: Map<string, string[]>,
  allIdSet: Set<string>,
  budget: number
): Set<string> {
  const expanded = new Set(selectedIds)
  let added = 0
  for (const id of selectedIds) {
    if (added >= budget) break
    for (const relId of relationIndex.get(id) ?? []) {
      if (!expanded.has(relId) && allIdSet.has(relId)) {
        expanded.add(relId)
        added++
        if (added >= budget) break
      }
    }
  }
  return expanded
}

// ── 主函数 ────────────────────────────────────────────────────────────────────

/**
 * 运行本地智能召回管线，返回按相关性排序的候选卡列表。
 * 无 AI 调用，全部在本地完成。
 */
export function runLocalRecallPipeline(
  character: Character,
  documents: BrainDocumentRecord[],
  recentMessages: MessageLike[],
  limit = 12,
  options: LocalRecallOptions = {}
): BrainRecallCandidateCard[] {
  const readContext = createCharacterBrainReadContext(character)
  const allCards = buildCharacterBrainRecallCandidateCards(character, documents, {
    currentDate: options.currentDate,
    docLibraryStructure: options.docLibraryStructure,
    readContext
  })
  if (!allCards.length) return []

  // 分类
  const coreSoulCards = allCards.filter(
    (c) => c.k === 'character_core' || c.k === 'character_soul' || c.k === 'public_compile_page'
  )
  const traceCards = allCards.filter((c) => c.k === 'character_trace')
  const candidateCards = allCards.filter((c) => c.k === 'candidate_change')

  // 本地关键词提取（未来可替换为 AI 压缩结果）
  const keywords = extractKeywordsFromMessages(recentMessages)

  // 核心 / 灵魂：关键词评分 + 按更新时间降序，取首批
  const complexity = computeBrainComplexity(allCards)
  const firstBatchSize = computeFirstBatchSize(complexity)
  const scoredCoreSoul = coreSoulCards
    .map((card) => ({ card, score: scoreCardRelevance(card, keywords) }))
    .sort(
      (a, b) =>
        b.score - a.score ||
        String(b.card.u || '').localeCompare(String(a.card.u || ''))
    )
  const selectedCoreSoul = scoredCoreSoul.slice(0, firstBatchSize).map((x) => x.card)

  // 轨迹：关键词评分 + 更新时间，取最相关前 5
  const scoredTrace = traceCards
    .map((card) => ({ card, score: scoreCardRelevance(card, keywords) }))
    .sort(
      (a, b) =>
        b.score - a.score ||
        String(b.card.u || '').localeCompare(String(a.card.u || ''))
    )
  const selectedTrace = scoredTrace.slice(0, 5).map((x) => x.card)

  // 候选变更：全量纳入（limit 范围内）
  const initial = [...selectedCoreSoul, ...selectedTrace, ...candidateCards]

  // 关联扩展（单跳）
  const titleToId = buildTitleToIdMap(allCards)
  const relationIndex = buildRelationIndex(character, allCards, titleToId, readContext)
  const allIdSet = new Set(allCards.map((c) => c.id))
  const selectedIdSet = new Set(initial.map((c) => c.id))
  const expandBudget = Math.max(0, limit - initial.length)
  const expandedIds =
    expandBudget > 0
      ? expandByRelations(selectedIdSet, relationIndex, allIdSet, expandBudget)
      : selectedIdSet

  // 最终列表：已选 + 扩展，截取 limit
  const cardById = new Map(allCards.map((c) => [c.id, c]))
  const finalIds = [
    ...selectedIdSet,
    ...[...expandedIds].filter((id) => !selectedIdSet.has(id))
  ]
  return finalIds
    .map((id) => cardById.get(id))
    .filter((c): c is BrainRecallCandidateCard => Boolean(c))
    .slice(0, limit)
}

/**
 * 智能召回文本块。
 * 替换 useAI.ts 里旧的 buildCharacterBrainRecallPromptBlock 调用点。
 * 无最近消息时自动回退到旧的按日期取前 limit 张逻辑。
 */
export function buildSmartRecallPromptBlock(
  character: Character,
  documents: BrainDocumentRecord[],
  recentMessages: MessageLike[],
  limit = 12,
  options: LocalRecallOptions = {}
): string {
  if (!recentMessages.length) {
    return buildCharacterBrainRecallPromptBlock(character, documents, limit, options)
  }
  const cards = runLocalRecallPipeline(character, documents, recentMessages, limit, options)
    .filter((card) => card.k !== 'candidate_change')
  if (!cards.length) return ''
  const characterName = String((character as unknown as Record<string, unknown>).name || '未命名角色')
  return buildCleanRecallPromptBlock(characterName, cards)
}
