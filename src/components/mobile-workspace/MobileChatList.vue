<template>
  <section class="mobile-chat-list" :aria-label="$t('mobile.chatList.aria')">
    <MobileTopBar
      :title="$t('sidebar.navContacts')"
      :action-label="$t('sidebar.createSession')"
      action-icon="plus"
      @primary="$emit('createSession')"
    />

    <label class="mobile-chat-list__search" :aria-label="$t('mobile.chatList.searchPlaceholder')">
      <MobileLineIcon name="search" :size="16" :stroke-width="1.9" />
      <input v-model="searchText" type="search" :placeholder="$t('mobile.chatList.searchPlaceholder')">
    </label>

    <div class="mobile-chat-list__body lhm-scroll">
      <MobileSectionLabel>{{ $t('sidebar.filterRecent') }}</MobileSectionLabel>

      <template v-if="filteredRows.length">
        <div
          v-for="(row, index) in filteredRows"
          :key="row.sessionId"
          class="mobile-chat-list__swipe"
          :class="{ 'mobile-chat-list__swipe--open': swipedSessionId === row.sessionId }"
          @pointerdown="handleSwipePointerDown(row.sessionId, $event)"
          @pointermove="handleSwipePointerMove(row.sessionId, $event)"
          @pointerup="handleSwipePointerEnd(row.sessionId)"
          @pointercancel="cancelSwipe"
        >
          <button
            v-if="isDeleteLayerVisible(row.sessionId)"
            type="button"
            class="mobile-chat-list__delete"
            :aria-label="$t('mobile.chatList.deleteAria', { name: row.title || row.label || $t('mobile.chatList.sessionFallback') })"
            @click.stop="deleteSession(row.sessionId)"
          >
            <MobileLineIcon name="trash" :size="17" :stroke-width="1.9" />
            {{ $t('common.delete') }}
          </button>
          <div class="mobile-chat-list__swipe-front" :style="getSwipeFrontStyle(row.sessionId)">
            <MobileFlowRow
              :title="row.title || row.label || $t('mobile.chatList.unnamedSession')"
              :meta="resolveRowMeta(row)"
              :sub="row.preview || $t('mobile.chatList.noMessage')"
              :dim="!row.preview"
              :divider="index < filteredRows.length - 1"
              :selection-mode="selectionMode"
              :selected="selectedSessionIds.has(row.sessionId)"
              @select="openSession(row)"
              @long-press="enterSelection(row.sessionId)"
              @toggle-select="toggleSessionSelection(row.sessionId)"
            >
              <template #avatar>
                <MobileAvatar
                  :label="resolveSessionAvatar(row)"
                  :src="normalizeAvatarUrl(row.avatarPath)"
                  :size="40"
                  :color="resolveAvatarColor(index)"
                  :ring="true"
                />
              </template>
              <template #trailing>
                <span v-if="!selectionMode" class="mobile-chat-list__aside">
                  <span class="mobile-chat-list__time">{{ row.updatedAt || '' }}</span>
                  <span v-if="row.sessionId === activeSessionId" class="mobile-chat-list__unread" aria-hidden="true" />
                  <span v-else class="mobile-chat-list__unread mobile-chat-list__unread--hidden" aria-hidden="true" />
                </span>
              </template>
            </MobileFlowRow>
          </div>
        </div>
      </template>

      <div v-else class="mobile-chat-list__empty">
        {{ chatRows.length ? $t('mobile.chatList.emptyNoMatch') : $t('mobile.chatList.emptyNoData') }}
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ChatSessionRow } from '../../types/panelContracts'
import MobileAvatar from './MobileAvatar.vue'
import MobileFlowRow from './MobileFlowRow.vue'
import MobileLineIcon from './MobileLineIcon.vue'
import MobileSectionLabel from './MobileSectionLabel.vue'
import MobileTopBar from './MobileTopBar.vue'
import type { MobileSelectionAction, MobileSelectionDescriptor, MobileWorkspaceShellProps } from './mobileWorkspaceTypes'

const props = defineProps<MobileWorkspaceShellProps>()
const { t } = useI18n()

const emit = defineEmits<{
  openThread: []
  createSession: []
  selection: [descriptor: MobileSelectionDescriptor]
}>()

const AVATAR_COLORS = [
  'var(--lhm-av-brown, #8b7355)',
  'var(--lhm-av-olive, #5c8a5c)',
  'var(--lhm-av-blue, #8fa6b2)',
  'var(--lhm-av-sand, #b5a082)',
  'var(--lhm-av-rose, #bc8c84)'
]

const searchText = ref('')
const selectedSessionIds = ref<Set<string>>(new Set())
const swipedSessionId = ref('')
const swipeStart = ref<{ id: string; x: number; y: number; dx: number; active: boolean } | null>(null)
const suppressClickSessionId = ref('')

const state = computed(() => props.state)
const chatRows = computed(() => state.value.chatViewModel.chatSessionRows || [])
const activeSessionId = computed(() => String(state.value.chatViewModel.activeSessionId || ''))
const normalizedSearch = computed(() => searchText.value.trim().toLocaleLowerCase())
const filteredRows = computed(() => {
  const query = normalizedSearch.value
  if (!query) return chatRows.value
  return chatRows.value.filter((row) => [
    row.title,
    row.label,
    row.preview,
    row.updatedAt,
    row.targetId
  ].some((value) => String(value || '').toLocaleLowerCase().includes(query)))
})
const selectionMode = computed(() => selectedSessionIds.value.size > 0)
const selectionActions = computed<MobileSelectionAction[]>(() => {
  const count = selectedSessionIds.value.size
  return [
    { id: 'open', label: t('mobile.chatList.open'), icon: 'chevron-right', disabled: count !== 1 },
    { id: 'rename', label: t('common.rename'), icon: 'square-pen', disabled: true },
    { id: 'archive', label: t('mobile.chatList.archive'), icon: 'download', disabled: count !== 1 },
    { id: 'delete', label: t('common.delete'), icon: 'trash', danger: true, disabled: count !== 1 }
  ]
})

// 上报多选描述符给壳层，由壳层统一原位渲染底部操作胶囊
watchEffect(() => {
  emit('selection', {
    open: selectionMode.value,
    count: selectedSessionIds.value.size,
    actions: selectionActions.value,
    onCancel: clearSelection,
    onAction: runSelectionAction
  })
})

function resolveSessionAvatar(row: ChatSessionRow) {
  const emoji = String(row.emoji || '').trim()
  if (emoji) return emoji
  return row.participantCount >= 2 ? '👥' : '👤'
}

function normalizeAvatarUrl(path?: string | null) {
  const trimmed = String(path || '').trim()
  if (!trimmed) return ''
  if (trimmed.startsWith('data:') || /^https?:\/\//i.test(trimmed)) return trimmed
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`
}

function resolveAvatarColor(index: number) {
  return AVATAR_COLORS[index % AVATAR_COLORS.length]
}

function resolveRowMeta(row: ChatSessionRow) {
  const label = String(row.label || '').trim()
  if (label) return label
  const count = Number(row.participantCount || 1)
  return t('mobile.chatList.peopleCount', { count })
}

function openSession(row: ChatSessionRow) {
  if (suppressClickSessionId.value === row.sessionId) {
    suppressClickSessionId.value = ''
    return
  }
  if (swipedSessionId.value === row.sessionId) {
    swipedSessionId.value = ''
    return
  }
  if (selectionMode.value) {
    toggleSessionSelection(row.sessionId)
    return
  }
  if (row.sessionId && row.sessionId !== activeSessionId.value) {
    state.value.chatActions.switchSession?.(row.sessionId)
  }
  emit('openThread')
}

function enterSelection(sessionId: string) {
  if (!sessionId) return
  swipedSessionId.value = ''
  selectedSessionIds.value = new Set([sessionId])
}

function toggleSessionSelection(sessionId: string) {
  if (!sessionId) return
  const next = new Set(selectedSessionIds.value)
  next.has(sessionId) ? next.delete(sessionId) : next.add(sessionId)
  selectedSessionIds.value = next
}

function clearSelection() {
  selectedSessionIds.value = new Set()
}

function runSelectionAction(actionId: string) {
  const ids = Array.from(selectedSessionIds.value)
  if (!ids.length) return
  if (actionId === 'open' && ids.length === 1) {
    const row = chatRows.value.find((item) => item.sessionId === ids[0])
    clearSelection()
    if (row) openSession(row)
    return
  }
  if (actionId === 'archive' && ids.length === 1) {
    void state.value.chatActions.archiveChatSession?.(ids[0])
    clearSelection()
    return
  }
  if (actionId === 'delete') {
    if (ids.length > 1) {
      void state.value.chatActions.deleteChatSessions?.(ids)
    } else {
      deleteSession(ids[0])
    }
    clearSelection()
  }
}

function deleteSession(sessionId: string) {
  if (!sessionId) return
  swipedSessionId.value = ''
  void state.value.chatActions.deleteChatSession?.(sessionId)
}

function handleSwipePointerDown(sessionId: string, event: PointerEvent) {
  if (selectionMode.value) return
  if (event.pointerType === 'mouse' && event.button !== 0) return
  swipeStart.value = { id: sessionId, x: event.clientX, y: event.clientY, dx: 0, active: true }
}

function handleSwipePointerMove(sessionId: string, event: PointerEvent) {
  const start = swipeStart.value
  if (!start || start.id !== sessionId || !start.active) return
  const dx = event.clientX - start.x
  const dy = event.clientY - start.y
  if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 12) {
    cancelSwipe()
    return
  }
  if (dx < -8 || (swipedSessionId.value === sessionId && dx < 8)) {
    start.dx = Math.max(-78, Math.min(0, dx))
    event.preventDefault()
  }
}

function handleSwipePointerEnd(sessionId: string) {
  const start = swipeStart.value
  if (!start || start.id !== sessionId) return
  if (Math.abs(start.dx) > 8) suppressClickSessionId.value = sessionId
  swipedSessionId.value = start.dx <= -38 ? sessionId : ''
  swipeStart.value = null
}

function cancelSwipe() {
  swipeStart.value = null
}

// 仅在「正在向左拖拽」或「已展开」时渲染删除色块；闭合态完全不挂载，杜绝右侧漏红线
function isDeleteLayerVisible(sessionId: string) {
  const start = swipeStart.value
  if (start?.id === sessionId && start.dx < 0) return true
  return swipedSessionId.value === sessionId
}

function getSwipeFrontStyle(sessionId: string) {
  const start = swipeStart.value
  const dragging = start?.id === sessionId
  const offset = dragging ? start.dx : (swipedSessionId.value === sessionId ? -78 : 0)
  // 拖拽过程中关闭过渡，跟手；松手后才用过渡回弹/吸附
  return { transform: `translateX(${offset}px)`, transition: dragging ? 'none' : '' }
}
</script>

<style scoped>
.mobile-chat-list {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  gap: 14px;
}

.mobile-chat-list__search {
  display: flex;
  align-items: center;
  gap: 8px;
  border: 1px solid var(--lhm-border-line, #e5e5e5);
  border-radius: 10px;
  background: var(--lhm-card, #fffdf8);
  color: var(--lhm-text-muted, #999);
  padding: 9px 12px;
}

.mobile-chat-list__search input {
  min-width: 0;
  flex: 1;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--lhm-text, #333);
  font: inherit;
  font-size: 13px;
}

.mobile-chat-list__search input::placeholder {
  color: var(--lhm-text-muted, #999);
}

.mobile-chat-list__body {
  min-height: 0;
  flex: 1;
  overflow-y: auto;
}

.mobile-chat-list__swipe {
  position: relative;
  overflow: hidden;
  /* 让横向拖拽交给 JS（左滑删除），纵向仍可滚动列表；否则手势被滚动容器吞掉，滑不出删除按钮 */
  touch-action: pan-y;
}

.mobile-chat-list__delete {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  display: inline-flex;
  width: 76px;
  align-items: center;
  justify-content: center;
  gap: 4px;
  border: 0;
  background: #a4524d;
  color: #fff;
  cursor: pointer;
  font: inherit;
  font-size: 12px;
}

.mobile-chat-list__swipe-front {
  position: relative;
  z-index: 1;
  /* 过覆盖右边界 2px，被父级 overflow:hidden 裁掉，避免缩放/亚像素取整时背后删除色块漏边 */
  width: calc(100% + 2px);
  background: var(--lhm-surface, #f8f4ec);
  transition: transform 0.24s cubic-bezier(0.22, 0.61, 0.36, 1);
  box-sizing: border-box;
}

.mobile-chat-list__aside {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 7px;
}

.mobile-chat-list__time {
  color: var(--lhm-text-muted, #999);
  font-size: 11px;
}

.mobile-chat-list__unread {
  width: 8px;
  height: 8px;
  border-radius: 4px;
  background: var(--lhm-accent, #5c8a5c);
}

.mobile-chat-list__unread--hidden {
  background: transparent;
}

.mobile-chat-list__empty {
  border-radius: 10px;
  color: var(--lhm-text-muted, #999);
  line-height: 1.7;
  padding: 18px 4px;
}
</style>
