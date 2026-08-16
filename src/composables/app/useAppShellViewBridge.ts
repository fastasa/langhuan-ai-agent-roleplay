import { useWorkspacePanels } from './useWorkspacePanels'
import { buildAppShellPanelsContext } from './useAppShellAssemblers'
import { pickWorkspaceCommandActions } from './workspaceCommandHandlers'

export function useAppShellViewBridge(ctx: any) {
  const closeLocalArchive = async () => {
    await ctx.localArchiveSync.reset()
    if (ctx.localArchiveNote?.value !== undefined) {
      ctx.localArchiveNote.value = ''
    }
    await ctx.loadLocalArchiveSaves()
    ctx.toast('已关闭本地归档状态', 'info')
  }

  const panelBridge = useWorkspacePanels(buildAppShellPanelsContext({
    ...ctx,
    closeLocalArchive
  }))

  return {
    ...pickWorkspaceCommandActions(ctx),
    closeLocalArchive,
    ...panelBridge
  }
}
