import { ref } from 'vue'

/**
 * 本地归档状态。开源版只提供 JSON 导入、导出与本机恢复。
 */
export function useLocalArchiveSync() {
  const isSyncing = ref(false)
  const isRestoringArchive = ref(false)
  const error = ref('')

  return {
    isSyncing,
    isRestoringArchive,
    error,
    reset: async () => undefined
  }
}
