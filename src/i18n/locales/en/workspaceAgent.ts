/** Shared workspace-agent shell namespace (2026-07-17 map/script workspace agent plan batch A):
 *  common shell copy for scriptwriter/cartographer; identity/scope labels are data-driven, not hardcoded here. */
export const workspaceAgent = {
  sendButton: 'Send',
  stopButton: 'Stop',
  newConversation: 'New conversation',
  historyMenu: 'History',
  collapsePanel: 'Collapse {name} chat',
  expandPanel: 'Expand {name} chat',
  historyEmpty: 'No past conversations yet',
  inputPlaceholder: 'Say something…',
  emptyMessages: 'No messages yet — say something to start',
  modelSlashDescription: 'Switch this conversation model and reasoning effort',
  modelPickerTitle: 'Conversation model',
  modelPickerKeyboardHint: '↑↓ model · ←→ effort',
  modelPickerModelLabel: 'Agent model',
  modelPickerEffortLabel: 'Effort',
  modelPickerFollowPreset: 'Use slot preset',
  modelPickerDefaultEffort: 'Default',
  modelPickerDefaultEffortWithValue: 'Default ({effort})',
  modelPickerSlotEffortWithValue: 'Follow slot ({effort})',
  modelSlot: {
    fast: 'Page',
    balanced: 'Editor',
    smart: 'Curator'
  },
  historyLoadFailed: 'Could not load chat history. Reopen this workspace to retry.',
  scopeUnavailable: 'No professional workspace is available yet.',
  inputDisabledPlaceholder: 'Set up a workspace to start chatting',
  statusIdle: 'Ready',
  statusRunning: 'Thinking',
  statusWaiting: 'Waiting for confirmation',
  statusUnavailable: 'Not ready',
  thinking: 'Thinking…',
  confirmFeedbackPlaceholder: 'Want changes? Describe them here…',
  feedbackButton: 'Send feedback',
  confirmButton: 'Confirm',
  cancelButton: 'Cancel'
}
