import { describe, expect, it } from 'vitest'
import { resolveChatHeaderTitle, resolveChatSessionTitle } from '../../../src/app/chatHeaderTitle.ts'

describe('resolveChatHeaderTitle', () => {
  it('公共会话标题解析始终优先正式 title，不把首位角色名当会话名', () => {
    expect(resolveChatSessionTitle({ title: '咒术回战' }, '三轮霞')).toBe('咒术回战')
  })

  it('优先显示当前会话命名', () => {
    expect(resolveChatHeaderTitle({
      session: {
        id: 'session_char_1',
        targetId: 'char_1',
        title: '用户命的会话名'
      },
      activeSessionId: 'session_char_1',
      targetId: 'char_1',
      fallbackTitle: '张元英'
    })).toBe('用户命的会话名')
  })

  it('会话不匹配时退回角色名', () => {
    expect(resolveChatHeaderTitle({
      session: {
        id: 'session_char_2',
        targetId: 'char_2',
        title: '别的会话'
      },
      activeSessionId: 'session_char_1',
      targetId: 'char_1',
      fallbackTitle: '张元英'
    })).toBe('张元英')
  })
})
