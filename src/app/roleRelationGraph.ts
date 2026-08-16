import type { UnitView } from '../types/unitView'

const BRAIN_ROOT_ID = 'brain:root'
const CORE_ROOT_ID = 'brain:see_me'
const SOUL_ROOT_ID = 'brain:cognition'
const TRACE_ROOT_ID = 'brain:trajectory'

export function resolveRoleRelationFocusNodeId(unit: UnitView | null | undefined) {
  if (!unit) return BRAIN_ROOT_ID
  if (unit.unitType === 'character') return BRAIN_ROOT_ID
  if (unit.unitType === 'core') return CORE_ROOT_ID
  if (unit.unitType === 'soul') return SOUL_ROOT_ID
  if (unit.unitType === 'trace') return TRACE_ROOT_ID
  const sourceId = String(unit.sourceId || '').trim()
  return sourceId || BRAIN_ROOT_ID
}
