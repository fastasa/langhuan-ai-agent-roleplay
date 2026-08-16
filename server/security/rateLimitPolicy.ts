export function shouldEnableRateLimit(input: {
  nodeEnv?: string
  allowLan?: boolean
  enableDevRateLimit?: boolean
  disableDevRateLimit?: boolean
}) {
  if (input.nodeEnv === 'production') return true
  if (input.disableDevRateLimit) return false
  return Boolean(input.enableDevRateLimit || input.allowLan)
}
