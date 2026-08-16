export function createOverlayDismissGuard() {
  let pointerDownStartedOnOverlay = false

  function handleOverlayPointerDown(event: PointerEvent) {
    pointerDownStartedOnOverlay = event.target === event.currentTarget
  }

  function shouldDismissFromOverlayClick(event: MouseEvent) {
    const shouldDismiss = pointerDownStartedOnOverlay && event.target === event.currentTarget
    pointerDownStartedOnOverlay = false
    return shouldDismiss
  }

  return {
    handleOverlayPointerDown,
    shouldDismissFromOverlayClick
  }
}
