import { fetchAgentContextBundle } from '../../repositories/chatRepository'
import type { AgentContextBundle } from '../../../shared/agentContextProjection'
import type { AgentContextAgentKind } from '../../../shared/agentContextRecipes'
import { renderAgentContextBundle } from './renderAgentContext'

export type AgentContextProviderInput = {
  sessionId: string
  agentKind: AgentContextAgentKind
  characterId?: string
  anchorMessageId?: number
  userText?: string
  roundCandidateIds?: string[]
  forcedCharacterIds?: string[]
}

export async function loadAgentContextBundle(input: AgentContextProviderInput): Promise<AgentContextBundle> {
  return fetchAgentContextBundle(input)
}

export async function loadRenderedAgentContext(input: AgentContextProviderInput): Promise<{ bundle: AgentContextBundle; text: string }> {
  const bundle = await loadAgentContextBundle(input)
  return { bundle, text: renderAgentContextBundle(bundle) }
}
