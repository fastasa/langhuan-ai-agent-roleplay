interface AIMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

interface UseChatMessagesOptions {
  settingStore: any
  charStore: any
  buildSystemPrompt: (targetId: string, scene: any) => string
  buildPromptMessages?: (targetId: string, scene: any) => Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
  getCurrentScene: () => any
  getCurrentMessages: () => any[]
}

import {
  CHAT_HISTORY_PLACEHOLDER,
  CURRENT_USER_INPUT_PLACEHOLDER,
  CURRENT_USER_NAME_PLACEHOLDER,
  renderCurrentUserInputTemplate,
  resolveDynamicPromptMessages
} from '../utils/promptContext'
import { stripAiThoughtContent } from '../utils/aiOutput'
import { extractDirectorDirectives } from '../app/directorDirective'

export function useChatMessages(options: UseChatMessagesOptions) {
  const { settingStore, charStore, buildSystemPrompt, buildPromptMessages, getCurrentScene, getCurrentMessages } = options

  function getUserDisplayName(): string {
    return String(charStore?.userProfile?.name || '用户').trim() || '用户'
  }

  function stripThinkContent(content: string): string {
    return stripAiThoughtContent(content)
  }

  function escapeRegExp(text: string): string {
    return String(text || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }

  // 去掉开头重复的“说话人：”前缀，避免出现“陈星依：陈星依：...”
  function stripLeadingSpeakerPrefix(content: string, speakerName: string): string {
    const text = String(content || '').trim()
    const speaker = String(speakerName || '').trim()
    if (!text || !speaker) return text
    const escaped = escapeRegExp(speaker)
    const pattern = new RegExp(`^(?:\\[?${escaped}\\]?\\s*[：:]\\s*)+`, 'i')
    return text.replace(pattern, '').trim()
  }

  function formatHistoryMessage(message: any, targetId = ''): AIMessage | null {
    if (!message?.role || typeof message.content !== 'string') return null
    const messageKind = String(message.messageKind ?? message.message_kind ?? '').trim()
    if (messageKind === 'narration_debug') return null
    if (isMessageHiddenFromPrompt(message)) return null

    const cleanContent = stripThinkContent(message.content)
    if (!cleanContent) return null

    if (message.role === 'user') {
      const userName = String(message.name || getUserDisplayName()).trim() || getUserDisplayName()
      const normalizedContent = stripLeadingSpeakerPrefix(cleanContent, userName)
      return { role: 'user', content: `${userName}：${normalizedContent}` }
    }

    const fallbackName = charStore.getCharacter?.(targetId)?.name || '角色'
    const speakerName = message.name || message.memberName || fallbackName
    const normalizedContent = stripLeadingSpeakerPrefix(cleanContent, String(speakerName))
    return { role: 'assistant', content: `${speakerName}：${normalizedContent}` }
  }

  function isMessageHiddenFromPrompt(message: any): boolean {
    const value = message?.autoWriteHidden ?? message?.auto_write_hidden
    return value === true || value === 1 || value === '1' || value === 'true'
  }

  function collectVisiblePromptHistory(historyList: any[] = []): any[] {
    return historyList.filter((message) => {
      if (!message?.role || typeof message.content !== 'string') return false
      const messageKind = String(message.messageKind ?? message.message_kind ?? '').trim()
      if (messageKind === 'narration_debug') return false
      return !isMessageHiddenFromPrompt(message)
    })
  }

  function appendHistoryMessages(messages: AIMessage[], historyList: any[], targetId: string) {
    for (const message of historyList) {
      const formatted = formatHistoryMessage(message, targetId)
      if (formatted) messages.push(formatted)
    }
  }

  function resolveCurrentUserInput(historyList: any[], userText: string): { speakerName: string; rawText: string } {
    const fallbackName = getUserDisplayName()
    const normalizedUserText = String(userText || '').trim()
    const userMessages = [...historyList].reverse().filter((message) => message?.role === 'user')

    if (normalizedUserText) {
      const matched = userMessages.find((message) => String(message?.content || '').trim() === normalizedUserText)
      const latest = matched || userMessages[0]
      return {
        speakerName: String(latest?.name || fallbackName).trim() || fallbackName,
        rawText: normalizedUserText
      }
    }

    const latest = userMessages[0]
    if (!latest) return { speakerName: fallbackName, rawText: '' }
    const speakerName = String(latest.name || fallbackName).trim() || fallbackName
    // 用户消息存库原文可能带私密提调指令【【…】】（纯指令轮 userText 为空会走到这个回退分支），
    // 喂模型前必须剥离，否则指令会经「当前用户输入」槽泄漏进角色提示词。
    const cleanContent = stripThinkContent(extractDirectorDirectives(String(latest.content || '')).cleanText)
    return {
      speakerName,
      rawText: stripLeadingSpeakerPrefix(cleanContent, speakerName)
    }
  }

  async function buildChatMessages(targetId: string, userText = '', sourceMessages?: any[]): Promise<AIMessage[]> {
    const messages: AIMessage[] = []

    const scene = getCurrentScene()
    const rawPromptMessages = typeof buildPromptMessages === 'function'
      ? buildPromptMessages(targetId, scene)
      : (buildSystemPrompt(targetId, scene)
        ? [{ role: 'system' as const, content: buildSystemPrompt(targetId, scene) }]
        : [])
    const promptMessages = await resolveDynamicPromptMessages(rawPromptMessages)

    const allMessages = Array.isArray(sourceMessages) ? sourceMessages : (getCurrentMessages() || [])
    const visibleHistory = collectVisiblePromptHistory(allMessages)

    let insertedHistory = false
    const currentUserInput = resolveCurrentUserInput(visibleHistory, userText)
    for (const promptMessage of promptMessages) {
      const promptContent = String(promptMessage.content || '').trim()
      if (promptMessage.role === 'system' && promptContent === CHAT_HISTORY_PLACEHOLDER) {
        if (!insertedHistory) {
          appendHistoryMessages(messages, visibleHistory, targetId)
          insertedHistory = true
        }
        continue
      }
      if (
        promptContent.includes(CURRENT_USER_INPUT_PLACEHOLDER) ||
        promptContent.includes(CURRENT_USER_NAME_PLACEHOLDER)
      ) {
        const rendered = renderCurrentUserInputTemplate(promptContent, currentUserInput.rawText, currentUserInput.speakerName)
        if (rendered) messages.push({ role: 'user', content: rendered })
        continue
      }
      messages.push(promptMessage)
    }

    if (!insertedHistory) {
      appendHistoryMessages(messages, visibleHistory, targetId)
    }

    if (messages.length === 0) {
      messages.push({ role: 'system', content: '你是一个智能助手。' })
    }

    return messages
  }

  function getAIOptions(targetId: string): { presetName: string; model: string; logLabel: string } {
    const char = charStore.getCharacter(targetId)
    const presetName = char?.defaultPreset || settingStore.defaultPreset?.name || ''
    const preset = settingStore.getCurrentApiConfig(presetName)
    const model = char?.defaultModel || preset?.model || ''
    return {
      presetName: preset?.name || presetName,
      model,
      logLabel: char?.name || targetId
    }
  }

  return {
    buildChatMessages,
    getAIOptions
  }
}
