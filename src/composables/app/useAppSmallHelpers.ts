import { getTemperatureFromWeather as extractTemperatureFromWeather } from '../../utils/environmentFormat'

export function useAppSmallHelpers({
  settingStore
}: any) {
  function normalizeAvatarUrl(path?: string | null) {
    if (!path) return ''
    const trimmed = String(path).trim()
    if (!trimmed) return ''
    if (trimmed.startsWith('data:') || /^https?:\/\//i.test(trimmed)) return trimmed
    return trimmed.startsWith('/') ? trimmed : `/${trimmed}`
  }

  function getTemperatureFromWeather(weatherOverride = ''): string {
    return extractTemperatureFromWeather(weatherOverride || settingStore.currentWeather || '')
  }

  return {
    normalizeAvatarUrl,
    getTemperatureFromWeather
  }
}
