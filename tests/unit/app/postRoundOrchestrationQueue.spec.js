import { describe, expect, it, vi } from 'vitest'
import { createPostRoundOrchestrationQueue } from '../../../src/app/postRoundOrchestrationQueue.ts'

function makeRun(status = 'pending') {
  return {
    id: 'run-1', sessionId: 's1', inputMessageId: 10, triggerKind: 'fast_reply', status,
    attemptCount: 0, errorStage: '', errorMessage: '', idempotencyKey: 'post-round:s1:10',
    resultJson: {}, startedAt: '', finishedAt: '', createdAt: '', updatedAt: ''
  }
}

describe('postRoundOrchestrationQueue', () => {
  it('serializes work per session and persists running/succeeded transitions', async () => {
    const transitions = []
    const repository = {
      create: vi.fn(async () => makeRun()),
      listUnresolved: vi.fn(async () => []),
      transition: vi.fn(async (input) => {
        transitions.push(input.status)
        return { ...makeRun(input.status), resultJson: input.resultJson || {} }
      })
    }
    const queue = createPostRoundOrchestrationQueue(repository)
    await queue.schedule({ sessionId: 's1', inputMessageId: 10, triggerKind: 'fast_reply', idempotencyKey: 'k' }, async () => ({
      operationCount: 2,
      messageIds: [11, 12]
    }))
    expect(transitions).toEqual(['running', 'succeeded'])
  })

  it('recovers failed durable runs before the next round', async () => {
    const repository = {
      create: vi.fn(),
      listUnresolved: vi.fn(async () => [makeRun('failed')]),
      transition: vi.fn(async (input) => makeRun(input.status))
    }
    const processor = vi.fn(async () => ({ operationCount: 0, messageIds: [] }))
    await createPostRoundOrchestrationQueue(repository).recover('s1', processor)
    expect(processor).toHaveBeenCalledTimes(1)
    expect(repository.transition.mock.calls.map(([input]) => input.status)).toEqual(['running', 'succeeded'])
  })
})
