import { isReadonly, nextTick, ref, type Ref } from 'vue'
import { hasVisibleAiReplyBody, normalizeAiOutputText, stripAiThoughtContent } from '../../utils/aiOutput'
import {
  CHAT_HISTORY_PLACEHOLDER,
  CURRENT_USER_INPUT_PLACEHOLDER,
  CURRENT_USER_NAME_PLACEHOLDER,
  renderCurrentUserInputTemplate,
  resolveDynamicPromptMessages
} from '../../utils/promptContext'
import {
  bindChatPromptLogMessage,
  bindChatPromptLogMessageBySessionId,
  deleteChatPromptLogsByMessageId,
  deleteChatPromptLogsBySessionMessageId,
  bindChatRecallActivityLogMessage,
  bindChatRecallActivityLogMessageBySessionId,
  createChatPromptLog,
  createChatPromptLogBySessionId,
  createChatRecallActivityLog,
  createChatRecallActivityLogBySessionId,
  createChatGenerationAttemptBySessionId,
  updateChatGenerationAttemptBySessionId,
  createChatGenerationAttemptArtifactBySessionId,
  fetchLatestChatGenerationAttemptByAnchor,
  fetchLatestChatPromptLogByMessageId,
  fetchLatestChatPromptLogBySessionMessageId,
  fetchProjectionFirstMessageViewBySessionId,
  runChatMessageProjectionBySessionId,
  getChatStoreCurrentSession,
  getChatStoreActiveSessionId,
  getChatStoreActiveTargetId,
  setChatStoreTyping,
  isMultiCharacterChatSession,
} from '../../repositories/chatRepository'
import { makeTidiaoRunId } from '../../app/chatTurnAudit'
import { buildChatTurnRoundId } from '../../app/chatTurnRunner'
import {
  getPendingCorrection,
  updatePendingCorrectionText,
  clearPendingCorrection,
  isDirectorResumeText,
  buildDirectorResumeInstruction
} from '../../app/chatCorrectionState'
import { clearTidiaoDirectorStreamRound } from '../../app/tidiaoDirectorStreamState'
import type { TidiaoDirectorStream } from '../../app/tidiaoDirectorStream'
import {
  getCurrentRecallActivitySnapshot,
  invalidateRecallActivityPanelForMessages,
  markCurrentRecallActivityPersisted
} from '../../app/recallTraceState'
import { resolvePromptUserName } from '../../utils/userIdentity'
// 输入框图片上传计划批4·点B：历史用户消息带图时追加 caption 文字（历史一律不带原生图，省 token）。
import { formatAttachmentNote, readMessageAttachments } from '../../utils/chatAttachments'
import { generateNarrationContent } from '../../app/narrationGeneration'
import { stripEmbeddedMessageProjectionFromVisibleText } from '../../app/messageProjectionAgent'
import { extractDirectorDirectives } from '../../app/directorDirective'
import { buildLatestSceneChangePromptNotice } from '../../app/sceneChangePromptNotice'
import { buildTaskModelAiOptions } from '../../utils/modelTaskTiers'
import { assemblePromptFromMessages, assemblePromptFromSources, type PromptSource, type PromptSourceKind } from '../../app/promptAssemblyPipeline'
import { resolveReplyPipelineMode } from '../../app/chatReplyPipelineMode'
import {
  buildProjectionFirstMessageView,
  isProjectionFirstEligibleMessage,
  type ProjectionFirstFallbackJob,
  type ProjectionFirstMessageView,
  type ProjectionFirstMessageViewResult
} from '../../app/projectionFirstMessageView'
import {
  isNarrationMessage,
  normalizeBuiltinNarrationKind,
  normalizeNarrationProfiles,
  shouldNarrationProfileEnterContext,
  type BuiltinNarrationKind,
  type NarrationPlan,
  type NarrationProfile
} from '../../app/narrationProtocol'
import { parseChatFloorRefs } from '../../app/chatMessageFloor'
import {
  buildChatMessageEditVersionPayload,
  normalizeChatMessageEditVersionList
} from '../../app/chatMessageEditVersionCore'
import type { ChatPromptLogBlock, ChatPromptLogEntry } from '../../types'
import { isFocusedActionMessage } from '../../../shared/focusedAction'

interface MessageLike {
  id?: number
  role: string
  content: string
  name?: string
  memberName?: string
  model?: string
  crowdName?: string
  messageKind?: string
  message_kind?: string
  narrationProfileId?: string
  narration_profile_id?: string
  narrationProfileName?: string
  narration_profile_name?: string
  narrationProfileKind?: string
  narration_profile_kind?: string
  narrationKind?: string
  narration_kind?: string
  includeInContext?: boolean
  include_in_context?: boolean
  autoWriteHidden?: boolean | number | string
  auto_write_hidden?: boolean | number | string
  autoWriteHiddenReason?: string
  auto_write_hidden_reason?: string
  envDate?: string
  env_date?: string
  envWeather?: string
  env_weather?: string
  envLocation?: string
  env_location?: string
  time?: string
  versionList?: MessageVersionLike[]
  activeVersionIndex?: number
}

interface MessageVersionLike {
  content: string
  time?: string
  model?: string
  memberName?: string
  crowdName?: string
  createdAt?: string
}

function buildPromptBlocksFromPreparedMessages(
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  policyId: string
): ChatPromptLogBlock[] {
  return assemblePromptFromMessages(messages, {
    policyId,
    sourceKind: 'manual'
  }).promptBlocks
}

interface FormattedHistoryMessage {
  role: string
  content: string
  speakerKey: string
  sourceTitle?: string
  fallbackSource?: string
  fallbackReason?: string
  projectionId?: string
  messageId?: number
}

type ChatPromptAssemblySourceInput = {
  role: 'system' | 'user' | 'assistant'
  content: string
  title: string
  kind: PromptSourceKind
  idPrefix: string
  metadata?: Record<string, unknown>
}

interface CharacterStoreLike {
  getCharacter: (id: string) => any
  characters?: Array<{ id: string; name: string }>
  aliases?: Array<{ id?: string; name?: string }>
  userProfile?: { name?: string; displayName?: string }
}

interface ChatStoreLike {
  current?: {
    currentChatTarget?: string | { value: string }
    currentMessages?: MessageLike[] | { value: MessageLike[] }
    getActiveTargetId?: () => string
  }
  currentSession?: any
  currentMessages?: MessageLike[]
  runtime?: {
    isTyping?: boolean | { value: boolean }
    stopRequested?: boolean | { value: boolean }
    sessionMessagesCache?: Record<string, MessageLike[]> | { value: Record<string, MessageLike[]> }
  }
  currentChatTarget: string
  isTyping: boolean
  stopRequested?: boolean | { value: boolean }
  getActiveTargetId?: () => string
  getActiveSessionId?: () => string
  getCurrentSession?: () => any
  getCurrentMessages?: () => MessageLike[]
  refreshCurrentMessages?: (target: string) => void
  setTyping?: (value: boolean) => void
  clearStopRequest?: () => void
  stopGeneration?: () => void
  clearLocalStreamingMessages?: () => void
  setCurrentMessageModel?: (model: string) => void
  addMessage: (target: string, msg: any, options?: { sessionId?: string; skipLocalSync?: boolean }) => Promise<unknown> | unknown
  deleteMessage: (target: string, messageId: number) => Promise<void> | void
  editMessage: (target: string, messageId: number, payload: string | {
    content?: string
    time?: string
    model?: string
    memberName?: string
    crowdName?: string
    autoWriteHidden?: boolean | number
    auto_write_hidden?: boolean | number
    autoWriteHiddenAt?: string
    autoWriteBatchId?: string
    autoWriteHiddenReason?: string
    auto_write_hidden_reason?: string
    messageKind?: string
    message_kind?: string
    narrationProfileId?: string
    narrationProfileName?: string
    narrationProfileKind?: string
    includeInContext?: boolean
    include_in_context?: boolean
    versionList?: MessageVersionLike[]
    activeVersionIndex?: number
  }) => Promise<void> | void
  updateSession?: (sessionId: string, changes: Record<string, unknown>) => Promise<void> | void
  sessionMessagesCache?: Record<string, MessageLike[]> | { value: Record<string, MessageLike[]> }
  chatMessages?: Record<string, MessageLike[]> | { value: Record<string, MessageLike[]> }
  entities?: {
    chatMessages?: Record<string, MessageLike[]> | { value: Record<string, MessageLike[]> }
  }
}

interface SettingStoreLike {
  defaultPreset?: { name?: string } | null
  presetSendCount?: number
  currentLocation?: string
  addLocationChange?: (from: string, to: string) => void
  getCurrentApiConfig: (presetName: string) => any
  agentModelConfigs?: Array<Record<string, unknown>>
}

export function useChatMessageOps({
  charStore,
  chatStore,
  settingStore,
  settingEnvironmentService,
  callAIStream,
  cleanAiPrefix,
  buildSystemPrompt,
  buildPromptMessages,
  toast,
  openConfirmDialog,
  currentMessages,
  currentScene,
  streamingText,
  getTargetName,
  scrollToBottom,
  runGroupChatReplay,
  resendUserMessage,
  regenerateAssistantViaDirector,
  regenerateAssistantViaDirectedRecast,
  regenerateFocusedAction,
  editChatMessagesViaDirector,
  correctChatMessageViaDirector,
  resolveDirectorOriginalInstruction,
  callAI,
  prepareAIRecall
}: {
  charStore: CharacterStoreLike
  chatStore: ChatStoreLike
  settingStore: SettingStoreLike
  settingEnvironmentService?: {
    saveEnvironment: () => Promise<void>
  }
  callAI?: (messages: any[], options?: any) => Promise<string | null> | string | null
  callAIStream: (messages: any[], options: any, onChunk: (chunk: string) => void, extra?: any) => Promise<string | null>
  cleanAiPrefix: (text: string) => string
  buildSystemPrompt: (targetId: string, scene: any) => string
  buildPromptMessages?: (targetId: string, scene: any, options?: { taskRunId?: string; forceEmptyRecall?: boolean; forceEmptyRoleProfile?: boolean; suppressCurrentUserInputTemplate?: boolean; userIdentityChangeNotice?: string; scenarioMountedPromptText?: string }) => Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
  toast: (msg: string, type?: 'success' | 'error' | 'info' | 'warning') => void
  openConfirmDialog?: (title: string, message: string, onConfirm: () => void) => void
  currentMessages: Ref<MessageLike[]>
  currentScene: Ref<any>
  streamingText: Ref<string>
  getTargetName: (targetId: string) => string
  scrollToBottom: () => void
  runGroupChatReplay?: (targetId: string, userText: string) => Promise<void>
  resendUserMessage?: (text: string, inputMessageId?: number, options?: { parentAttemptId?: string; replacedMessageIds?: number[]; correctionText?: string }) => Promise<unknown>
  /** 批次 M1a：单聊角色消息重试走真·导演 loop，返回 { replyText, model, promptLogId, directorStream }（不写库，由本处走版本写回）；返回 null=软停/取消/不适用，回退旧重试或静默。
   *  O-B2：directorStream = 本轮「累加后的完整快照」（接续这条消息已有的导演带 + 本次新决策），由本处落进 clean_retry artifact，刷新后一条带累加所有版本变更记录。 */
  regenerateAssistantViaDirector?: (messageId: number, options?: { instruction?: string; correctionText?: string }) => Promise<{ replyText: string; model: string; promptLogId: string; directorStream: TidiaoDirectorStream | null } | null>
  /** 批次2 步骤2b：定向重掷轻量重试——按原轮已定方向只重掷角色正文（不进导演 loop、不动决策流带）；
   *  status='recast'=成功（本处走版本写回，directorStream 不变）；'softstop'=软停/取消（不写回保留旧版本）；'unavailable'=开关关/无方向源（本处降级现役路）。 */
  regenerateAssistantViaDirectedRecast?: (messageId: number) => Promise<{ status: 'recast'; replyText: string; model: string; promptLogId: string } | { status: 'softstop' | 'unavailable' }>
  /** 动作旁白重试必须回到动作提调快链，不能降级为普通旁白 profile 重生成。 */
  regenerateFocusedAction?: (messageId: number) => Promise<boolean>
  /** 批次 M3：提调式锚定精修——按楼层引用对会话消息做精修，返回累积改动（不写库，由本处逐条作新版本写回）；返回 null=软停/取消/无目标。 */
  editChatMessagesViaDirector?: (refsText: string, options?: { correctionText?: string; anchorMessageId?: number; onEditCommitted?: (commit: { messageId: number; ref: string; content: string }) => void | Promise<void> }) => Promise<{ edits: Array<{ messageId: number; ref: string; speakerName: string; content: string }>; reprojectTargets?: Array<{ messageId: number; ref: string; speakerName: string }>; directorStream?: TidiaoDirectorStream | null; anchorAssistantMessageId?: number } | null>
  /** 批次 P3a：纠偏三策统一 loop——对某条已落库消息发纠偏，提调自主上→中→下择优；返回 strategy + 三类终态产物（不写库，由本处据 strategy 写回或转 replan）；返回 null=软停/取消/无目标。 */
  correctChatMessageViaDirector?: (targetMessageId: number, options?: { correctionText?: string; anchorMessageId?: number; userInstruction?: string; allowUnanchoredChat?: boolean; onRegenerateBegin?: (messageId: number) => void; onEditCommitted?: (commit: { messageId: number; ref: string; content: string }) => void | Promise<void>; onRegenerated?: (regen: { messageId: number; ref: string; speakerName: string; content: string; promptLogId: string }) => void | Promise<void> }) => Promise<{ strategy: 'direct-edit' | 'prompt-regen' | 'escalate' | 'create-narration' | 'create-cast' | 'ask-user' | 'chat-only' | 'resume-orchestration'; edits: Array<{ messageId: number; ref: string; speakerName: string; content: string }>; regenerations: Array<{ messageId: number; ref: string; speakerName: string; content: string; promptLogId: string }>; escalation: { reason: string } | null; narrationCreations: Array<{ messageId: number; content: string; profileName: string }>; castCreations?: Array<{ speakerName: string; ok: boolean; message?: string }>; reprojectTargets?: Array<{ messageId: number; ref: string; speakerName: string }>; directorStream?: TidiaoDirectorStream | null; anchorAssistantMessageId?: number; escalationHandledInline?: boolean; resumeHandledInline?: boolean } | null>
  /** 批次1(D)：续接时读回这条消息「已落库提调带」记录的「用户原始纠偏指令」（无则空串）。 */
  resolveDirectorOriginalInstruction?: (messageId: number) => Promise<string>
  prepareAIRecall?: (charId: string, options?: { taskRunId?: string; abortSignal?: AbortSignal; skipRecallToFinalConfirmation?: boolean; visibleMessagesOverride?: unknown[] }) => Promise<void>
}) {
  const editingMessageIndex = ref(-1)
  const editingMessageContent = ref('')
  const regeneratingMessageIndex = ref(-1)

  function resolveEditingIndex(index?: number) {
    return Number.isInteger(index) ? index as number : editingMessageIndex.value
  }

  function isValidMessageIndex(index: number) {
    return Number.isInteger(index) && index >= 0 && index < currentMessages.value.length
  }

  function getCurrentTargetId() {
    return getChatStoreActiveTargetId(chatStore)
  }

  function getCurrentSessionId() {
    return getChatStoreActiveSessionId(chatStore)
  }

  function getCurrentSession() {
    return getChatStoreCurrentSession(chatStore)
  }

  function unwrapStoreValue<T>(raw: unknown): T | null {
    const value = raw && typeof raw === 'object' && 'value' in raw
      ? (raw as { value?: unknown }).value
      : raw
    return value as T ?? null
  }

  function resolveMessageRecordSlot(key: 'sessionMessagesCache' | 'chatMessages') {
    const storeRecord = chatStore as unknown as Record<string, unknown>
    if (key in storeRecord) {
      return { owner: storeRecord, property: key, raw: storeRecord[key] }
    }
    const property = key === 'sessionMessagesCache' ? 'sessionMessagesCache' : 'chatMessages'
    const owner = key === 'sessionMessagesCache'
      ? chatStore.runtime as Record<string, unknown> | undefined
      : chatStore.entities as Record<string, unknown> | undefined
    return { owner, property, raw: owner?.[property] }
  }

  function readMessageRecord(key: 'sessionMessagesCache' | 'chatMessages'): Record<string, MessageLike[]> | null {
    const { raw } = resolveMessageRecordSlot(key)
    const value = unwrapStoreValue<unknown>(raw)
    return value && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, MessageLike[]>
      : null
  }

  function writeMessageRecord(key: 'sessionMessagesCache' | 'chatMessages', nextRecord: Record<string, MessageLike[]>): boolean {
    const { owner, property, raw } = resolveMessageRecordSlot(key)
    if (raw && typeof raw === 'object' && 'value' in raw) {
      if (isReadonly(raw)) return false
      ;(raw as { value: Record<string, MessageLike[]> }).value = nextRecord
      return true
    }
    if (owner && property in owner) {
      owner[property] = nextRecord
      return true
    }
    return false
  }

  function refreshDisplayedMessages(target: string, sessionId: string, fallbackMessages: MessageLike[]) {
    if (typeof chatStore.refreshCurrentMessages === 'function') {
      chatStore.refreshCurrentMessages(sessionId || target)
      return
    }
    const nestedCurrentMessages = chatStore.current?.currentMessages
    if (nestedCurrentMessages && typeof nestedCurrentMessages === 'object' && 'value' in nestedCurrentMessages) {
      if (isReadonly(nestedCurrentMessages)) return
      ;(nestedCurrentMessages as { value: MessageLike[] }).value = fallbackMessages
      return
    }
    if (isReadonly(currentMessages)) return
    currentMessages.value = fallbackMessages
  }

  function hideDownstreamMessagesForReplay(input: {
    target: string
    sessionId: string
    anchorIndex: number
    replacedMessageIds: number[]
  }) {
    const messageKey = String(input.sessionId || input.target || '').trim()
    const replacedIds = new Set(input.replacedMessageIds.filter((id) => Number.isFinite(id) && id > 0))
    const originalCurrentMessages = [...currentMessages.value]
    const visibleMessages = currentMessages.value.slice(0, input.anchorIndex + 1)
    const snapshots = (['sessionMessagesCache', 'chatMessages'] as const).map((key) => {
      const record = readMessageRecord(key)
      const hadRecord = Boolean(record)
      const hadBucket = Boolean(messageKey && record && Object.prototype.hasOwnProperty.call(record, messageKey))
      const bucket = hadBucket ? [...(record?.[messageKey] || [])] : []
      if (record && messageKey && hadBucket) {
        const nextBucket = replacedIds.size
          ? bucket.filter((message, index) => index <= input.anchorIndex || !replacedIds.has(Number(message.id || 0)))
          : bucket.slice(0, input.anchorIndex + 1)
        writeMessageRecord(key, { ...record, [messageKey]: nextBucket })
      }
      return { key, hadRecord, hadBucket, bucket }
    })

    refreshDisplayedMessages(input.target, input.sessionId, visibleMessages)

    return () => {
      snapshots.forEach((snapshot) => {
        if (!snapshot.hadRecord || !messageKey) return
        const record = readMessageRecord(snapshot.key) || {}
        if (snapshot.hadBucket) {
          writeMessageRecord(snapshot.key, { ...record, [messageKey]: snapshot.bucket })
        } else {
          const nextRecord = { ...record }
          delete nextRecord[messageKey]
          writeMessageRecord(snapshot.key, nextRecord)
        }
      })
      refreshDisplayedMessages(input.target, input.sessionId, originalCurrentMessages)
    }
  }

  function resolveCharacterByTargetId(targetId: string): Record<string, unknown> | null {
    const normalized = String(targetId || '').replace(/^character[_:-]/, '').trim()
    if (!normalized) return null
    const fromStore = typeof charStore.getCharacter === 'function' ? charStore.getCharacter(normalized) : null
    if (fromStore?.id) return fromStore as Record<string, unknown>
    return ((charStore.characters || []) as Array<Record<string, unknown>>).find((character) => {
      const id = String(character?.id || '').trim()
      return id === normalized || `character_${id}` === targetId || `character:${id}` === targetId
    }) || null
  }

  /** 工作流回复模式（normal_recall / personality_model）：保存并重新生成时走“先隐藏、成功后删库”路径；
   *  pure_prompt 不进工作流，保持旧的先删后发行为。 */
  function shouldUseReplyWorkflowReply(targetId: string) {
    return resolveReplyPipelineMode({
      session: getCurrentSession() as Record<string, unknown> | null,
      character: resolveCharacterByTargetId(targetId)
    }) !== 'pure_prompt'
  }

  function isCapsReplyMessage(msg: MessageLike | null | undefined) {
    const messageKind = String(msg?.messageKind ?? msg?.message_kind ?? '').trim()
    return messageKind === 'caps_reply'
  }

  function shouldRunPromptReplayMessageProjection(input: {
    sessionId: string
    speakerTarget: string
    msg: MessageLike
    isCapsPromptReplay: boolean
  }) {
    if (!input.sessionId || input.isCapsPromptReplay) return false
    const messageKind = String(input.msg.messageKind ?? input.msg.message_kind ?? '').trim()
    if (messageKind === 'narration_debug' || messageKind === 'system' || messageKind === 'caps_reply') return false
    if (normalizePromptHiddenValue(input.msg.autoWriteHidden ?? input.msg.auto_write_hidden) === true) return false
    // 自动链路中，人格 profile 与普通召回都以消息投影为客观事实输入；
    // 按原提示词改写后两者都必须重投影。只有 pure_prompt 明确跳过。
    return shouldUseReplyWorkflowReply(input.speakerTarget)
  }

  async function runPromptReplayMessageProjection(input: {
    sessionId: string
    messageId: number
    speakerTarget: string
    msg: MessageLike
    isCapsPromptReplay: boolean
  }) {
    if (!shouldRunPromptReplayMessageProjection(input)) return
    try {
      const result = await runChatMessageProjectionBySessionId(input.sessionId, input.messageId, { promptLogMode: 'background' })
      const status = String((result as any)?.projection?.status ?? (result as any)?.data?.projection?.status ?? '').trim()
      if (status === 'failed') {
        toast('回复已保存，但消息投影失败', 'warning')
      }
    } catch (error) {
      console.warn('按原提示词重试后的消息投影失败:', error)
      toast('回复已保存，但消息投影失败', 'warning')
    }
  }

  function findPreviousUserMessageIndex(beforeIndex: number): number {
    for (let index = Math.min(beforeIndex - 1, currentMessages.value.length - 1); index >= 0; index -= 1) {
      if (currentMessages.value[index]?.role === 'user') return index
    }
    return -1
  }

  async function regenerateCapsReplyFromPreviousUserMessage(index: number) {
    void index
    toast('CAPS 人格网络回复链路已退役，不能重新运行该消息', 'warning')
  }

  function isMultiCharacterSession(targetId = getCurrentTargetId()) {
    return isMultiCharacterChatSession(getCurrentSession(), targetId)
  }

  function getSessionUsagePlace(targetId = getCurrentTargetId()) {
    const multi = isMultiCharacterSession(targetId)
    return {
      label: `会话：${getTargetName(targetId)}`,
      type: multi ? 'group' as const : 'single' as const
    }
  }


  function getPromptUserName() {
    return resolvePromptUserName(charStore?.userProfile || {}, charStore?.aliases || [], getChatStoreCurrentSession(chatStore))
  }

  async function createPromptLogForCurrentSession(targetId: string, payload: any) {
    const sessionId = getCurrentSessionId()
    return sessionId
      ? await createChatPromptLogBySessionId(sessionId, payload)
      : await createChatPromptLog(targetId, payload)
  }

  async function bindPromptLogForCurrentSession(targetId: string, logId: string, messageId: number) {
    const sessionId = getCurrentSessionId()
    if (sessionId) {
      await bindChatPromptLogMessageBySessionId(sessionId, logId, messageId)
      return
    }
    await bindChatPromptLogMessage(targetId, logId, messageId)
  }

  async function deletePromptLogsForCurrentSession(targetId: string, messageId: number, keepLogId = '') {
    const sessionId = getCurrentSessionId()
    if (sessionId) {
      await deleteChatPromptLogsBySessionMessageId(sessionId, messageId, keepLogId)
      return
    }
    await deleteChatPromptLogsByMessageId(targetId, messageId, keepLogId)
  }

  async function startMessageGenerationAttempt(input: {
    sessionId: string
    anchorMessageId: number
    triggerType: string
    mode: 'clean' | 'prompt_replay'
    targetId: string
    speakerName?: string
    parentAttemptId?: string
    replacedMessageIds?: number[]
    sourcePromptLogId?: string
    tidiaoRunId?: string
  }) {
    if (!input.sessionId || !input.anchorMessageId) return ''
    try {
      const result = await createChatGenerationAttemptBySessionId(input.sessionId, {
        anchorMessageId: input.anchorMessageId,
        parentAttemptId: input.parentAttemptId,
        triggerType: input.triggerType,
        mode: input.mode,
        status: 'running',
        targetId: input.targetId,
        speakerName: input.speakerName || getTargetName(input.targetId),
        // 重试/独立路径无轮级闭包，单点兜底生成 runId，保证每条 attempt 都有非空轮级主键。
        tidiaoRunId: input.tidiaoRunId || makeTidiaoRunId(),
        replacedMessageIds: input.replacedMessageIds || [],
        sourcePromptLogId: input.sourcePromptLogId
      })
      return String(result.id || '')
    } catch (error) {
      console.error('保存生成尝试失败:', error)
      return ''
    }
  }

  async function finishMessageGenerationAttempt(input: {
    sessionId: string
    attemptId: string
    status: 'completed' | 'failed'
    assistantMessageIds?: number[]
    outputPromptLogId?: string
    error?: unknown
  }) {
    if (!input.sessionId || !input.attemptId) return
    try {
      await updateChatGenerationAttemptBySessionId(input.sessionId, input.attemptId, {
        status: input.status,
        assistantMessageIds: input.assistantMessageIds || [],
        outputPromptLogId: input.outputPromptLogId || '',
        errorJson: input.error ? { message: input.error instanceof Error ? input.error.message : String(input.error || '') } : {}
      })
    } catch (error) {
      console.error('更新生成尝试失败:', error)
    }
  }

  async function persistRecallActivityForCurrentSession(input: {
    sessionId?: string
    targetId: string
    speakerName: string
    inputMessageId?: number
    assistantMessageId: number
  }) {
    const activity = getCurrentRecallActivitySnapshot()
    if (!activity) return
    const sessionId = String(input.sessionId || getCurrentSessionId() || '')
    const inputMessageId = Number(input.inputMessageId || 0)
    const assistantMessageId = Number(input.assistantMessageId || 0)
    const activityPayload = activity as unknown as Record<string, unknown>
    if (activity.persistedLogId) {
      if (sessionId) {
        await bindChatRecallActivityLogMessageBySessionId(sessionId, activity.persistedLogId, assistantMessageId, inputMessageId)
      } else {
        await bindChatRecallActivityLogMessage(input.targetId, activity.persistedLogId, assistantMessageId, inputMessageId)
      }
      return
    }
    if (!activity.id || !Array.isArray(activity.events) || activity.events.length === 0) return
    const payload = {
      speakerName: input.speakerName,
      targetId: input.targetId,
      inputMessageId,
      assistantMessageId,
      activity: activityPayload
    }
    const result = sessionId
      ? await createChatRecallActivityLogBySessionId(sessionId, payload)
      : await createChatRecallActivityLog(input.targetId, payload)
    const logId = String(result.id || '')
    if (!logId) throw new Error('召回活动日志创建成功但缺少日志 ID')
    markCurrentRecallActivityPersisted(logId)
    if (assistantMessageId > 0 && Number(result.assistantMessageId || 0) !== assistantMessageId) {
      if (sessionId) {
        await bindChatRecallActivityLogMessageBySessionId(sessionId, logId, assistantMessageId, inputMessageId)
      } else {
        await bindChatRecallActivityLogMessage(input.targetId, logId, assistantMessageId, inputMessageId)
      }
    }
  }

  function setTyping(value: boolean) {
    setChatStoreTyping(chatStore, value)
  }

  function clearStopRequest() {
    if (typeof chatStore.clearStopRequest === 'function') {
      chatStore.clearStopRequest()
      return
    }
    const runtimeStopRequested = chatStore.runtime?.stopRequested
    if (runtimeStopRequested && typeof runtimeStopRequested === 'object' && 'value' in runtimeStopRequested) {
      runtimeStopRequested.value = false
      return
    }
    if (chatStore.runtime && 'stopRequested' in chatStore.runtime) {
      chatStore.runtime.stopRequested = false
      return
    }
    if ('stopRequested' in chatStore) {
      chatStore.stopRequested = false
    }
  }

  function setCurrentMessageModel(model: string) {
    chatStore.setCurrentMessageModel?.(model)
  }

  function isStopRequested() {
    const runtimeStopRequested = chatStore.runtime?.stopRequested
    if (runtimeStopRequested && typeof runtimeStopRequested === 'object' && 'value' in runtimeStopRequested) {
      return Boolean(runtimeStopRequested.value)
    }
    if (typeof runtimeStopRequested === 'boolean') return runtimeStopRequested
    const storeStopRequested = chatStore.stopRequested
    if (storeStopRequested && typeof storeStopRequested === 'object' && 'value' in storeStopRequested) {
      return Boolean(storeStopRequested.value)
    }
    return Boolean(storeStopRequested)
  }

  function createAbortError() {
    const error = new Error('生成已停止')
    error.name = 'AbortError'
    return error
  }

  // 版本列表归一委托共享核心（批次3b 抽取·联动 chatMessageEditVersionCore.ts 头注释：改版本语义只改那里）。
  function normalizeVersionList(message?: MessageLike | null): MessageVersionLike[] {
    return normalizeChatMessageEditVersionList(message) as unknown as MessageVersionLike[]
  }

  function getSafeActiveVersionIndex(message?: MessageLike | null) {
    const versionList = normalizeVersionList(message)
    if (!versionList.length) return 0
    const rawIndex = Number(message?.activeVersionIndex)
    if (!Number.isInteger(rawIndex)) return versionList.length - 1
    return Math.min(Math.max(rawIndex, 0), versionList.length - 1)
  }

  function getDisplayedMessageContent(index: number) {
    const message = currentMessages.value[index]
    if (!message) return ''
    const versionList = normalizeVersionList(message)
    const activeIndex = getSafeActiveVersionIndex(message)
    const content = versionList[activeIndex]?.content || message.content || ''
    // 展示侧兜底剥离投影块：历史消息可能把 [消息投影]…[/消息投影] 焯进了落库正文，
    // 生成期剥离对它们无效，这里再剥一次（桌面/移动/复制/摘录均经此入口，联动一致）。
    return stripEmbeddedMessageProjectionFromVisibleText(content)
  }

  async function copyMessage(index: number) {
    const text = getDisplayedMessageContent(index).trim()
    if (!text) {
      toast('这条消息没有可复制的内容', 'warning')
      return
    }
    try {
      await navigator.clipboard.writeText(text)
      toast('消息已复制', 'success')
    } catch {
      toast('复制失败，请检查浏览器权限', 'error')
    }
  }

  async function selectMessageVersion(index: number, nextIndex: number) {
    const msg = currentMessages.value[index]
    if (!msg) return
    const versionList = normalizeVersionList(msg)
    if (!versionList.length) return
    const safeIndex = Math.min(Math.max(nextIndex, 0), versionList.length - 1)
    msg.versionList = versionList
    msg.activeVersionIndex = safeIndex
    if (msg.id) {
      await chatStore.editMessage(getCurrentTargetId(), msg.id, {
        content: msg.content,
        versionList,
        activeVersionIndex: safeIndex
      })
    }
  }

  function stripThoughtContent(text: string): string {
    return stripAiThoughtContent(text)
  }

  function escapeRegExp(text: string): string {
    return String(text || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }

  function stripLeadingSpeakerPrefix(content: string, speakerName: string) {
    const text = String(content || '').trim()
    const speaker = String(speakerName || '').trim()
    if (!text || !speaker) return text
    const pattern = new RegExp(`^(?:\\[?${escapeRegExp(speaker)}\\]?\\s*[：:]\\s*)+`, 'i')
    return text.replace(pattern, '').trim()
  }

  function keepCurrentSpeakerOnly(text: string, currentName: string): string {
    const thinkPrefixMatch = String(text || '').match(/^(\s*(?:<think>[\s\S]*?<\/think>\s*)+)/i)
    const thinkPrefix = thinkPrefixMatch?.[1] || ''
    const bodyText = thinkPrefix ? String(text || '').slice(thinkPrefix.length) : String(text || '')
    const allNames = (charStore.characters || []).map((char) => char.name).filter(Boolean)
    if (!allNames.length) return text
    const escapedNames = allNames.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
    const speakerRegex = new RegExp(`^\\s*(${escapedNames}|用户|我|User)\\s*[：:]\\s*(.*)$`, 'i')
    const lines = bodyText.split('\n')
    const kept: string[] = []
    const leadingPlain: string[] = []
    let started = false
    let sawForeignSpeaker = false

    for (const rawLine of lines) {
      const line = rawLine.trim()
      if (!line) continue
      const match = line.match(speakerRegex)
      if (match) {
        const speaker = match[1]
        const body = match[2]
        if (!started) {
          if (speaker !== currentName) {
            sawForeignSpeaker = true
            continue
          }
          started = true
          if (body.trim()) kept.push(body.trim())
          continue
        }
        if (speaker !== currentName) break
        if (body.trim()) kept.push(body.trim())
        continue
      }
      if (started) {
        kept.push(line)
        continue
      }
      if (!sawForeignSpeaker) {
        leadingPlain.push(line)
      }
    }

    const merged = kept.join('\n').trim()
    if (merged) return `${thinkPrefix}${merged}`.trim()

    const plainMerged = leadingPlain.join('\n').trim()
    if (plainMerged) return `${thinkPrefix}${plainMerged}`.trim()

    const selfPrefixRegex = new RegExp(`^${currentName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*[：:]\\s*`, 'i')
    const strippedLines = lines
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((line) => !speakerRegex.test(line) || selfPrefixRegex.test(line))
      .map((line) => line.replace(selfPrefixRegex, ''))
      .filter(Boolean)
    return `${thinkPrefix}${strippedLines.join('\n').trim()}`.trim() || String(text || '').trim()
  }

  function getMessageSpeakerName(message: MessageLike, fallbackTargetId: string) {
    return String(
      message.memberName
      || message.name
      || (message.role === 'assistant' ? getTargetName(fallbackTargetId) : getPromptUserName())
    ).trim() || (message.role === 'assistant' ? getTargetName(fallbackTargetId) : '用户')
  }

  function stopActiveReplyRuntime() {
    if (typeof chatStore.stopGeneration === 'function') {
      chatStore.stopGeneration()
    } else {
      setTyping(false)
      setCurrentMessageModel('')
    }
    chatStore.clearLocalStreamingMessages?.()
  }

  function findCharacterIdByMessage(message: MessageLike) {
    const speakerName = String(message.memberName || message.name || '').trim()
    if (!speakerName) return ''
    const matched = (charStore.characters || []).find((char) => char.name === speakerName)
    return matched?.id || ''
  }

  function formatHistoryMessage(targetId: string, message: MessageLike, speakerTargetId = targetId): FormattedHistoryMessage | null {
    if (!message?.role || typeof message.content !== 'string') return null
    const messageKind = String((message as any).messageKind ?? (message as any).message_kind ?? '').trim()
    if (messageKind === 'narration_debug') return null
    if (isMessageHiddenFromPrompt(message)) return null
    const cleanContent = stripThoughtContent(message.content)
    if (!cleanContent) return null

    const isGroupReplay = isMultiCharacterSession(targetId) && !speakerTargetId.startsWith('group_') && !speakerTargetId.startsWith('crowd_')
    const currentSpeakerName = getTargetName(speakerTargetId)
    const speakerName = getMessageSpeakerName(message, speakerTargetId || targetId)

    if (message.role === 'user') {
      const userName = String(message.name || getPromptUserName()).trim() || '用户'
      const content = stripLeadingSpeakerPrefix(cleanContent, userName)
      const attachmentNote = formatAttachmentNote(readMessageAttachments(message))
      return attachProjectionHistoryMetadata(message, {
        role: 'user',
        content: `${userName}：${content}${attachmentNote}`,
        speakerKey: `user:${userName}`
      })
    }

    if (message.role === 'assistant') {
      const content = stripLeadingSpeakerPrefix(cleanContent, speakerName)
      if (isGroupReplay) {
        const role = speakerName === currentSpeakerName ? 'assistant' : 'user'
        return attachProjectionHistoryMetadata(message, {
          role,
          content: `${speakerName}：${content}`,
          speakerKey: `${role}:${speakerName}`
        })
      }
      return attachProjectionHistoryMetadata(message, {
        role: 'assistant',
        content: `${speakerName}：${content}`,
        speakerKey: `assistant:${speakerName}`
      })
    }

    return attachProjectionHistoryMetadata(message, {
      role: message.role,
      content: cleanContent,
      speakerKey: `${message.role}:system`
    })
  }

  function attachProjectionHistoryMetadata(
    message: MessageLike,
    formatted: FormattedHistoryMessage
  ): FormattedHistoryMessage {
    const fallbackSource = String((message as any).fallbackSource ?? '').trim()
    if (!fallbackSource) return formatted
    return {
      ...formatted,
      sourceTitle: fallbackSource === 'projection' ? '聊天记录投影' : '聊天记录投影兜底',
      fallbackSource,
      fallbackReason: String((message as any).fallbackReason ?? '').trim(),
      projectionId: String((message as any).projectionId ?? '').trim(),
      messageId: Number((message as any).messageId ?? message.id ?? 0) || undefined
    }
  }

  function isMessageHiddenFromPrompt(message: MessageLike): boolean {
    const value = (message as any).autoWriteHidden ?? (message as any).auto_write_hidden
    return value === true || value === 1 || value === '1' || value === 'true'
  }

  function collectVisiblePromptHistory(historyList: MessageLike[] = []): MessageLike[] {
    return historyList.filter((message) => {
      if (!message?.role || typeof message.content !== 'string') return false
      const messageKind = String((message as any).messageKind ?? (message as any).message_kind ?? '').trim()
      if (messageKind === 'narration_debug') return false
      return !isMessageHiddenFromPrompt(message)
    })
  }

  function appendPromptAssemblySource(
    sources: PromptSource[],
    input: ChatPromptAssemblySourceInput
  ) {
    const content = String(input.content || '').trim()
    if (!content) return
    sources.push({
      id: `${input.idPrefix}_${sources.length + 1}`,
      title: input.title,
      kind: input.kind,
      role: input.role,
      content,
      orderIndex: sources.length,
      metadata: input.metadata
    })
  }

  function normalizePromptAssemblyRole(value: unknown): 'system' | 'user' | 'assistant' {
    const role = String(value || '').trim()
    return role === 'user' || role === 'assistant' ? role : 'system'
  }

  function appendHistoryPromptSources(
    sources: PromptSource[],
    historyList: MessageLike[],
    targetId: string,
    speakerTargetId = targetId
  ) {
    let pending: FormattedHistoryMessage | null = null
    const flushPending = () => {
      if (!pending) return
      appendPromptAssemblySource(sources, {
        idPrefix: 'history',
        title: pending.sourceTitle || '聊天历史',
        kind: 'history',
        role: normalizePromptAssemblyRole(pending.role),
        content: pending.content,
        metadata: {
          speakerKey: pending.speakerKey,
          fallbackSource: pending.fallbackSource,
          fallbackReason: pending.fallbackReason,
          projectionId: pending.projectionId,
          messageId: pending.messageId
        }
      })
      pending = null
    }

    historyList.forEach((message) => {
      const formatted = formatHistoryMessage(targetId, message, speakerTargetId)
      if (!formatted) return
      if (
        pending
        && pending.speakerKey === formatted.speakerKey
        && (pending.sourceTitle || '') === (formatted.sourceTitle || '')
        && (pending.fallbackSource || '') === (formatted.fallbackSource || '')
      ) {
        const body = formatted.content.replace(/^[^：:\n]{1,40}[：:]\s*/, '').trim()
        pending.content = `${pending.content}\n\n${body || formatted.content}`
        return
      }
      flushPending()
      pending = formatted
    })
    flushPending()
  }

  function resolveCurrentUserInput(historyList: MessageLike[], userText: string): { speakerName: string; rawText: string } {
    const fallbackUserName = getPromptUserName()
    const normalizedUserText = String(userText || '').trim()
    const userMessages = [...historyList].reverse().filter((message) => message?.role === 'user')

    if (normalizedUserText) {
      const matched = userMessages.find((message) => String(message?.content || '').trim() === normalizedUserText)
      const latest = matched || userMessages[0]
      return {
        speakerName: String(latest?.name || fallbackUserName).trim() || fallbackUserName,
        rawText: normalizedUserText
      }
    }

    const latest = userMessages[0]
    if (!latest) return { speakerName: fallbackUserName, rawText: '' }
    const speakerName = String(latest.name || fallbackUserName).trim() || fallbackUserName
    // 用户消息存库原文可能带私密提调指令【【…】】（纯指令轮 userText 为空会走到这个回退分支），
    // 喂模型前必须剥离，否则指令会经「当前用户输入」槽泄漏进角色提示词。与 useChatMessages 同源联动，改一处需同步另一处。
    const cleanContent = stripThoughtContent(extractDirectorDirectives(String(latest.content || '')).cleanText)
    return {
      speakerName,
      rawText: stripLeadingSpeakerPrefix(cleanContent, speakerName)
    }
  }

  const queuedProjectionFallbackJobs = new Set<string>()

  function buildLocalProjectionFirstMessageView(
    sessionId: string,
    characterId: string,
    historyList: MessageLike[],
    currentMessageIds: Array<number | string>
  ): ProjectionFirstMessageViewResult {
    const sourceMessages = Array.isArray(historyList) ? historyList : []
    const maxMessageId = sourceMessages.reduce((max, message) => {
      const messageId = Number((message as any)?.id ?? (message as any)?.messageId ?? (message as any)?.message_id ?? 0)
      return Math.max(max, Number.isInteger(messageId) ? messageId : 0)
    }, 0)
    const currentIdSet = new Set(currentMessageIds.map((id) => Number(id || 0)).filter((id) => id > 0))
    const selected = sourceMessages
      .map((message, index) => {
        const record = { ...(message as any) }
        const realMessageId = Number(record.id ?? record.messageId ?? record.message_id ?? 0)
        const effectiveMessageId = realMessageId > 0 ? realMessageId : maxMessageId + index + 1
        return {
          record: { ...record, id: effectiveMessageId },
          realMessageId,
          effectiveMessageId,
          index
        }
      })
      .filter((entry) => isProjectionFirstEligibleMessage(entry.record))
    const windowSelected = selected.slice(-23)
    selected.forEach((entry) => {
      if (entry.realMessageId > 0 && currentIdSet.has(entry.realMessageId) && !windowSelected.includes(entry)) {
        windowSelected.push(entry)
      }
    })
    const items: ProjectionFirstMessageView[] = []
    const fallbackJobs: ProjectionFirstFallbackJob[] = []
    windowSelected
      .sort((left, right) => left.index - right.index)
      .forEach((entry) => {
        const result = buildProjectionFirstMessageView({
          sessionId,
          characterId,
          messages: [entry.record],
          windowSize: 1,
          currentMessageIds: [entry.effectiveMessageId]
        })
        const item = result.items[0]
        if (item) items.push(item)
        if (entry.realMessageId > 0) {
          fallbackJobs.push(...result.fallbackJobs.map((job) => ({ ...job, messageId: entry.realMessageId })))
        }
      })
    return {
      sessionId,
      characterId,
      windowSize: 23,
      items,
      fallbackJobs
    }
  }

  function resolveCurrentProjectionMessageIds(historyList: MessageLike[], userText: string): number[] {
    const normalizedUserText = String(userText || '').trim()
    const ids: number[] = []
    const userMessages = (Array.isArray(historyList) ? historyList : [])
      .filter((message) => message?.role === 'user')

    userMessages.forEach((message) => {
      const messageId = Number((message as any).id ?? (message as any).messageId ?? (message as any).message_id ?? 0)
      if (messageId <= 0) return
      if (normalizedUserText && String(message.content || '').trim() === normalizedUserText) {
        ids.push(messageId)
      }
    })

    const latestUserMessage = [...userMessages].reverse().find((message) => Number((message as any).id ?? 0) > 0)
    const latestId = Number((latestUserMessage as any)?.id ?? 0)
    if (latestId > 0) ids.push(latestId)
    return Array.from(new Set(ids))
  }

  async function resolveProjectionFirstPromptHistory(input: {
    targetId: string
    speakerTargetId: string
    userText: string
    history: MessageLike[]
    purePrompt?: boolean
  }): Promise<ProjectionFirstMessageViewResult> {
    const sessionId = getCurrentSessionId()
    const currentMessageIds = resolveCurrentProjectionMessageIds(input.history, input.userText)
    if (input.purePrompt) {
      return buildLocalProjectionFirstMessageView(sessionId, input.speakerTargetId, input.history, currentMessageIds)
    }
    if (!sessionId) {
      return buildLocalProjectionFirstMessageView('', input.speakerTargetId, input.history, currentMessageIds)
    }
    try {
      const result = await fetchProjectionFirstMessageViewBySessionId(sessionId, {
        characterId: input.speakerTargetId,
        windowSize: 23,
        currentMessageIds
      })
      if (result && Array.isArray(result.items) && Array.isArray(result.fallbackJobs)) {
        return result
      }
      return buildLocalProjectionFirstMessageView(sessionId, input.speakerTargetId, input.history, currentMessageIds)
    } catch (error) {
      console.warn('读取投影优先消息视图失败，使用本地缺投影兜底:', error)
      return buildLocalProjectionFirstMessageView(sessionId, input.speakerTargetId, input.history, currentMessageIds)
    }
  }

  function queueProjectionFirstFallbackJobs(jobs: ProjectionFirstFallbackJob[]) {
    jobs.forEach((job) => {
      const sessionId = String(job.sessionId || '').trim()
      const messageId = Number(job.messageId || 0)
      if (!sessionId || messageId <= 0 || job.fallbackSource === 'projection') return
      const key = `${sessionId}:${messageId}`
      if (queuedProjectionFallbackJobs.has(key)) return
      queuedProjectionFallbackJobs.add(key)
      runChatMessageProjectionBySessionId(sessionId, messageId, { promptLogMode: 'background' })
        .catch((error) => console.warn('投影优先兜底补投影失败:', error))
        .finally(() => queuedProjectionFallbackJobs.delete(key))
    })
  }

  async function buildChatMessages(targetId: string, userText: string, history = currentMessages.value, speakerTargetId = targetId, options: { skipPrepareRecall?: boolean; taskRunId?: string; abortSignal?: AbortSignal; forceEmptyRecall?: boolean; forceEmptyRoleProfile?: boolean; suppressCurrentUserInputTemplate?: boolean; skipRecallToFinalConfirmation?: boolean; userIdentityChangeNotice?: string; recallVisibleMessagesOverride?: unknown[]; scenarioMountedPromptText?: string; purePrompt?: boolean } = {}) {
    const projectionFirstHistory = await resolveProjectionFirstPromptHistory({
      targetId,
      speakerTargetId,
      userText,
      history: history as MessageLike[],
      purePrompt: options.purePrompt
    })
    const promptHistory = collectVisiblePromptHistory(projectionFirstHistory.items as unknown as MessageLike[])
    if (!options.purePrompt) {
      queueProjectionFirstFallbackJobs(projectionFirstHistory.fallbackJobs)
    }
    if (!options.skipPrepareRecall) {
      await prepareAIRecall?.(speakerTargetId, {
        taskRunId: options.taskRunId,
        abortSignal: options.abortSignal,
        skipRecallToFinalConfirmation: options.skipRecallToFinalConfirmation,
        visibleMessagesOverride: options.recallVisibleMessagesOverride || promptHistory
      })
    }
    if (isStopRequested()) {
      throw createAbortError()
    }
    const sources: PromptSource[] = []
    const rawPromptMessages = typeof buildPromptMessages === 'function'
      ? buildPromptMessages(speakerTargetId, currentScene.value, {
        taskRunId: options.taskRunId,
        forceEmptyRecall: options.forceEmptyRecall,
        forceEmptyRoleProfile: options.forceEmptyRoleProfile,
        suppressCurrentUserInputTemplate: options.suppressCurrentUserInputTemplate,
        userIdentityChangeNotice: options.userIdentityChangeNotice,
        scenarioMountedPromptText: options.scenarioMountedPromptText
      })
      : (buildSystemPrompt(speakerTargetId, currentScene.value)
        ? [{ role: 'system' as const, content: buildSystemPrompt(speakerTargetId, currentScene.value) }]
        : [])
    const promptMessages = await resolveDynamicPromptMessages(rawPromptMessages)

    let insertedHistory = false
    let insertedSceneChangeNotice = false
    const currentUserInput = resolveCurrentUserInput(promptHistory, userText)
    const sceneChangeNotice = buildLatestSceneChangePromptNotice(history as any[], getChatStoreCurrentSession(chatStore))
    const pushSceneChangeNotice = () => {
      if (!sceneChangeNotice || insertedSceneChangeNotice) return
      appendPromptAssemblySource(sources, {
        idPrefix: 'scene_change',
        title: '场景变化提醒',
        kind: 'runtime_notice',
        role: 'system',
        content: sceneChangeNotice
      })
      insertedSceneChangeNotice = true
    }
    promptMessages.forEach((promptMessage, index) => {
      const promptContent = String(promptMessage.content || '').trim()
      if (promptMessage.role === 'system' && promptContent === CHAT_HISTORY_PLACEHOLDER) {
        if (!insertedHistory) {
          appendHistoryPromptSources(sources, promptHistory, targetId, speakerTargetId)
          insertedHistory = true
        }
        return
      }
      if (
        promptContent.includes(CURRENT_USER_INPUT_PLACEHOLDER) ||
        promptContent.includes(CURRENT_USER_NAME_PLACEHOLDER)
      ) {
        if (options.suppressCurrentUserInputTemplate) return
        pushSceneChangeNotice()
        const rendered = renderCurrentUserInputTemplate(promptContent, currentUserInput.rawText, currentUserInput.speakerName)
        if (rendered) {
          appendPromptAssemblySource(sources, {
            idPrefix: 'current_user_input',
            title: '当前用户输入',
            kind: 'current_user_input',
            role: 'user',
            content: rendered
          })
        }
        return
      }
      appendPromptAssemblySource(sources, {
        idPrefix: 'prompt_library',
        title: `提示词库消息 ${index + 1}`,
        kind: 'prompt_library',
        role: normalizePromptAssemblyRole(promptMessage.role),
        content: promptMessage.content,
        metadata: { promptMessageIndex: index }
      })
    })

    if (!insertedHistory) {
      appendHistoryPromptSources(sources, promptHistory, targetId, speakerTargetId)
    }
    pushSceneChangeNotice()

    if (sources.length === 0) {
      appendPromptAssemblySource(sources, {
        idPrefix: 'empty_fallback',
        title: '空提示词兜底',
        kind: 'runtime_notice',
        role: 'system',
        content: '开始对话。'
      })
    }
    return assemblePromptFromSources({
      mode: 'normal_recall',
      policy: { id: 'chat-message-ops', defaultRole: 'system' },
      sources,
      metadata: {
        targetId,
        speakerTargetId,
        scene: currentScene.value,
        projectionFirstMessageView: {
          sessionId: projectionFirstHistory.sessionId,
          characterId: projectionFirstHistory.characterId,
          itemCount: projectionFirstHistory.items.length,
          fallbackJobCount: projectionFirstHistory.fallbackJobs.length
        }
      }
    }).messages
  }

  async function toggleMessagePromptVisibility(index: number) {
    const msg = currentMessages.value[index]
    const messageId = Number(msg?.id || 0)
    if (!msg || !messageId) {
      toast('这条消息还没有保存，暂时不能切换隐藏状态', 'warning')
      return
    }
    const hidden = isMessageHiddenFromPrompt(msg)
    const nextHidden = !hidden
    await chatStore.editMessage(getCurrentTargetId(), messageId, {
      content: msg.content || '',
      autoWriteHidden: nextHidden,
      autoWriteHiddenAt: nextHidden ? new Date().toISOString() : '',
      autoWriteBatchId: nextHidden ? String((msg as any).autoWriteBatchId ?? (msg as any).auto_write_batch_id ?? 'manual') : '',
      autoWriteHiddenReason: nextHidden ? 'manual_hidden' : 'manual_visible'
    })
  }

  function getAIOptions(targetId: string) {
    const char = charStore.getCharacter(targetId)
    const characterPresetName = String(char?.defaultPreset || '').trim()
    const globalPresetName = String(settingStore.defaultPreset?.name || '').trim()
    // 批次3（2026-07-08 槽位收束）：角色消息归校书档；旧角色槽默认 temp1/4096/thinking enabled 落调用点覆写
    //（行为不变·角色级 roleTemperature 等覆写仍优先）。
    const roleOptions = buildTaskModelAiOptions(readBrainAgentConfig(), 'roleMessage', { temperature: 1, maxTokens: 4096, thinking: 'enabled' })
    const rolePresetName = String(roleOptions.presetName || '').trim()
    const presetName = characterPresetName || rolePresetName || globalPresetName
    const preset = settingStore.getCurrentApiConfig(presetName)
    const model = String(char?.defaultModel || '').trim()
      || (characterPresetName ? String(preset?.model || '').trim() : String(roleOptions.model || '').trim())
      || String(preset?.model || '').trim()
    return {
      presetName: preset?.name || presetName,
      model,
      temperature: normalizeOptionalTemperature((char as any)?.roleTemperature ?? (char as any)?.role_temperature) ?? roleOptions.temperature,
      maxTokens: normalizeOptionalMaxTokens((char as any)?.roleMaxTokens ?? (char as any)?.role_max_tokens) ?? roleOptions.maxTokens,
      thinking: normalizeOptionalThinking((char as any)?.roleThinking ?? (char as any)?.role_thinking) ?? roleOptions.thinking
    }
  }

  function normalizeOptionalThinking(value: unknown): 'enabled' | 'disabled' | undefined {
    return value === 'enabled' || value === 'disabled' ? value : undefined
  }

  function normalizeOptionalTemperature(value: unknown): number | undefined {
    if (value === undefined || value === null || value === '') return undefined
    const next = Number(value)
    if (!Number.isFinite(next)) return undefined
    return Math.max(0, Math.min(2, next))
  }

  function normalizeOptionalMaxTokens(value: unknown): number | undefined {
    if (value === undefined || value === null || value === '') return undefined
    const next = Number(value)
    if (!Number.isFinite(next) || next <= 0) return undefined
    return Math.max(1, Math.min(32768, Math.trunc(next)))
  }

  function normalizePromptHiddenValue(value: unknown): boolean | number | undefined {
    if (value === true || value === 1 || value === '1' || value === 'true') return true
    if (value === false || value === 0 || value === '0' || value === 'false') return false
    return undefined
  }

  function readBrainAgentConfig() {
    const configs = Array.isArray(settingStore.agentModelConfigs) ? settingStore.agentModelConfigs : []
    return configs.find((item) => String(item?.id || '').trim() === 'brain_agent') || null
  }

  function normalizeNarrationPlan(input: unknown): NarrationPlan {
    const raw = input && typeof input === 'object' ? input as Partial<NarrationPlan> : {}
    return {
      shouldInsert: true,
      narrationKind: normalizeBuiltinNarrationKind(raw.narrationKind),
      reasons: Array.isArray(raw.reasons) && raw.reasons.length ? raw.reasons.map(String) : ['regenerate_narration'],
      modelTier: raw.modelTier === 'quick' || raw.modelTier === 'rule' || raw.modelTier === 'strong' ? raw.modelTier : 'standard',
      frequency: raw.frequency === 'silent' || raw.frequency === 'active' ? raw.frequency : 'standard',
      temperature: raw.temperature === 'documentary' || raw.temperature === 'light' || raw.temperature === 'open' || raw.temperature === 'bloom' ? raw.temperature : 'standard',
      candidateBatchId: typeof raw.candidateBatchId === 'string' ? raw.candidateBatchId : undefined,
      profileId: typeof raw.profileId === 'string' ? raw.profileId : undefined,
      profileName: typeof raw.profileName === 'string' ? raw.profileName : undefined,
      score: Number.isFinite(Number(raw.score)) ? Number(raw.score) : 1,
      debug: raw.debug && typeof raw.debug === 'object' ? raw.debug as Record<string, unknown> : undefined
    }
  }

  function resolveSessionNarrationProfiles(): NarrationProfile[] {
    const session = getChatStoreCurrentSession(chatStore) || {}
    const record = session as Record<string, unknown>
    return normalizeNarrationProfiles(record.narrationProfiles ?? record.narration_profiles, {
      frequency: record.narrationFrequency ?? record.narration_frequency,
      temperature: record.narrationTemperature ?? record.narration_temperature
    })
  }

  function resolveNarrationProfileForMessage(input: {
    msg: MessageLike
    evidence: Record<string, unknown>
    plan: NarrationPlan
  }): NarrationProfile | null {
    const profiles = resolveSessionNarrationProfiles()
    const record = input.msg as unknown as Record<string, unknown>
    const profileId = String(
      record.narrationProfileId
      ?? record.narration_profile_id
      ?? input.evidence.narrationProfileId
      ?? input.evidence.narration_profile_id
      ?? input.plan.profileId
      ?? ''
    ).trim()
    if (profileId) {
      const matched = profiles.find((profile) => profile.id === profileId)
      if (matched) return matched
    }
    const profileKind = String(
      record.narrationProfileKind
      ?? record.narration_profile_kind
      ?? input.evidence.narrationProfileKind
      ?? input.evidence.narration_profile_kind
      ?? input.plan.debug?.profileKind
      ?? ''
    ).trim()
    if (profileKind === 'custom') return null
    const builtinKind = normalizeBuiltinNarrationKind(profileKind || input.evidence.narrationKind || input.plan.narrationKind)
    return profiles.find((profile) => profile.id === builtinKind) || null
  }

  function isCustomNarrationMessage(msg: MessageLike) {
    if (!isNarrationMessage(msg as any)) return false
    const profileKind = String(msg.narrationProfileKind ?? msg.narration_profile_kind ?? '').trim()
    if (profileKind === 'custom') return true
    const profileId = String(msg.narrationProfileId ?? msg.narration_profile_id ?? '').trim()
    return profileId.startsWith('custom_')
  }

  async function regenerateNarrationMsg(index: number, msg: MessageLike) {
    const sessionId = getCurrentSessionId()
    const targetId = getCurrentTargetId()
    const messageId = Number(msg.id || 0)
    if (!sessionId || !messageId) {
      toast('这条旁白缺少会话或消息 ID，暂时无法重新生成', 'error')
      return
    }

    regeneratingMessageIndex.value = index
    invalidateRecallActivityPanelForMessages({
      sessionId,
      messageIds: [messageId],
      mode: 'restart'
    })

    clearStopRequest()
    setTyping(true)
    setCurrentMessageModel('')
    streamingText.value = ''

    try {
      const messageNarrationKind = msg.narrationProfileKind ?? msg.narration_profile_kind ?? msg.narrationKind ?? msg.narration_kind ?? ''
      const plan = normalizeNarrationPlan({ narrationKind: messageNarrationKind || 'environment' })
      const narrationProfile = resolveNarrationProfileForMessage({ msg, evidence: {}, plan })
      const profileId = String(narrationProfile?.id || '').trim()
      const effectiveKind = profileId && profileId !== 'environment' && profileId !== 'appearance' && profileId !== 'event_push'
        ? 'environment' as BuiltinNarrationKind
        : normalizeBuiltinNarrationKind(profileId || messageNarrationKind || plan.narrationKind)
      const includeInContext = shouldNarrationProfileEnterContext(narrationProfile)
      const historyBefore = currentMessages.value.slice(0, index)
      let fullReply = ''
      let usedModel = ''
      const agentConfig = readBrainAgentConfig()
      const result = await generateNarrationContent({
        session: getChatStoreCurrentSession(chatStore) || { id: sessionId, targetId },
        plan: {
          ...plan,
          shouldInsert: true,
          narrationKind: effectiveKind,
          profileId: narrationProfile?.id || plan.profileId,
          profileName: narrationProfile?.name || plan.profileName,
          debug: {
            ...(plan.debug || {}),
            profileKind: effectiveKind,
            includeInContext
          }
        },
        messages: historyBefore as any[],
        agentConfig,
        narrationProfile,
        callAI: async (messages, options) => await callAIStream(
          messages,
          options,
          (chunk: string) => {
            fullReply += chunk
            streamingText.value = fullReply
            scrollToBottom()
          },
          {
            onModelInfo: (model: string) => {
              usedModel = model
              setCurrentMessageModel(model)
            }
          }
        )
      })

      const normalizedReply = normalizeAiOutputText(result.content || fullReply)
      const cleanedReply = cleanAiPrefix(normalizedReply)
      if (!hasVisibleAiReplyBody(cleanedReply)) {
        toast('模型没有返回可显示的旁白，请稍后重试或换个预设', 'warning')
        return
      }

      const previousVersions = normalizeVersionList(msg)
      const nextVersionList = [
        ...previousVersions,
        {
          content: cleanedReply,
          time: new Date().toLocaleTimeString(),
          model: usedModel || String(result.messagePayload?.model || ''),
          memberName: '旁白',
          crowdName: '',
          createdAt: new Date().toISOString()
        }
      ]
      const updatePayload = {
        content: cleanedReply,
        time: new Date().toLocaleTimeString(),
        model: usedModel || String(result.messagePayload?.model || ''),
        memberName: '旁白',
        crowdName: '',
        messageKind: 'narration',
        message_kind: 'narration',
        narrationProfileId: narrationProfile?.id || msg.narrationProfileId || msg.narration_profile_id || '',
        narrationProfileName: narrationProfile?.name || msg.narrationProfileName || msg.narration_profile_name || '',
        narrationProfileKind: effectiveKind || msg.narrationProfileKind || msg.narration_profile_kind || '',
        includeInContext,
        include_in_context: includeInContext,
        autoWriteHidden: includeInContext ? normalizePromptHiddenValue(msg.autoWriteHidden) : true,
        auto_write_hidden: includeInContext ? normalizePromptHiddenValue(msg.auto_write_hidden) : true,
        autoWriteHiddenReason: includeInContext ? msg.autoWriteHiddenReason : 'narration_profile_excluded',
        auto_write_hidden_reason: includeInContext ? msg.auto_write_hidden_reason : 'narration_profile_excluded',
        versionList: nextVersionList,
        activeVersionIndex: nextVersionList.length - 1
      }

      await chatStore.editMessage(targetId, messageId, updatePayload)

      if (result.promptTrace) {
        const promptLog = await createPromptLogForCurrentSession(targetId, {
          speakerName: '旁白',
          targetId,
          finalPrompt: result.promptTrace.finalPrompt,
          promptBlocks: result.promptTrace.promptBlocks
        })
        const promptLogId = String(promptLog.id || '')
        if (promptLogId) {
          await deletePromptLogsForCurrentSession(targetId, messageId, promptLogId)
          await bindPromptLogForCurrentSession(targetId, promptLogId, messageId)
        }
      }

    } catch (err: any) {
      if (err?.name !== 'AbortError') toast(`旁白重新生成失败: ${err?.message || err}`, 'error')
    } finally {
      setTyping(false)
      setCurrentMessageModel('')
      streamingText.value = ''
      regeneratingMessageIndex.value = -1
      await nextTick()
      scrollToBottom()
    }
  }

  function buildPromptReplayMessages(log: ChatPromptLogEntry): Array<{ role: 'system' | 'user' | 'assistant'; content: string }> {
    const blocks = Array.isArray(log.promptBlocks) ? log.promptBlocks : []
    const messages = blocks
      .filter((block): block is ChatPromptLogBlock => Boolean(block && (block.role === 'system' || block.role === 'user' || block.role === 'assistant')))
      .map((block) => ({
        role: block.role,
        content: String(block.content || '')
      }))
      .filter((message) => message.content.trim())
    if (messages.length) return messages
    const finalPrompt = String(log.finalPrompt || '').trim()
    return finalPrompt ? [{ role: 'user', content: finalPrompt }] : []
  }

  async function fetchLatestPromptLogForReplay(targetId: string, messageId: number): Promise<ChatPromptLogEntry | null> {
    const sessionId = getCurrentSessionId()
    if (sessionId) return await fetchLatestChatPromptLogBySessionMessageId(sessionId, messageId)
    return await fetchLatestChatPromptLogByMessageId(targetId, messageId)
  }

  async function regenerateMsgWithPromptReplay(index: number, msg: MessageLike) {
    const targetId = getCurrentTargetId()
    const sessionId = getCurrentSessionId()
    const messageId = Number(msg.id || 0)
    const isCapsPromptReplay = isCapsReplyMessage(msg)
    if (isCapsPromptReplay) {
      toast('CAPS 人格网络回复链路已退役，不能按原提示词重试该消息', 'warning')
      return
    }
    if (!messageId) {
      toast('这条消息还没有保存，不能按原提示词重试', 'warning')
      return
    }

    const log = await fetchLatestPromptLogForReplay(targetId, messageId)
    const replayMessages = log ? buildPromptReplayMessages(log) : []
    if (!log || !replayMessages.length) {
      toast('这条消息没有可复用的提示词日志，只能重新召回重试', 'warning')
      return
    }

    regeneratingMessageIndex.value = index
    clearStopRequest()
    setTyping(true)
    setCurrentMessageModel('')
    streamingText.value = ''

    let generationAttemptId = ''
    try {
      const speakerName = String(log.speakerName || msg.memberName || msg.name || (isNarrationMessage(msg as any) ? '旁白' : getTargetName(targetId))).trim() || '角色'
      const speakerTarget = String(log.targetId || targetId || '').trim() || targetId
      const historyBefore = currentMessages.value.slice(0, index)
      const inputMessage = [...historyBefore].reverse().find((message) => message?.role === 'user') || null
      generationAttemptId = await startMessageGenerationAttempt({
        sessionId,
        anchorMessageId: Number(inputMessage?.id || messageId),
        triggerType: 'assistant_message_retry',
        mode: 'prompt_replay',
        targetId,
        speakerName,
        sourcePromptLogId: String(log.id || '')
      })
      let fullReply = ''
      let usedModel = ''
      const returnedText = await callAIStream(
        replayMessages,
        {
          ...getAIOptions(speakerTarget),
          usageLabel: `按原提示词重试：${speakerName}`,
          // 消耗溯源：并入原轮总账（roundId=该轮用户输入消息）。
          roundId: buildChatTurnRoundId(sessionId, Number(inputMessage?.id || 0)),
          unitKind: 'regenerate',
          feature: isNarrationMessage(msg as any) ? 'narration' : 'role_message',
          onPromptPrepared: async ({ messages: preparedMessages, finalPrompt, promptBlocks }: {
            messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
            finalPrompt: string
            promptBlocks?: ChatPromptLogBlock[]
            preparedAt: string
          }) => {
            try {
              const result = await createPromptLogForCurrentSession(targetId, {
                speakerName,
                targetId: speakerTarget,
                finalPrompt,
                promptBlocks: promptBlocks ?? buildPromptBlocksFromPreparedMessages(preparedMessages, 'prompt-replay-messages')
              })
              ;(msg as MessageLike & { _promptLogId?: string })._promptLogId = String(result.id || '')
            } catch (error) {
              console.error('记录按原提示词重试日志失败:', error)
            }
          }
        },
        (chunk: string) => {
          fullReply += chunk
          streamingText.value = fullReply
          scrollToBottom()
        },
        {
          onModelInfo: (model: string) => {
            usedModel = model
            setCurrentMessageModel(model)
          }
        }
      )

      const normalizedReply = cleanAiPrefix(normalizeAiOutputText(returnedText || fullReply))
      if (!hasVisibleAiReplyBody(normalizedReply)) {
        toast(isNarrationMessage(msg as any) ? '模型没有返回可显示的旁白，请稍后重试或换个预设' : '模型没有返回可显示的回复，请稍后重试或换个预设', 'warning')
        return
      }

      const previousVersions = normalizeVersionList(msg)
      const nextVersionList = [
        ...previousVersions,
        {
          content: normalizedReply,
          time: new Date().toLocaleTimeString(),
          model: usedModel,
          memberName: isNarrationMessage(msg as any) ? '旁白' : (msg.memberName || ''),
          crowdName: msg.crowdName || '',
          createdAt: new Date().toISOString()
        }
      ]
      const updatePayload = {
        content: normalizedReply,
        time: new Date().toLocaleTimeString(),
        model: usedModel,
        memberName: isNarrationMessage(msg as any) ? '旁白' : (msg.memberName || ''),
        crowdName: msg.crowdName || '',
        messageKind: isNarrationMessage(msg as any) ? 'narration' : msg.messageKind,
        message_kind: isNarrationMessage(msg as any) ? 'narration' : msg.message_kind,
        narrationProfileId: isNarrationMessage(msg as any) ? (msg.narrationProfileId || msg.narration_profile_id || '') : undefined,
        narrationProfileName: isNarrationMessage(msg as any) ? (msg.narrationProfileName || msg.narration_profile_name || '') : undefined,
        narrationProfileKind: isNarrationMessage(msg as any) ? (msg.narrationProfileKind || msg.narration_profile_kind || '') : undefined,
        includeInContext: isNarrationMessage(msg as any) ? (msg.includeInContext ?? msg.include_in_context ?? true) : undefined,
        include_in_context: isNarrationMessage(msg as any) ? (msg.include_in_context ?? msg.includeInContext ?? true) : undefined,
        autoWriteHidden: normalizePromptHiddenValue(msg.autoWriteHidden),
        auto_write_hidden: normalizePromptHiddenValue(msg.auto_write_hidden),
        autoWriteHiddenReason: msg.autoWriteHiddenReason,
        auto_write_hidden_reason: msg.auto_write_hidden_reason,
        versionList: nextVersionList,
        activeVersionIndex: nextVersionList.length - 1
      }

      await chatStore.editMessage(targetId, messageId, updatePayload)
      Object.assign(msg, updatePayload)
      const promptLogId = String((msg as MessageLike & { _promptLogId?: string })._promptLogId || '')
      if (promptLogId) {
        await deletePromptLogsForCurrentSession(targetId, messageId, promptLogId)
        await bindPromptLogForCurrentSession(targetId, promptLogId, messageId)
        delete (msg as MessageLike & { _promptLogId?: string })._promptLogId
      }
      await runPromptReplayMessageProjection({
        sessionId,
        messageId,
        speakerTarget,
        msg,
        isCapsPromptReplay
      })
      await finishMessageGenerationAttempt({
        sessionId,
        attemptId: generationAttemptId,
        status: 'completed',
        assistantMessageIds: [messageId],
        outputPromptLogId: promptLogId
      })
      if (generationAttemptId) {
        await createChatGenerationAttemptArtifactBySessionId(sessionId, {
          attemptId: generationAttemptId,
          artifactKind: 'prompt_replay',
          messageId,
          promptLogId,
          payload: {
            sourcePromptLogId: String(log.id || ''),
            versionIndex: nextVersionList.length - 1,
            capsPromptReplayUsesExistingNetworkState: isCapsPromptReplay
          }
        }).catch((error) => console.error('保存生成尝试产物失败:', error))
      }
    } catch (err: any) {
      await finishMessageGenerationAttempt({
        sessionId,
        attemptId: generationAttemptId,
        status: 'failed',
        error: err
      })
      if (err?.name !== 'AbortError') toast(`按原提示词重试失败: ${err?.message || err}`, 'error')
    } finally {
      setTyping(false)
      setCurrentMessageModel('')
      streamingText.value = ''
      regeneratingMessageIndex.value = -1
      await nextTick()
      scrollToBottom()
    }
  }

  async function regenerateMsg(
    index: number,
    mode: 'recall' | 'prompt_replay' = 'recall',
    // 批次M1b：导演重试附加上下文——instruction=hover 输入框的修改意见；correctionText=纠偏续跑的纠偏文本。
    // 仅单聊角色消息走导演重试时透传；旧路径（旁白/纯净/多角色）不使用。
    directorOptions: { instruction?: string; correctionText?: string } = {}
  ) {
    const msg = currentMessages.value[index]
    if (!msg || msg.role === 'user') return
    if (isFocusedActionMessage(msg)) {
      if (!msg.id || typeof regenerateFocusedAction !== 'function') {
        toast('这条动作消息缺少可恢复的提调入口', 'error')
        return
      }
      regeneratingMessageIndex.value = index
      try {
        await regenerateFocusedAction(Number(msg.id))
      } catch (error: any) {
        if (error?.name !== 'AbortError') toast(`动作重新生成失败: ${error?.message || error}`, 'error')
      } finally {
        regeneratingMessageIndex.value = -1
        await nextTick()
        scrollToBottom()
      }
      return
    }
    if (isCustomNarrationMessage(msg)) {
      await regenerateMsgWithPromptReplay(index, msg)
      return
    }
    if (isNarrationMessage(msg as any)) {
      await regenerateNarrationMsg(index, msg)
      return
    }
    if (mode === 'prompt_replay') {
      await regenerateMsgWithPromptReplay(index, msg)
      return
    }
    if (msg.versionList?.length) {
      msg.activeVersionIndex = msg.versionList.length - 1
    }

    const sessionTarget = getCurrentTargetId()
    const multiCharacterSession = isMultiCharacterSession(sessionTarget)
    const speakerTarget = multiCharacterSession ? (findCharacterIdByMessage(msg) || sessionTarget) : sessionTarget
    if (multiCharacterSession && speakerTarget === sessionTarget) {
      toast('这条会话消息没有匹配到对应角色，暂时无法重新生成', 'error')
      return
    }
    if (isCapsReplyMessage(msg)) {
      toast('CAPS 人格网络回复链路已退役，不能重新运行该消息', 'warning')
      return
    }
    regeneratingMessageIndex.value = index
    const speakerName = String(msg.memberName || msg.name || getTargetName(speakerTarget)).trim() || getTargetName(speakerTarget)
    const historyBefore = currentMessages.value.slice(0, index)
    const sessionId = getCurrentSessionId()
    const inputMessage = [...historyBefore].reverse().find((message) => message?.role === 'user') || null
    const inputMessageId = inputMessage?.id || 0
    invalidateRecallActivityPanelForMessages({
      sessionId,
      messageIds: [msg.id],
      mode: 'restart'
    })

    clearStopRequest()
    setTyping(true)
    setCurrentMessageModel('')
    streamingText.value = ''

    // 角色消息重试走真·导演 loop（编排决策流 + 角色镜 + 可停止），拿到正文后仍走下方现有版本写回。
    // U2 转正（2026-06-28·Option 2）：去掉 !multiCharacterSession 门——群聊角色消息重试也进提调
    //   （regenerateAssistantViaDirector 本就 speaker 感知：placeType single/group）。无源/带意见群聊重试由此进完整导演 loop。
    //   只有纯净回复（pure_prompt·单/群）shouldUseReplyWorkflowReply=false → 回退下方 else 老 callAIStream 直连。
    const useDirectorRetry = typeof regenerateAssistantViaDirector === 'function'
      && shouldUseReplyWorkflowReply(speakerTarget)
    // 批次2 步骤2b/2c：定向重掷优先——普通重试（无意见、非纠偏续跑）+ 有原轮已定方向源时，
    // 按原轮方向只重掷正文（不进导演 loop、不动决策流带）；单聊/群聊单条重试统一走此入口。
    // U2 转正：群聊单条重试由此替代老 callAIStream 直连；无源/带意见 → 落 useDirectorRetry 完整导演 loop（仍进提调）。
    const tryDirectedRecast = !String(directorOptions.instruction || '').trim()
      && !String(directorOptions.correctionText || '').trim()
      && typeof regenerateAssistantViaDirectedRecast === 'function'
      && shouldUseReplyWorkflowReply(speakerTarget)
    let generationAttemptId = ''
    try {
      generationAttemptId = await startMessageGenerationAttempt({
        sessionId,
        anchorMessageId: Number(inputMessageId || msg.id || 0),
        triggerType: 'assistant_message_retry',
        mode: 'clean',
        targetId: sessionTarget,
        speakerName
      })

      let normalizedReply = ''
      let usedModel = ''
      // O-B2·重生成接续累加：导演重试返回的「累加后完整快照」，落进 clean_retry artifact + 回填内存消息，
      // 让导演带一条记全程（首次→重生成N），刷新后历史复原走新带、切版本时带不变。
      let directorStreamSnapshot: TidiaoDirectorStream | null = null
      // 批次2 步骤2b/2c：先试定向重掷（成功则正文已就位，directorStreamSnapshot 保持 null=不动决策流带、不写新 clean_retry 带）。
      let directedRecastHandled = false
      if (tryDirectedRecast) {
        const recastResult = await regenerateAssistantViaDirectedRecast!(Number(msg.id || 0))
        // softstop = 软停/取消/空回复：不写回、不报错，保留旧版本。unavailable = 开关关/无源：降级现役路。
        if (recastResult.status === 'softstop') return
        if (recastResult.status === 'recast') {
          normalizedReply = recastResult.replyText
          usedModel = recastResult.model
          if (recastResult.promptLogId) {
            ;(msg as MessageLike & { _promptLogId?: string })._promptLogId = recastResult.promptLogId
          }
          directedRecastHandled = true
        }
      }
      if (directedRecastHandled) {
        // 定向重掷已取得正文，下方直接走现有版本写回（带不变）。
      } else if (useDirectorRetry) {
        const directorResult = await regenerateAssistantViaDirector!(Number(msg.id || 0), {
          instruction: directorOptions.instruction,
          correctionText: directorOptions.correctionText
        })
        // 返回 null = 软停挂起 / 取消 / 不适用：不写回、不报错，保留旧版本（编排带停在 correcting 态）。
        if (!directorResult) return
        normalizedReply = directorResult.replyText
        usedModel = directorResult.model
        directorStreamSnapshot = directorResult.directorStream || null
        if (directorResult.promptLogId) {
          ;(msg as MessageLike & { _promptLogId?: string })._promptLogId = directorResult.promptLogId
        }
      } else {
      const messages = await buildChatMessages(sessionTarget, '', historyBefore, speakerTarget)
      const usagePlace = getSessionUsagePlace(sessionTarget)

      let fullReply = ''
      const returnedText = await callAIStream(
        messages,
        {
          ...getAIOptions(speakerTarget),
          usageLabel: `重新生成：${speakerName}`,
          // 消耗溯源：并入原轮总账（roundId=该轮用户输入消息）。
          roundId: buildChatTurnRoundId(sessionId, Number(inputMessageId || 0)),
          unitKind: 'regenerate',
          placeLabel: usagePlace.label,
          placeType: usagePlace.type,
          onPromptPrepared: async ({ messages: preparedMessages, finalPrompt, promptBlocks }: {
            messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
            finalPrompt: string
            promptBlocks?: Array<{ role: 'system' | 'user' | 'assistant'; title: string; content: string }>
            preparedAt: string
          }) => {
            try {
              const result = await createPromptLogForCurrentSession(sessionTarget, {
                speakerName,
                targetId: speakerTarget,
                finalPrompt,
                promptBlocks: promptBlocks ?? buildPromptBlocksFromPreparedMessages(preparedMessages, 'assistant-message-retry-messages')
              })
              ;(msg as MessageLike & { _promptLogId?: string })._promptLogId = String(result.id || '')
              await persistRecallActivityForCurrentSession({
                sessionId,
                targetId: speakerTarget,
                speakerName,
                inputMessageId: Number(inputMessageId || 0),
                assistantMessageId: 0
              })
            } catch (error) {
              console.error('记录重试提示词日志失败:', error)
            }
          }
        },
        (chunk: string) => {
          fullReply += chunk
          streamingText.value = fullReply
          scrollToBottom()
        },
        {
          onModelInfo: (model: string) => {
            usedModel = model
            setCurrentMessageModel(model)
          }
        }
      )

      const normalizedStreamReply = normalizeAiOutputText(returnedText || fullReply)
      normalizedReply = multiCharacterSession
        ? keepCurrentSpeakerOnly(cleanAiPrefix(normalizedStreamReply), speakerName)
        : cleanAiPrefix(normalizedStreamReply)
      }
      if (!hasVisibleAiReplyBody(normalizedReply)) {
        toast('模型没有返回可显示的回复，请稍后重试或换个预设', 'warning')
        return
      }

      const previousVersions = normalizeVersionList(msg)
      const nextVersionList = [
        ...previousVersions,
        {
          content: normalizedReply,
          time: new Date().toLocaleTimeString(),
          model: usedModel,
          memberName: multiCharacterSession ? speakerName : '',
          crowdName: msg.crowdName || '',
          createdAt: new Date().toISOString()
        }
      ]

      const updatePayload = {
        content: normalizedReply,
        time: new Date().toLocaleTimeString(),
        model: usedModel,
        memberName: multiCharacterSession ? speakerName : '',
        crowdName: msg.crowdName || '',
        versionList: nextVersionList,
        activeVersionIndex: nextVersionList.length - 1
      }

      if (msg.id) {
        await chatStore.editMessage(sessionTarget, msg.id, updatePayload)
        msg.content = updatePayload.content
        msg.time = updatePayload.time
        msg.model = updatePayload.model
        msg.memberName = updatePayload.memberName
        msg.versionList = updatePayload.versionList
        msg.activeVersionIndex = updatePayload.activeVersionIndex
        // O-B2：回填内存消息 processTrace.directorStream = 累加快照——刷新前导演带即显示「含本次重生成」的累加记录
        // （editMessage 不动 processTrace；processTrace 不落后端，跨刷新靠下方 clean_retry artifact 复原）。
        if (directorStreamSnapshot) {
          const msgRecord = msg as unknown as Record<string, unknown>
          const existingTrace = (msgRecord._processTrace || msgRecord.processTrace || {}) as Record<string, unknown>
          msgRecord._processTrace = { ...existingTrace, directorStream: directorStreamSnapshot }
        }
        const promptLogId = String((msg as MessageLike & { _promptLogId?: string })._promptLogId || '')
        if (promptLogId) {
          await deletePromptLogsForCurrentSession(sessionTarget, Number(msg.id), promptLogId)
          await bindPromptLogForCurrentSession(sessionTarget, promptLogId, Number(msg.id))
          delete (msg as MessageLike & { _promptLogId?: string })._promptLogId
        }
        await persistRecallActivityForCurrentSession({
          sessionId,
          targetId: speakerTarget,
          speakerName,
          inputMessageId: Number(inputMessageId || 0),
          assistantMessageId: Number(msg.id)
        })
        await finishMessageGenerationAttempt({
          sessionId,
          attemptId: generationAttemptId,
          status: 'completed',
          assistantMessageIds: [Number(msg.id)],
          outputPromptLogId: promptLogId
        })
        if (generationAttemptId) {
          // 批次1(D)·续接带原始指令（重试路径补接）：把「用户原始重试意见」纯原文落进 processSummary.userInstruction，
          // 与纠偏路径同一字段、同一读回器（resolveMessageDirectorOriginalInstruction 按 messageId 捞最新）——
          // 重试某条消息被中断后续接（走纠偏路径捞回），也能高权重回灌用户的原始重试意见，不再走通用兜底。
          const retryUserInstruction = String(directorOptions.instruction || '').trim()
          const retryProcessSummary = (directorStreamSnapshot || retryUserInstruction)
            ? {
                processSummary: {
                  steps: {},
                  ...(directorStreamSnapshot ? { directorStream: directorStreamSnapshot } : {}),
                  ...(retryUserInstruction ? { userInstruction: retryUserInstruction } : {})
                }
              }
            : {}
          await createChatGenerationAttemptArtifactBySessionId(sessionId, {
            attemptId: generationAttemptId,
            artifactKind: 'clean_retry',
            messageId: Number(msg.id),
            promptLogId,
            // O-B2：带上累加后的导演带快照（无步骤轴，只有 directorStream），刷新后历史复原走新带累加记录。
            payload: {
              versionIndex: nextVersionList.length - 1,
              ...retryProcessSummary
            }
          }).catch((error) => console.error('保存生成尝试产物失败:', error))
        }
      } else {
        msg.content = updatePayload.content
        msg.time = updatePayload.time
        msg.model = updatePayload.model
        msg.memberName = updatePayload.memberName
        msg.versionList = updatePayload.versionList
        msg.activeVersionIndex = updatePayload.activeVersionIndex
      }

    } catch (err: any) {
      await finishMessageGenerationAttempt({
        sessionId,
        attemptId: generationAttemptId,
        status: 'failed',
        error: err
      })
      if (err?.name !== 'AbortError') toast(`重新生成失败: ${err?.message || err}`, 'error')
    } finally {
      setTyping(false)
      setCurrentMessageModel('')
      streamingText.value = ''
      regeneratingMessageIndex.value = -1
      await nextTick()
      scrollToBottom()
    }
  }

  // 批次 M3：把一条精修结果写回为该消息的新版本（复用 versionList，可切版本回滚；不破坏历史）。
  // options.reuseLatest（批次1·即时落库）：true 时不追加新版本，而是更新「最近一个版本」的内容——
  // 用于同一条消息在一轮纠偏/精修里多次改时，复用本轮已建的那个新版本、不每步堆一个版本（首次写应传 false 追加）。
  async function writeMessagePrecisionEditVersion(messageId: number, newContent: string, options: { reuseLatest?: boolean } = {}) {
    const sessionTarget = getCurrentTargetId()
    const index = currentMessages.value.findIndex((m) => Number(m?.id || 0) === Number(messageId))
    if (index < 0) return
    const msg = currentMessages.value[index]
    if (!msg || !msg.id) return
    // 版本载荷构建走共享核心（批次3b 抽取·一处真值·联动 xingyiTidiaoDispatchTools 会话级写回）。
    const built = buildChatMessageEditVersionPayload(msg, newContent, options)
    const updatePayload = { ...built, versionList: built.versionList as unknown as MessageVersionLike[] }
    await chatStore.editMessage(sessionTarget, msg.id, updatePayload)
    msg.content = updatePayload.content
    msg.time = updatePayload.time
    msg.versionList = updatePayload.versionList
    msg.activeVersionIndex = updatePayload.activeVersionIndex
  }

  // 批次P3a·中策重生成写回：据(原/改后)提示词重生成的新正文作新版本写回（复用 versionList 可回滚），
  // 并把本次重生成新建的 promptLog 重绑这条消息（解绑旧 + 绑新），让后续「按原提示重试」用新提示词、切版本不丢。
  async function writeMessageRegenVersion(messageId: number, newContent: string, promptLogId: string, options: { reuseLatest?: boolean } = {}) {
    await writeMessagePrecisionEditVersion(messageId, newContent, options)
    const trimmedLogId = String(promptLogId || '').trim()
    if (!trimmedLogId) return
    const targetId = getCurrentTargetId()
    try {
      await deletePromptLogsForCurrentSession(targetId, messageId, trimmedLogId)
      await bindPromptLogForCurrentSession(targetId, trimmedLogId, messageId)
    } catch (error) {
      console.error('纠偏重生成提示词日志重绑失败:', error)
    }
  }

  // 即时落库写回（批次1·2026-06-22）：纠偏/精修每完成一步当场写回；liveVersionedIds 记录「本轮已为哪些消息建过新版本」，
  // 同一条第二次起复用同一版本（reuseLatest），避免一轮内多步堆一串版本。per-step 回调与收尾兜底共享同一个 set → 幂等。
  async function writeMessageEditVersionLive(messageId: number, newContent: string, liveVersionedIds: Set<number>) {
    const id = Number(messageId)
    await writeMessagePrecisionEditVersion(id, newContent, { reuseLatest: liveVersionedIds.has(id) })
    liveVersionedIds.add(id)
  }
  // 即时落库·中策重生成版（复用 writeMessageEditVersionLive 的版本复用语义 + promptLog 重绑）。
  // 无可见正文（模型没吐有效内容）不写回，返回 false 让调用方提示并保留原内容、绝不静默清空。
  async function writeMessageRegenVersionLive(messageId: number, newContent: string, promptLogId: string, liveVersionedIds: Set<number>): Promise<boolean> {
    if (!hasVisibleAiReplyBody(String(newContent || ''))) return false
    const id = Number(messageId)
    await writeMessageRegenVersion(id, newContent, promptLogId, { reuseLatest: liveVersionedIds.has(id) })
    liveVersionedIds.add(id)
    return true
  }

  // 重投影（用户 2026-06-21）：提调标记需重投的消息，**必须在改原文写回 DB 之后**调用——
  // runChatMessageProjectionBySessionId 读 DB 里的消息内容基于新原文重生成投影，先写回才拿得到新文。失败逐条吞错、不阻断。
  // 精修 loop（applyDirectorPrecisionEdits）与纠偏三策上策（runDirectorCorrection）共用此helper。
  async function reprojectMarkedTargets(reprojectTargets?: Array<{ messageId: number; ref?: string }>) {
    const targets = Array.isArray(reprojectTargets) ? reprojectTargets : []
    if (!targets.length) return
    const sessionId = getCurrentSessionId()
    if (!sessionId) return
    let reprojected = 0
    for (const t of targets) {
      const messageId = Number(t?.messageId || 0)
      if (messageId <= 0) continue
      try {
        await runChatMessageProjectionBySessionId(sessionId, messageId, { promptLogMode: 'background' })
        reprojected += 1
      } catch (error) {
        console.error('提调重投影失败：', t?.ref, error)
      }
    }
    if (reprojected > 0) toast(`提调重投影了 ${reprojected} 条消息`, 'success')
  }

  // 批次P3a·纠偏三策路由：跑提调三策统一 loop（提调自主上→中→下择优），据返回 strategy 落地——
  // 上策 direct-edit / 中策 prompt-regen 落新版本写回（可回滚）；下策 escalate（或不支持）返回 false 交调用方转现役 replan 重排。
  // 返回 true = 已处理完（上/中策写回，或软停已出纠偏框）；false = 该转 replan（下策/不支持）。
  async function runDirectorCorrection(
    targetMessageId: number,
    correctionText: string,
    // 批次1(D)：userInstruction = 要落库的「用户原始纠偏指令」纯原文（续接时显式传，防把续接说明当原始指令再存）。
    options: { anchorMessageId?: number; userInstruction?: string; allowUnanchoredChat?: boolean } = {}
  ): Promise<boolean> {
    if (typeof correctChatMessageViaDirector !== 'function') return false
    // B3：中策「依提示词重生成整条消息」执行到重生成那一步时，把目标消息切到现有重试占位（复用 regeneratingMessageIndex + isTyping）。
    // 上策(直接改原文)走精修光带、下策(escalate→regenerateMsg)自带占位，均不触发此回调；
    // 占位保持到下方写回新版本后，由 finally 统一复位，避免回填前闪回旧正文。
    let regenPlaceholderActive = false
    const beginRegenPlaceholder = (messageId: number) => {
      const idx = currentMessages.value.findIndex((m) => Number(m?.id || 0) === Number(messageId))
      if (idx < 0) return
      clearStopRequest()
      regeneratingMessageIndex.value = idx
      setTyping(true)
      setCurrentMessageModel('')
      streamingText.value = ''
      regenPlaceholderActive = true
    }
    // 即时落库（批次1）：本轮已为哪些消息建过新版本，per-step 回调与收尾兜底共享，避免同条堆版本。
    // regenHandledIds 记录「已由 per-step 回调处理过的重生成消息」，收尾兜底据此跳过，避免重复写/重复 toast。
    const liveVersionedIds = new Set<number>()
    const regenHandledIds = new Set<number>()
    try {
      const result = await correctChatMessageViaDirector(targetMessageId, {
        correctionText,
        ...options,
        onRegenerateBegin: beginRegenPlaceholder,
        // 即时落库（批次1）：上策每改完一条原文当场写回新版本——中途停止/异常终止时已改的也已落库、不再丢。
        onEditCommitted: (edit) => writeMessageEditVersionLive(edit.messageId, edit.content, liveVersionedIds),
        // 即时落库（批次1）：中策每重生成完一条当场写回新版本（无可见正文则保留原内容并提示）。
        onRegenerated: async (regen) => {
          regenHandledIds.add(Number(regen.messageId))
          const ok = await writeMessageRegenVersionLive(regen.messageId, regen.content, regen.promptLogId, liveVersionedIds)
          if (!ok) toast(`「${regen.speakerName || '这条消息'}」重生成没拿到有效内容，已保留原内容，请稍后再试`, 'error')
        }
      })
      // 返回 null = 软停挂起(已写 pending+出纠偏框) / 取消 / 无目标：由上层挂起流程接管，不再转 replan。
      // 注意：即便此处 result 为 null（软停/取消），上策改原文/中策重生成已在 loop 内经 onEditCommitted/onRegenerated 即时落库。
      if (!result) return true
      // Batch 1（2026-06-29）：群聊 escalate 已由 pipeline **就地整轮无缝重排完成**（同 run/band·重判情境+逐角色重排）→ 当已处理、不再冷启动。
      // 单聊 escalate 仍返回 false → 回退现役 regenerateMsg('recall') 整轮重判重排（Batch 3 再对齐无缝）。
      if (result.strategy === 'escalate') return result.escalationHandledInline === true
      // 续回统筹（2026-07-08）：pipeline 已就地带保留上下文重进统筹续跑（或锚定失败已 toast 说明）——
      // 一律当已处理、绝不回退 replan（回退会删/重排已保留消息，与续接语义相悖）；续跑轮自己落库，这里不再重复 persist。
      if (result.strategy === 'resume-orchestration') return true
      // 收尾兜底：未被 per-step 回调覆盖到的（如未传回调的调用方）补写一遍，已覆盖的跳过（幂等、不重复 toast）。
      if (result.strategy === 'direct-edit') {
        for (const edit of result.edits) {
          if (liveVersionedIds.has(Number(edit.messageId))) continue
          await writeMessageEditVersionLive(edit.messageId, edit.content, liveVersionedIds)
        }
      } else if (result.strategy === 'prompt-regen') {
        for (const regen of result.regenerations) {
          if (regenHandledIds.has(Number(regen.messageId))) continue
          // B4·失败闭环(a)(b)：无可见正文 → 不写回（保留原版本=回退原消息），顶部提示，绝不静默清空原文。
          const ok = await writeMessageRegenVersionLive(regen.messageId, regen.content, regen.promptLogId, liveVersionedIds)
          if (!ok) toast(`「${regen.speakerName || '这条消息'}」重生成没拿到有效内容，已保留原内容，请稍后再试`, 'error')
        }
      }
      // 上策改原文后提调标记需重投的消息：写回 DB 后重跑投影生成（escalate 早返回 false、不到这里；中策重生成也可标记）。
      await reprojectMarkedTargets(result.reprojectTargets)
      // Q3：新增旁白（create-narration，或与上/中策并存）已由接缝在 loop 内写库 + 本地插入，
      // 是新消息而非改版，无需 versionList；这里只随后续 nextTick/scrollToBottom 刷新列表。
      if (result.narrationCreations?.length) {
        toast(`提调新增了 ${result.narrationCreations.length} 段旁白`, 'success')
      }
      // 2026-07-06 纠偏生成新角色消息（castSeam）：消息本体已由正常角色链路写库+插列表，这里只提示结果。
      const castCreations = (result as { castCreations?: Array<{ speakerName: string; ok: boolean; message?: string }> }).castCreations || []
      const okCasts = castCreations.filter((creation) => creation.ok)
      const failedCasts = castCreations.filter((creation) => !creation.ok)
      if (okCasts.length) {
        toast(`提调新增了 ${okCasts.length} 条角色消息（${okCasts.map((creation) => creation.speakerName).join('、')}）`, 'success')
      }
      for (const failed of failedCasts) {
        toast(`「${failed.speakerName}」的新消息生成失败：${failed.message || '未知错误'}，可在提调框说「重试」`, 'error')
      }
      if (result.directorStream && Number(result.anchorAssistantMessageId || 0) > 0) {
        await persistPrecisionEditDirectorStream(Number(result.anchorAssistantMessageId), result.directorStream)
      }
      await nextTick()
      scrollToBottom()
      return true
    } catch (err: any) {
      // B4·失败闭环：重生成那一步真错误（模型/网络异常抛出）。原消息从未被覆盖（writeback 仅成功时执行）= 回退保留原内容(a)；
      // 顶部提示(b)；决策带已在 pipeline 侧 markTidiaoDirectorStreamRoundFailed 停在 failed（不消失、报错回灌模型可重试）(c)，
      // 这里吞掉异常避免组件层 fire-and-forget 的未捕获 rejection，并返回 true（已处理失败，不再回退 replan 二次触发）。
      if (err?.name === 'AbortError') return true
      toast(`提调纠偏失败：${err?.message || err}`, 'error')
      return true
    } finally {
      if (regenPlaceholderActive) {
        setTyping(false)
        setCurrentMessageModel('')
        streamingText.value = ''
        regeneratingMessageIndex.value = -1
      }
    }
  }

  // 纠偏续跑用：找上一轮可纠偏的角色消息（最近一条非用户、非旁白、非 CAPS 的助手消息）。无则 -1。
  function findLastDirectorCorrectableIndex(): number {
    const list = currentMessages.value
    for (let i = list.length - 1; i >= 0; i -= 1) {
      const m = list[i]
      if (!m || m.role === 'user') continue
      const messageKind = String((m as any).messageKind ?? (m as any).message_kind ?? '').trim()
      if (messageKind === 'narration_debug') continue
      if (isNarrationMessage(m as any) || isCustomNarrationMessage(m)) continue
      if (isCapsReplyMessage(m)) continue
      return i
    }
    return -1
  }

  // 批次1(D)：从已落库提调带读回这条消息的「用户原始纠偏指令」（注入接缝缺失时返回空串，不阻断）。
  async function recoverDirectorOriginalInstruction(messageId: number): Promise<string> {
    if (typeof resolveDirectorOriginalInstruction !== 'function' || Number(messageId || 0) <= 0) return ''
    try {
      return String(await resolveDirectorOriginalInstruction(Number(messageId)) || '').trim()
    } catch {
      return ''
    }
  }

  // 批次3·提调会话续接：提调框输入「继续」类整句时调用——续接上一轮被中断的提调任务，凭已落库记忆续跑。
  async function resumeDirectorSession(): Promise<boolean> {
    // ① 内存挂起态（现役=askUser 提问态）→ 走现成续跑。
    const pending = getPendingCorrection()
    if (pending) {
      // 批次1(D)：pending.correction 常为空（原始指令没存进 pending），按优先级捞回纯原始指令高权重回灌
      //（续接不丢用户的「旁白扩充500字」这类命令）：① pending.correction → ② 已落库 artifact（按目标消息捞回）。
      // 都捞不到退化为通用续接说明。
      let original = String(pending.correction || '').trim()
      if (!original) {
        original = await recoverDirectorOriginalInstruction(Number(pending.correctionTargetMessageId || 0))
      }
      updateCorrectionText(buildDirectorResumeInstruction(original))
      await continueCorrection()
      return true
    }
    // ② 异常终止/刷新后无挂起态 → 凭已落库记忆重规划续跑：对最近一条可纠偏角色消息发续接指令，
    //    correctChatMessageViaDirector 会读它已落库的决策流（批次2）当 carryOver、读已改消息现状（批次1）当 targets → 提调据记忆继续。
    if (typeof correctChatMessageViaDirector !== 'function') {
      toast('当前环境不支持提调续接', 'warning')
      return false
    }
    const lastIndex = findLastDirectorCorrectableIndex()
    if (lastIndex < 0) {
      toast('没有可续接的提调任务，请先发起一次提调修改', 'warning')
      return false
    }
    const targetMessageId = Number(currentMessages.value[lastIndex]?.id || 0)
    if (targetMessageId <= 0) {
      toast('没有可续接的提调任务', 'warning')
      return false
    }
    // 批次1(D)：读回原始纠偏指令 → 高权重回灌进续接指令；userInstruction 显式传纯原始指令（防把续接说明当原始指令再存、防嵌套）。
    const original = await recoverDirectorOriginalInstruction(targetMessageId)
    return await runDirectorCorrection(targetMessageId, buildDirectorResumeInstruction(original), { userInstruction: original })
  }

  // 持久纠偏栏入口（智能二选一，用户 2026-06-20 拍板）：
  // - 带楼层号「角色N/旁白M（含范围/多目标）」→ 走提调精修 loop，按楼层把每条改动逐条作新版本写回。
  // - 不带楼层号 → 把整段当纠偏，对上一轮导演决策流纠偏续跑（旧决策保留、新决策追加、决策流不消失）。
  // directorOptions.correctionText 非空 = 精修软停后的续跑续改，仍走精修路径（不重判路由）。
  async function applyDirectorPrecisionEdits(
    refsText: string,
    directorOptions: { correctionText?: string; anchorMessageId?: number } = {}
  ): Promise<boolean> {
    const text = String(refsText || '').trim()
    if (!text) return false
    const isContinuation = String(directorOptions.correctionText || '').trim().length > 0
    // 批次3·会话续接：提调框输入「继续」类整句 → 续接上一轮被中断的提调任务（凭已落库记忆续跑），不当新纠偏。
    // 注意：必须先于下面的「挂起态收尾」分支——「继续」是续接关键字，要走 resumeDirectorSession 的
    // 高权重原始指令回灌（它内部也会处理挂起态）；否则会被当成纠偏文本「继续」喂进去。
    if (!isContinuation && isDirectorResumeText(text)) {
      return await resumeDirectorSession()
    }
    // 橄榄绿提调框统一入口（2026-06-22）：内联纠偏框已退役，提调对话只走本输入框。
    // 若当前有挂起态（现役=提调「问用户」提问态），这次输入即收尾续跑这一挂起轮——
    // 走 continueCorrection（把「问用户的问题 + 本次答复」回灌提调续跑），而非起一轮全新纠偏。
    // 续跑路径自身（isContinuation=true）已清挂起态，不会再次命中本分支（无递归）。
    if (!isContinuation && getPendingCorrection()) {
      updateCorrectionText(text)
      await continueCorrection()
      return true
    }
    if (!isContinuation && parseChatFloorRefs(text).length === 0) {
      const lastIndex = findLastDirectorCorrectableIndex()
      if (lastIndex < 0) {
        // 提调框就是和提调 Agent 说话：即使尚无角色楼层，也用最近一条非调试消息作锚启动正式 loop。
        // targets 为空只是“没有默认修改对象”，不再等价于“不唤起 Agent”。
        const anchorIndex = [...currentMessages.value]
          .map((message, index) => ({ message, index }))
          .reverse()
          .find(({ message }) => Number(message?.id || 0) > 0
            && String((message as any)?.messageKind ?? (message as any)?.message_kind ?? '').trim() !== 'narration_debug')
          ?.index ?? -1
        const anchorMessageId = Number(currentMessages.value[anchorIndex]?.id || 0)
        if (anchorMessageId > 0 && typeof correctChatMessageViaDirector === 'function') {
          return await runDirectorCorrection(anchorMessageId, text, {
            anchorMessageId,
            allowUnanchoredChat: true
          })
        }
        toast('当前会话还没有可挂载提调回复的消息，请先发送一条聊天消息', 'warning')
        return false
      }
      // 批次P3a：自由文本纠偏先走「三策统一 loop」（提调自主 上策改原文→中策改提示词/按原提示重生成→下策重排 择优）；
      // 下策升级 / 不支持 → 回退现役下策「整轮重判情境重排」（regenerateMsg 带 correctionText）。
      const targetMessageId = Number(currentMessages.value[lastIndex]?.id || 0)
      if (targetMessageId > 0 && typeof correctChatMessageViaDirector === 'function') {
        const handled = await runDirectorCorrection(targetMessageId, text)
        if (handled) return true
      }
      await regenerateMsg(lastIndex, 'recall', { correctionText: text })
      return true
    }
    if (typeof editChatMessagesViaDirector !== 'function') {
      toast('当前环境不支持提调精修', 'warning')
      return false
    }
    // 即时落库（批次1）：每精改完一条原文当场写回新版本——中途停止/异常终止时已改的也已落库、不再丢。
    const liveVersionedIds = new Set<number>()
    const result = await editChatMessagesViaDirector(String(refsText || ''), {
      ...directorOptions,
      onEditCommitted: (edit) => writeMessageEditVersionLive(edit.messageId, edit.content, liveVersionedIds)
    })
    // 返回 null = 软停挂起 / 取消 / 无可解析目标（pipeline 已 toast/出纠偏框）：不写回。
    // 注意：即便此处 result 为 null（软停/取消），已精改的原文已在 loop 内经 onEditCommitted 即时落库。
    if (!result) return false
    const reprojectTargets = Array.isArray(result.reprojectTargets) ? result.reprojectTargets : []
    if (!result.edits.length && !reprojectTargets.length) return false
    // 收尾兜底（批次1）：每条精改已在 loop 内经 onEditCommitted 当场写回；未被覆盖的（如未传回调）补写、已覆盖的跳过（幂等）。
    for (const edit of result.edits) {
      if (liveVersionedIds.has(Number(edit.messageId))) continue
      await writeMessageEditVersionLive(edit.messageId, edit.content, liveVersionedIds)
    }
    // 重投影（用户 2026-06-21）：提调判断原文改动大、投影过时而标记的消息，等精修写回 DB 后再基于新内容重跑投影生成。
    await reprojectMarkedTargets(reprojectTargets)
    // 接续落库：把精修导演带「接续后的完整快照」落到最近一轮角色消息那条带（复用 O-B2 clean_retry · directorStream 范式），
    // 刷新后该轮历史复原走新带、含本次精修接续记录（不再 ephemeral 丢失）。
    if (result.directorStream && Number(result.anchorAssistantMessageId || 0) > 0) {
      await persistPrecisionEditDirectorStream(Number(result.anchorAssistantMessageId), result.directorStream)
    }
    await nextTick()
    scrollToBottom()
    return true
  }

  // 精修/纠偏导演带接续落库：把累加后的完整快照写到「该轮的用户消息」（批次3·统一锚到用户消息 2026-06-22，
  // 与实时带、producer 即时落库、读侧锚点一致）——内存回填 _processTrace（刷新前即显示接续记录）
  // + 写 clean_retry · directorStream-only artifact（刷新后历史复原走新带；O-B2 复原门禁已支持无步骤轴的此类 artifact）。
  // 不改该消息内容/版本（精修改动落在各目标消息的新版本里，本函数只接续导演带的编排史）。
  // 注：入参 messageId 来自 producer 返回的 anchorAssistantMessageId（值已改为该轮用户消息 id），无需本处再换锚。
  async function persistPrecisionEditDirectorStream(messageId: number, directorStream: TidiaoDirectorStream) {
    const sessionTarget = getCurrentTargetId()
    const sessionId = getCurrentSessionId()
    const index = currentMessages.value.findIndex((m) => Number(m?.id || 0) === Number(messageId))
    if (index < 0) return
    const msg = currentMessages.value[index]
    if (!msg || !msg.id) return
    // 内存回填：刷新前导演带即显示接续后的快照。
    const msgRecord = msg as unknown as Record<string, unknown>
    const existingTrace = (msgRecord._processTrace || msgRecord.processTrace || {}) as Record<string, unknown>
    msgRecord._processTrace = { ...existingTrace, directorStream }
    if (!sessionId) return
    // 跨刷新：写 clean_retry artifact（只带 directorStream，无步骤轴；O-B2 已放宽门禁复原）。
    const speakerName = String(msg.memberName || msg.name || getTargetName(sessionTarget)).trim() || getTargetName(sessionTarget)
    const attemptId = await startMessageGenerationAttempt({
      sessionId,
      anchorMessageId: Number(messageId),
      triggerType: 'assistant_message_retry',
      mode: 'clean',
      targetId: sessionTarget,
      speakerName
    })
    if (!attemptId) return
    await finishMessageGenerationAttempt({
      sessionId,
      attemptId,
      status: 'completed',
      assistantMessageIds: [Number(messageId)]
    })
    await createChatGenerationAttemptArtifactBySessionId(sessionId, {
      attemptId,
      artifactKind: 'clean_retry',
      messageId: Number(messageId),
      promptLogId: '',
      payload: { processSummary: { steps: {}, directorStream } }
    }).catch((error) => console.error('精修导演带接续落库失败:', error))
  }

  function startEditMessage(index: number) {
    const msg = currentMessages.value[index]
    if (msg?.versionList?.length) {
      msg.activeVersionIndex = msg.versionList.length - 1
    }
    editingMessageIndex.value = index
    editingMessageContent.value = currentMessages.value[index]?.content || ''
  }

  function saveEditMessage(index?: number) {
    const messageIndex = resolveEditingIndex(index)
    if (!isValidMessageIndex(messageIndex)) {
      toast('这条消息的编辑状态已失效，请重新点编辑后再保存。', 'warning')
      return
    }
    const msg = currentMessages.value[messageIndex]
    const newContent = editingMessageContent.value.trim()
    const versionList = normalizeVersionList(msg)
    const activeVersionIndex = msg?.versionList?.length ? Math.max(versionList.length - 1, 0) : undefined
    const nextVersionList = msg?.versionList?.length
      ? versionList.map((item, itemIndex) => (itemIndex === versionList.length - 1 ? { ...item, content: newContent, time: msg.time || item.time || '' } : item))
      : undefined

    if (msg && msg.id) {
      chatStore.editMessage(getCurrentTargetId(), msg.id, {
        content: newContent,
        versionList: nextVersionList,
        activeVersionIndex
      })
    } else if (msg) {
      msg.content = newContent
      if (nextVersionList) {
        msg.versionList = nextVersionList
        msg.activeVersionIndex = activeVersionIndex
      }
    }

    editingMessageIndex.value = -1
  }

  function cancelEditMessage() {
    editingMessageIndex.value = -1
  }

  function hasRegeneratedAssistantMessage(value: unknown): boolean {
    // 多人会话重试走 runGroupChat，返回的是本轮成功回复条数（数字）；正数即代表至少产出了一条回复。
    if (typeof value === 'number') return Number.isFinite(value) && value > 0
    if (!value || typeof value !== 'object') return false
    const record = value as Record<string, unknown>
    const firstMessageId = Number(record.firstMessageId || 0)
    if (Number.isFinite(firstMessageId) && firstMessageId > 0) return true
    const assistantMessageIds = Array.isArray(record.assistantMessageIds) ? record.assistantMessageIds : []
    return assistantMessageIds.some((id) => {
      const messageId = Number(id || 0)
      return Number.isFinite(messageId) && messageId > 0
    })
  }

  async function saveAndRegenerate(index?: number) {
    const messageIndex = resolveEditingIndex(index)
    const newContent = editingMessageContent.value.trim()
    if (!isValidMessageIndex(messageIndex)) {
      toast('这条消息的编辑状态已失效，请重新点编辑后再保存并重新生成。', 'warning')
      return
    }
    if (!newContent) {
      toast('消息内容不能为空，不能重新生成。', 'warning')
      return
    }

    const target = getCurrentTargetId()
    const sessionId = getCurrentSessionId()
    const msg = currentMessages.value[messageIndex]
    if (!target) {
      toast('当前会话还没准备好，请重新选择聊天对象后再试。', 'warning')
      return
    }
    if (!msg || msg.role !== 'user') {
      toast('只有用户消息可以保存并重新生成。', 'warning')
      return
    }

    stopActiveReplyRuntime()

    if (msg && msg.id) {
      await chatStore.editMessage(target, msg.id, newContent)
    } else if (msg) {
      msg.content = newContent
    }

    const toDelete = currentMessages.value.slice(messageIndex + 1)
    const previousAttempt = sessionId && msg?.id
      ? await fetchLatestChatGenerationAttemptByAnchor(sessionId, Number(msg.id || 0))
      : null
    const parentAttemptId = String(previousAttempt?.id || '')
    if (parentAttemptId && sessionId) {
      await createChatGenerationAttemptArtifactBySessionId(sessionId, {
        attemptId: parentAttemptId,
        artifactKind: 'superseded_messages',
        messageId: Number(msg.id || 0),
        payload: {
          triggerMessageId: Number(msg.id || 0),
          replacedMessageIds: toDelete.map((message) => Number(message.id || 0)).filter((id) => id > 0),
          replacedMessages: toDelete.map((message) => ({
            id: message.id,
            role: message.role,
            content: message.content,
            messageKind: message.messageKind ?? message.message_kind ?? 'chat',
            memberName: message.memberName ?? message.name ?? '',
            model: message.model ?? '',
            versionList: Array.isArray(message.versionList) ? message.versionList : [],
            activeVersionIndex: Number.isInteger(message.activeVersionIndex) ? message.activeVersionIndex : 0
          }))
        }
      }).catch((error) => console.error('保存旧生成内容快照失败:', error))
    }
    const replacedMessageIds = toDelete.map((message) => Number(message.id || 0)).filter((id) => id > 0)
    // 两种工作流模式（normal_recall / personality_model）统一：点击后下游消息立刻从显示中消失，
    // DB 删除推迟到重放成功之后；失败则回滚显示。旧的“先逐条 await 删库再重发”会让消息一条条消失并卡住入口。
    const shouldKeepOldMessagesUntilReplaySucceeds = shouldUseReplyWorkflowReply(target) && typeof resendUserMessage === 'function'
    let rollbackHiddenMessages: (() => void) | null = null
    const deleteDownstreamMessages = async () => {
      invalidateRecallActivityPanelForMessages({
        sessionId,
        messageIds: [msg.id, ...toDelete.map((message) => message.id)],
        mode: 'restart'
      })
      for (const m of toDelete) {
        if (m.id) await chatStore.deleteMessage(target, m.id)
      }
      if (shouldKeepOldMessagesUntilReplaySucceeds) {
        const replacedIds = new Set(replacedMessageIds)
        refreshDisplayedMessages(
          target,
          sessionId,
          currentMessages.value.filter((message) => !replacedIds.has(Number(message.id || 0)))
        )
      } else {
        currentMessages.value.splice(messageIndex + 1)
      }
    }
    if (!shouldKeepOldMessagesUntilReplaySucceeds) {
      await deleteDownstreamMessages()
    } else {
      rollbackHiddenMessages = hideDownstreamMessagesForReplay({
        target,
        sessionId,
        anchorIndex: messageIndex,
        replacedMessageIds
      })
    }
    editingMessageIndex.value = -1
    editingMessageContent.value = ''

    if (typeof resendUserMessage === 'function') {
      let replayResult: unknown
      try {
        replayResult = await resendUserMessage(newContent, Number(msg.id || 0), { parentAttemptId, replacedMessageIds })
      } catch (error) {
        if (shouldKeepOldMessagesUntilReplaySucceeds && rollbackHiddenMessages) {
          rollbackHiddenMessages()
          // 批次5 5a 补丁3：用户主动停止不算失败，静默还原原回复，不弹「重新生成失败」。
          if (!isStopRequested() && (error as { name?: string } | null)?.name !== 'AbortError') {
            toast('重新生成失败，已保留原回复。', 'warning')
          }
          return
        }
        throw error
      }
      if (shouldKeepOldMessagesUntilReplaySucceeds) {
        if (hasRegeneratedAssistantMessage(replayResult)) {
          await deleteDownstreamMessages()
        } else {
          rollbackHiddenMessages?.()
          // 用户主动停止时 pipeline 识别 abort 后返回空结果（无新回复），这里同样静默还原、不报失败。
          if (!isStopRequested()) {
            toast('重新生成失败，已保留原回复。', 'warning')
          }
        }
      }
      return
    }

    const multiCharacterSession = isMultiCharacterSession(target)
    if (multiCharacterSession) {
      if (!runGroupChatReplay) {
        toast('多人会话重新生成能力暂不可用', 'error')
        return
      }
      clearStopRequest()
      streamingText.value = ''
      await runGroupChatReplay(target, newContent)
      return
    }

    clearStopRequest()
    setTyping(true)
    setCurrentMessageModel('')
    streamingText.value = ''

    let generationAttemptId = ''
    try {
      const messages = await buildChatMessages(target, newContent)
      const usagePlace = getSessionUsagePlace(target)
      generationAttemptId = await startMessageGenerationAttempt({
        sessionId,
        anchorMessageId: Number(msg.id || 0),
        parentAttemptId,
        triggerType: 'user_message_regenerate',
        mode: 'clean',
        targetId: target,
        speakerName: getTargetName(target),
        replacedMessageIds: toDelete.map((message) => Number(message.id || 0)).filter((id) => id > 0)
      })
      let fullReply = ''
      let usedModel = ''

      const returnedText = await callAIStream(
        messages,
        {
          ...getAIOptions(target),
          usageLabel: `编辑后重生成：${getTargetName(target)}`,
          // 消耗溯源：并入该轮总账（编辑的用户消息即该轮锚）。
          roundId: buildChatTurnRoundId(sessionId, Number(msg.id || 0)),
          unitKind: 'regenerate',
          placeLabel: usagePlace.label,
          placeType: usagePlace.type,
          onPromptPrepared: async ({ messages: preparedMessages, finalPrompt, promptBlocks }: {
            messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
            finalPrompt: string
            promptBlocks?: Array<{ role: 'system' | 'user' | 'assistant'; title: string; content: string }>
            preparedAt: string
          }) => {
            try {
              const result = await createPromptLogForCurrentSession(target, {
                speakerName: getTargetName(target),
                targetId: target,
                finalPrompt,
                promptBlocks: promptBlocks ?? buildPromptBlocksFromPreparedMessages(preparedMessages, 'user-message-regenerate-messages')
              })
              ;(msg as MessageLike & { _promptLogId?: string })._promptLogId = String(result.id || '')
              await persistRecallActivityForCurrentSession({
                sessionId,
                targetId: target,
                speakerName: getTargetName(target),
                inputMessageId: Number(msg.id || 0),
                assistantMessageId: 0
              })
            } catch (error) {
              console.error('记录编辑重生成提示词日志失败:', error)
            }
          }
        },
        (chunk: string) => {
          fullReply += chunk
          streamingText.value = fullReply
          scrollToBottom()
        },
        {
          onModelInfo: (model: string) => {
            usedModel = model
            setCurrentMessageModel(model)
          }
        }
      )

      const normalizedReply = normalizeAiOutputText(returnedText || fullReply)
      const cleanedReply = cleanAiPrefix(normalizedReply)
      if (!hasVisibleAiReplyBody(cleanedReply)) {
        toast('模型没有返回可显示的回复，请稍后重试或换个预设', 'warning')
        return
      }
      const replyMsg = {
        role: 'assistant',
        content: cleanedReply,
        time: new Date().toLocaleTimeString(),
        name: getTargetName(target),
        model: usedModel
      }
      const persistedId = await chatStore.addMessage(target, replyMsg, { sessionId })
      const promptLogId = String((msg as MessageLike & { _promptLogId?: string })._promptLogId || '')
      if (promptLogId && typeof persistedId === 'number' && persistedId > 0) {
        await deletePromptLogsForCurrentSession(target, Number(msg.id), promptLogId)
        await bindPromptLogForCurrentSession(target, promptLogId, persistedId)
        delete (msg as MessageLike & { _promptLogId?: string })._promptLogId
      }
      if (typeof persistedId === 'number' && persistedId > 0) {
        await persistRecallActivityForCurrentSession({
          sessionId,
          targetId: target,
          speakerName: getTargetName(target),
          inputMessageId: Number(msg.id || 0),
          assistantMessageId: persistedId
        })
        await finishMessageGenerationAttempt({
          sessionId,
          attemptId: generationAttemptId,
          status: 'completed',
          assistantMessageIds: [persistedId],
          outputPromptLogId: promptLogId
        })
      }
    } catch (err: any) {
      await finishMessageGenerationAttempt({
        sessionId,
        attemptId: generationAttemptId,
        status: 'failed',
        error: err
      })
      if (err?.name !== 'AbortError') toast(`重新生成失败: ${err?.message || err}`, 'error')
    } finally {
      setTyping(false)
      setCurrentMessageModel('')
      streamingText.value = ''
      await nextTick()
      scrollToBottom()
    }
  }

  // ---- 提调挂起态：继续 / 取消 / 输入 ----
  // 现役唯一挂起来源=提调 askUser 提问态（correctionTargetMessageId 必带）；
  // 旧「编排带停止→挂起等纠偏」系列（重试/精修/用户消息重跑挂起）已随停止统一（2026-07-04）退役。
  function updateCorrectionText(text: string) {
    updatePendingCorrectionText(text)
  }

  function cancelCorrection() {
    const pending = getPendingCorrection()
    if (!pending) return
    clearPendingCorrection()
    chatStore.clearLocalStreamingMessages?.()
  }

  async function continueCorrection() {
    const pending = getPendingCorrection()
    if (!pending) return
    const correctionText = String(pending.correction || '').trim()
    const targetMessageId = Number(pending.correctionTargetMessageId || 0)
    if (targetMessageId <= 0) {
      // 防御：无锚定消息的挂起（不该出现）直接取消，不做续跑。
      cancelCorrection()
      return
    }
    const baseUserContent = pending.baseUserContent
    const anchorMessageId = pending.anchorMessageId
    const parentAttemptId = pending.parentAttemptId
    const replacedMessageIds = pending.replacedMessageIds
    clearPendingCorrection()
    chatStore.clearLocalStreamingMessages?.()
    const index = currentMessages.value.findIndex((message) => Number(message?.id || 0) === targetMessageId)
    if (index < 0) {
      clearTidiaoDirectorStreamRound()
      return
    }
    // 批次1(D)：续跑时把「纯原始指令」作 userInstruction 再落库（从已落库带捞回，避免把续接说明文本当原始指令存、防多轮续接嵌套）。
    // 始终透传（空串=不落库 userInstruction，与 resumeDirectorSession case② 同口径），杜绝把续接/续跑文本误存成原始指令。
    const originalInstruction = await recoverDirectorOriginalInstruction(targetMessageId)
    // 批次B·没把握先问用户续跑：把「提调问的问题 + 用户这次的答复」一起织进续跑指令，
    // 让提调据自己的提问语境理解答复、按答复正确续做、不重复问同一歧义。
    // 注：continueCorrection 由 UI fire-and-forget 调用，异步抛错必须接住，否则逃逸成 unhandledRejection。
    const askedQuestion = String(pending.askedQuestion || '').trim()
    const effectiveCorrection = askedQuestion
      ? `【你上一轮没把握，向用户提了问】${askedQuestion}\n【用户的答复】${correctionText || '（未明确，请按你的推荐选项做）'}`
      : correctionText
    try {
      const handled = await runDirectorCorrection(targetMessageId, effectiveCorrection, { userInstruction: originalInstruction })
      if (!handled && typeof resendUserMessage === 'function') {
        await resendUserMessage(baseUserContent, anchorMessageId, { parentAttemptId, replacedMessageIds, correctionText })
      }
    } catch (error) {
      if (!isStopRequested() && (error as { name?: string } | null)?.name !== 'AbortError') {
        toast('纠偏继续失败，已保留原回复。', 'warning')
      }
    }
  }

  function deleteMessage(index: number) {
    const runDelete = async () => {
      const msg = currentMessages.value[index]
      invalidateRecallActivityPanelForMessages({
        sessionId: getCurrentSessionId(),
        messageIds: [msg?.id],
        mode: 'delete'
      })
      if (msg && msg.id) {
        try {
          await chatStore.deleteMessage(getCurrentTargetId(), msg.id)
        } catch (error: any) {
          toast(`删除消息失败: ${error?.message || error}`, 'error')
        }
        return
      }

      currentMessages.value.splice(index, 1)
    }

    if (typeof openConfirmDialog === 'function') {
      openConfirmDialog('删除消息', '确定删除这条消息吗？删除后无法恢复。', runDelete)
      return
    }

    void runDelete()
  }

  return {
    editingMessageIndex,
    editingMessageContent,
    regeneratingMessageIndex,
    buildChatMessages,
    getAIOptions,
    getDisplayedMessageContent,
    selectMessageVersion,
    copyMessage,
    toggleMessagePromptVisibility,
    regenerateMsg,
    applyDirectorPrecisionEdits,
    startEditMessage,
    saveEditMessage,
    cancelEditMessage,
    saveAndRegenerate,
    updateCorrectionText,
    continueCorrection,
    cancelCorrection,
    deleteMessage
  }
}
