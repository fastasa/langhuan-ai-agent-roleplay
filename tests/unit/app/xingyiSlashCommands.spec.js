import { describe, expect, it } from 'vitest'
import {
  XINGYI_SLASH_COMMANDS,
  filterSlashCommands,
  parsePlayableWorldSlashCommand,
  parseSlashQuery
} from '../../../src/app/xingyiSlashCommands.ts'

describe('xingyiSlashCommands', () => {
  it('parseSlashQuery：/ 开头的单词元才是命令态，返回小写查询词', () => {
    expect(parseSlashQuery('/')).toBe('')
    expect(parseSlashQuery('/c')).toBe('c')
    expect(parseSlashQuery('/CLEAR')).toBe('clear')
  })

  it('parseSlashQuery：非 / 开头、带空白或换行都不是命令态', () => {
    expect(parseSlashQuery('你好')).toBe(null)
    expect(parseSlashQuery('')).toBe(null)
    expect(parseSlashQuery('/clear 现在')).toBe(null)
    expect(parseSlashQuery('/cle\nar')).toBe(null)
    expect(parseSlashQuery(' /clear')).toBe(null)
  })

  it('filterSlashCommands：空查询返回全部命令', () => {
    expect(filterSlashCommands('')).toEqual(XINGYI_SLASH_COMMANDS)
  })

  it('filterSlashCommands：子串匹配（c 只命中 clear，e 命中三条，无匹配为空）', () => {
    expect(filterSlashCommands('c').map((item) => item.name)).toEqual(['clear'])
    expect(filterSlashCommands('e').map((item) => item.name)).toEqual(['clear', 'resume', 'model'])
    expect(filterSlashCommands('zzz')).toEqual([])
  })

  it('/diary 命令已登记在命令表里，且 d 能搜到它', () => {
    expect(XINGYI_SLASH_COMMANDS.map((item) => item.name)).toContain('diary')
    expect(filterSlashCommands('d').map((item) => item.name)).toEqual(['model', 'diary', 'build-world'])
    expect(filterSlashCommands('diary').map((item) => item.name)).toEqual(['diary'])
  })

  it('/model 命令已登记，供星依和专业 Agent 会话复用', () => {
    expect(filterSlashCommands('model').map((item) => item.name)).toEqual(['model'])
  })

  it('/build-world 可携带自然语言需求，且不误判普通消息', () => {
    expect(parsePlayableWorldSlashCommand('/build-world 创建日式奇幻世界')).toBe('创建日式奇幻世界')
    expect(parsePlayableWorldSlashCommand('/BUILD-WORLD')).toBe('')
    expect(parsePlayableWorldSlashCommand('帮我创建完整世界')).toBe(null)
    expect(filterSlashCommands('build-world').map((item) => item.name)).toEqual(['build-world'])
  })
})
