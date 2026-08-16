import db from '../db.js'
import { toCamel } from '../application/shared/dbUtils.js'
import { runInSavepoint } from './sqliteSavepoint.js'

type NarrativeSeedDb = Pick<typeof db, 'prepare' | 'exec'>

function jsonText(value: unknown, fallback: unknown) {
  if (typeof value === 'string') return value
  try { return JSON.stringify(value ?? fallback) } catch { return JSON.stringify(fallback) }
}

export function createNarrativeSeedRepository(database: NarrativeSeedDb = db) {
  return {
    findWorldById(worldId: string) {
      return toCamel(database.prepare("SELECT * FROM worlds WHERE id = ? AND status != 'deleted'").get(worldId) as Record<string, unknown> | null)
    },
    findSessionById(sessionId: string) {
      return toCamel(database.prepare('SELECT * FROM chat_sessions WHERE id = ?').get(sessionId) as Record<string, unknown> | null)
    },
    listSessionParticipants(sessionId: string) {
      return database.prepare(`
        SELECT participant_target_id, participant_type
        FROM chat_session_participants
        WHERE session_id = ?
        ORDER BY display_order ASC, id ASC
      `).all(sessionId).map(toCamel)
    },
    findMapSheetById(sheetId: string) {
      return toCamel(database.prepare("SELECT * FROM chat_map_sheets WHERE id = ? AND status != 'deleted'").get(sheetId) as Record<string, unknown> | null)
    },
    findMapFeatureById(featureId: string) {
      return toCamel(database.prepare("SELECT * FROM chat_map_features WHERE id = ? AND status != 'deleted'").get(featureId) as Record<string, unknown> | null)
    },
    listSeeds(worldId: string) {
      return database.prepare(`
        SELECT * FROM world_narrative_seeds
        WHERE world_id = ?
        ORDER BY updated_at DESC, id ASC
      `).all(worldId).map(toCamel)
    },
    findSeedById(seedId: string) {
      return toCamel(database.prepare('SELECT * FROM world_narrative_seeds WHERE id = ?').get(seedId) as Record<string, unknown> | null)
    },
    listParticipants(seedId: string) {
      return database.prepare(`
        SELECT * FROM world_narrative_seed_participants
        WHERE seed_id = ? ORDER BY created_at ASC, id ASC
      `).all(seedId).map(toCamel)
    },
    listLinks(seedId: string) {
      return database.prepare(`
        SELECT * FROM world_narrative_seed_links
        WHERE source_seed_id = ? ORDER BY created_at ASC, id ASC
      `).all(seedId).map(toCamel)
    },
    listWorldLinks(worldId: string) {
      return database.prepare(`
        SELECT * FROM world_narrative_seed_links
        WHERE world_id = ? ORDER BY created_at ASC, id ASC
      `).all(worldId).map(toCamel)
    },
    listEvents(seedId: string) {
      return database.prepare(`
        SELECT * FROM world_narrative_seed_events
        WHERE seed_id = ? ORDER BY created_at ASC, id ASC
      `).all(seedId).map(toCamel)
    },
    getConfig(worldId: string) {
      return toCamel(database.prepare('SELECT * FROM world_narrative_configs WHERE world_id = ?').get(worldId) as Record<string, unknown> | null)
    },
    insertSeed(row: Record<string, any>) {
      database.prepare(`
        INSERT INTO world_narrative_seeds (
          id, world_id, type, title, description, cause, current_progress,
          expected_outcome, start_time, last_advanced_at, map_sheet_id, map_feature_id, location_text,
          impact_scope, status, visibility_mode, visibility_json, allow_frontstage,
          version, last_modified_source, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        row.id, row.worldId, row.type, row.title, row.description, row.cause, row.currentProgress,
        row.expectedOutcome, row.startTime, row.lastAdvancedAt, row.mapSheetId, row.mapFeatureId, row.locationText,
        row.impactScope, row.status, row.visibilityMode, jsonText(row.visibility, {}), row.allowFrontstage ? 1 : 0,
        row.version, row.lastModifiedSource, row.createdAt, row.updatedAt
      )
    },
    updateSeedOptimistic(seedId: string, worldId: string, expectedVersion: number, row: Record<string, any>) {
      return database.prepare(`
        UPDATE world_narrative_seeds SET
          type = ?, title = ?, description = ?, cause = ?, current_progress = ?,
          expected_outcome = ?, start_time = ?, last_advanced_at = ?, map_sheet_id = ?, map_feature_id = ?,
          location_text = ?, impact_scope = ?, status = ?, visibility_mode = ?, visibility_json = ?,
          allow_frontstage = ?, version = version + 1, last_modified_source = ?, updated_at = ?
        WHERE id = ? AND world_id = ? AND version = ?
      `).run(
        row.type, row.title, row.description, row.cause, row.currentProgress,
        row.expectedOutcome, row.startTime, row.lastAdvancedAt, row.mapSheetId, row.mapFeatureId,
        row.locationText, row.impactScope, row.status, row.visibilityMode, jsonText(row.visibility, {}),
        row.allowFrontstage ? 1 : 0, row.lastModifiedSource, row.updatedAt,
        seedId, worldId, expectedVersion
      ).changes
    },
    deleteSeedOptimistic(seedId: string, worldId: string, expectedVersion: number) {
      const changed = database.prepare('DELETE FROM world_narrative_seeds WHERE id = ? AND world_id = ? AND version = ?')
        .run(seedId, worldId, expectedVersion).changes
      if (!changed) return 0
      database.prepare('DELETE FROM world_narrative_seed_links WHERE source_seed_id = ? OR target_seed_id = ?').run(seedId, seedId)
      database.prepare('DELETE FROM world_narrative_seed_participants WHERE seed_id = ?').run(seedId)
      database.prepare('DELETE FROM world_narrative_seed_events WHERE seed_id = ?').run(seedId)
      return changed
    },
    replaceParticipants(seedId: string, worldId: string, rows: Array<Record<string, any>>) {
      database.prepare('DELETE FROM world_narrative_seed_participants WHERE seed_id = ?').run(seedId)
      const stmt = database.prepare(`
        INSERT INTO world_narrative_seed_participants (
          id, seed_id, world_id, participant_type, participant_id, display_name, relation_role, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `)
      rows.forEach((row) => stmt.run(
        row.id, seedId, worldId, row.participantType, row.participantId,
        row.displayName, row.relationRole, row.createdAt
      ))
    },
    replaceLinks(seedId: string, worldId: string, rows: Array<Record<string, any>>) {
      database.prepare('DELETE FROM world_narrative_seed_links WHERE source_seed_id = ?').run(seedId)
      const stmt = database.prepare(`
        INSERT INTO world_narrative_seed_links (
          id, world_id, source_seed_id, target_seed_id, relation_type, created_at
        ) VALUES (?, ?, ?, ?, ?, ?)
      `)
      rows.forEach((row) => stmt.run(row.id, worldId, seedId, row.targetSeedId, row.relationType, row.createdAt))
    },
    appendEvent(row: Record<string, any>) {
      database.prepare(`
        INSERT INTO world_narrative_seed_events (
          id, seed_id, world_id, event_type, from_status, to_status, diff_json,
          source_session_id, source_message_id, source_director_run_id, source_agent_run_id,
          evidence_summary, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        row.id, row.seedId, row.worldId, row.eventType, row.fromStatus, row.toStatus,
        jsonText(row.diff, {}), row.sourceSessionId, row.sourceMessageId,
        row.sourceDirectorRunId, row.sourceAgentRunId, row.evidenceSummary, row.createdAt
      )
    },
    insertConfig(row: Record<string, any>) {
      database.prepare(`
        INSERT INTO world_narrative_configs (
          world_id, content,
          version, created_at, updated_at
        ) VALUES (?, ?, 1, ?, ?)
      `).run(
        row.worldId, row.content, row.createdAt, row.updatedAt
      )
    },
    updateConfigOptimistic(worldId: string, expectedVersion: number, row: Record<string, any>) {
      return database.prepare(`
        UPDATE world_narrative_configs SET
          content = ?,
          version = version + 1, updated_at = ?
        WHERE world_id = ? AND version = ?
      `).run(
        row.content, row.updatedAt, worldId, expectedVersion
      ).changes
    },
    transaction<T>(run: () => T): T {
      return runInSavepoint(database, 'narrative_seed', run)
    }
  }
}

export const narrativeSeedRepository = createNarrativeSeedRepository()
