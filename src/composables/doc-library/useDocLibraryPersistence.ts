import {
  applyDocLibraryTreeCommand,
  buildDocLibraryTreeCommandResult,
  type DocLibraryTreeCommand,
  type DocLibraryTreeCommandState
} from '../../app/docLibraryTreeCommands'
import { createOperationPatch } from '../../app/operationPatches'
import type { OperationPatchKind, PendingOperation, PendingOperationStatus } from '../../app/operationPatches'
import type { BrainDocumentRecord } from '../../types'
import { measureAsync } from '../../utils/performanceMarks'
import { measureSync } from '../../utils/performanceMarks'

export type DocLibraryPersistenceSnapshot = ReturnType<typeof buildDocLibraryTreeCommandResult>

export type DocLibraryPersistenceOptions = {
  getState: () => DocLibraryTreeCommandState
  applySnapshot: (snapshot: DocLibraryPersistenceSnapshot) => void
  setDocuments: (documents: BrainDocumentRecord[]) => void
  saveSnapshot: (snapshot: DocLibraryPersistenceSnapshot) => Promise<void>
  getParentFolderPathFromDisplayPath: (displayPath: string) => string
  onSaveError?: (error: unknown) => void
  onOperationStatus?: (event: DocLibraryPersistenceOperationEvent) => void
}

export type DocLibraryPersistenceMode = 'optimistic' | 'confirmed'

export type DocLibraryPersistenceOperationTarget = {
  documentIds: string[]
  folderPaths: string[]
  parentFolderId?: string
}

export type DocLibraryPersistenceOperationEvent = {
  operation: PendingOperation
  status: PendingOperationStatus
  target: DocLibraryPersistenceOperationTarget
  mode: DocLibraryPersistenceMode
}

export function getDocLibraryTreeCommandKind(command: DocLibraryTreeCommand): OperationPatchKind {
  if (command.type === 'delete_documents' || command.type === 'delete_folder') return 'delete'
  if (command.type === 'rename_document' || command.type === 'rename_folder') return 'rename'
  if (command.type === 'move_documents' || command.type === 'move_folder') return 'move'
  if (command.type === 'sort_children') return 'sort'
  return 'create'
}

export function getDocLibraryTreeCommandTarget(command: DocLibraryTreeCommand): DocLibraryPersistenceOperationTarget {
  if (command.type === 'delete_documents') {
    return { documentIds: [...command.documentIds], folderPaths: [] }
  }
  if (command.type === 'delete_folder') {
    return { documentIds: [], folderPaths: [command.folderPath] }
  }
  if (command.type === 'rename_document') {
    return { documentIds: [command.documentId], folderPaths: [] }
  }
  if (command.type === 'rename_folder') {
    return { documentIds: [], folderPaths: [command.sourcePath, command.targetPath] }
  }
  if (command.type === 'upsert_document') {
    return {
      documentIds: [command.document.documentId || command.document.id || ''].filter(Boolean),
      folderPaths: [],
      parentFolderId: command.parentFolderId
    }
  }
  if (command.type === 'move_documents') {
    return { documentIds: [...command.documentIds], folderPaths: [], parentFolderId: command.parentFolderId }
  }
  if (command.type === 'move_folder') {
    return { documentIds: [], folderPaths: [command.sourcePath, command.parentFolderId], parentFolderId: command.parentFolderId }
  }
  if (command.type === 'sort_children') {
    return {
      documentIds: command.childEntryIds
        .filter((entry) => entry.startsWith('document:'))
        .map((entry) => entry.replace(/^document:/, '')),
      folderPaths: command.childEntryIds
        .filter((entry) => entry.startsWith('folder:'))
        .map((entry) => entry.replace(/^folder:/, '')),
      parentFolderId: command.parentFolderId
    }
  }
  return { documentIds: [], folderPaths: [] }
}

function normalizeTargetIdList(values: string[]) {
  return [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))]
}

function createDocLibraryPendingOperation(
  command: DocLibraryTreeCommand,
  target: DocLibraryPersistenceOperationTarget,
  mode: DocLibraryPersistenceMode,
  status: PendingOperationStatus = 'prepared'
): PendingOperation {
  const kind = getDocLibraryTreeCommandKind(command)
  const documentIds = normalizeTargetIdList(target.documentIds)
  const folderPaths = normalizeTargetIdList(target.folderPaths)
  const parentFolderId = String(target.parentFolderId || '').trim()
  const scopeId = parentFolderId || folderPaths[0] || documentIds[0] || 'worldbook'
  const queueKey = ['doc-library', parentFolderId || folderPaths[0] || documentIds[0] || 'scope'].join(':')
  const patch = createOperationPatch({
    kind,
    version: 1,
    target: {
      module: 'doc-library',
      scopeId,
      unitId: documentIds[0] || folderPaths[0],
      parentId: parentFolderId || undefined,
      queueKey
    },
    changes: [{
      type: 'custom',
      label: `doc-library:${command.type}`,
      payload: {
        command,
        target: { documentIds, folderPaths, parentFolderId },
        mode
      } as Record<string, unknown>
    }],
    metadata: { commandType: command.type, mode }
  })
  const now = Date.now()
  return {
    id: patch.id,
    patch,
    queueKey,
    token: {
      id: `${patch.id}:v1`,
      queueKey,
      version: 1,
      cancelled: false
    },
    status,
    createdAt: now,
    updatedAt: now
  }
}

export function cloneDocLibraryDocuments(documents: BrainDocumentRecord[]) {
  return (Array.isArray(documents) ? documents : []).map((item) => ({ ...item }))
}

export function normalizeDocLibraryManualTreeOrders(input: unknown): Record<string, string[]> {
  const source = input && typeof input === 'object' ? input as Record<string, unknown> : {}
  return Object.fromEntries(
    Object.entries(source).map(([key, value]) => [
      String(key || '').trim(),
      Array.isArray(value) ? value.map((entry) => String(entry || '').trim()).filter(Boolean) : []
    ]).filter(([key]) => Boolean(key))
  )
}

export function normalizeDocLibraryTreeOrders(input: unknown) {
  return normalizeDocLibraryManualTreeOrders(input)
}

export function useDocLibraryPersistence(options: DocLibraryPersistenceOptions) {
  let persistChain: Promise<void> = Promise.resolve()

  function queuePersistence() {
    const snapshot = measureSync('docLibrary.snapshot.build', () => buildDocLibraryTreeCommandResult(options.getState()), {}, 20)
    return queueSnapshotPersistence(snapshot, { swallowErrors: true })
  }

  function applyLocalSnapshot(snapshot: DocLibraryPersistenceSnapshot) {
    measureSync('docLibrary.snapshot.applyLocal', () => {
      options.setDocuments(snapshot.documents)
      options.applySnapshot(snapshot)
    }, {
      documents: snapshot.documents.length,
      treeNodes: snapshot.treeNodes?.length || 0
    }, 20)
  }

  function emitOperationStatus(
    operation: PendingOperation,
    status: PendingOperationStatus,
    target: DocLibraryPersistenceOperationTarget,
    mode: DocLibraryPersistenceMode,
    error?: unknown
  ) {
    const nextOperation = {
      ...operation,
      status,
      error,
      updatedAt: Date.now()
    }
    options.onOperationStatus?.({
      operation: nextOperation,
      status,
      target,
      mode
    })
    return nextOperation
  }

  function queueSnapshotPersistence(
    snapshot: DocLibraryPersistenceSnapshot,
    config: { swallowErrors?: boolean; mode?: DocLibraryPersistenceMode } = {}
  ) {
    const mode = config.mode || 'optimistic'
    const rollbackSnapshot = mode === 'optimistic' ? buildDocLibraryTreeCommandResult(options.getState()) : null
    if (mode === 'optimistic') applyLocalSnapshot(snapshot)
    persistChain = persistChain
      .catch(() => {})
      .then(async () => {
        await measureAsync('docLibrary.snapshot.save', () => options.saveSnapshot(snapshot), {
          documents: snapshot.documents.length,
          treeNodes: snapshot.treeNodes?.length || 0
        }, 80)
        if (mode === 'confirmed') applyLocalSnapshot(snapshot)
      })
    if (config.swallowErrors) {
      persistChain = persistChain.catch((error) => {
        if (rollbackSnapshot) applyLocalSnapshot(rollbackSnapshot)
        options.onSaveError?.(error)
      })
    } else if (rollbackSnapshot) {
      persistChain = persistChain.catch((error) => {
        applyLocalSnapshot(rollbackSnapshot)
        options.onSaveError?.(error)
        throw error
      })
    }
    return persistChain
  }

  async function persistTreeCommand(command: DocLibraryTreeCommand, config: { mode?: DocLibraryPersistenceMode } = {}) {
    const mode = config.mode || 'optimistic'
    const target = getDocLibraryTreeCommandTarget(command)
    let operation = createDocLibraryPendingOperation(command, target, mode)
    options.onOperationStatus?.({ operation, status: operation.status, target, mode })
    const snapshot = measureSync('docLibrary.command.apply', () => applyDocLibraryTreeCommand(options.getState(), command), {
      type: command.type
    }, 20)
    try {
      operation = emitOperationStatus(operation, mode === 'optimistic' ? 'appliedLocal' : 'committing', target, mode)
      await queueSnapshotPersistence(snapshot, config)
      emitOperationStatus(operation, 'confirmed', target, mode)
      return snapshot
    } catch (error) {
      emitOperationStatus(operation, mode === 'optimistic' ? 'rolledBack' : 'failed', target, mode, error)
      throw error
    }
  }

  async function persistTreeCommands(commands: DocLibraryTreeCommand[], config: { mode?: DocLibraryPersistenceMode } = {}) {
    const safeCommands = commands.filter(Boolean)
    if (!safeCommands.length) return null
    const mode = config.mode || 'optimistic'
    const operations = safeCommands.map((command) => {
      const target = getDocLibraryTreeCommandTarget(command)
      const operation = createDocLibraryPendingOperation(command, target, mode)
      options.onOperationStatus?.({ operation, status: operation.status, target, mode })
      return { operation, target }
    })
    let state = options.getState()
    let snapshot: DocLibraryPersistenceSnapshot | null = null
    for (const command of safeCommands) {
      snapshot = measureSync('docLibrary.command.apply', () => applyDocLibraryTreeCommand(state, command), {
        type: command.type,
        batchSize: safeCommands.length
      }, 20)
      state = snapshot
    }
    if (!snapshot) return null
    try {
      operations.forEach((item) => {
        item.operation = emitOperationStatus(item.operation, mode === 'optimistic' ? 'appliedLocal' : 'committing', item.target, mode)
      })
      await queueSnapshotPersistence(snapshot, config)
      operations.forEach((item) => {
        emitOperationStatus(item.operation, 'confirmed', item.target, mode)
      })
      return snapshot
    } catch (error) {
      operations.forEach((item) => {
        emitOperationStatus(item.operation, mode === 'optimistic' ? 'rolledBack' : 'failed', item.target, mode, error)
      })
      throw error
    }
  }

  async function persistDocumentUpserts(nextDocuments: BrainDocumentRecord[], documentIds?: string[], config: { mode?: DocLibraryPersistenceMode } = {}) {
    const safeIds = documentIds
      ? new Set(documentIds.map((item) => String(item || '').trim()).filter(Boolean))
      : null
    const documents = nextDocuments.filter((item) => {
      const documentId = String(item.documentId || item.id || '').trim()
      return documentId && (!safeIds || safeIds.has(documentId))
    })
    if (!documents.length) return null
    let state = options.getState()
    let snapshot: DocLibraryPersistenceSnapshot | null = null
    for (const document of documents) {
      snapshot = measureSync('docLibrary.command.apply', () => applyDocLibraryTreeCommand(state, {
        type: 'upsert_document',
        document,
        parentFolderId: options.getParentFolderPathFromDisplayPath(document.displayPath)
      }), {
        type: 'upsert_document',
        documentId: document.documentId || document.id,
        batchSize: documents.length
      }, 20)
      state = snapshot
    }
    if (!snapshot) return null
    await queueSnapshotPersistence(snapshot, config)
    return snapshot
  }

  return {
    queuePersistence,
    queueSnapshotPersistence,
    persistTreeCommand,
    persistTreeCommands,
    persistDocumentUpserts
  }
}
