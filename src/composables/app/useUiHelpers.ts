import { computed, ref, onMounted, onUnmounted } from 'vue'
import type { useWorkspaceRuntimeStore } from '../../app/workspaceRuntimeStore'
import { getChatStoreAbortController, setChatStoreTyping } from '../../repositories/chatRepository'
import { renderChatMarkdownToHtml } from '../../utils/chatMarkdown'
import { useTreeExpandPersistence } from '../useTreeExpandPersistence'

const CONTACT_GROUP_EXPAND_STORAGE_KEY = 'langhuan_sidebar_expanded_contact_groups_v1'

type WebAudioWindow = Window & typeof globalThis & {
  webkitAudioContext?: typeof AudioContext
}

export function useUiHelpers({
  charStore,
  collapsedGroups,
  chatStore,
  streamingText,
  showConfirmDialog,
  confirmDialog,
  showPromptDialog,
  promptDialog,
  showChatTransferDialog,
  chatTransferDialog,
  timerEventEmitter,
  workspaceRuntimeStore
}: any) {
  const runtimeStore = workspaceRuntimeStore as ReturnType<typeof useWorkspaceRuntimeStore> | undefined
  const localTimerCompleteVisible = ref(false)
  const localTimerCompleteTicketName = ref('')
  const localTimerCompleteMessage = ref('')
  const localTimerCompleteTitle = ref('票据计时完成')
  const localTimerCompleteType = ref<'info' | 'success' | 'warning'>('info')
  const timerCompleteVisible = runtimeStore
    ? computed(() => runtimeStore.feedbackCenter.banner.visible)
    : localTimerCompleteVisible
  const timerCompleteTicketName = runtimeStore
    ? computed(() => runtimeStore.feedbackCenter.banner.ticketName)
    : localTimerCompleteTicketName
  const timerCompleteMessage = runtimeStore
    ? computed(() => runtimeStore.feedbackCenter.banner.message)
    : localTimerCompleteMessage
  const timerCompleteTitle = runtimeStore
    ? computed(() => runtimeStore.feedbackCenter.banner.title)
    : localTimerCompleteTitle
  const timerCompleteType = runtimeStore
    ? computed(() => {
        const type = runtimeStore.feedbackCenter.banner.type
        return (type === 'idle' ? 'info' : type) as 'info' | 'success' | 'warning'
      })
    : localTimerCompleteType
  let timerBannerTimer: ReturnType<typeof setTimeout> | null = null

  function playNotificationSound() {
    try {
      const audioCtor = window.AudioContext || (window as WebAudioWindow).webkitAudioContext
      if (!audioCtor) return
      const audioCtx = new audioCtor()
      const oscillator = audioCtx.createOscillator()
      const gainNode = audioCtx.createGain()

      oscillator.connect(gainNode)
      gainNode.connect(audioCtx.destination)

      oscillator.frequency.value = 800
      oscillator.type = 'sine'
      gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime)
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3)

      oscillator.start(audioCtx.currentTime)
      oscillator.stop(audioCtx.currentTime + 0.3)
    } catch (e) {
      console.warn('播放音效失败:', e)
    }
  }

  function onTimerComplete(event: any) {
    const ticketName = event.detail.ticketName
    const message = event.detail.message || `${ticketName} 时间已用完`
    const title = event.detail.title || '票据计时完成'
    const type = event.detail.type || 'info'
    if (runtimeStore) {
      runtimeStore.showBanner({
        ticketName,
        message,
        title,
        type
      })
    } else {
      localTimerCompleteTicketName.value = ticketName
      localTimerCompleteMessage.value = message
      localTimerCompleteTitle.value = title
      localTimerCompleteType.value = type
      localTimerCompleteVisible.value = true
    }
    if (timerBannerTimer) clearTimeout(timerBannerTimer)
    timerBannerTimer = setTimeout(() => {
      if (runtimeStore) {
        runtimeStore.hideBanner()
      } else {
        localTimerCompleteVisible.value = false
      }
    }, 6000)
    playNotificationSound()
  }

  onMounted(() => {
    timerEventEmitter.addEventListener('timer-complete', onTimerComplete)
  })

  onUnmounted(() => {
    timerEventEmitter.removeEventListener('timer-complete', onTimerComplete)
    if (timerBannerTimer) clearTimeout(timerBannerTimer)
  })

  function closeTimerCompleteModal() {
    if (runtimeStore) {
      runtimeStore.hideBanner()
    } else {
      localTimerCompleteVisible.value = false
      localTimerCompleteMessage.value = ''
    }
    if (timerBannerTimer) {
      clearTimeout(timerBannerTimer)
      timerBannerTimer = null
    }
  }

  function formatChatText(text: string) {
    return renderChatMarkdownToHtml(text)
  }

  function abortChat() {
    let stoppedRuntimeTask = false
    // 停止一切（2026-07-06 用户拍板）：不只停前台任务——并行旁白、外部提调轮等 running 任务一并 abort，
    // 兑现「只要在跑，按停止就立刻停止一切」；旧 store 无 stopAllChatTaskRuns 时回退只停前台。
    if (runtimeStore?.hasRunningChatTasks && typeof runtimeStore.stopAllChatTaskRuns === 'function') {
      runtimeStore.stopAllChatTaskRuns()
      stoppedRuntimeTask = true
    } else if (runtimeStore?.hasRunningChatTasks && typeof runtimeStore.stopForegroundChatTaskRun === 'function') {
      runtimeStore.stopForegroundChatTaskRun()
      stoppedRuntimeTask = true
    }
    if (typeof chatStore.stopGeneration === 'function') {
      chatStore.stopGeneration()
    } else if (!stoppedRuntimeTask) {
      const abortController = getChatStoreAbortController(chatStore)
      if (abortController) {
        abortController.abort()
      }
      setChatStoreTyping(chatStore, false)
      chatStore.clearLocalStreamingMessages?.()
    } else {
      chatStore.clearLocalStreamingMessages?.()
    }
    streamingText.value = ''
  }

  const { saveExpandedIds } = useTreeExpandPersistence(CONTACT_GROUP_EXPAND_STORAGE_KEY)

  function toggleGroupCollapse(groupId: string) {
    // 默认折叠：collapsedGroups 只存"显式展开"的分组（false），折叠态直接删除记录而不是写 true，
    // 这样持久化时只需要保存展开集合，符合"只标记哪些展开了"的口径。
    if (collapsedGroups[groupId] === false) {
      delete collapsedGroups[groupId]
    } else {
      collapsedGroups[groupId] = false
    }
    saveExpandedIds(Object.keys(collapsedGroups).filter((id) => collapsedGroups[id] === false))
  }

  const charactersByGroup = computed(() => {
    const grouped = new Map<string, any[]>()
    for (const character of (Array.isArray(charStore.characters) ? charStore.characters : [])) {
      const groupId = String(character?.groupId ?? character?.group_id ?? character?.group ?? '').trim()
      const entries = grouped.get(groupId)
      if (entries) entries.push(character)
      else grouped.set(groupId, [character])
    }
    grouped.forEach((entries) => {
      entries.sort((left: any, right: any) => {
        const leftOrder = Number(left?.orderIndex ?? left?.order_index ?? Number.MAX_SAFE_INTEGER)
        const rightOrder = Number(right?.orderIndex ?? right?.order_index ?? Number.MAX_SAFE_INTEGER)
        if (leftOrder !== rightOrder) return leftOrder - rightOrder
        return String(left?.name || '').localeCompare(String(right?.name || ''), 'zh-Hans-CN')
      })
    })
    return grouped
  })

  function getCharactersByGroup(groupId: string) {
    return charactersByGroup.value.get(String(groupId || '').trim()) || []
  }

  function handleConfirmClick() {
    if (confirmDialog.onConfirm) {
      confirmDialog.onConfirm()
    }
    showConfirmDialog.value = false
  }

  function openConfirmDialog(title: string, message: string, onConfirm: any, options: any = {}) {
    confirmDialog.title = title
    confirmDialog.message = message
    confirmDialog.confirmText = options?.confirmText || '确认'
    confirmDialog.size = options?.size === 'md' ? 'md' : 'sm'
    confirmDialog.heightPreset = options?.heightPreset === 'tall' ? 'tall' : 'default'
    confirmDialog.onConfirm = onConfirm
    showConfirmDialog.value = true
  }

  function closePromptDialog() {
    promptDialog.title = ''
    promptDialog.message = ''
    promptDialog.inputLabel = ''
    promptDialog.placeholder = ''
    promptDialog.confirmText = '确认'
    promptDialog.value = ''
    promptDialog.onConfirm = null
    promptDialog.validator = null
    showPromptDialog.value = false
  }

  function handlePromptSubmit() {
    const submit = promptDialog.onConfirm
    if (typeof submit === 'function') {
      submit(String(promptDialog.value || ''))
    }
    closePromptDialog()
  }

  function openPromptDialog(options: {
    title: string
    message?: string
    inputLabel?: string
    placeholder?: string
    confirmText?: string
    initialValue?: string
    validator?: (value: string) => string
    onConfirm: (value: string) => void
  }) {
    promptDialog.title = options.title
    promptDialog.message = options.message || ''
    promptDialog.inputLabel = options.inputLabel || ''
    promptDialog.placeholder = options.placeholder || ''
    promptDialog.confirmText = options.confirmText || '确认'
    promptDialog.value = options.initialValue || ''
    promptDialog.validator = options.validator || null
    promptDialog.onConfirm = options.onConfirm
    showPromptDialog.value = true
  }

  function closeChatTransferDialog() {
    chatTransferDialog.title = ''
    chatTransferDialog.sourceTarget = ''
    chatTransferDialog.toSingle = false
    chatTransferDialog.candidates = []
    chatTransferDialog.input = ''
    chatTransferDialog.targetId = ''
    chatTransferDialog.loading = false
    chatTransferDialog.onConfirm = null
    showChatTransferDialog.value = false
  }

  function confirmChatTransfer() {
    const handler = chatTransferDialog.onConfirm
    if (typeof handler === 'function') {
      handler()
    }
  }

  return {
    timerCompleteVisible,
    timerCompleteTicketName,
    timerCompleteMessage,
    timerCompleteTitle,
    timerCompleteType,
    closeTimerCompleteModal,
    formatChatText,
    abortChat,
    toggleGroupCollapse,
    getCharactersByGroup,
    handleConfirmClick,
    openConfirmDialog,
    handlePromptSubmit,
    openPromptDialog,
    closePromptDialog,
    closeChatTransferDialog,
    confirmChatTransfer
  }
}
