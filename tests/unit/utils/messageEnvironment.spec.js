import { describe, expect, it, vi } from 'vitest'
import {
  buildEffectiveMessageEnvironment,
  buildMessageEnvironmentSnapshot
} from '../../../src/utils/messageEnvironment.ts'

describe('messageEnvironment', () => {
  it('uses current session virtual time, location and weather for message snapshots', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-04T08:00:00+08:00'))

    const session = {
      virtualLocationLarge: '德文郡',
      virtualLocationMiddle: '旧宅',
      virtualLocationSmall: '书房',
      virtualTime: '2026-05-04T13:20',
      virtualTimeAnchor: Date.now(),
      virtualTimeBase: new Date('2026-05-04T13:20:00+08:00').getTime(),
      virtualTimeRate: 0,
      virtualWeather: '小雨',
      virtualWeatherMode: 'custom'
    }

    const snapshot = buildMessageEnvironmentSnapshot({
      currentSession: session,
      currentTime: '现实时间 5月4日',
      currentLocation: '现实地点',
      currentWeather: '晴，26°C',
      createdAt: new Date().toISOString()
    })

    expect(snapshot.envDate).toBe('2026年5月4日 周一 13:20:00')
    expect(snapshot.envLocation).toBe('德文郡 / 旧宅 / 书房')
    expect(snapshot.envWeather).toBe('小雨')

    vi.useRealTimers()
  })

  it('keeps session location empty when current session has no curtain location', () => {
    const effective = buildEffectiveMessageEnvironment({
      currentSession: {},
      currentTime: '2026年5月4日 周一 08:00',
      currentLocation: '现实地点',
      currentWeather: '晴，26°C'
    })

    expect(effective).toEqual({
      currentTime: '2026年5月4日 周一 08:00',
      currentLocation: '',
      currentWeather: '晴，26°C'
    })
  })

  it('falls back to real environment when there is no current session', () => {
    const effective = buildEffectiveMessageEnvironment({
      currentTime: '2026年5月4日 周一 08:00',
      currentLocation: '现实地点',
      currentWeather: '晴，26°C'
    })

    expect(effective.currentLocation).toBe('现实地点')
  })
})
