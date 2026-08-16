/**
 * @vitest-environment jsdom
 */
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia } from 'pinia'
import ChatMainHeader from '../../../src/components/app/chat/ChatMainHeader.vue'
import { i18n } from '../../../src/i18n'

// ChatMainHeader 依赖 useWorkspaceRuntimeStore（批量投影灯泡的 toast）→ 需要 Pinia；
// 文案走 vue-i18n → 需要 i18n 插件，锁中文口径。
function mountHeader(props = {}) {
  return mount(ChatMainHeader, {
    global: {
      plugins: [createPinia(), i18n],
      stubs: {
        MapHoverPreviewCard: {
          props: ['sessionId', 'active'],
          template: '<div class="map-hover-preview-stub" :data-session-id="sessionId" :data-active="String(active)"></div>'
        }
      }
    },
    props: {
      currentChatTitle: '测试会话',
      chatTarget: 'group_alpha',
      ...props
    }
  })
}

describe('ChatMainHeader link animation actions', () => {
  beforeEach(() => {
    i18n.global.locale.value = 'zh'
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // 2026-07-08：提示词日志/召回面板/人格模型观察三个头部入口已撤下（提示词日志仍走消息级入口）；
  // 同日批次2：新增对话级「状态」入口（状态系统面板），仅在有 sessionId 时显示。
  // 2026-07-10 地图系统批1：新增「舆图」入口，位置固定在状态左边，同样仅在有 sessionId 时显示。
  it('无 sessionId 时头部只保留笔记与设置入口（舆图/剧本/状态按钮不出现）', () => {
    const wrapper = mountHeader()

    expect(wrapper.findAll('.chat-action-link-title').map((item) => item.text())).toEqual([
      '笔记',
      '设置'
    ])
    expect(wrapper.find('button[aria-label="打开舆图弹窗"]').exists()).toBe(false)
    expect(wrapper.find('button[aria-label="打开剧本工作台"]').exists()).toBe(false)
    expect(wrapper.find('button[aria-label="打开状态系统面板"]').exists()).toBe(false)
    expect(wrapper.find('button[aria-label="打开提示词日志"]').exists()).toBe(false)
    expect(wrapper.find('button[aria-label="打开召回面板"]').exists()).toBe(false)
    expect(wrapper.find('button[aria-label="打开人格模型观察"]').exists()).toBe(false)
  })

  it('有 sessionId 时头部为舆图+剧本+状态+笔记+设置', () => {
    const wrapper = mountHeader({ activeSessionId: 'session_1' })

    expect(wrapper.findAll('.chat-action-link-title').map((item) => item.text())).toEqual([
      '舆图',
      '剧本',
      '状态',
      '笔记',
      '设置'
    ])
  })

  it('不再渲染召回面板入口', () => {
    const wrapper = mountHeader()

    expect(wrapper.findAll('.chat-action-link-title').map((item) => item.text())).toEqual([
      '笔记',
      '设置'
    ])
    expect(wrapper.find('button[aria-label="打开召回面板"]').exists()).toBe(false)
  })

  it('keeps the expanded action buttons wired to their panel events', async () => {
    const wrapper = mountHeader({ activeSessionId: 'session_1' })

    await wrapper.get('button[aria-label="打开舆图弹窗"]').trigger('click')
    await wrapper.get('button[aria-label="打开剧本工作台"]').trigger('click')
    await wrapper.get('button[aria-label="打开状态系统面板"]').trigger('click')
    await wrapper.get('button[aria-label="打开笔记侧栏"]').trigger('click')
    await wrapper.get('button[aria-label="设置"]').trigger('click')

    expect(wrapper.emitted('open-map-viewer')).toHaveLength(1)
    expect(wrapper.emitted('open-script-workspace')).toHaveLength(1)
    expect(wrapper.emitted('open-status-system-panel')).toHaveLength(1)
    expect(wrapper.emitted('open-notes-panel')).toHaveLength(1)
    expect(wrapper.emitted('open-prompt-log-panel')).toBeUndefined()
    expect(wrapper.emitted('open-latest-recall-panel')).toBeUndefined()
    expect(wrapper.emitted('open-personality-model-panel')).toBeUndefined()
    expect(wrapper.emitted('open-session-settings')).toEqual([['group_alpha']])
  })

  it('悬浮舆图图标后显示当前会话地图卡片，移入卡片持续展示，离开两者后再收起', async () => {
    vi.useFakeTimers()
    const wrapper = mountHeader({ activeSessionId: 'session_1' })
    const anchor = wrapper.get('.chat-map-preview-anchor')

    await anchor.trigger('pointerenter')
    await flushPromises()
    const popover = wrapper.get('.chat-map-preview-popover')
    expect(popover.attributes('style') || '').not.toContain('display: none')
    expect(wrapper.get('.map-hover-preview-stub').attributes('data-session-id')).toBe('session_1')
    expect(wrapper.get('.map-hover-preview-stub').attributes('data-active')).toBe('true')

    await anchor.trigger('pointerleave')
    vi.advanceTimersByTime(80)
    await popover.trigger('pointerenter')
    vi.advanceTimersByTime(200)
    expect(popover.attributes('style') || '').not.toContain('display: none')

    await popover.trigger('pointerleave')
    vi.advanceTimersByTime(161)
    await Promise.resolve()
    expect(popover.attributes('style')).toContain('display: none')
  })
})
