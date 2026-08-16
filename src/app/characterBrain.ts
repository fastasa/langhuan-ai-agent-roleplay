import type { Character } from '../types'
import type {
  CharacterBrainCardFormField,
  CharacterBrainCompilePage,
  CharacterBrainLinkDraft,
  CharacterBrainLinkSuggestion,
  CharacterBrainCardModel,
  CharacterBrainCognitionNode,
  CharacterBrainCognitionNodeKind,
  CharacterBrainFieldKey,
  CharacterBrainPendingNodeSnapshot,
  CharacterBrainPendingReview,
  CharacterBrainPendingReviewCard,
  CharacterBrainNodeOffset,
  CharacterBrainTraceNode,
  CharacterBrainTraceInnerEntry,
  CharacterBrainTraceNodeKind,
  CharacterBrainTraceSummaryMode,
  CharacterBrainTraceStepUnit,
  CharacterBrainTrajectoryRange,
  CharacterBrainTrajectoryMeta,
  CharacterBrainNodeDensity,
  CharacterBrainNodeModel,
  CharacterBrainNodeSize
} from '../types/characterBrain'
import { normalizeUnitSemanticType } from './unitSemanticTypes'
import {
  buildTrajectoryCalendarRule,
  buildTrajectoryContextLabels,
  buildTrajectoryPointTitle,
  buildTrajectoryRangeTitle,
  inferTrajectoryNodeGranularity,
  normalizeTrajectoryCalendarConfig,
  parseTrajectoryDateText
} from './trajectoryCalendar'
import { normalizeCharacterReplyPipelineModeOverride } from './chatReplyPipelineMode'

type BuildOptions = {
  focusId?: string
  minDensity?: number
}

type SceneRelation = 'focus' | 'parent' | 'child' | 'context'

type PositionedNodeInput = Omit<CharacterBrainNodeModel, 'size' | 'density'> & {
  size: CharacterBrainNodeSize
  density: CharacterBrainNodeDensity
}

type RadialLayoutSpec = {
  id: string
  title: string
  fieldKey?: CharacterBrainFieldKey
  summary: (character: Character) => string
  preferredAngle: number
  deletable: boolean
  sourceDocumentId?: string
  sourceDisplayPath?: string
}

type PositionedRadialNodeSpec = RadialLayoutSpec & {
  x: number
  y: number
}

type RadialLayoutOptions = {
  centerX: number
  centerY: number
  parentX?: number
  parentY?: number
  radius: number
}

type CharacterDraftSource = Partial<Character> & {
  group?: string
  avatar?: string
  relationships?: unknown
  yearlySchedule?: unknown
  currentActivities?: unknown
  locations?: unknown
  schedule?: unknown
  nicknames?: unknown
  brainLinks?: unknown
  brain_links?: unknown
  brainDocuments?: unknown
  brain_documents?: unknown
  brainCognitionNodes?: unknown
  brain_cognition_nodes?: unknown
  brainTraceNodes?: unknown
  brain_trace_nodes?: unknown
  brainTrajectoryMeta?: unknown
  brain_trajectory_meta?: unknown
}

type CharacterPersistedChanges = Record<string, unknown>
type CharacterBrainLinkMap = Record<string, string[]>

/**
 * 单次角色快照内的只读索引。它只缓存解析结果，不参与写入，也不能跨角色变更复用。
 */
export type CharacterBrainReadContext = {
  cognitionNodes: CharacterBrainCognitionNode[]
  traceNodes: CharacterBrainTraceNode[]
  cognitionById: Map<string, CharacterBrainCognitionNode>
  traceById: Map<string, CharacterBrainTraceNode>
  childrenByParentId: Map<string, string[]>
  childCountByParentId: Map<string, number>
  documents: Record<string, string>
  bidirectionalLinks: CharacterBrainLinkMap
}

const ROOT_ID = 'brain:root'
const SEE_ME_ID = 'brain:see_me'
const RELATIONSHIP_ID = 'brain:relationship'
const TRAJECTORY_ID = 'brain:trajectory'
const COGNITION_ID = 'brain:cognition'
const COGNITION_NODE_ID_PREFIX = 'brain:cognition:node:'
const TRACE_ROOT_NODE_ID = TRAJECTORY_ID
const TRACE_NODE_ID_PREFIX = 'brain:trajectory:node:'
const MAX_TRAJECTORY_OFFSET_ABS = 6000
const AVATAR_ID = 'brain:avatar'
const BASIC_INFO_ID = 'brain:basic_info'
const PRESET_ID = 'brain:preset'
const NICKNAMES_ID = 'brain:nicknames'
const DETAIL_INFO_ID = 'brain:detail_info'
const GOAL_VALUE_ID = 'brain:goal_value'
const SYSTEM_INFO_ID = 'brain:system_info'
const BRAIN_SCENE_CHILD_DISTANCE = 240
const BRAIN_LINK_DISTANCE = BRAIN_SCENE_CHILD_DISTANCE * 1.18
const BRAIN_LINK_START_ANGLE = 22
const CORE_LABEL = '核心'
const SOUL_LABEL = '灵魂'
const TRACE_LABEL = '轨迹'
const BRAIN_COMPILE_DOCUMENT_PREFIX = '__brain_compile__:'
const CORE_RECALLABLE_FIELD_KEYS = new Set<CharacterBrainFieldKey>([
  'desc',
  'appearance',
  'speakingStyle',
  'outfit',
  'personality',
  'hobbies',
  'abilities',
  'experience',
  'worldview',
  'background'
])
const TRACE_FORM_KEYS = {
  timeLabel: 'trace.timeLabel',
  pointDate: 'trace.pointDate',
  ageLabel: 'trace.ageLabel',
  offsetDays: 'trace.offsetDays',
  stepUnit: 'trace.stepUnit',
  stepAmount: 'trace.stepAmount',
  summaryMode: 'trace.summaryMode',
  relatedEntityIds: 'trace.relatedEntityIds',
  tags: 'trace.tags',
  summary: 'trace.summary',
  content: 'trace.content'
} as const
const TRAJECTORY_META_FORM_KEYS = {
  birthDate: 'trajectory.birthDate',
  zeroNote: 'trajectory.zeroNote',
  calendarMonthDays: 'trajectory.calendarMonthDays',
  autoCompilePageEnabled: 'trajectory.autoCompilePageEnabled',
  content: 'trajectory.content'
} as const

const ROOT_ZONE_SPECS: RadialLayoutSpec[] = [
  {
    id: SEE_ME_ID,
    title: CORE_LABEL,
    summary: (character) => buildCoreSummary(character),
    preferredAngle: 210,
    deletable: false
  },
  {
    id: TRAJECTORY_ID,
    title: TRACE_LABEL,
    summary: () => '行动、阶段与地点变化的正式入口',
    preferredAngle: 330,
    deletable: false
  },
  {
    id: COGNITION_ID,
    title: SOUL_LABEL,
    summary: () => '角色如何理解自己、他人和世界的正式入口',
    preferredAngle: 90,
    deletable: false
  }
]

const SEE_ME_CHILDREN: RadialLayoutSpec[] = [
  createFieldSpec('brain:desc', '简介', 'desc', 345, true),
  createFieldSpec('brain:personality', '性格', 'personality', 25, true),
  {
    id: GOAL_VALUE_ID,
    title: '目标与价值',
    summary: (character) => readCharacterBrainDocument(character, GOAL_VALUE_ID).trim() || '还没有记录长期目标与价值',
    preferredAngle: 70,
    deletable: false
  },
  {
    id: DETAIL_INFO_ID,
    title: '详细信息',
    summary: (character) => buildDetailInfoSummary(character),
    preferredAngle: 150,
    deletable: false
  },
  {
    id: SYSTEM_INFO_ID,
    title: '系统信息',
    summary: (character) => buildSystemInfoSummary(character),
    preferredAngle: 250,
    deletable: false
  }
]

const BASIC_INFO_CHILDREN: RadialLayoutSpec[] = [
  createFieldSpec('brain:name', '姓名', 'name', 225),
  createFieldSpec('brain:gender', '性别', 'gender', 180),
  createFieldSpec('brain:age', '年龄', 'age', 315),
  createFieldSpec('brain:nicknames', '昵称', 'nicknames', 260)
]

const PRESET_CHILDREN: RadialLayoutSpec[] = [
  createFieldSpec('brain:default_preset', '默认预设', 'defaultPreset', 210),
  createFieldSpec('brain:default_model', '默认模型', 'defaultModel', 330)
]

const AVATAR_CHILDREN: RadialLayoutSpec[] = [
  createFieldSpec('brain:emoji', 'Emoji', 'emoji', 215, false),
  createFieldSpec('brain:avatar_path', '头像路径', 'avatarPath', 338, false)
]

const SYSTEM_INFO_CHILDREN: RadialLayoutSpec[] = [
  {
    id: AVATAR_ID,
    title: '头像',
    fieldKey: 'avatar',
    summary: (character) => {
      const avatarPath = readCharacterField(character, 'avatarPath')
      const emoji = readCharacterField(character, 'emoji') || '👤'
      if (avatarPath) return `当前头像路径：${avatarPath}`
      return `当前头像 Emoji：${emoji}`
    },
    preferredAngle: 210,
    deletable: false
  },
  {
    id: PRESET_ID,
    title: '预设',
    fieldKey: 'preset',
    summary: (character) => buildPresetSummary(character),
    preferredAngle: 330,
    deletable: false
  },
  createFieldSpec('brain:name', '姓名', 'name', 20),
  createFieldSpec('brain:gender', '性别', 'gender', 65),
  createFieldSpec('brain:age', '年龄', 'age', 110),
  createFieldSpec('brain:nicknames', '昵称', 'nicknames', 155)
]

const DETAIL_CHILDREN: RadialLayoutSpec[] = [
  createFieldSpec('brain:appearance', '外貌特征', 'appearance', 165, true),
  createFieldSpec('brain:speaking_style', '说话风格', 'speakingStyle', 135, true),
  createFieldSpec('brain:outfit', '穿着', 'outfit', 95, true),
  createFieldSpec('brain:hobbies', '爱好', 'hobbies', 195, true),
  createFieldSpec('brain:abilities', '能力', 'abilities', 20, true),
  createFieldSpec('brain:experience', '经历', 'experience', 250, true),
  createFieldSpec('brain:worldview', '世界观', 'worldview', 305, true),
  createFieldSpec('brain:background', '背景故事', 'background', 345, true)
]

const SCENE_CHILDREN: Record<string, RadialLayoutSpec[] | ((character: Character) => RadialLayoutSpec[])> = {
  [ROOT_ID]: ROOT_ZONE_SPECS,
  [SEE_ME_ID]: SEE_ME_CHILDREN,
  [BASIC_INFO_ID]: BASIC_INFO_CHILDREN,
  [SYSTEM_INFO_ID]: SYSTEM_INFO_CHILDREN,
  [AVATAR_ID]: AVATAR_CHILDREN,
  [PRESET_ID]: PRESET_CHILDREN,
  [NICKNAMES_ID]: (character) => buildNicknameSpecs(character),
  [DETAIL_INFO_ID]: DETAIL_CHILDREN,
  [COGNITION_ID]: (character) => buildCognitionSpecs(character, COGNITION_ID)
}

const NODE_PARENT_ID: Record<string, string> = buildNodeParentMap()
const STATIC_NODE_SPECS = [
  ...ROOT_ZONE_SPECS,
  ...SEE_ME_CHILDREN,
  ...SYSTEM_INFO_CHILDREN,
  ...AVATAR_CHILDREN,
  ...PRESET_CHILDREN,
  ...DETAIL_CHILDREN
]

export function getCharacterBrainRootId() {
  return ROOT_ID
}

export function buildCharacterBrainNodes(character: Character, options: BuildOptions = {}): CharacterBrainNodeModel[] {
  const focusId = resolveValidFocusId(character, options.focusId)
  const minDensity = normalizeMinDensity(options.minDensity)
  const nodes = focusId === ROOT_ID
    ? buildRootScene(character)
    : buildFocusedScene(character, focusId)
  return nodes.filter((node) => node.density >= minDensity)
}

export function buildCharacterBrainLinkSuggestions(character: Character): CharacterBrainLinkSuggestion[] {
  const suggestions = collectAllNodeSpecs(character)
  const cognitionParentMap = buildCognitionParentMap(character)
  return suggestions.map((spec) => {
    const parentId = NODE_PARENT_ID[spec.id]
      || cognitionParentMap[spec.id]
      || (spec.id.startsWith('brain:nickname:item:') ? NICKNAMES_ID : undefined)
    return {
      id: spec.id,
      title: spec.id === ROOT_ID ? character.name || '角色' : spec.title,
      kind: resolveNodeKind(spec.id, Boolean(spec.fieldKey), spec.deletable),
      parentId,
      parentTitle: parentId ? resolveNodeTitle(character, parentId) : undefined
    }
  })
}

export function buildCharacterBrainLinkedNodeTargets(character: Character, sourceId: string): CharacterBrainNodeModel[] {
  const normalizedSourceId = String(sourceId || '').trim()
  if (!normalizedSourceId) return []
  const targetIds = readBidirectionalCharacterBrainLinks(character)[normalizedSourceId] || []
  return targetIds
    .map((targetId) => getCharacterBrainNodeById(character, targetId))
    .filter(Boolean)
    .map((node) => ({
      ...node!,
      size: 2 as CharacterBrainNodeSize,
      density: 4 as CharacterBrainNodeDensity,
      parentId: normalizedSourceId,
      edgeKind: 'link' as const
    }))
}

export function getCharacterBrainNodeById(character: Character, nodeId: string): CharacterBrainNodeModel | null {
  const normalizedId = String(nodeId || '').trim()
  if (!normalizedId) return null
  const traceNode = readCharacterBrainTraceNodes(character).find((item) => item.id === normalizedId)
  if (traceNode) {
    return createNode({
      id: traceNode.id,
      title: traceNode.title,
      kind: resolveTraceGraphNodeKind(character, traceNode),
      summary: buildTraceNodeSummary(traceNode),
      size: 2,
      density: 5,
      x: 0,
      y: 0,
      parentId: traceNode.parentId || TRACE_ROOT_NODE_ID,
      deletable: true
    })
  }
  const cognitionNode = readCharacterBrainCognitionNodes(character).find((item) => item.id === normalizedId)
  if (cognitionNode) {
    return createNode({
      id: cognitionNode.id,
      title: cognitionNode.title,
      kind: resolveCognitionGraphNodeKind(character, cognitionNode),
      summary: cognitionNode.summary,
      size: 2,
      density: 5,
      x: 0,
      y: 0,
      parentId: cognitionNode.parentId || COGNITION_ID,
      deletable: true,
      sourceDocumentId: cognitionNode.sourceDocumentId,
      sourceDisplayPath: cognitionNode.sourceDisplayPath
    })
  }

  const dynamicSpecs = buildNicknameSpecs(character)
  const spec = [...STATIC_NODE_SPECS, ...dynamicSpecs].find((item) => item.id === normalizedId)
  if (spec) {
    const parentId = NODE_PARENT_ID[normalizedId]
    return createNode({
      id: spec.id,
      title: spec.title,
      kind: resolveNodeKind(spec.id, Boolean(spec.fieldKey), spec.deletable),
      summary: spec.summary(character),
      size: normalizedId === ROOT_ID ? 3 : normalizedId === SEE_ME_ID ? 3 : 2,
      density: 5,
      x: 0,
      y: 0,
      parentId,
      deletable: spec.deletable,
      fieldKey: spec.fieldKey
    })
  }

  if (normalizedId === ROOT_ID) {
    return createNode({
      id: ROOT_ID,
      title: character.name || '角色',
      kind: 'root',
      summary: String(character.desc || '').trim() || '还没有角色简介',
      size: 3,
      density: 5,
      x: 0,
      y: 0,
      deletable: false
    })
  }

  return null
}

export function buildCharacterBrainNodePath(character: Character, nodeId: string): string {
  const normalizedId = String(nodeId || '').trim()
  if (!normalizedId) return '/角色大脑'
  const chain = collectNodeChain(character, normalizedId)
  if (!chain.length) return `/角色大脑/${character.name || '未命名角色'}`
  const titles = chain
    .filter((id) => id !== ROOT_ID)
    .map((id) => resolveNodeTitle(character, id))
    .filter(Boolean)
  return `/角色大脑/${character.name || '未命名角色'}${titles.length ? `/${titles.join('/')}` : ''}`
}

export function buildCharacterBrainCognitionNodesChange(nodes: CharacterBrainCognitionNode[]): CharacterPersistedChanges {
  const normalizedNodes = normalizeCognitionNodeList(nodes)
  return {
    __allowBrainClear: normalizedNodes.length === 0,
    brainCognitionNodes: normalizedNodes,
    brain_cognition_nodes: JSON.stringify(normalizedNodes)
  }
}

export function buildCharacterBrainTraceNodesChange(nodes: CharacterBrainTraceNode[]): CharacterPersistedChanges {
  const normalizedNodes = normalizeTraceNodeList(nodes)
  return {
    __allowBrainClear: normalizedNodes.length === 0,
    brainTraceNodes: normalizedNodes,
    brain_trace_nodes: JSON.stringify(normalizedNodes)
  }
}

export function readCharacterBrainTrajectoryMeta(character: Character | CharacterDraftSource): CharacterBrainTrajectoryMeta {
  const raw = character.brainTrajectoryMeta ?? character.brain_trajectory_meta
  const parsed = typeof raw === 'string'
    ? parseJsonRecord(raw)
    : raw && typeof raw === 'object' && !Array.isArray(raw)
      ? raw as unknown as Record<string, unknown>
      : {}
  const birthDate = normalizeTraceDateText(String(parsed.birthDate ?? parsed.birth_date ?? '').trim())
  const legacyCoverageEndDate = normalizeTraceDateText(String(parsed.coverageEndDate ?? parsed.coverage_end_date ?? '').trim()) || undefined
  const legacyCoverageEndOffsetDays = normalizeNonNegativeInteger(parsed.coverageEndOffsetDays ?? parsed.coverage_end_offset_days, 0) || undefined
  const coverageRange = normalizeTrajectoryRange(
    parsed.coverageRange ?? parsed.coverage_range,
    birthDate,
    legacyCoverageEndDate,
    legacyCoverageEndOffsetDays
  )
  return {
    birthDate,
    zeroNote: String(parsed.zeroNote ?? parsed.zero_note ?? '').trim(),
    calendarId: String(parsed.calendarId ?? parsed.calendar_id ?? 'gregorian').trim() || 'gregorian',
    calendarConfig: normalizeTrajectoryCalendarConfig(parsed.calendarConfig ?? parsed.calendar_config),
    autoCompilePageEnabled: Boolean(parsed.autoCompilePageEnabled ?? parsed.auto_compile_page_enabled ?? false),
    version: Math.max(2, normalizeNonNegativeInteger(parsed.version, 2)),
    ...(coverageRange ? { coverageRange } : {}),
    coverageEndDate: coverageRange?.endDate || legacyCoverageEndDate,
    coverageEndOffsetDays: coverageRange?.endOffsetDays || legacyCoverageEndOffsetDays,
    pendingSoulTraceNodeIds: normalizeStringList(parsed.pendingSoulTraceNodeIds ?? parsed.pending_soul_trace_node_ids),
    lastSoulWriteBackAt: String(parsed.lastSoulWriteBackAt ?? parsed.last_soul_write_back_at ?? '').trim() || undefined,
    viewOffsets: normalizeTrajectoryViewOffsets(parsed.viewOffsets ?? parsed.view_offsets)
  }
}

export function buildCharacterBrainTrajectoryMetaChange(meta: CharacterBrainTrajectoryMeta): CharacterPersistedChanges {
  const viewOffsets = normalizeTrajectoryViewOffsets(meta.viewOffsets)
  const birthDate = normalizeTraceDateText(String(meta.birthDate || '').trim())
  const coverageRange = normalizeTrajectoryRange(
    meta.coverageRange,
    birthDate,
    meta.coverageEndDate,
    meta.coverageEndOffsetDays
  )
  const normalized = {
    birthDate,
    zeroNote: String(meta.zeroNote || '').trim(),
    calendarId: String(meta.calendarId || 'gregorian').trim() || 'gregorian',
    calendarConfig: normalizeTrajectoryCalendarConfig(meta.calendarConfig),
    autoCompilePageEnabled: Boolean(meta.autoCompilePageEnabled),
    version: Math.max(2, normalizeNonNegativeInteger(meta.version, 2)),
    ...(coverageRange ? { coverageRange } : {}),
    ...(coverageRange?.endDate ? { coverageEndDate: coverageRange.endDate } : {}),
    ...(coverageRange && coverageRange.endOffsetDays > 0
      ? { coverageEndOffsetDays: coverageRange.endOffsetDays }
      : {}),
    ...(normalizeStringList(meta.pendingSoulTraceNodeIds).length
      ? { pendingSoulTraceNodeIds: normalizeStringList(meta.pendingSoulTraceNodeIds) }
      : {}),
    ...(String(meta.lastSoulWriteBackAt || '').trim()
      ? { lastSoulWriteBackAt: String(meta.lastSoulWriteBackAt || '').trim() }
      : {}),
    ...(Object.keys(viewOffsets).length ? { viewOffsets } : {})
  }
  return {
    brainTrajectoryMeta: normalized,
    brain_trajectory_meta: JSON.stringify(normalized)
  }
}

export function buildTrajectoryRootContent(character: Character | CharacterDraftSource): string {
  const meta = readCharacterBrainTrajectoryMeta(character)
  const birthDate = parseTrajectoryDateText(meta.birthDate)
  const calendar = buildTrajectoryCalendarRule(meta.calendarId, meta.calendarConfig)
  const isRimWorldCalendar = meta.calendarId === 'rimworld'
  const displayYear = birthDate?.year || 2001
  const monthRows = Array.from({ length: calendar.monthsInYear(displayYear) }, (_, index) => {
    const month = index + 1
    return `| ${isRimWorldCalendar ? `第${month}季` : `${month}月`} | ${calendar.daysInMonth(displayYear, month)}天 |`
  })
  return [
    '# 轨迹',
    '',
    meta.birthDate ? `出生日期：${meta.birthDate}${isRimWorldCalendar ? '（环世界历）' : ''}` : '先填写角色出生日期，才能创建第一个日桠。',
    meta.birthDate ? `首个日桠：${meta.birthDate}` : '',
    meta.zeroNote ? `副标题：${meta.zeroNote}` : '',
    `日历：${meta.calendarId || 'gregorian'}`,
    '',
    `| ${isRimWorldCalendar ? '季序' : '月'} | 天数 |`,
    '| --- | --- |',
    ...monthRows,
    '',
    isRimWorldCalendar
      ? '环世界历每年分为四季，每季15天；出生日期由 Pawn 的时间年龄与当前游戏日期自动推算。'
      : '默认公历会按具体年份判定每月天数；填写自定义日历后，新建日桠按这里的月份上限推进。'
  ].filter((line) => line !== '').join('\n')
}

function formatTrajectoryCalendarMonthDays(meta: CharacterBrainTrajectoryMeta): string {
  const config = normalizeTrajectoryCalendarConfig(meta.calendarConfig)
  return config.monthDays?.join(',') || ''
}

function parseTrajectoryCalendarMonthDaysDraft(raw: unknown, previousConfig: unknown) {
  const text = String(raw ?? '').trim()
  if (!text) return {}
  const values = text
    .split(/[\s,，;；/]+/u)
    .map((item) => Math.floor(Number(item)))
    .filter((value) => Number.isFinite(value))
    .filter((value) => value > 0)
  if (!values.length) return {}
  return values.length === 12
    ? { monthDays: values }
    : normalizeTrajectoryCalendarConfig(previousConfig)
}

function normalizeBooleanDraft(raw: unknown): boolean {
  if (typeof raw === 'boolean') return raw
  if (typeof raw === 'number') return raw !== 0
  const text = String(raw ?? '').trim().toLowerCase()
  return text === 'true' || text === '1' || text === 'yes' || text === 'on'
}

export function buildCharacterBrainCompileDocumentKey(nodeId: string) {
  return `${BRAIN_COMPILE_DOCUMENT_PREFIX}${String(nodeId || '').trim()}`
}

function normalizeStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || '').trim()).filter(Boolean)
  }
  if (typeof value === 'string') {
    return value
      .split(/[\n,，]+/u)
      .map((item) => item.trim())
      .filter(Boolean)
  }
  return []
}

function normalizeCompileScore(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return undefined
  return Math.max(0, Math.min(100, Math.round(parsed)))
}

function normalizeRecallPriorityMark(value: unknown): CharacterBrainCompilePage['recallPriorityMark'] {
  const text = String(value || '').trim().toLowerCase()
  return text === 's' || text === 'a' || text === 'b' || text === 'c' ? text : undefined
}

function normalizeCharacterBrainCompilePage(
  raw: unknown,
  fallback: Partial<CharacterBrainCompilePage> & { summary: string; tags: string[]; relationHints: string[]; semanticType?: CharacterBrainCompilePage['semanticType']; updatedAt?: string }
): CharacterBrainCompilePage {
  const record = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {}
  const tags = normalizeStringList(record.tags)
  const relationHints = normalizeStringList(record.relationHints ?? record.relation_hints)
  return {
    summary: String(record.summary ?? fallback.summary ?? '').trim(),
    tags: tags.length ? tags : fallback.tags,
    relationHints: relationHints.length ? relationHints : fallback.relationHints,
    scoreDirectBase: normalizeCompileScore(record.scoreDirectBase ?? record.score_direct_base ?? fallback.scoreDirectBase),
    scoreExpandBase: normalizeCompileScore(record.scoreExpandBase ?? record.score_expand_base ?? fallback.scoreExpandBase),
    scoreSelfAnchor: normalizeCompileScore(record.scoreSelfAnchor ?? record.score_self_anchor ?? fallback.scoreSelfAnchor),
    scoreUserAnchor: normalizeCompileScore(record.scoreUserAnchor ?? record.score_user_anchor ?? fallback.scoreUserAnchor),
    scoreOtherAnchor: normalizeCompileScore(record.scoreOtherAnchor ?? record.score_other_anchor ?? fallback.scoreOtherAnchor),
    semanticType: normalizeUnitSemanticType(record.semanticType ?? record.semantic_type),
    recallPriorityMark: normalizeRecallPriorityMark(record.recallPriorityMark ?? record.recall_priority_mark ?? fallback.recallPriorityMark),
    recallPriorityUpdatedAt: String(record.recallPriorityUpdatedAt ?? record.recall_priority_updated_at ?? fallback.recallPriorityUpdatedAt ?? '').trim() || undefined,
    lastRecallConfirmedAt: String(record.lastRecallConfirmedAt ?? record.last_recall_confirmed_at ?? fallback.lastRecallConfirmedAt ?? '').trim() || undefined,
    updatedAt: String(record.updatedAt ?? record.updated_at ?? fallback.updatedAt ?? new Date().toISOString()).trim() || new Date().toISOString()
  }
}

function parseCharacterBrainCompilePageText(
  raw: string,
  fallback: Partial<CharacterBrainCompilePage> & { summary: string; tags: string[]; relationHints: string[]; updatedAt?: string }
): CharacterBrainCompilePage | null {
  const text = String(raw || '').trim()
  if (!text) return null
  try {
    return normalizeCharacterBrainCompilePage(JSON.parse(text), fallback)
  } catch {
    return null
  }
}

function isCoreRecallableFieldKey(fieldKey?: CharacterBrainFieldKey | null) {
  return fieldKey ? CORE_RECALLABLE_FIELD_KEYS.has(fieldKey) : false
}

function resolveReadContextNodeTitle(character: Character, nodeId: string, context?: CharacterBrainReadContext) {
  const id = String(nodeId || '').trim()
  if (context) {
    const dynamic = context.traceById.get(id) || context.cognitionById.get(id)
    if (dynamic?.title) return dynamic.title
  }
  return resolveNodeTitle(character, id)
}

function buildCharacterBrainRelationHints(character: Character, nodeId: string, context?: CharacterBrainReadContext): string[] {
  const targetIds = (context?.bidirectionalLinks || readBidirectionalCharacterBrainLinks(character))[String(nodeId || '').trim()] || []
  return targetIds
    .map((targetId) => {
      const targetTitle = resolveReadContextNodeTitle(character, targetId, context)
      return targetTitle ? `[[${targetTitle}]]` : ''
    })
    .filter(Boolean)
}

function buildDefaultCoreCompileScores(nodeId: string): Partial<CharacterBrainCompilePage> {
  const highSelf = {
    scoreDirectBase: 0,
    scoreExpandBase: 0,
    scoreSelfAnchor: 0,
    scoreUserAnchor: 0,
    scoreOtherAnchor: 0
  }
  const standardSelf = {
    scoreDirectBase: 0,
    scoreExpandBase: 0,
    scoreSelfAnchor: 0,
    scoreUserAnchor: 0,
    scoreOtherAnchor: 0
  }
  if (nodeId === DETAIL_INFO_ID || nodeId === GOAL_VALUE_ID || nodeId === 'brain:desc' || nodeId === 'brain:speaking_style' || nodeId === 'brain:personality') {
    return highSelf
  }
  if (isCoreRecallableFieldKey(resolveFieldKeyByNodeId(nodeId))) {
    return standardSelf
  }
  return {}
}

function buildCoreRecallTags(character: Character, nodeId: string): string[] {
  const fieldKey = resolveFieldKeyByNodeId(nodeId)
  const title = resolveNodeTitle(character, nodeId)
  if (nodeId === DETAIL_INFO_ID) return ['核心', '详细信息']
  if (nodeId === GOAL_VALUE_ID) return ['核心', '目标与价值']
  if (nodeId === SYSTEM_INFO_ID) return ['核心', '系统信息']
  if (fieldKey === 'desc') return ['核心', '简介']
  return Array.from(new Set(['核心', title])).filter(Boolean)
}

function buildCharacterBrainCompileFallback(character: Character, nodeId: string, context?: CharacterBrainReadContext): CharacterBrainCompilePage | null {
  const traceNode = context
    ? context.traceById.get(nodeId)
    : readCharacterBrainTraceNodes(character).find((item) => item.id === nodeId)
  if (traceNode) {
    return {
      summary: traceNode.summary || buildTraceNodeSummary(traceNode),
      tags: [...traceNode.tags],
      relationHints: buildCharacterBrainRelationHints(character, nodeId, context),
      updatedAt: traceNode.updatedAt || traceNode.createdAt || new Date().toISOString()
    }
  }

  const cognitionNode = context
    ? context.cognitionById.get(nodeId)
    : readCharacterBrainCognitionNodes(character).find((item) => item.id === nodeId)
  if (cognitionNode) {
    if (cognitionNode.compilePage) return cognitionNode.compilePage
    const tags = cognitionNode.kind === 'group'
        ? ['灵魂', '分组']
        : ['灵魂', '理解']
    return {
      summary: cognitionNode.summary || buildCognitionKindSummary(cognitionNode.kind),
      tags,
      relationHints: buildCharacterBrainRelationHints(character, nodeId, context),
      updatedAt: cognitionNode.updatedAt || cognitionNode.createdAt || new Date().toISOString()
    }
  }

  if (nodeId === BASIC_INFO_ID) {
    return {
      summary: buildBasicInfoSummary(character),
      tags: buildCoreRecallTags(character, nodeId),
      relationHints: buildCharacterBrainRelationHints(character, nodeId, context),
      ...buildDefaultCoreCompileScores(nodeId),
      updatedAt: new Date().toISOString()
    }
  }

  if (nodeId === DETAIL_INFO_ID) {
    return {
      summary: buildDetailInfoSummary(character),
      tags: buildCoreRecallTags(character, nodeId),
      relationHints: buildCharacterBrainRelationHints(character, nodeId, context),
      ...buildDefaultCoreCompileScores(nodeId),
      updatedAt: new Date().toISOString()
    }
  }

  const fieldKey = resolveFieldKeyByNodeId(nodeId)
  if (fieldKey && isCoreRecallableFieldKey(fieldKey)) {
    return {
      summary: buildFieldSummary(character, fieldKey),
      tags: buildCoreRecallTags(character, nodeId),
      relationHints: buildCharacterBrainRelationHints(character, nodeId, context),
      ...buildDefaultCoreCompileScores(nodeId),
      updatedAt: new Date().toISOString()
    }
  }

  return null
}

export function isCharacterBrainRecallableNode(character: Character, nodeId: string, context?: CharacterBrainReadContext): boolean {
  const id = String(nodeId || '').trim()
  if (!id) return false
  if (context ? context.traceById.has(id) : readCharacterBrainTraceNodes(character).some((item) => item.id === id)) return true
  if (context ? context.cognitionById.has(id) : readCharacterBrainCognitionNodes(character).some((item) => item.id === id)) return true
  if (id === BASIC_INFO_ID || id === DETAIL_INFO_ID) return true
  return isCoreRecallableFieldKey(resolveFieldKeyByNodeId(id))
}

export function readCharacterBrainCompilePage(
  character: Character | CharacterDraftSource,
  nodeId: string,
  context?: CharacterBrainReadContext
): CharacterBrainCompilePage | null {
  const normalizedId = String(nodeId || '').trim()
  if (!normalizedId || !isCharacterBrainRecallableNode(character as Character, normalizedId, context)) return null
  const fallback = buildCharacterBrainCompileFallback(character as Character, normalizedId, context)
  if (!fallback) return null
  const raw = (context?.documents || readCharacterBrainDocuments(character))[buildCharacterBrainCompileDocumentKey(normalizedId)]
  return typeof raw === 'string'
    ? parseCharacterBrainCompilePageText(raw, fallback) || fallback
    : fallback
}

export function buildCharacterBrainCompilePageChange(
  character: Character,
  nodeId: string,
  page: Partial<CharacterBrainCompilePage>
): CharacterPersistedChanges {
  const fallback = buildCharacterBrainCompileFallback(character, nodeId)
  if (!fallback) return {}
  const nextPage = normalizeCharacterBrainCompilePage(page, fallback)
  const nextDocuments = {
    ...readCharacterBrainDocuments(character),
    [buildCharacterBrainCompileDocumentKey(nodeId)]: JSON.stringify(nextPage)
  }
  return {
    brainDocuments: nextDocuments,
    brain_documents: JSON.stringify(nextDocuments)
  }
}

function buildCharacterBrainCardCompileProps(character: Character, nodeId: string, context?: CharacterBrainReadContext) {
  const compilePage = readCharacterBrainCompilePage(character, nodeId, context)
  if (!compilePage) return {}
  return {
    compilePage,
    compilePageEditable: true,
    compileRelationHintsEditable: false,
    compileRelationHint: '关系提示跟随下方关联编辑区，不在这里单独维护。'
  }
}

function applyCompileDraftChanges(
  character: Character,
  nodeId: string,
  draft: Record<string, unknown>,
  changes: CharacterPersistedChanges
) {
  if (!('compile.summary' in draft)
    && !('compile.tags' in draft)
    && !('compile.relationHints' in draft)
    && !('compile.scoreDirectBase' in draft)
    && !('compile.scoreExpandBase' in draft)
    && !('compile.scoreSelfAnchor' in draft)
    && !('compile.scoreUserAnchor' in draft)
    && !('compile.scoreOtherAnchor' in draft)) {
    return changes
  }
  const fallback = buildCharacterBrainCompileFallback(character, nodeId)
  if (!fallback) return changes
  const nextPage = normalizeCharacterBrainCompilePage({
    summary: String(draft['compile.summary'] ?? '').trim(),
    tags: normalizeStringList(draft['compile.tags']),
    relationHints: normalizeStringList(draft['compile.relationHints']),
    scoreDirectBase: draft['compile.scoreDirectBase'],
    scoreExpandBase: draft['compile.scoreExpandBase'],
    scoreSelfAnchor: draft['compile.scoreSelfAnchor'],
    scoreUserAnchor: draft['compile.scoreUserAnchor'],
    scoreOtherAnchor: draft['compile.scoreOtherAnchor'],
    semanticType: draft['compile.semanticType']
  }, fallback)
  const baseDocuments = changes.brainDocuments && typeof changes.brainDocuments === 'object' && !Array.isArray(changes.brainDocuments)
    ? changes.brainDocuments as Record<string, string>
    : readCharacterBrainDocuments(character)
  const nextDocuments = {
    ...baseDocuments,
    [buildCharacterBrainCompileDocumentKey(nodeId)]: JSON.stringify(nextPage)
  }
  return {
    ...changes,
    brainDocuments: nextDocuments,
    brain_documents: JSON.stringify(nextDocuments)
  }
}

function getDraftCompilePage(
  character: Character,
  nodeId: string,
  draft: Record<string, unknown>
): CharacterBrainCompilePage {
  const fallback = buildCharacterBrainCompileFallback(character, nodeId) || {
    summary: '',
    tags: [],
    relationHints: [],
    updatedAt: new Date().toISOString()
  }
  return normalizeCharacterBrainCompilePage({
    summary: String(draft['compile.summary'] ?? fallback.summary ?? '').trim(),
    tags: normalizeStringList(draft['compile.tags'] ?? fallback.tags),
    relationHints: normalizeStringList(draft['compile.relationHints'] ?? fallback.relationHints),
    scoreDirectBase: draft['compile.scoreDirectBase'] ?? fallback.scoreDirectBase,
    scoreExpandBase: draft['compile.scoreExpandBase'] ?? fallback.scoreExpandBase,
    scoreSelfAnchor: draft['compile.scoreSelfAnchor'] ?? fallback.scoreSelfAnchor,
    scoreUserAnchor: draft['compile.scoreUserAnchor'] ?? fallback.scoreUserAnchor,
    scoreOtherAnchor: draft['compile.scoreOtherAnchor'] ?? fallback.scoreOtherAnchor,
    semanticType: draft['compile.semanticType'] ?? fallback.semanticType,
    updatedAt: new Date().toISOString()
  }, fallback)
}

function applyCognitionNodeDraft(
  character: Character,
  nodeId: string,
  draft: Record<string, unknown>
): CharacterPersistedChanges | null {
  const nodes = readCharacterBrainCognitionNodes(character)
  const target = nodes.find((node) => node.id === nodeId)
  if (!target) return null
  const draftSourceDocumentId = String(draft.sourceDocumentId ?? '').trim()

  const currentContent = target.content ?? readCharacterBrainDocument(character, nodeId)
  const nextContent = String(draft.documentContent ?? currentContent ?? '')
  const nextCompilePage = getDraftCompilePage(character, nodeId, draft)
  const hasSourceDocument = Boolean(target.sourceDocumentId || draftSourceDocumentId)
  const shouldCreateSourceSnapshot = target.kind === 'reference' || (target.kind === 'group' && hasSourceDocument && !target.content)
  const detachedAt = shouldCreateSourceSnapshot
    ? String(draft.sourceDetachedAt ?? '').trim() || new Date().toISOString()
    : target.sourceDetachedAt
  const nextNode: CharacterBrainCognitionNode = {
    ...target,
    title: String(draft.documentTitle ?? target.title ?? '').trim() || target.title,
    summary: nextCompilePage.summary || target.summary,
    kind: target.kind === 'reference' ? 'private' : target.kind,
    sourceDocumentId: target.sourceDocumentId || draftSourceDocumentId || undefined,
    content: nextContent,
    tags: [...nextCompilePage.tags],
    relationHints: [...nextCompilePage.relationHints],
    compilePage: nextCompilePage,
    sourceDetachedAt: detachedAt,
    sourceSnapshotTitle: shouldCreateSourceSnapshot
      ? String(draft.sourceSnapshotTitle ?? target.sourceSnapshotTitle ?? target.title ?? '').trim() || undefined
      : target.sourceSnapshotTitle,
    sourceSnapshotSummary: shouldCreateSourceSnapshot
      ? String(draft.sourceSnapshotSummary ?? target.sourceSnapshotSummary ?? target.summary ?? '').trim() || undefined
      : target.sourceSnapshotSummary,
    updatedAt: new Date().toISOString()
  }
  const nextNodes = nodes.map((node) => node.id === nodeId ? nextNode : node)
  const nextDocuments = {
    ...setCharacterBrainDocument(readCharacterBrainDocuments(character), nodeId, nextContent),
    [buildCharacterBrainCompileDocumentKey(nodeId)]: JSON.stringify(nextCompilePage)
  }
  const changes: CharacterPersistedChanges = {
    ...buildCharacterBrainCognitionNodesChange(nextNodes),
    brainDocuments: nextDocuments,
    brain_documents: JSON.stringify(nextDocuments)
  }
  if ('linkTargetIds' in draft) {
    const nextLinks = setCharacterBrainNodeLinks(
      readCharacterBrainLinks(character),
      nodeId,
      normalizeLinkIds(draft.linkTargetIds)
    )
    changes.brainLinks = nextLinks
    changes.brain_links = JSON.stringify(nextLinks)
  }
  return changes
}

export function buildCharacterBrainCard(character: Character, nodeId: string, context?: CharacterBrainReadContext): CharacterBrainCardModel | null {
  const id = String(nodeId || '').trim()
  if (!id) return null
  const compileProps = buildCharacterBrainCardCompileProps(character, id, context)

  if (id === ROOT_ID) {
    return {
      id: `card:${id}`,
      nodeId: id,
      title: character.name || '角色',
      content: buildDescContent(character),
      cardType: 'form',
      editable: true,
      formFields: buildCardFormFields(character, 'desc'),
      linkDraft: buildCharacterBrainLinkDraft(character, id),
      ...compileProps
    }
  }

  if (id === SEE_ME_ID) {
    return {
      id: `card:${id}`,
      nodeId: id,
      title: CORE_LABEL,
      content: [
        `# ${character.name || '未命名角色'}`,
        '',
        buildCoreSummary(character),
        '',
        '## 核心一级单位',
        '- 简介',
        '- 性格',
        '- 目标与价值',
        '- 详细信息',
        '- 系统信息'
      ].join('\n'),
      cardType: 'document',
      editable: false,
      linkDraft: buildCharacterBrainLinkDraft(character, id),
      ...compileProps
    }
  }

  if (id === GOAL_VALUE_ID) {
    return {
      id: `card:${id}`,
      nodeId: id,
      title: '目标与价值',
      content: readCharacterBrainDocument(character, id) || [
        '# 目标与价值',
        '',
        '还没有记录长期目标与价值。'
      ].join('\n'),
      cardType: 'document',
      editable: true,
      linkDraft: buildCharacterBrainLinkDraft(character, id),
      ...compileProps
    }
  }

  if (id === DETAIL_INFO_ID) {
    return {
      id: `card:${id}`,
      nodeId: id,
      title: '详细信息',
      content: [
        '# 详细信息',
        '',
        `外貌特征：${readCharacterField(character, 'appearance') || '未设置'}`,
        `说话风格：${readCharacterField(character, 'speakingStyle') || '未设置'}`,
        `穿着：${readCharacterField(character, 'outfit') || '未设置'}`,
        `爱好：${readCharacterField(character, 'hobbies') || '未设置'}`,
        `能力：${readCharacterField(character, 'abilities') || '未设置'}`,
        `经历：${readCharacterField(character, 'experience') || '未设置'}`,
        `世界观：${readCharacterField(character, 'worldview') || '未设置'}`,
        `背景故事：${readCharacterField(character, 'background') || '未设置'}`
      ].join('\n'),
      cardType: 'form',
      editable: true,
      formFields: buildCardFormFields(character, 'detailInfo'),
      linkDraft: buildCharacterBrainLinkDraft(character, id),
      ...compileProps
    }
  }

  if (id === SYSTEM_INFO_ID) {
    return {
      id: `card:${id}`,
      nodeId: id,
      title: '系统信息',
      content: [
        '# 系统信息',
        '',
        buildSystemInfoSummary(character),
        '',
        `头像：${readCharacterField(character, 'avatarPath') || readCharacterField(character, 'emoji') || '未设置'}`,
        buildPresetSummary(character)
      ].join('\n'),
      cardType: 'form',
      editable: true,
      formFields: buildSystemInfoFormFields(character),
      linkDraft: buildCharacterBrainLinkDraft(character, id),
      ...compileProps
    }
  }

  if (id === TRAJECTORY_ID) {
    const meta = readCharacterBrainTrajectoryMeta(character)
    return {
      id: `card:${id}`,
      nodeId: id,
      title: TRACE_LABEL,
      content: buildTrajectoryRootContent(character),
      cardType: 'form',
      editable: true,
      formFields: [
        {
          key: TRAJECTORY_META_FORM_KEYS.birthDate,
          label: '出生日期',
          type: 'text',
          placeholder: '例如 2004-05-02',
          value: meta.birthDate
        },
        {
          key: TRAJECTORY_META_FORM_KEYS.zeroNote,
          label: '零岁备注',
          type: 'textarea',
          placeholder: '写这个角色诞生时的副名字或简短说明',
          value: meta.zeroNote
        },
        {
          key: TRAJECTORY_META_FORM_KEYS.calendarMonthDays,
          label: '轨迹日历',
          type: 'calendarMonthDays',
          placeholder: '留空使用默认公历',
          value: formatTrajectoryCalendarMonthDays(meta)
        },
        {
          key: TRAJECTORY_META_FORM_KEYS.autoCompilePageEnabled,
          label: '自动生成编译页',
          type: 'checkbox',
          value: meta.autoCompilePageEnabled ? 'true' : ''
        }
      ],
      linkDraft: buildCharacterBrainLinkDraft(character, id),
      ...compileProps
    }
  }

  if (id === RELATIONSHIP_ID || id === COGNITION_ID) {
    const title = resolveNodeTitle(character, id)
    return {
      id: `card:${id}`,
      nodeId: id,
      title,
      content: readCharacterBrainDocument(character, id) || [
        `# ${title}`,
        '',
        '暂未记录内容。'
      ].join('\n'),
      cardType: 'document',
      editable: true,
      linkDraft: buildCharacterBrainLinkDraft(character, id),
      ...compileProps
    }
  }

  const innerTraceCard = buildTraceInnerEntryCard(character, id)
  if (innerTraceCard) return innerTraceCard

  const traceNode = readCharacterBrainTraceNodes(character).find((item) => item.id === id)
  if (traceNode) {
    return {
      id: `card:${id}`,
      nodeId: id,
      title: traceNode.title,
      content: [
        `# ${traceNode.title}`,
        '',
        `时间点：${traceNode.pointDate || traceNode.timeLabel || '未填写'}`,
        `标签：${traceNode.tags.join('、') || '未填写'}`,
        '',
        '## 简短摘要',
        traceNode.summary || '未填写',
        '',
        '## 正文',
        traceNode.content || '未填写'
      ].join('\n'),
      cardType: 'form',
      editable: true,
      formFields: buildTraceCardFormFields(traceNode),
      innerEntries: traceNode.innerEntries,
      linkDraft: buildCharacterBrainLinkDraft(character, id),
      ...compileProps,
      pendingReview: buildTracePendingReviewCard(traceNode)
    }
  }

  const cognitionNode = readCharacterBrainCognitionNodes(character).find((item) => item.id === id)
  if (cognitionNode) {
    return {
      id: `card:${id}`,
      nodeId: id,
      title: cognitionNode.title,
      content: cognitionNode.content || readCharacterBrainDocument(character, id) || buildCognitionNodeContent(cognitionNode),
      cardType: 'document',
      editable: true,
      linkDraft: buildCharacterBrainLinkDraft(character, id),
      ...compileProps,
      pendingReview: buildCognitionPendingReviewCard(cognitionNode, readCharacterBrainDocument(character, id))
    }
  }

  const fieldKey = resolveFieldKeyByNodeId(id)
  if (!fieldKey) return null
  return {
    id: `card:${id}`,
    nodeId: id,
    title: resolveNodeTitle(character, id),
    content: buildFieldContent(character, fieldKey, id),
    cardType: 'form',
    editable: isEditableFieldKey(fieldKey),
    formFields: buildCardFormFields(character, fieldKey, id),
    linkDraft: buildCharacterBrainLinkDraft(character, id),
    ...compileProps
  }
}

function buildTraceInnerEntryCard(character: Character, nodeId: string): CharacterBrainCardModel | null {
  const parsed = parseTraceInnerEntryNodeId(nodeId)
  if (!parsed) return null
  const traceNode = readCharacterBrainTraceNodes(character).find((item) => item.id === parsed.traceNodeId)
  const entry = traceNode?.innerEntries.find((item) => item.id === parsed.entryId)
  if (!traceNode || !entry) return null
  return {
    id: `card:${nodeId}`,
    nodeId,
    title: `${traceNode.title} / ${entry.displayTitle}`,
    content: [
      `# ${entry.displayTitle}`,
      '',
      `时间范围：${entry.endDate ? `${entry.startDate}-${entry.endDate}` : entry.startDate}`,
      '',
      '## 备注',
      entry.note || '未填写',
      '',
      '## 正文',
      entry.content || '未填写'
    ].join('\n'),
    cardType: 'form',
    editable: true,
    formFields: [
      {
        key: 'trace.inner.note',
        label: '备注',
        type: 'textarea',
        placeholder: '写这个内部时间条目的备注',
        value: entry.note
      },
      {
        key: 'trace.inner.content',
        label: '正文',
        type: 'textarea',
        placeholder: '写这个内部时间条目的正文',
        value: entry.content
      }
    ],
    linkDraft: {
      text: entry.linkIds
        .map((targetId) => {
          const target = getCharacterBrainNodeById(character, targetId)
          return target ? `[[${target.title}]]` : ''
        })
        .filter(Boolean)
        .join(' '),
      targetIds: [...entry.linkIds]
    }
  }
}

export function applyCharacterBrainCardDraft(_character: Character, nodeId: string, draft: string | Record<string, unknown>): CharacterPersistedChanges {
  const innerTraceId = parseTraceInnerEntryNodeId(nodeId)
  if (innerTraceId && draft && typeof draft === 'object' && !Array.isArray(draft)) {
    const nextTraceNodes = readCharacterBrainTraceNodes(_character).map((node) => {
      if (node.id !== innerTraceId.traceNodeId) return node
      return {
        ...node,
        innerEntries: node.innerEntries.map((entry) => {
          if (entry.id !== innerTraceId.entryId) return entry
          return {
            ...entry,
            note: String(draft['trace.inner.note'] ?? entry.note ?? '').trim(),
            content: String(draft['trace.inner.content'] ?? entry.content ?? '').trim(),
            linkIds: 'linkTargetIds' in draft ? normalizeLinkIds(draft.linkTargetIds) : entry.linkIds
          }
        })
      }
    })
    return applyCompileDraftChanges(_character, nodeId, draft, buildCharacterBrainTraceNodesChange(nextTraceNodes))
  }
  if (isTraceNodeId(nodeId) && draft && typeof draft === 'object' && !Array.isArray(draft)) {
    const nextTraceNodes = updateCharacterBrainTraceNode(readCharacterBrainTraceNodes(_character), nodeId, draft)
    return applyCompileDraftChanges(_character, nodeId, draft, buildCharacterBrainTraceNodesChange(nextTraceNodes))
  }
  if (draft && typeof draft === 'object' && !Array.isArray(draft)) {
    const cognitionChanges = applyCognitionNodeDraft(_character, nodeId, draft)
    if (cognitionChanges) return cognitionChanges
    if (nodeId === TRAJECTORY_ID) {
      const previousMeta = readCharacterBrainTrajectoryMeta(_character)
      const changes = buildCharacterBrainTrajectoryMetaChange({
        birthDate: normalizeTraceDateText(String(draft[TRAJECTORY_META_FORM_KEYS.birthDate] ?? previousMeta.birthDate ?? '').trim()),
        zeroNote: String(draft[TRAJECTORY_META_FORM_KEYS.zeroNote] ?? previousMeta.zeroNote ?? '').trim(),
        coverageRange: previousMeta.coverageRange,
        coverageEndDate: previousMeta.coverageEndDate,
        coverageEndOffsetDays: previousMeta.coverageEndOffsetDays,
        viewOffsets: previousMeta.viewOffsets,
        calendarId: previousMeta.calendarId,
        calendarConfig: parseTrajectoryCalendarMonthDaysDraft(
          draft[TRAJECTORY_META_FORM_KEYS.calendarMonthDays],
          previousMeta.calendarConfig
        ),
        autoCompilePageEnabled: normalizeBooleanDraft(draft[TRAJECTORY_META_FORM_KEYS.autoCompilePageEnabled]),
        version: previousMeta.version
      })
      if ('linkTargetIds' in draft) {
        const nextLinks = setCharacterBrainNodeLinks(
          readCharacterBrainLinks(_character),
          nodeId,
          normalizeLinkIds(draft.linkTargetIds)
        )
        changes.brainLinks = nextLinks
        changes.brain_links = JSON.stringify(nextLinks)
      }
      return applyCompileDraftChanges(_character, nodeId, draft, changes)
    }
    const changes = buildFieldDraftObjectChanges(resolveFieldKeyByNodeId(nodeId), draft)
    if ('documentContent' in draft) {
      const fieldKey = resolveFieldKeyByNodeId(nodeId)
      if (fieldKey) Object.assign(changes, buildSingleFieldChange(fieldKey, String(draft.documentContent ?? '')))
      const nextDocuments = setCharacterBrainDocument(
        readCharacterBrainDocuments(_character),
        nodeId,
        String(draft.documentContent ?? '')
      )
      changes.brainDocuments = nextDocuments
      changes.brain_documents = JSON.stringify(nextDocuments)
    }
    if ('linkTargetIds' in draft) {
      const nextLinks = setCharacterBrainNodeLinks(
        readCharacterBrainLinks(_character),
        nodeId,
        normalizeLinkIds(draft.linkTargetIds)
      )
      changes.brainLinks = nextLinks
      changes.brain_links = JSON.stringify(nextLinks)
    }
    return applyCompileDraftChanges(_character, nodeId, draft, changes)
  }
  const value = String(draft || '')
  switch (nodeId) {
    case ROOT_ID:
      return { desc: stripLeadingLabel(value, '简介') }
    case BASIC_INFO_ID:
      return parseBasicInfoDraft(value)
    case PRESET_ID:
      return parsePresetDraft(value)
    case AVATAR_ID:
      return parseAvatarDraft(value)
    case NICKNAMES_ID:
      return { nicknames: parseNicknamesDraft(value) }
    default:
      return buildFieldDraftChanges(resolveFieldKeyByNodeId(nodeId), value)
  }
}

export function buildCharacterPersistedChanges(source: CharacterDraftSource): CharacterPersistedChanges {
  const speakingStyle = readCharacterSourceField(source, 'speakingStyle')
  const defaultPreset = readCharacterSourceField(source, 'defaultPreset')
  const defaultModel = readCharacterSourceField(source, 'defaultModel')
  const roleTemperature = normalizeOptionalNumber((source as any).roleTemperature ?? (source as any).role_temperature)
  const roleMaxTokens = normalizeOptionalPositiveInteger((source as any).roleMaxTokens ?? (source as any).role_max_tokens)
  const roleThinking = normalizeRoleThinking((source as any).roleThinking ?? (source as any).role_thinking)
  const replyPipelineModeOverride = normalizeCharacterReplyPipelineModeOverride((source as any).replyPipelineModeOverride ?? (source as any).reply_pipeline_mode_override)
  const avatarPath = String(source.avatar ?? source.avatarPath ?? source.avatar_path ?? '').trim()
  const groupId = String(source.group ?? source.groupId ?? source.group_id ?? '').trim()

  return {
    name: readCharacterSourceField(source, 'name'),
    emoji: readCharacterSourceField(source, 'emoji'),
    gender: readCharacterSourceField(source, 'gender'),
    age: readCharacterSourceField(source, 'age'),
    affection: Number(source.affection ?? 50) || 0,
    groupId,
    group_id: groupId,
    desc: readCharacterSourceField(source, 'desc'),
    appearance: readCharacterSourceField(source, 'appearance'),
    speakingStyle,
    speaking_style: speakingStyle,
    outfit: readCharacterSourceField(source, 'outfit'),
    personality: readCharacterSourceField(source, 'personality'),
    hobbies: readCharacterSourceField(source, 'hobbies'),
    abilities: readCharacterSourceField(source, 'abilities'),
    experience: readCharacterSourceField(source, 'experience'),
    worldview: readCharacterSourceField(source, 'worldview'),
    background: readCharacterSourceField(source, 'background'),
    nicknames: normalizeNicknamesInput(source.nicknames),
    defaultPreset,
    default_preset: defaultPreset,
    defaultModel,
    default_model: defaultModel,
    roleTemperature: roleTemperature ?? '',
    role_temperature: roleTemperature ?? '',
    roleMaxTokens: roleMaxTokens ?? '',
    role_max_tokens: roleMaxTokens ?? '',
    roleThinking,
    role_thinking: roleThinking,
    replyPipelineModeOverride,
    reply_pipeline_mode_override: replyPipelineModeOverride,
    brainLinks: readCharacterBrainLinks(source as Character),
    brain_links: JSON.stringify(readCharacterBrainLinks(source as Character)),
    brainDocuments: readCharacterBrainDocuments(source as Character),
    brain_documents: JSON.stringify(readCharacterBrainDocuments(source as Character)),
    brainCognitionNodes: readCharacterBrainCognitionNodes(source as Character),
    brain_cognition_nodes: JSON.stringify(readCharacterBrainCognitionNodes(source as Character)),
    brainTraceNodes: readCharacterBrainTraceNodes(source as Character),
    brain_trace_nodes: JSON.stringify(readCharacterBrainTraceNodes(source as Character)),
    schedule: normalizeObjectLike(source.schedule, null),
    relationships: normalizeObjectLike(source.relationships, {}),
    yearlySchedule: normalizeArrayLike(source.yearlySchedule),
    currentActivities: normalizeArrayLike(source.currentActivities),
    locations: normalizeArrayLike(source.locations),
    avatar: avatarPath,
    avatarPath
  }
}

function normalizeOptionalNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined
  const next = Number(value)
  return Number.isFinite(next) ? next : undefined
}

function normalizeOptionalPositiveInteger(value: unknown): number | undefined {
  const next = normalizeOptionalNumber(value)
  return next === undefined || next <= 0 ? undefined : Math.trunc(next)
}

function normalizeRoleThinking(value: unknown): '' | 'enabled' | 'disabled' {
  return value === 'enabled' || value === 'disabled' ? value : ''
}

function buildRootScene(character: Character): CharacterBrainNodeModel[] {
  const root = createNode({
    id: ROOT_ID,
    title: character.name || '角色',
    kind: 'root',
    summary: String(character.desc || '').trim() || '还没有角色简介',
    size: 3,
    density: 5,
    x: 0,
    y: 0,
    deletable: false
  })
  const zones = layoutRadialSpecs(ROOT_ZONE_SPECS, character, {
    centerX: 0,
    centerY: 0,
    radius: BRAIN_SCENE_CHILD_DISTANCE
  })
  const nodes = [
    root,
    ...zones.map((item) => createNode({
      id: item.id,
      title: item.title,
      kind: 'zone',
      summary: item.summary(character),
      size: 2,
      density: 5,
      x: item.x,
      y: item.y,
      parentId: ROOT_ID,
      deletable: item.deletable
    }))
  ]
  addLinkedNodes(character, nodes, ROOT_ID)
  return nodes
}

function buildFocusedScene(character: Character, focusId: string): CharacterBrainNodeModel[] {
  const focusNode = getCharacterBrainNodeById(character, focusId)
  if (!focusNode) return buildRootScene(character)

  const nodes: CharacterBrainNodeModel[] = []
  const chain = collectNodeChain(character, focusId)
  const focusIndex = chain.indexOf(focusId)
  const totalAncestors = Math.max(focusIndex, 0)
  const chainPositionById = resolveChainAutoPositions(character, chain)
  const focusPosition = chainPositionById[focusId] || { x: 0, y: 0 }
  chain.forEach((id, index) => {
    const specNode = getCharacterBrainNodeById(character, id)
    if (!specNode) return
    const isFocus = id === focusId
    const distanceFromFocus = totalAncestors - index
    const position = chainPositionById[id] || { x: focusPosition.x, y: focusPosition.y - (distanceFromFocus * BRAIN_SCENE_CHILD_DISTANCE) }
    nodes.push(createNode({
      ...specNode,
      x: position.x,
      y: position.y,
      size: resolveSceneNodeSize(isFocus ? 'focus' : 'parent', distanceFromFocus),
      density: resolveSceneNodeDensity(isFocus ? 'focus' : 'parent', distanceFromFocus)
    }))
  })

  chain.forEach((ancestorId, index) => {
    if (ancestorId === focusId) return
    const ancestorNode = nodes.find((item) => item.id === ancestorId)
    if (!ancestorNode) return
    const ancestorDistance = Math.max(totalAncestors - index, 0)
    const chainChildId = chain[index + 1]
    const chainChildNode = chainChildId ? nodes.find((item) => item.id === chainChildId) || null : null
    const children = resolveSceneChildren(character, ancestorId)
    if (!children.length) return
    const childSpecs = layoutRadialSpecs(children, character, {
      centerX: ancestorNode.x,
      centerY: ancestorNode.y,
      parentX: chainChildNode?.x,
      parentY: chainChildNode?.y,
      radius: BRAIN_SCENE_CHILD_DISTANCE
    }).filter((item) => !chain.includes(item.id))
    childSpecs.forEach((item) => {
      nodes.push(createNode({
        id: item.id,
        title: item.title,
        kind: resolveNodeKind(item.id, Boolean(item.fieldKey), item.deletable),
        summary: item.summary(character),
        size: resolveSceneNodeSize('context', ancestorDistance + 1),
        density: resolveSceneNodeDensity('context', ancestorDistance + 1),
        x: item.x,
        y: item.y,
        parentId: ancestorId,
        deletable: item.deletable,
        fieldKey: item.fieldKey,
        sourceDocumentId: item.sourceDocumentId,
        sourceDisplayPath: item.sourceDisplayPath
      }))
    })
  })

  const focusChildren = resolveSceneChildren(character, focusId)
  if (focusChildren.length > 0) {
    const parentId = chain[focusIndex - 1]
    const parentNode = parentId ? nodes.find((item) => item.id === parentId) || null : null
    if (focusId === TRAJECTORY_ID) {
      nodes.push(...buildTraceAxisNodes(character, TRAJECTORY_ID, focusPosition.y))
    } else {
      const childSpecs = layoutRadialSpecs(focusChildren, character, {
        centerX: focusPosition.x,
        centerY: focusPosition.y,
        parentX: parentNode?.x,
        parentY: parentNode?.y,
        radius: BRAIN_SCENE_CHILD_DISTANCE
      })
      childSpecs.forEach((item) => {
        nodes.push(createNode({
          id: item.id,
          title: item.title,
          kind: resolveNodeKind(item.id, Boolean(item.fieldKey), item.deletable),
          summary: item.summary(character),
          size: resolveSceneNodeSize('child', 1),
          density: resolveSceneNodeDensity('child', 1),
          x: item.x,
          y: item.y,
          parentId: focusId,
          deletable: item.deletable,
          fieldKey: item.fieldKey,
          sourceDocumentId: item.sourceDocumentId,
          sourceDisplayPath: item.sourceDisplayPath
        }))
      })
    }
  }

  addLinkedNodes(character, nodes, focusId)
  return dedupeNodes(nodes)
}

function resolveChainAutoPositions(character: Character, chain: string[]) {
  const positions: Record<string, { x: number; y: number }> = {}
  if (!chain.length) return positions
  positions[chain[0]] = { x: 0, y: 0 }
  for (let index = 1; index < chain.length; index += 1) {
    const parentId = chain[index - 1]
    const nodeId = chain[index]
    const parentPosition = positions[parentId]
    if (!parentPosition) {
      positions[nodeId] = { x: 0, y: 0 }
      continue
    }
    const grandParentPosition = index > 1 ? positions[chain[index - 2]] : undefined
    const childSpecs = layoutRadialSpecs(resolveSceneChildren(character, parentId), character, {
      centerX: parentPosition.x,
      centerY: parentPosition.y,
      parentX: grandParentPosition?.x,
      parentY: grandParentPosition?.y,
      radius: BRAIN_SCENE_CHILD_DISTANCE
    })
    const childPosition = childSpecs.find((item) => item.id === nodeId)
    positions[nodeId] = childPosition
      ? { x: childPosition.x, y: childPosition.y }
      : { x: parentPosition.x, y: parentPosition.y + BRAIN_SCENE_CHILD_DISTANCE }
  }
  return positions
}

function dedupeNodes(nodes: CharacterBrainNodeModel[]) {
  const seen = new Set<string>()
  return nodes.filter((node) => {
    if (seen.has(node.id)) return false
    seen.add(node.id)
    return true
  })
}

function resolveValidFocusId(character: Character, focusId?: string) {
  const normalizedId = String(focusId || ROOT_ID).trim()
  return getCharacterBrainNodeById(character, normalizedId)?.id || ROOT_ID
}

export function collectNodeChain(character: Character, nodeId: string) {
  const normalizedId = String(nodeId || '').trim()
  if (!normalizedId) return [ROOT_ID]
  const nicknameIds = new Set(buildNicknameSpecs(character).map((item) => item.id))
  const cognitionParentIds = buildCognitionParentMap(character)
  const traceParentIds = buildTraceParentMap(character)
  const chain: string[] = []
  let currentId = normalizedId
  const visited = new Set<string>()

  while (currentId && !visited.has(currentId)) {
    visited.add(currentId)
    chain.unshift(currentId)
    if (currentId === ROOT_ID) break
    if (nicknameIds.has(currentId)) {
      currentId = NICKNAMES_ID
      continue
    }
    currentId = traceParentIds[currentId] || cognitionParentIds[currentId] || NODE_PARENT_ID[currentId] || ROOT_ID
  }

  if (!chain.includes(ROOT_ID)) {
    chain.unshift(ROOT_ID)
  }

  return chain
}

function resolveSceneChildren(character: Character, parentId: string): RadialLayoutSpec[] {
  const resolver = SCENE_CHILDREN[parentId]
  if (resolver) return typeof resolver === 'function' ? resolver(character) : resolver
  if (parentId === TRACE_ROOT_NODE_ID || isTraceNodeId(parentId)) {
    return buildTraceSpecs(character, parentId)
  }
  if (parentId === COGNITION_ID || isCognitionNodeId(parentId)) {
    return buildCognitionSpecs(character, parentId)
  }
  return []
}

function resolveNodeTitle(character: Character, nodeId: string) {
  const traceNode = readCharacterBrainTraceNodes(character).find((item) => item.id === nodeId)
  if (traceNode) return traceNode.title
  const cognitionNode = readCharacterBrainCognitionNodes(character).find((item) => item.id === nodeId)
  if (cognitionNode) return cognitionNode.title
  const dynamic = buildNicknameSpecs(character).find((item) => item.id === nodeId)
  if (dynamic) return dynamic.title
  if (nodeId === ROOT_ID) return character.name || '角色'
  return STATIC_NODE_SPECS.find((item) => item.id === nodeId)?.title || '未命名节点'
}

function collectAllNodeSpecs(character: Character): RadialLayoutSpec[] {
  const rootSpec: RadialLayoutSpec = {
    id: ROOT_ID,
    title: character.name || '角色',
    summary: (item) => String(item.desc || '').trim() || '还没有角色简介',
    preferredAngle: 0,
    deletable: false
  }
  return [
    rootSpec,
    ...STATIC_NODE_SPECS,
    ...buildNicknameSpecs(character),
    ...buildTraceSpecs(character, TRACE_ROOT_NODE_ID),
    ...buildCognitionSpecs(character)
  ]
}

function addLinkedNodes(character: Character, nodes: CharacterBrainNodeModel[], focusId: string) {
  const targetNodes = buildCharacterBrainLinkedNodeTargets(character, focusId)
  const targetIds = targetNodes.map((node) => node.id)
  if (!targetIds.length) return
  const existingIds = new Set(nodes.map((node) => node.id))
  targetNodes.forEach((target, index) => {
    if (existingIds.has(target.id)) return
    const angle = normalizeAngle(BRAIN_LINK_START_ANGLE + (index * (360 / Math.max(targetNodes.length, 1))))
    const point = pointOnCircle(50, 50, BRAIN_LINK_DISTANCE, angle)
    nodes.push(createNode({
      ...target,
      x: point.x,
      y: point.y,
      parentId: focusId,
      edgeKind: 'link'
    }))
    existingIds.add(target.id)
  })
}

function resolveSceneNodeSize(relation: SceneRelation, distance: number): CharacterBrainNodeSize {
  if (relation === 'focus') return 3
  if (relation === 'parent' && distance <= 1) return 2
  if (relation === 'child') return 2
  return 1
}

function resolveSceneNodeDensity(relation: SceneRelation, distance: number): CharacterBrainNodeDensity {
  if (relation === 'focus') return 5
  if (relation === 'parent' && distance <= 1) return 5
  if (relation === 'child') return 5
  if (relation === 'parent') return Math.max(1, 5 - distance) as CharacterBrainNodeDensity
  return Math.max(1, 4 - distance) as CharacterBrainNodeDensity
}

function resolveFieldKeyByNodeId(nodeId: string): CharacterBrainFieldKey | undefined {
  if (nodeId === BASIC_INFO_ID) return 'basicInfo'
  if (nodeId === PRESET_ID) return 'preset'
  if (nodeId === AVATAR_ID) return 'avatar'
  if (nodeId === NICKNAMES_ID) return 'nicknames'
  if (nodeId.startsWith('brain:nickname:item:')) return 'nicknames'
  return STATIC_NODE_SPECS.find((item) => item.id === nodeId)?.fieldKey
}

function resolveNodeKind(nodeId: string, hasFieldKey: boolean, deletable: boolean) {
  if (nodeId === ROOT_ID) return 'root'
  if (nodeId === SEE_ME_ID || nodeId === RELATIONSHIP_ID || nodeId === TRAJECTORY_ID || nodeId === COGNITION_ID) return 'zone'
  if (!hasFieldKey || nodeId === AVATAR_ID || nodeId === BASIC_INFO_ID || nodeId === PRESET_ID || nodeId === NICKNAMES_ID || nodeId === DETAIL_INFO_ID) {
    return 'group'
  }
  if (deletable || hasFieldKey) return 'field'
  return 'group'
}

function isCognitionNodeId(nodeId: string) {
  return String(nodeId || '').startsWith(COGNITION_NODE_ID_PREFIX)
}

function isTraceNodeId(nodeId: string) {
  const normalizedId = String(nodeId || '').trim()
  return normalizedId.startsWith(TRACE_NODE_ID_PREFIX)
}

function parseTraceInnerEntryNodeId(nodeId: string) {
  const normalizedId = String(nodeId || '').trim()
  const separator = '::inner::'
  if (!normalizedId.includes(separator)) return null
  const [traceNodeId, entryId] = normalizedId.split(separator)
  if (!traceNodeId.startsWith(TRACE_NODE_ID_PREFIX) || !entryId) return null
  return { traceNodeId, entryId }
}

function buildCognitionSpecs(character: Character, parentId?: string): RadialLayoutSpec[] {
  const normalizedParentId = String(parentId || '').trim()
  return readCharacterBrainCognitionNodes(character)
    .filter((node) => !normalizedParentId || node.parentId === normalizedParentId)
    .map((node, index) => ({
      id: node.id,
      title: node.title,
      summary: () => node.summary || buildCognitionKindSummary(node.kind),
      preferredAngle: 210 + ((index % 8) * 32),
      deletable: true,
      sourceDocumentId: node.sourceDocumentId,
      sourceDisplayPath: node.sourceDisplayPath
    }))
}

function buildTraceSpecs(character: Character, parentId?: string): RadialLayoutSpec[] {
  const normalizedParentId = String(parentId || '').trim()
  return readCharacterBrainTraceNodes(character)
    .filter((node) => !normalizedParentId || node.parentId === normalizedParentId)
    .map((node, index) => ({
      id: node.id,
      title: node.title,
      summary: () => node.summary || buildTraceNodeSummary(node),
      preferredAngle: 210 + ((index % 8) * 32),
      deletable: true
    }))
}

function buildCognitionParentMap(character: Character): Record<string, string> {
  const parentMap: Record<string, string> = {}
  readCharacterBrainCognitionNodes(character).forEach((node) => {
    parentMap[node.id] = node.parentId || COGNITION_ID
  })
  return parentMap
}

function buildTraceParentMap(character: Character): Record<string, string> {
  const parentMap: Record<string, string> = {}
  readCharacterBrainTraceNodes(character).forEach((node) => {
    parentMap[node.id] = node.parentId || TRACE_ROOT_NODE_ID
  })
  return parentMap
}

function resolveTraceGraphNodeKind(character: Character, node: CharacterBrainTraceNode): CharacterBrainNodeModel['kind'] {
  const hasChildren = readCharacterBrainTraceNodes(character).some((item) => item.parentId === node.id)
  return hasChildren ? 'group' : 'field'
}

function resolveCognitionGraphNodeKind(character: Character, node: CharacterBrainCognitionNode): CharacterBrainNodeModel['kind'] {
  if (node.kind === 'group') return 'group'
  const hasChildren = readCharacterBrainCognitionNodes(character).some((item) => item.parentId === node.id)
  return hasChildren ? 'group' : 'field'
}

function buildCognitionKindSummary(kind: CharacterBrainCognitionNodeKind) {
  switch (kind) {
    case 'reference':
      return '来自世界树的公共引用节点'
    case 'private':
      return '角色灵魂理解节点'
    case 'relation':
      return '角色关系认知节点'
    default:
      return '灵魂分组节点'
  }
}

function buildTraceNodeSummary(node: CharacterBrainTraceNode) {
  const summaryText = String(node.summary || '').trim()
  if (summaryText) return summaryText
  const entityText = node.relatedEntityIds.length ? `对象：${node.relatedEntityIds.join('、')}` : ''
  const tagText = node.tags.length ? `标签：${node.tags.join('、')}` : ''
  return [entityText, tagText].filter(Boolean).join(' ｜ ') || node.title
}

function buildTraceAxisNodes(character: Character, parentId: string, centerY: number) {
  const traceNodes = readCharacterBrainTraceNodes(character)
  const manualAnchors = traceNodes
    .filter((node) => node.parentId === parentId)
    .sort(compareTraceNodesByPoint)
  const contextLabels = buildTrajectoryContextLabels(manualAnchors)
  const startX = BRAIN_SCENE_CHILD_DISTANCE
  const visibleNodes: Array<{
    id: string
    title: string
    summary: string
    kind: CharacterBrainNodeModel['kind']
    parentId: string
    deletable: boolean
    offsetDays: number
    x: number
    y: number
    source?: CharacterBrainTraceNode
  }> = []
  let previousVisibleId = parentId
  manualAnchors.forEach((node, index) => {
    const anchorBaseX = roundPercent(startX + ((index + 1) * BRAIN_SCENE_CHILD_DISTANCE))
    const anchorVisualX = anchorBaseX
    const anchorVisualY = roundPercent(centerY)
    visibleNodes.push({
      id: node.id,
      title: contextLabels.get(node.id) || node.displayTitle || node.title,
      kind: resolveTraceGraphNodeKind(character, node),
      summary: buildTraceNodeSummary(node),
      parentId: previousVisibleId,
      deletable: true,
      offsetDays: Math.max(0, Number(node.offsetDays) || 0),
      x: anchorVisualX,
      y: anchorVisualY,
      source: node
    })
    previousVisibleId = node.id
  })
  return visibleNodes.map((node) => {
    return createNode({
      id: node.id,
      title: node.title,
      kind: node.kind,
      summary: node.summary,
      size: node.source ? 2 : 1,
      density: node.source ? 5 : 3,
      x: node.x,
      y: node.y,
      parentId: node.parentId,
      deletable: node.deletable
    })
  })
}

function compareTraceNodesByPoint(a: CharacterBrainTraceNode, b: CharacterBrainTraceNode) {
  const offsetDiff = (Number(a.offsetDays) || 0) - (Number(b.offsetDays) || 0)
  if (offsetDiff !== 0) return offsetDiff
  return String(a.pointDate || '').localeCompare(String(b.pointDate || ''))
}

function resolveTraceStepUnitFromKind(kind: CharacterBrainTraceNodeKind): CharacterBrainTraceStepUnit {
  if (kind === 'day') return 'day'
  if (kind === 'month') return 'month'
  return 'year'
}

function formatTraceDate(date: Date) {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

function normalizeTraceDateText(input: string) {
  const value = String(input || '').trim()
  const compact = value.match(/^(\d{4})(\d{2})(\d{2})$/)
  if (compact) return `${compact[1]}-${compact[2]}-${compact[3]}`
  return value
}

function parseTraceDate(input: string) {
  const normalized = normalizeTraceDateText(input)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return null
  const date = new Date(`${normalized}T00:00:00`)
  if (Number.isNaN(date.getTime())) return null
  if (formatTraceDate(date) !== normalized) return null
  return date
}

function buildCognitionNodeContent(node: CharacterBrainCognitionNode) {
  return [
    `# ${node.title}`,
    '',
    node.summary || buildCognitionKindSummary(node.kind),
    '',
    node.sourceDisplayPath ? `来源路径：${node.sourceDisplayPath}` : '',
    node.sourceDocumentId ? `来源文档：${node.sourceDocumentId}` : ''
  ].filter((line) => line !== '').join('\n')
}

function buildTracePendingReviewCard(node: CharacterBrainTraceNode): CharacterBrainPendingReviewCard | undefined {
  if (node.confirmed !== false) return undefined
  return {
    mode: node.pendingReview?.mode === 'update' ? 'update' : 'create',
    reason: String(node.pendingReview?.reason || '').trim() || '这是待确认的轨迹变更。',
    createdBy: String(node.pendingReview?.createdBy || '').trim() || 'agent',
    createdAt: String(node.pendingReview?.createdAt || node.updatedAt || node.createdAt || '').trim(),
    previous: node.pendingReview?.previous ? normalizePendingSnapshot(node.pendingReview.previous) : null,
    current: {
      title: node.title,
      summary: node.summary,
      content: node.content,
      timeLabel: node.timeLabel,
      pointDate: node.pointDate,
      ageLabel: node.ageLabel,
      relatedEntityIds: [...node.relatedEntityIds],
      tags: [...node.tags]
    }
  }
}

function buildCognitionPendingReviewCard(node: CharacterBrainCognitionNode, documentContent = ''): CharacterBrainPendingReviewCard | undefined {
  if (!node.pendingReview) return undefined
  return {
    mode: node.pendingReview.mode,
    reason: String(node.pendingReview.reason || '').trim() || '这是待确认的灵魂变更。',
    createdBy: String(node.pendingReview.createdBy || '').trim() || 'agent',
    createdAt: String(node.pendingReview.createdAt || node.updatedAt || node.createdAt || '').trim(),
    previous: node.pendingReview.previous ? normalizePendingSnapshot(node.pendingReview.previous) : null,
    current: {
      title: node.title,
      summary: node.summary,
      content: documentContent,
      sourceDocumentId: node.sourceDocumentId,
      sourceDisplayPath: node.sourceDisplayPath
    }
  }
}

function normalizePendingSnapshot(raw: CharacterBrainPendingNodeSnapshot): CharacterBrainPendingNodeSnapshot {
  return {
    title: String(raw.title || '').trim(),
    summary: String(raw.summary || '').trim(),
    content: String(raw.content || '').trim(),
    timeLabel: String(raw.timeLabel || '').trim(),
    pointDate: String(raw.pointDate || '').trim(),
    ageLabel: String(raw.ageLabel || '').trim(),
    relatedEntityIds: Array.isArray(raw.relatedEntityIds) ? raw.relatedEntityIds.map((item) => String(item || '').trim()).filter(Boolean) : [],
    tags: Array.isArray(raw.tags) ? raw.tags.map((item) => String(item || '').trim()).filter(Boolean) : [],
    sourceDocumentId: String(raw.sourceDocumentId || '').trim(),
    sourceDisplayPath: String(raw.sourceDisplayPath || '').trim()
  }
}

function createFieldSpec(
  id: string,
  title: string,
  fieldKey: CharacterBrainFieldKey,
  preferredAngle: number,
  deletable = false
): RadialLayoutSpec {
  return {
    id,
    title,
    fieldKey,
    summary: (character) => buildFieldSummary(character, fieldKey),
    preferredAngle,
    deletable
  }
}

function buildNicknameSpecs(character: Character): RadialLayoutSpec[] {
  const nicknames = parseNicknames(character)
  if (!nicknames.length) {
    return [
      {
        id: 'brain:nickname:item:empty',
        title: '未设置昵称',
        fieldKey: 'nicknames',
        summary: () => '还没有设置昵称',
        preferredAngle: 270,
        deletable: false
      }
    ]
  }
  return nicknames.map((nickname, index) => ({
    id: `brain:nickname:item:${index}`,
    title: nickname,
    fieldKey: 'nicknames',
    summary: () => `昵称：${nickname}`,
    preferredAngle: 210 + ((index % 6) * 32),
    deletable: false
  }))
}

function buildNodeParentMap() {
  const map: Record<string, string> = {
    [SEE_ME_ID]: ROOT_ID,
    [RELATIONSHIP_ID]: ROOT_ID,
    [TRAJECTORY_ID]: ROOT_ID,
    [COGNITION_ID]: ROOT_ID,
    [BASIC_INFO_ID]: SEE_ME_ID,
    [DETAIL_INFO_ID]: SEE_ME_ID,
    [GOAL_VALUE_ID]: SEE_ME_ID,
    [SYSTEM_INFO_ID]: SEE_ME_ID
  }
  SEE_ME_CHILDREN.forEach((item) => { map[item.id] = SEE_ME_ID })
  BASIC_INFO_CHILDREN.forEach((item) => { map[item.id] = BASIC_INFO_ID })
  SYSTEM_INFO_CHILDREN.forEach((item) => { map[item.id] = SYSTEM_INFO_ID })
  AVATAR_CHILDREN.forEach((item) => { map[item.id] = AVATAR_ID })
  PRESET_CHILDREN.forEach((item) => { map[item.id] = PRESET_ID })
  DETAIL_CHILDREN.forEach((item) => { map[item.id] = DETAIL_INFO_ID })
  return map
}

function createNode(input: PositionedNodeInput): CharacterBrainNodeModel {
  return {
    id: input.id,
    title: input.title,
    kind: input.kind,
    summary: input.summary,
    size: input.size,
    density: input.density,
    x: input.x,
    y: input.y,
    deletable: input.deletable,
    parentId: input.parentId,
    fieldKey: input.fieldKey,
    edgeKind: input.edgeKind,
    layoutMode: input.layoutMode,
    sourceDocumentId: input.sourceDocumentId,
    sourceDisplayPath: input.sourceDisplayPath
  }
}

function layoutRadialSpecs(
  specs: RadialLayoutSpec[],
  character: Character,
  options: RadialLayoutOptions
): PositionedRadialNodeSpec[] {
  const {
    centerX,
    centerY,
    radius
  } = options
  const total = Math.max(specs.length, 1)
  const evenStep = 360 / total
  const startAngle = specs.length
    ? normalizeAngle(specs.reduce((sum, spec) => sum + normalizeAngle(spec.preferredAngle), 0) / specs.length)
    : 0

  return specs.map((spec, index) => {
    const angle = normalizeAngle(startAngle + (index * evenStep))
    const point = pointOnCircle(centerX, centerY, radius, angle)
    return {
      ...spec,
      x: point.x,
      y: point.y,
      summary: spec.summary
    }
  })
}

function pointOnCircle(centerX: number, centerY: number, radius: number, angle: number) {
  const radians = (normalizeAngle(angle) * Math.PI) / 180
  return {
    x: roundPercent(centerX + (Math.cos(radians) * radius)),
    y: roundPercent(centerY + (Math.sin(radians) * radius))
  }
}

function normalizeAngle(value: number) {
  const normalized = value % 360
  return normalized >= 0 ? normalized : normalized + 360
}

function roundPercent(value: number) {
  return Math.round(value * 100) / 100
}

function distanceBetween(fromX: number, fromY: number, toX: number, toY: number) {
  const dx = toX - fromX
  const dy = toY - fromY
  return Math.sqrt((dx * dx) + (dy * dy))
}

function normalizeMinDensity(value: unknown): CharacterBrainNodeDensity {
  const num = Number(value)
  if (!Number.isFinite(num)) return 1
  if (num <= 0) return 0
  if (num >= 5) return 5
  return Math.round(num) as CharacterBrainNodeDensity
}

function buildBasicInfoSummary(character: Character) {
  const nicknames = parseNicknames(character)
  const parts = [
    `姓名：${readCharacterField(character, 'name') || '未命名'}`,
    `性别：${readCharacterField(character, 'gender') || '未设'}`,
    `年龄：${readCharacterField(character, 'age') || '未设'}`,
    `昵称：${nicknames.length ? nicknames.join('、') : '未设'}`
  ]
  return parts.join(' / ')
}

function buildCoreSummary(character: Character) {
  const desc = readCharacterField(character, 'desc')
  const personality = readCharacterField(character, 'personality')
  const goalValue = readCharacterBrainDocument(character, GOAL_VALUE_ID).trim()
  return [
    desc ? `简介：${desc}` : '',
    personality ? `性格：${personality}` : '',
    goalValue ? `目标与价值：${goalValue}` : ''
  ].filter(Boolean).join(' / ') || '还没有记录核心简介、性格与目标价值'
}

function buildSystemInfoSummary(character: Character) {
  const nicknames = parseNicknames(character)
  return [
    `姓名：${readCharacterField(character, 'name') || '未命名'}`,
    `性别：${readCharacterField(character, 'gender') || '未设'}`,
    `年龄：${readCharacterField(character, 'age') || '未设'}`,
    `昵称：${nicknames.length ? nicknames.join('、') : '未设'}`
  ].join(' / ')
}

function buildPresetSummary(character: Character) {
  const rawPreset = readCharacterField(character, 'defaultPreset')
  const preset = formatApiPresetValue(rawPreset)
  const model = readCharacterField(character, 'defaultModel') || '跟随预设'
  return `默认预设：${preset} / 默认模型：${model}`
}

function formatApiPresetValue(value: unknown): string {
  return String(value || '').trim() || '跟随全局'
}

function buildDetailInfoSummary(character: Character) {
  const labels = DETAIL_CHILDREN
    .map((item) => (item.fieldKey ? buildFieldSummary(character, item.fieldKey) : ''))
    .filter(Boolean)
    .slice(0, 3)
  return labels.length ? labels.join(' / ') : '还没有记录详细信息'
}

function buildDescContent(character: Character) {
  return [
    '# 简介',
    '',
    String(character.desc || '').trim() || '还没有填写简介。'
  ].join('\n')
}

function buildFieldSummary(character: Character, fieldKey: CharacterBrainFieldKey) {
  const value = readCharacterField(character, fieldKey)
  if (fieldKey === 'nicknames') {
    const nicknames = parseNicknames(character)
    return nicknames.length ? `已设昵称：${nicknames.join('、')}` : '还没有设置昵称'
  }
  if (fieldKey === 'defaultPreset') return `默认预设：${formatApiPresetValue(value)}`
  if (fieldKey === 'defaultModel') return `默认模型：${value || '跟随预设'}`
  if (fieldKey === 'avatarPath') return value || '未设置头像路径'
  if (fieldKey === 'emoji') return value || '👤'
  if (fieldKey === 'desc') return value || '还没有填写简介'
  return value || `还没有记录${fieldLabel(fieldKey)}`
}

function buildFieldContent(character: Character, fieldKey?: CharacterBrainFieldKey, nodeId?: string) {
  switch (fieldKey) {
    case 'avatar':
      return [
        '# 头像',
        '',
        `Emoji：${readCharacterField(character, 'emoji') || '👤'}`,
        `头像路径：${readCharacterField(character, 'avatarPath') || '未设置'}`
      ].join('\n')
    case 'basicInfo':
      return [
        '# 系统信息',
        '',
        `姓名：${readCharacterField(character, 'name')}`,
        `性别：${readCharacterField(character, 'gender')}`,
        `年龄：${readCharacterField(character, 'age')}`,
        `昵称：${parseNicknames(character).join('、')}`
      ].join('\n')
    case 'preset':
      return [
        '# 预设',
        '',
        `默认预设：${formatApiPresetValue(readCharacterField(character, 'defaultPreset'))}`,
        `默认模型：${readCharacterField(character, 'defaultModel') || '跟随预设'}`
      ].join('\n')
    case 'nicknames': {
      const names = parseNicknames(character)
      if (nodeId?.startsWith('brain:nickname:item:') && !nodeId.endsWith(':empty')) {
        const title = resolveNodeTitle(character, nodeId)
        return ['# 昵称', '', title].join('\n')
      }
      return [
        '# 昵称',
        '',
        ...(names.length ? names.map((item) => `- ${item}`) : ['- 还没有设置昵称'])
      ].join('\n')
    }
    case 'name':
    case 'gender':
    case 'age':
    case 'emoji':
    case 'avatarPath':
    case 'defaultPreset':
    case 'defaultModel':
    case 'appearance':
    case 'speakingStyle':
    case 'outfit':
    case 'personality':
    case 'hobbies':
    case 'abilities':
    case 'experience':
    case 'worldview':
    case 'background':
    case 'desc':
      return [`# ${fieldLabel(fieldKey)}`, '', readCharacterField(character, fieldKey)].join('\n')
    default:
      return ''
  }
}

function buildCardFormFields(character: Character, fieldKey?: CharacterBrainFieldKey | 'detailInfo', nodeId?: string): CharacterBrainCardFormField[] {
  switch (fieldKey) {
    case 'basicInfo':
      return [
        formField(character, 'name', '姓名', 'text', '角色名称'),
        formField(character, 'gender', '性别', 'select', '未设', [
          { label: '未设', value: '' },
          { label: '男', value: '男' },
          { label: '女', value: '女' },
          { label: '其他', value: '其他' }
        ]),
        formField(character, 'age', '年龄', 'text', '例如 18'),
        formField(character, 'nicknames', '昵称', 'textarea', '每行一个昵称'),
        formField(character, 'desc', '简介', 'textarea', '角色简短介绍', undefined, true)
      ]
    case 'preset':
      return [
        formField(character, 'defaultPreset', '默认预设', 'apiPreset', '留空跟随全局'),
        formField(character, 'defaultModel', '默认模型', 'apiModel', '留空跟随预设')
      ]
    case 'avatar':
      return [
        formField(character, 'emoji', 'Emoji', 'text', '👤'),
        formField(character, 'avatarPath', '头像', 'avatar', '头像文件路径')
      ]
    case 'nicknames':
      return [formField(character, 'nicknames', '昵称', 'textarea', '每行一个昵称')]
    case 'detailInfo':
      return [
        detailFormField(character, 'appearance', '外貌特征', '外貌描写'),
        detailFormField(character, 'speakingStyle', '说话风格', '口头禅、语气特点'),
        detailFormField(character, 'outfit', '穿着', '日常穿着'),
        detailFormField(character, 'hobbies', '爱好', '兴趣爱好'),
        detailFormField(character, 'abilities', '能力', '特殊技能'),
        detailFormField(character, 'experience', '经历', '重要经历'),
        detailFormField(character, 'worldview', '世界观', '所处的世界设定'),
        detailFormField(character, 'background', '背景故事', '详细背景', 2)
      ]
    case 'name':
    case 'gender':
    case 'age':
    case 'emoji':
      return [formField(character, fieldKey, fieldLabel(fieldKey), 'text')]
    case 'avatarPath':
      return [formField(character, fieldKey, fieldLabel(fieldKey), 'avatar')]
    case 'defaultPreset':
      return [formField(character, fieldKey, fieldLabel(fieldKey), 'apiPreset')]
    case 'defaultModel':
      return [formField(character, fieldKey, fieldLabel(fieldKey), 'apiModel')]
    case 'appearance':
    case 'speakingStyle':
    case 'outfit':
    case 'personality':
    case 'hobbies':
    case 'abilities':
    case 'experience':
    case 'worldview':
    case 'background':
    case 'desc':
      return [formField(character, fieldKey, fieldLabel(fieldKey), textareaFieldKeys.has(fieldKey) ? 'textarea' : 'text')]
    default:
      if (nodeId?.startsWith('brain:nickname:item:')) {
        return [formField(character, 'nicknames', '昵称', 'textarea', '每行一个昵称')]
      }
      return []
  }
}

function buildSystemInfoFormFields(character: Character): CharacterBrainCardFormField[] {
  return [
    formField(character, 'name', '姓名', 'text', '角色名称'),
    formField(character, 'gender', '性别', 'select', '未设', [
      { label: '未设', value: '' },
      { label: '男', value: '男' },
      { label: '女', value: '女' },
      { label: '其他', value: '其他' }
    ]),
    formField(character, 'age', '年龄', 'text', '例如 18'),
    formField(character, 'nicknames', '昵称', 'textarea', '每行一个昵称'),
    formField(character, 'emoji', 'Emoji', 'text', '👤'),
    formField(character, 'avatarPath', '头像', 'avatar', '头像文件路径'),
    formField(character, 'defaultPreset', '默认预设', 'apiPreset', '留空跟随全局'),
    formField(character, 'defaultModel', '默认模型', 'apiModel', '留空跟随预设')
  ]
}

const textareaFieldKeys = new Set<CharacterBrainFieldKey>([
  'desc',
  'nicknames',
  'appearance',
  'speakingStyle',
  'outfit',
  'personality',
  'hobbies',
  'abilities',
  'experience',
  'worldview',
  'background'
])

function formField(
  character: Character,
  key: CharacterBrainFieldKey,
  label: string,
  type: CharacterBrainCardFormField['type'],
  placeholder = '',
  options?: CharacterBrainCardFormField['options'],
  dividerBefore = false
): CharacterBrainCardFormField {
  const value = key === 'nicknames'
    ? parseNicknames(character).join('\n')
    : readCharacterField(character, key)
  return { key, label, type, placeholder, value, options, dividerBefore }
}

function detailFormField(
  character: Character,
  key: CharacterBrainFieldKey,
  label: string,
  placeholder: string,
  columnSpan: 1 | 2 = 1
): CharacterBrainCardFormField {
  return {
    ...formField(character, key, label, 'textarea', placeholder),
    columnSpan,
    controlClassName: columnSpan === 2
      ? 'role-workspace__control--detail-long-textarea'
      : 'role-workspace__control--detail-textarea'
  }
}

function buildTraceCardFormFields(node: CharacterBrainTraceNode): CharacterBrainCardFormField[] {
  return [
    {
      key: TRACE_FORM_KEYS.pointDate,
      label: '时间点',
      type: 'text',
      placeholder: '例如 2014-05-02',
      value: node.pointDate,
      columnSpan: 1
    },
    {
      key: TRACE_FORM_KEYS.offsetDays,
      label: '出生后第几日',
      type: 'text',
      placeholder: '由出生日期和时间点自动计算',
      value: String(node.offsetDays),
      readonly: true,
      columnSpan: 1,
      fieldClassName: 'brain-card__field--metric',
      controlClassName: 'brain-card__control--compact'
    },
    {
      key: TRACE_FORM_KEYS.summary,
      label: '备注',
      type: 'textarea',
      placeholder: '显示在节点名字下方的副名字',
      value: node.summary,
      dividerBefore: true
    },
    {
      key: TRACE_FORM_KEYS.content,
      label: '正文',
      type: 'textarea',
      placeholder: '总结这个时间段相较于上个节点发生了什么，方便后续召回',
      value: node.content
    },
    {
      key: TRACE_FORM_KEYS.tags,
      label: '标签',
      type: 'text',
      placeholder: '多个标签用中文逗号隔开',
      value: node.tags.join('，'),
      dividerBefore: true,
      columnSpan: 1,
      controlClassName: 'brain-card__control--narrow'
    }
  ]
}

function readCharacterField(character: Character | CharacterDraftSource, fieldKey: CharacterBrainFieldKey) {
  switch (fieldKey) {
    case 'name':
      return readCharacterSourceField(character, 'name')
    case 'gender':
      return readCharacterSourceField(character, 'gender')
    case 'age':
      return readCharacterSourceField(character, 'age')
    case 'emoji':
      return readCharacterSourceField(character, 'emoji')
    case 'avatarPath':
      return String(character.avatarPath ?? character.avatar_path ?? (character as CharacterDraftSource).avatar ?? '').trim()
    case 'defaultPreset':
      return readCharacterSourceField(character, 'defaultPreset')
    case 'defaultModel':
      return readCharacterSourceField(character, 'defaultModel')
    case 'appearance':
      return readCharacterSourceField(character, 'appearance')
    case 'speakingStyle':
      return readCharacterSourceField(character, 'speakingStyle')
    case 'outfit':
      return readCharacterSourceField(character, 'outfit')
    case 'personality':
      return readCharacterSourceField(character, 'personality')
    case 'hobbies':
      return readCharacterSourceField(character, 'hobbies')
    case 'abilities':
      return readCharacterSourceField(character, 'abilities')
    case 'experience':
      return readCharacterSourceField(character, 'experience')
    case 'worldview':
      return readCharacterSourceField(character, 'worldview')
    case 'background':
      return readCharacterSourceField(character, 'background')
    case 'desc':
      return readCharacterSourceField(character, 'desc')
    default:
      return ''
  }
}

function readCharacterSourceField(source: CharacterDraftSource, key: string) {
  const keyMap: Record<string, string[]> = {
    speakingStyle: ['speakingStyle', 'speaking_style'],
    defaultPreset: ['defaultPreset', 'default_preset'],
    defaultModel: ['defaultModel', 'default_model']
  }
  const candidates = keyMap[key] || [key]
  for (const candidate of candidates) {
    const value = source[candidate as keyof CharacterDraftSource]
    if (value !== undefined && value !== null) {
      return String(value).trim()
    }
  }
  return ''
}

function buildCharacterBrainLinkDraft(character: Character, nodeId: string, context?: CharacterBrainReadContext): CharacterBrainLinkDraft {
  const targetIds = (context?.bidirectionalLinks || readBidirectionalCharacterBrainLinks(character))[nodeId] || []
  return {
    targetIds,
    text: targetIds
      .map((targetId) => {
        const targetTitle = resolveReadContextNodeTitle(character, targetId, context)
        return targetTitle ? `[[${targetTitle}]]` : ''
      })
      .filter(Boolean)
      .join(' ')
  }
}

function readCharacterBrainLinks(character: Character | CharacterDraftSource): CharacterBrainLinkMap {
  const raw = character.brainLinks ?? character.brain_links
  const parsed = typeof raw === 'string'
    ? parseJsonRecord(raw)
    : raw && typeof raw === 'object' && !Array.isArray(raw)
      ? raw as Record<string, unknown>
      : {}
  const links: CharacterBrainLinkMap = {}
  Object.entries(parsed).forEach(([sourceId, targetIds]) => {
    const normalizedSourceId = String(sourceId || '').trim()
    const normalizedTargetIds = normalizeLinkIds(targetIds)
      .filter((targetId) => targetId && targetId !== normalizedSourceId)
    if (normalizedSourceId && normalizedTargetIds.length) {
      links[normalizedSourceId] = Array.from(new Set(normalizedTargetIds))
    }
  })
  return links
}

function readBidirectionalCharacterBrainLinks(character: Character | CharacterDraftSource): CharacterBrainLinkMap {
  return makeCharacterBrainLinksBidirectional(readCharacterBrainLinks(character))
}

export function readCharacterBrainDocuments(character: Character | CharacterDraftSource): Record<string, string> {
  const raw = character.brainDocuments ?? character.brain_documents
  const parsed = typeof raw === 'string'
    ? parseJsonRecord(raw)
    : raw && typeof raw === 'object' && !Array.isArray(raw)
      ? raw as Record<string, unknown>
      : {}
  const documents: Record<string, string> = {}
  Object.entries(parsed).forEach(([nodeId, content]) => {
    const normalizedNodeId = String(nodeId || '').trim()
    if (!normalizedNodeId) return
    documents[normalizedNodeId] = String(content ?? '')
  })
  return documents
}

export function createCharacterBrainReadContext(character: Character | CharacterDraftSource): CharacterBrainReadContext {
  const cognitionNodes = readCharacterBrainCognitionNodes(character)
  const traceNodes = readCharacterBrainTraceNodes(character)
  const cognitionById = new Map(cognitionNodes.map((node) => [node.id, node] as const))
  const traceById = new Map(traceNodes.map((node) => [node.id, node] as const))
  const childrenByParentId = new Map<string, string[]>()
  for (const node of [...cognitionNodes, ...traceNodes]) {
    const parentId = String(node.parentId || '').trim()
    if (!parentId) continue
    const children = childrenByParentId.get(parentId)
    if (children) children.push(node.id)
    else childrenByParentId.set(parentId, [node.id])
  }
  return {
    cognitionNodes,
    traceNodes,
    cognitionById,
    traceById,
    childrenByParentId,
    childCountByParentId: new Map(Array.from(childrenByParentId, ([parentId, children]) => [parentId, children.length])),
    documents: readCharacterBrainDocuments(character),
    bidirectionalLinks: readBidirectionalCharacterBrainLinks(character)
  }
}

export function readCharacterBrainDocument(character: Character | CharacterDraftSource, nodeId: string): string {
  return readCharacterBrainDocuments(character)[String(nodeId || '').trim()] || ''
}

export function readCharacterBrainCognitionNodes(character: Character | CharacterDraftSource): CharacterBrainCognitionNode[] {
  const raw = character.brainCognitionNodes ?? character.brain_cognition_nodes
  const parsed = typeof raw === 'string'
    ? parseJsonArray(raw) || []
    : Array.isArray(raw)
      ? raw
      : []
  const parentIds = new Set<string>([COGNITION_ID])
  const normalized = parsed
    .filter((item) => item && typeof item === 'object')
    .map((item, index) => normalizeCognitionNode(item as Record<string, unknown>, index))
    .filter((item): item is CharacterBrainCognitionNode => Boolean(item))

  normalized.forEach((node) => parentIds.add(node.id))
  return normalized.map((node) => ({
    ...node,
    parentId: parentIds.has(node.parentId) ? node.parentId : COGNITION_ID
  }))
}

function normalizeCognitionNodeList(nodes: CharacterBrainCognitionNode[]): CharacterBrainCognitionNode[] {
  return readCharacterBrainCognitionNodes({
    brainCognitionNodes: nodes
  })
}

export function readCharacterBrainTraceNodes(character: Character | CharacterDraftSource): CharacterBrainTraceNode[] {
  const raw = character.brainTraceNodes ?? character.brain_trace_nodes
  const parsed = typeof raw === 'string'
    ? parseJsonArray(raw) || []
    : Array.isArray(raw)
      ? raw
      : []
  const parentIds = new Set<string>([TRACE_ROOT_NODE_ID])
  const normalized = parsed
    .filter((item) => item && typeof item === 'object')
    .map((item, index) => normalizeTraceNode(item as Record<string, unknown>, index))
    .filter((item): item is CharacterBrainTraceNode => Boolean(item))

  normalized.forEach((node) => parentIds.add(node.id))
  return normalized.map((node) => ({
    ...node,
    parentId: parentIds.has(node.parentId) ? node.parentId : TRACE_ROOT_NODE_ID
  }))
}

function normalizeTraceNodeList(nodes: CharacterBrainTraceNode[]): CharacterBrainTraceNode[] {
  return readCharacterBrainTraceNodes({
    brainTraceNodes: nodes
  })
}

function normalizeCognitionNode(raw: Record<string, unknown>, index: number): CharacterBrainCognitionNode | null {
  const title = String(raw.title || '').trim()
  if (!title) return null
  const id = normalizeCognitionNodeId(raw.id, index)
  const kind = normalizeCognitionNodeKind(raw.kind)
  const now = new Date(0).toISOString()
  const content = String(raw.content ?? raw.body ?? '').trim()
  const tags = normalizeStringList(raw.tags)
  const relationHints = normalizeStringList(raw.relationHints ?? raw.relation_hints)
  const compilePage = normalizeOptionalCharacterBrainCompilePage(raw.compilePage ?? raw.compile_page ?? raw.publicCompilePage ?? raw.public_compile_page, {
    summary: String(raw.summary || '').trim(),
    tags,
    relationHints,
    updatedAt: String(raw.updatedAt ?? raw.updated_at ?? '').trim() || now
  })
  return {
    id,
    title,
    summary: String(raw.summary || '').trim(),
    parentId: normalizeCognitionParentId(raw.parentId ?? raw.parent_id),
    kind,
    content: content || undefined,
    subjectType: normalizeRelationSubjectType(raw.subjectType ?? raw.subject_type),
    subjectId: String(raw.subjectId ?? raw.subject_id ?? '').trim() || undefined,
    tags,
    relationHints,
    compilePage,
    sourceDocumentId: String(raw.sourceDocumentId ?? raw.source_document_id ?? '').trim() || undefined,
    sourceDisplayPath: String(raw.sourceDisplayPath ?? raw.source_display_path ?? '').trim() || undefined,
    sourceDetachedAt: String(raw.sourceDetachedAt ?? raw.source_detached_at ?? '').trim() || undefined,
    sourceSnapshotTitle: String(raw.sourceSnapshotTitle ?? raw.source_snapshot_title ?? '').trim() || undefined,
    sourceSnapshotSummary: String(raw.sourceSnapshotSummary ?? raw.source_snapshot_summary ?? '').trim() || undefined,
    pendingReview: normalizePendingReview(raw.pendingReview ?? raw.pending_review),
    createdAt: String(raw.createdAt ?? raw.created_at ?? '').trim() || now,
    updatedAt: String(raw.updatedAt ?? raw.updated_at ?? '').trim() || now
  }
}

function normalizeOptionalCharacterBrainCompilePage(
  raw: unknown,
  fallback: Partial<CharacterBrainCompilePage> & { summary: string; tags: string[]; relationHints: string[]; updatedAt?: string }
): CharacterBrainCompilePage | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const page = normalizeCharacterBrainCompilePage(raw, fallback)
  if (!page.summary && !page.tags.length && !page.relationHints.length) return undefined
  return page
}

function normalizeTraceNode(raw: Record<string, unknown>, index: number): CharacterBrainTraceNode | null {
  const id = normalizeTraceNodeId(raw.id, index)
  const legacyKind = normalizeTraceNodeKind(raw.granularity ?? raw.kind)
  const now = new Date(0).toISOString()
  const spanYears = Math.max(1, Number(raw.spanYears ?? raw.span_years ?? 1) || 1)
  const startAge = Math.max(0, Number(raw.startAge ?? raw.start_age ?? 0) || 0)
  const endAge = Math.max(startAge, Number(raw.endAge ?? raw.end_age ?? startAge + spanYears) || (startAge + spanYears))
  const startDate = normalizeTraceDateText(String(raw.startDate ?? raw.start_date ?? raw.pointDate ?? raw.point_date ?? '').trim())
  const endDate = normalizeTraceDateText(String(raw.endDate ?? raw.end_date ?? raw.pointDate ?? raw.point_date ?? startDate).trim())
  const pointDate = normalizeTraceDateText(String(raw.pointDate ?? raw.point_date ?? endDate ?? startDate ?? '').trim())
  const nodeType = String(raw.nodeType ?? raw.node_type ?? '').trim() === 'range' || (startDate && endDate && startDate !== endDate) ? 'range' : 'single'
  const inferredKind = inferTrajectoryNodeGranularity({
    nodeType,
    startDate: startDate || pointDate,
    endDate: nodeType === 'range' ? endDate : undefined,
    pointDate,
    granularity: legacyKind,
    kind: legacyKind
  })
  const displayTitle = String(raw.displayTitle ?? raw.display_title ?? raw.title ?? '').trim()
    || (endDate && startDate && endDate !== startDate ? buildTrajectoryRangeTitle(startDate, endDate) : buildTraceDateTitle(pointDate, inferredKind))
  const title = String(raw.title || displayTitle).trim()
  if (!title) return null
  const offsetDays = normalizeNonNegativeInteger(raw.offsetDays ?? raw.offset_days, 0)
  const stepUnit = normalizeTraceStepUnit(raw.stepUnit ?? raw.step_unit, inferredKind)
  const stepAmount = Math.max(1, normalizeNonNegativeInteger(raw.stepAmount ?? raw.step_amount ?? spanYears, 1))
  const relatedEntityIds = normalizeTraceStringList(raw.relatedEntityIds ?? raw.related_entity_ids)
  const linkIds = normalizeTraceStringList(raw.linkIds ?? raw.link_ids).concat(relatedEntityIds)
  return {
    id,
    title,
    summary: String(raw.summary || '').trim(),
    subtitle: String(raw.subtitle ?? '').trim() || undefined,
    parentId: normalizeTraceParentId(raw.parentId ?? raw.parent_id),
    kind: inferredKind,
    nodeType,
    granularity: inferredKind,
    startDate: startDate || pointDate,
    endDate: nodeType === 'range' ? endDate : undefined,
    displayTitle,
    note: String(raw.note ?? raw.summary ?? '').trim(),
    innerEntries: normalizeTraceInnerEntries(raw.innerEntries ?? raw.inner_entries),
    linkIds: Array.from(new Set(linkIds)),
    autoGenerated: raw.autoGenerated === true || raw.autoGenerated === 'true' || raw.auto_generated === true || raw.auto_generated === 'true',
    systemRole: normalizeTraceSystemRole(raw.systemRole ?? raw.system_role),
    activationRule: normalizeArrangementActivationRule(raw.activationRule ?? raw.activation_rule),
    recallPolicy: normalizeArrangementRecallPolicy(raw.recallPolicy ?? raw.recall_policy),
    timeLabel: String(raw.timeLabel ?? raw.time_label ?? '').trim(),
    pointDate,
    offsetDays,
    ageLabel: String(raw.ageLabel ?? raw.age_label ?? (Number.isFinite(endAge) ? `${endAge}岁` : '')).trim(),
    stepUnit,
    stepAmount,
    spanYears,
    startAge,
    endAge,
    relatedEntityIds,
    tags: normalizeTraceStringList(raw.tags),
    content: String(raw.content || '').trim(),
    summaryMode: normalizeTraceSummaryMode(raw.summaryMode ?? raw.summary_mode),
    summarySourceNodeIds: normalizeTraceStringList(raw.summarySourceNodeIds ?? raw.summary_source_node_ids),
    confirmed: raw.confirmed !== false && raw.confirmed !== 'false',
    pendingReview: normalizePendingReview(raw.pendingReview ?? raw.pending_review),
    createdAt: String(raw.createdAt ?? raw.created_at ?? '').trim() || now,
    updatedAt: String(raw.updatedAt ?? raw.updated_at ?? '').trim() || now
  }
}

function normalizeTraceSystemRole(raw: unknown): CharacterBrainTraceNode['systemRole'] {
  const role = String(raw || '').trim()
  if (
    role === 'yearBranch'
    || role === 'monthBranch'
    || role === 'multiYearBranch'
    || role === 'dayLeaf'
    || role === 'freeGroup'
    || role === 'eventLeaf'
    || role === 'arrangementLeaf'
  ) return role
  return undefined
}

function normalizeArrangementActivationRule(raw: unknown): CharacterBrainTraceNode['activationRule'] {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const record = raw as Record<string, unknown>
  const rawRecurrence = String(record.recurrence || '').trim()
  const recurrence: NonNullable<CharacterBrainTraceNode['activationRule']>['recurrence'] = rawRecurrence === 'daily' || rawRecurrence === 'weekly' || rawRecurrence === 'monthly' || rawRecurrence === 'yearly' ? rawRecurrence : 'once'
  const date = normalizeTraceDateText(String(record.date || '').trim())
  const rule = {
    date: date || undefined,
    startTime: normalizeClockTime(record.startTime ?? record.start_time),
    endTime: normalizeClockTime(record.endTime ?? record.end_time),
    recurrence,
    prewarmMinutes: normalizeNonNegativeInteger(record.prewarmMinutes ?? record.prewarm_minutes, 0),
    graceMinutes: normalizeNonNegativeInteger(record.graceMinutes ?? record.grace_minutes, 0)
  }
  if (!rule.date && !rule.startTime && !rule.endTime && rule.recurrence === 'once' && !rule.prewarmMinutes && !rule.graceMinutes) return undefined
  return rule
}

function normalizeArrangementRecallPolicy(raw: unknown): CharacterBrainTraceNode['recallPolicy'] {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const record = raw as Record<string, unknown>
  const level = String(record.level || '').trim()
  const priority = String(record.priority || '').trim()
  return {
    level: level === 'body' ? 'body' : 'summary',
    priority: priority === 'must' ? 'must' : 'normal'
  }
}

function normalizeClockTime(raw: unknown): string | undefined {
  const text = String(raw || '').trim()
  const match = text.match(/^(\d{1,2}):(\d{1,2})$/)
  if (!match) return undefined
  const hour = Number(match[1])
  const minute = Number(match[2])
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return undefined
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

function buildTraceDateTitle(pointDate: string, kind: CharacterBrainTraceNodeKind) {
  void kind
  return buildTrajectoryPointTitle(pointDate)
}

function normalizePendingReview(raw: unknown): CharacterBrainPendingReview | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const record = raw as Record<string, unknown>
  const mode = String(record.mode || '').trim() === 'update' ? 'update' : 'create'
  const previous = normalizePendingNodeSnapshot(record.previous)
  return {
    mode,
    previous,
    reason: String(record.reason || '').trim() || undefined,
    createdBy: String(record.createdBy ?? record.created_by ?? '').trim() || undefined,
    createdAt: String(record.createdAt ?? record.created_at ?? '').trim() || undefined
  }
}

function normalizeTraceInnerEntries(raw: unknown): CharacterBrainTraceInnerEntry[] {
  if (!Array.isArray(raw)) return []
  const entries: CharacterBrainTraceInnerEntry[] = []
  raw
    .filter((item) => item && typeof item === 'object')
    .forEach((item, index) => {
      const record = item as Record<string, unknown>
      const granularity = normalizeTraceNodeKind(record.granularity ?? record.kind)
      const startDate = normalizeTraceDateText(String(record.startDate ?? record.start_date ?? '').trim())
      const endDate = normalizeTraceDateText(String(record.endDate ?? record.end_date ?? startDate).trim())
      if (!startDate) return
      const nodeType: 'single' | 'range' = String(record.nodeType ?? record.node_type ?? '').trim() === 'range' || (endDate && endDate !== startDate) ? 'range' : 'single'
      const displayTitle = String(record.displayTitle ?? record.display_title ?? '').trim()
        || (nodeType === 'range' ? buildTrajectoryRangeTitle(startDate, endDate) : buildTraceDateTitle(startDate, granularity))
      entries.push({
        id: String(record.id || `trace-inner:${index}:${startDate}:${endDate || startDate}`).trim(),
        nodeType,
        granularity,
        startDate,
        endDate: nodeType === 'range' ? endDate : undefined,
        displayTitle,
        note: String(record.note ?? '').trim(),
        content: String(record.content ?? '').trim(),
        linkIds: normalizeTraceStringList(record.linkIds ?? record.link_ids),
        sourceNodeIds: normalizeTraceStringList(record.sourceNodeIds ?? record.source_node_ids)
      })
    })
  return entries
}

function normalizePendingNodeSnapshot(raw: unknown): CharacterBrainPendingNodeSnapshot | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const record = raw as Record<string, unknown>
  return {
    title: String(record.title || '').trim(),
    summary: String(record.summary || '').trim(),
    content: String(record.content || '').trim() || undefined,
    timeLabel: String(record.timeLabel ?? record.time_label ?? '').trim() || undefined,
    pointDate: String(record.pointDate ?? record.point_date ?? '').trim() || undefined,
    ageLabel: String(record.ageLabel ?? record.age_label ?? '').trim() || undefined,
    relatedEntityIds: normalizeTraceStringList(record.relatedEntityIds ?? record.related_entity_ids),
    tags: normalizeTraceStringList(record.tags),
    sourceDocumentId: String(record.sourceDocumentId ?? record.source_document_id ?? '').trim() || undefined,
    sourceDisplayPath: String(record.sourceDisplayPath ?? record.source_display_path ?? '').trim() || undefined
  }
}

function normalizeCognitionNodeId(rawId: unknown, index: number) {
  const id = String(rawId || '').trim()
  if (id.startsWith(COGNITION_NODE_ID_PREFIX)) return id
  if (id) return `${COGNITION_NODE_ID_PREFIX}${id}`
  return `${COGNITION_NODE_ID_PREFIX}legacy_${index}`
}

function normalizeCognitionParentId(rawParentId: unknown) {
  const parentId = String(rawParentId || '').trim()
  if (!parentId || parentId === COGNITION_ID) return COGNITION_ID
  if (parentId.startsWith(COGNITION_NODE_ID_PREFIX)) return parentId
  return `${COGNITION_NODE_ID_PREFIX}${parentId}`
}

function normalizeCognitionNodeKind(kind: unknown): CharacterBrainCognitionNodeKind {
  const value = String(kind || '').trim()
  if (value === 'reference' || value === 'private' || value === 'relation') return value
  return 'group'
}

function normalizeRelationSubjectType(raw: unknown): 'user' | 'character' | undefined {
  const value = String(raw || '').trim()
  return value === 'user' || value === 'character' ? value : undefined
}

function normalizeTraceNodeId(rawId: unknown, index: number) {
  const id = String(rawId || '').trim()
  if (id.startsWith(TRACE_NODE_ID_PREFIX)) return id
  if (id) return `${TRACE_NODE_ID_PREFIX}${id}`
  return `${TRACE_NODE_ID_PREFIX}legacy_${index}`
}

function normalizeTraceParentId(rawParentId: unknown) {
  const parentId = String(rawParentId || '').trim()
  if (!parentId || parentId === TRACE_ROOT_NODE_ID) return TRACE_ROOT_NODE_ID
  if (parentId.startsWith(TRACE_NODE_ID_PREFIX)) return parentId
  return `${TRACE_NODE_ID_PREFIX}${parentId}`
}

function normalizeTraceNodeKind(kind: unknown): CharacterBrainTraceNodeKind {
  const value = String(kind || '').trim()
  if (value === 'multiYear') return value
  if (value === 'century' || value === 'decade' || value === 'year' || value === 'month') return value
  return 'day'
}

function normalizeTraceStepUnit(raw: unknown, kind: CharacterBrainTraceNodeKind): CharacterBrainTraceStepUnit {
  const value = String(raw || '').trim()
  if (value === 'day' || value === 'month' || value === 'year') return value
  return kind === 'day' || kind === 'month' ? kind : 'year'
}

function normalizeTraceSummaryMode(raw: unknown): CharacterBrainTraceSummaryMode {
  const value = String(raw || '').trim()
  if (value === 'ai_compact_pending' || value === 'ai_compacted') return value
  return 'manual'
}

function normalizeNonNegativeInteger(raw: unknown, fallback: number) {
  const value = Math.floor(Number(raw))
  if (!Number.isFinite(value)) return fallback
  return Math.max(0, value)
}

function normalizeTraceStringList(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map((item) => String(item || '').trim()).filter(Boolean)
  }
  if (typeof raw === 'string') {
    const parsed = parseJsonArray(raw)
    if (parsed) return parsed.map((item) => String(item || '').trim()).filter(Boolean)
    return raw.split(/[\n,，]/).map((item) => item.trim()).filter(Boolean)
  }
  return []
}

function normalizeTrajectoryViewOffsets(raw: unknown): Record<string, CharacterBrainNodeOffset> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const offsets: Record<string, CharacterBrainNodeOffset> = {}
  Object.entries(raw as Record<string, unknown>).forEach(([nodeId, value]) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return
    const x = Number((value as Record<string, unknown>).x)
    const y = Number((value as Record<string, unknown>).y)
    const normalizedId = String(nodeId || '').trim()
    if (!normalizedId || !Number.isFinite(x) || !Number.isFinite(y) || !isPersistableTrajectoryOffsetNodeId(normalizedId)) return
    if (Math.abs(x) > MAX_TRAJECTORY_OFFSET_ABS || Math.abs(y) > MAX_TRAJECTORY_OFFSET_ABS) return
    offsets[normalizedId] = { x, y }
  })
  return offsets
}

function isPersistableTrajectoryOffsetNodeId(nodeId: string) {
  const normalizedId = String(nodeId || '').trim()
  return normalizedId === TRACE_ROOT_NODE_ID || normalizedId.startsWith(TRACE_NODE_ID_PREFIX)
}

function normalizeTrajectoryRange(
  raw: unknown,
  birthDate: string,
  legacyEndDate?: string,
  legacyEndOffsetDays?: number
): CharacterBrainTrajectoryRange | undefined {
  const record = raw && typeof raw === 'object' && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : {}
  const fallbackStartDate = normalizeTraceDateText(String(birthDate || '').trim())
  const startDate = normalizeTraceDateText(String(record.startDate ?? record.start_date ?? fallbackStartDate).trim())
  const startOffsetDays = normalizeNonNegativeInteger(record.startOffsetDays ?? record.start_offset_days, 0)
  const endDate = normalizeTraceDateText(String(record.endDate ?? record.end_date ?? legacyEndDate ?? '').trim())
  const endOffsetDays = normalizeNonNegativeInteger(record.endOffsetDays ?? record.end_offset_days ?? legacyEndOffsetDays, 0)
  if (!startDate || !endDate) return undefined
  return {
    startDate,
    startOffsetDays,
    endDate,
    endOffsetDays
  }
}

function updateCharacterBrainTraceNode(
  nodes: CharacterBrainTraceNode[],
  nodeId: string,
  draft: Record<string, unknown>
): CharacterBrainTraceNode[] {
  const normalizedId = String(nodeId || '').trim()
  const updatedAt = new Date().toISOString()
  return nodes.map((node) => {
    if (node.id !== normalizedId) return node
    const isDayNode = node.kind === 'day' && node.granularity === 'day' && node.nodeType === 'single' && node.systemRole !== 'eventLeaf' && node.systemRole !== 'arrangementLeaf'
    const isSystemDateNode = isDayNode || node.systemRole === 'yearBranch' || node.systemRole === 'monthBranch' || node.systemRole === 'dayLeaf'
    const draftTitle = String(draft.documentTitle ?? '').trim()
    const nextSubtitle = String(draft.documentSubtitle ?? node.subtitle ?? '').trim()
    const nextSummary = String(draft[TRACE_FORM_KEYS.summary] ?? draft['compile.summary'] ?? node.summary ?? '').trim()
    const nextTags = normalizeTraceStringList(draft[TRACE_FORM_KEYS.tags] ?? draft['compile.tags'] ?? node.tags)
    const nextContent = String(draft[TRACE_FORM_KEYS.content] ?? draft.documentContent ?? node.content ?? '').trim()
    const arrangementPatch = node.systemRole === 'arrangementLeaf'
      ? buildArrangementDraftPatch(node, draft)
      : {}
    if (!isDayNode) {
      const nextTitle = isSystemDateNode ? resolveSystemTraceNodeTitle(node) : (draftTitle || node.title)
      return {
        ...node,
        title: nextTitle,
        displayTitle: nextTitle,
        subtitle: nextSubtitle || undefined,
        relatedEntityIds: normalizeTraceStringList(draft[TRACE_FORM_KEYS.relatedEntityIds] ?? node.relatedEntityIds),
        tags: nextTags,
        summary: nextSummary,
        note: nextSummary || String(node.note ?? '').trim(),
        content: nextContent,
        ...arrangementPatch,
        summaryMode: normalizeTraceSummaryMode(draft[TRACE_FORM_KEYS.summaryMode] ?? node.summaryMode),
        confirmed: node.confirmed === false ? false : true,
        updatedAt
      }
    }
    const pointDate = normalizeTraceDateDraft(draft[TRACE_FORM_KEYS.pointDate], node.pointDate)
    const ageLabel = String(draft[TRACE_FORM_KEYS.ageLabel] ?? node.ageLabel ?? '').trim()
    const offsetDays = normalizeTraceAgeDraft(draft[TRACE_FORM_KEYS.offsetDays], node.offsetDays)
    const stepUnit = normalizeTraceStepUnit(draft[TRACE_FORM_KEYS.stepUnit], node.kind)
    const stepAmount = Math.max(1, normalizeTraceAgeDraft(draft[TRACE_FORM_KEYS.stepAmount], node.stepAmount))
    const timeLabel = buildTracePointLabel({ pointDate, ageLabel, stepUnit, stepAmount })
    const nextTitle = draftTitle || resolveTraceNodeTitleFromDate(pointDate, node.kind) || node.title
    const immutableDateTitle = resolveTraceNodeTitleFromDate(pointDate, node.kind) || node.title
    return {
      ...node,
      title: isSystemDateNode ? immutableDateTitle : nextTitle,
      displayTitle: isSystemDateNode ? immutableDateTitle : nextTitle,
      subtitle: nextSubtitle || undefined,
      timeLabel,
      pointDate,
      startDate: pointDate,
      endDate: node.nodeType === 'range' ? node.endDate : undefined,
      offsetDays,
      ageLabel,
      stepUnit,
      stepAmount,
      relatedEntityIds: normalizeTraceStringList(draft[TRACE_FORM_KEYS.relatedEntityIds] ?? node.relatedEntityIds),
      linkIds: normalizeTraceStringList(draft[TRACE_FORM_KEYS.relatedEntityIds] ?? node.linkIds),
      tags: nextTags,
      summary: nextSummary,
      note: nextSummary || String(node.note ?? '').trim(),
      content: nextContent,
      ...arrangementPatch,
      summaryMode: normalizeTraceSummaryMode(draft[TRACE_FORM_KEYS.summaryMode] ?? node.summaryMode),
      confirmed: node.confirmed === false ? false : true,
      updatedAt
    }
  })
}

function buildArrangementDraftPatch(
  node: CharacterBrainTraceNode,
  draft: Record<string, unknown>
): Pick<CharacterBrainTraceNode, 'activationRule' | 'recallPolicy'> {
  const allDay = Boolean(draft['arrangement.allDay'])
  const date = normalizeTraceDateText(String(draft['arrangement.date'] ?? node.activationRule?.date ?? node.pointDate ?? node.startDate ?? '').trim())
  const startTime = allDay ? '' : normalizeArrangementTimeDraft(draft['arrangement.startTime'] ?? node.activationRule?.startTime)
  const endTime = allDay ? '' : normalizeArrangementTimeDraft(draft['arrangement.endTime'] ?? node.activationRule?.endTime)
  return {
    activationRule: {
      date,
      recurrence: normalizeArrangementRecurrenceDraft(draft['arrangement.recurrence'] ?? node.activationRule?.recurrence),
      ...(startTime ? { startTime } : {}),
      ...(endTime ? { endTime } : {}),
      prewarmMinutes: normalizeArrangementMinutesDraft(draft['arrangement.prewarmMinutes'] ?? node.activationRule?.prewarmMinutes),
      graceMinutes: normalizeArrangementMinutesDraft(draft['arrangement.graceMinutes'] ?? node.activationRule?.graceMinutes)
    },
    recallPolicy: {
      level: draft['arrangement.recallLevel'] === 'body' ? 'body' : 'summary',
      priority: draft['arrangement.recallPriority'] === 'must' ? 'must' : 'normal'
    }
  }
}

function normalizeArrangementTimeDraft(raw: unknown) {
  const value = String(raw || '').trim()
  return /^\d{2}:\d{2}$/.test(value) ? value : ''
}

function normalizeArrangementRecurrenceDraft(raw: unknown): NonNullable<CharacterBrainTraceNode['activationRule']>['recurrence'] {
  const value = String(raw || '').trim()
  return value === 'daily' || value === 'weekly' || value === 'monthly' || value === 'yearly' ? value : 'once'
}

function normalizeArrangementMinutesDraft(raw: unknown) {
  const value = Math.floor(Number(raw))
  return Number.isFinite(value) ? Math.max(0, Math.min(1440, value)) : 0
}

function resolveSystemTraceNodeTitle(node: CharacterBrainTraceNode) {
  const date = parseTrajectoryDateText(node.startDate || node.pointDate || '')
  if (node.systemRole === 'monthBranch' && date) return `${date.year}年${date.month}月`
  if (node.systemRole === 'yearBranch' && date) return `${date.year}年`
  if (node.systemRole === 'dayLeaf' && date) return buildTrajectoryPointTitle(node.pointDate || node.startDate)
  return node.title
}

function normalizeTraceDateDraft(raw: unknown, fallback: string) {
  const value = normalizeTraceDateText(String(raw ?? fallback ?? '').trim())
  return parseTraceDate(value) ? value : normalizeTraceDateText(String(fallback || '').trim())
}

function normalizeTraceAgeDraft(raw: unknown, fallback: number) {
  const value = Math.floor(Number(raw))
  if (!Number.isFinite(value)) return Math.max(0, Math.floor(Number(fallback) || 0))
  return Math.max(0, value)
}

function buildTracePointLabel(input: {
  pointDate: string
  ageLabel: string
  stepUnit: CharacterBrainTraceStepUnit
  stepAmount: number
}) {
  const stepText = input.stepAmount > 0
    ? `本次追加${input.stepAmount}${traceStepUnitLabel(input.stepUnit)}`
    : ''
  return [input.pointDate, input.ageLabel, stepText].filter(Boolean).join('｜')
}

function traceStepUnitLabel(unit: CharacterBrainTraceStepUnit) {
  if (unit === 'day') return '日'
  if (unit === 'month') return '个月'
  return '年'
}

function resolveTraceNodeTitleFromDate(dateText: string, kind: CharacterBrainTraceNodeKind = 'year') {
  void kind
  return buildTrajectoryPointTitle(dateText)
}

function setCharacterBrainNodeLinks(links: CharacterBrainLinkMap, nodeId: string, targetIds: string[]): CharacterBrainLinkMap {
  const normalizedNodeId = String(nodeId || '').trim()
  if (!normalizedNodeId) return links
  const nextLinks = makeCharacterBrainLinksBidirectional(links)
  const nextTargetIds = Array.from(new Set(targetIds.map((id) => String(id || '').trim()).filter((id) => id && id !== normalizedNodeId)))
  Object.keys(nextLinks).forEach((sourceId) => {
    if (sourceId === normalizedNodeId) return
    const keptTargetIds = (nextLinks[sourceId] || []).filter((targetId) => targetId !== normalizedNodeId)
    if (keptTargetIds.length) {
      nextLinks[sourceId] = keptTargetIds
    } else {
      delete nextLinks[sourceId]
    }
  })
  if (nextTargetIds.length) {
    nextLinks[normalizedNodeId] = nextTargetIds
    nextTargetIds.forEach((targetId) => {
      const current = nextLinks[targetId] || []
      nextLinks[targetId] = Array.from(new Set([...current, normalizedNodeId]))
    })
  } else {
    delete nextLinks[normalizedNodeId]
  }
  return nextLinks
}

function makeCharacterBrainLinksBidirectional(links: CharacterBrainLinkMap): CharacterBrainLinkMap {
  const nextLinks: CharacterBrainLinkMap = {}
  Object.entries(links).forEach(([sourceId, targetIds]) => {
    const normalizedSourceId = String(sourceId || '').trim()
    if (!normalizedSourceId) return
    targetIds.forEach((targetId) => {
      const normalizedTargetId = String(targetId || '').trim()
      if (!normalizedTargetId || normalizedTargetId === normalizedSourceId) return
      nextLinks[normalizedSourceId] = Array.from(new Set([...(nextLinks[normalizedSourceId] || []), normalizedTargetId]))
      nextLinks[normalizedTargetId] = Array.from(new Set([...(nextLinks[normalizedTargetId] || []), normalizedSourceId]))
    })
  })
  return nextLinks
}

function setCharacterBrainDocument(documents: Record<string, string>, nodeId: string, content: string): Record<string, string> {
  const normalizedNodeId = String(nodeId || '').trim()
  if (!normalizedNodeId) return documents
  const nextDocuments = { ...documents }
  const nextContent = String(content || '')
  if (nextContent.trim()) {
    nextDocuments[normalizedNodeId] = nextContent
  } else {
    delete nextDocuments[normalizedNodeId]
  }
  return nextDocuments
}

function normalizeLinkIds(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map((item) => String(item || '').trim()).filter(Boolean)
  if (typeof raw === 'string') {
    const parsed = parseJsonArray(raw)
    if (parsed) return parsed.map((item) => String(item || '').trim()).filter(Boolean)
    return raw.split(/[\n,，]/).map((item) => item.trim()).filter(Boolean)
  }
  return []
}

function parseJsonRecord(input: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(input)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {}
  } catch {
    return {}
  }
}

function parseJsonArray(input: string): unknown[] | null {
  try {
    const parsed = JSON.parse(input)
    return Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

function buildFieldDraftObjectChanges(fieldKey: CharacterBrainFieldKey | undefined, input: Record<string, unknown>): CharacterPersistedChanges {
  const changes: CharacterPersistedChanges = {}
  Object.entries(input).forEach(([key, rawValue]) => {
    if (key === 'linkTargetIds' || key === 'linkText' || key === 'documentContent' || key.startsWith('compile.')) return
    const itemChanges = buildSingleFieldChange(key as CharacterBrainFieldKey, String(rawValue ?? ''))
    Object.assign(changes, itemChanges)
  })
  if (Object.keys(changes).length) return changes
  return {}
}

function buildSingleFieldChange(fieldKey: CharacterBrainFieldKey, value: string): CharacterPersistedChanges {
  switch (fieldKey) {
    case 'avatarPath':
      return { avatar: value, avatarPath: value }
    case 'defaultPreset':
      return { defaultPreset: value, default_preset: value }
    case 'defaultModel':
      return { defaultModel: value, default_model: value }
    case 'speakingStyle':
      return { speakingStyle: value, speaking_style: value }
    case 'nicknames':
      return { nicknames: parseNicknamesDraft(value) }
    case 'name':
    case 'gender':
    case 'age':
    case 'emoji':
    case 'appearance':
    case 'outfit':
    case 'personality':
    case 'hobbies':
    case 'abilities':
    case 'experience':
    case 'worldview':
    case 'background':
    case 'desc':
      return { [fieldKey]: value }
    default:
      return {}
  }
}

function fieldLabel(fieldKey: CharacterBrainFieldKey) {
  switch (fieldKey) {
    case 'name': return '姓名'
    case 'gender': return '性别'
    case 'age': return '年龄'
    case 'emoji': return 'Emoji'
    case 'avatarPath': return '头像路径'
    case 'defaultPreset': return '默认预设'
    case 'defaultModel': return '默认模型'
    case 'appearance': return '外貌特征'
    case 'speakingStyle': return '说话风格'
    case 'outfit': return '穿着'
    case 'personality': return '性格'
    case 'hobbies': return '爱好'
    case 'abilities': return '能力'
    case 'experience': return '经历'
    case 'worldview': return '世界观'
    case 'background': return '背景故事'
    case 'desc': return '简介'
    case 'nicknames': return '昵称'
    default: return '内容'
  }
}

function buildFieldDraftChanges(fieldKey: CharacterBrainFieldKey | undefined, input: string): CharacterPersistedChanges {
  const value = stripHeading(input)
  switch (fieldKey) {
    case 'name':
      return { name: stripLeadingLabel(value, '姓名') }
    case 'gender':
      return { gender: stripLeadingLabel(value, '性别') }
    case 'age':
      return { age: stripLeadingLabel(value, '年龄') }
    case 'emoji':
      return { emoji: stripLeadingLabel(value, 'Emoji') }
    case 'avatarPath': {
      const avatarPath = stripLeadingLabel(value, '头像路径')
      return { avatar: avatarPath, avatarPath }
    }
    case 'defaultPreset': {
      const defaultPreset = stripLeadingLabel(value, '默认预设')
      return { defaultPreset, default_preset: defaultPreset }
    }
    case 'defaultModel': {
      const defaultModel = stripLeadingLabel(value, '默认模型')
      return { defaultModel, default_model: defaultModel }
    }
    case 'appearance':
      return { appearance: value }
    case 'speakingStyle': {
      const speakingStyle = value
      return { speakingStyle, speaking_style: speakingStyle }
    }
    case 'outfit':
      return { outfit: value }
    case 'personality':
      return { personality: value }
    case 'hobbies':
      return { hobbies: value }
    case 'abilities':
      return { abilities: value }
    case 'experience':
      return { experience: value }
    case 'worldview':
      return { worldview: value }
    case 'background':
      return { background: value }
    case 'desc':
      return { desc: value }
    case 'nicknames':
      return { nicknames: parseNicknamesDraft(input) }
    default:
      return {}
  }
}

function parseBasicInfoDraft(input: string): CharacterPersistedChanges {
  const lines = input.split(/\r?\n/)
  const name = readField(lines, '姓名')
  const gender = readField(lines, '性别')
  const age = readField(lines, '年龄')
  const nicknames = readField(lines, '昵称')
  const descIndex = lines.findIndex((line) => line.trim() === '## 简介')
  const desc = descIndex >= 0 ? lines.slice(descIndex + 1).join('\n').trim() : ''
  return {
    name,
    gender,
    age,
    nicknames: normalizeNicknamesInput(nicknames),
    desc
  }
}

function parsePresetDraft(input: string): CharacterPersistedChanges {
  const lines = input.split(/\r?\n/)
  const defaultPreset = readField(lines, '默认预设')
  const defaultModel = readField(lines, '默认模型')
  return {
    defaultPreset,
    default_preset: defaultPreset,
    defaultModel,
    default_model: defaultModel
  }
}

function parseAvatarDraft(input: string): CharacterPersistedChanges {
  const lines = input.split(/\r?\n/)
  const emoji = readField(lines, 'Emoji')
  const avatarPath = readField(lines, '头像路径')
  return {
    emoji,
    avatar: avatarPath,
    avatarPath
  }
}

function parseNicknamesDraft(input: string): string[] {
  return input
    .split(/\r?\n/)
    .map((line) => line.replace(/^-\s*/, '').trim())
    .filter((line) => line && !line.startsWith('#') && line !== '还没有设置昵称')
}

function parseNicknames(character: Character | CharacterDraftSource): string[] {
  return normalizeNicknamesInput(character.nicknames)
}

function normalizeNicknamesInput(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map((item) => String(item || '').trim()).filter(Boolean)
  }
  return String(raw || '')
    .split(/[,\n，]/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function normalizeArrayLike(raw: unknown) {
  if (Array.isArray(raw)) return raw
  return []
}

function normalizeObjectLike<T>(raw: unknown, fallback: T) {
  if (raw && typeof raw === 'object') return raw
  return fallback
}

function isEditableFieldKey(fieldKey?: CharacterBrainFieldKey) {
  return Boolean(fieldKey)
}

function readField(lines: string[], label: string) {
  const line = lines.find((item) => item.trim().startsWith(`${label}：`) || item.trim().startsWith(`${label}:`))
  return stripLeadingLabel(line || '', label)
}

function stripLeadingLabel(input: string, label: string) {
  const raw = String(input || '').trim()
  return raw.replace(new RegExp(`^${label}[：:]\\s*`), '').trim()
}

function stripHeading(input: string) {
  return input
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith('#'))
    .join('\n')
    .trim()
}
