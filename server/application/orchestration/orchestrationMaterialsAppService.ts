import { createHash } from 'crypto'
import { ORCHESTRATION_ERROR_CODES } from '../../../shared/orchestrationWorkspace.js'
import {
  createOrchestrationMaterialsRepository,
  orchestrationMaterialsRepository
} from '../../repositories/orchestrationMaterialsRepository.js'

type Repository = ReturnType<typeof createOrchestrationMaterialsRepository>
type ServiceResult = { ok: true; data: any } | { ok: false; status: number; error: string; details?: any }
type Row = Record<string, any>

const ok = (data: any): ServiceResult => ({ ok: true, data })
const fail = (status: number, error: string, details?: any): ServiceResult => ({ ok: false, status, error, details })
const text = (value: unknown, max = 1000) => String(value ?? '').trim().slice(0, max)
const nowIso = () => new Date().toISOString()
const stableId = (prefix: string, value: string) => `${prefix}_${createHash('sha256').update(value).digest('hex').slice(0, 24)}`

function normalizeDependencySnapshotJson(value: unknown): string {
  const source = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
  const rawValues = source.values && typeof source.values === 'object' && !Array.isArray(source.values)
    ? source.values as Record<string, unknown>
    : {}
  const values: Record<string, string | number | boolean | null> = {}
  for (const rawKey of Object.keys(rawValues).sort().slice(0, 48)) {
    const key = text(rawKey, 80)
    const raw = rawValues[rawKey]
    if (!key || !['string', 'number', 'boolean'].includes(typeof raw) && raw !== null) continue
    if (typeof raw === 'number' && !Number.isFinite(raw)) continue
    values[key] = typeof raw === 'string' ? text(raw, 500) : raw as number | boolean | null
  }
  const fingerprint = text(source.fingerprint, 200)
  return JSON.stringify({ ...(fingerprint ? { fingerprint } : {}), values })
}

function assertVersion(value: unknown, currentVersion: number) {
  const expected = Number(value)
  if (!Number.isInteger(expected) || expected < 0) return fail(400, 'expectedVersion 必须是非负整数')
  if (expected !== currentVersion) {
    return fail(409, '会话编排资料版本已变化，请重读后再提交', {
      code: ORCHESTRATION_ERROR_CODES.versionConflict,
      expectedVersion: expected,
      currentVersion
    })
  }
  return null
}

export function createOrchestrationMaterialsAppService(repository: Repository = orchestrationMaterialsRepository) {
  function resolveContext(sessionIdInput: unknown, worldIdInput?: unknown) {
    const sessionId = text(sessionIdInput, 160)
    if (!sessionId) return { error: fail(400, '缺少 sessionId') }
    const session = repository.findSessionById(sessionId)
    if (!session) return { error: fail(404, '会话不存在') }
    const worldId = text(session.worldId, 160)
    const requested = text(worldIdInput, 160)
    if (requested && requested !== worldId) {
      return { error: fail(409, '目标世界与会话当前挂载世界不一致', { code: ORCHESTRATION_ERROR_CODES.scopeMismatch }) }
    }
    return { sessionId, worldId, session }
  }

  function bundleOf(context: { sessionId: string; worldId: string }) {
    return {
      sessionId: context.sessionId,
      worldId: context.worldId,
      narrativeOverride: repository.findOverride(context.sessionId, context.worldId),
      state: repository.findState(context.sessionId, context.worldId)
    }
  }

  return {
    getBundle(sessionIdInput: unknown, worldIdInput?: unknown): ServiceResult {
      const context = resolveContext(sessionIdInput, worldIdInput)
      if ('error' in context) return context.error
      return ok(bundleOf(context))
    },
    saveOverride(sessionIdInput: unknown, input: Row): ServiceResult {
      const context = resolveContext(sessionIdInput, input.worldId)
      if ('error' in context) return context.error
      const current: any = repository.findOverride(context.sessionId, context.worldId)
      const versionError = assertVersion(input.expectedVersion, Number(current?.version || 0))
      if (versionError) return versionError
      const content = text(input.content, 600)
      if (!content) {
        if (current && !repository.deleteOverride(context.sessionId, context.worldId, current.version)) return fail(409, '会话覆盖版本已变化')
        return ok({ narrativeOverride: null })
      }
      const timestamp = nowIso()
      const row = {
        id: current?.id || stableId('narrative_override', `${context.sessionId}\0${context.worldId}`),
        sessionId: context.sessionId, worldId: context.worldId, content,
        version: current ? current.version + 1 : 1,
        source: text(input.source, 80) || 'user_manual',
        createdAt: current?.createdAt || timestamp, updatedAt: timestamp
      }
      if (current) {
        if (!repository.updateOverride(row, current.version)) return fail(409, '会话覆盖版本已变化')
      } else repository.insertOverride(row)
      return ok({ narrativeOverride: repository.findOverride(context.sessionId, context.worldId) })
    },
    saveState(sessionIdInput: unknown, input: Row): ServiceResult {
      const context = resolveContext(sessionIdInput, input.worldId)
      if ('error' in context) return context.error
      const current: any = repository.findState(context.sessionId, context.worldId)
      const versionError = assertVersion(input.expectedVersion, Number(current?.version || 0))
      if (versionError) return versionError
      const scenarioCode = text(input.scenarioCode, 120)
      if (!scenarioCode) return fail(400, '最近情境必须提供 scenarioCode')
      if (!text(input.anchorMessageId, 160) && !text(input.sourceArtifactId, 160)) {
        return fail(400, '最近情境必须关联 anchorMessageId 或完成的 sourceArtifactId')
      }
      const timestamp = nowIso()
      const row = {
        id: current?.id || stableId('orchestration_state', `${context.sessionId}\0${context.worldId}`),
        sessionId: context.sessionId, worldId: context.worldId, scenarioCode,
        scenarioLabel: text(input.scenarioLabel, 120), scenarioSummary: text(input.scenarioSummary, 300),
        anchorMessageId: text(input.anchorMessageId, 160), sourceArtifactId: text(input.sourceArtifactId, 160),
        dependencySnapshotJson: normalizeDependencySnapshotJson(input.dependencySnapshot),
        version: current ? current.version + 1 : 1,
        source: text(input.source, 80) || 'director_artifact',
        createdAt: current?.createdAt || timestamp, updatedAt: timestamp
      }
      if (current) {
        if (!repository.updateState(row, current.version)) return fail(409, '最近情境版本已变化')
      } else repository.insertState(row)
      return ok({ state: repository.findState(context.sessionId, context.worldId) })
    }
  }
}

export const orchestrationMaterialsAppService = createOrchestrationMaterialsAppService()
