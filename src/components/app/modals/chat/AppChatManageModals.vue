<template>
  <AppFormDialog
    :open="state.showSummaryList.value"
    title="历史总结"
    size="lg"
    @cancel="state.showSummaryList.value = false"
  >
      <div v-if="state.viewModel.summaryLibrary.value.length === 0" style="text-align: center; color: var(--morandi-text-light); padding: 20px;">
        暂无历史总结
      </div>
      <div v-for="summary in state.viewModel.summaryLibrary.value" :key="summary.id" style="border-bottom: 1px solid var(--morandi-border); padding: 12px 0;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span style="font-weight: 500;">{{ summary.name }}</span>
          <div style="display: flex; gap: 6px;">
            <button class="btn btn-small" @click="state.actions.editSummaryItem(summary)">编辑</button>
            <button class="btn btn-small btn-danger" @click="state.actions.deleteSummary(summary.id)">删除</button>
          </div>
        </div>
        <div style="font-size: 0.85rem; color: var(--morandi-text-light); margin-top: 4px;">{{ summary.content?.substring(0, 100) }}...</div>
      </div>

      <template #actions>
        <button class="btn btn-secondary" @click="state.showSummaryList.value = false">关闭</button>
      </template>
  </AppFormDialog>

  <AppFormDialog
    :open="state.showSummaryEditor.value"
    title="编辑总结"
    size="lg"
    @cancel="state.showSummaryEditor.value = false"
    @submit="state.actions.saveSummaryEdit()"
  >
      <div class="form-group">
        <label>总结名</label>
        <input v-model="state.summaryEditForm.name" placeholder="总结名">
      </div>
      <div class="form-group">
        <label>标签</label>
        <input v-model="state.summaryEditForm.tags" placeholder="逗号分隔">
      </div>
      <div class="form-group">
        <label>总结内容</label>
        <textarea v-model="state.summaryEditForm.content" rows="12" style="width: 100%; resize: vertical;" placeholder="总结内容"></textarea>
      </div>

      <template #actions>
        <button class="btn btn-secondary" @click="state.showSummaryEditor.value = false">取消</button>
        <button class="btn btn-primary" @click="state.actions.saveSummaryEdit()">保存</button>
      </template>
  </AppFormDialog>

  <AppFormDialog
    :open="state.showConversationManager.value"
    title="聊天文件管理"
    size="lg"
    @cancel="state.showConversationManager.value = false"
  >
      <div class="conversation-manager" @contextmenu.prevent @selectstart.prevent>
        <div class="conversation-manager__toolbar">
          <div class="conversation-manager__summary">
            <span class="conversation-manager__summary-title">当前共 {{ conversationItems.length }} 份聊天</span>
            <span class="conversation-manager__summary-meta" v-if="selectedConversationIds.length > 0">已选 {{ selectedConversationIds.length }} 项</span>
            <span class="conversation-manager__summary-meta" v-else>已按联系人分组，单击只选中，加载请从三点菜单进入</span>
          </div>
          <div class="conversation-manager__toolbar-actions">
            <button class="btn btn-secondary btn-small" @click="refreshChatArchives">刷新</button>
            <button class="btn btn-secondary btn-small" @click="triggerArchiveImport">导入</button>
            <button class="btn btn-secondary btn-small" @click="handleArchiveExport" :disabled="selectedArchiveIds.length === 0">导出</button>
            <button class="btn btn-danger btn-small" @click="requestDeleteSelection" :disabled="selectedConversationIds.length === 0">删除</button>
          </div>
        </div>
        <input ref="archiveImportInputRef" type="file" accept=".json,application/json" style="display: none;" @change="handleArchiveImport">
        <div class="conversation-manager__list" @contextmenu.prevent @selectstart.prevent>
          <div v-if="conversationItems.length === 0" class="conversation-manager__empty">
            暂无聊天记录
          </div>
          <section
            v-for="group in groupedConversationSections"
            :key="group.targetId"
            class="conversation-group"
          >
            <header class="conversation-group__header">
              <span class="conversation-group__title">{{ group.targetName }}</span>
              <span class="conversation-group__meta">{{ group.targetLabel }}</span>
              <span class="conversation-group__count">{{ group.items.length }}</span>
            </header>
            <div
              v-for="item in group.items"
              :key="item.id"
              class="conversation-row"
              :class="{
                'conversation-row--selected': selectedConversationIds.includes(item.id),
                'conversation-row--current': item.kind === 'current',
                'conversation-row--active': item.kind === 'current'
              }"
              @mousedown.prevent
              @contextmenu.prevent
              @click="handleConversationRowClick(item, $event)"
            >
              <span class="conversation-row__indicator" :class="{ active: selectedConversationIds.includes(item.id) }" aria-hidden="true"></span>
              <div class="conversation-row__main">
                <div class="conversation-row__title-line">
                  <template v-if="renamingConversationId === item.id">
                    <input
                      ref="renameInputRef"
                      v-model="renameDraft"
                      class="conversation-row__rename-input"
                      placeholder="输入聊天名"
                      @mousedown.stop
                      @click.stop
                      @selectstart.stop
                      @keydown.enter.prevent="saveRename"
                      @keydown.esc.prevent="cancelRename"
                    >
                    <button type="button" class="conversation-row__mini-action" @click.stop="saveRename">保存</button>
                    <button type="button" class="conversation-row__mini-action conversation-row__mini-action--muted" @click.stop="cancelRename">取消</button>
                  </template>
                  <template v-else>
                    <span class="conversation-row__title">{{ item.displayName }}</span>
                    <span class="conversation-row__badge" v-if="item.kind === 'current'">当前</span>
                  </template>
                </div>
                <div class="conversation-row__meta">
                  <span>{{ item.messageCount }} 条</span>
                  <span>{{ item.timeLabel }}</span>
                </div>
              </div>
              <button
                type="button"
                class="conversation-row__menu-trigger"
                title="更多操作"
                @click.stop="toggleConversationMenu(item, $event)"
              >
                <svg class="line-icon" viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="12" cy="5" r="1.5"/>
                  <circle cx="12" cy="12" r="1.5"/>
                  <circle cx="12" cy="19" r="1.5"/>
                </svg>
              </button>
            </div>
          </section>
        </div>
      </div>
      <div v-if="conversationMenuItem" class="conversation-manager__menu-mask" @click="closeConversationMenu"></div>
      <SidebarFloatingMenu :open="Boolean(conversationMenuItem)" menu-class="conversation-manager__menu" :menu-style="conversationMenuStyle" clamp-to-viewport>
        <button v-if="conversationMenuItem?.kind !== 'current'" type="button" class="conversation-manager__menu-item" @click.stop="loadConversationFromMenu">加载</button>
        <button type="button" class="conversation-manager__menu-item" @click.stop="renameConversationFromMenu">重命名</button>
        <button type="button" class="conversation-manager__menu-item conversation-manager__menu-item--danger" @click.stop="requestDeleteFromMenu">{{ deleteMenuLabel }}</button>
      </SidebarFloatingMenu>

      <template #actions>
        <button class="btn btn-secondary" @click="state.showConversationManager.value = false">关闭</button>
      </template>
  </AppFormDialog>

  <AppFormDialog
    :open="state.showSlotManager.value"
    title="记忆槽"
    size="lg"
    @cancel="state.showSlotManager.value = false"
  >
      <div
        v-for="summary in state.viewModel.summaryLibrary.value"
        :key="summary.id"
        style="display: flex; align-items: center; gap: 12px; padding: 12px; border-bottom: 1px solid var(--morandi-border);"
      >
        <label style="display: flex; align-items: center; gap: 6px; flex: 1; cursor: pointer;">
          <input type="checkbox" :checked="state.viewModel.isSummaryLoaded(summary.id)" @change="state.actions.toggleSummarySlot(summary.id)">
          {{ summary.name }}
        </label>
        <span style="font-size: 0.75rem; color: var(--morandi-text-light);">{{ summary.tags?.join(', ') }}</span>
      </div>

      <template #actions>
        <button class="btn btn-secondary" @click="state.showSlotManager.value = false">关闭</button>
      </template>
  </AppFormDialog>

  <AppConfirmDialog
    :open="deleteConfirmOpen"
    title="删除聊天"
    :message="deleteConfirmMessage"
    confirm-text="删除"
    tone="warning"
    @cancel="closeDeleteConfirm"
    @confirm="confirmDelete"
  />
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import AppConfirmDialog from '../../../common/AppConfirmDialog.vue'
import AppFormDialog from '../../../common/AppFormDialog.vue'
import SidebarFloatingMenu from '../../../common/SidebarFloatingMenu.vue'
import type { createChatManageModalState } from '../../../../composables/app/modalState/createChatManageModalState'

type ChatManageModalState = ReturnType<typeof createChatManageModalState>
type ChatArchiveItem = {
  id?: string
  name?: string
  category?: string
  messageCount?: number
  lastMessagePreview?: string
  targetId?: string
  updatedAt?: string
  createdAt?: string
}
type ConversationItem = {
  id: string
  kind: 'current' | 'archive'
  name: string
  displayName: string
  targetId: string
  targetName: string
  targetLabel: string
  timeLabel: string
  messageCount: number
  updatedAt: string
  createdAt: string
}
type ConversationGroup = {
  targetId: string
  targetName: string
  targetLabel: string
  items: ConversationItem[]
}

const props = defineProps<{ state: ChatManageModalState }>()
const state = props.state

const archiveImportInputRef = ref<HTMLInputElement | null>(null)
const renameInputRef = ref<HTMLInputElement | null>(null)
const selectedConversationIds = ref<string[]>([])
const selectionAnchorId = ref('')
const renamingConversationId = ref('')
const renameDraft = ref('')
const conversationMenuItem = ref<ConversationItem | null>(null)
const conversationMenuStyle = ref<Record<string, string>>({})
const deleteConfirmOpen = ref(false)
const deleteConfirmIds = ref<string[]>([])

const chatArchives = computed(() => {
  const value = state?.viewModel?.chatArchives?.value
  return Array.isArray(value) ? value : []
})

const currentSession = computed(() => {
  const value = state?.viewModel?.currentSession?.value
  return value && typeof value === 'object' ? value as Record<string, any> : null
})

const currentTargetId = computed(() => String(state?.viewModel?.currentTargetId?.value || '').trim())
const currentLinkedArchiveId = computed(() => String(
  currentSession.value?.linkedArchiveId
  ?? currentSession.value?.linked_archive_id
  ?? ''
).trim())
const currentMessages = computed(() => {
  const value = state?.viewModel?.currentMessages?.value
  return Array.isArray(value) ? value : []
})

const currentConversation = computed<ConversationItem | null>(() => {
  const targetId = currentTargetId.value
  if (!targetId) return null
  const session = currentSession.value
  const targetName = getTargetName(targetId)
  const archiveName = String(session?.archiveName ?? session?.archive_name ?? '').trim()
  const updatedAt = String(session?.updatedAt ?? session?.updated_at ?? '')
  const createdAt = String(session?.createdAt ?? session?.created_at ?? updatedAt)
  const autoName = buildAutoConversationName(currentMessages.value)
  return {
    id: `current:${targetId}`,
    kind: 'current',
    name: archiveName,
    displayName: resolveConversationDisplayName(archiveName, autoName, targetName, true),
    targetId,
    targetName,
    targetLabel: `${getTargetKindLabel(targetId)} · ${targetName}`,
    timeLabel: formatConversationTime(updatedAt || createdAt),
    messageCount: Number(state?.viewModel?.currentMessageCount?.value || 0),
    updatedAt,
    createdAt
  }
})

const conversationItems = computed<ConversationItem[]>(() => {
  const activeTargetId = currentTargetId.value
  const archives = chatArchives.value.map((archive: ChatArchiveItem) => {
    const targetId = String(archive.targetId || '').trim()
    const targetName = getTargetName(targetId)
    const name = String(archive.name || '').trim()
    const updatedAt = String(archive.updatedAt || '')
    const createdAt = String(archive.createdAt || '')
    const autoName = sanitizeConversationNameSeed(String(archive.lastMessagePreview || ''))
    return {
      id: String(archive.id || ''),
      kind: 'archive' as const,
      name,
      displayName: resolveConversationDisplayName(name, autoName, targetName, false),
      targetId,
      targetName,
      targetLabel: `${getTargetKindLabel(targetId)} · ${targetName}`,
      timeLabel: formatConversationTime(updatedAt || createdAt),
      messageCount: Number(archive.messageCount || 0),
      updatedAt,
      createdAt
    }
  }).filter((item) => (
    item.id
    && item.targetId === activeTargetId
    && item.id !== currentLinkedArchiveId.value
  ))
  return currentConversation.value ? [...archives, currentConversation.value] : archives
})

const groupedConversationSections = computed<ConversationGroup[]>(() => {
  const buckets = new Map<string, ConversationGroup>()
  conversationItems.value.forEach((item) => {
    const key = item.targetId || 'unknown'
    const existing = buckets.get(key)
    if (existing) {
      existing.items.push(item)
      return
    }
    buckets.set(key, {
      targetId: key,
      targetName: item.targetName,
      targetLabel: item.targetLabel,
      items: [item]
    })
  })
  return Array.from(buckets.values())
})

const selectedArchiveIds = computed(() => (
  selectedConversationIds.value.filter((id) => !id.startsWith('current:'))
))

const deleteMenuLabel = computed(() => {
  const currentItem = conversationMenuItem.value
  if (!currentItem) return '删除'
  const selectedCount = selectedConversationIds.value.length
  return selectedCount > 1 && selectedConversationIds.value.includes(currentItem.id)
    ? `删除所选 ${selectedCount} 项`
    : '删除'
})

const deleteConfirmMessage = computed(() => {
  if (deleteConfirmIds.value.length <= 1) {
    const item = findConversation(deleteConfirmIds.value[0] || '')
    if (!item) return '确定删除这份聊天吗？'
    return item.kind === 'current'
      ? '删除当前对话后，当前聊天消息会被清空。确定继续吗？'
      : `确定删除“${item.displayName}”吗？`
  }
  const currentCount = deleteConfirmIds.value.filter((id) => id.startsWith('current:')).length
  const archiveCount = deleteConfirmIds.value.length - currentCount
  if (currentCount > 0 && archiveCount > 0) {
    return `将删除当前对话，并移除 ${archiveCount} 份历史聊天。确定继续吗？`
  }
  if (currentCount > 0) {
    return `将清空 ${currentCount} 个当前对话。确定继续吗？`
  }
  return `将删除 ${archiveCount} 份历史聊天。确定继续吗？`
})

watch(
  () => state?.showConversationManager?.value,
  async (open) => {
    if (open) {
      await refreshChatArchives()
      return
    }
    selectedConversationIds.value = []
    selectionAnchorId.value = ''
    renamingConversationId.value = ''
    renameDraft.value = ''
    closeConversationMenu()
    closeDeleteConfirm()
  },
  { immediate: true }
)

watch(conversationItems, (list) => {
  const validIds = new Set(list.map((item) => item.id))
  selectedConversationIds.value = selectedConversationIds.value.filter((id) => validIds.has(id))
  if (selectionAnchorId.value && !validIds.has(selectionAnchorId.value)) {
    selectionAnchorId.value = ''
  }
  if (renamingConversationId.value && !validIds.has(renamingConversationId.value)) {
    renamingConversationId.value = ''
    renameDraft.value = ''
  }
  if (conversationMenuItem.value && !validIds.has(conversationMenuItem.value.id)) {
    closeConversationMenu()
  }
}, { immediate: true })

async function refreshChatArchives() {
  await state?.actions?.loadChatArchives?.()
}

function getTargetName(targetId: string): string {
  const safeTargetId = String(targetId || '').trim()
  if (!safeTargetId) return '未命名会话'
  const resolver = state?.viewModel?.getTargetName
  if (typeof resolver === 'function') {
    const resolved = String(resolver(safeTargetId) || '').trim()
    if (resolved) return resolved
  }
  return safeTargetId
}

function getTargetKindLabel(targetId: string): string {
  if (targetId.startsWith('crowd_')) return '群众角色'
  return '会话'
}

function sanitizeConversationNameSeed(rawContent: string): string {
  return String(rawContent || '')
    .replace(/<think>[\s\S]*?<\/think>/gi, ' ')
    .replace(/<affection>[\s\S]*?<\/affection>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\b\d{1,2}:\d{2}(?::\d{2})?\b/g, ' ')
    .replace(/\b\d{4}[-/年]\d{1,2}[-/月]\d{1,2}(?:日)?(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?\b/g, ' ')
    .replace(/[\$*`~#>@_=+\-\\\/|()[\]{}<>《》【】「」『』“”"'：:；;，,。！？!?、…]/g, ' ')
    .replace(/[^0-9A-Za-z\u4e00-\u9fa5]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 20)
    .trim()
}

function buildAutoConversationName(messages: Array<Record<string, any>>): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    const preview = sanitizeConversationNameSeed(String(message?.content || ''))
    if (preview) return preview
  }
  return ''
}

function isDefaultGeneratedName(name: string, targetName: string): boolean {
  const safeName = String(name || '').trim()
  const safeTargetName = String(targetName || '').trim()
  if (!safeName) return true
  if (safeName === `${safeTargetName} 的当前对话`) return true
  if (safeName === `${safeTargetName} 的聊天记录`) return true
  if (/^(group_|crowd_|[A-Za-z0-9_-]+)\s+\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}$/.test(safeName)) return true
  return false
}

function resolveConversationDisplayName(name: string, autoName: string, targetName: string, isCurrent: boolean): string {
  const safeName = String(name || '').trim()
  if (!safeName || isDefaultGeneratedName(safeName, targetName)) {
    if (autoName) return autoName
    return isCurrent ? `${targetName} 的当前对话` : `${targetName} 的聊天记录`
  }
  return safeName
}

function formatConversationTime(value: string): string {
  const safeValue = String(value || '').trim()
  if (!safeValue) return '暂无时间'
  const time = new Date(safeValue)
  if (Number.isNaN(time.getTime())) return safeValue
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(time)
}

function findConversation(id: string): ConversationItem | null {
  return conversationItems.value.find((item) => item.id === id) || null
}

function closeConversationMenu() {
  conversationMenuItem.value = null
  conversationMenuStyle.value = {}
}

function renameConversationFromMenu() {
  if (!conversationMenuItem.value) return
  beginRename(conversationMenuItem.value)
}

async function loadConversationFromMenu() {
  if (!conversationMenuItem.value) return
  await loadConversation(conversationMenuItem.value)
  closeConversationMenu()
}

function requestDeleteFromMenu() {
  const item = conversationMenuItem.value
  if (!item) return
  if (selectedConversationIds.value.length > 1 && selectedConversationIds.value.includes(item.id)) {
    requestDelete(selectedConversationIds.value)
    return
  }
  requestDelete([item.id])
}

function beginRename(item: ConversationItem) {
  closeConversationMenu()
  renamingConversationId.value = item.id
  renameDraft.value = getRenameDraftName(item)
  selectedConversationIds.value = [item.id]
  selectionAnchorId.value = item.id
  nextTick(() => {
    const input = Array.isArray(renameInputRef.value)
      ? renameInputRef.value[0]
      : renameInputRef.value
    input?.focus()
    input?.select()
  })
}

function getRenameDraftName(item: ConversationItem): string {
  const safeName = String(item.name || '').trim()
  if (!safeName || isDefaultGeneratedName(safeName, item.targetName)) {
    return item.displayName
  }
  return safeName
}

function cancelRename() {
  renamingConversationId.value = ''
  renameDraft.value = ''
}

async function saveRename() {
  const item = findConversation(renamingConversationId.value)
  if (!item) return
  const nextName = String(renameDraft.value || '').trim()
  if (!nextName) return
  if (item.kind === 'current') {
    await state?.actions?.updateCurrentSession?.(item.targetId, { archiveName: nextName })
  } else {
    await state?.actions?.updateChatArchive?.(item.id, { name: nextName })
    await refreshChatArchives()
  }
  cancelRename()
}

function setSingleSelection(id: string) {
  selectedConversationIds.value = id ? [id] : []
  selectionAnchorId.value = id
}

function toggleSelection(id: string) {
  const selected = new Set(selectedConversationIds.value)
  if (selected.has(id)) {
    selected.delete(id)
  } else {
    selected.add(id)
  }
  selectedConversationIds.value = conversationItems.value
    .map((item) => item.id)
    .filter((itemId) => selected.has(itemId))
}

function selectRange(id: string) {
  const ids = conversationItems.value.map((item) => item.id)
  const anchor = selectionAnchorId.value || id
  const start = ids.indexOf(anchor)
  const end = ids.indexOf(id)
  if (start < 0 || end < 0) {
    setSingleSelection(id)
    return
  }
  const [from, to] = start <= end ? [start, end] : [end, start]
  selectedConversationIds.value = ids.slice(from, to + 1)
}

async function handleConversationRowClick(item: ConversationItem, event: MouseEvent) {
  if (renamingConversationId.value === item.id) return
  closeConversationMenu()
  if (event.shiftKey) {
    selectRange(item.id)
    return
  }
  if (event.ctrlKey || event.metaKey) {
    toggleSelection(item.id)
    selectionAnchorId.value = item.id
    return
  }
  setSingleSelection(item.id)
}

function toggleConversationMenu(item: ConversationItem, event: MouseEvent) {
  if (conversationMenuItem.value?.id === item.id) {
    closeConversationMenu()
    return
  }
  const rect = (event.currentTarget as HTMLElement | null)?.getBoundingClientRect()
  if (!rect) return
  conversationMenuItem.value = item
  conversationMenuStyle.value = {
    top: `${rect.bottom + 6}px`,
    left: `${Math.max(16, rect.right - 132)}px`
  }
}

async function loadConversation(item: ConversationItem) {
  if (item.kind === 'current') {
    state.showConversationManager.value = false
    return
  }
  const targetId = String(item.targetId || '').trim()
  if (!item.id || !targetId) return
  await state?.actions?.loadChatArchiveIntoCurrentTarget?.(item.id, targetId)
  state.showConversationManager.value = false
}

function requestDeleteSelection() {
  requestDelete(selectedConversationIds.value)
}

function requestDelete(ids: string[]) {
  const safeIds = ids.map((item) => String(item || '').trim()).filter(Boolean)
  if (!safeIds.length) return
  deleteConfirmIds.value = safeIds
  deleteConfirmOpen.value = true
  closeConversationMenu()
}

function closeDeleteConfirm() {
  deleteConfirmOpen.value = false
  deleteConfirmIds.value = []
}

async function confirmDelete() {
  const targetId = currentTargetId.value
  const currentIds = deleteConfirmIds.value.filter((id) => id.startsWith('current:'))
  const archiveIds = deleteConfirmIds.value.filter((id) => !id.startsWith('current:'))
  if (currentIds.length > 0 && targetId) {
    await state?.actions?.clearChat?.(targetId)
    await state?.actions?.updateCurrentSession?.(targetId, { archiveName: '', archiveCategory: '' })
  }
  if (archiveIds.length > 0) {
    await state?.actions?.deleteChatArchives?.(archiveIds)
    await refreshChatArchives()
  }
  selectedConversationIds.value = selectedConversationIds.value.filter((id) => !deleteConfirmIds.value.includes(id))
  closeDeleteConfirm()
}

async function handleArchiveExport() {
  const safeIds = selectedArchiveIds.value.map((item) => String(item || '').trim()).filter(Boolean)
  if (!safeIds.length) return
  const payload = await state?.actions?.exportChatArchives?.(safeIds)
  if (!payload) return
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `聊天记录-${new Date().toISOString().slice(0, 10)}.json`
  link.click()
  URL.revokeObjectURL(url)
}

function triggerArchiveImport() {
  archiveImportInputRef.value?.click()
}

function handleArchiveImport(event: Event) {
  const input = event.target as HTMLInputElement | null
  const file = input?.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = async () => {
    try {
      const payload = JSON.parse(String(reader.result || '{}'))
      await state?.actions?.importChatArchives?.(payload)
      await refreshChatArchives()
    } finally {
      if (input) input.value = ''
    }
  }
  reader.readAsText(file, 'utf-8')
}
</script>

<style scoped>
.conversation-manager {
  display: grid;
  gap: 14px;
}

.conversation-manager__toolbar {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--morandi-border);
}

.conversation-manager__summary {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.conversation-manager__summary-title {
  font-size: 0.96rem;
  color: var(--morandi-text);
}

.conversation-manager__summary-meta {
  font-size: 0.8rem;
  color: var(--morandi-text-light);
}

.conversation-manager__toolbar-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

.conversation-manager__list {
  max-height: 56vh;
  overflow-y: auto;
  border-top: 1px solid var(--morandi-border);
  border-bottom: 1px solid var(--morandi-border);
}

.conversation-manager__empty {
  padding: 40px 0;
  text-align: center;
  color: var(--morandi-text-light);
}

.conversation-group {
  border-bottom: 1px solid var(--morandi-border);
}

.conversation-group:last-child {
  border-bottom: none;
}

.conversation-group__header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 0 10px;
  color: var(--morandi-text-light);
  font-size: 0.78rem;
}

.conversation-group__title {
  color: var(--morandi-text);
  font-size: 0.9rem;
}

.conversation-group__meta {
  opacity: 0.86;
}

.conversation-group__count {
  margin-left: auto;
}

.conversation-row {
  position: relative;
  display: grid;
  grid-template-columns: 10px minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  min-height: 68px;
  padding: 0 6px 0 0;
  border-bottom: 1px solid var(--morandi-border);
  background: transparent;
  cursor: pointer;
  transition: background-color 0.18s ease;
}

.conversation-row:last-child {
  border-bottom: none;
}

.conversation-row:hover {
  background: rgba(186, 174, 160, 0.08);
}

.conversation-row--selected {
  background: rgba(126, 167, 157, 0.1);
}

.conversation-row__indicator {
  align-self: stretch;
  background: transparent;
  transition: background-color 0.18s ease;
}

.conversation-row__indicator.active {
  background: #7ea79d;
}

.conversation-row__main {
  display: grid;
  gap: 6px;
  min-width: 0;
  padding: 14px 0;
}

.conversation-row__title-line {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.conversation-row__title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--morandi-text);
  font-size: 0.94rem;
}

.conversation-row__badge {
  flex-shrink: 0;
  padding: 1px 8px;
  border: 1px solid rgba(126, 167, 157, 0.45);
  border-radius: 999px;
  color: #6a8d84;
  font-size: 0.72rem;
}

.conversation-row__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  color: var(--morandi-text-light);
  font-size: 0.78rem;
}

.conversation-row__menu-trigger {
  width: 30px;
  height: 30px;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: var(--morandi-text-light);
  cursor: pointer;
}

.conversation-row__menu-trigger:hover {
  background: rgba(186, 174, 160, 0.16);
  color: var(--morandi-text);
}

.conversation-row__rename-input {
  flex: 1;
  min-width: 0;
  height: 34px;
  padding: 0 10px;
  border: 1px solid rgba(126, 167, 157, 0.48);
  border-radius: 8px;
  outline: none;
  background: var(--langhuan-dialog-input-bg, #fff);
}

.conversation-row__mini-action {
  flex-shrink: 0;
  border: none;
  background: transparent;
  color: #6a8d84;
  cursor: pointer;
  font-size: 0.8rem;
}

.conversation-row__mini-action--muted {
  color: var(--morandi-text-light);
}

.conversation-manager__menu-mask {
  position: fixed;
  inset: 0;
  z-index: 11999;
}

.conversation-manager__menu {
  min-width: 132px;
  border: 1px solid var(--langhuan-menu-border, rgba(201, 190, 177, 0.62));
  border-radius: var(--langhuan-menu-radius, 0);
  box-shadow: var(--langhuan-menu-shadow, 0 3px 10px rgba(56, 46, 38, 0.08));
  overflow: hidden;
}

.conversation-manager__menu-item {
  width: 100%;
  padding: 10px 14px;
  border: none;
  background: transparent;
  text-align: left;
  color: var(--morandi-text);
  cursor: pointer;
}

.conversation-manager__menu-item:hover {
  background: rgba(186, 174, 160, 0.12);
}

.conversation-manager__menu-item--danger {
  color: var(--morandi-danger);
}

@media (max-width: 900px) {
  .conversation-manager__toolbar {
    flex-direction: column;
  }

  .conversation-manager__toolbar-actions {
    justify-content: flex-start;
  }
}
</style>
