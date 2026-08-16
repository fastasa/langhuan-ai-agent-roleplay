import type {
  BrainDocumentRecord,
  BrainRecallCandidateCard,
  DocLibraryTreeDiffReport,
  DocTreeNodeRecord,
  DocTreeOrders,
  RecallStructureNode,
  RecallStructureView
} from '../types'
import { buildDocLibraryUnitView } from './unitViewAdapters'
import type { UnitView } from '../types/unitView'

export interface DocLibraryRecallStructureOptions {
  manualTreeOrders?: Record<string, string[]>
  treeNodes?: DocTreeNodeRecord[]
  treeOrders?: DocTreeOrders
  treeDiffReport?: DocLibraryTreeDiffReport
  generatedAt?: string
}

export function buildDocLibraryRecallStructureView(
  documents: BrainDocumentRecord[],
  options: DocLibraryRecallStructureOptions = {}
): RecallStructureView {
  const unitView = buildDocLibraryUnitView(documents, options.manualTreeOrders || {}, {
    treeNodes: options.treeNodes,
    treeOrders: options.treeOrders,
    treeDiffReport: options.treeDiffReport
  })
  const treeSource = resolveRecallTreeSource(unitView.units)
  const childIdsByParent = new Map<string, string[]>()
  unitView.units.forEach((unit) => {
    if (!unit.parentId) return
    childIdsByParent.set(unit.parentId, [...(childIdsByParent.get(unit.parentId) || []), unit.unitId])
  })
  const unitById = new Map(unitView.units.map((unit) => [unit.unitId, unit] as const))
  const depthByUnitId = buildDepthByUnitId(unitView.units, unitById)
  const nodes: RecallStructureNode[] = unitView.units.map((unit) => {
    const childIds = childIdsByParent.get(unit.unitId) || []
    return {
      runtimeId: unit.unitId,
      sourceId: unit.sourceId || unit.unitId,
      sourceDocumentId: unit.unitType === 'leaf' ? unit.sourceId : undefined,
      parentRuntimeId: unit.parentId,
      depth: depthByUnitId.get(unit.unitId) || 0,
      childCount: childIds.length,
      childPreviewIds: childIds.slice(0, 3),
      structureKind: resolveStructureKind(unit),
      pathText: unit.sourcePath || '',
      title: unit.title,
      treeSource,
      evidenceReasons: [`tree:${treeSource}`]
    }
  })

  return {
    treeSource,
    generatedAt: options.generatedAt || new Date().toISOString(),
    nodes
  }
}

export function applyDocLibraryRecallStructureToCards(
  cards: BrainRecallCandidateCard[],
  structureView: RecallStructureView | null | undefined
): BrainRecallCandidateCard[] {
  if (!structureView?.nodes.length) {
    return cards.map((card) => ({
      ...card,
      treeSource: card.treeSource || 'none'
    }))
  }
  const nodeByRuntimeId = new Map(structureView.nodes.map((node) => [node.runtimeId, node] as const))
  const nodeByDocumentId = new Map<string, RecallStructureNode>()
  structureView.nodes.forEach((node) => {
    if (node.sourceDocumentId) nodeByDocumentId.set(node.sourceDocumentId, node)
  })

  return cards.map((card) => {
    const documentId = resolveCardDocumentId(card)
    const node = documentId
      ? nodeByDocumentId.get(documentId)
      : nodeByRuntimeId.get(card.id)
    if (!node) {
      return {
        ...card,
        treeSource: card.treeSource || 'none'
      }
    }
    return {
      ...card,
      p: node.pathText || card.p,
      structureRuntimeId: node.runtimeId,
      parentRuntimeId: node.parentRuntimeId,
      structureDepth: node.depth,
      structureChildCount: node.childCount,
      treeSource: node.treeSource,
      evidenceReasons: Array.from(new Set([...(card.evidenceReasons || []), ...node.evidenceReasons]))
    }
  })
}

function resolveRecallTreeSource(units: UnitView[]): 'fieldTree' | 'pathTree' {
  return units.some((unit) => unit.metadata?.treeSource === 'fieldTree') ? 'fieldTree' : 'pathTree'
}

function buildDepthByUnitId(units: UnitView[], unitById: Map<string, UnitView>) {
  const depthById = new Map<string, number>()
  const resolveDepth = (unit: UnitView, visiting = new Set<string>()): number => {
    if (depthById.has(unit.unitId)) return depthById.get(unit.unitId) || 0
    if (!unit.parentId) {
      depthById.set(unit.unitId, 0)
      return 0
    }
    if (visiting.has(unit.unitId)) {
      depthById.set(unit.unitId, 0)
      return 0
    }
    visiting.add(unit.unitId)
    const parent = unitById.get(unit.parentId)
    const depth = parent ? resolveDepth(parent, visiting) + 1 : 1
    visiting.delete(unit.unitId)
    depthById.set(unit.unitId, depth)
    return depth
  }
  units.forEach((unit) => resolveDepth(unit))
  return depthById
}

function resolveStructureKind(unit: UnitView): RecallStructureNode['structureKind'] {
  if (unit.unitType === 'root') return 'root'
  if (unit.unitType === 'cluster' || unit.unitType === 'branch') return 'folder'
  if (unit.unitType === 'leaf') return 'document'
  return 'document'
}

function resolveCardDocumentId(card: BrainRecallCandidateCard) {
  if (card.id.startsWith('compile:')) return card.id.slice('compile:'.length)
  const source = Array.isArray(card.src) ? card.src[0] : ''
  return String(source || '').trim()
}
