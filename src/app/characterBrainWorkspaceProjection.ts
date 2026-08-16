import type { Character } from '../types'
import type {
  CharacterBrainFieldKey,
  CharacterBrainNodeDensity,
  CharacterBrainNodeKind,
  CharacterBrainNodeModel,
  CharacterBrainNodeSize
} from '../types/characterBrain'
import type { UnitView } from '../types/unitView'
import {
  getCharacterBrainNodeById,
  getCharacterBrainRootId
} from './characterBrain'

type BuildOptions = {
  focusId?: string
  minDensity?: number
  relationNodeIds?: string[]
  layoutMode?: 'default' | 'trajectoryAxis'
  trajectoryExpandedNodeIds?: string[]
  forestRootNodeIds?: string[]
}

type ProjectionNodeSeed = {
  id: string
  title: string
  subtitle?: string
  kind: CharacterBrainNodeKind
  summary: string
  parentId?: string
  orderIndex: number
  deletable: boolean
  fieldKey?: CharacterBrainFieldKey
  sourceDocumentId?: string
  sourceDisplayPath?: string
}

type PositionedSeed = ProjectionNodeSeed & {
  x: number
  y: number
  size: CharacterBrainNodeSize
  density: CharacterBrainNodeDensity
  edgeKind?: CharacterBrainNodeModel['edgeKind']
}

const ROOT_ID = getCharacterBrainRootId()
const CORE_ROOT_ID = 'brain:see_me'
const SOUL_ROOT_ID = 'brain:cognition'
const TRACE_ROOT_ID = 'brain:trajectory'
const CHILD_DISTANCE = 240

const PREFERRED_ANGLE_BY_ID: Record<string, number> = {
  [CORE_ROOT_ID]: 210,
  [TRACE_ROOT_ID]: 330,
  [SOUL_ROOT_ID]: 90,
  'brain:desc': 345,
  'brain:personality': 25,
  'brain:goal_value': 70,
  'brain:detail_info': 150,
  'brain:system_info': 250,
  'brain:avatar': 210,
  'brain:preset': 330,
  'brain:name': 20,
  'brain:gender': 65,
  'brain:age': 110,
  'brain:nicknames': 155,
  'brain:default_preset': 210,
  'brain:default_model': 330,
  'brain:emoji': 215,
  'brain:avatar_path': 338,
  'brain:appearance': 165,
  'brain:speaking_style': 135,
  'brain:outfit': 95,
  'brain:hobbies': 195,
  'brain:abilities': 20,
  'brain:experience': 250,
  'brain:worldview': 305,
  'brain:background': 345
}

const FIELD_KEY_BY_NODE_ID: Record<string, CharacterBrainFieldKey> = {
  'brain:name': 'name',
  'brain:gender': 'gender',
  'brain:age': 'age',
  'brain:emoji': 'emoji',
  'brain:avatar_path': 'avatarPath',
  'brain:default_preset': 'defaultPreset',
  'brain:default_model': 'defaultModel',
  'brain:nicknames': 'nicknames',
  'brain:appearance': 'appearance',
  'brain:speaking_style': 'speakingStyle',
  'brain:outfit': 'outfit',
  'brain:personality': 'personality',
  'brain:hobbies': 'hobbies',
  'brain:abilities': 'abilities',
  'brain:experience': 'experience',
  'brain:worldview': 'worldview',
  'brain:background': 'background',
  'brain:desc': 'desc'
}

export function buildCharacterBrainWorkspaceProjection(
  character: Character,
  units: UnitView[],
  options: BuildOptions = {}
): CharacterBrainNodeModel[] {
  const registry = buildProjectionRegistry(character, units, options.forestRootNodeIds)
  const focusId = registry.nodeMap.has(String(options.focusId || '').trim())
    ? String(options.focusId || '').trim()
    : ROOT_ID
  if (options.layoutMode === 'trajectoryAxis') {
    const axisNodes = buildTrajectoryAxisScene(registry, focusId, options.trajectoryExpandedNodeIds)
    if (axisNodes.length) return axisNodes.filter((node) => node.density >= (Number(options.minDensity ?? 0)))
  }
  const nodes = focusId === ROOT_ID
    ? buildRootScene(registry)
    : buildFocusedScene(registry, focusId, options.relationNodeIds || [])
  const minDensity = Number(options.minDensity ?? 0)
  return dedupeNodes(nodes).filter((node) => node.density >= minDensity)
}

export function getCharacterBrainProjectionNodeById(
  character: Character,
  units: UnitView[],
  nodeId: string
): CharacterBrainNodeModel | null {
  const registry = buildProjectionRegistry(character, units)
  const seed = registry.nodeMap.get(String(nodeId || '').trim())
  return seed ? createNode({ ...seed, x: 0, y: 0, size: 2, density: 5 }) : null
}

function buildProjectionRegistry(character: Character, units: UnitView[], forestRootNodeIds: string[] = []) {
  const characterId = String(character.id || '').trim()
  const forestRootIds = new Set(forestRootNodeIds.map((id) => String(id || '').trim()).filter(Boolean))
  const unitIdToNodeId = new Map<string, string>()
  units.forEach((unit) => {
    unitIdToNodeId.set(unit.unitId, resolveUnitRelationProjectionNodeId(unit, characterId))
  })

  const nodeMap = new Map<string, ProjectionNodeSeed>()
  const childrenByParentId = new Map<string, ProjectionNodeSeed[]>()

  units.forEach((unit, index) => {
    const id = unitIdToNodeId.get(unit.unitId) || ''
    if (!id) return
    const parentId = forestRootIds.has(id)
      ? undefined
      : unit.parentId ? unitIdToNodeId.get(unit.parentId) : undefined
    const seed = createSeed(character, unit, id, parentId, index)
    nodeMap.set(id, seed)
  })

  if (!nodeMap.has(ROOT_ID)) {
    nodeMap.set(ROOT_ID, {
      id: ROOT_ID,
      title: character.name || '角色',
      kind: 'root',
      summary: String(character.desc || '').trim() || '还没有角色简介',
      orderIndex: -1,
      deletable: false
    })
  }

  nodeMap.forEach((seed) => {
    if (!seed.parentId || !nodeMap.has(seed.parentId)) return
    const siblings = childrenByParentId.get(seed.parentId) || []
    siblings.push(seed)
    childrenByParentId.set(seed.parentId, siblings)
  })
  childrenByParentId.forEach((children) => children.sort(compareSeeds))

  return { nodeMap, childrenByParentId, forestRootIds }
}

export function resolveCharacterBrainProjectionNodeId(unit: UnitView, characterId: string) {
  return resolveUnitRelationProjectionNodeId(unit, characterId)
}

export function resolveUnitRelationProjectionNodeId(unit: UnitView | null | undefined, projectionId = '') {
  if (!unit) return ROOT_ID
  if (unit.unitType === 'character') return ROOT_ID
  if (unit.unitType === 'root') return ROOT_ID
  if (unit.unitType === 'core') return CORE_ROOT_ID
  if (unit.unitType === 'soul') return SOUL_ROOT_ID
  if (unit.unitType === 'trace') return TRACE_ROOT_ID
  const sourceId = String(unit.sourceId || '').trim()
  const characterId = String(projectionId || '').trim()
  if (sourceId === `${characterId}:core`) return CORE_ROOT_ID
  if (sourceId === `${characterId}:soul`) return SOUL_ROOT_ID
  if (sourceId === `${characterId}:trace`) return TRACE_ROOT_ID
  if (sourceId.startsWith('brain:')) return sourceId
  if (unit.domain === 'docLibrary') return `unit:${unit.unitId}`
  return sourceId || unit.unitId
}

function createSeed(
  character: Character,
  unit: UnitView,
  id: string,
  parentId: string | undefined,
  fallbackOrder: number
): ProjectionNodeSeed {
  const base = getCharacterBrainNodeById(character, id)
  const fieldKey = readFieldKey(unit, id) || base?.fieldKey
  return {
    id,
    title: unit.title || base?.title || '未命名节点',
    subtitle: String(unit.metadata?.subtitle || '').trim() || undefined,
    kind: resolveNodeKind(unit, id, Boolean(childrenHint(unit)), base?.kind),
    summary: unit.compilePage?.summary || unit.body || base?.summary || '',
    parentId,
    orderIndex: unit.orderIndex ?? fallbackOrder,
    deletable: base?.deletable ?? false,
    fieldKey,
    sourceDocumentId: String(unit.metadata?.sourceDocumentId || base?.sourceDocumentId || '').trim() || undefined,
    sourceDisplayPath: unit.sourcePath || base?.sourceDisplayPath
  }
}

function childrenHint(unit: UnitView) {
  return unit.contentKind === 'group' || unit.unitType === 'character' || unit.unitType === 'core' || unit.unitType === 'soul' || unit.unitType === 'trace'
}

function resolveNodeKind(
  unit: UnitView,
  id: string,
  canHaveChildren: boolean,
  fallback?: CharacterBrainNodeKind
): CharacterBrainNodeKind {
  if (id === ROOT_ID) return 'root'
  if (id === CORE_ROOT_ID || id === SOUL_ROOT_ID || id === TRACE_ROOT_ID) return 'zone'
  if (unit.unitType === 'coreField' || FIELD_KEY_BY_NODE_ID[id]) return 'field'
  if (canHaveChildren) return 'group'
  return fallback || 'field'
}

function readFieldKey(unit: UnitView, nodeId: string) {
  const fromMeta = String(unit.metadata?.fieldKey || '').trim()
  if (fromMeta) return fromMeta as CharacterBrainFieldKey
  return FIELD_KEY_BY_NODE_ID[nodeId]
}

function buildRootScene(registry: ReturnType<typeof buildProjectionRegistry>) {
  if (registry.forestRootIds.size) {
    const roots = Array.from(registry.forestRootIds)
      .map((id) => registry.nodeMap.get(id))
      .filter((seed): seed is ProjectionNodeSeed => Boolean(seed))
      .sort(compareSeeds)
    const radius = roots.length > 1 ? Math.max(260, roots.length * 82) : 0
    return roots.map((seed, index) => {
      const angle = roots.length > 1 ? -90 + ((index * 360) / roots.length) : 0
      const point = pointOnCircle(0, 0, radius, angle)
      return createNode({
        ...seed,
        parentId: undefined,
        x: point.x,
        y: point.y,
        size: 2,
        density: 5
      })
    })
  }
  const root = registry.nodeMap.get(ROOT_ID)
  if (!root) return []
  return [
    createNode({ ...root, x: 0, y: 0, size: 3, density: 5 }),
    ...layoutChildren(registry, ROOT_ID, 0, 0).map((seed) => createNode({
      ...seed,
      size: 2,
      density: 5
    }))
  ]
}

function buildFocusedScene(
  registry: ReturnType<typeof buildProjectionRegistry>,
  focusId: string,
  relationNodeIds: string[] = []
) {
  const focus = registry.nodeMap.get(focusId)
  if (!focus) return buildRootScene(registry)
  const chain = collectNodeChain(registry.nodeMap, focusId, registry.forestRootIds)
  const focusIndex = chain.indexOf(focusId)
  const totalAncestors = Math.max(focusIndex, 0)
  const chainPositions = resolveChainPositions(registry, chain)
  const focusPosition = chainPositions.get(focusId) || { x: 0, y: 0 }
  const nodes: CharacterBrainNodeModel[] = []

  chain.forEach((id, index) => {
    const seed = registry.nodeMap.get(id)
    if (!seed) return
    const isFocus = id === focusId
    const distance = totalAncestors - index
    const position = chainPositions.get(id) || { x: focusPosition.x, y: focusPosition.y - (distance * CHILD_DISTANCE) }
    nodes.push(createNode({
      ...seed,
      x: position.x,
      y: position.y,
      size: resolveSize(isFocus ? 'focus' : 'parent', distance),
      density: resolveDensity(isFocus ? 'focus' : 'parent', distance)
    }))
  })

  chain.forEach((ancestorId, index) => {
    if (ancestorId === focusId) return
    const ancestorPosition = chainPositions.get(ancestorId)
    if (!ancestorPosition) return
    const ancestorDistance = Math.max(totalAncestors - index, 0)
    const chainChildId = chain[index + 1]
    layoutChildren(registry, ancestorId, ancestorPosition.x, ancestorPosition.y)
      .filter((seed) => seed.id !== chainChildId && !chain.includes(seed.id))
      .forEach((seed) => {
        nodes.push(createNode({
          ...seed,
          size: resolveSize('context', ancestorDistance + 1),
          density: resolveDensity('context', ancestorDistance + 1)
        }))
      })
  })

  layoutChildren(registry, focusId, focusPosition.x, focusPosition.y)
    .forEach((seed) => {
      nodes.push(createNode({
        ...seed,
        size: resolveSize('child', 1),
        density: resolveDensity('child', 1)
      }))
    })

  const includedIds = new Set(nodes.map((node) => node.id))
  const relationSeeds = relationNodeIds
    .map((id) => registry.nodeMap.get(String(id || '').trim()))
    .filter((seed): seed is ProjectionNodeSeed => {
      if (!seed) return false
      return seed.id !== focusId && !includedIds.has(seed.id)
    })
    .slice(0, 40)
  relationSeeds.forEach((seed, index) => {
    const angle = normalizeAngle(24 + (index * (360 / Math.max(relationSeeds.length, 1))))
    const distance = 300 + ((index % 2) * 46)
    const point = pointOnCircle(focusPosition.x, focusPosition.y, distance, angle)
    nodes.push(createNode({
      ...seed,
      parentId: focusId,
      x: point.x,
      y: point.y,
      size: 2,
      density: index < 12 ? 4 : 3,
      edgeKind: 'link'
    }))
    includedIds.add(seed.id)
  })

  return avoidProjectionNodeCollisions(nodes, focusId)
}

function buildTrajectoryAxisScene(
  registry: ReturnType<typeof buildProjectionRegistry>,
  focusId: string,
  expandedNodeIds?: string[]
) {
  const root = registry.nodeMap.get(ROOT_ID)
  if (!registry.nodeMap.has(TRACE_ROOT_ID)) return []
  if (focusId !== TRACE_ROOT_ID && !isTrajectoryAxisNodeId(focusId)) return []
  const sequence = buildTrajectoryAxisSeedSequence(registry, focusId, expandedNodeIds)
  if (!sequence.length) return []
  const rootPosition = { x: 0, y: 0 }
  const zoneRadius = 220
  const axisGap = 170
  const tracePoint = pointOnCircle(rootPosition.x, rootPosition.y, zoneRadius, 90)
  const axisNodes = sequence.map((seed, index) => createNode({
    ...seed,
    parentId: index > 0
      ? sequence[index - 1].id
      : (root ? ROOT_ID : undefined),
    x: tracePoint.x,
    y: roundScene(tracePoint.y + (index * axisGap)),
    size: 2,
    density: 5
  }))
  if (!root) return axisNodes

  const contextNodes = [
    createNode({
      ...root,
      x: rootPosition.x,
      y: rootPosition.y,
      size: 3,
      density: 5
    })
  ]
  const core = registry.nodeMap.get(CORE_ROOT_ID)
  if (core) {
    contextNodes.push(createNode({
      ...core,
      parentId: ROOT_ID,
      ...pointOnCircle(rootPosition.x, rootPosition.y, zoneRadius, 210),
      size: 2,
      density: 5
    }))
  }
  const soul = registry.nodeMap.get(SOUL_ROOT_ID)
  if (soul) {
    contextNodes.push(createNode({
      ...soul,
      parentId: ROOT_ID,
      ...pointOnCircle(rootPosition.x, rootPosition.y, zoneRadius, 330),
      size: 2,
      density: 5
    }))
  }
  return [...contextNodes, ...axisNodes]
}

function buildTrajectoryAxisSeedSequence(
  registry: ReturnType<typeof buildProjectionRegistry>,
  focusId: string,
  expandedNodeIds?: string[]
) {
  const traceRoot = registry.nodeMap.get(TRACE_ROOT_ID)
  if (!traceRoot) return []
  const expandedIds = Array.isArray(expandedNodeIds)
    ? new Set(expandedNodeIds.map((id) => String(id || '').trim()).filter(Boolean))
    : resolveTrajectoryAxisExpandedIds(registry, focusId)
  const sequence: ProjectionNodeSeed[] = [traceRoot]
  const appendChildren = (parentId: string) => {
    const children = (registry.childrenByParentId.get(parentId) || [])
      .filter((seed) => isTrajectoryAxisNodeId(seed.id))
    children.forEach((child) => {
      sequence.push(child)
      if (expandedIds.has(child.id)) appendChildren(child.id)
    })
  }
  appendChildren(TRACE_ROOT_ID)
  return sequence
}

function resolveTrajectoryAxisExpandedIds(
  registry: ReturnType<typeof buildProjectionRegistry>,
  focusId: string
) {
  const expandedIds = new Set<string>()
  if (focusId === TRACE_ROOT_ID || !isTrajectoryAxisNodeId(focusId)) return expandedIds
  const chain = collectNodeChain(registry.nodeMap, focusId)
  chain.forEach((id) => {
    if (id === ROOT_ID || id === TRACE_ROOT_ID) return
    const seed = registry.nodeMap.get(id)
    if (seed && seed.kind === 'group') expandedIds.add(id)
  })
  const focus = registry.nodeMap.get(focusId)
  if (focus?.parentId && focus.parentId !== TRACE_ROOT_ID) expandedIds.add(focus.parentId)
  return expandedIds
}

function isTrajectoryAxisNodeId(nodeId: string) {
  return String(nodeId || '').startsWith('brain:trajectory:node:')
}

function collectNodeChain(
  nodeMap: Map<string, ProjectionNodeSeed>,
  nodeId: string,
  forestRootIds: Set<string> = new Set()
) {
  const chain: string[] = []
  let currentId = nodeId
  const visited = new Set<string>()
  while (currentId && !visited.has(currentId)) {
    visited.add(currentId)
    chain.unshift(currentId)
    if (currentId === ROOT_ID || forestRootIds.has(currentId)) break
    currentId = nodeMap.get(currentId)?.parentId || ROOT_ID
  }
  if (!forestRootIds.size && !chain.includes(ROOT_ID)) chain.unshift(ROOT_ID)
  return chain
}

function resolveChainPositions(registry: ReturnType<typeof buildProjectionRegistry>, chain: string[]) {
  const positions = new Map<string, { x: number; y: number }>()
  if (!chain.length) return positions
  positions.set(chain[0], { x: 0, y: 0 })
  for (let index = 1; index < chain.length; index += 1) {
    const parentId = chain[index - 1]
    const nodeId = chain[index]
    const parentPosition = positions.get(parentId) || { x: 0, y: 0 }
    const child = layoutChildren(registry, parentId, parentPosition.x, parentPosition.y)
      .find((seed) => seed.id === nodeId)
    positions.set(nodeId, child ? { x: child.x, y: child.y } : { x: parentPosition.x, y: parentPosition.y + CHILD_DISTANCE })
  }
  return positions
}

function layoutChildren(
  registry: ReturnType<typeof buildProjectionRegistry>,
  parentId: string,
  centerX: number,
  centerY: number
): PositionedSeed[] {
  const children = registry.childrenByParentId.get(parentId) || []
  if (!children.length) return []
  const total = Math.max(children.length, 1)
  const evenStep = 360 / total
  const startAngle = normalizeAngle(children.reduce((sum, child) => sum + preferredAngle(child.id), 0) / total)
  return children.map((child, index) => {
    const angle = normalizeAngle(startAngle + (index * evenStep))
    const point = pointOnCircle(centerX, centerY, CHILD_DISTANCE, angle)
    return {
      ...child,
      x: point.x,
      y: point.y,
      size: 2,
      density: 5
    }
  })
}

function preferredAngle(nodeId: string) {
  return PREFERRED_ANGLE_BY_ID[nodeId] ?? 90
}

function pointOnCircle(centerX: number, centerY: number, radius: number, angle: number) {
  const radians = (normalizeAngle(angle) * Math.PI) / 180
  return {
    x: roundScene(centerX + (Math.cos(radians) * radius)),
    y: roundScene(centerY + (Math.sin(radians) * radius))
  }
}

function normalizeAngle(angle: number) {
  return ((angle % 360) + 360) % 360
}

function roundScene(value: number) {
  return Math.round(value * 100) / 100
}

function resolveSize(relation: 'focus' | 'parent' | 'child' | 'context', distance: number): CharacterBrainNodeSize {
  if (relation === 'focus') return 3
  if (relation === 'parent' && distance <= 1) return 2
  if (relation === 'child') return 2
  return 1
}

function resolveDensity(relation: 'focus' | 'parent' | 'child' | 'context', distance: number): CharacterBrainNodeDensity {
  if (relation === 'focus') return 5
  if (relation === 'parent' && distance <= 1) return 5
  if (relation === 'child') return 5
  if (relation === 'parent') return Math.max(1, 5 - distance) as CharacterBrainNodeDensity
  return Math.max(1, 4 - distance) as CharacterBrainNodeDensity
}

function createNode(input: PositionedSeed): CharacterBrainNodeModel {
  return {
    id: input.id,
    title: input.title,
    subtitle: input.subtitle,
    kind: input.kind,
    summary: input.summary,
    size: input.size,
    density: input.density,
    x: input.x,
    y: input.y,
    deletable: input.deletable,
    parentId: input.parentId,
    fieldKey: input.fieldKey,
    edgeKind: input.edgeKind,
    sourceDocumentId: input.sourceDocumentId,
    sourceDisplayPath: input.sourceDisplayPath
  }
}

function compareSeeds(left: ProjectionNodeSeed, right: ProjectionNodeSeed) {
  if (left.orderIndex !== right.orderIndex) return left.orderIndex - right.orderIndex
  return left.title.localeCompare(right.title, 'zh-Hans-CN')
}

function dedupeNodes(nodes: CharacterBrainNodeModel[]) {
  const seen = new Set<string>()
  return nodes.filter((node) => {
    if (seen.has(node.id)) return false
    seen.add(node.id)
    return true
  })
}

function avoidProjectionNodeCollisions(
  inputNodes: CharacterBrainNodeModel[],
  focusId: string
) {
  const nodes = inputNodes.map((node) => ({ ...node }))
  const minDistance = 170
  const maxIterations = 10
  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    let changed = false
    for (let leftIndex = 0; leftIndex < nodes.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < nodes.length; rightIndex += 1) {
        const left = nodes[leftIndex]
        const right = nodes[rightIndex]
        if (left.edgeKind === 'link' || right.edgeKind === 'link') continue
        const dx = right.x - left.x
        const dy = right.y - left.y
        const distance = Math.sqrt((dx * dx) + (dy * dy))
        if (distance >= minDistance) continue
        const overlap = (minDistance - distance) / 2
        const angle = distance < 0.001
          ? ((leftIndex + rightIndex + 1) * 51 * Math.PI) / 180
          : Math.atan2(dy, dx)
        const pushX = roundScene(Math.cos(angle) * overlap)
        const pushY = roundScene(Math.sin(angle) * overlap)
        const leftPriority = collisionPriority(left, focusId)
        const rightPriority = collisionPriority(right, focusId)
        if (leftPriority > rightPriority) {
          right.x = roundScene(right.x + (pushX * 2))
          right.y = roundScene(right.y + (pushY * 2))
        } else if (rightPriority > leftPriority) {
          left.x = roundScene(left.x - (pushX * 2))
          left.y = roundScene(left.y - (pushY * 2))
        } else {
          left.x = roundScene(left.x - pushX)
          left.y = roundScene(left.y - pushY)
          right.x = roundScene(right.x + pushX)
          right.y = roundScene(right.y + pushY)
        }
        changed = true
      }
    }
    if (!changed) break
  }
  return nodes
}

function collisionPriority(node: CharacterBrainNodeModel, focusId: string) {
  if (node.id === focusId) return 100
  if (node.id === ROOT_ID) return 90
  if (node.id === CORE_ROOT_ID || node.id === SOUL_ROOT_ID || node.id === TRACE_ROOT_ID) return 80
  if (node.kind === 'zone') return 70
  if (node.parentId === focusId) return 30
  return 10
}
