import { isReadonly, nextTick, type Ref } from 'vue'
import type { ChatInputKind, ChatSendPayload } from '../../app/chatSendProtocol'
import { formatAttachmentNote, type ChatImageAttachment } from '../../utils/chatAttachments'
// 带图乐观发送（2026-07-11）：caption 不再阻塞发送后，主聊天用同一个回调接缝把 caption 后台补完的结果
// 回填进已落库的用户消息（见 sendText 内 onCaptionUpdate）。
import type { CaptionUpdateListener } from './useImageAttachments'
import { useGroupReplyPlan } from '../useGroupReplyPlan'
import { useGroupChatExecutor } from '../useGroupChatExecutor'
import type { PreparedAIRecallResult, PreparedSharedRecallCard } from '../useAI'
import { hasVisibleAiReplyBody, normalizeAiOutputText, stripAiThoughtContent } from '../../utils/aiOutput'
import type { AiTokenUsage } from '../../utils/aiUsage'
import {
  bindChatPromptLogMessage,
  bindChatPromptLogMessageBySessionId,
  bindChatRecallActivityLogMessage,
  bindChatRecallActivityLogMessageBySessionId,
  createChatGenerationAttemptArtifactBySessionId,
  createChatPromptLog,
  createChatPromptLogBySessionId,
  createChatRecallActivityLog,
  createChatRecallActivityLogBySessionId,
  fetchSessionTemporaryCharacters,
  createImprovisedCharacterBySessionId,
  getChatStoreActiveSessionId,
  getChatStoreActiveSessionTargetId,
  getChatStoreActiveTargetId,
  getChatStoreCurrentMessages,
  getChatStoreCurrentSession,
  readChatStoreValue,
  organizeSessionTemporaryEntity,
  setChatStoreTyping,
  isMultiCharacterChatSession,
  normalizeChatSessionCharacterParticipants,
  fetchChatPersonalityModelContextBySessionId,
  runChatMessageProjectionBySessionId,
  saveEmbeddedChatMessageProjectionBySessionId,
  runChatProjectionWritebackBySessionId,
  fetchChatPersonalityModelObservationsBySessionId,
  fetchLatestChatPromptLogBySessionMessageId,
  fetchChatSessionBundleById,
  fetchOrchestrationWorkspaceProjection,
  fetchDirectorOrchestrationProjection,
  executeOrchestrationCommands,
  createPostRoundOrchestrationRun,
  listUnresolvedPostRoundOrchestrationRuns,
  transitionPostRoundOrchestrationRun,
  fetchOverdueNarrativeSeeds,
  fetchNarrativeSeeds,
  fetchNarrativeSeedDetail,
  fetchWorldEntities,
  saveWorldEntity,
  createNarrativeSeed,
  recordNarrativeSeedImpact
} from '../../repositories/chatRepository'
import type {
  DirectorOrchestrationProjection,
  OrchestrationCommandEnvelope,
  OrchestrationWorkspaceProjection
} from '../../../shared/orchestrationWorkspace'
import type { AgentContextBundle } from '../../../shared/agentContextProjection'
import { buildPresenceFactOperations, shouldCommitNarrativeFact } from '../../app/orchestrationFactReconciliation'
import {
  buildFastReplyPersonalityPlanCandidates,
  buildFastReplyPlanningHint,
  planFastReplySpeakers
} from '../../app/fastReplyPlanner'
import {
  buildFocusedActionJudgeMessages,
  buildFocusedActionFinalMessages,
  parseFocusedActionJudgeOutput
} from '../../app/focusedActionPrompt'
import { renderFocusedActionContext } from '../../app/agentContext/renderFocusedActionContext'
import { renderRoleReplyContext } from '../../app/agentContext/renderRoleReplyContext'
import {
  buildTidiaoMessageWritingPlanMessages,
  parseMessageWritingPlanOutput
} from '../../app/messageWritingPlan'
import { normalizeChatMessageEditVersionList } from '../../app/chatMessageEditVersionCore'
import {
  FOCUSED_ACTION_DEFAULT_VISIBILITY,
  FOCUSED_ACTION_SOURCE_KIND,
  isFocusedActionMessage,
  readFocusedActionGroupId,
  shouldSuppressFocusedActionAudienceOutputs,
  type FocusedActionVisibility
} from '../../../shared/focusedAction'
import { createPostRoundOrchestrationQueue } from '../../app/postRoundOrchestrationQueue'
import { buildPostRoundDirectorDirective } from '../../app/postRoundDirectorDirective'
import type { PostRoundOrchestrationRun, PostRoundTriggerKind } from '../../../shared/postRoundOrchestration'
import { resolveSessionCharacter } from '../../app/sessionCharacterState'
import { runUserNarrationCommand, type UserNarrationCommand, type UserNarrationRoleProfile } from '../../app/manualNarrationCommand'
import { getTemporaryEntityKindLabel } from '../../app/temporaryEntityCommand'
import { parseStrictMentions, parseStrictUnknownMentions, type StrictMentionCandidate } from '../../app/strictMentionParser'
import {
  parseSessionTemporaryCharacterMentionId,
  sessionTemporaryCharactersBySessionId
} from '../../app/sessionTemporaryCharactersState'
import { buildSessionTemporaryCharacterNarrationPrompt, extractSessionTemporaryCharacterField } from '../../app/sessionTemporaryCharacterCommand'
import { getCurrentRecallActivitySnapshot, markCurrentRecallActivityPersisted, type PersistedRecallActivityRun } from '../../app/recallTraceState'
import { buildNarrationRoundText } from '../../app/narrationOrchestrator'
import { isPersonalityModelReplyMode, resolveReplyPipelineMode, resolveSessionReplyPipelineMode, type ChatReplyPipelineMode, type ReplyWorkflowMode } from '../../app/chatReplyPipelineMode'
import { parseChatInputRoute } from '../../app/chatInputRouter'
import { extractDirectorDirectives } from '../../app/directorDirective'
import {
  buildReplyOrchestrationRouteMessages,
  compareReplySituationDependencySnapshots,
  parseReplyOrchestrationRouteDecision,
  renderReplyOrchestrationRecentTail,
  resolveHardReplyOrchestrationRoute,
  type ReplyOrchestrationRouteDecision,
  type ReplySituationDependencySnapshot
} from '../../app/replyOrchestrationRoute'
import { buildReplySituationDependencySnapshot } from '../../app/replySituationDependencySnapshot'
import {
  buildReplyExecutionAudit,
  resolveReplyBackendComposition,
  resolveReplyExecutionProfile,
  type ReplyExecutionProfile
} from '../../app/replyExecutionProfile'
import { buildReplyExecutionReceipt } from '../../app/replyExecutionReceipt'
import { buildFinalOutboundPrompt } from '../../app/chatPromptAssemblyStages'
import {
  normalizePersonalityPlanBatchOutput,
  buildPersonalityCandidatePlanPrompt,
  rankPersonalityPlanCandidates,
  type PersonalityModelContextBundle,
  type PersonalityPlanCandidate,
  type PersonalityPlanRerankerScore,
  type PersonalityRecallSections
} from '../../app/personalityModelContext'
import {
  buildReviewPlanCandidatesInput,
  normalizeReplyPlanScenarioCode,
  resolveReplyPlanOrchestrationScenarioCode,
  type GeneratePlanBatchToolCall,
  type ReplyPlanCandidate,
  type ReplyPlanExpressionMix,
  type ReplyPlanWordCountAdvice,
  type ReplyPlanOrchestration,
  type ReplyPlanOrchestratorConfig,
  type ReviewPlanCandidatesToolCall
} from '../../app/personalityPlanOrchestrator'
import {
  runReplyPlanOrchestratorHarness,
  type ReplyPlanCurtainSceneUpdateResult,
  type ReplyPlanCurtainSceneUpdateToolCall
} from '../../app/replyPlanOrchestratorHarness'
import {
  prepareCurtainSceneUpdate,
  readCurtainSceneSnapshot,
  sanitizeCurtainLocationPart
} from '../../app/curtainSceneUpdate'
import { orderNarrationCallsInfoBearingFirst, isRoundStartNarrationCall, partitionInterleavedNarrationCalls, type PersonalityNarrationCall } from '../../app/personalityNarrationSubagent'
import type { TidiaoDirectorReplanBrief, TidiaoDirectorStream, TidiaoRetryBrief } from '../../app/tidiaoDirectorStream'
import {
  beginTidiaoDirectorStreamRound,
  buildTidiaoDirectorCarryOverFromStream,
  captureTidiaoDirectorCarryOver,
  captureTidiaoDirectorReplanBrief,
  captureTidiaoDirectorStreamSnapshot,
  clearTidiaoDirectorStreamRound,
  markTidiaoDirectorStreamRoundCorrecting,
  markTidiaoDirectorStreamRoundFailed,
  noteCurtainSceneUpdated,
  setTidiaoDirectorStreamRoundLinks,
  updateTidiaoDirectorStreamRound,
  updateTidiaoDirectorStreamRoundNarrationGen,
  type TidiaoDirectorCarryOver
} from '../../app/tidiaoDirectorStreamState'
import { loadEffectiveOrchestratorConfig } from '../../repositories/orchestratorConfigRepository'
import type { TidiaoRetrievalContext } from '../../app/tidiaoRetrievalTools'
// 批次3·3b 轮级资料池：池结构/隔离读接口 + 会话级缓存（localStorage·不进主库）。
import { createEmptyRoundRecallPools, appendCharacterPoolCards, appendWorldPoolCards, getDirectorVisiblePools, getCharacterPoolCards, getWorldPoolCards, reconcileWorldPoolDocumentScope, renderDirectorVisiblePoolsBlock, type RecallPoolCard, type RoundRecallPools } from '../../app/recallRoundPool'
import { createLocalRecallRoundPoolCache } from '../../app/recallRoundPoolCache'
import { readDocLibraryDocumentIdFromUnitId, readSessionWorldDocLibraryScope } from '../../app/worldDocLibraryScope'
import { projectChatSessionWorldAgentContext } from '../../app/chatSessionWorldAgentContext'
import { renderRelevantNarrativeSeedsBlock } from '../../app/narrativeSeedDirectorContext'
import { isReplyFeatureEnabled } from '../../app/chatTurnPolicy'
import {
  predictNarrativeSeedImpacts,
  reconcileNarrativeSeedFacts,
  selectPersistedNarrativeFactMessages,
  evolveOverdueNarrativeSeeds,
  areNarrativeSeedTitlesEquivalent,
  type NarrativeSeedPredictedImpact
} from '../../app/narrativeSeedImpactAgent'
import { enqueueDeferredWorldEvolutionReport } from '../../app/deferredAgentEventQueue'
import { getHydratedLastScenario, hydrateSessionOrchestrationMaterials } from '../../app/sessionOrchestrationMaterialsAdapter'
// 批次3（2026-07-07 范式优化）：subagent 注册表——runSubagent 统一做运行状态埋点 + 结构化调用（批次2）+ 解析；
// 编剧升真 loop（2026-07-10 剧本系统优化批次3）：runScriptwriterLoop 由接缝层调用，本文件只装配
// callModel（buildDeferredLoopModelCall taskId='scriptwriterConsult'）与取证工具集；旧 spec 注册表已退役。
import { retrievalHitsToWorldPoolCards } from '../../app/recallRoundPoolFill'
import { renderCharacterPoolRecallSections, worldPoolCardsToNarrationEvidence } from '../../app/recallRoundPoolInject'
import { createTidiaoChatMessageReadContext } from '../../app/tidiaoChatMessageTools'
import { createTidiaoChatMessageEditContext } from '../../app/tidiaoChatMessageEditTools'
import {
  createTidiaoMessageProjectionContext,
  renderDirectorProjectionRecentContext
} from '../../app/tidiaoMessageProjectionTools'
// 0-6 分层骨架·「3·对话可见历史」统一可见投影壳（增量2 元数据壳 + 增量5 投影正文/可见性过滤/300 兜底·无条件生效）。
// R1-B B5-2 item1 真合并：精修 loop 已退役，精修走统一编辑 loop runTidiaoCorrectionLoop({ precisionOnly: true })。
import {
  beginTidiaoPrecisionEdit,
  setTidiaoPrecisionEditSegment,
  clearTidiaoPrecisionEdit
} from '../../app/tidiaoMessageEditIndicatorState'
import { runTidiaoCorrectionLoop, type TidiaoCorrectionStrategy, type TidiaoCorrectionRegenRequest, type TidiaoCorrectionCastSeam } from '../../app/tidiaoCorrectionLoop'
// 提调各 loop 切原生工具调用（function-calling）：toolBriefs→OpenAI tools 转换器，callModel 接线时用。
import { toOpenAiTools } from '../../app/agentRuntime/toolRegistry'
import { createRequestEnvelopeDiagnosticTracker } from '../../app/agentRuntime/requestEnvelopeDiagnostics'
import { buildToolsearchOverrideProtocol } from '../../app/tidiaoGlobalTools'
// 原生工具调用客户端兜底自取：注入链任一跳漏接时，pipeline 直接从 useAI() 取 callAIWithTools，
// 避免提调 loop 崩在「callAIWithTools is not a function」（callAIWithTools 自带 initStores、独立可用）。
import { useAI } from '../useAI'
import {
  type TidiaoMessagePromptContext,
  type TidiaoMessagePromptRead
} from '../../app/tidiaoMessagePromptTools'
import { parseChatFloorRefs, formatChatFloorRef } from '../../app/chatMessageFloor'
import { runChatPreReplyEffects } from '../../app/chatPreReplyEffects'
import {
  resolvePlannedGroupSpeakerViews
} from '../../app/chatSpeakerPlanner'
import {
  createEmptySingleChatRunResult,
  type SingleChatRunResult
} from '../../app/chatSpeakerGeneration'
import { setPendingCorrection } from '../../app/chatCorrectionState'
import { rollbackPersistedNarrationMessages } from '../../app/narrationSideEffectRollback'
import {
  castIdsToReplyOrder,
  buildDeterministicCastFallback
} from '../../app/groupCastDecision'
import {
  mergeDirectorCast,
  directorCastToReplyOrder
} from '../../app/groupDirectorPass'
import { runGroupDirectorHarness, type GroupDirectorRecallPoolAppend } from '../../app/groupDirectorHarness'
// 提调建状态栏 scope 确认（并行编排计划批次B·2026-07-10 非阻塞化）：统筹调 confirmStatusScope 经 scopeSeam
// 写全局 pending 弹卡（不打断编排）；确认后经注册 handler 派「造册」子agent后台建栏，取消记拒绝。
import {
  setTidiaoStatusScopePending,
  getTidiaoStatusScopePending,
  registerTidiaoStatusScopeResumeHandler,
  markTidiaoStatusScopeDeclined,
  isTidiaoStatusScopeDeclined,
  buildTidiaoStatusScopeCharacterOptions,
  buildZaoceBatchBrief,
  type TidiaoStatusScopePendingState,
  type TidiaoStatusScopeResolvedItem
} from '../../app/tidiaoStatusScopeState'
import type { XingyiStatusScopeRequest } from '../../app/xingyiStatusScopeTool'
// 「造册」建状态栏子agent（批次B）：工具集=采风只读集+建卡两件套；scope 确认后后台小 loop 建栏。
import { buildZaoceToolset, runZaoceBuild } from '../../app/zaoceSubagent'
// 绘舆阶段确认卡（人在环上通道统一批C·2026-07-12 非阻塞）：staged 派发拿到 awaitingConfirm 时经
// buildHuiyuDispatchSeam 写全局 pending 弹卡（不打断编排）；确认后经注册 handler 复用同一 seam 的
// dispatch 实现续派该阶段，镜像 tidiaoStatusScopeState 的「丢卡不丢需求」advisory 范式。
import {
  getHuiyuStageConfirmPending,
  setHuiyuStageConfirmPending,
  registerHuiyuStageConfirmResumeHandler,
  markHuiyuStageConfirmDeclined,
  isHuiyuStageConfirmDeclined,
  huiyuStageConfirmAnswerText,
  isHuiyuStagedDraftAnswerRejected,
  composeHuiyuStagedDrawInstructions,
  deriveHuiyuStageConfirmKind,
  buildHuiyuStageConfirmPending,
  // 剪影修订环轮数（地图草案剪影可视化计划批3）：advisory 续派专用计数器，与阻塞驱动 revisionRound 参数同语义。
  getHuiyuSketchRevisionRound,
  bumpHuiyuSketchRevisionRound,
  clearHuiyuSketchRevisionRound,
  // 结构化剪影决策 → 续派计划（批3·纯函数，分流规则见该函数头注释）。
  planHuiyuSketchDecisionDispatch,
  type HuiyuStageConfirmPendingState
} from '../../app/huiyuStageConfirmState'
import type { InteractionAnswer } from '../../app/agentRuntime/interactionContract'
import { finishChatGenerationAttempt, makeTidiaoRunId, startChatGenerationAttempt } from '../../app/chatTurnAudit'
import { beginAppendLog, captureAppendLogSnapshot, getActiveDirectorPrompt, restoreAppendLog } from '../../app/agentState/appendLog'
// 真机五验④（2026-07-05·通用重试框架）：轮内失败单元注册表（旁白/角色子工作流失败登记·纠偏 retryFailedWorkflow 重跑）
// + 自动重试缓冲（失败先等 5s 自动再试一次·abort/软停不重试）。执行器在本文件纠偏入口（retrySeam）。
import { registerRoundRetryUnit, listRoundRetryUnits, takeRoundRetryUnit, clearRoundRetryUnits, runWithAutoRetry } from '../../app/roundRetryUnits'
import type { AppendLogEvent } from '../../app/agentState/appendLogTypes'
// 批次3a·提调外部装配（2026-07-04 陈星依总agent计划）：纠偏「装配核心」+ 决策流持久化工厂。
// 一处真值两个入口（联动标注）：聊天内纠偏入口 correctChatMessageViaDirector 与会话级外部装配
// src/app/tidiaoSessionCorrectionRunner.ts 共用下面这套装配/持久化；改口径两处同时生效。
import {
  assembleTidiaoCorrectionContexts,
  beginTidiaoCorrectionRunContainers,
  buildSessionScriptwriterSeam,
  buildTidiaoStatusSystemSeam,
  buildTidiaoCorrectionBandMemory,
  loadDirectorProjectionObservations,
  loadSessionDirectorPrefText,
  normalizeGroupMembers,
  normalizeSessionParticipantMembers,
  renderDirectorSceneContextFromSnapshot,
  resolveMessageDirectorBaseline,
  invalidateSessionLastScenario,
  saveSessionLastScenario,
  withToolsearchOverrideProtocol
} from '../../app/tidiaoCorrectionAssembly'
import { createDirectorStreamPersist } from '../../app/directorStreamPersist'
import { createChatTurnRunner } from '../../app/chatTurnRunner'
import type { ChatTurnInputKind, ChatTurnReplyMode } from '../../app/chatTurnTypes'
import { formatNarrationDebugBlock } from '../../app/narrationDebugFormat'
import { collectMessagesByRounds } from '../../app/characterBrainRecallAI'
import {
  SESSION_MEMORY_KEEP_RECENT,
  SESSION_MEMORY_REFRESH_STEP,
  buildSessionMemoryPrompt,
  parseSessionMemorySummaryOutput,
  selectSessionMemoryFold,
  shouldRefreshSessionMemory,
  type SessionMemoryFact
} from '../../app/sessionMemoryCompression'
import { findNarrationProfileByKind, normalizeBuiltinNarrationKind, normalizeNarrationProfiles, normalizeNarrationTemperature, type BuiltinNarrationKind, type NarrationPlan, type NarrationProfile, type NarrationQuickJudgeResult, type NarrationQuickJudgeTag } from '../../app/narrationProtocol'
import type { PlannedGroupSpeakerViewModel } from '../../types/panelContracts'
import type { AgentModelConfig, ChatPromptLogBlock, ChatSessionTemporaryCharacter } from '../../types'
import { buildMessageEnvironmentSnapshot, extractBriefWeather } from '../../utils/messageEnvironment'
import { buildModelUsageAiOptions } from '../../utils/modelUsageConfig'
// 批次3（2026-07-08 槽位收束 9→4）：调用点经任务分级表取档（改档只动表），subagent 仍走 spec.modelUsage 声明。
import { buildTaskModelAiOptions, type ModelTaskId } from '../../utils/modelTaskTiers'
// 采风钻取 subagent（状态系统融入提调计划批次2·2026-07-10）：统筹派遣的知识钻取小 loop（balanced 校书档）。
import { buildCaifengToolset, renderCaifengDispatchOutcome, runCaifengResearch } from '../../app/caifengSubagent'
import { loadRenderedAgentContext } from '../../app/agentContext/agentContextProvider'
import { requireDirectorOrchestrationProjection } from '../../app/agentContext/directorOrchestrationProjection'
import { buildHuiyuToolset, renderHuiyuDispatchOutcome, runHuiyuMapWork } from '../../app/huiyuSubagent'
// 绘舆阶段管线共享引擎（笔刷约束系统批D）：提调驱动=NON_BLOCKING 通道 stage-per-dispatch（接缝分析见
// buildHuiyuDispatchSeam 头注），星依驱动在 XingyiDock.vue（阻塞通道）——同一台引擎两种确认通道。
import {
  NON_BLOCKING_CONFIRM_CHANNEL,
  renderHuiyuStageDispatchReceipt,
  runHuiyuDraftForRelay,
  runHuiyuStage,
  // 结构化剪影决策（地图草案剪影可视化计划批3）：提调续派入口只负责解析答案，分流规则在
  // huiyuStageConfirmState.planHuiyuSketchDecisionDispatch（纯函数，独立单测）。
  parseHuiyuSketchDecision,
  type HuiyuSketchDecision
} from '../../app/huiyuOrchestration'
import { createHuiyuAuditRunner, resolveCurrentMapStage } from '../../app/huiyuMapTools'
import { resolveEffectiveVirtualScene } from '../../utils/virtualScene'
import { generateAndWriteNarration, type NarrationChatWriteResult } from '../../app/narrationChatWrite'
import { createNarrationReleaseChain, type NarrationReleaseChainGate } from '../../app/narrationReleaseChain'
import { generateNarrationContent } from '../../app/narrationGeneration'
import type { ReplyWorkflowNarrationOutcome, ReplyWorkflowDirectorScriptView } from '../../app/replyWorkflowMessageView'
import { clearCurrentAiUsageContext, setCurrentAiUsageContext } from '../../app/aiUsageContext'
import { assemblePromptFromMessages, type PromptAssemblyTrace } from '../../app/promptAssemblyPipeline'
import {
  buildPersonalityPromptLibraryAssembly,
  type PersonalityPromptLibraryAssemblyResult
} from '../../app/personalityPromptLibraryAssembly'
import { resolveDynamicPromptMessages } from '../../utils/promptContext'
import {
  parseEmbeddedMessageProjectionOutput
} from '../../app/messageProjectionAgent'
type ChatRole = 'user' | 'assistant' | 'system'

type PersonalityNarrationSubagentSkillReadSource = 'read_tool' | 'confirmed_call'

type PersonalityNarrationSubagentSkillReadAudit = {
  profileId: string
  profileName: string
  triggerDescription: string
  source: PersonalityNarrationSubagentSkillReadSource
}

type PersonalityNarrationSubagentCallAudit = {
  profileIds: string[]
  profileNames: string[]
  narrationKind: string
  /** 批次2 二分类语义标注：true=信息承载，false=纯描写（保守默认信息承载）。供审计/过程轨标注用。 */
  informationBearing: boolean
  reason: string
  generatedPromptPreview: string
}

type PersonalityNarrationSubagentRunAudit = {
  called: boolean
  messageIds: number[]
  readSkills: PersonalityNarrationSubagentSkillReadAudit[]
  confirmedCalls: PersonalityNarrationSubagentCallAudit[]
  terminalReason: string
}

function buildPromptBlocksFromPreparedMessages(
  messages: Array<{ role: ChatRole; content: string }>,
  policyId: string
): ChatPromptLogBlock[] {
  return assemblePromptFromMessages(messages, {
    policyId,
    sourceKind: 'manual'
  }).promptBlocks
}

// R1-B item7 withToolsearchOverrideProtocol：批次3a 移入 tidiaoCorrectionAssembly（各 deferred loop callModel 共用·经上方 import 引入）。
type ToastType = 'success' | 'error' | 'info' | 'warning'

type PromptMessageBuilder = (
  targetId: string,
  scene: unknown,
  options?: {
    taskRunId?: string
    forceEmptyRecall?: boolean
    forceEmptyRoleProfile?: boolean
    suppressCurrentUserInputTemplate?: boolean
    userIdentityChangeNotice?: string
    scenarioMountedPromptText?: string
  }
) => Array<{ role: ChatRole | string; content: string }>

type PromptPresetSyncStoreLike = {
  ensureBuiltinPromptPresets?: () => Promise<unknown> | unknown
}

export async function ensureScenarioMountedPromptPlaceholderBeforeAssembly(
  settingStore: PromptPresetSyncStoreLike | null | undefined,
  scenarioMountedPromptText?: string
): Promise<void> {
  if (!String(scenarioMountedPromptText || '').trim()) return
  if (typeof settingStore?.ensureBuiltinPromptPresets !== 'function') return
  try {
    await settingStore.ensureBuiltinPromptPresets()
  } catch (error) {
    console.warn('同步情境挂载提示词占位失败:', error)
  }
}

interface MessagePayload {
  role: 'user' | 'assistant'
  content: string
  time: string
  name: string
  messageKind?: string
  message_kind?: string
  memberName?: string
  memberTargetId?: string
  member_target_id?: string
  speakerTargetId?: string
  speaker_target_id?: string
  envDate?: string
  envWeather?: string
  envLocation?: string
  model?: string
  messageSourceKind?: string
  message_source_kind?: string
  focusedActionGroupId?: string
  focused_action_group_id?: string
  focusedActionVisibility?: FocusedActionVisibility
  focused_action_visibility?: FocusedActionVisibility
  /** 图片附件（输入框图片上传计划批4）：只在用户新发送带图消息时非空；随 addMessage 透传给
   *  chatStore.addMessage → createChatMessageBySessionId，服务端落 attachments_json（批1已支持）。 */
  attachments?: ChatImageAttachment[]
}


interface CharacterLike {
  id: string
  name: string
  [key: string]: unknown
}

interface CharacterGroupLike {
  id: string
  name: string
  emoji?: string
  orderIndex?: number
  [key: string]: unknown
}

interface GroupLike {
  id: string
  members?: string | string[] | Array<{
    characterId?: string
    character_id?: string
    charId?: string
    char_id?: string
    probability?: number
    replyChance?: number
  }>
}

// SessionParticipantLike：随 normalizeSessionParticipantMembers 一并移入 tidiaoCorrectionAssembly（批次3a）。

interface ChatStoreLike {
  current?: {
    currentChatTarget?: string | { value: string }
    currentSession?: { id?: string } | null | { value: { id?: string } | null }
    currentMessages?: Array<Record<string, unknown>> | { value: Array<Record<string, unknown>> }
    getActiveTargetId?: () => string
    getActiveSessionId?: () => string
    getActiveSessionTargetId?: () => string
    getCurrentMessages?: () => Array<Record<string, unknown>>
  }
  runtime?: {
    isTyping?: boolean | { value: boolean }
    stopRequested?: boolean | { value: boolean }
  }
  stopRequested?: boolean | { value: boolean }
  isTyping: boolean
  currentChatTarget: string
  activeChatTargetId?: string
  activeChatSessionId?: string
  activeChatSessionTargetId?: string
  currentSession?: { id?: string } | null
  currentMessages: Array<Record<string, unknown>>
  getActiveTargetId?: () => string
  getActiveSessionId?: () => string
  getActiveSessionTargetId?: () => string
  getCurrentMessages?: () => Array<Record<string, unknown>>
  setTyping?: (value: boolean) => void
  setCurrentMessageModel?: (model: string) => void
  stopGeneration?: () => void
  clearStopRequest?: () => void
  shouldStop?: () => boolean
  clearLocalStreamingMessages?: () => void
  addMessage: (targetId: string, message: MessagePayload, options?: { skipLocalSync?: boolean; sessionId?: string }) => Promise<void | number>
  // 批次5c：删本轮已落库的半成品旁白（DB + 本地缓存），用于中断/取消时回滚副作用。
  deleteMessage?: (targetId: string, messageId: number) => Promise<void> | void
  // 带图乐观发送（2026-07-11）：caption 后台补完后用它把合并好的完整附件数组整体回填已落库的消息
  // （同时更新本地缓存/当前消息列表——真实 store 实现见 chatStoreMessageRemoteActions.ts::editMessage）。
  editMessage?: (targetId: string, messageId: number, payload: Record<string, unknown>) => Promise<void>

  queuePendingPersistedMessage?: (targetId: string, message: any) => void
  flushPendingPersistedMessages?: (targetId: string) => void
  upsertLocalStreamingMessage?: (targetId: string, messageKey: string, message: any) => void
  removeLocalStreamingMessage?: (targetId: string, messageKey: string) => void
  finalizeLocalStreamingMessage?: (targetId: string, messageKey: string, message: any) => boolean
  updateSession?: (targetId: string, changes: Record<string, unknown>) => Promise<void> | void
  switchSession?: (sessionId: string) => Promise<void> | void
}

type LocalAnchoredMessage = Record<string, unknown> & {
  _localInsertAfterMessageId?: number
}

interface CharStoreLike {
  characters: CharacterLike[]
  characterGroups?: CharacterGroupLike[]
  groups: GroupLike[]
  userProfile: { name?: string; displayName?: string; desc?: string; appearance?: string }
  getCharacter?: (id: string) => any
  updateCharacter?: (id: string, changes: Record<string, unknown>) => Promise<void>
}

interface UseChatSendPipelineContext {
  charStore: CharStoreLike
  chatStore: ChatStoreLike
  settingStore: {
    currentTime: string
    currentWeather: string
    currentLocation: string
    addLocationChange: (from: string, to: string) => void
    ensureBuiltinPromptPresets?: () => Promise<unknown> | unknown
    agentModelConfigs?: unknown[]
  }
  settingEnvironmentService?: {
    saveEnvironment: () => Promise<void>
  }
  chatInputText: Ref<string>
  plusMenuOpen: Ref<boolean>
  atMenuOpen: Ref<boolean>
  mentionSelectedChars: Ref<string[]>
  mentionExcludedChars: Ref<string[]>
  /** 图片附件（输入框图片上传计划批4；批「带图乐观发送」2026-07-11 加 onCaptionUpdate）：与 chatInputText
   *  同源同层；sendText 在确认走「回复」路径后（斜杠指令等其它路由不消费）await 取走并清空，取到的附件贯穿
   *  本轮 addUserMessage 落库 + 角色正文原生图注入。只等上传（拿真 url），不再等 caption——传入
   *  onCaptionUpdate 时，caption 后台跑完会回调一次，供 sendText 把结果回填进已落库的消息。 */
  takeImageAttachments?: (onCaptionUpdate?: CaptionUpdateListener) => Promise<ChatImageAttachment[]>
  filteredAtCharacters?: Ref<Array<CharacterLike & { kind?: string; nicknames?: string[] | string }>>
  currentAlias: Ref<{ id?: string; name?: string; desc?: string; appearance?: string } | null>
  streamingText: Ref<string>
  currentStreamingSpeakerName: Ref<string>
  currentStreamingTargetId: Ref<string>
  environmentNarrationLoading?: Ref<boolean>
  plannedGroupSpeakers?: Ref<PlannedGroupSpeakerViewModel[]>
  buildChatMessages: (
    targetId: string,
    userText: string,
    history?: Array<{ role: string; content: string } & Record<string, unknown>>,
    speakerTargetId?: string,
    options?: { skipPrepareRecall?: boolean; taskRunId?: string; abortSignal?: AbortSignal; forceEmptyRecall?: boolean; forceEmptyRoleProfile?: boolean; suppressCurrentUserInputTemplate?: boolean; skipRecallToFinalConfirmation?: boolean; userIdentityChangeNotice?: string; recallVisibleMessagesOverride?: unknown[]; scenarioMountedPromptText?: string; purePrompt?: boolean }
  ) => Promise<Array<{ role: string; content: string }>>
  buildPromptMessages?: PromptMessageBuilder
  prepareAIRecall?: (charId: string, options?: {
    characterOnly?: boolean
    taskRunId?: string
    abortSignal?: AbortSignal
    sharedCards?: PreparedSharedRecallCard[]
    onSharedCards?: (cards: PreparedSharedRecallCard[]) => void
    storeForPrompt?: boolean
    fixedCandidateRound?: number
    skipRecallToFinalConfirmation?: boolean
    visibleMessagesOverride?: unknown[]
  }) => Promise<PreparedAIRecallResult | void>
  /** 提调取料三件套接缝（批次1d-A）：发送链路注入，存在即让提调可按需调用语义召回/文本搜索/定点读取。 */
  buildTidiaoRetrievalContext?: (charId: string, options?: { docLibraryOnly?: boolean; sessionId?: string }) => TidiaoRetrievalContext | null
  /** 轮级资料池填池接缝（批次3·3b-2·U4 转正常开）：接线即启用——decideRoundDirector 开局对 cast 伪并行预召回填池。 */
  fillRoundRecallPools?: (cast: Array<{ characterId: string }>, query: string, options?: { topK?: number; fillCharacterIds?: string[]; fillWorld?: boolean; sessionId?: string }) => Promise<{ characterPools: Record<string, RecallPoolCard[]>; worldPool: RecallPoolCard[] }>

  getAIOptions: (targetId: string) => { presetName?: string; model?: string; temperature?: number; maxTokens?: number; thinking?: 'enabled' | 'disabled'; logLabel?: string }
  callAIStream: (
    messages: Array<{ role: ChatRole; content: string }>,
    options?: {
      presetName?: string
      model?: string
      temperature?: number
      maxTokens?: number
      thinking?: 'enabled' | 'disabled'
      logLabel?: string
      signal?: AbortSignal
      usageLabel?: string
      placeLabel?: string
      placeType?: 'single' | 'group' | 'other'
      // 批次P3a：中策重生成接缝按消息类型选正常回复模型档（role_message/narration），与 ops 重放同口径。
      feature?: string
      onPromptPrepared?: (payload: {
        messages: Array<{ role: ChatRole; content: string }>
        finalPrompt: string
        promptBlocks?: ChatPromptLogBlock[]
        preparedAt: string
      }) => void | Promise<void>
      /** 通道A·当轮原生图（批4）：非空时 useAI.ts::callAIStream 把 messages 里最后一条 user 消息升级为
       *  parts 数组（文字+每图 image_url）；messages 本身仍按 string 声明，升级发生在实现内部，透明于本文件。 */
      currentAttachments?: ChatImageAttachment[]
    },
    onChunk?: (chunk: string) => void,
    callbacks?: { onModelInfo?: (model: string, preset: string) => void; onUsageInfo?: (usage: AiTokenUsage) => void }
  ) => Promise<string | null>
  callAI: (
    messages: Array<{ role: ChatRole; content: string }>,
    options?: Record<string, unknown>
  ) => Promise<string | null>
  /** 原生工具调用（function-calling）：传 tools 走原生通道，返回 { content, toolCalls }。
   *  提调纠偏/精修/回复编排 loop 的 callModel 用它把 toolBriefs→tools 下发，工具名/参数由 API 协议保证。 */
  callAIWithTools?: (
    messages: Array<{ role: ChatRole | 'tool'; content: string; tool_calls?: unknown; tool_call_id?: string }>,
    options?: Record<string, unknown>
  ) => Promise<{ content: string; toolCalls: unknown[]; reasoningContent?: string; usage?: AiTokenUsage | null } | null>
  cleanAiPrefix: (text: string) => string
  getTargetName: (targetId: string) => string
  scrollToBottom: () => void
  toast: (msg: string, type?: ToastType, duration?: number) => void
  confirm?: (message: string) => boolean
  prompt?: (message: string, defaultValue?: string) => string | null
  runtimeStore?: {
    startChatTaskRun?: (payload: {
      id?: string
      taskKind: 'normalMessage' | 'narrationPolish' | 'narrationGenerate' | 'tidiaoDispatch'
      label?: string
      targetId?: string
      sessionId?: string
      abortController?: AbortController | null
      foreground?: boolean
    }) => { id: string; abortController?: AbortController | null } | null
    updateChatTaskRun?: (runId: string, patch: {
      metrics?: Record<string, number | string | boolean | null> | null
    }) => unknown
    completeChatTaskRun?: (runId: string) => unknown
    failChatTaskRun?: (runId: string, error: unknown) => unknown
    stopChatTaskRun?: (runId: string) => unknown
    isChatTaskRunActive?: (runId: string) => boolean
    startAgentTaskNotice?: (payload: {
      id?: string
      title: string
      message?: string
      sourceLabel?: string
      step?: string
      sourceCharacterId?: string
    }) => string
    updateAgentTaskNotice?: (payload: {
      id?: string
      message?: string
      step?: string
      detail?: string
      status?: 'running' | 'waiting' | 'success' | 'error' | 'info'
    }) => void
    completeAgentTaskNotice?: (payload?: {
      id?: string
      message?: string
      step?: string
      detail?: string
    }) => void
    failAgentTaskNotice?: (payload: {
      id?: string
      message?: string
      step?: string
      error?: unknown
      detail?: string
    }) => void
  }
  canSeeNarrationDebug?: boolean | (() => boolean)
}

// 批次4：同一会话的滚动记忆压缩单飞。真正的增量边界持久化在
// chat_sessions.context_summary_message_id，重载或多窗口后也不会把旧事实整批重复折叠。
const sessionMemoryRefreshInFlight = new Map<string, Promise<void>>()

// 批次1d-B：退役「先行并行召回预热」（自动召回）。true=退役（默认）：提调链路不再自动全量召回，
// 特殊料只走提调按需取料三件套（recallSemantic/searchWorldText/fetchUnitDetail），常规料（投影/身份/在场）
// 仍由框架自动供给——符合 §4.5 混合取料本意。false=回退旧的先行并行召回（计划生成/评审吃带召回全量上下文）。
// 这是可逆退役开关；退出条件=用户真模型实跑确认 cast/取料质量稳定后，删除 false 分支与 prepareAIRecall 接线。
const AUTO_RECALL_RETIRED: boolean = true

function readBrainAgentConfigFromList(configs: unknown): Partial<AgentModelConfig> | null {
  return Array.isArray(configs)
    ? (configs.find((item: any) => String(item?.id || '').trim() === 'brain_agent') as Partial<AgentModelConfig> | undefined) || null
    : null
}

type ChatSendCommandDeps = {
  chatStore: ChatStoreLike
  chatInputText: Ref<string>
  plusMenuOpen: Ref<boolean>
  atMenuOpen: Ref<boolean>
  sendText: (text: string, options?: { inputKind?: ChatInputKind }) => Promise<void>
}

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  return String(err ?? '')
}

function allocatePlanBatchIdSuffix(strategy: string, counts: Map<string, number>): string {
  const key = String(strategy || 'strategy').trim() || 'strategy'
  const nextCount = (counts.get(key) || 0) + 1
  counts.set(key, nextCount)
  return nextCount > 1 ? `_batch${nextCount}` : ''
}

function startSlashCommandNotice(runtimeStore: UseChatSendPipelineContext['runtimeStore'], payload: {
  command: string
  message: string
  step?: string
}) {
  return runtimeStore?.startAgentTaskNotice?.({
    title: `执行 ${payload.command}`,
    message: payload.message,
    sourceLabel: '聊天命令',
    step: payload.step || payload.message
  }) || ''
}

function updateSlashCommandNotice(runtimeStore: UseChatSendPipelineContext['runtimeStore'], id: string, payload: {
  message: string
  step?: string
  detail?: string
  status?: 'running' | 'waiting' | 'success' | 'error' | 'info'
}) {
  if (!id) return
  runtimeStore?.updateAgentTaskNotice?.({
    id,
    message: payload.message,
    step: payload.step || payload.message,
    detail: payload.detail,
    status: payload.status || 'running'
  })
}

function completeSlashCommandNotice(runtimeStore: UseChatSendPipelineContext['runtimeStore'], id: string, payload: {
  message: string
  step?: string
  detail?: string
}) {
  if (!id) return
  runtimeStore?.completeAgentTaskNotice?.({
    id,
    message: payload.message,
    step: payload.step || payload.message,
    detail: payload.detail
  })
}

function failSlashCommandNotice(runtimeStore: UseChatSendPipelineContext['runtimeStore'], id: string, payload: {
  message: string
  step?: string
  error?: unknown
  detail?: string
}) {
  if (!id) return
  runtimeStore?.failAgentTaskNotice?.({
    id,
    message: payload.message,
    step: payload.step || payload.message,
    error: payload.error,
    detail: payload.detail
  })
}

function isAbortError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'name' in err && (err as { name?: string }).name === 'AbortError'
}

function createAbortError(): Error {
  const error = new Error('生成已停止')
  error.name = 'AbortError'
  return error
}

// normalizeGroupMembers / normalizeSessionParticipantMembers：批次3a 移入 tidiaoCorrectionAssembly（经上方 import 引入·单一真值）。

function shouldUseGroupChatPipeline(targetId: string, session: any): boolean {
  if (resolveSessionReplyPipelineMode(session) === 'pure_prompt') return false
  return isMultiCharacterChatSession(session, targetId)
}

function getLocalInsertAfterMessageId(message: Record<string, unknown>): number {
  const raw = Number(message?._localInsertAfterMessageId || 0)
  return Number.isFinite(raw) && raw > 0 ? raw : 0
}

function findLocalInsertIndex(list: Array<Record<string, unknown>>, insertAfterMessageId: number): number {
  if (!insertAfterMessageId) return -1
  const anchorIndex = list.findIndex((item: any) => Number(item?.id || 0) === insertAfterMessageId)
  if (anchorIndex < 0) return -1
  let insertIndex = anchorIndex + 1
  while (
    insertIndex < list.length
    && Number((list[insertIndex] as any)?._localInsertAfterMessageId || 0) === insertAfterMessageId
  ) {
    insertIndex += 1
  }
  return insertIndex
}

function upsertLocalMessage(list: Array<Record<string, unknown>>, messageKey: string, message: LocalAnchoredMessage) {
  const index = list.findIndex((item: any) => item?._localStreamingKey === messageKey)
  const nextMessage = { ...(index >= 0 ? list[index] : {}), ...message, _localStreamingKey: messageKey }
  if (index >= 0) {
    list[index] = nextMessage
  } else {
    const insertIndex = findLocalInsertIndex(list, getLocalInsertAfterMessageId(nextMessage))
    if (insertIndex >= 0) {
      list.splice(insertIndex, 0, nextMessage)
    } else {
      list.push(nextMessage)
    }
  }
}

function removeLocalMessage(list: Array<Record<string, unknown>>, messageKey: string) {
  const index = list.findIndex((item: any) => item?._localStreamingKey === messageKey)
  if (index >= 0) {
    list.splice(index, 1)
  }
}

function finalizeLocalMessage(list: Array<Record<string, unknown>>, messageKey: string, message: Record<string, unknown>) {
  const index = list.findIndex((item: any) => item?._localStreamingKey === messageKey)
  if (index < 0) return false
  const current = list[index] || {}
  const nextMessage = { ...current, ...message }
  delete (nextMessage as any)._localStreamingKey
  list[index] = nextMessage
  return true
}

function appendPersistedMessage(list: Array<Record<string, unknown>>, message: Record<string, unknown>) {
  const persistedId = (message as any)?.id
  if (persistedId && list.some((item: any) => item?.id === persistedId)) return
  list.push({ ...message })
}

function getActiveTargetId(chatStore: ChatStoreLike) {
  return getChatStoreActiveTargetId(chatStore)
}

function getActiveSessionId(chatStore: ChatStoreLike) {
  return getChatStoreActiveSessionId(chatStore)
}

function getActiveSessionTargetId(chatStore: ChatStoreLike) {
  return getChatStoreActiveSessionTargetId(chatStore)
}

function getCurrentMessageList(chatStore: ChatStoreLike) {
  return getChatStoreCurrentMessages(chatStore)
}

function setTyping(chatStore: ChatStoreLike, value: boolean) {
  setChatStoreTyping(chatStore, value)
}

function clearStopRequest(chatStore: ChatStoreLike) {
  chatStore.clearStopRequest?.()
}

function stopActiveReplyRuntime(chatStore: ChatStoreLike) {
  if (typeof chatStore.stopGeneration === 'function') {
    chatStore.stopGeneration()
  } else {
    setTyping(chatStore, false)
    setCurrentMessageModel(chatStore, '')
  }
  chatStore.clearLocalStreamingMessages?.()
}

function isStopRequested(chatStore: ChatStoreLike): boolean {
  if (typeof chatStore.shouldStop === 'function' && chatStore.shouldStop()) return true
  const runtimeStopRequested = readChatStoreValue(chatStore.runtime?.stopRequested)
  if (runtimeStopRequested !== undefined) return Boolean(runtimeStopRequested)
  return Boolean(readChatStoreValue(chatStore.stopRequested))
}

function setCurrentMessageModel(chatStore: ChatStoreLike, model: string) {
  chatStore.setCurrentMessageModel?.(model)
}

function isConflictError(err: unknown): boolean {
  return typeof err === 'object'
    && err !== null
    && 'status' in err
    && Number((err as { status?: number }).status) === 409
}

function isBadRequestError(err: unknown): boolean {
  return typeof err === 'object'
    && err !== null
    && 'status' in err
    && Number((err as { status?: number }).status) === 400
}

async function persistCurrentRecallActivity(input: {
  sessionId: string
  targetId: string
  speakerName: string
  inputMessageId?: number
  assistantMessageId: number
  activity?: PersistedRecallActivityRun | null
}) {
  const activity = input.activity || getCurrentRecallActivitySnapshot()
  if (!activity) return
  const activityPayload = activity as unknown as Record<string, unknown>
  if (activity.persistedLogId) {
    if (input.sessionId) {
      await bindChatRecallActivityLogMessageBySessionId(
        input.sessionId,
        activity.persistedLogId,
        input.assistantMessageId,
        Number(input.inputMessageId || 0)
      )
    } else {
      await bindChatRecallActivityLogMessage(
        input.targetId,
        activity.persistedLogId,
        input.assistantMessageId,
        Number(input.inputMessageId || 0)
      )
    }
    return
  }
  if (!activity.id || !Array.isArray(activity.events) || activity.events.length === 0) return
  const payload = {
    speakerName: input.speakerName,
    targetId: input.targetId,
    inputMessageId: Number(input.inputMessageId || 0),
    assistantMessageId: input.assistantMessageId,
    activity: activityPayload
  }
  const result = input.sessionId
    ? await createChatRecallActivityLogBySessionId(input.sessionId, payload)
    : await createChatRecallActivityLog(input.targetId, payload)
  const logId = String(result.id || '')
  if (!logId) throw new Error('召回活动日志创建成功但缺少日志 ID')
  activity.persistedLogId = logId
  const currentActivity = input.activity ? getCurrentRecallActivitySnapshot() : activity
  if (!input.activity || currentActivity?.id === activity.id) {
    markCurrentRecallActivityPersisted(logId)
  }
  if (input.assistantMessageId > 0 && Number(result.assistantMessageId || 0) !== input.assistantMessageId) {
    if (input.sessionId) {
      await bindChatRecallActivityLogMessageBySessionId(input.sessionId, logId, input.assistantMessageId, Number(input.inputMessageId || 0))
    } else {
      await bindChatRecallActivityLogMessage(input.targetId, logId, input.assistantMessageId, Number(input.inputMessageId || 0))
    }
  }
}

function queuePendingPersistedMessage(chatStore: ChatStoreLike, targetId: string, message: Record<string, unknown>) {
  const sessionId = String((message as any)?._sessionId || '')
  chatStore.queuePendingPersistedMessage?.(sessionId || targetId, message)
}

function upsertStreamingMessage(
  chatStore: ChatStoreLike,
  targetId: string,
  messageKey: string,
  message: Record<string, unknown>
) {
  if (typeof chatStore.upsertLocalStreamingMessage === 'function') {
    chatStore.upsertLocalStreamingMessage(String((message as any)?._sessionId || targetId), messageKey, message)
    return true
  }
  if (!isTargetActive(chatStore, targetId)) return false
  const localMessageList = getCurrentMessageList(chatStore)
  upsertLocalMessage(localMessageList, messageKey, message)
  return true
}

function removeStreamingMessage(chatStore: ChatStoreLike, targetId: string, messageKey: string) {
  if (typeof chatStore.removeLocalStreamingMessage === 'function' && targetId) {
    chatStore.removeLocalStreamingMessage(targetId, messageKey)
    return true
  }
  const localMessageList = getCurrentMessageList(chatStore)
  removeLocalMessage(localMessageList, messageKey)
  return true
}

function finalizeStreamingMessage(
  chatStore: ChatStoreLike,
  targetId: string,
  messageKey: string,
  message: Record<string, unknown>
) {
  if (typeof chatStore.finalizeLocalStreamingMessage === 'function') {
    return chatStore.finalizeLocalStreamingMessage(String((message as any)?._sessionId || targetId), messageKey, message)
  }
  if (!isTargetReady(chatStore, targetId)) return false
  const localMessageList = getCurrentMessageList(chatStore)
  return finalizeLocalMessage(localMessageList, messageKey, message)
}

function isTargetActive(chatStore: ChatStoreLike, targetId: string) {
  return getActiveTargetId(chatStore) === String(targetId || '')
}

function isTargetReady(chatStore: ChatStoreLike, targetId: string) {
  return Boolean(getActiveSessionId(chatStore))
    && isTargetActive(chatStore, targetId)
    && getActiveSessionTargetId(chatStore) === String(targetId || '')
}

export function useChatSendPipeline({
  charStore,
  chatStore,
  settingStore,
  settingEnvironmentService,
  chatInputText,
  plusMenuOpen,
  atMenuOpen,
  mentionSelectedChars,
  mentionExcludedChars,
  takeImageAttachments,
  filteredAtCharacters,
  currentAlias,
  streamingText,
  currentStreamingSpeakerName,
  currentStreamingTargetId,
  environmentNarrationLoading,
  plannedGroupSpeakers,
  buildChatMessages,
  buildPromptMessages,
  prepareAIRecall,
  buildTidiaoRetrievalContext,
  fillRoundRecallPools,
  getAIOptions,
  callAI,
  callAIWithTools,
  callAIStream,
  cleanAiPrefix,
  getTargetName,
  scrollToBottom,
  toast,
  confirm,
  prompt,
  runtimeStore,
  canSeeNarrationDebug
}: UseChatSendPipelineContext) {
  // 原生工具调用客户端解析：优先用注入的 callAIWithTools；注入缺失（注入链漏接）时兜底从 useAI() 自取并缓存。
  // 仅在真要调用且注入缺失时才创建一次 useAI 实例（callAIWithTools 自带 initStores、不依赖注入参数即可工作）。
  let _fallbackCallAIWithTools: NonNullable<typeof callAIWithTools> | null = null
  const resolveCallAIWithTools = (): NonNullable<typeof callAIWithTools> => {
    if (typeof callAIWithTools === 'function') return callAIWithTools
    if (!_fallbackCallAIWithTools) {
      _fallbackCallAIWithTools = useAI().callAIWithTools as unknown as NonNullable<typeof callAIWithTools>
    }
    return _fallbackCallAIWithTools
  }
  const safeCurrentStreamingSpeakerName: { value: string } = currentStreamingSpeakerName || { value: '' }
  const safeCurrentStreamingTargetId: { value: string } = currentStreamingTargetId || { value: '' }
  const safeEnvironmentNarrationLoading: { value: boolean } = environmentNarrationLoading || { value: false }
  const safePlannedGroupSpeakers: { value: PlannedGroupSpeakerViewModel[] } = plannedGroupSpeakers || { value: [] as PlannedGroupSpeakerViewModel[] }
  const localMessageTargets = new Map<string, string>()
  const localMessageSessions = new Map<string, string>()
  // 串行压缩批C2（2026-07-13）：并行群聊下多个 speaker 的 runSingleChat 可能落在同一毫秒内起跑，
  // 单靠 Date.now() 拼 localMessageKey 会撞 key 互踩占位消息；自增序号兜底唯一。
  let singleChatLocalMessageKeySeq = 0
  let activePipelineSessionId = ''
  let activePipelineInputMessageId = 0
  // 本轮用户图片附件（输入框图片上传计划批4）：sendText 在「回复」路径确认后 take 一次赋值，供
  // callFinalRoleModel（通道A原生图）与 decideRoundDirector（提调层5 caption note）同轮读取；
  // regenerate/纠偏/精修等重放路径不产生新附件，各自入口显式清零，防止误读上一轮残留。
  let activePipelineUserAttachments: ChatImageAttachment[] = []
  let activePipelineRunId = 0
  // 轮级提调主键（稳定字符串，落库）：与内存自增 activePipelineRunId（仅门控、不落库）并存。
  // 每轮入口生成一次，群聊一轮所有发言者 attempt 共享同一个 → 支持「编排带一轮一条」与按 runId 聚合审计。
  let activePipelineTidiaoRunId = ''
  // R3-2 append log 生命周期集中点（用户 2026-06-27 拍板 pipeline 集中 helper）：铸新 runId 并按当前
  // activePipelineSessionId 起一条保真 append log；内容由 harness 经 runtime onEvent 实时 append。
  // 7 处发送/重掷/纠偏路径统一用它替代裸 makeTidiaoRunId()，保证每条提调带都有保真原始事件流。
  // 注意：调用前 activePipelineSessionId 必须已设为本轮会话（runId-first 站点已上移 sessionId 赋值）。
  function beginTidiaoRun(): string {
    const runId = makeTidiaoRunId()
    beginAppendLog({ runId, sessionId: activePipelineSessionId })
    return runId
  }
  let activePipelineTaskRunId = ''
  let activeGenerationAttemptId = ''
  let activePipelineNarrationKinds = new Set<BuiltinNarrationKind>()
  // 用户私密提调指令（director directive·只管当前这一轮）：用户用双层方括号【【…】】下达、只给提调看的指令。
  // 在 sendText 入口从输入抠出，全链路其余地方只用剥离后的 cleanText；这里只随本轮注入提调编排上下文，
  // 不进角色提示词/旁白正文/投影。每轮入口重置，retry/group 等无新指令的路径默认空。
  let activePipelineDirectorDirectives: string[] = []
  // 增量3·本轮开局读到的「历次 OOC 私密指令」快照（跨轮累积·prior 轮·当轮 append 前的快照，避免与当轮 directorDirectives 重复）。
  // 方案 B：本轮统筹剧本（提调「整轮前置统筹 pass」产物）。群聊一轮生成一次，供：
  // ① 每发言者注入回复方向（castDirections: characterId→方向）真注入正文；
  // ② 第一条角色 trace 种入 directorStream（决策流快照）供新带 TidiaoDirectorStreamBand 一轮一条展示；
  // seeded 保证只种第一条。随 resetActivePipelineState 每轮清零。
  let activeRoundDirector: {
    script: ReplyWorkflowDirectorScriptView
    castDirections: Map<string, string>
    seeded: boolean
    // E2：群聊导演 loop 产出的实时决策流最终快照（捕获自轮级载体），种进第一条成员 processTrace.directorStream，
    // 历史复原走新带 TidiaoDirectorStreamBand（与单聊一致）。null=未捕获到快照（不出编排带、正文照常）。
    directorStream: TidiaoDirectorStream | null
    // F3·旁白彻底归提调：提调 loop 收集的轮级旁白调用（含 generatedPrompt），管线在首发言者一次性据此生成旁白正文；
    // 空数组=提调本轮不要旁白（want=false 真无旁白）。narrationStarted 是「一轮只生成一次」闸口（首发言者置 true）。
    // 旁白穿插（2026-07-06 用户拍板「旁白不必总在开头」）：narrationStarted/首发言者起跑只管 round_start 子集；
    // after_speaker/round_end 子集进 narrationInterleavedPending，锚点角色消息落库后由 flushRoundInterleavedNarration
    // 按段生成（生成时能看到该角色实际说了什么）；completions 收集各段生成 promise，轮末统一收束。
    narrationCalls: PersonalityNarrationCall[]
    narrationStarted: boolean
    narrationInterleavedPending: PersonalityNarrationCall[]
    narrationInterleavedCompletions: Promise<unknown>[]
    // 穿插/收尾旁白预生成（串行压缩批C1-②·2026-07-13）：锚点角色正文生成完成瞬间（落库前）就预起跑其名下
    // 穿插旁白，key=speakerCharacterId（round_end 段用 NARRATION_PREFETCH_ROUND_END_KEY）。生成产物在此 holding，
    // 等 flushRoundInterleavedNarration 命中后回填真实锚点 id 再落库；resolveAnchor 未被 flush 调用（角色生成
    // 失败/未出场等）时由 settleRoundInterleavedNarration 兜底 resolve(undefined)，防止轮末收束死等。
    narrationPrefetchHolding: Map<string, {
      completion: Promise<PersonalityNarrationSubagentRunAudit>
      infoBearingSettled: Promise<void>
      resolveAnchor: (insertAfterMessageId: number | undefined) => void
      anchorSettled: boolean
    }>
    // 批次4-投影 B（合并进 directorProjectionContext 开关·ON 时）：提调统筹时用的那份投影态上下文（A 批 recentContext 串），
    // 随轮级载体下发给各分镜，替代分镜独立拉取的「判情境用上下文」（compose 全量人格上下文仍各自 fetch、保留）。
    // 运行态字段·不进 script、不落库。缺省（开关关）=undefined，分镜走原 compressedContext，零回归。
    downstreamProjectionContext?: string
    // 批B·人格模型按需直通道（2026-07-13）：只装提调本轮判 planMode='direct' 的角色（characterId→计划），
    // personality 角色不进本 Map。runSingleChat 据 speakerTargetId 查表，命中即走单计划直通道、跳过演员机三段。
    castPlans: Map<string, { planMode: 'direct'; plan: string }>
    // 串行压缩批C2（2026-07-13）：并行群聊在派发角色前提前起跑 round_start 段旁白时，把句柄存在这里——
    // narrationStarted 闸口已提前置位，各 speaker 的 buildReplyWorkflowFinalContext 内局部 roundDirectorNarration
    // 必为 null（抢闸条件已不满足），改从这里读同一份共享句柄 await infoBearingSettled（全员都要承接开场事实）。
    // 单聊/C1 串行路径：由 runSingleChat 内联抢闸时顺带写这里，取值上等价（只是没人需要读它）。
    roundDirectorNarration?: {
      completion: Promise<PersonalityNarrationSubagentRunAudit>
      infoBearingSettled: Promise<void>
      audit: PersonalityNarrationSubagentRunAudit
    } | null
  } | null = null
  type ReplySituationCheckpointLifecycle = {
    runId: number
    sessionId: string
    anchorMessageId: number
    failureReason: string
    invalidated: boolean
    invalidationPromise: Promise<void> | null
    pendingAssistantProjections: Set<Promise<void>>
  }
  // 检查点是轮级事务：新用户消息落库后先把旧 checkpoint 持久化失效；只有正文、旁白、
  // 应执行的投影及事实提交全部成功，才允许用轮末依赖快照重新提交。
  let activeReplySituationCheckpointLifecycle: ReplySituationCheckpointLifecycle | null = null
  // 叙事种子批次4：finishRound 后立即起跑预测；角色/旁白全部收束后再把实际落库消息交给事实核对。
  // 预测 promise 不进入角色生成 await 链，生命周期快照在 reset 前转交给后台事实提交。
  let activeNarrativeImpactLifecycle: {
    worldId: string
    sessionId: string
    directorRunId: string
    anchorMessageId: number
    relevantSeedsBlock: string
    committedChanges: string
    allowedSeedIds: Set<string>
    predicted: Promise<NarrativeSeedPredictedImpact[]>
    callModel?: ReturnType<typeof buildDeferredLoopModelCall>
    presenceProposals: Array<{
      participantId: string
      expectedVersion: number
      proposalEventId: string
      speakerNames: string[]
    }>
  } | null = null
  // 灰度开关持久化（默认全关·真机连跑用·控制台入口见 useAppShellChatDomain 的 __langhuanChatFlags）：
  // 仅 localStorage 显式写过的开关为 true；普通用户/新浏览器读不到 → 默认关、主链路零行为变更。
  // ⚠️ 联动维护：这是临时灰度设施，现仅一批（directorProjectionContext·批次4-投影）在用；
  //    （unifiedSingleChatDirector / directedRecastRetry / recallRoundPool 均已转正退役·见 docs/history/2026-06-27_退役-单聊群聊分裂导演/）
  //    各批收口「翻默认」后，对应开关连同本套持久化入口一并删除（别长期残留）。
  const CHAT_GRAY_FLAG_STORAGE_KEY = 'langhuan_chat_gray_flags_v1'
  //（U1 转正）支持「按键默认值」：开关转正后默认翻 ON，但 DevTools 显式写过的值（含显式 OFF）优先覆盖默认——
  //   真机连跑对照期可临时关 ON 路回旧路。未显式写过该键时返回 defaultOn。
  function readChatGrayFlag(key: string, defaultOn = false): boolean {
    if (typeof window === 'undefined') return defaultOn
    try {
      const raw = window.localStorage.getItem(CHAT_GRAY_FLAG_STORAGE_KEY)
      if (!raw) return defaultOn
      const flags = JSON.parse(raw) || {}
      return key in flags ? Boolean(flags[key]) : defaultOn
    } catch {
      return defaultOn
    }
  }
  function writeChatGrayFlag(key: string, on: boolean): void {
    if (typeof window === 'undefined') return
    try {
      const raw = window.localStorage.getItem(CHAT_GRAY_FLAG_STORAGE_KEY)
      const flags = raw ? (JSON.parse(raw) || {}) : {}
      flags[key] = Boolean(on)
      window.localStorage.setItem(CHAT_GRAY_FLAG_STORAGE_KEY, JSON.stringify(flags))
    } catch {
      // 持久化失败不影响开关本身（内存值已生效）。
    }
  }
  // 定向重掷（U2 转正·2026-06-28 永久常开·开关已删·见 docs/history/2026-06-27_退役-单聊群聊分裂导演/）：
  //   普通重试（无意见、非纠偏续跑）+ 能读回原轮已定方向（2a 落库的 directedRecast）时，按原轮 providedScenario+方向
  //   只重掷正文（不进导演 loop/不重判情境/不重做旁白/不动决策流带）。无方向源 / 带意见 / 纠偏续跑 → 落
  //   regenerateAssistantViaDirector 完整导演 loop（群聊也走·去 !multiCharacterSession 门）；纯净回复仍走 else 老 callAIStream。
  // 轮级资料池化（U4 转正·2026-06-28 永久常开·开关 recallRoundPool 已删·见 docs/history/2026-06-27_退役-单聊群聊分裂导演/）：
  //   decideRoundDirector 开局对本轮候选伪并行 A1 轻量预召回填 characterPools（私有大脑+外貌例外·绝不含文档库）+
  //   文档库填 worldPool 缓存到 (sessionId, anchorMessageId)；提调据各池定方向、注入侧按容器物理隔离。
  //   自然启用门 = 填池接缝 fillRoundRecallPools 是否接线（prod 与核心取料接缝同源恒接=池化常开；缺省则降级 docLibraryOnly-only 兜底）。
  // 批次4-投影 A 开关（增量5·2026-07-02 用户拍板「整套转正·默认 ON」）：现只管「协议优先投影 + 下发分镜投影上下文」。
  //   层3·对话可见历史已**无条件**走统一可见投影壳（renderDirectorVisibleHistory·投影正文+可见性过滤+300 兜底），不再受本开关左右。
  //   true（默认）=grounding/决策 step1 切「默认读投影、原文仅按需」 + 投影态上下文下发各分镜替代其独立判情境上下文。
  //   false（真机对照 hatch·DevTools 显式 OFF）=协议不切投影优先、不下发分镜——仅供真机回退对照，层3仍是投影历史。
  //   ⚠️ 退役后续：真机验稳后删本 flag + setter + __langhuanChatFlags.directorProjection 入口（连同持久化基建评估）。
  let directorProjectionContext = readChatGrayFlag('directorProjectionContext', true)
  // 批次D·directorPromptRebuild（0-6 分层骨架·2026-07-02 用户拍板默认 ON）：群聊统筹 loop 每 turn 重建 0-6 prompt
  //   （层5=结构化操作日志取代 raw transcript）。DevTools 显式 OFF=真机对照 hatch（回 append-only 原样转发）。
  //   ⚠️ 退役后续：真机验稳后删本 flag + setter + __langhuanChatFlags.directorPromptRebuild 入口。
  let directorPromptRebuild = readChatGrayFlag('directorPromptRebuild', true)
  // 轮级资料池会话级缓存（localStorage·刷新仍在·不进主库 langhuan.db）。composable 作用域单例。
  const roundRecallPoolCache = createLocalRecallRoundPoolCache()
  function readSessionById(sessionId: string): any {
    const current = getChatStoreCurrentSession(chatStore)
    if (String(current?.id || '').trim() === sessionId) return current
    const store = chatStore as any
    return store?.entities?.chatSessions?.[sessionId]
      || store?.chatSessions?.[sessionId]
      || null
  }

  /** 每次消费世界池前都按服务端会话读模型裁剪，避免切世界后旧知识跨世界泄漏。 */
  function loadWorldScopedRecallPools(sessionId: string, createWhenMissing = false): RoundRecallPools | null {
    if (!sessionId) return null
    const pools = roundRecallPoolCache.load(sessionId)
      || (createWhenMissing ? createEmptyRoundRecallPools(sessionId, '') : null)
    if (!pools) return null
    const scope = readSessionWorldDocLibraryScope(readSessionById(sessionId))
    if (reconcileWorldPoolDocumentScope(pools, scope, readDocLibraryDocumentIdFromUnitId)) {
      roundRecallPoolCache.save(pools)
    }
    return pools
  }
  // 本轮资料池锚（roundAnchorId）：decideRoundDirector 填池与 3c 注入侧读池共用同一解析，保证缓存命中（key 一致）。
  // 优先本轮新加用户消息 id（activePipelineInputMessageId），否则回退消息列表里最后一条用户消息 id。
  function resolveActiveRoundAnchorId(): number {
    if (activePipelineInputMessageId > 0) return activePipelineInputMessageId
    const messageList = getCurrentMessageList(chatStore) as Array<Record<string, unknown>>
    return Number([...messageList].reverse().find((m: Record<string, unknown>) => m?.role === 'user')?.id || 0)
  }
  // 批次3·3c（对话级·2026-06-29）：读本会话资料池（按 sessionId·跨轮持久）。无会话/无缓存 → null（调用方据此不注入；未填池自然零注入）。
  function loadActiveRoundRecallPools(): RoundRecallPools | null {
    const sessionId = activePipelineSessionId || getActiveSessionId(chatStore)
    if (!sessionId) return null
    return loadWorldScopedRecallPools(sessionId)
  }
  // 读本会话编排倾向（批次5 收编：缓存门面在装配核心 loadSessionDirectorPrefText·此处只解析活动会话 id）。
  function loadActiveDirectorPref(): string {
    const sessionId = activePipelineSessionId || getActiveSessionId(chatStore)
    if (!sessionId) return ''
    return loadSessionDirectorPrefText(sessionId)
  }

  // 编剧调用接缝（批次5 收编装配核心·2026-07-07；2026-07-10 剧本系统优化批次3 升真 loop）：
  // 装配真值=tidiaoCorrectionAssembly.buildSessionScriptwriterSeam（会话剧本缓存+倾向注入+runScriptwriterLoop），
  // 本壳注入 smart 掌阁档 loop 模型调用（buildDeferredLoopModelCall taskId='scriptwriterConsult'）+ 可选取证工具集
  // （research 传采风同款取证料时 buildCaifengToolset 复用装配；纠偏轮无取证料=空工具集凭 brief 编·优雅降级）。
  // 旧 buildSubagentModelCall/SCRIPTWRITER_SUBAGENT_SPEC 单次调用路径已随 subagentSpec 注册表退役。
  // 消费方：统筹 runGroupDirectorHarness.scriptSeam + 纠偏 runTidiaoCorrectionLoop.scriptSeam（精修子模式不挂）。
  const buildScriptwriterSeam = (deps: {
    sessionId: string
    originRunId: string
    agentConfig: unknown
    /** 只读取证料（采风 CaifengToolsetDeps 同形·统筹调用点传入；缺省=编剧零取证工具）。 */
    research?: Parameters<typeof buildCaifengToolset>[0]
  }) => {
    const callModel = buildDeferredLoopModelCall({
      agentConfig: deps.agentConfig,
      taskId: 'scriptwriterConsult',
      maxTokens: 2048,
      temperature: 0.4,
      logLabel: 'scriptwriter-subagent-background',
      placeType: 'group'
    })
    return buildSessionScriptwriterSeam(deps.sessionId, callModel, {
      tools: deps.research ? buildCaifengToolset(deps.research) : [],
      originRunId: deps.originRunId,
      loadContextBlock: async () => (await loadRenderedAgentContext({
        agentKind: 'scriptwriter',
        sessionId: deps.sessionId
      })).text
    })
  }

  // 采风派遣接缝装配（融入计划批次2·2026-07-10）：dispatch 闭包绑定「与统筹同一份」取证接缝（读原文/投影/
  // 三件套/大脑召回/状态栏·命中落池副作用共享——采风查回的角色料/世界料进会话池，统筹与后续轮都可见）
  // + balanced 校书档模型调用（buildDeferredLoopModelCall taskId 复用·usage 透传给运行卡）。
  // 每轮 decideRoundDirector 新建：运行卡计数器归 1，旧轮同 key 运行卡被新轮自然覆盖（防长会话堆积·刷新即清）。
  const buildCaifengDispatchSeam = (deps: {
    sessionId: string
    candidates: Array<{ characterId: string; name: string }>
    chatMessageReadContext?: Parameters<typeof buildCaifengToolset>[0]['chatMessageReadContext']
    projectionContext?: Parameters<typeof buildCaifengToolset>[0]['projectionContext']
    retrievalContext?: Parameters<typeof buildCaifengToolset>[0]['retrievalContext']
    recallPoolAppend?: Parameters<typeof buildCaifengToolset>[0]['recallPoolAppend']
    statusSystem?: Parameters<typeof buildCaifengToolset>[0]['statusSystem']
    agentConfig: unknown
    abortSignal?: AbortSignal
  }) => {
    const tools = buildCaifengToolset({
      sessionId: deps.sessionId,
      candidates: deps.candidates,
      ...(deps.chatMessageReadContext ? { chatMessageReadContext: deps.chatMessageReadContext } : {}),
      ...(deps.projectionContext ? { projectionContext: deps.projectionContext } : {}),
      ...(deps.retrievalContext ? { retrievalContext: deps.retrievalContext } : {}),
      ...(deps.recallPoolAppend ? { recallPoolAppend: deps.recallPoolAppend } : {}),
      ...(deps.statusSystem ? { statusSystem: deps.statusSystem } : {})
    })
    const callModel = buildDeferredLoopModelCall({
      agentConfig: deps.agentConfig,
      taskId: 'caifengResearch',
      // 校书档默认 1024 不够写逐条结论：覆写 2048；检索任务求稳 temperature 0.3。
      maxTokens: 2048,
      temperature: 0.3,
      logLabel: 'caifeng-research',
      placeType: 'group',
      ...(deps.abortSignal ? { abortSignal: deps.abortSignal } : {})
    })
    let taskCounter = 0
    return {
      dispatch: async (input: { task: string; instructions: string; focus?: string; timeoutMinutes?: number }) => {
        taskCounter += 1
        let contextBlock = ''
        try {
          contextBlock = (await loadRenderedAgentContext({
            agentKind: 'caifeng',
            sessionId: deps.sessionId,
            userText: input.instructions
          })).text
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          return {
            content: `采风任务「${input.task}」未启动：统一原始可见上下文加载失败（${message}）。`,
            ok: false,
            details: { error: message, failure: { kind: 'context-unavailable' } }
          }
        }
        const result = await runCaifengResearch(input, {
          sessionId: deps.sessionId,
          taskKey: String(taskCounter),
          tools,
          contextBlock,
          callModel,
          ...(input.timeoutMinutes !== undefined ? { timeoutMs: input.timeoutMinutes * 60_000 } : {}),
          ...(deps.abortSignal ? { signal: deps.abortSignal } : {})
        })
        return {
          content: renderCaifengDispatchOutcome(input, result),
          ok: result.ok,
          details: { coverage: result.coverage, ...(result.error ? { error: result.error } : {}), ...(result.failure ? { failure: result.failure } : {}) }
        }
      }
    }
  }

  // 绘舆派遣接缝装配（地图系统批5·2026-07-11）：dispatch 闭包=会话世界判定（每次派发现查 world_id——用户可能
  // 中途在舆图弹窗挂世界；未挂=不起 loop，回执如实说明，不算工具错误）+ 绘舆工具集（地图九件+采风只读集与
  // 统筹同一份取证接缝——绘舆可读对话/状态栏核对剧情事实）+ balanced 校书档模型调用（taskId='mapDraw'）。
  // 统筹与纠偏两入口共用本工厂（联动能力：接缝字段变化两处同步）。
  // 批D（笔刷约束系统·阶段管线）三路由：mode:'draw'=原直落笔（零变化）；mode:'draft'=草案转呈
  // （runHuiyuDraftForRelay，回执教提调 askUser 转呈后带草案重派 draw）；mode:'staged'/override:'terraform'
  // =共享引擎 runHuiyuStage + NON_BLOCKING_CONFIRM_CHANNEL（stage-per-dispatch：每次派发只做当前阶段一个
  // 分段，确认点立即回执，提调按回执 askUser 问人后带 stagedStep/confirmAnswer 重派——提调的 askUser 是
  // 「终止本轮等下条消息」的信号工具，没有能在单次工具调用内挂起等真人的通道，故不做嵌套挂起）。
  const buildHuiyuDispatchSeam = (deps: {
    sessionId: string
    candidates: Array<{ characterId: string; name: string }>
    chatMessageReadContext?: Parameters<typeof buildCaifengToolset>[0]['chatMessageReadContext']
    projectionContext?: Parameters<typeof buildCaifengToolset>[0]['projectionContext']
    retrievalContext?: Parameters<typeof buildCaifengToolset>[0]['retrievalContext']
    recallPoolAppend?: Parameters<typeof buildCaifengToolset>[0]['recallPoolAppend']
    statusSystem?: Parameters<typeof buildCaifengToolset>[0]['statusSystem']
    agentConfig: unknown
    abortSignal?: AbortSignal
    // 绘舆阶段确认卡（人在环上通道统一批C）：staged 派发遇 awaitingConfirm 时写 pending 用——
    // 大脑召回落池接缝入场券，纠偏入口（无锚）不传时缺省 0（写卡仍可用，只是重派时跳过池接缝）。
    anchorMessageId?: number
  }) => {
    const callModel = buildDeferredLoopModelCall({
      agentConfig: deps.agentConfig,
      taskId: 'mapDraw',
      // 校书档默认 1024 不够写交稿三件（summary+changes+mapDigest）：覆写 2048；作图求稳 temperature 0.3。
      maxTokens: 2048,
      temperature: 0.3,
      logLabel: 'huiyu-mapwork',
      placeType: 'group',
      ...(deps.abortSignal ? { abortSignal: deps.abortSignal } : {})
    })
    const buildResearchDeps = () => ({
      sessionId: deps.sessionId,
      candidates: deps.candidates,
      ...(deps.chatMessageReadContext ? { chatMessageReadContext: deps.chatMessageReadContext } : {}),
      ...(deps.projectionContext ? { projectionContext: deps.projectionContext } : {}),
      ...(deps.retrievalContext ? { retrievalContext: deps.retrievalContext } : {}),
      ...(deps.recallPoolAppend ? { recallPoolAppend: deps.recallPoolAppend } : {}),
      ...(deps.statusSystem ? { statusSystem: deps.statusSystem } : {})
    })
    let taskCounter = 0
    return {
      dispatch: async (input: {
        task: string
        instructions: string
        focus?: string
        mode: 'draft' | 'draw' | 'staged'
        stagedStep?: 'draft' | 'draw' | 'confirmStage'
        confirmAnswer?: string
        override?: 'terraform'
      }) => {
        const sessionId = String(deps.sessionId || '').trim()
        if (!sessionId) {
          return {
            content: `绘舆任务「${input.task}」未启动：缺少正式会话作用域，无法加载统一原始可见上下文。`,
            ok: false,
            details: { reason: 'missing-session-scope' }
          }
        }
        // 世界判定现查：地图只挂世界（无双轨·批4 拍板），未挂世界没有作图对象。
        let worldId = ''
        try {
          const bundle = await fetchChatSessionBundleById(sessionId, { limit: 1 })
          worldId = String(bundle?.session?.worldId ?? bundle?.session?.world_id ?? '').trim()
        } catch {
          worldId = ''
        }
        if (!worldId) {
          return {
            content: `绘舆任务「${input.task}」未执行：本会话尚未加入世界，没有可作图的舆图（地图挂在世界上，用户可在舆图弹窗一键创建/选择世界）。本轮叙事先不依赖地图信息，也不必重派。`,
            ok: false,
            details: { reason: 'no-world' }
          }
        }
        let contextBlock = ''
        try {
          contextBlock = (await loadRenderedAgentContext({
            agentKind: 'huiyu_dispatch',
            sessionId,
            userText: input.instructions
          })).text
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          return {
            content: `绘舆任务「${input.task}」未启动：统一原始可见上下文加载失败（${message}）。`,
            ok: false,
            details: { reason: 'agent-context-load-failed', error: message }
          }
        }
        taskCounter += 1
        const baseInput = {
          task: input.task,
          instructions: input.instructions,
          ...(input.focus ? { focus: input.focus } : {})
        }
        // 阶段管线（staged/terraform）：当前阶段由 meta.confirmedAtStage 现查推导，跨派发自持。
        if (input.mode === 'staged' || input.override === 'terraform') {
          const stage = await resolveCurrentMapStage(worldId)
          // 绘舆阶段确认卡（人在环上通道统一批C）：已有一张待处理卡/本会话已拒绝过同一确认点时都不再
          // 重复派发，避免堆叠重复的 LLM 草案/落笔调用（kind 判定见 deriveHuiyuStageConfirmKind）。
          const impliedKind = deriveHuiyuStageConfirmKind(input)
          if (getHuiyuStageConfirmPending()) {
            return {
              content: `绘舆阶段制任务「${input.task}」未派发：已有一张绘舆确认卡在等用户处理，请等用户确认/驳回后再派（不必现在重试或催促）。`,
              ok: false,
              details: { reason: 'confirm-pending', stage }
            }
          }
          if (isHuiyuStageConfirmDeclined(deps.sessionId, { stage, kind: impliedKind })) {
            return {
              content: `绘舆阶段制任务「${input.task}」未派发：用户已经拒绝过「${stage}」阶段的这类确认，本会话内不要再对同一确认点重复请求，如实回归剧情即可。`,
              ok: false,
              details: { reason: 'declined', stage }
            }
          }
          const result = await runHuiyuStage(stage, {
            ...baseInput,
            ...(input.stagedStep ? { step: input.stagedStep } : {}),
            ...(input.confirmAnswer ? { confirmAnswer: input.confirmAnswer } : {}),
            ...(input.override ? { override: input.override } : {})
          }, {
            sessionId,
            contextBlock,
            taskKey: String(taskCounter),
            worldId,
            research: buildResearchDeps(),
            callModel,
            confirmChannel: NON_BLOCKING_CONFIRM_CHANNEL,
            audit: createHuiyuAuditRunner({ worldId }),
            ...(deps.abortSignal ? { signal: deps.abortSignal } : {})
          })
          const pendingCard = buildHuiyuStageConfirmPending(deps.sessionId, input, stage, result, {
            candidates: deps.candidates,
            anchorMessageId: deps.anchorMessageId
          })
          if (pendingCard) setHuiyuStageConfirmPending(pendingCard)
          return {
            content: renderHuiyuStageDispatchReceipt(input, result),
            ok: result.ok,
            details: {
              stage: result.stage,
              status: result.status,
              ...(result.nextStep ? { nextStep: result.nextStep } : {}),
              ...(result.nextStage ? { nextStage: result.nextStage } : {}),
              ...(result.changes?.length ? { changes: result.changes } : {}),
              ...(result.mapDigest ? { mapDigest: result.mapDigest } : {}),
              ...(result.error ? { error: result.error } : {})
            }
          }
        }
        // 草案转呈（mode:'draft'·批D 与星依侧对位补齐）：只拟稿不落笔，回执带草案确认卡与重派指引。
        if (input.mode === 'draft') {
          const outcome = await runHuiyuDraftForRelay(baseInput, {
            sessionId,
            contextBlock,
            taskKey: String(taskCounter),
            worldId,
            research: buildResearchDeps(),
            callModel,
            ...(deps.abortSignal ? { signal: deps.abortSignal } : {})
          })
          return { content: outcome.content, ok: outcome.ok, details: outcome.details }
        }
        // 直落笔（mode:'draw'）：批5 原路径零变化。
        const tools = buildHuiyuToolset({
          map: { worldId },
          research: buildResearchDeps()
        })
        const result = await runHuiyuMapWork(baseInput, {
          sessionId,
          contextBlock,
          taskKey: String(taskCounter),
          tools,
          callModel,
          audit: createHuiyuAuditRunner({ worldId }),
          ...(deps.abortSignal ? { signal: deps.abortSignal } : {})
        })
        return {
          content: renderHuiyuDispatchOutcome(baseInput, result),
          ok: result.ok,
          details: { changes: result.changes, mapDigest: result.mapDigest, ...(result.error ? { error: result.error } : {}) }
        }
      }
    }
  }

  // deferred loop 模型调用装配（批次5 收编·统筹/纠偏/精修三处 callModel 同一件）：
  // toolsearch 越权话术拼接 + toolBriefs→OpenAI tools + orchestration 档 callAIWithTools。
  // 新 deferred loop 接线一律用本函数，不再各自内联三件套。
  // 融入计划批次2：taskId 可指定档位（缺省 directorLoop=统筹/纠偏/精修 smart 档；采风传 caifengResearch=balanced）；
  // 返回透传 usage（采风运行卡 token 累计用·统筹侧忽略该字段零影响）。
  const buildDeferredLoopModelCall = (options: {
    agentConfig: unknown
    maxTokens: number
    temperature: number
    logLabel: string
    usageLabel?: string
    placeLabel?: string
    placeType: 'single' | 'group'
    abortSignal?: AbortSignal
    /** 任务档位 id（modelTaskTiers 查表·缺省 'directorLoop'）。 */
    taskId?: ModelTaskId
    /** 每次调用前的守门（纠偏/精修=assertPipelineCanContinue；缺省无）。 */
    beforeCall?: () => void
    /** usage ledger 稳定调用族；提调四条正式 loop 必传，其他 mini agent 可不传。 */
    profileId?: string
    /** 同一次 runtime/harness 的稳定运行 id。 */
    harnessRunId?: string
    /** 是否启用逐轮 prompt rebuild；仅作诊断分类，不改变调用行为。 */
    promptRebuild?: boolean
  }) => {
    const envelopeTracker = createRequestEnvelopeDiagnosticTracker()
    return async ({
      messages,
      activeTools = [],
      toolBriefs,
      toolCatalog,
      turnIndex = 0,
      toolEpoch = 0,
      toolEpochTurnIndex = turnIndex
    }: {
      messages: Array<{ role: 'system' | 'user' | 'assistant' | 'tool'; content: string }>
      activeTools?: string[]
      toolBriefs: Array<{ name: string; brief: string; schema?: Record<string, unknown> }>
      toolCatalog?: Array<{ name: string; brief: string; recommended: boolean }>
      turnIndex?: number
      toolEpoch?: number
      toolEpochTurnIndex?: number
    }) => {
      options.beforeCall?.()
      // R1-B item7：deferred 模式把 toolsearch 越权话术拼进 system 协议（toolCatalog 空则原样·零影响）。
      const sentMessages = withToolsearchOverrideProtocol(messages, toolCatalog, {
        fullAuthorizedToolsLoaded: toolEpoch >= 1
      })
      const tools = toOpenAiTools(toolBriefs)
      const modelOptions = buildTaskModelAiOptions(options.agentConfig as any, options.taskId ?? 'directorLoop', {
        maxTokens: options.maxTokens, temperature: options.temperature, thinking: 'disabled'
      })
      const diagnostics = envelopeTracker.capture({
        model: {
          presetName: modelOptions.presetName,
          model: modelOptions.model,
          modelUsageSlotId: modelOptions.modelUsageSlotId
        },
        tools,
        toolChoice: 'auto',
        thinking: modelOptions.thinking,
        messages: sentMessages,
        activeToolNames: activeTools
      })
      const result = await resolveCallAIWithTools()(sentMessages as any, {
        ...modelOptions,
        tools,
        feature: 'agent',
        logLabel: options.logLabel,
        ...(options.usageLabel ? { usageLabel: options.usageLabel } : {}),
        ...(options.placeLabel ? { placeLabel: options.placeLabel } : {}),
        placeType: options.placeType,
        ...(options.profileId ? { profileId: options.profileId } : {}),
        ...(options.harnessRunId ? { harnessRunId: options.harnessRunId } : {}),
        modelTurnIndex: turnIndex,
        toolEpoch,
        toolEpochTurnIndex,
        promptRebuild: options.promptRebuild === true,
        ...diagnostics,
        ...(options.abortSignal ? { signal: options.abortSignal } : {})
      })
      return {
        content: result?.content ?? '',
        toolCalls: result?.toolCalls ?? [],
        ...(result?.usage ? {
          usage: {
            promptTokens: result.usage.promptTokens,
            completionTokens: result.usage.completionTokens,
            cacheReadTokens: result.usage.cacheReadTokens,
            cacheCreationTokens: result.usage.cacheCreationTokens
          }
        } : {})
      }
    }
  }

  // 资料池 grounding 块 + 按需落池接缝装配（批次5 收编·2026-06-30 纯按需取料口径原样）：
  // 开局不强制 embedding 预召回，只读会话级已累积池（历史轮命中/用户手加卡）渲染给提调，并绑定落池接缝——
  // 是否取料完全由提调用工具（三件套世界料 / recallCharacterBrain 角色料）按需决定，命中即累积进会话池。
  // 启用门 = fillRoundRecallPools 是否接线（prod 恒接）+ sessionId/轮锚在位；deps 深绑 pipeline 闭包（填池接缝/池缓存），
  // 故按「就地命名 build 函数」集中放置（计划书批次5 两级处理口径），不外移装配核心。
  function buildDirectorRecallPoolSeam(
    sessionId: string,
    anchorMessageId: number,
    candidates: Array<{ characterId: string; name: string }>,
    candidateIds: string[]
  ): { poolVisibilityBlock: string; recallPoolAppend?: GroupDirectorRecallPoolAppend } {
    if (!fillRoundRecallPools || !sessionId || !(anchorMessageId > 0)) return { poolVisibilityBlock: '' }
    try {
      // 对话级（2026-06-29）：按 sessionId 读对话池（跨轮/跨带重启持久）；无则空池（不再预填）。
      const pools = loadWorldScopedRecallPools(sessionId, true)!
      const poolVisibilityBlock = renderDirectorVisiblePoolsBlock(
        getDirectorVisiblePools(pools),
        (id) => candidates.find((c) => c.characterId === id)?.name || id
      )
      const recallPoolAppend: GroupDirectorRecallPoolAppend = {
        // 世界料只查文档库：三件套命中转 doc_library 卡追加进世界池。
        world: (hits) => {
          try {
            const cards = retrievalHitsToWorldPoolCards(hits)
            if (!cards.length) return
            appendWorldPoolCards(pools, cards)
            roundRecallPoolCache.save(pools)
          } catch (error) {
            console.warn('世界池追加召回落池失败（不阻断）:', error)
          }
        },
        // 角色料只查该角色大脑+公共区：复用 fillRoundRecallPools 单角色填池（fillWorld:false 不重填世界·
        // observable 仍按全场 candidateIds 构造，与开局预填同口径）→ appendCharacterPoolCards(X) 合并去重。
        recallCharacter: async (characterId, query, topK) => {
          try {
            if (!candidateIds.includes(characterId)) return []
            const filled = await fillRoundRecallPools!(
              candidateIds.map((id) => ({ characterId: id })),
              query,
              { topK, fillCharacterIds: [characterId], fillWorld: false, sessionId }
            )
            const cards = filled.characterPools[characterId] || []
            if (cards.length) {
              appendCharacterPoolCards(pools, characterId, cards)
              roundRecallPoolCache.save(pools)
            }
            return cards.map((card) => ({ unitId: card.id, title: card.title, snippet: String(card.bodyText || card.summary || ''), score: card.score }))
          } catch (error) {
            console.warn('角色池追加召回失败（不阻断）:', error)
            return []
          }
        }
      }
      return { poolVisibilityBlock, recallPoolAppend }
    } catch (error) {
      console.warn('轮级资料池预召回/渲染失败（不阻断导演 loop）:', error)
      return { poolVisibilityBlock: '' }
    }
  }

  const chatTurnRunner = createChatTurnRunner()

  function beginActiveChatTurn(input: {
    runId: number
    sessionId: string
    targetId: string
    taskRunId: string
    inputKind: ChatTurnInputKind
    replyMode: ChatTurnReplyMode
    replyExecutionProfile?: ReplyExecutionProfile
    replyOrchestrationDecision?: ReplyOrchestrationRouteDecision
    abortSignal?: AbortSignal
  }) {
    chatTurnRunner.begin({
      runId: input.runId,
      inputKind: input.inputKind,
      context: {
        sessionId: input.sessionId,
        targetId: input.targetId,
        taskRunId: input.taskRunId,
        replyMode: input.replyMode,
        ...(input.replyExecutionProfile ? { replyExecutionProfile: input.replyExecutionProfile } : {}),
        ...(input.replyOrchestrationDecision ? { replyOrchestrationDecision: input.replyOrchestrationDecision } : {}),
        abortSignal: input.abortSignal
      }
    })
  }

  function markActiveTurnInputMessage(inputMessageId: number) {
    chatTurnRunner.setInputMessageId(inputMessageId)
  }

  function markActiveTurnGenerationAttempt(generationAttemptId: string) {
    chatTurnRunner.setGenerationAttemptId(generationAttemptId)
  }

  function markActiveTurnTemporaryEntityNarration() {
    chatTurnRunner.setInputKind('session_temporary_entity_narration')
    chatTurnRunner.updateContext({ replyMode: 'session_temporary_entity_narration' })
  }


  function readCurrentUserDisplayName(): string {
    return String(currentAlias.value?.name || charStore.userProfile.name || '我').trim() || '我'
  }

  // 提调对用户的称呼名（用户名优先；缺省「用户」，不写死「用户」/「我」）——注入导演协议与纠偏合成决策。
  function readUserAddressName(): string {
    return String(currentAlias.value?.name || charStore.userProfile.name || '').trim() || '用户'
  }

  function readMessageDisplayName(message: Record<string, unknown> | null | undefined): string {
    return String(message?.name ?? message?.memberName ?? message?.member_name ?? '').trim()
  }

  function readMessageTargetId(message: Record<string, unknown> | null | undefined): string {
    return String(
      message?.speakerTargetId
      ?? message?.speaker_target_id
      ?? message?.memberTargetId
      ?? message?.member_target_id
      ?? ''
    ).trim()
  }

  function isBeforeCurrentInput(message: Record<string, unknown>, inputMessageId = activePipelineInputMessageId): boolean {
    const messageId = Number(message?.id || 0)
    return !inputMessageId || !messageId || messageId < inputMessageId
  }

  function findPreviousUserMessage(inputMessageId = activePipelineInputMessageId): Record<string, unknown> | null {
    const messages = getCurrentMessageList(chatStore) as Array<Record<string, unknown>>
    return [...messages].reverse().find((message) => (
      message?.role === 'user'
      && isBeforeCurrentInput(message, inputMessageId)
    )) || null
  }

  function buildUserIdentityChangeNotice(inputMessageId = activePipelineInputMessageId): string {
    const previousUser = findPreviousUserMessage(inputMessageId)
    if (!previousUser) return ''
    const previousName = readMessageDisplayName(previousUser)
    const currentName = readCurrentUserDisplayName()
    if (!previousName || !currentName || previousName === currentName) return ''
    return [
      '【当前用户变化提醒】',
      `当前用户已经从「${previousName}」切换为「${currentName}」。`,
      `你现在回应的是「${currentName}」，不再是之前的「${previousName}」。`,
      '回复时必须明确意识到用户身份已经变化，不要把之前用户的称呼、关系、意图或经历套到当前用户身上。'
    ].join('\n')
  }

  function hasSpeakerRepliedBefore(input: {
    speakerTargetId: string
    speakerName: string
    inputMessageId?: number
  }): boolean {
    const speakerTargetId = String(input.speakerTargetId || '').trim()
    const speakerName = String(input.speakerName || '').trim()
    const messages = getCurrentMessageList(chatStore) as Array<Record<string, unknown>>
    return messages.some((message) => {
      if (message?.role !== 'assistant') return false
      const kind = String(message?.messageKind ?? message?.message_kind ?? 'chat').trim()
      if (kind === 'narration_debug') return false
      if (!isBeforeCurrentInput(message, input.inputMessageId ?? activePipelineInputMessageId)) return false
      const targetId = readMessageTargetId(message)
      if (speakerTargetId && targetId && targetId === speakerTargetId) return true
      const name = readMessageDisplayName(message)
      return Boolean(speakerName && name && name === speakerName)
    })
  }

  function resolveRecallBypassForSpeaker(input: {
    speakerTargetId: string
    speakerName?: string
    inputMessageId?: number
  }) {
    const speakerTargetId = String(input.speakerTargetId || '').trim()
    const speakerName = String(input.speakerName || getTargetName(speakerTargetId) || '').trim()
    const inputMessageId = Number(input.inputMessageId || activePipelineInputMessageId || 0)
    const userIdentityChangeNotice = buildUserIdentityChangeNotice(inputMessageId)
    const firstSpeakerReply = !hasSpeakerRepliedBefore({
      speakerTargetId,
      speakerName,
      inputMessageId
    })
    return {
      skipRecallToFinalConfirmation: firstSpeakerReply || Boolean(userIdentityChangeNotice),
      userIdentityChangeNotice
    }
  }

  function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | null = null
    return Promise.race([
      promise,
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallback), timeoutMs)
      })
    ]).finally(() => {
      if (timer) clearTimeout(timer)
    })
  }

  function isChatTaskRunActive(taskRunId: string) {
    const normalizedTaskRunId = String(taskRunId || '').trim()
    if (!normalizedTaskRunId || typeof runtimeStore?.isChatTaskRunActive !== 'function') return true
    return runtimeStore.isChatTaskRunActive(normalizedTaskRunId)
  }

  function isPipelineRunCurrent(runId: number, taskRunId = activePipelineTaskRunId) {
    return runId > 0 && runId === activePipelineRunId && isChatTaskRunActive(taskRunId)
  }

  function assertPipelineCanContinue(runId: number, taskRunId = activePipelineTaskRunId) {
    if (!isPipelineRunCurrent(runId, taskRunId) || isStopRequested(chatStore)) {
      throw createAbortError()
    }
  }

  function markReplySituationCheckpointFailure(
    reason: unknown,
    lifecycle = activeReplySituationCheckpointLifecycle
  ) {
    if (!lifecycle || lifecycle.failureReason) return
    lifecycle.failureReason = reason instanceof Error
      ? reason.message
      : String(reason || '本轮存在未完成的回复后置写入')
  }

  function registerReplySituationAssistantProjection(completion: Promise<void>) {
    const lifecycle = activeReplySituationCheckpointLifecycle
    if (!lifecycle) return
    lifecycle.pendingAssistantProjections.add(completion)
    void completion.then(
      () => lifecycle.pendingAssistantProjections.delete(completion),
      (error) => {
        markReplySituationCheckpointFailure(error, lifecycle)
        lifecycle.pendingAssistantProjections.delete(completion)
      }
    )
  }

  function startReplySituationCheckpointLifecycle(input: {
    runId: number
    sessionId: string
    anchorMessageId: number
  }): ReplySituationCheckpointLifecycle {
    const lifecycle: ReplySituationCheckpointLifecycle = {
      runId: input.runId,
      sessionId: input.sessionId,
      anchorMessageId: input.anchorMessageId,
      failureReason: '',
      invalidated: false,
      invalidationPromise: null,
      pendingAssistantProjections: new Set()
    }
    activeReplySituationCheckpointLifecycle = lifecycle
    return lifecycle
  }

  async function ensureReplySituationCheckpointInvalidated(
    lifecycle = activeReplySituationCheckpointLifecycle
  ): Promise<void> {
    if (!lifecycle || lifecycle.invalidated) return
    if (!lifecycle.invalidationPromise) {
      lifecycle.invalidationPromise = (async () => {
        try {
          await invalidateSessionLastScenario(
            lifecycle.sessionId,
            String(lifecycle.anchorMessageId || ''),
            '本轮尚未完成，旧检查点已失效'
          )
          lifecycle.invalidated = true
        } catch (error) {
          markReplySituationCheckpointFailure(error, lifecycle)
          throw error
        } finally {
          lifecycle.invalidationPromise = null
        }
      })()
    }
    await lifecycle.invalidationPromise
  }

  async function waitForReplySituationAssistantProjections(lifecycle: ReplySituationCheckpointLifecycle) {
    while (lifecycle.pendingAssistantProjections.size > 0) {
      const pending = [...lifecycle.pendingAssistantProjections]
      const results = await Promise.allSettled(pending)
      for (const result of results) {
        if (result.status === 'rejected') markReplySituationCheckpointFailure(result.reason, lifecycle)
      }
    }
  }

  async function finalizeReplySituationCheckpoint(input: {
    runId: number
    last?: { code?: string; label?: string; summary?: string } | null
  }): Promise<boolean> {
    const lifecycle = activeReplySituationCheckpointLifecycle
    if (!lifecycle || lifecycle.runId !== input.runId) return false
    const roundDirector = activeRoundDirector
    const inferredLast = input.last === undefined
      ? roundDirector?.script?.scenarioCode
        ? {
            code: String(roundDirector.script.scenarioCode),
            summary: String(roundDirector.script.situation || '').trim() || undefined
          }
        : null
      : input.last
    const hasUnstartedRoundStartNarration = Boolean(
      roundDirector?.narrationCalls.some(isRoundStartNarrationCall)
      && !roundDirector?.narrationStarted
    )
    const hasUnresolvedInterleavedNarration = Boolean(roundDirector?.narrationInterleavedPending.length)
    if (hasUnstartedRoundStartNarration || hasUnresolvedInterleavedNarration) {
      markReplySituationCheckpointFailure('本轮应生成旁白未全部完成', lifecycle)
    }

    await waitForReplySituationAssistantProjections(lifecycle)
    // 等后台投影期间若已有新轮接管，旧轮只能退出，不能覆盖新轮刚写下的失效 tombstone。
    if (activeReplySituationCheckpointLifecycle !== lifecycle) return false
    await ensureReplySituationCheckpointInvalidated(lifecycle)
    const scenarioCode = String(inferredLast?.code || '').trim()
    if (lifecycle.failureReason || !scenarioCode) {
      try {
        await invalidateSessionLastScenario(
          lifecycle.sessionId,
          String(lifecycle.anchorMessageId || ''),
          lifecycle.failureReason || '本轮没有合法 scenarioCode，旧检查点已失效'
        )
      } catch (error) {
        console.error('[reply-situation-checkpoint] 保持检查点失效状态失败:', error)
      }
      return false
    }

    try {
      // 只能在角色、旁白、投影和事实提交全部收束后读取；开局/统筹阶段的版本不能作为复用依据。
      const projection = await fetchOrchestrationWorkspaceProjection(lifecycle.sessionId)
      const dependencySnapshot = buildCurrentReplySituationDependencySnapshot({
        workspace: projection.workspace,
        director: projection.director
      })
      await saveSessionLastScenario(
        lifecycle.sessionId,
        {
          code: scenarioCode,
          ...(String(inferredLast?.label || '').trim() ? { label: String(inferredLast?.label).trim() } : {}),
          ...(String(inferredLast?.summary || '').trim() ? { summary: String(inferredLast?.summary).trim() } : {})
        },
        String(lifecycle.anchorMessageId || ''),
        dependencySnapshot
      )
      return true
    } catch (error) {
      markReplySituationCheckpointFailure(error, lifecycle)
      console.warn('[reply-situation-checkpoint] 轮末检查点提交失败，继续保持失效状态:', error)
      return false
    }
  }

  function resetActivePipelineState() {
    activePipelineSessionId = ''
    activePipelineInputMessageId = 0
    activePipelineUserAttachments = []
    activePipelineTaskRunId = ''
    activeGenerationAttemptId = ''
    activePipelineNarrationKinds = new Set<BuiltinNarrationKind>()
    activePipelineDirectorDirectives = []
    activeRoundDirector = null
    activeNarrativeImpactLifecycle = null
    activeReplySituationCheckpointLifecycle = null
    chatTurnRunner.reset()
    clearCurrentAiUsageContext()
  }

  function collectPersistedRoundFacts(sessionId: string, anchorMessageId: number) {
    if (!sessionId || !(anchorMessageId > 0)) return []
    return selectPersistedNarrativeFactMessages(getCurrentMessageList(chatStore), anchorMessageId)
  }

  function scheduleNarrativeFactCommit(options: { throwOnError?: boolean } = {}): Promise<void> {
    const lifecycle = activeNarrativeImpactLifecycle
    if (!lifecycle) return Promise.resolve()
    const actualMessages = collectPersistedRoundFacts(lifecycle.sessionId, lifecycle.anchorMessageId)
    if (!actualMessages.length && !lifecycle.committedChanges && !lifecycle.presenceProposals.length) return Promise.resolve()
    const task = (async () => {
      try {
        const predictedImpacts = await lifecycle.predicted
        const commits = lifecycle.callModel && lifecycle.allowedSeedIds.size
          ? await reconcileNarrativeSeedFacts({
              sessionId: lifecycle.sessionId,
              directorRunId: lifecycle.directorRunId,
              predictedImpacts,
              actualMessages,
              anchorMessageId: lifecycle.anchorMessageId,
              committedChanges: lifecycle.committedChanges,
              relevantSeeds: lifecycle.relevantSeedsBlock,
              callModel: lifecycle.callModel
            })
          : []
        const actualMessageIds = new Set(actualMessages.map((message) => message.id))
        if (lifecycle.committedChanges) actualMessageIds.add(lifecycle.anchorMessageId)
        const operations: OrchestrationCommandEnvelope[] = buildPresenceFactOperations({
          sessionId: lifecycle.sessionId,
          worldId: lifecycle.worldId,
          directorRunId: lifecycle.directorRunId,
          anchorMessageId: lifecycle.anchorMessageId,
          proposals: lifecycle.presenceProposals,
          actualMessages
        })
        // 未发生不写事实；partial/occurred 才能推进种子。二者和在场事实进入同一服务端事务。
        for (const commit of commits.filter((item) => (
          lifecycle.allowedSeedIds.has(item.seedId)
          && actualMessageIds.has(item.sourceMessageId)
          && shouldCommitNarrativeFact(item.comparisonOutcome)
        ))) {
          const current = await fetchNarrativeSeedDetail(lifecycle.worldId, commit.seedId)
          operations.push({
            command: 'updateNarrativeSeed',
            sessionId: lifecycle.sessionId,
            worldId: lifecycle.worldId,
            targetRef: { kind: 'narrative_seed', seedId: commit.seedId },
            expectedVersion: Number(current.version),
            idempotencyKey: `fact:${lifecycle.anchorMessageId}:${commit.seedId}`,
            source: {
              sourceMessageId: String(commit.sourceMessageId),
              sourceDirectorRunId: lifecycle.directorRunId,
              sourceAgentRunId: `${lifecycle.directorRunId}:facts`,
              evidenceSummary: commit.evidenceSummary
            },
            payload: {
              eventType: 'fact_committed',
              comparisonOutcome: commit.comparisonOutcome,
              effectSummary: commit.effectSummary,
              ...(commit.currentProgress ? { currentProgress: commit.currentProgress } : {}),
              ...(commit.status ? { status: commit.status } : {}),
              lastAdvancedAt: new Date().toISOString()
            }
          })
        }
        if (operations.length) await executeOrchestrationCommands(lifecycle.sessionId, operations)
      } catch (error) {
        console.warn('[orchestrationFacts] 实际事实核对或统一提交失败（不阻断对话）:', error)
        if (options.throwOnError) throw error
      }
    })()
    void task
    return task
  }

  const postRoundQueue = createPostRoundOrchestrationQueue({
    create: createPostRoundOrchestrationRun,
    listUnresolved: listUnresolvedPostRoundOrchestrationRuns,
    transition: transitionPostRoundOrchestrationRun
  })

  async function processPostRoundOrchestration(run: PostRoundOrchestrationRun) {
    const session = readSessionById(run.sessionId) as Record<string, unknown> | null
    const targetId = String(session?.targetId ?? session?.target_id ?? getActiveTargetId(chatStore) ?? '').trim()
    const sourceMessage = getCurrentMessageList(chatStore).find((message: any) => Number(message?.id || 0) === run.inputMessageId)
    const userText = String(sourceMessage?.content || '').trim()
    const suppressAudienceOutputs = shouldSuppressFocusedActionAudienceOutputs(sourceMessage)
    if (!targetId || !userText) throw new Error('轮后提调无法恢复会话目标或锚点消息')

    activePipelineSessionId = run.sessionId
    activePipelineInputMessageId = run.inputMessageId
    activePipelineTaskRunId = ''
    const postRoundRunId = ++activePipelineRunId
    activePipelineTidiaoRunId = beginTidiaoRun()
    clearTidiaoDirectorStreamRound()
    try {
      await hydrateSessionOrchestrationMaterials(run.sessionId)
      startReplySituationCheckpointLifecycle({
        runId: postRoundRunId,
        sessionId: run.sessionId,
        anchorMessageId: run.inputMessageId
      })
      const existingRoundFacts = collectPersistedRoundFacts(run.sessionId, run.inputMessageId)
      const initialInsertAfterMessageId = Number(existingRoundFacts[existingRoundFacts.length - 1]?.id || run.inputMessageId)
      const formalMembers = normalizeChatSessionCharacterParticipants(session)
        .map((participant) => ({ characterId: String(participant.characterId || '').trim() }))
        .filter((participant) => Boolean(participant.characterId))
      if (!formalMembers.length) {
        await ensureReplySituationCheckpointInvalidated()
        throw new Error('轮后提调无法恢复正式会话成员')
      }
      const replyOrder = await (async () => {
        try {
          return await decideRoundDirector({
            userText,
            groupMembers: formalMembers,
            targetId,
            postRoundFactReconciliation: true,
            postRoundTriggerKind: run.triggerKind,
            suppressAudienceOutputs
          })
        } finally {
          await ensureReplySituationCheckpointInvalidated()
        }
      })()
      // 私密动作的直出旁白已经作为同组私密消息落库；轮后只准核账，不能再生成会被角色读到的旁白/回复。
      if (suppressAudienceOutputs && activeRoundDirector) {
        activeRoundDirector.narrationCalls = []
        activeRoundDirector.narrationInterleavedPending = []
      }
      const executableReplyOrder = suppressAudienceOutputs ? [] : (replyOrder || [])
      if (activeRoundDirector && (executableReplyOrder.length > 0 || activeRoundDirector.narrationCalls.length > 0)) {
        const replyCount = await executeMixedGroupChatParallel({
          targetId,
          userText,
          replyOrder: executableReplyOrder,
          runId: postRoundRunId,
          initialInsertAfterMessageId
        })
        if (replyCount < executableReplyOrder.length) {
          markReplySituationCheckpointFailure(`轮后补演角色正文落库不完整（${replyCount}/${executableReplyOrder.length}）`)
        }
        // 普通轮允许纯描写旁白后台收束；轮后运行是持久任务，必须等补演旁白真正落库后才能核账并标成功。
        if (activeRoundDirector?.roundDirectorNarration) {
          await activeRoundDirector.roundDirectorNarration.completion
        }
      }
      await scheduleNarrativeFactCommit({ throwOnError: true })
      await finalizeReplySituationCheckpoint({ runId: postRoundRunId })
      const messageIds = collectPersistedRoundFacts(run.sessionId, run.inputMessageId).map((message) => message.id)
      return {
        operationCount: Number(Boolean(activeNarrativeImpactLifecycle?.committedChanges)) + (activeNarrativeImpactLifecycle?.presenceProposals.length || 0),
        messageIds,
        details: { triggerKind: run.triggerKind, directorRunId: activePipelineTidiaoRunId }
      }
    } finally {
      resetActivePipelineState()
    }
  }

  async function schedulePostRoundOrchestration(input: {
    sessionId: string
    inputMessageId: number
    triggerKind: PostRoundTriggerKind
    restartExisting?: boolean
  }) {
    const run = await createPostRoundOrchestrationRun({
      ...input,
      idempotencyKey: `post-round:${input.sessionId}:${input.inputMessageId}`
    })
    void postRoundQueue.schedulePersisted(run, processPostRoundOrchestration).catch((error) => {
      console.error('[postRoundOrchestration] 轮后提调失败:', error)
      toast(`轮后提调失败，下一轮发送前会自动重试：${getErrorMessage(error)}`, 'error', 8000)
    })
  }

  function scheduleBackgroundWorldEvolution(afterFacts: Promise<void>) {
    const sessionId = activePipelineSessionId || getActiveSessionId(chatStore)
    const directorRunId = activePipelineTidiaoRunId
    const anchorMessageId = activePipelineInputMessageId > 0
      ? activePipelineInputMessageId
      : Number([...getCurrentMessageList(chatStore)].reverse().find((message: any) => message?.role === 'user')?.id || 0)
    const worldContext = projectChatSessionWorldAgentContext(readSessionById(sessionId))
    if (!isReplyFeatureEnabled(resolveSessionReplyPipelineMode(readSessionById(sessionId)), 'narrative_seed_background_evolution')) return
    if (!sessionId || !directorRunId || !(anchorMessageId > 0) || !worldContext.mounted || !worldContext.world) return
    const worldId = worldContext.world.id
    const agentConfig = readBrainAgentConfigFromList(settingStore.agentModelConfigs)
    void (async () => {
      try {
        // 与本轮事实提交串行，避免同一种子两个后台写手拿到同一 version 后互相 409；不阻塞聊天 UI。
        await afterFacts
        const scan = await fetchOverdueNarrativeSeeds(worldId, { sessionId, limit: 3 })
        if (!scan.enabled || !scan.items.length) return
        const [worldEntities, allSeeds] = await Promise.all([fetchWorldEntities(worldId), fetchNarrativeSeeds(worldId)])
        const callModel = buildDeferredLoopModelCall({
          agentConfig,
          taskId: 'scriptwriterConsult',
          maxTokens: 1800,
          temperature: 0.2,
          logLabel: 'narrative-seed-background-evolution',
          placeType: 'group'
        })
        const items = await evolveOverdueNarrativeSeeds({
          sessionId,
          directorRunId,
          currentTime: scan.currentTime || new Date().toISOString(),
          overdueSeeds: scan.items,
          worldEntities: worldEntities.slice(0, 40).map((entity) => ({
            id: entity.id,
            kind: entity.kind,
            name: entity.name,
            tags: entity.tags,
            mapSheetId: entity.mapSheetId,
            mapFeatureId: entity.mapFeatureId,
            markdown: String(entity.markdown || '').slice(0, 800)
          })),
          callModel
        })
        const dueById = new Map(scan.items.map((seed) => [String(seed.id || ''), seed]))
        const evolvedSeedIds = new Set<string>()
        const frontstageEffects: Array<{ seedId: string; summary: string; evidence?: string }> = []

        for (const item of items.filter((entry) => entry.kind === 'seed_evolution')) {
          if (evolvedSeedIds.has(item.seedId)) continue
          const due = dueById.get(item.seedId)
          if (!due) continue
          const current = await fetchNarrativeSeedDetail(worldId, item.seedId)
          const idempotencyKey = `background:${String(due.dueAt || '')}:${item.seedId}`
          const alreadyCommitted = (Array.isArray(current.events) ? current.events : []).some((event: any) => {
            let diff = event?.diffJson ?? event?.diff
            if (typeof diff === 'string') { try { diff = JSON.parse(diff) } catch { diff = null } }
            return String(diff?.idempotencyKey || '') === idempotencyKey
          })
          if (alreadyCommitted) continue
          const nextStartAt = item.nextStartTime ? Date.parse(item.nextStartTime) : NaN
          const currentTime = Date.parse(scan.currentTime || '')
          const nonTerminal = ['dormant', 'active', 'ready_to_trigger', 'pending_effect', 'stalled', 'review_required'].includes(String(item.status || ''))
          if (nonTerminal && (!Number.isFinite(nextStartAt) || !Number.isFinite(currentTime) || nextStartAt <= currentTime)) continue
          await recordNarrativeSeedImpact(worldId, item.seedId, {
            eventType: 'fact_committed',
            expectedVersion: Number(current.version),
            comparisonOutcome: 'occurred',
            effectSummary: item.outcomeSummary,
            currentProgress: item.currentProgress,
            status: item.status,
            lastAdvancedAt: scan.currentTime || new Date().toISOString(),
            ...(item.nextStartTime ? { startTime: item.nextStartTime } : {}),
            evidenceSummary: `开始时间越过后的现场演化判断：startTime=${String(due.dueAt || '')}`,
            sourceSessionId: sessionId,
            sourceMessageId: anchorMessageId,
            sourceDirectorRunId: directorRunId,
            sourceAgentRunId: `${directorRunId}:background-evolution`,
            idempotencyKey
          })
          evolvedSeedIds.add(item.seedId)
          if (due.affectsCurrentCurtain === true) {
            frontstageEffects.push({ seedId: item.seedId, summary: item.outcomeSummary, evidence: `世界时间已到 ${String(due.dueAt || '')}` })
          }
        }

        // 世界实体只允许追加变化，且来源种子必须是本次刚刚成功演化的条目；同一实体每批最多更新一次。
        const entityById = new Map(worldEntities.map((entity) => [entity.id, entity]))
        const updatedEntityIds = new Set<string>()
        for (const item of items.filter((entry) => entry.kind === 'world_entity_update')) {
          if (updatedEntityIds.has(item.entityId) || !item.sourceSeedIds.some((seedId) => evolvedSeedIds.has(seedId))) continue
          const entity = entityById.get(item.entityId)
          if (!entity) continue
          const timestamp = scan.currentTime || new Date().toISOString()
          await saveWorldEntity(worldId, {
            ...entity,
            id: entity.id,
            expectedVersion: entity.version,
            markdown: `${String(entity.markdown || '').trim()}\n\n## 世界后台演化 ${timestamp}\n${item.markdownAppend}`.trim(),
            sourceLedger: [
              ...(Array.isArray(entity.sourceLedger) ? entity.sourceLedger : []),
              { kind: 'narrative_seed_evolution', seedIds: item.sourceSeedIds, summary: item.summary, at: timestamp }
            ]
          })
          updatedEntityIds.add(item.entityId)
        }

        // 派生硬上限 2；标题同义归一后去重，且只能由本次成功演化的旧种子派生。
        const knownTitles = allSeeds.map((seed) => String(seed.title || '').trim()).filter(Boolean)
        let derivedCount = 0
        for (const item of items.filter((entry) => entry.kind === 'derived_seed')) {
          if (derivedCount >= 2) break
          const sourceSeedIds = [...new Set(item.sourceSeedIds.filter((seedId) => evolvedSeedIds.has(seedId)))]
          if (!sourceSeedIds.length || !String(item.title || '').trim() || knownTitles.some((title) => areNarrativeSeedTitlesEquivalent(title, item.title))) continue
          await createNarrativeSeed(worldId, {
            type: item.type,
            title: item.title,
            description: item.description,
            cause: item.cause,
            currentProgress: item.currentProgress,
            expectedOutcome: item.expectedOutcome,
            startTime: item.startTime,
            mapFeatureId: item.mapFeatureId,
            locationText: item.locationText,
            impactScope: item.impactScope,
            status: item.status,
            visibilityMode: item.visibilityMode,
            allowFrontstage: item.allowFrontstage,
            participants: item.participants,
            lastAdvancedAt: scan.currentTime || new Date().toISOString(),
            lastModifiedSource: 'background_narrative_evolution',
            links: sourceSeedIds.map((seedId) => ({ targetSeedId: seedId, relationType: 'caused_by' })),
            evidenceSummary: '后台到期演化派生；已通过同义标题去重和单轮数量上限',
            sourceSessionId: sessionId,
            sourceMessageId: anchorMessageId,
            sourceDirectorRunId: directorRunId,
            sourceAgentRunId: `${directorRunId}:background-evolution`
          })
          knownTitles.push(item.title)
          derivedCount += 1
        }

        // 只有代码判定命中当前帷幕的结果才进下一轮收件箱；远处结果到此结束，不生成当前旁白。
        if (frontstageEffects.length) {
          enqueueDeferredWorldEvolutionReport({
            sessionId,
            originRunId: directorRunId,
            sourceCallId: `background-evolution:${directorRunId}`,
            payload: { effects: frontstageEffects }
          })
        }
      } catch (error) {
        console.warn('[narrativeSeedEvolution] 后台有限演化失败（不阻断对话）:', error)
      }
    })()
  }
  async function startGenerationAttempt(input: {
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
    return startChatGenerationAttempt({
      ...input,
      speakerName: input.speakerName || getTargetName(input.targetId),
      tidiaoRunId: input.tidiaoRunId || activePipelineTidiaoRunId || makeTidiaoRunId(),
      onError: (error) => console.error('保存生成尝试失败:', error)
    })
  }

  async function finishGenerationAttempt(input: {
    attemptId: string
    sessionId: string
    status: 'completed' | 'failed'
    assistantMessageIds?: number[]
    outputPromptLogId?: string
    error?: unknown
  }) {
    await finishChatGenerationAttempt({
      ...input,
      formatErrorMessage: getErrorMessage,
      onError: (error) => console.error('更新生成尝试失败:', error)
    })
  }

  function startNormalMessageTaskRun(input: { targetId: string; sessionId: string }) {
    if (typeof runtimeStore?.startChatTaskRun !== 'function') {
      return { id: '', controller: null as AbortController | null }
    }
    const controller = new AbortController()
    const run = runtimeStore.startChatTaskRun({
      taskKind: 'normalMessage',
      label: '角色回复',
      targetId: input.targetId,
      sessionId: input.sessionId,
      abortController: controller,
      foreground: true
    })
    const runId = String(run?.id || '')
    const resolvedController = (run?.abortController || controller) as AbortController | null
    // 停止统一（2026-07-04）：不再单独注册提调硬中断句柄——输入框 abortChat → stopChatTaskRun
    // 会直接 abort 本轮 controller（提调 loop 与演员链路共用同一 signal），点停止即全链路终止。
    return {
      id: runId,
      controller: resolvedController
    }
  }

  function completeNormalMessageTaskRun(taskRunId: string) {
    if (taskRunId && runtimeStore?.isChatTaskRunActive?.(taskRunId)) {
      runtimeStore.completeChatTaskRun?.(taskRunId)
    }
  }

  function failNormalMessageTaskRun(taskRunId: string, error: unknown) {
    if (taskRunId && runtimeStore?.isChatTaskRunActive?.(taskRunId)) {
      runtimeStore.failChatTaskRun?.(taskRunId, error)
    }
  }

  function startNarrationPolishTaskRun(input: { targetId: string; sessionId: string }) {
    if (typeof runtimeStore?.startChatTaskRun !== 'function') {
      return { id: '', controller: null as AbortController | null }
    }
    const controller = new AbortController()
    const run = runtimeStore.startChatTaskRun({
      taskKind: 'narrationPolish',
      label: '旁白润色',
      targetId: input.targetId,
      sessionId: input.sessionId,
      abortController: controller,
      foreground: true
    })
    const runId = String(run?.id || '')
    return {
      id: runId,
      controller: (run?.abortController || controller) as AbortController | null
    }
  }

  function completeNarrationPolishTaskRun(taskRunId: string) {
    if (taskRunId && runtimeStore?.isChatTaskRunActive?.(taskRunId)) {
      runtimeStore.completeChatTaskRun?.(taskRunId)
    }
  }

  function failNarrationPolishTaskRun(taskRunId: string, error: unknown) {
    if (taskRunId && runtimeStore?.isChatTaskRunActive?.(taskRunId)) {
      runtimeStore.failChatTaskRun?.(taskRunId, error)
    }
  }

  // unitKind：发送轮=round；重生成/纠偏/精修等返工入口传各自 kind（roundId 仍用原轮=消耗并入原轮总账）。
  function activateRoundUsageContext(targetId: string, unitKind = 'round') {
    const sessionId = activePipelineSessionId || getActiveSessionId(chatStore)
    const inputMessageId = Number(activePipelineInputMessageId || 0)
    const turnContext = chatTurnRunner.getContext()
    setCurrentAiUsageContext({
      sessionId,
      sessionLabel: getTargetName(targetId),
      roundId: turnContext?.roundId || (sessionId && inputMessageId > 0 ? `round:${sessionId}:${inputMessageId}` : ''),
      unitKind
    })
  }

  function readBuiltinNarrationKind(value: unknown): BuiltinNarrationKind | null {
    const raw = String(value || '').trim()
    if (raw === 'environment' || raw === 'appearance' || raw === 'event_push') return raw
    return null
  }

  function readMessageBuiltinNarrationKind(message: Record<string, unknown>): BuiltinNarrationKind | null {
    const messageKind = String(message?.messageKind ?? message?.message_kind ?? '').trim()
    if (messageKind !== 'narration') return null
    return readBuiltinNarrationKind(
      message.narrationProfileKind
      ?? message.narration_profile_kind
      ?? message.narrationKind
      ?? message.narration_kind
      ?? message.profileKind
      ?? message.profile_kind
    )
  }

  function collectRoundNarrationKinds(messages: Array<Record<string, unknown>>): Set<BuiltinNarrationKind> {
    const kinds = new Set<BuiltinNarrationKind>(activePipelineNarrationKinds)
    const inputMessageId = Number(activePipelineInputMessageId || 0)
    messages.forEach((message) => {
      const id = Number(message?.id || 0)
      if (inputMessageId > 0 && id > 0 && id < inputMessageId) return
      const kind = readMessageBuiltinNarrationKind(message)
      if (kind) kinds.add(kind)
    })
    return kinds
  }

  function markPipelineNarrationKind(kind: BuiltinNarrationKind | null | undefined) {
    if (kind) activePipelineNarrationKinds.add(kind)
  }

  function askConfirm(message: string): boolean {
    if (typeof confirm === 'function') return confirm(message)
    if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
      return window.confirm(message)
    }
    return false
  }

  function askPrompt(message: string, defaultValue: string): string | null {
    if (typeof prompt === 'function') return prompt(message, defaultValue)
    if (typeof window !== 'undefined' && typeof window.prompt === 'function') {
      return window.prompt(message, defaultValue)
    }
    return null
  }

  function upsertImprovisedCharacterLocalState(result: any) {
    const group = result?.group
    if (group?.id && Array.isArray(charStore.characterGroups)) {
      const groupId = String(group.id)
      const existingGroup = charStore.characterGroups.find((item) => String(item?.id || '') === groupId)
      if (existingGroup) {
        Object.assign(existingGroup, group)
      } else {
        charStore.characterGroups.push(group)
      }
    }

    const character = result?.character
    if (character?.id && Array.isArray(charStore.characters)) {
      const characterId = String(character.id)
      const existingCharacter = charStore.characters.find((item) => String(item?.id || '') === characterId)
      const normalizedCharacter = {
        ...character,
        groupId: character.groupId ?? character.group_id ?? group?.id ?? 'improvised_characters',
        group_id: character.group_id ?? character.groupId ?? group?.id ?? 'improvised_characters',
        speakingStyle: character.speakingStyle ?? character.speaking_style ?? '',
        speaking_style: character.speaking_style ?? character.speakingStyle ?? ''
      }
      if (existingCharacter) {
        Object.assign(existingCharacter, normalizedCharacter)
      } else {
        charStore.characters.push(normalizedCharacter)
      }
    }
  }

  async function createImprovisedCharacterWithDuplicateHandling(sessionId: string, targetName: string) {
    try {
      return await createImprovisedCharacterBySessionId(sessionId, targetName)
    } catch (error) {
      if (!isConflictError(error)) throw error
      const nextName = askPrompt(`已存在同名角色“${targetName}”。输入新名字创建，留空取消。`, targetName)
      if (nextName === null) {
        const shouldContinue = askConfirm(`继续创建同名角色“${targetName}”？`)
        if (!shouldContinue) throw new Error('已取消即兴角色创建')
        return await createImprovisedCharacterBySessionId(sessionId, targetName, { allowDuplicateName: true })
      }
      const trimmedName = String(nextName || '').trim()
      if (!trimmedName) throw new Error('已取消即兴角色创建')
      if (trimmedName === targetName) {
        const shouldContinue = askConfirm(`继续创建同名角色“${targetName}”？`)
        if (!shouldContinue) throw new Error('已取消即兴角色创建')
        return await createImprovisedCharacterBySessionId(sessionId, targetName, { allowDuplicateName: true })
      }
      return await createImprovisedCharacterBySessionId(sessionId, targetName, { finalName: trimmedName })
    }
  }

  function buildMentionCandidates(): StrictMentionCandidate[] {
    const candidates: StrictMentionCandidate[] = []
    const visibleMentionItems = filteredAtCharacters?.value?.length
      ? filteredAtCharacters.value
      : (charStore.characters || [])
    for (const character of visibleMentionItems) {
      const id = String(character?.id || '').trim()
      const name = String(character?.name || '').trim()
      if (!id || !name) continue
      candidates.push({
        id,
        name,
        nicknames: character.nicknames as string[] | string | undefined,
        kind: String((character as any).kind || '') === 'sessionTemporary' ? 'sessionTemporary' : 'formal'
      })
    }
    const sessionId = getActiveSessionId(chatStore)
    for (const character of sessionTemporaryCharactersBySessionId.value[String(sessionId || '').trim()] || []) {
      const rawId = String(character?.id || '').trim()
      const name = String(character?.name || '').trim()
      const id = rawId.startsWith('session-temp:') ? rawId : `session-temp:${rawId}`
      if (!rawId || !name || candidates.some((item) => item.id === id)) continue
      candidates.push({
        id,
        name,
        nicknames: character.aliases,
        kind: 'sessionTemporary'
      })
    }
    for (const selectedId of mentionSelectedChars.value || []) {
      const id = String(selectedId || '').trim()
      if (!id || candidates.some((item) => item.id === id)) continue
      if (id.startsWith('session-temp:')) {
        candidates.push({ id, name: id.replace(/^session-temp:/, ''), kind: 'sessionTemporary' })
      }
    }
    return candidates
  }

  async function loadSessionTemporaryCharactersForReply(sessionId: string): Promise<ChatSessionTemporaryCharacter[]> {
    const cached = sessionTemporaryCharactersBySessionId.value[String(sessionId || '').trim()] || []
    if (cached.length) return cached
    try {
      return await fetchSessionTemporaryCharacters(sessionId)
    } catch (error) {
      console.warn('读取会话临时角色失败:', error)
      return []
    }
  }

  async function resolveSelectedSessionTemporaryCharacterForReply(sessionId: string): Promise<ChatSessionTemporaryCharacter | null> {
    const selectedMentionId = (mentionSelectedChars.value || []).map((id) => String(id || '').trim()).find((id) => id.startsWith('session-temp:'))
    const characterId = parseSessionTemporaryCharacterMentionId(selectedMentionId || '')
    if (!characterId) return null
    const items = await loadSessionTemporaryCharactersForReply(sessionId)
    return items.find((item) => String(item?.id || '') === characterId) || null
  }

  async function resolveMentionedSessionTemporaryCharacterForReply(sessionId: string, userText: string): Promise<ChatSessionTemporaryCharacter | null> {
    if (!sessionId) return null
    const selected = await resolveSelectedSessionTemporaryCharacterForReply(sessionId)
    if (selected) return selected
    const matches = parseStrictMentions(userText, buildMentionCandidates())
    const matched = matches.find((item) => item.candidate.kind === 'sessionTemporary' && String(item.candidate.id || '').startsWith('session-temp:'))
    const characterId = parseSessionTemporaryCharacterMentionId(matched?.candidate.id || '')
    if (!characterId) return null
    const items = await loadSessionTemporaryCharactersForReply(sessionId)
    return items.find((item) => String(item?.id || '') === characterId) || null
  }

  function parseNarrationRoleAliases(value: unknown): string[] {
    if (Array.isArray(value)) return value.map((item) => String(item || '').trim()).filter(Boolean)
    const text = String(value || '').trim()
    if (!text) return []
    try {
      const parsed = JSON.parse(text)
      if (Array.isArray(parsed)) return parsed.map((item) => String(item || '').trim()).filter(Boolean)
    } catch {}
    return text.split(/[，,、\s]+/).map((item) => item.trim()).filter(Boolean)
  }

  function normalizeNarrationRoleHitText(value: unknown): string {
    const text = String(value || '').trim()
    if (!text) return ''
    const withoutAt = text.startsWith('@') ? text.slice(1).trim() : text
    return withoutAt
  }

  function isNarrationRoleNameHit(inputText: string, name: unknown, aliases?: unknown): boolean {
    const hitText = normalizeNarrationRoleHitText(inputText)
    if (!hitText) return false
    const normalizedHit = hitText.toLowerCase()
    const candidates = [String(name || '').trim(), ...parseNarrationRoleAliases(aliases)]
      .filter(Boolean)
      .map((item) => item.toLowerCase())
    return candidates.includes(normalizedHit)
  }

  function resolveCurrentFormalNarrationCharacters(session: any, targetId: string): CharacterLike[] {
    const ids: string[] = []
    for (const member of normalizeSessionParticipantMembers(session)) {
      if (member.characterId) ids.push(member.characterId)
    }
    if (!ids.length && targetId && !targetId.startsWith('group_') && !targetId.startsWith('crowd_')) {
      ids.push(targetId)
    }
    if (!ids.length && targetId.startsWith('group_')) {
      const group = (charStore.groups || []).find((item) => item.id === targetId || `group_${item.id}` === targetId)
      normalizeGroupMembers(group?.members).forEach((member) => {
        if (member.characterId) ids.push(member.characterId)
      })
    }
    const seen = new Set<string>()
    return ids
      .map((id) => (charStore.characters || []).find((character) => String(character?.id || '') === id) || null)
      .filter((character): character is CharacterLike => {
        if (!character?.id || seen.has(character.id)) return false
        seen.add(character.id)
        return true
      })
  }

  function buildFormalNarrationRoleProfile(character: CharacterLike): UserNarrationRoleProfile {
    return {
      source: 'formal',
      name: String(character.name || '').trim(),
      aliases: parseNarrationRoleAliases(character.nicknames),
      description: String(character.desc ?? character.description ?? '').trim(),
      appearance: String(character.appearance ?? '').trim()
    }
  }

  function buildTemporaryNarrationRoleProfile(character: ChatSessionTemporaryCharacter): UserNarrationRoleProfile {
    const markdown = String(character.markdown || '').trim()
    const identity = extractSessionTemporaryCharacterField(markdown, '身份或称呼')
    const situation = extractSessionTemporaryCharacterField(markdown, '当前处境')
    const description = [identity, situation].map((item) => item.trim()).filter(Boolean).join('\n\n')
    return {
      source: 'sessionTemporary',
      name: String(character.name || '').trim(),
      aliases: parseNarrationRoleAliases(character.aliases ?? character.aliasesJson ?? character.aliases_json),
      description,
      appearance: extractSessionTemporaryCharacterField(markdown, '外貌与可见特征'),
      markdown: markdown.slice(0, 1600)
    }
  }

  function buildCurrentUserNarrationRoleProfile(): UserNarrationRoleProfile | null {
    const alias = currentAlias.value || {}
    const userProfile = charStore.userProfile || {}
    const aliasName = String(alias.name || '').trim()
    const userName = String(userProfile.name || userProfile.displayName || '').trim()
    const name = aliasName || userName || '我'
    const appearance = String(alias.appearance ?? userProfile.appearance ?? '').trim()
    if (!appearance) return null
    const aliases = [userName, '我', '用户'].map((item) => item.trim()).filter((item) => item && item !== name)
    return {
      source: 'userAlias',
      name,
      aliases: Array.from(new Set(aliases)),
      description: String(alias.desc ?? userProfile.desc ?? '').trim(),
      appearance
    }
  }

  async function buildCurrentNarrationRoleAppearanceProfiles(sessionId: string): Promise<UserNarrationRoleProfile[]> {
    const userProfile = buildCurrentUserNarrationRoleProfile()
    const formalProfiles = (charStore.characters || [])
      .map((character: CharacterLike) => buildFormalNarrationRoleProfile(character))
      .filter((profile) => profile.name)
    const temporaryCharacters = sessionId
      ? await loadSessionTemporaryCharactersForReply(sessionId).catch(() => [])
      : []
    const temporaryProfiles = temporaryCharacters
      .filter((item) => item.status !== 'deleted')
      .map((character) => buildTemporaryNarrationRoleProfile(character))
      .filter((profile) => profile.name)
    return [userProfile, ...formalProfiles, ...temporaryProfiles].filter((profile): profile is UserNarrationRoleProfile => Boolean(profile))
  }

  async function resolveUserNarrationRoleProfileForCommand(
    sessionId: string,
    targetId: string,
    command: UserNarrationCommand
  ): Promise<UserNarrationRoleProfile | null> {
    const hitText = normalizeNarrationRoleHitText(command.content)
    if (!hitText) return null
    const session = readSessionById(sessionId) as any
    const formalCharacters = resolveCurrentFormalNarrationCharacters(session, targetId)
    const formalMatch = formalCharacters.find((character) => isNarrationRoleNameHit(hitText, character.name, character.nicknames))
    if (formalMatch) return buildFormalNarrationRoleProfile(formalMatch)
    const temporaryCharacters = await loadSessionTemporaryCharactersForReply(sessionId)
    const temporaryMatch = temporaryCharacters
      .filter((item) => item.status !== 'deleted')
      .find((character) => isNarrationRoleNameHit(hitText, character.name, character.aliases ?? character.aliasesJson ?? character.aliases_json))
    return temporaryMatch ? buildTemporaryNarrationRoleProfile(temporaryMatch) : null
  }

  async function resolveUnknownSessionTemporaryMentionBeforeReply(sessionId: string, userText: string): Promise<{ handled: boolean; item: ChatSessionTemporaryCharacter | null }> {
    if (!sessionId) return { handled: false, item: null }
    if ((mentionSelectedChars.value || []).some((id) => String(id || '').startsWith('session-temp:'))) return { handled: false, item: null }
    const unknownMention = parseStrictUnknownMentions(userText, buildMentionCandidates())[0]
    if (!unknownMention?.label) return { handled: false, item: null }
    toast(`未找到会话临时角色：${unknownMention.label}。请先使用 /整理角色 ${unknownMention.label}`, 'info')
    return { handled: true, item: null }
  }

  function buildSessionTemporaryCharacterRecentContext(userInputMessageId: number): string {
    const messages = getCurrentMessageList(chatStore)
      .filter((message: any) => Number(message?.id || 0) !== Number(userInputMessageId || 0))
      .filter((message: any) => String(message?.messageKind ?? message?.message_kind ?? '').trim() !== 'narration_debug')
    return buildNarrationRoundText(collectMessagesByRounds(messages as any[], 3) as any[])
  }

  function buildSessionTemporaryCharacterNarrationPayload(input: {
    content: string
    character: ChatSessionTemporaryCharacter
    model?: string
  }): MessagePayload {
    const envSnapshot = getCurrentEnvironmentSnapshot()
    const now = new Date().toISOString()
    return {
      role: 'assistant',
      messageKind: 'narration',
      message_kind: 'narration',
      content: input.content,
      time: now,
      name: '旁白',
      memberName: `旁白 · ${input.character.name || '临时角色'}`,
      envDate: envSnapshot.envDate,
      envWeather: envSnapshot.envWeather,
      envLocation: envSnapshot.envLocation,
      model: String(input.model || '')
    }
  }

  async function runSessionTemporaryCharacterNarrationBeforeReply(input: {
    sessionId: string
    targetId: string
    userText: string
    character: ChatSessionTemporaryCharacter
    runId: number
  }): Promise<boolean> {
    const characterName = String(input.character?.name || '').trim()
    const markdown = String(input.character?.markdown || '').trim()
    if (!input.sessionId || !characterName || !markdown) {
      toast('临时角色资料不完整，不能生成旁白', 'error')
      return true
    }
    assertPipelineCanContinue(input.runId)
    setTyping(chatStore, true)
    setCurrentMessageModel(chatStore, '')
    streamingText.value = ''
    safeCurrentStreamingSpeakerName.value = `旁白 · ${characterName}`
    safeCurrentStreamingTargetId.value = input.targetId
    safePlannedGroupSpeakers.value = []
    const localMessageKey = `session-temp-narration-${input.character.id}-${Date.now()}`
    let fullReply = ''
    let usedModel = ''
    let promptLogId = ''
    try {
      const promptTrace = buildSessionTemporaryCharacterNarrationPrompt({
        characterName,
        markdown,
        userText: input.userText,
        recentContextText: buildSessionTemporaryCharacterRecentContext(activePipelineInputMessageId)
      })
      const options = {
        // 批次3：旁白归校书档；旧旁白槽默认 temp0.8/800/disabled 落调用点覆写（行为不变）。
        ...buildTaskModelAiOptions(readBrainAgentConfigFromList(settingStore.agentModelConfigs) as any, 'narrationMessage', { maxTokens: 800, temperature: 0.8, thinking: 'disabled' }),
        feature: 'narration',
        logLabel: 'session-temporary-character-narration',
        usageLabel: `临时角色旁白：${characterName}`,
        placeLabel: `会话临时角色：${characterName}`,
        placeType: 'other' as const,
        onPromptPrepared: async ({ finalPrompt, promptBlocks }: {
          messages: Array<{ role: ChatRole; content: string }>
          finalPrompt: string
          promptBlocks?: ChatPromptLogBlock[]
          preparedAt: string
        }) => {
          try {
            const result = await createChatPromptLogBySessionId(input.sessionId, {
              speakerName: `旁白 · ${characterName}`,
              targetId: input.targetId,
              finalPrompt,
              promptBlocks: promptBlocks || promptTrace.promptBlocks
            })
            promptLogId = String(result.id || '')
          } catch (error) {
            console.error('记录临时角色旁白提示词日志失败:', error)
          }
        }
      }
      const baseLocalMessage = buildSessionTemporaryCharacterNarrationPayload({
        content: '',
        character: input.character,
        model: usedModel
      })
      upsertStreamingMessage(chatStore, input.sessionId || input.targetId, localMessageKey, {
        ...baseLocalMessage,
        _targetId: input.targetId,
        _sessionId: input.sessionId
      })
      const returnedText = await callAIStream(
        promptTrace.messages as Array<{ role: ChatRole; content: string }>,
        options,
        (chunk) => {
          if (!isPipelineRunCurrent(input.runId) || isStopRequested(chatStore)) return
          fullReply += chunk
          const visibleStreamingReply = getVisibleTextFromEmbeddedProjectionOutput(fullReply)
          streamingText.value = visibleStreamingReply
          currentStreamingTargetId.value = input.targetId
          upsertStreamingMessage(chatStore, input.sessionId || input.targetId, localMessageKey, {
            ...baseLocalMessage,
            content: visibleStreamingReply,
            model: usedModel,
            _targetId: input.targetId,
            _sessionId: input.sessionId
          })
          scrollToBottom()
        },
        {
          onModelInfo: (model: string) => {
            if (!isPipelineRunCurrent(input.runId) || isStopRequested(chatStore)) return
            usedModel = model
            setCurrentMessageModel(chatStore, model)
          }
        }
      )
      assertPipelineCanContinue(input.runId)
      const embeddedProjectionParse = parseEmbeddedMessageProjectionOutput(normalizeAiOutputText(returnedText || fullReply))
      const cleanedReply = cleanAiPrefix(embeddedProjectionParse.visibleText)
      if (!hasVisibleAiReplyBody(cleanedReply)) {
        removeStreamingMessage(chatStore, input.sessionId || input.targetId, localMessageKey)
        toast('临时角色旁白没有返回可显示正文，请稍后重试或换个预设', 'warning')
        return true
      }
      const replyMessage = buildSessionTemporaryCharacterNarrationPayload({
        content: cleanedReply,
        character: input.character,
        model: usedModel
      })
      const persistedId = await chatStore.addMessage(input.targetId, replyMessage, { skipLocalSync: true, sessionId: input.sessionId })
      const persistedMessage = {
        id: persistedId,
        ...replyMessage,
        _targetId: input.targetId,
        _sessionId: input.sessionId
      }
      clearStreamingBubbleState(input.targetId)
      const finalized = finalizeStreamingMessage(chatStore, input.sessionId || input.targetId, localMessageKey, persistedMessage)
      if (finalized === false) {
        queuePendingPersistedMessage(chatStore, input.sessionId || input.targetId, persistedMessage)
      }
      if (promptLogId && typeof persistedId === 'number' && persistedId > 0) {
        await bindChatPromptLogMessageBySessionId(input.sessionId, promptLogId, persistedId)
      }
      if (typeof persistedId === 'number' && persistedId > 0) {
        await runReplyContextProjectionForMessage({
          sessionId: input.sessionId,
          messageId: persistedId,
          stage: 'assistant',
          embeddedProjectionText: embeddedProjectionParse.projectionText,
          embeddedProjectionError: embeddedProjectionParse.hasProjection ? '' : embeddedProjectionParse.error,
          embeddedProjectionRequired: true
        })
      }
      return true
    } catch (error) {
      removeStreamingMessage(chatStore, input.sessionId || input.targetId, localMessageKey)
      if (!isAbortError(error)) {
        toast(`临时角色旁白生成失败: ${getErrorMessage(error)}`, 'error')
      }
      return true
    } finally {
      if (isPipelineRunCurrent(input.runId)) {
        setTyping(chatStore, false)
        setCurrentMessageModel(chatStore, '')
        streamingText.value = ''
        safeCurrentStreamingSpeakerName.value = ''
        safeCurrentStreamingTargetId.value = ''
        safePlannedGroupSpeakers.value = []
        mentionSelectedChars.value = []
        await nextTick()
        scrollToBottom()
      }
    }
  }

  const { buildReplyPlan, normalizeReplyProbability } = useGroupReplyPlan()
  function resolvePlannedGroupSpeakers(replyOrder: Array<{ characterId?: string }>): PlannedGroupSpeakerViewModel[] {
    return resolvePlannedGroupSpeakerViews({
      replyOrder,
      characters: charStore.characters || []
    }) as PlannedGroupSpeakerViewModel[]
  }

  function refreshPlannedGroupSpeakers(speakerTargetIds: string[]) {
    const idSet = new Set((speakerTargetIds || []).map((id) => String(id || '').trim()).filter(Boolean))
    if (!idSet.size) {
      safePlannedGroupSpeakers.value = []
      return
    }
    safePlannedGroupSpeakers.value = resolvePlannedGroupSpeakers(
      Array.from(idSet).map((characterId) => ({ characterId }))
    )
  }

  function clearStreamingBubbleState(targetId = '') {
    streamingText.value = ''
    safeCurrentStreamingSpeakerName.value = ''
    safeCurrentStreamingTargetId.value = String(targetId || getActiveTargetId(chatStore) || '')
    setCurrentMessageModel(chatStore, '')
  }

  function getCurrentEnvironmentSnapshot() {
    return buildMessageEnvironmentSnapshot({
      currentTime: settingStore.currentTime,
      currentWeather: settingStore.currentWeather,
      currentLocation: settingStore.currentLocation,
      currentSession: getChatStoreCurrentSession(chatStore),
      createdAt: new Date().toISOString()
    })
  }

  function classifyEmptyFinalReplyError(input: {
    returnedText: unknown
    streamedText: string
    normalizedReply: string
    cleanedReply: string
    visibleReply: string
  }): string {
    const returnedText = String(input.returnedText ?? '')
    const streamedText = String(input.streamedText || '')
    const normalizedReply = String(input.normalizedReply || '')
    const cleanedReply = String(input.cleanedReply || '')
    const visibleReply = String(input.visibleReply || '')
    if (!returnedText.trim() && !streamedText.trim()) {
      return '模型原始返回为空：returnedText 和流式累积内容都为空。'
    }
    if (/<think>[\s\S]*?<\/think>/i.test(cleanedReply) && !visibleReply) {
      return '模型只返回了思考过程：<think> 块剥离后没有可见正文。'
    }
    if (normalizedReply.trim() && !cleanedReply.trim()) {
      return '角色名前缀 / 回复前缀清理后为空：模型返回内容被 cleanAiPrefix 清空。'
    }
    if (cleanedReply.trim() && !visibleReply) {
      return '清洗后只剩不可见内容：剥离思考块或回复标记后没有正文。'
    }
    return '最终回复正文不可保存：模型返回值存在，但没有通过可见正文校验。'
  }

  function buildEmptyFinalReplyDebugContent(input: {
    errorKind: string
    targetId: string
    speakerTargetId: string
    speakerName: string
    sessionId: string
    inputMessageId?: number
    attemptId?: string
    promptLogId?: string
    usedModel?: string
    returnedText: unknown
    streamedText: string
    normalizedReply: string
    cleanedReply: string
    visibleReply: string
  }): string {
    const returnedText = input.returnedText == null ? '' : String(input.returnedText)
    const streamedText = String(input.streamedText || '')
    const normalizedReply = String(input.normalizedReply || '')
    const cleanedReply = String(input.cleanedReply || '')
    const visibleReply = String(input.visibleReply || '')
    const payload = {
      errorKind: input.errorKind,
      targetId: input.targetId,
      speakerTargetId: input.speakerTargetId,
      speakerName: input.speakerName,
      sessionId: input.sessionId,
      inputMessageId: input.inputMessageId || 0,
      attemptId: input.attemptId || '',
      promptLogId: input.promptLogId || '',
      usedModel: input.usedModel || '',
      returnedText,
      streamedText,
      normalizedReply,
      cleanedReply,
      visibleReplyAfterThoughtStrip: visibleReply,
      lengths: {
        returnedText: returnedText.length,
        streamedText: streamedText.length,
        normalizedReply: normalizedReply.length,
        cleanedReply: cleanedReply.length,
        visibleReply: visibleReply.length
      },
      providerRawJson: '当前 callAIStream 协议未把供应商原始 SSE JSON 回传到发送链路；此处输出的是发送链路收到的完整返回字符串和流式累积字符串。'
    }
    return [
      '【琅嬛最终回复空正文失败】',
      '',
      `错误类型：${input.errorKind}`,
      `角色：${input.speakerName || input.speakerTargetId || input.targetId}`,
      `模型：${input.usedModel || '未回传模型名'}`,
      `提示词日志：${input.promptLogId || '未记录'}`,
      '',
      '最终模型返回数据：',
      '```json',
      JSON.stringify(payload, null, 2),
      '```'
    ].join('\n')
  }

  async function appendEmptyFinalReplyDebugMessage(input: {
    targetId: string
    sessionId: string
    content: string
  }) {
    if (!input.sessionId) return
    const envSnapshot = getCurrentEnvironmentSnapshot()
    const message: MessagePayload = {
      role: 'assistant',
      messageKind: 'narration_debug',
      message_kind: 'narration_debug',
      name: '最终回复诊断',
      memberName: '最终回复诊断',
      content: input.content,
      time: new Date().toLocaleTimeString(),
      envDate: envSnapshot.envDate,
      envWeather: envSnapshot.envWeather,
      envLocation: envSnapshot.envLocation,
      model: ''
    }
    try {
      const persistedId = await chatStore.addMessage(input.targetId, message, { skipLocalSync: true, sessionId: input.sessionId })
      queuePendingPersistedMessage(chatStore, input.sessionId || input.targetId, {
        id: typeof persistedId === 'number' ? persistedId : 0,
        ...message,
        memberName: message.memberName || message.name,
        _targetId: input.targetId,
        _sessionId: input.sessionId
      })
    } catch (error) {
      console.warn('最终回复空正文诊断消息保存失败:', error)
      queuePendingPersistedMessage(chatStore, input.sessionId || input.targetId, {
        id: `debug_empty_final_reply_${Date.now()}`,
        ...message,
        memberName: message.memberName || message.name,
        _targetId: input.targetId,
        _sessionId: input.sessionId
      })
    }
  }

  function resolveReplyTargetCharacter(targetId: string): CharacterLike | null {
    const session = getChatStoreCurrentSession(chatStore)
    const participantIds = normalizeChatSessionCharacterParticipants(session)
      .map((item) => String(item.characterId || '').trim())
      .filter(Boolean)
    const candidates = [
      String(targetId || '').trim(),
      String(targetId || '').replace(/^character[_:-]/, '').trim(),
      String(getActiveSessionTargetId(chatStore) || '').trim(),
      String(getActiveSessionTargetId(chatStore) || '').replace(/^character[_:-]/, '').trim(),
      String((session as any)?.targetId ?? (session as any)?.target_id ?? '').trim(),
      String((session as any)?.targetId ?? (session as any)?.target_id ?? '').replace(/^character[_:-]/, '').trim(),
      ...participantIds
    ].filter(Boolean)
    const characters = Array.isArray(charStore.characters) ? charStore.characters : []
    for (const candidate of candidates) {
      const fromStore = typeof charStore.getCharacter === 'function' ? charStore.getCharacter(candidate) : null
      if (fromStore?.id) {
        const resolved = resolveSessionCharacter(session, String(fromStore.id), fromStore as Record<string, any>)
        if (resolved?.id) return resolved as CharacterLike
      }
      const matched = characters.find((character) => {
        const id = String(character?.id || '').trim()
        return id === candidate || `character_${id}` === candidate || `character:${id}` === candidate
      })
      if (matched?.id) {
        const resolved = resolveSessionCharacter(session, String(matched.id), matched as Record<string, any>)
        if (resolved?.id) return resolved as CharacterLike
      }
    }
    return null
  }

  function resolveRuntimeCharacters(): CharacterLike[] {
    const session = getChatStoreCurrentSession(chatStore)
    const characters = Array.isArray(charStore.characters) ? charStore.characters : []
    return characters
      .map((character) => resolveSessionCharacter(session, String(character?.id || ''), character as Record<string, any>))
      .filter((character): character is CharacterLike => Boolean(character?.id))
  }

  function resolveReplyPipelineModeForTarget(targetId: string): ChatReplyPipelineMode {
    return resolveReplyPipelineMode({
      session: getChatStoreCurrentSession(chatStore) as Record<string, unknown> | null,
      character: resolveReplyTargetCharacter(targetId) as Record<string, unknown> | null
    })
  }


  function shouldUsePersonalityModelReply(targetId = getActiveTargetId(chatStore)): boolean {
    return isPersonalityModelReplyMode(
      getChatStoreCurrentSession(chatStore) as Record<string, unknown> | null,
      resolveReplyTargetCharacter(targetId) as Record<string, unknown> | null
    )
  }

  function resolveRoundReplyBackendState(
    targetId: string,
    session: Record<string, unknown> | null,
    group: boolean,
    selectedCharacterIds?: readonly string[]
  ): { hasPersonalityModel: boolean; mixedBackends: boolean } {
    const characterIds = selectedCharacterIds !== undefined
      ? [...new Set(selectedCharacterIds.map((item) => String(item || '').trim()).filter(Boolean))]
      : group
        ? normalizeChatSessionCharacterParticipants(session)
            .map((item) => String(item.characterId || '').trim())
            .filter(Boolean)
        : [String(targetId || '').trim()].filter(Boolean)
    const evaluationCharacterIds = selectedCharacterIds !== undefined
      ? characterIds
      : characterIds.length ? characterIds : [targetId]
    const personalityFlags = evaluationCharacterIds
      .map((characterId) => shouldUsePersonalityModelReply(characterId))
    return resolveReplyBackendComposition(personalityFlags)
  }

  function updateRoundReplyExecutionProfileForSelectedSpeakers(input: {
    targetId: string
    session: Record<string, unknown> | null
    group: boolean
    characterIds: readonly string[]
  }) {
    const turnContext = chatTurnRunner.getContext()
    const currentProfile = turnContext?.replyExecutionProfile
    if (!currentProfile || currentProfile.basis.purePrompt || currentProfile.basis.focusedAction) return
    const backendState = resolveRoundReplyBackendState(
      input.targetId,
      input.session,
      input.group,
      input.characterIds
    )
    chatTurnRunner.updateContext({
      replyExecutionProfile: resolveReplyExecutionProfile({
        route: currentProfile.basis.route,
        hasPersonalityModel: backendState.hasPersonalityModel,
        mixedBackends: backendState.mixedBackends,
        purePrompt: false,
        focusedAction: false
      })
    })
  }

  function shouldUsePurePromptReply(): boolean {
    const session = getChatStoreCurrentSession(chatStore) as Record<string, unknown> | null
    return resolveSessionReplyPipelineMode(session) === 'pure_prompt'
  }

  function resolveReplayTurnReplyMode(targetId: string): ChatTurnReplyMode {
    const session = getChatStoreCurrentSession(chatStore) as Record<string, unknown> | null
    const sessionMode = resolveSessionReplyPipelineMode(session)
    if (sessionMode === 'pure_prompt') return 'pure_prompt'
    if (shouldUsePersonalityModelReply(targetId)) return 'personality_model'
    if (sessionMode === 'personality_model') return sessionMode
    return 'normal_recall'
  }

  function buildCurrentReplySituationDependencySnapshot(input: {
    workspace: OrchestrationWorkspaceProjection
    director: DirectorOrchestrationProjection
    currentSession?: Record<string, unknown> | null
  }): ReplySituationDependencySnapshot {
    const session = input.currentSession
      ?? getChatStoreCurrentSession(chatStore) as Record<string, unknown> | null
    const personalityRevision = normalizeChatSessionCharacterParticipants(session)
      .map((member: any) => {
        const characterId = String(member.characterId || member.character_id || '').trim()
        const character = (charStore.characters || []).find(
          (item: any) => String(item?.id || '') === characterId
        ) as Record<string, unknown> | undefined
        return {
          characterId,
          modelPath: String(character?.personalityModelPath ?? character?.personality_model_path ?? ''),
          version: character?.version ?? character?.updatedAt ?? character?.updated_at ?? ''
        }
      })
      .filter((item) => Boolean(item.characterId))
      .sort((left, right) => left.characterId < right.characterId ? -1 : left.characterId > right.characterId ? 1 : 0)
    return buildReplySituationDependencySnapshot({
      workspace: input.workspace,
      director: input.director,
      personalityRevision,
      promptPresetRevision: resolveUserCustomPromptPresetContent()
    })
  }

  async function decideAutomaticReplyOrchestration(input: {
    sessionId: string
    userText: string
    attachments: ChatImageAttachment[]
    abortSignal?: AbortSignal
  }): Promise<{
    decision: ReplyOrchestrationRouteDecision
    directorProjection: DirectorOrchestrationProjection | null
    dependencySnapshot: ReplySituationDependencySnapshot | null
  }> {
    const previousScenario = getHydratedLastScenario(input.sessionId)
    const currentSession = getChatStoreCurrentSession(chatStore) as Record<string, unknown> | null
    const routeInput = {
      previousScenario,
      currentUserInput: input.userText,
      establishedContext: String(currentSession?.contextSummary ?? currentSession?.context_summary ?? '').trim(),
      recentTail: renderReplyOrchestrationRecentTail(
        getCurrentMessageList(chatStore) as Array<Record<string, unknown>>
      ),
      sceneContext: readDirectorSceneContextNow(),
      hasAttachments: input.attachments.length > 0,
      hasPrivateDirectorDirectives: activePipelineDirectorDirectives.length > 0,
      forcedCharacterIds: (mentionSelectedChars.value || []).map((id) => String(id || '').trim()).filter(Boolean),
      excludedCharacterIds: (mentionExcludedChars.value || []).map((id) => String(id || '').trim()).filter(Boolean)
    }
    const preliminaryHardDecision = resolveHardReplyOrchestrationRoute(routeInput)
    if (preliminaryHardDecision) {
      return { decision: preliminaryHardDecision, directorProjection: null, dependencySnapshot: null }
    }

    let directorProjection: DirectorOrchestrationProjection | null = null
    let currentDependencySnapshot: ReplySituationDependencySnapshot | null = null
    try {
      const projectionBundle = await fetchOrchestrationWorkspaceProjection(input.sessionId)
      directorProjection = projectionBundle.director
      currentDependencySnapshot = buildCurrentReplySituationDependencySnapshot({
        workspace: projectionBundle.workspace,
        director: projectionBundle.director,
        currentSession
      })
    } catch (error) {
      console.warn('读取情境依赖版本失败，本轮续接判定按 unknown 继续保守轻判:', error)
    }
    const versionedRouteInput = { ...routeInput, currentDependencySnapshot }
    const versionHardDecision = resolveHardReplyOrchestrationRoute(versionedRouteInput)
    if (versionHardDecision) {
      return { decision: versionHardDecision, directorProjection, dependencySnapshot: currentDependencySnapshot }
    }

    const messages = buildReplyOrchestrationRouteMessages(versionedRouteInput)
    const dependencyComparison = compareReplySituationDependencySnapshots(
      previousScenario?.dependencySnapshot,
      currentDependencySnapshot
    )
    try {
      const output = await callAI(messages, {
        ...buildTaskModelAiOptions(readBrainAgentConfigFromList(settingStore.agentModelConfigs) as any, 'replyRouteJudge', {
          maxTokens: 260,
          temperature: 0,
          thinking: 'disabled'
        }),
        feature: 'agent',
        logLabel: 'reply-situation-continuity-judge',
        usageLabel: '回复路由：情境续接轻判',
        placeLabel: `会话：${getTargetName(getActiveTargetId(chatStore))}`,
        placeType: shouldUseGroupChatPipeline(getActiveTargetId(chatStore), currentSession) ? 'group' : 'single',
        ...(input.abortSignal ? { signal: input.abortSignal } : {})
      })
      const decision = parseReplyOrchestrationRouteDecision(
        normalizeAiOutputText(stripAiThoughtContent(String(output || ''))),
        previousScenario,
        dependencyComparison
      )
      return { decision, directorProjection, dependencySnapshot: currentDependencySnapshot }
    } catch (error) {
      if (isAbortError(error) || input.abortSignal?.aborted) throw error
      console.warn('情境续接轻判失败，已保守回退完整提调:', error)
      return {
        decision: parseReplyOrchestrationRouteDecision('', previousScenario, dependencyComparison),
        directorProjection,
        dependencySnapshot: currentDependencySnapshot
      }
    }
  }

  function normalizePersonalityRecallSectionsFromResult(result: PreparedAIRecallResult | void | null): PersonalityRecallSections | null {
    const sections = (result as PreparedAIRecallResult | null)?.sections
    if (!sections) return null
    const normalized = {
      profile: String(sections.profile || '').trim(),
      general: String(sections.general || '').trim(),
      arrangement: String(sections.arrangement || '').trim(),
      expression: String(sections.expression || '').trim()
    }
    return Object.values(normalized).some(Boolean) ? normalized : null
  }

  function buildPersonalityCharacterIdentity(character: CharacterLike | null, characterName: string): string {
    void character
    void characterName
    return ''
  }

  async function runReplyContextProjectionForMessage(input: {
    sessionId: string
    messageId: number
    stage: 'user' | 'assistant'
    embeddedProjectionText?: string
    embeddedProjectionError?: string
    embeddedProjectionRequired?: boolean
  }) {
    const checkpointLifecycle = input.stage === 'assistant'
      ? activeReplySituationCheckpointLifecycle
      : null
    if (!input.sessionId || !input.messageId) {
      throw new Error(input.stage === 'user' ? '回复链路缺少用户消息 ID，无法运行消息投影' : '回复链路缺少回复消息 ID，无法运行消息投影')
    }
    try {
      const embeddedProjectionText = String(input.embeddedProjectionText || '').trim()
      const embeddedProjectionError = String(input.embeddedProjectionError || '').trim()
      if (embeddedProjectionText || embeddedProjectionError || input.embeddedProjectionRequired) {
        await saveEmbeddedChatMessageProjectionBySessionId(input.sessionId, input.messageId, {
          projectionText: embeddedProjectionText,
          failureReason: embeddedProjectionError,
          failureStage: embeddedProjectionText ? '' : 'parse_embedded_projection'
        })
        if (checkpointLifecycle && input.embeddedProjectionRequired && !embeddedProjectionText) {
          markReplySituationCheckpointFailure(
            embeddedProjectionError || '助手消息投影没有产出合法结果',
            checkpointLifecycle
          )
        }
        return
      }
      await runChatMessageProjectionBySessionId(input.sessionId, input.messageId, { promptLogMode: 'background' })
    } catch (error) {
      if (checkpointLifecycle) markReplySituationCheckpointFailure(error, checkpointLifecycle)
      throw error
    }
  }

  function getVisibleTextFromEmbeddedProjectionOutput(rawOutput: string): string {
    return cleanAiPrefix(parseEmbeddedMessageProjectionOutput(rawOutput).visibleText)
  }

  async function runProjectionWritebackForCharacter(input: {
    sessionId: string
    characterId: string
    runKind?: 'auto' | 'manual'
    sourceLabel?: string
  }) {
    const checkpointLifecycle = activeReplySituationCheckpointLifecycle
    const sessionId = String(input.sessionId || '').trim()
    const characterId = String(input.characterId || '').trim()
    if (!sessionId || !characterId) return null
    const noticeId = runtimeStore?.startAgentTaskNotice?.({
      title: '投影写轨迹',
      message: '正在检查可见投影窗口',
      sourceLabel: input.sourceLabel || '投影写轨迹',
      sourceCharacterId: characterId,
      step: '检查窗口'
    }) || ''
    try {
      const result = await runChatProjectionWritebackBySessionId(sessionId, {
        characterId,
        runKind: input.runKind || 'auto'
      })
      const data = result && typeof result === 'object' ? result as Record<string, unknown> : {}
      const status = String(data.status || '')
      if (status === 'skipped') {
        runtimeStore?.completeAgentTaskNotice?.({
          id: noticeId,
          message: '可见投影未达到写入窗口',
          step: '无需写入',
          detail: String(data.reason || '')
        })
        return data
      }
      const failedEvents = Array.isArray(data.failedEvents) ? data.failedEvents : []
      const detail = `已隐藏 ${Number(data.hiddenProjectionCount || 0)} 条投影，写入 ${Array.isArray(data.successEventIds) ? data.successEventIds.length : 0} 个事件。`
      if (status === 'failed' || failedEvents.length) {
        if (checkpointLifecycle) {
          markReplySituationCheckpointFailure(
            status === 'failed' ? '投影写轨迹失败' : '投影写轨迹部分失败',
            checkpointLifecycle
          )
        }
        runtimeStore?.failAgentTaskNotice?.({
          id: noticeId,
          message: status === 'failed' ? '投影写轨迹失败' : '投影写轨迹部分失败',
          step: '写入完成但有失败项',
          detail
        })
        if (status === 'failed') {
          toast('投影写轨迹失败，失败来源会继续保持可见', 'error', 8000)
        }
      } else {
        runtimeStore?.completeAgentTaskNotice?.({
          id: noticeId,
          message: '投影写轨迹完成',
          step: '写入完成',
          detail
        })
      }
      return data
    } catch (error) {
      if (checkpointLifecycle) markReplySituationCheckpointFailure(error, checkpointLifecycle)
      runtimeStore?.failAgentTaskNotice?.({
        id: noticeId,
        message: '投影写轨迹失败',
        step: '写入异常',
        error
      })
      console.warn('人格模型投影写轨迹失败:', error)
      toast(`投影写轨迹失败：${getErrorMessage(error)}`, 'error', 8000)
      return null
    }
  }

  async function persistPersonalityModelPromptTrace(input: {
    sessionId: string
    targetId: string
    speakerName: string
    trace: { finalPrompt: string; promptBlocks: Array<{ role: 'system' | 'user' | 'assistant'; title: string; content: string }> }
  }): Promise<string> {
    try {
      const result = await createChatPromptLogBySessionId(input.sessionId, {
        speakerName: input.speakerName,
        targetId: input.targetId,
        finalPrompt: input.trace.finalPrompt,
        promptBlocks: input.trace.promptBlocks,
        logKind: 'internal_agent'
      })
      return String(result.id || '')
    } catch (error) {
      console.error('保存人格模型编排提示词日志失败:', error)
      return ''
    }
  }

  function mergePersonalitySceneChangeNotices(...items: Array<string | null | undefined>): string {
    const seen = new Set<string>()
    return items
      .map((item) => String(item || '').trim())
      .filter(Boolean)
      .filter((item) => {
        if (seen.has(item)) return false
        seen.add(item)
        return true
      })
      .join('\n\n')
  }

  function readPersonalityCurtainSnapshot(session: Record<string, unknown> | null | undefined): Record<string, unknown> {
    return readCurtainSceneSnapshot(session, {
      currentTime: settingStore.currentTime,
      currentWeather: settingStore.currentWeather,
      currentLocation: settingStore.currentLocation
    })
  }

  function readExplicitCurtainTimeIntent(text: string): string {
    const source = String(text || '')
    const match = source.match(/((?:\d+|[一二两三四五六七八九十半]+)(?:个)?(?:分钟|小时|时辰|天|日|周|星期|个月|月|年)后(?:的)?(?:清晨|早上|上午|中午|下午|傍晚|晚上|夜里|深夜|凌晨)?|(?:明天|后天|大后天|翌日|次日)(?:清晨|早上|上午|中午|下午|傍晚|晚上|夜里|深夜|凌晨)?)/)
    return String(match?.[1] || '').trim()
  }

  function cleanCurtainLocationIntent(text: string, timeIntent: string): string {
    let value = String(text || '').trim()
    if (timeIntent) value = value.replace(timeIntent, '')
    value = value
      .replace(/^[，。！？、\s]+/, '')
      .replace(/^(?:和|跟)[^，。！？、\s]{1,12}(?:一起)?/, '')
      .replace(/^(?:我们|一起|出门|去|到|前往|来到|抵达|进入|回到|换到|切到|转到|逛|逛逛)\s*/, '')
      .replace(/[，。！？、\s]+$/, '')
    if (/^(哪里|哪儿|何处|什么地方|哪)$/.test(value)) return ''
    // 兜底捕获也走同一套地点护栏，方位/姿态描写不当作地点
    return sanitizeCurtainLocationPart(value.slice(0, 60))
  }

  function readExplicitCurtainLocationIntent(text: string, timeIntent: string): string {
    const source = String(text || '')
    const patterns = [
      // 裸“到”前面是感知/接触类动词时（看到、摸到、想到…）不是位移意图，不能当作改地点
      /(?:前往|来到|抵达|进入|回到|换到|切到|转到|去到|走到|赶到|搬到|去|(?<![看想听摸碰触收感遇找得拿提说讲谈买卖寄递贴接领抢偷学])到)([^，。！？\n）)]{1,60})/,
      /(?:出门\s*)?(?:逛逛|逛|游览)([^，。！？\n）)]{1,40})/,
      /在([^，。！？\n）)]{1,60}?)(?:见面|碰面|见|等|集合)/
    ]
    for (const pattern of patterns) {
      const match = source.match(pattern)
      const value = cleanCurtainLocationIntent(String(match?.[1] || ''), timeIntent)
      if (value) return value
    }
    return ''
  }

  function inferExplicitCurtainSceneUpdateToolCall(userText: string): ReplyPlanCurtainSceneUpdateToolCall | null {
    const source = String(userText || '').trim()
    if (!source) return null
    const targetTime = readExplicitCurtainTimeIntent(source)
    const targetLocation = readExplicitCurtainLocationIntent(source, targetTime)
    if (!targetTime && !targetLocation) return null
    return {
      tool: 'updateCurtainScene',
      targetTime: targetTime || undefined,
      targetLocation: targetLocation || undefined,
      reason: `运行时兜底：当前用户输入明确表达时间或地点变化：“${source.slice(0, 80)}”`
    }
  }

  async function applyPersonalityCurtainSceneUpdate(input: {
    targetId: string
    sessionId: string
    toolCall: ReplyPlanCurtainSceneUpdateToolCall
    orchestration?: {
      worldId: string
      expectedVersion: number
      idempotencyKey: string
      sourceDirectorRunId: string
      sourceMessageId: string
    }
  }): Promise<ReplyPlanCurtainSceneUpdateResult> {
    const session = readSessionById(input.sessionId) as Record<string, unknown> | null
    const result = prepareCurtainSceneUpdate({
      session,
      defaults: {
        currentTime: settingStore.currentTime,
        currentWeather: settingStore.currentWeather,
        currentLocation: settingStore.currentLocation
      },
      toolCall: input.toolCall,
      successHeading: '【帷幕时间地点已按用户意图静默更新】',
      successTail: ['候选计划和最终回复必须承接这次变化；旁白陪跑必须生成旁白体现变化。']
    })
    if (!result.changed) return result
    const normalizedPatch = result.patch || {}
    if (input.orchestration) {
      await executeOrchestrationCommands(input.sessionId, [{
        command: 'updateCurtainScene',
        sessionId: input.sessionId,
        worldId: input.orchestration.worldId,
        targetRef: { kind: 'curtain', sessionId: input.sessionId },
        expectedVersion: input.orchestration.expectedVersion,
        idempotencyKey: input.orchestration.idempotencyKey,
        source: {
          sourceMessageId: input.orchestration.sourceMessageId,
          sourceDirectorRunId: input.orchestration.sourceDirectorRunId,
          evidenceSummary: input.toolCall.reason || '提调依据本轮剧情时空变化校准帷幕'
        },
        payload: normalizedPatch
      }])
      if (session) Object.assign(session, normalizedPatch)
    } else if (typeof chatStore.updateSession === 'function') {
      await chatStore.updateSession(input.targetId, normalizedPatch)
    }
    // 帷幕真的改动了 → 发 UI 信号让提调坞自动弹开（2026-07-07 用户拍板；轮跑完坞仍按 done 自动收起）。
    noteCurtainSceneUpdated()
    return result
  }

  /**
   * 批次4：回复后台滚动会话记忆压缩（自研借 Mastra Observational Memory 思路）。
   * 长会话达阈值时，把较早投影事实（滑出最近窗口的）用廉价模型浓缩进会话 context_summary，
   * 服务端组装上下文时注入回去，避免长会话丢关键记忆。fire-and-forget，失败绝不影响回复。
   * 节流：持久化 messageId watermark 决定本次只折叠尚未进入摘要的较早事实；同会话并发调用单飞。
   */
  const maybeRefreshSessionMemory = (sessionId: string, projectionItems: unknown): void => {
    if (sessionMemoryRefreshInFlight.has(sessionId)) return
    const refresh = (async () => {
      try {
        if (!sessionId || typeof callAI !== 'function' || !Array.isArray(projectionItems)) return
        const facts: SessionMemoryFact[] = projectionItems
          .map((item) => {
            const record = (item && typeof item === 'object') ? item as Record<string, unknown> : {}
            return {
              messageId: Number(record.messageId ?? record.message_id ?? 0) || 0,
              fact: String(record.fact ?? '').trim(),
              speakerName: String(record.speakerName ?? record.speaker_name ?? '').trim()
            }
          })
          .filter((fact) => fact.messageId > 0 && fact.fact)
        const storeSession = getChatStoreCurrentSession(chatStore) as Record<string, unknown> | null
        const watermarkMessageId = Math.max(0, Math.trunc(Number(
          storeSession?.contextSummaryMessageId ?? storeSession?.context_summary_message_id ?? 0
        ) || 0))
        if (!shouldRefreshSessionMemory(facts, {
          watermarkMessageId,
          keepRecent: SESSION_MEMORY_KEEP_RECENT,
          step: SESSION_MEMORY_REFRESH_STEP
        })) return
        const { foldFacts, latestFoldedMessageId } = selectSessionMemoryFold(facts, {
          watermarkMessageId,
          keepRecent: SESSION_MEMORY_KEEP_RECENT
        })
        if (!foldFacts.length) return
        const existingSummary = String(storeSession?.context_summary ?? storeSession?.contextSummary ?? '')
        const agentConfig = readBrainAgentConfigFromList(settingStore.agentModelConfigs)
        const output = await callAI(buildSessionMemoryPrompt(existingSummary, foldFacts) as Array<{ role: ChatRole; content: string }>, {
          ...buildTaskModelAiOptions(agentConfig as any, 'narrationMessage', { maxTokens: 800, temperature: 0.3, thinking: 'disabled' }),
          feature: 'session_memory',
          usageLabel: '会话记忆压缩'
        })
        const summary = parseSessionMemorySummaryOutput(output)
        if (!summary) return
        if (typeof chatStore.updateSession === 'function') {
          await chatStore.updateSession(sessionId, {
            context_summary: summary,
            last_summary_time: new Date().toISOString(),
            context_summary_message_id: latestFoldedMessageId
          })
        }
      } catch (error) {
        console.error('会话记忆压缩失败（不影响回复）:', error)
      }
    })()
    sessionMemoryRefreshInFlight.set(sessionId, refresh)
    void refresh.finally(() => {
      if (sessionMemoryRefreshInFlight.get(sessionId) === refresh) {
        sessionMemoryRefreshInFlight.delete(sessionId)
      }
    })
  }

  // 通用回复工作流入口（ReplyWorkflow）：personality_model 与 normal_recall 共用投影、召回、情境、
  // 编排与最终上下文链路；模式差异由 mode 表达——人格模型多计划 + ReRanker 评审（要求 ONNX 模型），
  // 普通召回单计划直达、跳过评审（singlePlanOnly + skipReview）。
  async function buildReplyWorkflowFinalContext(input: {
    mode: ReplyWorkflowMode
    targetId: string
    speakerTargetId: string
    speakerName: string
    userText: string
    taskRunId: string
    abortSignal?: AbortSignal
    recallBypass: { skipRecallToFinalConfirmation?: boolean }
    excludedMessageIds?: number[]
    /** 用户消息投影后台 promise（2026-06-12 提速）：召回不等它、先行启动；
     *  投影态上下文与带召回的全量上下文 fetch 前必须等它完成。未传视为投影已完成。 */
    userProjectionPromise?: Promise<void> | null
    /** 过程轨步骤回调：生成投影 / 读取投影 / 召回由本函数上报，判情境/候选/评审由 harness 透传。 */
    onStep?: (stepId: 'projection' | 'context' | 'recall' | 'scenario' | 'plan' | 'review', status: 'running' | 'done' | 'failed' | 'retry') => void
    /** 实时旁述（D5）：提调每轮 thought 上抛，外层写入过程轨 thoughts。 */
    onThought?: (thought: string) => void
    /** 旁白陪跑结论回调：决策一出（生成/不生成 + 理由）即上报过程轨。 */
    onNarrationOutcome?: (outcome: ReplyWorkflowNarrationOutcome) => void
    /** 批次5c：本轮旁白每落库一条即上抛 messageId，供 runSingleChat 在中断/取消时回滚删除。 */
    onNarrationMessageWritten?: (messageId: number) => void
    /** 评审降级回调：本地 ReRanker 跑不动时按候选顺序降级出回复，把降级原因上报过程轨。 */
    onReviewDegraded?: (reason: string) => void
    /** 导演流回调（真·导演 loop 子批3）：存在即让 harness 进导演模式，把 loop 每步真实信号
     *  折叠成轮级流式载体整份实时上抛。仅单聊单角色链路传入；缺省=不进导演模式、零回归。 */
    onDirectorStream?: (stream: TidiaoDirectorStream) => void
    /** 导演纠偏重规划 brief（批次K·自主重排）：纠偏续跑时透传给 harness，让模型据纠偏真重读情境/重排。 */
    replanBrief?: TidiaoDirectorReplanBrief | null
    /** 导演重试 brief（批次M1b·重试）：重试某条角色消息时透传给 harness，让模型先揣测重试意图/按意见改这条。 */
    retryBrief?: TidiaoRetryBrief | null
    /** 批次M1a：重试单条角色消息时为 true——只重生成该角色正文，不再起旁白支线生成新旁白消息。默认 false 零回归。 */
    suppressNarration?: boolean
    /** F2 群聊分镜吃提调情境：提调轮级已判好情境（code+body）下发时，harness 跳过 readScenarioSkill、直接据它进生成轮。
     *  仅群聊（提调成功产出情境）传入；单聊/旧路径缺省，分镜照常自己判情境，零回归。 */
    providedScenario?: { code: string; body: string } | null
    /** 批次4-投影 B（directorProjectionContext ON 时）：提调统筹时用的投影态上下文，下发替代分镜独立「判情境用上下文」
     *  （喂给编排器 harness 的 compressedContext）；compose 正文用的全量人格上下文仍各自 fetch、保留。
     *  缺省（开关关）=undefined，分镜走原 compressedContext + 照常上报 projection/context 过程轨步骤，零回归。 */
    downstreamProjectionContext?: string
    /** 批B·人格模型按需直通道（2026-07-13）：提调判本轮该角色 planMode=direct 时同轮直写的回复计划（第三视角）。
     *  非空即跳过编排轮与模型候选生成；personality_model 只在本地确定性直通变体间做一次人格评分，normal_recall 直接使用单计划；
     *  缺省/空串=personality，走原 harness 全链路，零回归。 */
    directPlan?: string
    /** 轻量提调规划与 directPlan 同源的表达占比；快速回复必须显式提供，旧直通道缺省仍可为 null。 */
    directExpressionMix?: ReplyPlanExpressionMix | null
    /** 轻量提调规划与 directPlan 同源的建议字数；快速回复必须显式提供，旧直通道缺省仍可为 null。 */
    directWordCountAdvice?: ReplyPlanWordCountAdvice | null
  }): Promise<{
    context: PersonalityModelContextBundle
    /** 批次4：本轮投影事实（全量），供回复后台触发滚动会话记忆压缩。 */
    projectionItems: PersonalityModelContextBundle['projectionItems']
    candidatePlans: PersonalityPlanCandidate[]
    topPlans: PersonalityPlanCandidate[]
    /** personality_model 必有；normal_recall 单计划模式按协议豁免为 null。 */
    expressionMix: ReplyPlanExpressionMix | null
    /** 建议字数区间：提调据情境产出；缺失为 null，最终回复按默认区间兜底。 */
    wordCountAdvice: ReplyPlanWordCountAdvice | null
    characterIdentity: string
    scenarioMountedPromptText: string
    rerankerDiagnostics?: Record<string, unknown>
    orchestration?: ReplyPlanOrchestration & Record<string, unknown>
    curtainSceneUpdate?: ReplyPlanCurtainSceneUpdateResult | null
    /** 旁白激进版：旁白正文支线收尾 promise（自吞错误，不会 reject）；本轮结束前 await 它保证旁白落库。 */
    narrationCompletion?: Promise<PersonalityNarrationSubagentRunAudit> | null
  }> {
    const sessionId = getActiveSessionId(chatStore)
    if (!sessionId) throw new Error('回复工作流缺少会话 ID，无法构建上下文')
    const userName = currentAlias.value?.name || charStore.userProfile.name || '我'
    const visibleMessagesOverride = [{
      role: 'user',
      content: input.userText,
      name: userName
    }]
    // 角色身份与模型校验先行（不依赖召回）：ONNX 模型门禁只属于 personality_model profile——
    // 只有它进入 ReRanker 评审；normal_recall 单计划跳过评审，未上传人格模型也必须能正常回复。
    const character = resolveReplyTargetCharacter(input.speakerTargetId || input.targetId)
    const characterIdentity = buildPersonalityCharacterIdentity(character, input.speakerName)
    const personalityModelPath = String(
      (character as Record<string, unknown> | null)?.personalityModelPath
      ?? (character as Record<string, unknown> | null)?.personality_model_path
      ?? ''
    ).trim()
    if (input.mode === 'personality_model' && !personalityModelPath) {
      throw new Error('当前回复角色未上传人格模型，无法进行人格模型 ReRanker 打分')
    }
    // 用量/日志标签按模式区分，避免普通召回的编排开销被记成人格模型。
    const workflowLabel = input.mode === 'personality_model' ? '人格模型' : '普通召回'
    const candidatePlanSystemPromptPrefix = resolveUserCustomPromptPresetContent()
    // basePayloadBase 不含 recallSections；带召回的全量上下文在 fullContextPromise 内重建。
    const basePayloadBase = {
      characterId: input.speakerTargetId || input.targetId,
      characterName: input.speakerName,
      characterIdentity,
      candidatePlanSystemPromptPrefix,
      currentUserInput: input.userText,
      userName,
      excludedMessageIds: Array.isArray(input.excludedMessageIds) ? input.excludedMessageIds : []
    }
    // 召回提前起跑（2026-06-12 提速）：召回只吃当前用户输入（visibleMessagesOverride），
    // 不依赖用户消息投影结果，先于投影等待启动，与投影 ∥ 编排路由三方并行。
    // 带召回的全量上下文 fetch 与投影态上下文 fetch 仍必须等投影完成（计划生成消费投影事实）。
    let recallStepDone = false
    // 批次1d-B：退役时不再先行并行召回预热；计划生成/评审改用投影态上下文（projectionContext），
    // 特殊料由提调按需取料三件套补（结果经 toolCall.planPrompt 流入计划生成）。fullContextPromise=null。
    const fullContextPromise = AUTO_RECALL_RETIRED ? null : (async () => {
      input.onStep?.('recall', 'running')
      const recallResult = prepareAIRecall
        ? await prepareAIRecall(input.speakerTargetId || input.targetId, {
          visibleMessagesOverride,
          taskRunId: input.taskRunId,
          abortSignal: input.abortSignal,
          storeForPrompt: false,
          // 人格模型必须真实召回当前输入，不继承普通链路的首轮跳过规则（文档 3.11）；
          // 普通召回保留首轮角色发言 / 用户身份变化的召回最终确认跳过规则。
          skipRecallToFinalConfirmation: input.mode === 'personality_model'
            ? false
            : Boolean(input.recallBypass.skipRecallToFinalConfirmation)
        })
        : null
      const recallSections = normalizePersonalityRecallSectionsFromResult(recallResult)
      // 投影失败的错误由外层 await userProjectionPromise 抛出；这里只等完成，不重复抛
      if (input.userProjectionPromise) await input.userProjectionPromise.catch(() => undefined)
      const fullContext = await fetchChatPersonalityModelContextBySessionId(sessionId, { ...basePayloadBase, recallSections })
      if (!recallStepDone) {
        recallStepDone = true
        input.onStep?.('recall', 'done')
      }
      return { recallSections, fullContext }
    })()
    // 批次4-投影 B：提调已下发投影态上下文时，分镜不再做「生成上下文投影」这步（投影已在导演开局生成 + 灯泡批量兜底），
    //   去掉这条对分镜空转的过程轨步骤；仍 await 用户投影（compose 全量上下文 fetch 也会等它，保证落库一致）。
    const hasDownstreamProjection = Boolean(String(input.downstreamProjectionContext || '').trim())
    if (input.userProjectionPromise) {
      if (!hasDownstreamProjection) input.onStep?.('projection', 'running')
      await input.userProjectionPromise
    }
    if (!hasDownstreamProjection) input.onStep?.('projection', 'done')
    // 批次3 链路顺序：① 先取投影态上下文（不含召回），编排器判情境只用投影+输入。
    //   投影态 fetch 保留（用户 2026-06-23 拍板·保守）：仍需它的 sceneChangeNotice/projectionItems；
    //   仅把喂给编排器 harness 的 compressedContext 换成下发的投影态上下文（见下方 harnessResult 入参）。
    input.onStep?.('context', 'running')
    const projectionContext = await fetchChatPersonalityModelContextBySessionId(sessionId, basePayloadBase)
    input.onStep?.('context', 'done')
    const agentConfig = readBrainAgentConfigFromList(settingStore.agentModelConfigs)
    assertPipelineCanContinue(activePipelineRunId, input.taskRunId)
    const orchestrationPromptLogIdRef = { value: '' }
    const reviewPromptLogIdRef = { value: '' }
    // 注入全局编排配置（本地工作区可在诊断侧栏提示词树编辑）；未保存或加载失败回退默认 seed，不阻断回复
    const orchestratorConfig = await loadEffectiveOrchestratorConfig()
    const generatePlanBatchIdCounts = new Map<string, number>()
    const personalityNarrationMessageIds: number[] = []
    let personalityNarrationSubagentAudit: PersonalityNarrationSubagentRunAudit | null = null
    let curtainSceneUpdate: ReplyPlanCurtainSceneUpdateResult | null = null
    let curtainSceneUpdateNotice = ''
    const applyAndRememberCurtainSceneUpdate = async (toolCall: ReplyPlanCurtainSceneUpdateToolCall) => {
      const result = await applyPersonalityCurtainSceneUpdate({
        targetId: input.targetId,
        sessionId,
        toolCall
      })
      curtainSceneUpdate = result
      curtainSceneUpdateNotice = result.changed ? result.notice : ''
      return result
    }
    // 批次B 真并行提前（2026-06-30）：轮级路（providedScenario + activeRoundDirector.narrationCalls）的旁白方向，
    // decideRoundDirector 已在 runSingleChat 前定好，无需等 harness plan/评审。投影/上下文就绪后立刻起跑旁白正文生成，
    // 与下面 harness loop 真并行；信息承载串行闸门（await infoBearingSettled）留到建最终角色上下文前再收（见下方消费处），
    // 保证信息承载旁白投影先落库、角色回复能承接。批次C 后单聊群聊统一一条路，旁白只此轮级路
    //（旧单聊 directorStream:true 自当导演 + O-C4 loop 内旁白已退役删除）。
    // 旁白方向独立于 harness 的帷幕/情境推进（narrationCalls 已含各自方向），并行不产生依赖倒置。
    let roundDirectorNarration: {
      completion: Promise<PersonalityNarrationSubagentRunAudit>
      infoBearingSettled: Promise<void>
      audit: PersonalityNarrationSubagentRunAudit
    } | null = null
    // 旁白穿插（2026-07-06）：首发言者只起跑 round_start 子集（缺省锚点=开场·与历史行为一致）；
    // after_speaker/round_end 子集在 narrationInterleavedPending 里，由锚点处 flushRoundInterleavedNarration 按段生成。
    const roundStartNarrationCalls = (activeRoundDirector?.narrationCalls || []).filter(isRoundStartNarrationCall)
    if (input.providedScenario
      && activeRoundDirector && !activeRoundDirector.narrationStarted
      && roundStartNarrationCalls.length) {
      const roundNarrationProfiles = resolvePersonalityNarrationSubagentProfiles(getChatStoreCurrentSession(chatStore) as any)
      if (roundNarrationProfiles.length) {
        activeRoundDirector.narrationStarted = true
        roundDirectorNarration = startDirectorNarrationCompletion({
          targetId: input.targetId,
          sessionId,
          runId: activePipelineRunId,
          speakerName: input.speakerName,
          calls: roundStartNarrationCalls,
          profiles: roundNarrationProfiles,
          projectionFactByMessageId: buildNarrationProjectionFactMap(projectionContext.projectionItems),
          insertAfterMessageId: activePipelineInputMessageId || undefined,
          onMessageWritten: (messageId) => {
            if (messageId > 0 && !personalityNarrationMessageIds.includes(messageId)) personalityNarrationMessageIds.push(messageId)
            if (messageId > 0) input.onNarrationMessageWritten?.(messageId)
          },
          onOutcome: input.onNarrationOutcome,
          abortSignal: input.abortSignal
        })
        // 串行压缩批C2：句柄同时存共享的 activeRoundDirector——并行群聊下其余 speaker 抢闸失败（narrationStarted
        // 已是 true）局部变量会是 null，靠这里的共享句柄拿到 infoBearingSettled（见下方消费处的兜底读取）。
        activeRoundDirector.roundDirectorNarration = roundDirectorNarration
      }
    }
    // 批B·人格模型按需直通道（2026-07-13）：提调若判本轮该角色 planMode=direct，会同轮直写 plan——
    // 这里跳过编排 harness 与模型候选生成；人格 profile 只跑一次轻量人格评分，普通 profile 单计划直达；
    // 未传 directPlan（personality/缺省）时走 else 原 harness 全链路，零回归。
    const directPlanText = String(input.directPlan || '').trim()
    let harnessResult: Awaited<ReturnType<typeof runReplyPlanOrchestratorHarness>> | null = null
    let resolvedScenarioCode = ''
    let scenarioMountedPromptText = ''
    let candidatePlans: PersonalityPlanCandidate[]
    let topPlans: PersonalityPlanCandidate[]
    let expressionMix: ReplyPlanExpressionMix | null
    let wordCountAdvice: ReplyPlanWordCountAdvice | null
    let rerankerDiagnostics: Record<string, unknown> | undefined
    if (directPlanText) {
      // F2 群聊分镜已下发本轮情境（providedScenario），direct 分支直接用它，无需再跑 harness 推导。
      resolvedScenarioCode = String(input.providedScenario?.code || '').trim()
      scenarioMountedPromptText = buildScenarioMountedPromptText(orchestratorConfig, resolvedScenarioCode)
      const directCandidates: ReplyPlanCandidate[] = input.mode === 'personality_model'
        ? buildFastReplyPersonalityPlanCandidates(directPlanText)
        : [{ id: 'direct_plan_1', strategy: '', strategyLabel: '', intensity: '', content: directPlanText }]
      candidatePlans = directCandidates
      topPlans = directCandidates.slice(0, 1)
      expressionMix = input.directExpressionMix || null
      wordCountAdvice = input.directWordCountAdvice || null
      rerankerDiagnostics = undefined
      // “快速/完整”是统筹深度，“人格/普通”是回复后端。稳定续话不再跑编排模型，
      // 但有人格模型时仍用它在三条确定性直通策略间评分，确保人格后端没有被快速路径静默绕过。
      if (input.mode === 'personality_model' && directCandidates.length > 1) {
        input.onStep?.('review', 'running')
        try {
          const [{ scorePersonalityPlansRouted }, { fetchMyPersonalityInferencePrefs }] = await Promise.all([
            import('../../app/personalityRerankerRouter'),
            import('../../repositories/personalityInferencePrefsRepository')
          ])
          const inferencePrefs = await fetchMyPersonalityInferencePrefs()
          const rerankerResult = await scorePersonalityPlansRouted({
            personalityModelPath,
            situation: projectionContext.compressedContext,
            plans: directCandidates.map((candidate) => String(candidate.content || ''))
          }, {
            abortSignal: input.abortSignal,
            mode: inferencePrefs.mode,
            serverAllowed: inferencePrefs.serverAllowed
          })
          if (rerankerResult.scores.length !== directCandidates.length) {
            throw new Error(`人格模型 ReRanker 评分数量不匹配：候选 ${directCandidates.length} 条，得分 ${rerankerResult.scores.length} 条`)
          }
          const scores: PersonalityPlanRerankerScore[] = directCandidates.map((candidate, index) => ({
            candidateId: candidate.id || `reuse_direct_${index + 1}`,
            score: rerankerResult.scores[index]
          }))
          topPlans = rankPersonalityPlanCandidates(directCandidates, scores, 1)
          candidatePlans = directCandidates.map((candidate, index) => ({
            ...candidate,
            score: scores[index]?.score
          }))
          rerankerDiagnostics = {
            ...(rerankerResult.diagnostics as unknown as Record<string, unknown>),
            executionPolicy: 'reuse_direct_personality_rerank',
            selectedPlanId: String(topPlans[0]?.id || '')
          }
          input.onStep?.('review', 'done')
        } catch (error) {
          if (isAbortError(error) || input.abortSignal?.aborted) throw error
          const reason = error instanceof Error ? error.message : String(error || '人格模型评分失败')
          rerankerDiagnostics = {
            executionPolicy: 'reuse_direct_personality_rerank',
            degraded: true,
            reason,
            selectedPlanId: String(topPlans[0]?.id || '')
          }
          input.onReviewDegraded?.(reason)
          input.onStep?.('review', 'done')
        }
      }
    } else {
    harnessResult = await runReplyPlanOrchestratorHarness({
      mode: input.mode,
      characterName: input.speakerName,
      sessionWorldContext: projectChatSessionWorldAgentContext(readSessionById(sessionId)),
      // F2 群聊分镜吃提调情境：提调下发的情境（code+body）透传给 harness，跳过 readScenarioSkill 直接进生成轮。
      providedScenario: input.providedScenario || null,
      // 提调对用户的称呼用用户名（导演协议示例据此，不写死「用户」）。
      userName: readUserAddressName(),
      // 判情境只用投影态上下文（投影+输入）；带召回的全量上下文在各计划工具回调里 await 注入。
      // 批次4-投影 B：有提调下发的投影态上下文时用它替代（仅替换编排器判情境/生成计划看的上下文·用户 2026-06-23 拍板）；
      //   compose 正文仍用带召回的全量人格上下文（fullContext·保留）。缺省走原 projectionContext.compressedContext，零回归。
      compressedContext: hasDownstreamProjection ? input.downstreamProjectionContext! : projectionContext.compressedContext,
      currentUserInput: input.userText,
      sceneChangeNotice: projectionContext.sceneChangeNotice,
      // 剧情倾向（倾向迁移批次1 后=执行层保留）：replyPlan 分镜编排直接产内容需要基调，非空即 system 追加倾向块。
      directorPref: loadActiveDirectorPref(),
      // 用户私密提调指令（只管本轮）：非空时系统提示词追加「必须遵守·禁止泄露」段，只给提调看。
      userDirectorDirectives: activePipelineDirectorDirectives,
      config: orchestratorConfig,
      // 取料三件套接缝（批次1d-A）：与召回同源（同一 embedding/缓存/文档），存在即让提调可按需取特殊料。
      // 带上本轮会话 id，文档库单元按该会话所挂世界裁（后台轮跨会话也不串）。
      retrievalContext: buildTidiaoRetrievalContext?.(input.speakerTargetId || input.targetId, { sessionId: activePipelineSessionId || getActiveSessionId(chatStore) }) || undefined,
      // 读会话消息接缝（批次 M2）：用当前会话消息列表造楼层号读取接缝，让提调按「角色N/旁白M（含范围）」读会话原文。
      chatMessageReadContext: createTidiaoChatMessageReadContext(getCurrentMessageList(chatStore) as Array<Record<string, unknown>>),
      signal: input.abortSignal,
      // 候选生成/评审/融合阶段推进透传给过程轨（含重试语义）。
      onStageProgress: input.onStep ? (event) => input.onStep!(event.step, event.status) : undefined,
      // 实时旁述（D5）：提调每轮 thought 透传给过程轨，编排带展开态逐句呈现。
      onThought: input.onThought ? (event) => input.onThought!(event.thought) : undefined,
      // 评审降级原因透传给过程轨（评审步标注降级）。
      onReviewDegraded: input.onReviewDegraded,
      // 导演流（真·导演 loop 子批3）：存在即让 harness 进导演模式，loop 每步快照实时上抛驱动轮级载体。
      onDirectorStream: input.onDirectorStream,
      // 批次K·自主重排：纠偏续跑的重规划 brief 透传给 harness（导演模式 + 非空时追加纠偏自主重规划协议）。
      replanBrief: input.replanBrief || null,
      // 批次M1b·重试：重试 brief 透传给 harness（导演模式 + 非空时追加重试协议，揣测意图/按意见改这条）。
      retryBrief: input.retryBrief || null,
      onScenarioResolved: async (event) => {
        // 帷幕场景兜底：提调判完情境但未显式改场景，而用户输入含显式场景指令时，补一次 updateCurtainScene。
        // 批次C 后旁白已统一归轮级提调（providedScenario + roundDirectorNarration 提前起跑）——此回调不再起 per-character 旁白臂。
        if (!event.curtainSceneUpdate?.changed) {
          const fallbackToolCall = inferExplicitCurtainSceneUpdateToolCall(input.userText)
          if (fallbackToolCall) {
            await applyAndRememberCurtainSceneUpdate(fallbackToolCall)
          }
        }
      },
      updateCurtainScene: applyAndRememberCurtainSceneUpdate,
      // 多轮 loop：每轮传入累积 messages；turn0 的 messages 即初始编排提示词，持久化为编排器提示词日志。
      // 切原生工具调用：toolBriefs→OpenAI tools 经 callAIWithTools 下发，返回 { content, toolCalls }；
      // 工具走原生 tool_calls，content-JSON 只承载 scenario/thought/expressionMix 等编排元数据（混合方案）。
      callOrchestrator: async ({ messages, toolBriefs, toolCatalog, turnIndex }) => {
        // R1-B item7：deferred 模式把 toolsearch 越权话术拼进 system 协议（toolCatalog 空则原样·零影响）。
        const sentMessages = withToolsearchOverrideProtocol(messages, toolCatalog)
        if (turnIndex === 0) {
          orchestrationPromptLogIdRef.value = await persistPersonalityModelPromptTrace({
            sessionId,
            targetId: input.speakerTargetId || input.targetId,
            speakerName: `回复计划编排器：${input.speakerName}`,
            trace: {
              finalPrompt: sentMessages.map((message) => `## ${message.role}\n${message.content}`).join('\n\n'),
              promptBlocks: sentMessages.map((message) => ({
                role: message.role,
                title: message.role === 'system' ? '回复计划编排系统规则' : '回复计划编排输入',
                content: message.content
              }))
            }
          })
        }
        const result = await resolveCallAIWithTools()(sentMessages as any, {
          // 输出预算按模式区分：人格模型生成轮一份 JSON 里最多 8 个 generatePlanBatch（每个带 planPrompt），
          // 需要 1800；普通召回单计划只发 1 个工具调用，1000 足够且直接缩短逐 token 等待。
          ...buildTaskModelAiOptions(agentConfig as any, 'replyPlanMain', { maxTokens: input.mode === 'personality_model' ? 1800 : 1000, temperature: 0.25, thinking: 'disabled' }),
          tools: toOpenAiTools(toolBriefs),
          feature: 'agent',
          logLabel: input.mode === 'personality_model' ? 'personality-model-reply-plan-orchestrator' : 'normal-recall-reply-plan-orchestrator',
          usageLabel: `${workflowLabel}回复计划编排：${input.speakerName}`,
          placeLabel: `会话：${getTargetName(input.targetId)}`,
          placeType: input.targetId === input.speakerTargetId ? 'single' : 'group',
          signal: input.abortSignal
        })
        return { content: result?.content ?? '', toolCalls: result?.toolCalls ?? [] }
      },
      // 合并生成协议（2026-07-08）：一次收全部反应类别组，一次计划模型调用产出全部候选（全量情境只烧一遍）。
      // 旧平铺单类别调用被工具层归一化成单元素数组，同样走这里（等价旧行为）。
      generatePlanBatch: async (toolCalls: GeneratePlanBatchToolCall[]) => {
        assertPipelineCanContinue(activePipelineRunId, input.taskRunId)
        // 批次1d-B：退役自动召回后用投影态上下文（projectionContext）；特殊料已由提调按需取并写进 toolCall.planPrompt。
        // 未退役时（开关 false）仍用带召回的全量上下文。
        const planContext = fullContextPromise ? (await fullContextPromise).fullContext : projectionContext
        const mergedSceneChangeNotice = mergePersonalitySceneChangeNotices(
          planContext.sceneChangeNotice || projectionContext.sceneChangeNotice,
          curtainSceneUpdateNotice
        )
        const totalPlanCount = toolCalls.reduce((sum, call) => sum + call.intensities.length, 0)
        const groupLabel = toolCalls.map((call) => call.strategyLabel || call.strategy).filter(Boolean).join('、')
        const planPromptTrace = buildPersonalityCandidatePlanPrompt({
          characterName: input.speakerName,
          systemPromptPrefix: candidatePlanSystemPromptPrefix,
          compressedContext: planContext.compressedContext,
          currentUserInput: input.userText,
          sceneChangeNotice: mergedSceneChangeNotice,
          batches: toolCalls.map((call) => ({
            strategy: call.strategy,
            strategyLabel: call.strategyLabel,
            intensities: call.intensities,
            planPrompt: call.planPrompt
          }))
        })
        const promptLogId = await persistPersonalityModelPromptTrace({
          sessionId,
          targetId: input.speakerTargetId || input.targetId,
          speakerName: `${workflowLabel}计划批次：${groupLabel}`,
          trace: planPromptTrace
        })
        const output = await callAI(planPromptTrace.messages as Array<{ role: ChatRole; content: string }>, {
          // 单计划（normal_recall）只产 1 条计划正文，500 足够；合并生成按总候选数分档放大（≤4 条与旧单批 900 等价）。
          ...buildTaskModelAiOptions(agentConfig as any, 'replyPlanLite', {
            maxTokens: input.mode === 'personality_model' ? Math.min(3600, 900 * Math.max(1, Math.ceil(totalPlanCount / 4))) : 500,
            temperature: 0.45,
            thinking: 'disabled'
          }),
          stream: false,
          feature: 'role_message',
          logLabel: `${input.mode === 'personality_model' ? 'personality-model' : 'normal-recall'}-plan-batch-${toolCalls.map((call) => call.strategy).filter(Boolean).join('+') || 'strategy'}`,
          usageLabel: `${workflowLabel}计划批次：${groupLabel}`,
          placeLabel: `会话：${getTargetName(input.targetId)}`,
          placeType: input.targetId === input.speakerTargetId ? 'single' : 'group',
          signal: input.abortSignal
        })
        const normalized = normalizePersonalityPlanBatchOutput(output, {
          expectedCount: totalPlanCount,
          failurePrefix: `人格模型计划批次 ${groupLabel}`
        })
        // 按声明顺序逐组对号入座：解析只信声明矩阵（类别×强度序），不信模型自写的 strategy/intensity 字段。
        const batchCandidates: ReplyPlanCandidate[] = []
        let cursor = 0
        for (const call of toolCalls) {
          const batchIdSuffix = allocatePlanBatchIdSuffix(call.strategy, generatePlanBatchIdCounts)
          const groupSlice = normalized.slice(cursor, cursor + call.intensities.length)
          cursor += call.intensities.length
          groupSlice.forEach((candidate, index) => {
            batchCandidates.push({
              ...candidate,
              id: `${call.strategy}${batchIdSuffix}_${call.intensities[index] || index + 1}`,
              strategy: call.strategy,
              strategyLabel: call.strategyLabel,
              intensity: call.intensities[index] || candidate.intensity || '',
              content: String(candidate.content || '')
            })
          })
        }
        return { candidates: batchCandidates, promptLogId, rawOutput: output }
      },
      reviewPlanCandidates: async (_toolCall: ReviewPlanCandidatesToolCall, candidates: PersonalityPlanCandidate[]) => {
        assertPipelineCanContinue(activePipelineRunId, input.taskRunId)
        // 评审是人格模型专属阶段：普通召回 skipReview 协议下不应进入这里；若进入说明 harness 门控失效，显式失败。
        if (input.mode !== 'personality_model') {
          throw new Error('普通召回工作流不应进入 ReRanker 评审：skipReview 门控失效')
        }
        // 批次1d-B：评审情境与计划生成口径一致——退役自动召回后用投影态上下文，未退役时用全量。
        const reviewContext = fullContextPromise ? (await fullContextPromise).fullContext : projectionContext
        const reviewInput = buildReviewPlanCandidatesInput({
          compressedContext: reviewContext.compressedContext,
          candidates: candidates.map((candidate, index) => ({
            id: String(candidate.id || `plan_${index + 1}`),
            strategy: String(candidate.strategy || ''),
            strategyLabel: candidate.strategyLabel,
            intensity: String(candidate.intensity || ''),
            content: String(candidate.content || '')
          }))
        })
        reviewPromptLogIdRef.value = await persistPersonalityModelPromptTrace({
          sessionId,
          targetId: input.speakerTargetId || input.targetId,
          speakerName: `人格模型候选评审：${input.speakerName}`,
          trace: {
            finalPrompt: [
              '## reviewPlanCandidates',
              '输入只包含已整合情境和候选计划正文；浏览器本地 ReRanker 使用同一边界逐条打分。',
              '',
              reviewInput.compressedContext,
              '',
              reviewInput.candidates.map((candidate, index) => `${index + 1}. ${candidate.content}`).join('\n')
            ].join('\n'),
            promptBlocks: [
              { role: 'system', title: '评审工具边界', content: '输入只包含已整合情境和单个候选计划；不得加入编排器理由或工具 JSON。' },
              { role: 'user', title: '评审工具输入摘要', content: reviewInput.candidates.map((candidate, index) => `${index + 1}. ${candidate.content}`).join('\n') }
            ]
          }
        })
        // 批次2a/2b：评审走推理路由（移动端→服务端 / 桌面端→本地可回退），按用户偏好与服务端推理权限分流；失败仍抛回 harness 统一降级。
        const { scorePersonalityPlansRouted } = await import('../../app/personalityRerankerRouter')
        const { fetchMyPersonalityInferencePrefs } = await import('../../repositories/personalityInferencePrefsRepository')
        const inferencePrefs = await fetchMyPersonalityInferencePrefs()
        const rerankerResult = await scorePersonalityPlansRouted({
          personalityModelPath,
          situation: reviewInput.compressedContext,
          plans: reviewInput.candidates.map((candidate) => String(candidate.content || ''))
        }, {
          abortSignal: input.abortSignal,
          mode: inferencePrefs.mode,
          serverAllowed: inferencePrefs.serverAllowed
        })
        const rawScores = rerankerResult.scores
        if (rawScores.length !== reviewInput.candidates.length) {
          throw new Error(`人格模型 ReRanker 评分数量不匹配：候选 ${reviewInput.candidates.length} 条，得分 ${rawScores.length} 条`)
        }
        const scores: PersonalityPlanRerankerScore[] = candidates.map((candidate, index) => ({
          candidateId: candidate.id || `plan_${index + 1}`,
          score: rawScores[index]
        }))
        const scoredCandidates = candidates.map((candidate, index) => ({
          ...candidate,
          id: String(candidate.id || `plan_${index + 1}`),
          content: String(candidate.content || ''),
          strategy: String(candidate.strategy || ''),
          intensity: String(candidate.intensity || ''),
          score: scores[index]?.score
        }))
        const topPlans = rankPersonalityPlanCandidates(candidates, scores, 3).map((candidate, index) => ({
          ...candidate,
          id: String(candidate.id || `top_plan_${index + 1}`),
          content: String(candidate.content || ''),
          strategy: String(candidate.strategy || ''),
          intensity: String(candidate.intensity || '')
        }))
        // 影子模式旁路（第 7 批）：若该角色开启了影子观察，用影子版本对同一候选组打分并记录排序差异。
        // fire-and-forget：影子失败绝不影响真实回复；桌面端门槛与模型释放在 personalityShadowMode 内收口。
        void (async () => {
          try {
            const { maybeRunPersonalityShadowScoring } = await import('../../app/personalityShadowMode')
            await maybeRunPersonalityShadowScoring({
              characterId: String((character as Record<string, unknown> | null)?.id || ''),
              situation: reviewInput.compressedContext,
              candidates: scoredCandidates.map((candidate) => ({
                id: String(candidate.id || ''),
                content: String(candidate.content || ''),
                score: Number(candidate.score ?? 0)
              })),
              basePickId: String(topPlans[0]?.id || '')
            })
          } catch {
            // 影子旁路异常吞掉，不影响真实回复
          }
        })()
        return {
          scoredCandidates,
          topPlans,
          promptLogId: reviewPromptLogIdRef.value,
          diagnostics: rerankerResult.diagnostics as unknown as Record<string, unknown>
        }
      }
    })
    // 【临时诊断·情境挂载断点定位（用户 2026-06-20）】钉死后整段删除：
    // 打印解析出的情境 code、配置里是否命中该情境、该情境启用的 mountedPrompts 条数、最终挂载文本长度。
    resolvedScenarioCode = resolveReplyPlanOrchestrationScenarioCode({
      ...harnessResult.orchestration,
      turns: harnessResult.turns,
      transcript: harnessResult.transcript
    })
    scenarioMountedPromptText = buildScenarioMountedPromptText(orchestratorConfig, resolvedScenarioCode)
    try {
      const cfgScenarios = Array.isArray(orchestratorConfig?.scenarios) ? orchestratorConfig.scenarios : []
      const normCode = normalizeReplyPlanScenarioCode(resolvedScenarioCode)
      const hitScenario = cfgScenarios.find((item) => normalizeReplyPlanScenarioCode(item?.code) === normCode)
      const mp = Array.isArray(hitScenario?.mountedPrompts) ? hitScenario.mountedPrompts : []
      const enabledWithContent = mp.filter((p) => p?.enabled !== false && String(p?.content || '').trim()).length
      console.warn('[情境挂载诊断]', {
        '解析出的情境code': resolvedScenarioCode || '(空)',
        'orchestration.scenario原始': harnessResult?.orchestration?.scenario || '(空)',
        '各轮parsed.scenario': (Array.isArray(harnessResult?.turns) ? harnessResult.turns : []).map((t) => t?.scenario || '').filter(Boolean),
        '配置里有几个情境': cfgScenarios.length,
        '配置情境code清单': cfgScenarios.map((s) => s?.code).filter(Boolean),
        '是否命中该情境': Boolean(hitScenario),
        '该情境mountedPrompts总条数': mp.length,
        '其中启用且有正文的条数': enabledWithContent,
        '最终挂载文本长度': scenarioMountedPromptText.length
      })
    } catch (diagError) {
      console.warn('[情境挂载诊断] 打印失败', diagError)
    }
    candidatePlans = harnessResult.scoredCandidates
    topPlans = harnessResult.topPlans
    expressionMix = harnessResult.expressionMix
    wordCountAdvice = harnessResult.wordCountAdvice
    rerankerDiagnostics = harnessResult.diagnostics
    }
    // 旁白激进版：主链路只等"决策"（拿到旁白审计与正文支线 completion），不等正文落库；
    // 正文生成与最终回复并行，角色回复的剧情承接交给计划与场景变化提醒，不再注入旁白意图摘要。
    let narrationCompletion: Promise<PersonalityNarrationSubagentRunAudit> | null = null
    // 批次B·F3 真并行提前（轮级·批次C 后唯一旁白路）：旁白已在 harness 前起跑（见上方 roundDirectorNarration），与 plan/评审并行。
    // 这里只收信息承载串行闸门——先等信息承载旁白生成+投影落库，下面 fetchChatPersonalityModelContextBySessionId 才能经
    // listVisibleMessageProjectionsForCharacter 读到本轮旁白投影，让角色回复承接其信息；无信息承载旁白时立即放行、零额外延迟。
    // narrationStarted 闸口（提前起跑时已置）保证一轮只生成一次，后续发言者承接已落库的旁白投影。
    // 串行压缩批C2：并行群聊下抢闸失败的 speaker 局部 roundDirectorNarration 为 null——回退读
    // activeRoundDirector 上的共享句柄（并行发起前提前起跑时写入），保证每个 speaker 建上下文前都会等
    // 信息承载开场旁白落库（全员都要承接开场事实，这是并行下的正确语义）。
    const effectiveRoundDirectorNarration = roundDirectorNarration || activeRoundDirector?.roundDirectorNarration || null
    if (effectiveRoundDirectorNarration) {
      personalityNarrationSubagentAudit = effectiveRoundDirectorNarration.audit
      narrationCompletion = effectiveRoundDirectorNarration.completion
      await effectiveRoundDirectorNarration.infoBearingSettled
    }
    // 最终上下文重新读取投影真值；旁白正文若恰好已落库（极快旁白），仍按原文兜底进入本轮角色提示词。
    // 批次1d-B：退役自动召回后无 recallSections（特殊料已在选中计划内容里）；未退役时取全量召回段。
    let recallSections = fullContextPromise ? (await fullContextPromise).recallSections : undefined
    // 批次3·3c 注入侧隔离命门（U4 转正常开）：退役自动召回（无 recallSections）时，从本轮**该发言者私有池**
    // 注入 recallSections.general——只取 getCharacterPoolCards(speakerId)（绝不含世界池/他角色池），世界知识只走旁白。
    // 未填池的轮 loadActiveRoundRecallPools 返 null → 不注入，自然零回归。
    if (!recallSections) {
      const pools = loadActiveRoundRecallPools()
      if (pools) {
        const speakerId = input.speakerTargetId || input.targetId
        recallSections = renderCharacterPoolRecallSections(getCharacterPoolCards(pools, speakerId)) || undefined
      }
    }
    const finalContext = await fetchChatPersonalityModelContextBySessionId(sessionId, {
      ...basePayloadBase,
      recallSections,
      fallbackMessageIds: personalityNarrationMessageIds,
      sceneChangeNotice: curtainSceneUpdateNotice || undefined,
      candidatePlans: candidatePlans,
      topPlans,
      expressionMix,
      scenarioMountedPromptText
    })
    return {
      context: finalContext,
      // 批次4：本轮投影事实（全量），供回复后台触发滚动会话记忆压缩用。
      projectionItems: projectionContext.projectionItems,
      candidatePlans,
      topPlans,
      expressionMix,
      wordCountAdvice,
      characterIdentity,
      scenarioMountedPromptText,
      rerankerDiagnostics,
      curtainSceneUpdate,
      narrationCompletion,
      // 批B：direct 分支没跑 harness，没有编排/评审可审计——安全缺省=不带 orchestration
      // （审计侧栏 PersonalityModelOrchestrationAuditPanel 对缺省 orchestration 已容错显示"无记录"，不会崩溃）。
      ...(harnessResult
        ? {
          orchestration: {
            ...harnessResult.orchestration,
            // AgentRuntime 正式轨迹：审计侧栏优先读取 turns/hookEvents/nextTurnPatches，history 不落库以免保存完整提示词正文。
            transcript: {
              kind: harnessResult.transcript.kind,
              agentName: harnessResult.transcript.agentName,
              runtimeVersion: harnessResult.transcript.runtimeVersion,
              initialActiveTools: harnessResult.transcript.initialActiveTools,
              turns: harnessResult.transcript.turns,
              budget: harnessResult.transcript.budget,
              terminalReason: harnessResult.transcript.terminalReason
            },
            // 旧多轮执行轨迹仅作既有审计 payload 兜底展示，由 transcript 派生，不再作为模型输入协议。
            turns: harnessResult.turns,
            promptLogId: orchestrationPromptLogIdRef.value,
            reviewPromptLogId: reviewPromptLogIdRef.value,
            narrationSubagent: personalityNarrationSubagentAudit
          }
        }
        : {})
    }
  }

  async function buildPersonalityPromptLibrarySystemAssembly(input: {
    targetId: string
    speakerTargetId: string
    taskRunId: string
    userIdentityChangeNotice?: string
    scenarioMountedPromptText?: string
  }): Promise<PersonalityPromptLibraryAssemblyResult> {
    await ensureScenarioMountedPromptPlaceholderBeforeAssembly(settingStore, input.scenarioMountedPromptText)
    const rawPromptMessages = typeof buildPromptMessages === 'function'
      ? buildPromptMessages(input.speakerTargetId || input.targetId, 'chat', {
        taskRunId: input.taskRunId,
        userIdentityChangeNotice: input.userIdentityChangeNotice,
        scenarioMountedPromptText: input.scenarioMountedPromptText,
        suppressCurrentUserInputTemplate: true,
        forceEmptyRecall: true,
        forceEmptyRoleProfile: false
      })
      : []
    const promptMessages = await resolveDynamicPromptMessages(rawPromptMessages as Array<{ role: ChatRole; content: string }>)
    return buildPersonalityPromptLibraryAssembly({
      promptMessages,
      scenarioMountedPromptText: input.scenarioMountedPromptText
    })
  }

  function resolveUserCustomPromptPresetContent(): string {
    const presets = Array.isArray((settingStore as Record<string, unknown>).promptPresets)
      ? (settingStore as Record<string, unknown>).promptPresets as Array<Record<string, unknown>>
      : []
    const preset = presets.find((item) => String(item?.id || '').trim() === 'user_custom')
      || presets.find((item) => String(item?.name || '').trim() === '用户自定义')
    if (!preset) return ''
    const enabled = preset.enabled
    if (enabled === false || enabled === 0 || enabled === '0' || enabled === 'false') return ''
    return String(preset.content || '').trim()
  }

  function buildScenarioMountedPromptText(
    config: ReplyPlanOrchestratorConfig | null | undefined,
    scenarioCode: string
  ): string {
    const code = normalizeReplyPlanScenarioCode(scenarioCode)
    if (!code) return ''
    const scenario = (Array.isArray(config?.scenarios) ? config?.scenarios : [])
      .find((item) => normalizeReplyPlanScenarioCode(item?.code) === code)
    const prompts = Array.isArray(scenario?.mountedPrompts) ? scenario.mountedPrompts : []
    return prompts
      .map((prompt, index) => {
        const orderIndex = Number(prompt?.orderIndex)
        return {
          content: String(prompt?.content || '').trim(),
          enabled: prompt?.enabled !== false,
          orderIndex: Number.isFinite(orderIndex) ? orderIndex : 2.1 + index / 100
        }
      })
      .filter((prompt) => prompt.enabled && prompt.content)
      .sort((left, right) => left.orderIndex - right.orderIndex)
      .map((prompt) => prompt.content)
      .join('\n\n')
  }

  function buildGateAuditPayload(content: string, model = ''): Record<string, unknown> {
    const envSnapshot = getCurrentEnvironmentSnapshot()
    return {
      role: 'assistant',
      messageKind: 'narration_debug',
      message_kind: 'narration_debug',
      name: '角色出场地点门禁',
      memberName: '角色出场地点门禁',
      content,
      time: new Date().toLocaleTimeString(),
      model,
      envDate: envSnapshot.envDate,
      envWeather: envSnapshot.envWeather,
      envLocation: envSnapshot.envLocation,
      createdAt: new Date().toISOString()
    }
  }




  function readMessageTextField(message: Record<string, unknown> | null | undefined, camel: string, snake: string) {
    return String(message?.[camel] ?? message?.[snake] ?? '').trim()
  }

  function readEffectiveSessionEnvironment(session: Record<string, unknown> | null | undefined, fallbackMessage?: Record<string, unknown> | null) {
    const scene = resolveEffectiveVirtualScene(session as any, {
      currentTime: settingStore.currentTime,
      currentWeather: settingStore.currentWeather,
      currentLocation: settingStore.currentLocation
    }, Date.now())
    const messageDate = readMessageTextField(fallbackMessage, 'envDate', 'env_date')
    const messageWeather = readMessageTextField(fallbackMessage, 'envWeather', 'env_weather')
    const messageLocation = readMessageTextField(fallbackMessage, 'envLocation', 'env_location')
    return {
      envDate: String(scene?.time || messageDate || settingStore.currentTime || '').trim(),
      envWeather: String(scene?.weather || messageWeather || settingStore.currentWeather || '').trim(),
      envLocation: String(scene?.location || scene?.realLocation || messageLocation || '').trim()
    }
  }

  function readLastVisibleEnvironmentMessage(messages: Array<Record<string, unknown>>, inputMessageId: number) {
    return [...messages].reverse().find((message) => {
      const id = Number(message?.id || 0)
      if (inputMessageId > 0 && id >= inputMessageId) return false
      const kind = String(message?.messageKind ?? message?.message_kind ?? '').trim()
      if (kind === 'narration_debug') return false
      const hidden = (message as any).autoWriteHidden ?? (message as any).auto_write_hidden
      if (hidden === true || hidden === 1 || hidden === '1' || hidden === 'true') return false
      return Boolean(readMessageTextField(message, 'envDate', 'env_date')
        || readMessageTextField(message, 'envWeather', 'env_weather')
        || readMessageTextField(message, 'envLocation', 'env_location'))
    }) || null
  }






  function resolveSessionNarrationProfiles(session: any): NarrationProfile[] {
    return normalizeNarrationProfiles(session?.narrationProfiles ?? session?.narration_profiles, {
      frequency: session?.narrationFrequency ?? session?.narration_frequency,
      temperature: session?.narrationTemperature ?? session?.narration_temperature
    })
  }

  function resolveBuiltinNarrationProfile(session: any, kind: BuiltinNarrationKind): NarrationProfile {
    return findNarrationProfileByKind(session?.narrationProfiles ?? session?.narration_profiles, kind, {
      frequency: session?.narrationFrequency ?? session?.narration_frequency,
      temperature: session?.narrationTemperature ?? session?.narration_temperature
    })
  }

  function resolvePersonalityNarrationSubagentProfiles(session: any): NarrationProfile[] {
    const rawProfiles = session?.narrationProfiles ?? session?.narration_profiles
    if (rawProfiles == null || rawProfiles === '') return []
    const generatedKinds = collectRoundNarrationKinds(getCurrentMessageList(chatStore) as Array<Record<string, unknown>>)
    return resolveSessionNarrationProfiles(session)
      .filter((profile) => {
        const kind = readBuiltinNarrationKind(profile.id)
        return !kind || !generatedKinds.has(kind)
      })
  }

  function normalizeNarrationProfileIdList(value: unknown): string[] {
    const raw = Array.isArray(value) ? value : [value]
    const ids: string[] = []
    for (const item of raw) {
      const id = String(item || '').trim()
      if (id && !ids.includes(id)) ids.push(id)
    }
    return ids
  }

  function collectNarrationSubagentReadProfileIds(transcript: unknown): string[] {
    const turns = Array.isArray((transcript as any)?.turns) ? (transcript as any).turns : []
    const ids: string[] = []
    for (const turn of turns) {
      const toolResults = Array.isArray(turn?.toolResults) ? turn.toolResults : []
      for (const result of toolResults) {
        if (String(result?.toolName || '').trim() !== 'readNarrationSkill') continue
        if (String(result?.status || '').trim() !== 'success') continue
        const details = result?.details && typeof result.details === 'object' ? result.details : {}
        const readIds = normalizeNarrationProfileIdList((details as any).profileIds ?? (details as any).profile_ids ?? (details as any).profileId)
        for (const id of readIds) {
          if (!ids.includes(id)) ids.push(id)
        }
      }
    }
    return ids
  }

  function buildNarrationSkillReadAudit(
    profileIds: string[],
    profiles: NarrationProfile[],
    source: PersonalityNarrationSubagentSkillReadSource,
    existing: PersonalityNarrationSubagentSkillReadAudit[] = []
  ): PersonalityNarrationSubagentSkillReadAudit[] {
    const next = existing.slice()
    for (const profileId of normalizeNarrationProfileIdList(profileIds)) {
      if (next.some((item) => item.profileId === profileId)) continue
      const profile = profiles.find((item) => item.id === profileId)
      next.push({
        profileId,
        profileName: String(profile?.name || profileId).trim(),
        triggerDescription: String(profile?.triggerDescription || '').trim(),
        source
      })
    }
    return next
  }

  // 复用本轮人格模型上下文已 fetch 的 projectionItems，建消息级客观事实查找表供旁白投影优先读取。
  // 旁白是世界叙述者，fact 为消息级客观事实(对所有角色一致)，不涉及按角色可见性过滤。
  function buildNarrationProjectionFactMap(
    projectionItems: Array<{ messageId?: number; fact?: string }> | undefined
  ): Map<number, string> {
    const map = new Map<number, string>()
    for (const item of (Array.isArray(projectionItems) ? projectionItems : [])) {
      const messageId = Number(item?.messageId || 0)
      const fact = String(item?.fact || '').trim()
      if (messageId > 0 && fact) map.set(messageId, fact)
    }
    return map
  }

  function buildNarrationSubagentCallAudits(calls: PersonalityNarrationCall[]): PersonalityNarrationSubagentCallAudit[] {
    return (Array.isArray(calls) ? calls : []).map((call) => ({
      profileIds: normalizeNarrationProfileIdList(call.profileIds),
      profileNames: normalizeNarrationProfileIdList(call.profileNames),
      narrationKind: String(call.narrationKind || '').trim(),
      informationBearing: call.informationBearing !== false,
      reason: String(call.reason || '').trim(),
      generatedPromptPreview: String(call.generatedPrompt || '').replace(/\s+/g, ' ').trim().slice(0, 120)
    }))
  }

  async function runPersonalityNarrationCall(input: {
    targetId: string
    sessionId: string
    profile: NarrationProfile
    call: PersonalityNarrationCall
    messages: Array<Record<string, unknown>>
    continuityMessages: Array<Record<string, unknown>>
    projectionFactByMessageId?: Map<number, string>
    insertAfterMessageId?: number
    onMessageWritten?: (messageId: number) => void
    abortSignal?: AbortSignal
    /** 串行压缩批C1（2026-07-13）：生成完成、落库前的等待钩子——段内保序落库链 / 穿插旁白预生成锚点等待共用此口。
     *  返回值可覆盖落库锚点（供穿插预生成场景在锚点角色真实落库后回填真实 insertAfterMessageId）。 */
    beforePersist?: () => Promise<{ insertAfterMessageId?: number } | void>
  }) {
    const session = readSessionById(input.sessionId) as any
    const narrationKind = input.call.narrationKind
    const callProfileIds = Array.isArray(input.call.profileIds) && input.call.profileIds.length
      ? input.call.profileIds
      : [String((input.call as any).profileId || input.profile.id)].filter(Boolean)
    const callProfileNames = Array.isArray(input.call.profileNames) && input.call.profileNames.length
      ? input.call.profileNames
      : [String((input.call as any).profileName || input.profile.name)].filter(Boolean)
    // 批次3 C：generatedPrompt 为旁白「写什么」唯一来源（subagent 必产、强制兜底也据情境生成）；
    // 退役 || input.profile.content（skill 本体直拼）兜底。
    const generatedPrompt = String(input.call.generatedPrompt || '').trim()
    const primaryProfileName = callProfileNames[0] || input.profile.name
    // 批次3·3c 注入侧隔离命门（U4 转正常开）：旁白生成只注入**世界知识池**（getWorldPoolCards·绝无角色私有卡），
    // 映射成「文档库环境资料」证据。角色私有大脑永不进旁白提示词；未填池的轮返 null → 不注入，零回归。
    const narrationRoundPools = loadActiveRoundRecallPools()
    const narrationWorldEvidence = narrationRoundPools
      ? worldPoolCardsToNarrationEvidence(getWorldPoolCards(narrationRoundPools))
      : undefined
    const narration = await generateAndWriteNarration({
      session: {
        ...(session || {}),
        id: input.sessionId,
        sessionId: input.sessionId,
        targetId: input.targetId
      },
      recallEvidence: narrationWorldEvidence,
      plan: {
        shouldInsert: true,
        narrationKind,
        reasons: ['personality_narration_subagent'],
        modelTier: narrationKind === 'event_push' ? 'standard' : 'quick',
        frequency: 'standard',
        temperature: 'standard',
        profileId: input.profile.id,
        profileName: primaryProfileName,
        score: input.call.score,
        debug: {
          source: 'personality_narration_subagent',
          reason: input.call.reason,
          profileIds: callProfileIds,
          profileNames: callProfileNames
        }
      },
      messages: input.messages as any[],
      continuityMessages: input.continuityMessages as any[],
      // 旁白上下文投影优先（chat 文档 line 38/41）：复用本轮已 fetch 的 projectionItems fact map，
      // 旁白「聊天记录」改读消息级客观事实，剥掉角色回复 $动作$/（神态）/{心理}/台词杂质。
      projectionFactByMessageId: input.projectionFactByMessageId,
      agentConfig: readBrainAgentConfigFromList(settingStore.agentModelConfigs),
      callAI: callAI as any,
      now: new Date().toISOString(),
      narrationProfile: input.profile,
      agentAuthoredPrompt: {
        profileIds: callProfileIds,
        profileNames: callProfileNames,
        content: generatedPrompt,
        reason: input.call.reason
      },
      roleAppearanceProfiles: narrationKind === 'appearance' ? await buildCurrentNarrationRoleAppearanceProfiles(input.sessionId) : [],
      sceneChangeNotice: [
        '本次旁白由人格模型回复链路的旁白陪跑 subagent 确认触发，用于在角色回复酝酿期间给用户提供可读承接。',
        `subagent 判断：${input.call.reason}`,
        '旁白必须服务当前场景承接，不得替最终角色回复发言，不得暴露 subagent、工具或内部链路。'
      ].join('\n'),
      abortSignal: input.abortSignal,
      beforePersist: input.beforePersist
    })
    if (narration?.messageId && narration.messagePayload) {
      markPipelineNarrationKind(readBuiltinNarrationKind(input.profile.id) || narrationKind)
      const messageId = Number(narration.messageId || 0)
      input.onMessageWritten?.(messageId)
      // beforePersist 覆盖锚点优先（穿插旁白预生成场景：起跑时锚点角色还没落库，beforePersist 等到真实
      // messageId 后才回填）；无覆盖时沿用现状口径。
      const insertAfterMessageId = typeof narration.insertAfterMessageIdOverride === 'number'
        ? narration.insertAfterMessageIdOverride
        : (input.insertAfterMessageId || activePipelineInputMessageId || undefined)
      queuePendingPersistedMessage(chatStore, input.sessionId || input.targetId, {
        id: messageId,
        ...narration.messagePayload,
        _targetId: input.targetId,
        _sessionId: input.sessionId,
        _localInsertAfterMessageId: insertAfterMessageId
      })
      await nextTick()
      scrollToBottom()
      if (messageId > 0) {
        try {
          await runReplyContextProjectionForMessage({
            sessionId: input.sessionId,
            messageId,
            stage: 'assistant',
            embeddedProjectionText: narration.embeddedProjectionText,
            embeddedProjectionError: narration.embeddedProjectionError,
            embeddedProjectionRequired: narration.embeddedProjectionRequired
          })
        } catch (error) {
          console.warn('人格模型旁白投影失败，已保留旁白原文兜底进入本轮上下文:', error)
        }
      }
      // Q3：返回正文 + messageId，供纠偏 loop 的「新增旁白」接缝记录 narrationCreations。
      return { content: String(narration.content || ''), messageId }
    }
    return null
  }

  /** Q3 收口：中策「改已有旁白提示词重生成」走旁白专链路（generateNarrationContent + 旁白 system 提示词 + 投影 fact），
   *  而非把改后提示词当单条 user 喂角色模型——保证旁白质量/格式与新增旁白(c)、主 loop 旁白同口径。
   *  只生成正文（不写库、不插新消息）+ promptTrace，由 pipeline 据此作目标旁白消息的新版本写回（可回滚）。 */
  async function regenerateExistingNarrationContent(input: {
    targetId: string
    sessionId: string
    messageId: number
    editedPrompt: string
    speakerName: string
    profiles: NarrationProfile[]
    abortSignal?: AbortSignal
  }): Promise<{ content: string; promptTrace?: { finalPrompt: string; promptBlocks?: ChatPromptLogBlock[] } }> {
    const session = getChatStoreCurrentSession(chatStore) as any
    const messageList = getCurrentMessageList(chatStore) as Array<Record<string, unknown>>
    const targetMessage = messageList.find((m) => Number(m?.id || 0) === Number(input.messageId)) || {}
    // 从被改旁白消息读其原 profile/kind（buildNarrationMessagePayload 落库字段）；缺省回退第一个 profile / environment。
    const existingProfileId = String(
      (targetMessage as any).narrationProfileId ?? (targetMessage as any).narration_profile_id ?? ''
    ).trim()
    const existingKind = readBuiltinNarrationKind(
      (targetMessage as any).narrationProfileKind ?? (targetMessage as any).narration_profile_kind
    )
    const profile = input.profiles.find((p) => p.id === existingProfileId) || input.profiles[0] || null
    if (!profile) return { content: '' }
    const narrationKind = existingKind || readBuiltinNarrationKind(profile.id) || 'environment'
    const generated = await generateNarrationContent({
      session: { ...(session || {}), id: input.sessionId, sessionId: input.sessionId, targetId: input.targetId },
      plan: {
        shouldInsert: true,
        narrationKind,
        reasons: ['tidiao_correction_prompt_regen'],
        modelTier: narrationKind === 'event_push' ? 'standard' : 'quick',
        frequency: 'standard',
        temperature: 'standard',
        profileId: profile.id,
        profileName: profile.name,
        score: 1,
        debug: { source: 'tidiao_correction_prompt_regen', reason: '提调中策据改后提示词重生成已有旁白', profileIds: [profile.id], profileNames: [profile.name] }
      },
      messages: messageList as any[],
      continuityMessages: messageList.slice() as any[],
      agentConfig: readBrainAgentConfigFromList(settingStore.agentModelConfigs),
      callAI: callAI as any,
      now: new Date().toISOString(),
      narrationProfile: profile,
      // 改后的旁白提示词即「写什么」的唯一来源（与新增旁白(c) 的 generatedPrompt 同口径）。
      agentAuthoredPrompt: { profileIds: [profile.id], profileNames: [profile.name], content: input.editedPrompt },
      roleAppearanceProfiles: narrationKind === 'appearance' ? await buildCurrentNarrationRoleAppearanceProfiles(input.sessionId) : [],
      ...(input.abortSignal ? { abortSignal: input.abortSignal } : {})
    })
    const content = cleanAiPrefix(normalizeAiOutputText(String(generated?.content || '')))
    return {
      content,
      ...(generated?.promptTrace ? { promptTrace: { finalPrompt: generated.promptTrace.finalPrompt, promptBlocks: generated.promptTrace.promptBlocks } } : {})
    }
  }

  /** 轮级导演旁白正文生成：旁白「读 skill→定方向」已在轮级提调 decideRoundDirector loop 内完成（决策流可见、排进分镜），
   *  这里只据收集的 narrationCalls 生成旁白正文（编排达标后才生成、与角色回复并行、不抢跑）。
   *  返回 { completion, audit }：completion 在本轮收尾 await；audit 共享可变（正文段写 messageIds 后随 trace 落库）。
   *  批次C 后是单聊群聊统一的唯一旁白生成路（复用 runPersonalityNarrationCall）。 */
  function startDirectorNarrationCompletion(input: {
    targetId: string
    sessionId: string
    runId: number
    speakerName: string
    calls: PersonalityNarrationCall[]
    profiles: NarrationProfile[]
    projectionFactByMessageId?: Map<number, string>
    insertAfterMessageId?: number
    onMessageWritten?: (messageId: number) => void
    onOutcome?: (outcome: ReplyWorkflowNarrationOutcome) => void
    abortSignal?: AbortSignal
    // 穿插旁白预生成（批C1-②）：起跑时锚点角色内存正文尚未落库——不能读当前 store 消息列表（还没有它），
    // 调用方传入「当前消息+内存伪消息」快照替代现取。缺省=现状逐字不变（现取 getCurrentMessageList）。
    messagesOverride?: Array<Record<string, unknown>>
    // 穿插旁白预生成：落库前除了等段内保序落库链，还要等锚点角色真实落库拿到 id（该 promise resolve 真实
    // messageId；resolve(undefined)=锚点没等到，落库时按 insertAfterMessageId 兜底值）。缺省=不等（现状逐字不变）。
    awaitAnchor?: () => Promise<number | undefined>
    // 全轮落库顺序门控（串行压缩批C2·2026-07-13）：传入时本段不再自建 releaseChain，改从外部链按 orderedCalls
    // 声明序 claim 槽位——供并行群聊把 round_start 段的旁白也编进「round_start→角色A→角色B→…」这条全轮持久序。
    // 缺省=自建（单聊/C1 路径零回归，仍只在段内自己排序）。
    externalChain?: { claim(): NarrationReleaseChainGate }
  }): { completion: Promise<PersonalityNarrationSubagentRunAudit>; infoBearingSettled: Promise<void>; audit: PersonalityNarrationSubagentRunAudit } {
    // 旁白独立分镜工作流（2026-06-30）：旁白正文生成进度不再混进角色子工作流过程轨（旧 onStep('narration')），
    // 改路由到本轮 directorStream 旁白镜的「生成旁白」节点（running→done/failed）。捕获本轮 directorStream runId
    // （update 内按 runId 自守，新轮起即丢弃迟到生成态），并打点起始时间算单步耗时。
    const narrationDirectorRunId = activePipelineTidiaoRunId
    const checkpointLifecycle = activeReplySituationCheckpointLifecycle
    const narrationGenStartedAt = Date.now()
    let narrationGenFailed = false
    const messages = input.messagesOverride || (getCurrentMessageList(chatStore) as Array<Record<string, unknown>>)
    const continuityMessages = messages.slice()
    const audit: PersonalityNarrationSubagentRunAudit = {
      called: true,
      messageIds: [],
      readSkills: [],
      confirmedCalls: buildNarrationSubagentCallAudits(input.calls),
      // 决策由导演 loop 产出（非独立 subagent），terminalReason 标注来源供审计区分。
      terminalReason: 'director_loop'
    }
    const confirmedProfileIds = audit.confirmedCalls.flatMap((call) => call.profileIds)
    audit.readSkills = buildNarrationSkillReadAudit(confirmedProfileIds, input.profiles, 'confirmed_call')
    // 结论上报过程轨（旁白步可点击看理由）：决策已在 loop 内做出，这里如实回放二分类 + 理由。
    input.onOutcome?.(input.calls.length
      ? {
        willGenerate: true,
        reason: input.calls
          .map((call) => `${(call.profileNames || []).join('、') || '旁白'}（${call.informationBearing !== false ? '信息承载' : '纯描写'}）：${call.reason}`)
          .join('\n')
      }
      : { willGenerate: false, reason: '提调本轮未安排旁白。' })
    updateTidiaoDirectorStreamRoundNarrationGen(narrationDirectorRunId, 'running')
    // 信息承载旁白串行先行（用户 2026-06-21 拍板）：informationBearing 旁白排到前面，全部生成+投影落库后立即
    // resolve infoBearingSettled，调用方据此在建角色回复上下文前先 await——保证同轮角色回复能承接信息承载旁白的投影；
    // 纯描写旁白（informationBearing===false）排在后面，仍随 completion 在后台与角色回复并行，收尾统一 await。
    // informationBearing 保守默认 true（!==false 即算信息承载），与二分类标注口径一致。
    // 排序口径与群聊 narration subagent completion 段共用 orderNarrationCallsInfoBearingFirst（联动能力·改一处需同步）。
    const { ordered: orderedCalls, infoBearingCount } = orderNarrationCallsInfoBearingFirst(input.calls)
    let resolveInfoBearingSettled: () => void = () => {}
    const infoBearingSettled = new Promise<void>((resolve) => { resolveInfoBearingSettled = resolve })
    // 无信息承载旁白时立即放行，角色回复零额外延迟。
    if (infoBearingCount === 0) resolveInfoBearingSettled()
    // 段内并行（串行压缩批C1·2026-07-13）：全部条并行发起生成（callAI 并发），落库按声明序（orderedCalls 顺序=
    // info-bearing-first 排好的声明序）过保序落库链——先生成完的也要等前序槽位落库完成才允许自己落库，
    // 保证持久序（服务端 id ASC）与声明序一致。release.claim() 必须按 orderedCalls 顺序同步调用（.map 回调按数组序
    // 同步执行，早于任何 await），故这里天然保证槽位分配序=声明序。
    // 传入 externalChain 时本段不再自建链，改从外部链 claim（round_start 段并入全轮持久序）。
    const releaseChain = input.externalChain || createNarrationReleaseChain()
    let processed = 0
    const runOneOrderedCall = async (call: PersonalityNarrationCall, callIndex: number): Promise<void> => {
      const gate = releaseChain.claim()
      const advanceAndRelease = () => {
        // 兜底：无论成功/失败/跳过，都必须放行落库链下一槽位——否则一条卡死会让后继旁白全部卡在「等落库」。
        gate.done()
        processed += 1
        if (processed >= infoBearingCount) resolveInfoBearingSettled()
      }
      if (input.abortSignal?.aborted || isStopRequested(chatStore) || !isPipelineRunCurrent(input.runId)) {
        if (checkpointLifecycle) markReplySituationCheckpointFailure('本轮应生成旁白被中断，未完成落库', checkpointLifecycle)
        advanceAndRelease()
        return
      }
      const callProfileIds = Array.isArray(call.profileIds) && call.profileIds.length
        ? call.profileIds
        : [String((call as any).profileId || '')].filter(Boolean)
      const profile = input.profiles.find((item) => item.id === callProfileIds[0])
      if (!profile) {
        if (checkpointLifecycle) markReplySituationCheckpointFailure('旁白配置缺失，未能完成本轮应生成旁白', checkpointLifecycle)
        // 找不到 profile 也要推进闸门计数，否则信息承载段缺一条就永远卡住角色回复上下文。
        advanceAndRelease()
        return
      }
      // 真机五验④（2026-07-05·用户拍板）：单条旁白失败先自动重试一次（5s 缓冲）；仍失败则登记可重试单元
      //（参数快照·纠偏 retryFailedWorkflow 可重跑）并继续生成后面的旁白——一条失败不再拖死整段旁白生成。
      try {
        await runWithAutoRetry(
          () => runPersonalityNarrationCall({
            targetId: input.targetId,
            sessionId: input.sessionId,
            profile,
            call,
            messages,
            continuityMessages,
            projectionFactByMessageId: input.projectionFactByMessageId,
            insertAfterMessageId: input.insertAfterMessageId,
            // 落库前：① 等前序槽位落库完成（生成本身不受影响，仍与其它条并行发起）；② 穿插预生成场景下
            // 还要等锚点角色真实落库拿到 id（awaitAnchor resolve 真实 id 时覆盖锚点；resolve(undefined) 时
            // 沿用 insertAfterMessageId 兜底值）。两者互不依赖，并行等待。
            beforePersist: async () => {
              const [, anchorMessageId] = await Promise.all([
                gate.wait(),
                input.awaitAnchor ? input.awaitAnchor() : Promise.resolve(undefined)
              ])
              return typeof anchorMessageId === 'number' ? { insertAfterMessageId: anchorMessageId } : undefined
            },
            onMessageWritten: (messageId) => {
              if (messageId > 0 && !audit.messageIds.includes(messageId)) audit.messageIds.push(messageId)
              input.onMessageWritten?.(messageId)
            },
            abortSignal: input.abortSignal
          }),
          {
            signal: input.abortSignal,
            shouldAbort: () => isStopRequested(chatStore) || !isPipelineRunCurrent(input.runId),
            onRetry: () => console.warn(`旁白正文生成失败，5s 后自动重试一次：${profile.name}`)
          }
        )
      } catch (error) {
        narrationGenFailed = true
        if (checkpointLifecycle) markReplySituationCheckpointFailure(error, checkpointLifecycle)
        if (!(isAbortError(error) || input.abortSignal?.aborted)) {
          registerRoundRetryUnit({
            id: `narration:${profile.id}:${callIndex}`,
            kind: 'narration',
            label: `旁白生成（${profile.name}）`,
            sessionId: input.sessionId,
            anchorMessageId: activePipelineInputMessageId,
            lastError: error instanceof Error ? error.message : String(error || '生成失败'),
            attempts: 1,
            payload: { kind: 'narration', call, profileId: profile.id, insertAfterMessageId: input.insertAfterMessageId }
          })
          console.warn(`导演 loop 旁白正文生成失败（已登记可重试单元·继续后续旁白）：${profile.name}`, error)
        }
      } finally {
        // 信息承载旁白全部落库后立即放行角色回复上下文构建，不等后面的纯描写旁白（失败/成功都推进闸门）。
        advanceAndRelease()
      }
    }
    const completion = (async () => {
      try {
        await Promise.all(orderedCalls.map((call, callIndex) => runOneOrderedCall(call, callIndex)))
        if (!input.abortSignal?.aborted && audit.messageIds.length < orderedCalls.length) {
          narrationGenFailed = true
          if (checkpointLifecycle) {
            markReplySituationCheckpointFailure(
              `本轮旁白落库不完整（${audit.messageIds.length}/${orderedCalls.length}）`,
              checkpointLifecycle
            )
          }
        }
      } catch (error) {
        narrationGenFailed = true
        if (checkpointLifecycle) markReplySituationCheckpointFailure(error, checkpointLifecycle)
        if (!isAbortError(error)) console.warn('导演 loop 旁白正文生成失败:', error)
      } finally {
        // 兜底：异常也要放行，避免角色回复上下文构建永久等待。
        resolveInfoBearingSettled()
        if (!input.abortSignal?.aborted && isPipelineRunCurrent(input.runId)) {
          // 旁白镜「生成旁白」节点收口：成功→done、异常→failed，带单步耗时。
          const elapsed = ((Date.now() - narrationGenStartedAt) / 1000).toFixed(1) + 's'
          updateTidiaoDirectorStreamRoundNarrationGen(
            narrationDirectorRunId,
            narrationGenFailed ? 'failed' : 'done',
            elapsed
          )
        }
      }
      return audit
    })()
    return { completion, infoBearingSettled, audit }
  }

  // 穿插/收尾旁白 holding key：speakerCharacterId 为 null 时（round_end 段）用这个固定 key。
  const NARRATION_PREFETCH_ROUND_END_KEY = '__round_end__'

  // 穿插/收尾旁白预生成（串行压缩批C1-②·2026-07-13）：锚点角色正文生成完成的瞬间（落库前）就预起跑其名下
  // 穿插旁白的生成——把内存里刚生成、尚未落库的正文以「伪消息」形式附进旁白生成的消息快照末尾，让旁白模型
  // 提前看到该角色实际说了什么；生成产物先 holding，等锚点角色真实落库拿到 id 后由 flushRoundInterleavedNarration
  // 回填真实锚点、再按段内保序落库链落库。speakerCharacterId=null 是 round_end 段的预生成（最后一位角色正文
  // 生成完即预起跑）。同一 holding key 只预生成一次；找不到匹配旁白/没有可用 profile 时不建 holding（下次
  // flush 会按旧路径兜底）。 */
  function prefetchRoundInterleavedNarration(input: {
    targetId: string
    speakerCharacterId: string | null
    liveAssistantText: string
    liveSpeakerName: string
    fallbackInsertAfterMessageId?: number
    abortSignal?: AbortSignal
  }): void {
    const director = activeRoundDirector
    if (!director || !director.narrationInterleavedPending.length) return
    if (input.abortSignal?.aborted || isStopRequested(chatStore)) return
    const holdingKey = input.speakerCharacterId || NARRATION_PREFETCH_ROUND_END_KEY
    if (director.narrationPrefetchHolding.has(holdingKey)) return
    const { matched, rest } = partitionInterleavedNarrationCalls(director.narrationInterleavedPending, input.speakerCharacterId)
    if (!matched.length) return
    if (!input.speakerCharacterId && matched.some((call) => call.placement?.anchor === 'after_speaker')) {
      console.warn('旁白穿插：锚点角色本轮未发言（失败/未出场），其旁白改在轮末兜底预生成')
    }
    director.narrationInterleavedPending = rest
    const roundNarrationProfiles = resolvePersonalityNarrationSubagentProfiles(getChatStoreCurrentSession(chatStore) as any)
    if (!roundNarrationProfiles.length) {
      markReplySituationCheckpointFailure('旁白配置缺失，未能完成本轮应生成旁白')
      return
    }
    const baseMessages = getCurrentMessageList(chatStore) as Array<Record<string, unknown>>
    // 内存伪消息：锚点角色刚生成完、尚未落库的正文——只供旁白模型读「聊天记录」用，不进 store、不落库、无 id
    //（无 id 意味着投影 fact 查找表命中不到它，天然兜底读原文——这正是我们要的：读它当下最新的内存正文）。
    const liveMessages = input.speakerCharacterId
      ? [...baseMessages, {
        role: 'assistant',
        content: input.liveAssistantText,
        name: input.liveSpeakerName,
        memberName: input.liveSpeakerName,
        memberTargetId: input.speakerCharacterId,
        member_target_id: input.speakerCharacterId,
        speakerTargetId: input.speakerCharacterId,
        speaker_target_id: input.speakerCharacterId,
        messageKind: 'chat',
        message_kind: 'chat'
      } as Record<string, unknown>]
      : baseMessages
    let resolveAnchorPromise: (value: number | undefined) => void = () => {}
    const anchorPromise = new Promise<number | undefined>((resolve) => { resolveAnchorPromise = resolve })
    const holdingEntry = {
      completion: null as unknown as Promise<PersonalityNarrationSubagentRunAudit>,
      infoBearingSettled: null as unknown as Promise<void>,
      anchorSettled: false,
      resolveAnchor: (value: number | undefined) => {
        if (holdingEntry.anchorSettled) return
        holdingEntry.anchorSettled = true
        resolveAnchorPromise(value)
      }
    }
    const started = startDirectorNarrationCompletion({
      targetId: input.targetId,
      sessionId: activePipelineSessionId || getActiveSessionId(chatStore),
      runId: activePipelineRunId,
      speakerName: '',
      calls: matched,
      profiles: roundNarrationProfiles,
      messagesOverride: liveMessages,
      insertAfterMessageId: input.fallbackInsertAfterMessageId,
      awaitAnchor: () => anchorPromise,
      abortSignal: input.abortSignal
    })
    holdingEntry.completion = started.completion
    holdingEntry.infoBearingSettled = started.infoBearingSettled
    director.narrationPrefetchHolding.set(holdingKey, holdingEntry)
    // 无论 flush 是否命中这个 holding，都要保证轮末收束会 await 到它（未命中=角色最终失败/未出场，
    // settleRoundInterleavedNarration 会先兜底 resolve 锚点，再一起 await 收口，不丢这条预生成的旁白）。
    director.narrationInterleavedCompletions.push(started.completion.catch(() => undefined))
  }

  // 旁白穿插（2026-07-06 用户拍板「旁白不必总在开头」）：把 narrationInterleavedPending 里锚到某发言者/轮末的旁白，
  // 在锚点角色消息落库后按段生成——startDirectorNarrationCompletion 起跑时现取消息列表，旁白模型能看到该角色实际
  // 说了什么（承接言行/引入变数/人物进退场的前提）。speakerCharacterId=null 是轮末 flush：收 round_end 子集 +
  // 锚点角色最终没发言的 after_speaker 兜底（改在轮末生成·不丢提调安排的剧情内容）。
  // 信息承载闸门语义泛化：每段 flush 内部 await infoBearingSettled——下一位发言者建上下文前，前面的信息承载旁白必已落库；
  // 纯描写旁白仍随 completion 后台并行，由 settleRoundInterleavedNarration 在轮末统一收束。
  // 穿插预生成（批C1-②）：先查 narrationPrefetchHolding——命中即该段已在锚点角色正文生成完的瞬间预起跑，
  // 这里只需回填真实锚点 id、等信息承载闸门；未命中（pure_prompt 路径没有内容完成钩子、或角色生成失败导致
  // 预生成没被触发）才走旧路径现起生成，零回归兜底。
  async function flushRoundInterleavedNarration(input: {
    targetId: string
    speakerCharacterId: string | null
    insertAfterMessageId: number
    abortSignal?: AbortSignal
  }): Promise<void> {
    const director = activeRoundDirector
    if (!director) return
    if (input.abortSignal?.aborted || isStopRequested(chatStore)) return
    const holdingKey = input.speakerCharacterId || NARRATION_PREFETCH_ROUND_END_KEY
    const holding = director.narrationPrefetchHolding.get(holdingKey)
    if (holding) {
      director.narrationPrefetchHolding.delete(holdingKey)
      holding.resolveAnchor(input.insertAfterMessageId > 0 ? input.insertAfterMessageId : undefined)
      // completion 已经在 prefetch 时 push 进 narrationInterleavedCompletions；这里只需等信息承载闸门。
      await holding.infoBearingSettled
      return
    }
    if (!director.narrationInterleavedPending.length) return
    // 分段匹配是纯函数（可单测·联动能力）：speakerCharacterId 非空=该角色段；null=轮末段（round_end+兜底全收）。
    const { matched, rest } = partitionInterleavedNarrationCalls(director.narrationInterleavedPending, input.speakerCharacterId)
    if (!matched.length) return
    if (!input.speakerCharacterId && matched.some((call) => call.placement?.anchor === 'after_speaker')) {
      console.warn('旁白穿插：锚点角色本轮未发言（失败/未出场），其旁白改在轮末兜底生成')
    }
    director.narrationInterleavedPending = rest
    const roundNarrationProfiles = resolvePersonalityNarrationSubagentProfiles(getChatStoreCurrentSession(chatStore) as any)
    if (!roundNarrationProfiles.length) {
      markReplySituationCheckpointFailure('旁白配置缺失，未能完成本轮应生成旁白')
      return
    }
    const started = startDirectorNarrationCompletion({
      targetId: input.targetId,
      sessionId: activePipelineSessionId || getActiveSessionId(chatStore),
      runId: activePipelineRunId,
      speakerName: '',
      calls: matched,
      profiles: roundNarrationProfiles,
      insertAfterMessageId: input.insertAfterMessageId > 0 ? input.insertAfterMessageId : undefined,
      abortSignal: input.abortSignal
    })
    // completion 自吞错误（内部逐条重试+登记可重试单元），这里 catch 只防御性兜底、不让轮级收束 reject。
    director.narrationInterleavedCompletions.push(started.completion.catch(() => undefined))
    await started.infoBearingSettled
  }

  // 旁白穿插：轮末收束所有穿插段的生成 promise（保证本轮结束时穿插旁白与投影已落库，下一轮/回滚不踩写入中的旁白）。
  // 预生成兜底（批C1-②）：预生成的旁白若锚点角色最终没有真实落库（生成失败/整轮中断/未出场等），
  // resolveAnchor 永远不会被 flushRoundInterleavedNarration 调用——这里在等 completions 前强制兜底
  // resolve(undefined)（=落库时退回 prefetch 时的 fallbackInsertAfterMessageId），防止轮末收束死等。
  async function settleRoundInterleavedNarration(): Promise<void> {
    const director = activeRoundDirector
    if (director?.narrationPrefetchHolding.size) {
      for (const holding of director.narrationPrefetchHolding.values()) {
        holding.resolveAnchor(undefined)
      }
      director.narrationPrefetchHolding.clear()
    }
    const completions = director?.narrationInterleavedCompletions
    if (!completions?.length) return
    await Promise.all(completions.splice(0))
  }

  async function runDynamicWorldDueProgressionBeforeReply(sessionId: string) {
    if (!sessionId) return null
    return { checked: 0, progressed: 0, skipped: 0, resolved: 0, stalled: 0, items: [] }
  }


  function triggerAutoWriteAfterAssistantPersisted(input: {
    sessionId: string
    targetId: string
    assistantMessageId: number
    messageKind?: string
    speakerTargetId?: string
    embeddedProjectionText?: string
    embeddedProjectionError?: string
    embeddedProjectionRequired?: boolean
  }) {
    if (!input.sessionId || !input.targetId || !input.assistantMessageId) return
    // 旧轮末虚拟地点扫描（virtual_scene_location_scan）已退场：场景变化由投影上下文、编排器与 updateCurtainScene 处理。
    const messageKind = String(input.messageKind || '').trim()
    const speakerTargetId = String(input.speakerTargetId || input.targetId || '').trim()
    const replyMode = resolveReplyPipelineModeForTarget(speakerTargetId)
    if (messageKind === 'caps_reply' || replyMode === 'personality_model' || replyMode === 'pure_prompt') return
    const checkpointLifecycle = activeReplySituationCheckpointLifecycle
    const completion = (async () => {
      try {
        await runReplyContextProjectionForMessage({
          sessionId: input.sessionId,
          messageId: input.assistantMessageId,
          stage: 'assistant',
          embeddedProjectionText: input.embeddedProjectionText,
          embeddedProjectionError: input.embeddedProjectionError,
          embeddedProjectionRequired: input.embeddedProjectionRequired
        })
        await runProjectionWritebackForCharacter({
          sessionId: input.sessionId,
          characterId: speakerTargetId,
          runKind: 'auto',
          sourceLabel: '普通召回'
        })
      } catch (error) {
        if (checkpointLifecycle) markReplySituationCheckpointFailure(error, checkpointLifecycle)
        console.warn('普通回复投影写轨迹触发失败:', error)
        toast(`投影写轨迹触发失败：${getErrorMessage(error)}`, 'error', 8000)
      }
    })()
    registerReplySituationAssistantProjection(completion)
  }

  async function runUserNarrationCommandFromInput(targetId: string, command: UserNarrationCommand) {
    const session = getChatStoreCurrentSession(chatStore) as any
    const sessionId = getActiveSessionId(chatStore) || String(session?.id || '').trim()
    if (!sessionId || !targetId) {
      toast('当前会话还没准备好，不能写旁白', 'error')
      return
    }
    const noticeCommand = command.mode === 'agent_supplement' ? '/旁白_AGENT补充' : '/旁白'
    const noticeId = startSlashCommandNotice(runtimeStore, {
      command: noticeCommand,
      message: '正在准备旁白写入',
      step: '解析旁白命令'
    })
    const narrationPolishTaskRun = command.mode === 'agent_supplement'
      ? startNarrationPolishTaskRun({ targetId, sessionId })
      : { id: '', controller: null as AbortController | null }
    const previousStreamingSpeakerName = safeCurrentStreamingSpeakerName.value
    const previousStreamingTargetId = safeCurrentStreamingTargetId.value
    try {
      setTyping(chatStore, true)
      setCurrentMessageModel(chatStore, '')
      streamingText.value = ''
      const roleProfile = await resolveUserNarrationRoleProfileForCommand(sessionId, targetId, command)
      updateSlashCommandNotice(runtimeStore, noticeId, {
        message: command.mode === 'agent_supplement' ? '正在调用 Agent 润色旁白' : '正在写入旁白',
        step: command.mode === 'agent_supplement' ? 'Agent 润色中' : '写入旁白消息'
      })
      safeCurrentStreamingSpeakerName.value = command.mode === 'agent_supplement' || roleProfile ? '旁白润色中' : '旁白'
      safeCurrentStreamingTargetId.value = targetId
      const result = await runUserNarrationCommand({
        session: {
          ...(session || {}),
          id: sessionId,
          sessionId,
          targetId
        },
        command,
        messages: getCurrentMessageList(chatStore) as any[],
        documents: (charStore as any).documents || [],
        agentConfig: readBrainAgentConfigFromList(settingStore.agentModelConfigs),
        callAI: callAI as any,
        abortSignal: narrationPolishTaskRun.controller?.signal,
        now: new Date().toISOString(),
        roleProfile
      })
      if (narrationPolishTaskRun.id && !isChatTaskRunActive(narrationPolishTaskRun.id)) {
        throw createAbortError()
      }
      if (!result.messageId || !result.messagePayload) {
        completeSlashCommandNotice(runtimeStore, noticeId, {
          message: '旁白没有写入',
          step: '命令已结束'
        })
        toast('旁白没有写入', 'info')
        return
      }
      queuePendingPersistedMessage(chatStore, sessionId || targetId, {
        id: result.messageId,
        ...result.messagePayload,
        _targetId: targetId,
        _sessionId: sessionId
      })
      triggerAutoWriteAfterAssistantPersisted({
        sessionId,
        targetId,
        assistantMessageId: Number(result.messageId),
        embeddedProjectionText: result.embeddedProjectionText,
        embeddedProjectionError: result.embeddedProjectionError,
        embeddedProjectionRequired: result.embeddedProjectionRequired
      })
      await nextTick()
      scrollToBottom()
      completeSlashCommandNotice(runtimeStore, noticeId, {
        message: command.mode === 'agent_supplement' ? '旁白已由 Agent 润色并写入' : '旁白已写入',
        step: '写入完成'
      })
      toast(command.mode === 'agent_supplement' ? '旁白已由 Agent 润色并写入' : '旁白已写入', 'success')
    } catch (error) {
      if (isAbortError(error)) {
        updateSlashCommandNotice(runtimeStore, noticeId, {
          message: '旁白润色已停止',
          step: '命令已停止',
          status: 'info'
        })
        return
      }
      failNarrationPolishTaskRun(narrationPolishTaskRun.id, error)
      failSlashCommandNotice(runtimeStore, noticeId, {
        message: '旁白写入失败',
        step: '命令失败',
        error
      })
      toast(`旁白写入失败: ${getErrorMessage(error)}`, 'error')
    } finally {
      completeNarrationPolishTaskRun(narrationPolishTaskRun.id)
      setTyping(chatStore, false)
      setCurrentMessageModel(chatStore, '')
      streamingText.value = ''
      safeCurrentStreamingSpeakerName.value = previousStreamingSpeakerName
      safeCurrentStreamingTargetId.value = previousStreamingTargetId
    }
  }




  const NARRATION_QUICK_JUDGE_TAGS: NarrationQuickJudgeTag[] = [
    'scene_shift',
    'time_shift',
    'weather_shift',
    'new_action',
    'external_motion',
    'appearance_focus',
    'low_information',
    'stagnation'
  ]

  function parseNarrationQuickJudgeOutput(output: unknown): NarrationQuickJudgeResult {
    const raw = String(output || '').trim()
    if (!raw) {
      return { tags: [], confidence: 0, summary: '快判模型空输出', recommendedKind: 'none' }
    }
    let parsed: any = null
    try {
      const jsonText = raw.match(/\{[\s\S]*\}/)?.[0] || raw
      parsed = JSON.parse(jsonText)
    } catch {
      parsed = null
    }
    const source = parsed && typeof parsed === 'object' ? parsed : {}
    const rawTags = Array.isArray(source.tags)
      ? source.tags
      : NARRATION_QUICK_JUDGE_TAGS.filter((tag) => raw.includes(tag))
    const tags: NarrationQuickJudgeTag[] = Array.from(new Set(rawTags
      .map((tag: unknown) => String(tag || '').trim())
      .filter((tag: string): tag is NarrationQuickJudgeTag => NARRATION_QUICK_JUDGE_TAGS.includes(tag as NarrationQuickJudgeTag))))
    const confidenceValue = Number(source.confidence)
    const recommendedKind = source.recommendedKind === 'environment'
      || source.recommendedKind === 'appearance'
      || source.recommendedKind === 'event_push'
      || source.recommendedKind === 'none'
      ? source.recommendedKind
      : undefined
    return {
      tags,
      confidence: Number.isFinite(confidenceValue) ? Math.max(0, Math.min(1, confidenceValue)) : (tags.length ? 0.55 : 0),
      summary: String(source.summary || raw).slice(0, 180),
      recommendedKind
    }
  }




  const { executeGroupChat } = useGroupChatExecutor({
    getCharacters: () => resolveRuntimeCharacters(),
    buildChatMessages: async (targetId, userText, sourceMessages, speakerTargetId, options) => await buildFinalOutboundPrompt({
      buildChatMessages: buildChatMessages as any,
      targetId,
      userText,
      sourceMessages,
      speakerTargetId: speakerTargetId || targetId,
      options: options as Record<string, unknown>
    }) as Array<{ role: ChatRole; content: string }>,
    prepareSpeakerRecall: prepareAIRecall,
    resolveSpeakerRecallBypass: ({ speakerTargetId, speakerName }) => resolveRecallBypassForSpeaker({
      speakerTargetId,
      speakerName,
      inputMessageId: activePipelineInputMessageId
    }),
    refreshChatMessages: () => getCurrentMessageList(chatStore) as any[],
    getAIOptions,
    callAIStream: async (messages, options, onChunk, callbacks) => {
      return await callAIStream(messages, options, onChunk || (() => {}), callbacks)
    },
    normalizeReplyProbability,
    cleanAiPrefix,
    addMessage: async (targetId, message, options): Promise<number> => {
      const sessionId = String((message as any)?._sessionId || activePipelineSessionId || getActiveSessionId(chatStore) || '')
      const result = await chatStore.addMessage(targetId, message, { ...options, sessionId })
      return typeof result === 'number' ? result : 0
    },
    upsertLocalStreamingMessage: (messageKey, message) => {
      const targetId = String((message as any)?._targetId || '')
      const sessionId = String((message as any)?._sessionId || activePipelineSessionId || getActiveSessionId(chatStore) || '')
      if (!targetId) return
      localMessageTargets.set(messageKey, targetId)
      if (sessionId) localMessageSessions.set(messageKey, sessionId)
      upsertStreamingMessage(chatStore, sessionId || targetId, messageKey, { ...message, _sessionId: sessionId })
    },
    removeLocalStreamingMessage: (messageKey) => {
      const targetId = String(localMessageTargets.get(messageKey) || getActiveTargetId(chatStore))
      const sessionId = String(localMessageSessions.get(messageKey) || '')
      removeStreamingMessage(chatStore, sessionId || targetId, messageKey)
      localMessageTargets.delete(messageKey)
      localMessageSessions.delete(messageKey)
    },
    finalizeLocalStreamingMessage: (messageKey, message) => {
      const targetId = String((message as any)?._targetId || '')
      const sessionId = String((message as any)?._sessionId || localMessageSessions.get(messageKey) || '')
      if (!targetId) return false
      const finalized = finalizeStreamingMessage(chatStore, sessionId || targetId, messageKey, { ...message, _sessionId: sessionId })
      localMessageTargets.delete(messageKey)
      localMessageSessions.delete(messageKey)
      return finalized
    },
    appendPersistedMessage: (message) => {
      const list = getCurrentMessageList(chatStore)
      const targetId = String((message as any)?._targetId || '')
      if (!targetId || !isTargetReady(chatStore, targetId)) return
      appendPersistedMessage(list, message)
    },
    onPersistedMessageWhileTargetLoading: (targetId, _messageKey, message) => {
      queuePendingPersistedMessage(chatStore, String((message as any)?._sessionId || targetId), message)
    },
    onStreamingText: (text, speaker) => {
      streamingText.value = text
      safeCurrentStreamingSpeakerName.value = speaker?.name || ''
      safeCurrentStreamingTargetId.value = String((speaker as any)?.targetId || getActiveTargetId(chatStore) || '')
    },
    onProgress: () => {
      scrollToBottom()
    },
    onCharacterError: (char, err: unknown) => {
      toast(`${char.name} 回复失败，已停止后续角色回复: ${getErrorMessage(err)}`, 'error')
    },
    // character_location_gate 已彻底退场（2026-06-10 拍板）：不再做角色出场地点门禁。
    shouldAllowSpeaker: async () => true,
    onReplyOrderUpdated: refreshPlannedGroupSpeakers,
    onReplyWaitTick: refreshPlannedGroupSpeakers,
    shouldStop: () => Boolean(chatStore.shouldStop?.())
      || Boolean(readChatStoreValue(chatStore.runtime?.stopRequested))
      || Boolean((chatStore as any).stopRequested),
    getCurrentEnvironment: () => ({
      currentTime: settingStore.currentTime,
      currentWeather: settingStore.currentWeather,
      currentLocation: settingStore.currentLocation,
      currentSession: getChatStoreCurrentSession(chatStore)
    }),
    getTargetName,
    createPromptLog: async ({ sessionTargetId, speakerName, speakerTargetId, messages, finalPrompt, promptBlocks, recallActivity }) => {
      const sessionId = activePipelineSessionId || getActiveSessionId(chatStore)
      const result = sessionId ? await createChatPromptLogBySessionId(sessionId, {
        speakerName,
        targetId: speakerTargetId,
        finalPrompt,
        promptBlocks: promptBlocks ?? buildPromptBlocksFromPreparedMessages(messages, 'group-reply-messages')
      }) : await createChatPromptLog(sessionTargetId, {
        speakerName,
        targetId: speakerTargetId,
        finalPrompt,
        promptBlocks: promptBlocks ?? buildPromptBlocksFromPreparedMessages(messages, 'group-reply-messages')
      })
      try {
        await persistCurrentRecallActivity({
          sessionId,
          targetId: String(speakerTargetId || sessionTargetId || getActiveTargetId(chatStore) || ''),
          speakerName,
          assistantMessageId: 0,
          activity: recallActivity
        })
      } catch (error) {
        console.error('保存召回活动日志失败:', error)
      }
      return String(result.id || '')
    },
    bindPromptLogMessage: async (sessionTargetId, logId, assistantMessageId, context) => {
      const sessionId = activePipelineSessionId || getActiveSessionId(chatStore)
      if (sessionId) {
        await bindChatPromptLogMessageBySessionId(sessionId, logId, assistantMessageId)
      } else {
        await bindChatPromptLogMessage(sessionTargetId, logId, assistantMessageId)
      }
      try {
        await persistCurrentRecallActivity({
          sessionId,
          targetId: String(context?.speakerTargetId || sessionTargetId || getActiveTargetId(chatStore) || ''),
          speakerName: String(context?.speakerName || ''),
          inputMessageId: activePipelineInputMessageId,
          assistantMessageId,
          activity: context?.recallActivity || null
        })
      } catch (error) {
        console.error('保存召回活动日志失败:', error)
      }
    },
    onAssistantPersisted: async ({ targetId, assistantMessageId, messagePayload, embeddedProjectionText, embeddedProjectionError, embeddedProjectionRequired }) => {
      const sessionId = activePipelineSessionId || getActiveSessionId(chatStore)
      triggerAutoWriteAfterAssistantPersisted({
        sessionId,
        targetId,
        assistantMessageId,
        messageKind: String(messagePayload?.messageKind ?? messagePayload?.message_kind ?? ''),
        speakerTargetId: String(messagePayload?.speakerTargetId ?? messagePayload?.speaker_target_id ?? targetId),
        embeddedProjectionText,
        embeddedProjectionError,
        embeddedProjectionRequired
      })
    }
  })

  async function addUserMessage(
    target: string,
    text: string,
    attachments?: ChatImageAttachment[],
    focusedAction?: { groupId: string; visibility: FocusedActionVisibility }
  ) {
    const envSnapshot = getCurrentEnvironmentSnapshot()
    const userMessage: MessagePayload = {
      role: 'user',
      content: text,
      time: new Date().toLocaleTimeString(),
      name: currentAlias.value?.name || charStore.userProfile.name || '我',
      envDate: envSnapshot.envDate,
      envWeather: envSnapshot.envWeather,
      envLocation: envSnapshot.envLocation,
      ...(focusedAction ? {
        messageSourceKind: FOCUSED_ACTION_SOURCE_KIND,
        message_source_kind: FOCUSED_ACTION_SOURCE_KIND,
        focusedActionGroupId: focusedAction.groupId,
        focused_action_group_id: focusedAction.groupId,
        focusedActionVisibility: focusedAction.visibility,
        focused_action_visibility: focusedAction.visibility
      } : {}),
      ...(attachments && attachments.length ? { attachments } : {})
    }
    const persistedId = await chatStore.addMessage(target, userMessage, { sessionId: getActiveSessionId(chatStore) })
    await nextTick()
    scrollToBottom()
    return typeof persistedId === 'number' ? persistedId : 0
  }

  async function runSingleChat(
    target: string,
    text: string,
    runId: number,
    taskRunId = '',
    abortSignal?: AbortSignal,
    options: {
      speakerTargetId?: string
      localInsertAfterMessageId?: number
      excludedMessageIds?: number[]
      /** 用户消息投影后台 promise（提速）：传给回复工作流实现召回 ∥ 投影并行；未传视为已完成。 */
      userProjectionPromise?: Promise<void> | null
      /** 软停挂起时回灌 pendingCorrection 用的父尝试 id（重生成链路传入）。 */
      correctionParentAttemptId?: string
      /** 2026-07-06 纠偏生成新角色消息：本条消息的导演方向覆盖（纠偏轮 activeRoundDirector 已复位，
       *  方向由纠偏 loop 的 addCastDirection 直接传入；缺省=照旧读 activeRoundDirector）。 */
      directorDirection?: string
      /** 单计划直通：跳过候选计划与评审，但仍走正式角色上下文和落库链。 */
      directPlan?: string
      /** 稳定续话的简短正文边界：不调用提调规划模型，直接作为 directPlan 交给正文链。 */
      fastReplyPlanningHint?: string
      /** 稳定续话直通：跳过整轮提调、写作计划和评审，正文模型按最近历史与必要人格资料自然回复。 */
      fastReply?: boolean
      /** 稳定续话不生成旁白，也不重复运行轮后提调；用户与角色消息仍各自投影。 */
      suppressNarration?: boolean
      /** 穿插旁白预生成（串行压缩批C1-②·2026-07-13）：角色正文生成完成的瞬间（落库前）触发——调用方据此
       *  预起跑该角色名下穿插旁白（及群聊最后一位/单聊时一并预起跑 round_end 段）。不落库、不影响本条消息
       *  持久化；缺省=不触发（现状逐字不变）。 */
      onAssistantContentComposed?: (input: { text: string }) => void
      /** 串行压缩批C2（2026-07-13）：并行群聊下每个 speaker 各自的生成尝试 id——模块级 activeGenerationAttemptId
       *  在并行下会被后发起的 speaker 覆盖（串台），传了就只读这个局部值；不传=回退读全局（单聊/纠偏/重生成等旧调用点零回归）。 */
      generationAttemptId?: string
      /** 全轮落库顺序门控（串行压缩批C2）：生成完成、落库（chatStore.addMessage）前的等待钩子——并行群聊据此接
       *  全轮保序落库链，返回值可覆盖显示锚点（对齐 C1 narrationChatWrite.ts insertAfterMessageIdOverride 范式）。
       *  不传=零行为变化（生成完立即落库）。 */
      beforePersist?: () => Promise<{ insertAfterMessageId?: number } | void>
      /** 串行压缩批C2：消息真实落库（addMessage 成功+finalize）后立即回调，供并行群聊在此记录锚点 id、
       *  释放全轮落库顺序门控的下一槽位、并触发该角色名下穿插旁白 flush。不传=不触发（现状逐字不变）。 */
      onAssistantPersisted?: (persistedMessageId: number) => void
      /** 全局流式态抑制（串行压缩批C2）：true 时不写全局 streamingText/safeCurrentStreamingSpeakerName/
       *  safeCurrentStreamingTargetId/currentStreamingTargetId（并行群聊下非首位 speaker 用，防止相互覆盖全局
       *  「正在输入」态）；本 speaker 专属的 keyed 占位消息内容更新不受影响（仍随 chunk 实时可见）。缺省=不抑制。 */
      suppressGlobalStreaming?: boolean
      /** 前序预告块（串行压缩批C2）：并行发起时后序角色看不到前序真实回复，注入前序角色的方向+计划当预告
       *  （幕后剧本代偿·用户拍板②）。缺省=不注入（现状逐字不变，串行/单聊路径后序本就能看到真实回复）。 */
      priorCastPreview?: string
    } = {}
  ): Promise<SingleChatRunResult> {
    assertPipelineCanContinue(runId, taskRunId)
    const speakerTargetId = String(options.speakerTargetId || target || '').trim()
    const speakerName = getTargetName(speakerTargetId) || getTargetName(target)
    // 串行压缩批C2：局部捕获生成尝试 id——并行群聊下模块级 activeGenerationAttemptId 会被后发起的 speaker
    // 持续覆盖，本函数收尾阶段（finishGenerationAttempt/trace 落库等）一律读这个局部快照，不读会串台的全局。
    const generationAttemptId = options.generationAttemptId || activeGenerationAttemptId
    setTyping(chatStore, true)
    setCurrentMessageModel(chatStore, '')
    // 全局流式态抑制（串行压缩批C2）：并行群聊下非首位 speaker 传 suppressGlobalStreaming——不写这三个全局
    // 「正在输入」态（防止多个 speaker 互相覆盖显示），本 speaker 专属的 keyed 占位消息仍随 chunk 正常更新。
    if (!options.suppressGlobalStreaming) {
      streamingText.value = ''
      safeCurrentStreamingSpeakerName.value = speakerName
      // 这里记录的是消息流所属会话目标，不是发言角色。群聊若写 characterId，
      // ChatMessageStream 会与当前 group target 判成跨会话，从而隐藏头像与三点占位。
      safeCurrentStreamingTargetId.value = target
    }
    safePlannedGroupSpeakers.value = []
    const sessionId = getActiveSessionId(chatStore)
    let roleAgentContextBlock = ''
    let roleAgentContextBundle: AgentContextBundle | null = null
    const inputMessageId = activePipelineInputMessageId
    // 单聊群聊已在导演层统一（阶段U·2026-06-28 + 批次C·2026-06-30 收口）：轮级导演只有一套 groupDirectorHarness
    //   (decideRoundDirector)，单聊=N=1 群聊；首发送/重新生成都走演员模式吃 decideRoundDirector 下发的情境，
    //   旧单聊专属 directorStream:true 自当导演路已退役删除。
    // 串行压缩批C2：key 加 speakerTargetId 区分 + 自增序号兜底，防并行同毫秒撞 key。
    const localMessageKey = `single-stream-${target}-${speakerTargetId || ''}-${++singleChatLocalMessageKeySeq}`
    const localInsertAfterMessageId = Number(options.localInsertAfterMessageId || 0) || undefined
    // 方案 B：本轮统筹剧本给这个发言者的回复方向，真注入它的 prompt（编排+正文都会带），不改写已存用户消息。
    // 2026-07-06：纠偏 castSeam 传 options.directorDirection 直给方向（纠偏轮 activeRoundDirector 已复位，读不到）。
    const directorDirection = String(options.directorDirection || activeRoundDirector?.castDirections.get(speakerTargetId || target) || '').trim()
    const directorNote = directorDirection ? `\n\n【本轮导演安排】${directorDirection}` : ''
    // 前序预告块（串行压缩批C2·2026-07-13）：并行发起下后序角色看不到前序真实回复，注入前序角色的
    // 方向+计划当预告（幕后剧本方式代偿·用户拍板②）；不传=不注入（串行/单聊路径后序本就能看到真实回复）。
    const priorCastPreviewText = String(options.priorCastPreview || '').trim()
    const priorCastPreviewNote = priorCastPreviewText
      ? `\n\n【本轮先于你发言的角色安排（预告·他们的实际发言你还看不到，按此衔接）】\n${priorCastPreviewText}`
      : ''
    const effectivePromptText = `${text}${directorNote}${priorCastPreviewNote}`
    // 批B·人格模型直通道（2026-07-13）：提调若判本轮该角色 planMode=direct 会同轮直写 plan，读出交给
    // buildReplyWorkflowFinalContext 走单计划管道；options.directorDirection 覆盖（纠偏轮）时不读 castPlans——
    // 纠偏轮不开直通道，走现状全链路。
    let directPlan = options.directorDirection
      ? ''
      : String(options.directPlan || activeRoundDirector?.castPlans?.get(speakerTargetId || target)?.plan || '').trim()

    // 回复过程轨（ReplyWorkflow 通用）：生成投影/读取投影后，召回与判情境并行，再生成计划（人格模型多计划+评审，普通召回单计划）/组织回复。
    // 状态实时写到本地流式占位消息的 _processTrace 上，由 ChatMessageStream 渲染折叠过程栏；mode 决定工作流轴步骤清单。
    const processTraceState: { steps: Record<string, string>; failed: boolean; startedAt: number; elapsed: string; mode: string; narration: ReplyWorkflowNarrationOutcome | null; reviewDegrade: { reason: string } | null; stepStartedAt: Record<string, number>; stepElapsed: Record<string, string>; thoughts: string[]; directorStream: TidiaoDirectorStream | null; appendLog: AppendLogEvent[]; directorPrompt: string } = {
      steps: {},
      failed: false,
      startedAt: Date.now(),
      elapsed: '',
      mode: 'personality_model',
      narration: null,
      // 评审降级结论（用户拍板）：本地 ReRanker 跑不动时按候选顺序降级出回复，过程轨在评审步标注降级原因
      reviewDegrade: null,
      // 每步耗时打点（提速验收口径）：running 记起点，done/failed 记耗时；随 processSummary 持久化
      stepStartedAt: {},
      stepElapsed: {},
      // 实时旁述（D5）：提调每轮 thought 顺序累积，随 _processTrace 实时推、随 processSummary 持久化
      thoughts: [],
      // O-B：单聊真·导演 loop 落库的轮级快照（决策流+实时分镜）；落库前捕获活动轮最终快照，随 processSummary 持久化、刷新后历史复原走新带。
      directorStream: null,
      // R3-2b：append log 保真事件快照，与 directorStream 平价同行进助手消息 _processTrace，供未刷新重生成续跑 seed。
      appendLog: [],
      // 批次K1（2026-07-02 用户真机「刷新后 state 退化台账」）：真实 prompt 也随成员 trace 落库——
      // 读侧择优可能选中成员 trace（决策更多），旧路成员 trace 无 prompt → 查看器退化台账。三处同源（stream/appendLog/prompt）。
      directorPrompt: ''
    }
    let processTraceActive = false
    let processTraceClosed = false
    const buildProcessTraceViewSnapshot = () => ({
      steps: { ...processTraceState.steps },
      failed: processTraceState.failed,
      elapsed: processTraceState.elapsed,
      mode: processTraceState.mode,
      narration: processTraceState.narration,
      reviewDegrade: processTraceState.reviewDegrade,
      stepElapsed: { ...processTraceState.stepElapsed },
      thoughts: [...processTraceState.thoughts],
      directorStream: processTraceState.directorStream,
      appendLog: processTraceState.appendLog
    })
    const pushProcessTraceSnapshot = () => {
      upsertStreamingMessage(chatStore, sessionId || target, localMessageKey, {
        role: 'assistant',
        name: speakerName,
        memberName: speakerName,
        speakerTargetId: speakerTargetId || undefined,
        speaker_target_id: speakerTargetId || undefined,
        _targetId: target,
        _sessionId: sessionId,
        _localInsertAfterMessageId: localInsertAfterMessageId,
        _processTrace: buildProcessTraceViewSnapshot()
      })
    }
    const emitProcessStep = (
      stepId: 'projection' | 'context' | 'recall' | 'scenario' | 'plan' | 'review' | 'compose',
      status: 'waiting' | 'running' | 'done' | 'failed' | 'retry'
    ) => {
      if (!processTraceActive || processTraceClosed) return
      // 旁白独立分镜工作流（2026-06-30·批次C 收口）：旁白正文生成进度已挪到 directorStream 旁白镜的「生成旁白」节点，
      // 不再进角色过程轨；旧 onStep('narration') 发送方（startPersonalityNarrationSubagentAfterScenario）已随单聊残留退役删除。
      const now = Date.now()
      const nextSteps = { ...processTraceState.steps, [stepId]: status }
      processTraceState.steps = nextSteps
      // 每步耗时：running 只记首次起点（重试不清零），done/failed 收口一次
      if ((status === 'running' || status === 'retry') && processTraceState.stepStartedAt[stepId] === undefined) {
        processTraceState.stepStartedAt[stepId] = now
      }
      if (status === 'done' || status === 'failed') {
        markProcessStepElapsed(stepId, now)
      }
      if (status === 'failed') processTraceState.failed = true
      if (stepId === 'compose' && status === 'done') {
        processTraceState.elapsed = ((Date.now() - processTraceState.startedAt) / 1000).toFixed(1) + 's'
      }
      pushProcessTraceSnapshot()
      if (stepId === 'compose' && status === 'done') {
        processTraceClosed = true
      }
    }
    // 实时旁述（D5）：提调每轮 thought 顺序累积，即刻推快照让编排带展开态逐句呈现；去重相邻重复、限长防碎碎念。
    const emitProcessThought = (thought: string) => {
      if (!processTraceActive || processTraceClosed) return
      const text = String(thought || '').trim()
      if (!text) return
      if (processTraceState.thoughts[processTraceState.thoughts.length - 1] === text) return
      processTraceState.thoughts = [...processTraceState.thoughts, text].slice(-12)
      pushProcessTraceSnapshot()
    }
    // 每步耗时收口：没有 running 起点的步骤（如瞬时 done）不记耗时；只记第一次收口值
    const markProcessStepElapsed = (stepId: string, now: number) => {
      const startedAt = processTraceState.stepStartedAt[stepId]
      if (startedAt === undefined || processTraceState.stepElapsed[stepId]) return
      processTraceState.stepElapsed[stepId] = ((now - startedAt) / 1000).toFixed(1) + 's'
    }
    // 旁白陪跑结论：决策一出即写入过程轨（旁白步点击可看理由），随 processSummary 持久化。
    const emitNarrationOutcome = (outcome: ReplyWorkflowNarrationOutcome) => {
      processTraceState.narration = outcome
      if (!processTraceActive || processTraceClosed) return
      pushProcessTraceSnapshot()
    }
    // 评审降级结论：本地 ReRanker 跑不动时写入过程轨（评审步点击可看原因），随 processSummary 持久化。
    const emitReviewDegrade = (reason: string) => {
      processTraceState.reviewDegrade = { reason: String(reason || '').trim() || '本地 ReRanker 评审未能运行' }
      if (!processTraceActive || processTraceClosed) return
      pushProcessTraceSnapshot()
    }
    // 子批3：导演 loop 每步整份快照实时驱动轮级流式载体（决策流 + 并排实时分镜）；按 runId 去抖，
    // 防迟到快照覆盖新轮。begin 在编排起步前调用（loop 未起占位），收束/失败相位由 harness 累加器写入快照。
    const failSingleChatAttempt = async (error: unknown, outputPromptLogId = '') => {
      if (generationAttemptId && sessionId) {
        await finishGenerationAttempt({
          attemptId: generationAttemptId,
          sessionId,
          status: 'failed',
          outputPromptLogId,
          error
        })
      }
      failNormalMessageTaskRun(taskRunId, error)
    }

    let personalityModelReplyStarted = false
    let personalityTracePayload: Record<string, unknown> | null = null
    const readCompletedExecutionStages = () => Object.entries(processTraceState.steps)
      .filter(([, status]) => status === 'done')
      .map(([stepId]) => stepId)
    const inferExecutionFailureStage = (fallback = 'reply_workflow') => {
      const failed = Object.entries(processTraceState.steps)
        .reverse()
        .find(([, status]) => status === 'failed' || status === 'running' || status === 'retry')
      return failed?.[0] || fallback
    }
    const persistReplyExecutionFailureReceipt = async (
      error: unknown,
      outputPromptLogId = '',
      failureMessageId = 0,
      failureStage = ''
    ) => {
      if (!generationAttemptId || !sessionId) return
      const isPurePromptReply = shouldUsePurePromptReply()
      const isPersonalityModelReply = !isPurePromptReply && shouldUsePersonalityModelReply(speakerTargetId || target)
      const turnExecutionContext = chatTurnRunner.getContext()
      const receipt = buildReplyExecutionReceipt({
        state: 'failed',
        roundProfile: turnExecutionContext?.replyExecutionProfile,
        routeDecision: turnExecutionContext?.replyOrchestrationDecision,
        defaultRoute: options.fastReply ? 'reuse' : 'orchestrate',
        actualHasPersonalityModel: isPersonalityModelReply,
        purePrompt: isPurePromptReply,
        focusedAction: false,
        messageId: failureMessageId,
        promptLogId: outputPromptLogId,
        completedStages: readCompletedExecutionStages(),
        failureStage: failureStage || inferExecutionFailureStage(),
        error
      })
      await createChatGenerationAttemptArtifactBySessionId(sessionId, {
        attemptId: generationAttemptId,
        artifactKind: 'reply_execution_receipt',
        ...(receipt.messageId > 0 ? { messageId: receipt.messageId } : {}),
        promptLogId: receipt.promptLogId,
        payload: {
          ...receipt.replyExecutionAudit,
          executionReceipt: receipt
        }
      }).catch((artifactError) => console.error('保存回复失败执行回执失败:', artifactError))
    }
    const persistPersonalityModelFailureTrace = async (
      error: unknown,
      outputPromptLogId = '',
      failureMessageId = 0,
      failureStage = ''
    ) => {
      if (!personalityModelReplyStarted || !generationAttemptId || !sessionId) return
      const basePayload = personalityTracePayload && typeof personalityTracePayload === 'object'
        ? { ...personalityTracePayload }
        : {}
      const currentOrchestration = basePayload.orchestration
        && typeof basePayload.orchestration === 'object'
        && !Array.isArray(basePayload.orchestration)
        ? basePayload.orchestration as Record<string, unknown>
        : {}
      const reason = getErrorMessage(error)
      const resolvedFailureStage = failureStage || inferExecutionFailureStage('personality_model_reply')
      const completedStages = readCompletedExecutionStages()
      const turnExecutionContext = chatTurnRunner.getContext()
      const executionAudit = buildReplyExecutionAudit({
        roundProfile: turnExecutionContext?.replyExecutionProfile,
        routeDecision: turnExecutionContext?.replyOrchestrationDecision,
        defaultRoute: options.fastReply ? 'reuse' : 'orchestrate',
        actualHasPersonalityModel: true,
        purePrompt: false,
        focusedAction: false
      })
      await createChatGenerationAttemptArtifactBySessionId(sessionId, {
        attemptId: generationAttemptId,
        artifactKind: 'personality_model_trace',
        ...(failureMessageId > 0 ? { messageId: failureMessageId } : {}),
        promptLogId: outputPromptLogId,
        payload: {
          ...basePayload,
          ...executionAudit,
          speakerTargetId: String(basePayload.speakerTargetId || speakerTargetId || target),
          speakerName,
          state: 'failed',
          promptLogId: outputPromptLogId || String(basePayload.promptLogId || ''),
          orchestration: {
            ...currentOrchestration,
            state: 'failed',
            scenario: String(currentOrchestration.scenario || 'unknown'),
            strategyMatrix: Array.isArray(currentOrchestration.strategyMatrix) ? currentOrchestration.strategyMatrix : [],
            toolCalls: Array.isArray(currentOrchestration.toolCalls) ? currentOrchestration.toolCalls : [],
            orchestrationSummary: String(currentOrchestration.orchestrationSummary || '人格模型回复链路在最终回复前中断。'),
            failure: {
              stage: resolvedFailureStage,
              reason,
              detail: reason,
              impact: failureMessageId > 0
                ? '最终角色模型调用失败；已保存一条可重试失败消息，正式角色正文未生成。'
                : '最终回复未生成，聊天消息未写入。',
              ...(failureMessageId > 0 ? { failureMessageId } : {}),
              chain: completedStages
            }
          }
        }
      }).catch((artifactError) => console.error('保存人格模型失败 trace 失败:', artifactError))
    }

    let persistedSuccessResult: SingleChatRunResult | null = null
    // 停止=中断保留（2026-07-08 用户拍板）：流式已显示的半截可见正文快照（chunk 回调实时更新·与 UI 所见一致），
    // abort 时据此把半截消息原样落库保留；try 外声明，catch 可达（fullReply/usedModel 声明在 try 内不可用）。
    let interruptedVisibleReply = ''
    let interruptedModel = ''
    // 批次5c：本轮已落库旁白 messageId（try 外声明，abort/取消 catch 可达）；
    // 旁白支线收束 promise——回滚前先等它 settle，避免漏删 abort 瞬间正在落库的旁白。
    const runNarrationMessageIds: number[] = []
    let runNarrationCompletion: Promise<unknown> | null = null
    // 中断/取消/失败时删本轮半成品旁白（DB + 本地）：先等旁白支线收束，再逐条删，清空累积器幂等。
    const discardRunNarrationMessages = async () => {
      const ids = runNarrationMessageIds.splice(0)
      if (!ids.length) return
      await rollbackPersistedNarrationMessages(
        ids,
        typeof chatStore.deleteMessage === 'function' ? (id) => chatStore.deleteMessage!(target, id) : undefined,
        runNarrationCompletion
      )
    }
    try {
      const roleAgentContext = await loadRenderedAgentContext({
        agentKind: 'role_reply',
        sessionId,
        characterId: speakerTargetId || target,
        anchorMessageId: activePipelineInputMessageId || undefined,
        userText: text
      })
      roleAgentContextBlock = roleAgentContext.text
      roleAgentContextBundle = roleAgentContext.bundle
      if (options.fastReply) {
        directPlan = String(
          options.fastReplyPlanningHint
          || directPlan
          || `以${speakerName}的身份自然承接当前对话，只使用该角色明确知道或现场可观察的信息。`
        ).trim()
      }
      const isPurePromptReply = shouldUsePurePromptReply()
      const isPersonalityModelReply = !isPurePromptReply && shouldUsePersonalityModelReply(speakerTargetId || target)
      // ReplyWorkflow 统一编排：pure_prompt 之外的两种回复模式（personality_model / normal_recall）
      // 共用同一工作流，差异由 ReplyWorkflowProfile 表达（单计划/评审/占比/ONNX 门禁）。
      const isReplyWorkflowReply = !isPurePromptReply
      const replyWorkflowMode: ReplyWorkflowMode = isPersonalityModelReply ? 'personality_model' : 'normal_recall'
      personalityModelReplyStarted = isPersonalityModelReply
      const recallBypass = resolveRecallBypassForSpeaker({
        speakerTargetId: speakerTargetId || target,
        speakerName,
        inputMessageId
      })
      let personalityContext: PersonalityModelContextBundle | null = null
      let finalPromptBlocksOverride: ChatPromptLogBlock[] | null = null
      let messages = [{ role: 'user' as const, content: effectivePromptText }] as Array<{ role: ChatRole; content: string }>
      // 旁白激进版：正文支线收尾 promise；最终回复与它并行，本轮成功收尾前 await 保证旁白落库
      let replyWorkflowNarrationCompletion: Promise<PersonalityNarrationSubagentRunAudit> | null = null
      // 批次4：本轮投影事实，回复收尾后台触发滚动会话记忆压缩用。
      let replyWorkflowProjectionItems: unknown = null
      if (isReplyWorkflowReply) {
        processTraceActive = true
        processTraceState.mode = replyWorkflowMode
        processTraceState.startedAt = Date.now()
        // 把本轮导演决策流种到群聊一轮第一条发言者的过程轨上（只种一次），
        // 编排带一轮一条据此展示，且在正文流式之前就可见（先说后做）。
        if (activeRoundDirector && !activeRoundDirector.seeded) {
          activeRoundDirector.seeded = true
          // E2：群聊导演已产实时决策流 → 种 directorStream（历史复原走新带 TidiaoDirectorStreamBand，与单聊一致，
          // 取料统一进决策流 tool 工具条）。无快照（pass 失败/空兜底）时只是不出编排带、正文照常——删旧带后的既定行为。
          if (activeRoundDirector.directorStream) {
            processTraceState.directorStream = activeRoundDirector.directorStream
            // R3-2b：群聊导演 loop 的 append log 保真事件与 directorStream 同处种进首成员 trace（内存一致，与单聊对齐）。
            processTraceState.appendLog = captureAppendLogSnapshot(activePipelineTidiaoRunId)
            // 批次K1：真实 prompt 三件套同源同行——成员 trace 也带 prompt，读侧择优选中成员时查看器不再退化台账。
            processTraceState.directorPrompt = getActiveDirectorPrompt(activePipelineTidiaoRunId)
            pushProcessTraceSnapshot()
          }
        }
        const result = await buildReplyWorkflowFinalContext({
          mode: replyWorkflowMode,
          targetId: target,
          speakerTargetId: speakerTargetId || target,
          speakerName,
          userText: effectivePromptText,
          taskRunId,
          abortSignal,
          recallBypass,
          excludedMessageIds: options.excludedMessageIds,
          userProjectionPromise: options.userProjectionPromise || null,
          suppressNarration: options.suppressNarration,
          // F2 分镜吃提调情境：轮级导演 decideRoundDirector 判好情境（scenarioCode+body）时下发给分镜，跳过各自判情境。
          // 单聊（N=1）/群聊首发送/重新生成都先走 decideRoundDirector → activeRoundDirector 非空即下发；
          // 导演降级/失败时 activeRoundDirector 为空、不下发 → 分镜回退自判情境。
          providedScenario: (activeRoundDirector?.script?.scenarioCode
            && activeRoundDirector?.script?.scenarioBody)
            ? { code: activeRoundDirector.script.scenarioCode, body: activeRoundDirector.script.scenarioBody }
            : null,
          // 批次4-投影 B：提调下发的投影态上下文（directorProjectionContext ON 且提调成功产出时非空），
          // 分镜据它替代独立「判情境上下文」fetch 的 compressedContext；缺省走原 compressedContext，零回归。
          downstreamProjectionContext: activeRoundDirector?.downstreamProjectionContext,
          // 直通道：非空即跳过编排轮与模型候选生成；人格 profile 仍保留低成本直通策略评分。
          ...(directPlan ? {
            directPlan
          } : {}),
          onStep: emitProcessStep,
          onThought: emitProcessThought,
          onNarrationOutcome: emitNarrationOutcome,
          onReviewDegraded: emitReviewDegrade,
          // 批次5c：本轮旁白落库 id 同步到 runSingleChat 作用域，供中断/取消回滚删除。
          onNarrationMessageWritten: (messageId) => {
            if (messageId > 0 && !runNarrationMessageIds.includes(messageId)) runNarrationMessageIds.push(messageId)
          }
        })
        replyWorkflowNarrationCompletion = result.narrationCompletion || null
        runNarrationCompletion = replyWorkflowNarrationCompletion
        replyWorkflowProjectionItems = result.projectionItems || null
        personalityContext = result.context
        personalityTracePayload = {
          speakerTargetId: speakerTargetId || target,
          speakerName,
          characterIdentity: result.characterIdentity,
          compressedContext: personalityContext.compressedContext,
          projectionContextText: personalityContext.projectionContextText,
          recallContextText: personalityContext.recallContextText,
          rerankerDiagnostics: result.rerankerDiagnostics,
          orchestration: result.orchestration,
          candidatePlans: result.candidatePlans,
          topPlans: result.topPlans,
          expressionMix: result.expressionMix,
          wordCountAdvice: result.wordCountAdvice,
          scenarioMountedPromptText: result.scenarioMountedPromptText,
          curtainSceneUpdate: result.curtainSceneUpdate || null
        }
        const promptLibraryAssembly = await buildPersonalityPromptLibrarySystemAssembly({
          targetId: target,
          speakerTargetId: speakerTargetId || target,
          taskRunId,
          userIdentityChangeNotice: recallBypass.userIdentityChangeNotice,
          scenarioMountedPromptText: result.scenarioMountedPromptText
        })
        const promptLibrarySystemPrompt = promptLibraryAssembly.systemPrompt
        if (promptLibrarySystemPrompt) {
          personalityTracePayload.promptLibrarySystemPrompt = promptLibrarySystemPrompt
        }
        if (promptLibraryAssembly.assembly.trace.sourceCount) {
          personalityTracePayload.promptLibraryAssemblyTrace = promptLibraryAssembly.assembly.trace
        }
        messages = await buildFinalOutboundPrompt({
          buildChatMessages: buildChatMessages as any,
          targetId: target,
          userText: text,
          sourceMessages: [],
          speakerTargetId: speakerTargetId || target,
          options: {
            personalityModelContext: {
              characterId: speakerTargetId || target,
              characterName: speakerName,
              characterIdentity: result.characterIdentity,
              promptLibrarySystemPrompt,
              // #6 稳健兜底：把真实挂载文本传进来，buildPersonalityFinalPrompt 内做去重——
              // 占位预设已吸收就不重复注入，占位缺失/未启用就直接注入，保证「配了挂载提示词必注入」。
              scenarioMountedPromptText: result.scenarioMountedPromptText,
              currentUserInput: text,
              // 快速回复使用角色视角精简投影，避免把完整 Agent 审计块再次塞入正文提示词；
              // 普通链路继续使用人格上下文压缩结果。
              compressedContext: options.fastReply && roleAgentContextBundle
                ? renderRoleReplyContext(roleAgentContextBundle)
                : personalityContext.compressedContext,
              topPlans: result.topPlans,
              expressionMix: result.expressionMix,
              wordCountAdvice: result.wordCountAdvice
            },
            taskRunId,
            abortSignal
          }
        }) as Array<{ role: ChatRole; content: string }>
      } else {
        // 纯净回复仍必须服从角色知情边界：历史只从上方 role_reply 统一投影进入，
        // 不能把前端会话原文列表直送模型，否则会绕过逐角色的 projection_visibility。
        // 本轮 clean 用户输入由 purePrompt 分支单独加入；不召回、不进入回复工作流。
        messages = await buildFinalOutboundPrompt({
          buildChatMessages: buildChatMessages as any,
          targetId: target,
          userText: text,
          sourceMessages: [],
          speakerTargetId: speakerTargetId || target,
          options: {
            skipPrepareRecall: true,
            forceEmptyRecall: true,
            forceEmptyRoleProfile: false,
            suppressCurrentUserInputTemplate: true,
            purePrompt: true,
            userIdentityChangeNotice: recallBypass.userIdentityChangeNotice,
            taskRunId,
            abortSignal
          }
        }) as Array<{ role: ChatRole; content: string }>
      }
      if (!options.fastReply) {
        const roleContextSection = `【统一原始可见上下文｜角色视角】\n${roleAgentContextBlock}`
        if (messages[0]?.role === 'system') {
          messages[0] = { ...messages[0], content: `${messages[0].content}\n\n${roleContextSection}` }
        } else {
          messages.unshift({ role: 'system', content: roleContextSection })
        }
      }
      assertPipelineCanContinue(runId, taskRunId)
      let fullReply = ''
      let usedModel = ''
      const envSnapshot = getCurrentEnvironmentSnapshot()
      const baseLocalMessage = {
        role: 'assistant',
        content: '',
        messageKind: 'chat',
        message_kind: 'chat',
        time: new Date().toLocaleTimeString(),
        name: speakerName,
        memberName: speakerName,
        memberTargetId: speakerTargetId || undefined,
        member_target_id: speakerTargetId || undefined,
        speakerTargetId: speakerTargetId || undefined,
        speaker_target_id: speakerTargetId || undefined,
        envDate: envSnapshot.envDate,
        envWeather: envSnapshot.envWeather,
        envLocation: envSnapshot.envLocation,
        model: '',
        _localInsertAfterMessageId: localInsertAfterMessageId,
        _targetId: target,
        _sessionId: sessionId
      }
      localMessageTargets.set(localMessageKey, target)
      if (sessionId) localMessageSessions.set(localMessageKey, sessionId)
      upsertStreamingMessage(chatStore, sessionId || target, localMessageKey, baseLocalMessage)
      emitProcessStep('compose', 'running')
      const callFinalRoleModel = async () => await callAIStream(
          messages,
          {
            ...getAIOptions(speakerTargetId || target),
            signal: abortSignal,
            usageLabel: `角色发言：${speakerName}`,
            placeLabel: `会话：${getTargetName(target)}`,
            placeType: target === speakerTargetId ? 'single' : 'group',
            // 通道A·当轮原生图（批4）：单聊+群聊角色正文共用这一处最终模型调用，本轮附件非空才带（identity 覆盖：
            // 重放/纠偏/精修等路径 activePipelineUserAttachments 已在各自入口清零，不会误带上一轮的图）。
            ...(activePipelineUserAttachments.length ? { currentAttachments: activePipelineUserAttachments } : {}),
            onPromptPrepared: async ({ messages: preparedMessages, finalPrompt, promptBlocks }) => {
              try {
                const result = sessionId ? await createChatPromptLogBySessionId(sessionId, {
                  speakerName,
                  targetId: speakerTargetId || target,
                  finalPrompt,
                  promptBlocks: finalPromptBlocksOverride ?? promptBlocks ?? buildPromptBlocksFromPreparedMessages(preparedMessages, 'final-role-reply-messages')
                }) : await createChatPromptLog(target, {
                  speakerName,
                  targetId: speakerTargetId || target,
                  finalPrompt,
                  promptBlocks: finalPromptBlocksOverride ?? promptBlocks ?? buildPromptBlocksFromPreparedMessages(preparedMessages, 'final-role-reply-messages')
                })
                localMessageTargets.set(`${localMessageKey}:prompt-log`, String(result.id || ''))
                if (!isPurePromptReply) {
                  try {
                    await persistCurrentRecallActivity({
                      sessionId,
                      targetId: speakerTargetId || target,
                      speakerName,
                      inputMessageId,
                      assistantMessageId: 0
                    })
                  } catch (error) {
                    console.error('保存召回活动日志失败:', error)
                  }
                }
              } catch (error) {
                console.error('记录提示词日志失败:', error)
              }
            }
          },
          (chunk: string) => {
            if (!isPipelineRunCurrent(runId, taskRunId) || isStopRequested(chatStore)) return
            fullReply += chunk
            const visibleStreamingReply = isPurePromptReply ? fullReply : getVisibleTextFromEmbeddedProjectionOutput(fullReply)
            // 停止=中断保留：同步半截可见正文快照到 catch 可达变量（chunk 自带停止闸——停止后不再累积，快照即 UI 所见）。
            interruptedVisibleReply = visibleStreamingReply
            interruptedModel = usedModel
            // 全局流式态抑制（批C2）：非首位 speaker 不写全局 streamingText/currentStreamingTargetId——
            // keyed 占位消息（下方 upsertStreamingMessage）本就随 chunk 更新 content，不受影响、天然可见。
            if (!options.suppressGlobalStreaming) {
              streamingText.value = visibleStreamingReply
              currentStreamingTargetId.value = target
            }
            upsertStreamingMessage(chatStore, sessionId || target, localMessageKey, {
              ...baseLocalMessage,
              content: visibleStreamingReply,
              time: new Date().toLocaleTimeString(),
              model: usedModel
            })
            scrollToBottom()
          },
          {
            onModelInfo: (model: string) => {
              if (!isPipelineRunCurrent(runId, taskRunId) || isStopRequested(chatStore)) return
              usedModel = model
              interruptedModel = model
              setCurrentMessageModel(chatStore, model)
              const visibleStreamingReply = isPurePromptReply ? fullReply : getVisibleTextFromEmbeddedProjectionOutput(fullReply)
              upsertStreamingMessage(chatStore, sessionId || target, localMessageKey, {
                ...baseLocalMessage,
                content: visibleStreamingReply,
                time: new Date().toLocaleTimeString(),
                model: usedModel
              })
            }
          }
        )
      let returnedText: string | null = null
      try {
        returnedText = await callFinalRoleModel()
      } catch (error) {
        if (!isPersonalityModelReply || isAbortError(error)) throw error
        markReplySituationCheckpointFailure(error)
        const promptLogId = String(localMessageTargets.get(`${localMessageKey}:prompt-log`) || '')
        const failureContent = [
          '【最终角色模型调用失败】',
          '',
          `错误：${getErrorMessage(error)}`,
          '',
          '本轮在最终角色模型调用处中断；已完成到哪一步请以这条消息的执行审计为准。',
          '可以对这条角色消息使用“按原提示词重试”，只重放最后一次角色模型调用。'
        ].join('\n')
        const failureMessage: MessagePayload & Record<string, unknown> = {
          role: 'assistant',
          content: failureContent,
          messageKind: 'chat',
          message_kind: 'chat',
          includeInContext: false,
          include_in_context: false,
          time: new Date().toLocaleTimeString(),
          name: speakerName,
          memberName: speakerName,
          memberTargetId: speakerTargetId || undefined,
          member_target_id: speakerTargetId || undefined,
          speakerTargetId: speakerTargetId || undefined,
          speaker_target_id: speakerTargetId || undefined,
          envDate: envSnapshot.envDate,
          envWeather: envSnapshot.envWeather,
          envLocation: envSnapshot.envLocation,
          model: usedModel || ''
        }
        const failureMessageId = Number(await chatStore.addMessage(target, failureMessage as MessagePayload, { skipLocalSync: true, sessionId }) || 0)
        clearStreamingBubbleState(target)
        const finalizedFailure = finalizeStreamingMessage(chatStore, sessionId || target, localMessageKey, {
          id: failureMessageId,
          ...failureMessage,
          memberName: failureMessage.name,
          _sessionId: sessionId,
          _localInsertAfterMessageId: localInsertAfterMessageId
        })
        if (finalizedFailure === false) {
          queuePendingPersistedMessage(chatStore, sessionId || target, {
            id: failureMessageId,
            ...failureMessage,
            memberName: failureMessage.name,
            _targetId: target,
            _sessionId: sessionId,
            _localInsertAfterMessageId: localInsertAfterMessageId
          })
        }
        if (promptLogId && failureMessageId > 0) {
          try {
            if (sessionId) {
              await bindChatPromptLogMessageBySessionId(sessionId, promptLogId, failureMessageId)
            } else {
              await bindChatPromptLogMessage(target, promptLogId, failureMessageId)
            }
          } catch (bindError) {
            console.error('绑定最终失败消息提示词日志失败:', bindError)
          }
        }
        localMessageTargets.delete(localMessageKey)
        localMessageTargets.delete(`${localMessageKey}:prompt-log`)
        localMessageSessions.delete(localMessageKey)
        if (generationAttemptId && sessionId) {
          await finishGenerationAttempt({
            attemptId: generationAttemptId,
            sessionId,
            status: 'failed',
            assistantMessageIds: failureMessageId > 0 ? [failureMessageId] : [],
            outputPromptLogId: promptLogId,
            error
          })
        }
        failNormalMessageTaskRun(taskRunId, error)
        await persistReplyExecutionFailureReceipt(error, promptLogId, failureMessageId, 'final_reply_generation')
        await persistPersonalityModelFailureTrace(error, promptLogId, failureMessageId, 'final_reply_generation')
        toast('最终角色模型调用失败，已保存为可重试角色消息', 'warning', 10000)
        return {
          assistantMessageIds: failureMessageId > 0 ? [failureMessageId] : [],
          firstMessageId: failureMessageId,
          firstContent: failureContent
        }
      }

      assertPipelineCanContinue(runId, taskRunId)
      const normalizedReply = normalizeAiOutputText(returnedText || fullReply)
      const embeddedProjectionParse = isPurePromptReply
        ? { visibleText: normalizedReply, projectionText: '', hasProjection: false, error: '' }
        : parseEmbeddedMessageProjectionOutput(normalizedReply)
      const cleanedReply = cleanAiPrefix(embeddedProjectionParse.visibleText)
      const embeddedProjectionText = embeddedProjectionParse.projectionText
      const embeddedProjectionError = embeddedProjectionParse.hasProjection ? '' : embeddedProjectionParse.error
      const promptLogId = String(localMessageTargets.get(`${localMessageKey}:prompt-log`) || '')
      if (!hasVisibleAiReplyBody(cleanedReply)) {
        const visibleReply = stripAiThoughtContent(cleanedReply)
        const emptyReplyErrorKind = classifyEmptyFinalReplyError({
          returnedText,
          streamedText: fullReply,
          normalizedReply,
          cleanedReply,
          visibleReply
        })
        removeStreamingMessage(chatStore, sessionId || target, localMessageKey)
        localMessageTargets.delete(localMessageKey)
        localMessageSessions.delete(localMessageKey)
        const emptyReplyError = new Error('模型调用成功，但没有返回可保存的可见正文')
        const debugContent = buildEmptyFinalReplyDebugContent({
          errorKind: emptyReplyErrorKind,
          targetId: target,
          speakerTargetId: speakerTargetId || target,
          speakerName,
          sessionId,
          inputMessageId,
          attemptId: generationAttemptId || '',
          promptLogId,
          usedModel,
          returnedText,
          streamedText: fullReply,
          normalizedReply,
          cleanedReply,
          visibleReply
        })
        await appendEmptyFinalReplyDebugMessage({
          targetId: target,
          sessionId,
          content: debugContent
        })
        await failSingleChatAttempt(emptyReplyError, promptLogId)
        await persistReplyExecutionFailureReceipt(emptyReplyError, promptLogId, 0, 'final_reply_validation')
        await persistPersonalityModelFailureTrace(emptyReplyError, promptLogId, 0, 'final_reply_validation')
        toast(`模型调用成功，但没有返回可保存的可见正文；已在聊天区输出诊断：${emptyReplyErrorKind}`, 'warning', 10000)
        return createEmptySingleChatRunResult()
      }
      emitProcessStep('compose', 'done')
      // 批次4：回复收尾后台触发滚动会话记忆压缩（fire-and-forget，失败不影响回复；非 ReplyWorkflow 路径
      // projectionItems 为 null 时函数自身早返回）。放在 compose done 后，避免与最终回复 AI 调用抢资源。
      maybeRefreshSessionMemory(sessionId, replyWorkflowProjectionItems)
      // 旧 virtual_scene_location_scan 已退场：场景变化只通过投影上下文、编排器和 updateCurtainScene 处理。

      // 穿插旁白预生成触发点（批C1-②）：正文已生成、校验通过（非空可见正文），落库前的最窄位置——
      // 调用方（群聊循环/单聊入口）据此预起跑该角色名下穿插旁白，不阻塞、不影响本条消息持久化。
      options.onAssistantContentComposed?.({ text: cleanedReply })

      assertPipelineCanContinue(runId, taskRunId)
      const replyMessage: MessagePayload = {
        role: 'assistant',
        content: cleanedReply,
        time: new Date().toLocaleTimeString(),
        name: speakerName,
        memberName: speakerName,
        memberTargetId: speakerTargetId || undefined,
        member_target_id: speakerTargetId || undefined,
        speakerTargetId: speakerTargetId || undefined,
        speaker_target_id: speakerTargetId || undefined,
        envDate: envSnapshot.envDate,
        envWeather: envSnapshot.envWeather,
        envLocation: envSnapshot.envLocation,
        model: usedModel
      }
      // 全轮落库顺序门控（串行压缩批C2）：生成完成、落库前的最窄等待点——并行群聊传 beforePersist 接全轮保序
      // 落库链，等前序槽位落库完成才放行；返回值可覆盖显示锚点（对齐 C1 narrationChatWrite.ts 范式）。
      // 不传=零行为变化（生成完立即落库）。
      let insertAfterMessageIdOverride: number | undefined
      if (options.beforePersist) {
        const gateResult = await options.beforePersist()
        // 等待期间也可能变成「已停止」，等完要再查一次（对齐 C1 beforePersist 范式）。
        assertPipelineCanContinue(runId, taskRunId)
        if (gateResult && typeof (gateResult as { insertAfterMessageId?: number }).insertAfterMessageId === 'number') {
          insertAfterMessageIdOverride = (gateResult as { insertAfterMessageId?: number }).insertAfterMessageId
        }
      }
      const effectiveLocalInsertAfterMessageId = insertAfterMessageIdOverride ?? localInsertAfterMessageId
      let persistedId = 0
      let savedReplyMessage = replyMessage
      try {
        const result = await chatStore.addMessage(target, replyMessage, { skipLocalSync: true, sessionId })
        persistedId = typeof result === 'number' ? result : 0
      } catch (error) {
        const visibleReply = stripAiThoughtContent(replyMessage.content)
        const canRetryWithoutThought = isBadRequestError(error)
          && visibleReply
          && visibleReply !== replyMessage.content
          && visibleReply.length <= 50000
        if (!canRetryWithoutThought) {
          await failSingleChatAttempt(error, promptLogId)
          await persistReplyExecutionFailureReceipt(error, promptLogId, 0, 'assistant_reply_persist')
          await persistPersonalityModelFailureTrace(error, promptLogId, 0, 'assistant_reply_persist')
          toast(`回复已生成但保存失败: ${getErrorMessage(error)}`, 'error', 10000)
          localMessageTargets.delete(localMessageKey)
          localMessageTargets.delete(`${localMessageKey}:prompt-log`)
          localMessageSessions.delete(localMessageKey)
          return createEmptySingleChatRunResult()
        }
        savedReplyMessage = { ...replyMessage, content: visibleReply }
        const retryResult = await chatStore.addMessage(target, savedReplyMessage, { skipLocalSync: true, sessionId })
        persistedId = typeof retryResult === 'number' ? retryResult : 0
        toast('回复思考过程过长，已只保存可见正文', 'warning')
      }
      // 过程轨快照直接随持久化消息走：不依赖 observations 重载时序，落地后过程轨持续可见。
      const processTraceForPersistedMessage = processTraceActive
        ? { processTrace: buildProcessTraceViewSnapshot() }
        : {}
      const persistedMessage = {
        id: persistedId,
        ...savedReplyMessage,
        memberName: savedReplyMessage.name,
        _targetId: target,
        _sessionId: sessionId,
        _localInsertAfterMessageId: effectiveLocalInsertAfterMessageId,
        ...processTraceForPersistedMessage
      }
      let finalized = false
      clearStreamingBubbleState(target)
      finalized = finalizeStreamingMessage(chatStore, sessionId || target, localMessageKey, {
        id: persistedId,
        ...savedReplyMessage,
        memberName: savedReplyMessage.name,
        _sessionId: sessionId,
        _localInsertAfterMessageId: effectiveLocalInsertAfterMessageId,
        ...processTraceForPersistedMessage
      })
      // 全轮落库顺序门控（批C2）：消息真实落库（addMessage 成功+finalize）后立即回调——并行群聊据此记录
      // 锚点 id、释放下一槽位、触发该角色名下穿插旁白 flush。不传=不触发（现状逐字不变）。
      if (persistedId > 0) {
        options.onAssistantPersisted?.(persistedId)
      }
      // 回复已落地可见：本轮“正在回复”酝酿态到此结束。后面 await 的消息投影 / 角色投影写回
      // 是后置任务，不属于回复酝酿；不在这里关 typing 的话，占位消息已被替换、
      // previewSpeakerName 又会兜底成当前角色名，消息流末尾会再冒出旧版酝酿气泡（头像+名字+三点）。
      if (isPipelineRunCurrent(runId, taskRunId)) {
        setTyping(chatStore, false)
      }
      if (promptLogId && typeof persistedId === 'number' && persistedId > 0) {
        try {
          if (sessionId) {
            await bindChatPromptLogMessageBySessionId(sessionId, promptLogId, persistedId)
          } else {
            await bindChatPromptLogMessage(target, promptLogId, persistedId)
          }
        } catch (error) {
          console.error('绑定提示词日志失败:', error)
        }
      }
      if (!isPurePromptReply && typeof persistedId === 'number' && persistedId > 0) {
        try {
          await persistCurrentRecallActivity({
            sessionId,
            targetId: speakerTargetId || target,
            speakerName,
            inputMessageId,
            assistantMessageId: persistedId
          })
        } catch (error) {
          console.error('保存召回活动日志失败:', error)
        }
      }
      localMessageTargets.delete(localMessageKey)
      localMessageTargets.delete(`${localMessageKey}:prompt-log`)
      localMessageSessions.delete(localMessageKey)
      if (typeof chatStore.finalizeLocalStreamingMessage === 'function') {
        if (finalized === false) {
          queuePendingPersistedMessage(chatStore, sessionId || target, persistedMessage)
        }
      } else if (isTargetActive(chatStore, target)) {
        const localMessageList = getCurrentMessageList(chatStore)
        if (finalized === false) {
          if (isTargetReady(chatStore, target)) {
            appendPersistedMessage(localMessageList, persistedMessage)
          } else {
            queuePendingPersistedMessage(chatStore, sessionId || target, persistedMessage)
          }
        }
      } else {
        queuePendingPersistedMessage(chatStore, sessionId || target, persistedMessage)
      }
      if (typeof persistedId === 'number' && persistedId > 0) {
        const attemptAssistantMessageIds = [persistedId]
        persistedSuccessResult = {
          assistantMessageIds: attemptAssistantMessageIds,
          firstMessageId: persistedId,
          firstContent: String(savedReplyMessage.content || '')
        }
        if (isPurePromptReply) {
          // 纯净回复只保存用户消息、AI 回复、提示词日志和生成尝试，不触发后置写入。
        } else if (isPersonalityModelReply) {
          await runReplyContextProjectionForMessage({
            sessionId,
            messageId: persistedId,
            stage: 'assistant',
            embeddedProjectionText,
            embeddedProjectionError,
            embeddedProjectionRequired: true
          })
          await runProjectionWritebackForCharacter({
            sessionId,
            characterId: speakerTargetId || target,
            runKind: 'auto',
            sourceLabel: '人格模型'
          })
        } else {
          triggerAutoWriteAfterAssistantPersisted({
            sessionId,
            targetId: target,
            assistantMessageId: persistedId,
            speakerTargetId: speakerTargetId || target,
            embeddedProjectionText,
            embeddedProjectionError,
            embeddedProjectionRequired: true
          })
        }
        const outputPromptLogId = String(promptLogId || '')
        await finishGenerationAttempt({
          attemptId: generationAttemptId,
          sessionId,
          status: 'completed',
          assistantMessageIds: attemptAssistantMessageIds,
          outputPromptLogId
        })
        if (generationAttemptId) {
          const turnExecutionContext = chatTurnRunner.getContext()
          const executionAudit = buildReplyExecutionAudit({
            roundProfile: turnExecutionContext?.replyExecutionProfile,
            routeDecision: turnExecutionContext?.replyOrchestrationDecision,
            defaultRoute: options.fastReply ? 'reuse' : 'orchestrate',
            actualHasPersonalityModel: isPersonalityModelReply,
            purePrompt: isPurePromptReply,
            focusedAction: false
          })
          // 过程轨真值分流：人格模型写专属 personality_model_trace（含 ReRanker 诊断门禁）；
          // 普通召回写通用 reply_workflow_trace（服务端按 processSummary 放行）；纯净回复只写 reply_message。
          // 稳定续话的 direct 人格分支同样真实执行了三候选 ReRanker，因此也必须进入人格专属审计；
          // 服务端会用 executionPolicy + 真实候选/选中项识别这条低成本评分链，降级也保留失败原因。
          const artifactKind = personalityTracePayload
            ? (isPersonalityModelReply ? 'personality_model_trace' : 'reply_workflow_trace')
            : 'reply_message'
          const artifactPayload = personalityTracePayload
            ? {
              ...personalityTracePayload,
              ...executionAudit,
              messageId: persistedId,
              promptLogId: outputPromptLogId,
              // 顶层精简过程轨摘要：纯展示步骤状态 + 用时，无技术字段；与 orchestration 并列，
              // 保留必要的过程字段，供历史消息复原折叠过程栏。
              ...(processTraceActive
                ? {
                  processSummary: {
                    steps: { ...processTraceState.steps },
                    failed: processTraceState.failed,
                    elapsed: processTraceState.elapsed,
                    mode: processTraceState.mode,
                    narration: processTraceState.narration,
                    reviewDegrade: processTraceState.reviewDegrade,
                    stepElapsed: { ...processTraceState.stepElapsed },
                    thoughts: [...processTraceState.thoughts],
                    ...(processTraceState.directorStream ? { directorStream: processTraceState.directorStream } : {}),
                    // R3-2b：append log 保真事件与 directorStream 同处落库（有事件才带，旧路/无事件不污染）。
                    ...(processTraceState.appendLog?.length ? { appendLog: processTraceState.appendLog } : {}),
                    // 批次K1：真实 prompt 与 stream/appendLog 三件套同处落库（非空才带）——读侧择优选中成员 trace 时不丢 prompt。
                    ...(processTraceState.directorPrompt ? { directorPrompt: processTraceState.directorPrompt } : {}),
                    // 批次2·步骤2a（路径①·修根因·2026-06-23）：始终落库本轮「已定方向」的结构化真值——
                    //   scenarioCode/Body（导演判好的情境）+ 该发言者方向（castDirection）。供「定向重掷」轻量重试读回复用：
                    //   按原轮已定方向只重新掷正文、不重判情境/不改方向。正常成功路径只落视图 directorStream（不带结构化），
                    //   故此处补这份轻量结构化字段。无导演方向源（旧单聊自判路）则不带、定向重掷降级回完整 loop。
                    ...((activeRoundDirector?.script?.scenarioCode && activeRoundDirector?.script?.scenarioBody)
                      ? {
                        directedRecast: {
                          scenarioCode: activeRoundDirector.script.scenarioCode,
                          scenarioBody: activeRoundDirector.script.scenarioBody,
                          ...(directorDirection ? { direction: directorDirection } : {})
                        }
                      }
                      : {})
                  }
                }
                : {})
            }
            : { ...executionAudit, messageId: persistedId }
          await createChatGenerationAttemptArtifactBySessionId(sessionId, {
            attemptId: generationAttemptId,
            artifactKind,
            messageId: persistedId,
            promptLogId: outputPromptLogId,
            payload: artifactPayload
          }).catch((error) => console.error('保存生成尝试产物失败:', error))
        }
        // 旁白激进版：正文已与最终回复并行；这里等支线收尾，保证本轮结束时旁白消息
        // 与其投影已落库，下一轮发送不会踩到还在写入中的旁白（completion 自吞错误，不会 reject）。
        if (replyWorkflowNarrationCompletion) {
          await replyWorkflowNarrationCompletion.catch(() => undefined)
        }
        return persistedSuccessResult
      }
      return createEmptySingleChatRunResult()

    } catch (err: unknown) {
      if (persistedSuccessResult) {
        console.warn('回复已保存，但保存后的附加处理未完成:', err)
        if (!isAbortError(err)) {
          toast(`回复已保存，但后续处理失败: ${getErrorMessage(err)}`, 'warning', 10000)
        }
        return persistedSuccessResult
      }
      const promptLogId = String(localMessageTargets.get(`${localMessageKey}:prompt-log`) || '')
      if (isAbortError(err)) {
        // 停止=中断保留（2026-07-08 用户拍板，取代 07-04「停止=取消」）：已显示在 UI 上的内容点停止后原样留下——
        // ①半截流式正文非空 → 按失败消息同款范式落库保留（不带 includeInContext:false：中断消息要进上下文供续接）；
        // ②已落库旁白不再回滚删除（discardRunNarrationMessages 不调）；③半截为空（还没吐字）才按旧口径移除流式占位。
        // 中断标识由提调带 correcting 态承担（消息表固定列白名单不加列，不做消息级角标）。
        if (interruptedVisibleReply.trim()) {
          const interruptedEnv = getCurrentEnvironmentSnapshot()
          const interruptedMessage: MessagePayload & Record<string, unknown> = {
            role: 'assistant',
            content: interruptedVisibleReply,
            messageKind: 'chat',
            message_kind: 'chat',
            time: new Date().toLocaleTimeString(),
            name: speakerName,
            memberName: speakerName,
            memberTargetId: speakerTargetId || undefined,
            member_target_id: speakerTargetId || undefined,
            speakerTargetId: speakerTargetId || undefined,
            speaker_target_id: speakerTargetId || undefined,
            envDate: interruptedEnv.envDate,
            envWeather: interruptedEnv.envWeather,
            envLocation: interruptedEnv.envLocation,
            model: interruptedModel || ''
          }
          try {
            const interruptedMessageId = Number(await chatStore.addMessage(target, interruptedMessage as MessagePayload, { skipLocalSync: true, sessionId }) || 0)
            clearStreamingBubbleState(target)
            const finalizedInterrupted = finalizeStreamingMessage(chatStore, sessionId || target, localMessageKey, {
              id: interruptedMessageId,
              ...interruptedMessage,
              memberName: interruptedMessage.name,
              _sessionId: sessionId,
              _localInsertAfterMessageId: localInsertAfterMessageId
            })
            if (finalizedInterrupted === false) {
              queuePendingPersistedMessage(chatStore, sessionId || target, {
                id: interruptedMessageId,
                ...interruptedMessage,
                memberName: interruptedMessage.name,
                _targetId: target,
                _sessionId: sessionId,
                _localInsertAfterMessageId: localInsertAfterMessageId
              })
            }
            if (promptLogId && interruptedMessageId > 0) {
              try {
                if (sessionId) {
                  await bindChatPromptLogMessageBySessionId(sessionId, promptLogId, interruptedMessageId)
                } else {
                  await bindChatPromptLogMessage(target, promptLogId, interruptedMessageId)
                }
              } catch (bindError) {
                console.error('绑定中断保留消息提示词日志失败:', bindError)
              }
            }
          } catch (persistError) {
            console.error('中断半截消息落库失败:', persistError)
            removeStreamingMessage(chatStore, sessionId || target, localMessageKey)
          }
        } else {
          removeStreamingMessage(chatStore, sessionId || target, localMessageKey)
        }
        localMessageTargets.delete(localMessageKey)
        localMessageTargets.delete(`${localMessageKey}:prompt-log`)
        localMessageSessions.delete(localMessageKey)
        return createEmptySingleChatRunResult()
      }
      // 批次5c（真错误·非 abort 维持原口径）：回复未落库（persistedSuccessResult 为空）即本轮失败——
      // 删本轮已落库的半成品旁白，避免成 DB 孤儿、避免还原旧消息后半句旁白残留在底部。
      await discardRunNarrationMessages()
      removeStreamingMessage(chatStore, sessionId || target, localMessageKey)
      localMessageTargets.delete(localMessageKey)
      localMessageSessions.delete(localMessageKey)
      await failSingleChatAttempt(err, promptLogId)
      await persistReplyExecutionFailureReceipt(err, promptLogId)
      await persistPersonalityModelFailureTrace(err, promptLogId)
      toast(`AI回复失败: ${getErrorMessage(err)}`, 'error', 10000)
      return createEmptySingleChatRunResult()
    } finally {
      if (isPipelineRunCurrent(runId, taskRunId)) {
        setTyping(chatStore, false)
        setCurrentMessageModel(chatStore, '')
        streamingText.value = ''
        safeCurrentStreamingSpeakerName.value = ''
        safeCurrentStreamingTargetId.value = ''
        safePlannedGroupSpeakers.value = []
        mentionSelectedChars.value = []
        await nextTick()
        scrollToBottom()
      }
    }
  }


  /** 串行压缩批C2（2026-07-13）：旧串行实现原样保留——门槛判定命中（session 内存在 pure_prompt speaker，
   *  或本轮有效发言人数 ≤1）时整轮走这条路径，零回归。函数体逐字未改（仅顶层重命名）。 */
  async function executeMixedGroupChatSequential(input: {
    targetId: string
    userText: string
    replyOrder: Array<{ characterId?: string; mustReply?: boolean; probability?: number }>
    runId: number
    abortSignal?: AbortSignal
    /** 群聊重试链路传 true：发言者生成尝试按「整轮重生」记，触发类型用 user_message_regenerate。 */
    replay?: boolean
  }): Promise<number> {
    // 群聊锚点用户消息：普通发送取本轮新加用户消息（activePipelineInputMessageId）；
    // 重试链路该值已在上一轮 resetActivePipelineState 清零，回退到当前消息列表最后一条用户消息。
    const anchorMessageId = activePipelineInputMessageId > 0
      ? activePipelineInputMessageId
      : Number([...getCurrentMessageList(chatStore)].reverse().find((message: any) => message?.role === 'user')?.id || 0)
    // 真机五验④：新轮开局清掉旧轮失败单元残留（注册表只描述当前这一轮）。
    clearRoundRetryUnits(getActiveSessionId(chatStore), anchorMessageId)
    // 真机五验④：本轮生成失败的发言者（已登记可重试单元）——循环不再一失败全断，收尾聚合上抛保住失败可见性。
    const failedSpeakerLabels: string[] = []
    let replyCount = 0
    // 旁白穿插：本轮最后一条已落库助手消息 id——穿插/收尾旁白的插入锚（发言者失败时沿用上一位的锚）。
    let lastRoundAssistantMessageId = 0
    for (let index = 0; index < input.replyOrder.length; index += 1) {
      assertPipelineCanContinue(input.runId, activePipelineTaskRunId)
      if (isStopRequested(chatStore)) break
      const item = input.replyOrder[index]
      const speakerTargetId = String(item.characterId || '').trim()
      if (!speakerTargetId) continue
      safePlannedGroupSpeakers.value = resolvePlannedGroupSpeakers(input.replyOrder.slice(index))
      await nextTick()
      const mode = String(resolveReplyPipelineModeForTarget(speakerTargetId))
      // ReplyWorkflow 模式（personality_model / normal_recall）统一按角色顺序走 runSingleChat 工作流；
      // 旧 executeGroupChat 仅保留给 pure_prompt 直送路径。
      if (mode === 'personality_model' || mode === 'normal_recall') {
        // 群聊每个发言者各自建生成尝试：顶层 if(!isGroupChat) 跳过了 startGenerationAttempt，必须在此按
        // 发言者补建，否则 runSingleChat 收尾时 activeGenerationAttemptId 为空 → 不写 personality_model_trace、
        // 不 finish attempt，编排审计与历史折叠过程栏全部丢失。与单聊顶层对称：单聊一轮一条，群聊一发言者一条。
        // 串行压缩批C2：局部捕获这条 attemptId，传给 runSingleChat（全局变量照旧赋值一份，别的路径还在读它）。
        const speakerGenerationAttemptId = await startGenerationAttempt({
          sessionId: getActiveSessionId(chatStore),
          anchorMessageId,
          triggerType: input.replay ? 'user_message_regenerate' : 'normal_send',
          mode: 'clean',
          targetId: speakerTargetId,
          speakerName: getTargetName(speakerTargetId)
        })
        activeGenerationAttemptId = speakerGenerationAttemptId
        markActiveTurnGenerationAttempt(speakerGenerationAttemptId)
        // 真机五验④（2026-07-05·用户拍板）：角色子工作流失败**不立刻断整轮**——先自动重试一次（5s 缓冲），
        // 仍失败则登记可重试单元（参数快照·纠偏 retryFailedWorkflow 可重跑）并继续下一位发言者；
        // abort/软停/run 被顶掉维持旧语义原样上抛。收尾若有失败聚合抛错，带子仍标 failed、失败不被吞。
        // 穿插旁白预生成（批C1-②）：非末位发言者=预起跑其名下穿插旁白；末位发言者额外预起跑 round_end 段
        //（最后一位角色正文生成完即预起跑）。fallbackAnchor=预生成起跑时「已知最新」的锚点（上一位发言者的
        // 消息 id，或本轮用户消息 id），仅在真实锚点始终没到达时（角色最终失败/未出场）兜底使用。
        const isLastGroupMember = index === input.replyOrder.length - 1
        const fallbackAnchorAtPrefetchTime = lastRoundAssistantMessageId || anchorMessageId
        try {
          const result = await runWithAutoRetry(
            () => runSingleChat(input.targetId, input.userText, input.runId, activePipelineTaskRunId, input.abortSignal, {
              speakerTargetId,
              generationAttemptId: speakerGenerationAttemptId,
              onAssistantContentComposed: ({ text }) => {
                prefetchRoundInterleavedNarration({
                  targetId: input.targetId,
                  speakerCharacterId: speakerTargetId,
                  liveAssistantText: text,
                  liveSpeakerName: getTargetName(speakerTargetId),
                  fallbackInsertAfterMessageId: fallbackAnchorAtPrefetchTime || undefined,
                  abortSignal: input.abortSignal
                })
                if (isLastGroupMember) {
                  prefetchRoundInterleavedNarration({
                    targetId: input.targetId,
                    speakerCharacterId: null,
                    liveAssistantText: text,
                    liveSpeakerName: getTargetName(speakerTargetId),
                    fallbackInsertAfterMessageId: fallbackAnchorAtPrefetchTime || undefined,
                    abortSignal: input.abortSignal
                  })
                }
              }
            }),
            {
              signal: input.abortSignal,
              shouldAbort: () => isStopRequested(chatStore) || !isPipelineRunCurrent(input.runId),
              onRetry: () => console.warn(`角色子工作流生成失败，5s 后自动重试一次：${getTargetName(speakerTargetId)}`)
            }
          )
          replyCount += result.assistantMessageIds.length
          // 旁白穿插：该发言者消息已落库 → 立刻生成锚在他/她之后的旁白（生成时能看到其实际言行），
          // 并在下一位发言者开工前收信息承载闸门（纯描写旁白仍后台并行，轮末统一收束）。
          const lastAssistantId = Number(result.assistantMessageIds[result.assistantMessageIds.length - 1] || 0)
          if (lastAssistantId > 0) lastRoundAssistantMessageId = lastAssistantId
          await flushRoundInterleavedNarration({
            targetId: input.targetId,
            speakerCharacterId: speakerTargetId,
            insertAfterMessageId: lastRoundAssistantMessageId || anchorMessageId,
            abortSignal: input.abortSignal
          })
        } catch (error) {
          if (isAbortError(error) || input.abortSignal?.aborted || isStopRequested(chatStore) || !isPipelineRunCurrent(input.runId)) throw error
          const message = error instanceof Error ? error.message : String(error || '')
          const speakerLabel = getTargetName(speakerTargetId)
          registerRoundRetryUnit({
            id: `actor:${speakerTargetId}`,
            kind: 'actor',
            label: `${speakerLabel} 消息生成`,
            sessionId: getActiveSessionId(chatStore),
            anchorMessageId,
            lastError: message || '生成失败',
            attempts: 1,
            payload: { kind: 'actor', speakerTargetId, userText: input.userText }
          })
          failedSpeakerLabels.push(speakerLabel)
          console.error(`角色子工作流生成失败（已登记可重试单元·继续下一位发言者）：${speakerLabel}`, error)
        }
        continue
      }
      const count = await executeGroupChat({
        targetId: input.targetId,
        userText: input.userText,
        replyOrder: [{
          characterId: speakerTargetId,
          mustReply: true,
          probability: 1
        }]
      })
      replyCount += count
      // 旁白穿插（pure_prompt 直送路径无 assistantMessageIds 返回）：取当前列表尾部消息作插入锚。
      if (count > 0) {
        const tail = [...getCurrentMessageList(chatStore)].reverse().find((message: any) => Number(message?.id) > 0) as any
        if (Number(tail?.id) > 0) lastRoundAssistantMessageId = Number(tail.id)
      }
      await flushRoundInterleavedNarration({
        targetId: input.targetId,
        speakerCharacterId: speakerTargetId,
        insertAfterMessageId: lastRoundAssistantMessageId || anchorMessageId,
        abortSignal: input.abortSignal
      })
      continue
    }
    safePlannedGroupSpeakers.value = []
    // 旁白穿插·轮末：先收束已起跑的穿插段（避免与同锚点的收尾旁白抢插入顺序），再生成 round_end 子集
    // + 锚点角色未发言的 after_speaker 兜底，最后统一收束。部分发言者失败不影响收尾旁白（剧情内容仍有效）；
    // 停止/中断时 flush 自守跳过、只收束已起跑段。
    if (!input.abortSignal?.aborted && !isStopRequested(chatStore) && isPipelineRunCurrent(input.runId)) {
      await settleRoundInterleavedNarration()
      await flushRoundInterleavedNarration({
        targetId: input.targetId,
        speakerCharacterId: null,
        insertAfterMessageId: lastRoundAssistantMessageId || anchorMessageId,
        abortSignal: input.abortSignal
      })
    }
    await settleRoundInterleavedNarration()
    // 真机五验④：有发言者生成失败 → 聚合上抛（带子标 failed·失败可见），已成功的发言者消息已落库不受影响；
    // 失败单元已登记，用户在提调框说「重试」即可由 retryFailedWorkflow 重跑。
    if (failedSpeakerLabels.length) {
      throw new Error(`本轮 ${failedSpeakerLabels.length} 个角色消息生成失败（${failedSpeakerLabels.join('、')}）。已登记可重试——在提调输入框说「重试失败的消息」即可重新生成。`)
    }
    return replyCount
  }

  /** 串行压缩批C2（2026-07-13）：前序预告块——并行发起下后序角色看不到前序真实回复，注入前序角色在
   *  activeRoundDirector 里定好的「方向 + direct 计划」当预告（幕后剧本代偿·用户拍板②）。只看 index 之前
   *  的 replyOrder 条目；没有 activeRoundDirector（统筹失败兜底 cast）或方向/计划都空时该条目不产出。 */
  function buildPriorCastPreviewForIndex(replyOrder: Array<{ characterId?: string }>, index: number): string {
    const director = activeRoundDirector
    if (!director || index <= 0) return ''
    const lines: string[] = []
    for (let i = 0; i < index; i += 1) {
      const priorId = String(replyOrder[i]?.characterId || '').trim()
      if (!priorId) continue
      const direction = String(director.castDirections.get(priorId) || '').trim()
      const plan = String(director.castPlans.get(priorId)?.plan || '').trim()
      if (!direction && !plan) continue
      const name = getTargetName(priorId)
      lines.push(`${name}：${direction}${plan ? `（计划：${plan}）` : ''}`)
    }
    return lines.join('\n')
  }

  /** 串行压缩批C2（2026-07-13）：全员并行发起 runSingleChat + 全轮落库顺序门控（复用 narrationReleaseChain，
   *  round_start 旁白们 → 角色1 → 角色2 → … → round_end 旁白们）+ 前序预告注入代偿并行下的可见性损失。
   *  仅在门槛判定（executeMixedGroupChat）确认全员 personality_model/normal_recall 且 ≥2 人时调用。
   *  穿插旁白（after_speaker/round_end 之外的段）不进本链，仍走 C1 既有 prefetch/flush/holding 机制——
   *  与后续角色的持久序竞争是本批接受的已知边界（当屏正确·刷新后可能排后，与 C1 round_start 遗留同类）。 */
  async function executeMixedGroupChatParallel(input: {
    targetId: string
    userText: string
    replyOrder: Array<{ characterId?: string; mustReply?: boolean; probability?: number }>
    runId: number
    abortSignal?: AbortSignal
    replay?: boolean
    /** 轮后补演从已落库快速回复的末条后继续，不能插回用户消息后方打乱正文顺序。 */
    initialInsertAfterMessageId?: number
  }): Promise<number> {
    assertPipelineCanContinue(input.runId, activePipelineTaskRunId)
    const anchorMessageId = activePipelineInputMessageId > 0
      ? activePipelineInputMessageId
      : Number([...getCurrentMessageList(chatStore)].reverse().find((message: any) => message?.role === 'user')?.id || 0)
    clearRoundRetryUnits(getActiveSessionId(chatStore), anchorMessageId)
    // 开局一次性上报全员计划发言（并行不再逐位切片）。
    safePlannedGroupSpeakers.value = resolvePlannedGroupSpeakers(input.replyOrder)
    await nextTick()

    // 全轮落库顺序门控：round_start 旁白们 claim 最前面几个槽位，随后每个角色按 replyOrder 声明序各占一槽。
    const roundChain = createNarrationReleaseChain()
    // 共享「全轮最后已落库消息 id」：链本身保证严格按声明序读写——下一位的 beforePersist 要等上一位
    // gate.done() 才会 resolve，而上一位总在 gate.done() 之前先更新这个变量，不存在竞态。
    let sharedLastPersistedMessageId = Number(input.initialInsertAfterMessageId || 0) || anchorMessageId

    // round_start 段起跑外提：并行发起前先起跑（若有 round_start 旁白且本轮还没起跑过），把它的 gate
    // 编进全轮链最前面——顺带根治 C1 遗留的「round_start 纯描写旁白持久序可能晚于角色消息」问题。
    const director = activeRoundDirector
    if (director && !director.narrationStarted) {
      const roundStartNarrationCalls = (director.narrationCalls || []).filter(isRoundStartNarrationCall)
      if (roundStartNarrationCalls.length) {
        const roundNarrationProfiles = resolvePersonalityNarrationSubagentProfiles(getChatStoreCurrentSession(chatStore) as any)
        if (roundNarrationProfiles.length) {
          director.narrationStarted = true
          const started = startDirectorNarrationCompletion({
            targetId: input.targetId,
            sessionId: activePipelineSessionId || getActiveSessionId(chatStore),
            runId: activePipelineRunId,
            speakerName: '',
            calls: roundStartNarrationCalls,
            profiles: roundNarrationProfiles,
            insertAfterMessageId: sharedLastPersistedMessageId || anchorMessageId || undefined,
            onMessageWritten: (messageId) => {
              if (messageId > 0) sharedLastPersistedMessageId = messageId
            },
            abortSignal: input.abortSignal,
            externalChain: roundChain
          })
          director.roundDirectorNarration = started
        }
      }
    }

    // 按 replyOrder 声明序同步 claim 全部角色 gate（在任何 await 之前一次性循环 claim，保证槽位序=编排序；
    // round_start 段已在上面同步 claim 过，天然排在这些角色槽位之前）。
    const speakerGates = input.replyOrder.map(() => roundChain.claim())

    const speakerResults = await Promise.allSettled(input.replyOrder.map(async (item, index) => {
      const speakerTargetId = String(item.characterId || '').trim()
      const gate = speakerGates[index]
      let gateReleased = false
      const releaseGateOnce = () => {
        if (gateReleased) return
        gateReleased = true
        gate.done()
      }
      if (!speakerTargetId) {
        releaseGateOnce()
        return { assistantMessageIds: [] as number[], failed: false, failedLabel: '' }
      }
      try {
        assertPipelineCanContinue(input.runId, activePipelineTaskRunId)
        // 每个发言者各自建生成尝试（与串行/单聊顶层同构）；局部捕获传给 runSingleChat，全局变量照旧赋值
        // 一份供别的路径读（如 finishRound 收尾态展示）。
        const speakerGenerationAttemptId = await startGenerationAttempt({
          sessionId: getActiveSessionId(chatStore),
          anchorMessageId,
          triggerType: input.replay ? 'user_message_regenerate' : 'normal_send',
          mode: 'clean',
          targetId: speakerTargetId,
          speakerName: getTargetName(speakerTargetId)
        })
        activeGenerationAttemptId = speakerGenerationAttemptId
        markActiveTurnGenerationAttempt(speakerGenerationAttemptId)
        const priorCastPreview = buildPriorCastPreviewForIndex(input.replyOrder, index)
        const isLastGroupMember = index === input.replyOrder.length - 1
        const result = await runWithAutoRetry(
          () => runSingleChat(input.targetId, input.userText, input.runId, activePipelineTaskRunId, input.abortSignal, {
            speakerTargetId,
            generationAttemptId: speakerGenerationAttemptId,
            // 首位 speaker 保持现状（全局「正在输入」态可见）；非首位抑制，防止相互覆盖显示
            // （各自 keyed 占位消息内容仍随 chunk 实时可见，不受影响）。
            suppressGlobalStreaming: index > 0,
            ...(priorCastPreview ? { priorCastPreview } : {}),
            beforePersist: async () => {
              await gate.wait()
              return sharedLastPersistedMessageId > 0 ? { insertAfterMessageId: sharedLastPersistedMessageId } : undefined
            },
            onAssistantPersisted: (persistedMessageId) => {
              if (persistedMessageId > 0) sharedLastPersistedMessageId = persistedMessageId
              // 释放下一槽位越早越好（不等穿插旁白 flush），下一位角色的落库不该被旁白生成拖慢。
              releaseGateOnce()
              void flushRoundInterleavedNarration({
                targetId: input.targetId,
                speakerCharacterId: speakerTargetId,
                insertAfterMessageId: persistedMessageId || anchorMessageId,
                abortSignal: input.abortSignal
              }).catch((flushError) => {
                markReplySituationCheckpointFailure(flushError)
                console.warn(`穿插旁白 flush 失败（${getTargetName(speakerTargetId)}）:`, flushError)
              })
            },
            onAssistantContentComposed: ({ text }) => {
              prefetchRoundInterleavedNarration({
                targetId: input.targetId,
                speakerCharacterId: speakerTargetId,
                liveAssistantText: text,
                liveSpeakerName: getTargetName(speakerTargetId),
                fallbackInsertAfterMessageId: sharedLastPersistedMessageId || anchorMessageId || undefined,
                abortSignal: input.abortSignal
              })
              if (isLastGroupMember) {
                prefetchRoundInterleavedNarration({
                  targetId: input.targetId,
                  speakerCharacterId: null,
                  liveAssistantText: text,
                  liveSpeakerName: getTargetName(speakerTargetId),
                  fallbackInsertAfterMessageId: sharedLastPersistedMessageId || anchorMessageId || undefined,
                  abortSignal: input.abortSignal
                })
              }
            }
          }),
          {
            signal: input.abortSignal,
            shouldAbort: () => isStopRequested(chatStore) || !isPipelineRunCurrent(input.runId),
            onRetry: () => console.warn(`角色子工作流生成失败，5s 后自动重试一次：${getTargetName(speakerTargetId)}`)
          }
        )
        return { assistantMessageIds: result.assistantMessageIds, failed: false, failedLabel: '' }
      } catch (error) {
        if (isAbortError(error) || input.abortSignal?.aborted || isStopRequested(chatStore) || !isPipelineRunCurrent(input.runId)) {
          throw error
        }
        const message = error instanceof Error ? error.message : String(error || '')
        const speakerLabel = getTargetName(speakerTargetId)
        registerRoundRetryUnit({
          id: `actor:${speakerTargetId}`,
          kind: 'actor',
          label: `${speakerLabel} 消息生成`,
          sessionId: getActiveSessionId(chatStore),
          anchorMessageId,
          lastError: message || '生成失败',
          attempts: 1,
          payload: { kind: 'actor', speakerTargetId, userText: input.userText }
        })
        console.error(`角色子工作流生成失败（已登记可重试单元·不阻塞其他并行角色）：${speakerLabel}`, error)
        return { assistantMessageIds: [] as number[], failed: true, failedLabel: speakerLabel }
      } finally {
        // 失败/重试耗尽路径兜底放行：防止一个 speaker 卡死后面所有槽位（onAssistantPersisted 已释放过则是空操作）。
        releaseGateOnce()
      }
    }))

    safePlannedGroupSpeakers.value = []

    // abort-like rejection 优先于普通失败：整轮中断语义保留（原样上抛，不当失败聚合，与串行路径一致）。
    for (const settled of speakerResults) {
      if (settled.status === 'rejected') throw settled.reason
    }

    let replyCount = 0
    const failedSpeakerLabels: string[] = []
    for (const settled of speakerResults) {
      if (settled.status !== 'fulfilled') continue
      replyCount += settled.value.assistantMessageIds.length
      if (settled.value.failed) failedSpeakerLabels.push(settled.value.failedLabel || '')
    }

    // 轮末：先收束已起跑的穿插段，再生成 round_end 子集 + 锚点角色未发言的 after_speaker 兜底，最后统一收束。
    if (!input.abortSignal?.aborted && !isStopRequested(chatStore) && isPipelineRunCurrent(input.runId)) {
      await settleRoundInterleavedNarration()
      await flushRoundInterleavedNarration({
        targetId: input.targetId,
        speakerCharacterId: null,
        insertAfterMessageId: sharedLastPersistedMessageId || anchorMessageId,
        abortSignal: input.abortSignal
      })
    }
    await settleRoundInterleavedNarration()
    if (failedSpeakerLabels.length) {
      throw new Error(`本轮 ${failedSpeakerLabels.length} 个角色消息生成失败（${failedSpeakerLabels.join('、')}）。已登记可重试——在提调输入框说「重试失败的消息」即可重新生成。`)
    }
    return replyCount
  }

  /** 串行压缩批C2（2026-07-13）：门槛判定分发——存在 pure_prompt speaker（session 全体同构，防御性逐一检查）
   *  或本轮有效发言人数 ≤1 时，收益不足以覆盖并行改造的复杂度，整轮退回旧串行路径（零回归）；
   *  否则进并行分支（全员并行发起 + 全轮落库顺序门控 + 前序预告注入，详见 executeMixedGroupChatParallel）。 */
  async function executeMixedGroupChat(input: {
    targetId: string
    userText: string
    replyOrder: Array<{ characterId?: string; mustReply?: boolean; probability?: number }>
    runId: number
    abortSignal?: AbortSignal
    replay?: boolean
  }): Promise<number> {
    const effectiveSpeakerIds = input.replyOrder
      .map((item) => String(item.characterId || '').trim())
      .filter(Boolean)
    const hasPurePromptSpeaker = effectiveSpeakerIds.some(
      (id) => String(resolveReplyPipelineModeForTarget(id)) === 'pure_prompt'
    )
    if (hasPurePromptSpeaker || effectiveSpeakerIds.length <= 1) {
      return executeMixedGroupChatSequential(input)
    }
    return executeMixedGroupChatParallel(input)
  }

  // 批次6→0-6 分层骨架增量2：提调「3·对话可见历史」最近窗口。
  // 逐条结构化=序号(角色N/旁白M·复用楼层号)/类型(角色/旁白/用户扮演)/名/时间/地点/天气/模型，取代旧「谁：说啥(80字)」。
  // 纯渲染逻辑抽到 renderDirectorVisibleHistory（可单测）；此处只喂当前会话消息列表。
  // ⚠️ 单聊/群聊统一排查起点：
  //   这里是「群聊导演 harness」入口（与单聊那套 directorStream 自判情境是两套独立导演）。批次1 目标=单聊也走这条路（cast=[自己]·N=1）。
  //   两套导演未统一前，若单/群聊在情境判定/旁白/决策流落库锚上分叉，优先怀疑本统一改造不彻底；改这里前先读计划书「批次1 子方案」。
  // 方案 B：提调「整轮前置统筹 pass」——一次产出本轮完整剧本（情境/旁白安排/每角色方向/顺序/实时旁述 thoughts），
  // 替换原批次6 的纯 cast pass（cast 是其子集）。点名/@（forced）必含且最前。
  // 成功：填 activeRoundDirector（供方向真注入正文 + 编排带一轮一条展示），返回 replyOrder；
  // 失败/空：返回 null + activeRoundDirector 保持空，由 runGroupChat 回退确定性 cast 兜底（无方向，编排带回退聚合）。
  async function decideRoundDirector(input: {
    userText: string
    groupMembers: Array<{ characterId: string; probability?: number }>
    /** 帷幕校准（2026-07-04）：会话 target id（chatStore.updateSession 写虚拟场景字段用）。
     *  非空才给统筹挂 updateCurtainScene 接缝；单聊/群聊调用方都传当前 target。 */
    targetId?: string
    abortSignal?: AbortSignal
    // Batch 1·群聊带纠偏整轮重排（2026-06-29）：非空时本轮是「据纠偏重判情境重排整轮」——
    // 把纠偏文本作私密导演指令注入统筹 pass，让提调据它**重新判断本轮情境**（不沿用上一轮）并重排所有出场角色方向。
    replanText?: string
    /** 批次2：可见叙事已经落库后的事实核账轮。仍复用提调正式工具与版本/幂等边界，但不把它误当成前置编排。 */
    postRoundFactReconciliation?: boolean
    /** 轮后来源决定任务单：快速角色正文与公开/私密动作的审计边界不同。 */
    postRoundTriggerKind?: PostRoundTriggerKind
    /** 私密动作轮后只做事实维护，禁止把动作意图或观察结果转成角色可见旁白/回复。 */
    suppressAudienceOutputs?: boolean
    // Batch 1·无缝续带：非空时统筹决策流挂回上一轮（纠偏）决策作基线，新一轮决策 merge 在其后（不另起新带）。
    carryOver?: TidiaoDirectorCarryOver | null
  }): Promise<Array<{ characterId: string; mustReply: boolean; probability: number }> | null> {
    const characters = (charStore.characters || []) as Array<{ id: string; name: string }>
    const allCandidates = input.groupMembers
      .map((m) => {
        const id = String(m.characterId || '').trim()
        const char = characters.find((c) => c.id === id)
        return id && char ? { characterId: id, name: String(char.name || id) } : null
      })
      .filter((c): c is { characterId: string; name: string } => c !== null)
    if (allCandidates.length === 0) return null
    // forced = 现役强信号（显式选择 / @ / 名字昵称提及），复用 buildReplyPlan 的 mustReply 结果。
    const forcedCharacterIds = input.postRoundFactReconciliation ? [] : buildReplyPlan({
      userText: input.userText,
      groupMembers: input.groupMembers,
      characters: characters as Array<{ id: string; name: string; nicknames?: string[] }>,
      mentionSelectedChars: mentionSelectedChars.value || [],
      mentionExcludedChars: mentionExcludedChars.value || []
    }).filter((p) => p.mustReply).map((p) => p.characterId)
    const excludedCharacterIds = mentionExcludedChars.value || []
    // 停止=中断保留（2026-07-08）：catch 可达的本轮持久化锚信息（try 内 begin 前赋值·abort 挂起时 flush 落库用；
    // sessionId/anchorMessageId 等都声明在 try 内，catch 不可达，故上提快照）。
    let stopPersistAnchor: { sessionId: string; targetId: string; anchorMessageId: number; speakerName: string } | null = null
    let projectedFallbackIds: string[] = []
    try {
      const agentConfig = readBrainAgentConfigFromList(settingStore.agentModelConfigs)
      const sessionId = activePipelineSessionId || getActiveSessionId(chatStore)
      const tidiaoContext = await loadRenderedAgentContext({
        agentKind: 'tidiao',
        sessionId,
        userText: input.userText,
        anchorMessageId: activePipelineInputMessageId,
        roundCandidateIds: allCandidates.map((candidate) => candidate.characterId),
        forcedCharacterIds
      })
      const orchestrationProjection = requireDirectorOrchestrationProjection(tidiaoContext.bundle)
      const projectionCandidates = input.postRoundFactReconciliation
        ? orchestrationProjection.candidates.filter((candidate) => candidate.presenceState === 'present' && candidate.reason === 'present')
        : orchestrationProjection.candidates
      const projectedCandidateIds = new Set(projectionCandidates.map((candidate) => String(candidate.characterId || '').trim()).filter(Boolean))
      const candidates = allCandidates.filter((candidate) => projectedCandidateIds.has(candidate.characterId))
      const candidateIds = candidates.map((candidate) => candidate.characterId)
      if (!candidateIds.length) {
        throw new Error('统一编排投影判定当前没有可出场角色；已中止本轮，未回退到离场角色。')
      }
      projectedFallbackIds = candidateIds
      const messageList = getCurrentMessageList(chatStore) as Array<Record<string, unknown>>
      // F1·决策 loop：会话级编排器情境清单（提调轮级判情境、下发分镜复用）+ 会话旁白 skill profiles（提调定旁白挑 skill）。
      // scenarios 非空即让群聊导演进入「分步决策工具序列」模式（逐条真流式·提调独占情境/旁白/方向）。
      const directorOrchestratorConfig = await loadEffectiveOrchestratorConfig()
      const directorScenarios = Array.isArray(directorOrchestratorConfig?.scenarios) ? directorOrchestratorConfig.scenarios : []
      const directorNarrationProfilesForLoop = resolvePersonalityNarrationSubagentProfiles(getChatStoreCurrentSession(chatStore) as any)
        .map((profile) => ({ id: profile.id, name: profile.name, triggerDescription: profile.triggerDescription, content: profile.content }))
      // D1 群聊导演 loop：session 级读会话/读投影接缝（与单聊精修/纠偏 loop 同口径），让导演 grounding 到客观事实。
      const chatMessageReadContext = createTidiaoChatMessageReadContext(messageList)
      // 批次E·层4：readMessagePrompt 接进统筹 loop（拍板①=只读历史消息已存 promptLog·不做本轮预览）。
      // 懒取接缝（与纠偏「预取目标一条」不同——统筹面对全历史，逐条预取太贵）：提调真调工具时才按楼层
      // fetch 该消息最新 promptLog（finalPrompt 优先·blocks 拼接兜底），轮内缓存去重；统筹只读不改——
      // editPromptByFloor 恒 null（harness 不注册 editMessagePrompt·改提示词仍归纠偏中策）。
      const directorPromptReadCache = new Map<string, TidiaoMessagePromptRead | null>()
      const directorMessagePromptContext: TidiaoMessagePromptContext = {
        floorTotal: (kind) => chatMessageReadContext.floorTotal(kind),
        readPromptByFloor: (kind, index) => {
          const cacheKey = `${kind}:${index}`
          const cached = directorPromptReadCache.get(cacheKey)
          if (cached !== undefined) return cached
          return (async () => {
            const read = chatMessageReadContext.readByFloor(kind, index)
            const promptMessageId = Number(read?.messageId || 0)
            if (!read?.matched || !promptMessageId || !sessionId) {
              directorPromptReadCache.set(cacheKey, null)
              return null
            }
            let promptText = ''
            try {
              const log = await fetchLatestChatPromptLogBySessionMessageId(sessionId, promptMessageId)
              const blocks = Array.isArray(log?.promptBlocks) ? log!.promptBlocks : []
              promptText = (String(log?.finalPrompt || '').trim()
                || blocks.map((b: any) => String(b?.content || '')).filter((c: string) => c.trim()).join('\n\n')).trim()
            } catch (error) {
              console.warn('统筹读消息提示词失败（不阻断·按无提示词处理）:', error)
            }
            const value: TidiaoMessagePromptRead | null = promptText
              ? {
                ref: read.ref, kind, index,
                total: chatMessageReadContext.floorTotal(kind),
                matched: true, messageId: promptMessageId,
                speakerName: read.speakerName, promptText
              }
              : null
            directorPromptReadCache.set(cacheKey, value)
            return value
          })()
        },
        editPromptByFloor: () => null,
        collectPromptEdits: () => []
      }
      // 一次取回观察数据派生两图：投影源图（喂 projectionContext）+ 每条消息 hidden 角色集（喂层3并集过滤·增量5.5）。
      const directorObservations = await loadDirectorProjectionObservations(sessionId)
      const projectionContext = createTidiaoMessageProjectionContext(messageList, directorObservations.projectionMap)
      // 3c：与注入侧读池共用同一锚解析（resolveActiveRoundAnchorId），保证填池/读池缓存 key 一致。
      const anchorMessageId = resolveActiveRoundAnchorId()
      // 批次4-投影 B（directorProjectionContext ON·默认）：投影态最近上下文（小窗）随 activeRoundDirector 下发给各分镜，
      //   替代其独立「判情境上下文」；OFF（真机对照）=空串、分镜走原 compressedContext。层3 recentContext 不再用它。
      const directorProjectionRecentContext = directorProjectionContext
        ? renderDirectorProjectionRecentContext(messageList, projectionContext)
        : ''
      // E2 实时决策流：群聊导演 loop 起点即建立轮级载体（一轮一条，挂在用户消息与角色正文之间），
      // grounding 期就让新带 TidiaoDirectorStreamBand 边想边吐（与单聊 runSingleChat 同范式）。
      // speakerName=领衔角色名（forced 第一个、否则首个候选）仅 loop 期 band 头部显示用；
      // 历史复原说话人取快照首条角色镜 label（自包含于快照），不依赖此处。
      const directorStreamRunId = activePipelineTidiaoRunId
      // anchorMessageId 已上提到层3 渲染前（批次J1·同一锚两用），见上方注释。
      const leadingCharacterId = forcedCharacterIds[0] || candidateIds[0] || ''
      const leadingSpeakerName = candidates.find((c) => c.characterId === leadingCharacterId)?.name || ''
      // 停止=中断保留：把本轮持久化锚快照到 catch 可达变量（abort 挂起时按失败路径同参 flush 落库）。
      stopPersistAnchor = { sessionId, targetId: leadingCharacterId || candidateIds[0] || '', anchorMessageId, speakerName: leadingSpeakerName }
      // Batch 1·群聊带纠偏整轮重排：carryOver 非空时挂回上一轮（纠偏）决策作基线，新一轮统筹/重排决策 merge 在其后（同带续跑·不另起）。
      beginTidiaoDirectorStreamRound({ runId: directorStreamRunId, sessionId, anchorMessageId, speakerName: leadingSpeakerName, ...(input.carryOver ? { carryOver: input.carryOver } : {}) })
      // 资料池 grounding 与按需落池（2026-06-30 改纯按需）：
      //   - 读侧：从会话池取 getDirectorVisiblePools 渲染成 grounding 块注入提调 messages，供据各角色已掌握资料定方向
      //     （buildGroupDirectorMessages 据块非空追加方向护栏 GROUP_DIRECTOR_POOL_GUARD_PROTOCOL）。
      //   - 写侧（融入计划批次3·2026-07-10 起走采风）：落池接缝绑定会话 pools + 缓存——统筹本体三件套/recallCharacterBrain
      //     已下架，接缝只进 buildCaifengDispatchSeam：采风查证命中即追加进会话池并 save（世界料落世界池、角色料落该角色池），
      //     本轮后续注入（角色生成 3c / 旁白）与统筹后续轮即可见。范围受限铁律不变。
      // 批次5 收编：资料池 grounding 块 + 按需落池接缝抽命名装配函数（deps 深绑 pipeline 闭包·就地集中放置）。
      const directorPoolSeam = buildDirectorRecallPoolSeam(sessionId, anchorMessageId, candidates, candidateIds)
      const directorPoolsBlock = directorPoolSeam.poolVisibilityBlock
      const recallPoolAppendSeam = directorPoolSeam.recallPoolAppend
      // 提调时间锚（2026-06-29 修）：开局必须以「现在（用户发这轮的时刻）」为时间真值喂给统筹，否则提调没有
      //   显式当前时间，会从最近对话里上一条角色消息的结束环境（可能是很久以前，如凌晨2点）误判成当前时间。
      //   批次O：抽成 readDirectorSceneContextNow（统筹/纠偏/精修三入口共用·联动能力）。
      const directorSceneContext = readDirectorSceneContextNow()
      // 串行压缩批A（2026-07-13）：层2【上轮剧本摘要】——提调判 deviation 的依据，轮开局冻结一份传入
      // （分段开局定死·轮内编剧修订不回写本块）。
      // 状态工具仍需要业务接缝；给模型的常驻状态上下文已改由 tidiao 统一配方提供，不再额外渲染 Markdown 双轨。
      const statusParticipantIdByCharacterId = new Map(
        normalizeChatSessionCharacterParticipants(getChatStoreCurrentSession(chatStore))
          .map((participant) => [String(participant.characterId || ''), String(participant.participantId || '')])
      )
      const directorStatusSystemSeam = buildTidiaoStatusSystemSeam(
        sessionId,
        candidates.map((c) => ({
          id: String(c.characterId || ''),
          participantId: statusParticipantIdByCharacterId.get(String(c.characterId || '')) || '',
          name: String(c.name || '')
        })),
        {
          worldId: orchestrationProjection.scope.worldId,
          sourceDirectorRunId: directorStreamRunId,
          sourceMessageId: String(anchorMessageId)
        }
      )
      let directorCurtainCommandSequence = 0
      // D2 知识隔离：三件套接缝只查文档库（世界本源）。批次3（2026-07-10）起统筹本体不再直挂——本接缝仅供采风工具集。
      const directorRetrievalContext = buildTidiaoRetrievalContext?.('', { docLibraryOnly: true, sessionId }) || null
      // 采风派遣接缝（融入计划批次2·2026-07-10）：取证接缝与统筹同一份（读原文/投影/三件套/大脑召回/状态栏·
      // 命中落池副作用共享——采风查回的料进会话池，统筹与后续轮都可见）；模型=balanced 校书档小 loop。
      const caifengResearchSeam = buildCaifengDispatchSeam({
        sessionId,
        candidates,
        chatMessageReadContext,
        projectionContext,
        retrievalContext: directorRetrievalContext,
        recallPoolAppend: recallPoolAppendSeam,
        statusSystem: directorStatusSystemSeam,
        agentConfig,
        ...(input.abortSignal ? { abortSignal: input.abortSignal } : {})
      })
      // 绘舆派遣接缝（地图系统批5）：取证接缝与采风同一份（绘舆读对话/状态栏核对剧情事实·命中落池副作用共享）。
      const huiyuMapWorkSeam = buildHuiyuDispatchSeam({
        sessionId,
        candidates,
        chatMessageReadContext,
        projectionContext,
        retrievalContext: directorRetrievalContext,
        recallPoolAppend: recallPoolAppendSeam,
        statusSystem: directorStatusSystemSeam,
        agentConfig,
        // 绘舆确认卡续派入场券（人在环上通道统一批C）：本轮锚用户消息 id，重派时重建大脑召回落池接缝用。
        anchorMessageId,
        ...(input.abortSignal ? { abortSignal: input.abortSignal } : {})
      })
      // 建状态栏 scope 确认接缝（批次B·非阻塞）：登记闭包=防重（已有卡）/拒绝记忆检查 + 写全局 pending 弹卡；
      // 统筹拿到成功回执后继续排戏。确认/取消的后续动作在 resumeStatusScopeOrchestration（派造册/记拒绝）。
      const statusScopeSeam = {
        requestScopeConfirm: (request: XingyiStatusScopeRequest): string | null => {
          if (getTidiaoStatusScopePending()) {
            return '已有一张建栏范围确认卡在等用户处理，先不要再发新的确认请求——继续完成本轮编排即可。'
          }
          const candidateNameByLower = new Map(candidates.map((candidate) => [candidate.name.trim().toLowerCase(), candidate.name]))
          const rawBatchHints = Array.isArray(request.characterHints)
            ? [...new Set(request.characterHints.map((name) => String(name || '').trim()).filter(Boolean))]
            : []
          const unknownBatchHints = rawBatchHints.filter((name) => !candidateNameByLower.has(name.toLowerCase()))
          if (unknownBatchHints.length) return `confirmStatusScope 的 characterHints 含本轮候选外角色：${unknownBatchHints.join('、')}。请按候选名单修正后整批重发。`
          const batchHints = rawBatchHints.map((name) => candidateNameByLower.get(name.toLowerCase())!).filter(Boolean)
          // 兼容旧单卡：没有 characterHints 时保留 characterHint 可空的原请求，让用户在卡上自行选择宿主。
          const requestedScopes: XingyiStatusScopeRequest[] = batchHints.length
            ? batchHints.map((characterHint) => ({ purpose: request.purpose, characterHint, ...(request.sessionHint ? { sessionHint: request.sessionHint } : {}) }))
            : [{ purpose: request.purpose, ...(request.characterHint ? { characterHint: request.characterHint } : {}), ...(request.sessionHint ? { sessionHint: request.sessionHint } : {}) }]
          const requests = requestedScopes
            .filter((item) => !isTidiaoStatusScopeDeclined(sessionId, item))
          if (!requests.length) {
            return '这些角色的造册范围都已被用户拒绝过，本会话内不要重复请求，继续完成本轮编排即可。'
          }
          setTidiaoStatusScopePending({
            request: requests[0],
            requests,
            sessionId,
            // 请求发起轮的锚：供造册的大脑召回落池接缝用（buildDirectorRecallPoolSeam 要求 >0 入场券）。
            anchorMessageId,
            characterOptions: buildTidiaoStatusScopeCharacterOptions(candidates, statusParticipantIdByCharacterId)
          })
          return null
        }
      }
      // 叙事种子批次2：在提调启动前由服务端按会话正式世界/帷幕/参与者做确定性筛选。
      // 无世界恒为空且不发请求；有世界时取料失败显式中止本轮，禁止静默退回旧路线或无种子假成功。
      const directorWorldContext = projectChatSessionWorldAgentContext(readSessionById(sessionId))
      const relevantNarrativeSeeds = directorWorldContext.mounted && directorWorldContext.world
        ? {
            worldId: directorWorldContext.world.id,
            sessionId,
            items: orchestrationProjection.relevantNarrativeSeeds.map((entry) => entry.value as any),
            selectedAt: new Date().toISOString(),
            deterministic: true,
            scannedCount: orchestrationProjection.relevantNarrativeSeeds.length
          }
        : null
      const narrativeSeedsBlock = relevantNarrativeSeeds
        ? renderRelevantNarrativeSeedsBlock(relevantNarrativeSeeds)
        : ''
      const narrativeSeedReadContext = relevantNarrativeSeeds?.items.length && directorWorldContext.world
        ? {
            allowedSeedIds: new Set(relevantNarrativeSeeds.items.map((item) => item.id)),
            readSeed: (seedId: string) => fetchNarrativeSeedDetail(directorWorldContext.world!.id, seedId)
          }
        : null
      let directorNarrativeSeedCommandSequence = 0
      const narrativeSeedWriteContext = directorWorldContext.world
        ? {
            worldId: directorWorldContext.world.id,
            sessionId,
            directorRunId: directorStreamRunId,
            readSeed: (seedId: string) => fetchNarrativeSeedDetail(directorWorldContext.world!.id, seedId),
            createSeed: async (payload: Record<string, unknown>) => {
              directorNarrativeSeedCommandSequence += 1
              const seedId = `nseed_${directorStreamRunId.replace(/[^a-zA-Z0-9_-]/g, '_')}_${directorNarrativeSeedCommandSequence}`
              await executeOrchestrationCommands(sessionId, [{
                command: 'createNarrativeSeed', sessionId, worldId: directorWorldContext.world!.id,
                targetRef: { kind: 'narrative_seed', seedId }, expectedVersion: 0,
                idempotencyKey: `director:${directorStreamRunId}:seed:${directorNarrativeSeedCommandSequence}`,
                source: {
                  sourceMessageId: String(anchorMessageId), sourceDirectorRunId: directorStreamRunId,
                  evidenceSummary: String(payload.evidenceSummary || '提调依据本轮剧情证据创建叙事种子')
                },
                payload
              }])
              return fetchNarrativeSeedDetail(directorWorldContext.world!.id, seedId)
            },
            updateSeed: async (seedId: string, payload: Record<string, unknown>) => {
              directorNarrativeSeedCommandSequence += 1
              const current = await fetchNarrativeSeedDetail(directorWorldContext.world!.id, seedId)
              await executeOrchestrationCommands(sessionId, [{
                command: 'updateNarrativeSeed', sessionId, worldId: directorWorldContext.world!.id,
                targetRef: { kind: 'narrative_seed', seedId }, expectedVersion: Number(payload.expectedVersion ?? current.version),
                idempotencyKey: `director:${directorStreamRunId}:seed:${directorNarrativeSeedCommandSequence}`,
                source: {
                  sourceMessageId: String(anchorMessageId), sourceDirectorRunId: directorStreamRunId,
                  evidenceSummary: String(payload.evidenceSummary || '提调依据本轮剧情证据更新叙事种子')
                },
                payload
              }])
              return fetchNarrativeSeedDetail(directorWorldContext.world!.id, seedId)
            }
          }
        : null
      const tidiaoContextBlock = tidiaoContext.text
      const { script, narrationCalls: directorNarrationCalls } = await runGroupDirectorHarness({
        sessionId,
        directorRunId: directorStreamRunId,
        passInput: {
          // 点C·提调层5（批4）：本轮附件一律 caption 文字（formatAttachmentNote），不带原生图——
          // 统筹不需要像素，只需要知道「用户这轮带了什么图、图里大概是什么」。空附件时note为空串零变化，
          // activePipelineUserAttachments 对 sendText 之外的入口（重放/纠偏等）已在各自起点清零。
          userText: `${input.userText}${formatAttachmentNote(activePipelineUserAttachments)}`,
          candidates,
          forcedCharacterIds,
          excludedCharacterIds,
          // 当前场景（时间/地点/天气，锚到「现在」=用户发这轮的时刻）：让提调判情境时以现在为时间真值，
          //   不被最近对话里上一条角色消息的旧结束环境带偏（详见上方 directorSceneContext 注释）。
          sceneContext: directorSceneContext || undefined,
          // 用户私密提调指令（只管本轮）：非空时注入群聊统筹，只给提调看、不泄露到剧情产出。
          // Batch 1·群聊带纠偏整轮重排：replanText 非空时前置一条「重判情境重排」私密指令，让提调据纠偏重新判情境、推翻重排整轮（不沿用上一轮情境/方向）。
          directorDirectives: input.postRoundFactReconciliation
            ? [
                buildPostRoundDirectorDirective({
                  triggerKind: input.postRoundTriggerKind === 'focused_action' ? 'focused_action' : 'fast_reply',
                  suppressAudienceOutputs: input.suppressAudienceOutputs === true
                }),
                ...activePipelineDirectorDirectives
              ]
            : String(input.replanText || '').trim()
              ? [`【本轮是一次纠偏·重判情境重排】用户对刚才这一轮的整体编排提出纠偏意见：「${String(input.replanText).trim()}」。请据此重新判断本轮情境（不要沿用上一轮的情境判断），并重新编排所有出场角色这一轮的发言方向。`, ...activePipelineDirectorDirectives]
              : activePipelineDirectorDirectives
        },
        candidateIds,
        agentContextBlock: tidiaoContextBlock,
        ...(narrativeSeedReadContext ? { narrativeSeedReadContext } : {}),
        ...(narrativeSeedWriteContext ? { narrativeSeedWriteContext } : {}),
        readyToTriggerSeedIds: (relevantNarrativeSeeds?.items || [])
          .filter((item) => String(item.status || '').trim() === 'ready_to_trigger')
          .map((item) => String(item.id || '').trim())
          .filter(Boolean),
        readyToTriggerCurrentTimeBySeedId: Object.fromEntries(
          (relevantNarrativeSeeds?.items || [])
            .filter((item) => String(item.status || '').trim() === 'ready_to_trigger')
            .map((item) => [String(item.id || '').trim(), String(item.currentCurtainTime || '').trim()])
            .filter(([seedId]) => Boolean(seedId))
        ),
        postRoundSupplement: input.postRoundFactReconciliation === true,
        chatMessageReadContext,
        // 批次E·层4：读消息提示词懒取接缝（只读·历史 promptLog），harness 据此注册 readMessagePrompt。
        messagePromptContext: directorMessagePromptContext,
        // 剧本（2026-07-06·编剧 subagent；2026-07-10 批次3 升真 loop）：开局读会话存量剧本（编剧私有状态·
        // 整本不进提调 prompt）+ 编剧修订即写回；consultScriptwriter=runScriptwriterLoop（smart 掌阁档小 loop·
        // 取证工具集与采风同一份料复用 buildCaifengToolset——编剧编长线可自主搜投影/读原文/查设定/读状态栏，
        // 落池副作用共享），失败由 consultScript 工具人话报错不阻断。接缝构造共用 buildScriptwriterSeam（纠偏入口同用·联动能力）。
        scriptSeam: buildScriptwriterSeam({
          sessionId,
          originRunId: directorStreamRunId,
          agentConfig,
          research: {
            sessionId,
            candidates,
            chatMessageReadContext,
            projectionContext,
            retrievalContext: directorRetrievalContext,
            recallPoolAppend: recallPoolAppendSeam,
            statusSystem: directorStatusSystemSeam
          }
        }),
        // 状态系统（积木骨架计划批次5·2026-07-08 用户拍板「状态栏主写手=提调」）：剧情状态变化随轮落账
        //（readStatusPanels/updateStatusPanel·纲领步骤 4c）；characterOptions=本轮候选（宿主名渲染）。
        statusSystem: directorStatusSystemSeam,
        // 建状态栏 scope 确认（批次B·非阻塞）：接缝在位即注册 confirmStatusScope——弹卡不打断统筹，
        // 建栏由确认后的「造册」子agent后台完成（防重/拒绝检查在接缝闭包内）。
        scopeSeam: statusScopeSeam,
        // 状态系统融入批次1：当前对话状态栏 MD 常驻块（非空注入层2 与层3 之间·空=无状态栏/取数失败不注入）。
        projectionContext,
        // 采风钻取接缝（融入计划批次2/批次3）：决策模式注册 dispatchResearch（同轮多发整批并发）；批次3 起统筹重取料
        // 唯一路径=派采风（三件套/recallCharacterBrain 接缝已从 harness 摘除·只进上方 buildCaifengDispatchSeam），
        // 纲领步骤1「知识盘点」+知识钻取协议引导何时派。
        researchSeam: caifengResearchSeam,
        // 绘舆作图接缝（地图系统批5）：决策模式注册 dispatchMapWork——剧情地图信号（角色移动/新地点/进迷雾区）
        // 派绘舆更新舆图并带回格局摘要；会话未挂世界的判定在接缝闭包内（回执如实说明）。
        mapWorkSeam: huiyuMapWorkSeam,
        // F1·决策 loop：情境清单非空即进分步决策工具序列；旁白 profiles 供提调定旁白挑 skill。
        scenarios: directorScenarios,
        narrationProfiles: directorNarrationProfilesForLoop,
        // 3b-3·提调可见各池（U4 转正常开·池非空时注入；空串=不注入）。
        poolVisibilityBlock: directorPoolsBlock || undefined,
        // 倾向迁移批次1（2026-07-10）：统筹不再吃编排倾向——剧情倾向第一消费者=编剧
        // （buildSessionScriptwriterSeam 接缝注入）；replyPlan 分镜层/纠偏/精修三处执行层保留。
        // 批次 C·上一轮情境（并进提调主判）：非空即注入决策 loop user 侧（纠偏路径上为空·不沿用上一轮）。
        // 批次4-投影 A：directorProjectionContext ON 时 grounding 协议/决策 step1 切「默认读投影、原文仅按需」（关则不变）。
        projectionFirst: directorProjectionContext,
        // 批次D·层5 动态提示词（directorPromptRebuild 默认 ON）：loop 每 turn 用「恒定分段+当轮操作日志」重建 prompt；
        //   DevTools 显式 OFF＝回 append-only 原样（真机对照 hatch·__langhuanChatFlags.directorPromptRebuild(false)）。
        promptRebuild: directorPromptRebuild,
        // 帷幕校准接缝（2026-07-04 用户拍板）：统筹判情境顺手校准帷幕三值（剧情时空跳变如「穿越」此前没人管）。
        // 复用纠偏同一写入口 applyPersonalityCurtainSceneUpdate（写会话虚拟场景字段·联动能力：那边口径改这里同步）。
        ...(String(input.targetId || '').trim() ? {
          updateCurtainScene: (toolCall: ReplyPlanCurtainSceneUpdateToolCall) => {
            directorCurtainCommandSequence += 1
            return applyPersonalityCurtainSceneUpdate({
              targetId: String(input.targetId), sessionId, toolCall,
              orchestration: {
                worldId: orchestrationProjection.scope.worldId,
                expectedVersion: orchestrationProjection.curtain.version,
                idempotencyKey: `director:${directorStreamRunId}:curtain:${directorCurtainCommandSequence}`,
                sourceDirectorRunId: directorStreamRunId,
                sourceMessageId: String(anchorMessageId)
              }
            })
          }
        } : {}),
        // E2：loop 每步快照实时刷新轮级载体（与单聊 emitDirectorStream 同口径，runId 不匹配的迟到快照自动丢弃）。
        onDirectorStream: (stream) => {
          updateTidiaoDirectorStreamRound(directorStreamRunId, stream)
          // 批次3·统一锚到用户消息（2026-06-22）：群聊导演 pass 漏接补齐——决策流每更新就节流增量持久化，
          // 锚到该轮用户消息（anchorMessageId），刷新/崩溃也保住已做的决策，根治「群聊首发刷新后提调带消失」。
          void persistDirectorStreamRoundIncremental({
            runId: directorStreamRunId, sessionId, targetId: leadingCharacterId || candidateIds[0] || '',
            anchorRoundMessageId: anchorMessageId, speakerName: leadingSpeakerName,
            snapshot: captureTidiaoDirectorStreamSnapshot(directorStreamRunId), triggerType: 'normal_send'
          })
        },
        signal: input.abortSignal,
        // 切原生工具调用（批次5 收编：统筹/纠偏/精修三处同一件 buildDeferredLoopModelCall）。
        callOrchestrator: buildDeferredLoopModelCall({
          agentConfig, maxTokens: 900, temperature: 0.4,
          logLabel: 'group-director-pass', placeType: 'group',
          profileId: input.postRoundFactReconciliation ? 'tidiao.post-round' : 'tidiao.director-round',
          harnessRunId: directorStreamRunId,
          promptRebuild: directorPromptRebuild,
          ...(input.abortSignal ? { abortSignal: input.abortSignal } : {})
        })
      })
      // 批次B（2026-07-10）：批次4 的 scope 挂起块已退役——confirmStatusScope 非阻塞化（弹卡经 scopeSeam
      // 写 pending·统筹照常收尾出戏），确认后建栏走 resumeStatusScopeOrchestration 派「造册」后台完成。
      // 出场顺序永远尊重 forced（点名/@）：即便统筹模型输出无效（script=null），forced 仍要驱动顺序，
      // 与旧 cast pass 行为一致（不因统筹失败丢掉强信号顺序）。
      const mergedCast = mergeDirectorCast(forcedCharacterIds, script?.cast || [], excludedCharacterIds, candidateIds)
      if (mergedCast.length === 0 && !(input.postRoundFactReconciliation && script)) {
        // 无人出场：清掉本轮导演载体，回退兜底（不留半截决策流带停屏）。
        clearTidiaoDirectorStreamRound(directorStreamRunId)
        // 批次3：已写的 checkpoint 降权，防刷新后空轮决策流复活。
        demoteDirectorStreamPersist(directorStreamRunId)
        return null
      }
      // 仅当解析出真实统筹剧本时才填 activeRoundDirector（供方向真注入 + 编排带一轮一条展示）；
      // 否则只返回顺序、保持 activeRoundDirector 为空 → 编排带回退 per-speaker 聚合、不注入假方向。
      if (script) {
        const nameById = new Map(candidates.map((c) => [c.characterId, c.name]))
        // E2：捕获 loop 最终快照（决策流+并排分镜，含读楼层/读投影/取料工具条），种进第一条成员 trace 走新带。
        const directorStreamSnapshot = captureTidiaoDirectorStreamSnapshot(directorStreamRunId)
        activeRoundDirector = {
          script: {
            situation: script.situation,
            // F2·决策 loop 下发情境：提调轮级判定的情境 code+body 透传到 activeRoundDirector.script，
            // 供 per-speaker 分镜作 providedScenario 下发、跳过各自判情境；旧一次性 JSON 路径无此源时缺省。
            ...(script.scenarioCode ? { scenarioCode: script.scenarioCode } : {}),
            ...(script.scenarioBody ? { scenarioBody: script.scenarioBody } : {}),
            narration: script.narration,
            cast: mergedCast.map((e) => ({ name: nameById.get(e.characterId) || e.characterId, direction: e.direction })),
            thoughts: script.thoughts,
            // D1 方案 B（仅旧 band 兼容）：旧 band retrieval 块；E2 后新带取料统一进决策流 tool 工具条，本字段仅兜底。
            retrieval: script.retrieval || []
          },
          castDirections: new Map(mergedCast.map((e) => [e.characterId, e.direction])),
          // 批B·人格模型直通道：只装提调本轮判 planMode='direct' 且带非空 plan 的角色（personality/缺省不进表）。
          castPlans: new Map(
            mergedCast
              .filter((e) => e.planMode === 'direct' && String(e.plan || '').trim())
              .map((e) => [e.characterId, { planMode: 'direct' as const, plan: String(e.plan).trim() }])
          ),
          seeded: false,
          directorStream: directorStreamSnapshot,
          // F3·旁白彻底归提调：提调 loop 收集的轮级旁白调用下发到管线，首发言者一次性据此生成旁白正文（want=false 时为空、真无旁白）。
          narrationCalls: Array.isArray(directorNarrationCalls) ? directorNarrationCalls : [],
          narrationStarted: false,
          // 旁白穿插：after_speaker/round_end 锚点子集进穿插待生成队列（round_start 子集仍走首发言者一次性起跑）。
          narrationInterleavedPending: (Array.isArray(directorNarrationCalls) ? directorNarrationCalls : [])
            .filter((call) => !isRoundStartNarrationCall(call)),
          narrationInterleavedCompletions: [],
          narrationPrefetchHolding: new Map(),
          // 批次4-投影 B：把提调统筹时用的投影态上下文随轮级载体下发，供各分镜替代独立「判情境上下文」（开关 ON 且非空时）。
          ...(directorProjectionContext && directorProjectionRecentContext ? { downstreamProjectionContext: directorProjectionRecentContext } : {})
        }
        // 批次5·在场双阶段：finishRound 只登记预计登场事件，不改当前事实；真正的 present 必须等角色消息落库。
        const selectedCharacterIds = new Set(mergedCast.map((item) => item.characterId))
        const presenceByParticipantId = new Map(orchestrationProjection.presences.map((item) => [item.participantId, item]))
        const proposedCandidates = orchestrationProjection.candidates.filter((candidate) => (
          candidate.characterId
          && selectedCharacterIds.has(candidate.characterId)
          && candidate.presenceState !== 'present'
        ))
        let presenceProposals: NonNullable<typeof activeNarrativeImpactLifecycle>['presenceProposals'] = []
        if (proposedCandidates.length) {
          try {
            const proposalResult = await executeOrchestrationCommands(sessionId, proposedCandidates.map((candidate) => ({
              command: 'proposePresenceTransition',
              sessionId,
              worldId: orchestrationProjection.scope.worldId,
              targetRef: { kind: 'session_character', participantId: candidate.participantId },
              expectedVersion: Number(presenceByParticipantId.get(candidate.participantId)?.version || 0),
              idempotencyKey: `presence-proposal:${directorStreamRunId}:${candidate.participantId}`,
              source: {
                sourceMessageId: String(anchorMessageId),
                sourceDirectorRunId: directorStreamRunId,
                evidenceSummary: 'finishRound 已把角色列入本轮分镜；当前仅登记预计登场，尚未发生'
              },
              payload: { toState: 'present' }
            })))
            presenceProposals = proposalResult.operations.flatMap((operation) => {
              if (operation.targetRef?.kind !== 'session_character' || !operation.resultRef) return []
              const participantId = operation.targetRef.participantId
              const candidate = proposedCandidates.find((item) => item.participantId === participantId)
              if (!candidate) return []
              const localName = candidates.find((item) => item.characterId === candidate.characterId)?.name || ''
              return [{
                participantId: candidate.participantId,
                expectedVersion: operation.version,
                proposalEventId: operation.resultRef,
                speakerNames: [...new Set([candidate.displayName || '', localName].map((name) => name.trim().toLocaleLowerCase()).filter(Boolean))]
              }]
            })
          } catch (error) {
            console.warn('[orchestrationPresence] 预计登场登记失败；本轮不会擅自提交在场事实:', error)
          }
        }
        const committedChangeTools = new Set(['updateCurtainScene', 'updateStatusPanel', 'saveStatusPanel'])
        const committedChanges = (directorStreamSnapshot?.decisions || [])
          .flatMap((decision) => {
            const tool = decision.tool
            if (!tool || tool.status !== 'done' || !committedChangeTools.has(tool.tool)) return []
            const result = String(tool.resultPreview || '').trim()
            return result ? [`${tool.label || tool.tool}：${result}`] : []
          })
          .join('\n')
        activeNarrativeImpactLifecycle = {
          worldId: orchestrationProjection.scope.worldId,
          sessionId,
          directorRunId: directorStreamRunId,
          anchorMessageId,
          relevantSeedsBlock: narrativeSeedsBlock,
          committedChanges,
          allowedSeedIds: new Set(),
          predicted: Promise.resolve([]),
          presenceProposals
        }
        // 叙事种子批次4·阶段一：finishRound 已产出完整统筹，此刻只异步记录 predicted_effect。
        // promise 被保存但这里绝不 await，角色与旁白马上继续；预测失败也不降级成“已发生事实”。
        if (directorWorldContext.world && relevantNarrativeSeeds?.items.length) {
          const impactCallModel = buildDeferredLoopModelCall({
            agentConfig,
            taskId: 'scriptwriterConsult',
            maxTokens: 1400,
            temperature: 0.2,
            logLabel: 'narrative-seed-impact-prediction',
            placeType: 'group'
          })
          const allowedSeedIds = new Set(relevantNarrativeSeeds.items.map((item) => item.id))
          const predicted = predictNarrativeSeedImpacts({
            sessionId,
            directorRunId: directorStreamRunId,
            orchestration: JSON.stringify({ script, narrationCalls: directorNarrationCalls }),
            relevantSeeds: narrativeSeedsBlock,
            callModel: impactCallModel
          }).then(async (items) => {
            const accepted: NarrativeSeedPredictedImpact[] = []
            for (const candidate of items) {
              if (candidate.kind === 'new') {
                const sourceSeedIds = candidate.sourceSeedIds.filter((seedId) => allowedSeedIds.has(seedId))
                if (!sourceSeedIds.length) continue
                // 新种子候选在预测阶段只留在本轮内存，不创建正式 seed；没有实际落库消息就没有事实。
                // 后续工作台若要采纳，必须走带证据的 createNarrativeSeed 统一命令。
                continue
              }
              const item = candidate
              if (!allowedSeedIds.has(item.seedId)) continue
              try {
                await recordNarrativeSeedImpact(directorWorldContext.world!.id, item.seedId, {
                  eventType: 'predicted_effect',
                  effectSummary: item.effectSummary,
                  evidenceSummary: '提调 finishRound 后的预计影响；尚未作为发生事实提交',
                  sourceSessionId: sessionId,
                  sourceMessageId: anchorMessageId,
                  sourceDirectorRunId: directorStreamRunId,
                  sourceAgentRunId: `${directorStreamRunId}:predict`,
                  idempotencyKey: `prediction:${directorStreamRunId}:${item.seedId}`
                })
                accepted.push(item)
              } catch (error) {
                console.warn(`[narrativeSeedImpact] 预计影响写账失败（${item.seedId}，不阻断）:`, error)
              }
            }
            return accepted
          }).catch((error) => {
            console.warn('[narrativeSeedImpact] 预计影响分析失败（不阻断角色与旁白）:', error)
            return []
          })
          activeNarrativeImpactLifecycle = {
            ...activeNarrativeImpactLifecycle,
            allowedSeedIds,
            predicted,
            callModel: impactCallModel
          }
        }
        // 批次3·统一锚到用户消息：群聊导演 pass 成功 → flush 最终快照锚到用户消息 + 收 attempt，刷新后历史复原走新带。
        await persistDirectorStreamRoundIncremental({
          runId: directorStreamRunId, sessionId, targetId: leadingCharacterId || candidateIds[0] || '',
          anchorRoundMessageId: anchorMessageId, speakerName: leadingSpeakerName,
          snapshot: directorStreamSnapshot, flush: true, triggerType: 'normal_send'
        })
        finalizeDirectorStreamPersist(directorStreamRunId)
      } else {
        // 解析不到合法剧本（harness 已 acc.fail 标失败态）：带停在 failed 态显示原因，绝不在 pipeline 仍在跑时
        // 清空让带凭空消失（修问题②·用户 2026-06-30 拍板「失败也不清带」）——清带会让降级续跑期间带整个不见、
        // 叠加卡死表现成「带消失 + 空角色占位 + 停止键长亮」。下一轮起点的 clearTidiaoDirectorStreamRound() 会自然收掉。
        markTidiaoDirectorStreamRoundFailed(directorStreamRunId, '提调未能产出有效编排')
        // 批次3：已写的 checkpoint 降权，防刷新后失败/无剧本决策流复活（带只活在本会话当下、刷新归零）。
        demoteDirectorStreamPersist(directorStreamRunId)
      }
      return directorCastToReplyOrder(mergedCast)
    } catch (error) {
      if (!isAbortError(error)) console.warn('提调统筹 pass 失败，将只在统一投影候选内确定性收束:', error)
      activeRoundDirector = null
      if (isAbortError(error)) {
        // 停止=中断保留（2026-07-08 用户拍板）：有决策内容→带转 correcting 挂起（半成品原地保留·flush 落库·
        // 刷新可复原·可「继续」接续）；无内容→旧口径清带降权。
        const stoppedSnapshot = captureTidiaoDirectorStreamSnapshot(activePipelineTidiaoRunId)
        if (stoppedSnapshot && stopPersistAnchor) {
          markTidiaoDirectorStreamRoundCorrecting(activePipelineTidiaoRunId, '')
          await persistDirectorStreamRoundIncremental({
            runId: activePipelineTidiaoRunId, sessionId: stopPersistAnchor.sessionId, targetId: stopPersistAnchor.targetId,
            anchorRoundMessageId: stopPersistAnchor.anchorMessageId, speakerName: stopPersistAnchor.speakerName,
            snapshot: captureTidiaoDirectorStreamSnapshot(activePipelineTidiaoRunId), flush: true, triggerType: 'normal_send'
          })
          finalizeDirectorStreamPersist(activePipelineTidiaoRunId)
        } else {
          clearTidiaoDirectorStreamRound(activePipelineTidiaoRunId)
          demoteDirectorStreamPersist(activePipelineTidiaoRunId)
        }
        return null
      }
      // 真失败（非取消）：带停在 failed 态显示原因，绝不在 pipeline 仍在跑时清空让带凭空消失
      //（修问题②·用户 2026-06-30 拍板「失败也不清带」）。下一轮起点的 clear 会自然收掉。
      markTidiaoDirectorStreamRoundFailed(activePipelineTidiaoRunId, error instanceof Error ? error.message : '提调统筹失败')
      // 批次3：已写的 checkpoint 降权，防刷新后异常的群聊决策流复活（群聊 pass 失败带只活在会话当下，既定行为）。
      demoteDirectorStreamPersist(activePipelineTidiaoRunId)
      const message = error instanceof Error ? error.message : String(error || '')
      if (!projectedFallbackIds.length || message.includes('提调统一上下文')) throw error
      const projectedForcedIds = forcedCharacterIds.filter((id) => projectedFallbackIds.includes(id))
      return castIdsToReplyOrder(buildDeterministicCastFallback(projectedFallbackIds, projectedForcedIds, excludedCharacterIds))
    }
  }

  async function runGroupChat(target: string, userText: string, runId: number, abortSignal?: AbortSignal, options: { replay?: boolean; replanText?: string; carryOver?: TidiaoDirectorCarryOver | null } = {}) {
    const session = getChatStoreCurrentSession(chatStore) as any
    const checkpointSessionId = activePipelineSessionId || getActiveSessionId(chatStore)
    const checkpointAnchorMessageId = activePipelineInputMessageId > 0
      ? activePipelineInputMessageId
      : Number([...getCurrentMessageList(chatStore)].reverse().find((message: any) => message?.role === 'user')?.id || 0)
    if (checkpointSessionId && checkpointAnchorMessageId > 0
      && (activeReplySituationCheckpointLifecycle?.runId !== runId
        || activeReplySituationCheckpointLifecycle.sessionId !== checkpointSessionId)) {
      await hydrateSessionOrchestrationMaterials(checkpointSessionId)
      startReplySituationCheckpointLifecycle({
        runId,
        sessionId: checkpointSessionId,
        anchorMessageId: checkpointAnchorMessageId
      })
    }
    const sessionMembers = normalizeSessionParticipantMembers(session)
    const group = (charStore.groups || []).find((g) => g.id === target || `group_${g.id}` === target)
    const groupMembers = sessionMembers.length > 0
      ? sessionMembers
      : group
      ? normalizeGroupMembers(group.members)
      : []
    if (groupMembers.length === 0) {
      await ensureReplySituationCheckpointInvalidated()
      toast('会话成员为空', 'error')
      return
    }

    assertPipelineCanContinue(runId)
    setTyping(chatStore, true)
    setCurrentMessageModel(chatStore, '')
    streamingText.value = ''
    safeCurrentStreamingSpeakerName.value = ''
    safeCurrentStreamingTargetId.value = ''
    safePlannedGroupSpeakers.value = []
    let roundCompleted = false
    try {
      // 方案 B：提调「整轮前置统筹 pass」优先一次产出本轮完整剧本（情境/旁白安排/每角色方向/顺序），
      // 替换现役概率机制；点名/@ 已作为 forced 合进 cast，每角色方向真注入正文、编排带一轮一条展示。
      // 兜底退役（稳妥版）：统筹失败/空时用确定性 cast 兜底——forced 最前、其余候选按序全出场；
      // 既退役随机发言权、又不让群聊哑火（不靠统筹模型单点），此时无方向、编排带回退 per-speaker 聚合。
      // Batch 1·群聊带纠偏整轮重排：replay+replanText+carryOver 透传给统筹决策器，据纠偏重判情境、续在原带。
      const castReplyOrder = await (async () => {
        try {
          return await decideRoundDirector({
            userText, groupMembers, abortSignal, targetId: target,
            ...(String(options.replanText || '').trim() ? { replanText: String(options.replanText).trim() } : {}),
            ...(options.carryOver ? { carryOver: options.carryOver } : {})
          })
        } finally {
          // tombstone 不能早于导演读取上一情境，否则会污染导演投影；但必须早于任何角色正文生成。
          await ensureReplySituationCheckpointInvalidated()
        }
      })()
      assertPipelineCanContinue(runId)
      let finalReplyOrder = castReplyOrder
      if (!finalReplyOrder) {
        const fallbackCandidateIds = groupMembers.map((m) => String(m.characterId || '').trim()).filter(Boolean)
        const fallbackForcedIds = buildReplyPlan({
          userText,
          groupMembers,
          characters: charStore.characters || [],
          mentionSelectedChars: mentionSelectedChars.value || [],
          mentionExcludedChars: mentionExcludedChars.value || []
        }).filter((p) => p.mustReply).map((p) => p.characterId)
        finalReplyOrder = castIdsToReplyOrder(
          buildDeterministicCastFallback(fallbackCandidateIds, fallbackForcedIds, mentionExcludedChars.value || [])
        )
      }

      updateRoundReplyExecutionProfileForSelectedSpeakers({
        targetId: target,
        session,
        group: true,
        characterIds: finalReplyOrder.map((item) => String(item.characterId || '').trim()).filter(Boolean)
      })

      safePlannedGroupSpeakers.value = resolvePlannedGroupSpeakers(finalReplyOrder)

      await nextTick()

      assertPipelineCanContinue(runId)
      // ReplyWorkflow 模式（personality_model / normal_recall）按角色顺序走统一工作流；
      // 只有全员 pure_prompt 的会话才继续走旧 executeGroupChat 直送路径。
      const workflowSpeakers = finalReplyOrder
        .map((item) => String(item.characterId || '').trim())
        .filter(Boolean)
        .filter((speakerTargetId) => {
          const mode = String(resolveReplyPipelineModeForTarget(speakerTargetId))
          return mode === 'personality_model' || mode === 'normal_recall'
        })
      const replyCount = workflowSpeakers.length > 0
        ? await executeMixedGroupChat({
          targetId: target,
          userText,
          replyOrder: finalReplyOrder,
          runId,
          abortSignal,
          replay: options.replay === true
        })
        : await executeGroupChat({
          targetId: target,
          userText,
          replyOrder: finalReplyOrder
        })
      const expectedReplyCount = finalReplyOrder.filter((item) => String(item.characterId || '').trim()).length
      if (expectedReplyCount === 0 || replyCount < expectedReplyCount) {
        markReplySituationCheckpointFailure(`本轮角色正文落库不完整（${replyCount}/${expectedReplyCount}）`)
      }
      roundCompleted = true
      // 返回本轮成功回复条数：多人重试链路据此判断是否产出了新回复，缺少 return 会让重试一律被判失败。
      return replyCount
    } finally {
      // 叙事种子批次4·阶段二：无论全成功还是部分角色失败，都只读取此刻真正落库的助手/旁白消息。
      // 停止且零落库时 collect 为空，绝不会误触发；部分落库则据实际部分核对。
      if (roundCompleted && activeRoundDirector?.roundDirectorNarration) {
        try {
          await activeRoundDirector.roundDirectorNarration.completion
        } catch (error) {
          markReplySituationCheckpointFailure(error)
        }
      }
      const factCommit = scheduleNarrativeFactCommit({ throwOnError: roundCompleted })
      scheduleBackgroundWorldEvolution(factCommit)
      try {
        if (roundCompleted) {
          await factCommit
          await finalizeReplySituationCheckpoint({ runId })
        }
      } finally {
        if (isPipelineRunCurrent(runId)) {
          setTyping(chatStore, false)
          setCurrentMessageModel(chatStore, '')
          streamingText.value = ''
          safeCurrentStreamingSpeakerName.value = ''
          safeCurrentStreamingTargetId.value = ''
          safePlannedGroupSpeakers.value = []
          mentionSelectedChars.value = []
          await nextTick()
          scrollToBottom()
        }
      }
    }
  }

  async function runGroupChatReplay(target: string, userText: string) {
    stopActiveReplyRuntime(chatStore)
    clearStopRequest(chatStore)
    const runId = ++activePipelineRunId
    activePipelineSessionId = getActiveSessionId(chatStore)
    // 重放路径不产生新附件（批4）：清零防误读上一轮 sendText 留下的 activePipelineUserAttachments。
    activePipelineUserAttachments = []
    activePipelineTidiaoRunId = beginTidiaoRun()
    // 新轮起点清掉上一轮残留的导演轮级载体；当前轮由 decideRoundDirector（群聊·E2）/ runSingleChat（单聊）随后 begin。
    clearTidiaoDirectorStreamRound()
    activePipelineNarrationKinds = new Set<BuiltinNarrationKind>()
    const normalTaskRun = startNormalMessageTaskRun({ targetId: target, sessionId: activePipelineSessionId })
    activePipelineTaskRunId = normalTaskRun.id
    const replayReplyMode = resolveReplayTurnReplyMode(target)
    beginActiveChatTurn({
      runId,
      sessionId: activePipelineSessionId,
      targetId: target,
      taskRunId: normalTaskRun.id,
      inputKind: 'user_message_regenerate',
      replyMode: replayReplyMode,
      abortSignal: normalTaskRun.controller?.signal
    })
    activateRoundUsageContext(target, 'regenerate')
    try {
      await runGroupChat(target, userText, runId, normalTaskRun.controller?.signal, { replay: true })
    } catch (error) {
      try {
        await ensureReplySituationCheckpointInvalidated()
      } catch (invalidateError) {
        console.error('[reply-situation-checkpoint] 失败轮持久化失效未完成:', invalidateError)
      }
      await finishGenerationAttempt({
        attemptId: activeGenerationAttemptId,
        sessionId: activePipelineSessionId,
        status: 'failed',
        error
      })
      failNormalMessageTaskRun(normalTaskRun.id, error)
      throw error
    } finally {
      if (isPipelineRunCurrent(runId)) {
        resetActivePipelineState()
      }
      completeNormalMessageTaskRun(normalTaskRun.id)
    }
  }

  /** 批次B·scope 确认处理（非阻塞·2026-07-10 取代批次4「重放统筹续跑」）：坞的 scope 卡确认/取消 →
   *  - 全部卡处理完：把逐项选择组进 buildZaoceBatchBrief，派一次「造册」子agent后台批量建栏——独立小 loop，
   *    不重放统筹、不打断当前对话；登记 chatTaskRuns（taskKind='tidiaoDispatch'）让「停止一切」可停；
   *    建卡两件套工厂自带 STATUS_SYSTEM_EXTERNAL_UPDATED_EVENT 派发，建好 UI 自动刷新。
   *  - 取消（selection=null）：记拒绝（本会话同目标不再弹卡·内存态）。
   *  经 registerTidiaoStatusScopeResumeHandler 注册给 tidiaoStatusScopeState（坞侧只调 resume 全局函数，不直连管线）。 */
  async function resumeStatusScopeOrchestration(
    pending: TidiaoStatusScopePendingState,
    resolvedItems: TidiaoStatusScopeResolvedItem[],
    declinedRequests: XingyiStatusScopeRequest[]
  ) {
    declinedRequests.forEach((request) => markTidiaoStatusScopeDeclined(pending.sessionId, request))
    if (!resolvedItems.length) return
    const sessionId = String(pending.sessionId || '').trim()
    if (!sessionId) throw new Error('造册缺少正式会话作用域，无法加载统一原始可见上下文')
    const agentConfig = readBrainAgentConfigFromList(settingStore.agentModelConfigs)
    const candidates = pending.characterOptions.map((option) => ({ characterId: option.id, name: option.name }))
    // 登记后台任务（外部轮 tidiaoDispatch 同款）：停止按钮点亮、abortChat「停止一切」可停造册。
    const controller = new AbortController()
    const taskRun = runtimeStore?.startChatTaskRun?.({
      taskKind: 'tidiaoDispatch',
      label: '建状态栏（造册）',
      // 逐卡选择只带宿主名：按首个已确认对象回查 id，供后台任务归属展示。
      targetId: pending.characterOptions.find((option) => option.name === resolvedItems[0].selection.characterName)?.id || pending.characterOptions[0]?.id || '',
      sessionId,
      abortController: controller,
      foreground: true
    })
    const taskRunId = String(taskRun?.id || '')
    const signal = (taskRun?.abortController || controller).signal
    try {
      // 楼层读两件套只在用户仍停留在原会话时构造（跨会话确认时省略——投影两件套/检索三件套带会话定位兜底）。
      const sameSession = getActiveSessionId(chatStore) === sessionId
      const messageList = sameSession ? (getCurrentMessageList(chatStore) as Array<Record<string, unknown>>) : null
      const observations = messageList ? await loadDirectorProjectionObservations(sessionId) : null
      // 大脑召回落池接缝（用户 2026-07-10 拍板：建栏必须依据角色大脑资料）：与统筹/采风同一件构造——
      // recallCharacterBrain 据此注册（候选=会话成员·范围受限铁律天然满足），召回命中落会话池共享；
      // anchor=请求发起轮的锚（接缝入场券·池本体是会话级不受锚影响）。poolVisibilityBlock 造册不用，丢弃。
      const zaocePoolSeam = buildDirectorRecallPoolSeam(
        sessionId,
        pending.anchorMessageId,
        candidates,
        candidates.map((option) => option.characterId)
      )
      const brief = buildZaoceBatchBrief(pending, resolvedItems)
      // 原子批写的 world scope 必须取确认时现查的统一编排工作台，不复用旧导演轮或 UI 缓存。
      const orchestrationWorkspace = await fetchOrchestrationWorkspaceProjection(sessionId)
      const statusSystem = buildTidiaoStatusSystemSeam(sessionId, pending.characterOptions)
      const sourceAgentRunId = taskRunId || `zaoce_run_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
      const tools = buildZaoceToolset({
        sessionId,
        candidates,
        ...(messageList ? { chatMessageReadContext: createTidiaoChatMessageReadContext(messageList) } : {}),
        ...(messageList && observations ? { projectionContext: createTidiaoMessageProjectionContext(messageList, observations.projectionMap) } : {}),
        // 文档库三件套（docLibraryOnly 与统筹/采风同口径·会话白名单裁剪同源）。
        retrievalContext: buildTidiaoRetrievalContext?.('', { docLibraryOnly: true, sessionId }) || null,
        ...(zaocePoolSeam.recallPoolAppend ? { recallPoolAppend: zaocePoolSeam.recallPoolAppend } : {}),
        batchContext: {
          ...statusSystem,
          worldId: String(orchestrationWorkspace.workspace.scope.worldId || ''),
          sourceAgentRunId,
          sourceMessageId: String(pending.anchorMessageId || ''),
          execute: executeOrchestrationCommands
        }
      })
      const callModel = buildDeferredLoopModelCall({
        agentConfig,
        taskId: 'zaoceBuild',
        // 校书档默认 1024 不够设计模板+建卡：覆写 2048；建卡任务求稳 temperature 0.3（与采风同刻度）。
        maxTokens: 2048,
        temperature: 0.3,
        logLabel: 'zaoce-build',
        placeType: 'group',
        abortSignal: signal
      })
      let contextBlock = ''
      try {
        contextBlock = (await loadRenderedAgentContext({
          agentKind: 'zaoce',
          sessionId,
          userText: brief
        })).text
      } catch (error) {
        throw new Error(`造册统一原始可见上下文加载失败：${error instanceof Error ? error.message : String(error)}`)
      }
      const result = await runZaoceBuild(brief, {
        sessionId,
        contextBlock,
        taskKey: sourceAgentRunId,
        tools,
        callModel,
        signal
      })
      if (taskRunId && runtimeStore?.isChatTaskRunActive?.(taskRunId)) {
        runtimeStore.updateChatTaskRun?.(taskRunId, { metrics: { ...result.metrics } })
        if (result.ok) runtimeStore.completeChatTaskRun?.(taskRunId)
        else runtimeStore.failChatTaskRun?.(taskRunId, new Error(result.error || '建栏失败'))
      }
    } catch (error) {
      // runZaoceBuild 自身永不抛错——这里兜的是工具集/模型装配期异常；如实标失败不静默。
      if (taskRunId && runtimeStore?.isChatTaskRunActive?.(taskRunId)) runtimeStore.failChatTaskRun?.(taskRunId, error)
      if (!isAbortError(error)) throw error
    }
  }
  // scope 确认接线：坞的 scope 卡经 resumeTidiaoStatusScopeOrchestration（tidiaoStatusScopeState）回到本管线。
  registerTidiaoStatusScopeResumeHandler(resumeStatusScopeOrchestration)

  /** 绘舆阶段确认卡续派（人在环上通道统一批C·2026-07-12；批3 补结构化剪影决策分流）：坞的确认卡点选/输入 →
   *  - denied/dismissed（用户没给出可用答案）：记拒绝（本会话同确认点不再弹），不重派。
   *  - draftConfirm 且答复等价驳回：草案还没落笔，没有内容需要收尾，不重派（对齐 runHuiyuStage 内
   *    "驳回草案不落笔"的语义，只是这里由 advisory 续派自己判断，不再进 runHuiyuStage 走一趟）。
   *  - draftConfirm 且卡片带了 sketches、答复是决策 JSON（地图弹窗「在地图上看草案」提交）：解析出
   *    decision 后交给 huiyuStageConfirmState.planHuiyuSketchDecisionDispatch（纯函数，分流规则+
   *    "已知简化"见该函数头注释）算出续派计划，本函数只按计划顺序 seam.dispatch + 调整轮数计数器；
   *    decision 里 accepted 与 comments 都为空（如只给了 rejected）：视同驳回，没有内容需要收尾，不重派。
   *  - 其余（非 JSON / 卡片本没带 sketches）：走现行纯文本合并路径——把确认卡原文+用户答复并入新
   *    instructions（无 LLM 在场重组任务书，效果对齐 huiyuSubagent.composeHuiyuDrawTaskFromDraft 的
   *    合并语义）；stageEndConfirm/terraformConfirm 分支 instructions 原样复用（对应的 runHuiyuStage
   *    分支只看 confirmAnswer）。
   *    dispatch 若再遇 awaitingConfirm（如落笔完问阶段收尾），staged 分支自身的写卡逻辑会自动挂出
   *    下一张卡——本函数不需要特殊处理链式确认。
   *  登记为 chatTaskRuns（taskKind='tidiaoDispatch'）后台任务，让「停止一切」可停、进展靠
   *  subagentRunStatus 运行卡可见（不重放统筹/纠偏 loop、不发聊天消息，与造册续派同一惯例）。 */
  async function handleHuiyuStageConfirmResume(pending: HuiyuStageConfirmPendingState, answer: InteractionAnswer) {
    const answerText = huiyuStageConfirmAnswerText(answer)
    const { redispatch } = pending
    if (answerText === null) {
      markHuiyuStageConfirmDeclined(pending.sessionId, redispatch)
      return
    }
    if (redispatch.kind === 'draftConfirm' && isHuiyuStagedDraftAnswerRejected(answerText)) {
      return
    }
    // 结构化剪影决策（批3）：只在 draftConfirm 且这张卡本来就带了剪影清单时才尝试解析——解析失败/非 JSON
    // 一律回落下方现行文字合并分支（parseHuiyuSketchDecision 本身对非 JSON 也返回 null，双重把关）。
    const sketchDecision: HuiyuSketchDecision | null = redispatch.kind === 'draftConfirm' && pending.sketches?.length
      ? parseHuiyuSketchDecision(answerText)
      : null
    if (sketchDecision && !sketchDecision.accepted.length && !Object.keys(sketchDecision.comments).length) {
      // 决策里既无采纳也无意见（如只给了 rejected）：视同驳回草案，没有内容需要收尾，不重派——
      // 静默返回，不创建续派任务卡（对齐上面 isHuiyuStagedDraftAnswerRejected 分支同一惯例）。
      return
    }
    const sessionId = pending.sessionId
    const agentConfig = readBrainAgentConfigFromList(settingStore.agentModelConfigs)
    const candidates = redispatch.candidates
    const controller = new AbortController()
    const taskRun = runtimeStore?.startChatTaskRun?.({
      taskKind: 'tidiaoDispatch',
      label: '绘舆确认续派',
      targetId: candidates[0]?.characterId || '',
      sessionId,
      abortController: controller,
      foreground: true
    })
    const taskRunId = String(taskRun?.id || '')
    const signal = (taskRun?.abortController || controller).signal
    try {
      const sameSession = getActiveSessionId(chatStore) === sessionId
      const messageList = sameSession ? (getCurrentMessageList(chatStore) as Array<Record<string, unknown>>) : null
      const observations = messageList ? await loadDirectorProjectionObservations(sessionId) : null
      const poolSeam = buildDirectorRecallPoolSeam(sessionId, redispatch.anchorMessageId, candidates, candidates.map((c) => c.characterId))
      const seam = buildHuiyuDispatchSeam({
        sessionId,
        candidates,
        ...(messageList ? { chatMessageReadContext: createTidiaoChatMessageReadContext(messageList) } : {}),
        ...(messageList && observations ? { projectionContext: createTidiaoMessageProjectionContext(messageList, observations.projectionMap) } : {}),
        retrievalContext: buildTidiaoRetrievalContext?.('', { docLibraryOnly: true, sessionId }) || null,
        ...(poolSeam.recallPoolAppend ? { recallPoolAppend: poolSeam.recallPoolAppend } : {}),
        statusSystem: buildTidiaoStatusSystemSeam(sessionId, candidates.map((c) => ({ id: c.characterId, name: c.name }))),
        agentConfig,
        abortSignal: signal
      })
      let finalOk = true
      let finalErrorMessage = ''
      if (sketchDecision) {
        const round = getHuiyuSketchRevisionRound(sessionId, redispatch)
        const plan = planHuiyuSketchDecisionDispatch(redispatch, pending.request.title, pending.sketches, sketchDecision, round)
        if (plan.revisionRoundAction === 'bump') bumpHuiyuSketchRevisionRound(sessionId, redispatch)
        else clearHuiyuSketchRevisionRound(sessionId, redispatch)
        for (const call of plan.calls) {
          const outcome = await seam.dispatch({
            task: call.task, instructions: call.instructions, ...(call.focus ? { focus: call.focus } : {}),
            mode: 'staged', stagedStep: call.stagedStep, confirmAnswer: answerText
          })
          finalOk = outcome.ok
          if (!outcome.ok) finalErrorMessage = String((outcome.details as Record<string, unknown> | undefined)?.error || '绘舆续派未完成')
        }
      } else {
        const instructions = redispatch.kind === 'draftConfirm'
          ? composeHuiyuStagedDrawInstructions(redispatch.instructions, pending.request.title, answerText)
          : redispatch.instructions
        const outcome = await seam.dispatch({
          task: redispatch.task,
          instructions,
          ...(redispatch.focus ? { focus: redispatch.focus } : {}),
          mode: 'staged',
          stagedStep: redispatch.nextStep,
          confirmAnswer: answerText,
          ...(redispatch.kind === 'terraformConfirm' ? { override: 'terraform' as const } : {})
        })
        finalOk = outcome.ok
        if (!outcome.ok) finalErrorMessage = String((outcome.details as Record<string, unknown> | undefined)?.error || '绘舆续派未完成')
      }
      if (taskRunId && runtimeStore?.isChatTaskRunActive?.(taskRunId)) {
        if (finalOk) runtimeStore.completeChatTaskRun?.(taskRunId)
        else runtimeStore.failChatTaskRun?.(taskRunId, new Error(finalErrorMessage || '绘舆续派未完成'))
      }
    } catch (error) {
      // seam.dispatch 内部（runHuiyuStage 等）永不抛错——这里兜的是工具集/模型装配期异常；如实标失败不静默。
      if (taskRunId && runtimeStore?.isChatTaskRunActive?.(taskRunId)) runtimeStore.failChatTaskRun?.(taskRunId, error)
      if (!isAbortError(error)) throw error
    }
  }
  // 绘舆确认卡接线：坞的确认卡经 resumeHuiyuStageConfirmOrchestration（huiyuStageConfirmState）回到本管线。
  registerHuiyuStageConfirmResumeHandler(handleHuiyuStageConfirmResume)

  /** 动作输入前台快链：书童短判 → 提调只做写作计划 → 正式消息模型结合提示词库成文；轮后再耐久核账。 */
  async function runFocusedActionPipeline(input: {
    sessionId: string
    targetId: string
    userText: string
    inputMessageId: number
    actionGroupId: string
    taskRunId: string
    existingMessageId?: number
    runId: number
    abortSignal?: AbortSignal
  }): Promise<number> {
    const envSnapshot = getCurrentEnvironmentSnapshot()
    const localMessageKey = `focused-action-${input.inputMessageId}-${Date.now()}`
    const retryingMessageId = Number(input.existingMessageId || 0)
    let fullReply = ''
    let usedModel = ''
    let promptLogId = ''
    let judgePromptLogId = ''
    let planningPromptLogId = ''
    let resolvedVisibility: FocusedActionVisibility = FOCUSED_ACTION_DEFAULT_VISIBILITY
    let executionStage = 'focused_action_context'
    const completedStages: string[] = []
    const focusedGenerationAttemptId = await startGenerationAttempt({
      sessionId: input.sessionId,
      anchorMessageId: input.inputMessageId,
      triggerType: retryingMessageId ? 'user_message_regenerate' : 'normal_send',
      mode: 'clean',
      targetId: input.targetId,
      speakerName: '旁白',
      ...(retryingMessageId ? { replacedMessageIds: [retryingMessageId] } : {})
    })
    activeGenerationAttemptId = focusedGenerationAttemptId
    markActiveTurnGenerationAttempt(focusedGenerationAttemptId)
    const persistExecutionReceipt = async (receiptInput: {
      state: 'completed' | 'failed'
      messageId?: number
      error?: unknown
    }) => {
      if (!focusedGenerationAttemptId) return
      const turnContext = chatTurnRunner.getContext()
      const receipt = receiptInput.state === 'completed'
        ? buildReplyExecutionReceipt({
            state: 'completed',
            roundProfile: turnContext?.replyExecutionProfile,
            routeDecision: turnContext?.replyOrchestrationDecision,
            defaultRoute: 'orchestrate',
            actualHasPersonalityModel: false,
            purePrompt: false,
            focusedAction: true,
            messageId: receiptInput.messageId,
            promptLogId,
            completedStages
          })
        : buildReplyExecutionReceipt({
            state: 'failed',
            roundProfile: turnContext?.replyExecutionProfile,
            routeDecision: turnContext?.replyOrchestrationDecision,
            defaultRoute: 'orchestrate',
            actualHasPersonalityModel: false,
            purePrompt: false,
            focusedAction: true,
            messageId: receiptInput.messageId,
            promptLogId,
            completedStages,
            failureStage: executionStage,
            error: receiptInput.error
          })
      await createChatGenerationAttemptArtifactBySessionId(input.sessionId, {
        attemptId: focusedGenerationAttemptId,
        artifactKind: 'reply_execution_receipt',
        ...(receipt.messageId > 0 ? { messageId: receipt.messageId } : {}),
        promptLogId: receipt.promptLogId,
        payload: {
          ...receipt.replyExecutionAudit,
          executionReceipt: receipt
        }
      }).catch((error) => console.error('保存动作快链执行回执失败:', error))
    }
    const buildPayload = (content: string): MessagePayload & Record<string, unknown> => ({
      role: 'assistant',
      messageKind: 'narration',
      message_kind: 'narration',
      content,
      time: new Date().toISOString(),
      name: '旁白',
      memberName: '旁白',
      envDate: envSnapshot.envDate,
      envWeather: envSnapshot.envWeather,
      envLocation: envSnapshot.envLocation,
      model: usedModel,
      messageSourceKind: FOCUSED_ACTION_SOURCE_KIND,
      message_source_kind: FOCUSED_ACTION_SOURCE_KIND,
      focusedActionGroupId: input.actionGroupId,
      focused_action_group_id: input.actionGroupId,
      focusedActionVisibility: resolvedVisibility,
      focused_action_visibility: resolvedVisibility,
      includeInContext: true,
      include_in_context: true
    })
    setTyping(chatStore, true)
    setCurrentMessageModel(chatStore, '')
    streamingText.value = ''
    safeCurrentStreamingSpeakerName.value = '旁白'
    safeCurrentStreamingTargetId.value = input.targetId
    safePlannedGroupSpeakers.value = []
    try {
      const context = await loadRenderedAgentContext({
        agentKind: 'focused_action',
        sessionId: input.sessionId,
        anchorMessageId: input.inputMessageId,
        userText: input.userText
      })
      completedStages.push('focused_action_context')
      const compactContext = renderFocusedActionContext(context.bundle)
      const judgeMessages = buildFocusedActionJudgeMessages(input.userText, compactContext)
      executionStage = 'focused_action_judge'
      const judgeOutput = await callAI(judgeMessages, {
        ...buildTaskModelAiOptions(readBrainAgentConfigFromList(settingStore.agentModelConfigs) as any, 'focusedActionJudge', {
          maxTokens: 220,
          temperature: 0,
          thinking: 'disabled'
        }),
        feature: 'agent',
        logLabel: 'focused-action-judge',
        usageLabel: '动作输入：书童快速判断',
        placeLabel: '动作输入',
        placeType: 'other' as const,
        ...(input.abortSignal ? { signal: input.abortSignal } : {}),
        onPromptPrepared: async ({ finalPrompt, promptBlocks }: {
          messages: Array<{ role: ChatRole; content: string }>
          finalPrompt: string
          promptBlocks?: ChatPromptLogBlock[]
          preparedAt: string
        }) => {
          try {
            const log = await createChatPromptLogBySessionId(input.sessionId, {
              speakerName: '书童 · 动作判断',
              targetId: input.targetId,
              finalPrompt,
              promptBlocks: promptBlocks || [
                { role: 'system', title: '书童判断规则', content: judgeMessages[0].content },
                { role: 'user', title: '精简现场与动作', content: judgeMessages[1].content }
              ],
              logKind: 'internal_agent'
            })
            judgePromptLogId = String(log.id || '')
          } catch (error) {
            console.error('记录动作输入书童提示词失败:', error)
          }
        }
      })
      assertPipelineCanContinue(input.runId)
      const decision = parseFocusedActionJudgeOutput(
        normalizeAiOutputText(stripAiThoughtContent(String(judgeOutput || '')))
      )
      resolvedVisibility = decision.visibility
      completedStages.push('focused_action_judge')
      const planningMessages = buildTidiaoMessageWritingPlanMessages({
        mode: 'focused_action',
        currentInput: input.userText,
        contextBlock: compactContext,
        taskInstruction: decision.instruction,
        focus: decision.focus
      })
      executionStage = 'focused_action_plan'
      const planningOutput = await callAI(planningMessages, {
        ...buildTaskModelAiOptions(readBrainAgentConfigFromList(settingStore.agentModelConfigs) as any, 'directorLoop', {
          maxTokens: 700,
          temperature: 0.2,
          thinking: 'disabled'
        }),
        feature: 'agent',
        logLabel: 'tidiao-focused-action-plan',
        usageLabel: '动作输入：提调写作规划',
        placeLabel: '动作输入',
        placeType: 'other' as const,
        ...(input.abortSignal ? { signal: input.abortSignal } : {}),
        onPromptPrepared: async ({ finalPrompt, promptBlocks }: {
          messages: Array<{ role: ChatRole; content: string }>
          finalPrompt: string
          promptBlocks?: ChatPromptLogBlock[]
          preparedAt: string
        }) => {
          try {
            const log = await createChatPromptLogBySessionId(input.sessionId, {
              speakerName: '提调 · 动作写作计划',
              targetId: input.targetId,
              finalPrompt,
              promptBlocks: promptBlocks || buildPromptBlocksFromPreparedMessages(planningMessages, 'focused-action-writing-plan'),
              logKind: 'internal_agent'
            })
            planningPromptLogId = String(log.id || '')
          } catch (error) {
            console.error('记录动作输入提调写作计划提示词失败:', error)
          }
        }
      })
      assertPipelineCanContinue(input.runId, input.taskRunId)
      const writingPlan = parseMessageWritingPlanOutput(
        normalizeAiOutputText(stripAiThoughtContent(String(planningOutput || '')))
      )
      completedStages.push('focused_action_plan')
      const promptLibraryAssembly = await buildPersonalityPromptLibrarySystemAssembly({
        targetId: input.targetId,
        speakerTargetId: input.targetId,
        taskRunId: input.taskRunId
      })
      const messages = buildFocusedActionFinalMessages({
        actionText: input.userText,
        contextBlock: compactContext,
        decision,
        writingPlan,
        promptLibrarySystemPrompt: promptLibraryAssembly.systemPrompt
      }) as Array<{ role: ChatRole; content: string }>
      if (!retryingMessageId) {
        upsertStreamingMessage(chatStore, input.sessionId || input.targetId, localMessageKey, {
          ...buildPayload(''), _targetId: input.targetId, _sessionId: input.sessionId
        })
      }
      executionStage = 'final_reply_generation'
      const returnedText = await callAIStream(
        messages,
        {
          ...buildTaskModelAiOptions(readBrainAgentConfigFromList(settingStore.agentModelConfigs) as any, 'narrationMessage', {
            maxTokens: 1800,
            temperature: 0.7,
            thinking: 'disabled'
          }),
          feature: 'chat',
          logLabel: 'focused-action-message',
          usageLabel: '动作输入：正式消息生成',
          placeLabel: '动作输入',
          placeType: 'other' as const,
          ...(input.abortSignal ? { signal: input.abortSignal } : {}),
          onPromptPrepared: async ({ finalPrompt, promptBlocks }: {
            messages: Array<{ role: ChatRole; content: string }>
            finalPrompt: string
            promptBlocks?: ChatPromptLogBlock[]
            preparedAt: string
          }) => {
            try {
              const log = await createChatPromptLogBySessionId(input.sessionId, {
                speakerName: '消息生成 · 动作正文',
                targetId: input.targetId,
                finalPrompt,
                promptBlocks: promptBlocks || [
                  { role: 'system', title: '提示词库与动作成文规则', content: messages[0].content },
                  { role: 'user', title: '提调计划与当前动作', content: messages[1].content }
                ]
              })
              promptLogId = String(log.id || '')
            } catch (error) {
              console.error('记录动作输入正式消息提示词失败:', error)
            }
          }
        },
        (chunk) => {
          if (!isPipelineRunCurrent(input.runId) || isStopRequested(chatStore)) return
          fullReply += chunk
          const visibleText = getVisibleTextFromEmbeddedProjectionOutput(fullReply)
          streamingText.value = visibleText
          if (!retryingMessageId) {
            upsertStreamingMessage(chatStore, input.sessionId || input.targetId, localMessageKey, {
              ...buildPayload(visibleText), _targetId: input.targetId, _sessionId: input.sessionId
            })
          }
          scrollToBottom()
        },
        {
          onModelInfo: (model: string) => {
            usedModel = model
            setCurrentMessageModel(chatStore, model)
          }
        }
      )
      assertPipelineCanContinue(input.runId)
      const parsed = parseEmbeddedMessageProjectionOutput(normalizeAiOutputText(returnedText || fullReply))
      const visibleText = cleanAiPrefix(parsed.visibleText)
      if (!hasVisibleAiReplyBody(visibleText)) throw new Error('动作输入的正式消息模型没有返回可显示正文')
      completedStages.push('final_reply_generation')
      executionStage = 'assistant_reply_persist'
      await chatStore.editMessage?.(input.targetId, input.inputMessageId, {
        focusedActionVisibility: resolvedVisibility,
        focused_action_visibility: resolvedVisibility
      })
      const payload = buildPayload(visibleText)
      let persistedId = retryingMessageId
      if (retryingMessageId) {
        const list = getCurrentMessageList(chatStore) as Array<Record<string, unknown>>
        const existing = list.find((message) => Number(message?.id || 0) === retryingMessageId)
        const previousVersions = normalizeChatMessageEditVersionList(existing || null)
        await chatStore.editMessage?.(input.targetId, retryingMessageId, {
          content: visibleText,
          time: payload.time,
          model: usedModel,
          focusedActionVisibility: resolvedVisibility,
          focused_action_visibility: resolvedVisibility,
          versionList: [
            ...previousVersions,
            { content: visibleText, time: payload.time, model: usedModel, memberName: '旁白', createdAt: new Date().toISOString() }
          ],
          activeVersionIndex: previousVersions.length
        })
      } else {
        persistedId = Number(await chatStore.addMessage(input.targetId, payload, {
          skipLocalSync: true,
          sessionId: input.sessionId
        }) || 0)
      }
      if (!persistedId) throw new Error('动作输入旁白落库失败')
      completedStages.push('assistant_reply_persist')
      const persistedMessage = { id: persistedId, ...payload, _targetId: input.targetId, _sessionId: input.sessionId }
      clearStreamingBubbleState(input.targetId)
      if (retryingMessageId) {
        removeStreamingMessage(chatStore, input.sessionId || input.targetId, localMessageKey)
      } else if (finalizeStreamingMessage(chatStore, input.sessionId || input.targetId, localMessageKey, persistedMessage) === false) {
        queuePendingPersistedMessage(chatStore, input.sessionId || input.targetId, persistedMessage)
      }
      if (judgePromptLogId) await bindChatPromptLogMessageBySessionId(input.sessionId, judgePromptLogId, persistedId)
      if (planningPromptLogId) await bindChatPromptLogMessageBySessionId(input.sessionId, planningPromptLogId, persistedId)
      if (promptLogId) await bindChatPromptLogMessageBySessionId(input.sessionId, promptLogId, persistedId)
      completedStages.push('prompt_log_binding')
      await finishGenerationAttempt({
        attemptId: focusedGenerationAttemptId,
        sessionId: input.sessionId,
        status: 'completed',
        assistantMessageIds: [persistedId],
        outputPromptLogId: promptLogId
      })
      await persistExecutionReceipt({ state: 'completed', messageId: persistedId })
      triggerAutoWriteAfterAssistantPersisted({
        sessionId: input.sessionId,
        targetId: input.targetId,
        assistantMessageId: persistedId,
        embeddedProjectionText: parsed.projectionText,
        embeddedProjectionError: parsed.hasProjection ? '' : parsed.error,
        embeddedProjectionRequired: true
      })
      return persistedId
    } catch (error) {
      removeStreamingMessage(chatStore, input.sessionId || input.targetId, localMessageKey)
      await finishGenerationAttempt({
        attemptId: focusedGenerationAttemptId,
        sessionId: input.sessionId,
        status: 'failed',
        assistantMessageIds: [],
        outputPromptLogId: promptLogId,
        error
      })
      await persistExecutionReceipt({
        state: 'failed',
        messageId: retryingMessageId,
        error
      })
      failNormalMessageTaskRun(input.taskRunId, error)
      throw error
    } finally {
      if (activeGenerationAttemptId === focusedGenerationAttemptId) activeGenerationAttemptId = ''
      setTyping(chatStore, false)
      setCurrentMessageModel(chatStore, '')
      streamingText.value = ''
      safeCurrentStreamingSpeakerName.value = ''
      safeCurrentStreamingTargetId.value = ''
    }
  }

  /** 动作旁白重生成：从消息自身的正式 action group 找回原动作，再次激活提调判定与一次直出。 */
  async function regenerateFocusedActionViaTidiao(messageId: number): Promise<boolean> {
    const target = getActiveTargetId(chatStore)
    const sessionId = getActiveSessionId(chatStore)
    if (!target || !sessionId || !Number.isInteger(Number(messageId)) || Number(messageId) <= 0) return false
    const list = getCurrentMessageList(chatStore) as Array<Record<string, unknown>>
    const outputIndex = list.findIndex((message) => Number(message?.id || 0) === Number(messageId))
    const outputMessage = outputIndex >= 0 ? list[outputIndex] : null
    if (!outputMessage || !isFocusedActionMessage(outputMessage)) return false
    const actionGroupId = readFocusedActionGroupId(outputMessage)
    const inputMessage = [...list.slice(0, outputIndex)].reverse().find((message) => (
      message?.role === 'user'
      && isFocusedActionMessage(message)
      && readFocusedActionGroupId(message) === actionGroupId
    )) || null
    const inputMessageId = Number(inputMessage?.id || 0)
    const userText = String(inputMessage?.content || '').trim()
    if (!actionGroupId || !inputMessageId || !userText) return false

    stopActiveReplyRuntime(chatStore)
    clearStopRequest(chatStore)
    const runId = ++activePipelineRunId
    activePipelineSessionId = sessionId
    activePipelineInputMessageId = inputMessageId
    activePipelineUserAttachments = []
    activePipelineTidiaoRunId = beginTidiaoRun()
    const normalTaskRun = startNormalMessageTaskRun({ targetId: target, sessionId })
    activePipelineTaskRunId = normalTaskRun.id
    beginActiveChatTurn({
      runId,
      sessionId,
      targetId: target,
      taskRunId: normalTaskRun.id,
      inputKind: 'focused_action',
      replyMode: 'normal_recall',
      replyExecutionProfile: resolveReplyExecutionProfile({
        route: 'orchestrate',
        hasPersonalityModel: false,
        purePrompt: false,
        focusedAction: true
      }),
      abortSignal: normalTaskRun.controller?.signal
    })
    try {
      await runFocusedActionPipeline({
        sessionId,
        targetId: target,
        userText,
        inputMessageId,
        actionGroupId,
        taskRunId: normalTaskRun.id,
        existingMessageId: Number(messageId),
        runId,
        abortSignal: normalTaskRun.controller?.signal
      })
      await schedulePostRoundOrchestration({
        sessionId,
        inputMessageId,
        triggerKind: 'focused_action',
        restartExisting: true
      })
      return true
    } catch (error) {
      failNormalMessageTaskRun(normalTaskRun.id, error)
      throw error
    } finally {
      completeNormalMessageTaskRun(normalTaskRun.id)
      if (isPipelineRunCurrent(runId, normalTaskRun.id)) resetActivePipelineState()
    }
  }

  async function sendText(text: string, options: { inputKind?: ChatInputKind } = {}) {
    const target = getActiveTargetId(chatStore)
    if (!target) return
    const rawInput = String(text ?? '')
    if (!rawInput.trim()) return
    // 用户私密提调指令（Option A）：消息正文存**原文**供用户显示/编辑/回溯（userMessageDisplayText），
    // 但喂模型的文本一律用剥离后的 cleanText（directiveStrippedInput）；directives 只随本轮注入提调编排上下文。
    // 投影侧剥离闸口在 messageProjectionAgent.cleanMessageProjectionSourceText（防投影事实带进角色/旁白）。
    const { cleanText: directiveStrippedInput, directives: roundDirectorDirectives } = extractDirectorDirectives(rawInput)
    // 纯私密指令轮（2026-07-04 用户拍板放行）：整条只有【【…】】、没有可见正文时，不再拦截——照常发起一轮回复。
    // 语义：模型侧正文全程空串（角色只当剧情自然继续，绝不知道有指令），指令照常只注入提调；
    // 存库仍存原文供显示/回溯。剥离后既无正文也无指令（如空指令【【】】）才真没东西可发。
    const directiveOnlyRound = !directiveStrippedInput.trim() && roundDirectorDirectives.length > 0
    if (!directiveStrippedInput.trim() && !directiveOnlyRound) return
    // 存库正文 = 用户原文（含【【…】】），仅作显示/编辑真值；模型链路绝不读它，只读 cleanText / 投影事实。
    const userMessageDisplayText = rawInput.trim()
    const purePromptReply = shouldUsePurePromptReply()
    const inputRoute = directiveOnlyRound
      ? { kind: 'reply' as const, normalized: '' }
      : purePromptReply
        ? { kind: 'reply' as const, normalized: directiveStrippedInput }
        : parseChatInputRoute(directiveStrippedInput)
    const normalized = inputRoute.normalized
    if (!normalized && !directiveOnlyRound) return

    if (inputRoute.kind === 'user_narration') {
      await runUserNarrationCommandFromInput(target, inputRoute.command)
      return
    }

    if (inputRoute.kind === 'improvised_character_create') {
      const sessionId = getActiveSessionId(chatStore)
      if (!sessionId) {
        toast('当前会话还没准备好，不能创建即兴角色', 'error')
        return
      }
      const noticeId = startSlashCommandNotice(runtimeStore, {
        command: '/创建角色',
        message: `正在创建即兴角色：${inputRoute.command.targetName}`,
        step: '读取当前会话材料'
      })
      try {
        updateSlashCommandNotice(runtimeStore, noticeId, {
          message: '正在调用 Agent 生成角色资料',
          step: '生成角色核心资料'
        })
        const result = await createImprovisedCharacterWithDuplicateHandling(sessionId, inputRoute.command.targetName)
        upsertImprovisedCharacterLocalState(result)
        const materialCount = Array.isArray(result.context?.materials) ? result.context.materials.length : 0
        const name = String(result.character?.name || result.characterCore?.name || inputRoute.command.targetName)
        const groupName = String(result.group?.name || '即兴角色')
        const joinedText = result.participant?.participantTargetId ? '已加入当前会话' : '未加入当前会话'
        completeSlashCommandNotice(runtimeStore, noticeId, {
          message: `已创建即兴角色：${name}`,
          step: '角色创建完成',
          detail: `分组：${groupName}，${joinedText}。使用 ${materialCount} 条材料。`
        })
        toast(`已创建即兴角色：${name}，分组：${groupName}，${joinedText}。使用 ${materialCount} 条材料。`, 'success')
      } catch (error) {
        const message = getErrorMessage(error)
        const type = message.includes('已取消') ? 'info' : 'error'
        if (type === 'info') {
          completeSlashCommandNotice(runtimeStore, noticeId, {
            message: '已取消创建即兴角色',
            step: '命令已取消',
            detail: message
          })
        } else {
          failSlashCommandNotice(runtimeStore, noticeId, {
            message: '即兴角色创建失败',
            step: '命令失败',
            error
          })
        }
        toast(`即兴角色创建失败: ${message}`, type)
      }
      return
    }
    if (inputRoute.kind === 'legacy_improvised_character_create') {
      const suffix = inputRoute.command.targetName ? ` ${inputRoute.command.targetName}` : ''
      toast(`角色创建入口已改为 /创建角色${suffix}`, 'info')
      return
    }
    if (inputRoute.kind === 'temporary_entity_organize') {
      const sessionId = getActiveSessionId(chatStore)
      if (!sessionId) {
        toast('当前会话还没准备好，不能整理临时资料', 'error')
        return
      }
      const kindLabel = getTemporaryEntityKindLabel(inputRoute.command.kind)
      const noticeId = startSlashCommandNotice(runtimeStore, {
        command: `/整理${kindLabel}`,
        message: `正在整理临时${kindLabel}：${inputRoute.command.targetName}`,
        step: '读取当前会话证据'
      })
      try {
        updateSlashCommandNotice(runtimeStore, noticeId, {
          message: '正在调用 Agent 整理资料',
          step: '生成临时资料'
        })
        const result = await organizeSessionTemporaryEntity(sessionId, normalized)
        const materialCount = Array.isArray((result.context as any)?.materials) ? (result.context as any).materials.length : 0
        const resultKindLabel = getTemporaryEntityKindLabel(result.item?.kind || inputRoute.command.kind)
        const resultName = result.item?.name || inputRoute.command.targetName
        completeSlashCommandNotice(runtimeStore, noticeId, {
          message: `已整理临时${resultKindLabel}：${resultName}`,
          step: '整理完成',
          detail: `使用 ${materialCount} 条材料。`
        })
        toast(`已整理临时${resultKindLabel}：${resultName}。使用 ${materialCount} 条材料。`, 'success')
      } catch (error) {
        failSlashCommandNotice(runtimeStore, noticeId, {
          message: '临时资料整理失败',
          step: '命令失败',
          error
        })
        toast(`临时资料整理失败: ${getErrorMessage(error)}`, 'error')
      }
      return
    }
    stopActiveReplyRuntime(chatStore)
    clearStopRequest(chatStore)
    // 图片附件（输入框图片上传计划批4；批「带图乐观发送」2026-07-11 caption 改后台补完）：上面的斜杠指令
    // 分支都已 return，走到这里即确认本轮是「回复」路径——才取走本轮待发附件；只等上传拿真 url，不再等
    // caption（真机反馈的卡顿根因）。caption 后台跑完经 onCaptionUpdate 回调，把结果整体回填进下方
    // addUserMessage 落库的那条消息（messageId 还没就位就先记 captionBackfillNeeded，落库后补一次，
    // 顺序不管谁先谁后都兜到；见下方 activePipelineInputMessageId 赋值处）。斜杠指令等其它路由不会执行
    // 到这里，附件原样留在输入框 chips 里不消费（最小惊讶：指令不清空用户还没发出的图）。
    let captionBackfillMessageId = 0
    let captionBackfillNeeded = false
    let captionBackfillAttachments: ChatImageAttachment[] = []
    const onCaptionUpdate: CaptionUpdateListener = (attachmentId, patch) => {
      captionBackfillAttachments = captionBackfillAttachments.map((att) => (att.id === attachmentId ? { ...att, ...patch } : att))
      if (captionBackfillMessageId) {
        void chatStore.editMessage?.(target, captionBackfillMessageId, { attachments: captionBackfillAttachments })
      } else {
        captionBackfillNeeded = true
      }
    }
    const roundAttachments = takeImageAttachments ? await takeImageAttachments(onCaptionUpdate) : []
    captionBackfillAttachments = roundAttachments
    const sessionId = getActiveSessionId(chatStore)
    // 同一会话的轮后提调必须先于下一轮可见叙事完成；上一轮失败记录会在这里持久化重试，
    // 避免“喝药已写出来、状态栏还没扣库存”时继续生成下一轮。
    // Vitest 的 Node fetch 不接受浏览器相对 API URL；队列恢复本身由 postRoundOrchestrationQueue 单测覆盖，
    // 组合管线测试不触发真实 HTTP。正式 dev/build 浏览器环境始终执行恢复门。
    if (sessionId && import.meta.env.MODE !== 'test') {
      await postRoundQueue.recover(sessionId, processPostRoundOrchestration)
    }
    const runId = ++activePipelineRunId
    activePipelineSessionId = sessionId
    await hydrateSessionOrchestrationMaterials(sessionId)
    activePipelineUserAttachments = roundAttachments
    activePipelineTidiaoRunId = beginTidiaoRun()
    // 新轮起点清掉上一轮残留的导演轮级载体；当前轮由 decideRoundDirector（群聊·E2）/ runSingleChat（单聊）随后 begin。
    clearTidiaoDirectorStreamRound()
    // 批次B（2026-07-10）：scope 确认卡非阻塞化后与统筹轮解耦——新消息不再清卡（卡等用户确认/取消才消费，
    // 陈旧防治=sessionId 匹配显示+拒绝记忆+confirmStatusScope 防重）。批次4 的起新轮清卡已退役。
    activePipelineNarrationKinds = new Set<BuiltinNarrationKind>()
    // 本轮私密提调指令落到模块级载体，供 buildReplyWorkflowFinalContext / 群聊统筹注入提调上下文（只管本轮）。
    activePipelineDirectorDirectives = roundDirectorDirectives
    const normalTaskRun = startNormalMessageTaskRun({ targetId: target, sessionId })
    activePipelineTaskRunId = normalTaskRun.id
    try {
      const currentSession = getChatStoreCurrentSession(chatStore) as Record<string, unknown> | null
      const focusedActionInput = options.inputKind === 'focused_action'
      // 快速不再是人工会话模式，而是「上一轮情境检查点能否继续复用」的自动结果。
      // 首轮/变化轮/不确定轮直接完整提调；稳定续话只支付一次书童轻判，然后走现有直通正文链路。
      const automaticReplyRoute = !focusedActionInput && !purePromptReply
        ? await decideAutomaticReplyOrchestration({
            sessionId,
            userText: normalized,
            attachments: roundAttachments,
            abortSignal: normalTaskRun.controller?.signal
          })
        : null
      const replyRouteDecision = automaticReplyRoute?.decision ?? null
      const isGroupChat = shouldUseGroupChatPipeline(target, currentSession)
      const roundBackendState = resolveRoundReplyBackendState(target, currentSession, isGroupChat)
      const shouldUsePersonalityModel = roundBackendState.hasPersonalityModel
      const replyExecutionProfile = resolveReplyExecutionProfile({
        route: replyRouteDecision?.route ?? 'orchestrate',
        hasPersonalityModel: shouldUsePersonalityModel,
        mixedBackends: roundBackendState.mixedBackends,
        purePrompt: purePromptReply,
        focusedAction: focusedActionInput
      })
      const fastReplyInput = replyExecutionProfile.orchestrationDepth === 'reuse'
      beginActiveChatTurn({
        runId,
        sessionId,
        targetId: target,
        taskRunId: normalTaskRun.id,
        inputKind: focusedActionInput ? 'focused_action' : purePromptReply ? 'pure_prompt_reply' : 'plain_user_message',
        replyMode: fastReplyInput ? 'fast_reply' : purePromptReply ? 'pure_prompt' : shouldUsePersonalityModel ? 'personality_model' : 'normal_recall',
        replyExecutionProfile,
        ...(replyRouteDecision ? { replyOrchestrationDecision: replyRouteDecision } : {}),
        abortSignal: normalTaskRun.controller?.signal
      })
      const focusedActionGroupId = focusedActionInput
        ? `focused-action:${sessionId}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`
        : ''
      // Option A：存库正文用原文（显示/编辑可回溯私密指令），下游模型链路与投影仍只用 clean 的 normalized。
      activePipelineInputMessageId = await addUserMessage(
        target,
        userMessageDisplayText,
        roundAttachments,
        focusedActionInput
          ? { groupId: focusedActionGroupId, visibility: FOCUSED_ACTION_DEFAULT_VISIBILITY }
          : undefined
      )
      markActiveTurnInputMessage(activePipelineInputMessageId)
      if (!focusedActionInput) {
        const checkpointLifecycle = startReplySituationCheckpointLifecycle({
          runId,
          sessionId,
          anchorMessageId: activePipelineInputMessageId
        })
        if (fastReplyInput) await ensureReplySituationCheckpointInvalidated(checkpointLifecycle)
      }
      // caption 补完回填收口：用局部变量拷贝 messageId（不是持续读 activePipelineInputMessageId）——
      // 它是模块级可变状态，用户可能在 caption 还没跑完时已经开始下一轮，届时会被新一轮覆盖，
      // 局部拷贝保证这次的 caption 回填永远只落到这条消息，不会串到后面的消息上。
      captionBackfillMessageId = activePipelineInputMessageId
      if (captionBackfillNeeded && captionBackfillMessageId) {
        void chatStore.editMessage?.(target, captionBackfillMessageId, { attachments: captionBackfillAttachments })
      }
      // 用户消息投影改为后台 promise（2026-06-12 提速）：单聊回复工作流内"召回 ∥ 投影"并行，
      // 编排器取投影态上下文前仍必须等它完成；临时实体旁白与群聊路径在使用前先 await，保持原串行语义。
      let userProjectionPromise: Promise<void> | null = null
      if (!purePromptReply && !focusedActionInput) {
        userProjectionPromise = runReplyContextProjectionForMessage({
          sessionId,
          messageId: activePipelineInputMessageId,
          stage: 'user'
        })
        // 防未处理拒绝告警；真实错误在下游 await 处抛出
        userProjectionPromise.catch(() => undefined)
      }
      if (focusedActionInput) {
        if (userProjectionPromise) await userProjectionPromise
        await runFocusedActionPipeline({
          sessionId,
          targetId: target,
          userText: normalized,
          inputMessageId: activePipelineInputMessageId,
          actionGroupId: focusedActionGroupId,
          taskRunId: normalTaskRun.id,
          runId,
          abortSignal: normalTaskRun.controller?.signal
        })
        await runReplyContextProjectionForMessage({
          sessionId,
          messageId: activePipelineInputMessageId,
          stage: 'user'
        })
        await nextTick()
        scrollToBottom()
        const inputMessageId = activePipelineInputMessageId
        resetActivePipelineState()
        await schedulePostRoundOrchestration({ sessionId, inputMessageId, triggerKind: 'focused_action' })
        return
      }
      if (fastReplyInput) {
        let fellBackToFullOrchestration = false
        try {
          fastReplyAttempt: {
          const forcedCharacterIds = (mentionSelectedChars.value || []).map((id) => String(id || '').trim()).filter(Boolean)
          const projection = automaticReplyRoute?.directorProjection
            ?? await fetchDirectorOrchestrationProjection({
              sessionId,
              userText: normalized,
              anchorMessageId: activePipelineInputMessageId,
              forcedCharacterIds
            })
          const probabilitiesByCharacterId = Object.fromEntries(
            normalizeChatSessionCharacterParticipants(currentSession)
              .map((member: any) => [
                String(member.characterId || member.character_id || '').trim(),
                Number(member.replyProbability ?? member.reply_probability ?? member.probability ?? 100)
              ])
              .filter(([characterId]) => Boolean(characterId))
          )
          const speakers = planFastReplySpeakers({
            candidates: projection.candidates,
            probabilitiesByCharacterId,
            forcedCharacterIds
          })
          if (!speakers.length) {
            // 轻判只回答“情境能否复用”，不替代正式在场性计算。如果二者不一致，
            // 保留当前轮和 @ 选择，直接升级完整统筹，不从未知/离场角色中偷做兜底。
            fellBackToFullOrchestration = true
            const fallbackRouteDecision = replyRouteDecision
              ? {
                  ...replyRouteDecision,
                  route: 'orchestrate' as const,
                  reason: '情境可续接，但正式在场性计算没有选出回复者，已升级完整统筹',
                  confidence: 1,
                  reusedScenario: null
                }
              : undefined
            chatTurnRunner.updateContext({
              replyMode: shouldUsePersonalityModel ? 'personality_model' : 'normal_recall',
              replyExecutionProfile: resolveReplyExecutionProfile({
                route: 'orchestrate',
                hasPersonalityModel: shouldUsePersonalityModel,
                mixedBackends: roundBackendState.mixedBackends,
                purePrompt: false,
                focusedAction: false
              }),
              ...(fallbackRouteDecision ? { replyOrchestrationDecision: fallbackRouteDecision } : {})
            })
            console.info('情境续接命中但无正式在场回复者，已升级完整提调')
            break fastReplyAttempt
          }
          updateRoundReplyExecutionProfileForSelectedSpeakers({
            targetId: target,
            session: currentSession,
            group: isGroupChat,
            characterIds: speakers.map((speaker) => speaker.characterId)
          })
          safePlannedGroupSpeakers.value = speakers.map((speaker) => ({ id: speaker.characterId, name: speaker.displayName }))
          // 先把正式选出的首位角色露给消息流，再等用户消息投影和生成尝试登记；
          // 用户消息落库后不再出现一段“什么都没发生”的空白等待。
          setTyping(chatStore, true)
          safeCurrentStreamingSpeakerName.value = speakers[0].displayName
          safeCurrentStreamingTargetId.value = target
          await nextTick()
          scrollToBottom()
          if (userProjectionPromise) await userProjectionPromise
          let insertAfterMessageId = activePipelineInputMessageId
          const priorSpeakerNames: string[] = []
          for (let speakerIndex = 0; speakerIndex < speakers.length; speakerIndex += 1) {
            const speaker = speakers[speakerIndex]
            assertPipelineCanContinue(runId, normalTaskRun.id)
            setTyping(chatStore, true)
            safeCurrentStreamingSpeakerName.value = speaker.displayName
            safeCurrentStreamingTargetId.value = target
            safePlannedGroupSpeakers.value = speakers.slice(speakerIndex).map((item) => ({ id: item.characterId, name: item.displayName }))
            activeGenerationAttemptId = await startGenerationAttempt({
              sessionId,
              anchorMessageId: activePipelineInputMessageId,
              triggerType: 'normal_send',
              mode: 'clean',
              targetId: speaker.characterId,
              speakerName: speaker.displayName
            })
            markActiveTurnGenerationAttempt(activeGenerationAttemptId)
            const result = await runSingleChat(target, normalized, runId, normalTaskRun.id, normalTaskRun.controller?.signal, {
              speakerTargetId: speaker.characterId,
              localInsertAfterMessageId: insertAfterMessageId,
              userProjectionPromise,
              fastReplyPlanningHint: buildFastReplyPlanningHint({
                speakerName: speaker.displayName,
                userText: normalized,
                priorSpeakerNames
              }),
              fastReply: true,
              suppressNarration: true
            })
            if (!result.assistantMessageIds.length) {
              markReplySituationCheckpointFailure(`${speaker.displayName} 的角色正文未成功落库`)
            }
            insertAfterMessageId = Number(result.assistantMessageIds[result.assistantMessageIds.length - 1] || insertAfterMessageId)
            priorSpeakerNames.push(speaker.displayName)
          }
          await finalizeReplySituationCheckpoint({
            runId,
            last: replyRouteDecision?.reusedScenario
              ? {
                  code: replyRouteDecision.reusedScenario.code,
                  ...(replyRouteDecision.reusedScenario.label ? { label: replyRouteDecision.reusedScenario.label } : {}),
                  ...(replyRouteDecision.reusedScenario.summary ? { summary: replyRouteDecision.reusedScenario.summary } : {})
                }
              : null
          })
          resetActivePipelineState()
          // reuse 只允许「同一情境、无事实/状态变化」的自然续话；用户与角色消息仍各自完成事实投影，
          // 但不再为已确认检查点重复启动整轮轮后提调。下一轮若检测到变化，会自动回到完整统筹。
          return
          }
        } finally {
          if (!fellBackToFullOrchestration && activePipelineRunId === runId) {
            setTyping(chatStore, false)
            streamingText.value = ''
            safeCurrentStreamingSpeakerName.value = ''
            safeCurrentStreamingTargetId.value = ''
            safePlannedGroupSpeakers.value = []
            mentionSelectedChars.value = []
            if (activePipelineTaskRunId === normalTaskRun.id) resetActivePipelineState()
            await nextTick()
            scrollToBottom()
          }
        }
      }
      if (!isGroupChat) {
        activeGenerationAttemptId = await startGenerationAttempt({
          sessionId,
          anchorMessageId: activePipelineInputMessageId,
          triggerType: 'normal_send',
          mode: 'clean',
          targetId: target,
          speakerName: getTargetName(target)
        })
        markActiveTurnGenerationAttempt(activeGenerationAttemptId)
      }
      activateRoundUsageContext(target)
      const mentionedSessionTemporaryCharacter = await resolveMentionedSessionTemporaryCharacterForReply(sessionId, normalized)
      if (mentionedSessionTemporaryCharacter) {
        await ensureReplySituationCheckpointInvalidated()
        if (userProjectionPromise) await userProjectionPromise
        markActiveTurnTemporaryEntityNarration()
        await runSessionTemporaryCharacterNarrationBeforeReply({
          sessionId,
          targetId: target,
          userText: normalized,
          character: mentionedSessionTemporaryCharacter,
          runId
        })
        resetActivePipelineState()
        mentionSelectedChars.value = []
        return
      }
      const sessionTemporaryCharacterResult = await resolveUnknownSessionTemporaryMentionBeforeReply(sessionId, normalized)
      if (sessionTemporaryCharacterResult.handled) {
        await ensureReplySituationCheckpointInvalidated()
        if (sessionTemporaryCharacterResult.item) {
          if (userProjectionPromise) await userProjectionPromise
          markActiveTurnTemporaryEntityNarration()
          await runSessionTemporaryCharacterNarrationBeforeReply({
            sessionId,
            targetId: target,
            userText: normalized,
            character: sessionTemporaryCharacterResult.item,
            runId
          })
        }
        resetActivePipelineState()
        mentionSelectedChars.value = []
        return
      }
      if (!isPipelineRunCurrent(runId) || isStopRequested(chatStore)) {
        await ensureReplySituationCheckpointInvalidated()
        resetActivePipelineState()
        return
      }
      if (!purePromptReply) {
        await runChatPreReplyEffects({
          targetId: target,
          userText: normalized,
          sessionId,
          runDynamicWorldDueProgressionBeforeReply,
          onDynamicWorldProgressionError: (error) => console.warn('动态事件推进失败，停止本轮回复链路:', error)
        })
      }
      if (!isPipelineRunCurrent(runId) || isStopRequested(chatStore)) {
        await ensureReplySituationCheckpointInvalidated()
        resetActivePipelineState()
        return
      }
      if (isGroupChat) {
        try {
          // 群聊路径保持原串行语义：进入多角色编排前等用户消息投影完成
          if (userProjectionPromise) await userProjectionPromise
          await runGroupChat(target, normalized, runId, normalTaskRun.controller?.signal)
        } finally {
          if (isPipelineRunCurrent(runId)) {
            resetActivePipelineState()
          }
        }
        return
      }
      try {
        // 方向A 统一导演入口（2026-06-28 转正·单聊=N=1 群聊；旧 directorStream:true 自判 OFF 分支已退役·
        //   见 docs/history/2026-06-27_退役-单聊群聊分裂导演/）：
        //   ① 先走轮级导演 decideRoundDirector(cast=[本角色])——判情境(scenarioCode/Body)、定旁白(narrationCalls)、
        //      定该角色方向，并 begin 决策流轮级载体（与群聊同一套 groupDirectorHarness 谱系，锚用户消息）。
        //   ② 再跑唯一发言者分镜 runSingleChat(directorStream:false)：吃 providedScenario 不自判情境、旁白走 F3 归提调
        //      （workflow 首发言者据 activeRoundDirector.narrationCalls 一次性生成、want=false 真无旁白）。
        //   降级：decideRoundDirector 失败/空时 activeRoundDirector 保持 null → 分镜回退自判情境 + per-character 旁白臂
        //      （无导演带，与群聊统筹失败回退同语义）。
        // 统一聊天投影是提调/角色配方的必需输入；先等当前用户消息投影完成，避免 bundle 只看见上一轮。
        if (userProjectionPromise) await userProjectionPromise
        try {
          await decideRoundDirector({
            userText: normalized,
            groupMembers: [{ characterId: target }],
            targetId: target,
            abortSignal: normalTaskRun.controller?.signal
          })
        } finally {
          // 完整轮先让导演读取真实上一情境；导演收束（含失败）后、角色正文开工前再持久化失效。
          await ensureReplySituationCheckpointInvalidated()
        }
        // 真机五验④（2026-07-05）：单聊角色子工作流失败先自动重试一次（5s 缓冲）；仍失败登记可重试单元后照旧上抛
        //（单聊只有一位发言者·轮 failed 语义不变），用户在提调框说「重试」即可由 retryFailedWorkflow 重跑。
        clearRoundRetryUnits(sessionId, activePipelineInputMessageId)
        try {
          const singleResult = await runWithAutoRetry(
            () => runSingleChat(target, normalized, runId, normalTaskRun.id, normalTaskRun.controller?.signal, {
              speakerTargetId: target,
              userProjectionPromise,
              // 穿插旁白预生成（批C1-②）：单聊=N=1 群聊——本角色既是「非末位」也是「末位」，正文生成完的瞬间
              // 一并预起跑其名下穿插旁白 + round_end 段；fallback 锚点=本轮用户消息（尚无更晚的已知锚点）。
              onAssistantContentComposed: ({ text }) => {
                prefetchRoundInterleavedNarration({
                  targetId: target,
                  speakerCharacterId: target,
                  liveAssistantText: text,
                  liveSpeakerName: getTargetName(target),
                  fallbackInsertAfterMessageId: activePipelineInputMessageId || undefined,
                  abortSignal: normalTaskRun.controller?.signal
                })
                prefetchRoundInterleavedNarration({
                  targetId: target,
                  speakerCharacterId: null,
                  liveAssistantText: text,
                  liveSpeakerName: getTargetName(target),
                  fallbackInsertAfterMessageId: activePipelineInputMessageId || undefined,
                  abortSignal: normalTaskRun.controller?.signal
                })
              }
            }),
            {
              signal: normalTaskRun.controller?.signal,
              shouldAbort: () => isStopRequested(chatStore) || !isPipelineRunCurrent(runId),
              onRetry: () => console.warn(`角色子工作流生成失败，5s 后自动重试一次：${getTargetName(target)}`)
            }
          )
          // 旁白穿插（单聊=N=1 群聊同语义）：角色消息落库后生成锚在该角色之后的旁白；
          // 再收束已起跑段 → 轮末 flush（round_end + 兜底）→ 统一收束。开场子集仍在 runSingleChat 内首发言者起跑。
          const singleLastAssistantId = Number(
            singleResult?.assistantMessageIds?.[singleResult.assistantMessageIds.length - 1] || 0
          )
          if (!singleResult?.assistantMessageIds?.length) {
            markReplySituationCheckpointFailure(`${getTargetName(target)} 的角色正文未成功落库`)
          }
          const singleNarrationAnchor = singleLastAssistantId || activePipelineInputMessageId
          await flushRoundInterleavedNarration({
            targetId: target,
            speakerCharacterId: target,
            insertAfterMessageId: singleNarrationAnchor,
            abortSignal: normalTaskRun.controller?.signal
          })
          if (!normalTaskRun.controller?.signal?.aborted && !isStopRequested(chatStore) && isPipelineRunCurrent(runId)) {
            await settleRoundInterleavedNarration()
            await flushRoundInterleavedNarration({
              targetId: target,
              speakerCharacterId: null,
              insertAfterMessageId: singleNarrationAnchor,
              abortSignal: normalTaskRun.controller?.signal
            })
          }
          await settleRoundInterleavedNarration()
          if (activeRoundDirector?.roundDirectorNarration) {
            await activeRoundDirector.roundDirectorNarration.completion
          }
          const factCommit = scheduleNarrativeFactCommit({ throwOnError: true })
          scheduleBackgroundWorldEvolution(factCommit)
          await factCommit
          await finalizeReplySituationCheckpoint({ runId })
        } catch (error) {
          if (!(isAbortError(error) || normalTaskRun.controller?.signal?.aborted || isStopRequested(chatStore) || !isPipelineRunCurrent(runId))) {
            registerRoundRetryUnit({
              id: `actor:${target}`,
              kind: 'actor',
              label: `${getTargetName(target)} 消息生成`,
              sessionId,
              anchorMessageId: activePipelineInputMessageId,
              lastError: error instanceof Error ? error.message : String(error || '生成失败'),
              attempts: 1,
              payload: { kind: 'actor', speakerTargetId: target, userText: normalized }
            })
          }
          throw error
        }
      } finally {
        if (isPipelineRunCurrent(runId)) {
          resetActivePipelineState()
        }
      }
    } catch (error) {
      try {
        await ensureReplySituationCheckpointInvalidated()
      } catch (invalidateError) {
        console.error('[reply-situation-checkpoint] 失败轮持久化失效未完成:', invalidateError)
      }
      await finishGenerationAttempt({
        attemptId: activeGenerationAttemptId,
        sessionId,
        status: 'failed',
        error
      })
      failNormalMessageTaskRun(normalTaskRun.id, error)
      throw error
    } finally {
      completeNormalMessageTaskRun(normalTaskRun.id)
    }
  }

  // O-B2·重生成接续基线：取这条消息「已落库的导演带快照」作为续跑基线。
  // 内存优先（本会话首次生成后 finalize 把 processTrace 写在消息对象上，未刷新可直接取）；
  // 缺失（刷新后消息无 in-memory processTrace，directorStream 只在 observations）则 fetch 本会话 observations 兜底。
  // 无基线返回 null（新一轮从空载体起步，不接续）。
  // R3-2b：基线 = directorStream 视图快照 + appendLog 保真事件（同 artifact 共生，一次解析取回两者）。
  //   directorStream 给 carryOver（视图：旧决策保留）；appendLog seed 回内存活动 log（保真：旧工具结果/报错供 R3-3 投影/R3-4 检索）。
  // resolveMessageDirectorBaseline：批次3a 移入 tidiaoCorrectionAssembly（重生成/精修/纠偏三处共用·经顶部 import 引入）。

  // 批次1(D)·续接带原始指令：读这条消息「已落库提调带」里记录的「用户原始纠偏指令」
  //（批次2 artifact 的 payload.processSummary.userInstruction）。异常终止/刷新后（无内存挂起态）、
  // 或 clean-stop（pending.correction 常为空）续接时，据它把用户的原始命令高权重回灌、不丢「旁白扩充500字」这类指令。
  // 真取消（demote）已清空 payload，故不会捞到已取消任务的指令。无则返回空串。
  async function resolveMessageDirectorOriginalInstruction(messageId: number): Promise<string> {
    const sessionId = getActiveSessionId(chatStore)
    const mid = Number(messageId || 0)
    if (!sessionId || mid <= 0) return ''
    try {
      const page = await fetchChatPersonalityModelObservationsBySessionId(sessionId)
      const traces = Array.isArray(page?.traces) ? page.traces : []
      let latest = ''
      let latestAt = ''
      for (const trace of traces) {
        const record = trace as unknown as Record<string, unknown>
        if (Number(record?.messageId || 0) !== mid) continue
        const payload = (record?.payload && typeof record.payload === 'object') ? record.payload as Record<string, unknown> : {}
        const summary = payload.processSummary as Record<string, unknown> | undefined
        const instruction = String(summary?.userInstruction || '').trim()
        if (!instruction) continue
        const at = String(record?.createdAt || record?.created_at || '')
        // 取 createdAt 最新的一条（同一指令多轮续接会重存同值，取最新无副作用）。
        if (!latest || at >= latestAt) { latest = instruction; latestAt = at }
      }
      return latest
    } catch (error) {
      console.error('读提调原始纠偏指令失败（按无指令处理）:', error)
      return ''
    }
  }

  // 批次 M1a（提调式重试，路 B）：重试一条单聊角色消息走真·导演 loop。
  // 自包含、不改 runSingleChat / 正常发送写回一行：解析被重试消息 + 前置用户消息（anchor）→ begin 轮级载体
  // → buildReplyWorkflowFinalContext（onDirectorStream 驱动 band、suppressNarration 不再生成新旁白）
  // → setTidiaoDirectorStreamRoundLinks（编排入口）→ 系统提示词装配 → buildFinalOutboundPrompt → callAIStream 出正文。
  // 返回 { replyText, model, promptLogId }（不写库，由调用方 regenerateMsg 走版本写回）；
  // 软停（停止→纠偏）：loop 当前步跑完后软停 → AbortError → markCorrecting 出纠偏框、返回 null（不写回不报错）。
  // 仅单聊角色消息重试用（旁白/自定义旁白/纯净回复/群聊不走此方法，由调用方门控并回退旧重试）。
  async function regenerateAssistantViaDirector(
    messageId: number,
    options: { instruction?: string; correctionText?: string } = {}
  ): Promise<{ replyText: string; model: string; promptLogId: string; directorStream: TidiaoDirectorStream | null } | null> {
    const target = getActiveTargetId(chatStore)
    const sessionId = getActiveSessionId(chatStore)
    if (!target || !sessionId) return null
    if (shouldUsePurePromptReply()) return null
    const list = getCurrentMessageList(chatStore) as Array<Record<string, unknown>>
    const targetIndex = list.findIndex((m) => Number(m?.id || 0) === Number(messageId))
    if (targetIndex < 0) return null
    const targetMessage = list[targetIndex]
    // anchor = 被重试消息前面最近一条用户消息（导演带挂它之后、用户文本取它内容）。
    const anchorUser = [...list.slice(0, targetIndex)].reverse().find((m) => m?.role === 'user') || null
    const anchorMessageId = Number(anchorUser?.id || 0)
    const userText = String(anchorUser?.content || '').trim()
    if (!userText) return null
    const speakerTargetId = String(
      targetMessage?.speakerTargetId ?? targetMessage?.speaker_target_id
      ?? targetMessage?.memberTargetId ?? targetMessage?.member_target_id ?? ''
    ).trim() || target
    const speakerName = getTargetName(speakerTargetId) || getTargetName(target)
    const mode: ReplyWorkflowMode = shouldUsePersonalityModelReply(speakerTargetId) ? 'personality_model' : 'normal_recall'
    if (mode === 'personality_model') {
      const character = resolveReplyTargetCharacter(speakerTargetId)
      const personalityModelPath = String((character as Record<string, unknown> | null)?.personalityModelPath || '').trim()
      if (!personalityModelPath) return null
    }

    stopActiveReplyRuntime(chatStore)
    clearStopRequest(chatStore)
    const runId = ++activePipelineRunId
    activePipelineSessionId = sessionId
    activePipelineInputMessageId = anchorMessageId
    // 重放路径不产生新附件（批4）：清零防误读上一轮 sendText 留下的 activePipelineUserAttachments。
    activePipelineUserAttachments = []
    activePipelineTidiaoRunId = beginTidiaoRun()
    const directorStreamRunId = activePipelineTidiaoRunId
    const normalTaskRun = startNormalMessageTaskRun({ targetId: target, sessionId })
    activePipelineTaskRunId = normalTaskRun.id
    // 消耗溯源：导演重试的所有模型调用并入原轮总账（roundId=锚定轮），unitKind 区分返工。
    activateRoundUsageContext(target, 'regenerate')
    const abortSignal = normalTaskRun.controller?.signal
    // 批次M1b·重试 brief：把「被重试消息原文 + 用户修改意见」作为正式 brief 注入系统提示词（仿 replanBrief），
    // 让决策流出「揣测重试意图」（无意见）/「按你意见改这条」（有意见）的人话决策——取代 M1a 的轻量 append userText。
    const instruction = String(options.instruction || '').trim()
    const retryBrief: TidiaoRetryBrief = {
      originalText: String(targetMessage?.content || '').trim(),
      ...(instruction ? { instruction } : {})
    }

    // 批次M1b·纠偏续跑：correctionText 非空 = 用户在重试软停后输入纠偏点「继续」——
    // clear 前（载体仍是上一轮 correcting 态）抽取 carryOver（旧决策保留追加，给视图）+ replanBrief（给模型据纠偏重排）。
    const correctionText = String(options.correctionText || '').trim()
    const directorReplanBrief = correctionText ? captureTidiaoDirectorReplanBrief(correctionText, sessionId) : null
    // O-B2·重生成接续累加：导演带 = 这条消息的「完整编排史」，不按版本切换、一条带记全程。
    // ① 纠偏续跑（active round 仍在 correcting 态）：carryOver 取活动轮（已含上一轮全部决策）。
    // ② 普通重生成 / 刷新后续跑（active round 已清）：carryOver 取「这条消息已落库的导演带」接续——
    //    内存优先（首次生成 finalize 写的 processTrace），缺失（刷新后）则 fetch 本会话 observations 兜底。
    // R3-2b：beginTidiaoRun 已用新 runId 起空 log（旧轮事件丢内存）；从基线 seed 回保真历史，让 append log 跨轮累积。
    const baseline = await resolveMessageDirectorBaseline(targetMessage, sessionId, messageId)
    restoreAppendLog({ runId: directorStreamRunId, sessionId, events: baseline.appendLog, directorPrompt: baseline.directorPrompt })
    let directorCarryOver = correctionText ? captureTidiaoDirectorCarryOver(correctionText, readUserAddressName(), sessionId) : null
    if (!directorCarryOver) {
      directorCarryOver = buildTidiaoDirectorCarryOverFromStream(
        baseline.directorStream,
        correctionText ? { separatorText: `据${readUserAddressName()}纠偏调整：${correctionText}` } : {}
      )
    }

    setCurrentMessageModel(chatStore, '')
    streamingText.value = ''
    clearTidiaoDirectorStreamRound()
    beginTidiaoDirectorStreamRound({
      runId: directorStreamRunId,
      sessionId,
      anchorMessageId,
      speakerName,
      carryOver: directorCarryOver
    })
    let promptLogId = ''
    try {
      const recallBypass = resolveRecallBypassForSpeaker({ speakerTargetId, speakerName, inputMessageId: anchorMessageId })
      const result = await buildReplyWorkflowFinalContext({
        mode,
        targetId: target,
        speakerTargetId,
        speakerName,
        userText,
        taskRunId: normalTaskRun.id,
        abortSignal,
        recallBypass,
        userProjectionPromise: null,
        // M1a：只重生成该角色正文，不再生成新旁白。
        suppressNarration: true,
        // 批次M1b·重试 brief：被重试消息原文 + 用户意见，注入系统提示词驱动「揣测意图/按意见改这条」决策。
        retryBrief,
        // 批次M1b·纠偏续跑：续跑时透传重规划 brief，让模型据纠偏真重读情境/推翻重排（与 retryBrief 并存）。
        replanBrief: directorReplanBrief,
        onDirectorStream: (stream: TidiaoDirectorStream) => {
          updateTidiaoDirectorStreamRound(directorStreamRunId, stream)
          // 批次3·统一锚到用户消息（2026-06-22）：单聊重试漏接补齐——决策流每更新就节流增量持久化，
          // 锚到该轮用户消息（anchorMessageId），重试跑一半刷新/崩溃也保住已做的决策。
          // 注：成功收尾后 ops 另写一条锚到「被重试角色消息」的版本化 clean_retry（带 versionIndex），二者读侧去重取最全。
          void persistDirectorStreamRoundIncremental({
            runId: directorStreamRunId, sessionId, targetId: speakerTargetId,
            anchorRoundMessageId: anchorMessageId, speakerName,
            snapshot: captureTidiaoDirectorStreamSnapshot(directorStreamRunId), triggerType: 'normal_send'
          })
        }
      })
      // 编排入口：编排就绪折叠运行态编排到轮级载体，band 据此挂「编排」入口（复用既有审计面板）。
      setTidiaoDirectorStreamRoundLinks(directorStreamRunId, {
        orchestrationAudit: {
          speakerName,
          orchestration: result.orchestration,
          topPlans: result.topPlans,
          expressionMix: result.expressionMix,
          state: 'success'
        }
      })
      assertPipelineCanContinue(runId, normalTaskRun.id)
      const promptLibraryAssembly = await buildPersonalityPromptLibrarySystemAssembly({
        targetId: target,
        speakerTargetId,
        taskRunId: normalTaskRun.id,
        userIdentityChangeNotice: recallBypass.userIdentityChangeNotice,
        scenarioMountedPromptText: result.scenarioMountedPromptText
      })
      const messages = await buildFinalOutboundPrompt({
        buildChatMessages: buildChatMessages as any,
        targetId: target,
        userText,
        sourceMessages: [],
        speakerTargetId,
        options: {
          personalityModelContext: {
            characterId: speakerTargetId,
            characterName: speakerName,
            characterIdentity: result.characterIdentity,
            promptLibrarySystemPrompt: promptLibraryAssembly.systemPrompt,
            // #6 稳健兜底：真实挂载文本传入 + buildPersonalityFinalPrompt 内去重（占位吸收则不重复、缺占位则直接注入）。
            scenarioMountedPromptText: result.scenarioMountedPromptText,
            currentUserInput: userText,
            compressedContext: result.context.compressedContext,
            topPlans: result.topPlans,
            expressionMix: result.expressionMix,
            wordCountAdvice: result.wordCountAdvice
          },
          taskRunId: normalTaskRun.id,
          abortSignal
        }
      }) as Array<{ role: ChatRole; content: string }>
      assertPipelineCanContinue(runId, normalTaskRun.id)
      let fullReply = ''
      let usedModel = ''
      const returnedText = await callAIStream(
        messages,
        {
          ...getAIOptions(speakerTargetId),
          signal: abortSignal,
          usageLabel: `重新生成：${speakerName}`,
          placeLabel: `会话：${getTargetName(target)}`,
          placeType: target === speakerTargetId ? 'single' : 'group',
          onPromptPrepared: async ({ messages: preparedMessages, finalPrompt, promptBlocks }: {
            messages: Array<{ role: ChatRole; content: string }>
            finalPrompt: string
            promptBlocks?: ChatPromptLogBlock[]
          }) => {
            try {
              const log = await createChatPromptLogBySessionId(sessionId, {
                speakerName,
                targetId: speakerTargetId,
                finalPrompt,
                promptBlocks: promptBlocks ?? buildPromptBlocksFromPreparedMessages(preparedMessages, 'assistant-message-retry-messages')
              })
              promptLogId = String(log.id || '')
            } catch (error) {
              console.error('记录重试提示词日志失败:', error)
            }
          }
        },
        (chunk: string) => {
          if (!isPipelineRunCurrent(runId, normalTaskRun.id) || isStopRequested(chatStore)) return
          fullReply += chunk
          streamingText.value = getVisibleTextFromEmbeddedProjectionOutput(fullReply)
          scrollToBottom()
        },
        {
          onModelInfo: (model: string) => {
            usedModel = model
            setCurrentMessageModel(chatStore, model)
          }
        }
      )
      assertPipelineCanContinue(runId, normalTaskRun.id)
      const normalizedReply = cleanAiPrefix(parseEmbeddedMessageProjectionOutput(normalizeAiOutputText(returnedText || fullReply)).visibleText)
      if (!hasVisibleAiReplyBody(normalizedReply)) {
        toast('模型没有返回可显示的回复，请稍后重试或换个预设', 'warning')
        return null
      }
      // O-B2：返回本轮「累加后的完整快照」（含接续基线 + 本次新决策），由 regenerateMsg 落进 clean_retry artifact，
      // 刷新后历史复原走新带、一条带累加所有版本的编排变更记录。
      const directorStream = captureTidiaoDirectorStreamSnapshot(directorStreamRunId)
      // 批次3·统一锚到用户消息：重试成功 flush 最终快照锚到用户消息 + 收 attempt（与 ops 的版本化 clean_retry 同条带、读侧去重）。
      await persistDirectorStreamRoundIncremental({
        runId: directorStreamRunId, sessionId, targetId: speakerTargetId,
        anchorRoundMessageId: anchorMessageId, speakerName,
        snapshot: directorStream, flush: true, triggerType: 'normal_send'
      })
      finalizeDirectorStreamPersist(directorStreamRunId)
      return { replyText: normalizedReply, model: usedModel, promptLogId, directorStream }
    } catch (err) {
      // 真错误：标任务失败 + 把编排带停在 failed 态（不消失、显示原因+可重试）+ 交调用方 toast。
      if (isAbortError(err)) {
        // 停止=中断保留（2026-07-08 用户拍板）：有决策内容→带转 correcting 挂起（半成品原地保留·flush 落库·
        // 刷新可复原·可「继续」接续）；无内容→旧口径清带降权。
        const stoppedSnapshot = captureTidiaoDirectorStreamSnapshot(directorStreamRunId)
        if (stoppedSnapshot) {
          markTidiaoDirectorStreamRoundCorrecting(directorStreamRunId, '')
          await persistDirectorStreamRoundIncremental({
            runId: directorStreamRunId, sessionId, targetId: speakerTargetId,
            anchorRoundMessageId: anchorMessageId, speakerName,
            snapshot: captureTidiaoDirectorStreamSnapshot(directorStreamRunId), flush: true, triggerType: 'normal_send'
          })
          finalizeDirectorStreamPersist(directorStreamRunId)
        } else {
          clearTidiaoDirectorStreamRound(directorStreamRunId)
          demoteDirectorStreamPersist(directorStreamRunId)
        }
        return null
      }
      markTidiaoDirectorStreamRoundFailed(directorStreamRunId, err instanceof Error ? err.message : '提调编排失败')
      // 批次3：失败把 failed 态决策流 flush 落库锚到用户消息（不消失、刷新仍见失败原因）。
      await persistDirectorStreamRoundIncremental({
        runId: directorStreamRunId, sessionId, targetId: speakerTargetId,
        anchorRoundMessageId: anchorMessageId, speakerName,
        snapshot: captureTidiaoDirectorStreamSnapshot(directorStreamRunId), flush: true, triggerType: 'normal_send'
      })
      finalizeDirectorStreamPersist(directorStreamRunId)
      failNormalMessageTaskRun(normalTaskRun.id, err)
      throw err
    } finally {
      // 任务失败时此处为 no-op（任务已 inactive）；其余路径正常收口。
      completeNormalMessageTaskRun(normalTaskRun.id)
      if (isPipelineRunCurrent(runId, normalTaskRun.id)) {
        setCurrentMessageModel(chatStore, '')
        streamingText.value = ''
      }
    }
  }

  // 批次2·步骤2b：读回该消息原轮「已定方向」结构化真值（2a 落库的 processSummary.directedRecast）。
  // 供 ops 路由：有源则定向重掷、无源（null）则落完整导演 loop（U2 转正·开关已删·定向重掷永久常开）。
  // 按 messageId 取最新一条带 directedRecast 的 trace（与 resolveMessageDirectorOriginalInstruction 同读源·同范式）。
  async function resolveMessageDirectedRecast(
    messageId: number
  ): Promise<{ scenarioCode: string; scenarioBody: string; direction: string } | null> {
    const sessionId = getActiveSessionId(chatStore)
    const mid = Number(messageId || 0)
    if (!sessionId || mid <= 0) return null
    try {
      const page = await fetchChatPersonalityModelObservationsBySessionId(sessionId)
      const traces = Array.isArray(page?.traces) ? page.traces : []
      let latest: { scenarioCode: string; scenarioBody: string; direction: string } | null = null
      let latestAt = ''
      for (const trace of traces) {
        const record = trace as unknown as Record<string, unknown>
        if (Number(record?.messageId || 0) !== mid) continue
        const payload = (record?.payload && typeof record.payload === 'object') ? record.payload as Record<string, unknown> : {}
        const summary = payload.processSummary as Record<string, unknown> | undefined
        const recast = summary?.directedRecast as Record<string, unknown> | undefined
        const scenarioCode = String(recast?.scenarioCode || '').trim()
        const scenarioBody = String(recast?.scenarioBody || '').trim()
        if (!scenarioCode || !scenarioBody) continue
        const at = String(record?.createdAt || record?.created_at || '')
        if (!latest || at >= latestAt) {
          latest = { scenarioCode, scenarioBody, direction: String(recast?.direction || '').trim() }
          latestAt = at
        }
      }
      return latest
    } catch (error) {
      console.error('读原轮已定方向（定向重掷源）失败（按无源降级）:', error)
      return null
    }
  }

  // 批次2·步骤2b：定向重掷——按原轮已定方向只重掷角色正文的轻量重试。
  // 与 regenerateAssistantViaDirector（完整导演 loop 重试）联动：二者解析消息/anchor/speaker、生成与提示词日志口径一致，
  // 但本方法不进导演 loop、不重判情境（吃读回的 providedScenario）、不重做旁白（suppressNarration）、不动决策流带
  //（不 begin/persist directorStream，返回时调用方不回填带）。与群聊 per-speaker 演员活分镜
  //（runSingleChat directorStream:false 吃 providedScenario + directorNote 注入方向 :4095）同链路。
  // 后续若统一改 regenerateAssistantViaDirector，本方法解析/写回口径需同步。
  // 返回 {status:'recast',...}=成功；{status:'softstop'}=软停/取消/空回复（不写回·保留旧版本）；
  //      {status:'unavailable'}=开关关/无方向源/不适用（调用方降级现役路）。纯净回复不走（调用方门控）。
  async function regenerateAssistantViaDirectedRecast(
    messageId: number
  ): Promise<{ status: 'recast'; replyText: string; model: string; promptLogId: string } | { status: 'softstop' | 'unavailable' }> {
    const target = getActiveTargetId(chatStore)
    const sessionId = getActiveSessionId(chatStore)
    if (!target || !sessionId) return { status: 'unavailable' }
    if (shouldUsePurePromptReply()) return { status: 'unavailable' }
    const recast = await resolveMessageDirectedRecast(messageId)
    if (!recast) return { status: 'unavailable' }
    const list = getCurrentMessageList(chatStore) as Array<Record<string, unknown>>
    const targetIndex = list.findIndex((m) => Number(m?.id || 0) === Number(messageId))
    if (targetIndex < 0) return { status: 'unavailable' }
    const targetMessage = list[targetIndex]
    const anchorUser = [...list.slice(0, targetIndex)].reverse().find((m) => m?.role === 'user') || null
    const anchorMessageId = Number(anchorUser?.id || 0)
    const baseUserText = String(anchorUser?.content || '').trim()
    if (!baseUserText) return { status: 'unavailable' }
    const speakerTargetId = String(
      targetMessage?.speakerTargetId ?? targetMessage?.speaker_target_id
      ?? targetMessage?.memberTargetId ?? targetMessage?.member_target_id ?? ''
    ).trim() || target
    const speakerName = getTargetName(speakerTargetId) || getTargetName(target)
    const mode: ReplyWorkflowMode = shouldUsePersonalityModelReply(speakerTargetId) ? 'personality_model' : 'normal_recall'
    if (mode === 'personality_model') {
      const character = resolveReplyTargetCharacter(speakerTargetId)
      const personalityModelPath = String((character as Record<string, unknown> | null)?.personalityModelPath || '').trim()
      if (!personalityModelPath) return { status: 'unavailable' }
    }
    // 原轮已定方向注入正文提示词（与 runSingleChat 演员活 directorNote 同口径 :4095）；不改写已存用户消息。
    const directorNote = recast.direction ? `\n\n【本轮导演安排】${recast.direction}` : ''
    const userText = `${baseUserText}${directorNote}`

    stopActiveReplyRuntime(chatStore)
    clearStopRequest(chatStore)
    const runId = ++activePipelineRunId
    activePipelineSessionId = sessionId
    activePipelineInputMessageId = anchorMessageId
    // 重放路径不产生新附件（批4）：清零防误读上一轮 sendText 留下的 activePipelineUserAttachments。
    activePipelineUserAttachments = []
    activePipelineTidiaoRunId = beginTidiaoRun()
    const normalTaskRun = startNormalMessageTaskRun({ targetId: target, sessionId })
    activePipelineTaskRunId = normalTaskRun.id
    // 消耗溯源：定向重掷并入原轮总账。
    activateRoundUsageContext(target, 'regenerate')
    const abortSignal = normalTaskRun.controller?.signal
    setCurrentMessageModel(chatStore, '')
    streamingText.value = ''
    let promptLogId = ''
    try {
      const recallBypass = resolveRecallBypassForSpeaker({ speakerTargetId, speakerName, inputMessageId: anchorMessageId })
      const result = await buildReplyWorkflowFinalContext({
        mode,
        targetId: target,
        speakerTargetId,
        speakerName,
        userText,
        taskRunId: normalTaskRun.id,
        abortSignal,
        recallBypass,
        userProjectionPromise: null,
        // 定向重掷：只重掷该角色正文、不再生成新旁白。
        suppressNarration: true,
        // 定向重掷命门：吃原轮已定情境，harness 跳过 readScenarioSkill；不传 onDirectorStream=不进导演 loop。
        providedScenario: { code: recast.scenarioCode, body: recast.scenarioBody }
      })
      assertPipelineCanContinue(runId, normalTaskRun.id)
      const promptLibraryAssembly = await buildPersonalityPromptLibrarySystemAssembly({
        targetId: target,
        speakerTargetId,
        taskRunId: normalTaskRun.id,
        userIdentityChangeNotice: recallBypass.userIdentityChangeNotice,
        scenarioMountedPromptText: result.scenarioMountedPromptText
      })
      const messages = await buildFinalOutboundPrompt({
        buildChatMessages: buildChatMessages as any,
        targetId: target,
        userText,
        sourceMessages: [],
        speakerTargetId,
        options: {
          personalityModelContext: {
            characterId: speakerTargetId,
            characterName: speakerName,
            characterIdentity: result.characterIdentity,
            promptLibrarySystemPrompt: promptLibraryAssembly.systemPrompt,
            scenarioMountedPromptText: result.scenarioMountedPromptText,
            currentUserInput: userText,
            compressedContext: result.context.compressedContext,
            topPlans: result.topPlans,
            expressionMix: result.expressionMix,
            wordCountAdvice: result.wordCountAdvice
          },
          taskRunId: normalTaskRun.id,
          abortSignal
        }
      }) as Array<{ role: ChatRole; content: string }>
      assertPipelineCanContinue(runId, normalTaskRun.id)
      let fullReply = ''
      let usedModel = ''
      const returnedText = await callAIStream(
        messages,
        {
          ...getAIOptions(speakerTargetId),
          signal: abortSignal,
          usageLabel: `定向重掷：${speakerName}`,
          placeLabel: `会话：${getTargetName(target)}`,
          placeType: target === speakerTargetId ? 'single' : 'group',
          onPromptPrepared: async ({ messages: preparedMessages, finalPrompt, promptBlocks }: {
            messages: Array<{ role: ChatRole; content: string }>
            finalPrompt: string
            promptBlocks?: ChatPromptLogBlock[]
          }) => {
            try {
              const log = await createChatPromptLogBySessionId(sessionId, {
                speakerName,
                targetId: speakerTargetId,
                finalPrompt,
                promptBlocks: promptBlocks ?? buildPromptBlocksFromPreparedMessages(preparedMessages, 'assistant-message-retry-messages')
              })
              promptLogId = String(log.id || '')
            } catch (error) {
              console.error('记录定向重掷提示词日志失败:', error)
            }
          }
        },
        (chunk: string) => {
          if (!isPipelineRunCurrent(runId, normalTaskRun.id) || isStopRequested(chatStore)) return
          fullReply += chunk
          streamingText.value = getVisibleTextFromEmbeddedProjectionOutput(fullReply)
          scrollToBottom()
        },
        {
          onModelInfo: (model: string) => {
            usedModel = model
            setCurrentMessageModel(chatStore, model)
          }
        }
      )
      assertPipelineCanContinue(runId, normalTaskRun.id)
      const normalizedReply = cleanAiPrefix(parseEmbeddedMessageProjectionOutput(normalizeAiOutputText(returnedText || fullReply)).visibleText)
      if (!hasVisibleAiReplyBody(normalizedReply)) {
        toast('模型没有返回可显示的回复，请稍后重试或换个预设', 'warning')
        return { status: 'softstop' }
      }
      return { status: 'recast', replyText: normalizedReply, model: usedModel, promptLogId }
    } catch (err) {
      // 定向重掷无决策流带/无纠偏续跑：取消统一按「不写回」处理（保留旧版本，调用方静默还原）。
      if (isAbortError(err)) {
        return { status: 'softstop' }
      }
      failNormalMessageTaskRun(normalTaskRun.id, err)
      throw err
    } finally {
      completeNormalMessageTaskRun(normalTaskRun.id)
      if (isPipelineRunCurrent(runId, normalTaskRun.id)) {
        setCurrentMessageModel(chatStore, '')
        streamingText.value = ''
      }
    }
  }

  // 批次 M3（提调式锚定精修）：按楼层引用「角色N/旁白M（含范围/多目标）」对会话里已存在的消息做精修。
  // 自包含、不写库：建读/写接缝（当前会话消息）→ 跑精简精修导演 loop（band 可见）→ 返回累积改动，
  // 由调用方 ops 逐条作新版本写回（复用 versionList，可回滚）。无可解析楼层引用/无命中目标返回 null（已 toast）。
  // 停止统一（2026-07-04）：输入框停止 → abort → AbortError → 清带返回 null（停止=取消，无软停挂起）。
  // 拉本会话现有投影 → messageId→投影源（取最新）。observations 已按时序返回，后者覆盖=最新（与 useSessionProjectionBatch 同口径）。
  // 失败不抛、返回空 map（精修按「无投影」降级，不阻断）。
  // 提调一次取回会话观察数据，派生两图：①投影源图(messageId→投影客观事实) ②层3并集用「每条消息 hidden 了哪些角色」。
  // 数据来源＝现役观察端点（personality-model/observations·已带 visibility 行），一次 fetch 供两用途，无额外网络往返。
  // hiddenByMessageId 是增量5.5（方案B·2026-07-02·复用不新建端点）层3真·投影写轨迹消化过滤的真数据（chat_message_projection_visibility）。
  // loadDirectorProjectionObservations：批次3a 移入 tidiaoCorrectionAssembly（统筹/纠偏/精修共用·经顶部 import 引入）。

  /** 批次O·提调层2 场景锚「现在 时间·地点·天气」（帷幕快照同源）——统筹开局/纠偏/精修三入口共用（联动能力：
   *  改口径三处同变）。批次3a：文案格式化下沉 renderDirectorSceneContextFromSnapshot（外部装配同口径），
   *  帷幕解析仍走本闭包 readPersonalityCurtainSnapshot（settingStore 全局兜底三值）。 */
  function readDirectorSceneContextNow(): string {
    return renderDirectorSceneContextFromSnapshot(
      readPersonalityCurtainSnapshot(getChatStoreCurrentSession(chatStore)) as { time?: unknown; location?: unknown; weather?: unknown }
    )
  }

  // 批次2·决策流即时持久化：一轮纠偏/精修复用同一条 artifact（稳定 id=tidiao_stream_${runId}），
  // onDirectorStream 节流 upsert、停止/失败/收尾各 flush 一次——停止后决策流不消失、刷新可复原、连硬崩溃都尽量保。
  // 复用一个 attempt（一轮一条），artifact 走后端 INSERT OR REPLACE（按 id 覆盖），createdAt 固定（不刷位、读回 last-wins 稳定取最新）。
  // H1（2026-07-04·写载降频）：lastSignature=上次真实写库的内容签名（快照/appendLog/prompt 长度组合），
  // 节流路径内容没实质变化就跳过——processSummary 是全量覆写 + 服务器每次写库都要整库导出写盘（sql.js），
  // 高频重复写是崩溃风暴的主燃料。停止/失败/收尾 flush 恒写不受签名影响。
  // 批次K3（2026-07-02·写库失败自愈）：writeSeq/lastSuccessSeq=写序号与最近成功序号——签名只在写成功后置位、
  // flush 重试只在「没有更新的成功写」时执行（防旧内容盖新）。
  // 批次3a：决策流即时持久化四件套原样抽成 createDirectorStreamPersist 工厂（src/app/directorStreamPersist.ts·
  // H1 节流签名/K3 写库自愈语义全在工厂内），pipeline 与会话级外部装配 runner 各自注入依赖——一处真值两个装配点。
  const {
    persistDirectorStreamRoundIncremental,
    finalizeDirectorStreamPersist,
    demoteDirectorStreamPersist
  } = createDirectorStreamPersist({
    startAttempt: (attempt) => startGenerationAttempt(attempt),
    finishAttempt: (attempt) => finishGenerationAttempt(attempt),
    resolveFinalizeSessionId: () => activePipelineSessionId,
    // 内存回填：刷新前编排带即显示最新决策流（锚到该轮用户消息上，与实时带、读侧一致）。
    backfillAnchorTrace: (anchorMessageId, trace) => {
      const list = getCurrentMessageList(chatStore) as Array<Record<string, unknown>>
      const msg = list.find((m) => Number(m?.id || 0) === anchorMessageId)
      if (!msg) return
      const existingTrace = (msg._processTrace || msg.processTrace || {}) as Record<string, unknown>
      msg._processTrace = { ...existingTrace, ...trace }
    }
  })

  async function editChatMessagesViaDirector(
    refsText: string,
    options: {
      correctionText?: string
      anchorMessageId?: number
      /** 即时落库（批次1）：每成功精改一条消息即回调，由 ops 当场写回 DB（中途停也保留）。 */
      onEditCommitted?: (commit: { messageId: number; ref: string; content: string }) => void | Promise<void>
    } = {}
  ): Promise<{ edits: Array<{ messageId: number; ref: string; speakerName: string; content: string }>; reprojectTargets?: Array<{ messageId: number; ref: string; speakerName: string }>; directorStream?: TidiaoDirectorStream | null; anchorAssistantMessageId?: number } | null> {
    const target = getActiveTargetId(chatStore)
    const sessionId = getActiveSessionId(chatStore)
    if (!target || !sessionId) return null
    const list = getCurrentMessageList(chatStore) as Array<Record<string, unknown>>
    const refs = parseChatFloorRefs(String(refsText || ''))
    if (!refs.length) {
      toast('请用「角色N / 旁白M」指定要精修哪条消息（可带范围如「角色3-5」）', 'warning')
      return null
    }
    const readContext = createTidiaoChatMessageReadContext(list)
    const editContext = createTidiaoChatMessageEditContext(list)
    // 读/重投投影接缝（2026-06-21）：拉本会话现有投影按 messageId 索引（取最新），供提调精修后判断投影是否过时→标记重投。
    // fetch 失败不阻断精修，按「无投影」降级（读投影返回未有投影、重投仍可标记）。
    // 批次O：改与纠偏入口同源 loadDirectorProjectionObservations 一次取回两用——投影源图（喂 projectionContext）
    // + hidden 角色集（喂层3 消化过滤），精修并入统一 0-6 框架后同样要层3 全景。
    const precisionObservations = await loadDirectorProjectionObservations(sessionId)
    const projectionContext = createTidiaoMessageProjectionContext(list, precisionObservations.projectionMap)
    const targets = refs
      .map((ref) => readContext.readByFloor(ref.kind, ref.index))
      .filter((read): read is NonNullable<typeof read> => Boolean(read?.matched))
      .map((read) => ({ ref: read.ref, speakerName: read.speakerName, originalText: read.content }))
    if (!targets.length) {
      toast('没找到要精修的消息，请核对楼层号', 'warning')
      return null
    }
    // anchor：精修带挂点——指定锚（M3-4 hover 绑定某条）优先；否则锚到「最近一轮」
    // （用户 2026-06-20 拍板：精修带要接到最后一轮的导演带底部 + 落库，不再像旧版挂会话最后一条之后、且 ephemeral 不持久化）。
    // 最近一轮：U_last=最后一条用户消息（live 带锚此之后、与角色正文之间，与发送/重试同口径）；
    // A_last=最后一条非用户消息（落库锚此——刷新后该轮历史复原走新带，复用 O-B2 clean_retry · directorStream 范式）。
    const lastWithId = [...list].reverse().find((m) => Number(m?.id || 0) > 0)
    const lastUserMessage = [...list].reverse().find((m) => m?.role === 'user' && Number(m?.id || 0) > 0)
    const lastAssistantMessage = [...list].reverse().find((m) => m?.role !== 'user' && Number(m?.id || 0) > 0)
    const anchorMessageId = Number(options.anchorMessageId || 0)
      || Number(lastUserMessage?.id || 0)
      || Number(lastWithId?.id || 0)
    const persistAnchorMessageId = Number(lastAssistantMessage?.id || 0)
    const precisionAgentContextBlock = (await loadRenderedAgentContext({
      sessionId,
      agentKind: 'tidiao'
    })).text

    stopActiveReplyRuntime(chatStore)
    clearStopRequest(chatStore)
    const runId = ++activePipelineRunId
    activePipelineSessionId = sessionId
    activePipelineInputMessageId = anchorMessageId
    // 重放路径不产生新附件（批4）：清零防误读上一轮 sendText 留下的 activePipelineUserAttachments。
    activePipelineUserAttachments = []
    activePipelineTidiaoRunId = beginTidiaoRun()
    const directorStreamRunId = activePipelineTidiaoRunId
    const normalTaskRun = startNormalMessageTaskRun({ targetId: target, sessionId })
    activePipelineTaskRunId = normalTaskRun.id
    // 消耗溯源：精修 loop 的所有模型调用并入锚定轮总账。
    activateRoundUsageContext(target, 'precision_edit')
    const abortSignal = normalTaskRun.controller?.signal

    // 接续到最近一轮的导演带底部（旧决策/旧镜保留、精修决策追加，与纠偏续跑/O-B2 重生成同一套 carryOver 机制）：
    // ① 软停续跑（correctionText 非空）：carryOver 取当前活动轮（精修 correcting 态，已含本轮全部决策）+ 追加「据X纠偏调整」。
    // ② 首次精修（correctionText 空）：carryOver 取「最近一轮角色消息已落库的导演带」接续——内存优先、刷新后 fetch 兜底，
    //    交界追加一条「据X精修：指令」分隔决策（取不到基线则优雅退化为空载体起步）。
    const correctionText = String(options.correctionText || '').trim()
    const baseInstruction = String(refsText || '').trim()
    // R3-2b：从基线 seed 回保真历史（append log 跨轮累积，与 directorStream carryOver 同源）。
    const baseline = await resolveMessageDirectorBaseline(
      lastAssistantMessage as Record<string, unknown>,
      sessionId,
      persistAnchorMessageId
    )
    restoreAppendLog({ runId: directorStreamRunId, sessionId, events: baseline.appendLog, directorPrompt: baseline.directorPrompt })
    let directorCarryOver = correctionText ? captureTidiaoDirectorCarryOver(correctionText, readUserAddressName(), sessionId) : null
    if (!directorCarryOver && persistAnchorMessageId) {
      directorCarryOver = buildTidiaoDirectorCarryOverFromStream(
        baseline.directorStream,
        { separatorText: `据${readUserAddressName()}精修：${baseInstruction}` }
      )
    }
    const instruction = correctionText ? `${baseInstruction}\n【纠偏】${correctionText}` : baseInstruction

    setCurrentMessageModel(chatStore, '')
    streamingText.value = ''
    clearTidiaoDirectorStreamRound()
    // 带头部说话人与「刷新后历史复原」保持一致：取该轮首条角色镜 label（与 roundDirectorStreamSpeakerFor 同源），
    // 取不到再退到最近一轮角色消息的 memberName/name，都没有才回退「提调精修」。「这是精修」由决策流的「据X精修」分隔条表达。
    const roundSpeakerName = String(
      directorCarryOver?.shots.find((shot) => shot.kind === 'character')?.label
      || (lastAssistantMessage as Record<string, unknown> | undefined)?.memberName
      || (lastAssistantMessage as Record<string, unknown> | undefined)?.name
      || ''
    ).trim() || '提调精修'
    beginTidiaoDirectorStreamRound({
      runId: directorStreamRunId,
      sessionId,
      anchorMessageId,
      speakerName: roundSpeakerName,
      carryOver: directorCarryOver
    })

    const agentConfig = readBrainAgentConfigFromList(settingStore.agentModelConfigs)
    // B2 状态提示：精修期间在被改消息正文上画段级光带。loop 起即登记本轮（段列表待 onEditTargeted 填），
    // 每成功精改一段即把 oldText 加入对应消息的高亮列表；收尾（finally）清除（写回新版本后正文即更新）。
    beginTidiaoPrecisionEdit(sessionId, [])
    try {
      const result = await runTidiaoCorrectionLoop({
        // R1-B B5-2 item1 真合并·精修子模式：精修 loop 退役，统一走编辑 loop 的 precisionOnly 分支
        // （只读改原文+投影、收尾按精修语义；返回形状含 edits/reprojectTargets，下方读取不变）。
        // 批次O：精修并入统一 0-6 框架——层2/层3/层6/倾向/每 turn 重建与纠偏入口同口径（联动能力·改口径要同步）。
        precisionOnly: true,
        brief: { instruction, targets },
        agentContextBlock: precisionAgentContextBlock,
        ...(loadActiveDirectorPref().trim() ? { directorPref: loadActiveDirectorPref() } : {}),
        // 每 turn 重建 0-6 prompt（与统筹/纠偏同一开关 directorPromptRebuild·DevTools 可 OFF 对照）。
        promptRebuild: directorPromptRebuild,
        readContext,
        editContext,
        projectionContext,
        ...(abortSignal ? { signal: abortSignal } : {}),
        onDirectorStream: (stream: TidiaoDirectorStream) => {
          updateTidiaoDirectorStreamRound(directorStreamRunId, stream)
          // 批次2：决策流每更新就节流增量持久化（停止/异常终止也保住已做好的决策）。
          // 批次3·统一锚到用户消息：锚 anchorMessageId（该轮用户消息），与实时带、读侧一致。
          void persistDirectorStreamRoundIncremental({
            runId: directorStreamRunId, sessionId, targetId: target,
            anchorRoundMessageId: anchorMessageId, speakerName: roundSpeakerName,
            snapshot: captureTidiaoDirectorStreamSnapshot(directorStreamRunId)
          })
        },
        onEditTargeted: (signal) => setTidiaoPrecisionEditSegment(signal.messageId, signal.oldText),
        ...(options.onEditCommitted ? { onEditCommitted: options.onEditCommitted } : {}),
        // 切原生工具调用（批次5 收编：统筹/纠偏/精修三处同一件 buildDeferredLoopModelCall）。
        callModel: buildDeferredLoopModelCall({
          agentConfig, maxTokens: 1200, temperature: 0.3,
          logLabel: 'tidiao-precision-edit',
          usageLabel: `提调精修：${getTargetName(target)}`,
          placeLabel: `会话：${getTargetName(target)}`,
          placeType: 'single',
          profileId: 'tidiao.precision',
          harnessRunId: directorStreamRunId,
          promptRebuild: directorPromptRebuild,
          ...(abortSignal ? { abortSignal } : {}),
          beforeCall: () => assertPipelineCanContinue(runId, normalTaskRun.id)
        })
      })
      // 落库接续：返回累加后的完整快照 + 落库锚点（最近一轮角色消息），由 ops 把快照接续落库到该轮带、刷新后复原。
      const directorStream = captureTidiaoDirectorStreamSnapshot(directorStreamRunId)
      // 批次2：收尾 flush 最终决策流 + 收 attempt（与 ops 的 persistPrecisionEditDirectorStream 同条带、ops 终态版随后覆盖，二者一致）。
      await persistDirectorStreamRoundIncremental({
        runId: directorStreamRunId, sessionId, targetId: target,
        anchorRoundMessageId: anchorMessageId, speakerName: roundSpeakerName,
        snapshot: directorStream, flush: true
      })
      finalizeDirectorStreamPersist(directorStreamRunId)
      return {
        edits: result.edits.map((edit) => ({
          messageId: edit.messageId,
          ref: edit.ref,
          speakerName: edit.speakerName,
          content: edit.content
        })),
        reprojectTargets: result.reprojectTargets.map((t) => ({
          messageId: t.messageId,
          ref: t.ref,
          speakerName: t.speakerName
        })),
        directorStream,
        // 批次3·统一锚到用户消息：字段名保留，值改为该轮用户消息 id（ops 据此把最终 persist 锚到用户消息）。
        anchorAssistantMessageId: anchorMessageId
      }
    } catch (err) {
      // 真错误把精修带停在 failed 态（不消失、显示原因+可重试）。
      if (isAbortError(err)) {
        // 停止=中断保留（2026-07-08 用户拍板）：有决策内容→带转 correcting 挂起 + flush 落库；无内容→旧口径清带降权。
        const stoppedSnapshot = captureTidiaoDirectorStreamSnapshot(directorStreamRunId)
        if (stoppedSnapshot) {
          markTidiaoDirectorStreamRoundCorrecting(directorStreamRunId, '')
          await persistDirectorStreamRoundIncremental({
            runId: directorStreamRunId, sessionId, targetId: target,
            anchorRoundMessageId: anchorMessageId, speakerName: roundSpeakerName,
            snapshot: captureTidiaoDirectorStreamSnapshot(directorStreamRunId), flush: true
          })
          finalizeDirectorStreamPersist(directorStreamRunId)
        } else {
          clearTidiaoDirectorStreamRound(directorStreamRunId)
          demoteDirectorStreamPersist(directorStreamRunId)
        }
        return null
      }
      markTidiaoDirectorStreamRoundFailed(directorStreamRunId, err instanceof Error ? err.message : '提调精修失败')
      // 批次2：失败把 failed 态决策流 flush 落库（不消失、刷新仍见失败原因）。
      await persistDirectorStreamRoundIncremental({
        runId: directorStreamRunId, sessionId, targetId: target,
        anchorRoundMessageId: anchorMessageId, speakerName: roundSpeakerName,
        snapshot: captureTidiaoDirectorStreamSnapshot(directorStreamRunId), flush: true
      })
      finalizeDirectorStreamPersist(directorStreamRunId)
      failNormalMessageTaskRun(normalTaskRun.id, err)
      throw err
    } finally {
      // B2：loop 收尾清除段级光带（成功后写回新版本即更新正文；失败/取消则原文回退、不再高亮）。
      clearTidiaoPrecisionEdit()
      completeNormalMessageTaskRun(normalTaskRun.id)
      if (isPipelineRunCurrent(runId, normalTaskRun.id)) {
        setCurrentMessageModel(chatStore, '')
        streamingText.value = ''
      }
    }
  }

  // 批次 P3a（纠偏三策统一·提调自主择优）：对会话里【已落库】的某条角色/旁白消息发一条纠偏，
  // 提调在同一条 loop 里自己按「上策改原文 → 中策改提示词/按原提示重生成 → 下策升级重判重排」择优。
  // 自包含、不写库：建读/改原文(上策) + 读/改提示词(中策, 取自该消息 promptLog) + 重生成接缝(中策, 走【正常回复模型】)
  // + escalate(下策) 上下文 → 跑统一 loop → 返回 strategy + 三类终态产物，由 ops 据 strategy 写回(上/中)或转 replan(下)。
  // 软停（停止→纠偏）：当前步跑完软停 → AbortError → 轮级载体转 correcting、写「纠偏续跑态」pending（带 correctionTargetMessageId）、返回 null。
  async function correctChatMessageViaDirector(
    targetMessageId: number,
    options: {
      correctionText?: string
      anchorMessageId?: number
      /** B3：执行到「依提示词重生成整条消息」这一步时回调（带被重生成消息 id），让 ops 把该目标消息切到现有重试占位（原消息消失→打字/转圈 loading→回填新版本）。 */
      onRegenerateBegin?: (messageId: number) => void
      /** 即时落库（批次1）：上策每成功改一条消息原文即回调，由 ops 当场写回 DB（中途停也保留）。 */
      onEditCommitted?: (commit: { messageId: number; ref: string; content: string }) => void | Promise<void>
      /** 即时落库（批次1）：中策每完成一条「按提示词重生成」即回调（带新正文 + 重绑用 promptLogId），由 ops 当场写回新版本。 */
      onRegenerated?: (regen: { messageId: number; ref: string; speakerName: string; content: string; promptLogId: string }) => void | Promise<void>
      /** 批次1(D)·续接带原始指令：要落库的「用户原始纠偏指令」纯原文（续接时回灌用户的命令）。
       *  缺省（首次纠偏）= 用 correctionText 作原始指令；续接时由调用方显式传「读回的纯原始指令」（避免把续接说明文本当原始指令再存、防嵌套）。 */
      userInstruction?: string
    } = {}
  ): Promise<{
    strategy: TidiaoCorrectionStrategy
    edits: Array<{ messageId: number; ref: string; speakerName: string; content: string }>
    regenerations: Array<{ messageId: number; ref: string; speakerName: string; content: string; promptLogId: string }>
    escalation: { reason: string } | null
    /** Q3：本轮新增的旁白消息（接缝已写库，ops 只需刷新列表）。 */
    narrationCreations: Array<{ messageId: number; content: string; profileName: string }>
    /** 2026-07-06：本轮新增的角色消息结果（消息已由 runSingleChat 正常链路写库，ops 只需提示）。 */
    castCreations?: Array<{ speakerName: string; ok: boolean; message?: string }>
    /** 上策改原文后提调标记需重投影的消息（写回 DB 后由 ops 重跑投影生成）。 */
    reprojectTargets?: Array<{ messageId: number; ref: string; speakerName: string }>
    directorStream?: TidiaoDirectorStream | null
    anchorAssistantMessageId?: number
    /** Batch 1（2026-06-29）：下策 escalate 在群聊里已**就地整轮无缝重排完成**（同 run/band·重判情境+替换本轮+逐角色重排），
     *  ops 据此当已处理、不再冷启动单条 regenerateMsg('recall')。单聊 escalate 不置（仍走旧路·Batch 3 对齐）。 */
    escalationHandledInline?: boolean
    /** 续回统筹（2026-07-08）：resume-orchestration 已就地带保留上下文重进统筹续跑完成（不删消息）；
     *  锚定失败无法续跑时不置（已 toast 说明），ops 对本策一律当已处理、不回退 replan。 */
    resumeHandledInline?: boolean
  } | null> {
    const target = getActiveTargetId(chatStore)
    const sessionId = getActiveSessionId(chatStore)
    if (!target || !sessionId) return null
    const targetId = Number(targetMessageId || 0)
    if (!targetId) return null
    const list = getCurrentMessageList(chatStore) as Array<Record<string, unknown>>
    // 批次3a·装配核心阶段1（一处真值两个入口·外部装配 runner 同用 assembleTidiaoCorrectionContexts）：
    // 读/编/投影/提示词上下文、层3 可见历史（五验②统筹同口径+J1 分界锚）、五验③失败轮重定向、
    // U3 群聊发言角色解析、中策 promptLog 来源、批次B 倾向、层2 情境承接——口径注释与真值全在装配核心模块。
    // 返回 null=目标定位失败（楼层未命中且无活动轮可重定向），与旧行为同语义：不起 loop。
    const correctionSession = getChatStoreCurrentSession(chatStore) as any
    const assembly = await assembleTidiaoCorrectionContexts({
      sessionId,
      targetId: target,
      session: correctionSession,
      messages: list,
      groups: (charStore.groups || []) as unknown as Array<Record<string, unknown>>,
      characters: (Array.isArray(charStore.characters) ? charStore.characters : []) as unknown as Array<Record<string, unknown>>
    }, { targetMessageId: targetId })
    if (!assembly) return null
    const {
      readContext,
      editContext,
      projectionContext,
      promptContext,
      targetRoundAnchorMessageId,
      continuationAnchor,
      activeRoundBaselineEligible,
      targetRead,
      effectiveTargetId,
      targets,
      targetMessage: correctionTargetMessageObj,
      speakerTargetId: correctionSpeakerTargetId,
      replayMessages,
      originalPromptText,
      directorPref: correctionDirectorPref
    } = assembly
    const boundaryAnchorMessageId = assembly.boundaryAnchorMessageId

    // Q3 旁白纳入纠偏 loop：解析本会话可用旁白 profiles，让提调能在纠偏里「读旁白skill→写新旁白提示词→生成新旁白消息」。
    // 复用主 loop 同一份 resolvePersonalityNarrationSubagentProfiles；profiles 为空（会话没配旁白 skill）则不启用、零回归。
    // （旁白/重试/重生成等执行接缝依赖聊天 pipeline 活体链路，是聊天内入口专属——外部装配轮不挂，见 runner 头注释。）
    const correctionNarrationProfiles = resolvePersonalityNarrationSubagentProfiles(correctionSession)
    // 2026-07-06（用户拍板「统筹工具给纠偏」）·生成新角色消息候选：会话成员（单聊=1 人·与统筹候选同源），
    // 名字经 getTargetName 补（normalizeSessionParticipantMembers 只有 characterId）。
    const correctionCastCandidates = normalizeSessionParticipantMembers(correctionSession)
      .map((member) => String(member.characterId || '').trim())
      .filter(Boolean)
      .map((characterId) => ({ characterId, name: getTargetName(characterId) || characterId }))
    const correctionAgentContextBlock = (await loadRenderedAgentContext({
      sessionId,
      agentKind: 'tidiao'
    })).text

    stopActiveReplyRuntime(chatStore)
    clearStopRequest(chatStore)
    const runId = ++activePipelineRunId
    activePipelineSessionId = sessionId
    // 纠偏续在原带（修问题①）：若同会话已有活动轮，接回它的原锚（用户消息），让纠偏决策续在本轮提调带末尾，
    // 而不是默认锚到被纠偏的角色消息上、在最后一条消息底部冒出一条新带。
    // 真机五验③：sameSessionRound/continuationAnchor 已上提到层3 渲染前计算（活动轮重定向与此处两用·语义不变）。
    // 会话隔离（修问题①·续因）：活动轮是模块级单例，「切别的会话发过消息」会把它顶成别会话的轮，切回本会话时
    // clearTidiaoDirectorStreamRoundIfOtherSession 又把它清掉 → 本会话此刻无活动轮。此时绝不能回退到 targetId
    //（被纠偏的角色消息），否则实时纠偏带会锚到那条角色消息底下、冒出一条新带。要回退到「被纠偏消息所在轮的用户消息」
    // （与重试路径 anchorUser 同口径），让纠偏带锚回原轮位置、抑制原历史带 → 续在原提调带末尾。
    // targetRoundAnchorMessageId 已上提到层3 渲染前计算（批次J1 分界锚与此处两用·语义不变）。
    const anchorMessageId = Number(options.anchorMessageId || 0) || continuationAnchor || targetRoundAnchorMessageId || targetId
    activePipelineInputMessageId = anchorMessageId
    // 重放路径不产生新附件（批4）：清零防误读上一轮 sendText 留下的 activePipelineUserAttachments。
    activePipelineUserAttachments = []
    const normalTaskRun = startNormalMessageTaskRun({ targetId: target, sessionId })
    activePipelineTaskRunId = normalTaskRun.id
    // 消耗溯源：纠偏 loop 的所有模型调用并入锚定轮总账。
    activateRoundUsageContext(target, 'correction')
    const abortSignal = normalTaskRun.controller?.signal

    // 接续到最近一轮导演带底部（旧决策保留、纠偏决策追加），与精修/纠偏续跑同一套 carryOver。
    const correctionText = String(options.correctionText || '').trim()
    // 批次1(D)：本轮要落库的「用户原始纠偏指令」——续接显式传 userInstruction（纯原始指令，可能为空串）则用它（'' ?? 不回退、防把续接说明当原始指令）；
    // 首次纠偏未传（undefined）则用 correctionText 作原始指令。
    const persistUserInstruction = String(options.userInstruction ?? correctionText ?? '').trim()
    setCurrentMessageModel(chatStore, '')
    streamingText.value = ''
    // 批次3a·装配核心阶段2（基线容器接管·外部装配 runner 同用 beginTidiaoCorrectionRunContainers）：
    // 真机七验「活动容器快照必须先于 beginAppendLog」时序、五验③基线改源（活动轮容器优先·跨会话回退旧路）、
    // carryOver 三路兜底（活动轮 capture → 已落库带接续 → 纠偏文本兜底决策）、清带起带——全封在装配核心内，
    // 口径注释与真值见该模块。runId 铸造也随之下沉（等价旧 beginTidiaoRun：makeTidiaoRunId + beginAppendLog）。
    const containers = await beginTidiaoCorrectionRunContainers({
      sessionId,
      anchorMessageId,
      activeRoundBaselineEligible,
      targetMessage: correctionTargetMessageObj as Record<string, unknown>,
      baselineMessageId: effectiveTargetId || targetId,
      correctionText,
      userName: readUserAddressName(),
      fallbackSpeakerName: targetRead?.speakerName || ''
    })
    activePipelineTidiaoRunId = containers.runId
    const directorStreamRunId = containers.runId
    const directorCarryOver = containers.directorCarryOver
    const roundSpeakerName = containers.roundSpeakerName
    // 上一轮已定方向的稳定快照：新分镜按 characterId 取；旧快照只有名字时仅在名称唯一时兼容回查。
    // 供纠偏轮的定点补生成工具直接复用，避免用户点名缺失角色后又重判整轮、重写方向。
    const correctionCandidateIdSet = new Set(correctionCastCandidates.map((candidate) => candidate.characterId))
    const correctionCandidateIdsByName = new Map<string, string[]>()
    for (const candidate of correctionCastCandidates) {
      const key = candidate.name.trim().toLowerCase()
      correctionCandidateIdsByName.set(key, [...(correctionCandidateIdsByName.get(key) || []), candidate.characterId])
    }
    const priorCastDirectionMap = new Map<string, string>()
    for (const shot of [...(directorCarryOver?.shots || [])].reverse()) {
      if (shot.kind !== 'character') continue
      const directId = String(shot.characterId || '').trim()
      const nameIds = correctionCandidateIdsByName.get(String(shot.label || '').trim().toLowerCase()) || []
      const characterId = correctionCandidateIdSet.has(directId) ? directId : (nameIds.length === 1 ? nameIds[0] : '')
      const direction = String(shot.direction || '').trim()
      if (characterId && direction && !priorCastDirectionMap.has(characterId)) priorCastDirectionMap.set(characterId, direction)
    }
    const priorCastDirections = correctionCastCandidates
      .filter((candidate) => priorCastDirectionMap.has(candidate.characterId))
      .map((candidate) => ({ ...candidate, direction: priorCastDirectionMap.get(candidate.characterId)! }))

    const agentConfig = readBrainAgentConfigFromList(settingStore.agentModelConfigs)
    const regenPromptLogByMessageId = new Map<number, string>()
    // 跨轮记忆（R3-3 保真投影优先/六验重建 ON 不注入语义全在 buildTidiaoCorrectionBandMemory·装配核心单真值）。
    const bandMemory = buildTidiaoCorrectionBandMemory({
      runId: directorStreamRunId,
      promptRebuild: directorPromptRebuild,
      directorCarryOver
    })
    // 真机五验④（2026-07-05）·重试失败子工作流执行器：本轮（重定向后的轮锚）有失败单元时注入 retrySeam——
    // 纠偏 loop 据此注册 retryFailedWorkflow 工具，提调可真正重跑失败的旁白/角色消息生成。
    // 执行器语义：actor=按参数快照重跑 runSingleChat（用当前纠偏 runId/taskRun·合法重入·与 escalate 就地重排同范式；
    // ⚠️ 此时原轮统筹方向 activeRoundDirector 已复位 → 分镜走「自判情境」降级臂，与统筹失败回退同语义——
    // 若真机觉得方向丢失明显，后续把统筹方向快照收进 payload 再升级）；narration=按快照重跑 runPersonalityNarrationCall。
    // 成功=单元已被 take 移除；失败=放回并更新报错，提调可再试或换法。
    const correctionRetrySeam = listRoundRetryUnits(sessionId, boundaryAnchorMessageId).length ? {
      listUnits: () => listRoundRetryUnits(sessionId, boundaryAnchorMessageId),
      retryUnit: async (unitId: string) => {
        const unit = takeRoundRetryUnit(sessionId, unitId)
        if (!unit) return { ok: false, message: '没有找到这个失败单元（可能已重试成功）。' }
        const payload = unit.payload
        try {
          if (payload.kind === 'actor') {
            const speakerTargetId = payload.speakerTargetId || target
            activeGenerationAttemptId = await startGenerationAttempt({
              sessionId,
              anchorMessageId,
              triggerType: 'user_message_regenerate',
              mode: 'clean',
              targetId: speakerTargetId,
              speakerName: getTargetName(speakerTargetId)
            })
            markActiveTurnGenerationAttempt(activeGenerationAttemptId)
            await runSingleChat(target, payload.userText, runId, normalTaskRun.id, abortSignal, { speakerTargetId })
            return { ok: true, message: '已重新生成成功。' }
          }
          const profile = correctionNarrationProfiles.find((item) => item.id === payload.profileId) || correctionNarrationProfiles[0]
          if (!profile) {
            registerRoundRetryUnit(unit)
            return { ok: false, message: '会话里已找不到这条旁白对应的旁白 skill，无法重跑。' }
          }
          const latestMessages = getCurrentMessageList(chatStore) as Array<Record<string, unknown>>
          await runPersonalityNarrationCall({
            targetId: target,
            sessionId,
            profile,
            call: payload.call,
            messages: latestMessages,
            continuityMessages: latestMessages.slice(),
            insertAfterMessageId: Number(payload.insertAfterMessageId || 0) || anchorMessageId || undefined,
            ...(abortSignal ? { abortSignal } : {})
          })
          return { ok: true, message: '已重新生成成功。' }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error || '')
          registerRoundRetryUnit({ ...unit, lastError: message || unit.lastError })
          return { ok: false, message: `重试仍失败：${message || '未知错误'}` }
        }
      }
    } : null
    // 中策重生成接缝（批次5 抽命名·逻辑原样）：据该消息当前提示词工作副本（已含本轮 editMessagePrompt 改动）重生成正文。
    // 角色消息→走【正常回复模型】（没改提示词时用原结构化重放消息最忠实，改过则用改后文本作单条 user 重放）；
    // Q3 收口：旁白消息→走【旁白专链路】（generateNarrationContent + 旁白 system 提示词 + 投影 fact），不当 user 喂角色模型。
    const correctionRegenerateSeam = async (request: TidiaoCorrectionRegenRequest) => {
      // B3：进入「依提示词重生成」这一步 → 通知 ops 把该目标消息切到现有重试占位（中策自动补 / 显式调用同走此 seam，两路径均覆盖）。
      options.onRegenerateBegin?.(Number(request.messageId))
      streamingText.value = ''
      // 即时落库（批次1）：这条重生成产出后即把新正文 + 重绑用 promptLogId 交给 ops 当场写回新版本（中途停也保留）。
      const fireRegenerated = (content: string) => options.onRegenerated?.({
        messageId: Number(request.messageId),
        ref: request.ref,
        speakerName: request.speakerName || roundSpeakerName,
        content,
        promptLogId: regenPromptLogByMessageId.get(Number(request.messageId)) || ''
      })
      const editedPrompt = String(request.promptText || '')
      const isNarration = request.kind === 'narration'
      // Q3 收口：已有旁白改提示词重生成走旁白专链路，正文+promptTrace 落 promptLog 供新版本写回。
      if (isNarration && correctionNarrationProfiles.length) {
        const regen = await regenerateExistingNarrationContent({
          targetId: target,
          sessionId,
          messageId: Number(request.messageId),
          editedPrompt,
          speakerName: request.speakerName || roundSpeakerName,
          profiles: correctionNarrationProfiles,
          ...(abortSignal ? { abortSignal } : {})
        })
        if (regen.promptTrace) {
          try {
            const created = await createChatPromptLogBySessionId(sessionId, {
              speakerName: '旁白',
              targetId: target,
              finalPrompt: regen.promptTrace.finalPrompt,
              promptBlocks: regen.promptTrace.promptBlocks ?? buildPromptBlocksFromPreparedMessages([{ role: 'user', content: editedPrompt }], 'correction-narration-regen-messages')
            })
            regenPromptLogByMessageId.set(Number(request.messageId), String(created.id || ''))
          } catch (e) {
            console.error('记录纠偏旁白重生成提示词日志失败:', e)
          }
        }
        streamingText.value = regen.content
        scrollToBottom()
        await fireRegenerated(regen.content)
        return { content: regen.content }
      }
      const unchanged = editedPrompt.trim() === originalPromptText
      const messagesForReplay: Array<{ role: ChatRole; content: string }> = unchanged && replayMessages.length
        ? replayMessages
        : [{ role: 'user', content: editedPrompt }]
      let full = ''
      const returned = await callAIStream(
        messagesForReplay,
        {
          // U3：群聊用被纠偏消息发言角色自己的配置/计费归类；单聊 correctionSpeakerTargetId===target 行为不变。
          ...getAIOptions(correctionSpeakerTargetId),
          ...(abortSignal ? { signal: abortSignal } : {}),
          usageLabel: `据提示词重生成：${request.speakerName || roundSpeakerName}`,
          placeLabel: `会话：${getTargetName(target)}`,
          placeType: target === correctionSpeakerTargetId ? 'single' : 'group',
          feature: isNarration ? 'narration' : 'role_message',
          onPromptPrepared: async ({ messages: prepared, finalPrompt, promptBlocks }: {
            messages: Array<{ role: ChatRole; content: string }>
            finalPrompt: string
            promptBlocks?: ChatPromptLogBlock[]
            preparedAt: string
          }) => {
            try {
              const created = await createChatPromptLogBySessionId(sessionId, {
                speakerName: request.speakerName || roundSpeakerName,
                targetId: target,
                finalPrompt,
                promptBlocks: promptBlocks ?? buildPromptBlocksFromPreparedMessages(prepared, 'correction-prompt-regen-messages')
              })
              regenPromptLogByMessageId.set(Number(request.messageId), String(created.id || ''))
            } catch (e) {
              console.error('记录纠偏重生成提示词日志失败:', e)
            }
          }
        },
        (chunk: string) => {
          full += chunk
          streamingText.value = full
          scrollToBottom()
        },
        {}
      )
      const content = cleanAiPrefix(normalizeAiOutputText(returned || full))
      await fireRegenerated(content)
      return { content }
    }

    // Q3 旁白生成接缝（批次5 抽命名·逻辑原样）：据提调确认的旁白调用 + 插入位置（提调自己决定，
    // 缺省插在轮锚点＝被纠偏消息前·铺场）生成新旁白消息并写库。
    const correctionGenerateNarration = async (call: PersonalityNarrationCall, placement: { insertAfterMessageId?: number }) => {
      const callProfileIds = Array.isArray(call.profileIds) && call.profileIds.length
        ? call.profileIds
        : [String((call as any).profileId || '')].filter(Boolean)
      const profile = correctionNarrationProfiles.find((item) => item.id === callProfileIds[0]) || correctionNarrationProfiles[0]
      if (!profile) return { content: '' }
      const messageList = getCurrentMessageList(chatStore) as Array<Record<string, unknown>>
      const written = await runPersonalityNarrationCall({
        targetId: target,
        sessionId,
        profile,
        call,
        messages: messageList,
        continuityMessages: messageList.slice(),
        insertAfterMessageId: Number(placement?.insertAfterMessageId || 0) || anchorMessageId || undefined,
        ...(abortSignal ? { abortSignal } : {})
      })
      return { content: String(written?.content || ''), ...(written?.messageId ? { messageId: written.messageId } : {}) }
    }

    // 生成新角色消息接缝（批次5 抽命名·2026-07-06 用户拍板「统筹工具给纠偏」·逻辑原样）：注册统筹同名
    // addCastDirection，纠偏收尾对每条已定方向用 runSingleChat 单角色生成一条新消息（与统筹分镜/重试单元同一生成路）。
    // 方向经 options.directorDirection 直注入（纠偏轮 activeRoundDirector 已复位读不到）；
    // userText 锚定=轮锚（含）之前最近一条用户消息（与重试单元 payload.userText 同语义）。
    const correctionCastSeam: TidiaoCorrectionCastSeam | null = correctionCastCandidates.length
      ? {
          candidates: correctionCastCandidates,
          ...(priorCastDirections.length ? { priorDirections: priorCastDirections } : {}),
          generate: async ({ characterId, direction, label }: { characterId: string; direction: string; label: string }) => {
            const list = getCurrentMessageList(chatStore) as Array<Record<string, unknown>>
            const anchorIndex = list.findIndex((m) => Number((m as Record<string, unknown>)?.id || 0) === Number(anchorMessageId || 0))
            const scanList = anchorIndex >= 0 ? list.slice(0, anchorIndex + 1) : list
            const anchorUser = [...scanList].reverse().find((m) => (m as Record<string, unknown>)?.role === 'user') as Record<string, unknown> | undefined
            const anchorUserText = String(anchorUser?.content || '')
            activeGenerationAttemptId = await startGenerationAttempt({
              sessionId,
              anchorMessageId,
              triggerType: 'user_message_regenerate',
              mode: 'clean',
              targetId: characterId,
              speakerName: label
            })
            markActiveTurnGenerationAttempt(activeGenerationAttemptId)
            const generated = await runSingleChat(target, anchorUserText, runId, normalTaskRun.id, abortSignal, {
              speakerTargetId: characterId,
              directorDirection: direction
            })
            const messageId = Number(generated.firstMessageId || generated.assistantMessageIds?.[0] || 0)
            return messageId
              ? { ok: true, messageId }
              : { ok: false, message: `${label}的生成链路没有落库任何角色消息，已如实保留为失败项。` }
          }
        }
      : null

    // 段级光带（2026-07-11）：纠偏支路对等接入精修同款三件套——loop 起即登记本轮（段列表待 onEditTargeted 填），
    // 每成功精改一段即把 oldText 加入对应消息高亮列表；收尾（finally）清除。与 editChatMessagesViaDirector 同一模式。
    beginTidiaoPrecisionEdit(sessionId, [])
    try {
      const result = await runTidiaoCorrectionLoop({
        brief: { instruction: correctionText, targets },
        agentContextBlock: correctionAgentContextBlock,
        ...(bandMemory ? { bandMemory } : {}),
        // 批次 B·本会话编排倾向（批次3a：值由装配核心提供·已 trim）：非空即三策协议追加强制偏好块（精修子模式不注入）。
        ...(correctionDirectorPref ? { directorPref: correctionDirectorPref } : {}),
        readContext,
        editContext,
        promptContext,
        projectionContext,
        // 真机五验④·重试失败子工作流（本轮有失败单元才注入·loop 据此注册 retryFailedWorkflow + 协议清单）。
        ...(correctionRetrySeam ? { retrySeam: correctionRetrySeam } : {}),
        // 续回统筹（2026-07-08 停止=中断保留闭环）：聊天内纠偏入口有管线活体链路，注册 resumeOrchestration——
        // 用户「继续」被中断统筹轮时提调据此收尾，下方 resume-orchestration 分支带保留上下文重进统筹续跑。
        resumeSeam: true,
        // H2·纠偏每 turn 重建 0-6 prompt（与统筹同一开关 directorPromptRebuild·DevTools 可 OFF 对照）。
        promptRebuild: directorPromptRebuild,
        // 改帷幕接缝（2026-06-29）：纠偏栏用户要改帷幕时间/地点/天气时，由 updateCurtainScene 写当前会话帷幕真值。
        updateCurtainScene: (toolCall) => applyPersonalityCurtainSceneUpdate({ targetId: target, sessionId, toolCall }),
        // 剧本接缝（2026-07-07·提调框改剧本；2026-07-10 批次3 升真 loop）：用户在提调框要求改剧本本身时，
        // 纠偏轮注册统筹同名 consultScript，把用户修改要求经 directive 转达编剧执行（接缝与统筹共用
        // buildScriptwriterSeam·运行状态 UI 同样生效）。纠偏轮不带取证料=编剧零取证工具，凭 brief+directive 编（优雅降级）。
        scriptSeam: buildScriptwriterSeam({ sessionId, originRunId: directorStreamRunId, agentConfig }),
        // 状态系统接缝（批次5·2026-07-08）：用户指名改状态/纠偏引发状态变化时提调直改状态栏真值（与统筹同接缝·联动能力）。
        statusSeam: buildTidiaoStatusSystemSeam(sessionId),
        // 绘舆接缝（地图系统批5·2026-07-11）：纠偏引发地图级变化（角色移动/新地点/进迷雾区）时派绘舆更新舆图
        // （与统筹共用 buildHuiyuDispatchSeam·联动能力）。纠偏轮不带取证料=绘舆零对话读取工具，凭任务书
        // 剧情事实+地图九件作图（与编剧纠偏轮零取证同款优雅降级）。
        mapWorkSeam: buildHuiyuDispatchSeam({ sessionId, candidates: [], agentConfig, ...(abortSignal ? { abortSignal } : {}) }),
        ...(abortSignal ? { signal: abortSignal } : {}),
        onDirectorStream: (stream: TidiaoDirectorStream) => {
          updateTidiaoDirectorStreamRound(directorStreamRunId, stream)
          // 批次2：决策流每更新就节流增量持久化（停止/异常终止也保住已做好的决策）。
          void persistDirectorStreamRoundIncremental({
            runId: directorStreamRunId, sessionId, targetId: target,
            // 批次3·统一锚到用户消息：锚 anchorMessageId（该轮用户消息），与实时带、读侧一致。
            anchorRoundMessageId: anchorMessageId, speakerName: roundSpeakerName,
            snapshot: captureTidiaoDirectorStreamSnapshot(directorStreamRunId),
            userInstruction: persistUserInstruction
          })
        },
        ...(options.onEditCommitted ? { onEditCommitted: options.onEditCommitted } : {}),
        onEditTargeted: (signal) => setTidiaoPrecisionEditSegment(signal.messageId, signal.oldText),
        // 中策重生成接缝（批次5 收编：就地抽命名 build 函数集中放置·逻辑逐字不动）。
        regenerateFromEditedPrompt: correctionRegenerateSeam,
        // Q3 旁白接缝（批次5 收编：生成器抽命名 const 集中放置·profiles 在位才纳入旁白能力）。
        ...(correctionNarrationProfiles.length
          ? {
              narrationProfiles: correctionNarrationProfiles.map((profile) => ({
                id: profile.id,
                name: profile.name,
                triggerDescription: profile.triggerDescription,
                content: profile.content
              })),
              generateNarration: correctionGenerateNarration
            }
          : {}),
        // 生成新角色消息接缝（批次5 收编：构造抽命名 const 集中放置·候选在位才挂）。
        ...(correctionCastSeam ? { castSeam: correctionCastSeam } : {}),
        // 切原生工具调用（批次5 收编：统筹/纠偏/精修三处同一件 buildDeferredLoopModelCall）。
        callModel: buildDeferredLoopModelCall({
          agentConfig, maxTokens: 1200, temperature: 0.3,
          logLabel: 'tidiao-correction',
          usageLabel: `提调纠偏：${getTargetName(target)}`,
          placeLabel: `会话：${getTargetName(target)}`,
          placeType: 'single',
          profileId: 'tidiao.correction',
          harnessRunId: directorStreamRunId,
          promptRebuild: directorPromptRebuild,
          ...(abortSignal ? { abortSignal } : {}),
          beforeCall: () => assertPipelineCanContinue(runId, normalTaskRun.id)
        })
      })
      // 批次B「没把握先问用户」：提调调了 askUser、拿不准 → 进「提问态」（复用软停链路：决策流转 correcting +
      // flush 落库 + 写「提问 pending」），不当纠偏成功收尾。提调的问题人话已在决策流里（thought 实时上抛），
      // 这里把 问题 + 选项 + 推荐 渲染成 askedQuestion 存进 pending；用户在提调框答复后 continueCorrection
      // 把「你问的问题 + 用户答复」连同原始指令一起回灌给提调续跑。返回 null（ops 据此当已处理、不报错）。
      if (result.strategy === 'ask-user' && result.askUser) {
        const ask = result.askUser
        const askedParts = [ask.question]
        if (ask.options.length) askedParts.push('可选项：' + ask.options.map((opt, i) => `${i + 1}. ${opt}`).join('；'))
        if (ask.recommended) askedParts.push('我的推荐：' + ask.recommended)
        markTidiaoDirectorStreamRoundCorrecting(directorStreamRunId, '')
        await persistDirectorStreamRoundIncremental({
          runId: directorStreamRunId, sessionId, targetId: target,
          anchorRoundMessageId: anchorMessageId, speakerName: roundSpeakerName,
          snapshot: captureTidiaoDirectorStreamSnapshot(directorStreamRunId), flush: true,
          userInstruction: persistUserInstruction
        })
        finalizeDirectorStreamPersist(directorStreamRunId)
        setPendingCorrection({
          sessionId,
          targetId: target,
          anchorMessageId,
          anchorIndex: -1,
          baseUserContent: correctionText,
          parentAttemptId: '',
          replacedMessageIds: [],
          correction: '',
          correctionTargetMessageId: targetId,
          askedQuestion: askedParts.join('\n')
        })
        return null
      }
      // Batch 1·escalate 群聊整轮无缝重排（方案 X·2026-06-29）：提调选下策（情境判错·要重判情境重排）且为群聊会话时，
      // 不再交回 ops 冷启动单条重生成，**就地在本 run/band/taskRun 上**「重判情境 + 替换本轮旧消息 + 逐角色重排」——
      // 决策流原带续跑（不停顿、不冷启动、不把纠偏抄到底部）。单聊 escalate 仍走旧路（Batch 3 对齐），缩小爆破面。
      if (result.strategy === 'escalate'
        && isMultiCharacterChatSession(getChatStoreCurrentSession(chatStore), target)) {
        // ① 续跑基线：本轮纠偏决策作 carryOver（'据纠偏·重判情境重排整轮' 转场标记·不重复抄用户原话），
        //    同 runId 重排时挂回，群聊统筹/逐角色 harness 的实时决策 merge 在其后（updateTidiaoDirectorStreamRound 据 carryOver 合并）。
        const reArrangeCarryOver = buildTidiaoDirectorCarryOverFromStream(
          captureTidiaoDirectorStreamSnapshot(directorStreamRunId),
          { separatorText: '据纠偏·重判情境重排整轮' }
        )
        // ② 本轮用户消息文本（驱动整轮重排）+ 要替换的本轮旧助手消息（锚点之后的非用户消息）。
        const freshList = getCurrentMessageList(chatStore) as Array<Record<string, unknown>>
        const anchorIndex = freshList.findIndex((m) => Number(m?.id || 0) === anchorMessageId)
        const roundUserText = anchorIndex >= 0 ? String(freshList[anchorIndex]?.content || '').trim() : ''
        const staleRoundMessageIds = anchorIndex >= 0
          ? freshList.slice(anchorIndex + 1)
              .filter((m) => m?.role !== 'user' && Number(m?.id || 0) > 0)
              .map((m) => Number(m.id))
          : []
        if (roundUserText) {
          // ③ 删本轮旧助手消息：runGroupChat(replay) 自身只追加不替换，靠调用方先删（复用 chatStore.deleteMessage 同一原语）。
          for (const id of staleRoundMessageIds) {
            if (typeof chatStore.deleteMessage !== 'function') break
            try { await chatStore.deleteMessage!(target, id) } catch (e) { console.error('重排删旧消息失败:', e) }
          }
          // ④ 同 run/band/taskRun 跑整轮重排：correctionText 注入 decideRoundDirector→harness 重判情境，carryOver 续带。
          await runGroupChat(target, roundUserText, runId, abortSignal, {
            replay: true,
            replanText: correctionText,
            ...(reArrangeCarryOver ? { carryOver: reArrangeCarryOver } : {})
          })
          return {
            strategy: 'escalate' as const,
            edits: [],
            regenerations: [],
            escalation: result.escalation,
            narrationCreations: [],
            reprojectTargets: [],
            directorStream: captureTidiaoDirectorStreamSnapshot(directorStreamRunId),
            anchorAssistantMessageId: anchorMessageId,
            escalationHandledInline: true
          }
        }
      }
      // 续回统筹（2026-07-08 用户拍板·停止=中断保留闭环）：提调判定用户要继续被中断的统筹轮（调 resumeOrchestration）——
      // 仿上方 escalate 整轮无缝重排（同 run/band/taskRun 就地 runGroupChat(replay)），差异四点：
      // ①**不删任何已有消息**（续接=保留一切已生成内容，跳过 escalate 的 staleRoundMessageIds 删除段）；
      // ②carryOver 分隔语=「据用户指令·继续统筹续跑」；③replanText=续接口径（只安排尚未完成的部分）+ 用户补充指令；
      // ④单聊/群聊统一走（单聊=N=1 群聊·runGroupChat 成员取会话 participants、与统筹主路同一 decideRoundDirector 谱系，
      //   实施现场核实：现役会话单聊也带 participants=1 人；极旧无成员会话由 runGroupChat 自身「会话成员为空」兜底提示）。
      if (result.strategy === 'resume-orchestration') {
        const resumeCarryOver = buildTidiaoDirectorCarryOverFromStream(
          captureTidiaoDirectorStreamSnapshot(directorStreamRunId),
          { separatorText: '据用户指令·继续统筹续跑' }
        )
        const resumeList = getCurrentMessageList(chatStore) as Array<Record<string, unknown>>
        const resumeAnchorIndex = resumeList.findIndex((m) => Number(m?.id || 0) === anchorMessageId)
        const resumeRoundUserText = resumeAnchorIndex >= 0 ? String(resumeList[resumeAnchorIndex]?.content || '').trim() : ''
        if (resumeRoundUserText) {
          const resumeExtra = String(result.resumeInstruction || '').trim()
          const resumeReplanText = '这是续接被中断的一轮：已有消息全部保留，请根据决策流里已完成的部分和当前对话现状，'
            + '只安排尚未完成的部分（未出场角色、未完成旁白、收尾），不要重复已完成的安排。'
            + (resumeExtra ? `用户的续接补充要求：「${resumeExtra}」` : '')
          await runGroupChat(target, resumeRoundUserText, runId, abortSignal, {
            replay: true,
            replanText: resumeReplanText,
            ...(resumeCarryOver ? { carryOver: resumeCarryOver } : {})
          })
          return {
            strategy: 'resume-orchestration' as const,
            edits: [],
            regenerations: [],
            escalation: null,
            narrationCreations: [],
            reprojectTargets: [],
            directorStream: captureTidiaoDirectorStreamSnapshot(directorStreamRunId),
            anchorAssistantMessageId: anchorMessageId,
            resumeHandledInline: true
          }
        }
        // 锚定失败（本轮用户消息不在列表）：无法续跑，说明后走常规收尾（决策流保留·ops 对本策不回退 replan）。
        toast('没有定位到本轮的用户消息锚点，无法切回统筹续跑——请直接下达具体的纠偏指令补完', 'warning')
      }
      const directorStream = captureTidiaoDirectorStreamSnapshot(directorStreamRunId)
      // 批次2：收尾 flush 最终决策流 + 收 attempt。
      await persistDirectorStreamRoundIncremental({
        runId: directorStreamRunId, sessionId, targetId: target,
        anchorRoundMessageId: anchorMessageId, speakerName: roundSpeakerName,
        snapshot: directorStream, flush: true, userInstruction: persistUserInstruction
      })
      finalizeDirectorStreamPersist(directorStreamRunId)
      return {
        strategy: result.strategy,
        edits: result.edits.map((edit) => ({
          messageId: edit.messageId,
          ref: edit.ref,
          speakerName: edit.speakerName,
          content: edit.content
        })),
        regenerations: result.regenerations.map((regen) => ({
          messageId: regen.messageId,
          ref: regen.ref,
          speakerName: regen.speakerName,
          content: regen.content,
          promptLogId: regenPromptLogByMessageId.get(Number(regen.messageId)) || ''
        })),
        escalation: result.escalation,
        narrationCreations: result.narrationCreations
          .filter((creation) => Number(creation.messageId) > 0)
          .map((creation) => ({
            messageId: Number(creation.messageId),
            content: creation.content,
            profileName: creation.profileName
          })),
        // 2026-07-06 纠偏生成新角色消息：消息本体已由 runSingleChat 正常链路写库+插列表，这里只带结果供 ops 提示。
        castCreations: result.castCreations.map((creation) => ({
          speakerName: creation.speakerName,
          ok: creation.ok,
          ...(creation.message ? { message: creation.message } : {})
        })),
        reprojectTargets: result.reprojectTargets.map((t) => ({
          messageId: t.messageId,
          ref: t.ref,
          speakerName: t.speakerName
        })),
        directorStream,
        // 批次3·统一锚到用户消息：字段名保留（ops 据此把最终 persist 锚到用户消息），值改为该轮用户消息 id。
        anchorAssistantMessageId: anchorMessageId
      }
    } catch (err) {
      // 真错误把纠偏带停在 failed 态（不消失、显示原因+可重试）。
      if (isAbortError(err)) {
        // 停止=中断保留（2026-07-08 用户拍板）：有决策内容→带转 correcting 挂起 + flush 落库
        //（含 userInstruction——续接时 recoverDirectorOriginalInstruction 靠它捞回原始指令）；无内容→旧口径清带降权。
        const stoppedSnapshot = captureTidiaoDirectorStreamSnapshot(directorStreamRunId)
        if (stoppedSnapshot) {
          markTidiaoDirectorStreamRoundCorrecting(directorStreamRunId, '')
          await persistDirectorStreamRoundIncremental({
            runId: directorStreamRunId, sessionId, targetId: target,
            anchorRoundMessageId: anchorMessageId, speakerName: roundSpeakerName,
            snapshot: captureTidiaoDirectorStreamSnapshot(directorStreamRunId), flush: true,
            userInstruction: persistUserInstruction
          })
          finalizeDirectorStreamPersist(directorStreamRunId)
        } else {
          clearTidiaoDirectorStreamRound(directorStreamRunId)
          demoteDirectorStreamPersist(directorStreamRunId)
        }
        return null
      }
      markTidiaoDirectorStreamRoundFailed(directorStreamRunId, err instanceof Error ? err.message : '提调纠偏失败')
      // 批次2：失败把 failed 态决策流 flush 落库。
      await persistDirectorStreamRoundIncremental({
        runId: directorStreamRunId, sessionId, targetId: target,
        anchorRoundMessageId: anchorMessageId, speakerName: roundSpeakerName,
        snapshot: captureTidiaoDirectorStreamSnapshot(directorStreamRunId), flush: true,
        userInstruction: persistUserInstruction
      })
      finalizeDirectorStreamPersist(directorStreamRunId)
      failNormalMessageTaskRun(normalTaskRun.id, err)
      throw err
    } finally {
      // 段级光带（2026-07-11）：收尾清除（成功后写回新版本即更新正文；失败/取消则原文回退、不再高亮）。
      clearTidiaoPrecisionEdit()
      completeNormalMessageTaskRun(normalTaskRun.id)
      if (isPipelineRunCurrent(runId, normalTaskRun.id)) {
        setCurrentMessageModel(chatStore, '')
        streamingText.value = ''
      }
    }
  }

  async function replayUserMessage(text: string, inputMessageId?: number, options: { parentAttemptId?: string; replacedMessageIds?: number[]; correctionText?: string } = {}) {
    const normalized = text?.trim()
    if (!normalized) {
      toast('重新生成内容不能为空', 'warning')
      return
    }
    const target = getActiveTargetId(chatStore)
    if (!target) {
      toast('当前会话还没准备好，请重新选择聊天对象后再试。', 'warning')
      return
    }
    stopActiveReplyRuntime(chatStore)
    clearStopRequest(chatStore)
    const runId = ++activePipelineRunId
    // 会话隔离（修问题①）：在 clear 前先确定本轮会话，capture 据此只取同一会话的活动轮为基线，绝不跨会话串台。
    const replaySessionId = getActiveSessionId(chatStore)
    // 批次J·续跑保留基线：纠偏继续（correctionText 非空）时，clear 前先把上一轮决策/镜抢救为基线，begin 时挂回。
    const directorCarryOver: TidiaoDirectorCarryOver | null = String(options.correctionText || '').trim()
      ? captureTidiaoDirectorCarryOver(String(options.correctionText), readUserAddressName(), replaySessionId)
      : null
    activePipelineSessionId = getActiveSessionId(chatStore)
    // 重放路径不产生新附件（批4）：清零防误读上一轮 sendText 留下的 activePipelineUserAttachments。
    activePipelineUserAttachments = []
    activePipelineTidiaoRunId = beginTidiaoRun()
    // 子批3：新轮起点清掉上一轮残留的导演轮级载体；单聊重试 runSingleChat 会随后 begin 当前轮。
    clearTidiaoDirectorStreamRound()
    activePipelineNarrationKinds = new Set<BuiltinNarrationKind>()
    const normalTaskRun = startNormalMessageTaskRun({ targetId: target, sessionId: activePipelineSessionId })
    activePipelineTaskRunId = normalTaskRun.id
    activePipelineInputMessageId = Number(inputMessageId || activePipelineInputMessageId || 0)
    try {
      const replayIsGroupChat = shouldUseGroupChatPipeline(target, getChatStoreCurrentSession(chatStore))
      const replayShouldUsePersonalityModel = shouldUsePersonalityModelReply(target)
      const replayShouldUsePurePrompt = shouldUsePurePromptReply()
      beginActiveChatTurn({
        runId,
        sessionId: activePipelineSessionId,
        targetId: target,
        taskRunId: normalTaskRun.id,
        inputKind: replayShouldUsePurePrompt ? 'pure_prompt_reply' : 'user_message_regenerate',
        replyMode: replayShouldUsePurePrompt ? 'pure_prompt' : replayShouldUsePersonalityModel ? 'personality_model' : 'normal_recall',
        abortSignal: normalTaskRun.controller?.signal
      })
      markActiveTurnInputMessage(activePipelineInputMessageId)
      if (!activePipelineInputMessageId) {
        const messages = getCurrentMessageList(chatStore)
        activePipelineInputMessageId = Number([...messages].reverse().find((message: any) => message?.role === 'user')?.id || 0)
        markActiveTurnInputMessage(activePipelineInputMessageId)
      }
      if (!replayShouldUsePurePrompt) {
        await runReplyContextProjectionForMessage({
          sessionId: activePipelineSessionId,
          messageId: activePipelineInputMessageId,
          stage: 'user'
        })
      }
      if (!replayIsGroupChat) {
        activeGenerationAttemptId = await startGenerationAttempt({
          sessionId: activePipelineSessionId,
          anchorMessageId: activePipelineInputMessageId,
          parentAttemptId: options.parentAttemptId,
          triggerType: 'user_message_regenerate',
        mode: 'clean',
        targetId: target,
        speakerName: getTargetName(target),
        replacedMessageIds: options.replacedMessageIds || []
      })
        markActiveTurnGenerationAttempt(activeGenerationAttemptId)
      }
      activateRoundUsageContext(target, 'regenerate')
      if (!replayShouldUsePurePrompt) {
        await runChatPreReplyEffects({
          targetId: target,
          userText: normalized,
          sessionId: activePipelineSessionId,
          runDynamicWorldDueProgressionBeforeReply,
          onDynamicWorldProgressionError: (error) => console.warn('动态事件推进失败，停止本轮回复链路:', error)
        })
      }
      if (!isPipelineRunCurrent(runId) || isStopRequested(chatStore)) {
        resetActivePipelineState()
        return
      }
      if (replayIsGroupChat) {
        try {
          const result = await runGroupChat(target, normalized, runId, normalTaskRun.controller?.signal)
          return result
        } finally {
          if (isPipelineRunCurrent(runId)) {
            resetActivePipelineState()
          }
        }
        return
      }
      // 单聊群聊统一（批次C·2026-06-30）：单聊重新生成与正常单聊发送同链路——
      //   ① 先走轮级导演 decideRoundDirector(cast=[本角色])：判情境/定旁白/定本角色方向，begin 决策流轮级载体；
      //      纠偏续跑（correctionText 非空）时注入「重判情境重排」私密指令（replanText）+ 挂回上一轮决策作 carryOver，
      //      与群聊 escalate 整轮重排同口径（旧单聊专属 runSingleChat(directorStream:true) 自当导演路已退役）。
      //   ② 再跑唯一发言者分镜 runSingleChat(directorStream:false)：吃 providedScenario 不自判情境、旁白走 F3 归提调。
      await decideRoundDirector({
        userText: normalized,
        groupMembers: [{ characterId: target }],
        targetId: target,
        abortSignal: normalTaskRun.controller?.signal,
        ...(String(options.correctionText || '').trim() ? { replanText: String(options.correctionText).trim() } : {}),
        ...(directorCarryOver ? { carryOver: directorCarryOver } : {})
      })
      return await runSingleChat(target, normalized, runId, normalTaskRun.id, normalTaskRun.controller?.signal, {
        speakerTargetId: target,
        localInsertAfterMessageId: activePipelineInputMessageId,
        excludedMessageIds: options.replacedMessageIds || [],
        // 软停挂起回灌 pendingCorrection 用的父尝试 id（再次挂起时复用）。
        correctionParentAttemptId: options.parentAttemptId
      })
    } catch (error) {
      failNormalMessageTaskRun(normalTaskRun.id, error)
      throw error
    } finally {
      completeNormalMessageTaskRun(normalTaskRun.id)
    }
  }

  async function sendChat(payload?: string | ChatSendPayload) {
    await executeChatSendCommand({
      chatStore,
      chatInputText,
      plusMenuOpen,
      atMenuOpen,
      sendText
    }, payload)
  }

  async function runChatSendCommand(payload?: string | ChatSendPayload) {
    await executeChatSendCommand({
      chatStore,
      chatInputText,
      plusMenuOpen,
      atMenuOpen,
      sendText
    }, payload)
  }

  return {
    sendChat,
    replayUserMessage,
    regenerateFocusedActionViaTidiao,
    regenerateAssistantViaDirector,
    // 批次2 步骤2b：定向重掷轻量重试入口（开关 ON + 普通重试 + 有原轮方向源时由 ops 优先调用）。
    regenerateAssistantViaDirectedRecast,
    editChatMessagesViaDirector,
    correctChatMessageViaDirector,
    resolveMessageDirectorOriginalInstruction,
    runChatSendCommand,
    runGroupChat: runGroupChatReplay,
    // 批次4-投影 A 灰度开关 setter：默认关；翻 true 让提调开局喂投影态上下文 + grounding/决策 step1「默认读投影、原文仅按需」。
    setDirectorProjectionContext: (enabled: boolean) => { directorProjectionContext = Boolean(enabled); writeChatGrayFlag('directorProjectionContext', directorProjectionContext) },
    // 批次D：directorPromptRebuild 开关 setter（DevTools __langhuanChatFlags.directorPromptRebuild 用·默认 ON）。
    setDirectorPromptRebuild: (enabled: boolean) => { directorPromptRebuild = Boolean(enabled); writeChatGrayFlag('directorPromptRebuild', directorPromptRebuild) }
  }
}

export async function executeChatSendCommand(
  deps: ChatSendCommandDeps,
  payload?: string | { text?: string; inputKind?: 'focused_action' }
) {
  const payloadText = typeof payload === 'string'
    ? payload
    : payload && typeof payload === 'object' && typeof payload.text === 'string'
      ? payload.text
      : ''
  const text = (payloadText || deps.chatInputText.value).trim()
  // 运行中发送=打断当前轮（2026-07-13 用户拍板恢复注释原意）：不再因 isTyping 早退。
  // 新一轮发送经 sendText 会 ++activePipelineRunId，正在跑的旧轮在下一个 isPipelineRunCurrent
  // 检查点判否自行收束（既有抢占机制），随后照常发出新消息；下面清空草稿 → 输入框 keepInputExpanded
  // 复位、工具条沉下只露绿条。只有空文本才真不发。
  if (!text) return

  if (!payloadText || payloadText === deps.chatInputText.value) {
    writeSendCommandRef(deps.chatInputText, '')
  }
  writeSendCommandRef(deps.plusMenuOpen, false)
  writeSendCommandRef(deps.atMenuOpen, false)
  await deps.sendText(text, {
    inputKind: typeof payload === 'object' ? payload.inputKind : undefined
  })
}

function writeSendCommandRef<T>(target: Ref<T>, value: T) {
  if (isReadonly(target)) return
  target.value = value
}
