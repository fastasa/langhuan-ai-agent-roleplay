import { buildCharacterCoreFieldGuide } from './characterProfilePromptGuidelines'

export const IMPROVISED_CHARACTER_CREATE_COMMAND = '/创建角色'
export const LEGACY_IMPROVISED_CHARACTER_CREATE_COMMAND = '/create'

export type ImprovisedCharacterContextSource = 'message'

export interface ImprovisedCharacterCreateCommand {
  type: 'improvised_character_create'
  targetName: string
  rawText: string
}

export interface ImprovisedCharacterContextMaterial {
  source: ImprovisedCharacterContextSource
  id: string
  kind: string
  content: string
  sanitizedContent: string
  speakerName?: string
  role?: string
  messageId?: number
  createdAt?: string
}

export interface ImprovisedCharacterContextBuildResult {
  command: ImprovisedCharacterCreateCommand
  materials: ImprovisedCharacterContextMaterial[]
  sanitizedContextText: string
  matchedMessageIds: number[]
  includedMessageIds: number[]
}

export interface ImprovisedCharacterExtractionPromptTrace {
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
  finalPrompt: string
  promptBlocks: Array<{ role: 'system' | 'user' | 'assistant'; title: string; content: string }>
}

export interface ImprovisedCharacterExtractionOutput {
  markdown: string
  characterCore: Record<string, unknown>
}

type MessageLike = Record<string, any>

function toText(value: unknown): string {
  return String(value ?? '').trim()
}

function readField(input: MessageLike, camelKey: string, snakeKey: string = camelKey): unknown {
  return input?.[camelKey] ?? input?.[snakeKey]
}

function readMessageId(message: MessageLike): number {
  return Number(readField(message, 'id')) || 0
}

function readMessageKind(message: MessageLike): string {
  return toText(readField(message, 'messageKind', 'message_kind')) || 'chat'
}

function readAutoWriteHidden(message: MessageLike): boolean {
  const value = readField(message, 'autoWriteHidden', 'auto_write_hidden')
  return value === true || value === 1 || value === '1' || value === 'true'
}

function readSpeakerName(message: MessageLike): string {
  return toText(readField(message, 'memberName', 'member_name'))
    || toText(readField(message, 'crowdName', 'crowd_name'))
    || toText(readField(message, 'name'))
    || (toText(readField(message, 'role')) === 'user' ? '用户' : '')
}

function includesTarget(message: MessageLike, targetName: string): boolean {
  const needle = targetName.trim().toLowerCase()
  if (!needle) return false
  const haystack = [
    readField(message, 'content'),
    readField(message, 'name'),
    readField(message, 'memberName', 'member_name'),
    readField(message, 'crowdName', 'crowd_name')
  ].map((item) => toText(item).toLowerCase()).join('\n')
  return haystack.includes(needle)
}

export function parseImprovisedCharacterCreateCommand(input: unknown): ImprovisedCharacterCreateCommand | null {
  const rawText = String(input ?? '').trim()
  if (!rawText) return null
  const match = rawText.match(/^\/创建角色(?:\s+(.+))?$/)
  if (!match) return null
  const targetName = toText(match[1]).replace(/\s+/g, ' ')
  if (!targetName) return null
  return {
    type: 'improvised_character_create',
    targetName,
    rawText
  }
}

export function parseLegacyImprovisedCharacterCreateCommand(input: unknown): ImprovisedCharacterCreateCommand | null {
  const rawText = String(input ?? '').trim()
  if (!rawText) return null
  const match = rawText.match(/^\/create(?:\s+(.+))?$/i)
  if (!match) return null
  const targetName = toText(match[1]).replace(/\s+/g, ' ')
  return {
    type: 'improvised_character_create',
    targetName,
    rawText
  }
}

export function sanitizeImprovisedCharacterContextText(input: unknown): string {
  return String(input ?? '')
    .replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, '')
    .replace(/[$*]/g, '')
    .replace(/[【】「」『』（）()\[\]]/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function isImprovisedCharacterVisibleMessage(message: MessageLike): boolean {
  if (!message || typeof message !== 'object') return false
  if (readAutoWriteHidden(message)) return false
  const kind = readMessageKind(message)
  if (kind === 'narration_debug') return false
  return kind === 'chat' || kind === 'narration' || kind === 'system'
}

export function buildImprovisedCharacterContext(input: {
  command: ImprovisedCharacterCreateCommand
  messages: MessageLike[]
}): ImprovisedCharacterContextBuildResult {
  const command = input.command
  const visibleMessages = (Array.isArray(input.messages) ? input.messages : [])
    .filter(isImprovisedCharacterVisibleMessage)
    .sort((left, right) => readMessageId(left) - readMessageId(right))
  const matchedIndexes = visibleMessages
    .map((message, index) => includesTarget(message, command.targetName) ? index : -1)
    .filter((index) => index >= 0)
  const includedIndexes = new Set<number>()
  for (const index of matchedIndexes) {
    includedIndexes.add(index)
    if (index > 0) includedIndexes.add(index - 1)
    if (index < visibleMessages.length - 1) includedIndexes.add(index + 1)
  }
  visibleMessages.forEach((message, index) => {
    if (readMessageKind(message) === 'narration') includedIndexes.add(index)
  })

  const messageMaterials = Array.from(includedIndexes)
    .sort((left, right) => left - right)
    .map((index) => {
      const message = visibleMessages[index]
      const content = toText(readField(message, 'content'))
      return {
        source: 'message' as const,
        id: `message:${readMessageId(message)}`,
        kind: readMessageKind(message),
        content,
        sanitizedContent: sanitizeImprovisedCharacterContextText(content),
        speakerName: readSpeakerName(message),
        role: toText(readField(message, 'role')),
        messageId: readMessageId(message),
        createdAt: toText(readField(message, 'createdAt', 'created_at'))
      }
    })
    .filter((item) => item.messageId && item.sanitizedContent)

  const materials = messageMaterials
  const sanitizedContextText = materials.map((item, index) => {
    return [
      `#${index + 1} 消息 ${item.messageId}`,
      `类型：${item.kind}`,
      `说话人：${item.speakerName || item.role || '未记录'}`,
      item.sanitizedContent
    ].join('\n')
  }).join('\n\n')

  return {
    command,
    materials,
    sanitizedContextText,
    matchedMessageIds: matchedIndexes.map((index) => readMessageId(visibleMessages[index])).filter(Boolean),
    includedMessageIds: messageMaterials.map((item) => Number(item.messageId || 0)).filter(Boolean)
  }
}

export function buildImprovisedCharacterExtractionPrompt(input: {
  targetName: string
  sanitizedContextText: string
}): ImprovisedCharacterExtractionPromptTrace {
  const targetName = toText(input.targetName)
  const contextText = toText(input.sanitizedContextText) || '无可用上下文材料。'
  const system = [
    '你是琅嬛的即兴角色核心资料提取器。',
    '任务：只根据用户当前会话中已经发生、且已经清洗过的材料，生成一个可以导入琅嬛角色核心资料的 Markdown。',
    '',
    '事实边界：',
    '1. 你看到的材料已经排除了隐藏消息和内部调试旁白；不要要求更多内部材料。',
    '2. 可以把少量线索补成一个完整、不自相矛盾、可继续互动的人设，但必须从给定材料找到起点。',
    '3. 不确定字段可以留空；年龄、性别、能力、背景没有依据时不要硬编具体数字或确定身份。',
    '4. 轻微矛盾可以自然吸收为误会、伪装、旁人误称、传闻或角色多面性，但不要解释推理过程。',
    '',
    '输出边界：',
    '1. 只输出 Markdown，不要解释、寒暄、来源分析、JSON、代码块或思考过程。',
    '2. 必须使用下面这些二级标题，不能新增字段，不能删除字段。',
    '3. 不得输出好感度、TTS 语音、昵称字段。',
    '4. 图标字段输出一个符合角色气质的 emoji。',
    '',
    buildCharacterCoreFieldGuide(),
    '',
    '字段标题：',
    '## 名称',
    '## 图标',
    '## 性别',
    '## 年龄',
    '## 简介',
    '## 性格',
    '## 目标与价值',
    '## 外貌',
    '## 说话风格',
    '## 穿着',
    '## 爱好',
    '## 能力',
    '## 经历',
    '## 世界观',
    '## 背景'
  ].join('\n')
  const user = [
    `用户命令称呼：${targetName || '未提供'}`,
    '',
    '已发生材料：',
    contextText,
    '',
    '请输出可导入的角色核心 Markdown。名称优先使用材料中更像正式称呼的名字；如果没有更正式名字，使用用户命令称呼。'
  ].join('\n')
  const messages: ImprovisedCharacterExtractionPromptTrace['messages'] = [
    { role: 'system', content: system },
    { role: 'user', content: user }
  ]
  const promptBlocks: ImprovisedCharacterExtractionPromptTrace['promptBlocks'] = [
    { role: 'system', title: '即兴角色提取 · 任务边界', content: system },
    { role: 'user', title: '即兴角色提取 · 清洗后上下文', content: user }
  ]
  return {
    messages,
    finalPrompt: messages.map((message) => `## ${message.role === 'system' ? 'System' : 'User'}\n${message.content}`).join('\n\n'),
    promptBlocks
  }
}

function stripMarkdownFence(value: string): string {
  return String(value || '')
    .replace(/^```(?:markdown|md)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()
}

export function readImprovisedCharacterMarkdownField(markdown: string, label: string): string {
  const source = String(markdown || '')
  const pattern = new RegExp(`^##\\s+${label}\\s*$`, 'm')
  const match = source.match(pattern)
  if (!match || match.index === undefined) return ''
  const start = match.index + match[0].length
  const tail = source.slice(start)
  const next = tail.search(/^##\s+/m)
  return (next >= 0 ? tail.slice(0, next) : tail).trim()
}

export function normalizeImprovisedCharacterExtractionOutput(
  rawOutput: unknown,
  targetName: string,
  parseMarkdown: (markdown: string) => Record<string, unknown>
): ImprovisedCharacterExtractionOutput {
  const text = stripMarkdownFence(String(rawOutput || ''))
  if (!text) throw new Error('模型输出为空')
  const withTitle = /^#\s+/m.test(text)
    ? text
    : `# ${toText(targetName) || '即兴角色'}\n\n${text}`
  const characterCore = parseMarkdown(withTitle)
  for (const key of ['affection', 'ttsVoice', 'tts_voice', 'nicknames']) {
    delete characterCore[key]
  }
  const name = toText(characterCore.name) || toText(targetName)
  if (!name) throw new Error('模型输出缺少名称字段')
  characterCore.name = name
  if (!readImprovisedCharacterMarkdownField(withTitle, '年龄')) {
    delete characterCore.age
  }
  return {
    markdown: withTitle,
    characterCore
  }
}
