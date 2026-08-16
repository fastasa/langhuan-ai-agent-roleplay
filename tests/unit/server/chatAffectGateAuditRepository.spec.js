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

function createAuditTables(db) {
  db.exec(`
    CREATE TABLE chat_affect_gate_audits (
      id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      round_id TEXT NOT NULL,
      status TEXT NOT NULL,
      source TEXT DEFAULT 'quick_judge',
      reason TEXT DEFAULT '',
      situation_frame_json TEXT DEFAULT '{}',
      raw_output TEXT DEFAULT '',
      stale_at TEXT DEFAULT '',
      stale_reason TEXT DEFAULT '',
      stale_trigger_message_id INTEGER DEFAULT 0,
      created_at TEXT DEFAULT '',
      user_id TEXT DEFAULT '',
      workspace_id TEXT DEFAULT 'default',
      UNIQUE(user_id, workspace_id, id)
    );
  `)
}

describe('chatRepository affect gate audit', () => {
  it('持久化所有入口状态并支持状态与轮次查询', async () => {
    const { db } = await createSqlJsWrapper()
    createAuditTables(db)
    const repository = createChatRepository(db)

    const base = {
      source: 'quick_judge',
      reason: '快判已完成。',
      situationFrameJson: '{"characterFrames":[]}',
      rawOutput: '{"characterFrames":[]}',
      createdAt: '2026-05-16T10:00:00.000Z'
    }
    repository.upsertAffectGateAudit({
      ...base,
      id: 'audit_changed',
      sessionId: 'session_a',
      roundId: 'round:session_a:1',
      status: 'changed'
    })
    repository.upsertAffectGateAudit({
      ...base,
      id: 'audit_no_change',
      sessionId: 'session_a',
      roundId: 'round:session_a:2',
      status: 'no_change'
    })
    repository.upsertAffectGateAudit({
      ...base,
      id: 'audit_failed',
      sessionId: 'session_b',
      roundId: 'round:session_b:1',
      status: 'failed'
    })

    expect(repository.listAffectGateAuditsBySession('session_a').map((row) => row.id)).toEqual(['audit_changed', 'audit_no_change'])
    expect(repository.listAffectGateAuditsBySession('session_a', { status: 'no_change' }).map((row) => row.id)).toEqual(['audit_no_change'])
    expect(repository.listAffectGateAuditsBySession('session_a', {
      roundStart: 'round:session_a:2',
      roundEnd: 'round:session_a:2'
    }).map((row) => row.id)).toEqual(['audit_no_change'])
    expect(repository.listAffectGateAuditsBySession('session_b').map((row) => row.status)).toEqual(['failed'])
  })
})
