export function buildWorkspaceShellControllerRuntimeState(state: {
  streamingText: unknown
  currentStreamingSpeakerName: unknown
  currentStreamingTargetId: unknown
  environmentNarrationLoading: unknown
  plannedGroupSpeakers: unknown
  editingMessageIndex: unknown
  editingMessageContent: unknown
  regeneratingMessageIndex: unknown
  mentionSelectedChars: unknown
  mentionExcludedChars: unknown
  runtimeTransactions: unknown
  transactionExecuting: unknown
  hasTaskTimeline: unknown
  getTaskTimelineNodes: (task: unknown) => unknown
  isRequestingTask: unknown
  expandedTaskId: unknown
  customMarkType: unknown
  customMarkNote: unknown
  newTaskName: unknown
  newTaskDesc: unknown
  newTaskReward: unknown
  newTaskCategory: unknown
  newTaskBonus: unknown
  taskAssignerChar: unknown
  taskLoadContact: unknown
  newCharForm: unknown
  charGroupEditForm: unknown
  editingGroupId: unknown
  groupForm: unknown
  groupEditForm: unknown
  showGroupEditor: unknown
  sceneForm: unknown
  editingCrowdId: unknown
  crowdForm: unknown
  showAddCharacter: unknown
  showCharGroupManager: unknown
  showCreateGroup: unknown
  showCrowdEditor: unknown
  showChatSummary: unknown
  showConversationManager: unknown
  showPromptPresetEditor: unknown
  showUserEditor: unknown
  showSpendMoney: unknown
  clearCurrentChat: () => unknown
  requestClearCurrentChatContext: () => void | Promise<void>
  addMentionChar: (charId: string) => unknown
  removeMentionChar: (index: number) => unknown
  toggleExcludeChar: (charId: string) => unknown
  togglePlusMenu: () => unknown
  startEditMessage: (index: number) => unknown
  cancelEditMessage: () => unknown
  saveEditMessage: () => unknown
  saveAndRegenerate: () => unknown
  // 批次5b：导演模式纠偏继续/取消/输入。
  updateCorrectionText?: (text: string) => unknown
  continueCorrection?: () => unknown
  cancelCorrection?: () => unknown
  deleteMessage: (index: number) => unknown
  selectMessageVersion: (index: number, nextIndex: number) => unknown
  copyMessage: (index: number) => unknown
  toggleMessagePromptVisibility?: (index: number) => unknown
  regenerateMsg: (index: number, mode?: 'recall' | 'prompt_replay', directorOptions?: { instruction?: string }) => unknown
  // 批次 M3：提调式锚定精修（持久输入框触发，按楼层引用「角色N/旁白M（含范围/多目标）」精改会话消息）。
  applyDirectorPrecisionEdits?: (refsText: string, options?: { correctionText?: string; anchorMessageId?: number }) => unknown
  sidebarOpen: unknown
  collapsedGroups: unknown
  editCharacter: (target?: unknown) => unknown
  showCharacterEditor: unknown
  showCurtainPanel: unknown
  showAliasSelector: unknown
  setMessagesAreaRef: (element: unknown) => unknown
  chatStickToBottom: unknown
  plusMenuOpen: unknown
  atMenuOpen: unknown
  chatInputText: unknown
  onInputChatText: (value: string) => unknown
  setMenuContainerRef: (element: unknown) => unknown
  setChatInputRef: (element: unknown) => unknown
  operationDetail: unknown
  // 图片附件（输入框图片上传计划批4）：与 chatInputText 同层同源，ChatInputBar 哑组件经此六件套接线。
  pendingImageAttachments: unknown
  handleImageAttachmentPaste: (event: unknown) => unknown
  handleImageAttachmentDrop: (event: unknown) => unknown
  handleImageAttachmentDragOver: (event: unknown) => unknown
  removeImageAttachment: (id: string) => unknown
  retryImageAttachmentUpload: (id: string) => unknown
}) {
  return {
    streamingText: state.streamingText,
    currentStreamingSpeakerName: state.currentStreamingSpeakerName,
    currentStreamingTargetId: state.currentStreamingTargetId,
    environmentNarrationLoading: state.environmentNarrationLoading,
    plannedGroupSpeakers: state.plannedGroupSpeakers,
    editingMessageIndex: state.editingMessageIndex,
    editingMessageContent: state.editingMessageContent,
    regeneratingMessageIndex: state.regeneratingMessageIndex,
    mentionSelectedChars: state.mentionSelectedChars,
    mentionExcludedChars: state.mentionExcludedChars,
    runtimeTransactions: state.runtimeTransactions,
    transactionExecuting: state.transactionExecuting,
    hasTaskTimeline: state.hasTaskTimeline,
    getTaskTimelineNodes: state.getTaskTimelineNodes,
    isRequestingTask: state.isRequestingTask,
    expandedTaskId: state.expandedTaskId,
    customMarkType: state.customMarkType,
    customMarkNote: state.customMarkNote,
    newTaskName: state.newTaskName,
    newTaskDesc: state.newTaskDesc,
    newTaskReward: state.newTaskReward,
    newTaskCategory: state.newTaskCategory,
    newTaskBonus: state.newTaskBonus,
    taskAssignerChar: state.taskAssignerChar,
    taskLoadContact: state.taskLoadContact,
    newCharForm: state.newCharForm,
    charGroupEditForm: state.charGroupEditForm,
    editingGroupId: state.editingGroupId,
    groupForm: state.groupForm,
    groupEditForm: state.groupEditForm,
    showGroupEditor: state.showGroupEditor,
    sceneForm: state.sceneForm,
    editingCrowdId: state.editingCrowdId,
    crowdForm: state.crowdForm,
    showAddCharacter: state.showAddCharacter,
    showCharGroupManager: state.showCharGroupManager,
    showCreateGroup: state.showCreateGroup,
    showCrowdEditor: state.showCrowdEditor,
    showChatSummary: state.showChatSummary,
    showConversationManager: state.showConversationManager,
    showPromptPresetEditor: state.showPromptPresetEditor,
    showUserEditor: state.showUserEditor,
    showSpendMoney: state.showSpendMoney,
    clearCurrentChat: state.clearCurrentChat,
    requestClearCurrentChatContext: state.requestClearCurrentChatContext,
    addMentionChar: state.addMentionChar,
    removeMentionChar: state.removeMentionChar,
    toggleExcludeChar: state.toggleExcludeChar,
    togglePlusMenu: state.togglePlusMenu,
    startEditMessage: state.startEditMessage,
    cancelEditMessage: state.cancelEditMessage,
    saveEditMessage: state.saveEditMessage,
    saveAndRegenerate: state.saveAndRegenerate,
    // 批次5b：导演模式纠偏继续/取消/输入。
    updateCorrectionText: state.updateCorrectionText,
    continueCorrection: state.continueCorrection,
    cancelCorrection: state.cancelCorrection,
    deleteMessage: state.deleteMessage,
    selectMessageVersion: state.selectMessageVersion,
    copyMessage: state.copyMessage,
    toggleMessagePromptVisibility: state.toggleMessagePromptVisibility,
    regenerateMsg: state.regenerateMsg,
    applyDirectorPrecisionEdits: state.applyDirectorPrecisionEdits,
    sidebarOpen: state.sidebarOpen,
    collapsedGroups: state.collapsedGroups,
    editCharacter: state.editCharacter,
    showCharacterEditor: state.showCharacterEditor,
    showCurtainPanel: state.showCurtainPanel,
    showAliasSelector: state.showAliasSelector,
    setMessagesAreaRef: state.setMessagesAreaRef,
    chatStickToBottom: state.chatStickToBottom,
    plusMenuOpen: state.plusMenuOpen,
    atMenuOpen: state.atMenuOpen,
    chatInputText: state.chatInputText,
    onInputChatText: state.onInputChatText,
    setMenuContainerRef: state.setMenuContainerRef,
    setChatInputRef: state.setChatInputRef,
    operationDetail: state.operationDetail,
    pendingImageAttachments: state.pendingImageAttachments,
    handleImageAttachmentPaste: state.handleImageAttachmentPaste,
    handleImageAttachmentDrop: state.handleImageAttachmentDrop,
    handleImageAttachmentDragOver: state.handleImageAttachmentDragOver,
    removeImageAttachment: state.removeImageAttachment,
    retryImageAttachmentUpload: state.retryImageAttachmentUpload
  }
}
