function createCurrentCharacterBridge(derived: any, appState: any, stores: any) {
  return {
    get value() {
      const directCharacter = derived?.currentCharacter?.value || derived?.activeCharacter?.value || null
      if (directCharacter) return directCharacter

      const formId = String(appState?.charEditForm?.id || '').trim()
      if (formId && typeof stores?.charStore?.getCharacter === 'function') {
        const byId = stores.charStore.getCharacter(formId)
        if (byId) return byId
      }

      const formName = String(appState?.charEditForm?.name || '').trim()
      if (formName && Array.isArray(stores?.charStore?.characters)) {
        return stores.charStore.characters.find((item: any) => item?.name === formName) || null
      }

      return null
    }
  }
}

export function createCharacterEditorModalState({
  appState,
  stores,
  characterOps,
  derived,
  uiHelpers
}: any) {
  const safeNoop = () => {}
  const safeFn = (fn: any) => (typeof fn === 'function' ? fn : safeNoop)

  return {
    showAddCharacter: appState.showAddCharacter,
    newCharForm: appState.newCharForm,
    viewModel: {
      get apiPresets() { return stores.settingStore.apiPresets },
      updateApiPreset: stores.settingStore.updateApiPreset,
      get characterGroups() { return stores.charStore.characterGroups },
      getCharacter: stores.charStore.getCharacter
    },
    addNewCharacter: safeFn(characterOps?.addNewCharacter),
    toast: safeFn(uiHelpers?.toast),
    handleNewCharacterAvatarUpload: safeFn(characterOps?.handleNewCharacterAvatarUpload),
    importCharacterJson: safeFn(characterOps?.importCharacterJson),
    exportCharacterJsonTemplate: safeFn(characterOps?.exportCharacterJsonTemplate),
    showCharacterEditor: appState.showCharacterEditor,
    currentCharacter: createCurrentCharacterBridge(derived, appState, stores),
    charEditForm: appState.charEditForm,
    handleAvatarUpload: safeFn(characterOps?.handleAvatarUpload),
    showDetailSettings: appState.showDetailSettings,
    affectionLocked: appState.affectionLocked,
    getAffectionDesc: safeFn(characterOps?.getAffectionDesc),
    removeNickname: safeFn(characterOps?.removeNickname),
    newNicknameInput: appState.newNicknameInput,
    addNickname: safeFn(characterOps?.addNickname),
    showScheduleEditor: appState.showScheduleEditor,
    weekDays: appState.weekDays,
    collapsedDays: appState.collapsedDays,
    toggleDayCollapse: safeFn(characterOps?.toggleDayCollapse),
    timeOptions: appState.timeOptions,
    openCopySlotDialog: safeFn(characterOps?.openCopySlotDialog),
    removeScheduleSlot: safeFn(characterOps?.removeScheduleSlot),
    addScheduleSlot: safeFn(characterOps?.addScheduleSlot),
    showCopySlotDialog: appState.showCopySlotDialog,
    copyingSlot: appState.copyingSlot,
    copyTargetDays: appState.copyTargetDays,
    copyingFromDay: appState.copyingFromDay,
    confirmCopySlot: safeFn(characterOps?.confirmCopySlot),
    showRelationshipEditor: appState.showRelationshipEditor,
    removeRelationship: safeFn(characterOps?.removeRelationship),
    newRelationshipTarget: appState.newRelationshipTarget,
    getAvailableRelationTargets: safeFn(characterOps?.getAvailableRelationTargets),
    addRelationship: safeFn(characterOps?.addRelationship),
    showYearlyScheduleEditor: appState.showYearlyScheduleEditor,
    removeYearlyEntry: safeFn(characterOps?.removeYearlyEntry),
    addYearlyEntry: safeFn(characterOps?.addYearlyEntry),
    showActivitiesEditor: appState.showActivitiesEditor,
    removeActivity: safeFn(characterOps?.removeActivity),
    newActivityInput: appState.newActivityInput,
    addActivity: safeFn(characterOps?.addActivity),
    showLocationsEditor: appState.showLocationsEditor,
    removeLocation: safeFn(characterOps?.removeLocation),
    newLocationInput: appState.newLocationInput,
    addLocation: safeFn(characterOps?.addLocation),
    exportCurrentCharacterJson: safeFn(characterOps?.exportCurrentCharacterJson),
    deleteCurrentCharacter: safeFn(characterOps?.deleteCurrentCharacter),
    saveCharacterEdit: safeFn(characterOps?.saveCharacterEdit)
  }
}
