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

function createMessageTable(db) {
  db.exec(`
    CREATE TABLE chat_messages (
      id INTEGER PRIMARY KEY,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      message_kind TEXT DEFAULT 'chat',
      content TEXT NOT NULL,
      name TEXT DEFAULT '',
      member_name TEXT DEFAULT '',
      created_at TEXT DEFAULT ''
    );
  `)
}

describe('chatRepository display messages', () => {
  it('导出会话元数据时保留纯净回复双字段', async () => {
    const { db } = await createSqlJsWrapper()
    db.exec(`
      CREATE TABLE chat_sessions (
        id TEXT PRIMARY KEY,
        target_id TEXT DEFAULT '',
        reply_pipeline_mode TEXT DEFAULT 'normal_recall',
        updated_at TEXT DEFAULT ''
      );
    `)
    db.prepare(`
      INSERT INTO chat_sessions (id, target_id, reply_pipeline_mode, updated_at)
      VALUES (?, ?, ?, ?)
    `).run('session_1', 'char_1', 'pure_prompt', '2026-05-27T10:00:00.000Z')

    const repository = createChatRepository(db)
    const sessions = repository.getAllSessions()

    expect(sessions[0]).toMatchObject({
      id: 'session_1',
      replyPipelineMode: 'pure_prompt',
      reply_pipeline_mode: 'pure_prompt'
    })
  })

  it('默认完整展示读取保留全部调试信息', async () => {
    const { db } = await createSqlJsWrapper()
    createMessageTable(db)
    const insert = db.prepare(`
      INSERT INTO chat_messages (id, session_id, role, message_kind, content, name, member_name, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)
    insert.run(1, 'session_1', 'user', 'chat', '第一条普通消息', '', '', '2026-05-21T00:00:01.000Z')
    insert.run(2, 'session_1', 'assistant', 'narration_debug', '旧调试 A', '', '', '2026-05-21T00:00:02.000Z')
    insert.run(3, 'session_1', 'assistant', 'chat', '第二条普通消息', '', '', '2026-05-21T00:00:03.000Z')
    insert.run(4, 'session_1', 'assistant', 'narration_debug', '新调试 B', '', '', '2026-05-21T00:00:04.000Z')
    insert.run(5, 'session_1', 'assistant', 'chat', '第三条普通消息', '', '', '2026-05-21T00:00:05.000Z')
    insert.run(6, 'session_1', 'assistant', 'chat', '旧说话人调试', '旁白调试', '', '2026-05-21T00:00:06.000Z')
    insert.run(7, 'session_1', 'assistant', 'narration_debug', '新调试 C', '', '', '2026-05-21T00:00:07.000Z')

    const repository = createChatRepository(db)
    const messages = repository.getDisplayMessagesBySessionId('session_1')

    expect(messages.map((item) => item.id)).toEqual([1, 2, 3, 4, 5, 6, 7])
  })

  it('分页读取按 id 游标返回更早消息并保留调试信息', async () => {
    const { db } = await createSqlJsWrapper()
    createMessageTable(db)
    const insert = db.prepare(`
      INSERT INTO chat_messages (id, session_id, role, message_kind, content, name, member_name, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)
    for (let id = 1; id <= 7; id += 1) {
      insert.run(
        id,
        'session_1',
        id % 2 === 0 ? 'assistant' : 'user',
        id % 2 === 0 ? 'narration_debug' : 'chat',
        `消息 ${id}`,
        '',
        '',
        `2026-05-21T00:00:0${id}.000Z`
      )
    }

    const repository = createChatRepository(db)
    const latestPage = repository.getMessagePageBySessionId('session_1', { limit: 3 })
    const olderPage = repository.getMessagePageBySessionId('session_1', { limit: 3, beforeId: 5 })

    expect(latestPage.messages.map((item) => item.id)).toEqual([5, 6, 7])
    expect(latestPage.hasMore).toBe(true)
    expect(olderPage.messages.map((item) => item.id)).toEqual([2, 3, 4])
    expect(olderPage.hasMore).toBe(true)
  })
})
