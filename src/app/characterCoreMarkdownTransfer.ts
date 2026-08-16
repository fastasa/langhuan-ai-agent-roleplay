import type { Character } from '../types'
import { buildCharacterCoreFieldGuide } from './characterProfilePromptGuidelines'

type CharacterLike = Partial<Character> & Record<string, unknown>

export type CharacterCoreMarkdownChanges = Partial<Character> & Record<string, unknown>

type FieldSpec = {
  key: string
  aliases: string[]
  label: string
  kind: 'text' | 'number' | 'list' | 'json'
  outputKeys: string[]
  brainDocumentId?: string
}

const MARKER = '<!-- langhuan:character-core-markdown v1 -->'

const FIELD_SPECS: FieldSpec[] = [
  { key: 'name', aliases: ['name'], label: '名称', kind: 'text', outputKeys: ['name'] },
  { key: 'emoji', aliases: ['emoji'], label: '图标', kind: 'text', outputKeys: ['emoji'] },
  { key: 'gender', aliases: ['gender'], label: '性别', kind: 'text', outputKeys: ['gender'] },
  { key: 'age', aliases: ['age'], label: '年龄', kind: 'number', outputKeys: ['age'] },
  { key: 'desc', aliases: ['desc'], label: '简介', kind: 'text', outputKeys: ['desc'] },
  { key: 'personality', aliases: ['personality'], label: '性格', kind: 'text', outputKeys: ['personality'] },
  { key: 'goalValue', aliases: ['goalValue', 'goal_value'], label: '目标与价值', kind: 'text', outputKeys: [], brainDocumentId: 'brain:goal_value' },
  { key: 'appearance', aliases: ['appearance'], label: '外貌', kind: 'text', outputKeys: ['appearance'] },
  { key: 'speakingStyle', aliases: ['speakingStyle', 'speaking_style'], label: '说话风格', kind: 'text', outputKeys: ['speakingStyle', 'speaking_style'] },
  { key: 'outfit', aliases: ['outfit'], label: '穿着', kind: 'text', outputKeys: ['outfit'] },
  { key: 'hobbies', aliases: ['hobbies'], label: '爱好', kind: 'text', outputKeys: ['hobbies'] },
  { key: 'abilities', aliases: ['abilities'], label: '能力', kind: 'text', outputKeys: ['abilities'] },
  { key: 'experience', aliases: ['experience'], label: '经历', kind: 'text', outputKeys: ['experience'] },
  { key: 'worldview', aliases: ['worldview'], label: '世界观', kind: 'text', outputKeys: ['worldview'] },
  { key: 'background', aliases: ['background'], label: '背景', kind: 'text', outputKeys: ['background'] }
]

const FIELD_BY_LABEL = new Map(FIELD_SPECS.map((field) => [field.label, field]))

function readValue(source: CharacterLike, field: FieldSpec): unknown {
  if (field.brainDocumentId) {
    const documents = readBrainDocuments(source)
    const documentValue = documents[field.brainDocumentId]
    if (documentValue !== undefined && documentValue !== null) return documentValue
  }
  for (const alias of field.aliases) {
    const value = source[alias]
    if (value !== undefined && value !== null) return value
  }
  return field.kind === 'list' ? [] : field.kind === 'json' ? (field.key === 'yearlySchedule' ? [] : {}) : ''
}

function readBrainDocuments(source: CharacterLike): Record<string, unknown> {
  const raw = source.brainDocuments ?? source.brain_documents
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, unknown>
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw)
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : {}
    } catch {
      return {}
    }
  }
  return {}
}

function textValue(value: unknown): string {
  return String(value ?? '').trim()
}

function arrayValue(value: unknown): unknown[] {
  if (Array.isArray(value)) return value
  if (typeof value === 'string') {
    const raw = value.trim()
    if (!raw) return []
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed
    } catch {}
    return raw.split(/\r?\n/).map((line) => line.replace(/^\s*[-*]\s+/, '').trim()).filter(Boolean)
  }
  return []
}

function jsonValue(value: unknown, fallback: unknown): unknown {
  if (typeof value === 'string') {
    const raw = value.trim()
    if (!raw) return fallback
    try {
      return JSON.parse(raw)
    } catch {
      return fallback
    }
  }
  if (value && typeof value === 'object') return value
  return fallback
}

function renderField(source: CharacterLike, field: FieldSpec): string {
  const value = readValue(source, field)
  if (field.kind === 'list') {
    const items = arrayValue(value)
    return items.length ? items.map((item) => `- ${textValue(item)}`).join('\n') : ''
  }
  if (field.kind === 'json') {
    const fallback = field.key === 'yearlySchedule' ? [] : {}
    return ['```json', JSON.stringify(jsonValue(value, fallback), null, 2), '```'].join('\n')
  }
  return textValue(value)
}

export function buildCharacterCoreMarkdown(character: CharacterLike): string {
  const name = textValue(character.name) || '未命名角色'
  const sections = FIELD_SPECS.map((field) => `## ${field.label}\n\n${renderField(character, field)}`)
  return [`# ${name}`, '', MARKER, '', ...sections].join('\n\n').trim() + '\n'
}

export function buildCharacterCoreMarkdownPrompt(markdown: string, options?: { allowSeedSections?: boolean }): string {
  const content = String(markdown || '').trim()
  // allowSeedSections：生成角色带大脑种子（出生日期/灵魂/关键经历）时放行追加单位，避免与内文要求自相矛盾
  const structureRule = options?.allowSeedSections
    ? '1. 严格保留 Markdown 单位结构，核心字段只输出同样的单位标题；仅允许按内文要求在末尾追加「出生日期 / 灵魂 / 关键经历」三个补充单位，除此之外不新增单位。'
    : '1. 严格保留 Markdown 单位结构，只输出同样的单位标题，不新增单位。'
  return [
    '你是一名擅长角色塑造与长篇叙事设定的创作助手。',
    '',
    '请基于下面的琅嬛角色核心单位，补全或优化角色资料。目标不是堆设定，而是生成一个立体、真实、有血有肉、可长期互动的角色。',
    '',
    '要求：',
    structureRule,
    '2. 不要改写明显已经确定的事实；空字段可以补充，薄弱字段可以扩写。',
    '3. 性格、经历、说话风格、外貌、背景要互相支撑，避免互相矛盾。',
    '4. 角色要有欲望、弱点、习惯、矛盾、边界感和可被触发的情绪反应。',
    '5. 不要写成百科条目，要让资料能直接服务对话、剧情推进和长期角色一致性。',
    '6. 不得输出好感度、TTS 语音、昵称。',
    '7. 输出必须是可被琅嬛导入的 Markdown，不要解释你的思路，不要加前后寒暄。',
    '',
    buildCharacterCoreFieldGuide(),
    '',
    '角色资料：',
    '',
    content
  ].join('\n')
}

function stripJsonFence(value: string): string {
  const trimmed = value.trim()
  const match = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  return match ? match[1].trim() : trimmed
}

function parseList(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*[-*]\s+/, '').trim())
    .filter(Boolean)
}

function parseFieldValue(field: FieldSpec, value: string): unknown {
  const raw = value.trim()
  if (field.kind === 'number') {
    const numericText = raw.match(/-?\d+(?:\.\d+)?/)?.[0] || ''
    const next = Number(numericText || raw)
    return Number.isFinite(next) ? next : 0
  }
  if (field.kind === 'list') return parseList(raw)
  if (field.kind === 'json') {
    const jsonText = stripJsonFence(raw)
    if (!jsonText) return field.key === 'yearlySchedule' ? [] : {}
    return JSON.parse(jsonText)
  }
  return raw
}

export function parseCharacterCoreMarkdown(markdown: string): CharacterCoreMarkdownChanges {
  const source = String(markdown || '')
  if (!source.trim()) throw new Error('Markdown 内容为空')
  const matches = [...source.matchAll(/^##\s+(.+?)\s*$/gm)]
  if (!matches.length) throw new Error('未找到角色字段标题')

  const changes: CharacterCoreMarkdownChanges = {}
  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index]
    const label = String(match[1] || '').trim()
    const field = FIELD_BY_LABEL.get(label)
    if (!field) continue
    const start = (match.index || 0) + match[0].length
    const end = matches[index + 1]?.index ?? source.length
    const rawValue = source.slice(start, end).trim()
    const value = parseFieldValue(field, rawValue)
    if (field.brainDocumentId) {
      const documents = changes.brainDocuments && typeof changes.brainDocuments === 'object' && !Array.isArray(changes.brainDocuments)
        ? changes.brainDocuments as Record<string, string>
        : {}
      documents[field.brainDocumentId] = String(value ?? '').trim()
      changes.brainDocuments = documents
      changes.brain_documents = JSON.stringify(documents)
    }
    for (const outputKey of field.outputKeys) {
      changes[outputKey] = value
    }
  }
  if (!Object.keys(changes).length) throw new Error('未找到可导入的角色核心单位')
  return changes
}

export function getCharacterCoreMarkdownFilename(character: CharacterLike): string {
  const name = textValue(character.name).replace(/[\\/:*?"<>|]+/g, '_') || '角色'
  return `${name}.md`
}
