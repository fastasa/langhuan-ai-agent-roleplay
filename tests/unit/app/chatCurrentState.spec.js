import { describe, expect, it } from 'vitest'
import {
  buildChatDisplayMessages,
  createChatCurrentState,
  resolveChatSessionByTargetId
} from '../../../src/app/chatCurrentState.ts'

describe('chatCurrentState', () => {
  it('把聊天当前态集中到独立模块里管理', () => {
    const state = createChatCurrentState({
      normalizeTargetId: (value) => String(value || '').trim()
    })

    state.setCurrentChatTarget(' char_1 ')
    state.setWorkspaceCurrentTarget(' char_2 ')
    state.setCurrentSession({ id: 'session_1', target_id: 'char_1' })
    state.setCurrentMessages([{ id: 1, content: '你好' }])

    expect(state.currentChatTarget.value).toBe('char_1')
    expect(state.workspaceCurrentTarget.value).toBe('char_2')
    expect(state.currentSession.value).toEqual({ id: 'session_1', target_id: 'char_1' })
    expect(state.currentMessages.value).toEqual([{ id: 1, content: '你好' }])
  })

  it('仍然能按目标解析当前会话并合并显示消息', () => {
    const session = resolveChatSessionByTargetId({
      targetId: 'char_1',
      currentSession: { id: 'session_1', target_id: 'char_1' },
      chatSessions: {
        char_1: { id: 'session_1', target_id: 'char_1' }
      },
      normalizeTargetId: (value) => String(value || '')
    })

    const messages = buildChatDisplayMessages({
      targetId: 'char_1',
      sessionMessagesCache: {
        char_1: [{ id: 1, content: '已有消息' }]
      },
      pendingPersistedMessages: {
        char_1: [{ id: 2, content: '待补回消息' }]
      },
      localStreamingMessages: {
        char_1: [{ _localStreamingKey: 'k1', content: '流式片段' }]
      },
      normalizeTargetId: (value) => String(value || ''),
      normalizeMessageForTarget: (_targetId, message) => message
    })

    expect(session).toEqual({ id: 'session_1', target_id: 'char_1' })
    expect(messages).toHaveLength(3)
    expect(messages[1].content).toBe('待补回消息')
    expect(messages[2].content).toBe('流式片段')
  })

  it('同一目标的不同会话按 sessionId 分开读取消息桶', () => {
    const firstMessages = buildChatDisplayMessages({
      targetId: 'char_1',
      sessionId: 'session_a',
      sessionMessagesCache: {
        session_a: [{ id: 1, content: '第一条会话' }],
        session_b: [{ id: 2, content: '第二条会话' }]
      },
      pendingPersistedMessages: {
        session_a: [{ id: 3, content: '第一条待补' }]
      },
      localStreamingMessages: {
        session_b: [{ _localStreamingKey: 'b', content: '不该出现' }]
      },
      normalizeTargetId: (value) => String(value || ''),
      normalizeMessageForTarget: (_targetId, message) => message
    })

    expect(firstMessages.map((message) => message.content)).toEqual(['第一条会话', '第一条待补'])
  })
})
