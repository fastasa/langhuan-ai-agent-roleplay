import type { AgentContextPerspective, AgentContextProjectionKind } from './agentContextProjection.js'

export const AGENT_CONTEXT_KINDS = [
  'tidiao',
  'scriptwriter',
  'scriptwriter_workspace',
  'caifeng',
  'xingyi',
  'focused_action',
  'role_reply',
  'zaoce',
  'huiyu_dispatch',
  'huiyu_workspace'
] as const
export type AgentContextAgentKind = (typeof AGENT_CONTEXT_KINDS)[number]
export type AgentContextFailurePolicy = 'abort' | 'explicit_unavailable' | 'continue_without_optional'

export type AgentContextProjectionRequest = {
  kind: AgentContextProjectionKind
  maxItems?: number
  maxChars?: number
}

export type AgentContextRecipe = {
  agentKind: AgentContextAgentKind
  version: string
  perspective: 'system_director' | 'user' | 'character'
  required: AgentContextProjectionRequest[]
  optional: AgentContextProjectionRequest[]
  preloadBudget: { maxItems: number; maxChars: number }
  detailTools: string[]
  failurePolicy: AgentContextFailurePolicy
  rendererVersion: string
}

export const AGENT_CONTEXT_RECIPES: Readonly<Record<AgentContextAgentKind, AgentContextRecipe>> = {
  tidiao: {
    agentKind: 'tidiao', version: 'v1', perspective: 'system_director',
    required: [{ kind: 'chat.visible_context', maxItems: 24 }, { kind: 'session.world_context' }, { kind: 'session.cast_presence' }, { kind: 'orchestration.workspace' }],
    optional: [{ kind: 'status.panel_catalog' }, { kind: 'world.narrative_seeds', maxItems: 8 }],
    preloadBudget: { maxItems: 80, maxChars: 24000 }, detailTools: ['readChatMessage', 'readMessageProjection', 'readStatusPanels', 'readNarrativeSeed', 'dispatchResearch'],
    failurePolicy: 'explicit_unavailable', rendererVersion: 'agent-context-renderer-v1'
  },
  scriptwriter: {
    agentKind: 'scriptwriter', version: 'v1', perspective: 'system_director',
    required: [{ kind: 'chat.visible_context', maxItems: 32 }, { kind: 'session.world_context' }, { kind: 'session.cast_presence' }, { kind: 'world.narrative_seeds', maxItems: 8 }],
    optional: [{ kind: 'status.panel_catalog' }, { kind: 'character.private_profile' }, { kind: 'character.observable_profile' }, { kind: 'orchestration.workspace' }],
    preloadBudget: { maxItems: 120, maxChars: 32000 }, detailTools: ['readChatMessage', 'readNarrativeSeed', 'readStatusPanels', 'dispatchResearch'],
    failurePolicy: 'abort', rendererVersion: 'agent-context-renderer-v1'
  },
  scriptwriter_workspace: {
    agentKind: 'scriptwriter_workspace', version: 'v1', perspective: 'system_director',
    required: [{ kind: 'session.world_context' }, { kind: 'world.narrative_seeds', maxItems: 24 }],
    optional: [{ kind: 'world.knowledge_scope' }, { kind: 'session.cast_presence' }, { kind: 'status.panel_catalog' }, { kind: 'character.private_profile' }],
    preloadBudget: { maxItems: 96, maxChars: 30000 }, detailTools: ['readNarrativeSeedDetail', 'searchWorldText', 'readStatusPanels'],
    failurePolicy: 'abort', rendererVersion: 'agent-context-renderer-v1'
  },
  caifeng: {
    agentKind: 'caifeng', version: 'v1', perspective: 'system_director',
    required: [{ kind: 'chat.visible_context', maxItems: 8 }, { kind: 'session.world_context' }],
    optional: [{ kind: 'world.knowledge_scope' }, { kind: 'session.cast_presence' }],
    preloadBudget: { maxItems: 32, maxChars: 12000 }, detailTools: ['searchChatProjection', 'readChatMessage', 'readMessageProjection', 'readStatusPanels', 'searchWorldText', 'fetchUnitDetail', 'recallCharacterBrain'],
    failurePolicy: 'explicit_unavailable', rendererVersion: 'agent-context-renderer-v1'
  },
  xingyi: {
    agentKind: 'xingyi', version: 'v1', perspective: 'system_director',
    required: [{ kind: 'session.world_context' }], optional: [{ kind: 'chat.visible_context', maxItems: 12 }, { kind: 'world.knowledge_scope' }, { kind: 'session.cast_presence' }],
    preloadBudget: { maxItems: 48, maxChars: 16000 }, detailTools: ['searchChatProjection', 'readChatProjection', 'searchWorldText', 'readStatusPanels'],
    failurePolicy: 'explicit_unavailable', rendererVersion: 'agent-context-renderer-v1'
  },
  focused_action: {
    agentKind: 'focused_action', version: 'v1', perspective: 'system_director',
    required: [{ kind: 'chat.visible_context', maxItems: 10 }, { kind: 'session.world_context' }],
    optional: [{ kind: 'character.observable_profile' }, { kind: 'status.panels' }, { kind: 'session.cast_presence' }],
    preloadBudget: { maxItems: 40, maxChars: 12000 }, detailTools: ['readChatMessage', 'readStatusPanels'],
    failurePolicy: 'explicit_unavailable', rendererVersion: 'focused-action-context-renderer-v1'
  },
  role_reply: {
    agentKind: 'role_reply', version: 'v1', perspective: 'character',
    required: [{ kind: 'chat.visible_context', maxItems: 24 }, { kind: 'session.world_context' }, { kind: 'character.knowledge' }],
    optional: [{ kind: 'game.rimworld_pawn' }, { kind: 'character.observable_profile' }, { kind: 'character.private_profile' }, { kind: 'status.panels' }],
    preloadBudget: { maxItems: 64, maxChars: 20000 }, detailTools: ['recallCharacterBrain'],
    failurePolicy: 'abort', rendererVersion: 'agent-context-renderer-v1'
  },
  zaoce: {
    agentKind: 'zaoce', version: 'v1', perspective: 'system_director',
    required: [{ kind: 'session.world_context' }],
    optional: [
      { kind: 'status.panel_catalog' },
      { kind: 'session.cast_presence' },
      { kind: 'character.private_profile' },
      { kind: 'character.observable_profile' },
      { kind: 'world.knowledge_scope' },
      { kind: 'chat.visible_context', maxItems: 12 }
    ],
    preloadBudget: { maxItems: 72, maxChars: 24000 },
    detailTools: ['readStatusPanels', 'readChatMessage', 'readMessageProjection', 'searchWorldText', 'fetchUnitDetail', 'recallCharacterBrain'],
    failurePolicy: 'abort', rendererVersion: 'agent-context-renderer-v1'
  },
  huiyu_dispatch: {
    agentKind: 'huiyu_dispatch', version: 'v1', perspective: 'system_director',
    required: [{ kind: 'session.world_context' }],
    optional: [
      { kind: 'chat.visible_context', maxItems: 12 },
      { kind: 'session.cast_presence' },
      { kind: 'world.narrative_seeds', maxItems: 8 },
      { kind: 'world.knowledge_scope' }
    ],
    preloadBudget: { maxItems: 72, maxChars: 24000 }, detailTools: ['readMapSummary', 'readMapManual', 'readChatMessage', 'searchWorldText'],
    failurePolicy: 'abort', rendererVersion: 'agent-context-renderer-v1'
  },
  huiyu_workspace: {
    agentKind: 'huiyu_workspace', version: 'v1', perspective: 'system_director',
    required: [{ kind: 'session.world_context' }],
    optional: [{ kind: 'world.knowledge_scope' }, { kind: 'world.narrative_seeds', maxItems: 8 }, { kind: 'session.cast_presence' }],
    preloadBudget: { maxItems: 48, maxChars: 18000 }, detailTools: ['readMapSummary', 'readMapManual', 'readNarrativeSeed'],
    failurePolicy: 'abort', rendererVersion: 'agent-context-renderer-v1'
  }
}

export function getAgentContextRecipe(agentKind: AgentContextAgentKind): AgentContextRecipe {
  const recipe = AGENT_CONTEXT_RECIPES[agentKind]
  if (!recipe) throw new Error(`未知 Agent 上下文配方：${String(agentKind)}`)
  return recipe
}

export function resolveAgentContextPerspective(recipe: AgentContextRecipe, characterId = ''): AgentContextPerspective {
  if (recipe.perspective === 'character') {
    const normalizedCharacterId = String(characterId || '').trim()
    if (!normalizedCharacterId) throw new Error(`${recipe.agentKind} 配方需要 characterId`)
    return { kind: 'character', characterId: normalizedCharacterId }
  }
  return { kind: recipe.perspective }
}
