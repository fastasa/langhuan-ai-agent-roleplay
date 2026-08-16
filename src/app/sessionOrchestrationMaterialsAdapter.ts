// 会话正式编排资料适配器：只读写服务端正式资料，不再消费旧 localStorage 缓存。
import type { SessionOrchestrationMaterials } from '../types'
import {
  fetchSessionOrchestrationMaterials,
  saveSessionNarrativeOverride,
  saveSessionOrchestrationState
} from '../repositories/chatRepository'

const hydratedMaterials = new Map<string, SessionOrchestrationMaterials>()

export async function loadSessionOrchestrationMaterials(sessionId: string): Promise<{
  materials: SessionOrchestrationMaterials
  source: 'server'
}> {
  const materials = await fetchSessionOrchestrationMaterials(sessionId)
  hydratedMaterials.set(sessionId, materials)
  return { materials, source: 'server' }
}

export async function hydrateSessionOrchestrationMaterials(sessionId: string) {
  return loadSessionOrchestrationMaterials(String(sessionId || '').trim())
}

export function peekHydratedSessionOrchestrationMaterials(sessionId: string): SessionOrchestrationMaterials | null {
  return hydratedMaterials.get(String(sessionId || '').trim()) || null
}

export function getHydratedNarrativeOverrideText(sessionId: string): string {
  return String(peekHydratedSessionOrchestrationMaterials(sessionId)?.narrativeOverride?.content || '').trim()
}

export function getHydratedLastScenario(sessionId: string) {
  const state = peekHydratedSessionOrchestrationMaterials(sessionId)?.state
  return state ? {
    code: state.scenarioCode,
    ...(state.scenarioLabel ? { label: state.scenarioLabel } : {}),
    ...(state.scenarioSummary ? { summary: state.scenarioSummary } : {})
  } : null
}

export async function saveFormalSessionScenario(sessionId: string, input: {
  code: string
  label?: string
  summary?: string
  anchorMessageId?: string
  sourceArtifactId?: string
}) {
  const sid = String(sessionId || '').trim()
  const materials = peekHydratedSessionOrchestrationMaterials(sid)
  if (!sid || !materials || (!input.anchorMessageId && !input.sourceArtifactId)) return null
  const state = await saveSessionOrchestrationState(sid, {
    scenarioCode: input.code,
    scenarioLabel: input.label || '',
    scenarioSummary: input.summary || '',
    anchorMessageId: input.anchorMessageId || '',
    sourceArtifactId: input.sourceArtifactId || '',
    expectedVersion: materials.state?.version || 0,
    source: 'director_artifact'
  })
  materials.state = state
  return state
}

export const sessionOrchestrationMaterialsWrites = {
  saveNarrativeOverride: saveSessionNarrativeOverride,
  saveState: saveSessionOrchestrationState
}
