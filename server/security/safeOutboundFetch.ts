import { lookup } from 'dns/promises'
import { isIP } from 'net'

export type SafeOutboundFetch = typeof fetch

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain'
])

function parseIpv4(value: string): number[] | null {
  const parts = value.split('.')
  if (parts.length !== 4) return null
  const bytes = parts.map((part) => Number(part))
  if (bytes.some((byte) => !Number.isInteger(byte) || byte < 0 || byte > 255)) return null
  return bytes
}

function isPrivateIpv4(value: string) {
  const bytes = parseIpv4(value)
  if (!bytes) return false
  const [a, b] = bytes
  return a === 0
    || a === 10
    || a === 127
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 192 && b === 0)
    || (a === 198 && (b === 18 || b === 19))
    || a >= 224
}

function isProxyFakeIpIpv4(value: string) {
  const bytes = parseIpv4(value)
  if (!bytes) return false
  const [a, b] = bytes
  return a === 198 && (b === 18 || b === 19)
}

function normalizeIpv6(value: string) {
  return String(value || '').toLowerCase()
}

function isPrivateIpv6(value: string) {
  const normalized = normalizeIpv6(value)
  if (!normalized) return false
  if (normalized === '::' || normalized === '::1') return true
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true
  if (normalized.startsWith('fe8') || normalized.startsWith('fe9') || normalized.startsWith('fea') || normalized.startsWith('feb')) return true
  const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
  return mapped ? isPrivateIpv4(mapped[1]) : false
}

export function isBlockedOutboundAddress(address: string) {
  const version = isIP(address)
  if (version === 4) return isPrivateIpv4(address)
  if (version === 6) return isPrivateIpv6(address)
  return false
}

function readRequestUrl(input: RequestInfo | URL) {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.toString()
  return String((input as Request).url || '')
}

export async function assertSafeOutboundUrl(input: string | URL, options: { skipDnsLookup?: boolean } = {}) {
  let url: URL
  try {
    url = input instanceof URL ? input : new URL(String(input || '').trim())
  } catch {
    throw new Error('外部服务地址格式不合法')
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('外部服务地址只允许 HTTP 或 HTTPS')
  }

  const hostname = url.hostname.toLowerCase()
  if (!hostname || BLOCKED_HOSTNAMES.has(hostname) || hostname.endsWith('.localhost')) {
    throw new Error('外部服务地址不能指向本机或内网地址')
  }

  if (isIP(hostname)) {
    if (isBlockedOutboundAddress(hostname)) {
      throw new Error('外部服务地址不能指向本机、内网或云元数据地址')
    }
    return
  }

  if (options.skipDnsLookup) return

  const addresses = await lookup(hostname, { all: true, verbatim: true })
  if (!addresses.length) {
    throw new Error('外部服务地址无法解析')
  }
  if (addresses.some((item) => isBlockedOutboundAddress(item.address) && !isProxyFakeIpIpv4(item.address))) {
    throw new Error('外部服务地址解析到本机、内网或云元数据地址')
  }
}

export function createSafeOutboundFetch(fetchImpl: typeof fetch, options: { skipDnsLookup?: boolean } = {}): SafeOutboundFetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    await assertSafeOutboundUrl(readRequestUrl(input), options)
    return fetchImpl(input, init)
  }) as SafeOutboundFetch
}
