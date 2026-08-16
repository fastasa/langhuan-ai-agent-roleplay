import type { NextFunction, Request, Response } from 'express'
import { shouldUseLargeJsonBodyLimit } from './jsonBodyLimits.js'
import { LOCAL_WORKSPACE_USER_ID } from '../localWorkspace.js'

export const DEFAULT_IMPORT_DAILY_BYTES_LIMIT = 500 * 1024 * 1024

type ImportByteBudgetGateOptions = {
  maxDailyBytes?: number
  now?: () => Date
}

type ImportByteUsage = {
  day: string
  bytes: number
}

function readLimit(value: unknown, fallback: number) {
  const parsed = Math.floor(Number(value))
  if (!Number.isFinite(parsed) || parsed < 0) return fallback
  return parsed
}

function dayKey(date: Date) {
  return date.toISOString().slice(0, 10)
}

function readContentLength(req: Request) {
  const raw = String(req.headers['content-length'] || '').trim()
  if (!raw) return 0
  const parsed = Math.floor(Number(raw))
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

export function createImportByteBudgetGate(options: ImportByteBudgetGateOptions = {}) {
  const maxDailyBytes = options.maxDailyBytes ?? readLimit(process.env.LANGHUAN_IMPORT_DAILY_BYTES_LIMIT, DEFAULT_IMPORT_DAILY_BYTES_LIMIT)
  const now = options.now || (() => new Date())
  const usageByUser = new Map<string, ImportByteUsage>()

  return function importByteBudgetGate(req: Request, res: Response, next: NextFunction) {
    if (maxDailyBytes <= 0 || !shouldUseLargeJsonBodyLimit(req)) {
      next()
      return
    }
    const userId = LOCAL_WORKSPACE_USER_ID
    const bytes = readContentLength(req)
    if (bytes <= 0) {
      next()
      return
    }

    const today = dayKey(now())
    const current = usageByUser.get(userId)
    const used = current?.day === today ? current.bytes : 0
    if (used + bytes > maxDailyBytes) {
      res.status(429).json({
        error: '当前本地工作区今日大导入数据量已达到上限，请明天再试',
        code: 'IMPORT_DAILY_BYTES_LIMIT',
        maxDailyBytes,
        usedBytes: used
      })
      return
    }
    usageByUser.set(userId, { day: today, bytes: used + bytes })
    next()
  }
}
