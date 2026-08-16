import { createHash } from 'crypto'
import { mkdirSync, writeFileSync, rmSync, existsSync, readdirSync, readFileSync } from 'fs'
import { join, dirname, resolve, sep, relative } from 'path'
import { unzipSync, zipSync } from 'fflate'
import { PERSONALITY_MODEL_DIR } from '../db.js'
import { auditLog } from '../middleware/audit.js'
import { uploadRepository } from './uploadRepository.js'

// 人格模型上传体上限：int8 量化包约 100MB，留足冗余允许偶尔的 fp32 包；超过直接拒绝，避免塞爆磁盘。
const MAX_MODEL_BYTES = 600 * 1024 * 1024
// transformers.js 加载 CrossEncoder 至少需要这些文件；缺一不可，否则浏览器端会加载失败。
const REQUIRED_ENTRIES = ['config.json', 'onnx/model_quantized.onnx']
// tokenizer 至少要有其一（快速分词器 tokenizer.json 或配置 tokenizer_config.json）。
const TOKENIZER_ENTRIES = ['tokenizer.json', 'tokenizer_config.json']

export type PersonalityModelSaveResult =
  | { ok: true; storedPath: string; sizeBytes: number; fileCount: number }
  | { ok: false; error: string }

export function safePersonalityModelPathSegment(value: string): string {
  return String(value || '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80)
}

function safeCharacterId(characterId: string): string {
  return safePersonalityModelPathSegment(characterId)
}

function safeVersionId(versionId: string): string {
  return safePersonalityModelPathSegment(versionId)
}

function isWithinDirectory(baseDir: string, targetPath: string): boolean {
  const base = resolve(baseDir)
  const target = resolve(targetPath)
  return target === base || target.startsWith(`${base}${sep}`)
}

export function resolvePersonalityModelStoredPathDirectory(storedPath: string): string {
  const segments = String(storedPath || '').replace(/^\/+/, '').split('/').filter(Boolean)
  if (segments[0] !== 'personality-models') return ''
  const characterDir = safeCharacterId(segments[1] || '')
  const versionDir = safeVersionId(segments[2] || '')
  if (!characterDir) return ''
  return versionDir
    ? join(PERSONALITY_MODEL_DIR, characterDir, versionDir)
    : join(PERSONALITY_MODEL_DIR, characterDir)
}

export function removePersonalityModelPath(storedPath: string): boolean {
  const targetDir = resolvePersonalityModelStoredPathDirectory(storedPath)
  if (!targetDir || !isWithinDirectory(PERSONALITY_MODEL_DIR, targetDir)) return false
  if (existsSync(targetDir)) {
    rmSync(targetDir, { recursive: true, force: true })
  }
  return true
}

function legacySafeCharacterId(characterId: string): string {
  return String(characterId || '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80)
}

// zip 里若所有条目共享同一顶层目录（用户直接打包了模型文件夹），统一剥掉这层前缀。
function stripCommonRoot(entries: Record<string, Uint8Array>): Record<string, Uint8Array> {
  const names = Object.keys(entries).filter((name) => !name.endsWith('/'))
  if (!names.length) return entries
  const firstSegment = names[0].split('/')[0]
  if (!firstSegment) return entries
  const shared = names.every((name) => name.startsWith(`${firstSegment}/`))
  if (!shared) return entries
  const stripped: Record<string, Uint8Array> = {}
  for (const name of names) {
    stripped[name.slice(firstSegment.length + 1)] = entries[name]
  }
  return stripped
}

function isUnsafeEntryName(name: string): boolean {
  if (!name || name.startsWith('/') || name.startsWith('\\')) return true
  if (name.includes('..')) return true
  if (/^[a-zA-Z]:/.test(name)) return true
  return false
}

export function savePersonalityModelZip(input: {
  characterId: string
  versionId?: string
  buffer: Buffer
  originalFilename?: string
}): PersonalityModelSaveResult {
  const characterId = String(input.characterId || '').trim()
  if (!characterId) return { ok: false, error: '缺少角色 ID' }

  const buffer = input.buffer
  if (!buffer || !buffer.byteLength) return { ok: false, error: '上传内容为空' }
  if (buffer.byteLength > MAX_MODEL_BYTES) {
    auditLog('upload_failed', 'anonymous', { businessType: 'personality_model', characterId, reason: 'too_large', sizeBytes: buffer.byteLength })
    return { ok: false, error: `模型包过大（${(buffer.byteLength / 1024 / 1024).toFixed(1)}MB），上限 ${Math.floor(MAX_MODEL_BYTES / 1024 / 1024)}MB` }
  }

  let entries: Record<string, Uint8Array>
  try {
    entries = unzipSync(new Uint8Array(buffer))
  } catch (error) {
    auditLog('upload_failed', 'anonymous', { businessType: 'personality_model', characterId, reason: 'unzip_failed', error: error instanceof Error ? error.message : String(error) })
    return { ok: false, error: '无法解析 zip 包，请上传 personality-reranker:export-onnx 生成的 ONNX 包' }
  }

  const normalized = stripCommonRoot(entries)
  const fileNames = Object.keys(normalized).filter((name) => !name.endsWith('/'))

  for (const name of fileNames) {
    if (isUnsafeEntryName(name)) {
      auditLog('upload_failed', 'anonymous', { businessType: 'personality_model', characterId, reason: 'unsafe_entry', entry: name })
      return { ok: false, error: 'zip 包含非法路径，已拒绝' }
    }
  }

  const missingRequired = REQUIRED_ENTRIES.filter((entry) => !fileNames.includes(entry))
  if (missingRequired.length) {
    return { ok: false, error: `模型包缺少必要文件：${missingRequired.join('、')}` }
  }
  if (!TOKENIZER_ENTRIES.some((entry) => fileNames.includes(entry))) {
    return { ok: false, error: '模型包缺少分词器文件（tokenizer.json 或 tokenizer_config.json）' }
  }

  const safeId = safeCharacterId(characterId)
  const safeModelVersionId = safeVersionId(String(input.versionId || ''))
  const targetDir = safeModelVersionId
    ? join(PERSONALITY_MODEL_DIR, safeId, safeModelVersionId)
    : join(PERSONALITY_MODEL_DIR, safeId)
  // 上传新模型即整包替换目标版本目录，不清理其它版本，避免回滚链路被破坏。
  if (existsSync(targetDir)) {
    rmSync(targetDir, { recursive: true, force: true })
  }

  let totalBytes = 0
  for (const name of fileNames) {
    const absolutePath = join(targetDir, name)
    // 二次防穿越：解析后的绝对路径必须仍在 targetDir 下。
    if (!isWithinDirectory(targetDir, absolutePath)) {
      rmSync(targetDir, { recursive: true, force: true })
      return { ok: false, error: 'zip 解压路径越界，已拒绝' }
    }
    mkdirSync(dirname(absolutePath), { recursive: true })
    const data = normalized[name]
    writeFileSync(absolutePath, data)
    totalBytes += data.byteLength
  }

  const storedPath = safeModelVersionId
    ? `personality-models/${safeId}/${safeModelVersionId}`
    : `personality-models/${safeId}`
  uploadRepository.recordUpload({
    businessType: 'personality_model',
    businessId: characterId,
    originalFilename: String(input.originalFilename || `${safeId}.zip`),
    storedPath,
    mimeType: 'application/zip',
    sizeBytes: buffer.byteLength,
    sha256: createHash('sha256').update(buffer).digest('hex')
  })

  return { ok: true, storedPath, sizeBytes: totalBytes, fileCount: fileNames.length }
}

export type PersonalityModelExportResult =
  | { ok: true; buffer: Buffer; fileCount: number; sizeBytes: number }
  | { ok: false; error: string }

// 递归收集模型目录文件；skipTopLevelVersionDirs 用于旧上传（指向角色根目录）时跳过其它版本子目录，避免把多个版本打进一个包。
function collectModelFiles(
  rootDir: string,
  currentDir: string,
  out: Record<string, Uint8Array>,
  skipTopLevelVersionDirs: boolean
) {
  for (const entry of readdirSync(currentDir, { withFileTypes: true })) {
    const absolutePath = join(currentDir, entry.name)
    if (entry.isDirectory()) {
      if (skipTopLevelVersionDirs && currentDir === rootDir && entry.name.startsWith('pmv')) continue
      collectModelFiles(rootDir, absolutePath, out, skipTopLevelVersionDirs)
    } else if (entry.isFile()) {
      const relativeName = relative(rootDir, absolutePath).split(sep).join('/')
      out[relativeName] = new Uint8Array(readFileSync(absolutePath))
    }
  }
}

// 把已存储的人格模型版本目录原样打包为 zip：结构与上传/导入侧校验一致，可直接导入其它角色。
export function exportPersonalityModelZip(storedPath: string): PersonalityModelExportResult {
  const targetDir = resolvePersonalityModelStoredPathDirectory(storedPath)
  if (!targetDir || !isWithinDirectory(PERSONALITY_MODEL_DIR, targetDir)) {
    return { ok: false, error: '模型路径非法，无法导出' }
  }
  if (!existsSync(targetDir)) {
    return { ok: false, error: '模型文件已不存在，无法导出' }
  }
  // storedPath 含三段（personality-models/<角色>/<版本>）即为独立版本目录；仅两段属旧上传，需跳过同级版本子目录。
  const segments = String(storedPath || '').replace(/^\/+/, '').split('/').filter(Boolean)
  const skipTopLevelVersionDirs = segments.length < 3

  const entries: Record<string, Uint8Array> = {}
  collectModelFiles(targetDir, targetDir, entries, skipTopLevelVersionDirs)
  const fileNames = Object.keys(entries)
  if (!fileNames.length) return { ok: false, error: '模型目录为空，无法导出' }

  // 导出包必须满足导入侧结构校验，否则导入其它角色时会被拒绝
  const missingRequired = REQUIRED_ENTRIES.filter((entry) => !fileNames.includes(entry))
  if (missingRequired.length) {
    return { ok: false, error: `模型包缺少必要文件：${missingRequired.join('、')}` }
  }
  if (!TOKENIZER_ENTRIES.some((entry) => fileNames.includes(entry))) {
    return { ok: false, error: '模型包缺少分词器文件，无法导出' }
  }

  let sizeBytes = 0
  for (const name of fileNames) sizeBytes += entries[name].byteLength
  const zipped = zipSync(entries, { level: 6 })
  return { ok: true, buffer: Buffer.from(zipped), fileCount: fileNames.length, sizeBytes }
}

export function removePersonalityModel(characterId: string): boolean {
  const safeId = legacySafeCharacterId(characterId)
  if (!safeId) return false
  const targetDir = join(PERSONALITY_MODEL_DIR, safeId)
  if (existsSync(targetDir)) {
    rmSync(targetDir, { recursive: true, force: true })
  }
  return true
}
