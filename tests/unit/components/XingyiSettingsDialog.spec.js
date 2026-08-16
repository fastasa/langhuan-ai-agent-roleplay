/**
 * @vitest-environment jsdom
 */
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import XingyiSettingsDialog from '../../../src/components/app/XingyiSettingsDialog.vue'
import { i18n } from '../../../src/i18n'

i18n.global.locale.value = 'zh'

const AppModalShellStub = {
  props: ['open', 'title'],
  emits: ['close'],
  template: '<section v-if="open" class="modal-stub"><slot /></section>'
}

describe('XingyiSettingsDialog · 桌宠显示偏好', () => {
  it('日记设置关闭时仍可独立切换桌宠', async () => {
    const wrapper = mount(XingyiSettingsDialog, {
      props: { open: true, desktopPetVisible: true, showDiarySettings: false },
      global: { plugins: [i18n], stubs: { AppModalShell: AppModalShellStub } }
    })

    expect(wrapper.text()).toContain('桌面桌宠')
    expect(wrapper.text()).not.toContain('日记视角')
    await wrapper.get('input[aria-label="桌面桌宠"]').setValue(false)
    expect(wrapper.emitted('update:desktop-pet-visible')).toEqual([[false]])
  })

  it('日记设置开启时，桌宠开关与日记开关是两项独立设置', () => {
    const wrapper = mount(XingyiSettingsDialog, {
      props: { open: true, desktopPetVisible: false, showDiarySettings: true },
      global: { plugins: [i18n], stubs: { AppModalShell: AppModalShellStub } }
    })

    expect(wrapper.text()).toContain('桌面桌宠')
    expect(wrapper.text()).toContain('日记视角')
    expect(wrapper.findAll('input[type="checkbox"]')).toHaveLength(2)
  })
})
