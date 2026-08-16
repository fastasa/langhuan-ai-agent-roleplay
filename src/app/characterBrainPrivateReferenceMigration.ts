import type {
  CharacterBrainCognitionNode,
  CharacterBrainCompilePage
} from '../types/characterBrain'
import type { BrainDocumentRecord, BrainPublicCompilePage } from '../types/docBrain'
import { parseRelationHintLine } from './relationHintParser'

export interface CharacterBrainPrivateReferenceMigrationInput {
  nodes: CharacterBrainCognitionNode[]
  documents: BrainDocumentRecord[]
  brainDocuments?: Record<string, string>
  now?: string
  targetNodeIds?: string[]
}

export interface CharacterBrainPrivateReferenceMigrationResult {
  nodes: CharacterBrainCognitionNode[]
  brainDocuments: Record<string, string>
  changedNodeIds: string[]
  stats: {
    nodesChanged: number
    referencesConverted: number
    groupSnapshotsCreated: number
    relationHintsRewritten: number
    relationHintsRemoved: number
  }
}

export function migrateCharacterBrainImportedReferences(
  input: CharacterBrainPrivateReferenceMigrationInput
): CharacterBrainPrivateReferenceMigrationResult {
  const now = normalizeText(input.now) || new Date().toISOString()
  const documentById = buildDocumentIdMap(input.documents)
  const brainDocuments = { ...(input.brainDocuments || {}) }
  const initialNodes = input.nodes.map((node) => ({ ...node }))
  const targetNodeIds = new Set(normalizeStringList(input.targetNodeIds))
  const nodesWithSnapshots = initialNodes.map((node) => {
    const document = findSnapshotSourceDocument(node, documentById, input.documents)
    return migrateNodeSnapshot(node, document, brainDocuments, now)
  })
  const endpointIndex = buildRelationEndpointIndex(
    nodesWithSnapshots
      .filter((item) => !targetNodeIds.size || targetNodeIds.has(item.node.id))
      .map((item) => item.node)
  )

  const changedNodeIds: string[] = []
  const stats = {
    nodesChanged: 0,
    referencesConverted: 0,
    groupSnapshotsCreated: 0,
    relationHintsRewritten: 0,
    relationHintsRemoved: 0
  }

  const nodes = nodesWithSnapshots.map((prepared) => {
    if (targetNodeIds.size && !targetNodeIds.has(prepared.node.id)) return prepared.node
    const relationSource = prepared.node.compilePage?.relationHints?.length
      ? prepared.node.compilePage.relationHints
      : prepared.node.relationHints || []
    const rewritten = rewriteRelationHintsToBrainRefs(relationSource, endpointIndex)
    const compilePage = prepared.node.compilePage
      ? {
          ...prepared.node.compilePage,
          relationHints: rewritten.lines,
          updatedAt: prepared.snapshotChanged || rewritten.changed
            ? now
            : prepared.node.compilePage.updatedAt
        }
      : prepared.node.relationHints?.length
        ? {
            summary: prepared.node.summary || '',
            tags: prepared.node.tags || [],
            relationHints: rewritten.lines,
            updatedAt: now
          }
        : undefined

    const changed = prepared.snapshotChanged || rewritten.changed
    if (!changed) return prepared.node

    changedNodeIds.push(prepared.node.id)
    stats.nodesChanged += 1
    stats.referencesConverted += prepared.referenceConverted ? 1 : 0
    stats.groupSnapshotsCreated += prepared.groupSnapshotCreated ? 1 : 0
    stats.relationHintsRewritten += rewritten.rewritten
    stats.relationHintsRemoved += rewritten.removed

    return {
      ...prepared.node,
      summary: compilePage?.summary || prepared.node.summary,
      tags: compilePage?.tags ? [...compilePage.tags] : prepared.node.tags,
      relationHints: compilePage ? [...compilePage.relationHints] : rewritten.lines,
      compilePage,
      updatedAt: now
    }
  })

  return {
    nodes,
    brainDocuments,
    changedNodeIds,
    stats
  }
}

function migrateNodeSnapshot(
  node: CharacterBrainCognitionNode,
  document: BrainDocumentRecord | undefined,
  brainDocuments: Record<string, string>,
  now: string
) {
  const shouldConvertReference = node.kind === 'reference'
  const shouldCreateGroupSnapshot = node.kind === 'group'
    && !normalizeText(node.content)
    && Boolean(document)

  if (!shouldConvertReference && !shouldCreateGroupSnapshot) {
    return {
      node,
      snapshotChanged: false,
      referenceConverted: false,
      groupSnapshotCreated: false
    }
  }

  const compilePage = normalizeSnapshotCompilePage(
    node.compilePage,
    document?.publicCompilePage,
    {
      summary: node.summary || document?.summary || '',
      tags: node.tags || document?.tags || [],
      relationHints: node.relationHints || [],
      updatedAt: node.updatedAt || document?.updatedAt || now
    }
  )
  const content = normalizeText(node.content)
    || normalizeText(brainDocuments[node.id])
    || normalizeText(document?.content)

  if (content) brainDocuments[node.id] = content

  return {
    node: {
      ...node,
      kind: shouldConvertReference ? 'private' : node.kind,
      content,
      summary: compilePage.summary || node.summary || document?.summary || '',
      tags: [...compilePage.tags],
      relationHints: [...compilePage.relationHints],
      compilePage,
      sourceDocumentId: node.sourceDocumentId || document?.documentId,
      sourceDetachedAt: node.sourceDetachedAt || now,
      sourceSnapshotTitle: node.sourceSnapshotTitle || document?.title || node.title,
      sourceSnapshotSummary: node.sourceSnapshotSummary || compilePage.summary || document?.summary || node.summary,
      updatedAt: now
    },
    snapshotChanged: true,
    referenceConverted: shouldConvertReference,
    groupSnapshotCreated: shouldCreateGroupSnapshot
  }
}

function rewriteRelationHintsToBrainRefs(
  lines: string[],
  endpointIndex: RelationEndpointIndex
) {
  const nextLines: string[] = []
  const seen = new Set<string>()
  let rewritten = 0
  let removed = 0

  normalizeStringList(lines).forEach((line, lineIndex) => {
    const parsed = parseRelationHintLine(line, lineIndex)
    let keptFromLine = 0

    parsed.assertions.forEach((assertion) => {
      const source = resolveEndpoint(assertion.sourceTitle, assertion.sourceRefId, endpointIndex)
      const target = resolveEndpoint(assertion.targetTitle, assertion.targetRefId, endpointIndex)
      if (!source || !target) return
      const nextLine = `[[${source.title}@${source.id}]]_${assertion.surfacePredicate || assertion.rawPredicate}_[[${target.title}@${target.id}]]`
      if (pushUnique(nextLines, seen, nextLine)) {
        rewritten += normalizeText(line) === nextLine ? 0 : 1
        keptFromLine += 1
      }
    })

    parsed.legacyHints.forEach((legacyHint) => {
      const target = resolveEndpoint(legacyHint.targetTitle, legacyHint.targetRefId, endpointIndex)
      if (!target) return
      const nextLine = `[[${target.title}@${target.id}]]`
      if (pushUnique(nextLines, seen, nextLine)) {
        rewritten += normalizeText(line) === nextLine ? 0 : 1
        keptFromLine += 1
      }
    })

    if (!keptFromLine && normalizeText(line)) removed += 1
  })

  return {
    lines: nextLines,
    changed: !stringListsEqual(normalizeStringList(lines), nextLines),
    rewritten,
    removed
  }
}

interface RelationEndpointIndex {
  byNodeId: Map<string, CharacterBrainCognitionNode>
  bySourceDocumentId: Map<string, CharacterBrainCognitionNode>
  byTitle: Map<string, CharacterBrainCognitionNode>
}

function buildRelationEndpointIndex(nodes: CharacterBrainCognitionNode[]): RelationEndpointIndex {
  const byNodeId = new Map<string, CharacterBrainCognitionNode>()
  const bySourceDocumentId = new Map<string, CharacterBrainCognitionNode>()
  const titleBuckets = new Map<string, CharacterBrainCognitionNode[]>()

  nodes.forEach((node) => {
    const nodeId = normalizeText(node.id)
    if (nodeId) byNodeId.set(nodeId, node)
    const sourceDocumentId = normalizeText(node.sourceDocumentId)
    if (sourceDocumentId && !bySourceDocumentId.has(sourceDocumentId)) {
      bySourceDocumentId.set(sourceDocumentId, node)
    }
    const titleKey = normalizeTitleKey(node.title)
    if (titleKey) titleBuckets.set(titleKey, [...(titleBuckets.get(titleKey) || []), node])
  })

  const byTitle = new Map<string, CharacterBrainCognitionNode>()
  titleBuckets.forEach((items, key) => {
    if (items.length === 1) byTitle.set(key, items[0])
  })

  return { byNodeId, bySourceDocumentId, byTitle }
}

function resolveEndpoint(
  title: string,
  refId: string | undefined,
  endpointIndex: RelationEndpointIndex
) {
  const safeRefId = normalizeText(refId)
  if (safeRefId) {
    return endpointIndex.byNodeId.get(safeRefId)
      || endpointIndex.bySourceDocumentId.get(safeRefId)
  }
  return endpointIndex.byTitle.get(normalizeTitleKey(title))
}

function normalizeSnapshotCompilePage(
  nodePage: CharacterBrainCompilePage | undefined,
  documentPage: BrainPublicCompilePage | undefined,
  fallback: {
    summary: string
    tags: string[]
    relationHints: string[]
    updatedAt: string
  }
): CharacterBrainCompilePage {
  const page = nodePage || documentPage
  return {
    summary: normalizeText(page?.summary) || normalizeText(fallback.summary),
    tags: normalizeStringList(page?.tags?.length ? page.tags : fallback.tags),
    relationHints: normalizeStringList(page?.relationHints?.length ? page.relationHints : fallback.relationHints),
    semanticType: nodePage?.semanticType,
    updatedAt: normalizeText(page?.updatedAt) || normalizeText(fallback.updatedAt) || new Date().toISOString()
  }
}

function buildDocumentIdMap(documents: BrainDocumentRecord[]) {
  const map = new Map<string, BrainDocumentRecord>()
  documents.forEach((document) => {
    ;[document.documentId, document.id, document.stableId].forEach((id) => {
      const safeId = normalizeText(id)
      if (safeId && !map.has(safeId)) map.set(safeId, document)
    })
  })
  return map
}

function findSnapshotSourceDocument(
  node: CharacterBrainCognitionNode,
  documentById: Map<string, BrainDocumentRecord>,
  documents: BrainDocumentRecord[]
) {
  const sourceDocument = node.sourceDocumentId ? documentById.get(node.sourceDocumentId) : undefined
  if (sourceDocument || node.kind !== 'group') return sourceDocument
  const folderPath = normalizeFolderPath(normalizeText(node.sourceDisplayPath).replace(/^\/世界树/u, ''))
  if (!folderPath) return undefined
  const indexPath = `${folderPath}/index.md`.replace(/\/+/g, '/')
  return documents.find((document) => normalizeFolderPath(document.displayPath) === indexPath)
}

function normalizeFolderPath(input: unknown) {
  const parts = normalizeText(input).replace(/\\/g, '/').split('/').map((part) => part.trim()).filter(Boolean)
  return parts.length ? `/${parts.join('/')}` : ''
}

function pushUnique(list: string[], seen: Set<string>, line: string) {
  const safeLine = normalizeText(line)
  if (!safeLine || seen.has(safeLine)) return false
  seen.add(safeLine)
  list.push(safeLine)
  return true
}

function normalizeStringList(input: unknown): string[] {
  if (Array.isArray(input)) {
    return input.map((item) => normalizeText(item)).filter(Boolean)
  }
  if (typeof input === 'string') {
    return input.split(/\r?\n/u).map((item) => normalizeText(item)).filter(Boolean)
  }
  return []
}

function stringListsEqual(left: string[], right: string[]) {
  if (left.length !== right.length) return false
  return left.every((item, index) => item === right[index])
}

function normalizeTitleKey(input: unknown) {
  return normalizeText(input).toLocaleLowerCase()
}

function normalizeText(input: unknown) {
  return String(input ?? '').trim()
}
