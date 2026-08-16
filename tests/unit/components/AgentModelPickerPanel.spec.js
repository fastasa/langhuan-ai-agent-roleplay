/**
 * @vitest-environment jsdom
 */
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import AgentModelPickerPanel from '../../../src/components/app/AgentModelPickerPanel.vue'
import { useSettingStore } from '../../../src/stores/settingStore.ts'
import { i18n } from '../../../src/i18n'

i18n.global.locale.value = 'zh'

describe('AgentModelPickerPanel', () => {
  let pinia

  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    const store = useSettingStore()
    const preset = { name: 'Claude 本机', providerType: 'claude-code' }
    store.apiPresets = [preset]
    store.defaultPreset = preset
    store.agentModelConfigs[0].modelUsageConfigs = store.agentModelConfigs[0].modelUsageConfigs.map((item) => ({
      ...item,
      presetName: 'Claude 本机',
      model: `${item.id}-model`
    }))
  })

  it('上下键切书童/校书/掌阁，左右键切当前模型支持的努力程度', async () => {
    const wrapper = mount(AgentModelPickerPanel, {
      props: { modelValue: { slotId: 'smart', effort: '' } },
      global: { plugins: [pinia, i18n] }
    })

    expect(wrapper.findAll('.agent-model-picker__model').map((item) => item.text()))
      .toEqual(expect.arrayContaining([
        expect.stringContaining('书童'),
        expect.stringContaining('校书'),
        expect.stringContaining('掌阁')
      ]))

    wrapper.vm.handleKeydown(new KeyboardEvent('keydown', { key: 'ArrowUp' }))
    expect(wrapper.emitted('update:modelValue').at(-1)).toEqual([{ slotId: 'balanced', effort: '' }])

    await wrapper.setProps({ modelValue: { slotId: 'smart', effort: '' } })
    wrapper.vm.handleKeydown(new KeyboardEvent('keydown', { key: 'ArrowRight' }))
    expect(wrapper.emitted('update:modelValue').at(-1)).toEqual([{ slotId: 'smart', effort: 'low' }])
  })
})
