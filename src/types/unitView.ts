import type { RecallCompilePageFields, UnitSemanticType } from './docBrain'

export type UnitViewDomain =
  | 'docLibrary'
  | 'character'
  | 'characterBrain'
  | 'trace'
  | 'relationSystem'

export type UnitViewType =
  | 'root'
  | 'cluster'
  | 'branch'
  | 'leaf'
  | 'character'
  | 'core'
  | 'coreField'
  | 'soul'
  | 'soulNode'
  | 'trace'
  | 'traceDay'
  | 'traceGroup'
  | 'traceEvent'
  | 'traceArrangement'
  | 'predicate'
  | 'relation'

export type UnitViewContentKind =
  | 'markdown'
  | 'form'
  | 'group'
  | 'graph'
  | 'system'

export type UnitViewStatus =
  | 'normal'
  | 'pending'
  | 'placeholder'
  | 'dirty'
  | 'migrating'

export interface UnitViewCompilePage extends RecallCompilePageFields {
  updatedAt?: string
}

export interface UnitView {
  unitId: string
  domain: UnitViewDomain
  unitType: UnitViewType
  contentKind: UnitViewContentKind
  title: string
  parentId?: string
  orderIndex?: number
  sourceId?: string
  sourcePath?: string
  semanticType?: UnitSemanticType
  body?: string
  compilePage?: UnitViewCompilePage
  status: UnitViewStatus
  metadata?: Record<string, unknown>
}

export type PredicateFamily =
  | 'structure'
  | 'spatial_location'
  | 'spatial_neighbor'
  | 'origin'
  | 'power'
  | 'activity'
  | 'affiliation'
  | 'conflict'
  | 'alliance'
  | 'event_effect'
  | 'kinship'
  | 'belief_culture'
  | 'resource_output'
  | 'trade_flow'
  | 'craft_inheritance'
  | 'general'
  | 'spatial'
  | 'causal'
  | 'event'
  | 'lineage'
  | 'character'

export type RelationViewStatus =
  | 'projection'
  | 'declared'
  | 'authored'
  | 'candidate'
  | 'confirmed'
  | 'rejected'

export type RelationViewDirection =
  | 'directed'
  | 'bidirectional'

export type RelationEvidenceSourceType =
  | 'manual'
  | 'document'
  | 'brain'
  | 'trace'
  | 'chat'
  | 'compilePage'
  | 'tree'

export interface PredicateView {
  predicateId: string
  family: PredicateFamily
  key: string
  label: string
  inverseKey?: string
  description?: string
  status: RelationViewStatus
}

export interface RelationViewEvidence {
  sourceType: RelationEvidenceSourceType
  sourceId: string
  excerpt?: string
}

export interface RelationViewRecord {
  relationId: string
  sourceUnitId: string
  targetUnitId: string
  predicateId: string
  direction: RelationViewDirection
  status: RelationViewStatus
  strength?: number
  evidence: RelationViewEvidence[]
  createdAt?: string
  updatedAt?: string
}

export interface RelationDecisionRecord {
  relationId: string
  status: 'confirmed' | 'rejected'
  predicateId?: string
  updatedAt: string
}

export interface RelationSystemState {
  predicates: PredicateView[]
  relationDecisions: RelationDecisionRecord[]
}

export interface RelationSystemReadModel {
  units: UnitView[]
  predicates: PredicateView[]
  projectedRelations: RelationViewRecord[]
  declaredRelations: RelationViewRecord[]
  candidateRelations: RelationViewRecord[]
  confirmedRelations: RelationViewRecord[]
  rejectedRelations: RelationViewRecord[]
  relationDecisions: RelationDecisionRecord[]
}

export type UnitViewAdapterWarningCode =
  | 'doc_empty_path'
  | 'doc_duplicate_path'
  | 'doc_field_tree_unavailable'
  | 'doc_field_tree_missing_parent'
  | 'doc_field_tree_document_missing'
  | 'doc_missing_compile_page'
  | 'duplicate_sibling_title'
  | 'compile_page_incomplete'
  | 'manual_order_orphan'
  | 'character_brain_orphan_node'
  | 'trace_non_day_unit'
  | 'trace_range_unit'
  | 'trace_inner_entries'
  | 'relation_hint_target_missing'
  | 'relation_hint_invalid_predicate'
  | 'relation_hint_invalid_format'
  | 'relation_hint_title_ambiguous'
  | 'relation_hint_duplicate_relation'
  | 'brain_link_target_missing'

export interface UnitViewAdapterWarning {
  code: UnitViewAdapterWarningCode
  message: string
  unitId?: string
  sourceId?: string
  sourcePath?: string
  details?: Record<string, unknown>
}

export interface UnitViewAdapterResult {
  units: UnitView[]
  relations: RelationViewRecord[]
  warnings: UnitViewAdapterWarning[]
}

export type UnitViewValidationSeverity = 'blocker' | 'warning' | 'info'
export type UnitViewValidationActionLevel = 'must_fix' | 'can_defer' | 'notice'

export interface UnitViewValidationIssue {
  issueId: string
  code: UnitViewAdapterWarningCode
  severity: UnitViewValidationSeverity
  actionLevel: UnitViewValidationActionLevel
  title: string
  problem: string
  impact: string
  suggestion: string
  unitId?: string
  sourceId?: string
  sourcePath?: string
  details?: Record<string, unknown>
}

export interface UnitViewValidationReportSummary {
  total: number
  blockers: number
  warnings: number
  info: number
  mustFix: number
  canDefer: number
  notices: number
}

export interface UnitViewValidationReport {
  scope: string
  generatedAt: string
  summary: UnitViewValidationReportSummary
  issues: UnitViewValidationIssue[]
}
