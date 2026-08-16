/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, reactive, ref } from 'vue'
import { mount } from '@vue/test-utils'
import { useUiHelpers } from '../../../src/composables/app/useUiHelpers.ts'

function mountUseUiHelpers(options = {}) {
  let exposed
  const chatStore = {
    stopGeneration: vi.fn(),
    currentAbortController: { abort: vi.fn() },
    isTyping: true,
    ...options.chatStore
  }
  const collapsedGroups = options.collapsedGroups || reactive({})
  const TestComponent = defineComponent({
    setup() {
      exposed = useUiHelpers({
        charStore: options.charStore || { characters: [] },
        collapsedGroups,
        chatStore,
        streamingText: ref('流式内容'),
        showConfirmDialog: ref(false),
        confirmDialog: {},
        showChatTransferDialog: ref(false),
        chatTransferDialog: {},
        timerEventEmitter: new EventTarget(),
        workspaceRuntimeStore: options.workspaceRuntimeStore
      })
      return () => h('div')
    }
  })
  const wrapper = mount(TestComponent)
  return { wrapper, exposed, chatStore, collapsedGroups }
}

describe('useUiHelpers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('停止聊天时优先使用正式入口', () => {
    const stopGeneration = vi.fn()
    const { wrapper, exposed } = mountUseUiHelpers({
      chatStore: {
        stopGeneration,
        currentAbortController: { abort: vi.fn() },
        isTyping: true
      }
    })

    exposed.abortChat()

    expect(stopGeneration).toHaveBeenCalled()
    expect(exposed.formatChatText('你好')).toContain('你好')
    wrapper.unmount()
  })

  it('没有正式入口时会回退到旧停止方式并清空流式文本', () => {
    const abort = vi.fn()
    const { wrapper, exposed, chatStore } = mountUseUiHelpers({
      chatStore: {
        stopGeneration: undefined,
        currentAbortController: { abort },
        isTyping: true
      }
    })

    exposed.abortChat()

    expect(abort).toHaveBeenCalled()
    expect(chatStore.isTyping).toBe(false)
    wrapper.unmount()
  })

  it('存在运行态任务池时优先停止前台任务', () => {
    const stopGeneration = vi.fn()
    const stopForegroundChatTaskRun = vi.fn()
    const { wrapper, exposed } = mountUseUiHelpers({
      chatStore: {
        stopGeneration
      },
      workspaceRuntimeStore: {
        hasRunningChatTasks: true,
        stopForegroundChatTaskRun
      }
    })

    exposed.abortChat()

    expect(stopForegroundChatTaskRun).toHaveBeenCalled()
    expect(stopGeneration).toHaveBeenCalled()
    wrapper.unmount()
  })

  it('切换分组折叠时只把展开的分组写入本地存储，未展开的分组不落库', () => {
    localStorage.clear()
    const { wrapper, exposed, collapsedGroups } = mountUseUiHelpers()

    exposed.toggleGroupCollapse('role_group')
    expect(collapsedGroups.role_group).toBe(false)
    expect(JSON.parse(localStorage.getItem('langhuan_sidebar_expanded_contact_groups_v1:local'))).toEqual(['role_group'])

    exposed.toggleGroupCollapse('role_group')
    expect(collapsedGroups.role_group).toBeUndefined()
    expect(JSON.parse(localStorage.getItem('langhuan_sidebar_expanded_contact_groups_v1:local'))).toEqual([])

    wrapper.unmount()
  })

  it('同一响应式求值只遍历一次角色集合并缓存各分组稳定排序', () => {
    let reads = 0
    const characters = [
      { id: 'c3', name: '阿青', group_id: 'group_a', order_index: 2 },
      { id: 'c2', name: '星依', groupId: 'group_b', orderIndex: 1 },
      { id: 'c1', name: '林雪云', group: 'group_a', orderIndex: 1 },
      { id: 'c4', name: '未分组' }
    ]
    const charStore = {}
    Object.defineProperty(charStore, 'characters', {
      get() { reads += 1; return characters }
    })
    const { wrapper, exposed } = mountUseUiHelpers({ charStore })

    expect(exposed.getCharactersByGroup('group_a').map((item) => item.id)).toEqual(['c1', 'c3'])
    expect(exposed.getCharactersByGroup('group_b').map((item) => item.id)).toEqual(['c2'])
    expect(exposed.getCharactersByGroup('').map((item) => item.id)).toEqual(['c4'])
    const readsAfterFirstProjection = reads
    exposed.getCharactersByGroup('group_a')
    exposed.getCharactersByGroup('group_b')
    expect(reads).toBe(readsAfterFirstProjection)

    wrapper.unmount()
  })
})
