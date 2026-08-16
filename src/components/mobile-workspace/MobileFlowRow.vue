<template>
  <button
    type="button"
    class="mobile-flow-row"
    :class="{
      'mobile-flow-row--dim': dim,
      'mobile-flow-row--no-divider': !divider,
      'mobile-flow-row--selecting': selectionMode,
      'mobile-flow-row--selected': selected
    }"
    :style="{ minHeight: `${minH}px` }"
    @click="handleClick"
    @pointerdown="handlePointerDown"
    @pointermove="handlePointerMove"
    @pointerup="clearLongPressTimer"
    @pointercancel="clearLongPressTimer"
    @pointerleave="clearLongPressTimer"
  >
    <span class="mobile-flow-row__lead" aria-hidden="true">
      <slot name="avatar" />
    </span>
    <span class="mobile-flow-row__body">
      <span class="mobile-flow-row__top">
        <span class="mobile-flow-row__title">{{ title }}</span>
        <small v-if="meta" class="mobile-flow-row__meta">{{ meta }}</small>
      </span>
      <span v-if="sub" class="mobile-flow-row__sub">{{ sub }}</span>
    </span>
    <span v-if="$slots.trailing" class="mobile-flow-row__trailing">
      <slot name="trailing" />
    </span>
    <span v-if="selectionMode" class="mobile-flow-row__check" :class="{ 'mobile-flow-row__check--on': selected }" aria-hidden="true">
      <MobileLineIcon v-if="selected" name="check" :size="11" :stroke-width="3" />
    </span>
  </button>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import MobileLineIcon from './MobileLineIcon.vue'

const props = withDefaults(
  defineProps<{
    title: string
    meta?: string
    sub?: string
    dim?: boolean
    divider?: boolean
    minH?: number
    selectionMode?: boolean
    selected?: boolean
  }>(),
  {
    meta: '',
    sub: '',
    dim: false,
    divider: true,
    minH: 64,
    selectionMode: false,
    selected: false
  }
)

const emit = defineEmits<{
  select: []
  longPress: []
  toggleSelect: []
}>()

const longPressTimer = ref<number | null>(null)
const longPressTriggered = ref(false)
const startPoint = ref<{ x: number; y: number } | null>(null)

function handleClick() {
  if (longPressTriggered.value) {
    longPressTriggered.value = false
    return
  }
  if (props.selectionMode) {
    emit('toggleSelect')
    return
  }
  emit('select')
}

function handlePointerDown(event: PointerEvent) {
  if (event.pointerType === 'mouse' && event.button !== 0) return
  clearLongPressTimer()
  longPressTriggered.value = false
  startPoint.value = { x: event.clientX, y: event.clientY }
  longPressTimer.value = window.setTimeout(() => {
    longPressTriggered.value = true
    emit('longPress')
  }, 420)
}

function handlePointerMove(event: PointerEvent) {
  if (!startPoint.value) return
  if (Math.abs(event.clientX - startPoint.value.x) > 10 || Math.abs(event.clientY - startPoint.value.y) > 10) {
    clearLongPressTimer()
  }
}

function clearLongPressTimer() {
  if (longPressTimer.value != null) {
    window.clearTimeout(longPressTimer.value)
    longPressTimer.value = null
  }
  startPoint.value = null
}

onBeforeUnmount(clearLongPressTimer)
</script>

<style scoped>
.mobile-flow-row {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 12px;
  border: 0;
  border-bottom: 1px solid var(--lhm-border-line, #e5e5e5);
  border-radius: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font: inherit;
  padding: 11px 4px;
  text-align: left;
  box-sizing: border-box;
  -webkit-tap-highlight-color: transparent;
}

.mobile-flow-row--no-divider {
  border-bottom: 0;
}

.mobile-flow-row--dim {
  opacity: 0.5;
}

.mobile-flow-row--selecting {
  padding-right: 2px;
}

.mobile-flow-row--selected {
  background: var(--lhm-tree-sel, rgba(139, 115, 85, 0.09));
}

.mobile-flow-row__lead {
  display: inline-flex;
  flex-shrink: 0;
}

.mobile-flow-row__body {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
}

.mobile-flow-row__top {
  display: flex;
  align-items: baseline;
  gap: 7px;
}

.mobile-flow-row__title {
  overflow: hidden;
  color: var(--lhm-text, #333);
  font-size: 15.5px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mobile-flow-row__meta {
  flex-shrink: 0;
  color: var(--lhm-text-muted, #999);
  font-size: 11.5px;
}

.mobile-flow-row__sub {
  overflow: hidden;
  margin-top: 4px;
  color: var(--lhm-text-muted, #999);
  font-size: 12.5px;
  line-height: 1.45;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mobile-flow-row__trailing {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
}

.mobile-flow-row__check {
  display: inline-flex;
  width: 17px;
  height: 17px;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  margin-left: 2px;
  border: 1.5px solid #cfc8bc;
  border-radius: 5px;
  background: rgba(255, 255, 255, 0.55);
  color: #fff;
  box-sizing: border-box;
}

.mobile-flow-row__check--on {
  border-color: var(--lhm-accent, #5c8a5c);
  background: var(--lhm-accent, #5c8a5c);
}
</style>
