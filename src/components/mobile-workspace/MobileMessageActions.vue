<template>
  <div v-if="hasAnyAction" class="mobile-msg-actions" :class="{ 'mobile-msg-actions--user': isUser }">
    <!-- 版本切换 -->
    <div v-if="versionTotal > 1" class="mobile-msg-version">
      <button
        type="button"
        class="mobile-msg-version__btn"
        :disabled="activeVersionIndex <= 0"
        :title="$t('chat.prevVersion')"
        @click="selectVersion(activeVersionIndex - 1)"
      >‹</button>
      <span class="mobile-msg-version__indicator">{{ activeVersionIndex + 1 }}/{{ versionTotal }}</span>
      <button
        type="button"
        class="mobile-msg-version__btn"
        :disabled="activeVersionIndex >= versionTotal - 1"
        :title="$t('chat.nextVersion')"
        @click="selectVersion(activeVersionIndex + 1)"
      >›</button>
    </div>

    <button v-if="!isNarrationDebug" type="button" class="mobile-msg-btn" :title="$t('common.copy')" @click="copy">
      <MobileLineIcon name="copy" :size="15" />
    </button>
    <button v-if="!isNarrationDebug" type="button" class="mobile-msg-btn" :title="$t('common.edit')" @click="edit">
      <MobileLineIcon name="square-pen" :size="15" />
    </button>
    <button v-if="canAddNote" type="button" class="mobile-msg-btn" :title="$t('mobile.msgActions.addNote')" @click="addNote">
      <MobileLineIcon name="note" :size="15" />
    </button>
    <button v-if="!isNarrationDebug" type="button" class="mobile-msg-btn mobile-msg-btn--danger" :title="$t('common.delete')" @click="remove">
      <MobileLineIcon name="trash" :size="15" />
    </button>
    <button v-if="showPromptLog" type="button" class="mobile-msg-btn" :title="$t('mobile.msgActions.promptLog')" @click="$emit('open-prompt-log', numericId)">
      <MobileLineIcon name="prompt-log" :size="15" />
    </button>
    <button v-if="showOrchestration" type="button" class="mobile-msg-btn" :title="$t('mobile.msgActions.orchestrationAudit')" @click="$emit('open-orchestration-audit', numericId)">
      <MobileLineIcon name="git-branch" :size="15" />
    </button>
    <button v-if="showRecall" type="button" class="mobile-msg-btn" :title="$t('mobile.msgActions.recallProcess')" @click="$emit('open-recall', numericId)">
      <MobileLineIcon name="radar" :size="15" />
    </button>
    <!-- 重试只保留单一语义「按提示词重试」（用户 2026-06-20）：点击直接按原提示词重试，不再弹二级抽屉选项；
         想改具体内容/纠偏请用聊天输入栏上方的常驻纠偏框。 -->
    <button v-if="showRetry" type="button" class="mobile-msg-btn" :title="$t('chat.retryByPrompt')" @click="regenerate('prompt_replay')">
      <MobileLineIcon name="refresh" :size="15" />
    </button>
    <!-- 投影灯：状态机与三态矩阵真值在 src/app/replyWorkflowMessageView.ts（与桌面 ChatMessageStream 联动）；
         视图状态由 MobileChatThread 计算后经 projectionLamp prop 下发，点击 emit 回父级处理。 -->
    <button
      v-if="projectionLamp"
      type="button"
      class="mobile-msg-btn mobile-msg-btn--projection"
      :class="[`mobile-msg-btn--projection-${projectionLamp.state}`, { 'is-projection-active': projectionLamp.active }]"
      :disabled="projectionLamp.disabled"
      :aria-pressed="projectionLamp.active"
      :aria-label="projectionLamp.title"
      :title="projectionLamp.title"
      @click="$emit('projection-lamp')"
    >
      <span class="mobile-msg-projection-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M15 14c.2-1 .7-1.7 1.5-2.5A5 5 0 1 0 7.5 11.5c.8.8 1.3 1.5 1.5 2.5"/>
          <path d="M9 18h6"/>
          <path d="M10 22h4"/>
          <path d="M8.5 14h7"/>
        </svg>
      </span>
    </button>
    <button
      v-if="!isNarrationDebug"
      type="button"
      class="mobile-msg-btn"
      :class="{ 'is-hidden': isHidden }"
      :title="isHidden ? $t('chat.restoreToPrompt') : $t('chat.hideFromPrompt')"
      @click="toggleVisibility"
    >
      <MobileLineIcon :name="isHidden ? 'eye-off' : 'eye'" :size="15" />
    </button>

  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import MobileLineIcon from './MobileLineIcon.vue'
import { createChatMessageNoteBySessionId } from '../../repositories/chatRepository'
import type { ChatMessageViewModel } from '../../types/panelContracts'
import type { DesktopPanelState } from '../../types/panelContracts'

// 移动端单条消息操作行：把桌面 ChatMessageStream 底部 .msg-actions 那排按钮搬到移动端，
// 显示条件与动作链路与桌面同源（复制/编辑/删除/笔记/版本/重试/隐藏直调 chatActions，
// 提示词/召回/编排审计 emit 给父级开移动面板；投影灯状态由 MobileChatThread 经共享状态机
// src/app/replyWorkflowMessageView.ts 计算下发，2026-06-10 接入）。
const props = defineProps<{
  message: ChatMessageViewModel
  index: number
  state: DesktopPanelState
  /** 投影灯视图状态：null 表示本条消息不显示投影灯（非工作流会话且无投影行 / 调试消息 / 无数字 id）。 */
  projectionLamp?: { state: 'pending' | 'running' | 'success' | 'failed'; title: string; active: boolean; disabled: boolean } | null
}>()

const emit = defineEmits<{
  'open-prompt-log': [messageId: number]
  'open-orchestration-audit': [messageId: number]
  'open-recall': [messageId: number]
  'note-added': []
  'projection-lamp': []
}>()

const actions = computed(() => props.state.chatActions)
const isUser = computed(() => props.message.role === 'user')

function messageKind(msg: ChatMessageViewModel) {
  return String(msg?.messageKind ?? msg?.message_kind ?? '').trim()
}
function speakerNameRaw(msg: ChatMessageViewModel) {
  return String(msg?.name ?? msg?.memberName ?? '').trim()
}
const isNarration = computed(() => messageKind(props.message) === 'narration' || speakerNameRaw(props.message) === '旁白')
const isNarrationDebug = computed(() => messageKind(props.message) === 'narration_debug' || speakerNameRaw(props.message) === '旁白调试')
const isCapsFinalReply = computed(() => messageKind(props.message) === 'caps_reply')

const numericId = computed(() => {
  const raw = String(props.message.id || '').trim()
  return Number(raw.match(/\d+$/)?.[0] || raw) || 0
})

const versionTotal = computed(() => {
  const list = Array.isArray(props.message.versionList) ? props.message.versionList : []
  return list.length > 0 ? list.length : 1
})
const activeVersionIndex = computed(() => {
  const total = versionTotal.value
  const raw = Number(props.message.activeVersionIndex)
  if (!Number.isInteger(raw)) return total - 1
  return Math.min(Math.max(raw, 0), total - 1)
})

const canAddNote = computed(() => !isNarrationDebug.value && numericId.value > 0)
const showPromptLog = computed(() => !isUser.value && !isNarrationDebug.value && numericId.value > 0)
const showOrchestration = computed(() => !isUser.value && numericId.value > 0)
// 召回：本地工作区直接可用；非用户、非 CAPS 最终回复、非旁白、有数字 id；旁白调试不展示。
const showRecall = computed(() =>
  !isUser.value && !isCapsFinalReply.value && !isNarration.value && !isNarrationDebug.value && numericId.value > 0
)
const showRetry = computed(() => !isNarrationDebug.value && !isUser.value)
const isHidden = computed(() => {
  const value = props.message?.autoWriteHidden ?? (props.message as Record<string, unknown>)?.auto_write_hidden
  return value === true || value === 1 || value === '1' || value === 'true'
})

const hasAnyAction = computed(() => (
  versionTotal.value > 1 || !isNarrationDebug.value || canAddNote.value || showPromptLog.value || showOrchestration.value || showRecall.value || Boolean(props.projectionLamp)
))

function selectVersion(nextIndex: number) {
  actions.value.selectMessageVersion?.(props.index, nextIndex)
}
function copy() {
  actions.value.copyMessage?.(props.index)
}
function edit() {
  actions.value.startEditMessage?.(props.index)
}
function remove() {
  actions.value.deleteMessage?.(props.index)
}
function toggleVisibility() {
  actions.value.toggleMessagePromptVisibility?.(props.index)
}
function regenerate(mode: 'recall' | 'prompt_replay') {
  actions.value.regenerateMessage?.(props.index, mode)
}

// 加入笔记：与桌面同源走 createChatMessageNoteBySessionId，构造与桌面 buildMessageNotePayload 等价的整条消息笔记 payload
async function addNote() {
  const sessionId = String(props.state.chatViewModel.activeSessionId || '').trim()
  if (!sessionId || numericId.value <= 0) return
  const content = String(props.state.getDisplayedMessageContent?.(props.index) || props.message.content || '').trim()
  if (!content) return
  const record = props.message as Record<string, unknown>
  const speakerName = isUser.value
    ? (props.state.chatViewModel.currentAlias?.name || props.state.chatViewModel.userProfile?.displayName || '我')
    : (isNarrationDebug.value ? '旁白调试' : isNarration.value ? '旁白' : (props.message.name || props.message.memberName || props.state.chatViewModel.currentChatTitle || '角色'))
  const payload = {
    messageId: numericId.value,
    sourceMode: 'message' as const,
    sourceText: content,
    messageSnapshot: content,
    messageIndex: props.index,
    floorLabel: `第 ${props.index + 1} 条`,
    speakerName,
    role: String(props.message.role || ''),
    envDate: String(record.envDate ?? record.env_date ?? '').trim(),
    envWeather: String(record.envWeather ?? record.env_weather ?? '').trim(),
    envLocation: String(record.envLocation ?? record.env_location ?? '').trim(),
    model: String(record.model ?? '').trim()
  }
  try {
    await createChatMessageNoteBySessionId(sessionId, payload as unknown as Record<string, unknown>)
    emit('note-added')
  } catch (error) {
    console.error('移动端加入笔记失败:', error)
  }
}
</script>

<style scoped>
.mobile-msg-actions {
  display: flex;
  align-items: center;
  gap: 0;
  margin-top: 3px;
  overflow-x: auto;
  scrollbar-width: none;
  -webkit-overflow-scrolling: touch;
}

.mobile-msg-actions::-webkit-scrollbar {
  display: none;
}

/* 用户消息靠右：操作行也靠右 */
.mobile-msg-actions--user {
  justify-content: flex-end;
}

.mobile-msg-btn {
  display: inline-flex;
  flex: 0 0 auto;
  width: 28px;
  height: 28px;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 8px;
  background: transparent;
  /* 移动端无 hover：默认就清晰可点（不淡灰像禁用），用低饱和、偏绿的 sage 灰绿 */
  color: #87937c;
  cursor: pointer;
  padding: 0;
  -webkit-tap-highlight-color: transparent;
}

.mobile-msg-btn:active {
  background: color-mix(in srgb, var(--lhm-primary, #8b7355) 12%, transparent);
}

.mobile-msg-btn--danger {
  color: #b07069;
}

.mobile-msg-btn.is-hidden {
  color: var(--lhm-accent, #5c8a5c);
}

/* 投影灯三态配色：与桌面 .msg-action-btn--projection-* 同语义（黄=等待/进行中、绿=成功、红=失败禁用） */
.mobile-msg-projection-icon {
  display: inline-flex;
  width: 15px;
  height: 15px;
}

.mobile-msg-projection-icon svg {
  width: 100%;
  height: 100%;
}

.mobile-msg-btn--projection-pending {
  color: #c9a227;
}

.mobile-msg-btn--projection-running {
  color: #c9a227;
  animation: mobile-msg-projection-pulse 1.1s ease-in-out infinite;
}

.mobile-msg-btn--projection-success {
  color: var(--lhm-accent, #5c8a5c);
}

.mobile-msg-btn--projection-success.is-projection-active {
  background: color-mix(in srgb, var(--lhm-accent, #5c8a5c) 14%, transparent);
}

.mobile-msg-btn--projection-failed {
  color: #b07069;
  cursor: default;
  opacity: 0.75;
}

@keyframes mobile-msg-projection-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.45; }
}

.mobile-msg-version {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 1px;
  margin-right: 1px;
}

.mobile-msg-version__btn {
  display: inline-flex;
  width: 22px;
  height: 26px;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #87937c;
  cursor: pointer;
  font-size: 17px;
  line-height: 1;
  padding: 0;
}

.mobile-msg-version__btn:disabled {
  cursor: default;
  opacity: 0.35;
}

.mobile-msg-version__indicator {
  min-width: 26px;
  color: var(--lhm-text-muted, #999);
  font-size: 11px;
  text-align: center;
}

</style>
