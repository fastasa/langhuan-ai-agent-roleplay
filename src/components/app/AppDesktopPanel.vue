<template>
  <div class="container">
    <section class="workspace-primary-area">
      <AppChatSection
        :view-model="chatViewModel"
        :actions="chatActions"
        :environment-pills="chatEnvironmentPills"
        :workspace-primary-view="workspacePrimaryView"
        :desktop-sidebar-width-override="desktopSidebarWidth"
        :desktop-sidebar-style-override="desktopSidebarStyle"
        :start-sidebar-resize-override="startDesktopSidebarResize"
        :get-char-avatar-by-id="getCharAvatarById"
        :get-weather-emoji="getWeatherEmoji"
        :format-chat-text="formatChatText"
        :get-char-avatar="getCharAvatar"
        :get-char-emoji="getCharEmoji"
        :set-messages-area-ref="setMessagesAreaRef"
        :chat-stick-to-bottom="chatStickToBottom"
        :get-displayed-message-content="getDisplayedMessageContent"
        :get-char-name-by-id="getCharNameById"
        :set-menu-container-ref="chatActions.setMenuContainerRef"
        :set-chat-input-ref="chatActions.setChatInputRef"
        :active-utility-panel="activeUtilityPanel"
        :api-config-view-model="apiConfigPanelViewModel"
        :api-config-actions="apiConfigPanelActions"
        @switch-workspace-view="switchWorkspacePrimaryView"
        @open-chat-utility="openUtilityPanel"
      />
    </section>

    <aside
      v-if="activeUtilityPanel"
      class="chat-utility-drawer"
      aria-label="聊天工具抽屉"
    >
      <header class="chat-utility-drawer__header">
        <span>{{ activeUtilityPanelTitle }}</span>
        <button type="button" class="chat-utility-drawer__close" title="关闭" aria-label="关闭" @click="closeUtilityPanel">×</button>
      </header>
      <div class="chat-utility-drawer__body">
        <TransactionOperationsPanel
          v-if="activeUtilityPanel === 'operation'"
          mode="detailed"
          :operations="transactionPanelViewModel.operations"
          :is-typing="transactionPanelViewModel.isExecuting"
          :has-task-timeline="transactionPanelViewModel.hasTaskTimeline"
          :get-task-timeline-nodes="transactionPanelViewModel.getTaskTimelineNodes"
          :format-timer-time="transactionPanelViewModel.formatTimerTime"
          :get-task-elapsed-time="transactionPanelViewModel.getTaskElapsedTime"
          @clear="transactionPanelActions.clear"
          @confirm="transactionPanelActions.confirm"
          @remove="transactionPanelActions.remove"
        />

        <AppResourcePanel
          v-if="activeUtilityPanel === 'resource'"
          :resource-view-model="resourcePanelViewModel"
          @add-big-time="resourcePanelActions.addBigTime"
          @add-small-time="resourcePanelActions.addSmallTime"
          @convert-points="resourcePanelActions.exchangePoints"
          @spend-money="resourcePanelActions.spendMoney"
        />

        <AppTaskPanel
          v-if="activeUtilityPanel === 'task'"
          :view-model="taskPanelViewModel"
          :actions="taskPanelActions"
        />

        <AppTicketSection
          v-if="activeUtilityPanel === 'ticket'"
          :view-model="ticketPanelViewModel"
          :actions="ticketPanelActions"
        />

        <AppDataManageSection
          v-if="activeUtilityPanel === 'dataSafety'"
          :view-model="dataManagePanelViewModel"
          :actions="dataManagePanelActions"
        />
      </div>
    </aside>

    <div class="workspace-overlay-host">
      <OperationDetailModal :detail="operationDetailValue" @close="closeOperationDetail" />

      <AppChangelogDialog
        v-if="currentAppChangelog"
        :open="changelogDialogOpen"
        :changelog="currentAppChangelog"
        @close="closeChangelogDialog"
      />

      <AppFormDialog
        :open="showPresetVarsValue"
        title="可用变量参数"
        size="md"
        @cancel="closePresetVars"
      >
        <div style="font-size: 0.9rem; line-height: 1.8;" v-pre>
          <p><strong>用户信息变量</strong></p>
          <ul style="margin-left: 20px; color: #666;">
            <li><code>{{user_name}}</code> - 你的名字</li>
            <li><code>{{user_emoji}}</code> - 你的Emoji</li>
            <li><code>{{user_gender}}</code> - 你的性别</li>
            <li><code>{{user_age}}</code> - 你的年龄</li>
            <li><code>{{user_appearance}}</code> - 你的外貌</li>
            <li><code>{{user_personality}}</code> - 你的性格</li>
            <li><code>{{user_outfit}}</code> - 你的穿着</li>
            <li><code>{{user_hobbies}}</code> - 你的爱好</li>
            <li><code>{{user_abilities}}</code> - 你的能力</li>
          </ul>
          <p><strong>环境信息变量</strong></p>
          <ul style="margin-left: 20px; color: #666;">
            <li><code>{{current_time}}</code> - 当前时间</li>
            <li><code>{{current_location}}</code> - 当前地点</li>
            <li><code>{{current_weather}}</code> - 当前天气</li>
          </ul>
          <p><strong>资源信息变量</strong></p>
          <ul style="margin-left: 20px; color: #666;">
            <li><code>{{points}}</code> - 当前点数</li>
            <li><code>{{money}}</code> - 当前金钱</li>
          </ul>
          <p><strong>角色信息变量</strong></p>
          <ul style="margin-left: 20px; color: #666;">
            <li><code>{{char_name}}</code> - 角色名字</li>
            <li><code>{{char_emoji}}</code> - 角色Emoji</li>
            <li><code>{{char_gender}}</code> - 角色性别</li>
            <li><code>{{char_age}}</code> - 角色年龄</li>
            <li><code>{{char_appearance}}</code> - 角色外貌</li>
            <li><code>{{char_personality}}</code> - 角色性格</li>
            <li><code>{{char_relationship}}</code> - 与角色的关系</li>
            <li><code>{{char_affection}}</code> - 角色好感</li>
          </ul>
        </div>

        <template #actions>
          <button class="btn btn-primary" @click="closePresetVars">关闭</button>
        </template>
      </AppFormDialog>
    </div>
    <input type="file" :ref="setImportFileInputRef" @change="handleImportDataChange" accept=".json" style="display: none;">
  </div>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, isRef, onBeforeUnmount, onMounted, ref, toRefs } from 'vue'
import type {
  ApiConfigPanelActions,
  ApiConfigPanelViewModel,
  DataManagePanelActions,
  DataManagePanelViewModel,
  ChatUtilityPanelId,
  DesktopPanelState,
  EnvironmentViewModel,
  ResourcePanelActions,
  ResourcePanelViewModel,
  TaskPanelActions,
  TaskPanelViewModel,
  TicketPanelActions,
  TicketPanelViewModel,
  TransactionPanelActions,
  TransactionPanelViewModel
} from '../../types/panelContracts'
import AppFormDialog from '../common/AppFormDialog.vue'
import { useResizablePanel } from '../../composables/app/useResizablePanel'
import { API } from '../../config/api'
import type { AppChangelog } from '../../app/appChangelog'
import { LOCAL_WORKSPACE_ID } from '../../app/localWorkspace'

const AppChatSection = defineAsyncComponent(() => import('./chat/AppChatSection.vue'))
const TransactionOperationsPanel = defineAsyncComponent(() => import('./TransactionOperationsPanel.vue'))
const AppResourcePanel = defineAsyncComponent(() => import('./AppResourcePanel.vue'))
const OperationDetailModal = defineAsyncComponent(() => import('./OperationDetailModal.vue'))
const AppTaskPanel = defineAsyncComponent(() => import('./AppTaskPanel.vue'))
const AppTicketSection = defineAsyncComponent(() => import('./sections/AppTicketSection.vue'))
const AppChangelogDialog = defineAsyncComponent(() => import('./sections/AppChangelogDialog.vue'))
const AppDataManageSection = defineAsyncComponent(() => import('./sections/AppDataManageSection.vue'))

const props = defineProps<DesktopPanelState>()
type WorkspacePrimaryView = 'chat' | 'roles' | 'docs' | 'config' | 'data' | 'worlds'
const CHANGELOG_SEEN_STORAGE_PREFIX = 'langhuan_changelog_seen'
const workspacePrimaryView = ref<WorkspacePrimaryView>('chat')
const activeUtilityPanel = ref<ChatUtilityPanelId | ''>('')
const changelogDialogOpen = ref(false)
// 未加载完成前保持 null，禁止用旧种子常量兜底，避免推送后仍显示旧版本
const currentAppChangelog = ref<AppChangelog | null>(null)
const {
  width: desktopSidebarWidth,
  panelStyle: desktopSidebarStyle,
  startResize: startDesktopSidebarResize
} = useResizablePanel({
  storageKey: 'langhuan_chat_sidebar_width',
  defaultWidth: 280,
  minWidth: 160,
  maxWidth: 630,
  enabled: computed(() => true)
})

const {
  environmentViewModel,
  environmentActions,
  chatViewModel,
  chatActions,
  formatDateOnly,
  formatTimeOnly,
  formatObsTime,
  getWeatherIcon,
  getWeatherEmoji,
  formatChatText,
  getCharAvatarById,
  getCharAvatar,
  getCharEmoji,
  setMessagesAreaRef,
  chatStickToBottom,
  getDisplayedMessageContent,
  getCharNameById
} = toRefs(props)

const environmentPanelViewModel = computed(() => ({
  currentLocation: String(environmentViewModel.value?.currentLocation || ''),
  currentLocationLarge: String(environmentViewModel.value?.currentLocationLarge || ''),
  currentLocationMiddle: String(environmentViewModel.value?.currentLocationMiddle || ''),
  currentLocationSmall: String(environmentViewModel.value?.currentLocationSmall || ''),
  currentTime: String(environmentViewModel.value?.currentTime || ''),
  timeRate: environmentViewModel.value?.timeRate === 0 ? 0 : Number(environmentViewModel.value?.timeRate || 1),
  weatherDetail: environmentViewModel.value?.weatherDetail || null
}) satisfies Pick<EnvironmentViewModel, 'currentLocation' | 'currentLocationLarge' | 'currentLocationMiddle' | 'currentLocationSmall' | 'currentTime' | 'timeRate' | 'weatherDetail'>)
const chatEnvironmentPills = computed(() => ({
  viewModel: environmentPanelViewModel.value,
  isLoadingLocation: Boolean(environmentViewModel.value?.isLoadingLocation),
  isLoadingWeather: Boolean(environmentViewModel.value?.isLoadingWeather),
  editingLocation: Boolean(environmentViewModel.value?.editingLocation),
  tempLocation: String(environmentViewModel.value?.tempLocation || ''),
  tempLocationLarge: String(environmentViewModel.value?.tempLocationLarge || ''),
  tempLocationMiddle: String(environmentViewModel.value?.tempLocationMiddle || ''),
  tempLocationSmall: String(environmentViewModel.value?.tempLocationSmall || ''),
  showWeatherDetail: Boolean(environmentViewModel.value?.showWeatherDetail),
  weatherText: String(environmentViewModel.value?.weatherText || ''),
  temperatureText: String(environmentViewModel.value?.temperatureText || ''),
  timeRate: environmentViewModel.value?.timeRate === 0 ? 0 : Number(environmentViewModel.value?.timeRate || 1),
  formatDateOnly: formatDateOnly.value,
  formatTimeOnly: formatTimeOnly.value,
  formatObsTime: formatObsTime.value,
  getWeatherIcon: getWeatherIcon.value,
  editLocation: environmentActions.value.editLocation,
  saveLocation: environmentActions.value.saveLocation,
  cancelLocationEdit: environmentActions.value.cancelLocationEdit,
  syncWeather: environmentActions.value.syncWeather,
  toggleSceneTimePaused: environmentActions.value.toggleSceneTimePaused,
  syncTime: environmentActions.value.syncTime,
  toggleWeatherDetail: environmentActions.value.toggleWeatherDetail,
  closeWeatherDetail: environmentActions.value.closeWeatherDetail,
  updateTempLocation: environmentActions.value.updateTempLocation,
  updateTempLocationLarge: environmentActions.value.updateTempLocationLarge,
  updateTempLocationMiddle: environmentActions.value.updateTempLocationMiddle,
  updateTempLocationSmall: environmentActions.value.updateTempLocationSmall
}))
const operationDetailValue = computed(() => (
  isRef(props.operationDetail) ? props.operationDetail.value : props.operationDetail
))
const showPresetVarsValue = computed(() => (
  isRef(props.showPresetVars) ? Boolean(props.showPresetVars.value) : Boolean(props.showPresetVars)
))
const transactionPanelViewModel = computed<TransactionPanelViewModel>(() => {
  const source = (props.panelViewModels?.transaction || {}) as Partial<TransactionPanelViewModel>
  return {
    operations: Array.isArray(source.operations) ? source.operations : [],
    isExecuting: Boolean(source.isExecuting),
    hasTaskTimeline: typeof source.hasTaskTimeline === 'function' ? source.hasTaskTimeline : () => false,
    getTaskTimelineNodes: typeof source.getTaskTimelineNodes === 'function' ? source.getTaskTimelineNodes : () => [],
    formatTimerTime: typeof source.formatTimerTime === 'function' ? source.formatTimerTime : () => '',
    getTaskElapsedTime: typeof source.getTaskElapsedTime === 'function' ? source.getTaskElapsedTime : () => 0
  }
})
const transactionPanelActions = computed<TransactionPanelActions>(() => (props.panelActions?.transaction || {}) as TransactionPanelActions)
const resourcePanelViewModel = computed<ResourcePanelViewModel>(() => props.panelViewModels.resource)
const resourcePanelActions = computed<ResourcePanelActions>(() => props.panelActions.resource)
const taskPanelViewModel = computed<TaskPanelViewModel>(() => (props.panelViewModels?.task || {}) as TaskPanelViewModel)
const taskPanelActions = computed<TaskPanelActions>(() => (props.panelActions?.task || {}) as TaskPanelActions)
const ticketPanelViewModel = computed<TicketPanelViewModel>(() => props.panelViewModels.ticket)
const ticketPanelActions = computed<TicketPanelActions>(() => props.panelActions.ticket)
const apiConfigPanelViewModel = computed<ApiConfigPanelViewModel>(() => props.panelViewModels.apiConfig)
const apiConfigPanelActions = computed<ApiConfigPanelActions>(() => props.panelActions.apiConfig)
const dataManagePanelViewModel = computed<DataManagePanelViewModel>(() => props.panelViewModels.dataManage)
const dataManagePanelActions = computed<DataManagePanelActions>(() => props.panelActions.dataManage)
const activeUtilityPanelTitle = computed(() => {
  switch (activeUtilityPanel.value) {
    case 'changelog':
      return '更新日志'
    case 'dataSafety':
      return '数据安全'
    case 'api':
      return '配置'
    case 'operation':
      return '操作助手'
    case 'resource':
      return '资源'
    case 'task':
      return '任务'
    case 'ticket':
      return '点券'
    default:
      return '工具'
  }
})
const activeChangelogSeenKey = computed(() => {
  const changelog = currentAppChangelog.value
  if (!changelog) return null
  const pushId = String(changelog.pushId || '').trim()
  const changelogId = pushId || changelog.releaseId
  return `${CHANGELOG_SEEN_STORAGE_PREFIX}:${LOCAL_WORKSPACE_ID}:${changelogId}`
})

function handleImportDataChange(event: Event) {
  props.importAllData(event, [])
}

function closeOperationDetail() {
  const target = props.operationDetail as { value?: unknown } | null
  if (target && typeof target === 'object' && 'value' in target) {
    target.value = null
  }
}

function closePresetVars() {
  const target = props.showPresetVars as unknown as { value?: boolean } | null
  if (target && typeof target === 'object' && 'value' in target) {
    target.value = false
  }
}

function setImportFileInputRef(el: unknown) {
  props.importFileInput.value = el as HTMLInputElement | null
}

function switchWorkspacePrimaryView(nextView: WorkspacePrimaryView) {
  workspacePrimaryView.value = nextView
}

function handleOpenWorkspaceView(event: Event) {
  const detail = (event as CustomEvent<{ view?: string; characterId?: string }>).detail || {}
  const view = String(detail.view || '')
  if (view === 'chat' || view === 'roles' || view === 'docs' || view === 'config' || view === 'data' || view === 'worlds') {
    switchWorkspacePrimaryView(view)
  }
}

async function openUtilityPanel(panelId: ChatUtilityPanelId) {
  if (panelId === 'changelog') {
    await loadAppChangelog()
    if (!currentAppChangelog.value) return
    changelogDialogOpen.value = true
    return
  }
  if (panelId === 'api') {
    switchWorkspacePrimaryView('config')
    activeUtilityPanel.value = ''
    return
  }
  if (panelId === 'archive') return
  activeUtilityPanel.value = activeUtilityPanel.value === panelId ? '' : panelId
}

async function loadAppChangelog() {
  try {
    const response = await fetch(API.APP_CHANGELOG)
    if (!response.ok) return
    const payload = await response.json() as AppChangelog
    if (payload?.releaseId && Array.isArray(payload.entries)) {
      currentAppChangelog.value = payload
    }
  } catch {
    // 请求失败保持现值不变，绝不回退硬编码种子，避免网络抖动时误显旧版本
  }
}

function closeUtilityPanel() {
  activeUtilityPanel.value = ''
}

function maybeOpenChangelogDialog() {
  if (typeof window === 'undefined') return
  const changelog = currentAppChangelog.value
  if (!changelog) return
  const seenKey = activeChangelogSeenKey.value
  if (!seenKey) return
  const pushId = String(changelog.pushId || '').trim()
  if (!pushId) return
  const deferredPushId = String((window as Window & { __langhuanDeferredChangelogPushId?: string }).__langhuanDeferredChangelogPushId || '').trim()
  if (deferredPushId === pushId) return
  try {
    if (window.localStorage.getItem(seenKey) === '1') return
  } catch {
    return
  }
  changelogDialogOpen.value = true
}

function closeChangelogDialog() {
  changelogDialogOpen.value = false
  if (typeof window === 'undefined') return
  const seenKey = activeChangelogSeenKey.value
  if (!seenKey) return
  try {
    window.localStorage.setItem(seenKey, '1')
  } catch {
    // 已读状态不属于业务真值，写入失败不阻断使用。
  }
}

onMounted(async () => {
  if (typeof window === 'undefined') return
  window.addEventListener('langhuan:open-workspace-view', handleOpenWorkspaceView)
  await loadAppChangelog()
  maybeOpenChangelogDialog()
})

onBeforeUnmount(() => {
  if (typeof window === 'undefined') return
  window.removeEventListener('langhuan:open-workspace-view', handleOpenWorkspaceView)
})
</script>

<style scoped>
.workspace-primary-area {
  display: flex;
  min-height: 0;
  height: 100%;
  max-height: 100%;
  margin-bottom: 0;
  overflow: hidden;
}

.workspace-primary-area > :deep(.card) {
  flex: 1 1 auto;
  min-height: 0;
}

.chat-utility-drawer {
  position: fixed;
  top: 38px;
  right: 16px;
  bottom: 16px;
  z-index: 180;
  width: min(440px, calc(100vw - 72px));
  display: flex;
  flex-direction: column;
  min-height: 0;
  border: 1px solid rgba(139, 115, 85, 0.18);
  border-radius: 8px;
  background: var(--morandi-card);
  box-shadow: 0 18px 46px rgba(53, 45, 36, 0.16);
  overflow: hidden;
}

.chat-utility-drawer__header {
  height: 42px;
  flex: 0 0 42px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0 12px;
  border-bottom: 1px solid rgba(139, 115, 85, 0.14);
  color: var(--morandi-text);
  font-size: 14px;
  font-weight: 700;
}

.chat-utility-drawer__close {
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--morandi-text-light);
  cursor: pointer;
  font-size: 20px;
  line-height: 1;
}

.chat-utility-drawer__close:hover {
  background: var(--morandi-soft-bg);
  color: var(--morandi-text);
}

.chat-utility-drawer__body {
  min-height: 0;
  flex: 1 1 auto;
  overflow: auto;
  padding: 10px;
}

.chat-utility-drawer__body :deep(.card),
.chat-utility-drawer__body :deep(.collapsible) {
  margin-bottom: 0 !important;
  box-shadow: none !important;
}

.chat-utility-drawer__body :deep(.card + .card),
.chat-utility-drawer__body :deep(.collapsible + .collapsible) {
  margin-top: 10px !important;
}

.chat-utility-drawer__body :deep(.resource-panel),
.chat-utility-drawer__body :deep(.card) {
  max-width: 100%;
}

.chat-utility-drawer__body :deep(.collapsible-header) {
  border-radius: 8px 8px 0 0 !important;
}

.chat-utility-drawer__body :deep(.collapsible-content) {
  max-width: 100%;
  overflow-x: auto;
}

.workspace-overlay-host {
  position: relative;
  z-index: 60;
}
</style>
