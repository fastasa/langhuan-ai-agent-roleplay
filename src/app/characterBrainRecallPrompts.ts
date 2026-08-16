/**
 * 召回上下文压缩提示词
 * 专门服务多轮召回决策，不复用聊天总结提示词。
 * 目标：把最近 30 条聊天记录压缩成召回层可直接使用的上下文摘要。
 */

/** 压缩提示词里"最近聊天记录"的注入占位符 */
export const RECENT_CHAT_MESSAGES_PLACEHOLDER = '{recent_chat_messages}'

/**
 * 召回上下文压缩提示词模板。
 * 用于多轮召回的第一轮之前，由 AI 把最近聊天压缩成三个结构化块：
 * 核心话题、涉及关键词、潜在查询方向。
 * 第一版管线中本提示词作为参考存档，实际由本地关键词提取替代 AI 压缩步骤。
 */
export const RECALL_CONTEXT_COMPRESSION_PROMPT_TEMPLATE = `【召回上下文压缩】

你是召回上下文压缩助手。请基于下方最近的聊天记录，提炼对角色资料检索最有参考价值的核心信息。

## 当前核心话题
（用 1-2 句话总结此刻聊天的核心内容，不超过 60 字）

## 涉及关键词
（每类最多 5 项，每项不超过 10 字，用顿号分隔）
- 人物：
- 地点：
- 事件 / 行为：
- 情绪 / 状态：
- 时间节点：
- 主题 / 概念：

## 潜在查询方向
（推断这轮对话最可能需要从角色大脑里补充哪类资料，最多 5 条，每条不超过 20 字）
-

---
限制：
1. 不重复原文，只保留对召回判断有用的信息。
2. 如果对话内容与角色资料检索几乎无关（如简单闲聊），在"潜在查询方向"里写"本轮无明确查询需求"。
3. 只输出三个区块，不输出其他内容。

---
最近聊天记录：
{recent_chat_messages}`

type MessageLike = {
  role?: string
  name?: string
  content?: string
  text?: string
}

/**
 * 把最近消息格式化成压缩提示词需要的输入文本。
 * 超过 30 条时只取最后 30 条。
 */
export function buildRecallContextFromMessages(messages: MessageLike[]): string {
  const recent = messages.slice(-30)
  if (!recent.length) return '（当前没有聊天记录）'
  return recent
    .map((msg, index) => {
      const speaker = msg.name?.trim() || msg.role || '未知'
      const content = (msg.content ?? msg.text ?? '').trim()
      return `${index + 1}. [${speaker}] ${content.slice(0, 200)}`
    })
    .join('\n')
}

/**
 * 从最近消息里本地提取关键词集合。
 * 作为 AI 压缩步骤的轻量替代，用于第一版管线的候选卡评分。
 * 提取规则：取 2-6 字的中文词，去重，最多保留 120 个。
 */
export function extractKeywordsFromMessages(messages: MessageLike[]): Set<string> {
  const combinedText = messages
    .slice(-30)
    .map((msg) => String(msg.content ?? msg.text ?? ''))
    .join(' ')
  const matches = combinedText.match(/[\u4e00-\u9fa5]{2,6}/g) ?? []
  const keywords = new Set<string>()
  for (const word of matches) {
    if (keywords.size >= 120) break
    keywords.add(word)
  }
  return keywords
}

function normalizeRelationHintLabel(value: string): string {
  const match = value.match(/\[\[([^\]]+)\]\]\s*_\s*([^_]+)\s*_\s*\[\[([^\]]+)\]\]/)
  if (!match) return value.trim()
  return `${match[3].trim()}-${match[2].trim()}-${match[1].trim()}`
}

export function buildRecallJudgmentPrompt(
  compressedContext: string,
  candidateCards: Array<{
    id: string
    k?: string
    t?: string
    s?: string
    tags?: string[]
    relationHints?: string[]
  }>,
  alreadyConfirmedIds: string[] = []
): string {
  const confirmed = new Set(alreadyConfirmedIds)
  const rows = candidateCards.map((card, index) => {
    const relationHints = Array.isArray(card.relationHints) ? card.relationHints : []
    const relationText = relationHints.length
      ? `用户声明:${relationHints.map(normalizeRelationHintLabel).join('；')}`
      : ''
    const sourceText = card.k === 'candidate_change' ? 'AI建议候选' : '用户声明资料'
    return [
      `C${String(index + 1).padStart(2, '0')}`,
      sourceText,
      card.t || card.id,
      card.s || '',
      relationText,
      confirmed.has(card.id) ? '已确认' : ''
    ].filter(Boolean).join('｜')
  }).join('\n')
  return [
    '【召回候选裁判】',
    compressedContext,
    '',
    rows
  ].join('\n')
}
