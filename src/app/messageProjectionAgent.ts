import { extractDirectorDirectives } from './directorDirective'

export type MessageProjectionStatus = 'complete' | 'partial' | 'failed'

export type MessageProjectionEnv = {
  time?: string
  locationLarge?: string
  locationMiddle?: string
  locationSmall?: string
  location?: string
  weather?: string
}

export type MessageProjectionParticipant = {
  id: string
  name: string
  role?: string
}

export type MessageProjectionSourceMessage = {
  id: number
  role: string
  messageKind: string
  content: string
  speakerId?: string
  speakerName?: string
  audienceIds?: string[]
  audienceNames?: string[]
  /** 当前会话里用户实际扮演的身份；有马甲时是马甲名。 */
  userIdentityName?: string
  env?: MessageProjectionEnv
  createdAt?: string
}

export type MessageProjectionPrior = {
  id: string
  messageId: number
  status?: string
  speakerName?: string
  audienceNames?: string[] | string
  objectiveFact?: string
  endEnv?: MessageProjectionEnv | string
  createdAt?: string
}

export type MessageProjectionPromptInput = {
  sessionId: string
  message: MessageProjectionSourceMessage
  participants: MessageProjectionParticipant[]
  previousProjections: MessageProjectionPrior[]
}

export type MessageProjectionPromptTrace = {
  messages: Array<{ role: 'system' | 'user'; content: string }>
  finalPrompt: string
  promptBlocks: Array<{ role: string; title: string; content: string }>
}

export type NormalizedMessageProjection = {
  status: MessageProjectionStatus
  speakerId: string
  speakerName: string
  audienceIds: string[]
  audienceNames: string[]
  participants: string[]
  objectiveFact: string
  fallbackCleanText: string
  startEnv: MessageProjectionEnv
  endEnv: MessageProjectionEnv
  changed: {
    time: boolean
    location: boolean
  }
  sourceProjectionIds: string[]
  failureStage: string
  failureReason: string
}

export type EmbeddedMessageProjectionParseResult = {
  visibleText: string
  projectionText: string
  hasProjection: boolean
  error: string
}

// 投影标记统一用半角中括号，强制模型成对包裹（用户 2026-06-20 拍板）。正则仍兼容 【】/裸标记，
// 仅作历史与模型漂移容错；提示词只教这一种写法。
export const EMBEDDED_MESSAGE_PROJECTION_START = '[消息投影]'
export const EMBEDDED_MESSAGE_PROJECTION_END = '[/消息投影]'

// 标记容错匹配：模型常把【消息投影】写成裸“消息投影”或 [消息投影]，旧正则只认方括号导致整段投影泄漏进正文。
// 带括号（【】/[]）的标记允许内联出现；裸标记必须独占一行（前后只允许 markdown 装饰），避免误删正文里偶然出现的词。
const PROJECTION_MARKER_TEXT = '消息投影'
const PROJECTION_MARKER_LINE_DECOR = '[ \\t*_~`>#]*'
// 裸标记的尾部容错：模型常在标记后补冒号/句号/顿号等标点（“消息投影：”“/消息投影。”），
// 尾部只认 markdown 装饰会导致带标点的标记整段泄漏进正文。尾部额外放空白+常见标点（含全角空格），
// 但不放文字，保证“消息投影”仍需独占一行才剥离，避免误删正文里偶然提到这三个字的句子。
const PROJECTION_MARKER_LINE_TRAIL = '[ \\t*_~`>#：:。.，,、；;！!　]*'
const PROJECTION_OPEN_PATTERN =
  `(?:(?:^|\\n)${PROJECTION_MARKER_LINE_DECOR}${PROJECTION_MARKER_TEXT}${PROJECTION_MARKER_LINE_TRAIL}(?=\\n|$)`
  + `|[【\\[]\\s*${PROJECTION_MARKER_TEXT}\\s*[】\\]])`
const PROJECTION_CLOSE_PATTERN =
  `(?:(?:^|\\n)${PROJECTION_MARKER_LINE_DECOR}[/／]\\s*${PROJECTION_MARKER_TEXT}${PROJECTION_MARKER_LINE_TRAIL}(?=\\n|$)`
  + `|[【\\[]\\s*[/／]\\s*${PROJECTION_MARKER_TEXT}\\s*[】\\]])`

// 投影事实上限：放宽到能完整概括态度与关键言语，不再压成一句干巴概括。
const PROJECTION_FACT_MAX_LENGTH = 160

// 用户消息投影与内嵌投影共用同一套核心规则，二者必须保持一致；改这里即同时影响两处。
const PROJECTION_CORE_RULES: string[] = [
  '把内容压缩成已经发生的客观事实，但要完整：谁、做了什么、说了什么，关键的态度、语气、情绪和重要言语都要保留，不要压成一句平淡概括而丢失信息。',
  '把“你/我/他/她”等代词尽量换成真实名字；无法确定的不要硬写，放进“不确定”。',
  '只写客观事实，不写心理揣测，也不写尚未发生的推断。',
  `长度控制在 ${PROJECTION_FACT_MAX_LENGTH} 字以内：信息完整优先，宁可写到接近上限，也不要为压字数牺牲态度和关键言语。`,
  '时间或地点没有变化时，必须写“变化：无”。'
]

// 投影固定三行格式，两处共用，确保口径一致。
const PROJECTION_OUTPUT_LINES: string[] = [
  '事实：用完整客观事实概括这条内容，保留关键态度、语气与重要言语。',
  '变化：无 / 时间=... / 地点=...',
  '不确定：无 / ...'
]

export function buildEmbeddedMessageProjectionInstruction(subjectLabel = '本条消息'): string {
  const subject = toText(subjectLabel) || '本条消息'
  return [
    `输出严格分两部分：先写给用户看的正文，再写${subject}的消息投影，两部分顺序不能颠倒。`,
    `第一部分（正文）：直接顶格写，不要加“正文：”之类任何前缀；正文里绝对不能出现 ${EMBEDDED_MESSAGE_PROJECTION_START}、${EMBEDDED_MESSAGE_PROJECTION_END} 这两个标记，也不能出现“事实/变化/不确定”这种投影内容。`,
    `第二部分（投影）：正文写完后必须另起一行，用 ${EMBEDDED_MESSAGE_PROJECTION_START} 起、${EMBEDDED_MESSAGE_PROJECTION_END} 收，两个标记必须完整成对、各自只出现一次，全部投影内容写在它们中间，一个字都不能露在标记外：`,
    EMBEDDED_MESSAGE_PROJECTION_START,
    ...PROJECTION_OUTPUT_LINES,
    EMBEDDED_MESSAGE_PROJECTION_END,
    '',
    `标记硬性格式：必须是半角中括号 ${EMBEDDED_MESSAGE_PROJECTION_START} 与 ${EMBEDDED_MESSAGE_PROJECTION_END}，不要写成【】，不要漏掉括号，不要只裸写“消息投影”，更不要把标记或投影内容混进正文。`,
    '',
    ...PROJECTION_CORE_RULES,
    `投影只压缩${subject}的正文，不要写 JSON。`
  ].join('\n')
}

/** 前台快速正文使用的紧凑投影协议；字段语义与完整协议一致，只移除重复解释和纠错训诫。 */
export function buildCompactEmbeddedMessageProjectionInstruction(subjectLabel = '本条消息'): string {
  const subject = toText(subjectLabel) || '本条消息'
  return [
    `正文结束后另起一行，附上${subject}的消息投影：`,
    EMBEDDED_MESSAGE_PROJECTION_START,
    `事实：用不超过${PROJECTION_FACT_MAX_LENGTH}字的客观事实概括正文，写清谁做了什么、说了什么。`,
    '变化：无 / 时间=... / 地点=...',
    '不确定：无 / ...',
    EMBEDDED_MESSAGE_PROJECTION_END,
    '投影只概括已经写出的正文；不写推断，不写 JSON。'
  ].join('\n')
}

function toText(value: unknown): string {
  return String(value ?? '').trim()
}

function parseJsonObject(value: unknown): Record<string, any> {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, any>
  if (typeof value !== 'string') return {}
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function parseTextList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(toText).filter(Boolean)
  if (typeof value !== 'string') return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.map(toText).filter(Boolean) : []
  } catch {
    return value.split(/[,\n，、]/).map(toText).filter(Boolean)
  }
}

function normalizeEnv(value: unknown, fallback: MessageProjectionEnv = {}): MessageProjectionEnv {
  const record = parseJsonObject(value)
  return {
    time: toText(record.time ?? fallback.time),
    locationLarge: toText(record.locationLarge ?? record.location_large ?? fallback.locationLarge),
    locationMiddle: toText(record.locationMiddle ?? record.location_middle ?? fallback.locationMiddle),
    locationSmall: toText(record.locationSmall ?? record.location_small ?? fallback.locationSmall),
    location: toText(record.location ?? fallback.location),
    weather: toText(record.weather ?? fallback.weather)
  }
}

function stripMarkdownFence(value: string): string {
  const text = value.trim()
  return text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()
}

function extractJsonObjectText(value: string): string {
  const text = stripMarkdownFence(value)
  if (text.startsWith('{') && text.endsWith('}')) return text
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start >= 0 && end > start) return text.slice(start, end + 1)
  return text
}

function trimProjectionFact(value: string, maxLength = PROJECTION_FACT_MAX_LENGTH): string {
  const text = value.replace(/\s+/g, ' ').trim()
  if (text.length <= maxLength) return text
  return `${text.slice(0, Math.max(0, maxLength - 1)).trim()}…`
}

export function cleanMessageProjectionSourceText(value: unknown, options: { isUserMessage?: boolean } = {}): string {
  // 用户私密提调指令（双层方括号【【…】】·Option A）：消息正文存原文供显示/编辑，但投影是模型入口，
  // 必须先剥离指令，否则投影事实/兜底清洗正文会把指令带进角色与旁白上下文 → 泄漏。此为投影侧唯一剥离闸口。
  // 边界：只剥离用户自己消息里的私密指令；角色消息里的双层方括号是模型内心独白，必须完整保留进投影，不能误删。
  const base = options.isUserMessage
    ? String(extractDirectorDirectives(value).cleanText)
    : String(value ?? '')
  return base
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<think>[\s\S]*$/gi, '')
    .replace(/^\s*(旁白调试|调试信息|debug)\s*[：:].*$/gim, '')
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, 8000)
}

function stripLeadingVisibleBodyLabel(value: string): string {
  // 去掉模型在正文开头乱加的“正文：”“【正文】”“**正文**：”等标签，防止泄漏到可见消息。
  return value
    .replace(/^\s*(?:【\s*正\s*文\s*】|\*{0,2}\s*正\s*文\s*\*{0,2}\s*[：:])\s*/, '')
    .trim()
}

// 兜底清洗：无论模型用不用方括号，正文里都不残留投影标记或投影残块。
function stripEmbeddedProjectionArtifacts(value: string): string {
  return String(value ?? '')
    // 成对区块：开始标记到结束标记整段移除（容忍裸标记 / 方括号 / 中括号）
    .replace(new RegExp(`${PROJECTION_OPEN_PATTERN}[\\s\\S]*?${PROJECTION_CLOSE_PATTERN}`, 'g'), '')
    // 只有开始标记没有结束标记：连同其后残块一并移除
    .replace(new RegExp(`${PROJECTION_OPEN_PATTERN}[\\s\\S]*$`), '')
    // 残留的孤立结束 / 开始标记
    .replace(new RegExp(PROJECTION_CLOSE_PATTERN, 'g'), '')
    .replace(new RegExp(PROJECTION_OPEN_PATTERN, 'g'), '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// 展示/复制兜底剥离：投影块只在「生成那一刻」被剥离、visibleText 才落库；裸标记容错是后加的，
// 对更早生成、已把投影块焯进正文的历史消息无效。展示侧再剥一次，保证任何来源的正文都不露出投影
// 标记或投影残块。无标记时原样返回，避免改动正常消息的空白与换行。
const PROJECTION_ANY_MARKER_RE = new RegExp(`${PROJECTION_OPEN_PATTERN}|${PROJECTION_CLOSE_PATTERN}`)
export function stripEmbeddedMessageProjectionFromVisibleText(value: unknown): string {
  const text = String(value ?? '')
  if (!PROJECTION_ANY_MARKER_RE.test(text)) return text
  return stripEmbeddedProjectionArtifacts(text)
}

export function parseEmbeddedMessageProjectionOutput(rawOutput: unknown): EmbeddedMessageProjectionParseResult {
  const rawText = String(rawOutput ?? '').replace(/\r\n/g, '\n')
  // 任何分支的可见正文都先剥离投影残块再去标签，保证标记永不泄漏到消息里。
  const cleanVisible = (text: string) => stripLeadingVisibleBodyLabel(stripEmbeddedProjectionArtifacts(text))
  // 结束标记的 body 也含“消息投影”，必须把结束分支放在前面，让 /消息投影 优先按结束标记归类。
  const markerRe = new RegExp(`(${PROJECTION_CLOSE_PATTERN})|(${PROJECTION_OPEN_PATTERN})`, 'g')
  const opens: Array<{ start: number; end: number }> = []
  const closes: Array<{ start: number; end: number }> = []
  let match: RegExpExecArray | null
  while ((match = markerRe.exec(rawText)) !== null) {
    const span = { start: match.index, end: match.index + match[0].length }
    if (match[1] !== undefined) closes.push(span)
    else opens.push(span)
    if (match[0].length === 0) markerRe.lastIndex++
  }
  if (!opens.length && !closes.length) {
    return {
      visibleText: cleanVisible(rawText),
      projectionText: '',
      hasProjection: false,
      error: '模型输出缺少【消息投影】区块'
    }
  }
  if (opens.length !== 1 || closes.length !== 1 || closes[0].start < opens[0].start) {
    return {
      visibleText: cleanVisible(rawText),
      projectionText: '',
      hasProjection: false,
      error: '模型输出中的【消息投影】边界不唯一或不完整'
    }
  }
  const projectionText = rawText.slice(opens[0].end, closes[0].start).trim()
  const visibleText = cleanVisible([
    rawText.slice(0, opens[0].start),
    rawText.slice(closes[0].end)
  ].join('\n'))
  return {
    visibleText,
    projectionText,
    hasProjection: Boolean(projectionText),
    error: projectionText ? '' : '模型输出的【消息投影】区块为空'
  }
}

function normalizeStatus(value: unknown, objectiveFact: string): MessageProjectionStatus {
  const text = toText(value)
  if (text === 'complete' || text === 'partial' || text === 'failed') return text
  return objectiveFact ? 'complete' : 'failed'
}

function normalizeChanged(value: unknown): { time: boolean; location: boolean } {
  const record = parseJsonObject(value)
  return {
    time: record.time === true,
    location: record.location === true
  }
}

function readLabeledLine(lines: string[], labels: string[]): string {
  for (const line of lines) {
    // 去掉行首的 markdown 装饰、项目符号、序号、引用符与括号，容忍模型乱加格式
    const trimmed = line
      .trim()
      .replace(/^[>#*•·\d\s.、)）(（\[\]【】-]+/, '')
      .trim()
    for (const label of labels) {
      // 允许标签被 ** 加粗或【】包裹，值尾部多余的 ** 也一并去掉
      const matched = trimmed.match(new RegExp(`^[*【]*\\s*${label}\\s*[*】]*\\s*[：:]\\s*(.*?)\\**$`, 'i'))
      if (matched) return toText(matched[1])
    }
  }
  return ''
}

function isEmptyMarker(value: string): boolean {
  const text = value.trim().toLowerCase()
  return !text || ['无', '没有', '不变', 'none', 'null', '-'].includes(text)
}

function parsePlainProjectionEnvChange(value: string, env: MessageProjectionEnv): {
  endEnv: MessageProjectionEnv
  changed: { time: boolean; location: boolean }
} {
  const text = toText(value)
  if (!text || isEmptyMarker(text)) return { endEnv: env, changed: { time: false, location: false } }
  const endEnv = { ...env }
  const changed = { time: false, location: false }
  const timeMatch = text.match(/时间\s*(?:=|：|:|变为|变成|来到|改为)\s*([^，,；;。]+)/)
  if (timeMatch?.[1]) {
    endEnv.time = toText(timeMatch[1])
    changed.time = true
  }
  const locationMatch = text.match(/地点\s*(?:=|：|:|变为|变成|来到|改为)\s*([^，,；;。]+)/)
  if (locationMatch?.[1]) {
    endEnv.location = toText(locationMatch[1])
    endEnv.locationSmall = endEnv.locationSmall || toText(locationMatch[1])
    changed.location = true
  }
  return { endEnv, changed }
}

function createFallback(input: {
  message: MessageProjectionSourceMessage
  fallbackCleanText: string
  failureStage: string
  failureReason: string
}): NormalizedMessageProjection {
  const env = normalizeEnv(input.message.env, {})
  return {
    status: 'failed',
    speakerId: toText(input.message.speakerId),
    speakerName: toText(input.message.speakerName),
    audienceIds: parseTextList(input.message.audienceIds),
    audienceNames: parseTextList(input.message.audienceNames),
    participants: [],
    objectiveFact: '',
    fallbackCleanText: input.fallbackCleanText,
    startEnv: env,
    endEnv: env,
    changed: { time: false, location: false },
    sourceProjectionIds: [],
    failureStage: input.failureStage,
    failureReason: input.failureReason
  }
}

function normalizePlainMessageProjectionOutput(
  rawOutput: string,
  message: MessageProjectionSourceMessage,
  fallbackCleanText: string
): NormalizedMessageProjection {
  const lines = stripMarkdownFence(rawOutput)
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter(Boolean)
  const rawFact = readLabeledLine(lines, ['事实', '客观事实', '投影'])
  if (!rawFact) {
    return createFallback({
      message,
      fallbackCleanText,
      failureStage: 'parse_output',
      failureReason: '模型输出缺少“事实：”行'
    })
  }
  const env = normalizeEnv(message.env, {})
  const uncertainty = readLabeledLine(lines, ['不确定', '原因', '疑问'])
  const parsedChange = parsePlainProjectionEnvChange(
    readLabeledLine(lines, ['变化', '时间地点变化', '场景变化']),
    env
  )
  const participants = [
    toText(message.speakerName),
    ...parseTextList(message.audienceNames)
  ].filter(Boolean)
  return {
    status: isEmptyMarker(uncertainty) ? 'complete' : 'partial',
    speakerId: toText(message.speakerId),
    speakerName: toText(message.speakerName),
    audienceIds: parseTextList(message.audienceIds),
    audienceNames: parseTextList(message.audienceNames),
    participants,
    objectiveFact: trimProjectionFact(rawFact),
    fallbackCleanText,
    startEnv: env,
    endEnv: parsedChange.endEnv,
    changed: parsedChange.changed,
    sourceProjectionIds: parseTextList(readLabeledLine(lines, ['参考', '来源'])),
    failureStage: '',
    failureReason: isEmptyMarker(uncertainty) ? '' : uncertainty
  }
}

export function normalizeMessageProjectionAgentOutput(
  rawOutput: unknown,
  message: MessageProjectionSourceMessage
): NormalizedMessageProjection {
  const fallbackCleanText = cleanMessageProjectionSourceText(message.content, { isUserMessage: message.role === 'user' })
  const rawText = String(rawOutput ?? '')
  const jsonCandidate = extractJsonObjectText(rawText)
  if (!jsonCandidate.trim().startsWith('{')) {
    return normalizePlainMessageProjectionOutput(rawText, message, fallbackCleanText)
  }
  let parsed: Record<string, any>
  try {
    parsed = JSON.parse(jsonCandidate)
  } catch (error) {
    return createFallback({
      message,
      fallbackCleanText,
      failureStage: 'parse_output',
      failureReason: `模型输出不是可解析 JSON：${(error as Error).message}`
    })
  }

  const objectiveFact = trimProjectionFact(toText(parsed.objectiveFact ?? parsed.objective_fact))
  const status = normalizeStatus(parsed.status, objectiveFact)
  const env = normalizeEnv(message.env, {})
  const failureStage = toText(parsed.failureStage ?? parsed.failure_stage)
  const failureReason = toText(parsed.failureReason ?? parsed.failure_reason)
  if (status !== 'failed' && !objectiveFact) {
    return createFallback({
      message,
      fallbackCleanText,
      failureStage: failureStage || 'validate_output',
      failureReason: failureReason || '投影缺少客观事实'
    })
  }

  return {
    status,
    speakerId: toText(parsed.speakerId ?? parsed.speaker_id) || toText(message.speakerId),
    speakerName: toText(parsed.speakerName ?? parsed.speaker_name) || toText(message.speakerName),
    audienceIds: parseTextList(parsed.audienceIds ?? parsed.audience_ids),
    audienceNames: parseTextList(parsed.audienceNames ?? parsed.audience_names),
    participants: parseTextList(parsed.participants),
    objectiveFact,
    fallbackCleanText: toText(parsed.fallbackCleanText ?? parsed.fallback_clean_text) || fallbackCleanText,
    startEnv: normalizeEnv(parsed.startEnv ?? parsed.start_env, env),
    endEnv: normalizeEnv(parsed.endEnv ?? parsed.end_env, env),
    changed: normalizeChanged(parsed.changed),
    sourceProjectionIds: parseTextList(parsed.sourceProjectionIds ?? parsed.source_projection_ids),
    failureStage,
    failureReason
  }
}

export function buildMessageProjectionPrompt(input: MessageProjectionPromptInput): MessageProjectionPromptTrace {
  const message = input.message
  const cleanText = cleanMessageProjectionSourceText(message.content, { isUserMessage: message.role === 'user' })
  const env = normalizeEnv(message.env, {})
  const envText = [
    env.time ? `时间=${env.time}` : '',
    (env.locationLarge || env.locationMiddle || env.locationSmall || env.location)
      ? `地点=${[env.locationLarge, env.locationMiddle, env.locationSmall].filter(Boolean).join(' / ') || env.location}`
      : '',
    env.weather ? `天气=${env.weather}` : ''
  ].filter(Boolean).join('，') || '未记录'
  const previousProjectionLines = input.previousProjections.slice(-2)
    .map((item) => {
      const fact = trimProjectionFact(toText(item.objectiveFact), 80)
      const speaker = toText(item.speakerName) || '未记录说话人'
      return fact ? `- #${Number(item.messageId || 0)} [${speaker}] ${fact}` : ''
    })
    .filter(Boolean)
  const userIdentityName = toText(message.userIdentityName)
    || (message.role === 'user' ? toText(message.speakerName) : '')
    || '未记录'
  const roleplayRules = message.role === 'user'
    ? [
        '',
        '用户消息解释规则：',
        `- 用户正在扮演“${userIdentityName}”；本条中的“我”或省略的行动主语默认指“${userIdentityName}”。`,
        '- “跟着他走 / 过去看看 / 点头”等省略主语短句，默认是当前身份选择并执行该行动；除非原文明示“对某人说 / 命令 / 让大家”等说话行为，不得改写成向会话成员下令。',
        '- 会话成员和投影可见范围不等于剧情在场人物，也不等于本条消息的听者；不得仅凭成员名单把任何人写进事实。'
      ]
    : [
        '',
        '身份与在场边界：',
        `- 当前用户扮演身份是“${userIdentityName}”；消息里的“你”只有在上下文明确指向用户时才能替换成该名字。`,
        '- 会话成员和投影可见范围不等于剧情在场人物；不得仅凭成员名单把任何人写进事实。'
      ]
  const inputText = [
    `说话人：${message.speakerName || '未记录'}`,
    `当前用户扮演身份：${userIdentityName}`,
    `环境：${envText}`,
    ...roleplayRules,
    '',
    '消息原文：',
    cleanText || '无',
    '',
    '紧邻此前两条已完成投影（按时间从早到晚；只用来确认代词、承接动作和场景，不要照抄）：',
    previousProjectionLines.length ? previousProjectionLines.join('\n') : '无'
  ].join('\n')
  const finalPrompt = [
    '【消息投影 Agent】',
    '把这条消息压缩成客观事实，要完整，不要写 JSON。',
    '',
    ...PROJECTION_CORE_RULES,
    '',
    '固定输出三行：',
    ...PROJECTION_OUTPUT_LINES,
    '',
    '输入材料：',
    inputText
  ].join('\n')
  return {
    messages: [
      { role: 'system', content: '你是琅嬛消息投影 Agent，只输出“事实/变化/不确定”三行。' },
      { role: 'user', content: finalPrompt }
    ],
    finalPrompt,
    promptBlocks: [
      { role: 'system', title: '消息投影 · 任务边界', content: '只把单条消息压缩成一条客观事实，不生成回复，不写主观心理。' },
      { role: 'user', title: `消息 ${message.id} · 投影输入`, content: inputText }
    ]
  }
}
