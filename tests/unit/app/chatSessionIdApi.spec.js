import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createChatMessage,
  createChatMessageBySessionId,
  createChatSession,
  fetchChatSessionBundleById,
  saveChatSessionPatchById
} from '../../../src/repositories/chatRepository.ts'

function mockJsonResponse(body, ok = true) {
  return {
    ok,
    json: async () => body
  }
}

describe('chat sessionId API repository', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('新建同一角色的两条会话时返回两个独立 sessionId', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(mockJsonResponse({
        session: { id: 'session_a', targetId: 'char_1', targetType: 'char' },
        participants: [{ sessionId: 'session_a', participantTargetId: 'char_1' }],
        messages: []
      }))
      .mockResolvedValueOnce(mockJsonResponse({
        session: { id: 'session_b', targetId: 'char_1', targetType: 'char' },
        participants: [{ sessionId: 'session_b', participantTargetId: 'char_1' }],
        messages: []
      }))

    const first = await createChatSession({ targetId: 'char_1', targetType: 'char' })
    const second = await createChatSession({ targetId: 'char_1', targetType: 'char' })

    expect(first.session.id).toBe('session_a')
    expect(second.session.id).toBe('session_b')
    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/data/chat-sessions', expect.any(Object))
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/data/chat-sessions', expect.any(Object))
  })

  it('消息和会话更新都走 sessionId 路由，不再走 targetId 路由', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(mockJsonResponse({ id: 101 }))
      .mockResolvedValueOnce(mockJsonResponse({ ok: true }))
      .mockResolvedValueOnce(mockJsonResponse({
        session: { id: 'session_a', targetId: 'char_1', targetType: 'char' },
        participants: [],
        messages: [{ id: 101, sessionId: 'session_a', role: 'user', content: 'hi' }]
      }))

    await createChatMessageBySessionId('session_a', { role: 'user', content: 'hi' })
    await saveChatSessionPatchById('session_a', { title: '新的标题' })
    await fetchChatSessionBundleById('session_a')

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      '/api/data/chat-sessions/session_a/messages',
      expect.objectContaining({ method: 'POST' })
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/data/chat-sessions/session_a',
      expect.objectContaining({ method: 'PUT' })
    )
    expect(fetchMock).toHaveBeenNthCalledWith(3, '/api/data/chat-sessions/session_a')
  })

  it('新增消息能读取服务端包装后的消息编号', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(mockJsonResponse({ ok: true, id: 102 }))
      .mockResolvedValueOnce(mockJsonResponse({ ok: true, id: 103 }))

    await expect(createChatMessageBySessionId('session_a', { role: 'assistant', content: 'reply' })).resolves.toBe(102)
    await expect(createChatMessage('char_1', { role: 'assistant', content: 'reply' })).resolves.toBe(103)

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      '/api/data/chat-sessions/session_a/messages',
      expect.objectContaining({ method: 'POST' })
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/data/chat/char_1/messages',
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('新增消息响应缺少编号时直接暴露保存异常', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(mockJsonResponse({ ok: true }))

    await expect(createChatMessageBySessionId('session_a', { role: 'assistant', content: 'reply' }))
      .rejects
      .toThrow('发送消息失败: 响应缺少消息编号')
  })

  it('按 sessionId 读取会话时支持消息分页参数', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(mockJsonResponse({
        session: { id: 'session_a', targetId: 'char_1', targetType: 'char' },
        participants: [],
        messages: [{ id: 41, sessionId: 'session_a', role: 'assistant', content: 'older' }],
        pageInfo: { hasMore: true, oldestMessageId: 41 }
      }))

    const result = await fetchChatSessionBundleById('session_a', { limit: 80, beforeId: 120 })

    expect(fetchMock).toHaveBeenCalledWith('/api/data/chat-sessions/session_a?limit=80&beforeId=120')
    expect(result.pageInfo).toEqual({ hasMore: true, oldestMessageId: 41 })
  })
})
