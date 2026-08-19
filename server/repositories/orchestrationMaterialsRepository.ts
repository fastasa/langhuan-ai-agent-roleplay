import db from '../db.js'
import { toCamel } from '../application/shared/dbUtils.js'

type MaterialsDb = Pick<typeof db, 'prepare' | 'exec'>
type Row = Record<string, any>

function serializeDependencySnapshot(value: unknown): string {
  if (typeof value === 'string') return value.trim() || '{}'
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    try { return JSON.stringify(value) } catch { return '{}' }
  }
  return '{}'
}

function toStateRow(row: Row | null): Row | null {
  if (!row) return null
  const state = toCamel(row) as Row
  const dependencySnapshotJson = serializeDependencySnapshot(row.dependency_snapshot_json)
  let dependencySnapshot: Record<string, unknown> | undefined
  try {
    const parsed = JSON.parse(dependencySnapshotJson)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) dependencySnapshot = parsed
  } catch {
    /* 坏旧值保留原文，调用侧安全降级 unknown。 */
  }
  return {
    ...state,
    dependencySnapshotJson,
    ...(dependencySnapshot ? { dependencySnapshot } : {})
  }
}

export function createOrchestrationMaterialsRepository(database: MaterialsDb = db) {
  const insertOverride = (row: Row) => database.prepare(`
    INSERT INTO chat_session_narrative_overrides
      (id, session_id, world_id, content, version, source, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(row.id, row.sessionId, row.worldId, row.content, row.version, row.source, row.createdAt, row.updatedAt)

  const insertState = (row: Row) => database.prepare(`
    INSERT INTO chat_session_orchestration_state
      (id, session_id, world_id, scenario_code, scenario_label, scenario_summary,
       anchor_message_id, source_artifact_id, dependency_snapshot_json, version, source, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    row.id, row.sessionId, row.worldId, row.scenarioCode, row.scenarioLabel, row.scenarioSummary,
    row.anchorMessageId, row.sourceArtifactId, serializeDependencySnapshot(row.dependencySnapshotJson ?? row.dependencySnapshot), row.version, row.source, row.createdAt, row.updatedAt
  )

  return {
    findSessionById(sessionId: string) {
      return toCamel(database.prepare('SELECT * FROM chat_sessions WHERE id = ?').get(sessionId) as Row | null)
    },
    findOverride(sessionId: string, worldId: string) {
      return toCamel(database.prepare(`
        SELECT * FROM chat_session_narrative_overrides WHERE session_id = ? AND world_id = ?
      `).get(sessionId, worldId) as Row | null)
    },
    findState(sessionId: string, worldId: string) {
      return toStateRow(database.prepare(`
        SELECT * FROM chat_session_orchestration_state WHERE session_id = ? AND world_id = ?
      `).get(sessionId, worldId) as Row | null)
    },
    insertOverride,
    updateOverride(row: Row, expectedVersion: number) {
      return database.prepare(`
        UPDATE chat_session_narrative_overrides
        SET content = ?, version = version + 1, source = ?, updated_at = ?
        WHERE id = ? AND session_id = ? AND world_id = ? AND version = ?
      `).run(row.content, row.source, row.updatedAt, row.id, row.sessionId, row.worldId, expectedVersion).changes
    },
    deleteOverride(sessionId: string, worldId: string, expectedVersion: number) {
      return database.prepare(`
        DELETE FROM chat_session_narrative_overrides
        WHERE session_id = ? AND world_id = ? AND version = ?
      `).run(sessionId, worldId, expectedVersion).changes
    },
    insertState,
    updateState(row: Row, expectedVersion: number) {
      return database.prepare(`
        UPDATE chat_session_orchestration_state SET
          scenario_code = ?, scenario_label = ?, scenario_summary = ?, anchor_message_id = ?,
          source_artifact_id = ?, dependency_snapshot_json = ?, version = version + 1, source = ?, updated_at = ?
        WHERE id = ? AND session_id = ? AND world_id = ? AND version = ?
      `).run(
        row.scenarioCode, row.scenarioLabel, row.scenarioSummary, row.anchorMessageId,
        row.sourceArtifactId, serializeDependencySnapshot(row.dependencySnapshotJson ?? row.dependencySnapshot), row.source, row.updatedAt, row.id, row.sessionId, row.worldId, expectedVersion
      ).changes
    },
    getAllOverrides() {
      return database.prepare('SELECT * FROM chat_session_narrative_overrides ORDER BY session_id, world_id').all().map(toCamel)
    },
    getAllStates() {
      return database.prepare('SELECT * FROM chat_session_orchestration_state ORDER BY session_id, world_id').all().map((row) => toStateRow(row as Row))
    },
    replaceAllOverrides(rows: Row[]) {
      database.prepare('DELETE FROM chat_session_narrative_overrides').run()
      rows.forEach(insertOverride)
    },
    replaceAllStates(rows: Row[]) {
      database.prepare('DELETE FROM chat_session_orchestration_state').run()
      rows.forEach(insertState)
    },
    deleteBySessionId(sessionId: string) {
      database.prepare('DELETE FROM chat_session_orchestration_state WHERE session_id = ?').run(sessionId)
      database.prepare('DELETE FROM chat_session_narrative_overrides WHERE session_id = ?').run(sessionId)
    }
  }
}

export const orchestrationMaterialsRepository = createOrchestrationMaterialsRepository()
