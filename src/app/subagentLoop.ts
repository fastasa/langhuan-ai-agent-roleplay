/**
 * subagent 运行骨架·薄骨架收编（架构审查 P2 批 E1·2026-07-12）。
 *
 * 由来：采风/造册/编剧/绘舆（作图+草案两条）五条 loop 逐行同构地手抄了同一套骨架——begin/end 运行卡埋点、
 * ToolRegistry 装配、空转续轮门、「submit 成功即 terminate」afterToolResult hook、usage 累加、
 * runAgentRuntime 调用参数、超时/停止/未交稿三态失败文案分流、endSubagentRun 收尾。旧 subagentSpec 注册表
 * 整套退役后曾回退成手抄，代码形状证明 spec 化才是自然形态——本模块把这套同构骨架收成 `runSubagentLoop(spec)`。
 *
 * 边界：只收编五条 loop **共有**的机制；各自的 system 纲领、工具集装配、交稿工具 schema/校验、失败文案措辞、
 * endSubagentRun 载荷里 ok/error/output 怎么从家族结果对象取值——这些差异全部通过 spec 参数化，仍原样住在
 * 各自文件（caifengSubagent.ts/zaoceSubagent.ts/narrativeScriptwriterSubagent.ts/huiyuSubagent.ts）。
 * 编剧的 forced-call 结构化输出出口后处理（SCRIPT_REVISION_TOOL schema+校验+content-JSON 兜底）不属循环骨架，
 * 不在本模块之列。
 *
 * 已知的真实差异（非漂移·参数化保留）：
 * - `guardSubmitTerminate`：交稿工具 execute 成功（status:'success'）但家族 holder 仍可能没写入时
 *   （编剧 parseScriptwriterOutput 解析失败分支），terminate 前必须先确认 `isSubmitted()`；其余四条
 *   loop 的交稿工具 execute 总是无条件写 holder，terminate 天然无需守卫——默认值即为四家现状（无条件终止）。
 * - `extraHooks`：仅绘舆落笔轮多挂一个「按规则 ID 连续违规熔断器」（huiyuSubagent.ts 私有），
 *   追加在两件同构 hook 之后，与原 HookRegistry 数组顺序一致。
 * - `buildEndPayload`：家族各自决定 endSubagentRun 的 ok/error/output 怎么从自己的结果对象取
 *   （如绘舆用 `cardOk = ok || missingInfo 非空` 让"缺料交回"在运行卡上不显示为失败；编剧 output 用
 *   `holder.raw`——提交的原始 JSON 字符串，而非摘要文本），本模块不替家族做这个判断。
 */

import { ToolRegistry, type ToolDefinition } from './agentRuntime/toolRegistry'
import { HookRegistry, type HookDefinition } from './agentRuntime/hookRegistry'
import { runAgentRuntime, type AgentRuntimeProgressEvent } from './agentRuntime/runtime'
import { buildAgentRuntimeContextPolicy } from './agentRuntimeContextPolicy'
import { prepareAgentRuntimeJournalForHarness } from './agentRuntimeJournalPolicy'
import type { AgentTranscript, ToolResultMessage } from './agentRuntime/types'
import { createEmptyTurnContinuationGate } from './agentRuntime/continuationGate'
import {
  resolveAgentPromptSupplyTrace,
  resolveAgentRuntimeToolSupply,
  type AgentPromptSupplyCarrier
} from './agentSupply'
import type { AgentSupplyProfileId } from '../../shared/agentSupplyManifest'
import {
  appendSubagentRunTimeline,
  beginSubagentRun,
  endSubagentRun,
  settleSubagentRunTimelineTool,
  type SubagentRunPresentation,
  type SubagentRunUsage
} from './subagentRunStatus'
import {
  drainSubagentControlMessages,
  registerActiveSubagentControl
} from './agentRuntime/subagentControl'

/** loop 收束但未交稿时的三态归因（与五条 loop 现有的 timeout/aborted/其余三分支一一对应）。
 *  具体文案（如「钻取超时（30 分钟）」/「建栏被停止」）由各家 onNoSubmit 自己拼，本模块只给归因。 */
export type SubagentLoopNoSubmitReason = 'timeout' | 'aborted' | 'no-submit'

export interface SubagentLoopFailureDetail {
  graceFailed?: boolean
  /** 本次主运行声明的硬时限。 */
  timeoutMs: number
  /** 从运行卡开始到失败归因时的实际耗时。 */
  elapsedMs: number
  /** runtime 原始收束原因；父 Agent 可据此决定是否重派。 */
  terminalReason?: string
}

/** 交稿宽限轮归因（批K·2026-07-12 用户拍板）：budget=预算（轮数/工具调用数）耗尽；timeout=硬超时；
 *  no-submit=模型自然收束却始终没调交稿工具。aborted（用户主动停止）**绝不触发宽限**——不在本类型里。 */
export type SubagentGraceReason = 'budget' | 'timeout' | 'no-submit'

/** 宽限轮预算：一轮交稿调用 + 容一次参数纠错重交（maxToolCalls 2）；不嵌套宽限（宽限轮失败即按原失败路径收尾）。 */
const SUBMIT_GRACE_BUDGET = { maxTurns: 2, maxToolCalls: 2 }
/** 宽限轮自身硬超时：只做"用现有成果交稿"的补救调用，5 分钟足够——不给整段 30 分钟（主跑超时后再吊 30 分钟违背宽限本意）。 */
const SUBMIT_GRACE_TIMEOUT_MS = 5 * 60 * 1000

/** 子 agent loop 统一硬超时（2026-07-12 用户拍板：派子 agent 从各 loop 本地 5 分钟统一延长到 30 分钟；
 *  工具级默认超时同轮 120s→300s）。五条 loop（采风/绘舆作图/绘舆草案/编剧/造册）共用此值传 timeoutMs；
 *  导演级 loop（DIRECTOR_LOOP_TIMEOUT_MS=20 分钟）是另一档口径，不归这个常量管。 */
export const SUBAGENT_LOOP_TIMEOUT_MS = 30 * 60 * 1000

/** 工作流时间线的工具参数摘要上限（批G）：runtime 的 previewToolArgs 不截断（带全文给提调决策流），
 *  运行卡 timeline 只要一眼可辨，进时间线前钳到 120 字。 */
const TIMELINE_DETAIL_MAX_CHARS = 120

/** 「模型思考」工具行标签（耗时归因错位修复·2026-07-12）：模型调用是真正的耗时大头（工具执行多为毫秒级），
 *  必须有自己的一行——挂起时用户也能看到「模型思考…转圈中」。与 xingyiTurnStreamState 侧同一字面量，改动两处同步。 */
const TIMELINE_MODEL_THINKING_LABEL = '模型思考'

/** 家族 callModel 契约（五条 loop 现状同一形状）：管线注入的 balanced/smart 档模型调用，
 *  只暴露 messages/toolBriefs/toolCatalog，返回带 usage 供本模块累加。 */
export type SubagentLoopCallModel = (request: {
  messages: Array<{ role: 'system' | 'user' | 'assistant' | 'tool'; content: string }>
  toolBriefs: Array<{ name: string; brief: string; schema?: Record<string, unknown> }>
  toolCatalog?: Array<{ name: string; brief: string; recommended: boolean }>
  signal?: AbortSignal
}) => Promise<{ content: string; toolCalls: unknown[]; usage?: SubagentRunUsage }>

/** endSubagentRun 收尾载荷（家族 buildEndPayload 产物）：ok=false 时 error 应已带好家族自己的兜底文案
 *  （如「钻取失败」），本模块不再二次兜底；output 为空则不落运行卡「内部信息流·出侧」。 */
export interface SubagentLoopEndPayload {
  ok: boolean
  error?: string
  output?: string
}

export interface SubagentLoopRunMetrics {
  /** 第一份非空模型正文或工具调用返回到运行时的耗时。 */
  firstEffectiveOutputMs: number | null
  totalDurationMs: number
  /** 实际模型调用次数（含宽限轮与同轮结构化重试）。 */
  modelTurns: number
  /** runtime 真正执行并形成 toolResult 的次数，不按模型候选调用计。 */
  toolCalls: number
  /** retryable error 后，同一工具确实再次执行的次数。 */
  retryCount: number
  /** false 表示供应商没有回 usage；此时 0 不得解释成真实 cache miss。 */
  usageReported: boolean
  cacheReadReported: boolean
  cacheCreationReported: boolean
  usage?: SubagentRunUsage
}

export interface SubagentLoopRunResult {
  metrics: SubagentLoopRunMetrics
  /** 仅给家族做工具级指标；不替代 runtime transcript 保真账本。 */
  toolResults: Array<Pick<ToolResultMessage, 'toolName' | 'status' | 'error'>>
}

function createSubagentAbortError(reason?: unknown): Error {
  const error = new Error(
    typeof reason === 'string' && reason.trim()
      ? reason.trim()
      : '子 Agent 已由父 Agent 停止。'
  )
  error.name = 'AbortError'
  return error
}

/**
 * 旧家族的模型适配器未必已经把 signal 继续传到供应商。共享 loop 仍必须在父级中断后立即退出，
 * 不能被一个不消费 signal 的旧 Promise 挂住；底层适配器已消费 signal 时，这层只负责统一收口。
 */
async function awaitSubagentModelCall<T>(
  signal: AbortSignal,
  call: () => Promise<T>
): Promise<T> {
  if (signal.aborted) throw createSubagentAbortError(signal.reason)

  return await new Promise<T>((resolve, reject) => {
    let settled = false
    const finish = (callback: () => void) => {
      if (settled) return
      settled = true
      signal.removeEventListener('abort', onAbort)
      callback()
    }
    const onAbort = () => finish(() => reject(createSubagentAbortError(signal.reason)))

    signal.addEventListener('abort', onAbort, { once: true })
    call().then(
      (value) => finish(() => resolve(value)),
      (error) => finish(() => reject(error))
    )
  })
}

export interface SubagentLoopSpec extends AgentPromptSupplyCarrier {
  /** 正式供给身份；禁止按 agentName 猜 profile。 */
  profileId: AgentSupplyProfileId
  sessionId: string
  /** 运行卡键，如 `caifeng:3`（并行任务）或固定 id `scriptwriter`（单例）。 */
  subagentId: string
  /** begin 运行卡「内部信息流·入侧」原文（四家=user 消息正文；编剧例外=不含研究协议追加段的原始 brief）。 */
  loggedInput: string
  /** 统一顶部运行条的自描述信息；所有新子 Agent 必填，宿主不再维护业务专用展示映射。 */
  presentation: SubagentRunPresentation
  agentName: string
  runtimeVersion: string
  messages: Array<{ role: 'system' | 'user' | 'assistant' | 'tool'; content: string }>
  /** 只读/取证工具集（不含交稿工具）。 */
  tools: ToolDefinition[]
  /** 交稿工具（家族私有 holder 闭包·execute 写各自的结果对象）。 */
  submitTool: ToolDefinition
  submitToolName: string
  /** 交稿 holder 是否已写入：既是空转续轮门的 isFinished，也是交稿 terminate hook 的判定依据。 */
  isSubmitted: () => boolean
  /** 交稿 terminate 前是否需要先确认 isSubmitted()（默认 false=无条件终止，四家现状）；
   *  编剧因 execute 内部有「解析失败仍返回非 error」分支需要守卫，传 true。 */
  guardSubmitTerminate?: boolean
  nudgeId: string
  nudgeMaxCount: number
  buildNudgeText: () => string
  submitTerminateId: string
  submitTerminateSummary: string
  /** 家族专属额外 hook（目前仅绘舆落笔轮用），追加在两件同构 hook 之后。 */
  extraHooks?: HookDefinition[]
  budget: { maxTurns: number; maxToolCalls: number }
  timeoutMs: number
  signal?: AbortSignal
  callModel: SubagentLoopCallModel
  /** 首个有效输出的家族判定；缺省按任意非空正文或工具候选。只用于性能指标，不改变 loop。 */
  isEffectiveOutput?: (response: Awaited<ReturnType<SubagentLoopCallModel>>) => boolean
  /** 交稿宽限轮（批K·2026-07-12 用户拍板·opt-in）：主跑收束仍未交稿且归因是 budget/timeout/no-submit 时，
   *  带着主跑完整对话现场追加跑一个「只许交稿」的小 loop（activeTools 只剩交稿工具·预算 2 轮/2 调用·
   *  5 分钟超时·不嵌套宽限）——补交成功=正常交稿；补交也失败=原失败语义保留+onNoSubmit 收到
   *  graceFailed 标记。aborted（用户主动停止）绝不触发。buildNudge 的 failureHint=主跑最近一次交稿工具
   *  error 回执正文（如 validateArgs 报错），有就回灌给模型修参重交。 */
  submitGrace?: {
    submitToolName: string
    buildNudge: (reason: SubagentGraceReason, failureHint?: string) => string
  }
  /** loop 收束但未交稿时按归因分流——家族在回调里把失败文案+错误对象写进自己的 holder。
   *  detail.graceFailed=true（批K）：宽限轮也没补交成功，家族应在失败文案后追加「宽限轮补交稿也未成功」。 */
  onNoSubmit: (reason: SubagentLoopNoSubmitReason, detail: SubagentLoopFailureDetail) => void
  /** runAgentRuntime 抛错时的兜底——家族在回调里把「XX运行失败：message」写进自己的 holder。 */
  onCatchError: (message: string, detail: SubagentLoopFailureDetail) => void
  /** loop 结束（成功或失败）后读家族 holder，组装 endSubagentRun 载荷。 */
  buildEndPayload: () => SubagentLoopEndPayload
}

/**
 * 跑一次 subagent 小 loop（收编五条同构骨架）：begin 运行卡 → 装配 ToolRegistry/空转续轮门/交稿即
 * terminate hook/额外 hook → runAgentRuntime（callModel 包一层 usage 累加）→ 未交稿按超时/停止/其余
 * 三态归因回调 → 异常按 onCatchError 回调 → 读 buildEndPayload 收尾 endSubagentRun。
 * 本函数不返回家族结果——结果仍住在调用方自己的 holder 闭包里（与原五份手抄的读取方式一致）。
 */
export async function runSubagentLoop(spec: SubagentLoopSpec): Promise<SubagentLoopRunResult> {
  const startedAt = Date.now()
  const runController = new AbortController()
  const forwardAbort = () => runController.abort(spec.signal?.reason)
  if (spec.signal?.aborted) forwardAbort()
  else spec.signal?.addEventListener('abort', forwardAbort, { once: true })
  const unregisterControl = registerActiveSubagentControl({
    sessionId: spec.sessionId,
    subagentId: spec.subagentId,
    controller: runController
  })
  beginSubagentRun(spec.sessionId, spec.subagentId, {
    input: spec.loggedInput,
    presentation: spec.presentation
  })
  const usageTotal: SubagentRunUsage = { promptTokens: 0, completionTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 }
  let usageSeen = false
  let cacheReadSeen = false
  let cacheCreationSeen = false
  let firstEffectiveOutputMs: number | null = null
  let modelTurns = 0
  const executedToolResults: SubagentLoopRunResult['toolResults'] = []
  const collectToolResults = (transcript: AgentTranscript): void => {
    for (const turn of transcript.turns) {
      for (const result of turn.toolResults) {
        executedToolResults.push({
          toolName: result.toolName,
          status: result.status,
          ...(result.error ? { error: result.error } : {})
        })
      }
    }
  }
  // 工作流时间线（批G，耗时归因错位修复·2026-07-12）：把「第N轮/模型思考/工具调用」映射进运行卡 timeline
  // （五条 loop 统一受益，无家族特判）。
  // 根因：runtime（agentRuntime/runtime.ts）在模型调用**结束后**才发本轮首个 onProgress 事件（thought/
  // tool-start），若仍靠 onProgress 打轮标记，"第N轮"会打在模型调用之后、时长回填到下一轮首事件——
  // 实际测出的是"第N轮工具执行+第N+1轮模型思考"，整体错位一轮，且模型调用本身（真正的耗时大头）没有
  // 自己的行。改为轮标记与「模型思考」未定行都在 trackedCallModel 真正调用模型**之前**主动打——从此
  // 轮时长=自己的模型思考+自己的工具，归因正确；onProgress 首事件补轮标记逻辑保留作兜底（共享同一状态，
  // 正常不会重复 append）。
  // 轮序号/标签前缀提升到本函数作用域（主跑/宽限轮共享）：宽限轮开始前把前缀切「宽限轮·」、轮序号重置 -1，
  // 与原 buildTimelineProgressHandler('宽限轮·') 语义对齐。
  // 联动：映射语义与 xingyiTurnStreamState（星依浮坞轮流水）同构，改语义两处同步。
  let timelineTurnIndex = -1
  let timelineTurnLabelPrefix = ''
  const markTimelineTurnIfNew = (turnIndex: number): void => {
    if (turnIndex === timelineTurnIndex) return
    timelineTurnIndex = turnIndex
    appendSubagentRunTimeline(spec.sessionId, spec.subagentId, { kind: 'turn', label: `${timelineTurnLabelPrefix}第 ${turnIndex + 1} 轮` })
  }
  const onTimelineProgress = (event: AgentRuntimeProgressEvent): void => {
    // 兜底：正常情况轮标记已由 trackedCallModel 在模型调用前打好，这里 turnIndex 不变则 no-op。
    markTimelineTurnIfNew(event.turnIndex)
    if (event.kind === 'tool-start') {
      const detail = String(event.detail || '').slice(0, TIMELINE_DETAIL_MAX_CHARS)
      appendSubagentRunTimeline(spec.sessionId, spec.subagentId, {
        kind: 'tool',
        label: event.toolName,
        ...(detail ? { detail } : {})
      })
    } else if (event.kind === 'tool-result') {
      settleSubagentRunTimelineTool(spec.sessionId, spec.subagentId, event.toolName, event.status === 'success' ? 'success' : 'error')
    }
  }
  try {
    const registry = new ToolRegistry([...spec.tools, spec.submitTool])
    const toolSupply = resolveAgentRuntimeToolSupply(spec.profileId, registry)
    const promptSupplyTrace = resolveAgentPromptSupplyTrace(spec)
    const journalPreparation = await prepareAgentRuntimeJournalForHarness({
      profileId: spec.profileId,
      runtimeVersion: spec.runtimeVersion,
      traceIds: [spec.sessionId, spec.subagentId]
    })
    // 主跑交稿工具最近一次 error 回执捕捉（批K）：宽限轮 buildNudge 的 failureHint 来源——
    // validateArgs 报错走普通 executor 错误结果（非 blocked），会经 afterToolResult hook，这里能看到。
    let lastSubmitFailureHint = ''
    const hookRegistry = new HookRegistry([
      {
        id: `${spec.nudgeId}-parent-mailbox`,
        lifecycle: 'beforeModelCall',
        priority: 1,
        run: () => {
          const queued = drainSubagentControlMessages(spec.sessionId, spec.subagentId)
          if (!queued.length) return
          return {
            summary: `已接收父 Agent 追加指令 ${queued.length} 条`,
            injectMessages: [{
              role: 'user',
              purpose: 'stage-instruction',
              content: [
                '【父 Agent 追加指令】',
                ...queued.map((message, index) => `${index + 1}. ${message}`),
                '请从当前正式进度继续，优先应用这些新约束；已经完成且与新约束冲突的部分必须重新核对，不能把旧结果冒充新要求。'
              ].join('\n')
            }]
          }
        }
      },
      // 空转续轮门（共享内核）：没交稿就说完话不调工具 → 顶回去（限次·超限自然收束按未交稿处理）。
      createEmptyTurnContinuationGate({
        id: spec.nudgeId,
        isFinished: () => spec.isSubmitted(),
        maxNudges: spec.nudgeMaxCount,
        buildNudge: spec.buildNudgeText
      }),
      // 交稿即收束：交稿工具成功后干净 terminate（不浪费一轮等模型自然停）。
      {
        id: spec.submitTerminateId,
        lifecycle: 'afterToolResult',
        appliesTo: { toolName: spec.submitToolName, status: 'success' },
        run: () => (spec.guardSubmitTerminate && !spec.isSubmitted()
          ? {}
          : { summary: spec.submitTerminateSummary, terminate: true })
      },
      // 交稿失败回执捕捉（批K·只读不改结果）：给宽限轮 failureHint 用；无 submitGrace 时捕了也不消费，零行为影响。
      {
        id: `${spec.nudgeId}-submit-failure-capture`,
        lifecycle: 'afterToolResult',
        appliesTo: { toolName: spec.submitToolName, status: 'error' },
        run: (event) => { lastSubmitFailureHint = String(event.toolResult?.content || '').trim(); return undefined }
      },
      ...(spec.extraHooks ?? [])
    ])
    // usage 累加器包装（批K 抽出共用）：主跑与宽限轮共用同一个 usageTotal——宽限轮消耗自然计入本次 run。
    // 耗时归因错位修复：真正调用模型之前先打轮标记 + 追加「模型思考」未定行，调用结束/抛错后落定
    // （同轮结构化重试再调模型=再 append 一条「模型思考」行，如实反映多次调用，不做去重）。
    const trackedCallModel = async ({ messages, toolBriefs, toolCatalog, turnIndex }: {
      messages: unknown
      toolBriefs: Array<{ name: string; brief: string; schema?: Record<string, unknown> }>
      toolCatalog?: Array<{ name: string; brief: string; recommended: boolean }>
      turnIndex: number
    }) => {
      markTimelineTurnIfNew(turnIndex)
      appendSubagentRunTimeline(spec.sessionId, spec.subagentId, { kind: 'tool', label: TIMELINE_MODEL_THINKING_LABEL })
      try {
        modelTurns += 1
        const response = await awaitSubagentModelCall(
          runController.signal,
          () => spec.callModel({
            messages: messages as never,
            toolBriefs,
            ...(toolCatalog ? { toolCatalog } : {}),
            signal: runController.signal
          })
        )
        const effective = spec.isEffectiveOutput
          ? spec.isEffectiveOutput(response)
          : Boolean(String(response.content || '').trim() || response.toolCalls.length > 0)
        if (firstEffectiveOutputMs === null && effective) {
          firstEffectiveOutputMs = Date.now() - startedAt
        }
        settleSubagentRunTimelineTool(spec.sessionId, spec.subagentId, TIMELINE_MODEL_THINKING_LABEL, 'success')
        if (response.usage) {
          usageSeen = true
          if (response.usage.cacheReadTokens !== undefined) cacheReadSeen = true
          if (response.usage.cacheCreationTokens !== undefined) cacheCreationSeen = true
          usageTotal.promptTokens += response.usage.promptTokens || 0
          usageTotal.completionTokens += response.usage.completionTokens || 0
          usageTotal.cacheReadTokens = (usageTotal.cacheReadTokens || 0) + (response.usage.cacheReadTokens || 0)
          usageTotal.cacheCreationTokens = (usageTotal.cacheCreationTokens || 0) + (response.usage.cacheCreationTokens || 0)
        }
        return response
      } catch (error) {
        settleSubagentRunTimelineTool(spec.sessionId, spec.subagentId, TIMELINE_MODEL_THINKING_LABEL, 'error')
        throw error
      }
    }
    const result = await runAgentRuntime({
      agentName: spec.agentName,
      runtimeVersion: spec.runtimeVersion,
      messages: spec.messages,
      contextPressure: buildAgentRuntimeContextPolicy({
        scope: spec.profileId,
        runId: journalPreparation.runId,
        goal: spec.loggedInput,
        messages: spec.messages
      }),
      ...(journalPreparation.journal ? { journal: journalPreparation.journal } : {}),
      toolRegistry: registry,
      initialActiveTools: toolSupply.initialActiveTools,
      recommendedTools: toolSupply.recommendedTools,
      deferredToolMode: toolSupply.deferredToolMode,
      toolSupplyDiagnostics: toolSupply.diagnostics,
      ...(promptSupplyTrace ? { promptSupplyTrace } : {}),
      budget: spec.budget,
      timeoutMs: spec.timeoutMs,
      signal: runController.signal,
      hookRegistry,
      onProgress: onTimelineProgress,
      callModel: trackedCallModel
    })
    collectToolResults(result.transcript)
    if (!spec.isSubmitted()) {
      const terminalReason = result.transcript.terminalReason
      const noSubmitReason: SubagentLoopNoSubmitReason = terminalReason === 'timeout'
        ? 'timeout'
        : terminalReason === 'aborted'
          ? 'aborted'
          : 'no-submit'
      // 交稿宽限轮（批K）：aborted（用户主动停止）绝不给宽限；未启用 submitGrace 的家族行为不变。
      if (noSubmitReason === 'aborted' || !spec.submitGrace) {
        spec.onNoSubmit(noSubmitReason, {
          timeoutMs: spec.timeoutMs,
          elapsedMs: Date.now() - startedAt,
          terminalReason
        })
      } else {
        const graceReason: SubagentGraceReason = terminalReason === 'budget-exceeded'
          ? 'budget'
          : terminalReason === 'timeout'
            ? 'timeout'
            : 'no-submit'
        try {
          // 宽限现场=主跑完整对话 messages（runtime 返回值自带·原生 tool_calls 配对已由引擎收口保证）
          // + 一条「只许交稿」的 user 宽限指令（failureHint 非空=主跑交过但格式失败，回灌让模型修参重交）。
          const graceMessages = [
            ...result.messages,
            { role: 'user' as const, content: spec.submitGrace.buildNudge(graceReason, lastSubmitFailureHint || undefined) }
          ]
          // 宽限轮 runtime 的 turnIndex 从 0 重新计数，轮标签切「宽限轮·」前缀区分——与 onTimelineProgress/
          // trackedCallModel 共享同一份状态，切换后两者自动跟着用新前缀、不再各建各的独立计数。
          timelineTurnLabelPrefix = '宽限轮·'
          timelineTurnIndex = -1
          const graceJournalPreparation = await prepareAgentRuntimeJournalForHarness({
            profileId: spec.profileId,
            runtimeVersion: spec.runtimeVersion,
            runId: `${journalPreparation.runId}:grace`
          })
          const graceResult = await runAgentRuntime({
            agentName: spec.agentName,
            runtimeVersion: spec.runtimeVersion,
            messages: graceMessages,
            // 宽限轮会重送主跑表层（其中较早的 resultClampChars:null 结果可能仍是全文）：继续测压并剪枝新结果，
            // 但固定 2 轮/2 次工具的收尾不再重复建立语义 checkpoint。
            contextPressure: buildAgentRuntimeContextPolicy({
              scope: spec.profileId,
              runId: graceJournalPreparation.runId,
              goal: spec.loggedInput,
              messages: graceMessages,
              override: { semanticCompaction: { enabled: false } }
            }),
            ...(graceJournalPreparation.journal ? { journal: graceJournalPreparation.journal } : {}),
            toolRegistry: new ToolRegistry([spec.submitTool]),
            initialActiveTools: [spec.submitGrace.submitToolName],
            budget: SUBMIT_GRACE_BUDGET,
            timeoutMs: SUBMIT_GRACE_TIMEOUT_MS,
            signal: runController.signal,
            hookRegistry: new HookRegistry([
              // 宽限轮只挂交稿即 terminate（不挂空转续轮门——宽限指令本身就是最后通牒，不再劝）。
              {
                id: `${spec.submitTerminateId}-grace`,
                lifecycle: 'afterToolResult',
                appliesTo: { toolName: spec.submitToolName, status: 'success' },
                run: () => (spec.guardSubmitTerminate && !spec.isSubmitted()
                  ? {}
                  : { summary: `${spec.submitTerminateSummary}（宽限轮补交）`, terminate: true })
              }
            ]),
            onProgress: onTimelineProgress,
            callModel: trackedCallModel
          })
          collectToolResults(graceResult.transcript)
        } catch {
          // 宽限轮自身异常不产生新失败语义——按下方 isSubmitted 复查走原失败路径收尾。
        }
        // 补交成功=正常交稿（家族 holder 已由交稿工具写入，不走 onNoSubmit）；补交仍未成=原失败语义+grace 标记。
        if (!spec.isSubmitted()) spec.onNoSubmit(noSubmitReason, {
          graceFailed: true,
          timeoutMs: spec.timeoutMs,
          elapsedMs: Date.now() - startedAt,
          terminalReason
        })
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    spec.onCatchError(message, {
      timeoutMs: spec.timeoutMs,
      elapsedMs: Date.now() - startedAt
    })
  }
  unregisterControl()
  spec.signal?.removeEventListener('abort', forwardAbort)
  const payload = spec.buildEndPayload()
  const reportedUsage: SubagentRunUsage = {
    promptTokens: usageTotal.promptTokens,
    completionTokens: usageTotal.completionTokens,
    ...(cacheReadSeen ? { cacheReadTokens: usageTotal.cacheReadTokens || 0 } : {}),
    ...(cacheCreationSeen ? { cacheCreationTokens: usageTotal.cacheCreationTokens || 0 } : {})
  }
  endSubagentRun(spec.sessionId, spec.subagentId, {
    ok: payload.ok,
    ...(runController.signal.aborted && !payload.ok ? { cancelled: true } : {}),
    ...(payload.ok ? {} : { error: payload.error }),
    ...(payload.output ? { output: payload.output } : {}),
    ...(usageSeen ? { usage: reportedUsage } : {})
  })
  const retryableFailures = new Set<string>()
  let retryCount = 0
  const actualToolResults = executedToolResults.filter((result) => result.status !== 'blocked')
  for (const result of actualToolResults) {
    if (retryableFailures.has(result.toolName)) {
      retryCount += 1
      retryableFailures.delete(result.toolName)
    }
    if (result.status === 'error' && result.error?.retryable) retryableFailures.add(result.toolName)
  }
  return {
    metrics: {
      firstEffectiveOutputMs,
      totalDurationMs: Date.now() - startedAt,
      modelTurns,
      toolCalls: actualToolResults.length,
      retryCount,
      usageReported: usageSeen,
      cacheReadReported: cacheReadSeen,
      cacheCreationReported: cacheCreationSeen,
      ...(usageSeen ? { usage: { ...reportedUsage } } : {})
    },
    toolResults: executedToolResults
  }
}
