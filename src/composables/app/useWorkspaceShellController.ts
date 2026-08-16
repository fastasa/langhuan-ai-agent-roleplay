import { useWorkspaceShellControllerBoot } from './useWorkspaceShellControllerBoot'
import { useWorkspaceShellControllerDomains } from './useWorkspaceShellControllerDomains'
import { createWorkspaceShellControllerTransactionFacade } from './useWorkspaceShellControllerTransactionFacade'
import { buildAppShellControllerReturn } from './useAppShellAssemblers'
import { useWorkspaceShellControllerComposition } from './useWorkspaceShellControllerComposition'
import { buildWorkspaceShellControllerDomainContext } from './useWorkspaceShellControllerDomainContext'
import { buildWorkspaceShellControllerReturnContext } from './useWorkspaceShellControllerReturnContext'

export function useWorkspaceShellController() {
  const boot = useWorkspaceShellControllerBoot()
  const domains = useWorkspaceShellControllerDomains(buildWorkspaceShellControllerDomainContext(boot))
  const transactionFacade = createWorkspaceShellControllerTransactionFacade()
  const composition = useWorkspaceShellControllerComposition({
    boot,
    domains,
    transactionFacade
  })
  return buildAppShellControllerReturn(buildWorkspaceShellControllerReturnContext({
    boot,
    composition
  }))
}
