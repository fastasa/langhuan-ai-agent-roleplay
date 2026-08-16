import type { Character } from '../types'
import type { CharacterBrainTraceNode } from '../types/characterBrain'
import {
  buildCharacterBrainTraceNodesChange,
  readCharacterBrainTraceNodes,
  readCharacterBrainTrajectoryMeta
} from './characterBrain'
import {
  createCharacterBrainTraceArrangementTreeNode,
  createCharacterBrainTraceBatchTreeNodes,
  createCharacterBrainTraceBranchTreeNode,
  createCharacterBrainTraceEventTreeNode,
  updateCharacterBrainTraceTreeNode
} from './characterBrainTreeModel'
import {
  parseTrajectoryMarkdown,
  validateTrajectoryRootImportBirthDate,
  type TrajectoryMarkdownImportEntry
} from './trajectoryMarkdownImport'

export type TrajectoryMarkdownApplyOptions = {
  scope?: 'traceRoot' | 'all'
  now?: string
}

export type TrajectoryMarkdownApplyResult = {
  ok: boolean
  changes: Record<string, unknown>
  importedCount: number
  importedNodeIds: string[]
  skippedCount: number
  warnings: Array<{ message: string; code?: string; title?: string }>
  message?: string
}

export function applyTrajectoryMarkdownToCharacter(
  character: Character,
  text: string,
  options: TrajectoryMarkdownApplyOptions = {}
): TrajectoryMarkdownApplyResult {
  const parsed = parseTrajectoryMarkdown(text)
  const warnings: TrajectoryMarkdownApplyResult['warnings'] = parsed.warnings.map((warning) => ({ ...warning }))
  if (options.scope === 'traceRoot') {
    const validation = validateTrajectoryRootImportBirthDate(
      parsed.entries,
      readCharacterBrainTrajectoryMeta(character).birthDate
    )
    if (!validation.ok) {
      return {
        ok: false,
        changes: {},
        importedCount: 0,
        importedNodeIds: [],
        skippedCount: parsed.entries.length + parsed.warnings.length,
        warnings,
        message: validation.message
      }
    }
  }

  if (!parsed.entries.length) {
    return {
      ok: false,
      changes: {},
      importedCount: 0,
      importedNodeIds: [],
      skippedCount: parsed.warnings.length,
      warnings,
      message: '轨迹正文没有可写条目。'
    }
  }

  const now = options.now || new Date().toISOString()
  let workingCharacter = character
  let changes: Record<string, unknown> = {}
  let importedCount = 0
  const importedNodeIds: string[] = []
  let skippedCount = parsed.warnings.length

  parsed.entries.forEach((entry) => {
    let targetNodeId = resolveTrajectoryImportTargetNodeId(entry, readCharacterBrainTraceNodes(workingCharacter))
    if (!targetNodeId) {
      const createResult = createTraceStructureForTrajectoryImportEntry(workingCharacter, entry, now)
      if (!createResult.ok) {
        skippedCount += 1
        warnings.push({ message: createResult.message || `无法创建轨迹结构：${entry.title}` })
        return
      }
      workingCharacter = { ...workingCharacter, ...createResult.changes } as Character
      changes = { ...changes, ...createResult.changes }
      targetNodeId = resolveTrajectoryImportTargetNodeId(entry, readCharacterBrainTraceNodes(workingCharacter))
    }
    if (!targetNodeId) {
      skippedCount += 1
      warnings.push({ message: `无法定位轨迹挂载节点：${entry.title || entry.startDate}` })
      return
    }

    if (entry.granularity === 'day' && entry.dayTarget !== 'overview') {
      const childResult = createTrajectoryImportDayDocument(workingCharacter, targetNodeId, entry, now)
      const childChanges = childResult.changes
      if (!Object.keys(childChanges).length) {
        skippedCount += 1
        warnings.push({ message: `无法写入日枝子单位：${entry.title || entry.startDate}` })
        return
      }
      workingCharacter = { ...workingCharacter, ...childChanges } as Character
      changes = { ...changes, ...childChanges }
      if (childResult.nodeId) importedNodeIds.push(childResult.nodeId)
      importedCount += 1
      return
    }

    const updateChanges = updateCharacterBrainTraceTreeNode(workingCharacter, targetNodeId, {
      subtitle: entry.subtitle || entry.title,
      summary: entry.summary,
      content: entry.content,
      tags: entry.tags,
      now
    })
    workingCharacter = { ...workingCharacter, ...updateChanges } as Character
    changes = { ...changes, ...updateChanges }

    const confirmedChanges = setTrajectoryImportNodeConfirmed(workingCharacter, targetNodeId, entry.confirmed, now)
    workingCharacter = { ...workingCharacter, ...confirmedChanges } as Character
    changes = { ...changes, ...confirmedChanges }
    importedNodeIds.push(targetNodeId)
    importedCount += 1
  })

  return {
    ok: importedCount > 0,
    changes,
    importedCount,
    importedNodeIds,
    skippedCount,
    warnings,
    message: importedCount > 0 ? undefined : '轨迹正文未写入任何条目。'
  }
}

function createTraceStructureForTrajectoryImportEntry(
  character: Character,
  entry: TrajectoryMarkdownImportEntry,
  now: string
) {
  if (entry.granularity === 'day') {
    return createCharacterBrainTraceBatchTreeNodes(character, {
      granularity: 'day',
      dates: [entry.startDate],
      subtitle: entry.dayTarget === 'overview' ? entry.subtitle || entry.title : '',
      summary: entry.dayTarget === 'overview' ? entry.summary : '',
      content: entry.dayTarget === 'overview' ? entry.content : '',
      tags: entry.dayTarget === 'overview' ? entry.tags : [],
      now
    })
  }
  if (entry.granularity === 'month') {
    const date = parseImportDateParts(entry.startDate)
    return createCharacterBrainTraceBatchTreeNodes(character, {
      granularity: 'month',
      year: date.year,
      months: [date.month],
      now
    })
  }
  const startYear = parseImportDateParts(entry.startDate).year
  const endYear = parseImportDateParts(entry.endDate).year
  if (entry.granularity === 'multiYear' || startYear !== endYear) {
    return createCharacterBrainTraceBranchTreeNode(character, {
      kind: 'multiYear',
      year: startYear,
      spanYears: Math.max(1, endYear - startYear + 1),
      now
    })
  }
  return createCharacterBrainTraceBatchTreeNodes(character, {
    granularity: 'year',
    years: [startYear],
    now
  })
}

function resolveTrajectoryImportTargetNodeId(entry: TrajectoryMarkdownImportEntry, nodes: CharacterBrainTraceNode[]) {
  if (entry.granularity === 'day') {
    return nodes.find((node) => node.systemRole === 'dayLeaf' && (node.pointDate || node.startDate) === entry.startDate)?.id || ''
  }
  if (entry.granularity === 'month') {
    const { year, month } = parseImportDateParts(entry.startDate)
    return nodes.find((node) => (
      node.systemRole === 'monthBranch'
      && parseImportDateParts(node.startDate).year === year
      && parseImportDateParts(node.startDate).month === month
    ))?.id || ''
  }
  if (entry.granularity === 'year') {
    const year = parseImportDateParts(entry.startDate).year
    return nodes.find((node) => node.systemRole === 'yearBranch' && parseImportDateParts(node.startDate).year === year)?.id || ''
  }
  return nodes.find((node) => (
    node.systemRole === 'multiYearBranch'
    && node.startDate === entry.startDate
    && normalizeImportRangeEnd(node.endDate || node.pointDate || node.startDate) === normalizeImportRangeEnd(entry.endDate)
  ))?.id || ''
}

function createTrajectoryImportDayDocument(
  character: Character,
  dayNodeId: string,
  entry: TrajectoryMarkdownImportEntry,
  now: string
) {
  const normalizedTitle = String(entry.subtitle || entry.title || '未命名事件').trim()
  const baseId = `brain:trajectory:node:${entry.dayTarget === 'arrangement' ? 'arrangement' : 'event'}_${entry.startDate.replace(/-/g, '_')}_${encodeTrajectoryImportIdSegment(normalizedTitle)}`
  const id = makeUniqueTrajectoryImportNodeId(baseId, readCharacterBrainTraceNodes(character))
  if (entry.dayTarget === 'arrangement') {
    return {
      nodeId: id,
      changes: createCharacterBrainTraceArrangementTreeNode(character, {
        id,
        title: normalizedTitle || '未命名安排',
        summary: entry.summary,
        content: entry.content,
        parentId: dayNodeId,
        tags: entry.tags,
        relatedEntityIds: entry.relatedEntities,
        activationRule: entry.activationRule || { date: entry.startDate, recurrence: 'once' },
        recallPolicy: entry.recallPolicy || { level: 'summary', priority: 'normal' },
        now
      })
    }
  }
  return {
    nodeId: id,
    changes: createCharacterBrainTraceEventTreeNode(character, {
      id,
      title: normalizedTitle || '未命名事件',
      summary: entry.summary,
      content: entry.content,
      parentId: dayNodeId,
      tags: entry.tags,
      relatedEntityIds: entry.relatedEntities,
      now
    })
  }
}

function setTrajectoryImportNodeConfirmed(character: Character, nodeId: string, confirmed: boolean, now: string) {
  const nextNodes = readCharacterBrainTraceNodes(character).map((node) => (
    node.id === nodeId
      ? { ...node, confirmed, updatedAt: now }
      : node
  ))
  return buildCharacterBrainTraceNodesChange(nextNodes)
}

function makeUniqueTrajectoryImportNodeId(baseId: string, nodes: CharacterBrainTraceNode[]) {
  const usedIds = new Set(nodes.map((node) => node.id))
  let id = baseId
  let index = 1
  while (usedIds.has(id)) {
    id = `${baseId}_${index}`
    index += 1
  }
  return id
}

// 导出供 characterBrainSeedFromGeneration（生成角色时的大脑种子写入）复用同一套 id 段编码
export function encodeTrajectoryImportIdSegment(value: string) {
  return String(value || 'untitled')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^\w\u4e00-\u9fa5-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    || 'untitled'
}

function parseImportDateParts(date: string) {
  const [year, month, day] = String(date || '').split('-').map((part) => Number(part))
  return {
    year: Number.isFinite(year) ? year : 0,
    month: Number.isFinite(month) ? month : 1,
    day: Number.isFinite(day) ? day : 1
  }
}

function normalizeImportRangeEnd(date: string) {
  const parts = parseImportDateParts(date)
  return `${String(Math.max(0, parts.year)).padStart(4, '0')}-${String(Math.max(1, parts.month)).padStart(2, '0')}-${String(Math.max(1, parts.day)).padStart(2, '0')}`
}
