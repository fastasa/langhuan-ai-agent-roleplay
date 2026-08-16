export type DraftSaveVersionToken = {
  key: string
  version: number
}

export function createDraftSaveVersionGuard() {
  const versions = new Map<string, number>()

  function normalizeKey(key: string) {
    return String(key || '').trim()
  }

  function touch(key: string) {
    const normalizedKey = normalizeKey(key)
    if (!normalizedKey) return 0
    const nextVersion = (versions.get(normalizedKey) || 0) + 1
    versions.set(normalizedKey, nextVersion)
    return nextVersion
  }

  function begin(key: string): DraftSaveVersionToken {
    const normalizedKey = normalizeKey(key)
    return {
      key: normalizedKey,
      version: touch(normalizedKey)
    }
  }

  function isLatest(token: DraftSaveVersionToken | null | undefined) {
    if (!token?.key) return false
    return (versions.get(token.key) || 0) === token.version
  }

  function clear(key?: string) {
    const normalizedKey = normalizeKey(key || '')
    if (normalizedKey) {
      versions.delete(normalizedKey)
      return
    }
    versions.clear()
  }

  return {
    begin,
    clear,
    isLatest,
    touch
  }
}
