export type UnitTreePathTarget<T extends Record<string, unknown>> = T

export function normalizeUnitTreePathInput(
  value: unknown,
  options: { rootLabel: string; leadingSlash?: boolean; trailingSlashWhenRoot?: boolean }
): string {
  const rootLabel = String(options.rootLabel || '').trim()
  const leadingSlash = options.leadingSlash !== false
  const normalized = String(value || '')
    .replace(/\\/g, '/')
    .replace(/\s*\/\s*/g, '/')
    .replace(/\/+/g, '/')
    .trim()
    .replace(/^\/+/, '')
    .replace(/\/+$/g, '')
  const withoutRoot = normalized === rootLabel
    ? ''
    : normalized.startsWith(`${rootLabel}/`)
      ? normalized.slice(rootLabel.length + 1)
      : normalized
  const parts = [rootLabel, ...withoutRoot.split('/').map((item) => item.trim()).filter(Boolean)].filter(Boolean)
  const result = `${leadingSlash ? '/' : ''}${parts.join('/')}`
  if (options.trailingSlashWhenRoot && parts.length <= 1) return `${result.replace(/\/+$/g, '')}/`
  return result || (leadingSlash ? '/' : '')
}

export function buildUnitTreePathInput(
  rootLabel: string,
  segments: unknown[],
  options: { leadingSlash?: boolean; trailingSlashWhenRoot?: boolean } = {}
): string {
  const root = String(rootLabel || '').trim()
  const pathSegments = segments.map((item) => String(item || '').trim()).filter(Boolean)
  return normalizeUnitTreePathInput([root, ...pathSegments].join('/'), {
    rootLabel: root,
    leadingSlash: options.leadingSlash,
    trailingSlashWhenRoot: options.trailingSlashWhenRoot
  })
}

export function syncUnitTreeCreateTargetFromPath<T extends Record<string, unknown>>(options: {
  pathInput: string
  initialPathInput: string
  currentTarget: T
  preserveCurrentTarget?: boolean
  normalizePathInput: (value: string) => string
  resolveTarget: (normalizedPathInput: string) => T
}): { pathInput: string; target: T } {
  const pathInput = options.normalizePathInput(options.pathInput)
  const initialPathInput = options.normalizePathInput(options.initialPathInput)
  if (options.preserveCurrentTarget && pathInput === initialPathInput) {
    return { pathInput, target: options.currentTarget }
  }
  return { pathInput, target: options.resolveTarget(pathInput) }
}

export function isGeneratedUnitTreeFileName(fileName: unknown): boolean {
  const baseName = String(fileName || '')
    .trim()
    .replace(/\.md$/i, '')
    .toLowerCase()
  return /^(新桠|新页面|untitled-page)(-\d+)?$/u.test(baseName)
}

export function chooseUnitTreeMarkdownFileName(options: {
  currentFileName?: unknown
  title?: unknown
  fallback?: string
  slugify: (value: unknown, fallback?: string) => string
}): string {
  const currentFileName = String(options.currentFileName || '').trim()
  if (currentFileName && !isGeneratedUnitTreeFileName(currentFileName)) {
    return /\.md$/i.test(currentFileName) ? currentFileName : `${currentFileName}.md`
  }
  const titleSlug = options.slugify(options.title, options.fallback || 'untitled-page')
  return /\.md$/i.test(titleSlug) ? titleSlug : `${titleSlug}.md`
}
