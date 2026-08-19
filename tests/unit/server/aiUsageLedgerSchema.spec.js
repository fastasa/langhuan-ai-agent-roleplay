import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import initSqlJs from 'sql.js'
import { afterEach, describe, expect, it, vi } from 'vitest'

describe('ai usage ledger diagnostic schema compatibility', () => {
  let testDirectory = ''

  afterEach(() => {
    vi.resetModules()
    vi.unstubAllEnvs()
    if (!testDirectory) return
    const resolvedDirectory = resolve(testDirectory)
    const resolvedTempRoot = resolve(tmpdir())
    if (resolvedDirectory.startsWith(`${resolvedTempRoot}\\`) || resolvedDirectory.startsWith(`${resolvedTempRoot}/`)) {
      rmSync(resolvedDirectory, { recursive: true, force: true })
    }
    testDirectory = ''
  })

  it('repairs a legacy ledger before diagnostic inserts are attempted', async () => {
    testDirectory = mkdtempSync(join(tmpdir(), 'langhuan-ai-ledger-'))
    const databasePath = join(testDirectory, 'legacy.db')
    const SQL = await initSqlJs()
    const legacyDatabase = new SQL.Database()
    legacyDatabase.run(`
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
        model TEXT DEFAULT '',
        input_tokens INTEGER DEFAULT 0,
        output_tokens INTEGER DEFAULT 0,
        cache_read_tokens INTEGER DEFAULT 0,
        cache_creation_tokens INTEGER DEFAULT 0,
        estimated_cost_cents REAL DEFAULT 0,
        status TEXT DEFAULT 'success',
        error_code TEXT DEFAULT '',
        created_at TEXT DEFAULT (datetime('now'))
      )
    `)
    writeFileSync(databasePath, Buffer.from(legacyDatabase.export()))
    legacyDatabase.close()

    vi.stubEnv('LANGHUAN_DB_PATH', databasePath)
    vi.stubEnv('LANGHUAN_DB_AUTO_SAVE_INTERVAL', '0')

    const { default: database } = await import('../../../server/db.js')
    const columns = database.prepare('PRAGMA table_info(ai_usage_ledger)').all().map((column) => column.name)
    expect(columns).toEqual(expect.arrayContaining([
      'profile_id',
      'provider_kind',
      'harness_run_id',
      'model_turn_index',
      'tool_epoch',
      'tool_epoch_turn_index',
      'prompt_rebuild',
      'active_tool_names_hash',
      'tool_schema_hash',
      'system_hash',
      'message_prefix_hash',
      'request_envelope_hash',
      'first_diff_source'
    ]))
  })
})
