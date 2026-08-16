import db from '../db.js'
import { toCamel } from '../application/shared/dbUtils.js'
import { getActiveUserId, getActiveWorkspaceId } from '../localWorkspace.js'
import { encryptApiSecret } from '../security/localSecretCrypto.js'

type MetaDb = Pick<typeof db, 'prepare'> & Partial<Pick<typeof db, '_save'>>

function maskApiPreset(row: Record<string, unknown>) {
  const item = toCamel(row) as Record<string, unknown>
  const hasApiKey = Boolean(String(row.api_key || item.apiKey || ''))
  return {
    ...item,
    apiKey: '',
    api_key: '',
    hasApiKey
  }
}

function encryptUserApiKey(value: unknown) {
  const plain = String(value || '').trim()
  return plain ? encryptApiSecret(plain) : ''
}

export function createWorkspaceMetaRepository(database: MetaDb = db) {
  return {
    getSummaryLibrary() {
      return database.prepare('SELECT * FROM summary_library ORDER BY created_at DESC').all().map(toCamel)
    },
    insertSummary(row: { id: string; title: string; content: string; tags: string; charId: string }) {
      database.prepare('INSERT INTO summary_library (id, title, content, tags, char_id) VALUES (?, ?, ?, ?, ?)').run(
        row.id, row.title, row.content, row.tags, row.charId
      )
    },
    updateSummary(id: string, row: { title: unknown; content: unknown; tags: string | null }) {
      database.prepare('UPDATE summary_library SET title=COALESCE(?,title), content=COALESCE(?,content), tags=COALESCE(?,tags) WHERE id=?').run(
        row.title, row.content, row.tags, id
      )
    },
    deleteSummary(id: string) {
      database.prepare('DELETE FROM summary_library WHERE id = ?').run(id)
    },
    getSmallSummaries() {
      return database.prepare('SELECT * FROM small_summaries ORDER BY created_at ASC').all().map(toCamel)
    },
    insertSmallSummary(row: { id: string; charId: string; sessionId: string; name: string; content: string; tags: string }) {
      database.prepare(`
        INSERT INTO small_summaries (id, char_id, session_id, name, content, tags)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(row.id, row.charId, row.sessionId, row.name, row.content, row.tags)
    },
    updateSmallSummary(id: string, row: { name: string; content: string; tags: string }) {
      database.prepare(`
        UPDATE small_summaries SET name=?, content=?, tags=?, updated_at=CURRENT_TIMESTAMP WHERE id=?
      `).run(row.name, row.content, row.tags, id)
    },
    deleteSmallSummary(id: string) {
      database.prepare('DELETE FROM small_summaries WHERE id=?').run(id)
    },
    getBigSummaries() {
      return database.prepare('SELECT * FROM big_summaries ORDER BY created_at ASC').all().map(toCamel)
    },
    insertBigSummary(row: { id: string; name: string; content: string; mergedSummaryIds: string }) {
      database.prepare(`
        INSERT INTO big_summaries (id, name, content, merged_summary_ids)
        VALUES (?, ?, ?, ?)
      `).run(row.id, row.name, row.content, row.mergedSummaryIds)
    },
    updateBigSummary(id: string, row: { name: string; content: string; mergedSummaryIds: string }) {
      database.prepare(`
        UPDATE big_summaries SET name=?, content=?, merged_summary_ids=?, updated_at=CURRENT_TIMESTAMP WHERE id=?
      `).run(row.name, row.content, row.mergedSummaryIds, id)
    },
    deleteBigSummary(id: string) {
      database.prepare('DELETE FROM big_summaries WHERE id=?').run(id)
    },
    getApiPresets() {
      return database.prepare('SELECT * FROM api_presets ORDER BY rowid ASC').all().map((row) => maskApiPreset(row as Record<string, unknown>))
    },
    clearDefaultApiPreset() {
      database.prepare('/* unscoped */ UPDATE api_presets SET is_default = 0 WHERE user_id = ? AND workspace_id = ?')
        .run(getActiveUserId(), getActiveWorkspaceId())
    },
    upsertApiPreset(row: {
      name: string
      providerType?: string
      baseUrl: string
      apiKey: string
      model: string
      availableModels: string
      maxTokens: number
      temperature: number
      isDefault: boolean
      fallbackPreset: string
      maxConcurrency?: number
      minInterval?: number
      supportsVision?: boolean
    }) {
      database.prepare('INSERT INTO api_presets (name, provider_type, base_url, api_key, model, available_models, max_tokens, temperature, is_default, fallback_preset, max_concurrency, min_interval, supports_vision) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
        row.name,
        row.providerType || 'openai-compatible',
        row.baseUrl,
        encryptUserApiKey(row.apiKey),
        row.model,
        row.availableModels,
        row.maxTokens,
        row.temperature,
        row.isDefault ? 1 : 0,
        row.fallbackPreset,
        row.maxConcurrency ?? 6,
        row.minInterval ?? 0,
        row.supportsVision ? 1 : 0
      )
    },
    updateApiPreset(name: string, updates: string[], values: Array<string | number | null>) {
      if (!updates.length) return
      database.prepare(`UPDATE api_presets SET ${updates.join(', ')} WHERE name=?`).run(...values, name)
    },
    deleteApiPreset(name: string) {
      database.prepare('DELETE FROM api_presets WHERE name = ?').run(name)
    },
    getPromptPresets() {
      return database.prepare('SELECT * FROM prompt_presets ORDER BY order_index ASC, rowid ASC').all().map(toCamel)
    },
    insertPromptPreset(row: {
      id: string
      name: string
      content: string
      role: string
      scene: string
      frequency: number
      enabled: boolean
      orderIndex: number
      promptGroup: string
      usageMode: string
      scope: string
      isRequired?: boolean | number | null
      priority: number
      summary: string
      updatedAt: string
    }) {
      database.prepare('INSERT OR REPLACE INTO prompt_presets (id, name, content, role, scene, frequency, enabled, order_index, prompt_group, usage_mode, scope, is_required, priority, summary, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
        row.id,
        row.name,
        row.content,
        row.role,
        row.scene,
        row.frequency,
        row.enabled ? 1 : 0,
        row.orderIndex,
        row.promptGroup,
        row.usageMode,
        row.scope,
        row.isRequired == null ? null : (row.isRequired ? 1 : 0),
        row.priority,
        row.summary,
        row.updatedAt
      )
      database._save?.()
    },
    updatePromptPreset(id: string, row: {
      name: unknown
      content: unknown
      role: unknown
      scene: unknown
      frequency: unknown
      enabled: unknown
      orderIndex: unknown
      promptGroup: unknown
      usageMode: unknown
      scope: unknown
      isRequired?: unknown
      priority: unknown
      summary: unknown
      updatedAt: unknown
    }) {
      database.prepare('UPDATE prompt_presets SET name=COALESCE(?,name), content=COALESCE(?,content), role=COALESCE(?,role), scene=COALESCE(?,scene), frequency=COALESCE(?,frequency), enabled=COALESCE(?,enabled), order_index=COALESCE(?,order_index), prompt_group=COALESCE(?,prompt_group), usage_mode=COALESCE(?,usage_mode), scope=COALESCE(?,scope), is_required=COALESCE(?,is_required), priority=COALESCE(?,priority), summary=COALESCE(?,summary), updated_at=COALESCE(?,updated_at) WHERE id=?').run(
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
        row.isRequired,
        row.priority,
        row.summary,
        row.updatedAt,
        id
      )
      database._save?.()
    },
    deletePromptPreset(id: string) {
      database.prepare('DELETE FROM prompt_presets WHERE id = ?').run(id)
      database._save?.()
    },
    replacePromptPresets(rows: Array<{
      id: string
      name: string
      content: string
      role: string
      scene: string
      frequency: number | string
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
        .run(getActiveUserId(), getActiveWorkspaceId())
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
      database._save?.()
    },
    getCustomTags() {
      return database.prepare('SELECT * FROM custom_tags ORDER BY created_at DESC').all().map(toCamel)
    },
    insertCustomTag(row: { id: string; name: string; color: string }) {
      database.prepare('INSERT INTO custom_tags (id, name, color) VALUES (?, ?, ?)').run(row.id, row.name, row.color)
    },
    updateCustomTag(id: string, row: { name: unknown; color: unknown }) {
      database.prepare('UPDATE custom_tags SET name=COALESCE(?,name), color=COALESCE(?,color) WHERE id=?').run(row.name, row.color, id)
    },
    deleteCustomTag(id: string) {
      database.prepare('DELETE FROM custom_tags WHERE id = ?').run(id)
    },
    getEventStack(date?: string) {
      if (date) {
        return database.prepare('SELECT * FROM event_stack WHERE date = ? ORDER BY created_at DESC').all(date).map(toCamel)
      }
      return database.prepare('SELECT * FROM event_stack ORDER BY created_at DESC').all().map(toCamel)
    },
    insertEventStack(row: {
      id: string
      date: string
      taskId: string | null
      taskName: string
      taskType: string
      status: string
      expReward: number
      durationSeconds: number
      timeAxis: string | null
      notes: string | null
      ticketsUsed: string | null
      ticketsExchanged: string | null
      pointsDelta: number
      moneyDelta: number
      timeBlocks: string | null
      realLocation: string
      realWeather: string
      realTime: string
      timelineJson: string
    }) {
      database.prepare(`
        INSERT INTO event_stack (id, date, task_id, task_name, task_type, status, exp_reward, duration_seconds, time_axis, notes, tickets_used, tickets_exchanged, points_delta, money_delta, time_blocks, real_location, real_weather, real_time, timeline_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        row.id, row.date, row.taskId, row.taskName, row.taskType, row.status, row.expReward, row.durationSeconds, row.timeAxis, row.notes,
        row.ticketsUsed, row.ticketsExchanged, row.pointsDelta, row.moneyDelta, row.timeBlocks, row.realLocation, row.realWeather, row.realTime, row.timelineJson
      )
    },
    updateEventStack(id: string, row: {
      date: string | null
      taskId: string | null
      taskName: string | null
      taskType: string | null
      status: string | null
      expReward: number | null
      durationSeconds: number | null
      timeAxis: string | null
      notes: string | null
      ticketsUsed: string | null
      ticketsExchanged: string | null
      pointsDelta: number | null
      moneyDelta: number | null
      timeBlocks: string | null
      realLocation: string | null
      realWeather: string | null
      realTime: string | null
      timelineJson: string | null
    }) {
      database.prepare(`
        UPDATE event_stack
        SET date = COALESCE(?, date),
            task_id = COALESCE(?, task_id),
            task_name = COALESCE(?, task_name),
            task_type = COALESCE(?, task_type),
            status = COALESCE(?, status),
            exp_reward = COALESCE(?, exp_reward),
            duration_seconds = COALESCE(?, duration_seconds),
            time_axis = COALESCE(?, time_axis),
            notes = COALESCE(?, notes),
            tickets_used = COALESCE(?, tickets_used),
            tickets_exchanged = COALESCE(?, tickets_exchanged),
            points_delta = COALESCE(?, points_delta),
            money_delta = COALESCE(?, money_delta),
            time_blocks = COALESCE(?, time_blocks),
            real_location = COALESCE(?, real_location),
            real_weather = COALESCE(?, real_weather),
            real_time = COALESCE(?, real_time),
            timeline_json = COALESCE(?, timeline_json)
        WHERE id = ?
      `).run(
        row.date, row.taskId, row.taskName, row.taskType, row.status, row.expReward, row.durationSeconds, row.timeAxis,
        row.notes, row.ticketsUsed, row.ticketsExchanged, row.pointsDelta, row.moneyDelta, row.timeBlocks,
        row.realLocation, row.realWeather, row.realTime, row.timelineJson, id
      )
    },
    deleteEventStack(id: string) {
      database.prepare('DELETE FROM event_stack WHERE id = ?').run(id)
    },
    getHistory() {
      return database.prepare('SELECT * FROM history ORDER BY id DESC LIMIT 100').all().map(toCamel)
    }
  }
}

export const workspaceMetaRepository = createWorkspaceMetaRepository()
