import {
  DEFAULT_REPLY_PLAN_ORCHESTRATOR_BUDGET,
  DEFAULT_REPLY_PLAN_ORCHESTRATOR_CONFIG,
  buildReplyPlanOrchestratorPrompt,
  deriveStrategyMatrixFromToolCalls,
  getReplyPlanToolManual,
  parseReplyPlanExpressionMix,
  parseReplyPlanWordCountAdvice,
  readReplyPlanScenarioBody,
  readReplyPlanScenarioMountedPromptDigest,
  type GeneratePlanBatchToolCall,
  type ReplyPlanCandidate,
  type ReplyPlanExpressionMix,
  type ReplyPlanWordCountAdvice,
  type ReplyPlanOrchestration,
  type ReplyPlanRetrievalDecision,
  type ReplyPlanOrchestratorBudget,
  type ReplyPlanOrchestratorConfig,
  type ReplyPlanOrchestratorPromptTrace,
  type ReplyPlanOrchestratorToolCall,
  type ReviewPlanCandidatesToolCall
} from './personalityPlanOrchestrator'
import type { AgentRuntimeHistoryMessage, AgentTranscript, ToolCallMessage } from './agentRuntime/types'
// 批D·D1（2026-07-12）：导演机族 loop 硬超时单一真值已收口到 groupDirectorPass（此前本文件与
// groupDirectorHarness/tidiaoCorrectionLoop 各写一份字面量靠注释三处同步，现只改这一处 import）。
// 批D·D2：命中知识节区块头同样单一真值收口到 groupDirectorPass（与①③同款〔〕风格，见该常量注释）。
import { DIRECTOR_LOOP_TIMEOUT_MS, DIRECTOR_KNOWLEDGE_MATCHED_SECTION_TITLE } from './groupDirectorPass'
import { runAgentRuntime, type AgentRuntimeProgressEvent } from './agentRuntime/runtime'
// R3-2：把 runtime 上抛的保真事件 append 进当前活动 append log（pipeline 已按 runId 起 log；无活动 log 时 append 自动空操作）。
import { feedAppendLogFromFidelityEvent } from './agentState/appendLogFeed'
// U5：导演模式（directorMode=单聊续跑当导演）补提调知识库 + 检索兜底，与轮级提调 runGroupDirectorHarness 口径一致。
import {
  buildTidiaoCharacterPlanningPriority,
  buildTidiaoKnowledgeInjection,
  matchTidiaoEnvironmentManualSelectors
} from './agentKnowledge/tidiaoKnowledge'
import { SEARCH_APPEND_LOG_TOOL_NAME, createSearchAppendLogTool } from './agentState/searchAppendLogTool'
import { ToolRegistry, type ToolDefinition, type ToolExecutionResult } from './agentRuntime/toolRegistry'
import { assembleAgentSkillSupply, resolveAgentRuntimeToolSupply } from './agentSupply'
import { createReplyPlanAgentHookRegistry } from './replyPlanAgent/hooks'
import {
  createTidiaoDirectorStreamAccumulator,
  type TidiaoDirectorStreamAccumulator
} from './tidiaoDirectorStreamAccumulator'
import type { TidiaoDirectorReplanBrief, TidiaoDirectorStream, TidiaoRetryBrief } from './tidiaoDirectorStream'
// 单聊回复编排/导演 loop 的静态纲领统一收在 agentProtocols 集中目录（用户 2026-06-29），此处只引用、改措辞去那里改。
import {
  NORMAL_RECALL_SINGLE_PLAN_SYSTEM_PROTOCOL,
  REPLY_PLAN_OUTPUT_BREVITY_PROTOCOL,
  REPLY_PLAN_ACTOR_CHARTER,
  TIDIAO_DIRECTOR_NARRATION_PROTOCOL,
  TIDIAO_DIRECTOR_TOOL_EXECUTION_PROTOCOL,
  TIDIAO_DIRECTOR_RETRIEVAL_EAGERNESS_PROTOCOL,
  EXPRESSION_MIX_REMEDIATION_SYSTEM_PROTOCOL
} from './agentProtocols'
import type { ReplyWorkflowMode } from './chatReplyPipelineMode'
import { renderChatSessionWorldAgentContext, type ChatSessionWorldAgentContext } from './chatSessionWorldAgentContext'
import { TIDIAO_RETRIEVAL_CONTRACTS } from './tidiaoRetrievalContract'
import type { TidiaoRetrievalContext } from './tidiaoRetrievalTools'
import {
  TIDIAO_READ_CHAT_MESSAGE_TOOL_NAME,
  type TidiaoChatMessageReadContext
} from './tidiaoChatMessageTools'
// R1-B 门槛1：通用能力工具（取料三件套 + 读会话消息）execute 从「闭包捕获 state」改为「读 ctx.business」（断言成提调业务上下文聚合接口）。
import type { TidiaoScenarioContext, TidiaoReplyPlanContext, TidiaoCurtainSceneContext } from './tidiaoToolBusinessContext'
// 接缝重构（2026-06-30）：工具从「运行时读 ctx.business」改「工厂闭包捕获 context」——演员 loop 启动时按接缝在位调工厂建自己的工具集。
// TIDIAO_BUSINESS_FIELD=B3 能力 token（后续 Step 退役）；buildDegradedReviewResult（纯 transform·随评审工具迁入唯一家）因 harness 自动评审仍用。
import {
  createRecallSemanticTool,
  createSearchWorldTextTool,
  createFetchUnitDetailTool,
  createReadChatMessageTool,
  createGeneratePlanBatchTool,
  createReviewPlanCandidatesTool,
  createGetToolManualTool,
  createUpdateCurtainSceneTool,
  createReadScenarioSkillTool,
  buildDegradedReviewResult
} from './tidiaoGlobalTools'

/** 取料三件套工具名（取自 1a 契约，避免与 harness 注册/激活漂移）。 */
const TIDIAO_RETRIEVAL_TOOL_NAMES = TIDIAO_RETRIEVAL_CONTRACTS.map((contract) => contract.toolName)

/** 旁白两件套工具名（O-C2 旁白纳入 loop）：复用 O-C1 工厂的工具定义，导演模式 + 旁白接缝存在时注册并激活。 */
const TIDIAO_NARRATION_TOOL_NAMES = ['readNarrationSkill', 'confirmNarrationCall']

export interface ReplyPlanBatchToolResult {
  candidates: ReplyPlanCandidate[]
  promptLogId?: string
  rawOutput?: unknown
}

export interface ReplyPlanReviewToolResult {
  scoredCandidates: ReplyPlanCandidate[]
  topPlans: ReplyPlanCandidate[]
  promptLogId?: string
  diagnostics?: Record<string, unknown>
}

export interface ReplyPlanOrchestratorLoopBudget extends ReplyPlanOrchestratorBudget {
  maxTurns: number
  maxMetaToolCalls: number
  /** 取料三件套调用预算（独立于元工具/计划工具，避免取料挤占判情境与生成的预算）。 */
  maxRetrievalToolCalls: number
}

export const DEFAULT_REPLY_PLAN_ORCHESTRATOR_LOOP_BUDGET: ReplyPlanOrchestratorLoopBudget = {
  ...DEFAULT_REPLY_PLAN_ORCHESTRATOR_BUDGET,
  maxTurns: 6,
  maxMetaToolCalls: 6,
  maxRetrievalToolCalls: 6
}

/** 导演 loop 硬超时（用户 2026-06-20 拍板）：唯一硬停=运行超过 20 分钟自动截止。
 *  批D·D1：字面量已收口到 groupDirectorPass.DIRECTOR_LOOP_TIMEOUT_MS，这里只保留同名导出（外部引用零改动）。 */
export const TIDIAO_DIRECTOR_LOOP_TIMEOUT_MS = DIRECTOR_LOOP_TIMEOUT_MS

/** 导演模式预算放开（用户 2026-06-20 拍板「不要步数/调用上限」）：把各项「计数上限」抬到不触发，
 *  让提调可任意步、任意次调工具/重排；唯一硬停交 TIDIAO_DIRECTOR_LOOP_TIMEOUT_MS 超时。
 *  仅抬「次数上限」，不动 maxIntensitiesPerStrategy 等结构性校验（那是单次调用形状约束，非步数限制）。 */
const TIDIAO_DIRECTOR_UNLIMITED = 1_000_000
const TIDIAO_DIRECTOR_BUDGET_OVERRIDE: Partial<ReplyPlanOrchestratorLoopBudget> = {
  maxTurns: TIDIAO_DIRECTOR_UNLIMITED,
  maxMetaToolCalls: TIDIAO_DIRECTOR_UNLIMITED,
  maxRetrievalToolCalls: TIDIAO_DIRECTOR_UNLIMITED,
  maxTotalToolCalls: TIDIAO_DIRECTOR_UNLIMITED,
  maxGeneratePlanBatchCalls: TIDIAO_DIRECTOR_UNLIMITED,
  maxReviewPlanCandidatesCalls: TIDIAO_DIRECTOR_UNLIMITED
}

export type ReplyPlanLoopMetaToolCall =
  | { tool: 'readScenarioSkill'; code: string; expectation?: string }
  | { tool: 'getToolManual'; name: string; expectation?: string }
  | ReplyPlanCurtainSceneUpdateToolCall

export type ReplyPlanLoopToolCall = ReplyPlanOrchestratorToolCall | ReplyPlanLoopMetaToolCall

export interface ReplyPlanCurtainSceneUpdateToolCall {
  tool: 'updateCurtainScene'
  targetTime?: string
  targetLocation?: string
  locationLarge?: string
  locationMiddle?: string
  locationSmall?: string
  /** 可选精确世界坐标；服务端负责校验图纸/要素是否属于会话当前世界。 */
  mapSheetId?: string
  mapFeatureId?: string
  /** 目标天气（2026-06-29 新增；如「晴」「小雨」，写正经天气词·拿不准不提交）。 */
  targetWeather?: string
  reason?: string
  expectation?: string
}

export interface ReplyPlanCurtainSceneUpdateResult {
  changed: boolean
  notice: string
  previous?: Record<string, unknown>
  next?: Record<string, unknown>
  patch?: Record<string, unknown>
  undoPatch?: Record<string, unknown>
  reason?: string
}

export interface ReplyPlanLoopTurnOutput {
  scenario: string
  thought: string
  orchestrationSummary: string
  done: boolean
  /** 编排器生成轮顶层产出的表达占比；其它轮为 null。仅在合法（五项整数合计 100）时非空。 */
  expressionMix: ReplyPlanExpressionMix | null
  /** 编排器生成轮顶层产出的建议字数区间；其它轮/缺失为 null（最终回复缺失时按默认区间兜底）。 */
  wordCountAdvice: ReplyPlanWordCountAdvice | null
  toolCalls: ReplyPlanLoopToolCall[]
}

/** generatePlanBatch 并发上限：受浏览器同域 HTTP/1.1 连接数限制（≈6）。见计划书落地真值 #3。
 *  合并生成协议（2026-07-08）后正式口径是一轮只发一次 generatePlanBatch（batches 带全部类别），
 *  本并发位只服务「存量自定义提示词仍逐类多次调用」的兼容路径。 */
const REPLY_PLAN_GENERATE_CONCURRENCY = 6

export interface ReplyPlanLoopTurnToolResult {
  tool: string
  args: Record<string, unknown>
  expectation?: string
  resultText: string
  isError: boolean
  blocked: boolean
  promptLogId?: string
}

export interface ReplyPlanLoopTurnRecord {
  turnIndex: number
  thought: string
  scenario: string
  rawText: string
  promptLogId?: string
  toolResults: ReplyPlanLoopTurnToolResult[]
}

/** 过程轨步骤：harness 内部阶段映射到 UI 步骤（判断情境 / 生成候选计划 / 评审）。
 *  生成/读取上下文投影、召回、组织回复由发送链路在 harness 外直接上报。
 *  批次4 去融合后不再有融合步骤。 */
export type ReplyPlanProgressStep = 'scenario' | 'plan' | 'review'

export interface ReplyPlanProgressEvent {
  step: ReplyPlanProgressStep
  status: 'running' | 'done' | 'failed' | 'retry'
}

export interface ReplyPlanScenarioResolvedEvent {
  scenario: string
  scenarioBody: string
  sceneChangeNotice?: string
  curtainSceneUpdate?: ReplyPlanCurtainSceneUpdateResult | null
}

/** 普通召回单计划模式预算：singlePlanOnly 协议——最多 3 次 generatePlanBatch 尝试
 *（与 hook 同一计划连续 3 次失败即终止的协议对齐，失败重试不产出候选），
 *  每次 intensities 恰好 1 个，成功一次即由 hook 收束；不开放 reviewPlanCandidates 预算。 */
export const NORMAL_RECALL_SINGLE_PLAN_LOOP_BUDGET: ReplyPlanOrchestratorLoopBudget = {
  ...DEFAULT_REPLY_PLAN_ORCHESTRATOR_LOOP_BUDGET,
  maxGeneratePlanBatchCalls: 3,
  maxReviewPlanCandidatesCalls: 0,
  maxTotalToolCalls: 3,
  maxIntensitiesPerStrategy: 1
}

// NORMAL_RECALL_SINGLE_PLAN_SYSTEM_PROTOCOL / REPLY_PLAN_OUTPUT_BREVITY_PROTOCOL / REPLY_PLAN_ACTOR_CHARTER /
// TIDIAO_DIRECTOR_NARRATION_PROTOCOL / _TOOL_EXECUTION_PROTOCOL / _RETRIEVAL_EAGERNESS_PROTOCOL 等静态纲领
// 已搬到 agentProtocols/replyPlanProtocols.ts（见顶部 import）。本文件只保留带 brief/分支的动态模板函数。

/** 批次K·自主重排：据「重规划 brief」构造纠偏自主重规划协议，追加进系统提示词（仅导演模式 + brief 存在）。
 *  让模型据纠偏真重读情境、推翻重排，并把第一句 thought 写成模型产出的「据纠偏重排」决策；
 *  不放宽 thought 长度上限、不改任何 JSON 结构，只增加「这一轮是带纠偏的重规划」的上下文与硬要求。 */
export function buildTidiaoDirectorReplanProtocol(brief: TidiaoDirectorReplanBrief, userName = ''): string {
  // 提调对用户的称呼用用户名（缺省「用户」），不再写死「用户」。
  const who = String(userName || '').trim() || '用户'
  const lines = ['【纠偏自主重规划】用户在你上一轮编排途中给出了纠偏意见，你现在要据此重新规划这一轮（可以推翻上一轮的安排）：']
  if (brief.priorSituation) lines.push(`- 你上一轮判定的情境/基调是：${brief.priorSituation}`)
  if (brief.priorDirections.length) {
    lines.push('- 你上一轮给出的方向是：' + brief.priorDirections.map((item) => `${item.castName}→${item.direction}`).join('；'))
  }
  if (brief.correctionText) lines.push(`- 用户的纠偏意见是：${brief.correctionText}`)
  lines.push('1. 先判断这条纠偏是否说明你上一轮把情境判断错了：若是，重新读取正确情境的 skill 再继续；若只是改某个角色的方向，则沿用情境。')
  lines.push(`2. 你这一轮输出的第一句 thought 必须是一句「据纠偏重排」的导演人话决策，说清你据纠偏做了什么调整（例如「${who}说大小姐心情好，那我把她从嗤之以鼻改成顺着附和」）。`)
  lines.push('3. 然后按调整后的方向重新走完生成候选→评审→正文；分镜会随新方向刷新。')
  return lines.join('\n')
}

/** 批次M1b·重试：据「重试 brief」构造重试协议，追加进系统提示词（仅导演模式 + brief 存在）。
 *  让模型把这一轮理解成「重写某条已存在的角色消息」：有用户意见就按意见改、无意见就先揣测上一版为何重试再改进；
 *  第一句 thought 写成对应的导演人话决策。不放宽 thought 长度上限、不改任何 JSON 结构，只增上下文与硬要求。 */
export function buildTidiaoDirectorRetryProtocol(brief: TidiaoRetryBrief, userName = ''): string {
  // 提调对用户的称呼用用户名（缺省「用户」），不再写死「用户」。
  const who = String(userName || '').trim() || '用户'
  const original = String(brief.originalText || '').trim()
  const instruction = String(brief.instruction || '').trim()
  const lines = ['【重试这条消息】这一轮不是新对话，而是重写一条用户对其不满意、点了重试的角色消息——你要据下面的原文重新编排这一轮：']
  if (original) lines.push(`- 上一版这条消息的原文是：${original}`)
  if (instruction) {
    lines.push(`- 用户这次明确的修改意见是：${instruction}`)
    lines.push(`1. 你这一轮第一句 thought 必须是一句「按${who}意见改这条」的导演人话决策，说清你据意见把这条往哪个方向改（例如「${who}嫌上一版太冷淡，这次让她语气软下来、主动多说一句」）。`)
  } else {
    lines.push('1. 用户没给具体意见、只是点了重试——你这一轮第一句 thought 必须先「揣测重试意图」：用一句导演人话说清上一版可能哪里不够、这次你打算怎么改进（例如「上一版回应有点平，这次让她带点情绪、把动作写细一点」）。')
  }
  lines.push('2. 然后按这个新方向重新走完判情境→定方向→生成候选→评审→正文；分镜按新方向刷新，给出的是这条消息的新版本。')
  return lines.join('\n')
}

/** 用户私密提调指令协议（director directive）：用户用双层方括号【【…】】下达、只给提调（你）看的私密指令。
 *  追加进系统提示词，要求本轮遵守、且绝不让指令文字或其存在泄露到任何「剧情内、对用户/角色可见」的产出。
 *  directorMode 时额外允许提调在自己的决策流（实时旁述/思考）里简短反映「已收到私密安排」，让用户确认接到了——
 *  决策流是提调自己的频道，不是剧情产出，不算泄露；但同样只点明「已按私密安排调度」，不复述指令原文。 */
export function buildUserDirectorDirectiveProtocol(
  directives: string[],
  userName = '',
  directorMode = false
): string {
  const who = String(userName || '').trim() || '用户'
  const list = (Array.isArray(directives) ? directives : [])
    .map((item) => String(item || '').trim())
    .filter((item) => item.length > 0)
    .map((item, index) => `${index + 1}. ${item}`)
    .join('\n')
  const lines = [
    `【${who}私密指令】下面是${who}本轮只对你（提调）下达的私密安排，用双层方括号包裹、只有你能看到：`,
    list,
    // 关键：先点明它不改变流程，避免模型「回应完私密指令就空手收尾、连情境都没读」导致编排为空。
    `重要：这条私密指令不改变你这一轮的正常工作流程——你仍要照常先读情境、再调用 generatePlanBatch 生成回复计划，一路走到产出正文，绝不能因为这条指令就跳过计划生成或提前结束这一轮。`,
    '在正常流程的基础上，额外遵守下面两条：',
    `① 让本轮的情境判断、旁白安排和各角色回复方向，朝${who}这条私密安排指引的方向走；它的优先级高于你对剧情的常规判断。`,
    `② 绝不能把这条指令的文字、含义或「${who}下过私密指令」这件事，泄露到旁白正文、角色台词、消息正文等任何会展示给${who}或角色的剧情内容里；角色并不知情，不要让角色像听到了指令一样反应。`
  ]
  if (directorMode) {
    lines.push(`③ 可以在本轮第一句决策 thought 里顺带一句「已收到${who}的私密安排、这轮按它来调度」让${who}知道你接到了（决策流是你自己的频道、不算泄露），但不要复述指令原文，说完照常继续读情境、生成计划。`)
  }
  return lines.join('\n')
}

export interface ReplyPlanOrchestratorHarnessInput {
  /** 回复工作流模式：personality_model（默认）多计划 + ReRanker 评审；
   *  normal_recall 单计划直达——singlePlanOnly + skipReview 为 harness 正式协议，
   *  不调用 reviewPlanCandidates（工具不注册、不进 schema），唯一计划即 topPlans 轻量等价物，
   *  且不要求编排器产出 expressionMix。 */
  mode?: ReplyWorkflowMode
  characterName?: string
  /** 用户的称呼名（用户名）：注入导演协议里对用户的称呼，缺省「用户」，不再写死「用户」。 */
  userName?: string
  /** 用户私密提调指令（director directive·只管本轮）：用户用双层方括号【【…】】下达、只给提调看的指令。
   *  非空时系统提示词追加「必须遵守·禁止泄露」段；只注入提调上下文，不进角色提示词/旁白正文/投影。
   *  发送链路已在入口把它从用户正文里剥离，模型这里看到的指令不会出现在任何剧情可见产出中。缺省=无私密指令。 */
  userDirectorDirectives?: string[]
  compressedContext: string
  currentUserInput?: string
  sceneChangeNotice?: string
  previousProjection?: string
  /** 当前生成目标会话的服务端世界 read model 投影；存在时只渲染，不在 harness 内另查世界。 */
  sessionWorldContext?: ChatSessionWorldAgentContext
  /** 会话剧情倾向（真值=服务端正式编排资料）：非空时 system 追加倾向块。 */
  directorPref?: string
  /** F2 群聊分镜吃提调情境：提调轮级已判好情境（code+body）下发时，分镜不再自己 readScenarioSkill 判情境——
   *  存在（code/body 均非空）即不注册/不激活 readScenarioSkill，把情境正文注入提示词、直接进生成轮。
   *  缺省（单聊/提调未产情境/旧 JSON 路径）= 分镜照常自己判情境，零回归。 */
  providedScenario?: { code: string; body: string } | null
  budget?: Partial<ReplyPlanOrchestratorLoopBudget>
  config?: ReplyPlanOrchestratorConfig
  signal?: AbortSignal
  /** 软停回调（导演模式·停止→纠偏）：每轮起点检查，返回 true 即在「当前步跑完后」干净收束，
   *  抛 AbortError 交挂起纠偏（保留半成品、出纠偏框）。仅导演模式透传给 runtime；缺省=不软停。 */
  shouldPause?: () => boolean
  /** 取料接缝（§4.5 三件套真实工厂）：存在即注册并激活 recallSemantic/searchWorldText/fetchUnitDetail；
   *  缺省（旧链路/测试）则不注册、不激活、不改 activeTools，保持回归面为零。 */
  retrievalContext?: TidiaoRetrievalContext
  /** 读会话消息接缝（批次 M2）：存在即注册并激活 readChatMessage，让提调按楼层号「角色N/旁白M（含范围）」读会话原文；
   *  缺省（旧链路/测试）则不注册、不激活、不改 activeTools，保持回归面为零。 */
  chatMessageReadContext?: TidiaoChatMessageReadContext
  /** 可选进度回调：把判断情境 / 候选生成 / 评审阶段推进上报给过程轨（不含技术字段）。 */
  onStageProgress?: (event: ReplyPlanProgressEvent) => void
  /** 实时旁述回调（D5）：每轮编排模型输出的一句话级 thought 即刻上抛，供编排带展开态逐句呈现。 */
  onThought?: (event: { thought: string; turnIndex: number }) => void
  /** 导演流回调（真·导演 loop 子批2）：存在即进入「导演模式」——系统提示词追加导演口吻协议，
   *  并把 loop 每步真实信号（人话决策 thought + 工具条 running→done + 单聊出场角色镜）
   *  折叠成轮级流式载体，整份快照实时上抛。缺省（现役链路/测试）= 不进导演模式、零回归。 */
  onDirectorStream?: (stream: TidiaoDirectorStream) => void
  /** 导演纠偏重规划 brief（批次K·自主重排）：纠偏续跑时携带上一轮情境/各角色方向 + 用户纠偏。
   *  仅导演模式（onDirectorStream 存在）且本字段非空时生效——系统提示词追加纠偏自主重规划协议，
   *  让模型据纠偏真重读情境、推翻重排、产出模型自己的「据纠偏重排」段。缺省=正常编排、零回归。 */
  replanBrief?: TidiaoDirectorReplanBrief | null
  /** 导演重试 brief（批次M1b·重试）：重试某条角色消息时携带被重试消息原文 + 用户修改意见。
   *  仅导演模式（onDirectorStream 存在）且本字段非空时生效——系统提示词追加重试协议，
   *  让模型先揣测重试意图（无意见）或按意见改这条（有意见）。缺省=正常编排、零回归。 */
  retryBrief?: TidiaoRetryBrief | null
  /** 评审降级回调（用户拍板）：本地 ReRanker 跑不动/打分无效时，不再整条崩溃报"生成失败"，
   *  而是按候选顺序降级产出前三计划并出回复；此处把降级原因上报给过程轨如实标注。 */
  onReviewDegraded?: (reason: string) => void
  /** 情境与可选帷幕修改收束后触发；用于在计划生成前启动可并行的旁路任务。 */
  onScenarioResolved?: (event: ReplyPlanScenarioResolvedEvent) => void | Promise<void>
  /** 用户明确要求快进时间或改变地点时，由编排器元工具触发，外层负责写会话帷幕真值。 */
  updateCurtainScene?: (toolCall: ReplyPlanCurtainSceneUpdateToolCall) => Promise<ReplyPlanCurtainSceneUpdateResult> | ReplyPlanCurtainSceneUpdateResult
  callOrchestrator: (request: {
    messages: ReplyPlanOrchestratorPromptTrace['messages']
    history: AgentRuntimeHistoryMessage[]
    activeTools: string[]
    toolBriefs: Array<{ name: string; brief: string; schema?: Record<string, unknown> }>
    // R1-B item7：deferred 模式全局可搜目录——callModel 透传给 callOrchestrator 渲染越权话术进协议。
    toolCatalog?: Array<{ name: string; brief: string; recommended: boolean }>
    turnIndex: number
  }) => Promise<unknown>
  /** 合并生成协议（2026-07-08）：一次收全部反应类别组、一次计划模型调用产出全部候选（按声明顺序平铺返回）；
   *  旧平铺单类别工具调用会被归一化成单元素数组走同一接缝。 */
  generatePlanBatch: (toolCalls: GeneratePlanBatchToolCall[]) => Promise<ReplyPlanBatchToolResult>
  reviewPlanCandidates: (toolCall: ReviewPlanCandidatesToolCall, candidates: ReplyPlanCandidate[]) => Promise<ReplyPlanReviewToolResult>
}

export interface ReplyPlanOrchestratorHarnessResult {
  prompt: ReplyPlanOrchestratorPromptTrace
  orchestration: ReplyPlanOrchestration
  candidates: ReplyPlanCandidate[]
  scoredCandidates: ReplyPlanCandidate[]
  topPlans: ReplyPlanCandidate[]
  /** 表达占比唯一真值：来自编排器生成轮顶层 expressionMix（批次2 前移、批次4 去融合后直接驱动最终回复）。
   *  personality_model 缺失即编排失败；normal_recall 单计划模式按协议豁免，为 null。 */
  expressionMix: ReplyPlanExpressionMix | null
  /** 建议字数区间：编排器生成轮顶层产出（与 expressionMix 并排）；缺失为 null，最终回复按默认区间兜底。 */
  wordCountAdvice: ReplyPlanWordCountAdvice | null
  diagnostics?: Record<string, unknown>
  turns: ReplyPlanLoopTurnRecord[]
  transcript: AgentTranscript
}

export interface ReplyPlanAgentRuntimeAdapter {
  run(input: ReplyPlanOrchestratorHarnessInput): Promise<ReplyPlanOrchestratorHarnessResult>
}

export function createReplyPlanAgentRuntimeAdapter(): ReplyPlanAgentRuntimeAdapter {
  return { run: runReplyPlanAgentRuntime }
}

export async function runReplyPlanOrchestratorHarness(
  input: ReplyPlanOrchestratorHarnessInput
): Promise<ReplyPlanOrchestratorHarnessResult> {
  return createReplyPlanAgentRuntimeAdapter().run(input)
}

const ABORTED_MESSAGE = '回复计划编排已取消'

// 取消错误统一带 name='AbortError'：用户主动停止时，全链路所有 isAbortError /
// err?.name === 'AbortError' 判定都能识别它，避免被当成生成失败弹错误 toast、落失败 trace。
// message 保持 ABORTED_MESSAGE 不变，内部 error.message === ABORTED_MESSAGE 的判定照常生效。
function createReplyPlanAbortedError(): Error {
  const error = new Error(ABORTED_MESSAGE)
  error.name = 'AbortError'
  return error
}

async function runReplyPlanAgentRuntime(
  input: ReplyPlanOrchestratorHarnessInput
): Promise<ReplyPlanOrchestratorHarnessResult> {
  const config = input.config ?? DEFAULT_REPLY_PLAN_ORCHESTRATOR_CONFIG
  // singlePlanOnly / skipReview 由 mode 派生，是 harness 正式协议，不靠提示词口头要求。
  const mode: ReplyWorkflowMode = input.mode === 'normal_recall' ? 'normal_recall' : 'personality_model'
  const singlePlanOnly = mode === 'normal_recall'
  const skipReview = singlePlanOnly
  // 导演模式（接缝存在才激活）：去步数/调用上限，只靠 20 分钟硬超时收束（用户 2026-06-20 拍板）。
  const directorMode = typeof input.onDirectorStream === 'function'
  const baseBudget = singlePlanOnly ? NORMAL_RECALL_SINGLE_PLAN_LOOP_BUDGET : DEFAULT_REPLY_PLAN_ORCHESTRATOR_LOOP_BUDGET
  const budget: ReplyPlanOrchestratorLoopBudget = {
    ...baseBudget,
    ...(input.budget || {}),
    ...(directorMode ? TIDIAO_DIRECTOR_BUDGET_OVERRIDE : {})
  }
  const prompt = buildReplyPlanOrchestratorPrompt({
    characterName: input.characterName,
    compressedContext: input.compressedContext,
    currentUserInput: input.currentUserInput,
    sceneChangeNotice: input.sceneChangeNotice,
    previousProjection: input.previousProjection,
    // 批次 B·本会话编排倾向：透传给 builder，非空即在 system 主纲领后追加倾向块。
    directorPref: input.directorPref
  }, config)
  if (input.sessionWorldContext) {
    prompt.messages[0].content = `${prompt.messages[0].content}\n\n${renderChatSessionWorldAgentContext(input.sessionWorldContext)}`
  }
  // 协议追加直接进系统提示词（messages[0]）：输出瘦身对两种模式生效，单计划协议仅 normal_recall；
  // 追加后同步 promptBlocks/finalPrompt 保持日志一致。
  prompt.messages[0].content = `${prompt.messages[0].content}\n\n${REPLY_PLAN_OUTPUT_BREVITY_PROTOCOL}`
  if (singlePlanOnly) {
    prompt.messages[0].content = `${prompt.messages[0].content}\n\n${NORMAL_RECALL_SINGLE_PLAN_SYSTEM_PROTOCOL}`
  }
  // 导演模式：追加导演口吻协议（只细化 thought 写法）+ 工具同步执行协议（点破「必须真发进 toolCalls」根因）。
  if (directorMode) {
    prompt.messages[0].content = `${prompt.messages[0].content}\n\n${TIDIAO_DIRECTOR_NARRATION_PROTOCOL}`
    prompt.messages[0].content = `${prompt.messages[0].content}\n\n${TIDIAO_DIRECTOR_TOOL_EXECUTION_PROTOCOL}`
  }
  // #5（用户「让取料更积极」）：导演模式 + 取料接缝存在时放低取料门槛，让召回更常进决策流。
  // 仅取料接缝存在才追加（避免叫模型用没注册的工具）；群聊/无接缝/普通配置零影响。
  if (directorMode && input.retrievalContext) {
    prompt.messages[0].content = `${prompt.messages[0].content}\n\n${TIDIAO_DIRECTOR_RETRIEVAL_EAGERNESS_PROTOCOL}`
  }
  // 批次K·自主重排：纠偏续跑（导演模式 + replanBrief 存在）追加纠偏自主重规划协议——
  // 让模型据纠偏真重读情境、推翻重排，第一句 thought 写成模型产出的「据纠偏重排」决策。
  if (directorMode && input.replanBrief) {
    prompt.messages[0].content = `${prompt.messages[0].content}\n\n${buildTidiaoDirectorReplanProtocol(input.replanBrief, input.userName)}`
  }
  // 批次M1b·重试：导演模式 + retryBrief 存在追加重试协议——让模型把这一轮理解成「重写某条已存在角色消息」，
  // 先揣测重试意图（无意见）或按意见改这条（有意见）。与 replanBrief 互不冲突（重试 + 纠偏续跑时两段并存）。
  if (directorMode && input.retryBrief) {
    prompt.messages[0].content = `${prompt.messages[0].content}\n\n${buildTidiaoDirectorRetryProtocol(input.retryBrief, input.userName)}`
  }
  // 用户私密提调指令（只管本轮）：非空时追加「必须遵守·禁止泄露」段，只给提调看。
  // 对两种模式都生效；directorMode 时额外允许在决策流里反映「已收到」。指令文字已在发送入口从用户正文剥离。
  const userDirectorDirectives = (Array.isArray(input.userDirectorDirectives) ? input.userDirectorDirectives : [])
    .map((item) => String(item || '').trim())
    .filter((item) => item.length > 0)
  if (userDirectorDirectives.length) {
    prompt.messages[0].content = `${prompt.messages[0].content}\n\n${buildUserDirectorDirectiveProtocol(userDirectorDirectives, input.userName, directorMode)}`
  }
  // 支线②·U5：导演模式（directorMode=单聊续跑当导演）补提调知识库注入，与轮级提调 runGroupDirectorHarness 口径一致——
  // 恒注入身份/口吻/能力清单+速览索引，Skill 目录稳定进入 system；按当轮用户话/私密指令/场景只匹配 selector，
  // 环境小节正文必须经 manifest 授权后的 Skill loader 装配到层4，禁止在授权前直接展开。
  // 演员活（directorStream:false 吃 providedScenario）不注入——知识库是提调级环境认知，不该污染演员计划编排。
  // constantBlock 只用空输入取得稳定常驻核心；命中正文仍在 providedScenario 之后单独落 user 消息，避免打掉 system 缓存。
  const matchedEnvironmentSelectors = directorMode
    ? matchTidiaoEnvironmentManualSelectors({
        userText: input.currentUserInput,
        directives: userDirectorDirectives,
        sceneContext: input.sceneChangeNotice,
      })
    : []
  const skillSupply = await assembleAgentSkillSupply({
    profileId: 'role_reply.plan-orchestration',
    ...(matchedEnvironmentSelectors.length
      ? {
          activations: matchedEnvironmentSelectors.map((selector) => ({
            skillId: 'tidiao.environment-manual',
            activation: 'code_prefetch' as const,
            selector,
            reason: 'reply_plan_director_environment_match'
          }))
        }
      : {})
  })
  let knowledgeMatchedBlock = ''
  if (directorMode) {
    const { constantBlock } = buildTidiaoKnowledgeInjection({})
    const stableKnowledgeSupply = [constantBlock, skillSupply.layers['1']].filter(Boolean).join('\n\n')
    if (stableKnowledgeSupply) {
      prompt.messages[0].content = `${stableKnowledgeSupply}\n\n${prompt.messages[0].content}`
    }
    knowledgeMatchedBlock = skillSupply.layers['4']
  } else {
    // R2-0 演员纲领：演员模式（directorStream:false）注入成文职责边界到系统提示词最前（与 directorMode 知识库注入对称）。
    // 现状演员活本就不判情境/不挂旁白/不读投影，本纲领只把隐式边界显式成文、作 R1 前置护栏，不改行为。
    const characterPlanningPriority = buildTidiaoCharacterPlanningPriority()
    prompt.messages[0].content = [characterPlanningPriority, REPLY_PLAN_ACTOR_CHARTER, prompt.messages[0].content]
      .filter(Boolean)
      .join('\n\n')
  }
  // F2 群聊分镜吃提调情境：提调轮级已判好情境（code+body）下发时，分镜跳过 readScenarioSkill——
  // 把情境正文 + 「直接据它生成候选」指令作为一条 user 消息注入，模型首轮即看见情境正文、直接进生成轮。
  // 指令文案对齐 scenarioSkill 收尾 hook 的两种模式（单计划/多计划），保证生成轮协议一致。
  const providedScenarioCode = String(input.providedScenario?.code || '').trim()
  const providedScenarioBody = String(input.providedScenario?.body || '').trim()
  const hasProvidedScenario = Boolean(providedScenarioCode && providedScenarioBody)
  if (hasProvidedScenario) {
    const stageInstruction = singlePlanOnly
      ? '上面是本轮情境正文（已由提调统一判定，你无需再判情境）。如果当前用户输入明确要求快进时间或改变地点，且你尚未调用 updateCurtainScene，请先调用 updateCurtainScene；否则请以该情境正文为参考，只调用一次 generatePlanBatch 生成一个回复计划：intensities 必须恰好包含 1 个强度，planPrompt 描述角色接下来应呈现的动作、神态、态度、语气和表达意图。本模式没有评审阶段，也不需要给出 expressionMix；计划生成成功后编排即结束。'
      : '上面是本轮情境正文（已由提调统一判定，你无需再判情境）。如果当前用户输入明确要求快进时间或改变地点，且你尚未调用 updateCurtainScene，请先调用 updateCurtainScene；否则请在同一轮里一次性为该情境正文描述的每个反应类别各发起一次 generatePlanBatch 原生函数调用，并在这一轮 content JSON 顶层给出 expressionMix（action/dialogue/expression/innerState/narration 五项整数合计 100）；这一轮不要调用 reviewPlanCandidates。'
    const providedScenarioContent = `【本轮情境已由提调统一判定，直接据它生成候选计划，无需再判情境】\n${providedScenarioBody}\n\n${stageInstruction}`
    prompt.messages.push({ role: 'user', content: providedScenarioContent })
    prompt.promptBlocks.push({ role: 'user', title: '提调下发情境', content: providedScenarioContent })
  }
  // 批D·D2：命中知识节（每轮可能不同）落在消息队列末尾（providedScenario 之后）——与①统筹③纠偏同款区块头，
  // 只是这里没有独立的层6 概念，直接作最后一条 user 消息，不影响 system 与其它已固定内容的顺序。
  if (knowledgeMatchedBlock) {
    const matchedContent = `${DIRECTOR_KNOWLEDGE_MATCHED_SECTION_TITLE}\n${knowledgeMatchedBlock}`
    prompt.messages.push({ role: 'user', content: matchedContent })
    prompt.promptBlocks.push({ role: 'user', title: '知识库按需节·本轮命中', content: matchedContent })
  }
  if (prompt.promptBlocks[0]) prompt.promptBlocks[0].content = prompt.messages[0].content
  prompt.finalPrompt = prompt.messages.map((message) => `## ${message.role}\n${message.content}`).join('\n\n')

  // 导演流累加器：把 onProgress 的真实 loop 信号折叠成轮级流式载体，整份实时上抛。
  const directorAcc: TidiaoDirectorStreamAccumulator | null = directorMode
    ? createTidiaoDirectorStreamAccumulator({
        ...(input.characterName ? { characterName: input.characterName } : {}),
        onStream: input.onDirectorStream
      })
    : null

  // 取料接缝存在才激活三件套：无接缝（旧链路/测试）时 retrievalToolNames 为空，
  // initialActiveTools 与各 hook 的 activeTools 都不变，老用例的 activeTools 断言不受影响。
  const retrievalToolNames = input.retrievalContext ? TIDIAO_RETRIEVAL_TOOL_NAMES : []
  // 读会话消息接缝存在才激活 readChatMessage（批次 M2），与取料工具同样作为「全程常驻辅助工具」门控。
  const chatMessageToolNames = input.chatMessageReadContext ? [TIDIAO_READ_CHAT_MESSAGE_TOOL_NAME] : []
  // 支线②·U5：导演模式补检索兜底工具 searchDirectorMemory（与轮级提调/纠偏 loop 口径一致），作常驻辅助工具全程可调，
  //   让单聊续跑导演能搜回 R3-2b seed 的跨轮历史；演员活不注册（演员不需搜导演记忆）。
  const directorMemoryToolNames = directorMode ? [SEARCH_APPEND_LOG_TOOL_NAME] : []
  // 全程常驻辅助工具（取料三件套 + 读会话消息 + 导演记忆检索）：判情境→生成各阶段都追加进 activeTools，缺接缝时为空、零回归。
  // 批次C 后旁白已统一归轮级提调 decideRoundDirector，演员活 harness 不再注册旁白两件套。
  const auxToolNames = [...retrievalToolNames, ...chatMessageToolNames, ...directorMemoryToolNames]
  const state = createReplyPlanRuntimeState(input, config, budget, { singlePlanOnly, skipReview, directorAcc })
  // F2：提调已下发情境时预置 scenario/scenarioBody——下游 orchestration.scenario（挂载提示词解析）
  // 与 notifyScenarioResolvedIfNeeded（旁白陪跑支线起跑）据此即时收口，无需模型再 readScenarioSkill。
  if (hasProvidedScenario) {
    state.scenario = providedScenarioCode
    state.scenarioBody = providedScenarioBody
  }
  // R1-B item6：演员 loop 引用单一全局 registry（真越权·纲领约束），推荐单 = 演员常用集 + 导演模式的 searchDirectorMemory。
  // 不再 new 子集 registry、不再 register（register 会污染全局单例·绝对禁止）；searchDirectorMemory 本就在全局池。
  const stageRecommendedTools = [...computeReplyPlanRecommendedTools(state), ...directorMemoryToolNames]
  // R1-B 门槛1：通用能力工具（取料三件套 + 读会话消息）的接缝/预算闸门/决策留痕装配进 business——
  // execute 改读 ctx.business、不再闭包捕获 state；预算计数态（retrievalCalls/maxRetrievalToolCalls）与决策收集器
  // 仍留 loop state（闭包绑定），business 只持回调引用，不把 loop 编排态搬进 business（与决策工具留 loop 同款边界）。
  // 接缝重构：取料预算闸门/决策留痕提为局部 const——已迁工厂（readChat）经入参闭包捕获，未迁取料三件套暂仍读 ctx.business（同一引用）。
  const consumeRetrievalBudget = () => consumeTidiaoRetrievalBudget(state)
  const recordRetrievalDecision = (decision: { tool: string; query: string; reason?: string; hitCount?: number }) => {
    state.retrievalDecisions.push({
      tool: decision.tool,
      query: decision.query,
      ...(decision.reason ? { reason: decision.reason } : {}),
      ...(decision.hitCount != null ? { hitCount: decision.hitCount } : {})
    })
  }
  // 接缝重构 Step8：判情境工具接缝（readScenarioSkill 演员原版语义）提为局部 const——F2 提调已下发情境时不装配（= 不注册 readScenarioSkill·同源）。
  // 演员版差异封装于此：normalizeCode=trim+lowerCase·readBody/mountedDigest 查 config.scenarios·applyResult 演员写回语义·元工具预算闸门。
  const scenarioCtx: TidiaoScenarioContext | null = hasProvidedScenario ? null : {
    normalizeCode: (raw: string) => raw.trim().toLowerCase(),
    readBody: (code: string) => readReplyPlanScenarioBody(state.config.scenarios, code) ?? null,
    applyResult: (code: string, body: string | null) => {
      if (code && !state.scenario) state.scenario = code
      if (body && (!state.scenarioBody || code === state.scenario)) state.scenarioBody = body
    },
    notFoundMessage: (code: string) => `未找到情境 ${code} 的正文`,
    mountedDigest: (code: string) => readReplyPlanScenarioMountedPromptDigest(state.config.scenarios, code) || undefined,
    consumeBudget: () => {
      state.metaCalls += 1
      if (state.metaCalls > state.budget.maxMetaToolCalls) return toolError('BUDGET_EXCEEDED', '超出元工具调用预算')
      return null
    }
  }
  // 接缝重构 Step9：编排工具（generatePlanBatch/reviewPlanCandidates/getToolManual）当轮 context 提为局部 const——工厂闭包捕获（见 actorTools）。
  // state 直接传 ReplyPlanRuntimeState 引用（结构兼容 TidiaoReplyPlanState·工具写入的计数/累加器收尾仍读同一对象）；
  // getToolManual 绑定 config.tools·帷幕/生成/评审绑定 input 接缝·noteCastDirection 绑定 directorAcc·isAbortError 绑定 signal。
  const replyPlanCtx: TidiaoReplyPlanContext = {
    state,
    getToolManual: (name) => getReplyPlanToolManual(state.config.tools, name),
    runGeneratePlanBatch: input.generatePlanBatch,
    runReviewPlanCandidates: input.reviewPlanCandidates,
    ...(input.onReviewDegraded ? { onReviewDegraded: input.onReviewDegraded } : {}),
    notifyScenarioResolved: () => notifyScenarioResolvedIfNeeded(state),
    ...(state.directorAcc ? { noteCastDirection: (planPrompt: string) => state.directorAcc!.noteCastDirection(planPrompt) } : {}),
    isAbortError: (error) => Boolean(input.signal?.aborted)
      || (error instanceof Error && (error.message === ABORTED_MESSAGE || error.name === 'AbortError'))
  }
  // 帷幕修改工具专属接缝（2026-06-29 从 replyPlan 解耦）：回复编排带元工具预算 + 结果留痕（写 state.curtainSceneUpdate 供情境收束通知）。
  const curtainSceneCtx: TidiaoCurtainSceneContext | null = input.updateCurtainScene ? {
    updateCurtainScene: input.updateCurtainScene,
    consumeBudget: () => {
      state.metaCalls += 1
      if (state.metaCalls > state.budget.maxMetaToolCalls) return toolError('BUDGET_EXCEEDED', '超出元工具调用预算')
      return null
    },
    recordResult: (result) => { state.curtainSceneUpdate = result }
  } : null

  // 接缝重构（2026-06-30）：演员/单聊导演 loop 启动时按「接缝在位与否」调工厂建自己的工具集（取代「引用全局工具单例 + B3 门控隐藏」）。
  // 工厂收 context 入参、闭包捕获，registry 成员＝当轮真有 context 的工具（真越权目录与旧 B3 等价·R2-0 演员纲领约束）：
  // 编排三件套(generatePlanBatch/reviewPlanCandidates/getToolManual)恒在(replyPlanCtx 恒装配)；取料三件套/读会话/改帷幕/判情境/
  // 旁白两件套 按各自 context 在位纳入；searchDirectorMemory 仅导演模式(directorMode)。
  const actorTools: ToolDefinition[] = [
    createGeneratePlanBatchTool(replyPlanCtx),
    createReviewPlanCandidatesTool(replyPlanCtx),
    createGetToolManualTool(replyPlanCtx)
  ]
  if (input.retrievalContext) {
    const retrievalCtx = { retrievalContext: input.retrievalContext, consumeRetrievalBudget, recordRetrievalDecision }
    actorTools.push(createRecallSemanticTool(retrievalCtx), createSearchWorldTextTool(retrievalCtx), createFetchUnitDetailTool(retrievalCtx))
  }
  if (input.chatMessageReadContext) actorTools.push(createReadChatMessageTool({ readContext: input.chatMessageReadContext, consumeRetrievalBudget, recordRetrievalDecision }))
  if (curtainSceneCtx) actorTools.push(createUpdateCurtainSceneTool(curtainSceneCtx))
  if (scenarioCtx) actorTools.push(createReadScenarioSkillTool(scenarioCtx))
  if (directorMode) actorTools.push(createSearchAppendLogTool())
  const toolRegistry = new ToolRegistry(actorTools)
  const toolSupply = resolveAgentRuntimeToolSupply('role_reply.plan-orchestration', toolRegistry)
  // 回复编排的 initial 是运行中状态机的正式阶段载荷，比 manifest 的静态 commonTools 更具体：
  // 它仍由阶段机决定，不能把判情境/直接生成分支和可选接缝工具摊平成固定列表；catalog 的推荐标记
  // 则由 manifest 高频集与本阶段推荐集求交，低频授权工具仍可在目录中按需发现。
  const stageInitialActiveTools = hasProvidedScenario
    ? ['generatePlanBatch', 'updateCurtainScene', 'getToolManual', ...auxToolNames]
    : ['readScenarioSkill', 'updateCurtainScene', 'getToolManual', ...auxToolNames]
  const stageRecommendedToolSet = new Set(stageRecommendedTools)
  const recommendedTools = toolSupply.recommendedTools.filter((toolName) => stageRecommendedToolSet.has(toolName))

  const runtimeResult = await runAgentRuntime({
    agentName: 'ReplyPlanAgent',
    runtimeVersion: 'reply-plan-agent-runtime-v1',
    messages: prompt.messages.map((message) => ({ ...message })),
    // 接缝重构 Step1：演员 loop 自建 toolRegistry（按接缝在位调工厂·见上）+ deferred 模式。可见/可调 = 阶段机 activeTools
    // （每步收窄流水线·runtime 自动黏回 toolsearch + 越权激活工具不被抹掉）+ toolsearch 越权。recommendedTools = 演员常用集；
    // registry 成员＝当轮真有 context 的工具（取代 B3 隐藏·真越权目录等价·R2-0 演员纲领约束）。
    toolRegistry,
    // 该专用编排器已有固定的「判情境→生成→评审」阶段机，且没有任务清单 UI 接缝。
    // 禁用 runtime 通用 TODO，避免把控制面工具混入演员可见工具并阻断既有阶段调用。
    taskTodoMode: 'disabled',
    deferredToolMode: toolSupply.deferredToolMode,
    recommendedTools,
    promptSupplyTrace: skillSupply.trace,
    toolSupplyDiagnostics: toolSupply.diagnostics,
    hookRegistry: createReplyPlanAgentHookRegistry({ mode, retrievalToolNames: auxToolNames, directorMode }),
    // F2：提调已下发情境时初始即开放生成轮（不激活 readScenarioSkill）；缺省照常从判情境起步。
    initialActiveTools: stageInitialActiveTools,
    budget: {
      maxTurns: budget.maxTurns,
      maxToolCalls: budget.maxTotalToolCalls + budget.maxMetaToolCalls + budget.maxRetrievalToolCalls
    },
    // 生成轮内多个 generatePlanBatch 整批并发（受浏览器同域连接数 ≈6 限制）；
    // 其它轮（含混入 review 的旧式生成轮）不满足白名单，自动退回串行。
    concurrency: { limit: REPLY_PLAN_GENERATE_CONCURRENCY, tools: ['generatePlanBatch'] },
    signal: input.signal,
    // 导演模式（用户 2026-06-20）：20 分钟硬超时 + 软停（停止→纠偏）。原 openToolGate「全可见」已被 item6 deferred 取代
    //（任意步越权改走 toolsearch）。全部 gated 在 directorMode：非导演链路（群聊/普通召回）不传，行为零变化。
    ...(directorMode
      ? {
          timeoutMs: TIDIAO_DIRECTOR_LOOP_TIMEOUT_MS,
          ...(input.shouldPause ? { shouldPause: input.shouldPause } : {})
        }
      : {}),
    callModel: async ({ messages, history, activeTools, toolBriefs, toolCatalog, turnIndex }) => {
      if (input.signal?.aborted) throw createReplyPlanAbortedError()
      // 情境收束尽早通知：读情境轮的全部工具结果（含同轮 updateCurtainScene）处理完后、
      // 下一轮模型调用前就触发 onScenarioResolved，让旁白陪跑支线立刻启动，
      // 不必再等编排器下一轮模型返回（generatePlanBatch 处保留同名幂等兜底）。
      await notifyScenarioResolvedIfNeeded(state)
      // 评审自动触发（2026-06-12 提速）：候选与表达占比齐备且生成全程零失败时，
      // 由 harness 直接调用本地 ReRanker 评审并收束，省掉"编排模型确认评审"的一整轮 API 往返。
      // 任何生成失败（含参数校验失败）都回退老路，让模型自己重试/调用评审，保证候选全集不被截断。
      const autoReviewOutput = await maybeRunAutoPlanReview(state, input, turnIndex)
      if (autoReviewOutput !== null) return autoReviewOutput
      return input.callOrchestrator({
        messages: messages as ReplyPlanOrchestratorPromptTrace['messages'],
        history,
        activeTools,
        toolBriefs,
        // R1-B item7：透传 toolCatalog 给 callOrchestrator 渲染 toolsearch 越权话术进协议。
        toolCatalog,
        turnIndex
      })
    },
    parseModelOutput: (rawOutput, turnIndex) => {
      const output = parseReplyPlanModelOutput(rawOutput, turnIndex)
      // 记录生成轮顶层的合法表达占比，作为自动评审触发条件（parseReplyPlanLoopTurn 只在合法时带出该字段）
      const mix = parseReplyPlanExpressionMix((output.parsed as Record<string, unknown> | undefined)?.expressionMix)
      if (mix) state.latestExpressionMix = mix
      return output
    },
    onProgress: (input.onStageProgress || input.onThought || directorAcc)
      ? (event) => {
          directorAcc?.onRuntimeProgress(event)
          if (event.kind === 'thought') {
            if (event.thought) input.onThought?.({ thought: event.thought, turnIndex: event.turnIndex })
          } else if (input.onStageProgress) {
            forwardReplyPlanProgress(event, input.onStageProgress)
          }
        }
      : undefined,
    // R3-2：保真事件喂入 append log（与 onProgress 视图分离）。append 进 pipeline 起的活动 log；无活动 log 自动空操作。
    // R3-2/3/5：保真事件统一喂入 append log（lifecycle 透传 + 报错进 state），收口在 feedAppendLogFromFidelityEvent。
    // R1-C 主/子 state 隔离：演员模式（directorMode=false·群聊 per-speaker 台词生成）的事件标 origin='actor'——
    //   仍 append 保真层供审计/检索，但投影（renderAppendLogProjection）过滤掉、不污染提调跨轮记忆；
    //   directorMode=true（单聊续跑当导演）时它就是提调本人，不打标、照常进投影（行为不变）。
    onEvent: (event) => feedAppendLogFromFidelityEvent(event, toolRegistry, directorMode ? undefined : 'actor')
  })

  // 软停（导演模式停止→纠偏）：当前步已跑完、loop 在步骤边界干净收束。与硬 abort 同口径——
  // 先 fail 累加器（J 的 markCorrecting 随后把 failed→correcting），再抛 AbortError 走挂起纠偏分支。
  if (input.signal?.aborted
    || runtimeResult.transcript.terminalReason === 'aborted'
    || runtimeResult.transcript.terminalReason === 'paused-for-correction') {
    directorAcc?.fail(ABORTED_MESSAGE)
    throw createReplyPlanAbortedError()
  }
  // 导演 20 分钟硬超时：判本轮失败、决策流标「运行超时」（用户拍板可重发）。
  if (runtimeResult.transcript.terminalReason === 'timeout') {
    directorAcc?.fail('提调运行超过 20 分钟，已自动截止')
    throw new Error('回复计划编排失败：提调运行超过 20 分钟，已自动截止这一轮。')
  }
  // R2-2 精确报错（用户拍板·不即时熔断·不回退评审降级、不误杀并发候选）：本轮零候选产出且 transcript 记录过
  // 「候选计划生成真实失败」（execute 抛错等·已排除可恢复的参数/数量类）时，根因即生成失败——抢在下方
  // 「未发起生成 / 缺评审」等笼统坍塌检查之前精确点名（generateCalls 计 execute 触达次数，真实失败会落到
  // generateCalls>0 的「缺评审」分支、=0 的「未发起」分支，本门统一覆盖）。根治 P11 含糊报错。
  if (state.candidates.length === 0) {
    const genFailReason = collectCoreStepErrorReason(runtimeResult.transcript, 'generatePlanBatch')
    if (genFailReason) {
      directorAcc?.fail(`候选计划生成失败：${genFailReason}`)
      throw new Error(`回复计划编排失败：候选计划生成失败，未产出任何候选。原因：${genFailReason}`)
    }
  }
  if (state.generateCalls === 0) {
    directorAcc?.fail('编排器未发起任何计划生成')
    throw new Error('回复计划编排失败：编排器必须至少发起一次 generatePlanBatch 计划工具调用。')
  }
  // skipReview 正式协议：普通召回不调用 reviewPlanCandidates，唯一计划直接作为 topPlans 轻量等价物；
  // 不伪造评审结果，trace 中也没有评审工具调用。人格模型仍强制评审，不受 skipReview 放宽。
  if (!skipReview && !state.reviewResult) {
    directorAcc?.fail('缺少计划评审')
    throw new Error('回复计划编排失败：缺少 reviewPlanCandidates 工具调用')
  }
  if (skipReview && state.candidates.length === 0) {
    directorAcc?.fail('未产出回复计划')
    throw new Error('回复计划编排失败：普通召回单计划模式未产出回复计划。')
  }
  // 表达占比唯一真值：人格模型必须来自编排器生成轮顶层 expressionMix；
  // 普通召回单计划模式按协议豁免（最终回复不读占比），缺失不视为失败、也不伪造。
  // 双源读：state.latestExpressionMix（解析时即存）兜 transcript 回读偶发读丢；二者同源、互为冗余。
  let orchestratorExpressionMix = skipReview
    ? null
    : (state.latestExpressionMix || readLatestExpressionMix(runtimeResult.transcript))
  // 补齐轮（不伪造）：人格模型收尾却没给合法 expressionMix 时，不再直接 throw 中止整轮——
  // 发起 1~2 轮补救，把错误反馈给编排模型、只激活 completePlanMetadata，让她用正常编排模型补齐五项占比；
  // 补救仍拿不到才 throw（值始终由模型产出，harness 绝不拍默认占比）。
  if (!skipReview && !orchestratorExpressionMix && !input.signal?.aborted) {
    orchestratorExpressionMix = await runExpressionMixRemediation(state, input, runtimeResult.transcript, directorAcc)
  }
  if (!skipReview && !orchestratorExpressionMix) {
    directorAcc?.fail('缺少表达占比')
    throw new Error('回复计划编排失败：编排器必须在发起 generatePlanBatch 的这一轮给出合法 expressionMix（action/dialogue/expression/innerState/narration 五项整数合计 100），补齐轮也未能取得。')
  }
  const expressionMix = skipReview ? null : orchestratorExpressionMix
  // 建议字数：与 expressionMix 同处取自生成轮顶层；补齐轮命中时优先用 state；缺失不报错（最终回复按默认区间兜底）。
  const wordCountAdvice = skipReview ? null : (state.latestWordCountAdvice || readLatestWordCountAdvice(runtimeResult.transcript))
  const scoredCandidates = state.reviewResult ? state.reviewResult.scoredCandidates : state.candidates
  const topPlans = state.reviewResult ? state.reviewResult.topPlans : state.candidates.slice(0, 1)

  const orchestration: ReplyPlanOrchestration = {
    scenario: state.scenario || readLatestParsedString(runtimeResult.transcript, 'scenario'),
    strategyMatrix: deriveStrategyMatrixFromToolCalls(state.planToolCalls),
    toolCalls: state.planToolCalls,
    candidates: scoredCandidates,
    orchestrationSummary: state.orchestrationSummary || readLatestParsedString(runtimeResult.transcript, 'orchestrationSummary'),
    ...(expressionMix ? { expressionMix } : {}),
    ...(wordCountAdvice ? { wordCountAdvice } : {}),
    ...(state.retrievalDecisions.length ? { retrieval: state.retrievalDecisions } : {})
  }

  // 编排全程成功收束：导演流相位收口为 done（末句不再流式）。
  directorAcc?.setPhase('done')

  return {
    prompt,
    orchestration,
    candidates: state.candidates,
    scoredCandidates,
    topPlans,
    expressionMix,
    wordCountAdvice,
    diagnostics: state.reviewResult?.diagnostics,
    turns: toReplyPlanLoopTurns(runtimeResult.transcript),
    transcript: runtimeResult.transcript
  }
}

/** 表达占比补齐轮预算：人格模型收尾缺合法 expressionMix 时最多发起的补救轮数（含校验失败重试）。 */
const EXPRESSION_MIX_REMEDIATION_MAX_TURNS = 2

/** completePlanMetadata 工具的原生函数参数 schema：五项 0~100 整数（合计 100，由 execute 校验）+ 可选建议字数。 */
const COMPLETE_PLAN_METADATA_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    action: { type: 'integer', minimum: 0, maximum: 100, description: '动作占比' },
    dialogue: { type: 'integer', minimum: 0, maximum: 100, description: '对白占比' },
    expression: { type: 'integer', minimum: 0, maximum: 100, description: '神态占比' },
    innerState: { type: 'integer', minimum: 0, maximum: 100, description: '内心活动占比' },
    narration: { type: 'integer', minimum: 0, maximum: 100, description: '旁白占比' },
    wordCountAdvice: {
      type: 'object',
      description: '可选的建议字数区间（min/max，均 ≥500）',
      properties: { min: { type: 'integer' }, max: { type: 'integer' } }
    }
  },
  required: ['action', 'dialogue', 'expression', 'innerState', 'narration']
}

// EXPRESSION_MIX_REMEDIATION_SYSTEM_PROTOCOL 已搬到 agentProtocols/replyPlanProtocols.ts（见顶部 import）。

/** 据当前 state 拼补齐轮的情境/已选计划上下文（让模型据真实候选给出贴合的占比，而非凭空乱填）。 */
function buildExpressionMixRemediationContext(state: ReplyPlanRuntimeState): string {
  const lines: string[] = []
  if (state.scenario) lines.push(`情境：${state.scenario}`)
  if (state.orchestrationSummary) lines.push(`编排摘要：${state.orchestrationSummary}`)
  const plans = state.reviewResult?.topPlans?.length ? state.reviewResult.topPlans : state.candidates.slice(0, 3)
  if (plans.length) {
    lines.push('本轮已选计划：')
    for (const plan of plans) {
      const label = [plan.strategyLabel || plan.strategy, plan.intensity].filter(Boolean).join(' ')
      const content = String(plan.content || '').replace(/\s+/g, ' ').slice(0, 120)
      lines.push(`- ${label}：${content}`)
    }
  }
  return lines.join('\n') || '（无额外情境信息，请按通用比例给出合计 100 的表达占比。）'
}

/** 从 callOrchestrator 回包里取原生 tool_calls（与 parseReplyPlanLoopTurn 同口径，兼容 toolCalls / tool_calls）。 */
function readNativeToolCalls(raw: unknown): unknown[] {
  const obj = raw && typeof raw === 'object' ? raw as { toolCalls?: unknown; tool_calls?: unknown } : {}
  if (Array.isArray(obj.toolCalls)) return obj.toolCalls
  if (Array.isArray(obj.tool_calls)) return obj.tool_calls
  return []
}

/**
 * 表达占比补齐轮（不伪造）：人格模型收尾缺合法 expressionMix 时调用。
 * 直接发起 callOrchestrator（不走主 loop 的工具白名单解析——它会剥掉 completePlanMetadata 的参数），
 * 把错误反馈给正常编排模型、只开放 completePlanMetadata，解析其原生参数并严格校验（五项整数合计 100）后写回 state；
 * 校验不过就把错误反馈进下一轮，最多 EXPRESSION_MIX_REMEDIATION_MAX_TURNS 轮。仍拿不到返回 null（由调用方决定是否 throw）。
 */
async function runExpressionMixRemediation(
  state: ReplyPlanRuntimeState,
  input: ReplyPlanOrchestratorHarnessInput,
  transcript: AgentTranscript,
  directorAcc: TidiaoDirectorStreamAccumulator | null
): Promise<ReplyPlanExpressionMix | null> {
  // 导演流可见：补齐前先投影一条带工具条的「补齐表达占比」决策（与自动评审同一投影范式）。
  if (directorAcc) {
    directorAcc.onRuntimeProgress({ kind: 'thought', stage: 'plan-review', toolName: '', thought: '刚才漏给了表达占比，补一份再收尾', turnIndex: 0 })
    directorAcc.onRuntimeProgress({ kind: 'tool-start', stage: 'plan-review', toolName: 'completePlanMetadata', detail: '补齐表达占比', turnIndex: 0 })
  }
  const toolBriefs = [{
    name: 'completePlanMetadata',
    brief: '补齐本轮回复计划的表达占比（action/dialogue/expression/innerState/narration 五项整数，合计 100），可附建议字数。',
    schema: COMPLETE_PLAN_METADATA_SCHEMA
  }]
  const baseMessages = [
    { role: 'system' as const, content: EXPRESSION_MIX_REMEDIATION_SYSTEM_PROTOCOL },
    { role: 'user' as const, content: buildExpressionMixRemediationContext(state) }
  ]
  // turnIndex 偏移：真身 callOrchestrator 仅在 turnIndex===0 持久化编排 prompt trace，
  // 补齐轮必须避开 0，否则会覆盖主编排轮的 trace 日志；用主 transcript 轮数当偏移，恒 ≥1。
  const turnOffset = Math.max(1, transcript.turns.length)
  let retryNotice: { role: 'user'; content: string } | null = null
  for (let attempt = 0; attempt < EXPRESSION_MIX_REMEDIATION_MAX_TURNS; attempt += 1) {
    if (input.signal?.aborted) throw createReplyPlanAbortedError()
    const messages = retryNotice ? [...baseMessages, retryNotice] : baseMessages
    let raw: unknown
    try {
      raw = await input.callOrchestrator({
        messages: messages as ReplyPlanOrchestratorPromptTrace['messages'],
        history: [],
        activeTools: ['completePlanMetadata'],
        toolBriefs,
        turnIndex: turnOffset + attempt
      })
    } catch (error) {
      // 取消信号原样上抛（外层按取消处理）；其它错误终止补救，由调用方据 state 是否补齐决定 throw。
      if (input.signal?.aborted || (error instanceof Error && (error.message === ABORTED_MESSAGE || error.name === 'AbortError'))) {
        throw error
      }
      break
    }
    const completeCall = readNativeToolCalls(raw)
      .map((item) => nativeToolCallToRecord(item))
      .find((record) => record.tool === 'completePlanMetadata')
    const mix = completeCall ? parseReplyPlanExpressionMix(completeCall.args) : null
    if (mix) {
      state.latestExpressionMix = mix
      // 顺带补建议字数（可选）：模型给了合法 wordCountAdvice 就一并写回，收尾优先用它。
      const advice = parseReplyPlanWordCountAdvice(
        (completeCall!.args as Record<string, unknown>).wordCountAdvice ?? completeCall!.args
      )
      if (advice) state.latestWordCountAdvice = advice
      directorAcc?.onRuntimeProgress({ kind: 'tool-result', stage: 'plan-review', toolName: 'completePlanMetadata', status: 'success', resultPreview: '表达占比已补齐', turnIndex: 0 })
      return mix
    }
    // 把错误反馈进下一轮，让模型重新给（不伪造、不拍默认值）。
    retryNotice = {
      role: 'user',
      content: '上一轮没有给出合法的表达占比：completePlanMetadata 的 action/dialogue/expression/innerState/narration 五项必须都是 0~100 的整数，且五项合计正好等于 100。请重新调用 completePlanMetadata 给出正确的五项占比。'
    }
  }
  directorAcc?.onRuntimeProgress({ kind: 'tool-result', stage: 'plan-review', toolName: 'completePlanMetadata', status: 'error', errorMessage: '补齐表达占比未成功', turnIndex: 0 })
  return null
}

interface ReplyPlanRuntimeState {
  input: ReplyPlanOrchestratorHarnessInput
  config: ReplyPlanOrchestratorConfig
  budget: ReplyPlanOrchestratorLoopBudget
  /** 导演流累加器（仅导演模式非空）：generatePlanBatch / 自动评审 等真实动作据此实时投影到轮级载体。 */
  directorAcc: TidiaoDirectorStreamAccumulator | null
  /** 单计划模式（normal_recall）：每次 generatePlanBatch 的 intensities 必须恰好 1 个。 */
  singlePlanOnly: boolean
  /** 跳过评审（normal_recall）：reviewPlanCandidates 工具不注册、不进模型 schema。 */
  skipReview: boolean
  candidates: ReplyPlanCandidate[]
  planToolCalls: ReplyPlanOrchestratorToolCall[]
  reviewResult: ReplyPlanReviewToolResult | null
  scenarioBody: string
  scenario: string
  orchestrationSummary: string
  curtainSceneUpdate: ReplyPlanCurtainSceneUpdateResult | null
  generateCalls: number
  reviewCalls: number
  metaCalls: number
  /** 取料三件套累计调用次数（独立预算 maxRetrievalToolCalls）。 */
  retrievalCalls: number
  /** 取料决策序列（批次3 D4）：三件套每次成功执行记一条，装配进 orchestration.retrieval 供编排带展示。 */
  retrievalDecisions: ReplyPlanRetrievalDecision[]
  scenarioResolvedNotified: boolean
  scenarioResolvedPromise: Promise<void> | null
  /** 生成轮顶层产出的最新合法表达占比（自动评审触发条件之一）。 */
  latestExpressionMix: ReplyPlanExpressionMix | null
  /** 补齐轮（completePlanMetadata）回写的建议字数：仅元数据补救轮命中时非空，收尾优先于 transcript 回读。 */
  latestWordCountAdvice: ReplyPlanWordCountAdvice | null
  /** generatePlanBatch 失败计数（含参数校验失败）：只要出现过失败就回退模型驱动评审，不自动收束。 */
  generateErrorCount: number
}

function createReplyPlanRuntimeState(
  input: ReplyPlanOrchestratorHarnessInput,
  config: ReplyPlanOrchestratorConfig,
  budget: ReplyPlanOrchestratorLoopBudget,
  profile: { singlePlanOnly: boolean; skipReview: boolean; directorAcc: TidiaoDirectorStreamAccumulator | null }
): ReplyPlanRuntimeState {
  return {
    input,
    config,
    budget,
    directorAcc: profile.directorAcc,
    singlePlanOnly: profile.singlePlanOnly,
    skipReview: profile.skipReview,
    candidates: [],
    planToolCalls: [],
    reviewResult: null,
    scenarioBody: '',
    scenario: '',
    orchestrationSummary: '',
    curtainSceneUpdate: null,
    generateCalls: 0,
    reviewCalls: 0,
    metaCalls: 0,
    retrievalCalls: 0,
    retrievalDecisions: [],
    scenarioResolvedNotified: false,
    scenarioResolvedPromise: null,
    latestExpressionMix: null,
    latestWordCountAdvice: null,
    generateErrorCount: 0
  }
}

/** R1-B item6：演员 loop 的「推荐工具单」（常用工具名子集）——deferred 模式下作 recommendedTools 在 toolCatalog 标
 *  recommended=true；演员 toolRegistry 直接引用全局单（真越权·纲领约束），可见/可调由阶段机 activeTools + B3 门控 +
 *  toolsearch 越权共同决定。本名单 = 现役条件注册口径逐字保真（hasProvidedScenario/skipReview/narration 门控不变），
 *  只作推荐标记、不再 new 子集 registry。注：searchDirectorMemory（仅导演模式）由调用点据 directorMemoryToolNames 追加。 */
function computeReplyPlanRecommendedTools(state: ReplyPlanRuntimeState): string[] {
  // F2：提调已下发情境（providedScenario）时不推荐 readScenarioSkill——分镜不再自己判情境，
  // 直接吃下发的情境正文进生成轮；缺省照常推荐，零回归。
  const hasProvidedScenario = Boolean(
    String(state.input.providedScenario?.code || '').trim()
    && String(state.input.providedScenario?.body || '').trim()
  )
  const names: string[] = []
  // F2：提调已下发情境时不推荐 readScenarioSkill（且不装配 scenario 接缝 → B3 隐藏+block·真不可调）；缺省照常。
  if (!hasProvidedScenario) names.push('readScenarioSkill')
  // 编排三件套恒推荐（generatePlanBatch schemaFactory 化·下发/激活那刻读 ctx.business.replyPlan.state.singlePlanOnly 现造）。
  names.push('updateCurtainScene', 'getToolManual', 'generatePlanBatch')
  // skipReview 协议：普通召回不推荐评审工具；阶段机在 singlePlanOnly 永不把它放进 activeTools、生成成功即 terminate，
  // 加 review execute 自守卫（无候选→EXPECTATION_MISMATCH）三重保证「不存在伪造评审结果空间」（review 仍在全局池·越权可搜·纲领约束）。
  if (!state.skipReview) names.push('reviewPlanCandidates')
  // 取料三件套 + 读会话消息：恒推荐（缺接缝时 B3 隐藏+block·execute 不伪造）；可见性由 activeTools 控制（aux/initialActiveTools/hook）。
  names.push('recallSemantic', 'searchWorldText', 'fetchUnitDetail', 'readChatMessage')
  return names
}

/** 取料预算闸门：超出独立的 maxRetrievalToolCalls 即拒绝。 */
function consumeTidiaoRetrievalBudget(state: ReplyPlanRuntimeState): ToolExecutionResult | null {
  state.retrievalCalls += 1
  if (state.retrievalCalls > state.budget.maxRetrievalToolCalls) {
    return toolError('BUDGET_EXCEEDED', '超出取料调用预算')
  }
  return null
}

/** 把 runtime 原始阶段事件映射成 UI 过程轨步骤（含重试语义，不暴露技术字段）。
 *  批次4 去融合后只剩生成候选 / 评审两步。 */
function mapRuntimeStageToProgressStep(stage: string): ReplyPlanProgressStep | null {
  if (stage === 'scenario-routing' || stage === 'manual-reading') return 'scenario'
  if (stage === 'plan-generation') return 'plan'
  if (stage === 'plan-review') return 'review'
  return null
}

function forwardReplyPlanProgress(
  event: AgentRuntimeProgressEvent,
  emit: (progress: ReplyPlanProgressEvent) => void
): void {
  const step = mapRuntimeStageToProgressStep(event.stage)
  if (!step) return
  if (event.kind === 'tool-start') {
    emit({ step, status: 'running' })
    return
  }
  // tool-result
  if (event.status === 'success') {
    // 只有该步骤的「收口工具」成功才点亮完成；元工具（读情境/读手册）成功保持运行。
    const completing =
      (step === 'scenario' && (event.toolName === 'readScenarioSkill' || event.toolName === 'updateCurtainScene')) ||
      (step === 'plan' && event.toolName === 'generatePlanBatch') ||
      (step === 'review' && event.toolName === 'reviewPlanCandidates')
    if (completing) emit({ step, status: 'done' })
    return
  }
  emit({ step, status: event.retried ? 'retry' : 'failed' })
}

function parseReplyPlanModelOutput(rawOutput: unknown, turnIndex: number) {
  const turn = parseReplyPlanLoopTurn(rawOutput)
  // 原生形态：content 即编排元数据 JSON 字符串；非原生（自动评审合成串）退回 string/JSON.stringify。
  const contentText = isNativeOrchestratorOutput(rawOutput)
    ? String((rawOutput as { content?: unknown }).content ?? '')
    : (typeof rawOutput === 'string' ? rawOutput : JSON.stringify(rawOutput))
  return {
    stage: inferTurnStage(turn.toolCalls),
    done: turn.done,
    content: contentText,
    parsed: {
      scenario: turn.scenario,
      thought: turn.thought,
      orchestrationSummary: turn.orchestrationSummary,
      done: turn.done,
      ...(turn.expressionMix ? { expressionMix: turn.expressionMix } : {}),
      ...(turn.wordCountAdvice ? { wordCountAdvice: turn.wordCountAdvice } : {})
    },
    toolCalls: turn.toolCalls.map((toolCall, index) => toRuntimeToolCall(toolCall, turnIndex, index))
  }
}

/** R2-2 精确报错：从 transcript 收集某核心工具（generatePlanBatch / reviewPlanCandidates）真实失败原因，
 *  供收尾把笼统失败（「未发起生成 / 缺评审」）替换成「哪一步、什么真因」——根治 P11「带病跑完到下游才报含糊错」。
 *  只读 transcript 已记录的 status='error' 工具结果（与 R3 append log 同源），**不即时熔断、不改 loop 行为**，
 *  不回退评审降级（降级走 success 不进这里）、不误杀并发候选（纯收尾读侧）。无失败返回 null。 */
function collectCoreStepErrorReason(transcript: AgentTranscript, toolName: string): string | null {
  const reasons: string[] = []
  for (const turn of transcript.turns) {
    for (const result of turn.toolResults) {
      if (result.toolName !== toolName || result.status !== 'error') continue
      // 只认「真实运行失败」：execute 抛错（harness 包装成 EXPECTATION_MISMATCH + details.thrown=true，见 generatePlanBatch
      // execute 的 catch）或 TOOL_RUNTIME_ERROR。排除可恢复的参数校验（INVALID_ARGUMENT）与纯候选数量不符
      // （EXPECTATION_MISMATCH·非 thrown）——它们走现役 3 轮重试/调提示路，不是本精确门要根治的真实失败。
      const thrown = (result.details?.thrown === true) || (result.error?.details?.thrown === true)
      const isRealFailure = thrown || result.error?.type === 'TOOL_RUNTIME_ERROR'
      if (!isRealFailure) continue
      const reason = String(result.error?.message || result.content || '').trim()
      if (reason) reasons.push(reason)
    }
  }
  if (!reasons.length) return null
  // 去重保序、最多取 3 条，避免并发批次同因刷屏。
  return Array.from(new Set(reasons)).slice(0, 3).join('；')
}

/** 从 transcript 倒序找最近一轮合法的 expressionMix（编排器生成轮顶层产出）。 */
function readLatestExpressionMix(transcript: AgentTranscript): ReplyPlanExpressionMix | null {
  for (let index = transcript.turns.length - 1; index >= 0; index -= 1) {
    const mix = parseReplyPlanExpressionMix(transcript.turns[index]?.modelMessage.parsed?.expressionMix)
    if (mix) return mix
  }
  return null
}

/** 从 transcript 倒序找最近一轮合法的 wordCountAdvice（编排器生成轮顶层产出，与 expressionMix 同处）。 */
function readLatestWordCountAdvice(transcript: AgentTranscript): ReplyPlanWordCountAdvice | null {
  for (let index = transcript.turns.length - 1; index >= 0; index -= 1) {
    const advice = parseReplyPlanWordCountAdvice(transcript.turns[index]?.modelMessage.parsed?.wordCountAdvice)
    if (advice) return advice
  }
  return null
}

/** 是否为原生工具调用回包形态：对象且 content 是字符串、且携带 toolCalls/tool_calls 数组。
 *  与 runtime.isNativeToolModelOutput 同判别——content 为字符串区分旧 content-JSON 对象路径。 */
function isNativeOrchestratorOutput(output: unknown): boolean {
  if (!output || typeof output !== 'object' || Array.isArray(output)) return false
  const obj = output as { content?: unknown; toolCalls?: unknown; tool_calls?: unknown }
  if (typeof obj.content !== 'string') return false
  return Array.isArray(obj.toolCalls) || Array.isArray(obj.tool_calls)
}

/** 原生 tool_call 项 { id, type, function:{ name, arguments } } → normalizeLoopToolCall 可读的 { tool, args } 记录。
 *  工具名取 function.name、参数解析 function.arguments(JSON 串)；normalizeLoopToolCall 既读 record.args.X 也读 record.X。 */
function nativeToolCallToRecord(item: unknown): Record<string, unknown> {
  const obj = item && typeof item === 'object' ? item as Record<string, unknown> : {}
  const fn = obj.function && typeof obj.function === 'object' ? obj.function as { name?: unknown; arguments?: unknown } : null
  if (!fn) return obj
  const name = String(fn.name ?? '').trim()
  let args: Record<string, unknown> = {}
  const rawArgs = fn.arguments
  if (rawArgs && typeof rawArgs === 'object' && !Array.isArray(rawArgs)) {
    args = rawArgs as Record<string, unknown>
  } else {
    const text = String(rawArgs ?? '').trim()
    if (text) {
      try {
        const p = JSON.parse(text)
        if (p && typeof p === 'object' && !Array.isArray(p)) args = p as Record<string, unknown>
      } catch { args = {} }
    }
  }
  return { tool: name, args }
}

export function parseReplyPlanLoopTurn(output: unknown): ReplyPlanLoopTurnOutput {
  // 工具只走原生 tool_calls（function.name 形态）：编排元数据从 content JSON 读，工具从原生 toolCalls 读。
  // 非原生输入（自动评审合成的 content-JSON 字符串）只读元数据、工具为空——不再从 content-JSON 解析工具（已切原生，无回退）。
  const native = isNativeOrchestratorOutput(output)
  const parsed = native
    ? parseJsonObjectLoose(String((output as { content?: unknown }).content ?? ''))
    : parseJsonObjectLoose(output)
  const nativeRaw = native
    ? (Array.isArray((output as { toolCalls?: unknown }).toolCalls)
        ? (output as { toolCalls: unknown[] }).toolCalls
        : (Array.isArray((output as { tool_calls?: unknown }).tool_calls) ? (output as { tool_calls: unknown[] }).tool_calls : []))
    : []
  const toolCalls = nativeRaw
    .map((item: unknown) => normalizeLoopToolCall(nativeToolCallToRecord(item)))
    .filter((item): item is ReplyPlanLoopToolCall => item !== null)
  return {
    scenario: String(parsed.scenario || '').trim(),
    thought: String(parsed.thought ?? parsed.reasoning ?? '').trim(),
    orchestrationSummary: String(parsed.orchestrationSummary ?? parsed.orchestration_summary ?? '').trim(),
    done: parsed.done === true || parsed.done === 'true',
    expressionMix: parseReplyPlanExpressionMix(parsed.expressionMix ?? parsed.expression_mix),
    wordCountAdvice: parseReplyPlanWordCountAdvice(parsed.wordCountAdvice ?? parsed.word_count_advice),
    toolCalls
  }
}

function normalizeLoopToolCall(value: unknown): ReplyPlanLoopToolCall | null {
  const record = value && typeof value === 'object' ? value as Record<string, any> : {}
  const tool = String(record.tool || record.name_tool || record.toolName || '').trim()
  // 原生工具调用下，expectation 由模型作为函数参数传入、落在 record.args 里；兼读 args.expectation。
  const expectation = String(
    record.expectation ?? record.expected ?? record.expectedResult ?? record.expected_result
    ?? record.args?.expectation ?? record.args?.expected ?? ''
  ).trim()
  if (!tool) return null
  if (tool === 'readScenarioSkill') {
    return {
      tool,
      code: String(record.code ?? record.scenario ?? record.args?.code ?? '').trim().toLowerCase(),
      ...(expectation ? { expectation } : {})
    }
  }
  if (tool === 'getToolManual') {
    return {
      tool,
      name: String(
        record.name
        ?? record.targetTool
        ?? record.target_tool
        ?? record.args?.name
        ?? record.args?.toolName
        ?? record.args?.tool_name
        ?? record.args?.tool
        ?? ''
      ).trim(),
      ...(expectation ? { expectation } : {})
    }
  }
  if (tool === 'updateCurtainScene') {
    const args = record.args && typeof record.args === 'object' ? record.args as Record<string, unknown> : record
    return {
      tool,
      targetTime: String(args.targetTime ?? args.target_time ?? args.time ?? '').trim() || undefined,
      targetLocation: String(args.targetLocation ?? args.target_location ?? args.location ?? '').trim() || undefined,
      locationLarge: String(args.locationLarge ?? args.location_large ?? args.large ?? '').trim() || undefined,
      locationMiddle: String(args.locationMiddle ?? args.location_middle ?? args.middle ?? '').trim() || undefined,
      locationSmall: String(args.locationSmall ?? args.location_small ?? args.small ?? '').trim() || undefined,
      reason: String(args.reason ?? args.intent ?? '').trim() || undefined,
      ...(expectation ? { expectation } : {})
    }
  }
  if (tool === 'generatePlanBatch') {
    // 合并生成协议：batches 数组透传（正式口径一次调用带全部类别组）；旧平铺单类别字段兼容保留。
    const rawBatches = record.batches ?? record.args?.batches
    const batches = Array.isArray(rawBatches)
      ? rawBatches
        .map((item: unknown) => {
          const group = item && typeof item === 'object' && !Array.isArray(item) ? item as Record<string, any> : {}
          return {
            strategy: String(group.strategy || '').trim(),
            strategyLabel: String(group.strategyLabel ?? group.strategy_label ?? '').trim(),
            intensities: Array.isArray(group.intensities)
              ? group.intensities.map((intensity: unknown) => String(intensity || '').trim()).filter(Boolean)
              : [],
            planPrompt: String(group.planPrompt ?? group.plan_prompt ?? '').trim()
          }
        })
      : undefined
    return {
      tool,
      strategy: String(record.strategy ?? record.args?.strategy ?? '').trim(),
      strategyLabel: String(record.strategyLabel ?? record.strategy_label ?? record.args?.strategyLabel ?? record.args?.strategy_label ?? '').trim(),
      intensities: Array.isArray(record.intensities ?? record.args?.intensities)
        ? (record.intensities ?? record.args?.intensities).map((item: unknown) => String(item || '').trim()).filter(Boolean)
        : [],
      planPrompt: String(record.planPrompt ?? record.plan_prompt ?? record.args?.planPrompt ?? record.args?.plan_prompt ?? '').trim(),
      ...(batches && batches.length > 0 ? { batches } : {}),
      ...(expectation ? { expectation } : {}),
      promptLogId: String(record.promptLogId ?? record.prompt_log_id ?? '').trim() || undefined
    }
  }
  if (tool === 'reviewPlanCandidates') {
    return {
      tool,
      candidateIds: Array.isArray(record.candidateIds ?? record.candidate_ids ?? record.args?.candidateIds ?? record.args?.candidate_ids)
        ? (record.candidateIds ?? record.candidate_ids ?? record.args?.candidateIds ?? record.args?.candidate_ids).map((item: unknown) => String(item || '').trim()).filter(Boolean)
        : [],
      ...(expectation ? { expectation } : {}),
      promptLogId: String(record.promptLogId ?? record.prompt_log_id ?? '').trim() || undefined
    }
  }
  // 旁白两件套（O-C2）：保留 profileId(s)/narrationKind/informationBearing/reason/generatedPrompt，否则
  // 未知工具只剩 { tool }、旁白参数全丢，validateArgs（缺 profileId/generatedPrompt）会拦下。
  if (TIDIAO_NARRATION_TOOL_NAMES.includes(tool)) {
    const args = record.args && typeof record.args === 'object' ? record.args as Record<string, any> : record
    return {
      tool,
      profileId: String(args.profileId ?? args.profile_id ?? '').trim(),
      profileIds: Array.isArray(args.profileIds ?? args.profile_ids)
        ? (args.profileIds ?? args.profile_ids).map((item: unknown) => String(item || '').trim()).filter(Boolean)
        : undefined,
      narrationKind: String(args.narrationKind ?? args.narration_kind ?? '').trim(),
      informationBearing: args.informationBearing ?? args.information_bearing,
      reason: String(args.reason ?? '').trim(),
      generatedPrompt: String(args.generatedPrompt ?? args.generated_prompt ?? '').trim(),
      ...(expectation ? { expectation } : {})
    } as ReplyPlanLoopToolCall
  }
  // 取料三件套（批次1d-A）+ 读会话消息（批次 M2）：保留各自参数，否则未知工具只剩 { tool }、query/unitId/ref 丢失会被 validateArgs 拦下。
  if (TIDIAO_RETRIEVAL_TOOL_NAMES.includes(tool) || tool === TIDIAO_READ_CHAT_MESSAGE_TOOL_NAME) {
    const args = record.args && typeof record.args === 'object' ? record.args as Record<string, any> : record
    return {
      tool,
      // 容错读参（与本 harness 其他工具一致）：优先 query，兼容模型可能用的 keyword/term/q/text/searchText 别名。
      query: String(args.query ?? args.keyword ?? args.term ?? args.q ?? args.text ?? args.searchText ?? args.search_text ?? '').trim(),
      ref: String(args.ref ?? '').trim(),
      topK: args.topK ?? args.top_k,
      regex: args.regex === true || args.regex === 'true',
      limit: args.limit,
      unitId: String(args.unitId ?? args.unit_id ?? '').trim(),
      level: String(args.level ?? '').trim(),
      reason: String(args.reason ?? '').trim(),
      ...(expectation ? { expectation } : {})
    } as ReplyPlanLoopToolCall
  }
  return { tool } as ReplyPlanLoopToolCall
}

function inferTurnStage(toolCalls: ReplyPlanLoopToolCall[]): string {
  const firstTool = toolCalls[0]?.tool
  if (firstTool === 'readScenarioSkill') return 'scenario-routing'
  if (firstTool === 'updateCurtainScene') return 'scenario-routing'
  if (firstTool === 'getToolManual') return 'manual-reading'
  if (firstTool === 'generatePlanBatch') return 'plan-generation'
  if (firstTool === 'reviewPlanCandidates') return 'plan-review'
  // O-C2 旁白两件套：独立 stage，供累加器映射成 narrationDir 决策（不进 mapRuntimeStageToProgressStep 主步骤）。
  if (firstTool === 'readNarrationSkill') return 'narration-skill-read'
  if (firstTool === 'confirmNarrationCall') return 'narration-routing'
  return 'unknown'
}

function toRuntimeToolCall(
  toolCall: ReplyPlanLoopToolCall,
  turnIndex: number,
  index: number
): Partial<ToolCallMessage> & { id: string; function: { name: string; arguments: string } } {
  const toolName = toolCall.tool
  const callId = `reply_plan_${turnIndex + 1}_${index + 1}_${toolName}`
  const args = toRuntimeArgs(toolCall)
  return {
    // 原生衔接：带 function + id，runtime normalizeToolCall 据此标 native:true，工具结果走原生 role:'tool' 回灌
    //（与 callOrchestrator 下发的 tools 闭环）；callId/toolName/args 作冗余兜底（normalizeToolCall 原生优先）。
    id: callId,
    function: { name: toolName, arguments: JSON.stringify(args) },
    callId,
    toolName,
    stage: inferTurnStage([toolCall]),
    args,
    expectation: String((toolCall as { expectation?: string }).expectation || '').trim(),
    requestedAtTurn: turnIndex
  }
}

function toRuntimeArgs(toolCall: ReplyPlanLoopToolCall): Record<string, unknown> {
  if (toolCall.tool === 'readScenarioSkill') return { code: toolCall.code }
  if (toolCall.tool === 'getToolManual') return { name: toolCall.name }
  if (toolCall.tool === 'updateCurtainScene') return toCurtainSceneUpdateArgs(toolCall)
  if (toolCall.tool === 'generatePlanBatch') return toGenerateArgs(toolCall)
  if (toolCall.tool === 'reviewPlanCandidates') return { candidateIds: [...toolCall.candidateIds] }
  // 取料三件套 + 读会话消息（批次 M2）不在 ReplyPlanLoopToolCall 联合里，此处 toolCall 已被收窄为 never，需经宽松转型读取。
  const looseToolCall = toolCall as { tool?: string } & Record<string, unknown>
  if (looseToolCall.tool && (TIDIAO_RETRIEVAL_TOOL_NAMES.includes(looseToolCall.tool) || looseToolCall.tool === TIDIAO_READ_CHAT_MESSAGE_TOOL_NAME)) {
    return {
      query: looseToolCall.query,
      ref: looseToolCall.ref,
      topK: looseToolCall.topK,
      regex: looseToolCall.regex,
      limit: looseToolCall.limit,
      unitId: looseToolCall.unitId,
      level: looseToolCall.level,
      reason: looseToolCall.reason
    }
  }
  // 旁白两件套（O-C2）：把解析时保留的旁白参数原样交给 ToolRegistry，validateArgs/execute 据此工作。
  if (looseToolCall.tool && TIDIAO_NARRATION_TOOL_NAMES.includes(looseToolCall.tool)) {
    return {
      profileId: looseToolCall.profileId,
      profileIds: looseToolCall.profileIds,
      narrationKind: looseToolCall.narrationKind,
      informationBearing: looseToolCall.informationBearing,
      reason: looseToolCall.reason,
      generatedPrompt: looseToolCall.generatedPrompt
    }
  }
  return { ...(toolCall as Record<string, unknown>) }
}

// R1-B B5-2 item2b：toCurtainSceneUpdateToolCall / toGenerateToolCall / toReviewToolCall / describeGenerateArgError
// 4 个纯 transform 已随编排工具迁入 tidiaoGlobalTools（唯一家）；本文件不再用，已删除。

function toGenerateArgs(toolCall: GeneratePlanBatchToolCall): Record<string, unknown> {
  // 合并生成协议：batches 在位时以它为正式参数（工具 execute 按 batches 展开）；平铺字段兼容保留。
  if (Array.isArray(toolCall.batches) && toolCall.batches.length > 0) {
    return {
      batches: toolCall.batches.map((group) => ({ ...group, intensities: [...group.intensities] })),
      ...(toolCall.expectation ? { expectation: toolCall.expectation } : {})
    }
  }
  return {
    strategy: toolCall.strategy,
    strategyLabel: toolCall.strategyLabel,
    intensities: toolCall.intensities,
    planPrompt: toolCall.planPrompt,
    ...(toolCall.expectation ? { expectation: toolCall.expectation } : {})
  }
}

function toCurtainSceneUpdateArgs(toolCall: ReplyPlanCurtainSceneUpdateToolCall): Record<string, unknown> {
  return {
    ...(toolCall.targetTime ? { targetTime: toolCall.targetTime } : {}),
    ...(toolCall.targetLocation ? { targetLocation: toolCall.targetLocation } : {}),
    ...(toolCall.locationLarge ? { locationLarge: toolCall.locationLarge } : {}),
    ...(toolCall.locationMiddle ? { locationMiddle: toolCall.locationMiddle } : {}),
    ...(toolCall.locationSmall ? { locationSmall: toolCall.locationSmall } : {}),
    ...(toolCall.reason ? { reason: toolCall.reason } : {})
  }
}

/** 评审自动触发：条件满足时直接调用评审回调（本地 ReRanker），写入 state 并返回一段合成的收束输出
 *  （done=true、无 toolCalls），runtime 据此结束循环；不满足条件返回 null 走正常模型轮。
 *  ReRanker 打分无效等错误按文档 3.6.1 直接向外抛出停止本轮生成，不得吞错降级成兜底分。 */
// R1-B B5-2 item2b：buildDegradedReviewResult 已随评审工具迁入 tidiaoGlobalTools（唯一家）；
// 本文件自动评审降级路径（maybeRunAutoPlanReview）改 value-import 复用，定义已删除。

async function maybeRunAutoPlanReview(
  state: ReplyPlanRuntimeState,
  input: ReplyPlanOrchestratorHarnessInput,
  turnIndex = 0
): Promise<string | null> {
  const directorAcc = state.directorAcc
  if (state.skipReview || state.reviewResult) return null
  if (state.generateCalls === 0 || state.generateErrorCount > 0) return null
  if (state.candidates.length < state.budget.minCandidatesForReview) return null
  if (!state.latestExpressionMix) return null
  if (state.reviewCalls >= state.budget.maxReviewPlanCandidatesCalls) return null
  state.reviewCalls += 1
  input.onStageProgress?.({ step: 'review', status: 'running' })
  // 导演模式：自动评审不经 runtime 工具循环（在 callModel 内直接跑），故 onProgress 不会上抛——
  // 这里直接喂累加器，把「送评审挑最优」投影成一条带工具条的评审决策，避免「只两条、评审不可见」。
  // 同时本路返回的合成 JSON 会把 thought 置空，防止 runtime 再产出一条重复评审决策。
  const directorMode = Boolean(directorAcc)
  if (directorAcc) {
    directorAcc.onRuntimeProgress({ kind: 'thought', stage: 'plan-review', toolName: '', thought: '候选齐了，送本地评审挑最优三条', turnIndex })
    directorAcc.onRuntimeProgress({ kind: 'tool-start', stage: 'plan-review', toolName: 'reviewPlanCandidates', detail: `${state.candidates.length} 条候选`, turnIndex })
  }
  const call: ReviewPlanCandidatesToolCall = {
    tool: 'reviewPlanCandidates',
    candidateIds: state.candidates.map((candidate) => candidate.id),
    expectation: '候选与表达占比齐备，由系统自动触发本地 ReRanker 评审并产出前三计划。',
    autoTriggered: true
  }
  let result: ReplyPlanReviewToolResult
  try {
    result = await input.reviewPlanCandidates(call, state.candidates)
  } catch (error) {
    // 取消信号优先：用户主动中断不算评审失败，原样抛出由外层按取消处理。
    if (input.signal?.aborted || (error instanceof Error && error.message === ABORTED_MESSAGE)) {
      input.onStageProgress?.({ step: 'review', status: 'failed' })
      directorAcc?.onRuntimeProgress({ kind: 'tool-result', stage: 'plan-review', toolName: 'reviewPlanCandidates', status: 'error', errorMessage: ABORTED_MESSAGE, turnIndex })
      throw error
    }
    // 评审降级（用户拍板）：本地 ReRanker 加载/运行/打分无效时不再整条崩溃，
    // 按候选自身顺序降级产出前三计划继续出回复，过程轨如实标注降级原因，保留失败审计。
    const reason = error instanceof Error ? error.message : String(error)
    result = buildDegradedReviewResult(state.candidates, reason)
    state.reviewResult = result
    state.planToolCalls.push(call)
    input.onReviewDegraded?.(reason)
    input.onStageProgress?.({ step: 'review', status: 'done' })
    // 降级不是死失败：评审工具条收成 done + 「评审降级」摘要，避免误报错；技术原因经 onReviewDegraded 进审计。
    directorAcc?.onRuntimeProgress({ kind: 'tool-result', stage: 'plan-review', toolName: 'reviewPlanCandidates', status: 'success', resultPreview: '评审降级 · 按候选顺序取前三', turnIndex })
    // 合成收束输出为纯 content-JSON 元数据（已切原生，工具不再走 content）：done 收束、无工具。
    return JSON.stringify({
      scenario: state.scenario,
      thought: directorMode ? '' : '本地 ReRanker 评审未能运行，已按候选顺序降级产出前三计划。',
      orchestrationSummary: '评审降级（ReRanker 未运行）。',
      done: true
    })
  }
  if (!result.topPlans.length) {
    // 评审未产出前三计划（理论不可达）：回退模型驱动评审，让 hook 按旧协议处理
    state.reviewCalls -= 1
    input.onStageProgress?.({ step: 'review', status: 'retry' })
    directorAcc?.onRuntimeProgress({ kind: 'tool-result', stage: 'plan-review', toolName: 'reviewPlanCandidates', status: 'error', errorMessage: '评审未产出结果，转交模型重试', retried: true, turnIndex })
    return null
  }
  call.promptLogId = result.promptLogId
  state.reviewResult = result
  state.planToolCalls.push(call)
  input.onStageProgress?.({ step: 'review', status: 'done' })
  directorAcc?.onRuntimeProgress({ kind: 'tool-result', stage: 'plan-review', toolName: 'reviewPlanCandidates', status: 'success', resultPreview: `挑出前 ${result.topPlans.length} 条`, turnIndex })
  // 合成收束输出：内容如实写明评审由系统自动触发，作为终轮进入 transcript 审计。
  // 导演模式下 thought 置空——评审决策已由上面的累加器投影承载，避免 runtime 再产出重复评审条。
  return JSON.stringify({
    scenario: state.scenario,
    thought: directorMode ? '' : '候选计划与表达占比齐备，系统已自动触发本地 ReRanker 评审，无需编排模型确认。',
    orchestrationSummary: '评审由系统自动触发完成。',
    done: true
  })
}

async function notifyScenarioResolvedIfNeeded(state: ReplyPlanRuntimeState): Promise<void> {
  if (!state.scenarioBody) return
  if (state.scenarioResolvedPromise) {
    await state.scenarioResolvedPromise
    return
  }
  if (state.scenarioResolvedNotified) return
  state.scenarioResolvedNotified = true
  state.scenarioResolvedPromise = Promise.resolve(state.input.onScenarioResolved?.({
    scenario: state.scenario,
    scenarioBody: state.scenarioBody,
    sceneChangeNotice: state.curtainSceneUpdate?.notice || state.input.sceneChangeNotice || '',
    curtainSceneUpdate: state.curtainSceneUpdate
  })).then(() => undefined)
  await state.scenarioResolvedPromise
}

// R1-B B5-2 item2b：renderGenerateResultText / readActualCandidateCountFromErrorMessage 已随编排工具迁入
// tidiaoGlobalTools（唯一家）；本文件不再用，已删除。

function toolError(type: NonNullable<ToolExecutionResult['error']>['type'], message: string, details: Record<string, unknown> = {}): ToolExecutionResult {
  return {
    status: 'error',
    content: message,
    details,
    error: {
      type,
      message,
      retryable: type === 'EXPECTATION_MISMATCH',
      details
    }
  }
}

function readLatestParsedString(transcript: AgentTranscript, key: string): string {
  for (let index = transcript.turns.length - 1; index >= 0; index -= 1) {
    const value = transcript.turns[index]?.modelMessage.parsed?.[key]
    const text = String(value || '').trim()
    if (text) return text
  }
  return ''
}

function toReplyPlanLoopTurns(transcript: AgentTranscript): ReplyPlanLoopTurnRecord[] {
  return transcript.turns.map((turn) => ({
    turnIndex: turn.turnIndex,
    thought: String(turn.modelMessage.parsed?.thought ?? ''),
    scenario: String(turn.modelMessage.parsed?.scenario ?? ''),
    rawText: turn.modelMessage.content,
    toolResults: turn.toolResults.map((result) => {
      const call = turn.toolCalls.find((item) => item.callId === result.callId)
      return {
        tool: result.toolName,
        args: call?.args ?? {},
        ...(call?.expectation ? { expectation: call.expectation } : {}),
        resultText: result.content,
        isError: result.status === 'error' || result.status === 'blocked',
        blocked: result.status === 'blocked',
        promptLogId: String(result.details?.promptLogId || '').trim() || undefined
      }
    })
  }))
}

function parseJsonObjectLoose(value: unknown): Record<string, any> {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, any>
  const source = String(value ?? '').trim()
  const start = source.indexOf('{')
  const end = source.lastIndexOf('}')
  const jsonText = start >= 0 && end > start ? source.slice(start, end + 1) : source
  try {
    const parsed = JSON.parse(jsonText)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, any> : {}
  } catch {
    return {}
  }
}
