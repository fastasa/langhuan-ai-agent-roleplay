import {
  buildReplyExecutionAudit,
  resolveReplyExecutionProfile,
  type ReplyExecutionAudit,
  type ReplyExecutionProfile
} from './replyExecutionProfile'
import type {
  ReplyOrchestrationRoute,
  ReplyOrchestrationRouteDecision
} from './replyOrchestrationRoute'

export const REPLY_EXECUTION_RECEIPT_SCHEMA_VERSION = 'reply-execution-receipt/v1' as const

export type ReplyExecutionReceiptState = 'completed' | 'failed'

interface ReplyExecutionReceiptInputBase {
  roundProfile?: ReplyExecutionProfile | null
  routeDecision?: ReplyOrchestrationRouteDecision | null
  defaultRoute: ReplyOrchestrationRoute
  actualHasPersonalityModel: boolean
  purePrompt: boolean
  focusedAction?: boolean
  messageId?: number | null
  promptLogId?: string | null
  completedStages?: readonly string[] | null
}

export type ReplyExecutionReceiptInput = ReplyExecutionReceiptInputBase & (
  | {
      state: 'completed'
      failureStage?: never
      error?: never
    }
  | {
      state: 'failed'
      failureStage?: string | null
      error?: unknown
    }
)

export interface ReplyExecutionReceiptFailure {
  readonly stage: string
  readonly message: string
}

interface ReplyExecutionReceiptBase {
  readonly schemaVersion: typeof REPLY_EXECUTION_RECEIPT_SCHEMA_VERSION
  readonly replyExecutionAudit: ReplyExecutionAudit
  readonly state: ReplyExecutionReceiptState
  readonly messageId: number
  readonly promptLogId: string
  readonly completedStages: readonly string[]
}

export interface CompletedReplyExecutionReceipt extends ReplyExecutionReceiptBase {
  readonly state: 'completed'
  readonly failure?: never
}

export interface FailedReplyExecutionReceipt extends ReplyExecutionReceiptBase {
  readonly state: 'failed'
  readonly failure: ReplyExecutionReceiptFailure
}

export type ReplyExecutionReceipt = CompletedReplyExecutionReceipt | FailedReplyExecutionReceipt

function cloneAndFreeze<T>(value: T): T {
  if (Array.isArray(value)) {
    return Object.freeze(value.map((item) => cloneAndFreeze(item))) as unknown as T
  }
  if (value && typeof value === 'object') {
    const copy = Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .map(([key, item]) => [key, cloneAndFreeze(item)])
    )
    return Object.freeze(copy) as T
  }
  return value
}

function copyRoundProfile(profile?: ReplyExecutionProfile | null): ReplyExecutionProfile | null {
  if (!profile) return null
  return resolveReplyExecutionProfile({
    route: profile.basis.route,
    hasPersonalityModel: profile.basis.hasPersonalityModel,
    mixedBackends: profile.basis.mixedBackends,
    purePrompt: profile.basis.purePrompt,
    focusedAction: profile.basis.focusedAction
  })
}

function normalizeMessageId(value: unknown): number {
  const messageId = Number(value)
  return Number.isInteger(messageId) && messageId > 0 ? messageId : 0
}

function normalizeCompletedStages(stages?: readonly string[] | null): readonly string[] {
  return Object.freeze(
    (stages || [])
      .map((stage) => String(stage || '').trim())
      .filter(Boolean)
  )
}

function normalizeErrorMessage(error: unknown): string {
  if (error instanceof Error) return String(error.message || error.name || '').trim() || 'Unknown failure'
  if (typeof error === 'string') return error.trim() || 'Unknown failure'
  if (error === null || error === undefined) return 'Unknown failure'
  try {
    const serialized = JSON.stringify(error)
    if (serialized && serialized !== '{}') return serialized
  } catch {
    // Fall through to the stable string representation below.
  }
  return String(error).trim() || 'Unknown failure'
}

/**
 * 构造可持久化的回复执行回执。只描述实际执行结果，不触发模型、网络或存储副作用。
 */
export function buildReplyExecutionReceipt(input: ReplyExecutionReceiptInput): ReplyExecutionReceipt {
  const roundProfile = copyRoundProfile(input.roundProfile)
  const routeDecision = input.routeDecision
    ? cloneAndFreeze(input.routeDecision)
    : null
  const replyExecutionAudit = buildReplyExecutionAudit({
    roundProfile,
    routeDecision,
    defaultRoute: input.defaultRoute,
    actualHasPersonalityModel: input.actualHasPersonalityModel,
    purePrompt: input.purePrompt,
    focusedAction: input.focusedAction
  })
  const base = {
    schemaVersion: REPLY_EXECUTION_RECEIPT_SCHEMA_VERSION,
    replyExecutionAudit,
    state: input.state,
    messageId: normalizeMessageId(input.messageId),
    promptLogId: String(input.promptLogId || '').trim(),
    completedStages: normalizeCompletedStages(input.completedStages)
  }

  if (input.state === 'failed') {
    const failure = Object.freeze({
      stage: String(input.failureStage || '').trim() || 'unknown',
      message: normalizeErrorMessage(input.error)
    })
    return Object.freeze({ ...base, state: 'failed', failure })
  }
  return Object.freeze({ ...base, state: 'completed' })
}
