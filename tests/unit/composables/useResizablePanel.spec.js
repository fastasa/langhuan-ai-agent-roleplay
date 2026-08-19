/**
 * @vitest-environment jsdom
 */
import { mount } from '@vue/test-utils'
import { defineComponent, nextTick } from 'vue'
import { beforeEach, describe, expect, it } from 'vitest'
import { useResizablePanel } from '../../../src/composables/app/useResizablePanel.ts'

const STORAGE_KEY = 'test_sidebar_width'

function mountPanel() {
  return mount(defineComponent({
    setup() {
      return useResizablePanel({
        storageKey: STORAGE_KEY,
        defaultWidth: 334,
        minWidth: 160,
        maxWidth: 630
      })
    },
    template: '<aside :style="panelStyle"></aside>'
  }))
}

describe('useResizablePanel initial width', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('keeps the configured default when no stored width exists', async () => {
    const wrapper = mountPanel()
    await nextTick()

    expect(wrapper.vm.width).toBe(334)
    expect(wrapper.get('aside').attributes('style')).toContain('width: 334px')
  })

  it('still restores a real user-saved width', async () => {
    window.localStorage.setItem(STORAGE_KEY, '412')
    const wrapper = mountPanel()
    await nextTick()

    expect(wrapper.vm.width).toBe(412)
    expect(wrapper.get('aside').attributes('style')).toContain('width: 412px')
  })
})
