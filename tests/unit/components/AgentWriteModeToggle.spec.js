/**
 * @vitest-environment jsdom
 */
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import AgentWriteModeToggle from '../../../src/components/app/AgentWriteModeToggle.vue'

const copy = {
  autoLabel: '自动放行',
  confirmLabel: '写前确认',
  autoHint: '当前自动放行',
  confirmHint: '当前写前确认',
  autoGlyph: '放',
  confirmGlyph: '确'
}

describe('AgentWriteModeToggle', () => {
  it('默认确认态与自动放行态使用同一圆点，并只上抛 toggle 意图', async () => {
    const wrapper = mount(AgentWriteModeToggle, { props: { autoApprove: false, ...copy } })
    const button = wrapper.get('button')
    expect(button.text()).toBe('确')
    expect(button.attributes('aria-label')).toBe('写前确认')
    expect(button.classes()).not.toContain('agent-write-mode-toggle--auto')

    await button.trigger('click')
    expect(wrapper.emitted('toggle')).toHaveLength(1)

    await wrapper.setProps({ autoApprove: true })
    expect(button.text()).toBe('放')
    expect(button.attributes('aria-label')).toBe('自动放行')
    expect(button.classes()).toContain('agent-write-mode-toggle--auto')
  })
})
