<template>
  <aside class="leaf-docs__sidebar" :class="{ 'leaf-docs__sidebar--collapsed': !treeVisible }" :style="panelStyle">
    <div class="leaf-docs__tree-toolbar">
      <button v-show="treeVisible" type="button" class="leaf-docs__tree-action" :title="$t('docLibrary.tree.undo')" :aria-label="$t('docLibrary.tree.undo')" @click="$emit('undo')">
        <svg class="leaf-docs__icon-svg" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M9 14 4 9l5-5"/>
          <path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11"/>
        </svg>
      </button>
      <button v-show="treeVisible" type="button" class="leaf-docs__tree-action" :title="$t('docLibrary.tree.redo')" :aria-label="$t('docLibrary.tree.redo')" @click="$emit('redo')">
        <svg class="leaf-docs__icon-svg" viewBox="0 0 24 24" aria-hidden="true">
          <path d="m15 14 5-5-5-5"/>
          <path d="M20 9H9.5A5.5 5.5 0 0 0 4 14.5A5.5 5.5 0 0 0 9.5 20H13"/>
        </svg>
      </button>
      <button v-show="treeVisible" type="button" class="leaf-docs__tree-action" :title="$t('docLibrary.tree.expandAll')" :aria-label="$t('docLibrary.tree.expandAll')" @click="$emit('expand-all')">
        <svg class="leaf-docs__icon-svg" viewBox="0 0 24 24" aria-hidden="true">
          <path d="m7 15 5 5 5-5"/>
          <path d="m7 9 5-5 5 5"/>
        </svg>
      </button>
      <button v-show="treeVisible" type="button" class="leaf-docs__tree-action" :title="$t('docLibrary.tree.collapseAll')" :aria-label="$t('docLibrary.tree.collapseAll')" @click="$emit('collapse-all')">
        <svg class="leaf-docs__icon-svg" viewBox="0 0 24 24" aria-hidden="true">
          <path d="m7 20 5-5 5 5"/>
          <path d="m7 4 5 5 5-5"/>
        </svg>
      </button>
      <button v-show="treeVisible" type="button" class="leaf-docs__tree-action" :title="$t('docLibrary.tree.newBranch')" :aria-label="$t('docLibrary.tree.newBranch')" @click="$emit('create-section')">
        <svg class="leaf-docs__icon-svg" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 10v6"/>
          <path d="M9 13h6"/>
          <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>
        </svg>
      </button>
      <button v-show="treeVisible" type="button" class="leaf-docs__tree-action" :title="$t('docLibrary.tree.newLeaf')" :aria-label="$t('docLibrary.tree.newLeaf')" @click="$emit('create-page')">
        <svg class="leaf-docs__icon-svg" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M11.35 22H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.706.706l3.588 3.588A2.4 2.4 0 0 1 20 8v5.35"/>
          <path d="M14 2v5a1 1 0 0 0 1 1h5"/>
          <path d="M14 19h6"/>
          <path d="M17 16v6"/>
        </svg>
      </button>
      <button v-show="treeVisible" type="button" class="leaf-docs__tree-action" :title="$t('docLibrary.tree.newCluster')" :aria-label="$t('docLibrary.tree.newCluster')" @click="$emit('create-cluster')">
        <svg class="leaf-docs__icon-svg" viewBox="0 0 24 24" aria-hidden="true">
          <rect x="3" y="5" width="18" height="14" rx="2"/>
          <path d="M12 9v6"/>
          <path d="M9 12h6"/>
        </svg>
      </button>
      <button v-show="treeVisible" type="button" class="leaf-docs__tree-action" :title="$t('docLibrary.tree.importSillyTavern')" :aria-label="$t('docLibrary.tree.importSillyTavern')" @click="$emit('import-silly-tavern')">
        <svg class="leaf-docs__icon-svg" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 4h9l5 5v11H5z"/>
          <path d="M14 4v5h5"/>
          <path d="M9 14h6"/>
          <path d="M12 11v6"/>
        </svg>
      </button>
      <button v-show="treeVisible" type="button" class="leaf-docs__tree-action" :title="$t('docLibrary.tree.importWorldDraft')" :aria-label="$t('docLibrary.tree.importWorldDraft')" @click="$emit('import-world-draft')">
        <svg class="leaf-docs__icon-svg" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/>
          <path d="M14 2v4a2 2 0 0 0 2 2h4"/>
          <path d="M12 18v-6"/>
          <path d="m15 15-3-3-3 3"/>
        </svg>
      </button>
    </div>

    <div
      v-show="treeVisible"
      class="leaf-docs__tree"
      :class="{ 'leaf-docs__tree--dragging': dragging }"
    >
      <SoneTreeRows
        :rows="rows"
        :menu-style="menuStyle"
        @select="(rowId, event) => $emit('select', rowId, event)"
        @toggle="(rowId) => $emit('toggle', rowId)"
        @menu="(rowId, event) => $emit('menu', rowId, event)"
        @menu-action="(action, rowId) => $emit('menu-action', action, rowId)"
        @row-pointerdown="(rowId, event) => $emit('row-pointerdown', rowId, event)"
        @row-pointermove="(rowId, event) => $emit('row-pointermove', rowId, event)"
        @row-pointerend="(rowId, event) => $emit('row-pointerend', rowId, event)"
      />
    </div>

    <div
      v-if="resizable"
      v-show="treeVisible"
      class="leaf-docs__resize-handle"
      @pointerdown="$emit('resize-start', $event)"
    ></div>
  </aside>
</template>

<script setup lang="ts">
import type { CSSProperties } from 'vue'
import SoneTreeRows from '../app/SoneTreeRows.vue'
import type { SoneTreeRowView } from '../app/SoneTreeRows.vue'

defineProps<{
  treeVisible: boolean
  panelStyle: CSSProperties
  resizable: boolean
  rows: SoneTreeRowView[]
  menuStyle?: Record<string, string>
  dragging: boolean
}>()

defineEmits<{
  (e: 'undo'): void
  (e: 'redo'): void
  (e: 'expand-all'): void
  (e: 'collapse-all'): void
  (e: 'create-section'): void
  (e: 'create-page'): void
  (e: 'create-cluster'): void
  (e: 'import-silly-tavern'): void
  (e: 'import-world-draft'): void
  (e: 'resize-start', event: PointerEvent): void
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
.leaf-docs__sidebar {
  position: relative;
  display: flex;
  width: 220px;
  min-width: 0;
  flex-direction: column;
  border-right: 1px solid var(--leaf-border);
  background: transparent;
}

.leaf-docs__sidebar--collapsed {
  width: 48px;
  min-width: 48px;
  overflow: hidden;
}

.leaf-docs__tree-toolbar {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  min-height: 34px;
  padding: 2px 8px 2px 10px;
  border-bottom: 0;
  background: transparent;
}

.leaf-docs__tree-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 7px;
  background: transparent;
  color: inherit;
  box-shadow: none;
  cursor: pointer;
  transition: background-color 0.18s ease, border-color 0.18s ease, color 0.18s ease;
}

.leaf-docs__tree-toolbar .leaf-docs__tree-action:hover,
.leaf-docs__tree-toolbar .leaf-docs__tree-action:focus-visible {
  background: transparent;
  border-color: transparent;
  box-shadow: none;
  color: var(--leaf-accent);
}

.leaf-docs__tree-toolbar .leaf-docs__tree-action:nth-child(3) .leaf-docs__icon-svg,
.leaf-docs__tree-toolbar .leaf-docs__tree-action:nth-child(4) .leaf-docs__icon-svg {
  width: 18px;
  height: 18px;
  stroke-width: 2;
}

.leaf-docs__icon-svg {
  width: 16px;
  height: 16px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
  flex: 0 0 auto;
}

.leaf-docs__tree {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 10px 0 18px;
  transition: background-color 0.18s ease, box-shadow 0.18s ease;
}

.leaf-docs__tree--dragging :deep(.leaf-docs__tree-row:hover),
.leaf-docs__tree--dragging :deep(.leaf-docs__tree-row.active),
.leaf-docs__tree--dragging :deep(.leaf-docs__tree-row--selected) {
  background: transparent;
}

.leaf-docs__resize-handle {
  position: absolute;
  top: 0;
  right: -3px;
  width: 6px;
  height: 100%;
  cursor: col-resize;
}

@media (max-width: 860px) {
  .leaf-docs__sidebar {
    width: 100%;
    border-right: none;
    border-bottom: 1px solid var(--leaf-border);
  }

  .leaf-docs__resize-handle {
    display: none;
  }
}
</style>
