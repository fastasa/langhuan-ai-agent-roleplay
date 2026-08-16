/**
 * 审计日志中间件
 * 记录敏感操作到日志文件
 */
import type { Request, Response, NextFunction } from 'express'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { fileURLToPath } from 'url'
import { LOCAL_WORKSPACE_USER_ID } from '../localWorkspace.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const LOG_DIR = path.join(__dirname, '../logs')

// 确保日志目录存在
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true })
}

const AUDIT_LOG_FILE = path.join(LOG_DIR, 'audit.log')

/**
 * 审计日志条目类型
 */
interface AuditLogEntry {
  auditId: string
  timestamp: string
  action: string
  userId: string
  method?: string
  path?: string
  status?: number
  userAgent?: string
  [key: string]: unknown
}

function createAuditId() {
  return `audit_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`
}

const SENSITIVE_KEY_PATTERN = /(password|passwd|token|api[_-]?key|secret|cookie|authorization|finalprompt|prompt|message|content)/i
const MAX_AUDIT_STRING_LENGTH = 500
const MAX_AUDIT_ARRAY_LENGTH = 20
const MAX_AUDIT_DEPTH = 6

export function sanitizeAuditValue(value: unknown, key = '', depth = 0): unknown {
  if (SENSITIVE_KEY_PATTERN.test(key)) return '[redacted]'
  if (value === null || value === undefined) return value
  if (typeof value === 'string') {
    return value.length > MAX_AUDIT_STRING_LENGTH
      ? `${value.slice(0, MAX_AUDIT_STRING_LENGTH)}...[truncated]`
      : value
  }
  if (typeof value !== 'object') return value
  if (depth >= MAX_AUDIT_DEPTH) return '[truncated]'
  if (Array.isArray(value)) {
    return value.slice(0, MAX_AUDIT_ARRAY_LENGTH).map((item) => sanitizeAuditValue(item, key, depth + 1))
  }
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([childKey, childValue]) => (
    [childKey, sanitizeAuditValue(childValue, childKey, depth + 1)]
  )))
}

function sanitizeDetails(details: Record<string, unknown>) {
  return sanitizeAuditValue(details) as Record<string, unknown>
}

/**
 * 记录审计日志
 * @param action - 操作类型
 * @param userId - 用户标识
 * @param details - 详细信息
 */
export function auditLog(action: string, userId = 'anonymous', details: Record<string, unknown> = {}) {
  const auditId = createAuditId()
  const logEntry: AuditLogEntry = {
    auditId,
    timestamp: new Date().toISOString(),
    action,
    userId,
    ...sanitizeDetails(details)
  }
  fs.appendFileSync(AUDIT_LOG_FILE, JSON.stringify(logEntry) + '\n')
  return auditId
}

export function readAuditMetrics(limit = 2000) {
  if (!fs.existsSync(AUDIT_LOG_FILE)) {
    return {
      total: 0,
      uploadFailures: 0,
      serverErrors: 0,
      recent: [] as AuditLogEntry[]
    }
  }
  const lines = fs.readFileSync(AUDIT_LOG_FILE, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .slice(-Math.max(1, Math.min(Number(limit) || 2000, 5000)))
  const entries = lines.map((line) => {
    try {
      return JSON.parse(line) as AuditLogEntry
    } catch {
      return null
    }
  }).filter(Boolean) as AuditLogEntry[]
  return {
    total: entries.length,
    uploadFailures: entries.filter((entry) => entry.action === 'upload_failed').length,
    serverErrors: entries.filter((entry) => Number(entry.status || 0) >= 500).length,
    recent: entries.slice(-20).reverse()
  }
}

/**
 * Express 请求类型扩展
 */
/**
 * 审计日志中间件工厂
 * @param action - 操作名称
 */
export function auditMiddleware(action: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    // 请求结束后记录日志
    const originalSend = res.send
    res.send = function (data: unknown): Response {
      // 只记录非 GET 请求和关键操作
      if (req.method !== 'GET' && action) {
        const statusCode = res.statusCode
        const auditId = auditLog(action, LOCAL_WORKSPACE_USER_ID, {
          method: req.method,
          path: req.originalUrl || req.path,
          status: statusCode,
          errorSummary: statusCode >= 500 ? 'server_error' : undefined
        })
        res.setHeader('X-Audit-Id', auditId)
      }
      return originalSend.call(this, data)
    }
    next()
  }
}
