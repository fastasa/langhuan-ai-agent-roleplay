import { existsSync } from 'fs'
import { join, dirname, extname } from 'path'
import { fileURLToPath } from 'url'
import { workspaceSnapshotMigrationRepository } from '../../repositories/workspaceSnapshotMigrationRepository.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
export const AVATAR_DIR = join(__dirname, '..', '..', 'data', 'avatars')

export function normalizeChatTargetIdForWorkspace(targetId: string): string {
  const raw = String(targetId || '').trim()
  if (raw.startsWith('group_group_')) return raw.replace(/^group_/, '')
  if (raw.startsWith('crowd_crowd_')) return raw.replace(/^crowd_/, '')
  return raw
}

export function resolveCharacterAvatarPath(characterId: string, avatarPath: string): string {
  const raw = String(avatarPath || '').trim()
  if (!characterId || !raw || raw.startsWith('data:') || /^https?:\/\//i.test(raw)) {
    return raw
  }

  const normalized = raw.replace(/^\/+/, '')
  const currentAbsolute = join(__dirname, '..', '..', normalized)
  if (existsSync(currentAbsolute)) {
    return `/${normalized}`
  }

  const currentExt = extname(normalized).toLowerCase()
  const baseName = currentExt ? normalized.slice(0, -currentExt.length) : normalized
  for (const candidateExt of ['.png', '.jpg', '.jpeg', '.webp']) {
    if (candidateExt === currentExt) continue
    const candidateRelative = `${baseName}${candidateExt}`.replace(/^\/+/, '')
    if (existsSync(join(__dirname, '..', '..', candidateRelative))) {
      return `/${candidateRelative}`
    }
  }

  for (const candidateExt of ['.png', '.jpg', '.jpeg', '.webp']) {
    const candidateRelative = `avatars/${characterId}${candidateExt}`
    if (existsSync(join(AVATAR_DIR, `${characterId}${candidateExt}`))) {
      return `/${candidateRelative}`
    }
  }

  return raw.startsWith('/') ? raw : `/${normalized}`
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

function resolveVirtualSceneLocationParts(row: Record<string, any>): { large: string; middle: string; small: string; legacy: string } {
  const large = trimText(row.virtual_location_large)
  const middle = trimText(row.virtual_location_middle)
  const small = trimText(row.virtual_location_small)
  const legacy = trimText(row.virtual_location)
  if (large || middle || small) return { large, middle, small, legacy }
  return { ...splitLegacyVirtualSceneLocation(legacy), legacy }
}

export function repairWorkspaceSnapshotStorage(database: any): void {
  repairAllLegacyChatTargets()
  cleanupLegacySessionContext()
  repairCharacterAvatarPaths()
}

function repairCharacterAvatarPaths(): void {
  const rows = workspaceSnapshotMigrationRepository.listCharacterAvatarPaths()
  for (const row of rows) {
    const id = String(row.id || '').trim()
    const avatarPath = String(row.avatar_path || '').trim()
    const ownerUserId = String(row.user_id || '').trim()
    const workspaceId = String(row.workspace_id || 'local').trim() || 'default'
    if (!id || !avatarPath) continue
    const fixedPath = resolveCharacterAvatarPath(id, avatarPath)
    if (fixedPath && fixedPath !== avatarPath) {
      workspaceSnapshotMigrationRepository.updateCharacterAvatarPath(id, fixedPath, ownerUserId, workspaceId)
    }
    const currentPath = String(fixedPath || avatarPath).replace(/^\/+/, '')
    const currentCreatedAt = workspaceSnapshotMigrationRepository.getUploadCreatedAtByStoredPath(currentPath, ownerUserId, workspaceId)
    const latestUpload = workspaceSnapshotMigrationRepository.getLatestCharacterAvatarUpload(id, ownerUserId, workspaceId)
    const latestPath = String(latestUpload?.stored_path || '').replace(/^\/+/, '')
    const latestCreatedAt = String(latestUpload?.created_at || '')
    if (
      currentCreatedAt
      && latestPath
      && latestPath !== currentPath
      && latestCreatedAt
      && latestCreatedAt > currentCreatedAt
    ) {
      workspaceSnapshotMigrationRepository.updateCharacterAvatarPath(id, `/${latestPath}`, ownerUserId, workspaceId)
    }
  }
}

function repairLegacyChatTarget(targetId: string, ownerUserId?: string, workspaceId?: string): string {
  const normalizedId = normalizeChatTargetIdForWorkspace(targetId)
  if (!targetId || normalizedId === targetId) return normalizedId

  const legacySession = workspaceSnapshotMigrationRepository.getChatSession(targetId, ownerUserId, workspaceId)
  const normalizedSession = workspaceSnapshotMigrationRepository.getChatSession(normalizedId, ownerUserId, workspaceId)

  workspaceSnapshotMigrationRepository.moveChatMessagesToSession(normalizedId, targetId, ownerUserId, workspaceId)

  if (!normalizedSession && legacySession) {
    const targetType = normalizedId.startsWith('group_') ? 'group' : normalizedId.startsWith('crowd_') ? 'crowd' : 'char'
    const locationParts = resolveVirtualSceneLocationParts(legacySession)
    workspaceSnapshotMigrationRepository.upsertChatSession({
      id: normalizedId,
      targetId: normalizedId,
      targetType: legacySession.target_type || targetType,
      summary: legacySession.summary || '',
      lastSummaryTime: legacySession.last_summary_time || '',
      loadedSummaryIds: legacySession.loaded_summary_ids || '[]',
      contextSummary: legacySession.context_summary || '',
      capsResidueStateJson: '{}',
      updatedAt: legacySession.updated_at || null,
      virtualSceneName: legacySession.virtual_scene_name || '',
      virtualSceneDesc: legacySession.virtual_scene_desc || '',
      virtualLocationLarge: locationParts.large,
      virtualLocationMiddle: locationParts.middle,
      virtualLocationSmall: locationParts.small,
      virtualLocation: composeVirtualSceneLocationLabel(
        locationParts.large,
        locationParts.middle,
        locationParts.small,
        locationParts.legacy
      ),
      virtualRealLocation: legacySession.virtual_real_location || '',
      virtualTime: legacySession.virtual_time || '',
      virtualTimeAnchor: legacySession.virtual_time_anchor || 0,
      virtualTimeBase: legacySession.virtual_time_base || 0,
      virtualTimeRate: legacySession.virtual_time_rate ?? 1,
      virtualWeather: legacySession.virtual_weather || '',
      virtualWeatherMode: legacySession.virtual_weather_mode || 'real',
      boundAlias: legacySession.bound_alias || '',
      tempModel: legacySession.temp_model || '',
      tempPreset: legacySession.temp_preset || '',
      userId: legacySession.user_id || ownerUserId || '',
      workspaceId: legacySession.workspace_id || workspaceId || 'local'
    })
  }

  workspaceSnapshotMigrationRepository.deleteChatSession(targetId, ownerUserId, workspaceId)
  return normalizedId
}

function repairAllLegacyChatTargets(): void {
  const rows = workspaceSnapshotMigrationRepository.listLegacyChatSessionIds()
  for (const row of rows) {
    const rawId = String(row.id || '').trim()
    if (!rawId) continue
    repairLegacyChatTarget(rawId, String(row.user_id || ''), String(row.workspace_id || 'local'))
  }
}

function cleanupLegacySessionContext(): void {
  const legacyIdPattern = /^(?:S\d+|legacy_(?:small|big)_[^,\]\s]+)$/i
  const rows = workspaceSnapshotMigrationRepository.listSessionContexts()

  for (const row of rows) {
    const targetId = String(row.id || '').trim()
    const ownerUserId = String(row.user_id || '').trim()
    const workspaceId = String(row.workspace_id || 'local').trim() || 'default'
    if (!targetId) continue

    let loadedIds: string[] = []
    try {
      const parsed = JSON.parse(String(row.loaded_summary_ids || '[]'))
      if (Array.isArray(parsed)) {
        loadedIds = parsed.map((item) => String(item || '').trim()).filter(Boolean)
      }
    } catch {
      loadedIds = []
    }

    if (!loadedIds.length) continue

    const nextLoadedIds = loadedIds.filter((id) => {
      if (!legacyIdPattern.test(id)) return true
      return workspaceSnapshotMigrationRepository.hasSummaryRecordId(id, ownerUserId, workspaceId)
    })
    if (nextLoadedIds.length !== loadedIds.length) {
      if (process.env.LANGHUAN_DEBUG_SUMMARY_TRACE === '1') {
        console.info('[summary-trace][server]', {
          action: 'snapshot-cleanup:loaded-summary-ids',
          targetId,
          previousLoadedSummaryIds: loadedIds,
          nextLoadedSummaryIds: nextLoadedIds
        })
      }
      workspaceSnapshotMigrationRepository.updateSessionLoadedSummaryIds(targetId, JSON.stringify(nextLoadedIds), ownerUserId, workspaceId)
    }

    const shouldClearCopiedContext =
        nextLoadedIds.length === 0
      && !String(row.virtual_scene_name || '').trim()
      && !String(row.virtual_scene_desc || '').trim()
      && (
        String(row.virtual_location_large || '').trim()
        || String(row.virtual_location_middle || '').trim()
        || String(row.virtual_location_small || '').trim()
        || String(row.virtual_location || '').trim()
        || String(row.virtual_real_location || '').trim()
        || String(row.virtual_time || '').trim()
        || Number(row.virtual_time_anchor || 0) !== 0
        || Number(row.virtual_time_base || 0) !== 0
        || Number(row.virtual_time_rate || 1) !== 1
        || String(row.virtual_weather || '').trim()
        || String(row.bound_alias || '').trim()
      )

    if (shouldClearCopiedContext) {
      workspaceSnapshotMigrationRepository.clearSessionContext(targetId, ownerUserId, workspaceId)
    }
  }
}
