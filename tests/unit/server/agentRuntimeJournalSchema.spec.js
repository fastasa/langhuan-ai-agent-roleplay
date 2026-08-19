import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import initSqlJs from 'sql.js'
import { afterEach, describe, expect, it, vi } from 'vitest'

describe('agent runtime journal additive schema', () => {
  let testDirectory = ''

  afterEach(() => {
    vi.resetModules()
    vi.unstubAllEnvs()
    if (!testDirectory) return
    const resolvedDirectory = resolve(testDirectory)
    const tempRoot = resolve(tmpdir())
    if (resolvedDirectory.startsWith(`${tempRoot}\\`) || resolvedDirectory.startsWith(`${tempRoot}/`)) {
      rmSync(resolvedDirectory, { recursive: true, force: true })
    }
    testDirectory = ''
  })

  it('旧库启动时增量创建 scoped append-only 表和唯一索引', async () => {
    testDirectory = mkdtempSync(join(tmpdir(), 'langhuan-agent-journal-'))
    const databasePath = join(testDirectory, 'legacy.db')
    const SQL = await initSqlJs()
    const legacy = new SQL.Database()
    legacy.run('CREATE TABLE legacy_sentinel (id INTEGER PRIMARY KEY)')
    writeFileSync(databasePath, Buffer.from(legacy.export()))
    legacy.close()

    vi.stubEnv('LANGHUAN_DB_PATH', databasePath)
    vi.stubEnv('LANGHUAN_DB_AUTO_SAVE_INTERVAL', '0')
    const { default: database, DATA_SCOPED_TABLES } = await import('../../../server/db.js')
    const columns = database.prepare('PRAGMA table_info(agent_runtime_journal_events)').all().map((row) => row.name)
    expect(columns).toEqual(expect.arrayContaining([
      'user_id', 'workspace_id', 'run_id', 'seq', 'schema_version', 'kind',
      'timestamp', 'completion_anchor', 'checksum', 'payload_json'
    ]))
    expect(DATA_SCOPED_TABLES).toContain('agent_runtime_journal_events')
    const indexes = database.prepare('PRAGMA index_list(agent_runtime_journal_events)').all()
    expect(indexes.some((row) => Number(row.unique) === 1)).toBe(true)
  })
})
