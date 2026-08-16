import initSqlJs from 'sql.js'
import { describe, expect, it } from 'vitest'

import { withDataScope } from '../../../server/localWorkspace.ts'
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

function createProjectionTables(db) {
  db.exec(`
    CREATE TABLE chat_messages (
      id INTEGER PRIMARY KEY,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      message_kind TEXT DEFAULT 'chat',
      content TEXT DEFAULT '',
      focused_action_visibility TEXT DEFAULT '',
      created_at TEXT DEFAULT '',
      user_id TEXT DEFAULT 'local',
      workspace_id TEXT DEFAULT 'local'
    );

    CREATE TABLE chat_session_participants (
      id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      participant_target_id TEXT NOT NULL,
      participant_type TEXT NOT NULL,
      display_order INTEGER DEFAULT 0,
      reply_probability INTEGER DEFAULT 100,
      role TEXT DEFAULT 'member',
      character_state_mode TEXT DEFAULT 'follow_main',
      character_branch_id TEXT DEFAULT '',
      created_at TEXT DEFAULT '',
      updated_at TEXT DEFAULT '',
      user_id TEXT DEFAULT 'local',
      workspace_id TEXT DEFAULT 'local',
      UNIQUE(user_id, workspace_id, id),
      UNIQUE(user_id, workspace_id, session_id, participant_target_id, participant_type)
    );

    CREATE TABLE chat_session_character_branches (
      id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      participant_id TEXT NOT NULL,
      character_id TEXT NOT NULL,
      source_snapshot_id TEXT DEFAULT '',
      payload_format TEXT DEFAULT 'character_snapshot_v1',
      payload_gzip BLOB NOT NULL,
      created_at TEXT DEFAULT '',
      updated_at TEXT DEFAULT '',
      user_id TEXT DEFAULT 'local',
      workspace_id TEXT DEFAULT 'local',
      UNIQUE(user_id, workspace_id, id),
      UNIQUE(user_id, workspace_id, participant_id)
    );

    CREATE TABLE chat_message_projections (
      id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      message_id INTEGER NOT NULL,
      attempt_id TEXT DEFAULT '',
      status TEXT DEFAULT 'running',
      message_kind TEXT DEFAULT 'chat',
      speaker_id TEXT DEFAULT '',
      speaker_name TEXT DEFAULT '',
      audience_ids_json TEXT DEFAULT '[]',
      audience_names_json TEXT DEFAULT '[]',
      participants_json TEXT DEFAULT '[]',
      objective_fact TEXT DEFAULT '',
      fallback_clean_text TEXT DEFAULT '',
      start_env_json TEXT DEFAULT '{}',
      end_env_json TEXT DEFAULT '{}',
      changed_json TEXT DEFAULT '{}',
      source_projection_ids_json TEXT DEFAULT '[]',
      failure_stage TEXT DEFAULT '',
      failure_reason TEXT DEFAULT '',
      created_at TEXT DEFAULT '',
      updated_at TEXT DEFAULT '',
      completed_at TEXT DEFAULT '',
      user_id TEXT DEFAULT 'local',
      workspace_id TEXT DEFAULT 'local',
      UNIQUE(user_id, workspace_id, id)
    );

    CREATE TABLE chat_message_projection_visibility (
      id TEXT NOT NULL,
      projection_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      message_id INTEGER DEFAULT 0,
      character_id TEXT NOT NULL,
      visibility TEXT DEFAULT 'visible',
      reason TEXT DEFAULT 'system',
      writeback_run_id TEXT DEFAULT '',
      created_at TEXT DEFAULT '',
      updated_at TEXT DEFAULT '',
      user_id TEXT DEFAULT 'local',
      workspace_id TEXT DEFAULT 'local',
      UNIQUE(user_id, workspace_id, id),
      UNIQUE(user_id, workspace_id, projection_id, character_id)
    );

    CREATE TABLE chat_projection_writeback_runs (
      id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      character_id TEXT NOT NULL,
      run_kind TEXT DEFAULT 'auto',
      status TEXT DEFAULT 'running',
      range_start_message_id INTEGER DEFAULT 0,
      range_end_message_id INTEGER DEFAULT 0,
      source_projection_ids_json TEXT DEFAULT '[]',
      success_event_ids_json TEXT DEFAULT '[]',
      failed_events_json TEXT DEFAULT '[]',
      error_json TEXT DEFAULT '{}',
      created_at TEXT DEFAULT '',
      updated_at TEXT DEFAULT '',
      completed_at TEXT DEFAULT '',
      user_id TEXT DEFAULT 'local',
      workspace_id TEXT DEFAULT 'default',
      UNIQUE(user_id, workspace_id, id)
    );
  `)
}

describe('chatRepository message projections', () => {
  it('writes, sorts, marks, and filters projections by character visibility', async () => {
    const { db } = await createSqlJsWrapper()
    createProjectionTables(db)
    db.prepare('INSERT INTO chat_messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)').run(1, 'session_1', 'user', '第一句', '2026-05-28T01:00:00.000Z')
    db.prepare('INSERT INTO chat_messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)').run(2, 'session_1', 'assistant', '第二句', '2026-05-28T01:01:00.000Z')

    const repository = createChatRepository(db)
    repository.upsertMessageProjection('session_1', {
      id: 'projection_2',
      messageId: 2,
      status: 'running',
      objectiveFact: '第二句事实',
      createdAt: '2026-05-28T01:01:00.000Z'
    })
    repository.upsertMessageProjection('session_1', {
      id: 'projection_1',
      messageId: 1,
      status: 'complete',
      objectiveFact: '第一句事实',
      createdAt: '2026-05-28T01:00:00.000Z'
    })

    expect(repository.listMessageProjectionsBySessionId('session_1').map((item) => item.id)).toEqual([
      'projection_1',
      'projection_2'
    ])

    repository.updateMessageProjectionStatus('session_1', 'projection_2', {
      status: 'partial',
      failureStage: 'validate',
      failureReason: '地点缺失'
    })
    expect(repository.findMessageProjectionById('session_1', 'projection_2')).toMatchObject({
      status: 'partial',
      failureStage: 'validate',
      failureReason: '地点缺失'
    })

    repository.setMessageProjectionVisibility('session_1', 'projection_1', 'char_1', 'visible', 'system')
    repository.setMessageProjectionVisibility('session_1', 'projection_2', 'char_1', 'hidden', 'manual')

    expect(repository.listVisibleMessageProjectionsForCharacter('session_1', 'char_1').map((item) => item.id)).toEqual([
      'projection_1'
    ])
  })

  it('returns only the newest visible projection for each source message', async () => {
    const { db } = await createSqlJsWrapper()
    createProjectionTables(db)
    db.prepare('INSERT INTO chat_messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)').run(1, 'session_1', 'user', '第一句', '2026-05-28T01:00:00.000Z')
    db.prepare('INSERT INTO chat_messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)').run(2, 'session_1', 'assistant', '第二句', '2026-05-28T01:01:00.000Z')

    const repository = createChatRepository(db)
    repository.upsertMessageProjection('session_1', {
      id: 'projection_1_old',
      messageId: 1,
      status: 'complete',
      objectiveFact: '第一句旧投影',
      createdAt: '2026-05-28T01:00:00.000Z'
    })
    repository.upsertMessageProjection('session_1', {
      id: 'projection_1_new',
      messageId: 1,
      status: 'complete',
      objectiveFact: '第一句新投影',
      createdAt: '2026-05-28T01:02:00.000Z'
    })
    repository.upsertMessageProjection('session_1', {
      id: 'projection_2',
      messageId: 2,
      status: 'complete',
      objectiveFact: '第二句投影',
      createdAt: '2026-05-28T01:03:00.000Z'
    })
    repository.setMessageProjectionVisibility('session_1', 'projection_1_old', 'char_1', 'visible', 'system')
    repository.setMessageProjectionVisibility('session_1', 'projection_1_new', 'char_1', 'visible', 'system')
    repository.setMessageProjectionVisibility('session_1', 'projection_2', 'char_1', 'visible', 'system')

    const visible = repository.listVisibleMessageProjectionsForCharacter('session_1', 'char_1')

    expect(visible.map((item) => item.id)).toEqual([
      'projection_1_new',
      'projection_2'
    ])
    expect(visible.map((item) => item.objectiveFact)).toEqual([
      '第一句新投影',
      '第二句投影'
    ])
  })

  it('keeps private focused-action input and narration out of every character projection history', async () => {
    const { db } = await createSqlJsWrapper()
    createProjectionTables(db)
    db.prepare('INSERT INTO chat_messages (id, session_id, role, content, focused_action_visibility, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(1, 'session_1', 'user', '观察敌人', 'private', '2026-05-28T01:00:00.000Z')
    db.prepare('INSERT INTO chat_messages (id, session_id, role, content, focused_action_visibility, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(2, 'session_1', 'assistant', '敌人的外貌描写', 'private', '2026-05-28T01:01:00.000Z')
    db.prepare('INSERT INTO chat_messages (id, session_id, role, content, focused_action_visibility, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(3, 'session_1', 'assistant', '角色看得见的公开动作', 'public', '2026-05-28T01:02:00.000Z')

    const repository = createChatRepository(db)
    for (const messageId of [1, 2, 3]) {
      repository.upsertMessageProjection('session_1', {
        id: `projection_${messageId}`,
        messageId,
        status: 'complete',
        objectiveFact: `事实${messageId}`
      })
      repository.setMessageProjectionVisibility('session_1', `projection_${messageId}`, 'char_enemy', 'visible', 'system')
    }

    expect(repository.listVisibleMessageProjectionsForCharacter('session_1', 'char_enemy').map((item) => item.id))
      .toEqual(['projection_3'])
  })

  it('ignores legacy projection rows outside the fixed local scope', async () => {
    const { db } = await createSqlJsWrapper()
    createProjectionTables(db)
    db.prepare('INSERT INTO chat_messages (id, session_id, role, content, created_at, user_id, workspace_id) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(1, 'session_1', 'user', '用户一消息', '2026-05-28T01:00:00.000Z', 'user_1', 'default')
    db.prepare('INSERT INTO chat_messages (id, session_id, role, content, created_at, user_id, workspace_id) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(2, 'session_1', 'user', '用户二消息', '2026-05-28T01:00:00.000Z', 'user_2', 'default')
    db.prepare(`
      INSERT INTO chat_message_projections (
        id, session_id, message_id, status, objective_fact, created_at, user_id, workspace_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run('projection_user_1_old', 'session_1', 1, 'complete', '用户一自己的旧投影', '2026-05-28T01:00:00.000Z', 'user_1', 'default')
    db.prepare(`
      INSERT INTO chat_message_projections (
        id, session_id, message_id, status, objective_fact, created_at, user_id, workspace_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run('projection_user_2_new', 'session_1', 1, 'complete', '用户二更新的投影', '2026-05-28T02:00:00.000Z', 'user_2', 'default')
    db.prepare(`
      INSERT INTO chat_message_projection_visibility (
        id, projection_id, session_id, message_id, character_id, visibility, reason, user_id, workspace_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('visibility_user_1_old', 'projection_user_1_old', 'session_1', 1, 'char_1', 'visible', 'system', 'user_1', 'default')
    db.prepare(`
      INSERT INTO chat_message_projection_visibility (
        id, projection_id, session_id, message_id, character_id, visibility, reason, user_id, workspace_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('visibility_user_2_new', 'projection_user_2_new', 'session_1', 1, 'char_1', 'visible', 'system', 'user_2', 'default')

    const repository = createChatRepository(db)
    const visible = withDataScope({ userId: 'user_1', role: 'user', workspaceId: 'default' }, () => (
      repository.listVisibleMessageProjectionsForCharacter('session_1', 'char_1')
    ))

    expect(visible).toEqual([])
  })

  it('hides earlier projections for newly joined characters and clears deleted message projections', async () => {
    const { db } = await createSqlJsWrapper()
    createProjectionTables(db)
    db.prepare('INSERT INTO chat_messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)').run(1, 'session_1', 'user', '第一句', '2026-05-28T01:00:00.000Z')
    db.prepare('INSERT INTO chat_messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)').run(2, 'session_1', 'assistant', '第二句', '2026-05-28T01:01:00.000Z')
    db.prepare(`
      INSERT INTO chat_session_participants (
        id, session_id, participant_target_id, participant_type, display_order, role, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run('participant_session_1_char_a', 'session_1', 'char_a', 'char', 0, 'member', '2026-05-28T01:00:00.000Z', '2026-05-28T01:00:00.000Z')

    const repository = createChatRepository(db)
    repository.upsertMessageProjection('session_1', { id: 'projection_1', messageId: 1, status: 'complete' })
    repository.upsertMessageProjection('session_1', { id: 'projection_2', messageId: 2, status: 'complete' })
    repository.upsertProjectionWritebackRun({
      id: 'writeback_1',
      sessionId: 'session_1',
      characterId: 'char_a',
      status: 'complete',
      sourceProjectionIdsJson: JSON.stringify(['projection_1'])
    })

    repository.replaceSessionParticipants('session_1', [
      {
        id: 'participant_session_1_char_a',
        participantTargetId: 'char_a',
        participantType: 'char',
        displayOrder: 0,
        role: 'member',
        createdAt: '2026-05-28T01:00:00.000Z',
        updatedAt: '2026-05-28T01:02:00.000Z'
      },
      {
        id: 'participant_session_1_char_b',
        participantTargetId: 'char_b',
        participantType: 'char',
        displayOrder: 1,
        replyProbability: 0,
        role: 'member',
        createdAt: '2026-05-28T01:02:00.000Z',
        updatedAt: '2026-05-28T01:02:00.000Z'
      }
    ])

    expect(repository.listSessionParticipants('session_1')).toEqual(expect.arrayContaining([
      expect.objectContaining({ participantTargetId: 'char_b', replyProbability: 0 })
    ]))

    expect(repository.listMessageProjectionVisibilityBySessionId('session_1')).toEqual([
      expect.objectContaining({ projectionId: 'projection_1', characterId: 'char_b', visibility: 'hidden', reason: 'joined_after_projection' }),
      expect.objectContaining({ projectionId: 'projection_2', characterId: 'char_b', visibility: 'hidden', reason: 'joined_after_projection' })
    ])

    const result = repository.deleteMessageBySession('1', 'session_1')
    expect(result).toBeUndefined()
    expect(repository.listMessageProjectionsBySessionId('session_1').map((item) => item.id)).toEqual(['projection_2'])
    expect(repository.listMessageProjectionVisibilityBySessionId('session_1')).toEqual([
      expect.objectContaining({ projectionId: 'projection_2', characterId: 'char_b' })
    ])
    expect(repository.getAllProjectionWritebackRuns()).toEqual([])
  })
})
