export function splitDocLibraryDisplayPath(displayPath: unknown): string[] {
  return String(displayPath || '').split('/').map((item) => item.trim()).filter(Boolean)
}

export function normalizeDocLibraryDisplayPath(displayPath: unknown): string {
  const segments = splitDocLibraryDisplayPath(displayPath)
  return segments.length ? `/${segments.join('/')}` : ''
}

export function normalizeDocLibraryFolderPath(folderPath: unknown): string {
  return normalizeDocLibraryDisplayPath(folderPath).replace(/\/index\.md$/i, '')
}

export function getDocLibraryParentFolderPath(displayPath: unknown, fallback = ''): string {
  const segments = splitDocLibraryDisplayPath(displayPath).slice(0, -1)
  return segments.length > 0 ? `/${segments.join('/')}` : fallback
}

export function getDocLibraryLastPathSegment(displayPath: unknown): string {
  const segments = splitDocLibraryDisplayPath(displayPath)
  return segments[segments.length - 1] || ''
}

export function getDocLibraryDisplayFileName(displayPath: unknown, fallback = 'index.md'): string {
  return getDocLibraryLastPathSegment(displayPath) || fallback
}

export function stripDocLibraryMarkdownExtension(name: unknown): string {
  return String(name || '').replace(/\.md$/i, '')
}

export function getDocLibraryDocumentSlugFromPath(displayPath: unknown, fallback = 'untitled-page'): string {
  return slugifyDocLibraryPathSegment(stripDocLibraryMarkdownExtension(getDocLibraryDisplayFileName(displayPath, '')))
    || fallback
}

export function slugifyDocLibraryPathSegment(input: unknown, fallback = 'untitled-page'): string {
  return String(input || '')
    .trim()
    .toLowerCase()
    .replace(/\.md$/i, '')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    || fallback
}

export function compareDocLibraryDisplayPath(left: string, right: string): number {
  return String(left || '').localeCompare(String(right || ''), 'zh-Hans-CN')
}

export function buildDocLibraryFolderPathChain(folderSegments: string[]): string[] {
  const chain: string[] = []
  const walked: string[] = []
  for (const segment of folderSegments.map((item) => String(item || '').trim()).filter(Boolean)) {
    walked.push(segment)
    chain.push(`/${walked.join('/')}`)
  }
  return chain
}

export function replaceDocLibraryPathPrefix(path: unknown, oldPrefix: unknown, newPrefix: unknown): string {
  const safePath = normalizeDocLibraryDisplayPath(path)
  const safeOldPrefix = normalizeDocLibraryDisplayPath(oldPrefix)
  const safeNewPrefix = normalizeDocLibraryDisplayPath(newPrefix)
  if (!safePath || !safeOldPrefix) return safePath
  if (safePath === safeOldPrefix) return safeNewPrefix
  if (!safePath.startsWith(`${safeOldPrefix}/`)) return safePath
  return `${safeNewPrefix}${safePath.slice(safeOldPrefix.length)}`
}
