import type { UnitView } from '../types/unitView'

export interface RelationHintReference {
  title: string
  refId?: string
}

const EXACT_REF_SEPARATOR = '@'

export function parseRelationHintReference(input: unknown): RelationHintReference {
  const raw = String(input || '').trim()
  if (!raw) return { title: '' }
  const separatorIndex = raw.lastIndexOf(EXACT_REF_SEPARATOR)
  if (separatorIndex <= 0 || separatorIndex >= raw.length - 1) return { title: raw }
  return {
    title: raw.slice(0, separatorIndex).trim(),
    refId: normalizeRelationRefId(raw.slice(separatorIndex + 1))
  }
}

export function formatRelationHintReferenceTitle(unit: UnitView | undefined): string {
  if (!unit) return ''
  const title = String(unit.title || '').trim()
  const refId = getUnitRelationRefId(unit)
  if (!title || !refId) return title
  return `${title}${EXACT_REF_SEPARATOR}${refId}`
}

export function getUnitRelationRefId(unit: UnitView | undefined): string {
  return getUnitRelationRefIds(unit)[0] || ''
}

export function getUnitRelationRefIds(unit: UnitView | undefined): string[] {
  if (!unit) return []
  const metadata = unit.metadata || {}
  return Array.from(new Set([
    metadata.relationRefId,
    metadata.overviewDocumentId,
    metadata.documentId,
    unit.domain === 'docLibrary' && unit.unitType === 'leaf' ? unit.sourceId : '',
    metadata.treeNodeId,
    unit.sourceId,
    unit.unitId
  ].map(normalizeRelationRefId).filter(Boolean)))
}

export function unitMatchesRelationRef(unit: UnitView, refId: string): boolean {
  const normalizedRefId = normalizeRelationRefId(refId)
  if (!normalizedRefId) return false
  return getUnitRelationRefIds(unit).includes(normalizedRefId)
}

export function normalizeRelationRefId(input: unknown): string {
  return String(input || '').trim()
}
