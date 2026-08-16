import { describe, expect, it, vi } from 'vitest'
import {
  assertSafeOutboundUrl,
  createSafeOutboundFetch,
  isBlockedOutboundAddress
} from '../../../server/security/safeOutboundFetch'

const lookupMock = vi.hoisted(() => vi.fn())

vi.mock('dns/promises', () => ({
  default: {
    lookup: lookupMock
  },
  lookup: lookupMock
}))

describe('safe outbound fetch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('blocks loopback, private and metadata addresses', async () => {
    expect(isBlockedOutboundAddress('127.0.0.1')).toBe(true)
    expect(isBlockedOutboundAddress('10.0.0.5')).toBe(true)
    expect(isBlockedOutboundAddress('172.16.0.1')).toBe(true)
    expect(isBlockedOutboundAddress('192.168.1.10')).toBe(true)
    expect(isBlockedOutboundAddress('169.254.169.254')).toBe(true)
    expect(isBlockedOutboundAddress('::1')).toBe(true)
    await expect(assertSafeOutboundUrl('http://127.0.0.1:11434/v1/models')).rejects.toThrow(/内网|本机|云元数据/)
    await expect(assertSafeOutboundUrl('http://localhost:3000/models')).rejects.toThrow(/本机|内网/)
  })

  it('checks before sending the request', async () => {
    const fetchMock = vi.fn()
    const safeFetch = createSafeOutboundFetch(fetchMock, { skipDnsLookup: true })

    await expect(safeFetch('http://169.254.169.254/latest/meta-data')).rejects.toThrow(/内网|本机|云元数据/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('allows domain names resolved to proxy fake-ip range but still blocks direct fake-ip URLs', async () => {
    lookupMock.mockResolvedValueOnce([{ address: '198.18.6.164', family: 4 }])

    await expect(assertSafeOutboundUrl('https://api.deepseek.com/v1/chat/completions')).resolves.toBeUndefined()
    await expect(assertSafeOutboundUrl('https://198.18.6.164/v1/chat/completions')).rejects.toThrow(/内网|本机|云元数据/)
  })
})
