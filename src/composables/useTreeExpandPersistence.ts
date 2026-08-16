import { getLocalWorkspaceStorageKey } from '../app/localWorkspace'

// 树状结构展开态的通用持久化：只记录"哪些节点是展开的"，未记录的节点一律按折叠处理。
// 侧栏分组、文档库世界树、角色大脑节点树共用同一套读写口径。
export function useTreeExpandPersistence(baseStorageKey: string) {
  function loadExpandedIds(): Set<string> {
    if (typeof window === 'undefined') return new Set()
    try {
      const raw = window.localStorage.getItem(getLocalWorkspaceStorageKey(baseStorageKey))
      if (!raw) return new Set()
      const parsed = JSON.parse(raw)
      return new Set(Array.isArray(parsed) ? parsed.map((id) => String(id)) : [])
    } catch {
      return new Set()
    }
  }

  function saveExpandedIds(expandedIds: Iterable<string>) {
    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem(
        getLocalWorkspaceStorageKey(baseStorageKey),
        JSON.stringify(Array.from(new Set(expandedIds)))
      )
    } catch {
      // 本地存储写入失败（隐私模式/容量已满）时静默忽略，不影响当次展开态
    }
  }

  return { loadExpandedIds, saveExpandedIds }
}
