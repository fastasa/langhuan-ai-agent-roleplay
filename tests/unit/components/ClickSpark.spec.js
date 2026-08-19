import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ClickSpark from '../../../src/components/common/ClickSpark.vue'

describe('ClickSpark', () => {
  let wrapper
  let getContextSpy

  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      disconnect() {}
    })
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1))
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    getContextSpy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      clearRect: vi.fn(),
      setTransform: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      strokeStyle: '',
      lineWidth: 1,
      lineCap: 'round',
      globalAlpha: 1
    })
    wrapper = mount(ClickSpark, {
      attachTo: document.body,
      slots: { default: '<textarea class="editor"></textarea><div class="surface">浏览区</div>' }
    })
  })

  afterEach(() => {
    wrapper?.unmount()
    getContextSpy?.mockRestore()
    vi.unstubAllGlobals()
    document.body.innerHTML = ''
  })

  it('输入控件与鼠标右键不启动火花，普通左键仍保留效果', () => {
    wrapper.find('.editor').element.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }))
    wrapper.find('.surface').element.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 2 }))
    expect(window.requestAnimationFrame).not.toHaveBeenCalled()

    wrapper.find('.surface').element.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }))
    expect(window.requestAnimationFrame).toHaveBeenCalledTimes(1)
  })
})
