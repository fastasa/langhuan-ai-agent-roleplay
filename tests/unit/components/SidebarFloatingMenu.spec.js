/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import SidebarFloatingMenu from '../../../src/components/common/SidebarFloatingMenu.vue'

afterEach(() => {
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('SidebarFloatingMenu', () => {
  it('clamps an actually tall menu into the viewport', async () => {
    Object.defineProperty(window, 'innerWidth', { value: 360, configurable: true })
    Object.defineProperty(window, 'innerHeight', { value: 220, configurable: true })

    const wrapper = mount(SidebarFloatingMenu, {
      attachTo: document.body,
      props: {
        open: true,
        clampToViewport: true,
        viewportPadding: 12,
        menuStyle: {
          position: 'fixed',
          left: '260px',
          top: '150px',
          width: '184px'
        }
      },
      slots: {
        default: '<button style="display:block;height:260px;width:184px">菜单项</button>'
      }
    })

    const menu = document.body.querySelector('.sidebar-floating-menu-shell')
    expect(menu).toBeTruthy()
    vi.spyOn(menu, 'getBoundingClientRect').mockReturnValue({
      left: 260,
      top: 150,
      right: 444,
      bottom: 410,
      width: 184,
      height: 260,
      x: 260,
      y: 150,
      toJSON: () => ({})
    })

    window.dispatchEvent(new Event('resize'))
    await nextTick()
    await nextTick()

    expect(menu.style.left).toBe('164px')
    expect(menu.style.top).toBe('12px')
    expect(menu.style.maxHeight).toBe('196px')
    expect(menu.style.overflowY).toBe('auto')

    wrapper.unmount()
  })

  it('moves a bottom anchored menu upward instead of clipping the final action', async () => {
    Object.defineProperty(window, 'innerWidth', { value: 450, configurable: true })
    Object.defineProperty(window, 'innerHeight', { value: 300, configurable: true })

    const wrapper = mount(SidebarFloatingMenu, {
      attachTo: document.body,
      props: {
        open: true,
        clampToViewport: true,
        viewportPadding: 12,
        menuStyle: {
          position: 'fixed',
          left: '180px',
          top: '230px',
          width: '184px'
        }
      },
      slots: {
        default: Array.from({ length: 6 }, (_, index) => (
          `<button style="display:block;height:32px;width:184px">菜单项 ${index + 1}</button>`
        )).join('')
      }
    })

    const menu = document.body.querySelector('.sidebar-floating-menu-shell')
    expect(menu).toBeTruthy()
    vi.spyOn(menu, 'getBoundingClientRect').mockReturnValue({
      left: 180,
      top: 230,
      right: 364,
      bottom: 422,
      width: 184,
      height: 192,
      x: 180,
      y: 230,
      toJSON: () => ({})
    })

    Object.defineProperty(menu, 'scrollHeight', { value: 192, configurable: true })
    window.dispatchEvent(new Event('resize'))
    await nextTick()
    await nextTick()

    expect(menu.style.top).toBe('96px')
    expect(menu.style.maxHeight).toBe('192px')
    expect(menu.style.overflowY).toBe('visible')

    wrapper.unmount()
  })

  it('removes estimated max height when visible overflow is required for nested menus', async () => {
    Object.defineProperty(window, 'innerWidth', { value: 450, configurable: true })
    Object.defineProperty(window, 'innerHeight', { value: 320, configurable: true })

    const wrapper = mount(SidebarFloatingMenu, {
      attachTo: document.body,
      props: {
        open: true,
        clampToViewport: true,
        viewportOverflow: 'visible',
        viewportPadding: 12,
        menuStyle: {
          position: 'fixed',
          left: '180px',
          top: '230px',
          width: '184px',
          maxHeight: '120px',
          overflowY: 'auto'
        }
      },
      slots: {
        default: Array.from({ length: 6 }, (_, index) => (
          `<button style="display:block;height:32px;width:184px">菜单项 ${index + 1}</button>`
        )).join('')
      }
    })

    const menu = document.body.querySelector('.sidebar-floating-menu-shell')
    expect(menu).toBeTruthy()
    vi.spyOn(menu, 'getBoundingClientRect').mockReturnValue({
      left: 180,
      top: 230,
      right: 364,
      bottom: 422,
      width: 184,
      height: 192,
      x: 180,
      y: 230,
      toJSON: () => ({})
    })

    Object.defineProperty(menu, 'scrollHeight', { value: 192, configurable: true })
    window.dispatchEvent(new Event('resize'))
    await nextTick()
    await nextTick()

    expect(menu.style.top).toBe('116px')
    expect(menu.style.maxHeight).toBe('none')
    expect(menu.style.overflow).toBe('visible')

    wrapper.unmount()
  })
})
