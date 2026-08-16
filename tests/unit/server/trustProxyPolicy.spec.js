import { describe, expect, it } from 'vitest'
import { resolveTrustProxySetting } from '../../../server/security/trustProxyPolicy.js'

describe('trust proxy policy', () => {
  it('trusts one proxy by default only in production', () => {
    expect(resolveTrustProxySetting({ nodeEnv: 'production' })).toBe(1)
    expect(resolveTrustProxySetting({ nodeEnv: 'development' })).toBe(false)
    expect(resolveTrustProxySetting({ nodeEnv: 'test' })).toBe(false)
  })

  it('honors explicit TRUST_PROXY values', () => {
    expect(resolveTrustProxySetting({ nodeEnv: 'development', trustProxy: '0' })).toBe(false)
    expect(resolveTrustProxySetting({ nodeEnv: 'development', trustProxy: 'true' })).toBe(true)
    expect(resolveTrustProxySetting({ nodeEnv: 'development', trustProxy: '2' })).toBe(2)
    expect(resolveTrustProxySetting({ nodeEnv: 'production', trustProxy: 'loopback' })).toBe('loopback')
  })
})
