import db from '../db.js'
import { normalizeChatSessionReplyPipelineMode } from '../../src/app/chatReplyPipelineMode.js'

type MigrationDb = Pick<typeof db, 'prepare'>

function scopedWhere(ownerUserId?: string, workspaceId?: string, userColumn = 'user_id', workspaceColumn = 'workspace_id') {
  const userId = String(ownerUserId || '').trim()
  const ws = String(workspaceId || 'local').trim() || 'default'
  if (!userId) return { sql: '', params: [] as unknown[] }
  return {
    sql: ` AND COALESCE(${userColumn}, '') = ? AND COALESCE(${workspaceColumn}, 'default') = ?`,
    params: [userId, ws] as unknown[]
  }
}

function trimText(value: unknown): string {
  return String(value ?? '').trim()
}

function composeVirtualSceneLocationLabel(
  large: unknown,
  middle: unknown,
  small: unknown,
  legacy: unknown = ''
): string {
  const largeText = trimText(large)
  const middleText = trimText(middle)
  const smallText = trimText(small)
  const legacyText = trimText(legacy)
  const tail = smallText || (!largeText && !middleText ? legacyText : '')
  const parts = [largeText, middleText, tail].filter(Boolean)
  if (parts.length) return parts.join(' / ')
  return legacyText
}

function splitLegacyVirtualSceneLocation(value: unknown): { large: string; middle: string; small: string } {
  const text = trimText(value)
  if (!text) return { large: '', middle: '', small: '' }
  const parts = text
    .split(/\s*(?:\/|／|｜|\||>|＞)\s*/g)
    .map((item) => item.trim())
    .filter(Boolean)
  if (parts.length >= 3) {
    return {
      large: parts[0],
      middle: parts[1],
      small: parts.slice(2).join(' / ')
    }
  }
  if (parts.length === 2) {
    return {
      large: parts[0],
      middle: parts[1],
      small: ''
    }
  }
  return {
    large: '',
    middle: '',
    small: text
  }
}

function resolveVirtualSceneLocationParts(row: any): { large: string; middle: string; small: string; legacy: string } {
  const large = trimText(row.virtualLocationLarge)
  const middle = trimText(row.virtualLocationMiddle)
  const small = trimText(row.virtualLocationSmall)
  const legacy = trimText(row.virtualLocation)
  if (large || middle || small) return { large, middle, small, legacy }
  return { ...splitLegacyVirtualSceneLocation(legacy), legacy }
}

export function createWorkspaceSnapshotMigrationRepository(database: MigrationDb = db) {
  return {
    listCharacterAvatarPaths() {
      return database.prepare(`
        /* unscoped */ SELECT id, avatar_path, user_id, workspace_id
        FROM characters
        WHERE avatar_path IS NOT NULL AND avatar_path != ?
      `).all('') as Array<{ id?: string; avatar_path?: string; user_id?: string; workspace_id?: string }>
    },
    updateCharacterAvatarPath(id: string, avatarPath: string, ownerUserId?: string, workspaceId?: string) {
      const scope = scopedWhere(ownerUserId, workspaceId)
      database.prepare(`/* unscoped */ UPDATE characters SET avatar_path = ? WHERE id = ?${scope.sql}`).run(avatarPath, id, ...scope.params)
    },
    getLatestCharacterAvatarUpload(id: string, _ownerUserId?: string, workspaceId?: string) {
      const safeId = String(id || '').trim().replace(/[^a-zA-Z0-9_-]/g, '_') || 'character'
      const businessIds = [
        `character_${safeId}`,
        String(id || '').trim()
      ].filter(Boolean)
      if (!businessIds.length) return null
      const placeholders = businessIds.map(() => '?').join(', ')
      return database.prepare(`
        /* unscoped */ SELECT stored_path, created_at
        FROM uploads
        WHERE business_type = 'avatar'
          AND business_id IN (${placeholders})
          AND workspace_id = ?
        ORDER BY created_at DESC
        LIMIT 1
      `).get(...businessIds, String(workspaceId || 'local')) as { stored_path?: string; created_at?: string } | undefined
    },
    getUploadCreatedAtByStoredPath(storedPath: string, _ownerUserId?: string, workspaceId?: string) {
      const row = database.prepare(`
        /* unscoped */ SELECT created_at
        FROM uploads
        WHERE stored_path = ? AND workspace_id = ?
        ORDER BY created_at DESC
        LIMIT 1
      `).get(String(storedPath || '').replace(/^\/+/, ''), String(workspaceId || 'local')) as { created_at?: string } | undefined
      return String(row?.created_at || '')
    },
    getChatSession(id: string, ownerUserId?: string, workspaceId?: string) {
      const scope = scopedWhere(ownerUserId, workspaceId)
      return database.prepare(`/* unscoped */ SELECT * FROM chat_sessions WHERE id = ?${scope.sql}`).get(id, ...scope.params) as Record<string, any> | undefined
    },
    moveChatMessagesToSession(nextSessionId: string, prevSessionId: string, ownerUserId?: string, workspaceId?: string) {
      const scope = scopedWhere(ownerUserId, workspaceId)
      database.prepare(`/* unscoped */ UPDATE chat_messages SET session_id = ? WHERE session_id = ?${scope.sql}`).run(nextSessionId, prevSessionId, ...scope.params)
    },
    upsertChatSession(row: any) {
      const locationParts = resolveVirtualSceneLocationParts(row)
      database.prepare(`
        /* unscoped */ INSERT OR REPLACE INTO chat_sessions (
          id, target_id, target_type, title,
          summary, last_summary_time, loaded_summary_ids, context_summary, caps_residue_state_json,
          updated_at, virtual_scene_name, virtual_scene_desc, virtual_location_large, virtual_location_middle, virtual_location_small, virtual_location, virtual_real_location, virtual_time,
          virtual_time_anchor, virtual_time_base, virtual_time_rate, virtual_weather, virtual_weather_mode,
          bound_alias, narration_frequency, narration_temperature, reply_pipeline_mode, temp_model, temp_preset, user_id, workspace_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        row.id, row.targetId, row.targetType,
        row.title ?? '',
        row.summary, row.lastSummaryTime, row.loadedSummaryIds, row.contextSummary, '{}',
        row.updatedAt, row.virtualSceneName, row.virtualSceneDesc,
        locationParts.large,
        locationParts.middle,
        locationParts.small,
        composeVirtualSceneLocationLabel(locationParts.large, locationParts.middle, locationParts.small, locationParts.legacy),
        row.virtualRealLocation ?? '',
        row.virtualTime,
        row.virtualTimeAnchor, row.virtualTimeBase, row.virtualTimeRate, row.virtualWeather, row.virtualWeatherMode,
        row.boundAlias, row.narrationFrequency ?? row.narration_frequency ?? 'standard', row.narrationTemperature ?? row.narration_temperature ?? 'standard',
        normalizeChatSessionReplyPipelineMode(row.replyPipelineMode ?? row.reply_pipeline_mode),
        row.tempModel, row.tempPreset, row.userId ?? row.user_id ?? '', row.workspaceId ?? row.workspace_id ?? 'local'
      )
    },
    deleteChatSession(id: string, ownerUserId?: string, workspaceId?: string) {
      const scope = scopedWhere(ownerUserId, workspaceId)
      database.prepare(`/* unscoped */ DELETE FROM chat_sessions WHERE id = ?${scope.sql}`).run(id, ...scope.params)
    },
    listLegacyChatSessionIds() {
      return database.prepare(`
        /* unscoped */ SELECT id, user_id, workspace_id
        FROM chat_sessions
        WHERE id LIKE 'group_group_%' OR id LIKE 'crowd_crowd_%'
      `).all() as Array<{ id?: string; user_id?: string; workspace_id?: string }>
    },
    listSessionContexts() {
      return database.prepare(`
        /* unscoped */ SELECT id, user_id, workspace_id, loaded_summary_ids, virtual_scene_name, virtual_scene_desc,
               virtual_location_large, virtual_location_middle, virtual_location_small,
               virtual_location, virtual_real_location, virtual_time, virtual_time_anchor, virtual_time_base,
               virtual_time_rate, virtual_weather, bound_alias
        FROM chat_sessions
      `).all() as Array<Record<string, any>>
    },
    updateSessionLoadedSummaryIds(id: string, loadedSummaryIds: string, ownerUserId?: string, workspaceId?: string) {
      const scope = scopedWhere(ownerUserId, workspaceId)
      database.prepare(`/* unscoped */ UPDATE chat_sessions SET loaded_summary_ids = ?, updated_at = datetime('now') WHERE id = ?${scope.sql}`).run(loadedSummaryIds, id, ...scope.params)
    },
    hasSummaryRecordId(summaryId: string, ownerUserId?: string, workspaceId?: string) {
      const id = String(summaryId || '').trim()
      if (!id) return false
      const tables = ['summary_library', 'small_summaries', 'big_summaries']
      return tables.some((table) => {
        const scope = scopedWhere(ownerUserId, workspaceId)
        const row = database.prepare(`/* unscoped */ SELECT id FROM ${table} WHERE id = ?${scope.sql} LIMIT 1`).get(id, ...scope.params) as { id?: string } | undefined
        return Boolean(row?.id)
      })
    },
    clearSessionContext(id: string, ownerUserId?: string, workspaceId?: string) {
      const scope = scopedWhere(ownerUserId, workspaceId)
      database.prepare(`
        /* unscoped */
        UPDATE chat_sessions
        SET bound_alias = '',
            virtual_location_large = '',
            virtual_location_middle = '',
            virtual_location_small = '',
            virtual_location = '',
            virtual_real_location = '',
            virtual_time = '',
            virtual_time_anchor = 0,
            virtual_time_base = 0,
            virtual_time_rate = 1,
            virtual_weather = '',
            virtual_weather_mode = 'real',
            updated_at = datetime('now')
        WHERE id = ?${scope.sql}
      `).run(id, ...scope.params)
    }
  }
}

export const workspaceSnapshotMigrationRepository = createWorkspaceSnapshotMigrationRepository()
