export type StatusPanelReference = {
  kind: 'status_panel'
  sessionId: string
  panelId: string
}

function value(value: unknown): string {
  return String(value ?? '').trim()
}

export function createStatusPanelReference(sessionId: string, panelId: string): StatusPanelReference {
  const normalizedSessionId = value(sessionId)
  const normalizedPanelId = value(panelId)
  if (!normalizedSessionId || !normalizedPanelId) throw new Error('状态栏引用缺少 sessionId 或 panelId')
  return { kind: 'status_panel', sessionId: normalizedSessionId, panelId: normalizedPanelId }
}

export function parseStatusPanelReference(input: unknown): StatusPanelReference | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null
  const record = input as Record<string, unknown>
  if (value(record.kind) !== 'status_panel') return null
  const sessionId = value(record.sessionId ?? record.session_id)
  const panelId = value(record.panelId ?? record.panel_id)
  return sessionId && panelId ? { kind: 'status_panel', sessionId, panelId } : null
}

export function renderStatusPanelReference(reference: StatusPanelReference): string {
  return JSON.stringify(reference)
}
