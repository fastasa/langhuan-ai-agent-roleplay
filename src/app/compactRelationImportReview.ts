import { parseRelationHintReference } from './relationHintReference'

export type CompactRelationImportAction = 'add' | 'skip' | 'replace'
export type CompactRelationImportStatus = 'new' | 'same' | 'conflict'

export type CompactRelationImportItem = {
  id: string
  unitId: string
  unitTitle: string
  incomingHint: string
  incomingText: string
  currentMatches: string[]
  status: CompactRelationImportStatus
  defaultAction: CompactRelationImportAction
}

export type CompactRelationImportPlan = {
  items: CompactRelationImportItem[]
  skipped: number
  warnings: string[]
}

export type CompactRelationImportDecisionMap = Record<string, CompactRelationImportAction>

type UnitInput = {
  unitId: string
  title: string
  currentRelationHints: string[]
  incomingRelationHints: string[]
}

type RelationParts = {
  sourceRefId: string
  sourceTitle: string
  predicate: string
  targetRefId: string
  targetTitle: string
}

export function createCompactRelationImportPlan(input: {
  units: UnitInput[]
  skipped?: number
  warnings?: string[]
}): CompactRelationImportPlan {
  const items: CompactRelationImportItem[] = []
  input.units.forEach((unit) => {
    const currentRelationHints = normalizeList(unit.currentRelationHints)
    normalizeList(unit.incomingRelationHints).forEach((incomingHint, index) => {
      const currentMatches = findCurrentRelationMatches(incomingHint, currentRelationHints)
      const status: CompactRelationImportStatus = currentMatches.includes(incomingHint)
        ? 'same'
        : currentMatches.length
          ? 'conflict'
          : 'new'
      items.push({
        id: `${unit.unitId}:${index}:${hashText(incomingHint)}`,
        unitId: unit.unitId,
        unitTitle: unit.title,
        incomingHint,
        incomingText: formatRelationHintForReview(incomingHint),
        currentMatches,
        status,
        defaultAction: status === 'new' ? 'add' : 'skip'
      })
    })
  })
  return {
    items,
    skipped: input.skipped || 0,
    warnings: normalizeList(input.warnings)
  }
}

export function createDefaultCompactRelationImportDecisions(plan: CompactRelationImportPlan): CompactRelationImportDecisionMap {
  const decisions: CompactRelationImportDecisionMap = {}
  plan.items.forEach((item) => {
    decisions[item.id] = item.defaultAction
  })
  return decisions
}

export function countCompactRelationImportPlan(
  plan: CompactRelationImportPlan,
  decisions: CompactRelationImportDecisionMap = createDefaultCompactRelationImportDecisions(plan)
) {
  let add = 0
  let replace = 0
  let skip = plan.skipped || 0
  let same = 0
  let conflict = 0
  plan.items.forEach((item) => {
    if (item.status === 'same') same += 1
    if (item.status === 'conflict') conflict += 1
    const decision = decisions[item.id] || item.defaultAction
    if (decision === 'add') add += 1
    else if (decision === 'replace') replace += 1
    else skip += 1
  })
  return { add, replace, skip, same, conflict, total: plan.items.length }
}

export function applyCompactRelationImportDecisions(
  currentRelationHints: string[],
  items: CompactRelationImportItem[],
  decisions: CompactRelationImportDecisionMap
) {
  const remove = new Set<string>()
  const add: string[] = []
  items.forEach((item) => {
    const decision = decisions[item.id] || item.defaultAction
    if (decision === 'skip') return
    if (decision === 'replace') item.currentMatches.forEach((hint) => remove.add(hint))
    add.push(item.incomingHint)
  })
  return Array.from(new Set([
    ...normalizeList(currentRelationHints).filter((hint) => !remove.has(hint)),
    ...add
  ]))
}

export function formatRelationHintForReview(hint: string) {
  const parts = parseStrongRelationHint(hint)
  if (!parts) return hint
  return `${parts.sourceTitle} ${parts.predicate} ${parts.targetTitle}`
}

function findCurrentRelationMatches(incomingHint: string, currentRelationHints: string[]) {
  const incoming = parseStrongRelationHint(incomingHint)
  if (!incoming) return currentRelationHints.includes(incomingHint) ? [incomingHint] : []
  return currentRelationHints.filter((hint) => {
    if (hint === incomingHint) return true
    const current = parseStrongRelationHint(hint)
    if (!current) return false
    return relationPairKey(current) === relationPairKey(incoming)
  })
}

function relationPairKey(parts: RelationParts) {
  return [parts.sourceRefId, parts.targetRefId].sort().join('::')
}

function parseStrongRelationHint(hint: string): RelationParts | null {
  const match = String(hint || '').trim().match(/^\[\[(.+?)\]\]_(.+?)_\[\[(.+?)\]\]$/)
  if (!match) return null
  const source = parseRelationHintReference(match[1])
  const target = parseRelationHintReference(match[3])
  if (!source.refId || !target.refId) return null
  return {
    sourceRefId: source.refId,
    sourceTitle: source.title,
    predicate: String(match[2] || '').trim(),
    targetRefId: target.refId,
    targetTitle: target.title
  }
}

function normalizeList(value?: string[]) {
  return Array.isArray(value) ? value.map((item) => String(item || '').trim()).filter(Boolean) : []
}

function hashText(value: string) {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0
  }
  return Math.abs(hash).toString(36)
}
