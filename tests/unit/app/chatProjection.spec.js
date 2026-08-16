import { ref } from 'vue'
import { describe, expect, it } from 'vitest'
import { createChatProjection } from '../../../src/app/chatProjection.ts'

describe('chatProjection', () => {
  it('优先读取聊天域分组入口中的当前态、实体态和总结态', () => {
    const chatStore = {
      current: {
        currentChatTarget: ref('char_1'),
        workspaceCurrentTarget: ref(''),
        currentSession: ref({
          id: 'session_1',
          target_id: 'char_1',
          loadedSummaryIds: ['s1']
        }),
        currentMessages: ref([{ id: 1, content: '你好', role: 'user' }]),
        getActiveTargetId: () => 'char_1',
        getActiveSessionId: () => 'session_1',
        getActiveSessionTargetId: () => 'char_1',
        getCurrentSession: () => ({
          id: 'session_1',
          target_id: 'char_1',
          loadedSummaryIds: ['s1']
        }),
        getDisplayMessages: () => [{ id: 1, content: '你好', role: 'user' }]
      },
      entities: {
        chatTargets: ref({
          char_1: {
            id: 'char_1',
            kind: 'character'
          }
        })
      },
      summaries: {
        smallSummaries: ref([{ id: 's1', name: '第一份小结', content: '内容' }]),
        bigSummaries: ref([]),
        summaryLibrary: ref([])
      }
    }

    const charStore = {
      getCharacter: (id) => (id === 'char_1'
        ? { id: 'char_1', name: '星依', avatarPath: '/avatar.png' }
        : null)
    }

    const projection = createChatProjection({ chatStore, charStore })

    expect(projection.chatPanelViewModel.value.activeChatTargetId).toBe('char_1')
    expect(projection.chatPanelViewModel.value.activeChatSessionId).toBe('session_1')
    expect(projection.chatPanelViewModel.value.displayMessages).toEqual([{ id: 1, content: '你好', role: 'user' }])
    expect(projection.loadedSummaryBadges.value).toEqual([{ id: 's1', name: '第一份小结' }])
    expect(projection.chatHeaderInfo.value.title).toBe('星依')
  })

  it('通过统一访问入口兼容旧会话字段', () => {
    const chatStore = {
      current: {
        currentSession: ref({
          id: 'session_legacy',
          target_id: 'char_2',
          loaded_summary_ids: '["s9"]'
        }),
        getCurrentSession: () => ({
          id: 'session_legacy',
          target_id: 'char_2',
          loaded_summary_ids: '["s9"]'
        }),
        getActiveTargetId: () => 'char_2',
        getActiveSessionId: () => 'session_legacy',
        getActiveSessionTargetId: () => 'char_2',
        getDisplayMessages: () => []
      },
      entities: {
        chatTargets: ref({
          char_2: {
            id: 'char_2',
            kind: 'character'
          }
        })
      },
      summaries: {
        smallSummaries: ref([{ id: 's9', name: '旧字段总结', content: '内容' }]),
        bigSummaries: ref([]),
        summaryLibrary: ref([])
      }
    }

    const charStore = {
      getCharacter: () => ({ id: 'char_2', name: '小满', avatarPath: '/avatar2.png' })
    }

    const projection = createChatProjection({ chatStore, charStore })

    expect(projection.loadedSummaryBadges.value).toEqual([{ id: 's9', name: '旧字段总结' }])
  })
})
