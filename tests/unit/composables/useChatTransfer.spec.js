import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { useChatTransfer } from '../../../src/composables/app/useChatTransfer.ts'

const {
  fetchChatMessagesForTransfer,
  copyChatMessagesToTarget,
  getChatStoreActiveTargetId
} = vi.hoisted(() => ({
  fetchChatMessagesForTransfer: vi.fn(),
  copyChatMessagesToTarget: vi.fn(),
  getChatStoreActiveTargetId: vi.fn((store) => store.current?.getActiveTargetId?.() || '')
}))

vi.mock('../../../src/repositories/chatRepository.ts', () => ({
  fetchChatMessagesForTransfer,
  copyChatMessagesToTarget,
  getChatStoreActiveTargetId
}))

function createTransferDeps() {
  const toast = vi.fn()
  const closeChatTransferDialog = vi.fn()
  const scrollToBottom = vi.fn()
  const switchChat = vi.fn(async () => {})

  const chatTransferDialog = {
    title: '',
    sourceTarget: 'group_demo',
    toSingle: true,
    candidates: [{ id: 'char_1', name: '星依' }],
    input: '',
    targetId: 'char_1',
    loading: false,
    onConfirm: null
  }

  return {
    toast,
    closeChatTransferDialog,
    scrollToBottom,
    switchChat,
    chatTransferDialog,
    api: useChatTransfer({
      charStore: {
        characters: [{ id: 'char_1', name: '星依' }],
        groups: []
      },
      chatStore: {
        current: {
          getActiveTargetId: () => 'group_demo'
        },
        switchChat
      },
      chatTransferDialog,
      showChatTransferDialog: ref(false),
      closeChatTransferDialog,
      scrollToBottom,
      toast
    })
  }
}

describe('useChatTransfer', () => {
  // 旧聊天转移入口已下线为占位 toast，无弹窗/onConfirm；这里只校验占位行为。
  it('调用转移入口时只给出已停用的占位提示', async () => {
    const { api, toast } = createTransferDeps()

    await api.transferCurrentChat()

    expect(toast).toHaveBeenCalledWith('旧聊天转移入口已停用，请在会话列表中管理会话。', 'warning')
  })

  it('占位入口不再读取或复制任何聊天记录', async () => {
    const { api, closeChatTransferDialog, switchChat } = createTransferDeps()

    await api.transferCurrentChat()

    expect(fetchChatMessagesForTransfer).not.toHaveBeenCalled()
    expect(copyChatMessagesToTarget).not.toHaveBeenCalled()
    expect(closeChatTransferDialog).not.toHaveBeenCalled()
    expect(switchChat).not.toHaveBeenCalled()
  })
})
