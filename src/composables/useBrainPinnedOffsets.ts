import type { Character } from '../types'
import type { CharacterBrainNodeOffset } from '../types/characterBrain'
import { readCharacterBrainTrajectoryMeta } from '../app/characterBrain'

export type BrainPinnedOffsetMap = Record<string, CharacterBrainNodeOffset>

const TRACE_ROOT_NODE_ID = 'brain:trajectory'
const TRACE_NODE_ID_PREFIX = 'brain:trajectory:node:'
const MAX_TRAJECTORY_PINNED_OFFSET_ABS = 6000

export function isTrajectoryViewNodeId(nodeId: string) {
  const normalizedId = String(nodeId || '').trim()
  return normalizedId === TRACE_ROOT_NODE_ID
    || normalizedId.startsWith(TRACE_NODE_ID_PREFIX)
}

export function isPersistableTrajectoryOffsetNodeId(nodeId: string) {
  const normalizedId = String(nodeId || '').trim()
  return normalizedId === TRACE_ROOT_NODE_ID || normalizedId.startsWith(TRACE_NODE_ID_PREFIX)
}

export function normalizeNodeOffsetMap(raw: unknown): BrainPinnedOffsetMap {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const offsets: BrainPinnedOffsetMap = {}
  Object.entries(raw as Record<string, unknown>).forEach(([nodeId, value]) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return
    const x = Number((value as Record<string, unknown>).x)
    const y = Number((value as Record<string, unknown>).y)
    const normalizedId = String(nodeId || '').trim()
    if (!normalizedId || !Number.isFinite(x) || !Number.isFinite(y)) return
    if (
      isTrajectoryViewNodeId(normalizedId)
      && (Math.abs(x) > MAX_TRAJECTORY_PINNED_OFFSET_ABS || Math.abs(y) > MAX_TRAJECTORY_PINNED_OFFSET_ABS)
    ) {
      return
    }
    offsets[normalizedId] = { x, y }
  })
  return offsets
}

export function readCharacterBrainPinnedOffsets(character?: Character | null): BrainPinnedOffsetMap {
  if (!character) return {}
  const rawPinnedOffsets = character.brainPinnedOffsets ?? character.brain_pinned_offsets
  const characterOffsets = typeof rawPinnedOffsets === 'string'
    ? normalizeNodeOffsetMap(parseJsonObject(rawPinnedOffsets))
    : normalizeNodeOffsetMap(rawPinnedOffsets)
  const trajectoryOffsets = normalizeNodeOffsetMap(readCharacterBrainTrajectoryMeta(character).viewOffsets)
  return {
    ...characterOffsets,
    ...trajectoryOffsets
  }
}

function parseJsonObject(raw: string) {
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}
