import { gunzipSync, gzipSync } from 'zlib'
import {
  CHARACTER_SNAPSHOT_STATE_FIELDS,
  pickCharacterSnapshotState,
  type CharacterSnapshotState,
  type CharacterSnapshotStateField
} from '../../../shared/characterSnapshotState.js'

export {
  CHARACTER_SNAPSHOT_STATE_FIELDS,
  pickCharacterSnapshotState,
  type CharacterSnapshotState,
  type CharacterSnapshotStateField
} from '../../../shared/characterSnapshotState.js'

export const CHARACTER_SNAPSHOT_FORMAT = 'character_snapshot_v1'
export const CHARACTER_SNAPSHOT_FORMAT_VERSION = 1

export interface CharacterSnapshotPayloadV1 {
  formatVersion: 1
  capturedAt: string
  personalityModelVersionId: string
  state: CharacterSnapshotState
}

export function createCharacterSnapshotPayload(input: {
  character: Record<string, unknown>
  personalityModelVersionId?: string
  capturedAt?: string
}): CharacterSnapshotPayloadV1 {
  return {
    formatVersion: CHARACTER_SNAPSHOT_FORMAT_VERSION,
    capturedAt: String(input.capturedAt || new Date().toISOString()),
    personalityModelVersionId: String(input.personalityModelVersionId || ''),
    state: pickCharacterSnapshotState(input.character)
  }
}

export function encodeCharacterSnapshotPayload(payload: CharacterSnapshotPayloadV1): Buffer {
  const normalized = normalizeCharacterSnapshotPayload(payload)
  return gzipSync(Buffer.from(JSON.stringify(normalized), 'utf8'), { level: 9 })
}

function toBuffer(value: unknown): Buffer {
  if (Buffer.isBuffer(value)) return value
  if (value instanceof Uint8Array) return Buffer.from(value)
  if (value instanceof ArrayBuffer) return Buffer.from(new Uint8Array(value))
  throw new Error('角色快照 payload 不是有效的二进制数据')
}

export function normalizeCharacterSnapshotPayload(value: unknown): CharacterSnapshotPayloadV1 {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('角色快照 payload 格式无效')
  }
  const source = value as Record<string, unknown>
  if (Number(source.formatVersion) !== CHARACTER_SNAPSHOT_FORMAT_VERSION) {
    throw new Error(`不支持的角色快照格式版本：${String(source.formatVersion ?? '')}`)
  }
  if (!source.state || typeof source.state !== 'object' || Array.isArray(source.state)) {
    throw new Error('角色快照缺少有效的 state')
  }
  return {
    formatVersion: CHARACTER_SNAPSHOT_FORMAT_VERSION,
    capturedAt: String(source.capturedAt || ''),
    personalityModelVersionId: String(source.personalityModelVersionId || ''),
    state: pickCharacterSnapshotState(source.state as Record<string, unknown>)
  }
}

export function decodeCharacterSnapshotPayload(value: unknown): CharacterSnapshotPayloadV1 {
  let parsed: unknown
  try {
    parsed = JSON.parse(gunzipSync(toBuffer(value)).toString('utf8'))
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('不支持的角色快照')) throw error
    throw new Error(`角色快照解压或解析失败：${error instanceof Error ? error.message : String(error)}`)
  }
  return normalizeCharacterSnapshotPayload(parsed)
}
