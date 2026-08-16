import {
  addTrajectoryDays,
  buildTrajectoryCalendarRule,
  formatTrajectoryDateText,
  normalizeTrajectoryCalendarConfig,
  parseTrajectoryDateText,
  type TrajectoryCalendarConfig,
  type TrajectoryDate
} from './trajectoryCalendar'

export type LanghuanCalendarDateStatus = 'available' | 'existing' | 'disabled'

export interface LanghuanCalendarDateState {
  date: string
  day: number
  status: LanghuanCalendarDateStatus
  selectable: boolean
  existing: boolean
  reason?: string
}

export interface LanghuanCalendarPickerState {
  selectedDate?: string
  minDate: string
  maxDate: string
  enableDates: string[]
  disableDates: string[]
  dateStates: LanghuanCalendarDateState[]
}

export interface LanghuanCalendarMonthState {
  calendarId: string
  year: number
  month: number
  monthDays: number
  dates: LanghuanCalendarDateState[]
  existingDates: string[]
  availableDates: string[]
  pickerState: LanghuanCalendarPickerState
}

export interface BuildLanghuanCalendarMonthStateInput {
  year: number
  month: number
  calendarId?: string
  calendarConfig?: TrajectoryCalendarConfig | Record<string, unknown>
  selectedDate?: string
  existingDates?: string[]
  selectableDates?: string[]
  disabledDates?: string[]
  allowExistingDates?: boolean
}

export interface BuildTrajectoryTraceDayPickerStateInput {
  birthDate: string
  calendarId?: string
  calendarConfig?: TrajectoryCalendarConfig | Record<string, unknown>
  selectedDate?: string
  existingDates?: string[]
  horizonDays?: number
}

export function buildGregorianCalendarMonthState(
  input: Omit<BuildLanghuanCalendarMonthStateInput, 'calendarId' | 'calendarConfig'>
) {
  return buildLanghuanCalendarMonthState({
    ...input,
    calendarId: 'gregorian',
    calendarConfig: {}
  })
}

export function buildTrajectoryCalendarMonthState(
  input: Omit<BuildLanghuanCalendarMonthStateInput, 'calendarId'>
) {
  return buildLanghuanCalendarMonthState({
    ...input,
    calendarId: 'trajectory'
  })
}

export function buildTrajectoryTraceDayPickerState(
  input: BuildTrajectoryTraceDayPickerStateInput
): LanghuanCalendarPickerState {
  const calendarConfig = normalizeTrajectoryCalendarConfig(input.calendarConfig)
  const calendar = buildTrajectoryCalendarRule(input.calendarId || 'gregorian', calendarConfig)
  const birthDate = parseTrajectoryDateText(input.birthDate, calendar)
  if (!birthDate) return createEmptyPickerState()
  const existingDates = normalizeDateList(input.existingDates)
  const existingSet = new Set(existingDates)
  const defaultDate = resolveDefaultTraceDayDate(input.birthDate, existingDates, calendar)
  const selectedDate = normalizeDateText(input.selectedDate) || defaultDate
  const horizonDays = Math.max(30, Math.floor(Number(input.horizonDays) || 370))
  const rangeEnd = addTrajectoryDays(parseTrajectoryDateText(defaultDate) || birthDate, horizonDays, calendar)
  const maxDate = rangeEnd.ok ? formatLanghuanCalendarDate(rangeEnd.date) : defaultDate
  const dates = enumerateTrajectoryDates(birthDate, maxDate, calendar).map((date) => {
    const existing = existingSet.has(date)
    return {
      date,
      day: parseLanghuanCalendarDate(date)?.day || 1,
      status: existing ? 'existing' as const : 'available' as const,
      selectable: !existing,
      existing,
      reason: existing ? 'already-exists' : undefined
    }
  })
  return {
    selectedDate,
    minDate: input.birthDate,
    maxDate,
    enableDates: dates.filter((date) => date.selectable).map((date) => date.date),
    disableDates: dates.filter((date) => !date.selectable).map((date) => date.date),
    dateStates: dates
  }
}

export function buildLanghuanCalendarMonthState(
  input: BuildLanghuanCalendarMonthStateInput
): LanghuanCalendarMonthState {
  const year = normalizeYear(input.year)
  const calendarConfig = normalizeTrajectoryCalendarConfig(input.calendarConfig)
  const calendar = buildTrajectoryCalendarRule(input.calendarId || 'gregorian', calendarConfig)
  const monthsInYear = calendar.monthsInYear(year)
  const month = clampInteger(input.month, 1, Math.max(1, monthsInYear))
  const monthDays = Math.max(1, calendar.daysInMonth(year, month))
  const existingSet = normalizeDateSet(input.existingDates, year, month)
  const selectableSet = input.selectableDates?.length
    ? normalizeDateSet(input.selectableDates, year, month)
    : null
  const disabledSet = normalizeDateSet(input.disabledDates, year, month)
  const dates = Array.from({ length: monthDays }, (_, index) => {
    const day = index + 1
    const date = formatLanghuanCalendarDate({ year, month, day })
    const existing = existingSet.has(date)
    const explicitlyDisabled = disabledSet.has(date)
    const allowedBySelectableSet = selectableSet ? selectableSet.has(date) : true
    const selectable = Boolean(
      !explicitlyDisabled
      && allowedBySelectableSet
      && (!existing || input.allowExistingDates)
    )
    const status: LanghuanCalendarDateStatus = existing
      ? 'existing'
      : selectable
        ? 'available'
        : 'disabled'
    return {
      date,
      day,
      status,
      selectable,
      existing,
      reason: resolveDateStateReason({ existing, explicitlyDisabled, allowedBySelectableSet, selectable })
    }
  })
  const existingDates = dates.filter((date) => date.existing).map((date) => date.date)
  const availableDates = dates.filter((date) => date.status === 'available' && date.selectable).map((date) => date.date)
  const disableDates = dates.filter((date) => !date.selectable).map((date) => date.date)
  const selectedDate = normalizeDateText(input.selectedDate)
  const minDate = dates[0]?.date || formatLanghuanCalendarDate({ year, month, day: 1 })
  const maxDate = dates[dates.length - 1]?.date || minDate
  return {
    calendarId: String(input.calendarId || 'gregorian').trim() || 'gregorian',
    year,
    month,
    monthDays,
    dates,
    existingDates,
    availableDates,
    pickerState: {
      selectedDate: selectedDate || undefined,
      minDate,
      maxDate,
      enableDates: availableDates,
      disableDates,
      dateStates: dates
    }
  }
}

export function formatLanghuanCalendarDate(date: TrajectoryDate) {
  return formatTrajectoryDateText(date)
}

export function resolveDefaultTraceDayDate(
  birthDateText: string,
  existingDates: string[] | undefined,
  calendar = buildTrajectoryCalendarRule()
) {
  const birthDate = parseTrajectoryDateText(birthDateText, calendar)
  if (!birthDate) return ''
  const latestExisting = normalizeDateList(existingDates)
    .map((date) => parseTrajectoryDateText(date, calendar))
    .filter((date): date is TrajectoryDate => Boolean(date))
    .sort(compareTrajectoryDate)
    .slice(-1)[0]
  if (!latestExisting) return formatLanghuanCalendarDate(birthDate)
  const nextDate = addTrajectoryDays(latestExisting, 1, calendar)
  return nextDate.ok ? formatLanghuanCalendarDate(nextDate.date) : formatLanghuanCalendarDate(latestExisting)
}

export function normalizeLanghuanCalendarDateStates(
  states: LanghuanCalendarDateState[] | undefined
): LanghuanCalendarDateState[] {
  if (!Array.isArray(states)) return []
  return states.reduce<LanghuanCalendarDateState[]>((result, state) => {
      const date = normalizeDateText(state?.date)
      if (!date) return result
      const parsed = parseLanghuanCalendarDate(date)
      if (!parsed) return result
      const status = resolveStatus(state.status)
      const existing = Boolean(state.existing || status === 'existing')
      result.push({
        date,
        day: parsed.day,
        status,
        selectable: Boolean(state.selectable),
        existing,
        reason: String(state.reason || '').trim() || undefined
      })
      return result
    }, [])
}

function resolveDateStateReason(input: {
  existing: boolean
  explicitlyDisabled: boolean
  allowedBySelectableSet: boolean
  selectable: boolean
}) {
  if (input.existing && !input.selectable) return 'already-exists'
  if (input.explicitlyDisabled) return 'disabled'
  if (!input.allowedBySelectableSet) return 'outside-selectable-range'
  return undefined
}

function resolveStatus(status: unknown): LanghuanCalendarDateStatus {
  if (status === 'existing') return 'existing'
  if (status === 'disabled') return 'disabled'
  return 'available'
}

function enumerateTrajectoryDates(
  start: TrajectoryDate,
  endDateText: string,
  calendar: ReturnType<typeof buildTrajectoryCalendarRule>
) {
  const dates: string[] = []
  const end = parseTrajectoryDateText(endDateText)
  if (!end) return [formatLanghuanCalendarDate(start)]
  let current = { ...start }
  let guard = 0
  while (compareTrajectoryDate(current, end) <= 0 && guard < 20000) {
    dates.push(formatLanghuanCalendarDate(current))
    const next = addTrajectoryDays(current, 1, calendar)
    if (!next.ok) break
    current = next.date
    guard += 1
  }
  return dates
}

function normalizeDateList(values: string[] | undefined) {
  return [...new Set((values || []).map((value) => normalizeDateText(value)).filter(Boolean))]
}

function compareTrajectoryDate(left: TrajectoryDate, right: TrajectoryDate) {
  if (left.year !== right.year) return left.year - right.year
  if (left.month !== right.month) return left.month - right.month
  return left.day - right.day
}

function createEmptyPickerState(): LanghuanCalendarPickerState {
  return {
    selectedDate: undefined,
    minDate: '1970-01-01',
    maxDate: '1970-01-01',
    enableDates: [],
    disableDates: [],
    dateStates: []
  }
}

function normalizeDateSet(values: string[] | undefined, year: number, month: number) {
  const result = new Set<string>()
  values?.forEach((value) => {
    const date = normalizeDateText(value)
  const parsed = date ? parseLanghuanCalendarDate(date) : null
    if (date && parsed?.year === year && parsed.month === month) result.add(date)
  })
  return result
}

function normalizeDateText(value: unknown) {
  const parsed = parseLanghuanCalendarDate(String(value || '').trim())
  return parsed ? formatLanghuanCalendarDate(parsed) : ''
}

function parseLanghuanCalendarDate(value: string): TrajectoryDate | null {
  const match = value.match(/^(\d{1,6})[-/年](\d{1,2})[-/月](\d{1,2})日?$/)
  if (!match) return null
  const date = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3])
  }
  if (!Number.isInteger(date.year) || !Number.isInteger(date.month) || !Number.isInteger(date.day)) return null
  if (date.year < 0 || date.month < 1 || date.day < 1) return null
  return date
}

function normalizeYear(year: unknown) {
  const value = Math.floor(Number(year) || 0)
  return Number.isFinite(value) ? Math.max(0, value) : 0
}

function clampInteger(value: unknown, min: number, max: number) {
  const numberValue = Math.floor(Number(value) || min)
  if (!Number.isFinite(numberValue)) return min
  return Math.min(max, Math.max(min, numberValue))
}
