import type { NamedEntity } from '../../types/panelContracts'

export function buildWorkspaceShellControllerUiHelpers(ui: {
  toast: (...args: unknown[]) => unknown
  abortChat: () => unknown
  getDisplayedMessageContent: (index: number) => string
  getGoldTicketCount: () => number
  openCategoryEditor: () => unknown
  handleConfirmClick: () => unknown
  openConfirmDialog?: (title: string, message: string, onConfirm: () => void, options?: Record<string, unknown>) => unknown
  handlePromptSubmit?: () => unknown
  openPromptDialog?: (options: {
    title: string
    message?: string
    inputLabel?: string
    placeholder?: string
    confirmText?: string
    initialValue?: string
    validator?: (value: string) => string
    onConfirm: (value: string) => void
  }) => unknown
  closePromptDialog?: () => unknown
  confirmDialog?: Record<string, unknown>
  toggleGroupCollapse: (groupId?: string) => unknown
  getCharactersByGroup: (groupId?: string) => NamedEntity[]
  formatChatText: (value: string) => string
}) {
  return {
    toast: ui.toast,
    abortChat: ui.abortChat,
    getDisplayedMessageContent: ui.getDisplayedMessageContent,
    getGoldTicketCount: ui.getGoldTicketCount,
    openCategoryEditor: ui.openCategoryEditor,
    handleConfirmClick: ui.handleConfirmClick,
    openConfirmDialog: ui.openConfirmDialog,
    handlePromptSubmit: ui.handlePromptSubmit,
    openPromptDialog: ui.openPromptDialog,
    closePromptDialog: ui.closePromptDialog,
    confirmDialog: ui.confirmDialog,
    toggleGroupCollapse: ui.toggleGroupCollapse,
    getCharactersByGroup: ui.getCharactersByGroup,
    formatChatText: ui.formatChatText
  }
}
