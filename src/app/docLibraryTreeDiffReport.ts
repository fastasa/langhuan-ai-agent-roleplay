import { DOC_LIBRARY_ROOT_ORDER_BUCKET_ID, fieldTreeToPathTree } from './docLibraryTreeMigration'
import type {
  BrainDocumentRecord,
  DocLibraryTreeDiffReport,
  DocTreeNodeRecord,
  DocTreeOrders
} from '../types'

export interface BuildDocLibraryTreeDiffReportInput {
  documents: BrainDocumentRecord[]
  manualTreeOrders: Record<string, string[]>
  treeNodes?: DocTreeNodeRecord[]
  treeOrders?: DocTreeOrders
  treeSource?: 'path' | 'field'
  generatedAt?: string
}

export function buildDocLibraryTreeDiffReport(
  input: BuildDocLibraryTreeDiffReportInput
): DocLibraryTreeDiffReport {
  const generatedAt = input.generatedAt || new Date().toISOString()
  const documents = Array.isArray(input.documents) ? input.documents : []
  const treeNodes = Array.isArray(input.treeNodes) ? input.treeNodes : []
  const treeOrders = normalizeTreeOrders(input.treeOrders)
  const legacyOrders = normalizeOrderMap(input.manualTreeOrders)
  const issues: DocLibraryTreeDiffReport['issues'] = []
  const legacyDocumentPathById = new Map(documents.map((document) => [
    getDocumentId(document),
    normalizeDisplayPath(document.displayPath)
  ]))
  const fieldDocumentIds = new Set(
    treeNodes
      .filter((node) => node.nodeKind === 'document' && node.documentId)
      .map((node) => String(node.documentId || '').trim())
      .filter(Boolean)
  )

  legacyDocumentPathById.forEach((displayPath, documentId) => {
    if (!fieldDocumentIds.has(documentId)) {
      issues.push({
        severity: 'blocker',
        code: 'missing_document_node',
        message: '字段树缺少文档节点。',
        documentId,
        expected: displayPath,
        actual: ''
      })
    }
  })
  fieldDocumentIds.forEach((documentId) => {
    if (!legacyDocumentPathById.has(documentId)) {
      issues.push({
        severity: 'blocker',
        code: 'extra_document_node',
        message: '字段树存在文档列表之外的文档节点。',
        documentId
      })
    }
  })

  const fieldCompat = fieldTreeToPathTree({
    documents,
    treeNodes,
    treeOrders
  })
  const fieldDocumentPathById = new Map(fieldCompat.documents.map((document) => [
    getDocumentId(document),
    normalizeDisplayPath(document.displayPath)
  ]))
  legacyDocumentPathById.forEach((expected, documentId) => {
    const actual = fieldDocumentPathById.get(documentId) || ''
    if (actual && expected !== actual) {
      issues.push({
        severity: 'blocker',
        code: 'document_path_mismatch',
        message: '字段树反推文档路径与旧路径树不一致。',
        documentId,
        expected,
        actual
      })
    }
  })

  const fieldOrders = normalizeOrderMap(fieldCompat.manualTreeOrders)
  Object.entries(legacyOrders).forEach(([bucketId, expectedEntries]) => {
    const actualEntries = fieldOrders[bucketId] || []
    if (!sameStringList(expectedEntries, actualEntries)) {
      issues.push({
        severity: 'blocker',
        code: 'manual_order_mismatch',
        message: '字段树反推排序桶与旧排序桶不一致。',
        bucketId,
        expected: expectedEntries.join(','),
        actual: actualEntries.join(',')
      })
    }
  })

  const blockerCount = issues.filter((issue) => issue.severity === 'blocker').length
  const warningCount = issues.filter((issue) => issue.severity === 'warning').length
  return {
    generatedAt,
    treeSource: input.treeSource || 'path',
    blockerCount,
    warningCount,
    documentPathMismatchCount: issues.filter((issue) => issue.code === 'document_path_mismatch').length,
    manualOrderMismatchCount: issues.filter((issue) => issue.code === 'manual_order_mismatch').length,
    missingDocumentNodeCount: issues.filter((issue) => issue.code === 'missing_document_node').length,
    extraDocumentNodeCount: issues.filter((issue) => issue.code === 'extra_document_node').length,
    issues,
    canUseFieldTree: blockerCount === 0
  }
}

function normalizeOrderMap(input: unknown): Record<string, string[]> {
  const source = input && typeof input === 'object' && !Array.isArray(input)
    ? input as Record<string, unknown>
    : {}
  return Object.fromEntries(
    Object.entries(source)
      .map(([key, value]) => [
        key === DOC_LIBRARY_ROOT_ORDER_BUCKET_ID ? DOC_LIBRARY_ROOT_ORDER_BUCKET_ID : normalizeDisplayPath(key),
        Array.isArray(value) ? value.map((entry) => String(entry || '').trim()).filter(Boolean) : []
      ])
      .filter(([key]) => Boolean(key))
  )
}

function normalizeTreeOrders(input: unknown): Record<string, string[]> {
  const source = input && typeof input === 'object' && !Array.isArray(input)
    ? input as Record<string, unknown>
    : {}
  return Object.fromEntries(
    Object.entries(source)
      .map(([key, value]) => [
        String(key || '').trim(),
        Array.isArray(value) ? value.map((entry) => String(entry || '').trim()).filter(Boolean) : []
      ])
      .filter(([key]) => Boolean(key))
  )
}

function normalizeDisplayPath(value: unknown) {
  const segments = String(value || '').replace(/\\/g, '/').split('/').map((item) => item.trim()).filter(Boolean)
  return segments.length ? `/${segments.join('/')}` : ''
}

function getDocumentId(document: BrainDocumentRecord) {
  return String(document.documentId || document.id || document.stableId || '').trim()
}

function sameStringList(left: string[], right: string[]) {
  return left.length === right.length && left.every((item, index) => item === right[index])
}
