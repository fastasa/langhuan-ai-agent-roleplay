import { computed } from 'vue'
import { getChatStoreActiveTargetId } from '../../repositories/chatRepository'
import { useAppShellFlowHub } from './useAppShellFlowHub'
import { buildAppShellControllerFlowHubContext } from './useAppShellAssemblers'
import { buildWorkspaceShellFlowHubArgs } from './useWorkspaceShellControllerAssemblers'
import { buildWorkspaceShellControllerFlowDomainBindings } from './useWorkspaceShellControllerFlowDomainBindings'
import { buildWorkspaceShellControllerFlowRuntimeBindings } from './useWorkspaceShellControllerFlowRuntimeBindings'

export function useWorkspaceShellControllerFlowComposition(ctx: any) {
  const { boot, domains, opsHub, transactionFacade } = ctx
  const { chatStore } = boot

  const currentTargetId = computed(() => String(getChatStoreActiveTargetId(chatStore) || ''))
  const domainBindings = buildWorkspaceShellControllerFlowDomainBindings({
    boot,
    domains,
    opsHub,
    transactionFacade,
    currentTargetId
  })
  const runtimeBindings = buildWorkspaceShellControllerFlowRuntimeBindings({
    boot,
    opsHub
  })

  const flowHub = useAppShellFlowHub(buildAppShellControllerFlowHubContext(buildWorkspaceShellFlowHubArgs({
    ...domainBindings,
    ...runtimeBindings
  })))

  transactionFacade.bindImplementations({
    addTransaction: flowHub.addTransaction,
    completeTaskWithPause: flowHub.completeTaskWithPause,
    queueTaskFailure: flowHub.queueTaskFailure,
    getAIOptionsForTickets: flowHub.getAIOptionsForTickets
  })

  return flowHub
}
