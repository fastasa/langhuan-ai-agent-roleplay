import { nextTick, ref } from 'vue'
import { getChatStoreActiveSessionId, getChatStoreActiveTargetId } from '../../repositories/chatRepository'
import { getSessionTemporaryCharacterMentionName } from '../../app/sessionTemporaryCharactersState'
import { useImageAttachments, type ImageAttachmentCaptionDeps } from './useImageAttachments'

const CHAT_INPUT_MAX_HEIGHT = 114

interface CharacterLike {
  id: string
  name: string
}

export type ClearChatContextOptions = {
  clearSessionTemporaryCharacters: boolean
}

export function useChatUiState({
  charStore,
  chatStore,
  settingStore,
  callAI,
  toast,
  openConfirmDialog,
  openClearChatContextDialog
}: {
  charStore: { characters: CharacterLike[] }
  chatStore: {
    current?: {
      currentChatTarget?: string | { value: string }
      getActiveTargetId?: () => string
    }
    clearChat: (target: string) => Promise<void> | void
    clearChatContext?: (target: string, options?: Partial<ClearChatContextOptions>) => Promise<void> | void
    startNewChat?: (target: string) => Promise<void> | void
    loadChatArchives?: () => Promise<void> | void
  }
  /** 附件真值与 chatInputText 同层同源（输入框图片上传计划批4）：settingStore 只取 agentModelConfigs 找
   *  brain_agent 档给图片转述（caption）用，callAI 注入结构同 chatImageCaption.ts::ChatImageCaptionAiCaller。 */
  settingStore?: { agentModelConfigs?: unknown[] }
  callAI?: ImageAttachmentCaptionDeps['callAI']
  toast: (msg: string, type?: 'success' | 'error' | 'info' | 'warning') => void
  openConfirmDialog?: (title: string, message: string, onConfirm: () => void) => void
  openClearChatContextDialog?: (onConfirm: (options: ClearChatContextOptions) => void) => void
}) {
  const chatInputText = ref('')
  // 图片附件状态与 chatInputText 同层同源（批4）：主聊天输入框（含提调统筹入口）唯一实例，
  // 与星依浮坞（批5·各自 new 一份）互不共享——两处上传是并行的两条队伍。
  // ⚠️ getCaptionDeps 本身仍原样注入，但 caption 默认不触发——见 useImageAttachments.ts::IMAGE_CAPTION_ENABLED
  // （用户 2026-07-11 拍板默认关闭）。这段注入代码保留不删，是复活开关时唯一依赖的依赖源。
  const chatImageAttachments = useImageAttachments({
    getCaptionDeps: () => (typeof callAI === 'function'
      ? {
        agentConfig: readBrainAgentConfigForCaption(),
        callAI,
        sessionId: getChatStoreActiveSessionId(chatStore)
      }
      : null)
  })
  function readBrainAgentConfigForCaption() {
    const configs = Array.isArray(settingStore?.agentModelConfigs) ? settingStore!.agentModelConfigs : []
    return (configs.find((item: any) => String(item?.id || '').trim() === 'brain_agent') as any) || null
  }
  const plusMenuOpen = ref(false)
  const atMenuOpen = ref(false)
  const atSearchText = ref('')
  const menuContainerRef = ref<HTMLElement | null>(null)
  const chatInput = ref<HTMLTextAreaElement | null>(null)
  const mentionSelectedChars = ref<string[]>([])
  const mentionExcludedChars = ref<string[]>([])

  function getActiveTargetId() {
    return getChatStoreActiveTargetId(chatStore)
  }

  function handleClickOutside(event: MouseEvent) {
    const container = menuContainerRef.value
    if (container && !container.contains(event.target as Node)) {
      plusMenuOpen.value = false
      atMenuOpen.value = false
    }
  }

  function togglePlusMenu() {
    if (atMenuOpen.value) {
      atMenuOpen.value = false
      plusMenuOpen.value = false
      return
    }
    plusMenuOpen.value = !plusMenuOpen.value
  }

  // event 可缺省：移动端等场景会单参调用 inputChatText（无原生输入事件），此时不做 textarea 自适应，避免读 undefined.target 崩溃
  function autoResize(event?: Event) {
    const textarea = event?.target as HTMLTextAreaElement | null
    if (!textarea) return
    textarea.style.height = 'auto'
    textarea.style.height = `${Math.min(textarea.scrollHeight, CHAT_INPUT_MAX_HEIGHT)}px`
  }

  function handleAtInput() {
    const text = chatInputText.value
    const lastAt = text.lastIndexOf('@')
    if (lastAt >= 0 && lastAt === text.length - 1) {
      atMenuOpen.value = true
      atSearchText.value = ''
      return
    }
    if (lastAt >= 0 && !text.substring(lastAt).includes(' ')) {
      atMenuOpen.value = true
      atSearchText.value = text.substring(lastAt + 1)
      return
    }
    atMenuOpen.value = false
  }

  function insertAtCharacter(char: CharacterLike) {
    const lastAt = chatInputText.value.lastIndexOf('@')
    chatInputText.value = `${chatInputText.value.substring(0, lastAt)}@${char.name} `
    atMenuOpen.value = false
  }

  function getCharNameById(charId: string) {
    const sessionTemporaryName = getSessionTemporaryCharacterMentionName(charId)
    if (sessionTemporaryName) return sessionTemporaryName
    const char = charStore.characters.find((c) => c.id === charId)
    return char ? char.name : '未知'
  }

  function addMentionChar(charId: string) {
    if (mentionExcludedChars.value.includes(charId)) {
      toast('该角色已被排除', 'info')
      return
    }
    if (mentionSelectedChars.value.includes(charId)) {
      return
    }
    mentionSelectedChars.value.push(charId)
  }

  function removeMentionChar(index: number) {
    mentionSelectedChars.value.splice(index, 1)
  }

  function toggleExcludeChar(charId: string) {
    const idx = mentionExcludedChars.value.indexOf(charId)
    if (idx > -1) {
      mentionExcludedChars.value.splice(idx, 1)
      return
    }

    mentionExcludedChars.value.push(charId)
    const selIdx = mentionSelectedChars.value.indexOf(charId)
    if (selIdx > -1) {
      mentionSelectedChars.value.splice(selIdx, 1)
    }
  }

  function insertOOC() {
    chatInputText.value += '(OOC: )'
    plusMenuOpen.value = false
    nextTick(() => chatInput.value?.focus())
  }

  function insertNarration() {
    chatInputText.value += '*'
    plusMenuOpen.value = false
    nextTick(() => chatInput.value?.focus())
  }

  function insertSystemMsg() {
    chatInputText.value += '[系统] '
    plusMenuOpen.value = false
    nextTick(() => chatInput.value?.focus())
  }

  async function clearCurrentChat() {
    const targetId = getActiveTargetId()
    const runNewChat = async () => {
      if (typeof chatStore.startNewChat === 'function') {
        await chatStore.startNewChat(targetId)
        await chatStore.loadChatArchives?.()
      } else {
        await chatStore.clearChat(targetId)
      }
      plusMenuOpen.value = false
    }

    if (typeof openConfirmDialog === 'function') {
      openConfirmDialog('开始新对话', '当前聊天会进入聊天记录。', () => {
        void runNewChat()
      })
      return
    }

    await runNewChat()
  }

  async function clearCurrentChatContext(options: Partial<ClearChatContextOptions> = {}) {
    const targetId = getActiveTargetId()
    if (typeof chatStore.clearChatContext === 'function') {
      await chatStore.clearChatContext(targetId, options)
    } else {
      await chatStore.clearChat(targetId)
    }
    plusMenuOpen.value = false
    toast('对话已清空', 'success')
  }

  function requestClearCurrentChatContext() {
    const runClear = (options: ClearChatContextOptions) => {
      void clearCurrentChatContext(options).catch((error) => {
        console.error('清空对话失败:', error)
        toast(error instanceof Error ? error.message : '清空对话失败', 'error')
      })
    }

    if (typeof openClearChatContextDialog === 'function') {
      openClearChatContextDialog(runClear)
      return
    }

    if (typeof openConfirmDialog === 'function') {
      openConfirmDialog('清空对话', '将清空当前对话内的上下文。此操作不可撤销。', () => {
        runClear({
          clearSessionTemporaryCharacters: false
        })
      })
      return
    }

    runClear({
      clearSessionTemporaryCharacters: false
    })
  }

  function setMenuContainerRef(el: Element | null) {
    menuContainerRef.value = el as HTMLElement | null
  }

  function setChatInputRef(el: Element | null) {
    chatInput.value = el as HTMLTextAreaElement | null
  }

  function onInputChatText(value: string, event?: Event) {
    chatInputText.value = value
    handleAtInput()
    autoResize(event)
  }

  return {
    chatInputText,
    plusMenuOpen,
    atMenuOpen,
    atSearchText,
    menuContainerRef,
    chatInput,
    mentionSelectedChars,
    mentionExcludedChars,
    handleClickOutside,
    togglePlusMenu,
    autoResize,
    handleAtInput,
    insertAtCharacter,
    getCharNameById,
    addMentionChar,
    removeMentionChar,
    toggleExcludeChar,
    insertOOC,
    insertNarration,
    insertSystemMsg,
    clearCurrentChat,
    clearCurrentChatContext,
    requestClearCurrentChatContext,
    setMenuContainerRef,
    setChatInputRef,
    onInputChatText,
    // 图片附件（批4）：UI 侧 6 件（pendingImages 状态 + 5 个交互动作）+ 发送管线专用 takeImageAttachments
    //（sendText 消费时取走并清空；UI 侧不直接暴露 takeAttachments/clear，避免误用打断上传中状态）。
    pendingImageAttachments: chatImageAttachments.pendingImages,
    handleImageAttachmentPaste: chatImageAttachments.handlePaste,
    handleImageAttachmentDrop: chatImageAttachments.handleDrop,
    handleImageAttachmentDragOver: chatImageAttachments.handleDragOver,
    removeImageAttachment: chatImageAttachments.removeImage,
    retryImageAttachmentUpload: chatImageAttachments.retryUpload,
    takeImageAttachments: chatImageAttachments.takeAttachments
  }
}
