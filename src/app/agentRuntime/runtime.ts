import type {
  AgentRuntimeHistoryMessage,
  AgentModelMessage,
  AgentRuntimeBudgetTrace,
  AgentPromptSupplyTraceEntry,
  AgentTranscript,
  AgentTranscriptTurn,
  AgentToolSupplyDiagnostic,
  NextTurnPatch,
  ToolCallMessage,
  ToolResultMessage
} from './types'
import {
  HookRegistry,
  type HookDefinition,
  type HookRuntimeEvent,
  type HookRunOutput
} from './hookRegistry'
import {
  ToolRegistry,
  adaptToolExecutionResult,
  clampToolResultContent,
  coerceArgsBySchema,
  isDevEnv,
  makeToolErrorResult,
  matchToolsByQuery,
  resolveResultClampChars,
  type ToolDefinition,
  type ToolExecutionContext
} from './toolRegistry'
import { runWithConcurrencyPool } from '../../utils/concurrencyPool'
// 人在环上统一契约（2026-07-12 架构审查批C）：halt 模式信封类型，仅 import 类型（不编辑该文件，见头注释三种投递模式）。
import type { InteractionRequest } from './interactionContract'
import {
  createEmptyTurnContinuationGate,
  DEFAULT_PROCESS_MESSAGE_CONTINUATION_NUDGE,
  isAgentTurnUnfinished
} from './continuationGate'
import {
  AGENT_TASK_TODO_TOOL_NAMES,
  buildAgentTaskTodoTools,
  createAgentTaskTodoController,
  isAgentTaskTodoTool,
  renderAgentTaskTodoLayer,
  WRITE_AGENT_TASK_TODO_TOOL_NAME,
  type AgentTaskTodoSnapshot
} from './taskTodo'
import {
  buildWaitForSubagentReportTool,
  isAgentSubagentWaitTool,
  WAIT_FOR_SUBAGENT_REPORT_TOOL_NAME,
  type AgentSubagentWaitCapability,
  type AgentSubagentWaitRequest
} from './subagentWait'
import {
  AGENT_SUBAGENT_CONTROL_TOOL_NAMES,
  buildSubagentControlTools,
  isAgentSubagentControlTool,
  type AgentSubagentControlCapability
} from './subagentControl'

export interface AgentRuntimeMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  // 原生工具协议（function-calling）：assistant 轮可携带 tool_calls；role:'tool' 结果回灌携带 tool_call_id。
  // 仅在「本轮来自原生 tool_calls」时由 runtime 填充（原生感知条件回灌），其余消息只用 {role, content}。
  tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>
  tool_call_id?: string
}

export interface AgentRuntimeChatHistoryMessage {
  kind: 'chat'
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
}

export interface ParsedAgentModelOutput {
  stage?: string
  done?: boolean
  content?: string
  parsed?: Record<string, unknown>
  toolCalls: Array<Partial<ToolCallMessage> & {
    tool?: string
    name?: string
    call_id?: string
    args?: Record<string, unknown>
    expectation?: string
    // 原生工具调用形态（OpenAI tool_calls 项）：工具名在 function.name、参数为 function.arguments(JSON 字符串)。
    id?: string
    type?: string
    function?: { name?: string; arguments?: unknown }
  }>
}

export interface AgentRuntimeBudget {
  /** 不传或传 null 时不设固定模型回合上限。 */
  maxTurns?: number | null
  /** 不传或传 null 时不设固定业务工具调用上限。 */
  maxToolCalls?: number | null
}

/** 同轮多 toolCall 并发执行配置（仅 personality_model 计划生成等互不依赖批用）。
 *  仅当本轮所有 toolCall 都命中 `tools` 白名单且数量>1 时才走并发路径，否则保持原串行。
 *  并发执行仍受运行时预算与取消信号约束。 */
export interface AgentRuntimeConcurrency {
  /** 并发上限（滑动窗口），<=0 视为 1。受浏览器同域连接数限制，建议 5~6。 */
  limit: number
  /** 允许整批并发的工具白名单。 */
  tools: string[]
  /** 单项失败的重试次数（指数退避），仅对 retryable 的工具结果生效。 */
  retries?: number
  /** 首次重试基准延迟（ms）。 */
  retryDelayMs?: number
  /** 退避上限（ms）。 */
  retryMaxDelayMs?: number
}

/** 运行时进度事件：用于把工具阶段推进上报给外层 UI（过程轨）。
 *  纯可选回调，不影响 transcript/hook 主链路。 */
export interface AgentRuntimeProgressEvent {
  /** notice：非工具/非模型轮的运行时通告（如被 hook 中止、超预算收尾），供决策流如实标一条。 */
  kind: 'tool-start' | 'tool-result' | 'thought' | 'notice'
  stage: string
  toolName: string
  status?: 'success' | 'error' | 'blocked'
  errorType?: string
  /** 该工具结果是否触发了 hook 重试（用于 UI 区分「失败」与「重试中」） */
  retried?: boolean
  /** kind==='thought' 时携带本轮模型的一句话级实时旁述（parsed.parsed.thought）。 */
  thought?: string
  /** 工具入参预览（tool-start 时携带）：通用挑常见键名截断，供过程轨工具条显示「读/查/搜了什么」。 */
  detail?: string
  /** 工具结果摘要（tool-result success 时携带）：result.content 压缩截断，供工具条显示「命中/读到什么」。 */
  resultPreview?: string
  /** 工具失败的人类可读错误信息（tool-result error/blocked 时携带），供工具条显示错误条。 */
  errorMessage?: string
  turnIndex: number
}

/** 运行时保真事件（统一 state 协议 R3-2 · append log 源）：loop 内 assistant 消息/工具调用/工具结果
 *  一产生即上抛**原始对象**（不截断、不折叠），供外层 append 进保真 log（永不真删、可检索）。
 *  与 {@link AgentRuntimeProgressEvent}（UI 过程轨摘要）分离：onProgress 给视图、onEvent 给保真源。
 *  运行时只上抛 runtime 原生类型（ToolCallMessage/ToolResultMessage），不认 append log 形态（边界单向）。 */
export type AgentRuntimeFidelityEvent =
  | { kind: 'assistant-message'; content: string; turnIndex: number }
  | { kind: 'tool-call'; toolCall: ToolCallMessage; turnIndex: number }
  | { kind: 'tool-result'; toolResult: ToolResultMessage; turnIndex: number }

/** 工具入参 → 展示文本（通用，不绑定具体工具）：挑常见键名，回退首个非空字符串值。
 *  不再硬截断——带全文给提调决策流，由前端折叠+点击展开看全文（用户 2026-06-20）。 */
function previewToolArgs(args: Record<string, unknown> | undefined): string {
  if (!args) return ''
  const preferred = ['code', 'query', 'name', 'unitId', 'unit_id', 'strategyLabel', 'strategy_label', 'planPrompt', 'plan_prompt', 'targetLocation', 'target_location', 'targetTime', 'target_time']
  for (const key of preferred) {
    const value = args[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  for (const value of Object.values(args)) {
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

/** 工具结果正文 → 展示文本（折叠空白，不截断）：带全文给前端，由前端折叠+点击展开。 */
function previewToolResult(content: unknown): string {
  return String(content ?? '').replace(/\s+/g, ' ').trim()
}

export interface RunAgentRuntimeInput {
  agentName: string
  runtimeVersion?: string
  messages: AgentRuntimeMessage[]
  toolRegistry: ToolRegistry
  hookRegistry?: HookRegistry
  initialActiveTools: string[]
  /** 正式交互 Agent 默认不传；显式设置只供确有成本/时限边界的 mini agent 与专项流程。 */
  budget?: AgentRuntimeBudget
  /** 可选：同轮多 toolCall 并发执行配置。不传则全程串行（默认行为不变）。 */
  concurrency?: AgentRuntimeConcurrency
  signal?: AbortSignal
  callModel: (request: {
    messages: AgentRuntimeMessage[]
    history: AgentRuntimeHistoryMessage[]
    activeTools: string[]
    toolBriefs: Array<{ name: string; brief: string; schema?: Record<string, unknown> }>
    /** R1-B B5（统一 toolsearch）：延迟模式下「全局单可搜目录」（name+brief·不带 schema·推荐单标 recommended），
     *  供提调侧 callModel 渲染进 prompt 让模型知道有哪些工具可 toolsearch 调出来。非延迟模式不传。 */
    toolCatalog?: Array<{ name: string; brief: string; recommended: boolean }>
    turnIndex: number
    /** 当前工具信封时代。0=首轮 common；1=首次检索后冻结的完整授权集。 */
    toolEpoch: number
    /** 当前工具时代内的模型调用序号；0 是该时代冷调用，>=1 才属于同信封热调用。 */
    toolEpochTurnIndex: number
  }) => Promise<unknown> | unknown
  parseModelOutput?: (rawOutput: unknown, turnIndex: number) => ParsedAgentModelOutput
  /** 可选进度回调：工具开始执行、工具结果产生时上报，供外层渲染过程轨。 */
  onProgress?: (event: AgentRuntimeProgressEvent) => void
  /** 可选保真事件回调（R3-2 append log 源）：loop 内 assistant 消息/工具调用/工具结果一产生即上抛原始对象，
   *  供外层 append 进保真 log。与 onProgress（UI 摘要）分离，不做截断/折叠；不传则零开销（默认行为不变）。 */
  onEvent?: (event: AgentRuntimeFidelityEvent) => void
  /** 可选用户可见过程话：只有当该模型轮确定还会继续调工具或被 hook 续轮时触发，最终答复不走这里。 */
  onIntermediateMessage?: (message: { content: string; turnIndex: number }) => void | Promise<void>
  /** 当前任务 TODO 的运行态快照。新任务先回调 empty；创建、修改、删除、完成时同步回调，供共享卡片实时展示。 */
  onTaskTodoChange?: (snapshot: AgentTaskTodoSnapshot) => void
  /** 同一 Agent 对话上一轮留下的 TODO；显式新对话不传。 */
  initialTaskTodo?: AgentTaskTodoSnapshot | null
  /** 仅供 runtime 底层机制隔离测试关闭任务协议；任何正式 Agent harness 都不得传 disabled。缺省 required。 */
  taskTodoMode?: 'required' | 'disabled'
  /** 后台子 Agent 候报能力。只有宿主能验证任务仍在运行且有终态回报通道时才注入；
   *  缺省不提供 waitForSubagentReport，避免 Agent 静默等一个不会回来的任务。 */
  subagentWait?: AgentSubagentWaitCapability
  /** 当前父会话自己的子 Agent 控制面。只允许列出、追加指令和中断同会话子任务；
   *  重派仍走原业务派遣工具，以保留业务参数校验、确认和正式回报通道。 */
  subagentControl?: AgentSubagentControlCapability
  /** 软停回调（导演模式）：每轮起点检查，返回 true 即在「当前步跑完后」的步骤边界干净收束
   *  （terminalReason='paused-for-correction'），不硬 abort 在跑的步骤。供「停止→纠偏」用。
   *  不传则永不软停（默认行为不变）。 */
  shouldPause?: () => boolean
  /** 运行硬超时（ms，导演模式 20 分钟）：自 loop 起点计时，超时在步骤边界收束
   *  （terminalReason='timeout'）。不传或 <=0 则无超时（默认不变）。 */
  timeoutMs?: number
  /** R1-B B5（统一 toolsearch · 延迟 schema + 越权检索）：true 时启用「推荐单 + 全局单可搜」模式——
   *  ①默认只把已激活集（initialActiveTools + toolsearch）带 schema 下发，其余工具走 toolCatalog（name+brief）；
   *  ②runtime 自动挂 `toolsearch` 元工具 + 内置激活 hook（搜中工具经 activeTools 激活，下一轮带 schema 可调）；
   *  ③activeTools 驱动可见/可调（未激活工具须先 toolsearch 才有 schema 可调）；
   *  ④item6 共存：演员阶段机每步整体重写 activeTools 时，runtime 自动并回 toolsearch + 越权激活的「黏性集」，不被抹掉。
   *  不传则维持现役（全量 schema 下发·按 activeTools 门控），零回归。 */
  deferredToolMode?: boolean
  /** 提调缓存模式：首次 toolsearch 命中后，一次性激活本轮 registry 内全部授权工具并冻结到 harness 结束。
   *  不传时仍按命中工具逐个激活，供带阶段门控的其他 Agent 保持原语义。 */
  deferredToolEpochMode?: 'incremental' | 'full-authorized-after-first-search'
  /** 同一对话此前经 toolsearch 激活的业务工具名。runtime 会与本轮真实 registry 取交集，不扩大权限。 */
  initialDeferredActiveTools?: readonly string[]
  /** 已激活业务工具集合发生变化时回调，供对话级续接保存。 */
  onDeferredActiveToolsChange?: (toolNames: string[]) => void
  /** R1-B B5：推荐工具单（常用工具名子集）。延迟模式下在 toolCatalog 里标 recommended=true；
   *  是否首轮已带 schema 仍由 initialActiveTools 决定，未激活工具需 toolsearch 后才可调。仅延迟模式有意义。 */
  recommendedTools?: string[]
  /** 当轮 Skill 供给审计；只复制进 transcript，绝不进入模型 messages/history。 */
  promptSupplyTrace?: readonly AgentPromptSupplyTraceEntry[]
  /** manifest 与真实 registry 的供给诊断；只复制进 transcript，不改变工具权限。 */
  toolSupplyDiagnostics?: readonly AgentToolSupplyDiagnostic[]
}

export interface RunAgentRuntimeResult {
  transcript: AgentTranscript
  messages: AgentRuntimeMessage[]
  /** halt 原语（2026-07-12 架构审查批C）：transcript.terminalReason==='awaiting-user' 时携带的统一
   *  「人在环上」请求信封——消费方（如提调纠偏）据此构造自己的终态形状，答复喂进新 loop 续接。其余终态不出现。 */
  pendingInteraction?: InteractionRequest
  /** awaiting-subagent 终态的候报信封；其它终态不出现。 */
  pendingSubagentWait?: AgentSubagentWaitRequest
  /** 本轮最终任务清单；简单任务可能保持 empty，异常/等待用户时可带未完成项。 */
  taskTodo: AgentTaskTodoSnapshot
  /** 本轮最终经 toolsearch 激活的业务工具名；不含 runtime 保留工具。 */
  deferredActiveTools: string[]
}

export async function runAgentRuntime(input: RunAgentRuntimeInput): Promise<RunAgentRuntimeResult> {
  const messages = input.messages.map((message) => ({ ...message }))
  const history: AgentRuntimeHistoryMessage[] = messages.map((message) => ({
    kind: 'chat',
    role: message.role,
    content: message.content
  }))
  const turns: AgentTranscriptTurn[] = []
  const maxTurns = normalizeRuntimeBudgetLimit(input.budget?.maxTurns)
  const maxToolCalls = normalizeRuntimeBudgetLimit(input.budget?.maxToolCalls)
  const budgetTrace: AgentRuntimeBudgetTrace = {
    maxTurns,
    maxToolCalls,
    usedTurns: 0,
    usedToolCalls: 0
  }
  // 任务级 TODO 是 runtime 自管理控制面，不读写业务真值、也不要求每个 Agent manifest 重复授权。
  // 与 toolsearch 一样由 runtime 保留并首轮激活；业务 registry 若占用保留名直接失败，防止工具被静默遮蔽。
  const taskTodoEnabled = input.taskTodoMode !== 'disabled'
  if (taskTodoEnabled) {
    for (const reservedName of AGENT_TASK_TODO_TOOL_NAMES) {
      if (input.toolRegistry.has(reservedName)) {
        throw new Error(`Agent runtime 保留工具名冲突：${reservedName}`)
      }
    }
  }
  if (input.subagentWait && input.toolRegistry.has(WAIT_FOR_SUBAGENT_REPORT_TOOL_NAME)) {
    throw new Error(`Agent runtime 保留工具名冲突：${WAIT_FOR_SUBAGENT_REPORT_TOOL_NAME}`)
  }
  if (input.subagentControl) {
    for (const reservedName of AGENT_SUBAGENT_CONTROL_TOOL_NAMES) {
      if (input.toolRegistry.has(reservedName)) {
        throw new Error(`Agent runtime 保留工具名冲突：${reservedName}`)
      }
    }
  }
  const taskTodo = createAgentTaskTodoController({
    initialSnapshot: taskTodoEnabled ? input.initialTaskTodo : null,
    ...(taskTodoEnabled
      ? (input.onTaskTodoChange ? { onChange: input.onTaskTodoChange } : {})
      : { now: () => 0, taskId: 'agent-task-todo-disabled' })
  })
  const registryWithTaskTodo = taskTodoEnabled
    ? new ToolRegistry([...input.toolRegistry.list(), ...buildAgentTaskTodoTools(taskTodo)])
    : input.toolRegistry
  const registryWithSubagentWait = input.subagentWait
    ? new ToolRegistry([...registryWithTaskTodo.list(), buildWaitForSubagentReportTool(input.subagentWait)])
    : registryWithTaskTodo
  const registryWithRuntimeControls = input.subagentControl
    ? new ToolRegistry([...registryWithSubagentWait.list(), ...buildSubagentControlTools(input.subagentControl)])
    : registryWithSubagentWait
  // R1-B B5（统一 toolsearch）：延迟模式装配——工作 registry 叠加 toolsearch 元工具 + 内置激活 hook，
  // 初始已激活集补上 toolsearch（恒可见可调）。现役 loop 不开延迟 = 用 input.toolRegistry / 原 hook，零变化。
  const deferredMode = input.deferredToolMode === true
  const freezeFullAuthorizedTools = deferredMode
    && input.deferredToolEpochMode === 'full-authorized-after-first-search'
  const fullAuthorizedToolNames = freezeFullAuthorizedTools
    ? input.toolRegistry.list().map((definition) => definition.name)
    : []
  const restoredDeferredTools = deferredMode
    ? Array.from(new Set(
        (input.initialDeferredActiveTools ?? [])
          .map((name) => String(name || '').trim())
          .filter((name) => name && !isRuntimeMetaTool(name) && input.toolRegistry.has(name))
      ))
    : []
  const initialRestoredDeferredTools = freezeFullAuthorizedTools && restoredDeferredTools.length
    ? fullAuthorizedToolNames
    : restoredDeferredTools
  const effectiveRegistry = deferredMode
    ? new ToolRegistry([...registryWithRuntimeControls.list(), buildToolsearchTool(input, freezeFullAuthorizedTools)])
    : registryWithRuntimeControls
  let activeTools = deferredMode
    ? Array.from(new Set([
        ...input.initialActiveTools,
        ...(taskTodoEnabled ? AGENT_TASK_TODO_TOOL_NAMES : []),
        ...(input.subagentWait ? [WAIT_FOR_SUBAGENT_REPORT_TOOL_NAME] : []),
        ...(input.subagentControl ? AGENT_SUBAGENT_CONTROL_TOOL_NAMES : []),
        TOOLSEARCH_TOOL_NAME,
        ...initialRestoredDeferredTools
      ]))
    : Array.from(new Set([
        ...input.initialActiveTools,
        ...(taskTodoEnabled ? AGENT_TASK_TODO_TOOL_NAMES : []),
        ...(input.subagentWait ? [WAIT_FOR_SUBAGENT_REPORT_TOOL_NAME] : []),
        ...(input.subagentControl ? AGENT_SUBAGENT_CONTROL_TOOL_NAMES : [])
      ]))
  // item6（演员阶段机 × deferred 共存）：延迟模式下维护「黏性已激活集」——toolsearch 元工具 + 越权 toolsearch 搜中的工具。
  // 演员阶段机每步整体重写 activeTools（流水线收窄），但 toolsearch 与越权工具不能被这一重写抹掉，否则下一轮搜不到也调不动。
  // 故①每次 hook 重写 activeTools 时都并上本集合（applyActiveTools）；②toolsearch 命中时把激活工具收进来（captureDeferredActivation）。
  // 非延迟模式恒为空操作（applyActiveTools=直接赋值 / captureDeferredActivation=no-op），行为零回归。
  const deferredActivated = new Set<string>(
    deferredMode ? [TOOLSEARCH_TOOL_NAME, ...initialRestoredDeferredTools] : []
  )
  let toolEpoch = freezeFullAuthorizedTools && initialRestoredDeferredTools.length ? 1 : 0
  let toolEpochTurnIndex = 0
  const emitDeferredActiveTools = (): void => {
    if (!deferredMode) return
    input.onDeferredActiveToolsChange?.(
      Array.from(deferredActivated).filter((name) => !isRuntimeMetaTool(name))
    )
  }
  emitDeferredActiveTools()
  const applyActiveTools = (next: string[] | undefined): void => {
    if (!next) return
    activeTools = deferredMode
      ? Array.from(new Set([
          ...next,
          ...(taskTodoEnabled ? AGENT_TASK_TODO_TOOL_NAMES : []),
          ...(input.subagentWait ? [WAIT_FOR_SUBAGENT_REPORT_TOOL_NAME] : []),
          ...(input.subagentControl ? AGENT_SUBAGENT_CONTROL_TOOL_NAMES : []),
          ...deferredActivated
        ]))
      : Array.from(new Set([
          ...next,
          ...(taskTodoEnabled ? AGENT_TASK_TODO_TOOL_NAMES : []),
          ...(input.subagentWait ? [WAIT_FOR_SUBAGENT_REPORT_TOOL_NAME] : []),
          ...(input.subagentControl ? AGENT_SUBAGENT_CONTROL_TOOL_NAMES : [])
        ]))
  }
  const captureDeferredActivation = (result: ToolResultMessage): void => {
    if (!deferredMode) return
    const raw = result.details?.activatedTools
    if (!Array.isArray(raw)) return
    const hasSuccessfulActivation = raw.some((name) => String(name || '').trim())
    let changed = false
    for (const name of raw) {
      const trimmed = String(name || '').trim()
      if (
        trimmed
        && !isRuntimeMetaTool(trimmed)
        && input.toolRegistry.has(trimmed)
        && !deferredActivated.has(trimmed)
      ) {
        deferredActivated.add(trimmed)
        changed = true
      }
    }
    if (changed) emitDeferredActiveTools()
    // 授权集原本就已全量可见时，首次成功搜索虽然不改变 tools，也仍进入 epoch 1：
    // 后续 system 会收缩为冻结短规则，且模型不再重复搜索。
    if (freezeFullAuthorizedTools && toolEpoch === 0 && hasSuccessfulActivation) {
      toolEpoch = 1
      toolEpochTurnIndex = 0
    }
  }
  // 同错熔断（2026-07-06 真机修）：弱模型（deepseek 档）失败后倾向**原样重发**同一调用——真机复现
  // confirmNarrationCall 同一缺参报错连撞 10+ 次烧掉大半预算。同一工具连续吐同签名错误（type+message）第 2 次起，
  // 把该工具的参数 schema 追进回执并点破「别原样重发」；成功或换错误即复位。只加 content 提示，
  // error 结构（status/type/message）原样——外层重试/审计语义零变化。
  const repeatedToolErrors = new Map<string, { signature: string; count: number }>()
  const noteRepeatedToolError = (result: ToolResultMessage): ToolResultMessage => {
    if (result.status === 'success') {
      repeatedToolErrors.delete(result.toolName)
      return result
    }
    const signature = `${result.error?.type || ''}\u0000${result.error?.message || ''}`
    const prev = repeatedToolErrors.get(result.toolName)
    const count = prev && prev.signature === signature ? prev.count + 1 : 1
    repeatedToolErrors.set(result.toolName, { signature, count })
    if (count < 2) return result
    const schema = effectiveRegistry.get(result.toolName)?.schema
    const hint = `\n【熔断提醒·「${result.toolName}」已连续 ${count} 次报同样的错】不要再原样重发同一个调用：对照参数格式逐个核对必填字段、把缺的/错的补上再调，或者换一种做法。${schema ? `参数格式：${JSON.stringify(schema)}` : ''}`
    return { ...result, content: `${String(result.content ?? '')}${hint}` }
  }
  // 重复读提醒（2026-07-06 真机八验「疯狂读原文」·同错熔断的姊妹）：弱模型反复用**同一参数**调同一读取工具
  // 去“确认”（真机复现 readChatMessage 同一条消息连读 10+ 次，层4 明明已有全文、改动回执也带改后真值）。
  // 同一工具+同签名参数的成功调用，若结果与上一次**完全相同**，回执追加提醒；结果有变化（如精修后再读）不提醒
  // ——精准区分「改后确认读」（合法）与「无意义重复读」。只加 content 提示，结果结构原样。
  const lastIdenticalResults = new Map<string, string>()
  const noteRepeatedIdenticalResult = (toolCall: ToolCallMessage, result: ToolResultMessage): ToolResultMessage => {
    if (result.status !== 'success') return result
    let argsSignature = ''
    try {
      argsSignature = JSON.stringify(toolCall.args ?? {})
    } catch {
      return result
    }
    const key = `${result.toolName}|${argsSignature}`
    const contentText = String(result.content ?? '')
    const prev = lastIdenticalResults.get(key)
    lastIdenticalResults.set(key, contentText)
    if (prev === undefined || prev !== contentText) return result
    const hint = '\n【重复调用提醒】这次调用与你上一次同参数的调用结果**完全相同**（内容没有任何变化）。不要再重复调用同一个工具去“确认”——已读到的内容不会凭空变化，改动类工具的回执本身就是改后真值。直接继续下一个还没做的动作。'
    return { ...result, content: `${contentText}${hint}` }
  }
  let terminalReason: AgentTranscript['terminalReason'] = 'done'
  // 未完成 TODO 只提醒一次。第一次尝试收尾时给模型一次继续执行/如实判断的机会；
  // 如果之后仍明确停下，允许保留未完成项结束，避免真实阻断演变成无限空转。
  let taskTodoExitReminderIssued = false
  // halt 原语（2026-07-12 架构审查批C）：terminalReason==='awaiting-user' 时的请求信封（取首个·同轮/同批多次
  // 只认第一个，与旧「本轮已提问一次」节流同效果——见下方两处收束点）。
  let pendingInteraction: InteractionRequest | undefined
  let pendingSubagentWait: AgentSubagentWaitRequest | undefined
  // 复杂任务第一步保护：一次就发起多个业务动作，或已执行过一个动作后又要继续第二个动作，却仍没有清单，
  // 先挡回并要求建表。单步读取/单次写入仍可不建 TODO；模型语义判断是第一层，这里只兜结构上已明确复杂的情况。
  let businessToolCallsExecuted = 0
  let taskTodoRequiredBeforeBusinessThisTurn = false
  const taskTodoGuardHook: HookDefinition = {
    id: 'agent-task-todo-first-action-guard',
    lifecycle: 'beforeToolCall',
    priority: 1,
    run: (event) => {
      const toolName = String(event.toolCall?.toolName || '')
      if (!taskTodoRequiredBeforeBusinessThisTurn || taskTodo.hasOpenItems() || isRuntimeMetaTool(toolName)) return
      return {
        summary: '复杂任务尚未建立 TODO，业务动作已被挡回',
        blockToolCall: {
          message: `这个任务已经包含多个业务动作。请先把完整任务批量写入 ${WRITE_AGENT_TASK_TODO_TOOL_NAME}，再尽量在同一轮合并执行独立步骤。`,
          errorType: 'EXPECTATION_MISMATCH',
          retryable: true,
          details: { reason: 'complex-task-requires-todo-first' }
        },
        injectMessages: [{
          role: 'user',
          purpose: 'stage-instruction',
          content: `这是复杂任务，第一动作必须先调用 ${WRITE_AGENT_TASK_TODO_TOOL_NAME} 批量列出任务和验收标准；不要先做一个业务动作再补清单。`
        }],
        requestRetry: {
          toolName,
          errorType: 'EXPECTATION_MISMATCH',
          reason: '复杂任务必须先建立任务 TODO。'
        }
      }
    }
  }
  const taskTodoCountBusinessHook: HookDefinition = {
    id: 'agent-task-todo-business-action-counter',
    lifecycle: 'afterToolResult',
    priority: 99,
    run: (event) => {
      // 单个动作首次失败后的同动作重试仍属于简单任务；只有已有业务动作成功落定后又继续第二步，
      // 才能从结构上确定任务已经变成多步。
      if (
        event.toolResult?.status === 'success'
        && !isRuntimeMetaTool(String(event.toolResult.toolName || ''))
      ) {
        businessToolCallsExecuted += 1
      }
    }
  }
  // R3-2 保真事件上抛（append log 源）：不传 onEvent 时为空操作，默认行为零变化。
  const emitEvent = (event: AgentRuntimeFidelityEvent): void => { input.onEvent?.(event) }
  const hookRegistry = new HookRegistry([
    ...(taskTodoEnabled ? [taskTodoGuardHook] : []),
    ...(input.hookRegistry?.list() ?? []),
    ...(deferredMode ? [buildToolsearchActivateHook()] : []),
    ...(taskTodoEnabled ? [taskTodoCountBusinessHook] : [])
  ])
  // 全 Agent 过程话续步兜底：业务 Agent 仍可保留更严格的“未交稿/未 finish”门；只有业务 hook 没有
  // 已经要求续轮时，本门才依据明确的自述下一步承诺补一次 continuation，避免双重 nudge。
  const processMessageContinuationRegistry = new HookRegistry([
    createEmptyTurnContinuationGate({
      id: 'agent-process-message-continuation',
      maxNudges: 3,
      isFinished: (event) => !isAgentTurnUnfinished(String(event.modelMessage?.content ?? '')),
      buildNudge: () => DEFAULT_PROCESS_MESSAGE_CONTINUATION_NUDGE
    })
  ])
  // 导演硬超时：自 loop 起点计时（运行时本地时钟，非 workflow 脚本，Date.now 可用）。
  const deadlineAt = typeof input.timeoutMs === 'number' && input.timeoutMs > 0 ? Date.now() + input.timeoutMs : null

  for (let turnIndex = 0; maxTurns == null || turnIndex < maxTurns; turnIndex += 1) {
    if (input.signal?.aborted) {
      terminalReason = 'aborted'
      break
    }
    // 硬超时优先于软停：到点直接判超时收尾（步骤边界，不打断在跑的当前步）。
    if (deadlineAt != null && Date.now() >= deadlineAt) {
      terminalReason = 'timeout'
      break
    }
    // 软停：当前步已在上一轮跑完，这里在「下一步开始前」干净收束，交挂起纠偏。
    if (input.shouldPause?.()) {
      terminalReason = 'paused-for-correction'
      break
    }

    const beforeModelOutput = await runHooks(hookRegistry, {
      lifecycle: 'beforeModelCall',
      agentName: input.agentName,
      turnIndex,
      stage: 'before-model-call',
      activeTools
    }, budgetTrace)
    history.push(...beforeModelOutput.hookEvents, ...beforeModelOutput.nextTurnPatches)
    appendInjectMessagesToMessages(messages, beforeModelOutput.nextTurnPatches)
    applyActiveTools(beforeModelOutput.activeTools)
    if (beforeModelOutput.terminate) {
      terminalReason = 'terminated-by-hook'
      break
    }

    const rawOutput = await input.callModel({
      // 层6 是每轮变化的运行态，永远只进本次调用快照末尾，不写回稳定 system 前缀或长期 messages。
      messages: [
        ...messages.map((message) => ({ ...message })),
        ...(taskTodoEnabled
          ? [{
              role: 'user' as const,
              content: renderAgentTaskTodoLayer(taskTodo.snapshot(), {
                ...(maxTurns == null
                  ? {}
                  : { remainingTurns: Math.max(0, maxTurns - turnIndex) }),
                ...(maxToolCalls == null
                  ? {}
                  : { remainingToolCalls: Math.max(0, maxToolCalls - budgetTrace.usedToolCalls) })
              })
            }]
          : [])
      ],
      history: history.map((message) => ({ ...message })),
      activeTools: [...activeTools],
      // R1-B B5 延迟模式：native 工具数组只下发已激活集（activeTools=initialActiveTools+toolsearch+已搜激活·带 schema），
      //   其余走 toolCatalog（name+brief）让模型按需 toolsearch。非延迟（现役）：仅列当前阶段 activeTools。
      toolBriefs: effectiveRegistry.listBriefs(activeTools),
      ...(deferredMode
        ? { toolCatalog: input.toolRegistry.listCatalog(input.recommendedTools) }
        : {}),
      turnIndex,
      toolEpoch,
      toolEpochTurnIndex
    })
    toolEpochTurnIndex += 1
    const parsed = (input.parseModelOutput ?? parseJsonModelOutput)(rawOutput, turnIndex)
    const modelMessage = toModelMessage(rawOutput, parsed)
    const turnStage = parsed.stage || inferStageFromToolCalls(parsed.toolCalls) || 'unknown'
    // 工具调用归一化提前到此：normalizeToolCall 原生 function.name 优先（截图 bug 的根治点），
    // 兼读旧 toolName/tool/name（迁移期未切原生的 loop 不破坏）。
    // 归一化后立即按工具 schema 做字段值字符串化纠形（2026-07-08）：模型常把 array/object 字段值
    // 序列化成 JSON 字符串（订阅桥仿真提示词观念渗透·弱模型同犯）——在此单点解开，UI 预览/
    // 回灌消息/两条执行路径吃到的都是纠形后的真值，白撞轮归零。未注册工具 schema 为空=原样透传。
    const normalizedCalls = parsed.toolCalls.map((toolCall, index) => {
      const normalized = normalizeToolCall(toolCall, {
        turnIndex,
        index,
        defaultStage: turnStage
      })
      normalized.args = coerceArgsBySchema(normalized.args, effectiveRegistry.get(normalized.toolName)?.schema)
      return normalized
    })
    const businessCallsThisTurn = normalizedCalls.filter((call) => !isRuntimeMetaTool(call.toolName))
    const writesTodoThisTurn = normalizedCalls.some((call) => call.toolName === WRITE_AGENT_TASK_TODO_TOOL_NAME)
    taskTodoRequiredBeforeBusinessThisTurn = taskTodoEnabled && !taskTodo.hasOpenItems() && (
      businessCallsThisTurn.length > 1
      || businessToolCallsExecuted > 0
      || (writesTodoThisTurn && businessCallsThisTurn.length > 0)
    )
    // 原生感知条件回灌：本轮若来自原生 tool_calls，assistant 消息携带 tool_calls（与 role:'tool' 结果配对）；
    // 否则维持旧的纯 content assistant（迁移期 content-JSON loop 零变化）。
    const turnUsesNativeTools = normalizedCalls.some((call) => call.native)
    const assistantRuntimeMessage = buildAssistantRuntimeMessage(
      modelMessage.content,
      turnUsesNativeTools ? normalizedCalls : []
    )
    if (assistantRuntimeMessage) messages.push(assistantRuntimeMessage)
    history.push(modelMessage)
    // R3-2：本轮模型 assistant 消息原文 append 进保真 log（含编排元数据 JSON；审计/检索可回溯每轮模型产出）。
    emitEvent({ kind: 'assistant-message', content: modelMessage.content, turnIndex })
    // 原生协议不变量：assistant(tool_calls) 之后必须紧跟每个 tool_call 各一条 role:'tool' 结果、中间不能插任何消息
    //（否则上游报 insufficient tool messages following tool_calls）。本轮 hook 注入的消息先进缓冲 turnInjectSink，
    // 待全部工具结果落入 messages 后，由 flushNativeTurnMessages 统一追加（并给提前 break 的孤儿 tool_call 补占位结果）。
    // 非原生轮 turnInjectSink 即 messages，注入即时写入，行为与改造前逐字节一致。
    const deferredTurnMessages: AgentRuntimeMessage[] = []
    const turnInjectSink = turnUsesNativeTools ? deferredTurnMessages : messages
    // 实时旁述（D5）：每轮模型输出解析出 thought 即刻上抛，供编排带展开态逐句呈现「在干嘛/为什么」。
    // 通用层只转发 parsed.parsed.thought（任何在 parsed 里放 thought 的 agent 都能用），不认编排器协议。
    const turnThought = typeof parsed.parsed?.thought === 'string' ? parsed.parsed.thought.trim() : ''
    if (turnThought) {
      input.onProgress?.({ kind: 'thought', stage: parsed.stage || 'unknown', toolName: '', thought: turnThought, turnIndex })
    }

    const turn: AgentTranscriptTurn = {
      turnIndex,
      stage: turnStage,
      activeTools: [...activeTools],
      modelMessage,
      toolCalls: [],
      toolResults: [],
      hookEvents: [],
      nextTurnPatches: []
    }

    const afterModelOutput = await runHooks(hookRegistry, {
      lifecycle: 'afterModelMessage',
      agentName: input.agentName,
      turnIndex,
      stage: turn.stage,
      activeTools,
      modelMessage,
      modelToolCalls: parsed.toolCalls as HookRuntimeEvent['modelToolCalls']
    }, budgetTrace)
    applyHookOutputToTurn(afterModelOutput, turn, history, turnInjectSink)
    applyActiveTools(afterModelOutput.activeTools)
    if (afterModelOutput.terminate) terminalReason = 'terminated-by-hook'
    let processMessageContinuationOutput: HookRunOutput | undefined
    const localContinuationAlreadyRequested = hasRetryPatch(afterModelOutput)
      || hasContinuationPatch(afterModelOutput.nextTurnPatches)
    if (!afterModelOutput.terminate && normalizedCalls.length === 0 && !localContinuationAlreadyRequested) {
      processMessageContinuationOutput = await runHooks(processMessageContinuationRegistry, {
        lifecycle: 'afterModelMessage',
        agentName: input.agentName,
        turnIndex,
        stage: turn.stage,
        activeTools,
        modelMessage,
        modelToolCalls: []
      }, budgetTrace)
      applyHookOutputToTurn(processMessageContinuationOutput, turn, history, turnInjectSink)
      applyActiveTools(processMessageContinuationOutput.activeTools)
    }
    const intermediateContent = String(modelMessage.content || '').trim()
    const hasAnotherTurnInBudget = maxTurns == null || turnIndex + 1 < maxTurns
    const willContinueAfterModel = normalizedCalls.length > 0
      || hasRetryPatch(afterModelOutput)
      || hasContinuationPatch(afterModelOutput.nextTurnPatches)
      || (
        normalizedCalls.length === 0
        && taskTodo.hasOpenItems()
        && !taskTodoExitReminderIssued
        && hasAnotherTurnInBudget
      )
      || Boolean(processMessageContinuationOutput && (
        hasRetryPatch(processMessageContinuationOutput)
        || hasContinuationPatch(processMessageContinuationOutput.nextTurnPatches)
      ))
    if (!afterModelOutput.terminate && intermediateContent && willContinueAfterModel) {
      await input.onIntermediateMessage?.({ content: intermediateContent, turnIndex })
    }
    if (terminalReason === 'terminated-by-hook') {
      // 模型刚吐 tool_calls 就被 hook 终止：本轮没跑任何工具，给全部 tool_call 补占位结果再 flush 缓冲注入，
      // 保证返回的 messages 仍满足原生配对（虽不再发模型，外层若复用也不破协议）。
      if (turnUsesNativeTools) flushNativeTurnMessages(messages, normalizedCalls, turn.toolResults, deferredTurnMessages)
      turns.push(turn)
      budgetTrace.usedTurns = turns.length
      break
    }

    let retryRequestedThisTurn = hasRetryPatch(afterModelOutput)

    if (!retryRequestedThisTurn && shouldRunConcurrentBatch(input.concurrency, normalizedCalls)) {
      // ── 并发批路径：同轮多个互不依赖 toolCall 整批并发执行 ──
      // 三阶段保序：①按序登记 toolCall+beforeToolCall 预检（含 blocked/预算预占）；
      // ②就绪项整批进并发池并行 execute；③按原序处理 afterToolResult 与落账。
      // 与串行的差异：requestRetry 不再中断本批，统一在批后由 retryRequestedThisTurn 走下一轮。
      const plans: Array<{ toolCall: ToolCallMessage; blockedResult?: ToolResultMessage }> = []
      for (const toolCall of normalizedCalls) {
        turn.toolCalls.push(toolCall)
        history.push(toolCall)
        // R3-2：工具调用原始入参 append 进保真 log（取料/决策调了什么、参数全保真，供检索/审计）。
        emitEvent({ kind: 'tool-call', toolCall, turnIndex })
        input.onProgress?.({ kind: 'tool-start', stage: toolCall.stage, toolName: toolCall.toolName, detail: previewToolArgs(toolCall.args), turnIndex })
        const beforeToolOutput = await runHooks(hookRegistry, {
          lifecycle: 'beforeToolCall',
          agentName: input.agentName,
          turnIndex,
          stage: toolCall.stage,
          activeTools,
          toolCall
        }, budgetTrace)
        applyHookOutputToTurn(beforeToolOutput, turn, history, turnInjectSink)
        applyActiveTools(beforeToolOutput.activeTools)
        if (beforeToolOutput.terminate) terminalReason = 'terminated-by-hook'
        if (hasRetryPatch(beforeToolOutput)) retryRequestedThisTurn = true
        if (beforeToolOutput.blocked) {
          plans.push({
            toolCall,
            blockedResult: makeToolErrorResult(
              toolCall,
              beforeToolOutput.blocked.errorType ?? 'INVALID_ARGUMENT',
              beforeToolOutput.blocked.message,
              {
                status: 'blocked',
                retryable: beforeToolOutput.blocked.retryable ?? false,
                details: beforeToolOutput.blocked.details
              }
            )
          })
          continue
        }
        const consumesToolBudget = countsAgainstToolBudget(toolCall.toolName)
        if (consumesToolBudget && maxToolCalls != null && budgetTrace.usedToolCalls >= maxToolCalls) {
          plans.push({
            toolCall,
            blockedResult: makeToolErrorResult(toolCall, 'BUDGET_EXCEEDED', '工具调用数量超过运行时预算', {
              status: 'blocked',
              details: { maxToolCalls }
            })
          })
          terminalReason = 'budget-exceeded'
          continue
        }
        if (consumesToolBudget) budgetTrace.usedToolCalls += 1 // 只预占业务工具预算；TODO 控制面不与业务动作抢额度
        plans.push({ toolCall })
      }

      // 阶段②：就绪项整批并发 execute（保序由并发池返回值保证）
      const readyPlans = plans.filter((plan) => !plan.blockedResult)
      const batchActiveTools = [...activeTools]
      const poolResults = await runWithConcurrencyPool(
        readyPlans,
        async (plan) => {
          const result = await executeToolCall(plan.toolCall, {
            registry: effectiveRegistry,
            activeTools: batchActiveTools,
            ctx: { turnIndex, signal: input.signal }
          })
          // 仅对显式 retryable 的失败抛出，交并发池退避重试；不可重试错误直接作为结果返回
          if (result.status === 'error' && result.error?.retryable) {
            const retryError = new Error(result.error.message) as Error & { lastToolResult?: ToolResultMessage }
            retryError.lastToolResult = result
            throw retryError
          }
          return result
        },
        {
          limit: input.concurrency!.limit,
          retries: input.concurrency!.retries ?? 0,
          ...(input.concurrency!.retryDelayMs != null ? { retryDelayMs: input.concurrency!.retryDelayMs } : {}),
          ...(input.concurrency!.retryMaxDelayMs != null ? { retryMaxDelayMs: input.concurrency!.retryMaxDelayMs } : {}),
          signal: input.signal
        }
      )
      const readyResults = poolResults.map((poolResult, k) => {
        if (poolResult.status === 'fulfilled' && poolResult.value) return poolResult.value
        const thrown = poolResult.error as (Error & { lastToolResult?: ToolResultMessage }) | undefined
        if (thrown?.lastToolResult) return thrown.lastToolResult
        return makeToolErrorResult(
          readyPlans[k].toolCall,
          'TOOL_RUNTIME_ERROR',
          thrown instanceof Error ? thrown.message : '工具执行失败',
          { details: { thrown: true } }
        )
      })

      // 阶段③：按原序回填结果，跑 afterToolResult hook 并落账
      let readyCursor = 0
      for (const plan of plans) {
        if (plan.blockedResult) {
          turn.toolResults.push(plan.blockedResult)
          history.push(plan.blockedResult)
          messages.push(toolResultToChatMessage(plan.blockedResult, turnUsesNativeTools, effectiveRegistry))
          // R3-2：blocked 结果也是保真事件（工具不可用/预算拦截），append 进 log 供报错诊断（R3-5）。
          emitEvent({ kind: 'tool-result', toolResult: plan.blockedResult, turnIndex })
          continue
        }
        let result = noteRepeatedIdenticalResult(plan.toolCall, noteRepeatedToolError(readyResults[readyCursor]))
        readyCursor += 1
        const afterToolOutput = await runHooks(hookRegistry, {
          lifecycle: 'afterToolResult',
          agentName: input.agentName,
          turnIndex,
          stage: plan.toolCall.stage,
          activeTools,
          toolCall: plan.toolCall,
          toolResult: result
        }, budgetTrace)
        if (afterToolOutput.patchedToolResult) result = afterToolOutput.patchedToolResult
        turn.toolResults.push(result)
        history.push(result)
        messages.push(toolResultToChatMessage(result, turnUsesNativeTools, effectiveRegistry))
        // R3-2：工具结果（含 content+details+error）append 进保真 log；details 按字段生命周期标签压缩留检索（R3-3 读）。
        emitEvent({ kind: 'tool-result', toolResult: result, turnIndex })
        applyHookOutputToTurn(afterToolOutput, turn, history, turnInjectSink)
        // item6：toolsearch 命中工具收进黏性集（须在 applyActiveTools 前），下一步阶段机重写 activeTools 时不被抹掉。
        captureDeferredActivation(result)
        applyActiveTools(afterToolOutput.activeTools)
        if (afterToolOutput.terminate) terminalReason = 'terminated-by-hook'
        // halt 原语防御（2026-07-12 架构审查批C）：askUser 类工具不在并发白名单，理论到不了这条路径；
        // 仍加一道防御——批内若出现 awaitingUser（且非 error），只认第一个，其余同批结果照常处理完。
        if (pendingInteraction === undefined && result.status === 'success' && result.awaitingUser) {
          terminalReason = 'awaiting-user'
          pendingInteraction = result.awaitingUser
        }
        if (pendingSubagentWait === undefined && result.status === 'success' && result.awaitingSubagent) {
          terminalReason = 'awaiting-subagent'
          pendingSubagentWait = result.awaitingSubagent
        }
        const resultRetried = hasRetryPatch(afterToolOutput)
        input.onProgress?.({
          kind: 'tool-result',
          stage: plan.toolCall.stage,
          toolName: plan.toolCall.toolName,
          status: result.status,
          errorType: result.error?.type,
          retried: resultRetried,
          ...(result.status === 'success' ? { resultPreview: previewToolResult(result.content) } : {}),
          ...(result.error?.message ? { errorMessage: result.error.message } : {}),
          turnIndex
        })
        if (resultRetried) retryRequestedThisTurn = true // 批后统一走下一轮，不中断本批
      }
    } else {
      for (const toolCall of normalizedCalls) {
        if (retryRequestedThisTurn) break
        turn.toolCalls.push(toolCall)
        history.push(toolCall)
        // R3-2：工具调用原始入参 append 进保真 log（取料/决策调了什么、参数全保真，供检索/审计）。
        emitEvent({ kind: 'tool-call', toolCall, turnIndex })
        input.onProgress?.({ kind: 'tool-start', stage: toolCall.stage, toolName: toolCall.toolName, detail: previewToolArgs(toolCall.args), turnIndex })
        const beforeToolOutput = await runHooks(hookRegistry, {
          lifecycle: 'beforeToolCall',
          agentName: input.agentName,
          turnIndex,
          stage: toolCall.stage,
          activeTools,
          toolCall
        }, budgetTrace)
        applyHookOutputToTurn(beforeToolOutput, turn, history, turnInjectSink)
        applyActiveTools(beforeToolOutput.activeTools)
        if (beforeToolOutput.terminate) terminalReason = 'terminated-by-hook'
        if (hasRetryPatch(beforeToolOutput)) retryRequestedThisTurn = true
        if (beforeToolOutput.blocked) {
          const blockedResult = makeToolErrorResult(
            toolCall,
            beforeToolOutput.blocked.errorType ?? 'INVALID_ARGUMENT',
            beforeToolOutput.blocked.message,
            {
              status: 'blocked',
              retryable: beforeToolOutput.blocked.retryable ?? false,
              details: beforeToolOutput.blocked.details
            }
          )
          turn.toolResults.push(blockedResult)
          history.push(blockedResult)
          messages.push(toolResultToChatMessage(blockedResult, turnUsesNativeTools, effectiveRegistry))
          // R3-2：blocked 结果也是保真事件，append 进 log 供报错诊断（R3-5）。
          emitEvent({ kind: 'tool-result', toolResult: blockedResult, turnIndex })
          if (retryRequestedThisTurn) break
          continue
        }

        const consumesToolBudget = countsAgainstToolBudget(toolCall.toolName)
        if (consumesToolBudget && maxToolCalls != null && budgetTrace.usedToolCalls >= maxToolCalls) {
          const budgetResult = makeToolErrorResult(toolCall, 'BUDGET_EXCEEDED', '工具调用数量超过运行时预算', {
            status: 'blocked',
            details: { maxToolCalls }
          })
          turn.toolResults.push(budgetResult)
          history.push(budgetResult)
          messages.push(toolResultToChatMessage(budgetResult, turnUsesNativeTools, effectiveRegistry))
          // R3-2：预算拦截结果也是保真事件，append 进 log 供报错诊断（R3-5）。
          emitEvent({ kind: 'tool-result', toolResult: budgetResult, turnIndex })
          terminalReason = 'budget-exceeded'
          continue
        }

        let result = noteRepeatedIdenticalResult(toolCall, noteRepeatedToolError(await executeToolCall(toolCall, {
          registry: effectiveRegistry,
          activeTools,
          ctx: { turnIndex, signal: input.signal }
        })))
        if (consumesToolBudget) budgetTrace.usedToolCalls += 1
        const afterToolOutput = await runHooks(hookRegistry, {
          lifecycle: 'afterToolResult',
          agentName: input.agentName,
          turnIndex,
          stage: toolCall.stage,
          activeTools,
          toolCall,
          toolResult: result
        }, budgetTrace)
        if (afterToolOutput.patchedToolResult) result = afterToolOutput.patchedToolResult
        turn.toolResults.push(result)
        history.push(result)
        messages.push(toolResultToChatMessage(result, turnUsesNativeTools, effectiveRegistry))
        // R3-2：工具结果（含 content+details+error）append 进保真 log；details 按字段生命周期标签压缩留检索（R3-3 读）。
        emitEvent({ kind: 'tool-result', toolResult: result, turnIndex })
        applyHookOutputToTurn(afterToolOutput, turn, history, turnInjectSink)
        // item6：toolsearch 命中工具收进黏性集（须在 applyActiveTools 前），下一步阶段机重写 activeTools 时不被抹掉。
        captureDeferredActivation(result)
        applyActiveTools(afterToolOutput.activeTools)
        if (afterToolOutput.terminate) terminalReason = 'terminated-by-hook'
        // halt 原语（2026-07-12 架构审查批C）：工具结果落定（history/messages/emitEvent 均已照常走完，
        // 模型下轮重启时仍能看到这条工具结果）后，若带 awaitingUser 标记（且非 error），loop 在步骤边界收束——
        // 答复由消费方（如提调纠偏）喂进新 loop 续接，不像 blocking 模式那样在工具内部 await 用户。
        // 同轮出现多次只认第一个（取代旧「本轮已提问一次」节流；不 break 本轮其余调用，收口方式对齐上面 terminate 分支）。
        if (pendingInteraction === undefined && result.status === 'success' && result.awaitingUser) {
          terminalReason = 'awaiting-user'
          pendingInteraction = result.awaitingUser
        }
        if (pendingSubagentWait === undefined && result.status === 'success' && result.awaitingSubagent) {
          terminalReason = 'awaiting-subagent'
          pendingSubagentWait = result.awaitingSubagent
        }
        const resultRetried = hasRetryPatch(afterToolOutput)
        input.onProgress?.({
          kind: 'tool-result',
          stage: toolCall.stage,
          toolName: toolCall.toolName,
          status: result.status,
          errorType: result.error?.type,
          retried: resultRetried,
          ...(result.status === 'success' ? { resultPreview: previewToolResult(result.content) } : {}),
          ...(result.error?.message ? { errorMessage: result.error.message } : {}),
          turnIndex
        })
        if (resultRetried) {
          retryRequestedThisTurn = true
          break
        }
      }
    }

    // 原生轮收尾：把缓冲的 hook 注入消息追加到全部工具结果之后，并给提前 break 的孤儿 tool_call 补占位 role:'tool'。
    // 必须在 beforeNextTurn/afterTurn hook 之前——它们的注入排在工具结果之后即可，不再破坏原生配对。
    if (turnUsesNativeTools) flushNativeTurnMessages(messages, normalizedCalls, turn.toolResults, deferredTurnMessages)

    const beforeNextTurnOutput = await runHooks(hookRegistry, {
      lifecycle: 'beforeNextTurn',
      agentName: input.agentName,
      turnIndex,
      stage: turn.stage,
      activeTools
    }, budgetTrace)
    applyHookOutputToTurn(beforeNextTurnOutput, turn, history, messages)
    applyActiveTools(beforeNextTurnOutput.activeTools)
    if (beforeNextTurnOutput.terminate) terminalReason = 'terminated-by-hook'

    const afterTurnOutput = await runHooks(hookRegistry, {
      lifecycle: 'afterTurn',
      agentName: input.agentName,
      turnIndex,
      stage: turn.stage,
      activeTools
    }, budgetTrace)
    applyHookOutputToTurn(afterTurnOutput, turn, history, messages)
    applyActiveTools(afterTurnOutput.activeTools)
    if (afterTurnOutput.terminate) terminalReason = 'terminated-by-hook'

    turns.push(turn)
    budgetTrace.usedTurns = turns.length

    // 终止优先：hook 明确 terminate 或 halt 原语请求收束时立即收口，不被同轮其它工具的续轮 patch（如计划生成开放下一步）盖过。
    if (
      terminalReason === 'terminated-by-hook'
      || terminalReason === 'awaiting-user'
      || terminalReason === 'awaiting-subagent'
    ) break
    const shouldContinueForNextTurnPatch = hasContinuationPatch(turn.nextTurnPatches)
    const modelWouldStop = !retryRequestedThisTurn
      && !shouldContinueForNextTurnPatch
      && (parsed.done || normalizedCalls.length === 0 || terminalReason === 'budget-exceeded')
    if (modelWouldStop && terminalReason !== 'budget-exceeded' && taskTodo.hasOpenItems()) {
      if (!taskTodoExitReminderIssued) {
        taskTodoExitReminderIssued = true
        const snapshot = taskTodo.snapshot()
        const openIds = snapshot.items.filter((item) => item.status !== 'completed').map((item) => item.id)
        const content = `你正在尝试结束当前任务，但清单仍有未完成项（${openIds.join('、')}）。请再核对一次：能继续完成的就立即继续，并在达到验收标准后用 updateTaskTodo 更新；如果确实缺少能力、需要用户拍板、依赖外部状态变化，或继续执行并不安全/不合适，就在下一轮如实说明原因后停止，保留未完成项，不要勉强完成、擅自替用户选择或伪装完成。需要用户决定重大内容分叉且当前 Agent 提供选择交互工具时，应调用它弹出选择卡；自动放行只覆盖普通写入审查，不等于用户已经拍板。`
        const nextTurnPatch: NextTurnPatch = {
          kind: 'nextTurnPatch',
          id: `patch_${turnIndex}_agent-task-todo-exit-reminder`,
          sourceHookId: 'agent-task-todo-exit-reminder',
          stage: turn.stage,
          injectMessages: [{ role: 'user', purpose: 'stage-instruction', content }],
          requestRetry: {
            errorType: 'EXPECTATION_MISMATCH',
            reason: '任务 TODO 仍有未完成项，请再核对一次后决定继续或如实停止。'
          }
        }
        turn.nextTurnPatches.push(nextTurnPatch)
        history.push(nextTurnPatch)
        messages.push({ role: 'user', content })
        continue
      }
      terminalReason = 'incomplete'
    }
    if (modelWouldStop) {
      break
    }

    // closing-note 快速收束（预写收尾话·2026-07-12 用户拍板）：loop 原本会继续（上面两个既有收束判据都没命中，
    // 即将再调一轮模型）时才检查——单个工具调用、结果 success、携带 closingNote，就不再多等那一轮模型换收尾话，
    // 直接把 closingNote 当作「模型下一轮会说的那句最终回复」补进 messages/history/保真事件，走与真实模型回复
    // 完全一致的路径（新增一条 assistant 消息 + 一条不调模型的收尾 turn），随即收束。不动本轮已落定的 turn/
    // toolResults（原始工具调用/结果保持保真，未被覆盖）；awaitingUser/超时/预算/hook 终止等既有语义均已在
    // 上面两个判据中优先处理完，走到这里必然是「非 halt、非超预算、非零工具轮、非 hook 终止」的单纯延续分支。
    if (normalizedCalls.length === 1) {
      const onlyResult = turn.toolResults[0]
      const closingNote = onlyResult?.status === 'success' ? onlyResult.closingNote : undefined
      if (typeof closingNote === 'string' && closingNote.trim() && !taskTodo.hasOpenItems()) {
        const closingText = closingNote.trim()
        const closingModelMessage: AgentModelMessage = { kind: 'modelMessage', role: 'assistant', content: closingText }
        messages.push({ role: 'assistant', content: closingText })
        history.push(closingModelMessage)
        emitEvent({ kind: 'assistant-message', content: closingText, turnIndex: turnIndex + 1 })
        turns.push({
          turnIndex: turnIndex + 1,
          stage: turn.stage,
          activeTools: [...activeTools],
          modelMessage: closingModelMessage,
          toolCalls: [],
          toolResults: [],
          hookEvents: [],
          nextTurnPatches: []
        })
        budgetTrace.usedTurns = turns.length
        terminalReason = 'closing-note'
        break
      } else if (typeof closingNote === 'string' && closingNote.trim() && taskTodo.hasOpenItems()) {
        // 有未完成 TODO 时 closingNote 只能算过程话，不能跳过最后核账轮。
        messages.push({
          role: 'user',
          content: '工具给出了预写收尾话，但当前任务 TODO 尚未全部完成；忽略这句收尾，继续执行并逐项核对验收标准。'
        })
      }
    } else if (isDevEnv()) {
      const withClosingNote = turn.toolResults.filter((toolResult) => Boolean(toolResult.closingNote))
      if (withClosingNote.length) {
        // eslint-disable-next-line no-console
        console.warn(`[agentRuntime] 本轮 ${normalizedCalls.length} 个工具调用中有 closingNote 被忽略（仅单工具调用轮生效）：${withClosingNote.map((toolResult) => toolResult.toolName).join('、')}`)
      }
    }
  }

  if (maxTurns != null && turns.length >= maxTurns && terminalReason === 'done') {
    const lastTurn = turns[turns.length - 1]
    const lastHasOpenCalls = lastTurn?.toolCalls.length && !lastTurn?.modelMessage.parsed?.done
    if (taskTodo.hasOpenItems() || lastHasOpenCalls) terminalReason = 'budget-exceeded'
  }

  // 异常终止如实通告（报错也输出原则的延伸）：被 hook 中止 / 超预算收尾时上抛一条 notice，
  // 让过程轨决策流不至于「无声断流」。正常 done / 用户取消 aborted（由外层 fail 处理）不发。
  if (
    terminalReason === 'terminated-by-hook'
    || terminalReason === 'budget-exceeded'
    || terminalReason === 'timeout'
    || terminalReason === 'incomplete'
  ) {
    input.onProgress?.({
      kind: 'notice',
      stage: 'terminal',
      toolName: '',
      thought: terminalReason === 'budget-exceeded'
        ? taskTodo.hasOpenItems()
          ? `已到安全执行上限，待办仍有 ${taskTodo.snapshot().items.filter((item) => item.status !== 'completed').length} 项未完成；进度已保留，本轮没有标记为完成`
          : '已到步数/调用上限，先收这一轮'
        : terminalReason === 'timeout'
          ? '提调运行超过 20 分钟，已自动截止这一轮'
          : terminalReason === 'incomplete'
            ? `模型复核后仍决定停止，待办保留 ${taskTodo.snapshot().items.filter((item) => item.status !== 'completed').length} 项未完成；本轮没有伪装成完成`
          : '按运行规则中止了这一轮',
      turnIndex: Math.max(0, turns.length - 1)
    })
  }

  return {
    messages,
    ...(pendingInteraction ? { pendingInteraction } : {}),
    ...(pendingSubagentWait ? { pendingSubagentWait } : {}),
    taskTodo: taskTodo.snapshot(),
    deferredActiveTools: Array.from(deferredActivated).filter((name) => !isRuntimeMetaTool(name)),
    transcript: {
      kind: 'agentTranscript',
      agentName: input.agentName,
      runtimeVersion: input.runtimeVersion ?? 'agent-runtime-batch1',
      initialActiveTools: [...input.initialActiveTools],
      ...(input.promptSupplyTrace
        ? { promptSupplyTrace: input.promptSupplyTrace.map((entry) => ({ ...entry })) }
        : {}),
      ...(input.toolSupplyDiagnostics
        ? { toolSupplyDiagnostics: input.toolSupplyDiagnostics.map((diagnostic) => ({ ...diagnostic })) }
        : {}),
      history,
      turns,
      budget: budgetTrace,
      terminalReason
    }
  }
}

function isRuntimeMetaTool(name: string): boolean {
  const normalized = String(name || '').trim()
  return isAgentTaskTodoTool(normalized)
    || isAgentSubagentWaitTool(normalized)
    || isAgentSubagentControlTool(normalized)
    || normalized === TOOLSEARCH_TOOL_NAME
}

function countsAgainstToolBudget(name: string): boolean {
  const normalized = String(name || '').trim()
  return !isAgentTaskTodoTool(normalized) && !isAgentSubagentWaitTool(normalized)
}

function normalizeRuntimeBudgetLimit(value: number | null | undefined): number | null {
  if (value == null) return null
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.floor(value))
}

function hasRetryPatch(output: HookRunOutput): boolean {
  return output.nextTurnPatches.some((patch) => Boolean(patch.requestRetry))
}

/** 是否对本轮 toolCall 走并发批：需配置并发、本轮 toolCall 数量>1、且全部命中白名单。 */
function shouldRunConcurrentBatch(
  concurrency: AgentRuntimeConcurrency | undefined,
  calls: ToolCallMessage[]
): boolean {
  if (!concurrency) return false
  if (calls.length <= 1) return false
  const whitelist = new Set(concurrency.tools ?? [])
  if (whitelist.size === 0) return false
  return calls.every((call) => whitelist.has(call.toolName))
}

function hasContinuationPatch(patches: AgentTranscriptTurn['nextTurnPatches']): boolean {
  return patches.some((patch) => {
    if (patch.terminate) return false
    return Boolean(
      patch.requestRetry ||
      patch.systemPromptPatch ||
      patch.activeTools?.length ||
      patch.injectMessages.length
    )
  })
}

async function runHooks(
  hookRegistry: HookRegistry,
  event: HookRuntimeEvent,
  budget: AgentRuntimeBudgetTrace
): Promise<HookRunOutput> {
  return hookRegistry.run(event, {
    budget: {
      maxTurns: budget.maxTurns,
      maxToolCalls: budget.maxToolCalls,
      usedTurns: budget.usedTurns,
      usedToolCalls: budget.usedToolCalls
    }
  })
}

function applyHookOutputToTurn(
  output: HookRunOutput,
  turn: AgentTranscriptTurn,
  history: AgentRuntimeHistoryMessage[],
  messages?: AgentRuntimeMessage[]
): void {
  if (output.hookEvents.length > 0) {
    turn.hookEvents.push(...output.hookEvents)
    history.push(...output.hookEvents)
  }
  if (output.nextTurnPatches.length > 0) {
    turn.nextTurnPatches.push(...output.nextTurnPatches)
    history.push(...output.nextTurnPatches)
    if (messages) appendInjectMessagesToMessages(messages, output.nextTurnPatches)
  }
}

/** 边界真值：模型每轮只接收 messages（callModel 的 messages 入参），history 仅供审计与 hook。
 *  toolResult 与 hook 注入指令必须同步序列化进 messages，否则模型看不到工具反馈与阶段协议、
 *  只能按系统提示词盲打（2026-06-10 普通召回单计划 generatePlanBatch 全被参数校验拒绝的根因）。 */
function toolResultToChatMessage(result: ToolResultMessage, native = false, registry?: ToolRegistry): AgentRuntimeMessage {
  // 结果中央钳制（2026-07-12 架构审查批B）：只钳制回灌模型的 content，registry 缺省时按默认阈值钳（不传
  // registry 的调用方视为无工具定义可查）。history.push(result) 与 emitEvent(...result) 都发生在本函数
  // 调用之前、拿的是未钳制的原始 result 对象——保真事件与审计全文不受影响，只有这里构造的 chat message 被钳。
  const clampChars = resolveResultClampChars(registry?.get(result.toolName))
  const content = clampToolResultContent(result.content, clampChars)
  // 原生感知条件回灌：native 轮用原生 role:'tool' + tool_call_id（与 assistant.tool_calls 配对，OpenAI 协议要求）；
  // 非 native（迁移期 content-JSON loop）维持旧的 role:'user' JSON 回灌，行为零变化。
  if (native) {
    return {
      role: 'tool',
      tool_call_id: result.callId,
      content
    }
  }
  return {
    role: 'user',
    content: JSON.stringify({
      kind: 'toolResult',
      tool: result.toolName,
      callId: result.callId,
      status: result.status,
      content,
      ...(result.error ? { error: { type: result.error.type, message: result.error.message } } : {})
    })
  }
}

// 原生轮的 assistant 消息：携带 tool_calls（id 即 callId，与回灌的 role:'tool'+tool_call_id 配对）。
// nativeCalls 为空（非原生轮）时退回纯 content assistant，迁移期 content-JSON loop 不变。
function buildAssistantRuntimeMessage(
  content: string,
  nativeCalls: ToolCallMessage[]
): AgentRuntimeMessage | null {
  if (!nativeCalls.length) {
    const normalizedContent = String(content || '').trim()
    return normalizedContent ? { role: 'assistant', content: normalizedContent } : null
  }
  return {
    role: 'assistant',
    content,
    tool_calls: nativeCalls.map((call) => ({
      id: call.callId,
      type: 'function' as const,
      function: { name: call.toolName, arguments: JSON.stringify(call.args ?? {}) }
    }))
  }
}

/** 原生轮 messages 收尾（OpenAI 协议）：assistant(tool_calls) 后必须紧跟「每个 tool_call_id 各一条 role:'tool'」、
 *  连续无间隔。① 给「声明了却没产出结果」的 tool_call（提前重试/收束/hook 终止造成）补占位 role:'tool'，
 *  让配对数始终相等；② 把本轮缓冲的 hook 注入消息追加到全部工具结果之后。仅原生轮调用，非原生轮零影响。 */
function flushNativeTurnMessages(
  messages: AgentRuntimeMessage[],
  normalizedCalls: ToolCallMessage[],
  resolvedResults: ToolResultMessage[],
  deferredMessages: AgentRuntimeMessage[]
): void {
  const resolved = new Set(resolvedResults.map((result) => result.callId))
  for (const call of normalizedCalls) {
    if (resolved.has(call.callId)) continue
    messages.push({
      role: 'tool',
      tool_call_id: call.callId,
      content: '（本轮未执行：上一步触发重试或提前收束，该工具调用已跳过。）'
    })
  }
  if (deferredMessages.length) messages.push(...deferredMessages)
}

function appendInjectMessagesToMessages(messages: AgentRuntimeMessage[], patches: NextTurnPatch[]): void {
  for (const patch of patches) {
    for (const inject of patch.injectMessages ?? []) {
      const content = String(inject.content || '').trim()
      if (!content) continue
      messages.push({ role: inject.role, content })
    }
  }
}

async function executeToolCall(
  toolCall: ToolCallMessage,
  input: {
    registry: ToolRegistry
    activeTools: string[]
    ctx: ToolExecutionContext
  }
): Promise<ToolResultMessage> {
  // 精准护栏①「没读到工具名」：与「名字不存在」区分开（截图 bug 时报错太泛、模型只能瞎猜格式）。
  // 原生工具调用下工具名应在 function.name；为空说明模型没把名字放对位置，明确点破并给可用清单。
  if (!toolCall.toolName) {
    const registered = new Set(input.registry.list().map((tool) => tool.name))
    const available = input.activeTools.filter((name) => registered.has(name))
    const hint = available.length
      ? `当前可用工具：${available.join('、')}。`
      : '当前本步没有可用工具，可直接收尾。'
    return makeToolErrorResult(
      toolCall,
      'MODEL_OUTPUT_INVALID',
      `没有读到工具名：请把要调用的工具名放在 function.name 里（形如 {"type":"function","function":{"name":"<工具名>","arguments":"{...}"}}）。${hint}`,
      { status: 'blocked', details: { availableTools: available, reason: 'empty-tool-name' } }
    )
  }
  if (!input.activeTools.includes(toolCall.toolName)) {
    return makeToolErrorResult(toolCall, 'TOOL_NOT_FOUND', `工具 ${toolCall.toolName} 当前阶段不可调用`, {
      status: 'blocked',
      details: { activeTools: input.activeTools }
    })
  }

  const definition = input.registry.get(toolCall.toolName)
  if (!definition) {
    // 模型调了不存在的工具（常见：在回复编排 loop 里幻想出 editChatMessage 之类的工具）。
    // 不只回一句「未注册」让它反复重试同一个幻想工具——把「当前真正可用的工具」列出来，引导自纠或收尾。
    const registered = new Set(input.registry.list().map((tool) => tool.name))
    const available = input.activeTools.filter((name) => registered.has(name))
    const hint = available.length
      ? `当前没有这个工具。可用的工具只有：${available.join('、')}。请改用其中之一，或在不需要再调工具时直接收尾。`
      : `当前没有这个工具，且本步没有可用工具，请直接收尾。`
    return makeToolErrorResult(toolCall, 'TOOL_NOT_FOUND', `没有名为「${toolCall.toolName}」的工具。${hint}`, {
      status: 'blocked',
      details: { availableTools: available }
    })
  }

  const argError = definition.validateArgs?.(toolCall.args)
  if (argError) {
    return makeToolErrorResult(toolCall, 'INVALID_ARGUMENT', argError, {
      details: { args: toolCall.args }
    })
  }

  if (input.ctx.signal?.aborted) {
    return makeToolErrorResult(toolCall, 'ABORTED', '工具执行前已取消', {
      status: 'blocked',
      retryable: false
    })
  }

  // longRunning 工具（等用户交互 / 派发子 agent 长任务）完全免超时：耗时不可预测，走原始直调不设竞速。
  if (definition.longRunning) {
    try {
      const result = await definition.execute(toolCall, input.ctx)
      return adaptToolExecutionResult(toolCall, result)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return makeToolErrorResult(toolCall, 'TOOL_RUNTIME_ERROR', message, {
        details: { thrown: true }
      })
    }
  }

  // 单工具默认执行超时（2026-07-12 架构审查批B）：execute 卡死/网络挂起不能让整条 loop 无限等待。
  // Promise.resolve().then(...) 把同步 throw 也转成 rejected promise，统一走下面 catch；超时不 throw——
  // 回落成错误型结果，loop 按正常错误结果继续跑下一步。定时器必须在 execute 落定（成功/失败/超时任一先到）
  // 后清理，避免 race 输家的 timer 泄漏；abort 语义不变——超时只是新增的另一种竞速者，谁先到算谁。
  let timeoutTimer: ReturnType<typeof setTimeout> | undefined
  const timeoutSentinel = Symbol('agentRuntimeToolTimeout')
  const timeoutPromise = new Promise<typeof timeoutSentinel>((resolve) => {
    timeoutTimer = setTimeout(() => resolve(timeoutSentinel), DEFAULT_TOOL_EXECUTE_TIMEOUT_MS)
  })
  try {
    const executePromise = Promise.resolve().then(() => definition.execute(toolCall, input.ctx))
    const raced = await Promise.race([executePromise, timeoutPromise])
    if (raced === timeoutSentinel) {
      // 竞速输家兜底：execute 在超时判定后才 reject 的话已无人 await，必须吞掉避免 unhandledrejection 噪声。
      executePromise.catch(() => {})
      // retryable 不设 true：自动重试一个刚超时的调用大概率再等满 300s，白耗预算；是否重试交模型自己判断。
      return makeToolErrorResult(
        toolCall,
        'TOOL_RUNTIME_ERROR',
        `工具执行超时：「${toolCall.toolName}」超过 ${DEFAULT_TOOL_EXECUTE_TIMEOUT_MS}ms 未返回结果，已跳过继续下一步。`,
        { details: { timedOut: true, timeoutMs: DEFAULT_TOOL_EXECUTE_TIMEOUT_MS } }
      )
    }
    return adaptToolExecutionResult(toolCall, raced)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return makeToolErrorResult(toolCall, 'TOOL_RUNTIME_ERROR', message, {
      details: { thrown: true }
    })
  } finally {
    clearTimeout(timeoutTimer)
  }
}

/** 单工具默认执行超时（ms，2026-07-12 架构审查批B；同日拍板 120s→300s 延长为 5 分钟）：
 *  普通工具默认 5 分钟；definition.longRunning 为 true 的工具完全不受此限制。 */
export const DEFAULT_TOOL_EXECUTE_TIMEOUT_MS = 300000

/** R1-B B5：toolsearch 元工具机器名（runtime 原生·延迟模式恒下发恒可调）。 */
export const TOOLSEARCH_TOOL_NAME = 'toolsearch'

/** R1-B B5（统一 toolsearch）：构造 runtime 原生 toolsearch 元工具——按 query 在「当轮 B3 满足的全局单目录」里
 *  关键词匹配，命中工具用 resolveToolSchema（动态 schema 吃 ctx.business 现造）回报名字/说明/参数格式，并经
 *  details.activatedTools 触发激活 hook（下一轮带 schema 可调）。检索通用 name+brief——保持 agentRuntime 纯净。 */
function buildToolsearchTool(
  input: RunAgentRuntimeInput,
  freezeFullAuthorizedTools = false
): ToolDefinition {
  return {
    name: TOOLSEARCH_TOOL_NAME,
    brief: '按能力关键词搜索可用工具：传 query（你想做的事 / 工具能力关键词），返回匹配工具的名字、说明和参数格式；搜到后下一轮即可直接调用它们。推荐单里没有的能力都用它找。',
    schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '想要的工具能力关键词，如「读提示词」「取料」「重投影」。' }
      },
      required: ['query']
    },
    validateArgs: (args) => (String((args as { query?: unknown })?.query ?? '').trim() ? null : 'toolsearch 缺少 query（要搜的能力关键词）'),
    execute: (toolCall) => {
      const query = String((toolCall.args as { query?: unknown })?.query ?? '').trim()
      const catalog = input.toolRegistry.listCatalog(input.recommendedTools)
      const matched = matchToolsByQuery(catalog, query)
      if (!matched.length) {
        return { content: `没有搜到与「${query}」匹配的工具，可换个关键词再搜。`, details: { query, activatedTools: [] } }
      }
      const activatedTools = freezeFullAuthorizedTools
        ? input.toolRegistry.list().map((definition) => definition.name)
        : matched
      const lines = matched.map((name) => {
        const definition = input.toolRegistry.get(name)
        if (!definition) return `- ${name}`
        const schema = definition.schema
        return `- ${name}：${definition.brief}${schema ? `\n  参数格式：${JSON.stringify(schema)}` : ''}`
      })
      return {
        content: freezeFullAuthorizedTools
          ? `搜到 ${matched.length} 个匹配工具；已一次性装载并冻结本轮全部授权工具，后续直接调用，不要重复搜索：\n${lines.join('\n')}`
          : `搜到 ${matched.length} 个工具，下一轮可直接调用：\n${lines.join('\n')}`,
        details: { query, activatedTools }
      }
    }
  }
}

/** R1-B B5：toolsearch 激活 hook（内置·复用现役 nextTurnPatch.activeTools 流转）——toolsearch 成功后把命中工具
 *  并进 activeTools（去重），下一轮 listBriefs 即带其 schema、可被原生调用。不另造激活机制。 */
function buildToolsearchActivateHook(): HookDefinition {
  return {
    id: 'agent-runtime-toolsearch-activate',
    lifecycle: 'afterToolResult',
    priority: 10,
    appliesTo: { toolName: TOOLSEARCH_TOOL_NAME, status: 'success' },
    run: (event) => {
      const raw = event.toolResult?.details?.activatedTools
      const activated = Array.isArray(raw) ? raw.map((name) => String(name || '').trim()).filter(Boolean) : []
      if (!activated.length) return undefined
      const merged = Array.from(new Set([...event.activeTools, ...activated]))
      return { activeTools: merged, summary: `toolsearch 激活工具：${activated.join('、')}` }
    }
  }
}

export function parseJsonModelOutput(rawOutput: unknown, turnIndex = 0): ParsedAgentModelOutput {
  // 原生工具调用形态：callModel 返回 { content, toolCalls }——content 仍是编排元数据 JSON（thought/stage/done），
  // 工具调用走原生 toolCalls（function.name 形态），不再从 content 里解析工具。批3/4 切原生的 loop 走这条。
  if (isNativeToolModelOutput(rawOutput)) {
    const contentText = String((rawOutput as { content?: unknown }).content ?? '')
    const meta = parseObject(contentText)
    const nativeRaw = (rawOutput as { toolCalls?: unknown; tool_calls?: unknown }).toolCalls
      ?? (rawOutput as { tool_calls?: unknown }).tool_calls
    const toolCalls = (Array.isArray(nativeRaw) ? nativeRaw : [])
      .filter((item: unknown): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
      .map((item) => ({ ...item, requestedAtTurn: turnIndex }))
    return {
      stage: String(meta.stage || '').trim() || undefined,
      done: meta.done === true || meta.done === 'true',
      content: contentText,
      parsed: meta,
      toolCalls
    }
  }

  // 旧路径（string 或纯 content-JSON 对象）：从 content-JSON 的 toolCalls/tool_calls 解析工具（迁移期未切原生的 loop）。
  const parsed = parseObject(rawOutput)
  const toolCallsRaw = Array.isArray(parsed.toolCalls)
    ? parsed.toolCalls
    : (Array.isArray(parsed.tool_calls) ? parsed.tool_calls : [])
  const toolCalls = toolCallsRaw
    .filter((item: unknown): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
    .map((item) => ({
      ...item,
      requestedAtTurn: turnIndex
    }))
  return {
    stage: String(parsed.stage || '').trim() || undefined,
    done: parsed.done === true || parsed.done === 'true',
    content: typeof rawOutput === 'string' ? rawOutput : JSON.stringify(rawOutput),
    parsed,
    toolCalls
  }
}

/** 是否为原生工具调用回包形态：对象且 content 是字符串、且携带 toolCalls/tool_calls 数组。
 *  content 为字符串是关键判别——旧 content-JSON 对象路径的顶层是 thought/stage 等、不含字符串 content。 */
function isNativeToolModelOutput(rawOutput: unknown): boolean {
  if (!rawOutput || typeof rawOutput !== 'object' || Array.isArray(rawOutput)) return false
  const obj = rawOutput as { content?: unknown; toolCalls?: unknown; tool_calls?: unknown }
  if (typeof obj.content !== 'string') return false
  return Array.isArray(obj.toolCalls) || Array.isArray(obj.tool_calls)
}

function normalizeToolCall(
  raw: ParsedAgentModelOutput['toolCalls'][number],
  options: { turnIndex: number; index: number; defaultStage: string }
): ToolCallMessage {
  // 原生工具调用项：工具名在 function.name、参数为 function.arguments(JSON 字符串)。
  // 这是截图 bug（工具名解析成空串）的根治点——原生形态用 function.name 兜住。
  const fn = raw.function && typeof raw.function === 'object'
    ? raw.function as { name?: unknown; arguments?: unknown }
    : null
  const native = Boolean(fn)
  // 工具名：原生 function.name 优先，兼读旧 toolName/tool/name（迁移期未切原生的 loop 仍能解析）。
  const toolName = String((fn?.name ?? '') || raw.toolName || raw.tool || raw.name || '').trim()
  // callId：原生 id 优先（与回灌 tool_call_id 配对），回退旧 callId/call_id，再合成。
  const callId = String((raw.id ?? '') || raw.callId || raw.call_id || '').trim()
    || `call_${options.turnIndex + 1}_${options.index + 1}`
  // 参数：原生 function.arguments 解析优先；否则旧 args 对象 / collectArgs 兜底。
  const nativeArgs = native ? parseNativeToolArguments(fn?.arguments) : null
  const rawArgs = nativeArgs
    ?? (raw.args && typeof raw.args === 'object' && !Array.isArray(raw.args)
      ? raw.args
      : collectArgs(raw))
  return {
    kind: 'toolCall',
    callId,
    toolName,
    stage: String(raw.stage || options.defaultStage || '').trim() || 'unknown',
    args: rawArgs,
    expectation: String(raw.expectation || '').trim(),
    requestedAtTurn: options.turnIndex,
    ...(native ? { native: true } : {})
  }
}

/** 原生 function.arguments（JSON 字符串或对象）→ 参数对象。空/非法 JSON 回退 {}（交 validateArgs 给精准缺参报错）。 */
function parseNativeToolArguments(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>
  const text = String(value ?? '').trim()
  if (!text) return {}
  try {
    const parsed = JSON.parse(text)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {}
  } catch {
    return {}
  }
}

function collectArgs(raw: ParsedAgentModelOutput['toolCalls'][number]): Record<string, unknown> {
  const args: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(raw)) {
    if (['kind', 'callId', 'call_id', 'toolName', 'tool', 'name', 'stage', 'expectation', 'requestedAtTurn'].includes(key)) continue
    args[key] = value
  }
  return args
}

function toModelMessage(rawOutput: unknown, parsed: ParsedAgentModelOutput): AgentModelMessage {
  return {
    kind: 'modelMessage',
    role: 'assistant',
    content: parsed.content ?? (typeof rawOutput === 'string' ? rawOutput : JSON.stringify(rawOutput)),
    ...(parsed.parsed ? { parsed: parsed.parsed } : {})
  }
}

function inferStageFromToolCalls(toolCalls: ParsedAgentModelOutput['toolCalls']): string {
  const firstStage = toolCalls.map((toolCall) => String(toolCall.stage || '').trim()).find(Boolean)
  return firstStage || ''
}

function parseObject(rawOutput: unknown): Record<string, any> {
  if (rawOutput && typeof rawOutput === 'object' && !Array.isArray(rawOutput)) return rawOutput as Record<string, any>
  const source = String(rawOutput ?? '').trim()
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
