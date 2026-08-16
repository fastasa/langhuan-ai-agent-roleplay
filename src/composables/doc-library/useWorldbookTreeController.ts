import { computed } from 'vue'
import type { ComputedRef, Ref } from 'vue'
import type { SoneTreeMenuItem, SoneTreeRowView } from '../../components/app/SoneTreeRows.vue'

type MaybeReadonlyRef<T> = Ref<T> | ComputedRef<T>
type WorldbookTreeSourceKind = 'cluster' | 'folder' | 'document'

type WorldbookTreeUnitLike = {
  unitId: string
  title: string
  contentKind?: string
}

type WorldbookTreeRowSourceLike = {
  id: string
  clusterId?: string
}

export type WorldbookTreeProjectedRow<
  TUnit extends WorldbookTreeUnitLike,
  TSourceRow extends WorldbookTreeRowSourceLike
> = SoneTreeRowView & {
  sourceKind: WorldbookTreeSourceKind
  unit: TUnit
  clusterId?: string
  sourceRow?: TSourceRow
}

export type WorldbookTreeControllerOptions<
  TUnit extends WorldbookTreeUnitLike,
  TSourceRow extends WorldbookTreeRowSourceLike,
  TMenuItem extends SoneTreeMenuItem = SoneTreeMenuItem
> = {
  rootId: MaybeReadonlyRef<string>
  childrenByParentId: ComputedRef<Map<string, TUnit[]>>
  getSourceKind: (unit: TUnit) => WorldbookTreeSourceKind
  getSourceRow: (unit: TUnit) => TSourceRow | undefined
  getClusterId: (unit: TUnit) => string
  getFolderId: (unit: TUnit) => string
  getDocumentId: (unit: TUnit) => string
  getSelectionId: (unit: TUnit) => string
  isClusterOpen: (clusterId: string) => boolean
  isFolderOpen: (folderId: string) => boolean
  isClusterSelected: (clusterId: string) => boolean
  isRowSelected: (row: TSourceRow) => boolean
  isDocumentVisuallyActive: (documentId: string) => boolean
  isSelected: (selectionId: string) => boolean
  hasAdjacentSelectedDocument: (documentId: string, direction: -1 | 1) => boolean
  isClipboardPending: (selectionId: string) => boolean
  hasCluster: (clusterId: string) => boolean
  shouldShowRowMenuAction: (row: TSourceRow) => boolean
  isClusterMenuOpen: (clusterId: string) => boolean
  isRowMenuOpen: (row: TSourceRow) => boolean
  getClusterMenuItems: (clusterId: string) => TMenuItem[]
  getRowMenuItems: (row: TSourceRow) => TMenuItem[]
  isClusterDragging: (clusterId: string) => boolean
  isRowDragging: (row: TSourceRow) => boolean
  isClusterDropTarget: (clusterId: string) => boolean
  isRowDropTarget: (row: TSourceRow) => boolean
  isClusterPreviewShift: (clusterId: string) => boolean
  isRowPreviewShift: (row: TSourceRow) => boolean
}

export function useWorldbookTreeController<
  TUnit extends WorldbookTreeUnitLike,
  TSourceRow extends WorldbookTreeRowSourceLike,
  TMenuItem extends SoneTreeMenuItem = SoneTreeMenuItem
>(options: WorldbookTreeControllerOptions<TUnit, TSourceRow, TMenuItem>) {
  const rows = computed<WorldbookTreeProjectedRow<TUnit, TSourceRow>[]>(() => {
    const projectedRows: WorldbookTreeProjectedRow<TUnit, TSourceRow>[] = []
    const walk = (parentId: string, depth: number, rootClusterId = '') => {
      ;(options.childrenByParentId.value.get(parentId) || []).forEach((unit) => {
        const sourceKind = options.getSourceKind(unit)
        const sourceRow = options.getSourceRow(unit)
        const clusterId = sourceKind === 'cluster'
          ? options.getClusterId(unit)
          : sourceRow?.clusterId || rootClusterId
        const selectionId = options.getSelectionId(unit)
        const childUnits = options.childrenByParentId.value.get(unit.unitId) || []
        const hasChildren = childUnits.length > 0 || unit.contentKind === 'group'
        const folderOpen = sourceKind === 'cluster'
          ? options.isClusterOpen(clusterId)
          : sourceKind === 'folder'
            ? options.isFolderOpen(options.getFolderId(unit))
            : false
        const selected = sourceKind === 'cluster'
          ? options.isClusterSelected(clusterId)
          : sourceRow
            ? options.isRowSelected(sourceRow)
            : options.isSelected(selectionId)
        const active = sourceKind === 'cluster'
          ? options.isClusterSelected(clusterId)
          : sourceKind === 'document'
            ? options.isDocumentVisuallyActive(options.getDocumentId(unit))
            : selected
        const dragId = sourceKind === 'cluster' ? clusterId : sourceRow?.id || selectionId

        projectedRows.push({
          id: selectionId,
          label: unit.title,
          depth,
          kind: hasChildren ? 'folder' : 'document',
          open: hasChildren ? folderOpen : undefined,
          active,
          selected,
          selectedPrev: sourceKind === 'document' && options.hasAdjacentSelectedDocument(options.getDocumentId(unit), -1),
          selectedNext: sourceKind === 'document' && options.hasAdjacentSelectedDocument(options.getDocumentId(unit), 1),
          cutPending: options.isClipboardPending(selectionId),
          hasMenu: sourceKind === 'cluster'
            ? options.hasCluster(clusterId)
            : Boolean(sourceRow && options.shouldShowRowMenuAction(sourceRow)),
          menuOpen: sourceKind === 'cluster'
            ? options.isClusterMenuOpen(clusterId)
            : Boolean(sourceRow && options.isRowMenuOpen(sourceRow)),
          menuItems: sourceKind === 'cluster'
            ? options.getClusterMenuItems(clusterId)
            : sourceRow
              ? options.getRowMenuItems(sourceRow)
              : [],
          multiSelectId: selectionId,
          groupRunId: parentId,
          dragId,
          dragKind: sourceKind === 'cluster' ? 'cluster' : sourceKind,
          clusterId,
          dragging: sourceKind === 'cluster'
            ? options.isClusterDragging(clusterId)
            : Boolean(sourceRow && options.isRowDragging(sourceRow)),
          dropTarget: sourceKind === 'cluster'
            ? options.isClusterDropTarget(clusterId)
            : Boolean(sourceRow && options.isRowDropTarget(sourceRow)),
          previewShift: sourceKind === 'cluster'
            ? options.isClusterPreviewShift(clusterId)
            : Boolean(sourceRow && options.isRowPreviewShift(sourceRow)),
          sourceKind,
          sourceRow,
          unit
        })

        if (hasChildren && folderOpen) {
          walk(unit.unitId, depth + 1, clusterId)
        }
      })
    }
    walk(options.rootId.value, 0)
    return projectedRows
  })

  const rowById = computed(() => {
    const map = new Map<string, WorldbookTreeProjectedRow<TUnit, TSourceRow>>()
    rows.value.forEach((row) => {
      map.set(row.id, row)
    })
    return map
  })

  return {
    rows,
    rowById
  }
}
