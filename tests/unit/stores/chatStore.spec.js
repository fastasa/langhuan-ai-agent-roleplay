/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useChatStore } from '../../../src/stores/chatStore.js'
import { useWorkspaceRuntimeStore } from '../../../src/app/workspaceRuntimeStore.js'

describe('chatStore pending persisted messages', () => {
  let store

  beforeEach(() => {
    setActivePinia(createPinia())
    store = useChatStore()
  })

  it('在目标会话尚未加载完成时，不提前补回待持久化消息', () => {
    store.current.currentChatTarget = 'group_a'
    store.current.currentSession = { id: 'other_session' }
    store.current.currentMessages = [
      { id: 1, role: 'assistant', content: '旧会话消息', time: '10:00:00', name: '甲' }
    ]

    store.queuePendingPersistedMessage('group_a', {
      id: 99,
      role: 'assistant',
      content: '新消息',
      time: '10:00:01',
      name: '乙'
    })

    expect(store.current.currentMessages).toHaveLength(1)
    expect(store.current.currentMessages[0].id).toBe(1)
    expect(store.runtime.pendingPersistedMessages.group_a).toHaveLength(1)
  })

  it('在目标会话真正就绪后，能够补回待持久化消息', () => {
    store.current.currentChatTarget = 'group_a'
    store.current.currentSession = { id: 'group_a' }
    store.runtime.sessionMessagesCache = {
      group_a: [
        { id: 1, role: 'assistant', content: '已有消息', time: '10:00:00', name: '甲' }
      ]
    }
    store.current.currentMessages = [...store.runtime.sessionMessagesCache.group_a]

    store.queuePendingPersistedMessage('group_a', {
      id: 99,
      role: 'assistant',
      content: '补回消息',
      time: '10:00:01',
      name: '乙'
    })

    expect(store.current.currentMessages).toHaveLength(2)
    expect(store.current.currentMessages[1].id).toBe(99)
    expect(store.runtime.pendingPersistedMessages.group_a).toBeUndefined()
  })

  it('补回同一条消息时保持去重', () => {
    store.current.currentChatTarget = 'group_a'
    store.current.currentSession = { id: 'group_a' }
    store.current.currentMessages = []

    store.queuePendingPersistedMessage('group_a', {
      id: 99,
      role: 'assistant',
      content: '补回消息',
      time: '10:00:01',
      name: '乙'
    })
    store.queuePendingPersistedMessage('group_a', {
      id: 99,
      role: 'assistant',
      content: '补回消息',
      time: '10:00:01',
      name: '乙'
    })

    expect(store.current.currentMessages).toHaveLength(1)
    expect(store.current.currentMessages[0].id).toBe(99)
  })

  it('本地流式消息按会话保存，切换会话时不会丢掉原目标的临时内容', () => {
    store.current.currentChatTarget = 'group_a'
    store.current.currentSession = { id: 'group_a' }
    store.current.currentMessages = []

    store.upsertLocalStreamingMessage('group_a', 'k1', {
      role: 'assistant',
      content: '流式片段',
      time: '10:00:02',
      name: '乙',
      _targetId: 'group_a'
    })

    expect(store.current.currentMessages).toHaveLength(1)

    store.current.currentChatTarget = 'group_b'
    store.current.currentSession = { id: 'group_b' }
    store.current.currentMessages = []

    expect(store.runtime.localStreamingMessages.group_a).toHaveLength(1)
    expect(store.runtime.localStreamingMessages.group_a[0].content).toBe('流式片段')
  })

  it('目标重新就绪后，显示列表会合并缓存消息与本地流式消息', () => {
    store.current.currentChatTarget = 'group_a'
    store.current.currentSession = { id: 'group_a' }
    store.runtime.sessionMessagesCache = {
      group_a: [
        { id: 1, role: 'user', content: '你好', time: '10:00:00', name: '我' }
      ]
    }

    store.upsertLocalStreamingMessage('group_a', 'k1', {
      role: 'assistant',
      content: '正在回复',
      time: '10:00:03',
      name: '乙',
      _targetId: 'group_a'
    })

    expect(store.current.currentMessages).toHaveLength(2)
    expect(store.current.currentMessages[0].id).toBe(1)
    expect(store.current.currentMessages[1].content).toBe('正在回复')
  })

  it('重试流式消息按原用户消息锚点插入，不追加到旧分支底部', () => {
    store.current.currentChatTarget = 'group_a'
    store.current.currentSession = { id: 'group_a' }
    store.runtime.sessionMessagesCache = {
      group_a: [
        { id: 1, role: 'assistant', content: '更早回复', time: '10:00:00', name: '乙' },
        { id: 2, role: 'user', content: '我女儿真可爱', time: '10:00:01', name: '我' },
        { id: 3, role: 'assistant', content: '旧回复', time: '10:00:02', name: '乙' }
      ]
    }

    store.upsertLocalStreamingMessage('group_a', 'retry-k1', {
      role: 'assistant',
      content: '',
      time: '10:00:03',
      name: '乙',
      _targetId: 'group_a',
      _localInsertAfterMessageId: 2
    })

    expect(store.current.currentMessages.map((message) => message.id || message._localStreamingKey)).toEqual([
      1,
      2,
      'retry-k1',
      3
    ])

    store.finalizeLocalStreamingMessage('group_a', 'retry-k1', {
      id: 4,
      role: 'assistant',
      content: '新回复',
      time: '10:00:04',
      name: '乙',
      _targetId: 'group_a',
      _localInsertAfterMessageId: 2
    })

    expect(store.current.currentMessages.map((message) => message.id)).toEqual([1, 2, 4, 3])
  })

  it('聊天运行态正式收口到 workspaceRuntimeStore', () => {
    const workspaceRuntimeStore = useWorkspaceRuntimeStore()

    store.upsertLocalStreamingMessage('group_a', 'k1', {
      role: 'assistant',
      content: '运行态统一入口',
      time: '10:00:03',
      name: '乙',
      _targetId: 'group_a'
    })

    expect(workspaceRuntimeStore.localStreamingMessages.group_a).toHaveLength(1)
    expect(workspaceRuntimeStore.streamingJobs).toHaveLength(1)
    expect(workspaceRuntimeStore.streamingJobs[0].content).toBe('运行态统一入口')
    expect(store.runtime.localStreamingMessages.group_a[0].content).toBe('运行态统一入口')
  })

  it('把实体态、当前态、运行态和总结态收口到独立分组入口', () => {
    store.current.currentChatTarget = 'char_1'
    store.current.currentSession = { id: 'session_1', target_id: 'char_1' }
    store.current.currentMessages = [{ id: 1, content: '你好' }]
    store.summaries.smallSummaries = [{ id: 's1', name: '小结', content: '内容' }]

    expect(store.current.currentChatTarget).toBe('char_1')
    expect(store.current.currentSession).toEqual({ id: 'session_1', target_id: 'char_1' })
    expect(store.current.currentMessages).toEqual([{ id: 1, content: '你好' }])
    expect(store.runtime.localStreamingMessages).toEqual({})
    expect(store.entities.chatSessions).toEqual({})
    expect(store.summaries.smallSummaries).toEqual([{ id: 's1', name: '小结', content: '内容' }])
    expect(store.current.getActiveTargetId()).toBe('char_1')
  })

  it('支持通过正式总结入口调整小总结和大总结顺序', () => {
    store.setSmallSummaries([{ id: 's1', name: '小结1', content: '甲' }])
    store.setBigSummaries([{ id: 'b1', name: '大结1', content: '乙', merged_summary_ids: [] }])

    expect(store.summaries.smallSummaries).toEqual([{ id: 's1', name: '小结1', content: '甲' }])
    expect(store.summaries.bigSummaries).toEqual([{ id: 'b1', name: '大结1', content: '乙', merged_summary_ids: [] }])
  })

  it('不再暴露聊天当前态与总结态的顶层兼容字段', () => {
    expect(store.currentChatTarget).toBeUndefined()
    expect(store.currentSession).toBeUndefined()
    expect(store.currentMessages).toBeUndefined()
    expect(store.chatSessions).toBeUndefined()
    expect(store.chatMessages).toBeUndefined()
    expect(store.sessionMessagesCache).toBeUndefined()
    expect(store.localStreamingMessages).toBeUndefined()
    expect(store.pendingPersistedMessages).toBeUndefined()
    expect(store.summaryLibrary).toBeUndefined()
    expect(store.smallSummaries).toBeUndefined()
    expect(store.bigSummaries).toBeUndefined()
  })
})
