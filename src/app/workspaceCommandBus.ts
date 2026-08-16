import type {
  WorkspaceCommandError,
  WorkspaceCommandLifecycle,
  WorkspaceCommandMetadata,
  WorkspaceCommandResult,
  WorkspaceCommandTarget,
  WorkspaceFeedbackPolicy,
  WorkspaceResumePolicy,
  WorkspaceRollbackPolicy
} from '../types/workspace'
import type { useWorkspaceRuntimeStore } from './workspaceRuntimeStore'

type WorkspaceRuntimeStore = ReturnType<typeof useWorkspaceRuntimeStore>

type WorkspaceCommandContext = {
  metadata: WorkspaceCommandMetadata
}

export type WorkspaceCommandHandler<TPayload = unknown, TResult = unknown> = {
  handle: (payload: TPayload, context: WorkspaceCommandContext) => Promise<TResult> | TResult
  target?: WorkspaceCommandTarget
  optimistic?: boolean
  rollbackPolicy?: WorkspaceRollbackPolicy | WorkspaceRollbackPolicy['mode']
  resumePolicy?: WorkspaceResumePolicy | WorkspaceResumePolicy['mode']
  feedbackPolicy?: WorkspaceFeedbackPolicy | WorkspaceFeedbackPolicy['mode']
} | ((payload: TPayload, context: WorkspaceCommandContext) => Promise<TResult> | TResult)

function normalizeRollbackPolicy(
  value: WorkspaceRollbackPolicy | WorkspaceRollbackPolicy['mode'] | undefined
): WorkspaceRollbackPolicy {
  if (!value) return { mode: 'manual' }
  return typeof value === 'string' ? { mode: value } : value
}

function normalizeResumePolicy(
  value: WorkspaceResumePolicy | WorkspaceResumePolicy['mode'] | undefined
): WorkspaceResumePolicy {
  if (!value) return { mode: 'none' }
  return typeof value === 'string' ? { mode: value } : value
}

function normalizeFeedbackPolicy(
  value: WorkspaceFeedbackPolicy | WorkspaceFeedbackPolicy['mode'] | undefined
): WorkspaceFeedbackPolicy {
  if (!value) return { mode: 'silent' }
  return typeof value === 'string' ? { mode: value } : value
}

function isHandlerConfig<TPayload = unknown, TResult = unknown>(
  handler: WorkspaceCommandHandler<TPayload, TResult>
): handler is Exclude<WorkspaceCommandHandler<TPayload, TResult>, Function> {
  return typeof handler === 'object' && handler !== null && 'handle' in handler
}

function readStringValue(rawValue: unknown) {
  return typeof rawValue === 'string' && rawValue.trim() ? rawValue.trim() : undefined
}

function toCommandMetadata(type: string, payload: unknown, handler: WorkspaceCommandHandler<any, any>): WorkspaceCommandMetadata {
  const safePayload = payload && typeof payload === 'object'
    ? payload as Record<string, unknown>
    : {}

  const commandId = typeof safePayload.commandId === 'string' && safePayload.commandId.trim()
    ? safePayload.commandId.trim()
    : `workspace_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`

  const handlerConfig = isHandlerConfig(handler) ? handler : null
  const payloadTarget = readStringValue(safePayload.target) as WorkspaceCommandTarget | undefined
  const payloadOptimistic = typeof safePayload.optimistic === 'boolean' ? safePayload.optimistic : undefined

  return {
    commandId,
    type,
    target: payloadTarget || handlerConfig?.target || 'unknown',
    optimistic: payloadOptimistic ?? handlerConfig?.optimistic ?? false,
    issuedAt: Date.now(),
    idempotencyKey: readStringValue(safePayload.idempotencyKey),
    rollbackPolicy: normalizeRollbackPolicy(
      (safePayload.rollbackPolicy as WorkspaceRollbackPolicy | WorkspaceRollbackPolicy['mode'] | undefined)
      ?? handlerConfig?.rollbackPolicy
    ),
    resumePolicy: normalizeResumePolicy(
      (safePayload.resumePolicy as WorkspaceResumePolicy | WorkspaceResumePolicy['mode'] | undefined)
      ?? handlerConfig?.resumePolicy
    ),
    feedbackPolicy: normalizeFeedbackPolicy(
      (safePayload.feedbackPolicy as WorkspaceFeedbackPolicy | WorkspaceFeedbackPolicy['mode'] | undefined)
      ?? handlerConfig?.feedbackPolicy
    )
  }
}

function getHandlerRunner<TPayload = unknown, TResult = unknown>(handler: WorkspaceCommandHandler<TPayload, TResult>) {
  return isHandlerConfig(handler) ? handler.handle : handler
}

export function createWorkspaceCommandBus(runtimeStore: WorkspaceRuntimeStore) {
  const handlers = new Map<string, WorkspaceCommandHandler<any, any>>()

  function registerHandler<TPayload = unknown, TResult = unknown>(
    type: string,
    handler: WorkspaceCommandHandler<TPayload, TResult>
  ) {
    handlers.set(type, handler as WorkspaceCommandHandler<any, any>)
  }

  function applyFeedback(metadata: WorkspaceCommandMetadata, phase: 'running' | 'success' | 'error', fallbackMessage: string) {
    const policy = metadata.feedbackPolicy
    if (!policy || policy.mode === 'silent') return
    const message = phase === 'running'
      ? (policy.runningMessage || fallbackMessage)
      : phase === 'success'
        ? (policy.successMessage || fallbackMessage)
        : (policy.errorMessage || fallbackMessage)

    if (!message) return

    if (policy.mode === 'blocking') {
      if (phase === 'error') {
        runtimeStore.setBlockingFeedback(message, 'global')
      } else {
        runtimeStore.clearBlockingFeedback()
        runtimeStore.showToast(message, phase === 'success' ? 'success' : 'info', policy.duration || 3000)
      }
      return
    }

    runtimeStore.showToast(message, phase === 'error' ? 'error' : (phase === 'success' ? 'success' : 'info'), policy.duration || 3000)
  }

  function track(metadata: WorkspaceCommandMetadata, state: WorkspaceCommandLifecycle) {
    runtimeStore.trackCommand(metadata, state)
  }

  async function dispatch<TPayload = unknown, TResult = unknown>(
    type: string,
    payload: TPayload
  ): Promise<WorkspaceCommandResult<TResult>> {
    const handler = handlers.get(type)
    if (!handler) {
      throw new Error(`未注册的工作区命令: ${type}`)
    }

    const metadata = toCommandMetadata(type, payload, handler)
    const runHandler = getHandlerRunner(handler)
    track(metadata, 'accepted')
    track(metadata, 'running')
    applyFeedback(metadata, 'running', `${type} 正在执行`)
    try {
      const data = await runHandler(payload, { metadata })
      track(metadata, 'committed')
      const result: WorkspaceCommandResult<TResult> = {
        ok: true,
        command: type,
        target: metadata.target,
        optimistic: metadata.optimistic,
        status: 'committed',
        state: 'committed',
        commandId: metadata.commandId,
        data: data as TResult,
        warnings: [],
        retryable: metadata.resumePolicy.mode === 'resume' || metadata.resumePolicy.mode === 'resume-latest',
        error: null,
        snapshotVersion: null
      }
      runtimeStore.syncCommandResult(metadata, result)
      applyFeedback(metadata, 'success', `${type} 执行成功`)
      return result
    } catch (error) {
      const shouldRollback = metadata.rollbackPolicy.mode === 'auto' || metadata.rollbackPolicy.mode === 'manual'
      if (shouldRollback) {
        track(metadata, 'rolledBack')
      } else {
        track(metadata, 'cancelled')
      }
      const commandError: WorkspaceCommandError = {
        ok: false,
        command: type,
        target: metadata.target,
        optimistic: metadata.optimistic,
        status: shouldRollback ? 'rolledBack' : 'cancelled',
        state: shouldRollback ? 'rolledBack' : 'cancelled',
        commandId: metadata.commandId,
        message: error instanceof Error ? error.message : String(error || '工作区命令执行失败'),
        cause: error,
        warnings: [],
        retryable: metadata.resumePolicy.mode === 'resume' || metadata.resumePolicy.mode === 'resume-latest',
        error: error instanceof Error ? error.message : String(error || '工作区命令执行失败'),
        snapshotVersion: null
      }
      runtimeStore.syncCommandResult(metadata, commandError)
      applyFeedback(metadata, 'error', commandError.message)
      throw commandError
    }
  }

  return {
    registerHandler,
    dispatch
  }
}
