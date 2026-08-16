import {
  getChatSessionVirtualScene
} from '../repositories/chatRepository'
import {
  clampVirtualTimeRate as clampSharedVirtualTimeRate,
  resolveFlowingVirtualTimeMs
} from '../../shared/virtualTimeFlow'

export interface VirtualSceneLike {
  virtualLocation?: string
  virtualLocationLarge?: string
  virtualLocationMiddle?: string
  virtualLocationSmall?: string
  virtual_location?: string
  virtual_location_large?: string
  virtual_location_middle?: string
  virtual_location_small?: string
  virtualRealLocation?: string
  virtual_real_location?: string
  virtualTime?: string
  virtual_time?: string
  virtualTimeAnchor?: number
  virtual_time_anchor?: number
  virtualTimeBase?: number
  virtual_time_base?: number
  virtualTimeRate?: number
  virtual_time_rate?: number
  virtualWeather?: string
  virtual_weather?: string
  virtualWeatherMode?: string
  virtual_weather_mode?: string
  virtualSceneName?: string
  virtualSceneDesc?: string
}

export interface RealEnvironmentLike {
  currentLocation?: string
  currentTime?: string
  currentWeather?: string
}

export interface EffectiveVirtualScene {
  name: string
  desc: string
  location: string
  realLocation: string
  weatherQueryLocation: string
  time: string
  weather: string
  usesVirtualTime: boolean
  usesVirtualWeather: boolean
  timeRate: number
}

const DEFAULT_RATE = 1
const MIN_TICK_INTERVAL_MS = 16
const MAX_TICK_INTERVAL_MS = 60_000

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

function padYear(value: number): string {
  return String(value).padStart(4, '0')
}

function trimText(value: unknown): string {
  return String(value ?? '').trim()
}

function createLocalDate(year: number, month: number, day: number, hours: number, minutes: number, seconds = 0): Date {
  const date = new Date(0)
  date.setFullYear(year, month, day)
  date.setHours(hours, minutes, seconds, 0)
  return date
}

function composeVirtualSceneLocation(scene?: VirtualSceneLike | null): string {
  const large = trimText(scene?.virtualLocationLarge ?? scene?.virtual_location_large)
  const middle = trimText(scene?.virtualLocationMiddle ?? scene?.virtual_location_middle)
  const small = trimText(scene?.virtualLocationSmall ?? scene?.virtual_location_small)
  const legacy = trimText(scene?.virtualLocation ?? scene?.virtual_location)
  const tail = small || (!large && !middle ? legacy : '')
  const parts = [large, middle, tail].filter(Boolean)
  if (parts.length) return parts.join(' / ')
  return legacy
}

export const clampVirtualTimeRate = clampSharedVirtualTimeRate

export function getVirtualTimeTickIntervalMs(rate: number): number {
  const normalizedRate = clampVirtualTimeRate(rate)
  if (normalizedRate <= 0) return 1000
  return Math.max(MIN_TICK_INTERVAL_MS, Math.min(MAX_TICK_INTERVAL_MS, Math.round(1000 / normalizedRate)))
}

export function formatVirtualSceneDate(input: number | Date): string {
  const date = input instanceof Date ? input : new Date(input)
  if (Number.isNaN(date.getTime())) return ''
  const year = padYear(date.getFullYear())
  const month = date.getMonth() + 1
  const day = date.getDate()
  const weekDays = ['日', '一', '二', '三', '四', '五', '六']
  const weekDay = weekDays[date.getDay()]
  const hours = pad(date.getHours())
  const minutes = pad(date.getMinutes())
  const seconds = pad(date.getSeconds())
  return `${year}年${month}月${day}日 周${weekDay} ${hours}:${minutes}:${seconds}`
}

export function formatVirtualSceneInputValue(input: number | Date): string {
  const date = input instanceof Date ? input : new Date(input)
  if (Number.isNaN(date.getTime())) return ''
  return `${padYear(date.getFullYear())}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

export function parseVirtualSceneInput(value: string): number {
  if (!value) return 0
  const normalized = value.length === 16 ? `${value}:00` : value
  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/)
  const date = match
    ? createLocalDate(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3]),
      Number(match[4]),
      Number(match[5]),
      Number(match[6] || 0)
    )
    : new Date(normalized)
  return Number.isNaN(date.getTime()) ? 0 : date.getTime()
}

export function parseVirtualSceneDisplayTime(value: string, now = new Date()): Date {
  const text = String(value || '').trim()
  const fullMatch = text.match(/(?:(\d{1,4})[年/-])?(\d{1,2})[月/-](\d{1,2})日?(?:\s+周[一二三四五六日])?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/)
  if (fullMatch) {
    const year = fullMatch[1] ? Number(fullMatch[1]) : now.getFullYear()
    const date = createLocalDate(
      year,
      Number(fullMatch[2]) - 1,
      Number(fullMatch[3]),
      Number(fullMatch[4]),
      Number(fullMatch[5]),
      Number(fullMatch[6] || 0)
    )
    if (!Number.isNaN(date.getTime())) return date
  }

  const inputTimestamp = parseVirtualSceneInput(text)
  if (Number.isFinite(inputTimestamp) && inputTimestamp !== 0) return new Date(inputTimestamp)

  const timeMatch = text.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/)
  if (timeMatch) {
    const date = new Date(now)
    date.setHours(Number(timeMatch[1]), Number(timeMatch[2]), Number(timeMatch[3] || 0), 0)
    return date
  }

  return new Date(now)
}

export function resolveVirtualSceneTime(session?: VirtualSceneLike | null, now = Date.now()): string {
  const base = Number(session?.virtualTimeBase ?? session?.virtual_time_base ?? 0)
  const virtualTime = trimText(session?.virtualTime ?? session?.virtual_time)
  const hasBaseTime = Number.isFinite(base) && base !== 0
  const hasVirtualTime = Boolean(virtualTime) || hasBaseTime
  if (!hasVirtualTime) return ''
  if (!hasBaseTime) return virtualTime

  const virtualNow = resolveFlowingVirtualTimeMs(session, now)
  return virtualNow === null ? virtualTime : formatVirtualSceneDate(virtualNow)
}

export function resolveEffectiveVirtualScene(
  session?: VirtualSceneLike | null,
  real?: RealEnvironmentLike | null,
  now = Date.now()
): EffectiveVirtualScene | null {
  const normalizedScene = getChatSessionVirtualScene(session)
  const customWeather = trimText(normalizedScene.virtualWeather)
  const location = composeVirtualSceneLocation(normalizedScene as VirtualSceneLike)
  const realLocation = trimText(normalizedScene.virtualRealLocation)
  const sceneTime = resolveVirtualSceneTime(session, now).trim()
  const useCustomWeather = trimText(normalizedScene.virtualWeatherMode) === 'custom'
  const weather = useCustomWeather
    ? customWeather
    : trimText(real?.currentWeather)

  const hasScene = Boolean(
    location
    || realLocation
    || sceneTime
    || customWeather
  )

  if (!hasScene) return null

  return {
    name: '',
    desc: '',
    location,
    realLocation,
    weatherQueryLocation: realLocation || location || trimText(real?.currentLocation),
    time: sceneTime || trimText(real?.currentTime),
    weather,
    usesVirtualTime: Boolean(sceneTime),
    usesVirtualWeather: useCustomWeather && Boolean(customWeather),
    timeRate: clampVirtualTimeRate(Number(normalizedScene.virtualTimeRate ?? normalizedScene.virtual_time_rate ?? DEFAULT_RATE))
  }
}
