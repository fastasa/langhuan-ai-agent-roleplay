import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import initSqlJs from 'sql.js'
import { afterEach, describe, expect, it, vi } from 'vitest'

describe('api preset schema compatibility', () => {
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

  it('repairs a legacy local database and saves a keyless Codex subscription preset', async () => {
    testDirectory = mkdtempSync(join(tmpdir(), 'langhuan-api-preset-'))
    const databasePath = join(testDirectory, 'legacy.db')
    const SQL = await initSqlJs()
    const legacyDatabase = new SQL.Database()
    legacyDatabase.run(`
      CREATE TABLE api_presets (
        name TEXT PRIMARY KEY,
        provider_type TEXT DEFAULT 'openai-compatible',
        base_url TEXT DEFAULT '',
        api_key TEXT DEFAULT '',
        model TEXT DEFAULT '',
        available_models TEXT DEFAULT '[]',
        max_tokens INTEGER DEFAULT 4096,
        temperature REAL DEFAULT 0.7,
        is_default INTEGER DEFAULT 0,
        fallback_preset TEXT DEFAULT '',
        user_id TEXT DEFAULT '',
        workspace_id TEXT DEFAULT 'local'
      )
    `)
    writeFileSync(databasePath, Buffer.from(legacyDatabase.export()))
    legacyDatabase.close()

    vi.stubEnv('LANGHUAN_DB_PATH', databasePath)
    vi.stubEnv('LANGHUAN_DB_AUTO_SAVE_INTERVAL', '0')

    const [{ default: database }, { createWorkspaceMetaRepository }, { createWorkspaceMetaAppService }] = await Promise.all([
      import('../../../server/db.js'),
      import('../../../server/repositories/workspaceMetaRepository.js'),
      import('../../../server/application/workspace/workspaceMetaAppService.js')
    ])
    const columns = database.prepare('PRAGMA table_info(api_presets)').all().map((column) => column.name)
    expect(columns).toEqual(expect.arrayContaining(['max_concurrency', 'min_interval', 'supports_vision']))

    const repository = createWorkspaceMetaRepository(database)
    const service = createWorkspaceMetaAppService(repository)
    expect(service.addApiPreset({
      name: 'Codex（订阅桥）',
      providerType: 'codex-subscription',
      baseUrl: 'codex://local',
      apiKey: '',
      maxConcurrency: 12,
      minInterval: 0,
      isDefault: true
    })).toEqual({ ok: true })

    expect(service.getApiPresets()).toEqual([
      expect.objectContaining({
        name: 'Codex（订阅桥）',
        providerType: 'codex-subscription',
        baseUrl: 'codex://local',
        apiKey: '',
        hasApiKey: false,
        maxConcurrency: 12,
        minInterval: 0,
        isDefault: 1
      })
    ])
  }, 15_000)
})
