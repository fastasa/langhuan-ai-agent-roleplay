import { describe, expect, it } from 'vitest'
import { shouldEnableRateLimit } from '../../../server/security/rateLimitPolicy.js'

describe('rate limit policy', () => {
  it('always enables rate limits in production', () => {
    expect(shouldEnableRateLimit({
      nodeEnv: 'production',
      disableDevRateLimit: true
    })).toBe(true)
  })

  it('keeps loopback-only development opt-in', () => {
    expect(shouldEnableRateLimit({
      nodeEnv: 'development',
      allowLan: false,
      enableDevRateLimit: false
    })).toBe(false)
    expect(shouldEnableRateLimit({
      nodeEnv: 'development',
      allowLan: false,
      enableDevRateLimit: true
    })).toBe(true)
  })

  it('enables rate limits automatically when development allows LAN access', () => {
    expect(shouldEnableRateLimit({
      nodeEnv: 'development',
      allowLan: true,
      enableDevRateLimit: false
    })).toBe(true)
    expect(shouldEnableRateLimit({
      nodeEnv: 'development',
      allowLan: true,
      disableDevRateLimit: true
    })).toBe(false)
  })
})
