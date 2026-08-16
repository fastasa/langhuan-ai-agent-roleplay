import {
  buildPersonalityFinalPrompt,
  type PersonalityModelContextInput
} from './personalityModelContext'
import { buildEmbeddedMessageProjectionInstruction } from './messageProjectionAgent'

export type ChatPromptRole = 'system' | 'user' | 'assistant'

export interface ChatPromptMessage {
  role: ChatPromptRole
  content: string
}

export type ChatPromptBuildOptions = Record<string, unknown>
  & { personalityModelContext?: PersonalityModelContextInput | null }

export type ChatPromptMessageBuilder = (
  targetId: string,
  userText: string,
  sourceMessages?: unknown[],
  speakerTargetId?: string,
  options?: ChatPromptBuildOptions
) => Promise<ChatPromptMessage[]>

export interface BuildFinalOutboundPromptInput {
  buildChatMessages: ChatPromptMessageBuilder
  targetId: string
  userText: string
  speakerTargetId: string
  options?: ChatPromptBuildOptions
  sourceMessages?: unknown[]
}

function isHiddenFromPrompt(message: Record<string, unknown>): boolean {
  const kind = String(message.messageKind ?? message.message_kind ?? '').trim()
  if (kind === 'narration_debug') return true
  const hidden = message.autoWriteHidden ?? message.auto_write_hidden
  return hidden === true || hidden === 1 || hidden === '1' || hidden === 'true'
}

function toPromptRole(value: unknown): ChatPromptRole | null {
  const role = String(value ?? '').trim()
  return role === 'system' || role === 'user' || role === 'assistant' ? role : null
}

function buildPurePromptMessages(userText: string, sourceMessages?: unknown[]): ChatPromptMessage[] {
  const messages = (Array.isArray(sourceMessages) ? sourceMessages : [])
    .map((message) => message && typeof message === 'object' ? message as Record<string, unknown> : null)
    .filter((message): message is Record<string, unknown> => Boolean(message))
    .filter((message) => !isHiddenFromPrompt(message))
    .map((message) => {
      const role = toPromptRole(message.role)
      const content = typeof message.content === 'string' ? message.content : ''
      if (!role || !content) return null
      return { role, content }
    })
    .filter((message): message is ChatPromptMessage => Boolean(message))

  const hasCurrentInput = messages.some((message) => message.role === 'user' && message.content === userText)
  if (!hasCurrentInput) {
    messages.push({ role: 'user', content: userText })
  }
  return messages.length ? messages : [{ role: 'user', content: userText }]
}

function appendEmbeddedProjectionInstruction(messages: ChatPromptMessage[]): ChatPromptMessage[] {
  if (!messages.length) return messages
  const nextMessages = messages.slice()
  const instruction = buildEmbeddedMessageProjectionInstruction('本条角色回复')
  const userIndexes = nextMessages.map((message, index) => message.role === 'user' ? index : -1).filter((index) => index >= 0)
  const lastUserIndex = userIndexes.length ? userIndexes[userIndexes.length - 1] : -1
  const targetIndex = typeof lastUserIndex === 'number' && lastUserIndex >= 0 ? lastUserIndex : nextMessages.length - 1
  const target = nextMessages[targetIndex]
  if (!target) return nextMessages
  nextMessages[targetIndex] = {
    ...target,
    content: [target.content, '【输出格式要求】', instruction].filter(Boolean).join('\n\n')
  }
  return nextMessages
}

// 旧 prepareRecallContextSnapshot（普通召回旧召回预热入口）已随 2026-06-10 统一回复工作流退场：
// 召回预热由 buildReplyWorkflowFinalContext 内的 prepareAIRecall ∥ 编排路由承担。
export async function buildFinalOutboundPrompt(input: BuildFinalOutboundPromptInput): Promise<ChatPromptMessage[]> {
  if (input.options?.purePrompt) {
    return buildPurePromptMessages(input.userText, input.sourceMessages)
  }
  if (input.options?.personalityModelContext) {
    return buildPersonalityFinalPrompt({
      ...input.options.personalityModelContext,
      currentUserInput: input.options.personalityModelContext.currentUserInput || input.userText
    }).messages
  }
  return input.buildChatMessages(
    input.targetId,
    input.userText,
    input.sourceMessages,
    input.speakerTargetId,
    input.options
  ).then(appendEmbeddedProjectionInstruction)
}
