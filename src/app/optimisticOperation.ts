import {
  createPendingOperation,
  deriveQueueKey,
  type OperationPatch,
  type OperationToken,
  type PendingOperation,
  type PendingOperationStatus,
  type RedoPatch,
  type UndoPatch
} from './operationPatches'

export type OptimisticPatchOptions<TTarget extends object, TResult = unknown> = {
  target: TTarget | null | undefined
  next: Partial<TTarget>
  persist: () => Promise<TResult>
  reconcile?: (result: TResult) => void
  shouldRollbackKey?: (key: keyof TTarget, error: unknown) => boolean
}

export type ConfirmedDeleteOptions<TResult = unknown> = {
  markPending: () => void
  clearPending: () => void
  persist: () => Promise<TResult>
  removeLocal: (result: TResult) => void
}

export type OperationQueueEvent<TFields extends Record<string, unknown> = Record<string, unknown>> = {
  operation: PendingOperation<TFields>
  status: PendingOperationStatus
}

export type QueueOperationOptions<TResult, TFields extends Record<string, unknown> = Record<string, unknown>> = {
  patch: OperationPatch<TFields>
  applyLocal?: (operation: PendingOperation<TFields>) => void
  commit: (operation: PendingOperation<TFields>) => Promise<TResult>
  rollback?: (operation: PendingOperation<TFields>, error: unknown) => void
  reconcile?: (result: TResult, operation: PendingOperation<TFields>) => void
  undoPatch?: UndoPatch<TFields>
  redoPatch?: RedoPatch<TFields>
}

function buildRollbackPatch<TTarget extends object>(target: TTarget, next: Partial<TTarget>): Partial<TTarget> {
  const patch: Partial<TTarget> = {}
  Object.keys(next as Record<string, unknown>).forEach((key) => {
    const field = key as keyof TTarget
    if (target[field] !== next[field]) {
      ;(patch as Record<string, unknown>)[key] = target[field]
    }
  })
  return patch
}

export async function runOptimisticPatch<TTarget extends object, TResult = unknown>(
  options: OptimisticPatchOptions<TTarget, TResult>
): Promise<TResult> {
  const { target, next, persist, reconcile } = options
  const rollback = target ? buildRollbackPatch(target, next) : null
  if (target) Object.assign(target, next)
  try {
    const result = await persist()
    reconcile?.(result)
    return result
  } catch (error) {
    if (target && rollback) {
      Object.entries(rollback as Record<string, unknown>).forEach(([key, value]) => {
        const field = key as keyof TTarget
        if (!options.shouldRollbackKey || options.shouldRollbackKey(field, error)) {
          ;(target as Record<string, unknown>)[key] = value
        }
      })
    }
    throw error
  }
}

export async function runConfirmedDelete<TResult = unknown>(
  options: ConfirmedDeleteOptions<TResult>
): Promise<TResult> {
  const { markPending, clearPending, persist, removeLocal } = options
  markPending()
  try {
    const result = await persist()
    removeLocal(result)
    return result
  } finally {
    clearPending()
  }
}

export class OperationQueue<TFields extends Record<string, unknown> = Record<string, unknown>> {
  private versions = new Map<string, number>()
  private chains = new Map<string, Promise<unknown>>()
  private operations = new Map<string, PendingOperation<TFields>>()
  private listeners = new Set<(event: OperationQueueEvent<TFields>) => void>()

  onChange(listener: (event: OperationQueueEvent<TFields>) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getOperation(id: string): PendingOperation<TFields> | undefined {
    return this.operations.get(id)
  }

  getPendingOperations(): PendingOperation<TFields>[] {
    return Array.from(this.operations.values()).filter((operation) =>
      ['prepared', 'appliedLocal', 'committing', 'reconcileNeeded'].includes(operation.status)
    )
  }

  cancel(operationId: string): boolean {
    const operation = this.operations.get(operationId)
    if (!operation || ['confirmed', 'failed', 'rolledBack', 'cancelled'].includes(operation.status)) return false
    operation.token.cancelled = true
    this.updateOperation(operation, 'cancelled')
    return true
  }

  enqueue<TResult>(options: QueueOperationOptions<TResult, TFields>): Promise<TResult> {
    const queueKey = deriveQueueKey(options.patch.target)
    const version = this.nextVersion(queueKey, options.patch.version)
    const token: OperationToken = {
      id: `${options.patch.id}:v${version}`,
      queueKey,
      version,
      cancelled: false
    }
    const patch: OperationPatch<TFields> = {
      ...options.patch,
      version
    }
    let operation = createPendingOperation(patch, token, {
      undoPatch: options.undoPatch,
      redoPatch: options.redoPatch
    })

    this.operations.set(operation.id, operation)
    this.emit(operation)

    if (options.applyLocal) {
      operation = this.updateOperation(operation, 'appliedLocal')
      options.applyLocal(operation)
    }

    const previous = this.chains.get(queueKey) ?? Promise.resolve()
    const run = previous
      .catch(() => undefined)
      .then(async () => {
        if (operation.token.cancelled) {
          operation = this.updateOperation(operation, 'cancelled')
          throw new OperationCancelledError(operation.id)
        }
        operation = this.updateOperation(operation, 'committing')
        try {
          const result = await options.commit(operation)
          if (operation.token.cancelled) {
            operation = this.updateOperation(operation, 'cancelled')
            throw new OperationCancelledError(operation.id)
          }
          options.reconcile?.(result, operation)
          operation = this.updateOperation(operation, 'confirmed')
          return result
        } catch (error) {
          if (operation.token.cancelled) {
            operation = this.updateOperation(operation, 'cancelled', error)
          } else {
            options.rollback?.(operation, error)
            operation = this.updateOperation(operation, options.rollback ? 'rolledBack' : 'failed', error)
          }
          throw error
        }
      })

    const chain = run.catch(() => undefined).finally(() => {
      if (this.chains.get(queueKey) === chain) this.chains.delete(queueKey)
    })
    this.chains.set(queueKey, chain)
    return run
  }

  private nextVersion(queueKey: string, requestedVersion: number): number {
    const next = Math.max((this.versions.get(queueKey) ?? 0) + 1, requestedVersion || 1)
    this.versions.set(queueKey, next)
    return next
  }

  private updateOperation(
    operation: PendingOperation<TFields>,
    status: PendingOperationStatus,
    error?: unknown
  ): PendingOperation<TFields> {
    const nextOperation: PendingOperation<TFields> = {
      ...operation,
      status,
      error,
      updatedAt: Date.now()
    }
    this.operations.set(nextOperation.id, nextOperation)
    this.emit(nextOperation)
    return nextOperation
  }

  private emit(operation: PendingOperation<TFields>): void {
    const event = { operation, status: operation.status }
    this.listeners.forEach((listener) => listener(event))
  }
}

export class OperationCancelledError extends Error {
  constructor(operationId: string) {
    super(`Operation ${operationId} was cancelled`)
    this.name = 'OperationCancelledError'
  }
}

export function createOperationQueue<TFields extends Record<string, unknown> = Record<string, unknown>>(): OperationQueue<TFields> {
  return new OperationQueue<TFields>()
}
