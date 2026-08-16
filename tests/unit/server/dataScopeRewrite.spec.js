import { afterEach, describe, expect, it, vi } from 'vitest'

describe('db scoped SQL rewrite', () => {
  afterEach(() => {
    vi.resetModules()
    vi.unstubAllEnvs()
  })

  async function importDbWithRawSqlCapture() {
    const captured = []
    const statement = {
      bind: vi.fn(),
      step: vi.fn(() => false),
      getAsObject: vi.fn(() => ({})),
      free: vi.fn()
    }
    const rawDb = {
      export: vi.fn(() => new Uint8Array()),
      exec: vi.fn(),
      run: vi.fn(),
      prepare: vi.fn((sql) => {
        captured.push(sql)
        return statement
      }),
      getRowsModified: vi.fn(() => 0)
    }
    vi.doMock('sql.js', () => ({
      default: async () => ({
        Database: vi.fn(function Database() {
          return rawDb
        })
      })
    }))
    vi.doMock('../../../server/migrations/index.js', () => ({
      createMigrationManager: () => ({
        runMigrations: vi.fn(async () => undefined)
      })
    }))
    vi.doMock('../../../server/localWorkspace.js', () => ({
      getActiveDataScope: () => ({
        userId: 'user_a',
        role: 'user',
        workspaceId: 'default'
      }),
      getActiveWorkspaceId: () => 'workspace_a'
    }))
    vi.stubEnv('LANGHUAN_DB_AUTO_SAVE_INTERVAL', '0')

    const mod = await import('../../../server/db.js')
    return { db: mod.default, captured, statement }
  }

  it('adds scope filters even when SQL already contains user_id in the select list', async () => {
    const { db, captured, statement } = await importDbWithRawSqlCapture()

    db.prepare('SELECT id, user_id FROM prompt_presets ORDER BY order_index').all()

    const rewritten = captured.at(-1) || ''
    expect(rewritten).toContain('FROM prompt_presets WHERE prompt_presets.user_id = ? AND prompt_presets.workspace_id = ? ORDER BY order_index')
    expect(statement.bind).toHaveBeenLastCalledWith(['user_a', 'workspace_a'])
  })

  it('uses table aliases when adding scope filters', async () => {
    const { db, captured, statement } = await importDbWithRawSqlCapture()

    db.prepare('SELECT p.id FROM prompt_presets AS p WHERE p.enabled = ? ORDER BY p.order_index').all(1)

    const rewritten = captured.at(-1) || ''
    expect(rewritten).toContain('FROM prompt_presets AS p WHERE p.enabled = ? AND p.user_id = ? AND p.workspace_id = ? ORDER BY p.order_index')
    expect(statement.bind).toHaveBeenLastCalledWith([1, 'user_a', 'workspace_a'])
  })

  it('ties inner joined scoped tables to the primary table scope', async () => {
    const { db, captured, statement } = await importDbWithRawSqlCapture()

    db.prepare(`
      SELECT sessions.id, messages.content
      FROM chat_sessions AS sessions
      JOIN chat_messages AS messages ON messages.session_id = sessions.id
      WHERE sessions.id = ?
    `).all('session_same')

    const rewritten = captured.at(-1) || ''
    expect(rewritten).toContain('sessions.user_id = ? AND sessions.workspace_id = ?')
    expect(rewritten).toContain('messages.user_id = sessions.user_id AND messages.workspace_id = sessions.workspace_id')
    expect(statement.bind).toHaveBeenLastCalledWith(['session_same', 'user_a', 'workspace_a'])
  })

  it('scopes the outer table, not a leading correlated subquery (listSessionsByKind leak root cause)', async () => {
    // 修复前：非贪婪正则 `SELECT[\s\S]+?\sFROM\s+(受管表)` 会匹配到 SELECT 列表里领先出现的子查询
    // `FROM chat_messages m`，把 scope 打进子查询、外层 `FROM chat_sessions s` 反而漏 scope → 跨用户泄露。
    // 修复后：按括号深度只认「深度 0」的外层 FROM 受管表（chat_sessions s），子查询保持原样。
    const { db, captured, statement } = await importDbWithRawSqlCapture()

    db.prepare(`
      SELECT s.id,
        (SELECT m.content FROM chat_messages m WHERE m.session_id = s.id ORDER BY m.id ASC LIMIT 1) AS preview
      FROM chat_sessions s
      WHERE s.is_archived = 0
      ORDER BY s.updated_at DESC
    `).all()

    const rewritten = captured.at(-1) || ''
    // 外层 chat_sessions 被 scope（追加在外层 WHERE 末尾、外层 ORDER BY 之前）
    expect(rewritten).toContain('WHERE s.is_archived = 0 AND s.user_id = ? AND s.workspace_id = ? ORDER BY s.updated_at')
    // 子查询完全没有被污染：既没被误注入 m.user_id，ORDER BY/LIMIT 也原样保留
    expect(rewritten).toContain('WHERE m.session_id = s.id ORDER BY m.id ASC LIMIT 1) AS preview')
    expect(rewritten).not.toContain('m.user_id = ?')
    expect(statement.bind).toHaveBeenLastCalledWith(['user_a', 'workspace_a'])
  })

  it('keeps subquery ORDER BY/LIMIT intact and appends auto-scope at the outer level (explicit + auto stacked)', async () => {
    // 复刻修复后 listSessionsByKind 的显式加固 SQL：外层与两个子查询都已显式带 scope，
    // 自动重写器再叠一份外层冗余 scope。核对最终占位符数量与参数顺序完全一致。
    const { db, captured, statement } = await importDbWithRawSqlCapture()

    db.prepare(`
      SELECT s.*,
        (SELECT m.content FROM chat_messages m WHERE m.session_id = s.id AND m.role = 'user' AND m.user_id = ? AND m.workspace_id = ? ORDER BY m.id ASC LIMIT 1) AS first_user_content,
        (SELECT COUNT(*) FROM chat_messages m2 WHERE m2.session_id = s.id AND m2.user_id = ? AND m2.workspace_id = ?) AS message_count
      FROM chat_sessions s
      WHERE COALESCE(s.kind, 'roleplay') = ?
        AND COALESCE(s.is_archived, 0) = 0
        AND s.user_id = ? AND s.workspace_id = ?
      ORDER BY datetime(COALESCE(s.updated_at, s.created_at, '1970-01-01')) DESC
    `).all('ua', 'wa', 'ua', 'wa', 'xingyi', 'ua', 'wa')

    const rewritten = captured.at(-1) || ''
    // 自动 scope 落在外层（外层 ORDER BY 之前），子查询的 ORDER BY m.id ASC LIMIT 1 原样保留
    expect(rewritten).toContain('AND s.user_id = ? AND s.workspace_id = ? ORDER BY datetime(COALESCE(s.updated_at')
    expect(rewritten).toContain("ORDER BY m.id ASC LIMIT 1) AS first_user_content")
    // 最终参数顺序：子查询1(ua,wa) → 子查询2(ua,wa) → 外层(kind, ua, wa) → 自动追加(user_a, workspace_a)
    expect(statement.bind).toHaveBeenLastCalledWith(['ua', 'wa', 'ua', 'wa', 'xingyi', 'ua', 'wa', 'user_a', 'workspace_a'])
  })

  it('skips string literals when scanning bracket depth (P2: LIKE literal containing "(" must not confuse ORDER BY detection)', async () => {
    // Fable 审查发现的具体缺陷：bracketDepthAt 原来纯按字符数括号，字面量 '%(%' 里的 '(' 没有配对的 ')'，
    // 会让此后的深度计数一直虚高，导致 ORDER BY 被误判成「在括号内」而跳过，scope 条件插到 ORDER BY 之后
    // 被当成排序表达式解析，过滤条件静默丢失。这条测试用该形状锁死：scope 必须插在 WHERE 里、ORDER BY 之前，
    // 字面量本身必须原样保留。
    const { db, captured, statement } = await importDbWithRawSqlCapture()

    db.prepare(`SELECT id, title FROM chat_sessions WHERE title LIKE '%(%' ORDER BY id`).all()

    const rewritten = captured.at(-1) || ''
    // 字面量原样保留，未被破坏
    expect(rewritten).toContain("title LIKE '%(%'")
    // scope 条件插在 WHERE 里、ORDER BY 之前（不是被当成排序表达式追加在 ORDER BY 之后）
    expect(rewritten).toContain("title LIKE '%(%' AND chat_sessions.user_id = ? AND chat_sessions.workspace_id = ? ORDER BY id")
    expect(rewritten).not.toMatch(/ORDER BY id AND/i)
    expect(statement.bind).toHaveBeenLastCalledWith(['user_a', 'workspace_a'])
  })

  it('escaped single-quote literal (\'\') does not confuse bracket depth scanning', async () => {
    // 字面量内的转义单引号（''表示一个字面 '）不应把扫描器带出字符串态，也不应影响括号深度。
    const { db, captured, statement } = await importDbWithRawSqlCapture()

    db.prepare(`SELECT id, title FROM chat_sessions WHERE title LIKE '%''(%' ORDER BY id`).all()

    const rewritten = captured.at(-1) || ''
    expect(rewritten).toContain("title LIKE '%''(%' AND chat_sessions.user_id = ? AND chat_sessions.workspace_id = ? ORDER BY id")
    expect(statement.bind).toHaveBeenLastCalledWith(['user_a', 'workspace_a'])
  })

  it('P3: throws when a CTE (WITH ... AS) touches a scoped table without /* unscoped */', async () => {
    // CTE 完全绕过 INSERT/SELECT/UPDATE/DELETE 的语句开头表名匹配，会静默零注入 scope。
    // 检测到 WITH 开头 + 引用受管表 + 无 unscoped 标记时必须高声报错，而不是静默放行。
    const { db } = await importDbWithRawSqlCapture()

    expect(() => {
      db.prepare(`WITH recent AS (SELECT id FROM chat_sessions WHERE is_archived = 0) SELECT * FROM recent`).all()
    }).toThrow(/CTE.*scope|scope.*CTE|不支持自动 scope 注入/)
  })

  it('P3: CTE with /* unscoped */ marker runs normally without throwing', async () => {
    const { db, captured } = await importDbWithRawSqlCapture()

    expect(() => {
      db.prepare(`/* unscoped */ WITH recent AS (SELECT id FROM chat_sessions WHERE is_archived = 0) SELECT * FROM recent`).all()
    }).not.toThrow()

    const rewritten = captured.at(-1) || ''
    // unscoped 标记时完全不重写，原样透传
    expect(rewritten).toContain('WITH recent AS (SELECT id FROM chat_sessions WHERE is_archived = 0) SELECT * FROM recent')
  })

  it('does not persist the test database to the real project db file', async () => {
    const writeFileSync = vi.fn()
    vi.doMock('fs', async () => {
      const actual = await vi.importActual('fs')
      return {
        ...actual,
        writeFileSync
      }
    })

    const { db } = await importDbWithRawSqlCapture()
    db.exec('CREATE TABLE IF NOT EXISTS prompt_presets (id TEXT)')
    db._save()

    expect(writeFileSync).not.toHaveBeenCalled()
  })
})
