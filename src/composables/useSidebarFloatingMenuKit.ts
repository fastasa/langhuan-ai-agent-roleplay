import { ref } from 'vue'

type Options = {
  menuWidth?: number
  estimatedHeight?: number
  gap?: number
  viewportPadding?: number
  placement?: 'row' | 'auto' | 'above' | 'below'
  horizontalPlacement?: 'right' | 'left' | 'align-left' | 'align-right'
  constrainHeight?: boolean
}

export function useSidebarFloatingMenuKit(options: Options = {}) {
  const floatingMenuStyle = ref<Record<string, string>>({})

  function clearFloatingMenuPosition() {
    floatingMenuStyle.value = {}
  }

  function updateFloatingMenuPosition(event?: Event | null) {
    const target = event?.currentTarget
    if (typeof window === 'undefined') {
      clearFloatingMenuPosition()
      return
    }
    const rawPointerEvent = event instanceof MouseEvent ? event : null
    const pointerEvent = rawPointerEvent && (rawPointerEvent.clientX !== 0 || rawPointerEvent.clientY !== 0)
      ? rawPointerEvent
      : null
    if (!pointerEvent && !(target instanceof HTMLElement)) {
      clearFloatingMenuPosition()
      return
    }
    const rect = target instanceof HTMLElement
      ? target.getBoundingClientRect()
      : new DOMRect(pointerEvent?.clientX || 0, pointerEvent?.clientY || 0, 0, 0)
    const menuWidth = Number.isFinite(options.menuWidth) ? Number(options.menuWidth) : 220
    const estimatedHeight = Number.isFinite(options.estimatedHeight) ? Number(options.estimatedHeight) : 180
    const gap = Number.isFinite(options.gap) ? Number(options.gap) : 6
    const viewportPadding = Number.isFinite(options.viewportPadding) ? Number(options.viewportPadding) : 8
    const placement = options.placement || 'row'
    const horizontalPlacement = options.horizontalPlacement || 'right'
    const constrainHeight = options.constrainHeight !== false
    const viewportWidth = window.innerWidth || 0
    const viewportHeight = window.innerHeight || 0
    const maxMenuHeight = Math.max(120, viewportHeight - viewportPadding * 2)
    const effectiveEstimatedHeight = Math.min(estimatedHeight, maxMenuHeight)
    const preferredLeft = pointerEvent
      ? pointerEvent.clientX
      : horizontalPlacement === 'left'
        ? rect.left - gap - menuWidth
        : horizontalPlacement === 'align-left'
          ? rect.left
          : horizontalPlacement === 'align-right'
            ? rect.right - menuWidth
            : rect.right + gap
    const availableBelow = Math.max(0, viewportHeight - rect.bottom - gap - viewportPadding)
    const availableAbove = Math.max(0, rect.top - gap - viewportPadding)
    const shouldOpenAbove = placement === 'above'
      || (placement !== 'below' && availableBelow < estimatedHeight && availableAbove > availableBelow)
    const preferredTop = pointerEvent
      ? pointerEvent.clientY
      : placement === 'row'
        ? rect.top
        : shouldOpenAbove
          ? placement === 'above'
            ? rect.top - gap
            : rect.top - gap - Math.min(estimatedHeight, availableAbove)
          : rect.bottom + gap
    const left = Math.max(viewportPadding, Math.min(preferredLeft, viewportWidth - menuWidth - viewportPadding))
    const top = pointerEvent && placement === 'above'
      ? Math.max(viewportPadding, Math.min(preferredTop, viewportHeight - viewportPadding))
      : pointerEvent
      ? Math.max(viewportPadding, Math.min(preferredTop, viewportHeight - effectiveEstimatedHeight - viewportPadding))
      : placement === 'row'
      ? Math.max(viewportPadding, Math.min(preferredTop, viewportHeight - effectiveEstimatedHeight - viewportPadding))
      : shouldOpenAbove && placement === 'above'
        ? Math.max(viewportPadding, preferredTop)
        : Math.max(viewportPadding, Math.min(preferredTop, viewportHeight - effectiveEstimatedHeight - viewportPadding))
    const availableHeight = pointerEvent && placement === 'above'
      ? Math.max(120, top - viewportPadding)
      : pointerEvent || placement === 'row'
      ? Math.max(120, viewportHeight - top - viewportPadding)
      : shouldOpenAbove && placement !== 'above'
      ? Math.max(120, Math.min(estimatedHeight, availableAbove))
      : shouldOpenAbove
        ? Math.max(120, availableAbove)
        : Math.max(120, viewportHeight - top - viewportPadding)
    const nextStyle: Record<string, string> = {
      position: 'fixed',
      left: `${left}px`,
      top: `${top}px`,
      right: 'auto',
      bottom: 'auto',
      width: `${menuWidth}px`,
      transform: shouldOpenAbove && placement === 'above' ? 'translateY(-100%)' : 'none',
      zIndex: '12000'
    }
    if (constrainHeight) {
      nextStyle.maxHeight = `${availableHeight}px`
      nextStyle.overflowY = 'auto'
    }
    floatingMenuStyle.value = nextStyle
  }

  return {
    floatingMenuStyle,
    updateFloatingMenuPosition,
    clearFloatingMenuPosition
  }
}
