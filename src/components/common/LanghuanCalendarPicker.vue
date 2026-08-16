<template>
  <div class="langhuan-calendar-picker" :class="{ 'is-compact': compact }">
    <div v-if="showGranularityTabs" class="langhuan-calendar-picker__tabs" role="tablist" :aria-label="t('calendar.granularityAria')">
      <button
        v-for="mode in visibleModes"
        :key="mode"
        type="button"
        :class="{ active: viewMode === mode }"
        @click="setViewMode(mode as LanghuanCalendarViewMode)"
      >
        {{ modeLabels[mode as LanghuanCalendarViewMode] }}
      </button>
    </div>

    <section
      class="langhuan-calendar-picker__panel"
      :data-vc-type="viewMode"
      :data-vc="viewMode === 'date' ? 'calendar' : undefined"
      :aria-label="t('calendar.calendarAria')"
    >
      <div v-if="viewMode === 'year'" class="langhuan-calendar-picker__year-shell">
        <div class="langhuan-calendar-picker__header">
          <button
            type="button"
            class="langhuan-calendar-picker__icon-button"
            :aria-label="t('calendar.prevYearPage')"
            :disabled="!canGoPreviousYearPage"
            @click="goYearPage(-1)"
          >
            ‹
          </button>
          <strong>{{ yearPanelTitle }}</strong>
          <button
            type="button"
            class="langhuan-calendar-picker__icon-button"
            :aria-label="t('calendar.nextYearPage')"
            :disabled="!canGoNextYearPage"
            @click="goYearPage(1)"
          >
            ›
          </button>
        </div>
        <div class="langhuan-calendar-picker__jump">
          <input
            v-model="yearInput"
            type="number"
            inputmode="numeric"
            :min="yearBounds.min"
            :max="yearBounds.max"
            :placeholder="t('calendar.yearInputPlaceholder')"
            @focus="selectYearInput"
            @keydown.enter.prevent="submitYearInput"
          >
          <button type="button" @click="submitYearInput">{{ t('calendar.jump') }}</button>
        </div>
        <div class="langhuan-calendar-picker__years" data-vc="years" role="grid" :aria-label="t('calendar.yearGridAria')">
          <button
            v-for="year in yearCells"
            :key="year.value"
            type="button"
            class="langhuan-calendar-picker__year"
            :class="{ selected: year.selected }"
            :disabled="year.disabled"
            role="gridcell"
            :data-vc-years-year="year.value"
            :data-langhuan-calendar-selected="year.selected ? '' : undefined"
            @click="selectYear(year.value, $event)"
          >
            {{ year.label }}
          </button>
        </div>
      </div>

      <div v-else-if="viewMode === 'month'" class="langhuan-calendar-picker__month-shell">
        <div class="langhuan-calendar-picker__plain-title">
          <strong>{{ selectedYearMonth.year }}</strong>
        </div>
        <div class="langhuan-calendar-picker__months" data-vc="months" role="grid" :aria-label="t('calendar.monthGridAria')">
          <button
            v-for="month in monthCells"
            :key="month.value"
            type="button"
            class="langhuan-calendar-picker__month"
            :class="{ selected: month.selected }"
            :disabled="month.disabled"
            role="gridcell"
            :data-vc-months-month="month.value - 1"
            :data-langhuan-calendar-selected="month.selected ? '' : undefined"
            @click="selectMonth(selectedYearMonth.year, month.value, $event)"
          >
            {{ month.label }}
          </button>
        </div>
      </div>

      <div v-else class="langhuan-calendar-picker__date-shell">
        <div class="langhuan-calendar-picker__plain-title">
          <strong>{{ selectedYearMonth.year }} 年 {{ selectedYearMonth.month }} 月</strong>
        </div>
        <div class="langhuan-calendar-picker__week">
          <span v-for="day in weekLabels" :key="day">{{ day }}</span>
        </div>
        <div class="vc-dates__row langhuan-calendar-picker__dates" role="grid" :aria-label="t('calendar.dateGridAria')">
          <div
            v-for="date in dateCells"
            :key="date.date"
            class="vc-date langhuan-calendar-picker__date"
            role="gridcell"
            :data-vc-date="date.date"
            :data-vc-date-disabled="date.disabled ? '' : undefined"
            :data-vc-date-selected="date.selected ? '' : undefined"
            :data-langhuan-calendar-selected="date.selected ? '' : undefined"
            :data-langhuan-calendar-date-state="date.state?.status"
            :data-langhuan-calendar-date-existing="date.state?.existing ? '' : undefined"
            :data-langhuan-calendar-date-blocked="date.blocked ? '' : undefined"
            :data-langhuan-calendar-date-reason="date.state?.reason"
          >
            <button
              type="button"
              class="vc-date__btn"
              data-vc-date-btn
              :disabled="date.disabled"
              @click="selectDate(date.date, $event)"
            >
              {{ date.day }}
            </button>
          </div>
        </div>
        <div v-if="showTime" class="langhuan-calendar-picker__time">
          <label>
            {{ t('calendar.time') }}
            <input :value="selectedTime" type="time" @input="updateTime">
          </label>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { LanghuanCalendarDateState, LanghuanCalendarPickerState } from '@/app/langhuanCalendarAdapter'

export interface LanghuanCalendarSelection {
  date: string
  time?: string
  mode?: LanghuanCalendarViewMode
  year?: number
  month?: number
}

type LanghuanCalendarViewMode = 'date' | 'month' | 'year'
const calendarViewModes = ['date', 'month', 'year'] as const

const props = withDefaults(defineProps<{
  modelValue?: string
  selectedTime?: string
  calendarState?: LanghuanCalendarPickerState
  selectedValues?: string[]
  dateStates?: LanghuanCalendarDateState[]
  enableDates?: string[]
  disableDates?: string[]
  minDate?: string
  maxDate?: string
  showTime?: boolean
  viewMode?: LanghuanCalendarViewMode
  availableModes?: LanghuanCalendarViewMode[]
  showGranularityTabs?: boolean
  multiSelect?: boolean
  continuousYearSelection?: boolean
  compact?: boolean
  lockViewMode?: boolean
  hideNavigationArrows?: boolean
  monthCount?: number
  locale?: string
}>(), {
  modelValue: '',
  selectedTime: '',
  calendarState: undefined,
  selectedValues: () => [],
  dateStates: () => [],
  enableDates: () => [],
  disableDates: () => [],
  minDate: '1970-01-01',
  maxDate: '2470-12-31',
  showTime: false,
  viewMode: 'date',
  availableModes: () => ['date'],
  showGranularityTabs: false,
  multiSelect: false,
  continuousYearSelection: false,
  compact: false,
  lockViewMode: false,
  hideNavigationArrows: false,
  monthCount: 12,
  locale: 'zh-CN'
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'update:selectedValues': [value: string[]]
  'update:selectedTime': [value: string]
  'update:viewMode': [value: LanghuanCalendarViewMode]
  select: [value: LanghuanCalendarSelection]
  multiSelectChange: [value: { values: string[]; mode: LanghuanCalendarViewMode }]
}>()

const { t } = useI18n()
const yearPageSize = 24
const yearPageStart = ref<number | null>(null)
const yearInput = ref('')
const weekLabels = ['一', '二', '三', '四', '五', '六', '日']
const modeLabels: Record<LanghuanCalendarViewMode, string> = {
  date: '日',
  month: '月',
  year: '年'
}

const visibleModes = computed(() => {
  const modes = props.availableModes.filter((mode): mode is LanghuanCalendarViewMode => (
    calendarViewModes.includes(mode as LanghuanCalendarViewMode)
  ))
  return modes.length ? [...new Set(modes)] : ['date']
})
const viewMode = computed(() => visibleModes.value.includes(props.viewMode) ? props.viewMode : visibleModes.value[0])
const selectedYearMonth = computed(() => parseYearMonth(getSelectedDate() || getMinDate()))
const dateStateMap = computed(() => new Map(getDateStates().map((state) => [state.date, state])))
const selectedValueSet = computed(() => new Set(props.selectedValues.map((value) => normalizeSelectionValue(value)).filter(Boolean)))
const yearBounds = computed(() => {
  const selected = selectedYearMonth.value.year
  const min = getDateYear(getMinDate(), 1)
  const max = getDateYear(getMaxDate(), Math.max(selected + yearPageSize - 1, min + yearPageSize - 1))
  return { min, max: Math.max(min, max) }
})
const yearPageStartValue = computed(() => {
  const bounds = yearBounds.value
  const fallback = getCenteredYearPageStart(selectedYearMonth.value.year, bounds.min, bounds.max)
  return clampYearPageStart(yearPageStart.value ?? fallback, bounds.min, bounds.max)
})
const yearPageEndValue = computed(() => Math.min(yearBounds.value.max, yearPageStartValue.value + yearPageSize - 1))
const yearPanelTitle = computed(() => `${yearPageStartValue.value} - ${yearPageEndValue.value}`)
const canGoPreviousYearPage = computed(() => yearPageStartValue.value > yearBounds.value.min)
const canGoNextYearPage = computed(() => yearPageEndValue.value < yearBounds.value.max)
const yearCells = computed(() => {
  const bounds = yearBounds.value
  return Array.from({ length: Math.max(0, yearPageEndValue.value - yearPageStartValue.value + 1) }, (_, index) => {
    const value = yearPageStartValue.value + index
    const normalized = String(value).padStart(4, '0')
    return {
      value,
      label: String(value),
      disabled: value < bounds.min || value > bounds.max,
      selected: selectedValueSet.value.size ? selectedValueSet.value.has(normalized) : value === selectedYearMonth.value.year
    }
  })
})
const monthCells = computed(() => {
  const count = Math.max(1, Math.floor(Number(props.monthCount) || 12))
  const min = parseDate(getMinDate())
  const max = parseDate(getMaxDate())
  const currentYear = selectedYearMonth.value.year
  return Array.from({ length: count }, (_, index) => {
    const value = index + 1
    const normalized = `${String(currentYear).padStart(4, '0')}-${String(value).padStart(2, '0')}`
    const beforeMin = Boolean(min && (currentYear < min.year || (currentYear === min.year && value < min.month)))
    const afterMax = Boolean(max && (currentYear > max.year || (currentYear === max.year && value > max.month)))
    return {
      value,
      label: `${value}月`,
      disabled: beforeMin || afterMax,
      selected: selectedValueSet.value.size ? selectedValueSet.value.has(normalized) : value === selectedYearMonth.value.month
    }
  })
})
const dateCells = computed(() => {
  const states = getDateStates()
  const year = selectedYearMonth.value.year
  const month = selectedYearMonth.value.month
  const source = states.length ? states : buildGregorianDateStates(year, month)
  const selectedDate = normalizeSelectionValue(getSelectedDate())
  return source.map((state) => {
    const normalized = normalizeSelectionValue(state.date)
    const selected = selectedValueSet.value.size ? selectedValueSet.value.has(normalized) : normalized === selectedDate
    const blocked = state.selectable === false || getDisableDates().includes(normalized)
    return {
      date: normalized,
      day: state.day,
      state,
      selected,
      blocked,
      disabled: blocked
    }
  })
})

function getSelectedDate() {
  return props.calendarState?.selectedDate ?? props.modelValue
}

function getEnableDates() {
  return props.calendarState?.enableDates ?? props.enableDates
}

function getDisableDates() {
  return props.calendarState?.disableDates ?? props.disableDates
}

function getMinDate() {
  return props.calendarState?.minDate ?? props.minDate
}

function getMaxDate() {
  return props.calendarState?.maxDate ?? props.maxDate
}

function getDateStates() {
  return props.calendarState?.dateStates?.length ? props.calendarState.dateStates : props.dateStates
}

function buildGregorianDateStates(year: number, month: number): LanghuanCalendarDateState[] {
  const days = new Date(year, month, 0).getDate()
  const min = parseDate(getMinDate())
  const max = parseDate(getMaxDate())
  const enableSet = new Set(getEnableDates().map((date) => normalizeSelectionValue(date)).filter(Boolean))
  const disableSet = new Set(getDisableDates().map((date) => normalizeSelectionValue(date)).filter(Boolean))
  return Array.from({ length: days }, (_, index) => {
    const day = index + 1
    const date = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    const beforeMin = Boolean(min && compareDateParts({ year, month, day }, min) < 0)
    const afterMax = Boolean(max && compareDateParts({ year, month, day }, max) > 0)
    const disabled = beforeMin || afterMax || disableSet.has(date) || (enableSet.size > 0 && !enableSet.has(date))
    return {
      date,
      day,
      status: disabled ? 'disabled' : 'available',
      selectable: !disabled,
      existing: false,
      reason: disabled ? 'disabled' : undefined
    }
  })
}

function compareDateParts(left: { year: number; month: number; day: number }, right: { year: number; month: number; day: number }) {
  if (left.year !== right.year) return left.year - right.year
  if (left.month !== right.month) return left.month - right.month
  return left.day - right.day
}

function normalizeSelectionValue(value: string) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  const dateMatch = raw.match(/^(\d{1,6})-(\d{1,2})-(\d{1,2})$/)
  if (dateMatch) return `${String(Number(dateMatch[1])).padStart(4, '0')}-${String(Number(dateMatch[2])).padStart(2, '0')}-${String(Number(dateMatch[3])).padStart(2, '0')}`
  const monthMatch = raw.match(/^(\d{1,6})-(\d{1,2})$/)
  if (monthMatch) return `${String(Number(monthMatch[1])).padStart(4, '0')}-${String(Number(monthMatch[2])).padStart(2, '0')}`
  const year = Math.floor(Number(raw) || 0)
  return year > 0 ? String(year).padStart(4, '0') : ''
}

function normalizeSelectionValues(values: Iterable<string>) {
  const normalized = [...new Set([...values].map((value) => normalizeSelectionValue(value)).filter(Boolean))].sort()
  if (props.continuousYearSelection && viewMode.value === 'year') return fillContinuousYearValues(normalized)
  return normalized
}

function fillContinuousYearValues(values: string[]) {
  const years = values.map((value) => Number(value)).filter((value) => Number.isInteger(value) && value > 0)
  if (!years.length) return []
  const start = Math.min(...years)
  const end = Math.max(...years)
  return Array.from({ length: end - start + 1 }, (_, index) => String(start + index).padStart(4, '0'))
}

function emitSelectedValues(values: string[]) {
  const next = normalizeSelectionValues(values)
  emit('update:selectedValues', next)
  emit('multiSelectChange', { values: next, mode: viewMode.value as LanghuanCalendarViewMode })
}

function applyMultiSelection(value: string, event?: MouseEvent) {
  if (!props.multiSelect) return
  const normalized = normalizeSelectionValue(value)
  if (!normalized) return
  const current = selectedValueSet.value
  if (event?.shiftKey && current.size) {
    emitSelectedValues([...current, ...buildSelectionRange([...current].slice(-1)[0], normalized)])
    return
  }
  if (event?.ctrlKey || event?.metaKey) {
    const next = new Set(current)
    if (next.has(normalized)) next.delete(normalized)
    else next.add(normalized)
    emitSelectedValues([...next])
    return
  }
  emitSelectedValues([normalized])
}

function buildSelectionRange(start: string, end: string) {
  if (viewMode.value === 'year') {
    const left = Number(start)
    const right = Number(end)
    if (!left || !right) return [end]
    const min = Math.min(left, right)
    const max = Math.max(left, right)
    return Array.from({ length: max - min + 1 }, (_, index) => String(min + index).padStart(4, '0'))
  }
  if (viewMode.value === 'month') {
    const left = parseYearMonthValue(start)
    const right = parseYearMonthValue(end)
    if (!left || !right || left.year !== right.year) return [end]
    const min = Math.min(left.month, right.month)
    const max = Math.max(left.month, right.month)
    return Array.from({ length: max - min + 1 }, (_, index) => `${String(left.year).padStart(4, '0')}-${String(min + index).padStart(2, '0')}`)
  }
  const left = parseDate(start)
  const right = parseDate(end)
  if (!left || !right || left.year !== right.year || left.month !== right.month) return [end]
  const min = Math.min(left.day, right.day)
  const max = Math.max(left.day, right.day)
  return Array.from({ length: max - min + 1 }, (_, index) => `${String(left.year).padStart(4, '0')}-${String(left.month).padStart(2, '0')}-${String(min + index).padStart(2, '0')}`)
}

function parseYearMonthValue(value: string) {
  const match = value.match(/^(\d{1,6})-(\d{1,2})/)
  return match ? { year: Number(match[1]), month: Number(match[2]) } : null
}

function parseDate(value: string) {
  const match = String(value || '').match(/^(\d{1,6})-(\d{1,2})-(\d{1,2})/)
  return match ? { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) } : null
}

function parseYearMonth(value: string) {
  const match = String(value || '').match(/^(\d{1,6})-(\d{1,2})-/)
  return {
    year: Number(match?.[1] || new Date().getFullYear()),
    month: Math.max(1, Math.min(12, Number(match?.[2] || new Date().getMonth() + 1)))
  }
}

function getDateYear(date: string, fallback: number) {
  const year = Number(String(date || '').split('-')[0])
  return Number.isFinite(year) && year > 0 ? year : fallback
}

function clampYearPageStart(start: number, min: number, max: number) {
  const lastStart = Math.max(min, max - yearPageSize + 1)
  return Math.max(min, Math.min(Math.floor(start), lastStart))
}

function getCenteredYearPageStart(year: number, min: number, max: number) {
  return clampYearPageStart(year - Math.floor(yearPageSize / 2), min, max)
}

function goYearPage(direction: -1 | 1) {
  yearPageStart.value = clampYearPageStart(
    yearPageStartValue.value + direction * yearPageSize,
    yearBounds.value.min,
    yearBounds.value.max
  )
}

function selectYearInput(event: FocusEvent) {
  if (event.target instanceof HTMLInputElement) {
    event.target.select()
  }
}

function submitYearInput() {
  const year = Math.floor(Number(yearInput.value))
  if (!Number.isFinite(year)) return
  const clampedYear = Math.max(yearBounds.value.min, Math.min(year, yearBounds.value.max))
  yearInput.value = String(clampedYear)
  yearPageStart.value = getCenteredYearPageStart(clampedYear, yearBounds.value.min, yearBounds.value.max)
  selectYear(clampedYear)
}

function selectYear(year: number, event?: MouseEvent) {
  const date = `${String(year).padStart(4, '0')}-01-01`
  yearInput.value = String(year)
  applyMultiSelection(String(year).padStart(4, '0'), event)
  emit('update:modelValue', date)
  emit('select', { date, mode: 'year', year })
}

function selectMonth(year: number, month: number, event: MouseEvent) {
  const value = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`
  const date = `${value}-01`
  applyMultiSelection(value, event)
  emit('update:modelValue', date)
  emit('select', { date, mode: 'month', year, month })
}

function selectDate(date: string, event: MouseEvent) {
  if (!date) return
  applyMultiSelection(date, event)
  emit('update:modelValue', date)
  if (props.showTime) emit('update:selectedTime', props.selectedTime || '')
  emit('select', { date, time: props.showTime ? props.selectedTime || '' : undefined, mode: 'date' })
}

function updateTime(event: Event) {
  const time = (event.target as HTMLInputElement).value || ''
  emit('update:selectedTime', time)
  emit('select', {
    date: getSelectedDate() || '',
    time,
    mode: 'date'
  })
}

function setViewMode(mode: LanghuanCalendarViewMode) {
  if (!visibleModes.value.includes(mode)) return
  emit('update:viewMode', mode)
}

watch(viewMode, (mode) => {
  if (mode !== 'year') return
  yearInput.value = String(selectedYearMonth.value.year)
  yearPageStart.value = getCenteredYearPageStart(selectedYearMonth.value.year, yearBounds.value.min, yearBounds.value.max)
}, { immediate: true })

watch(() => selectedYearMonth.value.year, (year) => {
  if (viewMode.value !== 'year') return
  yearInput.value = String(year)
  if (year < yearPageStartValue.value || year > yearPageEndValue.value) {
    yearPageStart.value = getCenteredYearPageStart(year, yearBounds.value.min, yearBounds.value.max)
  }
})
</script>

<style scoped>
.langhuan-calendar-picker {
  --lh-cal-accent: #7d6d5c;
  --lh-cal-bg: rgba(255, 252, 246, 0.95);
  --lh-cal-border: rgba(120, 104, 83, 0.18);
  width: 100%;
}

.langhuan-calendar-picker__tabs {
  display: inline-flex;
  gap: 2px;
  margin-bottom: 8px;
  padding: 2px;
  border: 1px solid var(--lh-cal-border);
  border-radius: 8px;
  background: rgba(255, 252, 246, 0.68);
}

.langhuan-calendar-picker__tabs button {
  min-width: 34px;
  height: 28px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #6b5f54;
  font: inherit;
  cursor: pointer;
}

.langhuan-calendar-picker__tabs button.active {
  background: rgba(125, 109, 92, 0.16);
  color: #3f372f;
  font-weight: 700;
}

.langhuan-calendar-picker__panel {
  min-height: 252px;
  border: 1px solid var(--lh-cal-border);
  border-radius: 8px;
  padding: 14px 16px 16px;
  background: var(--lh-cal-bg);
  color: #4c4339;
}

.langhuan-calendar-picker__year-shell,
.langhuan-calendar-picker__month-shell,
.langhuan-calendar-picker__date-shell {
  display: grid;
  gap: 10px;
}

.langhuan-calendar-picker__header {
  display: grid;
  grid-template-columns: 34px 1fr 34px;
  align-items: center;
  gap: 8px;
  text-align: center;
}

.langhuan-calendar-picker__icon-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #6d5f50;
  font: inherit;
  font-size: 1.25rem;
  cursor: pointer;
}

.langhuan-calendar-picker__icon-button:hover {
  background: rgba(125, 109, 92, 0.09);
}

.langhuan-calendar-picker__icon-button:disabled {
  color: rgba(76, 67, 57, 0.28);
  cursor: default;
}

.langhuan-calendar-picker__plain-title {
  min-height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.langhuan-calendar-picker__jump {
  display: flex;
  justify-content: center;
  gap: 6px;
}

.langhuan-calendar-picker__jump input {
  width: 96px;
  height: 28px;
  border: 1px solid var(--lh-cal-border);
  border-radius: 6px;
  padding: 0 8px;
  background: rgba(255, 252, 246, 0.82);
  color: #4c4339;
  font: inherit;
  font-size: 0.8rem;
}

.langhuan-calendar-picker__jump button {
  height: 28px;
  border: 1px solid var(--lh-cal-border);
  border-radius: 6px;
  padding: 0 10px;
  background: rgba(255, 252, 246, 0.78);
  color: #5e5349;
  font: inherit;
  font-size: 0.8rem;
  cursor: pointer;
}

.langhuan-calendar-picker__years,
.langhuan-calendar-picker__months {
  display: grid;
  align-items: center;
}

.langhuan-calendar-picker__years {
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 6px 4px;
}

.langhuan-calendar-picker__months {
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px 4px;
}

.langhuan-calendar-picker__year,
.langhuan-calendar-picker__month {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 30px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #5e5349;
  font: inherit;
  font-size: 0.76rem;
  cursor: pointer;
}

.langhuan-calendar-picker__month {
  min-height: 38px;
  font-size: 0.8rem;
}

.langhuan-calendar-picker__year:hover,
.langhuan-calendar-picker__month:hover,
.vc-date__btn:hover {
  background: rgba(125, 109, 92, 0.09);
}

.langhuan-calendar-picker__year.selected,
.langhuan-calendar-picker__month.selected,
.vc-date[data-vc-date-selected] .vc-date__btn,
[data-langhuan-calendar-selected] .vc-date__btn {
  background: var(--lh-cal-accent);
  color: #fffaf2;
  box-shadow: inset 0 0 0 1px rgba(80, 66, 52, 0.16);
}

.langhuan-calendar-picker__year:disabled,
.langhuan-calendar-picker__month:disabled,
.vc-date__btn:disabled {
  color: rgba(76, 67, 57, 0.32);
  cursor: default;
}

.langhuan-calendar-picker__week {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  justify-items: center;
  gap: 0;
  color: #7b6d60;
  font-size: 0.78rem;
  font-weight: 700;
}

.langhuan-calendar-picker__dates {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  align-items: center;
  justify-items: center;
  width: 100%;
}

.vc-date {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  padding: 2px;
}

.vc-date__btn {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 30px;
  width: 100%;
  min-height: 30px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: #4c4339;
  font: inherit;
  font-size: 0.82rem;
  cursor: pointer;
  transition: background 0.12s ease, color 0.12s ease, box-shadow 0.12s ease;
}

[data-langhuan-calendar-date-state='existing'] [data-vc-date-btn] {
  color: #5f5143;
  background: rgba(125, 109, 92, 0.16);
  box-shadow: inset 0 0 0 1px rgba(125, 109, 92, 0.2);
}

[data-langhuan-calendar-date-state='available'] [data-vc-date-btn] {
  box-shadow: inset 0 0 0 1px rgba(108, 139, 116, 0.2);
}

[data-langhuan-calendar-date-blocked] [data-vc-date-btn] {
  opacity: 0.48;
}

.langhuan-calendar-picker__time {
  display: flex;
  justify-content: center;
  padding-top: 10px;
  border-top: 1px solid var(--lh-cal-border);
}

.langhuan-calendar-picker__time label {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: #5e5349;
  font-size: 0.82rem;
}

.langhuan-calendar-picker__time input {
  height: 28px;
  border: 1px solid var(--lh-cal-border);
  border-radius: 6px;
  padding: 0 8px;
  background: rgba(255, 252, 246, 0.82);
  color: #4c4339;
  font: inherit;
}
</style>
