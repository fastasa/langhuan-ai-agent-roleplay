import { API } from '../config/api'
import {
  buildLocalArchiveRestorePayload,
  normalizeWorkspaceSnapshot,
  toBootstrapSnapshot,
  toLocalArchiveSnapshot
} from './workspaceSnapshotRepository'
import { normalizeModuleNames, type LocalArchiveModuleName } from '../composables/app/localArchiveShared'

type CanonicalSnapshotSource = 'import' | 'archive-restore'

export async function fetchWith429Retry(
  input: RequestInfo | URL,
  init?: RequestInit,
  retries = 2,
  retryDelayMs = 800
) {
  let attempt = 0
  while (attempt <= retries) {
    const response = await fetch(input, init)
    if (response.ok || response.status !== 429 || attempt === retries) {
      return response
    }
    await new Promise((resolve) => setTimeout(resolve, retryDelayMs * (attempt + 1)))
    attempt += 1
  }
  throw new Error('请求失败')
}

export async function fetchBootstrapSnapshotFromServer() {
  const response = await fetchWith429Retry(API.ALL_DATA)
  if (!response.ok) {
    throw new Error(`服务器返回 ${response.status}`)
  }
  return toBootstrapSnapshot(await response.json())
}

export async function persistLocalArchiveSnapshotPartitionsToServer(snapshot: unknown, moduleNames?: LocalArchiveModuleName[]) {
  const normalizedSnapshot = buildLocalArchiveRestorePayload(snapshot)
  const normalizedModules = normalizeModuleNames(moduleNames)
  const requestUrl = normalizedModules.length > 0 ? API.LOCAL_RESTORE_PARTITIONS : API.LOCAL_RESTORE
  const requestBody = normalizedModules.length > 0
    ? { modules: normalizedModules, snapshot: normalizedSnapshot }
    : normalizedSnapshot
  const response = await fetchWith429Retry(requestUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody)
  })
  if (!response.ok) {
    throw new Error(`本地落库失败(${response.status})`)
  }
}

export async function fetchLocalArchiveExportSnapshotFromServer() {
  const response = await fetchWith429Retry(API.LOCAL_EXPORT)
  if (!response.ok) {
    throw new Error(`读取本地完整快照失败(${response.status})`)
  }
  return toLocalArchiveSnapshot(await response.json())
}

export async function fetchCanonicalWorkspaceSnapshotFromServer(source: CanonicalSnapshotSource) {
  const snapshotKind = source === 'archive-restore' ? 'archive' : 'workspace'
  const serverSnapshot = await fetchLocalArchiveExportSnapshotFromServer()
  return normalizeWorkspaceSnapshot({
    ...(serverSnapshot && typeof serverSnapshot === 'object' ? serverSnapshot : {}),
    snapshotKind
  }, snapshotKind)
}
