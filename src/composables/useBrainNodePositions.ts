import type { Character } from '../types'
import type { CharacterBrainNodePosition, CharacterBrainNodePositions } from '../types/characterBrain'

export type BrainNodePositionMap = CharacterBrainNodePositions

const MAX_WORLD_POSITION_ABS = 1000000

export function normalizeNodePositionMap(raw: unknown): BrainNodePositionMap {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const positions: BrainNodePositionMap = {}
  Object.entries(raw as Record<string, unknown>).forEach(([nodeId, value]) => {
    const normalizedId = String(nodeId || '').trim()
    const normalizedPosition = normalizeNodePosition(value)
    if (!normalizedId || !normalizedPosition) return
    positions[normalizedId] = normalizedPosition
  })
  return positions
}

export function readCharacterBrainNodePositions(character?: Character | null): BrainNodePositionMap {
  if (!character) return {}
  const raw = character.brainNodePositions ?? character.brain_node_positions
  return typeof raw === 'string'
    ? normalizeNodePositionMap(parseJsonObject(raw))
    : normalizeNodePositionMap(raw)
}

export function buildCharacterBrainNodePositionsChange(positions: BrainNodePositionMap) {
  const normalizedPositions = Object.fromEntries(
    Object.entries(normalizeNodePositionMap(positions)).map(([nodeId, position]) => [
      nodeId,
      { x: position.x, y: position.y, locked: true }
    ])
  )
  return {
    brainNodePositions: normalizedPositions,
    brain_node_positions: JSON.stringify(normalizedPositions),
    // 旧偏移字段只作为迁移输入，新运行时不再继续写入。
    brainPinnedOffsets: {},
    brain_pinned_offsets: '{}'
  }
}

function normalizeNodePosition(raw: unknown): CharacterBrainNodePosition | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const record = raw as Record<string, unknown>
  const x = Number(record.x)
  const y = Number(record.y)
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null
  if (Math.abs(x) > MAX_WORLD_POSITION_ABS || Math.abs(y) > MAX_WORLD_POSITION_ABS) return null
  return {
    x,
    y,
    ...(record.locked === true ? { locked: true } : {})
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
