import { useAppShellViewBridge } from './useAppShellViewBridge'
import { buildAppShellControllerViewBridgeContext } from './useAppShellAssemblers'
import { buildWorkspaceShellViewBridgeArgs } from './useWorkspaceShellControllerAssemblers'
import { buildWorkspaceShellControllerViewCommandBindings } from './useWorkspaceShellControllerViewCommandBindings'
import { buildWorkspaceShellControllerViewStateBindings } from './useWorkspaceShellControllerViewStateBindings'
import { buildWorkspaceShellControllerViewBridgeScalars } from './useWorkspaceShellControllerViewBridgeScalars'

export function useWorkspaceShellControllerViewComposition(ctx: any) {
  const { boot, domains, opsHub, flowHub, transactionFacade } = ctx
  const { environmentOps } = boot
  const commandActions = buildWorkspaceShellControllerViewCommandBindings({
    boot,
    domains,
    workspaceCommandRegistry: boot.workspaceRuntime.workspaceCommandRegistry,
    opsHub,
    flowHub,
    transactionFacade,
    apiPresetManager: ctx.domains.apiPresetManager,
    environmentOps
  })
  const {
    uiHelperBindings,
    environmentBindings,
    chatTargetBindings,
    derivedStateBindings,
    runtimeStateBindings,
    taskStateBindings
  } = buildWorkspaceShellControllerViewStateBindings({
    boot,
    domains,
    opsHub,
    flowHub
  })
  const bridgeScalars = buildWorkspaceShellControllerViewBridgeScalars(ctx)

  return useAppShellViewBridge(buildAppShellControllerViewBridgeContext(buildWorkspaceShellViewBridgeArgs({
    ...bridgeScalars,
    callAI: boot.callAI,
    callAIStream: boot.callAIStream,
    commandActions,
    uiHelperBindings,
    environmentBindings,
    chatTargetBindings,
    derivedStateBindings,
    runtimeStateBindings,
    taskStateBindings
  })))
}
