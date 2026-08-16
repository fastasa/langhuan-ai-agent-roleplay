import type { LocalArchiveModuleName } from './localArchiveShared'

type CreateLocalArchiveImportExportDeps = {
  snapshotPayloads: {
    fetchServerLocalArchiveExportSnapshot: () => Promise<any>
    buildFullExportData: (baseSnapshot?: unknown) => any
    pickImportPayload: (input: unknown, moduleNames?: LocalArchiveModuleName[]) => {
      payload: any
      modules: LocalArchiveModuleName[]
    } | null
  }
  snapshotPersistence: {
    restoreSnapshotFromServer: (
      snapshot: unknown,
      options: {
        source: 'import'
        moduleNames?: LocalArchiveModuleName[]
        reloadMessage: string
      }
    ) => Promise<any>
  }
  toast: (message: string, type?: 'success' | 'error' | 'info' | 'warning') => void
}

export function createLocalArchiveImportExport({
  snapshotPayloads,
  snapshotPersistence,
  toast
}: CreateLocalArchiveImportExportDeps) {
  async function exportAllData() {
    try {
      const data = snapshotPayloads.buildFullExportData(
        await snapshotPayloads.fetchServerLocalArchiveExportSnapshot()
      )
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `langhuan-backup-${new Date().toISOString().slice(0, 10)}.json`
      link.click()
      URL.revokeObjectURL(url)
      toast('数据已导出', 'success')
      return true
    } catch (err: any) {
      toast(`导出失败: ${err?.message || err || '读取正式快照失败'}`, 'error')
      return false
    }
  }

  function importAllData(event: any, moduleNames?: LocalArchiveModuleName[]) {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async (loadEvent: any) => {
      try {
        const data = JSON.parse(loadEvent.target.result)
        const pickedImport = snapshotPayloads.pickImportPayload(data, moduleNames)
        if (!pickedImport) return
        try {
          await snapshotPersistence.restoreSnapshotFromServer(pickedImport.payload, {
            source: 'import',
            moduleNames: pickedImport.modules,
            reloadMessage: '正在从正式快照恢复导入内容...'
          })
        } catch (err: any) {
          throw new Error(err?.message || '导入后本地落库失败')
        }
        toast(`数据已导入（${pickedImport.modules.length} 个分片）`, 'success')
      } catch (err: any) {
        toast('导入失败: ' + (err?.message || err), 'error')
      } finally {
        if (event?.target) {
          event.target.value = ''
        }
      }
    }
    reader.readAsText(file)
  }

  return {
    exportAllData,
    importAllData
  }
}
