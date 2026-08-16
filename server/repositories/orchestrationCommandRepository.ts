import db from '../db.js'
import { toCamel } from '../application/shared/dbUtils.js'
import { runInSavepoint } from './sqliteSavepoint.js'

type CommandDb = Pick<typeof db, 'prepare' | 'exec'>
type Row = Record<string, any>

export function createOrchestrationCommandRepository(database: CommandDb = db) {
  return {
    findByIdempotencyKey(userId: string, workspaceId: string, idempotencyKey: string) {
      return toCamel(database.prepare(`
        SELECT * FROM chat_orchestration_command_operations
        WHERE user_id = ? AND workspace_id = ? AND idempotency_key = ?
      `).get(userId, workspaceId, idempotencyKey) as Row | null)
    },
    insert(row: Row) {
      database.prepare(`
        INSERT INTO chat_orchestration_command_operations (
          idempotency_key, session_id, world_id, command_name, target_ref_json,
          request_hash, result_version, result_json, created_at, user_id, workspace_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        row.idempotencyKey, row.sessionId, row.worldId, row.commandName, row.targetRefJson,
        row.requestHash, row.resultVersion, row.resultJson, row.createdAt, row.userId, row.workspaceId
      )
    },
    bumpCurtainVersion(sessionId: string, expectedVersion: number) {
      return Number(database.prepare(`
        UPDATE chat_sessions
        SET curtain_version = curtain_version + 1
        WHERE id = ? AND curtain_version = ?
      `).run(sessionId, expectedVersion).changes || 0)
    },
    transaction<T>(operation: () => T): T {
      return runInSavepoint(database, 'orchestration_command', operation)
    }
  }
}

export const orchestrationCommandRepository = createOrchestrationCommandRepository()
