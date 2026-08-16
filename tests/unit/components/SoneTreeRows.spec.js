/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import SoneTreeRows from '../../../src/components/app/SoneTreeRows.vue'

afterEach(() => {
  document.body.innerHTML = ''
})

function rect({ left = 0, top = 0, width = 160, height = 24 }) {
  return {
    left,
    right: left + width,
    top,
    bottom: top + height,
    width,
    height,
    x: left,
    y: top,
    toJSON: () => ({})
  }
}

function waitForAnimationFrame() {
  return new Promise((resolve) => window.requestAnimationFrame(() => resolve()))
}

describe('SoneTreeRows', () => {
  it('keeps measured group links and sticky stack shell active', async () => {
    const wrapper = mount(SoneTreeRows, {
      attachTo: document.body,
      props: {
        rows: [
          { id: 'root-a', label: '根组一', depth: 0, kind: 'folder', open: true, groupRunId: '__root__' },
          { id: 'root-b', label: '根组二', depth: 0, kind: 'folder', open: false, groupRunId: '__root__' },
          { id: 'leaf-a', label: '子桠一', depth: 1, kind: 'document', groupRunId: 'root-a' },
          { id: 'leaf-b', label: '子桠二', depth: 1, kind: 'document', groupRunId: 'root-a' }
        ]
      }
    })

    await wrapper.vm.$nextTick()

    const root = wrapper.find('.sidebar-tree-rows').element
    root.getBoundingClientRect = () => rect({ width: 220, height: 120 })
    const rows = Array.from(root.querySelectorAll('.sidebar-tree-rows__row'))
    rows.forEach((row, index) => {
      const top = index * 28
      row.getBoundingClientRect = () => rect({ top, width: 180, height: 24 })
      const toggle = row.querySelector('.doc-sidebar-row-toggle')
      toggle.getBoundingClientRect = () => rect({ top: top + 2, width: 20, height: 20 })
    })

    window.dispatchEvent(new Event('resize'))
    await waitForAnimationFrame()
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.sidebar-tree-rows__group-links').exists()).toBe(true)
    expect(wrapper.findAll('.sidebar-tree-rows__group-link').length).toBeGreaterThan(0)
    expect(document.body.querySelector('.sone-tree-sticky-stack')).toBeTruthy()

    wrapper.unmount()
  })

  it('opens the selected row menu from the wider selected background area', async () => {
    const wrapper = mount(SoneTreeRows, {
      attachTo: document.body,
      props: {
        rows: [
          { id: 'row-1', label: '第一枝', depth: 0, kind: 'folder', selected: true, hasMenu: true },
          { id: 'row-2', label: '第二桠', depth: 1, kind: 'document', selected: true, hasMenu: false }
        ]
      }
    })

    await wrapper.vm.$nextTick()

    const root = wrapper.find('.sidebar-tree-rows').element
    Object.defineProperty(root, 'clientWidth', { configurable: true, value: 240 })
    root.getBoundingClientRect = () => ({
      left: 0,
      right: 240,
      top: 0,
      bottom: 80,
      width: 240,
      height: 80,
      x: 0,
      y: 0,
      toJSON: () => ({})
    })

    const rows = root.querySelectorAll('.sidebar-tree-rows__row')
    rows[0].getBoundingClientRect = () => ({
      left: 0,
      right: 120,
      top: 0,
      bottom: 26,
      width: 120,
      height: 26,
      x: 0,
      y: 0,
      toJSON: () => ({})
    })
    rows[1].getBoundingClientRect = () => ({
      left: 0,
      right: 120,
      top: 26,
      bottom: 50,
      width: 120,
      height: 24,
      x: 0,
      y: 26,
      toJSON: () => ({})
    })

    await root.dispatchEvent(new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      clientX: 210,
      clientY: 38
    }))

    expect(wrapper.emitted('menu')?.[0]?.[0]).toBe('row-1')

    await rows[1].dispatchEvent(new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      clientX: 40,
      clientY: 38
    }))

    expect(wrapper.emitted('menu')?.[1]?.[0]).toBe('row-1')

    wrapper.unmount()
  })

  it('renders nested submenus with the same base menu class as the first-level menu', async () => {
    const wrapper = mount(SoneTreeRows, {
      attachTo: document.body,
      props: {
        rows: [{
          id: 'row-1',
          label: '测试枝桠',
          depth: 0,
          kind: 'folder',
          hasMenu: true,
          menuOpen: true,
          menuItems: [{
            key: 'export-markdown',
            label: '导出',
            action: 'export-markdown',
            children: [
              {
                key: 'export-body-markdown',
                label: '导出正文',
                action: 'export-body-markdown',
                children: [
                  { key: 'copy-json', label: '导到剪贴板', action: 'copy-json' },
                  { key: 'export-json', label: '导成文件', action: 'export-json' }
                ]
              }
            ]
          }]
        }],
        menuStyle: {
          position: 'fixed',
          left: '120px',
          top: '80px',
          width: '210px'
        }
      }
    })

    const parentItem = document.body.querySelector('.sidebar-tree-rows__row-menu-item')
    expect(parentItem).toBeTruthy()
    await parentItem.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }))
    await parentItem.click()
    await wrapper.vm.$nextTick()

    const submenu = document.body.querySelector('.sidebar-tree-rows__row-submenu')
    expect(submenu).toBeTruthy()
    expect(submenu.classList.contains('sidebar-tree-rows__row-menu')).toBe(true)
    expect(submenu.textContent).toContain('导出正文')

    const submenuItem = Array.from(document.body.querySelectorAll('.sidebar-tree-rows__row-menu-item'))
      .find((item) => item.textContent?.includes('导出正文'))
    expect(submenuItem).toBeTruthy()
    await submenuItem.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }))
    await submenuItem.click()
    await wrapper.vm.$nextTick()

    const submenus = document.body.querySelectorAll('.sidebar-tree-rows__row-submenu')
    expect(submenus.length).toBe(2)
    expect(submenus[1].classList.contains('sidebar-tree-rows__row-menu')).toBe(true)
    expect(submenus[1].textContent).toContain('导到剪贴板')
    expect(submenus[1].textContent).toContain('导成文件')

    wrapper.unmount()
  })

  it('shows compile page warning dots next to the unit label', () => {
    const wrapper = mount(SoneTreeRows, {
      attachTo: document.body,
      props: {
        rows: [{
          id: 'row-1',
          label: '待补齐单位',
          depth: 0,
          kind: 'document',
          compilePageIndicator: {
            missing: true,
            error: true,
            title: '编译页缺失字段；编译页存在错误'
          }
        }]
      }
    })

    expect(wrapper.find('.sone-tree-compile-indicator--missing').exists()).toBe(true)
    expect(wrapper.find('.sone-tree-compile-indicator--error').exists()).toBe(true)
    expect(wrapper.find('.sone-tree-compile-indicators').attributes('title')).toBe('编译页缺失字段；编译页存在错误')

    wrapper.unmount()
  })

  it('shows a pending review light next to pending unit rows', () => {
    const wrapper = mount(SoneTreeRows, {
      attachTo: document.body,
      props: {
        rows: [{
          id: 'row-1',
          label: '待确认灵魂',
          depth: 0,
          kind: 'document',
          pendingIndicator: {
            title: '自动写入待确认'
          }
        }]
      }
    })

    expect(wrapper.find('.sone-tree-pending-indicator').exists()).toBe(true)
    expect(wrapper.find('.sone-tree-pending-indicator').attributes('title')).toBe('自动写入待确认')

    wrapper.unmount()
  })
})
