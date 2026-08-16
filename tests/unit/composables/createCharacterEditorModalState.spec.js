import { reactive, ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { createCharacterEditorModalState } from '../../../src/composables/app/modalState/createCharacterEditorModalState.ts'

describe('createCharacterEditorModalState', () => {
  it('派生角色为空时，会按编辑表单中的角色 id 解析当前角色', () => {
    const state = createCharacterEditorModalState({
      appState: {
        showAddCharacter: ref(false),
        newCharForm: reactive({}),
        showCharacterEditor: ref(true),
        charEditForm: reactive({ id: 'char-1', name: '小依' }),
        showDetailSettings: ref(false),
        affectionLocked: ref(true),
        newNicknameInput: ref(''),
        showScheduleEditor: ref(false),
        weekDays: [],
        collapsedDays: reactive({}),
        timeOptions: [],
        showCopySlotDialog: ref(false),
        copyingSlot: ref(null),
        copyTargetDays: ref([]),
        copyingFromDay: ref(''),
        showRelationshipEditor: ref(false),
        newRelationshipTarget: ref(''),
        showYearlyScheduleEditor: ref(false),
        showActivitiesEditor: ref(false),
        newActivityInput: ref(''),
        showLocationsEditor: ref(false),
        newLocationInput: ref('')
      },
      stores: {
        settingStore: { apiPresets: [], updateApiPreset: vi.fn() },
        charStore: {
          characterGroups: [],
          characters: [{ id: 'char-1', name: '小依' }],
          getCharacter: vi.fn((id) => (id === 'char-1' ? { id: 'char-1', name: '小依' } : null))
        }
      },
      characterOps: {},
      derived: {
        currentCharacter: ref(null),
        activeCharacter: ref(null)
      }
    })

    expect(state.currentCharacter.value).toEqual(expect.objectContaining({ id: 'char-1', name: '小依' }))
  })
})
