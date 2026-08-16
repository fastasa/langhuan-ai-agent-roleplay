import Database from 'better-sqlite3'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../server/db.js', () => ({
  default: {
    prepare() { throw new Error('测试必须显式注入内存数据库') },
    exec() { throw new Error('测试必须显式注入内存数据库') }
  }
}))

import { createOrchestrationPresenceRepository } from '../../../server/repositories/orchestrationPresenceRepository.js'
import { createOrchestrationPresenceAppService } from '../../../server/application/orchestration/orchestrationPresenceAppService.js'

function createDb() {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE chat_sessions (
      id TEXT PRIMARY KEY,
      world_id TEXT DEFAULT '',
      user_id TEXT DEFAULT 'user_1',
      workspace_id TEXT DEFAULT 'default'
    );
    CREATE TABLE chat_session_participants (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      participant_target_id TEXT NOT NULL,
      participant_type TEXT NOT NULL,
      display_order INTEGER DEFAULT 0,
      character_state_mode TEXT DEFAULT 'follow_main',
      character_branch_id TEXT DEFAULT '',
      user_id TEXT DEFAULT 'user_1',
      workspace_id TEXT DEFAULT 'default'
    );
    CREATE TABLE chat_map_sheets (
      id TEXT PRIMARY KEY,
      world_id TEXT NOT NULL,
      status TEXT DEFAULT 'active',
      user_id TEXT DEFAULT 'user_1',
      workspace_id TEXT DEFAULT 'default'
    );
    CREATE TABLE chat_map_features (
      id TEXT PRIMARY KEY,
      world_id TEXT NOT NULL,
      sheet_id TEXT NOT NULL,
      status TEXT DEFAULT 'active',
      user_id TEXT DEFAULT 'user_1',
      workspace_id TEXT DEFAULT 'default'
    );
    CREATE TABLE chat_session_character_presence (
      id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      world_id TEXT DEFAULT '',
      participant_id TEXT NOT NULL,
      presence_state TEXT NOT NULL DEFAULT 'unknown',
      location_text TEXT DEFAULT '',
      map_sheet_id TEXT DEFAULT '',
      map_feature_id TEXT DEFAULT '',
      since_message_id TEXT DEFAULT '',
      version INTEGER NOT NULL DEFAULT 1,
      last_modified_source TEXT DEFAULT 'user_manual',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      user_id TEXT DEFAULT '',
      workspace_id TEXT DEFAULT 'local',
      UNIQUE(user_id, workspace_id, id),
      UNIQUE(user_id, workspace_id, session_id, world_id, participant_id)
    );
    CREATE TABLE chat_session_character_presence_events (
      id TEXT NOT NULL,
      presence_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      world_id TEXT DEFAULT '',
      participant_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      transition TEXT NOT NULL,
      from_state TEXT NOT NULL DEFAULT 'unknown',
      to_state TEXT NOT NULL DEFAULT 'unknown',
      provisional INTEGER NOT NULL DEFAULT 0,
      proposal_event_id TEXT DEFAULT '',
      source_message_id TEXT DEFAULT '',
      source_director_run_id TEXT DEFAULT '',
      source_agent_run_id TEXT DEFAULT '',
      evidence_summary TEXT DEFAULT '',
      idempotency_key TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      user_id TEXT DEFAULT '',
      workspace_id TEXT DEFAULT 'local',
      UNIQUE(user_id, workspace_id, id),
      UNIQUE(user_id, workspace_id, idempotency_key)
    );
    CREATE INDEX idx_chat_character_presence_session_world
      ON chat_session_character_presence(user_id, workspace_id, session_id, world_id, presence_state, updated_at);
    CREATE INDEX idx_chat_character_presence_events_presence
      ON chat_session_character_presence_events(user_id, workspace_id, presence_id, created_at, id);
  `)
  db.prepare('INSERT INTO chat_sessions (id, world_id) VALUES (?, ?)').run('session_1', 'world_1')
  db.prepare('INSERT INTO chat_sessions (id, world_id) VALUES (?, ?)').run('session_2', 'world_2')
  db.prepare(`
    INSERT INTO chat_session_participants (id, session_id, participant_target_id, participant_type, display_order)
    VALUES (?, ?, ?, 'char', ?)
  `).run('participant_1', 'session_1', 'character_1', 0)
  db.prepare(`
    INSERT INTO chat_session_participants (id, session_id, participant_target_id, participant_type, display_order)
    VALUES (?, ?, ?, 'char', ?)
  `).run('participant_2', 'session_2', 'character_2', 0)
  db.prepare('INSERT INTO chat_map_sheets (id, world_id) VALUES (?, ?)').run('sheet_1', 'world_1')
  db.prepare('INSERT INTO chat_map_features (id, world_id, sheet_id) VALUES (?, ?, ?)').run('feature_1', 'world_1', 'sheet_1')
  return db
}

function command(overrides = {}) {
  return {
    participantId: 'participant_1',
    worldId: 'world_1',
    expectedVersion: 0,
    idempotencyKey: 'presence:test:1',
    evidenceSummary: '测试证据',
    sourceMessageId: '101',
    ...overrides
  }
}

describe('角色在场 application service', () => {
  let db
  let repository
  let service

  beforeEach(() => {
    db = createDb()
    repository = createOrchestrationPresenceRepository(db)
    service = createOrchestrationPresenceAppService(repository)
  })

  it('增量迁移建立当前表、事件表、作用域唯一约束和查询索引', () => {
    expect(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'chat_session_character_presence%'").all().map((row) => row.name).sort()).toEqual([
      'chat_session_character_presence',
      'chat_session_character_presence_events'
    ])
    const indexNames = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name LIKE 'chat_session_character_presence%'").all().map((row) => row.name)
    expect(indexNames).toContain('idx_chat_character_presence_session_world')
    expect(indexNames).toContain('idx_chat_character_presence_events_presence')
  })

  it('旧会话只读预览为 unknown，零写入且成员仍是上限', () => {
    const result = service.list('session_1')
    expect(result).toMatchObject({
      ok: true,
      data: {
        sessionId: 'session_1',
        worldId: 'world_1',
        items: [{ participantId: 'participant_1', presenceState: 'unknown', version: 0, persisted: false }]
      }
    })
    expect(db.prepare('SELECT COUNT(*) AS count FROM chat_session_character_presence').get().count).toBe(0)
  })

  it('proposed 只追加事件，commit 才推进事实；重复幂等键不重复写', () => {
    const proposed = service.propose('session_1', command({ toState: 'present' }))
    expect(proposed).toMatchObject({ ok: true, data: { presence: null, event: { eventType: 'proposed', provisional: true } } })
    expect(db.prepare('SELECT COUNT(*) AS count FROM chat_session_character_presence').get().count).toBe(0)

    const committed = service.commit('session_1', command({
      toState: 'present',
      proposalEventId: proposed.data.event.id,
      idempotencyKey: 'presence:test:commit:1'
    }))
    expect(committed).toMatchObject({
      ok: true,
      data: { presence: { presenceState: 'present', version: 1 }, event: { eventType: 'committed', provisional: false } }
    })

    const repeated = service.commit('session_1', command({
      toState: 'present',
      proposalEventId: proposed.data.event.id,
      idempotencyKey: 'presence:test:commit:1'
    }))
    expect(repeated).toMatchObject({ ok: true, data: { idempotent: true, presence: { version: 1 } } })
    expect(db.prepare("SELECT COUNT(*) AS count FROM chat_session_character_presence_events WHERE event_type = 'committed'").get().count).toBe(1)
  })

  it('陈旧 expectedVersion 返回 409，不覆盖当前事实', () => {
    expect(service.set('session_1', command({ presenceState: 'present' })).ok).toBe(true)
    const stale = service.set('session_1', command({
      presenceState: 'offstage',
      expectedVersion: 0,
      idempotencyKey: 'presence:test:stale'
    }))
    expect(stale).toMatchObject({ ok: false, status: 409, details: { code: 'ORCHESTRATION_VERSION_CONFLICT', currentVersion: 1 } })
    expect(repository.findPresence('session_1', 'world_1', 'participant_1')).toMatchObject({ presenceState: 'present', version: 1 })
  })

  it('同一会话换世界后旧世界事实保留但不可见，挂回后恢复', () => {
    expect(service.set('session_1', command({ presenceState: 'present' })).ok).toBe(true)
    db.prepare('UPDATE chat_sessions SET world_id = ? WHERE id = ?').run('world_2', 'session_1')

    expect(service.list('session_1')).toMatchObject({
      ok: true,
      data: { worldId: 'world_2', items: [{ presenceState: 'unknown', version: 0 }] }
    })
    expect(service.set('session_1', command({
      worldId: 'world_2',
      presenceState: 'offstage',
      idempotencyKey: 'presence:test:world2'
    })).ok).toBe(true)

    db.prepare('UPDATE chat_sessions SET world_id = ? WHERE id = ?').run('world_1', 'session_1')
    expect(service.list('session_1')).toMatchObject({
      ok: true,
      data: { worldId: 'world_1', items: [{ presenceState: 'present', version: 1 }] }
    })
  })

  it('跨会话参与者、跨世界写入和错误地图引用都会被拒绝', () => {
    expect(service.set('session_1', command({ participantId: 'participant_2', presenceState: 'present' }))).toMatchObject({ ok: false, status: 404 })
    expect(service.set('session_1', command({ worldId: 'world_2', presenceState: 'present' }))).toMatchObject({ ok: false, status: 409 })
    expect(service.set('session_1', command({ presenceState: 'present', mapSheetId: 'missing_sheet' }))).toMatchObject({ ok: false, status: 400 })
    expect(service.set('session_1', command({ presenceState: 'present', mapSheetId: 'sheet_1', mapFeatureId: 'feature_1' }))).toMatchObject({ ok: true })
  })

  it('快照仓储往返保留当前事实和事件，清理参与者时两者一起删除', () => {
    expect(service.set('session_1', command({ presenceState: 'present' })).ok).toBe(true)
    const presences = repository.getAllPresences()
    const events = repository.getAllPresenceEvents()

    repository.replaceAllPresenceEvents([])
    repository.replaceAllPresences([])
    expect(repository.getAllPresences()).toEqual([])
    expect(repository.getAllPresenceEvents()).toEqual([])

    repository.replaceAllPresences(presences)
    repository.replaceAllPresenceEvents(events)
    expect(repository.getAllPresences()).toMatchObject([{ presenceState: 'present', version: 1 }])
    expect(repository.getAllPresenceEvents()).toMatchObject([{ eventType: 'corrected' }])

    repository.deleteByParticipantId('participant_1')
    expect(repository.getAllPresences()).toEqual([])
    expect(repository.getAllPresenceEvents()).toEqual([])
  })
})
