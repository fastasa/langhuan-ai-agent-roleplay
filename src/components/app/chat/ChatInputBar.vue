<template>
  <div
    class="chat-input-shell"
    :class="{ 'chat-input-shell--drag-active': isDragActive }"
    @wheel="handleInputShellWheel"
    @dragover.prevent="handleInputShellDragOver"
    @dragleave="handleInputShellDragLeave"
    @drop.prevent="handleInputShellDrop"
  >
    <div
      class="chat-input-area"
      :class="{
        'chat-input-area--keep-open': keepInputExpanded,
        'chat-input-area--focused-action': focusedActionActive
      }"
    >
      <!-- 图片附件缩略图条（输入框图片上传计划批4）：悬浮在输入框上方，不挤压布局；
           ChatInputBar 自己不持有附件状态，pendingImages 与增删/重试动作均来自 props（与 chatInputText 同层同源）。 -->
      <ImageAttachmentChips
        v-if="props.pendingImageAttachments.length"
        class="chat-input-attachment-chips"
        :images="props.pendingImageAttachments"
        @remove="props.removeImageAttachment"
        @retry="props.retryImageAttachmentUpload"
        @preview="handlePreviewAttachment"
      />
      <div
        v-if="showSlashCommandPanel"
        class="slash-command-panel"
        @mousedown.prevent
      >
        <div class="slash-command-panel__header">
          <span>{{ t('chat.commandsHeader') }}</span>
          <span>{{ t('chat.commandsCount', { count: filteredSlashCommands.length }) }}</span>
        </div>
        <button
          v-for="command in filteredSlashCommands"
          :key="command.id"
          class="slash-command-item"
          type="button"
          @click="selectSlashCommand(command.command)"
        >
          <span class="slash-command-item__command">{{ command.command }}</span>
          <span class="slash-command-item__content">
            <span class="slash-command-item__title">{{ command.title }}</span>
            <span class="slash-command-item__summary">{{ command.summary }}</span>
          </span>
        </button>
        <div v-if="!filteredSlashCommands.length" class="slash-command-empty">
          {{ t('chat.noMatchingCommands') }}
        </div>
      </div>

      <textarea
        class="chat-input"
        :ref="bindChatInputRef"
        :value="localInputText"
        @input="handleInput"
        @compositionstart="handleCompositionStart"
        @compositionend="handleCompositionEnd"
        @wheel="handleChatInputWheel"
        @keydown="handleInputKeydown"
        @paste="handleTextareaPaste"
        :placeholder="focusedActionActive ? t('chat.focusedActionPlaceholder') : t('chat.inputPlaceholder')"
        spellcheck="false"
        autocomplete="off"
        autocorrect="off"
        autocapitalize="off"
        rows="1"
      ></textarea>

      <div class="chat-input-toolbar">
        <div class="chat-input-toolbar-left">
          <div class="plus-menu-container" :ref="props.setMenuContainerRef" @click.stop>
            <button
              class="plus-btn"
              type="button"
              :aria-label="t('chat.openMoreActions')"
              :title="t('common.more')"
              @click.stop="handleTogglePlusMenu"
              :disabled="props.isTyping"
            >
              <span class="chat-input-action-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <path d="M5 12h14" />
                  <path d="M12 5v14" />
                </svg>
              </span>
              <span class="chat-input-action-title">{{ t('common.more') }}</span>
            </button>
            <div class="plus-menu" v-if="props.plusMenuOpen">
              <button type="button" class="plus-menu-item" @click="handleConversationManagerClick">
                <svg class="plus-menu-item__icon" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M6 14l1.45-2.9A2 2 0 0 1 9.24 9H20a2 2 0 0 1 1.94 2.5l-1.54 6A2 2 0 0 1 18.46 19H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5.9a2 2 0 0 1 1.69.9l.81 1.2A2 2 0 0 0 14.07 6H20a2 2 0 0 1 2 2v3"/>
                </svg>
                <span>{{ t('chat.chatFileManage') }}</span>
              </button>
              <button v-if="props.allowSummaryAction" type="button" class="plus-menu-item" @click="handleSummaryClick">
                <svg class="plus-menu-item__icon" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z"/>
                  <path d="M14 2v4a2 2 0 0 0 2 2h4"/>
                  <path d="M10 9H8"/>
                  <path d="M16 13H8"/>
                  <path d="M16 17H8"/>
                </svg>
                <span>{{ t('chat.summarizeChat') }}</span>
              </button>
              <button type="button" class="plus-menu-item plus-menu-item--danger" @click="handleClearChatClick">
                <svg class="plus-menu-item__icon" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M10 11v6"/>
                  <path d="M14 11v6"/>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>
                  <path d="M3 6h18"/>
                  <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                </svg>
                <span>{{ t('chat.clearChat') }}</span>
              </button>
              <div class="plus-menu-divider"></div>
              <button type="button" class="plus-menu-item" @click="handleMentionClick">
                <svg class="plus-menu-item__icon" viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="12" cy="12" r="4"/>
                  <path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8"/>
                </svg>
                <span>{{ t('chat.mention') }}</span>
              </button>
            </div>
            <div class="at-menu" v-if="props.atMenuOpen" style="min-width: 280px;">
              <div class="at-menu-header" style="display: flex; justify-content: space-between; align-items: center;">
                <span>{{ t('chat.selectCharsInOrder') }}</span>
                <button v-if="props.mentionSelectedChars.length > 0" class="btn btn-small" style="padding: 2px 6px; font-size: 0.7rem;" @click="$emit('clear-mention-selected')">{{ t('common.clear') }}</button>
              </div>
              <div v-if="props.mentionSelectedChars.length > 0" style="padding: 8px; border-bottom: 1px solid var(--morandi-border); background: rgba(155,139,122,0.1);">
                <div style="font-size: 0.75rem; color: var(--morandi-text-light); margin-bottom: 6px;">{{ t('chat.selectedOrder') }}</div>
                <div v-for="(charId, idx) in props.mentionSelectedChars" :key="'selected_'+charId+'_'+idx" style="display: flex; align-items: center; gap: 6px; margin-bottom: 4px;">
                  <span style="background: var(--morandi-primary); color: white; padding: 1px 6px; border-radius: 8px; font-size: 0.7rem;">{{ idx + 1 }}</span>
                  <span style="font-size: 0.85rem;">{{ props.getCharNameById(charId) }}</span>
                  <button @click="props.removeMentionChar(idx)" style="background: none; border: none; cursor: pointer; color: #999; font-size: 0.9rem;">×</button>
                </div>
              </div>
              <div style="max-height: 300px; overflow-y: auto;">
                <div class="at-menu-item" v-for="char in props.filteredAtCharacters" :key="String(char.id || char.name || '')"
                    @click.stop="props.addMentionChar(String(char.id || ''))"
                    :style="{ opacity: props.mentionExcludedChars.includes(String(char.id || '')) ? 0.4 : 1 }">
                  <span class="at-menu-character">
                    <span class="at-menu-character-name">{{ char.emoji }} {{ char.name }}</span>
                    <span class="at-menu-character-meta">
                      <span class="at-menu-character-kind">{{ getMentionKindLabel(char) }}</span>
                      <span v-if="getMentionSummary(char)" class="at-menu-character-summary">{{ getMentionSummary(char) }}</span>
                    </span>
                  </span>
                  <span v-if="props.mentionSelectedChars.includes(String(char.id || ''))" style="font-size: 0.7rem; color: var(--morandi-primary);">{{ t('chat.selected') }}</span>
                  <button @click.stop="props.toggleExcludeChar(String(char.id || ''))"
                          :style="{ background: props.mentionExcludedChars.includes(String(char.id || '')) ? '#e74c3c' : 'none', border: '1px solid #e74c3c', color: props.mentionExcludedChars.includes(String(char.id || '')) ? 'white' : '#e74c3c', cursor: 'pointer', padding: '2px 6px', borderRadius: '4px', fontSize: '0.75rem', marginLeft: 'auto', flexShrink: 0 }">
                    {{ props.mentionExcludedChars.includes(String(char.id || '')) ? t('chat.excluded') : t('chat.exclude') }}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <button
            class="focused-action-btn"
            :class="{ 'focused-action-btn--active': focusedActionActive }"
            type="button"
            :aria-pressed="focusedActionActive"
            :aria-label="t('chat.focusedAction')"
            :title="t('chat.focusedActionHint')"
            @click="toggleFocusedAction"
          >
            <span class="chat-input-action-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="3" />
                <circle cx="12" cy="12" r="9" />
              </svg>
            </span>
            <span class="chat-input-action-title">{{ t('chat.focusedAction') }}</span>
          </button>

          <div class="narration-menu-container" ref="narrationMenuContainerRef" @click.stop>
            <button
              class="narration-trigger-btn"
              type="button"
              :aria-label="t('chat.openNarrationMenu')"
              :title="t('chat.narration')"
              @click.stop="toggleNarrationMenu"
              :disabled="!props.canTriggerManualNarration"
            >
              <span class="chat-input-action-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <path d="M14 14a2 2 0 0 0 2-2V8h-2" />
                  <path d="M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z" />
                  <path d="M8 14a2 2 0 0 0 2-2V8H8" />
                </svg>
              </span>
              <span class="chat-input-action-title">{{ t('chat.narration') }}</span>
            </button>
            <div class="plus-menu narration-menu" v-if="narrationMenuOpen">
              <button type="button" class="plus-menu-item" @click="handleGenerateNarration('event_push')">
                <svg class="plus-menu-item__icon" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M3 3v18h18" />
                  <path d="m7 14 3-3 3 2 5-6" />
                  <path d="M18 7h-4" />
                  <path d="M18 7v4" />
                </svg>
                <span>{{ t('chat.narrationEventPush') }}</span>
              </button>
              <button type="button" class="plus-menu-item" @click="handleGenerateNarration('appearance')">
                <svg class="plus-menu-item__icon" viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="12" cy="8" r="4" />
                  <path d="M6 21a6 6 0 0 1 12 0" />
                  <path d="M9 14.5c1.8.7 4.2.7 6 0" />
                </svg>
                <span>{{ t('chat.narrationAppearance') }}</span>
              </button>
              <button type="button" class="plus-menu-item" @click="handleGenerateNarration('environment')">
                <svg class="plus-menu-item__icon" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M3 16h18" />
                  <path d="M5 16a7 7 0 0 1 14 0" />
                  <path d="M8 21h8" />
                  <path d="M12 3v3" />
                  <path d="M4.2 7.2 6.3 9.3" />
                  <path d="m19.8 7.2-2.1 2.1" />
                </svg>
                <span>{{ t('chat.narrationEnvironment') }}</span>
              </button>
              <div class="plus-menu-submenu-row" tabindex="0">
                <div class="plus-menu-item plus-menu-item--submenu">
                  <svg class="plus-menu-item__icon" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M21 15a4 4 0 0 1-4 4H7l-4 4V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
                    <path d="M9 9h6" />
                    <path d="M9 13h4" />
                  </svg>
                  <span>{{ t('chat.narrationCustom') }}</span>
                  <span class="plus-menu-item__chevron" aria-hidden="true">›</span>
                </div>
                <div class="plus-menu plus-menu-submenu">
                  <button
                    v-for="profile in customNarrationProfiles"
                    :key="profile.id"
                    type="button"
                    class="plus-menu-item"
                    @click="handleGenerateCustomNarration(profile.id)"
                  >
                    <span>{{ profile.name || t('chat.narrationUnnamed') }}</span>
                  </button>
                  <div v-if="!customNarrationProfiles.length" class="plus-menu-empty">{{ t('chat.noCustomNarration') }}</div>
                </div>
              </div>
              <div class="plus-menu-submenu-row" tabindex="0">
                <div class="plus-menu-item plus-menu-item--submenu">
                  <svg class="plus-menu-item__icon" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                  </svg>
                  <span>{{ t('chat.narrationManual') }}</span>
                  <span class="plus-menu-item__chevron" aria-hidden="true">›</span>
                </div>
                <div class="plus-menu plus-menu-submenu">
                  <button type="button" class="plus-menu-item" @click="insertNarrationCommand('/旁白')">
                    <span>{{ t('chat.narrationDirect') }}</span>
                  </button>
                  <button type="button" class="plus-menu-item" @click="insertNarrationCommand('/旁白_AGENT补充')">
                    <span>{{ t('chat.narrationAgentPolish') }}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="chat-input-toolbar-right">
          <span v-if="showForegroundTaskHint" class="chat-task-hint" :title="foregroundTaskHintTitle">
            <span class="chat-task-hint__dot" aria-hidden="true"></span>
            <span class="chat-task-hint__label">{{ foregroundTaskLabel }}</span>
            <span v-if="runningExtraCount > 0" class="chat-task-hint__count">+{{ runningExtraCount }}</span>
          </span>
          <button v-if="showStopButton" class="chat-send chat-send--stop" type="button" @click="handleAbortChat" :title="stopButtonTitle">{{ t('chat.stop') }}</button>
          <button v-else class="chat-send chat-send--fly" type="button" @click="handleSendChat" :disabled="!hasInputText" :title="t('chat.send')" :aria-label="t('chat.send')">
            <span class="chat-send-icon-wrap" aria-hidden="true">
              <svg class="chat-send-icon" viewBox="0 0 24 24">
                <path d="M5 12.5 19 5l-4.6 14-3.1-5.2L5 12.5z"/>
                <path d="m11.3 13.8 3.3-3.8"/>
              </svg>
            </span>
            <span class="chat-send-label">{{ t('chat.send') }}</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ComponentPublicInstance } from 'vue'
import { filterChatSlashCommands, getSlashCommandQuery } from '../../../app/chatSlashCommands'
import { maybeAutoCloseDirectiveBracket } from '../../../app/directorDirective'
import { normalizeNarrationProfiles, type NarrationProfile } from '../../../app/narrationProtocol'
import type { ChatSendPayload } from '../../../app/chatSendProtocol'
import type { ChatPanelViewModel } from '../../../types/panelContracts'
import type { PendingImageAttachment } from '../../../composables/app/useImageAttachments'
import ImageAttachmentChips from './ImageAttachmentChips.vue'

type RefTarget = Element | ComponentPublicInstance | null
const { t } = useI18n()
const chatInputLocalRef = ref<HTMLTextAreaElement | null>(null)
const narrationMenuContainerRef = ref<HTMLElement | null>(null)
const narrationMenuOpen = ref(false)
const focusedActionActive = ref(false)
// 本地输入缓冲：textarea 绑定它而非直接绑 props 真值，配合 composition 守卫，避免中文输入法合成期间被外部回写打断（标点要按两次才生效的根因）。与 MobileChatThread 同源逻辑，后续若要统一改这两处需同步。
const localInputText = ref('')
const isComposingInput = ref(false)
// 拖拽悬停高亮态（输入框图片上传计划批4）：纯 UI 展示态，不是附件数据状态，留在组件本地不违反
// 「ChatInputBar 自己不持有附件状态」——它只是「鼠标正拖着文件悬在输入壳上方」这个瞬时视觉信号。
const isDragActive = ref(false)

const props = defineProps<{
  isTyping: boolean
  hasForegroundChatTask?: boolean
  foregroundChatTaskLabel?: string
  runningChatTaskCount?: number
  evaluationEnabled: boolean
  plusMenuOpen: boolean
  atMenuOpen: boolean
  chatInputText: string
  pendingImageAttachments: PendingImageAttachment[]
  handleImageAttachmentPaste: (event: ClipboardEvent) => boolean
  handleImageAttachmentDrop: (event: DragEvent) => void
  handleImageAttachmentDragOver: (event: DragEvent) => void
  removeImageAttachment: (id: string) => void
  retryImageAttachmentUpload: (id: string) => void
  openFullscreenImage?: (image: string) => void
  mentionSelectedChars: string[]
  mentionExcludedChars: string[]
  filteredAtCharacters: ChatPanelViewModel['filteredAtCharacters']
  getCharNameById: (charId: string) => string
  togglePlusMenu: () => void
  clearCurrentChat: () => void
  requestClearCurrentChatContext?: () => void
  addMentionChar: (charId: string) => void
  removeMentionChar: (index: number) => void
  toggleExcludeChar: (charId: string) => void
  sendChat: (payload?: string | ChatSendPayload) => unknown
  triggerManualNarration?: (options?: { kind?: 'environment' | 'appearance' | 'event_push'; profileId?: string; candidateBatchId?: string; candidateId?: string }) => void
  abortChat: () => void
  openChatSummary: () => unknown
  openChatHistory: () => void
  toggleEvaluation: () => void
  inputChatText: (value: string, event: Event) => void
  setMenuContainerRef: (el: RefTarget) => void
  setChatInputRef: (el: RefTarget) => void
  allowSummaryAction?: boolean
  canTriggerManualNarration?: boolean
  narrationProfiles?: unknown
}>()

const emit = defineEmits([
  'update:plus-menu-open',
  'update:at-menu-open',
  'clear-mention-selected'
])

const slashCommandQuery = computed(() => getSlashCommandQuery(props.chatInputText))
const filteredSlashCommands = computed(() => filterChatSlashCommands(slashCommandQuery.value || ''))
const showSlashCommandPanel = computed(() => slashCommandQuery.value !== null)
const hasReadyImageAttachment = computed(() => props.pendingImageAttachments.some((img) => img.status === 'ready'))
const hasInputText = computed(() => Boolean(String(props.chatInputText || '').trim()) || hasReadyImageAttachment.value)
const hasForegroundChatTask = computed(() => Boolean(props.hasForegroundChatTask || props.isTyping))
const foregroundTaskLabel = computed(() => String(props.foregroundChatTaskLabel || (props.isTyping ? t('chat.generating') : t('chat.taskRunning'))).trim())
// 停止优先（2026-07-06 用户拍板）：只要有任务在跑，停止按钮常驻可按（不再被已输入文字顶回发送按钮）；
// 运行中仍可按 Enter 直接发送（发送即打断当前轮）。与移动端 MobileChatThread 停止条件同口径（联动，改口径需同步）。
const showStopButton = computed(() => hasForegroundChatTask.value)
const showForegroundTaskHint = computed(() => hasForegroundChatTask.value && Boolean(foregroundTaskLabel.value))
const runningExtraCount = computed(() => Math.max(0, Number(props.runningChatTaskCount || 0) - 1))
const foregroundTaskHintTitle = computed(() => runningExtraCount.value > 0
  ? t('chat.taskHintExtra', { label: foregroundTaskLabel.value, count: runningExtraCount.value })
  : foregroundTaskLabel.value)
const stopButtonTitle = computed(() => t('chat.stopTask', { label: foregroundTaskLabel.value }))
const customNarrationProfiles = computed<NarrationProfile[]>(() => {
  return normalizeNarrationProfiles(props.narrationProfiles).filter((profile) => !['environment', 'appearance', 'event_push'].includes(String(profile.id || '')))
})
// 桌面输入框收起三态（2026-07-12）：默认收起一行，:hover / :focus-within 展开由 main.css 处理；
// 这里只算「强制展开」（keep-open）条件——有文字草稿 / 有图片附件 / 正在拖拽图片悬停，任一为真则鼠标移开也保持展开。
// 移动端 MobileChatThread 是独立实现，本收起逻辑桌面端专属，不需要同步。
const keepInputExpanded = computed(() => {
  return Boolean(localInputText.value.trim()) || props.pendingImageAttachments.length > 0 || isDragActive.value
})

function focusChatInputAtEnd() {
  nextTick(() => {
    const input = chatInputLocalRef.value
    if (!input) return
    const position = input.value.length
    input.focus()
    input.setSelectionRange(position, position)
  })
}

function handleNarrationOutside(event: MouseEvent) {
  const container = narrationMenuContainerRef.value
  if (container && !container.contains(event.target as Node)) {
    narrationMenuOpen.value = false
  }
}

onMounted(() => {
  document.addEventListener('mousedown', handleNarrationOutside)
})

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', handleNarrationOutside)
})

function handleSummaryClick() {
  props.openChatSummary()
  emit('update:plus-menu-open', false)
}

function handleConversationManagerClick() {
  props.openChatHistory()
  emit('update:plus-menu-open', false)
}

function handleNewChatClick() {
  props.clearCurrentChat()
  emit('update:plus-menu-open', false)
}

function handleClearChatClick() {
  props.requestClearCurrentChatContext?.()
  emit('update:plus-menu-open', false)
}

function handleMentionClick() {
  emit('update:at-menu-open', true)
  emit('update:plus-menu-open', false)
  narrationMenuOpen.value = false
}

function handleTogglePlusMenu() {
  narrationMenuOpen.value = false
  props.togglePlusMenu()
}

function handleToggleAiEval() {
  props.toggleEvaluation()
  emit('update:plus-menu-open', false)
}

// 外部真值变化（程序化填入命令、清空、旁白模板等）时同步回本地缓冲；合成进行中不覆盖，避免打断输入法。
watch(
  () => props.chatInputText,
  (value) => {
    if (isComposingInput.value) return
    localInputText.value = String(value || '')
  },
  { immediate: true }
)

// 私密提调指令自动补全：插入类输入后，若刚打出「【【」则自动补「】】」、光标留中间。
// 直接改写 textarea.value 与光标并回写真值；非插入（删除等）不调用，避免删不掉空指令。与 MobileChatThread 同源。
function applyDirectiveAutoClose(textarea: HTMLTextAreaElement, value: string): string {
  const result = maybeAutoCloseDirectiveBracket(value, textarea.selectionStart ?? value.length)
  if (!result.changed) return value
  textarea.value = result.value
  textarea.setSelectionRange(result.caret, result.caret)
  return result.value
}

function handleInput(event: Event) {
  // 合成期间（中文/标点拼写中）不回写真值，否则会触发重渲染把 textarea value 重置、打断输入法。
  if (isComposingInput.value || (event as InputEvent).isComposing) return
  const textarea = event.target as HTMLTextAreaElement
  let value = textarea.value
  // 仅插入类输入触发自动补全（删除/历史回退不触发）。
  if (String((event as InputEvent).inputType || '').startsWith('insert')) {
    value = applyDirectiveAutoClose(textarea, value)
  }
  localInputText.value = value
  props.inputChatText(value, event)
}

function handleCompositionStart() {
  isComposingInput.value = true
}

function handleCompositionEnd(event: CompositionEvent) {
  isComposingInput.value = false
  const textarea = event.target as HTMLTextAreaElement
  // 合成结束属于插入，需触发自动补全（中文输入法下「【【」常在合成结束才落定）。
  const value = applyDirectiveAutoClose(textarea, textarea.value)
  localInputText.value = value
  props.inputChatText(value, event)
}

function canScrollInWheelDirection(element: HTMLElement, deltaY: number) {
  const maxScrollTop = Math.max(0, element.scrollHeight - element.clientHeight)
  if (maxScrollTop <= 1) return false
  if (deltaY < 0) return element.scrollTop > 0
  if (deltaY > 0) return element.scrollTop < maxScrollTop
  return false
}

function findChatMessagesArea(source: EventTarget | null) {
  const element = source instanceof HTMLElement ? source : null
  const chatMain = element?.closest('.chat-main') || document.querySelector('.chat-main')
  return chatMain?.querySelector('.chat-messages') as HTMLElement | null
}

function forwardWheelToChatMessages(event: WheelEvent) {
  const messagesArea = findChatMessagesArea(event.currentTarget)
  if (!messagesArea || !event.deltaY) return
  messagesArea.scrollTop += event.deltaY
  event.preventDefault()
  event.stopPropagation()
}

function handleChatInputWheel(event: WheelEvent) {
  const input = event.currentTarget as HTMLTextAreaElement
  if (canScrollInWheelDirection(input, event.deltaY)) {
    event.stopPropagation()
    return
  }
  forwardWheelToChatMessages(event)
}

function handleInputShellWheel(event: WheelEvent) {
  const target = event.target instanceof HTMLElement ? event.target : null
  if (target?.closest('textarea.chat-input, .plus-menu, .at-menu, .slash-command-panel')) return
  forwardWheelToChatMessages(event)
}

function selectSlashCommand(commandText: string) {
  const nextText = `${commandText} `
  props.inputChatText(nextText, new Event('input'))
  focusChatInputAtEnd()
}

function toggleNarrationMenu() {
  narrationMenuOpen.value = !narrationMenuOpen.value
  if (narrationMenuOpen.value) {
    emit('update:plus-menu-open', false)
    emit('update:at-menu-open', false)
  }
}

async function handleGenerateNarration(kind: 'environment' | 'appearance' | 'event_push') {
  if (!props.canTriggerManualNarration || typeof props.triggerManualNarration !== 'function') return
  narrationMenuOpen.value = false
  try {
    await props.triggerManualNarration({ kind })
  } catch (error) {
    console.error('生成旁白失败:', error)
  }
}

async function handleGenerateCustomNarration(profileId: string) {
  if (!profileId || !props.canTriggerManualNarration || typeof props.triggerManualNarration !== 'function') return
  narrationMenuOpen.value = false
  try {
    await props.triggerManualNarration({ profileId })
  } catch (error) {
    console.error('生成自定义旁白失败:', error)
  }
}

function buildNarrationCommandText(command: '/旁白' | '/旁白_AGENT补充') {
  const current = String(props.chatInputText || '').trim()
  const content = current.replace(/^\/旁白(?:_AGENT补充)?(?:[\s　]+)?/i, '').trim()
  return content ? `${command} ${content}` : `${command} `
}

function insertNarrationCommand(command: '/旁白' | '/旁白_AGENT补充') {
  const nextText = buildNarrationCommandText(command)
  props.inputChatText(nextText, new Event('input'))
  narrationMenuOpen.value = false
  emit('update:plus-menu-open', false)
  emit('update:at-menu-open', false)
  focusChatInputAtEnd()
}

function bindChatInputRef(el: RefTarget) {
  chatInputLocalRef.value = el instanceof HTMLTextAreaElement ? el : null
  props.setChatInputRef(el)
}

function resetInputBox() {
  if (!chatInputLocalRef.value) return
  chatInputLocalRef.value.style.height = '38px'
  chatInputLocalRef.value.style.minHeight = '38px'
}

// 原 @keydown.enter.exact.prevent 语义：无修饰键的回车才发送；IME 选字确认回车会以 key==='Enter'
// 触发（isComposing=true / keyCode 229），必须放行原生行为，否则把半拼文本发出去（同 MobileChatThread.vue 口径）。
function handleInputKeydown(event: KeyboardEvent) {
  // 原 Vue 内置 enter 修饰符按小写比较，这里手写判断沿用同一口径（兼容测试用 trigger('keydown.enter') 产生的小写 key）。
  if (String(event.key || '').toLowerCase() !== 'enter' || event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return
  if (isComposingInput.value || event.isComposing || event.keyCode === 229) return
  event.preventDefault()
  void handleSendChat()
}

async function handleSendChat() {
  try {
    // 图片附件（批4）：hasInputText 现在文字为空但有 ready 附件也算「有内容」，一并重置输入框高度。
    if (props.chatInputText.trim() || hasReadyImageAttachment.value) {
      resetInputBox()
    }
    // 正文与动作身份按同一个原子载荷发送，不能依赖命令桥之后再从可变输入框补正文。
    const payload: ChatSendPayload = { text: String(localInputText.value || props.chatInputText || '') }
    if (focusedActionActive.value) payload.inputKind = 'focused_action'
    await props.sendChat(payload)
    focusedActionActive.value = false
  } catch (error) {
    console.error('发送聊天消息失败:', error)
  }
}

function toggleFocusedAction() {
  focusedActionActive.value = !focusedActionActive.value
  narrationMenuOpen.value = false
  emit('update:plus-menu-open', false)
  emit('update:at-menu-open', false)
  focusChatInputAtEnd()
}

async function handleAbortChat() {
  try {
    await props.abortChat()
  } catch (error) {
    console.error('停止聊天失败:', error)
  }
}

function handleTextareaPaste(event: ClipboardEvent) {
  if (props.handleImageAttachmentPaste(event)) {
    event.preventDefault()
  }
}

function handleInputShellDragOver(event: DragEvent) {
  isDragActive.value = true
  props.handleImageAttachmentDragOver(event)
}

function handleInputShellDragLeave(event: DragEvent) {
  // relatedTarget 仍在输入壳内（子元素间移动）时不摘掉高亮，避免子元素密集导致的闪烁。
  const next = event.relatedTarget as Node | null
  if (next && (event.currentTarget as HTMLElement)?.contains(next)) return
  isDragActive.value = false
}

function handleInputShellDrop(event: DragEvent) {
  isDragActive.value = false
  props.handleImageAttachmentDrop(event)
}

function handlePreviewAttachment(url: string) {
  props.openFullscreenImage?.(url)
}

async function handleTriggerManualNarration() {
  if (!props.canTriggerManualNarration || typeof props.triggerManualNarration !== 'function') return
  try {
    await props.triggerManualNarration({ kind: 'event_push' })
  } catch (error) {
    console.error('手动生成旁白失败:', error)
  }
}

function getMentionSummary(character: Record<string, unknown>): string {
  const source = character.desc || character.description || character.personality || character.speaking_style || character.speakingStyle || ''
  return String(source || '').replace(/\s+/g, ' ').trim().slice(0, 15)
}

function getMentionKindLabel(character: Record<string, unknown>): string {
  return character.kind === 'sessionTemporary' ? t('chat.tempCharacter') : t('chat.formalCharacter')
}
</script>

<style scoped>
.chat-input-shell {
  width: 100%;
  padding-bottom: calc(22px + env(safe-area-inset-bottom, 0px));
  box-sizing: border-box;
  border-radius: 14px;
  transition: box-shadow 0.16s ease;
}

/* 拖拽悬停高亮态（输入框图片上传计划批4）：只给输入壳一圈柔和光晕，不改变布局尺寸。 */
.chat-input-shell--drag-active {
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--morandi-primary) 45%, transparent);
}

.chat-input-attachment-chips {
  position: absolute;
  left: 0;
  bottom: calc(100% + 8px);
  z-index: 104;
}

.at-menu-character {
  display: flex;
  flex: 1;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}

.at-menu-character-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.at-menu-character-meta {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 6px;
  font-size: 0.7rem;
  color: var(--morandi-text-light);
}

.at-menu-character-kind {
  flex-shrink: 0;
}

.at-menu-character-summary {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.plus-menu-item {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 6px;
  width: 100%;
  padding: 10px 12px 10px 8px;
  border: 0;
  background: transparent;
  color: var(--morandi-text);
  font-family: inherit;
  text-align: left;
}

.plus-menu-item:hover,
.plus-menu-item:focus-visible {
  background: rgba(176, 156, 148, 0.15);
  outline: 0;
}

.plus-menu-item--danger {
  color: #a9574e;
}

.plus-menu-item--danger:hover,
.plus-menu-item--danger:focus-visible {
  background: rgba(169, 87, 78, 0.12);
}

.plus-menu-item__icon {
  width: 15px;
  height: 15px;
  flex: 0 0 auto;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.narration-menu-container {
  position: relative;
  display: inline-flex;
  align-items: center;
  height: 28px;
}

.focused-action-btn {
  font: inherit;
}

.focused-action-btn--active {
  color: var(--morandi-primary);
}

.focused-action-btn--active::before {
  transform: translateX(0);
}

.narration-menu {
  min-width: 196px;
}

.chat-input-toolbar-right {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  min-width: 0;
  flex: 1 1 auto;
}

.chat-task-hint {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
  max-width: min(180px, 34vw);
  color: var(--morandi-text-light);
  font-size: 0.72rem;
  line-height: 1;
  white-space: nowrap;
}

.chat-task-hint__dot {
  width: 6px;
  height: 6px;
  flex: 0 0 auto;
  border-radius: 999px;
  background: var(--morandi-primary);
  opacity: 0.68;
}

.chat-task-hint__label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.chat-task-hint__count {
  flex: 0 0 auto;
  color: var(--morandi-primary);
  font-size: 0.68rem;
}

.plus-menu-submenu-row {
  position: relative;
}

.plus-menu-item--submenu {
  cursor: default;
}

.plus-menu-item__chevron {
  margin-left: auto;
  color: var(--morandi-text-light);
  font-size: 1rem;
  line-height: 1;
}

.plus-menu-submenu {
  top: auto;
  bottom: -1px;
  left: calc(100% - 1px);
  display: none;
  min-width: 176px;
  margin-bottom: 0;
  box-shadow: none;
}

.plus-menu-submenu-row:hover > .plus-menu-submenu,
.plus-menu-submenu-row:focus-within > .plus-menu-submenu {
  display: block;
}

.plus-menu-empty {
  padding: 10px 12px;
  color: var(--morandi-text-light);
  font-size: 0.82rem;
  white-space: nowrap;
}

.chat-input-area {
  position: relative;
  isolation: isolate;
  overflow: hidden;
}

.chat-input-area::before {
  position: absolute;
  inset: 0;
  z-index: -1;
  border-radius: inherit;
  background: color-mix(in srgb, var(--morandi-primary) 10%, var(--morandi-card));
  clip-path: circle(0 at 84px calc(100% - 26px));
  content: '';
  pointer-events: none;
  transition: clip-path 0.3s cubic-bezier(0.22, 1, 0.36, 1);
}

.chat-input-area--focused-action::before {
  clip-path: circle(150% at 84px calc(100% - 26px));
}

@media (prefers-reduced-motion: reduce) {
  .chat-input-area::before {
    transition: none;
  }
}

.slash-command-panel {
  position: absolute;
  left: 0;
  right: 0;
  bottom: calc(100% + 8px);
  z-index: 105;
  overflow: hidden;
  max-height: min(300px, 42vh);
  padding: 4px;
  border: 1px solid var(--morandi-border);
  border-radius: 8px;
  background: var(--morandi-card);
  box-shadow: 0 -3px 14px rgba(64, 54, 45, 0.1);
}

.slash-command-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 7px 5px;
  border-bottom: 1px solid rgba(139, 115, 85, 0.14);
  color: var(--morandi-text-light);
  font-size: 0.72rem;
}

.slash-command-item {
  display: grid;
  grid-template-columns: minmax(128px, 156px) minmax(0, 1fr);
  align-items: center;
  width: 100%;
  gap: 8px;
  padding: 6px 7px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--morandi-text);
  text-align: left;
  cursor: pointer;
}

.slash-command-item:hover,
.slash-command-item:focus-visible {
  background: rgba(176, 156, 148, 0.14);
  outline: none;
}

.slash-command-item__command {
  min-width: 0;
  color: var(--morandi-primary);
  font-family: "Cascadia Mono", "Consolas", monospace;
  font-size: 0.9rem;
  font-weight: 700;
  line-height: 1.2;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.slash-command-item__content {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}

.slash-command-item__title {
  min-width: 0;
  overflow: hidden;
  color: var(--morandi-text);
  font-size: 0.78rem;
  font-weight: 500;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.slash-command-item__summary {
  overflow: hidden;
  color: var(--morandi-text-light);
  font-size: 0.72rem;
  line-height: 1.3;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.slash-command-empty {
  padding: 12px 8px 10px;
  color: var(--morandi-text-light);
  font-size: 0.82rem;
  text-align: center;
}

</style>
