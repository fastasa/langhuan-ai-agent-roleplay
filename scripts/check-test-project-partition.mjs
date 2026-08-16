import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import process from 'node:process'

const workspaceRoot = process.cwd()
const vitestEntry = resolve(workspaceRoot, 'node_modules/vitest/vitest.mjs')
const testFilePattern = /\.(?:spec|test)\.[cm]?[jt]sx?$/i

function normalizeFilePath(filePath) {
  const absolutePath = resolve(workspaceRoot, filePath.trim()).replaceAll('\\', '/')
  return process.platform === 'win32' ? absolutePath.toLowerCase() : absolutePath
}

function listTestFiles(projectName) {
  const args = [vitestEntry, 'list', '--filesOnly']
  if (projectName) args.push(`--project=${projectName}`)

  const result = spawnSync(process.execPath, args, {
    cwd: workspaceRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      FORCE_COLOR: '0',
      NO_COLOR: '1'
    },
    timeout: 120_000
  })

  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || result.stdout.trim() || `vitest list exited with ${result.status}`)
  }

  return new Set(
    result.stdout
      .split(/\r?\n/u)
      .map(line => line.trim())
      .filter(line => testFilePattern.test(line))
      .map(normalizeFilePath)
  )
}

function difference(left, right) {
  return [...left].filter(filePath => !right.has(filePath))
}

const allFiles = listTestFiles()
const serverFiles = listTestFiles('server-node')
const browserFiles = listTestFiles('browser-jsdom')
const overlap = [...serverFiles].filter(filePath => browserFiles.has(filePath))
const coveredFiles = new Set([...serverFiles, ...browserFiles])
const missingFiles = difference(allFiles, coveredFiles)
const unexpectedFiles = difference(coveredFiles, allFiles)

if (overlap.length || missingFiles.length || unexpectedFiles.length) {
  const detail = [
    overlap.length ? `overlap:\n${overlap.join('\n')}` : '',
    missingFiles.length ? `missing:\n${missingFiles.join('\n')}` : '',
    unexpectedFiles.length ? `unexpected:\n${unexpectedFiles.join('\n')}` : ''
  ].filter(Boolean).join('\n\n')

  throw new Error(`Test project partition is invalid.\n${detail}`)
}

console.log(
  `Test project partition passed: total=${allFiles.size}, server-node=${serverFiles.size}, browser-jsdom=${browserFiles.size}, overlap=0, missing=0.`
)
