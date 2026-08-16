<template>
  <AppFormDialog
    :open="open"
    :title="$t('brain.worldTreeImport.title')"
    :subtitle="$t('brain.worldTreeImport.subtitle', { parent: parentTitle || $t('brain.domainLabel.soul') })"
    size="lg"
    :submit-text="$t('brain.importToCurrentNode')"
    :submit-disabled="!preview || preview.flatNodes.length === 0 || saving"
    @cancel="$emit('cancel')"
    @submit="submitImport"
  >
    <div class="brain-world-tree-import">
      <div class="brain-world-tree-import__toolbar-note">
        <span>{{ $t('brain.worldTreeImport.selectedCount', { count: selectedIds.length }) }}</span>
        <span v-if="preview">{{ $t('brain.worldTreeImport.estimateCount', { count: preview.flatNodes.length }) }}</span>
      </div>

      <div class="brain-world-tree-import__tree-panel" role="tree" :aria-label="$t('brain.worldTreeImport.treeAriaLabel')">
        <div
          v-for="row in decoratedVisibleRows"
          :key="row.id"
          class="brain-world-tree-import__row"
          :class="{
            'brain-world-tree-import__row--selected': row.selected,
            'brain-world-tree-import__row--selected-before': row.selectedBefore,
            'brain-world-tree-import__row--selected-after': row.selectedAfter,
            'brain-world-tree-import__row--cluster': row.kind === 'cluster',
            'brain-world-tree-import__row--folder': row.kind === 'folder',
            'brain-world-tree-import__row--document': row.kind === 'document'
          }"
          :style="{ '--depth': String(row.depth) }"
          role="treeitem"
          :aria-expanded="row.kind === 'document' ? undefined : openIds.has(row.id)"
          :aria-selected="selectedIdSet.has(row.id)"
          @mousedown.prevent
          @selectstart.prevent
          @click="toggleSelectRow(row, $event)"
        >
          <button
            v-if="row.kind !== 'document'"
            type="button"
            class="brain-world-tree-import__toggle"
            :class="{ 'brain-world-tree-import__toggle--open': openIds.has(row.id) }"
            :aria-label="openIds.has(row.id) ? $t('common.collapse') : $t('common.expand')"
            @pointerdown.stop.prevent
            @click.stop.prevent="toggleOpen(row.id)"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M8 10l4 4 4-4" />
            </svg>
          </button>
          <span v-else class="brain-world-tree-import__toggle-spacer"></span>
          <span
            class="brain-world-tree-import__marker"
            :class="{ active: selectedIdSet.has(row.id) }"
            aria-hidden="true"
          ></span>
          <span class="brain-world-tree-import__label">{{ row.label }}</span>
        </div>

        <p v-if="visibleRows.length === 0" class="brain-world-tree-import__empty">
          {{ $t('brain.worldTreeImport.empty') }}
        </p>
      </div>
    </div>
  </AppFormDialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  buildCharacterBrainImportPreview,
  buildCharacterBrainWorldTreeImportDraft
} from '../../app/characterBrainImport'
import type {
  BrainDocumentRecord,
  CharacterBrainCognitionNode,
  CharacterBrainImportConflictAction,
  CharacterBrainImportDraft
} from '../../types'
import AppFormDialog from '../common/AppFormDialog.vue'

type WorldTreeRow = {
  id: string
  label: string
  depth: number
  kind: 'cluster' | 'folder' | 'document'
  parentId?: string
  folderPath?: string
  documentId?: string
}

type WorldTreeFolderNode = {
  id: string
  label: string
  folderPath: string
  kind: 'cluster' | 'folder'
  overviewDocument?: BrainDocumentRecord
  children: WorldTreeFolderNode[]
  childMap: Map<string, WorldTreeFolderNode>
  documents: BrainDocumentRecord[]
}

const props = withDefaults(defineProps<{
  open: boolean
  parentId: string
  parentTitle?: string
  existingNodes: CharacterBrainCognitionNode[]
  documents: BrainDocumentRecord[]
  saving?: boolean
}>(), {
  // 空串时标题回退到 i18n 的「灵魂」标签
  parentTitle: '',
  saving: false
})

const { t } = useI18n()

const emit = defineEmits<{
  (e: 'cancel'): void
  (e: 'submit', payload: {
    draft: CharacterBrainImportDraft
    conflictActions: Record<string, CharacterBrainImportConflictAction>
    defaultConflictAction: CharacterBrainImportConflictAction
  }): void
}>()

const selectedIds = ref<string[]>([])
const lastSelectedId = ref('')
const openIds = ref<Set<string>>(new Set())

const rows = computed(() => buildWorldTreeRows(props.documents))
const rowMap = computed(() => new Map(rows.value.map((row) => [row.id, row] as const)))
const selectedIdSet = computed(() => new Set(selectedIds.value))
const visibleRows = computed(() => rows.value.filter((row) => {
  let parentId = row.parentId || ''
  while (parentId) {
    if (!openIds.value.has(parentId)) return false
    parentId = rowMap.value.get(parentId)?.parentId || ''
  }
  return true
}))
const descendantIdsByRowId = computed(() => buildDescendantIdsByRowId(rows.value))
const decoratedVisibleRows = computed(() => visibleRows.value.map((row, index, list) => {
  const selected = selectedIdSet.value.has(row.id)
  return {
    ...row,
    selected,
    selectedBefore: selected && index > 0 && selectedIdSet.value.has(list[index - 1].id),
    selectedAfter: selected && index < list.length - 1 && selectedIdSet.value.has(list[index + 1].id)
  }
}))
const draft = computed(() => buildCharacterBrainWorldTreeImportDraft(props.documents, selectedIds.value))
const preview = computed(() => (
  draft.value.flatNodes.length
    ? buildCharacterBrainImportPreview(props.existingNodes, props.parentId, draft.value)
    : null
))

watch(
  () => props.open,
  (open) => {
    if (!open) return
    selectedIds.value = []
    lastSelectedId.value = ''
    openIds.value = new Set(rows.value.filter((row) => row.kind !== 'document').map((row) => row.id))
  },
  { immediate: true }
)

function submitImport() {
  if (!preview.value || !preview.value.flatNodes.length || props.saving) return
  emit('submit', {
    draft: draft.value,
    conflictActions: {},
    defaultConflictAction: 'skip'
  })
}

function toggleOpen(id: string) {
  const next = new Set(openIds.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  openIds.value = next
}

function toggleSelectRow(row: WorldTreeRow, event: MouseEvent) {
  const rowSelectionIds = collectRowSelectionIds(row)
  let nextIds = [...selectedIds.value]

  if (event.shiftKey && lastSelectedId.value) {
    const ids = visibleRows.value.map((item) => item.id)
    const startIndex = ids.indexOf(lastSelectedId.value)
    const endIndex = ids.indexOf(row.id)
    if (startIndex >= 0 && endIndex >= 0) {
      const range = ids.slice(Math.min(startIndex, endIndex), Math.max(startIndex, endIndex) + 1)
      const rangeSelectionIds = range.flatMap((id) => {
        const rangeRow = rowMap.value.get(id)
        return rangeRow ? collectRowSelectionIds(rangeRow) : [id]
      })
      nextIds = uniqueIds([...nextIds, ...rangeSelectionIds])
    }
  } else if (event.ctrlKey || event.metaKey) {
    const isSubtreeSelected = rowSelectionIds.every((id) => selectedIdSet.value.has(id))
    const rowSelectionIdSet = new Set(rowSelectionIds)
    nextIds = isSubtreeSelected
      ? nextIds.filter((id) => !rowSelectionIdSet.has(id))
      : uniqueIds([...nextIds, ...rowSelectionIds])
  } else {
    nextIds = rowSelectionIds
    if (row.kind !== 'document') toggleOpen(row.id)
  }

  selectedIds.value = nextIds
  lastSelectedId.value = row.id
}

function collectRowSelectionIds(row: WorldTreeRow) {
  return row.kind === 'document'
    ? [row.id]
    : uniqueIds([row.id, ...(descendantIdsByRowId.value.get(row.id) || [])])
}

function buildDescendantIdsByRowId(sourceRows: WorldTreeRow[]) {
  const childrenByParentId = new Map<string, string[]>()
  sourceRows.forEach((row) => {
    const parentId = row.parentId || ''
    if (!parentId) return
    const children = childrenByParentId.get(parentId) || []
    children.push(row.id)
    childrenByParentId.set(parentId, children)
  })

  const descendantIds = new Map<string, string[]>()
  const collect = (id: string): string[] => {
    const cached = descendantIds.get(id)
    if (cached) return cached
    const children = childrenByParentId.get(id) || []
    const collected = children.flatMap((childId) => [childId, ...collect(childId)])
    descendantIds.set(id, collected)
    return collected
  }

  sourceRows.forEach((row) => collect(row.id))
  return descendantIds
}

function uniqueIds(ids: string[]) {
  return Array.from(new Set(ids))
}

function buildWorldTreeRows(documents: BrainDocumentRecord[]) {
  const roots = buildWorldTreeFolders(documents)
  const nextRows: WorldTreeRow[] = []

  const walkFolder = (folder: WorldTreeFolderNode, depth: number, parentId = '') => {
    nextRows.push({
      id: folder.id,
      label: folder.label,
      depth,
      kind: folder.kind,
      parentId,
      folderPath: folder.folderPath
    })

    folder.children.forEach((child) => walkFolder(child, depth + 1, folder.id))
    folder.documents.forEach((document) => {
      nextRows.push({
        id: `document:${document.documentId}`,
        label: document.title || stripMarkdownExtension(lastPathSegment(document.displayPath)),
        depth: depth + 1,
        kind: 'document',
        parentId: folder.id,
        documentId: document.documentId
      })
    })
  }

  roots.forEach((cluster) => walkFolder(cluster, 0, ''))
  return nextRows
}

function buildWorldTreeFolders(documents: BrainDocumentRecord[]) {
  const roots: WorldTreeFolderNode[] = []
  const rootMap = new Map<string, WorldTreeFolderNode>()

  const ensureFolder = (
    container: WorldTreeFolderNode[],
    containerMap: Map<string, WorldTreeFolderNode>,
    label: string,
    folderPath: string,
    depth: number
  ) => {
    const key = String(folderPath || '').trim()
    const existing = containerMap.get(key)
    if (existing) return existing
    const created: WorldTreeFolderNode = {
      id: `${depth === 1 ? 'cluster' : 'folder'}:${key}`,
      label,
      folderPath: key,
      kind: depth === 1 ? 'cluster' : 'folder',
      overviewDocument: undefined,
      children: [],
      childMap: new Map(),
      documents: []
    }
    container.push(created)
    containerMap.set(key, created)
    return created
  }

  documents.forEach((document) => {
    const segments = splitDisplayPath(document.displayPath)
    const folderSegments = segments.slice(0, -1)
    let currentChildren = roots
    let currentMap = rootMap
    let currentFolder: WorldTreeFolderNode | undefined
    const walked: string[] = []

    folderSegments.forEach((segment, index) => {
      walked.push(segment)
      const nextFolder = ensureFolder(
        currentChildren,
        currentMap,
        segment,
        `/${walked.join('/')}`,
        index + 1
      )
      currentFolder = nextFolder
      currentChildren = nextFolder.children
      currentMap = nextFolder.childMap
    })

    if (currentFolder) {
      if (isIndexMarkdownPath(document.displayPath)) currentFolder.overviewDocument = document
      else currentFolder.documents.push(document)
    }
    else ensureFolder(roots, rootMap, t('brain.worldTreeImport.uncategorized'), '/文档', 1).documents.push(document)
  })

  return roots
}

function splitDisplayPath(displayPath: string) {
  return String(displayPath || '')
    .split('/')
    .map((item) => item.trim())
    .filter(Boolean)
}

function lastPathSegment(displayPath: string) {
  const segments = splitDisplayPath(displayPath)
  return segments[segments.length - 1] || t('common.unnamed')
}

function stripMarkdownExtension(value: string) {
  return String(value || '').replace(/\.md$/i, '')
}

function isIndexMarkdownPath(path: string) {
  return /\/index\.md$/i.test(String(path || '').trim())
}
</script>

<style scoped>
.brain-world-tree-import {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 12px;
  width: 100%;
  height: clamp(320px, 48vh, 440px);
  min-height: 0;
  color: var(--morandi-text);
  user-select: none;
  -webkit-user-select: none;
}

.brain-world-tree-import__toolbar-note {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 2px 2px 0;
  font-size: 0.86rem;
  color: var(--morandi-text-light);
}

.brain-world-tree-import__preview-panel {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  gap: 26px;
  height: 100%;
  padding: 34px 28px 18px;
  background: #5f6a33;
  color: #f6efdf;
}

.brain-world-tree-import__preview-copy {
  display: grid;
  gap: 10px;
}

.brain-world-tree-import__eyebrow {
  margin: 0;
  font: 600 0.78rem/1.1 "Aptos", "Segoe UI", sans-serif;
  letter-spacing: 0.24em;
  text-transform: uppercase;
  color: rgba(246, 239, 223, 0.78);
}

.brain-world-tree-import__headline {
  margin: 0;
  color: #fff8ea;
  font-family: "Iowan Old Style", "Palatino Linotype", "Book Antiqua", Georgia, serif;
  font-size: clamp(2.15rem, 3vw, 3.15rem);
  line-height: 0.94;
  font-weight: 600;
  letter-spacing: -0.03em;
}

.brain-world-tree-import__headline span {
  font-size: 0.48em;
  font-weight: 600;
}

.brain-world-tree-import__preview-frame {
  width: min(100%, 250px);
  justify-self: start;
  align-self: center;
  aspect-ratio: 0.82 / 1;
  border-radius: 0;
  background: #f6efdf;
  overflow: hidden;
}

.brain-world-tree-import__preview-note {
  margin: 0;
  max-width: 270px;
  font-family: "Iowan Old Style", "Palatino Linotype", "Book Antiqua", Georgia, serif;
  font-size: 0.92rem;
  line-height: 1.25;
  color: rgba(246, 239, 223, 0.92);
}

.brain-world-tree-import__content-panel {
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
  min-width: 0;
  min-height: 0;
  padding: 28px 28px 18px 0;
  background: #f6efdf;
}

.brain-world-tree-import__tree-panel {
  min-width: 0;
  min-height: 0;
  overflow: auto;
  padding: 8px 8px 6px 10px;
  border: 1px solid var(--morandi-border);
  border-radius: 12px;
  background: color-mix(in srgb, var(--morandi-card) 70%, transparent);
  scrollbar-width: thin;
}

.brain-world-tree-import__tree-panel::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

.brain-world-tree-import__tree-panel::-webkit-scrollbar-thumb {
  background: rgba(126, 167, 157, 0.42);
  border-radius: 999px;
}

.brain-world-tree-import__row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  min-height: 34px;
  margin-top: 3px;
  padding: 4px 14px 4px calc(8px + (var(--depth, 0) * 18px));
  border-radius: 8px;
  border: 1px solid transparent;
  color: var(--morandi-text);
  cursor: pointer;
  transition: background-color 140ms ease, border-color 140ms ease, color 140ms ease;
}

.brain-world-tree-import__row:first-child {
  margin-top: 0;
}

.brain-world-tree-import__row:hover {
  background: var(--morandi-hover);
}

.brain-world-tree-import__row--cluster {
  min-height: 42px;
  margin-top: 8px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--morandi-soft-bg) 78%, transparent);
  font-weight: 700;
}

.brain-world-tree-import__row--cluster:first-child {
  margin-top: 0;
}

.brain-world-tree-import__row--folder {
  font-weight: 600;
}

.brain-world-tree-import__row--selected {
  border-color: rgba(126, 151, 105, 0.16);
  background: rgba(232, 238, 224, 0.62);
  color: #4d5b31;
}

.brain-world-tree-import__row--selected-before {
  margin-top: 0;
  border-top-color: transparent;
  border-top-left-radius: 0;
  border-top-right-radius: 0;
}

.brain-world-tree-import__row--selected-after {
  border-bottom-color: transparent;
  border-bottom-left-radius: 0;
  border-bottom-right-radius: 0;
}

.brain-world-tree-import__row--selected.brain-world-tree-import__row--cluster {
  background: rgba(228, 235, 218, 0.68);
}

.brain-world-tree-import__toggle,
.brain-world-tree-import__toggle-spacer {
  width: 16px;
  height: 16px;
  flex: 0 0 16px;
}

.brain-world-tree-import__marker {
  width: 10px;
  height: 10px;
  flex: 0 0 10px;
  border-radius: 999px;
  border: 1px solid var(--morandi-border);
  background: transparent;
}

.brain-world-tree-import__marker.active {
  border-color: rgba(95, 124, 70, 0.7);
  background: rgba(95, 124, 70, 0.76);
  box-shadow: 0 0 0 3px rgba(95, 124, 70, 0.1);
}

/* 这里刻意对齐文档库世界树的选中反馈；后续若用户要求统一世界树选择体验，请同步检查文档库世界树面板（WorldbookTreePanel / SoneTreeRows）。 */

.brain-world-tree-import__toggle {
  border: none;
  background: transparent;
  color: var(--morandi-text-light);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.brain-world-tree-import__toggle svg {
  width: 12px;
  height: 12px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.6;
  stroke-linecap: round;
  stroke-linejoin: round;
  transform: rotate(-90deg);
  transition: transform 140ms ease;
}

/* 展开态用 class 判定，避免用 aria-label 文本做选择器（i18n 后文本会变） */
.brain-world-tree-import__toggle--open svg {
  transform: rotate(0deg);
}

.brain-world-tree-import__label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
  line-height: 1.35;
}

.brain-world-tree-import__row--document .brain-world-tree-import__label {
  font-weight: 400;
  color: var(--morandi-text);
}

.brain-world-tree-import__footer {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: end;
  gap: 14px 18px;
  padding-left: 12px;
}

.brain-world-tree-import__footer-line {
  grid-column: 1 / -1;
  height: 1px;
  background: rgba(118, 106, 83, 0.38);
}

.brain-world-tree-import__footer-note {
  margin: 0;
  min-height: 46px;
  font-family: "Iowan Old Style", "Palatino Linotype", "Book Antiqua", Georgia, serif;
  font-size: 0.92rem;
  line-height: 1.15;
  font-style: italic;
  text-align: center;
  color: rgba(127, 112, 85, 0.88);
}

.brain-world-tree-import__actions {
  display: flex;
  justify-content: flex-end;
  align-items: center;
}

.brain-world-tree-import__submit-btn {
  min-width: 78px;
  height: 44px;
  padding: 0 20px;
  border-radius: 16px;
  border: 1px solid var(--morandi-border);
  background: color-mix(in srgb, var(--morandi-card) 35%, transparent);
  color: color-mix(in srgb, var(--morandi-text) 84%, transparent);
  font-size: 0.98rem;
  font-weight: 500;
  cursor: pointer;
}

.brain-world-tree-import__submit-btn:hover {
  background: color-mix(in srgb, var(--morandi-card) 52%, transparent);
}

.brain-world-tree-import__submit-btn:disabled {
  color: color-mix(in srgb, var(--morandi-text) 44%, transparent);
  background: color-mix(in srgb, var(--morandi-card) 24%, transparent);
  cursor: not-allowed;
}

.brain-world-tree-import__empty {
  margin: 0;
  padding: 48px 12px;
  text-align: center;
  font-size: 13px;
  color: var(--morandi-text-light);
}

@media (max-width: 900px) {
  .brain-world-tree-import {
    height: clamp(300px, 54vh, 420px);
  }

  .brain-world-tree-import__toolbar-note {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
