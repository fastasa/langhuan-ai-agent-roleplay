import { describe, expect, it } from 'vitest'
import { normalizeWeatherDomain } from '../../../server/security/serviceOutboundPolicy'

describe('service outbound policy', () => {
  it('allows only official or QWeather custom weather domains', () => {
    expect(normalizeWeatherDomain('devapi.qweather.com')).toBe('devapi.qweather.com')
    expect(normalizeWeatherDomain('api.qweather.com')).toBe('api.qweather.com')
    expect(normalizeWeatherDomain('ka564v3y3a.re.qweatherapi.com')).toBe('ka564v3y3a.re.qweatherapi.com')

    expect(() => normalizeWeatherDomain('127.0.0.1')).toThrow(/天气 API 域名/)
    expect(() => normalizeWeatherDomain('example.com')).toThrow(/天气 API 域名/)
  })
})
