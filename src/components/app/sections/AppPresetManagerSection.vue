<template>
  <div class="collapsible">
    <div class="collapsible-header" @click="viewModel.sections.presetManager = !viewModel.sections.presetManager">
      <span>预设管理</span>
      <span class="collapsible-arrow" :class="{ open: viewModel.sections.presetManager }">▾</span>
    </div>
    <div class="collapsible-content" :class="{ open: viewModel.sections.presetManager }">
      <div style="display: flex; gap: 8px; margin-bottom: 12px; flex-wrap: wrap; align-items: center;">
        <select
          :value="viewModel.presetSceneFilter"
          @change="actions.updatePresetSceneFilter(($event.target as HTMLSelectElement).value)"
          style="padding: 4px 8px; border: 1px solid var(--morandi-border); border-radius: 4px; font-size: 0.85rem;"
        >
          <option value="">全部场景</option>
          <option value="chat">聊天</option>
          <option value="eval">评价</option>
          <option value="task">任务</option>
          <option value="summary">总结</option>
        </select>
        <button class="btn btn-small btn-secondary" @click="actions.showPresetVars()" style="padding: 4px 8px; font-size: 0.8rem;">变量参数</button>
        <button class="btn btn-small btn-secondary" @click="actions.resetPresetToDefault()" style="padding: 4px 8px; font-size: 0.8rem;">恢复默认</button>
        <button class="btn btn-small btn-secondary" @click="actions.exportPromptPresets()" style="padding: 4px 8px; font-size: 0.8rem;">导出 JSON</button>
        <button class="btn btn-small btn-secondary" @click="openImportPicker" style="padding: 4px 8px; font-size: 0.8rem;">导入 JSON</button>
        <button
          class="btn btn-small btn-secondary preset-drag-toggle"
          :class="{ active: presetDragEnabled }"
          @click="togglePresetDragMode"
          style="padding: 4px 8px; font-size: 0.8rem;"
        >
          {{ presetDragEnabled ? '关闭拖拽' : '开启拖拽' }}
        </button>
        <input ref="importInputRef" type="file" accept=".json,application/json" style="display: none;" @change="handleImportChange">
      </div>

      <div style="margin-bottom: 12px; padding: 10px; background: var(--morandi-soft-bg); border-radius: 8px; font-size: 0.85rem; color: var(--morandi-text-light);">
        <strong>说明：</strong>预设用于控制 AI 收到的提示词顺序和内容。支持拖拽排序、编辑、启用停用，以及 JSON 导入导出。
      </div>

      <TransitionGroup
        name="preset-reorder"
        tag="div"
        class="preset-list"
        :class="{ 'preset-list--drag-enabled': presetDragEnabled, 'preset-list--dragging': presetPointerDrag.dragging.value }"
      >
        <div
          v-for="row in renderedPresetRows"
          :key="row.id"
          class="preset-item"
          :class="{
            'preset-item--selected': isPresetSelected(row.preset, row.index),
            'preset-item--drag-mode': presetDragEnabled,
            'preset-item--dragging': isPresetDragging(row.id),
            'preset-item--drop-target': isPresetDropTarget(row.id),
            'preset-item--drop-target-before': isPresetDropTargetBefore(row.id),
            'preset-item--drop-target-after': isPresetDropTargetAfter(row.id),
            'preset-item--preview-shift': isPresetDropTarget(row.id)
          }"
          :data-multi-select-id="row.id"
          :data-preset-drag-id="row.id"
          @click="handlePresetClick(row.preset, row.index, $event)"
          @pointerdown="handlePresetPointerDown(row.preset, row.index, $event)"
        >
          <div class="preset-header">
            <span class="preset-selection-indicator" :class="{ active: isPresetSelected(row.preset, row.index) }" aria-hidden="true"></span>
            <div class="preset-info">
              <span class="preset-name">{{ row.preset.name || `${row.preset.role}: ${String(row.preset.content || '').slice(0, 20)}` }}</span>
              <span v-if="isLockedPreset(row.preset)" class="preset-builtin-tag">内置</span>
              <span v-if="row.preset.scene" :class="['preset-scene-tag', `scene-${row.preset.scene}`]">{{ getSceneLabel(row.preset.scene) }}</span>
              <span v-if="row.preset.frequency" class="preset-freq-tag">{{ getFrequencyLabel(row.preset.frequency) }}</span>
            </div>
            <div class="preset-actions" @click.stop>
              <button
                class="preset-switch"
                :class="{ 'preset-switch--on': Boolean(row.preset.enabled) }"
                :title="row.preset.enabled ? '当前已启用' : '当前已停用'"
                @click.stop="props.actions.togglePresetEnabled(props.viewModel.getOriginalIndex(row.index))"
              >
                <span class="preset-switch__thumb"></span>
              </button>
              <button
                v-if="shouldShowPresetMenuTrigger(row.preset, row.index)"
                class="preset-menu-trigger"
                :title="getPresetMenuMode(row.preset, row.index) === 'batch' ? '批量操作' : '更多操作'"
                @click.stop="togglePresetMenu(row.preset, row.index, $event)"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="12" cy="5" r="1.5"/>
                  <circle cx="12" cy="12" r="1.5"/>
                  <circle cx="12" cy="19" r="1.5"/>
                </svg>
              </button>
              <SidebarFloatingMenu :open="isPresetMenuOpen(row.preset, row.index)" menu-class="preset-row-menu" :menu-style="floatingPresetMenuStyle">
                <button
                  v-for="item in getPresetMenuItems(row.preset, row.index)"
                  :key="item.key"
                  class="preset-row-menu-item"
                  :class="{ danger: item.danger }"
                  :disabled="item.disabled"
                  @click.stop="runPresetMenuAction(item.action, row.preset, row.index)"
                >
                  {{ item.label }}
                </button>
              </SidebarFloatingMenu>
            </div>
          </div>
        </div>
      </TransitionGroup>

      <div style="display: flex; gap: 8px; margin-top: 12px;">
        <button class="btn btn-primary" @click="actions.addPromptPreset()">+ 添加预设</button>
      </div>

      <div v-if="notice.visible" class="preset-section-notice" role="status">
        {{ notice.message }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useMultiSelect } from '../../../composables/useMultiSelect'
import { useSelectionRowMenu } from '../../../composables/useSelectionRowMenu'
import { getVisibleSidebarElements, resolveBufferedDropTarget } from '../../../composables/useSidebarDropTargetKit'
import { useSidebarDragModeKit } from '../../../composables/useSidebarDragModeKit'
import { useSidebarFloatingMenuKit } from '../../../composables/useSidebarFloatingMenuKit'
import { useSidebarMultiDrag } from '../../../composables/useSidebarMultiDrag'
import { useSidebarPointerDragKit } from '../../../composables/useSidebarPointerDragKit'
import SidebarFloatingMenu from '../../common/SidebarFloatingMenu.vue'
import type { DataManagePanelActions, DataManagePanelViewModel, PresetManagerPanelActions, PresetManagerPanelViewModel, PromptPresetLike } from '../../../types/panelContracts'

type PresetRenderRow = {
  id: string
  index: number
  preset: PromptPresetLike
}

const sceneLabelMap: Record<string, string> = {
  all: '全部',
  chat: '聊天',
  eval: '评价',
  task: '任务',
  summary: '总结'
}

const frequencyLabelMap: Record<string, string> = {
  always: '每次',
  once: '仅一次',
  rare: '偶尔',
  '0': '每次',
  '1': '仅一次',
  '2': '偶尔'
}

const props = defineProps<{
  viewModel: PresetManagerPanelViewModel
  actions: PresetManagerPanelActions
}>()

function getPresetSelectionId(preset: PromptPresetLike, index: number) {
  return String(preset?.id || `${preset?.name || 'preset'}_${index}`)
}

const basePresetRows = computed<PresetRenderRow[]>(() => (props.viewModel.filteredPresets || []).map((preset, index) => ({
  id: getPresetSelectionId(preset, index),
  index,
  preset
})))
const presetOrderedIds = computed(() => basePresetRows.value.map((row) => row.id))
const presetMultiSelect = useMultiSelect({
  getOrderedIds: () => presetOrderedIds.value
})
const presetDragModeKit = useSidebarDragModeKit<'preset'>({
  persistKey: 'langhuan_preset_drag_mode',
  defaultDragEnabled: false,
  defaultSinkContext: ''
})
const presetDragEnabled = presetDragModeKit.dragEnabled
const presetDrag = useSidebarMultiDrag({
  getOrderedIds: () => presetOrderedIds.value,
  getSelectedIds: () => presetMultiSelect.selectedIds.value
})
const renderedPresetRows = computed(() => {
  if (!presetDrag.projectedOrder.value.length) return basePresetRows.value
  const rowMap = new Map(basePresetRows.value.map((row) => [row.id, row] as const))
  const rendered = presetDrag.projectedOrder.value
    .map((id) => rowMap.get(id))
    .filter((row): row is PresetRenderRow => Boolean(row))
  const renderedIds = new Set(rendered.map((row) => row.id))
  return [
    ...rendered,
    ...basePresetRows.value.filter((row) => !renderedIds.has(row.id))
  ]
})
const renderedPresetIds = computed(() => renderedPresetRows.value.map((row) => row.id))
const presetRowMenu = useSelectionRowMenu({
  orderedIds: renderedPresetIds,
  selectedIds: presetMultiSelect.selectedIds,
  selectedAnchorId: presetMultiSelect.anchorId
})
const presetFloatingMenuKit = useSidebarFloatingMenuKit({ menuWidth: 148, estimatedHeight: 168 })
const floatingPresetMenuStyle = presetFloatingMenuKit.floatingMenuStyle
const lastPresetPointer = ref({ x: 0, y: 0 })
const presetPointerDrag = useSidebarPointerDragKit<{
  pointerId: number
  currentId: string
  startX: number
  startY: number
}>({
  activationDistance: 4,
  onStartDrag(pending) {
    presetDrag.startDrag(pending.currentId)
  },
  onPreview(_pending, point) {
    lastPresetPointer.value = point
    updatePresetPointerPreview(point.x, point.y)
  },
  onCommitDrop(_pending, point) {
    lastPresetPointer.value = point
    commitProjectedPresetDrop()
  },
  onClear() {
    presetDrag.clearDragState()
  }
})

const importInputRef = ref<HTMLInputElement | null>(null)
const notice = ref<{ visible: boolean; message: string; timer: ReturnType<typeof setTimeout> | null }>({
  visible: false,
  message: '',
  timer: null
})

function showNotice(message: string) {
  const text = String(message || '').trim()
  if (!text) return
  if (notice.value.timer) clearTimeout(notice.value.timer)
  notice.value.visible = true
  notice.value.message = text
  notice.value.timer = setTimeout(() => {
    notice.value.visible = false
    notice.value.message = ''
    notice.value.timer = null
  }, 2200)
}

function getSceneLabel(scene?: string) {
  if (!scene) return ''
  return sceneLabelMap[scene] || scene
}

function getFrequencyLabel(frequency?: string | number) {
  if (frequency === undefined || frequency === null) return ''
  const key = String(frequency)
  return frequencyLabelMap[key] || key
}

function isLockedPreset(preset: PromptPresetLike) {
  return Boolean(props.viewModel.isLockedPreset?.(preset))
}

function isPresetSelected(preset: PromptPresetLike, index: number) {
  return presetMultiSelect.isSelected(getPresetSelectionId(preset, index))
}

function getPresetMenuMode(preset: PromptPresetLike, index: number) {
  return presetRowMenu.getMenuMode(getPresetSelectionId(preset, index))
}

function shouldShowPresetMenuTrigger(preset: PromptPresetLike, index: number) {
  return presetRowMenu.shouldShowMenuTrigger(getPresetSelectionId(preset, index))
}

function togglePresetMenu(preset: PromptPresetLike, index: number, event?: Event) {
  presetFloatingMenuKit.updateFloatingMenuPosition(event)
  presetRowMenu.toggleMenu(getPresetSelectionId(preset, index))
}

function isPresetMenuOpen(preset: PromptPresetLike, index: number) {
  return presetRowMenu.isMenuOpen(getPresetSelectionId(preset, index))
}

function togglePresetDragMode() {
  presetDragModeKit.toggleDragMode()
  presetRowMenu.closeMenu()
  presetMultiSelect.clearSelection()
  clearPresetPointerDrag()
}

function getPresetMenuTargetIndexes(preset: PromptPresetLike, index: number) {
  if (getPresetMenuMode(preset, index) === 'batch') {
    const selected = new Set(presetMultiSelect.selectedIds.value)
    return (props.viewModel.filteredPresets || [])
      .map((item, itemIndex) => ({ item, itemIndex }))
      .filter(({ item, itemIndex }) => selected.has(getPresetSelectionId(item, itemIndex)))
      .map(({ itemIndex }) => itemIndex)
  }
  return [index]
}

function getPresetMenuItems(preset: PromptPresetLike, index: number) {
  const targetIndexes = getPresetMenuTargetIndexes(preset, index)
  const targets = targetIndexes.map((itemIndex) => props.viewModel.filteredPresets[itemIndex]).filter(Boolean)
  const anyLocked = targets.some((item) => isLockedPreset(item))
  const anyDisabled = targets.some((item) => !item?.enabled)
  const anyEnabled = targets.some((item) => item?.enabled)
  const items = []

  if (targetIndexes.length === 1) items.push({ key: 'edit', label: '编辑', action: 'edit' })
  if (anyDisabled) items.push({ key: 'enable', label: '启用', action: 'enable' })
  if (anyEnabled) items.push({ key: 'disable', label: '停用', action: 'disable' })
  items.push({ key: 'delete', label: '删除', action: 'delete', danger: true, disabled: anyLocked })
  return items
}

function applyPresetMenuSelection(indexes: number[]) {
  const ids = indexes
    .map((itemIndex) => getPresetSelectionId(props.viewModel.filteredPresets[itemIndex], itemIndex))
    .filter(Boolean)
  presetMultiSelect.setSelectedIds(ids)
}

function runPresetMenuAction(action: string, preset: PromptPresetLike, index: number) {
  const targetIndexes = getPresetMenuTargetIndexes(preset, index)
  presetRowMenu.closeMenu()
  applyPresetMenuSelection(targetIndexes)

  if (action === 'edit') {
    props.actions.editPromptPreset(props.viewModel.getOriginalIndex(index))
    return
  }

  if (action === 'enable' || action === 'disable') {
    const shouldEnable = action === 'enable'
    targetIndexes.forEach((itemIndex) => {
      const target = props.viewModel.filteredPresets[itemIndex]
      if (!target) return
      if (Boolean(target.enabled) !== shouldEnable) {
        props.actions.togglePresetEnabled(props.viewModel.getOriginalIndex(itemIndex))
      }
    })
    return
  }

  if (action === 'delete') {
    targetIndexes
      .slice()
      .sort((left, right) => right - left)
      .forEach((itemIndex) => {
        const target = props.viewModel.filteredPresets[itemIndex]
        if (!target || isLockedPreset(target)) return
        props.actions.deletePromptPreset(props.viewModel.getOriginalIndex(itemIndex))
      })
    presetMultiSelect.clearSelection()
  }
}

function handlePresetClick(preset: PromptPresetLike, index: number, event: MouseEvent | PointerEvent) {
  if (presetPointerDrag.shouldSuppressClick()) {
    event.preventDefault()
    return
  }
  presetRowMenu.closeMenu()
  if (presetDragEnabled.value) {
    presetMultiSelect.handleItemClick({
      id: getPresetSelectionId(preset, index),
      event
    })
    return
  }
  presetMultiSelect.handleItemClick({
    id: getPresetSelectionId(preset, index),
    event,
    onDefault: () => {
      props.actions.editPromptPreset(props.viewModel.getOriginalIndex(index))
    }
  })
}

function handlePresetPointerDown(preset: PromptPresetLike, index: number, event: PointerEvent) {
  if (!presetDragEnabled.value) return
  if (event.button !== 0) return
  const target = event.target instanceof HTMLElement ? event.target : null
  if (target?.closest('.preset-actions') || target?.closest('.preset-row-menu')) return
  event.preventDefault()
  const id = getPresetSelectionId(preset, index)
  presetMultiSelect.handlePointerDown(id, event)
  if (target && typeof target.setPointerCapture === 'function') {
    try {
      target.setPointerCapture(event.pointerId)
    } catch {
      // 捕获失败不影响拖拽，窗口级事件仍会继续兜底。
    }
  }
  presetPointerDrag.begin({
    pointerId: event.pointerId,
    currentId: id,
    startX: event.clientX,
    startY: event.clientY
  })
}

function getVisiblePresetRows() {
  return getVisibleSidebarElements('.preset-item[data-preset-drag-id]')
}

function resolvePointerPresetDropTarget(pointerX: number, pointerY: number) {
  if (typeof document === 'undefined') return null
  const selector = '.preset-item[data-preset-drag-id]'
  const draggingIds = new Set(presetDrag.draggingIds.value)
  const exactCandidate = document.elementFromPoint(pointerX, pointerY)?.closest(selector) as HTMLElement | null
  const exactId = String(exactCandidate?.dataset.presetDragId || '').trim()
  const exactRow = exactId && !draggingIds.has(exactId) ? exactCandidate : null
  const rows = getVisiblePresetRows().filter((row) => {
    const rowId = String(row.dataset.presetDragId || '').trim()
    return rowId && !draggingIds.has(rowId)
  })
  return resolveBufferedDropTarget(rows, pointerY, exactRow, {
    readId: (element) => String(element.dataset.presetDragId || '').trim()
  })
}

function updatePresetPointerPreview(pointerX: number, pointerY: number) {
  if (!presetPointerDrag.dragging.value) return
  const resolved = resolvePointerPresetDropTarget(pointerX, pointerY)
  if (!resolved) {
    presetDrag.clearPreview()
    return
  }
  presetDrag.previewDrop(resolved.targetId, resolved.position)
}

function getOriginalIndexByPresetId(id: string) {
  const row = basePresetRows.value.find((item) => item.id === id)
  return row ? props.viewModel.getOriginalIndex(row.index) : -1
}

function commitProjectedPresetDrop() {
  let payload = presetDrag.buildProjectedDropPayload()
  if (!payload) {
    const resolved = resolvePointerPresetDropTarget(lastPresetPointer.value.x, lastPresetPointer.value.y)
    if (resolved) {
      payload = {
        draggedIds: [...presetDrag.draggingIds.value],
        targetId: resolved.targetId,
        position: resolved.position
      }
    }
  }
  if (!payload) return
  const draggedIndexes = payload.draggedIds
    .map((id) => getOriginalIndexByPresetId(id))
    .filter((index) => index >= 0)
  const targetIndex = getOriginalIndexByPresetId(payload.targetId)
  if (!draggedIndexes.length || targetIndex < 0) return
  props.actions.reorderPromptPresets({
    draggedIndexes,
    targetIndex,
    position: payload.position
  })
}

function clearPresetPointerDrag() {
  presetPointerDrag.clear()
}

function isPresetDragging(id: string) {
  return presetPointerDrag.dragging.value && presetDrag.draggingIds.value.includes(id)
}

function isPresetDropTarget(id: string) {
  return presetDrag.dropTargetId.value === id
}

function isPresetDropTargetBefore(id: string) {
  return isPresetDropTarget(id) && presetDrag.dropPosition.value === 'before'
}

function isPresetDropTargetAfter(id: string) {
  return isPresetDropTarget(id) && presetDrag.dropPosition.value === 'after'
}

function handleWindowPresetPointerMove(event: PointerEvent) {
  presetPointerDrag.handleMove(event)
}

async function handleWindowPresetPointerUp(event: PointerEvent) {
  await presetPointerDrag.handleUp(event)
}

function handleWindowPresetPointerCancel(event: PointerEvent) {
  presetPointerDrag.handleCancel(event)
}

function openImportPicker() {
  importInputRef.value?.click()
}

async function handleImportChange(event: Event) {
  const input = event.target as HTMLInputElement | null
  const file = input?.files?.[0]
  if (!file) return

  try {
    const count = await props.actions.importPromptPresetsFromFile(file)
    showNotice(`已导入 ${count} 条预设`)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error || '')
    showNotice(`导入失败：${message}`)
  } finally {
    if (input) input.value = ''
  }
}

onMounted(() => {
  presetDragModeKit.hydrate()
  if (typeof window === 'undefined') return
  window.addEventListener('pointermove', handleWindowPresetPointerMove)
  window.addEventListener('pointerup', handleWindowPresetPointerUp)
  window.addEventListener('pointercancel', handleWindowPresetPointerCancel)
})

onUnmounted(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('pointermove', handleWindowPresetPointerMove)
    window.removeEventListener('pointerup', handleWindowPresetPointerUp)
    window.removeEventListener('pointercancel', handleWindowPresetPointerCancel)
  }
  clearPresetPointerDrag()
  if (notice.value.timer) {
    clearTimeout(notice.value.timer)
    notice.value.timer = null
  }
})
</script>

<style scoped>
.preset-item--selected {
  background: color-mix(in srgb, var(--morandi-accent) 8%, var(--morandi-card));
}

.preset-list--drag-enabled .preset-item {
  cursor: grab;
}

.preset-list--dragging .preset-item {
  cursor: grabbing;
}

.preset-item,
.preset-item * {
  user-select: none;
  -webkit-user-select: none;
  -webkit-user-drag: none;
}

.preset-item {
  position: relative;
  transition: background-color 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease, opacity 0.18s ease;
  will-change: transform;
}

.preset-item--drag-mode {
  touch-action: none;
}

.preset-item--dragging {
  opacity: 0.64;
  background: color-mix(in srgb, #829987 10%, var(--morandi-card));
  box-shadow: 0 10px 22px rgba(73, 91, 79, 0.12);
  animation: preset-drag-press 160ms ease-out;
}

.preset-item--drop-target {
  border-color: #829987;
}

.preset-item--drop-target::before,
.preset-item--drop-target::after {
  content: '';
  position: absolute;
  left: 8px;
  right: 8px;
  height: 2px;
  border-radius: 999px;
  background: #829987;
  pointer-events: none;
}

.preset-item--drop-target-before::before {
  top: -5px;
}

.preset-item--drop-target-after::after {
  bottom: -5px;
}

.preset-item--preview-shift {
  transform: translateY(0);
}

.preset-reorder-move {
  transition: transform 240ms cubic-bezier(0.22, 1, 0.36, 1);
}

.preset-reorder-enter-active,
.preset-reorder-leave-active {
  transition: transform 180ms ease, opacity 180ms ease;
}

.preset-reorder-enter-from,
.preset-reorder-leave-to {
  opacity: 0;
  transform: translateY(6px);
}

.preset-reorder-leave-active {
  position: absolute;
  width: 100%;
}

.preset-drag-toggle.active {
  background: rgba(130, 153, 135, 0.14);
  color: var(--morandi-accent);
}

.preset-header {
  display: flex;
  align-items: center;
  gap: 10px;
}

.preset-selection-indicator {
  width: 3px;
  min-width: 3px;
  height: 20px;
  border: none;
  border-radius: 999px;
  background: transparent;
  flex: 0 0 3px;
}

.preset-selection-indicator.active {
  background: #829987;
}

.preset-actions {
  position: relative;
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.preset-switch {
  width: 34px;
  height: 20px;
  border: none;
  border-radius: 999px;
  background: var(--morandi-border);
  padding: 2px;
  display: inline-flex;
  align-items: center;
  cursor: pointer;
  transition: background 0.2s ease;
}

.preset-switch--on {
  background: #9fbdbc;
}

.preset-switch__thumb {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 4px rgba(58, 77, 78, 0.18);
  transition: transform 0.2s ease;
}

.preset-switch--on .preset-switch__thumb {
  transform: translateX(14px);
}

.preset-menu-trigger {
  width: 26px;
  height: 26px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: inherit;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.preset-menu-trigger svg {
  width: 16px;
  height: 16px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
}

.preset-row-menu {
  min-width: 140px;
  z-index: 12000;
  border: 1px solid var(--langhuan-menu-border, color-mix(in srgb, var(--morandi-border) 62%, transparent));
  border-radius: var(--langhuan-menu-radius, 0);
  background: var(--morandi-card);
  box-shadow: var(--langhuan-menu-shadow, 0 3px 10px rgba(56, 46, 38, 0.08));
  overflow: hidden;
}

.preset-row-menu-item {
  width: 100%;
  border: none;
  background: transparent;
  text-align: left;
  padding: 10px 12px;
  cursor: pointer;
}

.preset-row-menu-item:hover {
  background: color-mix(in srgb, var(--morandi-accent) 8%, var(--morandi-card));
}

.preset-row-menu-item:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.preset-row-menu-item.danger {
  color: var(--morandi-danger);
}

.preset-section-notice {
  position: fixed;
  right: 18px;
  bottom: 18px;
  z-index: 2100;
  max-width: 320px;
  padding: 10px 14px;
  border-radius: 10px;
  background: rgba(56, 52, 48, 0.92);
  color: #fff;
  font-size: 0.82rem;
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.18);
}

@keyframes preset-drag-press {
  from {
    transform: scale(0.995);
  }
  to {
    transform: scale(1);
  }
}
</style>
