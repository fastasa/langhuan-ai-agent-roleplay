import db from '../db.js'
import { toCamel } from '../application/shared/dbUtils.js'
import type { CharacterSnapshotState } from '../../shared/characterSnapshotState.js'

type SnapshotDb = Pick<typeof db, 'prepare' | 'exec' | '_save'>
type Row = Record<string, any>

export const CHARACTER_AUTOMATIC_SNAPSHOT_LIMIT = 20

export interface CharacterSnapshotInsert {
  id: string
  characterId: string
  label: string
  snapshotKind: 'manual' | 'automatic'
  sourceSessionId?: string
  sourceSnapshotId?: string
  payloadFormat: string
  payloadGzip: Buffer | Uint8Array
  personalityModelVersionId?: string
  createdAt: string
  updatedAt: string
}

export interface SessionCharacterBranchInsert {
  id: string
  sessionId: string
  participantId: string
  characterId: string
  sourceSnapshotId?: string
  payloadFormat: string
  payloadGzip: Buffer | Uint8Array
  createdAt: string
  updatedAt: string
}

function asRecord(row: Row | null | undefined) {
  return row ? toCamel(row) as Row : null
}

const STATE_COLUMN_MAP: Record<keyof CharacterSnapshotState, string> = {
  gender: 'gender', age: 'age', desc: '"desc"', appearance: 'appearance', outfit: 'outfit',
  personality: 'personality', hobbies: 'hobbies', abilities: 'abilities', experience: 'experience',
  worldview: 'worldview', background: 'background', speakingStyle: 'speaking_style', schedule: 'schedule',
  yearlySchedule: 'yearly_schedule', currentActivities: 'current_activities', relationships: 'relationships',
  brainLinks: 'brain_links', brainDocuments: 'brain_documents', brainCognitionNodes: 'brain_cognition_nodes',
  brainTraceNodes: 'brain_trace_nodes', brainTrajectoryMeta: 'brain_trajectory_meta',
  brainPinnedOffsets: 'brain_pinned_offsets', brainNodePositions: 'brain_node_positions',
  brainCandidateChanges: 'brain_candidate_changes', personalityKernel: 'personality_kernel',
  affection: 'affection', locations: 'locations'
}

const JSON_STATE_FIELDS = new Set<keyof CharacterSnapshotState>([
  'schedule', 'yearlySchedule', 'currentActivities', 'relationships', 'brainLinks', 'brainDocuments',
  'brainCognitionNodes', 'brainTraceNodes', 'brainTrajectoryMeta', 'brainPinnedOffsets',
  'brainNodePositions', 'brainCandidateChanges', 'locations'
])

function stateDbValue(field: keyof CharacterSnapshotState, value: unknown): unknown {
  if (JSON_STATE_FIELDS.has(field)) return typeof value === 'string' ? value : JSON.stringify(value ?? (field === 'locations' ? [] : {}))
  if (field === 'personalityKernel' && value && typeof value === 'object') return JSON.stringify(value)
  if (field === 'affection') return Number.isFinite(Number(value)) ? Math.trunc(Number(value)) : 50
  return String(value ?? '')
}

export function createCharacterSnapshotRepository(database: SnapshotDb = db) {
  const persist = () => database._save?.()

  const countBranchReferences = (snapshotId: string) => {
    const row = database.prepare(`
      SELECT COUNT(*) AS count
      FROM chat_session_character_branches
      WHERE source_snapshot_id = ?
    `).get(snapshotId) as Row | undefined
    return Number(row?.count || 0)
  }

  const deleteSnapshotIfUnreferenced = (characterId: string, snapshotId: string) => {
    if (countBranchReferences(snapshotId) > 0) return false
    const result = database.prepare(`
      DELETE FROM character_snapshots
      WHERE character_id = ? AND id = ?
    `).run(characterId, snapshotId)
    return Number(result.changes || 0) > 0
  }

  const pruneAutomaticSnapshots = (characterId: string, keepCount: number) => {
    const normalizedKeepCount = Math.max(0, Math.min(CHARACTER_AUTOMATIC_SNAPSHOT_LIMIT, Math.trunc(keepCount)))
    const rows = database.prepare(`
      SELECT id
      FROM character_snapshots
      WHERE character_id = ? AND snapshot_kind = 'automatic'
      ORDER BY datetime(created_at) ASC, id ASC
    `).all(characterId) as Row[]
    const deletedIds: string[] = []
    const protectedIds: string[] = []
    let remaining = rows.length
    for (const row of rows) {
      if (remaining <= normalizedKeepCount) break
      const snapshotId = String(row.id || '')
      if (deleteSnapshotIfUnreferenced(characterId, snapshotId)) {
        deletedIds.push(snapshotId)
        remaining -= 1
      } else {
        protectedIds.push(snapshotId)
      }
    }
    return { deletedIds, protectedIds, remaining, keepCount: normalizedKeepCount }
  }

  const getSnapshot = (characterId: string, snapshotId: string) => asRecord(database.prepare(`
    SELECT *
    FROM character_snapshots
    WHERE character_id = ? AND id = ?
    LIMIT 1
  `).get(characterId, snapshotId) as Row | null)

  return {
    getAllSnapshots() {
      return (database.prepare(`
        SELECT * FROM character_snapshots
        ORDER BY datetime(created_at) ASC, id ASC
      `).all() as Row[]).map((row) => asRecord(row))
    },

    getAllBranches() {
      return (database.prepare(`
        SELECT * FROM chat_session_character_branches
        ORDER BY datetime(created_at) ASC, id ASC
      `).all() as Row[]).map((row) => asRecord(row))
    },

    replaceAllSnapshots(rows: CharacterSnapshotInsert[]) {
      database.prepare('DELETE FROM character_snapshots').run()
      const insert = database.prepare(`
        INSERT INTO character_snapshots (
          id, character_id, label, snapshot_kind, source_session_id, source_snapshot_id,
          payload_format, payload_gzip, personality_model_version_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      for (const row of rows) {
        insert.run(
          row.id, row.characterId, row.label, row.snapshotKind, row.sourceSessionId || '',
          row.sourceSnapshotId || '', row.payloadFormat, row.payloadGzip,
          row.personalityModelVersionId || '', row.createdAt, row.updatedAt
        )
      }
      persist()
    },

    replaceAllBranches(rows: SessionCharacterBranchInsert[]) {
      database.prepare('DELETE FROM chat_session_character_branches').run()
      const insert = database.prepare(`
        INSERT INTO chat_session_character_branches (
          id, session_id, participant_id, character_id, source_snapshot_id,
          payload_format, payload_gzip, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      for (const row of rows) {
        insert.run(
          row.id, row.sessionId, row.participantId, row.characterId, row.sourceSnapshotId || '',
          row.payloadFormat, row.payloadGzip, row.createdAt, row.updatedAt
        )
      }
      persist()
    },

    listSnapshots(characterId: string) {
      return (database.prepare(`
        SELECT
          id, character_id, label, snapshot_kind, source_session_id, source_snapshot_id,
          payload_format, personality_model_version_id, created_at, updated_at,
          length(payload_gzip) AS payload_size_bytes
        FROM character_snapshots
        WHERE character_id = ?
        ORDER BY datetime(created_at) DESC, id DESC
      `).all(characterId) as Row[]).map((row) => ({
        ...asRecord(row),
        activeBranchCount: countBranchReferences(String(row.id || ''))
      }))
    },

    getSnapshot(characterId: string, snapshotId: string) {
      return getSnapshot(characterId, snapshotId)
    },

    insertSnapshot(input: CharacterSnapshotInsert) {
      database.exec('BEGIN')
      try {
        let cleanup = { deletedIds: [] as string[], protectedIds: [] as string[], remaining: 0, keepCount: CHARACTER_AUTOMATIC_SNAPSHOT_LIMIT }
        if (input.snapshotKind === 'automatic') {
          cleanup = pruneAutomaticSnapshots(input.characterId, CHARACTER_AUTOMATIC_SNAPSHOT_LIMIT - 1)
          if (cleanup.remaining >= CHARACTER_AUTOMATIC_SNAPSHOT_LIMIT) {
            throw new Error('自动快照已达 20 份，且全部受活会话保护；请结束相关会话分支后再覆盖主真值')
          }
        }
        database.prepare(`
          INSERT INTO character_snapshots (
            id, character_id, label, snapshot_kind, source_session_id, source_snapshot_id,
            payload_format, payload_gzip, personality_model_version_id, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          input.id,
          input.characterId,
          input.label,
          input.snapshotKind,
          input.sourceSessionId || '',
          input.sourceSnapshotId || '',
          input.payloadFormat,
          input.payloadGzip,
          input.personalityModelVersionId || '',
          input.createdAt,
          input.updatedAt
        )
        database.exec('COMMIT')
        persist()
        return { snapshot: getSnapshot(input.characterId, input.id), cleanup }
      } catch (error) {
        database.exec('ROLLBACK')
        throw error
      }
    },

    deleteSnapshot(characterId: string, snapshotId: string) {
      if (countBranchReferences(snapshotId) > 0) {
        throw new Error('该快照正被活会话分支引用，不能删除')
      }
      const deleted = deleteSnapshotIfUnreferenced(characterId, snapshotId)
      if (deleted) persist()
      return deleted
    },

    cleanupAutomaticSnapshots(characterId: string, keepCount = CHARACTER_AUTOMATIC_SNAPSHOT_LIMIT) {
      database.exec('BEGIN')
      try {
        const result = pruneAutomaticSnapshots(characterId, keepCount)
        database.exec('COMMIT')
        if (result.deletedIds.length) persist()
        return result
      } catch (error) {
        database.exec('ROLLBACK')
        throw error
      }
    },

    countSnapshotBranchReferences(snapshotId: string) {
      return countBranchReferences(snapshotId)
    },

    getBranchById(branchId: string) {
      return asRecord(database.prepare(`
        SELECT * FROM chat_session_character_branches WHERE id = ? LIMIT 1
      `).get(branchId) as Row | null)
    },

    getBranchByParticipant(participantId: string) {
      return asRecord(database.prepare(`
        SELECT * FROM chat_session_character_branches WHERE participant_id = ? LIMIT 1
      `).get(participantId) as Row | null)
    },

    getBranchForSessionCharacter(sessionId: string, characterId: string) {
      return asRecord(database.prepare(`
        SELECT *
        FROM chat_session_character_branches
        WHERE session_id = ? AND character_id = ?
        ORDER BY datetime(updated_at) DESC, id DESC
        LIMIT 1
      `).get(sessionId, characterId) as Row | null)
    },

    listBranchesBySession(sessionId: string) {
      return (database.prepare(`
        SELECT * FROM chat_session_character_branches
        WHERE session_id = ?
        ORDER BY datetime(created_at) ASC, id ASC
      `).all(sessionId) as Row[]).map((row) => asRecord(row))
    },

    insertBranch(input: SessionCharacterBranchInsert) {
      database.prepare(`
        INSERT INTO chat_session_character_branches (
          id, session_id, participant_id, character_id, source_snapshot_id,
          payload_format, payload_gzip, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        input.id,
        input.sessionId,
        input.participantId,
        input.characterId,
        input.sourceSnapshotId || '',
        input.payloadFormat,
        input.payloadGzip,
        input.createdAt,
        input.updatedAt
      )
      persist()
      return this.getBranchById(input.id)
    },

    updateBranchPayload(branchId: string, payloadFormat: string, payloadGzip: Buffer | Uint8Array, updatedAt: string) {
      const result = database.prepare(`
        UPDATE chat_session_character_branches
        SET payload_format = ?, payload_gzip = ?, updated_at = ?
        WHERE id = ?
      `).run(payloadFormat, payloadGzip, updatedAt, branchId)
      if (Number(result.changes || 0) > 0) persist()
      return Number(result.changes || 0) > 0
    },

    deleteBranchByParticipant(participantId: string) {
      const result = database.prepare('DELETE FROM chat_session_character_branches WHERE participant_id = ?').run(participantId)
      if (Number(result.changes || 0) > 0) persist()
      return Number(result.changes || 0)
    },

    deleteBranchesBySession(sessionId: string) {
      const result = database.prepare('DELETE FROM chat_session_character_branches WHERE session_id = ?').run(sessionId)
      if (Number(result.changes || 0) > 0) persist()
      return Number(result.changes || 0)
    },

    clearSnapshotSourceSession(sessionId: string) {
      const result = database.prepare(`
        UPDATE character_snapshots SET source_session_id = '', updated_at = datetime('now')
        WHERE source_session_id = ?
      `).run(sessionId)
      if (Number(result.changes || 0) > 0) persist()
      return Number(result.changes || 0)
    },

    listCharacterStateBlockers(characterId: string) {
      const generationAttempts = database.prepare(`
        SELECT DISTINCT ga.id, ga.session_id, ga.status, ga.target_id
        FROM chat_generation_attempts ga
        WHERE ga.status = 'running'
          AND (
            ga.target_id = ?
            OR ga.session_id IN (
              SELECT session_id FROM chat_session_participants
              WHERE participant_type = 'char' AND participant_target_id = ?
            )
          )
        ORDER BY datetime(ga.updated_at) ASC, ga.id ASC
      `).all(characterId, characterId) as Row[]
      const projectionWritebacks = database.prepare(`
        SELECT id, session_id, status, character_id
        FROM chat_projection_writeback_runs
        WHERE character_id = ? AND status = 'running'
        ORDER BY datetime(updated_at) ASC, id ASC
      `).all(characterId) as Row[]
      return {
        generationAttempts: generationAttempts.map((row) => asRecord(row)),
        projectionWritebacks: projectionWritebacks.map((row) => asRecord(row))
      }
    },

    overwriteCharacterMain(input: {
      characterId: string
      targetState: CharacterSnapshotState
      targetPersonalityModelVersionId: string
      protectionSnapshot: CharacterSnapshotInsert
    }) {
      database.exec('BEGIN')
      try {
        const blockers = this.listCharacterStateBlockers(input.characterId)
        if (blockers.generationAttempts.length || blockers.projectionWritebacks.length) {
          throw new Error('角色仍有活跃生成或投影写回，暂不能覆盖主真值')
        }
        const cleanup = pruneAutomaticSnapshots(input.characterId, CHARACTER_AUTOMATIC_SNAPSHOT_LIMIT - 1)
        if (cleanup.remaining >= CHARACTER_AUTOMATIC_SNAPSHOT_LIMIT) {
          throw new Error('自动快照已达 20 份，且全部受活会话保护；请结束相关会话分支后再覆盖主真值')
        }
        const protection = input.protectionSnapshot
        database.prepare(`
          INSERT INTO character_snapshots (
            id, character_id, label, snapshot_kind, source_session_id, source_snapshot_id,
            payload_format, payload_gzip, personality_model_version_id, created_at, updated_at
          ) VALUES (?, ?, ?, 'automatic', ?, ?, ?, ?, ?, ?, ?)
        `).run(
          protection.id, protection.characterId, protection.label,
          protection.sourceSessionId || '', protection.sourceSnapshotId || '', protection.payloadFormat,
          protection.payloadGzip, protection.personalityModelVersionId || '', protection.createdAt, protection.updatedAt
        )

        const stateEntries = Object.entries(input.targetState)
          .filter(([field]) => Object.prototype.hasOwnProperty.call(STATE_COLUMN_MAP, field)) as Array<[keyof CharacterSnapshotState, unknown]>
        if (!stateEntries.length) throw new Error('目标快照不含可覆盖的角色状态')
        const assignments = stateEntries.map(([field]) => `${STATE_COLUMN_MAP[field]} = ?`)
        const values = stateEntries.map(([field, value]) => stateDbValue(field, value))
        const updateResult = database.prepare(`UPDATE characters SET ${assignments.join(', ')} WHERE id = ?`)
          .run(...values, input.characterId)
        if (Number(updateResult.changes || 0) !== 1) throw new Error('角色主真值覆盖失败')

        const versionId = String(input.targetPersonalityModelVersionId || '').trim()
        const version = versionId
          ? database.prepare(`
              SELECT version_id, model_path FROM personality_model_versions
              WHERE character_id = ? AND version_id = ? LIMIT 1
            `).get(input.characterId, versionId) as Row | undefined
          : undefined
        const modelPath = String(version?.model_path || '').trim()
        database.prepare(`
          UPDATE personality_model_versions
          SET status = CASE WHEN status = 'installed' THEN 'ready' ELSE status END,
              installed_at = CASE WHEN status = 'installed' THEN '' ELSE installed_at END
          WHERE character_id = ?
        `).run(input.characterId)
        if (version && modelPath) {
          database.prepare(`
            UPDATE personality_model_versions
            SET status = 'installed', installed_at = ?, archived_at = ''
            WHERE character_id = ? AND version_id = ?
          `).run(input.protectionSnapshot.updatedAt, input.characterId, versionId)
        }
        database.prepare('UPDATE characters SET personality_model_path = ? WHERE id = ?').run(modelPath, input.characterId)
        database.exec('COMMIT')
        persist()
        return {
          protectionSnapshot: getSnapshot(input.characterId, protection.id),
          cleanup,
          personalityModelVersionId: version && modelPath ? versionId : '',
          personalityModelPath: modelPath,
          degradedToNormalRecall: Boolean(versionId && (!version || !modelPath))
        }
      } catch (error) {
        database.exec('ROLLBACK')
        throw error
      }
    }
  }
}

export const characterSnapshotRepository = createCharacterSnapshotRepository()
