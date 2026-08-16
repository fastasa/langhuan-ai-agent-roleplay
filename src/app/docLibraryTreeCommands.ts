import { normalizeRelationSystemState } from './relationSystem'
import {
  DOC_LIBRARY_ROOT_ORDER_BUCKET_ID,
  DOC_TREE_ROOT_NODE_ID,
  buildDocumentNodeId,
  buildStableFolderNodeId,
  fieldTreeToPathTree,
  normalizeDocLibraryV1ToV2,
  pathTreeToFieldTree,
  type PathTreeToFieldTreeResult
} from './docLibraryTreeMigration'
import { buildDocLibraryTreeDiffReport } from './docLibraryTreeDiffReport'
import { chooseUnitTreeMarkdownFileName } from './unitTreePathTargets'
import type {
  BrainDocumentRecord,
  DocLibraryStateSnapshot,
  DocLibraryTreeDiffReport,
  DocTreeNodeRecord,
  DocTreeOrders,
  RelationSystemState
} from '../types'

export type DocLibraryTreeCommand =
  | { type: 'replace_documents'; documents: BrainDocumentRecord[] }
  | { type: 'replace_manual_orders'; manualTreeOrders: Record<string, string[]> }
  | { type: 'replace_state'; documents: BrainDocumentRecord[]; manualTreeOrders: Record<string, string[]> }
  | { type: 'upsert_document'; document: BrainDocumentRecord; parentFolderId?: string; targetChildId?: string; position?: 'before' | 'after' }
  | { type: 'create_folder'; folderPath: string }
  | { type: 'delete_documents'; documentIds: string[] }
  | { type: 'delete_folder'; folderPath: string }
  | { type: 'rename_document'; documentId: string; title: string; displayPath?: string }
  | { type: 'rename_folder'; sourcePath: string; targetPath: string }
  | { type: 'move_documents'; documentIds: string[]; parentFolderId: string; targetChildId?: string; position?: 'before' | 'after' }
  | { type: 'move_folder'; sourcePath: string; parentFolderId: string; title?: string; targetChildId?: string; position?: 'before' | 'after' }
  | { type: 'sort_children'; parentFolderId: string; childEntryIds: string[] }
  | { type: 'set_folder_overview'; folderPath: string; overviewDocumentId: string }
  | { type: 'rebuild_field_tree' }

export interface DocLibraryTreeCommandState {
  documents: BrainDocumentRecord[]
  manualTreeOrders: Record<string, string[]>
  treeNodes?: DocTreeNodeRecord[]
  treeOrders?: DocTreeOrders
  treeDiffReport?: DocLibraryTreeDiffReport
  relationSystemState: RelationSystemState
}

export interface DocLibraryTreeCommandResult extends DocLibraryStateSnapshot {
  command: DocLibraryTreeCommand['type']
  commandAudit: {
    ok: boolean
    issueCount: number
    blockerCount: number
    warningCount: number
    message: string
  }
}

export function applyDocLibraryTreeCommand(
  state: DocLibraryTreeCommandState,
  command: DocLibraryTreeCommand
): DocLibraryTreeCommandResult {
  const baseState = normalizeCommandState(state)
  const nextState = applyFieldTreeMutation(baseState, command)
  return buildTreeCommandResult(nextState, command.type)
}

export function buildDocLibraryTreeCommandResult(state: DocLibraryTreeCommandState): DocLibraryTreeCommandResult {
  return buildTreeCommandResult(normalizeCommandState(state), 'rebuild_field_tree')
}

function applyFieldTreeMutation(
  state: DocLibraryTreeCommandState,
  command: DocLibraryTreeCommand
): DocLibraryTreeCommandState {
  const fieldState = ensureFieldTreeState(state)
  if (command.type === 'replace_documents') {
    return { ...state, documents: cloneDocuments(command.documents), treeNodes: undefined, treeOrders: undefined, treeDiffReport: undefined }
  }
  if (command.type === 'replace_manual_orders') {
    return { ...state, manualTreeOrders: normalizeManualTreeOrders(command.manualTreeOrders), treeNodes: undefined, treeOrders: undefined, treeDiffReport: undefined }
  }
  if (command.type === 'replace_state') {
    return {
      ...state,
      documents: cloneDocuments(command.documents),
      manualTreeOrders: normalizeManualTreeOrders(command.manualTreeOrders),
      treeNodes: undefined,
      treeOrders: undefined,
      treeDiffReport: undefined
    }
  }
  if (command.type === 'upsert_document') {
    return upsertDocumentNode(fieldState, command)
  }
  if (command.type === 'create_folder') {
    // 新建空文件夹（2026-07-07 星依单位工具批次1）：直接复用 ensureFolderPathState 逐段补建链路；
    // 与 upsert/move 隐式建枝同一套真值，只是不必附带文档。
    return syncFieldTreeCompat(ensureFolderPathState(fieldState, command.folderPath, new Date().toISOString()))
  }
  if (command.type === 'delete_documents') {
    const deletingIds = new Set(command.documentIds.map((item) => String(item || '').trim()).filter(Boolean))
    const deletingNodeIds = new Set<string>()
    fieldState.treeNodes?.forEach((node) => {
      if (node.nodeKind === 'document' && node.documentId && deletingIds.has(node.documentId)) {
        deletingNodeIds.add(node.nodeId)
      }
    })
    return syncFieldTreeCompat({
      ...fieldState,
      documents: fieldState.documents.filter((document) => !deletingIds.has(getDocumentId(document))),
      treeNodes: (fieldState.treeNodes || []).filter((node) => !deletingNodeIds.has(node.nodeId)),
      treeOrders: removeTreeOrderEntries(fieldState.treeOrders || {}, deletingNodeIds)
    })
  }
  if (command.type === 'delete_folder') {
    const folderNode = resolveFolderNode(fieldState.treeNodes || [], command.folderPath)
    if (!folderNode) return fieldState
    const removingNodeIds = collectDescendantNodeIds(fieldState.treeNodes || [], folderNode.nodeId)
    const deletingDocumentIds = new Set<string>()
    ;(fieldState.treeNodes || []).forEach((node) => {
      if (removingNodeIds.has(node.nodeId) && node.nodeKind === 'document' && node.documentId) {
        deletingDocumentIds.add(node.documentId)
      }
    })
    return syncFieldTreeCompat({
      ...fieldState,
      documents: fieldState.documents.filter((document) => !deletingDocumentIds.has(getDocumentId(document))),
      treeNodes: (fieldState.treeNodes || []).filter((node) => !removingNodeIds.has(node.nodeId)),
      treeOrders: removeTreeOrderEntries(fieldState.treeOrders || {}, removingNodeIds)
    })
  }
  if (command.type === 'rename_document') {
    const now = new Date().toISOString()
    const nextTreeNodes = (fieldState.treeNodes || []).map((node) => {
      if (node.nodeKind !== 'document' || node.documentId !== command.documentId) return node
      return {
        ...node,
        title: command.title || node.title,
        legacyDisplayPath: command.displayPath ? normalizeDisplayPath(command.displayPath) : node.legacyDisplayPath,
        updatedAt: now
      }
    })
    return syncFieldTreeCompat({
      ...fieldState,
      documents: fieldState.documents.map((document) => {
        if (getDocumentId(document) !== command.documentId) return document
        return {
          ...document,
          title: command.title || document.title,
          updatedAt: now
        }
      }),
      treeNodes: nextTreeNodes
    })
  }
  if (command.type === 'rename_folder') {
    const folderNode = resolveFolderNode(fieldState.treeNodes || [], command.sourcePath)
    if (!folderNode) return fieldState
    const targetPath = normalizeFolderPath(command.targetPath)
    const now = new Date().toISOString()
    const sourcePath = resolveNodeDisplayPath(folderNode, fieldState.treeNodes || [], true)
    const descendantIds = collectDescendantNodeIds(fieldState.treeNodes || [], folderNode.nodeId)
    const nextTreeNodes = (fieldState.treeNodes || []).map((node) => {
      if (!descendantIds.has(node.nodeId)) return node
      if (node.nodeId === folderNode.nodeId) {
        return {
          ...node,
          title: targetPath.split('/').filter(Boolean).pop() || node.title,
          legacyDisplayPath: targetPath,
          updatedAt: now
        }
      }
      return {
        ...node,
        legacyDisplayPath: node.legacyDisplayPath ? replacePathPrefix(node.legacyDisplayPath, sourcePath, targetPath) : node.legacyDisplayPath,
        updatedAt: now
      }
    })
    return syncFieldTreeCompat({ ...fieldState, treeNodes: nextTreeNodes })
  }
  if (command.type === 'move_documents') {
    return moveDocumentNodes(fieldState, command)
  }
  if (command.type === 'move_folder') {
    return moveFolderNode(fieldState, command)
  }
  if (command.type === 'sort_children') {
    const parentNodeId = resolveParentNodeId(fieldState.treeNodes || [], command.parentFolderId)
    if (!parentNodeId) return fieldState
    const existingChildIds = new Set((fieldState.treeNodes || [])
      .filter((node) => node.parentId === parentNodeId)
      .map((node) => node.nodeId))
    const ordered = command.childEntryIds
      .map((item) => legacyOrderEntryToNodeId(fieldState.treeNodes || [], item))
      .filter((nodeId): nodeId is string => Boolean(nodeId && existingChildIds.has(nodeId)))
    const seen = new Set<string>()
    const deduped = ordered.filter((nodeId) => {
      if (seen.has(nodeId)) return false
      seen.add(nodeId)
      return true
    })
    const remainder = Array.from(existingChildIds).filter((nodeId) => !seen.has(nodeId))
    return syncFieldTreeCompat({
      ...fieldState,
      treeOrders: {
        ...(fieldState.treeOrders || {}),
        [parentNodeId]: [...deduped, ...remainder]
      }
    })
  }
  if (command.type === 'set_folder_overview') {
    const folderNode = resolveFolderNode(fieldState.treeNodes || [], command.folderPath)
    if (!folderNode) return fieldState
    return syncFieldTreeCompat({
      ...fieldState,
      treeNodes: (fieldState.treeNodes || []).map((node) => node.nodeId === folderNode.nodeId
        ? { ...node, overviewDocumentId: command.overviewDocumentId, updatedAt: new Date().toISOString() }
        : node)
    })
  }
  return fieldState
}

function upsertDocumentNode(
  state: DocLibraryTreeCommandState,
  command: Extract<DocLibraryTreeCommand, { type: 'upsert_document' }>
): DocLibraryTreeCommandState {
  const documentId = getDocumentId(command.document)
  if (!documentId) return state
  const now = command.document.updatedAt || new Date().toISOString()
  const withParent = ensureFolderPathState(state, command.parentFolderId || getParentFolderPath(command.document.displayPath), now)
  const parentNodeId = resolveParentNodeId(withParent.treeNodes || [], command.parentFolderId || getParentFolderPath(command.document.displayPath)) || DOC_TREE_ROOT_NODE_ID
  const parentPath = resolveParentDisplayPath(withParent.treeNodes || [], parentNodeId)
  const filename = getFilenameFromDisplayPath(command.document.displayPath) || ensureMarkdownFilename(command.document.title || documentId)
  const legacyDisplayPath = `${parentPath || ''}/${filename}`.replace(/\/{2,}/g, '/') || `/${filename}`
  const documentNodeId = buildDocumentNodeId(documentId)
  const existingNode = (withParent.treeNodes || []).find((node) => node.nodeKind === 'document' && node.documentId === documentId)
  const nextNode: DocTreeNodeRecord = existingNode
    ? {
        ...existingNode,
        parentId: parentNodeId,
        title: command.document.title || existingNode.title,
        legacyDisplayPath,
        updatedAt: now
      }
    : {
        nodeId: documentNodeId,
        nodeKind: 'document',
        parentId: parentNodeId,
        title: command.document.title || documentId,
        documentId,
        legacyDisplayPath,
        status: 'active',
        createdAt: command.document.createdAt || now,
        updatedAt: now
      }
  const nextNodes = existingNode
    ? (withParent.treeNodes || []).map((node) => node.nodeId === existingNode.nodeId ? nextNode : node)
    : [...(withParent.treeNodes || []), nextNode]
  const normalizedTreeOrders = normalizeTreeOrders(withParent.treeOrders || {})
  const shouldKeepExistingOrder = Boolean(
    existingNode
      && existingNode.parentId === parentNodeId
      && !command.targetChildId
      && command.position === undefined
      && (normalizedTreeOrders[parentNodeId] || []).includes(nextNode.nodeId)
  )
  const treeOrders = shouldKeepExistingOrder
    ? normalizedTreeOrders
    : insertTreeOrderEntries(
      removeTreeOrderEntries(normalizedTreeOrders, new Set([nextNode.nodeId])),
      parentNodeId,
      [nextNode.nodeId],
      command.targetChildId,
      command.position
    )
  return syncFieldTreeCompat({
    ...withParent,
    documents: upsertDocumentRecord(withParent.documents, {
      ...command.document,
      displayPath: legacyDisplayPath,
      updatedAt: now
    }),
    treeNodes: nextNodes,
    treeOrders
  })
}

function moveDocumentNodes(
  state: DocLibraryTreeCommandState,
  command: Extract<DocLibraryTreeCommand, { type: 'move_documents' }>
): DocLibraryTreeCommandState {
  const documentIds = Array.from(new Set(command.documentIds.map((item) => String(item || '').trim()).filter(Boolean)))
  if (!documentIds.length) return state
  const withParent = ensureFolderPathState(state, command.parentFolderId)
  const parentNodeId = resolveParentNodeId(withParent.treeNodes || [], command.parentFolderId) || DOC_TREE_ROOT_NODE_ID
  const parentPath = resolveParentDisplayPath(withParent.treeNodes || [], parentNodeId)
  const movingNodeIds = new Set<string>()
  const now = new Date().toISOString()
  const nextNodes = (withParent.treeNodes || []).map((node) => {
    if (node.nodeKind !== 'document' || !node.documentId || !documentIds.includes(node.documentId)) return node
    movingNodeIds.add(node.nodeId)
    const filename = chooseUnitTreeMarkdownFileName({
      currentFileName: getFilenameFromDisplayPath(node.legacyDisplayPath),
      title: node.title || node.documentId,
      slugify: (value) => String(value || '').trim() || '未命名'
    })
    return {
      ...node,
      parentId: parentNodeId,
      legacyDisplayPath: `${parentPath || ''}/${filename}`.replace(/\/{2,}/g, '/') || `/${filename}`,
      updatedAt: now
    }
  })
  if (!movingNodeIds.size) return withParent
  const treeOrders = removeTreeOrderEntries(withParent.treeOrders || {}, movingNodeIds)
  return syncFieldTreeCompat({
    ...withParent,
    treeNodes: nextNodes,
    treeOrders: insertTreeOrderEntries(treeOrders, parentNodeId, Array.from(movingNodeIds), command.targetChildId, command.position)
  })
}

function moveFolderNode(
  state: DocLibraryTreeCommandState,
  command: Extract<DocLibraryTreeCommand, { type: 'move_folder' }>
): DocLibraryTreeCommandState {
  const sourceNode = resolveFolderNode(state.treeNodes || [], command.sourcePath)
  if (!sourceNode) return state
  const withParent = ensureFolderPathState(state, command.parentFolderId)
  const parentNodeId = resolveParentNodeId(withParent.treeNodes || [], command.parentFolderId) || DOC_TREE_ROOT_NODE_ID
  const descendantIds = collectDescendantNodeIds(withParent.treeNodes || [], sourceNode.nodeId)
  if (descendantIds.has(parentNodeId)) return withParent
  const parentPath = resolveParentDisplayPath(withParent.treeNodes || [], parentNodeId)
  const title = String(command.title || sourceNode.title || '').trim() || getFolderNameFromPath(command.sourcePath) || '新枝'
  const oldPath = resolveNodeDisplayPath(sourceNode, withParent.treeNodes || [], true)
  const nextPath = `${parentPath || ''}/${title}`.replace(/\/{2,}/g, '/') || `/${title}`
  const now = new Date().toISOString()
  const nextNodes = (withParent.treeNodes || []).map((node) => {
    if (!descendantIds.has(node.nodeId)) return node
    if (node.nodeId === sourceNode.nodeId) {
      return {
        ...node,
        parentId: parentNodeId,
        title,
        legacyDisplayPath: nextPath,
        updatedAt: now
      }
    }
    return {
      ...node,
      legacyDisplayPath: node.legacyDisplayPath ? replacePathPrefix(node.legacyDisplayPath, oldPath, nextPath) : node.legacyDisplayPath,
      updatedAt: now
    }
  })
  const treeOrders = removeTreeOrderEntries(withParent.treeOrders || {}, new Set([sourceNode.nodeId]))
  return syncFieldTreeCompat({
    ...withParent,
    treeNodes: nextNodes,
    treeOrders: insertTreeOrderEntries(treeOrders, parentNodeId, [sourceNode.nodeId], command.targetChildId, command.position)
  })
}

function buildTreeCommandResult(
  state: DocLibraryTreeCommandState,
  commandType: DocLibraryTreeCommand['type']
): DocLibraryTreeCommandResult {
  try {
    const fieldState = ensureFieldTreeState(state)
    const compat = fieldTreeToPathTree({
      documents: fieldState.documents,
      treeNodes: fieldState.treeNodes,
      treeOrders: fieldState.treeOrders
    })
    const treeDiffReport = buildDocLibraryTreeDiffReport({
      documents: compat.documents,
      manualTreeOrders: compat.manualTreeOrders,
      treeNodes: fieldState.treeNodes,
      treeOrders: fieldState.treeOrders,
      treeSource: 'field'
    })
    return {
      schemaVersion: 2,
      documents: compat.documents,
      manualTreeOrders: compat.manualTreeOrders,
      treeNodes: fieldState.treeNodes,
      treeOrders: fieldState.treeOrders,
      treeMigrationMeta: {
        treeSource: 'field',
        generatedAt: new Date().toISOString(),
        hasBlockingIssues: !treeDiffReport.canUseFieldTree
      },
      relationSystemState: fieldState.relationSystemState,
      treeDiffReport,
      command: commandType,
      commandAudit: buildCommandAudit(null, treeDiffReport.canUseFieldTree, treeDiffReport.canUseFieldTree ? '' : '字段树差异报告存在阻断项。', treeDiffReport)
    }
  } catch (error) {
    return {
      schemaVersion: 1,
      documents: state.documents,
      manualTreeOrders: state.manualTreeOrders,
      treeNodes: [],
      treeOrders: {},
      treeMigrationMeta: {
        treeSource: 'path',
        generatedAt: new Date().toISOString(),
        hasBlockingIssues: true,
        auditReportPath: `tree-command-error:${(error as Error).message}`
      },
      treeDiffReport: {
        generatedAt: new Date().toISOString(),
        treeSource: 'path',
        blockerCount: 1,
        warningCount: 0,
        documentPathMismatchCount: 0,
        manualOrderMismatchCount: 0,
        missingDocumentNodeCount: 0,
        extraDocumentNodeCount: 0,
        issues: [{
          severity: 'blocker',
          code: 'tree_command_convert_failed',
          message: (error as Error).message
        }],
        canUseFieldTree: false
      },
      relationSystemState: state.relationSystemState,
      command: commandType,
      commandAudit: {
        ok: false,
        issueCount: 1,
        blockerCount: 1,
        warningCount: 0,
        message: (error as Error).message
      }
    }
  }
}

export function toLegacyPathTreeSnapshot(result: DocLibraryTreeCommandResult): DocLibraryStateSnapshot {
  const converted = fieldTreeToPathTree({
    documents: result.documents,
    treeNodes: result.treeNodes,
    treeOrders: result.treeOrders,
    manualTreeOrders: result.manualTreeOrders
  })
  return {
    schemaVersion: 1,
    documents: converted.documents,
    manualTreeOrders: converted.manualTreeOrders,
    relationSystemState: result.relationSystemState
  }
}

function buildCommandAudit(
  converted: PathTreeToFieldTreeResult | null,
  ok: boolean,
  message: string,
  treeDiffReport: { blockerCount: number; warningCount: number }
) {
  return {
    ok,
    issueCount: treeDiffReport.blockerCount + treeDiffReport.warningCount + (converted?.treeMigrationMeta.hasBlockingIssues ? 1 : 0),
    blockerCount: treeDiffReport.blockerCount + (converted?.treeMigrationMeta.hasBlockingIssues ? 1 : 0),
    warningCount: treeDiffReport.warningCount,
    message: message || '字段树命令结果可无损派生旧路径兼容结构。'
  }
}

function normalizeCommandState(state: DocLibraryTreeCommandState): DocLibraryTreeCommandState {
  return {
    documents: cloneDocuments(state.documents),
    manualTreeOrders: normalizeManualTreeOrders(state.manualTreeOrders),
    treeNodes: Array.isArray(state.treeNodes) ? state.treeNodes.map((node) => ({ ...node })) : undefined,
    treeOrders: normalizeTreeOrders(state.treeOrders),
    treeDiffReport: state.treeDiffReport,
    relationSystemState: normalizeRelationSystemState(state.relationSystemState)
  }
}

function ensureFieldTreeState(state: DocLibraryTreeCommandState): DocLibraryTreeCommandState {
  if (Array.isArray(state.treeNodes) && state.treeNodes.length > 0 && state.treeDiffReport?.canUseFieldTree !== false) {
    return syncFieldTreeCompat(state)
  }
  return buildPathSourcedState(state)
}

function buildPathSourcedState(state: DocLibraryTreeCommandState): DocLibraryTreeCommandState {
  const converted = pathTreeToFieldTree({
    documents: state.documents,
    manualTreeOrders: state.manualTreeOrders,
    generatedAt: new Date().toISOString()
  })
  return syncFieldTreeCompat({
    ...state,
    treeNodes: converted.treeNodes,
    treeOrders: converted.treeOrders
  })
}

function syncFieldTreeCompat(state: DocLibraryTreeCommandState): DocLibraryTreeCommandState {
  const compat = fieldTreeToPathTree({
    documents: state.documents,
    treeNodes: state.treeNodes,
    treeOrders: state.treeOrders
  })
  return {
    ...state,
    documents: compat.documents,
    manualTreeOrders: compat.manualTreeOrders,
    treeNodes: Array.isArray(state.treeNodes) ? state.treeNodes.map((node) => ({ ...node })) : [],
    treeOrders: normalizeTreeOrders(state.treeOrders)
  }
}

function cloneDocuments(documents: BrainDocumentRecord[]) {
  return (Array.isArray(documents) ? documents : []).map((document) => ({ ...document }))
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

function normalizeDisplayPath(value: unknown) {
  const segments = String(value || '').replace(/\\/g, '/').split('/').map((item) => item.trim()).filter(Boolean)
  return segments.length ? `/${segments.join('/')}` : ''
}

function normalizeFolderPath(value: unknown) {
  return normalizeDisplayPath(value).replace(/\/index\.md$/i, '') || '/'
}

function replacePathPrefix(path: string, oldPrefix: string, newPrefix: string) {
  const safePath = normalizeDisplayPath(path)
  const safeOldPrefix = normalizeFolderPath(oldPrefix)
  const safeNewPrefix = normalizeFolderPath(newPrefix)
  if (safePath === safeOldPrefix) return safeNewPrefix
  if (safePath === `${safeOldPrefix}/index.md`) return `${safeNewPrefix}/index.md`
  if (!safePath.startsWith(`${safeOldPrefix}/`)) return safePath
  return `${safeNewPrefix}${safePath.slice(safeOldPrefix.length)}`.replace(/\/{2,}/g, '/')
}

function getDocumentId(document: BrainDocumentRecord) {
  return String(document.documentId || document.id || document.stableId || '').trim()
}

function upsertDocumentRecord(documents: BrainDocumentRecord[], nextDocument: BrainDocumentRecord) {
  const documentId = getDocumentId(nextDocument)
  const hasExisting = documents.some((document) => getDocumentId(document) === documentId)
  return hasExisting
    ? documents.map((document) => getDocumentId(document) === documentId ? { ...nextDocument } : document)
    : [...documents, { ...nextDocument }]
}

function resolveFolderNode(nodes: DocTreeNodeRecord[], folderPathOrId: string) {
  const safeValue = String(folderPathOrId || '').trim()
  const safePath = normalizeFolderPath(safeValue)
  return nodes.find((node) => node.nodeKind === 'folder' && (
    node.nodeId === safeValue
    || normalizeFolderPath(node.legacyDisplayPath) === safePath
    || resolveNodeDisplayPath(node, nodes, true) === safePath
  ))
}

function resolveParentNodeId(nodes: DocTreeNodeRecord[], parentFolderId: string) {
  const safeParentId = String(parentFolderId || DOC_LIBRARY_ROOT_ORDER_BUCKET_ID).trim() || DOC_LIBRARY_ROOT_ORDER_BUCKET_ID
  if (safeParentId === DOC_LIBRARY_ROOT_ORDER_BUCKET_ID || safeParentId === DOC_TREE_ROOT_NODE_ID) return DOC_TREE_ROOT_NODE_ID
  return resolveFolderNode(nodes, safeParentId)?.nodeId
}

function ensureFolderPathState(
  state: DocLibraryTreeCommandState,
  folderPathOrId: string | undefined,
  now = new Date().toISOString()
): DocLibraryTreeCommandState {
  const safeValue = String(folderPathOrId || DOC_LIBRARY_ROOT_ORDER_BUCKET_ID).trim() || DOC_LIBRARY_ROOT_ORDER_BUCKET_ID
  if (safeValue === DOC_LIBRARY_ROOT_ORDER_BUCKET_ID || safeValue === DOC_TREE_ROOT_NODE_ID) return state
  if (resolveFolderNode(state.treeNodes || [], safeValue)) return state
  const folderPath = normalizeFolderPath(safeValue)
  const segments = folderPath.split('/').filter(Boolean)
  let parentId = DOC_TREE_ROOT_NODE_ID
  let currentPath = ''
  const nextNodes = [...(state.treeNodes || [])]
  const nextOrders = normalizeTreeOrders(state.treeOrders)
  segments.forEach((segment) => {
    currentPath = `${currentPath}/${segment}`.replace(/\/{2,}/g, '/')
    const existingNode = resolveFolderNode(nextNodes, currentPath)
    if (existingNode) {
      parentId = existingNode.nodeId
      return
    }
    // 止血（2026-07-04）：新建文件夹发稳定短码 nodeId，不再从中文路径编码派生超长乱码 id；
    // 存量脏 id 不迁移（读侧兼容），模型侧由提调检索短码映射（tidiaoUnitIdCodec）兜住。
    const nodeId = buildStableFolderNodeId()
    if (!nextNodes.some((node) => node.nodeId === nodeId)) {
      nextNodes.push({
        nodeId,
        nodeKind: 'folder',
        parentId,
        title: segment,
        legacyDisplayPath: currentPath,
        status: 'active',
        createdAt: now,
        updatedAt: now
      })
      nextOrders[parentId] = [...(nextOrders[parentId] || []), nodeId]
    }
    parentId = nodeId
  })
  return {
    ...state,
    treeNodes: nextNodes,
    treeOrders: nextOrders
  }
}

function resolveParentDisplayPath(nodes: DocTreeNodeRecord[], parentNodeId: string) {
  if (!parentNodeId || parentNodeId === DOC_TREE_ROOT_NODE_ID) return ''
  const parentNode = nodes.find((node) => node.nodeId === parentNodeId)
  return parentNode ? resolveNodeDisplayPath(parentNode, nodes, true) : ''
}

function collectDescendantNodeIds(nodes: DocTreeNodeRecord[], rootNodeId: string) {
  const result = new Set<string>([rootNodeId])
  let changed = true
  while (changed) {
    changed = false
    nodes.forEach((node) => {
      if (node.parentId && result.has(node.parentId) && !result.has(node.nodeId)) {
        result.add(node.nodeId)
        changed = true
      }
    })
  }
  return result
}

function removeTreeOrderEntries(treeOrders: DocTreeOrders, removingNodeIds: Set<string>) {
  return Object.fromEntries(
    Object.entries(normalizeTreeOrders(treeOrders))
      .filter(([parentId]) => !removingNodeIds.has(parentId))
      .map(([parentId, childIds]) => [
        parentId,
        childIds.filter((childId) => !removingNodeIds.has(childId))
      ])
  )
}

function insertTreeOrderEntries(
  treeOrders: DocTreeOrders,
  parentNodeId: string,
  childNodeIds: string[],
  targetChildId = '',
  position: 'before' | 'after' = 'after'
) {
  const current = normalizeTreeOrders(treeOrders)[parentNodeId] || []
  const movingSet = new Set(childNodeIds)
  const targetNodeId = legacyOrderEntryToNodeId([], targetChildId) || String(targetChildId || '').trim()
  const remaining = current.filter((nodeId) => !movingSet.has(nodeId))
  const targetIndex = targetNodeId ? remaining.indexOf(targetNodeId) : -1
  const insertIndex = targetIndex >= 0
    ? targetIndex + (position === 'after' ? 1 : 0)
    : remaining.length
  remaining.splice(insertIndex, 0, ...childNodeIds)
  return {
    ...normalizeTreeOrders(treeOrders),
    [parentNodeId]: remaining
  }
}

function legacyOrderEntryToNodeId(nodes: DocTreeNodeRecord[], entry: string) {
  const safeEntry = String(entry || '').trim()
  if (safeEntry.startsWith('document:')) {
    const documentId = safeEntry.slice('document:'.length).trim()
    return nodes.find((node) => node.nodeKind === 'document' && node.documentId === documentId)?.nodeId
  }
  if (safeEntry.startsWith('folder:')) {
    return resolveFolderNode(nodes, safeEntry.slice('folder:'.length))?.nodeId
  }
  if (safeEntry.startsWith('doc:')) return safeEntry
  return nodes.some((node) => node.nodeId === safeEntry) ? safeEntry : undefined
}

function resolveNodeDisplayPath(node: DocTreeNodeRecord, nodes: DocTreeNodeRecord[], folderOnly = false) {
  if (node.legacyDisplayPath) return folderOnly
    ? normalizeFolderPath(node.legacyDisplayPath)
    : normalizeDisplayPath(node.legacyDisplayPath)
  const nodeById = new Map(nodes.map((item) => [item.nodeId, item]))
  const segments: string[] = []
  let current: DocTreeNodeRecord | undefined = node
  const visited = new Set<string>()
  while (current && current.nodeId !== DOC_TREE_ROOT_NODE_ID && !visited.has(current.nodeId)) {
    visited.add(current.nodeId)
    if (current.nodeKind === 'document' && !folderOnly) {
      segments.unshift(ensureMarkdownFilename(current.title || current.documentId || current.nodeId))
    } else if (current.nodeKind === 'folder') {
      segments.unshift(current.title || current.nodeId)
    }
    current = current.parentId ? nodeById.get(current.parentId) : undefined
  }
  return segments.length ? `/${segments.join('/')}` : ''
}

function ensureMarkdownFilename(value: string) {
  const safeValue = String(value || '').trim() || '未命名'
  return /\.md$/i.test(safeValue) ? safeValue : `${safeValue}.md`
}

function getParentFolderPath(displayPath: string) {
  const segments = normalizeDisplayPath(displayPath).split('/').filter(Boolean)
  segments.pop()
  return segments.length ? `/${segments.join('/')}` : DOC_LIBRARY_ROOT_ORDER_BUCKET_ID
}

function getFilenameFromDisplayPath(displayPath: string | undefined) {
  return normalizeDisplayPath(displayPath).split('/').filter(Boolean).pop() || ''
}

function getFolderNameFromPath(folderPath: string) {
  return normalizeFolderPath(folderPath).split('/').filter(Boolean).pop() || ''
}

function remapManualOrdersForFolderRename(orders: Record<string, string[]>, oldPrefix: string, newPrefix: string) {
  return Object.fromEntries(
    Object.entries(normalizeManualTreeOrders(orders)).map(([key, values]) => {
      const nextKey = key === '__root__' ? key : replacePathPrefix(key, oldPrefix, newPrefix)
      const nextValues = values.map((item) => {
        if (!item.startsWith('folder:')) return item
        const folderPath = item.replace(/^folder:/, '')
        return `folder:${replacePathPrefix(folderPath, oldPrefix, newPrefix)}`
      })
      return [nextKey, nextValues]
    })
  )
}

function removeFolderOrders(orders: Record<string, string[]>, folderPath: string) {
  const safeFolderPath = normalizeFolderPath(folderPath)
  return Object.fromEntries(
    Object.entries(normalizeManualTreeOrders(orders))
      .filter(([key]) => key === '__root__' || (key !== safeFolderPath && !key.startsWith(`${safeFolderPath}/`)))
      .map(([key, values]) => [
        key,
        values.filter((entry) => !entry.startsWith(`folder:${safeFolderPath}`))
      ])
  )
}
