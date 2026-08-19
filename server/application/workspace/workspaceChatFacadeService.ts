import { logger as defaultLogger } from '../../logger.js'
import db from '../../db.js'
import { createChatRepository } from '../../repositories/chatRepository.js'
import { settingRepository } from '../../repositories/settingRepository.js'
import { aiAppService } from '../ai/aiAppService.js'
import { createWorkspaceChatAppService } from './workspaceChatAppService.js'
import { normalizeChatSessionReplyPipelineMode } from '../../../src/app/chatReplyPipelineMode.js'

// 聊天 HTTP 路由实际挂载的是本 facade；这里只做依赖组装、旧数据修复和归档桥接。
// 新增聊天业务规则时优先改 workspaceChatAppService，并确认 facade 注入链路没有改写同一字段。
type WorkspaceChatFacadeDb = Pick<typeof db, 'prepare'>

type WorkspaceChatFacadeDeps = {
  chatRepository?: ReturnType<typeof createChatRepository>
  logger?: Pick<typeof defaultLogger, 'error'>
}

function sanitizeConversationNameSeed(rawContent: unknown): string {
  const normalized = String(rawContent || '')
    .replace(/<think>[\s\S]*?<\/think>/gi, ' ')
    .replace(/<affection>[\s\S]*?<\/affection>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\b\d{1,2}:\d{2}(?::\d{2})?\b/g, ' ')
    .replace(/\b\d{4}[-/年]\d{1,2}[-/月]\d{1,2}(?:日)?(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?\b/g, ' ')
    .replace(/[\$*`~#>@_=+\-\\\/|()[\]{}<>《》【】「」『』“”"'：:；;，,。！？!?、…]/g, ' ')
    .replace(/[^0-9A-Za-z\u4e00-\u9fa5]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  return normalized.slice(0, 20).trim()
}

function normalizeComparableText(value: unknown): string {
  return String(value ?? '').trim()
}

function trimText(value: unknown): string {
  return String(value ?? '').trim()
}

function readAgentModelConfigs() {
  const row = settingRepository.getConfigValue('agentModelConfigs')
  try {
    const parsed = JSON.parse(String(row?.value || '[]'))
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
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

function resolveVirtualSceneLocationParts(
  large: unknown,
  middle: unknown,
  small: unknown,
  legacy: unknown
): { large: string; middle: string; small: string } {
  const largeText = trimText(large)
  const middleText = trimText(middle)
  const smallText = trimText(small)
  if (largeText || middleText || smallText) {
    return { large: largeText, middle: middleText, small: smallText }
  }
  return splitLegacyVirtualSceneLocation(legacy)
}

function buildComparableSessionSignature(session: Record<string, any>) {
  return JSON.stringify({
    loadedSummaryIds: normalizeComparableText(session.loaded_summary_ids),
    virtualSceneName: normalizeComparableText(session.virtual_scene_name),
    virtualSceneDesc: normalizeComparableText(session.virtual_scene_desc),
    virtualLocationLarge: normalizeComparableText(session.virtual_location_large),
    virtualLocationMiddle: normalizeComparableText(session.virtual_location_middle),
    virtualLocationSmall: normalizeComparableText(session.virtual_location_small),
    virtualLocation: normalizeComparableText(session.virtual_location),
    virtualRealLocation: normalizeComparableText(session.virtual_real_location),
    virtualTime: normalizeComparableText(session.virtual_time),
    virtualTimeAnchor: Number(session.virtual_time_anchor || 0),
    virtualTimeBase: Number(session.virtual_time_base || 0),
    virtualTimeRate: Number(session.virtual_time_rate ?? 1),
    virtualWeather: normalizeComparableText(session.virtual_weather),
    virtualWeatherMode: normalizeComparableText(session.virtual_weather_mode || 'real'),
    boundAlias: normalizeComparableText(session.bound_alias),
    narrationFrequency: normalizeComparableText(session.narration_frequency || 'standard'),
    narrationTemperature: normalizeComparableText(session.narration_temperature || 'standard'),
    narrationProfiles: normalizeComparableText(session.narration_profiles || '[]'),
    narrationForceEnabled: Number(session.narration_force_enabled || 0) ? 1 : 0,
    chatFontScale: Number(session.chat_font_scale ?? 1),
    replyPipelineMode: normalizeChatSessionReplyPipelineMode(session.reply_pipeline_mode),
    tempModel: normalizeComparableText(session.temp_model),
    tempPreset: normalizeComparableText(session.temp_preset)
  })
}

function buildComparableMessagesSignature(messages: Array<Record<string, any>>) {
  return JSON.stringify(messages.map((message) => ({
    role: normalizeComparableText(message.role),
    content: normalizeComparableText(message.content),
    time: normalizeComparableText(message.time),
    envDate: normalizeComparableText(message.env_date ?? message.envDate),
    envWeather: normalizeComparableText(message.env_weather ?? message.envWeather),
    envLocation: normalizeComparableText(message.env_location ?? message.envLocation),
    image: normalizeComparableText(message.image),
    model: normalizeComparableText(message.model),
    crowdName: normalizeComparableText(message.crowd_name ?? message.crowdName),
    memberName: normalizeComparableText(message.member_name ?? message.memberName ?? message.name),
    versionsJson: normalizeComparableText(message.versions_json ?? message.versionsJson),
    activeVersionIndex: Number(message.active_version_index ?? message.activeVersionIndex ?? 0)
  })))
}

export function createWorkspaceChatFacadeService(
  database: WorkspaceChatFacadeDb = db,
  deps: WorkspaceChatFacadeDeps = {}
) {
  const chatRepository = deps.chatRepository ?? createChatRepository(database)
  const serviceLogger = deps.logger ?? defaultLogger

  function normalizeChatTargetId(targetId: string): string {
    const raw = String(targetId || '').trim()
    if (raw.startsWith('group_group_')) return raw.replace(/^group_/, '')
    if (raw.startsWith('crowd_crowd_')) return raw.replace(/^crowd_/, '')
    return raw
  }

  function repairLegacyChatTarget(targetId: string): string {
    const normalizedId = normalizeChatTargetId(targetId)
    if (!targetId || normalizedId === targetId) return normalizedId

    const legacySession = chatRepository.getSessionById(targetId)
    const normalizedSession = chatRepository.getSessionById(normalizedId)

    chatRepository.reassignMessagesToSession(normalizedId, targetId)

    if (!normalizedSession && legacySession) {
      const targetType = normalizedId.startsWith('group_')
        ? 'group'
        : normalizedId.startsWith('crowd_')
          ? 'crowd'
          : 'char'
      const legacyLocationParts = resolveVirtualSceneLocationParts(
        legacySession.virtual_location_large,
        legacySession.virtual_location_middle,
        legacySession.virtual_location_small,
        legacySession.virtual_location
      )
      chatRepository.upsertSession(normalizedId, {
        targetId: normalizedId,
        targetType: String(legacySession.target_type || targetType),
        summary: String(legacySession.summary || ''),
        lastSummaryTime: String(legacySession.last_summary_time || ''),
        loadedSummaryIds: String(legacySession.loaded_summary_ids || '[]'),
        contextSummary: String(legacySession.context_summary || ''),
        contextSummaryMessageId: Number(legacySession.context_summary_message_id || 0),
        updatedAt: legacySession.updated_at || null,
        virtualSceneName: String(legacySession.virtual_scene_name || ''),
        virtualSceneDesc: String(legacySession.virtual_scene_desc || ''),
        virtualLocationLarge: legacyLocationParts.large,
        virtualLocationMiddle: legacyLocationParts.middle,
        virtualLocationSmall: legacyLocationParts.small,
        virtualLocation: composeVirtualSceneLocationLabel(
          legacyLocationParts.large,
          legacyLocationParts.middle,
          legacyLocationParts.small,
          legacySession.virtual_location
        ),
        virtualRealLocation: String(legacySession.virtual_real_location || ''),
        virtualTime: String(legacySession.virtual_time || ''),
        virtualTimeAnchor: Number(legacySession.virtual_time_anchor || 0),
        virtualTimeBase: Number(legacySession.virtual_time_base || 0),
        virtualTimeRate: Number(legacySession.virtual_time_rate ?? 1),
        virtualWeather: String(legacySession.virtual_weather || ''),
        virtualWeatherMode: String(legacySession.virtual_weather_mode || 'real'),
        boundAlias: String(legacySession.bound_alias || ''),
        narrationFrequency: String(legacySession.narration_frequency || 'standard'),
        narrationTemperature: String(legacySession.narration_temperature || 'standard'),
        narrationProfiles: String(legacySession.narration_profiles || '[]'),
        chatFontScale: Number(legacySession.chat_font_scale ?? 1),
        tempModel: String(legacySession.temp_model || ''),
        tempPreset: String(legacySession.temp_preset || ''),
        linkedArchiveId: String(legacySession.linked_archive_id || '')
      })
    }

    chatRepository.deleteSessionById(targetId)
    return normalizedId
  }

  function repairAllLegacyChatTargets(): void {
    const rows = chatRepository.listLegacySessionIds()
    for (const rawId of rows) {
      if (!rawId) continue
      repairLegacyChatTarget(rawId)
    }
  }

  function cleanupLegacySessionContext(): void {
    const legacyIdPattern = /^(?:S\d+|legacy_(?:small|big)_[^,\]\s]+)$/i
    const rows = chatRepository.listSessionContextRows()

    for (const row of rows) {
      const targetId = String(row.id || '').trim()
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
        return chatRepository.hasSummaryRecordId(id)
      })
      if (nextLoadedIds.length !== loadedIds.length) {
        chatRepository.updateLoadedSummaryIds(targetId, JSON.stringify(nextLoadedIds))
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
          || String(row.virtual_weather_mode || 'real').trim() !== 'real'
          || String(row.bound_alias || '').trim()
        )

      if (shouldClearCopiedContext) {
        chatRepository.clearLegacyCopiedContext(targetId)
      }
    }
  }

  function ensureChatSession(targetId: string) {
    const exists = chatRepository.getSessionById(targetId)
    if (exists) return
    const type = targetId.startsWith('group_')
      ? 'group'
      : targetId.startsWith('crowd_')
        ? 'crowd'
        : 'char'
    chatRepository.ensureSession(targetId, targetId, type)
  }

  function toArchiveRecord(session: Record<string, any>) {
    const messageCount = chatRepository.countMessagesBySessionId(String(session.id || ''))
    const normalizedTargetId = normalizeChatTargetId(String(session.target_id || session.source_target_id || ''))
    const lastMessage = chatRepository.getLastMessageBySessionId(String(session.id || ''))
    const lastMessagePreview = sanitizeConversationNameSeed(lastMessage?.content)
    return {
      id: String(session.id || ''),
      targetId: normalizedTargetId,
      targetKind: normalizedTargetId.startsWith('group_')
        ? 'group'
        : normalizedTargetId.startsWith('crowd_')
          ? 'crowd'
          : 'character',
      name: String(session.archive_name || session.target_id || session.id || ''),
      category: String(session.archive_category || ''),
      messageCount,
      lastMessagePreview,
      linkedArchiveId: String(session.linked_archive_id || session.id || ''),
      createdAt: String(session.created_at || ''),
      updatedAt: String(session.updated_at || ''),
      sourceTargetId: normalizeChatTargetId(String(session.source_target_id || normalizedTargetId))
    }
  }

  function cloneSessionMessages(fromSessionId: string, toSessionId: string) {
    chatRepository.cloneMessagesToSession(fromSessionId, toSessionId)
    chatRepository.clonePromptLogsToSession?.(fromSessionId, toSessionId)
  }

  function repairOrphanChatArchives() {
    const orphanGroups = typeof chatRepository.listOrphanArchiveMessageGroups === 'function'
      ? chatRepository.listOrphanArchiveMessageGroups()
      : []
    for (const orphan of orphanGroups) {
      const archiveId = String(orphan.session_id || '').trim()
      if (!archiveId) continue
      const matchedSession = typeof chatRepository.findArchiveSessionWithSameMessageRange === 'function'
        ? chatRepository.findArchiveSessionWithSameMessageRange(
          Number(orphan.message_count || 0),
          String(orphan.first_message_at || ''),
          String(orphan.last_message_at || '')
        )
        : null
      const inferredTarget = matchedSession
        ? {
            targetId: normalizeChatTargetId(String(matchedSession.target_id || matchedSession.source_target_id || '')),
            targetType: String(matchedSession.target_type || 'char')
          }
        : (
            typeof chatRepository.inferArchiveTargetFromMessages === 'function'
              ? chatRepository.inferArchiveTargetFromMessages(archiveId)
              : { targetId: '', targetType: 'char' }
          )
      const targetId = normalizeChatTargetId(String(inferredTarget?.targetId || ''))
      const targetType = targetId.startsWith('group_')
        ? 'group'
        : targetId.startsWith('crowd_')
          ? 'crowd'
          : String(inferredTarget?.targetType || 'char')
      const matchedLocationParts = matchedSession
        ? resolveVirtualSceneLocationParts(
          matchedSession.virtual_location_large,
          matchedSession.virtual_location_middle,
          matchedSession.virtual_location_small,
          matchedSession.virtual_location
        )
        : { large: '', middle: '', small: '' }
      const createdAt = String(orphan.first_message_at || new Date().toISOString())
      const updatedAt = String(orphan.last_message_at || createdAt)
      chatRepository.insertArchivedSession({
        id: archiveId,
        targetId,
        targetType,
        archiveName: matchedSession
          ? String(matchedSession.archive_name || matchedSession.target_id || archiveId)
          : `恢复的聊天记录 ${createdAt.slice(0, 10)}`,
        archiveCategory: matchedSession ? String(matchedSession.archive_category || '') : '自动恢复',
        linkedArchiveId: archiveId,
        sourceTargetId: targetId,
        createdAt,
        loadedSummaryIds: matchedSession ? String(matchedSession.loaded_summary_ids || '[]') : '[]',
        virtualSceneName: matchedSession ? String(matchedSession.virtual_scene_name || '') : '',
        virtualSceneDesc: matchedSession ? String(matchedSession.virtual_scene_desc || '') : '',
        virtualLocationLarge: matchedLocationParts.large,
        virtualLocationMiddle: matchedLocationParts.middle,
        virtualLocationSmall: matchedLocationParts.small,
        virtualLocation: matchedSession
          ? composeVirtualSceneLocationLabel(
              matchedLocationParts.large,
              matchedLocationParts.middle,
              matchedLocationParts.small,
              matchedSession.virtual_location
            )
          : '',
        virtualSceneWorldId: matchedSession ? String(matchedSession.virtual_scene_world_id || '') : '',
        virtualLocationSheetId: matchedSession ? String(matchedSession.virtual_location_sheet_id || '') : '',
        virtualLocationFeatureId: matchedSession ? String(matchedSession.virtual_location_feature_id || '') : '',
        virtualRealLocation: matchedSession ? String(matchedSession.virtual_real_location || '') : '',
        virtualTime: matchedSession ? String(matchedSession.virtual_time || '') : '',
        virtualTimeAnchor: matchedSession ? Number(matchedSession.virtual_time_anchor || 0) : 0,
        virtualTimeBase: matchedSession ? Number(matchedSession.virtual_time_base || 0) : 0,
        virtualTimeRate: matchedSession ? Number(matchedSession.virtual_time_rate ?? 1) : 1,
        virtualWeather: matchedSession ? String(matchedSession.virtual_weather || '') : '',
        virtualWeatherMode: matchedSession ? String(matchedSession.virtual_weather_mode || 'real') : 'real',
        boundAlias: matchedSession ? String(matchedSession.bound_alias || '') : '',
        narrationFrequency: matchedSession ? String(matchedSession.narration_frequency || 'standard') : 'standard',
        narrationTemperature: matchedSession ? String(matchedSession.narration_temperature || 'standard') : 'standard',
        narrationProfiles: matchedSession ? String(matchedSession.narration_profiles || '[]') : '[]',
        chatFontScale: matchedSession ? Number(matchedSession.chat_font_scale ?? 1) : 1,
        tempModel: matchedSession ? String(matchedSession.temp_model || '') : '',
        tempPreset: matchedSession ? String(matchedSession.temp_preset || '') : '',
        updatedAt
      })
    }
  }

  function syncSessionIntoArchive(sessionId: string, session: Record<string, any>, archiveId: string, options: { name?: string; category?: string } = {}) {
    const archive = chatRepository.getArchivedSessionById(archiveId)
    if (!archive) return null
    const lastMessage = chatRepository.getLastMessageBySessionId(sessionId)
    const autoName = sanitizeConversationNameSeed(lastMessage?.content)
    const locationParts = resolveVirtualSceneLocationParts(
      session.virtual_location_large,
      session.virtual_location_middle,
      session.virtual_location_small,
      session.virtual_location
    )
    chatRepository.updateSessionById(archiveId, {
      target_id: String(session.target_id || sessionId),
      target_type: String(session.target_type || 'char'),
      archive_name: String(options.name || '').trim() || String(session.archive_name || '').trim() || autoName || String(session.target_id || sessionId),
      archive_category: String(options.category || '').trim() || String(session.archive_category || '').trim(),
      linked_archive_id: archiveId,
      source_target_id: String(session.target_id || sessionId),
      loaded_summary_ids: String(session.loaded_summary_ids || '[]'),
      virtual_scene_name: String(session.virtual_scene_name || ''),
      virtual_scene_desc: String(session.virtual_scene_desc || ''),
      virtual_location_large: locationParts.large,
      virtual_location_middle: locationParts.middle,
      virtual_location_small: locationParts.small,
      virtual_location: composeVirtualSceneLocationLabel(
        locationParts.large,
        locationParts.middle,
        locationParts.small,
        session.virtual_location
      ),
      virtual_real_location: String(session.virtual_real_location || ''),
      virtual_time: String(session.virtual_time || ''),
      virtual_time_anchor: Number(session.virtual_time_anchor || 0),
      virtual_time_base: Number(session.virtual_time_base || 0),
      virtual_time_rate: Number(session.virtual_time_rate || 1),
      virtual_weather: String(session.virtual_weather || ''),
      virtual_weather_mode: String(session.virtual_weather_mode || 'real'),
      bound_alias: String(session.bound_alias || ''),
      narration_frequency: String(session.narration_frequency || 'standard'),
      narration_temperature: String(session.narration_temperature || 'standard'),
      narration_profiles: String(session.narration_profiles || '[]'),
      narration_force_enabled: Number(session.narration_force_enabled || 0) ? 1 : 0,
      chat_font_scale: Number(session.chat_font_scale ?? 1),
      reply_pipeline_mode: normalizeChatSessionReplyPipelineMode(session.reply_pipeline_mode),
      temp_model: String(session.temp_model || ''),
      temp_preset: String(session.temp_preset || '')
    })
    chatRepository.replaceArchiveMessages(archiveId, sessionId)
    return toArchiveRecord(chatRepository.getArchivedSessionById(archiveId) as Record<string, any>)
  }

  function archiveChatSession(targetId: string, options: { name?: string; category?: string } = {}) {
    const sessionId = repairLegacyChatTarget(normalizeChatTargetId(targetId))
    ensureChatSession(sessionId)
    const session = chatRepository.getSessionById(sessionId)
    if (!session) return null

    const messageCount = chatRepository.countMessagesBySessionId(sessionId)
    if (messageCount <= 0) return null
    const lastMessage = chatRepository.getLastMessageBySessionId(sessionId)
    const autoName = sanitizeConversationNameSeed(lastMessage?.content)
    const baseName = String(options.name || '').trim()
      || String(session.archive_name || '').trim()
      || String(session.title || '').trim()
      || autoName
      || String(session.target_id || sessionId)
    chatRepository.updateSessionById(sessionId, {
      is_archived: 1,
      archive_name: baseName,
      archive_category: String(options.category || '').trim() || String(session.archive_category || '').trim(),
      linked_archive_id: sessionId,
      source_target_id: String(session.source_target_id || session.target_id || sessionId)
    })
    return toArchiveRecord(chatRepository.getSessionById(sessionId) as Record<string, any>)
  }

  function resetActiveChatMessages(targetId: string) {
    const sessionId = repairLegacyChatTarget(normalizeChatTargetId(targetId))
    ensureChatSession(sessionId)
    chatRepository.clearMessagesBySessionId(sessionId)
    chatRepository.clearPromptLogsBySessionId(sessionId)
    chatRepository.updateSessionById(sessionId, {
      archive_name: '',
      archive_category: '',
      linked_archive_id: ''
    })
    return sessionId
  }

  return createWorkspaceChatAppService({
    chatRepository,
    logger: serviceLogger,
    aiService: aiAppService,
    getAgentModelConfigs: readAgentModelConfigs,
    normalizeChatTargetId,
    repairLegacyChatTarget,
    repairAllLegacyChatTargets,
    cleanupLegacySessionContext,
    ensureChatSession,
    toArchiveRecord,
    repairOrphanChatArchives,
    archiveChatSession,
    resetActiveChatMessages,
    cloneSessionMessages,
    persist: () => db._save()
  })
}

export const workspaceChatFacadeService = createWorkspaceChatFacadeService()
