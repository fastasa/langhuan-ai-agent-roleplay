import { beforeEach, describe, expect, it, vi } from 'vitest'

const repositoryMocks = vi.hoisted(() => ({
  createChatGenerationAttemptBySessionId: vi.fn(),
  updateChatGenerationAttemptBySessionId: vi.fn()
}))

vi.mock('../../../src/repositories/chatRepository.ts', () => ({
  createChatGenerationAttemptBySessionId: repositoryMocks.createChatGenerationAttemptBySessionId,
  updateChatGenerationAttemptBySessionId: repositoryMocks.updateChatGenerationAttemptBySessionId
}))

import {
  finishChatGenerationAttempt,
  makeTidiaoRunId,
  startChatGenerationAttempt
} from '../../../src/app/chatTurnAudit.ts'

describe('chatTurnAudit', () => {
  beforeEach(() => {
    repositoryMocks.createChatGenerationAttemptBySessionId.mockReset()
    repositoryMocks.updateChatGenerationAttemptBySessionId.mockReset()
  })

  it('creates a running generation attempt without retired CAPS residue state', async () => {
    repositoryMocks.createChatGenerationAttemptBySessionId.mockResolvedValue({ id: 'attempt_1' })

    const attemptId = await startChatGenerationAttempt({
      sessionId: 'session_1',
      anchorMessageId: 12,
      triggerType: 'normal_send',
      mode: 'clean',
      targetId: 'char_1',
      speakerName: '星依'
    })

    expect(attemptId).toBe('attempt_1')
    expect(repositoryMocks.createChatGenerationAttemptBySessionId).toHaveBeenCalledWith('session_1', expect.objectContaining({
      anchorMessageId: 12,
      status: 'running'
    }))
    expect(repositoryMocks.createChatGenerationAttemptBySessionId.mock.calls[0][1])
      .not.toHaveProperty('preCapsResidueState')
  })

  it('forwards the turn-level tidiaoRunId when the caller supplies one', async () => {
    repositoryMocks.createChatGenerationAttemptBySessionId.mockResolvedValue({ id: 'attempt_1' })

    await startChatGenerationAttempt({
      sessionId: 'session_1',
      anchorMessageId: 12,
      triggerType: 'normal_send',
      mode: 'clean',
      targetId: 'char_1',
      speakerName: '星依',
      tidiaoRunId: 'tidiao_shared_turn'
    })

    expect(repositoryMocks.createChatGenerationAttemptBySessionId.mock.calls[0][1])
      .toHaveProperty('tidiaoRunId', 'tidiao_shared_turn')
  })

  it('falls back to a generated non-empty tidiaoRunId when none is supplied', async () => {
    repositoryMocks.createChatGenerationAttemptBySessionId.mockResolvedValue({ id: 'attempt_1' })

    await startChatGenerationAttempt({
      sessionId: 'session_1',
      anchorMessageId: 12,
      triggerType: 'normal_send',
      mode: 'clean',
      targetId: 'char_1',
      speakerName: '星依'
    })

    const runId = repositoryMocks.createChatGenerationAttemptBySessionId.mock.calls[0][1].tidiaoRunId
    expect(typeof runId).toBe('string')
    expect(runId.startsWith('tidiao_')).toBe(true)
  })

  it('makeTidiaoRunId yields prefixed distinct ids', () => {
    const a = makeTidiaoRunId()
    const b = makeTidiaoRunId()
    expect(a.startsWith('tidiao_')).toBe(true)
    expect(b.startsWith('tidiao_')).toBe(true)
    expect(a).not.toBe(b)
  })

  it('returns empty id and reports create failures', async () => {
    const error = new Error('create failed')
    const onError = vi.fn()
    repositoryMocks.createChatGenerationAttemptBySessionId.mockRejectedValue(error)

    const attemptId = await startChatGenerationAttempt({
      sessionId: 'session_1',
      anchorMessageId: 12,
      triggerType: 'normal_send',
      mode: 'clean',
      targetId: 'char_1',
      speakerName: '星依',
      onError
    })

    expect(attemptId).toBe('')
    expect(onError).toHaveBeenCalledWith(error)
  })

  it('finishes a generation attempt without retired CAPS residue state and formats errors', async () => {
    await finishChatGenerationAttempt({
      attemptId: 'attempt_1',
      sessionId: 'session_1',
      status: 'failed',
      assistantMessageIds: [99],
      outputPromptLogId: 'prompt_1',
      error: new Error('failed'),
      formatErrorMessage: (error) => error instanceof Error ? error.message : String(error)
    })

    expect(repositoryMocks.updateChatGenerationAttemptBySessionId).toHaveBeenCalledWith('session_1', 'attempt_1', expect.objectContaining({
      status: 'failed',
      assistantMessageIds: [99],
      outputPromptLogId: 'prompt_1',
      errorJson: { message: 'failed' }
    }))
    expect(repositoryMocks.updateChatGenerationAttemptBySessionId.mock.calls[0][2])
      .not.toHaveProperty('postCapsResidueState')
  })

  it('retries transient generation attempt finish failures before reporting error', async () => {
    const transientError = new Error('Bad Gateway')
    transientError.status = 502
    const onError = vi.fn()
    repositoryMocks.updateChatGenerationAttemptBySessionId
      .mockRejectedValueOnce(transientError)
      .mockResolvedValueOnce(undefined)

    await finishChatGenerationAttempt({
      attemptId: 'attempt_1',
      sessionId: 'session_1',
      status: 'failed',
      error: new Error('final model failed'),
      retryDelayMs: 0,
      onError
    })

    expect(repositoryMocks.updateChatGenerationAttemptBySessionId).toHaveBeenCalledTimes(2)
    expect(onError).not.toHaveBeenCalled()
  })
})
