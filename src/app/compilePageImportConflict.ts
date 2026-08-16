import type { RecallCompilePageFields, UnitSemanticType } from '../types/docBrain'

export type CompilePageImportFieldKey = 'summary' | 'tags' | 'semanticType' | 'relationHints'
export type CompilePageImportDecision = 'skip' | 'overwrite'

export type CompilePageImportIncoming = RecallCompilePageFields & {
  semanticType?: UnitSemanticType
}

export type CompilePageImportCurrent = Partial<RecallCompilePageFields> & {
  semanticType?: UnitSemanticType
}

export type CompilePageImportFieldPlan = {
  key: CompilePageImportFieldKey
  label: string
  currentText: string
  incomingText: string
  hasCurrent: boolean
  hasIncoming: boolean
  isSame: boolean
  hasConflict: boolean
  decision: CompilePageImportDecision
}

export type CompilePageImportUnitPlan = {
  unitId: string
  title: string
  path?: string
  fields: CompilePageImportFieldPlan[]
}

export type CompilePageImportPlan = {
  units: CompilePageImportUnitPlan[]
  skipped?: number
}

export type CompilePageImportDecisionMap = Record<string, Record<CompilePageImportFieldKey, CompilePageImportDecision>>

export const COMPILE_PAGE_IMPORT_FIELD_LABELS: Record<CompilePageImportFieldKey, string> = {
  summary: '摘要',
  tags: '标签',
  semanticType: '类型',
  relationHints: '关系提示'
}

const FIELD_KEYS: CompilePageImportFieldKey[] = ['summary', 'tags', 'semanticType', 'relationHints']

export function createCompilePageImportUnitPlan(input: {
  unitId: string
  title: string
  path?: string
  current: CompilePageImportCurrent
  incoming: CompilePageImportIncoming
}): CompilePageImportUnitPlan {
  return {
    unitId: input.unitId,
    title: input.title,
    path: input.path,
    fields: FIELD_KEYS.map((key) => createFieldPlan(key, input.current, input.incoming))
  }
}

export function hasCompilePageImportConflicts(plan: CompilePageImportPlan) {
  return plan.units.some((unit) => unit.fields.some((field) => field.hasConflict))
}

export function countCompilePageImportPlan(plan: CompilePageImportPlan, decisions?: CompilePageImportDecisionMap) {
  let overwrite = 0
  let skipped = plan.skipped || 0
  let conflict = 0
  let same = 0
  plan.units.forEach((unit) => {
    unit.fields.forEach((field) => {
      if (field.hasConflict) conflict += 1
      if (field.isSame && field.hasIncoming) same += 1
      const decision = decisions?.[unit.unitId]?.[field.key] || field.decision
      if (decision === 'overwrite' && field.hasIncoming && !field.isSame) overwrite += 1
      if (decision === 'skip' && field.hasIncoming && !field.isSame) skipped += 1
    })
  })
  return { overwrite, skipped, conflict, same, units: plan.units.length }
}

export function createDefaultCompilePageImportDecisions(plan: CompilePageImportPlan): CompilePageImportDecisionMap {
  const decisions: CompilePageImportDecisionMap = {}
  plan.units.forEach((unit) => {
    decisions[unit.unitId] = {} as Record<CompilePageImportFieldKey, CompilePageImportDecision>
    unit.fields.forEach((field) => {
      decisions[unit.unitId][field.key] = field.decision
    })
  })
  return decisions
}

export function applyCompilePageImportDecisions(
  current: CompilePageImportCurrent,
  incoming: CompilePageImportIncoming,
  decisions: Record<CompilePageImportFieldKey, CompilePageImportDecision>
): CompilePageImportIncoming {
  return {
    summary: decisions.summary === 'overwrite' ? incoming.summary : String(current.summary || ''),
    tags: decisions.tags === 'overwrite' ? [...incoming.tags] : normalizeList(current.tags),
    semanticType: decisions.semanticType === 'overwrite' ? incoming.semanticType : current.semanticType,
    relationHints: decisions.relationHints === 'overwrite' ? [...incoming.relationHints] : normalizeList(current.relationHints)
  }
}

function createFieldPlan(
  key: CompilePageImportFieldKey,
  current: CompilePageImportCurrent,
  incoming: CompilePageImportIncoming
): CompilePageImportFieldPlan {
  const currentText = valueToText(key, current)
  const incomingText = valueToText(key, incoming)
  const hasCurrent = currentText.length > 0
  const hasIncoming = incomingText.length > 0
  const isSame = normalizeComparable(currentText) === normalizeComparable(incomingText)
  const hasConflict = hasCurrent && hasIncoming && !isSame
  return {
    key,
    label: COMPILE_PAGE_IMPORT_FIELD_LABELS[key],
    currentText,
    incomingText,
    hasCurrent,
    hasIncoming,
    isSame,
    hasConflict,
    decision: hasIncoming && !hasCurrent ? 'overwrite' : 'skip'
  }
}

function valueToText(key: CompilePageImportFieldKey, value: CompilePageImportCurrent | CompilePageImportIncoming) {
  if (key === 'summary') return String(value.summary || '').trim()
  if (key === 'semanticType') return String(value.semanticType || '').trim()
  if (key === 'tags') return normalizeList(value.tags).join('，')
  return normalizeList(value.relationHints).join('\n')
}

function normalizeList(value?: string[]) {
  return Array.isArray(value) ? value.map((item) => String(item || '').trim()).filter(Boolean) : []
}

function normalizeComparable(value: string) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}
