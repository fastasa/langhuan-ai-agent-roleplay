import Database from 'better-sqlite3'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../server/db.js', () => ({
  default: {
    prepare() { throw new Error('测试必须显式注入内存数据库') },
    exec() { throw new Error('测试必须显式注入内存数据库') }
  }
}))

import { createOrchestrationMaterialsRepository } from '../../../server/repositories/orchestrationMaterialsRepository.js'
import { createOrchestrationMaterialsAppService } from '../../../server/application/orchestration/orchestrationMaterialsAppService.js'

function createDb() {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE chat_sessions (
      id TEXT PRIMARY KEY, world_id TEXT DEFAULT '',
      user_id TEXT DEFAULT 'user_1', workspace_id TEXT DEFAULT 'default'
    );
    CREATE TABLE chat_session_narrative_overrides (
      id TEXT NOT NULL, session_id TEXT NOT NULL, world_id TEXT DEFAULT '', content TEXT NOT NULL DEFAULT '',
      version INTEGER NOT NULL DEFAULT 1, source TEXT NOT NULL DEFAULT 'user_manual',
      created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')),
      user_id TEXT DEFAULT '', workspace_id TEXT DEFAULT 'local',
      UNIQUE(user_id, workspace_id, id), UNIQUE(user_id, workspace_id, session_id, world_id)
    );
    CREATE TABLE chat_session_orchestration_state (
      id TEXT NOT NULL, session_id TEXT NOT NULL, world_id TEXT DEFAULT '', scenario_code TEXT NOT NULL DEFAULT '',
      scenario_label TEXT DEFAULT '', scenario_summary TEXT DEFAULT '', anchor_message_id TEXT DEFAULT '', source_artifact_id TEXT DEFAULT '',
      dependency_snapshot_json TEXT DEFAULT '{}',
      version INTEGER NOT NULL DEFAULT 1, source TEXT NOT NULL DEFAULT 'director_artifact',
      created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')),
      user_id TEXT DEFAULT '', workspace_id TEXT DEFAULT 'local',
      UNIQUE(user_id, workspace_id, id), UNIQUE(user_id, workspace_id, session_id, world_id)
    );
    INSERT INTO chat_sessions (id, world_id) VALUES ('session_1', 'world_1');
    INSERT INTO chat_sessions (id, world_id) VALUES ('session_empty', '');
  `)
  return db
}

describe('会话正式编排资料 application service', () => {
  let db
  let service

  beforeEach(() => {
    db = createDb()
    service = createOrchestrationMaterialsAppService(createOrchestrationMaterialsRepository(db))
  })

  it('会话覆盖支持无世界、版本锁和清空，不覆盖世界稳定基调', () => {
    const created = service.saveOverride('session_empty', { content: '整体更温柔', expectedVersion: 0 })
    expect(created.ok).toBe(true)
    expect(created.data.narrativeOverride).toMatchObject({ worldId: '', content: '整体更温柔', version: 1 })

    const stale = service.saveOverride('session_empty', { content: '陈旧覆盖', expectedVersion: 0 })
    expect(stale).toMatchObject({ ok: false, status: 409 })
    expect(service.saveOverride('session_empty', { content: '', expectedVersion: 1 })).toMatchObject({ ok: true, data: { narrativeOverride: null } })
  })

  it('最近情境必须关联正式锚点或 artifact，旧缓存不能直接升格', () => {
    expect(service.saveState('session_1', { scenarioCode: 'reunion', expectedVersion: 0 })).toMatchObject({ ok: false, status: 400 })
    const saved = service.saveState('session_1', {
      scenarioCode: 'reunion', scenarioSummary: '故人重逢', anchorMessageId: '101', expectedVersion: 0
    })
    expect(saved.data.state).toMatchObject({ scenarioCode: 'reunion', anchorMessageId: '101', version: 1 })
  })

  it('最近情境依赖快照经服务端清洗后可持久化并随版本更新', () => {
    const created = service.saveState('session_1', {
      scenarioCode: 'reunion',
      anchorMessageId: '101',
      expectedVersion: 0,
      dependencySnapshot: {
        fingerprint: 'fp-v1',
        values: { curtain: 'v1', presence: 2, enabled: true, nullable: null, nested: { ignored: true } }
      }
    })
    expect(created.ok).toBe(true)
    expect(JSON.parse(created.data.state.dependencySnapshotJson)).toEqual({
      fingerprint: 'fp-v1',
      values: { curtain: 'v1', enabled: true, nullable: null, presence: 2 }
    })

    const updated = service.saveState('session_1', {
      scenarioCode: 'reunion',
      anchorMessageId: '102',
      expectedVersion: 1,
      dependencySnapshot: { fingerprint: 'fp-v2', values: { curtain: 'v2' } }
    })
    expect(updated.data.state).toMatchObject({ version: 2, anchorMessageId: '102' })
    expect(JSON.parse(service.getBundle('session_1').data.state.dependencySnapshotJson)).toEqual({
      fingerprint: 'fp-v2', values: { curtain: 'v2' }
    })
  })

  it('切换世界只切编排资料分区，挂回原世界恢复原资料', () => {
    expect(service.saveOverride('session_1', { content: '世界一覆盖', expectedVersion: 0 }).ok).toBe(true)
    db.prepare('UPDATE chat_sessions SET world_id = ? WHERE id = ?').run('world_2', 'session_1')
    expect(service.getBundle('session_1').data.narrativeOverride).toBeNull()
    expect(service.saveOverride('session_1', { content: '世界二覆盖', expectedVersion: 0 }).ok).toBe(true)
    db.prepare('UPDATE chat_sessions SET world_id = ? WHERE id = ?').run('world_1', 'session_1')
    expect(service.getBundle('session_1').data.narrativeOverride).toMatchObject({ content: '世界一覆盖' })
  })

})
