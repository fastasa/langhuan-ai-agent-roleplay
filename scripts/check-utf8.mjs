import { readdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'

const rootDir = process.cwd()
const textExtensions = new Set([
  '.vue',
  '.ts',
  '.js',
  '.mjs',
  '.cjs',
  '.css',
  '.html',
  '.json',
  '.md',
  '.yml',
  '.yaml'
])

const includedRoots = [
  'src',
  'server',
  'tests',
  'scripts',
  'docs',
  'public'
]

const includedFiles = [
  'package.json',
  'tsconfig.json',
  'tsconfig.node.json',
  'vite.config.js',
  'vitest.config.js',
  'DEVELOPMENT.md',
  '.editorconfig',
  '.gitattributes',
  'nodemon.json',
  'start.bat'
]

const excludedDirNames = new Set([
  '.git',
  'node_modules',
  'dist',
  'backups',
  'sandbox'
])

const decoder = new TextDecoder('utf-8', { fatal: true })
const invalidFiles = []
const nulFiles = []

async function walk(targetPath) {
  const info = await stat(targetPath)
  if (info.isDirectory()) {
    const entries = await readdir(targetPath, { withFileTypes: true })
    for (const entry of entries) {
      if (excludedDirNames.has(entry.name)) continue
      await walk(path.join(targetPath, entry.name))
    }
    return
  }

  if (!info.isFile()) return
  if (!textExtensions.has(path.extname(targetPath).toLowerCase())) return

  const buffer = await readFile(targetPath)
  if (buffer.includes(0)) {
    nulFiles.push(path.relative(rootDir, targetPath))
  }
  if (!buffer.some((byte) => byte > 0x7f)) return

  try {
    decoder.decode(buffer)
  } catch {
    invalidFiles.push(path.relative(rootDir, targetPath))
  }
}

for (const relativePath of includedRoots) {
  const absolutePath = path.join(rootDir, relativePath)
  try {
    await walk(absolutePath)
  } catch {
    // Ignore missing optional directories.
  }
}

for (const relativePath of includedFiles) {
  const absolutePath = path.join(rootDir, relativePath)
  try {
    await walk(absolutePath)
  } catch {
    // Ignore missing optional files.
  }
}

if (invalidFiles.length > 0) {
  console.error('检测到非 UTF-8 文本文件：')
  for (const file of invalidFiles.sort()) {
    console.error(`- ${file}`)
  }
  process.exit(1)
}

if (nulFiles.length > 0) {
  console.error('检测到文本源码中的 NUL 控制字节：')
  for (const file of nulFiles.sort()) {
    console.error(`- ${file}`)
  }
  process.exit(1)
}

console.log('UTF-8 编码检查通过')
