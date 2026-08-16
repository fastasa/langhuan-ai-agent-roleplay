import { mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'fs'
import { dirname } from 'path'

interface JsonReadCacheEntry {
  mtimeMs: number
  size: number
  value: unknown
}

const readCache = new Map<string, JsonReadCacheEntry>()

/** 容错读取本机旁路 JSON；文件不存在、损坏或格式错误时返回 undefined。 */
export function readJsonFileSafe(filePath: string): unknown {
  let stat: ReturnType<typeof statSync>
  try {
    stat = statSync(filePath)
  } catch {
    readCache.delete(filePath)
    return undefined
  }
  const cached = readCache.get(filePath)
  if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) return cached.value
  let value: unknown
  try {
    value = JSON.parse(readFileSync(filePath, 'utf8'))
  } catch {
    value = undefined
  }
  readCache.set(filePath, { mtimeMs: stat.mtimeMs, size: stat.size, value })
  return value
}

/** 先写临时文件再原子替换，并为 Windows 瞬时文件锁做有限重试。 */
export function writeJsonFileAtomic(filePath: string, data: unknown, indent?: number): void {
  mkdirSync(dirname(filePath), { recursive: true })
  const tmpPath = `${filePath}.tmp-${process.pid}-${Date.now()}`
  writeFileSync(tmpPath, JSON.stringify(data, null, indent))
  const maxRetries = 5
  for (let attempt = 0; ; attempt += 1) {
    try {
      renameSync(tmpPath, filePath)
      break
    } catch (error) {
      const code = (error as NodeJS.ErrnoException)?.code
      const transientLock = code === 'EPERM' || code === 'EBUSY' || code === 'EACCES'
      if (!transientLock || attempt >= maxRetries) throw error
    }
  }
  readCache.delete(filePath)
}
