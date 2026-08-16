import { ref, type Ref } from 'vue'
import type { CharacterBrainNodeModel } from '../types/characterBrain'

export type CharacterBrainSimNode = CharacterBrainNodeModel & {
  x: number
  y: number
  vx: number
  vy: number
  fx: number | null
  fy: number | null
  layoutX: number
  layoutY: number
}

export type CharacterBrainNodeDragState = {
  mode: 'node'
  behavior: 'network' | 'network-pan' | 'local' | 'subtree-pan' | 'folder-pan' | 'selection-pan'
  pointerId: number
  nodeId: string
  moved: boolean
  historyPushed?: boolean
  originX: number
  originY: number
  dragTargetX: number
  dragTargetY: number
  lastDeltaX: number
  lastDeltaY: number
  dragStartPositions?: Record<string, { x: number; y: number }>
  rigidFollowerIds?: string[]
}

type RadialLayoutNode = Pick<
  CharacterBrainSimNode,
  'id' | 'parentId' | 'edgeKind' | 'x' | 'y' | 'layoutX' | 'layoutY' | 'vx' | 'vy' | 'fx' | 'fy' | 'size'
>

type RadialLayoutComponent = {
  rootId: string
  nodeIds: string[]
  positions: Map<string, { x: number; y: number }>
  bounds: RadialLayoutBounds
}

type RadialLayoutBounds = {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

type UseCharacterBrainPhysicsOptions = {
  viewBoxWidth: number
  viewBoxHeight: number
  interactionState: Ref<{ mode: string; nodeId?: string } | null>
  nodeRadius: (size: number) => number
  anchoredNodeIdSet?: Ref<Set<string>>
  renderedNodeIdSet?: Ref<Set<string>>
}

type CharacterBrainNodePhysicsContext = {
  treatAllVisibleNodesAsNetwork: boolean
}

const DRAG_STRENGTH = 0.52
const LINK_STRENGTH = 0.09
const LINK_DRAG_STRENGTH = 0.02
const REPULSION_STRENGTH = 16
const VELOCITY_DECAY = 0.36
const ALPHA_DECAY = 0.08
const DRAG_ALPHA_TARGET = 0.36
const ALPHA_MIN = 0.002
const IDLE_SPEED = 0.03
const NETWORK_PAN_SPRING = 0.22
const NETWORK_PAN_DAMPING = 0.7
const TRACE_ROOT_NODE_ID = 'brain:trajectory'
const TRACE_NODE_ID_PREFIX = 'brain:trajectory:node:'

export function settleCharacterBrainRadialClusters(
  nodes: RadialLayoutNode[],
  movableNodeIds: string[],
  nodeRadius: (size: number) => number,
  options: { parentChildDistance?: number; clusterGap?: number } = {}
) {
  const movableIds = new Set(movableNodeIds.map((id) => String(id || '').trim()).filter(Boolean))
  if (!nodes.length || !movableIds.size) return []
  const movableNodes = nodes.filter((node) => movableIds.has(node.id))
  if (!movableNodes.length) return []

  const movableNodeById = new Map(movableNodes.map((node) => [node.id, node] as const))
  const childrenByParent = buildRadialChildrenMap(movableNodes, movableNodeById)
  const rootIds = movableNodes
    .filter((node) => !readMovableStructuralParentId(node, movableNodeById))
    .sort((left, right) => compareRadialRootOrder(left, right))
    .map((node) => node.id)
  const parentChildDistance = Math.max(120, Number(options.parentChildDistance ?? 240))
  const clusterGap = Math.max(48, Number(options.clusterGap ?? parentChildDistance * 1.05))
  const nodeExtent = Math.max(
    22,
    parentChildDistance * 0.18,
    ...movableNodes.map((node) => nodeRadius(node.size))
  )
  const subtreeRadiusById = new Map<string, number>()
  const childRingRadiusById = new Map<string, number>()

  rootIds.forEach((rootId) => {
    measureRadialSubtree(
      rootId,
      childrenByParent,
      subtreeRadiusById,
      childRingRadiusById,
      nodeExtent,
      parentChildDistance
    )
  })

  const components = rootIds.map((rootId) => buildRadialLayoutComponent(
    rootId,
    movableNodeById,
    childrenByParent,
    childRingRadiusById,
    nodeExtent
  ))
  packRadialLayoutComponents(components, movableNodes, clusterGap)
  separateRadialComponentsFromFixedNodes(
    components,
    nodes.filter((node) => !movableIds.has(node.id)),
    nodeRadius,
    Math.max(parentChildDistance * 0.7, clusterGap * 0.45)
  )

  const nextPositionById = new Map<string, { x: number; y: number }>()
  components.forEach((component) => {
    component.positions.forEach((position, nodeId) => nextPositionById.set(nodeId, position))
  })

  const changedIds = new Set<string>()
  movableNodes.forEach((node) => {
    const nextPosition = nextPositionById.get(node.id)
    if (!nextPosition) return
    if (Math.hypot(nextPosition.x - node.x, nextPosition.y - node.y) < 0.01) return
    node.x = nextPosition.x
    node.y = nextPosition.y
    changedIds.add(node.id)
  })

  nodes.forEach((node) => {
    if (!changedIds.has(node.id)) return
    node.layoutX = node.x
    node.layoutY = node.y
    node.vx = 0
    node.vy = 0
    node.fx = null
    node.fy = null
  })
  return [...changedIds]
}

function buildRadialChildrenMap(
  nodes: RadialLayoutNode[],
  movableNodeById: Map<string, RadialLayoutNode>
) {
  const childrenByParent = new Map<string, RadialLayoutNode[]>()
  nodes.forEach((node) => {
    const parentId = readMovableStructuralParentId(node, movableNodeById)
    if (!parentId) return
    const children = childrenByParent.get(parentId) || []
    children.push(node)
    childrenByParent.set(parentId, children)
  })
  childrenByParent.forEach((children, parentId) => {
    const parent = movableNodeById.get(parentId)
    children.sort((left, right) => compareRadialChildOrder(left, right, parent))
  })
  return childrenByParent
}

function readMovableStructuralParentId(
  node: RadialLayoutNode,
  movableNodeById: Map<string, RadialLayoutNode>
) {
  const parentId = String(node.parentId || '').trim()
  if (!parentId || node.edgeKind === 'link' || !movableNodeById.has(parentId)) return ''
  return parentId
}

function compareRadialRootOrder(left: RadialLayoutNode, right: RadialLayoutNode) {
  if (Math.abs(left.y - right.y) > 0.01) return left.y - right.y
  if (Math.abs(left.x - right.x) > 0.01) return left.x - right.x
  return left.id.localeCompare(right.id)
}

function compareRadialChildOrder(
  left: RadialLayoutNode,
  right: RadialLayoutNode,
  parent?: RadialLayoutNode
) {
  if (!parent) return left.id.localeCompare(right.id)
  const leftAngle = normalizeRadialAngle(Math.atan2(left.y - parent.y, left.x - parent.x))
  const rightAngle = normalizeRadialAngle(Math.atan2(right.y - parent.y, right.x - parent.x))
  if (Math.abs(leftAngle - rightAngle) > 0.0001) return leftAngle - rightAngle
  return left.id.localeCompare(right.id)
}

function normalizeRadialAngle(angle: number) {
  const fullCircle = Math.PI * 2
  return ((angle % fullCircle) + fullCircle) % fullCircle
}

function measureRadialSubtree(
  nodeId: string,
  childrenByParent: Map<string, RadialLayoutNode[]>,
  subtreeRadiusById: Map<string, number>,
  childRingRadiusById: Map<string, number>,
  nodeExtent: number,
  parentChildDistance: number,
  visiting = new Set<string>()
) {
  const cachedRadius = subtreeRadiusById.get(nodeId)
  if (cachedRadius !== undefined) return cachedRadius
  if (visiting.has(nodeId)) return nodeExtent
  visiting.add(nodeId)
  const children = childrenByParent.get(nodeId) || []
  if (!children.length) {
    visiting.delete(nodeId)
    subtreeRadiusById.set(nodeId, nodeExtent)
    return nodeExtent
  }

  const childRadii = children.map((child) => measureRadialSubtree(
    child.id,
    childrenByParent,
    subtreeRadiusById,
    childRingRadiusById,
    nodeExtent,
    parentChildDistance,
    visiting
  ))
  const largestChildRadius = Math.max(...childRadii)
  // 子树只提供有限的扩圈提示，不能把完整递归包围半径逐层相加，否则深树会指数式撑大。
  const effectiveChildRadius = Math.min(largestChildRadius, parentChildDistance * 1.15)
  const minimumSiblingDistance = Math.max(
    (nodeExtent * 2) + (parentChildDistance * 0.2),
    (effectiveChildRadius * 1.15) + (parentChildDistance * 0.22),
    parentChildDistance * 0.78
  )
  const angularStep = (Math.PI * 2) / children.length
  const chordFactor = children.length > 1 ? 2 * Math.sin(angularStep / 2) : Number.POSITIVE_INFINITY
  const ringRadius = Math.max(
    parentChildDistance,
    children.length > 1 ? minimumSiblingDistance / Math.max(chordFactor, 0.001) : parentChildDistance
  )
  childRingRadiusById.set(nodeId, ringRadius)
  const subtreeRadius = ringRadius + Math.min(largestChildRadius, parentChildDistance * 1.35)
  subtreeRadiusById.set(nodeId, subtreeRadius)
  visiting.delete(nodeId)
  return subtreeRadius
}

function buildRadialLayoutComponent(
  rootId: string,
  nodeById: Map<string, RadialLayoutNode>,
  childrenByParent: Map<string, RadialLayoutNode[]>,
  childRingRadiusById: Map<string, number>,
  nodeExtent: number
): RadialLayoutComponent {
  const positions = new Map<string, { x: number; y: number }>()
  const nodeIds: string[] = []
  positions.set(rootId, { x: 0, y: 0 })

  const placeChildren = (parentId: string, visiting: Set<string>, incomingAngle?: number) => {
    if (visiting.has(parentId)) return
    visiting.add(parentId)
    nodeIds.push(parentId)
    const parentPosition = positions.get(parentId)
    const parent = nodeById.get(parentId)
    const children = childrenByParent.get(parentId) || []
    if (!parentPosition || !parent || !children.length) {
      visiting.delete(parentId)
      return
    }
    const step = (Math.PI * 2) / children.length
    // 非根节点把“返回父节点”的方向留在两个角度槽之间，避免孙节点沿原边折回并压到祖先上。
    const startAngle = incomingAngle === undefined
      ? resolveBestRadialRotation(children, parent, step)
      : incomingAngle + Math.PI + (step / 2)
    const ringRadius = childRingRadiusById.get(parentId) || 0
    children.forEach((child, index) => {
      const angle = startAngle + (index * step)
      positions.set(child.id, {
        x: parentPosition.x + (Math.cos(angle) * ringRadius),
        y: parentPosition.y + (Math.sin(angle) * ringRadius)
      })
      placeChildren(child.id, visiting, angle)
    })
    visiting.delete(parentId)
  }
  placeChildren(rootId, new Set())

  return {
    rootId,
    nodeIds,
    positions,
    bounds: readRadialComponentBounds(positions, nodeExtent)
  }
}

function resolveBestRadialRotation(
  children: RadialLayoutNode[],
  parent: RadialLayoutNode,
  step: number
) {
  if (children.length === 1) {
    const currentDistance = Math.hypot(children[0].x - parent.x, children[0].y - parent.y)
    return currentDistance > 0.01
      ? Math.atan2(children[0].y - parent.y, children[0].x - parent.x)
      : -Math.PI / 2
  }
  let sinTotal = 0
  let cosTotal = 0
  children.forEach((child, index) => {
    const currentAngle = Math.atan2(child.y - parent.y, child.x - parent.x)
    const rotationCandidate = currentAngle - (index * step)
    sinTotal += Math.sin(rotationCandidate)
    cosTotal += Math.cos(rotationCandidate)
  })
  if (Math.hypot(sinTotal, cosTotal) < 0.001) return -Math.PI / 2
  return Math.atan2(sinTotal, cosTotal)
}

function readRadialComponentBounds(
  positions: Map<string, { x: number; y: number }>,
  nodeExtent: number
): RadialLayoutBounds {
  const points = [...positions.values()]
  if (!points.length) return { minX: 0, minY: 0, maxX: 0, maxY: 0 }
  return points.reduce<RadialLayoutBounds>((bounds, point) => ({
    minX: Math.min(bounds.minX, point.x - nodeExtent),
    minY: Math.min(bounds.minY, point.y - nodeExtent),
    maxX: Math.max(bounds.maxX, point.x + nodeExtent),
    maxY: Math.max(bounds.maxY, point.y + nodeExtent)
  }), {
    minX: Number.POSITIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY
  })
}

function packRadialLayoutComponents(
  components: RadialLayoutComponent[],
  movableNodes: RadialLayoutNode[],
  clusterGap: number
) {
  if (!components.length) return
  const columnCount = Math.max(1, Math.ceil(Math.sqrt(components.length)))
  let cursorX = 0
  let cursorY = 0
  let rowHeight = 0
  components.forEach((component, index) => {
    if (index > 0 && index % columnCount === 0) {
      cursorX = 0
      cursorY += rowHeight + clusterGap
      rowHeight = 0
    }
    const width = component.bounds.maxX - component.bounds.minX
    const height = component.bounds.maxY - component.bounds.minY
    translateRadialComponent(component, cursorX - component.bounds.minX, cursorY - component.bounds.minY)
    cursorX += width + clusterGap
    rowHeight = Math.max(rowHeight, height)
  })

  const packedBounds = components.reduce<RadialLayoutBounds>((bounds, component) => ({
    minX: Math.min(bounds.minX, component.bounds.minX),
    minY: Math.min(bounds.minY, component.bounds.minY),
    maxX: Math.max(bounds.maxX, component.bounds.maxX),
    maxY: Math.max(bounds.maxY, component.bounds.maxY)
  }), {
    minX: Number.POSITIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY
  })
  const currentBounds = movableNodes.reduce<RadialLayoutBounds>((bounds, node) => ({
    minX: Math.min(bounds.minX, node.x),
    minY: Math.min(bounds.minY, node.y),
    maxX: Math.max(bounds.maxX, node.x),
    maxY: Math.max(bounds.maxY, node.y)
  }), {
    minX: Number.POSITIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY
  })
  const translateX = ((currentBounds.minX + currentBounds.maxX) - (packedBounds.minX + packedBounds.maxX)) / 2
  const translateY = ((currentBounds.minY + currentBounds.maxY) - (packedBounds.minY + packedBounds.maxY)) / 2
  components.forEach((component) => translateRadialComponent(component, translateX, translateY))
}

function separateRadialComponentsFromFixedNodes(
  components: RadialLayoutComponent[],
  fixedNodes: RadialLayoutNode[],
  nodeRadius: (size: number) => number,
  minimumGap: number
) {
  if (!fixedNodes.length) return
  for (let iteration = 0; iteration < 24; iteration += 1) {
    let collisionCount = 0
    components.forEach((component) => {
      fixedNodes.forEach((fixedNode) => {
        const clearance = nodeRadius(fixedNode.size) + minimumGap
        const fixedBounds = {
          minX: fixedNode.x - clearance,
          minY: fixedNode.y - clearance,
          maxX: fixedNode.x + clearance,
          maxY: fixedNode.y + clearance
        }
        if (!radialBoundsOverlap(component.bounds, fixedBounds)) return
        const candidates = [
          { x: fixedBounds.minX - component.bounds.maxX, y: 0 },
          { x: fixedBounds.maxX - component.bounds.minX, y: 0 },
          { x: 0, y: fixedBounds.minY - component.bounds.maxY },
          { x: 0, y: fixedBounds.maxY - component.bounds.minY }
        ].sort((left, right) => Math.hypot(left.x, left.y) - Math.hypot(right.x, right.y))
        translateRadialComponent(component, candidates[0].x, candidates[0].y)
        collisionCount += 1
      })
    })
    if (!collisionCount) break
  }
}

function radialBoundsOverlap(left: RadialLayoutBounds, right: RadialLayoutBounds) {
  return left.minX < right.maxX
    && left.maxX > right.minX
    && left.minY < right.maxY
    && left.maxY > right.minY
}

function translateRadialComponent(
  component: RadialLayoutComponent,
  deltaX: number,
  deltaY: number
) {
  if (Math.abs(deltaX) < 0.0001 && Math.abs(deltaY) < 0.0001) return
  component.positions.forEach((position) => {
    position.x += deltaX
    position.y += deltaY
  })
  component.bounds = {
    minX: component.bounds.minX + deltaX,
    minY: component.bounds.minY + deltaY,
    maxX: component.bounds.maxX + deltaX,
    maxY: component.bounds.maxY + deltaY
  }
}

export function useCharacterBrainPhysics(options: UseCharacterBrainPhysicsOptions) {
  const sceneNodes = ref<CharacterBrainSimNode[]>([])
  let alpha = 0
  let lastActiveNodeId = ''
  let animationFrame = 0

  function replaceSceneNodes(nodes: CharacterBrainNodeModel[]) {
    stopPhysics()
    alpha = 0
    lastActiveNodeId = ''
    sceneNodes.value = nodes.map((node) => {
      return {
        ...node,
        x: node.x,
        y: node.y,
        vx: 0,
        vy: 0,
        fx: null,
        fy: null,
        layoutX: node.x,
        layoutY: node.y
      }
    })
  }

  function requestPhysicsTick() {
    if (!sceneNodes.value.length || animationFrame) return
    animationFrame = requestAnimationFrame(() => {
      animationFrame = 0
      const shouldContinue = stepPhysics()
      if (shouldContinue) requestPhysicsTick()
    })
  }

  function stopPhysics() {
    if (animationFrame) cancelAnimationFrame(animationFrame)
    animationFrame = 0
  }

  function stepPhysics(iterations = 1) {
    const nodes = sceneNodes.value
    if (!nodes.length) return false

    const safeIterations = Math.max(1, Math.floor(iterations))
    let hasMotion = false

    for (let iteration = 0; iteration < safeIterations; iteration += 1) {
      const activeDrag = readActiveDrag()
      const physicsContext: CharacterBrainNodePhysicsContext = {
        // 普通左键拖动期间，当前已渲染节点进入同一套受力系统。
        treatAllVisibleNodesAsNetwork: activeDrag?.behavior === 'network'
      }
      const alphaTarget = activeDrag ? DRAG_ALPHA_TARGET : 0
      alpha += (alphaTarget - alpha) * ALPHA_DECAY

      const influenceMap = activeDrag ? buildDragInfluenceMap(nodes, activeDrag.nodeId) : new Map<string, number>()
      const nodeMap = new Map(nodes.map((node) => [node.id, node]))
      const draggedNode = activeDrag ? (nodeMap.get(activeDrag.nodeId) || null) : null
      const rigidFollowerIds = new Set(activeDrag?.rigidFollowerIds || [])

      if (activeDrag?.behavior === 'network-pan') {
        applyNetworkPanForces(nodes, activeDrag)
        for (const node of nodes) {
          if (!isRenderedPhysicsNode(node)) continue
          node.vx *= NETWORK_PAN_DAMPING
          node.vy *= NETWORK_PAN_DAMPING
          node.x += node.vx
          node.y += node.vy
          if (Math.hypot(node.vx, node.vy) > IDLE_SPEED) hasMotion = true
        }
        hasMotion = true
        continue
      }

      if (activeDrag && draggedNode) {
        pinDraggedNode(draggedNode, activeDrag)
        applyFixedPosition(draggedNode)
        lastActiveNodeId = activeDrag.nodeId
      } else {
        clearDraggedNodePin(nodeMap)
      }

      nodes.forEach((node) => {
        if (activeDrag && rigidFollowerIds.has(node.id)) {
          const start = activeDrag.dragStartPositions?.[node.id]
          if (start) {
            node.fx = start.x + (activeDrag.dragTargetX - activeDrag.originX)
            node.fy = start.y + (activeDrag.dragTargetY - activeDrag.originY)
            applyFixedPosition(node)
            return
          }
        }
        if (shouldAnchorNode(node, activeDrag?.nodeId, physicsContext)) {
          node.fx = node.x
          node.fy = node.y
          return
        }
        if (node.id !== lastActiveNodeId) {
          node.fx = null
          node.fy = null
        }
      })

      for (const node of nodes) {
        if (!node.parentId) continue
        const parent = nodeMap.get(String(node.parentId))
        if (!parent) continue
        if (!isNetworkPhysicsNode(parent, physicsContext) || !isNetworkPhysicsNode(node, physicsContext)) continue
        applyLinkForce(parent, node, influenceMap)
      }

      for (let i = 0; i < nodes.length; i += 1) {
        for (let j = i + 1; j < nodes.length; j += 1) {
          if (!isNetworkPhysicsNode(nodes[i], physicsContext) || !isNetworkPhysicsNode(nodes[j], physicsContext)) continue
          applyChargeForce(nodes[i], nodes[j])
        }
      }

      for (const node of nodes) {
        if (!isNetworkPhysicsNode(node, physicsContext)) {
          node.vx = 0
          node.vy = 0
          continue
        }
        node.vx *= 1 - VELOCITY_DECAY
        node.vy *= 1 - VELOCITY_DECAY
        node.x += node.vx
        node.y += node.vy
        applyFixedPosition(node)
        if (Math.hypot(node.vx, node.vy) > IDLE_SPEED) hasMotion = true
      }

      if (activeDrag || alpha > ALPHA_MIN) hasMotion = true
    }

    sceneNodes.value = [...nodes]
    return hasMotion
  }

  function pinDraggedNode(node: CharacterBrainSimNode, drag: CharacterBrainNodeDragState) {
    const start = drag.dragStartPositions?.[node.id]
    if (start) {
      node.fx = start.x + (drag.dragTargetX - drag.originX)
      node.fy = start.y + (drag.dragTargetY - drag.originY)
      return
    }
    const boost = resolveDragBoost(node)
    node.fx = node.x + ((drag.dragTargetX - node.x) * DRAG_STRENGTH * boost)
    node.fy = node.y + ((drag.dragTargetY - node.y) * DRAG_STRENGTH * boost)
  }

  function clearDraggedNodePin(nodeMap: Map<string, CharacterBrainSimNode>) {
    if (!lastActiveNodeId) return
    const node = nodeMap.get(lastActiveNodeId)
    if (node) {
      node.fx = null
      node.fy = null
    }
    lastActiveNodeId = ''
  }

  function applyFixedPosition(node: CharacterBrainSimNode) {
    if (node.fx !== null) {
      node.x = node.fx
      node.vx = 0
    }
    if (node.fy !== null) {
      node.y = node.fy
      node.vy = 0
    }
  }

  function applyLinkForce(
    source: CharacterBrainSimNode,
    target: CharacterBrainSimNode,
    influenceMap: Map<string, number>
  ) {
    const dx = target.x - source.x
    const dy = target.y - source.y
    const distance = Math.sqrt((dx * dx) + (dy * dy)) || 1
    const desired = Math.max(120, distanceFromLayout(source, target))
    const stretch = distance - desired
    const dragInfluence = Math.max(influenceMap.get(source.id) || 0, influenceMap.get(target.id) || 0)
    const boost = resolveDragBoost(readActiveDragNode())
    const strength = (LINK_STRENGTH + (dragInfluence * LINK_DRAG_STRENGTH)) * boost * alpha
    const fx = (dx / distance) * stretch * strength
    const fy = (dy / distance) * stretch * strength

    source.vx += fx
    source.vy += fy
    target.vx -= fx
    target.vy -= fy
  }

  function applyChargeForce(a: CharacterBrainSimNode, b: CharacterBrainSimNode) {
    const dx = b.x - a.x
    const dy = b.y - a.y
    const distanceSq = Math.max((dx * dx) + (dy * dy), 36)
    const distance = Math.sqrt(distanceSq)
    const minDistance = options.nodeRadius(a.size) + options.nodeRadius(b.size) + 42
    if (distance >= minDistance) return

    const force = ((minDistance - distance) / distanceSq) * REPULSION_STRENGTH * alpha
    const fx = (dx / distance) * force
    const fy = (dy / distance) * force

    a.vx -= fx
    a.vy -= fy
    b.vx += fx
    b.vy += fy
  }

  function distanceFromLayout(source: CharacterBrainSimNode, target: CharacterBrainSimNode) {
    const dx = target.layoutX - source.layoutX
    const dy = target.layoutY - source.layoutY
    return Math.sqrt((dx * dx) + (dy * dy)) || 180
  }

  function isNetworkPhysicsNode(node: CharacterBrainSimNode, context?: CharacterBrainNodePhysicsContext) {
    if (options.renderedNodeIdSet && !options.renderedNodeIdSet.value.has(node.id)) return false
    if (context?.treatAllVisibleNodesAsNetwork) return true
    if (isTrajectoryPhysicsNode(node.id)) return true
    return node.layoutMode !== 'folder'
  }

  function applyNetworkPanForces(nodes: CharacterBrainSimNode[], drag: CharacterBrainNodeDragState) {
    const offsetX = drag.dragTargetX - drag.originX
    const offsetY = drag.dragTargetY - drag.originY
    nodes.forEach((node) => {
      if (!isRenderedPhysicsNode(node)) return
      const targetX = node.layoutX + offsetX
      const targetY = node.layoutY + offsetY
      node.vx += (targetX - node.x) * NETWORK_PAN_SPRING
      node.vy += (targetY - node.y) * NETWORK_PAN_SPRING
      node.fx = null
      node.fy = null
    })
  }

  function shouldAnchorNode(
    node: CharacterBrainSimNode,
    activeNodeId?: string,
    context?: CharacterBrainNodePhysicsContext
  ) {
    if (context?.treatAllVisibleNodesAsNetwork) return false
    if (!options.anchoredNodeIdSet?.value?.has(node.id)) return false
    return node.id !== String(activeNodeId || '').trim()
  }

  function isRenderedPhysicsNode(node: CharacterBrainSimNode) {
    return !options.renderedNodeIdSet || options.renderedNodeIdSet.value.has(node.id)
  }

  function readActiveDrag() {
    const state = options.interactionState.value
    return state?.mode === 'node' && ['network', 'network-pan'].includes((state as CharacterBrainNodeDragState).behavior)
      ? state as CharacterBrainNodeDragState
      : null
  }

  function readActiveDragNode() {
    const activeDrag = readActiveDrag()
    if (!activeDrag) return null
    return sceneNodes.value.find((node) => node.id === activeDrag.nodeId) || null
  }

  function resolveDragBoost(node?: CharacterBrainSimNode | null) {
    if (!node) return 1
    if (node.kind === 'field') return 1.38
    if (node.kind === 'group') return 1.22
    return 1
  }

  return {
    sceneNodes,
    replaceSceneNodes,
    requestPhysicsTick,
    stepPhysics,
    stopPhysics
  }
}

function isTrajectoryPhysicsNode(nodeId: string) {
  const normalizedId = String(nodeId || '').trim()
  return normalizedId === TRACE_ROOT_NODE_ID
    || normalizedId.startsWith(TRACE_NODE_ID_PREFIX)
}

export function buildDragInfluenceMap(nodes: CharacterBrainSimNode[], activeNodeId: string) {
  const activeId = String(activeNodeId || '').trim()
  const influenceMap = new Map<string, number>()
  if (!activeId) return influenceMap

  const adjacency = new Map<string, string[]>()
  nodes.forEach((node) => {
    if (!adjacency.has(node.id)) adjacency.set(node.id, [])
    if (!node.parentId) return
    const parentId = String(node.parentId)
    if (!adjacency.has(parentId)) adjacency.set(parentId, [])
    adjacency.get(node.id)!.push(parentId)
    adjacency.get(parentId)!.push(node.id)
  })

  const queue: Array<{ id: string; distance: number }> = [{ id: activeId, distance: 0 }]
  const visited = new Set<string>()

  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const current = queue[cursor]
    if (visited.has(current.id)) continue
    visited.add(current.id)

    const influence = current.distance === 0
      ? 1
      : Math.pow(0.42, current.distance)
    if (influence >= 0.02) influenceMap.set(current.id, influence)

    const neighbors = adjacency.get(current.id) || []
    neighbors.forEach((neighborId) => {
      if (!visited.has(neighborId)) {
        queue.push({ id: neighborId, distance: current.distance + 1 })
      }
    })
  }

  return influenceMap
}
