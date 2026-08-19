import type { AgentRuntimeMessage, RunAgentRuntimeInput } from './agentRuntime/runtime'

export type AgentRuntimeContextPressurePolicy = NonNullable<RunAgentRuntimeInput['contextPressure']>

export const AGENT_RUNTIME_CONTEXT_POLICY_DEFAULTS = Object.freeze({
  contextWindowTokens: 32_768,
  thresholdRatio: 0.78,
  reserveTokens: 4_096,
  toolResultPruning: Object.freeze({
    enabled: true,
    thresholdChars: 8_192,
    headChars: 4_096,
    tailChars: 1_024
  }),
  semanticCompaction: Object.freeze({
    enabled: true,
    recentTailItems: 12
  })
})

export interface AgentRuntimeContextPolicyOverride {
  contextWindowTokens?: number
  thresholdRatio?: number
  reserveTokens?: number
  toolResultPruning?: {
    enabled?: boolean
    thresholdChars?: number
    headChars?: number
    tailChars?: number
  }
  semanticCompaction?: {
    enabled?: boolean
    recentTailItems?: number
  }
}

export interface BuildAgentRuntimeContextPolicyInput {
  /** 固定 Agent/profile 名称，只用于本地 checkpoint 身份，不进入 Prompt。 */
  scope: string
  /** 宿主已有的正式运行 id；缺省时从已有 messages/goal 确定性派生。 */
  runId?: unknown
  /** 只能传调用方已有任务字段；缺省时复用最后一条既有 user message。 */
  goal?: unknown
  messages?: readonly Pick<AgentRuntimeMessage, 'role' | 'content'>[]
  override?: AgentRuntimeContextPolicyOverride
}

function text(value: unknown): string {
  return String(value ?? '').trim()
}

function positiveInteger(value: unknown, fallback: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : fallback
}

function nonNegativeInteger(value: unknown, fallback: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? Math.trunc(parsed) : fallback
}

function ratio(value: unknown, fallback: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 && parsed <= 1 ? parsed : fallback
}

function fnv1a32(value: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

function existingGoal(input: BuildAgentRuntimeContextPolicyInput): string {
  const explicitGoal = text(input.goal)
  if (explicitGoal) return explicitGoal
  const messages = input.messages || []
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role !== 'user') continue
    const goal = text(messages[index]?.content)
    if (goal) return goal
  }
  return ''
}

function stableRunId(input: BuildAgentRuntimeContextPolicyInput, goal: string): string {
  const provided = text(input.runId)
  if (provided) return provided
  const scope = text(input.scope).replace(/\s+/g, '-') || 'agent-runtime'
  const messages = (input.messages || []).map((message) => ({
    role: message.role,
    content: text(message.content)
  }))
  return `${scope}:${fnv1a32(JSON.stringify({ goal, messages }))}`
}

/**
 * 正式 Agent 的统一上下文压力策略。它只装配运行时配置，不写入或改写任何 Prompt 正文。
 * 本地 runId/digest 只用于 checkpoint 身份，不能作为供应商缓存命中证明。
 */
export function buildAgentRuntimeContextPolicy(
  input: BuildAgentRuntimeContextPolicyInput
): AgentRuntimeContextPressurePolicy {
  const override = input.override || {}
  const contextWindowTokens = positiveInteger(
    override.contextWindowTokens,
    AGENT_RUNTIME_CONTEXT_POLICY_DEFAULTS.contextWindowTokens
  )
  const goal = existingGoal(input)
  const runId = stableRunId(input, goal)
  const pruning = override.toolResultPruning || {}
  const semantic = override.semanticCompaction || {}

  return {
    contextWindowTokens,
    thresholdRatio: ratio(override.thresholdRatio, AGENT_RUNTIME_CONTEXT_POLICY_DEFAULTS.thresholdRatio),
    reserveTokens: Math.min(
      contextWindowTokens,
      nonNegativeInteger(override.reserveTokens, AGENT_RUNTIME_CONTEXT_POLICY_DEFAULTS.reserveTokens)
    ),
    toolResultPruning: {
      enabled: pruning.enabled ?? AGENT_RUNTIME_CONTEXT_POLICY_DEFAULTS.toolResultPruning.enabled,
      thresholdChars: positiveInteger(
        pruning.thresholdChars,
        AGENT_RUNTIME_CONTEXT_POLICY_DEFAULTS.toolResultPruning.thresholdChars
      ),
      headChars: positiveInteger(
        pruning.headChars,
        AGENT_RUNTIME_CONTEXT_POLICY_DEFAULTS.toolResultPruning.headChars
      ),
      tailChars: positiveInteger(
        pruning.tailChars,
        AGENT_RUNTIME_CONTEXT_POLICY_DEFAULTS.toolResultPruning.tailChars
      )
    },
    semanticCompaction: {
      enabled: semantic.enabled ?? AGENT_RUNTIME_CONTEXT_POLICY_DEFAULTS.semanticCompaction.enabled,
      runId,
      goal,
      recentTailItems: positiveInteger(
        semantic.recentTailItems,
        AGENT_RUNTIME_CONTEXT_POLICY_DEFAULTS.semanticCompaction.recentTailItems
      )
    }
  }
}
