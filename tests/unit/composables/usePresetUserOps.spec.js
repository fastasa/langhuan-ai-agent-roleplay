import { describe, expect, it, vi } from 'vitest'
import { reactive, ref } from 'vue'

import { usePresetUserOps } from '../../../src/composables/app/usePresetUserOps.ts'

describe('usePresetUserOps', () => {
  function createOps(overrides = {}) {
    const userForm = reactive({
      displayName: '新昵称',
      name: '用户',
      desc: '刷新后还在',
      avatarPath: 'avatars/user_profile_saved.png'
    })
    const showUserEditor = ref(true)
    const persistBootSnapshot = vi.fn(async () => {})
    const updateUserProfile = vi.fn(async () => ({
      ok: true,
      name: '用户',
      desc: '刷新后还在',
      avatarPath: 'avatars/user_profile_saved.png',
      user: { id: 'local', displayName: '新昵称' }
    }))
    const toast = vi.fn()
    const ops = usePresetUserOps({
      settingStore: { promptPresets: [] },
      charStore: { updateUserProfile },
      userForm,
      showUserEditor,
      workspaceBootSession: { persistBootSnapshot },
      presetSceneFilter: ref(''),
      editingPresetIndex: ref(-1),
      promptPresetForm: reactive({}),
      showPromptPresetEditor: ref(false),
      openConfirmDialog: vi.fn(),
      toast,
      ...overrides
    })
    return { ops, userForm, showUserEditor, persistBootSnapshot, updateUserProfile, toast }
  }

  it('refreshes the boot snapshot after saving user profile', async () => {
    const { ops, showUserEditor, persistBootSnapshot, updateUserProfile } = createOps()

    await ops.handleUserSave({
      displayName: '新昵称',
      name: '用户',
      desc: '刷新后还在',
      avatarPath: 'avatars/user_profile_saved.png'
    })

    expect(updateUserProfile).toHaveBeenCalledWith(expect.objectContaining({
      displayName: '新昵称',
      name: '用户',
      desc: '刷新后还在'
    }))
    expect(persistBootSnapshot).toHaveBeenCalled()
    expect(showUserEditor.value).toBe(false)
  })
})
