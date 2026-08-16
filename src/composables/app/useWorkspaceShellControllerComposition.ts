import { useWorkspaceShellControllerOpsComposition } from './useWorkspaceShellControllerOpsComposition'
import { useWorkspaceShellControllerFlowComposition } from './useWorkspaceShellControllerFlowComposition'
import { useWorkspaceShellControllerViewComposition } from './useWorkspaceShellControllerViewComposition'

export function useWorkspaceShellControllerComposition(ctx: any) {
  const opsHub = useWorkspaceShellControllerOpsComposition(ctx)
  const flowHub = useWorkspaceShellControllerFlowComposition({
    ...ctx,
    opsHub
  })
  const viewBridge = useWorkspaceShellControllerViewComposition({
    ...ctx,
    opsHub,
    flowHub
  })

  return {
    ...opsHub,
    ...flowHub,
    ...viewBridge
  }
}
