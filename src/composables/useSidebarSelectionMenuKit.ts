import { computed, type ComputedRef, type Ref } from 'vue'
import { useMultiSelect } from './useMultiSelect'
import { useSelectionRowMenu } from './useSelectionRowMenu'

type Options = {
  getOrderedIds: () => string[]
  getRenderedIds?: () => string[]
  getResetKey?: () => unknown
  longPressMs?: number
}

function normalizeIds(ids: string[] | undefined | null) {
  return Array.isArray(ids) ? ids.map((item) => String(item || '').trim()).filter(Boolean) : []
}

export function useSidebarSelectionMenuKit(options: Options) {
  const orderedIds = computed(() => normalizeIds(options.getOrderedIds?.()))
  const renderedIds = computed(() => {
    if (!options.getRenderedIds) return orderedIds.value
    const ids = normalizeIds(options.getRenderedIds())
    return ids.length ? ids : orderedIds.value
  })

  const multiSelect = useMultiSelect({
    getOrderedIds: () => orderedIds.value,
    getResetKey: options.getResetKey,
    longPressMs: options.longPressMs
  })

  const rowMenu = useSelectionRowMenu({
    orderedIds: renderedIds as ComputedRef<string[]> | Ref<string[]>,
    selectedIds: multiSelect.selectedIds,
    selectedAnchorId: multiSelect.anchorId
  })

  function hasAdjacentSelected(id: string, direction: -1 | 1) {
    const safeId = String(id || '').trim()
    const order = renderedIds.value
    const index = order.indexOf(safeId)
    if (index < 0) return false
    const neighborId = order[index + direction]
    return Boolean(neighborId) && multiSelect.isSelected(neighborId)
  }

  function openContextMenuFor(id: string) {
    const safeId = String(id || '').trim()
    if (!safeId) {
      rowMenu.closeMenu()
      return 'single' as const
    }
    const selectedIds = multiSelect.selectedIds.value
    const isTargetSelected = selectedIds.includes(safeId)
    const nextMode = isTargetSelected && selectedIds.length > 1 ? 'batch' as const : 'single' as const
    if (!isTargetSelected) {
      multiSelect.selectOnly(safeId)
    }
    rowMenu.openMenu(safeId, nextMode)
    return nextMode
  }

  return {
    orderedIds,
    renderedIds,
    selectedIds: multiSelect.selectedIds,
    selectionMode: multiSelect.selectionMode,
    selectedAnchorId: rowMenu.selectedAnchorId,
    activeMenuId: rowMenu.activeMenuId,
    isSelected: multiSelect.isSelected,
    clearSelection: multiSelect.clearSelection,
    selectOnly: multiSelect.selectOnly,
    handleItemClick: multiSelect.handleItemClick,
    handlePointerDown: multiSelect.handlePointerDown,
    handlePointerMove: multiSelect.handlePointerMove,
    handlePointerEnd: multiSelect.handlePointerEnd,
    getMenuMode: rowMenu.getMenuMode,
    shouldShowMenuTrigger: rowMenu.shouldShowMenuTrigger,
    toggleMenu: rowMenu.toggleMenu,
    isMenuOpen: rowMenu.isMenuOpen,
    openContextMenuFor,
    closeMenu: rowMenu.closeMenu,
    hasAdjacentSelected
  }
}
