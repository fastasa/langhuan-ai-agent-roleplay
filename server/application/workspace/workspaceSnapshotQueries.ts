import type { BootstrapSnapshotV1, LocalArchiveSnapshotV1, WorkspaceSnapshotEnvelope } from '../../snapshots/contracts.js'
import { applicationFailure, applicationSuccess, type ApplicationResult } from '../shared/applicationResult.js'
import { workspaceSnapshotService, type WorkspaceSnapshotService } from './workspaceSnapshotService.js'
import { wrapWorkspaceSnapshotEnvelope } from '../../mappers/workspaceSnapshotMapper.js'

function toErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

export function createWorkspaceSnapshotQueryHandler(
  service: Pick<WorkspaceSnapshotService, 'exportBootstrapSnapshot' | 'exportLocalArchiveSnapshot'> = workspaceSnapshotService
) {
  return {
    getBootstrapSnapshot(): ApplicationResult<WorkspaceSnapshotEnvelope<BootstrapSnapshotV1>> {
      try {
        return applicationSuccess(
          wrapWorkspaceSnapshotEnvelope(service.exportBootstrapSnapshot(), 'bootstrap')
        )
      } catch (error) {
        return applicationFailure('WORKSPACE_BOOTSTRAP_QUERY_FAILED', toErrorMessage(error, '加载工作区快照失败'), error)
      }
    },
    getLocalArchiveSnapshot(): ApplicationResult<WorkspaceSnapshotEnvelope<LocalArchiveSnapshotV1>> {
      try {
        return applicationSuccess(
          wrapWorkspaceSnapshotEnvelope(service.exportLocalArchiveSnapshot(), 'archive')
        )
      } catch (error) {
        return applicationFailure('WORKSPACE_ARCHIVE_QUERY_FAILED', toErrorMessage(error, '导出本地归档失败'), error)
      }
    }
  }
}

export const workspaceSnapshotQueryHandler = createWorkspaceSnapshotQueryHandler()
