import { existsSync, lstatSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const rootDir = process.cwd()

const textExtensions = new Set([
  '.css',
  '.html',
  '.htm',
  '.js',
  '.json',
  '.map',
  '.md',
  '.mjs',
  '.svg',
  '.txt',
  '.xml',
  '.yaml',
  '.yml'
])

const strictTextExtensions = new Set([
  '.html',
  '.htm',
  '.json',
  '.md',
  '.txt',
  '.xml',
  '.yaml',
  '.yml'
])

const blockedArchiveExtensions = new Set([
  '.7z',
  '.bak',
  '.gz',
  '.rar',
  '.tar',
  '.tgz',
  '.zip'
])

const blockedDataExtensions = new Set([
  '.db',
  '.db3',
  '.log',
  '.sqlite',
  '.sqlite3'
])

function toRelative(filePath) {
  return path.relative(rootDir, filePath).replace(/\\/g, '/')
}

function normalizePath(filePath) {
  return filePath.replace(/\\/g, '/').toLowerCase()
}

function addIssue(issues, filePath, rule, message) {
  issues.push({
    file: toRelative(filePath),
    rule,
    message
  })
}

function hasSegment(normalizedPath, segment) {
  return normalizedPath.split('/').includes(segment)
}

function isSamplePath(normalizedPath) {
  return /(^|[./_-])(sample|samples|demo|demos|example|examples|fixture|fixtures)([./_-]|$)/i.test(normalizedPath)
}

function isSyntheticSample(content) {
  return /"sample_type"\s*:\s*"synthetic"/i.test(content)
    || /"source"\s*:\s*"generated-demo"/i.test(content)
    || /"source"\s*:\s*"synthetic"/i.test(content)
}

function inspectPath(filePath, issues) {
  const normalizedPath = normalizePath(filePath)
  const baseName = path.basename(filePath)
  const lowerBaseName = baseName.toLowerCase()
  const ext = path.extname(filePath).toLowerCase()

  if (lowerBaseName === '.git' || hasSegment(normalizedPath, '.git')) {
    addIssue(issues, filePath, 'git-directory', 'A public asset path contains .git.')
  }

  if (/^\.env(?:$|\.)/i.test(baseName)) {
    addIssue(issues, filePath, 'env-file', 'A public asset path contains an environment file.')
  }

  if (normalizedPath.includes('/server/data/') || normalizedPath.endsWith('/server/data')) {
    addIssue(issues, filePath, 'server-data-path', 'A public asset path contains server/data.')
  }

  if (ext === '.map') {
    addIssue(issues, filePath, 'source-map-file', 'Source map files are not allowed in public assets.')
  }

  if (blockedArchiveExtensions.has(ext)) {
    addIssue(issues, filePath, 'archive-file', 'Archive or backup files are not allowed in public assets.')
  }

  if (blockedDataExtensions.has(ext)) {
    addIssue(issues, filePath, 'data-file', 'Database and log files are not allowed in public assets.')
  }

  if (normalizedPath.includes('/summary-samples/')) {
    addIssue(issues, filePath, 'summary-samples-path', 'summary-samples must not be served as public assets.')
  }

  if (ext === '.json' && /(^|[._-])real([._-]|$)/i.test(baseName)) {
    addIssue(issues, filePath, 'real-json-name', 'JSON files marked as real data are not allowed in public assets.')
  }

  if (/backup|dump|sqlite|database/i.test(baseName) && !blockedDataExtensions.has(ext) && !blockedArchiveExtensions.has(ext)) {
    addIssue(issues, filePath, 'backup-like-name', 'Public asset names must not look like backups or database dumps.')
  }
}

function inspectText(filePath, issues) {
  const ext = path.extname(filePath).toLowerCase()
  const baseName = path.basename(filePath)
  const isEnvFile = /^\.env(?:$|\.)/i.test(baseName)
  if (!textExtensions.has(ext) && !isEnvFile) return

  const content = readFileSync(filePath, 'utf8')
  const normalizedPath = normalizePath(filePath)
  const strict = strictTextExtensions.has(ext) || isEnvFile

  if (/sourceMappingURL|sourcesContent/.test(content)) {
    addIssue(issues, filePath, 'source-map-marker', 'Source map markers or embedded sources are not allowed.')
  }

  if (/BEGIN (?:RSA |OPENSSH |EC |DSA )?PRIVATE KEY/.test(content)) {
    addIssue(issues, filePath, 'private-key', 'Private keys are not allowed in public assets.')
  }

  if (/langhuan_session/.test(content)) {
    addIssue(issues, filePath, 'session-cookie-name', 'Session cookie names must not appear in public assets.')
  }

  if (/server[\\/]+data/i.test(content)) {
    addIssue(issues, filePath, 'server-data-content', 'Public assets must not reference server/data.')
  }

  if (!strict) return

  if (/(source[_ -]?file|sourceFile|来源文件)/i.test(content)) {
    addIssue(issues, filePath, 'source-file-marker', 'Public text assets must not contain source file markers.')
  }

  if (/(target[_ -]?id|targetId)/i.test(content)) {
    addIssue(issues, filePath, 'target-id-marker', 'Public text assets must not contain target id markers.')
  }

  if (/(access[_-]?token|refresh[_-]?token|api[_-]?key|authorization|secret(?:[_-]?key)?)\s*[:=]\s*["'][^"']{12,}["']/i.test(content)) {
    addIssue(issues, filePath, 'secret-like-content', 'Public text assets must not contain secret-like assignments.')
  }

  if (
    isSamplePath(normalizedPath)
    && !isSyntheticSample(content)
    && (/"messages"\s*:/i.test(content) || /"model"\s*:/i.test(content) || /"role"\s*:\s*"(?:user|assistant|system)"/i.test(content))
  ) {
    addIssue(issues, filePath, 'non-synthetic-sample', 'Sample or demo text assets with chat-like content must be marked synthetic.')
  }
}

function walk(targetPath, issues) {
  if (!existsSync(targetPath)) {
    addIssue(issues, targetPath, 'missing-root', 'Configured public asset root does not exist.')
    return
  }

  const info = lstatSync(targetPath)
  inspectPath(targetPath, issues)

  if (info.isSymbolicLink()) {
    addIssue(issues, targetPath, 'symbolic-link', 'Symbolic links are not allowed in public assets.')
    return
  }

  if (info.isDirectory()) {
    for (const entry of readdirSync(targetPath)) {
      walk(path.join(targetPath, entry), issues)
    }
    return
  }

  if (!info.isFile()) return
  inspectText(targetPath, issues)
}

export function scanPublicSafety(roots, options = {}) {
  const rootPaths = Array.isArray(roots) ? roots : [roots]
  const issues = []
  const cwd = options.cwd || rootDir

  for (const root of rootPaths) {
    walk(path.resolve(cwd, root), issues)
  }

  issues.sort((a, b) => `${a.file}:${a.rule}`.localeCompare(`${b.file}:${b.rule}`))
  return {
    ok: issues.length === 0,
    issues
  }
}

export function formatPublicSafetyIssues(issues) {
  return issues.map((issue) => `- ${issue.file} [${issue.rule}] ${issue.message}`).join('\n')
}

const currentFile = fileURLToPath(import.meta.url)
const invokedFile = process.argv[1] ? fileURLToPath(pathToFileURL(process.argv[1]).href) : ''

if (currentFile === invokedFile) {
  const roots = process.argv.slice(2)
  const scanRoots = roots.length > 0 ? roots : ['public', 'dist']
  const result = scanPublicSafety(scanRoots)

  if (!result.ok) {
    console.error('Public asset safety check failed:')
    console.error(formatPublicSafetyIssues(result.issues))
    process.exit(1)
  }

  console.log(`Public asset safety check passed: ${scanRoots.join(', ')}`)
}
