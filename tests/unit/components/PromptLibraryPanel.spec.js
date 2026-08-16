/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import PromptLibraryPanel from '../../../src/components/PromptLibraryPanel.vue'
import { useSettingStore } from '../../../src/stores/settingStore.ts'
import {
  SCENARIO_MOUNTED_PROMPTS_PLACEHOLDER,
  SCENARIO_MOUNTED_PROMPTS_PLACEHOLDER_PRESET_ID
} from '../../../src/app/scenarioMountedPromptPlaceholder.ts'

function mountPanel() {
  return mount(PromptLibraryPanel, {
    global: {
      stubs: {
        SidebarFloatingMenu: {
          template: '<div v-if="open"><slot /></div>',
          props: ['open']
        },
        AppFormDialog: {
          template: '<div v-if="open"><slot /><slot name="actions" /></div>',
          props: ['open']
        },
        AppConfirmDialog: {
          template: `
            <div v-if="open" data-testid="confirm-dialog">
              <p data-testid="confirm-message">{{ message }}</p>
              <button data-testid="confirm-cancel" @click="$emit('cancel')">取消</button>
              <button data-testid="confirm-submit" @click="$emit('confirm')">删除</button>
            </div>
          `,
          props: ['open', 'title', 'message', 'confirmText', 'tone']
        }
      }
    }
  })
}

describe('PromptLibraryPanel', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true })))
  })

  it('删除提示词前必须先打开二次确认弹窗', async () => {
    const store = useSettingStore()
    vi.spyOn(store, 'ensureBuiltinPromptPresets').mockResolvedValue()
    store.promptPresets = [{
      id: 'prompt_1',
      name: '可删除提示词',
      content: '内容',
      role: 'system',
      scene: 'chat',
      frequency: 'always',
      enabled: true,
      orderIndex: 0
    }]

    const wrapper = mountPanel()
    await wrapper.find('.prompt-library__secondary-btn--danger').trigger('click')

    expect(wrapper.find('[data-testid="confirm-dialog"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="confirm-message"]').text()).toContain('可删除提示词')
    expect(store.promptPresets).toHaveLength(1)

    await wrapper.find('[data-testid="confirm-cancel"]').trigger('click')
    expect(wrapper.find('[data-testid="confirm-dialog"]').exists()).toBe(false)
    expect(store.promptPresets).toHaveLength(1)
  })

  it('确认删除后才移除提示词', async () => {
    const store = useSettingStore()
    vi.spyOn(store, 'ensureBuiltinPromptPresets').mockResolvedValue()
    store.promptPresets = [{
      id: 'prompt_1',
      name: '可删除提示词',
      content: '内容',
      role: 'system',
      scene: 'chat',
      frequency: 'always',
      enabled: true,
      orderIndex: 0
    }]

    const wrapper = mountPanel()
    await wrapper.find('.prompt-library__secondary-btn--danger').trigger('click')
    await wrapper.find('[data-testid="confirm-submit"]').trigger('click')

    expect(store.promptPresets).toHaveLength(0)
    expect(wrapper.find('[data-testid="confirm-dialog"]').exists()).toBe(false)
  })

  it('打开提示词库时会补齐情境挂载公共占位', async () => {
    const store = useSettingStore()
    store.promptPresets = []

    mountPanel()
    await flushPromises()

    const placeholder = store.promptPresets.find((preset) => preset.id === SCENARIO_MOUNTED_PROMPTS_PLACEHOLDER_PRESET_ID)
    expect(placeholder).toEqual(expect.objectContaining({
      name: '情境挂载提示词（占位）',
      role: 'placeholder',
      content: SCENARIO_MOUNTED_PROMPTS_PLACEHOLDER
    }))
  })
})
