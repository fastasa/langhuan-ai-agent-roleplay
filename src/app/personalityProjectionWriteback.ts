import type { CharacterBrainTraceNode } from '../types/characterBrain'

export type ProjectionWritebackPromptMessage = { role: 'system' | 'user' | 'assistant'; content: string }

export type ProjectionWritebackPromptTrace = {
  messages: ProjectionWritebackPromptMessage[]
  finalPrompt: string
  promptBlocks: Array<{ role: 'system' | 'user' | 'assistant'; title: string; content: string }>
}

export type ProjectionWritebackSource = {
  id: string
  messageId: number
  text: string
  time?: string
  location?: string
}

export type ProjectionWritebackEvent = {
  id: string
  title: string
  summary: string
  content: string
  sourceProjectionIds: string[]
}

export type ProjectionWritebackMatchCandidate = {
  targetId: string
  title: string
  summary: string
  content: string
  score: number
}

export type ProjectionWritebackMatchDecision = {
  targetId: string
  reason: string
}

function toText(value: unknown): string {
  return String(value ?? '').trim()
}

function parseJsonValue(value: unknown): any {
  if (value && typeof value === 'object') return value
  const text = toText(value).replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
  const objectStart = text.indexOf('{')
  const objectEnd = text.lastIndexOf('}')
  const source = objectStart >= 0 && objectEnd > objectStart ? text.slice(objectStart, objectEnd + 1) : text
  return JSON.parse(source)
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map((item) => toText(item)).filter(Boolean)
}

function buildTrace(messages: ProjectionWritebackPromptMessage[], promptBlocks: ProjectionWritebackPromptTrace['promptBlocks']): ProjectionWritebackPromptTrace {
  return {
    messages,
    finalPrompt: messages.map((message) => `${message.role.toUpperCase()}:\n${message.content}`).join('\n\n'),
    promptBlocks
  }
}

export function buildProjectionWritebackSplitPrompt(input: {
  characterName: string
  projections: ProjectionWritebackSource[]
}): ProjectionWritebackPromptTrace {
  const sourceText = input.projections
    .map((item, index) => [
      `#${index + 1} ${item.id}`,
      `消息序号：${item.messageId}`,
      item.time ? `时间：${item.time}` : '',
      item.location ? `地点：${item.location}` : '',
      `事实：${item.text}`
    ].filter(Boolean).join('\n'))
    .join('\n\n')
  const system = [
    '你负责把给定投影事实整理成角色轨迹事件草案。',
    '只依据输入事实，不补写没有发生的行动、心理结论或因果。',
    '强制合并优先：把同一场景、同一段连续互动或同一因果链上的多条事实合并成一个事件单位，不要按每条消息或每个动作逐条建事件；只有发生明显场景切换（时间大跨度、地点转移或话题完全转换）时才另起新事件。',
    '宁可少拆也不要碎片化：一个写入窗口通常只产出 1~3 个事件，事件越少越好，但不能把明显不相关的两件事强行并成一个。',
    '事件的时间、地点一律以输入投影里的时间/地点字段为真值，不得编造；时间统一写到具体日期（如 2026-06-08），能确定更细时刻时可在日期后追加。',
    '输出 JSON，不要解释。'
  ].join('\n')
  const user = [
    `角色：${input.characterName}`,
    '',
    '输入投影：',
    sourceText || '无',
    '',
    '输出格式：',
    '{"events":[{"id":"event_1","title":"短标题","summary":"一句摘要，必须写明事件发生的日期与地点","content":"可写入轨迹的事实正文，必须包含时间（写到日期）、地点、在场人物；缺少就写未明确","sourceProjectionIds":["投影ID"]}]}',
    '',
    '规则：',
    '1. sourceProjectionIds 只能使用输入里的投影 ID。',
    '2. content 写已发生事实，不写候选计划。',
    '3. 每个事件必须至少绑定一条来源投影。',
    '4. summary 与 content 都必须写明事件发生的时间（精确到日期）与地点；输入里缺失就写「未明确」，不要省略这两项。',
    '5. 合并粒度：一段连续发生、地点和话题连贯的互动只输出一个事件，正文按时间顺序把这段互动连贯叙述，不要拆成多条；时间与地点取这段互动的整体范围（例如「23:25 至次日 00:30，家中客厅」），避免被拆碎成单条瞬间。'
  ].join('\n')
  return buildTrace([
    { role: 'system', content: system },
    { role: 'user', content: user }
  ], [
    { role: 'system', title: '投影写轨迹 · 事件拆分规则', content: system },
    { role: 'user', title: '投影写轨迹 · 事件拆分材料', content: user }
  ])
}

export function normalizeProjectionWritebackSplitOutput(output: unknown, allowedProjectionIds: string[]): ProjectionWritebackEvent[] {
  const allowed = new Set(allowedProjectionIds.map(toText).filter(Boolean))
  const parsed = parseJsonValue(output)
  const events = Array.isArray(parsed?.events) ? parsed.events : []
  const normalized = events
    .map((item: any, index: number) => {
      const sourceProjectionIds = normalizeStringList(item?.sourceProjectionIds ?? item?.source_projection_ids)
        .filter((id) => allowed.has(id))
      return {
        id: toText(item?.id) || `event_${index + 1}`,
        title: toText(item?.title).slice(0, 80),
        summary: toText(item?.summary).slice(0, 200),
        content: toText(item?.content),
        sourceProjectionIds
      }
    })
    .filter((item: ProjectionWritebackEvent) => item.title && item.content && item.sourceProjectionIds.length)
  if (!normalized.length) throw new Error('事件拆分输出没有可写入事件')
  return normalized
}

export function buildProjectionWritebackMergePrompt(input: {
  characterName: string
  event: ProjectionWritebackEvent
  target: CharacterBrainTraceNode
}): ProjectionWritebackPromptTrace {
  const system = [
    '你负责把新事件事实融合进已有角色轨迹事件单位。',
    '只能合并已发生事实，不新增未给出的动机、决定或结果。',
    '保留已有事件的核心信息，加入新事实后的正文应连贯可读。',
    '融合后的摘要与正文都必须保留事件发生的时间（写到日期）与地点；新旧信息冲突时以新事实为准，缺失写「未明确」。',
    '输出 JSON，不要解释。'
  ].join('\n')
  const user = [
    `角色：${input.characterName}`,
    '',
    '已有事件单位：',
    `标题：${input.target.title || input.target.displayTitle || '未命名事件'}`,
    `摘要：${input.target.summary || input.target.note || '无'}`,
    `正文：${input.target.content || '无'}`,
    '',
    '新事件事实：',
    `标题：${input.event.title}`,
    `摘要：${input.event.summary}`,
    `正文：${input.event.content}`,
    '',
    '输出格式：',
    '{"title":"融合后标题","summary":"融合后一句摘要（含日期与地点）","content":"融合后正文（含日期与地点）"}'
  ].join('\n')
  return buildTrace([
    { role: 'system', content: system },
    { role: 'user', content: user }
  ], [
    { role: 'system', title: '投影写轨迹 · 事件融合规则', content: system },
    { role: 'user', title: '投影写轨迹 · 事件融合材料', content: user }
  ])
}

export function normalizeProjectionWritebackMergeOutput(output: unknown, fallback: ProjectionWritebackEvent): Pick<ProjectionWritebackEvent, 'title' | 'summary' | 'content'> {
  const parsed = parseJsonValue(output)
  const title = toText(parsed?.title || fallback.title).slice(0, 80)
  const summary = toText(parsed?.summary || fallback.summary).slice(0, 200)
  const content = toText(parsed?.content || fallback.content)
  if (!title || !content) throw new Error('事件融合输出缺少标题或正文')
  return { title, summary, content }
}

export function buildProjectionWritebackMatchPrompt(input: {
  event: ProjectionWritebackEvent
  candidates: ProjectionWritebackMatchCandidate[]
}): ProjectionWritebackPromptTrace {
  const system = [
    '你负责判断新事件应该并入哪个已有事件单位，或新建事件单位。',
    '只根据事件是否描述同一件已发生事实判断，不根据主题相似就强行合并。',
    '输出 JSON，不要解释。'
  ].join('\n')
  const candidateText = input.candidates
    .map((item, index) => [
      `#${index + 1} ${item.targetId}`,
      `相似度：${item.score.toFixed(3)}`,
      `标题：${item.title}`,
      `摘要：${item.summary}`,
      `正文：${item.content}`
    ].join('\n'))
    .join('\n\n')
  const user = [
    '新事件：',
    `标题：${input.event.title}`,
    `摘要：${input.event.summary}`,
    `正文：${input.event.content}`,
    '',
    '候选已有事件：',
    candidateText || '无',
    '',
    '如果都不是同一事件，targetId 输出 "new"。',
    '输出格式：{"targetId":"候选ID或new","reason":"一句判断原因"}'
  ].join('\n')
  return buildTrace([
    { role: 'system', content: system },
    { role: 'user', content: user }
  ], [
    { role: 'system', title: '投影写轨迹 · 事件匹配规则', content: system },
    { role: 'user', title: '投影写轨迹 · 事件匹配材料', content: user }
  ])
}

export function normalizeProjectionWritebackMatchOutput(output: unknown, allowedTargetIds: string[]): ProjectionWritebackMatchDecision {
  const parsed = parseJsonValue(output)
  const allowed = new Set([...allowedTargetIds.map(toText).filter(Boolean), 'new'])
  const targetId = toText(parsed?.targetId ?? parsed?.target_id)
  if (!allowed.has(targetId)) throw new Error('事件匹配输出指向了不存在的候选')
  return {
    targetId,
    reason: toText(parsed?.reason).slice(0, 200)
  }
}

export function scoreProjectionWritebackTextSimilarity(left: string, right: string): number {
  const leftMap = buildTokenMap(left)
  const rightMap = buildTokenMap(right)
  let dot = 0
  let leftNorm = 0
  let rightNorm = 0
  for (const value of leftMap.values()) leftNorm += value * value
  for (const value of rightMap.values()) rightNorm += value * value
  for (const [key, value] of leftMap.entries()) {
    dot += value * (rightMap.get(key) || 0)
  }
  if (!leftNorm || !rightNorm) return 0
  return Math.round((dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm))) * 1000) / 1000
}

function buildTokenMap(value: string): Map<string, number> {
  const text = toText(value).toLowerCase()
  const map = new Map<string, number>()
  const words = text.match(/[a-z0-9]+|[\u4e00-\u9fa5]/g) || []
  for (let index = 0; index < words.length; index += 1) {
    const token = words[index]
    map.set(token, (map.get(token) || 0) + 1)
    const next = words[index + 1]
    if (next) {
      const pair = `${token}${next}`
      map.set(pair, (map.get(pair) || 0) + 0.8)
    }
  }
  return map
}
