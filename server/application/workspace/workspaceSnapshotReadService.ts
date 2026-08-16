import { toBootstrapSnapshot, toLocalArchiveSnapshot } from '../../mappers/workspaceSnapshotMapper.js'
import type { BootstrapSnapshotV1, LocalArchiveSnapshotV1 } from '../../snapshots/contracts.js'
import { readWorkspaceExportPayload } from '../../repositories/workspaceSnapshotReadRepository.js'
import type { WorkspaceSnapshotReadOptions } from '../../repositories/workspaceSnapshot/readPayload.js'

type WorkspaceSnapshotReadServiceDeps = {
  readWorkspaceExportPayload: (options?: WorkspaceSnapshotReadOptions) => unknown
}

export class WorkspaceSnapshotReadService {
  constructor(
    private readonly deps: WorkspaceSnapshotReadServiceDeps = {
      readWorkspaceExportPayload
    }
  ) {}

  exportBootstrapSnapshot(): BootstrapSnapshotV1 {
    return toBootstrapSnapshot(this.deps.readWorkspaceExportPayload({
      includeAllChats: false,
      includeChatMetadata: true
    }))
  }

  exportLocalArchiveSnapshot(): LocalArchiveSnapshotV1 {
    return toLocalArchiveSnapshot(this.deps.readWorkspaceExportPayload({ includeAllChats: true }))
  }

  getBootstrapSnapshot(): BootstrapSnapshotV1 {
    return this.exportBootstrapSnapshot()
  }

  getLocalArchiveSnapshot(): LocalArchiveSnapshotV1 {
    return this.exportLocalArchiveSnapshot()
  }
}

export const workspaceSnapshotReadService = new WorkspaceSnapshotReadService()
