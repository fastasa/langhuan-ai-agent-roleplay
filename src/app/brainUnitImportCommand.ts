import type { BrainDocumentRecord, Character, UnitSemanticType } from '../types'
import type { CharacterBrainCognitionNode } from '../types/characterBrain'
import type { UnitContentPort } from '../types/unitContentPort'
import type {
  CharacterBrainImportConflictAction,
  CharacterBrainImportDraft,
  CharacterBrainImportDraftNode
} from '../types/characterBrain'
import { applyCharacterBrainImportDraft } from './characterBrainImport'
import {
  buildCharacterBrainCognitionNodesChange,
  readCharacterBrainCognitionNodes
} from './characterBrain'
import {
  applyDocLibraryTreeCommand,
  type DocLibraryTreeCommandResult
} from './docLibraryTreeCommands'
import type {
  DocLibraryTreeDiffReport,
  DocTreeNodeRecord,
  DocTreeOrders,
  RelationSystemState
} from '../types'

export type BrainUnitImportDirection = 'docLibraryToBrain' | 'brainToDocLibrary'
export type BrainUnitImportTrigger = 'manual'

export interface BrainUnitImportCommandBase {
  direction: BrainUnitImportDirection
  trigger: BrainUnitImportTrigger
  createdAt: string
}

export interface DocLibraryToBrainImportCommand extends BrainUnitImportCommandBase {
  direction: 'docLibraryToBrain'
  parentId: string
  selectedUnitId: string
  selectedUnitIds: string[]
  draft: CharacterBrainImportDraft
}

export interface BrainToDocLibraryImportCommand extends BrainUnitImportCommandBase {
  direction: 'brainToDocLibrary'
  sourceUnitId: string
  sourceId: string
  targetParentNodeId?: string
  targetFolderPath: string
  document: BrainDocumentRecord
}

export type BrainUnitImportCommand = DocLibraryToBrainImportCommand | BrainToDocLibraryImportCommand

export type BrainUnitImportCommandBuildResult =
  | { ok: true; command: BrainUnitImportCommand }
  | { ok: false; error: string }

export interface ApplyBrainUnitImportCommandInput {
  character: Character
  documents: BrainDocumentRecord[]
  manualTreeOrders?: Record<string, string[]>
  treeNodes?: DocTreeNodeRecord[]
  treeOrders?: DocTreeOrders
  treeDiffReport?: DocLibraryTreeDiffReport
  relationSystemState?: RelationSystemState
  command: BrainUnitImportCommand
  conflictActions?: Record<string, CharacterBrainImportConflictAction>
  defaultConflictAction?: CharacterBrainImportConflictAction
  createBrainNodeId?: () => string
  now?: string
}

export type ApplyBrainUnitImportCommandResult =
  | {
      direction: 'docLibraryToBrain'
      characterChanges: Record<string, unknown>
      nodes: CharacterBrainCognitionNode[]
      createdNodeIds: string[]
      updatedNodeIds: string[]
      skippedTempIds: string[]
    }
  | {
      direction: 'brainToDocLibrary'
      document: BrainDocumentRecord
      documents: BrainDocumentRecord[]
      treeCommandResult: DocLibraryTreeCommandResult
    }

interface BuildDocLibraryToBrainCommandInput {
  ports: UnitContentPort[]
  selectedUnitId?: string
  selectedUnitIds?: string[]
  parentId: string
  trigger?: BrainUnitImportTrigger
  now?: string
}

interface BuildBrainToDocLibraryCommandInput {
  port: UnitContentPort
  character: Character
  targetParentNodeId?: string
  targetFolderPath?: string
  trigger?: BrainUnitImportTrigger
  now?: string
  createDocumentId?: () => string
}

export function buildDocLibraryToBrainImportCommand(
  input: BuildDocLibraryToBrainCommandInput
): BrainUnitImportCommandBuildResult {
  const trigger = input.trigger || 'manual'
  if (trigger !== 'manual') return { ok: false, error: '第一版只允许手动触发导入。' }
  const parentId = normalizeText(input.parentId)
  const selectedUnitIds = normalizeUniqueList(input.selectedUnitIds?.length ? input.selectedUnitIds : [input.selectedUnitId])
  if (!parentId) return { ok: false, error: '缺少灵魂父节点。' }
  if (!selectedUnitIds.length) return { ok: false, error: '缺少文档库单位。' }

  const ports = Array.isArray(input.ports) ? input.ports : []
  const portMap = new Map<string, UnitContentPort>()
  ports.forEach((port) => {
    portMap.set(port.unitId, port)
    if (port.sourceId) portMap.set(port.sourceId, port)
  })
  const selectedPorts = selectedUnitIds
    .map((unitId) => portMap.get(unitId))
    .filter((port): port is UnitContentPort => Boolean(port))
  if (selectedPorts.length !== selectedUnitIds.length || selectedPorts.some((port) => port.domain !== 'docLibrary')) {
    return { ok: false, error: '只能从文档库单位导入角色大脑。' }
  }
  if (selectedPorts.some((port) => !port.importableToBrain)) return { ok: false, error: '该文档库单位不能导入角色大脑。' }

  const childrenByParent = new Map<string, UnitContentPort[]>()
  ports.forEach((port) => {
    if (!port.parentId) return
    const list = childrenByParent.get(port.parentId) || []
    list.push(port)
    childrenByParent.set(port.parentId, list)
  })
  const selectedUnitIdSet = new Set(selectedPorts.map((port) => port.unitId))
  const rootPorts = selectedPorts.filter((port) => !hasSelectedAncestor(port, selectedUnitIdSet, ports))
  const draftNodes = rootPorts
    .map((port) => createDocLibraryDraftNode(port, childrenByParent))
    .filter((node): node is CharacterBrainImportDraftNode => Boolean(node))
  if (!draftNodes.length) return { ok: false, error: '未找到可导入的文档引用。' }

  const draft: CharacterBrainImportDraft = {
    version: 1,
    rootTitle: '文档库导入',
    nodes: draftNodes,
    flatNodes: flattenDraftNodes(draftNodes),
    warnings: []
  }

  return {
    ok: true,
    command: {
      direction: 'docLibraryToBrain',
      trigger,
      createdAt: input.now || new Date().toISOString(),
      parentId,
      selectedUnitId: rootPorts[0].unitId,
      selectedUnitIds: rootPorts.map((port) => port.unitId),
      draft
    }
  }
}

export function buildBrainToDocLibraryImportCommand(
  input: BuildBrainToDocLibraryCommandInput
): BrainUnitImportCommandBuildResult {
  const trigger = input.trigger || 'manual'
  if (trigger !== 'manual') return { ok: false, error: '第一版只允许手动触发入库。' }
  const port = input.port
  if (!port || port.domain === 'docLibrary') return { ok: false, error: '只能把角色大脑单位手动写入文档库。' }
  if (!port.browsable) return { ok: false, error: '该单位不可浏览，不能写入文档库。' }
  if (port.domain === 'characterCore' && !port.recallableInChat && port.contentKind !== 'group') {
    return { ok: false, error: '核心系统配置不写入文档库。' }
  }

  const now = input.now || new Date().toISOString()
  const documentId = input.createDocumentId ? input.createDocumentId() : `doc-brain-${Date.now()}`
  const targetFolderPath = normalizeFolderPath(input.targetFolderPath || '/角色大脑')
  const characterName = normalizeText(input.character.name) || '未命名角色'
  const domainLabel = domainFolderLabel(port.domain)
  const title = normalizeText(port.effectiveVersion.title || port.title) || '未命名单位'
  const body = normalizeText(port.effectiveVersion.body || port.body || port.formText)
  const compilePage = port.effectiveVersion.compilePage
  const summary = normalizeText(compilePage?.summary || port.summary)
  const tags = normalizeList(compilePage?.tags || port.tags)
  const relationHints = normalizeList(compilePage?.relationHints || port.relationHints)
  const displayPath = [
    targetFolderPath,
    encodePathSegment(characterName),
    encodePathSegment(domainLabel),
    `${encodePathSegment(title)}.md`
  ].join('/').replace(/\/+/g, '/')

  const document: BrainDocumentRecord = {
    documentId,
    id: documentId,
    stableId: documentId,
    title,
    displayPath,
    documentType: documentTypeForPort(port),
    kind: documentTypeForPort(port),
    semanticType: semanticTypeForPort(port),
    summary,
    tags,
    content: body ? `# ${title}\n\n${body}` : `# ${title}\n\n`,
    publicCompilePage: {
      summary,
      tags,
      relationHints,
      sourceState: 'manual_confirmed',
      updatedAt: now
    },
    sourceDocumentIds: [],
    relatedNeuronIds: [],
    sourceMeta: {
      provider: 'character_brain_unit',
      sourceFileName: `${characterName}-${title}.md`,
      sourceEntryUid: port.unitId,
      importedAt: now
    },
    versionState: 'confirmed',
    createdAt: now,
    updatedAt: now
  }

  return {
    ok: true,
    command: {
      direction: 'brainToDocLibrary',
      trigger,
      createdAt: now,
      sourceUnitId: port.unitId,
      sourceId: port.sourceId,
      targetParentNodeId: normalizeText(input.targetParentNodeId),
      targetFolderPath,
      document
    }
  }
}

export function applyBrainUnitImportCommand(
  input: ApplyBrainUnitImportCommandInput
): ApplyBrainUnitImportCommandResult {
  if (input.command.trigger !== 'manual') {
    throw new Error('第一版只允许手动触发导入。')
  }
  if (input.command.direction === 'brainToDocLibrary') {
    const command = input.command as BrainToDocLibraryImportCommand
    const treeCommandResult = applyDocLibraryTreeCommand({
      documents: Array.isArray(input.documents) ? input.documents : [],
      manualTreeOrders: input.manualTreeOrders || {},
      treeNodes: input.treeNodes,
      treeOrders: input.treeOrders,
      treeDiffReport: input.treeDiffReport,
      relationSystemState: input.relationSystemState || { predicates: [], relationDecisions: [] }
    }, {
      type: 'upsert_document',
      document: command.document,
      parentFolderId: command.targetParentNodeId || getParentFolderPath(command.document.displayPath) || command.targetFolderPath
    })
    return {
      direction: 'brainToDocLibrary',
      document: treeCommandResult.documents.find((document) => document.documentId === command.document.documentId) || command.document,
      documents: treeCommandResult.documents,
      treeCommandResult
    }
  }

  const result = applyCharacterBrainImportDraft({
    existingNodes: readCharacterBrainCognitionNodes(input.character),
    parentId: input.command.parentId,
    draft: input.command.draft,
    conflictActions: input.conflictActions,
    defaultConflictAction: input.defaultConflictAction,
    createId: input.createBrainNodeId,
    now: input.now
  })
  return {
    direction: 'docLibraryToBrain',
    characterChanges: buildCharacterBrainCognitionNodesChange(result.nodes) as Record<string, unknown>,
    nodes: result.nodes,
    createdNodeIds: result.createdNodeIds,
    updatedNodeIds: result.updatedNodeIds,
    skippedTempIds: result.skippedTempIds
  }
}

function createDocLibraryDraftNode(
  port: UnitContentPort,
  childrenByParent: Map<string, UnitContentPort[]>
): CharacterBrainImportDraftNode | null {
  const compilePage = buildPrivateCompilePage(port)
  const content = normalizeText(port.effectiveVersion.body || port.body)
  const sourceDocumentId = normalizeText(port.sourceId)
  const sourceDisplayPath = formatWorldTreePath(port.sourcePath)
  if (port.contentKind === 'group') {
    const children = (childrenByParent.get(port.unitId) || [])
      .map((child) => createDocLibraryDraftNode(child, childrenByParent))
      .filter((child): child is CharacterBrainImportDraftNode => Boolean(child))
    if (!children.length && !content && !compilePage) return null
    const overviewChild = children.find((child) => isIndexMarkdownPath(child.sourceDisplayPath || ''))
    const remainingChildren = overviewChild
      ? children.filter((child) => child !== overviewChild)
      : children
    const overviewDocumentId = overviewChild?.sourceDocumentId || readPortOverviewDocumentId(port)
    return {
      tempId: createTempId('doc-group', port.unitId),
      title: port.title,
      summary: compilePage?.summary || overviewChild?.summary || port.summary || `来自文档库目录：${sourceDisplayPath}`,
      kind: 'group',
      content,
      tags: compilePage?.tags || [],
      relationHints: compilePage?.relationHints || [],
      compilePage,
      sourceDocumentId: overviewDocumentId,
      sourceDisplayPath,
      sourceDetachedAt: compilePage?.updatedAt,
      sourceSnapshotTitle: port.title,
      sourceSnapshotSummary: port.summary,
      children: remainingChildren
    }
  }
  if (!sourceDocumentId) return null
  return {
    tempId: createTempId('doc-reference', port.sourceId),
    title: port.title,
    summary: compilePage?.summary || port.summary,
    kind: 'private',
    content,
    tags: compilePage?.tags || [],
    relationHints: compilePage?.relationHints || [],
    compilePage,
    sourceDocumentId,
    sourceDisplayPath,
    sourceDetachedAt: compilePage?.updatedAt,
    sourceSnapshotTitle: port.title,
    sourceSnapshotSummary: port.summary,
    children: []
  }
}

function buildPrivateCompilePage(port: UnitContentPort) {
  const source = port.effectiveVersion.compilePage
  const summary = normalizeText(source?.summary || port.summary)
  const tags = normalizeList(source?.tags || port.tags)
  const relationHints = normalizeList(source?.relationHints || port.relationHints)
  if (!summary && !tags.length && !relationHints.length) return undefined
  return {
    summary,
    tags,
    relationHints,
    updatedAt: normalizeText(source?.updatedAt) || new Date().toISOString()
  }
}

function isIndexMarkdownPath(path: string) {
  return /\/index\.md$/i.test(String(path || ''))
}

function readPortOverviewDocumentId(port: UnitContentPort): string | undefined {
  const metadata = port.metadata && typeof port.metadata === 'object'
    ? port.metadata as Record<string, unknown>
    : {}
  const id = String(metadata.overviewDocumentId || '').trim()
  return id || undefined
}

function getParentFolderPath(displayPath: string) {
  const segments = String(displayPath || '').split('/').map((item) => item.trim()).filter(Boolean)
  segments.pop()
  return segments.length ? `/${segments.join('/')}` : ''
}

function flattenDraftNodes(nodes: CharacterBrainImportDraftNode[]): CharacterBrainImportDraftNode[] {
  return nodes.flatMap((node) => [node, ...flattenDraftNodes(node.children || [])])
}

function createTempId(prefix: string, value: string): string {
  return `${prefix}:${encodeURIComponent(value).replace(/%/g, '~')}`
}

function formatWorldTreePath(path?: string): string {
  const normalized = normalizeText(path)
  if (!normalized) return ''
  return normalized.startsWith('/世界树') ? normalized : `/世界树${normalized.startsWith('/') ? normalized : `/${normalized}`}`
}

function normalizeText(value: unknown): string {
  return value === undefined || value === null ? '' : String(value).trim()
}

function normalizeUniqueList(value: unknown): string[] {
  const source = Array.isArray(value) ? value : [value]
  return Array.from(new Set(source.map((item) => normalizeText(item)).filter(Boolean)))
}

function normalizeList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map((item) => normalizeText(item)).filter(Boolean)
}

function hasSelectedAncestor(port: UnitContentPort, selectedUnitIdSet: Set<string>, ports: UnitContentPort[]): boolean {
  const portById = new Map(ports.map((item) => [item.unitId, item] as const))
  let parentId = port.parentId || ''
  while (parentId) {
    if (selectedUnitIdSet.has(parentId)) return true
    parentId = portById.get(parentId)?.parentId || ''
  }
  return false
}

function normalizeFolderPath(value: string): string {
  const text = normalizeText(value).replace(/\\/g, '/').replace(/\/+/g, '/')
  const withoutEnd = text.replace(/\/+$/g, '')
  return withoutEnd.startsWith('/') ? withoutEnd : `/${withoutEnd || '文档'}`
}

function encodePathSegment(value: string): string {
  return normalizeText(value)
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .trim() || '未命名'
}

function domainFolderLabel(domain: UnitContentPort['domain']): string {
  switch (domain) {
    case 'characterCore':
      return '核心'
    case 'characterSoul':
      return '灵魂'
    case 'characterTrace':
      return '轨迹'
    case 'characterArrangement':
      return '安排'
    default:
      return '角色大脑'
  }
}

function documentTypeForPort(port: UnitContentPort): BrainDocumentRecord['documentType'] {
  if (port.domain === 'characterCore') return 'character_profile'
  if (port.domain === 'characterTrace') return 'character_memory'
  if (port.domain === 'characterSoul') return 'character_understanding'
  return 'generic_markdown'
}

function semanticTypeForPort(port: UnitContentPort): UnitSemanticType {
  if (port.domain === 'characterCore') return 'character'
  if (port.domain === 'characterTrace') return 'event'
  if (port.domain === 'characterSoul') return 'concept'
  return 'other'
}
