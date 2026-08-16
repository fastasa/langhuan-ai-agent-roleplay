import initSqlJs from 'sql.js'
import { describe, expect, it } from 'vitest'

import { createWorkspaceSnapshotMigrationRepository } from '../../../server/repositories/workspaceSnapshotMigrationRepository.js'

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

function createTables(db) {
  db.exec(`
    CREATE TABLE characters (
      id TEXT NOT NULL,
      avatar_path TEXT DEFAULT '',
      user_id TEXT DEFAULT '',
      workspace_id TEXT DEFAULT 'default',
      UNIQUE(user_id, workspace_id, id)
    );

    CREATE TABLE uploads (
      upload_id TEXT PRIMARY KEY,
      owner_user_id TEXT DEFAULT '',
      workspace_id TEXT DEFAULT 'default',
      business_type TEXT DEFAULT '',
      business_id TEXT DEFAULT '',
      stored_path TEXT DEFAULT '',
      review_status TEXT DEFAULT '',
      created_at TEXT DEFAULT ''
    );

    CREATE TABLE chat_sessions (
      id TEXT NOT NULL,
      target_id TEXT NOT NULL,
      target_type TEXT NOT NULL,
      loaded_summary_ids TEXT DEFAULT '[]',
      reply_pipeline_mode TEXT DEFAULT 'normal_recall',
      virtual_location TEXT DEFAULT '',
      virtual_time TEXT DEFAULT '',
      updated_at TEXT DEFAULT '',
      user_id TEXT DEFAULT '',
      workspace_id TEXT DEFAULT 'default',
      UNIQUE(user_id, workspace_id, id)
    );

    CREATE TABLE chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      content TEXT DEFAULT '',
      user_id TEXT DEFAULT '',
      workspace_id TEXT DEFAULT 'default'
    );

    CREATE TABLE summary_library (
      id TEXT NOT NULL,
      content TEXT DEFAULT '',
      user_id TEXT DEFAULT '',
      workspace_id TEXT DEFAULT 'default',
      UNIQUE(user_id, workspace_id, id)
    );

    CREATE TABLE small_summaries (
      id TEXT NOT NULL,
      content TEXT DEFAULT '',
      user_id TEXT DEFAULT '',
      workspace_id TEXT DEFAULT 'default',
      UNIQUE(user_id, workspace_id, id)
    );

    CREATE TABLE big_summaries (
      id TEXT NOT NULL,
      content TEXT DEFAULT '',
      user_id TEXT DEFAULT '',
      workspace_id TEXT DEFAULT 'default',
      UNIQUE(user_id, workspace_id, id)
    );
  `)
}

describe('workspaceSnapshotMigrationRepository scoped migration helpers', () => {
  it('updates character avatars only inside the matching owner scope', async () => {
    const { db } = await createSqlJsWrapper()
    createTables(db)
    const repository = createWorkspaceSnapshotMigrationRepository(db)

    db.prepare('INSERT INTO characters (id, avatar_path, user_id, workspace_id) VALUES (?, ?, ?, ?)').run('char_same', 'old-a', 'user_a', 'default')
    db.prepare('INSERT INTO characters (id, avatar_path, user_id, workspace_id) VALUES (?, ?, ?, ?)').run('char_same', 'old-b', 'user_b', 'default')

    repository.updateCharacterAvatarPath('char_same', 'new-b', 'user_b', 'default')

    expect(db.prepare('SELECT avatar_path FROM characters WHERE id = ? AND user_id = ?').get('char_same', 'user_a').avatar_path).toBe('old-a')
    expect(db.prepare('SELECT avatar_path FROM characters WHERE id = ? AND user_id = ?').get('char_same', 'user_b').avatar_path).toBe('new-b')
  })

  it('finds the latest local character avatar upload', async () => {
    const { db } = await createSqlJsWrapper()
    createTables(db)
    const repository = createWorkspaceSnapshotMigrationRepository(db)

    db.prepare('INSERT INTO uploads (upload_id, owner_user_id, workspace_id, business_type, business_id, stored_path, review_status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run('u_old', 'user_a', 'default', 'avatar', 'character_char_same', 'avatars/old.jpg', 'approved', '2026-05-01T00:00:00.000Z')
    db.prepare('INSERT INTO uploads (upload_id, owner_user_id, workspace_id, business_type, business_id, stored_path, review_status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run('u_new', 'user_a', 'default', 'avatar', 'character_char_same', 'avatars/new.jpg', 'approved', '2026-05-02T00:00:00.000Z')
    db.prepare('INSERT INTO uploads (upload_id, owner_user_id, workspace_id, business_type, business_id, stored_path, review_status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run('u_other_user', 'user_b', 'default', 'avatar', 'character_user_b_char_same', 'avatars/other.jpg', 'approved', '2026-05-03T00:00:00.000Z')

    const latest = repository.getLatestCharacterAvatarUpload('char_same', 'user_a', 'default')

    expect(latest?.stored_path).toBe('avatars/new.jpg')
    expect(repository.getUploadCreatedAtByStoredPath('/avatars/old.jpg', 'user_a', 'default')).toBe('2026-05-01T00:00:00.000Z')
  })

  it('moves and deletes legacy sessions only inside the matching owner scope', async () => {
    const { db } = await createSqlJsWrapper()
    createTables(db)
    const repository = createWorkspaceSnapshotMigrationRepository(db)

    for (const userId of ['user_a', 'user_b']) {
      db.prepare('INSERT INTO chat_sessions (id, target_id, target_type, user_id, workspace_id) VALUES (?, ?, ?, ?, ?)').run('group_group_same', 'group_group_same', 'group', userId, 'default')
      db.prepare('INSERT INTO chat_sessions (id, target_id, target_type, user_id, workspace_id) VALUES (?, ?, ?, ?, ?)').run('group_same', 'group_same', 'group', userId, 'default')
      db.prepare('INSERT INTO chat_messages (session_id, content, user_id, workspace_id) VALUES (?, ?, ?, ?)').run('group_group_same', `${userId}-message`, userId, 'default')
    }

    repository.moveChatMessagesToSession('group_same', 'group_group_same', 'user_b', 'default')
    repository.deleteChatSession('group_group_same', 'user_b', 'default')

    expect(db.prepare('SELECT COUNT(*) AS count FROM chat_sessions WHERE id = ? AND user_id = ?').get('group_group_same', 'user_a').count).toBe(1)
    expect(db.prepare('SELECT COUNT(*) AS count FROM chat_sessions WHERE id = ? AND user_id = ?').get('group_group_same', 'user_b').count).toBe(0)
    expect(db.prepare('SELECT session_id FROM chat_messages WHERE user_id = ?').get('user_a').session_id).toBe('group_group_same')
    expect(db.prepare('SELECT session_id FROM chat_messages WHERE user_id = ?').get('user_b').session_id).toBe('group_same')
  })

  it('checks loaded summary ids only inside the matching owner scope', async () => {
    const { db } = await createSqlJsWrapper()
    createTables(db)
    const repository = createWorkspaceSnapshotMigrationRepository(db)

    db.prepare('INSERT INTO summary_library (id, content, user_id, workspace_id) VALUES (?, ?, ?, ?)').run('legacy_small_same', 'A summary', 'user_a', 'default')

    expect(repository.hasSummaryRecordId('legacy_small_same', 'user_a', 'default')).toBe(true)
    expect(repository.hasSummaryRecordId('legacy_small_same', 'user_b', 'default')).toBe(false)
  })
})
