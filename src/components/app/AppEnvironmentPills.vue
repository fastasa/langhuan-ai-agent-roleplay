<template>
  <div class="top-pills" @mousedown="handlePillMouseDown" @contextmenu="handlePillContextMenu" @dragstart.prevent>
    <div class="top-pill time-pill" :aria-label="t('chat.timePillAria')" @click="handleTimeClick">
      <button
        class="time-pause-btn"
        type="button"
        :title="isSceneTimePaused ? t('chat.resumeSceneTime') : t('chat.pauseSceneTime')"
        :aria-label="isSceneTimePaused ? t('chat.resumeSceneTime') : t('chat.pauseSceneTime')"
        @click.stop="emit('toggle-scene-time-paused')"
      >
        <svg v-if="isSceneTimePaused" class="time-pause-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M8 5v14l11-7z"></path>
        </svg>
        <svg v-else class="time-pause-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M8 5v14"></path>
          <path d="M16 5v14"></path>
        </svg>
      </button>
      <span class="pill-date">{{ compactTimeText }}</span>

      <div v-if="showTimeDetail" class="time-detail-popup detail-popup" @click.stop>
        <div class="detail-popup-header">
          <div>
            <p class="detail-popup-kicker">时间</p>
            <h3>{{ calendarTitle }}</h3>
          </div>
          <button class="detail-close-btn" type="button" @click="showTimeDetail = false">×</button>
        </div>

        <div class="calendar-summary">
          <strong>{{ formatTimeOnly(viewModel.currentTime) || currentClockText }}</strong>
          <span>{{ lunarDateText }}</span>
        </div>

        <div class="calendar-grid" aria-label="当前月份日历">
          <span v-for="dayName in calendarWeekNames" :key="dayName" class="calendar-week-name">{{ dayName }}</span>
          <span
            v-for="cell in calendarCells"
            :key="cell.key"
            class="calendar-day"
            :class="{ muted: !cell.inMonth, today: cell.isToday }"
          >
            {{ cell.day }}
          </span>
        </div>

        <div class="world-clock-list">
          <div v-for="clock in worldClocks" :key="clock.city" class="world-clock-item">
            <span>{{ clock.city }}</span>
            <strong>{{ clock.time }}</strong>
          </div>
        </div>
      </div>
    </div>

    <div
      class="top-pill location-pill"
      :aria-label="isLoadingLocation ? t('chat.locating') : t('chat.clickEditLocation')"
      @click="$emit('edit-location')"
    >
      <span v-if="editingLocation" class="pill-text">{{ tempLocationLabel || t('chat.editLocation') }}</span>
      <span v-else class="pill-text">{{ viewModel.currentLocation || t('chat.locationFallback') }}</span>
      <div v-if="editingLocation" class="location-edit-popup" @click.stop @mousedown.stop>
        <label class="location-edit-field">
          <span>{{ t('chat.locationLarge') }}</span>
          <input
            ref="locationInputRef"
            v-model="locationDraft.large"
            :placeholder="t('chat.locationLargeEg')"
            @input="handleLocationDraftInput('large', $event)"
            @keyup.enter="handleSaveLocation"
            @keyup.escape="$emit('cancel-location-edit')"
          >
        </label>
        <label class="location-edit-field">
          <span>{{ t('chat.locationMiddle') }}</span>
          <input
            v-model="locationDraft.middle"
            :placeholder="t('chat.locationMiddleEg')"
            @input="handleLocationDraftInput('middle', $event)"
            @keyup.enter="handleSaveLocation"
            @keyup.escape="$emit('cancel-location-edit')"
          >
        </label>
        <label class="location-edit-field">
          <span>{{ t('chat.locationSmall') }}</span>
          <input
            v-model="locationDraft.small"
            :placeholder="t('chat.locationSmallEg')"
            @input="handleLocationDraftInput('small', $event)"
            @keyup.enter="handleSaveLocation"
            @keyup.escape="$emit('cancel-location-edit')"
          >
        </label>
        <div class="location-edit-actions">
          <button type="button" @click="$emit('cancel-location-edit')">{{ t('common.cancel') }}</button>
          <button type="button" class="location-edit-actions__primary" @click="handleSaveLocation">{{ t('common.save') }}</button>
        </div>
      </div>
    </div>

    <div class="top-pill weather-pill" :aria-label="t('chat.weatherPillAria')" @click="handleWeatherClick">
      <span class="pill-text weather-pill__label">
        <WeatherLineIcon class="weather-pill__icon" :name="weatherIconName" :size="14" :stroke-width="1.8" />
        <span>{{ weatherText }} {{ temperatureText }}</span>
      </span>

      <div v-if="showWeatherDetail" class="weather-detail-popup" @click.stop>
        <div class="detail-popup-header">
          <div>
            <p class="detail-popup-kicker">{{ viewModel.currentLocation || t('chat.currentLocationFallback') }}</p>
            <h3>
              <WeatherLineIcon class="weather-detail-heading-icon" :name="weatherIconName" :size="18" :stroke-width="1.8" />
              {{ viewModel.weatherDetail?.text || weatherText }}
            </h3>
          </div>
          <strong class="weather-temp-big">{{ weatherTemperatureText }}</strong>
          <button class="detail-close-btn" type="button" @click="$emit('close-weather-detail')">×</button>
        </div>

        <div v-if="weatherRows.length" class="weather-detail-grid">
          <div v-for="item in weatherRows" :key="item.label" class="weather-item">
            <span class="label">{{ item.label }}</span>
            <span class="value">{{ item.value }}</span>
          </div>
        </div>
        <p v-else class="detail-empty">{{ t('chat.noWeatherDetail') }}</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { EnvironmentViewModel } from '../../types/panelContracts'
import WeatherLineIcon from '../common/WeatherLineIcon.vue'
import { resolveWeatherIconName } from '../../utils/environmentFormat'
import { parseVirtualSceneDisplayTime } from '../../utils/virtualScene'

const props = defineProps<{
  viewModel: Pick<EnvironmentViewModel, 'currentLocation' | 'currentLocationLarge' | 'currentLocationMiddle' | 'currentLocationSmall' | 'currentTime' | 'timeRate' | 'weatherDetail'>
  isLoadingLocation: boolean
  isLoadingWeather: boolean
  editingLocation: boolean
  tempLocation: string
  tempLocationLarge?: string
  tempLocationMiddle?: string
  tempLocationSmall?: string
  showWeatherDetail: boolean
  weatherText: string
  temperatureText: string
  timeRate?: number
  formatDateOnly: (s: string) => string
  formatTimeOnly: (s: string) => string
  formatObsTime: (s: string) => string
  getWeatherIcon: (iconCode: string) => string
}>()

const emit = defineEmits([
  'edit-location',
  'save-location',
  'cancel-location-edit',
  'sync-weather',
  'toggle-scene-time-paused',
  'sync-time',
  'toggle-weather-detail',
  'close-weather-detail',
  'update:temp-location',
  'update:temp-location-large',
  'update:temp-location-middle',
  'update:temp-location-small'
])

const { t } = useI18n()
const locationInputRef = ref<HTMLInputElement | null>(null)
const locationDraft = ref({
  large: '',
  middle: '',
  small: ''
})
const showTimeDetail = ref(false)
const calendarWeekNames = ['一', '二', '三', '四', '五', '六', '日']
const timeZones = [
  { city: '北京时间', timeZone: 'Asia/Shanghai' },
  { city: '伦敦时间', timeZone: 'Europe/London' },
  { city: '东京时间', timeZone: 'Asia/Tokyo' },
  { city: '悉尼时间', timeZone: 'Australia/Sydney' },
  { city: '纽约时间', timeZone: 'America/New_York' }
]

const weekText = computed(() => {
  const weekMatch = String(props.viewModel?.currentTime || '').match(/(周[一二三四五六日])/)
  return weekMatch?.[1] || '周'
})
const compactTimeText = computed(() => {
  const date = selectedDate.value
  return `${formatTime(date)} ${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`
})
const tempLocationLabel = computed(() => {
  const rawParts = props.editingLocation
    ? [locationDraft.value.large, locationDraft.value.middle, locationDraft.value.small]
    : [props.tempLocationLarge, props.tempLocationMiddle, props.tempLocationSmall]
  const parts = rawParts
    .map((item) => String(item || '').trim())
    .filter(Boolean)
  return parts.length ? parts.join(' / ') : String(props.tempLocation || '').trim()
})

const selectedDate = computed(() => parseCurrentTime(props.viewModel.currentTime))
const isSceneTimePaused = computed(() => Number(props.timeRate ?? props.viewModel.timeRate ?? 1) <= 0)
const currentClockText = computed(() => formatTime(selectedDate.value))
const calendarTitle = computed(() => {
  const date = selectedDate.value
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 ${weekText.value}`
})
const lunarDateText = computed(() => {
  try {
    return `农历 ${new Intl.DateTimeFormat('zh-CN-u-ca-chinese', {
      month: 'long',
      day: 'numeric'
    }).format(selectedDate.value)}`
  } catch {
    return '农历日期待同步'
  }
})
const calendarCells = computed(() => buildCalendarCells(selectedDate.value))
const worldClocks = computed(() => timeZones.map(({ city, timeZone }) => ({
  city,
  time: formatTimeInZone(selectedDate.value, timeZone)
})))
const weatherTemperatureText = computed(() => {
  const temp = String(props.viewModel.weatherDetail?.temp || '').trim() || props.temperatureText
  if (!temp) return '--'
  return temp.includes('°') ? temp : `${temp}°C`
})
const weatherIconName = computed(() => resolveWeatherIconName(
  props.viewModel.weatherDetail?.text || props.weatherText,
  props.viewModel.weatherDetail?.icon || ''
))
const weatherRows = computed(() => {
  const detail = props.viewModel.weatherDetail
  if (!detail) return []
  return [
    { label: t('chat.weatherFeelsLike'), value: withUnit(detail.feelsLike, '°C') },
    { label: t('chat.weatherHumidity'), value: withUnit(detail.humidity, '%') },
    { label: t('chat.weatherWind'), value: formatWind(detail.windDir, detail.windScale) },
    { label: t('chat.weatherWindSpeed'), value: withUnit(detail.windSpeed, ' km/h') },
    { label: t('chat.weatherPrecip'), value: withUnit(detail.precip, ' mm') },
    { label: t('chat.weatherVisibility'), value: withUnit(detail.vis, ' km') },
    { label: t('chat.weatherPressure'), value: withUnit(detail.pressure, ' hPa') },
    { label: t('chat.weatherCloud'), value: withUnit(detail.cloud, '%') },
    { label: t('chat.weatherDewPoint'), value: withUnit(detail.dew, '°C') },
    { label: t('chat.weatherObservation'), value: props.formatObsTime(detail.obsTime || '') }
  ].filter((item) => item.value && item.value !== '-')
})

function handleTimeClick(event: MouseEvent) {
  if (event.button !== 0) return
  if (event.ctrlKey) {
    showTimeDetail.value = !showTimeDetail.value
    emit('close-weather-detail')
    return
  }
  showTimeDetail.value = false
  emit('close-weather-detail')
  emit('sync-time')
}

function handleWeatherClick(event: MouseEvent) {
  if (event.button !== 0) return
  if (event.ctrlKey) {
    showTimeDetail.value = false
    emit('toggle-weather-detail')
    return
  }
  showTimeDetail.value = false
  emit('sync-weather')
}

function isLocationInputTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement
}

function handlePillMouseDown(event: MouseEvent) {
  if (isLocationInputTarget(event.target)) return
  if (event.button === 0 || event.button === 2) {
    event.preventDefault()
  }
}

function handlePillContextMenu(event: MouseEvent) {
  if (isLocationInputTarget(event.target)) return
  event.preventDefault()
}

function parseCurrentTime(timeStr: string): Date {
  return parseVirtualSceneDisplayTime(timeStr)
}

function formatTime(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`
}

function formatTimeInZone(date: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('zh-CN', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).format(date)
  } catch {
    return '--:--:--'
  }
}

function buildCalendarCells(date: Date) {
  const year = date.getFullYear()
  const month = date.getMonth()
  const firstDay = new Date(year, month, 1)
  const startOffset = (firstDay.getDay() + 6) % 7
  const startDate = new Date(year, month, 1 - startOffset)
  return Array.from({ length: 42 }, (_, index) => {
    const cellDate = new Date(startDate)
    cellDate.setDate(startDate.getDate() + index)
    return {
      key: cellDate.toISOString(),
      day: cellDate.getDate(),
      inMonth: cellDate.getMonth() === month,
      isToday: isSameDay(cellDate, date)
    }
  })
}

function isSameDay(left: Date, right: Date): boolean {
  return left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth()
    && left.getDate() === right.getDate()
}

function withUnit(value: unknown, unit: string): string {
  const text = String(value || '').trim()
  if (!text) return ''
  return text.includes(unit.trim()) ? text : `${text}${unit}`
}

function formatWind(windDir: unknown, windScale: unknown): string {
  const dir = String(windDir || '').trim()
  const scale = String(windScale || '').trim()
  if (!dir && !scale) return ''
  return `${dir}${scale ? ` ${scale}级` : ''}`.trim()
}

function splitLocationLabel(value: unknown): string[] {
  return String(value || '')
    .trim()
    .split(/\s*(?:\/|／|｜|\||>|＞)\s*/g)
    .map((item) => item.trim())
    .filter(Boolean)
}

function normalizeLocationDraftParts(large: unknown, middle: unknown, small: unknown, legacy: unknown) {
  let nextLarge = String(large || '').trim()
  let nextMiddle = String(middle || '').trim()
  let nextSmall = String(small || '').trim()
  const smallParts = !nextLarge && !nextMiddle ? splitLocationLabel(nextSmall) : []
  const legacyParts = !nextLarge && !nextMiddle && !nextSmall ? splitLocationLabel(legacy) : []
  const parts = smallParts.length > 1 ? smallParts : legacyParts
  if (parts.length >= 3) {
    nextLarge = parts[0]
    nextMiddle = parts[1]
    nextSmall = parts.slice(2).join(' / ')
  } else if (parts.length === 2) {
    nextLarge = parts[0]
    nextMiddle = parts[1]
    nextSmall = ''
  }
  return {
    large: nextLarge,
    middle: nextMiddle,
    small: nextSmall
  }
}

function syncLocationDraftFromProps() {
  const hasTempDraft = [props.tempLocationLarge, props.tempLocationMiddle, props.tempLocationSmall]
    .some((item) => String(item || '').trim())
  locationDraft.value = hasTempDraft
    ? normalizeLocationDraftParts(props.tempLocationLarge, props.tempLocationMiddle, props.tempLocationSmall, props.tempLocation)
    : normalizeLocationDraftParts(
      props.viewModel.currentLocationLarge,
      props.viewModel.currentLocationMiddle,
      props.viewModel.currentLocationSmall,
      props.viewModel.currentLocation
    )
}

function emitLocationDraft() {
  emit('update:temp-location-large', locationDraft.value.large)
  emit('update:temp-location-middle', locationDraft.value.middle)
  emit('update:temp-location-small', locationDraft.value.small)
}

function handleLocationDraftInput(field: 'large' | 'middle' | 'small', event: Event) {
  locationDraft.value[field] = String((event.target as HTMLInputElement | null)?.value || '')
  emitLocationDraft()
}

function handleSaveLocation() {
  emitLocationDraft()
  emit('save-location')
}

watch(() => props.editingLocation, async (value) => {
  if (value) {
    syncLocationDraftFromProps()
    emitLocationDraft()
    await nextTick()
    locationInputRef.value?.focus()
    locationInputRef.value?.select()
  }
})

watch(() => [
  props.tempLocationLarge,
  props.tempLocationMiddle,
  props.tempLocationSmall,
  props.viewModel.currentLocationLarge,
  props.viewModel.currentLocationMiddle,
  props.viewModel.currentLocationSmall
], () => {
  if (!props.editingLocation) syncLocationDraftFromProps()
})
</script>

<style scoped>
.top-pills {
  position: relative;
  inset: auto;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  justify-content: flex-start;
  gap: 0.72em;
  width: auto;
  height: auto;
  padding: 0;
  background: transparent;
  color: var(--morandi-text-light);
}

.top-pill {
  position: relative;
  display: inline-flex;
  align-items: baseline;
  gap: 0.28em;
  padding: 0;
  border-radius: 0;
  background: transparent;
  color: var(--morandi-text-light);
  font-size: 13px;
  font-weight: 400;
  line-height: 1.24;
  cursor: pointer;
  transition: color 0.16s ease;
}

.top-pill,
.pill-text,
.pill-date,
.pill-time,
.pill-week {
  color: var(--morandi-text-light);
  font-weight: 400;
}

.top-pill:hover {
  background: transparent;
  color: var(--morandi-text);
}

.time-pill,
.weather-pill {
  position: relative;
}

.weather-pill__label {
  display: inline-flex;
  min-width: 0;
  align-items: center;
  gap: 0.28em;
}

.weather-pill__label > span {
  min-width: 0;
}

.weather-pill__icon,
.weather-detail-heading-icon {
  color: #87937c;
}

.location-edit-popup {
  position: absolute;
  top: calc(100% + 8px);
  left: 50%;
  z-index: 2400;
  display: grid;
  width: 280px;
  gap: 9px;
  padding: 12px;
  border: 1px solid var(--morandi-border);
  border-radius: 8px;
  background: var(--morandi-card);
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.12);
  cursor: default;
  transform: translateX(-50%);
}

.location-edit-field {
  display: grid;
  gap: 5px;
}

.location-edit-field span {
  color: var(--morandi-text-light);
  font-size: 0.74rem;
}

.location-edit-field input {
  width: 100%;
  border: 1px solid var(--morandi-border);
  border-radius: 7px;
  background: color-mix(in srgb, var(--morandi-card) 92%, transparent);
  color: var(--morandi-text);
  padding: 7px 8px;
  font-size: 0.82rem;
}

.location-edit-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding-top: 2px;
}

.location-edit-actions button {
  border: 1px solid var(--morandi-border);
  border-radius: 7px;
  background: color-mix(in srgb, var(--morandi-card) 90%, transparent);
  color: var(--morandi-text);
  cursor: pointer;
  padding: 6px 10px;
  font-size: 0.78rem;
}

.location-edit-actions__primary {
  border-color: rgba(139, 168, 158, 0.48) !important;
  background: rgba(139, 168, 158, 0.12) !important;
  color: var(--morandi-green) !important;
}

.time-pill {
  align-items: center;
}

.time-pause-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  margin: 0 1px 0 0;
  padding: 0;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--morandi-text-light);
  cursor: pointer;
}

.time-pause-btn:hover,
.time-pause-btn:focus-visible {
  background: rgba(139, 115, 85, 0.08);
  color: var(--morandi-text);
  outline: none;
}

.time-pause-icon {
  width: 13px;
  height: 13px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
  transform: translateY(1.5px);
}

.time-pause-icon path:first-child:last-child {
  fill: currentColor;
  stroke: none;
}

.detail-popup,
.weather-detail-popup {
  position: absolute;
  top: calc(100% + 8px);
  left: 50%;
  transform: translateX(-50%);
  width: 300px;
  background: var(--morandi-card);
  border: 1px solid var(--morandi-border);
  border-radius: 8px;
  padding: 12px;
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.12);
  z-index: 2400;
  cursor: default;
}

.time-detail-popup {
  width: 320px;
}

.detail-popup-header {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-bottom: 10px;
}

.detail-popup-kicker {
  margin: 0 0 2px;
  color: var(--morandi-text-light);
  font-size: 0.72rem;
  font-weight: 500;
}

.detail-popup-header h3 {
  margin: 0;
  color: var(--morandi-text);
  font-size: 0.98rem;
  font-weight: 500;
  line-height: 1.4;
}

.detail-close-btn {
  margin-left: auto;
  border: none;
  background: transparent;
  color: var(--morandi-text-light);
  cursor: pointer;
  font-size: 1rem;
  line-height: 1;
  padding: 2px 4px;
}

.calendar-summary {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 0 10px;
  border-top: 1px solid var(--morandi-border);
  border-bottom: 1px solid var(--morandi-border);
  color: var(--morandi-text-light);
}

.calendar-summary strong {
  color: var(--morandi-text);
  font-size: 1.2rem;
  font-weight: 500;
}

.calendar-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 4px;
  margin-top: 10px;
}

.calendar-week-name,
.calendar-day {
  display: grid;
  place-items: center;
  height: 24px;
  border-radius: 6px;
  font-size: 0.72rem;
}

.calendar-week-name {
  color: var(--morandi-text-light);
  font-weight: 500;
}

.calendar-day {
  color: var(--morandi-text);
}

.calendar-day.muted {
  color: color-mix(in srgb, var(--morandi-text-light) 60%, transparent);
}

.calendar-day.today {
  background: rgba(92, 138, 92, 0.14);
  color: var(--morandi-accent);
  font-weight: 600;
}

.world-clock-list {
  display: grid;
  gap: 6px;
  margin-top: 12px;
}

.world-clock-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 7px 8px;
  border-radius: 8px;
  background: rgba(155, 139, 122, 0.08);
  color: var(--morandi-text-light);
}

.world-clock-item strong {
  color: var(--morandi-text);
  font-size: 0.95rem;
  font-weight: 500;
}

.weather-temp-big {
  margin-left: auto;
  color: var(--morandi-text);
  font-size: 1.25rem;
  font-weight: 500;
}

.weather-detail-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
}

.weather-item {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  padding: 7px 8px;
  border-radius: 8px;
  background: rgba(155, 139, 122, 0.08);
}

.weather-item .label {
  color: var(--morandi-text-light);
  font-size: 0.72rem;
}

.weather-item .value {
  color: var(--morandi-text);
  font-size: 0.78rem;
  font-weight: 500;
  text-align: right;
}

.detail-empty {
  margin: 8px 0 0;
  color: var(--morandi-text-light);
  font-size: 0.78rem;
}
</style>
