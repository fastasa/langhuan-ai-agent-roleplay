<template>
  <template v-for="item in items" :key="item.key">
    <div v-if="item.dividerBefore" class="sidebar-tree-rows__row-menu-divider"></div>
    <div
      class="sidebar-tree-rows__row-menu-entry"
      :ref="(element) => setEntryRef(item.key, element)"
      @mouseenter="openSubmenu(item.key)"
      @mouseleave="closeSubmenu(item.key)"
    >
      <button
        type="button"
        class="sidebar-tree-rows__row-menu-item"
        :class="{
          'sidebar-tree-rows__row-menu-item--danger': item.danger,
          'sidebar-tree-rows__row-menu-item--muted': item.disabled,
          'sidebar-tree-rows__row-menu-item--active': item.active,
          'sidebar-tree-rows__row-menu-item--submenu-open': item.children?.length && isSubmenuOpen(item.key)
        }"
        :disabled="item.disabled"
        @mousedown.stop
        @pointerdown.stop
        @click.stop="item.children?.length ? openSubmenu(item.key) : emitAction(item.action)"
      >
        <span>{{ item.label }}</span>
        <span v-if="item.children?.length" class="sidebar-tree-rows__row-menu-arrow" aria-hidden="true">›</span>
        <span v-else-if="item.shortcut" class="sidebar-tree-rows__row-menu-shortcut">{{ item.shortcut }}</span>
      </button>
      <div
        v-if="item.children?.length && isSubmenuOpen(item.key)"
        class="sidebar-tree-rows__row-menu sidebar-tree-rows__row-submenu"
        :ref="(element) => setSubmenuRef(item.key, element)"
        :style="submenuStyles[item.key]"
      >
        <SoneTreeMenuItems
          :items="item.children"
          :row-id="rowId"
          @action="$emit('action', $event)"
        />
      </div>
    </div>
  </template>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, reactive, ref } from 'vue'
import type { ComponentPublicInstance } from 'vue'

export type SoneTreeNestedMenuItem = {
  key: string
  label: string
  action: string
  danger?: boolean
  disabled?: boolean
  active?: boolean
  dividerBefore?: boolean
  shortcut?: string
  children?: SoneTreeNestedMenuItem[]
}

defineProps<{
  items: SoneTreeNestedMenuItem[]
  rowId: string
}>()

const emit = defineEmits<{
  (e: 'action', action: string): void
}>()

const openSubmenuKey = ref('')
const entryRefs = new Map<string, HTMLElement>()
const submenuRefs = new Map<string, HTMLElement>()
const submenuStyles = reactive<Record<string, Record<string, string>>>({})
const closeTimers = new Map<string, number>()

const VIEWPORT_PADDING = 8
const SUBMENU_EDGE_OFFSET = 1

function openSubmenu(itemKey: string) {
  const timer = closeTimers.get(itemKey)
  if (timer) {
    window.clearTimeout(timer)
    closeTimers.delete(itemKey)
  }
  openSubmenuKey.value = itemKey
  void nextTick(() => positionSubmenu(itemKey))
}

function closeSubmenu(itemKey: string) {
  const timer = window.setTimeout(() => {
    if (openSubmenuKey.value === itemKey) openSubmenuKey.value = ''
    delete submenuStyles[itemKey]
    closeTimers.delete(itemKey)
  }, 80)
  closeTimers.set(itemKey, timer)
}

function isSubmenuOpen(itemKey: string) {
  return openSubmenuKey.value === itemKey
}

function emitAction(action: string) {
  emit('action', action)
}

function setEntryRef(itemKey: string, element: Element | ComponentPublicInstance | null) {
  if (element instanceof HTMLElement) {
    entryRefs.set(itemKey, element)
  } else {
    entryRefs.delete(itemKey)
  }
}

function setSubmenuRef(itemKey: string, element: Element | ComponentPublicInstance | null) {
  if (element instanceof HTMLElement) {
    submenuRefs.set(itemKey, element)
  } else {
    submenuRefs.delete(itemKey)
  }
}

function positionSubmenu(itemKey: string) {
  if (typeof window === 'undefined') return
  const entry = entryRefs.get(itemKey)
  const submenu = submenuRefs.get(itemKey)
  if (!entry || !submenu) return

  const entryRect = entry.getBoundingClientRect()
  const submenuRect = submenu.getBoundingClientRect()
  const submenuWidth = Math.max(submenuRect.width || 0, submenu.scrollWidth || 0, 210)
  const submenuHeight = Math.max(submenuRect.height || 0, submenu.scrollHeight || 0)
  const viewportWidth = window.innerWidth || 0
  const viewportHeight = window.innerHeight || 0
  const rightSpace = viewportWidth - entryRect.right - VIEWPORT_PADDING
  const leftSpace = entryRect.left - VIEWPORT_PADDING
  const openLeft = rightSpace < submenuWidth && leftSpace > rightSpace
  const desiredTop = Math.min(
    Math.max(entryRect.top, VIEWPORT_PADDING),
    Math.max(VIEWPORT_PADDING, viewportHeight - VIEWPORT_PADDING - submenuHeight)
  )
  const localTop = Math.round(desiredTop - entryRect.top)
  const maxHeight = Math.max(120, viewportHeight - VIEWPORT_PADDING * 2)
  const nextStyle: Record<string, string> = {
    top: `${localTop}px`,
    left: openLeft ? 'auto' : `calc(100% + ${SUBMENU_EDGE_OFFSET}px)`,
    right: openLeft ? `calc(100% + ${SUBMENU_EDGE_OFFSET}px)` : 'auto'
  }

  if (submenuHeight > maxHeight) {
    nextStyle.maxHeight = `${maxHeight}px`
    nextStyle.overflowY = 'auto'
  } else {
    nextStyle.maxHeight = 'none'
    nextStyle.overflow = 'visible'
  }

  if (!areMenuStylesEqual(submenuStyles[itemKey], nextStyle)) {
    submenuStyles[itemKey] = nextStyle
  }
}

function areMenuStylesEqual(
  current: Record<string, string> | undefined,
  next: Record<string, string>
) {
  if (!current) return false
  const currentKeys = Object.keys(current)
  const nextKeys = Object.keys(next)
  if (currentKeys.length !== nextKeys.length) return false
  return nextKeys.every((key) => current[key] === next[key])
}

onBeforeUnmount(() => {
  closeTimers.forEach((timer) => window.clearTimeout(timer))
  closeTimers.clear()
})
</script>

<style scoped>
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

.sidebar-tree-rows__row-menu-item--active {
  background: color-mix(in srgb, var(--leaf-accent, #829987) 13%, transparent);
  color: #536f59;
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
</style>
