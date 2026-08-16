import {
  DEFAULT_REPLY_PLAN_WORD_COUNT_ADVICE,
  parseReplyPlanWordCountAdvice,
  type ReplyPlanExpressionMix,
  type ReplyPlanWordCountAdvice
} from './personalityPlanOrchestrator'
import { buildEmbeddedMessageProjectionInstruction } from './messageProjectionAgent'
import { buildSessionMemoryContextBlock } from './sessionMemoryCompression'

export type PersonalityProjectionStatus = 'complete' | 'partial' | 'failed' | 'running' | string

export type PersonalityProjectionEnv = {
  time?: string
  locationLarge?: string
  locationMiddle?: string
  locationSmall?: string
  location?: string
  weather?: string
}

export type PersonalityProjectionRow = {
  id?: string
  messageId?: number
  message_id?: number
  status?: PersonalityProjectionStatus
  speakerName?: string
  speaker_name?: string
  audienceNames?: string[] | string
  audience_names_json?: string
  objectiveFact?: string
  objective_fact?: string
  fallbackCleanText?: string
  fallback_clean_text?: string
  startEnv?: PersonalityProjectionEnv | string
  startEnvJson?: PersonalityProjectionEnv | string
  start_env_json?: PersonalityProjectionEnv | string
  endEnv?: PersonalityProjectionEnv | string
  endEnvJson?: PersonalityProjectionEnv | string
  end_env_json?: PersonalityProjectionEnv | string
  changed?: { time?: boolean; location?: boolean } | string
  changedJson?: { time?: boolean; location?: boolean } | string
  changed_json?: { time?: boolean; location?: boolean } | string
  createdAt?: string
  created_at?: string
}

export type PersonalityRecallSections = {
  profile?: string
  general?: string
  arrangement?: string
  expression?: string
}

export type PersonalityPlanCandidate = {
  id?: string
  content?: string
  score?: number
  strategy?: string
  strategyLabel?: string
  intensity?: string
}

export type PersonalityModelContextInput = {
  sessionId?: string
  characterId?: string
  characterName?: string
  characterIdentity?: string
  candidatePlanSystemPromptPrefix?: string
  promptLibrarySystemPrompt?: string
  scenarioMountedPromptText?: string
  currentUserInput?: string
  userName?: string
  projections?: PersonalityProjectionRow[]
  recallSections?: PersonalityRecallSections | null
  sceneChangeNotice?: string
  /** 滚动会话记忆摘要（批次4）：长会话里较早投影事实的浓缩，注入上下文避免丢关键记忆；缺省=不注入、零回归。 */
  sessionMemorySummary?: string
  compressedContext?: string
  fallbackMessageIds?: number[]
  excludedMessageIds?: number[]
  candidatePlans?: PersonalityPlanCandidate[]
  topPlans?: PersonalityPlanCandidate[]
  /** 表达占比唯一真值（批次2 前移到编排器、批次4 去融合后直接驱动最终回复）。 */
  expressionMix?: ReplyPlanExpressionMix | null
  /** 建议字数区间（编排器生成轮顶层产出）：缺省时最终回复按默认区间兜底。 */
  wordCountAdvice?: ReplyPlanWordCountAdvice | null
}

export type PersonalityPromptMessage = { role: 'system' | 'user' | 'assistant'; content: string }

export type PersonalityPromptTrace = {
  messages: PersonalityPromptMessage[]
  finalPrompt: string
  promptBlocks: Array<{ role: 'system' | 'user' | 'assistant'; title: string; content: string }>
}

export type PersonalityProjectionContextItem = {
  id: string
  messageId: number
  status: PersonalityProjectionStatus
  createdAt?: string
  speakerName: string
  audienceNames: string[]
  fact: string
  startEnv: PersonalityProjectionEnv
  endEnv: PersonalityProjectionEnv
  changed: { time: boolean; location: boolean }
}

export type PersonalityModelContextBundle = {
  projectionItems: PersonalityProjectionContextItem[]
  projectionContextText: string
  recallContextText: string
  sceneChangeNotice: string
  sourceMaterialText: string
  compressedContext: string
  candidatePlanPrompt: PersonalityPromptTrace
  rerankerPrompts: PersonalityPromptTrace[]
  finalPrompt: PersonalityPromptTrace
}

export type PersonalityPlanRerankerScore = {
  candidateId?: string
  score: number
}

function toText(value: unknown): string {
  return String(value ?? '').trim()
}

function extractJsonText(value: unknown): string {
  const text = toText(value)
  if (!text) return ''
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const source = fenced?.[1]?.trim() || text
  const objectStart = source.indexOf('{')
  const objectEnd = source.lastIndexOf('}')
  const arrayStart = source.indexOf('[')
  const arrayEnd = source.lastIndexOf(']')
  const objectCandidate = objectStart >= 0 && objectEnd > objectStart ? source.slice(objectStart, objectEnd + 1) : ''
  const arrayCandidate = arrayStart >= 0 && arrayEnd > arrayStart ? source.slice(arrayStart, arrayEnd + 1) : ''
  if (objectCandidate && arrayCandidate) return objectStart < arrayStart ? objectCandidate : arrayCandidate
  return objectCandidate || arrayCandidate || source
}

function parseJsonValueStrict(value: unknown, label: string): any {
  if (value && typeof value === 'object') return value
  const jsonText = extractJsonText(value)
  if (!jsonText) throw new Error(`${label}为空`)
  try {
    return JSON.parse(jsonText)
  } catch (error) {
    throw new Error(`${label}不是合法 JSON：${error instanceof Error ? error.message : String(error)}`)
  }
}

function parseJsonObject(value: unknown): Record<string, any> {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, any>
  if (typeof value !== 'string') return {}
  const text = value.trim()
  if (!text) return {}
  try {
    const parsed = JSON.parse(text)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function parseTextList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(toText).filter(Boolean)
  if (typeof value !== 'string') return []
  const text = value.trim()
  if (!text) return []
  try {
    const parsed = JSON.parse(text)
    return Array.isArray(parsed) ? parsed.map(toText).filter(Boolean) : []
  } catch {
    return text.split(/[,\n，、]/).map(toText).filter(Boolean)
  }
}

function normalizeEnv(value: unknown): PersonalityProjectionEnv {
  const record = parseJsonObject(value)
  return {
    time: toText(record.time),
    locationLarge: toText(record.locationLarge ?? record.location_large),
    locationMiddle: toText(record.locationMiddle ?? record.location_middle),
    locationSmall: toText(record.locationSmall ?? record.location_small),
    location: toText(record.location),
    weather: toText(record.weather)
  }
}

function normalizeChanged(value: unknown): { time: boolean; location: boolean } {
  const record = parseJsonObject(value)
  return {
    time: record.time === true || record.time === 'true' || record.time === 1,
    location: record.location === true || record.location === 'true' || record.location === 1
  }
}

function readProjectionFact(row: PersonalityProjectionRow, status: string): string {
  const objectiveFact = toText(row.objectiveFact ?? row.objective_fact)
  if (status === 'complete' || status === 'partial') return objectiveFact
  if (status === 'failed') return toText(row.fallbackCleanText ?? row.fallback_clean_text)
  return ''
}

function formatEnv(env: PersonalityProjectionEnv): string {
  const location = [
    toText(env.locationLarge),
    toText(env.locationMiddle),
    toText(env.locationSmall)
  ].filter(Boolean).join(' / ') || toText(env.location)
  return [
    env.time ? `时间=${env.time}` : '',
    location ? `地点=${location}` : '',
    env.weather ? `天气=${env.weather}` : ''
  ].filter(Boolean).join('，')
}

function trimLine(value: string, maxLength = 220): string {
  const text = value.replace(/\s+/g, ' ').trim()
  if (text.length <= maxLength) return text
  return `${text.slice(0, Math.max(0, maxLength - 1)).trim()}…`
}

function isProjectionEnvironmentLine(line: string): boolean {
  const text = line.trim()
  return (
    text === '聊天记录投影：'
    || text.startsWith('开始环境：')
    || text.startsWith('结束环境：')
    || text.startsWith('场景变化提醒：')
    || text.startsWith('跨消息变化：')
    || text.startsWith('上一条可见消息环境：')
    || text.startsWith('本次用户输入开始环境：')
    || text.includes('时间=')
    || text.includes('地点=')
    || text.includes('时间变化')
    || text.includes('地点变化')
  )
}

function renumberProjectionFactLines(lines: string[]): string[] {
  let index = 0
  return lines.map((line) => line.replace(/^\d+\.\s+/, () => `${++index}. `))
}

function isBracketHeading(line: string): boolean {
  return /^【[^】]+】$/.test(line.trim())
}

function isMarkdownHeading(line: string): boolean {
  return /^#{1,6}\s+\S/.test(line.trim())
}

function cleanContextHeadingLines(value: string): string {
  const lines = value.split(/\r?\n/g)
  const cleaned: string[] = []
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] || ''
    const trimmed = line.trim()
    if (!trimmed) {
      cleaned.push('')
      continue
    }
    if (isBracketHeading(trimmed)) continue
    if (isMarkdownHeading(trimmed)) continue
    cleaned.push(line)
  }
  return cleaned.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

function normalizeRecoveredPlanText(value: string): string {
  return value
    .replace(/\\r\\n|\\n|\\r/g, '\n')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeCandidateList(candidates: Array<PersonalityPlanCandidate | null>, failurePrefix = '人格模型候选计划'): PersonalityPlanCandidate[] {
  const normalized = candidates.filter((item): item is PersonalityPlanCandidate => Boolean(item))
  if (normalized.length < 15) {
    throw new Error(`${failurePrefix}不足 15 条，当前只有 ${normalized.length} 条`)
  }
  return normalized.slice(0, 15).map((candidate, index) => ({
    ...candidate,
    id: toText(candidate.id) || `plan_${index + 1}`
  }))
}

function normalizePlanBatchCandidateList(candidates: Array<PersonalityPlanCandidate | null>, options: {
  expectedCount: number
  failurePrefix: string
}): PersonalityPlanCandidate[] {
  const normalized = candidates.filter((item): item is PersonalityPlanCandidate => Boolean(item))
  if (normalized.length < options.expectedCount) {
    throw new Error(`${options.failurePrefix}不足 ${options.expectedCount} 条，当前只有 ${normalized.length} 条`)
  }
  return normalized.slice(0, options.expectedCount).map((candidate, index) => ({
    ...candidate,
    id: toText(candidate.id) || `plan_${index + 1}`
  }))
}

function normalizePlanCandidate(value: unknown, index: number): PersonalityPlanCandidate | null {
  if (typeof value === 'string') {
    const content = normalizeRecoveredPlanText(value)
    if (!content) return null
    return {
      id: `plan_${index + 1}`,
      content
    }
  }
  const record = value && typeof value === 'object' ? value as Record<string, any> : {}
  const content = toText(record.content ?? record.plan ?? record.body ?? record.replyPlan ?? record.reply_plan)
  if (!content) return null
  return {
    id: toText(record.id) || `plan_${index + 1}`,
    content,
    score: Number.isFinite(Number(record.score)) ? Number(record.score) : undefined,
    strategy: toText(record.strategy) || undefined,
    strategyLabel: toText(record.strategyLabel ?? record.strategy_label) || undefined,
    intensity: toText(record.intensity) || undefined
  }
}

function readMalformedPlanContentFields(text: string): string[] {
  const source = extractJsonText(text)
  const values: string[] = []
  const contentFieldPattern = /["'](?:content|plan|body|replyPlan|reply_plan)["']\s*:\s*(["'])([\s\S]*?)\1(?=\s*(?:[,}\]]|$))/gi
  let match: RegExpExecArray | null
  while ((match = contentFieldPattern.exec(source))) {
    const content = normalizeRecoveredPlanText(match[2] || '')
    if (content) values.push(content)
  }
  return values
}

function readNumberedPlanLines(text: string): string[] {
  const source = extractJsonText(text)
  const values: string[] = []
  const lines = source.split(/\r?\n/g)
  const linePattern = /^\s*(?:[-*]\s*)?(?:计划\s*)?(\d{1,2})[\.、:：\)）]\s*(.+?)\s*$/
  for (const line of lines) {
    const match = line.match(linePattern)
    if (!match) continue
    const number = Number(match[1])
    if (!Number.isInteger(number) || number < 1 || number > 30) continue
    const content = normalizeRecoveredPlanText(match[2] || '')
    if (content) values.push(content)
  }
  return values
}

function recoverPersonalityCandidatePlansFromMalformedOutput(output: unknown): PersonalityPlanCandidate[] {
  if (typeof output !== 'string') return []
  const recoveredTexts = readMalformedPlanContentFields(output)
  const texts = recoveredTexts.length >= 15 ? recoveredTexts : readNumberedPlanLines(output)
  return texts.map((content, index) => ({
    id: `plan_${index + 1}`,
    content
  }))
}

function readPlanArray(parsed: any): unknown[] {
  if (Array.isArray(parsed)) return parsed
  if (!parsed || typeof parsed !== 'object') return []
  if (Array.isArray(parsed.plans)) return parsed.plans
  if (Array.isArray(parsed.candidates)) return parsed.candidates
  if (Array.isArray(parsed.items)) return parsed.items
  return []
}

function buildPromptTrace(messages: PersonalityPromptMessage[], titles: string[]): PersonalityPromptTrace {
  const promptBlocks = messages.map((message, index) => ({
    role: message.role,
    title: titles[index] || `${message.role} ${index + 1}`,
    content: message.content
  }))
  return {
    messages,
    finalPrompt: messages.map((message) => `## ${message.role}\n${message.content}`).join('\n\n'),
    promptBlocks
  }
}

export function normalizeProjectionContextItems(rows: PersonalityProjectionRow[] = []): PersonalityProjectionContextItem[] {
  return rows
    .map<PersonalityProjectionContextItem | null>((row) => {
      const status = toText(row.status) || 'running'
      const fact = readProjectionFact(row, status)
      if (!fact) return null
      return {
        id: toText(row.id),
        messageId: Number(row.messageId ?? row.message_id ?? 0) || 0,
        status,
        createdAt: toText(row.createdAt ?? row.created_at),
        speakerName: toText(row.speakerName ?? row.speaker_name),
        audienceNames: parseTextList(row.audienceNames ?? row.audience_names_json),
        fact,
        startEnv: normalizeEnv(row.startEnv ?? row.startEnvJson ?? row.start_env_json),
        endEnv: normalizeEnv(row.endEnv ?? row.endEnvJson ?? row.end_env_json),
        changed: normalizeChanged(row.changed ?? row.changedJson ?? row.changed_json)
      }
    })
    .filter((item): item is PersonalityProjectionContextItem => item !== null)
    .sort((a, b) => {
      const messageDiff = a.messageId - b.messageId
      if (messageDiff) return messageDiff
      const timeA = Date.parse(a.createdAt || '')
      const timeB = Date.parse(b.createdAt || '')
      if (Number.isFinite(timeA) && Number.isFinite(timeB) && timeA !== timeB) return timeA - timeB
      return a.id.localeCompare(b.id)
    })
}

function hasEnvValue(env: PersonalityProjectionEnv): boolean {
  return Boolean(formatEnv(env))
}

function sameEnv(a: PersonalityProjectionEnv, b: PersonalityProjectionEnv): boolean {
  return formatEnv(a) === formatEnv(b)
}

function readEnvTime(env: PersonalityProjectionEnv): string {
  return toText(env.time)
}

function readEnvLocation(env: PersonalityProjectionEnv): string {
  return [
    toText(env.locationLarge),
    toText(env.locationMiddle),
    toText(env.locationSmall)
  ].filter(Boolean).join(' / ') || toText(env.location)
}

function formatChangeLine(label: string, beforeValue: string, afterValue: string): string {
  if (!beforeValue && !afterValue) return ''
  if (beforeValue && afterValue && beforeValue !== afterValue) return `${label}从「${beforeValue}」变为「${afterValue}」`
  if (!beforeValue && afterValue) return `${label}变为「${afterValue}」`
  if (beforeValue && !afterValue) return `${label}从「${beforeValue}」变为未记录`
  return ''
}

export function buildProjectionSceneChangeNotice(items: PersonalityProjectionContextItem[]): string {
  if (!items.length) return ''
  const current = items[items.length - 1]
  const previous = items.length > 1 ? items[items.length - 2] : null
  const beforeEnv = previous?.endEnv && hasEnvValue(previous.endEnv)
    ? previous.endEnv
    : current.startEnv
  const currentStartEnv = hasEnvValue(current.startEnv) ? current.startEnv : current.endEnv
  const currentEndEnv = current.endEnv
  const boundaryChanged = previous ? !sameEnv(beforeEnv, currentStartEnv) : false
  const currentChanged = current.changed.time || current.changed.location || !sameEnv(currentStartEnv, currentEndEnv)
  if (!boundaryChanged && !currentChanged) return ''

  const beforeText = formatEnv(beforeEnv)
  const inputText = formatEnv(currentStartEnv)
  const endText = formatEnv(currentEndEnv)
  const boundaryChanges = [
    formatChangeLine('时间', readEnvTime(beforeEnv), readEnvTime(currentStartEnv)),
    formatChangeLine('地点', readEnvLocation(beforeEnv), readEnvLocation(currentStartEnv))
  ].filter(Boolean)
  const currentChanges = [
    formatChangeLine('本条投影结束时间', readEnvTime(currentStartEnv), readEnvTime(currentEndEnv)),
    formatChangeLine('本条投影结束地点', readEnvLocation(currentStartEnv), readEnvLocation(currentEndEnv))
  ].filter(Boolean)
  return [
    previous ? `上一条可见消息环境：${beforeText || '未记录'}` : '',
    `本次用户输入开始环境：${inputText || '未记录'}`,
    currentChanged && endText && endText !== inputText ? `本次用户输入结束环境：${endText}` : '',
    boundaryChanges.length ? `跨消息变化：${boundaryChanges.join('；')}` : '',
    currentChanges.length ? `本条变化：${currentChanges.join('；')}` : ''
    // #3（用户 2026-06-20）：删掉「生成候选计划时必须承接这些时间地点差异…」——这是候选生成口吻，
    // 会随场景变化提醒泄漏进最终角色消息提示词，属脏内容；时间地点差异事实本身已在上面各行表达。
  ].filter(Boolean).join('\n')
}

function buildProjectionEnvironmentSummary(items: PersonalityProjectionContextItem[]): string[] {
  if (!items.length) return []
  const first = items[0]
  const last = items[items.length - 1]
  const startEnv = hasEnvValue(first.startEnv) ? first.startEnv : first.endEnv
  const endEnv = last.endEnv
  const startText = formatEnv(startEnv)
  const endText = formatEnv(endEnv)
  if (!startText && !endText) return []
  const changed = items.some((item) => item.changed.time || item.changed.location) || !sameEnv(startEnv, endEnv)
  if (changed && endText && endText !== startText) {
    return [
      startText ? `开始环境：${startText}` : '',
      `结束环境：${endText}`
    ].filter(Boolean)
  }
  return [startText ? `开始环境：${startText}` : `开始环境：${endText}`]
}

export function formatProjectionContext(items: PersonalityProjectionContextItem[]): string {
  if (!items.length) return ''
  const envSummary = buildProjectionEnvironmentSummary(items)
  const factLines = items.map((item, index) => {
    const audience = item.audienceNames.length ? ` -> ${item.audienceNames.join('、')}` : ''
    return `${index + 1}. ${item.speakerName || '未知'}${audience}：${trimLine(item.fact)}`
  })
  return [...envSummary, ...factLines].filter(Boolean).join('\n')
}

function formatPersonalitySourceMaterial(input: {
  recallContextText: string
  projectionContextText: string
  sceneChangeNotice?: string
  sessionMemorySummary?: string
}): string {
  // 批次4：滚动会话记忆摘要块（buildSessionMemoryContextBlock 产出）排在投影块之前，
  // 让 compressPersonalityContext 的 requiredHints（含「会话记忆摘要：」）优先保护它不被截掉。
  const memoryBlock = buildSessionMemoryContextBlock(input.sessionMemorySummary || '')
  return [
    input.sceneChangeNotice ? `场景变化提醒：\n${input.sceneChangeNotice}\n` : '',
    memoryBlock ? `${memoryBlock}\n` : '',
    '召回结果：',
    input.recallContextText || '暂无召回结果。',
    '',
    '聊天记录投影：',
    input.projectionContextText || '暂无聊天记录投影。'
  ].filter(Boolean).join('\n').trim()
}

export function formatRecallSectionsForPersonalityModel(sections?: PersonalityRecallSections | null): string {
  if (!sections) return ''
  return [
    sections.profile,
    sections.general,
    sections.arrangement,
    sections.expression
  ]
    .map((content) => cleanContextHeadingLines(toText(content)))
    .filter(Boolean)
    .join('\n\n')
}

export function normalizePersonalityCandidatePlansOutput(output: unknown): PersonalityPlanCandidate[] {
  let parsed: any
  try {
    parsed = parseJsonValueStrict(output, '人格模型候选计划输出')
  } catch (error) {
    const recovered = recoverPersonalityCandidatePlansFromMalformedOutput(output)
    if (recovered.length >= 15) {
      return normalizeCandidateList(recovered, '人格模型候选计划')
    }
    const reason = error instanceof Error ? error.message : String(error)
    throw new Error(`人格模型候选计划解析失败：${reason}；从原始输出只能恢复 ${recovered.length} 条计划，已停止生成`)
  }
  const candidates = readPlanArray(parsed)
    .map((item, index) => normalizePlanCandidate(item, index))
  return normalizeCandidateList(candidates, '人格模型候选计划')
}

export function normalizePersonalityPlanBatchOutput(output: unknown, options: {
  expectedCount: number
  failurePrefix?: string
}): PersonalityPlanCandidate[] {
  const failurePrefix = options.failurePrefix || '人格模型计划批次'
  let parsed: any
  try {
    parsed = parseJsonValueStrict(output, failurePrefix)
  } catch (error) {
    const recovered = recoverPersonalityCandidatePlansFromMalformedOutput(output)
    if (recovered.length >= options.expectedCount) {
      return normalizePlanBatchCandidateList(recovered, { expectedCount: options.expectedCount, failurePrefix })
    }
    const reason = error instanceof Error ? error.message : String(error)
    throw new Error(`${failurePrefix}解析失败：${reason}；从原始输出只能恢复 ${recovered.length} 条计划，已停止生成`)
  }
  const candidates = readPlanArray(parsed)
    .map((item, index) => normalizePlanCandidate(item, index))
  return normalizePlanBatchCandidateList(candidates, { expectedCount: options.expectedCount, failurePrefix })
}

export function normalizePersonalityRerankerOutput(output: unknown, candidateId = ''): PersonalityPlanRerankerScore {
  const parsed = parseJsonValueStrict(output, '人格模型 ReRanker 输出')
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('人格模型 ReRanker 输出必须是 JSON 对象')
  }
  const score = Number((parsed as Record<string, any>).score)
  if (!Number.isFinite(score)) {
    throw new Error('人格模型 ReRanker 输出缺少有效 score')
  }
  return {
    candidateId: toText((parsed as Record<string, any>).candidateId ?? (parsed as Record<string, any>).candidate_id) || candidateId,
    score
  }
}

export function rankPersonalityPlanCandidates(
  candidates: PersonalityPlanCandidate[],
  scores: PersonalityPlanRerankerScore[],
  limit = 3
): PersonalityPlanCandidate[] {
  if (scores.length !== candidates.length) {
    throw new Error(`人格模型 ReRanker 评分数量不匹配：候选 ${candidates.length} 条，评分 ${scores.length} 条`)
  }
  return candidates
    .map((candidate, index) => ({
      ...candidate,
      score: scores[index]?.score
    }))
    .sort((a, b) => Number(b.score ?? Number.NEGATIVE_INFINITY) - Number(a.score ?? Number.NEGATIVE_INFINITY))
    .slice(0, Math.max(1, limit))
}

export function compressPersonalityContext(source: string, options: {
  ratio?: number
  minLength?: number
  maxLength?: number
  currentUserInput?: string
} = {}): string {
  const text = cleanContextHeadingLines(toText(source))
  if (!text) return ''
  const ratio = Math.min(0.75, Math.max(0.35, Number(options.ratio ?? 0.5)))
  const maxLength = Number(options.maxLength ?? 2400)
  const targetLength = Math.max(
    Number(options.minLength ?? 240),
    Math.min(maxLength, Math.ceil(text.length * ratio))
  )
  const rawLines = text
    .split(/\n+/g)
    .map((line) => trimLine(line, 180))
    .filter(Boolean)
  const requiredHints = [
    '会话记忆摘要：',
    '时间=',
    '地点=',
    '时间变化',
    '地点变化',
    '场景变化提醒：',
    '跨消息变化：',
    '上一条可见消息环境：',
    '本次用户输入开始环境：',
    '冲突',
    '决定',
    '要求',
    '名称：',
    '简介',
    '外貌',
    '说话风格',
    '表达风格',
    '内容&话题倾向',
    '召回结果：',
    '聊天记录投影：'
  ]
  const selected: string[] = []
  let length = 0
  const addLine = (line: string, force = false) => {
    if (!line || selected.includes(line)) return
    const nextLength = length + line.length + 1
    if (!force && nextLength > targetLength && selected.length) return
    if (force && nextLength > maxLength && selected.length) return
    selected.push(line)
    length = nextLength
  }
  const projectionStartIndex = rawLines.findIndex((line) => line === '聊天记录投影：')
  const recallBlockEndIndex = projectionStartIndex >= 0 ? projectionStartIndex : rawLines.length
  rawLines.slice(0, recallBlockEndIndex).forEach((line) => addLine(line, true))
  if (projectionStartIndex >= 0) {
    const projectionLines = rawLines.slice(projectionStartIndex)
    const projectionHeader = projectionLines[0]
    const projectionBody = projectionLines.slice(1)
    const environmentLines = projectionBody.filter((line) => isProjectionEnvironmentLine(line))
    const factLines = projectionBody.filter((line) => !isProjectionEnvironmentLine(line))
    const recentFactLines = factLines.slice(-8)
    ;[projectionHeader, ...environmentLines, ...recentFactLines].forEach((line) => addLine(line, true))
    for (const line of projectionLines) {
      if (length >= targetLength) break
      addLine(line)
    }
    return cleanContextHeadingLines(renumberProjectionFactLines(selected).join('\n')).trim()
  }
  rawLines.forEach((line, index) => {
    if (!requiredHints.some((hint) => line.includes(hint))) return
    addLine(line, true)
  })
  rawLines.slice(-8).forEach((line) => addLine(line, true))
  for (const line of rawLines) {
    if (length >= targetLength) break
    addLine(line)
  }
  return cleanContextHeadingLines(selected.join('\n')).trim()
}

/** 合并生成协议（2026-07-08）：一次调用带全部反应类别组，每组=一个类别的强度档与任务提示词。 */
export interface PersonalityCandidatePlanBatchGroup {
  strategy?: string
  strategyLabel: string
  intensities: string[]
  planPrompt: string
}

export function buildPersonalityCandidatePlanPrompt(input: {
  characterName?: string
  systemPromptPrefix?: string
  compressedContext: string
  currentUserInput?: string
  planCount?: number
  strategyLabel?: string
  intensities?: string[]
  planPrompt?: string
  sceneChangeNotice?: string
  /** 多类别一次生成（合并生成协议）：非空时忽略上面的单类别字段，按声明顺序逐类别×逐强度产出全部候选。 */
  batches?: PersonalityCandidatePlanBatchGroup[]
}): PersonalityPromptTrace {
  const systemPromptPrefix = toText(input.systemPromptPrefix)
  const batches = (input.batches || [])
    .map((group) => ({
      strategy: toText(group.strategy),
      strategyLabel: toText(group.strategyLabel),
      intensities: (group.intensities || []).map((item) => toText(item)).filter(Boolean),
      planPrompt: toText(group.planPrompt)
    }))
    .filter((group) => group.intensities.length > 0)
  const planCount = Number.isInteger(input.planCount) && Number(input.planCount) > 0 ? Number(input.planCount) : 15
  const strategyLabel = toText(input.strategyLabel)
  const intensities = (input.intensities || []).map((item) => toText(item)).filter(Boolean)
  const planPrompt = toText(input.planPrompt)
  // 共同规则（单类别/多类别两种头部共用）：计划口吻、边界与格式约束。
  const sharedRuleLines = [
    '候选计划不是最终回复草稿，而是给后续角色回复模型和人格排序模型使用的第三视角表现指令。',
    '每条只写计划本身，用第三视角描述角色接下来应呈现的动作、神态、态度、语气和表达意图。',
    '可以写“用轻快语气追问原因”“冷下脸指出风险”“先观察对方反应再回应”等间接语言指引；不要写完整台词、引号对白、第一人称独白或可直接发送给用户的回复。',
    '避免把角色名和用户称呼堆成真实对话句；允许用角色名、用户名或关系称谓指代对象，但必须保持计划口吻。',
    '每条保持简短具体，既要有可执行的表现差异，也不能新增情境中没有发生的事实。',
    '每个 content 必须是单行 JSON 字符串，不要在字符串里写换行、双引号或 Markdown 列表符号。'
  ]
  let headLines: string[]
  if (batches.length > 0) {
    // 合并生成协议：一次产出全部类别×强度，输出模板按声明顺序逐条列出（模型对号入座，解析按序映射）。
    const totalCount = batches.reduce((sum, group) => sum + group.intensities.length, 0)
    const orderedTemplate = batches
      .flatMap((group) => group.intensities.map((intensity) =>
        `{"strategy":"${group.strategy || group.strategyLabel}","intensity":"${intensity}","content":"计划正文"}`))
      .join(',')
    headLines = [
      '你是人格模型候选计划生成器。',
      `只根据情境一次性生成 ${totalCount} 条候选计划；这是本次固定总量，不能多、不能少。`,
      `本次共 ${batches.length} 个反应类别，按下面声明的顺序逐类别、逐强度生成，每个强度恰好 1 条候选计划：`,
      ...batches.map((group, index) => [
        `【类别${index + 1}/${batches.length}】${group.strategyLabel}${group.strategy ? `（${group.strategy}）` : ''}：`,
        `强度顺序 ${group.intensities.join(' / ')}。`,
        group.planPrompt ? `任务：${group.planPrompt}` : ''
      ].filter(Boolean).join('')),
      '各类别的候选必须体现该类别独有的反应焦点，不能互相复制或混同。',
      `如果某个类别或任务提示较难，也必须先满足数量协议：plans 数组长度必须等于 ${totalCount}。`,
      ...sharedRuleLines,
      `输出 JSON：{"plans":[${orderedTemplate}]}。必须严格按上面声明的类别与强度顺序输出全部条目。`
    ]
  } else {
    headLines = [
      '你是人格模型候选计划生成器。',
      `只根据情境生成 ${planCount} 条候选计划；这是本批固定数量，不能多、不能少。`,
      strategyLabel ? `本批反应类别：${strategyLabel}。` : '',
      intensities.length ? `本批强度顺序：${intensities.join(' / ')}。必须按这个顺序逐一生成，每个强度恰好 1 条候选计划，并在 JSON 中写入对应 intensity。` : '',
      planPrompt ? `本批任务：${planPrompt}` : '',
      `如果本批反应类别或任务提示较难，也必须先满足数量协议：plans 数组长度必须等于 ${planCount}。`,
      ...sharedRuleLines,
      intensities.length
        ? `输出 JSON：{"plans":[${intensities.map((intensity) => `{"intensity":"${intensity}","content":"计划正文"}`).join(',')}]}。`
        : '输出 JSON：{"plans":[{"content":"计划正文"}]}。'
    ]
  }
  const messages: PersonalityPromptMessage[] = [
    {
      role: 'system',
      content: [systemPromptPrefix, ...headLines].filter(Boolean).join('\n')
    },
    {
      role: 'user',
      content: [
        '情境：',
        [
          toText(input.sceneChangeNotice) ? `场景变化提醒：\n${toText(input.sceneChangeNotice)}` : '',
          input.compressedContext || '暂无情境。',
          toText(input.currentUserInput) ? `当前输入：${toText(input.currentUserInput)}` : ''
        ].filter(Boolean).join('\n')
      ].join('\n').trim()
    }
  ]
  return buildPromptTrace(messages, ['候选计划系统规则', '候选计划输入'])
}

export function buildPersonalityRerankerPrompt(input: {
  characterName?: string
  compressedContext: string
  candidatePlan: PersonalityPlanCandidate
}): PersonalityPromptTrace {
  const planText = toText(input.candidatePlan.content)
  const messages: PersonalityPromptMessage[] = [
    {
      role: 'system',
      content: [
        '你是人格模型 ReRanker。',
        '每次只评分一个候选计划。',
        '输入只包含情境和计划。',
        '只输出 JSON：{"score":数字}。',
        'score 必须使用评审器原始分数，不要换算、裁剪或解释。'
      ].join('\n')
    },
    {
      role: 'user',
      content: [
        '情境：',
        input.compressedContext || '暂无情境。',
        '',
        '计划：',
        planText || '无'
      ].join('\n')
    }
  ]
  return buildPromptTrace(messages, ['ReRanker 系统规则', 'ReRanker 输入'])
}

function isValidExpressionMix(value: unknown): value is ReplyPlanExpressionMix {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const record = value as Record<string, any>
  return (
    Number.isFinite(Number(record.action))
    && Number.isFinite(Number(record.dialogue))
    && Number.isFinite(Number(record.expression))
    && Number.isFinite(Number(record.innerState))
    && Number.isFinite(Number(record.narration))
  )
}

export function buildPersonalityFinalPrompt(input: {
  characterName?: string
  characterIdentity?: string
  promptLibrarySystemPrompt?: string
  scenarioMountedPromptText?: string
  compressedContext?: string
  topPlans?: PersonalityPlanCandidate[]
  expressionMix?: ReplyPlanExpressionMix | null
  wordCountAdvice?: ReplyPlanWordCountAdvice | null
  currentUserInput?: string
  sceneChangeNotice?: string
}): PersonalityPromptTrace {
  const characterName = toText(input.characterName) || '当前角色'
  const promptLibrarySystemPrompt = toText(input.promptLibrarySystemPrompt)
  const scenarioMountedPromptText = toText(input.scenarioMountedPromptText)
  // #6 稳健兜底：挂载提示词原文优先由 promptLibrary 的占位预设替换吸收（尊重用户在文档库里给它定的位置）；
  // 若占位预设缺失/未启用导致没被吸收，就在系统提示词里直接注入，保证「情境配了挂载提示词就必定进入角色消息提示词」。
  const mountedAlreadyInLibrary = Boolean(scenarioMountedPromptText && promptLibrarySystemPrompt.includes(scenarioMountedPromptText))
  const directMountedPromptText = scenarioMountedPromptText && !mountedAlreadyInLibrary ? scenarioMountedPromptText : ''
  const planItems = (input.topPlans || []).slice(0, 3)
    .map((plan, index) => `${index + 1}. ${toText(plan.content)}`)
    .filter(Boolean)
  // 单计划（normal_recall 工作流）与多计划（人格模型前三计划）共用本装配：
  // 计划数量决定标题与融合指示文案，避免单计划场景出现“融合这三条”的误导指令。
  const singlePlan = planItems.length === 1
  const plans = planItems.join('\n') || '暂无候选计划。'
  // 批次4 去融合：最终回复模型自行融合前三计划，按编排器产出的表达占比生成回复。
  const mix = isValidExpressionMix(input.expressionMix) ? input.expressionMix : null
  const expressionMixText = mix
    ? [
        `动作 ${mix.action}%`,
        `语言 ${mix.dialogue}%`,
        `神态 ${mix.expression}%`,
        `心理 ${mix.innerState}%`,
        `旁白 ${mix.narration}%`
      ].join('，')
    : ''
  // #2（用户 2026-06-20）：把「只能融合计划+表达占比、禁止自由发挥」的硬指令从系统提示词移到 user 消息里，
  // 紧跟在【前三计划】+【表达占比】之后——原来这些指令在系统提示词、与计划隔了一大段，位置靠前易被模型忽略。
  const fusionInstruction = singlePlan
    ? '回复计划是第三视角的表现指令；请按该计划生成本轮角色回复，需要自然融入角色语言，不要复述计划、不要把计划口吻原样输出。'
    : '前三计划是 ReRanker 选出的第三视角表现指令；请融合这三条计划生成本轮角色回复，需要自然融入角色语言，不要逐条复述计划、不要把计划口吻原样输出。'
  const constraintInstruction = mix
    ? '本轮回复只能由上述计划与【表达占比】拟定：剧情走向、人物动作与情绪都必须落在计划覆盖的范围内，篇幅结构严格按表达占比组织；禁止脱离计划自由发挥、自行加戏或顺着角色性格另开剧情，可以用角色语言润色表达，但不得改变或超出计划设定的内容。'
    : '本轮回复只能由上述计划拟定：剧情走向、人物动作与情绪都必须落在计划覆盖的范围内；禁止脱离计划自由发挥、自行加戏或顺着角色性格另开剧情，可以用角色语言润色表达，但不得改变或超出计划设定的内容。'
  const mixStructureInstruction = mix
    ? '表达占比是本轮回复的描写结构指导：动作、语言、神态、心理、旁白按给定占比组织篇幅；不要输出占比数字、百分号、计划 ID 或内部字段。'
    : ''
  // 建议字数（与表达占比并排）：提调据情境产出，缺失/非法时按默认区间兜底，最终回复一律带篇幅建议（软建议非硬截断）。
  const wordAdvice = parseReplyPlanWordCountAdvice(input.wordCountAdvice) || DEFAULT_REPLY_PLAN_WORD_COUNT_ADVICE
  const wordCountInstruction = wordAdvice.min === wordAdvice.max
    ? `本轮回复篇幅建议在 ${wordAdvice.min} 字左右，可据剧情张力适度浮动；这是篇幅建议不是硬性限制，但不要明显过短或过度冗长。`
    : `本轮回复篇幅建议在 ${wordAdvice.min}–${wordAdvice.max} 字之间，可据剧情张力适度浮动；这是篇幅建议不是硬性限制，但不要明显过短或过度冗长。`
  const noHistoryInstruction = '不要读取或复述原始聊天长历史、候选全集、评分细节或内部审计字段。'
  const messages: PersonalityPromptMessage[] = [
    {
      role: 'system',
      content: [
        `你将以${characterName}的身份回复。`,
        toText(input.characterIdentity),
        promptLibrarySystemPrompt ? `【提示词库系统提示词】\n${promptLibrarySystemPrompt}` : '',
        directMountedPromptText,
        buildEmbeddedMessageProjectionInstruction(`本轮${characterName}回复`)
      ].filter(Boolean).join('\n')
    },
    {
      role: 'user',
      content: [
        '【上下文】',
        input.compressedContext || '暂无上下文。',
        singlePlan ? '【回复计划】' : '【前三计划】',
        plans,
        mix ? `【表达占比】\n${expressionMixText}` : '',
        // 紧跟计划+表达占比之后给出硬指令，确保模型据计划与占比生成、禁止自由发挥。
        fusionInstruction,
        constraintInstruction,
        mixStructureInstruction,
        wordCountInstruction,
        noHistoryInstruction,
        input.sceneChangeNotice ? `【场景变化提醒】\n${input.sceneChangeNotice}` : '',
        '【当前用户输入】',
        toText(input.currentUserInput) || '无'
      ].filter(Boolean).join('\n')
    }
  ]
  return buildPromptTrace(messages, ['人格模型最终回复系统规则', '人格模型最终回复输入'])
}

export function buildPersonalityModelContextBundle(input: PersonalityModelContextInput): PersonalityModelContextBundle {
  const projectionItems = normalizeProjectionContextItems(input.projections || [])
  const projectionContextText = formatProjectionContext(projectionItems)
  const recallContextText = formatRecallSectionsForPersonalityModel(input.recallSections)
  const sceneChangeNotice = toText(input.sceneChangeNotice) || buildProjectionSceneChangeNotice(projectionItems)
  const sourceMaterialText = formatPersonalitySourceMaterial({
    recallContextText,
    projectionContextText,
    sceneChangeNotice,
    // 批次4：滚动会话记忆摘要（长会话较早事实的浓缩）注入投影块之前；缺省=不注入、零回归。
    sessionMemorySummary: input.sessionMemorySummary
  })
  const compressedContext = toText(input.compressedContext) || compressPersonalityContext(sourceMaterialText, {
    currentUserInput: input.currentUserInput
  })
  const candidatePlanPrompt = buildPersonalityCandidatePlanPrompt({
    characterName: input.characterName,
    systemPromptPrefix: input.candidatePlanSystemPromptPrefix,
    compressedContext,
    currentUserInput: input.currentUserInput,
    sceneChangeNotice
  })
  const rerankerPrompts = (input.candidatePlans || []).map((candidatePlan) => buildPersonalityRerankerPrompt({
    characterName: input.characterName,
    compressedContext,
    candidatePlan
  }))
  const finalPrompt = buildPersonalityFinalPrompt({
    characterName: input.characterName,
    characterIdentity: input.characterIdentity,
    promptLibrarySystemPrompt: input.promptLibrarySystemPrompt,
    scenarioMountedPromptText: input.scenarioMountedPromptText,
    compressedContext,
    topPlans: input.topPlans,
    expressionMix: input.expressionMix,
    wordCountAdvice: input.wordCountAdvice,
    currentUserInput: input.currentUserInput,
    sceneChangeNotice
  })
  return {
    projectionItems,
    projectionContextText,
    recallContextText,
    sceneChangeNotice,
    sourceMaterialText,
    compressedContext,
    candidatePlanPrompt,
    rerankerPrompts,
    finalPrompt
  }
}
