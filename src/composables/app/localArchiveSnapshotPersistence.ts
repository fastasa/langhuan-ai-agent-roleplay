import { normalizeWorkspaceSnapshot } from '../../repositories/workspaceSnapshotRepository'
import type { LocalArchiveModuleName } from './localArchiveShared'
import { createLocalWorkspaceServerSync } from '../../app/localWorkspaceServerSync'

type LocalArchiveSnapshotPersistenceDeps = {
  workspaceKernel: any
}

type WorkspaceReloadSource = 'import' | 'archive-restore'

export function createLocalArchiveSnapshotPersistence({
  workspaceKernel
}: LocalArchiveSnapshotPersistenceDeps) {
  const localWorkspaceServerSync = createLocalWorkspaceServerSync({
    workspaceKernel
  })

  async function persistLocalArchiveSnapshotToServer(snapshot: any, moduleNames?: LocalArchiveModuleName[]) {
    await localWorkspaceServerSync.persistLocalArchiveSnapshotToServer(snapshot, moduleNames)
  }

  async function persistAppliedSnapshotToServer(snapshot: unknown, moduleNames?: LocalArchiveModuleName[]) {
    await persistLocalArchiveSnapshotToServer(normalizeWorkspaceSnapshot(snapshot, 'archive'), moduleNames)
  }

  async function fetchCanonicalSnapshotFromServer(source: WorkspaceReloadSource) {
    return await localWorkspaceServerSync.fetchCanonicalSnapshotFromServer(source)
  }

  async function applySnapshotToWorkspace(
    snapshot: unknown,
    options: { source: 'import' | 'archive-restore'; message: string }
  ) {
    await workspaceKernel.applySnapshot(
      normalizeWorkspaceSnapshot(snapshot, options.source === 'import' ? 'workspace' : 'archive'),
      options
    )
  }

  async function restoreSnapshotFromServer(
    snapshot: unknown,
    options: {
      source: WorkspaceReloadSource
      moduleNames?: LocalArchiveModuleName[]
      reloadMessage: string
    }
  ) {
    return await localWorkspaceServerSync.restoreSnapshotFromServer(snapshot, options)
  }
  return {
    persistLocalArchiveSnapshotToServer,
    persistAppliedSnapshotToServer,
    fetchCanonicalSnapshotFromServer,
    applySnapshotToWorkspace,
    restoreSnapshotFromServer
  }
}
