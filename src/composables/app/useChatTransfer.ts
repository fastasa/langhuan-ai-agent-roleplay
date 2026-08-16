export function useChatTransfer({
  toast
}: any) {
  async function transferCurrentChat() {
    toast('旧聊天转移入口已停用，请在会话列表中管理会话。', 'warning')
  }

  return {
    transferCurrentChat
  }
}
