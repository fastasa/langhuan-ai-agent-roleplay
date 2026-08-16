/**
 * stores/chatStore.ts
 * 管理：聊天会话、消息、当前目标、总结库
 */
import { defineStore } from 'pinia'
import { createChatStoreAssembly } from '../app/chatStoreAssembly'

export const useChatStore = defineStore('chat', () => {
  return createChatStoreAssembly()
})
