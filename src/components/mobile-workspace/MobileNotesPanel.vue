<template>
  <ChatNotesSidebar
    class="mobile-notes-panel"
    :notes="notes"
    :loading="loading"
    @jump-message="(note) => $emit('jump-message', note)"
    @copy-note="copyNote"
    @delete-note="deleteNote"
  />
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import ChatNotesSidebar from '../app/chat/ChatNotesSidebar.vue'
import {
  deleteChatMessageNoteBySessionId,
  fetchChatMessageNotesBySessionId
} from '../../repositories/chatRepository'
import type { ChatMessageNote } from '../../types'
import type { DesktopPanelState } from '../../types/panelContracts'

// 移动端笔记面板宿主：复用桌面 ChatNotesSidebar，数据走 chatRepository 的笔记读写真值，
// 不新建移动端私有笔记真值。跳转原消息交给父级（MobileChatThread 拥有消息列表 ref）处理。
// 与桌面联动：桌面侧在 AppChatSection.vue（loadChatMessageNotes / deleteMessageNote / copyMessageNote）。
const props = defineProps<{
  state: DesktopPanelState
  open: boolean
}>()

defineEmits<{
  close: []
  'jump-message': [note: ChatMessageNote]
}>()

const notes = ref<ChatMessageNote[]>([])
const loading = ref(false)
let loadSeq = 0

async function loadNotes() {
  const sessionId = String(props.state.chatViewModel.activeSessionId || '').trim()
  const seq = ++loadSeq
  if (!sessionId) {
    notes.value = []
    return
  }
  loading.value = true
  try {
    const list = await fetchChatMessageNotesBySessionId(sessionId)
    if (seq !== loadSeq) return
    notes.value = list
  } catch (error) {
    if (seq !== loadSeq) return
    console.error('移动端加载消息笔记失败:', error)
    notes.value = []
  } finally {
    if (seq === loadSeq) loading.value = false
  }
}

async function deleteNote(note: ChatMessageNote) {
  const sessionId = String(props.state.chatViewModel.activeSessionId || '').trim()
  const noteId = String(note?.id || '').trim()
  if (!sessionId || !noteId) return
  try {
    await deleteChatMessageNoteBySessionId(sessionId, noteId)
    notes.value = notes.value.filter((item) => String(item.id || '') !== noteId)
  } catch (error) {
    console.error('移动端删除消息笔记失败:', error)
  }
}

async function copyNote(note: ChatMessageNote) {
  const text = String(note.sourceText ?? note.source_text ?? '').trim()
  if (!text) return
  try {
    await navigator.clipboard.writeText(text)
  } catch (error) {
    console.error('移动端复制消息笔记失败:', error)
  }
}

watch(
  () => props.open,
  (open) => {
    if (open) void loadNotes()
  },
  { immediate: true }
)
</script>

<style scoped>
.mobile-notes-panel {
  width: 100%;
}
</style>
