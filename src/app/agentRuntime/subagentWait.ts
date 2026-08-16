import type { ToolDefinition } from './toolRegistry'

export const WAIT_FOR_SUBAGENT_REPORT_TOOL_NAME = 'waitForSubagentReport'

export interface AgentSubagentWaitRequest {
  taskIds: string[]
  reason: string
}

export interface AgentSubagentWaitValidation {
  ok: boolean
  /** 实际仍在运行、且本父会话可以收到终态回报的任务。 */
  runningTaskIds?: string[]
  message?: string
}

/**
 * 后台子 Agent 候报能力由宿主显式注入：runtime 只负责终态，不猜业务任务是否还在运行、
 * 是否有正式回报通道。没有该能力的 Agent 不会看到候报工具。
 */
export interface AgentSubagentWaitCapability {
  validate(
    request: AgentSubagentWaitRequest
  ): AgentSubagentWaitValidation | Promise<AgentSubagentWaitValidation>
}

function normalizeText(value: unknown, limit: number): string {
  return String(value ?? '').replace(/\s+/gu, ' ').trim().slice(0, limit)
}

function normalizeTaskIds(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return Array.from(new Set(
    value
      .map((item) => normalizeText(item, 180))
      .filter(Boolean)
  )).slice(0, 8)
}

export function buildWaitForSubagentReportTool(
  capability: AgentSubagentWaitCapability
): ToolDefinition {
  return {
    name: WAIT_FOR_SUBAGENT_REPORT_TOOL_NAME,
    brief: [
      '主动进入后台子 Agent 静默候报。只有当当前仍有可回报的后台子 Agent 在运行，',
      '而且你已经完成所有不依赖它的核对、整理、预处理和其它 TODO，剩余工作全部依赖这些任务时才调用。',
      '如果还有能独立推进的事就继续做，不要调用本工具；也禁止反复读取状态来轮询。',
      '成功后当前前台 loop 以 awaiting-subagent 结束，TODO 保留、后台子 Agent 不停止，终态回报会另行唤醒父 Agent。'
    ].join(''),
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        taskIds: {
          type: 'array',
          minItems: 1,
          maxItems: 8,
          items: { type: 'string' },
          description: '本次要等待的后台任务 ID；必须来自派遣工具的正式 running 回执。'
        },
        reason: {
          type: 'string',
          description: '为什么当前剩余工作全部依赖这些后台结果；不要只写“等一下”。'
        }
      },
      required: ['taskIds', 'reason']
    },
    validateArgs: (args) => {
      if (!normalizeTaskIds(args.taskIds).length) return 'taskIds 至少包含一个后台任务 ID'
      if (!normalizeText(args.reason, 360)) return 'reason 必填：说明为什么当前只剩后台依赖'
      return null
    },
    execute: async (call) => {
      const request: AgentSubagentWaitRequest = {
        taskIds: normalizeTaskIds(call.args.taskIds),
        reason: normalizeText(call.args.reason, 360)
      }
      const validation = await capability.validate(request)
      if (!validation.ok) {
        const message = normalizeText(validation.message, 600)
          || '这些任务已经不在运行，或没有可验证的终态回报通道；请直接消费最新正式回报，不要进入静默等待。'
        return {
          content: message,
          status: 'error',
          error: {
            type: 'EXPECTATION_MISMATCH',
            message,
            retryable: true
          },
          details: {
            kind: 'agentSubagentWaitRejected',
            taskIds: request.taskIds,
            runningTaskIds: validation.runningTaskIds ?? []
          },
          acted: false
        }
      }
      const runningTaskIds = normalizeTaskIds(validation.runningTaskIds?.length
        ? validation.runningTaskIds
        : request.taskIds)
      const accepted: AgentSubagentWaitRequest = {
        taskIds: runningTaskIds,
        reason: request.reason
      }
      return {
        content: `已进入静默候报：${runningTaskIds.join('、')}。当前前台不再轮询；TODO 保留，后台终态回报会唤醒父 Agent。`,
        status: 'success',
        details: {
          kind: 'agentSubagentWait',
          taskIds: runningTaskIds,
          reason: request.reason
        },
        awaitingSubagent: accepted,
        acted: false
      }
    }
  }
}

export function isAgentSubagentWaitTool(name: string): boolean {
  return String(name || '').trim() === WAIT_FOR_SUBAGENT_REPORT_TOOL_NAME
}
