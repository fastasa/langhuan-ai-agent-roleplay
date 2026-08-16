export const POST_ROUND_RUN_STATUSES = ['pending', 'running', 'succeeded', 'failed', 'stopped'] as const
export type PostRoundRunStatus = (typeof POST_ROUND_RUN_STATUSES)[number]
export type PostRoundTriggerKind = 'fast_reply' | 'focused_action'

export interface PostRoundOrchestrationRun {
  id: string
  sessionId: string
  inputMessageId: number
  triggerKind: PostRoundTriggerKind
  status: PostRoundRunStatus
  attemptCount: number
  errorStage: string
  errorMessage: string
  idempotencyKey: string
  resultJson: Record<string, unknown>
  startedAt: string
  finishedAt: string
  createdAt: string
  updatedAt: string
}

export interface CreatePostRoundRunInput {
  sessionId: string
  inputMessageId: number
  triggerKind: PostRoundTriggerKind
  idempotencyKey: string
  /** 同一动作消息重新生成时复用原锚点，并把既有终态运行重新置为 pending。 */
  restartExisting?: boolean
}

export function isTerminalPostRoundRunStatus(status: unknown): boolean {
  return status === 'succeeded' || status === 'failed' || status === 'stopped'
}
