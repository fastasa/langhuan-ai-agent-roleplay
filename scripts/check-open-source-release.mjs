import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

const projectRoot = process.cwd()
const blockedSalutation = String.fromCodePoint(0x7238, 0x7238)
const expectedLicenseHash = '0d96a4ff68ad6d4b6f1f30f713b18d5184912ba8dd389f86aa7710db079abcb0'
const textExtensions = new Set([
  '', '.cjs', '.css', '.env', '.html', '.js', '.json', '.jsx', '.md', '.mjs',
  '.svg', '.ts', '.tsx', '.txt', '.vue', '.xml', '.yaml', '.yml'
])
const blockedExtensions = new Set(['.bak', '.db', '.db3', '.log', '.sqlite', '.sqlite3'])
const blockedPathPatterns = [
  /(^|\/)docs\/plans(\/|$)/i,
  /(^|\/)plans(\/|$)/i,
  /(^|\/)server\/auth(\/|$)/i,
  /(^|\/)server\/routes\/(?:auth|admin|guest)\.[^/]+$/i,
  /(^|\/)src\/components\/(?:auth|admin|guest)(\/|$)/i,
  /(^|\/)src\/stores\/authStore\.[^/]+$/i,
  /(^|\/)server\/data(\/|$)/i
]

function normalize(relativePath) {
  return String(relativePath || '').replace(/\\/g, '/').replace(/^\.\//, '')
}

function listGitCandidates() {
  const output = execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    { cwd: projectRoot, encoding: 'utf8' }
  )
  return output.split('\0').filter(Boolean).map(normalize)
}

function walk(rootPath, basePath = rootPath, result = []) {
  if (!existsSync(rootPath)) return result
  const stat = lstatSync(rootPath)
  if (stat.isSymbolicLink()) {
    result.push({ relativePath: normalize(path.relative(basePath, rootPath)), absolutePath: rootPath, symlink: true })
    return result
  }
  if (stat.isDirectory()) {
    for (const entry of readdirSync(rootPath)) walk(path.join(rootPath, entry), basePath, result)
    return result
  }
  if (stat.isFile()) {
    result.push({ relativePath: normalize(path.relative(basePath, rootPath)), absolutePath: rootPath, symlink: false })
  }
  return result
}

function readArgs() {
  const rootIndex = process.argv.indexOf('--root')
  if (rootIndex < 0) return { mode: 'git', root: projectRoot }
  const value = process.argv[rootIndex + 1]
  if (!value) throw new Error('--root 需要目录路径')
  return { mode: 'directory', root: path.resolve(value) }
}

function inspectFile(relativePath, absolutePath, issues) {
  const normalized = normalize(relativePath)
  const extension = path.extname(normalized).toLowerCase()
  if (blockedPathPatterns.some((pattern) => pattern.test(normalized))) {
    issues.push(`${normalized}: 禁止进入公开发行的路径`)
  }
  if (blockedExtensions.has(extension)) {
    issues.push(`${normalized}: 数据库、日志或备份文件不得进入发行物`)
  }
  if (!textExtensions.has(extension)) return
  let text
  try {
    text = readFileSync(absolutePath, 'utf8')
  } catch (error) {
    issues.push(`${normalized}: 无法按 UTF-8 读取（${error instanceof Error ? error.message : String(error)}）`)
    return
  }
  if (text.includes('\u0000')) {
    issues.push(`${normalized}: 文本源码含 NUL 控制字节`)
    return
  }
  if (text.includes(blockedSalutation)) {
    issues.push(`${normalized}: 含公开版禁用称呼`)
  }
  if (/BEGIN (?:RSA |OPENSSH |EC |DSA )?PRIVATE KEY/.test(text)) {
    issues.push(`${normalized}: 含私钥正文`)
  }
}

const args = readArgs()
const entries = args.mode === 'git'
  ? listGitCandidates().map((relativePath) => ({
      relativePath,
      absolutePath: path.join(projectRoot, relativePath),
      symlink: existsSync(path.join(projectRoot, relativePath)) && lstatSync(path.join(projectRoot, relativePath)).isSymbolicLink()
    }))
  : walk(args.root)

const issues = []
for (const entry of entries) {
  if (entry.symlink) {
    issues.push(`${entry.relativePath}: 发行物不接受符号链接`)
    continue
  }
  inspectFile(entry.relativePath, entry.absolutePath, issues)
}

if (args.mode === 'git') {
  const licensePath = path.join(projectRoot, 'LICENSE')
  if (!existsSync(licensePath)) {
    issues.push('LICENSE: 缺少 AGPLv3 完整许可证正文')
  } else {
    const licenseHash = createHash('sha256').update(readFileSync(licensePath)).digest('hex')
    if (licenseHash !== expectedLicenseHash) issues.push(`LICENSE: 正文哈希不符（${licenseHash}）`)
  }
  const packageJson = JSON.parse(readFileSync(path.join(projectRoot, 'package.json'), 'utf8'))
  if (packageJson.license !== 'AGPL-3.0-only') issues.push('package.json: license 必须是 AGPL-3.0-only')
  if (existsSync(path.join(projectRoot, 'dist'))) {
    for (const entry of walk(path.join(projectRoot, 'dist'))) {
      inspectFile(`dist/${entry.relativePath}`, entry.absolutePath, issues)
    }
  }
}

if (issues.length) {
  console.error('开源发行检查失败：')
  for (const issue of [...new Set(issues)].sort()) console.error(`- ${issue}`)
  process.exit(1)
}

console.log(`开源发行检查通过：${entries.length} 个${args.mode === 'git' ? ' Git 候选' : '发行目录'}文件`)
