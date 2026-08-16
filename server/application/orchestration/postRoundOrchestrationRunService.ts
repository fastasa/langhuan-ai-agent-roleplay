import { randomUUID } from 'node:crypto'
import type { CreatePostRoundRunInput, PostRoundRunStatus } from '../../../shared/postRoundOrchestration.js'
import { createPostRoundOrchestrationRunRepository, postRoundOrchestrationRunRepository } from '../../repositories/postRoundOrchestrationRunRepository.js'

type Repository = ReturnType<typeof createPostRoundOrchestrationRunRepository>
type Scope = { userId: string; workspaceId: string }

const text = (value: unknown, max = 1000) => String(value ?? '').trim().slice(0, max)
const now = () => new Date().toISOString()

export function createPostRoundOrchestrationRunService(repository: Repository = postRoundOrchestrationRunRepository) {
  return {
    create(scope: Scope, input: CreatePostRoundRunInput) {
      const sessionId = text(input.sessionId, 160)
      const inputMessageId = Number(input.inputMessageId || 0)
      if (!scope.userId || !scope.workspaceId || !sessionId || inputMessageId <= 0) {
        return { ok: false as const, status: 400, error: '轮后提调缺少正式作用域或锚点消息' }
      }
      if (!repository.hasSession(scope.userId, scope.workspaceId, sessionId)) {
        return { ok: false as const, status: 404, error: '轮后提调会话不存在或不属于当前工作区' }
      }
      const existing = repository.findByRound(scope.userId, scope.workspaceId, sessionId, inputMessageId)
      if (existing) {
        if (input.restartExisting === true) {
          const timestamp = now()
          return { ok: true as const, data: repository.update(scope.userId, scope.workspaceId, existing.id, {
            status: 'pending', attemptCount: Number(existing.attemptCount || 0), errorStage: '', errorMessage: '',
            resultJson: {}, startedAt: '', finishedAt: '', updatedAt: timestamp
          }) }
        }
        return { ok: true as const, data: existing }
      }
      const timestamp = now()
      return { ok: true as const, data: repository.insert({
        id: randomUUID(), sessionId, inputMessageId,
        triggerKind: input.triggerKind === 'focused_action' ? 'focused_action' : 'fast_reply',
        status: 'pending', attemptCount: 0, errorStage: '', errorMessage: '',
        idempotencyKey: text(input.idempotencyKey, 240) || `post-round:${sessionId}:${inputMessageId}`,
        resultJson: {}, startedAt: '', finishedAt: '', createdAt: timestamp, updatedAt: timestamp,
        userId: scope.userId, workspaceId: scope.workspaceId
      }) }
    },
    listUnresolved(scope: Scope, sessionId: string) {
      const normalizedSessionId = text(sessionId, 160)
      if (!repository.hasSession(scope.userId, scope.workspaceId, normalizedSessionId)) {
        return { ok: false as const, status: 404, error: '轮后提调会话不存在或不属于当前工作区' }
      }
      return { ok: true as const, data: repository.listUnresolved(scope.userId, scope.workspaceId, normalizedSessionId) }
    },
    transition(scope: Scope, sessionId: string, id: string, input: Record<string, unknown>) {
      const current = repository.findById(scope.userId, scope.workspaceId, text(id, 160))
      if (!current || current.sessionId !== text(sessionId, 160)) return { ok: false as const, status: 404, error: '轮后提调运行记录不存在' }
      const status = text(input.status, 30) as PostRoundRunStatus
      if (!['running', 'succeeded', 'failed', 'stopped'].includes(status)) {
        return { ok: false as const, status: 400, error: '轮后提调状态非法' }
      }
      const timestamp = now()
      return { ok: true as const, data: repository.update(scope.userId, scope.workspaceId, current.id, {
        status,
        attemptCount: status === 'running' ? Number(current.attemptCount || 0) + 1 : Number(current.attemptCount || 0),
        errorStage: status === 'failed' ? text(input.errorStage, 120) : '',
        errorMessage: status === 'failed' ? text(input.errorMessage, 2000) : '',
        resultJson: input.resultJson && typeof input.resultJson === 'object' ? input.resultJson : current.resultJson || {},
        startedAt: status === 'running' ? timestamp : current.startedAt || '',
        finishedAt: ['succeeded', 'failed', 'stopped'].includes(status) ? timestamp : '',
        updatedAt: timestamp
      }) }
    }
  }
}

export const postRoundOrchestrationRunService = createPostRoundOrchestrationRunService()
