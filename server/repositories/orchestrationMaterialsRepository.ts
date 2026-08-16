import db from '../db.js'
import { toCamel } from '../application/shared/dbUtils.js'

type MaterialsDb = Pick<typeof db, 'prepare' | 'exec'>
type Row = Record<string, any>

export function createOrchestrationMaterialsRepository(database: MaterialsDb = db) {
  const insertOverride = (row: Row) => database.prepare(`
    INSERT INTO chat_session_narrative_overrides
      (id, session_id, world_id, content, version, source, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(row.id, row.sessionId, row.worldId, row.content, row.version, row.source, row.createdAt, row.updatedAt)

  const insertState = (row: Row) => database.prepare(`
    INSERT INTO chat_session_orchestration_state
      (id, session_id, world_id, scenario_code, scenario_label, scenario_summary,
       anchor_message_id, source_artifact_id, version, source, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    row.id, row.sessionId, row.worldId, row.scenarioCode, row.scenarioLabel, row.scenarioSummary,
    row.anchorMessageId, row.sourceArtifactId, row.version, row.source, row.createdAt, row.updatedAt
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
      return toCamel(database.prepare(`
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
          source_artifact_id = ?, version = version + 1, source = ?, updated_at = ?
        WHERE id = ? AND session_id = ? AND world_id = ? AND version = ?
      `).run(
        row.scenarioCode, row.scenarioLabel, row.scenarioSummary, row.anchorMessageId,
        row.sourceArtifactId, row.source, row.updatedAt, row.id, row.sessionId, row.worldId, expectedVersion
      ).changes
    },
    getAllOverrides() {
      return database.prepare('SELECT * FROM chat_session_narrative_overrides ORDER BY session_id, world_id').all().map(toCamel)
    },
    getAllStates() {
      return database.prepare('SELECT * FROM chat_session_orchestration_state ORDER BY session_id, world_id').all().map(toCamel)
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
