export function isClientDebugFlagEnabled(flagName: string): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage?.getItem(`langhuan:debug:${flagName}`) === '1'
  } catch {
    return false
  }
}
