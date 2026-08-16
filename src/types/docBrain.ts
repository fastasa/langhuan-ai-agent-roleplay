import type { RelationSystemState } from './unitView'

export type BrainNeuronKind =
  | 'public_reference'
  | 'private_memory'
  | 'private_understanding'

export type BrainVersionState = 'confirmed' | 'pending'
export type BrainCompileSourceState = 'manual_confirmed' | 'ai_pending' | 'needs_review'

export type BrainDocumentType =
  | 'worldview_place'
  | 'worldview_organization'
  | 'worldview_biology'
  | 'worldview_item'
  | 'worldview_rule'
  | 'character_profile'
  | 'character_memory'
  | 'character_understanding'
  | 'event_note'
  | 'summary_note'
  | 'daily_report'
  | 'generic_markdown'

export type BrainDocumentKind = BrainDocumentType

export type UnitSemanticType =
  | 'world'
  | 'region'
  | 'terrain'
  | 'settlement'
  | 'character'
  | 'lineage'
  | 'organization'
  | 'polity'
  | 'role_identity'
  | 'event'
  | 'period'
  | 'law_system'
  | 'belief'
  | 'culture'
  | 'language'
  | 'resource'
  | 'item'
  | 'ability'
  | 'species'
  | 'concept'
  | 'text_legend'
  | 'other'

export interface RecallCompilePageFields {
  summary: string
  tags: string[]
  relationHints: string[]
  scoreDirectBase?: number
  scoreExpandBase?: number
  scoreSelfAnchor?: number
  scoreUserAnchor?: number
  scoreOtherAnchor?: number
}

export interface BrainPublicCompilePage extends RecallCompilePageFields {
  sourceState: BrainCompileSourceState
  updatedAt: string
}

export interface BrainDocumentSourceMeta {
  provider: 'sillytavern_worldbook' | string
  sourceFileName: string
  sourceFilePath?: string
  sourceEntryUid?: string
  sourceEntryKey?: string
  sourceEntryHash?: string
  importedAt: string
  updatedFromSourceAt?: string
}

export interface BrainDocumentRecord {
  // documentId / documentType 是当前阶段的正式字段。
  // id / kind 继续保留，方便兼容现有调用点。
  documentId: string
  id: string
  stableId: string
  title: string
  displayPath: string
  documentType: BrainDocumentType
  kind: BrainDocumentKind
  /** 单位语义类型；旧构造点可暂缺，正式读写链路会归一化为系统枚举。 */
  semanticType?: UnitSemanticType
  summary: string
  tags: string[]
  content: string
  publicCompilePage?: BrainPublicCompilePage
  sourceDocumentIds: string[]
  relatedNeuronIds: string[]
  sourceMeta?: BrainDocumentSourceMeta
  versionState: BrainVersionState
  createdAt: string
  updatedAt: string
}

export interface SillyTavernWorldbookEntry {
  uid?: number | string
  comment?: string
  content?: string
  key?: string[]
  keysecondary?: string[]
  order?: number
  displayIndex?: number
  constant?: boolean
  selective?: boolean
  disable?: boolean
}

export interface SillyTavernWorldbookFileInput {
  fileName: string
  filePath?: string
  content: string
}

export type SillyTavernWorldbookImportWarningCode =
  | 'empty_title'
  | 'empty_content'
  | 'invalid_entry'
  | 'duplicate_source'
  | 'duplicate_display_path'

export interface SillyTavernWorldbookImportWarning {
  code: SillyTavernWorldbookImportWarningCode
  message: string
  fileName?: string
  entryUid?: string
  displayPath?: string
}

export interface SillyTavernWorldbookImportError {
  message: string
  fileName?: string
  path?: string
}

export interface SillyTavernWorldbookImportDocumentDraft extends BrainDocumentRecord {
  sourceMeta: BrainDocumentSourceMeta
  importCategory: string
  importThemeTitle: string
}

export interface SillyTavernWorldbookImportTreeNode {
  id: string
  kind: 'folder' | 'document'
  title: string
  displayPath: string
  documentId?: string
  children: SillyTavernWorldbookImportTreeNode[]
}

export interface SillyTavernWorldbookImportPreview {
  rootTitle: string
  files: string[]
  documents: SillyTavernWorldbookImportDocumentDraft[]
  tree: SillyTavernWorldbookImportTreeNode[]
  warnings: SillyTavernWorldbookImportWarning[]
  conflicts: SillyTavernWorldbookImportWarning[]
  stats: {
    fileCount: number
    documentCount: number
    warningCount: number
    conflictCount: number
  }
}

export type SillyTavernWorldbookImportParseResult =
  | { ok: true; preview: SillyTavernWorldbookImportPreview }
  | { ok: false; error: SillyTavernWorldbookImportError }

export type SillyTavernWorldbookImportConflictStrategy = 'skip' | 'overwrite' | 'duplicate'

export interface SillyTavernWorldbookApplyResult {
  ok: true
  preview: SillyTavernWorldbookImportPreview
  documents: BrainDocumentRecord[]
  addedCount: number
  updatedCount: number
  skippedCount: number
}

// 文档库协议版本。1 是当前路径树协议，2 是后续 parentId 字段树协议。
export type DocLibrarySchemaVersion = 1 | 2

// 文档树节点类型。root 是根，folder 是文件夹，document 是正式文档节点。
export type DocTreeNodeKind = 'root' | 'folder' | 'document'

// 文档树节点状态。迁移第一期只使用 active，其他状态为后续回收站或归档预留。
export type DocTreeNodeStatus = 'active' | 'archived' | 'deleted'

// 文档树节点记录：字段树里的稳定结构单位，不等同于文档正文记录。
export interface DocTreeNodeRecord {
  /** nodeId（节点编号）：字段树内稳定身份，重命名或移动时不应变化。 */
  nodeId: string
  /** nodeKind（节点类型）：区分根、文件夹和文档节点。 */
  nodeKind: DocTreeNodeKind
  /** parentId（父级编号）：直接父级节点 ID；根节点为 null。 */
  parentId: string | null
  /** title（显示标题）：节点在树上的标题，不负责保存文档正文。 */
  title: string
  /** documentId（文档编号）：仅 document 节点填写，指向 BrainDocumentRecord.documentId。 */
  documentId?: string
  /** overviewDocumentId（概览文档编号）：文件夹概览文档，例如 index.md。 */
  overviewDocumentId?: string
  /** legacyDisplayPath（旧显示路径）：从 v1 迁移过来的兼容路径，用于审计和回退。 */
  legacyDisplayPath?: string
  /** status（节点状态）：默认 active；后续归档或软删除时使用。 */
  status: DocTreeNodeStatus
  /** createdAt（创建时间）：节点身份首次生成的时间。 */
  createdAt: string
  /** updatedAt（更新时间）：节点结构信息最后更新的时间。 */
  updatedAt: string
}

// 文档树排序桶：key 是父节点 ID，value 是该父级下子节点 ID 的顺序。
export type DocTreeOrders = Record<string, string[]>

// 字段树迁移元信息：记录结构来源、审计时间和兼容期状态，帮助后续判断是否能切换真值。
export interface DocLibraryTreeMigrationMeta {
  /** treeSource（树来源）：path 表示从 displayPath 推导，field 表示正式字段树。 */
  treeSource: 'path' | 'field'
  /** generatedAt（生成时间）：字段树或影子树生成时间。 */
  generatedAt: string
  /** auditReportPath（审计报告路径）：最近一次字段树审计报告。 */
  auditReportPath?: string
  /** hasBlockingIssues（是否存在阻断项）：为 true 时不能进入真实双写或正式切读。 */
  hasBlockingIssues: boolean
}

// 字段树差异报告：兼容期比较旧路径树和新字段树是否还能互相还原。
export interface DocLibraryTreeDiffReport {
  /** generatedAt（生成时间）：本次差异报告生成时间。 */
  generatedAt: string
  /** treeSource（树来源）：说明本次对比的字段树来源。 */
  treeSource: 'path' | 'field'
  /** blockerCount（阻断数量）：大于 0 时不能正式切读字段树。 */
  blockerCount: number
  /** warningCount（警告数量）：不会阻止读取，但需要在正式迁移前解释或清理。 */
  warningCount: number
  /** documentPathMismatchCount（文档路径不一致数量）：字段树反推路径与旧路径不同的文档数。 */
  documentPathMismatchCount: number
  /** manualOrderMismatchCount（旧排序桶不一致数量）：字段树反推排序与旧排序不同的桶数。 */
  manualOrderMismatchCount: number
  /** missingDocumentNodeCount（缺少文档节点数量）：字段树里找不到对应文档节点的数量。 */
  missingDocumentNodeCount: number
  /** extraDocumentNodeCount（多余文档节点数量）：字段树里存在但文档列表里不存在的文档节点数量。 */
  extraDocumentNodeCount: number
  /** issues（问题列表）：短问题说明，供开发环境、审计报告和后续 Agent 判断。 */
  issues: Array<{
    severity: 'blocker' | 'warning'
    code: string
    message: string
    documentId?: string
    bucketId?: string
    expected?: string
    actual?: string
  }>
  /** canUseFieldTree（是否可用字段树）：true 表示当前字段树和旧路径树没有阻断差异。 */
  canUseFieldTree: boolean
}

export interface DocLibraryStateSnapshot {
  /** schemaVersion（协议版本）：缺省按 1 处理；2 才表示携带字段树协议。 */
  schemaVersion?: DocLibrarySchemaVersion
  /** documents（文档列表）：正式文档正文与公共编译页记录。 */
  documents: BrainDocumentRecord[]
  /** manualTreeOrders（旧路径树排序）：v1 正式真值；v2 兼容期保留用于回退。 */
  manualTreeOrders: Record<string, string[]>
  /** treeNodes（字段树节点）：v2 结构真值候选；批次 2 只定义协议，不启用运行态读取。 */
  treeNodes?: DocTreeNodeRecord[]
  /** treeOrders（字段树排序）：v2 排序桶，以父节点 ID 为 key。 */
  treeOrders?: DocTreeOrders
  /** treeMigrationMeta（字段树迁移元信息）：记录来源、审计和阻断状态。 */
  treeMigrationMeta?: DocLibraryTreeMigrationMeta
  /** treeDiffReport（字段树差异报告）：兼容期比较旧路径树和字段树是否一致。 */
  treeDiffReport?: DocLibraryTreeDiffReport
  /** relationSystemState（关系系统状态）：与树迁移同包读写，但不由字段树重建。 */
  relationSystemState: RelationSystemState
}

export interface BrainNeuronRecord {
  brainNeuronId: string
  neuronKind: BrainNeuronKind
  displayPath: string
  title: string
  summary: string
  tags: string[]
  sourceDocumentIds: string[]
  relatedNeuronIds: string[]
  content: string
  versionState: BrainVersionState
  createdAt: string
  updatedAt: string
}

export interface BrainRecallCandidateCard {
  id: string
  k: BrainNeuronKind | 'public_compile_page' | 'character_core' | 'character_soul' | 'character_trace' | 'character_arrangement' | 'candidate_change' | 'observable_profile' | 'session_temporary_entity'
  p: string
  t: string
  s: string
  tags: string[]
  u: string
  imp?: number
  src?: string[]
  /** 原始 [[文档名]] 关系提示，供召回层解析关联查询 */
  relationHints: string[]
  /** 已解析的关联节点/文档 ID */
  relatedNodeIds?: string[]
  /** 轨迹节点的事件时间（如 startDate / pointDate），用于轨迹近一年判断 */
  eventDate?: string
  /** 召回候选池持久优先级标记，只决定候选轮次，不直接确认入选。 */
  recallPriorityMark?: 's' | 'a' | 'b' | 'c'
  /** 检索画像文本：只给规则与嵌入候选生成使用，不进入最终聊天提示词。 */
  retrievalProfileText?: string
  /** 底层召回加权：只影响候选生成与护栏保留，不等于必装提示词。 */
  baselineRecallBoost?: number
  /** 编译页单位分数：用户可在编译页调节，服务直入 / 展开基础分与角色锚定分。 */
  compileScore?: Pick<RecallCompilePageFields, 'scoreDirectBase' | 'scoreExpandBase' | 'scoreSelfAnchor' | 'scoreUserAnchor' | 'scoreOtherAnchor'>
  /** 安排激活信号：只由当前时间命中安排规则时生成，服务召回评分和 trace，不进入最终聊天提示词。 */
  scheduleActivation?: {
    active: boolean
    score: number
    reason: string
    priority: 'normal' | 'must'
    level: 'summary' | 'body'
    currentDateText?: string
    timeWindowText?: string
  }
  /** 所属角色 ID（角色私有卡填写） */
  ownerCharacterId?: string
  /** 被观察对象 ID，例如用户或其他角色。 */
  subjectId?: string
  /** 被观察对象类型，用于区分用户和其他角色。 */
  subjectType?: 'user' | 'character'
  /** 是否为合法召回对象 */
  isRecallable: boolean
  /** 召回结构视图运行时节点 ID，只读追踪用，不写回文档或角色真值。 */
  structureRuntimeId?: string
  /** 召回结构视图父级运行时节点 ID，只读追踪用。 */
  parentRuntimeId?: string
  /** 召回结构层级深度，只表示离根距离，不表示固定簇枝桠层级。 */
  structureDepth?: number
  /** 召回结构子项数量，用于后续展开预算和 trace。 */
  structureChildCount?: number
  /** 召回结构来源：fieldTree 表示字段树，pathTree 表示旧路径兼容，none 表示无结构视图。 */
  treeSource?: 'fieldTree' | 'pathTree' | 'none'
  /** 召回证据短码，只进入 trace，不进入最终聊天提示词。 */
  evidenceReasons?: string[]
  /** 召回正文覆盖：只服务本次候选读取，不作为正式资料真值。 */
  bodyText?: string
}

export interface RecallStructureNode {
  runtimeId: string
  sourceId: string
  sourceDocumentId?: string
  parentRuntimeId?: string
  depth: number
  childCount: number
  childPreviewIds: string[]
  structureKind: 'root' | 'folder' | 'document' | 'character' | 'trace' | 'arrangement' | 'candidate'
  pathText: string
  title: string
  treeSource: 'fieldTree' | 'pathTree'
  evidenceReasons: string[]
}

export interface RecallStructureView {
  treeSource: 'fieldTree' | 'pathTree'
  generatedAt: string
  nodes: RecallStructureNode[]
}

export type RecallReadDecision = 'summary_only' | 'body_required' | 'body_if_budget' | 'skip_body'

export type RecallActivityStatus = 'idle' | 'running' | 'completed' | 'failed'
export type RecallActivityEventStatus = 'started' | 'completed' | 'failed'

export type RecallCandidateGenerationMode = 'parallel_merge' | 'rules_first' | 'embedding_first'
export type RecallConfirmedContentStrategy = 'summary_gate' | 'full_aware'
export type RecallIntentLevel = 'none' | 'weak' | 'strong'
export type RecallWorldDomain =
  | 'geography'
  | 'education'
  | 'rule_system'
  | 'settlement'
  | 'natural_risk'
  | 'energy_system'
  | 'social_structure'
  | 'travel_context'
export type RecallRoleDomain =
  | 'personal_event'
  | 'motivation'
  | 'profile'
  | 'relationship'
  | 'current_state'
  | 'object_detail'

export interface InputIntentSnapshot {
  intentTypes: string[]
  abstractionLevel: number
  temporalFocus: 'current' | 'past_event' | 'change' | 'none'
  relationFocus: 'none' | 'weak' | 'strong'
  worldIntentLevel?: RecallIntentLevel
  worldDomains?: RecallWorldDomain[]
  roleIntentLevel?: RecallIntentLevel
  roleDomains?: RecallRoleDomain[]
  mixedRoleWorldIntent?: boolean
  targetSubject?: string
  targetEvent?: string
  questionFocus?: string[]
  granularity?: 'specific_event' | 'topic' | 'profile' | 'relationship' | 'current_state' | 'unknown'
  primaryRecallNeeds?: string[]
  secondaryRecallNeeds?: string[]
  negativeRecallHints?: string[]
  expansionHint?: string
  recentContextCompression?: string
  currentInputCompression?: string
  intentExtensibility?: 'low' | 'medium' | 'high'
  intentExtensionReason?: string
  explicitTerms: string[]
  queryTextForEmbedding: string
  ruleWeightHints: string[]
}

export interface RecallCandidateScoreBreakdown {
  ruleMatchScore: number
  rawEmbeddingScore?: number
  embeddingIntentScore: number
  temporalRuleScore: number
  relationRuleScore: number
  structurePriorityScore: number
  baselineRecallBoost: number
  compileDirectBaseScore: number
  compileExpandBaseScore: number
  selfAnchorScore: number
  userAnchorScore: number
  otherAnchorScore: number
  runtimeUserAnchorScore: number
  runtimeOtherAnchorScore: number
  runtimeWorldEntityScore: number
  compileAnchorScore: number
  scheduleActivationScore?: number
  ruleInitialIncludeScore?: number
  ruleInitialExpandScore?: number
  agentIncludeDelta?: number
  agentExpandDelta?: number
  includeScore: number
  expandScore: number
  candidateBaseScore: number
}

export interface RecallCandidateJudgment {
  id: string
  includeDecision: 'confirm' | 'reject' | 'uncertain'
  expandDecision: 'expand' | 'no_expand' | 'uncertain'
  summaryQuality: 'enough' | 'generic' | 'missing_specific_fact'
  readNeed: 'summary_only' | 'full_content' | 'uncertain'
  evidenceReasonCodes: string[]
  includeScoreDelta?: number
  expandScoreDelta?: number
  legacyDirectDecision?: boolean
  confidence: number
}

export interface RecallTokenUsage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
  costText?: string
}

export interface RecallActivityUnitRef {
  id: string
  title: string
  /** 所属角色 ID，用于召回侧栏点击后定位到角色大脑卡片。 */
  ownerCharacterId?: string
  /** 本轮确认读取到的正文；没有读取正文时为空。 */
  contentText?: string
  /** 候选摘要，用于正文未读取时的预览兜底。 */
  summary?: string
  readDecision?: RecallReadDecision
  score?: number
}

export interface RecallActivityCandidateRef {
  id: string
  title: string
}

export interface RecallActivityMetrics {
  round?: number
  model?: string
  presetName?: string
  usage?: RecallTokenUsage
  usageTotal?: RecallTokenUsage
  callCount?: number
  directUnits?: RecallActivityUnitRef[]
  expandedUnits?: RecallActivityUnitRef[]
  confirmedUnits?: RecallActivityUnitRef[]
  frontierDebtBefore?: number
  frontierDebtAfter?: number
  unresolvedChildren?: number
  stopAllowed?: boolean
  cacheHits?: number
  cacheMisses?: number
}

export interface RecallActivityEvent {
  id: string
  runId: string
  stepKey: string
  stepLabel: string
  status: RecallActivityEventStatus
  parallelGroup?: string
  startedAt: string
  completedAt?: string
  durationMs?: number
  input?: unknown
  output?: unknown
  metrics?: RecallActivityMetrics
  error?: string
}

export type PublicRecallMilestoneStatus = 'started' | 'completed' | 'failed'

export interface PublicRecallMilestone {
  id: string
  title: string
  text: string
  status: PublicRecallMilestoneStatus
  sourceEventIds?: string[]
  relatedUnits?: RecallActivityUnitRef[]
  durationMs?: number
  modelLabel?: string
  displayDelayMs?: number
}

/** 单轮召回的追踪记录（用于可视化展示，后续 UI 层接入） */
export interface RecallRoundTrace {
  round: number
  inputCardTitles: string[]   // 本轮投递的候选卡标题
  confirmedTitles: string[]   // 本轮确认入选的卡片标题
  needMoreRounds?: boolean
  confidence?: number
  marginalGain?: number
  stopReason?: string
  readDecisions?: Record<string, RecallReadDecision>
}

/** 多轮召回流程最终结果 */
export interface RecallPipelineResult {
  compressedContext: string
  intentSnapshot?: InputIntentSnapshot
  confirmedIds: string[]
  readDecisions: Record<string, RecallReadDecision>
  roundsCompleted: number
  /** 各轮追踪记录，供可视化层消费 */
  rounds: RecallRoundTrace[]
  /** 召回结构来源，只进入 trace，不进入最终聊天提示词 */
  structureTreeSource?: 'fieldTree' | 'pathTree' | 'none'
  recallPriorityUpdates?: Record<string, 's' | 'a' | 'b' | 'c' | ''>
  activityEvents?: RecallActivityEvent[]
}

export interface CharacterBrainPathPrefix {
  characterId: string
  characterName: string
  groupChain: string[]
  displayPrefix: string
}
