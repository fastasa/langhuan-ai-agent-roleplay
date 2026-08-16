import { API } from '../config/api'

async function readJson<T>(response: Response, fallbackMessage: string): Promise<T> {
  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(detail || fallbackMessage)
  }
  return await response.json() as T
}

export async function fetchWeatherConfigSnapshot(): Promise<Record<string, unknown>> {
  return await readJson<Record<string, unknown>>(await fetch(API.CONFIG), '加载天气配置失败')
}

export async function saveWeatherConfigSnapshot(payload: { apiKey: string; domain: string }): Promise<void> {
  await readJson(
    await fetch(API.WEATHER_CONFIG, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }),
    '保存天气配置失败'
  )
}

export async function reverseGeoLocation(latitude: number, longitude: number): Promise<Record<string, any>> {
  return await readJson<Record<string, any>>(
    await fetch(`${API.WEATHER_GEO}?lat=${latitude}&lon=${longitude}`),
    '定位失败'
  )
}

export async function resolveWeatherCity(name: string): Promise<Record<string, any>> {
  return await readJson<Record<string, any>>(
    await fetch(`${API.WEATHER_CITY}?name=${encodeURIComponent(name)}`),
    '未找到该城市'
  )
}

export async function fetchWeatherNow(cityId: string): Promise<Record<string, any>> {
  return await readJson<Record<string, any>>(
    await fetch(`${API.WEATHER_NOW}?cityId=${encodeURIComponent(cityId)}`),
    '天气查询失败'
  )
}
