import { createHash } from 'crypto'
import { writeFileSync } from 'fs'
import { join } from 'path'
import { AVATAR_DIR } from '../../application/workspace/workspaceSnapshotMigrator.js'
import { auditLog } from '../../middleware/audit.js'
import { uploadRepository } from '../uploadRepository.js'

const MAX_AVATAR_BYTES = 3 * 1024 * 1024
const ALLOWED_AVATAR_MIME_TYPES = new Set(['image/png', 'image/jpeg'])

function detectImageMime(buffer: Buffer) {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'image/png'
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg'
  }
  return ''
}

export function saveAvatarDataUri(rawPath: string, fileName: string): string {
  let avatarPath = rawPath
  if (avatarPath && avatarPath.startsWith('data:image/')) {
    try {
      const declaredMimeType = avatarPath.slice(5, avatarPath.indexOf(';')).toLowerCase()
      if (!ALLOWED_AVATAR_MIME_TYPES.has(declaredMimeType)) {
        auditLog('upload_failed', 'anonymous', { businessType: 'avatar', reason: 'mime_not_allowed', declaredMimeType })
        return ''
      }
      const mimeType = declaredMimeType === 'image/png' ? 'image/png' : 'image/jpeg'
      const ext = mimeType === 'image/png' ? 'png' : 'jpg'
      const base64Data = avatarPath.split(',')[1]
      if (base64Data) {
        const buffer = Buffer.from(base64Data, 'base64')
        if (buffer.byteLength > MAX_AVATAR_BYTES || detectImageMime(buffer) !== mimeType) {
          auditLog('upload_failed', 'anonymous', { businessType: 'avatar', reason: 'size_or_signature_invalid', mimeType })
          return ''
        }
        const finalName = `${fileName}.${ext}`
        writeFileSync(join(AVATAR_DIR, finalName), buffer)
        avatarPath = `avatars/${finalName}`
        uploadRepository.recordUpload({
          businessType: 'avatar',
          businessId: fileName,
          originalFilename: finalName,
          storedPath: avatarPath,
          mimeType,
          sizeBytes: buffer.byteLength,
          sha256: createHash('sha256').update(buffer).digest('hex')
        })
      }
    } catch (error) {
      auditLog('upload_failed', 'anonymous', { businessType: 'avatar', reason: 'unexpected_error', error: error instanceof Error ? error.message : String(error) })
    }
  }
  return avatarPath
}
