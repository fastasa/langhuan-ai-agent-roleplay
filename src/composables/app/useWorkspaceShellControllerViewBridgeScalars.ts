import {
  getWeatherIcon,
  getWeatherEmoji,
  formatDateOnly,
  formatTimeOnly,
  formatObsTime
} from '../../utils/environmentFormat'

type WorkspaceShellControllerBaseScalarsInput = {
  shellSupport: {
    sections: unknown
    sidebarOpen: unknown
  }
  workspaceRuntime: {
    workspaceKernel: unknown
    workspaceCommandRegistry: unknown
    workspaceRuntimeStore: unknown
    isBootLoading: unknown
    localArchiveActionState: unknown
  }
  appState: {
    currentTicketCategory: unknown
    currentApiPresetIndex: unknown
    apiPresetForm: unknown
    showEditApiPreset: unknown
    currentTaskTab: unknown
    customTags: unknown
    importFileInput: unknown
    fullscreenImage: unknown
    showWeatherDetail: unknown
    showPromptLogPanel: unknown
    promptLogFocusMessageId: unknown
    chatSummaryWriting: unknown
    chatSummaryWritingText: unknown
    showSessionTemporaryCharactersPanel: unknown
    localArchiveAvailable: unknown
    localArchiveName: unknown
    localArchiveLabel: unknown
    localArchiveNote: unknown
    isLoadingModels: unknown
    isTestingApi: unknown
    modelList: unknown
    presetSceneFilter: unknown
    showPresetVars: unknown
  }
  resourceStore: unknown
  charStore: unknown
  chatStore: unknown
  settingStore: unknown
  taskStore: unknown
  timerComposable: unknown
  localArchiveSync: unknown
}

type WorkspaceShellControllerLocalArchiveScalarsInput = {
  appState: WorkspaceShellControllerBaseScalarsInput['appState']
  opsHub: {
    localArchiveSaves: unknown
    selectedLocalArchiveSlot: unknown
    selectedSyncModules: unknown
    localArchiveModuleDefinitions: unknown
    localArchiveCommands: unknown
    openLocalArchive: unknown
    initializeLocalArchive: unknown
    loadLocalArchiveSaves: unknown
    setSelectedSyncModules: unknown
    selectLocalArchiveSave: unknown
  }
  workspaceRuntime: WorkspaceShellControllerBaseScalarsInput['workspaceRuntime']
}

type WorkspaceShellControllerApiScalarsInput = {
  appState: WorkspaceShellControllerBaseScalarsInput['appState']
  opsHub: {
    filteredPresets: unknown
    getOriginalIndex: unknown
    resetPresetToDefault: unknown
    dragPresetStart: unknown
    dragPresetDrop: unknown
    editPromptPreset: unknown
    togglePromptPresetEnabled: unknown
    addPromptPreset: unknown
    exportAllData: unknown
  }
  apiPresetManager: {
    loadApiPreset: unknown
    addNewApiPreset: unknown
    loadModels: unknown
    testApiConnection: unknown
  }
}

type WorkspaceShellControllerFormattingScalarsInput = {
  openCurtainPanel: unknown
  openPromptLogPanel: unknown
  openSceneEditor: unknown
  openAliasSelector: unknown
}

type WorkspaceShellControllerViewBridgeScalarsContext = {
  boot: WorkspaceShellControllerBaseScalarsInput
  domains: {
    apiPresetManager: WorkspaceShellControllerApiScalarsInput['apiPresetManager']
    characterManagement: WorkspaceShellControllerFormattingScalarsInput
  }
  opsHub: WorkspaceShellControllerLocalArchiveScalarsInput['opsHub'] & WorkspaceShellControllerApiScalarsInput['opsHub']
}

function buildWorkspaceShellControllerBaseScalars({ shellSupport, workspaceRuntime, appState, resourceStore, charStore, chatStore, settingStore, taskStore, timerComposable, localArchiveSync }: WorkspaceShellControllerBaseScalarsInput) {
  return {
    workspaceKernel: workspaceRuntime.workspaceKernel,
    workspaceCommandRegistry: workspaceRuntime.workspaceCommandRegistry,
    workspaceRuntimeStore: workspaceRuntime.workspaceRuntimeStore,
    sections: shellSupport.sections,
    settingStore,
    charStore,
    chatStore,
    taskStore,
    resourceStore,
    timerComposable,
    localArchiveSync,
    currentTicketCategory: appState.currentTicketCategory,
    isBootLoading: workspaceRuntime.isBootLoading,
    currentApiPresetIndex: appState.currentApiPresetIndex,
    apiPresetForm: appState.apiPresetForm,
    showEditApiPreset: appState.showEditApiPreset,
    currentTaskTab: appState.currentTaskTab,
    customTags: appState.customTags,
    importFileInput: appState.importFileInput,
    fullscreenImage: appState.fullscreenImage,
    sidebarOpen: shellSupport.sidebarOpen,
    showWeatherDetail: appState.showWeatherDetail,
    showPromptLogPanel: appState.showPromptLogPanel,
    promptLogFocusMessageId: appState.promptLogFocusMessageId,
    chatSummaryWriting: appState.chatSummaryWriting,
    chatSummaryWritingText: appState.chatSummaryWritingText,
    showSessionTemporaryCharactersPanel: appState.showSessionTemporaryCharactersPanel
  }
}

function buildWorkspaceShellControllerLocalArchiveScalars({ appState, opsHub, workspaceRuntime }: WorkspaceShellControllerLocalArchiveScalarsInput) {
  return {
    localArchiveAvailable: appState.localArchiveAvailable,
    localArchiveName: appState.localArchiveName,
    localArchiveLabel: appState.localArchiveLabel,
    localArchiveNote: appState.localArchiveNote,
    localArchiveSaves: opsHub.localArchiveSaves,
    selectedLocalArchiveSlot: opsHub.selectedLocalArchiveSlot,
    selectedSyncModules: opsHub.selectedSyncModules,
    localArchiveModuleDefinitions: opsHub.localArchiveModuleDefinitions,
    localArchiveCommands: opsHub.localArchiveCommands,
    localArchiveActionState: workspaceRuntime.localArchiveActionState,
    openLocalArchive: opsHub.openLocalArchive,
    initializeLocalArchive: opsHub.initializeLocalArchive,
    loadLocalArchiveSaves: opsHub.loadLocalArchiveSaves,
    setSelectedSyncModules: opsHub.setSelectedSyncModules,
    selectLocalArchiveSave: opsHub.selectLocalArchiveSave
  }
}

function buildWorkspaceShellControllerApiScalars({ appState, opsHub, apiPresetManager }: WorkspaceShellControllerApiScalarsInput) {
  return {
    isLoadingModels: appState.isLoadingModels,
    isTestingApi: appState.isTestingApi,
    modelList: appState.modelList,
    presetSceneFilter: appState.presetSceneFilter,
    filteredPresets: opsHub.filteredPresets,
    getOriginalIndex: opsHub.getOriginalIndex,
    loadApiPreset: apiPresetManager.loadApiPreset,
    addNewApiPreset: apiPresetManager.addNewApiPreset,
    loadModels: apiPresetManager.loadModels,
    testApiConnection: apiPresetManager.testApiConnection,
    showPresetVars: appState.showPresetVars,
    resetPresetToDefault: opsHub.resetPresetToDefault,
    dragPresetStart: opsHub.dragPresetStart,
    dragPresetDrop: opsHub.dragPresetDrop,
    editPromptPreset: opsHub.editPromptPreset,
    togglePromptPresetEnabled: opsHub.togglePromptPresetEnabled,
    addPromptPreset: opsHub.addPromptPreset,
    exportAllData: opsHub.exportAllData
  }
}

function buildWorkspaceShellControllerFormattingScalars(characterManagement: WorkspaceShellControllerFormattingScalarsInput) {
  return {
    openCurtainPanel: characterManagement.openCurtainPanel,
    openPromptLogPanel: characterManagement.openPromptLogPanel,
    // 帷幕场景设置 / 马甲选择直达入口：供移动端帷幕抽屉复用桌面同一套弹窗与写入链路
    openSceneEditor: characterManagement.openSceneEditor,
    openAliasSelector: characterManagement.openAliasSelector,
    formatDateOnly,
    formatTimeOnly,
    formatObsTime,
    getWeatherIcon,
    getWeatherEmoji
  }
}

export function buildWorkspaceShellControllerViewBridgeScalars(ctx: WorkspaceShellControllerViewBridgeScalarsContext) {
  const { boot, domains, opsHub } = ctx
  const {
    resourceStore,
    charStore,
    chatStore,
    settingStore,
    taskStore,
    timerComposable,
    localArchiveSync,
    appState,
    shellSupport,
    workspaceRuntime
  } = boot
  const { apiPresetManager, characterManagement } = domains

  return {
    ...buildWorkspaceShellControllerBaseScalars({
      shellSupport,
      workspaceRuntime,
      appState,
      resourceStore,
      charStore,
      chatStore,
      settingStore,
      taskStore,
      timerComposable,
      localArchiveSync
    }),
    ...buildWorkspaceShellControllerLocalArchiveScalars({ appState, opsHub, workspaceRuntime }),
    ...buildWorkspaceShellControllerApiScalars({ appState, opsHub, apiPresetManager }),
    ...buildWorkspaceShellControllerFormattingScalars(characterManagement)
  }
}
