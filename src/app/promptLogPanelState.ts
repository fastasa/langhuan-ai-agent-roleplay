import { ref } from 'vue'

export const promptLogFocusMessageId = ref<number | null>(null)
export const promptLogFocusLogId = ref<string>('')

export function requestPromptLogFocus(messageId?: number | string | null) {
  const nextId = Number(messageId)
  promptLogFocusMessageId.value = Number.isInteger(nextId) && nextId > 0 ? nextId : null
  if (promptLogFocusMessageId.value) promptLogFocusLogId.value = ''
}

export function requestPromptLogFocusByLogId(logId?: string | null) {
  const nextId = String(logId || '').trim()
  promptLogFocusLogId.value = nextId
  if (nextId) promptLogFocusMessageId.value = null
}

export function clearPromptLogFocus() {
  promptLogFocusMessageId.value = null
  promptLogFocusLogId.value = ''
}
