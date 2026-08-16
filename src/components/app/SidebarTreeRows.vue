<template>
  <div class="sidebar-tree-rows">
    <div
      v-for="row in rows"
      :key="row.id"
      role="button"
      tabindex="0"
      class="doc-sidebar-row sidebar-tree-rows__row"
      :class="{
        active: row.active,
        selected: row.selected,
        'selected-prev': row.selectedPrev,
        'selected-next': row.selectedNext,
        folder: row.kind === 'folder',
        document: row.kind === 'document',
        'folder-open': row.kind === 'folder' && row.open,
        'folder-collapsed': row.kind === 'folder' && !row.open,
        'sidebar-interaction-cut-pending': row.cutPending
      }"
      :data-multi-select-id="row.multiSelectId || row.id"
      :style="{ '--doc-depth': String(row.depth || 0) }"
      @click="$emit('select', row.id, $event)"
      @pointerdown="$emit('row-pointerdown', row.id, $event)"
      @pointermove="$emit('row-pointermove', row.id, $event)"
      @pointerup="$emit('row-pointerend', row.id, $event)"
      @pointercancel="$emit('row-pointerend', row.id, $event)"
      @keydown.enter.prevent="$emit('select', row.id, $event)"
      @keydown.space.prevent="$emit('select', row.id, $event)"
    >
      <span class="doc-sidebar-row-indent"></span>
      <button
        v-if="row.kind === 'folder'"
        type="button"
        class="doc-sidebar-row-toggle"
        :class="{ open: row.open }"
        :title="row.open ? $t('unitTree.row.collapse') : $t('unitTree.row.expand')"
        :aria-label="row.open ? $t('unitTree.row.collapse') : $t('unitTree.row.expand')"
        @mousedown.stop
        @pointerdown.stop
        @click.stop="$emit('toggle', row.id)"
      >⌄</button>
      <span v-else class="doc-sidebar-row-toggle hidden"></span>
      <span class="doc-sidebar-row-marker sidebar-selection-indicator" :class="{ active: row.active || row.selected }"></span>
      <span class="doc-sidebar-row-label">{{ row.label }}</span>
      <span v-if="row.hasMenu" class="sidebar-row-actions doc-sidebar-row-actions">
        <button
          type="button"
          class="sidebar-row-action"
          :aria-label="$t('unitTree.row.moreActions')"
          :title="$t('unitTree.row.moreActions')"
          @mousedown.stop
          @pointerdown.stop
          @click.stop="$emit('menu', row.id, $event)"
        >
          <svg class="line-icon" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="5" r="1.5"/>
            <circle cx="12" cy="12" r="1.5"/>
            <circle cx="12" cy="19" r="1.5"/>
          </svg>
        </button>
      </span>
      <SidebarFloatingMenu
        v-if="row.hasMenu"
        :open="Boolean(row.menuOpen)"
        menu-class="sidebar-tree-rows__row-menu"
        :menu-style="menuStyle"
        clamp-to-viewport
      >
        <template v-for="item in row.menuItems || []" :key="item.key">
          <div v-if="item.dividerBefore" class="sidebar-tree-rows__row-menu-divider"></div>
          <button
            type="button"
            class="sidebar-tree-rows__row-menu-item"
            :class="{ 'sidebar-tree-rows__row-menu-item--danger': item.danger, 'sidebar-tree-rows__row-menu-item--muted': item.disabled }"
            :disabled="item.disabled"
            @mousedown.stop
            @pointerdown.stop
            @click.stop="$emit('menu-action', item.action, row.id)"
          >
            <span>{{ item.label }}</span>
            <span v-if="item.shortcut" class="sidebar-tree-rows__row-menu-shortcut">{{ item.shortcut }}</span>
          </button>
        </template>
      </SidebarFloatingMenu>
    </div>
  </div>
</template>

<script setup lang="ts">
import SidebarFloatingMenu from '../common/SidebarFloatingMenu.vue'

export type SidebarTreeMenuItem = {
  key: string
  label: string
  action: string
  danger?: boolean
  disabled?: boolean
  dividerBefore?: boolean
  shortcut?: string
}

export type SidebarTreeRowView = {
  id: string
  label: string
  depth: number
  kind: 'folder' | 'document'
  open?: boolean
  active?: boolean
  selected?: boolean
  selectedPrev?: boolean
  selectedNext?: boolean
  cutPending?: boolean
  hasMenu?: boolean
  menuOpen?: boolean
  menuItems?: SidebarTreeMenuItem[]
  multiSelectId?: string
}

defineProps<{
  rows: SidebarTreeRowView[]
  menuStyle?: Record<string, string>
}>()

defineEmits<{
  (e: 'select', rowId: string, event: MouseEvent | KeyboardEvent): void
  (e: 'toggle', rowId: string): void
  (e: 'menu', rowId: string, event: MouseEvent): void
  (e: 'menu-action', action: string, rowId: string): void
  (e: 'row-pointerdown', rowId: string, event: PointerEvent): void
  (e: 'row-pointermove', rowId: string, event: PointerEvent): void
  (e: 'row-pointerend', rowId: string, event: PointerEvent): void
}>()
</script>

<style scoped>
.sidebar-interaction-cut-pending {
  opacity: 0.52;
}
</style>

<style scoped>
.sidebar-tree-rows {
  display: grid;
  gap: 0;
  width: 100%;
}

.sidebar-tree-rows__row {
  position: relative;
  display: flex;
  align-items: center;
  gap: 2px;
  width: calc(100% - 4px);
  min-height: 19px;
  margin: 0 2px;
  padding: 0 8px 0 calc(16px + var(--doc-depth, 0) * 12px);
  border: 0;
  border-radius: 0;
  background: transparent;
  color: #6b645d;
  font: inherit;
  font-size: 12px;
  text-align: left;
  cursor: pointer;
  outline: none;
}

.sidebar-tree-rows__row:hover {
  background: rgba(130, 153, 135, 0.07);
}

.sidebar-tree-rows__row:focus-visible {
  background: rgba(130, 153, 135, 0.09);
}

.sidebar-tree-rows__row.active,
.sidebar-tree-rows__row.selected {
  background: transparent;
  color: #556b59;
}

.sidebar-tree-rows__row.folder {
  min-height: 24px;
  margin-top: 6px;
  margin-bottom: 0;
  margin-left: 4px;
  margin-right: 4px;
  padding-right: 8px;
  color: #4f5f4c;
}

.sidebar-tree-rows__row.folder-open {
  margin-top: 12px;
}

.sidebar-tree-rows__row.folder .doc-sidebar-row-label {
  font-weight: 500;
}

.sidebar-tree-rows__row.document::before {
  content: '';
  position: absolute;
  left: calc(22px + var(--doc-depth, 0) * 12px);
  top: 50%;
  width: 6px;
  border-top: 2px solid color-mix(in srgb, #b9b3a6 76%, transparent);
  transform: translateY(-50%);
  pointer-events: none;
}

.doc-sidebar-row-indent {
  flex: 0 0 0;
}

.doc-sidebar-row-toggle {
  position: absolute;
  left: calc(-11px + var(--doc-depth, 0) * 12px);
  top: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 14px;
  width: 14px;
  height: 18px;
  border: 0;
  background: transparent;
  color: #8c9d90;
  padding: 0;
  font-size: 13px;
  line-height: 1;
  cursor: pointer;
  transform: translateY(-50%) rotate(-90deg);
  transition: transform 0.16s ease;
}

.doc-sidebar-row-toggle.open {
  transform: translateY(-50%) rotate(0deg);
}

.doc-sidebar-row-toggle.hidden {
  visibility: hidden;
}

.doc-sidebar-row-marker {
  position: absolute;
  left: calc(10px + var(--doc-depth, 0) * 12px);
  top: 2px;
  bottom: 2px;
  flex: 0 0 1px;
  width: 1px;
  min-width: 1px;
  height: auto;
  border-radius: 999px;
  background: transparent;
}

.sidebar-tree-rows__row.selected-prev .doc-sidebar-row-marker {
  top: 0;
}

.sidebar-tree-rows__row.selected-next .doc-sidebar-row-marker {
  bottom: 0;
}

.doc-sidebar-row-marker.active {
  background: #829987;
}

.sidebar-tree-rows__row.folder .doc-sidebar-row-marker,
.sidebar-tree-rows__row.folder .doc-sidebar-row-marker.active {
  background: transparent;
}

.doc-sidebar-row-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  position: relative;
  z-index: 1;
}

.doc-sidebar-row-actions {
  position: relative;
  margin-left: auto;
  flex: 0 0 auto;
  width: 26px;
  opacity: 0;
  pointer-events: none;
  z-index: 3;
}

.sidebar-tree-rows__row:hover .doc-sidebar-row-actions,
.sidebar-tree-rows__row.active .doc-sidebar-row-actions,
.sidebar-tree-rows__row.selected .doc-sidebar-row-actions {
  opacity: 1;
  pointer-events: auto;
}

.sidebar-row-action {
  width: 26px;
  height: 26px;
  border: none;
  background: transparent;
  padding: 0;
  box-shadow: none;
  appearance: none;
  color: var(--morandi-text-light);
  cursor: pointer;
}

.line-icon {
  width: 16px;
  height: 16px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.sidebar-tree-rows__row-menu {
  min-width: 184px;
  border: 1px solid var(--langhuan-menu-border, color-mix(in srgb, var(--leaf-border, rgba(141, 125, 105, 0.24)) 62%, transparent));
  border-radius: var(--langhuan-menu-radius, 0);
  background: var(--leaf-panel, #f5f0e8);
  box-shadow: var(--langhuan-menu-shadow, 0 3px 10px rgba(56, 46, 38, 0.08));
  overflow: hidden;
}

.sidebar-tree-rows__row-menu-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  width: 100%;
  border: none;
  background: transparent;
  color: var(--leaf-text, #4b433a);
  text-align: left;
  padding: 8px 12px;
  font-size: 0.8rem;
  line-height: 1.2;
  cursor: pointer;
}

.sidebar-tree-rows__row-menu-item:hover {
  background: color-mix(in srgb, var(--leaf-accent, #829987) 8%, transparent);
}

.sidebar-tree-rows__row-menu-item:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.sidebar-tree-rows__row-menu-item--muted {
  color: var(--leaf-text-soft, #8a8176);
}

.sidebar-tree-rows__row-menu-item--danger {
  color: #c94e48;
}

.sidebar-tree-rows__row-menu-divider {
  height: 1px;
  margin: 4px 0;
  background: color-mix(in srgb, var(--leaf-border, rgba(141, 125, 105, 0.24)) 82%, transparent);
}

.sidebar-tree-rows__row-menu-shortcut {
  flex: 0 0 auto;
  font-size: 0.72rem;
  color: var(--leaf-text-soft, #8a8176);
}
</style>
