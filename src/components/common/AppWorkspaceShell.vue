<template>
  <section class="app-workspace-shell" :class="{ 'app-workspace-shell--no-tabs': hideTabs }">
    <div v-if="!hideTabs" class="app-workspace-shell__tabs" role="tablist" :aria-label="ariaLabel">
      <button
        v-for="window in windows"
        :key="window.id"
        type="button"
        class="app-workspace-shell__tab"
        :class="{ active: window.id === activeWindowId }"
        :draggable="draggableTabs"
        @click="$emit('activate', window.id)"
        @dragstart="draggableTabs && $emit('tab-drag-start', window.id, $event)"
        @dragover.prevent
        @drop="draggableTabs && $emit('tab-drop', window.id, $event)"
        @dragend="draggableTabs && $emit('tab-drag-end')"
      >
        <span>{{ window.title }}</span>
        <button
          v-if="window.closable"
          type="button"
          class="app-workspace-shell__tab-close"
          title="关闭窗口"
          aria-label="关闭窗口"
          @click.stop="$emit('close-window', window.id)"
        >×</button>
      </button>
      <span class="app-workspace-shell__tools-spacer"></span>
      <slot name="tools" />
    </div>

    <div v-if="windows.length" class="app-workspace-shell__strip">
      <template v-for="(window, index) in windows" :key="window.id">
        <div
          v-if="index > 0"
          class="app-workspace-shell__splitter"
          @pointerdown="$emit('split-resize', $event, getPreviousWindowId(index))"
        ></div>
        <section
          class="app-workspace-shell__pane"
          :class="{ active: window.id === activeWindowId }"
          :style="getWindowStyle(window)"
          @click="$emit('activate', window.id)"
        >
          <slot :window="window" />
        </section>
      </template>
    </div>

    <slot v-else name="empty" />
    <slot name="floating" />
  </section>
</template>

<script setup lang="ts">
import type { CSSProperties } from 'vue'
import type { WorkspaceWindowRecord } from '../../app/workspaceWindowProtocol'

const props = withDefaults(defineProps<{
  windows: WorkspaceWindowRecord[]
  activeWindowId: string
  ariaLabel?: string
  draggableTabs?: boolean
  hideTabs?: boolean
  getWindowStyle?: (window: WorkspaceWindowRecord) => CSSProperties | Record<string, string>
}>(), {
  ariaLabel: '工作区窗口',
  draggableTabs: false,
  hideTabs: false,
  getWindowStyle: () => ({})
})

defineEmits<{
  (e: 'activate', windowId: string): void
  (e: 'close-window', windowId: string): void
  (e: 'tab-drag-start', windowId: string, event: DragEvent): void
  (e: 'tab-drop', windowId: string, event: DragEvent): void
  (e: 'tab-drag-end'): void
  (e: 'split-resize', event: PointerEvent, windowId: string): void
}>()

function getPreviousWindowId(index: number) {
  return props.windows[Math.max(0, index - 1)]?.id || ''
}
</script>

<style scoped>
.app-workspace-shell {
  position: relative;
  display: flex;
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
}

.app-workspace-shell__tabs {
  display: flex;
  align-items: center;
  gap: 0;
  flex: 0 0 auto;
  min-height: 32px;
  padding: 0 8px;
  border-bottom: 1px solid color-mix(in srgb, var(--morandi-border, #cfd7c8) 84%, transparent);
  background: color-mix(in srgb, var(--langhuan-paper-bg, #faf8f0) 88%, var(--morandi-bg, #edf0e8) 12%);
  overflow: hidden;
}

.app-workspace-shell__tab {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
  max-width: 220px;
  height: 30px;
  padding: 0 9px;
  border: 0;
  border-right: 1px solid color-mix(in srgb, var(--morandi-border, #cfd7c8) 66%, transparent);
  border-radius: 6px 6px 0 0;
  background: transparent;
  color: var(--morandi-text-light, #6c7468);
  font-size: 12px;
  cursor: pointer;
  box-shadow: inset 0 -1px 0 transparent;
}

.app-workspace-shell__tab.active {
  background: color-mix(in srgb, #ffffff 32%, transparent);
  color: var(--morandi-text, #364034);
  box-shadow: inset 0 -2px 0 rgba(88, 112, 82, 0.5);
}

.app-workspace-shell__tab > span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.app-workspace-shell__tab-close,
.app-workspace-shell :deep(.app-workspace-shell__tool) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  border: 0;
  background: transparent;
  color: var(--morandi-text-light, #6c7468);
  cursor: pointer;
}

.app-workspace-shell__tab-close {
  width: 16px;
  height: 16px;
  padding: 0;
  border-radius: 50%;
  font-size: 14px;
  line-height: 1;
}

.app-workspace-shell :deep(.app-workspace-shell__tool) {
  width: 28px;
  height: 28px;
  padding: 0;
  border-radius: 6px;
}

.app-workspace-shell :deep(.app-workspace-shell__tool:hover),
.app-workspace-shell__tab-close:hover {
  background: color-mix(in srgb, var(--morandi-border, #cfd7c8) 34%, transparent);
  color: var(--morandi-text, #364034);
}

.app-workspace-shell :deep(.app-workspace-shell__icon) {
  width: 16px;
  height: 16px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.7;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.app-workspace-shell__tools-spacer {
  flex: 1 1 auto;
  min-width: 8px;
}

.app-workspace-shell__strip {
  display: flex;
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.app-workspace-shell__pane {
  display: flex;
  flex: 1 1 0;
  min-width: 0;
  min-height: 0;
  border-right: 1px solid color-mix(in srgb, var(--morandi-border, #cfd7c8) 70%, transparent);
  background: transparent;
}

.app-workspace-shell__pane:last-child {
  border-right: 0;
}

.app-workspace-shell__pane.active {
  box-shadow: inset 0 2px 0 rgba(130, 153, 135, 0.24);
}

.app-workspace-shell--no-tabs .app-workspace-shell__pane.active {
  box-shadow: none;
}

.app-workspace-shell__splitter {
  flex: 0 0 6px;
  margin-left: -3px;
  margin-right: -3px;
  cursor: col-resize;
  z-index: 2;
}

.app-workspace-shell__splitter:hover {
  background: color-mix(in srgb, var(--morandi-border, #cfd7c8) 54%, transparent);
}
</style>
