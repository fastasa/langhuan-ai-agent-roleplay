import { normalizeAiOutputText } from '../utils/aiOutput'
import { buildMessageEnvironmentSnapshot } from '../utils/messageEnvironment'
import { parseEmbeddedMessageProjectionOutput } from '../app/messageProjectionAgent'
import type { AiTokenUsage } from '../utils/aiUsage'
import type { ChatPromptLogBlock } from '../types'
import type { PreparedAIRecallResult, PreparedSharedRecallCard } from './useAI'

interface ReplyPlanItem {
  characterId: string
  mustReply: boolean
  probability?: number
}

interface CharacterLite {
  id: string
  name: string
}

interface AIMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

interface AIOptions {
  presetName?: string
  model?: string
  temperature?: number
  maxTokens?: number
  thinking?: 'enabled' | 'disabled'
  logLabel?: string
  usageLabel?: string
  placeLabel?: string
  placeType?: 'single' | 'group' | 'other'
  onPromptPrepared?: (payload: {
    messages: AIMessage[]
    finalPrompt: string
    promptBlocks?: ChatPromptLogBlock[]
    preparedAt: string
  }) => void | Promise<void>
}

interface StreamCallbacks {
  onModelInfo?: (model: string, preset: string) => void
  onUsageInfo?: (usage: AiTokenUsage) => void
}

type SpeakerRecallActivity = PreparedAIRecallResult['recallActivity']

interface PromptLogBindingContext {
  speakerName: string
  speakerTargetId: string
  recallActivity?: SpeakerRecallActivity
}

interface UseGroupChatExecutorOptions {
  getCharacters: () => CharacterLite[]
  buildChatMessages: (targetId: string, userText: string, sourceMessages?: any[], speakerTargetId?: string, options?: { skipPrepareRecall?: boolean; skipRecallToFinalConfirmation?: boolean; userIdentityChangeNotice?: string }) => Promise<AIMessage[]>
  prepareSpeakerRecall?: (speakerTargetId: string, options?: {
    characterOnly?: boolean
    sharedCards?: PreparedSharedRecallCard[]
    onSharedCards?: (cards: PreparedSharedRecallCard[]) => void
    onActivityStarted?: (activity: NonNullable<SpeakerRecallActivity>) => void
    skipRecallToFinalConfirmation?: boolean
  }) => Promise<PreparedAIRecallResult | void>
  resolveSpeakerRecallBypass?: (payload: {
    targetId: string
    speakerTargetId: string
    speakerName: string
    userText: string
  }) => { skipRecallToFinalConfirmation?: boolean; userIdentityChangeNotice?: string } | null | undefined
  beforeFirstPrompt?: () => Promise<void> | void
  refreshChatMessages?: () => any[]
  getAIOptions: (targetId: string) => AIOptions
  callAIStream: (
    messages: AIMessage[],
    options: AIOptions,
    onChunk?: (text: string) => void,
    callbacks?: StreamCallbacks
  ) => Promise<string | null>
  normalizeReplyProbability: (val: unknown) => number
  cleanAiPrefix: (text: string) => string
  addMessage: (targetId: string, message: any, options?: { skipLocalSync?: boolean }) => void | Promise<number>
  onStreamingText: (text: string, speaker?: CharacterLite | null) => void
  upsertLocalStreamingMessage?: (messageKey: string, message: Record<string, unknown>) => void
  removeLocalStreamingMessage?: (messageKey: string) => void
  finalizeLocalStreamingMessage?: (messageKey: string, message: Record<string, unknown>) => boolean
  appendPersistedMessage?: (message: Record<string, unknown>) => void
  onPersistedMessageWhileTargetLoading?: (targetId: string, messageKey: string, message: Record<string, unknown>) => void
  onProgress?: () => void
  onCharacterError?: (char: CharacterLite, err: any) => void
  shouldStop?: () => boolean
  getCurrentEnvironment?: () => {
    currentTime?: string
    currentWeather?: string
    currentLocation?: string
    currentSession?: unknown
  }
  getTargetName?: (targetId: string) => string
  createPromptLog?: (payload: {
    sessionTargetId: string
    speakerName: string
    speakerTargetId: string
    messages: AIMessage[]
    finalPrompt: string
    promptBlocks?: ChatPromptLogBlock[]
    recallActivity?: SpeakerRecallActivity
  }) => Promise<string>
  bindPromptLogMessage?: (sessionTargetId: string, logId: string, assistantMessageId: number, context?: PromptLogBindingContext) => Promise<void>
  onAssistantPersisted?: (payload: {
    targetId: string
    speakerTargetId: string
    assistantMessageId: number
    messagePayload?: Record<string, unknown>
    embeddedProjectionText?: string
    embeddedProjectionError?: string
    embeddedProjectionRequired?: boolean
  }) => void | Promise<void>
  onReplyOrderUpdated?: (speakerTargetIds: string[]) => void
  onReplyWaitTick?: (speakerTargetIds: string[]) => void
  shouldAllowSpeaker?: (payload: {
    targetId: string
    speakerTargetId: string
    speakerName: string
    userText: string
  }) => boolean | Promise<boolean>
}

interface ExecuteGroupChatOptions {
  targetId: string
  userText: string
  replyOrder: ReplyPlanItem[]
}

interface GroupExecutionState {
  id: number
  active: boolean
  localMessageKeys: Set<string>
  suppressRecallLoading: boolean
}

export function useGroupChatExecutor(options: UseGroupChatExecutorOptions) {
  const {
    getCharacters,
    buildChatMessages,
    prepareSpeakerRecall,
    resolveSpeakerRecallBypass,
    getAIOptions,
    callAIStream,
    normalizeReplyProbability,
    cleanAiPrefix,
    addMessage,
    onStreamingText,
    upsertLocalStreamingMessage,
    removeLocalStreamingMessage,
    finalizeLocalStreamingMessage,
    appendPersistedMessage,
    onPersistedMessageWhileTargetLoading,
    onProgress,
    onCharacterError,
    shouldStop,
    getCurrentEnvironment,
    getTargetName,
    createPromptLog,
    bindPromptLogMessage,
    onAssistantPersisted,
    shouldAllowSpeaker,
    onReplyOrderUpdated,
    onReplyWaitTick
  } = options
  let executionSeq = 0

  function isGroupExecutionStateActive(state: GroupExecutionState): boolean {
    return state.active && state.id === executionSeq && !shouldStop?.()
  }

  function isAbortError(err: unknown): boolean {
    return typeof err === 'object' && err !== null && 'name' in err && (err as { name?: string }).name === 'AbortError'
  }

  function stripThoughtContent(text: string): string {
    return String(text || '')
      .replace(/<think>[\s\S]*?<\/think>/gi, '')
      .replace(/【思考过程】[\s\S]*?(?=【回复】|$)/g, '')
      .replace(/【回复】/g, '')
      .trim()
  }

  function hasVisibleReplyBody(text: string): boolean {
    return Boolean(stripThoughtContent(text))
  }

  function getVisibleTextFromEmbeddedProjectionOutput(rawOutput: string): string {
    return cleanAiPrefix(parseEmbeddedMessageProjectionOutput(rawOutput).visibleText)
  }

  async function persistAssistantMessage(input: {
    targetId: string
    char: CharacterLite
    content: string
    envSnapshot: ReturnType<typeof buildMessageEnvironmentSnapshot>
    model: string
  }): Promise<{ persistedId: number | void; content: string }> {
    const buildPayload = (content: string) => ({
      role: 'assistant',
      content,
      time: new Date().toLocaleTimeString(),
      name: input.char.name,
      memberName: input.char.name,
      memberTargetId: input.char.id,
      member_target_id: input.char.id,
      speakerTargetId: input.char.id,
      speaker_target_id: input.char.id,
      envDate: input.envSnapshot.envDate,
      envWeather: input.envSnapshot.envWeather,
      envLocation: input.envSnapshot.envLocation,
      model: input.model
    })
    try {
      return {
        persistedId: await addMessage(input.targetId, buildPayload(input.content), { skipLocalSync: true }),
        content: input.content
      }
    } catch (error) {
      const visibleContent = stripThoughtContent(input.content)
      if (!visibleContent || visibleContent === input.content) {
        throw error
      }
      return {
        persistedId: await addMessage(input.targetId, buildPayload(visibleContent), { skipLocalSync: true }),
        content: visibleContent
      }
    }
  }

  function keepCurrentSpeakerOnly(text: string, currentName: string): string {
    const thinkPrefixMatch = String(text || '').match(/^(\s*(?:<think>[\s\S]*?<\/think>\s*)+)/i)
    const thinkPrefix = thinkPrefixMatch?.[1] || ''
    const bodyText = thinkPrefix ? String(text || '').slice(thinkPrefix.length) : String(text || '')
    const allNames = (getCharacters() || []).map((c) => c.name).filter(Boolean)
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

    // 兜底：如果前面是无前缀正文，就保留正文；一旦已经出现其他角色名，就不再拼接后续内容，避免串人设
    const plainMerged = leadingPlain.join('\n').trim()
    if (plainMerged) return `${thinkPrefix}${plainMerged}`.trim()

    // 最后兜底：只去掉当前角色自己的前缀，不吞并其他角色发言
    const selfPrefixRegex = new RegExp(`^${currentName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*[：:]\\s*`, 'i')
    const strippedLines = lines
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((line) => !speakerRegex.test(line) || selfPrefixRegex.test(line))
      .map((line) => line.replace(selfPrefixRegex, ''))
      .filter(Boolean)
    return `${thinkPrefix}${strippedLines.join('\n').trim()}`.trim() || String(text || '').trim()
  }

  function shouldReply(item: ReplyPlanItem): boolean {
    return item.mustReply || Math.random() <= normalizeReplyProbability(item.probability)
  }

  function remainingSpeakerIds(replyOrder: ReplyPlanItem[], startIndex: number): string[] {
    return replyOrder
      .slice(Math.max(0, startIndex))
      .map((item) => String(item?.characterId || '').trim())
      .filter(Boolean)
  }

  function notifyReplyOrderUpdated(replyOrder: ReplyPlanItem[], startIndex: number): void {
    onReplyOrderUpdated?.(remainingSpeakerIds(replyOrder, startIndex))
  }

  function wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  async function waitForPreparedSpeaker(
    promise: Promise<Awaited<ReturnType<typeof prepareNextSpeaker>>>,
    replyOrder: ReplyPlanItem[],
    startIndex: number,
    executionState: GroupExecutionState
  ): Promise<Awaited<ReturnType<typeof prepareNextSpeaker>>> {
    let settled = false
    let resolvedValue: Awaited<ReturnType<typeof prepareNextSpeaker>> = null
    let rejectedError: unknown
    const tracked = promise.then((value) => {
      settled = true
      resolvedValue = value
    }, (error) => {
      settled = true
      rejectedError = error
    })

    while (!settled && isGroupExecutionStateActive(executionState)) {
      await Promise.race([tracked, wait(5000)])
      if (!settled && isGroupExecutionStateActive(executionState)) {
        const ids = remainingSpeakerIds(replyOrder, startIndex)
        onReplyWaitTick?.(ids)
        onReplyOrderUpdated?.(ids)
      }
    }
    await tracked
    if (rejectedError) throw rejectedError
    return resolvedValue
  }

  async function prepareRecallForSpeaker(input: {
    targetId: string
    userText: string
    char: CharacterLite
    beforeFirstPromptDone: boolean
    sharedRecallCards: PreparedSharedRecallCard[]
    sharedRecallState: { prepared: boolean }
    onActivityStarted?: (activity: NonNullable<SpeakerRecallActivity>) => void
  }): Promise<{ beforeFirstPromptDone: boolean; recallActivity?: SpeakerRecallActivity }> {
    let beforeFirstPromptDone = input.beforeFirstPromptDone
    let recallActivity: SpeakerRecallActivity = null
    if (!beforeFirstPromptDone) {
      beforeFirstPromptDone = true
      await options.beforeFirstPrompt?.()
    }
    if (prepareSpeakerRecall) {
      let capturedSharedCards: PreparedSharedRecallCard[] | null = null
      const bypass = resolveSpeakerRecallBypass?.({
        targetId: input.targetId,
        speakerTargetId: input.char.id,
        speakerName: input.char.name,
        userText: input.userText
      }) || {}
      const result = await prepareSpeakerRecall(input.char.id, {
        characterOnly: input.sharedRecallState.prepared && !bypass.skipRecallToFinalConfirmation,
        sharedCards: input.sharedRecallCards,
        onSharedCards: (cards) => {
          capturedSharedCards = cards || []
        },
        onActivityStarted: input.onActivityStarted,
        skipRecallToFinalConfirmation: Boolean(bypass.skipRecallToFinalConfirmation)
      })
      recallActivity = result?.recallActivity ?? null
      if (!input.sharedRecallState.prepared && !bypass.skipRecallToFinalConfirmation) {
        input.sharedRecallState.prepared = true
        input.sharedRecallCards.splice(0, input.sharedRecallCards.length, ...(capturedSharedCards || []))
      }
    } else {
      await buildChatMessages(input.char.id, input.userText)
    }
    return { beforeFirstPromptDone, recallActivity }
  }

  async function buildPromptFromLatestContext(targetId: string, char: CharacterLite, userText: string): Promise<AIMessage[]> {
    const refreshedMessages = options.refreshChatMessages?.()
    const bypass = resolveSpeakerRecallBypass?.({
      targetId,
      speakerTargetId: char.id,
      speakerName: char.name,
      userText
    }) || {}
    return await buildChatMessages(
      char.id,
      userText,
      Array.isArray(refreshedMessages) ? refreshedMessages : undefined,
      char.id,
      {
        skipPrepareRecall: true,
        ...(bypass.userIdentityChangeNotice ? { userIdentityChangeNotice: bypass.userIdentityChangeNotice } : {})
      }
    )
  }

  async function prepareNextSpeaker(input: {
    targetId: string
    userText: string
    replyOrder: ReplyPlanItem[]
    startIndex: number
    beforeFirstPromptDone: boolean
    sharedRecallCards: PreparedSharedRecallCard[]
    sharedRecallState: { prepared: boolean }
    executionState: GroupExecutionState
  }): Promise<{
    char: CharacterLite
    index: number
    beforeFirstPromptDone: boolean
    recallActivity?: SpeakerRecallActivity
    localMessageKey?: string
    recallActivityRunId?: string
    envSnapshot?: ReturnType<typeof buildMessageEnvironmentSnapshot>
  } | null> {
    let beforeFirstPromptDone = input.beforeFirstPromptDone
    for (let index = input.startIndex; index < input.replyOrder.length; index++) {
      if (!isGroupExecutionStateActive(input.executionState)) return null
      const item = input.replyOrder[index]
      const charId = item.characterId
      const char = (getCharacters() || []).find(c => c.id === charId)
      if (!char) {
        notifyReplyOrderUpdated(input.replyOrder, index + 1)
        continue
      }
      if (!shouldReply(item)) {
        notifyReplyOrderUpdated(input.replyOrder, index + 1)
        continue
      }

      let allowedByGate = true
      try {
        allowedByGate = await shouldAllowSpeaker?.({
          targetId: input.targetId,
          speakerTargetId: charId,
          speakerName: char.name,
          userText: input.userText
        }) ?? true
      } catch (err) {
        onCharacterError?.(char, err)
        return null
      }
      if (!allowedByGate) {
        notifyReplyOrderUpdated(input.replyOrder, index + 1)
        continue
      }

      let recallActivity: SpeakerRecallActivity = null
      let localMessageKey = ''
      let recallActivityRunId = ''
      let recallEnvSnapshot: ReturnType<typeof buildMessageEnvironmentSnapshot> | null = null
      const ensureRecallLoadingMessage = (activity?: NonNullable<SpeakerRecallActivity> | null) => {
        if (!isGroupExecutionStateActive(input.executionState)) return
        if (!upsertLocalStreamingMessage) return
        if (input.executionState.suppressRecallLoading && !localMessageKey) return
        if (!localMessageKey) {
          localMessageKey = `group-recall-${input.targetId}-${char.id}-${Date.now()}-${index}`
          input.executionState.localMessageKeys.add(localMessageKey)
        }
        recallActivityRunId = String(activity?.id || recallActivityRunId || '').trim()
        recallEnvSnapshot = recallEnvSnapshot || buildMessageEnvironmentSnapshot({
          ...(getCurrentEnvironment?.() || {}),
          createdAt: new Date().toISOString()
        })
        upsertLocalStreamingMessage(localMessageKey, {
          role: 'assistant',
          content: '',
          time: new Date().toLocaleTimeString(),
          name: char.name,
          memberName: char.name,
          memberTargetId: char.id,
          member_target_id: char.id,
          speakerTargetId: char.id,
          speaker_target_id: char.id,
          envDate: recallEnvSnapshot.envDate,
          envWeather: recallEnvSnapshot.envWeather,
          envLocation: recallEnvSnapshot.envLocation,
          model: '',
          _targetId: input.targetId,
          _recallLoading: activity?.status !== 'completed' && activity?.status !== 'failed',
          _recallActivityRunId: recallActivityRunId
        })
      }
      try {
        const prepared = await prepareRecallForSpeaker({
          targetId: input.targetId,
          userText: input.userText,
          char,
          beforeFirstPromptDone,
          sharedRecallCards: input.sharedRecallCards,
          sharedRecallState: input.sharedRecallState,
          onActivityStarted: ensureRecallLoadingMessage
        })
        beforeFirstPromptDone = prepared.beforeFirstPromptDone
        recallActivity = prepared.recallActivity ?? null
        if (!isGroupExecutionStateActive(input.executionState)) {
          if (localMessageKey) {
            removeLocalStreamingMessage?.(localMessageKey)
            input.executionState.localMessageKeys.delete(localMessageKey)
          }
          return null
        }
        recallActivityRunId = String(recallActivity?.id || recallActivityRunId || '').trim()
        if (localMessageKey && recallActivityRunId && input.executionState.localMessageKeys.has(localMessageKey)) {
          ensureRecallLoadingMessage(recallActivity as NonNullable<SpeakerRecallActivity>)
        }
      } catch (err) {
        if (!isAbortError(err)) {
          onCharacterError?.(char, err)
        }
        if (localMessageKey) {
          removeLocalStreamingMessage?.(localMessageKey)
          input.executionState.localMessageKeys.delete(localMessageKey)
        }
        return null
      }

      return {
        char,
        index,
        beforeFirstPromptDone,
        recallActivity,
        localMessageKey,
        recallActivityRunId,
        envSnapshot: recallEnvSnapshot || undefined
      }
    }
    return null
  }

  async function executeGroupChat(params: ExecuteGroupChatOptions): Promise<number> {
    const { targetId, userText, replyOrder } = params
    const executionState: GroupExecutionState = {
      id: ++executionSeq,
      active: true,
      localMessageKeys: new Set(),
      suppressRecallLoading: false
    }
    const isExecutionActive = () => isGroupExecutionStateActive(executionState)
    const removeTrackedLocalMessage = (messageKey: string) => {
      removeLocalStreamingMessage?.(messageKey)
      executionState.localMessageKeys.delete(messageKey)
    }
    const cleanupExecutionLocalMessages = () => {
      Array.from(executionState.localMessageKeys).forEach((messageKey) => {
        removeLocalStreamingMessage?.(messageKey)
      })
      executionState.localMessageKeys.clear()
    }
    let replyCount = 0
    const sharedRecallCards: PreparedSharedRecallCard[] = []
    const sharedRecallState = { prepared: false }
    try {
      let preparedSpeaker = await prepareNextSpeaker({
        targetId,
        userText,
        replyOrder: replyOrder || [],
        startIndex: 0,
        beforeFirstPromptDone: false,
        sharedRecallCards,
        sharedRecallState,
        executionState
      })

      while (preparedSpeaker) {
      if (!isExecutionActive()) break
      const char = preparedSpeaker.char
      const recallActivity = preparedSpeaker.recallActivity || null

      let messagesForAI: AIMessage[]
      try {
        messagesForAI = await buildPromptFromLatestContext(targetId, char, userText)
      } catch (err) {
        if (!isAbortError(err)) {
          onCharacterError?.(char, err)
        }
        onStreamingText('', null)
        return replyCount
      }
      if (!isExecutionActive()) break

      const nextSpeakerPromise = prepareNextSpeaker({
        targetId,
        userText,
        replyOrder: replyOrder || [],
        startIndex: preparedSpeaker.index + 1,
        beforeFirstPromptDone: preparedSpeaker.beforeFirstPromptDone,
        sharedRecallCards,
        sharedRecallState,
        executionState
      })
      executionState.suppressRecallLoading = false

      const aiOptions = {
        ...getAIOptions(char.id),
        usageLabel: `角色发言：${char.name}`,
        placeLabel: `会话：${getTargetName?.(targetId) || targetId}`,
        placeType: 'group' as const
      }
      let fullReply = ''
      let returnedText: string | null = null
      let usedModel = ''
      let promptLogId = ''
      const localMessageKey = preparedSpeaker.localMessageKey || `group-stream-${targetId}-${char.id}-${Date.now()}-${replyCount}`
      executionState.localMessageKeys.add(localMessageKey)
      const recallActivityRunId = String(preparedSpeaker.recallActivityRunId || recallActivity?.id || '').trim()
      const envSnapshot = preparedSpeaker.envSnapshot || buildMessageEnvironmentSnapshot({
        ...(getCurrentEnvironment?.() || {}),
        createdAt: new Date().toISOString()
      })
      try {
        onStreamingText('', char)
        if (!isExecutionActive()) break
        upsertLocalStreamingMessage?.(localMessageKey, {
          role: 'assistant',
          content: '',
          time: new Date().toLocaleTimeString(),
          name: char.name,
          memberName: char.name,
          memberTargetId: char.id,
          member_target_id: char.id,
          speakerTargetId: char.id,
          speaker_target_id: char.id,
          envDate: envSnapshot.envDate,
          envWeather: envSnapshot.envWeather,
          envLocation: envSnapshot.envLocation,
          model: '',
          _targetId: targetId,
          _recallLoading: false,
          _recallActivityRunId: recallActivityRunId
        })
        returnedText = await callAIStream(messagesForAI, {
          ...aiOptions,
          onPromptPrepared: async ({ messages, finalPrompt, promptBlocks }) => {
            try {
              promptLogId = await createPromptLog?.({
                sessionTargetId: targetId,
                speakerName: char.name,
                speakerTargetId: char.id,
                messages,
                finalPrompt,
                promptBlocks,
                recallActivity
              }) || ''
            } catch (error) {
              console.error('记录多人会话提示词日志失败:', error)
            }
          }
        }, (chunk) => {
          if (!isExecutionActive()) return
          fullReply += chunk
          const visibleStreamingReply = getVisibleTextFromEmbeddedProjectionOutput(fullReply)
          onStreamingText(visibleStreamingReply, char)
          upsertLocalStreamingMessage?.(localMessageKey, {
            role: 'assistant',
            content: visibleStreamingReply,
            time: new Date().toLocaleTimeString(),
            name: char.name,
            memberName: char.name,
            memberTargetId: char.id,
            member_target_id: char.id,
            speakerTargetId: char.id,
            speaker_target_id: char.id,
            envDate: envSnapshot.envDate,
            envWeather: envSnapshot.envWeather,
            envLocation: envSnapshot.envLocation,
            model: usedModel,
            _targetId: targetId,
            _recallLoading: false,
            _recallActivityRunId: recallActivityRunId
          })
          onProgress?.()
        }, {
          onModelInfo: (model) => {
            if (!isExecutionActive()) return
            usedModel = model
            const visibleStreamingReply = getVisibleTextFromEmbeddedProjectionOutput(fullReply)
            upsertLocalStreamingMessage?.(localMessageKey, {
              role: 'assistant',
              content: visibleStreamingReply,
              time: new Date().toLocaleTimeString(),
              name: char.name,
              memberName: char.name,
              memberTargetId: char.id,
              member_target_id: char.id,
              speakerTargetId: char.id,
              speaker_target_id: char.id,
              envDate: envSnapshot.envDate,
              envWeather: envSnapshot.envWeather,
              envLocation: envSnapshot.envLocation,
              model: usedModel,
              _targetId: targetId,
              _recallLoading: false,
              _recallActivityRunId: recallActivityRunId
            })
          }
        })
        // 兜底：某些模型/网关会一次性返回完整文本而不是分片 chunk
        if (!fullReply && returnedText) {
          fullReply = String(returnedText)
          onStreamingText(getVisibleTextFromEmbeddedProjectionOutput(fullReply), char)
          onProgress?.()
        }
      } catch (err: any) {
        if (err?.name !== 'AbortError') {
          onCharacterError?.(char, err)
        }
        executionState.active = false
        removeTrackedLocalMessage(localMessageKey)
        cleanupExecutionLocalMessages()
        onStreamingText('', null)
        return replyCount
      }

      if (!isExecutionActive()) {
        removeTrackedLocalMessage(localMessageKey)
        onStreamingText('', null)
        break
      }
      if (!fullReply) {
        removeTrackedLocalMessage(localMessageKey)
        continue
      }

      const normalizedReplyWithProjection = normalizeAiOutputText(returnedText || fullReply)
      const embeddedProjectionParse = parseEmbeddedMessageProjectionOutput(normalizedReplyWithProjection)
      const normalizedReply = cleanAiPrefix(embeddedProjectionParse.visibleText).trim()
      const speakerOnlyReply = keepCurrentSpeakerOnly(normalizedReply, char.name).trim()
      // 优先保留已经归一化好的思维链；只有正文被裁空时，才回退到纯正文，避免消息整体消失。
      const cleanedReply = (
        (hasVisibleReplyBody(speakerOnlyReply) ? speakerOnlyReply : '')
        || (hasVisibleReplyBody(normalizedReply) ? normalizedReply : '')
        || stripThoughtContent(speakerOnlyReply)
        || stripThoughtContent(normalizedReply)
      ).trim()
      if (!cleanedReply) {
        removeTrackedLocalMessage(localMessageKey)
        onStreamingText('', null)
        continue
      }
      upsertLocalStreamingMessage?.(localMessageKey, {
        role: 'assistant',
        content: cleanedReply,
        time: new Date().toLocaleTimeString(),
        name: char.name,
        memberName: char.name,
        memberTargetId: char.id,
        member_target_id: char.id,
        speakerTargetId: char.id,
        speaker_target_id: char.id,
        envDate: envSnapshot.envDate,
        envWeather: envSnapshot.envWeather,
        envLocation: envSnapshot.envLocation,
        model: usedModel,
        _targetId: targetId,
        _recallLoading: false,
        _recallActivityRunId: recallActivityRunId
      })
      onStreamingText('', null)
      let persistedId: number | void
      let savedReplyContent = cleanedReply
      try {
        const persisted = await persistAssistantMessage({
          targetId,
          char,
          content: cleanedReply,
          envSnapshot,
          model: usedModel
        })
        persistedId = persisted.persistedId
        savedReplyContent = persisted.content
      } catch (err) {
        if (!isAbortError(err)) {
          onCharacterError?.(char, err)
        }
        executionState.active = false
        removeTrackedLocalMessage(localMessageKey)
        cleanupExecutionLocalMessages()
        onStreamingText('', null)
        return replyCount
      }
      if (!isExecutionActive()) {
        removeTrackedLocalMessage(localMessageKey)
        onStreamingText('', null)
        break
      }
      if (promptLogId && typeof persistedId === 'number' && persistedId > 0) {
        try {
          await bindPromptLogMessage?.(targetId, promptLogId, persistedId, {
            speakerName: char.name,
            speakerTargetId: char.id,
            recallActivity
          })
        } catch (error) {
          console.error('绑定多人会话提示词日志失败:', error)
        }
      }
      const finalized = finalizeLocalStreamingMessage?.(localMessageKey, {
        id: persistedId,
        role: 'assistant',
        content: savedReplyContent,
        time: new Date().toLocaleTimeString(),
        name: char.name,
        memberName: char.name,
        memberTargetId: char.id,
        member_target_id: char.id,
        speakerTargetId: char.id,
        speaker_target_id: char.id,
        envDate: envSnapshot.envDate,
        envWeather: envSnapshot.envWeather,
        envLocation: envSnapshot.envLocation,
        model: usedModel,
        _targetId: targetId
      })
      executionState.localMessageKeys.delete(localMessageKey)
      // 切换会话后，本地临时消息可能已经被新的消息列表覆盖；
      // 这时数据库虽然已保存成功，但界面里没有可替换的临时项，需要补回正式消息。
      if (finalized === false) {
        const persistedMessage = {
          id: persistedId,
          role: 'assistant',
          content: savedReplyContent,
          time: new Date().toLocaleTimeString(),
          name: char.name,
          memberName: char.name,
          memberTargetId: char.id,
          member_target_id: char.id,
          speakerTargetId: char.id,
          speaker_target_id: char.id,
          envDate: envSnapshot.envDate,
          envWeather: envSnapshot.envWeather,
          envLocation: envSnapshot.envLocation,
          model: usedModel,
          _targetId: targetId
        }
        appendPersistedMessage?.(persistedMessage)
        onPersistedMessageWhileTargetLoading?.(targetId, localMessageKey, persistedMessage)
      }
      if (typeof persistedId === 'number' && persistedId > 0) {
        try {
          await onAssistantPersisted?.({
            targetId,
            speakerTargetId: char.id,
            assistantMessageId: persistedId,
            messagePayload: {
              role: 'assistant',
              content: savedReplyContent,
              time: new Date().toLocaleTimeString(),
              name: char.name,
              memberName: char.name,
              memberTargetId: char.id,
              member_target_id: char.id,
              speakerTargetId: char.id,
              speaker_target_id: char.id,
              envDate: envSnapshot.envDate,
              envWeather: envSnapshot.envWeather,
              envLocation: envSnapshot.envLocation,
              model: usedModel
            },
            embeddedProjectionText: embeddedProjectionParse.projectionText,
            embeddedProjectionError: embeddedProjectionParse.hasProjection ? '' : embeddedProjectionParse.error,
            embeddedProjectionRequired: true
          })
        } catch (error) {
          console.error('触发聊天自动写入轨迹失败:', error)
        }
      }

      replyCount++
      notifyReplyOrderUpdated(replyOrder || [], preparedSpeaker.index + 1)
      // 旧 virtual_scene_location_scan 已退场（2026-06-10）：群聊回复后不再做地点扫描。
      executionState.suppressRecallLoading = true
      cleanupExecutionLocalMessages()
      preparedSpeaker = isExecutionActive()
        ? await waitForPreparedSpeaker(nextSpeakerPromise, replyOrder || [], preparedSpeaker.index + 1, executionState)
        : null
    }
    onStreamingText('', null)
    return replyCount
    } finally {
      executionState.active = false
      cleanupExecutionLocalMessages()
    }
  }

  return {
    executeGroupChat
  }
}
