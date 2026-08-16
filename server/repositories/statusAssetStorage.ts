import { createHash, randomBytes } from 'crypto'
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'fs'
import { basename, join, resolve } from 'path'
import { STATUS_ASSET_DIR } from '../db.js'
import { auditLog } from '../middleware/audit.js'
import { uploadRepository } from './uploadRepository.js'

const MAX_STATUS_ASSET_BYTES = 8 * 1024 * 1024
const ALLOWED_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
const MIME_TO_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif'
}

function detectImageMime(buffer: Buffer): string {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png'
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg'
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp'
  if (buffer.length >= 6 && ['GIF87a', 'GIF89a'].includes(buffer.subarray(0, 6).toString('ascii'))) return 'image/gif'
  return ''
}

export function decodeStatusAssetDataUri(rawDataUri: string):
  | { ok: true; buffer: Buffer; mimeType: string; extension: string; sha256: string }
  | { ok: false; error: string } {
  const dataUri = String(rawDataUri || '').trim()
  const match = dataUri.match(/^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=\s]+)$/i)
  if (!match) return { ok: false, error: '图片必须是合法的 base64 data URI' }
  const mimeType = match[1].toLowerCase()
  if (!ALLOWED_MIME_TYPES.has(mimeType)) return { ok: false, error: '仅支持 png/jpeg/webp/gif 格式的图片' }
  const buffer = Buffer.from(match[2].replace(/\s+/g, ''), 'base64')
  if (!buffer.byteLength || buffer.byteLength > MAX_STATUS_ASSET_BYTES) return { ok: false, error: '单张状态图片大小不能超过 8MB' }
  if (detectImageMime(buffer) !== mimeType) return { ok: false, error: '图片内容与声明格式不符' }
  return {
    ok: true,
    buffer,
    mimeType,
    extension: MIME_TO_EXT[mimeType],
    sha256: createHash('sha256').update(buffer).digest('hex')
  }
}

export function saveStatusAssetDataUri(input: {
  chatRepository: any
  sessionId: string
  worldId?: string
  dataUri: string
  fileName: string
  sourceType?: string
  sourceRef?: unknown
}) {
  const decoded = decodeStatusAssetDataUri(input.dataUri)
  if (!decoded.ok) {
    auditLog('upload_failed', 'anonymous', { businessType: 'status_asset', reason: decoded.error })
    return decoded
  }
  const sourceType = input.sourceType === 'pixel_snapshot' ? 'pixel_snapshot' : 'upload'
  const id = `status_asset_${randomBytes(12).toString('hex')}`
  const finalName = `${id}.${decoded.extension}`
  const absolutePath = join(STATUS_ASSET_DIR, finalName)
  const storedPath = `status-assets/${finalName}`
  const now = new Date().toISOString()
  writeFileSync(absolutePath, decoded.buffer)
  try {
    input.chatRepository.insertStatusAsset({
      id,
      sessionId: input.sessionId,
      worldId: input.worldId || '',
      kind: 'image',
      originalFilename: String(input.fileName || finalName),
      storedPath,
      mimeType: decoded.mimeType,
      sizeBytes: decoded.buffer.byteLength,
      sha256: decoded.sha256,
      sourceType,
      sourceRefJson: JSON.stringify(input.sourceRef && typeof input.sourceRef === 'object' ? input.sourceRef : {}),
      status: 'active',
      createdAt: now,
      updatedAt: now
    })
    uploadRepository.recordUpload({
      businessType: sourceType === 'pixel_snapshot' ? 'status_asset_pixel' : 'status_asset',
      businessId: id,
      originalFilename: String(input.fileName || finalName),
      storedPath,
      mimeType: decoded.mimeType,
      sizeBytes: decoded.buffer.byteLength,
      sha256: decoded.sha256
    })
  } catch (error) {
    if (existsSync(absolutePath)) unlinkSync(absolutePath)
    throw error
  }
  return {
    ok: true as const,
    asset: input.chatRepository.findStatusAssetById(input.sessionId, id, input.worldId || ''),
    ref: { assetId: id, kind: 'image' as const }
  }
}

export function resolveStatusAssetFile(storedPath: unknown): string | null {
  const fileName = basename(String(storedPath || '').replace(/\\/g, '/'))
  if (!/^status_asset_[a-f0-9]{24}\.(png|jpg|webp|gif)$/i.test(fileName)) return null
  const absolutePath = resolve(STATUS_ASSET_DIR, fileName)
  if (!absolutePath.startsWith(resolve(STATUS_ASSET_DIR)) || !existsSync(absolutePath)) return null
  return absolutePath
}

export function readStatusAssetBytes(storedPath: unknown): Buffer | null {
  const file = resolveStatusAssetFile(storedPath)
  return file ? readFileSync(file) : null
}

export function removeStatusAssetFile(storedPath: unknown): void {
  const file = resolveStatusAssetFile(storedPath)
  if (file && existsSync(file)) unlinkSync(file)
}

export function restoreStatusAssetBytes(fileName: unknown, bytes: Buffer, expected: {
  assetId: string
  mimeType: string
  sha256: string
  sizeBytes: number
}): string {
  const normalizedName = basename(String(fileName || ''))
  if (!/^status_asset_[a-f0-9]{24}\.(png|jpg|webp|gif)$/i.test(normalizedName)) throw new Error('状态资产快照文件名不合法')
  if (!normalizedName.startsWith(`${expected.assetId}.`)) throw new Error(`状态资产快照文件名与 ID 不匹配：${expected.assetId}`)
  if (!bytes.byteLength || bytes.byteLength > MAX_STATUS_ASSET_BYTES) throw new Error(`状态资产快照文件大小不合法：${expected.assetId}`)
  if (expected.sizeBytes !== bytes.byteLength) throw new Error(`状态资产快照文件大小校验失败：${expected.assetId}`)
  if (detectImageMime(bytes) !== expected.mimeType) throw new Error(`状态资产快照图片格式校验失败：${expected.assetId}`)
  const actualSha256 = createHash('sha256').update(bytes).digest('hex')
  if (actualSha256 !== expected.sha256) throw new Error(`状态资产快照文件摘要校验失败：${expected.assetId}`)
  writeFileSync(join(STATUS_ASSET_DIR, normalizedName), bytes)
  return `status-assets/${normalizedName}`
}
