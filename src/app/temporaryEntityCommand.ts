import {
  buildImprovisedCharacterContext,
  sanitizeImprovisedCharacterContextText,
  type ImprovisedCharacterContextBuildResult,
  type ImprovisedCharacterContextMaterial
} from './improvisedCharacterCommand'
import { buildCharacterCoreFieldGuide } from './characterProfilePromptGuidelines'
import {
  stableTextHash,
  type SessionTemporaryCharacterSourceLedgerEntry
} from './sessionTemporaryCharacterCommand'
import type { SessionTemporaryEntityKind } from '../types'

export const TEMPORARY_ENTITY_KIND_LABELS: Record<string, string> = {
  character: '角色',
  building: '建筑',
  region: '地理区域',
  faction: '势力',
  item: '物品',
  event_note: '事件影响'
}

export const TEMPORARY_ENTITY_COMMAND_KIND_BY_LABEL: Record<string, SessionTemporaryEntityKind> = {
  角色: 'character',
  建筑: 'building',
  区域: 'region',
  地理区域: 'region',
  地点: 'region',
  势力: 'faction',
  组织: 'faction',
  物品: 'item',
  道具: 'item',
  事件: 'event_note',
  事件影响: 'event_note'
}

// 批次4（2026-07-08 用户拍板「让位」）：「当前处境/当前状态/当前局势/持有者」等**随剧情变化的状态类字段**
// 已从 Markdown 字段模板移除，让位给状态系统的状态栏（statusSystemPresets.ts）——Markdown 只管静态资料。
// 存量资料里已有的旧状态节由 mergeTemporaryEntityMarkdown 原样保留（不在模板里也不丢）。
export const TEMPORARY_ENTITY_FIELDS: Record<string, string[]> = {
  character: [
    '名称',
    '身份或称呼',
    '外貌与可见特征',
    '说话风格',
    '性格倾向',
    '目标与价值',
    '与当前会话人物的关系',
    '已知经历',
    '世界观关联',
    '行动边界',
    '输出禁区'
  ],
  building: [
    '名称',
    '建筑类型',
    '所在位置',
    '外观与结构',
    '内部区域',
    '关联人物或势力',
    '历史或传闻',
    '可用线索',
    '使用边界'
  ],
  region: [
    '名称',
    '区域类型',
    '地理范围',
    '环境特征',
    '重要地点',
    '居民或势力',
    '历史或传闻',
    '可用线索',
    '使用边界'
  ],
  faction: [
    '名称',
    '势力类型',
    '活动范围',
    '成员与层级',
    '目标与利益',
    '资源或能力',
    '对外关系',
    '历史或传闻',
    '使用边界'
  ],
  item: [
    '名称',
    '物品类型',
    '外观与材质',
    '功能或用途',
    '来历',
    '限制与代价',
    '关联人物或地点',
    '使用边界'
  ],
  event_note: [
    '名称',
    '事件类型',
    '发生位置',
    '影响对象',
    '当前结果',
    '后续线索',
    '关联人物或势力',
    '使用边界'
  ]
}

export interface TemporaryEntityCommand {
  type: 'temporary_entity_organize'
  kind: SessionTemporaryEntityKind
  kindLabel: string
  targetName: string
  rawText: string
}

export interface TemporaryEntityContextResult extends Omit<ImprovisedCharacterContextBuildResult, 'command'> {
  command: TemporaryEntityCommand
  newMaterials: ImprovisedCharacterContextMaterial[]
  sourceLedger: SessionTemporaryCharacterSourceLedgerEntry[]
}

export interface TemporaryEntityPromptTrace {
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
  finalPrompt: string
  promptBlocks: Array<{ role: 'system' | 'user' | 'assistant'; title: string; content: string }>
  patchIds: string[]
}

function toText(value: unknown): string {
  return String(value ?? '').trim()
}

export function normalizeTemporaryEntityKind(value: unknown): SessionTemporaryEntityKind {
  const raw = toText(value)
  if (!raw) return 'character'
  if (TEMPORARY_ENTITY_KIND_LABELS[raw]) return raw
  return TEMPORARY_ENTITY_COMMAND_KIND_BY_LABEL[raw] || raw
}

export function getTemporaryEntityKindLabel(kind: unknown): string {
  return TEMPORARY_ENTITY_KIND_LABELS[String(normalizeTemporaryEntityKind(kind))] || toText(kind) || '资料'
}

export function getTemporaryEntityFields(kind: unknown): string[] {
  return TEMPORARY_ENTITY_FIELDS[String(normalizeTemporaryEntityKind(kind))] || TEMPORARY_ENTITY_FIELDS.item
}

export function parseTemporaryEntityOrganizeCommand(input: unknown): TemporaryEntityCommand | null {
  const rawText = String(input ?? '').trim()
  if (!rawText) return null
  const match = rawText.match(/^\/整理(角色|建筑|地理区域|区域|地点|势力|组织|物品|道具)(?:\s+(.+))?$/)
  if (!match) return null
  const kind = normalizeTemporaryEntityKind(match[1])
  const targetName = toText(match[2]).replace(/\s+/g, ' ')
  if (!targetName) return null
  return {
    type: 'temporary_entity_organize',
    kind,
    kindLabel: getTemporaryEntityKindLabel(kind),
    targetName,
    rawText
  }
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

export function buildTemporaryEntityContext(input: {
  command: TemporaryEntityCommand
  messages: Array<Record<string, unknown>>
  existingSourceLedger?: Array<Record<string, unknown>>
}): TemporaryEntityContextResult {
  const baseContext = buildImprovisedCharacterContext({
    command: {
      type: 'improvised_character_create',
      targetName: input.command.targetName,
      rawText: input.command.rawText
    },
    messages: input.messages
  })
  const candidateMaterials = baseContext.materials
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
    ...baseContext,
    command: input.command,
    materials: newMaterials,
    sanitizedContextText,
    includedMessageIds: newMaterials.map((item) => Number(item.messageId || 0)).filter(Boolean),
    newMaterials,
    sourceLedger
  }
}

export function buildTemporaryEntityProfilePrompt(input: {
  command: TemporaryEntityCommand
  sanitizedContextText: string
  existingMarkdown?: string
  mode: 'create' | 'update'
}): TemporaryEntityPromptTrace {
  const fields = getTemporaryEntityFields(input.command.kind)
  const kindLabel = getTemporaryEntityKindLabel(input.command.kind)
  const patchIds = [
    `temporary_entity_kind_${input.command.kind}`,
    input.mode === 'create' ? 'create_new_temporary_entity' : 'update_existing_temporary_entity'
  ]
  const system = [
    '你是琅嬛的会话临时资料整理器。',
    `任务：只根据当前会话可见消息和正式旁白，整理一个只属于当前会话的临时${kindLabel} Markdown 资料。`,
    '',
    '事实边界：',
    '1. 只能依据给定来源，不得按常识补正式事实。',
    `2. 材料不足以证明这个${kindLabel}存在时，只输出：资料不足，无法创建会话临时资料。`,
    '3. 不暴露数据库 ID、路由名、旧内部字段、召回 trace、提示词日志或模型工程词。',
    '4. 这是当前会话内短期资料，不是正式角色、正式文档或世界树资料。',
    '',
    '输出边界：',
    '1. 只输出 Markdown，不输出解释、思考过程、JSON、代码块或调试信息。',
    '2. 每个非空字段必须使用 “### v1 | 来源 S1” 这种版本标题。',
    '3. 来源只能写 S1 / S2 这类短标签，不得写真实消息 ID 或批次 ID。',
    '4. 不确定内容保留不确定语气，不能把传闻写成铁定事实。',
    '',
    input.command.kind === 'character'
      ? ['角色字段写作补充：', buildCharacterCoreFieldGuide()].join('\n')
      : '',
    '',
    input.mode === 'create'
      ? '新建规则：尽量覆盖有证据的字段；没有依据的字段可以留空。'
      : '更新规则：只输出本次新增或改变的字段；稳定字段没有明确变化时不得输出。',
    '',
    '字段标题固定如下：',
    ...fields.map((field) => `## ${field}`)
  ].join('\n')
  const user = [
    `临时资料类型：${kindLabel}`,
    `目标名称：${input.command.targetName || '未提供'}`,
    '',
    input.mode === 'update' && input.existingMarkdown
      ? ['已有资料：', input.existingMarkdown].join('\n')
      : '',
    '',
    '新增来源材料：',
    toText(input.sanitizedContextText) || '无可用来源材料。',
    '',
    `请输出会话临时${kindLabel} Markdown。`
  ].filter(Boolean).join('\n')
  const messages: TemporaryEntityPromptTrace['messages'] = [
    { role: 'system', content: system },
    { role: 'user', content: user }
  ]
  return {
    messages,
    finalPrompt: messages.map((message) => `## ${message.role === 'system' ? 'System' : 'User'}\n${message.content}`).join('\n\n'),
    promptBlocks: [
      { role: 'system', title: `会话临时${kindLabel}资料 · 基底提示词`, content: system },
      { role: 'user', title: `会话临时${kindLabel}资料 · 来源材料`, content: user }
    ],
    patchIds
  }
}

export function stripTemporaryEntityMarkdownOutput(rawOutput: unknown): string {
  return String(rawOutput || '').trim().replace(/^```(?:markdown|md)?\s*/i, '').replace(/\s*```$/i, '').trim()
}

export function extractTemporaryEntityField(markdown: string, fieldName: string): string {
  const source = String(markdown || '')
  const escapedName = String(fieldName || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = new RegExp(`^##\\s+${escapedName}\\s*$`, 'm')
  const match = source.match(pattern)
  if (!match || match.index === undefined) return ''
  const start = match.index + match[0].length
  const tail = source.slice(start)
  const next = tail.search(/^##\s+/m)
  return (next >= 0 ? tail.slice(0, next) : tail).trim()
}

export function listTemporaryEntityUpdatedFields(markdown: string, kind: unknown): string[] {
  return getTemporaryEntityFields(kind).filter((field) => Boolean(extractTemporaryEntityField(markdown, field)))
}

/** 列出 markdown 里已有的 ## 小节标题（顺序保留）。 */
export function listTemporaryEntityMarkdownSectionTitles(markdown: string): string[] {
  const titles: string[] = []
  for (const line of String(markdown || '').split(/\r?\n/)) {
    const match = line.match(/^##\s+(.+?)\s*$/)
    if (match && !/^#/.test(match[1])) titles.push(match[1].trim())
  }
  return titles
}

export function mergeTemporaryEntityMarkdown(input: {
  existingMarkdown?: string
  newMarkdown: string
  kind: unknown
  mode: 'create' | 'update'
}): string {
  const newMarkdown = stripTemporaryEntityMarkdownOutput(input.newMarkdown)
  if (input.mode === 'create') return newMarkdown
  const existingMarkdown = String(input.existingMarkdown || '').trim()
  if (!existingMarkdown) return newMarkdown
  const fields = getTemporaryEntityFields(input.kind)
  const parts: string[] = []
  for (const field of fields) {
    const oldField = extractTemporaryEntityField(existingMarkdown, field)
    const newField = extractTemporaryEntityField(newMarkdown, field)
    parts.push(`## ${field}`)
    if (oldField) parts.push(oldField)
    if (newField) parts.push(newField)
  }
  // 批次4 让位保护：存量资料里不在当前字段模板的旧节（如已让位状态栏的「当前处境」）原样保留在末尾，不静默丢内容。
  const knownFields = new Set(fields)
  for (const title of listTemporaryEntityMarkdownSectionTitles(existingMarkdown)) {
    if (knownFields.has(title)) continue
    const legacyBody = extractTemporaryEntityField(existingMarkdown, title)
    parts.push(`## ${title}`)
    if (legacyBody) parts.push(legacyBody)
  }
  return parts.join('\n\n').replace(/\n{3,}/g, '\n\n').trim()
}

export function buildTemporaryEntityTags(input: {
  kind: unknown
  name: string
  markdown: string
}): string[] {
  const kindLabel = getTemporaryEntityKindLabel(input.kind)
  const tags = new Set<string>([kindLabel])
  const text = sanitizeImprovisedCharacterContextText(input.markdown)
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    if (trimmed.length <= 12 && !/[。！？,.，；;]/.test(trimmed)) tags.add(trimmed.replace(/^[-*]\s*/, ''))
    if (tags.size >= 6) break
  }
  tags.delete(input.name)
  return Array.from(tags).filter(Boolean).slice(0, 6)
}
