<template>
  <div class="prompt-library" :class="{ 'prompt-library--external-sidebar': props.externalSidebar }">
    <aside v-if="!props.externalSidebar" class="prompt-library__sidebar">
      <div class="prompt-library__sidebar-header">
        <div>
          <div class="prompt-library__eyebrow">Prompt Library</div>
          <div class="prompt-library__title">提示词</div>
        </div>
        <div class="prompt-library__sidebar-actions">
          <button
            type="button"
            class="prompt-library__secondary-btn prompt-library__sidebar-action-btn"
            :class="{ active: promptDragEnabled }"
            :title="promptDragEnabled ? '关闭拖拽排序' : '开启拖拽排序'"
            @click="togglePromptDragMode"
          >
            拖拽
          </button>
          <button
            type="button"
            class="prompt-library__secondary-btn prompt-library__sidebar-action-btn"
            :class="{ active: filterMode !== 'all' }"
            title="筛选提示词"
            @click="toggleFilterMenu($event)"
          >
            筛选
          </button>
          <SidebarFloatingMenu :open="filterMenuOpen" menu-class="prompt-library__filter-menu" :menu-style="filterMenuStyle" clamp-to-viewport>
            <button
              v-for="option in filterOptions"
              :key="option.value"
              type="button"
              class="prompt-library__filter-menu-item"
              :class="{ active: filterMode === option.value }"
              @click="selectFilterMode(option.value)"
            >
              {{ option.label }}
            </button>
          </SidebarFloatingMenu>
          <button type="button" class="prompt-library__icon-btn" title="新建提示词" @click="openCreateDialog()">＋</button>
        </div>
      </div>

      <div class="prompt-library__group-list">
        <section
          v-for="group in groupedRecords"
          :key="group.key"
          class="prompt-library__group"
        >
          <header class="prompt-library__group-header">
            <span>{{ group.label }}</span>
            <span>{{ group.items.length }}</span>
          </header>

          <button
            v-for="item in group.items"
            :key="item.id"
            type="button"
            class="prompt-library__item"
            :class="{ active: item.id === selectedId, muted: !item.enabled, dragging: draggedPromptId === item.id, 'drop-before': dropTargetId === item.id && dropPosition === 'before', 'drop-after': dropTargetId === item.id && dropPosition === 'after' }"
            :draggable="canDragRecord(item)"
            @dragstart="startPromptDrag(item, $event)"
            @dragover.prevent="previewPromptDrop(item, $event)"
            @drop.prevent="commitPromptDrop(item)"
            @dragend="clearPromptDrag"
            @click="selectRecord(item.id)"
          >
            <span class="prompt-library__item-title">{{ item.title || '未命名提示词' }}</span>
            <span class="prompt-library__item-meta">{{ getRecordMeta(item) }}</span>
          </button>
        </section>
      </div>
    </aside>

    <main class="prompt-library__main">
      <section v-if="activeRecord" class="prompt-library__editor">
        <div class="prompt-library__toolbar">
          <div class="prompt-library__toolbar-meta">
            <span class="prompt-library__badge">
              {{ isScenarioMountedPlaceholderRecord(activeRecord) ? '情境挂载占位' : isRequiredPromptRecord(activeRecord) ? '必装提示词' : '正式提示词记录' }}
            </span>
            <span class="prompt-library__updated">上次更新：{{ formatUpdatedAt(draft.updatedAt) }}</span>
          </div>
          <div class="prompt-library__toolbar-actions">
            <input ref="importInputRef" type="file" accept=".json,application/json" class="prompt-library__hidden-input" @change="handleImportChange">
            <button v-if="!isScenarioMountedPlaceholderRecord(activeRecord)" type="button" class="prompt-library__secondary-btn" @click="openVarsDialog">变量</button>
            <button type="button" class="prompt-library__secondary-btn" @click="exportPromptPresets">导出</button>
            <button type="button" class="prompt-library__secondary-btn" @click="openImportPicker">导入</button>
            <button type="button" class="prompt-library__secondary-btn" @click="resetPromptPresets">默认</button>
            <button v-if="!isScenarioMountedPlaceholderRecord(activeRecord)" type="button" class="prompt-library__secondary-btn" @click="duplicateActiveRecord">复制</button>
            <button
              v-if="!isScenarioMountedPlaceholderRecord(activeRecord)"
              type="button"
              class="prompt-library__secondary-btn prompt-library__secondary-btn--danger"
              @click="deleteActiveRecord"
            >
              删除
            </button>
            <button v-if="!isScenarioMountedPlaceholderRecord(activeRecord)" type="button" class="prompt-library__primary-btn" :disabled="!hasDraftChanges || isSaving" @click="saveActiveRecord">
              {{ isSaving ? '保存中...' : '保存' }}
            </button>
          </div>
        </div>

        <div class="prompt-library__form-grid">
          <label class="prompt-library__field prompt-library__field--wide">
            <span class="prompt-library__label">标题</span>
            <input v-model="draft.title" class="prompt-library__input" type="text" placeholder="例如：主聊天系统提示词" :disabled="isScenarioMountedPlaceholderRecord(activeRecord)">
          </label>

          <label class="prompt-library__field">
            <span class="prompt-library__label">分组</span>
            <select v-model="draft.group" class="prompt-library__select" :disabled="isScenarioMountedPlaceholderRecord(activeRecord)">
              <option v-for="option in groupOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
            </select>
          </label>

          <label class="prompt-library__field">
            <span class="prompt-library__label">启用状态</span>
            <select v-model="draft.enabledText" class="prompt-library__select" :disabled="isScenarioMountedPlaceholderRecord(activeRecord)">
              <option value="enabled">启用</option>
              <option value="disabled">停用</option>
            </select>
          </label>

          <label class="prompt-library__field">
            <span class="prompt-library__label">使用方式</span>
            <select v-model="draft.usageMode" class="prompt-library__select" :disabled="isScenarioMountedPlaceholderRecord(activeRecord)">
              <option v-for="option in usageModeOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
            </select>
          </label>
          <label class="prompt-library__field">
            <span class="prompt-library__label">是否必装</span>
            <select v-model="draft.isRequiredText" class="prompt-library__select" :disabled="isScenarioMountedPlaceholderRecord(activeRecord)">
              <option value="required">必装</option>
              <option value="optional">非必装</option>
            </select>
          </label>

          <label class="prompt-library__field">
            <span class="prompt-library__label">作用范围</span>
            <select v-model="draft.scope" class="prompt-library__select" :disabled="isScenarioMountedPlaceholderRecord(activeRecord)">
              <option v-for="option in scopeOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
            </select>
          </label>

          <label class="prompt-library__field">
            <span class="prompt-library__label">优先级</span>
            <input v-model.number="draft.priority" class="prompt-library__input" type="number" min="0" step="1" :disabled="isScenarioMountedPlaceholderRecord(activeRecord)">
          </label>

          <label class="prompt-library__field">
            <span class="prompt-library__label">场景</span>
            <select v-model="draft.scene" class="prompt-library__select" :disabled="isScenarioMountedPlaceholderRecord(activeRecord)">
              <option v-for="option in sceneOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
            </select>
          </label>

          <label class="prompt-library__field prompt-library__field--wide">
            <span class="prompt-library__label">简短说明</span>
            <input v-model="draft.summary" class="prompt-library__input" type="text" placeholder="给用户看的用途说明" :disabled="isScenarioMountedPlaceholderRecord(activeRecord)">
          </label>
        </div>

        <label class="prompt-library__field prompt-library__field--editor">
          <span class="prompt-library__label">正文</span>
          <textarea v-model="draft.content" class="prompt-library__textarea" spellcheck="false" placeholder="请输入提示词正文" :readonly="isScenarioMountedPlaceholderRecord(activeRecord)"></textarea>
        </label>
        <div v-if="isScenarioMountedPlaceholderRecord(activeRecord)" class="prompt-library__readonly-note">
          这是所有情境 skill 挂载提示词共用的占位；这里只能拖动改变拼装位置，正文在所属情境下编辑。
        </div>
      </section>

      <section v-else class="prompt-library__empty">
        <div class="prompt-library__empty-title">还没有提示词记录</div>
        <div class="prompt-library__empty-text">先新建一条提示词，我们就能把系统规则、召回提示词和旧预设慢慢收进正式区块里了。</div>
      </section>
    </main>

    <AppFormDialog
      :open="createDialog.visible"
      title="新建提示词"
      size="lg"
      @cancel="closeCreateDialog"
    >
      <div class="prompt-library__dialog-grid">
        <label class="prompt-library__field">
          <span class="prompt-library__label">标题</span>
          <input v-model="createDialog.title" class="prompt-library__input" type="text" placeholder="例如：群聊补充规则">
        </label>

        <label class="prompt-library__field">
          <span class="prompt-library__label">分组</span>
          <select v-model="createDialog.group" class="prompt-library__select">
            <option v-for="option in groupOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
          </select>
        </label>

        <label class="prompt-library__field">
          <span class="prompt-library__label">使用方式</span>
          <select v-model="createDialog.usageMode" class="prompt-library__select">
            <option v-for="option in usageModeOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
          </select>
        </label>

        <label class="prompt-library__field">
          <span class="prompt-library__label">作用范围</span>
          <select v-model="createDialog.scope" class="prompt-library__select">
            <option v-for="option in scopeOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
          </select>
        </label>
      </div>

      <template #actions>
        <button type="button" class="prompt-library__secondary-btn" @click="closeCreateDialog">取消</button>
        <button type="button" class="prompt-library__primary-btn" :disabled="!createDialog.title.trim()" @click="confirmCreateDialog">创建</button>
      </template>
    </AppFormDialog>

    <AppFormDialog
      :open="varsDialogOpen"
      title="可用变量"
      size="md"
      @cancel="closeVarsDialog"
    >
      <div class="prompt-library__vars-grid">
        <code v-for="item in variableNames" :key="item">{{ item }}</code>
      </div>

      <template #actions>
        <button type="button" class="prompt-library__primary-btn" @click="closeVarsDialog">关闭</button>
      </template>
    </AppFormDialog>

    <AppConfirmDialog
      :open="deleteConfirm.visible"
      title="删除提示词"
      :message="deleteConfirmMessage"
      confirm-text="删除"
      tone="danger"
      @cancel="closeDeleteConfirm"
      @confirm="confirmDeleteRecord"
    />

    <div v-if="noticeText" class="prompt-library__notice" role="status">{{ noticeText }}</div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import AppConfirmDialog from './common/AppConfirmDialog.vue'
import AppFormDialog from './common/AppFormDialog.vue'
import SidebarFloatingMenu from './common/SidebarFloatingMenu.vue'
import { useSidebarDragModeKit } from '../composables/useSidebarDragModeKit'
import { useSidebarFloatingMenuKit } from '../composables/useSidebarFloatingMenuKit'
import { useSettingStore } from '../stores/settingStore'
import { assignPromptPresetAssemblyOrder, sortPromptPresetsForAssembly } from '../app/promptPresetOrdering'
import type { PromptPreset } from '../types'
import { SCENARIO_MOUNTED_PROMPTS_PLACEHOLDER_PRESET_ID } from '../app/scenarioMountedPromptPlaceholder'

type PromptGroupKey = NonNullable<PromptPreset['promptGroup']>
type PromptUsageMode = NonNullable<PromptPreset['usageMode']>
type PromptScope = NonNullable<PromptPreset['scope']>
type PromptFilterMode = 'all' | 'required'
type PromptRecordKind = 'preset'

type PromptLibraryRecord = {
  id: string
  kind: PromptRecordKind
  title: string
  content: string
  group: PromptGroupKey
  enabled: boolean
  isRequired: boolean
  usageMode: PromptUsageMode
  scope: PromptScope
  scene: string
  priority: number
  orderIndex: number
  summary: string
  updatedAt: string
  scopeLabel: string
}
type PromptSidebarRow = {
  id: string
  group: PromptGroupKey
  groupLabel: string
  title: string
  meta: string
  enabled: boolean
  active: boolean
  recordKind: PromptRecordKind
}

const props = defineProps({
  externalSidebar: { type: Boolean, default: false }
})
const emit = defineEmits<{
  (e: 'sidebar-state-change'): void
}>()

const settingStore = useSettingStore()

const filterOptions: Array<{ value: PromptFilterMode; label: string }> = [
  { value: 'all', label: '全部提示词' },
  { value: 'required', label: '只看必装' }
]

const groupOptions: Array<{ value: PromptGroupKey; label: string }> = [
  { value: 'system', label: '系统提示词' },
  { value: 'recall', label: '召回提示词' },
  { value: 'scene', label: '场景提示词' },
  { value: 'preset_migration', label: '预设迁移区' }
]

const usageModeOptions: Array<{ value: PromptUsageMode; label: string }> = [
  { value: 'always', label: '始终参与' },
  { value: 'conditional', label: '按条件参与' },
  { value: 'manual', label: '手动参与' }
]

const sceneOptions = [
  { value: 'all', label: '全部' },
  { value: 'chat', label: '聊天' },
  { value: 'summary', label: '总结' },
  { value: 'eval', label: '评价' },
  { value: 'task', label: '任务' },
  { value: 'recall', label: '召回' }
]

const scopeOptions: Array<{ value: PromptScope; label: string }> = [
  { value: 'chat_reply', label: '聊天回复' },
  { value: 'candidate_collect', label: '候选采集' },
  { value: 'trajectory_merge', label: '轨迹整理' },
  { value: 'soul_update', label: '灵魂更新' },
  { value: 'compile_rewrite', label: '编译重写' },
  { value: 'recall_compress', label: '召回压缩' },
  { value: 'recall_judge', label: '召回判断' },
  { value: 'general', label: '通用' }
]

const scopeLabelMap: Record<PromptScope, string> = {
  chat_reply: '聊天回复',
  candidate_collect: '候选采集',
  trajectory_merge: '轨迹整理',
  soul_update: '灵魂更新',
  compile_rewrite: '编译重写',
  recall_compress: '召回压缩',
  recall_judge: '召回判断',
  general: '通用'
}

const isSaving = ref(false)
const selectedId = ref('')
const filterMode = ref<PromptFilterMode>('all')
const filterMenuOpen = ref(false)
const draggedPromptId = ref('')
const dropTargetId = ref('')
const dropPosition = ref<'before' | 'after'>('after')
const importInputRef = ref<HTMLInputElement | null>(null)
const varsDialogOpen = ref(false)
const noticeText = ref('')
let noticeTimer: ReturnType<typeof setTimeout> | null = null
const promptDragModeKit = useSidebarDragModeKit<'prompt'>({
  persistKey: 'langhuan_prompt_library_drag_mode',
  defaultDragEnabled: false,
  defaultSinkContext: ''
})
const promptDragEnabled = promptDragModeKit.dragEnabled
const filterMenuKit = useSidebarFloatingMenuKit({
  menuWidth: 148,
  estimatedHeight: 96,
  placement: 'below',
  horizontalPlacement: 'align-right'
})
const filterMenuStyle = filterMenuKit.floatingMenuStyle

const createDialog = ref<{
  visible: boolean
  title: string
  group: PromptGroupKey
  usageMode: PromptUsageMode
  scope: PromptScope
}>({
  visible: false,
  title: '',
  group: 'system',
  usageMode: 'always',
  scope: 'general'
})
const deleteConfirm = ref<{
  visible: boolean
  recordId: string
  title: string
}>({
  visible: false,
  recordId: '',
  title: ''
})

const draft = ref({
  title: '',
  content: '',
  group: 'system' as PromptGroupKey,
  enabledText: 'enabled',
  isRequiredText: 'required',
  usageMode: 'always' as PromptUsageMode,
  scope: 'general' as PromptScope,
  scene: 'all',
  priority: 0,
  summary: '',
  updatedAt: ''
})

const variableNames = [
  '{role_name}',
  '{role_desc}',
  '{role_style}',
  '{schedule}',
  '{yearly_schedule}',
  '{current_activities}',
  '{relationships}',
  '{user_name}',
  '{user_desc}',
  '{time}',
  '{location}',
  '{weather}',
  '{points}',
  '{money}',
  '{tickets_brief}',
  '{summaries}',
  '{chat_history}',
  '{character_brain_recall}',
  '{current_user_name}',
  '{current_user_input}',
  '{task_system_context}',
  '{event_stack_recent_context}'
]

function normalizeRequiredValue(value: unknown): boolean | null {
  if (value === true || value === 1 || value === '1' || value === 'true') return true
  if (value === false || value === 0 || value === '0' || value === 'false') return false
  return null
}

function inferPromptRecordRequired(preset: Partial<PromptPreset>): boolean {
  const explicit = normalizeRequiredValue(preset.isRequired)
  if (explicit !== null) return explicit
  if (preset.promptGroup === 'recall') return false
  const content = String(preset.content || '')
  if (content.includes('{task_system_context}') || content.includes('{event_stack_recent_context}')) return false
  return (preset.usageMode || 'always') === 'always'
}

function isRequiredPromptRecord(record: PromptLibraryRecord): boolean {
  if (!record.enabled) return false
  if (record.group === 'recall') return false
  if (!record.isRequired) return false
  return !String(record.content || '').includes('{task_system_context}')
    && !String(record.content || '').includes('{event_stack_recent_context}')
}

function matchesFilter(record: PromptLibraryRecord): boolean {
  if (filterMode.value === 'required') return isRequiredPromptRecord(record)
  return true
}

function isScenarioMountedPlaceholderRecord(record: PromptLibraryRecord | null | undefined): boolean {
  return String(record?.id || '') === SCENARIO_MOUNTED_PROMPTS_PLACEHOLDER_PRESET_ID
}

function getRecordMeta(record: PromptLibraryRecord): string {
  if (isScenarioMountedPlaceholderRecord(record)) {
    return ['占位', '情境挂载', record.enabled ? '启用' : '停用'].join(' · ')
  }
  const parts = [
    isRequiredPromptRecord(record) ? '必装' : record.usageMode === 'conditional' ? '条件' : record.usageMode === 'manual' ? '手动' : '参与',
    record.scopeLabel,
    record.scene === 'all' ? '全部' : record.scene
  ]
  return parts.filter(Boolean).join(' · ')
}

function normalizeBooleanFlag(value: unknown, fallback = true): boolean {
  if (value === undefined || value === null || value === '') return fallback
  if (value === true || value === 1) return true
  if (value === false || value === 0) return false
  const text = String(value).trim().toLowerCase()
  if (text === 'true' || text === '1') return true
  if (text === 'false' || text === '0') return false
  return fallback
}

const promptRecords = computed<PromptLibraryRecord[]>(() => {
  const presets = Array.isArray(settingStore.promptPresets) ? settingStore.promptPresets : []
  const mappedPresets = sortPromptPresetsForAssembly(presets).map((preset, index) => {
    const group = (preset.promptGroup || 'system') as PromptGroupKey
    const scope = (preset.scope || 'general') as PromptScope
    return {
      id: String(preset.id || ''),
      kind: 'preset' as const,
      title: String(preset.name || ''),
      content: String(preset.content || ''),
      group,
      enabled: normalizeBooleanFlag(preset.enabled, true),
      isRequired: inferPromptRecordRequired(preset),
      usageMode: (preset.usageMode || 'always') as PromptUsageMode,
      scope,
      scene: String(preset.scene || 'all'),
      priority: Number.isFinite(Number(preset.priority)) ? Number(preset.priority) : Number(preset.orderIndex || 0),
      orderIndex: Number.isFinite(Number(preset.orderIndex)) ? Number(preset.orderIndex) : index,
      summary: String(preset.summary || ''),
      updatedAt: String(preset.updatedAt || new Date().toISOString()),
      scopeLabel: scopeLabelMap[scope]
    }
  })

  return mappedPresets
})

const visiblePromptRecords = computed(() => promptRecords.value.filter(matchesFilter))

const groupedRecords = computed(() => {
  const items = sortPromptPresetsForAssembly(visiblePromptRecords.value)
  return items.length
    ? [{
        key: 'assembly-order' as PromptGroupKey,
        label: '提示词拼装顺序',
        items
      }]
    : []
})
const sidebarRows = computed<PromptSidebarRow[]>(() => (
  groupedRecords.value.flatMap((group) => group.items.map((item) => ({
    id: item.id,
    group: group.key as PromptGroupKey,
    groupLabel: group.label,
    title: item.title || '未命名提示词',
    meta: getRecordMeta(item),
    enabled: item.enabled,
    active: item.id === selectedId.value,
    recordKind: item.kind
  })))
))

const activeRecord = computed(() => promptRecords.value.find((item) => item.id === selectedId.value) || null)

const activeRecordSnapshot = computed(() => {
  if (!activeRecord.value) return ''
  return JSON.stringify({
    title: activeRecord.value.title,
    content: activeRecord.value.content,
    group: activeRecord.value.group,
    enabledText: activeRecord.value.enabled ? 'enabled' : 'disabled',
    isRequiredText: activeRecord.value.isRequired ? 'required' : 'optional',
    usageMode: activeRecord.value.usageMode,
    scope: activeRecord.value.scope,
    scene: activeRecord.value.scene,
    priority: activeRecord.value.priority,
    summary: activeRecord.value.summary,
    updatedAt: activeRecord.value.updatedAt
  })
})

const currentDraftSnapshot = computed(() => JSON.stringify({
  title: draft.value.title,
  content: draft.value.content,
  group: draft.value.group,
  enabledText: draft.value.enabledText,
  isRequiredText: draft.value.isRequiredText,
  usageMode: draft.value.usageMode,
  scope: draft.value.scope,
  scene: draft.value.scene,
  priority: draft.value.priority,
  summary: draft.value.summary,
  updatedAt: draft.value.updatedAt
}))

const hasDraftChanges = computed(() => activeRecordSnapshot.value !== currentDraftSnapshot.value)
const deleteConfirmMessage = computed(() => {
  const title = deleteConfirm.value.title || '未命名提示词'
  return `确定删除“${title}”吗？删除后无法恢复。`
})

watch(
  promptRecords,
  (records) => {
    if (selectedId.value && records.some((item) => item.id === selectedId.value)) return
    selectedId.value = records[0]?.id || ''
  },
  { immediate: true }
)

watch(
  [sidebarRows, selectedId],
  () => emit('sidebar-state-change'),
  { immediate: true, deep: true }
)

onMounted(async () => {
  promptDragModeKit.hydrate()
  try {
    await settingStore.ensureBuiltinPromptPresets()
  } catch (error) {
    showNotice(error instanceof Error ? `同步默认占位失败：${error.message}` : '同步默认占位失败')
  }
  emit('sidebar-state-change')
})

watch(
  activeRecord,
  (record) => {
    if (!record) return
    draft.value = {
      title: record.title,
      content: record.content,
      group: record.group,
      enabledText: record.enabled ? 'enabled' : 'disabled',
      isRequiredText: record.isRequired ? 'required' : 'optional',
      usageMode: record.usageMode,
      scope: record.scope,
      scene: record.scene,
      priority: record.priority,
      summary: record.summary,
      updatedAt: record.updatedAt
    }
  },
  { immediate: true }
)

function formatUpdatedAt(value: string): string {
  const parsed = Date.parse(String(value || ''))
  if (!Number.isFinite(parsed)) return '未记录'
  return new Date(parsed).toLocaleString('zh-CN', { hour12: false })
}

function openCreateDialog(group?: PromptGroupKey) {
  createDialog.value = {
    visible: true,
    title: '',
    group: group || activeRecord.value?.group || 'system',
    usageMode: 'always',
    scope: 'general'
  }
}

function selectRecord(recordId: string) {
  const safeId = String(recordId || '').trim()
  if (!safeId || !promptRecords.value.some((item) => item.id === safeId)) return
  selectedId.value = safeId
}

function getSidebarState() {
  return {
    rows: sidebarRows.value,
    selectedId: selectedId.value,
    totalCount: promptRecords.value.length,
    dragEnabled: promptDragEnabled.value,
    filterMode: filterMode.value
  }
}

function closeCreateDialog() {
  createDialog.value = {
    visible: false,
    title: '',
    group: 'system',
    usageMode: 'always',
    scope: 'general'
  }
}

async function confirmCreateDialog() {
  const title = createDialog.value.title.trim()
  if (!title) return
  const payload: PromptPreset = {
    id: '',
    name: title,
    content: '',
    scene: 'all',
    frequency: 'always',
    enabled: true,
    orderIndex: Array.isArray(settingStore.promptPresets) ? settingStore.promptPresets.length : 0,
    role: 'system',
    promptGroup: createDialog.value.group,
    usageMode: createDialog.value.usageMode,
    isRequired: createDialog.value.usageMode === 'always' && createDialog.value.group !== 'recall',
    scope: createDialog.value.scope,
    priority: Array.isArray(settingStore.promptPresets) ? settingStore.promptPresets.length : 0,
    summary: '',
    updatedAt: new Date().toISOString()
  }
  await settingStore.addPromptPreset(payload)
  const latest = [...settingStore.promptPresets].find((item) => item.name === title && item.updatedAt === payload.updatedAt)
    || settingStore.promptPresets[settingStore.promptPresets.length - 1]
  selectedId.value = String(latest?.id || '')
  closeCreateDialog()
}

async function saveActiveRecord() {
  if (!activeRecord.value || isSaving.value) return
  isSaving.value = true
  const updatedAt = new Date().toISOString()
  try {
    await settingStore.updatePromptPreset(activeRecord.value.id, {
      name: draft.value.title.trim() || activeRecord.value.title,
      content: draft.value.content,
      promptGroup: draft.value.group,
      usageMode: draft.value.usageMode,
      isRequired: draft.value.isRequiredText === 'required',
      scope: draft.value.scope,
      scene: draft.value.scene,
      priority: Number.isFinite(Number(draft.value.priority)) ? Number(draft.value.priority) : 0,
      summary: draft.value.summary.trim(),
      enabled: draft.value.enabledText === 'enabled',
      updatedAt
    })
    draft.value.updatedAt = updatedAt
    showNotice('已保存')
  } catch (error) {
    showNotice(`保存失败：${error instanceof Error ? error.message : String(error || '未知错误')}`)
  } finally {
    isSaving.value = false
  }
}

async function duplicateActiveRecord() {
  if (!activeRecord.value) return
  const updatedAt = new Date().toISOString()
  await settingStore.addPromptPreset({
    id: '',
    name: `${draft.value.title || activeRecord.value.title || '提示词'} 副本`,
    content: draft.value.content,
    scene: draft.value.scene || 'all',
    frequency: 'always',
    enabled: draft.value.enabledText === 'enabled',
    orderIndex: Array.isArray(settingStore.promptPresets) ? settingStore.promptPresets.length : 0,
    role: 'system',
    promptGroup: draft.value.group,
    usageMode: draft.value.usageMode,
    isRequired: draft.value.isRequiredText === 'required',
    scope: draft.value.scope,
    priority: Number.isFinite(Number(draft.value.priority)) ? Number(draft.value.priority) : 0,
    summary: draft.value.summary,
    updatedAt
  })
  selectedId.value = String(settingStore.promptPresets[settingStore.promptPresets.length - 1]?.id || selectedId.value)
}

async function deleteActiveRecord() {
  if (!activeRecord.value) return
  deleteConfirm.value = {
    visible: true,
    recordId: activeRecord.value.id,
    title: activeRecord.value.title || '未命名提示词'
  }
}

function closeDeleteConfirm() {
  deleteConfirm.value = { visible: false, recordId: '', title: '' }
}

async function confirmDeleteRecord() {
  const currentId = deleteConfirm.value.recordId
  if (!currentId) {
    closeDeleteConfirm()
    return
  }
  closeDeleteConfirm()
  await settingStore.deletePromptPreset(currentId)
  const nextRecord = promptRecords.value.find((item) => item.id !== currentId) || null
  selectedId.value = nextRecord?.id || ''
}

function togglePromptDragMode() {
  promptDragModeKit.toggleDragMode()
  filterMenuOpen.value = false
  filterMenuKit.clearFloatingMenuPosition()
  clearPromptDrag()
  emit('sidebar-state-change')
}

function toggleFilterMenu(event?: Event) {
  if (filterMenuOpen.value) {
    filterMenuOpen.value = false
    filterMenuKit.clearFloatingMenuPosition()
    return
  }
  filterMenuKit.updateFloatingMenuPosition(event)
  filterMenuOpen.value = true
}

function selectFilterMode(nextMode: PromptFilterMode) {
  filterMode.value = nextMode
  filterMenuOpen.value = false
  filterMenuKit.clearFloatingMenuPosition()
  clearPromptDrag()
  emit('sidebar-state-change')
}

function canDragRecord(record: PromptLibraryRecord): boolean {
  void record
  return promptDragEnabled.value
}

function startPromptDrag(record: PromptLibraryRecord, event: DragEvent) {
  if (!canDragRecord(record)) return
  draggedPromptId.value = record.id
  event.dataTransfer?.setData('text/plain', record.id)
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
}

function previewPromptDrop(record: PromptLibraryRecord, event: DragEvent) {
  if (!draggedPromptId.value || record.id === draggedPromptId.value) return
  const target = event.currentTarget as HTMLElement | null
  const rect = target?.getBoundingClientRect()
  dropTargetId.value = record.id
  dropPosition.value = rect && event.clientY < rect.top + rect.height / 2 ? 'before' : 'after'
}

async function commitPromptDrop(record: PromptLibraryRecord) {
  const sourceId = draggedPromptId.value
  const targetId = record.id
  const position = dropPosition.value
  clearPromptDrag()
  if (!sourceId || !targetId || sourceId === targetId) return
  await reorderPromptPresets(sourceId, targetId, position)
}

function clearPromptDrag() {
  draggedPromptId.value = ''
  dropTargetId.value = ''
  dropPosition.value = 'after'
}

async function reorderPromptPresets(sourceId: string, targetId: string, position: 'before' | 'after') {
  const source = sortPromptPresetsForAssembly(Array.isArray(settingStore.promptPresets) ? settingStore.promptPresets : [])
  const sourceIndex = source.findIndex((item) => item.id === sourceId)
  const targetIndex = source.findIndex((item) => item.id === targetId)
  if (sourceIndex < 0 || targetIndex < 0) return
  const [moving] = source.splice(sourceIndex, 1)
  const nextTargetIndex = source.findIndex((item) => item.id === targetId)
  if (nextTargetIndex < 0 || !moving) return
  source.splice(position === 'after' ? nextTargetIndex + 1 : nextTargetIndex, 0, moving)
  settingStore.promptPresets = assignPromptPresetAssemblyOrder(source).map((item, index) => ({
    ...item,
    priority: index
  }))
  await settingStore.savePromptPresetOrder()
  emit('sidebar-state-change')
}

function openImportPicker() {
  importInputRef.value?.click()
}

async function handleImportChange(event: Event) {
  const input = event.target as HTMLInputElement | null
  const file = input?.files?.[0]
  if (!file) return
  try {
    const count = await settingStore.importPromptPresetsFromFile(file)
    showNotice(`已导入 ${count} 条提示词`)
  } catch (error) {
    showNotice(`导入失败：${error instanceof Error ? error.message : String(error || '未知错误')}`)
  } finally {
    if (input) input.value = ''
  }
}

function exportPromptPresets() {
  settingStore.exportPromptPresets()
}

async function resetPromptPresets() {
  if (isSaving.value) return
  isSaving.value = true
  try {
    await settingStore.resetPromptPresets()
    showNotice('已恢复默认提示词')
  } catch (error) {
    showNotice(`恢复失败：${error instanceof Error ? error.message : String(error || '未知错误')}`)
  } finally {
    isSaving.value = false
  }
}

function openVarsDialog() {
  varsDialogOpen.value = true
}

function closeVarsDialog() {
  varsDialogOpen.value = false
}

function showNotice(message: string) {
  noticeText.value = message
  if (noticeTimer) clearTimeout(noticeTimer)
  noticeTimer = setTimeout(() => {
    noticeText.value = ''
    noticeTimer = null
  }, 2200)
}

defineExpose({
  getSidebarState,
  selectPromptFromParent: selectRecord,
  openCreateDialogFromParent: openCreateDialog,
  togglePromptDragModeFromParent: togglePromptDragMode,
  setPromptFilterModeFromParent: selectFilterMode,
  reorderPromptFromParent: reorderPromptPresets
})
</script>

<style scoped>
.prompt-library {
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr);
  width: 100%;
  min-height: 100%;
  background: var(--langhuan-paper-bg, var(--morandi-bg, #f7f3ea));
  border: none;
  border-radius: 0;
  overflow: hidden;
  color: var(--morandi-text, #4f463f);
}

.prompt-library--external-sidebar {
  grid-template-columns: minmax(0, 1fr);
}

.prompt-library__sidebar {
  border-right: 1px solid color-mix(in srgb, var(--morandi-border, #d6cec3) 74%, transparent);
  background: transparent;
  padding: 16px;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 14px;
  min-height: 0;
}

.prompt-library__sidebar-header,
.prompt-library__toolbar {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
}

.prompt-library__sidebar-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 0 0 auto;
}

.prompt-library__eyebrow {
  font-size: 11px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--morandi-text-light, #7b746b);
}

.prompt-library__title,
.prompt-library__empty-title {
  font-size: 20px;
  font-weight: 700;
  color: var(--morandi-text, #4f463f);
}

.prompt-library__group-list,
.prompt-library__main,
.prompt-library__editor {
  display: grid;
  gap: 12px;
  min-height: 0;
}

.prompt-library__group-list {
  align-content: start;
  overflow: auto;
  scrollbar-width: thin;
  scrollbar-color: color-mix(in srgb, var(--morandi-text-light, #7b746b) 26%, transparent) transparent;
}

.prompt-library__group-list::-webkit-scrollbar,
.prompt-library__textarea::-webkit-scrollbar {
  width: 4px;
  height: 4px;
}

.prompt-library__group-list::-webkit-scrollbar-track,
.prompt-library__textarea::-webkit-scrollbar-track {
  background: transparent;
}

.prompt-library__group-list::-webkit-scrollbar-thumb,
.prompt-library__textarea::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: color-mix(in srgb, var(--morandi-text-light, #7b746b) 24%, transparent);
}

.prompt-library__group-list:hover::-webkit-scrollbar-thumb,
.prompt-library__textarea:hover::-webkit-scrollbar-thumb {
  background: color-mix(in srgb, var(--morandi-text-light, #7b746b) 42%, transparent);
}

.prompt-library__group {
  display: grid;
  gap: 8px;
}

.prompt-library__group-header {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: var(--morandi-text-light, #7b746b);
  font-weight: 600;
}

.prompt-library__icon-btn {
  border: 0;
  background: transparent;
  color: var(--morandi-text-light, #7b746b);
  border-radius: 6px;
}

.prompt-library__icon-btn {
  width: 28px;
  height: 28px;
  font-size: 18px;
}

.prompt-library__item {
  border: 1px solid transparent;
  background: transparent;
  border-radius: 8px;
  padding: 10px 12px;
  display: grid;
  gap: 4px;
  text-align: left;
  color: var(--morandi-text, #4f463f);
}

.prompt-library__item.active {
  border-color: transparent;
  background: color-mix(in srgb, #8faa98 10%, transparent);
  box-shadow: none;
}

.prompt-library__item.muted {
  opacity: 0.68;
}

.prompt-library__item.dragging {
  opacity: 0.48;
}

.prompt-library__item.drop-before,
.prompt-library__item.drop-after {
  position: relative;
}

.prompt-library__item.drop-before::before,
.prompt-library__item.drop-after::after {
  content: '';
  position: absolute;
  left: 10px;
  right: 10px;
  height: 2px;
  border-radius: 999px;
  background: #829987;
}

.prompt-library__item.drop-before::before {
  top: -5px;
}

.prompt-library__item.drop-after::after {
  bottom: -5px;
}

.prompt-library__item-title {
  font-size: 14px;
  font-weight: 600;
}

.prompt-library__item-meta,
.prompt-library__updated,
.prompt-library__empty-text {
  font-size: 12px;
  color: var(--morandi-text-light, #7b746b);
}

.prompt-library__main {
  padding: 0;
  overflow: hidden;
}

.prompt-library__editor,
.prompt-library__empty {
  background: transparent;
  border: none;
  border-radius: 0;
  padding: 18px 22px;
  grid-template-rows: auto auto minmax(0, 1fr);
  min-height: 0;
  overflow: hidden;
}

.prompt-library__toolbar-meta,
.prompt-library__toolbar-actions,
.prompt-library__dialog-grid {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}

.prompt-library__form-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.prompt-library__field {
  display: grid;
  gap: 6px;
}

.prompt-library__field--wide,
.prompt-library__field--editor {
  grid-column: 1 / -1;
}

.prompt-library__field--editor {
  min-height: 0;
}

.prompt-library__label {
  font-size: 12px;
  color: var(--morandi-text-light, #7b746b);
  font-weight: 600;
}

.prompt-library__input,
.prompt-library__select,
.prompt-library__textarea {
  width: 100%;
  border: 1px solid color-mix(in srgb, var(--morandi-border, #d6cec3) 80%, transparent);
  border-radius: 10px;
  background: color-mix(in srgb, var(--morandi-bg, #f7f3ea) 92%, #ffffff 8%);
  color: var(--morandi-text, #4f463f);
  padding: 10px 12px;
}

.prompt-library__item--mounted {
  padding-left: 18px;
}

.prompt-library__item--mounted .prompt-library__item-title {
  color: var(--morandi-text-light, #7b7067);
}

.prompt-library__input:disabled,
.prompt-library__select:disabled {
  color: var(--morandi-text-light, #7b7067);
  background: color-mix(in srgb, var(--morandi-card, #fff) 62%, transparent);
  cursor: default;
}

.prompt-library__textarea[readonly] {
  color: var(--morandi-text-light, #7b7067);
  background: color-mix(in srgb, var(--morandi-card, #fff) 70%, transparent);
}

.prompt-library__readonly-note {
  margin-top: 8px;
  font-size: 0.76rem;
  color: var(--morandi-text-light, #7b7067);
}

.prompt-library__textarea {
  min-height: 0;
  height: 100%;
  resize: vertical;
  line-height: 1.65;
  font-family: "Consolas", "Courier New", monospace;
}

.prompt-library__badge {
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  border-radius: 999px;
  background: color-mix(in srgb, #8faa98 14%, transparent);
  color: #556b59;
  font-size: 12px;
  font-weight: 600;
}

.prompt-library__primary-btn,
.prompt-library__secondary-btn {
  border: 0;
  border-radius: 8px;
  padding: 8px 12px;
  font-size: 13px;
  font-weight: 600;
}

.prompt-library__primary-btn {
  background: color-mix(in srgb, #829987 78%, #2f8552 22%);
  color: #fff;
}

.prompt-library__secondary-btn {
  background: color-mix(in srgb, var(--morandi-border, #d6cec3) 48%, transparent);
  color: var(--morandi-text, #4f463f);
}

.prompt-library__sidebar-action-btn {
  padding: 6px 8px;
  font-size: 12px;
}

.prompt-library__secondary-btn.active {
  background: color-mix(in srgb, #8faa98 22%, transparent);
  color: #526d58;
}

.prompt-library__secondary-btn--danger {
  background: #f8ddd7;
  color: #9d4338;
}

.prompt-library__filter-menu {
  overflow: hidden;
  border: 1px solid var(--langhuan-menu-border, color-mix(in srgb, var(--morandi-border, #d6cec3) 62%, transparent));
  border-radius: var(--langhuan-menu-radius, 0);
  background: color-mix(in srgb, var(--morandi-bg, #f7f3ea) 96%, #fff 4%);
  box-shadow: var(--langhuan-menu-shadow, 0 3px 10px rgba(56, 46, 38, 0.08));
}

.prompt-library__filter-menu-item {
  width: 100%;
  border: 0;
  background: transparent;
  color: var(--morandi-text, #4f463f);
  padding: 10px 12px;
  text-align: left;
  font-size: 13px;
  font-weight: 600;
}

.prompt-library__filter-menu-item:hover,
.prompt-library__filter-menu-item.active {
  background: color-mix(in srgb, #8faa98 16%, transparent);
  color: #526d58;
}

.prompt-library__hidden-input {
  display: none;
}

.prompt-library__vars-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.prompt-library__vars-grid code {
  padding: 6px 8px;
  border-bottom: 1px solid color-mix(in srgb, var(--morandi-border, #d6cec3) 70%, transparent);
  color: var(--morandi-text, #4f463f);
}

.prompt-library__notice {
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

@media (max-width: 960px) {
  .prompt-library {
    grid-template-columns: 1fr;
  }

  .prompt-library__sidebar {
    border-right: 0;
    border-bottom: 1px solid rgba(120, 102, 84, 0.12);
  }

  .prompt-library__form-grid {
    grid-template-columns: 1fr;
  }
}
</style>
