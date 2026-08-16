export type OperationPatchModule = 'character-brain' | 'doc-library' | 'app-shell' | 'custom'

export type OperationPatchKind =
  | 'create'
  | 'delete'
  | 'save'
  | 'rename'
  | 'move'
  | 'sort'
  | 'import'
  | 'undo'
  | 'redo'
  | 'batch'
  | 'custom'

export type PendingOperationStatus =
  | 'idle'
  | 'prepared'
  | 'appliedLocal'
  | 'committing'
  | 'confirmed'
  | 'failed'
  | 'rolledBack'
  | 'reconcileNeeded'
  | 'cancelled'

export interface OperationPatchTarget {
  module: OperationPatchModule
  scopeId: string
  unitId?: string
  parentId?: string
  queueKey?: string
}

export interface OperationUnitSnapshot<TFields extends Record<string, unknown> = Record<string, unknown>> {
  unitId: string
  parentId?: string
  orderIndex?: number
  title?: string
  unitType?: string
  fields?: TFields
}

export type OperationPatchChange<TFields extends Record<string, unknown> = Record<string, unknown>> =
  | {
      type: 'addUnit'
      unit: OperationUnitSnapshot<TFields>
      parentId?: string
      orderIndex?: number
    }
  | {
      type: 'removeUnit'
      unitId: string
      snapshot: OperationUnitSnapshot<TFields>
    }
  | {
      type: 'updateFields'
      unitId: string
      before: Partial<TFields>
      after: Partial<TFields>
      draftVersion?: number
    }
  | {
      type: 'moveUnit'
      unitId: string
      fromParentId?: string
      toParentId?: string
      fromOrderIndex?: number
      toOrderIndex?: number
    }
  | {
      type: 'sortChildren'
      parentId: string
      beforeOrder: string[]
      afterOrder: string[]
    }
  | {
      type: 'markStatus'
      unitId: string
      beforeStatus?: string
      afterStatus: string
    }
  | {
      type: 'custom'
      label: string
      payload: TFields
    }

export interface OperationPatch<TFields extends Record<string, unknown> = Record<string, unknown>> {
  id: string
  kind: OperationPatchKind
  target: OperationPatchTarget
  version: number
  createdAt: number
  changes: OperationPatchChange<TFields>[]
  reason?: string
  metadata?: Record<string, unknown>
}

export type UndoPatch<TFields extends Record<string, unknown> = Record<string, unknown>> = OperationPatch<TFields> & {
  kind: 'undo'
  sourcePatchId: string
}

export type RedoPatch<TFields extends Record<string, unknown> = Record<string, unknown>> = OperationPatch<TFields> & {
  kind: 'redo'
  sourcePatchId: string
}

export interface OperationToken {
  id: string
  queueKey: string
  version: number
  cancelled: boolean
}

export interface PendingOperation<TFields extends Record<string, unknown> = Record<string, unknown>> {
  id: string
  patch: OperationPatch<TFields>
  queueKey: string
  token: OperationToken
  status: PendingOperationStatus
  undoPatch?: UndoPatch<TFields>
  redoPatch?: RedoPatch<TFields>
  createdAt: number
  updatedAt: number
  error?: unknown
}

export function createPatchId(prefix = 'op'): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

export function createOperationPatch<TFields extends Record<string, unknown> = Record<string, unknown>>(
  input: Omit<OperationPatch<TFields>, 'id' | 'createdAt'> & { id?: string; createdAt?: number }
): OperationPatch<TFields> {
  return {
    ...input,
    id: input.id ?? createPatchId(),
    createdAt: input.createdAt ?? Date.now()
  }
}

export function createUndoPatch<TFields extends Record<string, unknown> = Record<string, unknown>>(
  source: OperationPatch<TFields>,
  changes: OperationPatchChange<TFields>[],
  options: Partial<Pick<UndoPatch<TFields>, 'id' | 'createdAt' | 'metadata' | 'reason'>> = {}
): UndoPatch<TFields> {
  return {
    id: options.id ?? createPatchId('undo'),
    kind: 'undo',
    sourcePatchId: source.id,
    target: source.target,
    version: source.version,
    createdAt: options.createdAt ?? Date.now(),
    changes,
    reason: options.reason,
    metadata: options.metadata
  }
}

export function createRedoPatch<TFields extends Record<string, unknown> = Record<string, unknown>>(
  source: OperationPatch<TFields>,
  changes: OperationPatchChange<TFields>[] = source.changes,
  options: Partial<Pick<RedoPatch<TFields>, 'id' | 'createdAt' | 'metadata' | 'reason'>> = {}
): RedoPatch<TFields> {
  return {
    id: options.id ?? createPatchId('redo'),
    kind: 'redo',
    sourcePatchId: source.id,
    target: source.target,
    version: source.version,
    createdAt: options.createdAt ?? Date.now(),
    changes,
    reason: options.reason,
    metadata: options.metadata
  }
}

export function deriveQueueKey(target: OperationPatchTarget): string {
  if (target.queueKey) return target.queueKey
  return [target.module, target.scopeId, target.unitId || target.parentId || 'scope'].join(':')
}

export function createPendingOperation<TFields extends Record<string, unknown> = Record<string, unknown>>(
  patch: OperationPatch<TFields>,
  token: OperationToken,
  options: {
    status?: PendingOperationStatus
    undoPatch?: UndoPatch<TFields>
    redoPatch?: RedoPatch<TFields>
    createdAt?: number
  } = {}
): PendingOperation<TFields> {
  const now = options.createdAt ?? Date.now()
  return {
    id: patch.id,
    patch,
    queueKey: token.queueKey,
    token,
    status: options.status ?? 'prepared',
    undoPatch: options.undoPatch,
    redoPatch: options.redoPatch,
    createdAt: now,
    updatedAt: now
  }
}

export function transitionPendingOperation<TFields extends Record<string, unknown> = Record<string, unknown>>(
  operation: PendingOperation<TFields>,
  status: PendingOperationStatus,
  options: { error?: unknown; updatedAt?: number } = {}
): PendingOperation<TFields> {
  return {
    ...operation,
    status,
    error: options.error,
    updatedAt: options.updatedAt ?? Date.now()
  }
}
