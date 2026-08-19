// 会话正式编排资料适配器：只读写服务端正式资料，不再消费旧 localStorage 缓存。
import type { SessionOrchestrationMaterials } from '../types'
import {
  type ReplySituationCheckpoint,
  type ReplySituationDependencySnapshot
} from './replyOrchestrationRoute'
import {
  fetchSessionOrchestrationMaterials,
  saveSessionNarrativeOverride,
  saveSessionOrchestrationState
} from '../repositories/chatRepository'

const hydratedMaterials = new Map<string, SessionOrchestrationMaterials>()
const hydratedScenarioCheckpoints = new Map<string, {
  stateIdentity: string
  checkpoint: ReplySituationCheckpoint
}>()

/**
 * 正式状态表目前要求 scenarioCode 非空，因此清除检查点以一条显式 tombstone 落库。
 * 读侧只认非 tombstone 为可复用情境；刷新、换窗口后也不会复活失效前的旧 checkpoint。
 */
export const INVALIDATED_REPLY_SITUATION_CODE = '__reply_situation_invalidated__' as const
const INVALIDATED_REPLY_SITUATION_SOURCE = 'reply_situation_invalidated'

function isInvalidatedScenarioState(state: SessionOrchestrationMaterials['state']): boolean {
  if (!state) return false
  return String(state.scenarioCode || '').trim() === INVALIDATED_REPLY_SITUATION_CODE
    || String(state.source || '').trim() === INVALIDATED_REPLY_SITUATION_SOURCE
}

function stateIdentity(state: SessionOrchestrationMaterials['state']): string {
  if (!state) return ''
  return [state.id, state.version, state.anchorMessageId, state.sourceArtifactId].map((value) => String(value ?? '')).join(':')
}

function cloneDependencySnapshot(
  snapshot?: ReplySituationDependencySnapshot | null
): ReplySituationDependencySnapshot | undefined {
  if (!snapshot) return undefined
  const fingerprint = String(snapshot.fingerprint || '').trim()
  const values = { ...(snapshot.values || {}) }
  if (!fingerprint && Object.keys(values).length === 0) return undefined
  return {
    ...(fingerprint ? { fingerprint } : {}),
    values
  }
}

function readStateDependencySnapshot(
  state: SessionOrchestrationMaterials['state']
): ReplySituationDependencySnapshot | undefined {
  if (!state) return undefined
  const direct = state.dependencySnapshot
  if (direct && typeof direct === 'object') return cloneDependencySnapshot(direct)
  const rawSerialized = state.dependencySnapshotJson as unknown
  if (rawSerialized && typeof rawSerialized === 'object' && !Array.isArray(rawSerialized)) {
    return cloneDependencySnapshot(rawSerialized as ReplySituationDependencySnapshot)
  }
  const serialized = String(rawSerialized || '').trim()
  if (!serialized) return undefined
  try {
    const parsed = JSON.parse(serialized)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? cloneDependencySnapshot(parsed as ReplySituationDependencySnapshot)
      : undefined
  } catch {
    return undefined
  }
}

export function createReplySituationCheckpointFromMaterialsState(
  state: SessionOrchestrationMaterials['state'],
  dependencySnapshot?: ReplySituationDependencySnapshot | null
): ReplySituationCheckpoint | null {
  if (!state || isInvalidatedScenarioState(state) || !String(state.scenarioCode || '').trim()) return null
  const anchor = {
    ...(String(state.anchorMessageId || '').trim() ? { messageId: String(state.anchorMessageId).trim() } : {}),
    ...(String(state.sourceArtifactId || '').trim() ? { sourceArtifactId: String(state.sourceArtifactId).trim() } : {}),
    ...(Number.isFinite(Number(state.version)) ? { stateVersion: Number(state.version) } : {}),
    ...(String(state.updatedAt || '').trim() ? { updatedAt: String(state.updatedAt).trim() } : {})
  }
  const dependencies = cloneDependencySnapshot(dependencySnapshot) || readStateDependencySnapshot(state)
  return {
    code: String(state.scenarioCode).trim(),
    ...(String(state.scenarioLabel || '').trim() ? { label: String(state.scenarioLabel).trim() } : {}),
    ...(String(state.scenarioSummary || '').trim() ? { summary: String(state.scenarioSummary).trim() } : {}),
    ...(Object.keys(anchor).length ? { anchor } : {}),
    ...(dependencies ? { dependencySnapshot: dependencies } : {})
  }
}

export async function loadSessionOrchestrationMaterials(sessionId: string): Promise<{
  materials: SessionOrchestrationMaterials
  source: 'server'
}> {
  const materials = await fetchSessionOrchestrationMaterials(sessionId)
  hydratedMaterials.set(sessionId, materials)
  const previous = hydratedScenarioCheckpoints.get(sessionId)
  const nextStateIdentity = stateIdentity(materials.state)
  const keepDependencies = previous?.stateIdentity === nextStateIdentity
    ? previous.checkpoint.dependencySnapshot
    : undefined
  const checkpoint = createReplySituationCheckpointFromMaterialsState(materials.state, keepDependencies)
  if (checkpoint) hydratedScenarioCheckpoints.set(sessionId, { stateIdentity: nextStateIdentity, checkpoint })
  else hydratedScenarioCheckpoints.delete(sessionId)
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
  const sid = String(sessionId || '').trim()
  const state = peekHydratedSessionOrchestrationMaterials(sid)?.state || null
  const currentStateIdentity = stateIdentity(state)
  const cached = hydratedScenarioCheckpoints.get(sid)
  if (cached?.stateIdentity === currentStateIdentity) return cached.checkpoint
  const checkpoint = createReplySituationCheckpointFromMaterialsState(state)
  if (checkpoint) hydratedScenarioCheckpoints.set(sid, { stateIdentity: currentStateIdentity, checkpoint })
  else hydratedScenarioCheckpoints.delete(sid)
  return checkpoint
}

export async function saveFormalSessionScenario(sessionId: string, input: {
  code: string
  label?: string
  summary?: string
  anchorMessageId?: string
  sourceArtifactId?: string
  dependencySnapshot?: ReplySituationDependencySnapshot
}) {
  const sid = String(sessionId || '').trim()
  const materials = peekHydratedSessionOrchestrationMaterials(sid)
  if (!sid) throw new Error('保存最近情境缺少 sessionId')
  if (!materials) throw new Error('保存最近情境前必须先水合正式编排资料')
  if (!input.anchorMessageId && !input.sourceArtifactId) {
    throw new Error('保存最近情境必须关联 anchorMessageId 或 sourceArtifactId')
  }
  const state = await saveSessionOrchestrationState(sid, {
    scenarioCode: input.code,
    scenarioLabel: input.label || '',
    scenarioSummary: input.summary || '',
    anchorMessageId: input.anchorMessageId || '',
    sourceArtifactId: input.sourceArtifactId || '',
    expectedVersion: materials.state?.version || 0,
    source: 'director_artifact',
    ...(input.dependencySnapshot ? { dependencySnapshot: cloneDependencySnapshot(input.dependencySnapshot) } : {})
  })
  materials.state = state
  const checkpoint = createReplySituationCheckpointFromMaterialsState(state, input.dependencySnapshot)
  if (checkpoint) hydratedScenarioCheckpoints.set(sid, { stateIdentity: stateIdentity(state), checkpoint })
  else hydratedScenarioCheckpoints.delete(sid)
  return state
}

/**
 * 把“当前没有可安全复用的检查点”作为正式 tombstone 写入持久层。
 * 先清内存读侧，再等待服务端写入；调用失败会 reject，调用方不得继续生成或提交新 checkpoint。
 */
export async function invalidateFormalSessionScenario(sessionId: string, input: {
  anchorMessageId?: string
  sourceArtifactId?: string
  reason?: string
  force?: boolean
}) {
  const sid = String(sessionId || '').trim()
  const materials = peekHydratedSessionOrchestrationMaterials(sid)
  const anchorMessageId = String(input.anchorMessageId || '').trim()
  const sourceArtifactId = String(input.sourceArtifactId || '').trim()
  if (!sid) throw new Error('失效最近情境缺少 sessionId')
  if (!materials) throw new Error('失效最近情境前必须先水合正式编排资料')
  if (!anchorMessageId && !sourceArtifactId) {
    throw new Error('失效最近情境必须关联 anchorMessageId 或 sourceArtifactId')
  }

  hydratedScenarioCheckpoints.delete(sid)
  const current = materials.state
  if (!input.force && isInvalidatedScenarioState(current)
    && String(current?.anchorMessageId || '').trim() === anchorMessageId
    && String(current?.sourceArtifactId || '').trim() === sourceArtifactId) {
    return current
  }

  const buildPayload = (expectedVersion: number) => ({
    scenarioCode: INVALIDATED_REPLY_SITUATION_CODE,
    scenarioLabel: '',
    scenarioSummary: String(input.reason || '本轮检查点尚未完成，禁止复用').trim().slice(0, 300),
    anchorMessageId,
    sourceArtifactId,
    expectedVersion,
    source: INVALIDATED_REPLY_SITUATION_SOURCE,
    dependencySnapshot: { values: {} }
  })
  let state: SessionOrchestrationMaterials['state']
  try {
    state = await saveSessionOrchestrationState(sid, buildPayload(materials.state?.version || 0))
  } catch (firstError) {
    // 保存新 checkpoint 的请求可能已在服务端成功、只是在响应途中失败；也可能被并发版本推进。
    // 重新读取正式版本后再落一次 tombstone，确保“保存失败”不会让一个结果未知的有效 checkpoint 复活。
    try {
      const refreshed = await fetchSessionOrchestrationMaterials(sid)
      hydratedMaterials.set(sid, refreshed)
      hydratedScenarioCheckpoints.delete(sid)
      state = await saveSessionOrchestrationState(sid, buildPayload(refreshed.state?.version || 0))
    } catch {
      throw firstError
    }
  }
  materials.state = state
  const refreshedMaterials = hydratedMaterials.get(sid)
  if (refreshedMaterials && refreshedMaterials !== materials) refreshedMaterials.state = state
  hydratedScenarioCheckpoints.delete(sid)
  return state
}

export const sessionOrchestrationMaterialsWrites = {
  saveNarrativeOverride: saveSessionNarrativeOverride,
  saveState: saveSessionOrchestrationState
}
