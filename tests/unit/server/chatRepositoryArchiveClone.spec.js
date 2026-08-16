import initSqlJs from 'sql.js'
import { describe, expect, it, vi } from 'vitest'

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

function createArchiveCloneTables(db) {
  db.exec(`
    CREATE TABLE chat_sessions (
      id TEXT NOT NULL,
      target_id TEXT NOT NULL,
      target_type TEXT NOT NULL,
      title TEXT DEFAULT '',
      conversation_avatar_path TEXT DEFAULT '',
      conversation_emoji TEXT DEFAULT '',
      summary TEXT DEFAULT '',
      last_summary_time TEXT DEFAULT '',
      context_summary TEXT DEFAULT '',
      is_archived INTEGER DEFAULT 0,
      archive_name TEXT DEFAULT '',
      archive_category TEXT DEFAULT '',
      linked_archive_id TEXT DEFAULT '',
      source_target_id TEXT DEFAULT '',
      created_at TEXT DEFAULT '',
      loaded_summary_ids TEXT DEFAULT '[]',
      virtual_scene_name TEXT DEFAULT '',
      virtual_scene_desc TEXT DEFAULT '',
      virtual_location_large TEXT DEFAULT '',
      virtual_location_middle TEXT DEFAULT '',
      virtual_location_small TEXT DEFAULT '',
      virtual_location TEXT DEFAULT '',
      virtual_scene_world_id TEXT DEFAULT '',
      virtual_location_sheet_id TEXT DEFAULT '',
      virtual_location_feature_id TEXT DEFAULT '',
      virtual_real_location TEXT DEFAULT '',
      virtual_time TEXT DEFAULT '',
      virtual_time_anchor INTEGER DEFAULT 0,
      virtual_time_base INTEGER DEFAULT 0,
      virtual_time_rate REAL DEFAULT 1,
      virtual_weather TEXT DEFAULT '',
      virtual_weather_mode TEXT DEFAULT 'real',
      bound_alias TEXT DEFAULT '',
      narration_frequency TEXT DEFAULT 'standard',
      narration_temperature TEXT DEFAULT 'standard',
      narration_profiles TEXT DEFAULT '[]',
      chat_font_scale REAL DEFAULT 1,
      dynamic_world_enabled INTEGER DEFAULT 0,
      reply_pipeline_mode TEXT DEFAULT 'normal_recall',
      temp_model TEXT DEFAULT '',
      temp_preset TEXT DEFAULT '',
      updated_at TEXT DEFAULT '',
      user_id TEXT DEFAULT '',
      workspace_id TEXT DEFAULT 'local',
      UNIQUE(user_id, workspace_id, id)
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
      user_id TEXT DEFAULT '',
      workspace_id TEXT DEFAULT 'local',
      UNIQUE(user_id, workspace_id, id),
      UNIQUE(user_id, workspace_id, session_id, participant_target_id, participant_type)
    );

    CREATE TABLE chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      message_kind TEXT DEFAULT 'chat',
      content TEXT NOT NULL,
      name TEXT DEFAULT '',
      time TEXT DEFAULT '',
      env_date TEXT DEFAULT '',
      env_weather TEXT DEFAULT '',
      env_location TEXT DEFAULT '',
      image TEXT DEFAULT '',
      model TEXT DEFAULT '',
      crowd_name TEXT DEFAULT '',
      member_name TEXT DEFAULT '',
      narration_profile_id TEXT DEFAULT '',
      narration_profile_name TEXT DEFAULT '',
      narration_profile_kind TEXT DEFAULT '',
      include_in_context INTEGER DEFAULT 1,
      message_source_kind TEXT DEFAULT '',
      focused_action_group_id TEXT DEFAULT '',
      focused_action_visibility TEXT DEFAULT '',
      versions_json TEXT DEFAULT '[]',
      active_version_index INTEGER DEFAULT 0,
      attachments_json TEXT DEFAULT '',
      turn_stream_json TEXT DEFAULT '',
      created_at TEXT DEFAULT '',
      auto_write_hidden INTEGER DEFAULT 0,
      auto_write_hidden_at TEXT DEFAULT '',
      auto_write_batch_id TEXT DEFAULT '',
      auto_write_hidden_reason TEXT DEFAULT '',
      user_id TEXT DEFAULT '',
      workspace_id TEXT DEFAULT 'local'
    );

    CREATE TABLE chat_prompt_logs (
      id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      page_index INTEGER DEFAULT 1,
      entry_index INTEGER DEFAULT 0,
      assistant_message_id INTEGER DEFAULT 0,
      speaker_name TEXT DEFAULT '',
      target_id TEXT DEFAULT '',
      final_prompt TEXT DEFAULT '',
      prompt_blocks_json TEXT DEFAULT '[]',
      created_at TEXT DEFAULT '',
      user_id TEXT DEFAULT '',
      workspace_id TEXT DEFAULT 'local',
      UNIQUE(user_id, workspace_id, id)
    );

    CREATE TABLE chat_recall_activity_logs (
      id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      page_index INTEGER DEFAULT 1,
      entry_index INTEGER DEFAULT 0,
      input_message_id INTEGER DEFAULT 0,
      assistant_message_id INTEGER DEFAULT 0,
      speaker_name TEXT DEFAULT '',
      target_id TEXT DEFAULT '',
      run_id TEXT DEFAULT '',
      status TEXT DEFAULT 'completed',
      activity_json TEXT DEFAULT '{}',
      created_at TEXT DEFAULT '',
      user_id TEXT DEFAULT '',
      workspace_id TEXT DEFAULT 'local',
      UNIQUE(user_id, workspace_id, id)
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
      workspace_id TEXT DEFAULT 'local',
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
      workspace_id TEXT DEFAULT 'local',
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
      workspace_id TEXT DEFAULT 'local',
      UNIQUE(user_id, workspace_id, id)
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
      user_id TEXT DEFAULT '',
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
      user_id TEXT DEFAULT '',
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
      user_id TEXT DEFAULT '',
      workspace_id TEXT DEFAULT 'local',
      UNIQUE(user_id, workspace_id, id)
    );
  `)
}

describe('chatRepository archive clone', () => {
  it('创建会话兜底参与者时不使用带括号的 SQL 时间函数', () => {
    const prepared = []
    const db = {
      prepare: vi.fn((sql) => {
        const stmt = {
          run: vi.fn(() => ({ changes: 1 })),
          get: vi.fn(),
          all: vi.fn(() => [])
        }
        prepared.push({ sql, stmt })
        return stmt
      })
    }
    const repository = createChatRepository(db)

    repository.upsertSession('session_a', {
      targetId: 'char_a',
      targetType: 'char',
      title: '新会话',
      conversationAvatarPath: '',
      conversationEmoji: '',
      summary: '',
      lastSummaryTime: '',
      loadedSummaryIds: '[]',
      contextSummary: '',
      updatedAt: '2026-04-29T01:00:00.000Z',
      virtualSceneName: '',
      virtualSceneDesc: '',
      virtualLocation: '',
      virtualTime: '',
      virtualTimeAnchor: 0,
      virtualTimeBase: 0,
      virtualTimeRate: 1,
      virtualWeather: '',
      virtualWeatherMode: 'real',
      boundAlias: '',
      tempModel: '',
      tempPreset: '',
      linkedArchiveId: ''
    })

    const participantInsert = prepared.find((item) => (
      item.sql.includes('INSERT OR IGNORE INTO chat_session_participants')
    ))
    expect(participantInsert?.sql).not.toContain("datetime('now')")
    expect(participantInsert?.stmt.run).toHaveBeenCalledWith(
      'participant_session_a_0',
      'session_a',
      'char_a',
      'char',
      0,
      'member',
      expect.any(String),
      expect.any(String)
    )
  })

  it('写入归档会话时列和值数量保持一致', async () => {
    const { db } = await createSqlJsWrapper()
    createArchiveCloneTables(db)
    const repository = createChatRepository(db)

    repository.insertArchivedSession({
      id: 'archive_1',
      targetId: 'char_1',
      targetType: 'char',
      archiveName: '旧聊天',
      archiveCategory: 'manual',
      linkedArchiveId: 'archive_1',
      sourceTargetId: 'char_1',
      createdAt: '2026-05-16T01:00:00.000Z',
      loadedSummaryIds: '["summary_1"]',
      virtualSceneName: '雨夜',
      virtualSceneDesc: '窗外有雨声',
      virtualLocation: '旧地点',
      virtualLocationLarge: '城内',
      virtualLocationMiddle: '书房',
      virtualLocationSmall: '窗边',
      virtualRealLocation: '现实房间',
      virtualTime: '夜晚',
      virtualTimeAnchor: 123,
      virtualTimeBase: 456,
      virtualTimeRate: 1.5,
      virtualWeather: '雨',
      virtualWeatherMode: 'virtual',
      boundAlias: '星依',
      narrationFrequency: 'low',
      narrationTemperature: 'quiet',
      narrationProfiles: '[{"id":"narrator"}]',
      dynamicWorldEnabled: true,
      replyPipelineMode: 'caps_network',
      tempModel: 'model_a',
      tempPreset: 'preset_a',
      updatedAt: '2026-05-16T02:00:00.000Z'
    })

    expect(db.prepare(`
      SELECT id, target_id, is_archived, archive_name, virtual_location, virtual_location_large, virtual_location_middle, virtual_location_small, dynamic_world_enabled, reply_pipeline_mode, temp_model, temp_preset
      FROM chat_sessions
      WHERE id = ?
    `).get('archive_1')).toEqual({
      id: 'archive_1',
      target_id: 'char_1',
      is_archived: 1,
      archive_name: '旧聊天',
      virtual_location: '城内 / 书房 / 窗边',
      virtual_location_large: '城内',
      virtual_location_middle: '书房',
      virtual_location_small: '窗边',
      dynamic_world_enabled: 1,
      reply_pipeline_mode: 'normal_recall',
      temp_model: 'model_a',
      temp_preset: 'preset_a'
    })
    expect(db.prepare(`
      SELECT session_id, participant_target_id, participant_type, role
      FROM chat_session_participants
      WHERE session_id = ?
    `).get('archive_1')).toEqual({
      session_id: 'archive_1',
      participant_target_id: 'char_1',
      participant_type: 'char',
      role: 'member'
    })
  })

  it('写入消息时保留提示词隐藏字段', async () => {
    const { db } = await createSqlJsWrapper()
    createArchiveCloneTables(db)
    const repository = createChatRepository(db)

    repository.insertMessage('session_a', {
      role: 'assistant',
      messageKind: 'narration',
      content: '只给屏幕看的灯影旁白。',
      name: '旁白',
      time: '',
      envDate: '',
      envWeather: '',
      envLocation: '',
      image: '',
      model: '',
      crowdName: '',
      memberName: '旁白',
      narrationProfileId: 'custom_lamp',
      narrationProfileName: '灯影',
      narrationProfileKind: 'custom',
      includeInContext: false,
      messageSourceKind: 'focused_action',
      focusedActionGroupId: 'focused-action:session_a:1',
      focusedActionVisibility: 'private',
      versionsJson: '[]',
      activeVersionIndex: 0,
      createdAt: '2026-05-16T01:00:00.000Z',
      autoWriteHidden: true,
      autoWriteHiddenAt: '2026-05-16T01:00:00.000Z',
      autoWriteBatchId: 'manual',
      autoWriteHiddenReason: 'narration_profile_excluded'
    })

    expect(db.prepare(`
      SELECT narration_profile_id, narration_profile_name, narration_profile_kind, include_in_context,
             message_source_kind, focused_action_group_id, focused_action_visibility,
             auto_write_hidden, auto_write_hidden_at, auto_write_batch_id, auto_write_hidden_reason
      FROM chat_messages
      WHERE session_id = ?
    `).get('session_a')).toEqual({
      narration_profile_id: 'custom_lamp',
      narration_profile_name: '灯影',
      narration_profile_kind: 'custom',
      include_in_context: 0,
      message_source_kind: 'focused_action',
      focused_action_group_id: 'focused-action:session_a:1',
      focused_action_visibility: 'private',
      auto_write_hidden: 1,
      auto_write_hidden_at: '2026-05-16T01:00:00.000Z',
      auto_write_batch_id: 'manual',
      auto_write_hidden_reason: 'narration_profile_excluded'
    })
  })

  it('原子批量写消息时保序，任一写入失败则整体回滚', async () => {
    const { db } = await createSqlJsWrapper()
    createArchiveCloneTables(db)
    const repository = createChatRepository(db)
    const base = {
      messageKind: 'chat',
      name: '',
      time: '',
      envDate: '',
      envWeather: '',
      envLocation: '',
      image: '',
      model: '',
      crowdName: '',
      memberName: '',
      createdAt: '2026-07-16T01:00:00.000Z'
    }

    expect(repository.insertMessagesAtomic('session_a', [
      { ...base, role: 'user', content: '第一条' },
      { ...base, role: 'assistant', content: '第二条' }
    ])).toEqual({ count: 2 })
    expect(db.prepare('SELECT role, content FROM chat_messages WHERE session_id = ? ORDER BY id ASC').all('session_a')).toEqual([
      { role: 'user', content: '第一条' },
      { role: 'assistant', content: '第二条' }
    ])

    expect(() => repository.insertMessagesAtomic('session_b', [
      { ...base, role: 'user', content: '不会残留' },
      { ...base, role: null, content: '触发约束失败' }
    ])).toThrow()
    expect(db.prepare('SELECT COUNT(*) AS total FROM chat_messages WHERE session_id = ?').get('session_b')).toEqual({ total: 0 })

    expect(() => repository.transaction(() => {
      repository.ensureSession('session_new', 'char_new', 'char')
      repository.insertMessages('session_new', [
        { ...base, role: 'user', content: '仍不会残留' },
        { ...base, role: null, content: '连新会话一起回滚' }
      ])
    })).toThrow()
    expect(db.prepare('SELECT COUNT(*) AS total FROM chat_sessions WHERE id = ?').get('session_new')).toEqual({ total: 0 })
    expect(db.prepare('SELECT COUNT(*) AS total FROM chat_messages WHERE session_id = ?').get('session_new')).toEqual({ total: 0 })
  })

  it('六组批量读取在 120 个会话下保持固定查询数', async () => {
    const { db } = await createSqlJsWrapper()
    createArchiveCloneTables(db)
    const prepare = vi.fn((sql) => db.prepare(sql))
    const repository = createChatRepository({ exec: db.exec, prepare })
    const sessionIds = Array.from({ length: 120 }, (_, index) => `session_${index}`)

    repository.getSessionsByIds(sessionIds)
    repository.getMessagesBySessionIds(sessionIds)
    repository.listMessageProjectionsBySessionIds(sessionIds)
    repository.listMessageProjectionVisibilityBySessionIds(sessionIds)
    repository.listVisibleMessageProjectionsForCharacterBySessionIds(sessionIds, 'char_1')
    repository.listSessionParticipantsBySessionIds(sessionIds)

    expect(prepare).toHaveBeenCalledTimes(6)
  })

  it('写入消息时落库图片附件 attachments_json', async () => {
    const { db } = await createSqlJsWrapper()
    createArchiveCloneTables(db)
    const repository = createChatRepository(db)
    const attachmentsJson = JSON.stringify([{ id: 'attach_1', kind: 'image', url: '/chat-images/attach_1.png', mime: 'image/png' }])

    repository.insertMessage('session_a', {
      role: 'user',
      content: '看看这张图',
      name: '',
      time: '',
      envDate: '',
      envWeather: '',
      envLocation: '',
      image: '',
      model: '',
      crowdName: '',
      memberName: '',
      attachmentsJson,
      createdAt: '2026-07-11T01:00:00.000Z'
    })

    expect(db.prepare('SELECT attachments_json FROM chat_messages WHERE session_id = ?').get('session_a')).toEqual({
      attachments_json: attachmentsJson
    })
  })

  it('不带附件的消息落库时 attachments_json 默认落空数组，不是 undefined 绑定报错', async () => {
    const { db } = await createSqlJsWrapper()
    createArchiveCloneTables(db)
    const repository = createChatRepository(db)

    repository.insertMessage('session_a', {
      role: 'user',
      content: '普通文字消息',
      name: '',
      time: '',
      envDate: '',
      envWeather: '',
      envLocation: '',
      image: '',
      model: '',
      crowdName: '',
      memberName: '',
      createdAt: '2026-07-11T01:00:00.000Z'
    })

    expect(db.prepare('SELECT attachments_json FROM chat_messages WHERE session_id = ?').get('session_a')).toEqual({
      attachments_json: '[]'
    })
  })

  it('替换归档消息（克隆）时图片附件 attachments_json 随消息一起搬迁', async () => {
    const { db } = await createSqlJsWrapper()
    createArchiveCloneTables(db)
    const repository = createChatRepository(db)
    const attachmentsJson = JSON.stringify([{ id: 'attach_1', kind: 'image', url: '/chat-images/attach_1.png', mime: 'image/png' }])

    db.prepare(`
      INSERT INTO chat_messages (session_id, role, content, attachments_json, created_at, user_id, workspace_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run('char_1', 'user', '带图的消息', attachmentsJson, '2026-04-28T01:00:00.000Z', 'user_a', 'workspace_a')

    repository.replaceArchiveMessages('archive_1', 'char_1')

    expect(db.prepare('SELECT content, attachments_json FROM chat_messages WHERE session_id = ?').all('archive_1')).toEqual([
      { content: '带图的消息', attachments_json: attachmentsJson }
    ])
  })

  it('提示词日志列表和定位只读取仍绑定可见消息的有效日志', async () => {
    const { db } = await createSqlJsWrapper()
    createArchiveCloneTables(db)
    const repository = createChatRepository(db)
    db.prepare(`
      INSERT INTO chat_messages (
        id, session_id, role, message_kind, content, created_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(1, 'session_a', 'assistant', 'chat', '普通回复', '2026-05-11T10:00:00.000Z')
    db.prepare(`
      INSERT INTO chat_messages (
        id, session_id, role, message_kind, content, created_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(2, 'session_a', 'assistant', 'narration_debug', '是', '2026-05-11T10:01:00.000Z')
    db.prepare(`
      INSERT INTO chat_prompt_logs (
        id, session_id, assistant_message_id, final_prompt, prompt_blocks_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run('log_orphan', 'session_a', 999, '孤儿提示词', '[{"role":"system","title":"旧","content":"旧"}]', '2026-05-11T10:05:00.000Z')
    db.prepare(`
      INSERT INTO chat_prompt_logs (
        id, session_id, assistant_message_id, final_prompt, prompt_blocks_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run('log_deleted', 'session_a', 1, '已删除', '[]', '2026-05-11T10:04:00.000Z')
    db.prepare(`
      INSERT INTO chat_prompt_logs (
        id, session_id, assistant_message_id, final_prompt, prompt_blocks_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run('log_chat', 'session_a', 1, '普通聊天提示词', '[{"role":"system","title":"聊天","content":"普通聊天提示词"}]', '2026-05-11T10:03:00.000Z')
    db.prepare(`
      INSERT INTO chat_prompt_logs (
        id, session_id, assistant_message_id, final_prompt, prompt_blocks_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run('log_debug', 'session_a', 2, '旁白快判提示词', '[{"role":"system","title":"快判","content":"旁白快判提示词"}]', '2026-05-11T10:02:00.000Z')

    expect(repository.countPromptLogsBySessionId('session_a')).toBe(2)
    expect(repository.listPromptLogsBySessionId('session_a', 10, 0).map((item) => item.id)).toEqual(['log_chat', 'log_debug'])
    expect(repository.findLatestPromptLogByMessageId('session_a', 999)).toBeNull()
    expect(repository.findLatestPromptLogByMessageId('session_a', 2).id).toBe('log_debug')
    expect(repository.getPromptLogPageById('session_a', 'log_debug', 1)).toBe(2)
  })

  it('替换归档消息时清理旧范围数据并保留来源数据归属', async () => {
    const { db } = await createSqlJsWrapper()
    createArchiveCloneTables(db)
    const repository = createChatRepository(db)

    db.prepare(`
      INSERT INTO chat_messages (session_id, role, content, created_at, user_id, workspace_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('char_1', 'user', '新的正文', '2026-04-28T01:00:00.000Z', 'user_a', 'workspace_a')
    db.prepare(`
      INSERT INTO chat_messages (session_id, role, content, created_at, user_id, workspace_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('archive_1', 'user', '旧的正文', '2026-04-27T01:00:00.000Z', 'local', 'local')
    db.prepare(`
      INSERT INTO chat_prompt_logs (id, session_id, final_prompt, user_id, workspace_id)
      VALUES (?, ?, ?, ?, ?)
    `).run('prompt_1', 'char_1', '新的提示词', 'user_a', 'workspace_a')
    db.prepare(`
      INSERT INTO chat_prompt_logs (id, session_id, final_prompt, user_id, workspace_id)
      VALUES (?, ?, ?, ?, ?)
    `).run('prompt_1_archive_1', 'archive_1', '旧的提示词', 'local', 'local')

    repository.replaceArchiveMessages('archive_1', 'char_1')

    expect(db.prepare('SELECT content, user_id, workspace_id FROM chat_messages WHERE session_id = ?').all('archive_1')).toEqual([
      { content: '新的正文', user_id: 'user_a', workspace_id: 'workspace_a' }
    ])
    expect(db.prepare('SELECT id, final_prompt, user_id, workspace_id FROM chat_prompt_logs WHERE session_id = ?').all('archive_1')).toEqual([
      { id: 'prompt_1_archive_1', final_prompt: '新的提示词', user_id: 'user_a', workspace_id: 'workspace_a' }
    ])
  })
})
