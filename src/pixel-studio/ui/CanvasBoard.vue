<template>
  <div
    ref="viewportEl"
    class="pixel-viewport"
    :class="{ 'pixel-viewport--pan-ready': spacePanHeld, 'pixel-viewport--panning': isPanning, 'pixel-viewport--eyedropper': tool === 'eyedropper', 'pixel-viewport--zoom': tool === 'zoom', 'pixel-viewport--bucket': tool === 'bucket' }"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointerleave="onPointerLeave"
    @pointercancel="onPointerUp"
    @wheel.prevent="onWheel"
    @contextmenu="onContextMenu"
  >
    <div class="pixel-stage" :class="{ 'pixel-stage--checker': showCheckerboard }" :style="stageStyle">
      <canvas ref="baseCanvasEl" class="pixel-canvas--offscreen" :width="doc.width" :height="doc.height" />
      <canvas ref="overlayCanvasEl" class="pixel-canvas--offscreen" :width="doc.width" :height="doc.height" />
    </div>
    <canvas ref="screenBaseCanvasEl" class="pixel-screen-canvas" />
    <canvas ref="screenOverlayCanvasEl" class="pixel-screen-canvas" :class="{ 'pixel-canvas--blink': !!highlightCode }" />
    <canvas ref="gridCanvasEl" class="pixel-grid-canvas" />
    <div v-if="selectionRect" class="pixel-selection-marquee" :style="selectionMarqueeStyle" />
    <canvas ref="selectionBaseCanvasEl" class="pixel-selection-canvas" aria-hidden="true" />
    <canvas ref="selectionStrokeCanvasEl" class="pixel-selection-canvas" aria-hidden="true" />
    <SelectionActionBar
      v-if="selectionToolbarStyle"
      :style="selectionToolbarStyle"
      :current-hex="currentHex"
      :max-amount="Math.max(doc.width, doc.height)"
      @action="$emit('selection-action', $event)"
      @adjust="(mode, amount) => $emit('selection-adjust', mode, amount)"
    />
    <div v-if="transformBounds" class="pixel-transform-box" :style="transformBoxStyle" aria-label="自由变换范围">
      <span class="pixel-transform-box__hint">Enter 应用 · Esc 取消</span>
      <button
        v-for="handle in TRANSFORM_HANDLES"
        :key="handle"
        type="button"
        class="pixel-transform-handle"
        :class="`pixel-transform-handle--${handle}`"
        :aria-label="`拖动${handle}变换手柄`"
        @pointerdown.stop="startTransformResize($event, handle)"
      />
    </div>
    <svg v-if="lassoPreviewPoints" class="pixel-lasso-preview" aria-hidden="true">
      <polyline :points="lassoPreviewPoints" />
    </svg>
    <div v-if="tool === 'eyedropper' && eyedropCursor" class="pixel-eyedrop-cursor" :style="eyedropCursorStyle">
      <span class="pixel-eyedrop-cursor__ring">
        <span class="pixel-eyedrop-cursor__fill">
          <span class="pixel-eyedrop-cursor__new" :class="{ 'pixel-eyedrop-cursor__transparent': eyedropCursor.pickedCode === TRANSPARENT_CODE }" :style="pickedColorStyle" />
          <span class="pixel-eyedrop-cursor__old" :class="{ 'pixel-eyedrop-cursor__transparent': currentHex === null }" :style="originColorStyle" />
        </span>
        <span class="pixel-eyedrop-cursor__outline" />
      </span>
      <PixelIcon class="pixel-eyedrop-cursor__icon" name="pipette" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { CellPos, PixelCode, PixelDocument } from '../core'
import { TRANSPARENT_CODE, getCell, getCompositePixel, getFrame, getLayer, rasterBrush, rasterEllipse, rasterLine, rasterRect } from '../core'
import { drawGridToCanvas } from './pixelRender'
import type { PixelRect, PixelToolKind, PixelViewportState, SelectionCombineMode, SelectionMask, SelectionRect } from './uiTypes'
import { combineSelection, createLassoSelection, createRectSelection, getSelectionBounds } from './selection'
import { ZOOM_STEP, docRectToDevicePixels, docRectToScreen, fitToViewport, screenToCell, zoomAtPointer, zoomToward } from './viewport'
import PixelIcon from './PixelIcon.vue'
import SelectionActionBar from './SelectionActionBar.vue'

const GRID_MIN_ZOOM = 8 // 网格线显示阈值：沿用旧 CSS 平铺实现的现役阈值，不改

const props = defineProps<{
  doc: PixelDocument
  frameIndex: number
  tool: PixelToolKind
  brushSize: number
  shapeFilled: boolean
  currentColor: PixelCode | null
  currentHex: string | null
  highlightCode?: PixelCode | null
  selection?: SelectionMask | null
  transformBounds?: PixelRect | null
  /** 文档内容每次变更（笔刷/形状提交/撤销重做/加载）都要 +1，驱动基础层重绘 */
  renderVersion: number
  showGrid: boolean
  showCheckerboard: boolean
  /** 空格是否处于按住状态（由父组件的全局键位分发统一判定），true 时左键拖动=平移而非作画 */
  spacePanHeld: boolean
  activeLayerId: string
  soloLayer: boolean
  /** 调整效果预览期间只保留平移、缩放与取色查看，不允许改写网格/选区。 */
  readOnly?: boolean
}>()

const emit = defineEmits<{
  (e: 'stroke-start'): void
  (e: 'paint-cells', cells: CellPos[], code: PixelCode): void
  (e: 'commit-shape', cells: CellPos[], code: PixelCode): void
  (e: 'bucket-fill', cell: CellPos): void
  (e: 'stroke-end'): void
  (e: 'eyedrop', sample: { code: PixelCode; hex: string | null }): void
  (e: 'selection-change', sel: SelectionMask | null): void
  (e: 'selection-action', action: 'clear' | 'invert' | 'delete-inside' | 'delete-outside' | 'fill'): void
  (e: 'selection-adjust', mode: 'grow' | 'shrink', amount: number): void
  (e: 'move-start'): void
  (e: 'move-preview', dx: number, dy: number): void
  (e: 'move-end'): void
  (e: 'transform-preview', bounds: PixelRect): void
  (e: 'viewport-change', state: PixelViewportState): void
  (e: 'cursor-cell', info: { x: number; y: number; code: PixelCode; hex: string | null } | null): void
}>()

const viewportEl = ref<HTMLDivElement | null>(null)
const baseCanvasEl = ref<HTMLCanvasElement | null>(null)
const overlayCanvasEl = ref<HTMLCanvasElement | null>(null)
// 屏幕空间展示层：base/overlay 离屏真值分别 blit 到这两张，见 blitLayer()。不再用 CSS transform 直接展示 base/overlay。
const screenBaseCanvasEl = ref<HTMLCanvasElement | null>(null)
const screenOverlayCanvasEl = ref<HTMLCanvasElement | null>(null)
const gridCanvasEl = ref<HTMLCanvasElement | null>(null)
const selectionBaseCanvasEl = ref<HTMLCanvasElement | null>(null)
const selectionStrokeCanvasEl = ref<HTMLCanvasElement | null>(null)
const eyedropCursor = ref<{ x: number; y: number; pickedCode: PixelCode; pickedHex: string | null } | null>(null)

const eyedropCursorStyle = computed(() => eyedropCursor.value ? { left: `${eyedropCursor.value.x}px`, top: `${eyedropCursor.value.y}px` } : {})
const pickedColorStyle = computed(() => {
  return eyedropCursor.value?.pickedHex ? { background: eyedropCursor.value.pickedHex } : {}
})
const originColorStyle = computed(() => {
  return props.currentHex ? { background: props.currentHex } : {}
})

// ---- 视口状态：位图固定 1 像素/格 ----
const zoom = ref(1)
const panX = ref(0)
const panY = ref(0)
const viewportSize = ref({ width: 0, height: 0 })

const TRANSFORM_HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const
type TransformHandle = typeof TRANSFORM_HANDLES[number]
const transformBoxStyle = computed(() => {
  const bounds = props.transformBounds
  if (!bounds) return {}
  return {
    left: `${panX.value + bounds.x * zoom.value}px`,
    top: `${panY.value + bounds.y * zoom.value}px`,
    width: `${bounds.width * zoom.value}px`,
    height: `${bounds.height * zoom.value}px`
  }
})

let transformResize: { handle: TransformHandle; startX: number; startY: number; source: PixelRect } | null = null
function stopTransformResize() {
  transformResize = null
  window.removeEventListener('pointermove', onTransformResizeMove)
  window.removeEventListener('pointerup', stopTransformResize)
  window.removeEventListener('pointercancel', stopTransformResize)
}
function startTransformResize(event: PointerEvent, handle: TransformHandle) {
  if (!props.transformBounds) return
  event.preventDefault()
  transformResize = { handle, startX: event.clientX, startY: event.clientY, source: { ...props.transformBounds } }
  window.addEventListener('pointermove', onTransformResizeMove)
  window.addEventListener('pointerup', stopTransformResize)
  window.addEventListener('pointercancel', stopTransformResize)
}
function onTransformResizeMove(event: PointerEvent) {
  const resize = transformResize
  if (!resize) return
  event.preventDefault()
  const dx = Math.round((event.clientX - resize.startX) / zoom.value)
  const dy = Math.round((event.clientY - resize.startY) / zoom.value)
  const sourceLeft = resize.source.x
  const sourceTop = resize.source.y
  const sourceRight = resize.source.x + resize.source.width
  const sourceBottom = resize.source.y + resize.source.height
  let left = sourceLeft
  let top = sourceTop
  let right = sourceRight
  let bottom = sourceBottom
  if (resize.handle.includes('w')) left = Math.max(0, Math.min(sourceRight - 1, sourceLeft + dx))
  if (resize.handle.includes('e')) right = Math.max(sourceLeft + 1, Math.min(props.doc.width, sourceRight + dx))
  if (resize.handle.includes('n')) top = Math.max(0, Math.min(sourceBottom - 1, sourceTop + dy))
  if (resize.handle.includes('s')) bottom = Math.max(sourceTop + 1, Math.min(props.doc.height, sourceBottom + dy))
  emit('transform-preview', { x: left, y: top, width: right - left, height: bottom - top })
}

// .pixel-stage 的 CSS transform 现在只用于给棋盘底纹 CSS 背景（showCheckerboard）定位/缩放，
// 以及给两张 display:none 的离屏真值 canvas 占位；实际展示的位图不再走这层 transform 缩放栅格化，
// 改为下面的 blitLayer() 显式 drawImage 到屏幕空间 canvas，见 2026-07-19 二次根因修复说明
const stageStyle = computed(() => ({
  width: `${props.doc.width}px`,
  height: `${props.doc.height}px`,
  transform: `translate(${panX.value}px, ${panY.value}px) scale(${zoom.value})`
}))
// 网格线覆盖层：屏幕空间 canvas 逐线绘制（不进 stage 缩放变换，避免细线被拉伸模糊）。
// 根因修复（2026-07-18 热修批）：此前用 CSS background-image 平铺 + 小数 background-size 画线，
// 浏览器逐 tile 独立做设备像素取整，小数 zoom 下误差会沿平铺方向累积，导致越靠右/下网格线相对色块边界偏移越大。
// 改为每条线单独按 devicePixelRatio 取整（xs = round(x*dpr)），误差恒 ≤0.5 设备像素且不会累积。
//
// 二次根因修复（2026-07-19 三轮复发批）：用户真机反馈"色块边界相对网格线偏移可达约 1/3 格，且与浏览器页面
// 缩放强相关（80%/175% 正常，100% 反而偏移）"。经 Playwright 有头矩阵复现实测（--force-device-scale-factor
// 扫描 0.6~2.5，headed Edge/Chromium 双实测口径一致）：window.devicePixelRatio 读数与浏览器合成器实际使用的
// 栅格化比例在特定缩放条件下会发生分离——JS 侧读到的 dpr 是"标称值"，但 .pixel-stage 上 CSS transform:
// scale() 缩放位图 canvas 时，合成器实际栅格化用的是另一个（不可从 JS 读到的）比例，两者不一致时，位图边界
// 与"网格线按标称 dpr 独立换算"的结果会产生随位置增长的累积偏移（左边界重合、越往右偏移越大），不是±1 设备
// 像素内的有界抖动。根治方案：位图不再用 CSS transform 展示（不再让合成器对 canvas 做隐式缩放栅格化），
// 改为离屏真值 canvas（baseCanvasEl/overlayCanvasEl，1 像素/格，见 renderBase/applyCellPatch/renderOverlay）
// 每帧用 drawImage 显式 blit 到屏幕空间 canvas（screenBaseCanvasEl/screenOverlayCanvasEl），blit 目标矩形与
// 网格线裁剪范围共用同一份 docRectToDevicePixels() 算式（viewport.ts）——位图边界与网格线从此只有一个坐标权威，
// 数学上不可能再分裂成两条独立取整路径。
let gridResizeObserver: ResizeObserver | null = null

/** 屏幕空间 canvas 背店尺寸重设：视口 CSS 尺寸 × dpr；仅在真正变化时重设（重设会清空画布内容，比 clearRect 更贵）。
 * drawGrid/blitLayer 共用，避免三处各自重复一份同样的尺寸计算。 */
function resizeScreenCanvas(canvas: HTMLCanvasElement, cssW: number, cssH: number, dpr: number): void {
  const nextW = Math.max(1, Math.round(cssW * dpr))
  const nextH = Math.max(1, Math.round(cssH * dpr))
  if (canvas.width !== nextW || canvas.height !== nextH) {
    canvas.width = nextW
    canvas.height = nextH
  }
}

function drawGrid() {
  const canvas = gridCanvasEl.value
  const viewport = viewportEl.value
  if (!canvas || !viewport) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const dpr = window.devicePixelRatio || 1
  const rect = viewport.getBoundingClientRect()
  const cssW = rect.width
  const cssH = rect.height
  resizeScreenCanvas(canvas, cssW, cssH, dpr)
  ctx.clearRect(0, 0, canvas.width, canvas.height)

  // canvas 始终挂载（不再 v-if 移除），这里按显示条件决定是否真正画线，避免频繁开关时重建 ResizeObserver 目标
  if (!props.showGrid || zoom.value < GRID_MIN_ZOOM) return

  const z = zoom.value
  const docW = props.doc.width
  const docH = props.doc.height
  const px = panX.value
  const py = panY.value

  // 文档矩形在设备像素空间的边界（横线/竖线各自的绘制范围，只在文档区域内画，不越界到空白视口）；
  // 与 blitLayer() 的 drawImage 目标矩形共用同一份算式，是位图边界与网格线对齐的唯一坐标权威
  const docRect = docRectToDevicePixels({ docWidth: docW, docHeight: docH, zoom: z, panX: px, panY: py, dpr })

  // 颜色联动：与旧 .pixel-grid-overlay 的 [data-theme='dark'] CSS 规则同一套主题色约定（该 CSS 规则本批已删，
  // 判断逻辑原样保留在这里；全站 data-theme 属性写在 document.documentElement，见 settingStore.ts）
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark'
  ctx.fillStyle = isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.15)'

  // 只画视口与文档矩形相交范围内的线：i/j 范围先按视口裁一次，再按文档格数裁一次
  const iMin = Math.max(0, Math.ceil(-px / z))
  const iMax = Math.min(docW - 1, Math.floor((cssW - px) / z))
  for (let i = iMin; i <= iMax; i++) {
    const xDevice = Math.round((px + i * z) * dpr)
    ctx.fillRect(xDevice, docRect.top, 1, docRect.height)
  }

  const jMin = Math.max(0, Math.ceil(-py / z))
  const jMax = Math.min(docH - 1, Math.floor((cssH - py) / z))
  for (let j = jMin; j <= jMax; j++) {
    const yDevice = Math.round((py + j * z) * dpr)
    ctx.fillRect(docRect.left, yDevice, docRect.width, 1)
  }
}

/** 离屏真值 canvas -> 屏幕空间展示 canvas 的唯一 blit 入口。imageSmoothingEnabled=false 保证最近邻缩放，
 * 目标矩形用 docRectToDevicePixels()（与 drawGrid 同款算式）而不是让 CSS transform 隐式缩放栅格化。 */
function blitLayer(source: HTMLCanvasElement | null, target: HTMLCanvasElement | null): void {
  const viewport = viewportEl.value
  if (!source || !target || !viewport) return
  const ctx = target.getContext('2d')
  if (!ctx) return
  const dpr = window.devicePixelRatio || 1
  const rect = viewport.getBoundingClientRect()
  resizeScreenCanvas(target, rect.width, rect.height, dpr)
  ctx.clearRect(0, 0, target.width, target.height)
  const docRect = docRectToDevicePixels({ docWidth: props.doc.width, docHeight: props.doc.height, zoom: zoom.value, panX: panX.value, panY: panY.value, dpr })
  if (docRect.width <= 0 || docRect.height <= 0) return
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(source, 0, 0, props.doc.width, props.doc.height, docRect.left, docRect.top, docRect.width, docRect.height)
}

function blitBase() {
  blitLayer(baseCanvasEl.value, screenBaseCanvasEl.value)
}
function blitOverlay() {
  blitLayer(overlayCanvasEl.value, screenOverlayCanvasEl.value)
}

// rAF 合帧：pan/zoom/尺寸在拖动/滚轮/窗口缩放期间高频变化，三件事（网格线+两张位图 blit）几何上必须同步，
// 合并进同一个 pending 标志、同一帧内一起重算，避免三者各自独立节流产生瞬时不同步的撕裂帧
let screenSyncPending = false
function scheduleScreenSync() {
  if (screenSyncPending) return
  screenSyncPending = true
  requestAnimationFrame(() => {
    screenSyncPending = false
    drawGrid()
    blitBase()
    blitOverlay()
    drawSelectionBase()
    drawSelectionStroke()
  })
}

watch(
  () => [zoom.value, panX.value, panY.value, props.doc.width, props.doc.height, props.showGrid],
  scheduleScreenSync
)

function emitViewportChange() {
  const rect = viewportEl.value?.getBoundingClientRect()
  viewportSize.value = { width: rect?.width ?? 0, height: rect?.height ?? 0 }
  emit('viewport-change', {
    zoom: zoom.value,
    panX: panX.value,
    panY: panY.value,
    viewportWidth: rect?.width ?? 0,
    viewportHeight: rect?.height ?? 0
  })
}

function centerOnDocumentPoint(x: number, y: number) {
  const rect = viewportEl.value?.getBoundingClientRect()
  if (!rect) return
  panX.value = rect.width / 2 - x * zoom.value
  panY.value = rect.height / 2 - y * zoom.value
  emitViewportChange()
}

function fitToWindow() {
  const rect = viewportEl.value?.getBoundingClientRect()
  if (!rect) return
  const next = fitToViewport({ docWidth: props.doc.width, docHeight: props.doc.height, viewportWidth: rect.width, viewportHeight: rect.height })
  zoom.value = next.zoom
  panX.value = next.panX
  panY.value = next.panY
  emitViewportChange()
}
function zoomTo(target: number) {
  const rect = viewportEl.value?.getBoundingClientRect()
  const cx = rect ? rect.width / 2 : 0
  const cy = rect ? rect.height / 2 : 0
  const next = zoomToward({ zoom: zoom.value, panX: panX.value, panY: panY.value }, target, cx, cy)
  zoom.value = next.zoom
  panX.value = next.panX
  panY.value = next.panY
  emitViewportChange()
}
function zoomStepIn() {
  zoomTo(zoom.value * ZOOM_STEP)
}
function zoomStepOut() {
  zoomTo(zoom.value / ZOOM_STEP)
}

onMounted(() => {
  nextTick(fitToWindow)
  // ResizeObserver 首次 observe 会立即回调一次，天然覆盖"组件刚挂载、viewportEl 尺寸刚到位"的初始画线时机，
  // 同时承担窗口尺寸变化（含由此引起的 devicePixelRatio 相关重算）时的背店重设；jsdom 测试环境无此全局，按项目惯例（同 TaskTimeline.vue）判空跳过
  if (typeof ResizeObserver !== 'undefined' && viewportEl.value) {
    gridResizeObserver = new ResizeObserver(() => {
      scheduleScreenSync()
      emitViewportChange()
    })
    gridResizeObserver.observe(viewportEl.value)
  }
})

// ---- 基础层：文档内容 ----
// 全量重绘：只用于结构性变化（撤销/重做、文档替换、调色板改色、颜色合并等，由父组件 bumpRender 驱动 renderVersion）。
// 逐格画笔/形状提交等高频"只改了哪些格"的场景走下面的 applyCellPatch 增量路径，不再触发这里的整屏重扫。
function renderBase() {
  const canvas = baseCanvasEl.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  const frame = getFrame(props.doc, props.frameIndex)
  const layers = props.soloLayer ? [getLayer(frame, props.activeLayerId)] : frame.layers.filter((layer) => layer.visible)
  for (const layer of layers) {
    drawGridToCanvas(ctx, { width: props.doc.width, height: props.doc.height, grid: layer.grid, palette: layer.palette }, 1)
  }
  blitBase() // 离屏真值画完立即同步到屏幕展示层，不再依赖 CSS transform 展示 baseCanvasEl 本体
}

// rAF 合帧：同一帧内多次触发（如撤销后紧跟着调色板变化）只画一次，用 pending 标志去重
let renderBasePending = false
function scheduleRenderBase() {
  if (renderBasePending) return
  renderBasePending = true
  requestAnimationFrame(() => {
    renderBasePending = false
    renderBase()
  })
}

watch(
  () => [props.doc, props.renderVersion],
  () => nextTick(scheduleRenderBase),
  { immediate: true }
)

/**
 * 增量补丁：只重画传入的格子，不整屏重扫。供父组件在画笔/形状提交/选区填充等"确定改了哪些格"的场景调用，
 * 替代整屏 renderBase，是本组件对外唯一的性能快路径入口。视口模型下位图分辨率仍是 1 像素/格，与旧实现完全同构。
 */
function applyCellPatch(cells: CellPos[]) {
  const canvas = baseCanvasEl.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const frame = getFrame(props.doc, props.frameIndex)
  const soloId = props.soloLayer ? props.activeLayerId : null
  for (const { x, y } of cells) {
    if (x < 0 || x >= props.doc.width || y < 0 || y >= props.doc.height) continue
    const { hex } = getCompositePixel(frame, props.doc.width, x, y, soloId)
    if (!hex) {
      ctx.clearRect(x, y, 1, 1)
    } else {
      ctx.fillStyle = hex
      ctx.fillRect(x, y, 1, 1)
    }
  }
  blitBase() // 增量补丁同理，画完离屏真值立即同步到屏幕展示层
}

function isInteracting(): boolean {
  return dragging || eyedropDragging || isPanning.value || isMovingPixels.value || isZoomDragging.value || activePointerId !== null
}

defineExpose({ applyCellPatch, fitToWindow, zoomTo, zoomStepIn, zoomStepOut, centerOnDocumentPoint, isInteracting })

// ---- 覆盖层：形状预览 / 选区 / 高亮闪烁（不写入文档） ----
const previewCells = ref<CellPos[]>([])
const previewSelection = ref<SelectionRect | null>(null)
const previewLasso = ref<CellPos[]>([])

// 选区蚂蚁线：屏幕空间 div，不进 canvas 绘制，做法与网格覆盖层一致（显式按 pan/zoom 换算 left/top/width/height）。
// 拖拽中的预览选区与已确认选区共用同一显示。
const selectionRect = computed(() => previewSelection.value)
const selectionMarqueeStyle = computed(() => {
  const sel = selectionRect.value
  if (!sel) return {}
  const minX = Math.min(sel.x0, sel.x1)
  const maxX = Math.max(sel.x0, sel.x1)
  const minY = Math.min(sel.y0, sel.y1)
  const maxY = Math.max(sel.y0, sel.y1)
  const rect = docRectToScreen({ x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 }, { zoom: zoom.value, panX: panX.value, panY: panY.value })
  return { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` }
})
const lassoPreviewPoints = computed(() => {
  if (previewLasso.value.length === 0) return ''
  return previewLasso.value
    .map((point) => `${panX.value + (point.x + 0.5) * zoom.value},${panY.value + (point.y + 0.5) * zoom.value}`)
    .join(' ')
})
const selectionBoundarySegments = computed(() => {
  const selection = props.selection
  if (!selection || selection.cells.size === 0) return []
  const segments: [number, number, number, number][] = []
  const has = (x: number, y: number) => selection.cells.has(y * selection.width + x)
  const line = (x1: number, y1: number, x2: number, y2: number) => {
    segments.push([x1, y1, x2, y2])
  }
  for (const index of selection.cells) {
    const x = index % selection.width
    const y = Math.floor(index / selection.width)
    if (!has(x, y - 1)) line(x, y, x + 1, y)
    if (!has(x + 1, y)) line(x + 1, y, x + 1, y + 1)
    if (!has(x, y + 1)) line(x + 1, y + 1, x, y + 1)
    if (!has(x - 1, y)) line(x, y + 1, x, y)
  }
  return segments
})

const selectionToolbarStyle = computed(() => {
  if (props.readOnly || props.transformBounds) return null
  const bounds = getSelectionBounds(props.selection ?? null)
  if (!bounds || viewportSize.value.width <= 0 || viewportSize.value.height <= 0) return null
  const rect = docRectToScreen(
    { x: bounds.x, y: bounds.y, w: bounds.width, h: bounds.height },
    { zoom: zoom.value, panX: panX.value, panY: panY.value }
  )
  const viewportWidth = viewportSize.value.width
  const viewportHeight = viewportSize.value.height
  if (rect.left >= viewportWidth || rect.top >= viewportHeight || rect.left + rect.width <= 0 || rect.top + rect.height <= 0) return null

  const toolbarWidth = 242
  const toolbarHeight = 36
  const margin = 8
  const centerX = Math.max(toolbarWidth / 2 + margin, Math.min(rect.left + rect.width / 2, viewportWidth - toolbarWidth / 2 - margin))
  const belowTop = rect.top + rect.height + margin
  const top = belowTop + toolbarHeight <= viewportHeight - margin
    ? Math.max(margin, belowTop)
    : Math.max(margin, Math.min(rect.top - toolbarHeight - margin, viewportHeight - toolbarHeight - margin))
  return { left: `${centerX}px`, top: `${top}px`, transform: 'translateX(-50%)' }
})

function prepareSelectionCanvas(canvas: HTMLCanvasElement): { ctx: CanvasRenderingContext2D; dpr: number } | null {
  const viewport = viewportEl.value
  if (!viewport) return null
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  const rect = viewport.getBoundingClientRect()
  const dpr = window.devicePixelRatio || 1
  resizeScreenCanvas(canvas, rect.width, rect.height, dpr)
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  return { ctx, dpr }
}

function traceSelectionBoundary(ctx: CanvasRenderingContext2D, dpr: number) {
  ctx.beginPath()
  for (const [x1, y1, x2, y2] of selectionBoundarySegments.value) {
    ctx.moveTo(Math.round((panX.value + x1 * zoom.value) * dpr), Math.round((panY.value + y1 * zoom.value) * dpr))
    ctx.lineTo(Math.round((panX.value + x2 * zoom.value) * dpr), Math.round((panY.value + y2 * zoom.value) * dpr))
  }
}

function drawSelectionBase() {
  const canvas = selectionBaseCanvasEl.value
  if (!canvas) return
  const prepared = prepareSelectionCanvas(canvas)
  if (!prepared || !props.selection) return
  const { ctx, dpr } = prepared
  ctx.fillStyle = 'rgba(112, 126, 72, 0.16)'
  for (const index of props.selection.cells) {
    const x = index % props.selection.width
    const y = Math.floor(index / props.selection.width)
    const left = Math.round((panX.value + x * zoom.value) * dpr)
    const top = Math.round((panY.value + y * zoom.value) * dpr)
    const right = Math.round((panX.value + (x + 1) * zoom.value) * dpr)
    const bottom = Math.round((panY.value + (y + 1) * zoom.value) * dpr)
    ctx.fillRect(left, top, right - left, bottom - top)
  }
}

let selectionDashOffset = 0
let selectionAnimationFrame: number | null = null
let lastSelectionAnimationAt = 0

function drawSelectionStroke() {
  const canvas = selectionStrokeCanvasEl.value
  if (!canvas) return
  const prepared = prepareSelectionCanvas(canvas)
  if (!prepared || selectionBoundarySegments.value.length === 0) return
  const { ctx, dpr } = prepared
  traceSelectionBoundary(ctx, dpr)
  ctx.strokeStyle = '#fff'
  ctx.lineWidth = 1.5 * dpr
  ctx.setLineDash([4 * dpr, 4 * dpr])
  ctx.lineDashOffset = selectionDashOffset * dpr
  ctx.stroke()
}

function stopSelectionAnimation() {
  if (selectionAnimationFrame !== null) cancelAnimationFrame(selectionAnimationFrame)
  selectionAnimationFrame = null
  lastSelectionAnimationAt = 0
}

function selectionAnimationTick(timestamp: number) {
  if (selectionBoundarySegments.value.length === 0) {
    stopSelectionAnimation()
    drawSelectionBase()
    drawSelectionStroke()
    return
  }
  if (timestamp - lastSelectionAnimationAt >= 120) {
    selectionDashOffset = (selectionDashOffset - 1) % 8
    lastSelectionAnimationAt = timestamp
    drawSelectionStroke()
  }
  selectionAnimationFrame = requestAnimationFrame(selectionAnimationTick)
}

function startSelectionAnimation() {
  drawSelectionBase()
  drawSelectionStroke()
  if (selectionBoundarySegments.value.length === 0) {
    stopSelectionAnimation()
    return
  }
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || selectionAnimationFrame !== null) return
  selectionAnimationFrame = requestAnimationFrame(selectionAnimationTick)
}

watch(
  () => props.selection,
  () => nextTick(startSelectionAnimation),
  { immediate: true }
)

/**
 * 高亮格缓存：只依赖 highlightCode/renderVersion/doc，不随 previewCells（拖动中的形状预览）变化重算。
 * 此前每次 renderOverlay 都整屏重扫一遍 grid 找高亮格，形状预览拖动时会被这趟无关扫描拖累；
 * 现在扫描结果缓存进这个 computed，renderOverlay 只读现成列表绘制。
 */
const highlightCells = computed<CellPos[]>(() => {
  void props.renderVersion // 显式声明依赖：父组件结构性变更（撤销/重做/改色等）驱动的信号
  if (!props.highlightCode) return []
  const frame = getFrame(props.doc, props.frameIndex)
  const width = props.doc.width
  const height = props.doc.height
  const cells: CellPos[] = []
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (getCell(getLayer(frame, props.activeLayerId), width, x, y) === props.highlightCode) {
        cells.push({ x, y })
      }
    }
  }
  return cells
})

function renderOverlay() {
  const canvas = overlayCanvasEl.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.clearRect(0, 0, canvas.width, canvas.height)

  if (previewCells.value.length > 0) {
    const previewHex = props.currentHex
    ctx.fillStyle = previewHex || 'rgba(120,120,120,0.6)'
    ctx.globalAlpha = 0.65
    for (const { x, y } of previewCells.value) {
      if (x < 0 || x >= props.doc.width || y < 0 || y >= props.doc.height) continue
      ctx.fillRect(x, y, 1, 1)
    }
    ctx.globalAlpha = 1
  }

  if (highlightCells.value.length > 0) {
    ctx.fillStyle = 'rgba(255,255,255,0.85)'
    for (const { x, y } of highlightCells.value) {
      ctx.fillRect(x, y, 1, 1)
    }
  }
  blitOverlay() // 覆盖层同理，画完离屏真值立即同步到屏幕展示层
}

// previewCells/selection 都是整体替换（非原地 push/mutate），浅比较即可感知变化，不需要 deep:true 深度遍历比较
watch(
  () => [previewCells.value, props.highlightCode, props.renderVersion],
  () => nextTick(renderOverlay),
  { immediate: true }
)

onMounted(() => {
  renderBase()
  renderOverlay()
})

// ---- 指针交互 ----
let dragging = false
let eyedropDragging = false
let lastCell: { x: number; y: number } | null = null
let startCell: { x: number; y: number } | null = null
let panLast: { x: number; y: number } | null = null
let moveStartCell: { x: number; y: number } | null = null
let lastMoveDelta = { x: 0, y: 0 }
let zoomDragLast: { x: number; y: number } | null = null
let zoomAnchor: { x: number; y: number } | null = null
let selectionMode: SelectionCombineMode = 'replace'
const isPanning = ref(false)
const isMovingPixels = ref(false)
const isZoomDragging = ref(false)
// 多指针劫持守卫：一次笔画/平移进行中，只响应发起它的那个 pointerId，其余指针（第二根手指/另一支笔）的 down/move/up 一律忽略
let activePointerId: number | null = null

/** 屏幕坐标（clientX/clientY）逆变换回格坐标：先转成相对视口容器左上角的局部坐标，再交给纯函数按 pan/zoom 逆变换取整 */
function cellFromClientPoint(clientX: number, clientY: number): { x: number; y: number } {
  const rect = viewportEl.value?.getBoundingClientRect()
  if (!rect) return { x: 0, y: 0 }
  return screenToCell({ screenX: clientX - rect.left, screenY: clientY - rect.top, zoom: zoom.value, panX: panX.value, panY: panY.value })
}

function currentPaintCode(): PixelCode {
  return props.tool === 'eraser' ? TRANSPARENT_CODE : (props.currentColor ?? TRANSPARENT_CODE)
}

/** Shift 约束：矩形/椭圆锁正方正圆，直线锁 45° 倍角 */
function applyShiftLock(tool: PixelToolKind, from: { x: number; y: number }, to: { x: number; y: number }): { x: number; y: number } {
  const dx = to.x - from.x
  const dy = to.y - from.y
  if (tool === 'rect' || tool === 'ellipse') {
    const size = Math.max(Math.abs(dx), Math.abs(dy))
    return { x: from.x + (dx < 0 ? -size : size), y: from.y + (dy < 0 ? -size : size) }
  }
  if (tool === 'line') {
    const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4)
    const dist = Math.max(Math.abs(dx), Math.abs(dy))
    return { x: from.x + Math.round(Math.cos(angle) * dist), y: from.y + Math.round(Math.sin(angle) * dist) }
  }
  return to
}

function computeShapePreview(from: { x: number; y: number }, to: { x: number; y: number }, shiftLock: boolean): CellPos[] {
  const target = shiftLock ? applyShiftLock(props.tool, from, to) : to
  if (props.tool === 'line') return rasterLine(from.x, from.y, target.x, target.y)
  if (props.tool === 'rect') return rasterRect(from.x, from.y, target.x, target.y, props.shapeFilled)
  if (props.tool === 'ellipse') return rasterEllipse(from.x, from.y, target.x, target.y, props.shapeFilled)
  return []
}

function updateCursorInfo(cell: { x: number; y: number }) {
  if (cell.x < 0 || cell.x >= props.doc.width || cell.y < 0 || cell.y >= props.doc.height) {
    emit('cursor-cell', null)
    return
  }
  const { code, hex } = getCompositePixel(getFrame(props.doc, props.frameIndex), props.doc.width, cell.x, cell.y, props.soloLayer ? props.activeLayerId : null)
  emit('cursor-cell', { x: cell.x, y: cell.y, code, hex })
}

function updateEyedropCursor(e: PointerEvent, cell: { x: number; y: number }) {
  if (props.tool !== 'eyedropper') {
    eyedropCursor.value = null
    return
  }
  const rect = viewportEl.value?.getBoundingClientRect()
  if (!rect) return
  const inside = cell.x >= 0 && cell.x < props.doc.width && cell.y >= 0 && cell.y < props.doc.height
  const picked = inside
    ? getCompositePixel(getFrame(props.doc, props.frameIndex), props.doc.width, cell.x, cell.y, props.soloLayer ? props.activeLayerId : null)
    : { code: TRANSPARENT_CODE, hex: null }
  eyedropCursor.value = {
    x: e.clientX - rect.left,
    y: e.clientY - rect.top,
    pickedCode: picked.code,
    pickedHex: picked.hex
  }
}

/** 中键拖动，或按住空格时左键拖动 = 平移画布 */
function isPanTrigger(e: PointerEvent): boolean {
  return e.button === 1 || (e.button === 0 && props.spacePanHeld)
}

function onPointerDown(e: PointerEvent) {
  // 已有一次笔画/平移在进行中时，来自另一个 pointerId 的按下直接忽略，避免多指针互相劫持出现穿越/错位
  if (activePointerId !== null && (dragging || eyedropDragging || isPanning.value || isMovingPixels.value || isZoomDragging.value) && e.pointerId !== activePointerId) return
  activePointerId = e.pointerId
  viewportEl.value?.setPointerCapture?.(e.pointerId)

  if (isPanTrigger(e)) {
    e.preventDefault()
    // 笔刷/形状描边中途按下中键平移：先正常提交当前笔画再进入平移，避免松开中键后继续拖动时把平移路径也当成一笔连续落库
    if (dragging) endDrag()
    isPanning.value = true
    panLast = { x: e.clientX, y: e.clientY }
    return
  }

  if (props.tool === 'zoom') {
    e.preventDefault()
    isZoomDragging.value = true
    zoomDragLast = { x: e.clientX, y: e.clientY }
    const rect = viewportEl.value?.getBoundingClientRect()
    zoomAnchor = rect ? { x: e.clientX - rect.left, y: e.clientY - rect.top } : { x: 0, y: 0 }
    return
  }

  const cell = cellFromClientPoint(e.clientX, e.clientY)
  updateEyedropCursor(e, cell)

  if (props.tool === 'eyedropper') {
    eyedropDragging = true
    const { code, hex } = getCompositePixel(getFrame(props.doc, props.frameIndex), props.doc.width, cell.x, cell.y, props.soloLayer ? props.activeLayerId : null)
    emit('eyedrop', { code, hex })
    return
  }

  if (props.readOnly) {
    activePointerId = null
    viewportEl.value?.releasePointerCapture?.(e.pointerId)
    return
  }

  if (props.tool === 'bucket') {
    e.preventDefault()
    emit('bucket-fill', cell)
    return
  }


  if (props.tool === 'select' && e.ctrlKey) {
    e.preventDefault()
    isMovingPixels.value = true
    moveStartCell = cell
    lastMoveDelta = { x: 0, y: 0 }
    emit('move-start')
    return
  }

  dragging = true
  startCell = cell
  lastCell = cell

  if (props.tool === 'brush' || props.tool === 'eraser') {
    emit('stroke-start')
    emit('paint-cells', rasterBrush(cell.x, cell.y, props.brushSize), currentPaintCode())
  } else if (props.tool === 'line' || props.tool === 'rect' || props.tool === 'ellipse') {
    previewCells.value = computeShapePreview(cell, cell, e.shiftKey)
  } else if (props.tool === 'select') {
    previewSelection.value = { x0: cell.x, y0: cell.y, x1: cell.x, y1: cell.y }
  } else if (props.tool === 'marquee') {
    selectionMode = e.ctrlKey || e.metaKey ? 'subtract' : e.shiftKey ? 'add' : 'replace'
    if (selectionMode === 'replace') emit('selection-change', null)
    previewSelection.value = { x0: cell.x, y0: cell.y, x1: cell.x, y1: cell.y }
  } else if (props.tool === 'lasso') {
    selectionMode = e.ctrlKey || e.metaKey ? 'subtract' : e.shiftKey ? 'add' : 'replace'
    if (selectionMode === 'replace') emit('selection-change', null)
    previewLasso.value = [cell]
  }
}

function onPointerMove(e: PointerEvent) {
  if (activePointerId !== null && e.pointerId !== activePointerId) return
  const cell = cellFromClientPoint(e.clientX, e.clientY)
  updateCursorInfo(cell)
  updateEyedropCursor(e, cell)

  if (eyedropDragging && props.tool === 'eyedropper') {
    const { code, hex } = getCompositePixel(getFrame(props.doc, props.frameIndex), props.doc.width, cell.x, cell.y, props.soloLayer ? props.activeLayerId : null)
    emit('eyedrop', { code, hex })
  }

  if (isPanning.value && panLast) {
    panX.value += e.clientX - panLast.x
    panY.value += e.clientY - panLast.y
    panLast = { x: e.clientX, y: e.clientY }
    emitViewportChange()
    return
  }


  if (isZoomDragging.value && zoomDragLast && zoomAnchor) {
    const delta = (e.clientX - zoomDragLast.x) - (e.clientY - zoomDragLast.y)
    if (delta !== 0) {
      const next = zoomToward(
        { zoom: zoom.value, panX: panX.value, panY: panY.value },
        zoom.value * Math.exp(delta * 0.012),
        zoomAnchor.x,
        zoomAnchor.y
      )
      zoom.value = next.zoom
      panX.value = next.panX
      panY.value = next.panY
      zoomDragLast = { x: e.clientX, y: e.clientY }
      emitViewportChange()
    }
    return
  }

  if (isMovingPixels.value && moveStartCell) {
    const dx = cell.x - moveStartCell.x
    const dy = cell.y - moveStartCell.y
    if (dx !== lastMoveDelta.x || dy !== lastMoveDelta.y) {
      lastMoveDelta = { x: dx, y: dy }
      emit('move-preview', dx, dy)
    }
    return
  }

  if (!dragging || !lastCell || !startCell) return

  if (props.tool === 'brush' || props.tool === 'eraser') {
    if (cell.x === lastCell.x && cell.y === lastCell.y) return
    const path = rasterLine(lastCell.x, lastCell.y, cell.x, cell.y)
    const cells: CellPos[] = []
    for (const pt of path) cells.push(...rasterBrush(pt.x, pt.y, props.brushSize))
    emit('paint-cells', cells, currentPaintCode())
    lastCell = cell
  } else if (props.tool === 'line' || props.tool === 'rect' || props.tool === 'ellipse') {
    previewCells.value = computeShapePreview(startCell, cell, e.shiftKey)
  } else if (props.tool === 'select' || props.tool === 'marquee') {
    previewSelection.value = { x0: startCell.x, y0: startCell.y, x1: cell.x, y1: cell.y }
  } else if (props.tool === 'lasso') {
    const previous = previewLasso.value[previewLasso.value.length - 1]
    if (!previous || previous.x !== cell.x || previous.y !== cell.y) previewLasso.value = [...previewLasso.value, cell]
  }
}

function endDrag() {
  if (!dragging) return
  dragging = false

  if (props.tool === 'brush' || props.tool === 'eraser') {
    emit('stroke-end')
  } else if ((props.tool === 'line' || props.tool === 'rect' || props.tool === 'ellipse') && previewCells.value.length > 0) {
    emit('commit-shape', previewCells.value, currentPaintCode())
    previewCells.value = []
  } else if (props.tool === 'select' && previewSelection.value) {
    previewSelection.value = null
  } else if (props.tool === 'marquee' && previewSelection.value) {
    const incoming = createRectSelection(props.doc.width, props.doc.height, previewSelection.value)
    emit('selection-change', combineSelection(props.selection ?? null, incoming, selectionMode))
    previewSelection.value = null
  } else if (props.tool === 'lasso' && previewLasso.value.length > 0) {
    const incoming = createLassoSelection(props.doc.width, props.doc.height, previewLasso.value)
    emit('selection-change', combineSelection(props.selection ?? null, incoming, selectionMode))
    previewLasso.value = []
  }
  lastCell = null
  startCell = null
}

function onPointerUp(e: PointerEvent) {
  if (activePointerId !== null && e.pointerId !== activePointerId) return
  if (eyedropDragging) {
    eyedropDragging = false
    viewportEl.value?.releasePointerCapture?.(e.pointerId)
    activePointerId = null
    return
  }
  if (isPanning.value) {
    isPanning.value = false
    panLast = null
    viewportEl.value?.releasePointerCapture?.(e.pointerId)
    activePointerId = null
    return
  }
  if (isZoomDragging.value) {
    isZoomDragging.value = false
    zoomDragLast = null
    zoomAnchor = null
    viewportEl.value?.releasePointerCapture?.(e.pointerId)
    activePointerId = null
    return
  }
  if (isMovingPixels.value) {
    isMovingPixels.value = false
    moveStartCell = null
    emit('move-end')
    viewportEl.value?.releasePointerCapture?.(e.pointerId)
    activePointerId = null
    return
  }
  endDrag()
  viewportEl.value?.releasePointerCapture?.(e.pointerId)
  activePointerId = null
  stopSelectionAnimation()
}

function onPointerLeave() {
  emit('cursor-cell', null)
  eyedropCursor.value = null
  // 形状/选区工具离开画布不取消预览，避免拖出边界又回来时预览丢失；笔刷/橡皮离开则结束本次描边
  if (props.tool === 'brush' || props.tool === 'eraser') {
    endDrag()
    activePointerId = null
  }
}

function onContextMenu(e: MouseEvent) {
  e.preventDefault()
}

function onWheel(e: WheelEvent) {
  const rect = viewportEl.value?.getBoundingClientRect()
  if (!rect) return
  if (props.tool !== 'zoom') {
    if (e.shiftKey) panX.value -= e.deltaY || e.deltaX
    else panY.value -= e.deltaY
    emitViewportChange()
    return
  }
  const next = zoomAtPointer({
    zoom: zoom.value,
    panX: panX.value,
    panY: panY.value,
    pointerX: e.clientX - rect.left,
    pointerY: e.clientY - rect.top,
    deltaY: e.deltaY
  })
  zoom.value = next.zoom
  panX.value = next.panX
  panY.value = next.panY
  emitViewportChange()
}

onBeforeUnmount(() => {
  // 拖动过程中卸载（如切换文档）时不遗留任何模块级状态；组件内 ref 会随实例销毁自动回收，这里仅作显式收口
  dragging = false
  eyedropDragging = false
  isPanning.value = false
  isMovingPixels.value = false
  isZoomDragging.value = false
  activePointerId = null
  stopTransformResize()
  gridResizeObserver?.disconnect()
  gridResizeObserver = null
})
</script>

<style scoped>
.pixel-viewport {
  position: relative;
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background: var(--ps-canvas-backdrop);
  cursor: crosshair;
  touch-action: none;
}
.pixel-viewport--pan-ready {
  cursor: grab;
}
.pixel-viewport--panning {
  cursor: grabbing;
}
.pixel-viewport--eyedropper:not(.pixel-viewport--pan-ready):not(.pixel-viewport--panning) {
  cursor: none;
}
.pixel-viewport--zoom:not(.pixel-viewport--pan-ready):not(.pixel-viewport--panning) {
  cursor: zoom-in;
}
.pixel-viewport--bucket:not(.pixel-viewport--pan-ready):not(.pixel-viewport--panning) { cursor: cell; }
.pixel-eyedrop-cursor { position: absolute; width: 0; height: 0; z-index: 6; pointer-events: none; color: var(--ps-text); }
.pixel-eyedrop-cursor__ring { position: absolute; left: -74px; top: -74px; width: 148px; height: 148px; border-radius: 50%; background: transparent; }
.pixel-eyedrop-cursor__fill { position: absolute; inset: 0; border-radius: 50%; overflow: hidden; -webkit-mask: radial-gradient(circle,transparent 0 52px,#000 53px); mask: radial-gradient(circle,transparent 0 52px,#000 53px); }
.pixel-eyedrop-cursor__new,.pixel-eyedrop-cursor__old { position: absolute; left: 0; right: 0; height: 50%; }
.pixel-eyedrop-cursor__new { top: 0; }
.pixel-eyedrop-cursor__old { bottom: 0; }
.pixel-eyedrop-cursor__transparent { background-color: var(--ps-checker-a); background-image: linear-gradient(45deg,var(--ps-checker-b) 25%,transparent 25%),linear-gradient(-45deg,var(--ps-checker-b) 25%,transparent 25%); background-size: 8px 8px; }
.pixel-eyedrop-cursor__outline { position: absolute; inset: 0; border: 1px solid color-mix(in srgb,var(--ps-text) 60%,transparent); border-radius: 50%; }
.pixel-eyedrop-cursor__outline::after { content: ''; position: absolute; inset: 21px; border: 1px solid color-mix(in srgb,var(--ps-text) 60%,transparent); border-radius: 50%; }
.pixel-eyedrop-cursor__icon {
  /* Lucide pipette 的采样尖端位于 viewBox (2,22)，按 28px 图标换算后把该点精确压到圆环/真实取色坐标 (0,0)。 */
  position: absolute;
  left: -2.333px;
  top: -25.667px;
  width: 28px;
  height: 28px;
  filter: drop-shadow(0 1px 1px var(--ps-bg-panel));
}
.pixel-stage {
  position: absolute;
  top: 0;
  left: 0;
  transform-origin: 0 0;
}
.pixel-stage--checker {
  background-image: linear-gradient(45deg, var(--ps-checker-b) 25%, transparent 25%), linear-gradient(-45deg, var(--ps-checker-b) 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, var(--ps-checker-b) 75%), linear-gradient(-45deg, transparent 75%, var(--ps-checker-b) 75%);
  background-size: 4px 4px;
  background-position: 0 0, 0 2px, 2px -2px, -2px 0;
  background-color: var(--ps-checker-a);
}
.pixel-canvas--offscreen {
  /* 只作为离屏真值缓冲（renderBase/applyCellPatch/renderOverlay 写入源），不再直接展示；
     实际展示由 .pixel-screen-canvas 每帧 blit 而来，见 CanvasBoard.vue 的 blitLayer()。 */
  display: none;
}
.pixel-screen-canvas {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  image-rendering: pixelated;
  image-rendering: crisp-edges;
}
.pixel-canvas--blink {
  animation: pixel-highlight-blink 0.9s ease-in-out infinite;
}
@keyframes pixel-highlight-blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.15; }
}
.pixel-grid-canvas {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}
/* V 与矩形选区拖画过程共用矩形预览；只有 M/R 生成的正式选区会另画持久蚂蚁线。 */
.pixel-selection-marquee {
  position: absolute;
  pointer-events: none;
  box-sizing: border-box;
  background-color: color-mix(in srgb, var(--ps-accent-bg) 18%, transparent);
}
.pixel-lasso-preview {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  overflow: visible;
}
.pixel-selection-canvas {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}
.pixel-transform-box {
  position: absolute;
  z-index: 7;
  box-sizing: border-box;
  border: 1px dashed var(--ps-accent-bg);
  pointer-events: none;
}
.pixel-transform-box__hint {
  position: absolute;
  left: 0;
  bottom: calc(100% + 6px);
  padding: 2px 6px;
  white-space: nowrap;
  border: 1px solid var(--ps-border-strong);
  background: var(--ps-bg-panel);
  color: var(--ps-text-secondary);
  font-size: 10px;
  line-height: 16px;
}
.pixel-transform-handle {
  position: absolute;
  width: 9px;
  height: 9px;
  padding: 0;
  border: 1px solid var(--ps-accent-bg);
  background: var(--ps-bg-panel);
  pointer-events: auto;
}
.pixel-transform-handle--nw { left: 0; top: 0; transform: translate(-50%, -50%); cursor: nwse-resize; }
.pixel-transform-handle--n { left: 50%; top: 0; transform: translate(-50%, -50%); cursor: ns-resize; }
.pixel-transform-handle--ne { right: 0; top: 0; transform: translate(50%, -50%); cursor: nesw-resize; }
.pixel-transform-handle--e { right: 0; top: 50%; transform: translate(50%, -50%); cursor: ew-resize; }
.pixel-transform-handle--se { right: 0; bottom: 0; transform: translate(50%, 50%); cursor: nwse-resize; }
.pixel-transform-handle--s { left: 50%; bottom: 0; transform: translate(-50%, 50%); cursor: ns-resize; }
.pixel-transform-handle--sw { left: 0; bottom: 0; transform: translate(-50%, 50%); cursor: nesw-resize; }
.pixel-transform-handle--w { left: 0; top: 50%; transform: translate(-50%, -50%); cursor: ew-resize; }
.pixel-lasso-preview polyline {
  fill: color-mix(in srgb, var(--ps-accent-bg) 12%, transparent);
  stroke: var(--ps-accent-bg);
  stroke-width: 1.5;
  stroke-dasharray: 5 4;
  vector-effect: non-scaling-stroke;
}
.pixel-selection-marquee::before {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background-image: linear-gradient(90deg, var(--ps-accent-bg) 50%, #fff 50%), linear-gradient(90deg, var(--ps-accent-bg) 50%, #fff 50%),
    linear-gradient(0deg, var(--ps-accent-bg) 50%, #fff 50%), linear-gradient(0deg, var(--ps-accent-bg) 50%, #fff 50%);
  background-repeat: repeat-x, repeat-x, repeat-y, repeat-y;
  background-size: 8px 2px, 8px 2px, 2px 8px, 2px 8px;
  background-position: 0 0, 0 100%, 0 0, 100% 0;
  animation: pixel-marquee-march 0.5s linear infinite;
}
@keyframes pixel-marquee-march {
  to {
    background-position: 8px 0, -8px 100%, 0 -8px, 100% 8px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .pixel-selection-marquee::before {
    animation: none;
  }
}
</style>
