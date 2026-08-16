import {
  DEFAULT_PREDICATES
} from './unitViewAdapters'
import { parseRelationHintLine } from './relationHintParser'
import { measureSync } from '../utils/performanceMarks'
import type {
  PredicateView,
  RelationDecisionRecord,
  RelationSystemReadModel,
  RelationSystemState,
  RelationViewRecord,
  UnitView,
  UnitViewAdapterWarning,
  UnitViewAdapterResult
} from '../types/unitView'

export type RelationHintValidationStatus = 'valid' | 'warning'
export type CompileRelationIssueType =
  | 'duplicate_relation'
  | 'missing_target'
  | 'ambiguous_title'
  | 'invalid_predicate'
  | 'invalid_format'
  | 'direction_conflict'
  | 'unknown'
export type CompileRelationIssueSeverity = 'blocking' | 'suggestion' | 'notice'
export type CompileRelationIssueAction =
  | 'locate_line'
  | 'delete_line'
  | 'convert_to_weak_relation'
  | 'apply_suggested_text'
  | 'mark_reviewed'

export interface CompileRelationIssueMatchedUnit {
  unitId: string
  title: string
  path: string
  unitType?: UnitView['unitType']
  sourceId?: string
}

export interface CompileRelationIssueDuplicateEvidence {
  ownerUnitId?: string
  ownerTitle?: string
  ownerPath?: string
  line: string
  lineIndex?: number
  sourceType?: string
}

export interface CompileRelationIssue {
  id: string
  type: CompileRelationIssueType
  severity: CompileRelationIssueSeverity
  title: string
  description: string
  reason: string
  suggestion: string
  validationItemId: string
  code?: string
  ownerUnitId?: string
  ownerTitle?: string
  ownerPath?: string
  sourceTitle?: string
  targetTitle?: string
  predicateLabel?: string
  surfacePredicate?: string
  line: string
  lineIndex?: number
  relatedLineIndexes: number[]
  actionKinds: CompileRelationIssueAction[]
  safeAutoApply: boolean
  suggestedText?: string
  matchedUnits: CompileRelationIssueMatchedUnit[]
  duplicateEvidence: CompileRelationIssueDuplicateEvidence[]
}

export interface RelationHintValidationItem {
  id: string
  status: RelationHintValidationStatus
  code?: string
  message: string
  ownerUnitId?: string
  ownerTitle?: string
  sourceUnitId?: string
  sourceTitle?: string
  targetUnitId?: string
  targetTitle?: string
  predicateId?: string
  predicateLabel?: string
  surfacePredicate?: string
  line: string
  lineIndex?: number
  relatedLineIndexes?: number[]
  sourcePath?: string
  existingRelationId?: string
  duplicateEvidence?: CompileRelationIssueDuplicateEvidence[]
  matchedUnitIds?: string[]
  matchedUnits?: CompileRelationIssueMatchedUnit[]
}

export function buildCompileRelationIssues(
  items: RelationHintValidationItem[] = []
): CompileRelationIssue[] {
  const validLineIndexesByRelationKey = buildValidLineIndexesByRelationKey(items)
  return items
    .filter((item) => item.status === 'warning')
    .map((item) => {
      const preset = getCompileRelationIssuePreset(item)
      const titleFallback = extractStrongRelationTitles(item.line)
      const sourceTitle = item.sourceTitle || titleFallback?.sourceTitle
      const targetTitle = item.targetTitle || titleFallback?.targetTitle
      const relatedLineIndexes = buildCompileRelationIssueLineIndexes(item, validLineIndexesByRelationKey)
      const suggestedText = buildCompileRelationIssueSuggestedText({
        ...item,
        sourceTitle,
        targetTitle
      }, preset.type)
      return {
        id: `compile-relation-issue:${item.id}`,
        type: preset.type,
        severity: preset.severity,
        title: preset.title,
        description: preset.description,
        reason: item.message || preset.reason,
        suggestion: preset.suggestion,
        validationItemId: item.id,
        code: item.code,
        ownerUnitId: item.ownerUnitId,
        ownerTitle: item.ownerTitle,
        ownerPath: item.sourcePath,
        sourceTitle,
        targetTitle,
        predicateLabel: item.predicateLabel,
        surfacePredicate: item.surfacePredicate,
        line: item.line,
        lineIndex: item.lineIndex,
        relatedLineIndexes,
        actionKinds: buildCompileRelationIssueActions(preset.type, Boolean(suggestedText)),
        safeAutoApply: preset.safeAutoApply,
        suggestedText,
        matchedUnits: item.matchedUnits || [],
        duplicateEvidence: normalizeDuplicateEvidence(item.duplicateEvidence)
      }
    })
}

export function createEmptyRelationSystemState(): RelationSystemState {
  return {
    predicates: [],
    relationDecisions: []
  }
}

export function normalizeRelationSystemState(input: unknown): RelationSystemState {
  const source = input && typeof input === 'object' ? input as Partial<RelationSystemState> : {}
  return {
    predicates: normalizePredicates(source.predicates),
    relationDecisions: normalizeRelationDecisions(source.relationDecisions)
  }
}

export function buildRelationSystemReadModel(
  adapterResults: UnitViewAdapterResult[],
  stateInput: unknown = createEmptyRelationSystemState()
): RelationSystemReadModel {
  const unitCount = adapterResults.reduce((total, result) => total + (result.units?.length || 0), 0)
  const relationCount = adapterResults.reduce((total, result) => total + (result.relations?.length || 0), 0)
  return measureSync('relationSystem.readModel.build', () => buildRelationSystemReadModelCore(adapterResults, stateInput), {
    adapterCount: adapterResults.length,
    unitCount,
    relationCount
  }, 30)
}

function buildRelationSystemReadModelCore(
  adapterResults: UnitViewAdapterResult[],
  stateInput: unknown = createEmptyRelationSystemState()
): RelationSystemReadModel {
  const state = normalizeRelationSystemState(stateInput)
  const predicates = mergePredicates(DEFAULT_PREDICATES, state.predicates)
  const decisions = new Map(state.relationDecisions.map((item) => [item.relationId, item]))
  const units = dedupeUnits(adapterResults.flatMap((result) => result.units || []))
  const relations = dedupeRelations(adapterResults.flatMap((result) => result.relations || []))
    .map((relation) => applyDecision(relation, decisions.get(relation.relationId)))

  return {
    units,
    predicates,
    projectedRelations: relations.filter((relation) => relation.status === 'projection'),
    declaredRelations: relations.filter((relation) => relation.status === 'declared' || relation.status === 'authored'),
    candidateRelations: relations.filter((relation) => relation.status === 'candidate'),
    confirmedRelations: relations.filter((relation) => relation.status === 'confirmed'),
    rejectedRelations: relations.filter((relation) => relation.status === 'rejected'),
    relationDecisions: state.relationDecisions
  }
}

export function buildRelationHintValidationItems(
  readModel: RelationSystemReadModel,
  warnings: UnitViewAdapterWarning[] = []
): RelationHintValidationItem[] {
  const unitsById = new Map(readModel.units.map((unit) => [unit.unitId, unit] as const))
  const unitsBySourceId = new Map(readModel.units.map((unit) => [String(unit.sourceId || '').trim(), unit] as const))
  const predicatesById = new Map(readModel.predicates.map((predicate) => [predicate.predicateId, predicate] as const))
  const declaredItems = readModel.declaredRelations
    .filter((relation) => relation.evidence.some((evidence) => evidence.sourceType === 'compilePage' && evidence.excerpt))
    .map((relation) => {
      const evidence = relation.evidence.find((item) => item.sourceType === 'compilePage' && item.excerpt)
      const owner = resolveEvidenceOwner(evidence?.sourceId || '', unitsById, unitsBySourceId)
      const source = unitsById.get(relation.sourceUnitId)
      const target = unitsById.get(relation.targetUnitId)
      const line = String(evidence?.excerpt || '').trim()
      const lineIndex = findRelationHintLineIndex(owner, line)
      const parsed = parseRelationHintLine(line, lineIndex ?? 0)
      const assertion = parsed.assertions.find((item) => item.canonicalPredicateId === relation.predicateId)
      const predicate = predicatesById.get(relation.predicateId)
      return {
        id: `relation-valid:${relation.relationId}:${lineIndex ?? 'x'}`,
        status: 'valid' as const,
        message: '声明关系已通过校验，保存后直接进入关系读模型。',
        ownerUnitId: owner?.unitId,
        ownerTitle: owner?.title,
        sourceUnitId: source?.unitId || relation.sourceUnitId,
        sourceTitle: source?.title || relation.sourceUnitId,
        targetUnitId: target?.unitId || relation.targetUnitId,
        targetTitle: target?.title || relation.targetUnitId,
        predicateId: relation.predicateId,
        predicateLabel: predicate?.label || relation.predicateId,
        surfacePredicate: assertion?.surfacePredicate || predicate?.label || relation.predicateId,
        line,
        lineIndex,
        sourcePath: owner?.sourcePath,
        existingRelationId: relation.relationId
      }
    })

  const warningItems = warnings
    .filter((warning) => String(warning.code || '').startsWith('relation_hint_'))
    .map((warning, index) => {
      const owner = warning.unitId ? unitsById.get(warning.unitId) : undefined
      const details = warning.details || {}
      const line = String(details.hint || '').trim()
      const lineIndex = numberOrUndefined(details.lineIndex)
      const source = typeof details.sourceUnitId === 'string' ? unitsById.get(details.sourceUnitId) : undefined
      const target = typeof details.targetUnitId === 'string' ? unitsById.get(details.targetUnitId) : undefined
      const predicateId = typeof details.predicateId === 'string' ? details.predicateId : ''
      const predicate = predicateId ? predicatesById.get(predicateId) : undefined
      const parsed = parseRelationHintLine(line, lineIndex ?? 0)
      const assertion = parsed.assertions[0]
      const role = String(details.role || '')
      const title = String(details.title || '').trim()
      const issueScope = [
        role,
        title,
        predicateId || assertion?.canonicalPredicateId || '',
        typeof details.sourceUnitId === 'string' ? details.sourceUnitId : '',
        typeof details.targetUnitId === 'string' ? details.targetUnitId : '',
        index
      ].map((item) => String(item || '').trim()).join(':')
      return {
        id: `relation-warning:${warning.code}:${warning.unitId || warning.sourceId || 'unknown'}:${lineIndex ?? index}:${issueScope}:${line}`,
        status: 'warning' as const,
        code: warning.code,
        message: warning.message,
        ownerUnitId: owner?.unitId || warning.unitId,
        ownerTitle: owner?.title,
        sourceUnitId: source?.unitId,
        sourceTitle: source?.title || (role === 'source' ? title : assertion?.sourceTitle),
        targetUnitId: target?.unitId,
        targetTitle: target?.title || (role === 'target' ? title : assertion?.targetTitle || parsed.legacyHints[0]?.targetTitle),
        predicateId: predicateId || assertion?.canonicalPredicateId,
        predicateLabel: predicate?.label || predicateId || assertion?.canonicalPredicateId,
        surfacePredicate: assertion?.surfacePredicate || String(details.rawPredicate || '').trim() || predicate?.label,
        line,
        lineIndex,
        sourcePath: owner?.sourcePath || warning.sourcePath,
        existingRelationId: findExistingRelationId(readModel, source?.unitId, target?.unitId, predicateId),
        duplicateEvidence: normalizeDuplicateEvidence(details.duplicateEvidence),
        matchedUnitIds: Array.isArray(details.matchedUnitIds) ? details.matchedUnitIds.map((item) => String(item)) : undefined,
        matchedUnits: Array.isArray(details.matchedUnitIds)
          ? details.matchedUnitIds
              .map((item) => unitsById.get(String(item || '').trim()))
              .filter((unit): unit is UnitView => Boolean(unit))
              .map((unit) => ({
                unitId: unit.unitId,
                title: unit.title,
                path: String(unit.sourcePath || '').trim(),
                unitType: unit.unitType,
                sourceId: String(unit.sourceId || '').trim() || undefined
              }))
          : undefined
      }
    })

  return [...warningItems, ...declaredItems]
    .sort((left, right) => {
      const ownerCompare = String(left.ownerTitle || '').localeCompare(String(right.ownerTitle || ''), 'zh-Hans-CN')
      if (ownerCompare !== 0) return ownerCompare
      return (left.lineIndex ?? Number.MAX_SAFE_INTEGER) - (right.lineIndex ?? Number.MAX_SAFE_INTEGER)
    })
}

export function upsertRelationPredicate(
  stateInput: unknown,
  predicateInput: PredicateView
): RelationSystemState {
  const state = normalizeRelationSystemState(stateInput)
  const predicate = normalizePredicate(predicateInput)
  if (!predicate) return state
  return {
    ...state,
    predicates: mergePredicates(
      state.predicates.filter((item) => item.predicateId !== predicate.predicateId),
      [predicate]
    )
  }
}

export function confirmRelationCandidate(
  stateInput: unknown,
  relationId: string,
  predicateId = '',
  updatedAt = new Date().toISOString()
): RelationSystemState {
  return upsertRelationDecision(stateInput, {
    relationId,
    status: 'confirmed',
    predicateId,
    updatedAt
  })
}

export function rejectRelationCandidate(
  stateInput: unknown,
  relationId: string,
  updatedAt = new Date().toISOString()
): RelationSystemState {
  return upsertRelationDecision(stateInput, {
    relationId,
    status: 'rejected',
    updatedAt
  })
}

function upsertRelationDecision(
  stateInput: unknown,
  decisionInput: RelationDecisionRecord
): RelationSystemState {
  const state = normalizeRelationSystemState(stateInput)
  const decision = normalizeDecision(decisionInput)
  if (!decision) return state
  return {
    ...state,
    relationDecisions: [
      ...state.relationDecisions.filter((item) => item.relationId !== decision.relationId),
      decision
    ].sort((left, right) => left.relationId.localeCompare(right.relationId, 'zh-Hans-CN'))
  }
}

function resolveEvidenceOwner(
  sourceId: string,
  unitsById: Map<string, UnitView>,
  unitsBySourceId: Map<string, UnitView>
) {
  const key = String(sourceId || '').trim()
  return unitsBySourceId.get(key) || unitsById.get(key)
}

function findRelationHintLineIndex(unit: UnitView | undefined, line: string) {
  if (!unit || !line) return undefined
  const hints = Array.isArray(unit.compilePage?.relationHints) ? unit.compilePage.relationHints : []
  const index = hints.findIndex((hint) => String(hint || '').trim() === line)
  return index >= 0 ? index : undefined
}

function numberOrUndefined(input: unknown) {
  return typeof input === 'number' && Number.isFinite(input) ? input : undefined
}

function findExistingRelationId(
  readModel: RelationSystemReadModel,
  sourceUnitId = '',
  targetUnitId = '',
  predicateId = ''
) {
  if (!sourceUnitId || !targetUnitId || !predicateId) return undefined
  const relations = [
    ...readModel.projectedRelations,
    ...readModel.declaredRelations,
    ...readModel.candidateRelations,
    ...readModel.confirmedRelations
  ]
  return relations.find((relation) => (
    relation.sourceUnitId === sourceUnitId
    && relation.targetUnitId === targetUnitId
    && relation.predicateId === predicateId
  ))?.relationId
}

function normalizeDuplicateEvidence(input: unknown): CompileRelationIssueDuplicateEvidence[] {
  if (!Array.isArray(input)) return []
  return input
    .filter((item) => item && typeof item === 'object')
    .map((item) => {
      const source = item as Partial<CompileRelationIssueDuplicateEvidence>
      return {
        ownerUnitId: String(source.ownerUnitId || '').trim() || undefined,
        ownerTitle: String(source.ownerTitle || '').trim() || undefined,
        ownerPath: String(source.ownerPath || '').trim() || undefined,
        line: String(source.line || '').trim(),
        lineIndex: typeof source.lineIndex === 'number' && Number.isFinite(source.lineIndex) ? source.lineIndex : undefined,
        sourceType: String(source.sourceType || '').trim() || undefined
      }
    })
    .filter((item) => item.line)
}

function buildValidLineIndexesByRelationKey(items: RelationHintValidationItem[]) {
  const map = new Map<string, number[]>()
  items
    .filter((item) => item.status === 'valid' && typeof item.lineIndex === 'number')
    .forEach((item) => {
      const key = getValidationRelationKey(item)
      if (!key) return
      map.set(key, [...(map.get(key) || []), item.lineIndex as number])
    })
  return map
}

function buildCompileRelationIssueLineIndexes(
  item: RelationHintValidationItem,
  validLineIndexesByRelationKey: Map<string, number[]>
) {
  const indexes = new Set<number>()
  if (typeof item.lineIndex === 'number') indexes.add(item.lineIndex)
  if (Array.isArray(item.relatedLineIndexes)) {
    item.relatedLineIndexes
      .filter((lineIndex) => typeof lineIndex === 'number' && Number.isFinite(lineIndex))
      .forEach((lineIndex) => indexes.add(lineIndex))
  }
  if (item.code === 'relation_hint_duplicate_relation') {
    const key = getValidationRelationKey(item)
    validLineIndexesByRelationKey.get(key || '')?.forEach((lineIndex) => indexes.add(lineIndex))
  }
  return Array.from(indexes).sort((left, right) => left - right)
}

function getValidationRelationKey(item: RelationHintValidationItem) {
  const source = String(item.sourceUnitId || item.sourceTitle || '').trim()
  const target = String(item.targetUnitId || item.targetTitle || '').trim()
  const predicate = String(item.predicateId || item.predicateLabel || '').trim()
  if (!source || !target || !predicate) return ''
  return `${source}\u0000${predicate}\u0000${target}`
}

function getCompileRelationIssuePreset(item: RelationHintValidationItem): {
  type: CompileRelationIssueType
  severity: CompileRelationIssueSeverity
  title: string
  description: string
  reason: string
  suggestion: string
  safeAutoApply: boolean
} {
  switch (item.code) {
    case 'relation_hint_duplicate_relation':
      return {
        type: 'duplicate_relation',
        severity: 'suggestion',
        title: '重复关系',
        description: '这条关系归一后已经存在，继续保留只会制造重复证据。',
        reason: '系统已跳过重复声明，关系视图不会多生成一条边。',
        suggestion: '删除重复行，或保留更可信的一条作为证据。',
        safeAutoApply: true
      }
    case 'relation_hint_target_missing':
      return {
        type: 'missing_target',
        severity: 'suggestion',
        title: '目标不存在',
        description: '关系提示引用的单位没有匹配到当前资料单位。',
        reason: '目标不存在时，系统无法生成可用关系边。',
        suggestion: '检查标题是否写错；如果只是未来资料，可暂时保留，等目标单位建立后再校验。',
        safeAutoApply: false
      }
    case 'relation_hint_title_ambiguous':
      return {
        type: 'ambiguous_title',
        severity: 'blocking',
        title: '端点歧义',
        description: '关系提示里的单位名在当前上下文仍不能唯一解析。',
        reason: '自动选择端点会把声明关系连错，污染关系视图和召回。',
        suggestion: '补充更明确的单位上下文，或等后续选择器写入稳定目标。',
        safeAutoApply: false
      }
    case 'relation_hint_invalid_predicate':
      return {
        type: 'invalid_predicate',
        severity: 'blocking',
        title: '谓词非法',
        description: '关系词不在受控谓词词典里。',
        reason: '非法谓词不会进入强关系解析。',
        suggestion: '从合法谓词中选择一个；如果确实需要新关系词，先扩展谓词词典。',
        safeAutoApply: true
      }
    case 'relation_hint_invalid_format':
      return {
        type: 'invalid_format',
        severity: 'suggestion',
        title: '格式异常',
        description: '这行既不是弱关系，也不是合法强关系格式。',
        reason: '格式异常时，系统不会把它降级猜成关系。',
        suggestion: '改成 `[[源单位]]_关系词_[[目标单位]]`，或只保留单个 `[[单位]]`。',
        safeAutoApply: true
      }
    case 'relation_hint_direction_conflict':
      return {
        type: 'direction_conflict',
        severity: 'blocking',
        title: '方向冲突',
        description: '同一组单位出现了相反方向或互斥方向的关系表达。',
        reason: '系统无法判断真实父子或归属方向。',
        suggestion: '跳到相关行，人工保留可信的一条，不自动修正。',
        safeAutoApply: false
      }
    default:
      return {
        type: 'unknown',
        severity: 'notice',
        title: '关系提示提醒',
        description: '这条关系提示需要检查。',
        reason: item.message || '系统返回了未分类的关系提示校验信息。',
        suggestion: '先定位到原始行，按提示修正。',
        safeAutoApply: false
      }
  }
}

function buildCompileRelationIssueActions(
  type: CompileRelationIssueType,
  hasSuggestedText: boolean
): CompileRelationIssueAction[] {
  const actions: CompileRelationIssueAction[] = ['locate_line', 'mark_reviewed']
  if (type === 'duplicate_relation') return [...actions, 'delete_line']
  if (type === 'invalid_predicate' || type === 'invalid_format') {
    return hasSuggestedText
      ? [...actions, 'apply_suggested_text', 'delete_line']
      : [...actions, 'delete_line']
  }
  if (type === 'missing_target') return [...actions, 'delete_line']
  return actions
}

function buildCompileRelationIssueSuggestedText(
  item: RelationHintValidationItem,
  type: CompileRelationIssueType
) {
  if (type === 'invalid_format' && item.targetTitle) return `[[${item.targetTitle}]]`
  if (type === 'invalid_predicate' && item.sourceTitle && item.targetTitle) {
    return `[[${item.sourceTitle}]]_关联_[[${item.targetTitle}]]`
  }
  return undefined
}

function extractStrongRelationTitles(line: string) {
  const match = /^\s*\[\[([^\]]+)\]\]\s*_\s*([^_]+?)\s*_\s*\[\[([^\]]+)\]\]\s*$/u.exec(String(line || '').trim())
  if (!match) return undefined
  const sourceTitle = String(match[1] || '').trim()
  const targetTitle = String(match[3] || '').trim()
  if (!sourceTitle || !targetTitle) return undefined
  return { sourceTitle, targetTitle }
}

function normalizePredicates(input: unknown): PredicateView[] {
  if (!Array.isArray(input)) return []
  return input.map((item) => normalizePredicate(item)).filter((item): item is PredicateView => Boolean(item))
}

function normalizePredicate(input: unknown): PredicateView | null {
  const source = input && typeof input === 'object' ? input as Partial<PredicateView> : null
  if (!source) return null
  const predicateId = String(source.predicateId || '').trim()
  const key = String(source.key || '').trim()
  const label = String(source.label || '').trim()
  if (!predicateId || !key || !label) return null
  return {
    predicateId,
    family: source.family || 'general',
    key,
    label,
    inverseKey: String(source.inverseKey || '').trim() || undefined,
    description: String(source.description || '').trim() || undefined,
    status: source.status === 'rejected' ? 'rejected' : 'confirmed'
  }
}

function normalizeRelationDecisions(input: unknown): RelationDecisionRecord[] {
  if (!Array.isArray(input)) return []
  const seen = new Map<string, RelationDecisionRecord>()
  input.forEach((item) => {
    const decision = normalizeDecision(item)
    if (!decision) return
    seen.set(decision.relationId, decision)
  })
  return Array.from(seen.values()).sort((left, right) => left.relationId.localeCompare(right.relationId, 'zh-Hans-CN'))
}

function normalizeDecision(input: unknown): RelationDecisionRecord | null {
  const source = input && typeof input === 'object' ? input as Partial<RelationDecisionRecord> : null
  if (!source) return null
  const relationId = String(source.relationId || '').trim()
  const status = source.status === 'confirmed' || source.status === 'rejected' ? source.status : ''
  if (!relationId || !status) return null
  return {
    relationId,
    status,
    predicateId: String(source.predicateId || '').trim() || undefined,
    updatedAt: String(source.updatedAt || '').trim() || new Date().toISOString()
  }
}

function mergePredicates(...groups: PredicateView[][]): PredicateView[] {
  const map = new Map<string, PredicateView>()
  groups.flat().forEach((predicate) => {
    const normalized = normalizePredicate(predicate)
    if (!normalized) return
    map.set(normalized.predicateId, normalized)
  })
  return Array.from(map.values()).sort((left, right) => left.label.localeCompare(right.label, 'zh-Hans-CN'))
}

function applyDecision(
  relation: RelationViewRecord,
  decision: RelationDecisionRecord | undefined
): RelationViewRecord {
  if (
    !decision
    || relation.status === 'projection'
    || relation.status === 'declared'
    || relation.status === 'authored'
  ) return relation
  return {
    ...relation,
    predicateId: decision.predicateId || relation.predicateId,
    status: decision.status,
    updatedAt: decision.updatedAt
  }
}

function dedupeUnits(units: UnitView[]) {
  const map = new Map<string, UnitView>()
  units.forEach((unit) => {
    if (!unit.unitId || map.has(unit.unitId)) return
    map.set(unit.unitId, unit)
  })
  return Array.from(map.values()).sort((left, right) => left.title.localeCompare(right.title, 'zh-Hans-CN'))
}

function dedupeRelations(relations: RelationViewRecord[]) {
  const map = new Map<string, RelationViewRecord>()
  relations.forEach((relation) => {
    if (!relation.relationId || map.has(relation.relationId)) return
    map.set(relation.relationId, relation)
  })
  return Array.from(map.values()).sort((left, right) => left.relationId.localeCompare(right.relationId, 'zh-Hans-CN'))
}
