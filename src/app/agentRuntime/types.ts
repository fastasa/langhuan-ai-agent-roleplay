// 人在环上统一契约（2026-07-12 架构审查批C）：halt 模式信封类型，仅 import 类型（agentRuntime 内核层与
// 该契约同属通用件，无业务方向依赖）。见 ./interactionContract 头注释三种投递模式说明。
import type { InteractionRequest } from './interactionContract'
import type { AgentSupplyProfileId } from '../../../shared/agentSupplyManifest'
import type { AgentSubagentWaitRequest } from './subagentWait'

export const AGENT_RUNTIME_LIFECYCLES = [
  'beforeModelCall',
  'afterModelMessage',
  'beforeToolCall',
  'afterToolResult',
  'beforeNextTurn',
  'afterTurn',
  'onError',
  'onTerminate'
] as const

export type AgentRuntimeLifecycle = typeof AGENT_RUNTIME_LIFECYCLES[number]

export const AGENT_RUNTIME_ERROR_TYPES = [
  'INVALID_ARGUMENT',
  'TOOL_NOT_FOUND',
  'TOOL_TIMEOUT',
  'TOOL_RUNTIME_ERROR',
  'EXPECTATION_MISMATCH',
  'BUDGET_EXCEEDED',
  'MODEL_OUTPUT_INVALID',
  'ABORTED',
  'HOOK_RUNTIME_ERROR'
] as const

export type AgentRuntimeErrorType = typeof AGENT_RUNTIME_ERROR_TYPES[number]

export const REPLY_PLAN_AGENT_STAGES = [
  'scenario-routing',
  'context-assembly',
  'skill-reading',
  'manual-reading',
  'plan-generation',
  'plan-review',
  'final-reply-prep'
] as const

export type ReplyPlanAgentStage = typeof REPLY_PLAN_AGENT_STAGES[number]

export type AgentToolResultStatus = 'success' | 'error' | 'blocked'

// ─────────────────────────────────────────────────────────────────────────────
// 字段生命周期标签（统一 state 协议 R3-1 · 工具 IO 层拥有此原语，agentState 单向 import）
//   解「精准 vs 优雅」两难：压缩逻辑一份、保留判断由各工具自包含声明。
// ─────────────────────────────────────────────────────────────────────────────

/** 工具输出 details 字段的生命周期标签：
 *  - durable（持久）：留进压缩投影视图、每轮喂模型（关键事实）。
 *  - transient（瞬时）：轮内即清，不进投影、不进检索（纯过程噪声）。
 *  - searchable（可检索）：清出视图（默认不喂模型省 token），但保真进 append log、可检索搜回。 */
export const FIELD_LIFECYCLES = ['durable', 'transient', 'searchable'] as const
export type FieldLifecycle = typeof FIELD_LIFECYCLES[number]

/** 工具输出字段的生命周期声明：键 = details 字段名，值 = 该字段标签。未声明字段按 DEFAULT_FIELD_LIFECYCLE 兜底。 */
export type ToolFieldLifecycleMap = Record<string, FieldLifecycle>

/** 未声明字段的兜底标签：searchable——保真进 log 不丢，但默认不喂模型（保守省 token、不静默丢数据）。 */
export const DEFAULT_FIELD_LIFECYCLE: FieldLifecycle = 'searchable'

export interface ToolCallMessage<TArgs extends Record<string, unknown> = Record<string, unknown>> {
  kind: 'toolCall'
  callId: string
  toolName: string
  stage: ReplyPlanAgentStage | string
  args: TArgs
  expectation: string
  requestedAtTurn: number
  // 原生工具调用标记：本调用来自回包原生 tool_calls（function.name 形态）时为 true。
  // 用于「原生感知条件回灌」——native 轮的 assistant 携带 tool_calls、工具结果走 role:'tool'+tool_call_id；
  // 非 native（迁移期 content-JSON）维持旧的 role:'user' JSON 回灌，互不影响。
  native?: boolean
}

export interface ToolResultError {
  type: AgentRuntimeErrorType
  message: string
  retryable: boolean
  details?: Record<string, unknown>
}

export interface ToolResultMessage<TDetails extends Record<string, unknown> = Record<string, unknown>> {
  kind: 'toolResult'
  callId: string
  toolName: string
  stage: ReplyPlanAgentStage | string
  status: AgentToolResultStatus
  content: string
  details: TDetails
  error?: ToolResultError
  // 结果级 acted 修正位（2026-07-07 范式优化批次1·随 ToolExecutionResult.acted 透传）：
  // 本次执行是否真的「改了世界」；缺省=消费方按语义表推导（见 tidiaoGlobalTools.isTidiaoToolResultActed）。
  acted?: boolean
  // halt 原语（2026-07-12 架构审查批C）：工具请求用户输入时携带的统一信封——引擎据此在步骤边界收束本 loop
  // （terminalReason='awaiting-user'，见 runtime.ts），答复由消费方（如提调纠偏）喂进新 loop 续接。
  // 只在 status==='success' 时生效（error 结果的该字段不触发收束，见 runtime.ts halt 收束点）。
  awaitingUser?: InteractionRequest
  /** 后台子 Agent 静默候报：任务已经由宿主验证为 running，当前父 loop 收束但不停止子任务。 */
  awaitingSubagent?: AgentSubagentWaitRequest
  // closingNote 预写收尾话（2026-07-12 用户拍板·派发类工具省收尾轮）：本轮恰好一个工具调用、结果
  // status==='success' 且携带此字段时，引擎直接把这段文字当作本轮最终 assistant 回复、收束 loop
  // （terminalReason='closing-note'），不再多调一轮模型换收尾话。只在 status==='success' 时生效、
  // 且仅单工具调用轮生效（见 runtime.ts closing-note 收束点 + toolRegistry.ts ToolExecutionResult 注释）。
  closingNote?: string
}

export interface HookEvent {
  kind: 'hookEvent'
  id: string
  lifecycle: AgentRuntimeLifecycle
  stage?: ReplyPlanAgentStage | string
  toolName?: string
  callId?: string
  priority: number
  effects: HookEffect[]
  summary: string
}

export type HookEffect =
  | 'blockToolCall'
  | 'patchToolResult'
  | 'injectMessage'
  | 'patchSystemPrompt'
  | 'setActiveTools'
  | 'requestRetry'
  | 'terminate'
  | 'writeTrace'

export interface NextTurnPatch {
  kind: 'nextTurnPatch'
  id: string
  sourceHookId: string
  stage: ReplyPlanAgentStage | string
  injectMessages: Array<{
    role: 'system' | 'user' | 'assistant'
    content: string
    purpose: 'calibration' | 'tool-result-context' | 'error-repair' | 'stage-instruction'
  }>
  activeTools?: string[]
  systemPromptPatch?: string
  requestRetry?: {
    callId?: string
    toolName?: string
    errorType?: AgentRuntimeErrorType
    reason: string
  }
  terminate?: boolean
}

export interface AgentModelMessage {
  kind: 'modelMessage'
  role: 'assistant'
  content: string
  parsed?: Record<string, unknown>
}

export type AgentRuntimeHistoryMessage =
  | { kind: 'chat'; role: 'system' | 'user' | 'assistant' | 'tool'; content: string }
  | AgentModelMessage
  | ToolCallMessage
  | ToolResultMessage
  | HookEvent
  | NextTurnPatch

export interface AgentTranscriptTurn {
  turnIndex: number
  stage: ReplyPlanAgentStage | string
  activeTools: string[]
  modelMessage: AgentModelMessage
  toolCalls: ToolCallMessage[]
  toolResults: ToolResultMessage[]
  hookEvents: HookEvent[]
  nextTurnPatches: NextTurnPatch[]
}

export interface AgentRuntimeBudgetTrace {
  /** null 表示正式交互 Agent 不设固定回合上限，只由真实退出条件收束。 */
  maxTurns: number | null
  /** null 表示不设固定业务工具调用上限。 */
  maxToolCalls: number | null
  usedTurns: number
  usedToolCalls: number
  maxHookInjectedTokens?: number
  usedHookInjectedTokens?: number
}

/** 当轮 Prompt 供给的结构化审计记录。它只属于 transcript，不是模型消息或 Prompt 正文。 */
export type AgentPromptSupplyLoadState =
  | 'catalog_only'
  | 'loaded'
  | 'load_failed_optional'
  | 'load_failed_required'
  | 'rejected'

export interface AgentPromptSupplyTraceEntry {
  profileId: AgentSupplyProfileId
  skillId: string
  source: string | null
  layer: '0' | '1' | '4' | null
  loadState: AgentPromptSupplyLoadState
  chars: number
  hash: string
  reason: string
  selector?: string
}

/** manifest 声明与当轮真实授权 registry 不一致时的显式诊断；只记录，不补权。 */
export interface AgentToolSupplyDiagnostic {
  kind: 'manifest_common_tool_not_registered'
  profileId: AgentSupplyProfileId
  toolName: string
  registrySource: string
}

export interface AgentTranscript {
  kind: 'agentTranscript'
  agentName: string
  runtimeVersion: string
  initialActiveTools: string[]
  /** Skill 供给轨迹只进 transcript；runtime 不会把它拼入 messages/history。 */
  promptSupplyTrace?: AgentPromptSupplyTraceEntry[]
  /** manifest 高频集缺口等供给诊断；真实授权仍以 registry 为上限。 */
  toolSupplyDiagnostics?: AgentToolSupplyDiagnostic[]
  history: AgentRuntimeHistoryMessage[]
  turns: AgentTranscriptTurn[]
  budget: AgentRuntimeBudgetTrace
  // paused-for-correction：导演模式软停——当前步跑完后在步骤边界干净收束，交「停止→纠偏」挂起流程。
  // timeout：导演模式运行硬超时（20 分钟）自动截止，判本轮失败。
  // awaiting-user：人在环上 halt 原语（2026-07-12 架构审查批C）——工具请求用户输入（信封见
  //   RunAgentRuntimeResult.pendingInteraction），loop 在步骤边界干净收束；这是**正常收尾**而非失败，
  //   答复由消费方喂进新 loop 续接（如提调纠偏 askUser，迁移自旧「holder+halt hook」机制）。
  // closing-note：预写收尾话收束（2026-07-12 用户拍板）——本轮单个工具调用成功且携带 closingNote，
  //   引擎不再多调一轮模型换收尾话，直接把 closingNote 当作最终 assistant 回复收束；同属**正常收尾**，
  //   语义等价 'done'（只是省了最后一轮模型调用），见 runtime.ts closing-note 收束点。
  terminalReason: 'done' | 'incomplete' | 'terminated-by-hook' | 'budget-exceeded' | 'error' | 'aborted' | 'paused-for-correction' | 'timeout' | 'awaiting-user' | 'awaiting-subagent' | 'closing-note'
}

export interface ReplyTask {
  id: string
  source: 'new-user-message' | 'user-message-rerun' | 'role-message-retry'
  sessionId: string
  anchorMessageId: string
  targetCharacterId: string
}

export interface ReplyTaskSchedulerSnapshot {
  kind: 'replyTaskScheduler'
  boundary: 'outside-agent-runtime'
  tasks: ReplyTask[]
  note: string
}
