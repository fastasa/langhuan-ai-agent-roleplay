import type {
  AgentModelConfig,
  AiProviderMode,
  ApiPreset,
  PromptPreset,
  RecallCandidateGenerationMode,
  RecallConfirmedContentStrategy,
  RecallIntentSnapshotMode,
  WriteBackAuditLogLevel
} from '../types'
import { API } from '../config/api'
import type { WorkspaceSettingsSnapshot } from '../types/workspace'
import { buildWeatherDetailSummary } from '../utils/environmentFormat'
import { cloneDefaultModelUsageConfigs, normalizeModelUsageConfigs } from '../utils/modelUsageConfig'

export interface SettingDraftState {
  apiPresetDraft: Record<string, unknown>
  selectedApiPresetIndex: number
}

export interface ResolvedSettingsState {
  apiPresets: ApiPreset[]
  defaultPreset: ApiPreset | null
  aiProviderMode: AiProviderMode
  promptPresets: PromptPreset[]
  currentTime: string
  currentWeather: string
  currentLocation: string
  weatherDetail: Record<string, unknown> | string | null
  locationHistory: Array<{ timestamp: number; from: string; to: string }>
  weatherHistory: Array<{ timestamp: number; weather: string }>
  darkMode: boolean | null
  aiEvaluationEnabled: boolean | null
  summaryPrompt: string
  bigSummaryPrompt: string
  dailyReportPrompt: string
  chatSummaryPresetName: string
  chatSummaryModel: string
  agentModelConfigs: AgentModelConfig[]
}

export interface SettingStoreStateTarget {
  apiPresets: { value: ApiPreset[] }
  defaultPreset: { value: ApiPreset | null }
  aiProviderMode: { value: AiProviderMode }
  promptPresets: { value: PromptPreset[] }
  currentTime: { value: string }
  currentWeather: { value: string }
  currentLocation: { value: string }
  weatherDetail: { value: unknown }
  locationHistory: { value: Array<{ timestamp: number; from: string; to: string }> }
  weatherHistory: { value: Array<{ timestamp: number; weather: string }> }
  darkMode: { value: boolean }
  aiEvaluationEnabled: { value: boolean }
  summaryPrompt: { value: string }
  bigSummaryPrompt: { value: string }
  dailyReportPrompt: { value: string }
  chatSummaryPresetName: { value: string }
  chatSummaryModel: { value: string }
  agentModelConfigs: { value: AgentModelConfig[] }
}

export interface ApplyResolvedSettingsStateOptions {
  sanitizePromptPresetInput: (preset: PromptPreset) => PromptPreset
  ensureBuiltinPromptPresets: () => Promise<void>
  normalizeWeatherDetail: (input: unknown) => unknown
  darkModeFallback: boolean
}

export function normalizeSettingsWeatherDetail(input: unknown): Record<string, string> | null {
  if (!input || typeof input !== 'object') return null
  const record = input as Record<string, unknown>
  return {
    text: String(record.text || ''),
    temp: String(record.temp || ''),
    feelsLike: String(record.feelsLike ?? record.feels_like ?? ''),
    humidity: String(record.humidity || ''),
    windDir: String(record.windDir ?? record.wind_dir ?? ''),
    windScale: String(record.windScale ?? record.wind_scale ?? ''),
    windSpeed: String(record.windSpeed ?? record.wind_speed ?? ''),
    precip: String(record.precip || ''),
    pressure: String(record.pressure || ''),
    vis: String(record.vis || ''),
    cloud: String(record.cloud || ''),
    dew: String(record.dew || ''),
    icon: String(record.icon || ''),
    obsTime: String(record.obsTime ?? record.obs_time ?? '')
  }
}

export function normalizeAvailableModels(models: unknown): string[] {
  if (Array.isArray(models)) return models as string[]
  if (typeof models === 'string') {
    try {
      const parsed = JSON.parse(models)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  return []
}

export function normalizeAiProviderMode(value: unknown): AiProviderMode {
  void value
  return 'custom'
}

export const DEFAULT_BRAIN_AGENT_CONFIG: AgentModelConfig = {
  id: 'brain_agent',
  name: '大脑 Agent',
  agentType: 'brain',
  modelUsageConfigs: cloneDefaultModelUsageConfigs(),
  presetName: '',
  recallModel: '',
  recallMaxTokens: 512,
  disableRecallThinking: true,
  fallbackPresetName: '',
  fallbackRecallModel: '',
  fallbackRecallMaxTokens: 512,
  embeddingPresetId: '',
  narrationQuickJudgePresetName: '',
  narrationQuickJudgeModel: '',
  narrativeBeatPresetName: '',
  narrativeBeatModel: '',
  narrativeBeatMaxTokens: 8192,
  narrationGenerationPresetName: '',
  narrationGenerationModel: '',
  virtualSceneLocationPresetName: '',
  virtualSceneLocationModel: '',
  virtualSceneLocationMaxTokens: 512,
  intentSnapshotMode: 'rules',
  recallCandidateMode: 'parallel_merge',
  recallContentStrategy: 'summary_gate',
  writeBackMaxReviewRounds: 3,
  writeBackAuditLogLevel: 'standard',
  enabled: true,
  capabilities: ['recall_judgment', 'writeback_review', 'narration_quick_judge', 'narrative_beat', 'narration_generation', 'virtual_scene_location_scan']
}

function normalizeRecallCandidateMode(value: unknown): RecallCandidateGenerationMode {
  return value === 'rules_first' || value === 'embedding_first' ? value : 'parallel_merge'
}

function normalizeRecallContentStrategy(value: unknown): RecallConfirmedContentStrategy {
  return value === 'full_aware' ? 'full_aware' : 'summary_gate'
}

function normalizeRecallIntentSnapshotMode(value: unknown): RecallIntentSnapshotMode {
  return value === 'smart' ? 'smart' : 'rules'
}

function normalizeAuditLogLevel(value: unknown): WriteBackAuditLogLevel {
  return value === 'summary' || value === 'debug' ? value : 'standard'
}

function normalizeAgentMaxTokens(value: unknown, fallback: number): number {
  const raw = Number(value ?? fallback)
  if (!Number.isFinite(raw) || raw <= 0) return fallback
  return Math.max(1, Math.min(4096, Math.trunc(raw)))
}

function normalizeNarrativeBeatMaxTokens(value: unknown, fallback: number): number {
  const raw = Number(value ?? fallback)
  if (!Number.isFinite(raw) || raw <= 0) return fallback
  return Math.max(1024, Math.min(32768, Math.trunc(raw)))
}

function normalizeTemperature(value: unknown, fallback: number): number {
  const raw = Number(value ?? fallback)
  if (!Number.isFinite(raw)) return fallback
  return Math.max(0, Math.min(2, raw))
}

export function normalizeAgentModelConfig(input: unknown, fallback: AgentModelConfig = DEFAULT_BRAIN_AGENT_CONFIG): AgentModelConfig {
  const record = input && typeof input === 'object' ? input as Record<string, unknown> : {}
  const rawCapabilities = Array.isArray(record.capabilities) ? record.capabilities : fallback.capabilities
  const modelUsageConfigs = normalizeModelUsageConfigs(record, fallback.modelUsageConfigs || DEFAULT_BRAIN_AGENT_CONFIG.modelUsageConfigs || [])
  // 平铺 legacy 字段同步源：校书 balanced→presetName/recallModel、书童 fast→narrationQuickJudge*、
  // 掌阁 smart→narrativeBeat*、执笔 message→narrationGeneration*。
  // 平铺字段继续写库=旧版本代码回滚仍可读（readLegacyUsageDraft 第3代链源头），不是新真值。
  const usageById = new Map(modelUsageConfigs.map((item) => [item.id, item]))
  const balancedUsage = usageById.get('balanced')
  const quickUsage = usageById.get('fast')
  const highVolumeUsage = usageById.get('smart')
  const narrationUsage = usageById.get('message')
  const maxReviewRounds = Number(
    record.writeBackMaxReviewRounds
    ?? record.write_back_max_review_rounds
    ?? record.maxReviewRounds
    ?? record.max_review_rounds
    ?? fallback.writeBackMaxReviewRounds
  )
  return {
    id: String(record.id || fallback.id),
    name: String(record.name || fallback.name),
    agentType: String(record.agentType ?? record.agent_type ?? fallback.agentType),
    modelUsageConfigs,
    presetName: String(balancedUsage?.presetName || record.presetName || record.preset_name || fallback.presetName || ''),
    recallModel: String(balancedUsage?.model || record.recallModel || record.recall_model || record.model || fallback.recallModel || ''),
    recallMaxTokens: normalizeAgentMaxTokens(
      record.recallMaxTokens ?? record.recall_max_tokens,
      fallback.recallMaxTokens ?? DEFAULT_BRAIN_AGENT_CONFIG.recallMaxTokens ?? 512
    ),
    disableRecallThinking: usageById.get('balanced')?.thinking
      ? usageById.get('balanced')?.thinking === 'disabled'
      : (record.disableRecallThinking ?? record.disable_recall_thinking ?? fallback.disableRecallThinking ?? true ? true : false),
    fallbackPresetName: String(
      record.fallbackPresetName
      ?? record.fallback_preset_name
      ?? fallback.fallbackPresetName
      ?? ''
    ),
    fallbackRecallModel: String(
      record.fallbackRecallModel
      ?? record.fallback_recall_model
      ?? record.fallbackModel
      ?? record.fallback_model
      ?? fallback.fallbackRecallModel
      ?? ''
    ),
    fallbackRecallMaxTokens: normalizeAgentMaxTokens(
      record.fallbackRecallMaxTokens ?? record.fallback_recall_max_tokens,
      fallback.fallbackRecallMaxTokens ?? DEFAULT_BRAIN_AGENT_CONFIG.fallbackRecallMaxTokens ?? 512
    ),
    embeddingPresetId: String(record.embeddingPresetId ?? record.embedding_preset_id ?? fallback.embeddingPresetId ?? '').trim(),
    narrationQuickJudgePresetName: String(quickUsage?.presetName || record.narrationQuickJudgePresetName || record.narration_quick_judge_preset_name || fallback.narrationQuickJudgePresetName || '').trim(),
    narrationQuickJudgeModel: String(quickUsage?.model || record.narrationQuickJudgeModel || record.narration_quick_judge_model || fallback.narrationQuickJudgeModel || '').trim(),
    narrativeBeatPresetName: String(highVolumeUsage?.presetName || record.narrativeBeatPresetName || record.narrative_beat_preset_name || fallback.narrativeBeatPresetName || '').trim(),
    narrativeBeatModel: String(highVolumeUsage?.model || record.narrativeBeatModel || record.narrative_beat_model || fallback.narrativeBeatModel || '').trim(),
    narrativeBeatMaxTokens: normalizeNarrativeBeatMaxTokens(
      highVolumeUsage?.maxTokens ?? record.narrativeBeatMaxTokens ?? record.narrative_beat_max_tokens,
      fallback.narrativeBeatMaxTokens ?? DEFAULT_BRAIN_AGENT_CONFIG.narrativeBeatMaxTokens ?? 8192
    ),
    narrationGenerationPresetName: String(narrationUsage?.presetName || record.narrationGenerationPresetName || record.narration_generation_preset_name || fallback.narrationGenerationPresetName || '').trim(),
    narrationGenerationModel: String(narrationUsage?.model || record.narrationGenerationModel || record.narration_generation_model || fallback.narrationGenerationModel || '').trim(),
    virtualSceneLocationPresetName: String(record.virtualSceneLocationPresetName ?? record.virtual_scene_location_preset_name ?? fallback.virtualSceneLocationPresetName ?? '').trim(),
    virtualSceneLocationModel: String(record.virtualSceneLocationModel ?? record.virtual_scene_location_model ?? fallback.virtualSceneLocationModel ?? '').trim(),
    virtualSceneLocationMaxTokens: normalizeAgentMaxTokens(
      record.virtualSceneLocationMaxTokens ?? record.virtual_scene_location_max_tokens,
      fallback.virtualSceneLocationMaxTokens ?? DEFAULT_BRAIN_AGENT_CONFIG.virtualSceneLocationMaxTokens ?? 512
    ),
    intentSnapshotMode: normalizeRecallIntentSnapshotMode(
      record.intentSnapshotMode ?? record.intent_snapshot_mode ?? fallback.intentSnapshotMode
    ),
    recallCandidateMode: normalizeRecallCandidateMode(
      record.recallCandidateMode ?? record.recall_candidate_mode ?? fallback.recallCandidateMode
    ),
    recallContentStrategy: normalizeRecallContentStrategy(
      record.recallContentStrategy
      ?? record.recall_content_strategy
      ?? legacyRecallContentStrategy(record.readStrategy ?? record.read_strategy)
      ?? fallback.recallContentStrategy
    ),
    writeBackMaxReviewRounds: Number.isFinite(maxReviewRounds)
      ? Math.max(1, Math.min(10, Math.trunc(maxReviewRounds)))
      : fallback.writeBackMaxReviewRounds,
    writeBackAuditLogLevel: normalizeAuditLogLevel(
      record.writeBackAuditLogLevel
      ?? record.write_back_audit_log_level
      ?? record.auditLogLevel
      ?? record.audit_log_level
      ?? fallback.writeBackAuditLogLevel
    ),
    enabled: record.enabled === undefined ? fallback.enabled : record.enabled !== false,
    capabilities: rawCapabilities.map((item) => String(item || '').trim()).filter(Boolean)
  }
}

function legacyRecallContentStrategy(value: unknown): RecallConfirmedContentStrategy | undefined {
  if (value === 'expansive') return 'full_aware'
  if (value === 'compact' || value === 'balanced') return 'summary_gate'
  return undefined
}

export function normalizeAgentModelConfigs(input: unknown): AgentModelConfig[] {
  const source = Array.isArray(input)
    ? input
    : (input && typeof input === 'object' && Array.isArray((input as Record<string, unknown>).agents)
        ? (input as { agents: unknown[] }).agents
        : [])
  const normalized = source.map((item) => normalizeAgentModelConfig(item))
  const hasBrainAgent = normalized.some((item) => item.id === DEFAULT_BRAIN_AGENT_CONFIG.id)
  return hasBrainAgent ? normalized : [DEFAULT_BRAIN_AGENT_CONFIG, ...normalized]
}

export function normalizeApiPreset(input: any): ApiPreset {
  const providerType = String(input?.providerType || input?.provider_type || 'openai-compatible')
  const isDefault = input?.isDefault ?? input?.is_default ?? false
  const name = String(input?.name || '')
  return {
    name,
    originalName: String(input?.originalName || input?.original_name || name),
    providerType,
    provider_type: providerType,
    baseUrl: input?.baseUrl || input?.base_url || '',
    apiKey: input?.apiKey || input?.api_key || '',
    model: input?.model || '',
    availableModels: normalizeAvailableModels(input?.availableModels ?? input?.available_models),
    maxTokens: input?.maxTokens ?? input?.max_tokens ?? 4096,
    temperature: input?.temperature ?? 0.7,
    isDefault: isDefault === true || isDefault === 1 || isDefault === '1',
    fallbackPreset: input?.fallbackPreset || input?.fallback_preset || '',
    maxConcurrency: normalizeConcurrencyLimit(input?.maxConcurrency ?? input?.max_concurrency),
    minInterval: normalizeMinIntervalSeconds(input?.minInterval ?? input?.min_interval),
    hasApiKey: Boolean(input?.hasApiKey ?? input?.has_api_key),
    supportsVision: Boolean(input?.supportsVision ?? input?.supports_vision)
  }
}

// 并发上限归一化：非法/缺省回退 6，限制在 1~64。
function normalizeConcurrencyLimit(value: unknown): number {
  const next = Number(value)
  if (!Number.isFinite(next) || next <= 0) return 6
  return Math.max(1, Math.min(64, Math.trunc(next)))
}

// 最短间隔(秒)归一化：非法/缺省回退 0（不节流），限制在 0~3600。
function normalizeMinIntervalSeconds(value: unknown): number {
  const next = Number(value)
  if (!Number.isFinite(next) || next <= 0) return 0
  return Math.max(0, Math.min(3600, Math.trunc(next)))
}

export function buildApiPresetRecordPayload(preset: Partial<ApiPreset>): Record<string, unknown> {
  return {
    name: String(preset.name || ''),
    providerType: String(preset.providerType || preset.provider_type || 'openai-compatible'),
    baseUrl: String(preset.baseUrl || preset.base_url || ''),
    apiKey: String(preset.apiKey || preset.api_key || ''),
    model: String(preset.model || ''),
    availableModels: normalizeAvailableModels(preset.availableModels || preset.available_models || []),
    maxTokens: preset.maxTokens ?? preset.max_tokens ?? 4096,
    temperature: preset.temperature ?? 0.7,
    isDefault: Boolean(preset.isDefault || preset.is_default),
    fallbackPreset: String(preset.fallbackPreset || preset.fallback_preset || ''),
    maxConcurrency: normalizeConcurrencyLimit(preset.maxConcurrency ?? preset.max_concurrency),
    minInterval: normalizeMinIntervalSeconds(preset.minInterval ?? preset.min_interval),
    supportsVision: Boolean(preset.supportsVision ?? preset.supports_vision)
  }
}

export function buildApiPresetPatchPayload(changes: Partial<ApiPreset>): Record<string, unknown> {
  const payload: Record<string, unknown> = {}
  if (changes.name !== undefined) {
    payload.name = String(changes.name || '')
  }
  if (changes.providerType !== undefined || changes.provider_type !== undefined) {
    payload.providerType = String(changes.providerType || changes.provider_type || 'openai-compatible')
  }
  if (changes.baseUrl !== undefined || changes.base_url !== undefined) {
    payload.baseUrl = String(changes.baseUrl || changes.base_url || '')
  }
  if (changes.apiKey !== undefined || changes.api_key !== undefined) {
    payload.apiKey = String(changes.apiKey || changes.api_key || '')
  }
  if (changes.model !== undefined) payload.model = changes.model
  if (changes.availableModels !== undefined || changes.available_models !== undefined) {
    payload.availableModels = normalizeAvailableModels(changes.availableModels || changes.available_models || [])
  }
  if (changes.maxTokens !== undefined || changes.max_tokens !== undefined) {
    payload.maxTokens = changes.maxTokens ?? changes.max_tokens
  }
  if (changes.temperature !== undefined) payload.temperature = changes.temperature
  if (changes.isDefault !== undefined || changes.is_default !== undefined) {
    payload.isDefault = Boolean(changes.isDefault || changes.is_default)
  }
  if (changes.fallbackPreset !== undefined || changes.fallback_preset !== undefined) {
    payload.fallbackPreset = String(changes.fallbackPreset || changes.fallback_preset || '')
  }
  if (changes.maxConcurrency !== undefined || changes.max_concurrency !== undefined) {
    payload.maxConcurrency = normalizeConcurrencyLimit(changes.maxConcurrency ?? changes.max_concurrency)
  }
  if (changes.minInterval !== undefined || changes.min_interval !== undefined) {
    payload.minInterval = normalizeMinIntervalSeconds(changes.minInterval ?? changes.min_interval)
  }
  if (changes.supportsVision !== undefined || changes.supports_vision !== undefined) {
    payload.supportsVision = Boolean(changes.supportsVision ?? changes.supports_vision)
  }
  return payload
}

function normalizeBooleanFlag(value: unknown, fallback = true): boolean {
  if (value === undefined || value === null || value === '') return fallback
  if (value === true || value === 1) return true
  if (value === false || value === 0) return false
  const text = String(value).trim().toLowerCase()
  if (text === 'true' || text === '1') return true
  if (text === 'false' || text === '0') return false
  return fallback
}

export function normalizePromptPreset(input: any, orderIndex = 0): PromptPreset {
  const rawId = String(input?.id || '')
  const rawScene = String(input?.scene ?? 'all')
  const rawGroup = String(input?.promptGroup ?? input?.prompt_group ?? '').trim()
  const rawUsageMode = String(input?.usageMode ?? input?.usage_mode ?? '').trim()
  const rawScope = String(input?.scope ?? '').trim()
  const rawRequired = input?.isRequired ?? input?.is_required
  const inferPromptGroup = (): PromptPreset['promptGroup'] => {
    if (rawGroup === 'system' || rawGroup === 'recall' || rawGroup === 'scene' || rawGroup === 'preset_migration') {
      return rawGroup
    }
    if (rawId === 'chat_summary' || rawId === 'big_summary' || rawId === 'character_brain_recall' || rawId === 'recall_context_compression' || rawId === 'recall_round_judgment') return 'recall'
    if (rawScene === 'chat' || rawScene === 'task' || rawScene === 'eval' || rawScene === 'summary') return 'scene'
    return 'system'
  }
  const inferUsageMode = (): PromptPreset['usageMode'] => {
    if (rawUsageMode === 'always' || rawUsageMode === 'conditional' || rawUsageMode === 'manual') {
      return rawUsageMode
    }
    return rawScene === 'all' ? 'always' : 'conditional'
  }
  const inferScope = (): PromptPreset['scope'] => {
    if (
      rawScope === 'chat_reply'
      || rawScope === 'candidate_collect'
      || rawScope === 'trajectory_merge'
      || rawScope === 'soul_update'
      || rawScope === 'compile_rewrite'
      || rawScope === 'recall_compress'
      || rawScope === 'recall_judge'
      || rawScope === 'general'
    ) {
      return rawScope
    }
    if (rawId === 'character_brain_recall') return 'candidate_collect'
    if (rawId === 'recall_context_compression') return 'recall_compress'
    if (rawId === 'recall_round_judgment') return 'recall_judge'
    if (rawId === 'chat_summary' || rawId === 'big_summary') return 'compile_rewrite'
    if (rawScene === 'chat') return 'chat_reply'
    return 'general'
  }
  const inferRequired = (): boolean => {
    if (rawId === 'user_status') return false
    if (rawRequired === true || rawRequired === 1 || rawRequired === '1' || rawRequired === 'true') return true
    if (rawRequired === false || rawRequired === 0 || rawRequired === '0' || rawRequired === 'false') return false
    const group = inferPromptGroup()
    const usageMode = inferUsageMode()
    const content = String(input?.content || '')
    if (group === 'recall') return false
    if (content.trim() === '{character_brain_recall}') return false
    if (content.includes('{task_system_context}') || content.includes('{event_stack_recent_context}')) return false
    return usageMode === 'always'
  }

  return {
    ...input,
    id: rawId,
    name: String(input?.name || ''),
    content: String(input?.content || ''),
    role: input?.role || 'system',
    scene: rawScene,
    enabled: normalizeBooleanFlag(input?.enabled, true),
    frequency: input?.frequency || 'always',
    orderIndex: Number.isFinite(Number(input?.orderIndex)) ? Number(input.orderIndex) : orderIndex,
    promptGroup: inferPromptGroup(),
    usageMode: inferUsageMode(),
    isRequired: inferRequired(),
    scope: inferScope(),
    priority: Number.isFinite(Number(input?.priority)) ? Number(input.priority) : orderIndex,
    summary: String(input?.summary || ''),
    updatedAt: String(input?.updatedAt ?? input?.updated_at ?? new Date().toISOString())
  }
}

export function buildSettingDraftState(input?: Partial<SettingDraftState>): SettingDraftState {
  return {
    apiPresetDraft: input?.apiPresetDraft && typeof input.apiPresetDraft === 'object' ? input.apiPresetDraft : {},
    selectedApiPresetIndex: Number.isInteger(input?.selectedApiPresetIndex) ? Number(input?.selectedApiPresetIndex) : 0
  }
}

export function buildSettingsSnapshot(input: {
  apiPresets: ApiPreset[]
  defaultPreset: ApiPreset | null
  aiProviderMode: AiProviderMode
  promptPresets: PromptPreset[]
  currentTime: string
  currentWeather: string
  currentLocation: string
  weatherDetail: unknown
  locationHistory: unknown[]
  weatherHistory: unknown[]
  darkMode: boolean
  aiEvaluationEnabled: boolean
  summaryPrompt: string
  bigSummaryPrompt: string
  dailyReportPrompt: string
  chatSummaryPresetName: string
  chatSummaryModel: string
  agentModelConfigs: AgentModelConfig[]
}): WorkspaceSettingsSnapshot {
  const apiPresets = Array.isArray(input.apiPresets) ? input.apiPresets.map((preset: any) => normalizeApiPreset(preset)) : []
  const explicitDefaultName = String(input.defaultPreset?.name || '').trim()
  const defaultPreset = explicitDefaultName
    ? (apiPresets.find((preset) => String(preset.name || '').trim() === explicitDefaultName) || normalizeApiPreset(input.defaultPreset))
    : (apiPresets.find((preset) => preset.isDefault || preset.is_default) || null)
  return {
    apiPresets,
    defaultPreset,
    aiProviderMode: normalizeAiProviderMode(input.aiProviderMode),
    promptPresets: input.promptPresets,
    currentTime: input.currentTime,
    currentWeather: input.currentWeather,
    currentLocation: input.currentLocation,
    weatherDetail: input.weatherDetail as Record<string, unknown> | string | null,
    locationHistory: input.locationHistory,
    weatherHistory: input.weatherHistory,
    darkMode: input.darkMode,
    aiEvaluationEnabled: input.aiEvaluationEnabled,
    summaryPrompt: input.summaryPrompt,
    bigSummaryPrompt: input.bigSummaryPrompt,
    dailyReportPrompt: input.dailyReportPrompt,
    chatSummaryPresetName: input.chatSummaryPresetName,
    chatSummaryModel: input.chatSummaryModel,
    agentModelConfigs: input.agentModelConfigs
  }
}

function toRecord(input: unknown): Record<string, any> {
  return input && typeof input === 'object' ? input as Record<string, any> : {}
}

export function normalizeSettingsServerPayload(input: unknown): WorkspaceSettingsSnapshot {
  const root = toRecord(input)
  const settings = toRecord(root.settings)
  const read = <T = unknown>(key: keyof WorkspaceSettingsSnapshot) => settings[key] ?? root[key]

  return {
    apiPresets: Array.isArray(read('apiPresets')) ? read('apiPresets') as ApiPreset[] : [],
    defaultPreset: (read('defaultPreset') ?? null) as ApiPreset | null,
    aiProviderMode: normalizeAiProviderMode(read('aiProviderMode')),
    promptPresets: Array.isArray(read('promptPresets')) ? read('promptPresets') as PromptPreset[] : [],
    currentTime: String(read('currentTime') ?? ''),
    currentWeather: String(read('currentWeather') ?? ''),
    currentLocation: String(read('currentLocation') ?? ''),
    weatherDetail: (read('weatherDetail') ?? null) as Record<string, unknown> | string | null,
    locationHistory: Array.isArray(read('locationHistory')) ? read('locationHistory') as unknown[] : [],
    weatherHistory: Array.isArray(read('weatherHistory')) ? read('weatherHistory') as unknown[] : [],
    darkMode: typeof read('darkMode') === 'boolean' ? Boolean(read('darkMode')) : null,
    aiEvaluationEnabled: typeof read('aiEvaluationEnabled') === 'boolean' ? Boolean(read('aiEvaluationEnabled')) : null,
    summaryPrompt: String(read('summaryPrompt') ?? ''),
    bigSummaryPrompt: String(read('bigSummaryPrompt') ?? ''),
    dailyReportPrompt: String(read('dailyReportPrompt') ?? ''),
    chatSummaryPresetName: String(read('chatSummaryPresetName') ?? ''),
    chatSummaryModel: String(read('chatSummaryModel') ?? ''),
    agentModelConfigs: normalizeAgentModelConfigs(read('agentModelConfigs'))
  }
}

export function resolveSettingsState(
  input: unknown
): ResolvedSettingsState {
  const settings = normalizeSettingsServerPayload(input)
  const apiPresets = Array.isArray(settings.apiPresets) ? settings.apiPresets.map((p: any) => normalizeApiPreset(p)) : []
  const explicitDefaultName = String((settings.defaultPreset as ApiPreset | null)?.name || '').trim()
  const defaultPreset = explicitDefaultName
    ? (apiPresets.find((preset) => String(preset.name || '').trim() === explicitDefaultName) || normalizeApiPreset(settings.defaultPreset))
    : (apiPresets.find((preset) => preset.isDefault || preset.is_default) || null)
  return {
    apiPresets,
    defaultPreset: defaultPreset ? {
      ...normalizeApiPreset(defaultPreset),
      isDefault: true
    } : null,
    aiProviderMode: normalizeAiProviderMode(settings.aiProviderMode),
    promptPresets: Array.isArray(settings.promptPresets)
      ? settings.promptPresets.map((preset: any, index: number) => normalizePromptPreset(preset, index))
      : [],
    currentTime: typeof settings.currentTime === 'string' ? settings.currentTime : '',
    currentWeather: typeof settings.currentWeather === 'string' ? settings.currentWeather : '',
    currentLocation: typeof settings.currentLocation === 'string' ? settings.currentLocation : '',
    weatherDetail: settings.weatherDetail ?? null,
    locationHistory: Array.isArray(settings.locationHistory)
      ? settings.locationHistory as Array<{ timestamp: number; from: string; to: string }>
      : [],
    weatherHistory: Array.isArray(settings.weatherHistory)
      ? settings.weatherHistory as Array<{ timestamp: number; weather: string }>
      : [],
    darkMode: typeof settings.darkMode === 'boolean' ? settings.darkMode : null,
    aiEvaluationEnabled: typeof settings.aiEvaluationEnabled === 'boolean' ? settings.aiEvaluationEnabled : null,
    summaryPrompt: String(settings.summaryPrompt || ''),
    bigSummaryPrompt: String(settings.bigSummaryPrompt || ''),
    dailyReportPrompt: String(settings.dailyReportPrompt || ''),
    chatSummaryPresetName: String(settings.chatSummaryPresetName || ''),
    chatSummaryModel: String(settings.chatSummaryModel || ''),
    agentModelConfigs: normalizeAgentModelConfigs(settings.agentModelConfigs)
  }
}

export async function applyResolvedSettingsState(
  target: SettingStoreStateTarget,
  resolved: ResolvedSettingsState,
  options: ApplyResolvedSettingsStateOptions
): Promise<void> {
  target.apiPresets.value = resolved.apiPresets
  target.defaultPreset.value = resolved.defaultPreset
  target.aiProviderMode.value = normalizeAiProviderMode(resolved.aiProviderMode)

  if (Array.isArray(resolved.promptPresets)) {
    target.promptPresets.value = resolved.promptPresets
      .map((preset) => options.sanitizePromptPresetInput(preset))
    await options.ensureBuiltinPromptPresets()
  }

  if (resolved.summaryPrompt) target.summaryPrompt.value = resolved.summaryPrompt
  if (resolved.bigSummaryPrompt) target.bigSummaryPrompt.value = resolved.bigSummaryPrompt
  if (resolved.dailyReportPrompt) target.dailyReportPrompt.value = resolved.dailyReportPrompt
  if (typeof resolved.chatSummaryPresetName === 'string') target.chatSummaryPresetName.value = resolved.chatSummaryPresetName
  if (typeof resolved.chatSummaryModel === 'string') target.chatSummaryModel.value = resolved.chatSummaryModel
  target.agentModelConfigs.value = normalizeAgentModelConfigs(resolved.agentModelConfigs)
  if (typeof resolved.aiEvaluationEnabled === 'boolean') {
    target.aiEvaluationEnabled.value = resolved.aiEvaluationEnabled
  }
  if (typeof resolved.currentTime === 'string') target.currentTime.value = resolved.currentTime
  if (typeof resolved.currentWeather === 'string') target.currentWeather.value = resolved.currentWeather
  if (typeof resolved.currentLocation === 'string') target.currentLocation.value = resolved.currentLocation
  if (resolved.weatherDetail && typeof resolved.weatherDetail === 'object') {
    const normalizedWeatherDetail = options.normalizeWeatherDetail(resolved.weatherDetail)
    target.weatherDetail.value = normalizedWeatherDetail
    if (!String(target.currentWeather.value || '').trim()) {
      const weatherSummary = buildWeatherDetailSummary(normalizedWeatherDetail)
      if (weatherSummary) target.currentWeather.value = weatherSummary
    }
  } else if (typeof resolved.weatherDetail === 'string' && !String(target.currentWeather.value || '').trim()) {
    const weatherSummary = buildWeatherDetailSummary(resolved.weatherDetail)
    if (weatherSummary) target.currentWeather.value = weatherSummary
  }
  if (Array.isArray(resolved.locationHistory)) {
    target.locationHistory.value = resolved.locationHistory
  }
  if (Array.isArray(resolved.weatherHistory)) {
    target.weatherHistory.value = resolved.weatherHistory
  }
  target.darkMode.value = typeof resolved.darkMode === 'boolean'
    ? resolved.darkMode
    : options.darkModeFallback
}

export function buildEnvironmentConfigPayload(input: {
  currentTime: string
  currentWeather: string
  currentLocation: string
  weatherDetail: unknown
  locationHistory: unknown[]
  weatherHistory: unknown[]
  aiEvaluationEnabled: boolean
}): Record<string, unknown> {
  return {
    currentTime: input.currentTime,
    currentWeather: input.currentWeather || buildWeatherDetailSummary(input.weatherDetail),
    currentLocation: input.currentLocation,
    weatherDetail: input.weatherDetail,
    locationHistory: Array.isArray(input.locationHistory) ? input.locationHistory : [],
    weatherHistory: Array.isArray(input.weatherHistory) ? input.weatherHistory : [],
    aiEvaluationEnabled: input.aiEvaluationEnabled
  }
}

export function buildSummaryPromptConfigPayload(input: {
  summaryPrompt: string
  bigSummaryPrompt: string
  dailyReportPrompt: string
}): Record<string, unknown> {
  return {
    summaryPrompt: input.summaryPrompt,
    bigSummaryPrompt: input.bigSummaryPrompt,
    dailyReportPrompt: input.dailyReportPrompt
  }
}

async function ensureOk(response: Response, fallbackMessage: string) {
  if (response.ok) return
  throw new Error(fallbackMessage)
}

export async function fetchApiModels(payload: {
  presetName?: string
  baseUrl?: string
  apiKey?: string
  providerType?: string
  allowDirectConfig?: boolean
}): Promise<Array<{ id: string }>> {
  const response = await fetch(API.AI_MODELS, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  const data = await response.json() as { data?: Array<{ id: string }>; error?: string }
  if (!response.ok) {
    throw new Error(data?.error || `HTTP ${response.status}`)
  }
  if (!Array.isArray(data.data)) {
    throw new Error(data?.error || '获取模型列表失败')
  }
  return data.data.map((item) => ({ id: String(item?.id || '') })).filter((item) => item.id)
}

export async function testApiEndpointConnection(input: {
  presetName?: string
  baseUrl?: string
  apiKey?: string
  providerType?: string
  allowDirectConfig?: boolean
}): Promise<{ ok: boolean; status: number; error?: string }> {
  const response = await fetch(API.AI_MODELS, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input)
  })
  const data = await response.json().catch(() => null) as { error?: string } | null
  return {
    ok: response.ok,
    status: response.status,
    error: data?.error || ''
  }
}

export async function loadConfigSnapshot(): Promise<Record<string, unknown>> {
  const response = await fetch(API.CONFIG)
  await ensureOk(response, '加载环境信息失败')
  return await response.json() as Record<string, unknown>
}

export async function loadApiPresetRecords(): Promise<ApiPreset[]> {
  const response = await fetch(API.API_PRESETS)
  await ensureOk(response, '加载 API 预设失败')
  const data = await response.json() as unknown
  const records: unknown[] = Array.isArray(data)
    ? data
    : Array.isArray((data as Record<string, unknown> | null)?.apiPresets)
      ? (data as { apiPresets: unknown[] }).apiPresets
      : []
  return records.map((preset: any) => normalizeApiPreset(preset))
}

export async function loadPromptPresetRecords(): Promise<PromptPreset[]> {
  const response = await fetch(API.PROMPT_PRESETS)
  await ensureOk(response, '加载提示词预设失败')
  const data = await response.json() as unknown
  const records: unknown[] = Array.isArray(data)
    ? data
    : Array.isArray((data as Record<string, unknown> | null)?.promptPresets)
      ? (data as { promptPresets: unknown[] }).promptPresets
      : []
  return records.map((preset, index) => normalizePromptPreset(preset, index))
}

export async function saveConfigSnapshot(payload: Record<string, unknown>): Promise<void> {
  const response = await fetch(API.CONFIG, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  await ensureOk(response, '保存环境信息失败')
}

export async function createApiPresetRecord(payload: ApiPreset): Promise<void> {
  const response = await fetch(API.API_PRESETS, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  await ensureOk(response, '新增 API 预设失败')
}

export async function updateApiPresetRecord(name: string, payload: Record<string, unknown>): Promise<void> {
  const response = await fetch(`${API.API_PRESETS}/${encodeURIComponent(name)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  await ensureOk(response, '更新 API 预设失败')
}

export async function deleteApiPresetRecord(name: string): Promise<void> {
  const response = await fetch(`${API.API_PRESETS}/${encodeURIComponent(name)}`, {
    method: 'DELETE'
  })
  await ensureOk(response, '删除 API 预设失败')
}

export async function createPromptPresetRecord(payload: PromptPreset): Promise<void> {
  const response = await fetch(API.PROMPT_PRESETS, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  await ensureOk(response, '新增提示词预设失败')
}

export async function updatePromptPresetRecord(id: string, payload: PromptPreset): Promise<void> {
  const response = await fetch(`${API.PROMPT_PRESETS}/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  await ensureOk(response, '更新提示词预设失败')
}

export async function replacePromptPresetRecords(payload: PromptPreset[]): Promise<void> {
  const response = await fetch(`${API.PROMPT_PRESETS}/replace`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ promptPresets: payload })
  })
  await ensureOk(response, '覆盖导入提示词预设失败')
}

export async function deletePromptPresetRecord(id: string): Promise<void> {
  const response = await fetch(`${API.PROMPT_PRESETS}/${encodeURIComponent(id)}`, {
    method: 'DELETE'
  })
  await ensureOk(response, '删除提示词预设失败')
}
