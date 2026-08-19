import initSqlJs from 'sql.js'
import { describe, expect, it } from 'vitest'

import { createChatRepository } from '../../../server/repositories/chatRepository.ts'

async function createSqlJsWrapper() {
  const SQL = await initSqlJs()
  const raw = new SQL.Database()
  return {
    raw,
    db: {
      exec(sql) {
        raw.exec(sql)
      },
      prepare(sql) {
        return {
          all(...params) {
            const stmt = raw.prepare(sql)
            if (params.length) stmt.bind(params)
            const rows = []
            while (stmt.step()) rows.push(stmt.getAsObject())
            stmt.free()
            return rows
          },
          get(...params) {
            const stmt = raw.prepare(sql)
            if (params.length) stmt.bind(params)
            const row = stmt.step() ? stmt.getAsObject() : undefined
            stmt.free()
            return row
          },
          run(...params) {
            const stmt = raw.prepare(sql)
            if (params.length) stmt.bind(params)
            stmt.step()
            stmt.free()
            return { changes: raw.getRowsModified() }
          }
        }
      }
    }
  }
}

describe('chat repository orchestration checkpoint persistence', () => {
  it('serializes object dependency snapshots and reads them back without corruption', async () => {
    const { raw, db } = await createSqlJsWrapper()
    db.exec(`
      CREATE TABLE chat_session_orchestration_state (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        world_id TEXT NOT NULL,
        scenario_code TEXT NOT NULL,
        scenario_label TEXT DEFAULT '',
        scenario_summary TEXT DEFAULT '',
        anchor_message_id TEXT DEFAULT '',
        source_artifact_id TEXT DEFAULT '',
        dependency_snapshot_json TEXT DEFAULT '{}',
        version INTEGER DEFAULT 1,
        source TEXT DEFAULT '',
        created_at TEXT DEFAULT '',
        updated_at TEXT DEFAULT ''
      );
    `)
    const repository = createChatRepository(db)
    const dependencySnapshot = {
      fingerprint: 'fp-checkpoint-1',
      values: { curtain: 'v3', promptPresetRevision: 'preset-2' }
    }

    repository.replaceSessionOrchestrationStates([{
      id: 'state_1',
      sessionId: 'session_1',
      worldId: 'world_1',
      scenarioCode: 'investigation',
      scenarioLabel: '调查',
      scenarioSummary: '继续核对旧事实',
      anchorMessageId: '101',
      sourceArtifactId: 'artifact_1',
      dependencySnapshotJson: dependencySnapshot,
      version: 2,
      source: 'snapshot_restore',
      createdAt: '2026-08-18T10:00:00.000Z',
      updatedAt: '2026-08-18T10:01:00.000Z'
    }])

    const rawRow = raw.exec('SELECT dependency_snapshot_json FROM chat_session_orchestration_state')[0].values[0][0]
    expect(JSON.parse(rawRow)).toEqual(dependencySnapshot)
    expect(repository.getAllSessionOrchestrationStates()).toEqual([
      expect.objectContaining({
        id: 'state_1',
        dependencySnapshotJson: dependencySnapshot
      })
    ])
    raw.close()
  })
})
