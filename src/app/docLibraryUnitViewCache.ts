import type { BrainDocumentRecord } from '../types'
import type { DocLibraryTreeDiffReport, DocTreeNodeRecord, DocTreeOrders } from '../types/docBrain'
import type { UnitViewAdapterResult } from '../types/unitView'
import { measureSync } from '../utils/performanceMarks'
import { buildDocLibraryUnitView } from './unitViewAdapters'

type DocLibraryUnitViewCacheEntry = {
  signature: string
  result: UnitViewAdapterResult
}

const cache: DocLibraryUnitViewCacheEntry = {
  signature: '',
  result: { units: [], relations: [], warnings: [] }
}

export function getCachedDocLibraryUnitView(
  documents: BrainDocumentRecord[],
  manualTreeOrders: Record<string, string[]>,
  options: {
    treeNodes?: DocTreeNodeRecord[]
    treeOrders?: DocTreeOrders
    treeDiffReport?: DocLibraryTreeDiffReport | null
  } = {}
) {
  const signature = buildDocLibraryUnitViewSignature(documents, manualTreeOrders, options)
  if (cache.signature === signature) return cache.result
  const adapterOptions = {
    ...options,
    treeDiffReport: options.treeDiffReport || undefined
  }
  const result = measureSync('docLibrary.unitView.build', () => buildDocLibraryUnitView(documents, manualTreeOrders, adapterOptions), {
    documents: Array.isArray(documents) ? documents.length : 0,
    treeNodes: Array.isArray(options.treeNodes) ? options.treeNodes.length : 0
  })
  cache.signature = signature
  cache.result = result
  return result
}

export function clearDocLibraryUnitViewCache() {
  cache.signature = ''
  cache.result = { units: [], relations: [], warnings: [] }
}

export function buildDocLibraryUnitViewSignature(
  documents: BrainDocumentRecord[],
  manualTreeOrders: Record<string, string[]>,
  options: {
    treeNodes?: DocTreeNodeRecord[]
    treeOrders?: DocTreeOrders
    treeDiffReport?: DocLibraryTreeDiffReport | null
  } = {}
) {
  return JSON.stringify({
    documents: (Array.isArray(documents) ? documents : []).map((document) => [
      document.documentId || document.id,
      document.title,
      document.displayPath,
      document.semanticType,
      document.summary,
      document.content,
      document.updatedAt,
      summarizeJsonLike(document.tags),
      summarizeJsonLike(document.publicCompilePage)
    ]),
    manualTreeOrders,
    treeNodes: (Array.isArray(options.treeNodes) ? options.treeNodes : []).map((node) => [
      node.nodeId,
      node.parentId,
      node.nodeKind,
      node.title,
      node.documentId,
      node.overviewDocumentId,
      node.legacyDisplayPath,
      node.updatedAt
    ]),
    treeOrders: options.treeOrders || {},
    treeDiffReport: options.treeDiffReport
      ? {
          canUseFieldTree: options.treeDiffReport.canUseFieldTree,
          blockerCount: options.treeDiffReport.blockerCount,
          warningCount: options.treeDiffReport.warningCount
        }
      : null
  })
}

function summarizeJsonLike(value: unknown) {
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value || {})
  } catch {
    return ''
  }
}
