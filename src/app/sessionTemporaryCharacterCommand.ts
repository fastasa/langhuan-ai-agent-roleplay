import {
  buildImprovisedCharacterContext,
  sanitizeImprovisedCharacterContextText,
  type ImprovisedCharacterContextBuildResult,
  type ImprovisedCharacterContextMaterial
} from './improvisedCharacterCommand'
import { buildCharacterCoreFieldGuide } from './characterProfilePromptGuidelines'
import { buildEmbeddedMessageProjectionInstruction } from './messageProjectionAgent'

export const SESSION_TEMPORARY_CHARACTER_FIELDS = [
  '名称',
  '身份或称呼',
  '当前处境',
  '外貌与可见特征',
  '说话风格',
  '性格倾向',
  '目标与价值',
  '与当前会话人物的关系',
  '已知经历',
  '世界观关联',
  '行动边界',
  '输出禁区'
] as const

export const DELTA_SCORE_VALUES = [0, 0.25, 0.5, 0.75, 1] as const
export const CONFLICT_SCORE_VALUES = [0, 0.3, 0.7, 1] as const

export type SessionTemporaryCharacterFieldName = typeof SESSION_TEMPORARY_CHARACTER_FIELDS[number]
export type SessionTemporaryCharacterPatchId =
  | 'create_new_session_temporary_character'
  | 'update_existing_session_temporary_character'
  | 'field_locked'
  | 'identity_override'
  | 'explain_confidence'

export interface SessionTemporaryCharacterSourceLedgerEntry {
  sourceId: string
  shortLabel: string
  sourceType: 'message'
  sourceKind: string
  messageId?: number
  speakerName?: string
  createdAt?: string
  contentHash: string
  summary: string
  status?: 'used' | 'pending_judge' | 'locked_pending' | 'reorganized'
}

export interface SessionTemporaryCharacterContextResult extends ImprovisedCharacterContextBuildResult {
  newMaterials: ImprovisedCharacterContextMaterial[]
  sourceLedger: SessionTemporaryCharacterSourceLedgerEntry[]
}

export interface SessionTemporaryCharacterPromptTrace {
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
  finalPrompt: string
  promptBlocks: Array<{ role: 'system' | 'user' | 'assistant'; title: string; content: string }>
  patchIds: SessionTemporaryCharacterPatchId[]
}

export interface SessionTemporaryCharacterEvidenceJudgeOutput {
  deltaScore: number
  conflictScore: number
}

export interface SessionTemporaryCharacterNarrationPromptTrace {
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
  finalPrompt: string
  promptBlocks: Array<{ role: 'system' | 'user' | 'assistant'; title: string; content: string }>
}

function toText(value: unknown): string {
  return String(value ?? '').trim()
}

export function stableTextHash(value: unknown): string {
  const text = String(value ?? '')
  let hash = 2166136261
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

function readExistingSourceKeys(value: unknown): Set<string> {
  const items = Array.isArray(value) ? value : []
  const keys = new Set<string>()
  for (const item of items as Array<Record<string, unknown>>) {
    const sourceId = toText(item?.sourceId)
    const contentHash = toText(item?.contentHash)
    if (sourceId && contentHash) keys.add(`${sourceId}::${contentHash}`)
  }
  return keys
}

export function buildSessionTemporaryCharacterContext(input: {
  targetName: string
  messages: Array<Record<string, unknown>>
  existingSourceLedger?: Array<Record<string, unknown>>
}): SessionTemporaryCharacterContextResult {
  const targetName = toText(input.targetName)
  const command = {
    type: 'improvised_character_create' as const,
    targetName,
    rawText: `/整理角色 ${targetName}`
  }
  const context = buildImprovisedCharacterContext({
    command,
    messages: input.messages
  })
  const candidateMaterials = context.materials
  const existingKeys = readExistingSourceKeys(input.existingSourceLedger)
  const newMaterials = candidateMaterials.filter((material) => {
    const contentHash = stableTextHash(material.sanitizedContent)
    return !existingKeys.has(`${material.id}::${contentHash}`)
  })
  const sourceLedger = newMaterials.map((material, index) => ({
    sourceId: material.id,
    shortLabel: `S${index + 1}`,
    sourceType: material.source,
    sourceKind: material.kind,
    messageId: material.messageId,
    speakerName: material.speakerName,
    createdAt: material.createdAt,
    contentHash: stableTextHash(material.sanitizedContent),
    summary: material.sanitizedContent.slice(0, 80),
    status: 'used' as const
  }))
  const sanitizedContextText = newMaterials.map((material, index) => {
    const label = sourceLedger[index]?.shortLabel || `S${index + 1}`
    return [
      `${label} | 消息 ${material.messageId}`,
      `类型：${material.kind}`,
      `说话人：${material.speakerName || material.role || '未记录'}`,
      material.sanitizedContent
    ].join('\n')
  }).join('\n\n')
  return {
    ...context,
    materials: newMaterials,
    sanitizedContextText,
    includedMessageIds: newMaterials.map((item) => Number(item.messageId || 0)).filter(Boolean),
    newMaterials,
    sourceLedger
  }
}

export function buildSessionTemporaryCharacterProfilePrompt(input: {
  targetName: string
  sanitizedContextText: string
  existingMarkdown?: string
  lockedFields?: string[]
  mode: 'create' | 'update'
}): SessionTemporaryCharacterPromptTrace {
  const targetName = toText(input.targetName)
  const lockedFields = Array.isArray(input.lockedFields)
    ? input.lockedFields.map((item) => toText(item)).filter(Boolean)
    : []
  const patchIds: SessionTemporaryCharacterPatchId[] = [
    input.mode === 'create' ? 'create_new_session_temporary_character' : 'update_existing_session_temporary_character',
    'explain_confidence'
  ]
  if (lockedFields.length) patchIds.push('field_locked')
  const system = [
    '你是琅嬛的会话临时角色资料整理器。',
    '任务：只根据当前会话可见消息和正式旁白，整理一个只属于当前会话的临时人物 Markdown 资料。',
    '',
    '事实边界：',
    '1. 只能依据给定来源，不得按常识补正式事实。',
    '2. 材料不足以证明这个人物存在时，只输出：资料不足，无法创建会话临时角色。',
    '3. 不暴露数据库 ID、路由名、旧内部字段、召回 trace、提示词日志或模型工程词。',
    '4. 置信度表示资料版本面对新增材料时的稳定程度，不是真实概率。',
    '',
    '输出边界：',
    '1. 只输出 Markdown，不输出解释、思考过程、JSON、代码块或调试信息。',
    '2. 每个非空字段必须使用 “### v1 | 置信度 0.70 | 来源 S1” 这种版本标题。',
    '3. 来源只能写 S1 / S2 这类短标签，不得写真实消息 ID 或批次 ID。',
    '4. 不确定内容保留不确定语气，不能把传闻写成铁定事实。',
    '',
    '角色字段写作补充：',
    buildCharacterCoreFieldGuide(),
    '',
    input.mode === 'create'
      ? '新建规则：尽量覆盖全部字段；没有依据的字段可以留空。'
      : '更新规则：只输出本次新增或改变的字段；姓名、性别、基础身份、简介等稳定字段没有明确变化时不得输出。',
    lockedFields.length
      ? `锁定字段：${lockedFields.join('、')}。这些字段不得输出新版本，不得降低置信度；相关材料交给系统标记为待处理。`
      : '',
    '',
    '字段标题固定如下：',
    ...SESSION_TEMPORARY_CHARACTER_FIELDS.map((field) => `## ${field}`)
  ].filter(Boolean).join('\n')
  const user = [
    `目标称呼：${targetName || '未提供'}`,
    '',
    input.mode === 'update' && input.existingMarkdown
      ? ['已有资料：', input.existingMarkdown].join('\n')
      : '',
    '',
    '新增来源材料：',
    toText(input.sanitizedContextText) || '无可用来源材料。',
    '',
    '请输出会话临时角色 Markdown。'
  ].filter(Boolean).join('\n')
  const messages: SessionTemporaryCharacterPromptTrace['messages'] = [
    { role: 'system', content: system },
    { role: 'user', content: user }
  ]
  const promptBlocks: SessionTemporaryCharacterPromptTrace['promptBlocks'] = [
    { role: 'system', title: '会话临时角色资料 · 基底提示词', content: system },
    { role: 'user', title: '会话临时角色资料 · 来源材料', content: user }
  ]
  return {
    messages,
    finalPrompt: messages.map((message) => `## ${message.role === 'system' ? 'System' : 'User'}\n${message.content}`).join('\n\n'),
    promptBlocks,
    patchIds
  }
}

export function buildTemporaryCharacterEvidenceJudgePrompt(input: {
  oldFieldText: string
  newFieldText: string
}): SessionTemporaryCharacterPromptTrace {
  const system = [
    '你是 TemporaryCharacterEvidenceJudge。',
    '任务：只比较旧字段原文和新字段内容，输出信息增量分 deltaScore 与冲突等级 conflictScore。',
    'deltaScore 只能是 0 / 0.25 / 0.5 / 0.75 / 1。',
    'conflictScore 只能是 0 / 0.3 / 0.7 / 1。',
    '只输出 JSON，不要解释，不要输出最终角色资料，不要写思考过程。'
  ].join('\n')
  const user = [
    '旧字段原文：',
    sanitizeImprovisedCharacterContextText(input.oldFieldText),
    '',
    '新字段内容：',
    sanitizeImprovisedCharacterContextText(input.newFieldText),
    '',
    '输出示例：{"deltaScore":0.5,"conflictScore":0.3}'
  ].join('\n')
  const messages: SessionTemporaryCharacterPromptTrace['messages'] = [
    { role: 'system', content: system },
    { role: 'user', content: user }
  ]
  return {
    messages,
    finalPrompt: messages.map((message) => `## ${message.role === 'system' ? 'System' : 'User'}\n${message.content}`).join('\n\n'),
    promptBlocks: [
      { role: 'system', title: '临时角色证据裁判 · 任务边界', content: system },
      { role: 'user', title: '临时角色证据裁判 · 字段对比', content: user }
    ],
    patchIds: []
  }
}

export function buildSessionTemporaryCharacterNarrationPrompt(input: {
  characterName: string
  markdown: string
  userText: string
  recentContextText?: string
}): SessionTemporaryCharacterNarrationPromptTrace {
  const characterName = toText(input.characterName)
  const system = [
    '你是琅嬛的会话临时角色旁白输出器。',
    '任务：根据当前会话临时角色资料和本轮用户输入，以旁白形式呈现这个临时人物的回应。',
    '',
    '硬边界：',
    '1. 只依据会话临时角色 Markdown、最近聊天上下文和本轮用户输入，不读取或假装读取正式角色大脑。',
    '2. 正文部分必须是可直接写入聊天记录的旁白；不要写角色名冒号、对话气泡格式、标题、列表、JSON、代码块或解释。',
    '3. 不暴露来源标签、置信度、提示词、字段名、数据库 ID、内部判断或模型工程词。',
    '4. 不得把这个临时人物说成正式角色，不得要求把它加入角色页、会话成员或联系人侧栏。',
    '5. 可以描写这个人物的动作、语气、短句回应或现场反应，但不要替用户做决定，也不要越过资料里的输出禁区。',
    '6. 如资料不足以支撑明确细节，保持克制，用当前场景可承接的模糊描写，不要补写长期设定。',
    '',
    buildEmbeddedMessageProjectionInstruction('本条会话临时角色旁白')
  ].join('\n')
  const user = [
    `临时人物称呼：${characterName || '未记录'}`,
    '',
    '会话临时角色资料：',
    toText(input.markdown) || '无资料。',
    '',
    '最近聊天上下文：',
    toText(input.recentContextText) || '无。',
    '',
    '本轮用户输入：',
    toText(input.userText) || '无。',
    '',
    '请按系统要求输出正文和消息投影。'
  ].join('\n')
  const messages: SessionTemporaryCharacterNarrationPromptTrace['messages'] = [
    { role: 'system', content: system },
    { role: 'user', content: user }
  ]
  return {
    messages,
    finalPrompt: messages.map((message) => `## ${message.role === 'system' ? 'System' : 'User'}\n${message.content}`).join('\n\n'),
    promptBlocks: [
      { role: 'system', title: '会话临时角色旁白 · 输出边界', content: system },
      { role: 'user', title: '会话临时角色旁白 · 资料与本轮输入', content: user }
    ]
  }
}

function isAllowedScore(value: number, allowed: readonly number[]): boolean {
  return allowed.some((item) => Math.abs(item - value) < 0.0001)
}

export function parseTemporaryCharacterEvidenceJudgeOutput(rawOutput: unknown): SessionTemporaryCharacterEvidenceJudgeOutput {
  const text = String(rawOutput ?? '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '')
  let parsed: any
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('裁判输出不是合法 JSON')
  }
  const deltaScore = Number(parsed?.deltaScore)
  const conflictScore = Number(parsed?.conflictScore)
  if (!isAllowedScore(deltaScore, DELTA_SCORE_VALUES)) throw new Error('deltaScore 不在允许枚举内')
  if (!isAllowedScore(conflictScore, CONFLICT_SCORE_VALUES)) throw new Error('conflictScore 不在允许枚举内')
  return { deltaScore, conflictScore }
}

export function extractSessionTemporaryCharacterField(markdown: string, fieldName: string): string {
  const source = String(markdown || '')
  const pattern = new RegExp(`^##\\s+${fieldName}\\s*$`, 'm')
  const match = source.match(pattern)
  if (!match || match.index === undefined) return ''
  const start = match.index + match[0].length
  const tail = source.slice(start)
  const next = tail.search(/^##\s+/m)
  return (next >= 0 ? tail.slice(0, next) : tail).trim()
}

export function listSessionTemporaryCharacterUpdatedFields(markdown: string): string[] {
  return SESSION_TEMPORARY_CHARACTER_FIELDS.filter((field) => Boolean(extractSessionTemporaryCharacterField(markdown, field)))
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function calculateTemporaryCharacterConfidence(input: {
  previousConfidence?: number
  deltaScore: number
  conflictScore: number
  sourceQuality?: number
  staleness?: number
}): { oldConfidence: number; newConfidence: number; decay: number; shouldReorganize: boolean } {
  const previousConfidence = Number.isFinite(input.previousConfidence) ? Number(input.previousConfidence) : 0.72
  const sourceQuality = Number.isFinite(input.sourceQuality) ? Number(input.sourceQuality) : 0.72
  const staleness = Number.isFinite(input.staleness) ? Number(input.staleness) : 0
  const decay = clamp(0.04 + 0.18 * input.deltaScore + 0.28 * input.conflictScore + 0.04 * staleness, 0.04, 0.46)
  const oldConfidence = Math.round(previousConfidence * (1 - decay) * 100) / 100
  const newConfidence = Math.round(clamp(0.50 + 0.20 * sourceQuality + 0.20 * input.deltaScore - 0.12 * input.conflictScore, 0.45, 0.9) * 100) / 100
  return {
    oldConfidence,
    newConfidence,
    decay: Math.round(decay * 100) / 100,
    shouldReorganize: oldConfidence < 0.45 || (input.conflictScore >= 1 && previousConfidence > 0.55 && newConfidence > 0.55)
  }
}

export function mergeSessionTemporaryCharacterMarkdown(input: {
  existingMarkdown?: string
  newMarkdown: string
  mode: 'create' | 'update'
}): string {
  const newMarkdown = String(input.newMarkdown || '').trim()
  if (input.mode === 'create') return newMarkdown
  const existingMarkdown = String(input.existingMarkdown || '').trim()
  if (!existingMarkdown) return newMarkdown
  const parts: string[] = []
  for (const field of SESSION_TEMPORARY_CHARACTER_FIELDS) {
    const oldField = extractSessionTemporaryCharacterField(existingMarkdown, field)
    const newField = extractSessionTemporaryCharacterField(newMarkdown, field)
    parts.push(`## ${field}`)
    if (oldField) parts.push(oldField)
    if (newField) parts.push(newField)
  }
  return parts.join('\n\n').replace(/\n{3,}/g, '\n\n').trim()
}
