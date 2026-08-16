export const LOCAL_WORKSPACE_ID = 'local'
export const LOCAL_WORKSPACE_DISPLAY_NAME = '本地用户'

export function getLocalWorkspaceStorageKey(prefix: string) {
  return `${String(prefix || '').trim()}:${LOCAL_WORKSPACE_ID}`
}
