import { normalizeWorkspaceSnapshot } from '../../mappers/workspaceSnapshotMapper.js'
import { applyWorkspaceSnapshotRestore, type WorkspaceSnapshotModule } from '../../repositories/workspaceSnapshotRestoreRepository.js'
import db from '../../db.js'

export class WorkspaceSnapshotRestoreService {
  applyLocalArchiveSnapshotRestore(input: unknown): { ok: true } {
    return this.applyLocalArchiveSnapshotPartitionRestore(input)
  }

  applyLocalArchiveSnapshotPartitionRestore(input: unknown, modules?: WorkspaceSnapshotModule[]): { ok: true } {
    const payload = normalizeWorkspaceSnapshot(input || {}, 'archive')
    return applyWorkspaceSnapshotRestore(db, payload, modules)
  }

  restoreLocalArchiveSnapshot(input: unknown): { ok: true } {
    return this.applyLocalArchiveSnapshotRestore(input)
  }

  restoreLocalArchiveSnapshotPartitions(input: unknown, modules?: WorkspaceSnapshotModule[]): { ok: true } {
    return this.applyLocalArchiveSnapshotPartitionRestore(input, modules)
  }
}

export const workspaceSnapshotRestoreService = new WorkspaceSnapshotRestoreService()
