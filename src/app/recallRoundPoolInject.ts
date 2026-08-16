/**
 * 轮级资料池「注入侧」转换器 —— 单聊群聊统一与取料池化计划书 批次3·子批3c（隔离命门）。
 *
 * 隔离的最终防线在这里：角色生成提示词只注入「该角色私有池」、旁白生成提示词只注入「世界池」。
 * 本模块只做**纯映射**（RecallPoolCard[] → 注入载体），不做隔离裁剪——隔离由调用方传入的读接口保证：
 * - 角色侧必须传 getCharacterPoolCards(pools, X) 的结果（只该角色私有池·绝无世界池/他角色池）。
 * - 旁白侧必须传 getWorldPoolCards(pools) 的结果（只世界池·绝无任何角色私有卡）。
 *
 * 强断言（recallRoundPoolInject.spec）组合「真读接口 + 本转换器」，与运行时同一条链路：
 * 世界池独有 token 绝不进任一角色 recallSections；A 池 token 不进 B 的 recallSections；世界 token 只进旁白证据。
 */

import type { RecallPoolCard } from './recallRoundPool'
import type { PersonalityRecallSections } from './personalityModelContext'
import type { NarrativeRecallEvidence } from './narrationProtocol'

function cleanText(value: unknown): string {
  return String(value ?? '').trim()
}

/** 卡正文优先 bodyText（最全），无则回退 summary（与现役 buildCleanRecallPromptBlock「正文优先、摘要兜底」同口径）。 */
function resolveCardContent(card: RecallPoolCard): string {
  return cleanText(card.bodyText) || cleanText(card.summary)
}

/**
 * 角色生成提示词注入：把某角色私有池卡渲染成 recallSections.general（`【本轮相关资料】` 块）。
 * 与现役退役自动召回后的 recallSections 注入口同源——经 fetchChatPersonalityModelContextBySessionId 流入最终角色提示词。
 * 调用方必须传 getCharacterPoolCards(pools, X) 的结果，本函数不做隔离。无内容卡 → 返回 null（调用方据此不注入，零回归）。
 */
export function renderCharacterPoolRecallSections(cards: RecallPoolCard[]): PersonalityRecallSections | null {
  const entries: string[] = []
  for (const card of Array.isArray(cards) ? cards : []) {
    const content = resolveCardContent(card)
    if (!content) continue
    const title = cleanText(card.title)
    entries.push(title ? `## ${title}\n${content}` : content)
  }
  if (!entries.length) return null
  const general = ['【本轮相关资料】', '', entries.join('\n\n')].join('\n').trim()
  return { general }
}

/**
 * 旁白生成提示词注入：把世界池卡映射成旁白「文档库环境资料」证据（NarrativeRecallEvidence[]）。
 * 经 generateAndWriteNarration 的 recallEvidence 流入旁白提示词「文档库环境资料」块（formatRecallEvidenceForPrompt 取前 3）。
 * 调用方必须传 getWorldPoolCards(pools)（只世界池·绝无角色私有卡）。无卡 → 返回 []。
 */
export function worldPoolCardsToNarrationEvidence(cards: RecallPoolCard[]): NarrativeRecallEvidence[] {
  const out: NarrativeRecallEvidence[] = []
  for (const card of Array.isArray(cards) ? cards : []) {
    const documentId = cleanText(card.id)
    if (!documentId) continue
    const summary = cleanText(card.summary)
    const bodyText = cleanText(card.bodyText)
    const evidence: NarrativeRecallEvidence = {
      documentId,
      title: cleanText(card.title) || documentId,
      displayPath: '',
      documentType: '世界本源知识',
      score: Number.isFinite(Number(card.score)) ? Number(card.score) : 0,
      reason: '轮级世界知识池预召回（仅供旁白承接环境/背景）',
      readDecision: 'summary_only'
    }
    if (summary) evidence.summary = summary
    if (bodyText) evidence.excerpt = bodyText
    out.push(evidence)
  }
  return out
}
