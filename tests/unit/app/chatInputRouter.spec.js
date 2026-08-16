import { describe, expect, it } from 'vitest'
import { parseChatInputRoute } from '../../../src/app/chatInputRouter.ts'

describe('chatInputRouter', () => {
  it('returns empty route for blank input', () => {
    expect(parseChatInputRoute('   ')).toEqual({
      kind: 'empty',
      normalized: ''
    })
  })

  it('keeps user narration ahead of normal reply routing', () => {
    const route = parseChatInputRoute('/旁白 起风了')

    expect(route.kind).toBe('user_narration')
    expect(route.normalized).toBe('/旁白 起风了')
    if (route.kind === 'user_narration') {
      expect(route.command.content).toBe('起风了')
    }
  })

  it('routes improvised character commands', () => {
    const route = parseChatInputRoute('/创建角色 阿青')

    expect(route.kind).toBe('improvised_character_create')
    if (route.kind === 'improvised_character_create') {
      expect(route.command.targetName).toBe('阿青')
    }
  })

  it('routes legacy improvised character commands before reply', () => {
    const route = parseChatInputRoute('/create 阿青')

    expect(route.kind).toBe('legacy_improvised_character_create')
    if (route.kind === 'legacy_improvised_character_create') {
      expect(route.command.targetName).toBe('阿青')
    }
  })

  it('routes temporary entity organize commands', () => {
    const route = parseChatInputRoute('/整理建筑 钟楼')

    expect(route.kind).toBe('temporary_entity_organize')
    if (route.kind === 'temporary_entity_organize') {
      expect(route.command.kind).toBe('building')
      expect(route.command.targetName).toBe('钟楼')
    }
  })

  it('treats retired CAPS test command as normal reply text', () => {
    const route = parseChatInputRoute('/CAPS网络 测试输入')

    expect(route).toEqual({
      kind: 'reply',
      normalized: '/CAPS网络 测试输入'
    })
  })
})
