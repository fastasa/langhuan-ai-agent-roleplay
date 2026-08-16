import { describe, expect, it, vi } from 'vitest'
import { createPostRoundOrchestrationRunService } from '../../../server/application/orchestration/postRoundOrchestrationRunService.ts'

const scope = { userId: 'u1', workspaceId: 'w1' }

function repository(overrides = {}) {
  return {
    hasSession: vi.fn(() => true),
    findByRound: vi.fn(() => null),
    findById: vi.fn(() => null),
    listUnresolved: vi.fn(() => []),
    insert: vi.fn((row) => row),
    update: vi.fn((_userId, _workspaceId, _id, patch) => patch),
    ...overrides
  }
}

describe('postRoundOrchestrationRunService', () => {
  it('rejects sessions outside the authenticated workspace scope', () => {
    const repo = repository({ hasSession: vi.fn(() => false) })
    const result = createPostRoundOrchestrationRunService(repo).create(scope, {
      sessionId: 'other-session', inputMessageId: 10, triggerKind: 'fast_reply', idempotencyKey: 'k'
    })
    expect(result).toMatchObject({ ok: false, status: 404 })
    expect(repo.insert).not.toHaveBeenCalled()
  })

  it('does not let a route session mutate a run from another session', () => {
    const repo = repository({ findById: vi.fn(() => ({ id: 'run1', sessionId: 's2', attemptCount: 0 })) })
    const result = createPostRoundOrchestrationRunService(repo).transition(scope, 's1', 'run1', { status: 'running' })
    expect(result).toMatchObject({ ok: false, status: 404 })
    expect(repo.update).not.toHaveBeenCalled()
  })

  it('requeues the same durable run when a focused action is regenerated', () => {
    const existing = {
      id: 'run1', sessionId: 's1', inputMessageId: 10, triggerKind: 'focused_action',
      status: 'succeeded', attemptCount: 1, resultJson: { operationCount: 2 },
      startedAt: 'old', finishedAt: 'old'
    }
    const repo = repository({ findByRound: vi.fn(() => existing) })
    const result = createPostRoundOrchestrationRunService(repo).create(scope, {
      sessionId: 's1', inputMessageId: 10, triggerKind: 'focused_action', idempotencyKey: 'k', restartExisting: true
    })

    expect(result.ok).toBe(true)
    expect(repo.update).toHaveBeenCalledWith('u1', 'w1', 'run1', expect.objectContaining({
      status: 'pending', attemptCount: 1, resultJson: {}, startedAt: '', finishedAt: ''
    }))
  })
})
