import type { RecallCompilePageFields, UnitSemanticType } from './docBrain'

export type CharacterBrainNodeSize = 1 | 2 | 3
export type CharacterBrainNodeDensity = 0 | 1 | 2 | 3 | 4 | 5

export type CharacterBrainNodeKind = 'root' | 'zone' | 'group' | 'field'
export type CharacterBrainEdgeKind = 'tree' | 'link'
export type CharacterBrainNodeLayoutMode = 'network' | 'folder'
export type CharacterBrainCognitionNodeKind = 'group' | 'reference' | 'private' | 'relation'
// 关系认知节点的认知对象类型：用户或其他角色
export type CharacterBrainRelationSubjectType = 'user' | 'character'
export type CharacterBrainTraceNodeKind = 'day' | 'month' | 'year' | 'multiYear' | 'decade' | 'century'
export type CharacterBrainTraceStepUnit = 'day' | 'month' | 'year'
export type CharacterBrainTraceSummaryMode = 'manual' | 'ai_compact_pending' | 'ai_compacted'
export type CharacterBrainTraceNodeType = 'single' | 'range'

export interface CharacterBrainTrajectoryRange {
  startDate: string
  startOffsetDays: number
  endDate: string
  endOffsetDays: number
}

export interface CharacterBrainNodeOffset {
  x: number
  y: number
}

export type CharacterBrainPinnedOffsets = Record<string, CharacterBrainNodeOffset>

export interface CharacterBrainNodePosition {
  x: number
  y: number
  locked?: boolean
}

export type CharacterBrainNodePositions = Record<string, CharacterBrainNodePosition>

export interface CharacterBrainTrajectoryDetailRange {
  startDate: string
  endDate: string
  kind: CharacterBrainTraceNodeKind
}

export interface CharacterBrainTrajectoryMeta {
  birthDate: string
  zeroNote: string
  calendarId?: string
  calendarConfig?: Record<string, unknown>
  autoCompilePageEnabled?: boolean
  version?: number
  coverageRange?: CharacterBrainTrajectoryRange
  coverageEndDate?: string
  coverageEndOffsetDays?: number
  pendingSoulTraceNodeIds?: string[]
  lastSoulWriteBackAt?: string
  viewOffsets?: Record<string, CharacterBrainNodeOffset>
  // 旧字段仅允许历史读取；新轨迹细化和概括不再把它作为正式真值。
  detailRanges?: CharacterBrainTrajectoryDetailRange[]
}

export interface CharacterBrainPendingNodeSnapshot {
  title: string
  summary: string
  content?: string
  timeLabel?: string
  pointDate?: string
  ageLabel?: string
  relatedEntityIds?: string[]
  tags?: string[]
  sourceDocumentId?: string
  sourceDisplayPath?: string
}

export interface CharacterBrainPendingReview {
  mode: 'create' | 'update'
  previous?: CharacterBrainPendingNodeSnapshot | null
  reason?: string
  createdBy?: string
  createdAt?: string
}

export interface CharacterBrainPendingReviewCard {
  mode: 'create' | 'update'
  reason: string
  createdBy: string
  createdAt: string
  previous?: CharacterBrainPendingNodeSnapshot | null
  current: CharacterBrainPendingNodeSnapshot
}

export type CharacterBrainFieldKey =
  | 'name'
  | 'gender'
  | 'age'
  | 'emoji'
  | 'avatarPath'
  | 'avatar'
  | 'basicInfo'
  | 'preset'
  | 'defaultPreset'
  | 'defaultModel'
  | 'nicknames'
  | 'appearance'
  | 'speakingStyle'
  | 'outfit'
  | 'personality'
  | 'hobbies'
  | 'abilities'
  | 'experience'
  | 'worldview'
  | 'background'
  | 'desc'

export type CharacterBrainCardFormFieldType = 'text' | 'textarea' | 'select' | 'avatar' | 'apiPreset' | 'apiModel' | 'calendarMonthDays' | 'checkbox'
export type CharacterBrainCardType = 'form' | 'document'

export interface CharacterBrainCardFormField {
  key: string
  label: string
  value: string
  type: CharacterBrainCardFormFieldType
  placeholder?: string
  options?: Array<{ label: string; value: string }>
  dividerBefore?: boolean
  readonly?: boolean
  columnSpan?: 1 | 2
  fieldClassName?: string
  controlClassName?: string
}

export interface CharacterBrainNodeModel {
  id: string
  title: string
  subtitle?: string
  kind: CharacterBrainNodeKind
  summary: string
  size: CharacterBrainNodeSize
  density: CharacterBrainNodeDensity
  x: number
  y: number
  deletable: boolean
  parentId?: string
  fieldKey?: CharacterBrainFieldKey
  edgeKind?: CharacterBrainEdgeKind
  layoutMode?: CharacterBrainNodeLayoutMode
  sourceDocumentId?: string
  sourceDisplayPath?: string
}

export interface CharacterBrainCognitionNode {
  id: string
  title: string
  summary: string
  parentId: string
  kind: CharacterBrainCognitionNodeKind
  content?: string
  // 关系认知节点(kind==='relation')专用：认知对象。此时 content 存 CharacterBrainRelationProfileContent 的 JSON。
  subjectType?: CharacterBrainRelationSubjectType
  subjectId?: string
  tags?: string[]
  relationHints?: string[]
  compilePage?: CharacterBrainCompilePage
  sourceDocumentId?: string
  sourceDisplayPath?: string
  sourceDetachedAt?: string
  sourceSnapshotTitle?: string
  sourceSnapshotSummary?: string
  pendingReview?: CharacterBrainPendingReview
  createdAt: string
  updatedAt: string
}

// 关系画像：角色对某对象（用户/其他角色）的持续认知，序列化后存进关系认知节点的 content。
// explicit=显式事实（可验证、带时间与冲突追踪）；implicit=隐式特质（推断的偏好/习惯）。
export interface CharacterBrainRelationProfileFact {
  key: string                                       // 事实维度，如"称呼""关系定性""信任倾向"
  value: string                                     // 当前值
  updatedAt: string
  history?: Array<{ value: string; at: string }>    // 历史快照，可回溯"曾经怎么看"
  conflict?: boolean                                // 与历史出现矛盾时标记，供人工确认
}

export interface CharacterBrainRelationProfileTrait {
  text: string                                      // 隐式特质的自然语言描述
  updatedAt: string
}

export interface CharacterBrainRelationProfileContent {
  explicit: CharacterBrainRelationProfileFact[]
  implicit: CharacterBrainRelationProfileTrait[]
}

export interface CharacterBrainTraceNode {
  id: string
  title: string
  summary: string
  subtitle?: string
  parentId: string
  kind: CharacterBrainTraceNodeKind
  nodeType: CharacterBrainTraceNodeType
  granularity: CharacterBrainTraceNodeKind
  startDate: string
  endDate?: string
  displayTitle: string
  note: string
  innerEntries: CharacterBrainTraceInnerEntry[]
  linkIds: string[]
  autoGenerated?: boolean
  systemRole?: 'yearBranch' | 'monthBranch' | 'multiYearBranch' | 'dayLeaf' | 'freeGroup' | 'eventLeaf' | 'arrangementLeaf'
  activationRule?: CharacterBrainArrangementActivationRule
  recallPolicy?: CharacterBrainArrangementRecallPolicy
  timeLabel: string
  pointDate: string
  offsetDays: number
  ageLabel: string
  stepUnit: CharacterBrainTraceStepUnit
  stepAmount: number
  // 旧区间字段只做兼容读取，新增写入应优先使用 startDate / endDate。
  spanYears?: number
  startAge?: number
  endAge?: number
  relatedEntityIds: string[]
  tags: string[]
  content: string
  summaryMode?: CharacterBrainTraceSummaryMode
  summarySourceNodeIds?: string[]
  confirmed: boolean
  pendingReview?: CharacterBrainPendingReview
  createdAt: string
  updatedAt: string
}

export interface CharacterBrainTraceInnerEntry {
  id: string
  nodeType: CharacterBrainTraceNodeType
  granularity: CharacterBrainTraceNodeKind
  startDate: string
  endDate?: string
  displayTitle: string
  note: string
  content: string
  linkIds: string[]
  sourceNodeIds: string[]
}

export interface CharacterBrainPublicReference {
  nodeId: string
  documentId: string
  title: string
  sourceDisplayPath: string
  summary: string
}

export interface CharacterBrainSourceLink {
  sourceType: 'chat_message' | 'document' | 'summary' | 'event_stack' | 'trace' | 'manual'
  sourceId: string
  title: string
  excerpt: string
}

export interface CharacterBrainCompilePage extends RecallCompilePageFields {
  semanticType?: UnitSemanticType
  recallPriorityMark?: 's' | 'a' | 'b' | 'c'
  recallPriorityUpdatedAt?: string
  lastRecallConfirmedAt?: string
  updatedAt: string
}

export interface CharacterBrainArrangementActivationRule {
  date?: string
  startTime?: string
  endTime?: string
  recurrence?: 'once' | 'daily' | 'weekly' | 'monthly' | 'yearly'
  prewarmMinutes?: number
  graceMinutes?: number
}

export interface CharacterBrainArrangementRecallPolicy {
  level?: 'summary' | 'body'
  priority?: 'normal' | 'must'
}

export type CharacterBrainRecallMetaMap = Record<string, CharacterBrainCompilePage>

export interface CharacterBrainCandidateChange {
  id: string
  characterId: string
  target: 'soul' | 'trace' | 'public_reference'
  action: 'create' | 'update'
  title: string
  summary: string
  reason: string
  confidence: number
  impactScope: string[]
  sourceLinks: CharacterBrainSourceLink[]
  status: 'pending' | 'accepted' | 'rejected'
  createdAt: string
}

export type CharacterBrainWriteBackTarget = 'core' | 'soul' | 'trace' | 'arrangement'
export type CharacterBrainWriteBackAction = 'create' | 'update' | 'merge'
export type CharacterBrainWriteBackReviewStatus = 'pending_review' | 'approved' | 'failed'
export type CharacterBrainWriteBackOutcomeKind = 'pending_unit' | 'pending_version'

export interface CharacterBrainWriteBackDraftContent {
  title: string
  summary: string
  content?: string
  tags?: string[]
  relationHints?: string[]
  // 关系认知写入(target=soul 且生成 kind='relation' 节点)专用：认知对象
  subjectType?: CharacterBrainRelationSubjectType
  subjectId?: string
}

export interface CharacterBrainWriteBackRecallSnapshot {
  required: boolean
  satisfied: boolean
  confirmedIds: string[]
  roundsCompleted: number
  readDecisions: Record<string, string>
}

export interface CharacterBrainWriteBackValidationIssue {
  code:
    | 'missing_source_links'
    | 'document_source_forbidden'
    | 'missing_target'
    | 'unsupported_target'
    | 'field_scope_forbidden'
    | 'missing_content'
    | 'organizing_recall_required'
  message: string
  field?: string
}

export interface CharacterBrainWriteBackAuditRecord {
  round: number
  approved: boolean
  issues: string[]
  localIssueCodes: string[]
  rawResponse?: string
  prompt?: string
}

export interface CharacterBrainWriteBackFailureReport {
  reason: string
  issues: CharacterBrainWriteBackValidationIssue[]
  auditRecords: CharacterBrainWriteBackAuditRecord[]
  createdAt: string
}

export interface CharacterBrainWriteBackOutcome {
  kind: CharacterBrainWriteBackOutcomeKind
  target: CharacterBrainWriteBackTarget
  targetUnitId?: string
  targetParentId?: string
  content: CharacterBrainWriteBackDraftContent
}

export interface CharacterBrainWriteBackDraft {
  id: string
  characterId: string
  target: CharacterBrainWriteBackTarget
  action: CharacterBrainWriteBackAction
  targetUnitId?: string
  targetParentId?: string
  content: CharacterBrainWriteBackDraftContent
  reason: string
  sourceLinks: CharacterBrainSourceLink[]
  organizingRecall: CharacterBrainWriteBackRecallSnapshot
  reviewStatus: CharacterBrainWriteBackReviewStatus
  auditRecords: CharacterBrainWriteBackAuditRecord[]
  failureReport?: CharacterBrainWriteBackFailureReport
  pendingOutcome?: CharacterBrainWriteBackOutcome
  createdAt: string
  updatedAt: string
}

export type CharacterBrainImportWarningCode = 'ignored_text' | 'duplicate_sibling'
export type CharacterBrainImportConflictAction = 'skip' | 'overwrite'

export interface CharacterBrainImportWarning {
  code: CharacterBrainImportWarningCode
  message: string
  path?: string
}

export interface CharacterBrainImportDraftNode {
  tempId: string
  title: string
  summary: string
  kind: CharacterBrainCognitionNodeKind
  content?: string
  subjectType?: CharacterBrainRelationSubjectType
  subjectId?: string
  tags?: string[]
  relationHints?: string[]
  compilePage?: CharacterBrainCompilePage
  sourceDocumentId?: string
  sourceDisplayPath?: string
  sourceDetachedAt?: string
  sourceSnapshotTitle?: string
  sourceSnapshotSummary?: string
  children: CharacterBrainImportDraftNode[]
}

export interface CharacterBrainImportDraft {
  version: number
  rootTitle: string
  nodes: CharacterBrainImportDraftNode[]
  flatNodes: CharacterBrainImportDraftNode[]
  warnings: CharacterBrainImportWarning[]
}

export interface CharacterBrainImportConflict {
  draftTempId: string
  existingNodeId: string
  title: string
  path: string
  defaultAction: CharacterBrainImportConflictAction
}

export interface CharacterBrainImportPreview {
  nodes: CharacterBrainImportDraftNode[]
  flatNodes: CharacterBrainImportDraftNode[]
  warnings: CharacterBrainImportWarning[]
  conflicts: CharacterBrainImportConflict[]
}

export interface CharacterBrainImportApplyResult {
  nodes: CharacterBrainCognitionNode[]
  createdNodeIds: string[]
  createdRootNodeIds: string[]
  updatedNodeIds: string[]
  updatedRootNodeIds: string[]
  skippedTempIds: string[]
}

export interface CharacterBrainImportError {
  message: string
  path?: string
}

export type CharacterBrainImportParseResult =
  | { ok: true; draft: CharacterBrainImportDraft }
  | { ok: false; error: CharacterBrainImportError }

export interface CharacterBrainLinkDraft {
  text: string
  targetIds: string[]
}

export interface CharacterBrainLinkSuggestion {
  id: string
  title: string
  kind: CharacterBrainNodeKind
  parentId?: string
  parentTitle?: string
}

export interface CharacterBrainCardModel {
  id: string
  nodeId: string
  title: string
  content: string
  cardType: CharacterBrainCardType
  editable: boolean
  formFields?: CharacterBrainCardFormField[]
  innerEntries?: CharacterBrainTraceInnerEntry[]
  linkDraft: CharacterBrainLinkDraft
  compilePage?: CharacterBrainCompilePage
  compilePageEditable?: boolean
  compileRelationHintsEditable?: boolean
  compileRelationHint?: string
  pendingReview?: CharacterBrainPendingReviewCard
}
