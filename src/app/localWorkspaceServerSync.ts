import {
  buildLocalArchiveRestorePayload,
  normalizeWorkspaceSnapshot
} from '../repositories/workspaceSnapshotRepository'
import type { WorkspaceHydrationSource } from './workspaceRuntimeStore'
import type { LocalArchiveModuleName } from '../composables/app/localArchiveShared'
import {
  fetchBootstrapSnapshotFromServer,
  fetchCanonicalWorkspaceSnapshotFromServer,
  persistLocalArchiveSnapshotPartitionsToServer
} from '../repositories/workspaceSnapshotServerRepository'

type WorkspaceKernelLike = {
  dispatch: (type: string, payload?: any) => Promise<any>
  applySnapshot: (snapshot: any, payload: { source: WorkspaceHydrationSource; message?: string }) => Promise<any>
}

type WorkspaceBootSessionLike = {
  persistBootSnapshot?: () => Promise<void> | void
  clearBootSnapshot?: () => Promise<void> | void
  restoreBootSnapshot?: () => Promise<boolean> | boolean
}

type WorkspaceRuntimeStoreLike = {
  setHydrationStage?: (stage: string, source: WorkspaceHydrationSource, message?: string, error?: string) => void
  failHydration?: (source: WorkspaceHydrationSource, error: string) => void
}

type CreateWorkspaceServerSyncDeps = {
  workspaceKernel: WorkspaceKernelLike
  workspaceBootSession?: WorkspaceBootSessionLike
  workspaceRuntimeStore?: WorkspaceRuntimeStoreLike
}

type RestoreSnapshotOptions = {
  source: 'import' | 'archive-restore'
  moduleNames?: LocalArchiveModuleName[]
  reloadMessage: string
}

function unwrapBootstrapPayload(snapshotEnvelope: any) {
  const payload = snapshotEnvelope && typeof snapshotEnvelope === 'object' && snapshotEnvelope.payload
    ? snapshotEnvelope.payload
    : snapshotEnvelope
  return payload && typeof payload === 'object' ? payload : {}
}

export function createLocalWorkspaceServerSync({
  workspaceKernel,
  workspaceBootSession,
  workspaceRuntimeStore
}: CreateWorkspaceServerSyncDeps) {
  async function restoreBootSnapshot() {
    return await workspaceBootSession?.restoreBootSnapshot?.()
  }

  async function bootstrapWorkspaceFromServer(options?: { message?: string }) {
    const message = options?.message || '正在装载工作区...'
    workspaceRuntimeStore?.setHydrationStage?.('booting', 'bootstrap', '正在读取启动快照...')
    try {
      const bootstrapPayload = await fetchBootstrapSnapshotFromServer()
      await workspaceBootSession?.clearBootSnapshot?.()
      const result = await workspaceKernel.dispatch('workspace/bootstrapWorkspace', {
        snapshot: bootstrapPayload,
        message
      })
      await workspaceBootSession?.persistBootSnapshot?.()
      return result?.data ?? result
    } catch (error: any) {
      workspaceRuntimeStore?.failHydration?.('bootstrap', error?.message || '数据加载失败')
      throw error
    }
  }

  async function persistLocalArchiveSnapshotToServer(snapshot: any, moduleNames?: LocalArchiveModuleName[]) {
    await persistLocalArchiveSnapshotPartitionsToServer(buildLocalArchiveRestorePayload(snapshot), moduleNames)
  }

  async function fetchCanonicalSnapshotFromServer(source: 'import' | 'archive-restore') {
    return await fetchCanonicalWorkspaceSnapshotFromServer(source)
  }

  async function restoreSnapshotFromServer(snapshot: unknown, options: RestoreSnapshotOptions) {
    await persistLocalArchiveSnapshotToServer(normalizeWorkspaceSnapshot(snapshot, 'archive'), options.moduleNames)
    const canonicalSnapshot = await fetchCanonicalSnapshotFromServer(options.source)
    await workspaceKernel.applySnapshot(canonicalSnapshot, {
      source: options.source,
      message: options.reloadMessage
    })
    return canonicalSnapshot
  }

  return {
    restoreBootSnapshot,
    bootstrapWorkspaceFromServer,
    persistLocalArchiveSnapshotToServer,
    fetchCanonicalSnapshotFromServer,
    restoreSnapshotFromServer
  }
}
