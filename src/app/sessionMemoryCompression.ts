/**
 * 会话记忆压缩（滚动会话记忆）—— 世界总编排器升格计划书 批次 4「上下文压缩/记忆」。
 *
 * 选型（用户 2026-06-19 拍板）：**自研借 Mastra Observational Memory 思路**，不整包加 Mastra 依赖。
 * 核心问题：长会话里 `compressPersonalityContext` 只保留最近 8 条投影事实、更早的直接丢；召回能语义找回
 * 部分，但缺一个「会话达阈值自动压缩、把较早事实浓缩进滚动记忆、不丢关键记忆」的机制。本模块即这套逻辑。
 *
 * 设计（与自研投影真值层对齐，纯函数、可测、读写解耦）：
 * - 触发：会话投影事实总数超 {@link SESSION_MEMORY_FACT_THRESHOLD} 才启用（短会话不需要）。
 * - 折叠：保留最近 {@link SESSION_MEMORY_KEEP_RECENT} 条逐字（由 compress + 召回承接），把更早、且尚未折叠
 *   （messageId > watermark）的事实，用 AI 合并进已有滚动摘要。
 * - 节流：距上次折叠新增可折叠事实 ≥ {@link SESSION_MEMORY_REFRESH_STEP} 才重算，避免每轮都调模型。
 * - watermark：已折叠进摘要的最高 messageId（持久化在 chat_sessions.context_summary_message_id）。
 *
 * 安全默认：无摘要时注入侧完全不动（零回归）；本模块只产逻辑/提示词，真实 AI 调用与持久化由发送链路接。
 */

/** 一条可折叠的投影事实（来自 personality_model 投影上下文项）。 */
export interface SessionMemoryFact {
  /** 消息 id，作为 watermark 比较与折叠边界。 */
  messageId: number
  /** 该消息的客观事实投影正文。 */
  fact: string
  /** 说话者（用于摘要里保留「谁做了什么」）。 */
  speakerName?: string
}

/** 投影事实总数超此才启用滚动记忆压缩（短会话无需，直接走原 compress）。 */
export const SESSION_MEMORY_FACT_THRESHOLD = 30
/** 最近 N 条事实保留逐字、不折叠进摘要（由 compressPersonalityContext 的 last-N + 召回承接）。 */
export const SESSION_MEMORY_KEEP_RECENT = 12
/** 距上次折叠新增可折叠事实 ≥ 此数才重算摘要（节流，避免每轮调模型）。 */
export const SESSION_MEMORY_REFRESH_STEP = 10
/** 滚动摘要长度上限（字符）：摘要是「早期事实的浓缩」，不应膨胀到接近原文。 */
export const SESSION_MEMORY_MAX_SUMMARY_CHARS = 1200

/** 折叠选择结果。 */
export interface SessionMemoryFoldSelection {
  /** 本次要折叠进摘要的较早事实（messageId 升序）。 */
  foldFacts: SessionMemoryFact[]
  /** 折叠后应更新的 watermark（最高已折叠 messageId）；无新折叠则回退原 watermark。 */
  latestFoldedMessageId: number
}

function sortByMessageId(facts: SessionMemoryFact[]): SessionMemoryFact[] {
  return facts
    .filter((item) => item && Number.isFinite(item.messageId) && String(item.fact || '').trim())
    .slice()
    .sort((a, b) => a.messageId - b.messageId)
}

/**
 * 选出本次要折叠的较早事实：保留最近 keepRecent 条逐字，其余里取 messageId > watermark 的。
 * 不变量：foldFacts 全部 messageId ≤ 最近窗口边界、且 > watermark；latestFoldedMessageId 单调不减。
 */
export function selectSessionMemoryFold(
  facts: SessionMemoryFact[],
  options: { watermarkMessageId?: number; keepRecent?: number } = {}
): SessionMemoryFoldSelection {
  const watermark = Number.isFinite(options.watermarkMessageId) ? Number(options.watermarkMessageId) : 0
  const keepRecent = Number.isFinite(options.keepRecent) ? Number(options.keepRecent) : SESSION_MEMORY_KEEP_RECENT
  const sorted = sortByMessageId(facts)
  const foldableCount = Math.max(0, sorted.length - Math.max(0, keepRecent))
  const foldCandidates = sorted.slice(0, foldableCount)
  const foldFacts = foldCandidates.filter((item) => item.messageId > watermark)
  const latestFoldedMessageId = foldFacts.length
    ? foldFacts[foldFacts.length - 1].messageId
    : watermark
  return { foldFacts, latestFoldedMessageId }
}

/**
 * 是否需要重算滚动摘要：事实总数过阈值，且本次可折叠新事实数达到节流步长。
 * 阈值未到（短会话）一律不压缩，保持原行为。
 */
export function shouldRefreshSessionMemory(
  facts: SessionMemoryFact[],
  options: { watermarkMessageId?: number; keepRecent?: number; step?: number; threshold?: number } = {}
): boolean {
  const threshold = Number.isFinite(options.threshold) ? Number(options.threshold) : SESSION_MEMORY_FACT_THRESHOLD
  const step = Number.isFinite(options.step) ? Number(options.step) : SESSION_MEMORY_REFRESH_STEP
  const sorted = sortByMessageId(facts)
  if (sorted.length <= threshold) return false
  const { foldFacts } = selectSessionMemoryFold(sorted, {
    watermarkMessageId: options.watermarkMessageId,
    keepRecent: options.keepRecent
  })
  return foldFacts.length >= step
}

/** 把折叠事实渲染成提示词正文（messageId 升序，谁做了什么）。 */
function renderFoldFacts(foldFacts: SessionMemoryFact[]): string {
  return foldFacts
    .map((item) => {
      const speaker = String(item.speakerName || '').trim()
      const fact = String(item.fact || '').trim()
      return speaker ? `${speaker}：${fact}` : fact
    })
    .filter(Boolean)
    .join('\n')
}

/**
 * 构造「把已有滚动摘要 + 新增较早事实合并成新滚动记忆」的 AI 提示词。
 * 约束写进提示词：只压缩较早历史的要点（关键事实/决定/关系/未决线索），不复述近期细节（近期由原文承接），
 * 不编造、不评论、不输出标题/JSON，长度受控。
 */
export function buildSessionMemoryPrompt(
  existingSummary: string,
  foldFacts: SessionMemoryFact[]
): Array<{ role: 'system' | 'user'; content: string }> {
  const system = [
    '你是会话记忆压缩器，负责维护一段「滚动会话记忆」——长对话里较早历史的浓缩，供后续生成回复时不丢关键记忆。',
    '把【已有记忆】和【新增较早事实】合并成一段更新后的滚动记忆：',
    '1. 只保留对后续剧情有用的要点：关键事实、已做的决定、人物关系进展、未解决的线索或承诺、重要转折。',
    '2. 合并同类、去重、删冗余；越早越概括，不必逐条复述。',
    '3. 不复述最近几轮的细节（最近内容由原文承接），不编造未发生的内容，不加评论或推断。',
    '4. 用简洁中文连续叙述，不要标题、列表、JSON 或解释。',
    `5. 总长控制在 ${SESSION_MEMORY_MAX_SUMMARY_CHARS} 字以内，信息密度优先。`
  ].join('\n')
  const user = [
    '【已有记忆】',
    String(existingSummary || '').trim() || '（暂无，本次为首次生成）',
    '',
    '【新增较早事实】（按时间先后）',
    renderFoldFacts(foldFacts) || '（无）',
    '',
    '请输出更新后的滚动会话记忆正文。'
  ].join('\n')
  return [
    { role: 'system', content: system },
    { role: 'user', content: user }
  ]
}

/** 清洗摘要模型输出：剥代码块/前后空白，截到长度上限。失败返回空串（调用方据此跳过持久化，不污染旧摘要）。 */
export function parseSessionMemorySummaryOutput(raw: unknown): string {
  let text = typeof raw === 'string' ? raw : (raw == null ? '' : String(raw))
  text = text.replace(/```[a-zA-Z]*\n?/g, '').replace(/```/g, '').trim()
  if (!text) return ''
  if (text.length > SESSION_MEMORY_MAX_SUMMARY_CHARS) {
    text = text.slice(0, SESSION_MEMORY_MAX_SUMMARY_CHARS).trim()
  }
  return text
}

/** 注入用「会话记忆摘要」块；无摘要返回空串（注入侧据此完全不注入，零回归）。 */
export function buildSessionMemoryContextBlock(summary: string): string {
  const text = String(summary || '').trim()
  if (!text) return ''
  return `会话记忆摘要：\n${text}`
}
