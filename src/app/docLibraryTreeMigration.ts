import {
  buildDocLibraryParentIdShadowAudit,
  type DocLibraryManualTreeOrders
} from './docLibraryParentIdShadowAudit'
import type {
  BrainDocumentRecord,
  DocLibraryStateSnapshot,
  DocLibraryTreeMigrationMeta,
  DocTreeNodeRecord,
  DocTreeOrders
} from '../types/docBrain'

export const DOC_TREE_ROOT_NODE_ID = 'doc-tree:root'
export const DOC_LIBRARY_ROOT_ORDER_BUCKET_ID = '__root__'

export interface PathTreeToFieldTreeInput {
  documents: BrainDocumentRecord[]
  manualTreeOrders?: DocLibraryManualTreeOrders
  generatedAt?: string
  auditReportPath?: string
}

export interface PathTreeToFieldTreeResult {
  treeNodes: DocTreeNodeRecord[]
  treeOrders: DocTreeOrders
  treeMigrationMeta: DocLibraryTreeMigrationMeta
}

export interface FieldTreeToPathTreeInput {
  documents: BrainDocumentRecord[]
  treeNodes?: DocTreeNodeRecord[]
  treeOrders?: DocTreeOrders
  manualTreeOrders?: DocLibraryManualTreeOrders
}

export interface FieldTreeToPathTreeResult {
  documents: BrainDocumentRecord[]
  manualTreeOrders: DocLibraryManualTreeOrders
}

export function normalizeDocLibraryV1ToV2(
  snapshot: DocLibraryStateSnapshot,
  options: { generatedAt?: string; auditReportPath?: string } = {}
): DocLibraryStateSnapshot {
  const converted = pathTreeToFieldTree({
    documents: snapshot.documents,
    manualTreeOrders: snapshot.manualTreeOrders,
    generatedAt: options.generatedAt,
    auditReportPath: options.auditReportPath
  })
  return {
    ...snapshot,
    schemaVersion: 2,
    treeNodes: converted.treeNodes,
    treeOrders: converted.treeOrders,
    treeMigrationMeta: converted.treeMigrationMeta
  }
}

export function normalizeDocLibraryV2ToV1Compat(snapshot: DocLibraryStateSnapshot): DocLibraryStateSnapshot {
  const converted = fieldTreeToPathTree({
    documents: snapshot.documents,
    treeNodes: snapshot.treeNodes,
    treeOrders: snapshot.treeOrders,
    manualTreeOrders: snapshot.manualTreeOrders
  })
  return {
    ...snapshot,
    schemaVersion: 1,
    documents: converted.documents,
    manualTreeOrders: converted.manualTreeOrders,
    treeNodes: undefined,
    treeOrders: undefined,
    treeMigrationMeta: undefined
  }
}

export function pathTreeToFieldTree(input: PathTreeToFieldTreeInput): PathTreeToFieldTreeResult {
  const documents = Array.isArray(input.documents) ? input.documents : []
  const manualTreeOrders = normalizeManualTreeOrders(input.manualTreeOrders)
  const generatedAt = input.generatedAt || new Date().toISOString()
  const audit = buildDocLibraryParentIdShadowAudit(documents, manualTreeOrders, { generatedAt })
  if (!audit.summary.suitableForFormalMigration) {
    const issueSummary = audit.issues
      .filter((issue) => issue.severity === 'blocker' || issue.code.startsWith('manual_order_'))
      .slice(0, 5)
      .map((issue) => `${issue.code}:${issue.displayPath || issue.parentId || issue.entryId || issue.documentId || ''}`)
      .join(', ')
    throw new Error(`文档库字段树转换前存在阻断项或排序噪声：${issueSummary || '见影子审计报告'}`)
  }

  const folderPaths = collectFolderPaths(documents)
  const folderNodeByPath = new Map<string, DocTreeNodeRecord>()
  const documentNodeById = new Map<string, DocTreeNodeRecord>()
  const childIdsByParent = new Map<string, string[]>()

  const treeNodes: DocTreeNodeRecord[] = [{
    nodeId: DOC_TREE_ROOT_NODE_ID,
    nodeKind: 'root',
    parentId: null,
    title: '世界树',
    status: 'active',
    createdAt: generatedAt,
    updatedAt: generatedAt
  }]

  Array.from(folderPaths)
    .sort(compareDisplayPath)
    .forEach((folderPath) => {
      const parentPath = getParentFolderPath(folderPath)
      const parentId = parentPath ? buildFolderNodeId(parentPath) : DOC_TREE_ROOT_NODE_ID
      const node: DocTreeNodeRecord = {
        nodeId: buildFolderNodeId(folderPath),
        nodeKind: 'folder',
        parentId,
        title: getLastPathSegment(folderPath) || folderPath,
        legacyDisplayPath: folderPath,
        status: 'active',
        createdAt: generatedAt,
        updatedAt: generatedAt
      }
      folderNodeByPath.set(folderPath, node)
      treeNodes.push(node)
      appendChildId(childIdsByParent, parentId, node.nodeId)
    })

  documents.forEach((document) => {
    const documentId = getDocumentId(document)
    const displayPath = normalizeDisplayPath(document.displayPath)
    const parentPath = getParentFolderPath(displayPath)
    const parentId = parentPath ? buildFolderNodeId(parentPath) : DOC_TREE_ROOT_NODE_ID
    const node: DocTreeNodeRecord = {
      nodeId: buildDocumentNodeId(documentId),
      nodeKind: 'document',
      parentId,
      title: document.title || stripMarkdownExtension(getLastPathSegment(displayPath)) || documentId,
      documentId,
      legacyDisplayPath: displayPath,
      status: 'active',
      createdAt: document.createdAt || generatedAt,
      updatedAt: document.updatedAt || generatedAt
    }
    documentNodeById.set(documentId, node)
    treeNodes.push(node)
    appendChildId(childIdsByParent, parentId, node.nodeId)

    if (isIndexDocumentPath(displayPath)) {
      const overviewOwnerNode = parentPath ? folderNodeByPath.get(parentPath) : treeNodes[0]
      if (overviewOwnerNode) overviewOwnerNode.overviewDocumentId = documentId
    }
  })

  const treeOrders = buildTreeOrdersFromPathOrders(
    manualTreeOrders,
    childIdsByParent,
    folderNodeByPath,
    documentNodeById
  )

  return {
    treeNodes,
    treeOrders,
    treeMigrationMeta: {
      treeSource: 'path',
      generatedAt,
      auditReportPath: input.auditReportPath,
      hasBlockingIssues: false
    }
  }
}

export function fieldTreeToPathTree(input: FieldTreeToPathTreeInput): FieldTreeToPathTreeResult {
  const treeNodes = Array.isArray(input.treeNodes) ? input.treeNodes : []
  const treeOrders = normalizeTreeOrders(input.treeOrders)
  const nodeById = new Map(treeNodes.map((node) => [node.nodeId, node]))
  const documentPathById = new Map<string, string>()

  treeNodes
    .filter((node) => node.nodeKind === 'document' && node.documentId)
    .forEach((node) => {
      documentPathById.set(node.documentId || '', rebuildDocumentDisplayPath(node, nodeById))
    })

  const documents = input.documents.map((document) => {
    const documentId = getDocumentId(document)
    return {
      ...document,
      displayPath: documentPathById.get(documentId) || normalizeDisplayPath(document.displayPath)
    }
  })

  return {
    documents,
    manualTreeOrders: input.manualTreeOrders
      ? normalizeManualTreeOrders(input.manualTreeOrders)
      : buildManualTreeOrdersFromFieldTree(treeNodes, treeOrders, nodeById)
  }
}

export function buildDocumentNodeId(documentId: string) {
  return `doc:${encodeNodeSegment(documentId)}`
}

export function buildFolderNodeId(folderPath: string) {
  return `doc-tree:${encodeNodeSegment(normalizeDisplayPath(folderPath))}`
}

/**
 * 新建文件夹稳定 nodeId（2026-07-04 止血·用户拍板）：不再从路径编码派生（中文路径 → 超长乱码 id，
 * 模型抄写必错），改发一次性稳定短码。保留 `doc-tree:` 前缀（多处以此前缀判定文件夹单位）。
 * 边界：仅用于**运行时新建**文件夹（docLibraryTreeCommands）；初始迁移（pathTreeToFieldTree）仍用
 * buildFolderNodeId 保持确定性可回放；存量脏 id 不迁移，由提调检索层短码映射（tidiaoUnitIdCodec）兜住。
 */
export function buildStableFolderNodeId(now = Date.now()) {
  const random = Math.random().toString(36).slice(2, 8)
  return `doc-tree:f-${now.toString(36)}-${random}`
}

function buildTreeOrdersFromPathOrders(
  manualTreeOrders: DocLibraryManualTreeOrders,
  childIdsByParent: Map<string, string[]>,
  folderNodeByPath: Map<string, DocTreeNodeRecord>,
  documentNodeById: Map<string, DocTreeNodeRecord>
): DocTreeOrders {
  const treeOrders: DocTreeOrders = {}
  const sortedParentIds = Array.from(childIdsByParent.keys()).sort(compareNodeId)
  sortedParentIds.forEach((parentId) => {
    treeOrders[parentId] = [...(childIdsByParent.get(parentId) || [])]
      .sort((left, right) => compareTreeChild(left, right, folderNodeByPath, documentNodeById))
  })

  Object.entries(manualTreeOrders).forEach(([bucketId, entries]) => {
    const parentNodeId = bucketId === DOC_LIBRARY_ROOT_ORDER_BUCKET_ID
      ? DOC_TREE_ROOT_NODE_ID
      : buildFolderNodeId(bucketId)
    const convertedEntries = entries
      .map((entry) => orderEntryToNodeId(entry, folderNodeByPath, documentNodeById))
      .filter((nodeId): nodeId is string => Boolean(nodeId))
    const existingChildren = new Set(childIdsByParent.get(parentNodeId) || [])
    const seen = new Set<string>()
    const ordered = convertedEntries.filter((nodeId) => {
      if (!existingChildren.has(nodeId) || seen.has(nodeId)) return false
      seen.add(nodeId)
      return true
    })
    const remainder = (childIdsByParent.get(parentNodeId) || []).filter((nodeId) => !seen.has(nodeId))
    treeOrders[parentNodeId] = [...ordered, ...remainder]
  })

  return treeOrders
}

function buildManualTreeOrdersFromFieldTree(
  treeNodes: DocTreeNodeRecord[],
  treeOrders: DocTreeOrders,
  nodeById: Map<string, DocTreeNodeRecord>
): DocLibraryManualTreeOrders {
  const manualTreeOrders: DocLibraryManualTreeOrders = {}
  Object.entries(treeOrders).forEach(([parentNodeId, childNodeIds]) => {
    const bucketId = parentNodeId === DOC_TREE_ROOT_NODE_ID
      ? DOC_LIBRARY_ROOT_ORDER_BUCKET_ID
      : rebuildFolderDisplayPath(nodeById.get(parentNodeId), nodeById)
    if (!bucketId) return
    const entries = childNodeIds
      .map((childNodeId) => {
        const child = nodeById.get(childNodeId)
        if (!child) return ''
        if (child.nodeKind === 'folder') return `folder:${rebuildFolderDisplayPath(child, nodeById)}`
        if (child.nodeKind === 'document' && child.documentId) return `document:${child.documentId}`
        return ''
      })
      .filter(Boolean)
    if (entries.length) manualTreeOrders[bucketId] = entries
  })

  if (!Object.keys(manualTreeOrders).length) {
    const childrenByParent = new Map<string, DocTreeNodeRecord[]>()
    treeNodes.forEach((node) => {
      if (!node.parentId) return
      childrenByParent.set(node.parentId, [...(childrenByParent.get(node.parentId) || []), node])
    })
    childrenByParent.forEach((children, parentNodeId) => {
      const bucketId = parentNodeId === DOC_TREE_ROOT_NODE_ID
        ? DOC_LIBRARY_ROOT_ORDER_BUCKET_ID
        : rebuildFolderDisplayPath(nodeById.get(parentNodeId), nodeById)
      if (!bucketId) return
      manualTreeOrders[bucketId] = children
        .sort((left, right) => compareNodeTitle(left, right))
        .map((child) => child.nodeKind === 'folder'
          ? `folder:${rebuildFolderDisplayPath(child, nodeById)}`
          : `document:${child.documentId || ''}`)
        .filter(Boolean)
    })
  }

  return manualTreeOrders
}

function orderEntryToNodeId(
  entry: string,
  folderNodeByPath: Map<string, DocTreeNodeRecord>,
  documentNodeById: Map<string, DocTreeNodeRecord>
) {
  if (entry.startsWith('folder:')) {
    return folderNodeByPath.get(normalizeDisplayPath(entry.slice('folder:'.length)))?.nodeId
  }
  if (entry.startsWith('document:')) {
    return documentNodeById.get(entry.slice('document:'.length).trim())?.nodeId
  }
  return undefined
}

function collectFolderPaths(documents: BrainDocumentRecord[]) {
  const folderPaths = new Set<string>()
  documents.forEach((document) => {
    const segments = splitDisplayPath(document.displayPath)
    for (let index = 0; index < segments.length - 1; index += 1) {
      folderPaths.add(`/${segments.slice(0, index + 1).join('/')}`)
    }
  })
  return folderPaths
}

function rebuildDocumentDisplayPath(node: DocTreeNodeRecord, nodeById: Map<string, DocTreeNodeRecord>) {
  const filename = getFilenameFromLegacyPath(node.legacyDisplayPath) || ensureMarkdownFilename(node.title)
  const parentPath = rebuildFolderDisplayPath(nodeById.get(node.parentId || ''), nodeById)
  return parentPath ? `${parentPath}/${filename}` : `/${filename}`
}

function rebuildFolderDisplayPath(node: DocTreeNodeRecord | undefined, nodeById: Map<string, DocTreeNodeRecord>) {
  if (!node || node.nodeId === DOC_TREE_ROOT_NODE_ID) return ''
  if (node.legacyDisplayPath) return normalizeDisplayPath(node.legacyDisplayPath)
  const names = [node.title]
  let currentParentId = node.parentId
  const visited = new Set<string>()
  while (currentParentId && currentParentId !== DOC_TREE_ROOT_NODE_ID && !visited.has(currentParentId)) {
    visited.add(currentParentId)
    const parent = nodeById.get(currentParentId)
    if (!parent) break
    names.unshift(parent.title)
    currentParentId = parent.parentId
  }
  return `/${names.filter(Boolean).join('/')}`
}

function appendChildId(target: Map<string, string[]>, parentId: string, childId: string) {
  target.set(parentId, [...(target.get(parentId) || []), childId])
}

function normalizeManualTreeOrders(input: unknown): DocLibraryManualTreeOrders {
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

function normalizeTreeOrders(input: unknown): DocTreeOrders {
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

function normalizeDisplayPath(displayPath: unknown) {
  const segments = splitDisplayPath(String(displayPath || ''))
  return segments.length ? `/${segments.join('/')}` : ''
}

function splitDisplayPath(displayPath: unknown) {
  return String(displayPath || '').split('/').map((item) => item.trim()).filter(Boolean)
}

function getParentFolderPath(displayPath: string) {
  const segments = splitDisplayPath(displayPath)
  return segments.length <= 1 ? '' : `/${segments.slice(0, -1).join('/')}`
}

function getLastPathSegment(displayPath: string) {
  const segments = splitDisplayPath(displayPath)
  return segments[segments.length - 1] || ''
}

function getFilenameFromLegacyPath(displayPath: unknown) {
  return getLastPathSegment(normalizeDisplayPath(displayPath))
}

function isIndexDocumentPath(displayPath: string) {
  return getLastPathSegment(displayPath).toLowerCase() === 'index.md'
}

function ensureMarkdownFilename(title: string) {
  const safeTitle = String(title || '').trim() || '未命名'
  return /\.md$/i.test(safeTitle) ? safeTitle : `${safeTitle}.md`
}

function stripMarkdownExtension(name: string) {
  return String(name || '').replace(/\.md$/i, '')
}

function getDocumentId(document: BrainDocumentRecord) {
  return String(document.documentId || document.id || document.stableId || '').trim()
}

function encodeNodeSegment(value: string) {
  return encodeURIComponent(String(value || '').trim()).replace(/%/g, '~')
}

function compareDisplayPath(left: string, right: string) {
  return left.localeCompare(right, 'zh-Hans-CN')
}

function compareNodeId(left: string, right: string) {
  return left.localeCompare(right, 'zh-Hans-CN')
}

function compareTreeChild(
  leftNodeId: string,
  rightNodeId: string,
  folderNodeByPath: Map<string, DocTreeNodeRecord>,
  documentNodeById: Map<string, DocTreeNodeRecord>
) {
  const nodes = [
    ...Array.from(folderNodeByPath.values()),
    ...Array.from(documentNodeById.values())
  ]
  const nodeById = new Map(nodes.map((node) => [node.nodeId, node]))
  return compareNodeTitle(nodeById.get(leftNodeId), nodeById.get(rightNodeId))
}

function compareNodeTitle(left: DocTreeNodeRecord | undefined, right: DocTreeNodeRecord | undefined) {
  const leftRank = left?.nodeKind === 'folder' ? 0 : 1
  const rightRank = right?.nodeKind === 'folder' ? 0 : 1
  const rankCompare = leftRank - rightRank
  if (rankCompare !== 0) return rankCompare
  return String(left?.title || left?.nodeId || '').localeCompare(String(right?.title || right?.nodeId || ''), 'zh-Hans-CN')
}
