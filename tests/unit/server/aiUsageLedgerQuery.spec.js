import initSqlJs from 'sql.js'
import { describe, expect, it } from 'vitest'

import { createAiRepository } from '../../../server/repositories/aiRepository.js'

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

function createUsageTables(db) {
  db.exec(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      email TEXT DEFAULT '',
      display_name TEXT DEFAULT ''
    );

    CREATE TABLE ai_usage_ledger (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      preset_id TEXT DEFAULT '',
      preset_name TEXT DEFAULT '',
      feature TEXT DEFAULT 'chat',
      session_id TEXT DEFAULT '',
      session_label TEXT DEFAULT '',
      round_id TEXT DEFAULT '',
      unit_kind TEXT DEFAULT '',
      usage_label TEXT DEFAULT '',
      place_label TEXT DEFAULT '',
      profile_id TEXT DEFAULT '',
      provider_kind TEXT DEFAULT '',
      harness_run_id TEXT DEFAULT '',
      model_turn_index INTEGER DEFAULT 0,
      tool_epoch INTEGER DEFAULT 0,
      tool_epoch_turn_index INTEGER DEFAULT 0,
      prompt_rebuild INTEGER DEFAULT 0,
      active_tool_names_hash TEXT DEFAULT '',
      tool_schema_hash TEXT DEFAULT '',
      system_hash TEXT DEFAULT '',
      message_prefix_hash TEXT DEFAULT '',
      request_envelope_hash TEXT DEFAULT '',
      first_diff_source TEXT DEFAULT '',
      model TEXT DEFAULT '',
      input_tokens INTEGER DEFAULT 0,
      output_tokens INTEGER DEFAULT 0,
      cache_read_tokens INTEGER DEFAULT 0,
      cache_creation_tokens INTEGER DEFAULT 0,
      estimated_cost_cents REAL DEFAULT 0,
      status TEXT DEFAULT 'success',
      error_code TEXT DEFAULT '',
      created_at TEXT DEFAULT ''
    );

    CREATE TABLE chat_sessions (
      id TEXT NOT NULL,
      target_id TEXT NOT NULL,
      title TEXT DEFAULT '',
      user_id TEXT DEFAULT '',
      workspace_id TEXT DEFAULT 'default'
    );

    CREATE TABLE chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT DEFAULT '',
      created_at TEXT DEFAULT '',
      user_id TEXT DEFAULT ''
    );
  `)
}

function seedUsage(db) {
  db.prepare('INSERT INTO users (id, email, display_name) VALUES (?, ?, ?)').run('user_a', 'a@example.com', '用户A')
  db.prepare('INSERT INTO users (id, email, display_name) VALUES (?, ?, ?)').run('user_b', 'b@example.com', '用户B')
  const insert = db.prepare(`
    INSERT INTO ai_usage_ledger (
      id, user_id, feature, session_id, session_label, round_id, usage_label, place_label, model, input_tokens, output_tokens, estimated_cost_cents, status, error_code, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  insert.run('today_role', 'user_a', 'role_message', 'session_a', '主线会话', 'round:session_a:1', '角色发言：星依', '会话：主线会话', 'glm-5.1', 100, 40, 0, 'success', '', '2026-05-15T03:20:00.000Z')
  insert.run('today_legacy_chat', 'user_a', 'chat', 'session_a', '主线会话', 'round:session_a:1', '角色发言：惊雨', '会话：主线会话', 'glm-5.1', 20, 10, 0, 'success', '', '2026-05-15T04:20:00.000Z')
  insert.run('yesterday_agent', 'user_a', 'agent', 'session_b', '整理会话', 'round:session_b:2', '自动写入', '会话：整理会话', 'glm-5.1', 50, 25, 0, 'failed', '402', '2026-05-14T06:00:00.000Z')
  insert.run('week_embedding', 'user_b', 'embedding', 'session_c', '召回会话', 'round:session_c:1', '召回嵌入', '会话：召回会话', 'embedding-3', 30, 0, 0, 'success', '', '2026-05-10T02:00:00.000Z')
  insert.run('old_role', 'user_a', 'role_message', 'session_a', '主线会话', 'round:session_a:0', '角色发言：星依', '会话：主线会话', 'glm-5.1', 999, 1, 0, 'success', '', '2026-04-01T00:00:00.000Z')
}

function seedChatMessages(db) {
  const insert = db.prepare('INSERT INTO chat_messages (id, session_id, role, content, created_at, user_id) VALUES (?, ?, ?, ?, ?, ?)')
  insert.run(10, 'session_d', 'user', '第一轮', '2026-05-15T01:00:00.000Z', 'user_a')
  insert.run(20, 'session_d', 'assistant', '第一轮回复', '2026-05-15T01:01:00.000Z', 'user_a')
  insert.run(30, 'session_d', 'user', '第二轮', '2026-05-15T02:00:00.000Z', 'user_a')
  insert.run(40, 'session_d', 'user', '第三轮', '2026-05-15T03:00:00.000Z', 'user_a')
}

function seedChatSessions(db) {
  const insert = db.prepare('INSERT INTO chat_sessions (id, target_id, title, user_id, workspace_id) VALUES (?, ?, ?, ?, ?)')
  insert.run('session_a', 'char_xingyi', '重命名后的主线', 'user_a', 'default')
  insert.run('session_b', 'char_agent', '整理后的会话名', 'user_a', 'default')
}

describe('ai usage ledger query', () => {
  it('filters by range, feature, status and returns summary', async () => {
    const { db } = await createSqlJsWrapper()
    createUsageTables(db)
    seedUsage(db)
    const repository = createAiRepository(db)

    const result = repository.queryUsageLedger({
      range: 'yesterday',
      feature: 'agent',
      status: 'failed',
      now: new Date('2026-05-15T12:00:00.000Z')
    })

    expect(result.items.map((item) => item.id)).toEqual(['yesterday_agent'])
    expect(result.summary).toEqual(expect.objectContaining({
      activityCount: 1,
      inputTokens: 50,
      outputTokens: 25,
      totalTokens: 75,
      averageTokens: 75
    }))
  })

  it('scopes results to the requested user without leaking other accounts', async () => {
    const { db } = await createSqlJsWrapper()
    createUsageTables(db)
    seedUsage(db)
    const repository = createAiRepository(db)

    const result = repository.queryUsageLedger({
      range: '7d',
      userId: 'user_b',
      now: new Date('2026-05-15T12:00:00.000Z')
    })

    expect(result.items.map((item) => item.id)).toEqual(['week_embedding'])
    expect(result.summary).toEqual(expect.objectContaining({
      activityCount: 1,
      totalTokens: 30,
      userCount: 1
    }))
  })

  it('returns empty rows and zero summary for empty filters', async () => {
    const { db } = await createSqlJsWrapper()
    createUsageTables(db)
    seedUsage(db)
    const repository = createAiRepository(db)

    const result = repository.queryUsageLedger({
      range: 'today',
      feature: 'write_back',
      now: new Date('2026-05-15T12:00:00.000Z')
    })

    expect(result.items).toEqual([])
    expect(result.summary).toEqual(expect.objectContaining({
      activityCount: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      averageTokens: 0
    }))
  })

  it('keeps legacy chat values visible through the role_message filter', async () => {
    const { db } = await createSqlJsWrapper()
    createUsageTables(db)
    seedUsage(db)
    const repository = createAiRepository(db)

    const result = repository.queryUsageLedger({
      range: 'today',
      feature: 'role_message',
      now: new Date('2026-05-15T12:00:00.000Z')
    })

    expect(result.filters.feature).toBe('role_message')
    expect(result.items.map((item) => item.id)).toEqual(['today_legacy_chat', 'today_role'])
    expect(result.summary).toEqual(expect.objectContaining({
      activityCount: 2,
      totalTokens: 170
    }))
  })

  it('filters by session and keeps readable session metadata', async () => {
    const { db } = await createSqlJsWrapper()
    createUsageTables(db)
    seedUsage(db)
    seedChatSessions(db)
    const repository = createAiRepository(db)

    const result = repository.queryUsageLedger({
      range: 'today',
      sessionId: 'session_a',
      now: new Date('2026-05-15T12:00:00.000Z')
    })

    expect(result.filters.sessionId).toBe('session_a')
    expect(result.items).toHaveLength(2)
    expect(result.items[0]).toEqual(expect.objectContaining({
      session_id: 'session_a',
      session_label: '重命名后的主线',
      round_id: 'round:session_a:1',
      session_round_index: 2
    }))
    expect(result.summary).toEqual(expect.objectContaining({
      activityCount: 2,
      totalTokens: 170
    }))
  })

  it('uses current chat session title in session filters instead of the old ledger label', async () => {
    const { db } = await createSqlJsWrapper()
    createUsageTables(db)
    seedUsage(db)
    seedChatSessions(db)
    const repository = createAiRepository(db)

    const sessions = repository.listUsageLedgerSessions({
      range: 'today',
      userId: 'user_a',
      now: new Date('2026-05-15T12:00:00.000Z')
    })

    expect(sessions[0]).toEqual(expect.objectContaining({
      session_id: 'session_a',
      session_label: '重命名后的主线'
    }))
  })

  it('derives round numbers from each session history instead of the round id tail', async () => {
    const { db } = await createSqlJsWrapper()
    createUsageTables(db)
    seedUsage(db)
    const repository = createAiRepository(db)

    const result = repository.queryUsageLedger({
      range: 'today',
      userId: 'user_a',
      now: new Date('2026-05-15T12:00:00.000Z')
    })

    expect(result.items.map((item) => ({
      id: item.id,
      roundId: item.round_id,
      sessionRoundIndex: item.session_round_index
    }))).toEqual([
      { id: 'today_legacy_chat', roundId: 'round:session_a:1', sessionRoundIndex: 2 },
      { id: 'today_role', roundId: 'round:session_a:1', sessionRoundIndex: 2 }
    ])
  })

  it('prefers chat message round count when the session has user turns without usage rows', async () => {
    const { db } = await createSqlJsWrapper()
    createUsageTables(db)
    seedUsage(db)
    seedChatMessages(db)
    const insert = db.prepare(`
      INSERT INTO ai_usage_ledger (
        id, user_id, feature, session_id, session_label, round_id, usage_label, place_label, model, input_tokens, output_tokens, estimated_cost_cents, status, error_code, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    insert.run('today_session_d', 'user_a', 'role_message', 'session_d', '支线会话', 'round:session_d:40', '角色发言：星依', '会话：支线会话', 'glm-5.1', 10, 5, 0, 'success', '', '2026-05-15T04:00:00.000Z')
    const repository = createAiRepository(db)

    const result = repository.queryUsageLedger({
      range: 'today',
      sessionId: 'session_d',
      userId: 'user_a',
      now: new Date('2026-05-15T12:00:00.000Z')
    })

    expect(result.items[0]).toEqual(expect.objectContaining({
      id: 'today_session_d',
      round_id: 'round:session_d:40',
      session_round_index: 3
    }))
  })

  it('stores unit_kind through insertUsageLedger and returns it in queries', async () => {
    const { db } = await createSqlJsWrapper()
    createUsageTables(db)
    const repository = createAiRepository(db)

    repository.insertUsageLedger({
      id: 'usage_regen',
      userId: 'user_a',
      presetId: 'preset_1',
      presetName: '琅嬛预设',
      feature: 'role_message',
      sessionId: 'session_a',
      sessionLabel: '主线会话',
      roundId: 'round:session_a:1',
      unitKind: 'regenerate',
      usageLabel: '重新生成：星依',
      placeLabel: '会话：主线会话',
      model: 'glm-5.1',
      inputTokens: 10,
      outputTokens: 5,
      estimatedCostCents: 0,
      status: 'success'
    })

    const result = repository.queryUsageLedger({ range: 'today', now: new Date() })
    expect(result.items[0]).toEqual(expect.objectContaining({
      id: 'usage_regen',
      unit_kind: 'regenerate',
      round_id: 'round:session_a:1'
    }))
  })

  // 缓存可见性（2026-07-07）：Claude Code 订阅桥会带 cache_read/cache_creation 拆分，
  // 别的 provider 没有就落 0；插入/查询都要原样透传，不能被 input_tokens 覆盖或吞掉。
  it('persists cache_read_tokens/cache_creation_tokens through insertUsageLedger and returns them in queries', async () => {
    const { db } = await createSqlJsWrapper()
    createUsageTables(db)
    const repository = createAiRepository(db)

    repository.insertUsageLedger({
      id: 'usage_cache_bridge',
      userId: 'user_a',
      presetId: 'preset_claude_code',
      presetName: 'Claude Code（订阅桥）',
      feature: 'agent_task',
      sessionId: 'session_a',
      sessionLabel: '主线会话',
      roundId: 'round:session_a:1',
      unitKind: 'round',
      usageLabel: 'group-director-pass',
      placeLabel: '陈星依',
      model: 'opus',
      inputTokens: 70000,
      outputTokens: 3000,
      cacheReadTokens: 65000,
      cacheCreationTokens: 4000,
      estimatedCostCents: 0,
      status: 'success'
    })

    const result = repository.queryUsageLedger({ range: 'today', now: new Date() })
    expect(result.items[0]).toEqual(expect.objectContaining({
      id: 'usage_cache_bridge',
      cache_read_tokens: 65000,
      cache_creation_tokens: 4000
    }))
  })

  it('defaults cache_read_tokens/cache_creation_tokens to 0 when the caller does not pass them (non-bridge providers)', async () => {
    const { db } = await createSqlJsWrapper()
    createUsageTables(db)
    const repository = createAiRepository(db)

    repository.insertUsageLedger({
      id: 'usage_no_cache',
      userId: 'user_a',
      presetId: 'preset_1',
      presetName: '琅嬛预设',
      feature: 'role_message',
      sessionId: 'session_a',
      roundId: 'round:session_a:1',
      model: 'glm-5.1',
      inputTokens: 100,
      outputTokens: 50,
      estimatedCostCents: 0,
      status: 'success'
    })

    const result = repository.queryUsageLedger({ range: 'today', now: new Date() })
    expect(result.items[0]).toEqual(expect.objectContaining({
      id: 'usage_no_cache',
      cache_read_tokens: 0,
      cache_creation_tokens: 0
    }))
  })

  // 缓存可见性（2026-07-07）：坞底部条要显示「本轮缓存命中量」，getUsageTotalsByRoundId 汇总时
  // 要把多条调用的 cache_read/cache_creation 一起 SUM，不能只汇总 input/output。
  it('getUsageTotalsByRoundId 汇总同一轮多条调用的缓存拆分', async () => {
    const { db } = await createSqlJsWrapper()
    createUsageTables(db)
    const repository = createAiRepository(db)

    repository.insertUsageLedger({
      id: 'usage_round_call_1',
      userId: 'user_a',
      presetId: 'preset_claude_code',
      presetName: 'Claude Code（订阅桥）',
      feature: 'agent_task',
      sessionId: 'session_a',
      roundId: 'round:session_a:1',
      unitKind: 'round',
      model: 'opus',
      inputTokens: 71529,
      outputTokens: 6545,
      cacheReadTokens: 60000,
      cacheCreationTokens: 5000,
      estimatedCostCents: 0,
      status: 'success'
    })
    repository.insertUsageLedger({
      id: 'usage_round_call_2',
      userId: 'user_a',
      presetId: 'preset_claude_code',
      presetName: 'Claude Code（订阅桥）',
      feature: 'agent_task',
      sessionId: 'session_a',
      roundId: 'round:session_a:1',
      unitKind: 'round',
      model: 'opus',
      inputTokens: 69218,
      outputTokens: 3345,
      cacheReadTokens: 65000,
      cacheCreationTokens: 0,
      estimatedCostCents: 0,
      status: 'success'
    })

    const totals = repository.getUsageTotalsByRoundId('round:session_a:1')
    expect(totals).toEqual({
      inputTokens: 140747,
      outputTokens: 9890,
      totalTokens: 150637,
      cacheReadTokens: 125000,
      cacheCreationTokens: 5000,
      callCount: 2,
      profiles: {
        directorRound: {
          inputTokens: 0,
          cacheReadTokens: 0,
          callCount: 0,
          warmInputTokens: 0,
          warmCacheReadTokens: 0,
          warmCallCount: 0
        },
        postRound: {
          inputTokens: 0,
          cacheReadTokens: 0,
          callCount: 0,
          warmInputTokens: 0,
          warmCacheReadTokens: 0,
          warmCallCount: 0
        }
      }
    })
  })

  it('getUsageTotalsByRoundId 分开统计 director/post-round，并只把同信封第二次起算作热调用', async () => {
    const { db } = await createSqlJsWrapper()
    createUsageTables(db)
    const repository = createAiRepository(db)
    const insert = (input) => repository.insertUsageLedger({
      userId: 'user_a',
      presetId: 'preset_1',
      presetName: '琅嬛预设',
      feature: 'agent',
      sessionId: 'session_a',
      roundId: 'round:session_a:cache',
      unitKind: 'round',
      providerKind: 'codex-subscription',
      model: 'gpt-5.6',
      outputTokens: 10,
      cacheCreationTokens: 0,
      estimatedCostCents: 0,
      status: 'success',
      ...input
    })
    insert({
      id: 'director_epoch0_cold',
      profileId: 'tidiao.director-round',
      harnessRunId: 'director_run',
      modelTurnIndex: 0,
      toolEpoch: 0,
      toolEpochTurnIndex: 0,
      inputTokens: 100,
      cacheReadTokens: 0
    })
    insert({
      id: 'director_epoch1_cold',
      profileId: 'tidiao.director-round',
      harnessRunId: 'director_run',
      modelTurnIndex: 1,
      toolEpoch: 1,
      toolEpochTurnIndex: 0,
      inputTokens: 200,
      cacheReadTokens: 20
    })
    insert({
      id: 'director_epoch1_warm',
      profileId: 'tidiao.director-round',
      harnessRunId: 'director_run',
      modelTurnIndex: 2,
      toolEpoch: 1,
      toolEpochTurnIndex: 1,
      inputTokens: 300,
      cacheReadTokens: 270
    })
    insert({
      id: 'post_cold',
      profileId: 'tidiao.post-round',
      harnessRunId: 'post_run',
      modelTurnIndex: 0,
      toolEpoch: 0,
      toolEpochTurnIndex: 0,
      inputTokens: 80,
      cacheReadTokens: 0
    })
    insert({
      id: 'post_warm',
      profileId: 'tidiao.post-round',
      harnessRunId: 'post_run',
      modelTurnIndex: 1,
      toolEpoch: 0,
      toolEpochTurnIndex: 1,
      inputTokens: 90,
      cacheReadTokens: 72
    })

    const totals = repository.getUsageTotalsByRoundId('round:session_a:cache')
    expect(totals.profiles.directorRound).toEqual({
      inputTokens: 600,
      cacheReadTokens: 290,
      callCount: 3,
      warmInputTokens: 300,
      warmCacheReadTokens: 270,
      warmCallCount: 1
    })
    expect(totals.profiles.postRound).toEqual({
      inputTokens: 170,
      cacheReadTokens: 72,
      callCount: 2,
      warmInputTokens: 90,
      warmCacheReadTokens: 72,
      warmCallCount: 1
    })
  })

  // P2 批 E4（2026-07-12·缓存命中可观测化）：queryUsageLedger 的 summary 要一并聚合缓存读/写量、
  // 并按 cacheHitRate = cache_read / input_tokens 计算命中率（input_tokens 已含 cache_read/cache_creation）。
  it('queryUsageLedger summary 聚合缓存读/写量并计算命中率', async () => {
    const { db } = await createSqlJsWrapper()
    createUsageTables(db)
    const repository = createAiRepository(db)

    repository.insertUsageLedger({
      id: 'usage_cache_summary_1',
      userId: 'user_a',
      presetId: 'preset_claude_code',
      presetName: 'Claude Code（订阅桥）',
      feature: 'agent_task',
      model: 'opus',
      inputTokens: 800,
      outputTokens: 50,
      cacheReadTokens: 200,
      cacheCreationTokens: 30,
      estimatedCostCents: 0,
      status: 'success'
    })
    repository.insertUsageLedger({
      id: 'usage_cache_summary_2',
      userId: 'user_a',
      presetId: 'preset_1',
      presetName: '琅嬛预设',
      feature: 'role_message',
      model: 'glm-5.1',
      inputTokens: 200,
      outputTokens: 20,
      estimatedCostCents: 0,
      status: 'success'
    })

    const result = repository.queryUsageLedger({ range: 'today', now: new Date() })
    expect(result.summary).toEqual(expect.objectContaining({
      cacheReadTokens: 200,
      cacheCreationTokens: 30,
      cacheHitRate: 0.2 // 200 / (800 + 200)
    }))
  })

  it('summarizeUsage 汇总本期缓存读/写量并计算命中率', async () => {
    const { db } = await createSqlJsWrapper()
    createUsageTables(db)
    const repository = createAiRepository(db)

    repository.insertUsageLedger({
      id: 'usage_cache_month_1',
      userId: 'user_a',
      presetId: 'preset_claude_code',
      presetName: 'Claude Code（订阅桥）',
      feature: 'agent_task',
      model: 'opus',
      inputTokens: 400,
      outputTokens: 20,
      cacheReadTokens: 100,
      cacheCreationTokens: 10,
      estimatedCostCents: 0,
      status: 'success'
    })
    repository.insertUsageLedger({
      id: 'usage_cache_month_2',
      userId: 'user_a',
      presetId: 'preset_1',
      presetName: '琅嬛预设',
      feature: 'role_message',
      model: 'glm-5.1',
      inputTokens: 100,
      outputTokens: 10,
      estimatedCostCents: 0,
      status: 'success'
    })

    const monthly = repository.summarizeUsage('user_a', 'month')
    expect(monthly).toEqual(expect.objectContaining({
      cacheReadTokens: 100,
      cacheCreationTokens: 10,
      cacheHitRate: 0.2 // 100 / (400 + 100)
    }))
  })

  it('summarizeUsage 命中率在无成功调用时记 0（不做 0/0）', () => {
    const repository = createAiRepository({ prepare: () => ({ get: () => undefined, all: () => [], run: () => ({}) }) })
    expect(repository.summarizeUsage('user_nobody', 'month')).toEqual(expect.objectContaining({
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      cacheHitRate: 0
    }))
  })

  it('getUsageTotalsByRoundId 空 roundId 直接回空值（含缓存字段 0）', () => {
    const repository = createAiRepository({ prepare: () => ({ get: () => undefined, all: () => [], run: () => ({}) }) })
    expect(repository.getUsageTotalsByRoundId('')).toEqual({
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      callCount: 0,
      profiles: {
        directorRound: {
          inputTokens: 0,
          cacheReadTokens: 0,
          callCount: 0,
          warmInputTokens: 0,
          warmCacheReadTokens: 0,
          warmCallCount: 0
        },
        postRound: {
          inputTokens: 0,
          cacheReadTokens: 0,
          callCount: 0,
          warmInputTokens: 0,
          warmCacheReadTokens: 0,
          warmCallCount: 0
        }
      }
    })
  })

  // op:… 是跨轮操作单元 id（末段时间戳），不能按末段反解消息序号、也不占真实轮的顺位。
  it('does not assign session round numbers to op unit rows', async () => {
    const { db } = await createSqlJsWrapper()
    createUsageTables(db)
    seedChatMessages(db)
    const insert = db.prepare(`
      INSERT INTO ai_usage_ledger (
        id, user_id, feature, session_id, session_label, round_id, unit_kind, usage_label, place_label, model, input_tokens, output_tokens, estimated_cost_cents, status, error_code, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    insert.run('op_proj_1', 'user_a', 'agent', 'session_d', '支线会话', 'op:batch_projection:session_d:abc', 'batch_projection', '消息投影：#10', '星依', 'glm-5.1', 5, 2, 0, 'success', '', '2026-05-15T05:00:00.000Z')
    insert.run('round_row', 'user_a', 'role_message', 'session_d', '支线会话', 'round:session_d:30', '', '角色发言：星依', '会话：支线会话', 'glm-5.1', 10, 5, 0, 'success', '', '2026-05-15T04:00:00.000Z')
    const repository = createAiRepository(db)

    const result = repository.queryUsageLedger({
      range: 'today',
      sessionId: 'session_d',
      userId: 'user_a',
      now: new Date('2026-05-15T12:00:00.000Z')
    })

    const byId = new Map(result.items.map((item) => [item.id, item]))
    expect(byId.get('op_proj_1')).toEqual(expect.objectContaining({ session_round_index: 0 }))
    expect(byId.get('round_row')).toEqual(expect.objectContaining({ session_round_index: 2 }))
  })
})
