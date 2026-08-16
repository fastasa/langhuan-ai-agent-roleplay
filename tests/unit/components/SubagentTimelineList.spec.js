/** @vitest-environment jsdom */
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import SubagentTimelineList from '../../../src/components/app/chat/SubagentTimelineList.vue'

describe('SubagentTimelineList', () => {
  it('工具详情默认摘要显示，点击后展开完整正文并可再次收起', async () => {
    const detail = `状态栏旧实现\n${'详细内容'.repeat(80)}`
    const wrapper = mount(SubagentTimelineList, {
      props: {
        entries: [{ kind: 'tool', label: 'searchXingyiKnowledge', detail, status: 'success', at: 1 }]
      }
    })

    const row = wrapper.get('.tds-tool')
    expect(row.attributes('aria-expanded')).toBe('false')
    expect(wrapper.find('.tds-tool-expanded').exists()).toBe(false)

    await row.trigger('click')
    expect(row.attributes('aria-expanded')).toBe('true')
    expect(wrapper.get('.tds-tool-expanded').text()).toBe(detail)

    await row.trigger('keydown', { key: 'Enter' })
    expect(row.attributes('aria-expanded')).toBe('false')
    expect(wrapper.find('.tds-tool-expanded').exists()).toBe(false)
  })

  it('星依消息流可关闭内部限高滚动，统一交给外层贴底容器', () => {
    const wrapper = mount(SubagentTimelineList, {
      props: {
        entries: [{ kind: 'turn', label: '第 1 轮', at: 1 }],
        contained: false
      }
    })

    expect(wrapper.get('.tds-timeline').classes()).toContain('tds-timeline--parent-scroll')
  })
})
