/**
 * @vitest-environment jsdom
 */
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it } from 'vitest'
import MobileSheet from '../../../src/components/mobile-workspace/MobileSheet.vue'
import { i18n } from '../../../src/i18n'

function dispatchPointer(target, type, options = {}) {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientY: options.clientY ?? 0,
    button: options.button ?? 0
  })

  Object.defineProperty(event, 'pointerId', { value: options.pointerId ?? 1 })
  Object.defineProperty(event, 'pointerType', { value: options.pointerType ?? 'touch' })

  target.dispatchEvent(event)
  return event
}

describe('MobileSheet', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('closes when the drag head is pulled down far enough', () => {
    const wrapper = mount(MobileSheet, {
      props: {
        open: true,
        title: '会话工具'
      },
      global: { plugins: [i18n] }
    })

    const dragHead = document.body.querySelector('.mobile-sheet__drag-head')
    expect(dragHead).toBeTruthy()

    dispatchPointer(dragHead, 'pointerdown', { clientY: 20 })
    dispatchPointer(window, 'pointermove', { clientY: 130 })
    dispatchPointer(window, 'pointerup', { clientY: 130 })

    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('keeps open after a short downward drag', () => {
    const wrapper = mount(MobileSheet, {
      props: {
        open: true,
        title: '更多操作'
      },
      global: { plugins: [i18n] }
    })

    const dragHead = document.body.querySelector('.mobile-sheet__drag-head')
    expect(dragHead).toBeTruthy()

    dispatchPointer(dragHead, 'pointerdown', { clientY: 20 })
    dispatchPointer(window, 'pointermove', { clientY: 44 })
    dispatchPointer(window, 'pointerup', { clientY: 44 })

    expect(wrapper.emitted('close')).toBeUndefined()
  })
})
