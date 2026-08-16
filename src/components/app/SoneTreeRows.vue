<template>
  <div
    ref="treeRootRef"
    class="sidebar-tree-rows sone-tree"
    :class="attrs.class"
    :style="rootStyle"
    @contextmenu="handleSelectionAreaContextMenu"
  >
    <div
      v-if="selectionBlockSegments.length"
      class="sidebar-tree-rows__selection-blocks"
      aria-hidden="true"
    >
      <span
        v-for="segment in selectionBlockSegments"
        :key="segment.key"
        class="sidebar-tree-rows__selection-block"
        :style="{ top: `${segment.y}px`, height: `${segment.height}px` }"
      ></span>
    </div>
    <svg
      v-if="groupLinkSegments.length"
      class="sidebar-tree-rows__group-links"
      aria-hidden="true"
    >
      <line
        v-for="segment in groupLinkSegments"
        :key="segment.key"
        class="sidebar-tree-rows__group-link"
        :x1="segment.x"
        :x2="segment.x"
        :y1="segment.y1"
        :y2="segment.y2"
        :style="{ '--link-delay': `${segment.delay}ms` }"
      />
    </svg>
    <div
      v-for="row in rows"
      :key="row.id"
      :ref="(element) => setRowRef(row.id, element)"
      role="button"
      tabindex="0"
      class="doc-sidebar-row sidebar-tree-rows__row"
      :class="{
        active: row.active,
        selected: row.selected,
        'selected-prev': row.selectedPrev,
        'selected-next': row.selectedNext,
        folder: row.kind === 'folder',
        document: row.kind === 'document',
        'folder-open': row.kind === 'folder' && row.open,
        'folder-collapsed': row.kind === 'folder' && !row.open,
        'sidebar-interaction-cut-pending': row.cutPending,
        'leaf-docs__tree-row': row.dragKind === 'folder' || row.dragKind === 'document',
        'sidebar-interaction-row': row.dragKind === 'folder' || row.dragKind === 'document',
        'sidebar-interaction-header': row.dragKind === 'cluster',
        'sidebar-interaction-dragging': row.dragging,
        'sidebar-interaction-drop-target': row.dropTarget,
        'sidebar-interaction-preview-shift': row.previewShift
      }"
      :data-multi-select-id="row.multiSelectId || row.id"
      :data-doc-drag-id="row.dragKind === 'folder' || row.dragKind === 'document' ? row.dragId || row.id : null"
      :data-doc-drag-kind="row.dragKind === 'folder' || row.dragKind === 'document' ? row.dragKind : null"
      :data-doc-pointer-kind="row.dragKind === 'cluster' ? 'worldbook-cluster' : null"
      :data-doc-pointer-id="row.dragKind === 'cluster' ? row.clusterId || row.dragId || row.id : null"
      :data-worldbook-cluster-header="row.dragKind === 'cluster' ? 'true' : null"
      :data-worldbook-cluster-id="row.dragKind === 'cluster' ? row.clusterId || row.dragId || row.id : null"
      :data-depth="row.depth || 0"
      :style="getRowStyle(row)"
      @click="$emit('select', row.id, $event)"
      @contextmenu.prevent.stop="handleRowContextMenu(row, $event)"
      @pointerdown="$emit('row-pointerdown', row.id, $event)"
      @pointermove="$emit('row-pointermove', row.id, $event)"
      @pointerup="$emit('row-pointerend', row.id, $event)"
      @pointercancel="$emit('row-pointerend', row.id, $event)"
      @keydown.enter.prevent="$emit('select', row.id, $event)"
      @keydown.space.prevent="$emit('select', row.id, $event)"
    >
      <span class="doc-sidebar-row-indent"></span>
      <button
        v-if="row.kind === 'folder'"
        type="button"
        class="doc-sidebar-row-toggle"
        :class="{ open: row.open }"
        :title="row.open ? '折叠' : '展开'"
        :aria-label="row.open ? '折叠' : '展开'"
        @mousedown.stop
        @pointerdown.stop
        @click.stop="$emit('toggle', row.id)"
      >
        <svg
          class="sone-tree-toggle-icon"
          viewBox="0 0 12 12"
          fill="none"
          aria-hidden="true"
        >
          <polyline
            points="3 3 9 6 3 9"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </button>
      <span v-else class="doc-sidebar-row-toggle hidden sone-tree-node-dot" aria-hidden="true"></span>
      <span class="doc-sidebar-row-marker sidebar-selection-indicator" :class="{ active: row.active || row.selected }"></span>
      <span v-if="row.icon" class="doc-sidebar-row-icon" :data-row-icon="row.icon" aria-hidden="true">
        <svg
          v-if="row.icon === 'core'"
          class="doc-sidebar-row-icon__svg"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M12 4.8L18.2 15.5H5.8L12 4.8Z"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linejoin="round"
            stroke-linecap="round"
          />
          <path
            d="M12 19.2L5.8 8.5H18.2L12 19.2Z"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linejoin="round"
            stroke-linecap="round"
          />
        </svg>
        <svg
          v-else-if="row.icon === 'trace'"
          class="doc-sidebar-row-icon__svg"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M5 17.8C7.2 15.4 8.8 14.2 10.8 14.2C12.5 14.2 13.1 15.8 14.7 15.8C16.8 15.8 17.5 12.3 19 9"
            stroke="currentColor"
            stroke-width="1.7"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
          <circle cx="5" cy="17.8" r="1.6" fill="currentColor" />
          <circle cx="19" cy="9" r="1.6" fill="currentColor" />
        </svg>
        <svg
          v-else-if="row.icon === 'soul'"
          class="doc-sidebar-row-icon__svg"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <circle cx="12" cy="12" r="6.7" stroke="currentColor" stroke-width="1.5" />
          <path
            d="M12 8.2L13.2 10.8L15.8 12L13.2 13.2L12 15.8L10.8 13.2L8.2 12L10.8 10.8L12 8.2Z"
            stroke="currentColor"
            stroke-width="1.4"
            stroke-linejoin="round"
          />
          <path d="M12 5.2V6.4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" />
          <path d="M12 17.6V18.8" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" />
          <path d="M5.2 12H6.4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" />
          <path d="M17.6 12H18.8" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" />
        </svg>
      </span>
      <span
        v-else-if="row.depth === 0"
        class="doc-sidebar-row-icon doc-sidebar-row-icon--placeholder"
        aria-hidden="true"
      ></span>
      <span class="doc-sidebar-row-label">{{ row.label }}</span>
      <span v-if="row.subtitle" class="sone-tree-row-subtitle">{{ row.subtitle }}</span>
      <span
        v-if="row.pendingIndicator"
        class="sone-tree-pending-indicator"
        :title="row.pendingIndicator.title || '待确认自动写入'"
        aria-hidden="true"
      ></span>
      <span
        v-if="row.compilePageIndicator?.missing || row.compilePageIndicator?.error"
        class="sone-tree-compile-indicators"
        :title="row.compilePageIndicator.title"
        aria-hidden="true"
      >
        <span v-if="row.compilePageIndicator.missing" class="sone-tree-compile-indicator sone-tree-compile-indicator--missing"></span>
        <span v-if="row.compilePageIndicator.error" class="sone-tree-compile-indicator sone-tree-compile-indicator--error"></span>
      </span>
      <span v-if="row.hasMenu" class="sidebar-row-actions doc-sidebar-row-actions">
        <button
          type="button"
          class="sidebar-row-action"
          aria-label="更多操作"
          title="更多操作"
          @mousedown.stop
          @pointerdown.stop
          @click.stop="$emit('menu', row.id, $event)"
        >
          <svg class="line-icon" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="5" r="1.5"/>
            <circle cx="12" cy="12" r="1.5"/>
            <circle cx="12" cy="19" r="1.5"/>
          </svg>
        </button>
      </span>
      <SidebarFloatingMenu
        v-if="row.hasMenu && row.menuOpen"
        :open="Boolean(row.menuOpen)"
        menu-class="sidebar-tree-rows__row-menu"
        :menu-style="resolvedMenuStyle"
        clamp-to-viewport
        viewport-overflow="visible"
      >
        <SoneTreeMenuItems
          :items="row.menuItems || []"
          :row-id="row.id"
          @action="$emit('menu-action', $event, row.id)"
        />
      </SidebarFloatingMenu>
    </div>
  </div>
  <Teleport to="body">
    <div
      ref="stickyStackRef"
      class="sidebar-tree-rows__sticky-stack sone-tree-sticky-stack"
      aria-hidden="true"
    >
      <div
        v-for="(item, index) in stickyRows"
        :key="item.row.id"
        class="doc-sidebar-row sidebar-tree-rows__sticky-row"
        :class="{
          folder: item.row.kind === 'folder',
          'folder-open': item.row.kind === 'folder' && item.row.open,
          'folder-collapsed': item.row.kind === 'folder' && !item.row.open,
          'sidebar-tree-rows__sticky-row--tail': index === stickyRows.length - 1
        }"
        :data-depth="item.row.depth || 0"
        :style="getStickyRowStyle(item)"
        @click.stop="scrollStickyRowToSource(item.row.id)"
        @contextmenu.prevent.stop="$emit('menu', item.row.id, $event)"
      >
        <span
          class="doc-sidebar-row-toggle"
          :class="{ open: item.row.open }"
          aria-hidden="true"
        >
          <svg
            class="sone-tree-toggle-icon"
            viewBox="0 0 12 12"
            fill="none"
            aria-hidden="true"
          >
            <polyline
              points="3 3 9 6 3 9"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </span>
        <span v-if="item.row.icon" class="doc-sidebar-row-icon" :data-row-icon="item.row.icon" aria-hidden="true">
          <svg
            v-if="item.row.icon === 'core'"
            class="doc-sidebar-row-icon__svg"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M12 4.8L18.2 15.5H5.8L12 4.8Z"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linejoin="round"
              stroke-linecap="round"
            />
            <path
              d="M12 19.2L5.8 8.5H18.2L12 19.2Z"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linejoin="round"
              stroke-linecap="round"
            />
          </svg>
          <svg
            v-else-if="item.row.icon === 'trace'"
            class="doc-sidebar-row-icon__svg"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M5 17.8C7.2 15.4 8.8 14.2 10.8 14.2C12.5 14.2 13.1 15.8 14.7 15.8C16.8 15.8 17.5 12.3 19 9"
              stroke="currentColor"
              stroke-width="1.7"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
            <circle cx="5" cy="17.8" r="1.6" fill="currentColor" />
            <circle cx="19" cy="9" r="1.6" fill="currentColor" />
          </svg>
          <svg
            v-else-if="item.row.icon === 'soul'"
            class="doc-sidebar-row-icon__svg"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <circle cx="12" cy="12" r="6.7" stroke="currentColor" stroke-width="1.5" />
            <path
              d="M12 8.2L13.2 10.8L15.8 12L13.2 13.2L12 15.8L10.8 13.2L8.2 12L10.8 10.8L12 8.2Z"
              stroke="currentColor"
              stroke-width="1.4"
              stroke-linejoin="round"
            />
            <path d="M12 5.2V6.4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" />
            <path d="M12 17.6V18.8" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" />
            <path d="M5.2 12H6.4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" />
            <path d="M17.6 12H18.8" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" />
          </svg>
        </span>
        <span
          v-else-if="item.row.depth === 0"
          class="doc-sidebar-row-icon doc-sidebar-row-icon--placeholder"
          aria-hidden="true"
        ></span>
        <span class="doc-sidebar-row-label">{{ item.row.label }}</span>
        <span v-if="item.row.subtitle" class="sone-tree-row-subtitle">{{ item.row.subtitle }}</span>
        <span
          v-if="item.row.pendingIndicator"
          class="sone-tree-pending-indicator"
          :title="item.row.pendingIndicator.title || '待确认自动写入'"
          aria-hidden="true"
        ></span>
        <span
          v-if="item.row.compilePageIndicator?.missing || item.row.compilePageIndicator?.error"
          class="sone-tree-compile-indicators"
          :title="item.row.compilePageIndicator.title"
          aria-hidden="true"
        >
          <span v-if="item.row.compilePageIndicator.missing" class="sone-tree-compile-indicator sone-tree-compile-indicator--missing"></span>
          <span v-if="item.row.compilePageIndicator.error" class="sone-tree-compile-indicator sone-tree-compile-indicator--error"></span>
        </span>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useAttrs, watch } from 'vue'
import type { ComponentPublicInstance } from 'vue'
import SidebarFloatingMenu from '../common/SidebarFloatingMenu.vue'
import SoneTreeMenuItems from './SoneTreeMenuItems.vue'

defineOptions({
  inheritAttrs: false
})

export type SoneTreeMenuItem = {
  key: string
  label: string
  action: string
  danger?: boolean
  disabled?: boolean
  dividerBefore?: boolean
  shortcut?: string
  children?: SoneTreeMenuItem[]
}

export type SoneTreeRowView = {
  id: string
  label: string
  subtitle?: string
  depth: number
  kind: 'folder' | 'document'
  open?: boolean
  active?: boolean
  selected?: boolean
  selectedPrev?: boolean
  selectedNext?: boolean
  cutPending?: boolean
  hasMenu?: boolean
  menuOpen?: boolean
  menuItems?: SoneTreeMenuItem[]
  multiSelectId?: string
  icon?: string
  groupRunId?: string
  dragId?: string
  dragKind?: 'folder' | 'document' | 'cluster'
  clusterId?: string
  dragging?: boolean
  dropTarget?: boolean
  previewShift?: boolean
  compilePageIndicator?: {
    missing?: boolean
    error?: boolean
    title?: string
  }
  pendingIndicator?: {
    title?: string
  }
}

const props = defineProps<{
  rows: SoneTreeRowView[]
  menuStyle?: Record<string, string>
}>()
const attrs = useAttrs()

const emit = defineEmits<{
  (e: 'select', rowId: string, event: MouseEvent | KeyboardEvent): void
  (e: 'toggle', rowId: string): void
  (e: 'menu', rowId: string, event: MouseEvent): void
  (e: 'menu-action', action: string, rowId: string): void
  (e: 'row-pointerdown', rowId: string, event: PointerEvent): void
  (e: 'row-pointermove', rowId: string, event: PointerEvent): void
  (e: 'row-pointerend', rowId: string, event: PointerEvent): void
}>()

type GroupLinkSegment = {
  key: string
  x: number
  y1: number
  y2: number
  delay: number
}

type GroupLinkRow = {
  row: SoneTreeRowView
  toggleElement: HTMLElement
  rowElement: HTMLElement
}

type SelectionBlockSegment = {
  key: string
  y: number
  height: number
}

type MeasuredSoneRow = {
  row: SoneTreeRowView
  rowElement: HTMLElement
  rect: DOMRect
  height: number
}

type StickySoneRow = {
  row: SoneTreeRowView
  y: number
  height: number
  toggleLeft: number
}

const treeRootRef = ref<HTMLElement | null>(null)
const stickyStackRef = ref<HTMLElement | null>(null)
const stickyRows = ref<StickySoneRow[]>([])
const rowRefs = new Map<string, HTMLElement>()
const groupLinkSegments = ref<GroupLinkSegment[]>([])
const selectionBlockSegments = ref<SelectionBlockSegment[]>([])
const groupLinkVersion = ref(0)
const SONE_FOLDER_ANCHOR_CLEARANCE_PX = 11
const SONE_DOCUMENT_ANCHOR_CLEARANCE_PX = 0
const SONE_ROOT_CONTENT_LEFT_PX = 16
const SONE_CHILD_ANCHOR_LEFT_PX = 21
const SONE_ANCHOR_BOX_PX = 20
const SONE_ICON_BOX_PX = 20
const SONE_ICON_LABEL_GAP_PX = 2
const SONE_DEPTH_STEP_PX = 12
const SONE_SCROLLBAR_REVEAL_ZONE_PX = 18
let measureFrame = 0
let stickyFrame = 0
let stickyLayoutFrame = 0
let stickyScrollParent: HTMLElement | Window | null = null

const resolvedMenuStyle = computed<Record<string, string>>(() => {
  const nextStyle = { ...(props.menuStyle || {}) }
  delete nextStyle.maxHeight
  delete nextStyle.overflow
  delete nextStyle.overflowX
  delete nextStyle.overflowY
  return {
    ...nextStyle,
    overflow: 'visible'
  }
})
let stickyVisibilityObserver: MutationObserver | null = null
let stickyVisibilityAncestor: HTMLElement | null = null
let soneScrollHost: HTMLElement | null = null
let stickyLayoutResizeObserver: ResizeObserver | null = null
let stickyLayoutRoot: HTMLElement | null = null
let stickyLayoutScrollParent: HTMLElement | null = null
let stickyLastLayoutKey = ''
const soneSelectionWidth = ref(156)
const rootStyle = computed<Record<string, string>>(() => {
  return {
    '--sone-selection-width': `${soneSelectionWidth.value}px`
  }
})

function getSoneIconLeft(depth: number) {
  const safeDepth = Math.max(0, Number(depth || 0))
  if (safeDepth === 0) return SONE_ROOT_CONTENT_LEFT_PX
  return SONE_CHILD_ANCHOR_LEFT_PX + (safeDepth - 1) * SONE_DEPTH_STEP_PX
}

function getSoneAnchorX(depth: number) {
  const safeDepth = Math.max(0, Number(depth || 0))
  const anchorLeft = safeDepth === 0
    ? 1
    : SONE_CHILD_ANCHOR_LEFT_PX + (safeDepth - 1) * SONE_DEPTH_STEP_PX
  return anchorLeft + SONE_ANCHOR_BOX_PX / 2
}

function getSoneLabelLeft(depth: number) {
  const safeDepth = Math.max(0, Number(depth || 0))
  return getSoneIconLeft(safeDepth) + SONE_ICON_BOX_PX + SONE_ICON_LABEL_GAP_PX
}

function getRowStyle(row: SoneTreeRowView) {
  const depth = Math.max(0, Number(row.depth || 0))
  const iconLeft = getSoneIconLeft(depth)
  const anchorX = getSoneAnchorX(depth)
  return {
    '--doc-depth': String(depth),
    '--doc-depth-offset': `${depth * SONE_DEPTH_STEP_PX}px`,
    '--sone-anchor-x': `${anchorX}px`,
    '--sone-toggle-left': `${anchorX - SONE_ANCHOR_BOX_PX / 2}px`,
    '--sone-row-padding-left': `${depth === 0 ? iconLeft : getSoneLabelLeft(depth)}px`
  }
}

function getStickyRowStyle(item: StickySoneRow) {
  return {
    ...getRowStyle(item.row),
    '--sone-sticky-y': `${Math.round(item.y * 100) / 100}px`,
    '--sone-sticky-row-height': `${Math.round(item.height * 100) / 100}px`,
    '--sone-sticky-toggle-left': `${Math.round(item.toggleLeft * 100) / 100}px`
  }
}

function getSoneAnchorClearance(row: SoneTreeRowView) {
  return row.kind === 'folder' ? SONE_FOLDER_ANCHOR_CLEARANCE_PX : SONE_DOCUMENT_ANCHOR_CLEARANCE_PX
}

function getSelectedMenuHostRow(row: SoneTreeRowView) {
  if (row.hasMenu || !(row.active || row.selected)) return row
  const selectedMenuHost = props.rows.find((item) => (
    item.hasMenu
    && item.selected
  ))
  if (selectedMenuHost) return selectedMenuHost
  return row
}

function handleRowContextMenu(row: SoneTreeRowView, event: MouseEvent) {
  emit('menu', getSelectedMenuHostRow(row).id, event)
}

function resolveSelectedRowFromSelectionArea(event: MouseEvent) {
  const root = treeRootRef.value
  if (!root) return null
  const rootRect = root.getBoundingClientRect()
  const selectionRight = rootRect.left + Math.max(soneSelectionWidth.value, rootRect.width) + 8
  if (
    event.clientX < rootRect.left
    || event.clientX > selectionRight
    || event.clientY < rootRect.top
    || event.clientY > rootRect.bottom
  ) {
    return null
  }

  const selectedRows = props.rows
    .filter((row) => row.selected)
    .map((row) => {
      const rowElement = rowRefs.get(row.id)
      return rowElement instanceof HTMLElement
        ? { row, rect: rowElement.getBoundingClientRect() }
        : null
    })
    .filter((item): item is { row: SoneTreeRowView; rect: DOMRect } => Boolean(item))
  if (!selectedRows.length) return null

  const exactRow = selectedRows.find((item) => event.clientY >= item.rect.top && event.clientY <= item.rect.bottom)
  if (exactRow) return getSelectedMenuHostRow(exactRow.row)

  const selectedBlock = selectionBlockSegments.value.find((segment) => {
    const top = rootRect.top + segment.y
    const bottom = top + segment.height
    return event.clientY >= top && event.clientY <= bottom
  })
  if (!selectedBlock) return null

  const nearestRow = selectedRows.reduce((nearest, item) => {
    const itemCenter = item.rect.top + item.rect.height / 2
    const nearestCenter = nearest.rect.top + nearest.rect.height / 2
    return Math.abs(event.clientY - itemCenter) < Math.abs(event.clientY - nearestCenter) ? item : nearest
  }).row
  return getSelectedMenuHostRow(nearestRow)
}

function handleSelectionAreaContextMenu(event: MouseEvent) {
  const target = event.target
  if (target instanceof HTMLElement && target.closest('.sidebar-tree-rows__row, .sidebar-tree-rows__row-menu, .sidebar-row-action')) return
  const row = resolveSelectedRowFromSelectionArea(event)
  if (!row) return
  event.preventDefault()
  event.stopPropagation()
  emit('menu', row.id, event)
}

function setRowRef(rowId: string, element: Element | ComponentPublicInstance | null) {
  const safeId = String(rowId || '').trim()
  if (!safeId) return
  const elementRef = element instanceof HTMLElement
    ? element
    : (element && '$el' in element && element.$el instanceof HTMLElement ? element.$el : null)
  if (elementRef) {
    rowRefs.set(safeId, elementRef)
    return
  }
  rowRefs.delete(safeId)
}

function scheduleGroupLinkMeasure() {
  if (typeof window === 'undefined') return
  if (measureFrame) window.cancelAnimationFrame(measureFrame)
  measureFrame = window.requestAnimationFrame(() => {
    measureFrame = 0
    measureGroupLinks()
    syncStickyStack()
  })
}

function scheduleStickyStackMeasure() {
  if (typeof window === 'undefined') return
  if (stickyFrame) window.cancelAnimationFrame(stickyFrame)
  stickyFrame = window.requestAnimationFrame(() => {
    stickyFrame = 0
    syncStickyStack()
  })
}

function getStickyLayoutKey(root: HTMLElement, layerRect: DOMRect) {
  const rootRect = root.getBoundingClientRect()
  return [
    Math.round(rootRect.left * 100) / 100,
    Math.round(rootRect.top * 100) / 100,
    Math.round(rootRect.width * 100) / 100,
    Math.round(rootRect.height * 100) / 100,
    Math.round(layerRect.left * 100) / 100,
    Math.round(layerRect.top * 100) / 100,
    Math.round(layerRect.width * 100) / 100,
    Math.round(layerRect.height * 100) / 100
  ].join(':')
}

function scheduleStickyLayoutTrack() {
  if (typeof window === 'undefined' || stickyLayoutFrame) return
  stickyLayoutFrame = window.requestAnimationFrame(() => {
    stickyLayoutFrame = 0
    trackStickyLayout()
  })
}

function trackStickyLayout() {
  const root = treeRootRef.value
  if (!root || !stickyRows.value.length || typeof window === 'undefined') {
    stickyLastLayoutKey = ''
    return
  }
  const layerRect = getStickyLayerRect(root.getBoundingClientRect())
  const nextKey = getStickyLayoutKey(root, layerRect)
  if (stickyLastLayoutKey && stickyLastLayoutKey !== nextKey) {
    stickyLastLayoutKey = nextKey
    syncStickyStack()
    return
  }
  stickyLastLayoutKey = nextKey
  scheduleStickyLayoutTrack()
}

function updateStickyLayoutObserver() {
  if (typeof ResizeObserver === 'undefined') return
  const root = treeRootRef.value
  const scrollParent = stickyScrollParent instanceof HTMLElement ? stickyScrollParent : null
  if (stickyLayoutRoot === root && stickyLayoutScrollParent === scrollParent) return
  stickyLayoutResizeObserver?.disconnect()
  stickyLayoutResizeObserver = null
  stickyLayoutRoot = root
  stickyLayoutScrollParent = scrollParent
  if (!root) return
  stickyLayoutResizeObserver = new ResizeObserver(() => {
    scheduleGroupLinkMeasure()
    scheduleStickyStackMeasure()
  })
  stickyLayoutResizeObserver.observe(root)
  if (scrollParent && scrollParent !== root) {
    stickyLayoutResizeObserver.observe(scrollParent)
  }
}

function measureGroupLinks() {
  const root = treeRootRef.value
  if (!root) {
    groupLinkSegments.value = []
    selectionBlockSegments.value = []
    return
  }
  measureSoneSelectionWidth(root)
  measureSoneSelectionBlocks(root)
  const rootRect = root.getBoundingClientRect()
  const groupRuns: GroupLinkRow[][] = []
  const openRunsByKey = new Map<string, GroupLinkRow[]>()
  props.rows.forEach((row) => {
    const depth = Number(row.depth || 0)
    const runKey = `${depth}:${String(row.groupRunId || '')}`
    const rowElement = rowRefs.get(row.id)
    const toggleElement = rowElement?.querySelector('.doc-sidebar-row-toggle')
    if (!(rowElement instanceof HTMLElement) || !(toggleElement instanceof HTMLElement)) return
    let run = openRunsByKey.get(runKey)
    if (!run) {
      run = []
      groupRuns.push(run)
      openRunsByKey.set(runKey, run)
    }
    run.push({ row, toggleElement, rowElement })
  })

  const nextSegments: GroupLinkSegment[] = []
  groupRuns.forEach((groupRows) => {
    const first = groupRows[0]
    if (!first) return
    const rowRect = first.rowElement.getBoundingClientRect()
    const anchorX = rowRect.left - rootRect.left + getSoneAnchorX(Number(first.row.depth || 0))
    groupRows.forEach((item, index) => {
      const next = groupRows[index + 1]
      if (!next) return
      const currentRect = item.toggleElement.getBoundingClientRect()
      const nextRect = next.toggleElement.getBoundingClientRect()
      const currentCenterY = currentRect.top + currentRect.height / 2 - rootRect.top
      const nextCenterY = nextRect.top + nextRect.height / 2 - rootRect.top
      const y1 = currentCenterY + getSoneAnchorClearance(item.row)
      const y2 = nextCenterY - getSoneAnchorClearance(next.row)
      if (y2 <= y1) return
      nextSegments.push({
        key: `${groupLinkVersion.value}:${String(item.row.groupRunId || '')}:${item.row.depth}:${item.row.id}:${next.row.id}`,
        x: anchorX,
        y1,
        y2,
        delay: nextSegments.length * 34
      })
    })
  })

  groupLinkVersion.value += 1
  groupLinkSegments.value = nextSegments.map((segment) => ({
    ...segment,
    key: segment.key.replace(`${groupLinkVersion.value - 1}:`, `${groupLinkVersion.value}:`)
  }))
}

function measureSoneSelectionBlocks(root: HTMLElement) {
  const rootRect = root.getBoundingClientRect()
  const nextBlocks: SelectionBlockSegment[] = []
  let openBlock: { firstId: string; y1: number; y2: number } | null = null
  const flushBlock = () => {
    if (!openBlock) return
    const y = Math.max(0, Math.floor(openBlock.y1))
    const height = Math.max(1, Math.ceil(openBlock.y2 - openBlock.y1))
    nextBlocks.push({
      key: `${openBlock.firstId}:${y}:${height}`,
      y,
      height
    })
    openBlock = null
  }

  props.rows.forEach((row) => {
    const rowElement = rowRefs.get(row.id)
    const selected = Boolean(row.selected)
    if (!selected || !(rowElement instanceof HTMLElement)) {
      flushBlock()
      return
    }
    const rect = rowElement.getBoundingClientRect()
    const y1 = rect.top - rootRect.top
    const y2 = rect.bottom - rootRect.top
    if (!openBlock) {
      openBlock = { firstId: row.id, y1, y2 }
      return
    }
    openBlock.y2 = y2
  })
  flushBlock()
  selectionBlockSegments.value = nextBlocks
}

function measureSoneSelectionWidth(root: HTMLElement) {
  const rootWidth = root.clientWidth || root.getBoundingClientRect().width
  soneSelectionWidth.value = Math.max(128, Math.ceil(rootWidth + 8))
}

function findStickyScrollParent(root: HTMLElement): HTMLElement | Window {
  let current = root.parentElement
  let overflowFallback: HTMLElement | null = null
  while (current) {
    const style = window.getComputedStyle(current)
    const canScrollY = /(auto|scroll|overlay)/.test(style.overflowY)
    const isScrollable = canScrollY && current.scrollHeight > current.clientHeight + 1
    if (isScrollable) return current
    if (
      current.classList.contains('chat-sidebar-content')
      || current.classList.contains('sidebar-section-scroll')
    ) {
      return current
    }
    if (canScrollY && !overflowFallback) overflowFallback = current
    current = current.parentElement
  }
  return overflowFallback || window
}

function updateStickyScrollParent() {
  if (typeof window === 'undefined') return
  const root = treeRootRef.value
  const nextParent = root ? findStickyScrollParent(root) : window
  if (stickyScrollParent === nextParent) return
  if (stickyScrollParent) {
    stickyScrollParent.removeEventListener('scroll', scheduleStickyStackMeasure)
  }
  stickyScrollParent = nextParent
  stickyScrollParent.addEventListener('scroll', scheduleStickyStackMeasure, { passive: true })
  updateSoneScrollHost(nextParent)
  updateStickyLayoutObserver()
}

function findStickyVisibilityAncestor(root: HTMLElement) {
  return root.closest('.chat-sidebar, .app-sidebar, .doc-library-sidebar')
}

function updateStickyVisibilityObserver() {
  if (typeof MutationObserver === 'undefined') return
  const root = treeRootRef.value
  const nextAncestor = root ? findStickyVisibilityAncestor(root) : null
  if (stickyVisibilityAncestor === nextAncestor) return
  stickyVisibilityObserver?.disconnect()
  stickyVisibilityObserver = null
  stickyVisibilityAncestor = nextAncestor instanceof HTMLElement ? nextAncestor : null
  if (!stickyVisibilityAncestor) return
  stickyVisibilityObserver = new MutationObserver(scheduleStickyStackMeasure)
  stickyVisibilityObserver.observe(stickyVisibilityAncestor, {
    attributes: true,
    attributeFilter: ['class', 'style', 'hidden', 'aria-hidden']
  })
}

function updateSoneScrollHost(scrollParent: HTMLElement | Window | null) {
  const nextHost = scrollParent instanceof HTMLElement ? scrollParent : null
  if (soneScrollHost === nextHost) return
  cleanupSoneScrollHost()
  soneScrollHost = nextHost
  if (!soneScrollHost) return
  soneScrollHost.classList.add('sone-tree-scroll-host')
  soneScrollHost.addEventListener('pointermove', handleSoneScrollHostPointerMove)
  soneScrollHost.addEventListener('pointerleave', handleSoneScrollHostPointerLeave)
}

function cleanupSoneScrollHost() {
  if (!soneScrollHost) return
  soneScrollHost.classList.remove('sone-tree-scroll-host', 'sone-tree-scroll-host--scrollbar-near')
  soneScrollHost.removeEventListener('pointermove', handleSoneScrollHostPointerMove)
  soneScrollHost.removeEventListener('pointerleave', handleSoneScrollHostPointerLeave)
  soneScrollHost = null
}

function handleSoneScrollHostPointerMove(event: PointerEvent) {
  const host = event.currentTarget
  if (!(host instanceof HTMLElement)) return
  const rect = host.getBoundingClientRect()
  const nearRight = event.clientX >= rect.right - SONE_SCROLLBAR_REVEAL_ZONE_PX
    && event.clientX <= rect.right + 2
    && event.clientY >= rect.top
    && event.clientY <= rect.bottom
  host.classList.toggle('sone-tree-scroll-host--scrollbar-near', nearRight)
}

function handleSoneScrollHostPointerLeave(event: PointerEvent) {
  const host = event.currentTarget
  if (!(host instanceof HTMLElement)) return
  host.classList.remove('sone-tree-scroll-host--scrollbar-near')
}

function getStickyViewportTop(scrollParent: HTMLElement | Window | null) {
  if (scrollParent instanceof HTMLElement) {
    return scrollParent.getBoundingClientRect().top + getStickyHeaderOffset(scrollParent)
  }
  return 0
}

function scrollStickyRowToSource(rowId: string) {
  const rowElement = rowRefs.get(rowId)
  if (!(rowElement instanceof HTMLElement) || typeof window === 'undefined') return
  updateStickyScrollParent()
  const viewportTop = getStickyViewportTop(stickyScrollParent)
  const stackHeight = stickyRows.value.reduce((max, item) => Math.max(max, item.y + item.height), 0)
  const targetTop = viewportTop + stackHeight + 2
  const rowRect = rowElement.getBoundingClientRect()
  if (stickyScrollParent instanceof HTMLElement) {
    stickyScrollParent.scrollTop += rowRect.top - targetTop
  } else {
    window.scrollBy({ top: rowRect.top - targetTop, left: 0, behavior: 'auto' })
  }
  scheduleStickyStackMeasure()
}

function getStickyLayerRect(rootRect: DOMRect) {
  if (stickyScrollParent instanceof HTMLElement) return stickyScrollParent.getBoundingClientRect()
  return rootRect
}

function getStickyHeaderOffset(scrollParent: HTMLElement) {
  const directHeader = Array.from(scrollParent.children).find((child) => (
    child instanceof HTMLElement && child.classList.contains('doc-sidebar-tabs')
  ))
  if (!(directHeader instanceof HTMLElement)) return 0
  return directHeader.getBoundingClientRect().height
}

function isStickyRootVisible(root: HTMLElement, rootRect: DOMRect, layerRect: DOMRect) {
  const sidebar = root.closest('.chat-sidebar')
  if (sidebar instanceof HTMLElement && !sidebar.classList.contains('open')) return false
  return (
    root.isConnected
    && rootRect.width > 1
    && rootRect.height > 1
    && layerRect.width > 1
    && layerRect.height > 1
    && rootRect.right > 0
    && rootRect.left < window.innerWidth
    && rootRect.bottom > 0
    && rootRect.top < window.innerHeight
  )
}

function measureRowsForSticky(): MeasuredSoneRow[] {
  return props.rows.flatMap((row) => {
    const rowElement = rowRefs.get(row.id)
    if (!(rowElement instanceof HTMLElement)) return []
    const rect = rowElement.getBoundingClientRect()
    return [{
      row,
      rowElement,
      rect,
      height: rect.height || rowElement.offsetHeight || 0
    }]
  })
}

function measureStickyToggleLeft(rowElement: HTMLElement, layerRect: DOMRect) {
  const toggleElement = rowElement.querySelector<HTMLElement>('.doc-sidebar-row-toggle')
  if (toggleElement) {
    const toggleRect = toggleElement.getBoundingClientRect()
    if (toggleRect.width > 0 || toggleRect.height > 0) {
      return toggleRect.left - layerRect.left
    }
  }

  const rowRect = rowElement.getBoundingClientRect()
  const computedToggleLeft = toggleElement
    ? Number.parseFloat(window.getComputedStyle(toggleElement).left || '')
    : Number.NaN
  if (Number.isFinite(computedToggleLeft)) {
    return rowRect.left - layerRect.left + computedToggleLeft
  }

  const rowStyle = window.getComputedStyle(rowElement)
  const computedPaddingLeft = Number.parseFloat(rowStyle.paddingLeft || '')
  return rowRect.left - layerRect.left + (Number.isFinite(computedPaddingLeft) ? computedPaddingLeft : 0)
}

function getSoneGroupPath(rows: MeasuredSoneRow[], targetIndex: number) {
  const path: MeasuredSoneRow[] = []
  for (let index = 0; index <= targetIndex; index += 1) {
    const item = rows[index]
    if (!item) continue
    const depth = Math.max(0, Number(item.row.depth || 0))
    path.splice(depth)
    if (item.row.kind === 'folder') path[depth] = item
  }
  return path.filter(Boolean)
}

function hasSameStickyRows(left: StickySoneRow[], right: StickySoneRow[]) {
  return left.length === right.length && left.every((item, index) => item.row.id === right[index]?.row.id)
}

function syncStickyStack() {
  const root = treeRootRef.value
  const layer = stickyStackRef.value
  if (!root || !layer || typeof window === 'undefined') return
  updateStickyScrollParent()
  const viewportTop = getStickyViewportTop(stickyScrollParent)
  const rootRect = root.getBoundingClientRect()
  const layerRect = getStickyLayerRect(rootRect)
  const rows = measureRowsForSticky()
  updateStickyVisibilityObserver()
  updateStickyLayoutObserver()
  layer.style.setProperty('--sone-sticky-layer-top', `${Math.round(viewportTop * 100) / 100}px`)
  layer.style.setProperty('--sone-sticky-layer-left', `${Math.round(layerRect.left * 100) / 100}px`)
  layer.style.setProperty('--sone-sticky-layer-width', `${Math.round(layerRect.width * 100) / 100}px`)
  layer.style.setProperty('--sone-sticky-content-left', `${Math.round((rootRect.left - layerRect.left) * 100) / 100}px`)

  if (
    !rows.length
    || !isStickyRootVisible(root, rootRect, layerRect)
    || rootRect.top > viewportTop + 0.5
    || rootRect.bottom <= viewportTop + 0.5
  ) {
    renderStickyStack([])
    return
  }

  let stickyItems: StickySoneRow[] = []
  for (let guard = 0; guard < 6; guard += 1) {
    const stackHeight = stickyItems.reduce((sum, item) => sum + item.height, 0)
    const probeY = viewportTop + stackHeight + 1
    let currentIndex = 0
    rows.forEach((item, index) => {
      if (item.rect.top <= probeY) currentIndex = index
    })

    const path = getSoneGroupPath(rows, currentIndex)
    const nextStickyItems: StickySoneRow[] = []
    let stickyTop = 0
    path.forEach((item) => {
      const naturalTop = item.rect.top - viewportTop
      const captureLine = stickyTop + item.height
      if (naturalTop <= captureLine + 0.5) {
        nextStickyItems.push({
          row: item.row,
          y: stickyTop === 0 ? 0 : Math.max(naturalTop, stickyTop),
          height: item.height,
          toggleLeft: measureStickyToggleLeft(item.rowElement, layerRect)
        })
        stickyTop += item.height
      }
    })

    if (hasSameStickyRows(stickyItems, nextStickyItems)) {
      stickyItems = nextStickyItems
      break
    }
    stickyItems = nextStickyItems
  }

  renderStickyStack(stickyItems)
  if (stickyItems.length) scheduleStickyLayoutTrack()
}

function renderStickyStack(stickyItems: StickySoneRow[]) {
  const layer = stickyStackRef.value
  if (!layer) return
  const stackHeight = stickyItems.reduce((max, item) => Math.max(max, item.y + item.height), 0)
  layer.style.setProperty('--sone-sticky-stack-height', `${stackHeight}px`)
  layer.style.setProperty('--sone-sticky-shadow-opacity', stickyItems.length ? '1' : '0')
  stickyRows.value = stickyItems
  if (!stickyItems.length) stickyLastLayoutKey = ''
}

watch(
  () => props.rows.map((row) => `${row.id}:${row.depth}:${row.kind}:${row.open ? 1 : 0}:${row.active ? 1 : 0}:${row.selected ? 1 : 0}:${row.compilePageIndicator?.missing ? 1 : 0}:${row.compilePageIndicator?.error ? 1 : 0}:${row.groupRunId || ''}`).join('|'),
  async () => {
    await nextTick()
    updateStickyScrollParent()
    updateStickyVisibilityObserver()
    scheduleGroupLinkMeasure()
    scheduleStickyStackMeasure()
  },
  { immediate: true }
)

onMounted(() => {
  updateStickyScrollParent()
  updateStickyVisibilityObserver()
  updateStickyLayoutObserver()
  scheduleGroupLinkMeasure()
  scheduleStickyStackMeasure()
  if (typeof window !== 'undefined') {
    window.addEventListener('resize', scheduleGroupLinkMeasure)
    window.addEventListener('resize', scheduleStickyStackMeasure)
  }
})

onBeforeUnmount(() => {
  if (typeof window !== 'undefined') {
    if (measureFrame) window.cancelAnimationFrame(measureFrame)
    if (stickyFrame) window.cancelAnimationFrame(stickyFrame)
    if (stickyLayoutFrame) window.cancelAnimationFrame(stickyLayoutFrame)
    window.removeEventListener('resize', scheduleGroupLinkMeasure)
    window.removeEventListener('resize', scheduleStickyStackMeasure)
    if (stickyScrollParent) stickyScrollParent.removeEventListener('scroll', scheduleStickyStackMeasure)
    stickyVisibilityObserver?.disconnect()
    stickyVisibilityObserver = null
    stickyVisibilityAncestor = null
    stickyLayoutResizeObserver?.disconnect()
    stickyLayoutResizeObserver = null
    stickyLayoutRoot = null
    stickyLayoutScrollParent = null
    stickyLastLayoutKey = ''
    cleanupSoneScrollHost()
  }
})
</script>

<style>
.sone-tree-scroll-host {
  box-sizing: border-box;
  max-width: 100%;
  overflow-x: hidden;
  overflow-y: auto;
  scrollbar-gutter: auto;
  scrollbar-width: thin;
  scrollbar-color: transparent transparent;
}

.sone-tree-scroll-host.sone-tree-scroll-host--scrollbar-near,
.sone-tree-scroll-host:focus-within {
  scrollbar-color: rgba(116, 111, 101, 0.32) transparent;
}

.sone-tree-scroll-host::-webkit-scrollbar {
  display: block;
  width: 4px;
  height: 4px;
}

.sone-tree-scroll-host::-webkit-scrollbar-track {
  background: transparent;
}

.sone-tree-scroll-host::-webkit-scrollbar-thumb {
  min-height: 28px;
  border: 1px solid transparent;
  border-radius: 999px;
  background-color: transparent;
  background-clip: content-box;
}

.sone-tree-scroll-host.sone-tree-scroll-host--scrollbar-near::-webkit-scrollbar-thumb,
.sone-tree-scroll-host:focus-within::-webkit-scrollbar-thumb,
.sone-tree-scroll-host::-webkit-scrollbar-thumb:hover {
  background-color: rgba(116, 111, 101, 0.34);
}

.sone-tree-sticky-stack {
  --sone-sticky-stack-height: 0px;
  --sone-sticky-layer-top: 0px;
  --sone-sticky-layer-left: 0px;
  --sone-sticky-layer-width: 0px;
  --sone-sticky-content-left: 0px;
  --sone-sticky-shadow-opacity: 0;
  --sone-sticky-bg: var(--morandi-bg, #f8f4ee);
  position: fixed;
  top: var(--sone-sticky-layer-top);
  left: var(--sone-sticky-layer-left);
  width: var(--sone-sticky-layer-width);
  max-width: var(--sone-sticky-layer-width);
  /* 冻结层只属于所在面板：必须高于侧栏容器（chat-sidebar 100/101、输入栏 105），
     但必须低于 hover 暂态悬浮二级侧栏（.chat-sidebar-slot--floating z:200，见 sidebar DEVELOPMENT.md 10.5/10.6）
     和弹窗/灯箱（1200+），否则会悬浮在覆盖层上面。 */
  z-index: 150;
  box-sizing: border-box;
  height: 0;
  overflow: visible;
  isolation: isolate;
  pointer-events: none;
}

.sone-tree-sticky-stack,
.sone-tree-sticky-stack * {
  box-sizing: border-box;
}

.sone-tree-sticky-stack::before {
  content: '';
  position: absolute;
  z-index: 0;
  top: 0;
  right: 0;
  left: 0;
  height: var(--sone-sticky-stack-height);
  background: var(--sone-sticky-bg);
  pointer-events: none;
}

.sone-tree-sticky-stack::after {
  content: '';
  position: absolute;
  z-index: 0;
  top: calc(var(--sone-sticky-stack-height) - 1px);
  right: 0;
  left: 0;
  height: 7px;
  background: linear-gradient(180deg, rgba(62, 56, 45, 0.045), rgba(62, 56, 45, 0));
  opacity: var(--sone-sticky-shadow-opacity);
  pointer-events: none;
}

.sone-tree-sticky-stack .sidebar-tree-rows__sticky-row {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 2px;
  box-sizing: border-box;
  width: 100%;
  height: var(--sone-sticky-row-height, 26px);
  min-height: var(--sone-sticky-row-height, 26px);
  margin: 0;
  padding: 0 8px 0 calc(var(--sone-sticky-content-left) + var(--sone-row-padding-left, calc(24px + var(--doc-depth-offset, 0px))));
  border: 0;
  border-radius: 0;
  background: var(--sone-sticky-bg);
  color: #445346;
  font-size: 13px;
  font-weight: 600;
  line-height: 1.2;
  text-align: left;
  transform: translateY(var(--sone-sticky-y, 0px));
  transition: none;
  cursor: pointer;
  pointer-events: auto;
  isolation: isolate;
}

.sone-tree-sticky-stack .sidebar-tree-rows__sticky-row::before {
  content: '';
  position: absolute;
  z-index: 0;
  inset: 0;
  background: var(--sone-sticky-bg);
  pointer-events: none;
}

.sone-tree-sticky-stack .sidebar-tree-rows__sticky-row[data-depth='0'] {
  min-height: 26px;
  color: #3f5043;
  font-size: 14px;
}

.sone-tree-sticky-stack .sidebar-tree-rows__sticky-row .doc-sidebar-row-label {
  position: relative;
  z-index: 3;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  letter-spacing: 0;
}

.sone-tree-sticky-stack .sidebar-tree-rows__sticky-row.folder .doc-sidebar-row-label {
  font-weight: 400;
}

.sone-tree-sticky-stack .sidebar-tree-rows__sticky-row[data-depth='0'] .doc-sidebar-row-label {
  font-weight: 700;
}

.sone-tree-sticky-stack .doc-sidebar-row-toggle {
  position: absolute;
  left: var(--sone-sticky-toggle-left, calc(var(--sone-sticky-content-left) + var(--sone-toggle-left, calc(1px + var(--doc-depth-offset, 0px)))));
  top: 50%;
  z-index: 3;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  width: 20px;
  height: 20px;
  border: none;
  background: transparent;
  color: #829987;
  font-size: 0;
  line-height: 0;
  transform: translateY(-50%);
}

.sone-tree-sticky-stack .sone-tree-toggle-icon {
  display: block;
  width: 12px;
  height: 12px;
  color: rgba(95, 111, 96, 0.8);
  transform: rotate(0deg);
  transform-origin: 50% 50%;
}

.sone-tree-sticky-stack .doc-sidebar-row-toggle.open .sone-tree-toggle-icon {
  transform: rotate(90deg);
}

.sone-tree-sticky-stack .doc-sidebar-row-marker {
  position: absolute;
  left: var(--sone-sticky-marker-left, calc(var(--sone-sticky-content-left) + 7px + var(--doc-depth-offset, 0px)));
  top: 2px;
  bottom: 2px;
  z-index: 1;
  width: 1px;
  background: transparent;
}

.sone-tree-sticky-stack .doc-sidebar-row-indent,
.sone-tree-sticky-stack .doc-sidebar-row-actions,
.sone-tree-sticky-stack .sidebar-tree-rows__row-menu {
  display: none;
}

.sone-tree-sticky-stack .doc-sidebar-row-icon {
  flex-basis: 20px;
  width: 20px;
  height: 20px;
  z-index: 3;
}

.sone-tree-sticky-stack .doc-sidebar-row-icon--placeholder {
  visibility: hidden;
}

/* 夜间对比度分档(2026-07-12)：冻结吸顶行随全局 [data-theme="dark"] 提升文字对比度，日间值不变；本块非 scoped，直接用属性选择器前缀 */
[data-theme="dark"] .sone-tree-sticky-stack .sidebar-tree-rows__sticky-row {
  color: #9aa896;
}

[data-theme="dark"] .sone-tree-sticky-stack .sidebar-tree-rows__sticky-row[data-depth='0'] {
  color: #a7b3a0;
}
</style>

<style scoped>
.sidebar-interaction-cut-pending {
  opacity: 0.52;
}
</style>

<style scoped>
.sidebar-tree-rows {
  position: relative;
  display: grid;
  gap: 0;
  width: 100%;
}

.sidebar-tree-rows__row {
  position: relative;
  display: flex;
  align-items: center;
  gap: 2px;
  width: calc(100% - 4px);
  min-height: 19px;
  margin: 0 2px;
  padding: 0 8px 0 calc(16px + var(--doc-depth, 0) * 12px);
  border: 0;
  border-radius: 0;
  background: transparent;
  color: #6b645d;
  font: inherit;
  font-size: 12px;
  text-align: left;
  cursor: pointer;
  outline: none;
}

.sidebar-tree-rows__row:hover {
  background: rgba(130, 153, 135, 0.07);
}

.sidebar-tree-rows__row:focus-visible {
  background: rgba(130, 153, 135, 0.09);
}

.sidebar-tree-rows__row.active {
  background: transparent;
  color: #556b59;
}

.sidebar-tree-rows__row.selected {
  background: transparent;
  color: #556b59;
}

.sidebar-tree-rows__row.folder {
  min-height: 24px;
  margin-top: 6px;
  margin-bottom: 0;
  margin-left: 4px;
  margin-right: 4px;
  padding-right: 8px;
  color: #4f5f4c;
}

.sidebar-tree-rows__row.folder-open {
  margin-top: 12px;
}

.sidebar-tree-rows__row.folder .doc-sidebar-row-label {
  font-weight: 500;
}

.sidebar-tree-rows__row.document::before {
  content: '';
  position: absolute;
  left: calc(22px + var(--doc-depth, 0) * 12px);
  top: 50%;
  width: 6px;
  border-top: 2px solid color-mix(in srgb, #b9b3a6 76%, transparent);
  transform: translateY(-50%);
  pointer-events: none;
}

.doc-sidebar-row-indent {
  flex: 0 0 0;
}

.doc-sidebar-row-toggle {
  position: absolute;
  left: calc(-11px + var(--doc-depth, 0) * 12px);
  top: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 14px;
  width: 14px;
  height: 18px;
  border: 0;
  background: transparent;
  color: #8c9d90;
  padding: 0;
  font-size: 13px;
  line-height: 1;
  cursor: pointer;
  transform: translateY(-50%) rotate(-90deg);
  transition: transform 0.16s ease;
}

.doc-sidebar-row-toggle.open {
  transform: translateY(-50%) rotate(0deg);
}

.doc-sidebar-row-toggle.hidden {
  visibility: hidden;
}

.doc-sidebar-row-marker {
  position: absolute;
  left: calc(10px + var(--doc-depth, 0) * 12px);
  top: 2px;
  bottom: 2px;
  flex: 0 0 1px;
  width: 1px;
  min-width: 1px;
  height: auto;
  border-radius: 999px;
  background: transparent;
}

.sidebar-tree-rows__row.selected-prev .doc-sidebar-row-marker {
  top: 0;
}

.sidebar-tree-rows__row.selected-next .doc-sidebar-row-marker {
  bottom: 0;
}

.doc-sidebar-row-marker.active {
  background: #829987;
}

.doc-sidebar-row-icon {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 17px;
  width: 17px;
  height: 17px;
  color: #b99a68;
  z-index: 1;
}

.doc-sidebar-row-icon::before,
.doc-sidebar-row-icon::after {
  content: '';
  position: absolute;
  box-sizing: border-box;
}

.doc-sidebar-row-icon[data-row-icon='folder']::before {
  left: 2px;
  top: 6px;
  width: 13px;
  height: 9px;
  border: 1.3px solid currentColor;
  border-radius: 3px;
}

.doc-sidebar-row-icon[data-row-icon='folder']::after {
  left: 4px;
  top: 3px;
  width: 7px;
  height: 5px;
  border: 1.3px solid currentColor;
  border-bottom: 0;
  border-radius: 3px 3px 0 0;
}

.doc-sidebar-row-icon[data-row-icon='core'] {
  color: #78927b;
}

.doc-sidebar-row-icon[data-row-icon='trace'] {
  color: #b79361;
}

.doc-sidebar-row-icon[data-row-icon='soul'] {
  color: #b28b59;
}

.doc-sidebar-row-icon[data-row-icon='core']::before,
.doc-sidebar-row-icon[data-row-icon='core']::after,
.doc-sidebar-row-icon[data-row-icon='trace']::before,
.doc-sidebar-row-icon[data-row-icon='trace']::after,
.doc-sidebar-row-icon[data-row-icon='soul']::before,
.doc-sidebar-row-icon[data-row-icon='soul']::after {
  content: none;
}

.doc-sidebar-row-icon__svg {
  display: block;
  width: 20px;
  height: 20px;
  flex: 0 0 20px;
}

.doc-sidebar-row-icon[data-row-icon='trace'] .doc-sidebar-row-icon__svg {
  transform: translateY(-1.4px);
}

.doc-sidebar-row-icon[data-row-icon='document'] {
  color: #b99a68;
}

.doc-sidebar-row-icon[data-row-icon='document']::before {
  left: 3px;
  top: 2px;
  width: 11px;
  height: 14px;
  border: 1.25px solid currentColor;
  border-radius: 3px;
}

.doc-sidebar-row-icon[data-row-icon='document']::after {
  right: 3px;
  top: 2px;
  width: 5px;
  height: 5px;
  border-left: 1.25px solid currentColor;
  border-bottom: 1.25px solid currentColor;
  border-radius: 0 2px 0 2px;
  background: rgba(250, 247, 240, 0.86);
}

.sidebar-tree-rows__row.folder > .doc-sidebar-row-icon {
  color: #b99a68;
}

.sidebar-tree-rows__row.folder .doc-sidebar-row-marker,
.sidebar-tree-rows__row.folder .doc-sidebar-row-marker.active {
  background: transparent;
}

.doc-sidebar-row-label {
  flex: 0 0 auto;
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  position: relative;
  z-index: 1;
}

.sone-tree-row-subtitle {
  position: relative;
  z-index: 1;
  flex: 1 1 0;
  min-width: 0;
  overflow: hidden;
  color: color-mix(in srgb, currentColor 58%, transparent);
  font-size: 0.92em;
  font-weight: 400;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.doc-sidebar-row-actions {
  position: relative;
  margin-left: auto;
  flex: 0 0 auto;
  width: 26px;
  opacity: 0;
  pointer-events: none;
  z-index: 3;
}

.sidebar-tree-rows__row:hover .doc-sidebar-row-actions,
.sidebar-tree-rows__row.active .doc-sidebar-row-actions,
.sidebar-tree-rows__row.selected .doc-sidebar-row-actions {
  opacity: 1;
  pointer-events: auto;
}

.sidebar-row-action {
  width: 26px;
  height: 26px;
  border: none;
  background: transparent;
  padding: 0;
  box-shadow: none;
  appearance: none;
  color: var(--morandi-text-light);
  cursor: pointer;
}

.sone-tree.sidebar-tree-rows {
  --sone-tree-line: rgba(82, 83, 76, 0.26);
  --sone-sticky-bg: var(--morandi-bg, #f8f4ee);
  padding: 0 0 6px;
  user-select: none;
  -webkit-user-select: none;
}

.sone-tree .sidebar-tree-rows__group-links {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: visible;
  pointer-events: none;
  z-index: 2;
}

.sone-tree .sidebar-tree-rows__selection-blocks {
  position: absolute;
  inset: 0;
  overflow: visible;
  pointer-events: none;
  z-index: 1;
}

.sone-tree .sidebar-tree-rows__selection-block {
  position: absolute;
  left: 0;
  right: -8px;
  width: auto;
  border-radius: 0;
  background: rgba(203, 201, 184, 0.16);
}

.sone-tree .sidebar-tree-rows__sticky-stack {
  --sone-sticky-stack-height: 0px;
  --sone-sticky-layer-top: 0px;
  --sone-sticky-layer-left: 0px;
  --sone-sticky-layer-width: 0px;
  --sone-sticky-content-left: 0px;
  --sone-sticky-shadow-opacity: 0;
  position: fixed;
  top: var(--sone-sticky-layer-top);
  left: var(--sone-sticky-layer-left);
  width: var(--sone-sticky-layer-width);
  z-index: 24;
  height: 0;
  overflow: visible;
  isolation: isolate;
  pointer-events: none;
}

.sone-tree .sidebar-tree-rows__sticky-stack::before {
  content: '';
  position: absolute;
  z-index: 0;
  top: 0;
  right: 0;
  left: 0;
  height: var(--sone-sticky-stack-height);
  background: var(--sone-sticky-bg);
  pointer-events: none;
}

.sone-tree .sidebar-tree-rows__sticky-stack::after {
  content: '';
  position: absolute;
  z-index: 0;
  top: calc(var(--sone-sticky-stack-height) - 1px);
  right: 0;
  left: 0;
  height: 7px;
  background: linear-gradient(180deg, rgba(62, 56, 45, 0.07), rgba(62, 56, 45, 0));
  opacity: var(--sone-sticky-shadow-opacity);
  pointer-events: none;
}

.sone-tree .sidebar-tree-rows__sticky-row {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 1;
  box-sizing: border-box;
  width: 100%;
  margin: 0;
  padding-left: calc(var(--sone-sticky-content-left) + var(--sone-row-padding-left, calc(24px + var(--doc-depth-offset, 0px))));
  border-radius: 0;
  background: var(--sone-sticky-bg);
  transform: translateY(var(--sone-sticky-y, 0px));
  transition: none;
  pointer-events: none;
}

.sone-tree .sidebar-tree-rows__sticky-row:hover,
.sone-tree .sidebar-tree-rows__sticky-row:focus-visible {
  background: var(--sone-sticky-bg);
}

.sone-tree .sidebar-tree-rows__sticky-row--tail::after {
  content: none;
}

.sone-tree .sidebar-tree-rows__group-link {
  stroke: var(--sone-tree-line);
  stroke-width: 1.1;
  stroke-linecap: round;
  stroke-dasharray: 4.2 5.2;
  transform-box: fill-box;
  transform-origin: center top;
  animation: sone-tree-group-link-grow 0.34s ease-out both;
  animation-delay: var(--link-delay, 0ms);
}

@keyframes sone-tree-group-link-grow {
  from {
    opacity: 0;
    transform: scaleY(0);
  }
  to {
    opacity: 1;
    transform: scaleY(1);
  }
}

.sone-tree .sidebar-tree-rows__row {
  gap: 2px;
  width: calc(100% - 12px);
  min-height: 24px;
  margin: 0 8px 0 0;
  padding: 0 6px 0 var(--sone-row-padding-left, calc(24px + var(--doc-depth-offset, 0px)));
  border-radius: 5px;
  color: #625f56;
  font-size: 13px;
  line-height: 1.2;
  z-index: 3;
  transition:
    background-color 0.16s ease,
    color 0.16s ease,
    opacity 0.16s ease;
}

.sone-tree .sidebar-tree-rows__row:hover {
  background: rgba(143, 135, 112, 0.05);
}

.sone-tree .sidebar-tree-rows__row:focus-visible {
  background: rgba(143, 135, 112, 0.1);
}

.sone-tree .sidebar-tree-rows__row.active,
.sone-tree .sidebar-tree-rows__row.selected {
  background: transparent;
  color: #4f5f4c;
}

.sone-tree .sidebar-tree-rows__row.selected .doc-sidebar-row-marker,
.sone-tree .sidebar-tree-rows__row.selected .doc-sidebar-row-marker.active,
.sone-tree .sidebar-tree-rows__row.selected-prev .doc-sidebar-row-marker,
.sone-tree .sidebar-tree-rows__row.selected-next .doc-sidebar-row-marker {
  background: transparent;
}

.sone-tree .sidebar-tree-rows__row.selected-prev .doc-sidebar-row-marker,
.sone-tree .sidebar-tree-rows__row.selected-next .doc-sidebar-row-marker {
  background: transparent;
}

.sone-tree .sidebar-tree-rows__row.selected-prev .doc-sidebar-row-marker.active,
.sone-tree .sidebar-tree-rows__row.selected-next .doc-sidebar-row-marker.active {
  background: transparent;
}

.sone-tree .sidebar-tree-rows__row.folder {
  min-height: 26px;
  margin-top: 7px;
  margin-bottom: 0;
  margin-left: 0;
  margin-right: 10px;
  padding-right: 8px;
  color: #445346;
  border-radius: 5px;
  font-size: 13px;
  font-weight: 600;
}

.sone-tree .sidebar-tree-rows__row.folder::before {
  content: none;
}

.sone-tree .sidebar-tree-rows__row.folder:first-child {
  margin-top: 2px;
}

.sone-tree .sidebar-tree-rows__row.folder:first-child::before {
  content: none;
}

.sone-tree .sidebar-tree-rows__row.folder .doc-sidebar-row-label {
  font-weight: 400;
  letter-spacing: 0;
}

.sone-tree .sidebar-tree-rows__row[data-depth='0'] {
  min-height: 26px;
  font-size: 14px;
  color: #3f5043;
}

.sone-tree .sidebar-tree-rows__row[data-depth='0'] .doc-sidebar-row-label {
  font-weight: 700;
}

.sone-tree .sidebar-tree-rows__row.document {
  min-height: 22px;
  margin-right: 20px;
  padding-right: 10px;
  color: #66645d;
  font-size: 12.5px;
  font-weight: 400;
}

.sone-tree .sidebar-tree-rows__row.document.active,
.sone-tree .sidebar-tree-rows__row.document.selected {
  background: transparent;
  color: #4f594d;
}

.sone-tree .sidebar-tree-rows__row.folder.selected {
  background: transparent;
  color: #4f594d;
}

.sone-tree .sidebar-tree-rows__row.sidebar-tree-rows__sticky-row {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 1;
  box-sizing: border-box;
  width: 100%;
  margin: 0;
  padding-left: calc(var(--sone-sticky-content-left) + var(--sone-row-padding-left, calc(24px + var(--doc-depth-offset, 0px))));
  border-radius: 0;
  background: var(--sone-sticky-bg);
  transform: translateY(var(--sone-sticky-y, 0px));
  transition: none;
  pointer-events: none;
}

.sone-tree .sidebar-tree-rows__sticky-row .doc-sidebar-row-toggle {
  left: calc(var(--sone-sticky-content-left) + var(--sone-toggle-left, calc(1px + var(--doc-depth-offset, 0px))));
}

.sone-tree .sidebar-tree-rows__sticky-row .doc-sidebar-row-marker {
  left: calc(var(--sone-sticky-content-left) + 7px + var(--doc-depth-offset, 0px));
}

.sone-tree .sidebar-tree-rows__row.sidebar-tree-rows__sticky-row:hover,
.sone-tree .sidebar-tree-rows__row.sidebar-tree-rows__sticky-row:focus-visible {
  background: var(--sone-sticky-bg);
}

.sone-tree .sidebar-tree-rows__row.document::before {
  content: none;
}

.sone-tree .sidebar-tree-rows__row.document::after {
  content: none;
}

.sone-tree .sidebar-tree-rows__row.folder-open::after {
  content: none;
}

.sone-tree .doc-sidebar-row-toggle {
  left: var(--sone-toggle-left, calc(1px + var(--doc-depth-offset, 0px)));
  flex: 0 0 20px;
  width: 20px;
  height: 20px;
  box-sizing: border-box;
  z-index: 3;
  color: transparent;
  font-size: 0;
  line-height: 0;
  background: transparent;
  border-radius: 999px;
  transform: translateY(-50%);
  transform-origin: 50% 50%;
}

.sone-tree .doc-sidebar-row-toggle.open {
  transform: translateY(-50%);
}

.sone-tree .sone-tree-toggle-icon {
  display: block;
  width: 12px;
  height: 12px;
  color: rgba(95, 111, 96, 0.8);
  transform: rotate(0deg);
  transform-origin: 50% 50%;
  transition: transform 0.16s ease;
}

.sone-tree .sidebar-tree-rows__row:not([data-depth='0']) .sone-tree-toggle-icon polyline {
  stroke-width: 1.55;
}

.sone-tree .doc-sidebar-row-toggle.open .sone-tree-toggle-icon {
  transform: rotate(90deg);
}

.sone-tree .doc-sidebar-row-toggle.sone-tree-node-dot {
  visibility: visible;
  pointer-events: none;
  background: transparent;
}

.sone-tree .sone-tree-node-dot::before {
  content: '';
  position: absolute;
  left: 50%;
  top: 50%;
  width: 1px;
  height: 1px;
  border-radius: 999px;
  background: transparent;
  transform: translate(-50%, -50%);
}

.sone-tree .doc-sidebar-row-marker {
  left: calc(7px + var(--doc-depth-offset, 0px));
}

.sone-tree .doc-sidebar-row-marker.active {
  background: transparent;
}

.sone-tree-sticky-stack .sidebar-tree-rows__sticky-row .doc-sidebar-row-toggle {
  position: absolute;
  left: var(--sone-sticky-toggle-left, calc(var(--sone-sticky-content-left) + var(--sone-toggle-left, calc(1px + var(--doc-depth-offset, 0px)))));
  top: 50%;
  z-index: 3;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  width: 20px;
  height: 20px;
  margin-right: 0;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: transparent;
  font-size: 0;
  line-height: 0;
  transform: translateY(-50%);
  transform-origin: 50% 50%;
}

.sone-tree-sticky-stack .sidebar-tree-rows__sticky-row .doc-sidebar-row-toggle.open {
  transform: translateY(-50%);
}

.sone-tree-sticky-stack .sidebar-tree-rows__sticky-row .sone-tree-toggle-icon {
  display: block;
  width: 12px;
  height: 12px;
  color: rgba(95, 111, 96, 0.8);
  transform: rotate(0deg);
  transform-origin: 50% 50%;
}

.sone-tree-sticky-stack .sidebar-tree-rows__sticky-row .doc-sidebar-row-toggle.open .sone-tree-toggle-icon {
  transform: rotate(90deg);
}

.sone-tree .doc-sidebar-row-actions {
  display: none;
}

.sone-tree .sone-tree-compile-indicators {
  position: relative;
  z-index: 3;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  flex: 0 0 auto;
  margin-left: 2px;
}

.sone-tree .sone-tree-pending-indicator {
  position: relative;
  z-index: 3;
  flex: 0 0 auto;
  width: 7px;
  height: 7px;
  margin-left: 3px;
  border-radius: 999px;
  background: #9b6ce8;
  box-shadow: 0 0 0 1px rgba(255, 254, 250, 0.9), 0 0 10px rgba(155, 108, 232, 0.46);
  animation: sone-pending-pulse 1.35s ease-in-out infinite;
}

@keyframes sone-pending-pulse {
  0%,
  100% {
    opacity: 0.55;
    transform: scale(0.86);
  }
  50% {
    opacity: 1;
    transform: scale(1.08);
  }
}

.sone-tree .sone-tree-compile-indicator {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  box-shadow: 0 0 0 1px rgba(255, 254, 250, 0.86);
}

.sone-tree .sone-tree-compile-indicator--missing {
  background: #d6a93f;
}

.sone-tree .sone-tree-compile-indicator--error {
  background: #c95f56;
}

.sone-tree .sidebar-row-action {
  width: 22px;
  height: 22px;
  color: rgba(103, 99, 87, 0.42);
}

.sone-tree .doc-sidebar-row-icon {
  flex-basis: 20px;
  width: 20px;
  height: 20px;
  z-index: 3;
}

.sone-tree .doc-sidebar-row-icon--placeholder {
  visibility: hidden;
}

.sone-tree .sidebar-tree-rows__row.document .doc-sidebar-row-icon {
  flex-basis: 20px;
  width: 20px;
  height: 20px;
  opacity: 1;
}

.sone-tree .doc-sidebar-row-label {
  z-index: 3;
}

@media (prefers-reduced-motion: reduce) {
  .sone-tree .sidebar-tree-rows__group-link {
    animation: none;
  }

  .sone-tree .sone-tree-pending-indicator {
    animation: none;
  }
}

.line-icon {
  width: 16px;
  height: 16px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.sidebar-tree-rows__row-menu {
  min-width: 184px;
  border: 1px solid var(--langhuan-menu-border, rgba(226, 218, 205, 0.62));
  border-radius: 0;
  background: rgba(255, 254, 250, 0.97);
  background-color: rgba(255, 254, 250, 0.97);
  box-shadow: var(--langhuan-menu-shadow, 0 3px 10px rgba(56, 46, 38, 0.08));
  box-sizing: border-box;
  overflow: visible;
}

.sidebar-tree-rows__row-menu-entry {
  position: relative;
}

.sidebar-tree-rows__row-menu-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  width: 100%;
  border: none;
  background: transparent;
  color: #2f2b26;
  text-align: left;
  padding: 8px 14px;
  font-size: 0.8rem;
  line-height: 1.2;
  cursor: pointer;
}

.sidebar-tree-rows__row-menu-item:hover {
  background: rgba(142, 132, 111, 0.07);
}

.sidebar-tree-rows__row-menu-item--submenu-open {
  background: rgba(142, 132, 111, 0.07);
}

.sidebar-tree-rows__row-menu-item:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.sidebar-tree-rows__row-menu-item--muted {
  color: #b9b0a5;
}

.sidebar-tree-rows__row-menu-item--danger {
  color: #c94e48;
}

.sidebar-tree-rows__row-menu-divider {
  height: 1px;
  margin: 4px 0;
  background: rgba(226, 218, 205, 0.82);
}

.sidebar-tree-rows__row-menu-shortcut {
  flex: 0 0 auto;
  font-size: 0.72rem;
  color: #b0a79b;
}

.sidebar-tree-rows__row-menu-arrow {
  flex: 0 0 auto;
  color: #8e877d;
  font-size: 1rem;
  line-height: 1;
}

.sidebar-tree-rows__row-submenu {
  position: absolute;
  top: 0;
  left: calc(100% + 1px);
  z-index: 2;
  width: 100%;
  min-width: 210px;
  border: 1px solid var(--langhuan-menu-border, rgba(226, 218, 205, 0.62));
  border-radius: 0;
  background: rgba(255, 254, 250, 0.97);
  background-color: rgba(255, 254, 250, 0.97);
  box-shadow: var(--langhuan-submenu-shadow, none);
  box-sizing: border-box;
  overflow: visible;
}

/* 夜间对比度分档(2026-07-12)：世界树文字色/连接线/描边环随全局 [data-theme="dark"] 拉高对比度(目标≈4.5~5:1)，保留橄榄绿分层，日间值不变；本块 scoped，:global() 内的属性选择器才能命中 <html data-theme> */
:global([data-theme="dark"] .sone-tree.sidebar-tree-rows){
  --sone-tree-line: rgba(196, 190, 180, 0.15);
}

:global([data-theme="dark"] .sone-tree .sidebar-tree-rows__row){
  color: #948f85;
}

:global([data-theme="dark"] .sone-tree .sidebar-tree-rows__row.active),
:global([data-theme="dark"] .sone-tree .sidebar-tree-rows__row.selected){
  color: #aab8a2;
}

:global([data-theme="dark"] .sone-tree .sidebar-tree-rows__row.folder){
  color: #9aa896;
}

:global([data-theme="dark"] .sone-tree .sidebar-tree-rows__row[data-depth='0']){
  color: #a7b3a0;
}

:global([data-theme="dark"] .sone-tree .sidebar-tree-rows__row.document){
  color: #9a958b;
}

:global([data-theme="dark"] .sone-tree .sidebar-tree-rows__row.document.active),
:global([data-theme="dark"] .sone-tree .sidebar-tree-rows__row.document.selected){
  color: #a8b29e;
}

:global([data-theme="dark"] .sone-tree .sidebar-tree-rows__row.folder.selected){
  color: #a8b29e;
}

:global([data-theme="dark"] .sone-tree .sone-tree-toggle-icon){
  color: rgba(150, 168, 150, 0.85);
}

:global([data-theme="dark"] .sone-tree-sticky-stack .sidebar-tree-rows__sticky-row .sone-tree-toggle-icon){
  color: rgba(150, 168, 150, 0.85);
}

:global([data-theme="dark"] .sone-tree .sone-tree-pending-indicator){
  box-shadow: 0 0 0 1px rgba(42, 40, 37, 0.8), 0 0 10px rgba(155, 108, 232, 0.46);
}

:global([data-theme="dark"] .sone-tree .sone-tree-compile-indicator){
  box-shadow: 0 0 0 1px rgba(42, 40, 37, 0.8);
}
</style>
