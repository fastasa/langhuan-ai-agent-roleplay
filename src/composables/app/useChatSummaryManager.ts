import { computed, reactive, ref, watch, type Ref } from 'vue'
import {
  getChatSessionLoadedSummaryIds,
  getChatStoreActiveSessionId,
  getChatStoreActiveTargetId,
  getChatStoreCurrentSession
} from '../../repositories/chatRepository'
import { saveConfigSnapshot } from '../../repositories/settingRepository'

export function useChatSummaryManager({
  chatStore,
  charStore,
  settingStore,
  getAIOptions
}: {
  chatStore: any
  charStore: any
  settingStore: any
  currentMessages?: Ref<any[]>
  callAI?: (messages: any[], options?: any) => Promise<string | null>
  getAIOptions: (targetId: string) => any
}) {
  const showConversationManager = ref(false)
  const showChatSummary = ref(false)
  const showSummaryList = ref(false)
  const showSummaryEditor = ref(false)
  const showBigSummaryConfirm = ref(false)
  const showSlotManager = ref(false)

  const summaryContent = ref('')
  const summaryEditForm = reactive({ id: null as any, name: '', tags: '', content: '' })
  const summaryPresetName = ref('')
  const summaryModel = ref('')

  const getActiveTargetId = () => getChatStoreActiveTargetId(chatStore)

  const getActiveSession = () => getChatStoreCurrentSession(chatStore)

  const getActiveSessionId = () => String(getChatStoreActiveSessionId(chatStore) || getActiveSession()?.id || '')

  const summaryPresetOptions = computed(() => {
    const presets = Array.isArray(settingStore.apiPresets) ? settingStore.apiPresets : []
    return presets.map((preset: any) => ({
      name: String(preset?.name || ''),
      model: String(preset?.model || ''),
      availableModels: Array.isArray(preset?.availableModels) ? preset.availableModels.map((item: unknown) => String(item || '').trim()).filter(Boolean) : []
    })).filter((preset: { name: string }) => preset.name)
  })

  const availableSummaryModels = computed(() => {
    const selectedPreset = summaryPresetOptions.value.find((preset: { name: string }) => preset.name === summaryPresetName.value) || null
    const options = selectedPreset?.availableModels || []
    const fallbackModel = String(selectedPreset?.model || '').trim()
    return Array.from(new Set([...options, fallbackModel].filter(Boolean)))
  })

  const allChatTargets = computed(() => {
    const targets: string[] = []
    ;(charStore.characters || []).forEach((char: any) => targets.push(char.id))
    ;(charStore.groups || []).forEach((group: any) => targets.push(group.id))
    ;(charStore.crowds || []).forEach((crowd: any) => targets.push(crowd.id))
    const activeTargetId = getActiveTargetId()
    if (activeTargetId && !targets.includes(activeTargetId)) {
      targets.unshift(activeTargetId)
    }
    return targets
  })

  function isSummaryLoaded(summaryId: string) {
    const arr = Array.isArray(chatStore.getLoadedSummaryIds?.())
      ? chatStore.getLoadedSummaryIds()
      : getChatSessionLoadedSummaryIds(getActiveSession())
    return arr.includes(summaryId)
  }

  function toggleSummarySlot(summaryId: string) {
    if (isSummaryLoaded(summaryId)) {
      chatStore.unloadSummary(summaryId)
      return
    }
    chatStore.loadSummary(summaryId)
  }

  function syncSummaryAiOptions() {
    const next = getAIOptions(getActiveTargetId()) || {}
    const savedPresetName = String(settingStore.chatSummaryPresetName || '').trim()
    const defaultPresetName = String(settingStore.defaultPreset?.name || '').trim()
    const resolvedPresetName = savedPresetName || String(next.presetName || defaultPresetName || '').trim()
    const presetExists = summaryPresetOptions.value.some((item: { name: string }) => item.name === resolvedPresetName)
    summaryPresetName.value = presetExists ? resolvedPresetName : String(next.presetName || defaultPresetName || '')

    const preset = summaryPresetOptions.value.find((item: { name: string }) => item.name === summaryPresetName.value) || null
    const savedModel = String(settingStore.chatSummaryModel || '').trim()
    const fallbackModel = String(savedModel || next.model || preset?.model || '')
    summaryModel.value = fallbackModel
  }

  watch(summaryPresetName, (nextPresetName) => {
    const selectedPreset = summaryPresetOptions.value.find((preset: { name: string }) => preset.name === String(nextPresetName || '')) || null
    const availableModels = Array.from(new Set([...(selectedPreset?.availableModels || []), String(selectedPreset?.model || '').trim()].filter(Boolean)))
    if (!summaryModel.value) {
      summaryModel.value = String(selectedPreset?.model || '')
      return
    }
    if (availableModels.length > 0 && !availableModels.includes(summaryModel.value)) {
      summaryModel.value = String(selectedPreset?.model || availableModels[0] || '')
    }
  })

  watch(
    [summaryPresetName, summaryModel],
    async ([nextPresetName, nextSummaryModel]) => {
      const normalizedPresetName = String(nextPresetName || '').trim()
      const normalizedSummaryModel = String(nextSummaryModel || '').trim()
      settingStore.chatSummaryPresetName = normalizedPresetName
      settingStore.chatSummaryModel = normalizedSummaryModel
      await saveConfigSnapshot({
        chatSummaryPresetName: normalizedPresetName,
        chatSummaryModel: normalizedSummaryModel
      })
    },
    { flush: 'post' }
  )

  async function saveSummaryToLibrary() {
    const content = String(summaryContent.value || '').trim()
    if (!content) return

    try {
      await chatStore.addSmallSummary({
        id: `small_${Date.now()}`,
        name: `小总结 ${new Date().toLocaleDateString('zh-CN')}`,
        content,
        tags: [],
        charId: getActiveTargetId(),
        sessionId: getActiveSessionId()
      })
      summaryContent.value = ''
      showChatSummary.value = false
    } catch (err: any) {
      summaryContent.value = `保存失败: ${err?.message || err}`
    }
  }

  function editSummaryItem(summary: any) {
    summaryEditForm.id = summary.id
    summaryEditForm.name = summary.name
    summaryEditForm.tags = summary.tags?.join(', ') || ''
    summaryEditForm.content = summary.content
    showSummaryEditor.value = true
  }

  function saveSummaryEdit() {
    const tags = summaryEditForm.tags.split(',').map((s: string) => s.trim()).filter(Boolean)
    chatStore.updateSummary(summaryEditForm.id, {
      name: summaryEditForm.name,
      tags,
      content: summaryEditForm.content
    })
    showSummaryEditor.value = false
  }

  syncSummaryAiOptions()

  return {
    showConversationManager,
    showChatSummary,
    showSummaryList,
    showSummaryEditor,
    showBigSummaryConfirm,
    showSlotManager,
    summaryContent,
    summaryEditForm,
    summaryPresetName,
    summaryModel,
    summaryPresetOptions,
    availableSummaryModels,
    allChatTargets,
    isSummaryLoaded,
    toggleSummarySlot,
    saveSummaryToLibrary,
    editSummaryItem,
    saveSummaryEdit,
    syncSummaryAiOptions,
  }
}
