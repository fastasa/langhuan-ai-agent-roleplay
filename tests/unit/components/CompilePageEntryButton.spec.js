import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import CompilePageEntryButton from '../../../src/components/recall/CompilePageEntryButton.vue'

describe('CompilePageEntryButton', () => {
  it('emits open when clicked', async () => {
    const wrapper = mount(CompilePageEntryButton, {
      props: {
        status: '正常'
      }
    })

    await wrapper.find('button').trigger('click')

    expect(wrapper.emitted('open')).toHaveLength(1)
  })

  it('renders warning status with the warning style', () => {
    const wrapper = mount(CompilePageEntryButton, {
      props: {
        status: '2 条提醒',
        warning: true
      }
    })

    expect(wrapper.text()).toContain('公共编译页')
    expect(wrapper.find('.compile-entry__status--warning').exists()).toBe(true)
  })
})
