import db from '../db.js'
import { toCamel } from '../application/shared/dbUtils.js'
import { getActiveUserId, getActiveWorkspaceId } from '../localWorkspace.js'
import { decryptApiSecret, encryptApiSecret } from '../security/localSecretCrypto.js'

type SettingDb = Pick<typeof db, 'prepare'>
type ConfigScope = 'system' | 'user'

function getScopeParams() {
  return [getActiveUserId(), getActiveWorkspaceId()]
}

function isSystemConfigKey(key: string) {
  return key === 'app_changelog'
    || key === 'app_changelog_draft'
    || key === 'replyPlanOrchestratorConfig'
    || key === 'weather_api_key'
    || key === 'weather_api_domain'
    || key.startsWith('tts_')
}

function resolveConfigScope(key: string, scope?: ConfigScope): ConfigScope {
  return scope ?? (isSystemConfigKey(key) ? 'system' : 'user')
}

function encryptUserApiKey(value: unknown) {
  const plain = String(value || '').trim()
  return plain ? encryptApiSecret(plain) : ''
}

function maskApiPreset(row: Record<string, unknown>) {
  const item = toCamel(row) as Record<string, unknown>
  const encryptedKey = String(row.api_key || item.apiKey || '')
  return {
    ...item,
    apiKey: '',
    api_key: '',
    hasApiKey: Boolean(encryptedKey)
  }
}

function decryptApiPresetForRuntime(row: Record<string, unknown> | undefined) {
  if (!row) return undefined
  return {
    ...row,
    api_key: decryptApiSecret(String(row.api_key || ''))
  }
}

export function createSettingRepository(database: SettingDb = db) {
  return {
    listConfigByPrefix(prefix: string) {
      const userId = getActiveUserId()
      return database.prepare(`
        /* unscoped */ SELECT key, value
        FROM config
        WHERE key LIKE ?
          AND (
            config_scope = 'system'
            OR (config_scope = 'user' AND user_id = ?)
            OR COALESCE(config_scope, '') = ''
          )
      `).all(`${prefix}%`, userId) as Array<{ key: string; value: string }>
    },
    getConfigValue(key: string, options: { scope?: ConfigScope } = {}) {
      const configKey = String(key || '')
      const userId = getActiveUserId()
      const scope = options.scope || (isSystemConfigKey(configKey) ? 'system' : undefined)
      if (scope === 'system') {
        return database.prepare(`
          /* unscoped */ SELECT value
          FROM config
          WHERE key = ?
            AND config_scope = 'system'
          LIMIT 1
        `).get(configKey) as { value: string } | undefined
      }
      return database.prepare(`
        /* unscoped */ SELECT value
        FROM config
        WHERE key = ?
          AND (
            config_scope = 'system'
            OR (config_scope = 'user' AND user_id = ?)
            OR COALESCE(config_scope, '') = ''
          )
        ORDER BY CASE
          WHEN config_scope = 'user' AND user_id = ? THEN 0
          WHEN config_scope = 'system' THEN 1
          ELSE 2
        END
        LIMIT 1
      `).get(configKey, userId, userId) as { value: string } | undefined
    },
    getConfigValueAnyScope(key: string) {
      const configKey = String(key || '')
      return database.prepare(`
        /* unscoped */ SELECT value
        FROM config
        WHERE key = ?
        ORDER BY CASE
          WHEN config_scope = 'system' THEN 0
          WHEN config_scope = 'user' THEN 1
          ELSE 2
        END, rowid DESC
        LIMIT 1
      `).get(configKey) as { value: string } | undefined
    },
    // 按当前活跃用户读「有效配置」：user scope 覆盖优先，回退 system 基线；无视 isSystemConfigKey 锁。
    // 用于编排器等需要「全局基线 + 用户级覆盖」语义的 key（聊天发送链路读运行时真值）。
    getEffectiveConfigValue(key: string) {
      const configKey = String(key || '')
      const userId = getActiveUserId()
      return database.prepare(`
        /* unscoped */ SELECT value
        FROM config
        WHERE key = ?
          AND (
            config_scope = 'system'
            OR (config_scope = 'user' AND user_id = ?)
            OR COALESCE(config_scope, '') = ''
          )
        ORDER BY CASE
          WHEN config_scope = 'user' AND user_id = ? THEN 0
          WHEN config_scope = 'system' THEN 1
          ELSE 2
        END
        LIMIT 1
      `).get(configKey, userId, userId) as { value: string } | undefined
    },
    upsertConfigValue(key: string, value: string, options: { scope?: ConfigScope } = {}) {
      const configKey = String(key || '')
      const scope = resolveConfigScope(configKey, options.scope)
      const userId = scope === 'user' ? getActiveUserId() : ''
      const workspaceId = scope === 'user' ? getActiveWorkspaceId() : 'local'
      database.prepare(`
        /* unscoped */ INSERT OR REPLACE INTO config (key, value, config_scope, user_id, workspace_id)
        VALUES (?, ?, ?, ?, ?)
      `).run(configKey, value, scope, userId, workspaceId)
    },
    getAllConfigs() {
      const userId = getActiveUserId()
      return database.prepare(`
        /* unscoped */ SELECT key, value
        FROM config
        WHERE config_scope = 'system'
           OR (config_scope = 'user' AND user_id = ?)
           OR COALESCE(config_scope, '') = ''
      `).all(userId) as Array<{ key: string; value: string }>
    },
    listConfigByKeys(keys: string[]) {
      const normalizedKeys = Array.from(new Set(
        keys.map((key) => String(key || '').trim()).filter(Boolean)
      ))
      if (!normalizedKeys.length) return []

      const userId = getActiveUserId()
      const placeholders = normalizedKeys.map(() => '?').join(', ')
      return database.prepare(`
        /* unscoped */ SELECT key, value
        FROM config
        WHERE key IN (${placeholders})
          AND (
            config_scope = 'system'
            OR (config_scope = 'user' AND user_id = ?)
            OR COALESCE(config_scope, '') = ''
          )
      `).all(...normalizedKeys, userId) as Array<{ key: string; value: string }>
    },
    getApiPresets() {
      return database.prepare('SELECT * FROM api_presets').all().map((row) => maskApiPreset(row as Record<string, unknown>))
    },
    getApiPresetForRuntime(name: string) {
      const row = database.prepare('SELECT * FROM api_presets WHERE name = ? LIMIT 1').get(name) as Record<string, unknown> | undefined
      return decryptApiPresetForRuntime(row)
    },
    getDefaultApiPresetForRuntime() {
      const row = database.prepare('SELECT * FROM api_presets WHERE is_default = 1 LIMIT 1').get() as Record<string, unknown> | undefined
      return decryptApiPresetForRuntime(row)
    },
    getPromptPresets() {
      return database.prepare('SELECT * FROM prompt_presets ORDER BY order_index').all().map(toCamel)
    },
    replaceApiPresets(rows: Array<{
      name: string
      providerType?: string
      baseUrl: string
      apiKey: string
      model: string
      availableModels: string
      maxTokens: number
      temperature: number
      isDefault: number
      fallbackPreset: string
    }>) {
      database.prepare('/* unscoped */ DELETE FROM api_presets WHERE user_id = ? AND workspace_id = ?')
        .run(...getScopeParams())
      const stmt = database.prepare(`
        INSERT INTO api_presets (name, provider_type, base_url, api_key, model, available_models, max_tokens, temperature, is_default, fallback_preset)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      rows.forEach((row) => {
        const apiKey = encryptUserApiKey(row.apiKey)
        stmt.run(
          row.name,
          row.providerType || 'openai-compatible',
          row.baseUrl,
          apiKey,
          row.model,
          row.availableModels,
          row.maxTokens,
          row.temperature,
          row.isDefault,
          row.fallbackPreset
        )
      })
    },
    replacePromptPresets(rows: Array<{
      id: string
      name: string
      content: string
      role: string
      scene: string
      frequency: number
      enabled: number
      orderIndex: number
      promptGroup: string
      usageMode: string
      scope: string
      isRequired?: number | null
      priority: number
      summary: string
      updatedAt: string
    }>) {
      database.prepare('/* unscoped */ DELETE FROM prompt_presets WHERE user_id = ? AND workspace_id = ?')
        .run(...getScopeParams())
      const stmt = database.prepare(`
        INSERT INTO prompt_presets (id, name, content, role, scene, frequency, enabled, order_index, prompt_group, usage_mode, scope, is_required, priority, summary, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      rows.forEach((row) => {
        stmt.run(
          row.id,
          row.name,
          row.content,
          row.role,
          row.scene,
          row.frequency,
          row.enabled,
          row.orderIndex,
          row.promptGroup,
          row.usageMode,
          row.scope,
          row.isRequired ?? null,
          row.priority,
          row.summary,
          row.updatedAt
        )
      })
    }
  }
}

export const settingRepository = createSettingRepository()
