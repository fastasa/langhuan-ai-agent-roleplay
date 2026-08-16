import { computed, ref } from 'vue'

type SidebarMultiDragOptions = {
  getOrderedIds: () => string[]
  getSelectedIds: () => string[]
}

type SidebarDropPayload = {
  draggedIds: string[]
  targetId: string
  position: 'before' | 'after'
}

export function useSidebarMultiDrag(options: SidebarMultiDragOptions) {
  const draggingIds = ref<string[]>([])
  const dropTargetId = ref('')
  const dropPosition = ref<'before' | 'after'>('before')
  const projectedOrder = ref<string[]>([])
  const baseOrderedIds = ref<string[]>([])

  const orderedIds = computed(() => {
    const ids = options.getOrderedIds?.()
    return Array.isArray(ids) ? ids.map((item) => String(item || '').trim()).filter(Boolean) : []
  })

  function clearDragState() {
    draggingIds.value = []
    clearPreview()
    baseOrderedIds.value = []
  }

  function clearPreview() {
    dropTargetId.value = ''
    dropPosition.value = 'before'
    projectedOrder.value = []
  }

  function startDrag(currentId: string, event?: DragEvent) {
    const safeId = String(currentId || '').trim()
    if (!safeId) return
    const selectedIds = (options.getSelectedIds?.() || []).map((item) => String(item || '').trim()).filter(Boolean)
    const source = [...orderedIds.value]
    const selectedSet = new Set(selectedIds)
    const orderedSelectedIds = selectedIds.includes(safeId)
      ? [
          ...source.filter((item) => selectedSet.has(item)),
          ...selectedIds.filter((item) => !source.includes(item))
        ]
      : [safeId]
    const activeIds = orderedSelectedIds.length ? orderedSelectedIds : [safeId]
    draggingIds.value = [...new Set(activeIds)]
    baseOrderedIds.value = source
    dropTargetId.value = ''
    dropPosition.value = 'before'
    projectedOrder.value = [...baseOrderedIds.value]
    if (event?.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move'
      event.dataTransfer.setData('text/plain', draggingIds.value.join(','))
    }
  }

  function resolveDropPosition(event?: DragEvent) {
    const currentTarget = event?.currentTarget
    if (!(currentTarget instanceof HTMLElement) || typeof event?.clientY !== 'number') {
      return 'before' as const
    }
    const rect = currentTarget.getBoundingClientRect()
    const midpoint = rect.top + rect.height / 2
    return event.clientY >= midpoint ? 'after' as const : 'before' as const
  }

  function project(targetId: string, position: 'before' | 'after') {
    const safeTargetId = String(targetId || '').trim()
    if (!safeTargetId || !draggingIds.value.length || draggingIds.value.includes(safeTargetId)) return false
    if (dropTargetId.value === safeTargetId && dropPosition.value === position && projectedOrder.value.length) {
      return true
    }
    const source = [...(baseOrderedIds.value.length ? baseOrderedIds.value : orderedIds.value)]
    const movingSet = new Set(draggingIds.value)
    const rest = source.filter((item) => !movingSet.has(item))
    const targetIndex = rest.indexOf(safeTargetId)
    if (targetIndex < 0) return false
    const insertIndex = position === 'after' ? targetIndex + 1 : targetIndex
    rest.splice(insertIndex, 0, ...draggingIds.value)
    projectedOrder.value = rest
    dropTargetId.value = safeTargetId
    dropPosition.value = position
    return true
  }

  function handleDragOver(targetId: string, event?: DragEvent) {
    const projected = project(targetId, resolveDropPosition(event))
    if (projected) {
      event?.preventDefault?.()
    }
    return projected
  }

  function previewDrop(targetId: string, position: 'before' | 'after', event?: DragEvent) {
    const projected = project(targetId, position)
    if (projected) {
      event?.preventDefault?.()
    }
    return projected
  }

  function buildProjectedDropPayload(): SidebarDropPayload | null {
    const safeTargetId = String(dropTargetId.value || '').trim()
    if (!safeTargetId || !draggingIds.value.length || draggingIds.value.includes(safeTargetId)) return null
    return {
      draggedIds: [...draggingIds.value],
      targetId: safeTargetId,
      position: dropPosition.value
    }
  }

  function buildDropPayload(targetId: string, event?: DragEvent): SidebarDropPayload | null {
    const projectedTargetId = String(dropTargetId.value || '').trim()
    const safeTargetId = projectedTargetId || String(targetId || '').trim()
    if (!safeTargetId || !draggingIds.value.length || draggingIds.value.includes(safeTargetId)) return null
    const position = projectedTargetId
      ? dropPosition.value
      : resolveDropPosition(event)
    return {
      draggedIds: [...draggingIds.value],
      targetId: safeTargetId,
      position
    }
  }

  return {
    draggingIds,
    dropTargetId,
    dropPosition,
    projectedOrder,
    clearDragState,
    clearPreview,
    startDrag,
    handleDragOver,
    previewDrop,
    buildProjectedDropPayload,
    buildDropPayload
  }
}
