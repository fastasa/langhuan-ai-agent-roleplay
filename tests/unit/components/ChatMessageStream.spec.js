/**
 * @vitest-environment jsdom
 */
import { mount } from '@vue/test-utils'
import { nextTick, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import ChatMessageStream from '../../../src/components/app/chat/ChatMessageStream.vue'
import { clearRecallTrace, startRecallActivity, updateRecallActivityPublicMilestones } from '../../../src/app/recallTraceState.ts'
import { renderChatMarkdownToHtml } from '../../../src/utils/chatMarkdown.ts'
import {
  beginTidiaoDirectorStreamRound,
  updateTidiaoDirectorStreamRound,
  clearTidiaoDirectorStreamRound,
  setTidiaoDirectorStreamRoundLinks
} from '../../../src/app/tidiaoDirectorStreamState.ts'
import { buildTidiaoDirectorStream } from '../../../src/app/tidiaoDirectorStream.ts'
import { useStickToBottom } from '../../../src/composables/useStickToBottom.ts'
// ChatMessageStream 内部调用 useI18n()，孤立跑本文件（不靠其它 spec 文件的模块级副作用）必须真装 i18n 插件
// （locale 钉 zh 让中文断言稳定），与 TidiaoDirectorStreamBand.spec.js/ChatInputBar.spec.js 同一先例。
import { i18n } from '../../../src/i18n'
import { OPEN_CHAT_IMAGE_AVATAR_ASSIGNMENT_EVENT } from '../../../src/app/chatImageAvatarAssignment.ts'

i18n.global.locale.value = 'zh'

function mountStream(overrides = {}) {
  // 智能跟底滚动（2026-07-12）：给一份真实 useStickToBottom() 实例，元素来源与生产环境同构——
  // 由 setMessagesAreaRef 回调把组件挂载的 .chat-messages 真实元素喂给同一个 elRef，
  // 而不是纯假 stub（假 stub 会让「刷新后首次装载消息时定位到最新消息」这类断言真实 scrollTop 的用例失真）。
  const messagesAreaRef = ref(null)
  const chatStickToBottom = useStickToBottom(messagesAreaRef)
  return mount(ChatMessageStream, {
    global: { plugins: [i18n] },
    props: {
      currentTarget: 'char_1',
      isTyping: false,
      currentMessages: [],
      isBootLoading: false,
      currentAlias: null,
      userProfile: { name: '用户', emoji: '我', avatarPath: '' },
      currentChatTitle: '惊雨',
      editingMessageIndex: -1,
      editingMessageContent: '',
      regeneratingMessageIndex: -1,
      formatChatText: (text) => text,
      getCharAvatar: () => '',
      getCharEmoji: () => '惊',
      currentCharacterAvatar: '',
      currentCharacter: { id: 'char_1', name: '惊雨', emoji: '惊' },
      streamingText: '',
      streamingSpeakerName: '',
      previewSpeakerName: '',
      streamingTargetId: '',
      setMessagesAreaRef: (el) => { messagesAreaRef.value = el instanceof HTMLElement ? el : null },
      chatStickToBottom,
      getDisplayedMessageContent: (index) => overrides.currentMessages?.[index]?.content || '',
      ...overrides
    }
  })
}

describe('ChatMessageStream', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1024 })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 768 })
    clearRecallTrace()
    clearTidiaoDirectorStreamRound()
  })

  // 顶部标题式召回入口（.recall-activity-inline-entry）已整体移除：历史/流式/重生成态均不再渲染该入口。
  // 召回面板入口已经从消息流中移除。

  it('空工作区显示顶部提调坞和新建角色入口，并接回正式创建事件', async () => {
    const wrapper = mountStream({ currentTarget: '', currentCharacter: null })

    const dockBar = wrapper.get('.tds-dock__bar')
    expect(dockBar.exists()).toBe(true)
    await dockBar.trigger('click')
    expect(wrapper.get('.tds-dock__empty').text()).toBe('还没有提调记录')

    expect(wrapper.find('.chat-empty-start__text').text()).toBe('请选择一个角色开始聊天')
    expect(wrapper.get('.chat-empty-start__action').text()).toBe('新建角色')
    await wrapper.get('.chat-empty-start__action').trigger('click')
    expect(wrapper.emitted('create-first-character')).toHaveLength(1)
  })

  it('动作输入及其描写显示同组特殊样式，并明确标出私密或公开', () => {
    const wrapper = mountStream({
      currentMessages: [
        {
          id: 1, role: 'user', content: '观察敌人',
          messageSourceKind: 'focused_action', focusedActionGroupId: 'action_1', focusedActionVisibility: 'private'
        },
        {
          id: 2, role: 'assistant', name: '旁白', memberName: '旁白', messageKind: 'narration', content: '敌人眉骨有一道旧伤。',
          messageSourceKind: 'focused_action', focusedActionGroupId: 'action_1', focusedActionVisibility: 'private'
        },
        {
          id: 3, role: 'user', content: '推开门',
          messageSourceKind: 'focused_action', focusedActionGroupId: 'action_2', focusedActionVisibility: 'public'
        }
      ]
    })

    expect(wrapper.findAll('.chat-message--focused-action')).toHaveLength(3)
    expect(wrapper.findAll('.chat-message--focused-action-private')).toHaveLength(2)
    expect(wrapper.text()).toContain('仅你与提调可见')
    expect(wrapper.text()).toContain('角色可感知')
  })

  it('点击桌面聊天用户头像打开用户资料编辑', async () => {
    const wrapper = mountStream({
      currentMessages: [{
        id: 11,
        role: 'user',
        name: '用户',
        content: '看看我的资料。',
        time: '12:00'
      }]
    })

    await wrapper.find('.chat-avatar').trigger('click')

    expect(wrapper.emitted('open-user-editor')).toHaveLength(1)
  })

  it('点击桌面聊天角色头像打开角色资料编辑', async () => {
    const wrapper = mountStream({
      currentMessages: [{
        id: 12,
        role: 'assistant',
        name: '惊雨',
        content: '我在这里。',
        time: '12:01'
      }]
    })

    await wrapper.find('.chat-avatar').trigger('click')

    expect(wrapper.emitted('open-char-settings')?.[0]).toEqual(['惊雨'])
  })

  it('角色与用户消息复用同一个头像形状和尺寸原语', () => {
    const wrapper = mountStream({
      currentMessages: [
        { id: 12, role: 'assistant', name: '惊雨', content: '我在这里。', time: '12:01' },
        { id: 13, role: 'user', name: '用户', content: '看见你了。', time: '12:02' }
      ],
      getCharAvatar: () => '/avatars/character.png',
      userProfile: { name: '用户', emoji: '我', avatarPath: '/avatars/user.png' }
    })

    const avatars = wrapper.findAll('.chat-avatar')
    expect(avatars).toHaveLength(2)
    expect(avatars[0].classes()).not.toContain('chat-avatar--character')
    expect(avatars[1].classes()).not.toContain('chat-avatar--character')
    expect(avatars[0].find('img').attributes('style')).toBeUndefined()
    expect(avatars[1].find('img').attributes('style')).toBeUndefined()
  })

  describe('图片附件多图渲染（输入框图片上传计划批4）', () => {
    it('单图渲染一张缩略图，点击上抛 open-fullscreen-image', async () => {
      const wrapper = mountStream({
        currentMessages: [{
          id: 13,
          role: 'user',
          name: '用户',
          content: '看看这张图',
          time: '12:02',
          // attachmentsJson 是真实生产形状（服务端 toCamel 后已解析的驼峰键，见 chatAttachments.ts::readMessageAttachments）。
          attachmentsJson: [{ id: 'a1', kind: 'image', url: '/chat-images/a1.png', mime: 'image/png' }]
        }]
      })

      const thumbs = wrapper.findAll('img[alt]').filter((img) => img.attributes('src') === '/chat-images/a1.png')
      expect(thumbs).toHaveLength(1)
      expect(wrapper.find('.chat-message-images').classes()).toContain('chat-message-images--single')

      await thumbs[0].element.closest('button').click()
      expect(wrapper.emitted('open-fullscreen-image')?.[0]).toEqual(['/chat-images/a1.png'])
    })

    it('图片上的相机按钮发出统一设头像请求', async () => {
      const handler = vi.fn()
      window.addEventListener(OPEN_CHAT_IMAGE_AVATAR_ASSIGNMENT_EVENT, handler)
      const wrapper = mountStream({
        currentMessages: [{
          id: 131,
          role: 'assistant',
          name: '星依',
          content: '画好啦',
          attachmentsJson: [{ id: 'a1', kind: 'image', url: '/chat-images/a1.png', mime: 'image/png', originalName: '头像.png' }]
        }]
      })

      await wrapper.get('.chat-message-image-avatar').trigger('click')

      expect(handler).toHaveBeenCalledTimes(1)
      expect(handler.mock.calls[0][0].detail).toEqual({ imageUrl: '/chat-images/a1.png', originalName: '头像.png' })
      window.removeEventListener(OPEN_CHAT_IMAGE_AVATAR_ASSIGNMENT_EVENT, handler)
    })

    it('多图渲染多张缩略图，各自携带正确 url', () => {
      const wrapper = mountStream({
        currentMessages: [{
          id: 14,
          role: 'user',
          name: '用户',
          content: '两张图',
          time: '12:03',
          attachmentsJson: [
            { id: 'a1', kind: 'image', url: '/chat-images/a1.png', mime: 'image/png' },
            { id: 'a2', kind: 'image', url: '/chat-images/a2.png', mime: 'image/png' }
          ]
        }]
      })

      const urls = wrapper.findAll('img').map((img) => img.attributes('src')).filter((src) => src?.startsWith('/chat-images/'))
      expect(urls).toEqual(['/chat-images/a1.png', '/chat-images/a2.png'])
      expect(wrapper.find('.chat-message-images').classes()).not.toContain('chat-message-images--single')
    })

    it('本地乐观回显字段名 attachments（未走 toCamel）同样能渲染', () => {
      const wrapper = mountStream({
        currentMessages: [{
          id: 15,
          role: 'user',
          name: '用户',
          content: '刚发的图',
          time: '12:04',
          attachments: [{ id: 'a1', kind: 'image', url: '/chat-images/a1.png', mime: 'image/png' }]
        }]
      })

      expect(wrapper.findAll('img').some((img) => img.attributes('src') === '/chat-images/a1.png')).toBe(true)
    })

    it('无附件消息不渲染多图区块（旧 msg.image 单图分支保留不受影响）', () => {
      const wrapper = mountStream({
        currentMessages: [{ id: 16, role: 'user', name: '用户', content: '没有图', time: '12:05' }]
      })

      expect(wrapper.findAll('img').filter((img) => img.attributes('src')?.startsWith('/chat-images/'))).toHaveLength(0)
    })
  })

  it('删除顶部标题式召回入口后，历史助手消息不再渲染 inline 入口但保留思考块', () => {
    const wrapper = mountStream({
      currentMessages: [{
        id: 42,
        role: 'assistant',
        name: '惊雨',
        content: '<think>先判断召回是否有用。</think>正式回答',
        time: '12:00'
      }]
    })

    expect(wrapper.find('.recall-activity-inline-entry').exists()).toBe(false)
    expect(wrapper.find('.chat-think-list').exists()).toBe(true)
  })

  it('删除顶部标题式召回入口后，流式回复不再渲染 inline 入口', () => {
    const wrapper = mountStream({
      isTyping: true,
      currentMessages: [],
      streamingText: '<think>正在读取召回事件。</think>',
      streamingSpeakerName: '惊雨',
      streamingTargetId: 'char_1'
    })

    expect(wrapper.find('.recall-activity-inline-entry').exists()).toBe(false)
  })

  it('正式消息已显示后，不因残留 typing 状态补出第二条全局生成气泡', () => {
    const wrapper = mountStream({
      isTyping: true,
      currentMessages: [{
        id: 52,
        role: 'assistant',
        name: '惊雨',
        content: '正式回复',
        time: '12:09'
      }],
      streamingSpeakerName: '',
      streamingText: '正式回复'
    })

    expect(wrapper.findAll('.chat-message')).toHaveLength(1)
    expect(wrapper.find('.chat-typing').exists()).toBe(false)
    expect(wrapper.text()).toContain('正式回复')
  })

  it('快速群聊在正文首字返回前显示即将回复角色的头像和三点占位', () => {
    const wrapper = mountStream({
      currentTarget: 'group_1',
      replyPipelineMode: 'fast_reply',
      isTyping: true,
      previewSpeakerName: '小樱',
      streamingTargetId: 'group_1',
      getCharAvatar: (name) => name === '小樱' ? '/avatars/sakura.png' : '',
      getCharEmoji: () => '樱'
    })

    const row = wrapper.find('.chat-message')
    expect(row.exists()).toBe(true)
    expect(row.find('.chat-sender').text()).toBe('小樱')
    expect(row.find('.chat-avatar img').attributes('src')).toBe('/avatars/sakura.png')
    expect(row.findAll('.chat-typing span')).toHaveLength(3)
  })

  it('点击顶部入口才加载更早消息', async () => {
    const loadOlderMessages = vi.fn().mockResolvedValue(true)
    const wrapper = mountStream({
      hasOlderMessages: true,
      loadOlderMessages,
      currentMessages: [{
        id: 81,
        role: 'user',
        name: '用户',
        content: '近一点',
        time: '12:00'
      }]
    })
    const messageArea = wrapper.find('.chat-messages').element
    Object.defineProperty(messageArea, 'scrollHeight', { configurable: true, value: 1000 })
    messageArea.scrollTop = 120

    await wrapper.find('.chat-older-sentinel__button').trigger('click')

    expect(loadOlderMessages).toHaveBeenCalledWith(81)
    expect(messageArea.scrollTop).toBe(120)
  })

  it('滚到顶部不自动加载更早消息', async () => {
    const loadOlderMessages = vi.fn().mockResolvedValue(true)
    const wrapper = mountStream({
      hasOlderMessages: true,
      loadOlderMessages,
      currentMessages: [{
        id: 81,
        role: 'user',
        name: '用户',
        content: '近一点',
        time: '12:00'
      }]
    })

    await wrapper.find('.chat-messages').trigger('scroll')

    expect(loadOlderMessages).not.toHaveBeenCalled()
  })

  it('刷新后首次装载消息时定位到最新消息', async () => {
    const wrapper = mountStream({ currentMessages: [] })
    const messageArea = wrapper.find('.chat-messages').element
    Object.defineProperty(messageArea, 'scrollHeight', { configurable: true, value: 1200 })
    Object.defineProperty(messageArea, 'clientHeight', { configurable: true, value: 400 })
    messageArea.scrollTop = 0

    await wrapper.setProps({
      currentMessages: [{
        id: 91,
        role: 'assistant',
        name: '惊雨',
        content: '最新回复',
        time: '12:10'
      }]
    })
    await nextTick()
    await nextTick()

    expect(messageArea.scrollTop).toBe(1200)
  })

  it('多人会话下一位角色召回中时显示本地 loading 消息的正在召回动效', async () => {
    startRecallActivity({
      id: 'recall_run_next_speaker',
      characterName: '惊雨',
      startedAt: '2026-05-06T10:00:00.000Z'
    })
    updateRecallActivityPublicMilestones('recall_run_next_speaker', [
      {
        id: 'reading',
        title: '我先确认能用的线索',
        text: '我正在把这次会用到的参考筛出来。',
        status: 'running'
      }
    ])
    const wrapper = mountStream({
      currentMessages: [{
        role: 'assistant',
        name: '惊雨',
        content: '',
        time: '12:00',
        _localStreamingKey: 'group-recall-c2',
        _recallLoading: true,
        _recallActivityRunId: 'recall_run_next_speaker'
      }]
    })

    // 顶部标题式召回入口已移除：loading 消息只保留「正在召回」动效，不再是可点击入口
    expect(wrapper.findComponent({ name: 'ChatProcessMotion' }).exists()).toBe(true)
    expect(wrapper.find('.recall-activity-inline-entry').exists()).toBe(false)
  })

  it('逐条显示自动写入后隐藏状态', () => {
    const wrapper = mountStream({
      currentMessages: [{
        id: 44,
        role: 'assistant',
        name: '惊雨',
        content: '已经整理进轨迹的旧消息',
        time: '12:02',
        autoWriteHidden: true,
        autoWriteBatchId: 'batch_1'
      }]
    })

    const marker = wrapper.find('.chat-hidden-marker')

    expect(marker.exists()).toBe(true)
    expect(marker.text()).toContain('已隐藏')
    expect(wrapper.text()).toContain('12:02')
  })

  it('人格模型会在消息底部显示投影提示灯并用绿色按钮切换投影正文', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        sessionId: 'session_personality',
        projections: [
          {
            id: 'projection_62',
            messageId: 62,
            status: 'failed',
            failureStage: 'parse_output',
            failureReason: '模型输出无法解析'
          },
          {
            id: 'projection_63',
            messageId: 63,
            status: 'complete',
            objectiveFact: '用户向惊雨确认了门外声响的来源。',
            speakerName: '用户',
            audienceNames: ['惊雨']
          }
        ],
        visibility: [],
        attempts: [],
        traces: []
      })
    }))

    const wrapper = mountStream({
      activeSessionId: 'session_personality',
      replyPipelineMode: 'personality_model',
      currentMessages: [
        {
          id: 61,
          role: 'user',
          name: '用户',
          content: '第一条还没有投影。',
          time: '12:00'
        },
        {
          id: 62,
          role: 'assistant',
          name: '惊雨',
          content: '这条投影失败。',
          time: '12:01'
        },
        {
          id: 63,
          role: 'user',
          name: '用户',
          content: '我问门外是谁。',
          time: '12:02'
        }
      ]
    })

    await Promise.resolve()
    await Promise.resolve()
    await new Promise((resolve) => setTimeout(resolve, 0))
    await nextTick()

    const lamps = wrapper.findAll('.msg-action-btn--projection-lamp')
    expect(lamps).toHaveLength(3)
    expect(lamps[0].classes()).toContain('msg-action-btn--projection-pending')
    // 待投影（pending）状态现可点击手动触发投影（runChatMessageProjectionBySessionId），不再禁用
    expect(lamps[0].attributes('disabled')).toBeUndefined()
    expect(lamps[1].classes()).toContain('msg-action-btn--projection-failed')
    expect(lamps[1].attributes('title')).toContain('投影失败')
    // failed 不再永久禁用：点击可重试重投影，避免用户点了没反应（2026-07-07）
    expect(lamps[1].attributes('disabled')).toBeUndefined()
    expect(lamps[2].classes()).toContain('msg-action-btn--projection-success')
    expect(lamps[2].attributes('disabled')).toBeUndefined()

    await lamps[2].trigger('click')

    const rows = wrapper.findAll('.chat-message')
    expect(rows[2].find('.chat-text').text()).toContain('用户向惊雨确认了门外声响的来源。')
    expect(rows[2].find('.chat-text').text()).not.toContain('我问门外是谁。')
    expect(lamps[2].attributes('aria-pressed')).toBe('true')
  })

  it('普通召回会话也会在消息底部显示投影提示灯', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        sessionId: 'session_normal_recall',
        projections: [
          {
            id: 'projection_72',
            messageId: 72,
            status: 'complete',
            objectiveFact: '用户让惊雨确认普通召回是否读取投影。',
            speakerName: '用户',
            audienceNames: ['惊雨']
          }
        ],
        visibility: [],
        attempts: [],
        traces: []
      })
    }))

    const wrapper = mountStream({
      activeSessionId: 'session_normal_recall',
      replyPipelineMode: 'normal_recall',
      currentMessages: [
        {
          id: 71,
          role: 'user',
          name: '用户',
          content: '这条还没生成投影。',
          time: '12:00'
        },
        {
          id: 72,
          role: 'assistant',
          name: '惊雨',
          content: '普通召回也应该能看投影。',
          time: '12:01'
        }
      ]
    })

    await Promise.resolve()
    await Promise.resolve()
    await new Promise((resolve) => setTimeout(resolve, 0))
    await nextTick()

    const lamps = wrapper.findAll('.msg-action-btn--projection-lamp')
    expect(lamps).toHaveLength(2)
    expect(lamps[0].classes()).toContain('msg-action-btn--projection-pending')
    expect(lamps[0].attributes('disabled')).toBeUndefined()
    expect(lamps[1].classes()).toContain('msg-action-btn--projection-success')

    await lamps[1].trigger('click')

    const rows = wrapper.findAll('.chat-message')
    expect(rows[1].find('.chat-text').text()).toContain('用户让惊雨确认普通召回是否读取投影。')
    expect(rows[1].find('.chat-text').text()).not.toContain('普通召回也应该能看投影。')
  })

  it('消息操作区最右侧显示提示词可见性眼睛按钮', async () => {
    const wrapper = mountStream({
      currentMessages: [{
        id: 45,
        role: 'assistant',
        name: '惊雨',
        content: '需要保留判断的消息',
        time: '12:03',
        autoWriteHidden: true
      }]
    })

    const buttons = wrapper.findAll('.msg-action-btn')
    const lastButton = buttons[buttons.length - 1]

    expect(lastButton.attributes('title')).toBe('恢复进入角色提示词')
    expect(lastButton.attributes('aria-pressed')).toBe('true')
    expect(lastButton.attributes('aria-label')).toBe('恢复进入角色提示词')
    expect(lastButton.classes()).toContain('is-hidden-from-prompt')
    await lastButton.trigger('click')
    expect(wrapper.emitted('toggle-message-prompt-visibility')?.[0]).toEqual([0])
  })

  it('选中文本后在鼠标松开点右下角显示记入笔记菜单并保留选区', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1200 })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 })
    const wrapper = mountStream({
      currentMessages: [{
        id: 46,
        role: 'user',
        name: '惊雨',
        content: '把这段话记下来。',
        time: '12:04'
      }]
    })
    const bubble = wrapper.find('.chat-bubble')
    const textNode = wrapper.find('.chat-text').element.firstChild
    const removeAllRanges = vi.fn()
    vi.spyOn(window, 'getSelection').mockReturnValue({
      toString: () => '这段话',
      rangeCount: 1,
      anchorNode: textNode,
      focusNode: textNode,
      removeAllRanges
    })

    await bubble.trigger('mouseup', { clientX: 300, clientY: 200 })
    await wrapper.vm.$nextTick()

    const menu = wrapper.find('.message-note-selection-menu')
    expect(menu.exists()).toBe(true)
    expect(menu.findAll('button').map((button) => button.text())).toEqual(['记入笔记', '复制'])
    expect(menu.findAll('.message-note-selection-menu__icon')).toHaveLength(2)
    expect(menu.attributes('style')).toContain('left: 310px')
    expect(menu.attributes('style')).toContain('top: 210px')
    expect(removeAllRanges).not.toHaveBeenCalled()

    await menu.find('button').trigger('click')

    expect(removeAllRanges).toHaveBeenCalledTimes(1)
    expect(wrapper.emitted('add-message-note')?.[0]?.[0]).toMatchObject({
      messageId: 46,
      sourceMode: 'selection',
      sourceText: '这段话'
    })
  })

  it('选区菜单打开后单击原选中文本只关闭菜单，不把菜单挪到点击点', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1200 })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 })
    const wrapper = mountStream({
      currentMessages: [{
        id: 50,
        role: 'user',
        name: '惊雨',
        content: '把这段话记下来。又点了一下。',
        time: '12:04'
      }]
    })
    const bubble = wrapper.find('.chat-bubble')
    const textNode = wrapper.find('.chat-text').element.firstChild
    vi.spyOn(window, 'getSelection').mockReturnValue({
      toString: () => '这段话',
      rangeCount: 1,
      anchorNode: textNode,
      focusNode: textNode,
      removeAllRanges: vi.fn()
    })

    await bubble.trigger('mouseup', { clientX: 300, clientY: 200 })
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.message-note-selection-menu').exists()).toBe(true)

    await bubble.trigger('mousedown', { clientX: 330, clientY: 220 })
    await bubble.trigger('mouseup', { clientX: 330, clientY: 220 })
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.message-note-selection-menu').exists()).toBe(false)
  })

  it('选区菜单打开后点击聊天区空白会关闭，点击菜单内部不会误关', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1200 })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 })
    const wrapper = mountStream({
      currentMessages: [{
        id: 51,
        role: 'user',
        name: '惊雨',
        content: '点空白应该收起菜单。',
        time: '12:04'
      }]
    })
    const bubble = wrapper.find('.chat-bubble')
    const textNode = wrapper.find('.chat-text').element.firstChild
    vi.spyOn(window, 'getSelection').mockReturnValue({
      toString: () => '空白',
      rangeCount: 1,
      anchorNode: textNode,
      focusNode: textNode,
      removeAllRanges: vi.fn()
    })

    await bubble.trigger('mouseup', { clientX: 300, clientY: 200 })
    await wrapper.vm.$nextTick()
    const menuButton = wrapper.find('.message-note-selection-menu button')
    menuButton.element.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.message-note-selection-menu').exists()).toBe(true)

    document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.message-note-selection-menu').exists()).toBe(false)
  })

  it('选区笔记菜单靠近视口边缘时向左上避让', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 360 })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 240 })
    const wrapper = mountStream({
      currentMessages: [{
        id: 47,
        role: 'user',
        name: '惊雨',
        content: '边缘处的选中文本。',
        time: '12:05'
      }]
    })
    const bubble = wrapper.find('.chat-bubble')
    const textNode = wrapper.find('.chat-text').element.firstChild
    vi.spyOn(window, 'getSelection').mockReturnValue({
      toString: () => '边缘处',
      rangeCount: 1,
      anchorNode: textNode,
      focusNode: textNode,
      removeAllRanges: vi.fn()
    })

    await bubble.trigger('mouseup', { clientX: 350, clientY: 230 })
    await wrapper.vm.$nextTick()

    const menuStyle = wrapper.find('.message-note-selection-menu').attributes('style')
    expect(menuStyle).toContain('left: 208px')
    expect(menuStyle).toContain('top: 152px')
  })

  it('选区菜单的复制动作只复制选中文本', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1200 })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 })
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText }
    })
    const wrapper = mountStream({
      currentMessages: [{
        id: 48,
        role: 'user',
        name: '惊雨',
        content: '只复制中间这一句。',
        time: '12:06'
      }]
    })
    const bubble = wrapper.find('.chat-bubble')
    const textNode = wrapper.find('.chat-text').element.firstChild
    const removeAllRanges = vi.fn()
    vi.spyOn(window, 'getSelection').mockReturnValue({
      toString: () => '中间这一句',
      rangeCount: 1,
      anchorNode: textNode,
      focusNode: textNode,
      removeAllRanges
    })

    await bubble.trigger('mouseup', { clientX: 300, clientY: 200 })
    const buttons = wrapper.findAll('.message-note-selection-menu button')
    await buttons[1].trigger('click')
    await Promise.resolve()

    expect(writeText).toHaveBeenCalledWith('中间这一句')
    expect(removeAllRanges).toHaveBeenCalledTimes(1)
    expect(wrapper.emitted('add-message-note')).toBeUndefined()
  })

  it('消息底部不显示已移出的召回与编排按钮', () => {
    const wrapper = mountStream({
      currentMessages: [{
        id: 49,
        role: 'assistant',
        name: '惊雨',
        content: '需要显示底部操作。',
        time: '12:07'
      }]
    })

    const titles = wrapper.findAll('.msg-action-title').map((item) => item.text())

    expect(titles).toEqual(['笔记', '复制', '编辑', '删除', '提示词', '重试', '隐藏'])
    expect(titles).not.toContain('召回')
    expect(titles).not.toContain('编排')
    expect(wrapper.findAll('.msg-action-icon')).toHaveLength(7)
    expect(wrapper.findAll('.msg-action-btn:has(.msg-action-icon) > svg')).toHaveLength(0)
    expect(wrapper.find('.msg-action-btn--prompt-visibility').exists()).toBe(true)
  })

  it('旧角色开关不会重新启用已经移出的消息操作', () => {
    const wrapper = mountStream({
      currentMessages: [{
        id: 49,
        role: 'assistant',
        name: '惊雨',
        content: '需要显示底部操作。',
        time: '12:07'
      }]
    })

    const titles = wrapper.findAll('.msg-action-title').map((item) => item.text())

    expect(titles).toEqual(['笔记', '复制', '编辑', '删除', '提示词', '重试', '隐藏'])
    expect(wrapper.find('[data-recall-message-id]').exists()).toBe(false)
  })

  it('用户消息也走聊天 Markdown 和美化渲染', () => {
    const wrapper = mountStream({
      formatChatText: renderChatMarkdownToHtml,
      currentMessages: [{
        id: 54,
        role: 'user',
        name: '用户',
        content: '*松开怀抱* [重点]',
        time: '12:08'
      }]
    })

    const row = wrapper.find('.chat-message.self')
    expect(row.exists()).toBe(true)
    expect(row.find('.chat-style-segment.action').text()).toBe('松开怀抱')
    expect(row.find('.chat-style-segment.bracket-square').text()).toBe('重点')
    expect(row.find('.chat-text').html()).not.toContain('*松开怀抱*')
  })

  it('按角色消息和旁白消息分别显示当前楼层与总数', () => {
    const wrapper = mountStream({
      currentMessages: [
        {
          id: 140,
          role: 'user',
          name: '用户',
          content: '先问一句。',
          time: '12:00'
        },
        {
          id: 141,
          role: 'assistant',
          name: '惊雨',
          content: '第一条角色回复。',
          time: '12:01'
        },
        {
          id: 142,
          role: 'assistant',
          messageKind: 'narration',
          name: '旁白',
          content: '第一条旁白。',
          time: '12:02'
        },
        {
          id: 143,
          role: 'assistant',
          messageKind: 'narration_debug',
          name: '旁白调试',
          content: '【调试】是',
          time: '12:03'
        },
        {
          id: 144,
          role: 'assistant',
          name: '惊雨',
          content: '第二条角色回复。',
          time: '12:04'
        }
      ]
    })

    const labels = wrapper.findAll('.chat-floor-label').map((item) => item.text())
    expect(labels).toEqual(['角色 1/2', '旁白 1/1', '角色 2/2'])
  })

  it('用独立文学排版显示旁白消息但不显示思考和召回入口', () => {
    const wrapper = mountStream({
      currentMessages: [{
        id: 45,
        role: 'assistant',
        messageKind: 'narration',
        name: '旁白',
        content: '<think>内部规划</think>雨声贴着窗沿滑下，门外的脚步声忽然停在了廊灯之外。',
        time: '12:03'
      }]
    })

    const row = wrapper.find('.chat-message--narration')
    expect(row.exists()).toBe(true)
    expect(row.find('.chat-avatar').text()).toContain('旁')
    expect(row.find('.chat-sender').text()).toContain('旁白')
    expect(row.find('.chat-text').text()).toContain('门外的脚步声')
    expect(row.text()).not.toContain('内部规划')
    expect(row.find('.chat-think-list').exists()).toBe(false)
    expect(row.find('[data-prompt-message-id="45"]').exists()).toBe(true)
    expect(row.find('[data-recall-message-id="45"]').exists()).toBe(false)
  })

  it('自定义旁白只保留单一按提示词重试入口', () => {
    const wrapper = mountStream({
      currentMessages: [{
        id: 48,
        role: 'assistant',
        messageKind: 'narration',
        name: '旁白',
        narrationProfileId: 'custom_lamp',
        narrationProfileKind: 'custom',
        content: '窗边的灯影轻轻晃了一下。',
        time: '12:06'
      }]
    })

    const row = wrapper.find('.chat-message--narration')
    const buttons = row.findAll('.msg-action-btn')
    const titles = buttons.map((button) => button.attributes('title'))

    expect(titles).not.toContain('重试召回')
    expect(titles).toContain('按提示词重试')
  })

  it('重新生成旁白消息时使用三体加载动画', () => {
    const wrapper = mountStream({
      isTyping: true,
      regeneratingMessageIndex: 0,
      currentMessages: [{
        id: 47,
        role: 'assistant',
        messageKind: 'narration',
        name: '旁白',
        content: '旧旁白',
        time: '12:05'
      }]
    })

    const row = wrapper.find('.chat-message--narration')
    expect(row.find('.chat-process-motion').exists()).toBe(true)
    expect(row.find('.three-body').exists()).toBe(true)
    expect(row.findComponent({ name: 'ChatProcessMotion' }).exists()).toBe(true)
    expect(row.find('.chat-typing').exists()).toBe(false)
  })

  it('/旁白_AGENT补充润色等待时使用三体加载动画', () => {
    const wrapper = mountStream({
      isTyping: true,
      currentMessages: [],
      streamingSpeakerName: '旁白润色中',
      streamingTargetId: 'char_1'
    })

    const row = wrapper.find('.chat-message--narration')
    expect(row.exists()).toBe(true)
    expect(row.find('.chat-process-motion').exists()).toBe(true)
    expect(row.find('.three-body').exists()).toBe(true)
    expect(row.find('.chat-sender').text()).toContain('旁白润色中')
    expect(row.find('.chat-typing').exists()).toBe(false)
  })

  it('调试消息独立于旁白显示，只保留同行提示词入口并隐藏元信息', async () => {
    const wrapper = mountStream({
      currentMessages: [{
        id: 46,
        role: 'assistant',
        messageKind: 'narration_debug',
        name: '旁白快判',
        content: '【用户输入环境】快判：是',
        time: '12:04',
        model: 'deepseek-v4-flash',
        envDate: '5月12日 周六',
        envWeather: '晴',
        envLocation: '维斯珂 / 博瑞利尔 / 修道院'
      }]
    })

    wrapper.find('.chat-debug-group__summary').trigger('click')
    await wrapper.vm.$nextTick()
    const row = wrapper.find('.chat-message--narration-debug')
    expect(row.exists()).toBe(true)
    expect(row.classes()).not.toContain('chat-message--narration')
    expect(wrapper.find('.chat-debug-group__title').text()).toContain('调试信息')
    expect(row.find('.chat-sender').exists()).toBe(false)
    expect(row.find('.chat-text').text()).toContain('【用户输入环境】快判：是')
    expect(row.find('.chat-time').exists()).toBe(false)
    expect(row.text()).not.toContain('12:04')
    expect(row.text()).not.toContain('deepseek-v4-flash')
    expect(row.text()).not.toContain('维斯珂 / 博瑞利尔 / 修道院')
    expect(row.find('[data-prompt-message-id="46"]').exists()).toBe(true)
    expect(row.find('.chat-bubble').element.compareDocumentPosition(row.find('.msg-actions').element) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(row.find('[data-recall-message-id="46"]').exists()).toBe(false)
    expect(row.find('[title="编辑"]').exists()).toBe(false)
    expect(row.find('[title="重试召回"]').exists()).toBe(false)
    expect(row.find('[title="按原提示词重试"]').exists()).toBe(false)
  })

  it('角色消息和正式旁白底部显示完整帷幕时间、地点天气和模型', () => {
    const wrapper = mountStream({
      currentMessages: [
        {
          id: 46,
          role: 'user',
          name: '用户',
          content: '我先推门进去。',
          time: '23:57',
          model: '不该显示',
          envDate: '2026年5月12日 周六 08:18:00',
          envWeather: '晴',
          envLocation: '维斯珂 / 博瑞利尔 / 修道院'
        },
        {
          id: 47,
          role: 'assistant',
          name: '惊雨',
          content: '我会守在门口。',
          time: '23:58',
          model: 'deepseek-v4',
          envDate: '2026年5月12日 周六 08:20:30',
          envWeather: '晴',
          envLocation: '维斯珂 / 博瑞利尔 / 修道院',
          autoWriteHidden: true
        },
        {
          id: 48,
          role: 'assistant',
          messageKind: 'narration',
          name: '旁白',
          content: '钟声从塔楼传来。',
          time: '23:59',
          model: 'deepseek-v4',
          envDate: '2026年5月12日 周六 09:05:10',
          envWeather: '小雨',
          envLocation: '钟楼'
        }
      ]
    })

    const footers = wrapper.findAll('.chat-time')
    expect(footers).toHaveLength(3)
    expect(footers[0].text()).toContain('2026年5月12日 周六 08:18:00')
    expect(footers[0].text()).not.toContain('23:57')
    expect(footers[0].text()).toContain('维斯珂 / 博瑞利尔 / 修道院 晴')
    expect(footers[0].text()).not.toContain('不该显示')
    expect(footers[0].text()).not.toContain('角色')
    expect(footers[0].text()).toMatch(/2026年5月12日 周六 08:18:00.*维斯珂 \/ 博瑞利尔 \/ 修道院 晴$/)
    expect(footers[1].text()).toContain('角色 1/1')
    expect(footers[1].text()).toContain('2026年5月12日 周六 08:20:30')
    expect(footers[1].text()).not.toContain('23:58')
    expect(footers[1].text()).toContain('维斯珂 / 博瑞利尔 / 修道院 晴')
    expect(footers[1].text()).toContain('deepseek-v4')
    expect(footers[1].text()).toMatch(/维斯珂 \/ 博瑞利尔 \/ 修道院 晴.*deepseek-v4.*已隐藏$/)
    expect(footers[2].text()).toContain('旁白 1/1')
    expect(footers[2].text()).toContain('2026年5月12日 周六 09:05:10')
    expect(footers[2].text()).not.toContain('23:59')
    expect(footers[2].text()).toContain('钟楼 小雨')
    expect(footers[2].text()).toContain('deepseek-v4')
    expect(footers[2].text()).toMatch(/钟楼 小雨.*deepseek-v4$/)
  })

  it('助手消息只保留单一「按提示词重试」入口（点击直接 prompt_replay、无悬浮弹层）', async () => {
    const wrapper = mountStream({
      currentMessages: [{
        id: 52,
        role: 'assistant',
        name: '惊雨',
        content: '旧回复',
        time: '12:08'
      }]
    })

    // 旧的「重试召回」入口与悬浮弹层已撤掉（想改具体内容走输入栏上方的常驻纠偏框）。
    expect(wrapper.find('[title="重试召回"]').exists()).toBe(false)
    expect(wrapper.find('.msg-action-popover').exists()).toBe(false)
    await wrapper.find('[title="按提示词重试"]').trigger('click')
    expect(wrapper.emitted('regenerate-message')?.[0]?.[0]).toEqual({ index: 0, mode: 'prompt_replay' })
  })

  it('旁白消息同样只有单一「按提示词重试」入口', async () => {
    const wrapper = mountStream({
      currentMessages: [{ id: 61, role: 'assistant', name: '旁白', memberName: '旁白', messageKind: 'narration', message_kind: 'narration', content: '夜色渐深。', time: '12:11' }]
    })
    expect(wrapper.find('.msg-action-popover').exists()).toBe(false)
    await wrapper.find('[title="按提示词重试"]').trigger('click')
    expect(wrapper.emitted('regenerate-message')?.[0]?.[0]).toEqual({ index: 0, mode: 'prompt_replay' })
  })

  it('CAPS 角色回复重试为单一按提示词重试（无重试召回 / 无重新运行 CAPS 入口）', async () => {
    const wrapper = mountStream({
      currentMessages: [{
        id: 53,
        role: 'assistant',
        name: '张元英',
        memberName: '张元英',
        messageKind: 'caps_reply',
        message_kind: 'caps_reply',
        content: '旧 CAPS 回复',
        time: '12:09'
      }]
    })

    await wrapper.find('[title="按提示词重试"]').trigger('click')

    expect(wrapper.emitted('regenerate-message')?.[0]?.[0]).toEqual({ index: 0, mode: 'prompt_replay' })
    expect(wrapper.find('[title="重试召回"]').exists()).toBe(false)
    expect(wrapper.find('[title="重新运行 CAPS"]').exists()).toBe(false)
    expect(wrapper.find('[title="按提示词重试"]').exists()).toBe(true)
  })

  it('调试消息使用统一中括号前缀并让后续行对齐正文列', async () => {
    const wrapper = mountStream({
      currentMessages: [{
        id: 48,
        role: 'assistant',
        messageKind: 'narration_debug',
        name: '总结调试',
        content: '【总结对话】成功：已写入角色轨迹。\n本次消耗 14,709 tokens（输入 9,602，输出 5,107）',
        time: '12:06'
      }]
    })

    await wrapper.find('.chat-debug-group__summary').trigger('click')
    const row = wrapper.find('.chat-message--narration-debug')
    const prefix = row.find('.debug-prefix')
    const body = row.find('.debug-body')
    expect(prefix.exists()).toBe(true)
    expect(prefix.text()).toBe('【总结对话】')
    expect(body.exists()).toBe(true)
    expect(body.text()).toContain('成功：已写入角色轨迹。')
    expect(body.text()).toContain('本次消耗 14,709 tokens')
    expect(row.find('.debug-line').exists()).toBe(true)
  })

  // ---- 子批5：提调真·导演 loop 轮级流式载体（2026-07-04 位置改造：收进顶部提调坞 TidiaoDirectorDock）----
  it('提调导演载体收进顶部提调坞：运行中自动展开、done 自动收起、点绿条可回看', async () => {
    const wrapper = mountStream({
      activeSessionId: 'sess_dir',
      currentMessages: [{
        id: 200,
        role: 'user',
        name: '用户',
        content: '今天晚上天气不错',
        time: '20:00'
      }]
    })

    // 尚无任何轮：坞收起为绿色细条（常驻入口），不出带。
    expect(wrapper.find('.tds-dock__bar').exists()).toBe(true)
    expect(wrapper.find('.chat-director-band').exists()).toBe(false)

    beginTidiaoDirectorStreamRound({
      runId: 'run_dir_1',
      sessionId: 'sess_dir',
      anchorMessageId: 200,
      speakerName: '惊雨'
    })
    const runningEvents = [
      { type: 'decision', kind: 'situation', text: '这是闲聊放松的情境，读对应情境 skill' },
      {
        type: 'decision',
        kind: 'castDir',
        text: '惊雨会附和用户、觉得有道理',
        shot: { kind: 'character', label: '惊雨', direction: '附和、点头', avatar: '惊' }
      },
      { type: 'phase', phase: 'running' }
    ]
    updateTidiaoDirectorStreamRound('run_dir_1', buildTidiaoDirectorStream(runningEvents))
    await nextTick()

    // 运行中：坞自动展开，决策流逐条人话决策可见
    let band = wrapper.find('.chat-director-band')
    expect(band.exists()).toBe(true)
    expect(band.text()).toContain('这是闲聊放松的情境')
    // 并排分镜实时累积：惊雨那一镜带方向
    const shot = band.find('.tds-shot')
    expect(shot.exists()).toBe(true)
    expect(shot.text()).toContain('惊雨')
    expect(shot.text()).toContain('附和')
    // 位置：坞钉在消息流顶部，带在用户消息之前（往下滑 sticky 常驻可见）
    const userRow = wrapper.find('.chat-message.self').element
    expect(band.element.compareDocumentPosition(userRow) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    // 跑完（done）：坞自动收起回绿色细条
    updateTidiaoDirectorStreamRound('run_dir_1', buildTidiaoDirectorStream([
      ...runningEvents.slice(0, 2),
      { type: 'phase', phase: 'done' }
    ]))
    await nextTick()
    expect(wrapper.find('.chat-director-band').exists()).toBe(false)
    // 点绿条手动展开：回看最新一轮
    await wrapper.find('.tds-dock__bar').trigger('click')
    band = wrapper.find('.chat-director-band')
    expect(band.exists()).toBe(true)
    expect(band.text()).toContain('这是闲聊放松的情境')
  })

  it('提调导演载体仅在匹配会话显示，跨会话不串台', async () => {
    const wrapper = mountStream({
      activeSessionId: 'sess_other',
      currentMessages: [{
        id: 201,
        role: 'user',
        name: '用户',
        content: '换个会话',
        time: '20:01'
      }]
    })

    beginTidiaoDirectorStreamRound({
      runId: 'run_dir_2',
      sessionId: 'sess_dir',
      anchorMessageId: 201,
      speakerName: '惊雨'
    })
    await nextTick()

    expect(wrapper.find('.chat-director-band').exists()).toBe(false)
  })

  it('旧六块编排带已退役删除：无 directorStream 的轮不出带，导演载体接管后出新带', async () => {
    const messages = [
      { id: 210, role: 'user', name: '用户', content: '排一轮', time: '20:02' },
      {
        id: 211,
        role: 'assistant',
        name: '惊雨',
        content: '正文回复',
        time: '20:03',
        _processTrace: { mode: 'personality_model', steps: { plan: '已生成回复计划' } }
      }
    ]
    const wrapper = mountStream({ activeSessionId: 'sess_dir', currentMessages: messages })
    // 旧带删除后：成员只有过程轨、无 directorStream → 既不出旧带、也不出新带（正文照常）。
    expect(wrapper.find('.chat-round-band').exists()).toBe(false)
    expect(wrapper.find('.chat-director-band').exists()).toBe(false)

    beginTidiaoDirectorStreamRound({
      runId: 'run_dir_3',
      sessionId: 'sess_dir',
      anchorMessageId: 210,
      speakerName: '惊雨'
    })
    updateTidiaoDirectorStreamRound('run_dir_3', buildTidiaoDirectorStream([
      { type: 'decision', kind: 'situation', text: '判断情境中' },
      { type: 'phase', phase: 'running' }
    ]))
    await nextTick()

    // 导演载体接管：显示新带（决策流+分镜），旧带恒不存在。
    expect(wrapper.find('.chat-director-band').exists()).toBe(true)
    expect(wrapper.find('.chat-round-band').exists()).toBe(false)
  })

  // O-B：刷新持久化复原——历史轮成员过程轨带落库 directorStream 时走新带，不再退回旧编排带（无活动轮）。
  it('O-B：历史轮落库 directorStream → 复原走新带，旧编排带不再出现', async () => {
    const stream = buildTidiaoDirectorStream([
      { type: 'decision', kind: 'situation', text: '这是闲聊放松的情境' },
      { type: 'decision', kind: 'castDir', text: '惊雨会附和用户', shot: { kind: 'character', label: '惊雨', direction: '附和、点头' } },
      { type: 'phase', phase: 'done' }
    ])
    const messages = [
      { id: 230, role: 'user', name: '用户', content: '今天天气不错', time: '20:06' },
      {
        id: 231,
        role: 'assistant',
        name: '惊雨',
        content: '正文回复',
        time: '20:07',
        _processTrace: { mode: 'personality_model', steps: { plan: '已生成回复计划' }, directorStream: stream }
      }
    ]
    const wrapper = mountStream({ activeSessionId: 'sess_dir', currentMessages: messages })
    await nextTick()
    // 无活动轮（未 begin）：坞默认收起，点绿条展开回看历史轮，复原走新带。
    expect(wrapper.find('.chat-director-band').exists()).toBe(false)
    await wrapper.find('.tds-dock__bar').trigger('click')
    const band = wrapper.find('.chat-director-band')
    expect(band.exists()).toBe(true)
    expect(band.text()).toContain('这是闲聊放松的情境')
    expect(band.find('.tds-shot').text()).toContain('惊雨')
    // 旧编排带被新带取代，单聊历史不再双带/退回旧版。
    expect(wrapper.find('.chat-round-band').exists()).toBe(false)
  })

  // 批次I·侧栏入口联动：导演载体挂召回/编排入口，点击上抛对应面板事件（按 runId 走运行态，loop 期无 messageId）。
  it('导演载体召回/编排入口：点击上抛 open-recall-activity-panel / open-personality-orchestration-audit', async () => {
    const wrapper = mountStream({
      activeSessionId: 'sess_dir',
      currentMessages: [{ id: 220, role: 'user', name: '用户', content: '今晚天气不错', time: '20:05' }]
    })
    beginTidiaoDirectorStreamRound({ runId: 'run_dir_4', sessionId: 'sess_dir', anchorMessageId: 220, speakerName: '惊雨' })
    updateTidiaoDirectorStreamRound('run_dir_4', buildTidiaoDirectorStream([
      { type: 'decision', kind: 'situation', text: '判断情境中' },
      { type: 'phase', phase: 'done' }
    ]))
    setTidiaoDirectorStreamRoundLinks('run_dir_4', {
      recallRunId: 'recall_xyz',
      orchestrationAudit: { orchestration: { scenario: 'casual' }, state: 'success' }
    })
    await nextTick()

    // done 后坞已自动收起：点绿条展开（最新一轮=活动轮，入口按钮由坞透传给带）。
    await wrapper.find('.tds-dock__bar').trigger('click')
    const entries = wrapper.findAll('.chat-director-band .tds-entry')
    const recall = entries.find((e) => e.text().includes('召回'))
    const orch = entries.find((e) => e.text().includes('编排'))
    expect(recall && orch).toBeTruthy()

    await recall.trigger('click')
    const recallEmit = wrapper.emitted('open-recall-activity-panel')
    expect(recallEmit).toHaveLength(1)
    expect(recallEmit[0][0].recallRunId).toBe('recall_xyz')

    await orch.trigger('click')
    const orchEmit = wrapper.emitted('open-personality-orchestration-audit')
    expect(orchEmit).toHaveLength(1)
    expect(orchEmit[0][0].runtimeOrchestration).toBeTruthy()
  })
})
