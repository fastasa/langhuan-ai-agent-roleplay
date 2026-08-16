import type { Character } from '../types'
import type {
  CharacterBrainCognitionNode,
  CharacterBrainFieldKey,
  CharacterBrainPendingNodeSnapshot,
  CharacterBrainWriteBackDraft,
  CharacterBrainWriteBackOutcome,
  CharacterBrainTraceNode
} from '../types/characterBrain'
import {
  buildCharacterBrainCompilePageChange,
  buildCharacterBrainCognitionNodesChange,
  buildCharacterBrainTraceNodesChange,
  buildCharacterBrainTrajectoryMetaChange,
  readCharacterBrainDocuments,
  readCharacterBrainCognitionNodes,
  readCharacterBrainTraceNodes,
  readCharacterBrainTrajectoryMeta
} from './characterBrain'
import {
  addTrajectoryDays,
  buildTrajectoryCalendarRule,
  buildTrajectoryPointTitle,
  formatTrajectoryDateText,
  parseTrajectoryDateText,
  sortTrajectoryNodes
} from './trajectoryCalendar'
import {
  buildTraceDayCreatePlan,
  buildTraceMonthCreatePlan,
  buildTraceYearCreatePlan,
  type TraceDayCreatePlanItem,
  type TraceMonthCreatePlanItem,
  type TraceYearCreatePlanItem
} from './trajectoryCreateSelection'

export type CharacterBrainTreeNodeRole =
  | 'characterRoot'
  | 'sectionRoot'
  | 'coreGroup'
  | 'coreField'
  | 'soulNode'
  | 'traceDay'
  | 'traceGroup'
  | 'traceEvent'
  | 'traceArrangement'

export type CharacterBrainTreeSection = 'core' | 'soul' | 'trace'

export type CharacterBrainTreeWriteScope =
  | 'characterField'
  | 'brainCognitionNodes'
  | 'brainTraceNodes'
  | 'none'

export type CharacterBrainTraceMigrationStep =
  | 'preserve_day_node'
  | 'convert_non_day_to_group'
  | 'split_range_to_day_children_or_keep_group_summary'
  | 'promote_inner_entries_to_child_units'

export interface CharacterBrainTreeNode {
  nodeId: string
  sourceId: string
  title: string
  role: CharacterBrainTreeNodeRole
  section?: CharacterBrainTreeSection
  parentId?: string
  orderIndex: number
  writeScope: CharacterBrainTreeWriteScope
  fieldKey?: CharacterBrainFieldKey
  source?: CharacterBrainCognitionNode | CharacterBrainTraceNode
}

export interface CharacterBrainTreeWriteBinding {
  nodeId: string
  writeScope: CharacterBrainTreeWriteScope
  fieldKey?: CharacterBrainFieldKey
  targetKeys: string[]
  sourceCollection?: 'brainCognitionNodes' | 'brainTraceNodes'
  sourceId?: string
}

export interface CharacterBrainTraceMigrationPlanItem {
  sourceId: string
  title: string
  currentKind: CharacterBrainTraceNode['kind']
  currentNodeType: CharacterBrainTraceNode['nodeType']
  currentGranularity: CharacterBrainTraceNode['granularity']
  targetRole: 'traceDay' | 'traceGroup'
  steps: CharacterBrainTraceMigrationStep[]
  innerEntryCount: number
  parentSourceId: string
}

export interface CharacterBrainTreeModel {
  characterId: string
  rootId: string
  sectionIds: Record<CharacterBrainTreeSection, string>
  nodes: CharacterBrainTreeNode[]
  writeBindings: CharacterBrainTreeWriteBinding[]
  traceMigrationPlan: CharacterBrainTraceMigrationPlanItem[]
}

export interface CharacterBrainSoulNodeDraft {
  id: string
  title: string
  summary?: string
  parentId?: string
  kind?: CharacterBrainCognitionNode['kind']
  // 关系认知节点(kind='relation')专用：正文存关系画像 JSON，subject 标识认知对象
  content?: string
  subjectType?: CharacterBrainCognitionNode['subjectType']
  subjectId?: string
  sourceDocumentId?: string
  sourceDisplayPath?: string
  now: string
}

export interface CharacterBrainTraceDayDraft {
  id: string
  title?: string
  subtitle?: string
  date: string
  summary?: string
  content?: string
  parentId?: string
  relatedEntityIds?: string[]
  tags?: string[]
  linkIds?: string[]
  now: string
}

export interface CharacterBrainTraceGroupDraft {
  id: string
  title: string
  summary?: string
  content?: string
  parentId?: string
  startDate?: string
  endDate?: string
  kind?: Exclude<CharacterBrainTraceNode['kind'], 'day'>
  relatedEntityIds?: string[]
  tags?: string[]
  linkIds?: string[]
  now: string
}

export interface CharacterBrainNextTraceDayDraft {
  targetDate?: string
  subtitle?: string
  summary?: string
  content?: string
  relatedEntityIds?: string[]
  tags?: string[]
  linkIds?: string[]
  now: string
}

export interface CharacterBrainTraceEventDraft {
  id: string
  title: string
  summary?: string
  content?: string
  parentId: string
  relatedEntityIds?: string[]
  tags?: string[]
  linkIds?: string[]
  now: string
}

export interface CharacterBrainTraceArrangementDraft extends CharacterBrainTraceEventDraft {
  activationRule?: CharacterBrainTraceNode['activationRule']
  recallPolicy?: CharacterBrainTraceNode['recallPolicy']
}

export type CharacterBrainTraceBranchKind = 'month' | 'year' | 'multiYear'

export interface CharacterBrainTraceBranchDraft {
  kind: CharacterBrainTraceBranchKind
  year: number
  month?: number
  spanYears?: number
  parentId?: string
  now: string
}

export type CharacterBrainNextTraceDayResult =
  | {
    ok: true
    changes: Record<string, unknown>
    createdNodeId: string
    createdDate: string
    yearNodeId: string
    monthNodeId: string
  }
  | { ok: false; message: string }

export type CharacterBrainTraceBranchResult =
  | {
    ok: true
    changes: Record<string, unknown>
    createdNodeId: string
    createdRange: { startDate: string; endDate: string }
  }
  | { ok: false; message: string }

export interface CharacterBrainTraceBatchCreateDraft {
  granularity: 'day' | 'month' | 'year'
  years?: Array<number | string>
  year?: number | string
  months?: Array<number | string>
  dates?: string[]
  minDate?: string
  maxDate?: string
  subtitle?: string
  summary?: string
  content?: string
  relatedEntityIds?: string[]
  tags?: string[]
  linkIds?: string[]
  now: string
}

export type CharacterBrainTraceBatchCreateItem =
  | { kind: 'multiYear'; nodeId: string; year: number; spanYears: number; skipped?: boolean }
  | { kind: 'year'; nodeId: string; year: number; skipped?: boolean }
  | { kind: 'month'; nodeId: string; year: number; month: number; skipped?: boolean }
  | { kind: 'day'; nodeId: string; date: string; skipped?: boolean }

export type CharacterBrainTraceBatchCreateResult =
  | {
    ok: true
    changes: Record<string, unknown>
    createdItems: CharacterBrainTraceBatchCreateItem[]
    skippedItems: CharacterBrainTraceBatchCreateItem[]
  }
  | { ok: false; message: string }

export interface CharacterBrainTraceMigrationResult {
  nodes: CharacterBrainTraceNode[]
  changes: Record<string, unknown>
  migratedSourceIds: string[]
}

export interface CharacterBrainPendingWriteBackApplyOptions {
  now?: string
  createdBy?: string
  idFactory?: (target: CharacterBrainWriteBackOutcome['target'], outcome: CharacterBrainWriteBackOutcome) => string
}

const CORE_FIELDS: Array<{
  fieldKey: CharacterBrainFieldKey
  title: string
  groupKey: string
  orderIndex: number
}> = [
  { fieldKey: 'desc', title: '简介', groupKey: 'core', orderIndex: 0 },
  { fieldKey: 'personality', title: '性格', groupKey: 'core', orderIndex: 1 },
  { fieldKey: 'defaultPreset', title: '默认预设', groupKey: 'preset', orderIndex: 0 },
  { fieldKey: 'defaultModel', title: '默认模型', groupKey: 'preset', orderIndex: 1 },
  { fieldKey: 'appearance', title: '外貌特征', groupKey: 'detailInfo', orderIndex: 0 },
  { fieldKey: 'speakingStyle', title: '说话风格', groupKey: 'detailInfo', orderIndex: 1 },
  { fieldKey: 'outfit', title: '穿着', groupKey: 'detailInfo', orderIndex: 2 },
  { fieldKey: 'hobbies', title: '爱好', groupKey: 'detailInfo', orderIndex: 3 },
  { fieldKey: 'abilities', title: '能力', groupKey: 'detailInfo', orderIndex: 4 },
  { fieldKey: 'experience', title: '经历', groupKey: 'detailInfo', orderIndex: 5 },
  { fieldKey: 'worldview', title: '世界观', groupKey: 'detailInfo', orderIndex: 6 },
  { fieldKey: 'background', title: '背景故事', groupKey: 'detailInfo', orderIndex: 7 },
  { fieldKey: 'emoji', title: 'Emoji', groupKey: 'avatar', orderIndex: 0 },
  { fieldKey: 'avatarPath', title: '头像路径', groupKey: 'avatar', orderIndex: 1 },
  { fieldKey: 'name', title: '姓名', groupKey: 'systemInfo', orderIndex: 2 },
  { fieldKey: 'gender', title: '性别', groupKey: 'systemInfo', orderIndex: 3 },
  { fieldKey: 'age', title: '年龄', groupKey: 'systemInfo', orderIndex: 4 },
  { fieldKey: 'nicknames', title: '昵称', groupKey: 'systemInfo', orderIndex: 5 }
]

const CORE_GROUPS: Array<{
  groupKey: string
  title: string
  orderIndex: number
  parentGroupKey?: string
}> = [
  { groupKey: 'detailInfo', title: '详细信息', orderIndex: 3 },
  { groupKey: 'systemInfo', title: '系统信息', orderIndex: 4 },
  { groupKey: 'avatar', title: '头像', orderIndex: 0, parentGroupKey: 'systemInfo' },
  { groupKey: 'preset', title: '预设', orderIndex: 1, parentGroupKey: 'systemInfo' }
]

const CORE_DOCUMENTS: Array<{
  sourceId: string
  title: string
  orderIndex: number
}> = [
  { sourceId: 'brain:goal_value', title: '目标与价值', orderIndex: 2 }
]

export function buildCharacterBrainTreeModel(character: Character): CharacterBrainTreeModel {
  const characterId = String(character.id || '').trim() || 'unknown'
  const rootId = buildCharacterRootId(characterId)
  const sectionIds = {
    core: buildSectionId(characterId, 'core'),
    soul: buildSectionId(characterId, 'soul'),
    trace: buildSectionId(characterId, 'trace')
  }
  const nodes: CharacterBrainTreeNode[] = [
    {
      nodeId: rootId,
      sourceId: characterId,
      title: character.name || '未命名角色',
      role: 'characterRoot',
      orderIndex: 0,
      writeScope: 'none'
    },
    createSectionNode(sectionIds.core, rootId, '核心', 'core', 0),
    createSectionNode(sectionIds.soul, rootId, '灵魂', 'soul', 1),
    createSectionNode(sectionIds.trace, rootId, '轨迹', 'trace', 2)
  ]
  const writeBindings: CharacterBrainTreeWriteBinding[] = []

  CORE_GROUPS.forEach((group) => {
    const nodeId = buildCoreGroupNodeId(characterId, group.groupKey)
    nodes.push({
      nodeId,
      sourceId: group.groupKey,
      title: group.title,
      role: 'coreGroup',
      section: 'core',
      parentId: group.parentGroupKey ? buildCoreGroupNodeId(characterId, group.parentGroupKey) : sectionIds.core,
      orderIndex: group.orderIndex,
      writeScope: 'none'
    })
    getCoreGroupBoundFieldKeys(group.groupKey).forEach((fieldKey) => {
      writeBindings.push({
        nodeId,
        writeScope: 'characterField',
        fieldKey,
        targetKeys: getCoreFieldTargetKeys(fieldKey)
      })
    })
  })

  CORE_FIELDS.forEach((field) => {
    if (['avatar', 'preset'].includes(field.groupKey)) return
    const nodeId = buildCoreFieldNodeId(characterId, field.fieldKey)
    nodes.push({
      nodeId,
      sourceId: field.fieldKey,
      title: field.title,
      role: 'coreField',
      section: 'core',
      parentId: field.groupKey === 'core' ? sectionIds.core : buildCoreGroupNodeId(characterId, field.groupKey),
      orderIndex: field.orderIndex,
      writeScope: 'characterField',
      fieldKey: field.fieldKey
    })
    writeBindings.push({
      nodeId,
      writeScope: 'characterField',
      fieldKey: field.fieldKey,
      targetKeys: getCoreFieldTargetKeys(field.fieldKey)
    })
  })

  CORE_DOCUMENTS.forEach((documentUnit) => {
    nodes.push({
      nodeId: buildCoreDocumentNodeId(characterId, documentUnit.sourceId),
      sourceId: documentUnit.sourceId,
      title: documentUnit.title,
      role: 'coreField',
      section: 'core',
      parentId: sectionIds.core,
      orderIndex: documentUnit.orderIndex,
      writeScope: 'none'
    })
  })

  const cognitionNodes = readCharacterBrainCognitionNodes(character)
  const cognitionNodeIds = new Set(cognitionNodes.map((node) => node.id))
  cognitionNodes.forEach((node, index) => {
    const nodeId = buildSoulNodeId(characterId, node.id)
    const parentId = node.parentId && cognitionNodeIds.has(node.parentId)
      ? buildSoulNodeId(characterId, node.parentId)
      : sectionIds.soul
    nodes.push({
      nodeId,
      sourceId: node.id,
      title: node.title,
      role: 'soulNode',
      section: 'soul',
      parentId,
      orderIndex: index,
      writeScope: 'brainCognitionNodes',
      source: node
    })
    writeBindings.push({
      nodeId,
      writeScope: 'brainCognitionNodes',
      targetKeys: ['brainCognitionNodes', 'brain_cognition_nodes'],
      sourceCollection: 'brainCognitionNodes',
      sourceId: node.id
    })
  })

  const traceNodes = readCharacterBrainTraceNodes(character)
  const traceNodeIdBySourceId = new Map(traceNodes.map((node) => [node.id, buildTraceNodeId(characterId, node)]))
  const traceMigrationPlan: CharacterBrainTraceMigrationPlanItem[] = []
  traceNodes.forEach((node, index) => {
    const nodeId = traceNodeIdBySourceId.get(node.id) || buildTraceNodeId(characterId, node)
    const parentId = node.parentId && traceNodeIdBySourceId.has(node.parentId)
      ? traceNodeIdBySourceId.get(node.parentId)
      : sectionIds.trace
    const role = resolveTraceTreeNodeRole(node)
    nodes.push({
      nodeId,
      sourceId: node.id,
      title: node.title || node.displayTitle || node.pointDate || node.startDate,
      role,
      section: 'trace',
      parentId,
      orderIndex: index,
      writeScope: 'brainTraceNodes',
      source: node
    })
    writeBindings.push({
      nodeId,
      writeScope: 'brainTraceNodes',
      targetKeys: ['brainTraceNodes', 'brain_trace_nodes'],
      sourceCollection: 'brainTraceNodes',
      sourceId: node.id
    })
    traceMigrationPlan.push(buildTraceMigrationPlanItem(node))
  })

  return {
    characterId,
    rootId,
    sectionIds,
    nodes,
    writeBindings,
    traceMigrationPlan
  }
}

export function isFormalTraceDayNode(node: CharacterBrainTraceNode): boolean {
  return node.systemRole === 'dayLeaf'
    || (
      node.kind === 'day'
      && node.granularity === 'day'
      && node.nodeType === 'single'
      && node.systemRole !== 'eventLeaf'
      && node.systemRole !== 'arrangementLeaf'
    )
}

export function getCoreFieldTargetKeys(fieldKey: CharacterBrainFieldKey): string[] {
  switch (fieldKey) {
    case 'avatarPath':
      return ['avatar', 'avatarPath']
    case 'defaultPreset':
      return ['defaultPreset', 'default_preset']
    case 'defaultModel':
      return ['defaultModel', 'default_model']
    case 'speakingStyle':
      return ['speakingStyle', 'speaking_style']
    case 'nicknames':
      return ['nicknames']
    default:
      return [fieldKey]
  }
}

function getCoreGroupBoundFieldKeys(groupKey: string): CharacterBrainFieldKey[] {
  if (groupKey === 'avatar') return ['emoji', 'avatarPath']
  if (groupKey === 'preset') return ['defaultPreset', 'defaultModel']
  return []
}

export function buildCharacterBrainTreeCoreFieldChange(fieldKey: CharacterBrainFieldKey, value: unknown): Record<string, unknown> {
  const normalizedValue = fieldKey === 'nicknames'
    ? normalizeStringList(value)
    : String(value ?? '').trim()
  return getCoreFieldTargetKeys(fieldKey).reduce((changes, key) => {
    changes[key] = normalizedValue
    return changes
  }, {} as Record<string, unknown>)
}

export function createCharacterBrainSoulTreeNode(character: Character, draft: CharacterBrainSoulNodeDraft): Record<string, unknown> {
  const nodes = readCharacterBrainCognitionNodes(character)
  const parentId = resolveSoulParentId(nodes, draft.parentId)
  const nextNode: CharacterBrainCognitionNode = {
    id: String(draft.id || '').trim(),
    title: String(draft.title || '未命名灵魂节点').trim(),
    summary: String(draft.summary || '').trim(),
    parentId,
    kind: draft.kind || 'private',
    // 关系认知节点专用字段，普通节点不传时为 undefined，不影响现有行为
    content: normalizeOptionalText(draft.content),
    subjectType: draft.subjectType,
    subjectId: normalizeOptionalText(draft.subjectId),
    sourceDocumentId: normalizeOptionalText(draft.sourceDocumentId),
    sourceDisplayPath: normalizeOptionalText(draft.sourceDisplayPath),
    createdAt: draft.now,
    updatedAt: draft.now
  }
  return buildCharacterBrainCognitionNodesChange([...nodes.filter((node) => node.id !== nextNode.id), nextNode])
}

export function updateCharacterBrainSoulTreeNode(
  character: Character,
  nodeId: string,
  patch: Partial<Omit<CharacterBrainSoulNodeDraft, 'id' | 'now'>> & { now: string }
): Record<string, unknown> {
  const nodes = readCharacterBrainCognitionNodes(character)
  const targetId = String(nodeId || '').trim()
  const nextNodes = nodes.map((node) => {
    if (node.id !== targetId) return node
    return {
      ...node,
      title: patch.title === undefined ? node.title : String(patch.title || node.title).trim(),
      summary: patch.summary === undefined ? node.summary : String(patch.summary || '').trim(),
      parentId: patch.parentId === undefined ? node.parentId : resolveSoulParentId(nodes, patch.parentId, targetId),
      kind: patch.kind || node.kind,
      sourceDocumentId: patch.sourceDocumentId === undefined ? node.sourceDocumentId : normalizeOptionalText(patch.sourceDocumentId),
      sourceDisplayPath: patch.sourceDisplayPath === undefined ? node.sourceDisplayPath : normalizeOptionalText(patch.sourceDisplayPath),
      updatedAt: patch.now
    }
  })
  return buildCharacterBrainCognitionNodesChange(nextNodes)
}

export function moveCharacterBrainSoulTreeNode(character: Character, nodeId: string, parentId: string, now: string): Record<string, unknown> {
  return updateCharacterBrainSoulTreeNode(character, nodeId, { parentId, now })
}

export function deleteCharacterBrainSoulTreeNode(character: Character, nodeId: string): Record<string, unknown> {
  const nodes = readCharacterBrainCognitionNodes(character)
  const targetId = String(nodeId || '').trim()
  const deletedIds = collectDescendantIds(nodes, targetId)
  return buildCharacterBrainCognitionNodesChange(nodes.filter((node) => !deletedIds.has(node.id)))
}

export function createCharacterBrainTraceDayTreeNode(character: Character, draft: CharacterBrainTraceDayDraft): Record<string, unknown> {
  const nodes = readCharacterBrainTraceNodes(character)
  const nextNode = buildTraceDayNode(draft, resolveTraceParentId(nodes, draft.parentId), readBirthDate(character))
  return buildCharacterBrainTraceNodesChange(sortTrajectoryNodes([
    ...nodes.filter((node) => node.id !== nextNode.id),
    nextNode
  ]))
}

export function createCharacterBrainTraceEventTreeNode(character: Character, draft: CharacterBrainTraceEventDraft): Record<string, unknown> {
  return createCharacterBrainTraceChildDocumentNode(character, draft, 'eventLeaf')
}

export function createCharacterBrainTraceArrangementTreeNode(character: Character, draft: CharacterBrainTraceArrangementDraft): Record<string, unknown> {
  return createCharacterBrainTraceChildDocumentNode(character, draft, 'arrangementLeaf')
}

function resolveTraceTreeNodeRole(node: CharacterBrainTraceNode): CharacterBrainTreeNodeRole {
  if (node.systemRole === 'eventLeaf') return 'traceEvent'
  if (node.systemRole === 'arrangementLeaf') return 'traceArrangement'
  return isFormalTraceDayNode(node) ? 'traceDay' : 'traceGroup'
}

export function createNextCharacterBrainTraceDayTreeNode(
  character: Character,
  draft: CharacterBrainNextTraceDayDraft
): CharacterBrainNextTraceDayResult {
  const meta = readCharacterBrainTrajectoryMeta(character)
  const calendar = buildTrajectoryCalendarRule(meta.calendarId, meta.calendarConfig)
  const birthDate = parseTrajectoryDateText(meta.birthDate, calendar)
  if (!birthDate) return { ok: false, message: '先在轨迹根节点设置角色出生日期。' }

  const nodes = readCharacterBrainTraceNodes(character)
  const dayNodes = sortTrajectoryNodes(nodes.filter(isFormalTraceDayNode))
  const requestedDate = parseTrajectoryDateText(String(draft.targetDate || '').trim(), calendar)
  const nextDate = requestedDate
    ? { ok: true as const, date: requestedDate }
    : resolveDefaultNextTraceDate(dayNodes, birthDate, calendar)
  if (!nextDate.ok) return { ok: false, message: nextDate.message }

  const pointDate = formatTrajectoryDateText(nextDate.date)
  if (compareTrajectoryDate(nextDate.date, birthDate) < 0) {
    return { ok: false, message: '新建日桠不能早于角色出生日期。' }
  }
  if (nextDate.date.month > calendar.monthsInYear(nextDate.date.year)) {
    return { ok: false, message: '目标日期超出当前轨迹日历的月份范围。' }
  }
  if (nextDate.date.day > calendar.daysInMonth(nextDate.date.year, nextDate.date.month)) {
    return { ok: false, message: '目标日期超出当前轨迹日历的月份天数。' }
  }
  if (nodes.some((node) => isFormalTraceDayNode(node) && (node.pointDate || node.startDate) === pointDate)) {
    return { ok: false, message: '目标日期的日桠已存在，不能重复创建。' }
  }

  const now = draft.now
  const yearNode = buildSystemTraceYearNode(nextDate.date.year, now, meta.birthDate, calendar)
  const monthNode = buildSystemTraceMonthNode(nextDate.date.year, nextDate.date.month, now, meta.birthDate, calendar)
  const dayNode = buildTraceDayNode({
    id: buildSystemTraceDayNodeId(pointDate),
    date: pointDate,
    subtitle: draft.subtitle ?? draft.summary,
    summary: draft.summary ?? draft.subtitle,
    content: draft.content,
    relatedEntityIds: draft.relatedEntityIds,
    tags: draft.tags,
    linkIds: draft.linkIds,
    now
  }, monthNode.id, meta.birthDate, calendar)
  const nextNodes = upsertTraceNodes(nodes, [yearNode, monthNode, dayNode])
  const sortedNodes = sortTrajectoryNodes(nextNodes)
  const coverageEndOffsetDays = calculateOffsetDays(meta.birthDate, pointDate, calendar)
  const changes = {
    ...buildCharacterBrainTraceNodesChange(sortedNodes),
    ...buildCharacterBrainTrajectoryMetaChange({
      ...meta,
      coverageRange: {
        startDate: meta.birthDate,
        startOffsetDays: 0,
        endDate: pointDate,
        endOffsetDays: coverageEndOffsetDays
      },
      coverageEndDate: pointDate,
      coverageEndOffsetDays
    })
  }
  return {
    ok: true,
    changes,
    createdNodeId: dayNode.id,
    createdDate: pointDate,
    yearNodeId: yearNode.id,
    monthNodeId: monthNode.id
  }
}

export function createCharacterBrainTraceBranchTreeNode(
  character: Character,
  draft: CharacterBrainTraceBranchDraft
): CharacterBrainTraceBranchResult {
  const meta = readCharacterBrainTrajectoryMeta(character)
  const calendar = buildTrajectoryCalendarRule(meta.calendarId, meta.calendarConfig)
  const birthDate = parseTrajectoryDateText(meta.birthDate, calendar)
  if (!birthDate) return { ok: false, message: '先在轨迹根节点设置角色出生日期。' }

  const year = Math.max(0, Math.floor(Number(draft.year) || 0))
  if (!year) return { ok: false, message: '先选择要创建的年份。' }
  const now = draft.now
  const nodes = readCharacterBrainTraceNodes(character)

  if (draft.kind === 'month') {
    const month = Math.max(0, Math.floor(Number(draft.month) || 0))
    if (month < 1 || month > calendar.monthsInYear(year)) {
      return { ok: false, message: '目标月份超出当前轨迹日历范围。' }
    }
    const yearNode = buildSystemTraceYearNode(year, now, meta.birthDate, calendar)
    const existingYearNode = nodes.find((node) => node.id === yearNode.id)
    const monthNode = buildSystemTraceMonthNode(year, month, now, meta.birthDate, calendar)
    const nextNodes = upsertTraceNodes(nodes, [existingYearNode || yearNode, monthNode])
    return {
      ok: true,
      changes: buildCharacterBrainTraceNodesChange(sortTrajectoryNodes(nextNodes)),
      createdNodeId: monthNode.id,
      createdRange: { startDate: monthNode.startDate, endDate: monthNode.endDate || monthNode.startDate }
    }
  }

  if (draft.kind === 'year') {
    const yearNode = buildSystemTraceYearNode(year, now, meta.birthDate, calendar)
    const scopedYearNode = draft.parentId && draft.parentId !== 'brain:trajectory'
      ? { ...yearNode, parentId: draft.parentId }
      : yearNode
    const nextNodes = upsertTraceNodes(nodes, [scopedYearNode])
    return {
      ok: true,
      changes: buildCharacterBrainTraceNodesChange(sortTrajectoryNodes(nextNodes)),
      createdNodeId: scopedYearNode.id,
      createdRange: { startDate: scopedYearNode.startDate, endDate: scopedYearNode.endDate || scopedYearNode.startDate }
    }
  }

  const spanYears = Math.max(1, Math.floor(Number(draft.spanYears) || 1))
  const multiYearNode = buildSystemTraceMultiYearNode(year, spanYears, now, meta.birthDate, calendar)
  const nextNodes = upsertTraceNodes(nodes, [multiYearNode])
  return {
    ok: true,
    changes: buildCharacterBrainTraceNodesChange(sortTrajectoryNodes(nextNodes)),
    createdNodeId: multiYearNode.id,
    createdRange: { startDate: multiYearNode.startDate, endDate: multiYearNode.endDate || multiYearNode.startDate }
  }
}

export function createCharacterBrainTraceBatchTreeNodes(
  character: Character,
  draft: CharacterBrainTraceBatchCreateDraft
): CharacterBrainTraceBatchCreateResult {
  const meta = readCharacterBrainTrajectoryMeta(character)
  const calendar = buildTrajectoryCalendarRule(meta.calendarId, meta.calendarConfig)
  const birthDate = parseTrajectoryDateText(meta.birthDate, calendar)
  if (!birthDate) return { ok: false, message: '先在轨迹根节点设置角色出生日期。' }

  const now = draft.now
  let nodes = readCharacterBrainTraceNodes(character)
  const createdItems: CharacterBrainTraceBatchCreateItem[] = []
  const skippedItems: CharacterBrainTraceBatchCreateItem[] = []

  if (draft.granularity === 'year') {
    const plan = buildTraceYearCreatePlan(draft.years || [], {
      birthDate: meta.birthDate,
      calendarConfig: meta.calendarConfig,
      minDate: draft.minDate,
      maxDate: draft.maxDate
    })
    if (!plan.length) return { ok: false, message: '没有可创建的年份。' }
    plan.forEach((item) => {
      const upserts = buildTraceNodesForYearPlanItem(item, now, meta.birthDate, calendar, nodes)
      upserts.items.forEach((created) => {
        if (nodes.some((node) => node.id === created.nodeId)) skippedItems.push({ ...created, skipped: true })
        else createdItems.push(created)
      })
      nodes = upsertTraceNodes(nodes, upserts.nodes)
    })
  } else if (draft.granularity === 'month') {
    const plan = buildTraceMonthCreatePlan(draft.year || 0, draft.months || [], {
      birthDate: meta.birthDate,
      calendarConfig: meta.calendarConfig,
      minDate: draft.minDate,
      maxDate: draft.maxDate
    })
    if (!plan.length) return { ok: false, message: '没有可创建的月份。' }
    plan.forEach((item) => {
      const upserts = buildTraceNodesForMonthPlanItem(item, now, meta.birthDate, calendar)
      if (nodes.some((node) => node.id === upserts.monthItem.nodeId)) skippedItems.push({ ...upserts.monthItem, skipped: true })
      else createdItems.push(upserts.monthItem)
      nodes = upsertTraceNodes(nodes, upserts.nodes)
    })
  } else {
    const existingDates = nodes
      .filter(isFormalTraceDayNode)
      .map((node) => String(node.pointDate || node.startDate || '').trim())
      .filter(Boolean)
    const plan = buildTraceDayCreatePlan(draft.dates || [], {
      birthDate: meta.birthDate,
      calendarConfig: meta.calendarConfig,
      minDate: draft.minDate,
      maxDate: draft.maxDate,
      existingDates
    })
    if (!plan.length) return { ok: false, message: '没有可创建的日期。' }
    plan.forEach((item) => {
      const upserts = buildTraceNodesForDayPlanItem(item, draft, now, meta.birthDate, calendar)
      createdItems.push(upserts.dayItem)
      nodes = upsertTraceNodes(nodes, upserts.nodes)
    })
  }

  const sortedNodes = sortTrajectoryNodes(nodes)
  const changes = {
    ...buildCharacterBrainTraceNodesChange(sortedNodes),
    ...(draft.granularity === 'day' ? buildTraceCoverageMetaChange(character, sortedNodes) : {})
  }
  return { ok: true, changes, createdItems, skippedItems }
}

export function createCharacterBrainTraceGroupTreeNode(character: Character, draft: CharacterBrainTraceGroupDraft): Record<string, unknown> {
  const nodes = readCharacterBrainTraceNodes(character)
  const nextNode = buildTraceGroupNode(draft, resolveTraceParentId(nodes, draft.parentId), readBirthDate(character))
  return buildCharacterBrainTraceNodesChange(sortTrajectoryNodes([
    ...nodes.filter((node) => node.id !== nextNode.id),
    nextNode
  ]))
}

export function updateCharacterBrainTraceTreeNode(
  character: Character,
  nodeId: string,
  patch: Partial<CharacterBrainTraceDayDraft & CharacterBrainTraceGroupDraft> & { now: string }
): Record<string, unknown> {
  const nodes = readCharacterBrainTraceNodes(character)
  const targetId = String(nodeId || '').trim()
  const birthDate = readBirthDate(character)
  const nextNodes = nodes.map((node) => {
    if (node.id !== targetId) return node
    const isDay = isFormalTraceDayNode(node)
    const titleReadonly = isDay || node.systemRole === 'yearBranch' || node.systemRole === 'monthBranch' || node.systemRole === 'dayLeaf'
    const nextDate = isDay ? normalizeTraceDate(patch.date ?? node.pointDate ?? node.startDate) : normalizeTraceDate(patch.startDate ?? node.startDate)
    const nextEndDate = isDay ? undefined : normalizeTraceDate(patch.endDate ?? node.endDate ?? node.startDate)
    const nextTitle = patch.title === undefined
      ? node.title
      : String(patch.title || '').trim()
    const resolvedTitle = titleReadonly
      ? resolveReadonlyTraceTitle(node, nextDate)
      : (nextTitle || (isDay ? buildTrajectoryPointTitle(nextDate) : node.title))
    return {
      ...node,
      title: resolvedTitle,
      summary: patch.summary === undefined ? node.summary : String(patch.summary || '').trim(),
      subtitle: patch.subtitle === undefined ? node.subtitle : String(patch.subtitle || '').trim() || undefined,
      parentId: patch.parentId === undefined ? node.parentId : resolveTraceParentId(nodes, patch.parentId, targetId),
      startDate: nextDate,
      endDate: nextEndDate,
      pointDate: isDay ? nextDate : nextEndDate || nextDate,
      displayTitle: resolvedTitle,
      note: patch.summary === undefined ? node.note : String(patch.summary || '').trim(),
      content: patch.content === undefined ? node.content : String(patch.content || '').trim(),
      relatedEntityIds: patch.relatedEntityIds === undefined ? node.relatedEntityIds : normalizeStringList(patch.relatedEntityIds),
      tags: patch.tags === undefined ? node.tags : normalizeStringList(patch.tags),
      linkIds: patch.linkIds === undefined ? node.linkIds : normalizeStringList(patch.linkIds),
      offsetDays: isDay ? calculateOffsetDays(birthDate, nextDate) : node.offsetDays,
      ageLabel: isDay ? buildAgeLabel(birthDate, nextDate) : node.ageLabel,
      timeLabel: isDay ? nextDate : `${nextDate}${nextEndDate ? `-${nextEndDate}` : ''}`,
      updatedAt: patch.now
    }
  })
  return buildCharacterBrainTraceNodesChange(sortTrajectoryNodes(nextNodes))
}

export function moveCharacterBrainTraceTreeNode(character: Character, nodeId: string, parentId: string, now: string): Record<string, unknown> {
  return updateCharacterBrainTraceTreeNode(character, nodeId, { parentId, now })
}

export function deleteCharacterBrainTraceTreeNode(character: Character, nodeId: string): Record<string, unknown> {
  const nodes = readCharacterBrainTraceNodes(character)
  const targetId = String(nodeId || '').trim()
  const deletedIds = collectDescendantIds(nodes, targetId)
  const nextNodes = nodes.filter((node) => !deletedIds.has(node.id))
  return {
    ...buildCharacterBrainTraceNodesChange(nextNodes),
    ...buildTraceCoverageMetaChange(character, nextNodes)
  }
}

export function applyCharacterBrainWriteBackOutcome(
  character: Character,
  outcome: CharacterBrainWriteBackOutcome,
  options: CharacterBrainPendingWriteBackApplyOptions = {}
): Record<string, unknown> {
  const now = options.now || new Date().toISOString()
  if (outcome.kind === 'pending_unit') {
    return applyPendingUnitOutcome(character, outcome, now, options)
  }
  return applyPendingVersionOutcome(character, outcome, now, options)
}

export function applyCharacterBrainWriteBackDraft(
  character: Character,
  draft: CharacterBrainWriteBackDraft,
  options: CharacterBrainPendingWriteBackApplyOptions = {}
): Record<string, unknown> {
  if (draft.reviewStatus !== 'approved' || !draft.pendingOutcome) return {}
  return applyCharacterBrainWriteBackOutcome(character, draft.pendingOutcome, {
    createdBy: 'brain_agent',
    now: draft.updatedAt || options.now,
    ...options
  })
}

export function confirmCharacterBrainPendingVersion(
  character: Character,
  target: CharacterBrainWriteBackOutcome['target'],
  targetUnitId: string,
  now = new Date().toISOString()
): Record<string, unknown> {
  const unitId = String(targetUnitId || '').trim()
  if (!unitId) return {}
  if (target === 'soul') {
    return buildCharacterBrainCognitionNodesChange(readCharacterBrainCognitionNodes(character).map((node) => (
      node.id === unitId ? { ...node, pendingReview: undefined, updatedAt: now } : node
    )))
  }
  if (target === 'trace' || target === 'arrangement') {
    return buildCharacterBrainTraceNodesChange(readCharacterBrainTraceNodes(character).map((node) => (
      node.id === unitId ? { ...node, confirmed: true, pendingReview: undefined, updatedAt: now } : node
    )))
  }
  return {}
}

export function rejectCharacterBrainPendingVersion(
  character: Character,
  target: CharacterBrainWriteBackOutcome['target'],
  targetUnitId: string,
  now = new Date().toISOString()
): Record<string, unknown> {
  const unitId = String(targetUnitId || '').trim()
  if (!unitId) return {}
  if (target === 'soul') {
    const nodes = readCharacterBrainCognitionNodes(character)
    const targetNode = nodes.find((node) => node.id === unitId)
    if (!targetNode?.pendingReview) return {}
    if (targetNode.pendingReview.mode === 'create') {
      const documents = { ...readCharacterBrainDocuments(character) }
      delete documents[unitId]
      return {
        ...buildCharacterBrainCognitionNodesChange(nodes.filter((node) => node.id !== unitId)),
        brainDocuments: documents,
        brain_documents: JSON.stringify(documents)
      }
    }
    const previous = targetNode.pendingReview.previous
    const documents = { ...readCharacterBrainDocuments(character) }
    if (previous) {
      if (previous.content) {
        documents[unitId] = previous.content
      } else {
        delete documents[unitId]
      }
    }
    return {
      ...buildCharacterBrainCognitionNodesChange(nodes.map((node) => (
        node.id === unitId
          ? {
              ...node,
              title: previous?.title || node.title,
              summary: previous?.summary || '',
              sourceDocumentId: previous?.sourceDocumentId || undefined,
              sourceDisplayPath: previous?.sourceDisplayPath || undefined,
              pendingReview: undefined,
              updatedAt: now
            }
          : node
      ))),
      brainDocuments: documents,
      brain_documents: JSON.stringify(documents)
    }
  }
  if (target === 'trace' || target === 'arrangement') {
    const nodes = readCharacterBrainTraceNodes(character)
    const targetNode = nodes.find((node) => node.id === unitId)
    if (!targetNode?.pendingReview) return {}
    if (targetNode.pendingReview.mode === 'create') {
      return buildCharacterBrainTraceNodesChange(nodes.filter((node) => node.id !== unitId))
    }
    const previous = targetNode.pendingReview.previous
    return buildCharacterBrainTraceNodesChange(nodes.map((node) => (
      node.id === unitId
        ? restoreTraceNodePendingSnapshot(node, previous, now)
        : node
    )))
  }
  return {}
}

export function migrateLegacyTraceNodesToFormalTree(character: Character, now: string): CharacterBrainTraceMigrationResult {
  const sourceNodes = readCharacterBrainTraceNodes(character)
  const nextNodes: CharacterBrainTraceNode[] = []
  const usedIds = new Set<string>()
  const migratedSourceIds: string[] = []
  const birthDate = readBirthDate(character)

  sourceNodes.forEach((node) => {
    const baseNode = {
      ...node,
      parentId: resolveTraceParentId(sourceNodes, node.parentId, node.id),
      innerEntries: [],
      updatedAt: now
    }
    if (isFormalTraceDayNode(node)) {
      nextNodes.push(reserveTraceNodeId(baseNode, usedIds))
    } else {
      migratedSourceIds.push(node.id)
      nextNodes.push(reserveTraceNodeId({
        ...baseNode,
        nodeType: node.nodeType === 'range' ? 'range' : node.nodeType,
        confirmed: node.confirmed === false ? false : true
      }, usedIds))
    }
    ;(node.innerEntries || []).forEach((entry, index) => {
      migratedSourceIds.push(`${node.id}::${entry.id}`)
      const childId = makeUniqueTraceNodeId(`brain:trajectory:node:migrated_${encodeTreeSegment(node.id)}_${index}`, usedIds)
      if (entry.granularity === 'day' && entry.nodeType === 'single') {
        nextNodes.push(buildTraceDayNode({
          id: childId,
          date: entry.startDate,
          title: entry.displayTitle,
          summary: entry.note,
          content: entry.content,
          parentId: node.id,
          linkIds: entry.linkIds,
          relatedEntityIds: entry.linkIds,
          tags: node.tags,
          now
        }, node.id, birthDate))
      } else {
        nextNodes.push(buildTraceGroupNode({
          id: childId,
          title: entry.displayTitle,
          summary: entry.note,
          content: entry.content,
          parentId: node.id,
          startDate: entry.startDate,
          endDate: entry.endDate,
          kind: entry.granularity === 'day' ? 'month' : entry.granularity,
          linkIds: entry.linkIds,
          relatedEntityIds: entry.linkIds,
          tags: node.tags,
          now
        }, node.id, birthDate))
      }
    })
  })

  const nodes = sortTrajectoryNodes(nextNodes)
  return {
    nodes,
    changes: buildCharacterBrainTraceNodesChange(nodes),
    migratedSourceIds
  }
}

function buildTraceMigrationPlanItem(node: CharacterBrainTraceNode): CharacterBrainTraceMigrationPlanItem {
  const steps: CharacterBrainTraceMigrationStep[] = []
  if (isFormalTraceDayNode(node)) {
    steps.push('preserve_day_node')
  } else {
    steps.push('convert_non_day_to_group')
  }
  if (node.nodeType === 'range') {
    steps.push('split_range_to_day_children_or_keep_group_summary')
  }
  if (Array.isArray(node.innerEntries) && node.innerEntries.length > 0) {
    steps.push('promote_inner_entries_to_child_units')
  }
  return {
    sourceId: node.id,
    title: node.title || node.displayTitle || node.pointDate || node.startDate,
    currentKind: node.kind,
    currentNodeType: node.nodeType,
    currentGranularity: node.granularity,
    targetRole: isFormalTraceDayNode(node) ? 'traceDay' : 'traceGroup',
    steps,
    innerEntryCount: Array.isArray(node.innerEntries) ? node.innerEntries.length : 0,
    parentSourceId: node.parentId
  }
}

function applyPendingUnitOutcome(
  character: Character,
  outcome: CharacterBrainWriteBackOutcome,
  now: string,
  options: CharacterBrainPendingWriteBackApplyOptions
): Record<string, unknown> {
  if (outcome.target === 'soul') {
    const id = createPendingUnitId('soul', outcome, options)
    const parentId = String(outcome.targetParentId || '').trim() || 'brain:cognition'
    // 关系认知写入：outcome 带 subject 时生成 kind='relation' 节点，正文存关系画像 JSON；否则保持原有普通灵魂行为（content 不落地）
    const isRelationNode = Boolean(outcome.content.subjectType && outcome.content.subjectId)
    const changes = createCharacterBrainSoulTreeNode(character, {
      id,
      title: outcome.content.title,
      summary: outcome.content.summary,
      content: isRelationNode ? outcome.content.content : undefined,
      subjectType: isRelationNode ? outcome.content.subjectType : undefined,
      subjectId: isRelationNode ? outcome.content.subjectId : undefined,
      parentId,
      kind: isRelationNode ? 'relation' : 'private',
      now
    } as CharacterBrainSoulNodeDraft)
    const nodes = (changes.brainCognitionNodes as CharacterBrainCognitionNode[]).map((node) => (
      node.id === id
        ? {
            ...node,
            pendingReview: {
              mode: 'create' as const,
              reason: '大脑 Agent 生成的待确认单位。',
              createdBy: options.createdBy || 'brain_agent',
              createdAt: now
            }
          }
        : node
    ))
    const characterWithPendingNode = { ...character, brainCognitionNodes: nodes } as Character
    return {
      ...buildCharacterBrainCognitionNodesChange(nodes),
      ...buildCompilePageForOutcome(characterWithPendingNode, id, outcome, now)
    }
  }
  if (outcome.target === 'trace' || outcome.target === 'arrangement') {
    const target = outcome.target === 'arrangement' ? 'arrangement' : 'trace'
    const id = createPendingUnitId(target, outcome, options)
    const parentId = resolvePendingTraceDocumentParentId(character, outcome.targetParentId, now)
    if (!parentId) return {}
    const draft = {
      id,
      title: outcome.content.title,
      summary: outcome.content.summary,
      content: outcome.content.content,
      parentId,
      tags: outcome.content.tags,
      now
    }
    const changes = target === 'arrangement'
      ? createCharacterBrainTraceArrangementTreeNode(character, {
          ...draft,
          activationRule: { date: resolveTraceDayDate(character, parentId), recurrence: 'once' },
          recallPolicy: { level: 'summary', priority: 'normal' }
        })
      : createCharacterBrainTraceEventTreeNode(character, draft)
    const nodes = (changes.brainTraceNodes as CharacterBrainTraceNode[]).map((node) => (
      node.id === id
        ? {
            ...node,
            confirmed: false,
            pendingReview: {
              mode: 'create' as const,
              reason: '大脑 Agent 生成的待确认单位。',
              createdBy: options.createdBy || 'brain_agent',
              createdAt: now
            }
          }
        : node
    ))
    const characterWithPendingNode = { ...character, brainTraceNodes: nodes } as Character
    return {
      ...buildCharacterBrainTraceNodesChange(nodes),
      ...buildCompilePageForOutcome(characterWithPendingNode, id, outcome, now)
    }
  }
  return {}
}

function applyPendingVersionOutcome(
  character: Character,
  outcome: CharacterBrainWriteBackOutcome,
  now: string,
  options: CharacterBrainPendingWriteBackApplyOptions
): Record<string, unknown> {
  const unitId = String(outcome.targetUnitId || '').trim()
  if (!unitId) return {}
  if (outcome.target === 'soul') {
    const nodes = readCharacterBrainCognitionNodes(character)
    const documents = readCharacterBrainDocuments(character)
    const isRelationOutcome = Boolean(outcome.content.subjectType)
    const nextNodes = nodes.map((node) => (
      node.id === unitId
        ? {
            ...node,
            title: outcome.content.title || node.title,
            summary: outcome.content.summary,
            // 关系认知节点更新：同步关系画像 JSON 正文与认知对象；普通灵魂节点维持原行为（不动 content）
            ...(isRelationOutcome
              ? {
                  content: outcome.content.content ?? node.content,
                  subjectType: outcome.content.subjectType ?? node.subjectType,
                  subjectId: outcome.content.subjectId ?? node.subjectId
                }
              : {}),
            pendingReview: {
              mode: 'update' as const,
              previous: snapshotSoulNode({
                ...node,
                content: node.content ?? documents[unitId] ?? ''
              }),
              reason: '大脑 Agent 生成的待确认版本。',
              createdBy: options.createdBy || 'brain_agent',
              createdAt: now
            },
            updatedAt: now
          }
        : node
    ))
    return {
      ...buildCharacterBrainCognitionNodesChange(nextNodes),
      ...buildCompilePageForOutcome(character, unitId, outcome, now)
    }
  }
  if (outcome.target === 'trace' || outcome.target === 'arrangement') {
    const nodes = readCharacterBrainTraceNodes(character)
    const nextNodes = nodes.map((node) => (
      node.id === unitId
        ? {
            ...node,
            title: outcome.content.title || node.title,
            displayTitle: outcome.content.title || node.displayTitle,
            summary: outcome.content.summary,
            note: outcome.content.summary,
            content: String(outcome.content.content || '').trim(),
            tags: normalizeStringList(outcome.content.tags),
            confirmed: true,
            pendingReview: {
              mode: 'update' as const,
              previous: snapshotTraceNode(node),
              reason: '大脑 Agent 生成的待确认版本。',
              createdBy: options.createdBy || 'brain_agent',
              createdAt: now
            },
            updatedAt: now
          }
        : node
    ))
    return {
      ...buildCharacterBrainTraceNodesChange(nextNodes),
      ...buildCompilePageForOutcome(character, unitId, outcome, now)
    }
  }
  return {}
}

function buildCompilePageForOutcome(
  character: Character,
  unitId: string,
  outcome: CharacterBrainWriteBackOutcome,
  now: string
): Record<string, unknown> {
  if (!readCharacterBrainTrajectoryMeta(character).autoCompilePageEnabled) return {}
  return buildCharacterBrainCompilePageChange(character, unitId, {
    summary: outcome.content.summary,
    tags: normalizeStringList(outcome.content.tags),
    relationHints: normalizeStringList(outcome.content.relationHints),
    updatedAt: now
  })
}

function createPendingUnitId(
  target: 'soul' | 'trace' | 'arrangement',
  outcome: CharacterBrainWriteBackOutcome,
  options: CharacterBrainPendingWriteBackApplyOptions
) {
  const customId = options.idFactory?.(target, outcome)
  if (customId) return customId
  const title = encodeTreeSegment(outcome.content.title || 'pending')
  if (target === 'soul') return `brain:cognition:node:pending_${title}_${Date.now()}`
  const prefix = target === 'arrangement' ? 'pending_arrangement' : 'pending_event'
  return `brain:trajectory:node:${prefix}_${title}_${Date.now()}`
}

function resolvePendingTraceDocumentParentId(
  character: Character,
  targetParentId: string | undefined,
  now: string
) {
  const nodes = readCharacterBrainTraceNodes(character)
  const requestedParentId = String(targetParentId || '').trim()
  const requestedParent = nodes.find((node) => node.id === requestedParentId)
  if (requestedParent && isFormalTraceDayNode(requestedParent)) return requestedParent.id
  const today = normalizeTraceDate(now.slice(0, 10))
  const existingToday = nodes.find((node) => isFormalTraceDayNode(node) && (node.pointDate || node.startDate) === today)
  if (existingToday) return existingToday.id
  const latestDay = sortTrajectoryNodes(nodes.filter(isFormalTraceDayNode)).slice(-1)[0]
  return latestDay?.id || ''
}

function resolveTraceDayDate(character: Character, dayNodeId: string) {
  const dayNode = readCharacterBrainTraceNodes(character).find((node) => node.id === dayNodeId)
  return normalizeTraceDate(dayNode?.pointDate || dayNode?.startDate || '0001-01-01')
}

function snapshotSoulNode(node: CharacterBrainCognitionNode): CharacterBrainPendingNodeSnapshot {
  return {
    title: node.title,
    summary: node.summary,
    content: node.content,
    sourceDocumentId: node.sourceDocumentId,
    sourceDisplayPath: node.sourceDisplayPath
  }
}

function snapshotTraceNode(node: CharacterBrainTraceNode): CharacterBrainPendingNodeSnapshot {
  return {
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

function restoreTraceNodePendingSnapshot(
  node: CharacterBrainTraceNode,
  previous: CharacterBrainPendingNodeSnapshot | null | undefined,
  now: string
): CharacterBrainTraceNode {
  if (!previous) {
    return { ...node, confirmed: true, pendingReview: undefined, updatedAt: now }
  }
  return {
    ...node,
    title: previous.title || node.title,
    displayTitle: previous.title || node.displayTitle,
    summary: previous.summary || '',
    note: previous.summary || '',
    content: previous.content || '',
    timeLabel: previous.timeLabel || node.timeLabel,
    pointDate: previous.pointDate || node.pointDate,
    ageLabel: previous.ageLabel || node.ageLabel,
    relatedEntityIds: previous.relatedEntityIds || [],
    tags: previous.tags || [],
    confirmed: true,
    pendingReview: undefined,
    updatedAt: now
  }
}

function buildTraceDayNode(
  draft: CharacterBrainTraceDayDraft,
  parentId: string,
  birthDate: string,
  calendar: ReturnType<typeof buildTrajectoryCalendarRule> = buildTrajectoryCalendarRule()
): CharacterBrainTraceNode {
  const pointDate = normalizeTraceDate(draft.date, calendar)
  const title = buildTrajectoryPointTitle(parseTrajectoryDateText(pointDate, calendar) || pointDate)
  const subtitle = String(draft.subtitle ?? draft.title ?? draft.summary ?? '').trim()
  const summary = String(draft.summary ?? draft.subtitle ?? '').trim()
  return {
    id: String(draft.id || '').trim(),
    title,
    summary,
    subtitle: subtitle || undefined,
    parentId,
    kind: 'day',
    nodeType: 'single',
    granularity: 'day',
    startDate: pointDate,
    displayTitle: title,
    note: summary,
    innerEntries: [],
    linkIds: normalizeStringList(draft.linkIds),
    autoGenerated: false,
    systemRole: 'dayLeaf',
    timeLabel: pointDate,
    pointDate,
    offsetDays: calculateOffsetDays(birthDate, pointDate, calendar),
    ageLabel: buildAgeLabel(birthDate, pointDate, calendar),
    stepUnit: 'day',
    stepAmount: 1,
    relatedEntityIds: normalizeStringList(draft.relatedEntityIds),
    tags: normalizeStringList(draft.tags),
    content: String(draft.content || '').trim(),
    summaryMode: 'manual',
    summarySourceNodeIds: [],
    confirmed: true,
    createdAt: draft.now,
    updatedAt: draft.now
  }
}

function buildTraceGroupNode(draft: CharacterBrainTraceGroupDraft, parentId: string, birthDate: string): CharacterBrainTraceNode {
  const startDate = normalizeTraceDate(draft.startDate || draft.endDate || birthDate || '0001-01-01')
  const endDate = normalizeTraceDate(draft.endDate || draft.startDate || startDate)
  const groupKind = draft.kind || 'month'
  const summary = String(draft.summary || '').trim()
  return {
    id: String(draft.id || '').trim(),
    title: String(draft.title || '未命名轨迹组').trim(),
    summary,
    parentId,
    kind: groupKind,
    nodeType: startDate === endDate ? 'single' : 'range',
    granularity: groupKind,
    startDate,
    endDate: startDate === endDate ? undefined : endDate,
    displayTitle: String(draft.title || '未命名轨迹组').trim(),
    note: summary,
    innerEntries: [],
    linkIds: normalizeStringList(draft.linkIds),
    autoGenerated: false,
    systemRole: 'freeGroup',
    timeLabel: startDate === endDate ? startDate : `${startDate}-${endDate}`,
    pointDate: endDate,
    offsetDays: calculateOffsetDays(birthDate, endDate),
    ageLabel: buildAgeLabel(birthDate, endDate),
    stepUnit: groupKind === 'month' ? 'month' : 'year',
    stepAmount: 1,
    relatedEntityIds: normalizeStringList(draft.relatedEntityIds),
    tags: normalizeStringList(draft.tags),
    content: String(draft.content || '').trim(),
    summaryMode: 'manual',
    summarySourceNodeIds: [],
    confirmed: true,
    createdAt: draft.now,
    updatedAt: draft.now
  }
}

function createCharacterBrainTraceChildDocumentNode(
  character: Character,
  draft: CharacterBrainTraceEventDraft | CharacterBrainTraceArrangementDraft,
  systemRole: 'eventLeaf' | 'arrangementLeaf'
): Record<string, unknown> {
  const nodes = readCharacterBrainTraceNodes(character)
  const parentId = String(draft.parentId || '').trim()
  const parent = nodes.find((node) => node.id === parentId)
  if (!parent || !isFormalTraceDayNode(parent)) return {}
  const nextNode = buildTraceChildDocumentNode(draft, parent, readBirthDate(character), systemRole)
  return buildCharacterBrainTraceNodesChange([
    ...nodes.filter((node) => node.id !== nextNode.id),
    nextNode
  ])
}

function buildTraceChildDocumentNode(
  draft: CharacterBrainTraceEventDraft | CharacterBrainTraceArrangementDraft,
  parent: CharacterBrainTraceNode,
  birthDate: string,
  systemRole: 'eventLeaf' | 'arrangementLeaf'
): CharacterBrainTraceNode {
  const pointDate = normalizeTraceDate(parent.pointDate || parent.startDate || birthDate || '0001-01-01')
  const title = String(draft.title || (systemRole === 'arrangementLeaf' ? '新安排' : '新事件')).trim()
  const summary = String(draft.summary || '').trim()
  const arrangementDraft = draft as CharacterBrainTraceArrangementDraft
  return {
    id: String(draft.id || '').trim(),
    title,
    summary,
    parentId: parent.id,
    kind: 'day',
    nodeType: 'single',
    granularity: 'day',
    startDate: pointDate,
    displayTitle: title,
    note: summary,
    innerEntries: [],
    linkIds: normalizeStringList(draft.linkIds),
    autoGenerated: false,
    systemRole,
    activationRule: systemRole === 'arrangementLeaf' ? arrangementDraft.activationRule : undefined,
    recallPolicy: systemRole === 'arrangementLeaf' ? arrangementDraft.recallPolicy : undefined,
    timeLabel: pointDate,
    pointDate,
    offsetDays: calculateOffsetDays(birthDate, pointDate),
    ageLabel: buildAgeLabel(birthDate, pointDate),
    stepUnit: 'day',
    stepAmount: 1,
    relatedEntityIds: normalizeStringList(draft.relatedEntityIds),
    tags: normalizeStringList(draft.tags),
    content: String(draft.content || '').trim(),
    summaryMode: 'manual',
    summarySourceNodeIds: [],
    confirmed: true,
    createdAt: draft.now,
    updatedAt: draft.now
  }
}

function resolveDefaultNextTraceDate(
  dayNodes: CharacterBrainTraceNode[],
  birthDate: NonNullable<ReturnType<typeof parseTrajectoryDateText>>,
  calendar: ReturnType<typeof buildTrajectoryCalendarRule>
) {
  const lastDay = dayNodes
    .map((node) => parseTrajectoryDateText(node.pointDate || node.startDate, calendar))
    .filter((date): date is NonNullable<typeof date> => Boolean(date))
    .sort(compareTrajectoryDate)
    .slice(-1)[0]
  return lastDay
    ? addTrajectoryDays(lastDay, 1, calendar)
    : { ok: true as const, date: birthDate }
}

function buildTraceCoverageMetaChange(character: Character, nodes: CharacterBrainTraceNode[]) {
  const meta = readCharacterBrainTrajectoryMeta(character)
  const calendar = buildTrajectoryCalendarRule(meta.calendarId, meta.calendarConfig)
  const latestDay = nodes
    .filter(isFormalTraceDayNode)
    .map((node) => parseTrajectoryDateText(node.pointDate || node.startDate, calendar))
    .filter((date): date is NonNullable<typeof date> => Boolean(date))
    .sort(compareTrajectoryDate)
    .slice(-1)[0]
  if (!latestDay || !meta.birthDate) {
    return buildCharacterBrainTrajectoryMetaChange({
      ...meta,
      coverageRange: undefined,
      coverageEndDate: undefined,
      coverageEndOffsetDays: undefined
    })
  }
  const endDate = formatTrajectoryDateText(latestDay)
  const endOffsetDays = calculateOffsetDays(meta.birthDate, endDate, calendar)
  return buildCharacterBrainTrajectoryMetaChange({
    ...meta,
    coverageRange: {
      startDate: meta.birthDate,
      startOffsetDays: 0,
      endDate,
      endOffsetDays
    },
    coverageEndDate: endDate,
    coverageEndOffsetDays: endOffsetDays
  })
}

function buildTraceNodesForYearPlanItem(
  item: TraceYearCreatePlanItem,
  now: string,
  birthDate: string,
  calendar: ReturnType<typeof buildTrajectoryCalendarRule>,
  existingNodes: CharacterBrainTraceNode[]
): { nodes: CharacterBrainTraceNode[]; items: CharacterBrainTraceBatchCreateItem[] } {
  if (item.kind === 'multiYear') {
    const multiYearNode = buildSystemTraceMultiYearNode(item.year, item.spanYears, now, birthDate, calendar)
    const yearNodes = item.years.map((year) => ({
      ...buildSystemTraceYearNode(year, now, birthDate, calendar),
      parentId: multiYearNode.id
    }))
    return {
      nodes: [multiYearNode, ...yearNodes],
      items: [
        { kind: 'multiYear', nodeId: multiYearNode.id, year: item.year, spanYears: item.spanYears },
        ...yearNodes.map((node) => ({ kind: 'year' as const, nodeId: node.id, year: Number(node.startDate.slice(0, 4)) }))
      ]
    }
  }
  const parentMultiYear = findContainingMultiYearNode(existingNodes, item.year)
  const yearNode = {
    ...buildSystemTraceYearNode(item.year, now, birthDate, calendar),
    parentId: parentMultiYear?.id || 'brain:trajectory'
  }
  return {
    nodes: [yearNode],
    items: [{ kind: 'year', nodeId: yearNode.id, year: item.year }]
  }
}

function buildTraceNodesForMonthPlanItem(
  item: TraceMonthCreatePlanItem,
  now: string,
  birthDate: string,
  calendar: ReturnType<typeof buildTrajectoryCalendarRule>
): { nodes: CharacterBrainTraceNode[]; monthItem: CharacterBrainTraceBatchCreateItem } {
  const yearNode = buildSystemTraceYearNode(item.year, now, birthDate, calendar)
  const monthNode = buildSystemTraceMonthNode(item.year, item.month, now, birthDate, calendar)
  return {
    nodes: [yearNode, monthNode],
    monthItem: { kind: 'month', nodeId: monthNode.id, year: item.year, month: item.month }
  }
}

function buildTraceNodesForDayPlanItem(
  item: TraceDayCreatePlanItem,
  draft: CharacterBrainTraceBatchCreateDraft,
  now: string,
  birthDate: string,
  calendar: ReturnType<typeof buildTrajectoryCalendarRule>
): { nodes: CharacterBrainTraceNode[]; dayItem: CharacterBrainTraceBatchCreateItem } {
  const yearNode = buildSystemTraceYearNode(item.year, now, birthDate, calendar)
  const monthNode = buildSystemTraceMonthNode(item.year, item.month, now, birthDate, calendar)
  const dayNode = buildTraceDayNode({
    id: buildSystemTraceDayNodeId(item.date),
    date: item.date,
    subtitle: draft.subtitle ?? draft.summary,
    summary: draft.summary ?? draft.subtitle,
    content: draft.content,
    relatedEntityIds: draft.relatedEntityIds,
    tags: draft.tags,
    linkIds: draft.linkIds,
    now
  }, monthNode.id, birthDate, calendar)
  return {
    nodes: [yearNode, monthNode, dayNode],
    dayItem: { kind: 'day', nodeId: dayNode.id, date: item.date }
  }
}

function findContainingMultiYearNode(nodes: CharacterBrainTraceNode[], year: number) {
  return nodes.find((node) => {
    if (node.systemRole !== 'multiYearBranch') return false
    const start = parseTrajectoryDateText(node.startDate)
    const end = parseTrajectoryDateText(node.endDate || node.pointDate || node.startDate)
    return Boolean(start && end && year >= start.year && year <= end.year)
  })
}

function resolveReadonlyTraceTitle(node: CharacterBrainTraceNode, dateText: string) {
  const date = parseTrajectoryDateText(dateText)
  if (node.systemRole === 'monthBranch' && date) return `${date.year}年${date.month}月`
  if (node.systemRole === 'yearBranch' && date) return `${date.year}年`
  if (node.systemRole === 'multiYearBranch') return node.title || node.displayTitle
  if (node.systemRole === 'dayLeaf') return buildTrajectoryPointTitle(dateText)
  return node.title
}

function buildSystemTraceYearNode(
  year: number,
  now: string,
  birthDate: string,
  calendar: ReturnType<typeof buildTrajectoryCalendarRule>
): CharacterBrainTraceNode {
  const startDate = formatTrajectoryDateText({ year, month: 1, day: 1 })
  const lastMonth = calendar.monthsInYear(year)
  const endDate = formatTrajectoryDateText({ year, month: lastMonth, day: calendar.daysInMonth(year, lastMonth) })
  const title = `${year}年`
  return {
    id: buildSystemTraceYearNodeId(year),
    title,
    summary: '',
    parentId: 'brain:trajectory',
    kind: 'year',
    nodeType: 'range',
    granularity: 'year',
    startDate,
    endDate,
    displayTitle: title,
    note: '',
    innerEntries: [],
    linkIds: [],
    autoGenerated: true,
    systemRole: 'yearBranch',
    timeLabel: `${startDate}-${endDate}`,
    pointDate: endDate,
    offsetDays: calculateOffsetDays(birthDate, endDate, calendar),
    ageLabel: buildAgeLabel(birthDate, endDate, calendar),
    stepUnit: 'year',
    stepAmount: 1,
    relatedEntityIds: [],
    tags: [],
    content: '',
    summaryMode: 'manual',
    summarySourceNodeIds: [],
    confirmed: true,
    createdAt: now,
    updatedAt: now
  }
}

function buildSystemTraceMonthNode(
  year: number,
  month: number,
  now: string,
  birthDate: string,
  calendar: ReturnType<typeof buildTrajectoryCalendarRule>
): CharacterBrainTraceNode {
  const startDate = formatTrajectoryDateText({ year, month, day: 1 })
  const endDate = formatTrajectoryDateText({ year, month, day: calendar.daysInMonth(year, month) })
  const title = `${year}年${month}月`
  return {
    id: buildSystemTraceMonthNodeId(year, month),
    title,
    summary: '',
    parentId: buildSystemTraceYearNodeId(year),
    kind: 'month',
    nodeType: 'range',
    granularity: 'month',
    startDate,
    endDate,
    displayTitle: title,
    note: '',
    innerEntries: [],
    linkIds: [],
    autoGenerated: true,
    systemRole: 'monthBranch',
    timeLabel: `${startDate}-${endDate}`,
    pointDate: endDate,
    offsetDays: calculateOffsetDays(birthDate, endDate, calendar),
    ageLabel: buildAgeLabel(birthDate, endDate, calendar),
    stepUnit: 'month',
    stepAmount: 1,
    relatedEntityIds: [],
    tags: [],
    content: '',
    summaryMode: 'manual',
    summarySourceNodeIds: [],
    confirmed: true,
    createdAt: now,
    updatedAt: now
  }
}

function buildSystemTraceMultiYearNode(
  startYear: number,
  spanYears: number,
  now: string,
  birthDate: string,
  calendar: ReturnType<typeof buildTrajectoryCalendarRule>
): CharacterBrainTraceNode {
  const normalizedSpanYears = Math.max(1, Math.floor(Number(spanYears) || 1))
  const endYear = startYear + normalizedSpanYears - 1
  const startDate = formatTrajectoryDateText({ year: startYear, month: 1, day: 1 })
  const lastMonth = calendar.monthsInYear(endYear)
  const endDate = formatTrajectoryDateText({ year: endYear, month: lastMonth, day: calendar.daysInMonth(endYear, lastMonth) })
  const title = startYear === endYear ? `${startYear}年` : `${startYear}年-${endYear}年`
  return {
    id: buildSystemTraceMultiYearNodeId(startYear, endYear),
    title,
    summary: '',
    parentId: 'brain:trajectory',
    kind: 'multiYear',
    nodeType: 'range',
    granularity: 'multiYear',
    startDate,
    endDate,
    displayTitle: title,
    note: '',
    innerEntries: [],
    linkIds: [],
    autoGenerated: true,
    systemRole: 'multiYearBranch',
    timeLabel: `${startDate}-${endDate}`,
    pointDate: endDate,
    offsetDays: calculateOffsetDays(birthDate, endDate, calendar),
    ageLabel: buildAgeLabel(birthDate, endDate, calendar),
    stepUnit: 'year',
    stepAmount: normalizedSpanYears,
    relatedEntityIds: [],
    tags: [],
    content: '',
    summaryMode: 'manual',
    summarySourceNodeIds: [],
    confirmed: true,
    createdAt: now,
    updatedAt: now
  }
}

function upsertTraceNodes(nodes: CharacterBrainTraceNode[], upserts: CharacterBrainTraceNode[]) {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  upserts.forEach((node) => {
    const previous = byId.get(node.id)
    byId.set(node.id, previous ? {
      ...previous,
      ...node,
      createdAt: previous.createdAt || node.createdAt
    } : node)
  })
  return Array.from(byId.values())
}

function buildSystemTraceYearNodeId(year: number) {
  return `brain:trajectory:node:year_${year}`
}

function buildSystemTraceMonthNodeId(year: number, month: number) {
  return `brain:trajectory:node:month_${year}_${String(month).padStart(2, '0')}`
}

function buildSystemTraceMultiYearNodeId(startYear: number, endYear: number) {
  return `brain:trajectory:node:multi_year_${startYear}_${endYear}`
}

function buildSystemTraceDayNodeId(dateText: string) {
  return `brain:trajectory:node:day_${String(dateText || '').replace(/-/g, '_')}`
}

function compareTrajectoryDate(
  left: NonNullable<ReturnType<typeof parseTrajectoryDateText>>,
  right: NonNullable<ReturnType<typeof parseTrajectoryDateText>>
) {
  if (left.year !== right.year) return left.year - right.year
  if (left.month !== right.month) return left.month - right.month
  return left.day - right.day
}

function resolveSoulParentId(nodes: CharacterBrainCognitionNode[], parentId?: string, selfId?: string) {
  const normalizedParentId = String(parentId || '').trim()
  if (!normalizedParentId || normalizedParentId === 'brain:cognition') return 'brain:cognition'
  const descendantIds = selfId ? collectDescendantIds(nodes, selfId) : new Set<string>()
  if (descendantIds.has(normalizedParentId)) return 'brain:cognition'
  return nodes.some((node) => node.id === normalizedParentId) ? normalizedParentId : 'brain:cognition'
}

function resolveTraceParentId(nodes: CharacterBrainTraceNode[], parentId?: string, selfId?: string) {
  const normalizedParentId = String(parentId || '').trim()
  if (!normalizedParentId || normalizedParentId === 'brain:trajectory') return 'brain:trajectory'
  const descendantIds = selfId ? collectDescendantIds(nodes, selfId) : new Set<string>()
  if (descendantIds.has(normalizedParentId)) return 'brain:trajectory'
  return nodes.some((node) => node.id === normalizedParentId) ? normalizedParentId : 'brain:trajectory'
}

function collectDescendantIds<T extends { id: string; parentId: string }>(nodes: T[], rootId: string) {
  const deletedIds = new Set<string>()
  const visit = (nodeId: string) => {
    if (!nodeId || deletedIds.has(nodeId)) return
    deletedIds.add(nodeId)
    nodes.filter((node) => node.parentId === nodeId).forEach((node) => visit(node.id))
  }
  visit(String(rootId || '').trim())
  return deletedIds
}

function reserveTraceNodeId(node: CharacterBrainTraceNode, usedIds: Set<string>) {
  const nextId = makeUniqueTraceNodeId(node.id, usedIds)
  return nextId === node.id ? node : { ...node, id: nextId }
}

function makeUniqueTraceNodeId(id: string, usedIds: Set<string>) {
  const baseId = String(id || 'brain:trajectory:node:migrated').trim()
  let nextId = baseId
  let index = 1
  while (usedIds.has(nextId)) {
    nextId = `${baseId}_${index}`
    index += 1
  }
  usedIds.add(nextId)
  return nextId
}

function normalizeTraceDate(raw: unknown, calendar: ReturnType<typeof buildTrajectoryCalendarRule> = buildTrajectoryCalendarRule()) {
  const parsed = parseTrajectoryDateText(String(raw || '').trim(), calendar)
  return parsed ? formatTrajectoryDateText(parsed) : '0001-01-01'
}

function readBirthDate(character: Character) {
  const rawMeta = character.brainTrajectoryMeta ?? character.brain_trajectory_meta
  if (rawMeta && typeof rawMeta === 'object' && !Array.isArray(rawMeta)) {
    const meta = rawMeta as unknown as Record<string, unknown>
    return normalizeTraceDate(meta.birthDate ?? meta.birth_date)
  }
  if (typeof rawMeta === 'string') {
    try {
      const parsed = JSON.parse(rawMeta)
      return normalizeTraceDate(parsed?.birthDate ?? parsed?.birth_date)
    } catch {
      return '0001-01-01'
    }
  }
  return '0001-01-01'
}

function calculateOffsetDays(
  birthDateText: string,
  pointDateText: string,
  calendar: ReturnType<typeof buildTrajectoryCalendarRule> = buildTrajectoryCalendarRule()
) {
  const birthDate = parseTrajectoryDateText(birthDateText, calendar)
  const pointDate = parseTrajectoryDateText(pointDateText, calendar)
  if (!birthDate || !pointDate) return 0
  if (compareTrajectoryDate(pointDate, birthDate) <= 0) return 0
  let current = birthDate
  let days = 0
  while (compareTrajectoryDate(current, pointDate) < 0 && days < 200000) {
    const next = addTrajectoryDays(current, 1, calendar)
    if (!next.ok) break
    current = next.date
    days += 1
  }
  return days
}

function buildAgeLabel(
  birthDateText: string,
  pointDateText: string,
  calendar: ReturnType<typeof buildTrajectoryCalendarRule> = buildTrajectoryCalendarRule()
) {
  const birthDate = parseTrajectoryDateText(birthDateText, calendar)
  const pointDate = parseTrajectoryDateText(pointDateText, calendar)
  if (!birthDate || !pointDate) return ''
  const years = Math.max(0, pointDate.year - birthDate.year)
  if (years <= 0) return `出生后第${calculateOffsetDays(birthDateText, pointDateText, calendar)}日`
  return `${years}岁`
}

function normalizeStringList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item || '').trim()).filter(Boolean)
  if (typeof value === 'string') return value.split(/[\n,，]+/u).map((item) => item.trim()).filter(Boolean)
  return []
}

function normalizeOptionalText(value: unknown) {
  const text = String(value || '').trim()
  return text || undefined
}

function createSectionNode(
  nodeId: string,
  rootId: string,
  title: string,
  section: CharacterBrainTreeSection,
  orderIndex: number
): CharacterBrainTreeNode {
  return {
    nodeId,
    sourceId: section,
    title,
    role: 'sectionRoot',
    section,
    parentId: rootId,
    orderIndex,
    writeScope: 'none'
  }
}

function buildCharacterRootId(characterId: string) {
  return `character:${encodeTreeSegment(characterId)}`
}

function buildSectionId(characterId: string, section: CharacterBrainTreeSection) {
  return `brain-tree:${encodeTreeSegment(characterId)}:${section}`
}

function buildCoreGroupNodeId(characterId: string, groupKey: string) {
  return `brain-tree:${encodeTreeSegment(characterId)}:core-group:${encodeTreeSegment(groupKey)}`
}

function buildCoreFieldNodeId(characterId: string, fieldKey: CharacterBrainFieldKey) {
  return `brain-tree:${encodeTreeSegment(characterId)}:core:${encodeTreeSegment(fieldKey)}`
}

function buildCoreDocumentNodeId(characterId: string, sourceId: string) {
  return `brain-tree:${encodeTreeSegment(characterId)}:core-doc:${encodeTreeSegment(sourceId)}`
}

function buildSoulNodeId(characterId: string, sourceId: string) {
  return `brain-tree:${encodeTreeSegment(characterId)}:soul:${encodeTreeSegment(sourceId)}`
}

function buildTraceNodeId(characterId: string, node: CharacterBrainTraceNode) {
  if (isFormalTraceDayNode(node)) {
    return `brain-tree:${encodeTreeSegment(characterId)}:trace:day:${encodeTreeSegment(node.pointDate || node.startDate || node.id)}`
  }
  if (node.systemRole === 'eventLeaf') {
    return `brain-tree:${encodeTreeSegment(characterId)}:trace:event:${encodeTreeSegment(node.id)}`
  }
  if (node.systemRole === 'arrangementLeaf') {
    return `brain-tree:${encodeTreeSegment(characterId)}:trace:arrangement:${encodeTreeSegment(node.id)}`
  }
  return `brain-tree:${encodeTreeSegment(characterId)}:trace:group:${encodeTreeSegment(node.id)}`
}

function encodeTreeSegment(value: string) {
  return encodeURIComponent(String(value || '').trim()).replace(/%/g, '~')
}
