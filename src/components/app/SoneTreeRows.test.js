import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import SoneTreeRows from './SoneTreeRows.vue'

describe('SoneTreeRows', () => {
  it('applies inherited class to the real tree root', () => {
    const wrapper = mount(SoneTreeRows, {
      attrs: {
        class: 'role-brain-tree'
      },
      props: {
        rows: []
      }
    })

    expect(wrapper.find('.sidebar-tree-rows').classes()).toContain('role-brain-tree')
  })

  it('uses the exact right-clicked row as the menu host even when another row is selected', async () => {
    const wrapper = mount(SoneTreeRows, {
      props: {
        rows: [
          {
            id: 'folder:organization',
            label: '组织架构',
            depth: 3,
            kind: 'folder',
            selected: true
          },
          {
            id: 'document:exchange',
            label: '交流会',
            depth: 3,
            kind: 'document',
            active: true
          }
        ]
      }
    })

    await wrapper.findAll('.sidebar-tree-rows__row')[1].trigger('contextmenu')

    expect(wrapper.emitted('menu')?.[0]?.[0]).toBe('document:exchange')
  })

  it('keeps active rows out of multi-select background blocks', async () => {
    const wrapper = mount(SoneTreeRows, {
      props: {
        rows: [
          {
            id: 'document:active',
            label: '当前单位',
            depth: 1,
            kind: 'document',
            active: true
          },
          {
            id: 'document:selected-a',
            label: '选中一',
            depth: 1,
            kind: 'document',
            selected: true
          },
          {
            id: 'document:selected-b',
            label: '选中二',
            depth: 1,
            kind: 'document',
            selected: true
          }
        ]
      }
    })

    await wrapper.vm.$nextTick()
    await new Promise((resolve) => requestAnimationFrame(resolve))
    await wrapper.vm.$nextTick()

    expect(wrapper.findAll('.sidebar-tree-rows__selection-block')).toHaveLength(1)

    wrapper.unmount()
  })

  it('renders a continuous selection as a single background block', async () => {
    const wrapper = mount(SoneTreeRows, {
      props: {
        rows: [
          {
            id: 'document:selected-a',
            label: '选中一',
            depth: 1,
            kind: 'document',
            selected: true
          },
          {
            id: 'document:selected-b',
            label: '选中二',
            depth: 1,
            kind: 'document',
            selected: true
          },
          {
            id: 'document:selected-c',
            label: '选中三',
            depth: 1,
            kind: 'document',
            selected: true
          }
        ]
      }
    })

    await wrapper.vm.$nextTick()
    await new Promise((resolve) => requestAnimationFrame(resolve))
    await wrapper.vm.$nextTick()

    expect(wrapper.findAll('.sidebar-tree-rows__selection-block')).toHaveLength(1)

    wrapper.unmount()
  })
})
