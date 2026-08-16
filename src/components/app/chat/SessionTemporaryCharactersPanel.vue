<template>
  <div class="session-temp-panel">
    <div class="session-temp-panel__toolbar">
      <div>
        <strong>临时数据</strong>
        <span>当前会话短期资料</span>
      </div>
      <div class="session-temp-panel__toolbar-actions">
        <button
          type="button"
          class="session-temp-panel__button"
          :disabled="!sessionId || saving"
          @click="loadItems"
        >刷新</button>
        <button
          type="button"
          class="session-temp-panel__button session-temp-panel__button--primary"
          :disabled="!sessionId || saving"
          @click="startCreate"
        >新建</button>
      </div>
    </div>

    <div v-if="loading" class="session-temp-panel__empty">正在读取临时数据...</div>
    <div v-else-if="errorText" class="session-temp-panel__empty session-temp-panel__empty--error">{{ errorText }}</div>
    <div v-else-if="!sessionId" class="session-temp-panel__empty">当前没有打开的会话。</div>
    <div v-else class="session-temp-panel__body">
      <aside class="session-temp-panel__list">
        <div class="session-temp-panel__filters">
          <button
            v-for="option in kindOptions"
            :key="option.value"
            type="button"
            class="session-temp-filter"
            :class="{ selected: activeKind === option.value }"
            @click="selectKind(option.value)"
          >
            <span>{{ option.label }}</span>
            <em>{{ countByKind(option.value) }}</em>
          </button>
        </div>
        <button
          v-for="item in filteredItems"
          :key="item.id"
          type="button"
          class="session-temp-row"
          :class="{ 'session-temp-row--active': activeId === item.id }"
          @click="selectItem(item.id)"
        >
          <span class="session-temp-row__name">{{ item.name }}</span>
          <span class="session-temp-row__meta">{{ formatMeta(item) }}</span>
        </button>
        <div v-if="!filteredItems.length" class="session-temp-panel__empty session-temp-panel__empty--compact">
          当前类型没有临时数据。
        </div>
      </aside>

      <form class="session-temp-editor" @submit.prevent="saveDraft">
        <div class="session-temp-editor__header">
          <div>
            <strong>{{ draft.id ? draft.name || '未命名资料' : `新建${draftKindLabel}` }}</strong>
            <span>{{ editorHint }}</span>
          </div>
          <em>{{ draft.id ? '编辑' : '新建' }}</em>
        </div>
        <div class="session-temp-editor__grid">
          <label class="session-temp-field">
            <span>类型</span>
            <select v-model="draft.kind" :disabled="Boolean(draft.id)">
              <option v-for="option in entityKindOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
            </select>
          </label>
          <label class="session-temp-field">
            <span>名称</span>
            <input v-model="draft.name" placeholder="例如：铜叶子旅店">
          </label>
        </div>
        <label class="session-temp-field">
          <span>别名</span>
          <input v-model="draft.aliasesText" placeholder="逗号分隔">
        </label>
        <label class="session-temp-field">
          <span>标签</span>
          <input v-model="draft.tagsText" placeholder="逗号分隔，用于后续召回">
        </label>
        <label v-if="draft.kind === 'character'" class="session-temp-field">
          <span>锁定字段</span>
          <input v-model="draft.lockedFieldsText" placeholder="例如：身份或称呼, 说话风格">
        </label>
        <label class="session-temp-field session-temp-field--markdown">
          <span>Markdown 资料</span>
          <textarea v-model="draft.markdown" rows="12" spellcheck="false" placeholder="临时资料会保存在当前会话里。"></textarea>
        </label>
        <div class="session-temp-editor__source">
          <span>来源账本 {{ draft.sourceLedger.length }} 条</span>
          <span>{{ persistedSummary }}</span>
        </div>
        <div v-if="formError" class="session-temp-editor__error">{{ formError }}</div>
        <div class="session-temp-editor__actions">
          <button
            v-if="draft.id"
            type="button"
            class="session-temp-panel__button session-temp-panel__button--danger"
            :disabled="saving"
            @click="deleteActive"
          >删除</button>
          <span></span>
          <button
            v-if="draft.id"
            type="button"
            class="session-temp-panel__button"
            :disabled="saving"
            @click="openStatusPanel"
          >状态栏</button>
          <button
            v-if="draft.id && !isPersisted"
            type="button"
            class="session-temp-panel__button"
            :disabled="saving || !draft.markdown.trim()"
            @click="persistActive"
          >{{ draft.kind === 'character' ? '转为正式角色' : '写入世界树' }}</button>
          <button type="button" class="session-temp-panel__button" :disabled="saving" @click="resetDraft">取消</button>
          <button type="submit" class="session-temp-panel__button session-temp-panel__button--primary" :disabled="saving || !draft.name.trim()">
            {{ saving ? '保存中' : '保存' }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import {
  deleteSessionTemporaryEntity,
  fetchSessionTemporaryEntities,
  persistSessionTemporaryEntity,
  saveSessionTemporaryEntity
} from '../../../repositories/chatRepository'
import { applyDocLibraryTreeCommand } from '../../../app/docLibraryTreeCommands'
import { OPEN_STATUS_SYSTEM_PANEL_EVENT } from '../../../app/statusSystemPresets'
import { fetchDocLibraryState, saveDocLibraryState } from '../../../repositories/docBrainRepository'
import type { ChatSessionTemporaryEntity } from '../../../types'
import type { BrainDocumentKind, BrainDocumentType, BrainVersionState, UnitSemanticType } from '../../../types/docBrain'

const props = defineProps<{
  open: boolean
  sessionId: string
}>()

const loading = ref(false)
const saving = ref(false)
const errorText = ref('')
const formError = ref('')
const activeId = ref('')
const activeKind = ref('all')
const items = ref<ChatSessionTemporaryEntity[]>([])

const entityKindOptions = [
  { value: 'character', label: '角色' },
  { value: 'building', label: '建筑' },
  { value: 'region', label: '地理区域' },
  { value: 'faction', label: '势力' },
  { value: 'item', label: '物品' }
]
const kindOptions = [
  { value: 'all', label: '全部' },
  ...entityKindOptions
]

const draft = reactive({
  id: '',
  kind: 'character',
  name: '',
  aliasesText: '',
  tagsText: '',
  lockedFieldsText: '',
  markdown: '',
  sourceLedger: [] as Array<Record<string, unknown>>,
  persistedTarget: {} as Record<string, unknown>
})

const activeItem = computed(() => items.value.find(item => item.id === activeId.value) || null)
const filteredItems = computed(() => {
  if (activeKind.value === 'all') return items.value
  return items.value.filter(item => normalizeKind(item.kind) === activeKind.value)
})
const draftKindLabel = computed(() => kindLabel(draft.kind))
const activeKindLabel = computed(() => {
  if (activeKind.value === 'all') return '全部类型'
  return kindLabel(activeKind.value)
})
const editorHint = computed(() => {
  if (draft.id) return `${draftKindLabel.value} · 当前会话资料`
  return activeKind.value === 'all'
    ? '选择左侧资料，或创建一条会话临时资料'
    : `当前类型暂无选中资料，将按${activeKindLabel.value}创建`
})
const isPersisted = computed(() => Boolean(draft.persistedTarget?.type))
const persistedSummary = computed(() => {
  const target = draft.persistedTarget || {}
  if (target.type === 'character') return '已转为正式角色'
  if (target.type === 'docLibraryPending') return '旧世界树待确认结果（再次转正将升级）'
  return '尚未持久化'
})

function normalizeKind(value: unknown): string {
  const raw = String(value || 'character').trim()
  return raw || 'character'
}

function kindLabel(kind: unknown): string {
  return entityKindOptions.find(option => option.value === normalizeKind(kind))?.label || '资料'
}

function splitList(value: string): string[] {
  return String(value || '')
    .split(/[,\n，、]/)
    .map(item => item.trim())
    .filter(Boolean)
}

function countByKind(kind: string): number {
  if (kind === 'all') return items.value.length
  return items.value.filter(item => normalizeKind(item.kind) === kind).length
}

function formatMeta(item: ChatSessionTemporaryEntity): string {
  const aliases = Array.isArray(item.aliases) ? item.aliases.length : 0
  const tags = Array.isArray(item.tags) ? item.tags.length : 0
  const persisted = item.persistedTarget?.type ? ' / 已持久化' : ''
  return `${kindLabel(item.kind)} / ${aliases} 别名 / ${tags} 标签${persisted}`
}

function applyDraft(item: ChatSessionTemporaryEntity | null) {
  draft.id = String(item?.id || '')
  draft.kind = normalizeKind(item?.kind)
  draft.name = String(item?.name || '')
  draft.aliasesText = Array.isArray(item?.aliases) ? item.aliases.join(', ') : ''
  draft.tagsText = Array.isArray(item?.tags) ? item.tags.join(', ') : ''
  draft.lockedFieldsText = Array.isArray((item as any)?.lockedFields) ? (item as any).lockedFields.join(', ') : ''
  draft.markdown = String(item?.markdown || '')
  draft.sourceLedger = Array.isArray(item?.sourceLedger) ? item.sourceLedger : []
  draft.persistedTarget = item?.persistedTarget && typeof item.persistedTarget === 'object' ? item.persistedTarget : {}
  formError.value = ''
}

function applyEmptyDraft(kind = activeKind.value) {
  applyDraft(null)
  draft.kind = kind !== 'all' ? kind : 'character'
}

function startCreate() {
  activeId.value = ''
  applyEmptyDraft()
}

// 批次4 融合：跳到状态系统面板并下钻到本实体的状态栏（AppChatSection 开面板；AppRoleModals 收起本弹窗防遮挡）。
function openStatusPanel() {
  if (!draft.id) return
  window.dispatchEvent(new CustomEvent(OPEN_STATUS_SYSTEM_PANEL_EVENT, { detail: { hostId: draft.id } }))
}

function resetDraft() {
  if (activeItem.value) applyDraft(activeItem.value)
  else applyEmptyDraft()
}

function selectItem(id: string) {
  activeId.value = String(id || '')
  applyDraft(activeItem.value)
}

function syncSelectionToKind() {
  const nextItem = filteredItems.value.find(item => item.id === activeId.value) || filteredItems.value[0] || null
  activeId.value = nextItem?.id || ''
  if (nextItem) applyDraft(nextItem)
  else applyEmptyDraft()
}

function selectKind(kind: string) {
  activeKind.value = kind
  syncSelectionToKind()
}

async function loadItems() {
  const sessionId = String(props.sessionId || '').trim()
  if (!props.open || !sessionId) return
  loading.value = true
  errorText.value = ''
  try {
    items.value = await fetchSessionTemporaryEntities(sessionId)
    syncSelectionToKind()
  } catch (error) {
    errorText.value = error instanceof Error ? error.message : '加载临时数据失败'
  } finally {
    loading.value = false
  }
}

function replaceItem(item: ChatSessionTemporaryEntity) {
  const index = items.value.findIndex(existing => existing.id === item.id)
  if (index >= 0) items.value.splice(index, 1, item)
  else items.value.unshift(item)
  activeId.value = item.id
  applyDraft(item)
}

async function saveDraft() {
  const sessionId = String(props.sessionId || '').trim()
  if (!sessionId) return
  const name = draft.name.trim()
  if (!name) {
    formError.value = '名称不能为空'
    return
  }
  saving.value = true
  formError.value = ''
  try {
    const saved = await saveSessionTemporaryEntity(sessionId, {
      id: draft.id || undefined,
      kind: draft.kind,
      name,
      aliases: splitList(draft.aliasesText),
      tags: splitList(draft.tagsText),
      markdown: draft.markdown,
      sourceLedger: draft.sourceLedger,
      persistedTarget: draft.persistedTarget
    })
    replaceItem(saved)
  } catch (error) {
    formError.value = error instanceof Error ? error.message : '保存临时数据失败'
  } finally {
    saving.value = false
  }
}

async function deleteActive() {
  const sessionId = String(props.sessionId || '').trim()
  const id = String(draft.id || '').trim()
  if (!sessionId || !id) return
  saving.value = true
  formError.value = ''
  try {
    await deleteSessionTemporaryEntity(sessionId, id)
    items.value = items.value.filter(item => item.id !== id)
    syncSelectionToKind()
  } catch (error) {
    formError.value = error instanceof Error ? error.message : '删除临时数据失败'
  } finally {
    saving.value = false
  }
}

function buildPendingDocDisplayPath(entity: ChatSessionTemporaryEntity): string {
  const target = entity.persistedTarget && typeof entity.persistedTarget === 'object' ? entity.persistedTarget : {}
  const targetPath = String(target.displayPath || '').trim()
  if (targetPath) return targetPath
  const folder = String(target.targetParentPath || '').trim() || `/临时资料/${kindLabel(entity.kind)}`
  const title = String(entity.name || '临时资料').trim() || '临时资料'
  return `${folder}/${title}.md`
}

function buildPendingDocument(entity: ChatSessionTemporaryEntity) {
  const now = new Date().toISOString()
  const target = entity.persistedTarget && typeof entity.persistedTarget === 'object' ? entity.persistedTarget : {}
  const documentId = String(target.documentId || target.targetDocumentId || `temp-entity-${entity.id}`).replace(/[^a-zA-Z0-9_-]/g, '-')
  const title = String(entity.name || '临时资料').trim() || '临时资料'
  const semanticType: UnitSemanticType = normalizeKind(entity.kind) === 'faction'
    ? 'organization'
    : normalizeKind(entity.kind) === 'item'
      ? 'item'
      : normalizeKind(entity.kind) === 'region'
        ? 'region'
        : 'settlement'
  const documentType: BrainDocumentType = normalizeKind(entity.kind) === 'faction'
    ? 'worldview_organization'
    : normalizeKind(entity.kind) === 'item'
      ? 'worldview_item'
      : 'worldview_place'
  const documentKind: BrainDocumentKind = documentType
  const versionState: BrainVersionState = 'pending'
  return {
    documentId,
    id: documentId,
    stableId: documentId,
    title,
    displayPath: buildPendingDocDisplayPath(entity),
    documentType,
    kind: documentKind,
    semanticType,
    summary: '',
    tags: Array.isArray(entity.tags) ? entity.tags : [],
    content: String(entity.markdown || '').trim() || `# ${title}\n\n`,
    sourceDocumentIds: [],
    relatedNeuronIds: [],
    versionState,
    sourceMeta: {
      provider: 'session_temporary_entity',
      sourceFileName: `${title}.md`,
      sourceFilePath: buildPendingDocDisplayPath(entity),
      sourceEntryUid: entity.id,
      sourceEntryKey: `${props.sessionId}:${entity.id}`,
      sourceEntryHash: `${props.sessionId}:${entity.id}:${String(entity.updatedAt || entity.createdAt || '')}`,
      importedAt: now,
      updatedFromSourceAt: now
    },
    createdAt: now,
    updatedAt: now
  }
}

async function persistWorldEntity(entity: ChatSessionTemporaryEntity) {
  const persisted = await persistSessionTemporaryEntity(props.sessionId, entity.id)
  const persistedItem = persisted.item || entity
  if (persistedItem) replaceItem(persistedItem)
  if (persisted.placement?.action === 'needs_review') {
    formError.value = String(persisted.placement.reason || '世界树位置需要人工确认，已保留待确认目标。')
    return
  }
  const state = await fetchDocLibraryState({ force: true })
  const document = buildPendingDocument(persistedItem)
  const commandResult = applyDocLibraryTreeCommand({
    documents: state.documents,
    manualTreeOrders: state.manualTreeOrders,
    treeNodes: state.treeNodes,
    treeOrders: state.treeOrders,
    treeDiffReport: state.treeDiffReport,
    relationSystemState: state.relationSystemState
  }, {
    type: 'upsert_document',
    document,
    parentFolderId: String(persistedItem.persistedTarget?.targetParentPath || '').trim() || undefined
  })
  await saveDocLibraryState(commandResult)
}

async function persistActive() {
  const sessionId = String(props.sessionId || '').trim()
  const entity = activeItem.value
  if (!sessionId || !entity || isPersisted.value) return
  saving.value = true
  formError.value = ''
  try {
    if (normalizeKind(entity.kind) === 'character') {
      const result = await persistSessionTemporaryEntity(sessionId, entity.id)
      if (result.item) replaceItem(result.item)
    } else {
      await persistWorldEntity(entity)
    }
  } catch (error) {
    formError.value = error instanceof Error ? error.message : '持久化临时数据失败'
  } finally {
    saving.value = false
  }
}

onMounted(loadItems)
watch(() => [props.open, props.sessionId], () => {
  void loadItems()
})
</script>

<style scoped>
.session-temp-panel {
  display: flex;
  min-height: 0;
  height: 100%;
  min-width: 0;
  flex-direction: column;
}

.session-temp-panel__toolbar,
.session-temp-editor__actions,
.session-temp-panel__toolbar-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.session-temp-panel__toolbar {
  padding: 10px 12px;
  border-bottom: 1px solid var(--morandi-border);
}

.session-temp-panel__toolbar strong {
  display: block;
  font-size: 0.95rem;
}

.session-temp-panel__toolbar span,
.session-temp-row__meta,
.session-temp-editor__source,
.session-temp-filter em {
  font-size: 0.74rem;
  color: var(--morandi-text-light);
  font-style: normal;
}

.session-temp-panel__body {
  display: grid;
  grid-template-columns: minmax(170px, 0.8fr) minmax(0, 1.35fr);
  min-height: 0;
  flex: 1;
}

.session-temp-panel__list {
  min-height: 0;
  overflow: auto;
  border-right: 1px solid var(--morandi-border);
}

.session-temp-panel__filters {
  display: grid;
  gap: 4px;
  padding: 8px;
  border-bottom: 1px solid var(--morandi-border);
}

.session-temp-filter,
.session-temp-row {
  width: 100%;
  border: 0;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.session-temp-filter {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 32px;
  padding: 6px 8px;
  border-radius: 6px;
}

.session-temp-filter.selected,
.session-temp-row--active {
  background: rgba(139, 122, 103, 0.12);
}

.session-temp-row {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 3px;
  padding: 9px 10px;
  border-bottom: 1px solid color-mix(in srgb, var(--morandi-border) 12%, transparent);
}

.session-temp-row__name {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.session-temp-editor {
  display: flex;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
  gap: 12px;
  padding: 14px 16px 16px;
  overflow: auto;
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--morandi-card) 68%, transparent), color-mix(in srgb, var(--morandi-card) 40%, transparent)),
    color-mix(in srgb, var(--morandi-card) 72%, transparent);
}

.session-temp-editor__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 10px;
  border-bottom: 1px solid color-mix(in srgb, var(--morandi-border) 14%, transparent);
}

.session-temp-editor__header strong {
  display: block;
  color: var(--morandi-text);
  font-size: 0.96rem;
  line-height: 1.35;
}

.session-temp-editor__header span {
  display: block;
  margin-top: 3px;
  color: var(--morandi-text-light);
  font-size: 0.76rem;
}

.session-temp-editor__header em {
  flex: 0 0 auto;
  border: 1px solid color-mix(in srgb, var(--morandi-border) 18%, transparent);
  border-radius: 999px;
  padding: 3px 8px;
  background: color-mix(in srgb, var(--morandi-card) 58%, transparent);
  color: var(--morandi-text-light);
  font-size: 0.72rem;
  font-style: normal;
}

.session-temp-editor__grid {
  display: grid;
  grid-template-columns: minmax(120px, 0.7fr) minmax(0, 1.3fr);
  gap: 10px;
}

.session-temp-field {
  display: grid;
  gap: 6px;
  font-size: 0.78rem;
  color: var(--morandi-text-light);
}

.session-temp-editor input,
.session-temp-editor select,
.session-temp-editor textarea {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid color-mix(in srgb, var(--morandi-border) 24%, transparent);
  border-radius: 7px;
  background: color-mix(in srgb, var(--morandi-card) 72%, transparent);
  color: var(--morandi-text);
  font: inherit;
  outline: none;
  transition: border-color 0.16s ease, background-color 0.16s ease, box-shadow 0.16s ease;
}

.session-temp-editor input,
.session-temp-editor select {
  height: 34px;
  padding: 0 10px;
}

.session-temp-editor textarea {
  padding: 9px 10px;
  line-height: 1.55;
}

.session-temp-editor input::placeholder,
.session-temp-editor textarea::placeholder {
  color: color-mix(in srgb, var(--morandi-text-light) 65%, transparent);
}

.session-temp-editor input:focus,
.session-temp-editor select:focus,
.session-temp-editor textarea:focus {
  border-color: rgba(135, 164, 151, 0.72);
  background: color-mix(in srgb, var(--morandi-card) 92%, transparent);
  box-shadow: 0 0 0 3px rgba(135, 164, 151, 0.14);
}

.session-temp-editor select:disabled {
  opacity: 0.72;
  cursor: default;
}

.session-temp-editor textarea {
  min-height: 190px;
  resize: vertical;
  font-family: inherit;
}

.session-temp-editor__source {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  border-top: 1px solid color-mix(in srgb, var(--morandi-border) 12%, transparent);
  padding-top: 8px;
}

.session-temp-editor__error,
.session-temp-panel__empty--error {
  color: #b85c5c;
}

.session-temp-editor__actions {
  margin-top: auto;
  padding-top: 4px;
}

.session-temp-panel__button {
  border: 1px solid var(--morandi-border);
  background: color-mix(in srgb, var(--morandi-card) 58%, transparent);
  color: var(--morandi-text);
  min-height: 32px;
  padding: 5px 11px;
  border-radius: 6px;
  cursor: pointer;
}

.session-temp-panel__button--primary {
  background: var(--morandi-primary);
  border-color: var(--morandi-primary);
  color: #fff;
}

.session-temp-panel__button--danger {
  color: #b85c5c;
  border-color: rgba(184, 92, 92, 0.45);
}

.session-temp-panel__button:disabled {
  opacity: 0.5;
  cursor: default;
}

.session-temp-panel__empty {
  padding: 16px;
  color: var(--morandi-text-light);
  font-size: 0.85rem;
}

.session-temp-panel__empty--compact {
  padding: 12px;
}

@media (max-width: 720px) {
  .session-temp-panel__body,
  .session-temp-editor__grid {
    grid-template-columns: 1fr;
  }

  .session-temp-panel__list {
    max-height: 240px;
    border-right: 0;
    border-bottom: 1px solid var(--morandi-border);
  }
}
</style>
