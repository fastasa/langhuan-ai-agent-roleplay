import type { RelationViewRecord, UnitView } from '../types/unitView'
import { getDocLibraryParentFolderPath } from './docLibraryPathCompat'

export type DocLibraryRelationClipboardEntry = {
  kind: 'document' | 'folder'
  id: string
  label: string
}

export type DocLibraryRelationPasteTarget = {
  folderPath: string
  targetDocumentId?: string
}

export type DocLibraryWorldClusterRelationProjection = {
  forestRootUnitIds: string[]
  relations: RelationViewRecord[]
}

/**
 * 文档库根单位只是目录容器，不是各世界簇之间的业务关系。
 * 关系视图按世界簇拆成互不连通的森林，同时只在读取投影中屏蔽跨簇关系。
 */
export function buildDocLibraryWorldClusterRelationProjection(
  units: UnitView[],
  relations: RelationViewRecord[]
): DocLibraryWorldClusterRelationProjection {
  const unitById = new Map(units.map((unit) => [unit.unitId, unit] as const))
  const rootUnitIds = new Set(units
    .filter((unit) => unit.unitType === 'root')
    .map((unit) => unit.unitId))
  const forestRootUnitIds = units
    .filter((unit) => unit.unitType === 'cluster' && rootUnitIds.has(String(unit.parentId || '')))
    .map((unit) => unit.unitId)
  const forestRootIdSet = new Set(forestRootUnitIds)
  const worldClusterByUnitId = new Map<string, string>()

  const resolveWorldClusterId = (unitId: string) => {
    const normalizedUnitId = String(unitId || '').trim()
    if (!normalizedUnitId || rootUnitIds.has(normalizedUnitId)) return ''
    const cached = worldClusterByUnitId.get(normalizedUnitId)
    if (cached !== undefined) return cached
    let currentId = normalizedUnitId
    const visited = new Set<string>()
    while (currentId && !visited.has(currentId)) {
      visited.add(currentId)
      if (forestRootIdSet.has(currentId)) {
        visited.forEach((id) => worldClusterByUnitId.set(id, currentId))
        return currentId
      }
      const parentId = String(unitById.get(currentId)?.parentId || '').trim()
      if (!parentId || rootUnitIds.has(parentId)) break
      currentId = parentId
    }
    visited.forEach((id) => worldClusterByUnitId.set(id, ''))
    return ''
  }

  const isolatedRelations = relations.filter((relation) => {
    const sourceId = String(relation.sourceUnitId || '').trim()
    const targetId = String(relation.targetUnitId || '').trim()
    if (rootUnitIds.has(sourceId) || rootUnitIds.has(targetId)) return false
    const sourceClusterId = resolveWorldClusterId(sourceId)
    const targetClusterId = resolveWorldClusterId(targetId)
    if (!sourceClusterId && !targetClusterId) return true
    return Boolean(sourceClusterId && sourceClusterId === targetClusterId)
  })

  return {
    forestRootUnitIds,
    relations: isolatedRelations
  }
}

export function resolveDocLibraryRelationClipboardUnitIds(
  entries: Array<{ kind: 'document' | 'folder'; id: string }>,
  units: UnitView[]
) {
  return Array.from(new Set(entries
    .map((entry) => findDocLibraryRelationClipboardUnit(entry, units)?.unitId || '')
    .filter(Boolean)))
}

export function buildDocLibraryRelationClipboardEntries(
  unitIds: string[],
  units: UnitView[]
): DocLibraryRelationClipboardEntry[] {
  const unitMap = new Map(units.map((unit) => [unit.unitId, unit] as const))
  return Array.from(new Set(unitIds.map((id) => String(id || '').trim()).filter(Boolean)))
    .map((unitId) => unitMap.get(unitId) || null)
    .map((unit) => {
      if (!unit) return null
      if (unit.unitType === 'leaf') {
        const id = String(unit.sourceId || '').trim()
        return id ? { kind: 'document' as const, id, label: unit.title || '未命名桠' } : null
      }
      if (unit.unitType === 'cluster' || unit.unitType === 'branch') {
        const id = String(unit.sourcePath || unit.sourceId || '').trim()
        return id ? { kind: 'folder' as const, id, label: unit.title || '未命名枝' } : null
      }
      return null
    })
    .filter((entry): entry is DocLibraryRelationClipboardEntry => Boolean(entry))
}

export function resolveDocLibraryRelationPasteTarget(
  targetUnitId: string,
  units: UnitView[],
  documentById: Map<string, { displayPath?: string }>
): DocLibraryRelationPasteTarget | null {
  const unitMap = new Map(units.map((unit) => [unit.unitId, unit] as const))
  const unit = unitMap.get(String(targetUnitId || '').trim())
  if (!unit) return null
  if (unit.unitType === 'root') {
    return { folderPath: '' }
  }
  if (unit.unitType === 'cluster' || unit.unitType === 'branch') {
    const folderPath = String(unit.sourceId || unit.sourcePath || '').trim()
    return folderPath ? { folderPath } : null
  }
  if (unit.unitType === 'leaf') {
    const documentId = String(unit.sourceId || '').trim()
    const document = documentById.get(documentId)
    if (!document) return null
    return {
      folderPath: getDocLibraryParentFolderPath(document.displayPath || '', '/文档'),
      targetDocumentId: documentId
    }
  }
  return null
}

function findDocLibraryRelationClipboardUnit(
  entry: { kind: 'document' | 'folder'; id: string },
  units: UnitView[]
) {
  const id = String(entry.id || '').trim()
  if (!id) return null
  return units.find((unit) => {
    if (entry.kind === 'document') {
      return unit.unitType === 'leaf' && String(unit.sourceId || '').trim() === id
    }
    return (unit.unitType === 'cluster' || unit.unitType === 'branch')
      && (
        String(unit.sourceId || '').trim() === id
        || String(unit.sourcePath || '').trim() === id
      )
  }) || null
}
