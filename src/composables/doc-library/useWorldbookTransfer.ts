import {
  applySillyTavernWorldbookImport,
  previewSillyTavernWorldbookImport
} from '../../repositories/docBrainRepository'
import {
  buildWorldbookTransferPayload as buildWorldbookJsonTransferPayload,
  normalizeWorldbookTransferPayload,
  type WorldbookTransferPayload
} from '../../app/docLibraryWorldbookTransfer'
import type {
  BrainDocumentRecord,
  RelationSystemState,
  SillyTavernWorldbookImportConflictStrategy
} from '../../types'

export type WorldbookTransferOptions = {
  getDocuments: () => BrainDocumentRecord[]
  getManualTreeOrders: () => Record<string, string[]>
  getRelationSystemState: () => RelationSystemState
}

export function useWorldbookTransfer(options: WorldbookTransferOptions) {
  function buildTransferPayload(): WorldbookTransferPayload {
    return buildWorldbookJsonTransferPayload({
      documents: options.getDocuments(),
      manualTreeOrders: options.getManualTreeOrders(),
      relationSystemState: options.getRelationSystemState()
    })
  }

  function exportJsonFile(filePrefix = '世界树') {
    const payload = buildTransferPayload()
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${filePrefix}-${new Date().toISOString().slice(0, 10)}.json`
    link.click()
    URL.revokeObjectURL(url)
    return payload
  }

  function normalizeImportPayload(input: unknown) {
    return normalizeWorldbookTransferPayload(input)
  }

  function buildImportConfirmMessage(payload: WorldbookTransferPayload) {
    return `这会用导入文件替换当前世界树的 ${payload.documents.length} 个文件和现有排序。建议先保留一份最新导出备份。`
  }

  async function previewSillyTavernImport() {
    return await previewSillyTavernWorldbookImport()
  }

  async function applySillyTavernImport(conflictStrategy: SillyTavernWorldbookImportConflictStrategy) {
    return await applySillyTavernWorldbookImport(conflictStrategy)
  }

  return {
    buildTransferPayload,
    exportJsonFile,
    normalizeImportPayload,
    buildImportConfirmMessage,
    previewSillyTavernImport,
    applySillyTavernImport
  }
}
