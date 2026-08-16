import express from 'express'
import type { NextFunction, Request, Response } from 'express'

export const SMALL_JSON_BODY_LIMIT = '256kb'
export const DEFAULT_JSON_BODY_LIMIT = SMALL_JSON_BODY_LIMIT
export const LARGE_JSON_BODY_LIMIT = '50mb'
// 中档：目前只服务聊天图片上传（data URI JSON body）。图片 base64 编码后体积膨胀约 1.33 倍，
// 单图上限 8MB + JSON 包装留冗余到 15mb；不复用 50mb 大档——避免让单图上传接口也被
// importByteBudgetGate 的「每日大导入字节预算」限流（该网关只在命中 LARGE_JSON_BODY_ROUTES 时生效），
// 语义上聊天图片上传不是「批量导入」。
export const MEDIUM_JSON_BODY_LIMIT = '15mb'

const LARGE_JSON_BODY_ROUTES = [
  /^\/api\/data\/restore(?:\/partitions)?$/,
  /^\/api\/data\/chat-archives\/import$/,
  /^\/api\/data\/doc-library(?:\/.*)?$/,
  /^\/api\/data\/prompt-presets\/replace$/,
  /^\/api\/data\/brain-neurons$/,
  /^\/api\/data\/(?:characters|character-groups|groups|crowds|aliases)(?:\/[^/]+)?$/,
  /^\/api\/data\/user-profile$/
]

const MEDIUM_JSON_BODY_ROUTES = [
  /^\/api\/data\/chat-images$/,
  /^\/api\/data\/chat-sessions\/[^/]+\/status-assets$/,
  // 人格问卷保存是完整快照写入。达到数百题后合法 JSON 会稳定超过普通 256kb；
  // 单独进入 15mb 中档，不扩大所有角色接口，也不误套 50mb 批量导入预算。
  /^\/api\/data\/characters\/[^/]+\/personality-training\/datasets\/[^/]+\/questionnaire$/
]

function normalizePath(input: string) {
  const path = String(input || '').split('?')[0] || '/'
  return path.replace(/\/+$/, '') || '/'
}

export function shouldUseLargeJsonBodyLimit(req: Pick<Request, 'method' | 'path' | 'originalUrl'>) {
  const method = String(req.method || '').toUpperCase()
  if (!['POST', 'PUT', 'PATCH'].includes(method)) return false
  const path = normalizePath(String(req.originalUrl || req.path || ''))
  return LARGE_JSON_BODY_ROUTES.some((pattern) => pattern.test(path))
}

export function shouldUseMediumJsonBodyLimit(req: Pick<Request, 'method' | 'path' | 'originalUrl'>) {
  const method = String(req.method || '').toUpperCase()
  if (!['POST', 'PUT', 'PATCH'].includes(method)) return false
  const path = normalizePath(String(req.originalUrl || req.path || ''))
  return MEDIUM_JSON_BODY_ROUTES.some((pattern) => pattern.test(path))
}

export function createJsonBodyParser() {
  const defaultParser = express.json({ limit: SMALL_JSON_BODY_LIMIT })
  const mediumParser = express.json({ limit: MEDIUM_JSON_BODY_LIMIT })
  const largeParser = express.json({ limit: LARGE_JSON_BODY_LIMIT })

  return (req: Request, res: Response, next: NextFunction) => {
    const parser = shouldUseLargeJsonBodyLimit(req)
      ? largeParser
      : shouldUseMediumJsonBodyLimit(req)
        ? mediumParser
        : defaultParser
    parser(req, res, next)
  }
}

export function createSmallJsonBodyParser() {
  return express.json({ limit: SMALL_JSON_BODY_LIMIT })
}

export function createLargeJsonBodyParser() {
  return express.json({ limit: LARGE_JSON_BODY_LIMIT })
}

type JsonBodyParserError = Error & {
  status?: number
  statusCode?: number
  type?: string
}

export function handleJsonBodyParserError(
  err: JsonBodyParserError,
  _req: Request,
  res: Response,
  next: NextFunction
) {
  if (err?.type === 'entity.too.large' || err?.status === 413 || err?.statusCode === 413) {
    res.status(413).json({ error: '请求体过大，请使用对应的大文件导入入口或缩小内容后重试' })
    return
  }
  if (err instanceof SyntaxError && err?.type === 'entity.parse.failed') {
    res.status(400).json({ error: 'JSON 格式不合法' })
    return
  }
  next(err)
}
