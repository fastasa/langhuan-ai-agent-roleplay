import type {
  PersonalityKernelGuardDimension,
  PersonalityKernelGuardDimensionKey,
  PersonalityKernelParseResult,
  PersonalityKernelReactionPolicy
} from '../types/personalityKernel'
import type { AgentModelConfig } from '../types'
import { buildTaskModelAiOptions } from '../utils/modelTaskTiers'

type ChatRole = 'system' | 'user' | 'assistant'

export type PersonalityKernelParserCallAI = (
  messages: Array<{ role: ChatRole; content: string }>,
  options?: Record<string, unknown>
) => Promise<string | null> | string | null

export type RunPersonalityKernelParserInput = {
  characterId: string
  characterName?: string
  personalityText: string
  version?: number
  agentConfig?: Partial<AgentModelConfig> | null
  callAI?: PersonalityKernelParserCallAI
}

type GuardDefinition = {
  key: PersonalityKernelGuardDimensionKey
  meaning: string
}

type TextKernelCandidate = {
  stableSummary?: string
  guardDimensions?: Array<Record<string, unknown>>
  reactionPolicies?: Array<Record<string, unknown>>
}

type TextKernelSection = 'summary' | 'guards' | 'policies'

const KERNEL_VERSION = 1
const MAX_SOURCE_CHARS = 6000
const MAX_SUMMARY_CHARS = 520
const MAX_REASON_CHARS = 220
const MAX_PROMPT_SENTENCE_CHARS = 180
const MAX_POLICY_COUNT = 12
const MIN_POLICY_COUNT = 4
const SCORE_MIN = -1000
const SCORE_MAX = 1000

const PERSONALITY_KERNEL_MAIN_SITUATION_TAGS = [
  'request',
  'command',
  'threat',
  'intimacy_approach',
  'challenge',
  'betrayal',
  'failure',
  'success',
  'reassurance',
  'temptation'
] as const

const PERSONALITY_KERNEL_RELATION_MODIFIER_TAGS = [
  'boundary_respected',
  'boundary_crossed',
  'public_evaluation',
  'private_care',
  'comparison_pressure',
  'trust_repair',
  'trust_break'
] as const

const TEXT_GUARD_LABELS: Array<[string, PersonalityKernelGuardDimensionKey]> = [
  ['情绪稳定', 'emotionalStability'],
  ['情绪平稳', 'emotionalStability'],
  ['emotionalStability', 'emotionalStability'],
  ['信任开放', 'socialTrust'],
  ['社交信任', 'socialTrust'],
  ['socialTrust', 'socialTrust'],
  ['边界敏感', 'boundarySensitivity'],
  ['边界反应', 'boundarySensitivity'],
  ['boundarySensitivity', 'boundarySensitivity'],
  ['控制需求', 'controlNeed'],
  ['秩序需求', 'controlNeed'],
  ['controlNeed', 'controlNeed'],
  ['评价敏感', 'approvalSensitivity'],
  ['认可敏感', 'approvalSensitivity'],
  ['approvalSensitivity', 'approvalSensitivity'],
  ['表达外显', 'expressiveness'],
  ['情绪表达', 'expressiveness'],
  ['expressiveness', 'expressiveness'],
  ['冲突直接', 'conflictStyle'],
  ['冲突方式', 'conflictStyle'],
  ['conflictStyle', 'conflictStyle'],
  ['主动性', 'initiative'],
  ['主动程度', 'initiative'],
  ['initiative', 'initiative']
]

const TEXT_SITUATION_LABELS: Array<[string, string]> = [
  ['请求', 'request'],
  ['request', 'request'],
  ['命令', 'command'],
  ['指令', 'command'],
  ['command', 'command'],
  ['威胁', 'threat'],
  ['threat', 'threat'],
  ['亲近靠近', 'intimacy_approach'],
  ['亲密靠近', 'intimacy_approach'],
  ['靠近', 'intimacy_approach'],
  ['intimacy_approach', 'intimacy_approach'],
  ['挑战', 'challenge'],
  ['质疑', 'challenge'],
  ['challenge', 'challenge'],
  ['背叛', 'betrayal'],
  ['betrayal', 'betrayal'],
  ['失败', 'failure'],
  ['受挫', 'failure'],
  ['failure', 'failure'],
  ['成功', 'success'],
  ['被肯定', 'success'],
  ['success', 'success'],
  ['安抚', 'reassurance'],
  ['reassurance', 'reassurance'],
  ['诱惑', 'temptation'],
  ['引诱', 'temptation'],
  ['temptation', 'temptation'],
  ['边界被尊重', 'boundary_respected'],
  ['尊重边界', 'boundary_respected'],
  ['boundary_respected', 'boundary_respected'],
  ['越界', 'boundary_crossed'],
  ['边界被侵犯', 'boundary_crossed'],
  ['boundary_crossed', 'boundary_crossed'],
  ['公开评价', 'public_evaluation'],
  ['当众评价', 'public_evaluation'],
  ['public_evaluation', 'public_evaluation'],
  ['私下照顾', 'private_care'],
  ['私下关心', 'private_care'],
  ['private_care', 'private_care'],
  ['比较压力', 'comparison_pressure'],
  ['被比较', 'comparison_pressure'],
  ['comparison_pressure', 'comparison_pressure'],
  ['修复信任', 'trust_repair'],
  ['信任修复', 'trust_repair'],
  ['trust_repair', 'trust_repair'],
  ['破坏信任', 'trust_break'],
  ['信任破坏', 'trust_break'],
  ['trust_break', 'trust_break']
]

export const PERSONALITY_KERNEL_GUARD_DEFINITIONS: GuardDefinition[] = [
  {
    key: 'emotionalStability',
    meaning: '面对压力时保持平稳与恢复节奏的程度；低值表示容易被触发，高值表示更稳。'
  },
  {
    key: 'socialTrust',
    meaning: '默认信任他人和接纳善意的程度；低值表示警觉和怀疑，高值表示更开放。'
  },
  {
    key: 'boundarySensitivity',
    meaning: '识别冒犯、越界和私人空间受压时的敏感程度；高值表示边界反应更快。'
  },
  {
    key: 'controlNeed',
    meaning: '需要秩序、计划、证据和可控环境的程度；高值表示更不喜欢失控。'
  },
  {
    key: 'approvalSensitivity',
    meaning: '把评价、称赞、质疑内化为自我判断的程度；高值表示更受评价影响。'
  },
  {
    key: 'expressiveness',
    meaning: '情绪、欲望和立场外显的程度；低值表示克制含蓄，高值表示更外放。'
  },
  {
    key: 'conflictStyle',
    meaning: '冲突中的直接程度；低值偏回避和缓冲，高值偏正面回应或反击。'
  },
  {
    key: 'initiative',
    meaning: '主动争取、发起关系和推动行动的程度；低值偏等待，高值偏主动。'
  }
]

function toText(value: unknown): string {
  return String(value ?? '').trim()
}

function clampNumber(value: unknown, fallback = 0): number {
  const next = Number(value)
  if (!Number.isFinite(next)) return fallback
  return Math.max(SCORE_MIN, Math.min(SCORE_MAX, Math.round(next)))
}

function normalizeBoundPair(baseline: number, lower: unknown, upper: unknown): { lowerBound: number; upperBound: number } {
  let lowerBound = clampNumber(lower, Math.max(SCORE_MIN, baseline - 500))
  let upperBound = clampNumber(upper, Math.min(SCORE_MAX, baseline + 500))
  if (lowerBound > baseline) lowerBound = baseline
  if (upperBound < baseline) upperBound = baseline
  if (lowerBound > upperBound) {
    lowerBound = baseline
    upperBound = baseline
  }
  return { lowerBound, upperBound }
}

export function createPersonalitySourceHash(sourceText: string): string {
  const text = toText(sourceText)
  let hash = 2166136261
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return `ptk_${(hash >>> 0).toString(16).padStart(8, '0')}_${text.length}`
}

function normalizeTags(value: unknown): string[] {
  const allowed = new Set([...PERSONALITY_KERNEL_MAIN_SITUATION_TAGS, ...PERSONALITY_KERNEL_RELATION_MODIFIER_TAGS])
  const source = Array.isArray(value) ? value : toText(value).split(/[,\s/，、]+/)
  return Array.from(new Set(source
    .map((item) => toText(item))
    .filter((item) => allowed.has(item as never))
    .slice(0, 6)))
}

function normalizeGuardDimensions(value: unknown): PersonalityKernelGuardDimension[] {
  const source = Array.isArray(value) ? value : []
  const byKey = new Map<string, Record<string, unknown>>()
  for (const item of source) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue
    const record = item as Record<string, unknown>
    const key = toText(record.key)
    if (key) byKey.set(key, record)
  }
  return PERSONALITY_KERNEL_GUARD_DEFINITIONS.map((definition) => {
    const record = byKey.get(definition.key) || {}
    const baseline = clampNumber(record.baseline, 0)
    const bounds = normalizeBoundPair(baseline, record.lowerBound ?? record.lower_bound, record.upperBound ?? record.upper_bound)
    return {
      key: definition.key,
      baseline,
      ...bounds,
      meaning: toText(record.meaning).slice(0, MAX_REASON_CHARS) || definition.meaning
    }
  })
}

function normalizePolicyId(rawId: unknown, tags: string[], index: number): string {
  const raw = toText(rawId).replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_+/g, '_').slice(0, 60)
  return raw || `policy_${tags[0] || 'general'}_${index + 1}`
}

function normalizeReactionPolicies(value: unknown): PersonalityKernelReactionPolicy[] {
  const source = Array.isArray(value) ? value : []
  const seen = new Set<string>()
  const policies: PersonalityKernelReactionPolicy[] = []
  for (const item of source) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue
    const record = item as Record<string, unknown>
    const situationTags = normalizeTags(record.situationTags ?? record.situation_tags)
    const appraisal = toText(record.appraisal).slice(0, MAX_REASON_CHARS)
    const emotionTendency = toText(record.emotionTendency ?? record.emotion_tendency).slice(0, MAX_REASON_CHARS)
    const actionTendency = toText(record.actionTendency ?? record.action_tendency).slice(0, MAX_REASON_CHARS)
    const expressionTendency = toText(record.expressionTendency ?? record.expression_tendency).slice(0, MAX_REASON_CHARS)
    const promptSentence = toText(record.promptSentence ?? record.prompt_sentence).slice(0, MAX_PROMPT_SENTENCE_CHARS)
    if (!situationTags.length || !appraisal || !emotionTendency || !actionTendency || !expressionTendency || !promptSentence) {
      continue
    }
    const id = normalizePolicyId(record.id, situationTags, policies.length)
    if (seen.has(id)) continue
    seen.add(id)
    const baseWeight = clampNumber(record.baseWeight ?? record.base_weight, 0)
    const bounds = normalizeBoundPair(baseWeight, record.lowerWeight ?? record.lower_weight, record.upperWeight ?? record.upper_weight)
    policies.push({
      id,
      situationTags,
      appraisal,
      emotionTendency,
      actionTendency,
      expressionTendency,
      boundaryRule: toText(record.boundaryRule ?? record.boundary_rule).slice(0, MAX_REASON_CHARS) || undefined,
      trustRule: toText(record.trustRule ?? record.trust_rule).slice(0, MAX_REASON_CHARS) || undefined,
      reboundRule: toText(record.reboundRule ?? record.rebound_rule).slice(0, MAX_REASON_CHARS) || undefined,
      baseWeight,
      lowerWeight: bounds.lowerBound,
      upperWeight: bounds.upperBound,
      promptSentence
    })
    if (policies.length >= MAX_POLICY_COUNT) break
  }
  return policies
}

function stripListPrefix(line: string): string {
  return toText(line).replace(/^\s*(?:[-*+]\s*|\d+[.)、]\s*)/, '').trim()
}

function splitTextColumns(line: string): string[] {
  return stripListPrefix(line)
    .split('|')
    .map((item) => toText(item))
    .filter(Boolean)
}

function readFirstNumber(value: unknown, fallback = 0): number {
  const matched = toText(value).match(/-?\d+/)?.[0]
  return matched ? Number(matched) : fallback
}

function readGuardKey(label: unknown): PersonalityKernelGuardDimensionKey | null {
  const text = toText(label).replace(/\s+/g, '')
  if (!text) return null
  const matched = TEXT_GUARD_LABELS.find(([name]) => text.includes(name.replace(/\s+/g, '')))
  return matched?.[1] || null
}

function readSituationTags(...values: unknown[]): string[] {
  const allowed = new Set([...PERSONALITY_KERNEL_MAIN_SITUATION_TAGS, ...PERSONALITY_KERNEL_RELATION_MODIFIER_TAGS])
  const tags: string[] = []
  for (const value of values) {
    const text = toText(value).replace(/\s+/g, '')
    if (!text || ['无', '空', 'none', '-'].includes(text.toLowerCase())) continue
    for (const [label, tag] of TEXT_SITUATION_LABELS) {
      if (text.includes(label.replace(/\s+/g, '')) && allowed.has(tag as never) && !tags.includes(tag)) {
        tags.push(tag)
      }
    }
  }
  return tags.slice(0, 6)
}

function pushTextSectionLine(sections: Record<TextKernelSection, string[]>, current: TextKernelSection | null, line: string) {
  if (!current) return
  const text = stripListPrefix(line)
  if (text) sections[current].push(text)
}

function parseTextKernelCandidate(raw: string): TextKernelCandidate | null {
  const sections: Record<TextKernelSection, string[]> = {
    summary: [],
    guards: [],
    policies: []
  }
  let current: TextKernelSection | null = null
  for (const rawLine of toText(raw).split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line === '```' || line.startsWith('```')) continue
    const heading = line.match(/^#{0,6}\s*(稳定摘要|摘要|护栏|反应策略)\s*[:：]?\s*(.*)$/)
    if (heading) {
      const label = heading[1]
      current = label === '护栏' ? 'guards' : label === '反应策略' ? 'policies' : 'summary'
      pushTextSectionLine(sections, current, heading[2])
      continue
    }
    pushTextSectionLine(sections, current, line)
  }

  const guardDimensions = sections.guards
    .map((line) => {
      const columns = splitTextColumns(line)
      if (columns.length < 5) return null
      const key = readGuardKey(columns[0])
      if (!key) return null
      return {
        key,
        baseline: readFirstNumber(columns[1]),
        lowerBound: readFirstNumber(columns[2]),
        upperBound: readFirstNumber(columns[3]),
        meaning: columns.slice(4).join('；')
      }
    })
    .filter(Boolean) as Array<Record<string, unknown>>

  const reactionPolicies = sections.policies
    .map((line) => {
      const columns = splitTextColumns(line)
      if (columns.length < 12) return null
      const hasModifierColumn = columns.length >= 13
      const situationTags = hasModifierColumn
        ? readSituationTags(columns[0], columns[1])
        : readSituationTags(columns[0])
      const offset = hasModifierColumn ? 2 : 1
      if (!situationTags.length) return null
      return {
        situationTags,
        appraisal: columns[offset],
        emotionTendency: columns[offset + 1],
        actionTendency: columns[offset + 2],
        expressionTendency: columns[offset + 3],
        boundaryRule: columns[offset + 4],
        trustRule: columns[offset + 5],
        reboundRule: columns[offset + 6],
        baseWeight: readFirstNumber(columns[offset + 7]),
        lowerWeight: readFirstNumber(columns[offset + 8]),
        upperWeight: readFirstNumber(columns[offset + 9]),
        promptSentence: columns.slice(offset + 10).join('；')
      }
    })
    .filter(Boolean) as Array<Record<string, unknown>>

  const stableSummary = sections.summary.join('\n').trim()
  if (!stableSummary && !guardDimensions.length && !reactionPolicies.length) return null
  return {
    stableSummary,
    guardDimensions,
    reactionPolicies
  }
}

export function buildPersonalityKernelParserPrompt(input: Pick<RunPersonalityKernelParserInput, 'characterId' | 'characterName' | 'personalityText'>): string {
  const guardGuide = [
    '- 情绪稳定：面对压力时保持平稳与恢复节奏的程度；低值表示容易被触发，高值表示更稳。',
    '- 信任开放：默认信任他人和接纳善意的程度；低值表示警觉和怀疑，高值表示更开放。',
    '- 边界敏感：识别冒犯、越界和私人空间受压时的敏感程度；高值表示边界反应更快。',
    '- 控制需求：需要秩序、计划、证据和可控环境的程度；高值表示更不喜欢失控。',
    '- 评价敏感：把评价、称赞、质疑内化为自我判断的程度；高值表示更受评价影响。',
    '- 表达外显：情绪、欲望和立场外显的程度；低值表示克制含蓄，高值表示更外放。',
    '- 冲突直接：冲突中的直接程度；低值偏回避和缓冲，高值偏正面回应或反击。',
    '- 主动性：主动争取、发起关系和推动行动的程度；低值偏等待，高值偏主动。'
  ].join('\n')
  return [
    '你是琅嬛的角色人格内核解析模型。',
    '任务：把用户写的自然语言性格，解析成人格内核候选。',
    '只读稳定人格，不写会话内短期情绪；不要把一时心情写成长期人格。',
    '只输出下面的纯文本格式，不要输出 JSON，不要代码块，不要解释过程。',
    '不要写内部字段名、策略 ID、英文技术名；重点多写角色会怎样理解、怎样感受、怎样行动、怎样表达。',
    '',
    '输出格式：',
    '稳定摘要：',
    '用 2 到 4 句写这个角色长期稳定的性格底色、核心矛盾、压力来源和关系边界。',
    '',
    '护栏：',
    '情绪稳定|基准分|最低分|最高分|这个维度在角色身上的具体含义',
    '信任开放|基准分|最低分|最高分|这个维度在角色身上的具体含义',
    '边界敏感|基准分|最低分|最高分|这个维度在角色身上的具体含义',
    '控制需求|基准分|最低分|最高分|这个维度在角色身上的具体含义',
    '评价敏感|基准分|最低分|最高分|这个维度在角色身上的具体含义',
    '表达外显|基准分|最低分|最高分|这个维度在角色身上的具体含义',
    '冲突直接|基准分|最低分|最高分|这个维度在角色身上的具体含义',
    '主动性|基准分|最低分|最高分|这个维度在角色身上的具体含义',
    '',
    '反应策略：',
    '主要情境|关系修饰|她会怎样理解这类事|容易启动的情绪|倾向采取的行动|说话和外显方式|边界规则|信任变化规则|被反向刺激时怎样回弹|基准权重|最低权重|最高权重|可直接进入提示词的人话句子',
    '',
    '护栏维度必须正好覆盖：',
    guardGuide,
    '',
    '护栏和权重的分数都用 -1000 到 1000 的整数，最低分不能高于基准分，最高分不能低于基准分。',
    '主要情境只能从这些中文项选择：请求、命令、威胁、亲近靠近、挑战、背叛、失败、成功、安抚、诱惑。',
    '关系修饰可以留空或从这些中文项选择：边界被尊重、越界、公开评价、私下照顾、比较压力、修复信任、破坏信任。',
    '反应策略数量 6 到 10 条；每条都要写具体内容，不能只写“谨慎回应”“保持边界”这类空话。',
    '所有分数范围为 -1000 到 1000；上下限要体现该角色天生边界，不能全部照抄满幅。',
    '',
    `角色 ID：${toText(input.characterId)}`,
    `角色名：${toText(input.characterName) || '未命名角色'}`,
    '自然语言性格：',
    toText(input.personalityText).slice(0, MAX_SOURCE_CHARS)
  ].join('\n')
}

export function buildPersonalityKernelParserAiOptions(agentConfig?: Partial<AgentModelConfig> | null): Record<string, unknown> {
  return {
    ...buildTaskModelAiOptions(agentConfig || null, 'kernelParse', { maxTokens: 2600, temperature: 0.1, thinking: 'disabled' }),
    stream: false,
    feature: 'agent',
    logLabel: 'personality-kernel-parser',
    usageLabel: '人格内核解析',
    placeLabel: '人格内核解析',
    placeType: 'other'
  }
}

export function normalizePersonalityKernelParserOutput(
  rawOutput: unknown,
  input: Pick<RunPersonalityKernelParserInput, 'characterId' | 'personalityText' | 'version'>
): PersonalityKernelParseResult {
  const characterId = toText(input.characterId)
  const sourceText = toText(input.personalityText)
  const sourceTextHash = createPersonalitySourceHash(sourceText)
  const parsed = parseTextKernelCandidate(toText(rawOutput))
  if (!parsed) {
    return {
      status: 'failed',
      reason: '模型输出不符合人格内核文本格式。',
      sourceTextHash,
      rawOutput: toText(rawOutput)
    }
  }
  const stableSummary = toText(parsed.stableSummary).slice(0, MAX_SUMMARY_CHARS)
  const guardDimensions = normalizeGuardDimensions(parsed.guardDimensions)
  const reactionPolicies = normalizeReactionPolicies(parsed.reactionPolicies)
  if (!characterId) {
    return {
      status: 'failed',
      reason: '缺少角色 ID。',
      sourceTextHash,
      rawOutput: toText(rawOutput)
    }
  }
  if (!stableSummary) {
    return {
      status: 'failed',
      reason: '缺少稳定人格摘要。',
      sourceTextHash,
      rawOutput: toText(rawOutput)
    }
  }
  if (reactionPolicies.length < MIN_POLICY_COUNT) {
    return {
      status: 'failed',
      reason: `有效反应策略少于 ${MIN_POLICY_COUNT} 条。`,
      sourceTextHash,
      rawOutput: toText(rawOutput)
    }
  }
  return {
    status: 'parsed',
    reason: '人格内核解析完成。',
    sourceTextHash,
    rawOutput: toText(rawOutput),
    kernel: {
      characterId,
      version: Number(input.version || KERNEL_VERSION) || KERNEL_VERSION,
      sourceTextHash,
      stableSummary,
      guardDimensions,
      reactionPolicies
    }
  }
}

export async function runPersonalityKernelParser(
  input: RunPersonalityKernelParserInput
): Promise<PersonalityKernelParseResult> {
  const characterId = toText(input.characterId)
  const personalityText = toText(input.personalityText)
  const sourceTextHash = createPersonalitySourceHash(personalityText)
  if (!characterId) {
    return { status: 'failed', reason: '缺少角色 ID。', sourceTextHash }
  }
  if (!personalityText) {
    return { status: 'skipped', reason: '性格正文为空。', sourceTextHash }
  }
  if (typeof input.callAI !== 'function') {
    return { status: 'failed', reason: '缺少模型调用入口。', sourceTextHash }
  }
  const prompt = buildPersonalityKernelParserPrompt({
    characterId,
    characterName: input.characterName,
    personalityText
  })
  const output = await input.callAI([{ role: 'user', content: prompt }], buildPersonalityKernelParserAiOptions(input.agentConfig))
  return normalizePersonalityKernelParserOutput(output, {
    characterId,
    personalityText,
    version: input.version
  })
}
