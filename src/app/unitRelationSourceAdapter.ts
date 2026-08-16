import type { Character } from '../types'
import type { UnitSemanticType } from '../types/docBrain'
import type { PredicateView, RelationViewRecord, RelationViewStatus, UnitView } from '../types/unitView'
import { resolveUnitRelationProjectionNodeId } from './characterBrainWorkspaceProjection'
import { STRUCTURE_CONTAINS_PREDICATE_ID } from './unitViewAdapters'
import { normalizeUnitSemanticType } from './unitSemanticTypes'

export type UnitRelationClipboardMode = 'copy' | 'cut' | ''

export interface UnitRelationSourceClipboard {
  mode: UnitRelationClipboardMode
  unitIds: string[]
  writable: boolean
}

export interface UnitRelationPredicateFilter {
  predicateIds: string[]
  predicateFamilies: string[]
  semanticTypes: UnitSemanticType[]
  statuses: RelationViewStatus[]
}

export interface UnitRelationSourceAdapter {
  characterId: string
  title: string
  units: UnitView[]
  activeUnit?: UnitView | null
  projectionCharacter?: Character | null
  projectionLayout?: UnitRelationProjectionLayout
  projectionExpandedUnitIds?: string[]
  projectionForestRootUnitIds?: string[]
  predicates: PredicateView[]
  relations: RelationViewRecord[]
  predicateFilter: UnitRelationPredicateFilter
  visibleRelations: RelationViewRecord[]
  relationScope: UnitRelationScope
  clipboard: UnitRelationSourceClipboard
  copyUnits: (unitIds: string[]) => void
  cutUnits: (unitIds: string[]) => void
  pasteUnits: (targetUnitId: string) => void | Promise<void>
}

export interface UnitRelationScope {
  focusUnitId: string
  maxHops: number
  maxNodeCount: number
  maxRelationCount: number
}

export type UnitRelationProjectionLayout = 'default' | 'trajectoryAxis'

export function createUnitRelationSourceAdapter(options: {
  characterId: string
  title?: string
  units: UnitView[]
  activeUnit?: UnitView | null
  projectionCharacter?: Character | null
  projectionLayout?: UnitRelationProjectionLayout
  projectionExpandedUnitIds?: string[]
  projectionForestRootUnitIds?: string[]
  predicates?: PredicateView[]
  relations?: RelationViewRecord[]
  predicateFilter?: Partial<UnitRelationPredicateFilter>
  relationScope?: Partial<UnitRelationScope>
  clipboard?: Partial<UnitRelationSourceClipboard>
  copyUnits?: (unitIds: string[]) => void
  cutUnits?: (unitIds: string[]) => void
  pasteUnits?: (targetUnitId: string) => void | Promise<void>
}): UnitRelationSourceAdapter {
  const predicates = Array.isArray(options.predicates) ? options.predicates : []
  const relations = Array.isArray(options.relations) ? options.relations : []
  const predicateFilter = normalizePredicateFilter(options.predicateFilter)
  const relationScope = normalizeRelationScope(options.relationScope, options.activeUnit?.unitId)
  const filteredRelations = filterUnitRelationSourceRelations(relations, predicateFilter, {
    units: options.units,
    predicates,
    focusUnitId: relationScope.focusUnitId
  })
  return {
    characterId: String(options.characterId || '').trim(),
    title: options.title || '',
    units: Array.isArray(options.units) ? options.units : [],
    activeUnit: options.activeUnit || null,
    projectionCharacter: options.projectionCharacter || null,
    projectionLayout: options.projectionLayout || 'default',
    projectionExpandedUnitIds: normalizeIdList(options.projectionExpandedUnitIds || []),
    projectionForestRootUnitIds: normalizeIdList(options.projectionForestRootUnitIds || []),
    predicates,
    relations,
    predicateFilter,
    visibleRelations: limitUnitRelationSourceRelations(filteredRelations, relationScope),
    relationScope,
    clipboard: {
      mode: options.clipboard?.mode || '',
      unitIds: normalizeIdList(options.clipboard?.unitIds || []),
      writable: Boolean(options.clipboard?.writable)
    },
    copyUnits: options.copyUnits || noop,
    cutUnits: options.cutUnits || noop,
    pasteUnits: options.pasteUnits || noop
  }
}

export function shouldUseTrajectoryAxisRelationLayout(activeUnit: UnitView | null | undefined) {
  if (!activeUnit) return false
  return activeUnit.unitType === 'trace' || activeUnit.domain === 'trace'
}

export function buildTrajectoryAxisRelationRecords(
  units: UnitView[],
  activeUnit: UnitView | null | undefined,
  expandedUnitIds?: string[]
): RelationViewRecord[] {
  const sequence = buildTrajectoryAxisUnitSequence(units, activeUnit, expandedUnitIds)
  const relations: RelationViewRecord[] = []
  for (let index = 1; index < sequence.length; index += 1) {
    const source = sequence[index - 1]
    const target = sequence[index]
    relations.push({
      relationId: [
        'trajectory-axis',
        source.unitId,
        target.unitId,
        STRUCTURE_CONTAINS_PREDICATE_ID
      ].join(':'),
      sourceUnitId: source.unitId,
      targetUnitId: target.unitId,
      predicateId: STRUCTURE_CONTAINS_PREDICATE_ID,
      direction: 'directed',
      status: 'projection',
      evidence: [{ sourceType: 'tree', sourceId: target.sourceId || target.unitId }]
    })
  }
  return relations
}

export function buildTrajectoryAxisUnitSequence(
  units: UnitView[],
  activeUnit: UnitView | null | undefined,
  expandedUnitIds?: string[]
) {
  const traceRoot = units.find((unit) => unit.unitType === 'trace') || null
  if (!traceRoot) return []
  const traceUnits = units.filter((unit) => unit.domain === 'trace')
  const unitById = new Map(units.map((unit) => [unit.unitId, unit] as const))
  const childrenByParent = new Map<string, UnitView[]>()
  traceUnits.forEach((unit) => {
    const parentId = String(unit.parentId || traceRoot.unitId).trim() || traceRoot.unitId
    const children = childrenByParent.get(parentId) || []
    children.push(unit)
    childrenByParent.set(parentId, children)
  })
  childrenByParent.forEach((children) => children.sort(compareUnitAxisOrder))

  const expandedIds = new Set<string>()
  const hasExplicitExpandedIds = Array.isArray(expandedUnitIds)
  if (hasExplicitExpandedIds) {
    normalizeIdList(expandedUnitIds || []).forEach((unitId) => expandedIds.add(unitId))
  }
  const activeUnitId = String(activeUnit?.unitId || '').trim()
  if (!hasExplicitExpandedIds && activeUnitId && shouldUseTrajectoryAxisRelationLayout(activeUnit)) {
    let currentId = activeUnitId
    const visited = new Set<string>()
    while (currentId && !visited.has(currentId)) {
      visited.add(currentId)
      const current = unitById.get(currentId)
      if (!current || current.unitId === traceRoot.unitId) break
      if (isExpandableTrajectoryUnit(current)) expandedIds.add(current.unitId)
      const parentId = String(current.parentId || '').trim()
      if (parentId && parentId !== traceRoot.unitId) expandedIds.add(parentId)
      currentId = parentId
    }
  }

  const sequence: UnitView[] = [traceRoot]
  const appendChildren = (parentId: string) => {
    const children = childrenByParent.get(parentId) || []
    children.forEach((child) => {
      sequence.push(child)
      if (expandedIds.has(child.unitId)) appendChildren(child.unitId)
    })
  }
  appendChildren(traceRoot.unitId)
  return sequence
}

export function filterUnitRelationSourceRelations(
  relations: RelationViewRecord[],
  filter: Partial<UnitRelationPredicateFilter> = {},
  context: {
    units?: UnitView[]
    predicates?: PredicateView[]
    focusUnitId?: string
  } = {}
) {
  const predicateIds = new Set(normalizeIdList(filter.predicateIds || []))
  const predicateFamilies = new Set(normalizeIdList(filter.predicateFamilies || []))
  const semanticTypes = new Set(normalizeSemanticTypes(filter.semanticTypes || []))
  const statuses = new Set(normalizeRelationStatuses(filter.statuses || []))
  const predicateById = new Map((context.predicates || []).map((predicate) => [predicate.predicateId, predicate] as const))
  const unitById = new Map((context.units || []).map((unit) => [unit.unitId, unit] as const))
  const focusUnitId = String(context.focusUnitId || '').trim()
  return (Array.isArray(relations) ? relations : []).filter((relation) => {
    if (predicateIds.size && !predicateIds.has(relation.predicateId)) return false
    if (predicateFamilies.size && !predicateFamilies.has(predicateById.get(relation.predicateId)?.family || '')) return false
    if (semanticTypes.size && !relationMatchesSemanticTypes(relation, semanticTypes, unitById, focusUnitId)) return false
    if (statuses.size && !statuses.has(relation.status)) return false
    return true
  })
}

export function limitUnitRelationSourceRelations(
  relations: RelationViewRecord[],
  scope: Partial<UnitRelationScope> = {}
) {
  const maxRelationCount = normalizePositiveInt(scope.maxRelationCount, 80)
  const maxNodeCount = normalizePositiveInt(scope.maxNodeCount, 48)
  const maxHops = normalizePositiveInt(scope.maxHops, 2)
  const focusUnitId = String(scope.focusUnitId || '').trim()
  const sourceRelations = Array.isArray(relations) ? relations : []
  if (!focusUnitId) return sourceRelations.slice(0, maxRelationCount)

  const relationRefsByUnitId = new Map<string, RelationViewRecord[]>()
  sourceRelations.forEach((relation) => {
    appendRelationRef(relationRefsByUnitId, relation.sourceUnitId, relation)
    appendRelationRef(relationRefsByUnitId, relation.targetUnitId, relation)
  })

  const visibleUnitIds = new Set<string>([focusUnitId])
  const visibleRelationIds = new Set<string>()
  const visibleRelations: RelationViewRecord[] = []
  const queue: Array<{ unitId: string; depth: number }> = [{ unitId: focusUnitId, depth: 0 }]
  const visitedDepthByUnitId = new Map<string, number>([[focusUnitId, 0]])
  let queueCursor = 0

  while (queueCursor < queue.length && visibleRelations.length < maxRelationCount) {
    const current = queue[queueCursor]
    queueCursor += 1
    if (current.depth >= maxHops) continue
    const refs = relationRefsByUnitId.get(current.unitId) || []
    for (const relation of refs) {
      if (visibleRelations.length >= maxRelationCount) break
      if (visibleRelationIds.has(relation.relationId)) continue
      const nextUnitId = relation.sourceUnitId === current.unitId ? relation.targetUnitId : relation.sourceUnitId
      const needsNewUnit = Boolean(nextUnitId && !visibleUnitIds.has(nextUnitId))
      if (needsNewUnit && visibleUnitIds.size >= maxNodeCount) continue
      visibleRelationIds.add(relation.relationId)
      visibleRelations.push(relation)
      if (!nextUnitId || visibleUnitIds.has(nextUnitId)) continue
      visibleUnitIds.add(nextUnitId)
      const nextDepth = current.depth + 1
      const visitedDepth = visitedDepthByUnitId.get(nextUnitId)
      if (visitedDepth === undefined || nextDepth < visitedDepth) {
        visitedDepthByUnitId.set(nextUnitId, nextDepth)
        queue.push({ unitId: nextUnitId, depth: nextDepth })
      }
    }
  }

  return visibleRelations
}

export function createRelationProjectionCharacter(id: string, name: string): Character {
  return {
    id,
    name,
    gender: '',
    age: '',
    emoji: '',
    avatar_path: '',
    group_id: '',
    desc: '',
    appearance: '',
    outfit: '',
    personality: '',
    hobbies: '',
    abilities: '',
    experience: '',
    worldview: '',
    background: '',
    speaking_style: '',
    nicknames: '',
    default_preset: '',
    default_model: '',
    schedule: '',
    yearly_schedule: '',
    current_activities: '',
    relationships: '',
    affection: 0,
    locations: '',
    orderIndex: 0,
    created_at: '',
    speakingStyle: '',
    brain_links: '{}',
    brainLinks: {},
    brain_documents: '{}',
    brainDocuments: {},
    brain_cognition_nodes: '[]',
    brainCognitionNodes: [],
    brain_trace_nodes: '[]',
    brainTraceNodes: [],
    brainTrajectoryMeta: { birthDate: '', zeroNote: '', viewOffsets: {} },
    brain_trajectory_meta: '{"birthDate":"","zeroNote":"","viewOffsets":{}}',
    brainPinnedOffsets: {},
    brain_pinned_offsets: '{}',
    brainNodePositions: {},
    brain_node_positions: '{}'
  }
}

export function resolveUnitRelationSourceFocusNodeId(source: UnitRelationSourceAdapter) {
  const rootUnit = source.units.find((unit) => unit.unitType === 'root') || source.units[0] || null
  const activeUnit = source.activeUnit || rootUnit
  return resolveUnitRelationProjectionNodeId(activeUnit, source.characterId)
}

export function resolveUnitRelationSourceClipboardNodeIds(source: UnitRelationSourceAdapter) {
  const selected = new Set(normalizeIdList(source.clipboard.unitIds))
  if (!selected.size) return []
  return source.units
    .filter((unit) => selected.has(unit.unitId))
    .map((unit) => resolveUnitRelationProjectionNodeId(unit, source.characterId))
    .filter(Boolean)
}

export function mapUnitRelationSourceNodeIdsToUnitIds(
  source: UnitRelationSourceAdapter,
  nodeIds: string[]
) {
  const unitIdByNodeId = new Map<string, string>()
  source.units.forEach((unit) => {
    unitIdByNodeId.set(resolveUnitRelationProjectionNodeId(unit, source.characterId), unit.unitId)
  })
  return Array.from(new Set(normalizeIdList(nodeIds)
    .map((nodeId) => unitIdByNodeId.get(nodeId) || '')
    .filter(Boolean)))
}

export function mapUnitRelationSourceNodeIdToUnitId(
  source: UnitRelationSourceAdapter,
  nodeId: string
) {
  const normalizedNodeId = String(nodeId || '').trim()
  if (!normalizedNodeId) return ''
  const unit = source.units.find((item) => resolveUnitRelationProjectionNodeId(item, source.characterId) === normalizedNodeId)
  return unit?.unitId || ''
}

function normalizeIdList(ids: string[]) {
  return Array.from(new Set(ids.map((id) => String(id || '').trim()).filter(Boolean)))
}

function isExpandableTrajectoryUnit(unit: UnitView) {
  return unit.contentKind === 'group' || unit.unitType === 'traceGroup' || unit.unitType === 'traceDay'
}

function compareUnitAxisOrder(left: UnitView, right: UnitView) {
  const leftOrder = left.orderIndex ?? Number.MAX_SAFE_INTEGER
  const rightOrder = right.orderIndex ?? Number.MAX_SAFE_INTEGER
  if (leftOrder !== rightOrder) return leftOrder - rightOrder
  return left.title.localeCompare(right.title, 'zh-Hans-CN')
}

function normalizePredicateFilter(input: Partial<UnitRelationPredicateFilter> | undefined): UnitRelationPredicateFilter {
  return {
    predicateIds: normalizeIdList(input?.predicateIds || []),
    predicateFamilies: normalizeIdList(input?.predicateFamilies || []),
    semanticTypes: normalizeSemanticTypes(input?.semanticTypes || []),
    statuses: normalizeRelationStatuses(input?.statuses || [])
  }
}

function normalizeRelationScope(
  input: Partial<UnitRelationScope> | undefined,
  fallbackFocusUnitId: unknown
): UnitRelationScope {
  return {
    focusUnitId: String(input?.focusUnitId || fallbackFocusUnitId || '').trim(),
    maxHops: normalizePositiveInt(input?.maxHops, 2),
    maxNodeCount: normalizePositiveInt(input?.maxNodeCount, 48),
    maxRelationCount: normalizePositiveInt(input?.maxRelationCount, 80)
  }
}

function normalizePositiveInt(input: unknown, fallback: number) {
  const value = Number(input)
  if (!Number.isFinite(value) || value <= 0) return fallback
  return Math.floor(value)
}

function normalizeRelationStatuses(statuses: RelationViewStatus[]) {
  const allowed = new Set<RelationViewStatus>(['projection', 'declared', 'authored', 'candidate', 'confirmed', 'rejected'])
  return Array.from(new Set(statuses.filter((status) => allowed.has(status))))
}

function normalizeSemanticTypes(types: UnitSemanticType[]) {
  return Array.from(new Set(types.map((type) => normalizeUnitSemanticType(type))))
}

function appendRelationRef(map: Map<string, RelationViewRecord[]>, unitId: string, relation: RelationViewRecord) {
  const normalizedUnitId = String(unitId || '').trim()
  if (!normalizedUnitId) return
  const refs = map.get(normalizedUnitId) || []
  refs.push(relation)
  map.set(normalizedUnitId, refs)
}

function relationMatchesSemanticTypes(
  relation: RelationViewRecord,
  semanticTypes: Set<UnitSemanticType>,
  unitById: Map<string, UnitView>,
  focusUnitId: string
) {
  if (!semanticTypes.size) return true
  const endpointIds = focusUnitId && relation.sourceUnitId === focusUnitId
    ? [relation.targetUnitId]
    : focusUnitId && relation.targetUnitId === focusUnitId
      ? [relation.sourceUnitId]
      : [relation.sourceUnitId, relation.targetUnitId]
  return endpointIds.some((unitId) => semanticTypes.has(normalizeUnitSemanticType(unitById.get(unitId)?.semanticType)))
}

function noop() {}
