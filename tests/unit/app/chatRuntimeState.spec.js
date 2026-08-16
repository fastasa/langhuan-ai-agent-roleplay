import { describe, expect, it } from 'vitest'
import { ref } from 'vue'
import { createChatRuntimeState } from '../../../src/app/chatRuntimeState.ts'

describe('createChatRuntimeState', () => {
  it('会话 id 与目标 id 分离时仍按会话目标判断当前聊天已就绪', () => {
    const state = createChatRuntimeState({
      currentChatTarget: ref('char_1'),
      currentSession: ref({ id: 'session_1', target_id: 'char_1' }),
      currentMessages: ref([]),
      sessionMessagesCache: ref({}),
      pendingPersistedMessages: ref({}),
      localStreamingMessages: ref({}),
      chatMessages: ref({}),
      normalizeTargetId: (value) => String(value || ''),
      resolveSessionTargetId: (session) => String(session?.target_id || session?.targetId || ''),
      normalizeMessage: (message) => message,
      normalizeMessageForTarget: (_targetId, message) => message,
      buildDisplayMessages: () => []
    })

    expect(state.isTargetReady('char_1')).toBe(true)
    expect(state.isTargetReady('char_2')).toBe(false)
  })

  it('清空本地流式消息时会刷新当前显示列表', () => {
    const localStreamingMessages = ref({})
    const currentMessages = ref([])
    const state = createChatRuntimeState({
      currentChatTarget: ref('char_1'),
      currentSession: ref({ id: 'session_1', target_id: 'char_1' }),
      currentMessages,
      sessionMessagesCache: ref({}),
      pendingPersistedMessages: ref({}),
      localStreamingMessages,
      chatMessages: ref({}),
      normalizeTargetId: (value) => String(value || ''),
      resolveSessionTargetId: (session) => String(session?.target_id || session?.targetId || ''),
      normalizeMessage: (message) => message,
      normalizeMessageForTarget: (_targetId, message) => message,
      buildDisplayMessages: (_targetId, sessionId) => localStreamingMessages.value[sessionId] || []
    })

    state.upsertLocalStreamingMessage('session_1', 'local_1', {
      role: 'assistant',
      content: '等待中的角色',
      time: '',
      name: '惊雨'
    })
    expect(currentMessages.value).toHaveLength(1)

    state.clearLocalStreamingMessages()

    expect(localStreamingMessages.value).toEqual({})
    expect(currentMessages.value).toEqual([])
  })

  it('停止生成清理本地流式回复时保留已提交的用户消息', () => {
    const localStreamingMessages = ref({})
    const currentMessages = ref([])
    const state = createChatRuntimeState({
      currentChatTarget: ref('char_1'),
      currentSession: ref({ id: 'session_1', target_id: 'char_1' }),
      currentMessages,
      sessionMessagesCache: ref({}),
      pendingPersistedMessages: ref({}),
      localStreamingMessages,
      chatMessages: ref({}),
      normalizeTargetId: (value) => String(value || ''),
      resolveSessionTargetId: (session) => String(session?.target_id || session?.targetId || ''),
      normalizeMessage: (message) => message,
      normalizeMessageForTarget: (_targetId, message) => message,
      buildDisplayMessages: (_targetId, sessionId) => localStreamingMessages.value[sessionId] || []
    })

    state.upsertLocalStreamingMessage('session_1', 'local_user_1', {
      role: 'user',
      content: '用户刚发出的消息',
      time: '',
      name: '用户'
    })
    state.upsertLocalStreamingMessage('session_1', 'local_reply_1', {
      role: 'assistant',
      content: '未完成回复',
      time: '',
      name: '星依'
    })

    state.clearLocalStreamingMessages()

    expect(localStreamingMessages.value.session_1).toEqual([
      expect.objectContaining({
        role: 'user',
        content: '用户刚发出的消息'
      })
    ])
    expect(currentMessages.value).toEqual([
      expect.objectContaining({
        role: 'user',
        content: '用户刚发出的消息'
      })
    ])
  })
})
