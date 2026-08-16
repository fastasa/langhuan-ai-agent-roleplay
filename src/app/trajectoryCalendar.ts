import type {
  CharacterBrainTraceInnerEntry,
  CharacterBrainTraceNode,
  CharacterBrainTraceNodeKind,
  CharacterBrainTraceNodeType,
  CharacterBrainTraceStepUnit
} from '../types/characterBrain'

export type TrajectorySpan = Partial<Record<CharacterBrainTraceNodeKind, number>>

export type TrajectoryCalendarRule = {
  id: string
  monthsInYear: (year: number) => number
  daysInMonth: (year: number, month: number) => number
}

export type TrajectoryCalendarConfig = {
  monthDays?: number[]
}

export type TrajectoryDate = {
  year: number
  month: number
  day: number
}

export type TrajectoryCreateInput = {
  birthDate: string
  previousDate?: string
  sourceGranularity?: CharacterBrainTraceNodeKind | 'root'
  granularity?: CharacterBrainTraceNodeKind
  span: TrajectorySpan
  note?: string
  content?: string
  now: string
  id: string
}

export type TrajectoryCreateResult =
  | { ok: true; node: CharacterBrainTraceNode }
  | { ok: false; field: 'birthDate' | 'previousDate' | 'day' | 'month' | 'span'; message: string }

export type TrajectoryRangeCreateInput = {
  birthDate: string
  previousDate: string
  granularity?: CharacterBrainTraceNodeKind
  span: TrajectorySpan
  note?: string
  content?: string
  now: string
  id: string
}

export const TRAJECTORY_GRANULARITY_ORDER: CharacterBrainTraceNodeKind[] = ['day', 'month', 'year', 'multiYear', 'decade', 'century']

export const gregorianTrajectoryCalendar: TrajectoryCalendarRule = {
  id: 'gregorian',
  monthsInYear: () => 12,
  daysInMonth: (year, month) => new Date(year, month, 0).getDate()
}

export function normalizeTrajectoryCalendarConfig(raw: unknown): TrajectoryCalendarConfig {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const record = raw as Record<string, unknown>
  const monthDaysRaw = Array.isArray(record.monthDays)
    ? record.monthDays
    : Array.isArray(record.month_days)
      ? record.month_days
      : null
  const monthDays = monthDaysRaw
    ?.map((value) => Math.floor(Number(value)))
    .filter((value) => Number.isFinite(value))
    .filter((value) => value > 0)
  return monthDays?.length ? { monthDays } : {}
}

export function buildTrajectoryCalendarRule(
  calendarId = 'gregorian',
  calendarConfig: TrajectoryCalendarConfig | Record<string, unknown> = {}
): TrajectoryCalendarRule {
  const normalizedConfig = normalizeTrajectoryCalendarConfig(calendarConfig)
  const monthDays = normalizedConfig.monthDays
  return {
    id: String(calendarId || 'gregorian').trim() || 'gregorian',
    monthsInYear: () => monthDays?.length || gregorianTrajectoryCalendar.monthsInYear(0),
    daysInMonth: (year, month) => {
      const configured = monthDays?.[month - 1]
      return configured || gregorianTrajectoryCalendar.daysInMonth(year, month)
    }
  }
}

export function parseTrajectoryDateText(input: string, calendar: TrajectoryCalendarRule = gregorianTrajectoryCalendar): TrajectoryDate | null {
  const value = String(input || '').trim()
  const match = value.match(/^(\d{1,6})[-/年](\d{1,2})[-/月](\d{1,2})日?$/)
  if (!match) return null
  const date = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3])
  }
  if (!Number.isInteger(date.year) || !Number.isInteger(date.month) || !Number.isInteger(date.day)) return null
  if (date.year < 0 || date.month < 1 || date.day < 1) return null
  if (date.month > calendar.monthsInYear(date.year)) return null
  if (date.day > calendar.daysInMonth(date.year, date.month)) return null
  return date
}

export function formatTrajectoryDateText(date: TrajectoryDate) {
  const year = String(Math.max(0, Math.floor(date.year))).padStart(4, '0')
  const month = String(Math.max(1, Math.floor(date.month))).padStart(2, '0')
  const day = String(Math.max(1, Math.floor(date.day))).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function addTrajectorySpan(
  base: TrajectoryDate,
  span: TrajectorySpan,
  calendar: TrajectoryCalendarRule = gregorianTrajectoryCalendar
): { ok: true; date: TrajectoryDate } | { ok: false; field: 'day' | 'month' | 'span'; message: string } {
  const dayDelta = normalizeSpanNumber(span.day)
  const monthDelta = normalizeSpanNumber(span.month)
  const yearDelta = normalizeSpanNumber(span.year)
  const decadeDelta = normalizeSpanNumber(span.decade)
  const centuryDelta = normalizeSpanNumber(span.century)
  if (!dayDelta && !monthDelta && !yearDelta && !decadeDelta && !centuryDelta) {
    return { ok: false, field: 'span', message: '至少填写一个跨度。' }
  }

  const nextDay = base.day + dayDelta
  if (nextDay > calendar.daysInMonth(base.year, base.month)) {
    return { ok: false, field: 'day', message: '日超过当前月份上限。' }
  }

  const nextMonth = base.month + monthDelta
  if (nextMonth > calendar.monthsInYear(base.year)) {
    return { ok: false, field: 'month', message: '月超过当前年份上限。' }
  }

  return {
    ok: true,
    date: {
      year: base.year + yearDelta + (decadeDelta * 10) + (centuryDelta * 100),
      month: nextMonth,
      day: nextDay
    }
  }
}

export function addTrajectoryDays(
  base: TrajectoryDate,
  days: number,
  calendar: TrajectoryCalendarRule = gregorianTrajectoryCalendar
): { ok: true; date: TrajectoryDate } | { ok: false; field: 'day' | 'month'; message: string } {
  let remaining = Math.max(0, Math.floor(Number(days) || 0))
  let date = { ...base }
  while (remaining > 0) {
    const maxDay = calendar.daysInMonth(date.year, date.month)
    if (date.day < maxDay) {
      date = { ...date, day: date.day + 1 }
    } else if (date.month < calendar.monthsInYear(date.year)) {
      date = { year: date.year, month: date.month + 1, day: 1 }
    } else {
      date = { year: date.year + 1, month: 1, day: 1 }
    }
    if (date.month > calendar.monthsInYear(date.year)) {
      return { ok: false, field: 'month', message: '月超过当前年份上限。' }
    }
    if (date.day > calendar.daysInMonth(date.year, date.month)) {
      return { ok: false, field: 'day', message: '日超过当前月份上限。' }
    }
    remaining -= 1
  }
  return { ok: true, date }
}

export function createTrajectoryNode(input: TrajectoryCreateInput): TrajectoryCreateResult {
  const birthDate = parseTrajectoryDateText(input.birthDate)
  if (!birthDate) return { ok: false, field: 'birthDate', message: '出生日期格式不正确。' }
  const baseDate = input.previousDate ? parseTrajectoryDateText(input.previousDate) : birthDate
  if (!baseDate) return { ok: false, field: 'previousDate', message: '上一个轨迹节点日期格式不正确。' }
  const nextDate = addTrajectorySpan(baseDate, input.span)
  if (!nextDate.ok) return nextDate

  const pointDate = formatTrajectoryDateText(nextDate.date)
  const title = buildTrajectoryPointTitle(nextDate.date)
  const note = String(input.note || '').trim()
  const content = String(input.content || '').trim()
  const offsetDays = diffTrajectoryDateDays(birthDate, nextDate.date)
  const semanticGranularity = resolveSpanGranularity(input.span)
  return {
    ok: true,
    node: {
      id: input.id,
      title,
      summary: note,
      parentId: 'brain:trajectory',
      kind: semanticGranularity,
      nodeType: 'single',
      granularity: semanticGranularity,
      startDate: pointDate,
      displayTitle: title,
      note,
      innerEntries: buildDefaultInnerEntries(semanticGranularity, nextDate.date),
      linkIds: [],
      autoGenerated: false,
      timeLabel: `${pointDate}｜${buildTrajectoryAgeLabel(birthDate, nextDate.date)}`,
      pointDate,
      offsetDays,
      ageLabel: buildTrajectoryAgeLabel(birthDate, nextDate.date),
      stepUnit: resolveKindStepUnit(semanticGranularity),
      stepAmount: resolveSpanStepAmount(input.span, semanticGranularity),
      relatedEntityIds: [],
      tags: [],
      content,
      summaryMode: 'manual',
      summarySourceNodeIds: [],
      confirmed: true,
      createdAt: input.now,
      updatedAt: input.now
    }
  }
}

export function createTrajectoryRangeNode(input: TrajectoryRangeCreateInput): TrajectoryCreateResult {
  const birthDate = parseTrajectoryDateText(input.birthDate)
  if (!birthDate) return { ok: false, field: 'birthDate', message: '出生日期格式不正确。' }
  const baseDate = parseTrajectoryDateText(input.previousDate)
  if (!baseDate) return { ok: false, field: 'previousDate', message: '上一个轨迹节点日期格式不正确。' }
  const nextDate = addTrajectorySpan(baseDate, input.span)
  if (!nextDate.ok) return nextDate
  const startDate = nextDate.date
  const targetGranularity = input.granularity || resolveSpanGranularity(input.span)
  const endDate = resolveTrajectoryUnitEnd(startDate, targetGranularity)
  const startDateText = formatTrajectoryDateText(startDate)
  const endDateText = formatTrajectoryDateText(endDate)
  const title = buildTrajectoryRangeTitle(startDateText, endDateText)
  const note = String(input.note || '').trim()
  const content = String(input.content || '').trim()
  const offsetDays = diffTrajectoryDateDays(birthDate, endDate)
  const inferredGranularity = inferTrajectoryRangeGranularity(startDate, endDate)
  const finer = resolveFinerGranularity(inferredGranularity)
  return {
    ok: true,
    node: {
      id: input.id,
      title,
      summary: note,
      parentId: 'brain:trajectory',
      kind: inferredGranularity,
      nodeType: startDateText === endDateText ? 'single' : 'range',
      granularity: inferredGranularity,
      startDate: startDateText,
      endDate: startDateText === endDateText ? undefined : endDateText,
      displayTitle: title,
      note,
      innerEntries: finer ? buildChildEntriesForRange(startDate, endDate, finer) : [],
      linkIds: [],
      autoGenerated: false,
      timeLabel: `${startDateText}-${endDateText}｜${buildTrajectoryAgeLabel(birthDate, endDate)}`,
      pointDate: endDateText,
      offsetDays,
      ageLabel: buildTrajectoryAgeLabel(birthDate, endDate),
      stepUnit: resolveKindStepUnit(inferredGranularity),
      stepAmount: 1,
      relatedEntityIds: [],
      tags: [],
      content,
      summaryMode: 'manual',
      summarySourceNodeIds: [],
      confirmed: true,
      createdAt: input.now,
      updatedAt: input.now
    }
  }
}

export function buildTrajectoryDisplayTitle(
  previous: TrajectoryDate,
  next: TrajectoryDate,
  granularity: CharacterBrainTraceNodeKind,
  sourceGranularity?: CharacterBrainTraceNodeKind | 'root'
) {
  void previous
  void granularity
  void sourceGranularity
  return buildTrajectoryPointTitle(next)
}

export function buildTrajectoryPointTitle(date: string | TrajectoryDate) {
  const parsed = typeof date === 'string' ? parseTrajectoryDateText(date) : date
  if (!parsed) return typeof date === 'string' ? date : ''
  return `${parsed.year}年${parsed.month}月${parsed.day}日`
}

export function buildTrajectoryRangeTitle(startDate: string, endDate: string) {
  const start = parseTrajectoryDateText(startDate)
  const end = parseTrajectoryDateText(endDate)
  if (!start || !end) return `${startDate}-${endDate}`
  if (start.year !== end.year) {
    return `${buildTrajectoryPointTitle(start)}-${buildTrajectoryPointTitle(end)}`
  }
  if (start.month !== end.month) {
    return `${start.year}年\n${start.month}月${start.day}日-${end.month}月${end.day}日`
  }
  return `${start.year}年${start.month}月\n${start.day}日-${end.day}日`
}

export function buildTrajectoryContextLabels(nodes: CharacterBrainTraceNode[]) {
  const ordered = sortTrajectoryNodes(nodes)
  const labels = new Map<string, string>()
  let previousAnchor: TrajectoryDate | null = null
  ordered.forEach((node) => {
    const start = parseTrajectoryDateText(node.startDate || node.pointDate)
    if (!start) {
      labels.set(node.id, node.displayTitle || node.title)
      return
    }
    const shouldForceFullStart = Boolean(
      node.nodeType === 'range'
      && previousAnchor
      && formatTrajectoryDateText(previousAnchor) === formatTrajectoryDateText(start)
    )
    const startLabel = previousAnchor && !shouldForceFullStart
      ? formatTrajectoryDateByContext(start, previousAnchor)
      : buildTrajectoryPointTitle(start)
    if (node.nodeType === 'range' && node.endDate) {
      const end = parseTrajectoryDateText(node.endDate)
      if (!end) {
        labels.set(node.id, node.displayTitle || node.title)
      } else {
        labels.set(node.id, `${startLabel}-${formatTrajectoryDateByContext(end, start)}`)
      }
    } else {
      labels.set(node.id, startLabel)
    }
    previousAnchor = start
  })
  return labels
}

export function coarsenTrajectoryNodes(nodes: CharacterBrainTraceNode[], selectedIds: string[], now: string, id: string) {
  const selectedSet = new Set(selectedIds)
  const ordered = sortTrajectoryNodes(nodes)
  const selected = ordered.filter((node) => selectedSet.has(node.id))
  if (!selected.length || !isContinuousTrajectorySelection(ordered, selectedIds)) return null
  const start = selected[0]
  const end = selected[selected.length - 1]
  const startDateText = start.startDate || start.pointDate
  const endDateText = end.endDate || end.startDate || end.pointDate
  const startDate = parseTrajectoryDateText(startDateText)
  const endDate = parseTrajectoryDateText(endDateText)
  if (!startDate || !endDate) return null
  const granularity = inferTrajectoryRangeGranularity(startDate, endDate)
  const displayTitle = buildTrajectoryRangeTitle(startDateText, endDateText)
  const innerEntries = selected
    .filter((node) => hasTraceNodeContent(node))
    .map((node) => traceNodeToInnerEntry(node))
  const merged: CharacterBrainTraceNode = {
    ...start,
    id,
    title: displayTitle,
    summary: selected.map((node) => node.note || node.summary).filter(Boolean).join('\n'),
    kind: granularity,
    granularity,
    nodeType: 'range',
    startDate: start.startDate || start.pointDate,
    endDate: end.endDate || end.startDate || end.pointDate,
    displayTitle,
    note: selected.map((node) => node.note || node.summary).filter(Boolean).join('\n'),
    content: selected.map((node) => node.content).filter(Boolean).join('\n\n'),
    innerEntries,
    linkIds: Array.from(new Set(selected.flatMap((node) => node.linkIds || node.relatedEntityIds || []))),
    relatedEntityIds: Array.from(new Set(selected.flatMap((node) => node.relatedEntityIds || []))),
    tags: Array.from(new Set(selected.flatMap((node) => node.tags || []))),
    pointDate: end.endDate || end.startDate || end.pointDate,
    updatedAt: now
  }
  return sortTrajectoryNodes([...ordered.filter((node) => !selectedSet.has(node.id)), merged])
}

export function refineTrajectoryNodes(
  nodes: CharacterBrainTraceNode[],
  selectedIds: string[],
  mode: 'fill-empty' | 'content-only',
  now: string,
  createId: () => string
) {
  const selectedSet = new Set(selectedIds)
  const ordered = sortTrajectoryNodes(nodes)
  const selected = ordered.filter((node) => selectedSet.has(node.id))
  if (!selected.length || !isContinuousTrajectorySelection(ordered, selectedIds)) return null
  const targetGranularity = resolveFinerGranularity(resolveCoarsestGranularity(selected.map((node) => inferTrajectoryNodeGranularity(node))))
  if (!targetGranularity) return null
  const refined = selected.flatMap((node) => buildRefinedNodesFromNode(node, targetGranularity, mode, now, createId))
  return sortTrajectoryNodes([...ordered.filter((node) => !selectedSet.has(node.id)), ...refined])
}

export function isContinuousTrajectorySelection(orderedNodes: CharacterBrainTraceNode[], selectedIds: string[]) {
  const selectedSet = new Set(selectedIds)
  const indexes = orderedNodes
    .map((node, index) => selectedSet.has(node.id) ? index : -1)
    .filter((index) => index >= 0)
  if (!indexes.length) return false
  const min = Math.min(...indexes)
  const max = Math.max(...indexes)
  return max - min + 1 === indexes.length
}

export function sortTrajectoryNodes(nodes: CharacterBrainTraceNode[]) {
  return [...nodes].sort((a, b) => {
    const startDiff = String(a.startDate || a.pointDate || '').localeCompare(String(b.startDate || b.pointDate || ''))
    if (startDiff !== 0) return startDiff
    return String(a.id).localeCompare(String(b.id))
  })
}

export function resolveFinerGranularity(kind: CharacterBrainTraceNodeKind | 'root') {
  if (kind === 'century') return 'decade'
  if (kind === 'decade') return 'year'
  if (kind === 'multiYear') return 'year'
  if (kind === 'year') return 'month'
  if (kind === 'month') return 'day'
  return null
}

export function resolveCoarserGranularity(kinds: CharacterBrainTraceNodeKind[]) {
  const coarsest = resolveCoarsestGranularity(kinds)
  if (coarsest === 'day') return 'month'
  if (coarsest === 'month') return 'year'
  if (coarsest === 'year') return 'multiYear'
  if (coarsest === 'multiYear') return 'century'
  if (coarsest === 'decade') return 'century'
  return null
}

export function resolveCoarsestGranularity(kinds: CharacterBrainTraceNodeKind[]) {
  return kinds.reduce((coarsest, kind) => {
    return TRAJECTORY_GRANULARITY_ORDER.indexOf(kind) > TRAJECTORY_GRANULARITY_ORDER.indexOf(coarsest) ? kind : coarsest
  }, 'day' as CharacterBrainTraceNodeKind)
}

export function inferTrajectoryNodeGranularity(node: Pick<CharacterBrainTraceNode, 'nodeType' | 'startDate' | 'endDate' | 'pointDate' | 'granularity' | 'kind'>) {
  const start = parseTrajectoryDateText(node.startDate || node.pointDate)
  const end = parseTrajectoryDateText(node.endDate || node.startDate || node.pointDate)
  if (!start || !end) return node.granularity || node.kind || 'day'
  if ((node.nodeType || 'single') === 'single' || formatTrajectoryDateText(start) === formatTrajectoryDateText(end)) {
    return node.granularity || node.kind || 'day'
  }
  return inferTrajectoryRangeGranularity(start, end)
}

function buildRefinedNodesFromNode(
  node: CharacterBrainTraceNode,
  targetGranularity: CharacterBrainTraceNodeKind,
  mode: 'fill-empty' | 'content-only',
  now: string,
  createId: () => string
) {
  if (mode === 'content-only') {
    const entries = (node.innerEntries || []).filter((entry) => entry.content || entry.note || entry.linkIds.length)
    if (entries.length) return entries.map((entry) => innerEntryToTraceNode(entry, node, createId(), now))
    if (hasTraceNodeContent(node)) return [{ ...node, granularity: targetGranularity, kind: targetGranularity, updatedAt: now }]
    return [buildRangePlaceholderNode(node, targetGranularity, createId(), now)]
  }
  return buildFullChildDateEntries(node, targetGranularity).map((entry) => innerEntryToTraceNode(entry, node, createId(), now))
}

function buildDefaultInnerEntries(granularity: CharacterBrainTraceNodeKind, date: TrajectoryDate): CharacterBrainTraceInnerEntry[] {
  const finer = resolveFinerGranularity(granularity)
  if (!finer) return []
  return buildChildEntriesForRange(date, date, finer)
}

function resolveTrajectoryUnitEnd(date: TrajectoryDate, granularity: CharacterBrainTraceNodeKind, calendar: TrajectoryCalendarRule = gregorianTrajectoryCalendar) {
  if (granularity === 'day') return { ...date }
  if (granularity === 'month') {
    return {
      year: date.year,
      month: date.month,
      day: calendar.daysInMonth(date.year, date.month)
    }
  }
  if (granularity === 'year') {
    const lastMonth = calendar.monthsInYear(date.year)
    return {
      year: date.year,
      month: lastMonth,
      day: calendar.daysInMonth(date.year, lastMonth)
    }
  }
  if (granularity === 'multiYear') {
    const endYear = Math.max(date.year, date.year)
    const lastMonth = calendar.monthsInYear(endYear)
    return {
      year: endYear,
      month: lastMonth,
      day: calendar.daysInMonth(endYear, lastMonth)
    }
  }
  if (granularity === 'decade') {
    const endYear = Math.floor(date.year / 10) * 10 + 9
    const lastMonth = calendar.monthsInYear(endYear)
    return {
      year: endYear,
      month: lastMonth,
      day: calendar.daysInMonth(endYear, lastMonth)
    }
  }
  const endYear = Math.floor(date.year / 100) * 100 + 99
  const lastMonth = calendar.monthsInYear(endYear)
  return {
    year: endYear,
    month: lastMonth,
    day: calendar.daysInMonth(endYear, lastMonth)
  }
}

function buildFullChildDateEntries(node: CharacterBrainTraceNode, targetGranularity: CharacterBrainTraceNodeKind) {
  const start = parseTrajectoryDateText(node.startDate || node.pointDate)
  const end = parseTrajectoryDateText(node.endDate || node.startDate || node.pointDate)
  if (!start || !end) return []
  return buildChildEntriesForRange(start, end, targetGranularity)
}

function buildChildEntriesForRange(start: TrajectoryDate, end: TrajectoryDate, granularity: CharacterBrainTraceNodeKind): CharacterBrainTraceInnerEntry[] {
  const entries: CharacterBrainTraceInnerEntry[] = []
  if (granularity === 'day') {
    const maxDay = gregorianTrajectoryCalendar.daysInMonth(start.year, start.month)
    for (let day = 1; day <= maxDay; day += 1) {
      const date = { year: start.year, month: start.month, day }
      entries.push(buildInnerEntry(granularity, formatTrajectoryDateText(date), undefined, `${day}日`))
    }
  } else if (granularity === 'month') {
    for (let month = 1; month <= gregorianTrajectoryCalendar.monthsInYear(start.year); month += 1) {
      const date = { year: start.year, month, day: 1 }
      entries.push(buildInnerEntry(granularity, formatTrajectoryDateText(date), undefined, `${month}月`))
    }
  } else if (granularity === 'year') {
    const endYear = Math.max(start.year, end.year)
    for (let year = start.year; year <= endYear; year += 1) {
      const date = { year, month: 1, day: 1 }
      entries.push(buildInnerEntry(granularity, formatTrajectoryDateText(date), undefined, `${year}年`))
    }
  } else if (granularity === 'multiYear' || granularity === 'decade') {
    const endYear = Math.max(start.year, end.year)
    for (let year = start.year; year <= endYear; year += 10) {
      const date = { year, month: 1, day: 1 }
      entries.push(buildInnerEntry(granularity, formatTrajectoryDateText(date), undefined, `${year}年`))
    }
  }
  return entries
}

function buildInnerEntry(granularity: CharacterBrainTraceNodeKind, startDate: string, endDate: string | undefined, displayTitle: string): CharacterBrainTraceInnerEntry {
  return {
    id: `trace-inner:${granularity}:${startDate}:${endDate || startDate}`,
    nodeType: endDate && endDate !== startDate ? 'range' : 'single',
    granularity,
    startDate,
    endDate,
    displayTitle,
    note: '',
    content: '',
    linkIds: [],
    sourceNodeIds: []
  }
}

function buildRangePlaceholderNode(node: CharacterBrainTraceNode, granularity: CharacterBrainTraceNodeKind, id: string, now: string): CharacterBrainTraceNode {
  const startDate = node.startDate || node.pointDate
  const endDate = node.endDate || startDate
  const displayTitle = buildTrajectoryRangeTitle(startDate, endDate)
  return {
    ...node,
    id,
    title: displayTitle,
    summary: '',
    kind: granularity,
    granularity,
    nodeType: startDate === endDate ? 'single' : 'range',
    startDate,
    endDate,
    displayTitle,
    note: '',
    content: '',
    updatedAt: now
  }
}

function innerEntryToTraceNode(entry: CharacterBrainTraceInnerEntry, source: CharacterBrainTraceNode, id: string, now: string): CharacterBrainTraceNode {
  return {
    ...source,
    id,
    title: entry.displayTitle,
    summary: entry.note,
    kind: entry.granularity,
    granularity: entry.granularity,
    nodeType: entry.nodeType,
    startDate: entry.startDate,
    endDate: entry.endDate,
    displayTitle: entry.displayTitle,
    note: entry.note,
    content: entry.content,
    innerEntries: [],
    linkIds: [...entry.linkIds],
    relatedEntityIds: [...entry.linkIds],
    pointDate: entry.endDate || entry.startDate,
    timeLabel: entry.endDate ? `${entry.startDate}-${entry.endDate}` : entry.startDate,
    updatedAt: now,
    createdAt: now
  }
}

function traceNodeToInnerEntry(node: CharacterBrainTraceNode): CharacterBrainTraceInnerEntry {
  return {
    id: `trace-inner:${node.id}`,
    nodeType: node.nodeType || 'single',
    granularity: node.granularity || node.kind,
    startDate: node.startDate || node.pointDate,
    endDate: node.endDate,
    displayTitle: node.displayTitle || node.title,
    note: node.note || node.summary,
    content: node.content,
    linkIds: [...(node.linkIds || node.relatedEntityIds || [])],
    sourceNodeIds: [node.id]
  }
}

function hasTraceNodeContent(node: CharacterBrainTraceNode) {
  return Boolean((node.note || node.summary || node.content || '').trim() || (node.linkIds || []).length || (node.relatedEntityIds || []).length)
}

function normalizeSpanNumber(raw: unknown) {
  const value = Math.floor(Number(raw) || 0)
  return Number.isFinite(value) ? Math.max(0, value) : 0
}

function resolveSpanStepAmount(span: TrajectorySpan, granularity: CharacterBrainTraceNodeKind) {
  return normalizeSpanNumber(span[granularity]) || 1
}

function resolveSpanGranularity(span: TrajectorySpan): CharacterBrainTraceNodeKind {
  if (normalizeSpanNumber(span.century) > 0) return 'century'
  if (normalizeSpanNumber(span.decade) > 0) return 'decade'
  if (normalizeSpanNumber(span.year) > 0) return 'year'
  if (normalizeSpanNumber(span.month) > 0) return 'month'
  return 'day'
}

function resolveKindStepUnit(kind: CharacterBrainTraceNodeKind): CharacterBrainTraceStepUnit {
  if (kind === 'day') return 'day'
  if (kind === 'month') return 'month'
  return 'year'
}

function inferTrajectoryRangeGranularity(start: TrajectoryDate, end: TrajectoryDate): CharacterBrainTraceNodeKind {
  if (start.year === end.year && start.month === end.month) return 'month'
  if (start.year === end.year) return 'year'
  if (start.year !== end.year) return 'multiYear'
  return 'day'
}

function formatTrajectoryDateByContext(date: TrajectoryDate, previous: TrajectoryDate) {
  if (date.year !== previous.year) return buildTrajectoryPointTitle(date)
  if (date.month !== previous.month) return `${date.month}月${date.day}日`
  return `${date.day}日`
}

function diffTrajectoryDateDays(start: TrajectoryDate, end: TrajectoryDate) {
  const startUtc = Date.UTC(start.year, start.month - 1, start.day)
  const endUtc = Date.UTC(end.year, end.month - 1, end.day)
  return Math.max(0, Math.round((endUtc - startUtc) / 86400000))
}

function buildTrajectoryAgeLabel(birthDate: TrajectoryDate, pointDate: TrajectoryDate) {
  const years = Math.max(0, pointDate.year - birthDate.year)
  if (years <= 0) return `出生后第${diffTrajectoryDateDays(birthDate, pointDate)}日`
  return `${years}岁`
}
