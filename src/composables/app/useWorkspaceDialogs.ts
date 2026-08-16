import { useModalStateBundles } from './useModalStateBundles'
import {
  buildModalStateBundlesContext
} from './useAppShellAssemblers'

export function useWorkspaceDialogs(ctx: any) {
  return useModalStateBundles(buildModalStateBundlesContext(ctx))
}
