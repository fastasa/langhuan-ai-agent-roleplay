import { applicationFailure, applicationSuccess, type ApplicationResult } from '../shared/applicationResult.js'
import { workspaceSnapshotService, type WorkspaceSnapshotService } from './workspaceSnapshotService.js'

function toErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

export function createWorkspaceSnapshotCommandHandler(
  service: Pick<WorkspaceSnapshotService, 'applyLocalArchiveSnapshotRestore' | 'applyLocalArchiveSnapshotPartitionRestore'> = workspaceSnapshotService
) {
  return {
    restoreLocalArchiveSnapshot(input: unknown): ApplicationResult<{ ok: true }> {
      try {
        return applicationSuccess(service.applyLocalArchiveSnapshotRestore(input))
      } catch (error) {
        return applicationFailure('WORKSPACE_ARCHIVE_RESTORE_FAILED', toErrorMessage(error, 'archive-restore 失败'), error)
      }
    },
    restoreLocalArchiveSnapshotPartitions(input: unknown, modules: string[]): ApplicationResult<{ ok: true }> {
      try {
        return applicationSuccess(service.applyLocalArchiveSnapshotPartitionRestore(input, modules as any))
      } catch (error) {
        return applicationFailure('WORKSPACE_ARCHIVE_PARTITION_RESTORE_FAILED', toErrorMessage(error, 'archive-restore partitions 失败'), error)
      }
    }
  }
}

export const workspaceSnapshotCommandHandler = createWorkspaceSnapshotCommandHandler()
