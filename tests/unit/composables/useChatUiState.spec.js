/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { useChatUiState } from '../../../src/composables/app/useChatUiState.ts'

describe('useChatUiState', () => {
  it('清空当前聊天时优先使用聊天分组入口里的当前目标', async () => {
    const chatStore = {
      current: {
        currentChatTarget: ref('char_5'),
        getActiveTargetId: vi.fn(() => 'char_5')
      },
      currentChatTarget: 'legacy_target',
      startNewChat: vi.fn(async () => {}),
      loadChatArchives: vi.fn(async () => {})
    }
    const toast = vi.fn()

    const state = useChatUiState({
      charStore: { characters: [] },
      chatStore,
      toast
    })

    await state.clearCurrentChat()

    expect(chatStore.current.getActiveTargetId).toHaveBeenCalled()
    expect(chatStore.startNewChat).toHaveBeenCalledWith('char_5')
    expect(chatStore.loadChatArchives).toHaveBeenCalled()
    expect(toast).not.toHaveBeenCalled()
  })

  it('显式选择同一角色时不会重复塞入发送计划', () => {
    const state = useChatUiState({
      charStore: { characters: [] },
      chatStore: {
        current: { currentChatTarget: ref('group_1') },
        clearChat: vi.fn()
      },
      toast: vi.fn()
    })

    state.addMentionChar('char_xingyi')
    state.addMentionChar('char_xingyi')

    expect(state.mentionSelectedChars.value).toEqual(['char_xingyi'])
  })
})
