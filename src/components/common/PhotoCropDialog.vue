<template>
  <AppModalShell
    :open="open"
    :title="title"
    size="lg"
    height-preset="tall"
    :z-index="zIndex"
    body-compact
    @close="handleCancel"
  >
    <div class="photo-crop-dialog">
      <div
        ref="cropFrameRef"
        class="photo-crop-dialog__frame"
        @pointerdown="startDrag"
        @wheel.prevent="handleWheel"
      >
        <img
          v-if="source"
          ref="imageRef"
          class="photo-crop-dialog__image"
          :src="source"
          alt=""
          :style="imageStyle"
          draggable="false"
          @load="handleImageLoad"
        >
        <div class="photo-crop-dialog__mask" aria-hidden="true"></div>
      </div>

      <div class="photo-crop-dialog__controls">
        <label class="photo-crop-dialog__slider">
          <span>缩放</span>
          <input v-model.number="zoom" type="range" min="1" max="4" step="0.01" @input="clampPan">
        </label>
        <div class="photo-crop-dialog__control-buttons">
          <button type="button" @click="nudgeZoom(-0.15)">缩小</button>
          <button type="button" @click="nudgeZoom(0.15)">放大</button>
          <button type="button" @click="resetCrop">重置</button>
        </div>
      </div>
    </div>

    <template #actions>
      <button type="button" class="photo-crop-dialog__btn photo-crop-dialog__btn--secondary" @click="handleCancel">
        取消
      </button>
      <button type="button" class="photo-crop-dialog__btn photo-crop-dialog__btn--primary" :disabled="!imageReady" @click="confirmCrop">
        保存
      </button>
    </template>
  </AppModalShell>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import AppModalShell from './AppModalShell.vue'
import { normalizeSquarePhotoCropPreset, resolveSquarePhotoCropRect } from '../../utils/photoFile'

const props = withDefaults(defineProps<{
  open: boolean
  source: string
  title?: string
  outputSize?: number
  outputMimeType?: 'image/jpeg' | 'image/png'
  outputQuality?: number
  zIndex?: number | string
  initialFocusX?: number
  initialFocusY?: number
  initialZoom?: number
}>(), {
  title: '裁剪照片',
  outputSize: 512,
  outputMimeType: 'image/jpeg',
  outputQuality: 0.92,
  zIndex: 13090,
  initialFocusX: 0.5,
  initialFocusY: 0.5,
  initialZoom: 1
})

const emit = defineEmits<{
  (e: 'cancel'): void
  (e: 'confirm', dataUrl: string): void
}>()

const imageRef = ref<HTMLImageElement | null>(null)
const cropFrameRef = ref<HTMLElement | null>(null)
const imageReady = ref(false)
const naturalWidth = ref(0)
const naturalHeight = ref(0)
const frameSize = ref(360)
const zoom = ref(1)
const panX = ref(0)
const panY = ref(0)
const dragState = ref<{ pointerId: number; startX: number; startY: number; originX: number; originY: number } | null>(null)
let resizeObserver: ResizeObserver | null = null

const baseScale = computed(() => {
  if (!naturalWidth.value || !naturalHeight.value || !frameSize.value) return 1
  return Math.max(frameSize.value / naturalWidth.value, frameSize.value / naturalHeight.value)
})

const scaledWidth = computed(() => naturalWidth.value * baseScale.value * zoom.value)
const scaledHeight = computed(() => naturalHeight.value * baseScale.value * zoom.value)

const imageStyle = computed(() => ({
  width: `${scaledWidth.value}px`,
  height: `${scaledHeight.value}px`,
  transform: `translate(calc(-50% + ${panX.value}px), calc(-50% + ${panY.value}px))`
}))

watch(() => props.open, (open) => {
  if (!open) return
  nextTick(() => {
    observeFrameSize()
    applyInitialCrop()
  })
})

watch(() => props.source, () => {
  imageReady.value = false
  applyInitialCrop()
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  window.removeEventListener('pointermove', handlePointerMove)
  window.removeEventListener('pointerup', stopDrag)
})

function observeFrameSize() {
  resizeObserver?.disconnect()
  const frame = cropFrameRef.value
  if (!frame) return
  const update = () => {
    const rect = frame.getBoundingClientRect()
    frameSize.value = Math.max(240, Math.round(Math.min(rect.width, rect.height)))
    clampPan()
  }
  update()
  resizeObserver = new ResizeObserver(update)
  resizeObserver.observe(frame)
}

function handleImageLoad() {
  const img = imageRef.value
  if (!img) return
  naturalWidth.value = img.naturalWidth || 0
  naturalHeight.value = img.naturalHeight || 0
  imageReady.value = Boolean(naturalWidth.value && naturalHeight.value)
  applyInitialCrop()
}

function resetCrop() {
  zoom.value = 1
  panX.value = 0
  panY.value = 0
  nextTick(clampPan)
}

function applyInitialCrop() {
  const preset = normalizeSquarePhotoCropPreset({
    focusX: props.initialFocusX,
    focusY: props.initialFocusY,
    zoom: props.initialZoom
  })
  zoom.value = preset.zoom
  if (!imageReady.value || !frameSize.value) {
    panX.value = 0
    panY.value = 0
    return
  }
  const rect = resolveSquarePhotoCropRect(naturalWidth.value, naturalHeight.value, preset)
  const scale = frameSize.value / rect.sourceSize
  panX.value = (naturalWidth.value / 2 - rect.sourceX - rect.sourceSize / 2) * scale
  panY.value = (naturalHeight.value / 2 - rect.sourceY - rect.sourceSize / 2) * scale
  nextTick(clampPan)
}

function nudgeZoom(delta: number) {
  zoom.value = Math.max(1, Math.min(4, Number((zoom.value + delta).toFixed(2))))
  clampPan()
}

function handleWheel(event: WheelEvent) {
  const delta = event.deltaY > 0 ? -0.08 : 0.08
  nudgeZoom(delta)
}

function startDrag(event: PointerEvent) {
  if (!imageReady.value) return
  dragState.value = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    originX: panX.value,
    originY: panY.value
  }
  cropFrameRef.value?.setPointerCapture?.(event.pointerId)
  window.addEventListener('pointermove', handlePointerMove)
  window.addEventListener('pointerup', stopDrag)
}

function handlePointerMove(event: PointerEvent) {
  const drag = dragState.value
  if (!drag || drag.pointerId !== event.pointerId) return
  panX.value = drag.originX + event.clientX - drag.startX
  panY.value = drag.originY + event.clientY - drag.startY
  clampPan()
}

function stopDrag(event: PointerEvent) {
  const drag = dragState.value
  if (drag && drag.pointerId === event.pointerId) {
    cropFrameRef.value?.releasePointerCapture?.(event.pointerId)
  }
  dragState.value = null
  window.removeEventListener('pointermove', handlePointerMove)
  window.removeEventListener('pointerup', stopDrag)
}

function clampPan() {
  const maxX = Math.max(0, (scaledWidth.value - frameSize.value) / 2)
  const maxY = Math.max(0, (scaledHeight.value - frameSize.value) / 2)
  panX.value = Math.max(-maxX, Math.min(maxX, panX.value))
  panY.value = Math.max(-maxY, Math.min(maxY, panY.value))
}

function confirmCrop() {
  const img = imageRef.value
  if (!img || !imageReady.value) return
  const scale = baseScale.value * zoom.value
  const sourceSize = frameSize.value / scale
  const sourceX = (naturalWidth.value - sourceSize) / 2 - panX.value / scale
  const sourceY = (naturalHeight.value - sourceSize) / 2 - panY.value / scale
  const canvas = document.createElement('canvas')
  const outputSize = Math.max(128, Math.round(props.outputSize))
  canvas.width = outputSize
  canvas.height = outputSize
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.drawImage(
    img,
    Math.max(0, sourceX),
    Math.max(0, sourceY),
    Math.min(naturalWidth.value, sourceSize),
    Math.min(naturalHeight.value, sourceSize),
    0,
    0,
    outputSize,
    outputSize
  )
  emit('confirm', canvas.toDataURL(props.outputMimeType, props.outputQuality))
}

function handleCancel() {
  emit('cancel')
}
</script>

<style scoped>
.photo-crop-dialog {
  display: grid;
  gap: 16px;
  padding: 4px 2px 2px;
}

.photo-crop-dialog__frame {
  position: relative;
  width: min(360px, calc(100vw - 72px));
  aspect-ratio: 1;
  justify-self: center;
  overflow: hidden;
  border: 1px solid var(--morandi-border);
  border-radius: 18px;
  background: var(--morandi-soft-bg);
  cursor: grab;
  touch-action: none;
}

.photo-crop-dialog__frame:active {
  cursor: grabbing;
}

.photo-crop-dialog__image {
  position: absolute;
  left: 50%;
  top: 50%;
  max-width: none;
  object-fit: contain;
  user-select: none;
  pointer-events: none;
}

.photo-crop-dialog__mask {
  position: absolute;
  inset: 0;
  border: 1px solid rgba(255, 255, 255, 0.7);
  box-shadow: inset 0 0 0 999px rgba(42, 37, 32, 0.08);
  pointer-events: none;
}

.photo-crop-dialog__mask::before,
.photo-crop-dialog__mask::after {
  content: "";
  position: absolute;
  inset: 33.33% 0;
  border-top: 1px solid rgba(255, 255, 255, 0.62);
  border-bottom: 1px solid rgba(255, 255, 255, 0.62);
}

.photo-crop-dialog__mask::after {
  inset: 0 33.33%;
  border: 0;
  border-left: 1px solid rgba(255, 255, 255, 0.62);
  border-right: 1px solid rgba(255, 255, 255, 0.62);
}

.photo-crop-dialog__controls {
  display: grid;
  gap: 12px;
}

.photo-crop-dialog__slider {
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr);
  align-items: center;
  gap: 10px;
  color: var(--morandi-text, #4f463f);
  font-size: 0.9rem;
}

.photo-crop-dialog__slider input {
  width: 100%;
  accent-color: #7ea79d;
}

.photo-crop-dialog__control-buttons {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.photo-crop-dialog__control-buttons button,
.photo-crop-dialog__btn {
  height: 36px;
  border-radius: 10px;
  padding: 0 14px;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
}

.photo-crop-dialog__control-buttons button {
  border: 1px solid var(--morandi-border);
  background: color-mix(in srgb, var(--morandi-card) 88%, transparent);
  color: var(--morandi-text, #4f463f);
}

.photo-crop-dialog__btn {
  min-width: 96px;
}

.photo-crop-dialog__btn--secondary {
  border: 1px solid var(--langhuan-dialog-secondary-border, #b69f86);
  background: var(--langhuan-dialog-secondary-bg, #efe5d8);
  color: var(--langhuan-dialog-secondary-text, #4f4034);
}

.photo-crop-dialog__btn--secondary:hover:not(:disabled) {
  background: var(--langhuan-dialog-secondary-bg-hover, #e4d6c4);
}

.photo-crop-dialog__btn--primary {
  border: 1px solid var(--langhuan-dialog-primary-border, #4f867c);
  background: var(--langhuan-dialog-primary-bg, #4f867c);
  color: #fff;
}

.photo-crop-dialog__btn--primary:hover:not(:disabled) {
  border-color: var(--langhuan-dialog-primary-bg-hover, #416f67);
  background: var(--langhuan-dialog-primary-bg-hover, #416f67);
}

.photo-crop-dialog__btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
</style>
