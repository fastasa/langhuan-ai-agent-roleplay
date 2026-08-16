import db from '../db.js'
import { toCamel } from '../application/shared/dbUtils.js'
import { runInSavepoint } from './sqliteSavepoint.js'

type PresenceDb = Pick<typeof db, 'prepare' | 'exec'>

export function createOrchestrationPresenceRepository(database: PresenceDb = db) {
  return {
    findSessionById(sessionId: string) {
      return toCamel(database.prepare('SELECT * FROM chat_sessions WHERE id = ?').get(sessionId) as Record<string, unknown> | null)
    },
    findParticipantById(sessionId: string, participantId: string) {
      return toCamel(database.prepare(`
        SELECT * FROM chat_session_participants
        WHERE session_id = ? AND id = ? AND participant_type = 'char'
      `).get(sessionId, participantId) as Record<string, unknown> | null)
    },
    listCharacterParticipants(sessionId: string) {
      return database.prepare(`
        SELECT * FROM chat_session_participants
        WHERE session_id = ? AND participant_type = 'char'
        ORDER BY display_order ASC, id ASC
      `).all(sessionId).map(toCamel)
    },
    findMapSheetById(sheetId: string) {
      return toCamel(database.prepare("SELECT * FROM chat_map_sheets WHERE id = ? AND status != 'deleted'").get(sheetId) as Record<string, unknown> | null)
    },
    findMapFeatureById(featureId: string) {
      return toCamel(database.prepare("SELECT * FROM chat_map_features WHERE id = ? AND status != 'deleted'").get(featureId) as Record<string, unknown> | null)
    },
    findPresence(sessionId: string, worldId: string, participantId: string) {
      return toCamel(database.prepare(`
        SELECT * FROM chat_session_character_presence
        WHERE session_id = ? AND world_id = ? AND participant_id = ?
      `).get(sessionId, worldId, participantId) as Record<string, unknown> | null)
    },
    listPresences(sessionId: string, worldId: string) {
      return database.prepare(`
        SELECT * FROM chat_session_character_presence
        WHERE session_id = ? AND world_id = ?
        ORDER BY updated_at ASC, id ASC
      `).all(sessionId, worldId).map(toCamel)
    },
    insertPresence(row: Record<string, any>) {
      database.prepare(`
        INSERT INTO chat_session_character_presence (
          id, session_id, world_id, participant_id, presence_state,
          location_text, map_sheet_id, map_feature_id, since_message_id,
          version, last_modified_source, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        row.id, row.sessionId, row.worldId, row.participantId, row.presenceState,
        row.locationText, row.mapSheetId, row.mapFeatureId, row.sinceMessageId,
        row.version, row.lastModifiedSource, row.createdAt, row.updatedAt
      )
    },
    updatePresenceOptimistic(row: Record<string, any>, expectedVersion: number) {
      return database.prepare(`
        UPDATE chat_session_character_presence SET
          presence_state = ?, location_text = ?, map_sheet_id = ?, map_feature_id = ?,
          since_message_id = ?, version = version + 1, last_modified_source = ?, updated_at = ?
        WHERE session_id = ? AND world_id = ? AND participant_id = ? AND version = ?
      `).run(
        row.presenceState, row.locationText, row.mapSheetId, row.mapFeatureId,
        row.sinceMessageId, row.lastModifiedSource, row.updatedAt,
        row.sessionId, row.worldId, row.participantId, expectedVersion
      ).changes
    },
    findEventById(eventId: string) {
      return toCamel(database.prepare('SELECT * FROM chat_session_character_presence_events WHERE id = ?').get(eventId) as Record<string, unknown> | null)
    },
    findEventByIdempotencyKey(idempotencyKey: string) {
      return toCamel(database.prepare(`
        SELECT * FROM chat_session_character_presence_events WHERE idempotency_key = ?
      `).get(idempotencyKey) as Record<string, unknown> | null)
    },
    listEvents(sessionId: string, worldId: string, participantId = '') {
      if (participantId) {
        return database.prepare(`
          SELECT * FROM chat_session_character_presence_events
          WHERE session_id = ? AND world_id = ? AND participant_id = ?
          ORDER BY created_at ASC, id ASC
        `).all(sessionId, worldId, participantId).map(toCamel)
      }
      return database.prepare(`
        SELECT * FROM chat_session_character_presence_events
        WHERE session_id = ? AND world_id = ?
        ORDER BY created_at ASC, id ASC
      `).all(sessionId, worldId).map(toCamel)
    },
    insertEvent(row: Record<string, any>) {
      database.prepare(`
        INSERT INTO chat_session_character_presence_events (
          id, presence_id, session_id, world_id, participant_id,
          event_type, transition, from_state, to_state, provisional,
          proposal_event_id, source_message_id, source_director_run_id, source_agent_run_id,
          evidence_summary, idempotency_key, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        row.id, row.presenceId, row.sessionId, row.worldId, row.participantId,
        row.eventType, row.transition, row.fromState, row.toState, row.provisional ? 1 : 0,
        row.proposalEventId, row.sourceMessageId, row.sourceDirectorRunId, row.sourceAgentRunId,
        row.evidenceSummary, row.idempotencyKey, row.createdAt
      )
    },
    getAllPresences() {
      return database.prepare(`
        SELECT * FROM chat_session_character_presence
        ORDER BY session_id ASC, world_id ASC, participant_id ASC
      `).all().map(toCamel)
    },
    getAllPresenceEvents() {
      return database.prepare(`
        SELECT * FROM chat_session_character_presence_events
        ORDER BY session_id ASC, world_id ASC, created_at ASC, id ASC
      `).all().map(toCamel)
    },
    replaceAllPresences(rows: Array<Record<string, any>>) {
      database.prepare('DELETE FROM chat_session_character_presence').run()
      rows.forEach((row) => this.insertPresence(row))
    },
    replaceAllPresenceEvents(rows: Array<Record<string, any>>) {
      database.prepare('DELETE FROM chat_session_character_presence_events').run()
      rows.forEach((row) => this.insertEvent(row))
    },
    deleteBySessionId(sessionId: string) {
      database.prepare('DELETE FROM chat_session_character_presence_events WHERE session_id = ?').run(sessionId)
      database.prepare('DELETE FROM chat_session_character_presence WHERE session_id = ?').run(sessionId)
    },
    deleteByParticipantId(participantId: string) {
      database.prepare('DELETE FROM chat_session_character_presence_events WHERE participant_id = ?').run(participantId)
      database.prepare('DELETE FROM chat_session_character_presence WHERE participant_id = ?').run(participantId)
    },
    transaction<T>(run: () => T): T {
      return runInSavepoint(database, 'orchestration_presence', run)
    }
  }
}

export const orchestrationPresenceRepository = createOrchestrationPresenceRepository()
