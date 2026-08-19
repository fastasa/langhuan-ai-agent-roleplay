import { toCamel } from '../shared/dbUtils.js'
import { WORKSPACE_AGENT_KINDS } from '../../../shared/agentSessionKinds.js'
import {
  FOCUSED_ACTION_SOURCE_KIND,
  normalizeFocusedActionVisibility,
  normalizeMessageSourceKind
} from '../../../shared/focusedAction.js'
import { callInternalAIJson } from '../ai/aiAppService.js'
import { buildImprovisedCharacterContext, buildImprovisedCharacterExtractionPrompt, normalizeImprovisedCharacterExtractionOutput, parseImprovisedCharacterCreateCommand } from '../../../src/app/improvisedCharacterCommand.js'
import {
  buildSessionTemporaryCharacterContext,
  buildSessionTemporaryCharacterProfilePrompt,
  buildTemporaryCharacterEvidenceJudgePrompt,
  calculateTemporaryCharacterConfidence,
  extractSessionTemporaryCharacterField,
  listSessionTemporaryCharacterUpdatedFields,
  mergeSessionTemporaryCharacterMarkdown,
  parseTemporaryCharacterEvidenceJudgeOutput,
  type SessionTemporaryCharacterSourceLedgerEntry
} from '../../../src/app/sessionTemporaryCharacterCommand.js'
import {
  buildTemporaryEntityContext,
  buildTemporaryEntityProfilePrompt,
  buildTemporaryEntityTags,
  getTemporaryEntityKindLabel,
  mergeTemporaryEntityMarkdown,
  normalizeTemporaryEntityKind,
  parseTemporaryEntityOrganizeCommand,
  stripTemporaryEntityMarkdownOutput,
  type TemporaryEntityCommand
} from '../../../src/app/temporaryEntityCommand.js'
import { parseCharacterCoreMarkdown } from '../../../src/app/characterCoreMarkdownTransfer.js'
import { resolveStatusPanelPresetForEntityKind } from '../../../src/app/statusSystemPresets.js'
import { normalizeChatSessionReplyPipelineMode } from '../../../src/app/chatReplyPipelineMode.js'
import {
  buildMessageProjectionPrompt,
  cleanMessageProjectionSourceText,
  normalizeMessageProjectionAgentOutput,
  type MessageProjectionEnv,
  type MessageProjectionParticipant,
  type MessageProjectionSourceMessage
} from '../../../src/app/messageProjectionAgent.js'
import {
  buildProjectionFirstMessageView
} from '../../../src/app/projectionFirstMessageView.js'
import {
  buildPersonalityModelContextBundle,
  type PersonalityPlanCandidate,
  type PersonalityRecallSections
} from '../../../src/app/personalityModelContext.js'
import {
  buildProjectionWritebackMatchPrompt,
  buildProjectionWritebackMergePrompt,
  buildProjectionWritebackSplitPrompt,
  normalizeProjectionWritebackMatchOutput,
  normalizeProjectionWritebackMergeOutput,
  normalizeProjectionWritebackSplitOutput,
  scoreProjectionWritebackTextSimilarity,
  type ProjectionWritebackEvent,
  type ProjectionWritebackMatchCandidate,
  type ProjectionWritebackPromptTrace,
  type ProjectionWritebackSource
} from '../../../src/app/personalityProjectionWriteback.js'
import {
  applyCharacterBrainWriteBackOutcome,
  createCharacterBrainTraceEventTreeNode,
  createNextCharacterBrainTraceDayTreeNode
} from '../../../src/app/characterBrainTreeModel.js'
import {
  readCharacterBrainCognitionNodes,
  readCharacterBrainTraceNodes
} from '../../../src/app/characterBrain.js'
import {
  buildRelationProfileExtractPrompt,
  buildRelationProfileSummary,
  mergeRelationProfileContent,
  normalizeRelationProfileExtractOutput,
  parseRelationProfileContent,
  type RelationProfileSource
} from '../../../src/app/relationProfileWriteback.js'
import type { Character } from '../../../src/types/index.js'
import type { CharacterBrainTraceNode, CharacterBrainWriteBackOutcome } from '../../../src/types/characterBrain.js'
// 批次3（2026-07-08 槽位收束 9→4）：服务端调用点同走任务分级表取档（改档只动表·与客户端同一份真值）。
import { buildTaskModelAiOptions, type ModelTaskId } from '../../../src/utils/modelTaskTiers.js'
import {
  decodeRecallActivityLogValue,
  serializeRecallActivityLogForStorage
} from '../../../shared/recallActivityLogCodec.js'
import { characterRepository as defaultCharacterRepository } from '../../repositories/characterRepository.js'
import { saveAvatarDataUri as defaultSaveAvatarDataUri } from '../../repositories/workspaceSnapshot/avatarStorage.js'
import { getActiveUserId } from '../../localWorkspace.js'
import { characterSnapshotService as defaultCharacterSnapshotService } from '../character/characterSnapshotService.js'
import { createAgentContextProjectionService } from '../agentContext/agentContextProjectionService.js'
import { createVersionedAgentContextCache } from '../agentContext/versionedAgentContextCache.js'
import { orchestrationPresenceAppService as defaultOrchestrationPresenceAppService } from '../orchestration/orchestrationPresenceAppService.js'
import { orchestrationWorkspaceProjectionService as defaultOrchestrationWorkspaceProjectionService } from '../orchestration/orchestrationWorkspaceProjectionService.js'
import { getActiveWorkspaceId } from '../../localWorkspace.js'
import { normalizeStatusPanelPresentation, validateStatusPanelPresentationValues } from '../../../shared/statusPanelPresentation.js'
import { removeStatusAssetFile, resolveStatusAssetFile, saveStatusAssetDataUri } from '../../repositories/statusAssetStorage.js'
import type { RimWorldPawnSnapshotV1 } from '../../../shared/rimworldBridge.js'

type WorkspaceAiContext = { userId?: string; role?: string; feature?: string; maxTokens?: number; thinking?: string; temperature?: number }
type WorkspaceRequestOptions = { userId?: string; rimworldPawnSnapshot?: RimWorldPawnSnapshotV1 }

type WorkspaceChatDeps = {
  chatRepository: any
  characterRepository?: any
  characterSnapshotService?: any
  orchestrationPresenceService?: { list: (sessionId: string, worldId?: string) => any }
  orchestrationWorkspaceProjectionService?: { read: (input: any, options?: any) => any }
  docLibraryRepository?: any
  logger: {
    error: (...args: any[]) => void
    warn?: (...args: any[]) => void
    debug?: (...args: any[]) => void
    ai?: (...args: any[]) => void
  }
  aiService?: {
    callAIWithFallback?: (
      presetName: string | undefined,
      model: string | undefined,
      messages: unknown[],
      stream: boolean,
      logger?: any,
      context?: WorkspaceAiContext
    ) => Promise<{ upstream?: Response; error?: string; status?: number; model?: string; presetName?: string }>
    // 可选：真实 aiAppService 单例上有这个方法，callInternalAIJson 用可选链调用它写 success 账本行；
    // 既有测试的极简 mock（只提供 callAIWithFallback）不声明它也不受影响（P0 记账收口·2026-07-12）。
    recordActualChatUsage?: (context: unknown, usage: unknown) => boolean
  }
  getAgentModelConfigs?: () => unknown[]
  saveAvatarDataUri?: (dataUri: string, fileName: string) => string
  normalizeChatTargetId: (targetId: string) => string
  repairLegacyChatTarget: (targetId: string) => string
  repairAllLegacyChatTargets: () => void
  cleanupLegacySessionContext: () => void
  ensureChatSession: (targetId: string) => void
  toArchiveRecord: (session: Record<string, any>) => any
  repairOrphanChatArchives?: () => void
  archiveChatSession: (targetId: string, options?: { name?: string; category?: string }) => any
  resetActiveChatMessages: (targetId: string) => string
  cloneSessionMessages: (fromSessionId: string, toSessionId: string) => void
  persist?: () => void
}

function toChatSessionTransport(session: Record<string, unknown> | null | undefined) {
  const item = toCamel(session || null) as Record<string, any> | null
  if (!item) return item
  const replyMode = normalizeChatSessionReplyPipelineMode(item.replyPipelineMode ?? item.reply_pipeline_mode)
  item.replyPipelineMode = replyMode
  item.reply_pipeline_mode = replyMode
  return item
}

function normalizeNarrationFrequency(value: unknown): string {
  const raw = String(value || '').trim()
  return raw === 'silent' || raw === 'active' ? raw : 'standard'
}

function normalizeNarrationTemperature(value: unknown): string {
  const raw = String(value || '').trim()
  if (raw === 'documentary' || raw === 'light' || raw === 'open' || raw === 'bloom') return raw
  return 'standard'
}

function normalizeNarrationProfilesPayload(value: unknown): string {
  if (Array.isArray(value)) return JSON.stringify(value)
  if (value && typeof value === 'object') return JSON.stringify([value])
  const text = String(value ?? '').trim()
  return text || '[]'
}

function normalizeChatFontScale(value: unknown): number {
  const raw = Number(value ?? 1)
  if (!Number.isFinite(raw)) return 1
  return Math.round(Math.min(1.25, Math.max(0.85, raw)) * 100) / 100
}

function trimText(value: unknown): string {
  return String(value ?? '').trim()
}

function normalizeReplyProbability(value: unknown): number {
  const parsed = Number(value ?? 100)
  return Number.isFinite(parsed)
    ? Math.max(0, Math.min(100, Math.round(parsed)))
    : 100
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

function hasOwnDefinedValue(source: Record<string, any>, keys: string[]): boolean {
  return keys.some((key) => Object.prototype.hasOwnProperty.call(source, key) && source[key] !== undefined)
}

// ── 状态栏积木骨架 ──
// 字段六型：text/number/list 普通值、ref 单位引用、binding 既有真值穿透、asset 正式不可变图片资产引用。
const STATUS_PANEL_FIELD_VALUE_TYPES = new Set(['text', 'number', 'list', 'ref', 'binding', 'asset'])
// binding 目标白名单：首发只支持角色卡外貌（可见资料）——真值仍在 characters.appearance，状态栏不落第二份。
const STATUS_PANEL_BINDING_TARGETS = new Set(['character.appearance'])
// user=用户/玩家本人（2026-07-10 用户拍板「玩家也要有状态栏」·一会话一用户故无 hostId）。
// character 仅保留旧数据兼容读取；任何新写都必须使用 session_character（hostId=participant id）。
const STATUS_PANEL_HOST_TYPES = new Set(['character', 'session_character', 'temp_entity', 'world_entity', 'user', 'none'])
const STATUS_PANEL_WRITABLE_HOST_TYPES = new Set(['session_character', 'temp_entity', 'world_entity', 'user', 'none'])

type StatusPanelFieldsResult = { ok: true; fields: Array<Record<string, any>> } | { ok: false; error: string }

function normalizeStatusPanelTemplateFields(value: unknown): StatusPanelFieldsResult {
  let parsed: unknown = value
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return { ok: true, fields: [] }
    try {
      parsed = JSON.parse(trimmed)
    } catch {
      return { ok: false, error: '字段定义不是合法 JSON' }
    }
  }
  if (parsed === undefined || parsed === null) return { ok: true, fields: [] }
  if (!Array.isArray(parsed)) return { ok: false, error: '字段定义必须是数组' }
  const fields: Array<Record<string, any>> = []
  const seenKeys = new Set<string>()
  for (const item of parsed as Array<Record<string, any>>) {
    const key = String(item?.key || '').trim()
    if (!key) return { ok: false, error: '字段 key 不能为空' }
    if (seenKeys.has(key)) return { ok: false, error: `字段 key 重复：${key}` }
    seenKeys.add(key)
    const valueType = String(item?.valueType || 'text').trim() || 'text'
    if (!STATUS_PANEL_FIELD_VALUE_TYPES.has(valueType)) {
      return { ok: false, error: `字段「${key}」的 valueType 不合法：${valueType}（可用：text/number/list/ref/binding/asset）` }
    }
    const binding = String(item?.binding || '').trim()
    if (valueType === 'binding') {
      if (!STATUS_PANEL_BINDING_TARGETS.has(binding)) {
        return { ok: false, error: `字段「${key}」的绑定目标不合法：${binding || '（空）'}（当前支持：character.appearance）` }
      }
    } else if (binding) {
      return { ok: false, error: `字段「${key}」不是 binding 类型，不能带绑定目标` }
    }
    const size = String(item?.size || '').trim()
    const unit = String(item?.unit || '').trim()
    const rawLabel = String(item?.label || '').trim() || key
    const fullWidthUnitSuffix = unit ? `（${unit}）` : ''
    const asciiUnitSuffix = unit ? `(${unit})` : ''
    const label = fullWidthUnitSuffix && rawLabel.endsWith(fullWidthUnitSuffix)
      ? rawLabel.slice(0, -fullWidthUnitSuffix.length).trim() || key
      : asciiUnitSuffix && rawLabel.endsWith(asciiUnitSuffix)
        ? rawLabel.slice(0, -asciiUnitSuffix.length).trim() || key
        : rawLabel
    fields.push({
      key,
      label,
      ...(unit ? { unit } : {}),
      valueType,
      ...(binding ? { binding } : {}),
      ...(size === 'short' || size === 'long' ? { size } : {}),
      description: String(item?.description || ''),
      ...(item?.defaultValue !== undefined ? { defaultValue: item.defaultValue } : {})
    })
  }
  return { ok: true, fields }
}

function parseStatusPanelTemplateFieldsOf(template: Record<string, any> | null | undefined): Array<Record<string, any>> {
  const raw = template?.fieldsJson ?? template?.fields_json
  if (Array.isArray(raw)) return raw
  try {
    const parsed = JSON.parse(String(raw ?? '[]') || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/** 实例自带字段快照（多维表格化批次B）：快照非空才算数——空串/损坏/'[]' 一律返回 null（读侧回退模板字段），
 *  与前端「fields 为空 → 回退模板」约定保持同一真值（UI 侧禁止把实例字段删光，避免出现有意义的空快照）。 */
function parseStatusPanelInstanceFieldsOf(panel: Record<string, any> | null | undefined): Array<Record<string, any>> | null {
  const raw = panel?.fieldsJson ?? panel?.fields_json
  if (Array.isArray(raw)) return raw.length ? raw : null
  const text = String(raw ?? '').trim()
  if (!text) return null
  try {
    const parsed = JSON.parse(text)
    return Array.isArray(parsed) && parsed.length ? parsed : null
  } catch {
    return null
  }
}

/** 状态栏字段真值单点（批次B 起）：实例快照优先，旧实例（无快照）回退模板字段。渲染/校验/引用检查都走这里。 */
function resolveStatusPanelFieldsOf(
  panel: Record<string, any> | null | undefined,
  template: Record<string, any> | null | undefined
): Array<Record<string, any>> {
  return parseStatusPanelInstanceFieldsOf(panel) ?? parseStatusPanelTemplateFieldsOf(template)
}

function parseStatusPanelValuesOf(panel: Record<string, any> | null | undefined): Record<string, any> {
  const raw = panel?.valuesJson ?? panel?.values_json
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, any>
  try {
    const parsed = JSON.parse(String(raw ?? '{}') || '{}')
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function statusPanelPresentationDiagnosticsOf(
  panel: Record<string, any>,
  template: Record<string, any> | null | undefined
) {
  const fields = resolveStatusPanelFieldsOf(panel, template)
  const normalized = normalizeStatusPanelPresentation(panel?.presentationJson ?? panel?.presentation_json ?? '', fields)
  return normalized.ok
    ? validateStatusPanelPresentationValues(normalized.presentation, parseStatusPanelValuesOf(panel))
    : [{ blockId: '', code: 'protocol_invalid' as const, message: normalized.errors.join('；') }]
}

function collectStatusPanelRefIds(fields: Array<Record<string, any>>, values: Record<string, any>): string[] {
  const refIds: string[] = []
  for (const field of fields) {
    if (String(field?.valueType || '') !== 'ref') continue
    const value = values[String(field?.key || '')]
    const list = Array.isArray(value) ? value : [value]
    for (const item of list) {
      const id = String(item ?? '').trim()
      if (id) refIds.push(id)
    }
  }
  return refIds
}

export function createWorkspaceChatAppService(deps: WorkspaceChatDeps) {
  const saveAvatarDataUri = deps.saveAvatarDataUri ?? defaultSaveAvatarDataUri
  // 跨请求复用；key 同时包含配方版本、视角/锚点和完整来源修订摘要，来源变化即自然失效。
  const agentContextProjectionCache = createVersionedAgentContextCache({ maxEntries: 256 })

  function persistSessionAvatar(sessionId: string, rawValue: unknown): string {
    const raw = String(rawValue ?? '').trim()
    if (!raw.startsWith('data:image/')) return raw
    const userId = getActiveUserId().trim().replace(/[^a-zA-Z0-9_-]/g, '_') || 'anonymous'
    const safeSessionId = String(sessionId || '').trim().replace(/[^a-zA-Z0-9_-]/g, '_') || 'session'
    return saveAvatarDataUri(raw, `chat_session_${userId}_${safeSessionId}`)
  }
  const {
    chatRepository,
    characterRepository = defaultCharacterRepository,
    characterSnapshotService = defaultCharacterSnapshotService,
    orchestrationPresenceService = defaultOrchestrationPresenceAppService,
    orchestrationWorkspaceProjectionService = defaultOrchestrationWorkspaceProjectionService,
    docLibraryRepository,
    logger,
    normalizeChatTargetId,
    repairLegacyChatTarget,
    repairAllLegacyChatTargets,
    cleanupLegacySessionContext,
    ensureChatSession,
    toArchiveRecord,
    archiveChatSession,
    resetActiveChatMessages,
    cloneSessionMessages
  } = deps

  /** 世界默认图纸只认 worlds.default_map_sheet_id；历史空值/脏引用稳定回退到最早有效图纸。 */
  function resolveWorldMapContext(worldId: string) {
    const normalizedWorldId = String(worldId || '').trim()
    if (!normalizedWorldId) return { world: null, sheets: [] as Array<Record<string, any>>, defaultSheetId: '' }
    const world = typeof chatRepository.findWorldById === 'function'
      ? chatRepository.findWorldById(normalizedWorldId) as Record<string, any> | null
      : null
    if (!world) return { world: null, sheets: [] as Array<Record<string, any>>, defaultSheetId: '' }
    const sheets = (typeof chatRepository.listMapSheets === 'function'
      ? chatRepository.listMapSheets(normalizedWorldId)
      : []) as Array<Record<string, any>>
    const requestedDefaultId = String(world.defaultMapSheetId ?? world.default_map_sheet_id ?? '').trim()
    const defaultSheetId = sheets.some((sheet) => String(sheet?.id || '') === requestedDefaultId)
      ? requestedDefaultId
      : String(sheets[0]?.id || '')
    return { world, sheets, defaultSheetId }
  }

  const curtainTransportDefaults: Record<string, unknown> = {
    virtualSceneName: '',
    virtualSceneDesc: '',
    virtualLocationLarge: '',
    virtualLocationMiddle: '',
    virtualLocationSmall: '',
    virtualLocation: '',
    virtualRealLocation: '',
    virtualTime: '',
    virtualTimeAnchor: 0,
    virtualTimeBase: 0,
    virtualTimeRate: 1,
    virtualWeather: '',
    virtualWeatherMode: 'real',
    virtualSceneWorldId: '',
    virtualLocationSheetId: '',
    virtualLocationFeatureId: ''
  }

  function sessionHasCurtainContent(session: Record<string, any> | null | undefined): boolean {
    if (!session) return false
    return [
      session.virtualSceneName, session.virtual_scene_name,
      session.virtualSceneDesc, session.virtual_scene_desc,
      session.virtualLocation, session.virtual_location,
      session.virtualLocationLarge, session.virtual_location_large,
      session.virtualLocationMiddle, session.virtual_location_middle,
      session.virtualLocationSmall, session.virtual_location_small,
      session.virtualRealLocation, session.virtual_real_location,
      session.virtualTime, session.virtual_time,
      session.virtualWeather, session.virtual_weather
    ].some((value) => String(value ?? '').trim())
  }

  /** 会话统一读模型：世界文档、默认图纸与帷幕世界坐标均从服务端当前真值即时投影。 */
  function toWorldScopedChatSessionTransport(session: Record<string, unknown> | null | undefined) {
    const transport = toChatSessionTransport(session)
    if (!transport) return transport
    const worldId = String(transport.worldId || '').trim()
    const mapContext = resolveWorldMapContext(worldId)
    const storedCurtainWorldId = String(transport.virtualSceneWorldId || '').trim()
    const curtainMatchesWorld = storedCurtainWorldId === worldId
    const storedSheetId = curtainMatchesWorld ? String(transport.virtualLocationSheetId || '').trim() : ''
    const resolvedSheetId = mapContext.sheets.some((sheet) => String(sheet?.id || '') === storedSheetId)
      ? storedSheetId
      : mapContext.defaultSheetId
    const storedFeatureId = curtainMatchesWorld ? String(transport.virtualLocationFeatureId || '').trim() : ''
    const feature = storedFeatureId && worldId && typeof chatRepository.findMapFeatureById === 'function'
      ? chatRepository.findMapFeatureById(storedFeatureId, worldId) as Record<string, any> | null
      : null
    const resolvedFeatureId = feature && String(feature.sheetId ?? feature.sheet_id ?? '') === resolvedSheetId
      ? storedFeatureId
      : ''
    const worldEntities = worldId && typeof chatRepository.listWorldEntities === 'function'
      ? chatRepository.listWorldEntities(worldId) as Array<Record<string, any>>
      : []
    return {
      ...transport,
      ...(curtainMatchesWorld ? {} : curtainTransportDefaults),
      worldName: String(mapContext.world?.name || ''),
      worldDocLibraryDocumentIds: worldId && typeof chatRepository.listWorldDocLinks === 'function'
        ? chatRepository.listWorldDocLinks(worldId)
        : [],
      worldEntityCount: worldEntities.length,
      worldEntitySummaries: worldEntities.slice(0, 80).map((entity) => ({
        id: String(entity?.id || ''),
        kind: String(entity?.kind || 'other'),
        name: String(entity?.name || '')
      })),
      worldDefaultMapSheetId: mapContext.defaultSheetId,
      worldMapSheets: mapContext.sheets.map((sheet) => ({ id: String(sheet?.id || ''), name: String(sheet?.name || '') })),
      curtainWorldId: curtainMatchesWorld ? worldId : '',
      virtualLocationSheetId: curtainMatchesWorld && storedSheetId === resolvedSheetId ? storedSheetId : '',
      curtainMapSheetId: curtainMatchesWorld ? resolvedSheetId : '',
      virtualLocationFeatureId: curtainMatchesWorld ? resolvedFeatureId : '',
      curtainMapFeatureName: curtainMatchesWorld && resolvedFeatureId ? String(feature?.name || '') : ''
    }
  }
  function getBrainAgentConfig(): Record<string, unknown> | null {
    const configs = typeof deps.getAgentModelConfigs === 'function' ? deps.getAgentModelConfigs() : []
    const items = Array.isArray(configs) ? configs : []
    return (items.find((item: any) => String(item?.id || '') === 'brain_agent') || items[0] || null) as Record<string, unknown> | null
  }

  function buildAgentSlotAiCallOptions(
    taskId: ModelTaskId,
    overrides: Parameters<typeof buildTaskModelAiOptions>[2] = {}
  ) {
    return buildTaskModelAiOptions(getBrainAgentConfig(), taskId, overrides)
  }

  // 消耗溯源：服务端 agent 调用的台账上下文。缺省并入「当前轮」（会话最新用户消息锚，轮中触发的
  // 临时角色/实体等按此归原轮总账）；传 opName 则铸独立操作单元 id（跨轮操作，如投影写轨迹）。
  function buildAgentUsageContext(sessionId: string, usageLabel: string, opName = '') {
    const normalizedSessionId = toText(sessionId)
    if (!normalizedSessionId) return { usageLabel, unitKind: 'agent_task' }
    const session = chatRepository.getSessionById(normalizedSessionId) as Record<string, unknown> | null
    const anchorId = !opName && typeof chatRepository.findRoundAnchorUserMessageId === 'function'
      ? chatRepository.findRoundAnchorUserMessageId(normalizedSessionId, Number.MAX_SAFE_INTEGER)
      : 0
    return {
      sessionId: normalizedSessionId,
      sessionLabel: toText(session?.title),
      roundId: opName
        ? `op:${opName}:${normalizedSessionId}:${Date.now().toString(36)}`
        : (anchorId > 0 ? `round:${normalizedSessionId}:${anchorId}` : ''),
      unitKind: 'agent_task',
      usageLabel
    }
  }

  function normalizeLoggedSummaryIds(value: unknown): string[] {
    if (Array.isArray(value)) {
      return value.map((item) => String(item || '').trim()).filter(Boolean)
    }
    if (typeof value === 'string') {
      const trimmed = value.trim()
      if (!trimmed) return []
      try {
        const parsed = JSON.parse(trimmed)
        return Array.isArray(parsed)
          ? parsed.map((item) => String(item || '').trim()).filter(Boolean)
          : [trimmed]
      } catch {
        return [trimmed]
      }
    }
    return []
  }

  function logSummarySessionTrace(stage: string, targetId: string, session: Record<string, any> | null | undefined, extra: Record<string, unknown> = {}) {
    if (process.env.LANGHUAN_DEBUG_SUMMARY_TRACE !== '1') return
    console.info('[summary-trace][server]', {
      stage,
      targetId,
      sessionId: String(session?.id || targetId || ''),
      loadedSummaryIds: normalizeLoggedSummaryIds(session?.loadedSummaryIds ?? session?.loaded_summary_ids),
      updatedAt: String(session?.updatedAt ?? session?.updated_at ?? ''),
      ...extra
    })
  }

  function persistChatMutation() {
    deps.persist?.()
  }

  function buildPromptLogId() {
    return `prompt_log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  }

  function buildImprovisedCharacterId() {
    return `improvised_character_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  }

  function buildSessionTemporaryCharacterId() {
    return `session_temp_character_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  }

  function buildSessionTemporaryEntityId(kind = 'entity') {
    return `session_temp_${String(kind || 'entity').replace(/[^a-z0-9_-]/gi, '_')}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  }

  function buildTemporaryParticipantId(sessionId: string) {
    return `participant_${sessionId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  }

  function buildStatusPanelTemplateId(kind = 'panel') {
    return `status_tpl_${String(kind || 'panel').replace(/[^a-z0-9_-]/gi, '_')}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  }

  function buildStatusPanelId(kind = 'panel') {
    return `status_panel_${String(kind || 'panel').replace(/[^a-z0-9_-]/gi, '_')}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  }

  function buildWorldId() {
    return `world_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  }

  function buildWorldEntityId(kind = 'entity') {
    const safeKind = String(kind || 'entity').trim().replace(/[^a-z0-9_-]+/gi, '_') || 'entity'
    return `world_entity_${safeKind}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  }

  // 世界 name/description 校验（世界管理页 P1：createWorldCore 与 PATCH 改名共用同一套边界）
  function validateWorldNameDescription(payload: Record<string, any>):
    | { ok: true; name: string; description: string }
    | { ok: false; status: number; error: string } {
    const name = String(payload?.name || '').trim()
    if (!name) {
      return { ok: false, status: 400, error: '世界名称不能为空' }
    }
    if (name.length > 50) {
      return { ok: false, status: 400, error: '世界名称过长（最多 50 字）' }
    }
    const description = String(payload?.description || '').slice(0, 500)
    return { ok: true, name, description }
  }

  // 世界创建核心（地图系统批2）：createWorld 与「一键创建并挂到会话」共用；成功返回落库后的世界行
  function createWorldCore(payload: Record<string, any>) {
    const validated = validateWorldNameDescription(payload)
    if (!validated.ok) {
      return { ok: false as const, status: validated.status, error: validated.error }
    }
    const now = new Date().toISOString()
    const row = {
      id: buildWorldId(),
      name: validated.name,
      description: validated.description,
      status: 'active',
      createdAt: now,
      updatedAt: now
    }
    chatRepository.upsertWorld(row)
    const saved = typeof chatRepository.findWorldById === 'function'
      ? chatRepository.findWorldById(row.id)
      : null
    return { ok: true as const, world: saved || row }
  }

  function buildMapSheetId() {
    return `map_sheet_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  }

  function buildMapFeatureId() {
    return `map_feat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  }

  // ── 地图版本历史（2026-07-12 批L）────────────────────────────
  let mapChangeLogSeq = 0
  function buildMapChangeLogId() {
    // 同毫秒批量写入需保持可排序：自增序号进 id（listMapChangeLog 按 created_at DESC, id DESC 排序，
    // 同一批 created_at 相同，靠 id 尾部序号稳定还原写入先后）
    mapChangeLogSeq = (mapChangeLogSeq + 1) % 1000000
    return `map_log_${Date.now()}_${String(mapChangeLogSeq).padStart(6, '0')}_${Math.random().toString(36).slice(2, 6)}`
  }

  /** 派发运行标识归一：取不到（用户手动/旧调用方没传）统一 'manual'。 */
  function normalizeMapRunMeta(value: unknown): { runKey: string; runLabel: string } {
    const source = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>
    return {
      runKey: String(source.runKey || '').trim() || 'manual',
      runLabel: String(source.runLabel || '').trim()
    }
  }

  /** 变更日志落库 + 每 world 修剪到最近 500 行（只修剪 world_map_change_log 本表）。
   *  snapshot=该笔操作后的要素快照（delete 传删除前最后快照），存 projectMapFeatureRow 视图形状。 */
  const MAP_CHANGE_LOG_KEEP = 500
  function appendMapChangeLog(
    worldId: string,
    runMeta: { runKey: string; runLabel: string },
    entries: Array<{ op: 'add' | 'update' | 'delete'; featureId: string; snapshot: Record<string, any> }>
  ) {
    if (!entries.length) return
    if (typeof chatRepository.insertMapChangeLog !== 'function') return
    const now = new Date().toISOString()
    for (const entry of entries) {
      let snapshotJson = ''
      try {
        snapshotJson = JSON.stringify(entry.snapshot || {})
      } catch {
        snapshotJson = ''
      }
      chatRepository.insertMapChangeLog({
        id: buildMapChangeLogId(),
        worldId,
        runKey: runMeta.runKey,
        runLabel: runMeta.runLabel,
        op: entry.op,
        featureId: entry.featureId,
        snapshotJson,
        createdAt: now
      })
    }
    if (typeof chatRepository.pruneMapChangeLog === 'function') {
      chatRepository.pruneMapChangeLog(worldId, MAP_CHANGE_LOG_KEEP)
    }
  }

  // 地图几何点集校验（批4）：[[x,y],…] 有限数值对，返回 null=非法；minCount 按 kind 区分（region 三点成面/path 两点成线/marker 单点）
  function sanitizeMapPoints(value: unknown, minCount = 1): Array<[number, number]> | null {
    if (!Array.isArray(value) || value.length < minCount) return null
    const pts: Array<[number, number]> = []
    for (const item of value) {
      if (!Array.isArray(item) || item.length < 2) return null
      const x = Number(item[0])
      const y = Number(item[1])
      if (!Number.isFinite(x) || !Number.isFinite(y)) return null
      pts.push([x, y])
    }
    return pts
  }

  // repository 行经 toCamel 后 JSON 列可能已被 parse 成对象（dbUtils.toCamel 对 {/[ 开头字符串自动 parse）；
  // 继承原行回写时必须归一回字符串，禁止 String()（对象会变 '[object Object]' 毁真值）
  function mapJsonColumnText(value: unknown): string {
    if (value == null || value === '') return ''
    if (typeof value === 'string') return value
    try {
      return JSON.stringify(value)
    } catch {
      return ''
    }
  }

  // 图纸/要素行 → 弹窗与绘舆共用的视图形状（JSON 列在这里统一 parse，前端与工具面拿到即用）
  function projectMapSheetRow(row: Record<string, any>) {
    const explored = parseJsonObject(row?.exploredJson ?? row?.explored_json)
    const exploredPts = sanitizeMapPoints(explored?.pts, 3)
    return {
      id: String(row?.id || ''),
      worldId: String(row?.worldId ?? row?.world_id ?? ''),
      name: String(row?.name || ''),
      explored: exploredPts ? { pts: exploredPts } : null,
      createdAt: String(row?.createdAt ?? row?.created_at ?? ''),
      updatedAt: String(row?.updatedAt ?? row?.updated_at ?? '')
    }
  }

  function projectMapFeatureRow(row: Record<string, any>) {
    const geometry = parseJsonObject(row?.geometryJson ?? row?.geometry_json)
    const style = parseJsonObject(row?.styleJson ?? row?.style_json)
    const links = parseJsonObject(row?.linksJson ?? row?.links_json)
    const meta = parseJsonObject(row?.metaJson ?? row?.meta_json)
    return {
      id: String(row?.id || ''),
      sheetId: String(row?.sheetId ?? row?.sheet_id ?? ''),
      worldId: String(row?.worldId ?? row?.world_id ?? ''),
      kind: String(row?.kind || ''),
      category: String(row?.category || ''),
      name: String(row?.name || ''),
      layer: String(row?.layer || 'terrain'),
      geometry,
      style: Object.keys(style).length ? style : null,
      links: Object.keys(links).length ? links : null,
      meta: Object.keys(meta).length ? meta : null,
      createdAt: String(row?.createdAt ?? row?.created_at ?? ''),
      updatedAt: String(row?.updatedAt ?? row?.updated_at ?? '')
    }
  }

  // 状态栏归属解析单点（地图系统批3）：会话挂世界→世界级（world_id 过滤·跨会话共享·session_id 退为创建来源）；
  // 未挂→会话级现状零变化。所有状态栏读写（HTTP service/临时实体自动挂卡/转正迁移）都过这里，工具签名零变化。
  function resolveStatusPanelWorldScope(sessionId: string): { session: Record<string, any> | null; worldId: string } {
    const session = chatRepository.getSessionById(sessionId) as Record<string, any> | null
    return {
      session: session || null,
      worldId: String(session?.world_id ?? session?.worldId ?? '').trim()
    }
  }

  function buildLegacyCharacterStatusPanelMigrationPreview() {
    const panels = typeof chatRepository.listLegacyCharacterStatusPanels === 'function'
      ? chatRepository.listLegacyCharacterStatusPanels()
      : []
    const items = (Array.isArray(panels) ? panels : []).map((panel: Record<string, any>) => {
      const sourceSessionId = String(panel?.sessionId ?? panel?.session_id ?? '').trim()
      const characterId = String(panel?.hostId ?? panel?.host_id ?? '').trim()
      const session = sourceSessionId ? chatRepository.getSessionById?.(sourceSessionId) : null
      const candidates = session
        ? (chatRepository.listSessionParticipants?.(sourceSessionId) || [])
          .filter((participant: Record<string, any>) => (
            String(participant?.participantType ?? participant?.participant_type ?? '') === 'char'
            && String(participant?.participantTargetId ?? participant?.participant_target_id ?? '') === characterId
          ))
        : []
      const status = !session
        ? 'missing_session'
        : candidates.length === 1
          ? 'migratable'
          : candidates.length > 1 ? 'ambiguous' : 'missing_participant'
      return {
        panelId: String(panel?.id || ''),
        panelName: String(panel?.name || ''),
        sourceSessionId,
        sessionTitle: String(session?.title || sourceSessionId),
        worldId: String(panel?.worldId ?? panel?.world_id ?? ''),
        characterId,
        currentHostType: 'character',
        expectedVersion: Math.max(1, Number(panel?.version || 1)),
        candidateParticipantIds: candidates.map((participant: Record<string, any>) => String(participant?.id || '')).filter(Boolean),
        targetParticipantId: candidates.length === 1 ? String(candidates[0]?.id || '') : '',
        status
      }
    })
    return {
      zeroWrite: true,
      total: items.length,
      migratable: items.filter((item) => item.status === 'migratable').length,
      blocked: items.filter((item) => item.status !== 'migratable').length,
      items
    }
  }

  /** 临时实体在两张表（entities + 旧 temporary_characters）的联合查找：角色类整理命令落旧表，单查 entities 会漏。 */
  function findSessionTemporaryEntityUnified(sessionId: string, entityId: string): Record<string, any> | null {
    const fromEntities = typeof chatRepository.findSessionTemporaryEntityById === 'function'
      ? chatRepository.findSessionTemporaryEntityById(sessionId, entityId)
      : null
    if (fromEntities) return fromEntities
    const fromCharacters = typeof chatRepository.findSessionTemporaryCharacterById === 'function'
      ? chatRepository.findSessionTemporaryCharacterById(sessionId, entityId)
      : null
    if (!fromCharacters) return null
    // 旧临时角色行投影成实体形态（与 listSessionTemporaryEntities 联合视图同口径）
    return {
      ...fromCharacters,
      kind: 'character',
      tagsJson: '[]',
      persistedTargetJson: fromCharacters.persistedTargetJson ?? fromCharacters.persisted_target_json ?? '{}'
    }
  }

  /** 批次4 融合：新临时实体自动挂一张状态栏（temp_entity 宿主）。
   *  模板按 kind 复用会话内既有积木，没有则用内置预设建（statusSystemPresets 单点）；
   *  event_note 不是实体不挂；已有状态栏不重复挂（用户拍板：只挂新的，存量不批量补）。 */
  function ensureStatusPanelForTemporaryEntity(sessionId: string, entity: Record<string, any> | null | undefined) {
    // 仓储不带状态栏能力（旧测试 mock）时整体跳过，与本文件可选方法 typeof 护栏惯例一致
    if (typeof chatRepository.upsertStatusPanelTemplate !== 'function' || typeof chatRepository.upsertStatusPanel !== 'function') return null
    const entityId = String(entity?.id || '').trim()
    const entityName = String(entity?.name || '').trim()
    const preset = resolveStatusPanelPresetForEntityKind(String(entity?.kind || 'character'))
    if (!entityId || !entityName || !preset) return null
    // 批3：自动挂卡跟随会话归属——挂世界的会话给临时实体建的卡直接落世界级（宿主实体仍是会话级，转正时随迁）
    const { worldId } = resolveStatusPanelWorldScope(sessionId)
    const panels = typeof chatRepository.listStatusPanels === 'function'
      ? chatRepository.listStatusPanels(sessionId, worldId)
      : []
    const already = (Array.isArray(panels) ? panels : []).some((panel: Record<string, any>) => (
      String(panel?.hostType ?? panel?.host_type ?? '') === 'temp_entity'
      && String(panel?.hostId ?? panel?.host_id ?? '') === entityId
    ))
    if (already) return null
    const now = new Date().toISOString()
    const templates = typeof chatRepository.listStatusPanelTemplates === 'function'
      ? chatRepository.listStatusPanelTemplates(sessionId, worldId)
      : []
    let template = (Array.isArray(templates) ? templates : [])
      .find((item: Record<string, any>) => String(item?.kind || '') === preset.kind) || null
    if (!template) {
      const templateRow = {
        id: buildStatusPanelTemplateId(preset.kind),
        sessionId,
        kind: preset.kind,
        name: preset.name,
        description: preset.description,
        fieldsJson: JSON.stringify(preset.fields),
        presentationJson: preset.presentation ? JSON.stringify(preset.presentation) : '',
        createdBy: 'agent',
        worldId,
        status: 'active',
        version: 1,
        createdAt: now,
        updatedAt: now
      }
      chatRepository.upsertStatusPanelTemplate(templateRow)
      template = templateRow
    }
    const panelRow = {
      id: buildStatusPanelId(preset.kind),
      sessionId,
      templateId: String(template.id || ''),
      name: entityName,
      description: `${preset.description}；当前实例用于记录「${entityName}」。`,
      hostType: 'temp_entity',
      hostId: entityId,
      valuesJson: '{}',
      // 批次B：新实例从模板拷贝字段快照（之后各自演化，改模板不影响已建实例）
      fieldsJson: jsonColumnText(template.fieldsJson ?? template.fields_json, []),
      // 展示配置与字段一样是实例快照：后续改模板不追改旧卡。
      presentationJson: String(template.presentationJson ?? template.presentation_json ?? ''),
      worldId,
      status: 'active',
      version: 1,
      createdAt: now,
      updatedAt: now
    }
    const autoIdempotencyKey = `status:auto-temp:${sessionId}:${worldId}:${entityId}:${panelRow.id}`
    const createPanel = () => {
      if (typeof chatRepository.insertStatusPanel === 'function') chatRepository.insertStatusPanel(panelRow)
      else chatRepository.upsertStatusPanel(panelRow)
      chatRepository.insertStatusPanelEvent?.({
        id: statusPanelEventId(),
        panelId: panelRow.id,
        sessionId,
        worldId,
        eventType: 'created',
        fromVersion: 0,
        toVersion: 1,
        patchJson: JSON.stringify({ autoTemporaryEntity: true, hostType: 'temp_entity', hostId: entityId }),
        source: 'temporary_entity_organizer',
        idempotencyKey: autoIdempotencyKey,
        createdAt: now
      })
    }
    if (typeof chatRepository.runStatusPanelTransaction === 'function') chatRepository.runStatusPanelTransaction(createPanel)
    else createPanel()
    return panelRow
  }

  /** 临时非角色实体转正后，名下状态栏宿主跟随迁到世界实体；角色不自动加入成员，不能猜造 session_character。 */
  function migrateTemporaryEntityStatusPanels(
    sessionId: string,
    entityId: string,
    target: { hostType: 'world_entity'; hostId: string; worldId?: string }
  ) {
    if (typeof chatRepository.upsertStatusPanel !== 'function') return []
    const { worldId: currentWorldId } = resolveStatusPanelWorldScope(sessionId)
    const targetWorldId = String(target.worldId || '').trim()
    const scopedPanels = typeof chatRepository.listStatusPanels === 'function'
      ? chatRepository.listStatusPanels(sessionId, targetWorldId || currentWorldId)
      : []
    const localPanels = targetWorldId && typeof chatRepository.listStatusPanels === 'function'
      ? chatRepository.listStatusPanels(sessionId, '')
      : []
    const panels = [...(Array.isArray(scopedPanels) ? scopedPanels : []), ...(Array.isArray(localPanels) ? localPanels : [])]
    const now = new Date().toISOString()
    const migrated: string[] = []
    for (const panel of panels as Array<Record<string, any>>) {
      if (String(panel?.hostType ?? panel?.host_type ?? '') !== 'temp_entity') continue
      if (String(panel?.hostId ?? panel?.host_id ?? '') !== String(entityId)) continue
      chatRepository.upsertStatusPanel({
        id: String(panel.id || ''),
        sessionId: String(panel.sessionId ?? panel.session_id ?? sessionId) || sessionId,
        templateId: String(panel.templateId ?? panel.template_id ?? ''),
        name: String(panel.name || ''),
        description: String(panel.description || ''),
        hostType: target.hostType,
        hostId: target.hostId,
        valuesJson: jsonColumnText(panel.valuesJson ?? panel.values_json, {}),
        // 批次B：宿主迁移透传实例字段快照（upsert 不带会被抹回默认）
        fieldsJson: String(panel.fieldsJson ?? panel.fields_json ?? ''),
        presentationJson: String(panel.presentationJson ?? panel.presentation_json ?? ''),
        // 批3：透传世界归属（世界级卡在别的会话转正宿主时，session_id/world_id 都不能被抹）
        worldId: targetWorldId || String(panel.worldId ?? panel.world_id ?? '') || currentWorldId,
        status: String(panel.status || 'active') || 'active',
        version: Math.max(1, Number(panel.version || 1)),
        createdAt: String(panel.createdAt ?? panel.created_at ?? '') || now,
        updatedAt: now
      })
      migrated.push(String(panel.id || ''))
    }
    return migrated
  }

  function resolveStatusPanelCharacterTarget(panel: Record<string, any> | null | undefined) {
    const hostType = String(panel?.hostType ?? panel?.host_type ?? '')
    const hostId = String(panel?.hostId ?? panel?.host_id ?? '').trim()
    const sessionId = String(panel?.sessionId ?? panel?.session_id ?? '').trim()
    if (!hostId) return null
    if (hostType !== 'session_character' || !sessionId) return null
    const participant = (chatRepository.listSessionParticipants?.(sessionId) || [])
      .find((row: Record<string, any>) => String(row?.id || '').trim() === hostId)
    const participantType = String(participant?.participantType ?? participant?.participant_type ?? '')
    const characterId = String(participant?.participantTargetId ?? participant?.participant_target_id ?? '').trim()
    if (!participant || participantType !== 'char' || !characterId) {
      throw new Error('状态栏的会话角色宿主不存在或不属于当前会话')
    }
    const resolved = resolveSessionCharacterState(sessionId, characterId, participant)
    return { characterId, participantId: hostId, ...resolved }
  }

  // binding 字段读侧解析：真值住在解析后的主线/会话独立分支，返回 {字段key: 当前真值} 随实例下发。
  function resolveStatusPanelBindingValues(panel: Record<string, any> | null | undefined, fields: Array<Record<string, any>>) {
    const result: Record<string, string> = {}
    const bindingFields = fields.filter((field) => String(field?.valueType || '') === 'binding')
    if (!bindingFields.length) return result
    const target = resolveStatusPanelCharacterTarget(panel)
    if (!target) return result
    for (const field of bindingFields) {
      if (String(field?.binding || '') === 'character.appearance') {
        result[String(field?.key || '')] = String(target.character?.appearance || '')
      }
    }
    return result
  }

  function patchStatusPanelCharacterBinding(panel: Record<string, any>, binding: string, value: string) {
    if (binding !== 'character.appearance') return
    const target = resolveStatusPanelCharacterTarget(panel)
    if (!target || String(panel?.hostType ?? panel?.host_type ?? '') !== 'session_character') {
      throw new Error('绑定字段只允许写入会话角色宿主')
    }
    if (target.mode === 'independent_snapshot') {
      characterSnapshotService.patchSessionCharacterBranch(target.characterId, target.branchId, { appearance: value })
      return
    }
    if (typeof characterRepository.patchCharacterAppearance !== 'function') {
      throw new Error('角色外貌写入口不可用')
    }
    characterRepository.patchCharacterAppearance(target.characterId, value)
  }

  function normalizeStatusPanelExpectedVersion(value: unknown) {
    const version = Number(value)
    return Number.isInteger(version) && version >= 0 ? version : null
  }

  function normalizeStatusPanelDescription(value: unknown) {
    return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, 600)
  }

  function buildStatusPanelDescription(options: {
    provided?: unknown
    existing?: Record<string, any> | null
    template?: Record<string, any> | null
    name: string
    fields: Array<Record<string, any>>
  }) {
    const provided = options.provided === undefined ? '' : normalizeStatusPanelDescription(options.provided)
    if (provided) return provided
    const existing = normalizeStatusPanelDescription(options.existing?.description)
    if (existing) return existing
    const template = normalizeStatusPanelDescription(options.template?.description)
    if (template) return template
    const labels = options.fields
      .map((field) => String(field?.label || field?.key || '').trim())
      .filter(Boolean)
      .slice(0, 8)
    return labels.length
      ? `记录「${options.name}」中的${labels.join('、')}。`
      : `记录「${options.name}」的状态与后续变化。`
  }

  function statusPanelEventId() {
    return `status_event_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
  }

  function jsonColumnText(value: unknown, fallback: unknown) {
    if (typeof value === 'string') {
      const trimmed = value.trim()
      if (!trimmed) return JSON.stringify(fallback)
      try {
        JSON.parse(trimmed)
        return trimmed
      } catch {
        return JSON.stringify(fallback)
      }
    }
    return JSON.stringify(value ?? fallback)
  }

  function normalizeJsonList(value: unknown): string {
    if (typeof value === 'string') {
      const trimmed = value.trim()
      if (!trimmed) return '[]'
      try {
        const parsed = JSON.parse(trimmed)
        return JSON.stringify(Array.isArray(parsed) ? parsed : [])
      } catch {
        return JSON.stringify(trimmed.split(/[,\n，、]/).map(item => item.trim()).filter(Boolean))
      }
    }
    return JSON.stringify(Array.isArray(value) ? value : [])
  }

  function parseJsonArray(value: unknown): any[] {
    if (Array.isArray(value)) return value
    if (typeof value !== 'string') return []
    const trimmed = value.trim()
    if (!trimmed) return []
    try {
      const parsed = JSON.parse(trimmed)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }

  function parseJsonObject(value: unknown): Record<string, any> {
    if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, any>
    if (typeof value !== 'string') return {}
    const trimmed = value.trim()
    if (!trimmed) return {}
    try {
      const parsed = JSON.parse(trimmed)
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
    } catch {
      return {}
    }
  }

  function ensureImprovisedCharacterGroup() {
    const groups = typeof characterRepository.getCharacterGroups === 'function'
      ? characterRepository.getCharacterGroups()
      : []
    const normalizedGroups = Array.isArray(groups) ? groups : []
    const existingByName = normalizedGroups.find((group: Record<string, unknown>) => String(group?.name || '').trim() === '即兴角色')
    if (existingByName?.id) return existingByName

    const legacyByName = normalizedGroups.find((group: Record<string, unknown>) => String(group?.name || '').trim() === '临时角色')
    if (legacyByName?.id) {
      const migratedGroup = {
        ...legacyByName,
        name: '即兴角色',
        emoji: String(legacyByName.emoji || '👥'),
        orderIndex: Number(legacyByName.orderIndex ?? legacyByName.order_index ?? 0)
      }
      if (typeof characterRepository.updateCharacterGroup === 'function') {
        characterRepository.updateCharacterGroup(String(migratedGroup.id), migratedGroup.name, migratedGroup.emoji, migratedGroup.orderIndex)
      }
      return migratedGroup
    }

    const preferredId = 'improvised_characters'
    const hasPreferredId = normalizedGroups.some((group: Record<string, unknown>) => String(group?.id || '') === preferredId)
    const groupId = hasPreferredId ? `improvised_characters_${Date.now()}_${Math.random().toString(36).slice(2, 8)}` : preferredId
    const maxOrderIndex = normalizedGroups.reduce((max: number, group: Record<string, unknown>) => {
      return Math.max(max, Number(group?.orderIndex ?? group?.order_index ?? 0))
    }, 0)
    const group = {
      id: groupId,
      name: '即兴角色',
      emoji: '👥',
      orderIndex: maxOrderIndex + 1
    }
    characterRepository.insertCharacterGroup(group.id, group.name, group.emoji, group.orderIndex)
    return group
  }

  function buildRecallActivityLogId() {
    return `recall_activity_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  }

  function normalizeJsonText(value: unknown, fallback: unknown) {
    if (typeof value === 'string') {
      const trimmed = value.trim()
      if (!trimmed) return JSON.stringify(fallback)
      try {
        JSON.parse(trimmed)
        return trimmed
      } catch {
        return JSON.stringify(fallback)
      }
    }
    try {
      return JSON.stringify(value ?? fallback)
    } catch {
      return JSON.stringify(fallback)
    }
  }

  function toText(value: unknown): string {
    return String(value ?? '').trim()
  }

  function normalizeGenerationAttemptPayload(sessionId: string, payload: Record<string, any>) {
    const now = new Date().toISOString()
    const mode = ['clean', 'prompt_replay'].includes(toText(payload?.mode))
      ? toText(payload?.mode)
      : 'clean'
    const status = ['running', 'completed', 'failed', 'superseded'].includes(toText(payload?.status))
      ? toText(payload?.status)
      : 'running'
    return {
      id: toText(payload?.id) || `generation_attempt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      sessionId,
      anchorMessageId: Number(payload?.anchorMessageId ?? payload?.anchor_message_id ?? 0) || 0,
      parentAttemptId: toText(payload?.parentAttemptId ?? payload?.parent_attempt_id),
      triggerType: toText(payload?.triggerType ?? payload?.trigger_type) || 'normal_send',
      mode,
      status,
      targetId: toText(payload?.targetId ?? payload?.target_id),
      speakerName: toText(payload?.speakerName ?? payload?.speaker_name),
      tidiaoRunId: toText(payload?.tidiaoRunId ?? payload?.tidiao_run_id),
      assistantMessageIdsJson: normalizeJsonText(payload?.assistantMessageIds ?? payload?.assistant_message_ids_json, []),
      replacedMessageIdsJson: normalizeJsonText(payload?.replacedMessageIds ?? payload?.replaced_message_ids_json, []),
      sourcePromptLogId: toText(payload?.sourcePromptLogId ?? payload?.source_prompt_log_id),
      outputPromptLogId: toText(payload?.outputPromptLogId ?? payload?.output_prompt_log_id),
      errorJson: normalizeJsonText(payload?.errorJson ?? payload?.error_json, {}),
      createdAt: toText(payload?.createdAt ?? payload?.created_at) || now,
      updatedAt: toText(payload?.updatedAt ?? payload?.updated_at) || now
    }
  }

  function normalizeGenerationAttemptPatch(payload: Record<string, any>) {
    const fields: Record<string, unknown> = {}
    if (payload.status !== undefined) fields.status = ['running', 'completed', 'failed', 'superseded'].includes(toText(payload.status)) ? toText(payload.status) : 'running'
    if (payload.assistantMessageIds !== undefined || payload.assistant_message_ids_json !== undefined) fields.assistant_message_ids_json = normalizeJsonText(payload.assistantMessageIds ?? payload.assistant_message_ids_json, [])
    if (payload.replacedMessageIds !== undefined || payload.replaced_message_ids_json !== undefined) fields.replaced_message_ids_json = normalizeJsonText(payload.replacedMessageIds ?? payload.replaced_message_ids_json, [])
    if (payload.sourcePromptLogId !== undefined || payload.source_prompt_log_id !== undefined) fields.source_prompt_log_id = toText(payload.sourcePromptLogId ?? payload.source_prompt_log_id)
    if (payload.outputPromptLogId !== undefined || payload.output_prompt_log_id !== undefined) fields.output_prompt_log_id = toText(payload.outputPromptLogId ?? payload.output_prompt_log_id)
    if (payload.errorJson !== undefined || payload.error_json !== undefined) fields.error_json = normalizeJsonText(payload.errorJson ?? payload.error_json, {})
    fields.updated_at = new Date().toISOString()
    return fields
  }

  function normalizeGenerationAttemptArtifactPayload(sessionId: string, payload: Record<string, any>) {
    const now = new Date().toISOString()
    return {
      id: toText(payload?.id) || `generation_artifact_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      attemptId: toText(payload?.attemptId ?? payload?.attempt_id),
      sessionId,
      artifactKind: toText(payload?.artifactKind ?? payload?.artifact_kind) || 'metadata',
      messageId: Number(payload?.messageId ?? payload?.message_id ?? 0) || 0,
      promptLogId: toText(payload?.promptLogId ?? payload?.prompt_log_id),
      recallActivityLogId: toText(payload?.recallActivityLogId ?? payload?.recall_activity_log_id),
      payloadJson: normalizeJsonText(payload?.payload ?? payload?.payloadJson ?? payload?.payload_json, {}),
      createdAt: toText(payload?.createdAt ?? payload?.created_at) || now
    }
  }

  function toGenerationAttemptEntry(row: Record<string, any> | null | undefined) {
    if (!row) return null
    const item = toCamel(row) as Record<string, any>
    item.assistantMessageIds = parseJsonArray(item.assistantMessageIdsJson ?? item.assistant_message_ids_json)
    item.replacedMessageIds = parseJsonArray(item.replacedMessageIdsJson ?? item.replaced_message_ids_json)
    item.preCapsResidueState = parseJsonObject(item.preCapsResidueStateJson ?? item.pre_caps_residue_state_json)
    item.postCapsResidueState = parseJsonObject(item.postCapsResidueStateJson ?? item.post_caps_residue_state_json)
    item.errorJson = parseJsonObject(item.errorJson ?? item.error_json)
    return item
  }

  function toGenerationAttemptArtifactEntry(row: Record<string, any> | null | undefined) {
    if (!row) return null
    const item = toCamel(row) as Record<string, any>
    item.payload = parseJsonObject(item.payloadJson ?? item.payload_json)
    return item
  }

  function toMessageProjectionObservationEntry(row: Record<string, any> | null | undefined) {
    if (!row) return null
    const item = toCamel(row) as Record<string, any>
    item.audienceIds = parseJsonArray(item.audienceIdsJson ?? item.audience_ids_json)
    item.audienceNames = parseJsonArray(item.audienceNamesJson ?? item.audience_names_json)
    item.participants = parseJsonArray(item.participantsJson ?? item.participants_json)
    item.startEnv = parseJsonObject(item.startEnvJson ?? item.start_env_json)
    item.endEnv = parseJsonObject(item.endEnvJson ?? item.end_env_json)
    item.changed = parseJsonObject(item.changedJson ?? item.changed_json)
    item.sourceProjectionIds = parseJsonArray(item.sourceProjectionIdsJson ?? item.source_projection_ids_json)
    return item
  }

  function shouldInvalidateAffectTideForMessagePayload(body: Record<string, any>) {
    return [
      'content',
      'envDate',
      'env_date',
      'envWeather',
      'env_weather',
      'envLocation',
      'env_location',
      'messageKind',
      'message_kind',
      'includeInContext',
      'include_in_context',
      'autoWriteHidden',
      'auto_write_hidden',
      'versionList',
      'versionsJson',
      'versions_json',
      'activeVersionIndex',
      'active_version_index'
    ].some((key) => Object.prototype.hasOwnProperty.call(body || {}, key))
  }

  function markAffectTideStaleFromMessage(sessionId: string, msgId: string | number, reason: string) {
    if (typeof chatRepository.markAffectTideStaleFromMessage !== 'function') return
    chatRepository.markAffectTideStaleFromMessage(sessionId, msgId, reason)
  }

  function deleteAffectTideFromMessage(sessionId: string, msgId: string | number, mode: 'from_message' | 'referenced') {
    if (typeof chatRepository.deleteAffectTideFromMessage !== 'function') {
      markAffectTideStaleFromMessage(sessionId, msgId, mode === 'from_message' ? 'message_updated' : 'message_deleted')
      return
    }
    chatRepository.deleteAffectTideFromMessage(sessionId, msgId, mode)
  }

  function parsePromptBlocks(value: unknown) {
    if (Array.isArray(value)) return value
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value)
        return Array.isArray(parsed) ? parsed : []
      } catch {
        return []
      }
    }
    return []
  }

  function isSupportedChatMessageKind(value: string) {
    return ['chat', 'narration', 'narration_debug', 'caps_reply', 'system'].includes(value)
  }

  function normalizeMessageNoteSourceMode(value: unknown) {
    return String(value || '').trim() === 'selection' ? 'selection' : 'message'
  }

  function createMessageNoteId() {
    return `chat_note_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
  }

  function buildMessageNotePayload(sessionId: string, payload: Record<string, any>) {
    const now = new Date().toISOString()
    return {
      id: String(payload.id || createMessageNoteId()).trim(),
      messageId: Number(payload.messageId ?? payload.message_id ?? 0),
      sourceMode: normalizeMessageNoteSourceMode(payload.sourceMode ?? payload.source_mode),
      sourceText: String(payload.sourceText ?? payload.source_text ?? '').trim().slice(0, 50000),
      messageSnapshot: String(payload.messageSnapshot ?? payload.message_snapshot ?? '').trim().slice(0, 50000),
      messageIndex: Math.max(0, Number(payload.messageIndex ?? payload.message_index ?? 0) || 0),
      floorLabel: String(payload.floorLabel ?? payload.floor_label ?? '').trim().slice(0, 80),
      speakerName: String(payload.speakerName ?? payload.speaker_name ?? '').trim().slice(0, 120),
      role: String(payload.role || '').trim().slice(0, 40),
      envDate: String(payload.envDate ?? payload.env_date ?? '').trim().slice(0, 160),
      envWeather: String(payload.envWeather ?? payload.env_weather ?? '').trim().slice(0, 120),
      envLocation: String(payload.envLocation ?? payload.env_location ?? '').trim().slice(0, 240),
      model: String(payload.model || '').trim().slice(0, 160),
      createdAt: String(payload.createdAt ?? payload.created_at ?? now) || now,
      updatedAt: String(payload.updatedAt ?? payload.updated_at ?? now) || now,
      sessionId
    }
  }

  function normalizePromptLogMessageKind(value: unknown) {
    const raw = String(value || '').trim()
    if (raw === 'narration') return 'narration'
    if (raw === 'narration_debug') return 'narration_debug'
    if (raw === 'caps_reply') return 'caps_reply'
    return 'chat'
  }

  function isProjectionPromptLogKind(value: unknown) {
    return ['message_projection', 'manual_projection'].includes(String(value || '').trim())
  }

  function buildPromptLogIndexMeta(sessionId: string) {
    const rows = typeof chatRepository.listPromptLogIndexRowsBySessionId === 'function'
      ? chatRepository.listPromptLogIndexRowsBySessionId(sessionId)
      : []
    const messageRows: Array<{ messageId: string; messageKind: string }> = []
    const seenMessageIds = new Set<string>()
    rows.forEach((row: Record<string, any>) => {
      const messageId = String(row.assistantMessageId || row.assistant_message_id || '').trim()
      if (!messageId || seenMessageIds.has(messageId)) return
      seenMessageIds.add(messageId)
      messageRows.push({
        messageId,
        messageKind: normalizePromptLogMessageKind(row.messageKind ?? row.message_kind)
      })
    })
    const totalCount = messageRows.length
    const kindTotals: Record<string, number> = { chat: 0, narration: 0, narration_debug: 0, caps_reply: 0 }
    const kindSeen: Record<string, number> = { chat: 0, narration: 0, narration_debug: 0, caps_reply: 0 }
    messageRows.forEach((row) => {
      kindTotals[row.messageKind] = (kindTotals[row.messageKind] || 0) + 1
    })
    const promptLogPairsByMessageId: Record<string, { hasReply: boolean; hasProjection: boolean }> = {}
    rows.forEach((row: Record<string, any>) => {
      const messageId = String(row.assistantMessageId || row.assistant_message_id || '').trim()
      if (!messageId || !String(row.id || '').trim()) return
      const pair = promptLogPairsByMessageId[messageId] || { hasReply: false, hasProjection: false }
      if (isProjectionPromptLogKind(row.logKind ?? row.log_kind)) pair.hasProjection = true
      else pair.hasReply = true
      promptLogPairsByMessageId[messageId] = pair
    })
    const messageMetaById: Record<string, { totalIndex: number; totalCount: number; kindIndex: number; kindTotal: number; messageKind: string }> = {}
    messageRows.forEach((row, index) => {
      kindSeen[row.messageKind] = (kindSeen[row.messageKind] || 0) + 1
      messageMetaById[row.messageId] = {
        totalIndex: index + 1,
        totalCount,
        kindIndex: kindSeen[row.messageKind],
        kindTotal: kindTotals[row.messageKind] || 0,
        messageKind: row.messageKind
      }
    })
    const byId: Record<string, { totalIndex: number; totalCount: number; kindIndex: number; kindTotal: number; messageKind: string; hasReply: boolean; hasProjection: boolean }> = {}
    rows.forEach((row: Record<string, any>) => {
      const logId = String(row.id || '').trim()
      const messageId = String(row.assistantMessageId || row.assistant_message_id || '').trim()
      if (!logId || !messageId) return
      const messageMeta = messageMetaById[messageId]
      if (!messageMeta) return
      const pair = messageId ? promptLogPairsByMessageId[messageId] : null
      byId[logId] = {
        ...messageMeta,
        hasReply: pair?.hasReply === true,
        hasProjection: pair?.hasProjection === true
      }
    })
    return byId
  }

  function toPromptLogEntry(row: Record<string, any>, indexMeta?: Record<string, any>) {
    const promptBlocks = parsePromptBlocks(row.promptBlocks ?? row.prompt_blocks_json)
    const finalPrompt = String(row.finalPrompt || row.final_prompt || '')
    const deleted = finalPrompt.trim() === '已删除' && promptBlocks.length === 0
    const meta = indexMeta?.[String(row.id || '')] || {}
    const messageKind = normalizePromptLogMessageKind(meta.messageKind ?? row.messageKind ?? row.message_kind)
    return {
      id: String(row.id || ''),
      sessionId: String(row.sessionId || row.session_id || ''),
      pageIndex: Number(row.pageIndex || row.page_index || 1),
      entryIndex: Number(row.entryIndex || row.entry_index || 0),
      totalIndex: Number(meta.totalIndex || 0),
      totalCount: Number(meta.totalCount || 0),
      kindIndex: Number(meta.kindIndex || 0),
      kindTotal: Number(meta.kindTotal || 0),
      messageKind,
      assistantMessageId: Number(row.assistantMessageId || row.assistant_message_id || 0),
      speakerName: String(row.speakerName || row.speaker_name || ''),
      targetId: String(row.targetId || row.target_id || ''),
      logKind: isProjectionPromptLogKind(row.logKind ?? row.log_kind) ? 'message_projection' : 'final_reply',
      hasReply: meta.hasReply === true,
      hasProjection: meta.hasProjection === true,
      finalPrompt,
      promptBlocks,
      deleted,
      createdAt: String(row.createdAt || row.created_at || '')
    }
  }

  function parseRecallActivity(value: unknown) {
    return decodeRecallActivityLogValue(value)
  }

  function toRecallActivityLogEntry(row: Record<string, any>) {
    const activity = parseRecallActivity(row.activity ?? row.activityJson ?? row.activity_json)
    return {
      id: String(row.id || ''),
      sessionId: String(row.sessionId || row.session_id || ''),
      pageIndex: Number(row.pageIndex || row.page_index || 1),
      entryIndex: Number(row.entryIndex || row.entry_index || 0),
      inputMessageId: Number(row.inputMessageId || row.input_message_id || 0),
      assistantMessageId: Number(row.assistantMessageId || row.assistant_message_id || 0),
      speakerName: String(row.speakerName || row.speaker_name || ''),
      targetId: String(row.targetId || row.target_id || ''),
      runId: String(row.runId || row.run_id || ''),
      status: String(row.status || 'completed'),
      activity,
      createdAt: String(row.createdAt || row.created_at || '')
    }
  }

  function buildSessionId() {
    return `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  }

  function inferTargetType(targetId: string, explicitType = '') {
    const type = String(explicitType || '').trim()
    if (type === 'group' || type === 'crowd' || type === 'char') return type
    if (targetId.startsWith('group_')) return 'group'
    if (targetId.startsWith('crowd_')) return 'crowd'
    return 'char'
  }

  function readLegacyGroupParticipantRows(groupTargetId: string) {
    const normalizedGroupId = normalizeChatTargetId(String(groupTargetId || '').trim()).replace(/^group_/, '')
    if (!normalizedGroupId) return []
    const group = typeof characterRepository.getGroupById === 'function'
      ? characterRepository.getGroupById(normalizedGroupId)
      : null
    const rawMembers = group?.members ?? group?.memberIds ?? group?.member_ids ?? []
    let members: any[] = []
    if (Array.isArray(rawMembers)) {
      members = rawMembers
    } else if (typeof rawMembers === 'string') {
      try {
        const parsed = JSON.parse(rawMembers)
        if (Array.isArray(parsed)) members = parsed
      } catch {
        members = []
      }
    }
    return members
      .map((member: any, index: number) => {
        const targetId = normalizeChatTargetId(String(
          member?.characterId
          ?? member?.character_id
          ?? member?.charId
          ?? member?.char_id
          ?? member?.id
          ?? member
          ?? ''
        ))
        if (!targetId || targetId.startsWith('group_') || targetId.startsWith('crowd_')) return null
        return {
          targetId,
          targetType: 'char',
          displayOrder: Number(member?.displayOrder ?? member?.display_order ?? index) || index,
          probability: normalizeReplyProbability(member?.probability ?? member?.replyProbability ?? member?.reply_probability)
        }
      })
      .filter(Boolean)
  }

  function normalizeMessagePageOptions(options?: number | { limit?: number; beforeId?: number }) {
    if (typeof options === 'number') {
      return {
        limit: Number.isFinite(options) && options > 0 ? Math.floor(options) : 0,
        beforeId: 0
      }
    }
    return {
      limit: Number.isFinite(Number(options?.limit)) && Number(options?.limit) > 0
        ? Math.floor(Number(options?.limit))
        : 0,
      beforeId: Number.isFinite(Number(options?.beforeId)) && Number(options?.beforeId) > 0
        ? Math.floor(Number(options?.beforeId))
        : 0
    }
  }

  function readDisplayMessages(sessionId: string, options?: number | { limit?: number; beforeId?: number }) {
    const pageOptions = normalizeMessagePageOptions(options)
    if (pageOptions.limit > 0 && typeof chatRepository.getMessagePageBySessionId === 'function') {
      const page = chatRepository.getMessagePageBySessionId(sessionId, pageOptions)
      const messages = Array.isArray(page?.messages) ? page.messages : []
      return {
        messages,
        pageInfo: {
          hasMore: Boolean(page?.hasMore),
          oldestMessageId: Number(messages[0]?.id || 0) || 0
        }
      }
    }
    const normalizedLimit = pageOptions.limit
    if (normalizedLimit > 0) {
      const messages = chatRepository.getRecentMessagesBySessionId(sessionId, normalizedLimit)
      const total = typeof chatRepository.countMessagesBySessionId === 'function'
        ? chatRepository.countMessagesBySessionId(sessionId)
        : messages.length
      return {
        messages,
        pageInfo: {
          hasMore: total > messages.length,
          oldestMessageId: Number(messages[0]?.id || 0) || 0
        }
      }
    }
    if (typeof chatRepository.getDisplayMessagesBySessionId === 'function') {
      return {
        messages: chatRepository.getDisplayMessagesBySessionId(sessionId),
        pageInfo: { hasMore: false, oldestMessageId: 0 }
      }
    }
    if (typeof chatRepository.getMessagesBySessionIdOrdered === 'function') {
      return {
        messages: chatRepository.getMessagesBySessionIdOrdered(sessionId),
        pageInfo: { hasMore: false, oldestMessageId: 0 }
      }
    }
    return {
      messages: chatRepository.getMessagesBySessionId(sessionId),
      pageInfo: { hasMore: false, oldestMessageId: 0 }
    }
  }

  function toChatBundle(sessionId: string, options?: number | { limit?: number; beforeId?: number }) {
    const session = chatRepository.getSessionById(sessionId)
    if (!session) {
      return { ok: false as const, status: 404, error: '会话不存在' }
    }
    const messagePage = readDisplayMessages(sessionId, options)
    const messages = messagePage.messages
    const participantRows = typeof chatRepository.listSessionParticipants === 'function'
      ? chatRepository.listSessionParticipants(sessionId)
      : []
    const participants = (Array.isArray(participantRows) ? participantRows : []).map((participant: Record<string, any>) => {
      const participantType = toText(participant.participantType ?? participant.participant_type)
      const characterId = toText(participant.participantTargetId ?? participant.participant_target_id)
      if (participantType !== 'char' || !characterId) return participant
      if (!characterRepository.getCharacterById?.(characterId)) return participant
      const resolved = resolveSessionCharacterState(sessionId, characterId, participant)
      return {
        ...participant,
        characterStateMode: resolved.mode,
        characterBranchId: resolved.branchId,
        resolvedCharacter: resolved.character
      }
    })
    return {
      ok: true as const,
      data: {
        session: {
          ...toWorldScopedChatSessionTransport(session as Record<string, unknown>),
          participants
        },
        participants,
        messages: messages.map((item: Record<string, unknown>) => toCamel(item)),
        pageInfo: messagePage.pageInfo
      }
    }
  }

  function resolveSessionCharacterState(
    sessionId: string,
    characterId: string,
    knownParticipant?: Record<string, any>
  ): { mode: 'follow_main' | 'independent_snapshot'; branchId: string; character: Record<string, any> } {
    const mainCharacter = characterRepository.getCharacterById?.(characterId)
    if (!mainCharacter) throw new Error('角色不存在')
    const participant = knownParticipant || (chatRepository.listSessionParticipants?.(sessionId) || [])
      .find((row: Record<string, any>) => (
        toText(row.participantType ?? row.participant_type) === 'char'
        && toText(row.participantTargetId ?? row.participant_target_id) === characterId
      ))
    const mode = toText(participant?.characterStateMode ?? participant?.character_state_mode) === 'independent_snapshot'
      ? 'independent_snapshot'
      : 'follow_main'
    if (mode === 'follow_main') return { mode, branchId: '', character: mainCharacter }
    const branchId = toText(participant?.characterBranchId ?? participant?.character_branch_id)
    if (!branchId) throw new Error('独立快照参与者缺少会话工作分支')
    const resolved = characterSnapshotService.resolveSessionCharacterBranch(characterId, branchId)
    const branch = resolved.branch || {}
    if (toText(branch.sessionId ?? branch.session_id) !== sessionId) {
      throw new Error('会话角色分支不属于当前会话')
    }
    return { mode, branchId, character: resolved.character }
  }

  async function resolveAgentContextBundle(
    sessionIdInput: string,
    payload: Record<string, any>,
    options: WorkspaceRequestOptions = {}
  ) {
    const sessionId = toText(sessionIdInput)
    const bundle = toChatBundle(sessionId, { limit: 1 })
    if (!bundle.ok) return bundle
    const userId = toText(options.userId) || getActiveUserId()
    const sessionOwnerId = toText(bundle.data.session?.userId ?? bundle.data.session?.user_id)
    if (sessionOwnerId && sessionOwnerId !== userId) {
      return { ok: false as const, status: 403, error: '无权读取该会话的 Agent 上下文' }
    }
    const workspaceId = getActiveWorkspaceId()
    const service = createAgentContextProjectionService({
      cache: agentContextProjectionCache,
      loadSource: (_input, perspective) => {
        const session = bundle.data.session as Record<string, any>
        const participants = Array.isArray(bundle.data.participants) ? bundle.data.participants : []
        const projections = perspective.kind === 'character' && typeof chatRepository.listVisibleMessageProjectionsForCharacter === 'function'
          ? chatRepository.listVisibleMessageProjectionsForCharacter(sessionId, perspective.characterId)
          : (typeof chatRepository.listMessageProjectionsBySessionId === 'function'
              ? chatRepository.listMessageProjectionsBySessionId(sessionId)
              : [])
        const worldId = toText(session.worldId ?? session.world_id)
        const sourceFailures: Record<string, string> = {}
        let statusTemplates: Record<string, any>[] = []
        let statusPanels: Record<string, any>[] = []
        try {
          statusTemplates = typeof chatRepository.listStatusPanelTemplates === 'function'
            ? chatRepository.listStatusPanelTemplates(sessionId, worldId)
            : []
          const templateMap = new Map(statusTemplates.map((item: any) => [String(item?.id || ''), item]))
          const statusRows = typeof chatRepository.listStatusPanels === 'function'
            ? chatRepository.listStatusPanels(sessionId, worldId)
            : []
          statusPanels = statusRows.map((panel: any) => ({
            ...panel,
            bindingValues: resolveStatusPanelBindingValues(
              panel,
              resolveStatusPanelFieldsOf(panel, templateMap.get(String(panel?.templateId ?? panel?.template_id ?? '')))
            )
          }))
        } catch (error) {
          sourceFailures['status.panels'] = `状态栏来源读取失败：${error instanceof Error ? error.message : String(error)}`
        }
        const orchestrationResult = orchestrationWorkspaceProjectionService.read({
          userId, workspaceId, sessionId,
          anchorMessageId: toText(payload.anchorMessageId ?? payload.anchor_message_id),
          userText: toText(payload.userText ?? payload.user_text)
        }, {
          forcedCharacterIds: Array.isArray(_input.forcedCharacterIds) ? _input.forcedCharacterIds : [],
          maxPromptChars: 16000
        })
        if (!orchestrationResult.ok) throw new Error(orchestrationResult.error)
        const orchestrationDirector = orchestrationResult.data.director
        const unifiedPresences = orchestrationDirector.presences.map((presence: any) => ({
          ...presence, presenceState: presence.state
        }))
        const unifiedNarrativeSeeds = orchestrationDirector.relevantNarrativeSeeds.map((entry: any) => entry.value)
        let narrativeSeeds: Record<string, any>[] = []
        let narrativeSeedsSelected = true
        if (worldId) {
          narrativeSeeds = unifiedNarrativeSeeds
        }
        return {
          session,
          participants,
          projections,
          chatProjectionVisibility: perspective.kind === 'character'
            ? { kind: 'character' as const, characterId: perspective.characterId }
            : { kind: 'all' as const },
          statusTemplates,
          statusPanels,
          presences: unifiedPresences,
          narrativeSeeds,
          narrativeSeedsSelected,
          sourceFailures,
          orchestrationWorkspace: orchestrationDirector,
          roundCandidateIds: orchestrationDirector.candidates
            .map((candidate: any) => toText(candidate.characterId))
            .filter(Boolean),
          rimworldPawnSnapshot: options.rimworldPawnSnapshot || null
        }
      }
    })
    return service.resolve({
      agentKind: payload.agentKind ?? payload.agent_kind,
      sessionId,
      userId,
      workspaceId,
      characterId: toText(payload.characterId ?? payload.character_id),
      anchorMessageId: Number(payload.anchorMessageId ?? payload.anchor_message_id ?? 0) || undefined,
      userText: toText(payload.userText ?? payload.user_text),
      roundCandidateIds: Array.isArray(payload.roundCandidateIds ?? payload.round_candidate_ids)
        ? (payload.roundCandidateIds ?? payload.round_candidate_ids).map((id: unknown) => toText(id)).filter(Boolean)
        : [],
      forcedCharacterIds: Array.isArray(payload.forcedCharacterIds ?? payload.forced_character_ids)
        ? (payload.forcedCharacterIds ?? payload.forced_character_ids).map((id: unknown) => toText(id)).filter(Boolean)
        : []
    })
  }

  function normalizeSessionParticipants(sessionId: string, payload: Record<string, any>) {
    const rawParticipants = Array.isArray(payload?.participants)
      ? payload.participants
      : []
    const fallbackTargetId = normalizeChatTargetId(String(payload?.targetId ?? payload?.target_id ?? ''))
    const fallbackTargetType = inferTargetType(fallbackTargetId, String(payload?.targetType ?? payload?.target_type ?? ''))
    const expandedParticipants = rawParticipants.flatMap((item: any) => {
      const targetId = normalizeChatTargetId(String(item?.targetId ?? item?.target_id ?? item?.participantTargetId ?? item?.participant_target_id ?? item?.id ?? ''))
      const targetType = inferTargetType(targetId, String(item?.targetType ?? item?.target_type ?? item?.participantType ?? item?.participant_type ?? ''))
      if (targetType !== 'group') return [item]
      const groupRows = readLegacyGroupParticipantRows(targetId)
      return groupRows.length ? groupRows : [item]
    })
    const fallbackGroupRows = fallbackTargetType === 'group'
      ? readLegacyGroupParticipantRows(fallbackTargetId)
      : []
    const sourceRows = rawParticipants.length
      ? expandedParticipants
      : (fallbackTargetId ? (fallbackGroupRows.length ? fallbackGroupRows : [{ targetId: fallbackTargetId, targetType: fallbackTargetType }]) : [])
    const seen = new Set<string>()
    return sourceRows.map((item: any, index: number) => {
      const targetId = normalizeChatTargetId(String(item?.targetId ?? item?.target_id ?? item?.participantTargetId ?? item?.participant_target_id ?? item?.id ?? ''))
      const targetType = inferTargetType(targetId, String(item?.targetType ?? item?.target_type ?? item?.participantType ?? item?.participant_type ?? ''))
      return {
        id: String(item?.id || `participant_${sessionId}_${index}`),
        participantTargetId: targetId,
        participantType: targetType,
        displayOrder: Number(item?.displayOrder ?? item?.display_order ?? index) || index,
        replyProbability: normalizeReplyProbability(
          item?.replyProbability
          ?? item?.reply_probability
          ?? item?.probability
        ),
        characterStateMode: String(item?.characterStateMode ?? item?.character_state_mode ?? item?.stateMode ?? item?.state_mode) === 'independent_snapshot'
          ? 'independent_snapshot'
          : 'follow_main',
        characterBranchId: String(item?.characterBranchId ?? item?.character_branch_id ?? ''),
        sourceSnapshotId: String(item?.sourceSnapshotId ?? item?.source_snapshot_id ?? ''),
        role: String(item?.role || 'member'),
        createdAt: String(item?.createdAt ?? item?.created_at ?? new Date().toISOString()),
        updatedAt: String(item?.updatedAt ?? item?.updated_at ?? new Date().toISOString())
      }
    }).filter((item) => {
      if (!item.participantTargetId) return false
      const key = `${item.participantTargetId}:${item.participantType}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }

  function materializeSessionParticipantBranches(
    sessionId: string,
    rows: Array<Record<string, any>>,
    existingRows: Array<Record<string, any>> = []
  ) {
    const existingById = new Map(existingRows.map((row) => [toText(row.id), row]))
    return rows.map((row) => {
      if (row.participantType !== 'char' || row.characterStateMode !== 'independent_snapshot') {
        return { ...row, characterStateMode: 'follow_main', characterBranchId: '' }
      }
      const existing = existingById.get(toText(row.id))
      const existingMode = toText(existing?.characterStateMode ?? existing?.character_state_mode)
      const existingBranchId = toText(existing?.characterBranchId ?? existing?.character_branch_id)
      if (!row.sourceSnapshotId && existingMode === 'independent_snapshot' && existingBranchId) {
        characterSnapshotService.resolveSessionCharacterBranch(row.participantTargetId, existingBranchId)
        return { ...row, characterBranchId: existingBranchId }
      }
      if (existing) characterSnapshotService.deleteSessionCharacterBranchByParticipant?.(row.id)
      const branch = characterSnapshotService.forkSessionCharacterBranch({
        sessionId,
        participantId: row.id,
        characterId: row.participantTargetId,
        sourceSnapshotId: row.sourceSnapshotId
      })
      return { ...row, characterBranchId: String(branch?.id || '') }
    })
  }

  function sanitizeSessionTitle(value: unknown) {
    return String(value || '')
      .replace(/[「」『』“”"'`]/g, '')
      .replace(/\s+/g, '')
      .trim()
      .slice(0, 15)
  }

  function buildDefaultSessionTitle(payload: Record<string, any>, participants: Array<Record<string, any>>) {
    const explicitTitle = sanitizeSessionTitle(payload?.title)
    if (explicitTitle) return explicitTitle
    const rawParticipants = Array.isArray(payload?.participants) ? payload.participants : []
    const names = rawParticipants
      .map((item: any, index: number) => {
        const explicitName = sanitizeSessionTitle(item?.displayName ?? item?.name ?? item?.title ?? '')
        if (explicitName) return explicitName
        const participantId = String(participants[index]?.participantTargetId || '').trim()
        const character = participantId && typeof characterRepository.getCharacterById === 'function'
          ? characterRepository.getCharacterById(participantId)
          : null
        return sanitizeSessionTitle(character?.name || '')
      })
      .filter(Boolean)
    if (names.length === 1) return names[0]
    // 人数=角色成员+用户本人（2026-07-10 拍板·与前端 useCharacterManagement.buildDefaultSessionTitle 同口径联动）。
    if (names.length > 1) {
      return sanitizeSessionTitle(`${names.slice(0, 2).join('、')}${names.length + 1}人`)
    }
    if (participants.length === 1) return sanitizeSessionTitle(participants[0]?.participantTargetId)
    if (participants.length > 1) return sanitizeSessionTitle(`多人会话${participants.length + 1}人`)
    return ''
  }

  function createChatSessionFromPayload(payload: Record<string, any>, trustedSessionId = '') {
    const participants = normalizeSessionParticipants('', payload)
    if (!participants.length) {
      return { ok: false as const, status: 400, error: '创建会话至少需要一个参与者' }
    }
    const sessionId = trustedSessionId || buildSessionId()
    const normalizedParticipants = materializeSessionParticipantBranches(
      sessionId,
      normalizeSessionParticipants(sessionId, payload)
    )
    const firstParticipant = normalizedParticipants[0]
    const nowIso = new Date().toISOString()
    const title = buildDefaultSessionTitle(payload, normalizedParticipants)
    const virtualTimeBase = Number(payload?.virtualTimeBase ?? payload?.virtual_time_base ?? 0) || 0
    const hasVirtualTimeBase = Number.isFinite(virtualTimeBase) && virtualTimeBase !== 0
    const rawVirtualTimeRate = payload?.virtualTimeRate ?? payload?.virtual_time_rate
    const virtualTimeRate = Math.min(60, Math.max(0, rawVirtualTimeRate === 0 ? 0 : Number(rawVirtualTimeRate || 1)))
    const hasExplicitLocation = hasOwnDefinedValue(payload, [
      'virtualLocation',
      'virtual_location',
      'virtualLocationLarge',
      'virtual_location_large',
      'virtualLocationMiddle',
      'virtual_location_middle',
      'virtualLocationSmall',
      'virtual_location_small'
    ])
    const legacyVirtualLocation = hasExplicitLocation ? trimText(payload?.virtualLocation ?? payload?.virtual_location) : ''
    const locationParts = hasExplicitLocation
      ? resolveVirtualSceneLocationParts(
        payload?.virtualLocationLarge ?? payload?.virtual_location_large,
        payload?.virtualLocationMiddle ?? payload?.virtual_location_middle,
        payload?.virtualLocationSmall ?? payload?.virtual_location_small,
        legacyVirtualLocation
      )
      : { large: '', middle: '', small: '' }
    const virtualLocation = hasExplicitLocation
      ? composeVirtualSceneLocationLabel(
        locationParts.large,
        locationParts.middle,
        locationParts.small,
        legacyVirtualLocation
      )
      : ''
    chatRepository.upsertSession(sessionId, {
      targetId: firstParticipant.participantTargetId,
      targetType: firstParticipant.participantType,
      title,
      conversationAvatarPath: persistSessionAvatar(sessionId, payload?.conversationAvatarPath ?? payload?.conversation_avatar_path ?? ''),
      conversationEmoji: String(payload?.conversationEmoji ?? payload?.conversation_emoji ?? ''),
      summary: '',
      lastSummaryTime: '',
      loadedSummaryIds: '[]',
      contextSummary: '',
      updatedAt: nowIso,
      virtualSceneName: String(payload?.virtualSceneName ?? payload?.virtual_scene_name ?? ''),
      virtualSceneDesc: String(payload?.virtualSceneDesc ?? payload?.virtual_scene_desc ?? ''),
      virtualLocationLarge: locationParts.large,
      virtualLocationMiddle: locationParts.middle,
      virtualLocationSmall: locationParts.small,
      virtualLocation,
      virtualRealLocation: String(payload?.virtualRealLocation ?? payload?.virtual_real_location ?? ''),
      virtualTime: String(payload?.virtualTime ?? payload?.virtual_time ?? ''),
      virtualTimeAnchor: Number(payload?.virtualTimeAnchor ?? payload?.virtual_time_anchor ?? (hasVirtualTimeBase ? Date.now() : 0)) || 0,
      virtualTimeBase,
      virtualTimeRate,
      virtualWeather: String(payload?.virtualWeather ?? payload?.virtual_weather ?? ''),
      virtualWeatherMode: String(payload?.virtualWeatherMode ?? payload?.virtual_weather_mode ?? 'real') || 'real',
      boundAlias: String(payload?.boundAlias ?? payload?.bound_alias ?? ''),
      narrationFrequency: normalizeNarrationFrequency(payload?.narrationFrequency ?? payload?.narration_frequency),
      narrationTemperature: normalizeNarrationTemperature(payload?.narrationTemperature ?? payload?.narration_temperature),
      narrationProfiles: normalizeNarrationProfilesPayload(payload?.narrationProfiles ?? payload?.narration_profiles),
      narrationForceEnabled: payload?.narrationForceEnabled === true || payload?.narration_force_enabled === 1 || payload?.narration_force_enabled === true || payload?.narrationForceEnabled === 'true' || payload?.narration_force_enabled === 'true',
      chatFontScale: normalizeChatFontScale(payload?.chatFontScale ?? payload?.chat_font_scale),
      replyPipelineMode: normalizeChatSessionReplyPipelineMode(payload?.replyPipelineMode ?? payload?.reply_pipeline_mode),
      tempModel: '',
      tempPreset: '',
      linkedArchiveId: ''
    })
    chatRepository.replaceSessionParticipants(sessionId, normalizedParticipants)
    persistChatMutation()
    return toChatBundle(sessionId, 200)
  }

  // ── agent 会话四件套统一核心（星依总agent + 工作区专业Agent 共用，2026-07-17 代码审查收敛）──
  // 此前两组 ensure/create/list/activate 近乎逐字并行，激活守卫等修复必须改两处、极易漏一边；
  // 现把差异全部收进 descriptor：星依无查询作用域（targetId=undefined、落库走 insertXingyiSession
  // 固定参数特化，title 恒「星依」），工作区Agent按 kind+targetId 收窄并在激活时校验作用域。
  interface AgentSessionDescriptor {
    kind: string
    /** findLatest/list/activate 的作用域；undefined = 不按 targetId 收窄（星依） */
    targetId?: string
    insert: (sessionId: string, nowIso: string) => void
    notFoundError: string
    archivedError: string
  }

  const XINGYI_SESSION_DESCRIPTOR: AgentSessionDescriptor = {
    kind: 'xingyi',
    insert: (sessionId, nowIso) => chatRepository.insertXingyiSession(sessionId, { title: '星依', nowIso }),
    notFoundError: '星依会话不存在',
    archivedError: '星依会话已归档，不能重新激活'
  }

  // 工作区专业Agent种类（编剧/舆图师/人格训练师）唯一真值 = shared/agentSessionKinds.ts 的 WORKSPACE_AGENT_KINDS。
  const WORKSPACE_AGENT_KIND_SET = new Set<string>(WORKSPACE_AGENT_KINDS)

  // 工作区Agent的入参校验 + descriptor 组装：kind 必须在共享真值内，targetId（世界或世界:图纸）必填，
  // targetType 与 kind 同值。
  function buildWorkspaceAgentDescriptor(kind: string, targetId: string, title: string):
    { ok: true; descriptor: AgentSessionDescriptor } | { ok: false; status: number; error: string } {
    if (!WORKSPACE_AGENT_KIND_SET.has(kind)) {
      return { ok: false as const, status: 400, error: `未知的工作区Agent种类：${kind}` }
    }
    const normalizedTargetId = String(targetId || '').trim()
    if (!normalizedTargetId) return { ok: false as const, status: 400, error: '缺少作用域targetId' }
    return {
      ok: true as const,
      descriptor: {
        kind,
        targetId: normalizedTargetId,
        insert: (sessionId, nowIso) => chatRepository.insertWorkspaceAgentSession(
          sessionId,
          { targetId: normalizedTargetId, targetType: kind, kind, title: String(title || ''), nowIso }
        ),
        notFoundError: '专业会话不存在或作用域不匹配',
        archivedError: '专业会话已归档，不能重新激活'
      }
    }
  }

  function insertAgentSessionBundle(descriptor: AgentSessionDescriptor) {
    const sessionId = buildSessionId()
    descriptor.insert(sessionId, new Date().toISOString())
    persistChatMutation()
    return toChatBundle(sessionId, 200)
  }

  // ensure：存在即返回、不存在才创建（星依=每用户一条常驻；工作区=按 kind+targetId 去重续接）。
  // 不走 createChatSessionFromPayload（那条链强制角色参与者，agent 会话没有角色参与者）。
  function ensureAgentSessionBundle(descriptor: AgentSessionDescriptor) {
    const existing = chatRepository.findLatestSessionByKind(descriptor.kind, descriptor.targetId)
    if (existing?.id) {
      return toChatBundle(String(existing.id), 200)
    }
    return insertAgentSessionBundle(descriptor)
  }

  // 显式新建（星依 /clear 语义）：新会话成为活动会话（活动会话=updated_at 最新一条，与 ensure 同一真值）。
  // 旧会话原样保留可找回；最新一条同scope会话还是空的就直接复用，避免连按新建堆空会话。
  function createAgentSessionBundle(descriptor: AgentSessionDescriptor) {
    const latest = chatRepository.findLatestSessionByKind(descriptor.kind, descriptor.targetId)
    if (latest?.id && chatRepository.countMessagesBySessionId(String(latest.id)) === 0) {
      return toChatBundle(String(latest.id), 200)
    }
    return insertAgentSessionBundle(descriptor)
  }

  // agent 过往对话的展示名：首条用户输入压掉空白后取前 20 字（会话 title 恒定，展示名只算不落库）
  function buildXingyiSessionDisplayName(content: unknown): string {
    const collapsed = String(content || '').replace(/\s+/g, ' ').trim()
    return collapsed.slice(0, 20).trim() || '新对话'
  }

  // 过往会话清单（含当前活动会话，按活跃时间倒序，第一条即当前）
  function listAgentSessionSummaries(descriptor: AgentSessionDescriptor) {
    const rows = chatRepository.listSessionsByKind(descriptor.kind, descriptor.targetId)
    return {
      ok: true as const,
      data: {
        sessions: rows.map((row: Record<string, any>) => ({
          id: String(row.id || ''),
          name: buildXingyiSessionDisplayName(row.firstUserContent),
          messageCount: Number(row.messageCount || 0),
          createdAt: String(row.createdAt || ''),
          updatedAt: String(row.updatedAt || '')
        }))
      }
    }
  }

  // 激活历史会话：touch updated_at 即提为活动会话（ensure 按最新一条取，不需要活动指针列）。
  // 工作区Agent必须校验 kind+targetId 与请求作用域一致，防止跨世界/跨图纸误激活他人历史会话；
  // 已归档会话不许激活：ensure/list 都按未归档过滤，激活归档会话会造出 UI 重挂后永远找不回的孤儿活动会话。
  function activateAgentSessionBundle(descriptor: AgentSessionDescriptor, sessionId: string) {
    const normalizedId = String(sessionId || '').trim()
    const session = normalizedId ? chatRepository.getSessionById(normalizedId) : null
    if (
      !session
      || String(session.kind || '') !== descriptor.kind
      || (descriptor.targetId !== undefined && String(session.targetId ?? session.target_id ?? '') !== descriptor.targetId)
    ) {
      return { ok: false as const, status: 404, error: descriptor.notFoundError }
    }
    if (String(session.isArchived ?? session.is_archived ?? '') === '1') {
      return { ok: false as const, status: 404, error: descriptor.archivedError }
    }
    chatRepository.touchSession(normalizedId)
    persistChatMutation()
    return toChatBundle(normalizedId, 200)
  }

  // ── 对外的 8 个薄包装（保持原名与签名，dispatch 与路由不感知收敛）──
  function ensureXingyiSessionBundle() { return ensureAgentSessionBundle(XINGYI_SESSION_DESCRIPTOR) }
  function createXingyiSessionBundle() { return createAgentSessionBundle(XINGYI_SESSION_DESCRIPTOR) }
  function listXingyiSessionSummaries() { return listAgentSessionSummaries(XINGYI_SESSION_DESCRIPTOR) }
  function activateXingyiSessionBundle(sessionId: string) { return activateAgentSessionBundle(XINGYI_SESSION_DESCRIPTOR, sessionId) }

  function ensureWorkspaceAgentSessionBundle(kind: string, targetId: string, title: string) {
    const built = buildWorkspaceAgentDescriptor(kind, targetId, title)
    return built.ok ? ensureAgentSessionBundle(built.descriptor) : built
  }

  function createWorkspaceAgentSessionBundle(kind: string, targetId: string, title: string) {
    const built = buildWorkspaceAgentDescriptor(kind, targetId, title)
    return built.ok ? createAgentSessionBundle(built.descriptor) : built
  }

  function listWorkspaceAgentSessionSummaries(kind: string, targetId: string) {
    const built = buildWorkspaceAgentDescriptor(kind, targetId, '')
    return built.ok ? listAgentSessionSummaries(built.descriptor) : built
  }

  function activateWorkspaceAgentSessionBundle(sessionId: string, kind: string, targetId: string) {
    const built = buildWorkspaceAgentDescriptor(kind, targetId, '')
    return built.ok ? activateAgentSessionBundle(built.descriptor, sessionId) : built
  }

  function buildSessionPatch(body: Record<string, any>, sessionId = '') {
    const requestedSessionId = String(sessionId || body.session_id || body.sessionId || '').trim()
    const rawConversationAvatar = body.conversation_avatar_path ?? body.conversationAvatarPath
    const normalized = {
      title: body.title,
      conversation_avatar_path: rawConversationAvatar === undefined
        ? undefined
        : persistSessionAvatar(requestedSessionId, rawConversationAvatar),
      conversation_emoji: body.conversation_emoji ?? body.conversationEmoji,
      archive_name: body.archive_name ?? body.archiveName,
      archive_category: body.archive_category ?? body.archiveCategory,
      loaded_summary_ids: body.loaded_summary_ids ?? body.loadedSummaryIds,
      // 批次4：滚动会话记忆摘要、更新时间与独立 messageId watermark。
      context_summary: body.context_summary ?? body.contextSummary,
      last_summary_time: body.last_summary_time ?? body.lastSummaryTime,
      context_summary_message_id: body.context_summary_message_id ?? body.contextSummaryMessageId,
      virtual_scene_name: body.virtual_scene_name ?? body.virtualSceneName,
      virtual_scene_desc: body.virtual_scene_desc ?? body.virtualSceneDesc,
      virtual_location_large: body.virtual_location_large ?? body.virtualLocationLarge,
      virtual_location_middle: body.virtual_location_middle ?? body.virtualLocationMiddle,
      virtual_location_small: body.virtual_location_small ?? body.virtualLocationSmall,
      virtual_location: body.virtual_location ?? body.virtualLocation,
      virtual_scene_world_id: body.virtual_scene_world_id ?? body.virtualSceneWorldId,
      virtual_location_sheet_id: body.virtual_location_sheet_id ?? body.virtualLocationSheetId,
      virtual_location_feature_id: body.virtual_location_feature_id ?? body.virtualLocationFeatureId,
      virtual_real_location: body.virtual_real_location ?? body.virtualRealLocation,
      virtual_time: body.virtual_time ?? body.virtualTime,
      virtual_time_anchor: body.virtual_time_anchor ?? body.virtualTimeAnchor,
      virtual_time_base: body.virtual_time_base ?? body.virtualTimeBase,
      virtual_time_rate: body.virtual_time_rate ?? body.virtualTimeRate,
      virtual_weather: body.virtual_weather ?? body.virtualWeather,
      virtual_weather_mode: body.virtual_weather_mode ?? body.virtualWeatherMode,
      bound_alias: body.bound_alias ?? body.boundAlias,
      narration_frequency: body.narration_frequency ?? body.narrationFrequency,
      narration_temperature: body.narration_temperature ?? body.narrationTemperature,
      narration_profiles: body.narration_profiles ?? body.narrationProfiles,
      narration_force_enabled: body.narration_force_enabled ?? body.narrationForceEnabled,
      chat_font_scale: body.chat_font_scale ?? body.chatFontScale,
      dynamic_world_enabled: body.dynamic_world_enabled ?? body.dynamicWorldEnabled,
      reply_pipeline_mode: body.reply_pipeline_mode ?? body.replyPipelineMode,
      temp_model: body.temp_model ?? body.tempModel,
      temp_preset: body.temp_preset ?? body.tempPreset
    } as Record<string, unknown>
    const hasAnyLocationField =
      body.virtualLocationLarge !== undefined
      || body.virtualLocationMiddle !== undefined
      || body.virtualLocationSmall !== undefined
      || body.virtualLocation !== undefined
      || body.virtual_location_large !== undefined
      || body.virtual_location_middle !== undefined
      || body.virtual_location_small !== undefined
      || body.virtual_location !== undefined
    const hasStructuredLocation = Boolean(
      trimText(normalized.virtual_location_large)
      || trimText(normalized.virtual_location_middle)
      || trimText(normalized.virtual_location_small)
    )
    if (!hasStructuredLocation && trimText(normalized.virtual_location)) {
      const locationParts = splitLegacyVirtualSceneLocation(normalized.virtual_location)
      normalized.virtual_location_large = locationParts.large
      normalized.virtual_location_middle = locationParts.middle
      normalized.virtual_location_small = locationParts.small
    }
    const virtualLocation = composeVirtualSceneLocationLabel(
      normalized.virtual_location_large,
      normalized.virtual_location_middle,
      normalized.virtual_location_small,
      normalized.virtual_location
    )
    if (hasAnyLocationField) {
      normalized.virtual_location = virtualLocation
    }
    return normalized
  }

  function updateSessionFields(sessionId: string, body: Record<string, any>) {
    const cols = chatRepository.listSessionColumns()
    const colSet = new Set(cols.map((item: { name: string }) => item.name))
    const fields: Record<string, unknown> = {}
    const existingSession = chatRepository.getSessionById(sessionId) as Record<string, any> | null
    const curtainKeys = [
      'virtualSceneName', 'virtual_scene_name', 'virtualSceneDesc', 'virtual_scene_desc',
      'virtualLocationLarge', 'virtual_location_large', 'virtualLocationMiddle', 'virtual_location_middle',
      'virtualLocationSmall', 'virtual_location_small', 'virtualLocation', 'virtual_location',
      'virtualRealLocation', 'virtual_real_location', 'virtualTime', 'virtual_time',
      'virtualTimeAnchor', 'virtual_time_anchor', 'virtualTimeBase', 'virtual_time_base',
      'virtualTimeRate', 'virtual_time_rate', 'virtualWeather', 'virtual_weather',
      'virtualWeatherMode', 'virtual_weather_mode', 'virtualLocationSheetId', 'virtual_location_sheet_id',
      'virtualLocationFeatureId', 'virtual_location_feature_id'
    ]
    const hasCurtainWrite = curtainKeys.some((key) => Object.prototype.hasOwnProperty.call(body, key))
    const preparedBody = { ...body }
    // 帷幕归属只能由服务端按当前 world_id 盖章，忽略客户端直接写入。
    delete preparedBody.virtualSceneWorldId
    delete preparedBody.virtual_scene_world_id
    if (hasCurtainWrite) {
      const worldId = String(existingSession?.worldId ?? existingSession?.world_id ?? '').trim()
      const hasSheetWrite = hasOwnDefinedValue(body, ['virtualLocationSheetId', 'virtual_location_sheet_id'])
      const hasFeatureWrite = hasOwnDefinedValue(body, ['virtualLocationFeatureId', 'virtual_location_feature_id'])
      let sheetId = String(
        hasSheetWrite
          ? body.virtualLocationSheetId ?? body.virtual_location_sheet_id ?? ''
          : existingSession?.virtualLocationSheetId ?? existingSession?.virtual_location_sheet_id ?? ''
      ).trim()
      let featureId = String(
        hasFeatureWrite
          ? body.virtualLocationFeatureId ?? body.virtual_location_feature_id ?? ''
          : existingSession?.virtualLocationFeatureId ?? existingSession?.virtual_location_feature_id ?? ''
      ).trim()
      if (!worldId && (sheetId || featureId)) {
        return { changed: false, fields: {}, error: '无世界会话不能保存地图坐标引用', status: 400 }
      }
      if (sheetId) {
        const sheet = typeof chatRepository.findMapSheetById === 'function'
          ? chatRepository.findMapSheetById(sheetId) as Record<string, any> | null
          : null
        if (!sheet || String(sheet.worldId ?? sheet.world_id ?? '') !== worldId) {
          return { changed: false, fields: {}, error: '帷幕图纸不属于当前世界', status: 400 }
        }
      }
      if (featureId) {
        const feature = worldId && typeof chatRepository.findMapFeatureById === 'function'
          ? chatRepository.findMapFeatureById(featureId, worldId) as Record<string, any> | null
          : null
        if (!feature) {
          return { changed: false, fields: {}, error: '帷幕地图要素不属于当前世界', status: 400 }
        }
        const featureSheetId = String(feature.sheetId ?? feature.sheet_id ?? '').trim()
        if (sheetId && sheetId !== featureSheetId) {
          if (hasFeatureWrite) return { changed: false, fields: {}, error: '帷幕地图要素不属于所选图纸', status: 400 }
          featureId = ''
        } else {
          sheetId = featureSheetId
        }
      }
      preparedBody.virtualSceneWorldId = worldId
      preparedBody.virtualLocationSheetId = sheetId
      preparedBody.virtualLocationFeatureId = featureId
    }
    const normalized = buildSessionPatch(preparedBody, sessionId)

    for (const [key, raw] of Object.entries(normalized)) {
      if (!colSet.has(key) || raw === undefined) continue
      let value = raw
      if (key === 'loaded_summary_ids') {
        value = Array.isArray(raw) ? JSON.stringify(raw) : raw
      }
      if (key === 'narration_frequency') value = normalizeNarrationFrequency(raw)
      if (key === 'narration_temperature') value = normalizeNarrationTemperature(raw)
      if (key === 'narration_profiles') value = normalizeNarrationProfilesPayload(raw)
      if (key === 'narration_force_enabled') value = raw === true || raw === 1 || raw === '1' || raw === 'true' ? 1 : 0
      if (key === 'chat_font_scale') value = normalizeChatFontScale(raw)
      if (key === 'dynamic_world_enabled') value = raw === true || raw === 1 || raw === '1' || raw === 'true' ? 1 : 0
      if (key === 'reply_pipeline_mode') value = normalizeChatSessionReplyPipelineMode(raw)
      fields[key] = value
    }

    if (Object.keys(fields).length === 0) {
      return { changed: false, fields }
    }

    chatRepository.updateSessionById(sessionId, fields, colSet.has('updated_at'))
    persistChatMutation()
    return { changed: true, fields }
  }

  function addMessageToSession(sessionId: string, payload: Record<string, any>, options: WorkspaceRequestOptions = {}) {
    const {
      role,
      content,
      time,
      envDate,
      envWeather,
      envLocation,
      image,
      model,
      crowdName,
      memberName,
      narrationProfileId,
      narration_profile_id,
      narrationProfileName,
      narration_profile_name,
      narrationProfileKind,
      narration_profile_kind,
      includeInContext,
      include_in_context,
      versionList,
      activeVersionIndex,
      autoWriteHidden,
      auto_write_hidden,
      autoWriteHiddenAt,
      auto_write_hidden_at,
      autoWriteBatchId,
      auto_write_batch_id,
      autoWriteHiddenReason,
      auto_write_hidden_reason,
      attachments,
      attachments_json,
      turn_stream_json
    } = payload
    const messageKind = String(payload.messageKind ?? payload.message_kind ?? (role === 'system' ? 'system' : 'chat')).trim() || 'chat'
    // 附件真值 = attachments_json：接受两种入参二选一——数组 attachments（服务端序列化）或直接传字符串
    // attachments_json（原样存，供内部转发场景用）；都没传则空数组，不影响现有无图消息。
    const attachmentsJson = typeof attachments_json === 'string'
      ? attachments_json
      : JSON.stringify(Array.isArray(attachments) ? attachments : [])
    // 星依过程流真值 = turn_stream_json（星依浮坞侧已序列化好的 JSON 字符串，直接原样存，不做二次处理）：
    // 普通聊天链路不传这个键，落空串——与 attachments_json 的「原样字符串」分支同构。
    const turnStreamJson = typeof turn_stream_json === 'string' ? turn_stream_json : ''
    const messageSourceKind = normalizeMessageSourceKind(payload.messageSourceKind ?? payload.message_source_kind)
    const focusedActionGroupId = String(payload.focusedActionGroupId ?? payload.focused_action_group_id ?? '').trim().slice(0, 240)
    const focusedActionVisibility = messageSourceKind === FOCUSED_ACTION_SOURCE_KIND
      ? normalizeFocusedActionVisibility(payload.focusedActionVisibility ?? payload.focused_action_visibility)
      : ''

    if (!role || !content) {
      return { ok: false as const, status: 400, error: '消息必须包含role和content' }
    }
    if (!isSupportedChatMessageKind(messageKind)) {
      return { ok: false as const, status: 400, error: '消息类型不支持' }
    }
    if (messageKind === 'caps_reply') {
      return { ok: false as const, status: 410, error: 'CAPS 人格网络回复链路已退役，不能新增 caps_reply 消息' }
    }
    if (typeof content !== 'string' || content.length > 50000) {
      return { ok: false as const, status: 400, error: '消息内容过长或格式错误' }
    }
    if (messageSourceKind === FOCUSED_ACTION_SOURCE_KIND && !focusedActionGroupId) {
      return { ok: false as const, status: 400, error: '动作消息缺少同组标识' }
    }

    const session = chatRepository.getSessionById(sessionId)
    if (!session) {
      return { ok: false as const, status: 404, error: '会话不存在' }
    }

    const result = chatRepository.insertMessage(sessionId, {
      role,
      messageKind,
      content,
      name: '',
      time: time ?? '',
      envDate: envDate ?? '',
      envWeather: envWeather ?? '',
      envLocation: envLocation ?? '',
      image: image ?? '',
      model: model ?? '',
      crowdName: crowdName ?? '',
      memberName: memberName ?? '',
      narrationProfileId: narrationProfileId ?? narration_profile_id ?? '',
      narrationProfileName: narrationProfileName ?? narration_profile_name ?? '',
      narrationProfileKind: narrationProfileKind ?? narration_profile_kind ?? '',
      includeInContext: includeInContext ?? include_in_context,
      messageSourceKind,
      focusedActionGroupId,
      focusedActionVisibility,
      versionsJson: JSON.stringify(Array.isArray(versionList) ? versionList : []),
      activeVersionIndex: Number.isInteger(activeVersionIndex) ? activeVersionIndex : 0,
      attachmentsJson,
      turnStreamJson,
      createdAt: new Date().toISOString(),
      autoWriteHidden: autoWriteHidden ?? auto_write_hidden,
      autoWriteHiddenAt: autoWriteHiddenAt ?? auto_write_hidden_at ?? '',
      autoWriteBatchId: autoWriteBatchId ?? auto_write_batch_id ?? '',
      autoWriteHiddenReason: autoWriteHiddenReason ?? auto_write_hidden_reason ?? ''
    })
    chatRepository.touchSession(sessionId)
    persistChatMutation()
    return { ok: true as const, data: { ok: true, id: (result as { lastInsertRowid: number }).lastInsertRowid } }
  }

  function normalizeCopiedChatMessage(payload: Record<string, any>, createdAt: string) {
    const role = payload.role
    const content = payload.content
    if (!role || !content) {
      return { ok: false as const, status: 400, error: '消息必须包含role和content' }
    }
    if (typeof content !== 'string' || content.length > 50000) {
      return { ok: false as const, status: 400, error: '消息内容过长或格式错误' }
    }
    const attachmentsJson = typeof payload.attachments_json === 'string'
      ? payload.attachments_json
      : typeof payload.attachmentsJson === 'string'
        ? payload.attachmentsJson
        : JSON.stringify(Array.isArray(payload.attachments) ? payload.attachments : [])
    const turnStreamJson = typeof payload.turn_stream_json === 'string'
      ? payload.turn_stream_json
      : typeof payload.turnStreamJson === 'string'
        ? payload.turnStreamJson
        : ''
    const versionList = payload.versionList ?? payload.versionsJson ?? payload.versions_json
    return {
      ok: true as const,
      data: {
        role,
        messageKind: payload.messageKind ?? payload.message_kind ?? 'chat',
        content,
        name: '',
        time: payload.time ?? '',
        envDate: payload.envDate ?? payload.env_date ?? '',
        envWeather: payload.envWeather ?? payload.env_weather ?? '',
        envLocation: payload.envLocation ?? payload.env_location ?? '',
        image: payload.image ?? '',
        model: payload.model ?? '',
        crowdName: payload.crowdName ?? payload.crowd_name ?? '',
        memberName: payload.memberName ?? payload.member_name ?? payload.name ?? '',
        narrationProfileId: payload.narrationProfileId ?? payload.narration_profile_id ?? '',
        narrationProfileName: payload.narrationProfileName ?? payload.narration_profile_name ?? '',
        narrationProfileKind: payload.narrationProfileKind ?? payload.narration_profile_kind ?? '',
        includeInContext: payload.includeInContext ?? payload.include_in_context,
        messageSourceKind: normalizeMessageSourceKind(payload.messageSourceKind ?? payload.message_source_kind),
        focusedActionGroupId: String(payload.focusedActionGroupId ?? payload.focused_action_group_id ?? '').trim().slice(0, 240),
        focusedActionVisibility: normalizeMessageSourceKind(payload.messageSourceKind ?? payload.message_source_kind) === FOCUSED_ACTION_SOURCE_KIND
          ? normalizeFocusedActionVisibility(payload.focusedActionVisibility ?? payload.focused_action_visibility)
          : '',
        versionsJson: typeof versionList === 'string'
          ? versionList
          : JSON.stringify(Array.isArray(versionList) ? versionList : []),
        activeVersionIndex: Number.isInteger(payload.activeVersionIndex ?? payload.active_version_index)
          ? payload.activeVersionIndex ?? payload.active_version_index
          : 0,
        attachmentsJson,
        turnStreamJson,
        createdAt,
        autoWriteHidden: payload.autoWriteHidden ?? payload.auto_write_hidden,
        autoWriteHiddenAt: payload.autoWriteHiddenAt ?? payload.auto_write_hidden_at ?? '',
        autoWriteBatchId: payload.autoWriteBatchId ?? payload.auto_write_batch_id ?? '',
        autoWriteHiddenReason: payload.autoWriteHiddenReason ?? payload.auto_write_hidden_reason ?? ''
      }
    }
  }

  function buildImprovisedCharacterContextForSession(sessionId: string, targetName: string) {
    const normalizedSessionId = String(sessionId || '').trim()
    const normalizedTargetName = String(targetName || '').trim()
    if (!chatRepository.getSessionById(normalizedSessionId)) {
      return { ok: false as const, status: 404, error: '会话不存在' }
    }
    const command = parseImprovisedCharacterCreateCommand(`/创建角色 ${normalizedTargetName}`)
    if (!command) {
      return { ok: false as const, status: 400, error: '即兴角色称呼不能为空' }
    }
    const messages = typeof chatRepository.getMessagesBySessionIdOrdered === 'function'
      ? chatRepository.getMessagesBySessionIdOrdered(normalizedSessionId)
      : chatRepository.getMessagesBySessionId(normalizedSessionId)
    return {
      ok: true as const,
      data: buildImprovisedCharacterContext({
        command,
        messages: Array.isArray(messages) ? messages.map((item: Record<string, unknown>) => toCamel(item)) : []
      })
    }
  }

  function extractAiMessageContent(data: any): string {
    const choice = Array.isArray(data?.choices) ? data.choices[0] : null
    return String(
      choice?.message?.content
      ?? choice?.delta?.content
      ?? choice?.text
      ?? data?.content
      ?? data?.text
      ?? ''
    ).trim()
  }

  function getUserDisplayName() {
    const profile = typeof characterRepository?.getUserProfile === 'function'
      ? characterRepository.getUserProfile()
      : null
    return toText(profile?.name) || '用户'
  }

  function resolveProjectionUserName(message: Record<string, any>, session: Record<string, any>) {
    // 历史消息自身保存的是发送当时的身份快照，优先级最高；不能被后来切换的马甲反向改写。
    if (toText(message.role) === 'user') {
      const messageName = toText(message.memberName ?? message.member_name ?? message.name)
      if (messageName) return messageName
    }
    const boundAliasId = toText(session.boundAlias ?? session.bound_alias)
    if (boundAliasId && typeof characterRepository?.getAliasById === 'function') {
      const alias = characterRepository.getAliasById(boundAliasId)
      const aliasName = toText(alias?.name)
      if (aliasName) return aliasName
    }
    return getUserDisplayName()
  }

  function buildCharacterNameMap() {
    const rows = typeof characterRepository?.getCharacters === 'function'
      ? characterRepository.getCharacters()
      : []
    const map = new Map<string, string>()
    ;(Array.isArray(rows) ? rows : []).forEach((row: Record<string, unknown>) => {
      const id = toText(row.id)
      if (!id) return
      map.set(id, toText(row.name) || id)
    })
    return map
  }

  function collectProjectionParticipants(sessionId: string, session: Record<string, any>): MessageProjectionParticipant[] {
    const characterNames = buildCharacterNameMap()
    const rows = typeof chatRepository.listSessionParticipants === 'function'
      ? chatRepository.listSessionParticipants(sessionId)
      : []
    const result: MessageProjectionParticipant[] = []
    const seen = new Set<string>()
    const add = (id: string, role = 'member') => {
      const normalizedId = toText(id)
      if (!normalizedId || seen.has(normalizedId)) return
      seen.add(normalizedId)
      result.push({
        id: normalizedId,
        name: characterNames.get(normalizedId) || normalizedId,
        role
      })
    }
    ;(Array.isArray(rows) ? rows : []).forEach((row: Record<string, unknown>) => {
      const participantType = toText(row.participantType ?? row.participant_type)
      if (participantType && participantType !== 'char') return
      add(toText(row.participantTargetId ?? row.participant_target_id), toText(row.role) || 'member')
    })
    const targetType = toText(session.targetType ?? session.target_type)
    if (targetType === 'char') {
      add(toText(session.targetId ?? session.target_id), 'member')
    }
    return result
  }

  function resolveProjectionSpeaker(message: Record<string, any>, session: Record<string, any>, participants: MessageProjectionParticipant[]) {
    const role = toText(message.role)
    const messageKind = toText(message.messageKind ?? message.message_kind) || 'chat'
    if (role === 'user') {
      return { speakerId: 'user', speakerName: resolveProjectionUserName(message, session) }
    }
    if (messageKind === 'narration') {
      return { speakerId: 'narration', speakerName: '旁白' }
    }
    const speakerName = toText(message.memberName ?? message.member_name ?? message.name ?? message.crowdName ?? message.crowd_name)
    const matched = speakerName
      ? participants.find((item) => item.name === speakerName)
      : null
    if (matched) return { speakerId: matched.id, speakerName: matched.name }
    const targetType = toText(session.targetType ?? session.target_type)
    const targetId = toText(session.targetId ?? session.target_id)
    const singleTarget = targetType === 'char' && targetId
      ? participants.find((item) => item.id === targetId)
      : null
    if (singleTarget) return { speakerId: singleTarget.id, speakerName: singleTarget.name }
    return { speakerId: '', speakerName: speakerName || '角色' }
  }

  function buildProjectionSourceMessage(
    sessionId: string,
    message: Record<string, any>,
    session: Record<string, any>,
    participants: MessageProjectionParticipant[]
  ): MessageProjectionSourceMessage {
    const role = toText(message.role)
    const messageKind = toText(message.messageKind ?? message.message_kind) || (role === 'system' ? 'system' : 'chat')
    const speaker = resolveProjectionSpeaker(message, session, participants)
    const userIdentityName = resolveProjectionUserName(message, session)
    return {
      id: Number(message.id || 0),
      role,
      messageKind,
      content: toText(message.content),
      speakerId: speaker.speakerId,
      speakerName: speaker.speakerName,
      // 会话参与者只是投影可见范围，不是真实剧情听者；可见性继续由独立表按 participants 写入。
      // 当前消息没有结构化指向字段时宁可留空，不把整个会话成员表伪装成在场/受令对象。
      audienceIds: [],
      audienceNames: [],
      userIdentityName,
      env: {
        time: toText(message.time || session.virtualTime || session.virtual_time),
        locationLarge: toText(session.virtualLocationLarge ?? session.virtual_location_large),
        locationMiddle: toText(session.virtualLocationMiddle ?? session.virtual_location_middle),
        locationSmall: toText(session.virtualLocationSmall ?? session.virtual_location_small),
        location: toText(message.envLocation ?? message.env_location ?? session.virtualLocation ?? session.virtual_location),
        weather: toText(message.envWeather ?? message.env_weather ?? session.virtualWeather ?? session.virtual_weather)
      },
      createdAt: toText(message.createdAt ?? message.created_at)
    }
  }

  function shouldProjectChatMessage(message: Record<string, any>) {
    const role = toText(message.role)
    const messageKind = toText(message.messageKind ?? message.message_kind) || (role === 'system' ? 'system' : 'chat')
    const autoWriteHidden = Number(message.autoWriteHidden ?? message.auto_write_hidden ?? 0) === 1
    if (autoWriteHidden) return false
    if (role === 'user' && messageKind === 'chat') return true
    if (role === 'assistant' && messageKind === 'chat') return true
    if (messageKind === 'narration') return true
    return false
  }

  function listPreviousProjectionInputs(sessionId: string, messageId: number) {
    const rows = typeof chatRepository.listMessageProjectionsBySessionId === 'function'
      ? chatRepository.listMessageProjectionsBySessionId(sessionId)
      : []
    const latestByMessageId = new Map<number, Record<string, unknown>>()
    ;(Array.isArray(rows) ? rows : [])
      .filter((row: Record<string, unknown>) => {
        const rowMessageId = Number(row.messageId ?? row.message_id ?? 0)
        const status = toText(row.status)
        return rowMessageId > 0 && rowMessageId < messageId && (status === 'complete' || status === 'partial')
      })
      .forEach((row: Record<string, unknown>) => {
        latestByMessageId.set(Number(row.messageId ?? row.message_id ?? 0), row)
      })
    return Array.from(latestByMessageId.values())
      .sort((a, b) => Number(a.messageId ?? a.message_id ?? 0) - Number(b.messageId ?? b.message_id ?? 0))
      .slice(-2)
      .map((row: Record<string, unknown>) => ({
        id: toText(row.id),
        messageId: Number(row.messageId ?? row.message_id ?? 0),
        status: toText(row.status),
        speakerName: toText(row.speakerName ?? row.speaker_name),
        audienceNames: row.audienceNames ?? row.audienceNamesJson ?? row.audience_names_json,
        objectiveFact: toText(row.objectiveFact ?? row.objective_fact),
        endEnv: row.endEnv ?? row.endEnvJson ?? row.end_env_json,
        createdAt: toText(row.createdAt ?? row.created_at)
      }))
  }

  function readProjectionEnv(value: unknown): MessageProjectionEnv {
    const record = parseJsonObject(value)
    const env: MessageProjectionEnv = {}
    if (Object.prototype.hasOwnProperty.call(record, 'time')) env.time = toText(record.time)
    if (Object.prototype.hasOwnProperty.call(record, 'locationLarge') || Object.prototype.hasOwnProperty.call(record, 'location_large')) {
      env.locationLarge = toText(record.locationLarge ?? record.location_large)
    }
    if (Object.prototype.hasOwnProperty.call(record, 'locationMiddle') || Object.prototype.hasOwnProperty.call(record, 'location_middle')) {
      env.locationMiddle = toText(record.locationMiddle ?? record.location_middle)
    }
    if (Object.prototype.hasOwnProperty.call(record, 'locationSmall') || Object.prototype.hasOwnProperty.call(record, 'location_small')) {
      env.locationSmall = toText(record.locationSmall ?? record.location_small)
    }
    if (Object.prototype.hasOwnProperty.call(record, 'location')) env.location = toText(record.location)
    if (Object.prototype.hasOwnProperty.call(record, 'weather')) env.weather = toText(record.weather)
    return env
  }

  function buildProjectionCurtainPatch(
    env: MessageProjectionEnv | Record<string, unknown> | null | undefined,
    options: { includeTime?: boolean; includeLocation?: boolean; includeWeather?: boolean } = {}
  ): Record<string, unknown> {
    const source = env || {}
    const includeTime = options.includeTime !== false
    const includeLocation = options.includeLocation !== false
    const includeWeather = options.includeWeather === true
    const patch: Record<string, unknown> = {}
    if (includeTime && Object.prototype.hasOwnProperty.call(source, 'time')) {
      patch.virtual_time = toText((source as MessageProjectionEnv).time)
    }
    if (includeWeather && Object.prototype.hasOwnProperty.call(source, 'weather')) {
      patch.virtual_weather = toText((source as MessageProjectionEnv).weather)
    }
    if (includeLocation) {
      const locationParts = resolveVirtualSceneLocationParts(
        (source as MessageProjectionEnv).locationLarge,
        (source as MessageProjectionEnv).locationMiddle,
        (source as MessageProjectionEnv).locationSmall,
        (source as MessageProjectionEnv).location
      )
      const location = composeVirtualSceneLocationLabel(
        locationParts.large,
        locationParts.middle,
        locationParts.small,
        (source as MessageProjectionEnv).location
      )
      const hasLocationSignal = Boolean(
        location
        || Object.prototype.hasOwnProperty.call(source, 'locationLarge')
        || Object.prototype.hasOwnProperty.call(source, 'locationMiddle')
        || Object.prototype.hasOwnProperty.call(source, 'locationSmall')
        || Object.prototype.hasOwnProperty.call(source, 'location')
      )
      if (hasLocationSignal) {
        patch.virtual_location_large = locationParts.large
        patch.virtual_location_middle = locationParts.middle
        patch.virtual_location_small = locationParts.small
        patch.virtual_location = location
      }
    }
    return patch
  }

  function applyProjectionCurtainPatch(sessionId: string, patch: Record<string, unknown>) {
    if (!sessionId || !Object.keys(patch).length || typeof chatRepository.updateSessionById !== 'function') {
      return false
    }
    chatRepository.updateSessionById(sessionId, patch, true)
    return true
  }

  function applyProjectionEndEnvToCurtain(sessionId: string, normalized: ReturnType<typeof normalizeMessageProjectionAgentOutput>) {
    if (normalized.status !== 'complete' && normalized.status !== 'partial') return false
    const changed = normalized.changed || { time: false, location: false }
    const patch = buildProjectionCurtainPatch(normalized.endEnv, {
      includeTime: Boolean(changed.time),
      includeLocation: Boolean(changed.location),
      includeWeather: Boolean(changed.time || changed.location)
    })
    return applyProjectionCurtainPatch(sessionId, patch)
  }

  function restoreProjectionCurtainBeforeMessage(sessionId: string, messageId: string | number) {
    const normalizedMessageId = Number(messageId || 0)
    if (!sessionId || !Number.isInteger(normalizedMessageId) || normalizedMessageId <= 0) {
      return { restored: false, projectionId: '', fields: {} as Record<string, unknown> }
    }
    const rows = typeof chatRepository.listMessageProjectionsBySessionId === 'function'
      ? chatRepository.listMessageProjectionsBySessionId(sessionId)
      : []
    const projection = (Array.isArray(rows) ? rows : [])
      .filter((row: Record<string, unknown>) => {
        const rowMessageId = Number(row.messageId ?? row.message_id ?? 0)
        const status = toText(row.status)
        return rowMessageId > 0 && rowMessageId < normalizedMessageId && (status === 'complete' || status === 'partial')
      })
      .at(-1) as Record<string, unknown> | undefined
    if (!projection) {
      return { restored: false, projectionId: '', fields: {} as Record<string, unknown> }
    }
    const env = readProjectionEnv(projection.endEnv ?? projection.endEnvJson ?? projection.end_env_json)
    const fields = buildProjectionCurtainPatch(env, {
      includeTime: true,
      includeLocation: true,
      includeWeather: true
    })
    const restored = applyProjectionCurtainPatch(sessionId, fields)
    return { restored, projectionId: toText(projection.id), fields }
  }

  function insertProjectionPromptLog(
    sessionId: string,
    messageId: number,
    promptTrace: ReturnType<typeof buildMessageProjectionPrompt>,
    rawOutput: string,
    projectionStatus: string,
    errorText = ''
  ) {
    const total = chatRepository.countPromptLogsBySessionId(sessionId)
    const logId = buildPromptLogId()
    chatRepository.insertPromptLog(sessionId, {
      id: logId,
      pageIndex: Math.floor(total / 30) + 1,
      entryIndex: (total % 30) + 1,
      assistantMessageId: messageId,
      speakerName: '消息投影 Agent',
      targetId: '',
      finalPrompt: promptTrace.finalPrompt,
      promptBlocksJson: JSON.stringify([
        ...promptTrace.promptBlocks,
        {
          role: 'assistant',
          title: `消息投影 · ${projectionStatus}`,
          content: rawOutput || errorText || '空输出'
        }
      ]),
      // 只有用户主动点击投影时才会调用本函数；单独的存储类型避免历史自动投影日志混回提示词库。
      logKind: 'manual_projection',
      createdAt: new Date().toISOString()
    })
    return logId
  }

  async function runMessageProjectionAgent(
    sessionId: string,
    messageId: number,
    options: WorkspaceRequestOptions = {},
    // 消耗溯源：批量投影由客户端铸 op:batch_projection:… 单元 id 传入；单条投影缺省并入消息所在轮。
    usageUnit: { unitId?: string; unitKind?: string; promptLogMode?: 'manual' | 'background' } = {}
  ) {
    const normalizedSessionId = toText(sessionId)
    const normalizedMessageId = Number(messageId || 0)
    if (!normalizedSessionId || !Number.isInteger(normalizedMessageId) || normalizedMessageId <= 0) {
      return { ok: false as const, status: 400, error: '投影必须绑定有效消息' }
    }
    const session = chatRepository.getSessionById(normalizedSessionId)
    if (!session) {
      return { ok: false as const, status: 404, error: '会话不存在' }
    }
    const message = chatRepository.findMessageByIdInSession(normalizedSessionId, normalizedMessageId)
    if (!message) {
      return { ok: false as const, status: 404, error: '消息不存在' }
    }
    if (!shouldProjectChatMessage(message)) {
      return { ok: false as const, status: 400, error: '该消息类型不进入人格模型投影' }
    }
    if (typeof chatRepository.upsertMessageProjection !== 'function') {
      return { ok: false as const, status: 500, error: '投影仓储未配置' }
    }

    const participants = collectProjectionParticipants(normalizedSessionId, session)
    const sourceMessage = buildProjectionSourceMessage(normalizedSessionId, message, session, participants)
    const previousProjections = listPreviousProjectionInputs(normalizedSessionId, normalizedMessageId)
    const promptTrace = buildMessageProjectionPrompt({
      sessionId: normalizedSessionId,
      message: sourceMessage,
      participants,
      previousProjections
    })
    const shouldWritePromptLog = usageUnit.promptLogMode !== 'background'
    const attemptId = `attempt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const projectionId = `projection_${normalizedSessionId}_${normalizedMessageId}_${attemptId}`
    // 用户消息必须按 role 剥离私密提调指令【【…】】：fallbackCleanText 是失败兜底时喂角色的文本，带指令=泄漏。
    const cleanText = cleanMessageProjectionSourceText(sourceMessage.content, { isUserMessage: sourceMessage.role === 'user' })
    // 纯私密指令消息（2026-07-04）：用户整条只有【【…】】、剥离后无可见正文——没有可投影的事实，
    // 直接落一条空事实 complete 投影并照写可见性（读侧空 fact 自动过滤=对角色隐身，语义正确），
    // 不调投影模型，避免空正文让模型幻觉出「事实」带进角色上下文。
    if (sourceMessage.role === 'user' && !cleanText) {
      const projection = chatRepository.upsertMessageProjection(normalizedSessionId, {
        id: projectionId,
        messageId: normalizedMessageId,
        attemptId,
        status: 'complete',
        messageKind: sourceMessage.messageKind,
        speakerId: sourceMessage.speakerId,
        speakerName: sourceMessage.speakerName,
        audienceIds: sourceMessage.audienceIds,
        audienceNames: sourceMessage.audienceNames,
        participants: [toText(sourceMessage.speakerName), ...(Array.isArray(sourceMessage.audienceNames) ? sourceMessage.audienceNames : [])].filter(Boolean),
        objectiveFact: '',
        fallbackCleanText: '',
        startEnv: sourceMessage.env,
        endEnv: sourceMessage.env,
        changed: { time: false, location: false },
        sourceProjectionIds: previousProjections.map((item) => item.id).filter(Boolean),
        completedAt: new Date().toISOString()
      })
      if (typeof chatRepository.upsertMessageProjectionVisibility === 'function') {
        participants.forEach((participant) => {
          chatRepository.upsertMessageProjectionVisibility(normalizedSessionId, {
            projectionId,
            messageId: normalizedMessageId,
            characterId: participant.id,
            visibility: 'visible',
            reason: 'system'
          })
        })
      }
      const promptLogId = shouldWritePromptLog
        ? insertProjectionPromptLog(normalizedSessionId, normalizedMessageId, promptTrace, '', 'complete')
        : ''
      persistChatMutation()
      return { ok: true as const, data: { projection, promptLogId, rawOutput: '' } }
    }
    chatRepository.upsertMessageProjection(normalizedSessionId, {
      id: projectionId,
      messageId: normalizedMessageId,
      attemptId,
      status: 'running',
      messageKind: sourceMessage.messageKind,
      speakerId: sourceMessage.speakerId,
      speakerName: sourceMessage.speakerName,
      audienceIds: sourceMessage.audienceIds,
      audienceNames: sourceMessage.audienceNames,
      fallbackCleanText: cleanText,
      startEnv: sourceMessage.env,
      endEnv: sourceMessage.env,
      changed: { time: false, location: false },
      sourceProjectionIds: previousProjections.map((item) => item.id).filter(Boolean)
    })

    const failProjection = (stage: string, reason: string, rawOutput = '') => {
      const normalized = normalizeMessageProjectionAgentOutput(rawOutput || '{}', sourceMessage)
      const projection = chatRepository.upsertMessageProjection(normalizedSessionId, {
        id: projectionId,
        messageId: normalizedMessageId,
        attemptId,
        status: 'failed',
        messageKind: sourceMessage.messageKind,
        speakerId: sourceMessage.speakerId,
        speakerName: sourceMessage.speakerName,
        audienceIds: sourceMessage.audienceIds,
        audienceNames: sourceMessage.audienceNames,
        objectiveFact: '',
        fallbackCleanText: cleanText,
        startEnv: sourceMessage.env,
        endEnv: sourceMessage.env,
        changed: { time: false, location: false },
        sourceProjectionIds: previousProjections.map((item) => item.id).filter(Boolean),
        failureStage: stage || normalized.failureStage,
        failureReason: reason || normalized.failureReason,
        completedAt: new Date().toISOString()
      })
      const promptLogId = shouldWritePromptLog
        ? insertProjectionPromptLog(normalizedSessionId, normalizedMessageId, promptTrace, rawOutput, 'failed', reason)
        : ''
      persistChatMutation()
      return { ok: true as const, data: { projection, promptLogId, rawOutput, error: reason } }
    }

    if (!deps.aiService?.callAIWithFallback) {
      return failProjection('call_model', 'AI 服务未配置')
    }

    const aiOptions = buildAgentSlotAiCallOptions('messageProjection', { maxTokens: 1200, thinking: 'disabled', temperature: 0.2 })
    // 消耗溯源：显式单元 id（批量投影）优先；否则并入该消息所在轮（round:… 口径与客户端一致）。
    const usageUnitId = toText(usageUnit.unitId)
    const roundAnchorId = typeof chatRepository.findRoundAnchorUserMessageId === 'function'
      ? chatRepository.findRoundAnchorUserMessageId(normalizedSessionId, normalizedMessageId)
      : 0
    const result = await callInternalAIJson(
      deps.aiService,
      aiOptions.presetName,
      aiOptions.model,
      promptTrace.messages,
      deps.logger,
      {
        userId: options.userId || '',
        role: 'local',
        feature: 'agent',
        modelUsageSlotId: aiOptions.modelUsageSlotId,
        sessionId: normalizedSessionId,
        sessionLabel: toText((session as Record<string, unknown>).title),
        roundId: usageUnitId || (roundAnchorId > 0 ? `round:${normalizedSessionId}:${roundAnchorId}` : ''),
        unitKind: toText(usageUnit.unitKind) || (usageUnitId ? 'batch_projection' : 'projection'),
        usageLabel: `消息投影：#${normalizedMessageId}`,
        placeLabel: toText(sourceMessage.speakerName),
        maxTokens: aiOptions.maxTokens,
        temperature: aiOptions.temperature,
        thinking: aiOptions.thinking
      }
    )
    if (result.error) {
      return failProjection('call_model', `模型调用失败：${result.error}`)
    }
    if (result.jsonParseError) {
      return failProjection('read_response', `模型响应解析失败：${result.jsonParseError}`)
    }
    if (!result.json) {
      return failProjection('call_model', '模型没有返回响应')
    }
    const rawOutput = extractAiMessageContent(result.json)
    const normalized = normalizeMessageProjectionAgentOutput(rawOutput, sourceMessage)
    const projection = chatRepository.upsertMessageProjection(normalizedSessionId, {
      id: projectionId,
      messageId: normalizedMessageId,
      attemptId,
      status: normalized.status,
      messageKind: sourceMessage.messageKind,
      speakerId: normalized.speakerId,
      speakerName: normalized.speakerName,
      audienceIds: normalized.audienceIds,
      audienceNames: normalized.audienceNames,
      participants: normalized.participants,
      objectiveFact: normalized.objectiveFact,
      fallbackCleanText: normalized.fallbackCleanText,
      startEnv: normalized.startEnv,
      endEnv: normalized.endEnv,
      changed: normalized.changed,
      // 上下文来源由代码确定，不要求模型复述内部 id；只记录实际送入本次投影的前两条。
      sourceProjectionIds: previousProjections.map((item) => item.id).filter(Boolean),
      failureStage: normalized.failureStage,
      failureReason: normalized.failureReason,
      completedAt: new Date().toISOString()
    })
    applyProjectionEndEnvToCurtain(normalizedSessionId, normalized)
    if (typeof chatRepository.upsertMessageProjectionVisibility === 'function') {
      participants.forEach((participant) => {
        chatRepository.upsertMessageProjectionVisibility(normalizedSessionId, {
          projectionId,
          messageId: normalizedMessageId,
          characterId: participant.id,
          visibility: 'visible',
          reason: 'system'
        })
      })
    }
    const promptLogId = shouldWritePromptLog
      ? insertProjectionPromptLog(normalizedSessionId, normalizedMessageId, promptTrace, rawOutput, normalized.status)
      : ''
    persistChatMutation()
    return { ok: true as const, data: { projection, promptLogId, rawOutput } }
  }

  async function saveEmbeddedMessageProjection(
    sessionId: string,
    messageId: number,
    payload: Record<string, any> = {},
    options: WorkspaceRequestOptions = {}
  ) {
    void options
    const normalizedSessionId = toText(sessionId)
    const normalizedMessageId = Number(messageId || 0)
    if (!normalizedSessionId || !Number.isInteger(normalizedMessageId) || normalizedMessageId <= 0) {
      return { ok: false as const, status: 400, error: '投影必须绑定有效消息' }
    }
    const session = chatRepository.getSessionById(normalizedSessionId)
    if (!session) {
      return { ok: false as const, status: 404, error: '会话不存在' }
    }
    const message = chatRepository.findMessageByIdInSession(normalizedSessionId, normalizedMessageId)
    if (!message) {
      return { ok: false as const, status: 404, error: '消息不存在' }
    }
    if (!shouldProjectChatMessage(message)) {
      return { ok: false as const, status: 400, error: '该消息类型不进入人格模型投影' }
    }
    if (typeof chatRepository.upsertMessageProjection !== 'function') {
      return { ok: false as const, status: 500, error: '投影仓储未配置' }
    }

    const participants = collectProjectionParticipants(normalizedSessionId, session)
    const sourceMessage = buildProjectionSourceMessage(normalizedSessionId, message, session, participants)
    const previousProjections = listPreviousProjectionInputs(normalizedSessionId, normalizedMessageId)
    const rawOutput = toText(payload.projectionText ?? payload.projection_text)
    const failureReason = toText(payload.failureReason ?? payload.failure_reason)
    const failureStage = toText(payload.failureStage ?? payload.failure_stage) || 'parse_embedded_projection'
    const attemptSuffix = toText(payload.attemptId ?? payload.attempt_id) || `embedded_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const attemptId = attemptSuffix.startsWith('embedded_') ? attemptSuffix : `embedded_${attemptSuffix}`
    const projectionId = `projection_${normalizedSessionId}_${normalizedMessageId}_${attemptId}`
    // 与投影运行路径同口径：用户消息按 role 剥离私密指令，防 fallbackCleanText 兜底泄漏。
    const cleanText = cleanMessageProjectionSourceText(sourceMessage.content, { isUserMessage: sourceMessage.role === 'user' })
    const previousProjectionIds = previousProjections.map((item) => item.id).filter(Boolean)
    const normalized = rawOutput
      ? normalizeMessageProjectionAgentOutput(rawOutput, sourceMessage)
      : {
          status: 'failed' as const,
          speakerId: toText(sourceMessage.speakerId),
          speakerName: toText(sourceMessage.speakerName),
          audienceIds: Array.isArray(sourceMessage.audienceIds) ? sourceMessage.audienceIds : [],
          audienceNames: Array.isArray(sourceMessage.audienceNames) ? sourceMessage.audienceNames : [],
          participants: [toText(sourceMessage.speakerName), ...(Array.isArray(sourceMessage.audienceNames) ? sourceMessage.audienceNames : [])].filter(Boolean),
          objectiveFact: '',
          fallbackCleanText: cleanText,
          startEnv: sourceMessage.env || {},
          endEnv: sourceMessage.env || {},
          changed: { time: false, location: false },
          sourceProjectionIds: previousProjectionIds,
          failureStage,
          failureReason: failureReason || '模型输出缺少可解析的内嵌消息投影'
        }
    const status = normalized.status
    const projection = chatRepository.upsertMessageProjection(normalizedSessionId, {
      id: projectionId,
      messageId: normalizedMessageId,
      attemptId,
      status,
      messageKind: sourceMessage.messageKind,
      speakerId: normalized.speakerId || sourceMessage.speakerId,
      speakerName: normalized.speakerName || sourceMessage.speakerName,
      audienceIds: normalized.audienceIds,
      audienceNames: normalized.audienceNames,
      participants: normalized.participants,
      objectiveFact: normalized.objectiveFact,
      fallbackCleanText: normalized.fallbackCleanText || cleanText,
      startEnv: normalized.startEnv || sourceMessage.env,
      endEnv: normalized.endEnv || sourceMessage.env,
      changed: normalized.changed || { time: false, location: false },
      sourceProjectionIds: normalized.sourceProjectionIds?.length ? normalized.sourceProjectionIds : previousProjectionIds,
      failureStage: status === 'failed' ? (failureStage || normalized.failureStage) : normalized.failureStage,
      failureReason: status === 'failed' ? (failureReason || normalized.failureReason || '内嵌消息投影解析失败') : normalized.failureReason,
      completedAt: new Date().toISOString()
    })
    applyProjectionEndEnvToCurtain(normalizedSessionId, normalized)
    // 失败兜底：投影解析失败（status==='failed'）时也写可见性行——只要有可用文本（成功事实或失败兜底 fallbackCleanText）。
    // 否则旁白/消息内嵌投影一旦解析失败就没有任何可见性行，读侧 listVisibleMessageProjectionsForCharacter 永远读不到，
    // 这条消息会对之后所有轮次的人格模型上下文永久隐身（数据缺失）；失败时读侧按 status==='failed' 回退 fallbackCleanText 承接原文。
    const projectionHasUsableText = Boolean(
      toText(normalized.objectiveFact) || toText(normalized.fallbackCleanText) || cleanText
    )
    if (projectionHasUsableText && typeof chatRepository.upsertMessageProjectionVisibility === 'function') {
      participants.forEach((participant) => {
        chatRepository.upsertMessageProjectionVisibility(normalizedSessionId, {
          projectionId,
          messageId: normalizedMessageId,
          characterId: participant.id,
          visibility: 'visible',
          reason: status === 'failed' ? 'system_failed_fallback' : 'system'
        })
      })
    }
    persistChatMutation()
    return { ok: true as const, data: { projection, promptLogId: '', rawOutput, embedded: true, error: status === 'failed' ? (failureReason || normalized.failureReason) : '' } }
  }

  function normalizePersonalityRecallSections(value: unknown): PersonalityRecallSections | null {
    const record = parseJsonObject(value)
    if (!Object.keys(record).length) return null
    return {
      profile: toText(record.profile),
      general: toText(record.general),
      arrangement: toText(record.arrangement),
      expression: toText(record.expression)
    }
  }

  function normalizePersonalityPlans(value: unknown): PersonalityPlanCandidate[] {
    const rows = Array.isArray(value) ? value : parseJsonArray(value)
    return rows
      .map((row: unknown) => row && typeof row === 'object' ? row as Record<string, unknown> : null)
      .filter((row): row is Record<string, unknown> => Boolean(row))
      .map((row) => ({
        id: toText(row.id),
        content: toText(row.content),
        score: Number.isFinite(Number(row.score)) ? Number(row.score) : undefined
      }))
  }

  function normalizeNumericIdList(value: unknown): number[] {
    return (Array.isArray(value) ? value : parseJsonArray(value))
      .map((item) => Number(item || 0))
      .filter((id) => Number.isInteger(id) && id > 0)
      .filter((id, index, list) => list.indexOf(id) === index)
  }

  function resolveCharacterNameById(characterId: string): string {
    const rows = typeof characterRepository?.getCharacters === 'function'
      ? characterRepository.getCharacters()
      : []
    const matched = (Array.isArray(rows) ? rows : []).find((row: Record<string, unknown>) => toText(row.id) === characterId)
    return toText(matched?.name) || characterId
  }

  function buildFallbackPersonalityProjectionFromMessage(
    message: Record<string, any> | null | undefined,
    characterName: string,
    userName: string
  ): Record<string, unknown> | null {
    if (!message) return null
    const item = toCamel(message) as Record<string, any>
    const messageId = Number(item.id ?? message.id ?? 0) || 0
    const role = toText(item.role ?? message.role)
    // 用户消息按 role 剥离私密指令【【…】】：这里的 content 会作兜底投影直接喂角色，带指令=泄漏。
    const content = cleanMessageProjectionSourceText(toText(item.content ?? message.content), { isUserMessage: role === 'user' })
    if (!messageId || !content) return null
    const speakerName = toText(item.memberName ?? item.member_name ?? item.name ?? message.member_name ?? message.name)
      || (role === 'user' ? (userName || '用户') : '旁白')
    const env = {
      time: toText(item.time ?? message.time),
      weather: toText(item.envWeather ?? item.env_weather ?? message.env_weather),
      location: toText(item.envLocation ?? item.env_location ?? message.env_location)
    }
    return {
      id: `fallback_message_${messageId}`,
      messageId,
      status: 'partial',
      messageKind: toText(item.messageKind ?? item.message_kind ?? message.message_kind) || 'chat',
      speakerName,
      audienceNames: characterName ? [characterName] : [],
      objectiveFact: content,
      fallbackCleanText: content,
      startEnv: env,
      endEnv: env,
      changed: { time: false, location: false },
      createdAt: toText(item.createdAt ?? item.created_at ?? message.created_at)
    }
  }

  function buildPersonalityModelContextForSession(sessionId: string, payload: Record<string, any> = {}) {
    const normalizedSessionId = toText(sessionId)
    const characterId = toText(payload.characterId ?? payload.character_id)
    if (!normalizedSessionId) return { ok: false as const, status: 400, error: '会话不能为空' }
    const contextSession = chatRepository.getSessionById(normalizedSessionId)
    if (!contextSession) {
      return { ok: false as const, status: 404, error: '会话不存在' }
    }
    if (!characterId) {
      return { ok: false as const, status: 400, error: '人格模型上下文必须指定当前回复角色' }
    }
    const projections = typeof chatRepository.listVisibleMessageProjectionsForCharacter === 'function'
      ? chatRepository.listVisibleMessageProjectionsForCharacter(normalizedSessionId, characterId)
      : []
    const excludedMessageIds = new Set(normalizeNumericIdList(payload.excludedMessageIds ?? payload.excluded_message_ids))
    const visibleProjections = (Array.isArray(projections) ? projections : [])
      .filter((row: Record<string, any>) => !excludedMessageIds.has(Number(row.messageId ?? row.message_id ?? 0) || 0))
    const characterName = toText(payload.characterName ?? payload.character_name) || resolveCharacterNameById(characterId)
    const userName = toText(payload.userName ?? payload.user_name)
    const projectionMessageIds = new Set(visibleProjections
      .map((row: Record<string, any>) => Number(row.messageId ?? row.message_id ?? 0) || 0)
      .filter((id: number) => id > 0))
    const fallbackProjections = normalizeNumericIdList(payload.fallbackMessageIds ?? payload.fallback_message_ids)
      .filter((messageId) => !projectionMessageIds.has(messageId))
      .filter((messageId) => !excludedMessageIds.has(messageId))
      .map((messageId) => typeof chatRepository.findMessageByIdInSession === 'function'
        ? chatRepository.findMessageByIdInSession(normalizedSessionId, messageId)
        : null)
      .map((message) => buildFallbackPersonalityProjectionFromMessage(message, characterName, userName))
      .filter(Boolean)
    const contextProjections = [...visibleProjections, ...fallbackProjections]
    const bundle = buildPersonalityModelContextBundle({
      sessionId: normalizedSessionId,
      characterId,
      characterName,
      characterIdentity: toText(payload.characterIdentity ?? payload.character_identity),
      candidatePlanSystemPromptPrefix: toText(payload.candidatePlanSystemPromptPrefix ?? payload.candidate_plan_system_prompt_prefix),
      promptLibrarySystemPrompt: toText(payload.promptLibrarySystemPrompt ?? payload.prompt_library_system_prompt),
      scenarioMountedPromptText: toText(payload.scenarioMountedPromptText ?? payload.scenario_mounted_prompt_text),
      currentUserInput: toText(payload.currentUserInput ?? payload.current_user_input),
      userName,
      projections: contextProjections,
      recallSections: normalizePersonalityRecallSections(payload.recallSections ?? payload.recall_sections),
      sceneChangeNotice: toText(payload.sceneChangeNotice ?? payload.scene_change_notice),
      // 批次4：滚动会话记忆摘要从会话 context_summary 列读出注入；payload 显式传入优先（测试/特殊链路）。
      sessionMemorySummary: toText(payload.sessionMemorySummary ?? payload.session_memory_summary ?? (contextSession as Record<string, any>).context_summary ?? (contextSession as Record<string, any>).contextSummary),
      compressedContext: toText(payload.compressedContext ?? payload.compressed_context),
      candidatePlans: normalizePersonalityPlans(payload.candidatePlans ?? payload.candidate_plans),
      topPlans: normalizePersonalityPlans(payload.topPlans ?? payload.top_plans),
      expressionMix: parseJsonObject(payload.expressionMix ?? payload.expression_mix)
    })
    return { ok: true as const, data: bundle }
  }

  function listProjectionFirstVisibleProjections(sessionId: string, characterId: string) {
    const allProjections = typeof chatRepository.listMessageProjectionsBySessionId === 'function'
      ? chatRepository.listMessageProjectionsBySessionId(sessionId)
      : []
    const visibility = typeof chatRepository.listMessageProjectionVisibilityBySessionId === 'function'
      ? chatRepository.listMessageProjectionVisibilityBySessionId(sessionId)
      : []
    if (Array.isArray(allProjections) && allProjections.length && Array.isArray(visibility) && visibility.length) {
      const visibleProjectionIds = new Set(
        visibility
          .filter((row: Record<string, any>) => toText(row.characterId ?? row.character_id) === characterId)
          .filter((row: Record<string, any>) => toText(row.visibility) === 'visible')
          .map((row: Record<string, any>) => toText(row.projectionId ?? row.projection_id))
          .filter(Boolean)
      )
      return allProjections.filter((row: Record<string, any>) => visibleProjectionIds.has(toText(row.id)))
    }
    return typeof chatRepository.listVisibleMessageProjectionsForCharacter === 'function'
      ? chatRepository.listVisibleMessageProjectionsForCharacter(sessionId, characterId)
      : []
  }

  function buildProjectionFirstMessageViewForSession(sessionId: string, payload: Record<string, any> = {}) {
    const normalizedSessionId = toText(sessionId)
    const characterId = toText(payload.characterId ?? payload.character_id)
    if (!normalizedSessionId) return { ok: false as const, status: 400, error: '会话不能为空' }
    if (!chatRepository.getSessionById(normalizedSessionId)) {
      return { ok: false as const, status: 404, error: '会话不存在' }
    }
    if (!characterId) {
      return { ok: false as const, status: 400, error: '投影优先消息视图必须指定当前回复角色' }
    }
    const messages = typeof chatRepository.getMessagesBySessionIdOrdered === 'function'
      ? chatRepository.getMessagesBySessionIdOrdered(normalizedSessionId)
      : typeof chatRepository.getDisplayMessagesBySessionId === 'function'
        ? chatRepository.getDisplayMessagesBySessionId(normalizedSessionId)
        : typeof chatRepository.getMessagesBySessionId === 'function'
          ? chatRepository.getMessagesBySessionId(normalizedSessionId)
          : []
    const projections = listProjectionFirstVisibleProjections(normalizedSessionId, characterId)
    const result = buildProjectionFirstMessageView({
      sessionId: normalizedSessionId,
      characterId,
      messages: Array.isArray(messages) ? messages : [],
      projections: Array.isArray(projections) ? projections : [],
      windowSize: Number(payload.windowSize ?? payload.window_size ?? 23) || 23,
      currentMessageIds: normalizeNumericIdList(payload.currentMessageIds ?? payload.current_message_ids),
      requestedAt: toText(payload.requestedAt ?? payload.requested_at)
    })
    return { ok: true as const, data: result }
  }

  function buildPersonalityModelObservationsForSession(sessionId: string, options: WorkspaceRequestOptions = {}) {
    const normalizedSessionId = toText(sessionId)
    if (!normalizedSessionId) return { ok: false as const, status: 400, error: '会话不能为空' }
    if (!chatRepository.getSessionById(normalizedSessionId)) {
      return { ok: false as const, status: 404, error: '会话不存在' }
    }
    const projections = typeof chatRepository.listMessageProjectionsBySessionId === 'function'
      ? chatRepository.listMessageProjectionsBySessionId(normalizedSessionId)
      : []
    const visibility = typeof chatRepository.listMessageProjectionVisibilityBySessionId === 'function'
      ? chatRepository.listMessageProjectionVisibilityBySessionId(normalizedSessionId)
      : []
    const attempts = typeof chatRepository.listGenerationAttemptsBySessionId === 'function'
      ? chatRepository.listGenerationAttemptsBySessionId(normalizedSessionId, 200)
      : []
    const artifacts = typeof chatRepository.listGenerationAttemptArtifactsBySessionId === 'function'
      ? chatRepository.listGenerationAttemptArtifactsBySessionId(normalizedSessionId, 200)
      : []
    const liveMessages = typeof chatRepository.getMessagesBySessionIdOrdered === 'function'
      ? chatRepository.getMessagesBySessionIdOrdered(normalizedSessionId)
      : typeof chatRepository.getMessagesBySessionId === 'function'
        ? chatRepository.getMessagesBySessionId(normalizedSessionId)
        : []
    const liveMessageIds = new Set((Array.isArray(liveMessages) ? liveMessages : [])
      .map((row: Record<string, any>) => Number(row.id || 0))
      .filter((id) => Number.isInteger(id) && id > 0))
    const attemptItems = attempts.map((row: Record<string, any>) => toGenerationAttemptEntry(row)).filter(Boolean)
    const replacedMessageIds = new Set<number>()
    for (const attempt of attemptItems) {
      if (toText((attempt as Record<string, any>).status) !== 'completed') continue
      const ids = Array.isArray((attempt as Record<string, any>).replacedMessageIds)
        ? (attempt as Record<string, any>).replacedMessageIds
        : []
      ids.forEach((id: unknown) => {
        const messageId = Number(id || 0)
        if (Number.isInteger(messageId) && messageId > 0) replacedMessageIds.add(messageId)
      })
    }
    const projectionItems = projections
      .map((row: Record<string, any>) => toMessageProjectionObservationEntry(row))
      .filter(Boolean)
    const artifactItems = artifacts
      .map((row: Record<string, any>) => toGenerationAttemptArtifactEntry(row))
      .filter(Boolean)
    const traceItems = artifactItems
      // 过程轨真值放行三类 kind：personality_model_trace（人格模型专属，保留 ReRanker 诊断门禁，
      // 防止旧 LLM 评分 / 兜底分冒充真实 ReRanker）；reply_workflow_trace（通用回复工作流，
      // 无 ReRanker 阶段，只要求带可展示的 processSummary.steps）；clean_retry（提调决策流快照
      // tidiao_stream_* / 重生成 O-B2 接续带——纠偏/精修/重试的决策流只落在这类 artifact，
      // 不放行则刷新后纠偏轮提调带整段消失，只剩统筹侧 trace）。
      .filter((item: Record<string, any>) => {
        const kind = toText(item.artifactKind ?? item.artifact_kind)
        return kind === 'personality_model_trace' || kind === 'reply_workflow_trace' || kind === 'clean_retry'
      })
      .filter((item: Record<string, any>) => {
        const kind = toText(item.artifactKind ?? item.artifact_kind)
        const payload = parseJsonObject(item.payload)
        if (kind === 'reply_workflow_trace') return hasReplyWorkflowProcessSummary(payload)
        // clean_retry 只放行带决策流快照的：demote 降权空壳（processSummary 只剩 steps:{}）
        // 与旧版本记录（只存 versionIndex）不下发。
        if (kind === 'clean_retry') return hasDirectorStreamProcessSummary(payload)
        return hasPersonalityRerankerDiagnostics(payload)
          || hasDirectPersonalityRerankerDiagnostics(payload)
          || hasPersonalityOrchestrationFailure(payload)
      })
      .filter((item: Record<string, any>) => {
        const payload = parseJsonObject(item.payload)
        const messageId = Number(item.messageId ?? item.message_id ?? payload.messageId ?? payload.message_id ?? 0) || 0
        if (!messageId) return true
        return liveMessageIds.has(messageId) && !replacedMessageIds.has(messageId)
      })
    const visibilityItems = visibility.map((row: Record<string, any>) => {
      const item = toCamel(row) as Record<string, any>
      const characterId = toText(item.characterId ?? row.character_id)
      return {
        ...item,
        characterId,
        characterName: characterId ? resolveCharacterNameById(characterId) : ''
      }
    })
    return {
      ok: true as const,
      data: {
        sessionId: normalizedSessionId,
        projections: projectionItems,
        visibility: visibilityItems,
        attempts: attemptItems,
        traces: traceItems
      }
    }
  }

  function hasPersonalityRerankerDiagnostics(payload: Record<string, any>): boolean {
    const diagnostics = payload.rerankerDiagnostics ?? payload.reranker_diagnostics
    if (!diagnostics || typeof diagnostics !== 'object' || Array.isArray(diagnostics)) return false
    const candidateCount = Number(diagnostics.candidateCount ?? diagnostics.candidate_count)
    const distinctEncodedInputCount = Number(diagnostics.distinctEncodedInputCount ?? diagnostics.distinct_encoded_input_count)
    const uniqueScoreCount = Number(diagnostics.uniqueScoreCount ?? diagnostics.unique_score_count)
    return Number.isFinite(candidateCount)
      && candidateCount > 0
      && Number.isFinite(distinctEncodedInputCount)
      && distinctEncodedInputCount > 1
      && Number.isFinite(uniqueScoreCount)
      && uniqueScoreCount > 1
  }

  function hasDirectPersonalityRerankerDiagnostics(payload: Record<string, any>): boolean {
    const diagnostics = payload.rerankerDiagnostics ?? payload.reranker_diagnostics
    if (!diagnostics || typeof diagnostics !== 'object' || Array.isArray(diagnostics)) return false
    const record = diagnostics as Record<string, any>
    if (toText(record.executionPolicy ?? record.execution_policy) !== 'reuse_direct_personality_rerank') return false
    const candidates = Array.isArray(payload.candidatePlans ?? payload.candidate_plans)
      ? (payload.candidatePlans ?? payload.candidate_plans)
      : []
    const selected = Array.isArray(payload.topPlans ?? payload.top_plans)
      ? (payload.topPlans ?? payload.top_plans)
      : []
    const selectedPlanId = toText(record.selectedPlanId ?? record.selected_plan_id)
    if (candidates.length < 2 || selected.length !== 1 || !selectedPlanId) return false
    const selectedId = toText(selected[0]?.id)
    if (!selectedId || selectedId !== selectedPlanId) return false
    if (record.degraded === true) return Boolean(toText(record.reason))
    return candidates.every((candidate: Record<string, any>) => Number.isFinite(Number(candidate?.score)))
  }

  function hasReplyWorkflowProcessSummary(payload: Record<string, any>): boolean {
    const summary = payload.processSummary ?? payload.process_summary
    if (!summary || typeof summary !== 'object' || Array.isArray(summary)) return false
    const steps = (summary as Record<string, any>).steps
    return Boolean(steps && typeof steps === 'object' && !Array.isArray(steps) && Object.keys(steps).length)
  }

  // clean_retry 的放行门禁：processSummary.directorStream 带非空 decisions 才算有效提调决策流快照
  //（persistDirectorStreamRoundIncremental 只在 decisions 非空时落库；demote 空壳/旧 versionIndex 记录均不满足）。
  function hasDirectorStreamProcessSummary(payload: Record<string, any>): boolean {
    const summary = payload.processSummary ?? payload.process_summary
    if (!summary || typeof summary !== 'object' || Array.isArray(summary)) return false
    const stream = (summary as Record<string, any>).directorStream ?? (summary as Record<string, any>).director_stream
    if (!stream || typeof stream !== 'object' || Array.isArray(stream)) return false
    const decisions = (stream as Record<string, any>).decisions
    return Array.isArray(decisions) && decisions.length > 0
  }

  function hasPersonalityOrchestrationFailure(payload: Record<string, any>): boolean {
    const orchestration = payload.orchestration
    if (!orchestration || typeof orchestration !== 'object' || Array.isArray(orchestration)) return false
    const state = toText((orchestration as Record<string, any>).state || payload.state)
    const failure = (orchestration as Record<string, any>).failure
    return state === 'failed'
      && Boolean(failure && typeof failure === 'object' && !Array.isArray(failure))
  }

  const PROJECTION_WRITEBACK_AUTO_THRESHOLD = 23
  // 单批处理量从 20 收到 12：一次拆分的投影越多、输出越长，越容易撞 maxTokens 截断导致 JSON 解析失败。
  // 配合下面拆分自动缩小重试，从源头压低单次输出长度。
  const PROJECTION_WRITEBACK_AUTO_WINDOW = 12
  const PROJECTION_WRITEBACK_BUFFER = 3
  // 拆分 Agent 输出上限：原 1800 对十几条长事实明显不够，输出被截断成半截 JSON 必然解析失败。给足空间减少触发缩小重试。
  const PROJECTION_WRITEBACK_SPLIT_MAX_TOKENS = 3500

  function buildProjectionWritebackRunId(sessionId: string, characterId: string) {
    return `projection_writeback_${sessionId}_${characterId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  }

  function readProjectionText(projection: Record<string, any>): string {
    return toText(projection.objectiveFact ?? projection.objective_fact)
      || toText(projection.fallbackCleanText ?? projection.fallback_clean_text)
  }

  function readProjectionEnvLine(projection: Record<string, any>, key: 'time' | 'location'): string {
    const env = parseJsonObject(projection.endEnv ?? projection.endEnvJson ?? projection.end_env_json)
    if (key === 'time') return toText(env.time)
    return [
      env.locationLarge,
      env.locationMiddle,
      env.locationSmall
    ].map(toText).filter(Boolean).join(' / ') || toText(env.location)
  }

  function readCharacterAliasNames(character: Record<string, any>): string[] {
    const names = [toText(character.name)]
    const nicknames = parseJsonArray(character.nicknames ?? character.nicknamesJson ?? character.nicknames_json)
      .map(toText)
      .filter(Boolean)
    return [...new Set([...names, ...nicknames].filter(Boolean))]
  }

  function projectionMentionsCharacter(projection: Record<string, any>, characterNames: string[]): boolean {
    const haystack = [
      readProjectionText(projection),
      projection.speakerName,
      projection.speaker_name,
      projection.audienceNames,
      projection.audience_names_json,
      projection.participants,
      projection.participants_json
    ].map((item) => typeof item === 'string' ? item : JSON.stringify(item ?? '')).join('\n')
    return characterNames.some((name) => name && haystack.includes(name))
  }

  function normalizeProjectionWritebackSources(projections: Array<Record<string, any>>): ProjectionWritebackSource[] {
    return projections.map((projection) => ({
      id: toText(projection.id),
      messageId: Number(projection.messageId ?? projection.message_id ?? 0) || 0,
      text: readProjectionText(projection),
      time: readProjectionEnvLine(projection, 'time'),
      location: readProjectionEnvLine(projection, 'location')
    })).filter((item) => item.id && item.text)
  }

  function selectProjectionWritebackWindow(sessionId: string, characterId: string, runKind: string) {
    const visible = typeof chatRepository.listVisibleMessageProjectionsForCharacter === 'function'
      ? chatRepository.listVisibleMessageProjectionsForCharacter(sessionId, characterId)
      : []
    const rows = (Array.isArray(visible) ? visible : [])
      .filter((projection: Record<string, any>) => readProjectionText(projection))
    if (runKind === 'manual') {
      if (rows.length <= PROJECTION_WRITEBACK_BUFFER) return { rows: [], visibleCount: rows.length }
      return {
        rows: rows.slice(0, Math.max(0, rows.length - PROJECTION_WRITEBACK_BUFFER)),
        visibleCount: rows.length
      }
    }
    if (rows.length < PROJECTION_WRITEBACK_AUTO_THRESHOLD) return { rows: [], visibleCount: rows.length }
    return {
      rows: rows.slice(0, PROJECTION_WRITEBACK_AUTO_WINDOW),
      visibleCount: rows.length
    }
  }

  function insertProjectionWritebackPromptLog(sessionId: string, trace: ProjectionWritebackPromptTrace, output: string, status = 'complete', reason = '') {
    if (typeof chatRepository.countPromptLogsBySessionId !== 'function' || typeof chatRepository.insertPromptLog !== 'function') return ''
    const total = chatRepository.countPromptLogsBySessionId(sessionId)
    const logId = buildPromptLogId()
    chatRepository.insertPromptLog(sessionId, {
      id: logId,
      pageIndex: Math.floor(total / 30) + 1,
      entryIndex: (total % 30) + 1,
      assistantMessageId: 0,
      speakerName: '投影写轨迹',
      targetId: '',
      finalPrompt: trace.finalPrompt,
      promptBlocksJson: JSON.stringify([
        ...trace.promptBlocks,
        {
          role: 'assistant',
          title: `投影写轨迹 · 模型输出（${status}${reason ? `：${reason}` : ''}）`,
          content: output || '空输出'
        }
      ]),
      logKind: 'internal_agent',
      createdAt: new Date().toISOString()
    })
    return logId
  }

  async function callProjectionWritebackAgent(sessionId: string, trace: ProjectionWritebackPromptTrace, options: WorkspaceRequestOptions = {}, maxTokens = 1600) {
    if (!deps.aiService?.callAIWithFallback) {
      return { ok: false as const, error: 'AI 服务未配置', rawOutput: '', promptLogId: '' }
    }
    const aiOptions = buildAgentSlotAiCallOptions('projectionWriteback', { maxTokens, thinking: 'disabled', temperature: 0.2 })
    const result = await callInternalAIJson(
      deps.aiService,
      aiOptions.presetName,
      aiOptions.model,
      trace.messages,
      deps.logger,
      {
        userId: options.userId || '',
        role: 'local',
        feature: 'agent',
        modelUsageSlotId: aiOptions.modelUsageSlotId,
        ...buildAgentUsageContext(sessionId, '投影写轨迹', 'projection_writeback'),
        maxTokens: aiOptions.maxTokens,
        temperature: aiOptions.temperature,
        thinking: aiOptions.thinking
      }
    )
    if (result.error) {
      const promptLogId = insertProjectionWritebackPromptLog(sessionId, trace, '', 'failed', result.error)
      return { ok: false as const, error: `模型调用失败：${result.error}`, rawOutput: '', promptLogId }
    }
    if (result.jsonParseError) {
      const promptLogId = insertProjectionWritebackPromptLog(sessionId, trace, '', 'failed', result.jsonParseError)
      return { ok: false as const, error: `模型响应解析失败：${result.jsonParseError}`, rawOutput: '', promptLogId }
    }
    if (!result.json) {
      const promptLogId = insertProjectionWritebackPromptLog(sessionId, trace, '', 'failed', '模型没有返回响应')
      return { ok: false as const, error: '模型没有返回响应', rawOutput: '', promptLogId }
    }
    const rawOutput = extractAiMessageContent(result.json)
    const promptLogId = insertProjectionWritebackPromptLog(sessionId, trace, rawOutput, 'complete')
    return { ok: true as const, rawOutput, promptLogId }
  }

  function normalizeServerCharacter(row: Record<string, any>): Character {
    return {
      ...row,
      id: toText(row.id),
      name: toText(row.name),
      brainTraceNodes: typeof row.brainTraceNodes === 'string'
        ? row.brainTraceNodes
        : jsonColumnText(row.brainTraceNodes ?? row.brain_trace_nodes, []),
      brain_trace_nodes: jsonColumnText(row.brainTraceNodes ?? row.brain_trace_nodes, []),
      brainTrajectoryMeta: typeof row.brainTrajectoryMeta === 'string'
        ? row.brainTrajectoryMeta
        : jsonColumnText(row.brainTrajectoryMeta ?? row.brain_trajectory_meta, {}),
      brain_trajectory_meta: jsonColumnText(row.brainTrajectoryMeta ?? row.brain_trajectory_meta, {})
    } as Character
  }

  function applyCharacterTraceChanges(sessionId: string, characterId: string, changes: Record<string, unknown>) {
    const resolved = resolveSessionCharacterState(sessionId, characterId)
    if (resolved.mode === 'independent_snapshot') {
      characterSnapshotService.patchSessionCharacterBranch(characterId, resolved.branchId, changes)
      return true
    }
    const brainTraceNodes = changes.brainTraceNodes ?? changes.brain_trace_nodes
    const brainTrajectoryMeta = changes.brainTrajectoryMeta ?? changes.brain_trajectory_meta
    if (typeof characterRepository.patchCharacterBrainTrace === 'function') {
      characterRepository.patchCharacterBrainTrace(characterId, { brainTraceNodes, brainTrajectoryMeta })
      return true
    }
    return false
  }

  // 关系画像沉淀落库：把灵魂(认知节点)变更写入角色，与轨迹变更并行、互不影响
  function applyCharacterCognitionChanges(sessionId: string, characterId: string, changes: Record<string, unknown>) {
    const brainCognitionNodes = changes.brainCognitionNodes ?? changes.brain_cognition_nodes
    const brainDocuments = changes.brainDocuments ?? changes.brain_documents
    if (brainCognitionNodes === undefined && brainDocuments === undefined) return false
    const resolved = resolveSessionCharacterState(sessionId, characterId)
    if (resolved.mode === 'independent_snapshot') {
      characterSnapshotService.patchSessionCharacterBranch(characterId, resolved.branchId, changes)
      return true
    }
    if (typeof characterRepository.patchCharacterBrainCognition === 'function') {
      characterRepository.patchCharacterBrainCognition(characterId, { brainCognitionNodes, brainDocuments })
      return true
    }
    return false
  }

  function resolveTodayTraceDay(character: Character, now: string) {
    const today = now.slice(0, 10)
    const nodes = readCharacterBrainTraceNodes(character)
    const existing = nodes.find((node) => (
      node.kind === 'day'
      && node.granularity === 'day'
      && node.nodeType === 'single'
      && node.systemRole !== 'eventLeaf'
      && node.systemRole !== 'arrangementLeaf'
      && (node.pointDate || node.startDate) === today
    ))
    if (existing) return { ok: true as const, character, dayNodeId: existing.id }
    const createResult = createNextCharacterBrainTraceDayTreeNode(character, {
      targetDate: today,
      subtitle: '对话整理',
      summary: '由人格模型投影写入的当天事件。',
      content: '',
      now
    })
    if (!createResult.ok) return { ok: false as const, message: createResult.message }
    const nextCharacter = {
      ...character,
      ...createResult.changes
    } as Character
    return { ok: true as const, character: nextCharacter, dayNodeId: createResult.createdNodeId, changes: createResult.changes }
  }

  function collectTodayEventCandidates(character: Character, dayNodeId: string): ProjectionWritebackMatchCandidate[] {
    return readCharacterBrainTraceNodes(character)
      .filter((node) => node.systemRole === 'eventLeaf' && node.parentId === dayNodeId)
      .map((node) => ({
        targetId: toText(node.id),
        title: toText(node.title || node.displayTitle),
        summary: toText(node.summary || node.note),
        content: toText(node.content),
        score: 0
      }))
  }

  async function resolveProjectionEventTarget(input: {
    sessionId: string
    event: ProjectionWritebackEvent
    candidates: ProjectionWritebackMatchCandidate[]
    options: WorkspaceRequestOptions
  }) {
    if (!input.candidates.length) return { ok: true as const, targetId: 'new', reason: '没有已有事件' }
    const eventText = `${input.event.title}\n${input.event.summary}\n${input.event.content}`
    const scored = input.candidates
      .map((candidate) => ({
        ...candidate,
        score: scoreProjectionWritebackTextSimilarity(eventText, `${candidate.title}\n${candidate.summary}\n${candidate.content}`)
      }))
      .sort((a, b) => b.score - a.score)
    const first = scored[0]
    const second = scored[1]
    const close = first && second && Math.abs(first.score - second.score) < 0.03
    if (first && first.score >= 0.78 && !close) {
      return { ok: true as const, targetId: first.targetId, reason: `文本相似度 ${first.score}` }
    }
    if (!first || first.score < 0.68) {
      return { ok: true as const, targetId: 'new', reason: first ? `文本相似度 ${first.score}` : '没有候选' }
    }
    const trace = buildProjectionWritebackMatchPrompt({
      event: input.event,
      candidates: scored.slice(0, 3)
    })
    const response = await callProjectionWritebackAgent(input.sessionId, trace, input.options, 600)
    if (!response.ok) return { ok: false as const, reason: response.error, promptLogId: response.promptLogId }
    try {
      const decision = normalizeProjectionWritebackMatchOutput(response.rawOutput, scored.slice(0, 3).map((item) => item.targetId))
      return { ok: true as const, targetId: decision.targetId, reason: decision.reason, promptLogId: response.promptLogId }
    } catch (error) {
      return { ok: false as const, reason: (error as Error).message, promptLogId: response.promptLogId }
    }
  }

  async function writeProjectionEventToTrace(input: {
    sessionId: string
    character: Character
    characterName: string
    dayNodeId: string
    event: ProjectionWritebackEvent
    options: WorkspaceRequestOptions
    now: string
  }) {
    const candidates = collectTodayEventCandidates(input.character, input.dayNodeId)
    const target = await resolveProjectionEventTarget({
      sessionId: input.sessionId,
      event: input.event,
      candidates,
      options: input.options
    })
    if (!target.ok) {
      return { ok: false as const, reason: target.reason || '事件匹配失败', character: input.character }
    }
    if (target.targetId === 'new') {
      const nodeId = `projection_event_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
      const changes = createCharacterBrainTraceEventTreeNode(input.character, {
        id: nodeId,
        parentId: input.dayNodeId,
        title: input.event.title,
        summary: input.event.summary,
        content: input.event.content,
        tags: ['人格模型投影'],
        now: input.now
      })
      return {
        ok: true as const,
        eventNodeId: nodeId,
        changes,
        character: { ...input.character, ...changes } as Character,
        targetReason: target.reason
      }
    }
    const nodes = readCharacterBrainTraceNodes(input.character)
    const existing = nodes.find((node) => node.id === target.targetId)
    if (!existing) return { ok: false as const, reason: '匹配事件不存在', character: input.character }
    const trace = buildProjectionWritebackMergePrompt({
      characterName: input.characterName,
      event: input.event,
      target: existing
    })
    const response = await callProjectionWritebackAgent(input.sessionId, trace, input.options, 1400)
    if (!response.ok) return { ok: false as const, reason: response.error, character: input.character }
    let merged: Pick<ProjectionWritebackEvent, 'title' | 'summary' | 'content'>
    try {
      merged = normalizeProjectionWritebackMergeOutput(response.rawOutput, input.event)
    } catch (error) {
      return { ok: false as const, reason: (error as Error).message, character: input.character }
    }
    const nextNodes = nodes.map((node) => node.id === existing.id
      ? {
          ...node,
          title: merged.title,
          displayTitle: merged.title,
          summary: merged.summary,
          note: merged.summary,
          content: merged.content,
          updatedAt: input.now
        } as CharacterBrainTraceNode
      : node)
    const changes = {
      brainTraceNodes: nextNodes,
      brain_trace_nodes: JSON.stringify(nextNodes)
    }
    return {
      ok: true as const,
      eventNodeId: existing.id,
      changes,
      character: { ...input.character, ...changes } as Character,
      targetReason: target.reason
    }
  }

  // 关系画像沉淀（R2/R3）：从消息投影提炼"角色对用户/对会话内其他角色"的稳定关系认知，独立于投影→轨迹并行。
  // 只读投影窗口、不改 visibility（visibility 仍由投影→轨迹独占管理）；产出"待确认"关系认知节点，用户确认后才正式生效。
  const RELATION_SUBJECT_USER_ID = 'user'

  type RelationSubject = { subjectType: 'user' | 'character'; subjectId: string; subjectName: string }

  function findRelationNode(character: Character, subjectType: 'user' | 'character', subjectId: string) {
    return readCharacterBrainCognitionNodes(character).find((node) => (
      node.kind === 'relation' && node.subjectType === subjectType && node.subjectId === subjectId
    ))
  }

  // 关系认知对象列表：用户 + 会话内其他在场角色（按名字解析），当前角色自身排除
  function buildRelationProfileSubjects(sessionId: string, currentCharacterId: string, userName: string): RelationSubject[] {
    const subjects: RelationSubject[] = [{ subjectType: 'user', subjectId: RELATION_SUBJECT_USER_ID, subjectName: userName }]
    const participants = typeof chatRepository.listSessionParticipants === 'function'
      ? chatRepository.listSessionParticipants(sessionId)
      : []
    const seen = new Set<string>()
    for (const participant of (Array.isArray(participants) ? participants : [])) {
      const record = participant as Record<string, any>
      const targetId = toText(record.participantTargetId ?? record.participant_target_id)
      const type = toText(record.participantType ?? record.participant_type)
      if (type !== 'char' || !targetId || targetId === currentCharacterId || seen.has(targetId)) continue
      const row = typeof characterRepository.getCharacterById === 'function' ? characterRepository.getCharacterById(targetId) : null
      const name = row ? (readCharacterAliasNames(row)[0] || '') : ''
      if (!name) continue
      seen.add(targetId)
      subjects.push({ subjectType: 'character', subjectId: targetId, subjectName: name })
    }
    return subjects
  }

  // 提炼并沉淀"当前角色对单个 subject"的关系画像；返回累积后的 character（供下一 subject 基于含本次新节点的状态继续，避免互相覆盖）
  async function processRelationProfileSubject(input: {
    sessionId: string
    characterId: string
    characterName: string
    character: Character
    subject: RelationSubject
    sources: RelationProfileSource[]
    options: WorkspaceRequestOptions
  }): Promise<{ character: Character; result: Record<string, unknown> }> {
    const { sessionId, characterId, characterName, character, subject, sources, options } = input
    const existingNode = findRelationNode(character, subject.subjectType, subject.subjectId)
    const existingProfile = existingNode ? parseRelationProfileContent(existingNode.content) : null
    const trace = buildRelationProfileExtractPrompt({ characterName, subjectName: subject.subjectName, existingProfile, sources })
    const response = await callProjectionWritebackAgent(sessionId, trace, options, 1200)
    const baseResult = { subjectType: subject.subjectType, subjectId: subject.subjectId, subjectName: subject.subjectName }
    if (!response.ok) return { character, result: { ...baseResult, status: 'failed', reason: response.error } }
    let extract
    try {
      extract = normalizeRelationProfileExtractOutput(response.rawOutput)
    } catch (error) {
      return { character, result: { ...baseResult, status: 'failed', reason: `解析失败：${(error as Error).message}` } }
    }
    if (!extract.explicit.length && !extract.implicit.length) {
      return { character, result: { ...baseResult, status: 'skipped', reason: '无可沉淀的稳定认知' } }
    }
    const now = new Date().toISOString()
    const merged = mergeRelationProfileContent(existingProfile, extract, now)
    const sharedContent = {
      title: existingNode?.title || `对${subject.subjectName}的认知`,
      summary: buildRelationProfileSummary(subject.subjectName, merged),
      content: JSON.stringify(merged),
      subjectType: subject.subjectType,
      subjectId: subject.subjectId
    }
    const outcome: CharacterBrainWriteBackOutcome = existingNode
      ? { kind: 'pending_version', target: 'soul', targetUnitId: existingNode.id, content: sharedContent }
      : { kind: 'pending_unit', target: 'soul', targetParentId: 'brain:cognition', content: sharedContent }
    const changes = applyCharacterBrainWriteBackOutcome(character, outcome, { createdBy: 'relation_profile_agent', now })
    if (!Object.keys(changes).length) return { character, result: { ...baseResult, status: 'skipped', reason: '写回未产生变更' } }
    applyCharacterCognitionChanges(sessionId, characterId, changes)
    const nextCharacter = { ...character, ...changes } as Character
    return {
      character: nextCharacter,
      result: { ...baseResult, status: existingNode ? 'updated' : 'created', explicitCount: merged.explicit.length, implicitCount: merged.implicit.length }
    }
  }

  async function runRelationProfileWritebackForCharacter(sessionId: string, characterId: string, payload: Record<string, any> = {}, options: WorkspaceRequestOptions = {}) {
    const normalizedSessionId = toText(sessionId)
    const normalizedCharacterId = toText(characterId)
    const runKind = toText(payload.runKind ?? payload.mode) === 'manual' ? 'manual' : 'auto'
    if (!normalizedSessionId || !normalizedCharacterId) return { ok: false as const, status: 400, error: '会话或角色为空' }
    let characterRow: Record<string, any>
    try {
      characterRow = resolveSessionCharacterState(normalizedSessionId, normalizedCharacterId).character
    } catch (error) {
      return { ok: false as const, status: 409, error: (error as Error).message }
    }
    // 只读窗口：不消费 visibility，让投影→轨迹照常管理隐藏
    const selected = selectProjectionWritebackWindow(normalizedSessionId, normalizedCharacterId, runKind)
    if (!selected.rows.length) {
      return { ok: true as const, data: { status: 'skipped', reason: '可处理投影不足', visibleCount: selected.visibleCount } }
    }
    const sources = normalizeProjectionWritebackSources(selected.rows) as RelationProfileSource[]
    if (!sources.length) return { ok: true as const, data: { status: 'skipped', reason: '无可用投影文本' } }
    const characterName = readCharacterAliasNames(characterRow)[0] || normalizedCharacterId
    const userName = toText(payload.userName) || '用户'
    const subjects = buildRelationProfileSubjects(normalizedSessionId, normalizedCharacterId, userName)
    // 串行处理每个 subject，累积 character 状态，避免多 subject 写回互相覆盖
    let workingCharacter = normalizeServerCharacter(characterRow)
    const results: Record<string, unknown>[] = []
    for (const subject of subjects) {
      const outcome = await processRelationProfileSubject({
        sessionId: normalizedSessionId,
        characterId: normalizedCharacterId,
        characterName,
        character: workingCharacter,
        subject,
        sources,
        options
      })
      workingCharacter = outcome.character
      results.push(outcome.result)
    }
    const anyWritten = results.some((item) => item.status === 'created' || item.status === 'updated')
    if (anyWritten) persistChatMutation()
    return {
      ok: true as const,
      data: {
        status: anyWritten ? 'written' : 'skipped',
        processedProjectionIds: sources.map((item) => item.id),
        subjects: results
      }
    }
  }

  async function runProjectionWritebackForCharacter(sessionId: string, characterId: string, payload: Record<string, any> = {}, options: WorkspaceRequestOptions = {}) {
    const normalizedSessionId = toText(sessionId)
    const normalizedCharacterId = toText(characterId)
    const runKind = toText(payload.runKind ?? payload.mode) === 'manual' ? 'manual' : 'auto'
    if (!normalizedSessionId) return { ok: false as const, status: 400, error: '会话不能为空' }
    if (!normalizedCharacterId) return { ok: false as const, status: 400, error: '角色不能为空' }
    if (!chatRepository.getSessionById(normalizedSessionId)) {
      return { ok: false as const, status: 404, error: '会话不存在' }
    }
    let characterRow: Record<string, any>
    try {
      characterRow = resolveSessionCharacterState(normalizedSessionId, normalizedCharacterId).character
    } catch (error) {
      return { ok: false as const, status: 409, error: (error as Error).message }
    }
    const characterNames = readCharacterAliasNames(characterRow)
    const characterName = characterNames[0] || normalizedCharacterId
    const selected = selectProjectionWritebackWindow(normalizedSessionId, normalizedCharacterId, runKind)
    if (!selected.rows.length) {
      return {
        ok: true as const,
        data: {
          status: 'skipped',
          reason: runKind === 'manual' ? '可处理投影不足' : '未达到自动写轨迹窗口',
          visibleCount: selected.visibleCount,
          processedProjectionIds: []
        }
      }
    }
    const runId = toText(payload.runId) || buildProjectionWritebackRunId(normalizedSessionId, normalizedCharacterId)
    const now = new Date().toISOString()
    const sourceProjectionIds = selected.rows.map((projection: Record<string, any>) => toText(projection.id)).filter(Boolean)
    chatRepository.upsertProjectionWritebackRun?.({
      id: runId,
      sessionId: normalizedSessionId,
      characterId: normalizedCharacterId,
      runKind,
      status: 'running',
      rangeStartMessageId: Number(selected.rows[0]?.messageId ?? selected.rows[0]?.message_id ?? 0) || 0,
      rangeEndMessageId: Number(selected.rows[selected.rows.length - 1]?.messageId ?? selected.rows[selected.rows.length - 1]?.message_id ?? 0) || 0,
      sourceProjectionIdsJson: JSON.stringify(sourceProjectionIds),
      createdAt: now,
      updatedAt: now
    })
    const involved = selected.rows.filter((projection: Record<string, any>) => projectionMentionsCharacter(projection, characterNames))
    const irrelevant = selected.rows.filter((projection: Record<string, any>) => !projectionMentionsCharacter(projection, characterNames))
    for (const projection of irrelevant) {
      chatRepository.setMessageProjectionVisibility?.(
        normalizedSessionId,
        toText(projection.id),
        normalizedCharacterId,
        'hidden',
        'archived_no_character_mention',
        runId
      )
    }
    const failedEvents: Array<Record<string, unknown>> = []
    const successEventIds: string[] = []
    let workingCharacter = normalizeServerCharacter(characterRow)
    // 拆分自动缩小窗口：整批拆分输出过长被 maxTokens 截断时 JSON 必然解析失败；把这批投影对半递归拆分，
    // 让单次输出变短直到能解析，从根上打破"截断→整批 failed→投影不隐藏→下次又带同一批→再截断"的死循环。
    // 仅对"解析失败/空输出"缩小重试；模型调用本身失败（!ok，如网络/限流）直接抛错走外层 catch，缩小无意义。
    const splitProjectionSourcesWithAutoShrink = async (
      sources: ProjectionWritebackSource[]
    ): Promise<{ events: ProjectionWritebackEvent[]; failedSources: Array<{ source: ProjectionWritebackSource; reason: string }> }> => {
      if (!sources.length) return { events: [], failedSources: [] }
      const splitTrace = buildProjectionWritebackSplitPrompt({ characterName, projections: sources })
      const splitResponse = await callProjectionWritebackAgent(normalizedSessionId, splitTrace, options, PROJECTION_WRITEBACK_SPLIT_MAX_TOKENS)
      if (!splitResponse.ok) throw new Error(splitResponse.error)
      try {
        const events = normalizeProjectionWritebackSplitOutput(splitResponse.rawOutput, sources.map((item) => item.id))
        return { events, failedSources: [] }
      } catch (error) {
        // 只对 JSON 截断/解析失败缩小重试（输出变短即可解析）；模型给了合法 JSON 但无有效事件
        // （'没有可写入事件'）缩小也没用，直接记失败，避免无谓的对半放大调用。
        // 该文案与 normalizeProjectionWritebackSplitOutput 联动，后者改文案这里要同步。
        const noUsableEvents = (error as Error).message.includes('没有可写入事件')
        if (sources.length <= 1 || noUsableEvents) {
          return { events: [], failedSources: sources.map((item) => ({ source: item, reason: (error as Error).message })) }
        }
        const mid = Math.ceil(sources.length / 2)
        const left = await splitProjectionSourcesWithAutoShrink(sources.slice(0, mid))
        const right = await splitProjectionSourcesWithAutoShrink(sources.slice(mid))
        return {
          events: [...left.events, ...right.events],
          failedSources: [...left.failedSources, ...right.failedSources]
        }
      }
    }
    try {
      if (involved.length) {
        const sources = normalizeProjectionWritebackSources(involved)
        const { events, failedSources } = await splitProjectionSourcesWithAutoShrink(sources)
        for (const failedSource of failedSources) {
          failedEvents.push({
            eventId: '',
            title: '事件拆分失败',
            sourceProjectionIds: [toText(failedSource.source?.id)].filter(Boolean),
            reason: failedSource.reason
          })
        }
        if (!events.length && !failedSources.length) {
          failedEvents.push({
            eventId: '',
            title: '事件拆分为空',
            sourceProjectionIds: involved.map((projection: Record<string, any>) => toText(projection.id)).filter(Boolean),
            reason: '事件拆分 Agent 没有返回可写入事件'
          })
        }
        if (events.length) {
          const dayResult = resolveTodayTraceDay(workingCharacter, now)
          if (!dayResult.ok) throw new Error(dayResult.message)
          workingCharacter = dayResult.character
          let pendingDayChanges = dayResult.changes || {}
          for (const event of events) {
            const result = await writeProjectionEventToTrace({
              sessionId: normalizedSessionId,
              character: workingCharacter,
              characterName,
              dayNodeId: dayResult.dayNodeId,
              event,
              options,
              now
            })
            if (!result.ok) {
              failedEvents.push({
                eventId: event.id,
                title: event.title,
                sourceProjectionIds: event.sourceProjectionIds,
                reason: result.reason
              })
              continue
            }
            workingCharacter = result.character
            const mergedChanges = {
              ...pendingDayChanges,
              ...(result.changes || {})
            }
            pendingDayChanges = {}
            if (Object.keys(mergedChanges).length) {
              applyCharacterTraceChanges(normalizedSessionId, normalizedCharacterId, mergedChanges)
            }
            if (result.eventNodeId) successEventIds.push(result.eventNodeId)
            for (const projectionId of event.sourceProjectionIds) {
              chatRepository.setMessageProjectionVisibility?.(
                normalizedSessionId,
                projectionId,
                normalizedCharacterId,
                'hidden',
                'archived_for_character',
                runId
              )
            }
          }
        }
      }
      const status = failedEvents.length ? (successEventIds.length || irrelevant.length ? 'partial' : 'failed') : 'complete'
      chatRepository.upsertProjectionWritebackRun?.({
        id: runId,
        sessionId: normalizedSessionId,
        characterId: normalizedCharacterId,
        runKind,
        status,
        rangeStartMessageId: Number(selected.rows[0]?.messageId ?? selected.rows[0]?.message_id ?? 0) || 0,
        rangeEndMessageId: Number(selected.rows[selected.rows.length - 1]?.messageId ?? selected.rows[selected.rows.length - 1]?.message_id ?? 0) || 0,
        sourceProjectionIdsJson: JSON.stringify(sourceProjectionIds),
        successEventIdsJson: JSON.stringify(successEventIds),
        failedEventsJson: JSON.stringify(failedEvents),
        errorJson: JSON.stringify(failedEvents.length ? { failedEvents } : {}),
        createdAt: now,
        updatedAt: new Date().toISOString(),
        completedAt: new Date().toISOString()
      })
      persistChatMutation()
      return {
        ok: true as const,
        data: {
          id: runId,
          status,
          runKind,
          visibleCount: selected.visibleCount,
          processedProjectionIds: sourceProjectionIds,
          hiddenProjectionCount: selected.rows.length - failedEvents.reduce((sum, item) => sum + (Array.isArray(item.sourceProjectionIds) ? item.sourceProjectionIds.length : 0), 0),
          successEventIds,
          failedEvents
        }
      }
    } catch (error) {
      chatRepository.upsertProjectionWritebackRun?.({
        id: runId,
        sessionId: normalizedSessionId,
        characterId: normalizedCharacterId,
        runKind,
        status: 'failed',
        rangeStartMessageId: Number(selected.rows[0]?.messageId ?? selected.rows[0]?.message_id ?? 0) || 0,
        rangeEndMessageId: Number(selected.rows[selected.rows.length - 1]?.messageId ?? selected.rows[selected.rows.length - 1]?.message_id ?? 0) || 0,
        sourceProjectionIdsJson: JSON.stringify(sourceProjectionIds),
        successEventIdsJson: JSON.stringify(successEventIds),
        failedEventsJson: JSON.stringify(failedEvents),
        errorJson: JSON.stringify({ message: (error as Error).message }),
        createdAt: now,
        updatedAt: new Date().toISOString(),
        completedAt: new Date().toISOString()
      })
      persistChatMutation()
      return { ok: false as const, status: 500, error: `投影写轨迹失败：${(error as Error).message}` }
    }
  }

  async function runImprovisedCharacterExtraction(sessionId: string, payload: Record<string, any>, options: WorkspaceRequestOptions = {}) {
    const normalizedSessionId = String(sessionId || '').trim()
    const targetName = String(payload?.targetName ?? payload?.target_name ?? '').trim()
    const contextResult = buildImprovisedCharacterContextForSession(normalizedSessionId, targetName)
    if (!contextResult.ok) return contextResult
    if (!deps.aiService?.callAIWithFallback) {
      return { ok: false as const, status: 500, error: '即兴角色提取失败：AI 服务未配置' }
    }
    const contextData = contextResult.data as ReturnType<typeof buildImprovisedCharacterContext>
    const promptTrace = buildImprovisedCharacterExtractionPrompt({
      targetName,
      sanitizedContextText: contextData.sanitizedContextText
    })
    const aiOptions = buildAgentSlotAiCallOptions('improvCharacterExtract', { maxTokens: 1800, thinking: 'disabled' })
    const result = await callInternalAIJson(
      deps.aiService,
      aiOptions.presetName,
      aiOptions.model,
      promptTrace.messages,
      deps.logger,
      {
        userId: options.userId || '',
        role: 'local',
        feature: 'agent',
        modelUsageSlotId: aiOptions.modelUsageSlotId,
        ...buildAgentUsageContext(normalizedSessionId, '即兴角色提取', 'improvised_extraction'),
        maxTokens: aiOptions.maxTokens,
        temperature: aiOptions.temperature,
        thinking: aiOptions.thinking
      }
    )
    if (result.error) {
      return { ok: false as const, status: result.status || 500, error: `即兴角色提取失败：模型调用失败：${result.error}` }
    }
    if (result.jsonParseError) {
      return { ok: false as const, status: 500, error: `即兴角色提取失败：模型响应解析失败：${result.jsonParseError}` }
    }
    if (!result.json) {
      return { ok: false as const, status: 500, error: '即兴角色提取失败：模型没有返回响应' }
    }
    const rawOutput = extractAiMessageContent(result.json)
    let parsed: { markdown: string; characterCore: Record<string, unknown> }
    try {
      parsed = normalizeImprovisedCharacterExtractionOutput(rawOutput, targetName, parseCharacterCoreMarkdown)
    } catch (error) {
      return { ok: false as const, status: 422, error: `即兴角色提取失败：输出解析失败：${(error as Error).message}` }
    }

    const auditMessage = addMessageToSession(normalizedSessionId, {
      role: 'system',
      messageKind: 'system',
      content: `即兴角色提取审计：${parsed.characterCore.name}`,
      time: new Date().toLocaleTimeString(),
      memberName: '即兴角色提取',
      model: String(result.model || ''),
      versionList: []
    }, options)
    if (!auditMessage.ok) return auditMessage
    const auditMessageId = Number((auditMessage.data as Record<string, unknown>)?.id || 0)
    const promptBlocks = [
      ...promptTrace.promptBlocks,
      {
        role: 'assistant' as const,
        title: '即兴角色提取 · 模型输出',
        content: rawOutput || '空输出'
      }
    ]
    const total = chatRepository.countPromptLogsBySessionId(normalizedSessionId)
    const logId = buildPromptLogId()
    chatRepository.insertPromptLog(normalizedSessionId, {
      id: logId,
      pageIndex: Math.floor(total / 30) + 1,
      entryIndex: (total % 30) + 1,
      assistantMessageId: auditMessageId,
      speakerName: '即兴角色提取',
      targetId: String(payload?.targetId ?? payload?.target_id ?? ''),
      finalPrompt: promptTrace.finalPrompt,
      promptBlocksJson: JSON.stringify(promptBlocks),
      logKind: 'internal_agent',
      createdAt: new Date().toISOString()
    })
    persistChatMutation()
    return {
      ok: true as const,
      data: {
        ok: true,
        command: contextData.command,
        context: contextData,
        markdown: parsed.markdown,
        characterCore: parsed.characterCore,
        rawOutput,
        promptLogId: logId,
        auditMessageId,
        usedModel: String(result.model || ''),
        usedPreset: String(result.presetName || ''),
        nextStage: 'create_character'
      }
    }
  }

  async function createImprovisedCharacterFromSession(sessionId: string, payload: Record<string, any>, options: WorkspaceRequestOptions = {}) {
    const normalizedSessionId = String(sessionId || '').trim()
    const allowDuplicateName = payload?.allowDuplicateName === true || payload?.allow_duplicate_name === true
    const requestedName = String(payload?.finalName ?? payload?.final_name ?? payload?.targetName ?? payload?.target_name ?? '').trim()
    if (requestedName && !allowDuplicateName && typeof characterRepository.getCharacters === 'function') {
      const existing = characterRepository.getCharacters().find((character: Record<string, unknown>) => {
        return String(character?.name || '').trim() === requestedName
      })
      if (existing) {
        return {
          ok: false as const,
          status: 409,
          error: `已存在同名角色：${requestedName}`,
          data: {
            duplicateName: requestedName,
            existingCharacterId: String(existing.id || ''),
            canRename: true,
            canContinueDuplicate: true
          }
        }
      }
    }
    const extraction = await runImprovisedCharacterExtraction(normalizedSessionId, payload || {}, options)
    if (!extraction.ok) return extraction

    const extractionData = extraction.data as Record<string, any>
    const characterCore = extractionData.characterCore || {}
    const group = ensureImprovisedCharacterGroup()
    const characterId = buildImprovisedCharacterId()
    const existingCharacters = typeof characterRepository.getCharacters === 'function'
      ? characterRepository.getCharacters()
      : []
    const maxOrderIndex = Array.isArray(existingCharacters)
      ? existingCharacters.reduce((max: number, character: Record<string, unknown>) => {
        return Math.max(max, Number(character?.orderIndex ?? character?.order_index ?? 0))
      }, 0)
      : 0
    const now = new Date().toISOString()
    const character = {
      id: characterId,
      name: String((payload?.finalName ?? payload?.final_name ?? characterCore.name) || extractionData.command?.targetName || '即兴角色').trim(),
      gender: String(characterCore.gender || ''),
      age: String(characterCore.age || ''),
      emoji: String(characterCore.emoji || '👤'),
      avatarPath: '',
      groupId: String(group.id || 'improvised_characters'),
      desc: String(characterCore.desc || ''),
      appearance: String(characterCore.appearance || ''),
      outfit: String(characterCore.outfit || ''),
      personality: String(characterCore.personality || ''),
      hobbies: String(characterCore.hobbies || ''),
      abilities: String(characterCore.abilities || ''),
      experience: String(characterCore.experience || ''),
      worldview: String(characterCore.worldview || ''),
      background: String(characterCore.background || ''),
      speakingStyle: String(characterCore.speakingStyle || characterCore.speaking_style || ''),
      brainDocuments: characterCore.brainDocuments ?? characterCore.brain_documents ?? {},
      orderIndex: maxOrderIndex + 1
    }

    characterRepository.insertCharacter([
      character.id, character.name, character.gender, character.age, character.emoji, character.avatarPath,
      character.groupId, character.desc, character.appearance, character.outfit,
      character.personality, character.hobbies, character.abilities, character.experience,
      character.worldview, character.background, character.speakingStyle,
      JSON.stringify([]), '', '',
      null, null, '', 'follow_session',
      JSON.stringify({}), JSON.stringify([]),
      JSON.stringify([]), JSON.stringify({}),
      jsonColumnText({}, {}),
      jsonColumnText(character.brainDocuments, {}),
      jsonColumnText([], []),
      jsonColumnText([], []),
      jsonColumnText({}, {}),
      jsonColumnText({}, {}),
      jsonColumnText({}, {}),
      jsonColumnText([], []),
      50,
      JSON.stringify([]), character.orderIndex,
      ''
    ])

    const participants = typeof chatRepository.listSessionParticipants === 'function'
      ? chatRepository.listSessionParticipants(normalizedSessionId)
      : []
    const normalizedParticipants = (Array.isArray(participants) ? participants : []).map((item: Record<string, unknown>, index: number) => ({
      id: String(item.id || buildTemporaryParticipantId(normalizedSessionId)),
      participantTargetId: String(item.participantTargetId ?? item.participant_target_id ?? ''),
      participantType: String(item.participantType ?? item.participant_type ?? 'char') || 'char',
      displayOrder: Number(item.displayOrder ?? item.display_order ?? index),
      role: String(item.role || 'speaker'),
      replyProbability: normalizeReplyProbability(item.replyProbability ?? item.reply_probability),
      createdAt: String(item.createdAt ?? item.created_at ?? now),
      updatedAt: String(item.updatedAt ?? item.updated_at ?? now),
      characterStateMode: String(item.characterStateMode ?? item.character_state_mode ?? 'follow_main'),
      characterBranchId: String(item.characterBranchId ?? item.character_branch_id ?? '')
    })).filter((item: Record<string, unknown>) => item.participantTargetId)
    const nextDisplayOrder = normalizedParticipants.reduce((max: number, item: Record<string, unknown>) => {
      return Math.max(max, Number(item.displayOrder || 0))
    }, -1) + 1
    const participant = {
      id: buildTemporaryParticipantId(normalizedSessionId),
      participantTargetId: character.id,
      participantType: 'char',
      displayOrder: nextDisplayOrder,
      role: 'speaker',
      replyProbability: 100,
      createdAt: now,
      updatedAt: now,
      characterStateMode: 'follow_main',
      characterBranchId: ''
    }
    chatRepository.replaceSessionParticipants(normalizedSessionId, [
      ...normalizedParticipants,
      participant
    ])
    persistChatMutation()

    return {
      ok: true as const,
      data: {
        ...extractionData,
        ok: true,
        character,
        group,
        participant,
        nextStage: 'done'
      }
    }
  }

  async function runSessionTemporaryCharacterProfileGeneration(input: {
    sessionId: string
    targetName: string
    existing?: Record<string, any> | null
    context: ReturnType<typeof buildSessionTemporaryCharacterContext>
    options?: WorkspaceRequestOptions
  }) {
    if (!deps.aiService?.callAIWithFallback) {
      return { ok: false as const, status: 500, error: '临时角色资料生成失败：AI 服务未配置' }
    }
    const existingMarkdown = String(input.existing?.markdown || '')
    const lockedFields = parseJsonArray(input.existing?.lockedFieldsJson ?? input.existing?.locked_fields_json)
      .map((item) => String(item || '').trim())
      .filter(Boolean)
    const promptTrace = buildSessionTemporaryCharacterProfilePrompt({
      targetName: input.targetName,
      sanitizedContextText: input.context.sanitizedContextText,
      existingMarkdown,
      lockedFields,
      mode: input.existing ? 'update' : 'create'
    })
    const aiOptions = buildAgentSlotAiCallOptions('sessionTempProfile', { maxTokens: 1800, thinking: 'disabled' })
    const result = await callInternalAIJson(
      deps.aiService,
      aiOptions.presetName,
      aiOptions.model,
      promptTrace.messages,
      deps.logger,
      {
        userId: input.options?.userId || '',
        role: 'local',
        feature: 'agent',
        modelUsageSlotId: aiOptions.modelUsageSlotId,
        ...buildAgentUsageContext(input.sessionId, '临时角色资料生成'),
        maxTokens: aiOptions.maxTokens,
        temperature: aiOptions.temperature,
        thinking: aiOptions.thinking
      }
    )
    if (result.error) {
      return { ok: false as const, status: result.status || 500, error: `临时角色资料生成失败：模型调用失败：${result.error}` }
    }
    if (result.jsonParseError) {
      return { ok: false as const, status: 500, error: `临时角色资料生成失败：模型响应解析失败：${result.jsonParseError}` }
    }
    if (!result.json) {
      return { ok: false as const, status: 500, error: '临时角色资料生成失败：模型没有返回响应' }
    }
    const rawOutput = extractAiMessageContent(result.json)
    const markdown = String(rawOutput || '').trim().replace(/^```(?:markdown|md)?\s*/i, '').replace(/\s*```$/i, '').trim()
    if (!markdown || markdown.includes('资料不足，无法创建会话临时角色')) {
      return { ok: false as const, status: 422, error: '没有找到可用于创建临时角色的上下文' }
    }
    const total = chatRepository.countPromptLogsBySessionId(input.sessionId)
    const logId = buildPromptLogId()
    chatRepository.insertPromptLog(input.sessionId, {
      id: logId,
      pageIndex: Math.floor(total / 30) + 1,
      entryIndex: (total % 30) + 1,
      assistantMessageId: 0,
      speakerName: '临时角色资料生成',
      targetId: '',
      finalPrompt: promptTrace.finalPrompt,
      promptBlocksJson: JSON.stringify([
        ...promptTrace.promptBlocks,
        {
          role: 'assistant',
          title: '会话临时角色资料 · 模型输出',
          content: rawOutput || '空输出'
        }
      ]),
      logKind: 'internal_agent',
      createdAt: new Date().toISOString()
    })
    return {
      ok: true as const,
      data: {
        markdown,
        rawOutput,
        promptLogId: logId,
        promptTrace,
        usedModel: String(result.model || ''),
        usedPreset: String(result.presetName || '')
      }
    }
  }

  async function judgeSessionTemporaryCharacterFields(input: {
    sessionId: string
    existingMarkdown: string
    newMarkdown: string
    options?: WorkspaceRequestOptions
  }) {
    const fields = listSessionTemporaryCharacterUpdatedFields(input.newMarkdown)
    const results: Array<Record<string, unknown>> = []
    for (const field of fields) {
      const oldFieldText = extractSessionTemporaryCharacterField(input.existingMarkdown, field)
      const newFieldText = extractSessionTemporaryCharacterField(input.newMarkdown, field)
      if (!oldFieldText || !newFieldText) {
        results.push({
          field,
          deltaScore: oldFieldText ? 0.25 : 1,
          conflictScore: 0,
          localOnly: true,
          ...calculateTemporaryCharacterConfidence({
            deltaScore: oldFieldText ? 0.25 : 1,
            conflictScore: 0,
            sourceQuality: 0.72
          })
        })
        continue
      }
      if (!deps.aiService?.callAIWithFallback) {
        results.push({ field, status: 'pending_judge', error: 'AI 服务未配置' })
        continue
      }
      const promptTrace = buildTemporaryCharacterEvidenceJudgePrompt({ oldFieldText, newFieldText })
      const response = await callInternalAIJson(
        deps.aiService,
        undefined,
        undefined,
        promptTrace.messages,
        deps.logger,
        {
          userId: input.options?.userId || '',
          role: 'local',
          feature: 'agent',
          ...buildAgentUsageContext(input.sessionId, '临时角色字段评审'),
          maxTokens: 120,
          thinking: 'disabled'
        }
      )
      if (response.error || response.jsonParseError || !response.json) {
        results.push({ field, status: 'pending_judge', error: response.error || response.jsonParseError || '模型没有返回响应' })
        continue
      }
      try {
        const rawOutput = extractAiMessageContent(response.json)
        const score = parseTemporaryCharacterEvidenceJudgeOutput(rawOutput)
        results.push({
          field,
          ...score,
          ...calculateTemporaryCharacterConfidence({
            deltaScore: score.deltaScore,
            conflictScore: score.conflictScore,
            sourceQuality: 0.72
          })
        })
      } catch (error) {
        results.push({ field, status: 'pending_judge', error: (error as Error).message })
      }
    }
    return results
  }

  async function createOrUpdateSessionTemporaryCharacterFromMention(sessionId: string, payload: Record<string, any>, options: WorkspaceRequestOptions = {}) {
    const normalizedSessionId = String(sessionId || '').trim()
    const targetName = String(payload?.targetName ?? payload?.target_name ?? '').trim()
    if (!chatRepository.getSessionById(normalizedSessionId)) {
      return { ok: false as const, status: 404, error: '会话不存在' }
    }
    if (!targetName) {
      return { ok: false as const, status: 400, error: '临时角色名称不能为空' }
    }
    const existingItems = typeof chatRepository.listSessionTemporaryCharacters === 'function'
      ? chatRepository.listSessionTemporaryCharacters(normalizedSessionId)
      : []
    const existing = (Array.isArray(existingItems) ? existingItems : []).find((item: Record<string, unknown>) => {
      if (String(item?.name || '').trim() === targetName) return true
      const aliases = parseJsonArray(item?.aliasesJson ?? item?.aliases_json)
      return aliases.some((alias) => String(alias || '').trim() === targetName)
    }) || null
    const messages = typeof chatRepository.getMessagesBySessionIdOrdered === 'function'
      ? chatRepository.getMessagesBySessionIdOrdered(normalizedSessionId)
      : chatRepository.getMessagesBySessionId(normalizedSessionId)
    const context = buildSessionTemporaryCharacterContext({
      targetName,
      messages: Array.isArray(messages) ? messages.map((item: Record<string, unknown>) => toCamel(item)) : [],
      existingSourceLedger: parseJsonArray(existing?.sourceLedgerJson ?? existing?.source_ledger_json)
    })
    if (context.newMaterials.length <= 0) {
      return { ok: false as const, status: 422, error: existing ? '没有找到新的可用于更新临时角色的上下文' : '没有找到可用于创建临时角色的上下文' }
    }
    const generation = await runSessionTemporaryCharacterProfileGeneration({
      sessionId: normalizedSessionId,
      targetName,
      existing,
      context,
      options
    })
    if (!generation.ok) return generation
    const generationData = generation.data as Record<string, any>
    const existingMarkdown = String(existing?.markdown || '')
    const mergedMarkdown = mergeSessionTemporaryCharacterMarkdown({
      existingMarkdown,
      newMarkdown: String(generationData.markdown || ''),
      mode: existing ? 'update' : 'create'
    })
    const judgeResults = existing
      ? await judgeSessionTemporaryCharacterFields({
          sessionId: normalizedSessionId,
          existingMarkdown,
          newMarkdown: String(generationData.markdown || ''),
          options
        })
      : []
    const now = new Date().toISOString()
    const previousLedger = parseJsonArray(existing?.sourceLedgerJson ?? existing?.source_ledger_json)
    const pendingJudge = judgeResults.some((item) => String(item.status || '') === 'pending_judge')
    const sourceLedger = [
      ...previousLedger,
      ...context.sourceLedger.map((entry: SessionTemporaryCharacterSourceLedgerEntry) => ({
        ...entry,
        status: pendingJudge ? 'pending_judge' : entry.status
      })),
      ...(judgeResults.length ? [{
        sourceId: `judge:${now}`,
        shortLabel: `J${judgeResults.length}`,
        sourceType: 'message',
        sourceKind: 'confidence_judge',
        contentHash: '',
        summary: '字段置信度裁判结果',
        status: pendingJudge ? 'pending_judge' : 'used',
        results: judgeResults
      }] : [])
    ]
    const row = {
      id: String(existing?.id || buildSessionTemporaryCharacterId()),
      sessionId: normalizedSessionId,
      name: String(existing?.name || targetName),
      aliasesJson: normalizeJsonList(existing?.aliasesJson ?? existing?.aliases_json ?? []),
      markdown: pendingJudge ? existingMarkdown : mergedMarkdown,
      sourceLedgerJson: JSON.stringify(sourceLedger),
      lockedFieldsJson: normalizeJsonList(existing?.lockedFieldsJson ?? existing?.locked_fields_json ?? []),
      status: 'active',
      createdAt: String(existing?.createdAt ?? existing?.created_at ?? '') || now,
      updatedAt: now
    }
    chatRepository.upsertSessionTemporaryCharacter(row)
    persistChatMutation()
    const saved = typeof chatRepository.findSessionTemporaryCharacterById === 'function'
      ? chatRepository.findSessionTemporaryCharacterById(normalizedSessionId, row.id)
      : row
    return {
      ok: true as const,
      data: {
        ok: true,
        item: saved,
        created: !existing,
        updated: Boolean(existing),
        context,
        judgeResults,
        promptLogId: generationData.promptLogId,
        pendingJudge
      }
    }
  }

  async function runTemporaryEntityProfileGeneration(input: {
    sessionId: string
    command: TemporaryEntityCommand
    existing?: Record<string, any> | null
    context: ReturnType<typeof buildTemporaryEntityContext>
    options?: WorkspaceRequestOptions
  }) {
    const kindLabel = getTemporaryEntityKindLabel(input.command.kind)
    if (!deps.aiService?.callAIWithFallback) {
      return { ok: false as const, status: 500, error: `临时${kindLabel}资料生成失败：AI 服务未配置` }
    }
    const existingMarkdown = String(input.existing?.markdown || '')
    const promptTrace = buildTemporaryEntityProfilePrompt({
      command: input.command,
      sanitizedContextText: input.context.sanitizedContextText,
      existingMarkdown,
      mode: input.existing ? 'update' : 'create'
    })
    const aiOptions = buildAgentSlotAiCallOptions('sessionTempProfile', { maxTokens: 1800, thinking: 'disabled' })
    const result = await callInternalAIJson(
      deps.aiService,
      aiOptions.presetName,
      aiOptions.model,
      promptTrace.messages,
      deps.logger,
      {
        userId: input.options?.userId || '',
        role: 'local',
        feature: 'agent',
        modelUsageSlotId: aiOptions.modelUsageSlotId,
        ...buildAgentUsageContext(input.sessionId, `临时${kindLabel}资料生成`),
        maxTokens: aiOptions.maxTokens,
        temperature: aiOptions.temperature,
        thinking: aiOptions.thinking
      }
    )
    if (result.error) {
      return { ok: false as const, status: result.status || 500, error: `临时${kindLabel}资料生成失败：模型调用失败：${result.error}` }
    }
    if (result.jsonParseError) {
      return { ok: false as const, status: 500, error: `临时${kindLabel}资料生成失败：模型响应解析失败：${result.jsonParseError}` }
    }
    if (!result.json) {
      return { ok: false as const, status: 500, error: `临时${kindLabel}资料生成失败：模型没有返回响应` }
    }
    const rawOutput = extractAiMessageContent(result.json)
    const markdown = stripTemporaryEntityMarkdownOutput(rawOutput)
    if (!markdown || markdown.includes('资料不足，无法创建会话临时资料')) {
      return { ok: false as const, status: 422, error: `没有找到可用于创建临时${kindLabel}的上下文` }
    }
    const total = chatRepository.countPromptLogsBySessionId(input.sessionId)
    const logId = buildPromptLogId()
    chatRepository.insertPromptLog(input.sessionId, {
      id: logId,
      pageIndex: Math.floor(total / 30) + 1,
      entryIndex: (total % 30) + 1,
      assistantMessageId: 0,
      speakerName: `临时${kindLabel}资料生成`,
      targetId: '',
      finalPrompt: promptTrace.finalPrompt,
      promptBlocksJson: JSON.stringify([
        ...promptTrace.promptBlocks,
        {
          role: 'assistant',
          title: `会话临时${kindLabel}资料 · 模型输出`,
          content: rawOutput || '空输出'
        }
      ]),
      logKind: 'internal_agent',
      createdAt: new Date().toISOString()
    })
    return {
      ok: true as const,
      data: {
        markdown,
        rawOutput,
        promptLogId: logId,
        promptTrace,
        usedModel: String(result.model || ''),
        usedPreset: String(result.presetName || '')
      }
    }
  }

  async function organizeSessionTemporaryEntity(sessionId: string, payload: Record<string, any>, options: WorkspaceRequestOptions = {}) {
    const normalizedSessionId = String(sessionId || '').trim()
    const command = payload?.command && typeof payload.command === 'object'
      ? {
          type: 'temporary_entity_organize' as const,
          kind: normalizeTemporaryEntityKind(payload.command.kind),
          kindLabel: getTemporaryEntityKindLabel(payload.command.kind),
          targetName: String(payload.command.targetName ?? payload.command.target_name ?? '').trim(),
          rawText: String(payload.command.rawText ?? payload.command.raw_text ?? '')
        }
      : parseTemporaryEntityOrganizeCommand(payload?.rawText ?? payload?.raw_text ?? '')
    if (!chatRepository.getSessionById(normalizedSessionId)) {
      return { ok: false as const, status: 404, error: '会话不存在' }
    }
    if (!command) {
      return { ok: false as const, status: 400, error: '整理命令不合法' }
    }
    if (!command.targetName) {
      return { ok: false as const, status: 400, error: '临时资料名称不能为空' }
    }
    const kind = normalizeTemporaryEntityKind(command.kind)
    const kindLabel = getTemporaryEntityKindLabel(kind)
    const existingItems = typeof chatRepository.listSessionTemporaryEntities === 'function'
      ? chatRepository.listSessionTemporaryEntities(normalizedSessionId)
      : []
    const existing = (Array.isArray(existingItems) ? existingItems : []).find((item: Record<string, unknown>) => {
      if (String(item?.kind || 'character') !== kind) return false
      if (String(item?.name || '').trim() === command.targetName) return true
      const aliases = parseJsonArray(item?.aliasesJson ?? item?.aliases_json)
      return aliases.some((alias) => String(alias || '').trim() === command.targetName)
    }) || null
    const messages = typeof chatRepository.getMessagesBySessionIdOrdered === 'function'
      ? chatRepository.getMessagesBySessionIdOrdered(normalizedSessionId)
      : chatRepository.getMessagesBySessionId(normalizedSessionId)
    const context = buildTemporaryEntityContext({
      command: {
        ...command,
        kind,
        kindLabel
      },
      messages: Array.isArray(messages) ? messages.map((item: Record<string, unknown>) => toCamel(item)) : [],
      existingSourceLedger: parseJsonArray(existing?.sourceLedgerJson ?? existing?.source_ledger_json)
    })
    if (context.newMaterials.length <= 0) {
      return { ok: false as const, status: 422, error: existing ? `没有找到新的可用于更新临时${kindLabel}的上下文` : `没有找到可用于创建临时${kindLabel}的上下文` }
    }
    const generation = await runTemporaryEntityProfileGeneration({
      sessionId: normalizedSessionId,
      command: {
        ...command,
        kind,
        kindLabel
      },
      existing,
      context,
      options
    })
    if (!generation.ok) return generation
    const generationData = generation.data as Record<string, any>
    const existingMarkdown = String(existing?.markdown || '')
    const mergedMarkdown = mergeTemporaryEntityMarkdown({
      existingMarkdown,
      newMarkdown: String(generationData.markdown || ''),
      kind,
      mode: existing ? 'update' : 'create'
    })
    const now = new Date().toISOString()
    const previousLedger = parseJsonArray(existing?.sourceLedgerJson ?? existing?.source_ledger_json)
    const sourceLedger = [
      ...previousLedger,
      ...context.sourceLedger
    ]
    const row = {
      id: String(existing?.id || buildSessionTemporaryEntityId(kind)),
      sessionId: normalizedSessionId,
      kind,
      name: String(existing?.name || command.targetName),
      aliasesJson: normalizeJsonList(existing?.aliasesJson ?? existing?.aliases_json ?? []),
      markdown: mergedMarkdown,
      tagsJson: JSON.stringify(buildTemporaryEntityTags({ kind, name: String(existing?.name || command.targetName), markdown: mergedMarkdown })),
      sourceLedgerJson: JSON.stringify(sourceLedger),
      status: 'active',
      persistedTargetJson: jsonColumnText(existing?.persistedTargetJson ?? existing?.persisted_target_json ?? {}, {}),
      worldId: String((existing?.worldId ?? existing?.world_id ?? resolveStatusPanelWorldScope(normalizedSessionId).worldId) || '').trim(),
      createdAt: String(existing?.createdAt ?? existing?.created_at ?? '') || now,
      updatedAt: now
    }
    if (kind === 'character') {
      chatRepository.upsertSessionTemporaryCharacter({
        id: row.id,
        sessionId: row.sessionId,
        name: row.name,
        aliasesJson: row.aliasesJson,
        markdown: row.markdown,
        sourceLedgerJson: row.sourceLedgerJson,
        lockedFieldsJson: normalizeJsonList(existing?.lockedFieldsJson ?? existing?.locked_fields_json ?? []),
        status: row.status,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt
      })
    } else {
      chatRepository.upsertSessionTemporaryEntity(row)
    }
    // 批次4 融合：新整理出的临时实体自动挂状态栏（更新已有实体时 ensure 内部按宿主去重跳过）
    ensureStatusPanelForTemporaryEntity(normalizedSessionId, row)
    persistChatMutation()
    const saved = findSessionTemporaryEntityUnified(normalizedSessionId, row.id) || row
    return {
      ok: true as const,
      data: {
        ok: true,
        item: saved,
        created: !existing,
        updated: Boolean(existing),
        context,
        promptLogId: generationData.promptLogId,
        rawOutput: generationData.rawOutput
      }
    }
  }

  return {
    createChatSession(payload: Record<string, any>) {
      return createChatSessionFromPayload(payload || {})
    },
    createChatSessionWithTrustedId(payload: Record<string, any>, trustedSessionId: string) {
      const sessionId = String(trustedSessionId || '').trim()
      if (!/^rw_session_[a-f0-9]{24}$/.test(sessionId)) {
        return { ok: false as const, status: 400, error: '环世界会话标识格式无效' }
      }
      return createChatSessionFromPayload(payload || {}, sessionId)
    },
    ensureXingyiSession() {
      return ensureXingyiSessionBundle()
    },
    createXingyiSession() {
      return createXingyiSessionBundle()
    },
    listXingyiSessions() {
      return listXingyiSessionSummaries()
    },
    activateXingyiSession(sessionId: string) {
      return activateXingyiSessionBundle(sessionId)
    },
    ensureWorkspaceAgentSession(kind: string, targetId: string, title: string) {
      return ensureWorkspaceAgentSessionBundle(kind, targetId, title)
    },
    createWorkspaceAgentSession(kind: string, targetId: string, title: string) {
      return createWorkspaceAgentSessionBundle(kind, targetId, title)
    },
    listWorkspaceAgentSessions(kind: string, targetId: string) {
      return listWorkspaceAgentSessionSummaries(kind, targetId)
    },
    activateWorkspaceAgentSession(sessionId: string, kind: string, targetId: string) {
      return activateWorkspaceAgentSessionBundle(sessionId, kind, targetId)
    },
    getChatSession(sessionId: string, options?: number | { limit?: number; beforeId?: number }) {
      return toChatBundle(String(sessionId || '').trim(), options)
    },
    getAgentContextBundleBySessionId(sessionId: string, payload: Record<string, any> = {}, options: WorkspaceRequestOptions = {}) {
      return resolveAgentContextBundle(sessionId, payload || {}, options)
    },
    addChatMessageBySessionId(sessionId: string, payload: Record<string, any>, options: WorkspaceRequestOptions = {}) {
      return addMessageToSession(String(sessionId || '').trim(), payload || {}, options)
    },
    runChatMessageProjectionBySessionId(
      sessionId: string,
      messageId: string | number,
      options: WorkspaceRequestOptions = {},
      usageUnit: { unitId?: string; unitKind?: string; promptLogMode?: 'manual' | 'background' } = {}
    ) {
      return runMessageProjectionAgent(String(sessionId || '').trim(), Number(messageId || 0), options, usageUnit)
    },
    saveEmbeddedChatMessageProjectionBySessionId(sessionId: string, messageId: string | number, payload: Record<string, any> = {}, options: WorkspaceRequestOptions = {}) {
      return saveEmbeddedMessageProjection(String(sessionId || '').trim(), Number(messageId || 0), payload || {}, options)
    },
    getChatPersonalityModelObservationsBySessionId(sessionId: string, options: WorkspaceRequestOptions = {}) {
      return buildPersonalityModelObservationsForSession(sessionId, options)
    },
    async runChatProjectionWritebackBySessionId(sessionId: string, payload: Record<string, any> = {}, options: WorkspaceRequestOptions = {}) {
      const characterId = toText(payload.characterId ?? payload.character_id)
      // 先沉淀关系画像（只读投影、不动 visibility），与投影→轨迹独立；失败不阻断轨迹主流程
      let relationProfile: unknown = null
      try {
        relationProfile = await runRelationProfileWritebackForCharacter(sessionId, characterId, payload || {}, options)
      } catch (error) {
        relationProfile = { ok: false as const, error: (error as Error).message }
      }
      const result = await runProjectionWritebackForCharacter(sessionId, characterId, payload || {}, options)
      if (result && (result as any).ok && (result as any).data) {
        return { ...result, data: { ...(result as any).data, relationProfile } }
      }
      return result
    },
    buildPersonalityModelContextBySessionId(sessionId: string, payload: Record<string, any> = {}) {
      return buildPersonalityModelContextForSession(sessionId, payload || {})
    },
    getProjectionFirstMessageViewBySessionId(sessionId: string, payload: Record<string, any> = {}) {
      return buildProjectionFirstMessageViewForSession(sessionId, payload || {})
    },
    listChatMessageNotesBySessionId(sessionId: string) {
      const normalizedSessionId = String(sessionId || '').trim()
      const session = chatRepository.getSessionById(normalizedSessionId) as Record<string, any> | null
      if (!session) {
        return { ok: false as const, status: 404, error: '会话不存在' }
      }
      return {
        ok: true as const,
        data: {
          notes: chatRepository.listMessageNotesBySessionId(normalizedSessionId) || []
        }
      }
    },
    addChatMessageNoteBySessionId(sessionId: string, payload: Record<string, any>) {
      const normalizedSessionId = String(sessionId || '').trim()
      if (!chatRepository.getSessionById(normalizedSessionId)) {
        return { ok: false as const, status: 404, error: '会话不存在' }
      }
      const note = buildMessageNotePayload(normalizedSessionId, payload || {})
      if (!Number.isInteger(note.messageId) || note.messageId <= 0) {
        return { ok: false as const, status: 400, error: '笔记必须绑定有效消息' }
      }
      if (!note.sourceText) {
        return { ok: false as const, status: 400, error: '笔记内容不能为空' }
      }
      if (!chatRepository.findMessageByIdInSession(normalizedSessionId, note.messageId)) {
        return { ok: false as const, status: 404, error: '消息不存在' }
      }
      const saved = chatRepository.insertMessageNote(normalizedSessionId, note)
      persistChatMutation()
      return { ok: true as const, data: { ok: true, note: saved } }
    },
    deleteChatMessageNoteBySessionId(sessionId: string, noteId: string) {
      const normalizedSessionId = String(sessionId || '').trim()
      const normalizedNoteId = String(noteId || '').trim()
      if (!chatRepository.getSessionById(normalizedSessionId)) {
        return { ok: false as const, status: 404, error: '会话不存在' }
      }
      chatRepository.deleteMessageNoteById(normalizedSessionId, normalizedNoteId)
      persistChatMutation()
      return { ok: true as const, data: { ok: true, deletedId: normalizedNoteId } }
    },
    prepareImprovisedCharacterContextBySessionId(sessionId: string, payload: Record<string, any>) {
      return buildImprovisedCharacterContextForSession(sessionId, payload?.targetName ?? payload?.target_name ?? '')
    },
    extractImprovisedCharacterBySessionId(sessionId: string, payload: Record<string, any>, options: WorkspaceRequestOptions = {}) {
      return runImprovisedCharacterExtraction(sessionId, payload || {}, options)
    },
    createImprovisedCharacterBySessionId(sessionId: string, payload: Record<string, any>, options: WorkspaceRequestOptions = {}) {
      return createImprovisedCharacterFromSession(sessionId, payload || {}, options)
    },
    createOrUpdateSessionTemporaryCharacterByMention(sessionId: string, payload: Record<string, any>, options: WorkspaceRequestOptions = {}) {
      return { ok: false as const, status: 410, error: '未知 @ 不再创建会话临时角色，请使用 /整理角色 名称' }
    },
    organizeSessionTemporaryEntityByCommand(sessionId: string, payload: Record<string, any>, options: WorkspaceRequestOptions = {}) {
      return organizeSessionTemporaryEntity(sessionId, payload || {}, options)
    },
    updateChatMessageBySessionId(sessionId: string, msgId: string, payload: Record<string, any>) {
      const normalizedSessionId = String(sessionId || '').trim()
      if (!chatRepository.getSessionById(normalizedSessionId)) {
        return { ok: false as const, status: 404, error: '会话不存在' }
      }
      const body = payload || {}
      const fields: Record<string, unknown> = {}

      if (typeof body.content === 'string') fields.content = body.content
      if (typeof body.messageKind === 'string' || typeof body.message_kind === 'string') {
        const messageKind = String(body.messageKind ?? body.message_kind ?? '').trim()
        if (isSupportedChatMessageKind(messageKind)) fields.message_kind = messageKind
      }
      if (typeof body.time === 'string') fields.time = body.time
      if (typeof body.envDate === 'string' || typeof body.env_date === 'string') fields.env_date = body.envDate ?? body.env_date ?? ''
      if (typeof body.envWeather === 'string' || typeof body.env_weather === 'string') fields.env_weather = body.envWeather ?? body.env_weather ?? ''
      if (typeof body.envLocation === 'string' || typeof body.env_location === 'string') fields.env_location = body.envLocation ?? body.env_location ?? ''
      if (typeof body.model === 'string') fields.model = body.model
      if (typeof body.crowdName === 'string' || typeof body.crowd_name === 'string') fields.crowd_name = body.crowdName ?? body.crowd_name ?? ''
      if (typeof body.memberName === 'string' || typeof body.member_name === 'string' || typeof body.name === 'string') fields.member_name = body.memberName ?? body.member_name ?? body.name ?? ''
      if (typeof body.narrationProfileId === 'string' || typeof body.narration_profile_id === 'string') fields.narration_profile_id = body.narrationProfileId ?? body.narration_profile_id ?? ''
      if (typeof body.narrationProfileName === 'string' || typeof body.narration_profile_name === 'string') fields.narration_profile_name = body.narrationProfileName ?? body.narration_profile_name ?? ''
      if (typeof body.narrationProfileKind === 'string' || typeof body.narration_profile_kind === 'string') fields.narration_profile_kind = body.narrationProfileKind ?? body.narration_profile_kind ?? ''
      if (body.includeInContext !== undefined || body.include_in_context !== undefined) fields.include_in_context = Number(Boolean(body.includeInContext ?? body.include_in_context))
      if (body.focusedActionVisibility !== undefined || body.focused_action_visibility !== undefined) {
        fields.focused_action_visibility = normalizeFocusedActionVisibility(body.focusedActionVisibility ?? body.focused_action_visibility)
      }
      if (body.autoWriteHidden !== undefined || body.auto_write_hidden !== undefined) fields.auto_write_hidden = Number(Boolean(body.autoWriteHidden ?? body.auto_write_hidden))
      if (typeof body.autoWriteHiddenAt === 'string' || typeof body.auto_write_hidden_at === 'string') fields.auto_write_hidden_at = body.autoWriteHiddenAt ?? body.auto_write_hidden_at ?? ''
      if (typeof body.autoWriteBatchId === 'string' || typeof body.auto_write_batch_id === 'string') fields.auto_write_batch_id = body.autoWriteBatchId ?? body.auto_write_batch_id ?? ''
      if (typeof body.autoWriteHiddenReason === 'string' || typeof body.auto_write_hidden_reason === 'string') fields.auto_write_hidden_reason = body.autoWriteHiddenReason ?? body.auto_write_hidden_reason ?? ''
      if (Array.isArray(body.versionList) || Array.isArray(body.versionsJson) || Array.isArray(body.versions_json)) {
        fields.versions_json = JSON.stringify(body.versionList ?? body.versionsJson ?? body.versions_json ?? [])
      }
      if (Number.isInteger(body.activeVersionIndex) || Number.isInteger(body.active_version_index)) {
        fields.active_version_index = Number(body.activeVersionIndex ?? body.active_version_index ?? 0)
      }
      // 图片附件回填（带图乐观发送计划·2026-07-11）：caption 后台补全完成后，宿主用合并好的完整附件数组
      // 整体覆盖 attachments_json（不是增量 patch）——调用方自己持有当前完整附件列表，这里原样序列化落库。
      if (Array.isArray(body.attachments) || typeof body.attachments_json === 'string') {
        fields.attachments_json = typeof body.attachments_json === 'string'
          ? body.attachments_json
          : JSON.stringify(body.attachments)
      }

      if (Object.keys(fields).length === 0) {
        return { ok: true as const, data: { ok: true, skipped: true } }
      }

      if (shouldInvalidateAffectTideForMessagePayload(body)) {
        deleteAffectTideFromMessage(normalizedSessionId, msgId, 'from_message')
      }
      chatRepository.updateMessageBySession(msgId, normalizedSessionId, fields)
      if (
        fields.content !== undefined
        || fields.message_kind !== undefined
        || fields.time !== undefined
        || fields.env_date !== undefined
        || fields.env_weather !== undefined
        || fields.env_location !== undefined
      ) {
        chatRepository.deleteMessageProjectionTreeByMessageId?.(normalizedSessionId, msgId)
        restoreProjectionCurtainBeforeMessage(normalizedSessionId, msgId)
      }
      persistChatMutation()
      return { ok: true as const, data: { ok: true } }
    },
    deleteChatMessageBySessionId(sessionId: string, msgId: string) {
      const normalizedSessionId = String(sessionId || '').trim()
      if (!chatRepository.getSessionById(normalizedSessionId)) {
        return { ok: false as const, status: 404, error: '会话不存在' }
      }
      const message = chatRepository.findMessageByIdInSession?.(normalizedSessionId, Number(msgId || 0))
      deleteAffectTideFromMessage(normalizedSessionId, msgId, 'referenced')
      chatRepository.deleteMessageBySession(msgId, normalizedSessionId)
      chatRepository.deletePromptLogsByMessageId(normalizedSessionId, Number(msgId || 0))
      chatRepository.deleteRecallActivityLogsByMessageId(normalizedSessionId, Number(msgId || 0), String(message?.role || ''))
      restoreProjectionCurtainBeforeMessage(normalizedSessionId, msgId)
      persistChatMutation()
      return { ok: true as const }
    },
    clearChatMessagesBySessionId(sessionId: string) {
      const normalizedSessionId = String(sessionId || '').trim()
      if (!chatRepository.getSessionById(normalizedSessionId)) {
        return { ok: false as const, status: 404, error: '会话不存在' }
      }
      chatRepository.clearMessagesBySessionId(normalizedSessionId)
      chatRepository.clearPromptLogsBySessionId(normalizedSessionId)
      chatRepository.clearRecallActivityLogsBySessionId(normalizedSessionId)
      persistChatMutation()
      return { ok: true as const }
    },
    clearChatSessionContextBySessionId(sessionId: string, payload: Record<string, any> = {}) {
      const normalizedSessionId = String(sessionId || '').trim()
      if (!chatRepository.getSessionById(normalizedSessionId)) {
        return { ok: false as const, status: 404, error: '会话不存在' }
      }
      if (typeof chatRepository.clearSessionContextById === 'function') {
        chatRepository.clearSessionContextById(normalizedSessionId, {
          clearSessionTemporaryCharacters: Boolean(payload?.clearSessionTemporaryCharacters)
        })
      } else {
        chatRepository.clearMessagesBySessionId(normalizedSessionId)
        chatRepository.clearPromptLogsBySessionId(normalizedSessionId)
        chatRepository.clearRecallActivityLogsBySessionId(normalizedSessionId)
      }
      persistChatMutation()
      return { ok: true as const, data: { ok: true, sessionId: normalizedSessionId } }
    },
    updateChatSessionById(sessionId: string, payload: Record<string, any>) {
      const normalizedSessionId = String(sessionId || '').trim()
      if (!chatRepository.getSessionById(normalizedSessionId)) {
        return { ok: false as const, status: 404, error: '会话不存在' }
      }
      const result = updateSessionFields(normalizedSessionId, payload || {})
      if (result.error) {
        return { ok: false as const, status: result.status || 400, error: result.error }
      }
      let participantsChanged = false
      if (Array.isArray(payload?.participants)) {
        const existingParticipants = chatRepository.listSessionParticipants?.(normalizedSessionId) || []
        const normalizedParticipants = materializeSessionParticipantBranches(normalizedSessionId, normalizeSessionParticipants(normalizedSessionId, {
          ...payload,
          targetId: payload?.targetId ?? payload?.target_id ?? normalizedSessionId
        }), existingParticipants)
        chatRepository.replaceSessionParticipants(normalizedSessionId, normalizedParticipants)
        participantsChanged = true
      }
      if (!result.changed && !participantsChanged) {
        return { ok: true as const, data: { ok: true, skipped: true } }
      }
      if (participantsChanged && !result.changed) persistChatMutation()
      return { ok: true as const, data: { ok: true } }
    },
    patchChatSessionCharacterState(sessionId: string, characterId: string, payload: Record<string, any>) {
      const normalizedSessionId = String(sessionId || '').trim()
      const normalizedCharacterId = String(characterId || '').trim()
      if (!chatRepository.getSessionById(normalizedSessionId)) {
        return { ok: false as const, status: 404, error: '会话不存在' }
      }
      const resolved = resolveSessionCharacterState(normalizedSessionId, normalizedCharacterId)
      if (resolved.mode !== 'independent_snapshot') {
        return { ok: false as const, status: 409, error: '跟随主真值的角色必须走正式角色更新入口' }
      }
      const changes = payload?.changes && typeof payload.changes === 'object' && !Array.isArray(payload.changes)
        ? payload.changes as Record<string, unknown>
        : {}
      if (!Object.keys(changes).length) return { ok: false as const, status: 400, error: '缺少角色状态变更' }
      const result = characterSnapshotService.patchSessionCharacterBranch(normalizedCharacterId, resolved.branchId, changes)
      persistChatMutation()
      return { ok: true as const, data: { character: result.character, branchId: resolved.branchId } }
    },
    deleteChatSessionById(sessionId: string) {
      const normalizedSessionId = String(sessionId || '').trim()
      if (!chatRepository.getSessionById(normalizedSessionId)) {
        return { ok: false as const, status: 404, error: '会话不存在' }
      }
      if (typeof chatRepository.deleteSessionTreeById === 'function') {
        chatRepository.deleteSessionTreeById(normalizedSessionId)
      } else {
        chatRepository.clearMessagesBySessionId(normalizedSessionId)
        chatRepository.clearPromptLogsBySessionId(normalizedSessionId)
        chatRepository.deleteSessionById(normalizedSessionId)
      }
      persistChatMutation()
      return { ok: true as const, data: { ok: true, sessionId: normalizedSessionId } }
    },
    deleteChatSessionsByIds(payload: Record<string, unknown>) {
      const sessionIds = Array.from(new Set(
        (Array.isArray(payload?.sessionIds) ? payload.sessionIds : [])
          .map((id) => String(id || '').trim())
          .filter(Boolean)
      ))
      if (!sessionIds.length) {
        return { ok: false as const, status: 400, error: '至少选择一条会话' }
      }
      if (sessionIds.length > 200) {
        return { ok: false as const, status: 400, error: '单次最多删除 200 条会话' }
      }
      const existingIds = new Set((chatRepository.getSessionsByIds(sessionIds) as Array<Record<string, unknown>>)
        .map((session) => String(session.id || '').trim())
        .filter(Boolean))
      const missingIds = sessionIds.filter((sessionId) => !existingIds.has(sessionId))
      if (missingIds.length) {
        return { ok: false as const, status: 404, error: `会话不存在：${missingIds.join('、')}` }
      }
      if (typeof chatRepository.deleteSessionTreesByIds === 'function') {
        chatRepository.deleteSessionTreesByIds(sessionIds)
      } else {
        sessionIds.forEach((sessionId) => chatRepository.deleteSessionTreeById(sessionId))
      }
      persistChatMutation()
      return { ok: true as const, data: { ok: true, sessionIds } }
    },
    listSessionTemporaryCharactersBySessionId(sessionId: string) {
      const normalizedSessionId = String(sessionId || '').trim()
      if (!chatRepository.getSessionById(normalizedSessionId)) {
        return { ok: false as const, status: 404, error: '会话不存在' }
      }
      const items = typeof chatRepository.listSessionTemporaryCharacters === 'function'
        ? chatRepository.listSessionTemporaryCharacters(normalizedSessionId)
        : []
      return { ok: true as const, data: { sessionId: normalizedSessionId, items } }
    },
    listSessionTemporaryEntitiesBySessionId(sessionId: string) {
      const normalizedSessionId = String(sessionId || '').trim()
      if (!chatRepository.getSessionById(normalizedSessionId)) {
        return { ok: false as const, status: 404, error: '会话不存在' }
      }
      const items = typeof chatRepository.listSessionTemporaryEntities === 'function'
        ? chatRepository.listSessionTemporaryEntities(normalizedSessionId)
        : []
      return { ok: true as const, data: { sessionId: normalizedSessionId, items } }
    },
    saveSessionTemporaryCharacterBySessionId(sessionId: string, payload: Record<string, any>) {
      const normalizedSessionId = String(sessionId || '').trim()
      if (!chatRepository.getSessionById(normalizedSessionId)) {
        return { ok: false as const, status: 404, error: '会话不存在' }
      }
      const name = String(payload?.name || '').trim()
      if (!name) {
        return { ok: false as const, status: 400, error: '临时角色名称不能为空' }
      }
      const requestedId = String(payload?.id || '').trim()
      const existing = requestedId && typeof chatRepository.findSessionTemporaryCharacterById === 'function'
        ? chatRepository.findSessionTemporaryCharacterById(normalizedSessionId, requestedId)
        : null
      const now = new Date().toISOString()
      const row = {
        id: requestedId || buildSessionTemporaryCharacterId(),
        sessionId: normalizedSessionId,
        name,
        aliasesJson: normalizeJsonList(payload?.aliases ?? payload?.aliasesJson ?? payload?.aliases_json),
        markdown: String(payload?.markdown || ''),
        sourceLedgerJson: normalizeJsonList(payload?.sourceLedger ?? payload?.sourceLedgerJson ?? payload?.source_ledger_json),
        lockedFieldsJson: normalizeJsonList(payload?.lockedFields ?? payload?.lockedFieldsJson ?? payload?.locked_fields_json),
        status: 'active',
        createdAt: String(existing?.createdAt ?? existing?.created_at ?? '') || now,
        updatedAt: now
      }
      chatRepository.upsertSessionTemporaryCharacter(row)
      persistChatMutation()
      const saved = typeof chatRepository.findSessionTemporaryCharacterById === 'function'
        ? chatRepository.findSessionTemporaryCharacterById(normalizedSessionId, row.id)
        : row
      return { ok: true as const, data: saved }
    },
    saveSessionTemporaryEntityBySessionId(sessionId: string, payload: Record<string, any>) {
      const normalizedSessionId = String(sessionId || '').trim()
      if (!chatRepository.getSessionById(normalizedSessionId)) {
        return { ok: false as const, status: 404, error: '会话不存在' }
      }
      const name = String(payload?.name || '').trim()
      if (!name) {
        return { ok: false as const, status: 400, error: '临时实体名称不能为空' }
      }
      const kind = String(payload?.kind || 'character').trim() || 'character'
      const requestedId = String(payload?.id || '').trim()
      const existing = requestedId && typeof chatRepository.findSessionTemporaryEntityById === 'function'
        ? chatRepository.findSessionTemporaryEntityById(normalizedSessionId, requestedId)
        : null
      const now = new Date().toISOString()
      const row = {
        id: requestedId || buildSessionTemporaryEntityId(kind),
        sessionId: normalizedSessionId,
        kind,
        name,
        aliasesJson: normalizeJsonList(payload?.aliases ?? payload?.aliasesJson ?? payload?.aliases_json),
        markdown: String(payload?.markdown || ''),
        tagsJson: normalizeJsonList(payload?.tags ?? payload?.tagsJson ?? payload?.tags_json),
        sourceLedgerJson: normalizeJsonList(payload?.sourceLedger ?? payload?.sourceLedgerJson ?? payload?.source_ledger_json),
        status: String(payload?.status || 'active').trim() || 'active',
        persistedTargetJson: jsonColumnText(payload?.persistedTarget ?? payload?.persistedTargetJson ?? payload?.persisted_target_json, {}),
        worldId: String((existing?.worldId ?? existing?.world_id ?? resolveStatusPanelWorldScope(normalizedSessionId).worldId) || '').trim(),
        createdAt: String(existing?.createdAt ?? existing?.created_at ?? '') || now,
        updatedAt: now
      }
      chatRepository.upsertSessionTemporaryEntity(row)
      // 批次4 融合：手动新建的临时实体也自动挂状态栏（只挂新的；编辑已有实体不重复挂）
      if (!existing) ensureStatusPanelForTemporaryEntity(normalizedSessionId, row)
      persistChatMutation()
      const saved = typeof chatRepository.findSessionTemporaryEntityById === 'function'
        ? chatRepository.findSessionTemporaryEntityById(normalizedSessionId, row.id)
        : row
      return { ok: true as const, data: saved }
    },
    deleteSessionTemporaryCharacterBySessionId(sessionId: string, characterId: string) {
      const normalizedSessionId = String(sessionId || '').trim()
      const normalizedCharacterId = String(characterId || '').trim()
      if (!chatRepository.getSessionById(normalizedSessionId)) {
        return { ok: false as const, status: 404, error: '会话不存在' }
      }
      if (!normalizedCharacterId) {
        return { ok: false as const, status: 400, error: '临时角色 id 不能为空' }
      }
      const deleted = typeof chatRepository.deleteSessionTemporaryCharacter === 'function'
        ? chatRepository.deleteSessionTemporaryCharacter(normalizedSessionId, normalizedCharacterId)
        : 0
      if (!deleted) {
        return { ok: false as const, status: 404, error: '临时角色不存在' }
      }
      persistChatMutation()
      return { ok: true as const, data: { ok: true, deletedId: normalizedCharacterId } }
    },
    deleteSessionTemporaryEntityBySessionId(sessionId: string, entityId: string) {
      const normalizedSessionId = String(sessionId || '').trim()
      const normalizedEntityId = String(entityId || '').trim()
      if (!chatRepository.getSessionById(normalizedSessionId)) {
        return { ok: false as const, status: 404, error: '会话不存在' }
      }
      if (!normalizedEntityId) {
        return { ok: false as const, status: 400, error: '临时实体 id 不能为空' }
      }
      const deleted = typeof chatRepository.deleteSessionTemporaryEntity === 'function'
        ? chatRepository.deleteSessionTemporaryEntity(normalizedSessionId, normalizedEntityId)
        : 0
      if (!deleted) {
        return { ok: false as const, status: 404, error: '临时实体不存在' }
      }
      persistChatMutation()
      return { ok: true as const, data: { ok: true, deletedId: normalizedEntityId } }
    },
    // ── 世界（跨会话共享一等实体·地图系统批2）────────────────────
    listWorlds() {
      const items = typeof chatRepository.listWorlds === 'function' ? chatRepository.listWorlds() : []
      const counts = typeof chatRepository.listWorldSessionCounts === 'function' ? chatRepository.listWorldSessionCounts() : []
      const countByWorldId = new Map<string, number>(
        (counts as Array<{ worldId?: string; total?: number }>).map((row) => [String(row?.worldId || ''), Number(row?.total || 0)])
      )
      // 图纸计数（星依世界寻址批·2026-07-13）：独立 GROUP BY 子查询，同 sessionCount 同一套拼装口径。
      const sheetCounts = typeof chatRepository.listWorldMapSheetCounts === 'function' ? chatRepository.listWorldMapSheetCounts() : []
      const sheetCountByWorldId = new Map<string, number>(
        (sheetCounts as Array<{ worldId?: string; total?: number }>).map((row) => [String(row?.worldId || ''), Number(row?.total || 0)])
      )
      return {
        ok: true as const,
        data: {
          items: (items as Array<Record<string, any>>).map((item) => ({
            ...item,
            sessionCount: countByWorldId.get(String(item?.id || '')) || 0,
            mapSheetCount: sheetCountByWorldId.get(String(item?.id || '')) || 0
          }))
        }
      }
    },
    createWorld(payload: Record<string, any>) {
      const created = createWorldCore(payload || {})
      if (!created.ok) return created
      persistChatMutation()
      return { ok: true as const, data: created.world }
    },
    // ── 世界 CRUD 补全（世界管理页 P1）────────────────────────────
    // 改名/改简介/默认图纸；默认图纸只可指向本世界有效图纸。
    updateWorldById(worldId: string, payload: Record<string, any>) {
      const normalizedWorldId = String(worldId || '').trim()
      const world = typeof chatRepository.findWorldById === 'function'
        ? chatRepository.findWorldById(normalizedWorldId)
        : null
      if (!world) {
        return { ok: false as const, status: 404, error: '世界不存在' }
      }
      const validated = validateWorldNameDescription({
        name: payload?.name ?? world.name,
        description: payload?.description ?? world.description
      })
      if (!validated.ok) {
        return { ok: false as const, status: validated.status, error: validated.error }
      }
      if (typeof chatRepository.updateWorld !== 'function') {
        return { ok: false as const, status: 500, error: '当前仓储不支持更新世界' }
      }
      const hasDefaultSheetWrite = Object.prototype.hasOwnProperty.call(payload || {}, 'defaultMapSheetId')
        || Object.prototype.hasOwnProperty.call(payload || {}, 'default_map_sheet_id')
      const requestedDefaultSheetId = hasDefaultSheetWrite
        ? String(payload?.defaultMapSheetId ?? payload?.default_map_sheet_id ?? '').trim()
        : ''
      if (requestedDefaultSheetId) {
        const sheet = typeof chatRepository.findMapSheetById === 'function'
          ? chatRepository.findMapSheetById(requestedDefaultSheetId) as Record<string, any> | null
          : null
        if (!sheet || String(sheet.worldId ?? sheet.world_id ?? '') !== normalizedWorldId) {
          return { ok: false as const, status: 400, error: '默认图纸不属于该世界' }
        }
      }
      const now = new Date().toISOString()
      chatRepository.updateWorld(normalizedWorldId, { name: validated.name, description: validated.description, updatedAt: now })
      if (hasDefaultSheetWrite) {
        if (typeof chatRepository.setWorldDefaultMapSheet === 'function') {
          chatRepository.setWorldDefaultMapSheet(normalizedWorldId, requestedDefaultSheetId, now)
        }
      }
      const saved = typeof chatRepository.findWorldById === 'function'
        ? chatRepository.findWorldById(normalizedWorldId)
        : null
      const mapContext = resolveWorldMapContext(normalizedWorldId)
      persistChatMutation()
      return {
        ok: true as const,
        data: {
          world: {
            ...(saved || { ...world, name: validated.name, description: validated.description, updatedAt: now }),
            defaultMapSheetId: mapContext.defaultSheetId
          }
        }
      }
    },
    // 软删：护栏①地图 ②世界级状态面板 ③叙事种子，命中任一 409（{reason, count}）；
    // 通过后：挂载会话全部解绑 + 清挂载的文档库行 + 软删 world + persist
    deleteWorldById(worldId: string) {
      const normalizedWorldId = String(worldId || '').trim()
      const world = typeof chatRepository.findWorldById === 'function'
        ? chatRepository.findWorldById(normalizedWorldId)
        : null
      if (!world) {
        return { ok: false as const, status: 404, error: '世界不存在' }
      }
      const mapCount = typeof chatRepository.countMapSheetsByWorldId === 'function'
        ? Number(chatRepository.countMapSheetsByWorldId(normalizedWorldId) || 0)
        : 0
      if (mapCount > 0) {
        return { ok: false as const, status: 409, error: '世界下还有地图图纸，请先清空地图再删除世界', reason: 'maps' as const, count: mapCount }
      }
      const statusPanelCount = typeof chatRepository.countStatusPanelsByWorldId === 'function'
        ? Number(chatRepository.countStatusPanelsByWorldId(normalizedWorldId) || 0)
        : 0
      if (statusPanelCount > 0) {
        return { ok: false as const, status: 409, error: '世界下还有世界级状态面板，请先清空再删除世界', reason: 'statusPanels' as const, count: statusPanelCount }
      }
      const narrativeSeedCount = typeof chatRepository.countNarrativeSeedsByWorldId === 'function'
        ? Number(chatRepository.countNarrativeSeedsByWorldId(normalizedWorldId) || 0)
        : 0
      if (narrativeSeedCount > 0) {
        return { ok: false as const, status: 409, error: '世界下还有叙事种子，请先迁移或清空剧本账本再删除世界', reason: 'narrativeSeeds' as const, count: narrativeSeedCount }
      }
      const worldEntityCount = typeof chatRepository.countWorldEntitiesByWorldId === 'function'
        ? Number(chatRepository.countWorldEntitiesByWorldId(normalizedWorldId) || 0)
        : 0
      if (worldEntityCount > 0) {
        return { ok: false as const, status: 409, error: '世界下还有状态实体，请先迁移或清空世界实体再删除世界', reason: 'worldEntities' as const, count: worldEntityCount }
      }
      const detachedSessionCount = typeof chatRepository.detachSessionsFromWorld === 'function'
        ? Number(chatRepository.detachSessionsFromWorld(normalizedWorldId) || 0)
        : 0
      if (typeof chatRepository.replaceWorldDocLinks === 'function') {
        chatRepository.replaceWorldDocLinks(normalizedWorldId, [])
      }
      if (typeof chatRepository.softDeleteWorld === 'function') {
        chatRepository.softDeleteWorld(normalizedWorldId, new Date().toISOString())
      }
      persistChatMutation()
      return { ok: true as const, data: { detachedSessionCount } }
    },
    // 详情：地图（id/name）+ 挂载会话（id/name）+ 出场角色 id 去重集合（仅 participant_type='char'，
    // 群聊成员不展开，P1 明确限制）+ 挂载文档 id 列表
    getWorldDetailById(worldId: string) {
      const normalizedWorldId = String(worldId || '').trim()
      const world = typeof chatRepository.findWorldById === 'function'
        ? chatRepository.findWorldById(normalizedWorldId)
        : null
      if (!world) {
        return { ok: false as const, status: 404, error: '世界不存在' }
      }
      const sheets = typeof chatRepository.listMapSheets === 'function'
        ? chatRepository.listMapSheets(normalizedWorldId)
        : []
      const defaultMapSheetId = resolveWorldMapContext(normalizedWorldId).defaultSheetId
      const maps = (sheets as Array<Record<string, any>>).map((sheet) => {
        const projected = projectMapSheetRow(sheet)
        return { id: projected.id, name: projected.name }
      })
      const sessionRows = (typeof chatRepository.listSessionsByWorldId === 'function'
        ? chatRepository.listSessionsByWorldId(normalizedWorldId)
        : []) as Array<Record<string, any>>
      const sessions = sessionRows.map((row) => ({
        id: toText(row?.id),
        name: toText(row?.title)
      }))
      const characterIdSet = new Set<string>()
      const sessionIds = sessionRows.map((session) => toText(session?.id)).filter(Boolean)
      const participants = chatRepository.listSessionParticipantsBySessionIds(sessionIds)
      ;(participants as Array<Record<string, any>>).forEach((participant) => {
          const participantType = toText(participant?.participantType ?? participant?.participant_type)
          if (participantType !== 'char') return
          const participantTargetId = toText(participant?.participantTargetId ?? participant?.participant_target_id)
          if (participantTargetId) characterIdSet.add(participantTargetId)
        })
      const docLinks = typeof chatRepository.listWorldDocLinks === 'function'
        ? chatRepository.listWorldDocLinks(normalizedWorldId)
        : []
      const entities = typeof chatRepository.listWorldEntities === 'function'
        ? chatRepository.listWorldEntities(normalizedWorldId)
        : []
      return {
        ok: true as const,
        data: {
          world: { ...world, defaultMapSheetId },
          defaultMapSheetId,
          maps,
          sessions,
          characterIds: [...characterIdSet],
          docLinks,
          entities
        }
      }
    },
    // 全量替换世界挂文档库：快照式 documentId 列表，去重、上限 500
    replaceWorldDocLinksById(worldId: string, payload: Record<string, any>) {
      const normalizedWorldId = String(worldId || '').trim()
      const world = typeof chatRepository.findWorldById === 'function'
        ? chatRepository.findWorldById(normalizedWorldId)
        : null
      if (!world) {
        return { ok: false as const, status: 404, error: '世界不存在' }
      }
      const rawIds = Array.isArray(payload?.documentIds) ? payload.documentIds : []
      const documentIds = [...new Set(rawIds.map((id: unknown) => toText(id)).filter(Boolean))]
      if (documentIds.length > 500) {
        return { ok: false as const, status: 400, error: '挂载文档数量超过上限（最多 500 个）' }
      }
      const now = new Date().toISOString()
      if (typeof chatRepository.replaceWorldDocLinks === 'function') {
        chatRepository.replaceWorldDocLinks(normalizedWorldId, documentIds.map((documentId) => ({ documentId, createdAt: now })))
      }
      persistChatMutation()
      return { ok: true as const, data: { documentIds } }
    },
    listWorldEntitiesByWorldId(worldId: string) {
      const normalizedWorldId = String(worldId || '').trim()
      if (!chatRepository.findWorldById?.(normalizedWorldId)) {
        return { ok: false as const, status: 404, error: '世界不存在' }
      }
      const items = typeof chatRepository.listWorldEntities === 'function'
        ? chatRepository.listWorldEntities(normalizedWorldId)
        : []
      return { ok: true as const, data: { worldId: normalizedWorldId, items } }
    },
    saveWorldEntityByWorldId(worldId: string, payload: Record<string, any>) {
      const normalizedWorldId = String(worldId || '').trim()
      if (!chatRepository.findWorldById?.(normalizedWorldId)) {
        return { ok: false as const, status: 404, error: '世界不存在' }
      }
      const requestedId = String(payload?.id || '').trim()
      const existing = requestedId && typeof chatRepository.findWorldEntityById === 'function'
        ? chatRepository.findWorldEntityById(normalizedWorldId, requestedId)
        : null
      if (requestedId && !existing) return { ok: false as const, status: 404, error: '世界实体不存在' }
      if (existing) {
        const expectedVersion = Number(payload?.expectedVersion ?? payload?.version)
        if (!Number.isInteger(expectedVersion) || expectedVersion !== Number(existing.version || 0)) {
          return { ok: false as const, status: 409, error: '世界实体版本冲突，请重读后再提交', details: { currentVersion: Number(existing.version || 0) } }
        }
      }
      const allowedKinds = new Set(['organization', 'item', 'location', 'building', 'region', 'other'])
      const kind = String(payload?.kind ?? existing?.kind ?? '').trim()
      if (!allowedKinds.has(kind)) {
        return { ok: false as const, status: 400, error: '世界实体 kind 必须是 organization/item/location/building/region/other' }
      }
      const name = String(payload?.name ?? existing?.name ?? '').trim()
      if (!name) return { ok: false as const, status: 400, error: '世界实体名称不能为空' }
      if (name.length > 100) return { ok: false as const, status: 400, error: '世界实体名称过长（最多 100 字）' }
      let mapSheetId = String(payload?.mapSheetId ?? payload?.map_sheet_id ?? existing?.mapSheetId ?? existing?.map_sheet_id ?? '').trim()
      const mapFeatureId = String(payload?.mapFeatureId ?? payload?.map_feature_id ?? existing?.mapFeatureId ?? existing?.map_feature_id ?? '').trim()
      if (mapFeatureId) {
        const feature = chatRepository.findMapFeatureById?.(mapFeatureId, normalizedWorldId)
        if (!feature) return { ok: false as const, status: 400, error: '地图要素不属于该世界' }
        const featureSheetId = String(feature.sheetId ?? feature.sheet_id ?? '').trim()
        if (mapSheetId && mapSheetId !== featureSheetId) {
          return { ok: false as const, status: 400, error: '地图要素不属于所选图纸' }
        }
        mapSheetId = featureSheetId
      } else if (mapSheetId) {
        const sheet = chatRepository.findMapSheetById?.(mapSheetId)
        if (!sheet || String(sheet.worldId ?? sheet.world_id ?? '').trim() !== normalizedWorldId) {
          return { ok: false as const, status: 400, error: '地图图纸不属于该世界' }
        }
      }
      const now = new Date().toISOString()
      const row = {
        id: requestedId || buildWorldEntityId(kind),
        worldId: normalizedWorldId,
        kind,
        name,
        aliasesJson: normalizeJsonList(payload?.aliases ?? payload?.aliasesJson ?? payload?.aliases_json ?? existing?.aliasesJson ?? existing?.aliases_json),
        markdown: String(payload?.markdown ?? existing?.markdown ?? ''),
        tagsJson: normalizeJsonList(payload?.tags ?? payload?.tagsJson ?? payload?.tags_json ?? existing?.tagsJson ?? existing?.tags_json),
        sourceLedgerJson: normalizeJsonList(payload?.sourceLedger ?? payload?.sourceLedgerJson ?? payload?.source_ledger_json ?? existing?.sourceLedgerJson ?? existing?.source_ledger_json),
        mapSheetId,
        mapFeatureId,
        status: 'active',
        version: Number(existing?.version || 0) + 1,
        createdAt: String(existing?.createdAt ?? existing?.created_at ?? '') || now,
        updatedAt: now
      }
      chatRepository.upsertWorldEntity(row)
      persistChatMutation()
      const saved = chatRepository.findWorldEntityById?.(normalizedWorldId, row.id) || row
      return { ok: true as const, data: saved }
    },
    deleteWorldEntityByWorldId(worldId: string, entityId: string) {
      const normalizedWorldId = String(worldId || '').trim()
      const normalizedEntityId = String(entityId || '').trim()
      if (!chatRepository.findWorldById?.(normalizedWorldId)) {
        return { ok: false as const, status: 404, error: '世界不存在' }
      }
      const now = new Date().toISOString()
      const entity = chatRepository.findWorldEntityById?.(normalizedWorldId, normalizedEntityId)
      if (!entity) return { ok: false as const, status: 404, error: '世界实体不存在' }
      chatRepository.softDeleteStatusPanelsByHost?.(normalizedWorldId, 'world_entity', normalizedEntityId, now)
      const deleted = chatRepository.softDeleteWorldEntity?.(normalizedWorldId, normalizedEntityId, now) || 0
      if (!deleted) return { ok: false as const, status: 404, error: '世界实体不存在' }
      persistChatMutation()
      return { ok: true as const, data: { ok: true, deletedId: normalizedEntityId } }
    },
    // 会话挂世界唯一入口（含世界存在校验；world_id 不进 buildSessionPatch 白名单，通用 PUT 改不到它）：
    // worldId 非空=挂已有；detach=true=解绑；否则用 name 一键创建新世界并挂上（原子完成）
    attachWorldToSessionBySessionId(sessionId: string, payload: Record<string, any>) {
      const normalizedSessionId = String(sessionId || '').trim()
      const existingSession = chatRepository.getSessionById(normalizedSessionId) as Record<string, any> | null
      if (!existingSession) {
        return { ok: false as const, status: 404, error: '会话不存在' }
      }
      // P4-3：状态栏一旦归世界就是世界资产，不再跟创建来源会话跨世界搬迁。
      // 只有无世界→首次挂世界时，把本会话仍为 local 的遗留模板/实例一次性升格。
      const oldWorldId = String(existingSession.world_id ?? existingSession.worldId ?? '').trim()
      const promoteLocalStatusPanels = (toWorldId: string) => {
        if (oldWorldId || !toWorldId) return
        chatRepository.assignWorldToSessionStatusPanels?.(normalizedSessionId, toWorldId)
      }
      if (payload?.detach === true) {
        chatRepository.updateSessionById(normalizedSessionId, { world_id: '' })
        persistChatMutation()
        return {
          ok: true as const,
          data: {
            sessionId: normalizedSessionId,
            world: null,
            session: toWorldScopedChatSessionTransport(chatRepository.getSessionById(normalizedSessionId))
          }
        }
      }
      const requestedWorldId = String(payload?.worldId ?? payload?.world_id ?? '').trim()
      let world: Record<string, any> | null = null
      if (requestedWorldId) {
        world = typeof chatRepository.findWorldById === 'function'
          ? chatRepository.findWorldById(requestedWorldId)
          : null
        if (!world) {
          return { ok: false as const, status: 404, error: '世界不存在' }
        }
      } else {
        const created = createWorldCore(payload || {})
        if (!created.ok) return created
        world = created.world
      }
      const newWorldId = String(world?.id || '')
      const attachFields: Record<string, unknown> = { world_id: newWorldId }
      if (!oldWorldId
        && !String(existingSession.virtualSceneWorldId ?? existingSession.virtual_scene_world_id ?? '').trim()
        && sessionHasCurtainContent(existingSession)) {
        attachFields.virtual_scene_world_id = newWorldId
      }
      chatRepository.updateSessionById(normalizedSessionId, attachFields)
      promoteLocalStatusPanels(newWorldId)
      persistChatMutation()
      return {
        ok: true as const,
        data: {
          sessionId: normalizedSessionId,
          world,
          session: toWorldScopedChatSessionTransport(chatRepository.getSessionById(normalizedSessionId))
        }
      }
    },
    // 「并入世界」（批3·语义仿临时实体转正迁移）：把本会话全部会话级状态栏（模板+实例）升为世界级，
    // 整套一起并（部分并入会造成 ref 悬空/实例缺模板）；session_id 保留为创建来源。幂等：没有遗留时返回 0。
    mergeSessionStatusPanelsIntoWorld(sessionId: string) {
      const normalizedSessionId = String(sessionId || '').trim()
      const { session, worldId } = resolveStatusPanelWorldScope(normalizedSessionId)
      if (!session) {
        return { ok: false as const, status: 404, error: '会话不存在' }
      }
      if (!worldId) {
        return { ok: false as const, status: 400, error: '会话还没有加入世界，先在舆图弹窗里创建或选择世界' }
      }
      if (typeof chatRepository.assignWorldToSessionStatusPanels !== 'function') {
        return { ok: false as const, status: 500, error: '当前仓储不支持状态栏并入世界' }
      }
      const moved = chatRepository.assignWorldToSessionStatusPanels(normalizedSessionId, worldId)
      persistChatMutation()
      return {
        ok: true as const,
        data: {
          sessionId: normalizedSessionId,
          worldId,
          mergedTemplates: Number(moved?.templates || 0),
          mergedPanels: Number(moved?.panels || 0)
        }
      }
    },
    // ── 地图数据骨架（地图系统批4）：图纸+要素只挂世界（无双轨·会话没世界就没有地图）；
    // 写面（存图纸/批量存要素/删要素）为批5 绘舆工具与手插样例数据共用，读面（bundle）为弹窗与绘舆读图共用 ──
    getWorldMapBundle(worldId: string) {
      const normalizedWorldId = String(worldId || '').trim()
      const world = typeof chatRepository.findWorldById === 'function'
        ? chatRepository.findWorldById(normalizedWorldId)
        : null
      if (!world) {
        return { ok: false as const, status: 404, error: '世界不存在' }
      }
      const sheets = (typeof chatRepository.listMapSheets === 'function'
        ? chatRepository.listMapSheets(normalizedWorldId)
        : []).map(projectMapSheetRow)
      const defaultMapSheetId = resolveWorldMapContext(normalizedWorldId).defaultSheetId
      const features = (typeof chatRepository.listMapFeaturesByWorld === 'function'
        ? chatRepository.listMapFeaturesByWorld(normalizedWorldId)
        : []).map(projectMapFeatureRow)
      const featuresBySheet = new Map<string, Array<ReturnType<typeof projectMapFeatureRow>>>()
      for (const feature of features) {
        const list = featuresBySheet.get(feature.sheetId) || []
        list.push(feature)
        featuresBySheet.set(feature.sheetId, list)
      }
      return {
        ok: true as const,
        data: {
          world: { ...world, defaultMapSheetId },
          defaultMapSheetId,
          sheets: sheets.map((sheet: ReturnType<typeof projectMapSheetRow>) => ({
            ...sheet,
            features: featuresBySheet.get(sheet.id) || []
          }))
        }
      }
    },
    // 存图纸：不带 id=新建（name 必填）；带 id=更新既有（名称/探索范围增量改，explored 键缺省=保留原值、null=清空）
    saveWorldMapSheet(worldId: string, payload: Record<string, any>) {
      const normalizedWorldId = String(worldId || '').trim()
      const world = typeof chatRepository.findWorldById === 'function'
        ? chatRepository.findWorldById(normalizedWorldId)
        : null
      if (!world) {
        return { ok: false as const, status: 404, error: '世界不存在' }
      }
      const sheetId = String(payload?.id || '').trim()
      const existing = sheetId && typeof chatRepository.findMapSheetById === 'function'
        ? chatRepository.findMapSheetById(sheetId)
        : null
      if (sheetId && !existing) {
        return { ok: false as const, status: 404, error: '图纸不存在' }
      }
      if (existing && String(existing.worldId ?? existing.world_id ?? '') !== normalizedWorldId) {
        return { ok: false as const, status: 400, error: '图纸不属于该世界' }
      }
      const name = String(payload?.name ?? existing?.name ?? '').trim()
      if (!name) {
        return { ok: false as const, status: 400, error: '图纸名称不能为空' }
      }
      if (name.length > 50) {
        return { ok: false as const, status: 400, error: '图纸名称过长（最多 50 字）' }
      }
      let exploredJson = mapJsonColumnText(existing?.exploredJson ?? existing?.explored_json)
      if (payload && Object.prototype.hasOwnProperty.call(payload, 'explored')) {
        if (payload.explored === null || payload.explored === '') {
          exploredJson = ''
        } else {
          const exploredPts = sanitizeMapPoints(parseJsonObject(payload.explored)?.pts, 3)
          if (!exploredPts) {
            return { ok: false as const, status: 400, error: 'explored.pts 必须是至少 3 个 [x,y] 数值点' }
          }
          exploredJson = JSON.stringify({ pts: exploredPts })
        }
      }
      const now = new Date().toISOString()
      const row = {
        id: existing ? sheetId : buildMapSheetId(),
        worldId: normalizedWorldId,
        name,
        exploredJson,
        status: 'active',
        createdAt: String(existing?.createdAt ?? existing?.created_at ?? now),
        updatedAt: now
      }
      chatRepository.upsertMapSheet(row)
      const mapContext = resolveWorldMapContext(normalizedWorldId)
      if (mapContext.defaultSheetId
        && String(mapContext.world?.defaultMapSheetId ?? mapContext.world?.default_map_sheet_id ?? '') !== mapContext.defaultSheetId
        && typeof chatRepository.setWorldDefaultMapSheet === 'function') {
        chatRepository.setWorldDefaultMapSheet(normalizedWorldId, mapContext.defaultSheetId, now)
      }
      persistChatMutation()
      return { ok: true as const, data: projectMapSheetRow(row) }
    },
    // 批量存要素（绘舆一次交稿多要素）：全部条目校验通过才统一落库，避免半截写入；
    // 带 id 且存在=增量更新（缺省字段继承原行），带 id 不存在=用该 id 新建（语义 id 如 mt-xuanyue），不带 id=生成
    saveWorldMapFeatures(worldId: string, payload: Record<string, any>) {
      const normalizedWorldId = String(worldId || '').trim()
      const world = typeof chatRepository.findWorldById === 'function'
        ? chatRepository.findWorldById(normalizedWorldId)
        : null
      if (!world) {
        return { ok: false as const, status: 404, error: '世界不存在' }
      }
      const items = Array.isArray(payload?.items) ? payload.items : []
      if (!items.length) {
        return { ok: false as const, status: 400, error: 'items 不能为空' }
      }
      const sheetIds = new Set(
        (typeof chatRepository.listMapSheets === 'function'
          ? chatRepository.listMapSheets(normalizedWorldId)
          : []).map((sheet: Record<string, any>) => String(sheet?.id || ''))
      )
      const kindMinPts: Record<string, number> = { region: 3, path: 2, marker: 1 }
      const now = new Date().toISOString()
      const rows: Array<Record<string, any>> = []
      // 版本历史（批L）：逐条记 op——带 id 且存在=update，其余（不带 id/带 id 不存在的语义 id 新建）=add
      const rowOps: Array<'add' | 'update'> = []
      for (let index = 0; index < items.length; index++) {
        const item = items[index] as Record<string, any>
        const at = `items[${index}]`
        const featureId = String(item?.id || '').trim()
        const existing = featureId && typeof chatRepository.findMapFeatureById === 'function'
          ? chatRepository.findMapFeatureById(featureId, normalizedWorldId)
          : null
        const sheetId = String(item?.sheetId ?? item?.sheet_id ?? existing?.sheetId ?? existing?.sheet_id ?? '').trim()
        if (!sheetIds.has(sheetId)) {
          return { ok: false as const, status: 400, error: `${at}: sheetId 不存在于该世界` }
        }
        const kind = String(item?.kind ?? existing?.kind ?? '').trim()
        if (!kindMinPts[kind]) {
          return { ok: false as const, status: 400, error: `${at}: kind 必须是 region/path/marker` }
        }
        const layer = String(item?.layer ?? existing?.layer ?? 'terrain').trim()
        if (layer !== 'terrain' && layer !== 'civic') {
          return { ok: false as const, status: 400, error: `${at}: layer 必须是 terrain/civic` }
        }
        const name = String(item?.name ?? existing?.name ?? '').trim()
        if (!name) {
          return { ok: false as const, status: 400, error: `${at}: name 不能为空` }
        }
        let geometryJson = mapJsonColumnText(existing?.geometryJson ?? existing?.geometry_json)
        if (item && Object.prototype.hasOwnProperty.call(item, 'geometry')) {
          const geometry = parseJsonObject(item.geometry)
          const pts = sanitizeMapPoints(geometry?.pts, kindMinPts[kind])
          if (!pts) {
            return { ok: false as const, status: 400, error: `${at}: geometry.pts 至少需要 ${kindMinPts[kind]} 个 [x,y] 数值点` }
          }
          const spine = sanitizeMapPoints(geometry?.spine, 2)
          // 海拔真值（地图视觉大改批1）：region 的物理海拔米数，schemaless 透传；非法/未给不写入（渲染端按类目缺省表兜底）
          const elevationRaw = Number(geometry?.elevationM)
          const elevationM = Number.isFinite(elevationRaw) ? elevationRaw : undefined
          geometryJson = JSON.stringify({
            ...(spine ? { pts, spine } : { pts }),
            ...(elevationM !== undefined ? { elevationM } : {})
          })
        }
        if (!geometryJson) {
          return { ok: false as const, status: 400, error: `${at}: 新建要素必须带 geometry` }
        }
        const pickJson = (key: string, fallback: unknown) => {
          if (item && Object.prototype.hasOwnProperty.call(item, key)) {
            const parsed = parseJsonObject(item[key])
            return Object.keys(parsed).length ? JSON.stringify(parsed) : ''
          }
          return mapJsonColumnText(fallback)
        }
        rows.push({
          id: existing ? featureId : (featureId || buildMapFeatureId()),
          sheetId,
          worldId: normalizedWorldId,
          kind,
          category: String(item?.category ?? existing?.category ?? '').trim(),
          name,
          layer,
          geometryJson,
          styleJson: pickJson('style', existing?.styleJson ?? existing?.style_json),
          linksJson: pickJson('links', existing?.linksJson ?? existing?.links_json),
          metaJson: pickJson('meta', existing?.metaJson ?? existing?.meta_json),
          status: 'active',
          createdAt: String(existing?.createdAt ?? existing?.created_at ?? now),
          updatedAt: now
        })
        rowOps.push(existing ? 'update' : 'add')
      }
      rows.forEach((row) => chatRepository.upsertMapFeature(row))
      // 版本历史（批L）：整批落库成功后逐条记日志（snapshot=操作后快照）+ 修剪到最近 500 行
      appendMapChangeLog(
        normalizedWorldId,
        normalizeMapRunMeta(payload?.runMeta),
        rows.map((row, index) => ({ op: rowOps[index], featureId: String(row.id), snapshot: projectMapFeatureRow(row) }))
      )
      persistChatMutation()
      return {
        ok: true as const,
        data: { worldId: normalizedWorldId, saved: rows.length, items: rows.map(projectMapFeatureRow) }
      }
    },
    deleteWorldMapFeature(worldId: string, featureId: string, runMeta?: Record<string, any>) {
      const normalizedWorldId = String(worldId || '').trim()
      const normalizedFeatureId = String(featureId || '').trim()
      const world = typeof chatRepository.findWorldById === 'function'
        ? chatRepository.findWorldById(normalizedWorldId)
        : null
      if (!world) {
        return { ok: false as const, status: 404, error: '世界不存在' }
      }
      if (!normalizedFeatureId) {
        return { ok: false as const, status: 400, error: '要素 id 不能为空' }
      }
      // 版本历史（批L）：删除前先取最后快照——软删后 findMapFeatureById 过滤 deleted 行就取不到了
      const lastSnapshotRow = typeof chatRepository.findMapFeatureById === 'function'
        ? chatRepository.findMapFeatureById(normalizedFeatureId, normalizedWorldId)
        : null
      const deleted = typeof chatRepository.deleteMapFeature === 'function'
        ? chatRepository.deleteMapFeature(normalizedFeatureId, normalizedWorldId)
        : 0
      if (!deleted) {
        return { ok: false as const, status: 404, error: '要素不存在' }
      }
      appendMapChangeLog(normalizedWorldId, normalizeMapRunMeta(runMeta), [{
        op: 'delete',
        featureId: normalizedFeatureId,
        snapshot: lastSnapshotRow ? projectMapFeatureRow(lastSnapshotRow) : {}
      }])
      persistChatMutation()
      return { ok: true as const, data: { ok: true, deletedId: normalizedFeatureId } }
    },
    /** 地图版本历史查询（批L）：按 run 分组（相邻同 run_key 归组·时间倒序），最多最近 50 组。
     *  items 内 snapshot 已 parse 成对象（前端对照模式直接拿几何画幽灵轮廓）。 */
    getWorldMapChangeLog(worldId: string) {
      const normalizedWorldId = String(worldId || '').trim()
      const world = typeof chatRepository.findWorldById === 'function'
        ? chatRepository.findWorldById(normalizedWorldId)
        : null
      if (!world) {
        return { ok: false as const, status: 404, error: '世界不存在' }
      }
      const rows = typeof chatRepository.listMapChangeLog === 'function'
        ? chatRepository.listMapChangeLog(normalizedWorldId, 500)
        : []
      type LogGroup = {
        groupId: string
        runKey: string
        runLabel: string
        startedAt: string
        endedAt: string
        counts: { add: number; update: number; delete: number }
        items: Array<Record<string, any>>
      }
      const groups: LogGroup[] = []
      for (const raw of rows as Array<Record<string, any>>) {
        const runKey = String(raw?.runKey ?? raw?.run_key ?? '').trim() || 'manual'
        const runLabel = String(raw?.runLabel ?? raw?.run_label ?? '').trim()
        const op = String(raw?.op || '').trim()
        const createdAt = String(raw?.createdAt ?? raw?.created_at ?? '')
        const item = {
          id: String(raw?.id || ''),
          op,
          featureId: String(raw?.featureId ?? raw?.feature_id ?? ''),
          snapshot: parseJsonObject(raw?.snapshotJson ?? raw?.snapshot_json),
          createdAt
        }
        const last = groups[groups.length - 1]
        // rows 时间倒序：相邻同 runKey 归同组（'manual' 也按相邻性分段，不会把相隔多天的散修并成一组）；
        // 组数已到 50 时仍允许并入第 50 组（补全该组明细），只禁止再开新组
        if (last && last.runKey === runKey) {
          last.items.push(item)
          if (!last.runLabel && runLabel) last.runLabel = runLabel
          last.startedAt = createdAt // 倒序遍历中越靠后越早
          if (op === 'add' || op === 'update' || op === 'delete') last.counts[op] += 1
          continue
        }
        if (groups.length >= 50) break
        groups.push({
          groupId: item.id,
          runKey,
          runLabel,
          startedAt: createdAt,
          endedAt: createdAt,
          counts: { add: op === 'add' ? 1 : 0, update: op === 'update' ? 1 : 0, delete: op === 'delete' ? 1 : 0 },
          items: [item]
        })
      }
      return { ok: true as const, data: { worldId: normalizedWorldId, groups } }
    },
    // ── 状态栏积木（模板 + 实例）────────────────────────────────
    // 归属双轨（地图系统批3）：每个函数经 resolveStatusPanelWorldScope 解析归属后把 worldId 传进 repository，
    // 挂世界会话读写世界级（跨会话共享），未挂会话保持会话级；HTTP 契约与工具签名零变化。
    listStatusAssetsBySessionId(sessionId: string) {
      const normalizedSessionId = String(sessionId || '').trim()
      const { session, worldId } = resolveStatusPanelWorldScope(normalizedSessionId)
      if (!session) return { ok: false as const, status: 404, error: '会话不存在' }
      const items = chatRepository.listStatusAssets?.(normalizedSessionId, worldId) || []
      return { ok: true as const, data: { sessionId: normalizedSessionId, worldId, items } }
    },
    listStatusAssetPublishTargets() {
      const sessions = chatRepository.getAllSessions?.() || []
      const templates = chatRepository.getAllStatusPanelTemplates?.() || []
      const panels = chatRepository.getAllStatusPanels?.() || []
      const sessionNames = new Map(sessions.map((item: any) => [String(item?.id || ''), String(item?.title || item?.name || item?.id || '')]))
      const templateMap = new Map(templates.map((item: any) => [String(item?.id || ''), item]))
      const items = panels.flatMap((panel: any) => {
        if (String(panel?.status || 'active') === 'deleted') return []
        const template = templateMap.get(String(panel?.templateId ?? panel?.template_id ?? ''))
        const fields = resolveStatusPanelFieldsOf(panel, template)
        return fields
          .filter((field) => String(field?.valueType || '') === 'asset')
          .map((field) => ({
            sessionId: String(panel?.sessionId ?? panel?.session_id ?? ''),
            panelId: String(panel?.id || ''),
            fieldKey: String(field?.key || ''),
            label: `${sessionNames.get(String(panel?.sessionId ?? panel?.session_id ?? '')) || '未命名会话'} / ${String(panel?.name || '')} / ${String(field?.label || field?.key || '')}`
          }))
      }).filter((item: any) => item.sessionId && item.panelId && item.fieldKey)
      return { ok: true as const, data: { items } }
    },
    createStatusAssetBySessionId(sessionId: string, payload: Record<string, any>) {
      const normalizedSessionId = String(sessionId || '').trim()
      const { session, worldId } = resolveStatusPanelWorldScope(normalizedSessionId)
      if (!session) return { ok: false as const, status: 404, error: '会话不存在' }
      const alt = String(payload?.alt || '').trim()
      if (!alt) return { ok: false as const, status: 400, error: '状态图片必须填写替代文本 alt' }
      const bind = payload?.bind && typeof payload.bind === 'object' && !Array.isArray(payload.bind)
        ? payload.bind as Record<string, unknown>
        : null
      let bindContext: null | {
        panel: Record<string, any>
        template: Record<string, any> | null
        fieldKey: string
        expectedVersion: number
        idempotencyKey: string
      } = null
      if (bind) {
        const panelId = String(bind.panelId || '').trim()
        const fieldKey = String(bind.fieldKey || '').trim()
        const expectedVersion = normalizeStatusPanelExpectedVersion(bind.expectedVersion)
        const idempotencyKey = String(bind.idempotencyKey || '').trim()
        if (!panelId || !fieldKey || expectedVersion === null || !idempotencyKey) {
          return { ok: false as const, status: 400, error: '图片原子绑定必须携带 panelId、fieldKey、expectedVersion 和 idempotencyKey' }
        }
        const idempotentEvent = chatRepository.findStatusPanelEventByIdempotencyKey?.(idempotencyKey)
        if (idempotentEvent) {
          const existingPanel = chatRepository.findStatusPanelById?.(normalizedSessionId, panelId, worldId)
          const ref = parseStatusPanelValuesOf(existingPanel)[fieldKey]
          const assetId = String(ref?.assetId || '').trim()
          const asset = assetId ? chatRepository.findStatusAssetById?.(normalizedSessionId, assetId, worldId) : null
          if (existingPanel && asset) return { ok: true as const, data: { asset, ref, panel: existingPanel, idempotent: true } }
          return { ok: false as const, status: 409, error: '幂等键已被其它状态操作占用' }
        }
        const panel = chatRepository.findStatusPanelById?.(normalizedSessionId, panelId, worldId)
        if (!panel) return { ok: false as const, status: 404, error: '要绑定图片的状态栏不存在' }
        const currentVersion = Math.max(1, Number(panel.version || 1))
        if (expectedVersion !== currentVersion) {
          return { ok: false as const, status: 409, error: `状态栏版本冲突：当前版本 ${currentVersion}，提交版本 ${expectedVersion}` }
        }
        const template = chatRepository.findStatusPanelTemplateById?.(normalizedSessionId, String(panel.templateId ?? panel.template_id ?? ''), worldId) || null
        const field = resolveStatusPanelFieldsOf(panel, template).find((item) => String(item?.key || '') === fieldKey)
        if (!field || String(field.valueType || '') !== 'asset') {
          return { ok: false as const, status: 400, error: `字段「${fieldKey}」不是图片资产字段` }
        }
        bindContext = { panel, template, fieldKey, expectedVersion, idempotencyKey }
      }
      let createdStoredPath = ''
      try {
        let saved: ReturnType<typeof saveStatusAssetDataUri> | null = null
        let boundPanel: Record<string, any> | null = null
        const save = () => {
          saved = saveStatusAssetDataUri({
            chatRepository,
            sessionId: normalizedSessionId,
            worldId,
            dataUri: String(payload?.dataUri ?? payload?.data_uri ?? ''),
            fileName: String(payload?.fileName ?? payload?.file_name ?? '状态图片'),
            sourceType: String(payload?.sourceType ?? payload?.source_type ?? 'upload'),
            sourceRef: payload?.sourceRef ?? payload?.source_ref
          })
          if (!saved.ok) return
          createdStoredPath = String(saved.asset?.storedPath ?? saved.asset?.stored_path ?? '')
          if (!bindContext) return
          const ref = {
            ...saved.ref,
            alt,
            ...(String(payload?.caption || '').trim() ? { caption: String(payload.caption).trim() } : {})
          }
          const current = bindContext.panel
          const now = new Date().toISOString()
          const previousValues = parseStatusPanelValuesOf(current)
          const previousAssetId = String(previousValues[bindContext.fieldKey]?.assetId || '').trim()
          const values = { ...previousValues, [bindContext.fieldKey]: ref }
          const row = {
            id: String(current.id || ''),
            sessionId: String(current.sessionId ?? current.session_id ?? normalizedSessionId),
            templateId: String(current.templateId ?? current.template_id ?? ''),
            name: String(current.name || ''),
            description: String(current.description || ''),
            hostType: String(current.hostType ?? current.host_type ?? 'none'),
            hostId: String(current.hostId ?? current.host_id ?? ''),
            valuesJson: JSON.stringify(values),
            fieldsJson: String(current.fieldsJson ?? current.fields_json ?? ''),
            presentationJson: String(current.presentationJson ?? current.presentation_json ?? ''),
            worldId,
            status: String(current.status || 'active'),
            version: bindContext.expectedVersion + 1,
            createdAt: String(current.createdAt ?? current.created_at ?? '') || now,
            updatedAt: now,
            expectedVersion: bindContext.expectedVersion
          }
          const updated = chatRepository.updateStatusPanelAtVersion?.(row)
          if (Number(updated || 0) !== 1) throw new Error('状态栏版本已变化，图片绑定已回滚')
          chatRepository.insertStatusPanelEvent?.({
            id: statusPanelEventId(),
            panelId: row.id,
            sessionId: row.sessionId,
            worldId,
            eventType: 'patched',
            fromVersion: bindContext.expectedVersion,
            toVersion: row.version,
            patchJson: JSON.stringify({ assetBound: { fieldKey: bindContext.fieldKey, fromAssetId: previousAssetId, toAssetId: saved.asset?.id || '' } }),
            source: String(payload?.sourceType ?? payload?.source_type ?? '') === 'pixel_snapshot' ? 'pixel_studio' : 'user_manual',
            idempotencyKey: bindContext.idempotencyKey,
            createdAt: now
          })
          boundPanel = chatRepository.findStatusPanelById?.(normalizedSessionId, row.id, worldId) || row
        }
        // 文件写入失败由 storage 删除精确目标；元数据与上传审计共用状态面板事务回滚。
        if (typeof chatRepository.runStatusPanelTransaction === 'function') chatRepository.runStatusPanelTransaction(save)
        else save()
        if (!saved) throw new Error('状态图片保存未返回结果')
        if (!saved.ok) return { ok: false as const, status: 400, error: saved.error }
        persistChatMutation()
        return {
          ok: true as const,
          data: {
            asset: saved.asset,
            ref: {
              ...saved.ref,
              alt,
              ...(String(payload?.caption || '').trim() ? { caption: String(payload.caption).trim() } : {})
            },
            ...(boundPanel ? {
              panel: {
                ...boundPanel,
                presentationDiagnostics: statusPanelPresentationDiagnosticsOf(boundPanel, bindContext?.template)
              }
            } : {})
          }
        }
      } catch (error) {
        if (createdStoredPath) removeStatusAssetFile(createdStoredPath)
        const message = error instanceof Error ? error.message : '状态图片保存失败'
        return { ok: false as const, status: message.includes('版本') ? 409 : 500, error: message }
      }
    },
    resolveStatusAssetContentBySessionId(sessionId: string, assetId: string) {
      const normalizedSessionId = String(sessionId || '').trim()
      const normalizedAssetId = String(assetId || '').trim()
      const { session, worldId } = resolveStatusPanelWorldScope(normalizedSessionId)
      if (!session) return { ok: false as const, status: 404, error: '会话不存在' }
      const asset = chatRepository.findStatusAssetById?.(normalizedSessionId, normalizedAssetId, worldId)
      if (!asset) return { ok: false as const, status: 404, error: '状态图片不存在' }
      const file = resolveStatusAssetFile(asset.storedPath ?? asset.stored_path)
      if (!file) return { ok: false as const, status: 410, error: '状态图片文件已丢失' }
      return { ok: true as const, data: { file, mimeType: String(asset.mimeType ?? asset.mime_type ?? 'application/octet-stream') } }
    },
    listStatusPanelTemplatesBySessionId(sessionId: string) {
      const normalizedSessionId = String(sessionId || '').trim()
      const { session, worldId } = resolveStatusPanelWorldScope(normalizedSessionId)
      if (!session) {
        return { ok: false as const, status: 404, error: '会话不存在' }
      }
      const items = typeof chatRepository.listStatusPanelTemplates === 'function'
        ? chatRepository.listStatusPanelTemplates(normalizedSessionId, worldId)
        : []
      return { ok: true as const, data: { sessionId: normalizedSessionId, worldId, items } }
    },
    saveStatusPanelTemplateBySessionId(sessionId: string, payload: Record<string, any>) {
      const normalizedSessionId = String(sessionId || '').trim()
      const { session, worldId } = resolveStatusPanelWorldScope(normalizedSessionId)
      if (!session) {
        return { ok: false as const, status: 404, error: '会话不存在' }
      }
      const kind = String(payload?.kind || '').trim()
      if (!kind) {
        return { ok: false as const, status: 400, error: '状态栏模板 kind 不能为空（如 character/organization/building）' }
      }
      const name = String(payload?.name || '').trim()
      if (!name) {
        return { ok: false as const, status: 400, error: '状态栏模板名称不能为空' }
      }
      const fieldsResult = normalizeStatusPanelTemplateFields(payload?.fields ?? payload?.fieldsJson ?? payload?.fields_json)
      if (!fieldsResult.ok) {
        return { ok: false as const, status: 400, error: fieldsResult.error }
      }
      const requestedId = String(payload?.id || '').trim()
      const existing = requestedId && typeof chatRepository.findStatusPanelTemplateById === 'function'
        ? chatRepository.findStatusPanelTemplateById(normalizedSessionId, requestedId, worldId)
        : null
      const currentVersion = existing ? Math.max(1, Number(existing?.version || 1)) : 0
      const rawPresentation = payload?.presentation ?? payload?.presentationJson ?? payload?.presentation_json
      const presentationResult = normalizeStatusPanelPresentation(
        rawPresentation === undefined ? existing?.presentationJson ?? existing?.presentation_json ?? '' : rawPresentation,
        fieldsResult.fields
      )
      if (!presentationResult.ok) {
        return { ok: false as const, status: 400, error: presentationResult.errors.join('；') }
      }
      const submittedVersion = normalizeStatusPanelExpectedVersion(payload?.expectedVersion ?? payload?.expected_version)
      // 旧 UI/调用方未携带 expectedVersion 时仍按当前版本落库；编排命令与新客户端会显式提交版本。
      const expectedVersion = submittedVersion ?? currentVersion
      if (expectedVersion !== currentVersion) {
        return {
          ok: false as const,
          status: 409,
          error: `状态栏模板版本冲突：当前版本 ${currentVersion}，提交版本 ${expectedVersion}`,
          details: { code: 'ORCHESTRATION_VERSION_CONFLICT', currentVersion, expectedVersion }
        }
      }
      const now = new Date().toISOString()
      const row = {
        id: requestedId || buildStatusPanelTemplateId(kind),
        sessionId: normalizedSessionId,
        kind,
        name,
        description: String(payload?.description || ''),
        fieldsJson: JSON.stringify(fieldsResult.fields),
        presentationJson: presentationResult.presentation ? JSON.stringify(presentationResult.presentation) : '',
        createdBy: String(payload?.createdBy || payload?.created_by || '').trim() === 'agent' ? 'agent' : 'user',
        worldId,
        status: 'active',
        version: existing ? currentVersion + 1 : 1,
        createdAt: String(existing?.createdAt ?? existing?.created_at ?? '') || now,
        updatedAt: now
      }
      const mutate = () => {
        if (existing && typeof chatRepository.updateStatusPanelTemplateAtVersion === 'function') {
          const updated = chatRepository.updateStatusPanelTemplateAtVersion({ ...row, expectedVersion: currentVersion })
          if (Number(updated || 0) !== 1) throw new Error('状态栏模板版本已变化，请刷新后重试')
          return
        }
        if (!existing && typeof chatRepository.insertStatusPanelTemplate === 'function') {
          const inserted = chatRepository.insertStatusPanelTemplate(row)
          if (Number(inserted || 0) !== 1) throw new Error('状态栏模板创建失败')
          return
        }
        chatRepository.upsertStatusPanelTemplate(row)
      }
      try {
        if (typeof chatRepository.runStatusPanelTransaction === 'function') chatRepository.runStatusPanelTransaction(mutate)
        else mutate()
      } catch (error) {
        return { ok: false as const, status: 409, error: error instanceof Error ? error.message : '状态栏模板保存失败' }
      }
      persistChatMutation()
      const saved = typeof chatRepository.findStatusPanelTemplateById === 'function'
        ? chatRepository.findStatusPanelTemplateById(normalizedSessionId, row.id, worldId)
        : row
      return { ok: true as const, data: saved }
    },
    deleteStatusPanelTemplateBySessionId(sessionId: string, templateId: string) {
      const normalizedSessionId = String(sessionId || '').trim()
      const normalizedTemplateId = String(templateId || '').trim()
      const { session, worldId } = resolveStatusPanelWorldScope(normalizedSessionId)
      if (!session) {
        return { ok: false as const, status: 404, error: '会话不存在' }
      }
      if (!normalizedTemplateId) {
        return { ok: false as const, status: 400, error: '状态栏模板 id 不能为空' }
      }
      const panelCount = typeof chatRepository.countStatusPanelsByTemplateId === 'function'
        ? chatRepository.countStatusPanelsByTemplateId(normalizedSessionId, normalizedTemplateId, worldId)
        : 0
      if (panelCount > 0) {
        return { ok: false as const, status: 409, error: `该模板还有 ${panelCount} 个状态栏实例，先删除实例才能删除模板` }
      }
      const deleted = typeof chatRepository.deleteStatusPanelTemplate === 'function'
        ? chatRepository.deleteStatusPanelTemplate(normalizedSessionId, normalizedTemplateId, worldId)
        : 0
      if (!deleted) {
        return { ok: false as const, status: 404, error: '状态栏模板不存在' }
      }
      persistChatMutation()
      return { ok: true as const, data: { ok: true, deletedId: normalizedTemplateId } }
    },
    listStatusPanelsBySessionId(sessionId: string) {
      const normalizedSessionId = String(sessionId || '').trim()
      const { session, worldId } = resolveStatusPanelWorldScope(normalizedSessionId)
      if (!session) {
        return { ok: false as const, status: 404, error: '会话不存在' }
      }
      const panels = typeof chatRepository.listStatusPanels === 'function'
        ? chatRepository.listStatusPanels(normalizedSessionId, worldId)
        : []
      const templates = typeof chatRepository.listStatusPanelTemplates === 'function'
        ? chatRepository.listStatusPanelTemplates(normalizedSessionId, worldId)
        : []
      const templateMap = new Map(templates.map((item: any) => [String(item?.id || ''), item]))
      // 批次B：binding 解析按实例字段快照（旧实例回退模板字段）
      let items: Array<Record<string, any>>
      try {
        items = panels.map((panel: any) => {
          const template = templateMap.get(String(panel?.templateId ?? panel?.template_id ?? ''))
          const fields = resolveStatusPanelFieldsOf(panel, template)
          return {
            ...panel,
            version: Math.max(1, Number(panel?.version || 1)),
            bindingValues: resolveStatusPanelBindingValues(panel, fields),
            presentationDiagnostics: statusPanelPresentationDiagnosticsOf(panel, template)
          }
        })
      } catch (error) {
        return { ok: false as const, status: 409, error: error instanceof Error ? error.message : '状态栏宿主解析失败' }
      }
      // 批3：世界级模式下统计本会话未并入世界的会话级遗留（模板+实例），供 UI 提示「一键并入世界」
      let pendingSessionScopeCount = 0
      if (worldId) {
        const legacyPanels = typeof chatRepository.listStatusPanels === 'function'
          ? chatRepository.listStatusPanels(normalizedSessionId, '')
          : []
        const legacyTemplates = typeof chatRepository.listStatusPanelTemplates === 'function'
          ? chatRepository.listStatusPanelTemplates(normalizedSessionId, '')
          : []
        pendingSessionScopeCount = (Array.isArray(legacyPanels) ? legacyPanels.length : 0)
          + (Array.isArray(legacyTemplates) ? legacyTemplates.length : 0)
      }
      return { ok: true as const, data: { sessionId: normalizedSessionId, worldId, pendingSessionScopeCount, items } }
    },
    listStatusPanelEventsBySessionId(sessionId: string, panelId: string) {
      const normalizedSessionId = String(sessionId || '').trim()
      const normalizedPanelId = String(panelId || '').trim()
      const { session, worldId } = resolveStatusPanelWorldScope(normalizedSessionId)
      if (!session) return { ok: false as const, status: 404, error: '会话不存在' }
      if (!normalizedPanelId) return { ok: false as const, status: 400, error: '状态栏 id 不能为空' }
      const items = chatRepository.listStatusPanelEvents?.(normalizedSessionId, normalizedPanelId, worldId) || []
      return { ok: true as const, data: { sessionId: normalizedSessionId, worldId, panelId: normalizedPanelId, items } }
    },
    previewLegacyCharacterStatusPanelMigrationBySessionId(sessionId: string) {
      const normalizedSessionId = String(sessionId || '').trim()
      const { session, worldId } = resolveStatusPanelWorldScope(normalizedSessionId)
      if (!session) return { ok: false as const, status: 404, error: '会话不存在' }
      const preview = buildLegacyCharacterStatusPanelMigrationPreview()
      const items = preview.items.filter((item) => item.sourceSessionId === normalizedSessionId)
      return {
        ok: true as const,
        data: {
          sessionId: normalizedSessionId,
          worldId,
          zeroWrite: true,
          total: items.length,
          migratable: items.filter((item) => item.status === 'migratable').length,
          blocked: items.filter((item) => item.status !== 'migratable').length,
          items
        }
      }
    },
    previewLegacyCharacterStatusPanelMigration() {
      return { ok: true as const, data: buildLegacyCharacterStatusPanelMigrationPreview() }
    },
    executeLegacyCharacterStatusPanelMigration(payload: Record<string, any>) {
      const selectedPanelIds = Array.from(new Set(
        (Array.isArray(payload?.selectedPanelIds) ? payload.selectedPanelIds : [])
          .map((value: unknown) => String(value || '').trim())
          .filter(Boolean)
      )).slice(0, 500)
      if (!selectedPanelIds.length) return { ok: false as const, status: 400, error: '至少选择一张可迁移的旧角色状态栏' }
      const preview = buildLegacyCharacterStatusPanelMigrationPreview()
      const byId = new Map(preview.items.map((item) => [item.panelId, item]))
      const selected = selectedPanelIds.map((panelId) => byId.get(panelId)).filter(Boolean) as Array<Record<string, any>>
      if (selected.length !== selectedPanelIds.length) {
        return { ok: false as const, status: 409, error: '迁移预览已变化，请刷新后重新选择' }
      }
      const blocked = selected.find((item) => item.status !== 'migratable' || !item.targetParticipantId)
      if (blocked) {
        return { ok: false as const, status: 409, error: `状态栏「${blocked.panelName || blocked.panelId}」无法唯一确定会话角色，禁止猜迁` }
      }
      if (
        typeof chatRepository.findLegacyCharacterStatusPanelById !== 'function'
        || typeof chatRepository.migrateLegacyCharacterStatusPanelHost !== 'function'
        || typeof chatRepository.runStatusPanelTransaction !== 'function'
      ) {
        return { ok: false as const, status: 503, error: '旧角色状态栏迁移仓储尚未就绪' }
      }
      const migrated: Array<Record<string, any>> = []
      try {
        chatRepository.runStatusPanelTransaction(() => {
          const now = new Date().toISOString()
          for (const item of selected) {
            const current = chatRepository.findLegacyCharacterStatusPanelById(item.panelId)
            const currentVersion = Math.max(1, Number(current?.version || 1))
            if (!current || currentVersion !== Number(item.expectedVersion)) {
              throw new Error(`状态栏「${item.panelName || item.panelId}」版本已变化`)
            }
            const participants = chatRepository.listSessionParticipants?.(item.sourceSessionId) || []
            const matches = participants.filter((participant: Record<string, any>) => (
              String(participant?.participantType ?? participant?.participant_type ?? '') === 'char'
              && String(participant?.participantTargetId ?? participant?.participant_target_id ?? '') === String(item.characterId || '')
            ))
            if (matches.length !== 1 || String(matches[0]?.id || '') !== String(item.targetParticipantId || '')) {
              throw new Error(`状态栏「${item.panelName || item.panelId}」的会话角色归属已变化`)
            }
            const changed = chatRepository.migrateLegacyCharacterStatusPanelHost({
              panelId: item.panelId,
              sessionId: item.sourceSessionId,
              participantId: item.targetParticipantId,
              expectedVersion: currentVersion,
              updatedAt: now
            })
            if (changed !== 1) throw new Error(`状态栏「${item.panelName || item.panelId}」迁移写入冲突`)
            chatRepository.insertStatusPanelEvent?.({
              id: `status_panel_event_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
              panelId: item.panelId,
              sessionId: item.sourceSessionId,
              worldId: item.worldId,
              eventType: 'patched',
              fromVersion: currentVersion,
              toVersion: currentVersion + 1,
              patchJson: JSON.stringify({ hostType: { from: 'character', to: 'session_character' }, hostId: { from: item.characterId, to: item.targetParticipantId } }),
              source: 'legacy_character_host_migration',
              idempotencyKey: `legacy-character-host:${item.panelId}:${currentVersion}`,
              createdAt: now
            })
            migrated.push({ panelId: item.panelId, participantId: item.targetParticipantId, fromVersion: currentVersion, toVersion: currentVersion + 1 })
          }
        })
      } catch (error) {
        return { ok: false as const, status: 409, error: `旧角色状态栏迁移失败，整批已回滚：${error instanceof Error ? error.message : String(error)}` }
      }
      persistChatMutation()
      return { ok: true as const, data: { migrated: migrated.length, items: migrated, rollback: 'database_backup_or_transaction' } }
    },
    saveStatusPanelBySessionId(sessionId: string, payload: Record<string, any>) {
      const normalizedSessionId = String(sessionId || '').trim()
      const { session, worldId } = resolveStatusPanelWorldScope(normalizedSessionId)
      if (!session) {
        return { ok: false as const, status: 404, error: '会话不存在' }
      }
      const templateId = String(payload?.templateId ?? payload?.template_id ?? '').trim()
      const template = templateId && typeof chatRepository.findStatusPanelTemplateById === 'function'
        ? chatRepository.findStatusPanelTemplateById(normalizedSessionId, templateId, worldId)
        : null
      if (!template) {
        return { ok: false as const, status: 404, error: '状态栏模板不存在' }
      }
      const name = String(payload?.name || '').trim()
      if (!name) {
        return { ok: false as const, status: 400, error: '状态栏名称不能为空' }
      }
      const hostType = String(payload?.hostType ?? payload?.host_type ?? 'none').trim() || 'none'
      if (!STATUS_PANEL_HOST_TYPES.has(hostType)) {
        return { ok: false as const, status: 400, error: `宿主类型不合法：${hostType}（可用：session_character/temp_entity/world_entity/user/none）` }
      }
      if (!STATUS_PANEL_WRITABLE_HOST_TYPES.has(hostType)) {
        return { ok: false as const, status: 409, error: '旧 character 宿主只允许兼容读取；请先查看迁移预览并改为 session_character' }
      }
      // user/none 恒无 hostId（user=用户本人，一会话一用户，无需指宿主实体）。
      const hostId = hostType === 'none' || hostType === 'user' ? '' : String(payload?.hostId ?? payload?.host_id ?? '').trim()
      if (hostType === 'session_character') {
        try {
          if (!resolveStatusPanelCharacterTarget({ sessionId: normalizedSessionId, hostType, hostId })) {
            return { ok: false as const, status: 404, error: '宿主会话角色不存在' }
          }
        } catch (error) {
          return { ok: false as const, status: 409, error: error instanceof Error ? error.message : '宿主会话角色解析失败' }
        }
      }
      if (hostType === 'temp_entity') {
        // 批次4 修批次1潜伏bug：临时角色存旧 temporary_characters 表，宿主校验用联合查找，否则临时角色挂状态栏被误拒
        const entity = hostId ? findSessionTemporaryEntityUnified(normalizedSessionId, hostId) : null
        if (!entity) {
          return { ok: false as const, status: 404, error: '宿主临时实体不存在' }
        }
      }
      if (hostType === 'world_entity') {
        if (!worldId) {
          return { ok: false as const, status: 400, error: '无世界会话不能挂世界实体状态栏' }
        }
        const entity = hostId ? chatRepository.findWorldEntityById?.(worldId, hostId) : null
        if (!entity) {
          return { ok: false as const, status: 404, error: '宿主世界实体不存在或不属于当前世界' }
        }
      }
      const requestedId = String(payload?.id || '').trim()
      const existing = requestedId && typeof chatRepository.findStatusPanelById === 'function'
        ? chatRepository.findStatusPanelById(normalizedSessionId, requestedId, worldId)
        : null
      const expectedVersion = normalizeStatusPanelExpectedVersion(payload?.expectedVersion ?? payload?.expected_version)
      if (expectedVersion === null) {
        return { ok: false as const, status: 400, error: '保存状态栏必须携带非负整数 expectedVersion' }
      }
      const currentVersion = existing ? Math.max(1, Number(existing?.version || 1)) : 0
      const idempotencyKey = String(payload?.idempotencyKey ?? payload?.idempotency_key ?? '').trim()
      if (!idempotencyKey) {
        return { ok: false as const, status: 400, error: '保存状态栏必须携带 idempotencyKey' }
      }
      const idempotentEvent = chatRepository.findStatusPanelEventByIdempotencyKey?.(idempotencyKey)
      if (idempotentEvent) {
        const idempotentPanelId = String(idempotentEvent?.panelId ?? idempotentEvent?.panel_id ?? '')
        if (String(idempotentEvent?.eventType ?? idempotentEvent?.event_type ?? '') === (existing ? 'patched' : 'created')) {
          const idempotentPanel = chatRepository.findStatusPanelById?.(normalizedSessionId, idempotentPanelId, worldId)
          if (idempotentPanel) {
            return {
              ok: true as const,
              data: {
                ...idempotentPanel,
                bindingValues: resolveStatusPanelBindingValues(idempotentPanel, resolveStatusPanelFieldsOf(idempotentPanel, template))
              }
            }
          }
        }
        return { ok: false as const, status: 409, error: '幂等键已被其它状态栏操作占用' }
      }
      if (expectedVersion !== currentVersion) {
        return {
          ok: false as const,
          status: 409,
          error: `状态栏版本冲突：当前版本 ${currentVersion}，提交版本 ${expectedVersion}`,
          details: { code: 'ORCHESTRATION_VERSION_CONFLICT', currentVersion, expectedVersion }
        }
      }
      // 实例字段快照（批次B）：payload 显式给 fields=改实例结构（面板内行级编辑）；不给则沿用既有快照；
      // 旧实例无快照 / 新建实例 → 从模板拷贝快照（旧实例首写自然升级）。校验与渲染此后都以实例字段为准。
      let fields: Array<Record<string, any>>
      const rawInstanceFields = payload?.fields ?? payload?.fieldsJson ?? payload?.fields_json
      if (rawInstanceFields !== undefined) {
        const fieldsResult = normalizeStatusPanelTemplateFields(rawInstanceFields)
        if (!fieldsResult.ok) {
          return { ok: false as const, status: 400, error: fieldsResult.error }
        }
        fields = fieldsResult.fields
      } else {
        fields = parseStatusPanelInstanceFieldsOf(existing) ?? parseStatusPanelTemplateFieldsOf(template)
      }
      const rawPresentation = payload?.presentation ?? payload?.presentationJson ?? payload?.presentation_json
      const presentationSeed = rawPresentation === undefined
        ? existing
          ? existing?.presentationJson ?? existing?.presentation_json ?? ''
          : template?.presentationJson ?? template?.presentation_json ?? ''
        : rawPresentation
      const presentationResult = normalizeStatusPanelPresentation(presentationSeed, fields)
      if (!presentationResult.ok) {
        return { ok: false as const, status: 400, error: presentationResult.errors.join('；') }
      }
      const fieldMap = new Map(fields.map((field) => [String(field?.key || ''), field]))
      const panelId = requestedId || buildStatusPanelId(String(template?.kind || 'panel'))
      // values 校验：未知 key 拒绝；binding 字段不落 values_json（写穿透到绑定真值）；ref 必须指向本会话存在的其他状态栏。
      const rawValues = payload?.values ?? payload?.valuesJson ?? payload?.values_json
      const values = parseStatusPanelValuesOf({ valuesJson: rawValues ?? '{}' })
      // 值来源只作为审计元数据落事件账本，不混进 values_json，也不改变状态栏正式值的读写协议。
      // creative_default 表示为角色扮演补出的可编辑初值；它必须逐字段绑定本次 value patch，避免
      // 把推测值伪装成已观察事实，或给未改字段挂一条没有对应写入的来源记录。
      const rawValueProvenance = payload?.valueProvenance ?? payload?.value_provenance
      let valueProvenance: Record<string, string> = {}
      if (rawValueProvenance !== undefined) {
        if (!rawValueProvenance || typeof rawValueProvenance !== 'object' || Array.isArray(rawValueProvenance)) {
          return { ok: false as const, status: 400, error: 'valueProvenance 必须是字段名到来源类型的对象' }
        }
        const allowedValueProvenance = new Set(['observed', 'inferred', 'creative_default', 'unknown'])
        for (const [key, provenance] of Object.entries(rawValueProvenance as Record<string, unknown>)) {
          if (!Object.prototype.hasOwnProperty.call(values, key)) {
            return { ok: false as const, status: 400, error: `值来源字段「${key}」不在本次 values 写入中` }
          }
          const normalized = String(provenance || '').trim()
          if (!allowedValueProvenance.has(normalized)) {
            return { ok: false as const, status: 400, error: `值来源类型不合法：${normalized || '(空)'}` }
          }
          valueProvenance[key] = normalized
        }
      }
      // 服务端按字段 patch 合并：未提交的字段沿用现值；字段结构删掉的 key 会在这里被裁掉。
      // binding 永远不进入 values_json，仍只写正式目标。
      const storedValues: Record<string, any> = Object.fromEntries(
        Object.entries(parseStatusPanelValuesOf(existing || {})).filter(([key]) => {
          const field = fieldMap.get(key)
          return field && String(field?.valueType || 'text') !== 'binding'
        })
      )
      const bindingWrites: Array<{ binding: string; value: string }> = []
      for (const [key, rawValue] of Object.entries(values)) {
        const field = fieldMap.get(key)
        if (!field) {
          return { ok: false as const, status: 400, error: `未知字段：${key}（不在模板字段定义里）` }
        }
        const valueType = String(field?.valueType || 'text')
        if (valueType === 'binding') {
          if (hostType !== 'session_character') {
            return { ok: false as const, status: 400, error: `字段「${key}」是绑定字段，只有会话角色宿主的状态栏才能写它` }
          }
          bindingWrites.push({ binding: String(field?.binding || ''), value: String(rawValue ?? '') })
          continue
        }
        if (valueType === 'number') {
          const num = Number(rawValue)
          if (!Number.isFinite(num)) {
            return { ok: false as const, status: 400, error: `字段「${key}」需要数字` }
          }
          storedValues[key] = num
          continue
        }
        if (valueType === 'list') {
          if (!Array.isArray(rawValue)) {
            return { ok: false as const, status: 400, error: `字段「${key}」需要数组` }
          }
          storedValues[key] = rawValue.map((item) => String(item ?? ''))
          continue
        }
        if (valueType === 'ref') {
          const refList = Array.isArray(rawValue) ? rawValue : [rawValue]
          for (const refItem of refList) {
            const refId = String(refItem ?? '').trim()
            if (!refId) continue
            if (refId === panelId) {
              return { ok: false as const, status: 400, error: `字段「${key}」不能引用状态栏自己` }
            }
            const refPanel = typeof chatRepository.findStatusPanelById === 'function'
              ? chatRepository.findStatusPanelById(normalizedSessionId, refId, worldId)
              : null
            if (!refPanel) {
              return { ok: false as const, status: 400, error: `字段「${key}」引用的状态栏不存在：${refId}` }
            }
          }
          storedValues[key] = rawValue
          continue
        }
        if (valueType === 'asset') {
          if (!rawValue || typeof rawValue !== 'object' || Array.isArray(rawValue)) {
            return { ok: false as const, status: 400, error: `字段「${key}」需要正式资产引用对象` }
          }
          const assetId = String((rawValue as Record<string, unknown>).assetId || '').trim()
          const kind = String((rawValue as Record<string, unknown>).kind || '').trim()
          const alt = String((rawValue as Record<string, unknown>).alt || '').trim()
          if (!assetId || kind !== 'image' || !alt) {
            return { ok: false as const, status: 400, error: `字段「${key}」的资产引用必须包含 assetId、kind=image 和 alt` }
          }
          const asset = chatRepository.findStatusAssetById?.(normalizedSessionId, assetId, worldId)
          if (!asset) {
            return { ok: false as const, status: 400, error: `字段「${key}」引用的状态资产不存在：${assetId}` }
          }
          storedValues[key] = {
            assetId,
            kind: 'image',
            alt,
            ...(String((rawValue as Record<string, unknown>).caption || '').trim()
              ? { caption: String((rawValue as Record<string, unknown>).caption || '').trim() }
              : {})
          }
          continue
        }
        storedValues[key] = String(rawValue ?? '')
      }
      const now = new Date().toISOString()
      const nextVersion = existing ? currentVersion + 1 : 1
      const description = buildStatusPanelDescription({
        provided: payload?.description,
        existing,
        template,
        name,
        fields
      })
      const row = {
        id: panelId,
        // 世界实体面板跨会话可写，但 session_id 始终保留创建来源；会话角色面板只会命中自己的会话。
        sessionId: String(existing?.sessionId ?? existing?.session_id ?? '') || normalizedSessionId,
        templateId,
        name,
        description,
        hostType,
        hostId,
        valuesJson: JSON.stringify(storedValues),
        fieldsJson: JSON.stringify(fields),
        presentationJson: presentationResult.presentation ? JSON.stringify(presentationResult.presentation) : '',
        worldId,
        status: 'active',
        version: nextVersion,
        createdAt: String(existing?.createdAt ?? existing?.created_at ?? '') || now,
        updatedAt: now
      }
      const source = String(payload?.source || 'user_manual').trim() || 'user_manual'
      const eventType = existing ? 'patched' : 'created'
      const patchJson = JSON.stringify({
        name,
        description,
        hostType,
        hostId,
        templateId,
        valuePatch: values,
        valueProvenance,
        fieldsChanged: rawInstanceFields !== undefined,
        presentationChanged: rawPresentation !== undefined,
        bindingWrites: bindingWrites.map((write) => write.binding)
      })
      const mutate = () => {
        for (const write of bindingWrites) patchStatusPanelCharacterBinding(row, write.binding, write.value)
        if (existing) {
          const updated = chatRepository.updateStatusPanelAtVersion?.({ ...row, expectedVersion: currentVersion })
          if (Number(updated || 0) !== 1) throw new Error('状态栏版本已变化，请刷新后重试')
        } else {
          const inserted = chatRepository.insertStatusPanel?.(row)
          if (Number(inserted || 0) !== 1) throw new Error('状态栏创建失败')
        }
        chatRepository.insertStatusPanelEvent?.({
          id: statusPanelEventId(),
          panelId: panelId,
          sessionId: normalizedSessionId,
          worldId,
          eventType,
          fromVersion: currentVersion,
          toVersion: nextVersion,
          patchJson,
          source,
          idempotencyKey,
          createdAt: now
        })
      }
      if (typeof chatRepository.runStatusPanelTransaction === 'function') {
        chatRepository.runStatusPanelTransaction(mutate)
      } else {
        mutate()
      }
      persistChatMutation()
      const saved = typeof chatRepository.findStatusPanelById === 'function'
        ? chatRepository.findStatusPanelById(normalizedSessionId, row.id, worldId)
        : row
      return {
        ok: true as const,
        data: {
          ...saved,
          bindingValues: resolveStatusPanelBindingValues(saved, fields),
          presentationDiagnostics: statusPanelPresentationDiagnosticsOf(saved, template)
        }
      }
    },
    deleteStatusPanelBySessionId(sessionId: string, panelId: string, payload: Record<string, any> = {}) {
      const normalizedSessionId = String(sessionId || '').trim()
      const normalizedPanelId = String(panelId || '').trim()
      const { session, worldId } = resolveStatusPanelWorldScope(normalizedSessionId)
      if (!session) {
        return { ok: false as const, status: 404, error: '会话不存在' }
      }
      if (!normalizedPanelId) {
        return { ok: false as const, status: 400, error: '状态栏 id 不能为空' }
      }
      const existing = chatRepository.findStatusPanelById?.(normalizedSessionId, normalizedPanelId, worldId)
      const idempotencyKey = String(payload?.idempotencyKey ?? payload?.idempotency_key ?? '').trim()
      if (!idempotencyKey) return { ok: false as const, status: 400, error: '删除状态栏必须携带 idempotencyKey' }
      const idempotentEvent = chatRepository.findStatusPanelEventByIdempotencyKey?.(idempotencyKey)
      if (idempotentEvent) {
        if (
          String(idempotentEvent?.eventType ?? idempotentEvent?.event_type ?? '') === 'deleted'
          && String(idempotentEvent?.panelId ?? idempotentEvent?.panel_id ?? '') === normalizedPanelId
        ) {
          return { ok: true as const, data: { ok: true, deletedId: normalizedPanelId, idempotent: true } }
        }
        return { ok: false as const, status: 409, error: '幂等键已被其它状态栏操作占用' }
      }
      if (!existing) return { ok: false as const, status: 404, error: '状态栏不存在' }
      const expectedVersion = normalizeStatusPanelExpectedVersion(payload?.expectedVersion ?? payload?.expected_version)
      if (expectedVersion === null) return { ok: false as const, status: 400, error: '删除状态栏必须携带非负整数 expectedVersion' }
      const currentVersion = Math.max(1, Number(existing?.version || 1))
      if (expectedVersion !== currentVersion) {
        return {
          ok: false as const,
          status: 409,
          error: `状态栏版本冲突：当前版本 ${currentVersion}，提交版本 ${expectedVersion}`,
          details: { code: 'ORCHESTRATION_VERSION_CONFLICT', currentVersion, expectedVersion }
        }
      }
      // 引用完整性：别的状态栏还引用着它（如组织成员列表）时拒绝删除，防悬空引用。
      const panels = typeof chatRepository.listStatusPanels === 'function'
        ? chatRepository.listStatusPanels(normalizedSessionId, worldId)
        : []
      const templates = typeof chatRepository.listStatusPanelTemplates === 'function'
        ? chatRepository.listStatusPanelTemplates(normalizedSessionId, worldId)
        : []
      const templateMap = new Map(templates.map((item: any) => [String(item?.id || ''), item]))
      const referrers = panels.filter((panel: any) => {
        if (String(panel?.id || '') === normalizedPanelId) return false
        const fields = resolveStatusPanelFieldsOf(panel, templateMap.get(String(panel?.templateId ?? panel?.template_id ?? '')))
        return collectStatusPanelRefIds(fields, parseStatusPanelValuesOf(panel)).includes(normalizedPanelId)
      })
      if (referrers.length) {
        const names = referrers.map((panel: any) => String(panel?.name || panel?.id || '')).filter(Boolean).join('、')
        return { ok: false as const, status: 409, error: `还有状态栏引用着它（${names}），先解除引用才能删除` }
      }
      const now = new Date().toISOString()
      const mutate = () => {
        const deleted = chatRepository.deleteStatusPanelAtVersion?.(normalizedSessionId, normalizedPanelId, worldId, currentVersion)
        if (Number(deleted || 0) !== 1) throw new Error('状态栏版本已变化，请刷新后重试')
        chatRepository.insertStatusPanelEvent?.({
          id: statusPanelEventId(),
          panelId: normalizedPanelId,
          sessionId: normalizedSessionId,
          worldId,
          eventType: 'deleted',
          fromVersion: currentVersion,
          toVersion: currentVersion + 1,
          patchJson: JSON.stringify({ deleted: true }),
          source: String(payload?.source || 'user_manual').trim() || 'user_manual',
          idempotencyKey,
          createdAt: now
        })
      }
      if (typeof chatRepository.runStatusPanelTransaction === 'function') chatRepository.runStatusPanelTransaction(mutate)
      else mutate()
      persistChatMutation()
      return { ok: true as const, data: { ok: true, deletedId: normalizedPanelId } }
    },
    async persistSessionTemporaryEntityBySessionId(sessionId: string, entityId: string, payload: Record<string, any> = {}) {
      const normalizedSessionId = String(sessionId || '').trim()
      const normalizedEntityId = String(entityId || '').trim()
      const session = chatRepository.getSessionById(normalizedSessionId) as Record<string, any> | null
      if (!session) {
        return { ok: false as const, status: 404, error: '会话不存在' }
      }
      if (!normalizedEntityId) {
        return { ok: false as const, status: 400, error: '临时实体 id 不能为空' }
      }
      // 批次4：联合查找——「/整理角色」生成的临时角色存旧 temporary_characters 表，单查 entities 表会误报不存在
      const entity = findSessionTemporaryEntityUnified(normalizedSessionId, normalizedEntityId)
      if (!entity) {
        return { ok: false as const, status: 404, error: '临时实体不存在' }
      }
      const persistedTarget = parseJsonObject(entity.persistedTargetJson ?? entity.persisted_target_json)
      if (persistedTarget?.type === 'worldEntity') {
        const targetWorldId = String(persistedTarget.worldId || '').trim()
        const targetEntityId = String(persistedTarget.entityId || '').trim()
        const targetEntity = chatRepository.findWorldEntityById?.(targetWorldId, targetEntityId)
        if (!targetEntity) {
          return { ok: false as const, status: 409, error: '临时实体记录的世界实体已不存在，请先修复持久化引用' }
        }
        return { ok: true as const, data: { ok: true, alreadyPersisted: true, item: entity, persistedTarget, worldEntity: targetEntity } }
      }
      if (persistedTarget?.type && persistedTarget.type !== 'docLibraryPending') {
        return { ok: false as const, status: 409, error: '临时实体已经持久化' }
      }
      const savePersistedEntityTarget = (target: Record<string, unknown>) => {
        const now = new Date().toISOString()
        chatRepository.upsertSessionTemporaryEntity({
          id: normalizedEntityId,
          sessionId: normalizedSessionId,
          kind: String(entity.kind || 'character').trim() || 'character',
          name: String(entity.name || '').trim(),
          aliasesJson: jsonColumnText(entity.aliasesJson ?? entity.aliases_json, []),
          markdown: String(entity.markdown || ''),
          tagsJson: jsonColumnText(entity.tagsJson ?? entity.tags_json, []),
          sourceLedgerJson: jsonColumnText(entity.sourceLedgerJson ?? entity.source_ledger_json, []),
          status: String(entity.status || 'active').trim() || 'active',
          persistedTargetJson: jsonColumnText(target, {}),
          worldId: String(target.worldId ?? entity.worldId ?? entity.world_id ?? '').trim(),
          createdAt: String(entity.createdAt ?? entity.created_at ?? '') || now,
          updatedAt: now
        })
        persistChatMutation()
        return typeof chatRepository.findSessionTemporaryEntityById === 'function'
          ? chatRepository.findSessionTemporaryEntityById(normalizedSessionId, normalizedEntityId)
          : null
      }
      const kind = String(entity.kind || 'character')
      if (kind !== 'character') {
        const currentWorldId = String(session.worldId ?? session.world_id ?? '').trim()
        if (!currentWorldId) {
          return { ok: false as const, status: 400, error: '会话尚未加入世界，非角色临时实体不能转正为世界资产' }
        }
        const sourceWorldId = String(entity.worldId ?? entity.world_id ?? '').trim()
        if (sourceWorldId && sourceWorldId !== currentWorldId) {
          return { ok: false as const, status: 409, error: '该临时实体属于另一个世界，请回到原世界后转正' }
        }
        const worldKindByTemporaryKind: Record<string, string> = {
          building: 'building',
          region: 'region',
          faction: 'organization',
          item: 'item'
        }
        const worldKind = worldKindByTemporaryKind[kind]
        if (!worldKind) {
          return { ok: false as const, status: 400, error: '事件影响不是世界实体，请转入叙事种子或保留为会话记录' }
        }
        const now = new Date().toISOString()
        const worldEntity = {
          id: buildWorldEntityId(worldKind),
          worldId: currentWorldId,
          kind: worldKind,
          name: String(payload?.finalName ?? payload?.final_name ?? entity.name ?? '').trim(),
          aliasesJson: jsonColumnText(entity.aliasesJson ?? entity.aliases_json, []),
          markdown: String(entity.markdown || ''),
          tagsJson: jsonColumnText(entity.tagsJson ?? entity.tags_json, []),
          sourceLedgerJson: jsonColumnText(entity.sourceLedgerJson ?? entity.source_ledger_json, []),
          mapSheetId: '',
          mapFeatureId: '',
          status: 'active',
          version: 1,
          createdAt: now,
          updatedAt: now
        }
        chatRepository.upsertWorldEntity(worldEntity)
        const target = {
          type: 'worldEntity',
          worldId: currentWorldId,
          entityId: worldEntity.id,
          kind: worldKind,
          migratedFrom: persistedTarget?.type === 'docLibraryPending' ? 'docLibraryPending' : '',
          updatedAt: now
        }
        const saved = savePersistedEntityTarget(target)
        migrateTemporaryEntityStatusPanels(normalizedSessionId, normalizedEntityId, {
          hostType: 'world_entity',
          hostId: worldEntity.id,
          worldId: currentWorldId
        })
        return { ok: true as const, data: { ok: true, item: saved, persistedTarget: target, worldEntity } }
      }
      const extractionMarkdown = String(entity.markdown || '')
      const characterCore = parseCharacterCoreMarkdown(extractionMarkdown)
      const group = ensureImprovisedCharacterGroup()
      const characterId = buildImprovisedCharacterId()
      const existingCharacters = typeof characterRepository.getCharacters === 'function'
        ? characterRepository.getCharacters()
        : []
      const maxOrderIndex = Array.isArray(existingCharacters)
        ? existingCharacters.reduce((max: number, character: Record<string, unknown>) => Math.max(max, Number(character?.orderIndex ?? character?.order_index ?? 0)), 0)
        : 0
      const now = new Date().toISOString()
      const character = {
        id: characterId,
        name: String(payload?.finalName ?? payload?.final_name ?? characterCore.name ?? entity.name ?? '临时角色').trim(),
        gender: String(characterCore.gender || ''),
        age: String(characterCore.age || ''),
        emoji: String(characterCore.emoji || '👤'),
        avatarPath: '',
        groupId: String(group.id || 'improvised_characters'),
        desc: String(characterCore.desc || extractionMarkdown.slice(0, 120)),
        appearance: String(characterCore.appearance || ''),
        outfit: String(characterCore.outfit || ''),
        personality: String(characterCore.personality || ''),
        hobbies: String(characterCore.hobbies || ''),
        abilities: String(characterCore.abilities || ''),
        experience: String(characterCore.experience || ''),
        worldview: String(characterCore.worldview || ''),
        background: String(characterCore.background || ''),
        speakingStyle: String(characterCore.speakingStyle || characterCore.speaking_style || ''),
        brainDocuments: characterCore.brainDocuments ?? characterCore.brain_documents ?? {},
        orderIndex: maxOrderIndex + 1
      }
      characterRepository.insertCharacter([
        character.id, character.name, character.gender, character.age, character.emoji, character.avatarPath,
        character.groupId, character.desc, character.appearance, character.outfit,
        character.personality, character.hobbies, character.abilities, character.experience,
        character.worldview, character.background, character.speakingStyle,
        JSON.stringify([]), '', '',
        null, null, '', 'follow_session',
        JSON.stringify({}), JSON.stringify([]),
        JSON.stringify([]), JSON.stringify({}),
        jsonColumnText({}, {}),
        jsonColumnText(character.brainDocuments, {}),
        jsonColumnText([], []),
        jsonColumnText([], []),
        jsonColumnText({}, {}),
        jsonColumnText({}, {}),
        jsonColumnText({}, {}),
        jsonColumnText([], []),
        50,
        JSON.stringify([]), character.orderIndex,
        ''
      ])
      const target = {
        type: 'character',
        characterId: character.id,
        groupId: character.groupId,
        updatedAt: now
      }
      const saved = savePersistedEntityTarget(target)
      // 角色转正不等于加入会话成员；原 temp_entity 状态栏保留会话宿主，不能猜造 session_character 或回写全局角色。
      return { ok: true as const, data: { ok: true, character, group, item: saved, persistedTarget: target } }
    },
    archiveChatSessionById(sessionId: string, payload: Record<string, any> = {}) {
      const normalizedSessionId = String(sessionId || '').trim()
      if (!chatRepository.getSessionById(normalizedSessionId)) {
        return { ok: false as const, status: 404, error: '会话不存在' }
      }
      const archive = archiveChatSession(normalizedSessionId, {
        name: String(payload?.name || payload?.title || '').trim(),
        category: String(payload?.category || '').trim()
      })
      if (!archive) {
        return { ok: false as const, status: 400, error: '空会话不能归档' }
      }
      persistChatMutation()
      return { ok: true as const, data: archive }
    },
    getChatPromptLogsBySessionId(sessionId: string, page = 1, pageSize = 30) {
      const normalizedSessionId = String(sessionId || '').trim()
      if (!chatRepository.getSessionById(normalizedSessionId)) {
        return { ok: false as const, status: 404, error: '会话不存在' }
      }
      const safePage = Math.max(1, Number(page || 1))
      const total = typeof chatRepository.countVisiblePromptLogMessagesBySessionId === 'function'
        ? chatRepository.countVisiblePromptLogMessagesBySessionId(normalizedSessionId)
        : chatRepository.countPromptLogsBySessionId(normalizedSessionId)
      const totalPages = Math.max(1, Math.ceil(total / pageSize))
      const currentPage = Math.min(safePage, totalPages)
      const offset = (currentPage - 1) * pageSize
      const entries = chatRepository.listPromptLogsBySessionId(normalizedSessionId, pageSize, offset)
      const indexMeta = buildPromptLogIndexMeta(normalizedSessionId)
      return {
        ok: true as const,
        data: {
          entries: entries.map((row: Record<string, any>) => toPromptLogEntry(row, indexMeta)),
          page: currentPage,
          pageSize,
          total,
          totalPages
        }
      }
    },
    createChatPromptLogBySessionId(sessionId: string, payload: Record<string, any>) {
      const normalizedSessionId = String(sessionId || '').trim()
      if (!chatRepository.getSessionById(normalizedSessionId)) {
        return { ok: false as const, status: 404, error: '会话不存在' }
      }
      const promptBlocks = Array.isArray(payload?.promptBlocks) ? payload.promptBlocks : []
      const finalPrompt = String(payload?.finalPrompt || '').trim()
      if (!promptBlocks.length && !finalPrompt) {
        return { ok: false as const, status: 400, error: '提示词日志不能为空' }
      }
      const total = chatRepository.countPromptLogsBySessionId(normalizedSessionId)
      const pageIndex = Math.floor(total / 30) + 1
      const entryIndex = (total % 30) + 1
      const logId = buildPromptLogId()
      chatRepository.insertPromptLog(normalizedSessionId, {
        id: logId,
        pageIndex,
        entryIndex,
        assistantMessageId: Number(payload?.assistantMessageId || 0),
        speakerName: String(payload?.speakerName || ''),
        targetId: String(payload?.targetId || ''),
        finalPrompt,
        promptBlocksJson: JSON.stringify(promptBlocks),
        logKind: ['internal_agent', 'manual_projection', 'message_projection'].includes(String(payload?.logKind || ''))
          ? String(payload?.logKind || '')
          : 'final_reply',
        createdAt: new Date().toISOString()
      })
      const entry = chatRepository.findPromptLogById(normalizedSessionId, logId)
      persistChatMutation()
      return { ok: true as const, data: toPromptLogEntry(entry as Record<string, any>) }
    },
    bindChatPromptLogMessageBySessionId(sessionId: string, logId: string, assistantMessageId: number) {
      const normalizedSessionId = String(sessionId || '').trim()
      if (!chatRepository.getSessionById(normalizedSessionId)) {
        return { ok: false as const, status: 404, error: '会话不存在' }
      }
      chatRepository.bindPromptLogMessage(normalizedSessionId, logId, assistantMessageId)
      persistChatMutation()
      return { ok: true as const }
    },
    deleteChatPromptLogsByMessageId(sessionId: string, messageId: string, keepLogId = '') {
      const normalizedSessionId = String(sessionId || '').trim()
      if (!chatRepository.getSessionById(normalizedSessionId)) {
        return { ok: false as const, status: 404, error: '会话不存在' }
      }
      chatRepository.deletePromptLogsByMessageIdExcept(normalizedSessionId, Number(messageId || 0), String(keepLogId || ''))
      persistChatMutation()
      return { ok: true as const }
    },
    locateChatPromptLogBySessionId(sessionId: string, messageId: string, kind = '') {
      const normalizedSessionId = String(sessionId || '').trim()
      if (!chatRepository.getSessionById(normalizedSessionId)) {
        return { ok: false as const, status: 404, error: '会话不存在' }
      }
      const normalizedMessageId = Number(messageId || 0)
      // 默认定位到“生成消息本身”的最终回复提示词；kind=message_projection 时定位到该消息的投影提示词
      const requestedKind = kind === 'message_projection' ? 'message_projection' : 'final_reply'
      let row = chatRepository.findLatestPromptLogByMessageId(normalizedSessionId, normalizedMessageId, requestedKind)
      // 兼容只存在单一日志的旧消息（如只投影过的用户消息）：找不到回复日志时退回最新一条
      if (!row && requestedKind === 'final_reply') {
        row = chatRepository.findLatestPromptLogByMessageId(normalizedSessionId, normalizedMessageId, '')
      }
      if (!row) {
        return { ok: false as const, status: 404, error: '未找到对应的提示词日志' }
      }
      const kindFlags = typeof chatRepository.countPromptLogKindsByMessageId === 'function'
        ? chatRepository.countPromptLogKindsByMessageId(normalizedSessionId, normalizedMessageId)
        : { hasReply: true, hasProjection: false }
      const page = typeof chatRepository.getPromptLogPageById === 'function'
        ? chatRepository.getPromptLogPageById(normalizedSessionId, String(row.id || ''), 30)
        : Number(row.pageIndex || row.page_index || 1)
      return {
        ok: true as const,
        data: {
          logId: String(row.id || ''),
          page: Number(page || 1),
          entry: toPromptLogEntry(row as Record<string, any>, buildPromptLogIndexMeta(normalizedSessionId)),
          hasReply: kindFlags.hasReply,
          hasProjection: kindFlags.hasProjection
        }
      }
    },
    locateChatPromptLogByLogIdBySessionId(sessionId: string, logId: string) {
      const normalizedSessionId = String(sessionId || '').trim()
      const normalizedLogId = String(logId || '').trim()
      if (!chatRepository.getSessionById(normalizedSessionId)) {
        return { ok: false as const, status: 404, error: '会话不存在' }
      }
      const row = chatRepository.findPromptLogById(normalizedSessionId, normalizedLogId)
      if (!row) {
        return { ok: false as const, status: 404, error: '未找到对应的提示词日志' }
      }
      const page = typeof chatRepository.getPromptLogPageById === 'function'
        ? chatRepository.getPromptLogPageById(normalizedSessionId, normalizedLogId, 30)
        : Number(row.pageIndex || row.page_index || 1)
      return {
        ok: true as const,
        data: {
          logId: String(row.id || ''),
          page: Number(page || 1),
          entry: toPromptLogEntry(row as Record<string, any>, buildPromptLogIndexMeta(normalizedSessionId))
        }
      }
    },
    getChatRecallActivityLogsBySessionId(sessionId: string, page = 1, pageSize = 30) {
      const normalizedSessionId = String(sessionId || '').trim()
      if (!chatRepository.getSessionById(normalizedSessionId)) {
        return { ok: false as const, status: 404, error: '会话不存在' }
      }
      const safePage = Math.max(1, Number(page || 1))
      const total = chatRepository.countRecallActivityLogsBySessionId(normalizedSessionId)
      const totalPages = Math.max(1, Math.ceil(total / pageSize))
      const currentPage = Math.min(safePage, totalPages)
      const offset = (currentPage - 1) * pageSize
      const entries = chatRepository.listRecallActivityLogsBySessionId(normalizedSessionId, pageSize, offset)
      return {
        ok: true as const,
        data: {
          entries: entries.map((row: Record<string, any>) => toRecallActivityLogEntry(row)),
          page: currentPage,
          pageSize,
          total,
          totalPages
        }
      }
    },
    createChatRecallActivityLogBySessionId(sessionId: string, payload: Record<string, any>) {
      const normalizedSessionId = String(sessionId || '').trim()
      if (!chatRepository.getSessionById(normalizedSessionId)) {
        return { ok: false as const, status: 404, error: '会话不存在' }
      }
      const activity = parseRecallActivity(payload?.activity)
      const runId = String((activity as any)?.id || payload?.runId || payload?.run_id || '').trim()
      if (!runId && !Object.keys(activity as Record<string, any>).length) {
        return { ok: false as const, status: 400, error: '召回活动日志不能为空' }
      }
      const total = chatRepository.countRecallActivityLogsBySessionId(normalizedSessionId)
      const pageIndex = Math.floor(total / 30) + 1
      const entryIndex = (total % 30) + 1
      const logId = buildRecallActivityLogId()
      const status = String((activity as any)?.status || payload?.status || 'completed')
      chatRepository.insertRecallActivityLog(normalizedSessionId, {
        id: logId,
        pageIndex,
        entryIndex,
        inputMessageId: Number(payload?.inputMessageId || payload?.input_message_id || 0),
        assistantMessageId: Number(payload?.assistantMessageId || 0),
        speakerName: String(payload?.speakerName || ''),
        targetId: String(payload?.targetId || ''),
        runId,
        status,
        activityJson: serializeRecallActivityLogForStorage(activity),
        createdAt: new Date().toISOString()
      })
      const entry = chatRepository.findRecallActivityLogById(normalizedSessionId, logId)
      persistChatMutation()
      return { ok: true as const, data: toRecallActivityLogEntry(entry as Record<string, any>) }
    },
    bindChatRecallActivityLogMessageBySessionId(sessionId: string, logId: string, assistantMessageId: number, inputMessageId = 0) {
      const normalizedSessionId = String(sessionId || '').trim()
      if (!chatRepository.getSessionById(normalizedSessionId)) {
        return { ok: false as const, status: 404, error: '会话不存在' }
      }
      chatRepository.bindRecallActivityLogMessage(normalizedSessionId, logId, assistantMessageId, inputMessageId)
      persistChatMutation()
      return { ok: true as const }
    },
    updateChatRecallActivityLogBySessionId(sessionId: string, logId: string, payload: Record<string, any>) {
      const normalizedSessionId = String(sessionId || '').trim()
      const normalizedLogId = String(logId || '').trim()
      if (!chatRepository.getSessionById(normalizedSessionId)) {
        return { ok: false as const, status: 404, error: '会话不存在' }
      }
      if (!normalizedLogId) {
        return { ok: false as const, status: 400, error: '召回活动日志 id 不能为空' }
      }
      const activity = payload?.activity === undefined ? undefined : parseRecallActivity(payload.activity)
      const runId = activity === undefined
        ? String(payload?.runId || payload?.run_id || '').trim()
        : String((activity as any)?.id || payload?.runId || payload?.run_id || '').trim()
      chatRepository.updateRecallActivityLog(normalizedSessionId, normalizedLogId, {
        inputMessageId: Number(payload?.inputMessageId || payload?.input_message_id || 0),
        assistantMessageId: Number(payload?.assistantMessageId || payload?.messageId || 0),
        speakerName: payload?.speakerName,
        targetId: payload?.targetId,
        runId,
        status: activity === undefined && payload?.status === undefined ? undefined : String((activity as any)?.status || payload?.status || 'completed'),
        activityJson: activity === undefined ? undefined : serializeRecallActivityLogForStorage(activity)
      })
      persistChatMutation()
      return { ok: true as const }
    },
    locateChatRecallActivityLogBySessionId(sessionId: string, messageId: string) {
      const normalizedSessionId = String(sessionId || '').trim()
      if (!chatRepository.getSessionById(normalizedSessionId)) {
        return { ok: false as const, status: 404, error: '会话不存在' }
      }
      const row = chatRepository.findLatestRecallActivityLogByMessageId(normalizedSessionId, Number(messageId || 0))
      if (!row) {
        return { ok: true as const, data: null }
      }
      return { ok: true as const, data: toRecallActivityLogEntry(row as Record<string, any>) }
    },
    createChatGenerationAttemptBySessionId(sessionId: string, payload: Record<string, any>) {
      const normalizedSessionId = String(sessionId || '').trim()
      if (!chatRepository.getSessionById(normalizedSessionId)) {
        return { ok: false as const, status: 404, error: '会话不存在' }
      }
      const attempt = normalizeGenerationAttemptPayload(normalizedSessionId, payload || {})
      chatRepository.insertGenerationAttempt(normalizedSessionId, attempt)
      persistChatMutation()
      return { ok: true as const, data: { id: attempt.id } }
    },
    updateChatGenerationAttemptBySessionId(sessionId: string, attemptId: string, payload: Record<string, any>) {
      const normalizedSessionId = String(sessionId || '').trim()
      const normalizedAttemptId = toText(attemptId)
      if (!chatRepository.getSessionById(normalizedSessionId)) {
        return { ok: false as const, status: 404, error: '会话不存在' }
      }
      if (!normalizedAttemptId) {
        return { ok: false as const, status: 400, error: '缺少生成尝试 ID' }
      }
      chatRepository.updateGenerationAttempt(normalizedSessionId, normalizedAttemptId, normalizeGenerationAttemptPatch(payload || {}))
      persistChatMutation()
      return { ok: true as const, data: { ok: true } }
    },
    getLatestChatGenerationAttemptByAnchor(sessionId: string, anchorMessageId: string) {
      const normalizedSessionId = String(sessionId || '').trim()
      if (!chatRepository.getSessionById(normalizedSessionId)) {
        return { ok: false as const, status: 404, error: '会话不存在' }
      }
      const row = chatRepository.findLatestGenerationAttemptByAnchor(normalizedSessionId, Number(anchorMessageId || 0))
      return { ok: true as const, data: toGenerationAttemptEntry(row as Record<string, any>) }
    },
    listChatGenerationAttemptsBySessionId(sessionId: string, limit?: string) {
      const normalizedSessionId = String(sessionId || '').trim()
      if (!chatRepository.getSessionById(normalizedSessionId)) {
        return { ok: false as const, status: 404, error: '会话不存在' }
      }
      const rows = chatRepository.listGenerationAttemptsBySessionId(normalizedSessionId, Number(limit || 200))
      return { ok: true as const, data: rows.map((row: Record<string, any>) => toGenerationAttemptEntry(row)) }
    },
    listChatGenerationAttemptsByRunId(sessionId: string, tidiaoRunId: string, limit?: string) {
      const normalizedSessionId = String(sessionId || '').trim()
      const normalizedRunId = String(tidiaoRunId || '').trim()
      if (!chatRepository.getSessionById(normalizedSessionId)) {
        return { ok: false as const, status: 404, error: '会话不存在' }
      }
      // 空 runId 不查全表，直接返回空（避免「无主键聚合」误带出整会话 attempt）。
      if (!normalizedRunId) {
        return { ok: true as const, data: [] }
      }
      const rows = chatRepository.listGenerationAttemptsByRunId(normalizedSessionId, normalizedRunId, Number(limit || 200))
      return { ok: true as const, data: rows.map((row: Record<string, any>) => toGenerationAttemptEntry(row)) }
    },
    createChatGenerationAttemptArtifactBySessionId(sessionId: string, payload: Record<string, any>) {
      const normalizedSessionId = String(sessionId || '').trim()
      if (!chatRepository.getSessionById(normalizedSessionId)) {
        return { ok: false as const, status: 404, error: '会话不存在' }
      }
      const artifact = normalizeGenerationAttemptArtifactPayload(normalizedSessionId, payload || {})
      if (!artifact.attemptId) {
        return { ok: false as const, status: 400, error: '缺少生成尝试 ID' }
      }
      chatRepository.insertGenerationAttemptArtifact(normalizedSessionId, artifact)
      persistChatMutation()
      return { ok: true as const, data: { id: artifact.id } }
    },
    getChat(targetId: string, options?: number | { limit?: number; beforeId?: number }) {
      repairAllLegacyChatTargets()
      cleanupLegacySessionContext()
      const sessionId = repairLegacyChatTarget(normalizeChatTargetId(targetId))
      let session = chatRepository.getSessionById(sessionId)
      if (!session) {
        ensureChatSession(sessionId)
        session = chatRepository.getSessionById(sessionId)
      }
      const messagePage = readDisplayMessages(sessionId, options)
      const messages = messagePage.messages
      logSummarySessionTrace('get-chat:response', sessionId, session as Record<string, any>, {
        messageCount: Array.isArray(messages) ? messages.length : 0
      })
      return {
        ok: true as const,
        data: {
          session: toWorldScopedChatSessionTransport(session as Record<string, unknown>),
          messages: messages.map((item: Record<string, unknown>) => toCamel(item)),
          pageInfo: messagePage.pageInfo
        }
      }
    },
    addChatMessage(targetId: string, payload: Record<string, any>) {
      const {
        role,
        content,
        time,
        envDate,
        envWeather,
        envLocation,
        image,
        model,
        crowdName,
        memberName,
        narrationProfileId,
        narration_profile_id,
        narrationProfileName,
        narration_profile_name,
        narrationProfileKind,
        narration_profile_kind,
        includeInContext,
        include_in_context,
        versionList,
        activeVersionIndex,
        autoWriteHidden,
        auto_write_hidden,
        autoWriteHiddenAt,
        auto_write_hidden_at,
        autoWriteBatchId,
        auto_write_batch_id,
        autoWriteHiddenReason,
        auto_write_hidden_reason
      } = payload
      const messageSourceKind = normalizeMessageSourceKind(payload.messageSourceKind ?? payload.message_source_kind)
      const focusedActionGroupId = String(payload.focusedActionGroupId ?? payload.focused_action_group_id ?? '').trim().slice(0, 240)
      const focusedActionVisibility = messageSourceKind === FOCUSED_ACTION_SOURCE_KIND
        ? normalizeFocusedActionVisibility(payload.focusedActionVisibility ?? payload.focused_action_visibility)
        : ''
      const sessionId = repairLegacyChatTarget(normalizeChatTargetId(targetId))

      if (!role || !content) {
        return { ok: false as const, status: 400, error: '消息必须包含role和content' }
      }
      if (typeof content !== 'string' || content.length > 50000) {
        return { ok: false as const, status: 400, error: '消息内容过长或格式错误' }
      }
      if (messageSourceKind === FOCUSED_ACTION_SOURCE_KIND && !focusedActionGroupId) {
        return { ok: false as const, status: 400, error: '动作消息缺少同组标识' }
      }

      ensureChatSession(sessionId)
      const result = chatRepository.insertMessage(sessionId, {
        role,
        messageKind: payload.messageKind ?? payload.message_kind,
        content,
        name: '',
        time: time ?? '',
        envDate: envDate ?? '',
        envWeather: envWeather ?? '',
        envLocation: envLocation ?? '',
        image: image ?? '',
        model: model ?? '',
        crowdName: crowdName ?? '',
        memberName: memberName ?? '',
        narrationProfileId: narrationProfileId ?? narration_profile_id ?? '',
        narrationProfileName: narrationProfileName ?? narration_profile_name ?? '',
        narrationProfileKind: narrationProfileKind ?? narration_profile_kind ?? '',
        includeInContext: includeInContext ?? include_in_context,
        messageSourceKind,
        focusedActionGroupId,
        focusedActionVisibility,
        versionsJson: JSON.stringify(Array.isArray(versionList) ? versionList : []),
        activeVersionIndex: Number.isInteger(activeVersionIndex) ? activeVersionIndex : 0,
        createdAt: new Date().toISOString(),
        autoWriteHidden: autoWriteHidden ?? auto_write_hidden,
        autoWriteHiddenAt: autoWriteHiddenAt ?? auto_write_hidden_at ?? '',
        autoWriteBatchId: autoWriteBatchId ?? auto_write_batch_id ?? '',
        autoWriteHiddenReason: autoWriteHiddenReason ?? auto_write_hidden_reason ?? ''
      })
      chatRepository.touchSession(sessionId)
      persistChatMutation()
      return { ok: true as const, data: { ok: true, id: (result as { lastInsertRowid: number }).lastInsertRowid } }
    },
    copyChatMessages(targetId: string, payload: Record<string, any>) {
      const messages = Array.isArray(payload?.messages) ? payload.messages : null
      if (!messages) {
        return { ok: false as const, status: 400, error: 'messages 必须是数组' }
      }
      if (!messages.length) {
        return { ok: true as const, data: { ok: true, count: 0 } }
      }
      const createdAt = new Date().toISOString()
      const normalizedMessages: Record<string, any>[] = []
      for (const message of messages) {
        if (!message || typeof message !== 'object' || Array.isArray(message)) {
          return { ok: false as const, status: 400, error: '消息格式错误' }
        }
        const normalized = normalizeCopiedChatMessage(message, createdAt)
        if (!normalized.ok) return normalized
        normalizedMessages.push(normalized.data)
      }
      const sessionId = repairLegacyChatTarget(normalizeChatTargetId(targetId))
      const result = chatRepository.transaction(() => {
        ensureChatSession(sessionId)
        const inserted = chatRepository.insertMessages(sessionId, normalizedMessages)
        chatRepository.touchSession(sessionId)
        return inserted
      })
      persistChatMutation()
      return { ok: true as const, data: { ok: true, count: Number(result?.count || 0) } }
    },
    updateChatMessage(targetId: string, msgId: string, payload: Record<string, any>) {
      const sessionId = repairLegacyChatTarget(normalizeChatTargetId(targetId))
      const body = payload || {}
      const fields: Record<string, unknown> = {}

      if (typeof body.content === 'string') {
        fields.content = body.content
      }
      if (typeof body.time === 'string') {
        fields.time = body.time
      }
      if (typeof body.envDate === 'string' || typeof body.env_date === 'string') {
        fields.env_date = body.envDate ?? body.env_date ?? ''
      }
      if (typeof body.envWeather === 'string' || typeof body.env_weather === 'string') {
        fields.env_weather = body.envWeather ?? body.env_weather ?? ''
      }
      if (typeof body.envLocation === 'string' || typeof body.env_location === 'string') {
        fields.env_location = body.envLocation ?? body.env_location ?? ''
      }
      if (typeof body.model === 'string') {
        fields.model = body.model
      }
      if (typeof body.crowdName === 'string' || typeof body.crowd_name === 'string') {
        fields.crowd_name = body.crowdName ?? body.crowd_name ?? ''
      }
      if (typeof body.memberName === 'string' || typeof body.member_name === 'string' || typeof body.name === 'string') {
        fields.member_name = body.memberName ?? body.member_name ?? body.name ?? ''
      }
      if (typeof body.narrationProfileId === 'string' || typeof body.narration_profile_id === 'string') {
        fields.narration_profile_id = body.narrationProfileId ?? body.narration_profile_id ?? ''
      }
      if (typeof body.narrationProfileName === 'string' || typeof body.narration_profile_name === 'string') {
        fields.narration_profile_name = body.narrationProfileName ?? body.narration_profile_name ?? ''
      }
      if (typeof body.narrationProfileKind === 'string' || typeof body.narration_profile_kind === 'string') {
        fields.narration_profile_kind = body.narrationProfileKind ?? body.narration_profile_kind ?? ''
      }
      if (body.includeInContext !== undefined || body.include_in_context !== undefined) {
        fields.include_in_context = Number(Boolean(body.includeInContext ?? body.include_in_context))
      }
      if (body.focusedActionVisibility !== undefined || body.focused_action_visibility !== undefined) {
        fields.focused_action_visibility = normalizeFocusedActionVisibility(body.focusedActionVisibility ?? body.focused_action_visibility)
      }
      if (body.autoWriteHidden !== undefined || body.auto_write_hidden !== undefined) {
        fields.auto_write_hidden = Number(Boolean(body.autoWriteHidden ?? body.auto_write_hidden))
      }
      if (typeof body.autoWriteHiddenAt === 'string' || typeof body.auto_write_hidden_at === 'string') {
        fields.auto_write_hidden_at = body.autoWriteHiddenAt ?? body.auto_write_hidden_at ?? ''
      }
      if (typeof body.autoWriteBatchId === 'string' || typeof body.auto_write_batch_id === 'string') {
        fields.auto_write_batch_id = body.autoWriteBatchId ?? body.auto_write_batch_id ?? ''
      }
      if (typeof body.autoWriteHiddenReason === 'string' || typeof body.auto_write_hidden_reason === 'string') {
        fields.auto_write_hidden_reason = body.autoWriteHiddenReason ?? body.auto_write_hidden_reason ?? ''
      }
      if (Array.isArray(body.versionList) || Array.isArray(body.versionsJson) || Array.isArray(body.versions_json)) {
        fields.versions_json = JSON.stringify(body.versionList ?? body.versionsJson ?? body.versions_json ?? [])
      }
      if (Number.isInteger(body.activeVersionIndex) || Number.isInteger(body.active_version_index)) {
        fields.active_version_index = Number(body.activeVersionIndex ?? body.active_version_index ?? 0)
      }
      // 图片附件回填（带图乐观发送计划·2026-07-11）：同上方 updateChatMessageBySessionId，整体覆盖 attachments_json。
      if (Array.isArray(body.attachments) || typeof body.attachments_json === 'string') {
        fields.attachments_json = typeof body.attachments_json === 'string'
          ? body.attachments_json
          : JSON.stringify(body.attachments)
      }

      if (Object.keys(fields).length === 0) {
        return { ok: true as const, data: { ok: true, skipped: true } }
      }

      if (shouldInvalidateAffectTideForMessagePayload(body)) {
        deleteAffectTideFromMessage(sessionId, msgId, 'from_message')
      }
      chatRepository.updateMessageBySession(msgId, sessionId, fields)
      persistChatMutation()
      return { ok: true as const, data: { ok: true } }
    },
    deleteChatMessage(targetId: string, msgId: string) {
      const sessionId = repairLegacyChatTarget(normalizeChatTargetId(targetId))
      const message = chatRepository.findMessageByIdInSession?.(sessionId, Number(msgId || 0))
      deleteAffectTideFromMessage(sessionId, msgId, 'referenced')
      chatRepository.deleteMessageBySession(msgId, sessionId)
      chatRepository.deletePromptLogsByMessageId(sessionId, Number(msgId || 0))
      chatRepository.deleteRecallActivityLogsByMessageId(sessionId, Number(msgId || 0), String(message?.role || ''))
      persistChatMutation()
      return { ok: true as const }
    },
    clearChatMessages(targetId: string) {
      const sessionId = repairLegacyChatTarget(normalizeChatTargetId(targetId))
      chatRepository.clearMessagesBySessionId(sessionId)
      chatRepository.clearPromptLogsBySessionId(sessionId)
      chatRepository.clearRecallActivityLogsBySessionId(sessionId)
      persistChatMutation()
      return { ok: true as const }
    },
    getChatPromptLogs(targetId: string, page = 1, pageSize = 30) {
      const sessionId = repairLegacyChatTarget(normalizeChatTargetId(targetId))
      ensureChatSession(sessionId)
      const safePage = Math.max(1, Number(page || 1))
      const total = chatRepository.countPromptLogsBySessionId(sessionId)
      const totalPages = Math.max(1, Math.ceil(total / pageSize))
      const currentPage = Math.min(safePage, totalPages)
      const offset = (currentPage - 1) * pageSize
      const entries = chatRepository.listPromptLogsBySessionId(sessionId, pageSize, offset)
      const indexMeta = buildPromptLogIndexMeta(sessionId)
      return {
        ok: true as const,
        data: {
          entries: entries.map((row: Record<string, any>) => toPromptLogEntry(row, indexMeta)),
          page: currentPage,
          pageSize,
          total,
          totalPages
        }
      }
    },
    createChatPromptLog(targetId: string, payload: Record<string, any>) {
      const sessionId = repairLegacyChatTarget(normalizeChatTargetId(targetId))
      ensureChatSession(sessionId)
      const promptBlocks = Array.isArray(payload?.promptBlocks) ? payload.promptBlocks : []
      const finalPrompt = String(payload?.finalPrompt || '').trim()
      if (!promptBlocks.length && !finalPrompt) {
        return { ok: false as const, status: 400, error: '提示词日志不能为空' }
      }
      const total = chatRepository.countPromptLogsBySessionId(sessionId)
      const pageIndex = Math.floor(total / 30) + 1
      const entryIndex = (total % 30) + 1
      const logId = buildPromptLogId()
      chatRepository.insertPromptLog(sessionId, {
        id: logId,
        pageIndex,
        entryIndex,
        assistantMessageId: Number(payload?.assistantMessageId || 0),
        speakerName: String(payload?.speakerName || ''),
        targetId: String(payload?.targetId || ''),
        finalPrompt,
        promptBlocksJson: JSON.stringify(promptBlocks),
        logKind: ['internal_agent', 'manual_projection', 'message_projection'].includes(String(payload?.logKind || ''))
          ? String(payload?.logKind || '')
          : 'final_reply',
        createdAt: new Date().toISOString()
      })
      const entry = chatRepository.findPromptLogById(sessionId, logId)
      persistChatMutation()
      return { ok: true as const, data: toPromptLogEntry(entry as Record<string, any>) }
    },
    bindChatPromptLogMessage(targetId: string, logId: string, assistantMessageId: number) {
      const sessionId = repairLegacyChatTarget(normalizeChatTargetId(targetId))
      ensureChatSession(sessionId)
      chatRepository.bindPromptLogMessage(sessionId, logId, assistantMessageId)
      persistChatMutation()
      return { ok: true as const }
    },
    deleteChatPromptLogsByMessageId(targetId: string, messageId: string, keepLogId = '') {
      const sessionId = repairLegacyChatTarget(normalizeChatTargetId(targetId))
      ensureChatSession(sessionId)
      chatRepository.deletePromptLogsByMessageIdExcept(sessionId, Number(messageId || 0), String(keepLogId || ''))
      persistChatMutation()
      return { ok: true as const }
    },
    locateChatPromptLog(targetId: string, messageId: string, kind = '') {
      const sessionId = repairLegacyChatTarget(normalizeChatTargetId(targetId))
      ensureChatSession(sessionId)
      const normalizedMessageId = Number(messageId || 0)
      const requestedKind = kind === 'message_projection' ? 'message_projection' : 'final_reply'
      let row = chatRepository.findLatestPromptLogByMessageId(sessionId, normalizedMessageId, requestedKind)
      if (!row && requestedKind === 'final_reply') {
        row = chatRepository.findLatestPromptLogByMessageId(sessionId, normalizedMessageId, '')
      }
      if (!row) {
        return { ok: false as const, status: 404, error: '未找到对应的提示词日志' }
      }
      const kindFlags = typeof chatRepository.countPromptLogKindsByMessageId === 'function'
        ? chatRepository.countPromptLogKindsByMessageId(sessionId, normalizedMessageId)
        : { hasReply: true, hasProjection: false }
      const page = typeof chatRepository.getPromptLogPageById === 'function'
        ? chatRepository.getPromptLogPageById(sessionId, String(row.id || ''), 30)
        : Number(row.pageIndex || row.page_index || 1)
      return {
        ok: true as const,
        data: {
          logId: String(row.id || ''),
          page: Number(page || 1),
          hasReply: kindFlags.hasReply,
          hasProjection: kindFlags.hasProjection
        }
      }
    },
    locateChatPromptLogByLogId(targetId: string, logId: string) {
      const sessionId = repairLegacyChatTarget(normalizeChatTargetId(targetId))
      ensureChatSession(sessionId)
      const normalizedLogId = String(logId || '').trim()
      const row = chatRepository.findPromptLogById(sessionId, normalizedLogId)
      if (!row) {
        return { ok: false as const, status: 404, error: '未找到对应的提示词日志' }
      }
      const page = typeof chatRepository.getPromptLogPageById === 'function'
        ? chatRepository.getPromptLogPageById(sessionId, normalizedLogId, 30)
        : Number(row.pageIndex || row.page_index || 1)
      return {
        ok: true as const,
        data: {
          logId: String(row.id || ''),
          page: Number(page || 1),
          entry: toPromptLogEntry(row as Record<string, any>, buildPromptLogIndexMeta(sessionId))
        }
      }
    },
    getChatRecallActivityLogs(targetId: string, page = 1, pageSize = 30) {
      const sessionId = repairLegacyChatTarget(normalizeChatTargetId(targetId))
      ensureChatSession(sessionId)
      const safePage = Math.max(1, Number(page || 1))
      const total = chatRepository.countRecallActivityLogsBySessionId(sessionId)
      const totalPages = Math.max(1, Math.ceil(total / pageSize))
      const currentPage = Math.min(safePage, totalPages)
      const offset = (currentPage - 1) * pageSize
      const entries = chatRepository.listRecallActivityLogsBySessionId(sessionId, pageSize, offset)
      return {
        ok: true as const,
        data: {
          entries: entries.map((row: Record<string, any>) => toRecallActivityLogEntry(row)),
          page: currentPage,
          pageSize,
          total,
          totalPages
        }
      }
    },
    createChatRecallActivityLog(targetId: string, payload: Record<string, any>) {
      const sessionId = repairLegacyChatTarget(normalizeChatTargetId(targetId))
      ensureChatSession(sessionId)
      return this.createChatRecallActivityLogBySessionId(sessionId, payload)
    },
    bindChatRecallActivityLogMessage(targetId: string, logId: string, assistantMessageId: number, inputMessageId = 0) {
      const sessionId = repairLegacyChatTarget(normalizeChatTargetId(targetId))
      ensureChatSession(sessionId)
      chatRepository.bindRecallActivityLogMessage(sessionId, logId, assistantMessageId, inputMessageId)
      persistChatMutation()
      return { ok: true as const }
    },
    updateChatRecallActivityLog(targetId: string, logId: string, payload: Record<string, any>) {
      const sessionId = repairLegacyChatTarget(normalizeChatTargetId(targetId))
      ensureChatSession(sessionId)
      return this.updateChatRecallActivityLogBySessionId(sessionId, logId, payload)
    },
    locateChatRecallActivityLog(targetId: string, messageId: string) {
      const sessionId = repairLegacyChatTarget(normalizeChatTargetId(targetId))
      ensureChatSession(sessionId)
      const row = chatRepository.findLatestRecallActivityLogByMessageId(sessionId, Number(messageId || 0))
      if (!row) {
        return { ok: true as const, data: null }
      }
      return { ok: true as const, data: toRecallActivityLogEntry(row as Record<string, any>) }
    },
    updateChatSession(targetId: string, payload: Record<string, any>) {
      try {
        const sessionId = repairLegacyChatTarget(normalizeChatTargetId(targetId))
        const body = payload || {}
        logSummarySessionTrace('update-session:request', sessionId, chatRepository.getSessionById(sessionId), {
          requestLoadedSummaryIds: normalizeLoggedSummaryIds(body.loaded_summary_ids ?? body.loadedSummaryIds),
          requestBody: body
        })
        ensureChatSession(sessionId)
        const result = updateSessionFields(sessionId, body)
        if (result.error) {
          return { ok: false as const, status: result.status || 400, error: result.error }
        }
        if (!result.changed) {
          return { ok: true as const, data: { ok: true, skipped: true } }
        }

        logSummarySessionTrace('update-session:stored', sessionId, chatRepository.getSessionById(sessionId), {
          storedFields: result.fields
        })
        return { ok: true as const, data: { ok: true } }
      } catch (error) {
        logger.error('更新会话配置失败:', error)
        return { ok: false as const, status: 500, error: '更新会话配置失败' }
      }
    },
    listChatArchives() {
      repairAllLegacyChatTargets()
      deps.repairOrphanChatArchives?.()
      const rows = chatRepository.listArchivedSessions()
      return rows.map((row: Record<string, any>) => toArchiveRecord(row))
    },
    startNewChat(targetId: string) {
      const normalizedTargetId = repairLegacyChatTarget(normalizeChatTargetId(targetId))
      archiveChatSession(normalizedTargetId)
      const targetType = normalizedTargetId.startsWith('group_')
        ? 'group'
        : normalizedTargetId.startsWith('crowd_')
          ? 'crowd'
          : 'char'
      return createChatSessionFromPayload({
        targetId: normalizedTargetId,
        targetType,
        title: '',
        participants: [{ targetId: normalizedTargetId, targetType, displayOrder: 0 }]
      })
    },
    updateChatArchive(archiveId: string, payload: Record<string, any>) {
      const name = String(payload?.name || '').trim()
      const category = String(payload?.category || '').trim()
      chatRepository.updateArchiveMetadata(archiveId, name || null, category || null)
      persistChatMutation()
      return { ok: true as const }
    },
    deleteChatArchives(ids: string[]) {
      const safeIds = Array.isArray(ids) ? ids.map((item) => String(item || '').trim()).filter(Boolean) : []
      if (!safeIds.length) return { ok: true as const }
      for (const id of safeIds) {
        chatRepository.deleteArchiveById(id)
      }
      persistChatMutation()
      return { ok: true as const }
    },
    loadChatArchive(archiveId: string, targetId: string) {
      const normalizedTargetId = repairLegacyChatTarget(normalizeChatTargetId(targetId))
      const archive = chatRepository.getArchivedSessionById(archiveId)
      if (!archive) {
        return { ok: false as const, status: 404, error: '聊天记录不存在' }
      }
      const currentSession = chatRepository.getSessionById(normalizedTargetId)
      if (String(currentSession?.linked_archive_id || '').trim() === String(archiveId || '').trim()) {
        return { ok: true as const }
      }

      archiveChatSession(normalizedTargetId)
      resetActiveChatMessages(normalizedTargetId)
      ensureChatSession(normalizedTargetId)
      chatRepository.applyArchiveToSession(normalizedTargetId, archive)
      cloneSessionMessages(String(archive.id || ''), normalizedTargetId)
      persistChatMutation()
      return { ok: true as const }
    },
    exportChatArchives(ids: string[]) {
      const safeIds = Array.isArray(ids) ? ids.map((item) => String(item || '').trim()).filter(Boolean) : []
      const archiveIds = safeIds.length
        ? safeIds
        : chatRepository.listArchivedSessionIds()
      const items = archiveIds.map((id) => {
        const session = chatRepository.getArchivedSessionById(id)
        if (!session) return null
        const messages = chatRepository.getMessagesBySessionIdOrdered(id)
        return {
          session: toWorldScopedChatSessionTransport(session),
          messages: messages.map((item: Record<string, unknown>) => toCamel(item)),
          messageCount: messages.length
        }
      }).filter(Boolean)
      return {
        ok: true as const,
        data: {
          version: 1,
          exportedAt: new Date().toISOString(),
          items
        }
      }
    },
    importChatArchives(payload: Record<string, any>) {
      const items = Array.isArray(payload?.items) ? payload.items : []
      for (const item of items) {
        const rawSession = item?.session
        const rawMessages = Array.isArray(item?.messages) ? item.messages : []
        const archiveId = `archive_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
        chatRepository.insertArchivedSession({
          id: archiveId,
          targetId: normalizeChatTargetId(String(rawSession?.targetId ?? rawSession?.target_id ?? rawSession?.sourceTargetId ?? rawSession?.source_target_id ?? '')),
          targetType: String(rawSession?.target_type || 'char'),
          archiveName: String(rawSession?.archiveName ?? rawSession?.archive_name ?? rawSession?.targetId ?? rawSession?.target_id ?? archiveId),
          archiveCategory: String(rawSession?.archiveCategory ?? rawSession?.archive_category ?? ''),
          sourceTargetId: normalizeChatTargetId(String(rawSession?.sourceTargetId ?? rawSession?.source_target_id ?? rawSession?.targetId ?? rawSession?.target_id ?? '')),
          createdAt: String(rawSession?.created_at || new Date().toISOString()),
          loadedSummaryIds: JSON.stringify(rawSession?.loadedSummaryIds ?? rawSession?.loaded_summary_ids ?? []),
          virtualSceneName: String(rawSession?.virtualSceneName ?? rawSession?.virtual_scene_name ?? ''),
          virtualSceneDesc: String(rawSession?.virtualSceneDesc ?? rawSession?.virtual_scene_desc ?? ''),
          virtualLocation: String(rawSession?.virtualLocation ?? rawSession?.virtual_location ?? ''),
          virtualSceneWorldId: String(rawSession?.virtualSceneWorldId ?? rawSession?.virtual_scene_world_id ?? ''),
          virtualLocationSheetId: String(rawSession?.virtualLocationSheetId ?? rawSession?.virtual_location_sheet_id ?? ''),
          virtualLocationFeatureId: String(rawSession?.virtualLocationFeatureId ?? rawSession?.virtual_location_feature_id ?? ''),
          virtualRealLocation: String(rawSession?.virtualRealLocation ?? rawSession?.virtual_real_location ?? ''),
          virtualTime: String(rawSession?.virtualTime ?? rawSession?.virtual_time ?? ''),
          virtualTimeAnchor: Number(rawSession?.virtualTimeAnchor ?? rawSession?.virtual_time_anchor ?? 0),
          virtualTimeBase: Number(rawSession?.virtualTimeBase ?? rawSession?.virtual_time_base ?? 0),
          virtualTimeRate: Number(rawSession?.virtualTimeRate ?? rawSession?.virtual_time_rate ?? 1),
          virtualWeather: String(rawSession?.virtualWeather ?? rawSession?.virtual_weather ?? ''),
          virtualWeatherMode: String(rawSession?.virtualWeatherMode ?? rawSession?.virtual_weather_mode ?? 'real'),
          boundAlias: String(rawSession?.boundAlias ?? rawSession?.bound_alias ?? ''),
          narrationFrequency: normalizeNarrationFrequency(rawSession?.narrationFrequency ?? rawSession?.narration_frequency),
          narrationTemperature: normalizeNarrationTemperature(rawSession?.narrationTemperature ?? rawSession?.narration_temperature),
          chatFontScale: normalizeChatFontScale(rawSession?.chatFontScale ?? rawSession?.chat_font_scale),
          tempModel: String(rawSession?.tempModel ?? rawSession?.temp_model ?? ''),
          tempPreset: String(rawSession?.tempPreset ?? rawSession?.temp_preset ?? ''),
          updatedAt: String(rawSession?.updated_at || new Date().toISOString())
        })
        for (const message of rawMessages) {
          chatRepository.insertArchiveMessage(archiveId, message)
        }
      }
      persistChatMutation()
      return { ok: true as const }
    }
  }
}
