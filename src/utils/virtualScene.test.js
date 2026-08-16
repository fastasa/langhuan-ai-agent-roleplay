import { describe, expect, it } from 'vitest'
import {
  formatVirtualSceneInputValue,
  getVirtualTimeTickIntervalMs,
  parseVirtualSceneDisplayTime,
  parseVirtualSceneInput,
  resolveEffectiveVirtualScene,
  resolveVirtualSceneTime
} from './virtualScene'

describe('virtual scene time', () => {
  it('advances from the saved curtain anchor at the configured rate', () => {
    const base = new Date('2026-05-07T10:20:30').getTime()
    const anchor = new Date('2026-05-07T00:00:00').getTime()
    const now = anchor + 5_000

    expect(resolveVirtualSceneTime({
      virtualTime: '2026-05-07T10:20:30',
      virtualTimeBase: base,
      virtualTimeAnchor: anchor,
      virtualTimeRate: 1
    }, now)).toBe('2026年5月7日 周四 10:20:35')
  })

  it('keeps curtain time paused when the rate is zero', () => {
    const base = new Date('2026-05-07T10:20:30').getTime()
    const anchor = new Date('2026-05-07T00:00:00').getTime()
    const now = anchor + 60_000

    expect(resolveVirtualSceneTime({
      virtualTimeBase: base,
      virtualTimeAnchor: anchor,
      virtualTimeRate: 0
    }, now)).toBe('2026年5月7日 周四 10:20:30')
  })

  it('round-trips datetime-local values with seconds', () => {
    const timestamp = new Date('2026-05-07T10:20:30').getTime()
    const inputValue = formatVirtualSceneInputValue(timestamp)

    expect(inputValue).toBe('2026-05-07T10:20:30')
    expect(parseVirtualSceneInput(inputValue)).toBe(timestamp)
  })

  it('supports four-digit years before 1970 instead of falling back to real time', () => {
    const timestamp = parseVirtualSceneInput('0091-05-07T10:20:30')

    expect(Number.isFinite(timestamp)).toBe(true)
    expect(timestamp).toBeLessThan(0)
    expect(formatVirtualSceneInputValue(timestamp)).toBe('0091-05-07T10:20:30')
    expect(resolveVirtualSceneTime({
      virtualTime: '0091-05-07T10:20:30',
      virtualTimeBase: timestamp,
      virtualTimeAnchor: new Date('2026-05-07T00:00:00').getTime(),
      virtualTimeRate: 0
    })).toBe('0091年5月7日 周一 10:20:30')
  })

  it('parses pre-1970 display text back to the same early year', () => {
    const parsed = parseVirtualSceneDisplayTime('0091年5月7日 周一 10:20:30', new Date('2026-01-01T00:00:00'))

    expect(parsed.getFullYear()).toBe(91)
    expect(parsed.getMonth()).toBe(4)
    expect(parsed.getDate()).toBe(7)
    expect(parsed.getHours()).toBe(10)
  })

  it('uses the three-level location truth when resolving the effective scene', () => {
    const scene = resolveEffectiveVirtualScene({
      virtualSceneName: '阿什菲尔德宅邸',
      virtualLocationLarge: '德文郡',
      virtualLocationMiddle: '旧宅',
      virtualLocationSmall: '书房',
      virtualTime: '2026-05-07T10:20:30',
      virtualTimeBase: new Date('2026-05-07T10:20:30').getTime(),
      virtualTimeAnchor: new Date('2026-05-07T00:00:00').getTime(),
      virtualTimeRate: 0,
      virtualWeatherMode: 'real'
    })

    expect(scene).toEqual(expect.objectContaining({
      location: '德文郡 / 旧宅 / 书房',
      realLocation: '',
      weatherQueryLocation: '德文郡 / 旧宅 / 书房'
    }))
  })

  it('parses formatted virtual scene display time with year and seconds', () => {
    const parsed = parseVirtualSceneDisplayTime('2026年5月7日 周四 10:20:35', new Date('2025-01-01T00:00:00'))

    expect(parsed.getFullYear()).toBe(2026)
    expect(parsed.getMonth()).toBe(4)
    expect(parsed.getDate()).toBe(7)
    expect(parsed.getHours()).toBe(10)
    expect(parsed.getMinutes()).toBe(20)
    expect(parsed.getSeconds()).toBe(35)
  })

  it('uses rate-based display tick intervals', () => {
    expect(getVirtualTimeTickIntervalMs(2)).toBe(500)
    expect(getVirtualTimeTickIntervalMs(0.5)).toBe(2000)
    expect(getVirtualTimeTickIntervalMs(0)).toBe(1000)
    expect(getVirtualTimeTickIntervalMs(60)).toBe(17)
  })
})
