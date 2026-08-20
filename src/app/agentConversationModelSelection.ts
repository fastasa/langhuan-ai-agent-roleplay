import type { AgentSessionKind } from '../../shared/agentSessionKinds'
import type {
  AgentModelConfig,
  ModelReasoningEffort,
  ModelUsageConfig,
  ModelUsageSlotId
} from '../types'
import {
  buildModelUsageAiOptions,
  normalizeModelReasoningEffort
} from '../utils/modelUsageConfig'

export type AgentConversationModelSlotId = Extract<ModelUsageSlotId, 'fast' | 'balanced' | 'smart'>

export interface AgentConversationModelSelection {
  slotId: AgentConversationModelSlotId
  effort: ModelReasoningEffort
}

export const AGENT_CONVERSATION_MODEL_SLOTS: readonly AgentConversationModelSlotId[] = [
  'fast',
  'balanced',
  'smart'
]

const DEFAULT_SLOT_BY_AGENT: Record<AgentSessionKind, AgentConversationModelSlotId> = {
  xingyi: 'smart',
  scriptwriter: 'balanced',
  cartographer: 'smart',
  personality_trainer: 'smart'
}

export function createDefaultAgentConversationModelSelection(
  agentKind: AgentSessionKind
): AgentConversationModelSelection {
  return {
    slotId: DEFAULT_SLOT_BY_AGENT[agentKind] || 'smart',
    effort: ''
  }
}

export function normalizeAgentConversationModelSelection(
  value: unknown,
  agentKind: AgentSessionKind
): AgentConversationModelSelection {
  const fallback = createDefaultAgentConversationModelSelection(agentKind)
  const record = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  const slotId = AGENT_CONVERSATION_MODEL_SLOTS.includes(record.slotId as AgentConversationModelSlotId)
    ? record.slotId as AgentConversationModelSlotId
    : fallback.slotId
  return {
    slotId,
    effort: normalizeModelReasoningEffort(record.effort)
  }
}

/** Agent 主循环模型：对话选择覆盖静态任务档，温度/token/thinking 仍由调用点控制。 */
export function buildAgentConversationModelAiOptions(
  agentConfig: Partial<AgentModelConfig> | null | undefined,
  selection: AgentConversationModelSelection,
  overrides: Partial<Pick<ModelUsageConfig, 'maxTokens' | 'temperature' | 'thinking'>> = {}
) {
  const effort = normalizeModelReasoningEffort(selection.effort)
  return buildModelUsageAiOptions(agentConfig, selection.slotId, {
    ...overrides,
    ...(effort ? { effort } : {})
  })
}
