<template>
  <RecallTracePanel
    class="mobile-recall-panel"
    :thinking-text="chatVm.streamingText"
    :thinking-speaker-name="chatVm.currentStreamingSpeakerName || chatVm.currentChatTitle"
    :is-thinking="Boolean(chatVm.isTyping)"
    :message-navigation-items="navigationItems"
    :active-message-id="activeMessageId"
    :cache-scope-key="chatVm.activeSessionId || ''"
    :can-use-detail-panel="props.canUseDetailPanel"
    @select-message="selectMessage"
    @jump-unit="onJumpUnit"
    @close="$emit('close')"
  />
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import RecallTracePanel from '../app/chat/RecallTracePanel.vue'
import {
  setCurrentRecallActivity,
  showActiveRecallActivityInPanel,
  setRecallActivityPanelBinding,
  useRecallTraceState,
  type RecallActivityRun
} from '../../app/recallTraceState'
import { isPublicRecallEvent } from '../../app/recallPublicMilestones'
import {
  loadAllChatRecallActivityLogsBySessionId,
  locateChatRecallActivityLogBySessionId
} from '../../repositories/chatRepository'
import { stripAiThoughtContent } from '../../utils/aiOutput'
import type { ChatRecallActivityLogEntry } from '../../types'
import type { DesktopPanelState } from '../../types/panelContracts'

// 移动端召回面板宿主：复刻桌面 AppChatSection 的召回数据加载核心（历史日志 + 共享召回态），
// 让复用的 RecallTracePanel 在移动壳里也能显示真实召回过程；数据真值仍走 chatRepository 与共享单例，
// 不新建移动端私有召回真值。与桌面联动：桌面侧逻辑在 AppChatSection.vue（refreshRecallActivityLogEntries /
// handleOpenThinkingPanel），后续若召回加载协议变动，两处需同步。
const props = defineProps<{
  state: DesktopPanelState
  open: boolean
  // 指定初始定位的消息 id（消息行「召回」按钮直达该条）；0/未传则打开最近一条有召回的消息
  initialMessageId?: number
  // 本地工作区直接开放召回详情，复用桌面端 RecallTracePanel。
  canUseDetailPanel?: boolean
}>()

defineEmits<{ close: [] }>()

const { t } = useI18n()
const recallState = useRecallTraceState()
const chatVm = computed(() => props.state.chatViewModel)
const logEntries = ref<ChatRecallActivityLogEntry[]>([])
const activeMessageId = ref(0)
let loadSeq = 0
let loadController: AbortController | null = null

function resolveMessageNumericId(message: { id?: unknown } | null | undefined): number {
  const raw = String(message?.id || '').trim()
  return Number(raw.match(/\d+$/)?.[0] || raw)
}

function hasRecallActivityProcess(entry: ChatRecallActivityLogEntry): boolean {
  if (!entry || String(entry.status || '').trim() === 'deleted') return false
  const activity = entry.activity && typeof entry.activity === 'object' ? entry.activity as Record<string, unknown> : {}
  if (Array.isArray(activity.events)) {
    return activity.events.some((event) => isPublicRecallEvent(event as never))
  }
  if (Array.isArray(activity.publicMilestones) && activity.publicMilestones.length > 0) return true
  const result = activity.result && typeof activity.result === 'object' ? activity.result as Record<string, unknown> : null
  return Boolean(result && Array.isArray(result.confirmedIds))
}

function entryMessageIds(entry: ChatRecallActivityLogEntry): number[] {
  return [Number(entry.inputMessageId || 0), Number(entry.assistantMessageId || 0)]
    .filter((item) => Number.isInteger(item) && item > 0)
}

const recallMessageIds = computed(() => {
  const ids = new Set<number>()
  for (const entry of logEntries.value) {
    if (!hasRecallActivityProcess(entry)) continue
    for (const messageId of entryMessageIds(entry)) ids.add(messageId)
  }
  const active = recallState.activity.value || recallState.activeActivity.value
  const binding = recallState.panelBinding.value
  if (active?.events?.length && binding?.messageId) ids.add(Number(binding.messageId))
  return ids
})

function buildExcerpt(text: string): string {
  return stripAiThoughtContent(text)
    .replace(/!\[[^\]]*]\([^)]*\)/g, '')
    .replace(/\[[^\]]*]\([^)]*\)/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 52)
}

const navigationItems = computed(() => {
  const available = recallMessageIds.value
  return (chatVm.value.currentMessages || [])
    .map((message, index) => {
      const messageId = resolveMessageNumericId(message)
      if (!Number.isInteger(messageId) || messageId <= 0) return null
      if (message.role !== 'assistant') return null
      if (!available.has(messageId)) return null
      const excerpt = buildExcerpt(props.state.getDisplayedMessageContent?.(index) || message.content || '')
      if (!excerpt) return null
      return {
        messageId,
        role: 'assistant' as const,
        speakerName: String(message.name || chatVm.value.currentChatTitle || t('chat.characterFallback')),
        excerpt
      }
    })
    .filter((item): item is { messageId: number; role: 'assistant'; speakerName: string; excerpt: string } => Boolean(item))
})

const latestRecallMessageId = computed(() => {
  const available = recallMessageIds.value
  const messages = chatVm.value.currentMessages || []
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message.role !== 'assistant') continue
    const messageId = resolveMessageNumericId(message)
    if (!Number.isInteger(messageId) || messageId <= 0) continue
    if (!available.has(messageId)) continue
    return messageId
  }
  return 0
})

async function refreshLogEntries() {
  const sessionId = String(chatVm.value.activeSessionId || '').trim()
  const seq = ++loadSeq
  loadController?.abort()
  loadController = new AbortController()
  const controller = loadController
  if (!sessionId) {
    logEntries.value = []
    return
  }
  try {
    const entries = await loadAllChatRecallActivityLogsBySessionId(sessionId, {
      signal: controller.signal,
      concurrency: 4
    })
    if (seq !== loadSeq) return
    logEntries.value = entries
  } catch (error) {
    if (seq !== loadSeq) return
    if (controller.signal.aborted) return
    console.error('移动端加载召回日志失败:', error)
    logEntries.value = []
  }
}

// 选中某条消息：定位其召回日志写入共享召回态；若没有历史而当前有正在运行的召回则显示运行态。
async function selectMessage(messageId: number) {
  const numericId = Number(messageId || 0)
  if (!Number.isInteger(numericId) || numericId <= 0) return
  activeMessageId.value = numericId
  const sessionId = String(chatVm.value.activeSessionId || '').trim()
  setRecallActivityPanelBinding(sessionId ? { sessionId, messageId: numericId } : null)
  if (!sessionId) return
  try {
    const entry = await locateChatRecallActivityLogBySessionId(sessionId, numericId)
    if (entry?.activity && hasRecallActivityProcess(entry)) {
      setCurrentRecallActivity(entry.activity as unknown as RecallActivityRun)
    } else if (recallState.activeActivity.value?.status === 'running') {
      showActiveRecallActivityInPanel()
    } else {
      setCurrentRecallActivity(null)
    }
  } catch (error) {
    console.error('移动端加载召回活动失败:', error)
    if (recallState.activeActivity.value?.status === 'running') showActiveRecallActivityInPanel()
    else setCurrentRecallActivity(null)
  }
}

// 跳转单位：移动端聊天页与角色页是独立页面栈，暂不支持从召回直接跳到角色大脑单位。
// 不放假按钮——这里仅记录，遗留缺口已写入计划书，后续若打通跨页导航再补。
function onJumpUnit() {
  console.info('移动端召回面板暂不支持跳转到角色大脑单位')
}

async function openInitial() {
  await refreshLogEntries()
  // 优先定位调用方指定的消息；否则回退到最近一条有召回的消息
  const requested = Number(props.initialMessageId || 0)
  const target = requested > 0 ? requested : latestRecallMessageId.value
  if (target > 0) {
    await selectMessage(target)
  } else if (recallState.activeActivity.value?.status === 'running') {
    showActiveRecallActivityInPanel()
  } else {
    setCurrentRecallActivity(null)
  }
}

watch(
  () => [props.open, chatVm.value.activeSessionId, props.initialMessageId] as const,
  ([open]) => {
    if (open) {
      void openInitial()
      return
    }
    loadSeq += 1
    loadController?.abort()
  },
  { immediate: true }
)

onBeforeUnmount(() => {
  loadSeq += 1
  loadController?.abort()
})
</script>

<style scoped>
.mobile-recall-panel {
  width: 100%;
}
</style>
