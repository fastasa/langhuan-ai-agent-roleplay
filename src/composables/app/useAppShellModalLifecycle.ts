import { useWorkspaceDialogs } from './useWorkspaceDialogs'
import { useWorkspaceLifecycle } from './useWorkspaceLifecycle'
import { buildAppLifecycleContext } from './useAppShellAssemblers'

export function useAppShellModalLifecycle(ctx: any) {
  const dialogState = useWorkspaceDialogs(ctx)
  useWorkspaceLifecycle(buildAppLifecycleContext(ctx))
  return dialogState
}
