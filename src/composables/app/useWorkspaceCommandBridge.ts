import {
  createWorkspaceCommandActions,
  registerWorkspaceCommandBridge,
  type WorkspaceCommandBridgeContext
} from './workspaceCommandHandlers'

export function useWorkspaceCommandBridge(context: WorkspaceCommandBridgeContext) {
  const registeredWorkspaceCommands = new Set<string>()

  function toCommandError(error: unknown, fallbackMessage: string) {
    if (error instanceof Error) {
      return error
    }
    const raw = error && typeof error === 'object' ? error as Record<string, unknown> : null
    const message = typeof raw?.message === 'string' && raw.message.trim()
      ? raw.message.trim()
      : typeof raw?.error === 'string' && raw.error.trim()
        ? raw.error.trim()
        : fallbackMessage
    const normalized = new Error(message)
    ;(normalized as Error & { cause?: unknown }).cause = error
    return normalized
  }

  const runWorkspaceCommand = async (type: string, payload?: any) => {
    try {
      return await context.workspaceCommandRegistry.executeCommand(type, payload)
    } catch (error) {
      throw toCommandError(error, `${type} 执行失败`)
    }
  }

  registerWorkspaceCommandBridge(context, registeredWorkspaceCommands)

  return createWorkspaceCommandActions(runWorkspaceCommand)
}
