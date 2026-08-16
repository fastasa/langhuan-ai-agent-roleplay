<template>
  <section class="mobile-doc-workspace" :aria-label="$t('mobile.docWs.aria')">
    <!-- 文档库首页：世界树 -->
    <template v-if="pane === 'tree'">
      <MobileTopBar v-if="!promptDeep" :title="$t('sidebar.navDocs')" />

      <div v-if="!promptDeep" class="mobile-doc-tabs" role="tablist" :aria-label="$t('mobile.docWs.tabsAria')">
        <button
          v-for="item in docTabs"
          :key="item.id"
          type="button"
          class="mobile-doc-tab"
          :class="{ 'mobile-doc-tab--active': activeDocTab === item.id }"
          role="tab"
          :aria-selected="activeDocTab === item.id"
          @click="activeDocTab = item.id"
        >
          {{ item.label }}
          <span v-if="activeDocTab === item.id" class="mobile-doc-tab__bar" aria-hidden="true" />
        </button>
      </div>

      <label v-if="!promptDeep" class="mobile-doc-search">
        <MobileLineIcon name="search" :size="16" :stroke-width="1.9" />
        <input v-model="searchText" type="search" :placeholder="activeDocTab === 'prompts' ? $t('mobile.docWs.searchPrompts') : $t('mobile.docWs.searchDocs')">
      </label>

      <div v-if="activeDocTab === 'world'" class="mobile-doc-tree lhm-scroll">
        <MobileTreeToolbar
          :aria-label="$t('mobile.docWs.treeToolbarAria')"
          :can-create="false"
          :all-expanded="allOpen === true"
          @action="handleTreeAction"
        />
        <div v-if="loading" class="mobile-doc-empty">{{ $t('mobile.docWs.loading') }}</div>
        <div v-else-if="loadError" class="mobile-doc-empty">{{ loadError }}</div>
        <MobileSoneTree
          v-else-if="soneData.length"
          :key="treeKey"
          :data="soneData"
          :force-all="effectiveForceAll"
          :selection-mode="unitSelectionMode"
          @leaf="onTreeLeaf"
          @long-press="enterUnitSelection"
          @toggle-select="toggleUnitSelection"
        />
        <div v-else class="mobile-doc-empty">{{ $t('mobile.docWs.noUnits') }}</div>
      </div>

      <!-- 提示词库：复用桌面 PromptLibraryPanel 真值，列表/编辑两态窄屏组织 -->
      <MobilePromptLibrary
        v-else-if="activeDocTab === 'prompts'"
        :search-text="searchText"
        @depth-change="promptDeep = $event"
      />

      <div v-else class="mobile-doc-placeholder">
        <MobileLineIcon name="file-text" :size="30" :stroke-width="1.6" class="mobile-doc-placeholder__icon" />
        <div>{{ $t('mobile.docWs.viewPending', { label: activeDocTabLabel }) }}</div>
      </div>

    </template>

    <!-- 文档阅读 / 编辑 / 关系视图 -->
    <template v-else>
      <div class="mobile-doc-head">
        <button type="button" class="mobile-doc-head__back" :aria-label="$t('common.back')" @click="pane = 'tree'">
          <MobileLineIcon name="chevron-left" :size="24" :stroke-width="1.8" />
        </button>
        <div class="mobile-doc-head__title" @click="pathOpen = true">
          <div class="mobile-doc-head__crumb">
            <span>{{ unitBreadcrumb }}</span>
            <MobileLineIcon name="chevron-down" :size="12" :stroke-width="2" />
          </div>
          <div class="mobile-doc-head__name">{{ selectedUnitTitle }}</div>
        </div>
        <span class="mobile-chip" :class="`mobile-chip--${selectedUnitStatus === 'pending' ? 'warn' : 'ok'}`">
          {{ selectedUnitStatus === 'pending' ? $t('mobile.docWs.statusPending') : $t('mobile.docWs.statusNormal') }}
        </span>
      </div>

      <div class="mobile-doc-reader lhm-scroll">
        <section v-if="unitMode === 'read'" class="mobile-doc-reader__read">
          <MobileRoleplayText class="mobile-doc-reader__body" :text="selectedUnitBody" />
        </section>

        <section v-else-if="unitMode === 'relation'" class="mobile-doc-reader__relations">
          <div class="mobile-relation-graph">
            <UnitRelationBrainView :source="relationSource" @open-unit="onGraphOpenUnit" />
          </div>
        </section>

        <section v-else class="mobile-doc-reader__edit">
          <MobileMarkdownEditor :model-value="editableDocBody" :saving="savingDoc" @save="onSaveDoc" />
        </section>
      </div>

      <MobileGlassNav :items="unitNav" :active-item="unitMode" @select="selectUnitMode" />

      <MobileSheet :open="pathOpen" :title="$t('mobile.docWs.fullPath')" @close="pathOpen = false">
        <MobileSoneTree :data="pathNodes" @leaf="pathOpen = false" />
      </MobileSheet>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch, watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'
import { buildDocLibraryUnitView } from '../../app/unitViewAdapters'
import { buildDocLibraryWorldClusterRelationProjection } from '../../app/docLibraryRelationSourceAdapter'
import { createUnitRelationSourceAdapter } from '../../app/unitRelationSourceAdapter'
import { fetchDocLibraryState, saveDocLibraryState } from '../../repositories/docBrainRepository'
import UnitRelationBrainView from '../app/UnitRelationBrainView.vue'
import MobileMarkdownEditor from './MobileMarkdownEditor.vue'
import MobilePromptLibrary from './MobilePromptLibrary.vue'
import type { DocLibraryStateSnapshot } from '../../types/docBrain'
import type { RelationViewRecord, UnitView } from '../../types/unitView'
import MobileGlassNav from './MobileGlassNav.vue'
import MobileLineIcon from './MobileLineIcon.vue'
import MobileRoleplayText from './MobileRoleplayText.vue'
import MobileSheet from './MobileSheet.vue'
import MobileSoneTree from './MobileSoneTree.vue'
import MobileTopBar from './MobileTopBar.vue'
import MobileTreeToolbar from './MobileTreeToolbar.vue'
import type { MobileGlassNavItem, MobileSelectionAction, MobileSelectionDescriptor, MobileSoneNode, MobileTreeToolbarAction, MobileWorkspaceShellProps } from './mobileWorkspaceTypes'

type DocPane = 'tree' | 'unit'
type DocTab = 'world' | 'relation' | 'prompts'
type UnitMode = 'read' | 'edit' | 'relation'

defineProps<MobileWorkspaceShellProps>()
const emit = defineEmits<{
  depthChange: [isDeep: boolean]
  selection: [descriptor: MobileSelectionDescriptor]
}>()

const { t } = useI18n()

// 模块级 const 里不能调 t()：改为「id/icon + labelKey 定义 + computed 里 t() 填充」
const DOC_TAB_DEFS: Array<{ id: DocTab; labelKey: string }> = [
  { id: 'world', labelKey: 'mobile.docWs.tabWorld' },
  { id: 'relation', labelKey: 'mobile.docWs.relation' },
  { id: 'prompts', labelKey: 'docLibrary.topbar.promptTitle' }
]
const docTabs = computed<Array<{ id: DocTab; label: string }>>(() =>
  DOC_TAB_DEFS.map((def) => ({ id: def.id, label: t(def.labelKey) }))
)
const UNIT_NAV_DEFS: Array<{ id: UnitMode; labelKey: string; icon: MobileGlassNavItem['icon'] }> = [
  { id: 'read', labelKey: 'mobile.docWs.navRead', icon: 'book-open' },
  { id: 'edit', labelKey: 'common.edit', icon: 'square-pen' },
  { id: 'relation', labelKey: 'docLibrary.relation.viewLabel', icon: 'git-branch' }
]
const unitNav = computed<MobileGlassNavItem[]>(() =>
  UNIT_NAV_DEFS.map((def) => ({ id: def.id, label: t(def.labelKey), icon: def.icon }))
)

const pane = ref<DocPane>('tree')
const activeDocTab = ref<DocTab>('world')
// 提示词库进入编辑态时隐藏顶栏/分区/搜索并通知壳层（与文档阅读深视图同语义）
const promptDeep = ref(false)
const searchText = ref('')
const loading = ref(false)
const loadError = ref('')
const snapshot = ref<DocLibraryStateSnapshot | null>(null)
const selectedUnitId = ref('')
const unitMode = ref<UnitMode>('read')
const pathOpen = ref(false)
const savingDoc = ref(false)
const allOpen = ref<boolean | null>(null)
const treeKey = ref(0)
const selectedUnitIds = ref<Set<string>>(new Set())

const documents = computed(() => snapshot.value?.documents || [])
const manualTreeOrders = computed(() => snapshot.value?.manualTreeOrders || {})
const unitView = computed(() => buildDocLibraryUnitView(documents.value, manualTreeOrders.value, {
  treeNodes: snapshot.value?.treeNodes,
  treeOrders: snapshot.value?.treeOrders,
  treeDiffReport: snapshot.value?.treeDiffReport
}))
const units = computed(() => unitView.value.units || [])
const relations = computed(() => unitView.value.relations || [])
const unitById = computed(() => new Map(units.value.map((unit) => [unit.unitId, unit])))
const childrenByParentId = computed(() => {
  const map = new Map<string, UnitView[]>()
  units.value.forEach((unit) => {
    if (!unit.parentId) return
    const list = map.get(unit.parentId) || []
    list.push(unit)
    map.set(unit.parentId, list)
  })
  map.forEach((list) => list.sort(sortUnitRows))
  return map
})
const rootUnit = computed(() => units.value.find((unit) => unit.domain === 'docLibrary' && unit.unitType === 'root') || units.value[0] || null)

const normalizedQuery = computed(() => searchText.value.trim().toLowerCase())
const matchingAncestorIds = computed(() => (normalizedQuery.value ? buildMatchingAncestorIds(normalizedQuery.value) : null))
const effectiveForceAll = computed(() => (normalizedQuery.value ? true : allOpen.value))
const unitSelectionMode = computed(() => selectedUnitIds.value.size > 0)
const unitSelectionActions = computed<MobileSelectionAction[]>(() => {
  const count = selectedUnitIds.value.size
  return [
    { id: 'open', label: t('mobile.chatList.open'), icon: 'book-open', disabled: count !== 1 },
    { id: 'edit', label: t('common.edit'), icon: 'square-pen', disabled: count !== 1 },
    { id: 'relation', label: t('mobile.docWs.relation'), icon: 'git-branch', disabled: count !== 1 },
    { id: 'copy-path', label: t('mobile.docWs.copyPath'), icon: 'copy', disabled: count < 1 },
    { id: 'delete', label: t('common.delete'), icon: 'trash', danger: true, disabled: true }
  ]
})

const soneData = computed<MobileSoneNode[]>(() => {
  const root = rootUnit.value
  if (!root) return []
  return buildNodes(root.unitId)
})

function buildNodes(parentId: string): MobileSoneNode[] {
  const filter = matchingAncestorIds.value
  const children = childrenByParentId.value.get(parentId) || []
  const nodes: MobileSoneNode[] = []
  children.forEach((unit) => {
    if (filter && !filter.has(unit.unitId)) return
    const kids = childrenByParentId.value.get(unit.unitId)
    const hasKids = Boolean(kids && kids.length)
    const node: MobileSoneNode = {
      title: readUnitTitle(unit),
      key: unit.unitId,
      leafId: unit.unitId,
      sel: unit.unitId === selectedUnitId.value,
      checked: selectedUnitIds.value.has(unit.unitId)
    }
    if (hasKids) {
      node.children = buildNodes(unit.unitId)
    } else {
      node.fill = isUnitFilled(unit)
    }
    nodes.push(node)
  })
  return nodes
}

const selectedUnit = computed(() => unitById.value.get(selectedUnitId.value) || null)
const selectedUnitTitle = computed(() => selectedUnit.value ? readUnitTitle(selectedUnit.value) : t('mobile.docWs.docReadFallback'))
const selectedUnitStatus = computed(() => selectedUnit.value?.status || 'normal')
const selectedUnitBody = computed(() => {
  const unit = selectedUnit.value
  if (!unit) return t('mobile.docWs.selectUnit')
  return readText(unit.body) || readText(unit.compilePage?.summary) || t('mobile.docWs.noBody')
})
const editableDocBody = computed(() => readText(selectedUnit.value?.body))
const unitBreadcrumb = computed(() => {
  const unit = selectedUnit.value
  if (!unit) return ''
  const titles: string[] = []
  let cursor: UnitView | undefined = unit
  let guard = 0
  while (cursor && guard < 16) {
    titles.unshift(readUnitTitle(cursor))
    cursor = cursor.parentId ? unitById.value.get(cursor.parentId) : undefined
    guard += 1
  }
  return titles.join(' / ')
})
const pathNodes = computed<MobileSoneNode[]>(() => {
  const unit = selectedUnit.value
  if (!unit) return []
  const chain: UnitView[] = []
  let cursor: UnitView | undefined = unit
  let guard = 0
  while (cursor && guard < 16) {
    chain.unshift(cursor)
    cursor = cursor.parentId ? unitById.value.get(cursor.parentId) : undefined
    guard += 1
  }
  // 自顶向下嵌套成单链树
  let child: MobileSoneNode | null = null
  for (let i = chain.length - 1; i >= 0; i -= 1) {
    const unitItem = chain[i]
    const node: MobileSoneNode = {
      title: readUnitTitle(unitItem),
      key: unitItem.unitId,
      leafId: unitItem.unitId,
      open: true,
      sel: unitItem.unitId === selectedUnitId.value
    }
    if (child) node.children = [child]
    child = node
  }
  return child ? [child] : []
})
const worldClusterRelationProjection = computed(() => buildDocLibraryWorldClusterRelationProjection(units.value, relations.value))
const relationSource = computed(() => createUnitRelationSourceAdapter({
  characterId: 'doc-library',
  title: t('mobile.docWs.relationTitle'),
  activeUnit: selectedUnit.value,
  units: units.value,
  relations: worldClusterRelationProjection.value.relations,
  projectionForestRootUnitIds: worldClusterRelationProjection.value.forestRootUnitIds,
  predicates: [],
  predicateFilter: { predicateIds: [], statuses: [] }
}))
const activeDocTabLabel = computed(() => docTabs.value.find((item) => item.id === activeDocTab.value)?.label || t('sidebar.navDocs'))

watch([pane, promptDeep], ([paneValue, promptDeepValue]) => {
  emit('depthChange', paneValue !== 'tree' || promptDeepValue)
  // 进入/离开文档阅读层时清空世界树多选态
  clearUnitSelection()
}, { immediate: true })

// 切走提示词分区时组件卸载，深视图标记必须同步复位
watch(activeDocTab, (tab) => {
  if (tab !== 'prompts') promptDeep.value = false
  // 切换分区时清空世界树多选态
  clearUnitSelection()
})

// 仅在世界树列表层上报多选描述符，由壳层原位渲染底部操作胶囊
watchEffect(() => {
  if (pane.value === 'tree' && activeDocTab.value === 'world') {
    emit('selection', {
      open: unitSelectionMode.value,
      count: selectedUnitIds.value.size,
      actions: unitSelectionActions.value,
      onCancel: clearUnitSelection,
      onAction: runUnitSelectionAction
    })
  } else {
    emit('selection', { open: false, count: 0, actions: [], onCancel: () => {}, onAction: () => {} })
  }
})

onMounted(() => {
  void loadDocLibrary()
})

async function loadDocLibrary() {
  loading.value = true
  loadError.value = ''
  try {
    snapshot.value = await fetchDocLibraryState()
  } catch (error) {
    loadError.value = t('mobile.docWs.loadFailed', { message: error instanceof Error ? error.message : String(error) })
  } finally {
    loading.value = false
  }
}

function normalizeArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : []
}

function readText(value: unknown) {
  return String(value ?? '').trim()
}

function readUnitTitle(unit: UnitView | null) {
  return unit?.title || t('mobile.docWs.unnamedUnit')
}

function getUnitPath(unitId: string) {
  const unit = unitById.value.get(unitId)
  if (!unit) return unitId
  const titles: string[] = []
  let cursor: UnitView | undefined = unit
  let guard = 0
  while (cursor && guard < 16) {
    titles.unshift(readUnitTitle(cursor))
    cursor = cursor.parentId ? unitById.value.get(cursor.parentId) : undefined
    guard += 1
  }
  return titles.join(' / ')
}

async function copyText(text: string) {
  const value = String(text || '').trim()
  if (!value) return
  await navigator.clipboard?.writeText(value)
}

function buildUnitSearchText(unit: UnitView) {
  return [
    readUnitTitle(unit),
    readText(unit.sourcePath),
    readText(unit.body),
    readText(unit.compilePage?.summary),
    normalizeArray<string>(unit.compilePage?.tags).join(' ')
  ].join('\n').toLowerCase()
}

function buildMatchingAncestorIds(query: string) {
  const ids = new Set<string>()
  units.value.forEach((unit) => {
    if (!buildUnitSearchText(unit).includes(query)) return
    let cursor: UnitView | undefined = unit
    let guard = 0
    while (cursor && guard < 16) {
      ids.add(cursor.unitId)
      cursor = cursor.parentId ? unitById.value.get(cursor.parentId) : undefined
      guard += 1
    }
  })
  return ids
}

function onTreeLeaf(node: MobileSoneNode) {
  if (unitSelectionMode.value) {
    toggleUnitSelection(node)
    return
  }
  if (!node.leafId) return
  selectedUnitId.value = node.leafId
  unitMode.value = 'read'
  pane.value = 'unit'
}

function enterUnitSelection(node: MobileSoneNode) {
  if (!node.leafId) return
  selectedUnitIds.value = new Set([node.leafId])
}

function toggleUnitSelection(node: MobileSoneNode) {
  if (!node.leafId) return
  const next = new Set(selectedUnitIds.value)
  next.has(node.leafId) ? next.delete(node.leafId) : next.add(node.leafId)
  selectedUnitIds.value = next
}

function clearUnitSelection() {
  selectedUnitIds.value = new Set()
}

function runUnitSelectionAction(actionId: string) {
  const ids = Array.from(selectedUnitIds.value)
  if (!ids.length) return
  if (actionId === 'open' && ids.length === 1) {
    selectedUnitId.value = ids[0]
    unitMode.value = 'read'
    clearUnitSelection()
    pane.value = 'unit'
    return
  }
  if (actionId === 'edit' && ids.length === 1) {
    selectedUnitId.value = ids[0]
    unitMode.value = 'edit'
    clearUnitSelection()
    pane.value = 'unit'
    return
  }
  if (actionId === 'relation' && ids.length === 1) {
    selectedUnitId.value = ids[0]
    unitMode.value = 'relation'
    clearUnitSelection()
    pane.value = 'unit'
    return
  }
  if (actionId === 'copy-path') {
    void copyText(ids.map((id) => getUnitPath(id)).join('\n'))
    clearUnitSelection()
  }
}

function onGraphOpenUnit(unitId: string) {
  if (!unitId) return
  selectedUnitId.value = unitId
  unitMode.value = 'read'
}

function selectUnitMode(mode: string) {
  unitMode.value = mode as UnitMode
}

async function onSaveDoc(content: string) {
  const snap = snapshot.value
  const unit = selectedUnit.value
  if (!snap || !unit?.sourceId || savingDoc.value) return
  savingDoc.value = true
  try {
    const docId = unit.sourceId
    const documents = snap.documents.map((document) => {
      const matchId = String(document.documentId ?? document.id ?? '')
      return matchId === docId ? { ...document, content } : document
    })
    await saveDocLibraryState({ ...snap, documents })
    snapshot.value = await fetchDocLibraryState({ force: true })
  } finally {
    savingDoc.value = false
  }
}

function handleTreeAction(action: MobileTreeToolbarAction) {
  if (action === 'toggle-all') {
    allOpen.value = allOpen.value === true ? false : true
    treeKey.value += 1
  }
}

function isUnitFilled(unit: UnitView) {
  if (unit.status === 'pending') return false
  return Boolean(readText(unit.body) || readText(unit.compilePage?.summary))
}

function sortUnitRows(a: UnitView, b: UnitView) {
  return (a.orderIndex ?? 0) - (b.orderIndex ?? 0) || readUnitTitle(a).localeCompare(readUnitTitle(b), 'zh-CN')
}
</script>

<style scoped>
.mobile-doc-workspace {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  gap: 12px;
}

/* 下划线 tab */
.mobile-doc-tabs {
  display: flex;
  gap: 18px;
  border-bottom: 1px solid var(--lhm-border-line, #e5e5e5);
}

.mobile-doc-tab {
  position: relative;
  border: 0;
  background: transparent;
  color: var(--lhm-text-muted, #999);
  cursor: pointer;
  font: inherit;
  font-size: 13.5px;
  font-weight: 500;
  white-space: nowrap;
  padding: 0 0 9px;
  -webkit-tap-highlight-color: transparent;
}

.mobile-doc-tab--active {
  color: var(--lhm-text, #333);
  font-weight: 600;
}

.mobile-doc-tab__bar {
  position: absolute;
  left: 0;
  right: 0;
  bottom: -1px;
  height: 2px;
  border-radius: 2px;
  background: var(--lhm-accent, #5c8a5c);
}

/* 搜索行（带底线，无外框） */
.mobile-doc-search {
  display: flex;
  align-items: center;
  gap: 14px;
  border-bottom: 1px solid var(--lhm-border-line, #e5e5e5);
  color: var(--lhm-text-muted, #999);
  padding: 4px 2px 14px;
}

.mobile-doc-search input {
  min-width: 0;
  flex: 1;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--lhm-text, #333);
  font: inherit;
  font-size: 12.5px;
}

.mobile-doc-search input::placeholder {
  color: var(--lhm-text-muted, #999);
}

.mobile-doc-tree {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  overflow-y: auto;
}

.mobile-doc-empty {
  color: var(--lhm-text-muted, #999);
  line-height: 1.7;
  padding: 16px 4px;
}

.mobile-doc-placeholder {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--lhm-text-muted, #999);
  font-size: 13.5px;
}

.mobile-doc-placeholder__icon {
  color: var(--lhm-text-faint, #b6b0a7);
}

/* 文档阅读头 */
.mobile-doc-head {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  border-bottom: 1px solid var(--lhm-border-line, #e5e5e5);
  padding: 2px 0 11px;
}

.mobile-doc-head__back {
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

.mobile-doc-head__title {
  min-width: 0;
  flex: 1;
  cursor: pointer;
}

.mobile-doc-head__crumb {
  display: flex;
  align-items: center;
  gap: 4px;
  overflow: hidden;
  color: var(--lhm-accent, #5c8a5c);
  font-size: 10.5px;
}

.mobile-doc-head__crumb span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mobile-doc-head__name {
  margin-top: 1px;
  overflow: hidden;
  color: var(--lhm-text, #333);
  font-size: 16.5px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mobile-doc-reader {
  min-height: 0;
  flex: 1;
  overflow-y: auto;
}

.mobile-doc-reader__body :deep(h1),
.mobile-doc-reader__body :deep(h2),
.mobile-doc-reader__body :deep(h3) {
  margin: 20px 0 9px;
  font-size: 16px;
  font-weight: 600;
  color: var(--lhm-text, #333);
}

.mobile-doc-reader__body :deep(h1:first-child),
.mobile-doc-reader__body :deep(h2:first-child),
.mobile-doc-reader__body :deep(h3:first-child) {
  margin-top: 0;
}

.mobile-doc-reader__body :deep(p) {
  margin: 0 0 14px;
  font-size: 15px;
  line-height: 1.78;
  color: var(--lhm-text, #333);
}

.mobile-doc-reader__edit {
  display: flex;
  min-height: calc(100dvh - 200px);
  flex: 1;
  flex-direction: column;
}

.mobile-chip {
  flex-shrink: 0;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
  padding: 3px 10px;
}

.mobile-chip--ok {
  background: rgba(92, 138, 92, 0.16);
  color: var(--lhm-accent, #5c8a5c);
}

.mobile-chip--warn {
  background: rgba(212, 168, 67, 0.18);
  color: #a07c1e;
}

.mobile-doc-reader__relations {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
}

/* 复用桌面端力导向关系图（物理拖拽、Pointer Events 触控） */
.mobile-relation-graph {
  display: flex;
  min-height: 360px;
  height: calc(100dvh - 150px);
  margin: 0 -16px;
}

.mobile-relation-graph :deep(.unit-relation-brain-view) {
  flex: 1;
  min-width: 0;
  min-height: 0;
}
</style>
