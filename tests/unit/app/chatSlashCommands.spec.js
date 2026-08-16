import { describe, expect, it } from 'vitest'
import {
  CHAT_SLASH_COMMANDS,
  filterChatSlashCommands,
  getSlashCommandQuery
} from '../../../src/app/chatSlashCommands.ts'

describe('chatSlashCommands', () => {
  it('输入单独斜杠时展示全部正式命令', () => {
    expect(getSlashCommandQuery('/')).toBe('')
    expect(filterChatSlashCommands('')).toHaveLength(CHAT_SLASH_COMMANDS.length)
  })

  it('按命令名、说明和别名筛选命令', () => {
    expect(filterChatSlashCommands('旁').map((item) => item.command)).toEqual(['/旁白', '/旁白_AGENT补充'])
    expect(filterChatSlashCommands('建筑').map((item) => item.command)).toContain('/整理建筑')
    expect(filterChatSlashCommands('组织').map((item) => item.command)).toEqual(['/整理势力'])
    expect(filterChatSlashCommands('/整理地点').map((item) => item.command)).toEqual(['/整理地理区域'])
  })

  it('命令进入参数输入阶段后关闭面板', () => {
    expect(getSlashCommandQuery('/旁白 ')).toBeNull()
    expect(getSlashCommandQuery('/整理角色 杂货商')).toBeNull()
    expect(getSlashCommandQuery('/整理地点 旧港区')).toBeNull()
    expect(getSlashCommandQuery('/整理')).toBe('整理')
  })
})
