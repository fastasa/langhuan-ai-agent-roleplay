import type { AgentModelConfig, ChatMessage, ChatSession } from '../types'
import {
  DEFAULT_NARRATION_FREQUENCY,
  DEFAULT_NARRATION_TEMPERATURE,
  type NarrationAgentRouteConfig,
  type NarrationFrequency,
  type NarrationKind,
  type NarrationModelTier,
  type NarrationPlan,
  type NarrationQuickJudgeResult,
  type NarrationQuickJudgeTag,
  type NarrationTemperature,
  normalizeNarrationFrequency,
  normalizeNarrationTemperature
} from './narrationProtocol'
import { stripAiThoughtContent } from '../utils/aiOutput'

type MessageLike = Pick<ChatMessage, 'id' | 'role' | 'content' | 'messageKind' | 'message_kind' | 'envDate' | 'env_date' | 'envWeather' | 'env_weather' | 'envLocation' | 'env_location' | 'name' | 'memberName' | 'member_name'>

// 旁白上下文投影优先查找：消息级客观事实(objectiveFact)对所有角色一致，旁白作为世界叙述者读它。
// 见 docs/features/chat/DEVELOPMENT.md line 38/41「正式旁白链路 projection-first、避免一读投影一读原文」。
export type NarrationProjectionFactLookup = Map<number, string> | Record<number, string> | null | undefined
function resolveProjectionFact(lookup: NarrationProjectionFactLookup, messageId: number): string {
  if (!lookup || !(messageId > 0)) return ''
  if (lookup instanceof Map) return String(lookup.get(messageId) || '').trim()
  return String(lookup[messageId] || '').trim()
}

export interface NarrationRuleSignals {
  manualTrigger?: boolean
  timeJumpMinutes?: number
  weatherChanged?: boolean
  locationChanged?: boolean
  roundsSinceLastNarration?: number
}

export interface NarrationSemanticSignal {
  maxSimilarity: number
  averageSimilarity: number
  source: 'embedding' | 'local_text' | 'none'
}

export interface NarrationRandomSignal {
  environmentRoll?: number
  eventPushRoll?: number
}

export interface NarrationOrchestratorInput {
  session?: Partial<ChatSession> | null
  agentConfig?: Partial<AgentModelConfig> | null
  messages?: MessageLike[]
  currentRoundText?: string
  recentRoundTexts?: string[]
  ruleSignals?: NarrationRuleSignals
  semanticSignal?: Partial<NarrationSemanticSignal> | null
  quickJudge?: Partial<NarrationQuickJudgeResult> | null
  randomSignal?: NarrationRandomSignal
}

const QUICK_JUDGE_TAGS = new Set<NarrationQuickJudgeTag>([
  'scene_shift',
  'time_shift',
  'weather_shift',
  'new_action',
  'external_motion',
  'appearance_focus',
  'low_information',
  'stagnation'
])

const FREQUENCY_MIN_INTERVAL: Record<NarrationFrequency, number> = {
  silent: 4,
  standard: 2,
  active: 1
}

const WEIGHT_THRESHOLD: Record<NarrationFrequency, number> = {
  silent: 0.95,
  standard: 0.64,
  active: 0.5
}

function clamp01(value: unknown): number {
  const num = Number(value)
  if (!Number.isFinite(num)) return 0
  return Math.max(0, Math.min(1, num))
}

function normalizeQuickJudge(input: Partial<NarrationQuickJudgeResult> | null | undefined): NarrationQuickJudgeResult {
  const tags = Array.isArray(input?.tags)
    ? input.tags.map((tag) => String(tag || '').trim()).filter((tag): tag is NarrationQuickJudgeTag => QUICK_JUDGE_TAGS.has(tag as NarrationQuickJudgeTag))
    : []
  const recommendedKind = input?.recommendedKind === 'environment'
    || input?.recommendedKind === 'appearance'
    || input?.recommendedKind === 'event_push'
    || input?.recommendedKind === 'none'
    ? input.recommendedKind
    : undefined
  return {
    tags: Array.from(new Set(tags)),
    confidence: clamp01(input?.confidence ?? (tags.length ? 0.55 : 0)),
    summary: String(input?.summary || '').trim(),
    recommendedKind
  }
}

export function normalizeNarrationAgentRouteConfig(agentConfig: Partial<AgentModelConfig> | null | undefined): NarrationAgentRouteConfig {
  return {
    quickJudgePresetName: String(agentConfig?.narrationQuickJudgePresetName || agentConfig?.presetName || '').trim(),
    quickJudgeModel: String(agentConfig?.narrationQuickJudgeModel || agentConfig?.recallModel || '').trim(),
    narrativeBeatPresetName: String(agentConfig?.narrativeBeatPresetName || agentConfig?.narrationQuickJudgePresetName || agentConfig?.presetName || '').trim(),
    narrativeBeatModel: String(agentConfig?.narrativeBeatModel || agentConfig?.narrationQuickJudgeModel || agentConfig?.recallModel || '').trim(),
    narrationGenerationPresetName: String(agentConfig?.narrationGenerationPresetName || agentConfig?.narrativeBeatPresetName || agentConfig?.presetName || '').trim(),
    narrationGenerationModel: String(agentConfig?.narrationGenerationModel || agentConfig?.narrativeBeatModel || agentConfig?.recallModel || '').trim()
    // narrationEmbeddingPresetId 已退役（2026-07-08 批次3 实查：全仓无下游消费的挂空线·嵌入统一走 embeddingPresetId）。
  }
}

export function buildNarrationRoundText(
  messages: MessageLike[] = [],
  projectionFactByMessageId?: NarrationProjectionFactLookup
): string {
  return messages
    .map((message) => {
      const kind = String(message.messageKind ?? message.message_kind ?? '').trim()
      if (kind === 'narration_debug') return ''
      const role = kind === 'narration'
        ? '旁白'
        : String(
          message.role === 'user'
            ? (message.name || message.memberName || message.member_name || '用户')
            : (message.memberName || message.member_name || message.name || '角色')
        ).trim() || (message.role === 'user' ? '用户' : '角色')
      const env = [
        message.envDate ?? message.env_date,
        message.envWeather ?? message.env_weather,
        message.envLocation ?? message.env_location
      ].map((item) => String(item || '').trim()).filter(Boolean).join(' / ')
      // projection-first：优先用消息级投影客观事实，剥掉角色回复里的 $动作$/（神态）/{心理}/台词等杂质；
      // 最近未投影窗口无 fact 时按文档允许局部兜底原文，避免新消息缺上下文。
      const projectionFact = resolveProjectionFact(projectionFactByMessageId, Number(message.id || 0))
      const content = projectionFact
        || stripRepeatedSpeakerPrefix(stripAiThoughtContent(String(message.content || '')), role)
      return [role, env, content].filter(Boolean).join('：')
    })
    .filter(Boolean)
    .join('\n')
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function stripRepeatedSpeakerPrefix(content: string, speaker: string): string {
  const text = String(content || '').trim()
  const name = String(speaker || '').trim()
  if (!name) return text
  const pattern = new RegExp(`^(?:${escapeRegExp(name)}\\s*[:：]\\s*)+`)
  return text.replace(pattern, '').trim()
}

function tokenizeForSimilarity(text: string): string[] {
  const normalized = String(text || '').toLowerCase().replace(/\s+/g, '')
  const asciiTokens = normalized.match(/[a-z0-9_]{2,}/g) || []
  const chars = Array.from(normalized.replace(/[^\p{Script=Han}a-z0-9_]/gu, ''))
  const grams: string[] = []
  for (let index = 0; index < chars.length - 1; index += 1) {
    grams.push(chars.slice(index, index + 2).join(''))
  }
  return Array.from(new Set([...asciiTokens, ...grams]))
}

export function calculateNarrationTextSimilarity(left: string, right: string): number {
  const leftTokens = tokenizeForSimilarity(left)
  const rightTokens = tokenizeForSimilarity(right)
  if (!leftTokens.length || !rightTokens.length) return 0
  const rightSet = new Set(rightTokens)
  const intersection = leftTokens.filter((token) => rightSet.has(token)).length
  const union = new Set([...leftTokens, ...rightTokens]).size
  return union ? Math.round((intersection / union) * 1000) / 1000 : 0
}

export function buildLocalSemanticSignal(currentRoundText: string, recentRoundTexts: string[] = []): NarrationSemanticSignal {
  const scores = recentRoundTexts
    .map((text) => calculateNarrationTextSimilarity(currentRoundText, text))
    .filter((score) => Number.isFinite(score))
  if (!scores.length) return { maxSimilarity: 0, averageSimilarity: 0, source: 'none' }
  const maxSimilarity = Math.max(...scores)
  const averageSimilarity = scores.reduce((sum, score) => sum + score, 0) / scores.length
  return {
    maxSimilarity: Math.round(maxSimilarity * 1000) / 1000,
    averageSimilarity: Math.round(averageSimilarity * 1000) / 1000,
    source: 'local_text'
  }
}

function normalizeSemanticSignal(input: NarrationOrchestratorInput): NarrationSemanticSignal {
  if (input.semanticSignal) {
    return {
      maxSimilarity: clamp01(input.semanticSignal.maxSimilarity),
      averageSimilarity: clamp01(input.semanticSignal.averageSimilarity),
      source: input.semanticSignal.source === 'embedding' || input.semanticSignal.source === 'local_text' ? input.semanticSignal.source : 'none'
    }
  }
  const currentRoundText = input.currentRoundText ?? buildNarrationRoundText(input.messages || [])
  return buildLocalSemanticSignal(currentRoundText, input.recentRoundTexts || [])
}

function getFrequency(session: Partial<ChatSession> | null | undefined): NarrationFrequency {
  return normalizeNarrationFrequency(session?.narrationFrequency ?? session?.narration_frequency ?? DEFAULT_NARRATION_FREQUENCY)
}

function getTemperature(session: Partial<ChatSession> | null | undefined): NarrationTemperature {
  return normalizeNarrationTemperature(session?.narrationTemperature ?? session?.narration_temperature ?? DEFAULT_NARRATION_TEMPERATURE)
}

function hasHardEnvironmentChange(ruleSignals: NarrationRuleSignals, quickJudge: NarrationQuickJudgeResult): boolean {
  return Number(ruleSignals.timeJumpMinutes || 0) >= 120
    || ruleSignals.weatherChanged === true
    || ruleSignals.locationChanged === true
    || quickJudge.tags.includes('scene_shift')
    || quickJudge.tags.includes('time_shift')
    || quickJudge.tags.includes('weather_shift')
}

function selectModelTier(kind: NarrationKind, temperature: NarrationTemperature, hardChange: boolean): NarrationModelTier {
  if (kind === 'event_push' && (temperature === 'open' || temperature === 'bloom')) return 'strong'
  if (kind === 'event_push') return 'standard'
  if (hardChange) return 'quick'
  return 'rule'
}

function buildSkipPlan(input: {
  frequency: NarrationFrequency
  temperature: NarrationTemperature
  skipReason: string
  reasons: string[]
  debug: Record<string, unknown>
}): NarrationPlan {
  return {
    shouldInsert: false,
    narrationKind: 'environment',
    reasons: input.reasons,
    modelTier: 'rule',
    frequency: input.frequency,
    temperature: input.temperature,
    score: 0,
    skipReason: input.skipReason,
    debug: input.debug
  }
}

export function planNarration(input: NarrationOrchestratorInput): NarrationPlan {
  const frequency = getFrequency(input.session)
  const temperature = getTemperature(input.session)
  const agentRoutes = normalizeNarrationAgentRouteConfig(input.agentConfig)
  const ruleSignals = input.ruleSignals || {}
  const quickJudge = normalizeQuickJudge(input.quickJudge)
  const semantic = normalizeSemanticSignal(input)
  const reasons: string[] = []
  const hardEnvironmentChange = hasHardEnvironmentChange(ruleSignals, quickJudge)
  const minInterval = FREQUENCY_MIN_INTERVAL[frequency]
  const roundsSinceLastNarration = Number(ruleSignals.roundsSinceLastNarration ?? minInterval)
  const intervalBlocked = roundsSinceLastNarration < minInterval && !ruleSignals.manualTrigger
  const randomEnvironment = Number(input.randomSignal?.environmentRoll ?? 1)
  const randomEventPush = Number(input.randomSignal?.eventPushRoll ?? 1)
  const debug = {
    frequency,
    temperature,
    ruleSignals,
    quickJudge,
    semantic,
    agentRoutes,
    minInterval,
    roundsSinceLastNarration
  }

  if (ruleSignals.manualTrigger) {
    return {
      shouldInsert: true,
      narrationKind: 'event_push',
      reasons: ['manual_trigger'],
      modelTier: selectModelTier('event_push', temperature, true),
      frequency,
      temperature,
      score: 1,
      debug
    }
  }

  if (intervalBlocked && !hardEnvironmentChange) {
    return buildSkipPlan({
      frequency,
      temperature,
      skipReason: 'recent_narration_interval',
      reasons: ['recent_narration_interval'],
      debug
    })
  }

  if (hardEnvironmentChange) {
    if (Number(ruleSignals.timeJumpMinutes || 0) >= 120 || quickJudge.tags.includes('time_shift')) reasons.push('hard_time_shift')
    if (ruleSignals.weatherChanged || quickJudge.tags.includes('weather_shift')) reasons.push('hard_weather_shift')
    if (ruleSignals.locationChanged || quickJudge.tags.includes('scene_shift')) reasons.push('hard_scene_shift')
    return {
      shouldInsert: true,
      narrationKind: 'environment',
      reasons: Array.from(new Set(reasons)),
      modelTier: selectModelTier('environment', temperature, true),
      frequency,
      temperature,
      score: 1,
      debug
    }
  }

  const stagnationScore = semantic.maxSimilarity >= 0.82 ? 0.46 : semantic.maxSimilarity >= 0.72 ? 0.32 : 0
  const quickScore = quickJudge.tags.includes('stagnation') || quickJudge.tags.includes('low_information') ? 0.22 : 0
  const externalScore = quickJudge.tags.includes('external_motion') ? 0.2 : 0
  const actionScore = quickJudge.tags.includes('new_action') ? 0.1 : 0
  const appearanceScore = quickJudge.tags.includes('appearance_focus') ? 0.14 : 0
  const confidenceScore = quickJudge.confidence * 0.12
  const score = Math.round(Math.min(1, stagnationScore + quickScore + externalScore + actionScore + appearanceScore + confidenceScore) * 1000) / 1000
  const threshold = WEIGHT_THRESHOLD[frequency]

  if (score >= threshold) {
    const narrationKind: NarrationKind = externalScore > 0 || stagnationScore >= 0.46 ? 'event_push' : (appearanceScore > 0 ? 'appearance' : 'environment')
    if (stagnationScore > 0) reasons.push('semantic_stagnation')
    quickJudge.tags.forEach((tag) => reasons.push(`quick_${tag}`))
    return {
      shouldInsert: true,
      narrationKind,
      reasons: Array.from(new Set(reasons)),
      modelTier: selectModelTier(narrationKind, temperature, false),
      frequency,
      temperature,
      score,
      debug
    }
  }

  const randomEnvironmentProbability = frequency === 'active' ? 0.22 : frequency === 'standard' ? 0.15 : 0
  const randomEventPushProbability = frequency === 'active' ? 0.14 : frequency === 'standard' ? 0.1 : 0
  if (temperature !== 'documentary' && randomEventPush >= 0 && randomEventPush < randomEventPushProbability) {
    return {
      shouldInsert: true,
      narrationKind: 'event_push',
      reasons: ['random_event_push'],
      modelTier: selectModelTier('event_push', temperature, false),
      frequency,
      temperature,
      score,
      debug: { ...debug, randomEventPushProbability, randomEventPush }
    }
  }
  if (randomEnvironment >= 0 && randomEnvironment < randomEnvironmentProbability) {
    return {
      shouldInsert: true,
      narrationKind: 'environment',
      reasons: ['random_environment'],
      modelTier: selectModelTier('environment', temperature, false),
      frequency,
      temperature,
      score,
      debug: { ...debug, randomEnvironmentProbability, randomEnvironment }
    }
  }

  return buildSkipPlan({
    frequency,
    temperature,
    skipReason: 'score_below_threshold',
    reasons: ['score_below_threshold'],
    debug: { ...debug, score, threshold }
  })
}
