export function buildWorkspaceShellControllerDerivedState(state: {
  filteredTickets: unknown
  currentMessages: unknown
  currentChatTitle: unknown
  currentAlias: unknown
  currentScene: unknown
  loadedSummaryItems: unknown
  chatPanelViewModel: unknown
  settingsPanelViewModel: unknown
  taskPanelMeta: unknown
  filteredAtCharacters: unknown
  filteredTasks: unknown
  ungroupedCharacters: unknown
  loadedSummaryCount: unknown
  currentCharacter: unknown
  currentCharacterAvatar: unknown
}) {
  return {
    filteredTickets: state.filteredTickets,
    currentMessages: state.currentMessages,
    currentChatTitle: state.currentChatTitle,
    currentAlias: state.currentAlias,
    currentScene: state.currentScene,
    loadedSummaryItems: state.loadedSummaryItems,
    chatPanelViewModel: state.chatPanelViewModel,
    settingsPanelViewModel: state.settingsPanelViewModel,
    taskPanelMeta: state.taskPanelMeta,
    filteredAtCharacters: state.filteredAtCharacters,
    filteredTasks: state.filteredTasks,
    ungroupedCharacters: state.ungroupedCharacters,
    loadedSummaryCount: state.loadedSummaryCount,
    currentCharacter: state.currentCharacter,
    currentCharacterAvatar: state.currentCharacterAvatar
  }
}
