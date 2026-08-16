/**
 * @vitest-environment jsdom
 */
import { mount, flushPromises } from '@vue/test-utils'
import { describe, expect, it, beforeEach, vi } from 'vitest'

const mockChatStore = vi.hoisted(() => ({
  getActiveTargetId: vi.fn(),
  getActiveSessionId: vi.fn()
}))

const chatRepositoryMocks = vi.hoisted(() => ({
  fetchChatPromptLogs: vi.fn(),
  fetchChatPromptLogsBySessionId: vi.fn(),
  getChatStoreActiveSessionId: vi.fn((store) => store.getActiveSessionId?.() || ''),
  getChatStoreActiveTargetId: vi.fn((store) => store.getActiveTargetId?.() || ''),
  locateChatPromptLog: vi.fn(),
  locateChatPromptLogBySessionId: vi.fn(),
  locateChatPromptLogByLogId: vi.fn(),
  locateChatPromptLogBySessionLogId: vi.fn()
}))

vi.mock('../../../src/stores/chatStore.ts', () => ({
  useChatStore: () => mockChatStore
}))

vi.mock('../../../src/repositories/chatRepository.ts', () => chatRepositoryMocks)

import PromptLogPanel from '../../../src/components/app/chat/PromptLogPanel.vue'

function buildPromptLogPage(sessionId, page = 1) {
  return {
    sessionId,
    currentPage: page,
    pageSize: 30,
    totalEntries: 1,
    totalPages: 1,
    items: [{
      id: 'log_1',
      sessionId,
      pageIndex: page,
      entryIndex: 1,
      totalIndex: 1,
      totalCount: 1,
      kindIndex: 1,
      kindTotal: 1,
      messageKind: 'chat',
      assistantMessageId: 7,
      speakerName: '星依',
      targetId: 'char_xingyi',
      logKind: 'final_reply',
      finalPrompt: '最终提示词',
      promptBlocks: [{ role: 'system', title: '系统', content: '内容' }],
      createdAt: '2026-04-29T12:00:00.000Z'
    }]
  }
}

describe('PromptLogPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Element.prototype.scrollIntoView = vi.fn()
    mockChatStore.getActiveTargetId.mockReturnValue('char_xingyi')
    mockChatStore.getActiveSessionId.mockReturnValue('session_char_xingyi_custom')
    chatRepositoryMocks.locateChatPromptLogBySessionId.mockResolvedValue({ logId: 'log_1', page: 2 })
    chatRepositoryMocks.fetchChatPromptLogsBySessionId.mockResolvedValue(buildPromptLogPage('session_char_xingyi_custom', 2))
    chatRepositoryMocks.locateChatPromptLog.mockResolvedValue({ logId: 'legacy_log_1', page: 1 })
    chatRepositoryMocks.fetchChatPromptLogs.mockResolvedValue(buildPromptLogPage('char_xingyi', 1))
  })

  it('定位提示词日志时优先使用当前会话 id', async () => {
    mount(PromptLogPanel, {
      props: {
        open: true,
        focusMessageId: 7
      }
    })

    await flushPromises()

    expect(chatRepositoryMocks.locateChatPromptLogBySessionId).toHaveBeenCalledWith('session_char_xingyi_custom', 7, '')
    expect(chatRepositoryMocks.fetchChatPromptLogsBySessionId).toHaveBeenCalledWith('session_char_xingyi_custom', 2)
    expect(chatRepositoryMocks.locateChatPromptLog).not.toHaveBeenCalled()
    expect(chatRepositoryMocks.fetchChatPromptLogs).not.toHaveBeenCalled()
  })

  it('定位提示词日志时把命中日志滚到顶部', async () => {
    mount(PromptLogPanel, {
      props: {
        open: true,
        focusMessageId: 7
      },
      attachTo: document.body
    })

    await flushPromises()

    expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({
      behavior: 'smooth',
      block: 'start'
    })
  })

  it('没有会话 id 时才回退到旧目标 id', async () => {
    mockChatStore.getActiveSessionId.mockReturnValue('')

    mount(PromptLogPanel, {
      props: {
        open: true,
        focusMessageId: 7
      }
    })

    await flushPromises()

    expect(chatRepositoryMocks.locateChatPromptLog).toHaveBeenCalledWith('char_xingyi', 7, '')
    expect(chatRepositoryMocks.fetchChatPromptLogs).toHaveBeenCalledWith('char_xingyi', 1)
    expect(chatRepositoryMocks.locateChatPromptLogBySessionId).not.toHaveBeenCalled()
    expect(chatRepositoryMocks.fetchChatPromptLogsBySessionId).not.toHaveBeenCalled()
  })

  it('用提示词块展示完整提示词，并且不再渲染旧的分块结果标题', async () => {
    const wrapper = mount(PromptLogPanel, {
      props: {
        open: true
      }
    })

    await flushPromises()

    expect(wrapper.text()).toContain('完整提示词')
    expect(wrapper.text()).not.toContain('分块结果')
    expect(wrapper.text()).not.toContain('完整最终提示词')
    expect(wrapper.text()).toContain('SYSTEM')
    expect(wrapper.text()).toContain('系统')
    expect(wrapper.find('.prompt-log-block__content').text()).toContain('内容')
  })

  it('旧日志没有提示词块时回退显示完整提示词', async () => {
    chatRepositoryMocks.fetchChatPromptLogsBySessionId.mockResolvedValue({
      ...buildPromptLogPage('session_char_xingyi_custom', 1),
      items: [{
        ...buildPromptLogPage('session_char_xingyi_custom', 1).items[0],
        promptBlocks: [],
        finalPrompt: '旧日志完整提示词'
      }]
    })

    const wrapper = mount(PromptLogPanel, {
      props: {
        open: true
      }
    })

    await flushPromises()

    expect(wrapper.text()).toContain('最终提示词')
    expect(wrapper.text()).toContain('旧日志完整提示词')
  })

  it('同时显示动态总序号和对应消息类型楼层', async () => {
    chatRepositoryMocks.fetchChatPromptLogsBySessionId.mockResolvedValue({
      sessionId: 'session_char_xingyi_custom',
      currentPage: 1,
      pageSize: 30,
      totalEntries: 3,
      totalPages: 1,
      items: [
        {
          ...buildPromptLogPage('session_char_xingyi_custom', 1).items[0],
          id: 'log_debug',
          assistantMessageId: 13,
          speakerName: '角色地点安排',
          totalIndex: 3,
          totalCount: 3,
          kindIndex: 1,
          kindTotal: 1,
          messageKind: 'narration_debug'
        },
        {
          ...buildPromptLogPage('session_char_xingyi_custom', 1).items[0],
          id: 'log_narration',
          assistantMessageId: 12,
          speakerName: '旁白',
          totalIndex: 2,
          totalCount: 3,
          kindIndex: 1,
          kindTotal: 1,
          messageKind: 'narration'
        },
        {
          ...buildPromptLogPage('session_char_xingyi_custom', 1).items[0],
          id: 'log_role',
          assistantMessageId: 11,
          speakerName: '星依',
          totalIndex: 1,
          totalCount: 3,
          kindIndex: 1,
          kindTotal: 1,
          messageKind: 'chat'
        }
      ]
    })

    const wrapper = mount(PromptLogPanel, {
      props: {
        open: true
      }
    })

    await flushPromises()

    expect(wrapper.text()).toContain('总序号 3/3')
    expect(wrapper.text()).toContain('调试 1/1')
    expect(wrapper.text()).toContain('旁白 1/1')
    expect(wrapper.text()).toContain('角色 1/1')
    expect(wrapper.html()).not.toContain('<span>序号 1</span>')
  })

  it('总入口把同一消息的投影提示词收进原消息右上角按钮', async () => {
    const reply = {
      ...buildPromptLogPage('session_char_xingyi_custom', 1).items[0],
      id: 'log_reply',
      logKind: 'final_reply',
      finalPrompt: '回复提示词正文',
      promptBlocks: [{ role: 'system', title: '回复提示词块', content: '回复内容' }]
    }
    const projection = {
      ...reply,
      id: 'log_projection',
      logKind: 'message_projection',
      speakerName: '消息投影 Agent',
      finalPrompt: '投影提示词正文',
      promptBlocks: [{ role: 'system', title: '投影提示词块', content: '投影内容' }]
    }
    chatRepositoryMocks.fetchChatPromptLogsBySessionId.mockResolvedValue({
      sessionId: 'session_char_xingyi_custom',
      currentPage: 1,
      pageSize: 30,
      totalEntries: 2,
      totalPages: 1,
      items: [projection, reply]
    })

    const wrapper = mount(PromptLogPanel, {
      props: {
        open: true
      }
    })

    await flushPromises()

    expect(wrapper.findAll('.prompt-log-entry')).toHaveLength(1)
    expect(wrapper.text()).toContain('回复内容')
    expect(wrapper.text()).toContain('查看投影提示词')
    expect(wrapper.text()).not.toContain('投影内容')
  })

  it('从总入口点击按钮后切换到同一消息的投影提示词', async () => {
    const reply = {
      ...buildPromptLogPage('session_char_xingyi_custom', 1).items[0],
      id: 'log_reply',
      logKind: 'final_reply',
      hasProjection: true,
      finalPrompt: '回复提示词正文',
      promptBlocks: [{ role: 'system', title: '回复提示词块', content: '回复内容' }]
    }
    const projection = {
      ...reply,
      id: 'log_projection',
      logKind: 'message_projection',
      hasReply: true,
      speakerName: '消息投影 Agent',
      finalPrompt: '投影提示词正文',
      promptBlocks: [{ role: 'system', title: '投影提示词块', content: '投影内容' }]
    }
    chatRepositoryMocks.fetchChatPromptLogsBySessionId.mockResolvedValueOnce({
      sessionId: 'session_char_xingyi_custom',
      currentPage: 1,
      pageSize: 30,
      totalEntries: 2,
      totalPages: 1,
      items: [reply]
    }).mockResolvedValue({
      sessionId: 'session_char_xingyi_custom',
      currentPage: 2,
      pageSize: 30,
      totalEntries: 2,
      totalPages: 2,
      items: [projection]
    })
    chatRepositoryMocks.locateChatPromptLogBySessionId.mockImplementation((_sessionId, _messageId, kind) => ({
      logId: kind === 'message_projection' ? 'log_projection' : 'log_reply',
      page: kind === 'message_projection' ? 2 : 1,
      entry: kind === 'message_projection' ? projection : reply,
      hasReply: true,
      hasProjection: true
    }))

    const wrapper = mount(PromptLogPanel, {
      props: {
        open: true
      },
      attachTo: document.body
    })

    await flushPromises()
    await wrapper.get('.prompt-log-entry__toggle').trigger('click')
    await flushPromises()

    expect(chatRepositoryMocks.locateChatPromptLogBySessionId).toHaveBeenCalledWith('session_char_xingyi_custom', 7, 'message_projection')
    expect(wrapper.findAll('.prompt-log-entry')).toHaveLength(1)
    expect(wrapper.text()).toContain('投影内容')
    expect(wrapper.text()).toContain('返回回复提示词')
    expect(wrapper.text()).not.toContain('回复内容')
  })

  it('定位消息没有日志时清空旧列表并显示明确提示', async () => {
    chatRepositoryMocks.locateChatPromptLogBySessionId.mockRejectedValueOnce(new Error('未找到对应的提示词日志'))

    const wrapper = mount(PromptLogPanel, {
      props: {
        open: true,
        focusMessageId: 404
      }
    })

    await flushPromises()

    expect(wrapper.text()).toContain('未找到对应的提示词日志')
    expect(wrapper.text()).not.toContain('完整提示词')
    expect(chatRepositoryMocks.fetchChatPromptLogsBySessionId).not.toHaveBeenCalled()
  })
})
