export function createPromptPresetModalState({
  appState,
  settingStore,
  savePromptPresetEdit
}: any) {
  return {
    showPromptPresetEditor: appState.showPromptPresetEditor,
    promptPresetForm: appState.promptPresetForm,
    viewModel: {
      isLockedPromptPresetId: settingStore.isLockedPromptPresetId
    },
    savePromptPresetEdit
  }
}
