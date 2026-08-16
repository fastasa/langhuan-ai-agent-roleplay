import { reactive, ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { createRoleModalState } from '../../../src/composables/app/modalState/createRoleModalState.ts'

describe('createRoleModalState', () => {
  it('会话编辑弹窗读取最新角色分组，而不是保留装载前的旧数组引用', () => {
    const editCharacter = vi.fn()
    const showCharacterEditor = ref(false)
    const charStore = reactive({
      aliases: [],
      userProfile: {},
      characters: [{ id: 'char_jingyu', name: '惊雨', groupId: 'chargrp_ashkino' }],
      characterGroups: []
    })

    const state = createRoleModalState({
      appState: {
        showCrowdEditor: ref(false),
        editingCrowdId: ref(null),
        crowdForm: reactive({}),
        showCurtainPanel: ref(false),
        curtainFocusMessageId: ref(0),
        showPromptLogPanel: ref(false),
        promptLogFocusMessageId: ref(0),
        showSceneEditor: ref(false),
        sceneForm: reactive({}),
        showAliasEditor: ref(false),
        editingAliasId: ref(null),
        aliasForm: reactive({}),
        showAliasSelector: ref(false),
        showCreateGroup: ref(false),
        editingGroupId: ref(null),
        groupForm: reactive({}),
        showGroupEditor: ref(false),
        showCharacterEditor,
        groupEditForm: reactive({})
      },
      stores: {
        settingStore: { apiPresets: [] },
        chatStore: { getCurrentSession: vi.fn(() => null) },
        charStore
      },
      characterOps: { editCharacter },
      derived: {
        currentScene: ref(null),
        currentAlias: ref(null),
        currentBoundAlias: ref(null),
        currentTargetId: ref('')
      },
      getWeatherEmoji: vi.fn()
    })

    const initialGroups = state.characterGroups
    const loadedGroups = [{ id: 'chargrp_ashkino', name: '亚什基诺', emoji: '📁' }]
    charStore.characterGroups = loadedGroups

    expect(state.characterGroups).not.toBe(initialGroups)
    expect(state.characterGroups).toStrictEqual(loadedGroups)
    expect(state.characterGroups[0].name).toBe('亚什基诺')
    expect(state.editCharacter).toBe(editCharacter)
    expect(state.showCharacterEditor).toBe(showCharacterEditor)
  })
})
