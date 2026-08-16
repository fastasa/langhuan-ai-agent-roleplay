import { useWorkspaceShell } from '../../app/useWorkspaceShell'

export function useWorkspaceRuntime(ctx: any) {
  return useWorkspaceShell(ctx)
}
