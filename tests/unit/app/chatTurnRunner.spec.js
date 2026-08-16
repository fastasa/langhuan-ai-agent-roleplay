import { describe, expect, it } from 'vitest'
import {
  buildChatTurnRoundId,
  createChatTurnRunner
} from '../../../src/app/chatTurnRunner.ts'

describe('chatTurnRunner', () => {
  it('starts a turn with normalized context and reply policy', () => {
    const runner = createChatTurnRunner()

    runner.begin({
      runId: 7,
      inputKind: 'plain_user_message',
      context: {
        sessionId: ' session-1 ',
        targetId: ' target-1 ',
        taskRunId: 'task-1',
        replyMode: 'normal_recall'
      }
    })

    expect(runner.getContext()).toMatchObject({
      sessionId: 'session-1',
      targetId: 'target-1',
      taskRunId: 'task-1',
      replyMode: 'normal_recall'
    })
    expect(runner.getReplyModePolicy()?.mode).toBe('normal_recall')
    expect(runner.getSnapshot().stageHistory.map((entry) => entry.stage)).toEqual(['input_routing'])
  })

  it('updates input message id and builds a stable round id', () => {
    const runner = createChatTurnRunner()

    runner.begin({
      runId: 8,
      inputKind: 'plain_user_message',
      context: {
        sessionId: 'session-2',
        targetId: 'target-2',
        replyMode: 'normal_recall'
      }
    })
    runner.setInputMessageId(42)

    expect(runner.getContext()?.inputMessageId).toBe(42)
    expect(runner.getContext()?.roundId).toBe('round:session-2:42')
    expect(buildChatTurnRoundId('session-2', 42)).toBe('round:session-2:42')
  })

  it('tracks task run and generation attempt without touching runtime stores', () => {
    const runner = createChatTurnRunner()

    runner.begin({
      runId: 9,
      inputKind: 'user_message_regenerate',
      context: {
        sessionId: 'session-3',
        targetId: 'target-3',
        replyMode: 'caps_network'
      }
    })
    runner.setTaskRunId('task-3')
    runner.setGenerationAttemptId('attempt-3')

    expect(runner.getContext()).toMatchObject({
      taskRunId: 'task-3',
      generationAttemptId: 'attempt-3',
      replyMode: 'normal_recall'
    })
    expect(runner.getReplyModePolicy()?.promptOptions.forceEmptyRecall).toBe(false)
  })

  it('checks current run using the task run predicate', () => {
    const runner = createChatTurnRunner()

    runner.begin({
      runId: 10,
      inputKind: 'plain_user_message',
      context: {
        sessionId: 'session-4',
        targetId: 'target-4',
        taskRunId: 'task-4',
        replyMode: 'normal_recall'
      }
    })

    expect(runner.isCurrent({
      runId: 10,
      taskRunId: 'task-4',
      isTaskRunActive: (taskRunId) => taskRunId === 'task-4'
    })).toBe(true)
    expect(runner.isCurrent({
      runId: 10,
      taskRunId: 'task-4',
      isTaskRunActive: () => false
    })).toBe(false)
    expect(runner.isCurrent({
      runId: 11,
      taskRunId: 'task-4',
      isTaskRunActive: () => true
    })).toBe(false)
  })

  it('switches the same turn into temporary entity narration mode', () => {
    const runner = createChatTurnRunner()

    runner.begin({
      runId: 11,
      inputKind: 'plain_user_message',
      context: {
        sessionId: 'session-5',
        targetId: 'target-5',
        replyMode: 'normal_recall'
      }
    })
    runner.setInputKind('session_temporary_entity_narration')
    runner.updateContext({ replyMode: 'session_temporary_entity_narration' })

    expect(runner.getSnapshot().inputKind).toBe('session_temporary_entity_narration')
    expect(runner.getContext()?.replyMode).toBe('session_temporary_entity_narration')
    expect(runner.getReplyModePolicy()?.enabledFeatures).toContain('session_temporary_entity_narration')
  })
})
