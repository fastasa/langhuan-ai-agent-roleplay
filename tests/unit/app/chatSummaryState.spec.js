import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { createChatSummaryState } from '../../../src/app/chatSummaryState.ts'

describe('chatSummaryState', () => {
  it('加载总结时会优先使用正式当前会话与正式当前目标', () => {
    const updateSession = vi.fn(async () => {})
    const activeSession = {
      id: 'session_1',
      loaded_summary_ids: []
    }

    const state = createChatSummaryState({
      summaryLibrary: ref([]),
      summaryIdCounter: ref(1),
      currentSession: ref(null),
      currentChatTarget: ref(''),
      getCurrentSession: () => activeSession,
      getActiveTargetId: () => 'char_42',
      updateSession
    })

    state.loadSummary('summary_a')

    expect(activeSession.loaded_summary_ids).toEqual(['summary_a'])
    expect(activeSession.loadedSummaryIds).toEqual(['summary_a'])
    expect(updateSession).toHaveBeenCalledWith('char_42', {
      loadedSummaryIds: ['summary_a']
    })
  })

  it('读取已加载总结时会和正式当前会话保持一致', () => {
    const activeSession = {
      id: 'session_2',
      loadedSummaryIds: ['summary_a', 'summary_b']
    }

    const state = createChatSummaryState({
      summaryLibrary: ref([]),
      summaryIdCounter: ref(1),
      currentSession: ref(null),
      currentChatTarget: ref(''),
      getCurrentSession: () => activeSession,
      getActiveTargetId: () => 'char_7',
      updateSession: vi.fn(async () => {})
    })

    expect(state.getLoadedSummaryIds()).toEqual(['summary_a', 'summary_b'])
  })
})
