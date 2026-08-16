export type ChatInputKind = 'focused_action'

export type ChatSendPayload = {
  text?: string
  inputKind?: ChatInputKind
}

/**
 * 聊天发送命令的正式边界：正文与输入身份必须一起穿过工作区命令桥。
 * 动作入口允许暂不携带正文，由发送管线从当前输入真值补齐；但绝不能因此丢失 inputKind。
 */
export function normalizeChatSendPayload(payload?: string | ChatSendPayload): ChatSendPayload | undefined {
  if (typeof payload === 'string') {
    return { text: payload }
  }
  if (!payload || typeof payload !== 'object') return undefined

  const normalized: ChatSendPayload = {}
  if (typeof payload.text === 'string') normalized.text = payload.text
  if (payload.inputKind === 'focused_action') normalized.inputKind = payload.inputKind
  return Object.keys(normalized).length ? normalized : undefined
}
