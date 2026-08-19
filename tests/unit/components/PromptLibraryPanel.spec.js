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

  it('长正文交给浏览器原生粘贴并留在 DOM 缓冲，保存时完整读取', async () => {
    const store = useSettingStore()
    vi.spyOn(store, 'ensureBuiltinPromptPresets').mockResolvedValue()
    const updateSpy = vi.spyOn(store, 'updatePromptPreset').mockResolvedValue()
    store.promptPresets = [{
      id: 'prompt_long',
      name: '长提示词',
      content: '旧正文',
      role: 'system',
      scene: 'chat',
      frequency: 'always',
      enabled: true,
      orderIndex: 0
    }]

    const wrapper = mountPanel()
    await flushPromises()
    const textarea = wrapper.find('.prompt-library__textarea')
    textarea.element.setSelectionRange(0, textarea.element.value.length)
    const pastedText = `${'长提示词正文\n'.repeat(20_000)}结束`
    const pasteEvent = new Event('paste', { bubbles: true, cancelable: true })
    Object.defineProperty(pasteEvent, 'clipboardData', {
      value: { getData: vi.fn((type) => type === 'text/plain' ? pastedText : '') }
    })

    textarea.element.dispatchEvent(pasteEvent)
    expect(pasteEvent.defaultPrevented).toBe(false)

    // jsdom 不执行浏览器的默认粘贴动作，这里补上原生 textarea 随后产生的 value/input。
    textarea.element.value = pastedText
    await textarea.trigger('input')
    await wrapper.vm.$nextTick()

    expect(textarea.element.value).toHaveLength(pastedText.length)
    expect(textarea.element.value.startsWith('长提示词正文\n')).toBe(true)
    expect(textarea.element.value.endsWith('结束')).toBe(true)
    expect(wrapper.find('.prompt-library__primary-btn').attributes('disabled')).toBeUndefined()

    await wrapper.find('.prompt-library__primary-btn').trigger('click')
    await flushPromises()
    const savedContent = updateSpy.mock.calls[0]?.[1]?.content || ''
    expect(savedContent).toHaveLength(pastedText.length)
    expect(savedContent.startsWith('长提示词正文\n')).toBe(true)
    expect(savedContent.endsWith('结束')).toBe(true)
  })
})
