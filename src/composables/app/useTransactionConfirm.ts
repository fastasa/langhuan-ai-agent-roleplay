export function useTransactionConfirm({
  workspaceRuntimeStore,
  confirmTransactions
}: any) {
  async function confirmTransactionAt(index: number) {
    const currentTransactions = Array.isArray(workspaceRuntimeStore?.pendingTransactions)
      ? workspaceRuntimeStore.pendingTransactions
      : []
    if (index < 0 || index >= currentTransactions.length) return
    await confirmTransactions([index])
  }

  async function runConfirmTransactionAtCommand(index: number) {
    await confirmTransactionAt(index)
  }

  return {
    confirmTransactionAt,
    runConfirmTransactionAtCommand
  }
}
