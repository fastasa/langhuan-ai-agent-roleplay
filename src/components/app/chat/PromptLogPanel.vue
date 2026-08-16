<template>
  <div class="prompt-log-panel">
    <div class="prompt-log-panel__toolbar">
      <div class="prompt-log-panel__meta">
        <div class="prompt-log-panel__meta-item">
          <span class="prompt-log-panel__meta-label">{{ t('chat.currentChat') }}</span>
          <span class="prompt-log-panel__meta-value" :title="currentTargetLabel">{{ currentTargetLabel }}</span>
        </div>
        <div v-if="pageData.totalEntries > 0" class="prompt-log-panel__meta-item">
          <span class="prompt-log-panel__meta-label">{{ t('chat.logs') }}</span>
          <span class="prompt-log-panel__meta-value">{{ t('chat.itemsCount', { count: pageData.totalEntries }) }}</span>
        </div>
      </div>
      <div class="prompt-log-panel__pager">
        <button class="btn btn-small btn-secondary" type="button" :disabled="loading || currentPage <= 1" @click="loadPage(currentPage - 1)">
          {{ t('chat.prevPage') }}
        </button>
        <span class="prompt-log-panel__pager-index">{{ t('chat.pageIndex', { current: currentPage, total: pageData.totalPages || 1 }) }}</span>
        <button class="btn btn-small btn-secondary" type="button" :disabled="loading || currentPage >= (pageData.totalPages || 1)" @click="loadPage(currentPage + 1)">
          {{ t('chat.nextPage') }}
        </button>
      </div>
    </div>

    <div v-if="loading" class="prompt-log-panel__empty">{{ t('chat.loadingPromptLog') }}</div>
    <div v-else-if="errorText" class="prompt-log-panel__empty prompt-log-panel__empty--error">{{ errorText }}</div>
    <div v-else-if="focusNotice" class="prompt-log-panel__empty prompt-log-panel__empty--notice">{{ focusNotice }}</div>
    <div v-else-if="!displayPromptLogItems.length" class="prompt-log-panel__empty">{{ t('chat.noPromptLog') }}</div>
    <div v-else class="prompt-log-panel__list">
      <article
        v-for="item in displayPromptLogItems"
        :key="item.id"
        :ref="(el) => bindLogCardRef(item.id, el)"
        class="prompt-log-entry"
        :class="{ 'prompt-log-entry--focus': isItemFocused(item) }"
      >
        <header class="prompt-log-entry__header">
          <div>
            <div class="prompt-log-entry__title">{{ item.speakerName || t('chat.currentCharacterFallback') }}</div>
            <div class="prompt-log-entry__desc">
              <span>{{ formatCreatedAt(item.createdAt) }}</span>
              <span v-if="item.assistantMessageId">{{ t('chat.messageNo', { id: item.assistantMessageId }) }}</span>
              <span>{{ formatPromptLogTotalIndex(item) }}</span>
              <span v-if="formatPromptLogKindIndex(item)">{{ formatPromptLogKindIndex(item) }}</span>
              <span v-if="item.logKind === 'message_projection'" class="prompt-log-entry__tag">{{ t('chat.projectionPrompt') }}</span>
            </div>
          </div>
          <button
            v-if="projectionToggleLabel(item)"
            type="button"
            class="btn btn-small btn-secondary prompt-log-entry__toggle"
            @click="toggleProjectionView(item)"
          >{{ projectionToggleLabel(item) }}</button>
        </header>

        <div v-if="isDeletedLog(item)" class="prompt-log-entry__deleted">{{ t('chat.deleted') }}</div>

        <section v-else class="prompt-log-entry__section">
          <div class="prompt-log-entry__section-heading">
            <h4>{{ t('chat.fullPrompt') }}</h4>
            <span>{{ t('chat.promptBlocksCount', { count: getDisplayBlocks(item).length || 0 }) }}</span>
          </div>
          <div class="prompt-log-blocks" :aria-label="t('chat.promptBlockList')">
            <div v-for="(block, index) in getDisplayBlocks(item)" :key="`${item.id}-${index}`" class="prompt-log-block">
              <div class="prompt-log-block__label">
                <span class="prompt-log-block__title">{{ block.title }}</span>
                <span class="prompt-log-block__role">{{ formatBlockRole(block.role) }}</span>
              </div>
              <pre class="prompt-log-block__content">{{ block.content }}</pre>
            </div>
          </div>
        </section>
      </article>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch, type ComponentPublicInstance } from 'vue'
import { useI18n } from 'vue-i18n'
import { clearPromptLogFocus, promptLogFocusLogId, promptLogFocusMessageId } from '../../../app/promptLogPanelState'
import {
  fetchChatPromptLogs,
  fetchChatPromptLogsBySessionId,
  getChatStoreActiveSessionId,
  getChatStoreActiveTargetId,
  locateChatPromptLog,
  locateChatPromptLogByLogId,
  locateChatPromptLogBySessionId,
  locateChatPromptLogBySessionLogId
} from '../../../repositories/chatRepository'
import { useChatStore } from '../../../stores/chatStore'
import type { ChatPromptLogPage } from '../../../types'

const props = defineProps<{
  open: boolean
  focusMessageId?: number
}>()

const { t } = useI18n()
const chatStore = useChatStore()
const loading = ref(false)
const errorText = ref('')
const currentPage = ref(1)
const focusedLogId = ref('')
const focusedMessageId = ref(0)
// 当前聚焦日志是“回复提示词”还是“投影提示词”，以及该消息是否两类都存在（用于切换按钮）
const focusedLogKind = ref<'final_reply' | 'message_projection'>('final_reply')
const focusedHasReply = ref(false)
const focusedHasProjection = ref(false)
const focusNotice = ref('')
const projectionVisibleMessageIds = ref<Set<number>>(new Set())
const pageData = ref<ChatPromptLogPage>({
  sessionId: '',
  currentPage: 1,
  pageSize: 30,
  totalEntries: 0,
  totalPages: 1,
  items: []
})
const logCardRefs = ref<Record<string, HTMLElement | null>>({})

const currentTarget = computed(() => String(getChatStoreActiveTargetId(chatStore) || ''))
const currentSessionId = computed(() => String(getChatStoreActiveSessionId(chatStore) || ''))
const currentLogScope = computed(() => currentSessionId.value || currentTarget.value)
const currentTargetLabel = computed(() => currentLogScope.value || t('chat.noChatSelected'))
type PromptLogEntry = ChatPromptLogPage['items'][number]
type PromptLogPair = {
  reply?: PromptLogEntry
  projection?: PromptLogEntry
}

const promptLogPairsByMessageId = computed(() => {
  const map = new Map<number, PromptLogPair>()
  for (const item of pageData.value.items) {
    const messageId = getPromptLogMessageId(item)
    if (!messageId) continue
    const pair = map.get(messageId) || {}
    if (item.logKind === 'message_projection') {
      pair.projection = item
    } else if (!pair.reply) {
      pair.reply = item
    }
    map.set(messageId, pair)
  }
  return map
})

const displayPromptLogItems = computed(() => {
  const result: PromptLogEntry[] = []
  for (const item of pageData.value.items) {
    const messageId = getPromptLogMessageId(item)
    if (!messageId) {
      result.push(item)
      continue
    }
    const pair = promptLogPairsByMessageId.value.get(messageId)
    if (item.logKind === 'message_projection') {
      const hasReply = Boolean(pair?.reply || item.hasReply)
      if (projectionVisibleMessageIds.value.has(messageId) || !hasReply) result.push(item)
      continue
    }
    result.push(projectionVisibleMessageIds.value.has(messageId) && pair?.projection
      ? pair.projection
      : item)
  }
  return result
})

function bindLogCardRef(logId: string, el: Element | ComponentPublicInstance | null) {
  logCardRefs.value[logId] = el instanceof HTMLElement ? el : null
}

function getPromptLogMessageId(item: PromptLogEntry) {
  const messageId = Number(item.assistantMessageId || 0)
  return Number.isFinite(messageId) && messageId > 0 ? messageId : 0
}

function setProjectionVisible(messageId: number, visible: boolean) {
  if (!messageId) return
  const next = new Set(projectionVisibleMessageIds.value)
  if (visible) next.add(messageId)
  else next.delete(messageId)
  projectionVisibleMessageIds.value = next
}

function formatCreatedAt(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value || t('chat.justNow')
  return date.toLocaleString('zh-CN')
}

function isDeletedLog(item: ChatPromptLogPage['items'][number]) {
  return Boolean(item.deleted) || (String(item.finalPrompt || '').trim() === '已删除' && !item.promptBlocks?.length)
}

function getDisplayBlocks(item: ChatPromptLogPage['items'][number]) {
  if (item.promptBlocks?.length) return item.promptBlocks
  if (String(item.finalPrompt || '').trim()) {
    return [{ role: 'system' as const, title: t('chat.finalPrompt'), content: item.finalPrompt }]
  }
  return []
}

function formatBlockRole(role: string) {
  if (role === 'system') return 'SYSTEM'
  if (role === 'assistant') return 'ASSISTANT'
  if (role === 'user') return 'USER'
  return String(role || '').toUpperCase()
}

function getPromptLogMessageKind(item: ChatPromptLogPage['items'][number]) {
  const raw = String(item.messageKind || '').trim()
  if (raw === 'narration') return 'narration'
  if (raw === 'narration_debug') return 'narration_debug'
  return 'chat'
}

function getFallbackPromptLogTotalIndex(item: ChatPromptLogPage['items'][number]) {
  const page = Math.max(1, Number(pageData.value.currentPage || currentPage.value || 1))
  const pageSize = Math.max(1, Number(pageData.value.pageSize || 30))
  const localIndex = Math.max(0, displayPromptLogItems.value.findIndex((entry) => entry.id === item.id))
  const descendingIndex = (page - 1) * pageSize + localIndex
  const total = Number(pageData.value.totalEntries || 0)
  return Math.max(1, total - descendingIndex)
}

function formatPromptLogTotalIndex(item: ChatPromptLogPage['items'][number]) {
  const index = Number(item.totalIndex || 0) || getFallbackPromptLogTotalIndex(item)
  const total = Number(item.totalCount || 0) || Number(pageData.value.totalEntries || 0) || index
  return t('chat.totalIndex', { index, total })
}

function formatPromptLogKindIndex(item: ChatPromptLogPage['items'][number]) {
  const index = Number(item.kindIndex || 0)
  const total = Number(item.kindTotal || 0)
  if (!index || !total) return ''
  const kind = getPromptLogMessageKind(item)
  const label = kind === 'narration_debug' ? t('chat.debug') : (kind === 'narration' ? t('chat.narration') : t('chat.characterFallback'))
  return `${label} ${index}/${total}`
}

async function loadPage(page = 1) {
  if (!currentLogScope.value) return
  loading.value = true
  errorText.value = ''
  focusNotice.value = ''
  try {
    const data = currentSessionId.value
      ? await fetchChatPromptLogsBySessionId(currentSessionId.value, page)
      : await fetchChatPromptLogs(currentTarget.value, page)
    pageData.value = data
    currentPage.value = data.currentPage || page
  } catch (error) {
    errorText.value = error instanceof Error ? error.message : t('chat.loadPromptLogFailed')
  } finally {
    loading.value = false
  }
}

function scrollFocusedLogToTop(logId: string) {
  const target = logCardRefs.value[logId]
  if (!target) return
  target.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

async function focusByMessageId(messageId: number, kind: '' | 'final_reply' | 'message_projection' = '') {
  if (!currentLogScope.value || !messageId) return
  try {
    errorText.value = ''
    focusNotice.value = ''
    focusedMessageId.value = messageId
    const located = currentSessionId.value
      ? await locateChatPromptLogBySessionId(currentSessionId.value, messageId, kind)
      : await locateChatPromptLog(currentTarget.value, messageId, kind)
    focusedLogId.value = String(located.logId || '')
    // 记录本次定位到的种类与该消息可用的两类日志，决定切换按钮的方向
    focusedLogKind.value = located.entry?.logKind === 'message_projection'
      ? 'message_projection'
      : (kind === 'message_projection' ? 'message_projection' : 'final_reply')
    focusedHasReply.value = located.hasReply !== false
    focusedHasProjection.value = located.hasProjection === true
    setProjectionVisible(messageId, focusedLogKind.value === 'message_projection')
    await loadPage(located.page || 1)
    await nextTick()
    scrollFocusedLogToTop(focusedLogId.value)
  } catch (error) {
    focusedLogId.value = ''
    focusedHasReply.value = false
    focusedHasProjection.value = false
    pageData.value = {
      sessionId: currentSessionId.value || currentTarget.value,
      currentPage: 1,
      pageSize: 30,
      totalEntries: 0,
      totalPages: 1,
      items: []
    }
    focusNotice.value = error instanceof Error && error.message
      ? error.message
      : t('chat.noPromptLogForMessage', { id: messageId })
  } finally {
    clearPromptLogFocus()
  }
}

async function focusByLogId(logId: string) {
  const normalizedLogId = String(logId || '').trim()
  if (!currentLogScope.value || !normalizedLogId) return
  try {
    errorText.value = ''
    focusNotice.value = ''
    focusedMessageId.value = 0
    // 直接按日志 id 定位（如调试消息跳转）不提供回复/投影切换
    focusedHasReply.value = false
    focusedHasProjection.value = false
    const located = currentSessionId.value
      ? await locateChatPromptLogBySessionLogId(currentSessionId.value, normalizedLogId)
      : await locateChatPromptLogByLogId(currentTarget.value, normalizedLogId)
    focusedLogId.value = String(located.logId || normalizedLogId)
    const locatedMessageId = located.entry ? getPromptLogMessageId(located.entry) : 0
    if (locatedMessageId) setProjectionVisible(locatedMessageId, located.entry?.logKind === 'message_projection')
    await loadPage(located.page || 1)
    await nextTick()
    scrollFocusedLogToTop(focusedLogId.value)
  } catch (error) {
    focusedLogId.value = ''
    pageData.value = {
      sessionId: currentSessionId.value || currentTarget.value,
      currentPage: 1,
      pageSize: 30,
      totalEntries: 0,
      totalPages: 1,
      items: []
    }
    focusNotice.value = error instanceof Error && error.message
      ? error.message
      : t('chat.cannotLocateLog', { id: normalizedLogId })
  } finally {
    clearPromptLogFocus()
  }
}

watch(() => props.open, async (open) => {
  if (!open) return
  focusNotice.value = ''
  const logId = String(promptLogFocusLogId.value || '').trim()
  if (logId) {
    await focusByLogId(logId)
    return
  }
  const messageId = Number(props.focusMessageId || promptLogFocusMessageId.value || 0)
  if (messageId > 0) {
    await focusByMessageId(messageId)
    return
  }
  focusedLogId.value = ''
  focusedMessageId.value = 0
  projectionVisibleMessageIds.value = new Set()
  await loadPage(1)
})

watch(currentLogScope, async () => {
  if (!props.open) return
  focusNotice.value = ''
  focusedLogId.value = ''
  focusedMessageId.value = 0
  focusedHasReply.value = false
  focusedHasProjection.value = false
  projectionVisibleMessageIds.value = new Set()
  await loadPage(1)
})

// 当前卡片是否为聚焦项（优先按日志 id，退回按消息 id）
function isItemFocused(item: ChatPromptLogPage['items'][number]) {
  if (focusedLogId.value) return focusedLogId.value === item.id
  return focusedMessageId.value > 0 && focusedMessageId.value === Number(item.assistantMessageId || 0)
}

// 聚焦卡片上的“回复 / 投影提示词”切换按钮文案；返回空串表示不显示按钮
function projectionToggleLabel(item: ChatPromptLogPage['items'][number]) {
  const messageId = getPromptLogMessageId(item)
  if (!messageId) return ''
  const pair = promptLogPairsByMessageId.value.get(messageId)
  if (item.logKind === 'message_projection') {
    return pair?.reply || item.hasReply ? t('chat.backToReplyPrompt') : ''
  }
  return pair?.projection || item.hasProjection ? t('chat.viewProjectionPrompt') : ''
}

async function toggleProjectionView(item: ChatPromptLogPage['items'][number]) {
  const messageId = focusedMessageId.value || getPromptLogMessageId(item)
  if (!messageId) return
  const nextKind = item.logKind === 'message_projection' ? 'final_reply' : 'message_projection'
  await focusByMessageId(messageId, nextKind)
}

watch(() => props.focusMessageId, async (rawMessageId) => {
  if (!props.open) return
  const messageId = Number(rawMessageId || 0)
  if (messageId <= 0) return
  await focusByMessageId(messageId)
})

watch(promptLogFocusMessageId, async (rawMessageId) => {
  if (!props.open) return
  const messageId = Number(rawMessageId || 0)
  if (messageId <= 0) return
  await focusByMessageId(messageId)
})

watch(promptLogFocusLogId, async (rawLogId) => {
  if (!props.open) return
  const logId = String(rawLogId || '').trim()
  if (!logId) return
  await focusByLogId(logId)
})

onMounted(async () => {
  if (props.open) {
    const logId = String(promptLogFocusLogId.value || '').trim()
    if (logId) {
      await focusByLogId(logId)
      return
    }
    const messageId = Number(props.focusMessageId || promptLogFocusMessageId.value || 0)
    if (messageId > 0) {
      await focusByMessageId(messageId)
      return
    }
    await loadPage(1)
  }
})
</script>

<style scoped>
.prompt-log-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 320px;
}

.prompt-log-sidebar__panel.prompt-log-panel {
  min-height: 0;
}

.prompt-log-panel__toolbar {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  flex-wrap: wrap;
  padding-bottom: 10px;
  border-bottom: 1px solid color-mix(in srgb, var(--morandi-border, #d6cec3) 72%, transparent);
}

.prompt-log-panel__meta,
.prompt-log-panel__pager,
.prompt-log-entry__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.prompt-log-entry__desc {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  font-size: 0.82rem;
  color: var(--morandi-text-light);
  align-items: center;
}

.prompt-log-entry__tag {
  padding: 1px 8px;
  border-radius: 999px;
  font-size: 0.72rem;
  background: var(--morandi-bg-soft, rgba(0, 0, 0, 0.05));
  color: var(--morandi-text-light);
}

.prompt-log-entry__toggle {
  flex-shrink: 0;
  white-space: nowrap;
}

.prompt-log-panel__meta {
  gap: 8px 14px;
}

.prompt-log-panel__meta-item {
  display: inline-flex;
  align-items: baseline;
  gap: 6px;
  min-width: 0;
}

.prompt-log-panel__meta-label {
  flex: 0 0 auto;
  color: var(--morandi-text-light);
}

.prompt-log-panel__meta-value {
  min-width: 0;
  color: var(--morandi-text);
}

.prompt-log-panel__meta-item:first-child .prompt-log-panel__meta-value {
  max-width: min(320px, 58vw);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.prompt-log-panel__pager {
  align-items: center;
}

.prompt-log-panel__pager-index {
  min-width: 72px;
  text-align: center;
}

.prompt-log-panel__list {
  display: flex;
  flex-direction: column;
  gap: 0;
  overflow: visible;
  padding-right: 0;
}

.prompt-log-panel__empty {
  padding: 28px 12px;
  text-align: center;
  color: var(--morandi-text-light);
}

.prompt-log-panel__empty--error {
  color: #b35b5b;
}

.prompt-log-panel__empty--notice {
  color: var(--morandi-text-light);
}

.prompt-log-entry {
  position: relative;
  padding: 14px 0 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.prompt-log-entry + .prompt-log-entry {
  border-top: 1px solid color-mix(in srgb, var(--morandi-border, #d6cec3) 74%, transparent);
}

.prompt-log-entry--focus {
  background: transparent;
}

.prompt-log-entry--focus::before {
  content: '';
  position: absolute;
  left: -14px;
  top: 14px;
  bottom: 16px;
  width: 2px;
  border-radius: 999px;
  background: rgba(201, 78, 72, 0.9);
  pointer-events: none;
}

.prompt-log-entry__title {
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--morandi-text);
}

.prompt-log-entry__deleted {
  padding: 16px 0 2px;
  color: var(--morandi-text-light);
  font-size: 0.9rem;
  letter-spacing: 0.03em;
}

.prompt-log-entry__section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.prompt-log-entry__section-heading {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}

.prompt-log-entry__section h4 {
  margin: 0;
  font-size: 0.86rem;
  color: var(--morandi-text);
}

.prompt-log-entry__section-heading span {
  font-size: 0.78rem;
  color: var(--morandi-text-light);
}

.prompt-log-blocks {
  display: flex;
  flex-direction: column;
  gap: 0;
  border-top: 1px solid color-mix(in srgb, var(--morandi-border, #d6cec3) 62%, transparent);
}

.prompt-log-block {
  padding: 10px 0 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.prompt-log-block + .prompt-log-block {
  border-top: 1px solid color-mix(in srgb, var(--morandi-border, #d6cec3) 58%, transparent);
}

.prompt-log-block__label {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
  font-size: 0.8rem;
  color: var(--morandi-text-light);
}

.prompt-log-block__title {
  color: var(--morandi-text);
}

.prompt-log-block__role {
  letter-spacing: 0.04em;
  font-size: 0.74rem;
}

.prompt-log-block__content {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 0.83rem;
  line-height: 1.62;
  color: var(--morandi-text);
  font-family: "Microsoft YaHei UI", "PingFang SC", monospace;
}
</style>
