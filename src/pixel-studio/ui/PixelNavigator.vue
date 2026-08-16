<template>
  <section
    ref="rootEl"
    class="pixel-navigator"
    :style="windowStyle"
    aria-label="缩略图导航器"
  >
    <header class="pixel-navigator__header" @pointerdown="startWindowDrag">
      <span>缩略图</span>
      <button type="button" class="pixel-navigator__close" title="关闭缩略图" @pointerdown.stop @click="$emit('close')">×</button>
    </header>
    <div
      ref="contentEl"
      class="pixel-navigator__content"
      :class="{ 'pixel-navigator__content--pan-ready': spaceHeld, 'pixel-navigator__content--panning': !!previewPanDrag }"
      title="滚轮缩放；点击或拖动导航主画布；按住 Space 拖动画面"
      tabindex="0"
      @wheel.stop.prevent="onWheel"
      @pointerdown="startNavigate"
      @pointermove="moveNavigate"
      @pointerup="stopNavigate"
      @pointercancel="stopNavigate"
      @keydown.space.stop.prevent="onSpaceDown"
      @keyup.space.stop.prevent="onSpaceUp"
      @blur="onContentBlur"
    >
      <canvas ref="canvasEl" class="pixel-navigator__canvas" :style="canvasStyle" />
      <span class="pixel-navigator__viewport" :style="viewportStyle" />
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { PixelDocument } from '../core'
import { TRANSPARENT_CODE, getCompositePixel, getFrame } from '../core'
import type { PixelViewportState } from './uiTypes'

interface NavigatorLayout {
  x: number | null
  y: number
  width: number
  height: number
  previewZoom: number
  previewPanX: number
  previewPanY: number
}

const props = defineProps<{
  doc: PixelDocument
  frameIndex: number
  renderVersion: number
  viewport: PixelViewportState
  soloLayerId?: string | null
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'navigate', point: { x: number; y: number }): void
}>()

const STORAGE_KEY = 'pixel-studio:navigator-layout'
const DEFAULT_LAYOUT: NavigatorLayout = {
  x: null,
  y: 12,
  width: 240,
  height: 210,
  previewZoom: 1,
  previewPanX: 0,
  previewPanY: 0
}

function loadLayout(): NavigatorLayout {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? 'null') as Partial<NavigatorLayout> | null
    if (!parsed) return { ...DEFAULT_LAYOUT }
    return {
      x: typeof parsed.x === 'number' ? parsed.x : null,
      y: typeof parsed.y === 'number' ? parsed.y : DEFAULT_LAYOUT.y,
      width: typeof parsed.width === 'number' ? parsed.width : DEFAULT_LAYOUT.width,
      height: typeof parsed.height === 'number' ? parsed.height : DEFAULT_LAYOUT.height,
      previewZoom: typeof parsed.previewZoom === 'number' ? parsed.previewZoom : 1,
      previewPanX: typeof parsed.previewPanX === 'number' ? parsed.previewPanX : 0,
      previewPanY: typeof parsed.previewPanY === 'number' ? parsed.previewPanY : 0
    }
  } catch {
    return { ...DEFAULT_LAYOUT }
  }
}

const layout = ref(loadLayout())
const rootEl = ref<HTMLElement | null>(null)
const contentEl = ref<HTMLElement | null>(null)
const canvasEl = ref<HTMLCanvasElement | null>(null)
let resizeObserver: ResizeObserver | null = null

/** left/top 的唯一参照系必须与浏览器真正解释 absolute 定位的 offsetParent 一致。 */
function positioningParent(): HTMLElement | null {
  return (rootEl.value?.offsetParent as HTMLElement | null) ?? rootEl.value?.parentElement ?? null
}

function parentSize() {
  const rect = positioningParent()?.getBoundingClientRect()
  return { width: rect?.width ?? window.innerWidth, height: rect?.height ?? window.innerHeight }
}

function clampWindow() {
  const parent = parentSize()
  layout.value.width = Math.max(180, Math.min(layout.value.width, Math.max(180, parent.width)))
  layout.value.height = Math.max(150, Math.min(layout.value.height, Math.max(150, parent.height)))
  if (layout.value.x === null) layout.value.x = Math.max(0, parent.width - layout.value.width - 12)
  layout.value.x = Math.max(0, Math.min(layout.value.x, Math.max(0, parent.width - layout.value.width)))
  layout.value.y = Math.max(0, Math.min(layout.value.y, Math.max(0, parent.height - layout.value.height)))
}

function saveLayout() {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(layout.value))
}

const windowStyle = computed(() => ({
  left: `${layout.value.x ?? 0}px`,
  top: `${layout.value.y}px`,
  width: `${layout.value.width}px`,
  height: `${layout.value.height}px`
}))

function contentSize() {
  const rect = contentEl.value?.getBoundingClientRect()
  return { width: rect?.width ?? Math.max(1, layout.value.width), height: rect?.height ?? Math.max(1, layout.value.height - 29) }
}

function previewTransform() {
  const size = contentSize()
  const fit = Math.min(size.width / props.doc.width, size.height / props.doc.height)
  const scale = Math.max(0.001, fit * layout.value.previewZoom)
  return {
    scale,
    originX: (size.width - props.doc.width * scale) / 2 + layout.value.previewPanX,
    originY: (size.height - props.doc.height * scale) / 2 + layout.value.previewPanY
  }
}

const canvasStyle = computed(() => {
  const { scale, originX, originY } = previewTransform()
  return { transform: `translate(${originX}px, ${originY}px) scale(${scale})` }
})

const viewportStyle = computed(() => {
  const { scale, originX, originY } = previewTransform()
  const zoom = Math.max(0.001, props.viewport.zoom)
  return {
    left: `${originX + (-props.viewport.panX / zoom) * scale}px`,
    top: `${originY + (-props.viewport.panY / zoom) * scale}px`,
    width: `${(props.viewport.viewportWidth / zoom) * scale}px`,
    height: `${(props.viewport.viewportHeight / zoom) * scale}px`
  }
})

function drawPreview() {
  const canvas = canvasEl.value
  if (!canvas) return
  canvas.width = props.doc.width
  canvas.height = props.doc.height
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  const frame = getFrame(props.doc, props.frameIndex)
  for (let y = 0; y < props.doc.height; y++) {
    for (let x = 0; x < props.doc.width; x++) {
      const pixel = getCompositePixel(frame, props.doc.width, x, y, props.soloLayerId ?? null)
      if (pixel.code === TRANSPARENT_CODE || !pixel.hex) continue
      ctx.fillStyle = pixel.hex
      ctx.fillRect(x, y, 1, 1)
    }
  }
}

watch(() => [props.doc, props.renderVersion, props.soloLayerId], () => nextTick(drawPreview))

let windowDrag: { pointerId: number; offsetX: number; offsetY: number } | null = null
function startWindowDrag(e: PointerEvent) {
  if ((e.target as HTMLElement).closest('button')) return
  const rect = rootEl.value?.getBoundingClientRect()
  if (!rect) return
  e.preventDefault()
  windowDrag = { pointerId: e.pointerId, offsetX: e.clientX - rect.left, offsetY: e.clientY - rect.top }
  window.addEventListener('pointermove', moveWindow)
  window.addEventListener('pointerup', stopWindowDrag)
}
function moveWindow(e: PointerEvent) {
  if (!windowDrag || e.pointerId !== windowDrag.pointerId) return
  const parentRect = positioningParent()?.getBoundingClientRect()
  if (!parentRect) return
  layout.value.x = e.clientX - parentRect.left - windowDrag.offsetX
  layout.value.y = e.clientY - parentRect.top - windowDrag.offsetY
  clampWindow()
}
function stopWindowDrag(e: PointerEvent) {
  if (!windowDrag || e.pointerId !== windowDrag.pointerId) return
  windowDrag = null
  window.removeEventListener('pointermove', moveWindow)
  window.removeEventListener('pointerup', stopWindowDrag)
  saveLayout()
}

function onWheel(e: WheelEvent) {
  const rect = contentEl.value?.getBoundingClientRect()
  if (!rect) return
  const pointerX = e.clientX - rect.left
  const pointerY = e.clientY - rect.top
  const before = previewTransform()
  const docX = (pointerX - before.originX) / before.scale
  const docY = (pointerY - before.originY) / before.scale
  layout.value.previewZoom = Math.max(0.25, Math.min(8, layout.value.previewZoom * Math.exp(-e.deltaY * 0.0015)))
  const size = contentSize()
  const fit = Math.min(size.width / props.doc.width, size.height / props.doc.height)
  const nextScale = fit * layout.value.previewZoom
  layout.value.previewPanX = pointerX - (size.width - props.doc.width * nextScale) / 2 - docX * nextScale
  layout.value.previewPanY = pointerY - (size.height - props.doc.height * nextScale) / 2 - docY * nextScale
  saveLayout()
}

let navigatingPointerId: number | null = null
const spaceHeld = ref(false)
let previewPanDrag: { pointerId: number; lastX: number; lastY: number } | null = null

function onSpaceDown(e: KeyboardEvent) {
  if (!e.repeat) spaceHeld.value = true
}
function onSpaceUp() {
  spaceHeld.value = false
}
function onContentBlur() {
  spaceHeld.value = false
}
function navigateFromEvent(e: PointerEvent) {
  const rect = contentEl.value?.getBoundingClientRect()
  if (!rect) return
  const { scale, originX, originY } = previewTransform()
  emit('navigate', {
    x: Math.max(0, Math.min(props.doc.width, (e.clientX - rect.left - originX) / scale)),
    y: Math.max(0, Math.min(props.doc.height, (e.clientY - rect.top - originY) / scale))
  })
}
function startNavigate(e: PointerEvent) {
  contentEl.value?.focus({ preventScroll: true })
  if (spaceHeld.value) {
    previewPanDrag = { pointerId: e.pointerId, lastX: e.clientX, lastY: e.clientY }
    contentEl.value?.setPointerCapture?.(e.pointerId)
    return
  }
  navigatingPointerId = e.pointerId
  contentEl.value?.setPointerCapture?.(e.pointerId)
  navigateFromEvent(e)
}
function moveNavigate(e: PointerEvent) {
  if (previewPanDrag?.pointerId === e.pointerId) {
    layout.value.previewPanX += e.clientX - previewPanDrag.lastX
    layout.value.previewPanY += e.clientY - previewPanDrag.lastY
    previewPanDrag.lastX = e.clientX
    previewPanDrag.lastY = e.clientY
    return
  }
  if (navigatingPointerId === e.pointerId) navigateFromEvent(e)
}
function stopNavigate(e: PointerEvent) {
  if (previewPanDrag?.pointerId === e.pointerId) {
    previewPanDrag = null
    contentEl.value?.releasePointerCapture?.(e.pointerId)
    saveLayout()
    return
  }
  if (navigatingPointerId !== e.pointerId) return
  navigatingPointerId = null
  contentEl.value?.releasePointerCapture?.(e.pointerId)
}

function onWindowResize() {
  clampWindow()
}

onMounted(() => {
  clampWindow()
  nextTick(drawPreview)
  if (typeof ResizeObserver !== 'undefined' && rootEl.value) {
    resizeObserver = new ResizeObserver(() => {
      if (!rootEl.value) return
      const rect = rootEl.value.getBoundingClientRect()
      if (rect.width > 0) layout.value.width = rect.width
      if (rect.height > 0) layout.value.height = rect.height
      clampWindow()
      saveLayout()
    })
    resizeObserver.observe(rootEl.value)
    const parent = positioningParent()
    if (parent) resizeObserver.observe(parent)
  }
  window.addEventListener('resize', onWindowResize)
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  window.removeEventListener('resize', onWindowResize)
  window.removeEventListener('pointermove', moveWindow)
  window.removeEventListener('pointerup', stopWindowDrag)
  previewPanDrag = null
})
</script>

<style scoped>
.pixel-navigator {
  position: absolute;
  z-index: 14;
  min-width: 180px;
  min-height: 150px;
  max-width: 100%;
  max-height: 100%;
  resize: both;
  overflow: hidden;
  box-sizing: border-box;
  border: 1px solid var(--ps-border-strong);
  background: var(--ps-bg-panel);
  box-shadow: 0 3px 12px color-mix(in srgb, var(--ps-text) 14%, transparent);
}
.pixel-navigator__header {
  height: 28px;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 7px 0 9px;
  border-bottom: 1px solid var(--ps-border);
  color: var(--ps-text-secondary);
  font-size: 12px;
  font-weight: 600;
  cursor: move;
  touch-action: none;
}
.pixel-navigator__close {
  width: 22px;
  height: 22px;
  padding: 0;
  border: 0;
  color: var(--ps-text-weak);
  background: transparent;
  font-size: 17px;
  cursor: pointer;
}
.pixel-navigator__close:hover { color: var(--ps-text); background: var(--ps-bg-control); }
.pixel-navigator__content {
  position: absolute;
  inset: 29px 0 0;
  overflow: hidden;
  background-color: var(--ps-checker-a);
  background-image: linear-gradient(45deg,var(--ps-checker-b) 25%,transparent 25%),linear-gradient(-45deg,var(--ps-checker-b) 25%,transparent 25%);
  background-size: 8px 8px;
  cursor: crosshair;
  touch-action: none;
  outline: none;
}
.pixel-navigator__content--pan-ready { cursor: grab; }
.pixel-navigator__content--panning { cursor: grabbing; }
.pixel-navigator__canvas {
  position: absolute;
  left: 0;
  top: 0;
  transform-origin: 0 0;
  image-rendering: pixelated;
  image-rendering: crisp-edges;
  pointer-events: none;
}
.pixel-navigator__viewport {
  position: absolute;
  box-sizing: border-box;
  border: 1px solid var(--ps-accent-strong-text);
  background: transparent;
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--ps-bg-panel) 55%, transparent) inset;
  pointer-events: none;
}
</style>
