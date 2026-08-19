export interface EmptyFinalReplyDiagnosticInput {
  returnedText: unknown
  streamedText: string
  normalizedReply: string
  cleanedReply: string
  visibleReply: string
}

export function classifyEmptyFinalReplyError(input: EmptyFinalReplyDiagnosticInput): string {
  const returnedText = String(input.returnedText ?? '')
  const streamedText = String(input.streamedText || '')
  const normalizedReply = String(input.normalizedReply || '')
  const cleanedReply = String(input.cleanedReply || '')
  const visibleReply = String(input.visibleReply || '')
  if (!returnedText.trim() && !streamedText.trim()) {
    return '模型原始返回为空：没有收到任何正文。'
  }
  if (/<think>[\s\S]*?<\/think>/i.test(cleanedReply) && !visibleReply) {
    return '模型只返回了思考过程，移除思考内容后没有正文。'
  }
  if (normalizedReply.trim() && !cleanedReply.trim()) {
    return '清理角色名或回复前缀后，没有剩余正文。'
  }
  if (cleanedReply.trim() && !visibleReply) {
    return '清理不可见内容后，没有剩余正文。'
  }
  return '模型返回内容没有通过正文校验，无法保存。'
}

export interface FinalRoleFailureMessageInput {
  error: string
  speakerName: string
  speakerTargetId?: string
  envDate?: string
  envWeather?: string
  envLocation?: string
  model?: string
  time?: string
}

/**
 * 角色回复失败也是一条属于原角色的聊天消息。内部诊断留在执行审计里，
 * 对话区只呈现用户能理解、能直接重试的错误正文。
 */
export function buildFinalRoleFailureMessage(input: FinalRoleFailureMessageInput) {
  const speakerName = String(input.speakerName || '').trim() || '角色'
  const speakerTargetId = String(input.speakerTargetId || '').trim()
  const error = String(input.error || '').trim() || '未知错误'
  return {
    role: 'assistant' as const,
    messageKind: 'chat',
    message_kind: 'chat',
    includeInContext: false,
    include_in_context: false,
    name: speakerName,
    memberName: speakerName,
    ...(speakerTargetId
      ? {
          memberTargetId: speakerTargetId,
          member_target_id: speakerTargetId,
          speakerTargetId,
          speaker_target_id: speakerTargetId
        }
      : {}),
    content: [
      '【角色消息生成失败】',
      '',
      `错误：${error}`,
      '',
      '可以对这条消息使用“按原提示词重试”。'
    ].join('\n'),
    time: input.time || new Date().toLocaleTimeString(),
    envDate: input.envDate,
    envWeather: input.envWeather,
    envLocation: input.envLocation,
    model: String(input.model || '')
  }
}
