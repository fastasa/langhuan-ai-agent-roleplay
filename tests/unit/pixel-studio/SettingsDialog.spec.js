/** @vitest-environment jsdom */
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import SettingsDialog from '../../../src/pixel-studio/ui/SettingsDialog.vue'

describe('像素中控台快捷键设置', () => {
  it('图层切换动作可见、显示默认键位并可重新绑定', async () => {
    const wrapper = mount(SettingsDialog, { props: { keymap: {} } })
    expect(wrapper.findAll('.settings-group__title').map((item) => item.text())).toContain('图层')

    const rows = wrapper.findAll('.settings-row')
    const previous = rows.find((row) => row.text().includes('切换到上一个图层'))
    const next = rows.find((row) => row.text().includes('切换到下一个图层'))
    expect(previous?.text()).toContain('Shift+A')
    expect(next?.text()).toContain('Shift+S')

    await previous.trigger('click')
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', altKey: true, cancelable: true }))
    await wrapper.vm.$nextTick()
    expect(previous.text()).toContain('Alt+P')
    await wrapper.find('.pixel-dialog__primary').trigger('click')
    expect(wrapper.emitted('save')[0][0]['layer.previous']).toEqual({ key: 'p', ctrl: false, shift: false, alt: true })
  })

  it('可选择长按 Alt 临时工具，默认吸管并随保存事件一并提交', async () => {
    const wrapper = mount(SettingsDialog, { props: { keymap: {} } })
    const select = wrapper.find('.settings-select')
    expect(select.element.value).toBe('eyedropper')
    await select.setValue('eraser')
    await wrapper.find('.pixel-dialog__primary').trigger('click')
    expect(wrapper.emitted('save')[0][1]).toBe('eraser')
    wrapper.unmount()
  })
})
