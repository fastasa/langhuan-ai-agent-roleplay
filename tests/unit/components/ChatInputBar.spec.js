/**
 * @vitest-environment jsdom
 */
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import ChatInputBar from '../../../src/components/app/chat/ChatInputBar.vue'
// ChatInputBar 内部调用 useI18n()，孤立跑本文件（不靠其它 spec 文件的模块级副作用）必须真装 i18n 插件
// （locale 钉 zh 让中文断言稳定），与 TidiaoDirectorStreamBand.spec.js 同一先例。
import { i18n } from '../../../src/i18n'

i18n.global.locale.value = 'zh'

function mountInput(overrides = {}) {
  return mount(ChatInputBar, {
    global: { plugins: [i18n] },
    props: {
      isTyping: false,
      hasForegroundChatTask: false,
      foregroundChatTaskLabel: '',
      runningChatTaskCount: 0,
      evaluationEnabled: false,
      plusMenuOpen: false,
      atMenuOpen: false,
      chatInputText: '',
      pendingImageAttachments: [],
      handleImageAttachmentPaste: vi.fn(() => false),
      handleImageAttachmentDrop: vi.fn(),
      handleImageAttachmentDragOver: vi.fn(),
      removeImageAttachment: vi.fn(),
      retryImageAttachmentUpload: vi.fn(),
      openFullscreenImage: vi.fn(),
      mentionSelectedChars: [],
      mentionExcludedChars: [],
      filteredAtCharacters: [],
      getCharNameById: (id) => id,
      togglePlusMenu: vi.fn(),
      clearCurrentChat: vi.fn(),
      requestClearCurrentChatContext: vi.fn(),
      addMentionChar: vi.fn(),
      removeMentionChar: vi.fn(),
      toggleExcludeChar: vi.fn(),
      sendChat: vi.fn(),
      triggerManualNarration: vi.fn(),
      abortChat: vi.fn(),
      openChatSummary: vi.fn(),
      openChatHistory: vi.fn(),
      toggleEvaluation: vi.fn(),
      inputChatText: vi.fn(),
      setMenuContainerRef: vi.fn(),
      setChatInputRef: vi.fn(),
      allowSummaryAction: true,
      canTriggerManualNarration: true,
      ...overrides
    }
  })
}

describe('ChatInputBar', () => {
  it('places manual narration trigger beside the plus button and calls the narration action', async () => {
    const triggerManualNarration = vi.fn()
    const wrapper = mountInput({ triggerManualNarration })

    const leftToolbar = wrapper.find('.chat-input-toolbar-left')
    const leftToolbarChildren = leftToolbar.element.children
    expect(leftToolbarChildren[0].classList.contains('plus-menu-container')).toBe(true)
    expect(leftToolbarChildren[1].classList.contains('focused-action-btn')).toBe(true)
    expect(leftToolbarChildren[2].classList.contains('narration-menu-container')).toBe(true)
    expect(leftToolbarChildren[2].querySelector('.narration-trigger-btn')).not.toBeNull()

    await wrapper.find('.narration-trigger-btn').trigger('click')
    await wrapper.find('.narration-menu .plus-menu-item').trigger('click')
    expect(triggerManualNarration).toHaveBeenCalledTimes(1)
  })

  it('输入框左下角操作按钮带有滑入标题槽', () => {
    const wrapper = mountInput()

    const titles = wrapper.findAll('.chat-input-action-title').map((item) => item.text())

    expect(titles).toEqual(['更多', '动作', '旁白'])
    expect(wrapper.findAll('.chat-input-action-icon')).toHaveLength(3)
    expect(wrapper.findAll('.plus-btn > svg, .narration-trigger-btn > svg')).toHaveLength(0)
  })

  it('动作输入只影响当前发送，并带圆形铺开状态与专用 payload', async () => {
    const sendChat = vi.fn()
    const wrapper = mountInput({ chatInputText: '观察桌上的药瓶', sendChat })

    await wrapper.find('.focused-action-btn').trigger('click')
    expect(wrapper.find('.focused-action-btn').attributes('aria-pressed')).toBe('true')
    expect(wrapper.find('.chat-input-area').classes()).toContain('chat-input-area--focused-action')
    expect(wrapper.find('textarea').attributes('placeholder')).toContain('动作')

    await wrapper.find('textarea').trigger('keydown', { key: 'Enter' })
    expect(sendChat).toHaveBeenCalledWith({
      text: '观察桌上的药瓶',
      inputKind: 'focused_action'
    })
    expect(wrapper.find('.focused-action-btn').attributes('aria-pressed')).toBe('false')
  })

  it('加号菜单选项左侧显示语义图标', () => {
    const wrapper = mountInput({ plusMenuOpen: true })

    const items = wrapper.findAll('.plus-menu-item')

    expect(items.map((item) => item.text())).toEqual(['聊天文件管理', '总结对话', '清空对话', '提及'])
    expect(wrapper.findAll('.plus-menu-item__icon')).toHaveLength(4)
    expect(items.every((item) => item.element.tagName === 'BUTTON')).toBe(true)
    expect(items[2].classes()).toContain('plus-menu-item--danger')
  })

  it('allows manual narration while another chat task is running', async () => {
    const triggerManualNarration = vi.fn()
    const wrapper = mountInput({
      isTyping: true,
      hasForegroundChatTask: true,
      triggerManualNarration
    })

    const button = wrapper.find('.narration-trigger-btn')
    expect(button.attributes('disabled')).toBeUndefined()
    await button.trigger('click')
    await wrapper.find('.narration-menu .plus-menu-item').trigger('click')
    expect(triggerManualNarration).toHaveBeenCalledWith({ kind: 'event_push' })
  })

  it('空输入且有前台任务时显示停止按钮并停止前台任务', async () => {
    const abortChat = vi.fn()
    const wrapper = mountInput({
      isTyping: true,
      hasForegroundChatTask: true,
      foregroundChatTaskLabel: '旁白润色',
      runningChatTaskCount: 2,
      abortChat
    })

    expect(wrapper.find('textarea').attributes('disabled')).toBeUndefined()
    expect(wrapper.find('.chat-task-hint').text()).toContain('旁白润色')
    expect(wrapper.find('.chat-task-hint').text()).toContain('+1')
    expect(wrapper.find('.chat-send--stop').exists()).toBe(true)

    await wrapper.find('.chat-send--stop').trigger('click')

    expect(abortChat).toHaveBeenCalledTimes(1)
  })

  it('停止优先（2026-07-06 用户拍板）：任务在跑时即使有输入内容也保持停止按钮，Enter 仍可发送', async () => {
    const sendChat = vi.fn()
    const abortChat = vi.fn()
    const wrapper = mountInput({
      isTyping: true,
      hasForegroundChatTask: true,
      foregroundChatTaskLabel: '角色回复',
      chatInputText: '继续说',
      sendChat,
      abortChat
    })

    // 运行中停止按钮常驻可按，不被已输入文字顶回发送按钮（与移动端同口径）。
    expect(wrapper.find('.chat-send--stop').exists()).toBe(true)
    expect(wrapper.find('.chat-send--fly').exists()).toBe(false)

    // 运行中仍可用 Enter 发送（发送即打断当前轮）。
    await wrapper.find('textarea').trigger('keydown.enter')
    expect(sendChat).toHaveBeenCalledTimes(1)

    await wrapper.find('.chat-send--stop').trigger('click')
    expect(abortChat).toHaveBeenCalledTimes(1)
  })

  it('IME 合成中的回车（isComposing / keyCode 229）不发送，普通回车正常发送（修复批次H）', async () => {
    const sendChat = vi.fn()
    const wrapper = mountInput({ chatInputText: '正在打拼音', sendChat })
    const textarea = wrapper.find('textarea')

    await textarea.trigger('keydown', { key: 'Enter', isComposing: true })
    expect(sendChat).not.toHaveBeenCalled()

    await textarea.trigger('keydown', { key: 'Enter', keyCode: 229 })
    expect(sendChat).not.toHaveBeenCalled()

    await textarea.trigger('keydown', { key: 'Enter' })
    expect(sendChat).toHaveBeenCalledTimes(1)
  })

  it('无任务运行且有输入内容时显示发送按钮（停止优先只在运行中生效）', async () => {
    const sendChat = vi.fn()
    const wrapper = mountInput({
      isTyping: false,
      hasForegroundChatTask: false,
      chatInputText: '继续说',
      sendChat
    })

    expect(wrapper.find('.chat-send--stop').exists()).toBe(false)
    const sendButton = wrapper.find('.chat-send--fly')
    expect(sendButton.exists()).toBe(true)
    expect(sendButton.attributes('disabled')).toBeUndefined()

    await sendButton.trigger('click')
    expect(sendChat).toHaveBeenCalledTimes(1)
  })

  it('shows formal role marker and a 15-character summary in the mention menu', () => {
    const wrapper = mountInput({
      atMenuOpen: true,
      filteredAtCharacters: [
        {
          id: 'char_xingyi',
          name: '星依',
          emoji: '✦',
          desc: '脑子很好但懒得惯着用户继续说下去'
        }
      ]
    })

    expect(wrapper.text()).toContain('正式角色')
    expect(wrapper.find('.at-menu-character-summary').text()).toBe('脑子很好但懒得惯着用户继续说下')
  })

  it('输入斜杠时显示全部聊天命令', () => {
    const wrapper = mountInput({ chatInputText: '/' })

    const text = wrapper.text()
    expect(wrapper.find('.slash-command-panel').exists()).toBe(true)
    expect(text).toContain('/旁白')
    expect(text).toContain('/创建角色')
    expect(text).toContain('/整理物品')
  })

  it('按输入内容筛选命令面板', () => {
    const wrapper = mountInput({ chatInputText: '/整理建' })

    const commandTexts = wrapper.findAll('.slash-command-item__command').map((item) => item.text())
    expect(commandTexts).toEqual(['/整理建筑'])
    expect(wrapper.find('.slash-command-item__title').text()).toBe('整理临时建筑')
    expect(wrapper.find('.slash-command-item__summary').text()).toContain('当前会话证据')
  })

  it('选中命令后填入命令前缀并保留参数输入位置', async () => {
    const inputChatText = vi.fn()
    const wrapper = mountInput({
      chatInputText: '/旁',
      inputChatText
    })

    await wrapper.find('.slash-command-item').trigger('click')

    expect(inputChatText).toHaveBeenCalledWith('/旁白 ', expect.any(Event))
  })

  it('输入法合成期间不回写真值，合成结束才提交一次（修复标点要按两次才生效）', async () => {
    const inputChatText = vi.fn()
    const wrapper = mountInput({ inputChatText })
    const textarea = wrapper.find('textarea')

    // 模拟中文输入法打标点：开始合成 -> 合成中触发 input -> 结束合成
    await textarea.trigger('compositionstart')
    textarea.element.value = '，'
    await textarea.trigger('input')
    expect(inputChatText).not.toHaveBeenCalled()

    await textarea.trigger('compositionend')
    expect(inputChatText).toHaveBeenCalledTimes(1)
    expect(inputChatText).toHaveBeenCalledWith('，', expect.any(Event))
  })

  it('非合成输入（直接上屏）立即回写真值', async () => {
    const inputChatText = vi.fn()
    const wrapper = mountInput({ inputChatText })
    const textarea = wrapper.find('textarea')

    textarea.element.value = 'hi'
    await textarea.trigger('input')

    expect(inputChatText).toHaveBeenCalledTimes(1)
    expect(inputChatText).toHaveBeenCalledWith('hi', expect.any(Event))
  })

  describe('桌面输入框收起三态（2026-07-12）', () => {
    it('默认无文字无附件时不带 keep-open 强制展开类', () => {
      const wrapper = mountInput()
      expect(wrapper.find('.chat-input-area').classes()).not.toContain('chat-input-area--keep-open')
    })

    it('输入文字非空时带 keep-open 类', () => {
      const wrapper = mountInput({ chatInputText: '你好' })
      expect(wrapper.find('.chat-input-area').classes()).toContain('chat-input-area--keep-open')
    })

    it('有图片附件时带 keep-open 类', () => {
      const wrapper = mountInput({
        pendingImageAttachments: [{ id: 'a1', status: 'ready', previewUrl: '', url: '/chat-images/a1.png' }]
      })
      expect(wrapper.find('.chat-input-area').classes()).toContain('chat-input-area--keep-open')
    })
  })

  describe('图片附件（输入框图片上传计划批4）', () => {
    it('无文字但有 ready 附件时发送按钮可用，纯文字为空且无附件时禁用', () => {
      const noAttachments = mountInput({ chatInputText: '' })
      expect(noAttachments.find('.chat-send--fly').attributes('disabled')).toBeDefined()

      const withReadyAttachment = mountInput({
        chatInputText: '',
        pendingImageAttachments: [{ id: 'a1', status: 'ready', previewUrl: '', url: '/chat-images/a1.png' }]
      })
      expect(withReadyAttachment.find('.chat-send--fly').attributes('disabled')).toBeUndefined()
    })

    it('uploading 态附件不算「有内容」，发送按钮仍禁用', () => {
      const wrapper = mountInput({
        chatInputText: '',
        pendingImageAttachments: [{ id: 'a1', status: 'uploading', previewUrl: '', url: '' }]
      })
      expect(wrapper.find('.chat-send--fly').attributes('disabled')).toBeDefined()
    })

    it('有 pendingImageAttachments 时渲染 ImageAttachmentChips，并把 remove/retry/preview 转发给对应 props', async () => {
      const removeImageAttachment = vi.fn()
      const retryImageAttachmentUpload = vi.fn()
      const openFullscreenImage = vi.fn()
      const wrapper = mountInput({
        pendingImageAttachments: [
          { id: 'a1', status: 'ready', previewUrl: '', url: '/chat-images/a1.png' },
          { id: 'a2', status: 'failed', previewUrl: '', url: '', errorMessage: '上传失败' }
        ],
        removeImageAttachment,
        retryImageAttachmentUpload,
        openFullscreenImage
      })

      expect(wrapper.find('.image-attachment-chips').exists()).toBe(true)
      expect(wrapper.findAll('.iac-chip')).toHaveLength(2)

      await wrapper.findAll('.iac-chip__remove')[0].trigger('click')
      expect(removeImageAttachment).toHaveBeenCalledWith('a1')

      // 第二张 failed 态：点击缩略图本体触发 retry。
      await wrapper.findAll('.iac-chip__thumb')[1].trigger('click')
      expect(retryImageAttachmentUpload).toHaveBeenCalledWith('a2')

      // 第一张 ready 态：点击缩略图本体触发 preview → openFullscreenImage。
      await wrapper.findAll('.iac-chip__thumb')[0].trigger('click')
      expect(openFullscreenImage).toHaveBeenCalledWith('/chat-images/a1.png')
    })

    it('粘贴图片时命中 handleImageAttachmentPaste 返回 true 则阻止默认行为', async () => {
      const handleImageAttachmentPaste = vi.fn(() => true)
      const wrapper = mountInput({ handleImageAttachmentPaste })
      const textarea = wrapper.find('textarea')

      const event = new Event('paste', { bubbles: true, cancelable: true })
      textarea.element.dispatchEvent(event)

      expect(handleImageAttachmentPaste).toHaveBeenCalledTimes(1)
      expect(event.defaultPrevented).toBe(true)
    })

    it('拖拽悬停给输入壳加高亮态 class，drop 后摘掉并转发事件', async () => {
      const handleImageAttachmentDrop = vi.fn()
      const handleImageAttachmentDragOver = vi.fn()
      const wrapper = mountInput({ handleImageAttachmentDrop, handleImageAttachmentDragOver })
      const shell = wrapper.find('.chat-input-shell')

      await shell.trigger('dragover')
      expect(shell.classes()).toContain('chat-input-shell--drag-active')
      expect(handleImageAttachmentDragOver).toHaveBeenCalledTimes(1)

      await shell.trigger('drop')
      expect(handleImageAttachmentDrop).toHaveBeenCalledTimes(1)
      expect(wrapper.find('.chat-input-shell').classes()).not.toContain('chat-input-shell--drag-active')
    })
  })
})
