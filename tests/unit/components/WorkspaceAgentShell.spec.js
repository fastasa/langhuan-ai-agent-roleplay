/**
 * @vitest-environment jsdom
 */
// 工作区专业Agent共享视图壳回归（地图与剧本工作区专业Agent计划批A地基+批B真实loop接入）：
// 覆盖挂载即 ensure 会话、消息渲染、发送→runner→回复渲染、停止按钮显隐、新建/历史菜单基础可用性、
// 确认卡渲染与确认/取消两个分支。runner 由测试注入 mock（不真跑模型/工具）。
// 气泡/输入条为共享组件 XingyiChatBubble / XingyiChatComposer 真实挂载（轻组件），选择器走共享组件类名。
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia } from 'pinia'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import WorkspaceAgentShell from '../../../src/components/app/workspaceAgent/WorkspaceAgentShell.vue'
import { createScopeConfirmWriteChannel, findScopeState, resetWorkspaceAgentScopeStateForTest } from '../../../src/app/workspaceAgentScopeState.ts'
import { beginSubagentRun, resetSubagentRunStatusForTest } from '../../../src/app/subagentRunStatus.ts'
// 组件用 useI18n()，mount 必须装真 i18n（zh 钉死让中文断言稳定，同 ImageAttachmentChips.spec.js 先例）。
import { i18n } from '../../../src/i18n'

i18n.global.locale.value = 'zh'
const shellSource = readFileSync(resolve(process.cwd(), 'src/components/app/workspaceAgent/WorkspaceAgentShell.vue'), 'utf8')

function mockFetchOnce(bundle) {
  return vi.fn(async () => ({
    ok: true,
    json: async () => bundle
  }))
}

function bundleWith(sessionId, messages = []) {
  return { session: { id: sessionId }, messages }
}

function mountShell(props, runner = vi.fn(async () => ({ reply: '' }))) {
  return mount(WorkspaceAgentShell, {
    props: { runner, ...props },
    global: { plugins: [createPinia(), i18n] }
  })
}

describe('WorkspaceAgentShell', () => {
  beforeEach(() => {
    resetWorkspaceAgentScopeStateForTest()
    resetSubagentRunStatusForTest()
  })
  afterEach(() => {
    resetWorkspaceAgentScopeStateForTest()
    resetSubagentRunStatusForTest()
    vi.unstubAllGlobals()
  })

  it('共享壳完整占满宿主宽度，剧本分栏拖动时头部、消息区和输入区同步伸缩', () => {
    // Vitest/jsdom 不注入 SFC scoped style，按仓库既有样式契约测试直接钉死组件自身规则。
    const shellRule = shellSource.match(/\.was-shell\s*\{([\s\S]*?)\}/)?.[1] || ''
    expect(shellRule).toContain('width: 100%;')
    expect(shellRule).toContain('min-width: 0;')
    expect(shellRule).toContain('box-sizing: border-box;')
  })

  it('右上角可请求宿主收起；收起时共享壳不残留被裁切内容', async () => {
    vi.stubGlobal('fetch', mockFetchOnce(bundleWith('script_collapse', [])))
    const wrapper = mountShell({
      scopeKey: 'scriptwriter:world_collapse',
      agentKind: 'scriptwriter',
      targetId: 'world_collapse',
      title: '编剧',
      identityLabel: '编剧 · 收起测试',
      collapsed: false
    })
    await flushPromises()

    const collapseButton = wrapper.get('.was-shell__collapse-btn')
    expect(collapseButton.attributes('aria-label')).toBe('收起编剧对话框')
    await collapseButton.trigger('click')
    expect(wrapper.emitted('update:collapsed')?.at(-1)).toEqual([true])

    await wrapper.setProps({ collapsed: true })
    expect(wrapper.find('.was-shell').exists()).toBe(false)
    expect(wrapper.find('.xingyi-chat-composer').exists()).toBe(false)
    expect(wrapper.text()).toBe('')
  })

  it('挂载即调用 ensure 接口取/建会话，历史消息落进视图', async () => {
    const fetchMock = mockFetchOnce(bundleWith('script_1', [
      { role: 'user', content: '这个世界的伏笔是什么' },
      { role: 'assistant', content: '目前有三条伏笔……' }
    ]))
    vi.stubGlobal('fetch', fetchMock)

    const wrapper = mountShell({
      scopeKey: 'scriptwriter:world_1',
      agentKind: 'scriptwriter',
      targetId: 'world_1',
      title: '编剧',
      identityLabel: '编剧 · 浮梦城'
    })
    await flushPromises()

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/workspace-agent/ensure'),
      expect.objectContaining({ method: 'POST' })
    )
    const bubbles = wrapper.findAll('.xingyi-chat-bubble')
    expect(bubbles).toHaveLength(2)
    expect(bubbles[0].text()).toBe('这个世界的伏笔是什么')
    expect(wrapper.find('.xingyi-dock-header__name').text()).toBe('编剧 · 浮梦城')
  })

  it('当前会话子 Agent 固定显示在消息区顶部，并复用共享运行条组件', async () => {
    vi.stubGlobal('fetch', mockFetchOnce(bundleWith('personality_session_1', [])))
    const wrapper = mountShell({
      scopeKey: 'personality_trainer:char_1',
      agentKind: 'personality_trainer',
      targetId: 'char_1',
      title: '鉴心',
      identityLabel: '鉴心'
    })
    await flushPromises()

    beginSubagentRun('personality_session_1', 'personality-question-author:task-1', {
      input: '【后台制卷任务】',
      presentation: {
        label: '设问',
        icon: 'list-checks',
        runningVerb: '制卷中',
        title: '塞西莉亚人格问卷'
      }
    })
    await flushPromises()

    const messages = wrapper.get('.was-shell__messages')
    expect(messages.element.firstElementChild?.classList.contains('tds-script-card')).toBe(true)
    expect(messages.text()).toContain('设问')
    expect(messages.text()).toContain('制卷中')
    expect(messages.text()).toContain('塞西莉亚人格问卷')
  })

  it('隐藏弹窗不提前取会话；打开时立即恢复历史，不必先发送消息', async () => {
    const fetchMock = mockFetchOnce(bundleWith('script_open_1', [
      { role: 'user', content: '上次聊到哪里了' },
      { role: 'assistant', content: '聊到了钟楼支线。' }
    ]))
    vi.stubGlobal('fetch', fetchMock)

    const wrapper = mountShell({
      scopeKey: 'scriptwriter:world_open',
      agentKind: 'scriptwriter',
      targetId: 'world_open',
      title: '编剧',
      identityLabel: '编剧 · 打开态世界',
      active: false
    })
    await flushPromises()
    expect(fetchMock).not.toHaveBeenCalled()

    await wrapper.setProps({ active: true })
    await flushPromises()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(wrapper.findAll('.xingyi-chat-bubble').map((item) => item.text())).toEqual([
      '上次聊到哪里了',
      '聊到了钟楼支线。'
    ])
  })

  it('历史请求尚未完成时不显示“暂无消息”，失败后重新打开会自动重试', async () => {
    let rejectRequest
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => new Promise((_, reject) => { rejectRequest = reject }))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => bundleWith('script_retry_1', [
          { role: 'assistant', content: '重新打开后恢复成功。' }
        ])
      })
    vi.stubGlobal('fetch', fetchMock)
    const wrapper = mountShell({
      scopeKey: 'scriptwriter:world_loading',
      agentKind: 'scriptwriter',
      targetId: 'world_loading',
      title: '编剧',
      identityLabel: '编剧 · 加载态世界'
    })
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).not.toContain('暂无消息')
    rejectRequest(new Error('network down'))
    await flushPromises()
    expect(wrapper.text()).toContain('聊天记录加载失败')

    await wrapper.setProps({ active: false })
    await wrapper.setProps({ active: true })
    await flushPromises()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(wrapper.text()).toContain('重新打开后恢复成功。')
    expect(wrapper.text()).not.toContain('聊天记录加载失败')
  })

  it('没有正式作用域时保留共享对话壳，但不 ensure 会话且输入禁用', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const wrapper = mountShell({
      scopeKey: 'scriptwriter:unavailable',
      agentKind: 'scriptwriter',
      targetId: '',
      title: '编剧',
      identityLabel: '编剧 · 未加入世界',
      enabled: false,
      unavailableText: '请先把当前对话加入一个世界。'
    })
    await flushPromises()

    expect(wrapper.find('.was-shell').exists()).toBe(true)
    expect(wrapper.find('.agent-conversation-empty-state.is-muted').text()).toContain('请先把当前对话加入一个世界')
    expect(wrapper.find('.xingyi-chat-composer__input').attributes('disabled')).toBeDefined()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('空消息态显示占位文案', async () => {
    vi.stubGlobal('fetch', mockFetchOnce(bundleWith('script_1', [])))
    const wrapper = mountShell({
      scopeKey: 'scriptwriter:world_2',
      agentKind: 'scriptwriter',
      targetId: 'world_2',
      title: '编剧',
      identityLabel: '编剧 · 空世界'
    })
    await flushPromises()

    expect(wrapper.find('.agent-conversation-empty-state').exists()).toBe(true)
  })

  it('草稿非空时点发送会调用 runner 并把回复渲染进消息列表；草稿为空时发送按钮禁用', async () => {
    vi.stubGlobal('fetch', mockFetchOnce(bundleWith('script_1', [])))
    const runner = vi.fn(async () => ({ reply: '目前世界里有两条伏笔可以关注。' }))
    const wrapper = mountShell({
      scopeKey: 'scriptwriter:world_3',
      agentKind: 'scriptwriter',
      targetId: 'world_3',
      title: '编剧',
      identityLabel: '编剧 · 三号世界'
    }, runner)
    await flushPromises()

    const sendBtn = wrapper.find('.xingyi-chat-composer__send')
    expect(sendBtn.attributes('disabled')).toBeDefined()

    await wrapper.find('.xingyi-chat-composer__input').setValue('帮我看看这条支线')
    const sendBtnAfter = wrapper.find('.xingyi-chat-composer__send')
    expect(sendBtnAfter.attributes('disabled')).toBeUndefined()
    await sendBtnAfter.trigger('click')
    await flushPromises()

    expect(runner).toHaveBeenCalledWith(expect.objectContaining({ userText: '帮我看看这条支线' }))
    const bubbles = wrapper.findAll('.xingyi-chat-bubble')
    expect(bubbles.at(-2).text()).toBe('帮我看看这条支线')
    expect(bubbles.at(-1).text()).toBe('目前世界里有两条伏笔可以关注。')
    expect(wrapper.find('.xingyi-chat-composer__send').attributes('disabled')).toBeDefined()
  })

  it('IME 合成中的回车（isComposing / keyCode 229）不触发发送；普通回车正常发送（BUG3）', async () => {
    vi.stubGlobal('fetch', mockFetchOnce(bundleWith('script_1', [])))
    const runner = vi.fn(async () => ({ reply: '好的' }))
    const wrapper = mountShell({
      scopeKey: 'scriptwriter:world_ime',
      agentKind: 'scriptwriter',
      targetId: 'world_ime',
      title: '编剧',
      identityLabel: '编剧 · IME世界'
    }, runner)
    await flushPromises()

    const input = wrapper.find('.xingyi-chat-composer__input')
    await input.setValue('正在打拼音')
    // 合成中的回车是选词确认，不能发送
    await input.trigger('keydown', { key: 'Enter', isComposing: true })
    await flushPromises()
    expect(runner).not.toHaveBeenCalled()
    // 旧式 IME 只给 keyCode 229，也不能发送
    await input.trigger('keydown', { key: 'Enter', keyCode: 229 })
    await flushPromises()
    expect(runner).not.toHaveBeenCalled()
    // Shift+Enter 是换行，不发送
    await input.trigger('keydown', { key: 'Enter', shiftKey: true })
    await flushPromises()
    expect(runner).not.toHaveBeenCalled()

    // 普通回车正常发送
    await input.trigger('keydown', { key: 'Enter' })
    await flushPromises()
    expect(runner).toHaveBeenCalledTimes(1)
    expect(runner).toHaveBeenCalledWith(expect.objectContaining({ userText: '正在打拼音' }))
  })

  it('斜杠菜单与星依浮坞同源：上下选择 /model，再切模型并交给下一轮专业 Agent', async () => {
    vi.stubGlobal('fetch', mockFetchOnce(bundleWith('script_model', [])))
    const runner = vi.fn(async () => ({ reply: '已按校书档处理。' }))
    const wrapper = mountShell({
      scopeKey: 'scriptwriter:world_model',
      agentKind: 'scriptwriter',
      targetId: 'world_model',
      title: '编剧',
      identityLabel: '编剧 · 模型切换'
    }, runner)
    await flushPromises()

    const input = wrapper.get('.xingyi-chat-composer__input')
    await input.setValue('/')
    expect(wrapper.findAll('.agent-slash-command-panel__item').map((item) => item.text()))
      .toEqual(expect.arrayContaining([
        expect.stringContaining('/clear'),
        expect.stringContaining('/resume'),
        expect.stringContaining('/model')
      ]))
    expect(wrapper.get('.agent-slash-command-panel__item.is-active').text()).toContain('/clear')
    await input.trigger('keydown', { key: 'ArrowDown' })
    expect(wrapper.get('.agent-slash-command-panel__item.is-active').text()).toContain('/resume')
    await input.trigger('keydown', { key: 'ArrowDown' })
    expect(wrapper.get('.agent-slash-command-panel__item.is-active').text()).toContain('/model')
    await input.trigger('keydown', { key: 'Enter' })
    await flushPromises()

    expect(wrapper.find('.agent-model-picker').exists()).toBe(true)
    expect(wrapper.vm.controller.state.modelSelection).toEqual({ slotId: 'smart', effort: '' })
    await input.trigger('keydown', { key: 'ArrowUp' })
    expect(wrapper.vm.controller.state.modelSelection).toEqual({ slotId: 'balanced', effort: '' })
    await input.trigger('keydown', { key: 'Enter' })
    expect(wrapper.find('.agent-model-picker').exists()).toBe(false)

    await input.setValue('检查这一幕')
    await input.trigger('keydown', { key: 'Enter' })
    await flushPromises()
    expect(runner).toHaveBeenCalledWith(expect.objectContaining({
      userText: '检查这一幕',
      modelSelection: { slotId: 'balanced', effort: '' }
    }))
  })

  it('running=true 时显示停止按钮而非发送按钮，点击停止会清理运行态', async () => {
    vi.stubGlobal('fetch', mockFetchOnce(bundleWith('script_1', [])))
    const wrapper = mountShell({
      scopeKey: 'scriptwriter:world_4',
      agentKind: 'scriptwriter',
      targetId: 'world_4',
      title: '编剧',
      identityLabel: '编剧 · 四号世界'
    })
    await flushPromises()

    wrapper.vm.controller.state.running = true
    await wrapper.vm.$nextTick()

    // 共享输入条是同一颗按钮原位切换：running 时带 --stop 修饰类且点击走 stop emit
    const btn = wrapper.find('.xingyi-chat-composer__send')
    expect(btn.classes()).toContain('xingyi-chat-composer__send--stop')

    await btn.trigger('click')
    expect(wrapper.vm.controller.state.running).toBe(false)
  })

  it('runner 内触发确认卡（confirmWrite）：渲染 title/lines，点确认/取消分别驱动 resolve', async () => {
    vi.stubGlobal('fetch', mockFetchOnce(bundleWith('script_1', [])))
    let capturedAnswer = null
    const runner = vi.fn(async (input, ctx) => ({ reply: '已处理' }))
    const wrapper = mountShell({
      scopeKey: 'scriptwriter:world_6',
      agentKind: 'scriptwriter',
      targetId: 'world_6',
      title: '编剧',
      identityLabel: '编剧 · 六号世界'
    }, runner)
    await flushPromises()

    // 直接模拟 runner 内部工具调用 confirmWrite（不真跑 harness，只验证 UI 对 pendingInteraction 的响应）。
    // 批G后写确认门走 createScopeConfirmWriteChannel 工厂（与 controller 同一份 pendingInteraction 真值）。
    const confirmWrite = createScopeConfirmWriteChannel('scriptwriter:world_6', 'scriptwriter', 'world_6')
    const answerPromise = confirmWrite({ title: '新建剧本种子', lines: ['类型：伏笔', '标题：钟楼钥匙'] })
      .then((answer) => { capturedAnswer = answer })
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.was-shell__confirm-card strong').text()).toBe('新建剧本种子')
    const lines = wrapper.findAll('.was-shell__confirm-card p')
    expect(lines.map((line) => line.text())).toEqual(['类型：伏笔', '标题：钟楼钥匙'])
    const dock = wrapper.get('.agent-interaction-dock')
    expect(dock.element.parentElement).toBe(wrapper.get('.was-shell').element)
    expect(dock.element.previousElementSibling).toBe(wrapper.get('.was-shell__messages').element)
    expect(dock.element.nextElementSibling).toBe(wrapper.get('.was-shell__input-row').element)
    expect(wrapper.get('.was-shell__messages').find('.was-shell__confirm-card').exists()).toBe(false)

    await wrapper.find('.was-shell__confirm-ok').trigger('click')
    await answerPromise
    expect(capturedAnswer).toEqual({ status: 'confirmed' })
    expect(wrapper.find('.was-shell__confirm-card').exists()).toBe(false)
  })

  it('输入条左侧复用写权限圆点：默认“确”，点按后“放”并让 confirmWrite 自动放行', async () => {
    vi.stubGlobal('fetch', mockFetchOnce(bundleWith('script_mode', [])))
    const scopeKey = 'scriptwriter:world_mode'
    const wrapper = mountShell({
      scopeKey,
      agentKind: 'scriptwriter',
      targetId: 'world_mode',
      title: '编剧',
      identityLabel: '编剧 · 模式世界'
    })
    await flushPromises()

    const modeButton = wrapper.get('.agent-write-mode-toggle')
    expect(modeButton.text()).toBe('确')
    expect(modeButton.attributes('aria-label')).toBe('写前确认')

    await modeButton.trigger('click')
    expect(modeButton.text()).toBe('放')
    expect(modeButton.classes()).toContain('agent-write-mode-toggle--auto')

    const answer = await createScopeConfirmWriteChannel(scopeKey, 'scriptwriter', 'world_mode')({
      title: '自动保存种子', lines: ['标题：无需逐次确认']
    })
    expect(answer).toEqual({ status: 'confirmed' })
    expect(wrapper.find('.was-shell__confirm-card').exists()).toBe(false)
  })

  it('Shift+Tab 与星依浮坞同样切换写权限模式；隐藏工作区不响应', async () => {
    vi.stubGlobal('fetch', mockFetchOnce(bundleWith('script_shortcut', [])))
    const wrapper = mountShell({
      scopeKey: 'scriptwriter:world_shortcut',
      agentKind: 'scriptwriter',
      targetId: 'world_shortcut',
      title: '编剧',
      identityLabel: '编剧 · 快捷键世界'
    })
    await flushPromises()

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true }))
    await wrapper.vm.$nextTick()
    expect(wrapper.get('.agent-write-mode-toggle').text()).toBe('放')

    await wrapper.setProps({ active: false })
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true }))
    await wrapper.vm.$nextTick()
    expect(wrapper.get('.agent-write-mode-toggle').text()).toBe('放')
  })

  it('确认卡点取消：resolve denied，卡片消失', async () => {
    vi.stubGlobal('fetch', mockFetchOnce(bundleWith('script_1', [])))
    let capturedAnswer = null
    const wrapper = mountShell({
      scopeKey: 'scriptwriter:world_7',
      agentKind: 'scriptwriter',
      targetId: 'world_7',
      title: '编剧',
      identityLabel: '编剧 · 七号世界'
    })
    await flushPromises()

    const confirmWrite = createScopeConfirmWriteChannel('scriptwriter:world_7', 'scriptwriter', 'world_7')
    const answerPromise = confirmWrite({ title: '删除剧本种子', lines: ['标题：旧支线'] })
      .then((answer) => { capturedAnswer = answer })
    await wrapper.vm.$nextTick()

    await wrapper.find('.was-shell__confirm-cancel').trigger('click')
    await answerPromise
    expect(capturedAnswer).toEqual({ status: 'denied' })
    expect(wrapper.find('.was-shell__confirm-card').exists()).toBe(false)
  })

  it('确认卡可像超级Agent一样发送修改意见，并以 answered 回流', async () => {
    vi.stubGlobal('fetch', mockFetchOnce(bundleWith('script_1', [])))
    let capturedAnswer = null
    const wrapper = mountShell({
      scopeKey: 'scriptwriter:world_feedback',
      agentKind: 'scriptwriter',
      targetId: 'world_feedback',
      title: '编剧',
      identityLabel: '编剧 · 意见世界'
    })
    await flushPromises()

    const confirmWrite = createScopeConfirmWriteChannel('scriptwriter:world_feedback', 'scriptwriter', 'world_feedback')
    const answerPromise = confirmWrite({ title: '修改种子', lines: ['标题：旧标题'] })
      .then((answer) => { capturedAnswer = answer })
    await wrapper.vm.$nextTick()

    await wrapper.find('.was-shell__confirm-feedback input').setValue('标题换得更含蓄一点')
    await wrapper.find('.was-shell__confirm-feedback button').trigger('click')
    await answerPromise
    expect(capturedAnswer).toEqual({ status: 'answered', answer: '标题换得更含蓄一点' })
  })

  it('卸载时 running=true：scope状态不被清空，重新挂载同scopeKey能取回在途状态', async () => {
    vi.stubGlobal('fetch', mockFetchOnce(bundleWith('script_1', [])))
    const wrapper = mountShell({
      scopeKey: 'scriptwriter:world_8',
      agentKind: 'scriptwriter',
      targetId: 'world_8',
      title: '编剧',
      identityLabel: '编剧 · 八号世界'
    })
    await flushPromises()

    wrapper.vm.controller.state.running = true
    wrapper.vm.controller.state.messages.push({ role: 'assistant', content: '还在跑…' })
    wrapper.unmount()

    expect(findScopeState('scriptwriter:world_8')).not.toBeNull()
    expect(findScopeState('scriptwriter:world_8')?.running).toBe(true)

    const reopened = mountShell({
      scopeKey: 'scriptwriter:world_8',
      agentKind: 'scriptwriter',
      targetId: 'world_8',
      title: '编剧',
      identityLabel: '编剧 · 八号世界'
    })
    await flushPromises()
    expect(reopened.vm.controller.state.running).toBe(true)
    expect(reopened.vm.controller.state.messages.map((m) => m.content)).toContain('还在跑…')
  })

  it('卸载时 running=false 且无待确认卡：scope状态被清空（空闲工作区不占内存）', async () => {
    vi.stubGlobal('fetch', mockFetchOnce(bundleWith('script_1', [])))
    const wrapper = mountShell({
      scopeKey: 'scriptwriter:world_9',
      agentKind: 'scriptwriter',
      targetId: 'world_9',
      title: '编剧',
      identityLabel: '编剧 · 九号世界'
    })
    await flushPromises()

    wrapper.unmount()

    expect(findScopeState('scriptwriter:world_9')).toBeNull()
  })

  it('两个不同 scopeKey 的实例状态互不干扰（根治全局单例串台）', async () => {
    vi.stubGlobal('fetch', mockFetchOnce(bundleWith('script_1', [])))
    const scriptWrapper = mountShell({
      scopeKey: 'scriptwriter:world_5',
      agentKind: 'scriptwriter',
      targetId: 'world_5',
      title: '编剧',
      identityLabel: '编剧 · 五号世界'
    })
    const mapWrapper = mountShell({
      scopeKey: 'cartographer:world_5:sheet_1',
      agentKind: 'cartographer',
      targetId: 'world_5:sheet_1',
      title: '舆图师',
      identityLabel: '舆图师 · 东部主图'
    })
    await flushPromises()

    await scriptWrapper.find('.xingyi-chat-composer__input').setValue('编剧专用草稿')
    await mapWrapper.find('.xingyi-chat-composer__input').setValue('舆图师专用草稿')

    expect(scriptWrapper.vm.controller.state.draft).toBe('编剧专用草稿')
    expect(mapWrapper.vm.controller.state.draft).toBe('舆图师专用草稿')
  })
})
