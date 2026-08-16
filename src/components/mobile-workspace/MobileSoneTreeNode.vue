<template>
  <div class="mobile-sone-node">
    <div
      class="mobile-sone-node__row"
      :class="{
        'mobile-sone-node__row--section': isSection,
        'mobile-sone-node__row--sel': node.sel,
        'mobile-sone-node__row--selecting': selectionMode,
        'mobile-sone-node__row--checked': node.checked
      }"
      :style="{ paddingLeft: `${leadLeft}px` }"
      @click="handle"
      @pointerdown="handlePointerDown"
      @pointermove="handlePointerMove"
      @pointerup="clearLongPressTimer"
      @pointercancel="clearLongPressTimer"
      @pointerleave="clearLongPressTimer"
    >
      <span class="mobile-sone-node__slot" aria-hidden="true">
        <MobileLineIcon
          v-if="isGroup"
          class="mobile-sone-node__chevron"
          :class="{ 'mobile-sone-node__chevron--open': open }"
          name="chevron-right"
          :size="12.5"
          :stroke-width="isSection ? 2.2 : 1.8"
        />
      </span>
      <span v-if="isSection && rootIcon" class="mobile-sone-node__root-icon">
        <MobileLineIcon :name="rootIcon" :size="16" :stroke-width="1.8" />
      </span>
      <span
        class="mobile-sone-node__title"
        :class="`mobile-sone-node__title--${isSection ? 'section' : isGroup ? 'group' : 'leaf'}`"
      >{{ node.title }}</span>
      <span v-if="node.fill === true" class="mobile-sone-node__dot mobile-sone-node__dot--fill" aria-hidden="true" />
      <span v-else-if="node.fill === false" class="mobile-sone-node__dot mobile-sone-node__dot--empty" aria-hidden="true" />
      <span v-if="node.tag != null" class="mobile-sone-node__tag">{{ node.tag }}</span>
      <MobileLineIcon
        v-if="!isGroup && !selectionMode"
        class="mobile-sone-node__go"
        name="chevron-right"
        :size="15"
        :stroke-width="1.8"
      />
      <span v-if="selectionMode" class="mobile-sone-node__check" :class="{ 'mobile-sone-node__check--on': node.checked }" aria-hidden="true">
        <MobileLineIcon v-if="node.checked" name="check" :size="11" :stroke-width="3" />
      </span>
    </div>
    <div v-if="isGroup && open" class="mobile-sone-node__children">
      <span class="mobile-sone-node__guide" :style="{ left: `${guideLeft}px` }" aria-hidden="true" />
      <MobileSoneTreeNode
        v-for="(child, index) in node.children"
        :key="child.key ?? index"
        :node="child"
        :depth="depth + 1"
        :force-all="forceAll"
        :selection-mode="selectionMode"
        @leaf="$emit('leaf', $event)"
        @long-press="$emit('longPress', $event)"
        @toggle-select="$emit('toggleSelect', $event)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import MobileLineIcon from './MobileLineIcon.vue'
import type { MobileSoneNode } from './mobileWorkspaceTypes'

const INDENT = 20
const PADL = 10
const SLOTW = 18
const ROOT_ICON: Record<string, 'spark' | 'target' | 'route' | 'library-big'> = {
  core: 'spark',
  soul: 'target',
  trace: 'route',
  world: 'library-big'
}

const props = withDefaults(
  defineProps<{
    node: MobileSoneNode
    depth?: number
    forceAll?: boolean | null
    selectionMode?: boolean
  }>(),
  {
    depth: 0,
    forceAll: null,
    selectionMode: false
  }
)

const emit = defineEmits<{
  leaf: [node: MobileSoneNode]
  longPress: [node: MobileSoneNode]
  toggleSelect: [node: MobileSoneNode]
}>()

const isGroup = computed(() => Array.isArray(props.node.children) && props.node.children.length > 0)
const isSection = computed(() => props.depth === 0 && isGroup.value)
const leadLeft = computed(() => props.depth * INDENT + PADL)
const guideLeft = computed(() => leadLeft.value + SLOTW / 2 - 0.5)
const rootIcon = computed(() => (props.node.icon ? ROOT_ICON[props.node.icon] || 'library-big' : null))

const open = ref(props.forceAll != null ? props.forceAll : props.node.open !== false)
const longPressTimer = ref<number | null>(null)
const longPressTriggered = ref(false)
const startPoint = ref<{ x: number; y: number } | null>(null)
watch(
  () => props.forceAll,
  (value) => {
    if (value != null) open.value = value
  }
)

function handle() {
  if (longPressTriggered.value) {
    longPressTriggered.value = false
    return
  }
  if (props.selectionMode) {
    emit('toggleSelect', props.node)
    return
  }
  if (isGroup.value) {
    open.value = !open.value
  } else {
    emit('leaf', props.node)
  }
}

function handlePointerDown(event: PointerEvent) {
  if (event.pointerType === 'mouse' && event.button !== 0) return
  clearLongPressTimer()
  longPressTriggered.value = false
  startPoint.value = { x: event.clientX, y: event.clientY }
  longPressTimer.value = window.setTimeout(() => {
    longPressTriggered.value = true
    emit('longPress', props.node)
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
.mobile-sone-node {
  position: relative;
}

.mobile-sone-node__row {
  position: relative;
  display: flex;
  align-items: center;
  min-height: 30px;
  padding-right: 10px;
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.mobile-sone-node__row--section {
  min-height: 34px;
  margin-top: 6px;
}

.mobile-sone-node__row--sel {
  background: var(--lhm-tree-sel, rgba(139, 115, 85, 0.09));
}

.mobile-sone-node__row--checked {
  background: var(--lhm-tree-sel, rgba(139, 115, 85, 0.09));
}

.mobile-sone-node__row--selecting {
  padding-right: 2px;
}

.mobile-sone-node__slot {
  display: flex;
  width: 18px;
  flex-shrink: 0;
  align-items: center;
}

.mobile-sone-node__chevron {
  color: var(--lhm-text-muted, #999);
  transition: transform 0.16s ease;
}

.mobile-sone-node__chevron--open {
  transform: rotate(90deg);
}

.mobile-sone-node__root-icon {
  display: inline-flex;
  flex-shrink: 0;
  margin-right: 7px;
  color: var(--lhm-primary, #8b7355);
}

.mobile-sone-node__title {
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mobile-sone-node__title--section {
  color: var(--lhm-text, #333);
  font-size: 15px;
  font-weight: 700;
}

.mobile-sone-node__title--group {
  color: var(--lhm-text, #333);
  font-size: 14px;
  font-weight: 500;
}

.mobile-sone-node__title--leaf {
  color: var(--lhm-text-light, #666);
  font-size: 13.5px;
  font-weight: 400;
}

.mobile-sone-node__dot {
  width: 6px;
  height: 6px;
  flex-shrink: 0;
  margin-left: 8px;
  border-radius: 3px;
  box-sizing: border-box;
}

.mobile-sone-node__dot--fill {
  background: var(--lhm-gold, #d4a843);
}

.mobile-sone-node__dot--empty {
  border: 1px solid var(--lhm-text-faint, #b6b0a7);
}

.mobile-sone-node__tag {
  flex-shrink: 0;
  margin-left: 8px;
  color: var(--lhm-text-muted, #999);
  font-size: 10.5px;
}

.mobile-sone-node__go {
  flex-shrink: 0;
  margin-left: auto;
  color: var(--lhm-text-faint, #b6b0a7);
}

.mobile-sone-node__check {
  display: inline-flex;
  width: 17px;
  height: 17px;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  margin-left: auto;
  border: 1.5px solid #cfc8bc;
  border-radius: 5px;
  background: rgba(255, 255, 255, 0.55);
  color: #fff;
  box-sizing: border-box;
}

.mobile-sone-node__check--on {
  border-color: var(--lhm-accent, #5c8a5c);
  background: var(--lhm-accent, #5c8a5c);
}

.mobile-sone-node__children {
  position: relative;
}

.mobile-sone-node__guide {
  position: absolute;
  top: 0;
  bottom: 15px;
  border-left: 1px dashed var(--lhm-tree-guide, rgba(120, 113, 98, 0.3));
}
</style>
