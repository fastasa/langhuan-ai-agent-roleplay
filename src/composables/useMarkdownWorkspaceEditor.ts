import { nextTick, ref, watch, type Ref } from 'vue'

type SyncPayload = {
  title?: string
  content?: string
}

type Options = {
  focusEditor?: () => void
}

export function useMarkdownWorkspaceEditor(options: Options = {}) {
  const isEditMode = ref(false)
  const previewVisible = ref(true)
  const draftTitle = ref('')
  const draftContent = ref('')
  const draftHistory = ref<string[]>([])
  const draftHistoryIndex = ref(-1)

  function syncFromSource(payload: SyncPayload = {}) {
    draftTitle.value = String(payload.title || '')
    draftContent.value = String(payload.content || '')
    draftHistory.value = [draftContent.value]
    draftHistoryIndex.value = 0
  }

  function openEditor(payload: SyncPayload = {}) {
    isEditMode.value = true
    previewVisible.value = true
    syncFromSource(payload)
    nextTick(() => {
      options.focusEditor?.()
    })
  }

  function closeEditor(payload: SyncPayload = {}) {
    isEditMode.value = false
    previewVisible.value = true
    syncFromSource(payload)
  }

  function pushDraftHistory(value: string) {
    const history = draftHistory.value.slice(0, draftHistoryIndex.value + 1)
    if (history[history.length - 1] === value) return
    history.push(value)
    draftHistory.value = history.slice(-60)
    draftHistoryIndex.value = draftHistory.value.length - 1
  }

  function updateDraftContent(nextValue: string) {
    draftContent.value = nextValue
  }

  function undoDraft() {
    if (draftHistoryIndex.value <= 0) return
    draftHistoryIndex.value -= 1
    draftContent.value = draftHistory.value[draftHistoryIndex.value] || ''
  }

  function redoDraft() {
    if (draftHistoryIndex.value >= draftHistory.value.length - 1) return
    draftHistoryIndex.value += 1
    draftContent.value = draftHistory.value[draftHistoryIndex.value] || ''
  }

  watch(draftContent, (value) => {
    if (isEditMode.value) pushDraftHistory(value)
  })

  return {
    isEditMode: isEditMode as Ref<boolean>,
    previewVisible: previewVisible as Ref<boolean>,
    draftTitle: draftTitle as Ref<string>,
    draftContent: draftContent as Ref<string>,
    draftHistory: draftHistory as Ref<string[]>,
    draftHistoryIndex: draftHistoryIndex as Ref<number>,
    syncFromSource,
    openEditor,
    closeEditor,
    updateDraftContent,
    undoDraft,
    redoDraft
  }
}
