<template>
  <div class="mobile-prompt-library">
    <!-- 列表态：行序即真实拼装顺序（doc-library 提示词区块规则），数据来自桌面 PromptLibraryPanel 的 sidebar 状态 -->
    <template v-if="pane === 'list'">
      <div class="mobile-prompt-library__toolbar">
        <span class="mobile-prompt-library__count">{{ $t('mobile.promptLib.assemblyOrder', { count: rows.length }) }}</span>
        <button
          type="button"
          class="mobile-prompt-library__tool-btn"
          :class="{ 'mobile-prompt-library__tool-btn--active': filterMode === 'required' }"
          @click="toggleFilterMode"
        >
          {{ filterMode === 'required' ? $t('mobile.promptLib.filterRequired') : $t('mobile.promptLib.filter') }}
        </button>
        <button
          type="button"
          class="mobile-prompt-library__tool-btn"
          :class="{ 'mobile-prompt-library__tool-btn--active': sortMode }"
          :disabled="!canSort"
          :title="canSort ? $t('mobile.promptLib.sortTitleCan') : $t('mobile.promptLib.sortTitleCant')"
          @click="toggleSortMode"
        >
          {{ $t('mobile.promptLib.sort') }}
        </button>
        <button type="button" class="mobile-prompt-library__tool-btn" @click="openCreate">
          <MobileLineIcon name="plus" :size="15" :stroke-width="2" />{{ $t('common.create') }}
        </button>
      </div>

      <div class="mobile-prompt-library__list lhm-scroll">
        <button
          v-for="(row, index) in visibleRows"
          :key="row.id"
          type="button"
          class="mobile-prompt-library__row"
          :class="{ 'mobile-prompt-library__row--muted': !row.enabled }"
          @click="openEditor(row.id)"
        >
          <span class="mobile-prompt-library__row-text">
            <strong>{{ row.title }}</strong>
            <em>{{ row.meta }}</em>
          </span>
          <span v-if="sortMode && canSort" class="mobile-prompt-library__row-sort">
            <span
              class="mobile-prompt-library__sort-btn"
              :class="{ 'mobile-prompt-library__sort-btn--disabled': index === 0 }"
              role="button"
              :aria-label="$t('mobile.promptLib.moveUp')"
              @click.stop="moveRow(row, index, -1)"
            >
              <MobileLineIcon name="chevron-up" :size="16" :stroke-width="2" />
            </span>
            <span
              class="mobile-prompt-library__sort-btn"
              :class="{ 'mobile-prompt-library__sort-btn--disabled': index === visibleRows.length - 1 }"
              role="button"
              :aria-label="$t('mobile.promptLib.moveDown')"
              @click.stop="moveRow(row, index, 1)"
            >
              <MobileLineIcon name="chevron-down" :size="16" :stroke-width="2" />
            </span>
          </span>
          <MobileLineIcon v-else class="mobile-prompt-library__row-chevron" name="chevron-right" :size="16" />
        </button>
        <p v-if="!visibleRows.length" class="mobile-prompt-library__empty">
          {{ rows.length ? $t('mobile.promptLib.emptyNoMatch') : $t('mobile.promptLib.emptyNoRecord') }}
        </p>
      </div>
    </template>

    <!-- 编辑态：复用桌面 PromptLibraryPanel 主编辑区（externalSidebar 模式），仅做窄屏容器适配。
         面板保持常驻挂载（v-show）以维持列表数据与选中态；弹窗经 Teleport 渲染不受隐藏影响。 -->
    <div v-show="pane === 'editor'" class="mobile-prompt-library__editor">
      <div class="mobile-prompt-library__editor-head">
        <button type="button" class="mobile-prompt-library__back" :aria-label="$t('mobile.promptLib.backToList')" @click="backToList">
          <MobileLineIcon name="chevron-left" :size="22" :stroke-width="1.8" />
        </button>
        <span class="mobile-prompt-library__editor-title">{{ activeTitle }}</span>
      </div>
      <div class="mobile-prompt-library__panel lhm-scroll">
        <PromptLibraryPanel
          ref="panelRef"
          external-sidebar
          @sidebar-state-change="syncSidebarState"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import MobileLineIcon from './MobileLineIcon.vue'

const { t } = useI18n()

// 桌面提示词面板按需加载，避免拖累文档库首屏
const PromptLibraryPanel = defineAsyncComponent(() => import('../PromptLibraryPanel.vue'))

type PromptSidebarRowView = {
  id: string
  title: string
  meta: string
  enabled: boolean
  active: boolean
}

type PromptSidebarStateView = {
  rows: PromptSidebarRowView[]
  selectedId: string
  totalCount: number
  dragEnabled: boolean
  filterMode: 'all' | 'required'
}

type PromptLibraryExpose = {
  getSidebarState?: () => PromptSidebarStateView
  selectPromptFromParent?: (recordId: string) => void
  openCreateDialogFromParent?: () => void
  setPromptFilterModeFromParent?: (mode: 'all' | 'required') => void
  reorderPromptFromParent?: (sourceId: string, targetId: string, position: 'before' | 'after') => void
}

const props = defineProps<{
  searchText?: string
}>()

const emit = defineEmits<{
  depthChange: [isDeep: boolean]
}>()

const panelRef = ref<PromptLibraryExpose | null>(null)
const pane = ref<'list' | 'editor'>('list')
const sortMode = ref(false)
const rows = ref<PromptSidebarRowView[]>([])
const selectedId = ref('')
const filterMode = ref<'all' | 'required'>('all')

const normalizedQuery = computed(() => String(props.searchText || '').trim().toLowerCase())
// 搜索只过滤显示，不改面板内部筛选真值
const visibleRows = computed(() => {
  if (!normalizedQuery.value) return rows.value
  return rows.value.filter((row) => `${row.title}\n${row.meta}`.toLowerCase().includes(normalizedQuery.value))
})
// 搜索中或只看必装时，行序不等于完整拼装顺序，禁止排序避免错位写入
const canSort = computed(() => !normalizedQuery.value && filterMode.value === 'all')
const activeTitle = computed(() => rows.value.find((row) => row.id === selectedId.value)?.title || t('docLibrary.topbar.editPrompt'))

watch(pane, (value) => {
  emit('depthChange', value === 'editor')
}, { immediate: true })

watch(canSort, (value) => {
  if (!value) sortMode.value = false
})

function syncSidebarState() {
  const state = panelRef.value?.getSidebarState?.()
  if (!state) return
  rows.value = state.rows.map((row) => ({
    id: row.id,
    title: row.title,
    meta: row.meta,
    enabled: row.enabled,
    active: row.active
  }))
  selectedId.value = state.selectedId
  filterMode.value = state.filterMode === 'required' ? 'required' : 'all'
}

function openEditor(recordId: string) {
  panelRef.value?.selectPromptFromParent?.(recordId)
  selectedId.value = recordId
  pane.value = 'editor'
}

function backToList() {
  pane.value = 'list'
}

function openCreate() {
  panelRef.value?.openCreateDialogFromParent?.()
}

function toggleFilterMode() {
  const next = filterMode.value === 'required' ? 'all' : 'required'
  panelRef.value?.setPromptFilterModeFromParent?.(next)
  filterMode.value = next
}

function toggleSortMode() {
  if (!canSort.value) return
  sortMode.value = !sortMode.value
}

function moveRow(row: PromptSidebarRowView, index: number, direction: -1 | 1) {
  if (!canSort.value) return
  const neighbor = visibleRows.value[index + direction]
  if (!neighbor) return
  panelRef.value?.reorderPromptFromParent?.(row.id, neighbor.id, direction < 0 ? 'before' : 'after')
}
</script>

<style scoped>
.mobile-prompt-library {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
}

/* 列表工具行：轻量文字/图标按钮，计数靠左、动作靠右 */
.mobile-prompt-library__toolbar {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 8px;
  border-bottom: 1px solid var(--lhm-border-line, #e5e5e5);
  padding: 8px 2px 10px;
}

.mobile-prompt-library__count {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  color: var(--lhm-text-muted, #999);
  font-size: 11.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mobile-prompt-library__tool-btn {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  gap: 3px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--lhm-text-light, #666);
  cursor: pointer;
  font: inherit;
  font-size: 12.5px;
  padding: 5px 8px;
  -webkit-tap-highlight-color: transparent;
}

.mobile-prompt-library__tool-btn--active {
  background: rgba(92, 138, 92, 0.14);
  color: var(--lhm-accent, #5c8a5c);
}

.mobile-prompt-library__tool-btn:disabled {
  opacity: 0.45;
  cursor: default;
}

.mobile-prompt-library__list {
  min-height: 0;
  flex: 1;
  overflow-y: auto;
}

/* 行：细线分隔，序号即拼装顺序 */
.mobile-prompt-library__row {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 10px;
  border: 0;
  border-bottom: 1px solid var(--lhm-border-line, #e5e5e5);
  background: transparent;
  color: var(--lhm-text, #333);
  cursor: pointer;
  font: inherit;
  text-align: left;
  padding: 11px 2px;
  -webkit-tap-highlight-color: transparent;
}

.mobile-prompt-library__row--muted {
  opacity: 0.6;
}

.mobile-prompt-library__row-text {
  display: grid;
  min-width: 0;
  flex: 1;
  gap: 2px;
}

.mobile-prompt-library__row-text strong {
  overflow: hidden;
  font-size: 13.5px;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mobile-prompt-library__row-text em {
  overflow: hidden;
  color: var(--lhm-text-muted, #999);
  font-size: 11px;
  font-style: normal;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mobile-prompt-library__row-chevron {
  flex-shrink: 0;
  color: var(--lhm-text-faint, #b6b0a7);
}

.mobile-prompt-library__row-sort {
  display: inline-flex;
  flex-shrink: 0;
  gap: 2px;
}

.mobile-prompt-library__sort-btn {
  display: inline-flex;
  width: 30px;
  height: 30px;
  align-items: center;
  justify-content: center;
  border-radius: 7px;
  color: var(--lhm-text-light, #666);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.mobile-prompt-library__sort-btn:active {
  background: rgba(92, 138, 92, 0.12);
}

.mobile-prompt-library__sort-btn--disabled {
  opacity: 0.35;
  pointer-events: none;
}

.mobile-prompt-library__empty {
  margin: 0;
  color: var(--lhm-text-muted, #999);
  font-size: 12.5px;
  line-height: 1.7;
  padding: 16px 4px;
}

/* 编辑态：返回头 + 桌面编辑面板窄屏适配 */
.mobile-prompt-library__editor {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
}

.mobile-prompt-library__editor-head {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 6px;
  border-bottom: 1px solid var(--lhm-border-line, #e5e5e5);
  padding: 2px 0 10px;
}

.mobile-prompt-library__back {
  display: inline-flex;
  width: 34px;
  height: 34px;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border: 0;
  background: transparent;
  color: var(--lhm-text-light, #666);
  cursor: pointer;
  margin-left: -6px;
  -webkit-tap-highlight-color: transparent;
}

.mobile-prompt-library__editor-title {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  color: var(--lhm-text, #333);
  font-size: 15.5px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 窄屏适配桌面编辑面板：滚动宿主 + 去背景、收内边距、正文区给足高度
   （桌面侧改动这些类名时此处需同步） */
.mobile-prompt-library__panel {
  min-height: 0;
  flex: 1;
  overflow-y: auto;
}

.mobile-prompt-library__panel :deep(.prompt-library) {
  background: transparent;
}

.mobile-prompt-library__panel :deep(.prompt-library__editor),
.mobile-prompt-library__panel :deep(.prompt-library__empty) {
  padding: 12px 2px 18px;
}

.mobile-prompt-library__panel :deep(.prompt-library__form-grid) {
  grid-template-columns: 1fr;
}

.mobile-prompt-library__panel :deep(.prompt-library__toolbar) {
  flex-wrap: wrap;
  align-items: flex-start;
}

.mobile-prompt-library__panel :deep(.prompt-library__textarea) {
  min-height: 42dvh;
}
</style>
