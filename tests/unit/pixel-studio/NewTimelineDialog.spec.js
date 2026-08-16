import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import NewTimelineDialog from '@/pixel-studio/ui/NewTimelineDialog.vue'

describe('NewTimelineDialog', () => {
  it('默认 10 fps、2 秒并提交 20 个整数帧', async () => {
    const wrapper = mount(NewTimelineDialog)
    expect(wrapper.text()).toContain('20 帧')
    await wrapper.find('.pixel-dialog__primary').trigger('click')
    expect(wrapper.emitted('confirm')[0]).toEqual([{ fps: 10, totalFrames: 20 }])
  })

  it('秒数按 fps 吸附为整数帧', async () => {
    const wrapper = mount(NewTimelineDialog)
    const inputs = wrapper.findAll('input')
    await inputs[0].setValue(12)
    await inputs[1].setValue(1.25)
    expect(wrapper.text()).toContain('15 帧')
    await wrapper.find('.pixel-dialog__primary').trigger('click')
    expect(wrapper.emitted('confirm')[0]).toEqual([{ fps: 12, totalFrames: 15 }])
  })
})
