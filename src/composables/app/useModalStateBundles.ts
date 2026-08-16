import { createUtilityModalState } from './modalState/createUtilityModalState'
import { createSettingsModalState } from './modalState/createSettingsModalState'
import { createRoleModalState } from './modalState/createRoleModalState'
import { createCharacterEditorModalState } from './modalState/createCharacterEditorModalState'
import { createPromptPresetModalState } from './modalState/createPromptPresetModalState'
import { createFullscreenModalState } from './modalState/createFullscreenModalState'

export function useModalStateBundles(params: any) {
  const appState = params.appState
  const stores = params.stores
  const ticketOps = params.ticketOps
  const tagOps = params.tagOps
  const transactionActions = params.transactionActions || {}
  const characterOps = params.characterOps
  const derived = params.derived
  const uiHelpers = params.uiHelpers

  const utilityModalState = createUtilityModalState({
    appState,
    stores,
    ticketOps,
    tagOps,
    transactionActions,
    uiHelpers,
    timerComposable: params.timerComposable,
    notificationSupported: params.notificationSupported,
    notificationPermission: params.notificationPermission,
    requestNotificationPermission: params.requestNotificationPermission
  })
  const settingsModalState = createSettingsModalState({
    appState,
    stores,
    characterOps,
    uiHelpers,
    settingEnvironmentService: params.settingEnvironmentService
  })
  const roleModalState = createRoleModalState({ appState, stores, characterOps, derived, getWeatherEmoji: params.getWeatherEmoji })
  const characterEditorModalState = createCharacterEditorModalState({ appState, stores, characterOps, derived, uiHelpers })
  const promptPresetModalState = createPromptPresetModalState({
    appState,
    settingStore: stores.settingStore,
    savePromptPresetEdit: params.savePromptPresetEdit
  })
  const fullscreenModalState = createFullscreenModalState({ appState })

  return {
    utilityModalState,
    settingsModalState,
    roleModalState,
    characterEditorModalState,
    promptPresetModalState,
    fullscreenModalState
  }
}
