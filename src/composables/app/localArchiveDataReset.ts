type CreateLocalArchiveDataResetDeps = {
  reloadPage?: () => void
  toast: (message: string, type?: 'success' | 'error' | 'info' | 'warning') => void
}

export function createLocalArchiveDataReset({
  reloadPage = () => window.location.reload(),
  toast
}: CreateLocalArchiveDataResetDeps) {
  function resetAllData() {
    toast('数据已重置', 'success')
    reloadPage()
    return true
  }

  return {
    resetAllData
  }
}
