export type TrustProxySetting = boolean | number | string

function parseBoolean(value: string) {
  const normalized = value.trim().toLowerCase()
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false
  if (['true', 'yes', 'on'].includes(normalized)) return true
  return undefined
}

export function resolveTrustProxySetting(input: {
  nodeEnv?: string
  trustProxy?: string
}): TrustProxySetting {
  const raw = String(input.trustProxy || '').trim()
  if (raw) {
    const booleanValue = parseBoolean(raw)
    if (booleanValue !== undefined) return booleanValue
    if (/^\d+$/.test(raw)) return Number(raw)
    return raw
  }
  return input.nodeEnv === 'production' ? 1 : false
}
