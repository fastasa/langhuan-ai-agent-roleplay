/**
 * 世界「挂载文档库」选择器的树形选取投影（纯函数·无状态）——
 * 把文档库正式 UnitView 投影（字段树 v2 / 路径树回退，由 buildDocLibraryUnitView 决定）
 * 压平成带缩进深度的行列表，并提供文件夹级联勾选、全选/半选态、搜索过滤、折叠可见性。
 *
 * 边界（和正式存储解耦）：
 * - 世界挂载真值是服务端 world_doc_library_links 的 documentId 平铺列表，本模块只负责选取交互；
 *   文件夹勾选=把「自身概览文档 + 全部后代文档」的 documentId 批量加入/移出草稿。
 * - 文件夹里以后新增的文档不会自动进入已存挂载（快照式勾选，非订阅式）。
 */

import type { UnitView } from '../types/unitView'

const DOC_ROOT_UNIT_ID = 'doc-tree:root'

export interface DocLibraryLinkTreeRow {
  /** 树节点稳定 id（unitId），折叠展开用。 */
  id: string
  title: string
  /** 展示路径（sourcePath），搜索时参与匹配。 */
  path: string
  /** 缩进深度：根的直接子级为 0。 */
  depth: number
  isFolder: boolean
  /** 本行自身代表的文档 id：文档=documentId；文件夹=概览文档 id（无概览则空）。 */
  docKey: string
  /** 勾选本行时联动的全部文档 id（含自身 docKey 与全部后代，去重）；空=不可勾选（空文件夹）。 */
  docKeys: string[]
  /** 直接父行 id（根的直接子级为 ''），折叠可见性用。 */
  parentRowId: string
}

function unitDocKey(unit: UnitView): string {
  const metadata = (unit.metadata || {}) as Record<string, unknown>
  if (unit.unitType === 'leaf') {
    return String(metadata.documentId || unit.sourceId || '').trim()
  }
  return String(metadata.overviewDocumentId || '').trim()
}

function isFolderUnit(unit: UnitView): boolean {
  return unit.unitType === 'cluster' || unit.unitType === 'branch'
}

/**
 * 把文档库 UnitView 投影压平成 DFS 顺序的树行列表。
 * 子级排序与主界面同口径：orderIndex 升序 → 标题 zh 排序。
 */
export function buildDocLibraryLinkTreeRows(units: UnitView[]): DocLibraryLinkTreeRow[] {
  const docUnits = (Array.isArray(units) ? units : []).filter(
    (unit) => unit.domain === 'docLibrary' && (isFolderUnit(unit) || unit.unitType === 'leaf')
  )
  const childrenByParent = new Map<string, UnitView[]>()
  for (const unit of docUnits) {
    const parentId = String(unit.parentId || DOC_ROOT_UNIT_ID)
    const bucket = childrenByParent.get(parentId)
    if (bucket) bucket.push(unit)
    else childrenByParent.set(parentId, [unit])
  }
  childrenByParent.forEach((bucket) => {
    bucket.sort((left, right) => {
      const leftOrder = left.orderIndex ?? Number.MAX_SAFE_INTEGER
      const rightOrder = right.orderIndex ?? Number.MAX_SAFE_INTEGER
      if (leftOrder !== rightOrder) return leftOrder - rightOrder
      return String(left.title || '').localeCompare(String(right.title || ''), 'zh-Hans-CN')
    })
  })

  const rows: DocLibraryLinkTreeRow[] = []
  const visiting = new Set<string>()
  const walk = (parentId: string, depth: number, parentRowId: string): string[] => {
    const collected: string[] = []
    for (const unit of childrenByParent.get(parentId) || []) {
      if (visiting.has(unit.unitId)) continue // 防环兜底（正式数据不应出现）
      visiting.add(unit.unitId)
      const row: DocLibraryLinkTreeRow = {
        id: unit.unitId,
        title: String(unit.title || '').trim() || '未命名',
        path: String(unit.sourcePath || '').trim(),
        depth,
        isFolder: isFolderUnit(unit),
        docKey: unitDocKey(unit),
        docKeys: [],
        parentRowId
      }
      rows.push(row)
      const childKeys = row.isFolder ? walk(unit.unitId, depth + 1, unit.unitId) : []
      const keys = row.docKey ? [row.docKey, ...childKeys] : childKeys
      row.docKeys = Array.from(new Set(keys))
      collected.push(...row.docKeys)
    }
    return collected
  }
  walk(DOC_ROOT_UNIT_ID, 0, '')
  return rows
}

export type DocLinkRowSelection = 'none' | 'partial' | 'all'

/** 行的勾选态：文档看自身；文件夹看联动集合（全含=all，部分=partial）。空集合恒为 none。 */
export function docLinkRowSelectionState(
  selectedKeys: ReadonlySet<string> | string[],
  row: DocLibraryLinkTreeRow
): DocLinkRowSelection {
  if (!row.docKeys.length) return 'none'
  const selected = selectedKeys instanceof Set ? selectedKeys : new Set(selectedKeys)
  let hit = 0
  for (const key of row.docKeys) if (selected.has(key)) hit += 1
  if (hit === 0) return 'none'
  return hit === row.docKeys.length ? 'all' : 'partial'
}

/** 勾选/取消一行：已全选→整组移出；否则整组并入（保持原有顺序，去重）。 */
export function toggleDocLinkRow(draft: string[], row: DocLibraryLinkTreeRow): string[] {
  if (!row.docKeys.length) return draft
  const group = new Set(row.docKeys)
  if (docLinkRowSelectionState(draft, row) === 'all') {
    return draft.filter((key) => !group.has(key))
  }
  const next = [...draft]
  for (const key of row.docKeys) if (!next.includes(key)) next.push(key)
  return next
}

/**
 * 搜索过滤：命中行（标题或路径含关键字）+ 其全部祖先（保持树上下文）+ 命中文件夹的全部后代。
 * 关键字为空返回原列表。
 */
export function filterDocLibraryLinkTreeRows(
  rows: DocLibraryLinkTreeRow[],
  keyword: string
): DocLibraryLinkTreeRow[] {
  const normalized = String(keyword || '').trim().toLowerCase()
  if (!normalized) return rows
  const matched = (row: DocLibraryLinkTreeRow) =>
    row.title.toLowerCase().includes(normalized) || row.path.toLowerCase().includes(normalized)

  const keep = new Set<string>()
  // DFS 平铺列表：用祖先栈标记「祖先命中→后代全保留」，再回传「后代命中→祖先保留」。
  const ancestorStack: DocLibraryLinkTreeRow[] = []
  for (const row of rows) {
    while (ancestorStack.length && ancestorStack[ancestorStack.length - 1].depth >= row.depth) {
      ancestorStack.pop()
    }
    const selfHit = matched(row)
    const ancestorHit = ancestorStack.some((ancestor) => keep.has(ancestor.id) && matched(ancestor))
    if (selfHit || ancestorHit) {
      keep.add(row.id)
      if (selfHit) for (const ancestor of ancestorStack) keep.add(ancestor.id)
    }
    if (row.isFolder) ancestorStack.push(row)
  }
  return rows.filter((row) => keep.has(row.id))
}

/** 折叠可见性：隐藏「任一祖先在 collapsedIds 里」的行（被折叠文件夹自身仍可见）。 */
export function applyDocLibraryLinkRowCollapse(
  rows: DocLibraryLinkTreeRow[],
  collapsedIds: ReadonlySet<string>
): DocLibraryLinkTreeRow[] {
  if (!collapsedIds.size) return rows
  const hiddenParents = new Set<string>()
  const visible: DocLibraryLinkTreeRow[] = []
  for (const row of rows) {
    if (row.parentRowId && hiddenParents.has(row.parentRowId)) {
      if (row.isFolder) hiddenParents.add(row.id)
      continue
    }
    visible.push(row)
    if (row.isFolder && collapsedIds.has(row.id)) hiddenParents.add(row.id)
  }
  return visible
}
