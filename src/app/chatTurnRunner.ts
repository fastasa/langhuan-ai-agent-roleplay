import { getReplyModePolicy, normalizeChatTurnReplyMode } from './chatTurnPolicy'
import type {
  ChatTurnFeatureId,
  ChatTurnInputKind,
  ChatTurnReplyMode,
  ChatTurnStage,
  ReplyModePolicy,
  TurnContext
} from './chatTurnTypes'

export type ChatTurnRunnerStatus = 'idle' | 'running' | 'completed' | 'failed' | 'aborted'

export interface ChatTurnRunnerStageEntry {
  stage: ChatTurnStage
  featureId?: ChatTurnFeatureId
  at: string
}

export interface ChatTurnRunnerBeginInput {
  runId: number
  inputKind: ChatTurnInputKind
  context: Omit<TurnContext, 'replyMode'> & {
    replyMode?: ChatTurnReplyMode
  }
}

export interface ChatTurnRunnerSnapshot {
  runId: number
  status: ChatTurnRunnerStatus
  inputKind: ChatTurnInputKind | ''
  context: TurnContext | null
  startedAt: string
  endedAt: string
  stageHistory: ChatTurnRunnerStageEntry[]
  errorMessage: string
}

export function buildChatTurnRoundId(sessionId: string, inputMessageId: number | undefined): string {
  const normalizedSessionId = String(sessionId || '').trim()
  const normalizedInputMessageId = Number(inputMessageId || 0)
  if (!normalizedSessionId || normalizedInputMessageId <= 0) return ''
  return `round:${normalizedSessionId}:${normalizedInputMessageId}`
}

function cloneContext(context: TurnContext | null): TurnContext | null {
  return context ? { ...context } : null
}

function cloneStageHistory(stageHistory: ChatTurnRunnerStageEntry[]): ChatTurnRunnerStageEntry[] {
  return stageHistory.map((entry) => ({ ...entry }))
}

function normalizeContext(context: ChatTurnRunnerBeginInput['context']): TurnContext {
  const sessionId = String(context.sessionId || '').trim()
  const inputMessageId = Number(context.inputMessageId || 0)
  return {
    ...context,
    sessionId,
    targetId: String(context.targetId || '').trim(),
    speakerTargetId: String(context.speakerTargetId || '').trim() || undefined,
    taskRunId: String(context.taskRunId || '').trim() || undefined,
    generationAttemptId: String(context.generationAttemptId || '').trim() || undefined,
    inputMessageId: inputMessageId > 0 ? inputMessageId : undefined,
    replyMode: normalizeChatTurnReplyMode(context.replyMode),
    roundId: String(context.roundId || '').trim() || buildChatTurnRoundId(sessionId, inputMessageId)
  }
}

function createIdleSnapshot(): ChatTurnRunnerSnapshot {
  return {
    runId: 0,
    status: 'idle',
    inputKind: '',
    context: null,
    startedAt: '',
    endedAt: '',
    stageHistory: [],
    errorMessage: ''
  }
}

export class ChatTurnRunner {
  private snapshot: ChatTurnRunnerSnapshot = createIdleSnapshot()

  begin(input: ChatTurnRunnerBeginInput): ChatTurnRunnerSnapshot {
    const now = new Date().toISOString()
    this.snapshot = {
      runId: Number(input.runId || 0),
      status: 'running',
      inputKind: input.inputKind,
      context: normalizeContext(input.context),
      startedAt: now,
      endedAt: '',
      stageHistory: [{
        stage: 'input_routing',
        featureId: 'input_command_routing',
        at: now
      }],
      errorMessage: ''
    }
    return this.getSnapshot()
  }

  enterStage(stage: ChatTurnStage, featureId?: ChatTurnFeatureId): ChatTurnRunnerSnapshot {
    if (this.snapshot.status === 'idle') return this.getSnapshot()
    this.snapshot.stageHistory = [
      ...this.snapshot.stageHistory,
      {
        stage,
        featureId,
        at: new Date().toISOString()
      }
    ]
    return this.getSnapshot()
  }

  setInputKind(inputKind: ChatTurnInputKind): ChatTurnRunnerSnapshot {
    if (this.snapshot.status === 'idle') return this.getSnapshot()
    this.snapshot = {
      ...this.snapshot,
      inputKind
    }
    return this.getSnapshot()
  }

  updateContext(patch: Partial<TurnContext>): ChatTurnRunnerSnapshot {
    if (!this.snapshot.context) return this.getSnapshot()
    const nextContext = normalizeContext({
      ...this.snapshot.context,
      ...patch,
      replyMode: patch.replyMode ?? this.snapshot.context.replyMode
    })
    this.snapshot = {
      ...this.snapshot,
      context: nextContext
    }
    return this.getSnapshot()
  }

  setInputMessageId(inputMessageId: number): ChatTurnRunnerSnapshot {
    return this.updateContext({ inputMessageId })
  }

  setTaskRunId(taskRunId: string): ChatTurnRunnerSnapshot {
    return this.updateContext({ taskRunId })
  }

  setGenerationAttemptId(generationAttemptId: string): ChatTurnRunnerSnapshot {
    return this.updateContext({ generationAttemptId })
  }

  finish(status: Exclude<ChatTurnRunnerStatus, 'idle' | 'running'>, error?: unknown): ChatTurnRunnerSnapshot {
    if (this.snapshot.status === 'idle') return this.getSnapshot()
    this.snapshot = {
      ...this.snapshot,
      status,
      endedAt: new Date().toISOString(),
      errorMessage: error ? error instanceof Error ? error.message : String(error) : ''
    }
    return this.getSnapshot()
  }

  reset(): ChatTurnRunnerSnapshot {
    this.snapshot = createIdleSnapshot()
    return this.getSnapshot()
  }

  getContext(): TurnContext | null {
    return cloneContext(this.snapshot.context)
  }

  getReplyModePolicy(): ReplyModePolicy | null {
    return this.snapshot.context ? getReplyModePolicy(this.snapshot.context.replyMode) : null
  }

  isCurrent(input: {
    runId: number
    taskRunId?: string
    stopRequested?: boolean
    isTaskRunActive?: (taskRunId: string) => boolean
  }): boolean {
    if (input.stopRequested) return false
    if (this.snapshot.status !== 'running') return false
    if (Number(input.runId || 0) <= 0 || Number(input.runId || 0) !== this.snapshot.runId) return false
    const expectedTaskRunId = String(this.snapshot.context?.taskRunId || '').trim()
    const actualTaskRunId = String(input.taskRunId || expectedTaskRunId || '').trim()
    if (expectedTaskRunId && actualTaskRunId && expectedTaskRunId !== actualTaskRunId) return false
    return actualTaskRunId && input.isTaskRunActive ? input.isTaskRunActive(actualTaskRunId) : true
  }

  getSnapshot(): ChatTurnRunnerSnapshot {
    return {
      ...this.snapshot,
      context: cloneContext(this.snapshot.context),
      stageHistory: cloneStageHistory(this.snapshot.stageHistory)
    }
  }
}

export function createChatTurnRunner(): ChatTurnRunner {
  return new ChatTurnRunner()
}
