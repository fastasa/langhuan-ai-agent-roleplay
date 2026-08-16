import type { AgentModelConfig, ModelReasoningEffort, ModelServiceTier, ModelThinkingMode, ModelUsageConfig, ModelUsageSlotId } from '../types'

// 槽位级最短间隔(minIntervalSeconds)已于第二阶段批次 F 整体下线：
// 「两次调用最短间隔」真值统一迁到 ApiPreset.min_interval（凭据级、本地服务执行），
// 槽位只保留预设/模型/温度/maxTokens/thinking/serviceTier；effort 已迁到具体 Agent 对话。
//
// 文本槽四值：书童 fast / 校书 balanced / 执笔 message / 掌阁 smart（+编目=嵌入独立链路）。
// 执笔只承接角色消息与旁白正文；旧配置首次读取时继承校书，保证升级前后路由不突变。
export const DEFAULT_MODEL_USAGE_CONFIGS: ModelUsageConfig[] = [
  { id: 'fast', label: '书童', presetName: '', model: '', temperature: 0.2, maxTokens: 256, thinking: 'disabled', serviceTier: '' },
  { id: 'balanced', label: '校书', presetName: '', model: '', temperature: 0.7, maxTokens: 1024, thinking: 'disabled', serviceTier: '' },
  { id: 'message', label: '执笔', presetName: '', model: '', temperature: 0.7, maxTokens: 1024, thinking: 'disabled', serviceTier: '' },
  { id: 'smart', label: '掌阁', presetName: '', model: '', temperature: 0.4, maxTokens: 1024, thinking: 'enabled', serviceTier: '' }
]

function normalizeThinking(value: unknown, fallback: ModelThinkingMode): ModelThinkingMode {
  return value === 'enabled' || value === 'disabled' ? value : fallback
}

function normalizeServiceTier(value: unknown, fallback: ModelServiceTier = ''): ModelServiceTier {
  return value === 'fast' ? 'fast' : fallback
}

function normalizeTemperature(value: unknown, fallback: number): number {
  const next = Number(value)
  if (!Number.isFinite(next)) return fallback
  return Math.max(0, Math.min(2, next))
}

/** effort 是模型目录驱动的开放字符串；这里只收窄成协议安全标识，未知新档位仍可保存。 */
export function normalizeModelReasoningEffort(value: unknown, fallback: ModelReasoningEffort = ''): ModelReasoningEffort {
  if (value === undefined || value === null) return fallback
  const next = String(value ?? '').trim()
  if (!next) return ''
  return /^[A-Za-z0-9._:-]{1,64}$/.test(next) ? next : fallback
}

function normalizeMaxTokens(value: unknown, fallback: number): number {
  const next = Number(value)
  if (!Number.isFinite(next) || next <= 0) return fallback
  return Math.max(1, Math.min(32768, Math.trunc(next)))
}

// ─────────────────────────────────────────────────────────────────────────────
// 九槽→四槽 读侧迁移（2026-07-08 批次3）。三代迁移链路（新→旧）一次说清，防「叠三代看不懂」：
//   第1代（现役写入）：modelUsageConfigs 数组存新 id fast/balanced/message/smart。
//   第2代（九槽数组）：数组存旧 id，按用户拍板回退链认领——
//       校书 balanced ← 旧 balanced（空则 orchestration，再空则 xingyi）
//       掌阁 smart    ← 旧 highIntelligence（空则 highVolume·含更旧 power 别名）
//       书童 fast     ← 旧 quickJudge1（含更旧 quickJudge 别名）
//       （roleMessage/narrationMessage/quickJudge2 槽退役：前两者参数落调用点、快判2 全仓零调用点直接删）
//   第3代（更旧平铺字段）：readLegacyUsageDraft 读 quickJudgePresetName/balancedPresetName/… 一大串 legacy 键。
//   「空则」判定=该条目 presetName 与 model 都为空（槽配置的核心是预设/模型指向）。
//   退出条件：本地配置保存过一次四槽配置后，第2/3代整段可删（数组含任一新 id 即视为已迁移、不再走旧链）。
// ─────────────────────────────────────────────────────────────────────────────

/** 新槽 ← 旧九槽 id 回退链（顺位取第一个配了 presetName/model 的条目；同名 balanced 由 current 直取、不进链）。 */
const LEGACY_SLOT_FALLBACK_CHAINS: Record<ModelUsageSlotId, string[]> = {
  fast: ['quickJudge1'],
  balanced: ['orchestration', 'xingyi'],
  message: ['roleMessage', 'narrationMessage', 'balanced'],
  smart: ['highIntelligence', 'highVolume']
}

function readLegacyUsageDraft(record: Partial<AgentModelConfig> | Record<string, unknown>, slotId: ModelUsageSlotId): Partial<ModelUsageConfig> {
  const source = record as Record<string, unknown>
  if (slotId === 'fast') {
    return {
      presetName: String(source.quickJudgePresetName || source.narrationQuickJudgePresetName || source.narration_quick_judge_preset_name || source.presetName || source.preset_name || '').trim(),
      model: String(source.quickJudgeModel || source.narrationQuickJudgeModel || source.narration_quick_judge_model || source.recallModel || source.recall_model || '').trim(),
      maxTokens: Number(source.quickJudgeMaxTokens ?? 256),
      thinking: 'disabled'
    }
  }
  if (slotId === 'balanced') {
    return {
      presetName: String(source.balancedPresetName || source.presetName || source.preset_name || '').trim(),
      model: String(source.balancedModel || source.recallModel || source.recall_model || '').trim(),
      maxTokens: Number(source.balancedMaxTokens ?? source.recallMaxTokens ?? source.recall_max_tokens ?? 1024),
      thinking: normalizeThinking(source.balancedThinking, source.disableRecallThinking === false ? 'enabled' : 'disabled')
    }
  }
  if (slotId === 'message') {
    return {
      presetName: String(source.narrationGenerationPresetName || source.narration_generation_preset_name || source.balancedPresetName || source.presetName || source.preset_name || '').trim(),
      model: String(source.narrationGenerationModel || source.narration_generation_model || source.balancedModel || source.recallModel || source.recall_model || '').trim(),
      maxTokens: Number(source.balancedMaxTokens ?? source.recallMaxTokens ?? source.recall_max_tokens ?? 1024),
      thinking: normalizeThinking(source.balancedThinking, source.disableRecallThinking === false ? 'enabled' : 'disabled')
    }
  }
  // smart：旧高智平铺链，空则旧高量/更旧 power 平铺链。
  const highIntelligence = {
    presetName: String(source.highIntelligencePresetName || '').trim(),
    model: String(source.highIntelligenceModel || '').trim(),
    maxTokens: Number(source.highIntelligenceMaxTokens ?? 1024),
    thinking: normalizeThinking(source.highIntelligenceThinking, 'enabled')
  }
  if (highIntelligence.presetName || highIntelligence.model) return highIntelligence
  const highVolume = {
    presetName: String(source.highVolumePresetName || source.powerPresetName || source.narrativeBeatPresetName || source.narrative_beat_preset_name || source.presetName || source.preset_name || '').trim(),
    model: String(source.highVolumeModel || source.powerModel || source.narrativeBeatModel || source.narrative_beat_model || source.recallModel || source.recall_model || '').trim(),
    maxTokens: Number(source.highVolumeMaxTokens ?? source.powerMaxTokens ?? source.narrativeBeatMaxTokens ?? source.narrative_beat_max_tokens ?? 8192),
    thinking: normalizeThinking(source.highVolumeThinking ?? source.powerThinking, source.disableRecallThinking === false ? 'enabled' : 'disabled')
  }
  return highVolume.presetName || highVolume.model ? highVolume : highIntelligence
}

export function cloneDefaultModelUsageConfigs(): ModelUsageConfig[] {
  return DEFAULT_MODEL_USAGE_CONFIGS.map((item) => ({ ...item }))
}

export function normalizeModelUsageConfigs(
  agentConfig: Partial<AgentModelConfig> | Record<string, unknown> | null | undefined,
  fallbackConfigs: ModelUsageConfig[] = DEFAULT_MODEL_USAGE_CONFIGS
): ModelUsageConfig[] {
  const record = agentConfig && typeof agentConfig === 'object' ? agentConfig : {}
  const source = record as Record<string, unknown>
  const configs = Array.isArray(source.modelUsageConfigs)
    ? source.modelUsageConfigs
    : (Array.isArray(source.model_usage_configs) ? source.model_usage_configs : [])
  // 解析数组条目（新旧 id 全收，供新槽直取或旧链回退认领）；更旧别名归一：quickJudge→quickJudge1、power→highVolume。
  const byId = new Map<string, Partial<ModelUsageConfig>>()
  configs.forEach((item: unknown) => {
    const raw = item && typeof item === 'object' ? item as Record<string, unknown> : {}
    const rawId = raw.id === 'quickJudge' ? 'quickJudge1' : (raw.id === 'power' ? 'highVolume' : raw.id)
    if (typeof rawId !== 'string' || !rawId) return
    byId.set(rawId, {
      label: raw.id === 'quickJudge' || raw.id === 'power' ? '' : String(raw.label || ''),
      presetName: String(raw.presetName ?? raw.preset_name ?? '').trim(),
      model: String(raw.model || '').trim(),
      temperature: Number(raw.temperature),
      maxTokens: Number(raw.maxTokens ?? raw.max_tokens),
      thinking: normalizeThinking(raw.thinking, 'disabled'),
      serviceTier: normalizeServiceTier(raw.serviceTier ?? raw.service_tier)
    })
  })
  // 已迁移判定：数组含 fast/smart（新独有 id·旧九槽绝不会有）=用户已按三文本槽保存过。
  // 不再走旧链（防「用户显式清空校书想跟随全局，却被旧编排值抢回」）。balanced 新旧同名，不能作判定依据。
  const migrated = byId.has('fast') || byId.has('smart')
  const hasPresetOrModel = (item: Partial<ModelUsageConfig> | undefined): item is Partial<ModelUsageConfig> =>
    Boolean(item && (String(item.presetName || '').trim() || String(item.model || '').trim()))
  return fallbackConfigs.map((fallback) => {
    let current = byId.get(fallback.id)
    // message 是后加的专用槽：无论旧数组是否已迁移，只要尚无 message，就按旧角色/旁白槽、再按 balanced 继承。
    // 这样升级不会让角色/旁白突然换模型；保存后 message 成为独立真值，允许显式清空跟随全局。
    if (fallback.id === 'message' && !current) {
      const messageHit = LEGACY_SLOT_FALLBACK_CHAINS.message.map((id) => byId.get(id)).find(hasPresetOrModel)
      if (messageHit) current = { ...messageHit, label: '' }
    }
    if (!migrated && !hasPresetOrModel(current)) {
      // 九槽数组迁移：沿用户拍板回退链认领第一个配了预设/模型的旧条目。
      const legacyHit = LEGACY_SLOT_FALLBACK_CHAINS[fallback.id].map((id) => byId.get(id)).find(hasPresetOrModel)
      if (legacyHit) current = { ...legacyHit, label: '' }
    }
    const legacy = readLegacyUsageDraft(record, fallback.id)
    const presetName = current
      ? String(current.presetName ?? '').trim()
      : String(legacy.presetName || fallback.presetName || '').trim()
    const model = current
      ? String(current.model ?? '').trim()
      : String(legacy.model || fallback.model || '').trim()
    return {
      id: fallback.id,
      label: current?.label || fallback.label,
      presetName,
      model,
      temperature: normalizeTemperature(current?.temperature ?? legacy.temperature, fallback.temperature),
      maxTokens: normalizeMaxTokens(current?.maxTokens ?? legacy.maxTokens, fallback.maxTokens),
      thinking: normalizeThinking(current?.thinking ?? legacy.thinking, fallback.thinking),
      serviceTier: normalizeServiceTier(current?.serviceTier, fallback.serviceTier)
    }
  })
}

export function getModelUsageConfig(
  agentConfig: Partial<AgentModelConfig> | null | undefined,
  slotId: ModelUsageSlotId
): ModelUsageConfig {
  const fallback = DEFAULT_MODEL_USAGE_CONFIGS.find((item) => item.id === slotId) || DEFAULT_MODEL_USAGE_CONFIGS[1]
  return normalizeModelUsageConfigs(agentConfig).find((item) => item.id === slotId) || { ...fallback }
}

export function buildModelUsageAiOptions(
  agentConfig: Partial<AgentModelConfig> | null | undefined,
  slotId: ModelUsageSlotId,
  overrides: Partial<Pick<ModelUsageConfig, 'maxTokens' | 'temperature' | 'thinking'>>
    & { effort?: ModelReasoningEffort } = {}
) {
  const config = getModelUsageConfig(agentConfig, slotId)
  return {
    modelUsageSlotId: config.id,
    presetName: config.presetName,
    model: config.model,
    temperature: normalizeTemperature(overrides.temperature, config.temperature),
    // 努力程度是 Agent 对话级覆盖，不再从全局模型槽配置继承；空串=跟随模型默认。
    effort: normalizeModelReasoningEffort(overrides.effort),
    maxTokens: normalizeMaxTokens(overrides.maxTokens, config.maxTokens),
    thinking: normalizeThinking(overrides.thinking, config.thinking),
    ...(config.serviceTier === 'fast' ? { serviceTier: 'fast' as const } : {})
  }
}
