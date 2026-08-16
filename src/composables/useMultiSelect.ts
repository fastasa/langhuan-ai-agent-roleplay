import { computed, onBeforeUnmount, ref, watch, type Ref } from 'vue'

type MultiSelectSessionKind = '' | 'desktop' | 'touch'

type MultiSelectClickEvent = MouseEvent | PointerEvent

type MultiSelectOptions = {
  getOrderedIds: () => string[]
  getResetKey?: () => unknown
  longPressMs?: number
}

type MultiSelectClickOptions = {
  id: string
  event: MultiSelectClickEvent
  onDefault?: () => void
}

function normalizeId(value: unknown): string {
  return String(value || '').trim()
}

export function useMultiSelect(options: MultiSelectOptions) {
  const longPressMs = Math.max(180, Number(options.longPressMs || 320))
  const selectedIds = ref<string[]>([])
  const anchorId = ref('')
  const focusId = ref('')
  const sessionKind = ref<MultiSelectSessionKind>('')
  const orderedIds = computed(() => {
    const raw = Array.isArray(options.getOrderedIds?.()) ? options.getOrderedIds() : []
    return raw.map((item) => normalizeId(item)).filter(Boolean)
  })
  const resetKey = computed(() => normalizeId(options.getResetKey?.() ?? ''))

  const activePointerId = ref<number | null>(null)
  const dragSelecting = ref(false)
  const suppressClickId = ref('')

  let longPressTimer: ReturnType<typeof setTimeout> | null = null
  let pendingTouchId = ''
  let pointerStartX = 0
  let pointerStartY = 0

  const selectionMode = computed(() => selectedIds.value.length > 0)

  function cleanupTimer() {
    if (longPressTimer) {
      clearTimeout(longPressTimer)
      longPressTimer = null
    }
  }

  function clearTouchState() {
    cleanupTimer()
    pendingTouchId = ''
    activePointerId.value = null
    dragSelecting.value = false
  }

  function resetSelectionState() {
    selectedIds.value = []
    anchorId.value = ''
    focusId.value = ''
    sessionKind.value = ''
    clearTouchState()
  }

  function sanitizeSelection(ids: string[]) {
    const valid = new Set(orderedIds.value)
    return Array.from(new Set(ids.map((item) => normalizeId(item)).filter((item) => valid.has(item))))
  }

  function requireAnchorId(context: string) {
    const safeId = normalizeId(anchorId.value)
    if (!safeId) {
      throw new Error(`[useMultiSelect] missing anchorId for ${context}`)
    }
    return safeId
  }

  function setSelectedIds(nextIds: string[], nextAnchorId?: string) {
    const nextSelection = sanitizeSelection(nextIds)
    selectedIds.value = nextSelection
    if (!nextSelection.length) {
      anchorId.value = ''
      focusId.value = ''
      sessionKind.value = ''
      return
    }
    const safeAnchorId = normalizeId(nextAnchorId)
    if (!safeAnchorId) {
      throw new Error('[useMultiSelect] missing anchorId for setSelectedIds')
    }
    if (!nextSelection.includes(safeAnchorId)) {
      throw new Error(`[useMultiSelect] anchorId not found in selectedIds: ${safeAnchorId}`)
    }
    if (!orderedIds.value.includes(safeAnchorId)) {
      throw new Error(`[useMultiSelect] anchorId not found in orderedIds: ${safeAnchorId}`)
    }
    anchorId.value = safeAnchorId
    focusId.value = safeAnchorId
  }

  function clearSelection() {
    setSelectedIds([])
  }

  function isSelected(id: string) {
    return selectedIds.value.includes(normalizeId(id))
  }

  function selectOnly(id: string, kind: MultiSelectSessionKind = sessionKind.value || 'desktop') {
    const safeId = normalizeId(id)
    if (!safeId) return
    setSelectedIds([safeId], safeId)
    sessionKind.value = kind
  }

  function addSelected(id: string, kind: MultiSelectSessionKind = sessionKind.value || 'desktop') {
    const safeId = normalizeId(id)
    if (!safeId || selectedIds.value.includes(safeId)) return
    const nextSelection = sanitizeSelection([...selectedIds.value, safeId])
    if (!anchorId.value) {
      setSelectedIds(nextSelection, safeId)
      sessionKind.value = kind
      return
    }
    if (!nextSelection.includes(anchorId.value)) {
      throw new Error(`[useMultiSelect] anchorId not found in selectedIds: ${anchorId.value}`)
    }
    if (!orderedIds.value.includes(anchorId.value)) {
      throw new Error(`[useMultiSelect] anchorId not found in orderedIds: ${anchorId.value}`)
    }
    selectedIds.value = nextSelection
    focusId.value = safeId
    sessionKind.value = kind
  }

  function removeSelected(id: string) {
    const safeId = normalizeId(id)
    if (!safeId) return
    const nextIds = selectedIds.value.filter((item) => item !== safeId)
    if (!nextIds.length) {
      clearSelection()
      return
    }
    if (safeId === anchorId.value) {
      throw new Error('[useMultiSelect] removing selected anchorId requires explicit reselection')
    }
    if (!anchorId.value) {
      throw new Error('[useMultiSelect] missing anchorId for removeSelected')
    }
    setSelectedIds(nextIds, anchorId.value)
  }

  function toggleSelected(id: string, kind: MultiSelectSessionKind = sessionKind.value || 'desktop') {
    const safeId = normalizeId(id)
    if (!safeId) return
    if (selectedIds.value.includes(safeId)) {
      removeSelected(safeId)
      return
    }
    addSelected(safeId, kind)
  }

  function selectRangeTo(id: string, kind: MultiSelectSessionKind = sessionKind.value || 'desktop') {
    const safeId = normalizeId(id)
    if (!safeId) return
    const ordered = orderedIds.value
    const targetIndex = ordered.indexOf(safeId)
    const baseId = normalizeId(anchorId.value)
    if (!baseId) {
      selectOnly(safeId, kind)
      return
    }
    const baseIndex = ordered.indexOf(baseId)
    if (targetIndex < 0) {
      throw new Error(`[useMultiSelect] target id not found in orderedIds: ${safeId}`)
    }
    if (baseIndex < 0) {
      throw new Error(`[useMultiSelect] anchorId not found in orderedIds: ${baseId}`)
    }
    const start = Math.min(baseIndex, targetIndex)
    const end = Math.max(baseIndex, targetIndex)
    const range = ordered.slice(start, end + 1)
    setSelectedIds(range, baseId)
    focusId.value = safeId
    sessionKind.value = kind
  }

  function selectAll() {
    const firstId = orderedIds.value[0] || ''
    if (!firstId) {
      clearSelection()
      return
    }
    setSelectedIds(orderedIds.value, firstId)
    sessionKind.value = sessionKind.value || 'desktop'
  }

  function handleItemClick(payload: MultiSelectClickOptions) {
    const safeId = normalizeId(payload.id)
    if (!safeId) return

    if (suppressClickId.value === safeId) {
      suppressClickId.value = ''
      return
    }

    const event = payload.event
    const asMouse = event as MouseEvent
    const hasDesktopModifier = Boolean(asMouse.shiftKey || asMouse.ctrlKey || asMouse.metaKey)

    if (asMouse.shiftKey) {
      selectRangeTo(safeId, 'desktop')
      return
    }

    if (asMouse.ctrlKey || asMouse.metaKey) {
      toggleSelected(safeId, 'desktop')
      return
    }

    if (selectionMode.value && sessionKind.value === 'touch') {
      toggleSelected(safeId, 'touch')
      return
    }

    if (selectionMode.value && !hasDesktopModifier && sessionKind.value === 'desktop') {
      clearSelection()
    }

    const nextKind: MultiSelectSessionKind = event instanceof PointerEvent && event.pointerType !== 'mouse'
      ? 'touch'
      : 'desktop'
    selectOnly(safeId, nextKind)
    focusId.value = safeId
    payload.onDefault?.()
  }

  function resolveItemIdFromPoint(clientX: number, clientY: number) {
    if (typeof document === 'undefined') return ''
    const element = document.elementFromPoint(clientX, clientY)
    const row = element?.closest?.('[data-multi-select-id]') as HTMLElement | null
    return normalizeId(row?.dataset?.multiSelectId)
  }

  function startTouchSelection(id: string) {
    selectOnly(id, 'touch')
    dragSelecting.value = true
    suppressClickId.value = id
  }

  function handlePointerDown(id: string, event: PointerEvent) {
    const safeId = normalizeId(id)
    if (!safeId) return
    if (event.pointerType === 'mouse') return

    clearTouchState()
    pendingTouchId = safeId
    activePointerId.value = event.pointerId
    pointerStartX = event.clientX
    pointerStartY = event.clientY

    if (selectionMode.value) {
      sessionKind.value = 'touch'
      dragSelecting.value = true
      addSelected(safeId, 'touch')
      suppressClickId.value = safeId
      return
    }

    longPressTimer = setTimeout(() => {
      if (activePointerId.value !== event.pointerId) return
      startTouchSelection(safeId)
    }, longPressMs)
  }

  function handlePointerMove(event: PointerEvent) {
    if (activePointerId.value !== event.pointerId) return
    if (event.pointerType === 'mouse') return

    const movedX = Math.abs(event.clientX - pointerStartX)
    const movedY = Math.abs(event.clientY - pointerStartY)

    if (!dragSelecting.value && (movedX > 10 || movedY > 10)) {
      cleanupTimer()
    }

    if (!selectionMode.value || !dragSelecting.value) return

    const hoverId = resolveItemIdFromPoint(event.clientX, event.clientY)
    if (!hoverId) return
    addSelected(hoverId, 'touch')
    suppressClickId.value = hoverId
  }

  function handlePointerEnd(event?: PointerEvent) {
    if (event && activePointerId.value !== null && activePointerId.value !== event.pointerId) return
    clearTouchState()
  }

  watch([orderedIds, resetKey], ([ids, key], oldValue) => {
    const previousKey = oldValue?.[1]
    if (previousKey !== undefined && key !== previousKey) {
      resetSelectionState()
      return
    }
    const valid = new Set(ids)
    if (!selectedIds.value.length) {
      sessionKind.value = ''
      return
    }
    const invalidSelected = selectedIds.value.filter((item) => !valid.has(item))
    if (invalidSelected.length) {
      throw new Error(`[useMultiSelect] selectedIds not found in orderedIds: ${invalidSelected.join(', ')}`)
    }
    if (!anchorId.value) {
      throw new Error('[useMultiSelect] missing anchorId during orderedIds update')
    }
    if (!valid.has(anchorId.value)) {
      throw new Error(`[useMultiSelect] anchorId not found in orderedIds: ${anchorId.value}`)
    }
    if (!selectedIds.value.includes(anchorId.value)) {
      throw new Error(`[useMultiSelect] anchorId not found in selectedIds: ${anchorId.value}`)
    }
    if (!focusId.value) {
      throw new Error('[useMultiSelect] missing focusId during orderedIds update')
    }
    if (!valid.has(focusId.value)) {
      throw new Error(`[useMultiSelect] focusId not found in orderedIds: ${focusId.value}`)
    }
  }, { immediate: true })

  onBeforeUnmount(() => {
    clearTouchState()
  })

  return {
    selectedIds: selectedIds as Ref<string[]>,
    anchorId,
    selectionMode,
    isSelected,
    setSelectedIds,
    clearSelection,
    selectOnly,
    selectAll,
    toggleSelected,
    selectRangeTo,
    handleItemClick,
    handlePointerDown,
    handlePointerMove,
    handlePointerEnd
  }
}
