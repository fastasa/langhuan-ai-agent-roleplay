/** @vitest-environment jsdom */
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import PixelDialog from '../../../src/pixel-studio/ui/PixelDialog.vue'

function pointer(el, type, { pointerId = 1, clientX = 0, clientY = 0 } = {}) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX, clientY })
  Object.defineProperty(event, 'pointerId', { value: pointerId })
  el.dispatchEvent(event)
}

describe('PixelDialog 浮动工具窗模式', () => {
  it('标题栏可拖动，无遮罩模式不靠背景点击关闭', async () => {
    const wrapper = mount(PixelDialog, {
      props: { title: '调色', modeless: true, draggable: true, closeOnBackdrop: false }
    })
    const dialog = wrapper.find('.pixel-dialog').element
    dialog.getBoundingClientRect = () => ({ left: 300, top: 200, right: 730, bottom: 500, width: 430, height: 300, x: 300, y: 200, toJSON() {} })
    const header = wrapper.find('.pixel-dialog__header').element

    pointer(header, 'pointerdown', { clientX: 350, clientY: 220 })
    pointer(header, 'pointermove', { clientX: 380, clientY: 245 })
    pointer(header, 'pointerup', { clientX: 380, clientY: 245 })
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.pixel-dialog').attributes('style')).toContain('translate(30px, 25px)')
    await wrapper.find('.pixel-dialog-mask').trigger('click')
    expect(wrapper.emitted('close')).toBeUndefined()
  })
})
