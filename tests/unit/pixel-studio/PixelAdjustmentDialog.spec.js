/** @vitest-environment jsdom */
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import PixelAdjustmentDialog from '../../../src/pixel-studio/ui/PixelAdjustmentDialog.vue'

describe('调整效果窗统一协议', () => {
  it('无遮罩、外部点击不关闭，X 与 Escape 均关闭', async () => {
    const wrapper = mount(PixelAdjustmentDialog, {
      props: { title: '去除杂色', scopeLabel: '当前图层全部', preview: true }
    })
    expect(wrapper.find('.pixel-dialog-mask').classes()).toContain('pixel-dialog-mask--modeless')
    await wrapper.find('.pixel-dialog-mask').trigger('click')
    expect(wrapper.emitted('close')).toBeUndefined()

    await wrapper.find('.pixel-dialog__close').trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    expect(wrapper.emitted('close')).toHaveLength(2)
  })

  it('预览、重置和应用走统一事件，错误或无有效变化时禁用应用', async () => {
    const wrapper = mount(PixelAdjustmentDialog, {
      props: { title: '调整', scopeLabel: '当前选区', preview: true, applyDisabled: true }
    })
    expect(wrapper.find('.pixel-dialog__primary').attributes('disabled')).toBeDefined()
    await wrapper.setProps({ applyDisabled: false })
    await wrapper.find('.pixel-adjustment__preview input').setValue(false)
    await wrapper.find('.pixel-adjustment__secondary').trigger('click')
    await wrapper.find('.pixel-dialog__primary').trigger('click')
    expect(wrapper.emitted('update:preview')?.[0]).toEqual([false])
    expect(wrapper.emitted('reset')).toHaveLength(1)
    expect(wrapper.emitted('apply')).toHaveLength(1)
  })
})
