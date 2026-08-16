import type { AgentModelConfig, BrainDocumentRecord, BrainRecallCandidateCard, Character, ChatSessionTemporaryEntity } from '../types'
import type { PublicRecallMilestone, RecallActivityEvent, RecallReadDecision } from '../types/docBrain'
import { buildAIRecallPromptBlock, buildRecallContext, formatRecallTraceForPromptLog } from './characterBrainRecallAI'
import type { DocLibraryRecallStructureOptions } from './characterBrainRecallStructure'
import type { RecallEmbeddingVectorCache } from './recallEmbeddingCache'
import {
  appendRecallActivityEvent,
  completeRecallActivity,
  failRecallActivity,
  getCurrentRecallActivitySnapshot,
  pushRecallTrace,
  startRecallActivity,
  updateRecallActivityPublicMilestones,
  type PersistedRecallActivityRun
} from './recallTraceState'
import {
  applyPublicMilestoneRewrite,
  buildPublicMilestoneRewritePrompt,
  buildPublicRecallMilestonesFromEvents
} from './recallPublicMilestones'
import { buildTaskModelAiOptions, type ModelTaskId } from '../utils/modelTaskTiers'
import { normalizeAiTokenUsage, type AiTokenUsage } from '../utils/aiUsage'

type RecallAIMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

type MessageLike = {
  role?: string
  name?: string
  memberName?: string
  member_name?: string
  messageKind?: string
  message_kind?: string
  content?: string
  text?: string
}

type RecallAIOptions = {
  presetName?: string
  model?: string
  maxTokens?: number
  thinking?: 'enabled' | 'disabled'
  feature?: string
  logLabel?: string
  registerAbortController?: boolean
  usageLabel?: string
  placeLabel?: string
  placeType?: 'single' | 'group' | 'other'
  signal?: AbortSignal
  onModelInfo?: (model: string, preset: string) => void
  onUsageInfo?: (usage: AiTokenUsage) => void
}

type RecallEmbeddingResponse = {
  vectors: number[][]
  model?: string
  presetName?: string
  usage?: AiTokenUsage | null
} | null

export type RecallPromptSections = {
  profile: string
  general: string
  arrangement: string
  expression: string
}

export type PreparedSharedRecallCard = {
  card: BrainRecallCandidateCard
  readDecision?: RecallReadDecision
}

export type PrepareChatAIRecallOptions = {
  characterOnly?: boolean
  taskRunId?: string
  abortSignal?: AbortSignal
  skipRecallToFinalConfirmation?: boolean
  fixedCandidateRound?: number
  sharedCards?: PreparedSharedRecallCard[]
  onSharedCards?: (cards: PreparedSharedRecallCard[]) => void
  onActivityStarted?: (activity: PersistedRecallActivityRun) => void
}

export type PreparedChatAIRecallResult = {
  recallActivity?: PersistedRecallActivityRun | null
  sections: RecallPromptSections | null
  taskRunId: string
  recallTraceLogText?: string | null
  recallPriorityUpdates?: Record<string, 's' | 'a' | 'b' | 'c' | ''>
}

type RecallUsageMetaInput = {
  feature?: string
  usageLabel?: string
  logLabel?: string
  placeLabel?: string
  placeType?: 'single' | 'group' | 'other'
}

export type ChatAIRecallPreparationRuntime = {
  charId: string
  character: Character
  activeSessionId?: string
  visibleMessages: unknown[]
  fallbackDocuments: BrainDocumentRecord[]
  characterName: string
  characterDescription?: string
  characterPersonality?: string
  speakingStyleSummary?: string
  brainAgentConfig?: AgentModelConfig | null
  userProfile?: Record<string, unknown> | null
  otherCharacters?: Array<Pick<Character, 'id' | 'name' | 'nicknames' | 'appearance'>>
  sessionPlaceType?: 'single' | 'group'
  currentDate: Date
  includeCharacterLocationArrangements?: boolean
  recallEmbeddingVectorCache?: RecallEmbeddingVectorCache
  callAI: (messages: RecallAIMessage[], options?: RecallAIOptions) => Promise<string | null>
  callEmbeddings: (input: string[], options: { signal: AbortSignal; characterName: string }) => Promise<RecallEmbeddingResponse>
  fetchDocLibraryState: () => Promise<({
    documents?: BrainDocumentRecord[]
  } & DocLibraryRecallStructureOptions) | null>
  fetchSessionTemporaryEntities: (sessionId: string) => Promise<ChatSessionTemporaryEntity[]>
  isStopRequested?: () => boolean
  isStale?: () => boolean
  getRegisteredAbortController?: () => AbortController | null | undefined
  setRegisteredAbortController?: (controller: AbortController | null) => void
  isRegisteredAbortController?: (controller: AbortController) => boolean
  resolveUsageMeta?: (options: RecallUsageMetaInput) => { usageLabel?: string; placeLabel?: string; sessionId?: string; sessionLabel?: string; roundId?: string }
  onRecallTrace?: Parameters<typeof buildAIRecallPromptBlock>[4]
}

export function emptyRecallSections(): RecallPromptSections {
  return {
    profile: '',
    general: '',
    arrangement: '',
    expression: ''
  }
}

function extractRecallSection(text: string, title: string, nextTitles: string[]): string {
  const source = String(text || '')
  const start = source.indexOf(title)
  if (start < 0) return ''
  const afterStart = source.slice(start)
  const nextIndexes = nextTitles
    .map((nextTitle) => afterStart.indexOf(nextTitle, title.length))
    .filter((index) => index >= 0)
  const end = nextIndexes.length ? Math.min(...nextIndexes) : afterStart.length
  return afterStart.slice(0, end).trim()
}

export function splitRecallPromptSections(text: string): RecallPromptSections {
  const source = String(text || '').trim()
  if (!source) return emptyRecallSections()
  const titles = ['【当前人物】', '【本轮相关资料】', '【当前安排】', '【表达核心】']
  if (!titles.some((title) => source.includes(title))) {
    return {
      ...emptyRecallSections(),
      general: source
    }
  }
  return {
    profile: extractRecallSection(source, '【当前人物】', ['【本轮相关资料】', '【当前安排】', '【表达核心】']),
    general: extractRecallSection(source, '【本轮相关资料】', ['【当前安排】', '【表达核心】']),
    arrangement: extractRecallSection(source, '【当前安排】', ['【表达核心】']),
    expression: extractRecallSection(source, '【表达核心】', [])
  }
}

export function isVisibleRecallMessage(message: unknown): boolean {
  const record = (message || {}) as Record<string, unknown>
  if (!record.role || typeof record.content !== 'string') return false
  const messageKind = String(record.messageKind ?? record.message_kind ?? '').trim()
  if (messageKind === 'narration_debug') return false
  const hidden = record.autoWriteHidden ?? record.auto_write_hidden
  return !(hidden === true || hidden === 1 || hidden === '1' || hidden === 'true')
}

export function buildMinimalCharacterRecallBlock(char: unknown): string {
  const record = (char || {}) as Record<string, unknown>
  const name = String(record.name || '未命名角色').trim() || '未命名角色'
  const description = String(record.desc || record.description || '').trim()
  const personality = String(record.personality || '').trim()
  const speakingStyle = String(record.speakingStyle || record.speaking_style || '').trim()
  const profileLines = [
    '【当前人物】',
    `名称：${name}`,
    description ? `简介摘要：${description}` : ''
  ].filter(Boolean)
  const expressionLines = [
    '【表达核心】',
    personality ? `性格摘要：${personality}` : '',
    speakingStyle ? `说话方式摘要：${speakingStyle}` : ''
  ].filter(Boolean)
  return [
    profileLines.length > 2 ? profileLines.join('\n') : '',
    expressionLines.length > 1 ? expressionLines.join('\n') : ''
  ].filter(Boolean).join('\n\n').trim()
}

function createAbortError(message = '召回已停止'): Error {
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

function toPreconfirmedRecallCards(items: PreparedSharedRecallCard[] = []) {
  const cards: BrainRecallCandidateCard[] = []
  const readDecisions: Record<string, RecallReadDecision> = {}
  const seen = new Set<string>()
  for (const item of items) {
    const card = item?.card
    if (!card?.id || seen.has(card.id)) continue
    seen.add(card.id)
    cards.push(card)
    if (item.readDecision) readDecisions[card.id] = item.readDecision
  }
  return { cards, readDecisions }
}

function buildSharedRecallCards(payload: {
  cards: BrainRecallCandidateCard[]
  readDecisions: Record<string, RecallReadDecision>
  contentMap: Map<string, string>
}): PreparedSharedRecallCard[] {
  return payload.cards
    .filter((card) => card.k === 'observable_profile' || card.k === 'session_temporary_entity')
    .map((card) => ({
      card: {
        ...card,
        bodyText: payload.contentMap.get(card.id) || card.bodyText || card.s
      },
      readDecision: payload.readDecisions[card.id]
    }))
}

function buildDirectFinalConfirmationEvent(input: {
  runId: string
  characterId: string
  characterName: string
  sections: RecallPromptSections
}): RecallActivityEvent {
  const now = new Date().toISOString()
  const contentText = [input.sections.profile, input.sections.general, input.sections.arrangement, input.sections.expression]
    .filter((part) => String(part || '').trim())
    .join('\n\n')
  const confirmedUnits = [{
    id: `minimal_character_profile:${input.characterId || 'unknown'}`,
    title: `${input.characterName || '角色'}基础身份`,
    ownerCharacterId: input.characterId,
    contentText,
    summary: contentText,
    readDecision: 'summary_only' as const,
    score: 1
  }]
  return {
    id: `${input.runId}:confirmed_content_read`,
    runId: input.runId,
    stepKey: 'confirmed_content_read',
    stepLabel: '确认区内容读取决策',
    status: 'completed',
    startedAt: now,
    completedAt: now,
    durationMs: 0,
    input: {
      strategy: 'skip_recall_direct_confirmation',
      reason: '首次发言或当前用户身份变化'
    },
    output: {
      confirmed: confirmedUnits
    },
    metrics: {
      confirmedUnits,
      callCount: 0
    }
  }
}

export async function prepareChatAIRecall(
  runtime: ChatAIRecallPreparationRuntime,
  options: PrepareChatAIRecallOptions = {}
): Promise<PreparedChatAIRecallResult> {
  const recallTaskRunId = String(options.taskRunId || '').trim()
  const char = runtime.character
  const charId = String(runtime.charId || '').trim()
  const activeSessionId = String(runtime.activeSessionId || '').trim()
  const allMessages = (runtime.visibleMessages || []).filter(isVisibleRecallMessage) as MessageLike[]
  if (!allMessages.length) {
    return {
      recallActivity: null,
      sections: splitRecallPromptSections(buildMinimalCharacterRecallBlock(char)),
      taskRunId: recallTaskRunId
    }
  }

  const recallAbortController = new AbortController()
  const unlinkExternalAbortSignal = linkAbortSignal(recallAbortController, options.abortSignal)
  const shouldRegisterRecallAbortController = Boolean(runtime.setRegisteredAbortController && !runtime.getRegisteredAbortController?.())
  if (shouldRegisterRecallAbortController) {
    runtime.setRegisteredAbortController?.(recallAbortController)
  }
  const assertRecallNotStopped = () => {
    if (recallAbortController.signal.aborted || runtime.isStopRequested?.() || runtime.isStale?.()) {
      throw createAbortError()
    }
  }
  const characterName = runtime.characterName || String((char as unknown as Record<string, unknown>).name || '未命名角色')
  const activityRunId = `${Date.now()}-${charId}`
  let preparedRecallActivity: PersistedRecallActivityRun | null = null
  let confirmedRecallUnitCount = 0
  let recallTraceLogText: string | null = null
  let recallPriorityUpdates: Record<string, 's' | 'a' | 'b' | 'c' | ''> = {}

  try {
    assertRecallNotStopped()
    startRecallActivity({ id: activityRunId, characterName })
    const startedActivity = getCurrentRecallActivitySnapshot()
    if (startedActivity?.id === activityRunId) {
      options.onActivityStarted?.(startedActivity)
    }
    if (options.skipRecallToFinalConfirmation) {
      const baseSections = splitRecallPromptSections(buildMinimalCharacterRecallBlock(char))
      const event = buildDirectFinalConfirmationEvent({
        runId: activityRunId,
        characterId: charId,
        characterName,
        sections: baseSections
      })
      appendRecallActivityEvent(event)
      const result = {
        compressedContext: buildRecallContext(allMessages),
        confirmedIds: [`minimal_character_profile:${charId || 'unknown'}`],
        readDecisions: {
          [`minimal_character_profile:${charId || 'unknown'}`]: 'summary_only' as const
        },
        roundsCompleted: 0,
        rounds: [],
        recallPriorityUpdates: {},
        activityEvents: [event]
      }
      completeRecallActivity(result)
      preparedRecallActivity = getCurrentRecallActivitySnapshot()
      return {
        recallActivity: preparedRecallActivity?.id === activityRunId ? preparedRecallActivity : null,
        sections: baseSections,
        taskRunId: recallTaskRunId,
        recallPriorityUpdates: {}
      }
    }
    const docLibraryState = options.characterOnly
      ? null
      : await runtime.fetchDocLibraryState().catch(() => null)
    const sessionTemporaryEntities = activeSessionId && !options.characterOnly
      ? await runtime.fetchSessionTemporaryEntities(activeSessionId).catch(() => [])
      : []
    const preconfirmedShared = toPreconfirmedRecallCards(options.sharedCards || [])
    assertRecallNotStopped()
    // 批次3（2026-07-08 槽位收束）：召回裁判=recallJudge（校书）、润色/里程碑改写=recallFormat（书童），经任务分级表取档。
    const buildRecallSlotOptions = (
      taskId: Extract<ModelTaskId, 'recallFormat' | 'recallJudge'>,
      overrides: { maxTokens?: number } = {}
    ) => buildTaskModelAiOptions(runtime.brainAgentConfig as AgentModelConfig, taskId, overrides)
    const buildPublicMilestoneRewriteOptions = (milestoneCount: number) => buildRecallSlotOptions('recallFormat', {
      maxTokens: Math.max(180, Math.min(360, milestoneCount * 70))
    })
    const runRecallJudgeCall = async (
      messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
      config: { presetName?: string; model?: string; maxTokens?: number; thinking?: 'enabled' | 'disabled' },
      logLabel: string
    ) => {
      let model = ''
      let presetName = ''
      let usage: AiTokenUsage | null = null
      const result = await runtime.callAI(messages, {
        presetName: config.presetName || '',
        model: config.model || '',
        maxTokens: config.maxTokens,
        thinking: config.thinking || (runtime.brainAgentConfig?.disableRecallThinking === false ? 'enabled' : 'disabled'),
        feature: 'agent',
        logLabel,
        registerAbortController: false,
        usageLabel: logLabel.startsWith('recall-public-steps') ? '召回过程润色' : '召回候选裁判',
        placeLabel: characterName,
        placeType: runtime.sessionPlaceType || 'single',
        onModelInfo: (usedModel, usedPreset) => {
          model = usedModel
          presetName = usedPreset
        },
        onUsageInfo: (usedUsage) => {
          usage = usedUsage
        },
        signal: recallAbortController.signal
      })
      assertRecallNotStopped()
      return {
        text: result,
        model,
        presetName,
        usage
      }
    }
    const publicActivityEvents: RecallActivityEvent[] = []
    let publicMilestones: PublicRecallMilestone[] = []
    let firstPublicRewriteStarted = false
    let secondPublicRewriteStarted = false
    const publishPublicMilestones = (next: PublicRecallMilestone[]) => {
      publicMilestones = next
      updateRecallActivityPublicMilestones(activityRunId, publicMilestones)
    }
    const rewritePublicMilestones = async (ids: string[], label: string) => {
      const batch = publicMilestones.filter((item) => ids.includes(item.id))
      if (!batch.length) return
      try {
        const result = await runRecallJudgeCall(
          [{
            role: 'user',
            content: buildPublicMilestoneRewritePrompt({
              characterName,
              characterDescription: String(runtime.characterDescription || ''),
              characterPersonality: String(runtime.characterPersonality || ''),
              speakingStyleSummary: String(runtime.speakingStyleSummary || ''),
              milestones: batch
            })
          }],
          buildPublicMilestoneRewriteOptions(batch.length),
          label
        )
        const text = typeof result.text === 'string' ? result.text : ''
        if (!text.trim()) return
        publishPublicMilestones(applyPublicMilestoneRewrite(publicMilestones, text))
      } catch (error) {
        console.warn('召回公开过程润色失败:', error)
      }
    }
    const refreshPublicMilestones = () => {
      const next = buildPublicRecallMilestonesFromEvents(publicActivityEvents)
      if (!next.length) return
      const currentTextById = new Map(publicMilestones.map((item) => [item.id, { title: item.title, text: item.text }]))
      const merged = next.map((item) => {
        const current = currentTextById.get(item.id)
        return current ? { ...item, title: current.title, text: current.text } : item
      })
      publishPublicMilestones(merged)
      if (!firstPublicRewriteStarted && merged.length >= 3) {
        firstPublicRewriteStarted = true
        void rewritePublicMilestones(merged.slice(0, 3).map((item) => item.id), 'recall-public-steps-first')
      }
    }
    const handleRecallActivityEvent = (event: RecallActivityEvent) => {
      assertRecallNotStopped()
      appendRecallActivityEvent(event)
      publicActivityEvents.push(event)
      refreshPublicMilestones()
    }
    const callRecallEmbeddings = async (input: string[]) => {
      assertRecallNotStopped()
      const response = await runtime.callEmbeddings(input, {
        signal: recallAbortController.signal,
        characterName
      })
      assertRecallNotStopped()
      if (!response) return null
      return {
        vectors: response.vectors,
        model: String(response.model || ''),
        presetName: String(response.presetName || ''),
        usage: normalizeAiTokenUsage(response.usage, String(response.model || ''))
      }
    }
    const text = await buildAIRecallPromptBlock(
      char,
      docLibraryState?.documents?.length ? docLibraryState.documents : runtime.fallbackDocuments,
      allMessages,
      async (messages) => {
        assertRecallNotStopped()
        return runRecallJudgeCall(
          messages.map((message) => ({ role: message.role as 'system' | 'user' | 'assistant', content: message.content })),
          buildRecallSlotOptions('recallJudge', { maxTokens: runtime.brainAgentConfig?.recallMaxTokens || undefined }),
          'recall-round'
        )
      },
      (result) => {
        confirmedRecallUnitCount = Array.isArray(result.confirmedIds) ? result.confirmedIds.length : 0
        refreshPublicMilestones()
        if (!secondPublicRewriteStarted) {
          secondPublicRewriteStarted = true
          const remainingIds = publicMilestones.slice(3).map((item) => item.id)
          if (remainingIds.length) {
            void rewritePublicMilestones(remainingIds, 'recall-public-steps-rest')
          }
        }
        assertRecallNotStopped()
        pushRecallTrace({
          id: activityRunId,
          timestamp: new Date().toISOString(),
          characterName,
          result
        })
        completeRecallActivity(result)
        preparedRecallActivity = getCurrentRecallActivitySnapshot()
        recallTraceLogText = formatRecallTraceForPromptLog(result)
        recallPriorityUpdates = result.recallPriorityUpdates || {}
        runtime.onRecallTrace?.(result)
      },
      {
        agentConfig: runtime.brainAgentConfig,
        userProfile: runtime.userProfile,
        otherCharacters: runtime.otherCharacters,
        intentSnapshotAI: async (messages) => runRecallJudgeCall(
          messages.map((message) => ({ role: message.role as 'system' | 'user' | 'assistant', content: message.content })),
          buildRecallSlotOptions('recallFormat', { maxTokens: 320 }),
          'recall-intent-snapshot'
        ),
        candidateJudgeAI: async (messages) => runRecallJudgeCall(
          messages.map((message) => ({ role: message.role as 'system' | 'user' | 'assistant', content: message.content })),
          buildRecallSlotOptions('recallJudge', { maxTokens: runtime.brainAgentConfig?.recallMaxTokens || undefined }),
          'recall-round'
        ),
        fallbackJudgeAI: runtime.brainAgentConfig?.fallbackRecallModel || runtime.brainAgentConfig?.fallbackPresetName
          ? async (messages) => runRecallJudgeCall(
              messages.map((message) => ({ role: message.role as 'system' | 'user' | 'assistant', content: message.content })),
              {
                presetName: runtime.brainAgentConfig?.fallbackPresetName || runtime.brainAgentConfig?.presetName || '',
                model: runtime.brainAgentConfig?.fallbackRecallModel || '',
                maxTokens: runtime.brainAgentConfig?.fallbackRecallMaxTokens || runtime.brainAgentConfig?.recallMaxTokens || 512
              },
              'recall-fallback-round'
            )
          : undefined,
        embedTexts: callRecallEmbeddings,
        embeddingVectorCache: runtime.recallEmbeddingVectorCache,
        embeddingCacheScope: runtime.brainAgentConfig?.embeddingPresetId || 'default',
        currentDate: runtime.currentDate,
        includeCandidateChanges: false,
        includeObservableProfiles: !options.characterOnly,
        includeSessionTemporaryEntities: !options.characterOnly,
        includeCharacterLocationArrangements: runtime.includeCharacterLocationArrangements,
        fixedCandidateRound: options.fixedCandidateRound,
        // 聊天回复链路轮上限收紧为 3（硬上限 5 留给角色大脑校准脚本）：压缩裁判长尾耗时
        maxLoopRounds: 3,
        preconfirmedCards: preconfirmedShared.cards,
        preconfirmedReadDecisions: preconfirmedShared.readDecisions,
        onConfirmedCards: (payload) => {
          options.onSharedCards?.(buildSharedRecallCards(payload))
        },
        abortSignal: recallAbortController.signal,
        activityRunId,
        onActivityEvent: handleRecallActivityEvent,
        docLibraryStructure: docLibraryState
          ? {
            manualTreeOrders: docLibraryState.manualTreeOrders,
            treeNodes: docLibraryState.treeNodes,
            treeOrders: docLibraryState.treeOrders,
            treeDiffReport: docLibraryState.treeDiffReport
          }
          : undefined,
        sessionTemporaryEntities
      }
    )
    assertRecallNotStopped()
    const sections = splitRecallPromptSections(text || (confirmedRecallUnitCount > 0 ? '' : buildMinimalCharacterRecallBlock(char)))
    const latestActivity = preparedRecallActivity || getCurrentRecallActivitySnapshot()
    return {
      recallActivity: latestActivity?.id === activityRunId ? latestActivity : null,
      sections,
      taskRunId: recallTaskRunId,
      recallTraceLogText,
      recallPriorityUpdates
    }
  } catch (error) {
    if ((error as { name?: string })?.name !== 'AbortError') {
      failRecallActivity(error)
      preparedRecallActivity = getCurrentRecallActivitySnapshot()
      return {
        recallActivity: preparedRecallActivity,
        sections: splitRecallPromptSections(buildMinimalCharacterRecallBlock(char)),
        taskRunId: recallTaskRunId,
        recallTraceLogText,
        recallPriorityUpdates
      }
    }
    return {
      recallActivity: null,
      sections: null,
      taskRunId: recallTaskRunId
    }
  } finally {
    unlinkExternalAbortSignal?.()
    if (shouldRegisterRecallAbortController && runtime.isRegisteredAbortController?.(recallAbortController)) {
      runtime.setRegisteredAbortController?.(null)
    }
  }
}
