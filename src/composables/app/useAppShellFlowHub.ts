import { useWorkspaceDialogs } from './useWorkspaceDialogs'
import { useWorkspaceLifecycle } from './useWorkspaceLifecycle'
import { useAppShellCommandFlow } from './useAppShellCommandFlow'
import {
  buildAppLifecycleContext,
  buildAppShellCommandFlowContext
} from './useAppShellAssemblers'

export function useAppShellFlowHub(ctx: any) {
  const dialogState = useWorkspaceDialogs(ctx)
  useWorkspaceLifecycle(buildAppLifecycleContext(ctx))

  const commandFlow = useAppShellCommandFlow(buildAppShellCommandFlowContext(ctx))

  return {
    ...dialogState,
    ...commandFlow
  }
}
