<template>
  <Teleport to="body">
    <div
      ref="shellRef"
      v-if="open"
      :class="['sidebar-floating-menu-shell', menuClass]"
      :style="resolvedMenuStyle"
    >
      <slot />
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = withDefaults(defineProps<{
  open: boolean
  menuClass?: string | string[] | Record<string, boolean>
  menuStyle?: Record<string, string>
  clampToViewport?: boolean
  viewportOverflow?: 'auto' | 'visible'
  viewportPadding?: number
}>(), {
  menuClass: undefined,
  menuStyle: () => ({}),
  clampToViewport: true,
  viewportOverflow: 'auto',
  viewportPadding: 12
})

const shellRef = ref<HTMLElement | null>(null)
const viewportShift = ref({ x: 0, y: 0 })
const viewportMetaStyle = ref<Record<string, string>>({})

const resolvedMenuStyle = computed<Record<string, string>>(() => {
  const baseStyle = { ...(props.menuStyle || {}) }
  const nextStyle = { ...baseStyle, ...viewportMetaStyle.value }
  if (viewportShift.value.x !== 0 || viewportShift.value.y !== 0) {
    const left = Number.parseFloat(String(baseStyle.left || '0'))
    const top = Number.parseFloat(String(baseStyle.top || '0'))
    if (Number.isFinite(left)) nextStyle.left = `${left + viewportShift.value.x}px`
    if (Number.isFinite(top)) nextStyle.top = `${top + viewportShift.value.y}px`
  }
  return nextStyle
})

function clearViewportClamp() {
  viewportShift.value = { x: 0, y: 0 }
  viewportMetaStyle.value = {}
}

function updateViewportClamp() {
  if (!props.open || !props.clampToViewport || typeof window === 'undefined') {
    clearViewportClamp()
    return
  }
  const element = shellRef.value
  if (!element) return
  const padding = Math.max(Number(props.viewportPadding || 0), 0)
  const previousMaxHeight = element.style.maxHeight
  const previousOverflow = element.style.overflow
  const previousOverflowY = element.style.overflowY
  element.style.maxHeight = ''
  element.style.overflow = 'visible'
  element.style.overflowY = 'visible'
  const rect = element.getBoundingClientRect()
  const maxWidth = Math.max(window.innerWidth - (padding * 2), 120)
  const maxHeight = Math.max(window.innerHeight - (padding * 2), 120)
  const contentWidth = Math.max(rect.width || 0, element.scrollWidth || 0)
  const contentHeight = Math.max(rect.height || 0, element.scrollHeight || 0)
  element.style.maxHeight = previousMaxHeight
  element.style.overflow = previousOverflow
  element.style.overflowY = previousOverflowY
  const clampedWidth = Math.min(contentWidth || maxWidth, maxWidth)
  const clampedHeight = Math.min(contentHeight || maxHeight, maxHeight)
  const desiredLeft = Math.min(
    Math.max(rect.left, padding),
    Math.max(padding, window.innerWidth - padding - clampedWidth)
  )
  const desiredTop = Math.min(
    Math.max(rect.top, padding),
    Math.max(padding, window.innerHeight - padding - clampedHeight)
  )
  const shiftX = desiredLeft - rect.left
  const shiftY = desiredTop - rect.top
  viewportShift.value = { x: Math.round(shiftX), y: Math.round(shiftY) }
  const nextMetaStyle: Record<string, string> = {
    maxWidth: `${maxWidth}px`
  }
  if (props.viewportOverflow === 'auto') {
    nextMetaStyle.maxHeight = `${clampedHeight}px`
    if (contentHeight > maxHeight) {
      nextMetaStyle.overflowY = 'auto'
    } else {
      nextMetaStyle.overflowY = 'visible'
    }
  } else {
    nextMetaStyle.maxHeight = 'none'
    nextMetaStyle.overflow = 'visible'
  }
  viewportMetaStyle.value = nextMetaStyle
}

function queueViewportClamp() {
  nextTick(() => {
    updateViewportClamp()
  })
}

watch(
  () => [props.open, props.clampToViewport, props.menuStyle],
  () => {
    if (!props.open) {
      clearViewportClamp()
      return
    }
    queueViewportClamp()
  },
  { deep: true, immediate: true }
)

function handleViewportChange() {
  if (!props.open || !props.clampToViewport) return
  queueViewportClamp()
}

onMounted(() => {
  if (typeof window === 'undefined') return
  window.addEventListener('resize', handleViewportChange)
  window.addEventListener('scroll', handleViewportChange, true)
})

onBeforeUnmount(() => {
  if (typeof window === 'undefined') return
  window.removeEventListener('resize', handleViewportChange)
  window.removeEventListener('scroll', handleViewportChange, true)
})
</script>

<style>
.sidebar-floating-menu-shell {
  position: fixed;
  z-index: 12000;
  opacity: 1;
  isolation: isolate;
  pointer-events: auto;
  background-color: var(--leaf-panel, var(--morandi-card, #f5f0e8));
  border-radius: var(--langhuan-menu-radius, 0);
  box-shadow: var(--langhuan-menu-shadow, 0 3px 10px rgba(56, 46, 38, 0.08));
  /* 只淡入不位移：挂载后立即用 getBoundingClientRect 做视口钳位，
     位移入场（lh-rise）会让量出的位置偏移；keyframes 定义在 main.css「动效与光效」节。 */
  animation: lh-fade var(--lh-dur-fast, 0.15s) ease;
}

@media (prefers-reduced-motion: reduce) {
  .sidebar-floating-menu-shell {
    animation: none;
  }
}
</style>
