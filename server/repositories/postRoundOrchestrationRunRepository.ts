import db from '../db.js'
import { toCamel } from '../application/shared/dbUtils.js'

type Database = Pick<typeof db, 'prepare'>
type Row = Record<string, any>

function parseRun(row: Row | null | undefined) {
  if (!row) return null
  const result = toCamel(row) as Row
  try { result.resultJson = JSON.parse(String(result.resultJson || '{}')) } catch { result.resultJson = {} }
  return result
}

export function createPostRoundOrchestrationRunRepository(database: Database = db) {
  const findById = (userId: string, workspaceId: string, id: string) => parseRun(database.prepare(`
    SELECT * FROM chat_post_round_orchestration_runs
    WHERE user_id = ? AND workspace_id = ? AND id = ?
  `).get(userId, workspaceId, id) as Row | null)
  return {
    hasSession(userId: string, workspaceId: string, sessionId: string) {
      return Boolean(database.prepare(`
        SELECT 1 FROM chat_sessions
        WHERE user_id = ? AND workspace_id = ? AND id = ?
        LIMIT 1
      `).get(userId, workspaceId, sessionId))
    },
    findByRound(userId: string, workspaceId: string, sessionId: string, inputMessageId: number) {
      return parseRun(database.prepare(`
        SELECT * FROM chat_post_round_orchestration_runs
        WHERE user_id = ? AND workspace_id = ? AND session_id = ? AND input_message_id = ?
      `).get(userId, workspaceId, sessionId, inputMessageId) as Row | null)
    },
    findById(userId: string, workspaceId: string, id: string) {
      return findById(userId, workspaceId, id)
    },
    listUnresolved(userId: string, workspaceId: string, sessionId: string) {
      return (database.prepare(`
        SELECT * FROM chat_post_round_orchestration_runs
        WHERE user_id = ? AND workspace_id = ? AND session_id = ? AND status IN ('pending', 'running', 'failed')
        ORDER BY datetime(created_at), input_message_id
      `).all(userId, workspaceId, sessionId) as Row[]).map(parseRun).filter(Boolean)
    },
    insert(row: Row) {
      database.prepare(`
        INSERT INTO chat_post_round_orchestration_runs (
          id, session_id, input_message_id, trigger_kind, status, attempt_count,
          error_stage, error_message, idempotency_key, result_json,
          started_at, finished_at, created_at, updated_at, user_id, workspace_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        row.id, row.sessionId, row.inputMessageId, row.triggerKind, row.status, row.attemptCount,
        row.errorStage, row.errorMessage, row.idempotencyKey, JSON.stringify(row.resultJson || {}),
        row.startedAt, row.finishedAt, row.createdAt, row.updatedAt, row.userId, row.workspaceId
      )
      return findById(row.userId, row.workspaceId, row.id)
    },
    update(userId: string, workspaceId: string, id: string, patch: Row) {
      database.prepare(`
        UPDATE chat_post_round_orchestration_runs SET
          status = ?, attempt_count = ?, error_stage = ?, error_message = ?, result_json = ?,
          started_at = ?, finished_at = ?, updated_at = ?
        WHERE user_id = ? AND workspace_id = ? AND id = ?
      `).run(
        patch.status, patch.attemptCount, patch.errorStage, patch.errorMessage,
        JSON.stringify(patch.resultJson || {}), patch.startedAt, patch.finishedAt, patch.updatedAt,
        userId, workspaceId, id
      )
      return findById(userId, workspaceId, id)
    }
  }
}

export const postRoundOrchestrationRunRepository = createPostRoundOrchestrationRunRepository()
