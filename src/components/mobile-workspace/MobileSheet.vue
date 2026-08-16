<template>
  <Teleport to="body" :disabled="!open">
    <div v-if="open" class="mobile-sheet" role="presentation">
      <button class="mobile-sheet__scrim" type="button" :aria-label="$t('common.close')" @click="$emit('close')" />
      <section
        class="mobile-sheet__panel"
        :class="{ 'mobile-sheet__panel--tall': tall, 'mobile-sheet__panel--dragging': isDragging }"
        :style="panelStyle"
        role="dialog"
        aria-modal="true"
        :aria-label="title || $t('mobile.sheet.aria')"
      >
        <header class="mobile-sheet__drag-head" @pointerdown="startDrag">
          <span class="mobile-sheet__handle" aria-hidden="true" />
          <div v-if="title" class="mobile-sheet__title">{{ title }}</div>
        </header>
        <div class="mobile-sheet__body"><slot /></div>
      </section>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'

const props = withDefaults(
  defineProps<{
    open: boolean
    title?: string
    /* tall：近全屏面板宿主（钉死高度 + 内部滚动），用于承载桌面端面板组件 */
    tall?: boolean
  }>(),
  {
    title: '',
    tall: false
  }
)

const emit = defineEmits<{
  close: []
}>()

const CLOSE_DISTANCE_PX = 92
const CLOSE_VELOCITY_PX_PER_MS = 0.55

const isDragging = ref(false)
const dragOffset = ref(0)

let dragState: {
  pointerId: number
  startY: number
  lastY: number
  lastTime: number
  velocityY: number
} | null = null

const panelStyle = computed(() => ({
  transform: dragOffset.value > 0 ? `translate3d(0, ${dragOffset.value}px, 0)` : undefined
}))

function getEventTime(event: PointerEvent) {
  return event.timeStamp || performance.now()
}

function cleanupDragListeners() {
  window.removeEventListener('pointermove', handleDragMove)
  window.removeEventListener('pointerup', finishDrag)
  window.removeEventListener('pointercancel', cancelDrag)
}

function resetDrag() {
  cleanupDragListeners()
  dragState = null
  isDragging.value = false
  dragOffset.value = 0
}

function startDrag(event: PointerEvent) {
  if (event.pointerType === 'mouse' && event.button !== 0) return

  const target = event.currentTarget as HTMLElement | null
  target?.setPointerCapture?.(event.pointerId)

  cleanupDragListeners()
  dragState = {
    pointerId: event.pointerId,
    startY: event.clientY,
    lastY: event.clientY,
    lastTime: getEventTime(event),
    velocityY: 0
  }
  isDragging.value = true

  window.addEventListener('pointermove', handleDragMove, { passive: false })
  window.addEventListener('pointerup', finishDrag)
  window.addEventListener('pointercancel', cancelDrag)
}

function handleDragMove(event: PointerEvent) {
  if (!dragState || event.pointerId !== dragState.pointerId) return

  const deltaY = Math.max(0, event.clientY - dragState.startY)
  const now = getEventTime(event)
  const elapsed = Math.max(1, now - dragState.lastTime)

  dragState.velocityY = (event.clientY - dragState.lastY) / elapsed
  dragState.lastY = event.clientY
  dragState.lastTime = now
  dragOffset.value = deltaY

  if (deltaY > 0 && event.cancelable) {
    event.preventDefault()
  }
}

function finishDrag(event: PointerEvent) {
  if (!dragState || event.pointerId !== dragState.pointerId) return

  const shouldClose =
    dragOffset.value >= CLOSE_DISTANCE_PX ||
    (dragOffset.value >= 36 && dragState.velocityY >= CLOSE_VELOCITY_PX_PER_MS)

  resetDrag()

  if (shouldClose) {
    emit('close')
  }
}

function cancelDrag(event: PointerEvent) {
  if (!dragState || event.pointerId === dragState.pointerId) {
    resetDrag()
  }
}

watch(
  () => props.open,
  (open) => {
    if (!open) resetDrag()
  }
)

onBeforeUnmount(resetDrag)
</script>

<style scoped>
.mobile-sheet {
  position: fixed;
  inset: 0;
  /* 移动 Sheet 保留拖拽原语，但作为模态层必须覆盖星依浮坞。 */
  z-index: 13000;
  display: flex;
  align-items: flex-end;
}

.mobile-sheet__scrim {
  position: absolute;
  inset: 0;
  border: 0;
  background: rgba(72, 68, 63, 0.18);
  backdrop-filter: blur(2px);
  -webkit-backdrop-filter: blur(2px);
}

.mobile-sheet__panel {
  position: relative;
  z-index: 1;
  width: 100%;
  max-height: min(78vh, 620px);
  overflow: auto;
  border-top: 1px solid var(--lhm-border-line, #e5e5e5);
  border-radius: 18px 18px 0 0;
  background: var(--lhm-card, #fffdf8);
  box-shadow: 0 -10px 30px rgba(56, 46, 38, 0.14);
  padding: 16px 18px max(28px, env(safe-area-inset-bottom, 28px));
  transition: transform 0.16s ease-out;
  will-change: transform;
}

.mobile-sheet__panel--dragging {
  transition: none;
}

.mobile-sheet__drag-head {
  margin: -8px -8px 8px;
  padding: 10px 8px 8px;
  cursor: grab;
  touch-action: none;
  user-select: none;
}

.mobile-sheet__handle {
  display: block;
  width: 38px;
  height: 4px;
  margin: 0 auto 10px;
  border-radius: 2px;
  background: var(--lhm-border, #e0e0e0);
}

.mobile-sheet__title {
  color: var(--lhm-text-light, #666);
  font-size: 13px;
  font-weight: 600;
}

/* 近全屏面板宿主：钉死高度，面板正文在 __body 内部滚动 */
.mobile-sheet__panel--tall {
  display: flex;
  height: 92vh;
  max-height: 92vh;
  flex-direction: column;
  overflow: hidden;
  padding: 12px 12px max(16px, env(safe-area-inset-bottom, 16px));
}

.mobile-sheet__panel--tall .mobile-sheet__body {
  flex: 1;
  min-height: 0;
  overflow: auto;
}
</style>
