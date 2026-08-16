<template>
  <section class="worlds-workspace-page">
    <header class="worlds-workspace-page__header">
      <div>
        <h2>{{ t('chat.worldManagerTitle') }}</h2>
      </div>
      <button
        type="button"
        class="worlds-workspace-page__close"
        :aria-label="t('common.close')"
        @click="emit('close')"
      >
        <svg class="worlds-workspace-page__close-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M18 6 6 18" />
          <path d="m6 6 12 12" />
        </svg>
      </button>
    </header>

    <div class="worlds-workspace-page__body">
      <div class="wm-body">
        <!-- 左：世界列表 -->
        <aside class="wm-list-pane">
          <div class="wm-list-create">
            <input
              v-model="newWorldName"
              type="text"
              maxlength="50"
              class="wm-list-create-input"
              :placeholder="t('chat.mapWorldCreatePlaceholder')"
              :disabled="creatingWorld"
              @keyup.enter="handleCreateWorld"
            >
            <button
              type="button"
              class="btn btn-small btn-primary wm-list-create-btn"
              :disabled="creatingWorld || !newWorldName.trim()"
              @click="handleCreateWorld"
            >{{ t('chat.worldManagerCreateBtn') }}</button>
          </div>
          <p v-if="worldsLoading" class="wm-list-note">{{ t('chat.mapWorldLoading') }}</p>
          <p v-else-if="!worlds.length" class="wm-list-note">{{ t('chat.mapWorldEmpty') }}</p>
          <ul v-else class="wm-list">
            <li v-for="item in worlds" :key="item.id">
              <button
                type="button"
                class="wm-list-item"
                :class="{ on: item.id === selectedWorldId }"
                @click="selectWorld(item.id)"
              >
                <span class="wm-list-item-name">{{ item.name }}</span>
                <span class="wm-list-item-meta">{{ t('chat.mapWorldSessionCount', { count: item.sessionCount || 0 }) }}</span>
              </button>
            </li>
          </ul>
          <p v-if="worldsError" class="wm-list-error">{{ worldsError }}</p>
        </aside>

        <!-- 右：详情 -->
        <section class="wm-detail-pane">
          <p v-if="!selectedWorldId" class="wm-detail-empty">{{ t('chat.worldManagerSelectHint') }}</p>
          <p v-else-if="detailLoading" class="wm-detail-empty">{{ t('chat.mapWorldLoading') }}</p>
          <p v-else-if="detailError" class="wm-detail-error">{{ detailError }}</p>
          <template v-else-if="detail">
            <!-- 详情头（防脏乱返工·2026-07-14）：世界名做主标题 + 一行浅色概览（地图/会话/角色数），
                 替代原先一进来就是「基本信息」堆叠、缺乏归属感的观感。头固定、下方内容独立滚动。 -->
            <header class="wm-detail-head">
              <h3 class="wm-detail-title">{{ detail.world.name }}</h3>
              <p class="wm-detail-meta">
                <span>{{ t('chat.worldManagerMetaMaps', { count: detail.maps.length }) }}</span>
                <span class="wm-detail-meta-dot" aria-hidden="true">·</span>
                <span>{{ t('chat.worldManagerMetaSessions', { count: detail.sessions.length }) }}</span>
                <span class="wm-detail-meta-dot" aria-hidden="true">·</span>
                <span>{{ t('chat.worldManagerMetaCharacters', { count: detail.characterIds.length }) }}</span>
                <span class="wm-detail-meta-dot" aria-hidden="true">·</span>
                <span>{{ t('chat.worldManagerMetaEntities', { count: detail.entities.length }) }}</span>
              </p>
            </header>

            <div class="wm-detail-scroll">
              <!-- 基本信息 -->
              <section class="wm-section">
                <h4 class="wm-section-title">{{ t('chat.worldManagerInfoTitle') }}</h4>
                <div class="form-group">
                  <label>{{ t('chat.worldManagerNameLabel') }}</label>
                  <input
                    v-model="editName"
                    type="text"
                    maxlength="50"
                    class="wm-name-input"
                    :placeholder="t('chat.worldManagerNamePlaceholder')"
                  >
                </div>
                <div class="form-group">
                  <label>{{ t('chat.worldManagerDescLabel') }}</label>
                  <textarea
                    v-model="editDescription"
                    maxlength="500"
                    class="wm-desc-input"
                    :placeholder="t('chat.worldManagerDescPlaceholder')"
                  ></textarea>
                </div>
                <div class="wm-section-actions">
                  <button
                    type="button"
                    class="btn btn-small btn-primary wm-info-save-btn"
                    :disabled="savingInfo || !editName.trim()"
                    @click="saveInfo"
                  >{{ t('chat.worldManagerSave') }}</button>
                  <span v-if="infoError" class="wm-inline-error">{{ infoError }}</span>
                </div>
              </section>

              <section class="wm-section">
                <h4 class="wm-section-title">{{ t('chat.worldManagerNarrativeConstraintTitle') }}</h4>
                <p class="wm-section-hint">{{ t('chat.worldManagerNarrativeConstraintHint') }}</p>
                <textarea
                  v-model="worldConstraintContent"
                  class="wm-constraint-input"
                  maxlength="6000"
                  :placeholder="t('chat.worldManagerNarrativeConstraintPlaceholder')"
                ></textarea>
                <div class="wm-section-actions">
                  <button
                    type="button"
                    class="btn btn-small btn-primary"
                    :disabled="savingWorldConstraint || worldConstraintContent === worldConstraintBaseline"
                    @click="saveWorldConstraint"
                  >{{ t('chat.worldManagerSaveConstraint') }}</button>
                  <span class="wm-constraint-version">v{{ worldConstraintVersion }}</span>
                  <span v-if="worldConstraintError" class="wm-inline-error">{{ worldConstraintError }}</span>
                </div>
              </section>

              <!-- 会话（已挂 + 挂载现有会话）：显示名优先走侧栏同源 chatSessionRows/chatStore 本地解析，
                   服务端 name 只作兜底（真机反馈②：群会话服务端 title 常为空，本地能解析出更可读的名字）。 -->
              <section class="wm-section">
                <h4 class="wm-section-title">{{ t('chat.worldManagerSessionsTitle') }}</h4>
                <p v-if="!detail.sessions.length" class="wm-section-hint">{{ t('chat.worldManagerSessionsEmpty') }}</p>
                <ul v-else class="wm-session-list">
                  <li v-for="session in detail.sessions" :key="session.id" class="wm-session-row">
                    <span class="wm-session-row-name">{{ resolveAttachedSessionName(session) }}</span>
                    <button
                      type="button"
                      class="wm-row-action wm-session-detach-btn"
                      :disabled="attachBusy"
                      @click="detachSession(session.id)"
                    >{{ t('chat.worldManagerDetachSession') }}</button>
                  </li>
                </ul>
                <button type="button" class="wm-ghost-btn wm-attach-toggle-btn" @click="showAttachPicker = !showAttachPicker">
                  {{ t('chat.worldManagerAttachSessionBtn') }}
                </button>
                <div v-if="showAttachPicker" class="wm-attach-panel">
                  <p v-if="!attachableSessions.length" class="wm-section-hint">{{ t('chat.worldManagerAttachEmpty') }}</p>
                  <ul v-else class="wm-session-list">
                    <li v-for="session in attachableSessions" :key="session.sessionId" class="wm-session-row">
                      <span class="wm-session-row-name">{{ rowDisplayLabel(session) }}</span>
                      <button
                        type="button"
                        class="wm-row-action wm-row-action--accent wm-attach-btn"
                        :disabled="attachBusy"
                        @click="attachSession(session.sessionId)"
                      >{{ t('chat.worldManagerAttachBtn') }}</button>
                    </li>
                  </ul>
                </div>
              </section>

              <!-- 出场角色（只读 chips，本地角色数据解析名字/头像） -->
              <section class="wm-section">
                <h4 class="wm-section-title">{{ t('chat.worldManagerCharactersTitle') }}</h4>
                <p v-if="!detail.characterIds.length" class="wm-section-hint">{{ t('chat.worldManagerCharactersEmpty') }}</p>
                <div v-else class="wm-character-chips">
                  <span v-for="character in resolvedCharacters" :key="character.id" class="wm-character-chip">
                    <img v-if="character.avatarPath" class="wm-character-chip-avatar" :src="character.avatarPath" alt="">
                    <span v-else class="wm-character-chip-emoji">{{ character.emoji || '👤' }}</span>
                    {{ character.name }}
                  </span>
                </div>
              </section>

              <!-- 地图（只读 chips，管理仍在舆图弹窗）：与出场角色一致的 chip 观感，替代原先裸项目符号列表 -->
              <section class="wm-section">
                <h4 class="wm-section-title">{{ t('chat.worldManagerMapsTitle') }}</h4>
                <p v-if="!detail.maps.length" class="wm-section-hint">{{ t('chat.worldManagerMapsEmpty') }}</p>
                <div v-else class="wm-map-chips">
                  <span v-for="map in detail.maps" :key="map.id" class="wm-map-chip">
                    <span>{{ map.name || map.id }}</span>
                    <span v-if="detail.defaultMapSheetId === map.id" class="wm-map-default-badge">{{ t('chat.worldManagerMapDefault') }}</span>
                    <button
                      v-else
                      type="button"
                      class="wm-map-default-btn"
                      :disabled="Boolean(defaultMapBusyId)"
                      @click="setDefaultMap(map.id)"
                    >{{ t('chat.worldManagerMapSetDefault') }}</button>
                  </span>
                </div>
                <p v-if="defaultMapError" class="wm-inline-error">{{ defaultMapError }}</p>
              </section>

              <!-- 世界实体：正式真值直接住在 world_entities；这里提供轻量 CRUD，不再绕回文档库待确认。 -->
              <section class="wm-section">
                <div class="wm-section-heading-row">
                  <h4 class="wm-section-title">{{ t('chat.worldManagerEntitiesTitle') }}</h4>
                  <button type="button" class="wm-row-action wm-row-action--accent wm-entity-add-btn" @click="openCreateEntity">
                    {{ t('chat.worldManagerEntityAdd') }}
                  </button>
                </div>
                <p v-if="!detail.entities.length" class="wm-section-hint">{{ t('chat.worldManagerEntitiesEmpty') }}</p>
                <ul v-else class="wm-entity-list">
                  <li v-for="entity in detail.entities" :key="entity.id" class="wm-entity-row">
                    <div class="wm-entity-main">
                      <span class="wm-entity-kind">{{ entityKindLabel(entity.kind) }}</span>
                      <strong class="wm-entity-name">{{ entity.name }}</strong>
                      <span v-if="entity.tags?.length" class="wm-entity-tags">{{ entity.tags.slice(0, 3).join(' · ') }}</span>
                    </div>
                    <div class="wm-entity-actions">
                      <button type="button" class="wm-row-action wm-entity-edit-btn" @click="openEditEntity(entity)">
                        {{ t('common.edit') }}
                      </button>
                      <button type="button" class="wm-row-action wm-entity-delete-btn" @click="openDeleteEntity(entity)">
                        {{ t('common.delete') }}
                      </button>
                    </div>
                  </li>
                </ul>
                <p v-if="entityError" class="wm-inline-error">{{ entityError }}</p>
              </section>

              <!-- 文档库范围 -->
              <section class="wm-section">
                <h4 class="wm-section-title">{{ t('chat.worldManagerDocLinksTitle') }}</h4>
                <div class="wm-doclinks-row">
                  <p class="wm-section-hint wm-doclinks-summary">
                    {{ detail.docLinks.length
                      ? t('chat.worldManagerDocLinksSummaryLinked', { count: detail.docLinks.length })
                      : t('chat.worldManagerDocLinksSummaryEmpty') }}
                  </p>
                  <button type="button" class="wm-ghost-btn wm-doclinks-manage-btn" @click="openDocLinksDialog">
                    {{ t('chat.worldManagerDocLinksManageBtn') }}
                  </button>
                </div>
              </section>

              <!-- 危险区（低调·对齐 UI_STYLE「删除不做成页面最显眼区域」）：删除降级到底部弱化区，
                   不再是页面正中的整条大红按钮。展开确认走既有 openDeleteConfirm 流程。 -->
              <section class="wm-danger-zone">
                <template v-if="!deleteConfirmOpen">
                  <button type="button" class="wm-delete-btn" @click="openDeleteConfirm">
                    <svg class="wm-delete-icon" viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M3 6h18" />
                      <path d="M8 6V4h8v2" />
                      <path d="M19 6l-1 14H6L5 6" />
                      <path d="M10 11v6M14 11v6" />
                    </svg>
                    {{ t('chat.worldManagerDeleteBtn') }}
                  </button>
                  <span class="wm-danger-hint">{{ t('chat.worldManagerDeleteHint') }}</span>
                </template>
                <template v-else>
                  <p class="wm-delete-confirm-text">{{ t('chat.worldManagerDeleteConfirmDesc', { count: detail.sessions.length }) }}</p>
                  <div class="wm-section-actions">
                    <button type="button" class="btn btn-small btn-secondary wm-delete-cancel-btn" :disabled="deleting" @click="deleteConfirmOpen = false">
                      {{ t('common.cancel') }}
                    </button>
                    <button type="button" class="btn btn-small btn-danger wm-delete-confirm-btn" :disabled="deleting" @click="confirmDeleteWorld">
                      {{ t('chat.worldManagerDeleteBtn') }}
                    </button>
                  </div>
                </template>
                <p v-if="deleteError" class="wm-inline-error">{{ deleteError }}</p>
              </section>
            </div>
          </template>
        </section>
      </div>
    </div>

    <!-- 世界文档库挂载勾选树弹窗：复用通用 docLibraryLinkTree 纯函数；
         挂载的唯一入口与正式真值都在世界管理页，走服务端 PUT /worlds/:id/doc-links。 -->
    <AppFormDialog
      :open="showDocLinksDialog"
      :title="t('chat.worldManagerDocLinksDialogTitle')"
      size="xl"
      :z-index="13060"
      @cancel="showDocLinksDialog = false"
    >
      <div class="wm-doclinks-dialog">
        <p class="wm-doclinks-hint">{{ t('chat.worldManagerDocLinksHint') }}</p>
        <input
          v-model="docLinksSearch"
          class="wm-doclinks-search"
          type="text"
          :placeholder="t('chat.worldManagerDocLinksSearchPlaceholder')"
        >
        <div v-if="docLinksLoading" class="wm-doclinks-empty">{{ t('chat.worldManagerDocLinksLoading') }}</div>
        <div v-else-if="!docLinkRows.length" class="wm-doclinks-empty">{{ t('chat.worldManagerDocLinksEmpty') }}</div>
        <div v-else-if="!visibleDocLinkRows.length" class="wm-doclinks-empty">
          {{ t('chat.worldManagerDocLinksNoMatch', { keyword: docLinksSearch }) }}
        </div>
        <div v-else class="wm-doclinks-list" role="tree" aria-multiselectable="true">
          <div
            v-for="row in visibleDocLinkRows"
            :key="row.id"
            class="wm-doc-link-item"
            :class="{
              selected: docLinkRowState(row) === 'all',
              partial: docLinkRowState(row) === 'partial',
              disabled: !row.docKeys.length,
              folder: row.isFolder
            }"
            :style="{ marginLeft: `${row.depth * 18}px` }"
            role="treeitem"
            :aria-selected="docLinkRowState(row) === 'all'"
            @click="toggleDocLinkRowClick(row)"
          >
            <button
              v-if="row.isFolder"
              type="button"
              class="wm-doc-link-caret"
              :class="{ collapsed: docLinksCollapsed.has(row.id) }"
              :disabled="Boolean(docLinksSearch.trim())"
              aria-label="展开/收起"
              @click.stop="toggleDocLinkCollapse(row)"
            >
              <svg viewBox="0 0 24 24"><path d="m6 9 6 6 6-6" /></svg>
            </button>
            <span v-else class="wm-doc-link-caret wm-doc-link-caret--placeholder" aria-hidden="true"></span>
            <span class="wm-doc-link-check" aria-hidden="true">
              <svg v-if="docLinkRowState(row) === 'partial'" viewBox="0 0 24 24"><path d="M6 12h12" /></svg>
              <svg v-else viewBox="0 0 24 24"><path d="m5 13 4 4 10-11" /></svg>
            </span>
            <span class="wm-doc-link-text">
              <strong>{{ row.title }}</strong>
              <em v-if="row.isFolder">{{ docLinkFolderMeta(row) }}</em>
              <em v-else-if="docLinksSearch.trim() && row.path">{{ row.path }}</em>
            </span>
          </div>
        </div>
        <p v-if="docLinksError" class="wm-inline-error">{{ docLinksError }}</p>
      </div>
      <template #actions>
        <button type="button" class="btn btn-secondary wm-doclinks-clear-btn" :disabled="!docLinksDraft.length" @click="docLinksDraft = []">
          {{ t('chat.worldManagerDocLinksClearAll') }}
        </button>
        <button type="button" class="btn btn-primary wm-doclinks-save-btn" :disabled="docLinksSaving" @click="saveDocLinks">
          {{ t('chat.worldManagerSave') }}
        </button>
      </template>
    </AppFormDialog>

    <AppFormDialog
      :open="entityDialogOpen"
      :title="editingEntityId ? t('chat.worldManagerEntityEditTitle') : t('chat.worldManagerEntityCreateTitle')"
      size="lg"
      :submit-text="t('chat.worldManagerSave')"
      :cancel-text="t('common.cancel')"
      :submit-disabled="entitySaving || !entityDraft.name.trim()"
      :z-index="13070"
      @cancel="closeEntityDialog"
      @submit="saveEntity"
    >
      <div class="wm-entity-form">
        <div class="form-group">
          <label>{{ t('chat.worldManagerEntityKindLabel') }}</label>
          <select v-model="entityDraft.kind">
            <option v-for="kind in entityKinds" :key="kind" :value="kind">{{ entityKindLabel(kind) }}</option>
          </select>
        </div>
        <div class="form-group">
          <label>{{ t('chat.worldManagerEntityNameLabel') }}</label>
          <input v-model="entityDraft.name" type="text" maxlength="100" :placeholder="t('chat.worldManagerEntityNamePlaceholder')">
        </div>
        <div class="form-group">
          <label>{{ t('chat.worldManagerEntityAliasesLabel') }}</label>
          <input v-model="entityDraft.aliases" type="text" :placeholder="t('chat.worldManagerEntityAliasesPlaceholder')">
        </div>
        <div class="form-group">
          <label>{{ t('chat.worldManagerEntityTagsLabel') }}</label>
          <input v-model="entityDraft.tags" type="text" :placeholder="t('chat.worldManagerEntityTagsPlaceholder')">
        </div>
        <div class="form-group">
          <label>{{ t('chat.worldManagerEntityMapLabel') }}</label>
          <select v-model="entityDraft.mapSheetId">
            <option value="">{{ t('chat.worldManagerEntityMapNone') }}</option>
            <option v-for="map in detail?.maps || []" :key="map.id" :value="map.id">{{ map.name || map.id }}</option>
          </select>
        </div>
        <div class="form-group">
          <label>{{ t('chat.worldManagerEntityMarkdownLabel') }}</label>
          <textarea v-model="entityDraft.markdown" rows="9" :placeholder="t('chat.worldManagerEntityMarkdownPlaceholder')"></textarea>
        </div>
        <p v-if="entityDialogError" class="wm-inline-error">{{ entityDialogError }}</p>
      </div>
    </AppFormDialog>

    <AppConfirmDialog
      :open="Boolean(entityPendingDelete)"
      :title="t('chat.worldManagerEntityDeleteTitle')"
      :message="t('chat.worldManagerEntityDeleteMessage', { name: entityPendingDelete?.name || '' })"
      :confirm-text="t('common.delete')"
      :cancel-text="t('common.cancel')"
      tone="danger"
      :z-index="13080"
      @cancel="entityPendingDelete = null"
      @confirm="confirmDeleteEntity"
    />
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import AppFormDialog from '../../common/AppFormDialog.vue'
import AppConfirmDialog from '../../common/AppConfirmDialog.vue'
import { useCharacterStore } from '../../../stores/characterStore'
import { useChatStore } from '../../../stores/chatStore'
import {
  attachSessionWorld,
  createWorld,
  deleteWorld,
  deleteWorldEntity,
  fetchNarrativeScriptConfig,
  fetchWorldDetail,
  fetchWorlds,
  saveWorldDocLinks,
  saveWorldEntity,
  saveNarrativeScriptConfig,
  updateWorld,
  WorldDeleteConflictError,
  type WorldDetail
} from '../../../repositories/chatRepository'
import type { ChatSession, World, WorldEntity, WorldEntityKind } from '../../../types'
import type { ChatSessionRow } from '../../../types/panelContracts'
import { fetchDocLibraryState } from '../../../repositories/docBrainRepository'
import { getCachedDocLibraryUnitView } from '../../../app/docLibraryUnitViewCache'
import {
  applyDocLibraryLinkRowCollapse,
  buildDocLibraryLinkTreeRows,
  docLinkRowSelectionState,
  filterDocLibraryLinkTreeRows,
  toggleDocLinkRow,
  type DocLibraryLinkTreeRow
} from '../../../app/docLibraryLinkTree'
import { applyChatSessionWorldReadModel, applyWorldDocLinksToMountedSessions } from '../../../app/chatSessionWorldContext'

const { t } = useI18n()
const characterStore = useCharacterStore()
const chatStore = useChatStore()

// ── 顶层工作区页（批2 真机反馈返工）：由 workspacePrimaryView === 'worlds' 的 v-if 驱动挂载/卸载，
//    不再是自治弹窗（不监听 window 事件），组件生命周期本身就是「开/关」，无需手动重置状态。 ──
const props = defineProps<{
  /** 侧栏同源会话行（useAppShellPanelBuilders.buildChatSessionRows 产物）：已排 kind='xingyi' 与
   *  unknown target、显示名口径与侧栏一致——挂载会话选择器与已挂会话显示名统一吃这份数据源。 */
  chatSessionRows: ChatSessionRow[]
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

onMounted(() => {
  void loadWorlds()
})

// ── 左：世界列表 ──
const worlds = ref<World[]>([])
const worldsLoading = ref(false)
const worldsError = ref('')
const newWorldName = ref('')
const creatingWorld = ref(false)

async function loadWorlds() {
  worldsLoading.value = true
  worldsError.value = ''
  try {
    worlds.value = await fetchWorlds()
  } catch (err) {
    worldsError.value = err instanceof Error ? err.message : String(err)
  } finally {
    worldsLoading.value = false
  }
}

async function handleCreateWorld() {
  const name = newWorldName.value.trim()
  if (!name || creatingWorld.value) return
  creatingWorld.value = true
  worldsError.value = ''
  try {
    const created = await createWorld({ name })
    newWorldName.value = ''
    await loadWorlds()
    await selectWorld(created.id)
  } catch (err) {
    worldsError.value = err instanceof Error ? err.message : String(err)
  } finally {
    creatingWorld.value = false
  }
}

// ── 右：选中世界详情 ──
const selectedWorldId = ref('')
const detail = ref<WorldDetail | null>(null)
const detailLoading = ref(false)
const detailError = ref('')

const editName = ref('')
const editDescription = ref('')
const savingInfo = ref(false)
const infoError = ref('')
const worldConstraintContent = ref('')
const worldConstraintBaseline = ref('')
const worldConstraintVersion = ref(0)
const savingWorldConstraint = ref(false)
const worldConstraintError = ref('')
const defaultMapBusyId = ref('')
const defaultMapError = ref('')

const entityKinds: WorldEntityKind[] = ['organization', 'item', 'location', 'building', 'region', 'other']
const entityDialogOpen = ref(false)
const editingEntityId = ref('')
const entitySaving = ref(false)
const entityError = ref('')
const entityDialogError = ref('')
const entityPendingDelete = ref<WorldEntity | null>(null)
const entityDraft = ref({
  kind: 'other' as WorldEntityKind,
  name: '',
  aliases: '',
  tags: '',
  mapSheetId: '',
  markdown: ''
})

function entityKindLabel(kind: string): string {
  return t(`chat.worldManagerEntityKind_${kind}`)
}

function splitEntityList(value: string): string[] {
  return [...new Set(String(value || '').split(/[，,]/).map((item) => item.trim()).filter(Boolean))]
}

function openCreateEntity() {
  editingEntityId.value = ''
  entityDialogError.value = ''
  entityDraft.value = { kind: 'other', name: '', aliases: '', tags: '', mapSheetId: '', markdown: '' }
  entityDialogOpen.value = true
}

function openEditEntity(entity: WorldEntity) {
  editingEntityId.value = entity.id
  entityDialogError.value = ''
  entityDraft.value = {
    kind: entity.kind,
    name: entity.name,
    aliases: (entity.aliases || []).join(', '),
    tags: (entity.tags || []).join(', '),
    mapSheetId: entity.mapSheetId || '',
    markdown: entity.markdown || ''
  }
  entityDialogOpen.value = true
}

function closeEntityDialog() {
  if (entitySaving.value) return
  entityDialogOpen.value = false
}

async function saveEntity() {
  if (!detail.value || entitySaving.value || !entityDraft.value.name.trim()) return
  entitySaving.value = true
  entityDialogError.value = ''
  try {
    const saved = await saveWorldEntity(detail.value.world.id, {
      id: editingEntityId.value || undefined,
      ...(editingEntityId.value ? { expectedVersion: detail.value.entities.find((item) => item.id === editingEntityId.value)?.version } : {}),
      kind: entityDraft.value.kind,
      name: entityDraft.value.name.trim(),
      aliases: splitEntityList(entityDraft.value.aliases),
      tags: splitEntityList(entityDraft.value.tags),
      mapSheetId: entityDraft.value.mapSheetId,
      markdown: entityDraft.value.markdown
    })
    const index = detail.value.entities.findIndex((item) => item.id === saved.id)
    const entities = [...detail.value.entities]
    if (index >= 0) entities.splice(index, 1, saved)
    else entities.push(saved)
    detail.value = { ...detail.value, entities }
    entityDialogOpen.value = false
  } catch (err) {
    entityDialogError.value = err instanceof Error ? err.message : String(err)
  } finally {
    entitySaving.value = false
  }
}

function openDeleteEntity(entity: WorldEntity) {
  entityError.value = ''
  entityPendingDelete.value = entity
}

async function confirmDeleteEntity() {
  if (!detail.value || !entityPendingDelete.value) return
  const target = entityPendingDelete.value
  try {
    await deleteWorldEntity(detail.value.world.id, target.id)
    detail.value = { ...detail.value, entities: detail.value.entities.filter((item) => item.id !== target.id) }
    entityPendingDelete.value = null
  } catch (err) {
    entityPendingDelete.value = null
    entityError.value = err instanceof Error ? err.message : String(err)
  }
}

async function selectWorld(worldId: string) {
  deleteConfirmOpen.value = false
  showAttachPicker.value = false
  if (selectedWorldId.value === worldId && detail.value) return
  selectedWorldId.value = worldId
  await loadDetail(worldId)
}

async function loadDetail(worldId: string) {
  detailLoading.value = true
  detailError.value = ''
  try {
    const [result, narrativeConfig] = await Promise.all([
      fetchWorldDetail(worldId),
      fetchNarrativeScriptConfig(worldId)
    ])
    detail.value = result
    editName.value = result.world.name
    editDescription.value = result.world.description || ''
    worldConstraintContent.value = String(narrativeConfig.content || '')
    worldConstraintBaseline.value = worldConstraintContent.value
    worldConstraintVersion.value = Number(narrativeConfig.version || 0)
    worldConstraintError.value = ''
  } catch (err) {
    detail.value = null
    detailError.value = err instanceof Error ? err.message : String(err)
  } finally {
    detailLoading.value = false
  }
}

async function saveWorldConstraint() {
  if (!detail.value || savingWorldConstraint.value) return
  savingWorldConstraint.value = true
  worldConstraintError.value = ''
  try {
    const saved = await saveNarrativeScriptConfig(detail.value.world.id, {
      content: worldConstraintContent.value,
      expectedVersion: worldConstraintVersion.value
    })
    worldConstraintContent.value = String(saved.content || '')
    worldConstraintBaseline.value = worldConstraintContent.value
    worldConstraintVersion.value = Number(saved.version || 0)
  } catch (err) {
    worldConstraintError.value = err instanceof Error ? err.message : String(err)
  } finally {
    savingWorldConstraint.value = false
  }
}

async function saveInfo() {
  if (!detail.value || savingInfo.value) return
  const name = editName.value.trim()
  if (!name) return
  savingInfo.value = true
  infoError.value = ''
  try {
    const updated = await updateWorld(detail.value.world.id, { name, description: editDescription.value })
    detail.value = { ...detail.value, world: updated }
    const idx = worlds.value.findIndex((item) => item.id === updated.id)
    if (idx >= 0) worlds.value[idx] = { ...worlds.value[idx], name: updated.name, description: updated.description }
  } catch (err) {
    infoError.value = err instanceof Error ? err.message : String(err)
  } finally {
    savingInfo.value = false
  }
}

async function setDefaultMap(mapId: string) {
  if (!detail.value || defaultMapBusyId.value) return
  defaultMapBusyId.value = mapId
  defaultMapError.value = ''
  try {
    const updated = await updateWorld(detail.value.world.id, { defaultMapSheetId: mapId })
    detail.value = {
      ...detail.value,
      world: updated,
      defaultMapSheetId: updated.defaultMapSheetId || mapId
    }
  } catch (err) {
    defaultMapError.value = err instanceof Error ? err.message : String(err)
  } finally {
    defaultMapBusyId.value = ''
  }
}

// ── 删除（软删）：409 冲突态携带 reason/count，按 reason 选对应文案 ──
const deleteConfirmOpen = ref(false)
const deleting = ref(false)
const deleteError = ref('')

function openDeleteConfirm() {
  deleteConfirmOpen.value = true
  deleteError.value = ''
}

async function confirmDeleteWorld() {
  if (!detail.value || deleting.value) return
  const worldId = detail.value.world.id
  deleting.value = true
  deleteError.value = ''
  try {
    await deleteWorld(worldId)
    worlds.value = worlds.value.filter((item) => item.id !== worldId)
    selectedWorldId.value = ''
    detail.value = null
    deleteConfirmOpen.value = false
  } catch (err) {
    if (err instanceof WorldDeleteConflictError) {
      const conflictMessageKeys = {
        maps: 'chat.worldManagerDeleteConflictMaps',
        statusPanels: 'chat.worldManagerDeleteConflictStatusPanels',
        narrativeSeeds: 'chat.worldManagerDeleteConflictNarrativeSeeds',
        worldEntities: 'chat.worldManagerDeleteConflictEntities'
      } as const
      deleteError.value = t(conflictMessageKeys[err.reason], { count: err.count })
    } else {
      deleteError.value = err instanceof Error ? err.message : String(err)
    }
  } finally {
    deleting.value = false
  }
}

// ── 会话挂/解世界：唯一入口 attachSessionWorld（POST /chat-sessions/:id/world），本页按 sessionId 调用 ──
const showAttachPicker = ref(false)
const attachBusy = ref(false)
// 本轮内已挂过的会话 id：用于候选列表即时摘除；正式归属同步吃服务端回包写回 chatStore。
const recentlyAttachedSessionIds = ref<Set<string>>(new Set())

// 挂载候选（批2 根修①）：数据源改用侧栏同源 chatSessionRows（已排 kind='xingyi' 与 unknown target、
// 显示名口径与侧栏一致），只按「未归档 + 未挂世界」二次过滤——不再用 chatStore.entities.chatSessions
// 原始字典兜底枚举（那份字典里混着星依浮坞内部会话/空标题会话，是真机反馈②的根因）。
const attachableSessions = computed<ChatSessionRow[]>(() => {
  const rows = props.chatSessionRows || []
  const sessions = (chatStore.entities.chatSessions || {}) as Record<string, ChatSession>
  return rows.filter((row) => {
    if (!row.sessionId || recentlyAttachedSessionIds.value.has(row.sessionId)) return false
    if (row.isArchived) return false
    const session = sessions[row.sessionId]
    const worldId = String(session?.worldId ?? session?.world_id ?? '').trim()
    return !worldId
  })
})

/** 会话行展示名：沿用侧栏口径 title（已含群聊「N人」兜底），带 label 时缀「· N人」。 */
function rowDisplayLabel(row: ChatSessionRow): string {
  return row.label ? `${row.title} · ${row.label}` : row.title
}

/** 世界详情「已挂会话」展示名：优先按 sessionId 命中侧栏同源 rows，其次本地 chatStore 实体 title，
 *  服务端 name（chat_sessions.title，群会话常为空）只作最终兜底——同真机反馈②的根修口径。 */
function resolveAttachedSessionName(session: { id: string; name?: string }): string {
  const row = (props.chatSessionRows || []).find((item) => item.sessionId === session.id)
  if (row) return rowDisplayLabel(row)
  const sessions = (chatStore.entities.chatSessions || {}) as Record<string, ChatSession>
  const entityTitle = String(sessions[session.id]?.title || '').trim()
  if (entityTitle) return entityTitle
  const serverName = String(session.name || '').trim()
  return serverName || t('chat.worldManagerUntitledSession')
}

async function attachSession(sessionId: string) {
  if (!detail.value || attachBusy.value) return
  attachBusy.value = true
  try {
    const result = await attachSessionWorld(sessionId, { worldId: detail.value.world.id })
    applyChatSessionWorldReadModel(chatStore, result.session)
    recentlyAttachedSessionIds.value = new Set([...recentlyAttachedSessionIds.value, sessionId])
    await loadDetail(detail.value.world.id)
  } catch (err) {
    detailError.value = err instanceof Error ? err.message : String(err)
  } finally {
    attachBusy.value = false
  }
}

async function detachSession(sessionId: string) {
  if (!detail.value || attachBusy.value) return
  attachBusy.value = true
  try {
    const result = await attachSessionWorld(sessionId, { detach: true })
    applyChatSessionWorldReadModel(chatStore, result.session)
    await loadDetail(detail.value.world.id)
  } catch (err) {
    detailError.value = err instanceof Error ? err.message : String(err)
  } finally {
    attachBusy.value = false
  }
}

// ── 出场角色：characterIds 用本地角色 store 解析名字/头像（只读 chips，未命中回退「未知角色」） ──
function normalizeAvatarUrl(path?: string | null): string {
  if (!path) return ''
  const trimmed = String(path).trim()
  if (!trimmed) return ''
  if (trimmed.startsWith('data:') || /^https?:\/\//i.test(trimmed)) return trimmed
  if (trimmed.startsWith('//')) return '/' + trimmed.replace(/^\/+/, '')
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`
}

const resolvedCharacters = computed(() => {
  if (!detail.value) return []
  const byId = new Map((characterStore.characters || []).map((item) => {
    const row = item as { id?: string }
    return [String(row?.id || ''), item] as const
  }))
  return detail.value.characterIds.map((id) => {
    const character = byId.get(id) as { name?: string; emoji?: string; avatarPath?: string; avatar_path?: string } | undefined
    return {
      id,
      name: String(character?.name || '').trim() || t('chat.worldManagerCharacterUnknown'),
      emoji: character?.emoji || '',
      avatarPath: normalizeAvatarUrl(character?.avatarPath || character?.avatar_path || '')
    }
  })
})

// ── 文档库勾选树：逻辑层复用 docLibraryLinkTree.ts 纯函数 + fetchDocLibraryState + getCachedDocLibraryUnitView，
//    挂载真值只走 saveWorldDocLinks（PUT）；保存后把服务端结果同步到本地已挂会话的只读投影。 ──
const showDocLinksDialog = ref(false)
const docLinksLoading = ref(false)
const docLinksSaving = ref(false)
const docLinksError = ref('')
const docLinksSearch = ref('')
const docLinksDraft = ref<string[]>([])
const docLinkRows = ref<DocLibraryLinkTreeRow[]>([])
const docLinksCollapsed = ref<Set<string>>(new Set())

const docLinksDraftSet = computed(() => new Set(docLinksDraft.value))
const visibleDocLinkRows = computed(() => {
  const keyword = docLinksSearch.value.trim()
  if (keyword) return filterDocLibraryLinkTreeRows(docLinkRows.value, keyword)
  return applyDocLibraryLinkRowCollapse(docLinkRows.value, docLinksCollapsed.value)
})

async function openDocLinksDialog() {
  if (!detail.value) return
  showDocLinksDialog.value = true
  showAttachPicker.value = false
  docLinksSearch.value = ''
  docLinksError.value = ''
  docLinksDraft.value = [...detail.value.docLinks]
  docLinksLoading.value = true
  try {
    const snapshot = await fetchDocLibraryState()
    const unitView = getCachedDocLibraryUnitView(snapshot.documents || [], snapshot.manualTreeOrders || {}, {
      treeNodes: snapshot.treeNodes,
      treeOrders: snapshot.treeOrders,
      treeDiffReport: snapshot.treeDiffReport
    })
    docLinkRows.value = buildDocLibraryLinkTreeRows(unitView.units)
    docLinksCollapsed.value = new Set()
  } catch (error) {
    console.warn('加载文档库文件清单失败:', error)
    docLinkRows.value = []
  } finally {
    docLinksLoading.value = false
  }
}

function docLinkRowState(row: DocLibraryLinkTreeRow) {
  return docLinkRowSelectionState(docLinksDraftSet.value, row)
}

function toggleDocLinkRowClick(row: DocLibraryLinkTreeRow) {
  docLinksDraft.value = toggleDocLinkRow(docLinksDraft.value, row)
}

function toggleDocLinkCollapse(row: DocLibraryLinkTreeRow) {
  const next = new Set(docLinksCollapsed.value)
  if (next.has(row.id)) next.delete(row.id)
  else next.add(row.id)
  docLinksCollapsed.value = next
}

function docLinkFolderMeta(row: DocLibraryLinkTreeRow) {
  if (!row.docKeys.length) return t('chat.worldManagerDocLinksFolderEmpty')
  const hit = row.docKeys.filter((key) => docLinksDraftSet.value.has(key)).length
  return hit
    ? t('chat.worldManagerDocLinksFolderPartial', { hit, total: row.docKeys.length })
    : t('chat.worldManagerDocLinksFolderCount', { total: row.docKeys.length })
}

async function saveDocLinks() {
  if (!detail.value || docLinksSaving.value) return
  docLinksSaving.value = true
  docLinksError.value = ''
  try {
    const saved = await saveWorldDocLinks(detail.value.world.id, docLinksDraft.value)
    applyWorldDocLinksToMountedSessions(chatStore, detail.value.world.id, saved)
    detail.value = { ...detail.value, docLinks: saved }
    showDocLinksDialog.value = false
  } catch (err) {
    docLinksError.value = err instanceof Error ? err.message : t('chat.worldManagerDocLinksSaveFailed')
  } finally {
    docLinksSaving.value = false
  }
}
</script>

<style scoped>
.worlds-workspace-page {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
  color: var(--morandi-text);
  background: transparent;
}

.worlds-workspace-page__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 20px 26px 10px;
}

.worlds-workspace-page__header h2 {
  margin: 0;
  font-size: 22px;
  line-height: 1.2;
  font-weight: 700;
  letter-spacing: 0;
}

.worlds-workspace-page__header p {
  margin: 8px 0 0;
  color: var(--morandi-text-light);
  font-size: 13px;
  line-height: 1.45;
}

.worlds-workspace-page__close {
  width: 32px;
  height: 32px;
  flex: 0 0 32px;
  border: none;
  border-radius: 10px;
  background: transparent;
  color: rgba(104, 96, 88, 0.82);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background-color 0.18s ease, color 0.18s ease;
}

.worlds-workspace-page__close:hover {
  background: rgba(130, 153, 135, 0.08);
  color: var(--morandi-text);
}

.worlds-workspace-page__close-icon {
  width: 18px;
  height: 18px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.worlds-workspace-page__body {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  padding: 6px 26px 20px;
}

.wm-body {
  flex: 1 1 auto;
  display: flex;
  gap: 16px;
  min-height: 0;
  width: 100%;
}

.wm-list-pane {
  flex: 0 0 260px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
  padding: 14px;
  border: 1px solid color-mix(in srgb, var(--morandi-border) 18%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--morandi-card) 58%, transparent);
  overflow-y: auto;
}

.wm-list-create {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.wm-list-create-input {
  width: 100%;
  padding: 7px 9px;
  border: 1px solid var(--morandi-border);
  border-radius: 8px;
  background: var(--langhuan-dialog-input-bg, #ffffff);
  color: var(--morandi-text);
  font-size: 0.84rem;
  box-sizing: border-box;
}

.wm-list-create-btn {
  align-self: flex-end;
}

.wm-list-note,
.wm-list-error {
  margin: 0;
  padding: 4px 2px;
  font-size: 0.8rem;
  color: var(--morandi-text-light);
}

.wm-list-error {
  color: var(--morandi-danger, #C0665A);
}

.wm-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow-y: auto;
}

.wm-list-item {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  padding: 7px 9px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: none;
  color: var(--morandi-text);
  cursor: pointer;
  text-align: left;
  transition: background-color 0.14s ease, border-color 0.14s ease;
}

.wm-list-item:hover {
  background: var(--morandi-hover);
}

.wm-list-item.on {
  border-color: rgba(80, 121, 88, 0.32);
  background: color-mix(in srgb, var(--morandi-accent) 10%, var(--morandi-card));
  color: #47704a;
  font-weight: 600;
}

.wm-list-item-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}

.wm-list-item-meta {
  font-size: 0.72rem;
  color: var(--morandi-text-light);
}

.wm-detail-pane {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  border: 1px solid color-mix(in srgb, var(--morandi-border) 18%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--morandi-card) 58%, transparent);
}

.wm-detail-empty,
.wm-detail-error {
  margin: auto;
  padding: 24px 4px;
  text-align: center;
  color: var(--morandi-text-light);
  font-size: 0.86rem;
}

.wm-detail-error {
  color: var(--morandi-danger, #C0665A);
}

/* 详情头：世界名主标题 + 一行浅色概览；固定不滚，下方 wm-detail-scroll 独立滚动 */
.wm-detail-head {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 16px 18px 12px;
  border-bottom: 1px solid var(--morandi-border);
}

.wm-detail-title {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 700;
  line-height: 1.25;
  color: var(--morandi-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.wm-detail-meta {
  margin: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.78rem;
  color: var(--morandi-text-light);
}

.wm-detail-meta-dot {
  opacity: 0.5;
}

.wm-detail-scroll {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  padding: 2px 18px 16px;
}

.wm-section {
  padding: 14px 2px;
  border-bottom: 1px solid var(--morandi-border);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.wm-section:last-child {
  border-bottom: 0;
}

/* 安静的分段小标题（eyebrow 观感）：弱化后不与正文抢视觉，收敛整页噪音 */
.wm-section-title {
  margin: 0;
  font-size: 0.8rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: var(--morandi-text-light);
}

.wm-section-heading-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.wm-entity-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.wm-entity-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 7px 8px;
  border: 1px solid var(--morandi-border);
  border-radius: 8px;
}

.wm-entity-main {
  min-width: 0;
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.wm-entity-kind {
  flex: 0 0 auto;
  color: #47704a;
  font-size: 0.72rem;
}

.wm-entity-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.84rem;
  font-weight: 600;
}

.wm-entity-tags {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--morandi-text-light);
  font-size: 0.74rem;
}

.wm-entity-actions {
  flex: 0 0 auto;
  display: flex;
  gap: 6px;
}

.wm-entity-form {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.wm-entity-form .form-group:nth-last-child(2),
.wm-entity-form .wm-inline-error {
  grid-column: 1 / -1;
}

.wm-entity-form textarea {
  min-height: 180px;
  resize: vertical;
}

.wm-section-hint {
  margin: 0;
  font-size: 0.82rem;
  line-height: 1.5;
  color: var(--morandi-text-light);
}

.wm-constraint-input {
  box-sizing: border-box;
  width: 100%;
  min-height: 120px;
  margin-top: 10px;
  padding: 9px 10px;
  border: 1px solid var(--morandi-border);
  border-radius: 7px;
  background: var(--morandi-card);
  color: var(--morandi-text);
  font: inherit;
  font-size: 0.82rem;
  line-height: 1.55;
  resize: vertical;
}

.wm-constraint-input:focus {
  border-color: var(--morandi-accent);
  outline: none;
}

.wm-constraint-version {
  color: var(--morandi-text-light);
  font-size: 0.72rem;
}

.wm-section-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.wm-inline-error {
  font-size: 0.8rem;
  color: var(--morandi-danger, #C0665A);
}

.wm-delete-confirm-text {
  margin: 0;
  font-size: 0.84rem;
  line-height: 1.5;
  color: var(--morandi-text);
}

/* 地图 chips：与出场角色 chip 同一观感，替代裸项目符号列表 */
.wm-map-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.wm-map-chip {
  display: inline-flex;
  align-items: center;
  padding: 5px 11px;
  border: 1px solid var(--morandi-border);
  border-radius: 999px;
  background: var(--morandi-soft-bg);
  font-size: 0.82rem;
  color: var(--morandi-text);
  gap: 7px;
}

.wm-map-default-badge {
  color: #47704a;
  font-size: 0.72rem;
  font-weight: 650;
}

.wm-map-default-btn {
  padding: 0;
  border: none;
  background: transparent;
  color: var(--morandi-text-light);
  font: inherit;
  font-size: 0.72rem;
  cursor: pointer;
}

.wm-map-default-btn:hover {
  color: #47704a;
}

.wm-map-default-btn:disabled {
  opacity: 0.5;
  cursor: default;
}

/* 幽灵按钮：挂载现有会话 / 管理挂载等次级动作，弱底细边、低存在感 */
.wm-ghost-btn {
  align-self: flex-start;
  padding: 5px 12px;
  border: 1px solid var(--morandi-border);
  border-radius: 8px;
  background: transparent;
  color: var(--morandi-text);
  font-size: 0.82rem;
  cursor: pointer;
  transition: background-color 0.15s ease, border-color 0.15s ease;
}

.wm-ghost-btn:hover {
  background: var(--morandi-hover);
  border-color: color-mix(in srgb, var(--morandi-accent) 40%, var(--morandi-border));
}

/* 会话行内解绑 / 挂载：细边文字小按钮，视觉弱于会话名 */
.wm-row-action {
  flex: 0 0 auto;
  padding: 3px 10px;
  border: 1px solid var(--morandi-border);
  border-radius: 7px;
  background: transparent;
  color: var(--morandi-text-light);
  font-size: 0.78rem;
  cursor: pointer;
  transition: background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease;
}

.wm-row-action:hover {
  background: var(--morandi-hover);
  color: var(--morandi-text);
}

.wm-row-action--accent {
  color: #47704a;
  border-color: color-mix(in srgb, var(--morandi-accent) 45%, var(--morandi-border));
}

.wm-row-action:disabled {
  opacity: 0.5;
  cursor: default;
}

.wm-session-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.wm-session-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 6px 8px;
  border: 1px solid var(--morandi-border);
  border-radius: 8px;
  font-size: 0.84rem;
  color: var(--morandi-text);
}

.wm-session-row-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.wm-attach-panel {
  margin-top: 8px;
  padding: 8px;
  border: 1px solid var(--morandi-border);
  border-radius: 8px;
  max-height: 180px;
  overflow-y: auto;
}

.wm-character-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.wm-character-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  border: 1px solid var(--morandi-border);
  border-radius: 999px;
  background: var(--morandi-soft-bg);
  font-size: 0.82rem;
  color: var(--morandi-text);
}

.wm-character-chip-avatar {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  object-fit: cover;
}

.wm-character-chip-emoji {
  font-size: 0.9rem;
  line-height: 1;
}

/* 文档库范围：摘要与「管理挂载」同排，摘要占宽、按钮靠右 */
.wm-doclinks-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.wm-doclinks-summary {
  flex: 1 1 auto;
  min-width: 0;
}

/* 危险区（低调）：删除降到底部弱化区，不用整条大红按钮；用弱边细字 + 一句风险说明 */
.wm-danger-zone {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px 2px 2px;
}

.wm-delete-btn {
  align-self: flex-start;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 5px 12px;
  border: 1px solid color-mix(in srgb, var(--morandi-danger, #C0665A) 30%, var(--morandi-border));
  border-radius: 8px;
  background: transparent;
  color: var(--morandi-danger, #C0665A);
  font-size: 0.82rem;
  cursor: pointer;
  transition: background-color 0.15s ease, border-color 0.15s ease;
}

.wm-delete-btn:hover {
  background: color-mix(in srgb, var(--morandi-danger, #C0665A) 10%, transparent);
  border-color: color-mix(in srgb, var(--morandi-danger, #C0665A) 55%, var(--morandi-border));
}

.wm-delete-icon {
  width: 15px;
  height: 15px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.7;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.wm-danger-hint {
  font-size: 0.78rem;
  line-height: 1.5;
  color: var(--morandi-text-light);
}

/* ── 世界文档库挂载勾选树；class 名前缀 wm- 与其它弹窗隔离 ── */
.wm-doclinks-dialog {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 0;
}

.wm-doclinks-hint {
  margin: 0;
  color: var(--morandi-text-light);
  font-size: 0.84rem;
  line-height: 1.5;
}

.wm-doclinks-search {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid rgba(209, 204, 197, 0.82);
  border-radius: 8px;
  background: color-mix(in srgb, var(--morandi-card) 78%, transparent);
  color: var(--morandi-text);
  font-size: 0.86rem;
  box-sizing: border-box;
}

.wm-doclinks-search:focus {
  outline: none;
  border-color: rgba(139, 168, 158, 0.6);
  background: var(--langhuan-dialog-input-bg, #ffffff);
}

.wm-doclinks-empty {
  padding: 26px 12px;
  text-align: center;
  color: var(--morandi-text-light);
  font-size: 0.86rem;
}

.wm-doclinks-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 42vh;
  overflow-y: auto;
  padding: 2px;
}

.wm-doc-link-item {
  display: grid;
  grid-template-columns: 16px 20px minmax(0, 1fr);
  gap: 8px;
  align-items: center;
  padding: 8px 10px;
  border: 1px solid rgba(209, 204, 197, 0.82);
  border-radius: 8px;
  background: color-mix(in srgb, var(--morandi-card) 60%, transparent);
  color: var(--morandi-text);
  text-align: left;
  cursor: pointer;
  user-select: none;
}

.wm-doc-link-item:hover {
  border-color: rgba(139, 168, 158, 0.55);
}

.wm-doc-link-item.selected {
  border-color: rgba(139, 168, 158, 0.75);
  background: rgba(139, 168, 158, 0.14);
}

.wm-doc-link-item.partial {
  border-color: rgba(139, 168, 158, 0.55);
  background: rgba(139, 168, 158, 0.07);
}

.wm-doc-link-item.disabled {
  opacity: 0.55;
  cursor: default;
}

.wm-doc-link-caret {
  width: 16px;
  height: 16px;
  display: grid;
  place-items: center;
  padding: 0;
  border: none;
  background: none;
  color: var(--morandi-text-light);
  cursor: pointer;
}

.wm-doc-link-caret svg {
  width: 12px;
  height: 12px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2.2;
  stroke-linecap: round;
  stroke-linejoin: round;
  transition: transform 0.15s ease;
}

.wm-doc-link-caret.collapsed svg {
  transform: rotate(-90deg);
}

.wm-doc-link-caret:disabled {
  opacity: 0.4;
  cursor: default;
}

.wm-doc-link-caret--placeholder {
  cursor: default;
}

.wm-doc-link-check {
  width: 18px;
  height: 18px;
  display: grid;
  place-items: center;
  border: 1px solid rgba(209, 204, 197, 0.95);
  border-radius: 5px;
  background: var(--langhuan-dialog-input-bg, #ffffff);
}

.wm-doc-link-check svg {
  width: 12px;
  height: 12px;
  fill: none;
  stroke: transparent;
  stroke-width: 2.4;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.wm-doc-link-item.selected .wm-doc-link-check {
  border-color: var(--morandi-green);
  background: var(--morandi-green);
}

.wm-doc-link-item.selected .wm-doc-link-check svg {
  stroke: #fff;
}

.wm-doc-link-item.partial .wm-doc-link-check {
  border-color: var(--morandi-green);
}

.wm-doc-link-item.partial .wm-doc-link-check svg {
  stroke: var(--morandi-green);
}

.wm-doc-link-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.wm-doc-link-text strong {
  font-size: 0.88rem;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.wm-doc-link-text em {
  font-style: normal;
  font-size: 0.78rem;
  color: var(--morandi-text-light);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
