// 统一 state 协议 · append log 类型与文档真值（R3-0 · 2026-06-27 R3 提调统一 state 地基计划书）。
//
// 定位：这是「event sourcing 三件套」里 ①append log（追加日志·保真原始事件）的类型契约。
// 出处方向：docs/features/chat/AGENT_TOOL_ARCHITECTURE_DISCUSSION.md §9（state/loop 架构）+ 落地分层 L1。
//
// 三件套（合起来 = 持久回忆）：
//   ① append log（本文件）：消息/工具结果/报错 一到达就 append 进原始 state，永不真删。
//   ② 压缩投影（R3-3）：喂给模型的是从 log 压出的视图（复用现役「投影」机制），不是整份数组。
//   ③ 检索兜底（R3-4）：原始 log 提供检索工具，压出视图的内容仍可被搜回。
//
// 边界（R3-0 只立类型）：
//   - 本文件只定义类型与协议文档，不含任何运行态/append 逻辑（载体在 R3-2 appendLog.ts）。
//   - 复用现役类型，绝不重定义：ToolCallMessage/ToolResultMessage/ToolResultError（agentRuntime/types.ts）、
//     TidiaoDecisionEntry（tidiaoDirectorStream.ts）。append log 是它们的「保真原始层」，directorStream 是它的投影视图。
//   - 形态拍板（用户 2026-06-27）：append log 是 .ts 响应式结构化对象 + 持久走现役 DB processTrace，不写 .md。

import type { ToolCallMessage, ToolResultMessage, ToolResultError, ToolFieldLifecycleMap } from '../agentRuntime/types'
import type { TidiaoDecisionEntry } from '../tidiaoDirectorStream'

// 字段生命周期标签（FieldLifecycle / ToolFieldLifecycleMap / DEFAULT_FIELD_LIFECYCLE）的真值源在
// agentRuntime/types.ts（工具 IO 层拥有），本模块按需 re-export 给 agentState 内部使用，避免回边 import。
export type { FieldLifecycle, ToolFieldLifecycleMap } from '../agentRuntime/types'
export { FIELD_LIFECYCLES, DEFAULT_FIELD_LIFECYCLE } from '../agentRuntime/types'

// ─────────────────────────────────────────────────────────────────────────────
// append log 事件（保真原始事件，永不真删；seq 单调递增标 append 顺序）
// ─────────────────────────────────────────────────────────────────────────────

/** append log 事件类型。message=对话消息；toolCall=工具调用；toolResult=工具结果；error=报错；decision=人话决策。 */
export type AppendLogEventType = 'message' | 'toolCall' | 'toolResult' | 'error' | 'decision'

/**
 * R1-C 主/子 state 隔离（只 merge 结论）：事件归属——是「轮级提调/编辑/单聊导演」自己的，还是「演员子 loop」的过程事件。
 * - 缺省（undefined）= 提调本人事件（轮级提调/编辑 loop/单聊导演 directorMode）——进跨轮记忆投影，行为不变。
 * - 'actor' = 演员子 loop（replyPlanOrchestratorHarness 群聊 per-speaker 台词生成·directorMode=false）的过程事件——
 *   仍 append 进保真层（保留演员自审计：searchAppendLog 搜得到、随快照落库），但**不进**提调跨轮记忆投影
 *   （renderAppendLogProjection 过滤掉），达成 context isolation：提调记忆只见自己的决策+结论、不被演员取料/工具过程污染。
 */
export type AppendLogEventOrigin = 'actor'

/** 所有 append log 事件共有的元信息。 */
export interface AppendLogEventBase {
  /** 事件序号（单调递增，append 顺序唯一键；检索/审计按它对齐）。 */
  seq: number
  /** 事件类型（判别联合的 tag）。 */
  type: AppendLogEventType
  /** 归属的提调带轮 runId——一条提调带工程上是多次独立 loop 运行拼起来的，同一 runId 串成一条带。 */
  runId: string
  /** 会话 ID（跨会话隔离：检索/投影/落库都按它过滤，绝不跨会话串台）。 */
  sessionId: string
  /** append 时刻的墙钟时间戳（毫秒，append 时注入）；用于报错诊断「哪一步、什么时候」。可缺省。 */
  at?: number
  /** R1-C：事件归属（缺省=提调本人；'actor'=演员子 loop 过程事件·投影时被过滤、审计保留）。见 AppendLogEventOrigin。 */
  origin?: AppendLogEventOrigin
}

/** 对话消息事件（用户/助手/系统/工具回灌的一条消息原文，保真）。 */
export interface AppendLogMessageEvent extends AppendLogEventBase {
  type: 'message'
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
}

/** 工具调用事件（模型发起一次工具调用，保真原始入参）。 */
export interface AppendLogToolCallEvent extends AppendLogEventBase {
  type: 'toolCall'
  call: ToolCallMessage
}

/** 工具结果事件（一次工具执行的结构化结果，保真 content+details；lifecycle 标各字段去留）。 */
export interface AppendLogToolResultEvent extends AppendLogEventBase {
  type: 'toolResult'
  result: ToolResultMessage
  /** 该结果各 details 字段的生命周期标签（工具声明 → 压缩器读）。缺省字段按 DEFAULT_FIELD_LIFECYCLE。 */
  lifecycle?: ToolFieldLifecycleMap
}

/** 报错事件（真 loop 工具报错/子步失败作为一类事件进 state；提调可检索/自诊断「哪一步、什么错」）。 */
export interface AppendLogErrorEvent extends AppendLogEventBase {
  type: 'error'
  /** 错在哪一步（agent stage，如 plan-generation / scenario-routing）。 */
  stage?: string
  /** 错在哪个工具（缺省=非工具步骤的报错）。 */
  toolName?: string
  /** 错在第几轮（loop turnIndex）。 */
  turnIndex?: number
  /** 结构化错误（复用现役 ToolResultError：type/message/retryable/details）。 */
  error: ToolResultError
}

/** 人话决策事件（提调每步的「人话决策」，复用现役 TidiaoDecisionEntry；directorStream 视图由它折叠）。 */
export interface AppendLogDecisionEvent extends AppendLogEventBase {
  type: 'decision'
  decision: TidiaoDecisionEntry
}

/** append log 事件判别联合（按 type 收窄）。 */
export type AppendLogEvent =
  | AppendLogMessageEvent
  | AppendLogToolCallEvent
  | AppendLogToolResultEvent
  | AppendLogErrorEvent
  | AppendLogDecisionEvent

// ─────────────────────────────────────────────────────────────────────────────
// append log 保真容器（一条提调带 = 一份 log；载体响应式 ref 与 append 逻辑在 R3-2）
// ─────────────────────────────────────────────────────────────────────────────

/** 一条提调带的 append log 保真容器：跨多次 loop 运行拼成一条带，events 永不真删，nextSeq 单调发号。 */
export interface AgentAppendLog {
  /** 轮级主键（与 activePipelineTidiaoRunId / directorStreamRound.runId 同源）。 */
  runId: string
  /** 会话 ID。 */
  sessionId: string
  /** 保真事件序列（append-only，永不真删）。 */
  events: AppendLogEvent[]
  /** 下一个事件序号（单调发号，避免并发 append 撞号）。 */
  nextSeq: number
  /** option C（2026-07-01·发送时留存真实 prompt）：提调这一轮拼好的真实 prompt（system+user 渲成文本），
   *  供 state 查看器「喂模型原文」忠实显示（纲领+聊天历史直接来自它·零重构）。loop 启动拼好 messages 后写入，
   *  随 directorStream/appendLog 同处落库；旧数据/未捕获时缺省，查看器回退旧压缩台账。 */
  directorPrompt?: string
}
