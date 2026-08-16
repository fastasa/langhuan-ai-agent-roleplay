import { normalizeDocument, validateDocument } from './model'
import { PixelDocument } from './types'

/** 序列化为 2 空格缩进的 JSON */
export function serializeDocument(doc: PixelDocument): string {
  return JSON.stringify(doc, null, 2)
}

/** 携带校验错误列表的解析异常 */
export class PixelDocumentParseError extends Error {
  errors: string[]
  constructor(errors: string[]) {
    super(`像素文档解析失败: ${errors.join('; ')}`)
    this.name = 'PixelDocumentParseError'
    this.errors = errors
  }
}

/** 解析 JSON 字符串为 PixelDocument；坏 JSON 或不合法文档均抛错 */
export function parseDocument(json: string): PixelDocument {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch (e) {
    throw new PixelDocumentParseError([`JSON 解析失败: ${(e as Error).message}`])
  }
  const errors = validateDocument(parsed)
  if (errors.length > 0) {
    throw new PixelDocumentParseError(errors)
  }
  return normalizeDocument(parsed)
}
