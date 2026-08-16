export function hasActiveBrowserTextSelection(): boolean {
  if (typeof window === 'undefined' || typeof window.getSelection !== 'function') return false
  const selection = window.getSelection()
  if (!selection || selection.rangeCount <= 0) return false
  return String(selection.toString() || '').trim().length > 0
}
