<template>
  <Teleport to="body">
    <div v-show="open" class="script-workspace-overlay" @pointerdown.capture="overlayGuard.handleOverlayPointerDown" @click.self="handleOverlayClick">
      <section class="script-workspace" role="dialog" aria-modal="true" aria-label="剧本工作台" @click.stop="closeRowMenu">
        <nav class="script-workspace__rail" :aria-label="t('chat.openScriptWorkspace')">
          <button
            v-if="embedXingyi && scriptwriterCollapsed"
            type="button"
            class="script-workspace__rail-item script-workspace__agent-expand"
            :title="t('workspaceAgent.expandPanel', { name: '编剧' })"
            :aria-label="t('workspaceAgent.expandPanel', { name: '编剧' })"
            aria-expanded="false"
            @click="scriptwriterCollapsed = false"
          >
            <svg class="line-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M9 3v18M14 9l3 3-3 3" />
            </svg>
          </button>
          <span class="script-workspace__rail-brand" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z"></path><path d="M8 7h8M8 11h6"></path></svg>
          </span>
          <button
            v-for="zone in zones"
            :key="zone.key"
            type="button"
            class="script-workspace__rail-item"
            :class="{ 'is-active': activeZone === zone.key }"
            :title="t(`orchestration.zones.${zone.key}`)"
            :aria-label="t(`orchestration.zones.${zone.key}`)"
            @click="activeZone = zone.key"
          >
            <svg class="line-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" v-html="zone.iconInner"></svg>
          </button>
        </nav>

        <div class="script-workspace__main-col">
          <header class="script-workspace__head">
            <div class="script-workspace__title">
              <strong>{{ t('chat.scriptWorkspace') }}</strong>
              <span class="script-workspace__meta">
                <b>{{ worldName || '当前对话尚未挂载世界' }}</b>
              </span>
            </div>
            <span class="script-workspace__truth-badge">世界真值</span>
            <button type="button" class="script-workspace__icon-btn" aria-label="关闭剧本工作台" @click="emit('close')">
              <svg class="line-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg>
            </button>
          </header>

          <div class="script-workspace__body">
            <aside
              v-if="embedXingyi"
              class="script-workspace__xingyi"
              :class="{ 'script-workspace__xingyi--collapsed': scriptwriterCollapsed }"
              :style="scriptwriterCollapsed ? undefined : xingyiPanelStyle"
              aria-label="编剧协作栏"
            >
              <WorkspaceAgentShell
                :key="scriptwriterViewScopeKey"
                v-model:collapsed="scriptwriterCollapsed"
                :scope-key="scriptwriterViewScopeKey"
                agent-kind="scriptwriter"
                :target-id="worldId"
                title="编剧"
                :identity-label="`编剧 · ${worldName || '未加入世界'}`"
                :enabled="scriptwriterAvailable"
                :active="open"
                unavailable-text="请先把当前对话加入一个世界，再和编剧讨论。"
                :runner="scriptwriterRunner"
              />
            </aside>
            <button v-if="embedXingyi && !scriptwriterCollapsed" type="button" class="script-workspace__xingyi-resize" title="拖动调整编剧对话框宽度" aria-label="拖动调整编剧对话框宽度" @pointerdown.prevent="startXingyiResize"></button>

            <main class="script-workspace__zones" :class="{ 'is-seeds': activeZone === 'seeds' }">
              <template v-if="loading">
                <!-- 加载骨架屏（2026-07-16）：贴着实际叙事种子区两栏排版摆位——左列头两条工具条+若干种子行，
                     右列标题+标签+段落条，光带扫效果与聊天区/编排审计面板同一份公式（同联动·后续统一改需同步）。 -->
                <section class="seed-sidebar script-skeleton">
                  <div class="sk script-skeleton__bar" style="height:29px;margin:8px 10px 0"></div>
                  <div class="sk script-skeleton__bar" style="height:29px;margin:8px 10px 6px"></div>
                  <div v-for="n in 5" :key="n" class="script-skeleton__row">
                    <div class="sk script-skeleton__ring"></div>
                    <div class="script-skeleton__row-body">
                      <div class="sk script-skeleton__line" style="width:72%"></div>
                      <div class="sk script-skeleton__line" style="width:46%;height:9px"></div>
                    </div>
                  </div>
                </section>
                <section class="seed-detail script-skeleton">
                  <div class="sk script-skeleton__line" style="width:52%;height:21px;margin-bottom:14px"></div>
                  <div class="script-skeleton__tags">
                    <div class="sk" style="width:46px;height:17px;border-radius:5px"></div>
                    <div class="sk" style="width:46px;height:17px;border-radius:99px"></div>
                  </div>
                  <div class="sk script-skeleton__line" style="width:28%;height:10px;margin:22px 0 8px"></div>
                  <div class="sk" style="height:60px;border-radius:8px"></div>
                  <div class="sk script-skeleton__line" style="width:22%;height:10px;margin:22px 0 8px"></div>
                  <div class="script-skeleton__grid">
                    <div class="sk" style="height:56px;border-radius:8px"></div>
                    <div class="sk" style="height:56px;border-radius:8px"></div>
                  </div>
                </section>
              </template>
              <div v-else-if="activeZone === 'seeds' && !worldId" class="script-empty-state">
                 <strong>这个对话还没有世界</strong><span>剧本种子是世界级真值，请先把对话挂到一个世界。</span>
               </div>
               <template v-else-if="activeZone !== 'seeds'">
                <ScriptOrchestrationZone
                  v-if="workspaceProjection && directorProjection"
                  :zone="activeZone"
                  :workspace="workspaceProjection"
                  :director="directorProjection"
                  :map-sheets="worldMapSheets"
                  :default-map-sheet-id="worldDefaultMapSheetId"
                  :busy="commandBusy"
                  @command="executeWorkspaceCommand"
                  @refresh="loadWorkspace"
                  @open-status="openStatusSystem"
                  @open-map="openMapViewer"
                  @select-zone="activeZone = $event"
                />
                <div v-else class="script-empty-state"><strong>统一编排投影暂不可用</strong><span>刷新后仍失败时，请检查会话权限与服务端状态。</span></div>
              </template>
              <template v-else>
                <section class="seed-sidebar">
                  <div v-if="seedMultiSelect.selectionMode.value" class="seed-bulk-bar">
                    <span>已选 {{ seedMultiSelect.selectedIds.value.length }} 条</span>
                    <button type="button" class="seed-bulk-bar__cancel" @click="seedMultiSelect.clearSelection()">取消</button>
                    <button type="button" class="seed-bulk-bar__delete" @click="requestBulkDelete">删除</button>
                  </div>
                  <div class="seed-toolbar">
                    <label><span class="sr-only">搜索种子</span><input v-model.trim="searchText" placeholder="搜索标题、地点或进展" /></label>
                    <div class="seed-filter-row">
                      <select v-model="statusFilter" aria-label="按状态筛选"><option value="">全部状态</option><option v-for="item in statuses" :key="item" :value="item">{{ statusLabel(item) }}</option></select>
                      <select v-model="typeFilter" aria-label="按类型筛选"><option value="">全部类型</option><option v-for="item in types" :key="item" :value="item">{{ typeLabel(item) }}</option></select>
                    </div>
                    <button type="button" class="primary-action" @click="beginCreate">新建种子</button>
                  </div>
                  <div class="seed-list" role="list">
                    <button
                      v-for="seed in filteredSeeds"
                      :key="seed.id"
                      type="button"
                      class="seed-row"
                      :class="{ 'is-active': seed.id === selectedId, 'is-checked': seedMultiSelect.isSelected(seed.id) }"
                      @click="onSeedRowClick($event, seed.id)"
                      @contextmenu.prevent="openRowMenu($event, seed.id)"
                    >
                      <span
                        class="seed-row__check"
                        :class="{ 'is-visible': seedMultiSelect.selectionMode.value || seedMultiSelect.isSelected(seed.id) }"
                        role="checkbox"
                        :aria-checked="seedMultiSelect.isSelected(seed.id)"
                        aria-label="选中该条种子"
                        @click.stop="seedMultiSelect.toggleSelected(seed.id)"
                      >
                        <svg v-if="seedMultiSelect.isSelected(seed.id)" class="line-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"></path></svg>
                      </span>
                      <span class="seed-row__ring" :title="`进度阶段 ${progressPercent(seed)}`">
                        <svg viewBox="0 0 30 30"><circle class="ring-bg" cx="15" cy="15" r="12.5" pathLength="100" /><circle class="ring-fg" cx="15" cy="15" r="12.5" pathLength="100" :stroke-dasharray="`${progressPercent(seed)} 100`" /></svg>
                        <b>{{ progressPercent(seed) }}</b>
                      </span>
                      <span class="seed-row__body">
                        <span class="seed-row__line1"><span class="seed-row__type">{{ typeLabel(seed.type) }}</span><strong>{{ seed.title }}</strong></span>
                        <small><i class="seed-row__status-dot" :class="statusDotClass(seed.status)"></i>{{ statusLabel(seed.status) }}<template v-if="seed.locationText"> · {{ seed.locationText }}</template></small>
                      </span>
                    </button>
                    <p v-if="!filteredSeeds.length" class="seed-list__empty">当前筛选下没有种子。</p>
                  </div>
                </section>

                <div v-if="rowMenu.open" class="row-context-menu" :style="{ left: rowMenu.x + 'px', top: rowMenu.y + 'px' }">
                  <button type="button" @click="menuSave">保存</button>
                  <button type="button" class="is-danger" @click="menuDelete">{{ rowMenuDeleteLabel }}</button>
                </div>

                <section class="seed-detail">
                  <p v-if="notice" class="script-notice" :class="{ 'is-error': noticeError }">{{ notice }}</p>
                  <div v-if="!draft" class="script-empty-state"><strong>选择一条种子</strong><span>查看因果、关系、时间地点、进展和完整变更历史。</span></div>
                  <template v-else>
                    <header class="seed-detail__head">
                      <div class="seed-detail__title-row">
                        <input v-model="draft.title" class="seed-detail__title-input" maxlength="120" placeholder="未命名种子" aria-label="种子标题" />
                        <button v-if="isCreating" type="button" class="primary-action" @click="requestSave">保存</button>
                      </div>
                      <div class="seed-detail__tags">
                        <select v-model="draft.type" class="tag-select type-tag" aria-label="种子类型"><option v-for="item in types" :key="item" :value="item">{{ typeLabel(item) }}</option></select>
                        <select v-model="draft.status" class="tag-select status-pill" :class="statusDotClass(draft.status)" aria-label="种子状态"><option v-for="item in statuses" :key="item" :value="item">{{ statusLabel(item) }}</option></select>
                        <span class="seed-detail__version">{{ isCreating ? 'NEW SEED' : `v${draft.version || 1}` }}</span>
                      </div>
                    </header>

                    <div class="field-group">
                      <div class="fg-title">叙事描述</div>
                      <textarea v-model="draft.description" class="plain-field" rows="3"></textarea>
                    </div>

                    <section class="detail-group">
                      <h3>进展</h3>
                      <div class="field-grid-2">
                        <div class="field-row"><div class="f-label">起因</div><textarea v-model="draft.cause" class="plain-field" rows="3"></textarea></div>
                        <div class="field-row"><div class="f-label">当前进展</div><textarea v-model="draft.currentProgress" class="plain-field" rows="3"></textarea></div>
                        <div class="field-row"><div class="f-label">期待兑现</div><textarea v-model="draft.expectedOutcome" class="plain-field" rows="3"></textarea></div>
                      </div>
                    </section>

                    <section class="detail-group">
                      <h3>时间与地点</h3>
                      <div class="field-grid-2">
                        <div class="field-row"><div class="f-label">开始时间</div><input v-model="draft.startTime" class="plain-field" placeholder="ISO 时间或完整世界内时间" /></div>
                        <div class="field-row"><div class="f-label">地点文字</div><input v-model="draft.locationText" class="plain-field" placeholder="大地点/中地点/小地点" /></div>
                        <div class="field-row"><div class="f-label">地图要素 ID</div><input v-model="draft.mapFeatureId" class="plain-field" /></div>
                        <div class="field-row" style="grid-column:1/-1"><div class="f-label">影响范围</div><input v-model="draft.impactScope" class="plain-field" /></div>
                      </div>
                    </section>

                    <section class="detail-group">
                      <div class="detail-group__head"><h3>关系与知情边界</h3><button type="button" class="olive-action" @click="addLink">添加关系</button></div>
                      <div v-for="(link, index) in draft.links" :key="link.id || index" class="relation-row">
                        <select v-model="link.relationType" class="plain-select"><option v-for="item in linkTypes" :key="item" :value="item">{{ linkLabel(item) }}</option></select>
                        <select v-model="link.targetSeedId" class="plain-select"><option value="">选择目标种子</option><option v-for="seed in relationTargets" :key="seed.id" :value="seed.id">{{ seed.title }}</option></select>
                        <button type="button" class="icon-button" aria-label="删除关系" @click="draft.links.splice(index, 1)">
                          <svg class="line-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg>
                        </button>
                      </div>
                      <div class="field-grid-2" style="margin-top:8px">
                        <div class="field-row"><div class="f-label">可见性</div><select v-model="draft.visibilityMode" class="plain-field"><option v-for="item in visibilityModes" :key="item" :value="item">{{ visibilityLabel(item) }}</option></select></div>
                        <label class="check-label"><input v-model="draft.allowFrontstage" type="checkbox" /><span>允许影响当前帷幕时进入前台</span></label>
                      </div>
                    </section>

                    <section v-if="!isCreating" class="detail-group history-group">
                      <h3>变更历史</h3>
                      <ol v-if="draft.events?.length" class="history-list">
                        <li v-for="event in [...draft.events].reverse()" :key="event.id"><time>{{ formatTime(event.createdAt) }}</time><b>{{ eventLabel(event.eventType) }}</b><p>{{ event.evidenceSummary || summarizeDiff(event.diffJson || event.diff) }}</p></li>
                      </ol>
                      <p v-else class="seed-list__empty">暂无变更记录。</p>
                    </section>
                  </template>
                </section>

              </template>
            </main>
          </div>
        </div>
      </section>
      <AppConfirmDialog v-if="confirmState.open" :open="confirmState.open" :title="confirmState.title" :message="confirmState.message" :confirm-text="confirmState.confirmText" :tone="confirmState.tone" @confirm="performConfirmedAction" @cancel="closeConfirm" />
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import AppConfirmDialog from '../../common/AppConfirmDialog.vue'
import ScriptOrchestrationZone from './ScriptOrchestrationZone.vue'
import WorkspaceAgentShell from '../workspaceAgent/WorkspaceAgentShell.vue'
import { createOverlayDismissGuard } from '../../../utils/overlayDismissGuard'
import {
  NARRATIVE_SEEDS_EXTERNAL_UPDATED_EVENT,
  type NarrativeSeedsExternalUpdatedDetail
} from '../../../app/narrativeSeedWorkspaceEvents'
import { useResizablePanel } from '../../../composables/app/useResizablePanel'
import { useMultiSelect } from '../../../composables/useMultiSelect'
import { STATUS_SYSTEM_EXTERNAL_UPDATED_EVENT } from '../../../app/xingyiStatusSystemTools'
import {
  executeOrchestrationCommands,
  fetchChatSessionBundleById,
  fetchNarrativeSeedDetail,
  fetchNarrativeSeeds,
  syncNarrativeSeedTimeGates,
  fetchOrchestrationWorkspaceProjection,
  fetchWorldMapBundle,
  createNarrativeSeed,
  updateNarrativeSeed,
  deleteNarrativeSeed
} from '../../../repositories/chatRepository'
import { pickNarrativeSeedAuthorFields, validateCompleteNarrativeSeedAuthoring } from '../../../../shared/narrativeSeedAuthoring'
import type { DirectorOrchestrationProjection, OrchestrationCommandEnvelope, OrchestrationCommandName, OrchestrationTargetRef, OrchestrationWorkspaceProjection } from '../../../../shared/orchestrationWorkspace'
import { buildScriptwriterScopeKey, createScopeConfirmWriteChannel } from '../../../app/workspaceAgentScopeState'
import type { WorkspaceAgentTurnRunner } from '../../../composables/useWorkspaceAgentController'
import { runScriptwriterAgent } from '../../../app/scriptwriterAgentHarness'
import { loadRenderedAgentContext } from '../../../app/agentContext/agentContextProvider'
import { useAI } from '../../../composables/useAI'
import { useSettingStore } from '../../../stores/settingStore'
import { buildAgentConversationModelAiOptions } from '../../../app/agentConversationModelSelection'
import { toOpenAiTools } from '../../../app/agentRuntime/toolRegistry'

const props = defineProps<{ open: boolean; sessionId: string }>()
const emit = defineEmits<{ (event: 'close'): void; (event: 'open-status', hostId: string): void; (event: 'open-map'): void; (event: 'curtain-saved', sessionId: string): void }>()
const { t } = useI18n()
const types = ['foreshadow','countdown','offscreen_process','threat_or_opportunity','promise_or_debt','relationship_change','world_change']
const statuses = ['dormant','active','ready_to_trigger','pending_effect','triggered','resolved','expired','stalled','review_required','transformed']
const linkTypes = ['depends_on','conflicts_with','caused_by','transforms_into','replaces']
const visibilityModes = ['director_only','participants','public','custom']
const typeLabels: Record<string,string> = { foreshadow:'伏笔',countdown:'倒计时',offscreen_process:'幕后进程',threat_or_opportunity:'威胁/机会',promise_or_debt:'承诺/债务',relationship_change:'关系变化',world_change:'世界变化' }
const statusLabels: Record<string,string> = { dormant:'潜伏',active:'推进中',ready_to_trigger:'待引爆',pending_effect:'待核验',triggered:'已触发',resolved:'已兑现',expired:'已超期',stalled:'停滞',review_required:'待审查',transformed:'已转化' }
const linkLabels: Record<string,string> = { depends_on:'依赖',conflicts_with:'冲突',caused_by:'由其导致',transforms_into:'转化为',replaces:'替代' }
const visibilityLabels: Record<string,string> = { director_only:'仅提调',participants:'相关参与者',public:'公开',custom:'自定义' }
const eventLabels: Record<string,string> = { created:'创建',updated:'修改',status_changed:'状态变化',time_gate_reached:'时间门越过',progress_recorded:'进展记录',predicted_effect:'预计影响',fact_committed:'事实提交',migrated:'旧本迁移',review_flagged:'标记审查',transformed:'转化' }

type ZoneKey = 'overview' | 'roles' | 'statusbar' | 'seeds' | 'timeline'
const zones: Array<{ key: ZoneKey; label: string; iconInner: string; placeholder: string }> = [
  { key: 'overview', label: '总览', iconInner: '<rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="3" width="8" height="5" rx="1"/><rect x="13" y="11" width="8" height="10" rx="1"/><rect x="3" y="14" width="8" height="7" rx="1"/>', placeholder: '' },
  { key: 'roles', label: '角色与登退场', iconInner: '<path d="M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2"/><circle cx="10" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>', placeholder: '' },
  { key: 'statusbar', label: '状态栏', iconInner: '<rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11h4"/><path d="M12 16h4"/><path d="M8 11h.01"/><path d="M8 16h.01"/>', placeholder: '' },
  { key: 'seeds', label: '叙事种子', iconInner: '<path d="M12 22v-9"/><path d="M12 13c-3 0-6-2-6-6 4 0 6 2 6 4"/><path d="M12 11c0-4 2.5-7 7-7 0 5-2 8-7 7z"/>', placeholder: '' },
  { key: 'timeline', label: '时间线', iconInner: '<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/><path d="M12 8v4l3 2"/>', placeholder: '' }
]
const activeZone = ref<ZoneKey>('overview')
const activeZoneMeta = computed(() => zones.find((zone) => zone.key === activeZone.value) || zones[3])

const { panelStyle: xingyiPanelStyle, startResize: startXingyiResize } = useResizablePanel({
  storageKey: 'langhuan_script_workspace_xingyi_width',
  defaultWidth: 340,
  minWidth: 260,
  maxWidth: 480
})
const scriptwriterCollapsed = ref(false)
const overlayGuard = createOverlayDismissGuard()
const embedXingyi = ref(typeof window === 'undefined' || window.innerWidth > 1050)
const loading = ref(false); const worldId = ref(''); const worldName = ref(''); const seeds = ref<any[]>([])
const worldMapSheets = ref<Array<{ id: string; name: string }>>([])
const worldDefaultMapSheetId = ref('')
const workspaceProjection = ref<OrchestrationWorkspaceProjection | null>(null)
const directorProjection = ref<DirectorOrchestrationProjection | null>(null)
const commandBusy = ref(false)
const selectedId = ref(''); const draft = ref<any | null>(null); const isCreating = ref(false)
const searchText = ref(''); const statusFilter = ref(''); const typeFilter = ref('')
const notice = ref(''); const noticeError = ref(false)
const confirmState = reactive<{ open:boolean; action:'save'|'delete'|'bulk-delete'|''; title:string; message:string; confirmText:string; tone:'default'|'danger'|'warning' }>({ open:false,action:'',title:'',message:'',confirmText:'确认',tone:'default' })
const rowMenu = reactive({ open:false, x:0, y:0, seedId:'' })

// 编剧独立loop（地图与剧本工作区专业Agent计划批B）：不再借用星依 XingyiDock portal，
// 直接跑 runScriptwriterAgent（不经过 runXingyiAgent/dispatchScriptwriter）。
const ai = useAI()
const settingStore = useSettingStore()
const scriptwriterScopeKey = computed(() => buildScriptwriterScopeKey(worldId.value))
const scriptwriterAvailable = computed(() => Boolean(worldId.value))
const scriptwriterViewScopeKey = computed(() => scriptwriterAvailable.value
  ? scriptwriterScopeKey.value
  : 'scriptwriter:unavailable')
// 编剧种子快照缓存（地图与剧本工作区专业Agent计划批C）：消灭每轮 N+1 取种子（40种子=41请求/条消息）。
// 口径不变——仍是「≤50全量详情/>50精简摘要」，只是跨轮复用同一份快照；命中过期由三处失效点负责：
// ①agent写成功onSeedsChanged ②外部更新事件handleNarrativeSeedsExternalUpdated ③世界切换。
let seedsForAgentCache: { worldId: string; seeds: any[] } | null = null
const scriptwriterRunner: WorkspaceAgentTurnRunner = async ({
  userText,
  history,
  signal,
  turnStream,
  initialTaskTodo,
  initialDeferredActiveTools,
  onDeferredActiveToolsChange,
  onTaskTodoChange,
  modelSelection
}) => {
  if (!worldId.value) throw new Error('当前对话还没有世界，无法调用编剧')
  const sessionId = String(props.sessionId || '').trim()
  if (!sessionId) throw new Error('编剧缺少正式会话作用域，无法加载统一原始可见上下文')
  let seedsForAgent: any[]
  if (seedsForAgentCache && seedsForAgentCache.worldId === worldId.value) {
    seedsForAgent = seedsForAgentCache.seeds
  } else {
    const list = await fetchNarrativeSeeds(worldId.value)
    // 种子数≤50时全量拉详情（现状不变）；>50时只送精简摘要（缺participants/links），
    // 编剧要改/删某条前用 readNarrativeSeedDetail 按需读——见 scriptwriterAgentHarness.ts。
    seedsForAgent = list.length > 50
      ? list
      : await Promise.all(list.map((item) => fetchNarrativeSeedDetail(worldId.value, item.id).catch(() => item)))
    seedsForAgentCache = { worldId: worldId.value, seeds: seedsForAgent }
  }
  const agentConfig = settingStore.getBrainAgentConfig?.() || null
  let contextBlock = ''
  try {
    contextBlock = (await loadRenderedAgentContext({
      sessionId,
      agentKind: 'scriptwriter_workspace',
      userText
    })).text
  } catch (error) {
    throw new Error(`编剧统一原始可见上下文加载失败：${error instanceof Error ? error.message : String(error)}`)
  }
  const result = await runScriptwriterAgent({
    userText,
    history,
    contextBlock,
    worldId: worldId.value,
    seeds: seedsForAgent,
    fetchSeedDetail: (seedId: string) => fetchNarrativeSeedDetail(worldId.value, seedId),
    sourceSessionId: sessionId,
    confirmWrite: createScopeConfirmWriteChannel(scriptwriterScopeKey.value, 'scriptwriter', worldId.value),
    writeApi: { createNarrativeSeed, updateNarrativeSeed, deleteNarrativeSeed },
    onSeedsChanged: () => {
      seedsForAgentCache = null
      window.dispatchEvent(new CustomEvent(NARRATIVE_SEEDS_EXTERNAL_UPDATED_EVENT, { detail: { worldId: worldId.value } }))
    },
    signal,
    turnStream,
    initialTaskTodo,
    initialDeferredActiveTools,
    onDeferredActiveToolsChange,
    onTaskTodoChange,
    callOrchestrator: async ({ messages, toolBriefs }) => {
      const response = await ai.callAIWithTools(messages as never, {
        ...buildAgentConversationModelAiOptions(agentConfig as never, modelSelection, { maxTokens: 4096, temperature: 0.55, thinking: 'enabled' }),
        tools: toOpenAiTools(toolBriefs),
        feature: 'agent',
        logLabel: 'scriptwriter-workspace',
        usageLabel: '编剧(工作区独立会话)',
        placeLabel: worldName.value || '编剧',
        sessionId,
        sessionLabel: '编剧',
        signal
      })
      return { content: response?.content ?? '', toolCalls: response?.toolCalls ?? [] }
    }
  })
  return { reply: result.reply, terminalReason: result.terminalReason }
}

const filteredSeeds = computed(() => seeds.value.filter((seed) => (!statusFilter.value || seed.status === statusFilter.value) && (!typeFilter.value || seed.type === typeFilter.value) && (!searchText.value || `${seed.title} ${seed.locationText || ''} ${seed.currentProgress || ''}`.toLocaleLowerCase().includes(searchText.value.toLocaleLowerCase()))))
// 叙事种子多选（2026-07-16）：复用侧栏同款 useMultiSelect——Ctrl/Cmd 单选切换、Shift 范围选，
// 普通点击不经过它（见 onSeedRowClick），避免每次「点一下查看详情」都误入多选态。
const seedMultiSelect = useMultiSelect({
  getOrderedIds: () => filteredSeeds.value.map((seed) => seed.id),
  getResetKey: () => worldId.value
})
const relationTargets = computed(() => seeds.value.filter((seed) => seed.id !== draft.value?.id))
const rowMenuDeleteLabel = computed(() => {
  const count = seedMultiSelect.isSelected(rowMenu.seedId) ? seedMultiSelect.selectedIds.value.length : 1
  return count > 1 ? `删除 ${count} 条` : '删除'
})
function typeLabel(value:string){ return typeLabels[value] || value }
function statusLabel(value:string){ return statusLabels[value] || value }
function linkLabel(value:string){ return linkLabels[value] || value }
function visibilityLabel(value:string){ return visibilityLabels[value] || value }
function eventLabel(value:string){ return eventLabels[value] || value }
function formatTime(value:unknown){ const d = new Date(String(value || '')); return Number.isNaN(d.getTime()) ? String(value || '') : d.toLocaleString() }
function summarizeDiff(value:unknown){ try { const parsed = typeof value === 'string' ? JSON.parse(value) : value; const keys = parsed && typeof parsed === 'object' ? Object.keys(parsed as object) : []; return keys.length ? `变更：${keys.join('、')}` : '已记录' } catch { return '已记录' } }
function progressPercent(seed:any){ return ['resolved','transformed'].includes(seed.status) ? 100 : seed.status === 'triggered' ? 75 : seed.status === 'ready_to_trigger' ? 60 : seed.status === 'active' ? 45 : seed.status === 'pending_effect' ? 25 : 10 }
// 纯展示映射：只把现役 status 值分到 4 挡颜色，不引入第二份状态真值
function statusDotClass(status:string){
  if (['resolved','transformed'].includes(status)) return 'is-closed'
  if (['active','triggered'].includes(status)) return 'is-active'
  if (['ready_to_trigger','pending_effect','review_required'].includes(status)) return 'is-pending'
  if (['expired','stalled'].includes(status)) return 'is-overdue'
  return 'is-dormant'
}
function emptyDraft(){ return { type:'foreshadow',title:'',description:'',cause:'',currentProgress:'',expectedOutcome:'',startTime:'',mapFeatureId:'',locationText:'',impactScope:'',status:'dormant',visibilityMode:'director_only',allowFrontstage:false,participants:[],links:[],events:[],version:1 } }
function setNotice(message:string,error=false){ notice.value=message; noticeError.value=error }

async function loadWorkspace(){
  loading.value=true; setNotice(''); worldId.value=''; worldName.value=''; seeds.value=[]; worldMapSheets.value=[]; worldDefaultMapSheetId.value=''; workspaceProjection.value=null; directorProjection.value=null
  try {
    const [bundle, projection] = await Promise.all([fetchChatSessionBundleById(props.sessionId, { limit: 1 }), fetchOrchestrationWorkspaceProjection(props.sessionId)])
    const session:any = bundle.session || {}
    worldId.value=String(session.worldId ?? session.world_id ?? projection.workspace.scope.worldId ?? '').trim()
    worldName.value=String(session.worldName ?? session.world_name ?? '')
    workspaceProjection.value=projection.workspace; directorProjection.value=projection.director
    if (worldId.value) {
      const [items,mapBundle]=await Promise.all([
        fetchNarrativeSeeds(worldId.value),
        fetchWorldMapBundle(worldId.value).catch(() => null)
      ])
      seeds.value=items
      worldMapSheets.value=(mapBundle?.sheets || []).map((sheet)=>({id:String(sheet.id),name:String(sheet.name || sheet.id)}))
      worldDefaultMapSheetId.value=String(mapBundle?.defaultMapSheetId || '')
      worldName.value=worldName.value || String(mapBundle?.world?.name || '')
      if (seeds.value[0]) await selectSeed(seeds.value[0].id)
    }
  } catch (error) { setNotice(error instanceof Error ? error.message : '读取剧本失败', true) }
  finally { loading.value=false }
}
async function refreshProjection(){
  try { const projection=await fetchOrchestrationWorkspaceProjection(props.sessionId); workspaceProjection.value=projection.workspace; directorProjection.value=projection.director }
  catch(error){ setNotice(error instanceof Error ? error.message : '刷新统一编排投影失败',true) }
}
async function executeWorkspaceCommand(request:{command:OrchestrationCommandName;targetRef:OrchestrationTargetRef;expectedVersion:number;evidenceSummary:string;payload:Record<string,unknown>}){
  if(!workspaceProjection.value || commandBusy.value) return
  commandBusy.value=true; setNotice('')
  try {
    await runWorkspaceCommands([request])
    await refreshProjection()
    if(request.command === 'updateCurtainScene') emit('curtain-saved', props.sessionId)
    setNotice('已写入正式编排真值。')
  }
  catch(error){ setNotice(error instanceof Error ? error.message : '编排操作失败，请刷新后重试',true); await refreshProjection() }
  finally { commandBusy.value=false }
}
async function runWorkspaceCommands(requests:Array<{command:OrchestrationCommandName;targetRef:OrchestrationTargetRef;expectedVersion:number;evidenceSummary:string;payload:Record<string,unknown>}>){
  if(!workspaceProjection.value) throw new Error('统一编排投影尚未就绪')
  const nonce=`${Date.now()}:${Math.random().toString(36).slice(2)}`
  const operations:OrchestrationCommandEnvelope[]=requests.map((request,index)=>({...request,sessionId:props.sessionId,worldId:workspaceProjection.value!.scope.worldId,idempotencyKey:`workspace:${request.command}:${nonce}:${index}`,source:{evidenceSummary:request.evidenceSummary}}))
  return executeOrchestrationCommands(props.sessionId,operations)
}
function openStatusSystem(hostId:string){ emit('open-status',hostId); emit('close') }
function openMapViewer(){ emit('open-map') }
async function selectSeed(id:string){ selectedId.value=id; isCreating.value=false; try { draft.value=await fetchNarrativeSeedDetail(worldId.value,id) } catch(error){ setNotice(error instanceof Error ? error.message : '读取种子失败',true) } }
async function refreshNarrativeSeeds(){
  const previousSelectedId=selectedId.value
  const items=await fetchNarrativeSeeds(worldId.value)
  seedMultiSelect.clearSelection()
  seeds.value=items
  if(isCreating.value) return
  const nextSelectedId=items.some((seed)=>seed.id===previousSelectedId) ? previousSelectedId : String(items[0]?.id || '')
  if(nextSelectedId) await selectSeed(nextSelectedId)
  else { selectedId.value=''; draft.value=null }
}
function onSeedRowClick(event:MouseEvent,id:string){
  if(event.ctrlKey || event.metaKey || event.shiftKey){ seedMultiSelect.handleItemClick({ id, event }); return }
  if(seedMultiSelect.selectionMode.value) seedMultiSelect.clearSelection()
  void selectSeed(id)
}
function beginCreate(){ selectedId.value=''; isCreating.value=true; draft.value=emptyDraft(); setNotice('') }
function openRowMenu(event:MouseEvent,id:string){
  if(!seedMultiSelect.isSelected(id)) seedMultiSelect.selectOnly(id)
  Object.assign(rowMenu,{ open:true, x:event.clientX, y:event.clientY, seedId:id })
}
function closeRowMenu(){ rowMenu.open=false }
async function menuSave(){ const id=rowMenu.seedId; closeRowMenu(); if(selectedId.value!==id) await selectSeed(id); requestSave() }
async function menuDelete(){
  const id=rowMenu.seedId
  const deleteSelection=seedMultiSelect.isSelected(id) && seedMultiSelect.selectedIds.value.length>1
  closeRowMenu()
  if(deleteSelection){ requestBulkDelete(); return }
  if(selectedId.value!==id) await selectSeed(id)
  requestDelete()
}
function addLink(){ draft.value?.links.push({ relationType:'caused_by',targetSeedId:'' }) }
function requestSave(){ const errors=validateCompleteNarrativeSeedAuthoring(draft.value || {}); if(errors.length) return setNotice(`请先补全必填字段：${errors.join('；')}`,true); Object.assign(confirmState,{open:true,action:'save',title:isCreating.value?'创建叙事种子':'保存种子修改',message:'这会写入当前世界的唯一剧本真值，并记录变更历史。',confirmText:isCreating.value?'创建':'保存',tone:'default'}) }
function requestDelete(){ Object.assign(confirmState,{open:true,action:'delete',title:'删除叙事种子',message:'种子、关系与变更历史会一起删除，此操作不可撤销。',confirmText:'删除',tone:'danger'}) }
function requestBulkDelete(){ const count=seedMultiSelect.selectedIds.value.length; if(!count) return; Object.assign(confirmState,{open:true,action:'bulk-delete',title:'批量删除叙事种子',message:`将删除 ${count} 条种子及其关系与变更历史，此操作不可撤销。`,confirmText:`删除 ${count} 条`,tone:'danger'}) }
function closeConfirm(){ confirmState.open=false; confirmState.action='' }
async function performConfirmedAction(){ const action=confirmState.action; closeConfirm(); try {
  if(action==='save'){
    const authorFields=pickNarrativeSeedAuthorFields(draft.value || {})
    const payload={...authorFields,links:(Array.isArray(authorFields.links)?authorFields.links:[]).filter((link:any)=>link.targetSeedId),lastModifiedSource:'user',sourceSessionId:props.sessionId}
    const seedId=isCreating.value ? `seed_${typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}_${Math.random().toString(36).slice(2)}`}` : draft.value.id
    await runWorkspaceCommands([{command:isCreating.value?'createNarrativeSeed':'updateNarrativeSeed',targetRef:{kind:'narrative_seed',seedId},expectedVersion:isCreating.value?0:Number(draft.value.version),evidenceSummary:isCreating.value?'用户在剧本工作台创建叙事种子':'用户在剧本工作台修改叙事种子',payload}])
    seeds.value=await fetchNarrativeSeeds(worldId.value); await refreshProjection(); await selectSeed(seedId); setNotice('已写入世界剧本真值。')
  } else if(action==='delete'){
    await runWorkspaceCommands([{command:'deleteNarrativeSeed',targetRef:{kind:'narrative_seed',seedId:draft.value.id},expectedVersion:Number(draft.value.version),evidenceSummary:'用户在剧本工作台删除叙事种子',payload:{}}]); seeds.value=await fetchNarrativeSeeds(worldId.value); await refreshProjection(); draft.value=null; selectedId.value=''; if(seeds.value[0]) await selectSeed(seeds.value[0].id); setNotice('种子已删除。')
  } else if(action==='bulk-delete'){
    const ids=[...seedMultiSelect.selectedIds.value]
    const requests=ids.map((id)=>{const target=seeds.value.find((seed)=>seed.id===id); return target ? {command:'deleteNarrativeSeed' as const,targetRef:{kind:'narrative_seed' as const,seedId:id},expectedVersion:Number(target.version),evidenceSummary:'用户在剧本工作台批量删除叙事种子',payload:{}} : null}).filter(Boolean) as Array<{command:'deleteNarrativeSeed';targetRef:{kind:'narrative_seed';seedId:string};expectedVersion:number;evidenceSummary:string;payload:Record<string,unknown>}>
    if(requests.length) await runWorkspaceCommands(requests)
    seeds.value=await fetchNarrativeSeeds(worldId.value); await refreshProjection(); seedMultiSelect.clearSelection()
    if(draft.value && !seeds.value.some((seed)=>seed.id===draft.value.id)){ draft.value=null; selectedId.value=''; if(seeds.value[0]) await selectSeed(seeds.value[0].id) }
    setNotice(`已删除 ${ids.length} 条种子。`)
  }
 } catch(error){ setNotice(error instanceof Error ? error.message : '操作失败',true) } }
function handleOverlayClick(event:MouseEvent){ if(overlayGuard.shouldDismissFromOverlayClick(event)) emit('close') }
function updateViewport(){ embedXingyi.value=window.innerWidth>1050 }
async function handleNarrativeSeedsExternalUpdated(event:Event){
  const detail=(event as CustomEvent<NarrativeSeedsExternalUpdatedDetail>).detail
  if(!props.open || !worldId.value || String(detail?.worldId || '')!==worldId.value) return
  seedsForAgentCache = null
  try {
    await refreshNarrativeSeeds()
    setNotice('已同步星依刚完成的剧本修改。')
  } catch(error) {
    setNotice(error instanceof Error ? error.message : '刷新剧本失败',true)
  }
}
async function handleStatusSystemExternalUpdated(){ if(props.open) await refreshProjection() }

let timeGateTimer: ReturnType<typeof setInterval> | null = null
let timeGateSyncBusy = false
async function syncOpenWorkspaceTimeGates(){
  if(!props.open || !props.sessionId || !worldId.value || timeGateSyncBusy) return
  timeGateSyncBusy=true
  try {
    const result=await syncNarrativeSeedTimeGates(props.sessionId)
    if(result.transitionedCount>0){
      seedsForAgentCache=null
      await refreshNarrativeSeeds()
      await refreshProjection()
      setNotice(`帷幕时间已越过，${result.transitionedCount} 条种子进入待引爆。`)
    }
  } catch(error) {
    setNotice(error instanceof Error ? error.message : '同步叙事种子时间门失败',true)
  } finally { timeGateSyncBusy=false }
}

// 同一会话关闭工作台后，可能在世界管理里完成挂载/解绑；每次重开都必须重读服务端会话归属，
// 不能只刷新旧 worldId 下的编排投影，否则会把首次打开时的“未挂世界”永久留在视图里。
watch(() => [props.open, props.sessionId] as const, ([isOpen]) => { if(isOpen) void loadWorkspace() }, { immediate:true })
// 世界切换（含解绑/重挂）必须让编剧种子快照失效，避免带着上一个世界甚至空世界的旧快照跨轮复用。
watch(worldId, () => { seedsForAgentCache = null })
onMounted(()=>{
  window.addEventListener('resize',updateViewport)
  window.addEventListener(NARRATIVE_SEEDS_EXTERNAL_UPDATED_EVENT,handleNarrativeSeedsExternalUpdated)
  window.addEventListener(STATUS_SYSTEM_EXTERNAL_UPDATED_EVENT,handleStatusSystemExternalUpdated)
  timeGateTimer=setInterval(()=>{ void syncOpenWorkspaceTimeGates() },30_000)
})
onBeforeUnmount(()=>{
  window.removeEventListener('resize',updateViewport)
  window.removeEventListener(NARRATIVE_SEEDS_EXTERNAL_UPDATED_EVENT,handleNarrativeSeedsExternalUpdated)
  window.removeEventListener(STATUS_SYSTEM_EXTERNAL_UPDATED_EVENT,handleStatusSystemExternalUpdated)
  if(timeGateTimer) clearInterval(timeGateTimer)
})
</script>

<style scoped>
.script-workspace-overlay{position:fixed;inset:0;z-index:13020;padding:18px;background:var(--langhuan-dialog-overlay,rgba(35,30,27,.48));backdrop-filter:blur(5px)}
.script-workspace{width:100%;height:100%;display:flex;overflow:hidden;border:1px solid var(--morandi-border);border-radius:18px;background:var(--morandi-bg);color:var(--morandi-text);box-shadow:0 28px 80px rgba(28,23,20,.25)}

/* ---------- 左侧六区图标导航（视觉骨架，只有「叙事种子」接真数据） ---------- */
.script-workspace__rail{width:52px;flex:none;display:flex;flex-direction:column;align-items:center;gap:4px;padding:14px 0;border-right:1px solid var(--morandi-border);background:var(--morandi-surface)}
.script-workspace__rail-brand{display:flex;width:24px;height:24px;margin-bottom:10px;color:var(--morandi-primary)}
.script-workspace__rail-brand svg{width:100%;height:100%}
.script-workspace__rail-item{display:grid;place-items:center;width:36px;height:36px;border:0;border-radius:9px;background:transparent;color:var(--morandi-text-light);cursor:pointer;transition:background .15s ease,color .15s ease}
.script-workspace__rail-item :deep(svg){width:17px;height:17px}
.script-workspace__rail-item:hover{background:var(--morandi-soft-bg);color:var(--morandi-text)}
.script-workspace__rail-item.is-active{background:var(--morandi-soft-bg-strong);color:var(--morandi-accent)}
.script-workspace__agent-expand{position:relative;margin-bottom:4px;background:color-mix(in srgb,var(--morandi-accent) 10%,transparent);color:var(--morandi-accent)}
.script-workspace__agent-expand::after{content:"";position:absolute;right:5px;bottom:5px;width:5px;height:5px;border-radius:50%;background:var(--morandi-accent)}

.script-workspace__main-col{flex:1;display:flex;flex-direction:column;min-width:0;min-height:0}
.script-workspace__head{display:flex;align-items:center;gap:8px;min-height:56px;flex:none;padding:0 16px;border-bottom:1px solid var(--morandi-border);background:var(--morandi-card)}
.script-workspace__title{display:flex;align-items:baseline;gap:8px;min-width:0}
.script-workspace__title strong{flex:none;font-size:15px;font-weight:600}
.script-workspace__meta{display:flex;min-width:0;align-items:center;gap:6px;overflow:hidden;color:var(--morandi-text-light);font-size:11px}
.script-workspace__meta b{overflow:hidden;font-weight:500;color:var(--morandi-text-light);text-overflow:ellipsis;white-space:nowrap}
.script-workspace__truth-badge{margin-left:auto;padding:3px 9px;border:1px solid var(--morandi-border);border-radius:8px;color:var(--morandi-text-light);font-size:11px;flex:none}
.script-workspace__icon-btn{display:grid;flex:none;place-items:center;width:32px;height:32px;border:0;border-radius:8px;background:transparent;color:var(--morandi-text-light);cursor:pointer}
.script-workspace__icon-btn:hover{background:var(--morandi-soft-bg);color:var(--morandi-text)}
.script-workspace__icon-btn :deep(svg){width:16px;height:16px}
.line-icon{width:16px;height:16px}

.script-workspace__body{display:flex;flex:1;min-height:0}
.script-workspace__xingyi{display:flex;flex:0 0 clamp(300px,28vw,400px);min-width:0;min-height:0;overflow:hidden;padding:0;border-right:1px solid var(--morandi-border);background:var(--morandi-surface)}
.script-workspace__xingyi--collapsed{width:0;min-width:0;flex-basis:0;border-right:0}
.script-workspace__xingyi-host{flex:1 1 auto;min-width:0;min-height:0;overflow:hidden}
.script-workspace__xingyi-resize{flex:none;position:relative;z-index:5;width:7px;margin:0 -4px;border:0;background:transparent;cursor:col-resize;touch-action:none}
.script-workspace__xingyi-resize:hover{background:var(--morandi-soft-bg)}
.script-workspace__zones{position:relative;display:flex;flex:1;min-width:0;min-height:0;background:var(--morandi-bg)}
.script-workspace__zones.is-seeds{display:grid;grid-template-columns:300px minmax(0,1fr)}

/* ---------- 五个占位分区 ---------- */
.zone-placeholder{display:grid;place-content:center;gap:8px;flex:1;min-height:0;padding:32px;text-align:center;color:var(--morandi-text-light)}
.zone-placeholder svg{width:32px;height:32px;margin:0 auto 4px;color:var(--morandi-text-light)}
.zone-placeholder strong{color:var(--morandi-text);font-size:15px}
.zone-placeholder span{max-width:360px;font-size:12px;line-height:1.6}

/* ---------- 加载骨架屏（与聊天区/编排审计面板同一份「浅褐渐变横扫 1.3s」公式，联动视觉，改需同步） ---------- */
.script-skeleton{padding:10px}
.script-skeleton .sk{background:linear-gradient(90deg,rgba(139,115,85,.06) 25%,rgba(139,115,85,.12) 37%,rgba(139,115,85,.06) 63%);background-size:400% 100%;animation:script-skeleton-sweep 1.3s ease infinite;border-radius:5px}
@keyframes script-skeleton-sweep{0%{background-position:100% 0}100%{background-position:-100% 0}}
@media (prefers-reduced-motion: reduce){.script-skeleton .sk{animation:none;background:rgba(139,115,85,.09)}}
.script-skeleton__bar{border-radius:6px}
.script-skeleton__row{display:flex;align-items:center;gap:9px;padding:9px 12px}
.script-skeleton__ring{width:28px;height:28px;flex:none;border-radius:50%}
.script-skeleton__row-body{flex:1;min-width:0;display:grid;gap:6px}
.script-skeleton__line{height:12px}
.script-skeleton__tags{display:flex;gap:8px}
.script-skeleton__grid{display:grid;grid-template-columns:1fr 1fr;gap:12px 20px}

.seed-sidebar{display:flex;min-height:0;flex-direction:column;border-right:1px solid var(--morandi-border)}
.seed-list-head{flex:none;padding:8px 10px;border-bottom:1px solid var(--morandi-border)}
.seed-list-head button{width:100%;border:0;border-radius:6px;background:transparent;padding:7px 8px;color:var(--morandi-primary);font:inherit;font-size:12px;text-align:left;cursor:pointer}
.seed-list-head button:hover,.seed-list-head button.is-active{background:var(--morandi-soft-bg);color:var(--morandi-text)}
.seed-toolbar{display:grid;gap:7px;padding:10px;border-bottom:1px solid var(--morandi-border)}
input,textarea,select{width:100%;box-sizing:border-box;border:1px solid var(--morandi-border);border-radius:7px;background:var(--langhuan-dialog-input-bg,var(--morandi-card));color:var(--morandi-text);font-family:inherit;font-size:12px}
input:not([type='checkbox']),select{height:30px;padding:0 7px}
textarea{padding:5px 7px;resize:vertical;line-height:1.45}
.seed-toolbar input,.seed-filter-row select{height:27px;padding:0 7px;border-radius:6px;font-size:10.5px;background:transparent}
.seed-toolbar input:hover,.seed-filter-row select:hover{background:var(--morandi-soft-bg)}
.seed-toolbar input:focus,.seed-filter-row select:focus{background:var(--morandi-card);border-color:var(--morandi-accent);outline:none}
.seed-filter-row{display:grid;grid-template-columns:1fr 1fr;gap:6px}
.primary-action{min-height:34px;padding:0 13px;border:1px solid #66806a;border-radius:8px;background:#647d68;color:#fff;cursor:pointer}
.primary-action:disabled{opacity:.45;cursor:not-allowed}
.primary-action--sm{min-height:24px;padding:0 10px;border-radius:6px;font-size:11.5px}
.seed-list{flex:1 1 auto;min-height:0;overflow:auto}
.seed-row{position:relative;display:flex;align-items:center;width:100%;gap:9px;padding:9px 12px;border:0;border-bottom:1px solid var(--morandi-border);background:transparent;color:inherit;text-align:left;cursor:pointer}
.seed-row:hover,.seed-row.is-active{background:var(--morandi-soft-bg)}
.seed-row.is-checked{background:color-mix(in srgb, var(--morandi-accent) 10%, transparent)}
.seed-row__check{display:grid;flex:none;place-items:center;width:0;height:18px;overflow:hidden;border:1px solid transparent;border-radius:5px;color:#fff;opacity:0;transform:scale(.7);transition:width .12s ease,opacity .12s ease,transform .12s ease,background .12s ease,border-color .12s ease}
.seed-row:hover .seed-row__check,.seed-row__check.is-visible{width:18px;opacity:1;transform:scale(1);margin-right:1px;border-color:var(--morandi-border)}
.seed-row__check svg{width:12px;height:12px}
.seed-row.is-checked .seed-row__check{background:var(--morandi-accent);border-color:var(--morandi-accent)}
.seed-bulk-bar{display:flex;align-items:center;gap:8px;padding:8px 10px;border-bottom:1px solid var(--morandi-border);background:var(--morandi-soft-bg);font-size:12px;color:var(--morandi-text-light)}
.seed-bulk-bar span{flex:1;min-width:0}
.seed-bulk-bar__cancel{border:0;border-radius:6px;background:transparent;padding:4px 8px;color:var(--morandi-text-light);font:inherit;font-size:11.5px;cursor:pointer}
.seed-bulk-bar__cancel:hover{background:var(--morandi-card)}
.seed-bulk-bar__delete{border:0;border-radius:6px;background:var(--morandi-danger);padding:4px 10px;color:#fff;font:inherit;font-size:11.5px;cursor:pointer}
.seed-bulk-bar__delete:hover{filter:brightness(1.05)}
.seed-row__ring{position:relative;width:28px;height:28px;flex:none}
.seed-row__ring svg{width:28px;height:28px;transform:rotate(-90deg)}
.seed-row__ring .ring-bg{fill:none;stroke:var(--morandi-border);stroke-width:3}
.seed-row__ring .ring-fg{fill:none;stroke:var(--morandi-accent);stroke-width:3;stroke-linecap:round}
.seed-row__ring b{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:.56rem;font-weight:600;color:var(--morandi-text)}
.seed-row__body{min-width:0;flex:1;display:grid;gap:3px}
.seed-row__line1{display:flex;align-items:flex-start;gap:6px;min-width:0}
.seed-row__type{flex:none;margin-top:2px;color:#7f6859;font-size:10px}
.seed-row__body strong{font-size:13px;line-height:1.4;white-space:normal;overflow-wrap:break-word}
.seed-row small{display:flex;align-items:center;gap:5px;color:var(--morandi-text-light);font-size:10px}
.seed-row__status-dot{width:5px;height:5px;flex:none;border-radius:50%;background:var(--morandi-text-light)}
.seed-row__status-dot.is-active{background:var(--morandi-accent)}
.seed-row__status-dot.is-pending{background:var(--morandi-warning)}
.seed-row__status-dot.is-overdue{background:var(--morandi-danger)}
.seed-row__status-dot.is-closed{background:var(--morandi-text-light)}
.seed-list__empty{padding:16px;color:var(--morandi-text-light);font-size:12px}
.row-context-menu{position:fixed;z-index:20;min-width:96px;padding:4px;border:1px solid var(--morandi-border);border-radius:8px;background:var(--morandi-card);box-shadow:0 10px 28px rgba(30,25,20,.18)}
.row-context-menu button{display:block;width:100%;padding:7px 10px;border:0;background:transparent;color:var(--morandi-text);font:inherit;font-size:12.5px;text-align:left;border-radius:5px;cursor:pointer}
.row-context-menu button:hover{background:var(--morandi-soft-bg)}
.row-context-menu button.is-danger{color:#9c625d}

.seed-detail{display:flex;min-width:0;min-height:0;overflow:auto;flex-direction:column;padding:20px 24px}
.seed-detail__head{display:flex;flex-direction:column;gap:7px;padding-bottom:14px;border-bottom:1px solid var(--morandi-border)}
.seed-detail__head .type-tag{width:auto;height:auto;font-size:10px;padding:2px 7px;border-radius:5px;background:rgba(139,115,85,.1);color:var(--morandi-primary);margin-right:6px}
.seed-detail__head .status-pill{width:auto;height:auto;font-size:10px;letter-spacing:.06em;padding:2px 8px;border-radius:99px;background:var(--morandi-soft-bg);color:var(--morandi-text-light)}
.seed-detail__head .status-pill.is-active{color:var(--morandi-accent);background:rgba(92,138,92,.1)}
.seed-detail__head .status-pill.is-pending{color:var(--morandi-warning);background:rgba(212,184,150,.18)}
.seed-detail__head .status-pill.is-overdue{color:var(--morandi-danger);background:rgba(192,102,90,.1)}
.seed-detail__title-row{display:flex;align-items:center;gap:12px}
.seed-detail__tags{display:flex;align-items:center;gap:8px}
.seed-detail__version{font-size:10px;letter-spacing:.06em;color:var(--morandi-text-light)}
.tag-select{appearance:none;-webkit-appearance:none;border:1px solid transparent;cursor:pointer;font:inherit}
.tag-select:hover{border-color:var(--morandi-border)}
.seed-detail__title-input{display:block;box-sizing:border-box;flex:1 1 auto;min-width:0;margin:0 0 0 -4px;padding:2px 4px;border:1px solid transparent;border-radius:6px;background:transparent;color:var(--morandi-text);font-family:inherit;font-weight:700;font-size:18px}
.seed-detail__title-input:hover{background:var(--morandi-soft-bg)}
.seed-detail__title-input:focus{background:var(--morandi-card);border-color:var(--morandi-border);outline:none}
.seed-form{display:grid;grid-template-columns:1fr 1fr;gap:12px 14px;padding:18px 0}
.seed-form label{display:grid;align-content:start;gap:5px}
.seed-form label>span,.detail-group h3{font-size:11px;color:var(--morandi-text-light)}
.span-2{grid-column:1/-1}
.detail-group{padding:16px 0;border-top:1px solid var(--morandi-border)}
.detail-group h3{margin:0 0 10px;color:var(--morandi-text);font-size:13px}
.detail-group__head{display:flex;justify-content:space-between}
.seed-form--compact{padding:0}
.field-group{padding:18px 0 0}
.fg-title{margin-bottom:6px;color:var(--morandi-text-light);font-size:11px}
.field-grid-2{display:grid;grid-template-columns:1fr 1fr;gap:12px 20px}
.field-row .f-label{margin-bottom:4px;color:var(--morandi-text-light);font-size:11px}
.plain-field{display:block;box-sizing:border-box;width:100%;margin:-2px -4px;padding:2px 5px;border:1px solid var(--morandi-border);border-radius:6px;background:transparent;color:var(--morandi-text);font-family:inherit;font-size:12px;line-height:1.45;resize:vertical}
.plain-field:hover{background:var(--morandi-soft-bg)}
.plain-field:focus{background:var(--morandi-card);border-color:var(--morandi-accent);outline:none}
.plain-field{scrollbar-width:thin}
.plain-field::-webkit-scrollbar{width:6px}
.plain-field::-webkit-scrollbar-track{background:transparent}
.plain-field::-webkit-scrollbar-thumb{background:var(--morandi-border);border-radius:3px}
.plain-field:hover::-webkit-scrollbar-thumb{background:var(--morandi-text-light)}
input.plain-field,select.plain-field{height:28px}
select.plain-field{appearance:none;-webkit-appearance:none;cursor:pointer}
.plain-select{min-height:28px;border:1px solid var(--morandi-border);border-radius:6px;background:transparent;padding:2px 5px;color:var(--morandi-text);font-family:inherit;font-size:12px;cursor:pointer}
.plain-select:hover{background:var(--morandi-soft-bg)}
.check-label{grid-template-columns:auto 1fr!important;align-items:center!important;align-content:center!important;gap:7px}
.check-label input{width:14px;height:14px;accent-color:var(--morandi-primary)}
.check-label span{font-size:12px;color:var(--morandi-text-light)}
.olive-action{display:inline-flex;align-items:center;justify-content:center;min-height:24px;border:0;border-radius:6px;padding:0 10px;background:var(--morandi-accent);color:#fff;font:inherit;font-size:11.5px;cursor:pointer}
.olive-action:hover{background:#527a52}
.relation-row{display:grid;grid-template-columns:130px 1fr 34px;gap:7px;margin-bottom:7px}
.icon-button,.text-action{display:grid;place-items:center;border:0;background:transparent;color:var(--morandi-text-light);cursor:pointer}
.icon-button{width:34px;height:34px;border-radius:8px}
.text-action{display:inline-flex;height:34px;padding:0 6px;font:inherit}
.icon-button:hover,.text-action:hover{background:var(--morandi-soft-bg);color:var(--morandi-text)}
.history-list{display:grid;gap:0;margin:0;padding:0;list-style:none}
.history-list li{display:grid;grid-template-columns:145px 100px 1fr;gap:9px;padding:9px 0;border-bottom:1px solid var(--morandi-border);font-size:11px}
.history-list time{color:var(--morandi-text-light)}
.history-list p{margin:0;color:var(--morandi-text-light)}
.script-notice{padding:8px 10px;border-bottom:1px solid #9bb09d;color:#57715b;font-size:11px}
.script-notice.is-error{border-color:#c4948d;color:#9c625d}
.script-empty-state{display:grid;place-content:center;gap:7px;min-height:100%;padding:32px;text-align:center;color:var(--morandi-text-light)}
.seed-detail>.script-empty-state{flex:1 1 auto;min-height:0}
.script-empty-state strong{color:var(--morandi-text)}

.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}

@media(max-width:1050px){
  .script-workspace-overlay{padding:0}
  .script-workspace{border-radius:0}
  .script-workspace__xingyi{display:none}
  .script-workspace__body{height:calc(100vh - 56px)}
}
@media(max-width:720px){
  .script-workspace__rail{width:44px}
  .script-workspace__rail-item{width:32px;height:32px}
  .script-workspace__zones.is-seeds{grid-template-columns:140px minmax(0,1fr)}
  .seed-filter-row{grid-template-columns:1fr}
  .seed-detail{padding:14px}
  .seed-form{grid-template-columns:1fr}
  .span-2{grid-column:auto}
  .field-grid-2{grid-template-columns:1fr}
  .relation-row{grid-template-columns:1fr 34px}
  .relation-row select:first-child{grid-column:1/-1}
  .history-list li{grid-template-columns:1fr}
  .script-workspace__truth-badge{display:none}
}
</style>
