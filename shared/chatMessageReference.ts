/** 工具间传递消息引用时使用结构字段；人类可读楼层只属于显示层。 */
export type ChatMessageReference = {
  kind: 'chat_message'
  sessionId: string
  messageId: number
}

export function createChatMessageReference(sessionId: unknown, messageId: unknown): ChatMessageReference {
  const normalizedSessionId = String(sessionId || '').trim()
  const normalizedMessageId = Number(messageId)
  if (!normalizedSessionId) throw new Error('消息引用缺少 sessionId')
  if (!Number.isInteger(normalizedMessageId) || normalizedMessageId <= 0) throw new Error('消息引用缺少合法 messageId')
  return { kind: 'chat_message', sessionId: normalizedSessionId, messageId: normalizedMessageId }
}

export function parseChatMessageReference(value: unknown, fallbackSessionId = ''): ChatMessageReference | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, unknown>
    try {
      return createChatMessageReference(record.sessionId ?? fallbackSessionId, record.messageId ?? record.id)
    } catch {
      return null
    }
  }
  const text = String(value || '').trim()
  const match = text.match(/^(?:message:|#)?(\d+)$/i)
  if (!match) return null
  try {
    return createChatMessageReference(fallbackSessionId, Number(match[1]))
  } catch {
    return null
  }
}

export function renderChatMessageReference(reference: ChatMessageReference): string {
  return `#${reference.messageId}`
}
