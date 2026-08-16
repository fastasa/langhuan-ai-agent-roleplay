import { createHash } from 'node:crypto'
import {
  ORCHESTRATION_COMMAND_NAMES,
  ORCHESTRATION_ERROR_CODES,
  type OrchestrationCommandEnvelope,
  type OrchestrationCommandName,
  type OrchestrationTargetRef
} from '../../../shared/orchestrationWorkspace.js'
import { workspaceChatFacadeService } from '../workspace/workspaceChatFacadeService.js'
import { narrativeSeedAppService } from '../world/narrativeSeedAppService.js'
import { orchestrationMaterialsAppService } from './orchestrationMaterialsAppService.js'
import { orchestrationPresenceAppService } from './orchestrationPresenceAppService.js'
import { orchestrationWorkspaceProjectionService } from './orchestrationWorkspaceProjectionService.js'
import {
  createOrchestrationCommandRepository,
  orchestrationCommandRepository
} from '../../repositories/orchestrationCommandRepository.js'
import type {
  OrchestrationCommandOperationResult,
  OrchestrationCommandRequest,
  OrchestrationCommandResult
} from './orchestrationWorkspaceTypes.js'

type Row = Record<string, any>
type ServiceResult = { ok: true; data: any } | { ok: false; status: number; error: string; details?: any }
type Repository = ReturnType<typeof createOrchestrationCommandRepository>
type ProjectionService = typeof orchestrationWorkspaceProjectionService

type Dependencies = {
  repository: Repository
  presence: typeof orchestrationPresenceAppService
  materials: typeof orchestrationMaterialsAppService
  seeds: typeof narrativeSeedAppService
  workspace: typeof workspaceChatFacadeService
  projection: ProjectionService
}

const COMMAND_TARGET_KIND: Record<OrchestrationCommandName, OrchestrationTargetRef['kind']> = {
  setCharacterPresence: 'session_character',
  proposePresenceTransition: 'session_character',
  commitPresenceTransition: 'session_character',
  cancelPresenceTransition: 'session_character',
  patchCharacterStatus: 'status_panel',
  patchWorldEntityStatus: 'status_panel',
  saveStatusPanelTemplate: 'status_panel_template',
  saveStatusPanel: 'status_panel',
  saveWorldNarrativeConfig: 'narrative_config',
  createNarrativeSeed: 'narrative_seed',
  updateNarrativeSeed: 'narrative_seed',
  deleteNarrativeSeed: 'narrative_seed',
  updateCurtainScene: 'curtain',
  saveSessionNarrativeOverride: 'session_narrative_override'
}

const text = (value: unknown, max = 1000) => String(value ?? '').trim().slice(0, max)

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Row).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, stableValue(item)]))
  }
  return value
}

function requestHash(operation: OrchestrationCommandEnvelope) {
  // expectedVersion 与运行证据会随重放变化；幂等身份只锁定正式目标、命令和业务 payload。
  // payload 若改变仍会明确冲突，避免同键静默执行另一种事实。
  return createHash('sha256').update(JSON.stringify(stableValue({
    command: operation.command,
    sessionId: operation.sessionId,
    worldId: operation.worldId,
    targetRef: operation.targetRef,
    payload: operation.payload
  }))).digest('hex')
}

class CommandFailure extends Error {
  constructor(readonly status: number, message: string, readonly details?: any) {
    super(message)
  }
}

function unwrap(result: ServiceResult): any {
  if (!result.ok) throw new CommandFailure(result.status, result.error, result.details)
  return result.data
}

function versionOf(command: OrchestrationCommandName, data: any, expectedVersion: number) {
  if (data?.presence) return Math.max(0, Number(data.presence.version || 0))
  if (data?.event && command === 'proposePresenceTransition') return Math.max(0, expectedVersion)
  if (Object.prototype.hasOwnProperty.call(data || {}, 'narrativeOverride')) {
    return Math.max(0, Number(data.narrativeOverride?.version || 0))
  }
  if (Number.isInteger(Number(data?.version))) return Math.max(0, Number(data.version))
  if (data?.deleted) return Math.max(0, expectedVersion + 1)
  return Math.max(0, expectedVersion + 1)
}

function withEvidence(operation: OrchestrationCommandEnvelope) {
  return {
    ...operation.payload,
    worldId: operation.worldId,
    expectedVersion: operation.expectedVersion,
    idempotencyKey: operation.idempotencyKey,
    sourceMessageId: operation.source.sourceMessageId || '',
    sourceDirectorRunId: operation.source.sourceDirectorRunId || '',
    sourceAgentRunId: operation.source.sourceAgentRunId || '',
    evidenceSummary: operation.source.evidenceSummary
  } as Row
}

export function createOrchestrationCommandService(overrides: Partial<Dependencies> = {}) {
  const deps: Dependencies = {
    repository: orchestrationCommandRepository,
    presence: orchestrationPresenceAppService,
    materials: orchestrationMaterialsAppService,
    seeds: narrativeSeedAppService,
    workspace: workspaceChatFacadeService,
    projection: orchestrationWorkspaceProjectionService,
    ...overrides
  }

  function validateOperation(routeSessionId: string, operation: OrchestrationCommandEnvelope) {
    if (!operation || typeof operation !== 'object') throw new CommandFailure(400, '统一编排操作必须是对象')
    if (!ORCHESTRATION_COMMAND_NAMES.includes(operation.command)) {
      throw new CommandFailure(400, `统一编排命令不在白名单：${String(operation.command || '空')}`, { code: ORCHESTRATION_ERROR_CODES.invalidCommand })
    }
    if (text(operation.sessionId, 160) !== routeSessionId) {
      throw new CommandFailure(409, '操作 sessionId 与路由会话不一致', { code: ORCHESTRATION_ERROR_CODES.scopeMismatch })
    }
    if (!operation.targetRef || operation.targetRef.kind !== COMMAND_TARGET_KIND[operation.command]) {
      throw new CommandFailure(400, `命令 ${operation.command} 的 targetRef 类型不合法`, { code: ORCHESTRATION_ERROR_CODES.invalidTargetRef })
    }
    if (!Number.isInteger(operation.expectedVersion) || operation.expectedVersion < 0) {
      throw new CommandFailure(400, 'expectedVersion 必须是非负整数')
    }
    if (!text(operation.idempotencyKey, 240)) throw new CommandFailure(400, '统一编排操作必须携带 idempotencyKey')
    if (!text(operation.source?.evidenceSummary, 1000)) throw new CommandFailure(400, '统一编排操作必须携带 evidenceSummary')
    if (!operation.payload || typeof operation.payload !== 'object' || Array.isArray(operation.payload)) {
      throw new CommandFailure(400, '统一编排 payload 必须是对象')
    }
    const ref = operation.targetRef as any
    if ((ref.sessionId !== undefined && text(ref.sessionId, 160) !== routeSessionId)) {
      throw new CommandFailure(409, 'targetRef 会话与路由会话不一致', { code: ORCHESTRATION_ERROR_CODES.scopeMismatch })
    }
    if (ref.worldId !== undefined && text(ref.worldId, 160) !== text(operation.worldId, 160)) {
      throw new CommandFailure(409, 'targetRef 世界与操作世界不一致', { code: ORCHESTRATION_ERROR_CODES.scopeMismatch })
    }
  }

  function execute(operation: OrchestrationCommandEnvelope) {
    const input = withEvidence(operation)
    const ref = operation.targetRef as any
    switch (operation.command) {
      case 'setCharacterPresence':
        return unwrap(deps.presence.set(operation.sessionId, { ...input, participantId: ref.participantId }))
      case 'proposePresenceTransition':
        return unwrap(deps.presence.propose(operation.sessionId, { ...input, participantId: ref.participantId }))
      case 'commitPresenceTransition':
        return unwrap(deps.presence.commit(operation.sessionId, { ...input, participantId: ref.participantId }))
      case 'cancelPresenceTransition':
        return unwrap(deps.presence.cancel(operation.sessionId, { ...input, participantId: ref.participantId }))
      case 'patchCharacterStatus':
      case 'patchWorldEntityStatus':
        return unwrap(deps.workspace.saveStatusPanelBySessionId(operation.sessionId, { ...input, id: ref.panelId }))
      case 'saveStatusPanelTemplate':
        return unwrap(deps.workspace.saveStatusPanelTemplateBySessionId(operation.sessionId, { ...input, id: ref.templateId }))
      case 'saveStatusPanel':
        return unwrap(deps.workspace.saveStatusPanelBySessionId(operation.sessionId, { ...input, id: ref.panelId }))
      case 'saveWorldNarrativeConfig':
        return unwrap(deps.seeds.saveConfig(operation.worldId, input))
      case 'createNarrativeSeed':
        return unwrap(deps.seeds.createSeed(operation.worldId, { ...input, id: ref.seedId } as any))
      case 'updateNarrativeSeed':
        return unwrap(input.eventType === 'fact_committed'
          ? deps.seeds.recordImpact(operation.worldId, ref.seedId, input as any)
          : deps.seeds.updateSeed(operation.worldId, ref.seedId, input as any))
      case 'deleteNarrativeSeed':
        return unwrap(deps.seeds.deleteSeed(operation.worldId, ref.seedId, input))
      case 'updateCurtainScene':
        {
          const data = unwrap(deps.workspace.updateChatSessionById(operation.sessionId, input))
          if (deps.repository.bumpCurtainVersion(operation.sessionId, operation.expectedVersion) !== 1) {
            throw new CommandFailure(409, '帷幕版本已变化，请重读后再提交', { code: ORCHESTRATION_ERROR_CODES.versionConflict })
          }
          return { ...data, version: operation.expectedVersion + 1 }
        }
      case 'saveSessionNarrativeOverride':
        return unwrap(deps.materials.saveOverride(operation.sessionId, input))
    }
  }

  return {
    execute(input: { userId: string; workspaceId: string; sessionId: string; request: OrchestrationCommandRequest }): ServiceResult {
      const userId = text(input.userId, 160)
      const workspaceId = text(input.workspaceId, 160)
      const sessionId = text(input.sessionId, 160)
      const operations = Array.isArray(input.request?.operations) ? input.request.operations : []
      try {
        if (!userId || !workspaceId) throw new CommandFailure(401, '缺少统一编排鉴权范围')
        if (!sessionId) throw new CommandFailure(400, '缺少 sessionId')
        if (!operations.length || operations.length > 50) throw new CommandFailure(400, '统一编排每批必须包含 1 到 50 个操作')
        const keys = new Set<string>()
        for (const operation of operations) {
          validateOperation(sessionId, operation)
          if (keys.has(operation.idempotencyKey)) throw new CommandFailure(400, '同一批次不能重复使用 idempotencyKey')
          keys.add(operation.idempotencyKey)
        }
        const before = deps.projection.read({ userId, workspaceId, sessionId })
        if (!before.ok) throw new CommandFailure(before.status, before.error)
        const worldId = before.data.workspace.scope.worldId
        for (const operation of operations) {
          if (text(operation.worldId, 160) !== worldId) {
            throw new CommandFailure(409, '操作 worldId 与会话当前世界不一致', { code: ORCHESTRATION_ERROR_CODES.scopeMismatch, currentWorldId: worldId })
          }
        }

        const result = deps.repository.transaction(() => {
          const operationResults: OrchestrationCommandOperationResult[] = []
          for (const operation of operations) {
            const hash = requestHash(operation)
            const existing: any = deps.repository.findByIdempotencyKey(userId, workspaceId, operation.idempotencyKey)
            if (existing) {
              if (existing.requestHash !== hash) {
                throw new CommandFailure(409, '幂等键已被不同的统一编排操作占用', { code: ORCHESTRATION_ERROR_CODES.idempotencyConflict })
              }
              operationResults.push((typeof existing.resultJson === 'string'
                ? JSON.parse(existing.resultJson)
                : existing.resultJson) as OrchestrationCommandOperationResult)
              continue
            }
            const data = execute(operation)
            const item: OrchestrationCommandOperationResult = {
              command: operation.command,
              targetRef: operation.targetRef,
              version: versionOf(operation.command, data, operation.expectedVersion),
              ...(text(data?.event?.id, 160) ? { resultRef: text(data.event.id, 160) } : {})
            }
            deps.repository.insert({
              idempotencyKey: operation.idempotencyKey, sessionId, worldId,
              commandName: operation.command, targetRefJson: JSON.stringify(operation.targetRef),
              requestHash: hash, resultVersion: item.version, resultJson: JSON.stringify(item),
              createdAt: new Date().toISOString(), userId, workspaceId
            })
            operationResults.push(item)
          }
          const after = deps.projection.read({ userId, workspaceId, sessionId })
          if (!after.ok) throw new CommandFailure(after.status, after.error)
          return { viewRevision: after.data.workspace.scope.viewRevision, operations: operationResults } satisfies OrchestrationCommandResult
        })
        return { ok: true, data: result }
      } catch (error) {
        if (error instanceof CommandFailure) return { ok: false, status: error.status, error: error.message, details: error.details }
        throw error
      }
    }
  }
}

export const orchestrationCommandService = createOrchestrationCommandService()
