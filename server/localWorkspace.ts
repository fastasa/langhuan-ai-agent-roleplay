import { AsyncLocalStorage } from 'node:async_hooks'
import type { NextFunction, Request, Response } from 'express'

/**
 * 开源版只有一个本机工作区。这是数据分区标识，不是账号、会话或权限身份。
 * 保留稳定标识可以让旧数据层的 user_id/workspace_id 列在迁移期间继续可用。
 */
export const LOCAL_WORKSPACE_USER_ID = 'local'
export const LOCAL_WORKSPACE_ID = 'local'

export type DataScope = {
  userId: typeof LOCAL_WORKSPACE_USER_ID
  workspaceId: typeof LOCAL_WORKSPACE_ID
}

const LOCAL_SCOPE: DataScope = {
  userId: LOCAL_WORKSPACE_USER_ID,
  workspaceId: LOCAL_WORKSPACE_ID
}

const storage = new AsyncLocalStorage<DataScope>()

export function getActiveDataScope(): DataScope {
  return storage.getStore() ?? LOCAL_SCOPE
}

export function getActiveUserId(): string {
  return getActiveDataScope().userId
}

export function getActiveWorkspaceId(): string {
  return getActiveDataScope().workspaceId
}

export function withDataScope<T>(_scope: DataScope | null | undefined, run: () => T): T {
  return storage.run(LOCAL_SCOPE, run)
}

export function attachLocalWorkspace(_req: Request, _res: Response, next: NextFunction): void {
  storage.run(LOCAL_SCOPE, next)
}
