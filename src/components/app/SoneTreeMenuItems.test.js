import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { afterEach, describe, expect, it } from 'vitest'
import SoneTreeMenuItems from './SoneTreeMenuItems.vue'

function mockRect(element, rect) {
  element.getBoundingClientRect = () => ({
    x: rect.left,
    y: rect.top,
    top: rect.top,
    left: rect.left,
    right: rect.right,
    bottom: rect.bottom,
    width: rect.right - rect.left,
    height: rect.bottom - rect.top,
    toJSON: () => ({})
  })
}

describe('SoneTreeMenuItems', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('moves submenus upward when the hovered item is near the viewport bottom', async () => {
    Object.defineProperty(window, 'innerWidth', { value: 900, configurable: true })
    Object.defineProperty(window, 'innerHeight', { value: 650, configurable: true })

    const wrapper = mount(SoneTreeMenuItems, {
      attachTo: document.body,
      props: {
        rowId: 'row:bottom',
        items: [
          {
            key: 'export',
            label: '导出 Markdown',
            action: 'export-markdown',
            children: [
              { key: 'raw', label: '原始文本', action: 'copy-json' },
              { key: 'compile', label: '携带编译页提示词', action: 'copy-compile' }
            ]
          }
        ]
      }
    })

    const entry = wrapper.find('.sidebar-tree-rows__row-menu-entry').element
    mockRect(entry, {
      top: 620,
      bottom: 650,
      left: 200,
      right: 384
    })

    await wrapper.find('.sidebar-tree-rows__row-menu-entry').trigger('mouseenter')
    await nextTick()

    const submenu = wrapper.find('.sidebar-tree-rows__row-submenu').element
    mockRect(submenu, {
      top: 620,
      bottom: 760,
      left: 383,
      right: 593
    })
    Object.defineProperty(submenu, 'scrollHeight', { value: 140, configurable: true })
    Object.defineProperty(submenu, 'scrollWidth', { value: 210, configurable: true })

    await wrapper.find('.sidebar-tree-rows__row-menu-entry').trigger('mouseenter')
    await nextTick()

    expect(submenu.style.top).toBe('-118px')
    expect(submenu.style.left).toBe('calc(100% + 1px)')
    expect(submenu.style.right).toBe('auto')
  })

  it('opens submenus to the left when the right side does not have room', async () => {
    Object.defineProperty(window, 'innerWidth', { value: 500, configurable: true })
    Object.defineProperty(window, 'innerHeight', { value: 650, configurable: true })

    const wrapper = mount(SoneTreeMenuItems, {
      attachTo: document.body,
      props: {
        rowId: 'row:right-edge',
        items: [
          {
            key: 'relation',
            label: '关系整合材料',
            action: 'compact-relation',
            children: [
              { key: 'v1', label: 'v1', action: 'compact-relation-v1' },
              { key: 'v2', label: 'v2', action: 'compact-relation-v2' }
            ]
          }
        ]
      }
    })

    const entry = wrapper.find('.sidebar-tree-rows__row-menu-entry').element
    mockRect(entry, {
      top: 120,
      bottom: 150,
      left: 260,
      right: 444
    })

    await wrapper.find('.sidebar-tree-rows__row-menu-entry').trigger('mouseenter')
    await nextTick()

    const submenu = wrapper.find('.sidebar-tree-rows__row-submenu').element
    mockRect(submenu, {
      top: 120,
      bottom: 220,
      left: 443,
      right: 653
    })
    Object.defineProperty(submenu, 'scrollHeight', { value: 100, configurable: true })
    Object.defineProperty(submenu, 'scrollWidth', { value: 210, configurable: true })

    await wrapper.find('.sidebar-tree-rows__row-menu-entry').trigger('mouseenter')
    await nextTick()

    expect(submenu.style.left).toBe('auto')
    expect(submenu.style.right).toBe('calc(100% + 1px)')
  })
})
