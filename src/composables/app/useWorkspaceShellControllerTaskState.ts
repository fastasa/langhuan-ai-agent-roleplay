export function buildWorkspaceShellControllerTaskState(state: {
  batchTicket: unknown
  batchAmount: unknown
  showBatchExchange: unknown
  showBatchUse: unknown
  openEditTicket: (ticket: unknown) => unknown
  showAddTicket: unknown
  showTagManager: unknown
  useCustomTag: (tag: unknown) => unknown
}) {
  return {
    batchTicket: state.batchTicket,
    batchAmount: state.batchAmount,
    showBatchExchange: state.showBatchExchange,
    showBatchUse: state.showBatchUse,
    openEditTicket: state.openEditTicket,
    showAddTicket: state.showAddTicket,
    showTagManager: state.showTagManager,
    useCustomTag: state.useCustomTag
  }
}
