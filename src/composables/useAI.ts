/**
 * composables/useAI.ts
 * AI 聊天逻辑封装，支持依赖注入
 */
import { ref } from 'vue'
import { logger } from '../utils/logger'
import type { ChatMessage, ChatPromptLogBlock } from '../types'
import { assemblePromptFromMessages } from '../app/promptAssemblyPipeline'
import { useChatStore } from '../stores/chatStore'
import { useSettingStore } from '../stores/settingStore'
import { useCharacterStore } from '../stores/characterStore'
import { useResourceStore } from '../stores/resourceStore'
import { createChatProjection } from '../app/chatProjection'
import { createSettingsProjection } from '../app/settingsProjection'
import { getChatSessionBoundAlias } from '../repositories/chatRepository'
import { resolveEffectiveVirtualScene } from '../utils/virtualScene'
import { normalizeAiOutput, stripAiThoughtContent, stripAiThoughtContentForRequest } from '../utils/aiOutput'
import { normalizeAiTokenUsage, recordAiTokenUsage, type AiTokenUsage, type AiUsageRecordMeta } from '../utils/aiUsage'
import {
  CHAT_HISTORY_PLACEHOLDER,
  CHARACTER_ARRANGEMENT_RECALL_PLACEHOLDER,
  CURRENT_USER_INPUT_PLACEHOLDER,
  CURRENT_USER_NAME_PLACEHOLDER,
  CHARACTER_BRAIN_RECALL_PLACEHOLDER,
  CHARACTER_EXPRESSION_RECALL_PLACEHOLDER,
  CHARACTER_GENERAL_RECALL_PLACEHOLDER,
  CHARACTER_PROFILE_RECALL_PLACEHOLDER,
  TASK_SYSTEM_CONTEXT_PLACEHOLDER,
  EVENT_STACK_RECENT_CONTEXT_PLACEHOLDER
} from '../utils/promptContext'
import { createLocalRecallEmbeddingVectorCache } from '../app/recallEmbeddingCache'
import { createTidiaoRetrievalContext, createTidiaoDocLibraryRetrievalContext } from '../app/tidiaoRetrievalContextFactory'
import type { TidiaoRetrievalContext } from '../app/tidiaoRetrievalTools'
import { fillCharacterPoolCards, fillWorldPoolCards } from '../app/recallRoundPoolFill'
import type { RecallPoolCard } from '../app/recallRoundPool'
import type { ObservableProfileSource } from '../app/characterBrainRecall'
import { buildCharacterBrainCompilePageChange, readCharacterBrainCompilePage } from '../app/characterBrain'
import {
  buildMinimalCharacterRecallBlock,
  emptyRecallSections,
  isVisibleRecallMessage,
  prepareChatAIRecall,
  splitRecallPromptSections,
  type PrepareChatAIRecallOptions,
  type PreparedChatAIRecallResult,
  type RecallPromptSections
} from '../app/chatAIRecallPreparation'
export type { PreparedSharedRecallCard } from '../app/chatAIRecallPreparation'
import { fetchDocLibraryState } from '../repositories/docBrainRepository'
import { filterDocumentsByWorldScope, readSessionWorldDocLibraryScope } from '../app/worldDocLibraryScope'
import { buildChatSessionWorldAgentContextPrompt } from '../app/chatSessionWorldAgentContext'
import {
  fetchSessionTemporaryEntities,
  isMultiCharacterChatSession,
  patchChatSessionCharacterState
} from '../repositories/chatRepository'
import {
  findSessionCharacterParticipant,
  normalizeSessionCharacterStateMode,
  resolveSessionCharacter
} from '../app/sessionCharacterState'
import {
  requestAiChatResponse,
  requestAiEmbeddings,
  requestAiImageGeneration,
  requestAiWebSearch,
  type AiWebSearchSource,
  type AiToolDefinition,
  type AiToolCall
} from '../repositories/aiRepository'
import { sortPromptPresetsForAssembly } from '../app/promptPresetOrdering'
import { resolvePromptUserName } from '../utils/userIdentity'
import { getCurrentAiUsageContext } from '../app/aiUsageContext'
import { SCENARIO_MOUNTED_PROMPTS_PLACEHOLDER } from '../app/scenarioMountedPromptPlaceholder'
import type { AiUsageFeature } from '../../shared/aiUsageFeatures'
import { contentToText, upgradeCurrentUserMessageWithAttachments, type AIContentPart, type ChatImageAttachment } from '../utils/chatAttachments'
import { buildEmbeddingCacheScope, resolveEmbeddingModelConfig } from '../utils/modelUsageConfig'
export type { AIContentPart } from '../utils/chatAttachments'

// 类型定义
// content 批2 升级为 string | AIContentPart[]（图片双通道·通道A原生识图）：绝大多数调用方仍传纯字符串，
// 联合类型对它们零改动透传；凡本文件内对 content 做字符串操作的地方一律经 contentToText 兜底
// （见 mergeConsecutiveMessages / buildPromptLogBlocks / finalPrompt 拼接三处触点）。
export interface AIMessage {
  role: 'system' | 'user' | 'assistant'
  content: string | AIContentPart[]
  name?: string
}

// 原生工具调用消息：在 AIMessage 基础上允许 role:'tool' 结果回灌与 assistant 携带 tool_calls。
export interface AIToolMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content?: string
  name?: string
  tool_calls?: AiToolCall[]
  tool_call_id?: string
}

export interface CallAIWithToolsResult {
  content: string
  reasoningContent: string
  toolCalls: AiToolCall[]
  usage?: AiTokenUsage | null
}

export interface CallAIImageGenerationResult {
  attachment: ChatImageAttachment
  model?: string
  presetName?: string
}

export interface CallAIWebSearchResult {
  answer: string
  sources: AiWebSearchSource[]
  model?: string
  presetName?: string
}

interface UseAIOptions {
  chatStore?: ReturnType<typeof useChatStore>
  settingStore?: ReturnType<typeof useSettingStore>
  charStore?: ReturnType<typeof useCharacterStore>
  resourceStore?: ReturnType<typeof useResourceStore>
}

interface StreamCallbacks {
  onModelInfo?: (model: string, preset: string) => void
  onUsageInfo?: (usage: AiTokenUsage) => void
}

interface PromptPreparedPayload {
  messages: AIMessage[]
  finalPrompt: string
  promptBlocks: ChatPromptLogBlock[]
  preparedAt: string
}

type AIRequestOptions = {
  modelUsageSlotId?: string
  presetName?: string
  model?: string
  temperature?: number
  effort?: string
  serviceTier?: 'fast' | ''
  maxTokens?: number
  thinking?: 'enabled' | 'disabled'
  stream?: boolean
  feature?: AiUsageFeature | string
  // 原生工具调用：传 tools 时由 callAIWithTools 走原生 function-calling，返回 { content, toolCalls }。
  tools?: AiToolDefinition[]
  toolChoice?: 'auto' | 'none' | 'required' | { type: 'function'; function: { name: string } }
  logLabel?: string
  signal?: AbortSignal
  onModelInfo?: (model: string, preset: string) => void
  onUsageInfo?: (usage: AiTokenUsage) => void
  onPromptPrepared?: (payload: PromptPreparedPayload) => void | Promise<void>
  registerAbortController?: boolean
  sessionId?: string
  sessionLabel?: string
  roundId?: string
  // 消耗单元类型：round/regenerate/correction/precision_edit/batch_projection/projection/agent_task；
  // 返工类沿用原轮 roundId，跨轮操作 roundId 传 op:… 单元 id。
  unitKind?: string
  /** 通道A·当轮原生图（输入框图片上传计划批4）：只在 callAI/callAIStream 生效——有值时把 messages 里
   *  最后一条 role:'user' 消息升级为 parts 数组（文字+每图 image_url）。callAIWithTools（提调/纠偏等工具调用
   *  loop）不实现这个字段的处理：director 链路一律走 caption 文字，不注入原生图，见 groupDirectorPass.ts。 */
  currentAttachments?: ChatImageAttachment[]
} & AiUsageRecordMeta

interface PromptMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

interface PromptSequenceItem {
  type: 'message' | 'history'
  role?: 'system' | 'user' | 'assistant'
  content?: string
}

type PromptBuildOptions = {
  taskRunId?: string
  forceEmptyRecall?: boolean
  forceEmptyRoleProfile?: boolean
  suppressCurrentUserInputTemplate?: boolean
  userIdentityChangeNotice?: string
  scenarioMountedPromptText?: string
}

type PrepareAIRecallOptions = PrepareChatAIRecallOptions & {
  storeForPrompt?: boolean
  visibleMessagesOverride?: unknown[]
}

export type PreparedAIRecallResult = Pick<
  PreparedChatAIRecallResult,
  'recallActivity' | 'sections' | 'recallTraceLogText'
>

type RecallPriorityMarkUpdate = NonNullable<PreparedChatAIRecallResult['recallPriorityUpdates']>[string]

const RECALL_CONTROLLED_PROMPT_PRESET_IDS = new Set([
  'role_setting',
  'speaking_style',
  'history_memory',
  'user_status'
])

function isRecallControlledDynamicPromptContent(content: string): boolean {
  return content.includes(TASK_SYSTEM_CONTEXT_PLACEHOLDER)
    || content.includes(EVENT_STACK_RECENT_CONTEXT_PLACEHOLDER)
    || content.trim() === CHARACTER_BRAIN_RECALL_PLACEHOLDER
}

function shouldAssemblePromptPreset(preset: any): boolean {
  const id = String(preset?.id || '').trim()
  if (RECALL_CONTROLLED_PROMPT_PRESET_IDS.has(id)) return false

  const content = String(preset?.content || '')
  if (isRecallControlledDynamicPromptContent(content)) return false

  const rawRequired = preset?.isRequired ?? preset?.is_required
  if (rawRequired === true || rawRequired === 1 || rawRequired === '1' || rawRequired === 'true') return true
  if (rawRequired === false || rawRequired === 0 || rawRequired === '0' || rawRequired === 'false') return false

  const promptGroup = String(preset?.promptGroup ?? preset?.prompt_group ?? 'system')
  if (promptGroup === 'recall') return false
  return String(preset?.usageMode ?? preset?.usage_mode ?? 'always') === 'always'
}

function extractContentFromSsePayload(payload: string): { content: string; reasoning_content: string } {
  const lines = String(payload || '').split(/\r?\n/)
  let fullContent = ''
  let fullReasoning = ''

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line.startsWith('data:')) continue

    const data = line.slice(5).trim()
    if (!data || data === '[DONE]') continue

    try {
      const json = JSON.parse(data)
      const delta = json.choices?.[0]?.delta
      const message = json.choices?.[0]?.message
      fullReasoning += delta?.reasoning_content || ''
      fullContent += delta?.content || ''
      fullReasoning += message?.reasoning_content || ''
      fullContent += message?.content || ''
    } catch {
      // 忽略无法解析的 SSE 片段
    }
  }

  return {
    content: fullContent,
    reasoning_content: fullReasoning
  }
}

/** content parts 数组归一化：字符串包一层 text part，空串返回空数组（拼接用）。 */
function toContentParts(content: AIMessage['content']): AIContentPart[] {
  if (Array.isArray(content)) return content
  const text = String(content || '')
  return text ? [{ type: 'text', text }] : []
}

function isEmptyContent(content: AIMessage['content']): boolean {
  return typeof content === 'string' ? !content : !Array.isArray(content) || content.length === 0
}

/** 合并两条消息的 content：都是纯字符串走原字符串拼接；任一侧带 parts（图片）时升级成 parts 数组拼接，
 *  保留图片不丢（不能退化成 contentToText 纯文本，否则合并会静默吃掉本轮上传的图）。 */
function mergeMessageContent(a: AIMessage['content'], b: AIMessage['content']): AIMessage['content'] {
  if (typeof a === 'string' && typeof b === 'string') return a + '\n\n' + b
  return [...toContentParts(a), { type: 'text', text: '\n\n' }, ...toContentParts(b)]
}

/**
 * 合并连续同角色消息，减少无效轮次并兼容更严格的消息格式校验
 */
function mergeConsecutiveMessages(messages: AIMessage[]): AIMessage[] {
  const cleanMessages = messages
    .map((message) => stripAiThoughtContentForRequest(message))
    .filter((message) => message.role !== 'assistant' || contentToText(message.content).trim())

  if (cleanMessages.length < 2) return cleanMessages

  const result: AIMessage[] = []
  let lastRole: AIMessage['role'] | '' = ''
  let buffer: AIMessage['content'] = ''

  for (const msg of cleanMessages) {
    if (msg.role === lastRole && msg.role !== 'system') {
      buffer = mergeMessageContent(buffer, msg.content)
    } else {
      if (!isEmptyContent(buffer)) {
        result.push({ role: lastRole as AIMessage['role'], content: buffer })
        buffer = ''
      }
      if (msg.role === 'system') {
        result.push(msg)
      } else {
        buffer = msg.content
      }
    }
    lastRole = msg.role
  }

  if (!isEmptyContent(buffer)) {
    result.push({ role: lastRole as AIMessage['role'], content: buffer })
  }

  return result
}

function mergeConsecutiveAssistant(messages: AIMessage[]): AIMessage[] {
  return mergeConsecutiveMessages(messages)
}

async function readAiErrorResponseMessage(response: Response): Promise<string> {
  let rawText = ''
  try {
    rawText = await response.text()
  } catch {
    rawText = ''
  }
  const text = String(rawText || '').trim()
  if (!text) return `HTTP ${response.status}`
  try {
    const parsed = JSON.parse(text) as { error?: unknown; message?: unknown }
    const detail = String(parsed?.error ?? parsed?.message ?? '').trim()
    if (detail) return detail
  } catch {
    // 非 JSON 错误体直接用原文。
  }
  return text || `HTTP ${response.status}`
}

function createAbortError(message = '生成已停止'): Error {
  const error = new Error(message)
  error.name = 'AbortError'
  return error
}

function linkAbortSignal(controller: AbortController, signal?: AbortSignal): (() => void) | null {
  if (!signal) return null
  if (signal.aborted) {
    controller.abort()
    return null
  }
  const abort = () => controller.abort()
  signal.addEventListener('abort', abort, { once: true })
  return () => signal.removeEventListener('abort', abort)
}

function readMaybeRef<T>(value: T | { value: T } | undefined): T | undefined {
  if (value && typeof value === 'object' && 'value' in value) return (value as { value: T }).value
  return value as T | undefined
}

/**
 * AI 聊天 composable
 * @param {Object} dependencies - 可选的依赖注入（用于测试）
 */
export function useAI(dependencies: UseAIOptions = {}) {
  // stores（通过 initStores 延迟初始化）
  let _chatStore: any = null
  let _settingStore: any = null
  let _charStore: any = null
  let _resourceStore: any = null
  let _chatProjection: ReturnType<typeof createChatProjection> | null = null
  let _settingsProjection: ReturnType<typeof createSettingsProjection> | null = null

  /** AI 多轮召回预计算结果（由 prepareAIRecall 写入，buildPromptSequence 消费后清空） */
  let _pendingAIRecallSections: RecallPromptSections | null = null
  let _pendingAIRecallTaskRunId = ''
  let _hasPendingAIRecallResult = false
  let _pendingRecallTraceLogText: string | null = null
  let _recallRunSerial = 0
  const _recallEmbeddingVectorCache = createLocalRecallEmbeddingVectorCache()
  /** 按会话所挂世界裁文档库文档。未挂世界或世界未挂文档时恒为空。 */
  const resolveDocLibraryDocumentsForSession = (sessionId?: string) => {
    const sid = String(sessionId || '').trim()
      || String(_chatProjection?.getActiveSession?.()?.id || _chatStore?.activeChatSessionId || '').trim()
    const active = _chatProjection?.getActiveSession?.()
    const sessions = _chatStore?.entities?.chatSessions || _chatStore?.chatSessions || {}
    const session = String(active?.id || '').trim() === sid ? active : sessions?.[sid]
    return filterDocumentsByWorldScope(
      readSessionWorldDocLibraryScope(session).documentIds,
      _charStore?.documents || []
    )
  }

  // 初始化stores（延迟初始化，确保pinia已就绪）
  const initStores = () => {
    if (!_chatStore) {
      try {
        _chatStore = dependencies.chatStore || useChatStore()
        _settingStore = dependencies.settingStore || useSettingStore()
        _charStore = dependencies.charStore || useCharacterStore()
        _resourceStore = dependencies.resourceStore || useResourceStore()
        _chatProjection = createChatProjection({ chatStore: _chatStore, charStore: _charStore })
        _settingsProjection = createSettingsProjection({ settingStore: _settingStore })
      } catch (e) {
        logger.error('加载stores失败:', e)
      }
    }
  }

  const resolveActiveSessionCharacter = (characterId: string) => {
    const mainCharacter = _charStore?.getCharacter?.(characterId) || null
    const activeSession = _chatProjection?.getActiveSession?.()
      || _chatStore?.chatSessions?.[_chatStore?.activeChatSessionId || '']
      || null
    return resolveSessionCharacter(activeSession, characterId, mainCharacter)
  }

  const resolveAiRequestSelection = (options: AIRequestOptions) => {
    return {
      presetName: options.presetName || '',
      model: options.model || ''
    }
  }

  function buildPromptLogBlocks(messages: AIMessage[]): ChatPromptLogBlock[] {
    // assemblePromptFromMessages 的 content 仍是纯 string 契约（调试面板用），content parts 数组
    // 先经 contentToText 转成可读文本（图片占位 [图片]），不把数组直接塞进去。
    const blocks: ChatPromptLogBlock[] = assemblePromptFromMessages(
      messages.map((message) => ({ role: message.role, content: contentToText(message.content) })),
      {
        mode: 'other',
        policyId: 'ai-request-messages'
      }
    ).promptBlocks
    if (_pendingRecallTraceLogText) {
      blocks.push({
        role: 'system',
        title: '召回 trace',
        content: _pendingRecallTraceLogText
      })
      _pendingRecallTraceLogText = null
    }
    return blocks
  }

  const resolveCurrentSessionUsageMeta = (options: AIRequestOptions = {}) => {
    const activeContext = getCurrentAiUsageContext()
    const activeSession = _chatProjection?.getActiveSession?.()
      || _chatStore?.chatSessions?.[_chatStore?.activeChatSessionId || '']
      || _chatStore?.currentSession
      || null
    const sessionId = String(options.sessionId || activeContext.sessionId || activeSession?.id || _chatStore?.activeChatSessionId || '').trim()
    const sessionLabel = String(
      options.sessionLabel
      || activeContext.sessionLabel
      || activeSession?.title
      || activeSession?.name
      || activeSession?.targetName
      || activeSession?.target_id
      || activeSession?.targetId
      || ''
    ).trim()
    const roundId = String(options.roundId || activeContext.roundId || '').trim()
    // 未显式给 unitKind 时：round:… 轮 id 默认 round，op:… 由调用方自带 kind，缺省不猜。
    const explicitUnitKind = String(options.unitKind || activeContext.unitKind || '').trim()
    const unitKind = explicitUnitKind || (roundId.startsWith('round:') ? 'round' : '')
    return {
      sessionId,
      sessionLabel,
      roundId,
      unitKind,
      usageLabel: String(options.usageLabel || options.logLabel || '模型调用').trim(),
      placeLabel: String(options.placeLabel || sessionLabel || '未标明').trim(),
      placeType: options.placeType || 'other' as const
    }
  }

  function clearPendingAIRecall() {
    _pendingAIRecallSections = null
    _pendingAIRecallTaskRunId = ''
    _hasPendingAIRecallResult = false
    _pendingRecallTraceLogText = null
  }

  function consumePendingAIRecallSections(taskRunId = ''): RecallPromptSections {
    const normalizedTaskRunId = String(taskRunId || '').trim()
    if (_pendingAIRecallTaskRunId && normalizedTaskRunId && _pendingAIRecallTaskRunId !== normalizedTaskRunId) {
      clearPendingAIRecall()
      return emptyRecallSections()
    }
    const sections = _pendingAIRecallSections || emptyRecallSections()
    _pendingAIRecallSections = null
    _pendingAIRecallTaskRunId = ''
    _hasPendingAIRecallResult = false
    return sections
  }

  function isChatStoreAbortController(controller: AbortController): boolean {
    const directController = readMaybeRef<AbortController | null>(_chatStore?.currentAbortController)
    const runtimeController = readMaybeRef<AbortController | null>(_chatStore?.runtime?.currentAbortController)
    return directController === controller || runtimeController === controller
  }

  function isChatStoreStopRequested(): boolean {
    if (typeof _chatStore?.shouldStop === 'function' && _chatStore.shouldStop()) return true
    const runtimeStopRequested = readMaybeRef<boolean>(_chatStore?.runtime?.stopRequested)
    if (runtimeStopRequested !== undefined) return Boolean(runtimeStopRequested)
    return Boolean(readMaybeRef<boolean>(_chatStore?.stopRequested))
  }

  /**
   * 调用AI（非流式）
   */
  async function callAI(messages: AIMessage[], options: AIRequestOptions = {}): Promise<string | null> {
    const { logLabel } = options

    initStores()
    if (options.signal?.aborted) throw createAbortError()
    const requestSelection = resolveAiRequestSelection(options)
    // 通道A·当轮原生图（批4）：非空才升级最后一条 user 消息为 parts 数组，空/未传零变化。
    const attachedMessages = options.currentAttachments?.length
      ? upgradeCurrentUserMessageWithAttachments(messages, options.currentAttachments)
      : messages
    const processedMessages = mergeConsecutiveMessages(attachedMessages)
    const usageMeta = resolveCurrentSessionUsageMeta(options)
    await options.onPromptPrepared?.({
      messages: processedMessages,
      finalPrompt: processedMessages
        .map((message) => `[${String(message.role || 'system').toUpperCase()}]\n${contentToText(message.content as AIMessage['content'])}`)
        .join('\n\n'),
      promptBlocks: buildPromptLogBlocks(processedMessages),
      preparedAt: new Date().toISOString()
    })

    const controller = new AbortController()
    const unlinkAbortSignal = linkAbortSignal(controller, options.signal)
    const shouldRegisterAbortController = !options.signal && options.registerAbortController !== false
    if (_chatStore && shouldRegisterAbortController) {
      _chatStore.setAbortController?.(controller)
    }

    try {
      const response = await requestAiChatResponse({
        messages: processedMessages,
        presetName: requestSelection.presetName,
        model: requestSelection.model,
        temperature: options.temperature,
        effort: options.effort,
        serviceTier: options.serviceTier || undefined,
        maxTokens: options.maxTokens,
        thinking: options.thinking,
        modelUsageSlotId: options.modelUsageSlotId,
        feature: options.feature || 'role_message',
        stream: options.stream === true,
        meta: {
          logLabel: logLabel || '',
          feature: options.feature || 'role_message',
          modelUsageSlotId: options.modelUsageSlotId || '',
          usageLabel: usageMeta.usageLabel,
          placeLabel: usageMeta.placeLabel,
          placeType: usageMeta.placeType,
          sessionId: usageMeta.sessionId,
          sessionLabel: usageMeta.sessionLabel,
          roundId: usageMeta.roundId,
          unitKind: usageMeta.unitKind,
          profileId: options.profileId,
          harnessRunId: options.harnessRunId,
          modelTurnIndex: options.modelTurnIndex,
          toolEpoch: options.toolEpoch,
          toolEpochTurnIndex: options.toolEpochTurnIndex,
          promptRebuild: options.promptRebuild,
          activeToolNamesHash: options.activeToolNamesHash,
          toolSchemaHash: options.toolSchemaHash,
          systemHash: options.systemHash,
          messagePrefixHash: options.messagePrefixHash,
          requestEnvelopeHash: options.requestEnvelopeHash,
          firstDiffSource: options.firstDiffSource
        }
      }, {
        signal: controller.signal
      })

      if (!response.ok) {
        throw new Error(await readAiErrorResponseMessage(response))
      }

      const contentType = response.headers.get('content-type') || ''
      const usedModel = decodeURIComponent(response.headers.get('X-Used-Model') || requestSelection.model || '')
      const usedPreset = decodeURIComponent(response.headers.get('X-Used-Preset') || requestSelection.presetName || '')
      if (usedModel) {
        options.onModelInfo?.(usedModel, usedPreset)
      }
      let data: { content?: string; reasoning_content?: string; usage?: unknown; choices?: Array<{ message?: { content?: string; reasoning_content?: string } }> } = {}

      if (contentType.includes('text/event-stream')) {
        const raw = await response.text()
        data = extractContentFromSsePayload(raw)
      } else {
        const rawText = await response.text()
        try {
          data = JSON.parse(rawText) as { content?: string; reasoning_content?: string }
        } catch {
          const sseContent = extractContentFromSsePayload(rawText)
          if (sseContent.content || sseContent.reasoning_content) {
            data = sseContent
          } else {
            throw new Error('AI 返回了无法解析的响应')
          }
        }
      }

      const message = data.choices?.[0]?.message || {}
      const usage = normalizeAiTokenUsage(data.usage as any, usedModel)
      if (usage) {
        recordAiTokenUsage(usage, usedModel, {
          usageLabel: usageMeta.usageLabel || '模型调用',
          placeLabel: usageMeta.placeLabel || '未标明',
          placeType: usageMeta.placeType,
          presetName: usedPreset
        })
        options.onUsageInfo?.(usage)
      }
      const includeThoughts = options.thinking !== 'disabled'
      const normalizedWithThoughts = normalizeAiOutput(
        includeThoughts ? data.reasoning_content || message.reasoning_content || '' : '',
        data.content || message.content || ''
      )
      const normalized = includeThoughts ? normalizedWithThoughts : stripAiThoughtContent(normalizedWithThoughts)
      return normalized || null
    } catch (error: any) {
      if (error.name === 'AbortError') {
        logger.log('AI调用已取消')
        throw createAbortError()
      }
      console.error('AI调用失败:', error)
      return `[API调用失败: ${error.message}]`
    } finally {
      unlinkAbortSignal?.()
      if (_chatStore && shouldRegisterAbortController && isChatStoreAbortController(controller)) {
        _chatStore.setAbortController?.(null)
      }
    }
  }

  /**
   * 原生工具调用（function-calling，非流式）。
   * 与 callAI 的区别：在请求体里下发 tools/tool_choice，并从回包 choices[0].message 同时取回
   * content 与原生 tool_calls，返回 { content, toolCalls, reasoningContent } 对象。
   * 老调用方（callAI 返字符串）完全不受影响——这是独立函数，只有传 tools 的提调各 loop 走这里。
   * 不做 mergeConsecutiveMessages：原生工具协议的 assistant(tool_calls)/role:'tool' 回灌消息必须按原序保留，
   * 合并/丢空 content 会破坏 tool_call_id 配对。
   */
  async function callAIWithTools(
    messages: AIToolMessage[],
    options: AIRequestOptions = {}
  ): Promise<CallAIWithToolsResult | null> {
    initStores()
    if (options.signal?.aborted) throw createAbortError()
    const requestSelection = resolveAiRequestSelection(options)
    const usageMeta = resolveCurrentSessionUsageMeta(options)
    const processedMessages = messages.map((message) => ({ ...message }))
    await options.onPromptPrepared?.({
      messages: processedMessages as unknown as AIMessage[],
      finalPrompt: processedMessages
        .map((message) => `[${String(message.role || 'system').toUpperCase()}]\n${contentToText(message.content as AIMessage['content'])}`)
        .join('\n\n'),
      promptBlocks: buildPromptLogBlocks(processedMessages as unknown as AIMessage[]),
      preparedAt: new Date().toISOString()
    })

    const controller = new AbortController()
    const unlinkAbortSignal = linkAbortSignal(controller, options.signal)
    const shouldRegisterAbortController = !options.signal && options.registerAbortController !== false
    if (_chatStore && shouldRegisterAbortController) {
      _chatStore.setAbortController?.(controller)
    }

    try {
      const response = await requestAiChatResponse({
        messages: processedMessages as never,
        presetName: requestSelection.presetName,
          model: requestSelection.model,
          temperature: options.temperature,
          effort: options.effort,
          serviceTier: options.serviceTier || undefined,
          maxTokens: options.maxTokens,
        thinking: options.thinking,
        modelUsageSlotId: options.modelUsageSlotId,
        feature: options.feature || 'role_message',
        // 原生工具调用默认走非流式：tool_calls 在完整回包里一次取齐，无需聚合 SSE 分片。
        stream: false,
        tools: options.tools,
        toolChoice: options.toolChoice,
        meta: {
          logLabel: options.logLabel || '',
          feature: options.feature || 'role_message',
          modelUsageSlotId: options.modelUsageSlotId || '',
          usageLabel: usageMeta.usageLabel,
          placeLabel: usageMeta.placeLabel,
          placeType: usageMeta.placeType,
          sessionId: usageMeta.sessionId,
          sessionLabel: usageMeta.sessionLabel,
          roundId: usageMeta.roundId,
          unitKind: usageMeta.unitKind,
          profileId: options.profileId,
          harnessRunId: options.harnessRunId,
          modelTurnIndex: options.modelTurnIndex,
          toolEpoch: options.toolEpoch,
          toolEpochTurnIndex: options.toolEpochTurnIndex,
          promptRebuild: options.promptRebuild,
          activeToolNamesHash: options.activeToolNamesHash,
          toolSchemaHash: options.toolSchemaHash,
          systemHash: options.systemHash,
          messagePrefixHash: options.messagePrefixHash,
          requestEnvelopeHash: options.requestEnvelopeHash,
          firstDiffSource: options.firstDiffSource
        }
      }, {
        signal: controller.signal
      })

      if (!response.ok) {
        throw new Error(await readAiErrorResponseMessage(response))
      }

      const usedModel = decodeURIComponent(response.headers.get('X-Used-Model') || requestSelection.model || '')
      const usedPreset = decodeURIComponent(response.headers.get('X-Used-Preset') || requestSelection.presetName || '')
      if (usedModel) {
        options.onModelInfo?.(usedModel, usedPreset)
      }

      const contentType = response.headers.get('content-type') || ''
      const rawText = await response.text()
      let data: {
        content?: string
        reasoning_content?: string
        usage?: unknown
        choices?: Array<{ message?: { content?: string; reasoning_content?: string; tool_calls?: AiToolCall[] } }>
      } = {}
      if (contentType.includes('text/event-stream')) {
        // 极少数供应商即便请求非流式仍回 SSE：聚合 content/reasoning 兜底（原生 tool_calls 分片聚合从略）。
        const sse = extractContentFromSsePayload(rawText)
        data = { choices: [{ message: { content: sse.content, reasoning_content: sse.reasoning_content } }] }
      } else {
        try {
          data = JSON.parse(rawText)
        } catch {
          const sse = extractContentFromSsePayload(rawText)
          if (sse.content || sse.reasoning_content) {
            data = { choices: [{ message: { content: sse.content, reasoning_content: sse.reasoning_content } }] }
          } else {
            throw new Error('AI 返回了无法解析的响应')
          }
        }
      }

      const message = data.choices?.[0]?.message || {}
      const usage = normalizeAiTokenUsage(data.usage as any, usedModel)
      if (usage) {
        recordAiTokenUsage(usage, usedModel, {
          usageLabel: usageMeta.usageLabel || '模型调用',
          placeLabel: usageMeta.placeLabel || '未标明',
          placeType: usageMeta.placeType,
          presetName: usedPreset
        })
        options.onUsageInfo?.(usage)
      }
      const toolCalls = Array.isArray(message.tool_calls) ? message.tool_calls : []
      return {
        content: String(message.content ?? data.content ?? ''),
        reasoningContent: String(message.reasoning_content ?? data.reasoning_content ?? ''),
        toolCalls,
        usage
      }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        logger.log('AI工具调用已取消')
        throw createAbortError()
      }
      console.error('AI工具调用失败:', error)
      throw error
    } finally {
      unlinkAbortSignal?.()
      if (_chatStore && shouldRegisterAbortController && isChatStoreAbortController(controller)) {
        _chatStore.setAbortController?.(null)
      }
    }
  }

  /** Codex 订阅桥原生生图。服务端只会返回已经校验并登记到 chat-images 台账的附件。 */
  async function generateImage(
    prompt: string,
    options: AIRequestOptions = {}
  ): Promise<CallAIImageGenerationResult> {
    initStores()
    if (options.signal?.aborted) throw createAbortError()
    const requestSelection = resolveAiRequestSelection(options)
    const usageMeta = resolveCurrentSessionUsageMeta(options)
    const controller = new AbortController()
    const unlinkAbortSignal = linkAbortSignal(controller, options.signal)
    try {
      const result = await requestAiImageGeneration({
        prompt,
        presetName: requestSelection.presetName,
        model: requestSelection.model,
        effort: options.effort,
        modelUsageSlotId: options.modelUsageSlotId,
        sessionId: usageMeta.sessionId,
        sessionLabel: usageMeta.sessionLabel
      }, { signal: controller.signal })
      if (result.model) options.onModelInfo?.(result.model, result.presetName || '')
      return result
    } catch (error: any) {
      if (error?.name === 'AbortError') throw createAbortError()
      throw error
    } finally {
      unlinkAbortSignal?.()
    }
  }

  /** Codex 订阅桥原生联网搜索；只读专用端点，普通 callAI 仍保持禁网。 */
  async function searchWeb(
    query: string,
    options: AIRequestOptions = {}
  ): Promise<CallAIWebSearchResult> {
    initStores()
    if (options.signal?.aborted) throw createAbortError()
    const requestSelection = resolveAiRequestSelection(options)
    const usageMeta = resolveCurrentSessionUsageMeta(options)
    const controller = new AbortController()
    const unlinkAbortSignal = linkAbortSignal(controller, options.signal)
    try {
      const result = await requestAiWebSearch({
        query,
        presetName: requestSelection.presetName,
        model: requestSelection.model,
        effort: options.effort,
        modelUsageSlotId: options.modelUsageSlotId,
        sessionId: usageMeta.sessionId,
        sessionLabel: usageMeta.sessionLabel
      }, { signal: controller.signal })
      if (result.model) options.onModelInfo?.(result.model, result.presetName || '')
      return result
    } catch (error: any) {
      if (error?.name === 'AbortError') throw createAbortError()
      throw error
    } finally {
      unlinkAbortSignal?.()
    }
  }

  /**
   * 流式调用AI（SSE，通过服务端代理）
   */
  async function callAIStream(
    messages: AIMessage[],
    options: AIRequestOptions = {},
    onChunk?: (text: string) => void,
    callbacks: StreamCallbacks = {}
  ): Promise<string | null> {
    const { logLabel } = options
    initStores()
    if (options.signal?.aborted) throw createAbortError()
    const requestSelection = resolveAiRequestSelection(options)
    // 通道A·当轮原生图（批4）：非空才升级最后一条 user 消息为 parts 数组，空/未传零变化。
    const attachedMessages = options.currentAttachments?.length
      ? upgradeCurrentUserMessageWithAttachments(messages, options.currentAttachments)
      : messages
    const processedMessages = mergeConsecutiveMessages(attachedMessages)
    const usageMeta = resolveCurrentSessionUsageMeta(options)
    await options.onPromptPrepared?.({
      messages: processedMessages,
      finalPrompt: processedMessages
        .map((message) => `[${String(message.role || 'system').toUpperCase()}]\n${contentToText(message.content as AIMessage['content'])}`)
        .join('\n\n'),
      promptBlocks: buildPromptLogBlocks(processedMessages),
      preparedAt: new Date().toISOString()
    })

    const controller = new AbortController()
    const unlinkAbortSignal = linkAbortSignal(controller, options.signal)
    const shouldRegisterAbortController = !options.signal && options.registerAbortController !== false
    if (_chatStore && shouldRegisterAbortController) {
      _chatStore.setAbortController?.(controller)
    }

    try {
      const response = await requestAiChatResponse({
        messages: processedMessages,
        presetName: requestSelection.presetName,
        model: requestSelection.model,
        temperature: options.temperature,
        effort: options.effort,
        serviceTier: options.serviceTier || undefined,
        maxTokens: options.maxTokens,
        thinking: options.thinking,
        modelUsageSlotId: options.modelUsageSlotId,
        feature: options.feature || 'role_message',
        stream: true,
        meta: {
          logLabel: logLabel || '',
          feature: options.feature || 'role_message',
          modelUsageSlotId: options.modelUsageSlotId || '',
          usageLabel: usageMeta.usageLabel,
          placeLabel: usageMeta.placeLabel,
          placeType: usageMeta.placeType,
          sessionId: usageMeta.sessionId,
          sessionLabel: usageMeta.sessionLabel,
          roundId: usageMeta.roundId,
          unitKind: usageMeta.unitKind
        }
      }, {
        signal: controller.signal
      })

      if (!response.ok) {
        throw new Error(await readAiErrorResponseMessage(response))
      }

      // 读取响应头中的模型信息（需要解码URL编码的中文）
      const usedModel = decodeURIComponent(response.headers.get('X-Used-Model') || '')
      const usedPreset = decodeURIComponent(response.headers.get('X-Used-Preset') || '')
      if (usedModel && callbacks.onModelInfo) {
        callbacks.onModelInfo(usedModel, usedPreset)
      }

      // 读取 SSE 流
      const reader = response.body?.getReader()
      if (!reader) {
        throw new Error('无法读取响应流')
      }

      const decoder = new TextDecoder()
      let fullContent = ''
      let fullReasoning = ''
      let buffer = ''
      let contentBuffer = ''
      let contentReasoningMode = false
      let reasoningStarted = false
      let reasoningClosed = false
      let hasRecordedUsage = false
      const includeThoughts = options.thinking !== 'disabled'

      function getIncompleteTagSuffixLength(text: string, tag: string) {
        const max = Math.min(text.length, tag.length - 1)
        for (let len = max; len > 0; len -= 1) {
          if (text.slice(-len).toLowerCase() === tag.slice(0, len).toLowerCase()) {
            return len
          }
        }
        return 0
      }

      function pushContentChunk(chunk: string) {
        if (!chunk) return
        if (controller.signal.aborted || options.signal?.aborted) throw createAbortError()
        fullContent += chunk
        onChunk?.(chunk)
      }

      function pushReasoningChunk(chunk: string) {
        if (!chunk) return
        if (controller.signal.aborted || options.signal?.aborted) throw createAbortError()
        if (!includeThoughts) return
        fullReasoning += chunk
        if (reasoningClosed) return
        if (!reasoningStarted) {
          onChunk?.(`<think>${chunk}`)
          reasoningStarted = true
          return
        }
        onChunk?.(chunk)
      }

      function closeReasoningBlock() {
        if (!reasoningStarted || reasoningClosed) return
        onChunk?.('</think>\n')
        reasoningClosed = true
      }

      function processContentChunk(chunk: string) {
        if (!chunk) return
        contentBuffer += chunk

        while (contentBuffer) {
          const lowerBuffer = contentBuffer.toLowerCase()

          if (contentReasoningMode) {
            const closeIndex = lowerBuffer.indexOf('</think>')
            if (closeIndex >= 0) {
              const reasoningPart = contentBuffer.slice(0, closeIndex)
              if (reasoningPart) pushReasoningChunk(reasoningPart)
              contentBuffer = contentBuffer.slice(closeIndex + '</think>'.length)
              contentReasoningMode = false
              continue
            }

            const keepLen = getIncompleteTagSuffixLength(contentBuffer, '</think>')
            const safeReasoning = contentBuffer.slice(0, contentBuffer.length - keepLen)
            if (safeReasoning) {
              pushReasoningChunk(safeReasoning)
              contentBuffer = contentBuffer.slice(contentBuffer.length - keepLen)
            }
            break
          }

          const openIndex = lowerBuffer.indexOf('<think>')
          if (openIndex >= 0) {
            const beforeThink = contentBuffer.slice(0, openIndex)
            if (beforeThink) {
              closeReasoningBlock()
              pushContentChunk(beforeThink)
            }
            contentBuffer = contentBuffer.slice(openIndex + '<think>'.length)
            contentReasoningMode = true
            continue
          }

          const keepLen = getIncompleteTagSuffixLength(contentBuffer, '<think>')
          const safeContent = contentBuffer.slice(0, contentBuffer.length - keepLen)
          if (safeContent) {
            closeReasoningBlock()
            pushContentChunk(safeContent)
            contentBuffer = contentBuffer.slice(contentBuffer.length - keepLen)
          }
          break
        }
      }

      while (true) {
        if (controller.signal.aborted || options.signal?.aborted) throw createAbortError()
        const { done, value } = await reader.read()
        if (controller.signal.aborted || options.signal?.aborted) throw createAbortError()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        // 按行解析 SSE 数据
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? '' // 保留未完成的行

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6)
            if (data === '[DONE]') continue

            try {
              const json = JSON.parse(data)
              const delta = json.choices?.[0]?.delta
              const usage = normalizeAiTokenUsage(json.usage, usedModel)
              if (usage && !hasRecordedUsage) {
                hasRecordedUsage = true
                recordAiTokenUsage(usage, usedModel, {
                  usageLabel: usageMeta.usageLabel || '模型调用',
                  placeLabel: usageMeta.placeLabel || '未标明',
                  placeType: usageMeta.placeType,
                  presetName: usedPreset
                })
                callbacks.onUsageInfo?.(usage)
              }
              if (delta?.reasoning_content) {
                pushReasoningChunk(delta.reasoning_content)
              }
              if (delta?.content) {
                processContentChunk(delta.content)
              }
            } catch {
              // 跳过无法解析的行
            }
          }
        }
      }

      if (contentBuffer) {
        if (contentReasoningMode) {
          pushReasoningChunk(contentBuffer)
        } else {
          closeReasoningBlock()
          pushContentChunk(contentBuffer)
        }
      }

      closeReasoningBlock()

      return normalizeAiOutput(fullReasoning, fullContent)
    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.log('AI流式调用已取消')
        throw createAbortError()
      }
      console.error('AI流式调用失败:', error)
      throw error
    } finally {
      unlinkAbortSignal?.()
      if (_chatStore && shouldRegisterAbortController && isChatStoreAbortController(controller)) {
        _chatStore.setAbortController?.(null)
      }
    }
  }

  // 正则表达式缓存
  const patternCache = new Map<string, RegExp[]>()

  /**
   * 获取角色名的正则表达式模式（带缓存）
   */
  function getNamePatterns(name: string): RegExp[] {
    if (!patternCache.has(name)) {
      patternCache.set(name, [
        new RegExp(`^\\[${name}\\][：:]\\s*`),
        new RegExp(`^${name}[：:]\\s*`),
        new RegExp(`^\\[\\d{1,2}:\\d{2}\\]\\s*${name}[：:]\\s*`)
      ])
    }
    return patternCache.get(name)!
  }

  /**
   * 清理AI回复中的前缀（如"[角色名]："）
   */
  function cleanAiPrefix(text: string): string {
    if (!text) return text
    initStores()

    // 获取所有角色名
    const allNames = _charStore?.characters?.map((c: any) => c.name) || []
    let cleaned = text
    for (const name of allNames) {
      // 获取缓存的正则表达式
      const patterns = getNamePatterns(name)
      for (const p of patterns) {
        // 处理重复前缀：如“陈星依：陈星依：...”
        while (p.test(cleaned)) {
          cleaned = cleaned.replace(p, '')
        }
      }
    }
    // 兜底清理通用“角色：”前缀，避免落库后显示为匿名角色
    cleaned = cleaned.replace(/^角色\s*[：:]\s*/, '')
    return cleaned
  }

  /**
   * 检测AI回复中的地点变化标记
   * 返回 { content, newLocation }
   */
  function detectLocationChange(text: string): { content: string; newLocation: string | null } {
    if (!text) return { content: text, newLocation: null }
    const pattern = /【地点变化[：:]\s*([^】]+)】\s*/
    const match = text.match(pattern)
    if (match) {
      return {
        content: text.replace(pattern, '').trim(),
        newLocation: match[1].trim()
      }
    }
    return { content: text, newLocation: null }
  }

  /**
   * 根据当前星期和时间，过滤行动轨迹只保留今天当前时段附近的内容
   */
  function filterScheduleByNow(schedule: any): string {
    if (typeof schedule === 'string') return schedule
    if (!schedule || typeof schedule !== 'object') return ''

    const now = new Date()
    // 获取当前星期几（英文key）
    const dayKeys = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
    const todayKey = dayKeys[now.getDay()]
    const todaySlots = schedule[todayKey]

    if (!todaySlots || !Array.isArray(todaySlots) || todaySlots.length === 0) {
      return `今天是${['日','一','二','三','四','五','六'][now.getDay()]}，今天没有特定安排`
    }

    // 当前时间字符串 HH:MM
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`

    // 找到当前正在进行的活动
    let currentSlot = todaySlots.find(s => currentTime >= s.startTime && currentTime < s.endTime)

    // 如果没有正在进行的，找最近的下一个
    if (!currentSlot) {
      currentSlot = todaySlots.find(s => currentTime < s.startTime)
    }

    // 都没有则说明今天活动已全部结束
    if (!currentSlot) {
      const last = todaySlots[todaySlots.length - 1]
      return `今天${['周日','周一','周二','周三','周四','周五','周六'][now.getDay()]}，所有安排已结束，最后一项是：${last.startTime}-${last.endTime} ${last.activity}${last.location ? '（' + last.location + '）' : ''}`
    }

    const dayLabel = ['周日','周一','周二','周三','周四','周五','周六'][now.getDay()]
    const isOngoing = currentTime >= currentSlot.startTime && currentTime < currentSlot.endTime
    const status = isOngoing ? '当前正在' : '接下来即将'
    const slotsText = `${currentSlot.startTime}-${currentSlot.endTime} ${currentSlot.activity}${currentSlot.location ? '（' + currentSlot.location + '）' : ''}`

    return `今天${dayLabel}，${status}：${slotsText}`
  }

  /**
   * 根据当前月份，过滤年度计划只保留包含当前月份的条目
   */
  function filterYearlyScheduleByMonth(yearlySchedule: any[]): string {
    if (!Array.isArray(yearlySchedule) || yearlySchedule.length === 0) return ''

    const currentMonth = new Date().getMonth() + 1  // 1-12

    const relevant = yearlySchedule.filter(item => {
      if (item.startMonth <= item.endMonth) {
        // 正常范围：如 3-6月
        return currentMonth >= item.startMonth && currentMonth <= item.endMonth
      } else {
        // 跨年范围：如 11-2月
        return currentMonth >= item.startMonth || currentMonth <= item.endMonth
      }
    })

    if (relevant.length === 0) return '当前月份无特定年度计划'
    return relevant.map(item => `${item.startMonth}-${item.endMonth}月：${item.activity}`).join('；')
  }

  /**
   * 构建系统提示词（根据预设+变量替换）
   */
  // 虚拟场景类型
  interface VirtualScene {
    time?: string
    location?: string
    weather?: string
  }

  function buildDetailedWeatherText(): string {
    const detail = _settingStore?.weatherDetail
    if (!detail || typeof detail !== 'object') {
      return String(_settingStore?.currentWeather || '').trim()
    }
    return [
      detail.text ? `${detail.text}` : '',
      detail.temp ? `${detail.temp}°C` : '',
      detail.feelsLike ? `体感${detail.feelsLike}°C` : '',
      detail.humidity ? `湿度${detail.humidity}%` : '',
      detail.windDir || detail.windScale ? `风${detail.windDir || ''}${detail.windScale ? `${detail.windScale}级` : ''}`.trim() : '',
      detail.windSpeed ? `风速${detail.windSpeed}km/h` : '',
      detail.precip ? `降水${detail.precip}mm` : '',
      detail.pressure ? `气压${detail.pressure}hPa` : '',
      detail.vis ? `能见度${detail.vis}km` : '',
      detail.cloud ? `云量${detail.cloud}%` : '',
      detail.dew ? `露点${detail.dew}°C` : ''
    ].filter(Boolean).join('，')
  }

  function buildUserProfilePromptText(user: Record<string, any>): string {
    const lines = [
      user.desc ? `补充信息：${user.desc}` : '',
      user.gender ? `性别：${user.gender}` : '',
      user.age ? `年龄：${user.age}` : '',
      user.appearance ? `外貌：${user.appearance}` : '',
      user.personality ? `性格：${user.personality}` : '',
      user.outfit ? `穿着：${user.outfit}` : '',
      user.hobbies ? `爱好：${user.hobbies}` : '',
      user.abilities ? `能力：${user.abilities}` : '',
      user.experience ? `经历：${user.experience}` : '',
      user.worldview ? `世界观：${user.worldview}` : '',
      user.background ? `背景：${user.background}` : ''
    ].filter(Boolean)
    return lines.join('\n')
  }

  function resolveRecallUserProfile(activeSession: any): Record<string, any> {
    const userProfile = _charStore?.userProfile || {}
    const aliasId = getChatSessionBoundAlias(activeSession)
    if (!aliasId) return userProfile
    const alias = (_charStore?.aliases || []).find((item: any) => String(item?.id || '').trim() === aliasId)
    if (!alias) return userProfile
    return {
      ...userProfile,
      ...alias,
      displayName: String(alias.name || userProfile.displayName || userProfile.name || '').trim(),
      name: String(alias.name || userProfile.name || userProfile.displayName || '').trim() || userProfile.name || '用户',
      nicknames: String(alias.nicknames || userProfile.nicknames || '').trim()
    }
  }

  function buildPromptSequence(charId: string, scene: string | VirtualScene = 'chat', options: PromptBuildOptions = {}): PromptSequenceItem[] {
    initStores()
    if (options.forceEmptyRecall) {
      clearPendingAIRecall()
    }

    const char = resolveActiveSessionCharacter(charId)
    if (!char) return []

    // 处理 scene 参数（可能是字符串或对象）
    const activeSession = _chatProjection?.getActiveSession?.()
      || _chatStore?.chatSessions?.[_chatStore?.activeChatSessionId || '']
      || null
    const sceneObj: VirtualScene | null = typeof scene === 'object'
      ? scene
      : (resolveEffectiveVirtualScene(activeSession, _settingStore, Date.now()) || null)
    const sceneStr = typeof scene === 'string' ? scene : 'chat'

    // 获取启用的预设，按位置排序
    const settingsViewModel = _settingsProjection?.settingsDocumentViewModel?.value
      || { promptPresets: _settingStore?.promptPresets || [] }
    const presets = (settingsViewModel.promptPresets || [])
      .filter((p: any) => p.enabled && (!p.scene || p.scene === 'all' || p.scene === sceneStr))
      .filter(shouldAssemblePromptPreset)
    const orderedPresets = sortPromptPresetsForAssembly(presets as any[])

    // 变量替换映射
    const user = _charStore?.userProfile || {}
    const charAny = char as any

    // 虚拟场景优先，否则使用现实值
    const effectiveTime = sceneObj?.time || _settingStore?.currentTime || new Date().toLocaleString('zh-CN')
    const effectiveLocation = sceneObj?.location
      ? `当前地点：${sceneObj.location}`
      : (!activeSession && _settingStore?.currentLocation ? `当前地点：${_settingStore.currentLocation}` : '')
    const realWeatherText = buildDetailedWeatherText()
    const effectiveWeather = sceneObj?.weather ? `当前天气：${sceneObj.weather}` : (realWeatherText ? `当前天气：${realWeatherText}` : '')

    const ticketList = Array.isArray(_resourceStore?.tickets) ? _resourceStore.tickets : []
    const ticketBrief = ticketList
      .map((ticket: any) => {
        const name = String(ticket?.name || '').trim()
        const count = Number(ticket?.count || 0)
        if (!name) return ''
        return `${name}x${Number.isFinite(count) ? count : 0}`
      })
      .filter(Boolean)
      .join('，')

    const userProfileText = buildUserProfilePromptText(user)
    const promptUserName = resolvePromptUserName(user, _charStore?.aliases || [], activeSession)
    const minimalCharacterSections = splitRecallPromptSections(buildMinimalCharacterRecallBlock(char))
    // 空召回只停本轮资料检索；角色简介仍是角色回复的身份底座。
    const recallSections = options.forceEmptyRecall
      ? {
        ...emptyRecallSections(),
        profile: minimalCharacterSections.profile
      }
      : _hasPendingAIRecallResult
      ? consumePendingAIRecallSections(options.taskRunId)
      : minimalCharacterSections

    const roleDescription = String(charAny.desc ?? charAny.description ?? '').trim()
    const roleDesc = options.forceEmptyRoleProfile
      ? roleDescription
      : [roleDescription, char.appearance, char.personality, char.outfit].filter(Boolean).join('。')
    const roleStyle = options.forceEmptyRoleProfile ? '' : (char.speakingStyle || '')

    const vars: Record<string, string> = {
      '{role_name}': char.name || '',
      '{role_desc}': roleDesc,
      '{role_style}': roleStyle,
      '{schedule}': '',
      '{yearly_schedule}': '',
      '{current_activities}': '',
      '{relationships}': '',
      '{user_name}': promptUserName,
      '{user_desc}': userProfileText,
      '{time}': effectiveTime,
      '{location}': effectiveLocation,
      '{weather}': effectiveWeather,
      '{points}': String(_resourceStore?.points ?? 0),
      '{money}': String(_resourceStore?.money ?? 0),
      '{tickets_brief}': ticketBrief || '暂无票据',
      '{tickets_detail}': '',
      '{summaries}': '',
      [CHARACTER_BRAIN_RECALL_PLACEHOLDER]: [
        recallSections.profile,
        recallSections.general,
        recallSections.arrangement,
        recallSections.expression
      ].filter(Boolean).join('\n\n'),
      [CHARACTER_PROFILE_RECALL_PLACEHOLDER]: recallSections.profile,
      [CHARACTER_GENERAL_RECALL_PLACEHOLDER]: recallSections.general,
      [CHARACTER_ARRANGEMENT_RECALL_PLACEHOLDER]: recallSections.arrangement,
      [CHARACTER_EXPRESSION_RECALL_PLACEHOLDER]: recallSections.expression
    }

    // 拼接所有预设内容，替换变量
    const parts: PromptSequenceItem[] = []
    let hasChatHistoryPlaceholder = false

    for (const preset of orderedPresets as any[]) {
      if (preset.role === 'placeholder') {
        const placeholderContent = String(preset.content || '').trim()
        if (placeholderContent.includes(CHAT_HISTORY_PLACEHOLDER)) {
          hasChatHistoryPlaceholder = true
          const [beforeHistory, ...afterHistoryParts] = placeholderContent.split(CHAT_HISTORY_PLACEHOLDER)
          if (beforeHistory.trim()) {
            parts.push({
              type: 'message',
              role: 'system',
              content: beforeHistory.trim()
            })
          }
          parts.push({ type: 'history' })
          const afterHistory = afterHistoryParts.join(CHAT_HISTORY_PLACEHOLDER)
          if (afterHistory.trim()) {
            parts.push({
              type: 'message',
              role: 'system',
              content: afterHistory.trim()
            })
          }
        } else if (
          placeholderContent.includes(CURRENT_USER_INPUT_PLACEHOLDER) ||
          placeholderContent.includes(CURRENT_USER_NAME_PLACEHOLDER)
        ) {
          if (options.suppressCurrentUserInputTemplate) continue
          parts.push({
            type: 'message',
            role: 'user',
            content: placeholderContent
          })
        } else if (placeholderContent.includes(SCENARIO_MOUNTED_PROMPTS_PLACEHOLDER)) {
          const mountedText = String(options.scenarioMountedPromptText || '').trim()
          if (mountedText) {
            parts.push({
              type: 'message',
              role: 'system',
              content: mountedText
            })
          }
        }
        continue
      }
      let content = preset.content
      for (const [key, val] of Object.entries(vars)) {
        content = content.replaceAll(key, val)
      }
      // 清除空的变量行
      content = content.split('\n').filter((line: string) => line.trim()).join('\n')
      if (content.trim()) {
        parts.push({
          type: 'message',
          role: preset.role || 'system',
          content
        })
      }
    }

    if (sceneStr === 'chat') {
      const worldContextPart: PromptSequenceItem = {
        type: 'message',
        role: 'system',
        content: buildChatSessionWorldAgentContextPrompt(activeSession)
      }
      const historyIndex = parts.findIndex((item) => item.type === 'history')
      if (historyIndex >= 0) parts.splice(historyIndex, 0, worldContextPart)
      else parts.push(worldContextPart)
    }

    if (sceneStr === 'chat' && !hasChatHistoryPlaceholder) {
      parts.push({ type: 'history' })
    }
    const userIdentityChangeNotice = String(options.userIdentityChangeNotice || '').trim()
    if (userIdentityChangeNotice) {
      parts.push({
        type: 'message',
        role: 'system',
        content: userIdentityChangeNotice
      })
    }

    return parts
  }

  function resolveEffectiveRecallDate(): Date {
    const activeSession = _chatProjection?.getActiveSession?.()
      || _chatStore?.chatSessions?.[_chatStore?.activeChatSessionId || '']
      || null
    const sceneObj = resolveEffectiveVirtualScene(activeSession, _settingStore, Date.now())
    return parseRecallDateText(sceneObj?.time || _settingStore?.currentTime) || new Date()
  }

  function parseRecallDateText(value: unknown): Date | null {
    const text = String(value || '').trim()
    if (!text) return null
    const normalized = text
      .replace(/[年月]/g, '-')
      .replace(/日/g, ' ')
      .replace(/周[一二三四五六日天]/g, ' ')
      .replace(/[，,]/g, ' ')
      .trim()
    const match = normalized.match(/(\d{1,6})-(\d{1,2})-(\d{1,2})(?:\s+(\d{1,2}):(\d{1,2}))?/u)
    if (!match) return null
    const year = Number(match[1])
    const month = Number(match[2])
    const day = Number(match[3])
    const hour = Number(match[4] || 0)
    const minute = Number(match[5] || 0)
    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day) || month < 1 || month > 12 || day < 1 || day > 31) return null
    if (!Number.isFinite(hour) || !Number.isFinite(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) return null
    const date = new Date(0)
    date.setFullYear(year, month - 1, day)
    date.setHours(hour, minute, 0, 0)
    return Number.isNaN(date.getTime()) ? null : date
  }

  async function persistRecallPriorityUpdates(char: any, updates: Record<string, RecallPriorityMarkUpdate> | undefined): Promise<void> {
    const entries = Object.entries(updates || {})
    if (!entries.length || !_charStore?.updateCharacter) return
    const characterId = String(char?.id || '').trim()
    if (!characterId) return
    let workingCharacter = char
    let changes: Record<string, unknown> = {}
    const now = new Date().toISOString()
    for (const [unitId, nextMark] of entries) {
      const currentPage = readCharacterBrainCompilePage(workingCharacter, unitId)
      if (!currentPage) continue
      const normalizedNextMark = nextMark === 's' || nextMark === 'a' || nextMark === 'b' || nextMark === 'c' ? nextMark : undefined
      if ((currentPage.recallPriorityMark || undefined) === normalizedNextMark) continue
      const change = buildCharacterBrainCompilePageChange(workingCharacter, unitId, {
        ...currentPage,
        recallPriorityMark: normalizedNextMark,
        recallPriorityUpdatedAt: now,
        lastRecallConfirmedAt: normalizedNextMark === 's' ? now : currentPage.lastRecallConfirmedAt,
        updatedAt: currentPage.updatedAt
      })
      if (!Object.keys(change).length) continue
      changes = { ...changes, ...change }
      workingCharacter = { ...workingCharacter, ...change }
    }
    if (!Object.keys(changes).length) return
    const activeSession = _chatProjection?.getActiveSession?.()
      || _chatStore?.chatSessions?.[_chatStore?.activeChatSessionId || '']
      || null
    const participant = findSessionCharacterParticipant(activeSession, characterId)
    const mode = normalizeSessionCharacterStateMode(participant?.characterStateMode ?? participant?.character_state_mode)
    if (mode === 'independent_snapshot') {
      const sessionId = String(activeSession?.id || _chatStore?.activeChatSessionId || '').trim()
      if (!sessionId) throw new Error('独立角色分支缺少会话 ID')
      const result = await patchChatSessionCharacterState(sessionId, characterId, changes)
      if (participant && result?.character) participant.resolvedCharacter = result.character
      return
    }
    await _charStore.updateCharacter(characterId, changes)
  }

  function buildSystemPrompt(charId: string, scene: string | VirtualScene = 'chat', options: PromptBuildOptions = {}): string {
    const sequence = buildPromptSequence(charId, scene, options)
    return sequence
      .filter((item) => item.type === 'message' && item.role === 'system' && item.content)
      .map((item) => item.content as string)
      .join('\n\n')
  }

  function buildPromptMessages(charId: string, scene: string | VirtualScene = 'chat', options: PromptBuildOptions = {}): PromptMessage[] {
    const sequence = buildPromptSequence(charId, scene, options)
    return sequence.flatMap((item) => {
      if (item.type === 'history') {
        return [{ role: 'system' as const, content: CHAT_HISTORY_PLACEHOLDER }]
      }
      if (item.type === 'message' && item.role && item.content) {
        return [{
          role: item.role,
          content: item.content
        }]
      }
      return []
    })
  }

  /**
   * 在发送消息前调用，预计算 AI 多轮召回文本。
   * 结果存入 _pendingAIRecallSections，buildPromptSequence 会消费它。
   * AI 调用失败时静默降级，不影响主流程。
   *
   * 召回活动结果自动写入全局状态，供右侧活动侧栏展示。
   */
  async function prepareAIRecall(
    charId: string,
    options: PrepareAIRecallOptions = {},
    onRecallTrace?: Parameters<typeof prepareChatAIRecall>[0]['onRecallTrace']
  ): Promise<PreparedAIRecallResult> {
    initStores()
    clearPendingAIRecall()
    const recallRunSerial = ++_recallRunSerial
    const recallTaskRunId = String(options.taskRunId || '').trim()
    const char = resolveActiveSessionCharacter(charId)
    if (!char) return {
      recallActivity: null,
      sections: null,
      recallTraceLogText: null
    }
    const activeSession = _chatProjection?.getActiveSession?.()
      || _chatStore?.chatSessions?.[_chatStore?.activeChatSessionId || '']
      || null
    const allMessages = (Array.isArray(options.visibleMessagesOverride)
      ? options.visibleMessagesOverride
      : (_chatProjection?.getDisplayMessages?.() ?? [])
    ).filter(isVisibleRecallMessage)
    const recallUserProfile = resolveRecallUserProfile(activeSession)
    const sessionParticipants = Array.isArray(activeSession?.participants) ? activeSession.participants : []
    const activeSessionTargetId = String(activeSession?.targetId ?? activeSession?.target_id ?? '').trim()
    const sessionPlaceType = isMultiCharacterChatSession(activeSession, activeSessionTargetId) ? 'group' as const : 'single' as const
    const otherCharacters = sessionParticipants
      .map((participant: any) => String(
        participant?.participantTargetId
        ?? participant?.participant_target_id
        ?? participant?.targetId
        ?? participant?.id
        ?? ''
      ).trim())
      .filter((participantId: string) => participantId && participantId !== charId && !participantId.startsWith('group_') && !participantId.startsWith('crowd_'))
      .map((participantId: string) => resolveActiveSessionCharacter(participantId))
      .filter((participant: any) => participant && String(participant.id || '').trim() !== String(charId || '').trim())
      .map((participant: any) => ({
        id: String(participant.id || '').trim(),
        name: String(participant.name || '').trim(),
        nicknames: String(participant.nicknames || '').trim(),
        appearance: String(participant.appearance || '').trim()
      }))
    const brainAgentConfig = _settingStore?.getBrainAgentConfig?.()
    const characterName = String((char as unknown as Record<string, unknown>).name || '未命名角色')
    const characterDescription = String((char as unknown as Record<string, unknown>).desc || (char as unknown as Record<string, unknown>).description || '').trim()
    const characterPersonality = String((char as unknown as Record<string, unknown>).personality || '').trim()
    const speakingStyleSummary = String((char as unknown as Record<string, unknown>).speakingStyle || (char as unknown as Record<string, unknown>).speaking_style || '').trim()
    const activeSessionId = String(activeSession?.id || _chatStore?.activeChatSessionId || '').trim()
    // 世界文档范围：旧多轮召回的两条文档来源都按会话所挂世界裁，未挂世界→零文档库。
    const worldDocuments = resolveDocLibraryDocumentsForSession(activeSessionId)
    const result = await prepareChatAIRecall({
      charId,
      character: char,
      activeSessionId,
      visibleMessages: allMessages,
      fallbackDocuments: worldDocuments,
      characterName,
      characterDescription,
      characterPersonality,
      speakingStyleSummary,
      brainAgentConfig,
      userProfile: recallUserProfile,
      otherCharacters,
      sessionPlaceType,
      currentDate: resolveEffectiveRecallDate(),
      // 角色地点安排已彻底退场（2026-06-10 拍板）：召回不再出地点安排卡片；
      // 选项保留在召回模块里只为过滤角色大脑中的历史地点安排数据。
      includeCharacterLocationArrangements: false,
      recallEmbeddingVectorCache: _recallEmbeddingVectorCache,
      callAI,
      callEmbeddings: async (input, embeddingOptions) => {
        const embeddingConfig = resolveEmbeddingModelConfig(brainAgentConfig)
        const usageMeta = resolveCurrentSessionUsageMeta({
          feature: 'embedding',
          usageLabel: '召回嵌入',
          placeLabel: embeddingOptions.characterName || characterName
        })
        const response = await requestAiEmbeddings({
          input,
          presetId: embeddingConfig.presetId || undefined,
          model: embeddingConfig.model || undefined,
          dimensions: embeddingConfig.dimensions,
          meta: {
            usageLabel: usageMeta.usageLabel,
            placeLabel: usageMeta.placeLabel,
            sessionId: usageMeta.sessionId,
            sessionLabel: usageMeta.sessionLabel,
            roundId: usageMeta.roundId,
            unitKind: usageMeta.unitKind
          }
        }, {
          signal: embeddingOptions.signal
        })
        if (!response.ok) return null
        const data = await response.json()
        const items = Array.isArray(data?.data) ? data.data : []
        const vectors = items
          .slice()
          .sort((left: { index?: number }, right: { index?: number }) => Number(left.index || 0) - Number(right.index || 0))
          .map((item: { embedding?: unknown }) => Array.isArray(item.embedding) ? item.embedding.map(Number) : [])
        return {
          vectors,
          model: String(data?.model || ''),
          presetName: String(data?.presetName || data?.preset_name || ''),
          usage: normalizeAiTokenUsage(data?.usage, String(data?.model || ''))
        }
      },
      // 世界文档范围：服务端快照 documents 同样按会话所挂世界裁。
      fetchDocLibraryState: async () => {
        const snapshot = await fetchDocLibraryState()
        return { ...snapshot, documents: filterDocumentsByWorldScope(
          readSessionWorldDocLibraryScope(activeSession).documentIds,
          snapshot.documents || []
        ) }
      },
      fetchSessionTemporaryEntities,
      isStopRequested: isChatStoreStopRequested,
      isStale: () => recallRunSerial !== _recallRunSerial,
      getRegisteredAbortController: () => readMaybeRef<AbortController | null>(_chatStore?.currentAbortController)
        || readMaybeRef<AbortController | null>(_chatStore?.runtime?.currentAbortController),
      setRegisteredAbortController: (controller) => _chatStore?.setAbortController?.(controller),
      isRegisteredAbortController: isChatStoreAbortController,
      onRecallTrace
    }, options)

    if (options.storeForPrompt !== false && result.sections) {
      _pendingAIRecallTaskRunId = recallTaskRunId
      _pendingAIRecallSections = result.sections
      _hasPendingAIRecallResult = true
    } else {
      clearPendingAIRecall()
    }
    if (options.storeForPrompt !== false && result.recallTraceLogText) {
      _pendingRecallTraceLogText = result.recallTraceLogText
    }
    try {
      await persistRecallPriorityUpdates(char, result.recallPriorityUpdates)
    } catch (error) {
      console.warn('召回优先级标记保存失败:', error)
    }
    return {
      recallActivity: result.recallActivity || null,
      sections: result.sections || null,
      recallTraceLogText: result.recallTraceLogText || null
    }
  }

  /** 提调取料嵌入调用：与召回链路同一 embedding 实现 + presetId，placeLabel 标明取料场景（角色名 / 文档库）。 */
  function makeTidiaoRetrievalEmbedTexts(placeLabel: string) {
    const brainAgentConfig = _settingStore?.getBrainAgentConfig?.()
    const embeddingConfig = resolveEmbeddingModelConfig(brainAgentConfig)
    return async (input: string[]) => {
      const usageMeta = resolveCurrentSessionUsageMeta({
        feature: 'embedding',
        usageLabel: '提调取料嵌入',
        placeLabel
      })
      const response = await requestAiEmbeddings({
        input,
        presetId: embeddingConfig.presetId || undefined,
        model: embeddingConfig.model || undefined,
        dimensions: embeddingConfig.dimensions,
        meta: {
          usageLabel: usageMeta.usageLabel,
          placeLabel: usageMeta.placeLabel,
          sessionId: usageMeta.sessionId,
          sessionLabel: usageMeta.sessionLabel,
          roundId: usageMeta.roundId,
          unitKind: usageMeta.unitKind
        }
      })
      if (!response.ok) return null
      const data = await response.json()
      const items = Array.isArray(data?.data) ? data.data : []
      const vectors = items
        .slice()
        .sort((left: { index?: number }, right: { index?: number }) => Number(left.index || 0) - Number(right.index || 0))
        .map((item: { embedding?: unknown }) => Array.isArray(item.embedding) ? item.embedding.map(Number) : [])
      return {
        vectors,
        model: String(data?.model || ''),
        presetName: String(data?.presetName || data?.preset_name || ''),
        usage: normalizeAiTokenUsage(data?.usage, String(data?.model || ''))
      }
    }
  }

  /**
   * 提调取料三件套接缝（批次1d-A）：与 prepareAIRecall 同源——复用同一份文档、embedding 调用、
   * 向量缓存与 embeddingPresetId 缓存作用域，保证取料打分口径与召回一致。
   * - 默认（单聊 per-speaker 取料）：按 charId 取「角色大脑 + 文档库」接缝；找不到角色返回 null。
   * - `options.docLibraryOnly`（D2·群聊导演取料·知识隔离）：取**纯文档库**接缝（不含任何角色大脑），
   *   文档库归提调/旁白、角色大脑彼此隔离（用户 2026-06-22 拍板）；不需要 charId。
   */
  function buildTidiaoRetrievalContext(
    charId: string,
    options: { docLibraryOnly?: boolean; sessionId?: string; allDocuments?: boolean } = {}
  ): TidiaoRetrievalContext | null {
    initStores()
    const brainAgentConfig = _settingStore?.getBrainAgentConfig?.()
    const cacheScope = buildEmbeddingCacheScope(brainAgentConfig)
    // 世界文档范围：两种取料接缝的文档来源都按会话所挂世界裁（未挂世界→零文档库；
    // per-speaker 分支角色大脑卡不受影响，仅其中的文档库单元受限）。
    // allDocuments（星依总 agent 全局语境专用）：不挂在聊天会话上，取全量文档库，绕过世界范围。
    const documents = options.allDocuments === true
      ? (_charStore?.documents || [])
      : resolveDocLibraryDocumentsForSession(options.sessionId)
    if (options.docLibraryOnly) {
      return createTidiaoDocLibraryRetrievalContext({
        documents,
        vectorCache: _recallEmbeddingVectorCache,
        cacheScope,
        embedTexts: makeTidiaoRetrievalEmbedTexts('提调取料·文档库')
      })
    }
    const char = resolveActiveSessionCharacter(charId)
    if (!char) return null
    const characterName = String((char as unknown as Record<string, unknown>).name || '未命名角色')
    return createTidiaoRetrievalContext({
      character: char,
      documents,
      vectorCache: _recallEmbeddingVectorCache,
      cacheScope,
      embedTexts: makeTidiaoRetrievalEmbedTexts(characterName)
    })
  }

  /**
   * 轮级资料池填池（批次3·3b-2·A1 轻量预召回）：对本轮 cast 每角色填「私有大脑 + 他者可观察外貌例外」池、
   * 文档库填世界知识池。与召回链路同源 embedding/向量缓存/文档；**伪并行·保守并发 3**（与生成/裁判/旁白共享
   * ≈6 连接阀门留余量）。决策②最强隔离：角色池绝不含文档库（由 fillCharacterPoolCards 钉死）。
   * 失败逐角色/世界池吞错、降级空池，**绝不阻断导演 loop**。
   */
  async function fillRoundRecallPools(
    cast: Array<{ characterId: string }>,
    query: string,
    options: { topK?: number; fillCharacterIds?: string[]; fillWorld?: boolean; sessionId?: string } = {}
  ): Promise<{ characterPools: Record<string, RecallPoolCard[]>; worldPool: RecallPoolCard[] }> {
    initStores()
    const brainAgentConfig = _settingStore?.getBrainAgentConfig?.()
    const cacheScope = buildEmbeddingCacheScope(brainAgentConfig)
    // 世界文档范围：世界池填池只读会话所挂世界的文档（角色池不碰 documents、不受影响）。
    const documents = resolveDocLibraryDocumentsForSession(options.sessionId)
    const userProfile = (_charStore?.userProfile || {}) as Record<string, unknown>
    const castIds = Array.from(new Set((cast || []).map((c) => String(c?.characterId || '').trim()).filter(Boolean)))
    const userAppearance = String(userProfile.appearance || '').trim()
    // 同口径 buildObservableProfiles：他者（其他 cast 角色 + 用户）有外貌者，inScene 视为 true。
    const buildObservableForChar = (ownerId: string): ObservableProfileSource[] => {
      const out: ObservableProfileSource[] = []
      if (userAppearance) {
        out.push({
          id: String(userProfile.name || userProfile.displayName || 'user').trim() || 'user',
          name: String(userProfile.name || userProfile.displayName || '用户').trim() || '用户',
          nicknames: String((userProfile as Record<string, unknown>).nicknames || ''),
          appearance: userAppearance, inScene: true, subjectType: 'user'
        })
      }
      for (const otherId of castIds) {
        if (otherId === ownerId) continue
        const other = resolveActiveSessionCharacter(otherId) as Record<string, unknown> | undefined
        const appearance = String(other?.appearance || '').trim()
        if (!other || !appearance) continue
        out.push({
          id: otherId, name: String(other.name || '角色').trim() || '角色',
          nicknames: String(other.nicknames || ''), appearance, inScene: true, subjectType: 'character'
        })
      }
      return out
    }
    // 3d 追加召回复用：fillCharacterIds 指定只填哪些角色池（缺省=全 cast）；castIds 仍是完整 cast，
    // 保证「他者可观察外貌例外（公共区）」按全场构造，与开局预填同口径（追加单个角色也能看见同场他者外貌）。
    const requested = Array.isArray(options.fillCharacterIds) ? options.fillCharacterIds.map((id) => String(id || '').trim()) : null
    const fillIds = requested ? castIds.filter((id) => requested.includes(id)) : castIds
    const characterPools: Record<string, RecallPoolCard[]> = {}
    let cursor = 0
    const worker = async () => {
      while (cursor < fillIds.length) {
        const charId = fillIds[cursor++]
        const char = resolveActiveSessionCharacter(charId)
        if (!char) { characterPools[charId] = []; continue }
        try {
          characterPools[charId] = await fillCharacterPoolCards({
            character: char, ownerCharacterId: charId,
            observableProfiles: buildObservableForChar(charId),
            query, topK: options.topK,
            embedTexts: makeTidiaoRetrievalEmbedTexts(String((char as Record<string, unknown>).name || charId)),
            vectorCache: _recallEmbeddingVectorCache, cacheScope
          })
        } catch (error) {
          console.warn('轮级角色资料池填池失败（降级空池）:', charId, error)
          characterPools[charId] = []
        }
      }
    }
    let worldPool: RecallPoolCard[] = []
    const fillWorld = async () => {
      try {
        worldPool = await fillWorldPoolCards({
          documents, query, topK: options.topK,
          embedTexts: makeTidiaoRetrievalEmbedTexts('提调取料·世界池'),
          vectorCache: _recallEmbeddingVectorCache, cacheScope
        })
      } catch (error) {
        console.warn('世界知识池填池失败（降级空池）:', error)
        worldPool = []
      }
    }
    // 伪并行·保守并发 3：角色填池 worker × min(3, N) + 世界池一并跑（3d 追加角色池时 fillWorld:false 跳过世界重填）。
    const tasks: Array<Promise<void>> = Array.from({ length: Math.min(3, fillIds.length) }, () => worker())
    if (options.fillWorld !== false) tasks.push(fillWorld())
    await Promise.all(tasks)
    return { characterPools, worldPool }
  }

  return {
    callAI,
    callAIWithTools,
    generateImage,
    searchWeb,
    callAIStream,
    cleanAiPrefix,
    detectLocationChange,
    buildSystemPrompt,
    buildPromptMessages,
    mergeConsecutiveAssistant,
    mergeConsecutiveMessages,
    prepareAIRecall,
    buildTidiaoRetrievalContext,
    fillRoundRecallPools
  }
}
