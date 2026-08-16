import { computed, onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue'

type ResizeEdge = 'left' | 'right'
type WidthOption = number | { readonly value: number }

type ResizablePanelOptions = {
  storageKey: string
  defaultWidth: number
  minWidth: number
  maxWidth: WidthOption
  enabled?: Ref<boolean>
  edge?: ResizeEdge
  collapseThreshold?: number
  onCollapse?: () => void
}

function clampWidth(value: number, minWidth: number, maxWidth: number): number {
  return Math.min(maxWidth, Math.max(minWidth, Math.round(value)))
}

function readSizeOption(value: WidthOption): number {
  return typeof value === 'number' ? value : value.value
}

function readMaxWidth(options: ResizablePanelOptions): number {
  return Math.max(options.minWidth, readSizeOption(options.maxWidth))
}

export function useResizablePanel(options: ResizablePanelOptions) {
  const isDragging = ref(false)
  const width = ref(clampWidth(options.defaultWidth, options.minWidth, readMaxWidth(options)))
  const enabled = options.enabled
  const edge = options.edge || 'right'
  let startX = 0
  let startWidth = width.value
  let latestRawWidth = width.value
  let frameId = 0

  function persistWidth(nextWidth: number) {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(options.storageKey, String(nextWidth))
  }

  function setWidth(nextWidth: number) {
    const safeWidth = clampWidth(nextWidth, options.minWidth, readMaxWidth(options))
    width.value = safeWidth
  }

  function readStoredWidth() {
    if (typeof window === 'undefined') return
    const raw = Number(window.localStorage.getItem(options.storageKey))
    if (Number.isFinite(raw)) {
      width.value = clampWidth(raw, options.minWidth, readMaxWidth(options))
    }
  }

  function stopResize() {
    if (typeof window === 'undefined') return
    const shouldCollapse = typeof options.collapseThreshold === 'number'
      && latestRawWidth <= options.collapseThreshold
    isDragging.value = false
    if (frameId) {
      window.cancelAnimationFrame(frameId)
      frameId = 0
    }
    window.removeEventListener('pointermove', handlePointerMove)
    window.removeEventListener('pointerup', stopResize)
    window.removeEventListener('pointercancel', stopResize)
    document.body.style.userSelect = ''
    document.body.style.cursor = ''
    if (shouldCollapse) {
      options.onCollapse?.()
      return
    }
    persistWidth(width.value)
  }

  function handlePointerMove(event: PointerEvent) {
    if (enabled && !enabled.value) return
    const deltaX = event.clientX - startX
    const nextWidth = edge === 'right'
      ? startWidth + deltaX
      : startWidth - deltaX
    latestRawWidth = nextWidth
    if (frameId) return
    frameId = window.requestAnimationFrame(() => {
      frameId = 0
      setWidth(nextWidth)
    })
  }

  function startResize(event: PointerEvent) {
    if (enabled && !enabled.value) return
    startX = event.clientX
    startWidth = width.value
    latestRawWidth = width.value
    isDragging.value = true
    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'col-resize'
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', stopResize)
    window.addEventListener('pointercancel', stopResize)
  }

  const panelStyle = computed<Partial<Record<'width' | 'minWidth' | 'flexBasis', string>>>(() => {
    if (enabled && !enabled.value) return {}
    const pixelWidth = `${width.value}px`
    return {
      width: pixelWidth,
      minWidth: pixelWidth,
      flexBasis: pixelWidth
    }
  })

  onMounted(() => {
    readStoredWidth()
  })

  onBeforeUnmount(() => {
    stopResize()
  })

  watch(() => [options.minWidth, readMaxWidth(options)] as const, ([minWidth, maxWidth]) => {
    width.value = clampWidth(width.value, minWidth, maxWidth)
  })

  return {
    width,
    isDragging,
    panelStyle,
    setWidth,
    startResize,
    stopResize
  }
}
