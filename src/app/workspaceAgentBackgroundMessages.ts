/**
 * 后台子 Agent 向原工作区会话投递助手消息。
 *
 * 会话 id 在派遣瞬间钉死：用户即使切到新对话，回执也只落回原会话；当前视图仍是原会话时，
 * 同步追加气泡。持久化失败时不伪装“已送达”，调用方可把失败写进后台任务通知状态。
 */

import { createChatMessageBySessionId } from '../repositories/chatRepository'
import { findScopeState } from './workspaceAgentScopeState'

export async function appendWorkspaceAgentBackgroundMessage(input: {
  scopeKey: string
  sessionId: string
  content: string
}): Promise<void> {
  const sessionId = String(input.sessionId || '').trim()
  const content = String(input.content || '').trim()
  if (!sessionId) throw new Error('后台回执缺少原工作区会话 id')
  if (!content) throw new Error('后台回执正文为空')

  await createChatMessageBySessionId(sessionId, {
    role: 'assistant',
    content
  })
  const state = findScopeState(input.scopeKey)
  if (state?.sessionId === sessionId) {
    state.messages.push({ role: 'assistant', content })
  }
}
