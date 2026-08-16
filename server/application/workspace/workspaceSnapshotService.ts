import type { BootstrapSnapshotV1, LocalArchiveSnapshotV1 } from '../../snapshots/contracts.js'
import type { WorkspaceSnapshotModule } from '../../repositories/workspaceSnapshotRestoreRepository.js'
import { workspaceSnapshotReadService, type WorkspaceSnapshotReadService } from './workspaceSnapshotReadService.js'
import { workspaceSnapshotRestoreService, type WorkspaceSnapshotRestoreService } from './workspaceSnapshotRestoreService.js'

export class WorkspaceSnapshotService {
  constructor(
    private readonly readService: Pick<WorkspaceSnapshotReadService, 'exportBootstrapSnapshot' | 'exportLocalArchiveSnapshot'> = workspaceSnapshotReadService,
    private readonly restoreService: Pick<WorkspaceSnapshotRestoreService, 'applyLocalArchiveSnapshotRestore' | 'applyLocalArchiveSnapshotPartitionRestore'> = workspaceSnapshotRestoreService
  ) {}

  exportBootstrapSnapshot(): BootstrapSnapshotV1 {
    return this.readService.exportBootstrapSnapshot()
  }

  exportLocalArchiveSnapshot(): LocalArchiveSnapshotV1 {
    return this.readService.exportLocalArchiveSnapshot()
  }

  applyLocalArchiveSnapshotRestore(input: unknown): { ok: true } {
    return this.restoreService.applyLocalArchiveSnapshotRestore(input)
  }

  applyLocalArchiveSnapshotPartitionRestore(input: unknown, modules: WorkspaceSnapshotModule[]): { ok: true } {
    return this.restoreService.applyLocalArchiveSnapshotPartitionRestore(input, modules)
  }

  getBootstrapSnapshot(): BootstrapSnapshotV1 {
    return this.exportBootstrapSnapshot()
  }

  getLocalArchiveSnapshot(): LocalArchiveSnapshotV1 {
    return this.exportLocalArchiveSnapshot()
  }

  restoreLocalArchiveSnapshot(input: unknown): { ok: true } {
    return this.applyLocalArchiveSnapshotRestore(input)
  }

  restoreLocalArchiveSnapshotPartitions(input: unknown, modules: WorkspaceSnapshotModule[]): { ok: true } {
    return this.applyLocalArchiveSnapshotPartitionRestore(input, modules)
  }
}

export const workspaceSnapshotService = new WorkspaceSnapshotService()
