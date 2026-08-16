import db from '../db.js'
import { toCamel } from '../application/shared/dbUtils.js'

type ProjectionDb = Pick<typeof db, 'prepare'>
type Row = Record<string, any>

const one = (value: unknown) => toCamel(value as Row | null) as Row | null
const many = (value: unknown[]) => value.map((item) => toCamel(item as Row) as Row)

/** 统一编排只读仓库。所有查询仍经过 data-scope DB 代理，不自行拼接跨账号范围。 */
export function createOrchestrationWorkspaceProjectionRepository(database: ProjectionDb = db) {
  return {
    findSessionById(sessionId: string) {
      return one(database.prepare('SELECT * FROM chat_sessions WHERE id = ?').get(sessionId))
    },
    listCharacterParticipants(sessionId: string) {
      return many(database.prepare(`
        SELECT * FROM chat_session_participants
        WHERE session_id = ? AND participant_type = 'char'
        ORDER BY display_order ASC, id ASC
      `).all(sessionId) as Row[])
    },
    findCharacterById(characterId: string) {
      return one(database.prepare('SELECT * FROM characters WHERE id = ?').get(characterId))
    },
    listPresences(sessionId: string, worldId: string) {
      return many(database.prepare(`
        SELECT * FROM chat_session_character_presence
        WHERE session_id = ? AND world_id = ?
        ORDER BY updated_at ASC, id ASC
      `).all(sessionId, worldId) as Row[])
    },
    listPendingPresenceTransitions(sessionId: string, worldId: string) {
      return many(database.prepare(`
        SELECT proposal.*
        FROM chat_session_character_presence_events proposal
        WHERE proposal.session_id = ?
          AND proposal.world_id = ?
          AND proposal.event_type = 'proposed'
          AND proposal.provisional = 1
          AND NOT EXISTS (
            SELECT 1
            FROM chat_session_character_presence_events resolution
            WHERE resolution.proposal_event_id = proposal.id
              AND resolution.event_type IN ('committed', 'cancelled')
          )
        ORDER BY proposal.created_at DESC, proposal.id DESC
      `).all(sessionId, worldId) as Row[])
    },
    listRecentPresenceFacts(sessionId: string, worldId: string, limit = 12) {
      return many(database.prepare(`
        SELECT * FROM chat_session_character_presence_events
        WHERE session_id = ? AND world_id = ? AND event_type IN ('committed', 'corrected')
        ORDER BY created_at DESC, id DESC LIMIT ?
      `).all(sessionId, worldId, limit) as Row[])
    },
    listRecentMessages(sessionId: string, limit = 10) {
      return many(database.prepare(`
        SELECT id, role, content, name, member_name, message_kind, created_at
        FROM chat_messages
        WHERE session_id = ? AND COALESCE(auto_write_hidden, 0) = 0
        ORDER BY id DESC LIMIT ?
      `).all(sessionId, limit) as Row[])
    },
    listRecentNarrativeSeedFacts(worldId: string, limit = 12) {
      return many(database.prepare(`
        SELECT event.*, seed.title AS seed_title
        FROM world_narrative_seed_events event
        LEFT JOIN world_narrative_seeds seed ON seed.id = event.seed_id
        WHERE event.world_id = ? AND event.event_type = 'fact_committed'
        ORDER BY event.created_at DESC, event.id DESC LIMIT ?
      `).all(worldId, limit) as Row[])
    },
    findNarrativeConfig(worldId: string) {
      return one(database.prepare('SELECT * FROM world_narrative_configs WHERE world_id = ?').get(worldId))
    },
    listNarrativeSeeds(worldId: string) {
      return many(database.prepare(`
        SELECT * FROM world_narrative_seeds
        WHERE world_id = ? AND status NOT IN ('resolved', 'cancelled', 'archived')
        ORDER BY CASE status WHEN 'ready_to_trigger' THEN 0 WHEN 'active' THEN 1 WHEN 'triggered' THEN 2 ELSE 3 END,
                 datetime(COALESCE(updated_at, created_at, '1970-01-01')) DESC, id ASC
      `).all(worldId) as Row[])
    },
    listWorldEntities(worldId: string) {
      return many(database.prepare(`
        SELECT * FROM world_entities
        WHERE world_id = ? AND COALESCE(status, 'active') <> 'deleted'
        ORDER BY kind ASC, datetime(COALESCE(updated_at, created_at, '1970-01-01')) DESC, id ASC
      `).all(worldId) as Row[])
    },
    listStatusPanels(sessionId: string, worldId: string) {
      const query = worldId
        ? database.prepare(`
            SELECT panel.*, template.kind AS template_kind, template.description AS template_description
            FROM chat_status_panels panel
            LEFT JOIN chat_status_panel_templates template ON template.id = panel.template_id
            WHERE panel.world_id = ?
              AND (COALESCE(panel.host_type, 'none') <> 'session_character' OR panel.session_id = ?)
              AND COALESCE(panel.status, 'active') <> 'deleted'
            ORDER BY datetime(COALESCE(panel.updated_at, panel.created_at, '1970-01-01')) DESC, panel.id ASC
          `).all(worldId, sessionId)
        : database.prepare(`
            SELECT panel.*, template.kind AS template_kind, template.description AS template_description
            FROM chat_status_panels panel
            LEFT JOIN chat_status_panel_templates template ON template.id = panel.template_id
            WHERE panel.session_id = ? AND COALESCE(panel.world_id, '') = ''
              AND COALESCE(panel.status, 'active') <> 'deleted'
            ORDER BY datetime(COALESCE(panel.updated_at, panel.created_at, '1970-01-01')) DESC, panel.id ASC
          `).all(sessionId)
      return many(query as Row[])
    },
    findNarrativeOverride(sessionId: string, worldId: string) {
      return one(database.prepare(`
        SELECT * FROM chat_session_narrative_overrides WHERE session_id = ? AND world_id = ?
      `).get(sessionId, worldId))
    },
    findOrchestrationState(sessionId: string, worldId: string) {
      return one(database.prepare(`
        SELECT * FROM chat_session_orchestration_state WHERE session_id = ? AND world_id = ?
      `).get(sessionId, worldId))
    },
    findRecentRoundArtifact(sessionId: string, anchorMessageId = '') {
      if (anchorMessageId) {
        const anchored = one(database.prepare(`
          SELECT * FROM chat_generation_attempt_artifacts
          WHERE session_id = ? AND CAST(message_id AS TEXT) = ?
          ORDER BY datetime(created_at) DESC, id DESC LIMIT 1
        `).get(sessionId, anchorMessageId))
        if (anchored) return anchored
      }
      return one(database.prepare(`
        SELECT * FROM chat_generation_attempt_artifacts
        WHERE session_id = ?
        ORDER BY datetime(created_at) DESC, id DESC LIMIT 1
      `).get(sessionId))
    }
  }
}

export const orchestrationWorkspaceProjectionRepository = createOrchestrationWorkspaceProjectionRepository()
