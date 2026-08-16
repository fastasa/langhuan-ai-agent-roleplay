import {
  addTrajectoryDays,
  buildTrajectoryCalendarRule,
  formatTrajectoryDateText,
  normalizeTrajectoryCalendarConfig,
  parseTrajectoryDateText,
  type TrajectoryCalendarConfig,
  type TrajectoryDate
} from './trajectoryCalendar'
import type { CharacterBrainTraceNode } from '../types/characterBrain'
import type { UnitView } from '../types/unitView'

export type TraceCreateGranularity = 'day' | 'month' | 'year'

export type TraceYearCreatePlanItem =
  | { kind: 'multiYear'; year: number; spanYears: number; years: number[] }
  | { kind: 'year'; year: number; years: number[] }

export interface TraceMonthCreatePlanItem {
  kind: 'month'
  year: number
  month: number
}

export interface TraceDayCreatePlanItem {
  kind: 'day'
  date: string
  year: number
  month: number
  day: number
}

export interface TraceCreateDefaultDateDraft {
  year: string
  month: string
  date: string
}

export interface TraceCreateContext {
  birthDate: string
  calendarConfig?: TrajectoryCalendarConfig | Record<string, unknown>
  minDate?: string
  maxDate?: string
  coverageEndDate?: string
}

export function normalizeContinuousYears(years: Array<number | string>): number[] {
  const normalized = normalizeIntegerList(years).filter((year) => year > 0)
  if (!normalized.length) return []
  const start = Math.min(...normalized)
  const end = Math.max(...normalized)
  return Array.from({ length: end - start + 1 }, (_, index) => start + index)
}

export function buildTraceYearCreatePlan(years: Array<number | string>, context: TraceCreateContext): TraceYearCreatePlanItem[] {
  const allowedYears = normalizeContinuousYears(years).filter((year) => isTraceYearSelectable(year, context))
  if (!allowedYears.length) return []
  const result: TraceYearCreatePlanItem[] = []
  let cursor = allowedYears[0]
  const end = allowedYears[allowedYears.length - 1]
  while (cursor <= end) {
    const remaining = end - cursor + 1
    if (remaining >= 100) {
      result.push(buildMultiYearPlanItem(cursor, 100))
      cursor += 100
      continue
    }
    if (remaining >= 10) {
      result.push(buildMultiYearPlanItem(cursor, 10))
      cursor += 10
      continue
    }
    result.push({ kind: 'year', year: cursor, years: [cursor] })
    cursor += 1
  }
  return result
}

export function buildTraceMonthCreatePlan(
  year: number | string,
  months: Array<number | string>,
  context: TraceCreateContext
): TraceMonthCreatePlanItem[] {
  const normalizedYear = normalizePositiveInteger(year)
  if (!normalizedYear || !isTraceYearSelectable(normalizedYear, context)) return []
  return normalizeIntegerList(months)
    .filter((month) => isTraceMonthSelectable(normalizedYear, month, context))
    .map((month) => ({ kind: 'month' as const, year: normalizedYear, month }))
}

export function buildTraceDayCreatePlan(
  dates: string[],
  context: TraceCreateContext & { existingDates?: string[] }
): TraceDayCreatePlanItem[] {
  const existing = new Set(normalizeDateTexts(context.existingDates || [], context))
  return normalizeDateTexts(dates, context)
    .filter((date) => !existing.has(date))
    .map((date) => parseDateOrNull(date, context))
    .filter((date): date is TrajectoryDate => Boolean(date) && isTraceDateSelectable(date as TrajectoryDate, context))
    .map((date) => ({
      kind: 'day' as const,
      date: formatTrajectoryDateText(date),
      year: date.year,
      month: date.month,
      day: date.day
    }))
}

export function isTraceYearSelectable(year: number | string, context: TraceCreateContext): boolean {
  const normalizedYear = normalizePositiveInteger(year)
  if (!normalizedYear) return false
  const birth = parseBirthDate(context)
  if (!birth || normalizedYear < birth.year) return false
  const min = parseDateOrNull(context.minDate || '', context)
  if (min && normalizedYear < min.year) return false
  const max = parseDateOrNull(context.maxDate || '', context)
  if (max && normalizedYear > max.year) return false
  return true
}

export function isTraceMonthSelectable(year: number | string, month: number | string, context: TraceCreateContext): boolean {
  const normalizedYear = normalizePositiveInteger(year)
  const normalizedMonth = normalizePositiveInteger(month)
  if (!normalizedYear || !normalizedMonth || !isTraceYearSelectable(normalizedYear, context)) return false
  const calendar = getCalendar(context)
  if (normalizedMonth > calendar.monthsInYear(normalizedYear)) return false
  const birth = parseBirthDate(context)
  if (birth && normalizedYear === birth.year && normalizedMonth < birth.month) return false
  const monthStart = { year: normalizedYear, month: normalizedMonth, day: 1 }
  const monthEnd = { year: normalizedYear, month: normalizedMonth, day: calendar.daysInMonth(normalizedYear, normalizedMonth) }
  const min = parseDateOrNull(context.minDate || '', context)
  if (min && compareTrajectoryDate(monthEnd, min) < 0) return false
  const max = parseDateOrNull(context.maxDate || '', context)
  if (max && compareTrajectoryDate(monthStart, max) > 0) return false
  return true
}

export function isTraceDateSelectable(date: string | TrajectoryDate, context: TraceCreateContext): boolean {
  const parsed = typeof date === 'string' ? parseDateOrNull(date, context) : date
  if (!parsed) return false
  const birth = parseBirthDate(context)
  if (!birth || compareTrajectoryDate(parsed, birth) < 0) return false
  const min = parseDateOrNull(context.minDate || '', context)
  if (min && compareTrajectoryDate(parsed, min) < 0) return false
  const max = parseDateOrNull(context.maxDate || '', context)
  if (max && compareTrajectoryDate(parsed, max) > 0) return false
  return Boolean(parseTrajectoryDateText(formatTrajectoryDateText(parsed), getCalendar(context)))
}

export function getTraceMonthsInYear(year: number | string, context: TraceCreateContext): number {
  const normalizedYear = normalizePositiveInteger(year)
  if (!normalizedYear) return 0
  return getCalendar(context).monthsInYear(normalizedYear)
}

export function getTraceDaysInMonth(year: number | string, month: number | string, context: TraceCreateContext): number {
  const normalizedYear = normalizePositiveInteger(year)
  const normalizedMonth = normalizePositiveInteger(month)
  if (!normalizedYear || !normalizedMonth) return 0
  return getCalendar(context).daysInMonth(normalizedYear, normalizedMonth)
}

export function resolveTraceCreateDefaultDateDraft(
  nodes: CharacterBrainTraceNode[],
  context: TraceCreateContext,
  options: { afterSourceId?: string; units?: UnitView[] } = {}
): TraceCreateDefaultDateDraft {
  const fallback = { year: '', month: '', date: '' }
  const calendar = getCalendar(context)
  const unitNodes = normalizeTraceUnitsToNodes(options.units || [], context)
  const mergedNodes = mergeTraceNodeLikeInputs(nodes, unitNodes)
  const afterSourceId = String(options.afterSourceId || '').trim()
  const contextNode = afterSourceId
    ? mergedNodes.find((node) => String(node.id || '') === afterSourceId)
    : undefined
  const parsed = contextNode
    ? resolveTraceCreateDateForContextNode(mergedNodes, contextNode, context)
    : resolveTraceCreateDateFromLatestStructure(mergedNodes, context)
  return parsed ? formatTraceCreateDefaultDateDraft(parsed) : fallback
}

function buildMultiYearPlanItem(year: number, spanYears: number): TraceYearCreatePlanItem {
  return {
    kind: 'multiYear',
    year,
    spanYears,
    years: Array.from({ length: spanYears }, (_, index) => year + index)
  }
}

function normalizeIntegerList(values: Array<number | string>): number[] {
  return [...new Set(values.map((value) => normalizePositiveInteger(value)).filter((value): value is number => Boolean(value)))]
    .sort((left, right) => left - right)
}

function normalizePositiveInteger(value: unknown): number | null {
  const next = Math.floor(Number(value) || 0)
  return Number.isFinite(next) && next > 0 ? next : null
}

function parseBirthDate(context: TraceCreateContext) {
  return parseDateOrNull(context.birthDate, context)
}

function parseDateOrNull(value: string, context: TraceCreateContext) {
  return parseTrajectoryDateText(String(value || '').trim(), getCalendar(context))
}

function normalizeDateTexts(values: string[], context: TraceCreateContext): string[] {
  return [...new Set(values
    .map((value) => parseDateOrNull(value, context))
    .filter((date): date is TrajectoryDate => Boolean(date))
    .map((date) => formatTrajectoryDateText(date))
  )].sort()
}

function resolveTraceNodeAnchorDate(node: CharacterBrainTraceNode | undefined, context: TraceCreateContext): TrajectoryDate | null {
  if (!node) return null
  return parseDateOrNull(
    String(node.endDate || node.pointDate || node.startDate || '').trim(),
    context
  )
}

function mergeTraceNodeLikeInputs(nodes: CharacterBrainTraceNode[], unitNodes: CharacterBrainTraceNode[]): CharacterBrainTraceNode[] {
  const byId = new Map<string, CharacterBrainTraceNode>()
  nodes.forEach((node) => byId.set(String(node.id || ''), node))
  unitNodes.forEach((node) => {
    const id = String(node.id || '')
    byId.set(id, { ...byId.get(id), ...node })
  })
  return Array.from(byId.values()).filter((node) => String(node.id || '').trim())
}

function normalizeTraceUnitsToNodes(units: UnitView[], context: TraceCreateContext): CharacterBrainTraceNode[] {
  const unitById = new Map(units.map((unit) => [unit.unitId, unit]))
  return units
    .filter((unit) => unit.unitType === 'traceGroup' || unit.unitType === 'traceDay')
    .map((unit) => normalizeTraceUnitToNode(unit, context, unitById))
    .filter((node): node is CharacterBrainTraceNode => Boolean(node))
}

function normalizeTraceUnitToNode(unit: UnitView, context: TraceCreateContext, unitById: Map<string, UnitView>): CharacterBrainTraceNode | null {
  const id = String(unit.sourceId || unit.unitId || '').trim()
  if (!id) return null
  const metadata = unit.metadata || {}
  const sourcePath = String(unit.sourcePath || '').trim()
  const titleDate = resolveTraceUnitTitleDate(unit, context, unitById)
  const startDate = normalizeTraceUnitDate(metadata.startDate || sourcePath, context) || titleDate.startDate
  const endDate = normalizeTraceUnitDate(metadata.endDate || metadata.pointDate || sourcePath, context) || titleDate.endDate
  const pointDate = normalizeTraceUnitDate(metadata.pointDate || metadata.endDate || sourcePath, context) || titleDate.pointDate
  const systemRole = normalizeTraceUnitSystemRole(metadata.systemRole)
    || inferTraceSystemRoleFromUnit(unit, startDate, endDate)
  const kind = systemRole === 'dayLeaf'
    ? 'day'
    : systemRole === 'monthBranch'
      ? 'month'
      : systemRole === 'yearBranch'
        ? 'year'
        : String(metadata.kind || '').trim()
  const granularity = systemRole === 'dayLeaf'
    ? 'day'
    : systemRole === 'monthBranch'
      ? 'month'
      : systemRole === 'yearBranch'
        ? 'year'
        : String(metadata.granularity || kind).trim()
  const nodeType = unit.unitType === 'traceDay' || systemRole === 'dayLeaf'
    ? 'single'
    : 'range'
  return {
    id,
    title: unit.title || id,
    summary: '',
    parentId: '',
    kind: kind as CharacterBrainTraceNode['kind'],
    nodeType: nodeType as CharacterBrainTraceNode['nodeType'],
    granularity: granularity as CharacterBrainTraceNode['granularity'],
    startDate: startDate || pointDate,
    endDate: nodeType === 'range' ? endDate || pointDate || startDate : undefined,
    displayTitle: unit.title || id,
    note: '',
    innerEntries: [],
    linkIds: [],
    systemRole,
    timeLabel: [startDate, endDate].filter(Boolean).join('-'),
    pointDate: pointDate || endDate || startDate,
    offsetDays: 0,
    ageLabel: '',
    stepUnit: 'day',
    stepAmount: 1,
    relatedEntityIds: [],
    tags: [],
    content: '',
    summaryMode: 'manual',
    summarySourceNodeIds: [],
    confirmed: true,
    createdAt: '',
    updatedAt: ''
  }
}

function normalizeTraceUnitDate(value: unknown, context: TraceCreateContext): string {
  const parsed = parseDateOrNull(String(value || '').trim(), context)
  return parsed ? formatTrajectoryDateText(parsed) : ''
}

function resolveTraceUnitTitleDate(unit: UnitView, context: TraceCreateContext, unitById: Map<string, UnitView>) {
  const title = String(unit.metadata?.sidebarTitle || unit.title || '').trim()
  const calendar = getCalendar(context)
  const yearMonthMatch = title.match(/(\d{1,6})\s*年\s*(\d{1,2})\s*月/u)
  if (yearMonthMatch) {
    return buildMonthTitleDate(Number(yearMonthMatch[1]), Number(yearMonthMatch[2]), context)
  }
  const monthOnlyMatch = title.match(/^(\d{1,2})\s*月/u)
  if (monthOnlyMatch) {
    const parentYear = resolveParentTraceUnitYear(unit, context, unitById)
    if (parentYear) return buildMonthTitleDate(parentYear, Number(monthOnlyMatch[1]), context)
  }
  const yearMatch = title.match(/(\d{1,6})\s*年/u) || title.match(/^(\d{1,6})$/u)
  if (yearMatch) {
    const year = Number(yearMatch[1])
    const month = 1
    const day = 1
    const lastMonth = calendar.monthsInYear(year)
    const lastDay = calendar.daysInMonth(year, lastMonth)
    return {
      startDate: formatTrajectoryDateText({ year, month, day }),
      endDate: formatTrajectoryDateText({ year, month: lastMonth, day: lastDay }),
      pointDate: formatTrajectoryDateText({ year, month, day })
    }
  }
  return { startDate: '', endDate: '', pointDate: '' }
}

function buildMonthTitleDate(year: number, month: number, context: TraceCreateContext) {
  const calendar = getCalendar(context)
  if (!year || !month || month > calendar.monthsInYear(year)) return { startDate: '', endDate: '', pointDate: '' }
  const startDate = formatTrajectoryDateText({ year, month, day: 1 })
  const endDate = formatTrajectoryDateText({ year, month, day: calendar.daysInMonth(year, month) })
  return { startDate, endDate, pointDate: startDate }
}

function resolveParentTraceUnitYear(unit: UnitView, context: TraceCreateContext, unitById: Map<string, UnitView>): number | null {
  const parentId = String(unit.parentId || '').trim()
  const parent = parentId ? unitById.get(parentId) : undefined
  if (!parent) return null
  const parentDate = resolveTraceUnitTitleDate(parent, context, unitById)
  const parsed = parseDateParts(parentDate.startDate || parentDate.pointDate)
  return parsed?.year || null
}

function normalizeTraceUnitSystemRole(value: unknown): CharacterBrainTraceNode['systemRole'] | undefined {
  const role = String(value || '').trim()
  if (role === 'yearBranch' || role === 'monthBranch' || role === 'multiYearBranch' || role === 'dayLeaf' || role === 'freeGroup') return role
  return undefined
}

function inferTraceSystemRoleFromUnit(unit: UnitView, startDate: string, endDate: string): CharacterBrainTraceNode['systemRole'] | undefined {
  if (unit.unitType === 'traceDay') return 'dayLeaf'
  const title = String(unit.title || unit.metadata?.sidebarTitle || '').trim()
  const start = parseDateParts(startDate)
  const end = parseDateParts(endDate)
  if (start && end && start.year === end.year && start.month === 1 && end.month >= 12) return 'yearBranch'
  if (start && end && start.year === end.year && start.month === end.month) return 'monthBranch'
  if (/^\d{1,6}年$/u.test(title) || /^\d{1,6}$/u.test(title)) return 'yearBranch'
  if (/^\d{1,2}月$/u.test(title) || /^\d{1,6}年\d{1,2}月$/u.test(title)) return 'monthBranch'
  return undefined
}

function parseDateParts(value: string): TrajectoryDate | null {
  const match = String(value || '').match(/^(\d{1,6})-(\d{1,2})-(\d{1,2})$/)
  return match
    ? { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) }
    : null
}

function resolveTraceCreateDateForContextNode(
  nodes: CharacterBrainTraceNode[],
  contextNode: CharacterBrainTraceNode,
  context: TraceCreateContext
): TrajectoryDate | null {
  if (isTraceDayNode(contextNode)) {
    return resolveNextDate(resolveTraceNodeAnchorDate(contextNode, context), context)
  }
  const anchor = resolveTraceNodeAnchorDate(contextNode, context)
  if (!anchor) return resolveTraceCreateDateFromLatestStructure(nodes, context)
  if (isTraceMonthNode(contextNode)) {
    return resolveTraceCreateDateFromMonth(nodes, anchor.year, anchor.month, context)
  }
  if (isTraceYearNode(contextNode)) {
    return resolveTraceCreateDateFromYear(nodes, anchor.year, context)
  }
  return resolveNextDate(anchor, context) || resolveTraceCreateDateFromLatestStructure(nodes, context)
}

function resolveTraceCreateDateFromLatestStructure(nodes: CharacterBrainTraceNode[], context: TraceCreateContext): TrajectoryDate | null {
  const coverageEndDate = parseDateOrNull(String(context.coverageEndDate || '').trim(), context)
  if (coverageEndDate) return resolveTraceCreateDateFromYear(nodes, coverageEndDate.year, context)
  const latestYear = resolveLatestTraceYear(nodes, context)
  if (latestYear) return resolveTraceCreateDateFromYear(nodes, latestYear.year, context)
  return resolveNextDate(resolveLatestTraceDayDate(nodes, context), context)
    || parseDateOrNull(context.birthDate, context)
}

function resolveTraceCreateDateFromYear(nodes: CharacterBrainTraceNode[], year: number, context: TraceCreateContext): TrajectoryDate | null {
  const latestMonth = resolveLatestTraceMonthInYear(nodes, year, context)
  const month = latestMonth?.month || 1
  return resolveTraceCreateDateFromMonth(nodes, year, month, context)
}

function resolveTraceCreateDateFromMonth(nodes: CharacterBrainTraceNode[], year: number, month: number, context: TraceCreateContext): TrajectoryDate | null {
  const latestDay = resolveLatestTraceDayInMonth(nodes, year, month, context)
  return latestDay
    ? resolveNextDate(latestDay, context) || latestDay
    : parseDateOrNull(formatTrajectoryDateText({ year, month, day: 1 }), context)
}

function resolveNextDate(date: TrajectoryDate | null, context: TraceCreateContext): TrajectoryDate | null {
  if (!date) return null
  const next = addTrajectoryDays(date, 1, getCalendar(context))
  return next.ok ? next.date : null
}

function resolveLatestTraceYear(nodes: CharacterBrainTraceNode[], context: TraceCreateContext): TrajectoryDate | null {
  return nodes
    .filter(isTraceYearNode)
    .map((node) => parseDateOrNull(String(node.startDate || node.pointDate || '').trim(), context))
    .filter((date): date is TrajectoryDate => Boolean(date))
    .sort(compareTrajectoryDate)
    .slice(-1)[0] || null
}

function resolveLatestTraceMonthInYear(nodes: CharacterBrainTraceNode[], year: number, context: TraceCreateContext): TrajectoryDate | null {
  return nodes
    .filter(isTraceMonthNode)
    .map((node) => parseDateOrNull(String(node.startDate || node.pointDate || '').trim(), context))
    .filter((date): date is TrajectoryDate => isTrajectoryDate(date) && date.year === year)
    .sort(compareTrajectoryDate)
    .slice(-1)[0] || null
}

function resolveLatestTraceDayDate(nodes: CharacterBrainTraceNode[], context: TraceCreateContext): TrajectoryDate | null {
  return nodes
    .filter(isTraceDayNode)
    .map((node) => parseDateOrNull(String(node.pointDate || node.startDate || '').trim(), context))
    .filter((date): date is TrajectoryDate => Boolean(date))
    .sort(compareTrajectoryDate)
    .slice(-1)[0] || null
}

function resolveLatestTraceDayInMonth(nodes: CharacterBrainTraceNode[], year: number, month: number, context: TraceCreateContext): TrajectoryDate | null {
  return nodes
    .filter(isTraceDayNode)
    .map((node) => parseDateOrNull(String(node.pointDate || node.startDate || '').trim(), context))
    .filter((date): date is TrajectoryDate => isTrajectoryDate(date) && date.year === year && date.month === month)
    .sort(compareTrajectoryDate)
    .slice(-1)[0] || null
}

function isTraceYearNode(node: CharacterBrainTraceNode): boolean {
  return node.systemRole === 'yearBranch'
    || node.kind === 'year'
    || node.granularity === 'year'
    || isYearRangeNode(node)
}

function isTraceMonthNode(node: CharacterBrainTraceNode): boolean {
  return node.systemRole === 'monthBranch'
    || node.kind === 'month'
    || node.granularity === 'month'
    || isMonthRangeNode(node)
}

function isTraceDayNode(node: CharacterBrainTraceNode): boolean {
  return node.systemRole === 'dayLeaf'
    || node.kind === 'day'
    || node.granularity === 'day'
    || node.nodeType === 'single'
}

function isYearRangeNode(node: CharacterBrainTraceNode): boolean {
  const start = parseDateParts(node.startDate || node.pointDate || '')
  const end = parseDateParts(node.endDate || node.pointDate || '')
  return Boolean(start && end && start.year === end.year && start.month === 1 && end.month >= 12)
}

function isMonthRangeNode(node: CharacterBrainTraceNode): boolean {
  const start = parseDateParts(node.startDate || node.pointDate || '')
  const end = parseDateParts(node.endDate || node.pointDate || '')
  return Boolean(start && end && start.year === end.year && start.month === end.month && node.nodeType === 'range')
}

function isTrajectoryDate(date: TrajectoryDate | null): date is TrajectoryDate {
  return Boolean(date)
}

function formatTraceCreateDefaultDateDraft(date: TrajectoryDate): TraceCreateDefaultDateDraft {
  return {
    year: String(date.year),
    month: String(date.month),
    date: formatTrajectoryDateText(date)
  }
}

function getCalendar(context: TraceCreateContext) {
  return buildTrajectoryCalendarRule('trajectory', normalizeTrajectoryCalendarConfig(context.calendarConfig))
}

function compareTrajectoryDate(left: TrajectoryDate, right: TrajectoryDate) {
  if (left.year !== right.year) return left.year - right.year
  if (left.month !== right.month) return left.month - right.month
  return left.day - right.day
}
