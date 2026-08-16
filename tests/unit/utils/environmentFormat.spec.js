import { describe, expect, it } from 'vitest'
import { formatTimeOnly, resolveWeatherIconName } from '../../../src/utils/environmentFormat.ts'

describe('environmentFormat', () => {
  it('keeps seconds when formatting current time', () => {
    expect(formatTimeOnly('5月8日 周五 01:42:09')).toBe('01:42:09')
  })

  it('keeps minute-only legacy time readable', () => {
    expect(formatTimeOnly('5月8日 周五 01:42')).toBe('01:42')
  })

  it('maps common weather text to line icons', () => {
    expect(resolveWeatherIconName('晴 32°C')).toBe('sun')
    expect(resolveWeatherIconName('小雨 18°C')).toBe('cloud-drizzle')
    expect(resolveWeatherIconName('雷阵雨')).toBe('cloud-lightning')
    expect(resolveWeatherIconName('雨夹雪')).toBe('cloud-snow')
    expect(resolveWeatherIconName('雾')).toBe('cloud-fog')
  })

  it('uses provider icon codes before text fallback', () => {
    expect(resolveWeatherIconName('晴', '104')).toBe('cloud')
    expect(resolveWeatherIconName('', '302')).toBe('cloud-lightning')
    expect(resolveWeatherIconName('', '901')).toBe('thermometer-snowflake')
  })
})
