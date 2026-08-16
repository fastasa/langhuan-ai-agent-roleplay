import { existsSync, readdirSync, readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { buildSillyTavernWorldbookPreview } from '../../../src/app/sillyTavernWorldbookImport.js'
import type {
  BrainDocumentRecord,
  SillyTavernWorldbookApplyResult,
  SillyTavernWorldbookFileInput,
  SillyTavernWorldbookImportConflictStrategy
} from '../../../src/types/index.js'
import { normalizeBrainDocumentReplaceRow } from './brainRecordNormalizer.js'
import { pathTreeToFieldTree } from '../../../src/app/docLibraryTreeMigration.js'
import { buildDocLibraryTreeDiffReport } from '../../../src/app/docLibraryTreeDiffReport.js'

type DocumentRepository = {
  getDocuments: () => any[]
  replaceDocuments: (rows: ReturnType<typeof normalizeBrainDocumentReplaceRow>[]) => void
  getManualTreeOrders?: () => Record<string, string[]>
  replaceManualTreeOrders?: (orders: Record<string, string[]>) => void
  replaceSchemaVersion?: (schemaVersion: number) => void
  replaceTreeNodes?: (treeNodes: unknown[]) => void
  replaceTreeOrders?: (treeOrders: Record<string, string[]>) => void
  replaceTreeMigrationMeta?: (treeMigrationMeta: Record<string, unknown>) => void
  replaceTreeDiffReport?: (treeDiffReport: Record<string, unknown>) => void
}

const __dirname = dirname(fileURLToPath(import.meta.url))
const DEFAULT_STWB_DIR = join(__dirname, '../../../docs/stwb')

export function createSillyTavernWorldbookImportAppService(repository: DocumentRepository) {
  function loadDefaultWorldbookFiles(): SillyTavernWorldbookFileInput[] {
    if (!existsSync(DEFAULT_STWB_DIR)) return []
    return readdirSync(DEFAULT_STWB_DIR)
      .filter((name) => name.toLowerCase().endsWith('.json'))
      .sort((left, right) => left.localeCompare(right, 'zh-Hans-CN'))
      .map((fileName) => {
        const filePath = join(DEFAULT_STWB_DIR, fileName)
        return {
          fileName,
          filePath,
          content: readFileSync(filePath, 'utf8')
        }
      })
  }

  function preview() {
    const existingDocuments = repository.getDocuments() as BrainDocumentRecord[]
    const result = buildSillyTavernWorldbookPreview(loadDefaultWorldbookFiles(), { existingDocuments })
    if (!result.ok) throw new Error(result.error.message)
    return result.preview
  }

  function apply(conflictStrategy: SillyTavernWorldbookImportConflictStrategy = 'skip'): SillyTavernWorldbookApplyResult {
    const now = new Date().toISOString()
    const existingDocuments = repository.getDocuments() as BrainDocumentRecord[]
    const previewResult = buildSillyTavernWorldbookPreview(loadDefaultWorldbookFiles(), {
      importedAt: now,
      existingDocuments
    })
    if (!previewResult.ok) throw new Error(previewResult.error.message)

    const nextDocuments = [...existingDocuments]
    const takenPaths = new Set(nextDocuments.map((item) => normalizePath(item.displayPath)).filter(Boolean))
    let addedCount = 0
    let updatedCount = 0
    let skippedCount = 0

    previewResult.preview.documents.forEach((draft, index) => {
      const duplicateIndex = nextDocuments.findIndex((item) => isSameSource(item, draft) || normalizePath(item.displayPath) === normalizePath(draft.displayPath))
      if (duplicateIndex >= 0) {
        if (conflictStrategy === 'skip') {
          skippedCount += 1
          return
        }
        if (conflictStrategy === 'overwrite') {
          const current = nextDocuments[duplicateIndex]
          nextDocuments[duplicateIndex] = {
            ...draft,
            id: current.id || current.documentId,
            documentId: current.documentId || current.id,
            stableId: current.stableId || draft.stableId,
            createdAt: current.createdAt || draft.createdAt,
            updatedAt: now,
            sourceMeta: {
              ...draft.sourceMeta,
              importedAt: current.sourceMeta?.importedAt || draft.sourceMeta.importedAt,
              updatedFromSourceAt: now
            }
          }
          updatedCount += 1
          return
        }
      }

      const document = conflictStrategy === 'duplicate' && duplicateIndex >= 0
        ? makeDuplicateDraft(draft, index, takenPaths, now)
        : draft
      takenPaths.add(normalizePath(document.displayPath))
      nextDocuments.push(document)
      addedCount += 1
    })

    const manualTreeOrders = normalizeTreeOrders(repository.getManualTreeOrders?.())
    const fieldTreeState = buildFieldTreeState(nextDocuments, manualTreeOrders, now)

    repository.replaceDocuments(nextDocuments.map((item, index) => normalizeBrainDocumentReplaceRow(item, index)))
    repository.replaceManualTreeOrders?.(manualTreeOrders)
    repository.replaceSchemaVersion?.(2)
    repository.replaceTreeNodes?.(fieldTreeState.treeNodes)
    repository.replaceTreeOrders?.(fieldTreeState.treeOrders)
    repository.replaceTreeMigrationMeta?.(fieldTreeState.treeMigrationMeta)
    repository.replaceTreeDiffReport?.(fieldTreeState.treeDiffReport)

    return {
      ok: true,
      preview: previewResult.preview,
      documents: nextDocuments,
      addedCount,
      updatedCount,
      skippedCount
    }
  }

  return { preview, apply }
}

function buildFieldTreeState(
  documents: BrainDocumentRecord[],
  manualTreeOrders: Record<string, string[]>,
  generatedAt: string
) {
  const converted = pathTreeToFieldTree({
    documents,
    manualTreeOrders,
    generatedAt
  })
  const treeDiffReport = buildDocLibraryTreeDiffReport({
    documents,
    manualTreeOrders,
    treeNodes: converted.treeNodes,
    treeOrders: converted.treeOrders,
    treeSource: 'path'
  })
  if (treeDiffReport.blockerCount > 0) {
    const issue = treeDiffReport.issues[0]
    throw new Error(`SillyTavern 世界书导入未通过字段树检查：${issue?.message || '字段树差异报告存在阻断项'}`)
  }
  return {
    treeNodes: converted.treeNodes,
    treeOrders: converted.treeOrders,
    treeMigrationMeta: converted.treeMigrationMeta,
    treeDiffReport
  }
}

function normalizeTreeOrders(input: unknown) {
  const source = input && typeof input === 'object' ? input as Record<string, unknown> : {}
  return Object.fromEntries(
    Object.entries(source)
      .map(([key, value]) => [
        String(key || '').trim(),
        Array.isArray(value)
          ? value.map((entry) => String(entry || '').trim()).filter(Boolean)
          : []
      ])
      .filter(([key]) => Boolean(key))
  )
}

function makeDuplicateDraft(
  draft: BrainDocumentRecord,
  index: number,
  takenPaths: Set<string>,
  now: string
): BrainDocumentRecord {
  const basePath = normalizePath(draft.displayPath).replace(/\.md$/i, '')
  let copyIndex = 1
  let nextPath = `${basePath} 副本.md`
  while (takenPaths.has(normalizePath(nextPath))) {
    copyIndex += 1
    nextPath = `${basePath} 副本${copyIndex}.md`
  }
  const documentId = `${draft.documentId}_copy_${index}_${copyIndex}`
  return {
    ...draft,
    documentId,
    id: documentId,
    stableId: documentId,
    displayPath: nextPath,
    createdAt: now,
    updatedAt: now
  }
}

function isSameSource(left: BrainDocumentRecord, right: BrainDocumentRecord): boolean {
  const leftMeta = left.sourceMeta
  const rightMeta = right.sourceMeta
  return Boolean(
    leftMeta?.provider
      && rightMeta?.provider
      && leftMeta.provider === rightMeta.provider
      && leftMeta.sourceFileName === rightMeta.sourceFileName
      && leftMeta.sourceEntryUid === rightMeta.sourceEntryUid
  )
}

function normalizePath(value: unknown): string {
  const segments = String(value || '').split('/').map((segment) => segment.trim()).filter(Boolean)
  return segments.length ? `/${segments.join('/')}` : ''
}
