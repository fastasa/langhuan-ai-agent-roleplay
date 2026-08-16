import { normalizeDocLibraryDisplayPath } from './docLibraryPathCompat'

export type DocLibraryTreeNodeLike = {
  nodeId?: unknown
  nodeKind?: unknown
  documentId?: unknown
}

export function buildDocumentTreeNodeIdIndex(nodes: DocLibraryTreeNodeLike[]) {
  const index = new Map<string, string>()
  for (const node of Array.isArray(nodes) ? nodes : []) {
    if (node.nodeKind !== 'document') continue
    const documentId = String(node.documentId || '').trim()
    const nodeId = String(node.nodeId || '').trim()
    if (documentId && nodeId) index.set(documentId, nodeId)
  }
  return index
}

export function orderDocLibraryTreeChildNodeIds(input: {
  parentNodeId: string
  folderNodeIds: string[]
  documentIds: string[]
  treeOrders: Record<string, string[]>
  documentTreeNodeIdByDocumentId: Map<string, string>
}) {
  const knownNodeIds = [
    ...input.folderNodeIds.map((id) => String(id || '').trim()).filter(Boolean),
    ...input.documentIds.map((id) => {
      const documentId = String(id || '').trim()
      return input.documentTreeNodeIdByDocumentId.get(documentId)
        || `doc:${encodeURIComponent(documentId).replace(/%/g, '~')}`
    }).filter(Boolean)
  ]
  const orderRank = new Map((input.treeOrders[input.parentNodeId] || []).map((id, index) => [id, index]))
  return knownNodeIds.sort((left, right) => {
    const leftRank = orderRank.get(left)
    const rightRank = orderRank.get(right)
    if (leftRank !== undefined || rightRank !== undefined) {
      if (leftRank === undefined) return 1
      if (rightRank === undefined) return -1
      return leftRank - rightRank
    }
    return left.localeCompare(right, 'zh-Hans-CN')
  })
}

export function getDocLibraryDocumentFolderPath(displayPath: string) {
  const normalized = normalizeDocLibraryDisplayPath(displayPath || '/')
  const segments = normalized.split('/').filter(Boolean)
  return segments.length <= 1 ? '/' : `/${segments.slice(0, -1).join('/')}`
}

function getAncestorFolderPath(path: string) {
  const segments = String(path || '').split('/').filter(Boolean)
  return segments.length <= 1 ? '' : `/${segments.slice(0, -1).join('/')}`
}

export function collectDocLibraryAncestorFolderMatches(displayPath: string, candidates: Set<string>) {
  const matches: string[] = []
  let current = getDocLibraryDocumentFolderPath(displayPath)
  while (current && current !== '/') {
    if (candidates.has(current)) matches.push(current)
    current = getAncestorFolderPath(current)
  }
  return matches
}

export function findDeepestDocLibraryFolderPrefix<T>(displayPath: string, candidates: Map<string, T>) {
  let current = getDocLibraryDocumentFolderPath(displayPath)
  while (current && current !== '/') {
    if (candidates.has(current)) return current
    current = getAncestorFolderPath(current)
  }
  return ''
}

export function buildDirectChildFolderNameIndex<T extends { id: string; parentFolderPath: string; folderPath: string }>(folders: Iterable<T>) {
  const index = new Map<string, Set<string>>()
  const seen = new Set<string>()
  for (const folder of folders) {
    if (seen.has(folder.id)) continue
    seen.add(folder.id)
    const parentPath = normalizeDocLibraryDisplayPath(folder.parentFolderPath || '/')
    const childName = String(folder.folderPath || '').split('/').filter(Boolean).pop() || ''
    if (!childName) continue
    const children = index.get(parentPath)
    if (children) children.add(childName)
    else index.set(parentPath, new Set([childName]))
  }
  return index
}
