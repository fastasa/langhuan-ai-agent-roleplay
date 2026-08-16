import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  fetchWeatherConfigSnapshot,
  fetchWeatherNow,
  resolveWeatherCity,
  reverseGeoLocation,
  saveWeatherConfigSnapshot
} from '../../../src/repositories/environmentRepository.js'

describe('environment repository', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('天气配置和地理查询会走统一接口', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ code: '200', location: [] })
    })

    await fetchWeatherConfigSnapshot()
    await saveWeatherConfigSnapshot({ apiKey: 'demo', domain: 'example.com' })
    await reverseGeoLocation(1, 2)

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/data/config')
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/weather/config', expect.objectContaining({
      method: 'PUT'
    }))
    expect(fetchMock).toHaveBeenNthCalledWith(3, '/api/weather/geo?lat=1&lon=2')
  })

  it('城市和天气查询会拼接参数', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ code: '200', now: {} })
    })

    await resolveWeatherCity('上海')
    await fetchWeatherNow('101020100')

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/weather/city?name=%E4%B8%8A%E6%B5%B7')
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/weather/now?cityId=101020100')
  })
})
