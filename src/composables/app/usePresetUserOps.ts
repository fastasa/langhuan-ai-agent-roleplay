import { computed } from 'vue'

export function usePresetUserOps({
  settingStore,
  charStore,
  userForm,
  showUserEditor,
  workspaceBootSession,
  presetSceneFilter,
  editingPresetIndex,
  promptPresetForm,
  showPromptPresetEditor,
  openConfirmDialog,
  toast
}: any) {
  const filteredPresets = computed(() => {
    if (!presetSceneFilter.value) return settingStore.promptPresets
    return settingStore.promptPresets.filter((p: any) => p.scene === presetSceneFilter.value)
  })

  async function persistFreshBootSnapshot() {
    try {
      await workspaceBootSession?.persistBootSnapshot?.()
    } catch (error) {
      console.warn('刷新用户资料启动缓存失败:', error)
    }
  }

  async function saveUserProfile() {
    try {
      await charStore.updateUserProfile({ ...userForm })
      await persistFreshBootSnapshot()
      showUserEditor.value = false
      toast('用户资料已保存', 'success')
    } catch (error: any) {
      toast(`用户资料保存失败: ${error?.message || error}`, 'error')
    }
  }

  async function handleUserSave(form: any) {
    Object.assign(userForm, form)
    try {
      await charStore.updateUserProfile({ ...userForm })
      await persistFreshBootSnapshot()
      showUserEditor.value = false
      toast('用户资料已保存', 'success')
    } catch (error: any) {
      toast(`用户资料保存失败: ${error?.message || error}`, 'error')
    }
  }

  function getOriginalIndex(filteredIndex: number) {
    const filtered = filteredPresets.value
    const preset = filtered[filteredIndex]
    return settingStore.promptPresets.indexOf(preset)
  }

  function resetPresetToDefault() {
    const runReset = async () => {
      try {
        await settingStore.resetPromptPresets()
        presetSceneFilter.value = ''
        toast('预设已恢复默认', 'success')
      } catch (error: any) {
        toast(`预设恢复失败: ${error?.message || error}`, 'error')
      }
    }

    if (typeof openConfirmDialog === 'function') {
      openConfirmDialog('恢复默认预设', '这会覆盖当前所有预设，确定继续吗？', runReset)
      return
    }

    runReset()
  }

  function editPromptPreset(index: number) {
    editingPresetIndex.value = index
    const preset = settingStore.promptPresets[index]
    Object.assign(promptPresetForm, preset)
    showPromptPresetEditor.value = true
  }

  function addPromptPreset() {
    editingPresetIndex.value = -1
    Object.assign(promptPresetForm, { name: '', role: 'system', content: '', enabled: true, scene: '', frequency: '' })
    showPromptPresetEditor.value = true
  }

  async function savePromptPresetEdit() {
    try {
      if (editingPresetIndex.value >= 0) {
        await settingStore.updatePromptPreset(editingPresetIndex.value, { ...promptPresetForm })
      } else {
        await settingStore.addPromptPreset({ ...promptPresetForm })
      }
      showPromptPresetEditor.value = false
      toast('预设项已保存', 'success')
    } catch (error: any) {
      toast(`预设保存失败: ${error?.message || error}`, 'error')
    }
  }

  async function togglePromptPresetEnabled(index: number) {
    const preset = settingStore.promptPresets[index]
    if (!preset) return
    const nextEnabled = !preset.enabled
    preset.enabled = nextEnabled
    await settingStore.updatePromptPreset(index, { enabled: nextEnabled })
  }

  let dragPresetIndex = -1
  function dragPresetStart(index: number, event: any) {
    dragPresetIndex = index
    event.dataTransfer.effectAllowed = 'move'
  }

  async function dragPresetDrop(targetIndex: number) {
    if (dragPresetIndex < 0 || dragPresetIndex === targetIndex) return
    const items = [...settingStore.promptPresets]
    const [removed] = items.splice(dragPresetIndex, 1)
    items.splice(targetIndex, 0, removed)
    items.forEach((item, index) => {
      item.orderIndex = index
    })
    settingStore.promptPresets = items
    await settingStore.savePromptPresetOrder()
    dragPresetIndex = -1
  }

  return {
    filteredPresets,
    saveUserProfile,
    handleUserSave,
    getOriginalIndex,
    resetPresetToDefault,
    editPromptPreset,
    addPromptPreset,
    savePromptPresetEdit,
    togglePromptPresetEnabled,
    dragPresetStart,
    dragPresetDrop
  }
}
