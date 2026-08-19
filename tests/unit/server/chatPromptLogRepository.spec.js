import initSqlJs from 'sql.js'
import { describe, expect, it } from 'vitest'

import { createChatRepository } from '../../../server/repositories/chatRepository.ts'

async function createRepository() {
  const SQL = await initSqlJs()
  const raw = new SQL.Database()
  raw.exec(`
    CREATE TABLE chat_messages (
      id INTEGER PRIMARY KEY,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      message_kind TEXT DEFAULT 'chat',
      created_at TEXT DEFAULT '',
      user_id TEXT DEFAULT 'local',
      workspace_id TEXT DEFAULT 'local'
    );
    CREATE TABLE chat_prompt_logs (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      page_index INTEGER DEFAULT 1,
      entry_index INTEGER DEFAULT 0,
      assistant_message_id INTEGER DEFAULT 0,
      speaker_name TEXT DEFAULT '',
      target_id TEXT DEFAULT '',
      final_prompt TEXT DEFAULT '',
      prompt_blocks_json TEXT DEFAULT '[]',
      log_kind TEXT DEFAULT 'final_reply',
      created_at TEXT DEFAULT '',
      user_id TEXT DEFAULT 'local',
      workspace_id TEXT DEFAULT 'local'
    );
  `)
  const database = {
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
  return { raw, repository: createChatRepository(database) }
}

describe('chat prompt log repository', () => {
  it('pages by real assistant messages and hides internal, automatic, and embedded projection logs', async () => {
    const { raw, repository } = await createRepository()
    raw.exec(`
      INSERT INTO chat_messages (id, session_id, role, message_kind, created_at) VALUES
        (1, 'session_1', 'user', 'chat', '2026-08-17T10:00:00.000Z'),
        (2, 'session_1', 'assistant', 'chat', '2026-08-17T10:01:00.000Z'),
        (6, 'session_1', 'assistant', 'chat', '2026-08-17T10:02:00.000Z'),
        (9, 'session_1', 'assistant', 'chat', '2026-08-17T10:03:00.000Z'),
        (15, 'session_1', 'assistant', 'chat', '2026-08-17T10:04:00.000Z');

      INSERT INTO chat_prompt_logs (id, session_id, assistant_message_id, speaker_name, final_prompt, log_kind, created_at) VALUES
        ('auto_user', 'session_1', 1, '消息投影 Agent', '自动用户投影', 'message_projection', '2026-08-17T10:00:30.000Z'),
        ('reply_2', 'session_1', 2, '角色', '第二号数据库消息的最终提示词', 'final_reply', '2026-08-17T10:01:10.000Z'),
        ('auto_2', 'session_1', 2, '消息投影 Agent', '自动投影', 'message_projection', '2026-08-17T10:01:20.000Z'),
        ('reply_6', 'session_1', 6, '角色', '第六号数据库消息的最终提示词', 'final_reply', '2026-08-17T10:02:10.000Z'),
        ('planner_6', 'session_1', 6, '回复计划编排器', '内部计划', 'internal_agent', '2026-08-17T10:02:30.000Z'),
        ('reply_9', 'session_1', 9, '角色', '第九号数据库消息的最终提示词', 'final_reply', '2026-08-17T10:03:10.000Z'),
        ('manual_9', 'session_1', 9, '消息投影 Agent', '用户手动投影', 'manual_projection', '2026-08-17T10:03:20.000Z'),
        ('embedded_15', 'session_1', 15, '消息投影 Agent', '内嵌投影伪日志', 'message_projection', '2026-08-17T10:04:10.000Z');
    `)

    expect(repository.countVisiblePromptLogMessagesBySessionId('session_1')).toBe(3)
    expect(repository.listPromptLogsBySessionId('session_1', 30, 0).map((row) => row.id)).toEqual([
      'reply_9',
      'manual_9',
      'reply_6',
      'reply_2'
    ])
    expect(repository.findLatestPromptLogByMessageId('session_1', 6, 'final_reply').id).toBe('reply_6')
    expect(repository.findLatestPromptLogByMessageId('session_1', 9, 'message_projection').id).toBe('manual_9')
    expect(repository.getPromptLogPageById('session_1', 'reply_2', 2)).toBe(2)

    const indexRows = repository.listPromptLogIndexRowsBySessionId('session_1')
    expect([...new Set(indexRows.map((row) => row.assistantMessageId))]).toEqual([2, 6, 9, 15])
    expect(indexRows.find((row) => row.assistantMessageId === 15)).toEqual(expect.objectContaining({ id: null }))
    expect(indexRows.some((row) => row.id === 'planner_6' || row.id === 'embedded_15')).toBe(false)
  })

  it('preserves explicit internal and manual projection storage kinds', async () => {
    const { repository } = await createRepository()
    repository.insertPromptLog('session_1', {
      id: 'internal_1',
      pageIndex: 1,
      entryIndex: 1,
      assistantMessageId: 0,
      speakerName: '内部编排器',
      targetId: '',
      finalPrompt: '内部提示词',
      promptBlocksJson: '[]',
      logKind: 'internal_agent',
      createdAt: '2026-08-17T10:00:00.000Z'
    })
    repository.insertPromptLog('session_1', {
      id: 'manual_1',
      pageIndex: 1,
      entryIndex: 2,
      assistantMessageId: 0,
      speakerName: '消息投影 Agent',
      targetId: '',
      finalPrompt: '手动投影提示词',
      promptBlocksJson: '[]',
      logKind: 'manual_projection',
      createdAt: '2026-08-17T10:01:00.000Z'
    })

    expect(repository.findPromptLogById('session_1', 'internal_1').logKind).toBe('internal_agent')
    expect(repository.findPromptLogById('session_1', 'manual_1').logKind).toBe('manual_projection')
  })
})
