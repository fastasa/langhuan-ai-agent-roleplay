import { ref } from 'vue'

type PointerPoint = {
  x: number
  y: number
}

type PointerDragSeed = {
  pointerId: number
  startX: number
  startY: number
}

type PointerDragOptions<TPending extends PointerDragSeed> = {
  activationDistance?: number
  suppressClickMs?: number
  onStartDrag: (pending: TPending) => void
  onPreview: (pending: TPending, point: PointerPoint, event: PointerEvent) => void
  onCommitDrop: (pending: TPending, point: PointerPoint, event: PointerEvent) => void | Promise<void>
  onCancel?: (pending: TPending, point: PointerPoint, event: PointerEvent, wasDragging: boolean) => void
  onClear?: (pending: TPending | null, wasDragging: boolean) => void
}

export function useSidebarPointerDragKit<TPending extends PointerDragSeed>(options: PointerDragOptions<TPending>) {
  // 这里抽的是“按下到抬手”的通用指针拖动骨架：
  // 什么时候起拖、什么时候压住点击、什么时候提交或取消。
  // 具体拖什么、如何预览落点、提交后怎样改数据，由页面层通过回调注入。
  const pending = ref<TPending | null>(null)
  const dragging = ref(false)
  const lastPointer = ref<PointerPoint>({ x: 0, y: 0 })
  const suppressClickUntil = ref(0)

  function begin(nextPending: TPending) {
    pending.value = nextPending
    dragging.value = false
    lastPointer.value = { x: nextPending.startX, y: nextPending.startY }
  }

  function clear() {
    const current = pending.value
    const wasDragging = dragging.value
    pending.value = null
    dragging.value = false
    options.onClear?.(current, wasDragging)
  }

  function shouldSuppressClick() {
    return Date.now() < suppressClickUntil.value
  }

  function handleMove(event: PointerEvent) {
    const current = pending.value
    if (!current || event.pointerId !== current.pointerId) return false
    lastPointer.value = { x: event.clientX, y: event.clientY }
    if (!dragging.value) {
      const movedX = Math.abs(event.clientX - current.startX)
      const movedY = Math.abs(event.clientY - current.startY)
      const activationDistance = Number.isFinite(options.activationDistance) ? Number(options.activationDistance) : 4
      if (movedX < activationDistance && movedY < activationDistance) return true
      options.onStartDrag(current)
      dragging.value = true
    }
    options.onPreview(current, lastPointer.value, event)
    return true
  }

  async function handleUp(event: PointerEvent) {
    const current = pending.value
    if (!current || event.pointerId !== current.pointerId) return false
    lastPointer.value = { x: event.clientX, y: event.clientY }
    if (!dragging.value) {
      options.onCancel?.(current, lastPointer.value, event, false)
      clear()
      return true
    }
    const suppressClickMs = Number.isFinite(options.suppressClickMs) ? Number(options.suppressClickMs) : 80
    suppressClickUntil.value = Date.now() + suppressClickMs
    await options.onCommitDrop(current, lastPointer.value, event)
    clear()
    return true
  }

  function handleCancel(event: PointerEvent) {
    const current = pending.value
    if (!current || event.pointerId !== current.pointerId) return false
    lastPointer.value = { x: event.clientX, y: event.clientY }
    options.onCancel?.(current, lastPointer.value, event, dragging.value)
    clear()
    return true
  }

  return {
    pending,
    dragging,
    lastPointer,
    suppressClickUntil,
    begin,
    clear,
    shouldSuppressClick,
    handleMove,
    handleUp,
    handleCancel
  }
}
