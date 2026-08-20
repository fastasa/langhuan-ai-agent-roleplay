<template>
  <div class="chat-main">
    <ChatMainHeader
      :current-chat-title="headerChatTitle"
      :environment-pills="props.environmentPills"
      :current-character="props.viewModel.currentCharacter"
      :chat-target="props.viewModel.currentTarget"
      :conversation-avatar="props.conversationVisual.avatar"
      :conversation-emoji="props.conversationVisual.emoji"
      :group-members="props.groupMembers"
      :planned-speakers="props.viewModel.plannedGroupSpeakers"
      :is-typing="props.viewModel.isTyping"
      :streaming-speaker-name="props.viewModel.currentStreamingSpeakerName || ''"
      :can-use-local-tools="props.allowSummaryAction"
      :active-session-id="props.viewModel.activeSessionId || ''"
      :current-messages="props.viewModel.currentMessages"
      :reply-pipeline-mode="String(props.viewModel.currentSession?.replyPipelineMode ?? props.viewModel.currentSession?.reply_pipeline_mode ?? '')"
      @open-character-editor="(char) => props.actions.openCharacterEditor?.(char)"
      @open-session-settings="$emit('open-session-settings', $event)"
      @edit-group="props.actions.editGroup"
      @edit-crowd="props.actions.editCrowd"
      @open-notes-panel="$emit('open-notes-panel')"
      @open-map-viewer="$emit('open-map-viewer')"
      @open-script-workspace="$emit('open-script-workspace')"
      @open-status-system-panel="$emit('open-status-system-panel')"
    />

    <!-- 封存：旧顶部 ChatContextBar 记忆总结条已从桌面聊天区撤下；后续统一清理时可删除组件与 loadedSummary 顶部展示入口。 -->

    <!-- 提调坞宿主锚点（2026-07-04）：零高度、贴在 header 正下方=聊天区顶边。
         坞本体（TidiaoDirectorDock·数据在 ChatMessageStream 里）经 Teleport 挂到这里，
         结构上保证贴顶且不受消息滚动影响；找不到宿主（如单测直挂 ChatMessageStream）时坞原地渲染降级。 -->
    <div class="tds-dock-host"></div>

    <ChatMessageStream
      :current-target="props.viewModel.currentTarget"
      :is-typing="props.viewModel.isTyping"
      :current-messages="props.viewModel.currentMessages"
      :has-older-messages="Boolean(props.viewModel.hasOlderMessages)"
      :loading-older-messages="Boolean(props.viewModel.loadingOlderMessages)"
      :is-session-switching="Boolean(props.viewModel.isSessionSwitching)"
      :is-boot-loading="props.viewModel.isBootLoading"
      :current-alias="props.viewModel.currentAlias"
      :user-profile="props.viewModel.userProfile"
      :current-chat-title="props.viewModel.currentChatTitle"
      :editing-message-index="props.viewModel.editingMessageIndex"
      :editing-message-content="props.viewModel.editingMessageContent"
      :regenerating-message-index="props.viewModel.regeneratingMessageIndex"
      :format-chat-text="props.formatChatText"
      :get-char-avatar="props.getCharAvatar"
      :get-char-emoji="props.getCharEmoji"
      :current-character-avatar="props.viewModel.currentCharacterAvatar"
      :current-character="props.viewModel.currentCharacter"
      :active-session-id="props.viewModel.activeSessionId || ''"
      :reply-pipeline-mode="String(props.viewModel.currentSession?.replyPipelineMode ?? props.viewModel.currentSession?.reply_pipeline_mode ?? '')"
      :chat-font-scale="Number(props.viewModel.currentSession?.chatFontScale ?? props.viewModel.currentSession?.chat_font_scale ?? 1) || 1"
      :streaming-text="props.viewModel.streamingText"
      :streaming-speaker-name="props.viewModel.currentStreamingSpeakerName || ''"
      :environment-narration-loading="Boolean(props.viewModel.environmentNarrationLoading)"
      :preview-speaker-name="props.replyPreviewName"
      :streaming-target-id="props.viewModel.currentStreamingTargetId || ''"
      :set-messages-area-ref="props.setMessagesAreaRef"
      :chat-stick-to-bottom="props.chatStickToBottom"
      :get-displayed-message-content="props.getDisplayedMessageContent"
      :can-use-local-tools="props.allowSummaryAction"
      :load-older-messages="(beforeId?: number) => props.actions.loadOlderMessages?.(props.viewModel.activeSessionId || '', beforeId)"
      @open-char-settings="props.actions.openCharSettings"
      @assistant-avatar-click="$emit('assistant-avatar-click', $event)"
      @open-user-editor="props.actions.openUserEditor"
      @open-prompt-log-panel="$emit('open-prompt-log-panel', $event)"
      @open-personality-orchestration-audit="$emit('open-personality-orchestration-audit', $event)"
      @open-recall-activity-panel="handleOpenThinkingPanel"
      @create-first-character="props.actions.openAddCharacter(undefined, { collapseSidebar: false })"
      @open-fullscreen-image="props.actions.openFullscreenImage"
      @update:editing-message-content="props.actions.updateEditingMessageContent"
      @cancel-edit-message="props.actions.cancelEditMessage"
      @save-edit-message="props.actions.saveEditMessage"
      @save-and-regenerate="props.actions.saveAndRegenerate"
      @start-edit-message="props.actions.startEditMessage"
      @delete-message="props.actions.deleteMessage"
      @regenerate-message="handleRegenerateMessage"
      @select-message-version="({ index, nextIndex }) => props.actions.selectMessageVersion(index, nextIndex)"
      @copy-message="props.actions.copyMessage"
      @add-message-note="$emit('add-message-note', $event)"
      @toggle-message-prompt-visibility="props.actions.toggleMessagePromptVisibility?.($event)"
    />

    <ChatProcessMotion
      v-if="props.viewModel.chatSummaryWriting"
      class="chat-summary-writing"
      :label="props.viewModel.chatSummaryWritingText || '正在按投影写入轨迹'"
    />

    <!-- 输入栏上方常驻「提调」浮条（单聊 + 群聊·D6 起；走完保留、决策流不消失）。输入即与提调 Agent 对话：
         带楼层号「角色3-5、旁白2 改委婉点」→ 按楼层精修；不带楼层号 → 据当前会话回答或执行修改。
         公开空库仍保留浮条轮廓：无 currentTarget 时禁用并提示先新建或选择角色，但默认只露细边；
         与正式交互一致，鼠标悬浮或点击聚焦后才抬起。
         可用判据用 currentTarget（单聊=角色 target、群聊=group_ target，均 truthy）而非 activeSessionId——
         单聊无 session 实体、activeSessionId 恒为空串，若把可用性绑到 session 会把单聊纠偏栏永久挡掉。
         D6：去掉旧 groupMembers.length<=1 单聊 gate——共享层精修/纠偏 loop 会话类型无关（按楼层/messageId 工作、
         移动端本就群聊可用），群聊也展示；群聊一轮多发言者，placeholder 特化提示按楼层精修指定角色。 -->
    <TidiaoPrecisionEditBar
      v-if="props.actions.applyDirectorPrecisionEdits"
      :disabled="Boolean(!props.viewModel.currentTarget || props.viewModel.isTyping || props.viewModel.hasForegroundChatTask)"
      :placeholder="precisionEditPlaceholder"
      @submit="handlePrecisionEdit"
    />

    <ChatInputBar
      :is-typing="props.viewModel.isTyping"
      :has-foreground-chat-task="Boolean(props.viewModel.hasForegroundChatTask)"
      :foreground-chat-task-label="props.viewModel.foregroundChatTaskLabel || ''"
      :running-chat-task-count="Number(props.viewModel.runningChatTaskCount || 0)"
      :evaluation-enabled="props.viewModel.evaluationEnabled"
      :plus-menu-open="props.viewModel.plusMenuOpen"
      :at-menu-open="props.viewModel.atMenuOpen"
      :chat-input-text="props.viewModel.chatInputText"
      :pending-image-attachments="props.viewModel.pendingImageAttachments"
      :handle-image-attachment-paste="props.actions.handleImageAttachmentPaste"
      :handle-image-attachment-drop="props.actions.handleImageAttachmentDrop"
      :handle-image-attachment-drag-over="props.actions.handleImageAttachmentDragOver"
      :remove-image-attachment="props.actions.removeImageAttachment"
      :retry-image-attachment-upload="props.actions.retryImageAttachmentUpload"
      :open-fullscreen-image="props.actions.openFullscreenImage"
      :mention-selected-chars="props.viewModel.mentionSelectedChars"
      :mention-excluded-chars="props.viewModel.mentionExcludedChars"
      :filtered-at-characters="props.viewModel.filteredAtCharacters"
      :get-char-name-by-id="props.getCharNameById"
      :toggle-plus-menu="props.actions.togglePlusMenu"
      :clear-current-chat="props.actions.clearCurrentChat"
      :request-clear-current-chat-context="props.actions.requestClearCurrentChatContext"
      :add-mention-char="props.actions.addMentionChar"
      :remove-mention-char="props.actions.removeMentionChar"
      :toggle-exclude-char="props.actions.toggleExcludeChar"
      :send-chat="props.actions.sendChat"
      :trigger-manual-narration="props.actions.triggerManualNarration"
      :abort-chat="props.actions.abortChat"
      :open-chat-summary="props.actions.openChatSummary"
      :open-chat-history="props.actions.openChatHistory"
      :toggle-evaluation="props.actions.toggleEvaluation"
      :input-chat-text="props.actions.inputChatText"
      :set-menu-container-ref="props.setMenuContainerRef"
      :set-chat-input-ref="props.setChatInputRef"
      :allow-summary-action="props.allowSummaryAction"
      :can-trigger-manual-narration="Boolean(props.viewModel.activeSessionId && props.viewModel.currentTarget)"
      :narration-profiles="props.viewModel.currentSession?.narrationProfiles || props.viewModel.currentSession?.narration_profiles"
      @update:plus-menu-open="props.actions.updatePlusMenuOpen"
      @update:at-menu-open="props.actions.updateAtMenuOpen"
      @clear-mention-selected="props.actions.clearMentionSelected"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ComponentPublicInstance } from 'vue'
import type { ChatMessageNoteCreatePayload, ChatPanelActions, ChatPanelViewModel, EnvironmentViewModel } from '../../../types/panelContracts'
import type { UseStickToBottomResult } from '../../../composables/useStickToBottom'
import { resolveChatHeaderTitle } from '../../../app/chatHeaderTitle'

const ChatMainHeader = defineAsyncComponent(() => import('./ChatMainHeader.vue'))
const ChatMessageStream = defineAsyncComponent(() => import('./ChatMessageStream.vue'))
const ChatInputBar = defineAsyncComponent(() => import('./ChatInputBar.vue'))
const ChatProcessMotion = defineAsyncComponent(() => import('../../common/ChatProcessMotion.vue'))
const TidiaoPrecisionEditBar = defineAsyncComponent(() => import('./TidiaoPrecisionEditBar.vue'))
const { t } = useI18n()

type RefTarget = Element | ComponentPublicInstance | null
type GroupMemberChip = {
  id: string
  name: string
  avatar: string
  emoji: string
}
type EnvironmentPillsConfig = {
  viewModel: Pick<EnvironmentViewModel, 'currentLocation' | 'currentTime' | 'timeRate' | 'weatherDetail'>
  isLoadingLocation: boolean
  isLoadingWeather: boolean
  editingLocation: boolean
  tempLocation: string
  showWeatherDetail: boolean
  weatherText: string
  temperatureText: string
  timeRate?: number
  formatDateOnly: (s: string) => string
  formatTimeOnly: (s: string) => string
  formatObsTime: (s: string) => string
  getWeatherIcon: (iconCode: string) => string
  editLocation: () => void
  saveLocation: () => void
  cancelLocationEdit: () => void
  syncWeather: (locationOverride?: string) => void
  toggleSceneTimePaused: () => void
  syncTime: () => void
  toggleWeatherDetail: () => void
  closeWeatherDetail: () => void
  updateTempLocation: (value: string) => void
}

const props = defineProps<{
  viewModel: ChatPanelViewModel
  actions: ChatPanelActions
  environmentPills?: EnvironmentPillsConfig
  conversationVisual: { avatar: string; emoji: string }
  groupMembers: GroupMemberChip[]
  replyPreviewName: string
  formatChatText: (text: string) => string
  getCharAvatar: (name: string) => string
  getCharEmoji: (name: string) => string
  setMessagesAreaRef: (el: RefTarget) => void
  chatStickToBottom: UseStickToBottomResult
  getDisplayedMessageContent: (index: number) => string
  getCharNameById: (charId: string) => string
  setMenuContainerRef: (el: RefTarget) => void
  setChatInputRef: (el: RefTarget) => void
  allowSummaryAction: boolean
}>()

const emit = defineEmits<{
  (e: 'open-session-settings', targetId: string): void
  (e: 'assistant-avatar-click', payload: { characterRef?: string; ctrlKey?: boolean; metaKey?: boolean }): void
  (e: 'open-thinking-panel', payload: { thinkingText: string; thinkingSpeakerName: string; isThinking: boolean; messageId?: number; recallRunId?: string }): void
  (e: 'open-notes-panel'): void
  (e: 'open-map-viewer'): void
  (e: 'open-script-workspace'): void
  (e: 'open-status-system-panel'): void
  (e: 'open-prompt-log-panel', messageId?: number): void
  (e: 'open-personality-orchestration-audit', payload: { messageId?: number | string | null; runtimeOrchestration?: Record<string, unknown> | null }): void
  (e: 'add-message-note', payload: ChatMessageNoteCreatePayload): void
}>()

const headerChatTitle = computed(() => resolveChatHeaderTitle({
  session: props.viewModel.currentSession,
  activeSessionId: props.viewModel.activeSessionId || '',
  targetId: props.viewModel.currentTarget,
  fallbackTitle: props.viewModel.currentChatTitle,
  defaultTitle: '琅嬛'
}))

function handleOpenThinkingPanel(payload: { thinkingText: string; thinkingSpeakerName: string; isThinking: boolean; messageId?: number; recallRunId?: string }) {
  emit('open-thinking-panel', payload)
}

function handleRegenerateMessage(payload: number | { index?: number; mode?: 'recall' | 'prompt_replay'; instruction?: string }) {
  if (typeof payload === 'number') {
    props.actions.regenerateMessage?.(payload)
    return
  }
  // 批次M1b：hover 提调输入框的重试修改意见随事件透传给 regenerateMsg（单聊角色导演重试用，其余路径忽略）。
  const instruction = String(payload?.instruction || '').trim()
  props.actions.regenerateMessage?.(Number(payload?.index || 0), payload?.mode, instruction ? { instruction } : undefined)
}

// 群聊保留楼层提示；单聊/群聊都明确这是给提调 Agent 发消息，不再把自由文本描述成只能纠偏上一轮。
const precisionEditPlaceholder = computed(() =>
  !props.viewModel.currentTarget
    ? t('chat.selectCharacterFirst')
    : props.groupMembers.length > 1
    ? '给提调发消息；带「角色2」可精修楼层，也可直接提问或说修改要求'
    : '给提调发消息；提问或修改要求都可以直接说'
)

// 提调栏提交：带楼层号精修；自由文本仍正式唤起提调 Agent，由它据当前会话回答或执行修改。
function handlePrecisionEdit(refsText: string) {
  props.actions.applyDirectorPrecisionEdits?.(String(refsText || ''))
}
</script>

<style scoped>
.chat-summary-writing {
  margin: 0 18px 8px;
  width: fit-content;
  max-width: calc(100% - 36px);
}

/* 提调坞宿主：零高度锚点，坞（收起绿条/展开抽屉）绝对定位悬浮其下，不占聊天区布局。
   z-index 高于消息区、低于 header（70）与弹窗。 */
.tds-dock-host {
  position: relative;
  height: 0;
  z-index: 40;
}
</style>
