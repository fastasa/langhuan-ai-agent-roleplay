<template>
  <!-- 工作区专业Agent共享视图壳（编剧/舆图师/鉴心）：渲染原语复用共享组件 XingyiChatBubble（气泡）与
       XingyiChatComposer（输入条），与 XingyiDock / XingyiGuestChat 同源——本壳只管布局、历史菜单、
       确认卡与生命周期。runner 由调用方注入（编剧/舆图师各自的模型调用+工具装配）。 -->
  <div v-if="!collapsed" class="was-shell">
    <header class="was-shell__header">
      <XingyiDockHeader :status="shellStatus" :name="identityLabel" :status-label="shellStatusLabel" />
      <div class="was-shell__menu">
        <button type="button" class="was-shell__tool-btn" :title="t('workspaceAgent.newConversation')" :aria-label="t('workspaceAgent.newConversation')" :disabled="!enabled" @click="onNewConversation">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
        </button>
        <button type="button" class="was-shell__tool-btn" :class="{ 'is-active': historyOpen }" :title="t('workspaceAgent.historyMenu')" :aria-label="t('workspaceAgent.historyMenu')" :disabled="!enabled" @click="toggleHistory">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5M12 7v5l3 2" /></svg>
        </button>
        <button
          type="button"
          class="was-shell__tool-btn was-shell__collapse-btn"
          :title="t('workspaceAgent.collapsePanel', { name: title })"
          :aria-label="t('workspaceAgent.collapsePanel', { name: title })"
          aria-expanded="true"
          @click="onCollapse"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M9 3v18M17 9l-3 3 3 3" />
          </svg>
        </button>
      </div>
    </header>

    <div v-if="historyOpen" class="was-shell__history">
      <div v-if="!historyItems.length" class="was-shell__history-empty">{{ t('workspaceAgent.historyEmpty') }}</div>
      <button
        v-for="item in historyItems"
        :key="item.id"
        type="button"
        class="was-shell__history-item"
        @click="onActivateHistory(item.id)"
      >{{ item.name }}</button>
    </div>

    <div ref="messagesRef" class="was-shell__messages">
      <!-- 全子 Agent 固定范式：同会话后台子 Agent 统一在对话顶部显示共享运行条。
           运行真值只读 subagentRunStatus；人格训练等宿主不再各写专用卡。 -->
      <SubagentDispatchCardList
        v-if="enabled && controller.state.sessionId"
        :session-id="controller.state.sessionId"
        :include-settled="true"
        :dispatcher-label="identityLabel"
      />
      <AgentConversationEmptyState
        v-if="!enabled"
        :text="unavailableText || t('workspaceAgent.scopeUnavailable')"
        muted
      />
      <AgentConversationEmptyState
        v-else-if="sessionLoadFailed && !controller.state.messages.length"
        :text="t('workspaceAgent.historyLoadFailed')"
        muted
      />
      <AgentConversationEmptyState
        v-else-if="!sessionLoading && !controller.state.messages.length && !controller.state.running"
        :text="t('workspaceAgent.emptyMessages')"
      />
      <template v-if="enabled" v-for="(message, index) in controller.state.messages" :key="index">
        <AgentTurnStream
          v-if="message.turnStream?.length"
          :entries="message.turnStream"
          placement="inline"
        />
        <XingyiChatBubble :role="message.role" :content="message.content" />
      </template>

      <div v-if="enabled && controller.state.running && !controller.state.pendingInteraction" class="was-shell__activity">
        <XingyiStarIcon class="was-shell__activity-star xy-star--running" />
        <span>{{ t('workspaceAgent.thinking') }}</span>
      </div>

      <AgentTurnStream
        v-if="enabled && controller.state.turnStream.entries.length"
        :entries="controller.state.turnStream.entries"
        :running="controller.state.turnStream.running"
      />
    </div>

    <AgentInteractionDock v-if="controller.state.pendingInteraction">
      <div class="was-shell__confirm-card">
        <strong>{{ controller.state.pendingInteraction.request.title }}</strong>
        <p v-for="(line, index) in controller.state.pendingInteraction.request.lines || []" :key="index">{{ line }}</p>
        <div class="was-shell__confirm-feedback">
          <input v-model="confirmFeedback" :placeholder="t('workspaceAgent.confirmFeedbackPlaceholder')" @keydown.enter="submitConfirmFeedback">
          <button type="button" :disabled="!confirmFeedback.trim()" @click="submitConfirmFeedback">{{ t('workspaceAgent.feedbackButton') }}</button>
        </div>
        <div class="was-shell__confirm-actions">
          <button type="button" class="was-shell__confirm-cancel" @click="onResolvePendingInteraction(false)">{{ t('workspaceAgent.cancelButton') }}</button>
          <button type="button" class="was-shell__confirm-ok" @click="onResolvePendingInteraction(true)">{{ t('workspaceAgent.confirmButton') }}</button>
        </div>
      </div>
    </AgentInteractionDock>

    <footer class="was-shell__input-row">
      <AgentModelPickerPanel
        v-if="modelPickerOpen"
        ref="modelPickerRef"
        :model-value="controller.state.modelSelection"
        @update:model-value="controller.updateModelSelection"
        @close="modelPickerOpen = false"
      />
      <AgentSlashCommandPanel
        v-else-if="slashPanelMode"
        ref="slashPanelRef"
        :items="slashPanelItems"
        :selected-index="slashSelectedIndex"
        :title="slashPanelMode === 'sessions' ? t('xingyi.resumeTitle') : ''"
        :loading="slashPanelMode === 'sessions' && resumeLoading"
        :loading-text="t('common.loading')"
        :empty-text="slashPanelMode === 'sessions' ? t('xingyi.resumeEmpty') : t('xingyi.noMatchCommand')"
        @update:selected-index="slashSelectedIndex = $event"
        @select="selectSlashPanelItem"
        @close="closeSlashPanel"
      />
      <AgentWriteModeToggle
        :auto-approve="writeMode.autoApproveWrites"
        :auto-label="t('xingyi.autoApproveOn')"
        :confirm-label="t('xingyi.autoApproveOff')"
        :auto-hint="t('xingyi.autoApproveOnHint')"
        :confirm-hint="t('xingyi.autoApproveOffHint')"
        :auto-glyph="t('xingyi.autoApproveGlyphOn')"
        :confirm-glyph="t('xingyi.autoApproveGlyphOff')"
        :disabled="!enabled"
        @toggle="toggleWriteMode"
      />
      <!-- Enter 发送不走 composer 的 submit（那只管按钮点击），统一收在 onComposerKeydown 里过 IME 守卫 -->
      <XingyiChatComposer
        ref="composerRef"
        v-model="controller.state.draft"
        :running="controller.state.running"
        :disabled="!enabled || controller.state.running"
        :send-disabled="!enabled || (!controller.state.running && !controller.state.draft.trim())"
        :send-ready="enabled && !controller.state.running && Boolean(controller.state.draft.trim())"
        :placeholder="enabled ? t('workspaceAgent.inputPlaceholder') : t('workspaceAgent.inputDisabledPlaceholder')"
        :send-title="t('workspaceAgent.sendButton')"
        :stop-title="t('workspaceAgent.stopButton')"
        @keydown="onComposerKeydown"
        @submit="onSend"
        @stop="controller.stop()"
      >
        <!-- 待办卡锚定真实输入字段，专业工作区缩窄时按字段宽度自适应。 -->
        <template #task-todo>
          <AgentTaskTodoCard :snapshot="controller.state.taskTodo" />
        </template>
      </XingyiChatComposer>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
// 气泡壳 + 输入框壳（联动能力）：与 XingyiDock.vue / XingyiGuestChat.vue 同源复用，改共享外观时一并核对。
import XingyiChatBubble from '../XingyiChatBubble.vue'
import XingyiChatComposer from '../XingyiChatComposer.vue'
import XingyiDockHeader from '../XingyiDockHeader.vue'
import XingyiStarIcon from '../XingyiStarIcon.vue'
import AgentConversationEmptyState from '../AgentConversationEmptyState.vue'
import AgentTurnStream from '../AgentTurnStream.vue'
import AgentInteractionDock from '../AgentInteractionDock.vue'
import AgentTaskTodoCard from '../AgentTaskTodoCard.vue'
import AgentModelPickerPanel from '../AgentModelPickerPanel.vue'
import AgentSlashCommandPanel from '../AgentSlashCommandPanel.vue'
import AgentWriteModeToggle from '../AgentWriteModeToggle.vue'
import SubagentDispatchCardList from '../chat/SubagentDispatchCardList.vue'
import { useWorkspaceAgentController, type WorkspaceAgentTurnRunner } from '../../../composables/useWorkspaceAgentController'
import {
  disposeScopeState,
  getOrCreateWorkspaceAgentWriteApprovalMode,
  type WorkspaceAgentKind
} from '../../../app/workspaceAgentScopeState'
import type { XingyiSessionSummary } from '../../../repositories/chatRepository'
import { useStickToBottom } from '../../../composables/useStickToBottom'
import {
  filterSlashCommands,
  parseSlashQuery,
  type XingyiSlashCommand
} from '../../../app/xingyiSlashCommands'

const props = withDefaults(defineProps<{
  scopeKey: string
  agentKind: WorkspaceAgentKind
  targetId: string
  title: string
  identityLabel: string
  runner: WorkspaceAgentTurnRunner
  enabled?: boolean
  /** 弹窗/面板当前是否真正可见。作用域可用不等于视图已打开。 */
  active?: boolean
  unavailableText?: string
  collapsed?: boolean
}>(), {
  enabled: true,
  active: true,
  unavailableText: '',
  collapsed: false
})

const emit = defineEmits<{
  (event: 'update:collapsed', value: boolean): void
}>()
const { t } = useI18n()
const controller = useWorkspaceAgentController(props.scopeKey, props.agentKind, props.targetId, props.title, props.runner)
const writeMode = getOrCreateWorkspaceAgentWriteApprovalMode(props.scopeKey)

const historyOpen = ref(false)
const historyItems = ref<XingyiSessionSummary[]>([])
const confirmFeedback = ref('')
const sessionLoading = ref(false)
const sessionLoadFailed = ref(false)
const messagesRef = ref<HTMLElement | null>(null)
const composerRef = ref<InstanceType<typeof XingyiChatComposer> | null>(null)
const modelPickerRef = ref<InstanceType<typeof AgentModelPickerPanel> | null>(null)
const slashPanelRef = ref<InstanceType<typeof AgentSlashCommandPanel> | null>(null)
const modelPickerOpen = ref(false)
const slashDismissed = ref(false)
const slashSelectedIndex = ref(0)
const resumePanelOpen = ref(false)
const resumeLoading = ref(false)
const scrollStick = useStickToBottom(messagesRef, { observeMutations: true })
const slashQuery = computed(() => parseSlashQuery(controller.state.draft))
const slashCommands = computed(() => {
  if (slashQuery.value === null) return []
  return filterSlashCommands(slashQuery.value)
    .filter((command) => command.name !== 'diary')
})
const slashPanelMode = computed<'commands' | 'sessions' | null>(() => {
  if (modelPickerOpen.value) return null
  if (resumePanelOpen.value) return 'sessions'
  if (!slashDismissed.value && slashQuery.value !== null) return 'commands'
  return null
})
const slashPanelItems = computed(() => slashPanelMode.value === 'sessions'
  ? historyItems.value.map((item) => ({
      id: item.id,
      label: item.name,
      description: `${item.id === controller.state.sessionId ? t('xingyi.currentSessionMark') : ''}${t('xingyi.messageCount', { count: item.messageCount })}`
    }))
  : slashCommands.value.map((command) => ({
      id: command.name,
      label: command.usage,
      description: t(command.descriptionKey)
    }))
)

function scrollToBottom(force = false) {
  nextTick(() => scrollStick.scrollToBottom(force))
}
const shellStatus = computed(() => !props.enabled
  ? 'idle'
  : controller.state.pendingInteraction
    ? 'waiting'
    : controller.state.running
      ? 'running'
      : 'idle')
const shellStatusLabel = computed(() => !props.enabled
  ? t('workspaceAgent.statusUnavailable')
  : controller.state.pendingInteraction
    ? t('workspaceAgent.statusWaiting')
    : controller.state.running
      ? t('workspaceAgent.statusRunning')
      : t('workspaceAgent.statusIdle'))

async function toggleHistory() {
  if (!props.enabled) return
  historyOpen.value = !historyOpen.value
  if (historyOpen.value) {
    historyItems.value = await controller.listHistory()
  }
}

async function onActivateHistory(sessionId: string) {
  await controller.activateSession(sessionId)
  historyOpen.value = false
  resumePanelOpen.value = false
  scrollToBottom(true)
}

async function onNewConversation() {
  if (!props.enabled) return
  await controller.newSession()
  historyOpen.value = false
  resumePanelOpen.value = false
  modelPickerOpen.value = false
  scrollToBottom(true)
}

function onCollapse() {
  historyOpen.value = false
  resumePanelOpen.value = false
  modelPickerOpen.value = false
  emit('update:collapsed', true)
}

function closeSlashPanel() {
  resumePanelOpen.value = false
  slashDismissed.value = true
}

async function openModelPicker() {
  controller.state.draft = ''
  slashDismissed.value = true
  try {
    await controller.loadOrEnsureSession()
  } finally {
    modelPickerOpen.value = true
  }
}

async function openResumePanel() {
  resumeLoading.value = true
  resumePanelOpen.value = true
  slashSelectedIndex.value = 0
  try {
    historyItems.value = await controller.listHistory()
  } catch {
    historyItems.value = []
  } finally {
    resumeLoading.value = false
  }
}

async function executeSlashCommand(command: XingyiSlashCommand) {
  controller.state.draft = ''
  slashSelectedIndex.value = 0
  if (command.name === 'clear') {
    await onNewConversation()
  } else if (command.name === 'resume') {
    await openResumePanel()
  } else if (command.name === 'model') {
    await openModelPicker()
  }
}

function selectSlashPanelItem(index: number) {
  if (slashPanelMode.value === 'sessions') {
    const session = historyItems.value[index]
    if (session) void onActivateHistory(session.id)
    return
  }
  const command = slashCommands.value[index]
  if (command) void executeSlashCommand(command)
}

// 回车发送守卫（参照 MobileChatThread.vue::handleComposerKeydown）：IME 合成中的回车是选词确认
// 不是发送（isComposing / 旧式 keyCode 229 双判）；带修饰键的回车放行为换行。
function onComposerKeydown(event: KeyboardEvent) {
  if (event.isComposing || event.keyCode === 229) return
  if (modelPickerOpen.value && modelPickerRef.value?.handleKeydown(event)) return
  if (slashPanelMode.value && slashPanelRef.value?.handleKeydown(event)) return
  if (event.key !== 'Enter' || event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return
  event.preventDefault()
  onSend()
}

function onSend() {
  if (!props.enabled) return
  const draft = controller.state.draft.trim()
  if (!draft || controller.state.running) return
  void controller.send(draft)
}

function toggleWriteMode() {
  if (!props.enabled) return
  writeMode.autoApproveWrites = !writeMode.autoApproveWrites
}

function isEditableTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null
  if (!element) return false
  const tag = String(element.tagName || '').toUpperCase()
  return tag === 'INPUT' || tag === 'TEXTAREA' || Boolean(element.isContentEditable)
}

/** 与星依浮坞同款：当前工作区可见时，点在主输入框或输入框禁用运行中都可用 Shift+Tab 切换。 */
function onWriteModeShortcut(event: KeyboardEvent) {
  if (!props.active || props.collapsed || !props.enabled || !event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return
  if (String(event.key || '').toLowerCase() !== 'tab') return
  if (isEditableTarget(event.target) && event.target !== composerRef.value?.textareaEl) return
  event.preventDefault()
  toggleWriteMode()
}

function onResolvePendingInteraction(confirmed: boolean) {
  confirmFeedback.value = ''
  controller.state.pendingInteraction?.resolve(confirmed ? { status: 'confirmed' } : { status: 'denied' })
}

function submitConfirmFeedback() {
  const answer = confirmFeedback.value.trim()
  if (!answer) return
  confirmFeedback.value = ''
  controller.state.pendingInteraction?.resolve({ status: 'answered', answer })
}

async function hydrateVisibleSession() {
  if (!props.active || !props.enabled || controller.state.sessionLoaded || sessionLoading.value) return
  sessionLoading.value = true
  sessionLoadFailed.value = false
  try {
    await controller.loadOrEnsureSession()
    scrollToBottom(true)
  } catch {
    // 加载失败不是“没有聊天记录”。保留可重试态；下次重新打开弹窗会再次请求。
    sessionLoadFailed.value = true
  } finally {
    sessionLoading.value = false
  }
}

onMounted(() => {
  window.addEventListener('keydown', onWriteModeShortcut)
  void hydrateVisibleSession()
})

watch(() => [props.active, props.enabled] as const, ([active, enabled]) => {
  if (active && enabled) void hydrateVisibleSession()
})

watch(() => props.collapsed, (collapsed) => {
  if (collapsed) historyOpen.value = false
})

watch(() => controller.state.draft, () => {
  slashDismissed.value = false
  slashSelectedIndex.value = 0
  if (controller.state.draft) resumePanelOpen.value = false
})

// 关闭弹窗只卸载视图：running 或有待确认卡时 disposeScopeState 会拒绝清空（母计划3.3.1），
// 状态留在模块级 Map 里；重新打开同 scopeKey 的实例会经 getOrCreateScopeState 原样取回，不丢在途任务。
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onWriteModeShortcut)
  disposeScopeState(props.scopeKey)
})

defineExpose({ controller })
</script>

<style scoped>
/* CSS 注释里绝不能出现「星号+斜杠」连写（会提前闭合注释让 style 500）。颜色全部走项目 --morandi- token。 */
.was-shell {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  box-sizing: border-box;
}
.was-shell__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 42px;
  padding: 5px 8px 5px 10px;
  border-bottom: 1px solid var(--morandi-border);
}
.was-shell__menu {
  display: flex;
  gap: 2px;
}
.was-shell__tool-btn {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  padding: 0;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--morandi-text-light);
  cursor: pointer;
}
.was-shell__tool-btn:hover:not(:disabled),
.was-shell__tool-btn.is-active {
  background: var(--morandi-soft-bg);
  color: var(--morandi-text);
}
.was-shell__tool-btn:disabled { opacity: .35; cursor: default; }
.was-shell__tool-btn svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; }
.was-shell__history {
  border-bottom: 1px solid var(--morandi-border);
  max-height: 160px;
  overflow-y: auto;
}
.was-shell__history-empty {
  padding: 8px 10px;
  font-size: 12px;
  color: var(--morandi-text-light);
}
.was-shell__history-item {
  display: block;
  width: 100%;
  text-align: left;
  padding: 6px 10px;
  font-size: 12px;
  border: none;
  background: transparent;
  color: var(--morandi-text);
  cursor: pointer;
}
.was-shell__history-item:hover {
  background: var(--morandi-surface);
}
.was-shell__messages {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 10px 10px 18px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.was-shell__confirm-card {
  padding: 10px;
  border: 1px solid var(--morandi-border);
  border-radius: 8px;
  background: var(--morandi-soft-bg);
  font-size: 12.5px;
}
.was-shell__confirm-card strong {
  display: block;
  margin-bottom: 4px;
  color: var(--morandi-text);
}
.was-shell__confirm-card p {
  margin: 2px 0;
  color: var(--morandi-text-light);
}
.was-shell__confirm-feedback { display: flex; gap: 6px; margin-top: 9px; }
.was-shell__confirm-feedback input { min-width: 0; flex: 1; height: 30px; padding: 0 9px; border: 1px solid var(--morandi-border); border-radius: 7px; background: var(--morandi-card); color: var(--morandi-text); font: inherit; }
.was-shell__confirm-feedback input:focus { outline: none; border-color: var(--morandi-accent); }
.was-shell__confirm-feedback button { flex: none; border: 0; border-radius: 7px; padding: 0 9px; background: transparent; color: var(--morandi-accent); font: inherit; cursor: pointer; }
.was-shell__confirm-feedback button:disabled { opacity: .35; cursor: default; }
.was-shell__confirm-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 8px;
}
.was-shell__confirm-cancel,
.was-shell__confirm-ok {
  padding: 4px 12px;
  border: 1px solid var(--morandi-border);
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
  background: var(--morandi-card);
  color: var(--morandi-text);
}
.was-shell__activity { display: flex; align-items: center; gap: 6px; margin: 0 12px 8px; color: var(--morandi-text-light); font-size: 12px; }
.was-shell__activity-star { width: 14px; height: 14px; flex: none; }
.was-shell__confirm-ok {
  background: var(--morandi-accent);
  border-color: var(--morandi-accent);
  color: #fff;
}
/* 气泡与 textarea/发送/停止按钮的视觉均由共享组件自理，这里只留输入行容器。 */
.was-shell__input-row {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  width: 100%;
  min-width: 0;
  gap: 6px;
  padding: 8px 10px 6px;
  border-top: 1px solid var(--morandi-border);
  background: var(--langhuan-paper-bg, transparent);
  box-sizing: border-box;
}
</style>
