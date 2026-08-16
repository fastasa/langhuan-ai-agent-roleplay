<template>
  <div class="pixel-studio" :class="{ 'pixel-studio--adjusting': adjustmentDialogOpen, 'pixel-studio--transforming': !!transformState }" @contextmenu.prevent>
    <template v-if="viewMode === 'editor'">
      <MenuBar
        v-model:doc-name="doc.name"
        :dirty="dirty"
        :last-saved-label="lastSavedLabel"
        :can-undo="history.canUndo()"
        :can-redo="history.canRedo()"
        :save-label="saveButtonLabel"
        :save-disabled="saveState === 'saving'"
        :show-grid="showGrid"
        :show-checkerboard="showCheckerboard"
        :show-navigator="showNavigator"
        :keymap="keymap"
        :interaction-locked="adjustmentDialogOpen || !!transformState"
        @name-change="markDirty"
        @file-new="openNewDocDialog"
        @file-open="openProjectLibrary"
        @file-import="openImportDialog"
        @file-export="openExportDialog"
        @file-save="saveDoc"
        @edit-undo="undo"
        @edit-redo="redo"
        @open-color-adjust="openColorAdjust"
        @open-pixel-cleanup="openPixelCleanup"
        @view-toggle-grid="toggleGrid"
        @view-toggle-checkerboard="toggleCheckerboard"
        @view-toggle-navigator="toggleNavigator"
        @view-fit="fitWindow"
        @view-actual-size="actualSize"
        @view-zoom-in="zoomStepIn"
        @view-zoom-out="zoomStepOut"
        @open-settings="showSettings = true"
        @open-library="openProjectLibrary"
      >
        <template #tool-context>
          <ToolContextBar
            v-if="effectiveTool === 'brush' || effectiveTool === 'eraser' || effectiveTool === 'rect' || effectiveTool === 'ellipse'"
            :tool="effectiveTool"
            :brush-size="brushSize"
            :shape-filled="shapeFilled"
            :keymap="keymap"
            @update:brush-size="brushSize = $event"
            @update:shape-filled="shapeFilled = $event"
          />
        </template>
      </MenuBar>

      <div class="pixel-studio__body">
        <ToolRail
          :tool="effectiveTool"
          :has-selection="!!selection"
          :current-color="currentColor"
          :current-hex="currentPaintHex"
          :palette="activeLayer.palette"
          :keymap="keymap"
          @update:tool="selectTool"
        />

        <main class="pixel-studio__canvas-area">
          <CanvasBoard
            ref="canvasBoardRef"
            :doc="displayDoc"
            :frame-index="currentFrameIndex"
            :tool="effectiveTool"
            :brush-size="brushSize"
            :shape-filled="shapeFilled"
            :current-color="currentColor"
            :current-hex="currentPaintHex"
            :highlight-code="highlightCode"
            :selection="selection"
            :transform-bounds="transformBounds"
            :render-version="renderVersion"
            :show-grid="showGrid"
            :show-checkerboard="showCheckerboard"
            :space-pan-held="spacePanHeld"
            :active-layer-id="activeLayerId"
            :solo-layer="soloMode"
            :read-only="adjustmentDialogOpen || !!transformState"
            @stroke-start="onStrokeStart"
            @paint-cells="onPaintCells"
            @commit-shape="onCommitShape"
            @bucket-fill="onBucketFill"
            @stroke-end="onStrokeEnd"
            @eyedrop="onEyedrop"
            @selection-change="onSelectionChange"
            @selection-action="onSelectionAction"
            @selection-adjust="onSelectionAdjust"
            @move-start="onMoveStart"
            @move-preview="onMovePreview"
            @move-end="onMoveEnd"
            @transform-preview="onTransformPreview"
            @viewport-change="onViewportChange"
            @cursor-cell="onCursorCell"
          />
          <PixelNavigator
            v-if="showNavigator"
            :doc="displayDoc"
            :frame-index="currentFrameIndex"
            :render-version="layerPreviewVersion"
            :viewport="viewportState"
            :solo-layer-id="soloMode ? activeLayerId : null"
            @close="setNavigatorVisible(false)"
            @navigate="navigateFromThumbnail"
          />
        </main>

        <PixelResizeHandle class="pixel-studio__side-resizer" axis="vertical" @resize="resizeSidebar" @resize-end="savePanelLayout" />

        <aside ref="sideRef" class="pixel-studio__side" :style="{ width: `${panelLayout.sidebarWidth}px` }">
          <PalettePanel
            class="pixel-studio__palette"
            :palette="activeLayer.palette"
            :current-color="currentColor"
            :current-hex="currentPaintHex"
            :stats="stats"
            :highlight-code="highlightCode"
            :color-board-height="panelLayout.colorBoardHeight"
            @select-color="selectPaletteColor"
            @pick-color="selectPaintHex"
            @update-color="onUpdateColor"
            @remove-color="onReplaceColor"
            @replace-color-hex="onReplaceColorWithHex"
            @adjust-colors="onAdjustPaletteColors"
            @average-colors="onAveragePaletteColors"
            @update:highlight-code="highlightCode = $event"
            @resize-color-board="resizeColorBoard"
            @resize-end="savePanelLayout"
          />
          <PixelResizeHandle class="pixel-studio__layer-resizer" axis="horizontal" @resize="resizeLayer" @resize-end="savePanelLayout" />
          <LayerPanel
            :style="{ height: `${panelLayout.layerHeight}px` }"
            :layers="currentFrame.layers"
            :active-layer-id="activeLayerId"
            :selected-layer-ids="[...selectedLayerIds]"
            :solo-mode="soloMode"
            :doc-width="doc.width"
            :doc-height="doc.height"
            :render-version="layerPreviewVersion"
            @select="selectLayer"
            @add="addLayer"
            @remove="removeActiveLayer"
            @remove-layer="removeLayer"
            @rename-layer="renameLayer"
            @reorder-layer="reorderLayer"
            @toggle-visible="toggleLayerVisibility"
            @update:solo-mode="soloMode = $event; bumpRender()"
          />
        </aside>
      </div>

      <TimelineDock
        :doc="doc"
        :current-frame-index="currentFrameIndex"
        :playhead-frame="playheadFrame"
        :playing="playing"
        @create-timeline="showNewTimeline = true"
        @toggle-play="togglePlayback"
        @toggle-loop="togglePlaybackLoop"
        @previous-frame="selectAdjacentFrame('previous')"
        @next-frame="selectAdjacentFrame('next')"
        @add-frame="addBlankFrame"
        @duplicate-frame="duplicateCurrentFrame"
        @delete-frame="deleteCurrentFrame"
        @select-frame="selectTimelineFrame"
        @reorder-frame="reorderFrame"
        @resize-exposure="resizeFrameExposure"
        @set-boundary="moveTimelineBoundary"
        @edit-start="startTimelineContinuousEdit"
        @edit-end="finishTimelineContinuousEdit"
      />

      <StatusBar :cursor="cursorInfo" :doc-width="doc.width" :doc-height="doc.height" :zoom-label="zoomLabel" />
    </template>

    <ProjectLibrary v-else :docs="docsList" :loading="docsLoading" @open="onOpenDoc" @new="openNewDocDialog" @delete="onDeleteDoc" />

    <NewDocDialog v-if="showNewDoc" @close="showNewDoc = false" @confirm="confirmNewDoc" />
    <ImportDialog v-if="showImport" @close="showImport = false" @confirm="confirmImport" />
    <ExportDialog
      v-if="showExport"
      :doc-width="doc.width"
      :doc-height="doc.height"
      :has-timeline="!!doc.timeline"
      :total-timeline-frames="doc.timeline ? doc.timeline.rangeEndFrame - doc.timeline.rangeStartFrame + 1 : 1"
      :publish-targets="publishTargets"
      :publish-target-label="publishTargetLabel"
      :publish-action-label="publishActionLabel"
      :busy="publishing"
      :error="publishError"
      @close="showExport = false"
      @confirm="exportPng"
    />
    <SettingsDialog v-if="showSettings" :keymap="keymap" :temporary-tool="temporaryTool" @close="showSettings = false" @save="onSettingsSave" />
    <NewTimelineDialog v-if="showNewTimeline" @close="showNewTimeline = false" @confirm="confirmNewTimeline" />
    <ColorAdjustDialog
      v-if="showColorAdjust"
      :has-selection="!!selection"
      :selected-layer-count="selectedLayerIds.size"
      :error="colorAdjustError"
      @close="closeColorAdjust"
      @preview="onColorAdjustPreview"
      @confirm="confirmColorAdjust"
    />
    <PixelCleanupDialog
      v-if="showPixelCleanup"
      :has-selection="!!selection"
      :selected-layer-count="selectedLayerIds.size"
      :error="pixelCleanupError"
      :report="pixelCleanupReport"
      :palette="activeLayer.palette"
      :used-codes="stats.map((entry) => entry.code).filter((code) => code !== TRANSPARENT_CODE)"
      @close="closePixelCleanup"
      @preview="onPixelCleanupPreview"
      @confirm="confirmPixelCleanup"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { CellPos, ColorStatEntry, PixelCleanupOptions, PixelCleanupReport, PixelCode, PixelDocument, PixelLayer, PixelPalette } from '../core'
import { TRANSPARENT_CODE, addBlankTimelineFrame, addColor, adjustHexHsv, adjustLayerColors, averageHexHsv, cleanupLayerPixels, cloneDocument, colorStatsFromLayers, createHistory, createLayer, createTimeline, deleteTimelineFrame, duplicateTimelineFrame, frameIndexAtTimelineFrame, getCell, getFrame, getLayer, removeColor, reorderTimelineFrame, resizeTimelineFrameExposure, setCells, setTimelineRangeBoundary, timelineFrameStart, type HsvAdjustment } from '../core'
import { computeExportPixelSize, createSeededDocument, firstPaletteCode, isEditableTarget } from './pixelUiUtils'
import { drawGridToCanvas } from './pixelRender'
import type { PixelClipboard, PixelRect, PixelToolKind, PixelViewportState, SelectionMask } from './uiTypes'
import { applyGridToLayer, collectFloodFillCells, copySelectionPixels, createFullSelection, deleteSelectionPixels, getSelectionBounds, growSelection, invertSelection, moveLayerPixels, pasteClipboardPixels, shrinkSelection, transformSelectionPixels } from './selection'
import { type PixelApiError, type PixelDocSummary, createPixelDoc, deletePixelDoc, getPixelDoc, listPixelDocs, updatePixelDoc } from './pixelApi'
import { type KeymapState, type PixelActionId, chordFromEvent, getEffectiveChord, loadKeymap, matchAction, saveKeymap } from './keymap'
import { isBrowserShortcutChord } from './browserShortcutGuard'
import { formatZoomPercent } from './viewport'
import CanvasBoard from './CanvasBoard.vue'
import ToolRail from './ToolRail.vue'
import PalettePanel from './PalettePanel.vue'
import ImportDialog from './ImportDialog.vue'
import ProjectLibrary from './ProjectLibrary.vue'
import NewDocDialog from './NewDocDialog.vue'
import ExportDialog from './ExportDialog.vue'
import SettingsDialog from './SettingsDialog.vue'
import MenuBar from './MenuBar.vue'
import ToolContextBar from './ToolContextBar.vue'
import StatusBar from './StatusBar.vue'
import LayerPanel from './LayerPanel.vue'
import PixelResizeHandle from './PixelResizeHandle.vue'
import ColorAdjustDialog from './ColorAdjustDialog.vue'
import PixelCleanupDialog from './PixelCleanupDialog.vue'
import PixelNavigator from './PixelNavigator.vue'
import TimelineDock from './TimelineDock.vue'
import NewTimelineDialog from './NewTimelineDialog.vue'
import { clampSidebarWidth, clampVerticalLayout, parsePanelLayout, type PixelPanelLayout } from './panelLayout'

export interface PixelSnapshotPublishTarget { id: string; label: string }
const props = withDefaults(defineProps<{
  publishTargets?: PixelSnapshotPublishTarget[]
  publishTargetLabel?: string
  publishActionLabel?: string
  onPublishSnapshot?: (payload: { targetId: string; blob: Blob; fileName: string; source: Record<string, unknown> }) => Promise<void>
}>(), {
  publishTargets: () => [],
  publishTargetLabel: '发布位置',
  publishActionLabel: '发布快照'
})

// 页面初始默认文档与 NewDocDialog 新建流程共用 createSeededDocument：调色板播种基础色，避免默认透明色作画不可见
const initialDoc = createSeededDocument({ name: '未命名', width: 64, height: 64 })
const doc = ref<PixelDocument>(initialDoc)
const docId = ref<string | null>(null)
const history = createHistory()
const dirty = ref(false)
const renderVersion = ref(0)
const canvasBoardRef = ref<InstanceType<typeof CanvasBoard> | null>(null)

const PANEL_LAYOUT_STORAGE_KEY = 'pixel-studio:panel-layout'
const panelLayout = ref<PixelPanelLayout>(parsePanelLayout(window.localStorage.getItem(PANEL_LAYOUT_STORAGE_KEY)))
const sideRef = ref<HTMLElement | null>(null)
let sideResizeObserver: ResizeObserver | null = null
let sideHeight = 720

function clampPanelLayout(layout: PixelPanelLayout): PixelPanelLayout {
  const vertical = clampVerticalLayout(layout, sideHeight)
  return { ...vertical, sidebarWidth: clampSidebarWidth(vertical.sidebarWidth, window.innerWidth) }
}
panelLayout.value = clampPanelLayout(panelLayout.value)

function resizeSidebar(delta: number) {
  panelLayout.value = clampPanelLayout({ ...panelLayout.value, sidebarWidth: panelLayout.value.sidebarWidth - delta })
}
function resizeColorBoard(delta: number) {
  panelLayout.value = clampPanelLayout({ ...panelLayout.value, colorBoardHeight: panelLayout.value.colorBoardHeight + delta })
}
function resizeLayer(delta: number) {
  panelLayout.value = clampPanelLayout({ ...panelLayout.value, layerHeight: panelLayout.value.layerHeight - delta })
}
function savePanelLayout() {
  window.localStorage.setItem(PANEL_LAYOUT_STORAGE_KEY, JSON.stringify(panelLayout.value))
}
function observeSideSize() {
  sideResizeObserver?.disconnect()
  const el = sideRef.value
  if (!el || typeof ResizeObserver === 'undefined') return
  sideResizeObserver = new ResizeObserver(() => {
    sideHeight = el.getBoundingClientRect().height || sideHeight
    panelLayout.value = clampPanelLayout(panelLayout.value)
  })
  sideResizeObserver.observe(el)
}
function onWindowResize() {
  panelLayout.value = clampPanelLayout(panelLayout.value)
}

// 页面视图状态机：'editor'=画布编辑器 'library'=项目库（全屏文档管理，取代旧 DocListDialog）
// 默认先给 'editor'（多数场景/单测同步可见），若挂载后发现已有保存过的文档才切到 'library'
const viewMode = ref<'editor' | 'library'>('editor')
// viewMode 写入单点入口：所有切换视图的地方都走这里，不再各处直接赋值 viewMode.value
function setViewMode(mode: 'editor' | 'library') {
  viewMode.value = mode
}
watch(viewMode, (mode) => {
  if (mode === 'editor') nextTick(observeSideSize)
  else sideResizeObserver?.disconnect()
})
// 语义化只读视图：编辑器相关全局快捷键（工具切换/撤销重做/保存等）是否应当生效
const editorShortcutsActive = computed(() => viewMode.value === 'editor')

const tool = ref<PixelToolKind>('select')
const TEMPORARY_TOOL_STORAGE_KEY = 'pixel-studio:temporary-tool'
const PIXEL_TOOL_KINDS = new Set<PixelToolKind>(['select', 'marquee', 'lasso', 'brush', 'eraser', 'bucket', 'line', 'rect', 'ellipse', 'eyedropper', 'zoom'])
const storedTemporaryTool = window.localStorage.getItem(TEMPORARY_TOOL_STORAGE_KEY) as PixelToolKind | null
const temporaryTool = ref<PixelToolKind>(storedTemporaryTool && PIXEL_TOOL_KINDS.has(storedTemporaryTool) ? storedTemporaryTool : 'eyedropper')
const temporaryToolHeld = ref(false)
const effectiveTool = computed<PixelToolKind>(() => temporaryToolHeld.value ? temporaryTool.value : tool.value)
const brushSize = ref(1)
const shapeFilled = ref(false)
const initialLayer = getFrame(initialDoc).layers[getFrame(initialDoc).layers.length - 1]
const initialColorCode = firstPaletteCode(initialLayer.palette)
const currentColor = ref<PixelCode | null>(initialColorCode ?? TRANSPARENT_CODE)
// 当前绘画色是 UI 草稿真值：取色器滑动只改这里；直到真实落格才会在 palette 中物化短码。
const currentPaintHex = ref<string | null>(initialColorCode ? initialLayer.palette[initialColorCode].hex : null)
const currentFrameIndex = ref(0)
const currentFrame = computed(() => getFrame(doc.value, currentFrameIndex.value))
const playheadFrame = ref(1)
const playing = ref(false)
const activeLayerId = ref(currentFrame.value.layers[currentFrame.value.layers.length - 1].id)
const selectedLayerIds = ref<Set<string>>(new Set([activeLayerId.value]))
const layerSelectionAnchorId = ref(activeLayerId.value)
const soloMode = ref(false)
const activeLayer = computed(() => getLayer(currentFrame.value, activeLayerId.value))
const selectedLayers = computed(() => currentFrame.value.layers.filter((layer) => selectedLayerIds.value.has(layer.id)))
const selection = ref<SelectionMask | null>(null)
let pixelClipboard: Array<{ pixels: PixelClipboard; palette: PixelPalette }> | null = null
const transformPreviewDoc = ref<PixelDocument | null>(null)
const transformState = ref<{
  sourceDoc: PixelDocument
  sourceGrids: Record<string, string[]>
  sourceSelection: SelectionMask
  layerIds: string[]
  target: PixelRect
  changed: boolean
  dirtyBefore: boolean
} | null>(null)
const transformBounds = computed(() => transformState.value?.target ?? null)
const highlightCode = ref<PixelCode | null>(null)
// X 互换用：记住最近一次的非透明色，从透明切回时能换回原色
const lastNonTransparentPaint = ref<{ code: PixelCode | null; hex: string } | null>(initialColorCode ? { code: initialColorCode, hex: initialLayer.palette[initialColorCode].hex } : null)

const showGrid = ref(true)
const showCheckerboard = ref(true)
const spacePanHeld = ref(false)
const cursorInfo = ref<{ x: number; y: number; code: PixelCode; hex: string | null } | null>(null)
const viewportZoom = ref(1)
const viewportState = ref<PixelViewportState>({ zoom: 1, panX: 0, panY: 0, viewportWidth: 0, viewportHeight: 0 })
const zoomLabel = computed(() => formatZoomPercent(viewportZoom.value))
const SHOW_NAVIGATOR_STORAGE_KEY = 'pixel-studio:show-navigator'
const showNavigator = ref(window.localStorage.getItem(SHOW_NAVIGATOR_STORAGE_KEY) === 'true')

const showNewDoc = ref(false)
const showImport = ref(false)
const showExport = ref(false)
const publishing = ref(false)
const publishError = ref('')
const showSettings = ref(false)
const showNewTimeline = ref(false)
const showColorAdjust = ref(false)
const colorAdjustPreviewDoc = ref<PixelDocument | null>(null)
const colorAdjustError = ref<string | null>(null)
const showPixelCleanup = ref(false)
const pixelCleanupPreviewDoc = ref<PixelDocument | null>(null)
const pixelCleanupError = ref<string | null>(null)
const pixelCleanupReport = ref<PixelCleanupReport | null>(null)
const displayDoc = computed(() => transformPreviewDoc.value ?? colorAdjustPreviewDoc.value ?? pixelCleanupPreviewDoc.value ?? doc.value)
const adjustmentDialogOpen = computed(() => showColorAdjust.value || showPixelCleanup.value)
const blockingDialogOpen = computed(() => showNewDoc.value || showImport.value || showExport.value || showSettings.value || showNewTimeline.value)
const docsList = ref<PixelDocSummary[]>([])
const docsLoading = ref(false)

const saveState = ref<'idle' | 'saving' | 'saved' | 'error'>('idle')
const lastSavedAt = ref<Date | null>(null)
const saveButtonLabel = computed(() => {
  if (saveState.value === 'saving') return '保存中…'
  if (saveState.value === 'saved') return '已保存'
  if (saveState.value === 'error') return '保存失败，重试'
  return dirty.value ? '保存*' : '保存'
})
const lastSavedLabel = computed(() => {
  if (!lastSavedAt.value) return '未保存'
  return `上次保存 ${lastSavedAt.value.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`
})

// ---- 快捷键：单一动作注册表 + 键位映射，见 keymap.ts；本页只负责加载/持久化/分发 ----
const keymap = ref<KeymapState>(loadKeymap(window.localStorage))
function onSettingsSave(next: KeymapState, nextTemporaryTool: PixelToolKind) {
  keymap.value = next
  saveKeymap(next, window.localStorage)
  temporaryTool.value = nextTemporaryTool
  window.localStorage.setItem(TEMPORARY_TOOL_STORAGE_KEY, nextTemporaryTool)
  showSettings.value = false
}

function openColorAdjust() {
  closePixelCleanup()
  colorAdjustError.value = null
  colorAdjustPreviewDoc.value = null
  showColorAdjust.value = true
}
function closeColorAdjust() {
  showColorAdjust.value = false
  colorAdjustPreviewDoc.value = null
  colorAdjustError.value = null
}
function buildColorAdjustment(adjustment: HsvAdjustment) {
  let nextDoc = doc.value
  let changedCellCount = 0
  for (const layer of selectedLayers.value) {
    const result = adjustLayerColors(nextDoc, layer.id, selection.value, adjustment, currentFrameIndex.value)
    nextDoc = result.doc
    changedCellCount += result.changedCellCount
  }
  return { doc: nextDoc, changedCellCount }
}
function onColorAdjustPreview(adjustment: HsvAdjustment, enabled: boolean) {
  colorAdjustError.value = null
  colorAdjustPreviewDoc.value = null
  if (!enabled) return
  try {
    colorAdjustPreviewDoc.value = buildColorAdjustment(adjustment).doc
  } catch (error) {
    colorAdjustError.value = error instanceof Error ? error.message : '无法生成调色预览'
  }
}
function confirmColorAdjust(adjustment: HsvAdjustment) {
  try {
    const result = buildColorAdjustment(adjustment)
    if (result.changedCellCount > 0) {
      pushHistory()
      doc.value = result.doc
      markDirty()
      bumpRender()
      refreshStatsNow()
    }
    colorAdjustPreviewDoc.value = null
    colorAdjustError.value = null
  } catch (error) {
    colorAdjustError.value = error instanceof Error ? error.message : '无法应用调色'
  }
}

function openPixelCleanup() {
  closeColorAdjust()
  pixelCleanupError.value = null
  pixelCleanupPreviewDoc.value = null
  pixelCleanupReport.value = null
  showPixelCleanup.value = true
}
function closePixelCleanup() {
  showPixelCleanup.value = false
  pixelCleanupPreviewDoc.value = null
  pixelCleanupError.value = null
  pixelCleanupReport.value = null
}
function buildPixelCleanup(options: PixelCleanupOptions) {
  let nextDoc = doc.value
  const protectedHexes = new Set(
    (options.protectedCodes ?? []).flatMap((code) => activeLayer.value.palette[code]?.hex.toLowerCase() ?? [])
  )
  const report: PixelCleanupReport = {
    changedCellCount: 0,
    usedColorCountBefore: 0,
    usedColorCountAfter: 0,
    mergedColorCount: 0,
    removedSpeckleCellCount: 0,
    processedLineCellCount: 0
  }
  for (const layer of selectedLayers.value) {
    const targetProtectedCodes = Object.keys(layer.palette).filter((code) => protectedHexes.has(layer.palette[code].hex.toLowerCase()))
    const result = cleanupLayerPixels(nextDoc, layer.id, selection.value, { ...options, protectedCodes: targetProtectedCodes }, currentFrameIndex.value)
    nextDoc = result.doc
    for (const key of Object.keys(report) as Array<keyof PixelCleanupReport>) report[key] += result.report[key]
  }
  return { doc: nextDoc, report }
}
function onPixelCleanupPreview(options: PixelCleanupOptions, enabled: boolean) {
  pixelCleanupError.value = null
  pixelCleanupPreviewDoc.value = null
  try {
    const result = buildPixelCleanup(options)
    pixelCleanupReport.value = result.report
    if (enabled) pixelCleanupPreviewDoc.value = result.doc
  } catch (error) {
    pixelCleanupReport.value = null
    pixelCleanupError.value = error instanceof Error ? error.message : '无法生成净化预览'
  }
}
function confirmPixelCleanup(options: PixelCleanupOptions) {
  try {
    const result = buildPixelCleanup(options)
    if (result.report.changedCellCount > 0) {
      pushHistory()
      doc.value = result.doc
      markDirty()
      bumpRender()
      refreshStatsNow()
    }
    pixelCleanupPreviewDoc.value = null
    pixelCleanupReport.value = result.report
    pixelCleanupError.value = null
  } catch (error) {
    pixelCleanupError.value = error instanceof Error ? error.message : '无法应用像素净化'
  }
}

// 色彩统计：编辑类高频操作（画笔/形状/新增改色）走 300ms 防抖刷新，避免每格都重算；
// 打开文档/撤销重做/删除合并颜色等低频结构性操作立即刷新，不等防抖。
const stats = ref<ColorStatEntry[]>(colorStatsFromLayers([activeLayer.value]))
const layerPreviewVersion = ref(0)
let statsDebounceTimer: ReturnType<typeof setTimeout> | null = null
function scheduleStatsUpdate() {
  if (statsDebounceTimer) clearTimeout(statsDebounceTimer)
  statsDebounceTimer = setTimeout(() => {
    statsDebounceTimer = null
    stats.value = colorStatsFromLayers([activeLayer.value])
    layerPreviewVersion.value++
  }, 300)
}
function refreshStatsNow() {
  if (statsDebounceTimer) {
    clearTimeout(statsDebounceTimer)
    statsDebounceTimer = null
  }
  stats.value = colorStatsFromLayers([activeLayer.value])
  layerPreviewVersion.value++
}

function bumpRender() {
  renderVersion.value++
}
function markDirty() {
  dirty.value = true
}
function pushHistory() {
  history.push(doc.value)
}

function selectPaletteColor(code: PixelCode) {
  if (code === TRANSPARENT_CODE) {
    currentColor.value = TRANSPARENT_CODE
    currentPaintHex.value = null
    return
  }
  const color = activeLayer.value.palette[code]
  if (!color) return
  currentColor.value = code
  currentPaintHex.value = color.hex
  lastNonTransparentPaint.value = { code, hex: color.hex }
}

function selectPaintHex(hex: string) {
  const lower = hex.toLowerCase()
  const existing = Object.keys(activeLayer.value.palette).find((code) => activeLayer.value.palette[code].hex.toLowerCase() === lower) ?? null
  currentColor.value = existing
  currentPaintHex.value = lower
  lastNonTransparentPaint.value = { code: existing, hex: lower }
}

function syncPaintCodeToActiveLayer() {
  if (currentPaintHex.value === null) {
    currentColor.value = TRANSPARENT_CODE
    return
  }
  const code = Object.keys(activeLayer.value.palette).find((item) => activeLayer.value.palette[item].hex.toLowerCase() === currentPaintHex.value?.toLowerCase()) ?? null
  currentColor.value = code
  lastNonTransparentPaint.value = { code, hex: currentPaintHex.value }
}

/** 调色板短码只在颜色真正落格时创建；调用方必须已经为本次编辑 pushHistory。 */
function materializeCurrentPaintCode(layer: PixelLayer): PixelCode {
  if (currentPaintHex.value === null) return TRANSPARENT_CODE
  const code = Object.keys(layer.palette).find((item) => layer.palette[item].hex.toLowerCase() === currentPaintHex.value?.toLowerCase())
    ?? addColor(layer.palette, currentPaintHex.value.toLowerCase())
  if (layer.id === activeLayerId.value) {
    currentColor.value = code
    lastNonTransparentPaint.value = { code, hex: currentPaintHex.value }
  }
  return code
}

function activePaintCode(layer: PixelLayer): PixelCode {
  return effectiveTool.value === 'eraser' ? TRANSPARENT_CODE : materializeCurrentPaintCode(layer)
}

// ---- 画布事件 ----
function onStrokeStart() {
  pushHistory()
}
function onPaintCells(cells: CellPos[], _code: PixelCode) {
  for (const layer of selectedLayers.value) setCells(layer, doc.value.width, cells, activePaintCode(layer))
  markDirty()
  // 增量快路径：画笔逐格拖动高频触发，只补丁改动的格子，不整屏重扫
  canvasBoardRef.value?.applyCellPatch(cells)
  scheduleStatsUpdate()
}
function onCommitShape(cells: CellPos[], _code: PixelCode) {
  pushHistory()
  for (const layer of selectedLayers.value) setCells(layer, doc.value.width, cells, activePaintCode(layer))
  markDirty()
  canvasBoardRef.value?.applyCellPatch(cells)
  scheduleStatsUpdate()
}
// 一次描边结束（stroke-end）即时结算统计，不再等 300ms 防抖；拖动过程中的中间态仍走防抖，只有终态提速
function onStrokeEnd() {
  refreshStatsNow()
}
function onEyedrop(sample: { code: PixelCode; hex: string | null }) {
  if (sample.hex) selectPaintHex(sample.hex)
  else selectPaletteColor(TRANSPARENT_CODE)
}
function onSelectionChange(sel: SelectionMask | null) {
  selection.value = sel
}
function onSelectionAdjust(mode: 'grow' | 'shrink', amount: number) {
  if (!selection.value) return
  selection.value = mode === 'grow'
    ? growSelection(selection.value, amount)
    : shrinkSelection(selection.value, amount)
}
function onSelectionAction(action: 'clear' | 'invert' | 'delete-inside' | 'delete-outside' | 'fill') {
  if (!selection.value) return
  if (action === 'clear') {
    selection.value = null
  } else if (action === 'invert') {
    selection.value = invertSelection(selection.value)
  } else if (action === 'delete-inside') {
    deleteSelectedPixels()
  } else if (action === 'delete-outside') {
    const outside = invertSelection(selection.value)
    if (outside) deletePixelsInMask(outside)
  } else {
    fillSelectedPixels()
  }
}
function onBucketFill(cell: CellPos) {
  const selectionCells = selection.value
    ? [...selection.value.cells].map((index) => ({ x: index % doc.value.width, y: Math.floor(index / doc.value.width) }))
    : null
  const targets = selectedLayers.value.map((layer) => ({
    layer,
    cells: selectionCells ?? collectFloodFillCells(layer.grid, doc.value.width, doc.value.height, cell.x, cell.y),
    existingCode: currentPaintHex.value === null
      ? TRANSPARENT_CODE
      : Object.keys(layer.palette).find((code) => layer.palette[code].hex.toLowerCase() === currentPaintHex.value?.toLowerCase())
  })).filter((target) => target.cells.length > 0 && (!target.existingCode || target.cells.some(({ x, y }) => getCell(target.layer, doc.value.width, x, y) !== target.existingCode)))
  if (targets.length === 0) return
  pushHistory()
  const changedCells = new Map<string, CellPos>()
  for (const target of targets) {
    const code = target.existingCode ?? materializeCurrentPaintCode(target.layer)
    setCells(target.layer, doc.value.width, target.cells, code)
    for (const item of target.cells) changedCells.set(`${item.x},${item.y}`, item)
  }
  markDirty()
  canvasBoardRef.value?.applyCellPatch([...changedCells.values()])
  refreshStatsNow()
}

let moveSource: { doc: PixelDocument; grids: Record<string, string[]>; selection: SelectionMask | null; changed: boolean; dirtyBefore: boolean } | null = null
function onMoveStart() {
  moveSource = {
    doc: cloneDocument(doc.value),
    grids: Object.fromEntries(selectedLayers.value.map((layer) => [layer.id, [...layer.grid]])),
    selection: selection.value ? { ...selection.value, cells: new Set(selection.value.cells) } : null,
    changed: false,
    dirtyBefore: dirty.value
  }
}
function onMovePreview(dx: number, dy: number) {
  if (!moveSource) return
  let nextSelection = moveSource.selection
  let changed = false
  for (const layer of selectedLayers.value) {
    const sourceGrid = moveSource.grids[layer.id]
    if (!sourceGrid) continue
    const result = moveLayerPixels(sourceGrid, doc.value.width, doc.value.height, moveSource.selection, dx, dy)
    applyGridToLayer(layer, result.grid)
    nextSelection = result.selection
    if (result.grid.some((row, index) => row !== sourceGrid[index])) changed = true
  }
  selection.value = nextSelection
  moveSource.changed = changed
  dirty.value = moveSource.changed ? true : moveSource.dirtyBefore
  bumpRender()
  scheduleStatsUpdate()
}
function onMoveEnd() {
  if (moveSource?.changed) {
    history.push(moveSource.doc)
    refreshStatsNow()
  }
  moveSource = null
}

function cloneSelectionMask(mask: SelectionMask): SelectionMask {
  return { width: mask.width, height: mask.height, cells: new Set(mask.cells) }
}

function copySelectedPixels(): boolean {
  if (!selection.value) return false
  const copied = selectedLayers.value
    .map((layer) => ({ pixels: copySelectionPixels(layer.grid, selection.value), palette: { ...layer.palette } }))
    .filter((item): item is { pixels: PixelClipboard; palette: PixelPalette } => !!item.pixels)
  if (copied.length === 0 || copied.every((item) => item.pixels.cells.length === 0)) return false
  pixelClipboard = copied
  return true
}

function deletePixelsInMask(mask: SelectionMask): boolean {
  const results = selectedLayers.value.map((layer) => ({ layer, result: deleteSelectionPixels(layer.grid, mask) }))
  if (!results.some(({ result }) => result.changed)) return false
  pushHistory()
  for (const { layer, result } of results) if (result.changed) applyGridToLayer(layer, result.grid)
  markDirty()
  bumpRender()
  refreshStatsNow()
  return true
}

function deleteSelectedPixels(): boolean {
  return selection.value ? deletePixelsInMask(selection.value) : false
}

function fillSelectedPixels(): boolean {
  if (!selection.value || selection.value.cells.size === 0) return false
  const cells = [...selection.value.cells].map((index) => ({ x: index % doc.value.width, y: Math.floor(index / doc.value.width) }))
  const targets = selectedLayers.value.map((layer) => {
    const existingCode = currentPaintHex.value === null
      ? TRANSPARENT_CODE
      : Object.keys(layer.palette).find((code) => layer.palette[code].hex.toLowerCase() === currentPaintHex.value?.toLowerCase())
    const changed = !existingCode || cells.some(({ x, y }) => getCell(layer, doc.value.width, x, y) !== existingCode)
    return { layer, existingCode, changed }
  }).filter((target) => target.changed)
  if (targets.length === 0) return false

  pushHistory()
  for (const { layer, existingCode } of targets) {
    const code = existingCode ?? materializeCurrentPaintCode(layer)
    setCells(layer, doc.value.width, cells, code)
  }
  markDirty()
  canvasBoardRef.value?.applyCellPatch(cells)
  refreshStatsNow()
  return true
}

function cutSelectedPixels() {
  if (!copySelectedPixels()) return
  deleteSelectedPixels()
}

function pastePixels() {
  if (!pixelClipboard || pixelClipboard.length === 0) return
  const preview = cloneDocument(doc.value)
  const previewFrame = getFrame(preview, currentFrameIndex.value)
  const targets = selectedLayers.value.map((layer, index) => {
    const source = pixelClipboard?.length === 1 ? pixelClipboard[0] : pixelClipboard?.[index]
    if (!source) return null
    const targetLayer = getLayer(previewFrame, layer.id)
    const remapped: PixelClipboard = {
      ...source.pixels,
      cells: source.pixels.cells.flatMap((cell) => {
        const color = source.palette[cell.code]
        return color ? [{ ...cell, code: addColor(targetLayer.palette, color.hex, color.name) }] : []
      })
    }
    return { layer: targetLayer, result: pasteClipboardPixels(targetLayer.grid, preview.width, preview.height, remapped) }
  }).filter((item): item is { layer: PixelLayer; result: ReturnType<typeof pasteClipboardPixels> } => !!item)
  if (!targets.some(({ result }) => result.changed)) return
  history.push(doc.value)
  for (const { layer, result } of targets) if (result.changed) applyGridToLayer(layer, result.grid)
  doc.value = preview
  selection.value = targets.find(({ result }) => result.selection)?.result.selection ?? selection.value
  markDirty()
  bumpRender()
  refreshStatsNow()
}

function startFreeTransform() {
  if (!selection.value || transformState.value) return
  const bounds = getSelectionBounds(selection.value)
  const hasPixels = selectedLayers.value.some((layer) => (copySelectionPixels(layer.grid, selection.value)?.cells.length ?? 0) > 0)
  if (!bounds || !hasPixels) return
  const sourceSelection = cloneSelectionMask(selection.value)
  transformState.value = {
    sourceDoc: cloneDocument(doc.value),
    sourceGrids: Object.fromEntries(selectedLayers.value.map((layer) => [layer.id, [...layer.grid]])),
    sourceSelection,
    layerIds: selectedLayers.value.map((layer) => layer.id),
    target: bounds,
    changed: false,
    dirtyBefore: dirty.value
  }
  tool.value = 'select'
  onTransformPreview(bounds)
}

function onTransformPreview(target: PixelRect) {
  const state = transformState.value
  if (!state) return
  const preview = cloneDocument(state.sourceDoc)
  let nextSelection: SelectionMask | null = state.sourceSelection
  let changed = false
  for (const layerId of state.layerIds) {
    const sourceGrid = state.sourceGrids[layerId]
    if (!sourceGrid) continue
    const result = transformSelectionPixels(sourceGrid, doc.value.width, doc.value.height, state.sourceSelection, target)
    applyGridToLayer(getLayer(getFrame(preview, currentFrameIndex.value), layerId), result.grid)
    nextSelection = result.selection
    changed ||= result.changed
  }
  state.target = target
  state.changed = changed
  selection.value = nextSelection
  transformPreviewDoc.value = preview
}

function commitFreeTransform() {
  const state = transformState.value
  if (!state) return
  if (state.changed && transformPreviewDoc.value) {
    history.push(state.sourceDoc)
    doc.value = transformPreviewDoc.value
    dirty.value = true
    bumpRender()
    refreshStatsNow()
  } else {
    selection.value = cloneSelectionMask(state.sourceSelection)
    dirty.value = state.dirtyBefore
  }
  transformPreviewDoc.value = null
  transformState.value = null
}

function cancelFreeTransform() {
  const state = transformState.value
  if (!state) return
  selection.value = cloneSelectionMask(state.sourceSelection)
  dirty.value = state.dirtyBefore
  transformPreviewDoc.value = null
  transformState.value = null
}
function onViewportChange(state: PixelViewportState) {
  viewportState.value = state
  viewportZoom.value = state.zoom
}
function setNavigatorVisible(visible: boolean) {
  showNavigator.value = visible
  window.localStorage.setItem(SHOW_NAVIGATOR_STORAGE_KEY, String(visible))
}
function toggleNavigator() {
  setNavigatorVisible(!showNavigator.value)
}
function navigateFromThumbnail(point: { x: number; y: number }) {
  canvasBoardRef.value?.centerOnDocumentPoint(point.x, point.y)
}
function onCursorCell(info: { x: number; y: number; code: PixelCode; hex: string | null } | null) {
  cursorInfo.value = info
}

// ---- 调色盘事件 ----
// name 语义（2026-07-18 三轮优化批根治）：undefined=保留旧名（只改 hex 等场景不传 name）；
// 空字符串 ''=主动清空名字（PalettePanel 编辑名字清空时显式传 ''）。此前把两种情况都当"保留"处理，
// 导致用户清空名字后又被写回旧名，本次收敛为三态判断。
function onUpdateColor(code: PixelCode, hex: string, name?: string) {
  const prev = activeLayer.value.palette[code]
  if (!prev) return
  const nextName = name === undefined ? prev.name : name === '' ? undefined : name
  if (prev.hex.toLowerCase() === hex.toLowerCase() && prev.name === nextName) return
  const sourceHex = prev.hex.toLowerCase()
  const targets = selectedLayers.value.flatMap((layer) => {
    const targetCode = Object.keys(layer.palette).find((item) => layer.palette[item].hex.toLowerCase() === sourceHex)
    return targetCode ? [{ layer, code: targetCode }] : []
  })
  if (targets.length === 0) return
  pushHistory()
  for (const target of targets) target.layer.palette[target.code] = { ...target.layer.palette[target.code], hex, name: nextName }
  if (currentColor.value === code) {
    currentPaintHex.value = hex
    lastNonTransparentPaint.value = { code, hex }
  }
  markDirty()
  bumpRender()
  scheduleStatsUpdate()
}
// 删除颜色（PalettePanel）与合并颜色（StatsPanel）逐字同构，合一为一个函数。
// 调用前护栏对齐 core removeColor 的三种抛错条件：core 是最后防线，UI 必须保证永远不触发这些抛错。
function onReplaceColor(code: PixelCode, replaceWith: PixelCode) {
  const source = activeLayer.value.palette[code]
  if (!source) return
  if (code === replaceWith) return
  const replacementHex = replaceWith === TRANSPARENT_CODE ? null : activeLayer.value.palette[replaceWith]?.hex.toLowerCase()
  if (replaceWith !== TRANSPARENT_CODE && !replacementHex) return
  const sourceHex = source.hex.toLowerCase()
  if (replacementHex === sourceHex) return
  const targets = selectedLayers.value.flatMap((layer) => {
    const sourceCode = Object.keys(layer.palette).find((item) => layer.palette[item].hex.toLowerCase() === sourceHex)
    return sourceCode ? [{ layer, sourceCode }] : []
  })
  if (targets.length === 0) return
  pushHistory()
  for (const target of targets) {
    const targetCode = replacementHex === null ? TRANSPARENT_CODE : addColor(target.layer.palette, replacementHex)
    removeColor(target.layer, target.sourceCode, targetCode)
  }
  if (currentColor.value === code) selectPaletteColor(replaceWith)
  if (highlightCode.value === code) highlightCode.value = null
  markDirty()
  bumpRender()
  refreshStatsNow()
}

function onReplaceColorWithHex(code: PixelCode, hex: string) {
  if (!(code in activeLayer.value.palette)) return
  const lower = hex.toLowerCase()
  const existing = Object.keys(activeLayer.value.palette).find((item) => activeLayer.value.palette[item].hex.toLowerCase() === lower)
  if (existing) {
    onReplaceColor(code, existing)
    return
  }
  const sourceHex = activeLayer.value.palette[code].hex.toLowerCase()
  const targets = selectedLayers.value.flatMap((layer) => {
    const sourceCode = Object.keys(layer.palette).find((item) => layer.palette[item].hex.toLowerCase() === sourceHex)
    return sourceCode ? [{ layer, sourceCode }] : []
  })
  if (targets.length === 0) return
  pushHistory()
  let activeReplacement: PixelCode | null = null
  for (const target of targets) {
    const replacement = addColor(target.layer.palette, lower)
    removeColor(target.layer, target.sourceCode, replacement)
    if (target.layer.id === activeLayerId.value) activeReplacement = replacement
  }
  if (activeReplacement) selectPaletteColor(activeReplacement)
  if (highlightCode.value === code) highlightCode.value = null
  markDirty()
  bumpRender()
  refreshStatsNow()
}

function onAdjustPaletteColors(codes: PixelCode[], adjustment: HsvAdjustment) {
  const sourceHexes = codes.flatMap((code) => activeLayer.value.palette[code]?.hex.toLowerCase() ?? [])
  if (sourceHexes.length === 0) return
  pushHistory()
  for (const layer of selectedLayers.value) {
    for (const sourceHex of sourceHexes) {
      const targetCode = Object.keys(layer.palette).find((code) => layer.palette[code].hex.toLowerCase() === sourceHex)
      if (!targetCode) continue
      layer.palette[targetCode].hex = adjustHexHsv(layer.palette[targetCode].hex, adjustment)
      if (layer.id === activeLayerId.value && currentColor.value === targetCode) currentPaintHex.value = layer.palette[targetCode].hex
    }
  }
  markDirty()
  bumpRender()
  refreshStatsNow()
}

function onAveragePaletteColors(codes: PixelCode[]) {
  const sourceHexes = codes.flatMap((code) => activeLayer.value.palette[code]?.hex.toLowerCase() ?? [])
  if (sourceHexes.length < 2) return
  const averageHex = averageHexHsv(sourceHexes)
  pushHistory()
  let activeSurvivor: PixelCode | null = null
  for (const layer of selectedLayers.value) {
    const matches = sourceHexes.flatMap((sourceHex) => {
      const targetCode = Object.keys(layer.palette).find((code) => layer.palette[code].hex.toLowerCase() === sourceHex)
      return targetCode ? [targetCode] : []
    })
    if (matches.length === 0) continue
    const survivor = matches[0]
    layer.palette[survivor] = { ...layer.palette[survivor], hex: averageHex }
    for (const targetCode of matches.slice(1)) removeColor(layer, targetCode, survivor)
    if (layer.id === activeLayerId.value) activeSurvivor = survivor
  }
  if (activeSurvivor) selectPaletteColor(activeSurvivor)
  if (highlightCode.value && codes.includes(highlightCode.value) && highlightCode.value !== activeSurvivor) highlightCode.value = null
  markDirty()
  bumpRender()
  refreshStatsNow()
}

// ---- 图层：文档真值在 frame.layers；选层集合、主活动层与对照模式只属于当前编辑视图 ----
function selectLayer(id: string, mode: 'replace' | 'toggle' | 'range' = 'replace') {
  const layers = currentFrame.value.layers
  if (!layers.some((layer) => layer.id === id)) return
  const next = new Set(selectedLayerIds.value)
  if (mode === 'range') {
    const visualOrder = [...layers].reverse().map((layer) => layer.id)
    const anchorIndex = visualOrder.indexOf(layerSelectionAnchorId.value)
    const targetIndex = visualOrder.indexOf(id)
    next.clear()
    if (anchorIndex >= 0 && targetIndex >= 0) {
      for (const layerId of visualOrder.slice(Math.min(anchorIndex, targetIndex), Math.max(anchorIndex, targetIndex) + 1)) next.add(layerId)
    } else next.add(id)
  } else if (mode === 'toggle') {
    if (next.has(id) && next.size > 1) next.delete(id)
    else next.add(id)
    layerSelectionAnchorId.value = id
  } else {
    next.clear()
    next.add(id)
    layerSelectionAnchorId.value = id
  }
  selectedLayerIds.value = next
  activeLayerId.value = next.has(id) ? id : [...next][next.size - 1]
  syncPaintCodeToActiveLayer()
  refreshStatsNow()
  bumpRender()
}
function reconcileLayerSelection() {
  const layers = currentFrame.value.layers
  const validIds = new Set(layers.map((layer) => layer.id))
  let activeId = validIds.has(activeLayerId.value) ? activeLayerId.value : layers[layers.length - 1].id
  const next = new Set([...selectedLayerIds.value].filter((id) => validIds.has(id)))
  if (next.size === 0) next.add(activeId)
  if (!next.has(activeId)) activeId = [...next][next.size - 1]
  activeLayerId.value = activeId
  selectedLayerIds.value = next
  syncPaintCodeToActiveLayer()
  if (!validIds.has(layerSelectionAnchorId.value)) layerSelectionAnchorId.value = activeId
}
function addLayer() {
  if (currentFrame.value.layers.length >= 64) return
  pushHistory()
  const index = currentFrame.value.layers.findIndex((layer) => layer.id === activeLayerId.value)
  const id = `l-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`
  const layer = createLayer({ id, name: `图层 ${currentFrame.value.layers.length + 1}`, width: doc.value.width, height: doc.value.height })
  currentFrame.value.layers.splice(index + 1, 0, layer)
  activeLayerId.value = id
  selectedLayerIds.value = new Set([id])
  layerSelectionAnchorId.value = id
  markDirty()
  bumpRender()
  refreshStatsNow()
}
function removeActiveLayer() {
  removeLayer(activeLayerId.value)
}
function removeLayer(id: string) {
  const layers = currentFrame.value.layers
  if (layers.length <= 1) return
  const index = layers.findIndex((layer) => layer.id === id)
  if (index < 0) return
  pushHistory()
  layers.splice(index, 1)
  if (activeLayerId.value === id) activeLayerId.value = layers[Math.min(index, layers.length - 1)].id
  reconcileLayerSelection()
  markDirty()
  bumpRender()
  refreshStatsNow()
}
function renameLayer(id: string, name: string) {
  const layer = currentFrame.value.layers.find((item) => item.id === id)
  const nextName = name.trim()
  if (!layer || !nextName || layer.name === nextName) return
  pushHistory()
  layer.name = nextName
  markDirty()
}
function reorderLayer(sourceId: string, targetId: string) {
  if (sourceId === targetId) return
  const layers = currentFrame.value.layers
  const sourceIndex = layers.findIndex((layer) => layer.id === sourceId)
  const targetIndex = layers.findIndex((layer) => layer.id === targetId)
  if (sourceIndex < 0 || targetIndex < 0) return
  pushHistory()
  ;[layers[sourceIndex], layers[targetIndex]] = [layers[targetIndex], layers[sourceIndex]]
  markDirty()
  bumpRender()
}
function toggleLayerVisibility(id: string) {
  const layer = currentFrame.value.layers.find((item) => item.id === id)
  if (!layer) return
  pushHistory()
  layer.visible = !layer.visible
  markDirty()
  bumpRender()
}
function switchLayer(direction: 'previous' | 'next') {
  const layers = currentFrame.value.layers
  const index = layers.findIndex((layer) => layer.id === activeLayerId.value)
  if (index < 0) return
  // frame.layers 按下→上存储，图层面板反向显示；“上一个”因此走数组 +1，“下一个”走 -1。
  const offset = direction === 'previous' ? 1 : -1
  const nextIndex = Math.max(0, Math.min(layers.length - 1, index + offset))
  if (nextIndex !== index) selectLayer(layers[nextIndex].id, 'replace')
}

// ---- 二期时间轴：画帧与图层正交；时间轴切帧只重置编辑视图，不写文档 ----
function setCurrentFrame(index: number, nextPlayhead?: number) {
  const clamped = Math.max(0, Math.min(doc.value.frames.length - 1, index))
  if (currentFrameIndex.value !== clamped) {
    cancelFreeTransform()
    closeColorAdjust()
    closePixelCleanup()
    currentFrameIndex.value = clamped
    const layers = getFrame(doc.value, clamped).layers
    activeLayerId.value = layers[layers.length - 1].id
    selectedLayerIds.value = new Set([activeLayerId.value])
    layerSelectionAnchorId.value = activeLayerId.value
    selection.value = null
    highlightCode.value = null
    soloMode.value = false
    syncPaintCodeToActiveLayer()
    bumpRender()
    refreshStatsNow()
  }
  if (nextPlayhead !== undefined) playheadFrame.value = nextPlayhead
}

function selectTimelineFrame(index: number, timelineFrame: number) {
  stopPlayback()
  setCurrentFrame(index, timelineFrame)
}

function selectAdjacentFrame(direction: 'previous' | 'next') {
  if (!doc.value.timeline) return
  stopPlayback()
  const offset = direction === 'previous' ? -1 : 1
  const index = Math.max(0, Math.min(doc.value.frames.length - 1, currentFrameIndex.value + offset))
  setCurrentFrame(index, timelineFrameStart(doc.value, index))
}

function applyTimelineDocument(next: PixelDocument, nextIndex = currentFrameIndex.value) {
  doc.value = next
  currentFrameIndex.value = Math.max(0, Math.min(next.frames.length - 1, nextIndex))
  const frame = getFrame(next, currentFrameIndex.value)
  activeLayerId.value = frame.layers[frame.layers.length - 1].id
  selectedLayerIds.value = new Set([activeLayerId.value])
  layerSelectionAnchorId.value = activeLayerId.value
  selection.value = null
  highlightCode.value = null
  soloMode.value = false
  syncPaintCodeToActiveLayer()
  if (next.timeline) {
    playheadFrame.value = Math.max(next.timeline.rangeStartFrame, Math.min(next.timeline.rangeEndFrame, timelineFrameStart(next, currentFrameIndex.value)))
  } else playheadFrame.value = 1
  markDirty()
  bumpRender()
  refreshStatsNow()
}

function confirmNewTimeline(payload: { fps: number; totalFrames: number }) {
  try {
    const next = createTimeline(doc.value, payload.fps, payload.totalFrames)
    pushHistory()
    applyTimelineDocument(next, 0)
    showNewTimeline.value = false
  } catch (error) {
    window.alert(error instanceof Error ? error.message : '无法创建时间轴')
  }
}

function addBlankFrame() {
  if (!doc.value.timeline) return
  stopPlayback()
  try {
    const next = addBlankTimelineFrame(doc.value, currentFrameIndex.value)
    pushHistory()
    applyTimelineDocument(next, currentFrameIndex.value + 1)
  } catch (error) { window.alert(error instanceof Error ? error.message : '无法新增画帧') }
}

function duplicateCurrentFrame() {
  if (!doc.value.timeline) return
  stopPlayback()
  try {
    const next = duplicateTimelineFrame(doc.value, currentFrameIndex.value)
    pushHistory()
    applyTimelineDocument(next, currentFrameIndex.value + 1)
  } catch (error) { window.alert(error instanceof Error ? error.message : '无法复制画帧') }
}

function deleteCurrentFrame() {
  if (!doc.value.timeline || doc.value.frames.length <= 1) return
  stopPlayback()
  try {
    const next = deleteTimelineFrame(doc.value, currentFrameIndex.value)
    pushHistory()
    applyTimelineDocument(next, Math.max(0, currentFrameIndex.value - 1))
  } catch (error) { window.alert(error instanceof Error ? error.message : '无法删除画帧') }
}

function reorderFrame(sourceIndex: number, targetIndex: number) {
  if (!doc.value.timeline || sourceIndex === targetIndex) return
  stopPlayback()
  try {
    const next = reorderTimelineFrame(doc.value, sourceIndex, targetIndex)
    pushHistory()
    applyTimelineDocument(next, targetIndex)
  } catch (error) { window.alert(error instanceof Error ? error.message : '无法排序画帧') }
}

let timelineContinuousSnapshot: PixelDocument | null = null
function startTimelineContinuousEdit() {
  stopPlayback()
  timelineContinuousSnapshot = cloneDocument(doc.value)
}
function finishTimelineContinuousEdit() {
  if (!timelineContinuousSnapshot) return
  if (JSON.stringify(timelineContinuousSnapshot) !== JSON.stringify(doc.value)) {
    history.push(timelineContinuousSnapshot)
    markDirty()
  }
  timelineContinuousSnapshot = null
}
function resizeFrameExposure(index: number, exposureFrames: number) {
  if (!doc.value.timeline) return
  try {
    doc.value = resizeTimelineFrameExposure(doc.value, index, exposureFrames)
    const timeline = doc.value.timeline!
    playheadFrame.value = Math.max(timeline.rangeStartFrame, Math.min(timeline.rangeEndFrame, playheadFrame.value))
    bumpRender()
  } catch { /* 拖动越界时保持最后一个合法位置 */ }
}
function moveTimelineBoundary(edge: 'start' | 'end', frameNumber: number) {
  if (!doc.value.timeline) return
  try {
    doc.value = setTimelineRangeBoundary(doc.value, edge, frameNumber)
    const timeline = doc.value.timeline!
    playheadFrame.value = Math.max(timeline.rangeStartFrame, Math.min(timeline.rangeEndFrame, playheadFrame.value))
    setCurrentFrame(frameIndexAtTimelineFrame(doc.value, playheadFrame.value), playheadFrame.value)
  } catch { /* 拖动越界时保持最后一个合法位置 */ }
}
function togglePlaybackLoop() {
  pushHistory()
  doc.value.playback.loop = !doc.value.playback.loop
  markDirty()
}

let playbackRaf = 0
let playbackStartedAt = 0
let playbackStartFrame = 1
function stopPlayback() {
  playing.value = false
  if (playbackRaf) window.cancelAnimationFrame(playbackRaf)
  playbackRaf = 0
}
function playbackTick(now: number) {
  if (!playing.value || !doc.value.timeline) return
  const timeline = doc.value.timeline
  const elapsed = Math.floor((now - playbackStartedAt) * timeline.fps / 1000)
  let frameNumber = playbackStartFrame + elapsed
  if (frameNumber > timeline.rangeEndFrame) {
    if (!doc.value.playback.loop) {
      frameNumber = timeline.rangeEndFrame
      setCurrentFrame(frameIndexAtTimelineFrame(doc.value, frameNumber), frameNumber)
      stopPlayback()
      return
    }
    const length = timeline.rangeEndFrame - timeline.rangeStartFrame + 1
    frameNumber = timeline.rangeStartFrame + ((frameNumber - timeline.rangeStartFrame) % length)
  }
  setCurrentFrame(frameIndexAtTimelineFrame(doc.value, frameNumber), frameNumber)
  playbackRaf = window.requestAnimationFrame(playbackTick)
}
function togglePlayback() {
  if (!doc.value.timeline || blockingDialogOpen.value || adjustmentDialogOpen.value || transformState.value) return
  if (playing.value) { stopPlayback(); return }
  const timeline = doc.value.timeline
  playbackStartFrame = playheadFrame.value >= timeline.rangeEndFrame ? timeline.rangeStartFrame : playheadFrame.value
  setCurrentFrame(frameIndexAtTimelineFrame(doc.value, playbackStartFrame), playbackStartFrame)
  playbackStartedAt = performance.now()
  playing.value = true
  playbackRaf = window.requestAnimationFrame(playbackTick)
}

function selectTool(next: PixelToolKind) {
  tool.value = next
}

// ---- 未保存改动守卫 ----
function guardUnsavedThen(action: () => void) {
  if (dirty.value && !window.confirm('当前有未保存的改动，继续将会丢失，是否继续？')) {
    return
  }
  action()
}

function resetDocState(newDoc: PixelDocument, id: string | null) {
  stopPlayback()
  cancelFreeTransform()
  pixelClipboard = null
  doc.value = newDoc
  docId.value = id
  currentFrameIndex.value = 0
  playheadFrame.value = newDoc.timeline?.rangeStartFrame ?? 1
  activeLayerId.value = getFrame(newDoc, 0).layers[getFrame(newDoc, 0).layers.length - 1].id
  selectedLayerIds.value = new Set([activeLayerId.value])
  layerSelectionAnchorId.value = activeLayerId.value
  const firstCode = firstPaletteCode(activeLayer.value.palette)
  if (firstCode) selectPaletteColor(firstCode)
  else selectPaletteColor(TRANSPARENT_CODE)
  history.clear()
  dirty.value = false
  selection.value = null
  highlightCode.value = null
  saveState.value = 'idle'
  lastSavedAt.value = null
  spacePanHeld.value = false
  soloMode.value = false
  bumpRender()
  refreshStatsNow()
  nextTick(() => canvasBoardRef.value?.fitToWindow())
}

// ---- 新建 ----
function openNewDocDialog() {
  showNewDoc.value = true
}
function confirmNewDoc(payload: { name: string; width: number; height: number }) {
  guardUnsavedThen(() => {
    resetDocState(createSeededDocument(payload), null)
    showNewDoc.value = false
    setViewMode('editor')
  })
}

// ---- 项目库（取代旧 DocListDialog 弹窗，全屏管理所有文档） ----
function openProjectLibrary() {
  guardUnsavedThen(() => {
    // 用户已确认丢弃未保存改动才会走到这里；显式清掉 dirty，避免库内再点开文档时被同一处改动重复追问
    dirty.value = false
    setViewMode('library')
    refreshDocList()
  })
}
async function refreshDocList() {
  docsLoading.value = true
  try {
    docsList.value = await listPixelDocs()
  } catch (e) {
    window.alert(`加载文档列表失败：${(e as Error).message}`)
  } finally {
    docsLoading.value = false
  }
}
function onOpenDoc(id: string) {
  guardUnsavedThen(async () => {
    try {
      const res = await getPixelDoc(id)
      resetDocState(res.doc, res.id)
      setViewMode('editor')
    } catch (e) {
      window.alert(`打开文档失败：${(e as Error).message}`)
    }
  })
}
async function onDeleteDoc(id: string) {
  try {
    await deletePixelDoc(id)
    if (docId.value === id) {
      docId.value = null
    }
    await refreshDocList()
  } catch (e) {
    window.alert(`删除失败：${(e as Error).message}`)
  }
}

// ---- 导入 ----
function openImportDialog() {
  showImport.value = true
}
function confirmImport(payload: { name: string; width: number; height: number; palette: PixelPalette; grid: string[] }) {
  guardUnsavedThen(() => {
    const newDoc: PixelDocument = {
      version: 4,
      name: payload.name,
      width: payload.width,
      height: payload.height,
      frames: [{ id: 'f1', exposureFrames: 1, layers: [{ id: 'l1', name: '图层 1', visible: true, palette: payload.palette, grid: payload.grid }] }],
      timeline: null,
      playback: { loop: true }
    }
    resetDocState(newDoc, null)
    dirty.value = true
    showImport.value = false
  })
}

// ---- 保存 ----
async function saveDoc() {
  // 并发守卫：保存中再次触发（按钮点击 / Ctrl+S）直接忽略，避免同一份文档并发发出两次写请求
  if (saveState.value === 'saving') return
  saveState.value = 'saving'
  try {
    if (docId.value) {
      await updatePixelDoc(docId.value, doc.value)
    } else {
      const res = await createPixelDoc(doc.value)
      docId.value = res.id
    }
    dirty.value = false
    saveState.value = 'saved'
    lastSavedAt.value = new Date()
    setTimeout(() => {
      if (saveState.value === 'saved') saveState.value = 'idle'
    }, 2000)
  } catch (e) {
    saveState.value = 'error'
    const err = e as PixelApiError
    const base = `保存失败：${err.message}`
    window.alert(err.errors && err.errors.length > 0 ? `${base}\n${err.errors.join('\n')}` : base)
  }
}

// ---- 撤销/重做 ----
function undo() {
  const prev = history.undo(doc.value)
  if (!prev) return
  doc.value = prev
  currentFrameIndex.value = Math.min(currentFrameIndex.value, prev.frames.length - 1)
  if (prev.timeline) playheadFrame.value = Math.max(prev.timeline.rangeStartFrame, Math.min(prev.timeline.rangeEndFrame, playheadFrame.value))
  else playheadFrame.value = 1
  reconcileLayerSelection()
  selection.value = null
  markDirty()
  bumpRender()
  refreshStatsNow()
}
function redo() {
  const next = history.redo(doc.value)
  if (!next) return
  doc.value = next
  currentFrameIndex.value = Math.min(currentFrameIndex.value, next.frames.length - 1)
  if (next.timeline) playheadFrame.value = Math.max(next.timeline.rangeStartFrame, Math.min(next.timeline.rangeEndFrame, playheadFrame.value))
  else playheadFrame.value = 1
  reconcileLayerSelection()
  selection.value = null
  markDirty()
  bumpRender()
  refreshStatsNow()
}

// ---- 导出 PNG / 时间轴序列 ----
function openExportDialog() {
  publishError.value = ''
  showExport.value = true
}
function renderFrameCanvas(frameIndex: number, scale: number): HTMLCanvasElement | null {
  const { width, height } = computeExportPixelSize(doc.value.width, doc.value.height, scale)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.imageSmoothingEnabled = false
  const frame = getFrame(doc.value, frameIndex)
  for (const layer of frame.layers) {
    if (!layer.visible) continue
    drawGridToCanvas(ctx, { width: doc.value.width, height: doc.value.height, grid: layer.grid, palette: layer.palette }, scale)
  }
  return canvas
}
function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('PNG 编码失败')), 'image/png'))
}
function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
type WritableFileHandle = { createWritable(): Promise<{ write(data: Blob): Promise<void>; close(): Promise<void> }> }
type DirectoryHandle = { getFileHandle(name: string, options: { create: boolean }): Promise<WritableFileHandle> }
async function writeDirectoryFile(directory: DirectoryHandle, name: string, blob: Blob) {
  const handle = await directory.getFileHandle(name, { create: true })
  const writable = await handle.createWritable()
  await writable.write(blob)
  await writable.close()
}
async function exportPng(payload: { scale: number; mode: 'current' | 'animation' | 'publish'; targetId?: string }) {
  if (payload.mode === 'publish') {
    const canvas = renderFrameCanvas(currentFrameIndex.value, payload.scale)
    if (!canvas || !payload.targetId || !props.onPublishSnapshot) return
    publishing.value = true
    publishError.value = ''
    try {
      await props.onPublishSnapshot({
        targetId: payload.targetId,
        blob: await canvasBlob(canvas),
        fileName: `${doc.value.name || 'pixel'}.png`,
        source: { pixelDocumentId: docId.value || '', frameIndex: currentFrameIndex.value, scale: payload.scale }
      })
      showExport.value = false
    } catch (error) {
      publishError.value = error instanceof Error ? error.message : '发布失败'
    } finally {
      publishing.value = false
    }
    return
  }
  showExport.value = false
  try {
    if (payload.mode === 'current' || !doc.value.timeline) {
      const canvas = renderFrameCanvas(currentFrameIndex.value, payload.scale)
      if (!canvas) return
      downloadBlob(await canvasBlob(canvas), `${doc.value.name || 'pixel'}.png`)
      return
    }
    const timeline = doc.value.timeline
    const output: Array<{ name: string; blob: Blob; frameIndex: number; timelineFrame: number }> = []
    const total = timeline.rangeEndFrame - timeline.rangeStartFrame + 1
    const digits = Math.max(2, String(total).length)
    let sequenceIndex = 1
    let timelineFrame = timeline.rangeStartFrame
    for (let frameIndex = 0; frameIndex < doc.value.frames.length; frameIndex++) {
      const canvas = renderFrameCanvas(frameIndex, payload.scale)
      if (!canvas) throw new Error('无法创建动画帧画布')
      const blob = await canvasBlob(canvas)
      for (let exposure = 0; exposure < doc.value.frames[frameIndex].exposureFrames; exposure++) {
        output.push({ name: `${String(sequenceIndex).padStart(digits, '0')}.png`, blob, frameIndex, timelineFrame })
        sequenceIndex++
        timelineFrame++
      }
    }
    const manifest = new Blob([JSON.stringify({
      version: 1,
      name: doc.value.name,
      fps: timeline.fps,
      loop: doc.value.playback.loop,
      rangeStartFrame: timeline.rangeStartFrame,
      rangeEndFrame: timeline.rangeEndFrame,
      frames: output.map((item) => ({ file: item.name, sourceFrameIndex: item.frameIndex, timelineFrame: item.timelineFrame }))
    }, null, 2)], { type: 'application/json' })
    const picker = (window as Window & { showDirectoryPicker?: () => Promise<DirectoryHandle> }).showDirectoryPicker
    if (picker) {
      const directory = await picker.call(window)
      for (const item of output) await writeDirectoryFile(directory, item.name, item.blob)
      await writeDirectoryFile(directory, 'timeline.json', manifest)
    } else {
      for (const item of output) downloadBlob(item.blob, item.name)
      downloadBlob(manifest, 'timeline.json')
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return
    window.alert(`导出失败：${error instanceof Error ? error.message : '未知错误'}`)
  }
}

// ---- 视图/工具动作 ----
function toggleGrid() {
  showGrid.value = !showGrid.value
}
function toggleCheckerboard() {
  showCheckerboard.value = !showCheckerboard.value
}
function fitWindow() {
  canvasBoardRef.value?.fitToWindow()
}
function actualSize() {
  canvasBoardRef.value?.zoomTo(1)
}
function zoomStepIn() {
  canvasBoardRef.value?.zoomStepIn()
}
function zoomStepOut() {
  canvasBoardRef.value?.zoomStepOut()
}
function adjustBrushSize(delta: number) {
  brushSize.value = Math.max(1, Math.min(32, brushSize.value + delta))
}
function swapTransparentColor() {
  if (currentPaintHex.value === null) {
    if (lastNonTransparentPaint.value) {
      const { code, hex } = lastNonTransparentPaint.value
      if (code && activeLayer.value.palette[code]?.hex.toLowerCase() === hex.toLowerCase()) selectPaletteColor(code)
      else selectPaintHex(hex)
    }
  } else {
    selectPaletteColor(TRANSPARENT_CODE)
  }
}

function dispatchAction(id: PixelActionId) {
  switch (id) {
    case 'tool.select': tool.value = 'select'; break
    case 'tool.marquee': tool.value = 'marquee'; break
    case 'tool.lasso': tool.value = 'lasso'; break
    case 'tool.brush': tool.value = 'brush'; break
    case 'tool.eraser': tool.value = 'eraser'; break
    case 'tool.bucket': tool.value = 'bucket'; break
    case 'tool.line': tool.value = 'line'; break
    case 'tool.rect': tool.value = 'rect'; break
    case 'tool.ellipse': tool.value = 'ellipse'; break
    case 'tool.eyedropper': tool.value = 'eyedropper'; break
    case 'tool.zoom': tool.value = 'zoom'; break
    case 'brush.sizeDown': adjustBrushSize(-1); break
    case 'brush.sizeUp': adjustBrushSize(1); break
    case 'color.swapTransparent': swapTransparentColor(); break
    case 'view.toggleGrid': toggleGrid(); break
    case 'view.fitWindow': fitWindow(); break
    case 'view.actualSize': actualSize(); break
    case 'edit.undo': undo(); break
    case 'edit.redo': redo(); break
    case 'color.adjust': openColorAdjust(); break
    case 'pixel.cleanup': openPixelCleanup(); break
    case 'selection.clear': selection.value = null; break
    case 'selection.all': selection.value = createFullSelection(doc.value.width, doc.value.height); break
    case 'selection.copy': copySelectedPixels(); break
    case 'selection.paste': pastePixels(); break
    case 'selection.cut': cutSelectedPixels(); break
    case 'selection.transform': startFreeTransform(); break
    case 'selection.deletePixels': deleteSelectedPixels(); break
    case 'layer.add': addLayer(); break
    case 'layer.remove': removeActiveLayer(); break
    case 'layer.previous': switchLayer('previous'); break
    case 'layer.next': switchLayer('next'); break
    case 'frame.previous': selectAdjacentFrame('previous'); break
    case 'frame.next': selectAdjacentFrame('next'); break
    case 'playback.toggle': togglePlayback(); break
    case 'file.new': openNewDocDialog(); break
    case 'file.open': openProjectLibrary(); break
    case 'file.import': openImportDialog(); break
    case 'file.export': openExportDialog(); break
    case 'file.save': saveDoc(); break
    case 'view.pan': break // 按住态由 onGlobalKeydown/onGlobalKeyup 单独维护，不在这里触发
  }
}

// ---- 全局快捷键分发：单点入口，取代旧版散落的 keydown 分支 ----
function onGlobalKeydown(e: KeyboardEvent) {
  // 录入态保留文本编辑原生键；其它区域的浏览器组合键/功能键统一先吞掉，避免未绑定键漏到浏览器。
  if (isEditableTarget(e.target)) return
  // 缩略图只独占 Space：操作后焦点会留在缩略图内，但 B/E 等工作台工具快捷键仍须继续全局分发。
  // 若把整个缩略图都提前返回，用户拖动或导航一次后就会误以为所有快捷键失效。
  if ((e.code === 'Space' || e.key === ' ') && e.target instanceof Element && e.target.closest('.pixel-navigator')) return
  if (isBrowserShortcutChord(e)) e.preventDefault()
  // 普通模态弹窗不向背后工作区分发；调整效果窗只放行纯视图动作，避免预览基线与正式网格双写。
  if (blockingDialogOpen.value) return
  if (transformState.value) {
    if (e.key === 'Enter') {
      e.preventDefault()
      commitFreeTransform()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      cancelFreeTransform()
    } else if (e.code === 'Space' || e.key === ' ') {
      e.preventDefault()
      spacePanHeld.value = true
    } else {
      e.preventDefault()
    }
    return
  }
  if (e.key === 'Alt' && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
    if (!e.repeat && editorShortcutsActive.value && !adjustmentDialogOpen.value && !canvasBoardRef.value?.isInteracting()) {
      e.preventDefault()
      temporaryToolHeld.value = true
    }
    return
  }
  const actionId = matchAction(e, keymap.value)
  if (!actionId) return
  if (adjustmentDialogOpen.value && !['view.pan', 'view.toggleGrid', 'view.fitWindow', 'view.actualSize'].includes(actionId)) {
    e.preventDefault()
    return
  }
  if (!editorShortcutsActive.value) {
    // 项目库视图下画布不可见，工具/撤销重做/保存等编辑器动作没有意义；但只要命中了已绑定动作就要吞掉按键本身，
    // 否则例如 Ctrl+S 会漏给浏览器触发系统"保存网页"对话框——未命中任何动作的普通按键仍然放行不受影响
    e.preventDefault()
    return
  }
  e.preventDefault()
  if (actionId === 'view.pan') {
    spacePanHeld.value = true
    return
  }
  dispatchAction(actionId)
}
function onGlobalKeyup(e: KeyboardEvent) {
  if (e.key === 'Alt') temporaryToolHeld.value = false
  // 物理松键必须跨焦点域复位：用户可能先在主画布按下 Space，再把焦点拖进缩略图后才松开。
  // 缩略图会在自身 keyup 阶段 stopPropagation，因此本监听使用捕获阶段，不能因当前 target 在缩略图内而跳过。
  // 复位平移态只比较"松开的物理键"是否等于当前绑定的主键，忽略修饰键差异：
  // 若用 matchAction 做完整 chord 匹配，Space+Shift 组合先松 Space 时（keyup 事件里 shiftKey 仍为 true）
  // 会拼出 'shift+space' 匹配不到纯 'space'，导致 spacePanHeld 永久卡在 true、画布再也拖不动
  const panChord = getEffectiveChord(keymap.value, 'view.pan')
  if (panChord && chordFromEvent(e).key === panChord.key) {
    spacePanHeld.value = false
  }
}
// 兜底：窗口失焦（切窗口/切标签页）时按键 keyup 不一定能送达页面，同样会让 spacePanHeld 卡死，随组件生命周期挂/卸
function onWindowBlur() {
  spacePanHeld.value = false
  temporaryToolHeld.value = false
}
function onBeforeUnload(e: BeforeUnloadEvent) {
  if (!dirty.value) return
  e.preventDefault()
  e.returnValue = ''
}

onMounted(async () => {
  window.addEventListener('keydown', onGlobalKeydown, true)
  window.addEventListener('keyup', onGlobalKeyup, true)
  window.addEventListener('beforeunload', onBeforeUnload)
  window.addEventListener('blur', onWindowBlur)
  window.addEventListener('resize', onWindowResize)
  nextTick(observeSideSize)
  nextTick(() => canvasBoardRef.value?.fitToWindow())

  // 入口状态机：已有保存过的文档就默认先进项目库；没有文档、或列表拉取失败都留在编辑器默认新文档，不阻断使用
  docsLoading.value = true
  try {
    const list = await listPixelDocs()
    docsList.value = list
    if (list.length > 0) {
      setViewMode('library')
    }
  } catch {
    // 静默：留在编辑器，不用弹窗打断首次进入体验
  } finally {
    docsLoading.value = false
  }
})
onBeforeUnmount(() => {
  stopPlayback()
  window.removeEventListener('keydown', onGlobalKeydown, true)
  window.removeEventListener('keyup', onGlobalKeyup, true)
  window.removeEventListener('beforeunload', onBeforeUnload)
  window.removeEventListener('blur', onWindowBlur)
  window.removeEventListener('resize', onWindowResize)
  sideResizeObserver?.disconnect()
  sideResizeObserver = null
  if (statsDebounceTimer) clearTimeout(statsDebounceTimer)
})
</script>

<style scoped>
.pixel-studio {
  --ps-bg-app: #f7f6f2;
  --ps-bg-panel: #fffefb;
  --ps-bg-control: #f3f1ea;
  --ps-border: #e7e4da;
  --ps-border-strong: #e0ddd4;
  --ps-text: #2b2c30;
  --ps-text-secondary: #7a7d86;
  --ps-text-weak: #a2a5ad;
  --ps-accent-bg: #5c8a5c;
  --ps-accent-text: #ffffff;
  --ps-accent-active-bg: #e7efe5;
  --ps-accent-active-border: #8aaa85;
  --ps-accent-active-text: #3f6845;
  --ps-accent-strong-text: #4f6f58;
  --ps-save-bg: var(--ps-accent-bg);
  --ps-save-bg-hover: #527a52;
  --ps-save-text: #ffffff;
  --ps-canvas-backdrop: #eceae3;
  --ps-checker-a: #efede6;
  --ps-checker-b: #e2dfd6;
  --ps-danger: #dc2626;
  --ps-selection-toolbar-bg: #555750;
  --ps-selection-toolbar-text: #f7f7f2;
  --ps-selection-toolbar-border: rgba(255, 255, 255, 0.22);
  --ps-selection-toolbar-hover: rgba(255, 255, 255, 0.14);

  display: flex;
  flex-direction: column;
  /* 根因修复：此前 100vh 无视父链（body 有 --langhuan-browser-frame-gap 内边距）实际可用高度，
     真机底栏被裁掉约 gap*2 像素；父链 html/body/#app/.click-spark 已逐层 height:100% 收敛到可用区域，
     这里跟随父链高度即可精确贴合，不再溢出视口。 */
  height: 100%;
  background: var(--ps-bg-app);
  color: var(--ps-text);
  /* 禁止浏览器的光标浏览/普通文本落点；真实编辑控件在下方显式恢复。 */
  user-select: none;
  -webkit-user-select: none;
  caret-color: transparent;
}
.pixel-studio :is(input, textarea, select, [contenteditable='true']) {
  user-select: text;
  -webkit-user-select: text;
  caret-color: auto;
}
[data-theme='dark'] .pixel-studio {
  --ps-bg-app: #1c1b18;
  --ps-bg-panel: #242320;
  --ps-bg-control: #2b2a25;
  --ps-border: rgba(255, 255, 255, 0.08);
  --ps-border-strong: rgba(255, 255, 255, 0.14);
  --ps-text: #e8e6df;
  --ps-text-secondary: #a3a096;
  --ps-text-weak: #706d63;
  --ps-accent-bg: #6f996f;
  --ps-accent-text: #ffffff;
  --ps-accent-active-bg: #2e3b2f;
  --ps-accent-active-border: #6f996f;
  --ps-accent-active-text: #a9c7a9;
  --ps-accent-strong-text: #8fae96;
  --ps-save-bg: var(--ps-accent-bg);
  --ps-save-bg-hover: #7ca77c;
  --ps-save-text: #ffffff;
  --ps-canvas-backdrop: #17160f;
  --ps-checker-a: #201f19;
  --ps-checker-b: #2a2820;
  --ps-danger: #f87171;
  --ps-selection-toolbar-bg: #34352f;
  --ps-selection-toolbar-text: #f1efe8;
  --ps-selection-toolbar-border: rgba(255, 255, 255, 0.16);
  --ps-selection-toolbar-hover: rgba(255, 255, 255, 0.12);
}
.pixel-studio__body {
  flex: 1;
  display: flex;
  min-height: 0;
}
.pixel-studio__canvas-area {
  /* 缩略图 absolute 定位与拖动计算共同以本区域为唯一原点；缺失时首帧拖动会从外层祖先坐标跳回本层坐标。 */
  position: relative;
  flex: 1;
  display: flex;
  min-width: 0;
  min-height: 0;
}
.pixel-studio__side {
  /* 界面 90% 密度化：chrome 统一缩放，联动说明见 MenuBar.vue .menu-bar；已知小取舍=右栏拖宽位移与光标有 10% 系数 */
  zoom: 0.9;
  position: relative;
  flex: none;
  background: var(--ps-bg-panel);
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: visible;
}
.pixel-studio__palette { flex: 1; min-height: 0; }
.pixel-studio__layer-resizer { flex: none; }
.pixel-studio--adjusting :deep(.context-bar),
.pixel-studio--adjusting :deep(.tool-rail),
.pixel-studio--adjusting .pixel-studio__side,
.pixel-studio--adjusting .pixel-studio__side-resizer,
.pixel-studio--adjusting :deep(.timeline-dock),
.pixel-studio--transforming :deep(.context-bar),
.pixel-studio--transforming :deep(.tool-rail),
.pixel-studio--transforming .pixel-studio__side,
.pixel-studio--transforming .pixel-studio__side-resizer { pointer-events: none; }
.pixel-studio--transforming :deep(.timeline-dock) { pointer-events: none; }
</style>
