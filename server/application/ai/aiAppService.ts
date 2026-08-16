import { createHash, randomBytes } from 'crypto'
import { readFileSync } from 'fs'
import { basename, join, normalize, sep } from 'path'
import { aiRepository, type ApiPresetRecord, createAiRepository } from '../../repositories/aiRepository.js'
import { CHAT_IMAGE_DIR } from '../../db.js'
import { uploadRepository } from '../../repositories/uploadRepository.js'
import { guessChatImageMimeFromFilename, saveGeneratedChatImageBase64 } from '../../repositories/chatImageStorage.js'
import { createProxyAwareFetch } from '../../utils/fetchProxy.js'
import { createSafeOutboundFetch } from '../../security/safeOutboundFetch.js'
import {
  assertLocalSecret,
  decryptApiSecret,
  encryptApiSecret
} from '../../security/localSecretCrypto.js'
import {
  normalizeAiEmbeddingDimension,
  normalizeAiProviderType,
  type AiProviderType
} from '../../../shared/aiProviders.js'
import { normalizeAiUsageFeature } from '../../../shared/aiUsageFeatures.js'
import { acquireModelSlot, attachReleaseToResponse, createGateAbortError } from './modelConcurrencyGate.js'
import { callClaudeCodeBridge, listClaudeCodeBridgeModels } from './claudeCodeBridge.js'
import { callAgySubscriptionBridge, listAgySubscriptionBridgeModels } from './agySubscriptionBridge.js'
import {
  callCodexSubscriptionBridge,
  generateCodexSubscriptionImage,
  listCodexSubscriptionBridgeModels,
  searchCodexSubscriptionWeb,
  type CodexWebSearchSource
} from './codexSubscriptionBridge.js'

export type ApiPreset = ApiPresetRecord & {
  id?: string
  prompt_price_per_million_cents?: number
  completion_price_per_million_cents?: number
  embedding_dimension?: number
}

// 原生工具调用类型（与 OpenAI chat/completions 同形）。tools = 请求入参；tool_choice = 选择策略。
export interface AiToolDefinition {
  type: 'function'
  function: {
    name: string
    description?: string
    parameters?: Record<string, unknown>
  }
}

export type AiToolChoice = 'auto' | 'none' | 'required' | { type: 'function'; function: { name: string } }

export interface AIResult {
  upstream?: globalThis.Response
  model: string
  presetName: string
  presetId?: string
  usageLedger?: AiUsageLedgerContext
  error?: string
  status?: number
}

export interface EmbeddingResult {
  ok: boolean
  model: string
  presetName: string
  presetId?: string
  data?: unknown
  usage?: unknown
  error?: string
  status?: number
}

export interface ImageGenerationResult {
  ok: boolean
  model: string
  presetName: string
  attachment?: {
    id: string
    kind: 'image'
    url: string
    mime: string
    size: number
    originalName: string
    caption: string
    captionStatus: 'done'
  }
  error?: string
  status?: number
}

export interface WebSearchResult {
  ok: boolean
  model: string
  presetName: string
  answer?: string
  sources?: CodexWebSearchSource[]
  error?: string
  status?: number
}

export interface AiCallContext {
  userId?: string
  role?: string
  feature?: string
  // 槽位档 id（fast 书童 / balanced 校书 / message 执笔 / smart 掌阁，与任务分级表同口径）：
  // 决定该次调用按用户额度里哪一档解析预设/模型并做启用门控；缺省回退 balanced 主力档，
  // feature=embedding 一律按编目档处理（嵌入走 createEmbeddings 独立链路）。
  modelUsageSlotId?: string
  sessionId?: string
  sessionLabel?: string
  roundId?: string
  // 消耗单元类型（round/regenerate/correction/precision_edit/batch_projection/projection/agent_task），
  // 与 roundId 搭配：返工类沿用原轮 round_id，跨轮操作 round_id 存 op:… 单元 id。
  unitKind?: string
  usageLabel?: string
  placeLabel?: string
  profileId?: string
  harnessRunId?: string
  modelTurnIndex?: number
  toolEpoch?: number
  toolEpochTurnIndex?: number
  promptRebuild?: boolean
  activeToolNamesHash?: string
  toolSchemaHash?: string
  systemHash?: string
  messagePrefixHash?: string
  requestEnvelopeHash?: string
  firstDiffSource?: string
  timeoutMs?: number
  maxTokens?: number
  temperature?: number
  effort?: string
  serviceTier?: 'fast'
  thinking?: 'enabled' | 'disabled'
  // 原生工具调用（function-calling）：非空时组装进上游请求体的 tools/tool_choice；
  // 缺省/为空则请求体与现有纯文本调用逐字节一致（聊天主链路零回归）。
  tools?: AiToolDefinition[]
  toolChoice?: AiToolChoice
  // 客户端取消信号（路由从 req 连接关闭事件派生）：覆盖排队 + 间隔等待 + 上游请求三段，
  // 取消时服务端不滞留占位（批次 F 前置补强）。
  signal?: AbortSignal
}

/**
 * 订阅桥续接边界必须来自服务端已认证身份与正式会话元数据，不能由提示词或展示名称猜测。
 * 缺少用户或会话时返回空串，桥保持旧有的严格消息前缀匹配，不伪造一个跨业务共享的作用域。
 */
export function buildAiBridgeContinuityKey(context: AiCallContext): string {
  const userId = String(context.userId || '').trim()
  const sessionId = String(context.sessionId || '').trim()
  if (!userId || !sessionId) return ''
  return JSON.stringify({
    version: 2,
    userId,
    sessionId,
    feature: String(context.feature || 'unknown').trim() || 'unknown',
    profileId: String(context.profileId || '').trim()
  })
}

export interface AiUsageLedgerContext {
  userId?: string
  feature: string
  sessionId?: string
  sessionLabel?: string
  roundId?: string
  unitKind?: string
  usageLabel?: string
  placeLabel?: string
  profileId?: string
  harnessRunId?: string
  modelTurnIndex?: number
  toolEpoch?: number
  toolEpochTurnIndex?: number
  promptRebuild?: boolean
  activeToolNamesHash?: string
  toolSchemaHash?: string
  systemHash?: string
  messagePrefixHash?: string
  requestEnvelopeHash?: string
  firstDiffSource?: string
  providerKind?: string
  preset: ApiPreset
  model: string
}

const APPROX_CHARS_PER_TOKEN = 4
const UPSTREAM_ERROR_MAX_LENGTH = 180
// 调用级默认超时（P0 挂死修复·2026-07-12）：此前 context.timeoutMs 全仓无人设置=事实上无超时。
// 非流式（内部 agent 调用/起标题一律走这条）默认 300s；流式默认 120s 且只覆盖到「响应头到达」
// （createRequestTimeout 的 clear() 在拿到 upstream 后立即调用，body 阶段交给现役 BODY_IDLE_TIMEOUT_MS
// 看门狗——见 modelConcurrencyGate.ts）。均可用 env 覆盖，0 表示禁用（与 context.timeoutMs<=0 同口径）。
const DEFAULT_AI_REQUEST_TIMEOUT_MS = 300_000
const DEFAULT_AI_STREAM_HEADER_TIMEOUT_MS = 120_000
const SECRET_PATTERN = /(?:bearer\s+)?(?:sk-[a-z0-9_-]{12,}|[a-z0-9_-]{24,}\.[a-z0-9_-]{12,}\.[a-z0-9_-]{12,}|[a-z0-9_-]{32,})/gi
const QUERY_SECRET_PATTERN = /([?&](?:api[_-]?key|key|token|secret|access_token)=)[^&\s]+/gi

function createUsageId() {
  return `usage_${Date.now().toString(36)}_${randomBytes(8).toString('hex')}`
}

// content 可能是 parts 数组（批2·图片双通道，preset 支持识图时 image_url.url 已内联成 data URI）：
// 朴素 String(array) 会把每个 part 折成 "[object Object]"，把内联的大段 base64 完全漏算，导致预算
// 估算严重失真。这里按 part 类型分别取真实字符长度（image_url 取 url 串长，含 base64 payload）。
function estimateContentCharLength(content: unknown): number {
  if (typeof content === 'string') return content.length
  if (!Array.isArray(content)) return 0
  return content.reduce((sum: number, part: { type?: unknown; text?: unknown; image_url?: { url?: unknown } }) => {
    if (part?.type === 'text') return sum + String(part.text || '').length
    if (part?.type === 'image_url') return sum + String(part.image_url?.url || '').length
    return sum
  }, 0)
}

function estimateTokensFromMessages(messages: unknown[]) {
  const chars = (Array.isArray(messages) ? messages : []).reduce((total, item) => {
    const content = typeof item === 'object' && item ? (item as { content?: unknown }).content : ''
    return total + estimateContentCharLength(content)
  }, 0)
  return Math.max(1, Math.ceil(chars / APPROX_CHARS_PER_TOKEN))
}

function estimateCostCents(preset: ApiPreset, inputTokens: number, outputTokens: number) {
  const promptPrice = Number(preset.prompt_price_per_million_cents || 0)
  const completionPrice = Number(preset.completion_price_per_million_cents || 0)
  return (inputTokens / 1_000_000) * promptPrice + (outputTokens / 1_000_000) * completionPrice
}

/** 缓存可见性方言映射（P2 批 E4·2026-07-12）：各 provider 回传 usage 时缓存读/写字段形状不同，
 *  取第一个能读到的非空方言，读不到就是 0（不影响 inputTokens 口径，inputTokens 仍按 prompt_tokens 总量记）。
 *  - Anthropic 原生形状（claude-code 订阅桥 envelopeToChatCompletion 归一后即此形状）：
 *    cache_read_input_tokens / cache_creation_input_tokens；桥的 prompt_tokens 已把两者与规则输入相加，
 *    故这两个字段是 inputTokens 总量里的子集，不是额外增量。
 *  - DeepSeek：prompt_cache_hit_tokens（命中，miss 字段 prompt_cache_miss_tokens 未直接使用——
 *    prompt_tokens = hit + miss，命中率仍可用 inputTokens 反推）；无 cache_creation 概念。
 *  - OpenAI 及一切 OpenAI 兼容协议（含 GLM/MiniMax，未查到专属缓存字段、按此兜底）：
 *    prompt_tokens_details.cached_tokens（cached_tokens ⊆ prompt_tokens）；GPT-5.6+ 还会在同一 details
 *    下回传 cache_write_tokens，计入缓存创建量。 */
function extractCacheReadTokens(source: Record<string, unknown>): number {
  const anthropic = source.cache_read_input_tokens ?? source.cacheReadInputTokens
  if (anthropic != null) return Math.max(0, Math.trunc(Number(anthropic)))
  const deepseek = source.prompt_cache_hit_tokens
  if (deepseek != null) return Math.max(0, Math.trunc(Number(deepseek)))
  const details = source.prompt_tokens_details as Record<string, unknown> | undefined
  if (details && typeof details === 'object' && details.cached_tokens != null) {
    return Math.max(0, Math.trunc(Number(details.cached_tokens)))
  }
  return 0
}

function extractCacheCreationTokens(source: Record<string, unknown>): number {
  // Anthropic：cache_creation_input_tokens；OpenAI GPT-5.6+：cache_write_tokens。
  const details = source.prompt_tokens_details as Record<string, unknown> | undefined
  const created = source.cache_creation_input_tokens
    ?? source.cacheCreationInputTokens
    ?? (details && typeof details === 'object' ? details.cache_write_tokens ?? details.cacheWriteTokens : undefined)
    ?? source.cache_write_tokens
    ?? source.cacheWriteTokens
  if (created != null) return Math.max(0, Math.trunc(Number(created)))
  return 0
}

function normalizeActualUsageTokens(usage: unknown): {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheCreationTokens: number
} | null {
  if (!usage || typeof usage !== 'object') return null
  const source = usage as Record<string, unknown>
  const inputTokens = Math.max(0, Math.trunc(Number(
    source.prompt_tokens ?? source.promptTokens ?? source.input_tokens ?? source.inputTokens ?? 0
  )))
  const outputTokens = Math.max(0, Math.trunc(Number(
    source.completion_tokens ?? source.completionTokens ?? source.output_tokens ?? source.outputTokens ?? 0
  )))
  if (!inputTokens && !outputTokens) return null
  const cacheReadTokens = extractCacheReadTokens(source)
  const cacheCreationTokens = extractCacheCreationTokens(source)
  return { inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens }
}

function readPositiveInt(value: unknown, fallback: number) {
  const parsed = Math.floor(Number(value))
  if (!Number.isFinite(parsed) || parsed < 0) return fallback
  return parsed
}

export { assertLocalSecret, decryptApiSecret, encryptApiSecret }

const aiOutboundNextAllowedAt = new Map<string, number>()

function normalizeAiMinIntervalSeconds(value: unknown): number {
  const seconds = Math.floor(Number(value))
  if (!Number.isFinite(seconds) || seconds <= 0) return 0
  return Math.max(0, Math.min(3600, seconds))
}

// 账号身份 key：并发令牌池与速率节流共用同一口径。物理约束（同时连接数 / RPM）都按账号算，
// 账号 = 端点 baseUrl + apiKey（同 URL 不同 key 是两个独立账号、各自额度，不能合并；
// 同 baseUrl+apiKey 的多个预设名是同一账号，必须共享一个池/一条节流时间线）。
export function buildAiAccountKey(input: { baseUrl: string; apiKey: string }): string {
  return [
    normalizeBaseUrl(input.baseUrl).toLowerCase(),
    String(input.apiKey || '')
  ].join('\u0000')
}

async function waitForAiOutboundInterval(input: {
  baseUrl: string
  apiKey: string
  model?: string
  minIntervalSeconds?: number
  signal?: AbortSignal
  logger?: { debug?: (...args: any[]) => void }
}) {
  const minIntervalSeconds = normalizeAiMinIntervalSeconds(input.minIntervalSeconds)
  if (minIntervalSeconds <= 0) return
  if (input.signal?.aborted) throw createGateAbortError()
  const key = buildAiAccountKey(input)
  const now = Date.now()
  const nextAllowed = Math.max(now, aiOutboundNextAllowedAt.get(key) || 0)
  aiOutboundNextAllowedAt.set(key, nextAllowed + minIntervalSeconds * 1000)
  const delay = nextAllowed - now
  if (delay <= 0) return
  input.logger?.debug?.(`【AI节流】模型 ${input.model} 等待 ${Math.ceil(delay / 1000)} 秒后调用`)
  // 间隔等待期间被 abort（用户取消/超时）则立即拒绝，不再空等占用（批次 F 前置补强）。
  await new Promise<void>((resolve, reject) => {
    const signal = input.signal
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, delay)
    const onAbort = () => {
      clearTimeout(timer)
      reject(createGateAbortError())
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

function buildUpstreamErrorMessage(prefix: string, status: number, rawText: string): string {
  return `${prefix}（HTTP ${status}）：${sanitizeUpstreamErrorText(rawText)}`
}

function buildViewerUpstreamErrorMessage(input: {
  prefix: string
  status: number
  rawText: string
}) {
  return buildUpstreamErrorMessage(input.prefix, input.status, input.rawText)
}

export function sanitizeUpstreamErrorText(rawText: string): string {
  const text = String(rawText || '').trim()
  if (!text) return '上游服务未返回可读错误'
  let message = text
  try {
    const parsed = JSON.parse(text)
    const nested = parsed?.error?.message || parsed?.error || parsed?.message
    message = typeof nested === 'string' ? nested : text
  } catch {
    message = text
  }
  return message
    .replace(QUERY_SECRET_PATTERN, '$1[redacted]')
    .replace(SECRET_PATTERN, '[redacted]')
    .replace(/\s+/g, ' ')
    .slice(0, UPSTREAM_ERROR_MAX_LENGTH)
}

function normalizeBaseUrl(baseUrl: string): string {
  return String(baseUrl || '').trim().replace(/\/+$/, '')
}

function buildProviderEndpoint(baseUrl: string, endpoint: 'chat/completions' | 'models' | 'embeddings', providerType: AiProviderType = 'openai-compatible'): string {
  const normalized = normalizeBaseUrl(baseUrl)
  if (!normalized) return ''
  if (new RegExp(`/${endpoint.replace('/', '\\/')}$`, 'i').test(normalized)) {
    return normalized
  }
  if (endpoint === 'embeddings' && /\/(?:chat\/completions|models)$/i.test(normalized)) {
    return normalized.replace(/\/(?:chat\/completions|models)$/i, '/embeddings')
  }
  if (endpoint === 'chat/completions' && /\/embeddings$/i.test(normalized)) {
    return normalized.replace(/\/embeddings$/i, '/chat/completions')
  }
  if (endpoint === 'models' && /\/embeddings$/i.test(normalized)) {
    return normalized.replace(/\/embeddings$/i, '/models')
  }
  if (endpoint === 'chat/completions' && /\/models$/i.test(normalized)) {
    return normalized.replace(/\/models$/i, '/chat/completions')
  }
  if (endpoint === 'models' && /\/chat\/completions$/i.test(normalized)) {
    return normalized.replace(/\/chat\/completions$/i, '/models')
  }
  if (providerType === 'deepseek') {
    if (/\/v\d+$/i.test(normalized)) return `${normalized}/${endpoint}`
    return `${normalized}/${endpoint}`
  }
  if (/\/(?:v\d+|api\/(?:coding\/)?paas\/v\d+)$/i.test(normalized)) {
    return `${normalized}/${endpoint}`
  }
  return `${normalized}/v1/${endpoint}`
}

function shouldUseMaxTokens(baseUrl: string, providerType: AiProviderType): boolean {
  const normalized = normalizeBaseUrl(baseUrl)
  return providerType === 'deepseek'
    || providerType === 'glm'
    || providerType === 'minimax'
    || /(?:minimaxi?\.io|minimaxi\.com|bigmodel\.cn|deepseek\.com|\/api\/(?:coding\/)?paas\/v\d+)$/i.test(normalized)
}

function shouldRequestStreamUsage(baseUrl: string): boolean {
  return /bigmodel\.cn|\/api\/(?:coding\/)?paas\/v\d+/i.test(normalizeBaseUrl(baseUrl))
}

function isOfficialOpenAiBaseUrl(baseUrl: string): boolean {
  try {
    const url = new URL(normalizeBaseUrl(baseUrl))
    return url.protocol === 'https:' && url.hostname.toLowerCase() === 'api.openai.com'
  } catch {
    return false
  }
}

function supportsOpenAiExplicitPromptCache(model: string): boolean {
  const match = String(model || '').trim().toLowerCase().match(/^gpt-(\d+)(?:\.(\d+))?/)
  if (!match) return false
  const major = Number(match[1] || 0)
  const minor = Number(match[2] || 0)
  return major > 5 || (major === 5 && minor >= 6)
}

function buildOpenAiPromptCacheKey(context: AiCallContext, model: string): string {
  const userId = String(context.userId || '').trim()
  const sessionId = String(context.sessionId || '').trim()
  const profileId = String(context.profileId || '').trim()
  if (!userId || !sessionId || !profileId) return ''
  const digest = createHash('sha256')
    .update(JSON.stringify({
      version: 1,
      userId,
      sessionId,
      profileId,
      model: String(model || '').trim(),
      capabilityEnvelopeVersion: 'tidiao-tool-epoch-v1'
    }))
    .digest('hex')
  return `lh:${digest}`
}

function isOpenRouterProvider(baseUrl: string): boolean {
  const normalized = normalizeBaseUrl(baseUrl)
  return /openrouter\.ai/i.test(normalized)
}

function usesTypedThinkingControl(baseUrl: string, providerType: AiProviderType): boolean {
  const normalized = normalizeBaseUrl(baseUrl)
  return providerType === 'deepseek'
    || providerType === 'glm'
    || /(?:deepseek\.com|bigmodel\.cn|z\.ai|moonshot\.(?:ai|cn)|api\.kimi\.com|ark\.[^.]+\.volces\.com|volcengine\.com|\/api\/(?:coding\/)?paas\/v\d+)/i.test(normalized)
}

function usesEnableThinkingControl(baseUrl: string, model: string): boolean {
  const normalized = normalizeBaseUrl(baseUrl)
  const modelName = String(model || '').toLowerCase()
  return /(?:dashscope|aliyuncs|bailian|siliconflow)/i.test(normalized)
    || /(?:^|[-_/])(?:qwen|qwq)(?:[-_/]|\d|$)/i.test(modelName)
}

function usesOpenAIReasoningControl(baseUrl: string, model: string): boolean {
  const normalized = normalizeBaseUrl(baseUrl)
  const modelName = String(model || '').toLowerCase()
  return /(?:api\.openai\.com|openai\.azure\.com)/i.test(normalized)
    || /^(?:gpt-5|o[134](?:-|$)|o4(?:-|$)|o3(?:-|$)|o1(?:-|$))/i.test(modelName)
}

function getGeminiDisabledReasoningEffort(baseUrl: string, model: string): 'none' | 'minimal' | 'low' | '' {
  const normalized = normalizeBaseUrl(baseUrl)
  const modelName = String(model || '').toLowerCase()
  const isGemini = /(?:generativelanguage\.googleapis\.com|googleapis\.com\/.*openai|gemini)/i.test(normalized)
    || /gemini/i.test(modelName)
  if (!isGemini) return ''
  if (/gemini-2\.5-(?:flash|flash-lite|flashlite|robotics)/i.test(modelName)) return 'none'
  if (/gemini-3.*pro/i.test(modelName)) return 'low'
  if (/gemini-3.*(?:flash|lite)/i.test(modelName)) return 'minimal'
  if (/gemini-2\.5-pro/i.test(modelName)) return 'low'
  return ''
}

function usesMiniMaxReasoningSplit(baseUrl: string, providerType: AiProviderType): boolean {
  const normalized = normalizeBaseUrl(baseUrl)
  return providerType === 'minimax' || /minimaxi?\.com|api\.minimax\.io/i.test(normalized)
}

function supportsThinkingControl(baseUrl: string, providerType: AiProviderType, model: string): boolean {
  return isOpenRouterProvider(baseUrl)
    || usesTypedThinkingControl(baseUrl, providerType)
    || usesEnableThinkingControl(baseUrl, model)
    || usesOpenAIReasoningControl(baseUrl, model)
    || Boolean(getGeminiDisabledReasoningEffort(baseUrl, model))
    || usesMiniMaxReasoningSplit(baseUrl, providerType)
}

function applyThinkingControl(requestBody: Record<string, unknown>, baseUrl: string, payload: {
  providerType: AiProviderType
  model: string
  thinking?: 'enabled' | 'disabled'
}): boolean {
  if (payload.thinking !== 'enabled' && payload.thinking !== 'disabled') return false
  const disabled = payload.thinking === 'disabled'
  const enabled = payload.thinking === 'enabled'

  if (isOpenRouterProvider(baseUrl)) {
    requestBody.reasoning = disabled
      ? { effort: 'none', exclude: true }
      : { enabled: true, exclude: false }
    return true
  }

  if (usesTypedThinkingControl(baseUrl, payload.providerType)) {
    requestBody.thinking = { type: payload.thinking }
    return true
  }

  if (usesEnableThinkingControl(baseUrl, payload.model)) {
    requestBody.enable_thinking = enabled
    return true
  }

  const geminiEffort = disabled ? getGeminiDisabledReasoningEffort(baseUrl, payload.model) : ''
  if (geminiEffort) {
    requestBody.reasoning_effort = geminiEffort
    return true
  }

  if (disabled && usesOpenAIReasoningControl(baseUrl, payload.model)) {
    requestBody.reasoning_effort = 'none'
    return true
  }

  if (disabled && usesMiniMaxReasoningSplit(baseUrl, payload.providerType)) {
    requestBody.reasoning_split = true
    return true
  }

  return false
}

function createRequestTimeout(timeoutMs: number | undefined) {
  const value = Number(timeoutMs || 0)
  if (!Number.isFinite(value) || value <= 0) {
    return { signal: undefined as AbortSignal | undefined, clear: () => {} }
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), value)
  return {
    signal: controller.signal as AbortSignal | undefined,
    clear: () => clearTimeout(timer)
  }
}

// 合并两个取消信号：任一 abort 即触发结果信号 abort。两个都没有则返回 undefined。
// 用于让"排队 + 间隔等待 + 上游请求"同时受客户端取消(context.signal)与超时(timeoutMs)管辖。
function mergeAbortSignals(a?: AbortSignal, b?: AbortSignal): AbortSignal | undefined {
  if (!a) return b
  if (!b) return a
  if (a.aborted) return a
  if (b.aborted) return b
  const controller = new AbortController()
  const onAbort = () => {
    controller.abort()
    a.removeEventListener('abort', onAbort)
    b.removeEventListener('abort', onAbort)
  }
  a.addEventListener('abort', onAbort, { once: true })
  b.addEventListener('abort', onAbort, { once: true })
  return controller.signal
}

type ChatRole = 'system' | 'user' | 'assistant'

// content parts（批2·输入框图片上传·双通道 A）：与 routes/ai.ts 的 AiChatContentPart 同形，
// 服务端各层独立声明（不跨路由/应用层 import），结构对齐即可。
type AiContentPartLike = {
  type?: unknown
  text?: unknown
  image_url?: { url?: unknown }
  prompt_cache_breakpoint?: { mode: 'explicit' }
}

interface ChatPayloadMessage {
  role?: ChatRole | string
  content?: string | AiContentPartLike[]
  name?: string
}

/**
 * content parts 数组 → 纯文本：text part 合并，image part 换成占位提示（不静默丢，模型至少知道这里
 * 本来有张图）。与 claudeCodeBridge.ts 的 flattenContent（101-116行）同一语义各自独立维护——图片双
 * 通道分流逻辑改动时留意那处联动。本文件一切仍按字符串处理 content 的旧逻辑（含下面 minimax 专属
 * normalizeMessagesForProvider）统一经它兜底，避免数组 content 直接进字符串拼接产出 [object Object]。
 */
function flattenAiContentToText(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return (content as AiContentPartLike[])
    .map((part) => {
      if (part?.type === 'text') return String(part.text || '')
      if (part?.type === 'image_url') return '[图片：当前模型不支持识图，已忽略]'
      return ''
    })
    .join('')
}

function normalizeMessagesForProvider(baseUrl: string, messages: unknown[]): ChatPayloadMessage[] {
  const list = Array.isArray(messages) ? messages as ChatPayloadMessage[] : []
  if (!/minimaxi\.com/i.test(String(baseUrl || ''))) {
    return list
  }

  const systemMessages = list
    .filter((item) => item?.role === 'system' && flattenAiContentToText(item?.content).trim())
    .map((item) => flattenAiContentToText(item.content).trim())

  const normalMessages = list
    .filter((item) => item?.role !== 'system')
    .map((item) => ({
      role: item.role === 'assistant' ? 'assistant' : 'user',
      content: flattenAiContentToText(item.content),
      name: item.name
    }))

  if (!systemMessages.length) {
    return normalMessages
  }

  const mergedSystem = `系统提示：\n${systemMessages.join('\n\n')}\n\n`
  const firstUserIndex = normalMessages.findIndex((item) => item.role === 'user')

  if (firstUserIndex >= 0) {
    normalMessages[firstUserIndex] = {
      ...normalMessages[firstUserIndex],
      content: `${mergedSystem}${String(normalMessages[firstUserIndex].content || '')}`.trim()
    }
    return normalMessages
  }

  return [
    { role: 'user', content: mergedSystem.trim() },
    ...normalMessages
  ]
}

/**
 * `/chat-images/xxx` 相对路径 → `data:mime;base64,...` 内联（外部供应商访问不到本机 URL，必须内联）。
 * 已是 data: 内联 URI 的 part 原样透传。安全校验三层：① basename 剥离后必须与原值一致（拦截 `../`
 * 穿越/绝对路径伪装）；② 必须存在于本地文件登记表（与 /chat-images
 * 静态服务门禁使用同一张表，不认不存在的路径）；③ 落盘绝对路径规范化后仍需在
 * CHAT_IMAGE_DIR 内（双保险）。任一环节失败或文件读取失败 → 降级成文本占位，不抛错、不阻断整轮。
 */
function inlineChatImageContentPart(part: AiContentPartLike): AiContentPartLike {
  if (!part || part.type !== 'image_url') return part
  const rawUrl = String(part.image_url?.url || '').trim()
  if (/^data:/i.test(rawUrl)) return part
  if (!rawUrl.startsWith('/chat-images/')) {
    return { type: 'text', text: '[图片已失效]' }
  }
  const relative = rawUrl.slice('/chat-images/'.length)
  const filename = basename(relative)
  if (!filename || filename !== relative) {
    return { type: 'text', text: '[图片已失效]' }
  }
  if (!uploadRepository.canServeStoredPath(`chat-images/${filename}`)) {
    return { type: 'text', text: '[图片已失效]' }
  }
  const absolutePath = normalize(join(CHAT_IMAGE_DIR, filename))
  if (!absolutePath.startsWith(normalize(CHAT_IMAGE_DIR + sep))) {
    return { type: 'text', text: '[图片已失效]' }
  }
  const mime = guessChatImageMimeFromFilename(filename)
  if (!mime) return { type: 'text', text: '[图片已失效]' }
  try {
    const buffer = readFileSync(absolutePath)
    return { type: 'image_url', image_url: { url: `data:${mime};base64,${buffer.toString('base64')}` } }
  } catch {
    return { type: 'text', text: '[图片已失效]' }
  }
}

/** 本机订阅桥保留相对路径，但仍先经过上传台账与目录边界门禁。 */
function validateLocalBridgeImageContentPart(part: AiContentPartLike): AiContentPartLike {
  if (!part || part.type !== 'image_url') return part
  const rawUrl = String(part.image_url?.url || '').trim()
  if (/^data:image\//i.test(rawUrl)) return part
  if (!rawUrl.startsWith('/chat-images/')) return { type: 'text', text: '[图片已失效]' }
  const relative = rawUrl.slice('/chat-images/'.length).split(/[?#]/, 1)[0]
  let decoded = relative
  try {
    decoded = decodeURIComponent(relative)
  } catch {
    return { type: 'text', text: '[图片已失效]' }
  }
  const filename = basename(decoded)
  if (!filename || filename !== decoded) return { type: 'text', text: '[图片已失效]' }
  if (!uploadRepository.canServeStoredPath(`chat-images/${filename}`)) return { type: 'text', text: '[图片已失效]' }
  const absolutePath = normalize(join(CHAT_IMAGE_DIR, filename))
  if (!absolutePath.startsWith(normalize(CHAT_IMAGE_DIR + sep))) return { type: 'text', text: '[图片已失效]' }
  return part
}

/**
 * 图片双通道分流（批2·输入框图片上传·单点分流，callAIWithFallback 解析到目标 preset 后立即调用）：
 * - providerType=claude-code/codex-subscription/agy-subscription → 经上传台账与路径门禁后保留 image parts（不内联、
 *   不拍平），交给对应订阅桥按受控本机图片路径识图。该分支优先于 supports_vision。
 * - 其余 providerType 且 preset.supports_vision → image_url part 读盘内联成 data URI。
 * - 其余情况（未标 supports_vision / minimax 等）→ 走 flattenAiContentToText 拍平。
 * 只处理 content 是数组的消息，纯字符串消息原样透传——绝大多数现有调用零改动。
 */
function dispatchMessageContentForVision(
  messages: unknown[],
  preset: ApiPreset,
  providerType: AiProviderType
): ChatPayloadMessage[] {
  const list = Array.isArray(messages) ? messages as ChatPayloadMessage[] : []
  if (providerType === 'claude-code' || providerType === 'codex-subscription' || providerType === 'agy-subscription') {
    return list.map((message) => Array.isArray(message?.content)
      ? { ...message, content: (message.content as AiContentPartLike[]).map(validateLocalBridgeImageContentPart) }
      : message)
  }
  const supportsVision = Number((preset as { supports_vision?: unknown }).supports_vision || 0) > 0
  return list.map((message) => {
    if (!Array.isArray(message?.content)) return message
    if (!supportsVision) {
      return { ...message, content: flattenAiContentToText(message.content) }
    }
    return { ...message, content: (message.content as AiContentPartLike[]).map(inlineChatImageContentPart) }
  })
}

function markOpenAiSystemPromptCacheBreakpoint(messages: ChatPayloadMessage[]): {
  messages: ChatPayloadMessage[]
  applied: boolean
} {
  const systemIndex = messages.findIndex((message) => message.role === 'system')
  if (systemIndex < 0) return { messages, applied: false }
  const content = messages[systemIndex]?.content
  const parts: AiContentPartLike[] = typeof content === 'string'
    ? [{ type: 'text', text: content }]
    : Array.isArray(content)
      ? content.map((part) => ({ ...part }))
      : []
  let textIndex = -1
  for (let index = parts.length - 1; index >= 0; index -= 1) {
    if (parts[index]?.type === 'text') {
      textIndex = index
      break
    }
  }
  if (textIndex < 0) return { messages, applied: false }
  parts[textIndex] = {
    ...parts[textIndex],
    prompt_cache_breakpoint: { mode: 'explicit' }
  }
  return {
    messages: messages.map((message, index) => (
      index === systemIndex ? { ...message, content: parts } : message
    )),
    applied: true
  }
}

function buildProviderPayload(baseUrl: string, payload: {
  providerType: AiProviderType
  messages: ChatPayloadMessage[]
  model: string
  stream: boolean
  temperature: number
  maxTokens: number
  includeStreamUsage?: boolean
  thinking?: 'enabled' | 'disabled'
  tools?: AiToolDefinition[]
  toolChoice?: AiToolChoice
  promptCacheKey?: string
  explicitPromptCache?: boolean
}) {
  const promptCacheMessages = payload.explicitPromptCache
    ? markOpenAiSystemPromptCacheBreakpoint(payload.messages)
    : { messages: payload.messages, applied: false }
  const requestBody: Record<string, unknown> = {
    messages: promptCacheMessages.messages,
    model: payload.model,
    stream: payload.stream,
    temperature: payload.temperature
  }

  if (shouldUseMaxTokens(baseUrl, payload.providerType)) {
    requestBody.max_tokens = payload.maxTokens
  } else {
    requestBody.max_completion_tokens = payload.maxTokens
  }

  if (payload.stream && payload.includeStreamUsage) {
    requestBody.stream_options = { include_usage: true }
  }

  // 原生工具调用：仅在传入非空 tools 时才塞 tools/tool_choice；
  // 不传时请求体与改造前完全一致，纯文本调用零回归。
  if (Array.isArray(payload.tools) && payload.tools.length) {
    requestBody.tools = payload.tools
    requestBody.tool_choice = payload.toolChoice ?? 'auto'
  }
  if (payload.promptCacheKey) requestBody.prompt_cache_key = payload.promptCacheKey
  if (promptCacheMessages.applied) requestBody.prompt_cache_options = { mode: 'explicit' }

  applyThinkingControl(requestBody, baseUrl, payload)

  return requestBody
}

function shouldRetryWithoutThinking(
  baseUrl: string,
  providerType: AiProviderType,
  model: string,
  thinking: unknown,
  status: number,
  errorText: string
): boolean {
  if (thinking !== 'enabled' && thinking !== 'disabled') return false
  if (!supportsThinkingControl(baseUrl, providerType, model)) return false
  if (status !== 400 && status !== 422) return false
  return /thinking|enable_thinking|reasoning|reasoning_effort|reasoning_split|unsupported|unknown|unrecognized|invalid|extra/i.test(errorText)
}

function estimateTokensFromEmbeddingInput(input: string | string[]) {
  const values = Array.isArray(input) ? input : [input]
  const chars = values.reduce((total, item) => total + String(item || '').length, 0)
  return Math.max(1, Math.ceil(chars / APPROX_CHARS_PER_TOKEN))
}

// 额度五档槽位：与 src/utils/modelTaskTiers.ts 任务分级表同一套口径。
// 文本调用带 fast/balanced/message/smart 槽位 id；嵌入固定归编目 embedding。
export const MODEL_USAGE_SLOT_IDS = ['fast', 'balanced', 'message', 'smart', 'embedding'] as const
export type ModelUsageSlot = typeof MODEL_USAGE_SLOT_IDS[number]
export const MODEL_USAGE_SLOT_LABELS: Record<ModelUsageSlot, string> = {
  fast: '书童',
  balanced: '校书',
  message: '执笔',
  smart: '掌阁',
  embedding: '编目'
}

/** 归一化槽位：feature=embedding 一律编目；未标槽位（旧客户端/杂项调用）回退校书主力档。 */
export function normalizeModelUsageSlot(slotId: unknown, feature: unknown): ModelUsageSlot {
  if (normalizeAiUsageFeature(feature) === 'embedding') return 'embedding'
  const text = String(slotId || '').trim()
  return text === 'fast' || text === 'balanced' || text === 'message' || text === 'smart' ? text : 'balanced'
}

/** 外呼异常人话化（2026-07-02）：undici 网络层失败只给笼统 message「fetch failed」，真实原因（ECONNRESET/
 *  ETIMEDOUT/代理拒连等）藏在 error.cause（可能层层嵌套或 AggregateError）。把 cause 链拼进文案，
 *  日志/报错能看到真凶，不再只剩「fetch failed」四个字母。 */
export function describeOutboundCallError(error: unknown): string {
  const parts: string[] = []
  let current: unknown = error
  const seen = new Set<unknown>()
  while (current && !seen.has(current) && parts.length < 4) {
    seen.add(current)
    const e = current as { code?: unknown; message?: unknown; cause?: unknown; errors?: unknown[] }
    const text = [String(e.code || '').trim(), String(e.message || '').trim()].filter(Boolean).join(' ')
    if (text && !parts.includes(text)) parts.push(text)
    current = Array.isArray(e.errors) && e.errors.length ? e.errors[0] : e.cause
  }
  return parts.join('；') || '未知网络错误'
}

export function createAiAppService(
  repository: ReturnType<typeof createAiRepository> = aiRepository,
  fetchImpl?: typeof fetch,
  env: NodeJS.ProcessEnv = process.env
) {
  assertLocalSecret(env)
  const outboundFetch = createSafeOutboundFetch(fetchImpl || createProxyAwareFetch(fetch, env), {
    skipDnsLookup: Boolean(fetchImpl)
  })
  // 调用级默认超时策略（P0 挂死修复）：0 视为显式禁用（readPositiveInt 允许 0 通过）。
  const timeoutPolicy = {
    requestTimeoutMs: readPositiveInt(env.LANGHUAN_AI_REQUEST_TIMEOUT_MS, DEFAULT_AI_REQUEST_TIMEOUT_MS),
    streamHeaderTimeoutMs: readPositiveInt(env.LANGHUAN_AI_STREAM_HEADER_TIMEOUT_MS, DEFAULT_AI_STREAM_HEADER_TIMEOUT_MS)
  }

  const getPresetConfig = (presetName: string | undefined): ApiPreset | undefined => {
    const requestedName = String(presetName || '').trim()
    return requestedName ? repository.getPresetByName(requestedName) : repository.getDefaultPreset()
  }

  const getDefaultApiKey = (preset: ApiPreset | undefined): string => {
    if (preset?.api_key) return String(preset.api_key)
    if (env.DEFAULT_AI_API_KEY) return env.DEFAULT_AI_API_KEY
    return ''
  }

  const writeUsageLedger = (input: {
    userId?: string
    feature: string
    sessionId?: string
    sessionLabel?: string
    roundId?: string
    unitKind?: string
    usageLabel?: string
    placeLabel?: string
    profileId?: string
    harnessRunId?: string
    modelTurnIndex?: number
    toolEpoch?: number
    toolEpochTurnIndex?: number
    promptRebuild?: boolean
    activeToolNamesHash?: string
    toolSchemaHash?: string
    systemHash?: string
    messagePrefixHash?: string
    requestEnvelopeHash?: string
    firstDiffSource?: string
    providerKind?: string
    preset: ApiPreset
    model: string
    inputTokens: number
    outputTokens: number
    cacheReadTokens?: number
    cacheCreationTokens?: number
    status: string
    errorCode?: string
  }) => {
    if (!input.userId) return
    repository.insertUsageLedger({
      id: createUsageId(),
      userId: input.userId,
      presetId: input.preset.id || '',
      presetName: input.preset.name || '',
      feature: input.feature,
      sessionId: input.sessionId || '',
      sessionLabel: input.sessionLabel || '',
      roundId: input.roundId || '',
      unitKind: input.unitKind || '',
      usageLabel: input.usageLabel || '',
      placeLabel: input.placeLabel || '',
      profileId: input.profileId || '',
      harnessRunId: input.harnessRunId || '',
      modelTurnIndex: input.modelTurnIndex || 0,
      toolEpoch: input.toolEpoch || 0,
      toolEpochTurnIndex: input.toolEpochTurnIndex || 0,
      promptRebuild: input.promptRebuild === true,
      activeToolNamesHash: input.activeToolNamesHash || '',
      toolSchemaHash: input.toolSchemaHash || '',
      systemHash: input.systemHash || '',
      messagePrefixHash: input.messagePrefixHash || '',
      requestEnvelopeHash: input.requestEnvelopeHash || '',
      firstDiffSource: input.firstDiffSource || '',
      providerKind: input.providerKind || '',
      model: input.model,
      inputTokens: input.inputTokens,
      outputTokens: input.outputTokens,
      cacheReadTokens: input.cacheReadTokens || 0,
      cacheCreationTokens: input.cacheCreationTokens || 0,
      estimatedCostCents: estimateCostCents(input.preset, input.inputTokens, input.outputTokens),
      status: input.status,
      errorCode: input.errorCode || ''
    })
  }

  const buildUsageLedgerContext = (input: Omit<AiUsageLedgerContext, 'preset' | 'model'> & {
    preset: ApiPreset
    model: string
  }): AiUsageLedgerContext => ({
    userId: input.userId,
    feature: input.feature,
    sessionId: input.sessionId || '',
    sessionLabel: input.sessionLabel || '',
    roundId: input.roundId || '',
    unitKind: input.unitKind || '',
    usageLabel: input.usageLabel || '',
    placeLabel: input.placeLabel || '',
    profileId: input.profileId || '',
    harnessRunId: input.harnessRunId || '',
    modelTurnIndex: input.modelTurnIndex || 0,
    toolEpoch: input.toolEpoch || 0,
    toolEpochTurnIndex: input.toolEpochTurnIndex || 0,
    promptRebuild: input.promptRebuild === true,
    activeToolNamesHash: input.activeToolNamesHash || '',
    toolSchemaHash: input.toolSchemaHash || '',
    systemHash: input.systemHash || '',
    messagePrefixHash: input.messagePrefixHash || '',
    requestEnvelopeHash: input.requestEnvelopeHash || '',
    firstDiffSource: input.firstDiffSource || '',
    providerKind: input.providerKind || '',
    preset: input.preset,
    model: input.model
  })

  const recordZeroTokenErrorLedger = (context: AiUsageLedgerContext | undefined, errorCode: string) => {
    if (!context?.userId) return
    writeUsageLedger({
      userId: context.userId,
      feature: context.feature,
      sessionId: context.sessionId,
      sessionLabel: context.sessionLabel,
      roundId: context.roundId,
      unitKind: context.unitKind,
      usageLabel: context.usageLabel,
      placeLabel: context.placeLabel,
      profileId: context.profileId,
      harnessRunId: context.harnessRunId,
      modelTurnIndex: context.modelTurnIndex,
      toolEpoch: context.toolEpoch,
      toolEpochTurnIndex: context.toolEpochTurnIndex,
      promptRebuild: context.promptRebuild,
      activeToolNamesHash: context.activeToolNamesHash,
      toolSchemaHash: context.toolSchemaHash,
      systemHash: context.systemHash,
      messagePrefixHash: context.messagePrefixHash,
      requestEnvelopeHash: context.requestEnvelopeHash,
      firstDiffSource: context.firstDiffSource,
      providerKind: context.providerKind,
      preset: context.preset,
      model: context.model,
      inputTokens: 0,
      outputTokens: 0,
      status: 'error',
      errorCode
    })
  }

  const getViewerModel = (_preset: ApiPreset, model: string, _role?: string) => String(model || '')

  const getViewerPresetName = (_preset: ApiPreset, presetName: string, _model?: string, _role?: string) => String(presetName || '')

  return {
    getPresetConfig,
    getDefaultApiKey,
    recordActualChatUsage(context: AiUsageLedgerContext | undefined, usage: unknown): boolean {
      if (!context?.userId) return false
      const actual = normalizeActualUsageTokens(usage)
      // P0 记账收口（2026-07-12）：此前 provider 不回 usage（或格式不认识）时直接 return false、
      // 一行都不写——这次调用即便真实发生了外呼也永远不计入额度基数，hard_stop 对它彻底失效。
      // 现改为始终写一条 success 行：usage 缺失时 token 记 0、errorCode 借用做「usage 缺失」标记
      // （success 状态下 errorCode 语义从「错误码」变为「异常标记」，只作为本地排查依据）。
      writeUsageLedger({
        userId: context.userId,
        feature: context.feature,
        sessionId: context.sessionId,
        sessionLabel: context.sessionLabel,
        roundId: context.roundId,
        unitKind: context.unitKind,
        usageLabel: context.usageLabel,
        placeLabel: context.placeLabel,
        profileId: context.profileId,
        harnessRunId: context.harnessRunId,
        modelTurnIndex: context.modelTurnIndex,
        toolEpoch: context.toolEpoch,
        toolEpochTurnIndex: context.toolEpochTurnIndex,
        promptRebuild: context.promptRebuild,
        activeToolNamesHash: context.activeToolNamesHash,
        toolSchemaHash: context.toolSchemaHash,
        systemHash: context.systemHash,
        messagePrefixHash: context.messagePrefixHash,
        requestEnvelopeHash: context.requestEnvelopeHash,
        firstDiffSource: context.firstDiffSource,
        providerKind: context.providerKind,
        preset: context.preset,
        model: context.model,
        inputTokens: actual?.inputTokens || 0,
        outputTokens: actual?.outputTokens || 0,
        cacheReadTokens: actual?.cacheReadTokens || 0,
        cacheCreationTokens: actual?.cacheCreationTokens || 0,
        status: 'success',
        errorCode: actual ? '' : 'usage_missing'
      })
      return true
    },
    async generateImage(
      payload: { prompt: string; presetName?: string; model?: string; effort?: string },
      context: AiCallContext = {}
    ): Promise<ImageGenerationResult> {
      const prompt = String(payload.prompt || '').trim()
      if (!prompt) return { ok: false, error: '生图描述不能为空', status: 400, model: '', presetName: '' }
      if (prompt.length > 8000) return { ok: false, error: '生图描述不能超过 8000 字', status: 400, model: '', presetName: '' }
      const feature = normalizeAiUsageFeature(context.feature || 'xingyi')
      const preset = getPresetConfig(payload.presetName, context.userId || '', feature, context.modelUsageSlotId)
      if (!preset) return { ok: false, error: '未找到生图所用的模型预设', status: 400, model: '', presetName: '' }
      const providerType = normalizeAiProviderType(preset.provider_type)
      const useModel = String(payload.model || preset.model || '').trim() || 'default'
      const currentPresetName = String(payload.presetName || preset.name || '')
      const viewerModel = getViewerModel(preset, useModel, context.role)
      const viewerPresetName = getViewerPresetName(preset, currentPresetName, useModel, context.role)
      if (providerType !== 'codex-subscription') {
        return {
          ok: false,
          error: '星依生图目前只支持「Codex（订阅桥）」预设；请把校书档切到 Codex 订阅桥后再试',
          status: 400,
          model: viewerModel,
          presetName: viewerPresetName
        }
      }
      const inputTokens = estimateTokensFromMessages([{ role: 'user', content: prompt }])
      const apiKey = getDefaultApiKey(preset)
      const minInterval = Number((preset as { min_interval?: unknown }).min_interval)
      const signal = context.signal
      let release: (() => void) | null = null
      try {
        await waitForAiOutboundInterval({
          baseUrl: preset.base_url,
          apiKey,
          model: useModel,
          minIntervalSeconds: Number.isFinite(minInterval) && minInterval > 0 ? minInterval : undefined,
          signal
        })
        release = await acquireModelSlot(
          buildAiAccountKey({ baseUrl: preset.base_url, apiKey }),
          (preset as { max_concurrency?: unknown }).max_concurrency,
          signal
        )
        const generated = await generateCodexSubscriptionImage({
          prompt,
          model: useModel,
          effort: String(payload.effort || context.effort || '').trim(),
          signal
        })
        const saved = saveGeneratedChatImageBase64(generated.image.result)
        if (!saved.ok) throw new Error(saved.error)
        const caption = String(generated.image.revisedPrompt || prompt).trim()
        writeUsageLedger({
          userId: context.userId,
          feature,
          sessionId: context.sessionId,
          sessionLabel: context.sessionLabel,
          roundId: context.roundId,
          unitKind: context.unitKind,
          usageLabel: context.usageLabel || '星依生图',
          placeLabel: context.placeLabel || '星依浮坞',
          preset,
          model: useModel,
          inputTokens: Number(generated.usage?.inputTokens || inputTokens),
          outputTokens: Number(generated.usage?.outputTokens || 0),
          cacheReadTokens: Number(generated.usage?.cachedInputTokens || 0),
          status: 'success'
        })
        return {
          ok: true,
          model: viewerModel,
          presetName: viewerPresetName,
          attachment: {
            id: saved.id,
            kind: 'image',
            url: saved.url,
            mime: saved.mime,
            size: saved.size,
            originalName: `星依生成图片.${saved.mime.split('/')[1] || 'png'}`,
            caption,
            captionStatus: 'done'
          }
        }
      } catch (error) {
        const aborted = error instanceof Error && error.name === 'AbortError'
        if (!aborted) {
          writeUsageLedger({
            userId: context.userId,
            feature,
            sessionId: context.sessionId,
            sessionLabel: context.sessionLabel,
            roundId: context.roundId,
            unitKind: context.unitKind,
            usageLabel: context.usageLabel || '星依生图',
            placeLabel: context.placeLabel || '星依浮坞',
            preset,
            model: useModel,
            inputTokens: 0,
            outputTokens: 0,
            status: 'error',
            errorCode: 'image_generation_failed'
          })
        }
        return {
          ok: false,
          error: aborted ? '生图已取消' : (error as Error).message,
          status: aborted ? 499 : 500,
          model: viewerModel,
          presetName: viewerPresetName
        }
      } finally {
        release?.()
      }
    },
    async searchWeb(
      payload: { query: string; presetName?: string; model?: string; effort?: string },
      context: AiCallContext = {}
    ): Promise<WebSearchResult> {
      const query = String(payload.query || '').trim()
      if (!query) return { ok: false, error: '联网检索词不能为空', status: 400, model: '', presetName: '' }
      if (query.length > 2000) return { ok: false, error: '联网检索词不能超过 2000 字', status: 400, model: '', presetName: '' }
      const feature = normalizeAiUsageFeature(context.feature || 'xingyi')
      const preset = getPresetConfig(payload.presetName, context.userId || '', feature, context.modelUsageSlotId)
      if (!preset) return { ok: false, error: '未找到联网检索所用的模型预设', status: 400, model: '', presetName: '' }
      const providerType = normalizeAiProviderType(preset.provider_type)
      const useModel = String(payload.model || preset.model || '').trim() || 'default'
      const currentPresetName = String(payload.presetName || preset.name || '')
      const viewerModel = getViewerModel(preset, useModel, context.role)
      const viewerPresetName = getViewerPresetName(preset, currentPresetName, useModel, context.role)
      if (providerType !== 'codex-subscription') {
        return {
          ok: false,
          error: '星依联网搜索目前只支持「Codex（订阅桥）」预设；请把校书档切到 Codex 订阅桥后再试',
          status: 400,
          model: viewerModel,
          presetName: viewerPresetName
        }
      }
      const inputTokens = estimateTokensFromMessages([{ role: 'user', content: query }])
      const apiKey = getDefaultApiKey(preset)
      const minInterval = Number((preset as { min_interval?: unknown }).min_interval)
      const signal = context.signal
      let release: (() => void) | null = null
      try {
        await waitForAiOutboundInterval({
          baseUrl: preset.base_url,
          apiKey,
          model: useModel,
          minIntervalSeconds: Number.isFinite(minInterval) && minInterval > 0 ? minInterval : undefined,
          signal
        })
        release = await acquireModelSlot(
          buildAiAccountKey({ baseUrl: preset.base_url, apiKey }),
          (preset as { max_concurrency?: unknown }).max_concurrency,
          signal
        )
        const searched = await searchCodexSubscriptionWeb({
          query,
          model: useModel,
          effort: String(payload.effort || context.effort || '').trim(),
          signal
        })
        writeUsageLedger({
          userId: context.userId,
          feature,
          sessionId: context.sessionId,
          sessionLabel: context.sessionLabel,
          roundId: context.roundId,
          unitKind: context.unitKind,
          usageLabel: context.usageLabel || '星依联网搜索',
          placeLabel: context.placeLabel || '星依浮坞',
          preset,
          model: useModel,
          inputTokens: Number(searched.usage?.inputTokens || inputTokens),
          outputTokens: Number(searched.usage?.outputTokens || 0),
          cacheReadTokens: Number(searched.usage?.cachedInputTokens || 0),
          status: 'success'
        })
        return {
          ok: true,
          model: viewerModel,
          presetName: viewerPresetName,
          answer: searched.answer,
          sources: searched.sources
        }
      } catch (error) {
        const aborted = error instanceof Error && error.name === 'AbortError'
        if (!aborted) {
          writeUsageLedger({
            userId: context.userId,
            feature,
            sessionId: context.sessionId,
            sessionLabel: context.sessionLabel,
            roundId: context.roundId,
            unitKind: context.unitKind,
            usageLabel: context.usageLabel || '星依联网搜索',
            placeLabel: context.placeLabel || '星依浮坞',
            preset,
            model: useModel,
            inputTokens: 0,
            outputTokens: 0,
            status: 'error',
            errorCode: 'web_search_failed'
          })
        }
        return {
          ok: false,
          error: aborted ? '联网搜索已取消' : (error as Error).message,
          status: aborted ? 499 : 500,
          model: viewerModel,
          presetName: viewerPresetName
        }
      } finally {
        release?.()
      }
    },
    async callAIWithFallback(
      presetName: string | undefined,
      model: string | undefined,
      messages: unknown[],
      stream: boolean,
      logger?: { ai?: (...args: any[]) => void; warn?: (...args: any[]) => void; error?: (...args: any[]) => void; debug?: (...args: any[]) => void },
      context: AiCallContext = {}
    ): Promise<AIResult> {
      const feature = normalizeAiUsageFeature(context.feature || 'role_message')
      const preset = getPresetConfig(presetName)
      if (!preset) {
        return { error: '未找到 API 预设，请先在设置中配置', status: 400, model: '', presetName: '' }
      }

      let providerType = normalizeAiProviderType(preset.provider_type)
      let url = buildProviderEndpoint(preset.base_url, 'chat/completions', providerType)
      const requestedModel = String(model || '').trim()
      let useModel = requestedModel || preset.model
      if (!String(useModel || '').trim()) {
        return {
          error: '未指定模型，请在调用场景的模型配置里选择或填写模型名',
          status: 400,
          model: '',
          presetName: preset.name || ''
        }
      }
      let apiKey = getDefaultApiKey(preset)
      let currentPresetName = presetName || preset.name
      const contextMaxTokens = Number(context.maxTokens || 0)
      const maxTokens = Number.isFinite(contextMaxTokens) && contextMaxTokens > 0
        ? Math.trunc(contextMaxTokens)
        : Number(preset.max_tokens ?? 4096)
      // 图片双通道分流（批2）：解析到目标 preset 后立即分流，下游 token 估算/供应商消息归一化/
      // 实际外呼一律用分流后的 messages（内联 base64 或已拍平成文本，不再含裸 image_url 相对路径）。
      const dispatchedMessages = dispatchMessageContentForVision(messages, preset, providerType)
      const inputTokens = estimateTokensFromMessages(dispatchedMessages)
      const usageLedgerContext = buildUsageLedgerContext({
        userId: context.userId,
        feature,
        sessionId: context.sessionId,
        sessionLabel: context.sessionLabel,
        roundId: context.roundId,
        unitKind: context.unitKind,
        usageLabel: context.usageLabel,
        placeLabel: context.placeLabel,
        profileId: context.profileId,
        harnessRunId: context.harnessRunId,
        modelTurnIndex: context.modelTurnIndex,
        toolEpoch: context.toolEpoch,
        toolEpochTurnIndex: context.toolEpochTurnIndex,
        promptRebuild: context.promptRebuild,
        activeToolNamesHash: context.activeToolNamesHash,
        toolSchemaHash: context.toolSchemaHash,
        systemHash: context.systemHash,
        messagePrefixHash: context.messagePrefixHash,
        requestEnvelopeHash: context.requestEnvelopeHash,
        firstDiffSource: context.firstDiffSource,
        providerKind: providerType,
        preset,
        model: useModel
      })
      const contextTemperature = Number(context.temperature)
      const temperature = Number.isFinite(contextTemperature)
        ? contextTemperature
        : Number(preset.temperature ?? 1)
      const providerMessages = normalizeMessagesForProvider(preset.base_url, dispatchedMessages)
      // 原生缓存参数只给官方 OpenAI。OpenAI-compatible 代理、Claude/Codex 订阅桥不接收未知字段。
      const useOfficialOpenAiPromptCache = isOfficialOpenAiBaseUrl(preset.base_url)
      const promptCacheKey = useOfficialOpenAiPromptCache
        ? buildOpenAiPromptCacheKey(context, useModel)
        : ''
      const explicitPromptCache = useOfficialOpenAiPromptCache
        && Boolean(promptCacheKey)
        && supportsOpenAiExplicitPromptCache(useModel)

      // 服务端并发令牌：所有模型调用在此咽喉处按预设共享上限（回复/投影/起标题/新闻…）。
      // 令牌在取得后持有到上游 body 读完（见 attachReleaseToResponse）；未成功移交则在 finally 释放。
      // 并发池按账号身份分池（baseUrl+apiKey）：同账号多预设名共享一个池、加起来不超限；
      // 不同 apiKey 的两个账号互不挤占。上限真值取当前调用预设的 max_concurrency。
      const modelSlotKey = buildAiAccountKey({ baseUrl: preset.base_url, apiKey })
      const modelSlotLimit = Number((preset as { max_concurrency?: unknown }).max_concurrency)
      // 间隔真值：唯一来源 = 预设 min_interval（账号级权威配置）。客户端节流层与随请求下发的
      // minIntervalSeconds 已于批次 F 整体删除，服务端不再有 context 回退。
      const presetMinInterval = Number((preset as { min_interval?: unknown }).min_interval)
      const outboundMinIntervalSeconds = Number.isFinite(presetMinInterval) && presetMinInterval > 0
        ? presetMinInterval
        : undefined
      let releaseModelSlot: (() => void) | null = null
      let modelSlotTransferred = false
      // 调用级取消：合并客户端取消(context.signal)与请求超时(timeoutMs)，在「间隔等待 → 排队取令牌 →
      // 上游请求」三段全程生效；取消时排队者立即出队、不滞留占位（批次 F 前置补强）。
      // 超时兜底（P0 挂死修复）：context.timeoutMs 未显式设置（undefined）时按 stream 取默认（流式只覆盖到
      // 响应头，见下方 finally 里 callTimeout.clear() 的调用时机）。调用方显式传 0/负数仍保留「禁用超时」
      // 原语义（createRequestTimeout 对 <=0 不设定时器）。
      // 本机订阅桥在完整 CLI/App Server turn 完成前没有可移交的 Response，流式默认 120s 会误杀重轮。
      // 本机桥不吃调用级默认超时，各自由桥内 600s 进程/turn 超时兜底；context.signal 取消语义不变。
      const effectiveTimeoutMs = context.timeoutMs === undefined
        ? (providerType === 'claude-code' || providerType === 'codex-subscription' || providerType === 'agy-subscription'
          ? 0
          : (stream ? timeoutPolicy.streamHeaderTimeoutMs : timeoutPolicy.requestTimeoutMs))
        : context.timeoutMs
      const callTimeout = createRequestTimeout(effectiveTimeoutMs)
      const callSignal = mergeAbortSignals(context.signal, callTimeout.signal)

      try {
        logger?.debug?.(`【调试】请求 URL: ${url}`)
        logger?.debug?.(`【调试】API Key: ${apiKey ? '[已配置]' : '[未配置]'}`)
        const viewerModel = getViewerModel(preset, useModel, context.role)
        const viewerPresetName = getViewerPresetName(preset, currentPresetName, useModel, context.role)
        logger?.debug?.(`【调试】Model: ${viewerModel}, Stream: ${stream}`)

        await waitForAiOutboundInterval({
          baseUrl: preset.base_url,
          apiKey,
          model: useModel,
          minIntervalSeconds: outboundMinIntervalSeconds,
          signal: callSignal,
          logger
        })
        releaseModelSlot = await acquireModelSlot(modelSlotKey, modelSlotLimit, callSignal)

        // Claude Code 订阅桥：不走 HTTP 外呼，本地 spawn claude CLI 合成同形响应。
        // 必须在 outboundFetch 之前短路——伪地址 claude-code://local 过不了 safeOutboundFetch 白名单。
        if (providerType === 'claude-code') {
          const bridgeUpstream = await callClaudeCodeBridge({
            messages: providerMessages,
            model: useModel,
            stream,
            continuityKey: buildAiBridgeContinuityKey(context),
            effort: context.effort,
            thinking: context.thinking,
            tools: context.tools,
            toolChoice: context.toolChoice,
            signal: callSignal,
            logger
          })
          logger?.ai?.(`【AI响应】使用 ${viewerPresetName} - ${viewerModel}（Claude Code 订阅桥）`)
          const gatedBridgeUpstream = releaseModelSlot ? attachReleaseToResponse(bridgeUpstream, releaseModelSlot) : bridgeUpstream
          modelSlotTransferred = true
          return { upstream: gatedBridgeUpstream, model: viewerModel, presetName: viewerPresetName, presetId: preset.id, usageLedger: usageLedgerContext }
        }

        // Codex 订阅桥：连接本机 App Server，复用 ChatGPT 管理的 Codex 登录态，不走 HTTP 外呼。
        if (providerType === 'codex-subscription') {
          const bridgeUpstream = await callCodexSubscriptionBridge({
            messages: providerMessages,
            model: useModel,
            stream,
            continuityKey: buildAiBridgeContinuityKey(context),
            effort: context.effort,
            serviceTier: context.serviceTier,
            thinking: context.thinking,
            tools: context.tools,
            toolChoice: context.toolChoice,
            signal: callSignal,
            logger
          })
          logger?.ai?.(`【AI响应】使用 ${viewerPresetName} - ${viewerModel}（Codex 订阅桥）`)
          const gatedBridgeUpstream = releaseModelSlot ? attachReleaseToResponse(bridgeUpstream, releaseModelSlot) : bridgeUpstream
          modelSlotTransferred = true
          return { upstream: gatedBridgeUpstream, model: viewerModel, presetName: viewerPresetName, presetId: preset.id, usageLedger: usageLedgerContext }
        }

        // AGY 订阅桥：调用本机官方 CLI，复用系统 keyring 中的 Google 登录态，不走 HTTP 外呼。
        if (providerType === 'agy-subscription') {
          const bridgeUpstream = await callAgySubscriptionBridge({
            messages: providerMessages,
            model: useModel,
            stream,
            continuityKey: buildAiBridgeContinuityKey(context),
            effort: context.effort,
            thinking: context.thinking,
            tools: context.tools,
            toolChoice: context.toolChoice,
            signal: callSignal,
            logger
          })
          logger?.ai?.(`【AI响应】使用 ${viewerPresetName} - ${viewerModel}（AGY 订阅桥）`)
          const gatedBridgeUpstream = releaseModelSlot ? attachReleaseToResponse(bridgeUpstream, releaseModelSlot) : bridgeUpstream
          modelSlotTransferred = true
          return { upstream: gatedBridgeUpstream, model: viewerModel, presetName: viewerPresetName, presetId: preset.id, usageLedger: usageLedgerContext }
        }

        const upstream = await outboundFetch(url, {
          method: 'POST',
          signal: callSignal,
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify(buildProviderPayload(preset.base_url, {
            providerType,
            messages: providerMessages,
            model: useModel,
            stream,
            temperature: Math.min(1, Math.max(0.01, temperature)),
            maxTokens,
            thinking: context.thinking,
            includeStreamUsage: shouldRequestStreamUsage(preset.base_url),
            tools: context.tools,
            toolChoice: context.toolChoice,
            promptCacheKey,
            explicitPromptCache
          }))
        })

        if (upstream.ok) {
          logger?.ai?.(`【AI响应】使用 ${viewerPresetName} - ${viewerModel}`)
          const gatedUpstream = releaseModelSlot ? attachReleaseToResponse(upstream, releaseModelSlot) : upstream
          modelSlotTransferred = true
          return { upstream: gatedUpstream, model: viewerModel, presetName: viewerPresetName, presetId: preset.id, usageLedger: usageLedgerContext }
        }

        const errText = await upstream.text()
        if (shouldRetryWithoutThinking(preset.base_url, providerType, useModel, context.thinking, upstream.status, errText)) {
          logger?.warn?.('【警告】当前供应商不接受 thinking 参数，已移除该参数重试当前预设')
          await waitForAiOutboundInterval({
            baseUrl: preset.base_url,
            apiKey,
            model: useModel,
            minIntervalSeconds: outboundMinIntervalSeconds,
            signal: callSignal,
            logger
          })
          const retryUpstream = await outboundFetch(url, {
            method: 'POST',
            signal: callSignal,
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify(buildProviderPayload(preset.base_url, {
              providerType,
              messages: providerMessages,
              model: useModel,
              stream,
              temperature: Math.min(1, Math.max(0.01, temperature)),
              maxTokens,
              includeStreamUsage: shouldRequestStreamUsage(preset.base_url),
              tools: context.tools,
              toolChoice: context.toolChoice,
              promptCacheKey,
              explicitPromptCache
            }))
          })
          if (retryUpstream.ok) {
            logger?.ai?.(`【AI响应】使用 ${viewerPresetName} - ${viewerModel}（已移除 thinking 参数）`)
            const gatedRetryUpstream = releaseModelSlot ? attachReleaseToResponse(retryUpstream, releaseModelSlot) : retryUpstream
            modelSlotTransferred = true
            return { upstream: gatedRetryUpstream, model: viewerModel, presetName: viewerPresetName, presetId: preset.id, usageLedger: usageLedgerContext }
          }
          const retryErrText = await retryUpstream.text()
          logger?.debug?.(`【调试】移除 thinking 后错误详情: ${retryErrText.substring(0, 200)}`)
        }
        logger?.ai?.(`【AI错误】主 API ${viewerPresetName} 失败，状态码: ${upstream.status}`)
        logger?.debug?.(`【调试】错误详情: ${errText.substring(0, 200)}`)
        recordZeroTokenErrorLedger(usageLedgerContext, String(upstream.status))
        return {
          error: buildViewerUpstreamErrorMessage({
            prefix: `预设 ${viewerPresetName} 调用失败`,
            status: upstream.status,
            rawText: errText
          }),
          status: upstream.status,
          model: viewerModel,
          presetName: viewerPresetName,
          presetId: preset.id
        }
      } catch (err) {
        const viewerModel = getViewerModel(preset, useModel, context.role)
        const viewerPresetName = getViewerPresetName(preset, currentPresetName, useModel, context.role)
        // cause 链人话化：日志与本地错误提示均提供可读的网络原因。
        const errorDetail = describeOutboundCallError(err)
        logger?.ai?.(`预设 ${viewerPresetName} 调用异常: ${errorDetail}`)
        recordZeroTokenErrorLedger(usageLedgerContext, 'network')
        return {
          error: `预设 ${viewerPresetName} 调用异常：${errorDetail}`,
          status: 500,
          model: viewerModel,
          presetName: viewerPresetName,
          presetId: preset.id
        }
      } finally {
        // 成功路径已把释放权移交给 body 包装器；其余路径（错误/异常/未取到上游）在此释放令牌。
        if (releaseModelSlot && !modelSlotTransferred) releaseModelSlot()
        // 超时定时器只覆盖「等待 + 请求到响应头」这一段（与改造前 per-fetch 清理时机一致）：
        // 到这里上游已返回响应头或已失败，清掉定时器，避免其在后续 body 流式转发中误触发取消。
        // 客户端取消(context.signal)不在此清理，仍可在流式期间触发上游取消，由 body 包装器兜底释放。
        callTimeout.clear()
      }
    },
    async createEmbeddings(payload: {
      presetId?: string
      presetName?: string
      model?: string
      input: string | string[]
      dimensions?: number
      context?: AiCallContext
    }): Promise<EmbeddingResult> {
      const input = payload.input
      const inputItems = Array.isArray(input) ? input : [input]
      const normalizedItems = inputItems.map((item) => String(item || '').trim()).filter(Boolean)
      if (!normalizedItems.length) {
        return { ok: false, error: 'input 不能为空', status: 400, model: '', presetName: '' }
      }
      if (normalizedItems.length > 64) {
        return { ok: false, error: '单次向量化最多支持 64 条文本', status: 400, model: '', presetName: '' }
      }

      const context = payload.context || {}
      const feature = 'embedding'
      const requestedPresetId = String(payload.presetId || '').trim()
      let preset: ApiPreset | undefined
      if (requestedPresetId) {
        preset = repository.getPresetByName(requestedPresetId)
      } else {
        preset = getPresetConfig(payload.presetName)
      }
      if (!preset) {
        return { ok: false, error: '未找到可用的本地 API 预设，请先在设置中配置', status: 400, model: '', presetName: '' }
      }

      const providerType = normalizeAiProviderType(preset.provider_type)
      const url = buildProviderEndpoint(preset.base_url, 'embeddings', providerType)
      const useModel = String(payload.model || preset.model || '').trim()
      if (!useModel) {
        return { ok: false, error: '嵌入预设缺少模型名', status: 400, model: '', presetName: preset.name, presetId: preset.id }
      }
      const viewerModel = getViewerModel(preset, useModel, context.role)
      const viewerPresetName = getViewerPresetName(preset, preset.name, useModel, context.role)
      const apiKey = getDefaultApiKey(preset)
      const dimensions = normalizeAiEmbeddingDimension(payload.dimensions || preset.embedding_dimension)
      const requestBody: Record<string, unknown> = {
        model: useModel,
        input: Array.isArray(input) ? normalizedItems : normalizedItems[0]
      }
      if (dimensions > 0) requestBody.dimensions = dimensions

      const inputTokens = estimateTokensFromEmbeddingInput(normalizedItems)

      try {
        const resp = await outboundFetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify(requestBody)
        })
        const rawText = await resp.text()
        if (!resp.ok) {
          writeUsageLedger({
            userId: context.userId,
            feature,
            sessionId: context.sessionId,
            sessionLabel: context.sessionLabel,
            roundId: context.roundId,
            unitKind: context.unitKind,
            usageLabel: context.usageLabel,
            placeLabel: context.placeLabel,
            preset,
            model: useModel,
            inputTokens: 0,
            outputTokens: 0,
            status: 'error',
            errorCode: String(resp.status)
          })
          return {
            ok: false,
            error: buildViewerUpstreamErrorMessage({
              prefix: '向量模型调用失败',
              status: resp.status,
              rawText
            }),
            status: resp.status,
            model: viewerModel,
            presetName: viewerPresetName,
            presetId: preset.id
          }
        }
        let parsed: Record<string, unknown>
        try {
          parsed = JSON.parse(rawText)
        } catch {
          return { ok: false, error: '向量模型返回的不是合法 JSON', status: 500, model: viewerModel, presetName: viewerPresetName, presetId: preset.id }
        }
        const usage = parsed.usage
        const actualUsage = normalizeActualUsageTokens(usage)
        if (context.userId && actualUsage) {
          writeUsageLedger({
            userId: context.userId,
            feature,
            sessionId: context.sessionId,
            sessionLabel: context.sessionLabel,
            roundId: context.roundId,
            unitKind: context.unitKind,
            usageLabel: context.usageLabel,
            placeLabel: context.placeLabel,
            preset,
            model: useModel,
            inputTokens: actualUsage.inputTokens,
            outputTokens: actualUsage.outputTokens,
            status: 'success'
          })
        }
        return {
          ok: true,
          model: viewerModel,
          presetName: viewerPresetName,
          presetId: preset.id,
          data: parsed.data,
          usage
        }
      } catch (err) {
        writeUsageLedger({
          userId: context.userId,
          feature,
          sessionId: context.sessionId,
          sessionLabel: context.sessionLabel,
          roundId: context.roundId,
          unitKind: context.unitKind,
          usageLabel: context.usageLabel,
          placeLabel: context.placeLabel,
          preset,
          model: useModel,
          inputTokens: 0,
          outputTokens: 0,
          status: 'error',
          errorCode: 'network'
        })
        return {
          ok: false,
          error: (err as Error).message,
          status: 500,
          model: viewerModel,
          presetName: viewerPresetName,
          presetId: preset.id
        }
      }
    },
    async fetchModels(payload: {
      presetName?: string
      baseUrl?: string
      apiKey?: string
      providerType?: string
      role?: string
      allowDirectConfig?: boolean
    }): Promise<{ ok: true; data: unknown } | { ok: false; error: string; status: number }> {
      let url: string
      let key: string
      let providerType = normalizeAiProviderType(payload.providerType)

      // 本机订阅桥没有 HTTP models 端点也不需要密钥。
      if (payload.allowDirectConfig && providerType === 'claude-code') {
        return { ok: true, data: { data: listClaudeCodeBridgeModels() } }
      }
      if (payload.allowDirectConfig && providerType === 'codex-subscription') {
        try {
          return { ok: true, data: { data: await listCodexSubscriptionBridgeModels() } }
        } catch (err) {
          return { ok: false, error: (err as Error).message, status: 500 }
        }
      }
      if (payload.allowDirectConfig && providerType === 'agy-subscription') {
        try {
          return { ok: true, data: { data: await listAgySubscriptionBridgeModels() } }
        } catch (err) {
          return { ok: false, error: (err as Error).message, status: 500 }
        }
      }

      if (payload.allowDirectConfig && payload.baseUrl && payload.apiKey) {
        url = payload.baseUrl
        key = payload.apiKey
      } else {
        if (payload.baseUrl || payload.apiKey) {
          return { ok: false, error: '模型列表只能使用已保存的 API 预设', status: 403 }
        }
        const preset = getPresetConfig(payload.presetName)
        if (!preset) {
          return { ok: false, error: '未找到预设', status: 400 }
        }
        url = preset.base_url
        key = getDefaultApiKey(preset)
        providerType = normalizeAiProviderType(payload.providerType || preset.provider_type)
        if (providerType === 'claude-code') {
          return { ok: true, data: { data: listClaudeCodeBridgeModels() } }
        }
        if (providerType === 'codex-subscription') {
          try {
            return { ok: true, data: { data: await listCodexSubscriptionBridgeModels() } }
          } catch (err) {
            return { ok: false, error: (err as Error).message, status: 500 }
          }
        }
        if (providerType === 'agy-subscription') {
          try {
            return { ok: true, data: { data: await listAgySubscriptionBridgeModels() } }
          } catch (err) {
            return { ok: false, error: (err as Error).message, status: 500 }
          }
        }
      }

      try {
        const resp = await outboundFetch(buildProviderEndpoint(url, 'models', providerType), {
          headers: { 'Authorization': `Bearer ${key}` }
        })
        const rawText = await resp.text()
        if (!resp.ok) {
          return {
            ok: false,
            error: buildUpstreamErrorMessage('模型列表加载失败', resp.status, rawText),
            status: resp.status
          }
        }
        try {
          return { ok: true, data: JSON.parse(rawText) }
        } catch {
          return { ok: false, error: '模型列表返回的不是合法 JSON', status: 500 }
        }
      } catch (err) {
        return { ok: false, error: (err as Error).message, status: 500 }
      }
    }
  }
}

export const aiAppService = createAiAppService()

// ===== 内部调用记账收口（P0·2026-07-12） =====
// 服务端 8 处「内部 agent 类」调用（消息投影/投影写轨迹/即兴角色提取/临时角色资料生成/临时实体归置判定/
// 临时实体资料生成/临时角色字段评审/会话起标题）此前各自手写 callAIWithFallback + upstream.json()，
// 成功时都没调 recordActualChatUsage——这次调用即便真实产生了外呼开销也永远不计入额度基数（见报告 P0-1）。
// callInternalAIJson 把这套「stream=false 调用 → 读 json → 写 success 账本行」收口成一处，供上述调用点复用。
//
// 设计取舍：没有做成 aiAppService 返回对象上的方法（即不要求调用方写 aiAppService.callInternalAIJson），
// 而是独立导出函数、把 aiService 作为显式参数传入，供 workspace 内部 AI 小任务复用。
// 的既有测试大量以 `aiService: { callAIWithFallback: vi.fn(...) }` 的极简 mock 注入依赖（不含
// recordActualChatUsage），若改成方法调用形态，所有这些既有 mock 都要补方法才能通过，改动面会远超本次
// P0 收口范围。当前形态下 recordActualChatUsage 用可选链调用，真实环境（aiService=aiAppService 单例）正常
// 记账，测试 mock 缺该方法时静默跳过、不影响被测行为本身的可验证性。
export interface InternalAiCallResult {
  upstream?: globalThis.Response
  model?: string
  presetName?: string
  presetId?: string
  usageLedger?: AiUsageLedgerContext
  error?: string
  status?: number
}

export interface InternalAiCallable {
  callAIWithFallback?: (
    presetName: string | undefined,
    model: string | undefined,
    messages: unknown[],
    stream: boolean,
    logger?: { ai?: (...args: any[]) => void; warn?: (...args: any[]) => void; error?: (...args: any[]) => void; debug?: (...args: any[]) => void },
    context?: AiCallContext
  ) => Promise<InternalAiCallResult>
  recordActualChatUsage?: (context: AiUsageLedgerContext | undefined, usage: unknown) => boolean
}

/** callInternalAIJson 的返回形状：刻意保留 error / jsonParseError / (!json) 三种彼此独立的失败态
 *  （分别对应「调用失败」「响应体不是合法 JSON」「无响应」），与改造前各调用点的 3 段 if 分支一一对应，
 *  调用点切换过来时只需把「自己 fetch+parse」换成「读这三个字段」，报错文案保持逐字节不变。 */
export interface InternalAiJsonResult {
  json?: Record<string, unknown>
  jsonParseError?: string
  model?: string
  presetName?: string
  presetId?: string
  error?: string
  status?: number
}

export async function callInternalAIJson(
  aiService: InternalAiCallable | undefined,
  presetName: string | undefined,
  model: string | undefined,
  messages: unknown[],
  logger?: { ai?: (...args: any[]) => void; warn?: (...args: any[]) => void; error?: (...args: any[]) => void; debug?: (...args: any[]) => void },
  context: AiCallContext = {}
): Promise<InternalAiJsonResult> {
  if (!aiService?.callAIWithFallback) {
    return { error: 'AI 服务未配置' }
  }
  const result = await aiService.callAIWithFallback(presetName, model, messages, false, logger, context)
  const base = {
    model: result.model,
    presetName: result.presetName,
    presetId: result.presetId
  }
  if (result.error) {
    return { ...base, error: result.error, status: result.status }
  }
  if (!result.upstream) {
    return base
  }
  let json: Record<string, unknown>
  try {
    json = await result.upstream.json()
  } catch (err) {
    return { ...base, jsonParseError: (err as Error).message }
  }
  // 成功必写一条 success 账本行：不再依赖调用点自觉调用 recordActualChatUsage；
  // provider 不回 usage 时 recordActualChatUsage 内部也已改为写 0-token success 行（见该函数改造）。
  aiService.recordActualChatUsage?.(result.usageLedger, (json as Record<string, unknown> | undefined)?.usage)
  return { ...base, json }
}
