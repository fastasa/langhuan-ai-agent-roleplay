<template>
  <div
    class="brain-import-graph-preview"
    @selectstart.prevent
    @dragstart.prevent
  >
    <svg
      ref="svgRef"
      class="brain-import-graph-preview__canvas"
      viewBox="0 0 720 520"
      preserveAspectRatio="xMidYMid meet"
      role="img"
      :aria-label="$t('brain.graphPreview.ariaLabel')"
      @wheel.prevent="handleWheel"
      @pointerdown="startCanvasPan"
      @pointermove="handlePointerMove"
      @pointerup="endInteraction"
      @pointercancel="endInteraction"
      @pointerleave="endInteraction"
      @dblclick="resetViewport"
    >
      <g :transform="viewportTransform">
        <g class="brain-import-graph-preview__edges">
          <line
            v-for="edge in edges"
            :key="edge.id"
            :x1="edge.source.x"
            :y1="edge.source.y"
            :x2="edge.target.x"
            :y2="edge.target.y"
            :class="{ 'brain-import-graph-preview__edge--muted': hoveredNodeId && !edge.active }"
          />
        </g>

        <g
          v-for="node in sceneNodes"
          :key="node.id"
          class="brain-import-graph-preview__node"
          :class="[
            `brain-import-graph-preview__node--${node.kind}`,
            {
              'brain-import-graph-preview__node--dragging': isDraggingNode(node.id),
              'brain-import-graph-preview__node--focus': hoveredNodeId === node.id,
              'brain-import-graph-preview__node--muted': hoveredNodeId && hoveredNodeId !== node.id && !relatedNodeIds.has(node.id)
            }
          ]"
          :transform="`translate(${node.x}, ${node.y})`"
          @pointerenter="setHoveredNode(node.id)"
          @pointerleave="clearHoveredNode(node.id)"
          @pointerdown.stop="startNodeDrag(node.id, $event)"
        >
          <circle class="brain-import-graph-preview__hit-area" :r="nodeHitRadius(node.size)" />
          <circle class="brain-import-graph-preview__dot" :r="nodeRadius(node.size)" />
          <text class="brain-import-graph-preview__label" y="-20" text-anchor="middle">
            {{ node.title }}
          </text>
          <text
            v-if="node.kind !== 'root'"
            class="brain-import-graph-preview__kind"
            y="26"
            text-anchor="middle"
          >
            {{ kindLabel(node.kind) }}
          </text>
        </g>
      </g>
    </svg>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, type Ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useCharacterBrainPhysics } from '../../composables/useCharacterBrainPhysics'
import type {
  CharacterBrainImportDraftNode,
  CharacterBrainNodeModel,
  CharacterBrainNodeSize
} from '../../types/characterBrain'

type PreviewTreeNode = {
  id: string
  title: string
  kind: CharacterBrainNodeModel['kind']
  size: CharacterBrainNodeSize
  density: 1 | 2 | 3 | 4 | 5
  parentId?: string
  children: PreviewTreeNode[]
  leafIndex?: number
  depth?: number
}

type PreviewInteractionState =
  | null
  | {
      mode: 'pan'
      pointerId: number
      moved: boolean
      originX: number
      originY: number
      startOffsetX: number
      startOffsetY: number
    }
  | {
      mode: 'node'
      behavior: 'network'
      pointerId: number
      nodeId: string
      moved: boolean
      originX: number
      originY: number
      dragTargetX: number
      dragTargetY: number
      lastDeltaX: number
      lastDeltaY: number
    }

const props = withDefaults(defineProps<{
  parentTitle: string
  nodes: CharacterBrainImportDraftNode[]
}>(), {
  parentTitle: ''
})

const { t } = useI18n()

const VIEWBOX_WIDTH = 720
const VIEWBOX_HEIGHT = 520
const MIN_VIEWPORT_SCALE = 0.72
const MAX_VIEWPORT_SCALE = 2.8

const svgRef = ref<SVGSVGElement | null>(null)
const viewportOffset = ref({ x: 0, y: 0 })
const viewportScale = ref(1)
const hoveredNodeId = ref('')
const interactionState = ref<PreviewInteractionState>(null)

const {
  sceneNodes,
  replaceSceneNodes,
  requestPhysicsTick,
  stepPhysics,
  stopPhysics
} = useCharacterBrainPhysics({
  viewBoxWidth: VIEWBOX_WIDTH,
  viewBoxHeight: VIEWBOX_HEIGHT,
  interactionState: interactionState as Ref<{ mode: string; nodeId?: string } | null>,
  nodeRadius
})

const viewportTransform = computed(() => (
  `translate(${viewportOffset.value.x} ${viewportOffset.value.y}) scale(${viewportScale.value})`
))

const relatedNodeIds = computed(() => {
  if (!hoveredNodeId.value) return new Set<string>()
  const adjacency = new Map<string, Set<string>>()
  sceneNodes.value.forEach((node) => {
    if (!adjacency.has(node.id)) adjacency.set(node.id, new Set())
    if (!node.parentId) return
    const parentId = String(node.parentId)
    if (!adjacency.has(parentId)) adjacency.set(parentId, new Set())
    adjacency.get(node.id)?.add(parentId)
    adjacency.get(parentId)?.add(node.id)
  })
  return adjacency.get(hoveredNodeId.value) || new Set<string>()
})

const edges = computed(() => {
  const nodeMap = new Map(sceneNodes.value.map((node) => [node.id, node] as const))
  return sceneNodes.value
    .filter((node) => node.parentId && nodeMap.has(String(node.parentId)))
    .map((node) => {
      const parent = nodeMap.get(String(node.parentId))!
      const active = !hoveredNodeId.value
        || hoveredNodeId.value === node.id
        || hoveredNodeId.value === parent.id
      return {
        id: `${parent.id}:${node.id}`,
        source: parent,
        target: node,
        active
      }
    })
})

watch(
  () => [props.parentTitle, props.nodes] as const,
  () => {
    hoveredNodeId.value = ''
    interactionState.value = null
    replaceSceneNodes(buildPreviewNodeModels(props.parentTitle, props.nodes))
    resetViewport()
    requestPhysicsTick()
  },
  { immediate: true, deep: true }
)

function buildPreviewNodeModels(parentTitle: string, nodes: CharacterBrainImportDraftNode[]) {
  const tree = buildPreviewTree(parentTitle, nodes)
  const maxDepth = assignLeafIndex(tree, 0, { value: 0 })
  const leafCount = Math.max(countLeaves(tree), 1)
  const models: CharacterBrainNodeModel[] = []

  const walk = (node: PreviewTreeNode, depth: number) => {
    const xRatio = leafCount === 1 ? 0.5 : (Number(node.leafIndex) / Math.max(leafCount - 1, 1))
    const x = 18 + (xRatio * 64)
    const y = resolveDepthY(depth, maxDepth)
    models.push({
      id: node.id,
      title: truncateLabel(node.title),
      kind: node.kind,
      summary: '',
      size: node.size,
      density: node.density,
      x,
      y,
      deletable: false,
      parentId: node.parentId,
      layoutMode: 'network'
    })
    node.children.forEach((child) => walk(child, depth + 1))
  }

  walk(tree, 0)
  return models
}

function buildPreviewTree(parentTitle: string, nodes: CharacterBrainImportDraftNode[]) {
  return {
    id: 'preview:parent',
    title: parentTitle || t('brain.domainLabel.soul'),
    kind: 'root',
    size: 3,
    density: 5,
    children: nodes.map((node) => convertDraftNode(node, 'preview:parent'))
  } satisfies PreviewTreeNode
}

function convertDraftNode(node: CharacterBrainImportDraftNode, parentId: string): PreviewTreeNode {
  const isGroup = node.kind === 'group'
  return {
    id: node.tempId,
    title: node.title || t('brain.graphPreview.unnamedNode'),
    kind: isGroup ? 'group' : 'field',
    size: isGroup ? 2 : 1,
    density: isGroup ? 4 : 3,
    parentId,
    children: node.children.map((child) => convertDraftNode(child, node.tempId))
  }
}

function assignLeafIndex(node: PreviewTreeNode, depth: number, cursor: { value: number }) {
  node.depth = depth
  if (!node.children.length) {
    node.leafIndex = cursor.value
    cursor.value += 1
    return depth
  }

  let maxDepth = depth
  let sum = 0
  node.children.forEach((child) => {
    maxDepth = Math.max(maxDepth, assignLeafIndex(child, depth + 1, cursor))
    sum += Number(child.leafIndex || 0)
  })
  node.leafIndex = sum / node.children.length
  return maxDepth
}

function countLeaves(node: PreviewTreeNode): number {
  if (!node.children.length) return 1
  return node.children.reduce((sum, child) => sum + countLeaves(child), 0)
}

function resolveDepthY(depth: number, maxDepth: number) {
  if (maxDepth <= 0) return 58
  const start = 76
  const end = 16
  const ratio = depth / maxDepth
  return start - ((start - end) * ratio)
}

function resetViewport() {
  viewportOffset.value = { x: 0, y: 0 }
  viewportScale.value = 1
}

function startCanvasPan(event: PointerEvent) {
  if (event.button !== 0) return
  if (!(event.target instanceof SVGSVGElement)) return
  event.preventDefault()
  const point = readViewportPointerPosition(event)
  if (!point) return
  interactionState.value = {
    mode: 'pan',
    pointerId: event.pointerId,
    moved: false,
    originX: point.x,
    originY: point.y,
    startOffsetX: viewportOffset.value.x,
    startOffsetY: viewportOffset.value.y
  }
  svgRef.value?.setPointerCapture?.(event.pointerId)
}

function startNodeDrag(nodeId: string, event: PointerEvent) {
  if (event.button !== 0) return
  event.preventDefault()
  const point = readScenePointerPosition(event)
  if (!point) return
  interactionState.value = {
    mode: 'node',
    behavior: 'network',
    pointerId: event.pointerId,
    nodeId,
    moved: false,
    originX: point.x,
    originY: point.y,
    dragTargetX: point.x,
    dragTargetY: point.y,
    lastDeltaX: 0,
    lastDeltaY: 0
  }
  svgRef.value?.setPointerCapture?.(event.pointerId)
}

function handlePointerMove(event: PointerEvent) {
  const state = interactionState.value
  if (!state || state.pointerId !== event.pointerId) return
  const point = state.mode === 'pan'
    ? readViewportPointerPosition(event)
    : readScenePointerPosition(event)
  if (!point) return

  const movedDistance = Math.abs(point.x - state.originX) + Math.abs(point.y - state.originY)
  if (!state.moved && movedDistance > 3) {
    interactionState.value = { ...state, moved: true }
  }

  if (state.mode === 'pan') {
    viewportOffset.value = {
      x: state.startOffsetX + (point.x - state.originX),
      y: state.startOffsetY + (point.y - state.originY)
    }
    return
  }

  interactionState.value = {
    ...state,
    dragTargetX: point.x,
    dragTargetY: point.y,
    lastDeltaX: point.x - state.dragTargetX,
    lastDeltaY: point.y - state.dragTargetY
  }
  if (stepPhysics(2)) requestPhysicsTick()
}

function endInteraction(event: PointerEvent) {
  const state = interactionState.value
  if (!state || state.pointerId !== event.pointerId) return
  const shouldSettle = state.mode === 'node' && state.moved
  svgRef.value?.releasePointerCapture?.(event.pointerId)
  interactionState.value = null
  if (shouldSettle) {
    stepPhysics(2)
    requestPhysicsTick()
  }
}

function handleWheel(event: WheelEvent) {
  const point = readViewportPointerPosition(event)
  if (!point) return
  const currentScale = viewportScale.value
  const zoomFactor = event.deltaY < 0 ? 1.12 : 1 / 1.12
  const nextScale = clamp(currentScale * zoomFactor, MIN_VIEWPORT_SCALE, MAX_VIEWPORT_SCALE)
  if (Math.abs(nextScale - currentScale) < 0.001) return
  const sceneX = (point.x - viewportOffset.value.x) / currentScale
  const sceneY = (point.y - viewportOffset.value.y) / currentScale
  viewportScale.value = nextScale
  viewportOffset.value = {
    x: point.x - (sceneX * nextScale),
    y: point.y - (sceneY * nextScale)
  }
}

function readViewportPointerPosition(event: PointerEvent | WheelEvent) {
  const svg = svgRef.value
  if (!svg) return null
  const point = svg.createSVGPoint()
  point.x = event.clientX
  point.y = event.clientY
  const transform = svg.getScreenCTM()
  if (!transform) return null
  const result = point.matrixTransform(transform.inverse())
  return { x: result.x, y: result.y }
}

function readScenePointerPosition(event: PointerEvent | WheelEvent) {
  const point = readViewportPointerPosition(event)
  if (!point) return null
  return {
    x: (point.x - viewportOffset.value.x) / viewportScale.value,
    y: (point.y - viewportOffset.value.y) / viewportScale.value
  }
}

function setHoveredNode(nodeId: string) {
  hoveredNodeId.value = nodeId
}

function clearHoveredNode(nodeId: string) {
  if (hoveredNodeId.value === nodeId) hoveredNodeId.value = ''
}

function isDraggingNode(nodeId: string) {
  return interactionState.value?.mode === 'node' && interactionState.value.nodeId === nodeId
}

function nodeRadius(size: number) {
  if (size >= 3) return 18
  if (size === 2) return 13
  return 8
}

function nodeHitRadius(size: number) {
  return nodeRadius(size) + 10
}

function kindLabel(kind: CharacterBrainNodeModel['kind']) {
  if (kind === 'group') return t('brain.nodeForm.kindGroup')
  if (kind === 'field') return t('brain.nodeForm.kindReference')
  return t('brain.graphPreview.kindParent')
}

function truncateLabel(value: string) {
  const text = String(value || '').trim() || t('common.unnamed')
  return text.length > 12 ? `${text.slice(0, 11)}…` : text
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

watch(
  () => props.nodes,
  () => stopPhysics()
)
</script>

<style scoped>
.brain-import-graph-preview {
  width: 100%;
  height: 100%;
  background: #f6efdf;
  overflow: hidden;
  user-select: none;
  -webkit-user-select: none;
}

.brain-import-graph-preview__canvas {
  display: block;
  width: 100%;
  height: 100%;
  cursor: grab;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
}

.brain-import-graph-preview__canvas:active {
  cursor: grabbing;
}

.brain-import-graph-preview__edges line {
  stroke: rgba(116, 108, 88, 0.26);
  stroke-width: 1;
  stroke-linecap: round;
  transition: opacity 140ms ease;
}

.brain-import-graph-preview__edge--muted {
  opacity: 0.2;
}

.brain-import-graph-preview__node {
  transition: opacity 140ms ease, transform 140ms ease;
  cursor: grab;
}

.brain-import-graph-preview__node--muted {
  opacity: 0.22;
}

.brain-import-graph-preview__node--dragging .brain-import-graph-preview__dot,
.brain-import-graph-preview__node--focus .brain-import-graph-preview__dot {
  filter: drop-shadow(0 4px 10px rgba(76, 78, 46, 0.24));
}

.brain-import-graph-preview__hit-area {
  fill: transparent;
}

.brain-import-graph-preview__dot {
  transition: transform 140ms ease, filter 140ms ease, opacity 140ms ease;
}

.brain-import-graph-preview__node--root .brain-import-graph-preview__dot {
  fill: rgba(95, 106, 51, 0.98);
}

.brain-import-graph-preview__node--group .brain-import-graph-preview__dot {
  fill: rgba(125, 121, 93, 0.95);
}

.brain-import-graph-preview__node--field .brain-import-graph-preview__dot {
  fill: rgba(159, 147, 116, 0.9);
}

.brain-import-graph-preview__label,
.brain-import-graph-preview__kind {
  pointer-events: none;
  user-select: none;
  -webkit-user-select: none;
}

.brain-import-graph-preview__label {
  fill: #4f4638;
  font-size: 12px;
  font-weight: 500;
  dominant-baseline: middle;
  paint-order: stroke;
  stroke: rgba(246, 239, 223, 0.98);
  stroke-width: 2.5px;
  stroke-linejoin: round;
}

.brain-import-graph-preview__kind {
  fill: rgba(93, 82, 64, 0.72);
  font-size: 10px;
}
</style>
