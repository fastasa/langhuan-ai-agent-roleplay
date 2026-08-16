/** @vitest-environment jsdom */
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import PixelNavigator from '../../../src/pixel-studio/ui/PixelNavigator.vue'

function makeDoc() {
  return {
    version: 3,
    name: '导航测试',
    width: 16,
    height: 16,
    frames: [{ id: 'f1', durationMs: 200, layers: [{ id: 'l1', name: '图层 1', visible: true, palette: { a1: { hex: '#ff0000' } }, grid: Array(16).fill('..'.repeat(16)) }] }],
    playback: { loop: true }
  }
}

function firePointer(el, type, options = {}) {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: options.clientX ?? 0,
    clientY: options.clientY ?? 0
  })
  Object.defineProperty(event, 'pointerId', { value: options.pointerId ?? 1 })
  el.dispatchEvent(event)
}

describe('PixelNavigator 缩略图导航窗', () => {
  let wrapper

  beforeEach(() => window.localStorage.clear())
  afterEach(() => {
    wrapper?.unmount()
    wrapper = undefined
    vi.unstubAllGlobals()
    window.localStorage.clear()
  })

  it('显示主画布视口框，点击和拖动都按文档坐标发出导航', async () => {
    wrapper = mount(PixelNavigator, {
      props: {
        doc: makeDoc(),
        renderVersion: 0,
        viewport: { zoom: 2, panX: -8, panY: -4, viewportWidth: 16, viewportHeight: 12 }
      }
    })
    const content = wrapper.find('.pixel-navigator__content').element
    content.getBoundingClientRect = () => ({ left: 0, top: 0, width: 240, height: 181, right: 240, bottom: 181, x: 0, y: 0, toJSON() {} })
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.pixel-navigator__viewport').exists()).toBe(true)

    firePointer(content, 'pointerdown', { clientX: 120, clientY: 90 })
    firePointer(content, 'pointermove', { clientX: 150, clientY: 100 })
    firePointer(content, 'pointerup', { clientX: 150, clientY: 100 })
    expect(wrapper.emitted('navigate').length).toBeGreaterThanOrEqual(2)
    const point = wrapper.emitted('navigate').at(-1)[0]
    expect(point.x).toBeGreaterThan(0)
    expect(point.x).toBeLessThanOrEqual(16)
  })

  it('内部滚轮只改变缩略图自己的缩放并持久化，不发主画布导航', async () => {
    wrapper = mount(PixelNavigator, {
      props: {
        doc: makeDoc(),
        renderVersion: 0,
        viewport: { zoom: 1, panX: 0, panY: 0, viewportWidth: 16, viewportHeight: 16 }
      }
    })
    const content = wrapper.find('.pixel-navigator__content').element
    content.getBoundingClientRect = () => ({ left: 0, top: 0, width: 240, height: 181, right: 240, bottom: 181, x: 0, y: 0, toJSON() {} })
    content.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, clientX: 120, clientY: 90, deltaY: -120 }))
    await wrapper.vm.$nextTick()

    const saved = JSON.parse(window.localStorage.getItem('pixel-studio:navigator-layout'))
    expect(saved.previewZoom).toBeGreaterThan(1)
    expect(wrapper.emitted('navigate')).toBeUndefined()
  })

  it('视口框只有描边没有底色，Space+拖动只平移缩略图内部画面', async () => {
    wrapper = mount(PixelNavigator, {
      props: {
        doc: makeDoc(),
        renderVersion: 0,
        viewport: { zoom: 1, panX: 0, panY: 0, viewportWidth: 16, viewportHeight: 16 }
      }
    })
    const source = readFileSync('src/pixel-studio/ui/PixelNavigator.vue', 'utf8')
    expect(source).toContain('.pixel-navigator__viewport')
    expect(source).toContain('background: transparent')

    const content = wrapper.find('.pixel-navigator__content').element
    content.getBoundingClientRect = () => ({ left: 0, top: 0, width: 240, height: 181, right: 240, bottom: 181, x: 0, y: 0, toJSON() {} })
    content.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true, cancelable: true }))
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.pixel-navigator__content--pan-ready').exists()).toBe(true)

    firePointer(content, 'pointerdown', { clientX: 100, clientY: 80 })
    firePointer(content, 'pointermove', { clientX: 132, clientY: 96 })
    firePointer(content, 'pointerup', { clientX: 132, clientY: 96 })
    const saved = JSON.parse(window.localStorage.getItem('pixel-studio:navigator-layout'))
    expect(saved.previewPanX).toBe(32)
    expect(saved.previewPanY).toBe(16)
    expect(wrapper.emitted('navigate')).toBeUndefined()
  })

  it('标题栏拖动与窗口尺寸变化都写入浏览器级布局配置', async () => {
    let resizeCallback
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback) { resizeCallback = callback }
      observe() {}
      disconnect() {}
    })
    wrapper = mount(PixelNavigator, {
      props: {
        doc: makeDoc(),
        renderVersion: 0,
        viewport: { zoom: 1, panX: 0, panY: 0, viewportWidth: 16, viewportHeight: 16 }
      }
    })
    const root = wrapper.find('.pixel-navigator').element
    root.parentElement.getBoundingClientRect = () => ({ left: 100, top: 50, width: 800, height: 600, right: 900, bottom: 650, x: 100, y: 50, toJSON() {} })
    root.getBoundingClientRect = () => ({ left: 648, top: 62, width: 240, height: 210, right: 888, bottom: 272, x: 648, y: 62, toJSON() {} })
    firePointer(wrapper.find('.pixel-navigator__header').element, 'pointerdown', { clientX: 660, clientY: 70 })
    // 第一帧没有真实位移时必须保持原 left/top，防止定位祖先与拖动父级原点不一致导致左上闪跳。
    firePointer(window, 'pointermove', { clientX: 660, clientY: 70 })
    await wrapper.vm.$nextTick()
    expect(root.getAttribute('style')).toContain('left: 548px')
    expect(root.getAttribute('style')).toContain('top: 12px')
    firePointer(window, 'pointermove', { clientX: 500, clientY: 170 })
    firePointer(window, 'pointerup', { clientX: 500, clientY: 170 })
    let saved = JSON.parse(window.localStorage.getItem('pixel-studio:navigator-layout'))
    expect(saved.x).toBe(388)
    expect(saved.y).toBe(112)

    root.getBoundingClientRect = () => ({ left: 388, top: 112, width: 320, height: 260, right: 708, bottom: 372, x: 388, y: 112, toJSON() {} })
    resizeCallback()
    saved = JSON.parse(window.localStorage.getItem('pixel-studio:navigator-layout'))
    expect(saved.width).toBe(320)
    expect(saved.height).toBe(260)
  })
})
