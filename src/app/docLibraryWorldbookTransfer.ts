import { normalizeRelationSystemState } from './relationSystem'
import {
  fieldTreeToPathTree,
  normalizeDocLibraryV1ToV2
} from './docLibraryTreeMigration'
import { buildDocLibraryTreeDiffReport } from './docLibraryTreeDiffReport'
import type {
  BrainDocumentRecord,
  DocLibraryStateSnapshot,
  DocTreeNodeRecord,
  DocTreeOrders,
  RelationSystemState
} from '../types'

export type WorldbookTransferPayloadV1 = {
  kind: 'langhuan-worldbook'
  schemaVersion: 1
  exportedAt: string
  documents: BrainDocumentRecord[]
  manualTreeOrders: Record<string, string[]>
  relationSystemState?: RelationSystemState
}

export type WorldbookTransferPayloadV2 = {
  kind: 'langhuan-worldbook'
  schemaVersion: 2
  exportedAt: string
  documents: BrainDocumentRecord[]
  manualTreeOrders: Record<string, string[]>
  treeNodes: DocTreeNodeRecord[]
  treeOrders: DocTreeOrders
  legacyDisplayPath: Record<string, string>
  relationSystemState?: RelationSystemState
  treeDiffReport?: DocLibraryStateSnapshot['treeDiffReport']
}

export type WorldbookTransferPayload = WorldbookTransferPayloadV1 | WorldbookTransferPayloadV2

export interface BuildWorldbookTransferPayloadInput {
  documents: BrainDocumentRecord[]
  manualTreeOrders: Record<string, string[]>
  relationSystemState: RelationSystemState
  exportedAt?: string
}

export function buildWorldbookTransferPayload(input: BuildWorldbookTransferPayloadInput): WorldbookTransferPayloadV2 {
  const exportedAt = input.exportedAt || new Date().toISOString()
  const documents = cloneWorldbookDocuments(input.documents)
  const manualTreeOrders = normalizeManualTreeOrders(input.manualTreeOrders)
  const relationSystemState = normalizeRelationSystemState(input.relationSystemState)
  const v2 = normalizeDocLibraryV1ToV2({
    documents,
    manualTreeOrders,
    relationSystemState
  }, { generatedAt: exportedAt })
  const treeDiffReport = buildDocLibraryTreeDiffReport({
    documents,
    manualTreeOrders,
    treeNodes: v2.treeNodes,
    treeOrders: v2.treeOrders,
    treeSource: 'path',
    generatedAt: exportedAt
  })
  assertTreeDiffReportReady(treeDiffReport, '导出')
  return {
    kind: 'langhuan-worldbook',
    schemaVersion: 2,
    exportedAt,
    documents,
    manualTreeOrders,
    treeNodes: v2.treeNodes || [],
    treeOrders: v2.treeOrders || {},
    legacyDisplayPath: buildLegacyDisplayPathMap(documents),
    relationSystemState,
    treeDiffReport
  }
}

export function normalizeWorldbookTransferPayload(input: unknown): WorldbookTransferPayloadV2 {
  if (!input || typeof input !== 'object') {
    throw new Error('导入文件格式不正确')
  }
  const payload = input as Partial<WorldbookTransferPayload> & {
    manualOrders?: Record<string, string[]>
  }
  if (payload.kind !== 'langhuan-worldbook') {
    throw new Error('这不是世界树导出文件')
  }
  if (!Array.isArray(payload.documents)) {
    throw new Error('导出文件缺少 documents')
  }
  if (payload.schemaVersion === 1) {
    return normalizeWorldbookTransferPayloadV1(payload)
  }
  if (payload.schemaVersion === 2) {
    return normalizeWorldbookTransferPayloadV2(payload)
  }
  throw new Error('暂不支持这个世界树导出版本')
}

function normalizeWorldbookTransferPayloadV1(
  payload: Partial<WorldbookTransferPayloadV1> & { manualOrders?: Record<string, string[]> }
): WorldbookTransferPayloadV2 {
  const exportedAt = typeof payload.exportedAt === 'string' ? payload.exportedAt : ''
  return buildWorldbookTransferPayload({
    exportedAt: exportedAt || undefined,
    documents: cloneWorldbookDocuments(payload.documents as BrainDocumentRecord[]),
    manualTreeOrders: normalizeManualTreeOrders(payload.manualTreeOrders ?? payload.manualOrders),
    relationSystemState: normalizeRelationSystemState(payload.relationSystemState)
  })
}

function normalizeWorldbookTransferPayloadV2(
  payload: Partial<WorldbookTransferPayloadV2>
): WorldbookTransferPayloadV2 {
  const exportedAt = typeof payload.exportedAt === 'string' ? payload.exportedAt : ''
  const documents = cloneWorldbookDocuments(payload.documents as BrainDocumentRecord[])
  const treeNodes = normalizeDocTreeNodes(payload.treeNodes)
  if (!treeNodes.length) {
    throw new Error('v2 世界树导出缺少 treeNodes')
  }
  const treeOrders = normalizeDocTreeOrders(payload.treeOrders)
  const compat = fieldTreeToPathTree({
    documents,
    treeNodes,
    treeOrders
  })
  const suppliedManualTreeOrders = normalizeManualTreeOrders(payload.manualTreeOrders)
  const manualTreeOrders = Object.keys(suppliedManualTreeOrders).length
    ? suppliedManualTreeOrders
    : compat.manualTreeOrders
  const treeDiffReport = buildDocLibraryTreeDiffReport({
    documents: compat.documents,
    manualTreeOrders,
    treeNodes,
    treeOrders,
    treeSource: 'field',
    generatedAt: exportedAt || undefined
  })
  assertTreeDiffReportReady(treeDiffReport, '导入')
  return {
    kind: 'langhuan-worldbook',
    schemaVersion: 2,
    exportedAt,
    documents: compat.documents,
    manualTreeOrders,
    treeNodes,
    treeOrders,
    legacyDisplayPath: normalizeLegacyDisplayPath(payload.legacyDisplayPath, compat.documents),
    relationSystemState: normalizeRelationSystemState(payload.relationSystemState),
    treeDiffReport
  }
}

function assertTreeDiffReportReady(
  report: NonNullable<DocLibraryStateSnapshot['treeDiffReport']>,
  actionLabel: string
) {
  if (report.blockerCount > 0 || !report.canUseFieldTree) {
    throw new Error(`${actionLabel}世界树 JSON 前字段树审计未通过：${report.issues[0]?.message || '存在阻断差异'}`)
  }
}

function cloneWorldbookDocuments(documents: BrainDocumentRecord[]) {
  return (Array.isArray(documents) ? documents : []).map((item) => ({ ...item }))
}

function normalizeManualTreeOrders(input: unknown): Record<string, string[]> {
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

function normalizeDocTreeNodes(input: unknown): DocTreeNodeRecord[] {
  return Array.isArray(input)
    ? input
      .filter((item) => item && typeof item === 'object')
      .map((item) => item as DocTreeNodeRecord)
    : []
}

function normalizeDocTreeOrders(input: unknown): DocTreeOrders {
  return normalizeManualTreeOrders(input)
}

function buildLegacyDisplayPathMap(documents: BrainDocumentRecord[]) {
  return Object.fromEntries(
    documents
      .map((document) => [String(document.documentId || document.id || document.stableId || '').trim(), String(document.displayPath || '').trim()])
      .filter(([documentId, displayPath]) => Boolean(documentId) && Boolean(displayPath))
  )
}

function normalizeLegacyDisplayPath(input: unknown, documents: BrainDocumentRecord[]) {
  if (input && typeof input === 'object' && !Array.isArray(input)) {
    return Object.fromEntries(
      Object.entries(input as Record<string, unknown>)
        .map(([key, value]) => [String(key || '').trim(), String(value || '').trim()])
        .filter(([key, value]) => Boolean(key) && Boolean(value))
    )
  }
  return buildLegacyDisplayPathMap(documents)
}
