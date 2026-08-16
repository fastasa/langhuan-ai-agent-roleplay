import { ref, watch, type ComputedRef, type Ref } from 'vue'

type Options = {
  orderedIds: ComputedRef<string[]> | Ref<string[]>
  selectedIds: Ref<string[]>
  selectedAnchorId: Ref<string>
}

export function useSelectionRowMenu(options: Options) {
  const activeMenuId = ref('')
  const activeMenuMode = ref<'single' | 'batch'>('single')

  function requireSelectedAnchorId(context: string) {
    const safeId = String(options.selectedAnchorId.value || '').trim()
    if (!safeId) {
      throw new Error(`[useSelectionRowMenu] missing selectedAnchorId for ${context}`)
    }
    if (options.selectedIds.value.length > 1 && !options.selectedIds.value.includes(safeId)) {
      throw new Error(`[useSelectionRowMenu] selectedAnchorId not found in selectedIds for ${context}: ${safeId}`)
    }
    return safeId
  }

  function getMenuMode(id: string) {
    if (activeMenuId.value === id) return activeMenuMode.value
    const selectedCount = options.selectedIds.value.length
    if (selectedCount > 1) return id === requireSelectedAnchorId('getMenuMode') ? 'batch' : 'single'
    return 'single'
  }

  function shouldShowMenuTrigger(id: string) {
    if (activeMenuId.value === id) return true
    if (options.selectedIds.value.length > 1) return id === requireSelectedAnchorId('shouldShowMenuTrigger')
    return true
  }

  function toggleMenu(id: string) {
    const safeId = String(id || '').trim()
    if (!safeId) {
      activeMenuId.value = ''
      activeMenuMode.value = 'single'
      return
    }
    if (activeMenuId.value === safeId) {
      activeMenuId.value = ''
      activeMenuMode.value = 'single'
      return
    }
    activeMenuId.value = safeId
    activeMenuMode.value = options.selectedIds.value.length > 1 && safeId === requireSelectedAnchorId('toggleMenu') ? 'batch' : 'single'
  }

  function isMenuOpen(id: string) {
    return activeMenuId.value === id
  }

  function openMenu(id: string, mode: 'single' | 'batch' = 'single') {
    const safeId = String(id || '').trim()
    if (!safeId) {
      activeMenuId.value = ''
      activeMenuMode.value = 'single'
      return
    }
    activeMenuId.value = safeId
    activeMenuMode.value = mode
  }

  function closeMenu() {
    activeMenuId.value = ''
    activeMenuMode.value = 'single'
  }

  watch(
    [options.selectedIds, options.orderedIds, options.selectedAnchorId],
    () => {
      const selectedCount = options.selectedIds.value.length
      const activeId = String(activeMenuId.value || '').trim()
      if (!activeId) return
      const orderedSet = new Set(options.orderedIds.value)
      if (!orderedSet.has(activeId)) {
        activeMenuId.value = ''
        return
      }
      if (selectedCount > 1 && activeId !== requireSelectedAnchorId('watch')) {
        const activeIsSelected = options.selectedIds.value.includes(activeId)
        if (activeMenuMode.value === 'batch' && !activeIsSelected) {
          activeMenuId.value = ''
          activeMenuMode.value = 'single'
        }
        return
      }
      if (selectedCount <= 1 && activeMenuMode.value === 'batch') {
        activeMenuId.value = ''
        activeMenuMode.value = 'single'
      }
    },
    { immediate: true }
  )

  return {
    activeMenuId,
    activeMenuMode,
    selectedAnchorId: options.selectedAnchorId,
    getMenuMode,
    shouldShowMenuTrigger,
    toggleMenu,
    isMenuOpen,
    openMenu,
    closeMenu
  }
}
