import { IMPROVISED_CHARACTER_CREATE_COMMAND } from './improvisedCharacterCommand'

export interface ChatSlashCommandInfo {
  id: string
  command: string
  title: string
  summary: string
  aliases?: string[]
  keywords?: string[]
}

export const CHAT_SLASH_COMMANDS: ChatSlashCommandInfo[] = [
  {
    id: 'narration_direct',
    command: '/旁白',
    title: '写入旁白',
    summary: '把后面的正文直接保存为本会话旁白，不触发角色回复。',
    keywords: ['手动旁白', '写旁白', 'narration']
  },
  {
    id: 'narration_agent_supplement',
    command: '/旁白_AGENT补充',
    title: 'Agent 润色旁白',
    summary: '把后面的正文交给 Agent 润色，再写入为旁白。',
    aliases: ['/旁白_agent补充'],
    keywords: ['润色旁白', '补充旁白', 'agent']
  },
  {
    id: 'improvised_character_create',
    command: IMPROVISED_CHARACTER_CREATE_COMMAND,
    title: '创建即兴角色',
    summary: '基于当前会话材料生成正式角色，并加入当前会话。',
    keywords: ['即兴角色', '新角色', '角色创建']
  },
  {
    id: 'temporary_entity_character',
    command: '/整理角色',
    title: '整理临时角色',
    summary: '从当前会话证据整理角色类临时资料，后续可转正式角色。',
    keywords: ['临时角色', '会话资料', '人物']
  },
  {
    id: 'temporary_entity_building',
    command: '/整理建筑',
    title: '整理临时建筑',
    summary: '从当前会话证据整理建筑资料，后续可写入文档库待确认页。',
    keywords: ['临时建筑', '地点', '场所']
  },
  {
    id: 'temporary_entity_region',
    command: '/整理地理区域',
    title: '整理临时地理区域',
    summary: '从当前会话证据整理区域、地点或地理范围资料。',
    aliases: ['/整理区域', '/整理地点'],
    keywords: ['临时区域', '地理', '地点']
  },
  {
    id: 'temporary_entity_faction',
    command: '/整理势力',
    title: '整理临时势力',
    summary: '从当前会话证据整理组织或势力资料。',
    aliases: ['/整理组织'],
    keywords: ['临时势力', '组织', '派系']
  },
  {
    id: 'temporary_entity_item',
    command: '/整理物品',
    title: '整理临时物品',
    summary: '从当前会话证据整理物品、道具或线索资料。',
    aliases: ['/整理道具'],
    keywords: ['临时物品', '道具', '线索']
  }
]

function normalizeSearchText(value: unknown): string {
  return String(value ?? '').trim().replace(/^\//, '').toLowerCase()
}

export function getSlashCommandQuery(input: unknown): string | null {
  const text = String(input ?? '').trimStart()
  if (!text.startsWith('/')) return null
  const body = text.slice(1)
  const whitespaceIndex = body.search(/[\s　]/)
  const commandPart = whitespaceIndex >= 0 ? body.slice(0, whitespaceIndex) : body
  const hasWhitespaceAfterCommand = whitespaceIndex >= 0
  const exactCommand = CHAT_SLASH_COMMANDS.some((item) => {
    const commandTexts = [item.command, ...(item.aliases || [])]
    return commandTexts.some((commandText) => normalizeSearchText(commandText) === normalizeSearchText(commandPart))
  })
  if (exactCommand && hasWhitespaceAfterCommand) return null
  return commandPart
}

export function filterChatSlashCommands(query: unknown): ChatSlashCommandInfo[] {
  const needle = normalizeSearchText(query)
  if (!needle) return CHAT_SLASH_COMMANDS
  return CHAT_SLASH_COMMANDS.filter((item) => {
    const haystack = [
      item.command,
      item.title,
      item.summary,
      ...(item.aliases || []),
      ...(item.keywords || [])
    ].map(normalizeSearchText)
    return haystack.some((part) => part.includes(needle))
  })
}
