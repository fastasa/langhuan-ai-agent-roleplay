<template>
  <div
    class="pixel-resize-handle"
    :class="`pixel-resize-handle--${axis}`"
    role="separator"
    :aria-orientation="axis === 'horizontal' ? 'horizontal' : 'vertical'"
    tabindex="0"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerUp"
    @keydown="onKeydown"
  />
</template>

<script setup lang="ts">
import { onBeforeUnmount } from 'vue'

const props = defineProps<{ axis: 'horizontal' | 'vertical' }>()
const emit = defineEmits<{ (e: 'resize', delta: number): void; (e: 'resize-end'): void }>()

let activePointerId: number | null = null
let lastPosition = 0
let previousCursor = ''
let previousUserSelect = ''

function positionOf(e: PointerEvent): number {
  return props.axis === 'horizontal' ? e.clientY : e.clientX
}

function applyDocumentDragState() {
  previousCursor = document.body.style.cursor
  previousUserSelect = document.body.style.userSelect
  document.body.style.cursor = props.axis === 'horizontal' ? 'row-resize' : 'col-resize'
  document.body.style.userSelect = 'none'
}

function clearDocumentDragState() {
  document.body.style.cursor = previousCursor
  document.body.style.userSelect = previousUserSelect
}

function onPointerDown(e: PointerEvent) {
  if (activePointerId !== null) return
  activePointerId = e.pointerId
  lastPosition = positionOf(e)
  ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
  applyDocumentDragState()
  e.preventDefault()
}

function onPointerMove(e: PointerEvent) {
  if (activePointerId !== e.pointerId) return
  const next = positionOf(e)
  const delta = next - lastPosition
  if (delta !== 0) emit('resize', delta)
  lastPosition = next
}

function onPointerUp(e: PointerEvent) {
  if (activePointerId !== e.pointerId) return
  ;(e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId)
  activePointerId = null
  clearDocumentDragState()
  emit('resize-end')
}

function onKeydown(e: KeyboardEvent) {
  const delta = props.axis === 'horizontal'
    ? (e.key === 'ArrowUp' ? -10 : e.key === 'ArrowDown' ? 10 : 0)
    : (e.key === 'ArrowLeft' ? -10 : e.key === 'ArrowRight' ? 10 : 0)
  if (delta === 0) return
  e.preventDefault()
  emit('resize', delta)
  emit('resize-end')
}

onBeforeUnmount(() => {
  if (activePointerId !== null) clearDocumentDragState()
  activePointerId = null
})
</script>

<style scoped>
.pixel-resize-handle { position: relative; flex: none; z-index: 3; touch-action: none; outline: none; }
.pixel-resize-handle::after { content: ''; position: absolute; background: var(--ps-border); transition: background-color .15s ease; }
.pixel-resize-handle:hover::after,.pixel-resize-handle:focus-visible::after { background: var(--ps-accent-active-border); }
.pixel-resize-handle--horizontal { width: 100%; height: 7px; cursor: row-resize; }
.pixel-resize-handle--horizontal::after { left: 0; right: 0; top: 3px; height: 1px; }
.pixel-resize-handle--vertical { width: 7px; height: 100%; cursor: col-resize; }
.pixel-resize-handle--vertical::after { top: 0; bottom: 0; left: 3px; width: 1px; }
</style>
