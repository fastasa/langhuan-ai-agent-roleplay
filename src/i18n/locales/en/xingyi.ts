/** Xingyi dock namespace (batch 6, src/app gray zone): XingyiDock UI shell + slash command descriptions.
 *  ⚠️ Xingyi persona lines (thinking / failure replies / placeholder) keep a cute, casual voice. */
export const xingyi = {
  title: 'Xingyi',
  thinking: 'Xingyi is thinking…',
  autoApproveOn: 'Auto-approve',
  autoApproveOff: 'Confirm writes',
  autoApproveOnHint: 'Now: writes are auto-approved, no confirmation card (tap or Shift+Tab to switch back)',
  autoApproveOffHint: 'Now: writes pop a confirmation card first (tap or Shift+Tab to switch to auto-approve)',
  autoApproveGlyphOn: 'A',
  autoApproveGlyphOff: 'C',
  confirmExecute: 'Confirm & run',
  noMatchCommand: 'No matching command',
  resumeTitle: 'Past chats',
  resumeEmpty: 'No past chats yet',
  untitledConversation: 'Untitled chat',
  deleteConversation: 'Delete this chat',
  deleteConversationWarn: 'Deleting removes it and its messages permanently — cannot be undone.',
  deleteConversationFailed: 'Aww… failed to delete this chat, mind trying again in a bit?',
  currentSessionMark: 'Current · ',
  messageCount: '{count} msgs',
  inputPlaceholder: 'Say something to Xingyi… (/ for commands)',
  activitySearching: 'Xingyi is looking things up ({tool})…',
  activityWorking: 'Xingyi is working on it ({tool})…',
  newChatFailed: 'Aww… failed to start a new chat, mind trying again in a bit?',
  resumeFailed: 'Aww… failed to restore that past chat, mind trying again in a bit?',
  emptyReply: 'Aww… Xingyi has nothing to say this round, ask me once more?',
  errorReply: 'Something went wrong on Xingyi’s side: {detail}',
  statusIdle: 'Idle',
  statusRunning: 'Working',
  statusWaiting: 'Waiting for you',
  statusError: 'Error',
  // Collapsed global entry & agent task panel (2026-07-10 Xingyi UI rework, absorbs the old top-right notice lamp)
  statusSuccess: 'Done',
  launcherAria: 'Open the Xingyi dock',
  emptyHint: 'Anything Xingyi can help with? Type / for commands.',
  taskDetail: 'Task details',
  taskGoConfirm: 'Go confirm',
  taskDismiss: 'Dismiss task notice',
  // Dock-private dark toggle (2026-07-11): reskins the dock window only, global theme untouched
  dockThemeToDark: 'Dock: switch to dark',
  dockThemeToLight: 'Dock: switch to light',
  // Stop button (2026-07-13): shown only while a turn is running; interrupts Xingyi's current turn + dispatched subagents (map/research)
  stopTurn: 'Stop',
  // Xingyi-dispatched subagent run card copy for the correction-round card kind (map protocol & run-card plan, batch 1, 2026-07-11)
  dispatchTidiaoLabel: 'Director',
  dispatchTidiaoVerb: 'Correcting',
  dispatchTidiaoFallbackTitle: 'Correction task',
  // askUser card archiving (2026-07-11): confirmed cards persist as conversation records instead of vanishing
  askArchiveTitle: '[Confirmation card]',
  askDismissedAnswer: '(Card dismissed without an answer)',
  // Image upload in the input box (2026-07-11 batch 5, dock wiring): placeholder text used for storage/bubble when only images are sent, no caption
  imageOnlyPlaceholder: '[Image]',
  // Optimistic image sending (2026-07-11): shown when the optimistic bubble's background upload/send ultimately failed
  sendFailedHint: 'Might not have sent — try refreshing in a bit',
  // Huiyu draft confirmation card's "view draft on the map" entry (map draft sketch visualization plan batch 3, 2026-07-12)
  viewDraftOnMap: 'View draft on the map',
  // Xingyi settings are local-workspace preferences.
  xingyiSettingsAria: 'Xingyi settings',
  xingyiSettingsTitle: 'Xingyi settings',
  desktopPetLabel: 'Desktop pet',
  desktopPetHint: 'Keeps the chat launcher available when the pet is hidden.',
  diaryViewpointLabel: 'Diary viewpoint',
  diaryViewpointXingyi: 'Xingyi first-person',
  diaryViewpointObjective: 'Third-person objective',
  diaryViewpointLoading: 'Loading settings…',
  diaryViewpointSaving: 'Saving…',
  diaryViewpointLoadFailed: 'Failed to load viewpoint: {detail}',
  diaryViewpointSaveFailed: 'Failed to save viewpoint: {detail}',
  diaryGenerateNow: 'Generate today’s diary now',
  diaryGenerating: 'Generating…',
  diaryGenerateSuccess: 'Generated {dateStr}.md',
  diaryGenerateFailed: 'Generation failed: {detail}',
  slash: {
    clearDesc: 'Clear the current conversation context and start a new chat',
    resumeDesc: 'Browse and restore past conversations',
    modelDesc: 'Switch this conversation model and reasoning effort',
    diaryDesc: 'Generate today’s Xingyi diary'
  }
}
