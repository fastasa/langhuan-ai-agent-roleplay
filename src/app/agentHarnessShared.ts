/**
 * 星依/编剧/舆图师三个独立 harness 共用的最小工具集（原为三处手抄副本，收编于 2026-07-17）。
 */
import type {
  AgentRuntimeMessage,
  AgentRuntimeProgressEvent,
  RunAgentRuntimeResult
} from './agentRuntime/runtime'
import type { AgentTaskTodoSnapshot } from './agentRuntime/taskTodo'
import type { AgentSubagentWaitCapability } from './agentRuntime/subagentWait'
import type { AgentSubagentControlCapability } from './agentRuntime/subagentControl'
import { runAgentRuntime } from './agentRuntime/runtime'
import { buildAgentRuntimeContextPolicy } from './agentRuntimeContextPolicy'
import { prepareAgentRuntimeJournalForHarness } from './agentRuntimeJournalPolicy'
import type { AgentTranscript } from './agentRuntime/types'
import { ToolRegistry, type ToolDefinition, type ToolExecutionResult } from './agentRuntime/toolRegistry'
import { HookRegistry } from './agentRuntime/hookRegistry'
import { createEmptyTurnContinuationGate, isAgentTurnUnfinished } from './agentRuntime/continuationGate'
import {
  resolveAgentPromptSupplyTrace,
  resolveAgentRuntimeToolSupply,
  type AgentPromptSupplyCarrier
} from './agentSupply'
import type { AgentSupplyProfileId } from '../../shared/agentSupplyManifest'
import type { AgentTurnStreamController } from './agentTurnStream'

export { AGENT_CONTINUATION_INTENT, isAgentTurnUnfinished } from './agentRuntime/continuationGate'

/** 从末尾往前找第一条非空模型正文，作为本轮最终回复。 */
export function extractAgentReply(turns: Array<{ modelMessage: { content?: string }; toolCalls: unknown[] }>): string {
  for (let index = turns.length - 1; index >= 0; index -= 1) {
    const content = String(turns[index]?.modelMessage?.content ?? '').trim()
    if (content) return content
  }
  return ''
}

export function extractAgentRuntimeReply(
  result: Pick<RunAgentRuntimeResult, 'transcript' | 'taskTodo'>
): string {
  // 静默候报不是一条面向用户的最终答复。工具结果已进入过程轨；父 Agent 由子 Agent
  // 终态事件重新唤醒，不把调用候报前的过程正文再复制成一个 stale 助手气泡。
  if (result.transcript.terminalReason === 'awaiting-subagent') return ''
  const openItems = result.taskTodo.items.filter((item) => item.status !== 'completed')
  if (result.transcript.terminalReason === 'budget-exceeded' && openItems.length) {
    const labels = openItems.map((item) => `${item.id}「${item.text}」`).join('、')
    return `本轮已到安全执行上限，待办仍有 ${openItems.length} 项未完成（${labels}）。这次没有把任务标记为完成，进度已经保留；下一轮必须从这些待办继续。`
  }
  return extractAgentReply(result.transcript.turns)
}

export function invalidArgs(message: string): ToolExecutionResult {
  return { content: message, status: 'error', error: { type: 'INVALID_ARGUMENT', message, retryable: true } }
}

export function runtimeError(message: string, retryable = false): ToolExecutionResult {
  return { content: message, status: 'error', error: { type: 'TOOL_RUNTIME_ERROR', message, retryable } }
}

export interface WorkspaceAgentOrchestratorRequest {
  messages: AgentRuntimeMessage[]
  toolBriefs: Array<{ name: string; brief: string; schema?: Record<string, unknown> }>
  toolCatalog?: Array<{ name: string; brief: string; recommended: boolean }>
  turnIndex: number
}

export interface RunWorkspaceAgentRuntimeInput extends AgentPromptSupplyCarrier {
  profileId: AgentSupplyProfileId
  agentName: string
  /** continuationGate 的 hook id，各 harness 各自一份（用于日志/调试区分来源）。 */
  gateId: string
  /** 续轮护栏话术里"你刚说要去 XXX"的动词片段；编剧=核对/确认/修改，舆图师=核对/确认/画/改，其余文案逐字共享。 */
  nudgeActionHint: string
  messages: AgentRuntimeMessage[]
  tools: ToolDefinition[]
  callOrchestrator: (request: WorkspaceAgentOrchestratorRequest) => Promise<{ content: string; toolCalls: unknown[] } | null>
  signal?: AbortSignal
  onProgress?: (event: AgentRuntimeProgressEvent) => void
  /** 模型先向用户报进度、同轮继续执行时，把这句立即送到对话框。 */
  onIntermediateMessage?: (message: { content: string; turnIndex: number }) => void | Promise<void>
  /** 当前对话上一轮保存的 TODO；停止后补充消息时续接。 */
  initialTaskTodo?: AgentTaskTodoSnapshot | null
  /** 当前对话已通过 toolsearch 激活的业务工具；runtime 会与真实 registry 取交集。 */
  initialDeferredActiveTools?: readonly string[]
  /** 已激活业务工具集合发生变化时同步保存。 */
  onDeferredActiveToolsChange?: (toolNames: string[]) => void
  /** 共享 runtime 当前对话 TODO 快照；有输入框的宿主用它驱动同一张进度卡。 */
  onTaskTodoChange?: (snapshot: AgentTaskTodoSnapshot) => void
  /** 当前宿主可验证的后台子 Agent 候报能力；未传时 runtime 不暴露候报工具。 */
  subagentWait?: AgentSubagentWaitCapability
  /** 当前父会话自己的子 Agent 控制能力；与候报一样由宿主按会话注入。 */
  subagentControl?: AgentSubagentControlCapability
  /** 对话信息流写口；传入后模型思考与 runtime 工具事件按星依浮坞权威语义完整记录。 */
  turnStream?: AgentTurnStreamController
  budget?: { maxTurns?: number; maxToolCalls?: number }
}

export interface RunWorkspaceAgentRuntimeResult {
  reply: string
  terminalReason: string
  transcript: AgentTranscript
}

/** 编剧/舆图师（未来其他工作区专业Agent）共用的驱动尾块：HookRegistry续轮护栏 + runAgentRuntime 组装 + 回执提取。
 *  原为两处逐字重复副本（scriptwriterAgentHarness.ts/cartographerAgentHarness.ts），只差 agentName/gateId/
 *  nudge 文案里一个动词片段，收编于 2026-07-17（地图与剧本工作区专业Agent计划批B）。 */
export async function runWorkspaceAgentRuntime(input: RunWorkspaceAgentRuntimeInput): Promise<RunWorkspaceAgentRuntimeResult> {
  const runtimeVersion = 'agent-runtime-batch1'
  const toolRegistry = new ToolRegistry(input.tools)
  const toolSupply = resolveAgentRuntimeToolSupply(input.profileId, toolRegistry)
  const promptSupplyTrace = resolveAgentPromptSupplyTrace(input)
  const continuationGate = new HookRegistry([
    createEmptyTurnContinuationGate({
      id: input.gateId,
      maxNudges: 2,
      isFinished: (event) => !isAgentTurnUnfinished(String(event.modelMessage?.content ?? '')),
      buildNudge: () => `你这一步只说了话，没有真正调用任何工具。如果你还有没做完的事（比如你刚说要去${input.nudgeActionHint}），就现在直接调用对应工具去做；如果确实不需要修改，直接正常给用户最终答复即可（这一步不用再调工具）。`
    })
  ])
  const journalPreparation = await prepareAgentRuntimeJournalForHarness({
    profileId: input.profileId,
    runtimeVersion,
    traceIds: [input.agentName, input.gateId]
  })

  const runtimeResult = await runAgentRuntime({
    agentName: input.agentName,
    runtimeVersion,
    messages: input.messages,
    contextPressure: buildAgentRuntimeContextPolicy({
      scope: input.profileId,
      runId: journalPreparation.runId,
      messages: input.messages
    }),
    ...(journalPreparation.journal ? { journal: journalPreparation.journal } : {}),
    toolRegistry,
    hookRegistry: continuationGate,
    initialActiveTools: toolSupply.initialActiveTools,
    recommendedTools: toolSupply.recommendedTools,
    deferredToolMode: toolSupply.deferredToolMode,
    toolSupplyDiagnostics: toolSupply.diagnostics,
    ...(promptSupplyTrace ? { promptSupplyTrace } : {}),
    ...(input.budget ? { budget: input.budget } : {}),
    ...(input.signal ? { signal: input.signal } : {}),
    ...(input.onIntermediateMessage ? { onIntermediateMessage: input.onIntermediateMessage } : {}),
    ...(input.initialTaskTodo !== undefined ? { initialTaskTodo: input.initialTaskTodo } : {}),
    ...(input.initialDeferredActiveTools
      ? { initialDeferredActiveTools: input.initialDeferredActiveTools }
      : {}),
    ...(input.onDeferredActiveToolsChange
      ? { onDeferredActiveToolsChange: input.onDeferredActiveToolsChange }
      : {}),
    ...(input.onTaskTodoChange ? { onTaskTodoChange: input.onTaskTodoChange } : {}),
    ...(input.subagentWait ? { subagentWait: input.subagentWait } : {}),
    ...(input.subagentControl ? { subagentControl: input.subagentControl } : {}),
    ...((input.onProgress || input.turnStream) ? {
      onProgress: (event: AgentRuntimeProgressEvent) => {
        input.turnStream?.feedProgress(event)
        input.onProgress?.(event)
      }
    } : {}),
    callModel: async ({ messages: turnMessages, toolBriefs, toolCatalog, turnIndex }) => {
      const call = () => input.callOrchestrator({
        messages: turnMessages,
        toolBriefs,
        ...(toolCatalog ? { toolCatalog } : {}),
        turnIndex
      })
      const result = input.turnStream
        ? await input.turnStream.trackModelCall(turnIndex, call)
        : await call()
      return { content: result?.content ?? '', toolCalls: result?.toolCalls ?? [] }
    }
  })
  const { transcript } = runtimeResult

  return {
    reply: extractAgentRuntimeReply(runtimeResult),
    terminalReason: transcript.terminalReason,
    transcript
  }
}
