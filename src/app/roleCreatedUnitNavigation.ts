import type { UnitView } from '../types/unitView'

export function resolveCreatedRoleUnitId(units: UnitView[], sourceId: string) {
  const normalizedSourceId = String(sourceId || '').trim()
  if (!normalizedSourceId) return ''
  return (Array.isArray(units) ? units : []).find((unit) => (
    (unit.domain === 'characterBrain' || unit.domain === 'trace')
    && String(unit.sourceId || '').trim() === normalizedSourceId
  ))?.unitId || ''
}
