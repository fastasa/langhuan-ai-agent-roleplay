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

function createLedgerTables(db) {
  db.exec(`
    CREATE TABLE chat_messages (
      id INTEGER PRIMARY KEY,
      session_id TEXT NOT NULL,
      role TEXT DEFAULT 'user',
      content TEXT DEFAULT '',
      created_at TEXT DEFAULT ''
    );

    CREATE TABLE chat_affect_ledger_entries (
      id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      round_id TEXT NOT NULL,
      character_id TEXT NOT NULL,
      source_message_ids_json TEXT DEFAULT '[]',
      situation_tags_json TEXT DEFAULT '[]',
      policy_impacts_json TEXT DEFAULT '{}',
      guard_impacts_json TEXT DEFAULT '{}',
      strength TEXT DEFAULT 'small',
      half_life_rounds INTEGER DEFAULT 3,
      reason TEXT DEFAULT '',
      evidence_hash TEXT DEFAULT '',
      stale_at TEXT DEFAULT '',
      stale_reason TEXT DEFAULT '',
      stale_trigger_message_id INTEGER DEFAULT 0,
      created_at TEXT DEFAULT '',
      user_id TEXT DEFAULT '',
      workspace_id TEXT DEFAULT 'default',
      UNIQUE(user_id, workspace_id, id)
    );

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

    CREATE TABLE chat_affect_residue_checkpoints (
      id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      character_id TEXT NOT NULL,
      covered_round_start TEXT DEFAULT '',
      covered_round_end TEXT DEFAULT '',
      residue_policy_impacts_json TEXT DEFAULT '{}',
      residue_guard_impacts_json TEXT DEFAULT '{}',
      residue_summary TEXT DEFAULT '',
      source_entry_ids_hash TEXT DEFAULT '',
      source_entry_count INTEGER DEFAULT 0,
      created_at TEXT DEFAULT '',
      updated_at TEXT DEFAULT '',
      user_id TEXT DEFAULT '',
      workspace_id TEXT DEFAULT 'default',
      UNIQUE(user_id, workspace_id, id)
    );
  `)
}

describe('chatRepository affect ledger', () => {
  it('按 sessionId + characterId 隔离并支持轮次范围查询', async () => {
    const { db } = await createSqlJsWrapper()
    createLedgerTables(db)
    const repository = createChatRepository(db)

    const base = {
      sourceMessageIdsJson: '[1,2]',
      situationTagsJson: '["request"]',
      policyImpactsJson: '{"policy_a":90}',
      guardImpactsJson: '{"socialTrust":90}',
      strength: 'medium',
      halfLifeRounds: 6,
      reason: '边界被尊重。',
      evidenceHash: 'hash_a',
      createdAt: '2026-05-16T10:00:00.000Z'
    }
    repository.upsertAffectLedgerEntry({
      ...base,
      id: 'ledger_a1',
      sessionId: 'session_a',
      roundId: 'round:session_a:1',
      characterId: 'char_a'
    })
    repository.upsertAffectLedgerEntry({
      ...base,
      id: 'ledger_a2',
      sessionId: 'session_a',
      roundId: 'round:session_a:2',
      characterId: 'char_b'
    })
    repository.upsertAffectLedgerEntry({
      ...base,
      id: 'ledger_b1',
      sessionId: 'session_b',
      roundId: 'round:session_b:1',
      characterId: 'char_a'
    })

    expect(repository.listAffectLedgerEntriesBySession('session_a', { characterId: 'char_a' }).map((row) => row.id)).toEqual(['ledger_a1'])
    expect(repository.listAffectLedgerEntriesBySession('session_a', {
      roundStart: 'round:session_a:2',
      roundEnd: 'round:session_a:2'
    }).map((row) => row.id)).toEqual(['ledger_a2'])
    expect(repository.listAffectLedgerEntriesBySession('session_b').map((row) => row.id)).toEqual(['ledger_b1'])
  })

  it('旧消息变更后标记本轮与之后的账本和入口审计失效', async () => {
    const { db } = await createSqlJsWrapper()
    createLedgerTables(db)
    const repository = createChatRepository(db)

    db.prepare('INSERT INTO chat_messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(10, 'session_a', 'user', '原消息', '2026-05-16T10:00:00.000Z')

    const base = {
      sessionId: 'session_a',
      characterId: 'char_a',
      sourceMessageIdsJson: '[10,11]',
      situationTagsJson: '["request"]',
      policyImpactsJson: '{"policy_a":90}',
      guardImpactsJson: '{"socialTrust":90}',
      strength: 'medium',
      halfLifeRounds: 6,
      reason: '边界被尊重。',
      evidenceHash: 'hash_a',
      createdAt: '2026-05-16T10:01:00.000Z'
    }
    repository.upsertAffectLedgerEntry({ ...base, id: 'ledger_10', roundId: 'round:session_a:10' })
    repository.upsertAffectLedgerEntry({ ...base, id: 'ledger_12', roundId: 'round:session_a:12', sourceMessageIdsJson: '[12]' })
    repository.upsertAffectLedgerEntry({ ...base, id: 'ledger_old', roundId: 'round:session_a:9', sourceMessageIdsJson: '[9]', createdAt: '2026-05-16T09:59:00.000Z' })
    repository.upsertAffectGateAudit({
      id: 'audit_10',
      sessionId: 'session_a',
      roundId: 'round:session_a:10',
      status: 'changed',
      source: 'quick_judge',
      reason: '快判完成。',
      situationFrameJson: '{}',
      rawOutput: '{}',
      createdAt: '2026-05-16T10:01:00.000Z'
    })
    repository.upsertAffectGateAudit({
      id: 'audit_12',
      sessionId: 'session_a',
      roundId: 'round:session_a:12',
      status: 'changed',
      source: 'quick_judge',
      reason: '快判完成。',
      situationFrameJson: '{}',
      rawOutput: '{}',
      createdAt: '2026-05-16T10:02:00.000Z'
    })

    const changed = repository.markAffectTideStaleFromMessage('session_a', 10, 'message_updated')
    expect(changed).toEqual({ ledger: 2, audits: 2, checkpoints: 0 })

    const entries = repository.listAffectLedgerEntriesBySession('session_a')
    expect(entries.find((row) => row.id === 'ledger_10').staleAt).toBeTruthy()
    expect(entries.find((row) => row.id === 'ledger_12').staleTriggerMessageId).toBe(10)
    expect(entries.find((row) => row.id === 'ledger_old').staleAt || '').toBe('')
    expect(repository.listAffectGateAuditsBySession('session_a').every((row) => row.staleReason === 'message_updated')).toBe(true)
  })

  it('消息删除或重试时删除对应情绪潮汐证据并清空残留检查点', async () => {
    const { db } = await createSqlJsWrapper()
    createLedgerTables(db)
    const repository = createChatRepository(db)

    db.prepare('INSERT INTO chat_messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(10, 'session_a', 'user', '原消息', '2026-05-16T10:00:00.000Z')

    const base = {
      sessionId: 'session_a',
      characterId: 'char_a',
      situationTagsJson: '["request"]',
      policyImpactsJson: '{"policy_a":90}',
      guardImpactsJson: '{"socialTrust":90}',
      strength: 'medium',
      halfLifeRounds: 6,
      reason: '边界被尊重。',
      evidenceHash: 'hash_a',
      createdAt: '2026-05-16T10:01:00.000Z'
    }
    repository.upsertAffectLedgerEntry({ ...base, id: 'ledger_source', roundId: 'round:session_a:9', sourceMessageIdsJson: '[10,11]' })
    repository.upsertAffectLedgerEntry({ ...base, id: 'ledger_later', roundId: 'round:session_a:12', sourceMessageIdsJson: '[12]' })
    repository.upsertAffectLedgerEntry({ ...base, id: 'ledger_old', roundId: 'round:session_a:9', sourceMessageIdsJson: '[9]', createdAt: '2026-05-16T09:59:00.000Z' })
    repository.upsertAffectGateAudit({
      id: 'audit_source',
      sessionId: 'session_a',
      roundId: 'round:session_a:9',
      status: 'changed',
      source: 'quick_judge',
      reason: '快判完成。',
      situationFrameJson: JSON.stringify({ characterFrames: [{ characterId: 'char_a', sourceMessageIds: ['10'] }] }),
      rawOutput: '{}',
      createdAt: '2026-05-16T10:01:00.000Z'
    })
    repository.upsertAffectGateAudit({
      id: 'audit_later',
      sessionId: 'session_a',
      roundId: 'round:session_a:12',
      status: 'changed',
      source: 'quick_judge',
      reason: '快判完成。',
      situationFrameJson: '{}',
      rawOutput: '{}',
      createdAt: '2026-05-16T10:02:00.000Z'
    })
    repository.upsertAffectResidueCheckpoint({
      id: 'checkpoint_a',
      sessionId: 'session_a',
      characterId: 'char_a',
      coveredRoundStart: 'round:session_a:1',
      coveredRoundEnd: 'round:session_a:12',
      residuePolicyImpactsJson: '{}',
      residueGuardImpactsJson: '{}',
      residueSummary: '压缩旧窗口。',
      sourceEntryIdsHash: 'source_hash',
      sourceEntryCount: 2,
      createdAt: '2026-05-16T10:03:00.000Z',
      updatedAt: '2026-05-16T10:03:00.000Z'
    })

    expect(repository.deleteAffectTideFromMessage('session_a', 10, 'referenced')).toEqual({ ledger: 1, audits: 1, checkpoints: 1 })
    expect(repository.listAffectLedgerEntriesBySession('session_a').map((row) => row.id)).toEqual(['ledger_old', 'ledger_later'])
    expect(repository.listAffectGateAuditsBySession('session_a').map((row) => row.id)).toEqual(['audit_later'])

    expect(repository.deleteAffectTideFromMessage('session_a', 10, 'from_message')).toEqual({ ledger: 1, audits: 1, checkpoints: 0 })
    expect(repository.listAffectLedgerEntriesBySession('session_a').map((row) => row.id)).toEqual(['ledger_old'])
    expect(repository.listAffectGateAuditsBySession('session_a')).toEqual([])
  })

  it('快照读取使用近期窗口并补充高贡献旧证据', async () => {
    const { db } = await createSqlJsWrapper()
    createLedgerTables(db)
    const repository = createChatRepository(db)

    const base = {
      sessionId: 'session_a',
      characterId: 'char_a',
      sourceMessageIdsJson: '[1]',
      situationTagsJson: '["request"]',
      policyImpactsJson: '{"policy_a":10}',
      guardImpactsJson: '{"socialTrust":10}',
      strength: 'small',
      halfLifeRounds: 6,
      reason: '普通证据。',
      evidenceHash: 'hash_a'
    }
    repository.upsertAffectLedgerEntry({ ...base, id: 'ledger_01', roundId: 'round:session_a:1', createdAt: '2026-05-16T10:01:00.000Z' })
    repository.upsertAffectLedgerEntry({ ...base, id: 'ledger_02', roundId: 'round:session_a:2', strength: 'large', policyImpactsJson: '{"policy_a":180}', createdAt: '2026-05-16T10:02:00.000Z' })
    repository.upsertAffectLedgerEntry({ ...base, id: 'ledger_03', roundId: 'round:session_a:3', createdAt: '2026-05-16T10:03:00.000Z', staleAt: '2026-05-16T11:00:00.000Z' })
    repository.upsertAffectLedgerEntry({ ...base, id: 'ledger_04', roundId: 'round:session_a:4', createdAt: '2026-05-16T10:04:00.000Z' })
    repository.upsertAffectLedgerEntry({ ...base, id: 'ledger_05', roundId: 'round:session_a:5', createdAt: '2026-05-16T10:05:00.000Z' })

    const rows = repository.listAffectLedgerEntriesForSnapshot('session_a', {
      characterId: 'char_a',
      recentLimit: 2,
      highContributionLimit: 1
    })

    expect(rows.map((row) => row.id)).toEqual(['ledger_02', 'ledger_04', 'ledger_05'])
  })

  it('保存和读取残留检查点', async () => {
    const { db } = await createSqlJsWrapper()
    createLedgerTables(db)
    const repository = createChatRepository(db)

    repository.upsertAffectResidueCheckpoint({
      id: 'checkpoint_a',
      sessionId: 'session_a',
      characterId: 'char_a',
      coveredRoundStart: 'round:session_a:1',
      coveredRoundEnd: 'round:session_a:12',
      residuePolicyImpactsJson: '{"policy_a":25}',
      residueGuardImpactsJson: '{"socialTrust":12}',
      residueSummary: '压缩旧窗口。',
      sourceEntryIdsHash: 'source_hash',
      sourceEntryCount: 12,
      createdAt: '2026-05-16T10:00:00.000Z',
      updatedAt: '2026-05-16T11:00:00.000Z'
    })

    const rows = repository.listAffectResidueCheckpointsBySession('session_a', { characterId: 'char_a' })
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      id: 'checkpoint_a',
      sourceEntryCount: 12,
      residueSummary: '压缩旧窗口。'
    })
  })
})
