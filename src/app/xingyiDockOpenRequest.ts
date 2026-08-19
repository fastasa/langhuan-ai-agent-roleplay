export const XINGYI_DOCK_OPEN_REQUEST_EVENT = 'langhuan:open-xingyi'

export interface XingyiDockOpenRequest {
  draft?: string
}

export function requestXingyiDockOpen(request: XingyiDockOpenRequest = {}): boolean {
  if (typeof window === 'undefined') return false
  window.dispatchEvent(new CustomEvent<XingyiDockOpenRequest>(XINGYI_DOCK_OPEN_REQUEST_EVENT, {
    detail: request
  }))
  return true
}

export function readXingyiDockOpenRequest(event: Event): XingyiDockOpenRequest {
  if (!(event instanceof CustomEvent) || !event.detail || typeof event.detail !== 'object') return {}
  const detail = event.detail as Record<string, unknown>
  return typeof detail.draft === 'string' ? { draft: detail.draft } : {}
}
