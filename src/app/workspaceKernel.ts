import type { Ref } from 'vue'
import type { WorkspaceSnapshotV1 } from '../types/workspace'
import { createWorkspaceCommandBus } from './workspaceCommandBus'
import type { WorkspaceHydrationSource, useWorkspaceRuntimeStore } from './workspaceRuntimeStore'
import { createWorkspaceHydrator } from './workspaceHydrator'
import { createWorkspaceTargetProjection } from './workspaceTargetProjection'
import type { useResourceStore } from '../stores/resourceStore'
import type { useCharacterStore } from '../stores/characterStore'
import type { useChatStore } from '../stores/chatStore'
import type { useSettingStore } from '../stores/settingStore'
import type { useTaskStore } from '../stores/taskStore'

type ResourceStore = ReturnType<typeof useResourceStore>
type CharacterStore = ReturnType<typeof useCharacterStore>
type ChatStore = ReturnType<typeof useChatStore>
type SettingStore = ReturnType<typeof useSettingStore>
type TaskStore = ReturnType<typeof useTaskStore>
type WorkspaceRuntimeStore = ReturnType<typeof useWorkspaceRuntimeStore>

type WorkspaceKernelDeps = {
  resourceStore: ResourceStore
  charStore: CharacterStore
  chatStore: ChatStore
  settingStore: SettingStore
  taskStore: TaskStore
  runtimeStore: WorkspaceRuntimeStore
  timerComposable?: {
    getSerializableTimers?: () => any[]
    replaceTimersFromLocalArchive?: (timers: any[]) => Promise<void>
  }
  customTags?: Ref<any[]>
  eventStack?: Ref<any[]>
}

type ApplySnapshotPayload = {
  snapshot: WorkspaceSnapshotV1 | Record<string, unknown>
  source: WorkspaceHydrationSource
  message?: string
}

type BootstrapWorkspacePayload = {
  snapshot: WorkspaceSnapshotV1 | Record<string, unknown>
  rememberedTarget?: string
  message?: string
}

export function createWorkspaceKernel(deps: WorkspaceKernelDeps) {
  const hydrator = createWorkspaceHydrator(deps)
  const commandBus = createWorkspaceCommandBus(deps.runtimeStore)
  const workspaceTargetProjection = createWorkspaceTargetProjection({
    chatStore: deps.chatStore,
    charStore: deps.charStore
  })
  const postHydrationSync = {
    reloadCustomTags: undefined as undefined | (() => Promise<void> | void),
    reloadEventStack: undefined as undefined | (() => Promise<void> | void)
  }

  async function runPostHydrationSync() {
    try {
      await postHydrationSync.reloadCustomTags?.()
    } catch (error) {
      console.warn('刷新自定义标签失败，继续使用主工作区快照:', error)
    }
    try {
      await postHydrationSync.reloadEventStack?.()
    } catch (error) {
      console.warn('刷新事栈失败，继续使用主工作区快照:', error)
    }
  }

  commandBus.registerHandler<ApplySnapshotPayload>('workspace/applySnapshot', async (payload) => {
    const appliedSnapshot = await hydrator.applySnapshot(payload?.snapshot, {
      source: payload?.source || 'unknown',
      message: payload?.message || ''
    })
    await runPostHydrationSync()
    return appliedSnapshot
  })
  commandBus.registerHandler<Omit<ApplySnapshotPayload, 'source'>>('workspace/bootstrapSnapshot', async (payload) => {
    const appliedSnapshot = await hydrator.applySnapshot(payload?.snapshot, {
      source: 'bootstrap',
      message: payload?.message || ''
    })
    await runPostHydrationSync()
    return appliedSnapshot
  })
  commandBus.registerHandler<Omit<ApplySnapshotPayload, 'source'>>('workspace/importSnapshot', async (payload) => {
    const appliedSnapshot = await hydrator.applySnapshot(payload?.snapshot, {
      source: 'import',
      message: payload?.message || ''
    })
    await runPostHydrationSync()
    return appliedSnapshot
  })
  commandBus.registerHandler<Omit<ApplySnapshotPayload, 'source'>>('workspace/localArchiveSnapshot', async (payload) => {
    const appliedSnapshot = await hydrator.applySnapshot(payload?.snapshot, {
      source: 'archive-restore',
      message: payload?.message || ''
    })
    await runPostHydrationSync()
    return appliedSnapshot
  })
  commandBus.registerHandler<BootstrapWorkspacePayload>('workspace/bootstrapWorkspace', async (payload) => {
    const appliedSnapshot = await hydrator.applySnapshot(payload?.snapshot, {
      source: 'bootstrap',
      message: payload?.message || ''
    })
    await restoreWorkspaceTarget(appliedSnapshot, payload?.rememberedTarget)
    await runPostHydrationSync()
    return appliedSnapshot
  })

  async function dispatchSnapshotCommand(command: string, snapshot: any, payload: { message?: string }) {
    const result = await commandBus.dispatch(command, {
      snapshot,
      message: payload.message
    })
    return result.data
  }

  async function applySnapshot(snapshot: any, payload: Omit<ApplySnapshotPayload, 'snapshot'>) {
    if (payload.source === 'bootstrap') {
      return await commandBus.dispatch('workspace/bootstrapWorkspace', {
        snapshot,
        message: payload.message
      }).then((result) => result.data)
    }
    if (payload.source === 'import') {
      return await dispatchSnapshotCommand('workspace/importSnapshot', snapshot, payload)
    }
    if (payload.source === 'archive-restore') {
      return await dispatchSnapshotCommand('workspace/localArchiveSnapshot', snapshot, payload)
    }
    const result = await commandBus.dispatch('workspace/applySnapshot', {
      snapshot,
      source: payload.source,
      message: payload.message
    })
    return result.data
  }

  function getViewState() {
    return {
      hydrationStage: deps.runtimeStore.hydration.stage,
      hydrationSource: deps.runtimeStore.hydration.source,
      hydrationMessage: deps.runtimeStore.hydration.message,
      hydrationError: deps.runtimeStore.hydration.error,
      isHydrating: deps.runtimeStore.isHydrating
    }
  }

  return {
    workspaceKernel: {
      dispatch: commandBus.dispatch,
      applySnapshot,
      getViewState
    },
    workspaceCommandRegistry: {
      registerCommand: commandBus.registerHandler,
      executeCommand: async <TPayload = unknown, TResult = unknown>(type: string, payload: TPayload) => {
        const result = await commandBus.dispatch<TPayload, TResult>(type, payload)
        return result.data
      }
    },
    workspaceInternal: {
      configurePostHydrationSync(nextSync: {
        reloadCustomTags?: () => Promise<void> | void
        reloadEventStack?: () => Promise<void> | void
      }) {
        postHydrationSync.reloadCustomTags = nextSync?.reloadCustomTags
        postHydrationSync.reloadEventStack = nextSync?.reloadEventStack
      }
    },
    workspaceBootSession: {
      persistBootSnapshot: hydrator.persistBootSnapshot,
      clearBootSnapshot: hydrator.clearBootSnapshot,
      restoreBootSnapshot: hydrator.restoreBootSnapshot
    }
  }

  async function restoreWorkspaceTarget(snapshot: WorkspaceSnapshotV1, rememberedTarget = '') {
    await workspaceTargetProjection.restoreBootstrapTarget(snapshot, rememberedTarget)
  }
}
