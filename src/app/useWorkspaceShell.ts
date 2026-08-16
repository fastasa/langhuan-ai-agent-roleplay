import { computed, type Ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useWorkspaceRuntimeStore } from './workspaceRuntimeStore'
import { createWorkspaceKernel } from './workspaceKernel'
import { bindWorkspaceRuntimeSources } from './workspaceRuntimeBindings'

type WorkspaceShellDeps = {
  resourceStore: any
  charStore: any
  chatStore: any
  settingStore: any
  taskStore: any
  timerComposable: any
  customTags: Ref<any[]>
  eventStack: Ref<any[]>
  streamingText: Ref<string>
  currentStreamingSpeakerName: Ref<string>
}

export function useWorkspaceShell({
  resourceStore,
  charStore,
  chatStore,
  settingStore,
  taskStore,
  timerComposable,
  customTags,
  eventStack,
  streamingText,
  currentStreamingSpeakerName
}: WorkspaceShellDeps) {
  const workspaceRuntimeStore = useWorkspaceRuntimeStore()
  const workspaceRuntimeRefs = storeToRefs(workspaceRuntimeStore)
  const {
    workspaceKernel,
    workspaceCommandRegistry,
    workspaceBootSession,
    workspaceInternal
  } = createWorkspaceKernel({
    resourceStore,
    charStore,
    chatStore,
    settingStore,
    taskStore,
    runtimeStore: workspaceRuntimeStore,
    timerComposable,
    customTags,
    eventStack
  })

  bindWorkspaceRuntimeSources({
    workspaceRuntimeStore,
    taskStore,
    chatStore,
    timerComposable,
    streamingText,
    currentStreamingSpeakerName
  })

  const isBootLoading = computed(() => workspaceRuntimeStore.isHydrating)
  const runtimeTransactions = computed(() => workspaceRuntimeStore.pendingTransactions)
  const localArchiveActionState = computed(() => workspaceRuntimeStore.localArchiveActionState)
  const workspaceLoadingStage = computed(() => workspaceKernel.getViewState().hydrationStage)
  const workspaceLoadingMessage = computed(() => {
    const viewState = workspaceKernel.getViewState()
    return viewState.hydrationError || viewState.hydrationMessage || ''
  })

  return {
    workspaceKernel,
    workspaceCommandRegistry,
    workspaceBootSession,
    configurePostHydrationSync: workspaceInternal.configurePostHydrationSync,
    workspaceRuntimeStore,
    isBootLoading,
    runtimeTransactions,
    localArchiveActionState,
    workspaceLoadingStage,
    workspaceLoadingMessage
  }
}
