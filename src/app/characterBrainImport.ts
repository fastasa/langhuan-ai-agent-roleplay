import type {
  BrainDocumentRecord,
  CharacterBrainCognitionNodeKind,
  CharacterBrainCognitionNode,
  CharacterBrainImportApplyResult,
  CharacterBrainImportConflictAction,
  CharacterBrainImportDraft,
  CharacterBrainImportDraftNode,
  CharacterBrainImportError,
  CharacterBrainImportParseResult,
  CharacterBrainImportPreview,
  CharacterBrainImportWarning
} from '../types'
import { migrateCharacterBrainImportedReferences } from './characterBrainPrivateReferenceMigration'

type JsonObjectSpan = {
  start: number
  end: number
  text: string
}

type JsonObjectExtractResult =
  | { ok: true; span: JsonObjectSpan; warnings: CharacterBrainImportWarning[] }
  | CharacterBrainImportFailure

type NormalizeImportNodeResult =
  | { ok: true; node: CharacterBrainImportDraftNode }
  | CharacterBrainImportFailure

type CharacterBrainImportFailure = { ok: false; error: CharacterBrainImportError }

type NormalizeNodeContext = {
  path: string
  nextTempId: () => string
}

type ApplyImportOptions = {
  existingNodes: CharacterBrainCognitionNode[]
  parentId: string
  draft: CharacterBrainImportDraft
  conflictActions?: Record<string, CharacterBrainImportConflictAction>
  defaultConflictAction?: CharacterBrainImportConflictAction
  now?: string
  createId?: () => string
}

type WorldTreeFolder = {
  id: string
  title: string
  displayPath: string
  overviewDocument?: BrainDocumentRecord
  children: Map<string, WorldTreeFolder>
  documents: BrainDocumentRecord[]
}

const DEFAULT_IMPORT_ROOT_TITLE = '灵魂导入'
const COGNITION_NODE_ID_PREFIX = 'brain:cognition:node:'
const IMPORT_NODE_KINDS = new Set<CharacterBrainCognitionNodeKind>(['group', 'reference', 'private'])

export function parseCharacterBrainImportJson(input: string): CharacterBrainImportParseResult {
  const rawInput = String(input || '')
  if (!rawInput.trim()) {
    return fail('请先粘贴 AI 生成的灵魂 JSON。')
  }

  const extracted = extractFirstJsonObject(rawInput)
  if (!extracted.ok) return extracted

  let parsed: unknown
  try {
    parsed = JSON.parse(extracted.span.text)
  } catch (error) {
    return fail(formatJsonParseError(error, extracted.span.text, rawInput, extracted.span.start))
  }

  const warnings = [...extracted.warnings]
  return normalizeImportRoot(parsed, warnings)
}

export function buildCharacterBrainImportPreview(
  existingNodes: CharacterBrainCognitionNode[],
  parentId: string,
  draft: CharacterBrainImportDraft
): CharacterBrainImportPreview {
  const conflicts = collectImportConflicts(existingNodes, parentId, draft.nodes)
  return {
    nodes: draft.nodes,
    flatNodes: draft.flatNodes,
    warnings: draft.warnings,
    conflicts
  }
}

export function applyCharacterBrainImportDraft(options: ApplyImportOptions): CharacterBrainImportApplyResult {
  const parentId = normalizeString(options.parentId)
  const now = options.now || new Date().toISOString()
  const createId = options.createId || createCognitionNodeId
  const defaultConflictAction = options.defaultConflictAction || 'skip'
  const conflictActions = options.conflictActions || {}
  const nextNodes = options.existingNodes.map((node) => ({ ...node }))
  const createdNodeIds: string[] = []
  const createdRootNodeIds: string[] = []
  const updatedNodeIds: string[] = []
  const updatedRootNodeIds: string[] = []
  const skippedTempIds: string[] = []

  const upsertDraftNode = (draftNode: CharacterBrainImportDraftNode, targetParentId: string): string | null => {
    const duplicate = findDuplicateCognitionNode(nextNodes, targetParentId, draftNode)
    if (duplicate) {
      const action = conflictActions[draftNode.tempId] || defaultConflictAction
      if (action === 'skip') {
        collectDraftTempIds(draftNode).forEach((tempId) => skippedTempIds.push(tempId))
        return null
      }
      duplicate.title = draftNode.title
      duplicate.summary = draftNode.summary
      duplicate.kind = draftNode.kind
      duplicate.content = draftNode.content
      duplicate.tags = draftNode.tags
      duplicate.relationHints = draftNode.relationHints
      duplicate.compilePage = draftNode.compilePage
      duplicate.sourceDocumentId = draftNode.sourceDocumentId
      duplicate.sourceDisplayPath = draftNode.sourceDisplayPath
      duplicate.sourceDetachedAt = draftNode.sourceDetachedAt ?? duplicate.sourceDetachedAt
      duplicate.sourceSnapshotTitle = draftNode.sourceSnapshotTitle ?? duplicate.sourceSnapshotTitle
      duplicate.sourceSnapshotSummary = draftNode.sourceSnapshotSummary ?? duplicate.sourceSnapshotSummary
      duplicate.updatedAt = now
      updatedNodeIds.push(duplicate.id)
      draftNode.children.forEach((child) => upsertDraftNode(child, duplicate.id))
      return duplicate.id
    }

    const nodeId = createId()
    const nextNode: CharacterBrainCognitionNode = {
      id: nodeId,
      title: draftNode.title,
      summary: draftNode.summary,
      parentId: targetParentId,
      kind: draftNode.kind,
      content: draftNode.content,
      tags: draftNode.tags,
      relationHints: draftNode.relationHints,
      compilePage: draftNode.compilePage,
      sourceDocumentId: draftNode.sourceDocumentId,
      sourceDisplayPath: draftNode.sourceDisplayPath,
      sourceDetachedAt: draftNode.sourceDetachedAt,
      sourceSnapshotTitle: draftNode.sourceSnapshotTitle,
      sourceSnapshotSummary: draftNode.sourceSnapshotSummary,
      createdAt: now,
      updatedAt: now
    }
    nextNodes.push(nextNode)
    createdNodeIds.push(nodeId)
    draftNode.children.forEach((child) => upsertDraftNode(child, nodeId))
    return nodeId
  }

  options.draft.nodes.forEach((node) => {
    const rootNodeId = upsertDraftNode(node, parentId)
    if (!rootNodeId) return
    if (createdNodeIds.includes(rootNodeId)) createdRootNodeIds.push(rootNodeId)
    else if (updatedNodeIds.includes(rootNodeId)) updatedRootNodeIds.push(rootNodeId)
  })

  const migrated = migrateCharacterBrainImportedReferences({
    nodes: nextNodes,
    documents: [],
    now,
    targetNodeIds: [...createdNodeIds, ...updatedNodeIds]
  })

  return {
    nodes: migrated.nodes,
    createdNodeIds,
    createdRootNodeIds: Array.from(new Set(createdRootNodeIds)),
    updatedNodeIds: Array.from(new Set(updatedNodeIds)),
    updatedRootNodeIds: Array.from(new Set(updatedRootNodeIds)),
    skippedTempIds: Array.from(new Set(skippedTempIds))
  }
}

export function buildCharacterBrainWorldTreeImportDraft(
  documents: BrainDocumentRecord[],
  selectedIds: string[]
): CharacterBrainImportDraft {
  const roots = buildWorldTreeFolders(documents)
  const normalizedSelectedIds = new Set(selectedIds.map((id) => normalizeString(id)).filter(Boolean))
  const selectedWithoutCoveredChildren = Array.from(normalizedSelectedIds)
    .filter((id) => !isWorldTreeSelectionCoveredByAncestor(id, normalizedSelectedIds, documents))
  const selectedNodes = selectedWithoutCoveredChildren
    .map((id) => buildWorldTreeDraftNodeBySelectionId(id, roots, documents))
    .filter((node): node is CharacterBrainImportDraftNode => Boolean(node))
  const nodes = selectedNodes.length ? selectedNodes : []
  return {
    version: 1,
    rootTitle: '世界树导入',
    nodes,
    flatNodes: flattenDraftNodes(nodes),
    warnings: collectDuplicateSiblingWarnings(nodes)
  }
}

function extractFirstJsonObject(input: string): JsonObjectExtractResult {
  const trimmed = input.trim()
  const directStart = input.indexOf(trimmed)
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    return {
      ok: true,
      span: {
        start: directStart,
        end: directStart + trimmed.length,
        text: trimmed
      },
      warnings: []
    }
  }

  const spans = collectJsonObjectSpans(input)
  for (const span of spans) {
    try {
      JSON.parse(span.text)
      const ignoredBefore = input.slice(0, span.start).trim()
      const ignoredAfter = input.slice(span.end).trim()
      const warnings: CharacterBrainImportWarning[] = ignoredBefore || ignoredAfter
        ? [{
            code: 'ignored_text',
            message: '已自动截取第一段合法 JSON 对象，并忽略 JSON 外的说明文字。'
          }]
        : []
      return { ok: true, span, warnings }
    } catch {
      // 继续尝试后面的 JSON 对象片段，方便处理 AI 输出里的多段内容。
    }
  }

  if (spans[0]) {
    try {
      JSON.parse(spans[0].text)
    } catch (error) {
      return fail(formatJsonParseError(error, spans[0].text, input, spans[0].start))
    }
  }

  return fail('没有找到合法的 JSON 对象，请确认内容以 { 开始、以 } 结束。')
}

function collectJsonObjectSpans(input: string): JsonObjectSpan[] {
  const spans: JsonObjectSpan[] = []
  for (let index = 0; index < input.length; index += 1) {
    if (input[index] !== '{') continue
    const end = findMatchingObjectEnd(input, index)
    if (end < 0) continue
    spans.push({
      start: index,
      end: end + 1,
      text: input.slice(index, end + 1)
    })
    index = end
  }
  return spans
}

function findMatchingObjectEnd(input: string, start: number) {
  let depth = 0
  let inString = false
  let escaped = false
  for (let index = start; index < input.length; index += 1) {
    const char = input[index]
    if (inString) {
      if (escaped) {
        escaped = false
      } else if (char === '\\') {
        escaped = true
      } else if (char === '"') {
        inString = false
      }
      continue
    }
    if (char === '"') {
      inString = true
      continue
    }
    if (char === '{') {
      depth += 1
    } else if (char === '}') {
      depth -= 1
      if (depth === 0) return index
    }
  }
  return -1
}

function normalizeImportRoot(raw: unknown, warnings: CharacterBrainImportWarning[]): CharacterBrainImportParseResult {
  if (!isPlainObject(raw)) {
    return fail('灵魂 JSON 顶层必须是一个对象。')
  }

  const rawNodes = raw.nodes
  if (!Array.isArray(rawNodes)) {
    return fail('灵魂 JSON 缺少 nodes 数组。', 'nodes')
  }
  if (!rawNodes.length) {
    return fail('nodes 数组不能为空。', 'nodes')
  }

  let seed = 0
  const nextTempId = () => {
    seed += 1
    return `import-node-${seed}`
  }

  const nodes: CharacterBrainImportDraftNode[] = []
  for (let index = 0; index < rawNodes.length; index += 1) {
    const normalized = normalizeImportNode(rawNodes[index], {
      path: `nodes[${index}]`,
      nextTempId
    })
    if (!normalized.ok) return normalized
    nodes.push(normalized.node)
  }

  const duplicateWarnings = collectDuplicateSiblingWarnings(nodes)
  const allWarnings = [...warnings, ...duplicateWarnings]
  return {
    ok: true,
    draft: {
      version: normalizeVersion(raw.version),
      rootTitle: normalizeString(raw.rootTitle) || DEFAULT_IMPORT_ROOT_TITLE,
      nodes,
      flatNodes: flattenDraftNodes(nodes),
      warnings: allWarnings
    }
  }
}

function collectImportConflicts(
  existingNodes: CharacterBrainCognitionNode[],
  parentId: string,
  draftNodes: CharacterBrainImportDraftNode[]
) {
  const conflicts: CharacterBrainImportPreview['conflicts'] = []
  const walk = (nodes: CharacterBrainImportDraftNode[], targetParentId: string, parentPath: string) => {
    nodes.forEach((node) => {
      const nodePath = parentPath ? `${parentPath}/${node.title}` : node.title
      const duplicate = findDuplicateCognitionNode(existingNodes, targetParentId, node)
      if (duplicate) {
        conflicts.push({
          draftTempId: node.tempId,
          existingNodeId: duplicate.id,
          title: node.title,
          path: nodePath,
          defaultAction: 'skip'
        })
        walk(node.children, duplicate.id, nodePath)
        return
      }
      walk(node.children, node.tempId, nodePath)
    })
  }
  walk(draftNodes, parentId, '')
  return conflicts
}

function normalizeImportNode(raw: unknown, context: NormalizeNodeContext): NormalizeImportNodeResult {
  if (!isPlainObject(raw)) {
    return fail('节点必须是对象。', context.path)
  }

  const title = normalizeString(raw.title)
  if (!title) {
    return fail('节点缺少必填字段 title。', `${context.path}.title`)
  }

  const kind = normalizeNodeKind(raw.kind)
  if (!kind) {
    return fail('节点类型 kind 只支持 group、reference、private。', `${context.path}.kind`)
  }

  const rawChildren = raw.children
  if (rawChildren !== undefined && !Array.isArray(rawChildren)) {
    return fail('children 必须是数组。', `${context.path}.children`)
  }

  const children: CharacterBrainImportDraftNode[] = []
  if (Array.isArray(rawChildren)) {
    for (let index = 0; index < rawChildren.length; index += 1) {
      const normalized = normalizeImportNode(rawChildren[index], {
        path: `${context.path}.children[${index}]`,
        nextTempId: context.nextTempId
      })
      if (!normalized.ok) return normalized
      children.push(normalized.node)
    }
  }

  const sourceDocumentId = normalizeString(raw.sourceDocumentId ?? raw.source_document_id)
  const sourceDisplayPath = normalizeString(raw.sourceDisplayPath ?? raw.source_display_path)

  return {
    ok: true,
    node: {
      tempId: context.nextTempId(),
      title,
      summary: normalizeString(raw.summary),
      kind,
      sourceDocumentId: sourceDocumentId || undefined,
      sourceDisplayPath: sourceDisplayPath || undefined,
      children
    }
  }
}

function collectDuplicateSiblingWarnings(nodes: CharacterBrainImportDraftNode[], path = 'nodes'): CharacterBrainImportWarning[] {
  const warnings: CharacterBrainImportWarning[] = []
  const seen = new Map<string, { title: string; path: string }>()
  nodes.forEach((node, index) => {
    const nodePath = `${path}[${index}]`
    const duplicateKey = buildDuplicateKey(node)
    const existing = seen.get(duplicateKey)
    if (existing) {
      warnings.push({
        code: 'duplicate_sibling',
        path: nodePath,
        message: `同一层级中发现重复节点“${node.title}”，已保留在预览草稿中，导入确认时可再选择覆盖或跳过。`
      })
    } else {
      seen.set(duplicateKey, { title: node.title, path: nodePath })
    }
    warnings.push(...collectDuplicateSiblingWarnings(node.children, `${nodePath}.children`))
  })
  return warnings
}

function findDuplicateCognitionNode(
  nodes: CharacterBrainCognitionNode[],
  parentId: string,
  draftNode: CharacterBrainImportDraftNode
) {
  const targetParentId = normalizeString(parentId)
  return nodes.find((node) => {
    if (normalizeString(node.parentId) !== targetParentId) return false
    if (draftNode.sourceDocumentId && node.sourceDocumentId === draftNode.sourceDocumentId) return true
    if (draftNode.sourceDisplayPath && node.sourceDisplayPath === draftNode.sourceDisplayPath) return true
    return normalizeString(node.title) === normalizeString(draftNode.title)
  }) || null
}

function collectDraftTempIds(node: CharacterBrainImportDraftNode): string[] {
  return [node.tempId, ...node.children.flatMap((child) => collectDraftTempIds(child))]
}

function buildDuplicateKey(node: CharacterBrainImportDraftNode) {
  return [
    normalizeString(node.sourceDocumentId),
    normalizeString(node.sourceDisplayPath),
    normalizeString(node.title)
  ].find(Boolean) || node.title
}

function flattenDraftNodes(nodes: CharacterBrainImportDraftNode[]): CharacterBrainImportDraftNode[] {
  return nodes.flatMap((node) => [node, ...flattenDraftNodes(node.children)])
}

function buildWorldTreeFolders(documents: BrainDocumentRecord[]) {
  const roots = new Map<string, WorldTreeFolder>()
  const ensureFolder = (map: Map<string, WorldTreeFolder>, title: string, displayPath: string) => {
    const key = normalizeString(displayPath)
    const existing = map.get(key)
    if (existing) return existing
    const folder: WorldTreeFolder = {
      id: `folder:${key}`,
      title,
      displayPath: key,
      overviewDocument: undefined,
      children: new Map(),
      documents: []
    }
    map.set(key, folder)
    return folder
  }
  documents.forEach((document) => {
    const segments = splitDocumentDisplayPath(document.displayPath)
    const folderSegments = segments.slice(0, -1)
    let currentMap = roots
    let currentFolder: WorldTreeFolder | null = null
    const walked: string[] = []
    folderSegments.forEach((segment) => {
      walked.push(segment)
      const nextFolder = ensureFolder(currentMap, segment, `/${walked.join('/')}`)
      currentFolder = nextFolder
      currentMap = nextFolder.children
    })
    const targetFolder = currentFolder as WorldTreeFolder | null
    if (targetFolder) {
      if (isIndexMarkdownPath(document.displayPath)) targetFolder.overviewDocument = document
      else targetFolder.documents.push(document)
    } else {
      ensureFolder(roots, '文档', '/文档').documents.push(document)
    }
  })
  return roots
}

function buildWorldTreeDraftNodeBySelectionId(
  selectionId: string,
  roots: Map<string, WorldTreeFolder>,
  documents: BrainDocumentRecord[]
) {
  if (selectionId.startsWith('document:')) {
    const documentId = selectionId.slice('document:'.length)
    const document = documents.find((item) => item.documentId === documentId || item.id === documentId)
    return document ? createWorldTreeDocumentDraftNode(document) : null
  }
  const folderPath = selectionId.startsWith('cluster:')
    ? selectionId.slice('cluster:'.length)
    : selectionId.startsWith('folder:')
      ? selectionId.slice('folder:'.length)
      : selectionId
  const folder = findWorldTreeFolder(roots, folderPath)
  return folder ? createWorldTreeFolderDraftNode(folder) : null
}

function createWorldTreeFolderDraftNode(folder: WorldTreeFolder): CharacterBrainImportDraftNode {
  const overviewDocument = folder.overviewDocument
  return {
    tempId: createImportTempId('world-folder', folder.displayPath),
    title: folder.title,
    summary: normalizeString(overviewDocument?.publicCompilePage?.summary || overviewDocument?.summary) || `来自世界树目录：/世界树${folder.displayPath}`,
    kind: 'group',
    content: normalizeString(overviewDocument?.content),
    compilePage: overviewDocument?.publicCompilePage
      ? {
          summary: normalizeString(overviewDocument.publicCompilePage.summary),
          tags: Array.isArray(overviewDocument.publicCompilePage.tags) ? overviewDocument.publicCompilePage.tags : [],
          relationHints: Array.isArray(overviewDocument.publicCompilePage.relationHints) ? overviewDocument.publicCompilePage.relationHints : [],
          semanticType: overviewDocument.semanticType,
          updatedAt: normalizeString(overviewDocument.publicCompilePage.updatedAt) || normalizeString(overviewDocument.updatedAt) || new Date().toISOString()
        }
      : undefined,
    sourceDocumentId: overviewDocument?.documentId,
    sourceDisplayPath: `/世界树${folder.displayPath}`,
    sourceDetachedAt: normalizeString(overviewDocument?.publicCompilePage?.updatedAt || overviewDocument?.updatedAt) || undefined,
    sourceSnapshotTitle: normalizeString(overviewDocument?.title || folder.title),
    sourceSnapshotSummary: normalizeString(overviewDocument?.publicCompilePage?.summary || overviewDocument?.summary),
    children: [
      ...Array.from(folder.children.values()).map((child) => createWorldTreeFolderDraftNode(child)),
      ...folder.documents.map((document) => createWorldTreeDocumentDraftNode(document))
    ]
  }
}

function createWorldTreeDocumentDraftNode(document: BrainDocumentRecord): CharacterBrainImportDraftNode {
  const compilePage = document.publicCompilePage
    ? {
        summary: normalizeString(document.publicCompilePage.summary),
        tags: Array.isArray(document.publicCompilePage.tags) ? document.publicCompilePage.tags : [],
        relationHints: Array.isArray(document.publicCompilePage.relationHints) ? document.publicCompilePage.relationHints : [],
        semanticType: document.semanticType,
        updatedAt: normalizeString(document.publicCompilePage.updatedAt) || normalizeString(document.updatedAt) || new Date().toISOString()
      }
    : undefined
  return {
    tempId: createImportTempId('world-document', document.documentId),
    title: normalizeString(document.title) || stripMarkdownExtension(lastPathSegment(document.displayPath) || '未命名文档'),
    summary: normalizeString(compilePage?.summary || document.summary),
    kind: 'private',
    content: normalizeString(document.content),
    tags: compilePage?.tags || [],
    relationHints: compilePage?.relationHints || [],
    compilePage,
    sourceDocumentId: document.documentId,
    sourceDisplayPath: `/世界树${document.displayPath}`,
    sourceDetachedAt: normalizeString(compilePage?.updatedAt || document.updatedAt) || new Date().toISOString(),
    sourceSnapshotTitle: normalizeString(document.title),
    sourceSnapshotSummary: normalizeString(compilePage?.summary || document.summary),
    children: []
  }
}

function findWorldTreeFolder(roots: Map<string, WorldTreeFolder>, folderPath: string): WorldTreeFolder | null {
  const targetPath = normalizeString(folderPath)
  const queue = Array.from(roots.values())
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const folder = queue[cursor]
    if (folder.displayPath === targetPath) return folder
    queue.push(...Array.from(folder.children.values()))
  }
  return null
}

function isWorldTreeSelectionCoveredByAncestor(selectionId: string, selectedIds: Set<string>, documents: BrainDocumentRecord[]) {
  const normalizedId = normalizeString(selectionId)
  const folderPath = normalizedId.startsWith('document:')
    ? resolveDocumentParentPath(normalizedId.slice('document:'.length), documents)
    : normalizedId.replace(/^(cluster|folder):/, '')
  if (!folderPath) return false
  const segments = folderPath.split('/').filter(Boolean)
  for (let index = 1; index <= segments.length; index += 1) {
    const parentPath = `/${segments.slice(0, index).join('/')}`
    if (normalizedId === `cluster:${parentPath}` || normalizedId === `folder:${parentPath}`) continue
    if (selectedIds.has(`cluster:${parentPath}`) || selectedIds.has(`folder:${parentPath}`)) return true
  }
  return false
}

function resolveDocumentParentPath(documentId: string, documents: BrainDocumentRecord[]) {
  const document = documents.find((item) => item.documentId === documentId || item.id === documentId)
  if (!document) return ''
  const segments = splitDocumentDisplayPath(document.displayPath).slice(0, -1)
  return segments.length ? `/${segments.join('/')}` : ''
}

function splitDocumentDisplayPath(displayPath: string) {
  return normalizeString(displayPath).split('/').map((segment) => segment.trim()).filter(Boolean)
}

function lastPathSegment(displayPath: string) {
  const segments = splitDocumentDisplayPath(displayPath)
  return segments[segments.length - 1] || ''
}

function stripMarkdownExtension(value: string) {
  return normalizeString(value).replace(/\.md$/i, '')
}

function isIndexMarkdownPath(path: string) {
  return /\/index\.md$/i.test(normalizeString(path))
}

function createImportTempId(prefix: string, value: string) {
  return `${prefix}:${normalizeString(value) || Math.random().toString(36).slice(2, 8)}`
}

function createCognitionNodeId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${COGNITION_NODE_ID_PREFIX}${crypto.randomUUID()}`
  }
  return `${COGNITION_NODE_ID_PREFIX}${Date.now()}:${Math.random().toString(36).slice(2, 8)}`
}

function normalizeVersion(value: unknown) {
  const version = Number(value)
  return Number.isFinite(version) && version > 0 ? version : 1
}

function normalizeNodeKind(value: unknown): CharacterBrainCognitionNodeKind | null {
  const kind = normalizeString(value) || 'group'
  return IMPORT_NODE_KINDS.has(kind as CharacterBrainCognitionNodeKind)
    ? kind as CharacterBrainCognitionNodeKind
    : null
}

function normalizeString(value: unknown) {
  return String(value ?? '').trim()
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function formatJsonParseError(error: unknown, jsonText: string, fullInput: string, offset: number) {
  const message = error instanceof Error ? error.message : String(error)
  const position = readJsonErrorPosition(message, jsonText)
  if (position === null) {
    return 'JSON 语法错误，请检查逗号、双引号或括号是否完整。'
  }
  const location = resolveLineColumn(fullInput, offset + position)
  return `JSON 语法错误：第 ${location.line} 行第 ${location.column} 列附近无法解析，请检查逗号、双引号或括号。`
}

function readJsonErrorPosition(message: string, jsonText: string) {
  const positionMatch = message.match(/position\s+(\d+)/i)
  if (positionMatch) return Number(positionMatch[1])
  const lineColumnMatch = message.match(/line\s+(\d+)\s+column\s+(\d+)/i)
  if (!lineColumnMatch) return null
  return positionFromLineColumn(jsonText, Number(lineColumnMatch[1]), Number(lineColumnMatch[2]))
}

function positionFromLineColumn(input: string, line: number, column: number) {
  const lines = input.split(/\r?\n/)
  let position = 0
  const targetLine = Math.max(1, Math.min(line, lines.length))
  for (let index = 0; index < targetLine - 1; index += 1) {
    position += lines[index].length + 1
  }
  return position + Math.max(0, column - 1)
}

function resolveLineColumn(input: string, position: number) {
  const safePosition = Math.max(0, Math.min(position, input.length))
  const before = input.slice(0, safePosition)
  const lines = before.split(/\r?\n/)
  return {
    line: lines.length,
    column: lines[lines.length - 1].length + 1
  }
}

function fail(message: string, path?: string): CharacterBrainImportFailure {
  return {
    ok: false,
    error: {
      message,
      path
    }
  }
}
