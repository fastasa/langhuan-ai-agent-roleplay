export function buildWorkspaceShellControllerReturnContext(ctx: any) {
  const { boot, composition } = ctx
  const {
    settingStore,
    toastVisible,
    toastMessage,
    toastType,
    appState,
    shellSupport,
    workspaceRuntime,
    uiHelpers
  } = boot

  return {
    settingStore,
    toastVisible,
    toastMessage,
    toastType,
    timerCompleteVisible: uiHelpers.timerCompleteVisible,
    timerCompleteTicketName: uiHelpers.timerCompleteTicketName,
    timerCompleteMessage: uiHelpers.timerCompleteMessage,
    timerCompleteTitle: uiHelpers.timerCompleteTitle,
    timerCompleteType: uiHelpers.timerCompleteType,
    closeTimerCompleteModal: uiHelpers.closeTimerCompleteModal,
    // agentTaskNotice 读侧已退役（2026-07-10）：展示层收编进星依浮坞，XingyiDock 直读 useWorkspaceRuntimeStore()；
    // 业务写侧（start/update/complete/failAgentTaskNotice）仍走视图桥拿同一 store，不受影响。
    desktopState: composition.desktopState,
    utilityModalState: composition.utilityModalState,
    showUserEditor: appState.showUserEditor,
    userForm: appState.userForm,
    handleUserSave: composition.handleUserSave,
    characterEditorModalState: composition.characterEditorModalState,
    settingsModalState: composition.settingsModalState,
    roleModalState: composition.roleModalState,
    chatManageModalState: composition.chatManageModalState,
    promptPresetModalState: composition.promptPresetModalState,
    fullscreenModalState: composition.fullscreenModalState,
    workspaceLoadingStage: workspaceRuntime.workspaceLoadingStage,
    workspaceLoadingMessage: workspaceRuntime.workspaceLoadingMessage
  }
}
