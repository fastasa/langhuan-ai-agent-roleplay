import { randomBytes } from 'crypto'
import db from '../db.js'
import { getActiveWorkspaceId } from '../localWorkspace.js'

type UploadDb = Pick<typeof db, 'prepare'>

type UploadRecordInput = {
  businessType: string
  businessId: string
  originalFilename: string
  storedPath: string
  mimeType: string
  sizeBytes: number
  sha256: string
}

function createUploadId() {
  return `upload_${randomBytes(12).toString('hex')}`
}

/**
 * 本地文件登记表只承担静态文件可达性校验，不记录账号、审核人或远程审查状态。
 * 各写入入口在落盘前自行完成大小、扩展名、magic bytes 与路径边界校验。
 */
export function createUploadRepository(database: UploadDb = db) {
  return {
    recordUpload(input: UploadRecordInput) {
      database.prepare(`
        /* unscoped */ INSERT INTO uploads (
          upload_id, workspace_id, business_type, business_id,
          original_filename, stored_path, mime_type, size_bytes, sha256, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        createUploadId(),
        getActiveWorkspaceId(),
        input.businessType,
        input.businessId,
        input.originalFilename,
        input.storedPath,
        input.mimeType,
        input.sizeBytes,
        input.sha256,
        new Date().toISOString()
      )
    },

    canServeStoredPath(storedPath: string) {
      const row = database.prepare(`
        /* unscoped */ SELECT upload_id FROM uploads
        WHERE workspace_id = ? AND stored_path = ?
        ORDER BY created_at DESC
        LIMIT 1
      `).get(getActiveWorkspaceId(), String(storedPath || '').replace(/^\/+/, '')) as Record<string, unknown> | undefined
      return Boolean(row?.upload_id)
    }
  }
}

export const uploadRepository = createUploadRepository()
