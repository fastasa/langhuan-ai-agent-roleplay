import LZString from 'lz-string'

export const RECALL_ACTIVITY_LOG_COMPRESSION_ENCODING = 'lz-string-base64-json-v1'
export const RECALL_ACTIVITY_LOG_COMPRESSION_THRESHOLD_BYTES = 96 * 1024

const ENVELOPE_TYPE = 'langhuan.recallActivityLog.compressed'

export interface EncodedRecallActivityLogEnvelope {
  __type: typeof ENVELOPE_TYPE
  encoding: typeof RECALL_ACTIVITY_LOG_COMPRESSION_ENCODING
  originalBytes: number
  compressedBytes: number
  originalChars: number
  checksum: string
  payload: string
}

export interface EncodeRecallActivityLogOptions {
  force?: boolean
  thresholdBytes?: number
}

function byteLength(text: string): number {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(text).length
  }
  return unescape(encodeURIComponent(text)).length
}

function stableChecksum(text: string): string {
  let hash = 2166136261
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

function parseJsonObject(text: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(text) as unknown
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {}
  } catch {
    return {}
  }
}

export function isEncodedRecallActivityLogEnvelope(value: unknown): value is EncodedRecallActivityLogEnvelope {
  const record = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
  return Boolean(
    record
    && record.__type === ENVELOPE_TYPE
    && record.encoding === RECALL_ACTIVITY_LOG_COMPRESSION_ENCODING
    && typeof record.payload === 'string'
  )
}

export function encodeRecallActivityLogForTransport(
  activity: Record<string, unknown>,
  options: EncodeRecallActivityLogOptions = {}
): Record<string, unknown> {
  if (!activity || typeof activity !== 'object' || Array.isArray(activity)) return {}
  if (isEncodedRecallActivityLogEnvelope(activity)) return activity as unknown as Record<string, unknown>

  const json = JSON.stringify(activity)
  const originalBytes = byteLength(json)
  const threshold = Math.max(0, Number(options.thresholdBytes ?? RECALL_ACTIVITY_LOG_COMPRESSION_THRESHOLD_BYTES) || 0)
  if (!options.force && originalBytes < threshold) return activity

  const payload = LZString.compressToBase64(json)
  if (!payload) return activity
  const compressedBytes = byteLength(JSON.stringify({ payload }))
  if (!options.force && compressedBytes >= originalBytes) return activity

  const envelope: EncodedRecallActivityLogEnvelope = {
    __type: ENVELOPE_TYPE,
    encoding: RECALL_ACTIVITY_LOG_COMPRESSION_ENCODING,
    originalBytes,
    compressedBytes,
    originalChars: json.length,
    checksum: stableChecksum(json),
    payload
  }
  return envelope as unknown as Record<string, unknown>
}

export function decodeRecallActivityLogValue(value: unknown): Record<string, unknown> {
  const record = typeof value === 'string'
    ? parseJsonObject(value)
    : value && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, unknown>
      : {}

  if (!isEncodedRecallActivityLogEnvelope(record)) return record

  const json = LZString.decompressFromBase64(record.payload)
  if (!json) return {}
  if (record.checksum && stableChecksum(json) !== record.checksum) return {}
  return parseJsonObject(json)
}

export function serializeRecallActivityLogForStorage(activity: Record<string, unknown>): string {
  return JSON.stringify(encodeRecallActivityLogForTransport(activity))
}

export function estimateJsonBytes(value: unknown): number {
  return byteLength(JSON.stringify(value))
}
