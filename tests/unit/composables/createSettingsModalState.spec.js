import { ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { createSettingsModalState } from '../../../src/composables/app/modalState/createSettingsModalState.ts'

describe('createSettingsModalState', () => {
  it('会把角色分组作为可直接消费的数组暴露给弹窗，并能直接按正式角色数据统计成员', () => {
    const getCharactersByGroup = vi.fn(() => undefined)
    const state = createSettingsModalState({
      appState: {
        showTTSConfig: ref(false),
        showAffectionConfig: ref(false),
        showCharGroupManager: ref(true),
        newGroupEmoji: ref('📁'),
        newGroupName: ref('')
      },
      stores: {
        settingStore: {
          ttsConfig: {},
          affectionChangeRate: 0,
          affectionApiConfig: {},
          apiPresets: [],
          saveEnvironment: vi.fn()
        },
        charStore: {
          characterGroups: [
            { id: 'default', name: '默认', emoji: '👤' },
            { id: 'group_1', name: '亚什基诺', emoji: '📁' }
          ],
          characters: [
            { id: 'char_1', name: '星依', groupId: 'group_1' },
            { id: 'char_2', name: '塞西莉亚', group: 'group_1' }
          ],
          deleteCharGroup: vi.fn()
        }
      },
      characterOps: {
        editCharGroup: vi.fn(),
        addNewCharGroup: vi.fn()
      },
      uiHelpers: {
        getCharactersByGroup
      }
    })

    expect(Array.isArray(state.viewModel.characterGroups)).toBe(true)
    expect(state.viewModel.characterGroups).toHaveLength(1)
    expect(state.viewModel.characterGroups[0].id).toBe('group_1')
    expect(typeof state.viewModel.getCharactersByGroup).toBe('function')
    const groupMembers = state.viewModel.getCharactersByGroup('group_1')
    expect(groupMembers).toHaveLength(2)
    expect(groupMembers.map((item) => item.name)).toEqual(['星依', '塞西莉亚'])
    const defaultMembers = state.viewModel.getCharactersByGroup('default')
    expect(Array.isArray(defaultMembers)).toBe(true)
    expect(getCharactersByGroup).toHaveBeenCalledWith('default')
  })
})
