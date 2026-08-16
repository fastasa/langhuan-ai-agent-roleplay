export type WorkspaceWindowDomain = 'docLibrary' | 'characterBrain'
export type WorkspaceWindowKind = 'viewer' | 'editor' | 'form' | 'graph'

export interface UnitWorkspaceWindowInput {
  domain: WorkspaceWindowDomain
  unitId: string
  kind: WorkspaceWindowKind
  title: string
  id?: string
  sourceId?: string
  sourceKind?: string
  closable?: boolean
}

export interface WorkspaceWindowRecord {
  id: string
  kind: WorkspaceWindowKind
  title: string
  domain?: WorkspaceWindowDomain
  unitId?: string
  sourceId?: string
  sourceKind?: string
  closable?: boolean
}

export interface WorkspaceWindowState {
  windows: WorkspaceWindowRecord[]
  activeWindowId: string
  widths: Record<string, number>
}

export function createWorkspaceWindowState(windows: WorkspaceWindowRecord[] = []): WorkspaceWindowState {
  const normalized = normalizeWindows(windows)
  return {
    windows: normalized,
    activeWindowId: normalized[0]?.id || '',
    widths: normalizeWidths({}, normalized)
  }
}

export function createUnitWorkspaceWindow(input: UnitWorkspaceWindowInput): WorkspaceWindowRecord {
  const domain = normalizeDomain(input.domain) || 'docLibrary'
  const kind = normalizeKind(input.kind)
  const unitId = String(input.unitId || '').trim()
  const title = String(input.title || '').trim()
  const sourceKind = String(input.sourceKind || '').trim()
  const sourceId = String(input.sourceId || unitId).trim()
  return {
    id: String(input.id || `${domain}:${kind}:${unitId || 'unit'}`).trim(),
    kind,
    title,
    domain,
    unitId: unitId || undefined,
    sourceId: sourceId || undefined,
    sourceKind: sourceKind || undefined,
    closable: input.closable !== false
  }
}

export function upsertWorkspaceWindow(
  state: WorkspaceWindowState,
  window: WorkspaceWindowRecord,
  options: { activate?: boolean; placement?: 'left' | 'right' } = {}
): WorkspaceWindowState {
  const normalizedWindow = normalizeWindow(window)
  if (!normalizedWindow) return normalizeState(state)
  const current = normalizeState(state)
  const exists = current.windows.some((item) => item.id === normalizedWindow.id)
  const nextWindows = exists
    ? current.windows.map((item) => item.id === normalizedWindow.id ? { ...item, ...normalizedWindow } : item)
    : options.placement === 'left'
      ? [normalizedWindow, ...current.windows]
      : [...current.windows, normalizedWindow]
  return {
    windows: nextWindows,
    activeWindowId: options.activate === false
      ? (current.activeWindowId || normalizedWindow.id)
      : normalizedWindow.id,
    widths: normalizeWidths(current.widths, nextWindows)
  }
}

export function replaceActiveWorkspaceWindowByKind(
  state: WorkspaceWindowState,
  window: WorkspaceWindowRecord,
  options: { activate?: boolean } = {}
): WorkspaceWindowState {
  const normalizedWindow = normalizeWindow(window)
  if (!normalizedWindow) return normalizeState(state)
  const current = normalizeState(state)
  const activeWindow = current.windows.find((item) => item.id === current.activeWindowId)
  if (!activeWindow || activeWindow.kind !== normalizedWindow.kind) {
    return upsertWorkspaceWindow(current, normalizedWindow, { activate: options.activate })
  }

  const nextWindows = current.windows
    .filter((item) => item.id === activeWindow.id || item.id !== normalizedWindow.id)
    .map((item) => item.id === activeWindow.id ? normalizedWindow : item)
  const nextWidths = { ...current.widths }
  if (activeWindow.id !== normalizedWindow.id) {
    nextWidths[normalizedWindow.id] = nextWidths[activeWindow.id]
    delete nextWidths[activeWindow.id]
  }

  return {
    windows: nextWindows,
    activeWindowId: options.activate === false && activeWindow.id === normalizedWindow.id
      ? current.activeWindowId
      : normalizedWindow.id,
    widths: normalizeWidths(nextWidths, nextWindows)
  }
}

export function closeWorkspaceWindow(state: WorkspaceWindowState, windowId: string): WorkspaceWindowState {
  const current = normalizeState(state)
  const id = String(windowId || '').trim()
  const target = current.windows.find((item) => item.id === id)
  if (!target || target.closable === false) return current
  const nextWindows = current.windows.filter((item) => item.id !== id)
  const nextActive = current.activeWindowId === id
    ? nextWindows[Math.max(0, current.windows.findIndex((item) => item.id === id) - 1)]?.id || nextWindows[0]?.id || ''
    : current.activeWindowId
  const nextWidths = { ...current.widths }
  delete nextWidths[id]
  return {
    windows: nextWindows,
    activeWindowId: nextActive,
    widths: normalizeWidths(nextWidths, nextWindows)
  }
}

export function activateWorkspaceWindow(state: WorkspaceWindowState, windowId: string): WorkspaceWindowState {
  const current = normalizeState(state)
  const id = String(windowId || '').trim()
  return current.windows.some((item) => item.id === id)
    ? { ...current, activeWindowId: id }
    : current
}

export function reorderWorkspaceWindow(
  state: WorkspaceWindowState,
  sourceId: string,
  targetId: string,
  position: 'before' | 'after' = 'before'
): WorkspaceWindowState {
  const current = normalizeState(state)
  const source = String(sourceId || '').trim()
  const target = String(targetId || '').trim()
  if (!source || !target || source === target) return current
  const moving = current.windows.find((item) => item.id === source)
  if (!moving || !current.windows.some((item) => item.id === target)) return current
  const next = current.windows.filter((item) => item.id !== source)
  const targetIndex = next.findIndex((item) => item.id === target)
  if (targetIndex < 0) return current
  next.splice(position === 'after' ? targetIndex + 1 : targetIndex, 0, moving)
  return {
    ...current,
    windows: next
  }
}

export function resizeWorkspaceWindow(
  state: WorkspaceWindowState,
  windowId: string,
  nextWidth: number,
  options: { minWidth?: number; maxWidth?: number } = {}
): WorkspaceWindowState {
  const current = normalizeState(state)
  const id = String(windowId || '').trim()
  if (!current.windows.some((item) => item.id === id)) return current
  const minWidth = options.minWidth ?? 260
  const maxWidth = options.maxWidth ?? 960
  return {
    ...current,
    widths: {
      ...current.widths,
      [id]: clampWidth(nextWidth, minWidth, maxWidth)
    }
  }
}

export function canWorkspaceWindowOpenSidePreview(window: WorkspaceWindowRecord | null | undefined): boolean {
  return window?.kind === 'editor'
}

export function getWorkspaceWindowDefaultWidth(kind: WorkspaceWindowKind) {
  if (kind === 'editor') return 560
  if (kind === 'form') return 420
  if (kind === 'graph') return 520
  return 420
}

export function getWorkspaceWindowFlexStyle(
  state: WorkspaceWindowState,
  windows: WorkspaceWindowRecord[],
  window: WorkspaceWindowRecord,
  options: { singleWindowStyle?: Record<string, string> } = {}
) {
  const normalizedWindows = normalizeWindows(windows)
  if (normalizedWindows.length <= 1) return options.singleWindowStyle || {}
  const normalizedState = normalizeState(state)
  const width = normalizedState.widths?.[window.id] || getWorkspaceWindowDefaultWidth(window.kind)
  return {
    flex: `1 1 ${width}px`,
    minWidth: '0'
  }
}

function normalizeState(state: WorkspaceWindowState): WorkspaceWindowState {
  const windows = normalizeWindows(state?.windows || [])
  const activeWindowId = windows.some((item) => item.id === state?.activeWindowId)
    ? state.activeWindowId
    : windows[0]?.id || ''
  return {
    windows,
    activeWindowId,
    widths: normalizeWidths(state?.widths || {}, windows)
  }
}

function normalizeWindows(windows: WorkspaceWindowRecord[]): WorkspaceWindowRecord[] {
  const seen = new Set<string>()
  return (Array.isArray(windows) ? windows : [])
    .map((item) => normalizeWindow(item))
    .filter((item): item is WorkspaceWindowRecord => Boolean(item))
    .filter((item) => {
      if (seen.has(item.id)) return false
      seen.add(item.id)
      return true
    })
}

function normalizeWindow(window: WorkspaceWindowRecord): WorkspaceWindowRecord | null {
  const id = String(window?.id || '').trim()
  const title = String(window?.title || '').trim()
  if (!id || !title) return null
  const kind = normalizeKind(window.kind)
  const domain = normalizeDomain(window.domain)
  return {
    id,
    kind,
    title,
    domain,
    unitId: String(window.unitId || '').trim() || undefined,
    sourceId: String(window.sourceId || '').trim() || undefined,
    sourceKind: String(window.sourceKind || '').trim() || undefined,
    closable: window.closable !== false
  }
}

function normalizeWidths(widths: Record<string, number>, windows: WorkspaceWindowRecord[]) {
  const defaultWidth = windows.length > 1 ? 420 : 0
  return Object.fromEntries(windows.map((window) => [
    window.id,
    window.kind === 'editor' ? Number(widths[window.id] || 560) : Number(widths[window.id] || defaultWidth)
  ]))
}

function clampWidth(value: number, minWidth: number, maxWidth: number) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return minWidth
  return Math.min(maxWidth, Math.max(minWidth, numeric))
}

function normalizeKind(kind: WorkspaceWindowKind): WorkspaceWindowKind {
  return kind === 'viewer' || kind === 'editor' || kind === 'form' || kind === 'graph'
    ? kind
    : 'viewer'
}

function normalizeDomain(domain: WorkspaceWindowDomain | undefined) {
  return domain === 'docLibrary' || domain === 'characterBrain'
    ? domain
    : undefined
}
