// 统一 state 协议 · append log 载体（R3-2 · 响应式保真层）。
//
// 定位：
// 一条提调带的「原始事件保真层」——消息/工具调用/工具结果/报错/决策 一到达就 append、永不真删。
// 与现役载体的关系（标清谁是源，避免双真值分叉）：
//   - 本模块 activeAgentAppendLog = 保真原始层（append-only，源）。
//   - tidiaoDirectorStreamState 的 decisions/shots = 它的「呈现投影视图」（R3-3 起从本 log 派生）。
//   - chatCorrectionState = 流程挂起态，与本协议无关、不动。
//
// 形态拍板（用户 2026-06-27）：.ts 响应式结构化对象（ref + 事件数组）+ 持久走现役 DB processTrace，不写 .md。
// 借鉴 md「人可读」精神 → renderAppendLogEvent 把每条事件渲染成人话行（喂模型/审计/检索回显共用）。
//
// 范围（R3-2）：append log 按 runId 标识「当前活动 loop 运行」的保真事件流，供 R3-3 投影、R3-4 检索、R3-5 报错读取。
// 跨多次 loop 运行（每次纠偏=新 runId）的跨带累积，沿用现役 carryOver/落库机制，不在本模块内实现。

import { ref } from 'vue'
import type {
  AgentAppendLog,
  AppendLogDecisionEvent,
  AppendLogErrorEvent,
  AppendLogEvent,
  AppendLogEventOrigin,
  AppendLogEventType,
  AppendLogMessageEvent,
  AppendLogToolCallEvent,
  AppendLogToolResultEvent,
  ToolFieldLifecycleMap
} from './appendLogTypes'
import type {
  ToolCallMessage,
  ToolResultError,
  ToolResultMessage
} from '../agentRuntime/types'
import type { TidiaoDecisionEntry } from '../tidiaoDirectorStream'

/** 当前活动提调带的 append log；null = 无活动 log。 */
export const activeAgentAppendLog = ref<AgentAppendLog | null>(null)

// 事件入参类型：按判别联合**分配式** Omit 掉运行时注入字段（seq/runId/sessionId/at）。
// 不能直接 `Omit<AppendLogEvent, ...>`——那会把联合塌缩成只剩公共字段 type，丢掉 role/call 等各分支专属字段。
type AppendEventInput = AppendLogEvent extends infer E
  ? (E extends AppendLogEvent ? Omit<E, 'seq' | 'runId' | 'sessionId' | 'at'> : never)
  : never

/** 墙钟时间戳（毫秒）；抽成函数便于测试替身。浏览器运行态用 Date.now，无副作用。 */
function nowMs(): number {
  return Date.now()
}

/** 起一条 append log：同 runId 重入保留已有事件（同一 loop 运行多次接线不清空）；不同 runId / 无 log 起新的。 */
export function beginAppendLog(input: { runId: string; sessionId: string }): void {
  const runId = String(input.runId || '').trim()
  const sessionId = String(input.sessionId || '').trim()
  const current = activeAgentAppendLog.value
  if (current && current.runId && runId && current.runId === runId) return
  activeAgentAppendLog.value = { runId, sessionId, events: [], nextSeq: 1 }
}

/** 内部：把一条事件（缺 seq/at）append 进当前 log；runId 不匹配（已被新轮替换）时丢弃，避免迟到事件串轮。 */
function pushEvent(
  runId: string,
  partial: AppendEventInput
): void {
  const current = activeAgentAppendLog.value
  if (!current) return
  const key = String(runId || '').trim()
  if (key && current.runId && key !== current.runId) return
  const event = {
    ...partial,
    seq: current.nextSeq,
    runId: current.runId,
    sessionId: current.sessionId,
    at: nowMs()
  } as AppendLogEvent
  // append-only：新建数组引用以触发 Vue 响应式，旧事件永不改不删。
  activeAgentAppendLog.value = {
    ...current,
    events: [...current.events, event],
    nextSeq: current.nextSeq + 1
  }
}

// R1-C：各 append*Event 透传可选 origin（缺省=提调本人；'actor'=演员子 loop 过程事件·投影时过滤、审计保留）。
// origin 只随事件 payload 进 partial、由 pushEvent 原样写入；不传则字段缺省，老行为逐字不变。

/** append 一条对话消息事件（保真原文）。 */
export function appendMessageEvent(runId: string, role: AppendLogMessageEvent['role'], content: string, origin?: AppendLogEventOrigin): void {
  pushEvent(runId, { type: 'message', role, content: String(content ?? ''), ...(origin ? { origin } : {}) })
}

/** append 一条工具调用事件（保真原始入参）。 */
export function appendToolCallEvent(runId: string, call: ToolCallMessage, origin?: AppendLogEventOrigin): void {
  pushEvent(runId, { type: 'toolCall', call, ...(origin ? { origin } : {}) })
}

/** append 一条工具结果事件（保真 content+details；lifecycle 标各字段去留，R3-3 压缩器读）。 */
export function appendToolResultEvent(runId: string, result: ToolResultMessage, lifecycle?: ToolFieldLifecycleMap, origin?: AppendLogEventOrigin): void {
  const partial: Omit<AppendLogToolResultEvent, 'seq' | 'runId' | 'sessionId' | 'at'> = { type: 'toolResult', result }
  if (lifecycle) partial.lifecycle = lifecycle
  if (origin) partial.origin = origin
  pushEvent(runId, partial)
}

/** append 一条报错事件（真 loop 工具报错/子步失败作为一类事件进 state，R3-5 自诊断读它）。 */
export function appendErrorEvent(
  runId: string,
  error: ToolResultError,
  meta: { stage?: string; toolName?: string; turnIndex?: number } = {},
  origin?: AppendLogEventOrigin
): void {
  const partial: Omit<AppendLogErrorEvent, 'seq' | 'runId' | 'sessionId' | 'at'> = { type: 'error', error }
  if (meta.stage) partial.stage = meta.stage
  if (meta.toolName) partial.toolName = meta.toolName
  if (typeof meta.turnIndex === 'number') partial.turnIndex = meta.turnIndex
  if (origin) partial.origin = origin
  pushEvent(runId, partial)
}

/** append 一条人话决策事件（复用现役 TidiaoDecisionEntry；directorStream 视图由它折叠）。 */
export function appendDecisionEvent(runId: string, decision: TidiaoDecisionEntry): void {
  const partial: Omit<AppendLogDecisionEvent, 'seq' | 'runId' | 'sessionId' | 'at'> = { type: 'decision', decision }
  pushEvent(runId, partial)
}

// ─────────────────────────────────────────────────────────────────────────────
// option C（2026-07-01·发送时留存真实 prompt）：真实 prompt 文本存取（挂现役活动容器·同生命周期）
// ─────────────────────────────────────────────────────────────────────────────

/** 把提调这一轮拼好的 system+user 消息渲成一段可读文本，供查看器「喂模型原文」忠实显示（两个 loop 共用·口径统一）。 */
export function renderDirectorPromptText(messages: ReadonlyArray<{ role: string; content: string }>): string {
  return (Array.isArray(messages) ? messages : [])
    .map((m) => ({ role: m.role, content: String(m.content ?? '').trim() }))
    .filter((m) => m.content) // 空正文的消息整条丢弃（连角色标签也不留）。
    .map((m) => `【${m.role}】\n${m.content}`)
    .join('\n\n')
}

/** 把当前活动 log 的真实 prompt 文本存进容器（runId 不匹配则不写·防迟到串轮）；loop 启动拼好 messages 后调用。
 *  无活动 log（未 beginAppendLog·如单测）时自动空操作，零副作用。 */
export function setActiveDirectorPrompt(runId: string, promptText: string): void {
  const current = activeAgentAppendLog.value
  if (!current) return
  const key = String(runId || '').trim()
  if (key && current.runId && key !== current.runId) return
  activeAgentAppendLog.value = { ...current, directorPrompt: String(promptText || '') }
}

/** 取当前活动 log 的真实 prompt 文本（runId 不匹配返回空）；活动轮查看器 / 落库快照捕获用。 */
export function getActiveDirectorPrompt(runId = ''): string {
  const current = activeAgentAppendLog.value
  if (!current) return ''
  const key = String(runId || '').trim()
  if (key && current.runId && key !== current.runId) return ''
  return String(current.directorPrompt || '')
}

/** 取当前 log 全部事件（runId 不匹配返回空）。供 R3-3 投影 / R3-5 报错读取。 */
export function getAppendLogEvents(runId = ''): AppendLogEvent[] {
  const current = activeAgentAppendLog.value
  if (!current) return []
  const key = String(runId || '').trim()
  if (key && current.runId && key !== current.runId) return []
  return current.events
}

/** 取当前 log 全部「报错事件」（R3-5 报错呈现 / 自诊断用）。 */
export function getAppendLogErrors(runId = ''): AppendLogErrorEvent[] {
  return getAppendLogEvents(runId).filter((e): e is AppendLogErrorEvent => e.type === 'error')
}

/** 把一条事件渲染成人话行（人可读/喂模型/检索回显共用；借鉴 md 范式的「人可读」精神）。 */
export function renderAppendLogEvent(event: AppendLogEvent): string {
  switch (event.type) {
    case 'message':
      return `#${event.seq} 〔${event.role}〕${String(event.content || '').trim()}`
    case 'toolCall':
      return `#${event.seq} 〔工具调用 ${event.call.toolName}〕${JSON.stringify(event.call.args ?? {})}`
    case 'toolResult': {
      const tag = event.result.status === 'error' ? '工具报错' : '工具结果'
      return `#${event.seq} 〔${tag} ${event.result.toolName}〕${String(event.result.content || '').trim()}`
    }
    case 'error': {
      const where = [event.stage, event.toolName, typeof event.turnIndex === 'number' ? `第${event.turnIndex}轮` : '']
        .filter(Boolean).join('·')
      return `#${event.seq} 〔报错${where ? ` ${where}` : ''}〕${event.error.type}：${event.error.message}`
    }
    case 'decision':
      return `#${event.seq} 〔决策〕${String(event.decision.text || '').trim()}`
    default:
      return `#${(event as AppendLogEvent).seq}`
  }
}

/**
 * 检索兜底（R3-4 调用）：在当前 log 里按关键词搜回事件——压出投影视图的内容仍可被搜回。
 * - query 为空（或数组全空）：返回全部（受 limit 限）。
 * - query 传数组=多关键词 OR（任一子串命中即算）。
 * - 按事件人话渲染行做大小写不敏感子串匹配；types 限定事件类型。
 * - 默认取最近 limit 条（命中里靠后=更近，更可能相关）。
 */
export function searchAppendLog(
  query: string | string[],
  options: { runId?: string; types?: AppendLogEventType[]; limit?: number } = {}
): AppendLogEvent[] {
  const events = getAppendLogEvents(options.runId || '')
  const typeSet = options.types && options.types.length ? new Set(options.types) : null
  // 多关键词（2026-07-08）：传数组时任一关键词子串命中即算（OR）；空数组/空串=不过滤取最近。
  const keywords = (Array.isArray(query) ? query : [query])
    .map((q) => String(q || '').trim().toLowerCase())
    .filter(Boolean)
  const limit = Number(options.limit) > 0 ? Number(options.limit) : 20
  const matched = events.filter((event) => {
    if (typeSet && !typeSet.has(event.type)) return false
    if (!keywords.length) return true
    const line = renderAppendLogEvent(event).toLowerCase()
    return keywords.some((keyword) => line.includes(keyword))
  })
  // 取最近 limit 条（靠后更近）。
  return matched.slice(-limit)
}

/**
 * R3-2b 持久化·落库快照：取当前 log 全部事件的纯对象深拷贝（剥离 Vue 响应式代理），供随 directorStream
 * 一起落进现役 processSummary（不新建表/迁移，守数据红线）。runId 不匹配/无 log/空事件返回空数组。
 */
export function captureAppendLogSnapshot(runId = ''): AppendLogEvent[] {
  const events = getAppendLogEvents(runId)
  if (!events.length) return []
  return JSON.parse(JSON.stringify(events)) as AppendLogEvent[]
}

/**
 * R3-2b 持久化·刷新/续跑复原：把已落库的历史事件 seed 进当前活动 log，作为续跑这一轮的保真基线
 *（与 directorStream 的 carryOver 同源思路——旧事件保留、新一轮事件 append 其后，跨多次 loop 拼成一条带）。
 * - 必须在 beginAppendLog 起好新 runId 的空 log 之后调用：seeded 历史事件按原顺序重排 seq（1..N）、归到当前
 *   runId/sessionId（原 runId/seq 已随轮失效，seq 只是 append 顺序键，重排不丢语义），保留各分支 payload 与原 at。
 * - events 为空时不动当前 log（保留 beginAppendLog 的空起点）。
 */
export function restoreAppendLog(input: {
  runId: string
  sessionId: string
  events: AppendLogEvent[]
  /** H1（2026-07-04·修「纠偏轮覆盖丢 prompt」）：上一轮已落库的真实 prompt——续跑容器带回它，
   *  纠偏/精修/重试等**不重建 prompt 的 loop** 增量持久化时不再把同锚 processSummary 覆盖成「无 prompt 版」
   *  （旧行为=重建容器丢 directorPrompt 字段 → 刷新后查看器退化旧压缩台账）。缺省/空=不带（与旧行为一致）。 */
  directorPrompt?: string
}): void {
  const runId = String(input.runId || '').trim()
  const sessionId = String(input.sessionId || '').trim()
  const source = Array.isArray(input.events) ? input.events : []
  if (!source.length) return
  let seq = 1
  const events = source.map((event) => ({ ...event, seq: seq++, runId, sessionId })) as AppendLogEvent[]
  const directorPrompt = String(input.directorPrompt || '')
  activeAgentAppendLog.value = { runId, sessionId, events, nextSeq: seq, ...(directorPrompt ? { directorPrompt } : {}) }
}

/** 清当前 log（新带起点；传 runId 且不匹配时不清，防误清新轮）。 */
export function clearAppendLog(runId = ''): void {
  const current = activeAgentAppendLog.value
  if (!current) return
  const key = String(runId || '').trim()
  if (key && current.runId && key !== current.runId) return
  activeAgentAppendLog.value = null
}
