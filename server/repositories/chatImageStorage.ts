import { createHash, randomBytes } from 'crypto'
import { writeFileSync } from 'fs'
import { join } from 'path'
import { CHAT_IMAGE_DIR } from '../db.js'
import { auditLog } from '../middleware/audit.js'
import { uploadRepository } from './uploadRepository.js'

// 输入框图片上传：完全照搬头像上传范式（avatarStorage.ts）——data URI 前缀校验 + MIME 白名单 +
// magic bytes 校验 + 大小上限 + 写盘 + uploads 台账；区别在于头像图片较窄（仅 png/jpeg），
// 聊天图片放开到 png/jpeg/webp/gif，且没有现成的业务实体 id，改用随机 id 自referencing。
const MAX_CHAT_IMAGE_BYTES = 8 * 1024 * 1024
const MAX_GENERATED_CHAT_IMAGE_BYTES = 20 * 1024 * 1024
const ALLOWED_CHAT_IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
const MIME_TO_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif'
}

export type ChatImageSaveResult =
  | { ok: true; id: string; url: string; mime: string; size: number }
  | { ok: false; error: string }

// 已落盘文件名 → MIME 反查表（MIME_TO_EXT 的镜像，单一真值：改扩展名映射只改 MIME_TO_EXT 那张表）。
const EXT_TO_MIME: Record<string, string> = Object.fromEntries(
  Object.entries(MIME_TO_EXT).map(([mime, ext]) => [ext, mime])
)

/** 由 chat-images 目录下已落盘的文件名推断 MIME（批2·aiAppService 识图内联通道用）。
 *  只认 saveChatImageDataUri 生成的既知扩展名；未知扩展名返回空串，调用方按失效图片处理。 */
export function guessChatImageMimeFromFilename(filename: string): string {
  const ext = String(filename || '').split('.').pop()?.toLowerCase() || ''
  return EXT_TO_MIME[ext] || ''
}

function detectImageMime(buffer: Buffer): string {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'image/png'
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg'
  }
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') {
    return 'image/webp'
  }
  if (buffer.length >= 6 && ['GIF87a', 'GIF89a'].includes(buffer.subarray(0, 6).toString('ascii'))) {
    return 'image/gif'
  }
  return ''
}

/**
 * 保存聊天输入框上传的图片 data URI，返回可直接落 attachments_json 的附件基础信息。
 * 校验链路：data URI 前缀 -> 声明 MIME 白名单 -> base64 解码 -> 大小上限 -> magic bytes 与声明 MIME 一致。
 * 任一环节失败都返回 { ok: false }，不写盘、不落台账。
 */
export function saveChatImageDataUri(rawDataUri: string, originalName: string): ChatImageSaveResult {
  const dataUri = String(rawDataUri || '').trim()
  if (!dataUri.startsWith('data:image/')) {
    auditLog('upload_failed', 'anonymous', { businessType: 'chat_image', reason: 'not_data_uri' })
    return { ok: false, error: '图片格式不合法' }
  }
  const commaIndex = dataUri.indexOf(',')
  if (commaIndex < 0) {
    auditLog('upload_failed', 'anonymous', { businessType: 'chat_image', reason: 'malformed_data_uri' })
    return { ok: false, error: '图片格式不合法' }
  }
  const declaredMimeType = dataUri.slice(5, dataUri.indexOf(';')).toLowerCase()
  if (!ALLOWED_CHAT_IMAGE_MIME_TYPES.has(declaredMimeType)) {
    auditLog('upload_failed', 'anonymous', { businessType: 'chat_image', reason: 'mime_not_allowed', declaredMimeType })
    return { ok: false, error: '仅支持 png/jpeg/webp/gif 格式的图片' }
  }
  const base64Data = dataUri.slice(commaIndex + 1)
  if (!base64Data) {
    auditLog('upload_failed', 'anonymous', { businessType: 'chat_image', reason: 'empty_body' })
    return { ok: false, error: '图片内容为空' }
  }
  let buffer: Buffer
  try {
    buffer = Buffer.from(base64Data, 'base64')
  } catch {
    auditLog('upload_failed', 'anonymous', { businessType: 'chat_image', reason: 'base64_decode_failed' })
    return { ok: false, error: '图片内容解码失败' }
  }
  if (!buffer.byteLength || buffer.byteLength > MAX_CHAT_IMAGE_BYTES) {
    auditLog('upload_failed', 'anonymous', { businessType: 'chat_image', reason: 'size_invalid', sizeBytes: buffer.byteLength })
    return { ok: false, error: '单张图片大小不能超过 8MB' }
  }
  const detectedMimeType = detectImageMime(buffer)
  if (detectedMimeType !== declaredMimeType) {
    auditLog('upload_failed', 'anonymous', { businessType: 'chat_image', reason: 'signature_mismatch', declaredMimeType, detectedMimeType })
    return { ok: false, error: '图片内容与声明格式不符' }
  }

  const ext = MIME_TO_EXT[declaredMimeType]
  const id = `chat_img_${randomBytes(12).toString('hex')}`
  const finalName = `${id}.${ext}`
  writeFileSync(join(CHAT_IMAGE_DIR, finalName), buffer)
  const storedPath = `chat-images/${finalName}`
  uploadRepository.recordUpload({
    businessType: 'chat_image',
    businessId: id,
    originalFilename: String(originalName || finalName),
    storedPath,
    mimeType: declaredMimeType,
    sizeBytes: buffer.byteLength,
    sha256: createHash('sha256').update(buffer).digest('hex')
  })

  return { ok: true, id, url: `/chat-images/${finalName}`, mime: declaredMimeType, size: buffer.byteLength }
}

/**
 * 保存 Codex App Server imageGeneration 返回的 base64。
 *
 * 上游结果尚未进入琅嬛信任域：仍需 base64 形状、大小和 magic bytes 三道校验，校验通过后才写盘并登记
 * uploads 台账。生成图允许 20MB（高质量 PNG 常大于用户上传的 8MB 上限），但静态服务门禁与普通聊天图一致。
 */
export function saveGeneratedChatImageBase64(rawBase64: string, originalName = '星依生成图片'): ChatImageSaveResult {
  const raw = String(rawBase64 || '').trim()
  const base64Data = raw.startsWith('data:image/') ? raw.slice(raw.indexOf(',') + 1) : raw
  if (!base64Data || !/^[A-Za-z0-9+/=\s]+$/.test(base64Data)) {
    auditLog('upload_failed', 'anonymous', { businessType: 'chat_image_generated', reason: 'invalid_base64' })
    return { ok: false, error: 'Codex 返回的图片内容不合法' }
  }
  const buffer = Buffer.from(base64Data.replace(/\s+/g, ''), 'base64')
  if (!buffer.byteLength || buffer.byteLength > MAX_GENERATED_CHAT_IMAGE_BYTES) {
    auditLog('upload_failed', 'anonymous', { businessType: 'chat_image_generated', reason: 'size_invalid', sizeBytes: buffer.byteLength })
    return { ok: false, error: 'Codex 返回的图片为空或超过 20MB' }
  }
  const detectedMimeType = detectImageMime(buffer)
  if (!ALLOWED_CHAT_IMAGE_MIME_TYPES.has(detectedMimeType)) {
    auditLog('upload_failed', 'anonymous', { businessType: 'chat_image_generated', reason: 'signature_invalid' })
    return { ok: false, error: 'Codex 返回的图片格式不受支持' }
  }

  const ext = MIME_TO_EXT[detectedMimeType]
  const id = `chat_gen_${randomBytes(12).toString('hex')}`
  const finalName = `${id}.${ext}`
  writeFileSync(join(CHAT_IMAGE_DIR, finalName), buffer)
  const storedPath = `chat-images/${finalName}`
  uploadRepository.recordUpload({
    businessType: 'chat_image_generated',
    businessId: id,
    originalFilename: String(originalName || finalName),
    storedPath,
    mimeType: detectedMimeType,
    sizeBytes: buffer.byteLength,
    sha256: createHash('sha256').update(buffer).digest('hex')
  })
  return { ok: true, id, url: `/chat-images/${finalName}`, mime: detectedMimeType, size: buffer.byteLength }
}
