import { ref } from 'vue'
import { getLocalWorkspaceStorageKey } from '../app/localWorkspace'

export type AiTokenUsage = {
  promptTokens: number
  completionTokens: number
  totalTokens: number
  costText?: string
  // 缓存可见性（2026-07-07·2026-07-12 补方言映射）：缓存读经三方言归一（Anthropic/DeepSeek/OpenAI，
  // 见 extractCacheReadTokensClient），缓存创建兼容 Anthropic 与 OpenAI GPT-5.6+；无缓存数据时字段缺省。
  cacheReadTokens?: number
  cacheCreationTokens?: number
}

export type AiUsageLedgerRow = {
  id: string
  createdAt: string
  usageLabel: string
  placeLabel: string
  placeType: 'single' | 'group' | 'other'
  model: string
  presetName?: string
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

export type AiUsageRecordMeta = {
  usageLabel?: string
  placeLabel?: string
  placeType?: 'single' | 'group' | 'other'
  presetName?: string
  /** Agent 调用族与同一次 harness 的稳定分类；只进服务端 usage ledger，不进入本地展示账本。 */
  profileId?: string
  harnessRunId?: string
  modelTurnIndex?: number
  toolEpoch?: number
  toolEpochTurnIndex?: number
  promptRebuild?: boolean
  /** 以下均为本地请求信封诊断指纹，不是供应商 cache hit 证明。 */
  activeToolNamesHash?: string
  toolSchemaHash?: string
  systemHash?: string
  messagePrefixHash?: string
  requestEnvelopeHash?: string
  firstDiffSource?: string
}

type UsageLike = {
  prompt_tokens?: unknown
  completion_tokens?: unknown
  total_tokens?: unknown
  promptTokens?: unknown
  completionTokens?: unknown
  totalTokens?: unknown
  cache_read_input_tokens?: unknown
  cache_creation_input_tokens?: unknown
  cacheReadInputTokens?: unknown
  cacheCreationInputTokens?: unknown
  cache_write_tokens?: unknown
  cacheWriteTokens?: unknown
  prompt_cache_hit_tokens?: unknown
  prompt_tokens_details?: unknown
}

const STORAGE_KEY = 'langhuan_ai_usage_ledger_v2'
const LEGACY_STORAGE_KEY = 'langhuan_ai_usage_ledger_v1'
const PRICE_STORAGE_KEY = 'langhuan_ai_usage_price_per_million_v1'
const MAX_LEDGER_ROWS = 500
const STORAGE_FALLBACK_ROW_LIMITS = [MAX_LEDGER_ROWS, 200, 100, 50, 20, 10, 1]
const aiUsageLedger = ref<AiUsageLedgerRow[]>(loadAiUsageLedger())
const aiUsagePricePerMillion = ref<number>(loadAiUsagePricePerMillion())

function toSafeInteger(value: unknown): number {
  const num = Number(value)
  return Number.isFinite(num) && num > 0 ? Math.round(num) : 0
}

function loadAiUsageLedger(): AiUsageLedgerRow[] {
  if (typeof localStorage === 'undefined') return []
  try {
    const parsed = JSON.parse(localStorage.getItem(getLocalWorkspaceStorageKey(STORAGE_KEY)) || '[]')
    if (Array.isArray(parsed)) {
      return parsed
        .map(normalizeLedgerRow)
        .filter((item): item is AiUsageLedgerRow => Boolean(item))
    }
  } catch {
    // 继续尝试读取旧版合并统计
  }

  try {
    const legacy = JSON.parse(localStorage.getItem(getLocalWorkspaceStorageKey(LEGACY_STORAGE_KEY)) || '[]')
    if (!Array.isArray(legacy)) return []
    return legacy
      .map((item) => ({
        id: makeUsageId(),
        createdAt: new Date().toISOString(),
        usageLabel: '历史合并统计',
        placeLabel: '旧版数据',
        placeType: 'other' as const,
        model: String(item?.model || 'AI'),
        promptTokens: toSafeInteger(item?.promptTokens),
        completionTokens: toSafeInteger(item?.completionTokens),
        totalTokens: toSafeInteger(item?.totalTokens)
      }))
      .filter((item) => item.model)
  } catch {
    return []
  }
}

function persistAiUsageLedger(rows: AiUsageLedgerRow[]) {
  if (typeof localStorage === 'undefined') return rows
  const storageKey = getLocalWorkspaceStorageKey(STORAGE_KEY)
  let lastError: unknown = null

  for (const limit of STORAGE_FALLBACK_ROW_LIMITS) {
    const trimmedRows = rows.slice(0, limit)
    try {
      localStorage.setItem(storageKey, JSON.stringify(trimmedRows))
      return trimmedRows
    } catch (error) {
      lastError = error
      if (!isStorageQuotaError(error)) break
    }
  }

  console.warn('AI 用量本地缓存写入失败，已保留当前会话内存记录。', lastError)
  try {
    localStorage.removeItem(storageKey)
  } catch {
    // 本地缓存清理失败也不能阻断 AI 主调用链路
  }
  return rows
}

function isStorageQuotaError(error: unknown): boolean {
  const item = error as { name?: string; code?: number }
  return item?.name === 'QuotaExceededError'
    || item?.name === 'NS_ERROR_DOM_QUOTA_REACHED'
    || item?.code === 22
    || item?.code === 1014
}

function loadAiUsagePricePerMillion(): number {
  if (typeof localStorage === 'undefined') return 0
  const value = Number(localStorage.getItem(getLocalWorkspaceStorageKey(PRICE_STORAGE_KEY)) || 0)
  return Number.isFinite(value) && value >= 0 ? value : 0
}

function normalizeLedgerRow(item: any): AiUsageLedgerRow | null {
  const model = String(item?.model || 'AI').trim() || 'AI'
  const promptTokens = toSafeInteger(item?.promptTokens)
  const completionTokens = toSafeInteger(item?.completionTokens)
  const totalTokens = toSafeInteger(item?.totalTokens) || promptTokens + completionTokens
  if (!promptTokens && !completionTokens && !totalTokens) return null
  const placeType = item?.placeType === 'single' || item?.placeType === 'group' ? item.placeType : 'other'
  return {
    id: String(item?.id || makeUsageId()),
    createdAt: String(item?.createdAt || new Date().toISOString()),
    usageLabel: String(item?.usageLabel || '模型调用'),
    placeLabel: String(item?.placeLabel || '未标明'),
    placeType,
    model,
    presetName: String(item?.presetName || ''),
    promptTokens,
    completionTokens,
    totalTokens
  }
}

function makeUsageId() {
  return `usage-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function buildCostText(usage: AiTokenUsage): string {
  const price = aiUsagePricePerMillion.value
  if (!price) return ''
  const total = usage.totalTokens || usage.promptTokens + usage.completionTokens
  const estimatedCostCny = (total / 1_000_000) * price
  return `约¥${estimatedCostCny.toFixed(6)}`
}

/** 缓存读方言映射（2026-07-12·缓存命中进 subagent 运行卡的数据链补段）：与服务端
 *  aiAppService.extractCacheReadTokens 的字段口径联动同构——
 *  Anthropic cache_read_input_tokens（订阅桥 envelopeToChatCompletion 已归一成此形状）→
 *  DeepSeek prompt_cache_hit_tokens → OpenAI 及兼容协议 prompt_tokens_details.cached_tokens，
 *  第一个非空方言生效；读不到即 0。改方言表两处要同步。 */
function extractCacheReadTokensClient(usage: UsageLike): number {
  const anthropic = usage.cache_read_input_tokens ?? usage.cacheReadInputTokens
  if (anthropic != null) return toSafeInteger(anthropic)
  if (usage.prompt_cache_hit_tokens != null) return toSafeInteger(usage.prompt_cache_hit_tokens)
  const details = usage.prompt_tokens_details
  if (details && typeof details === 'object') {
    const cached = (details as { cached_tokens?: unknown }).cached_tokens
    if (cached != null) return toSafeInteger(cached)
  }
  return 0
}

export function normalizeAiTokenUsage(usage: UsageLike | null | undefined, _model = ''): AiTokenUsage | null {
  if (!usage || typeof usage !== 'object') return null
  const promptTokens = toSafeInteger(usage.prompt_tokens ?? usage.promptTokens)
  const completionTokens = toSafeInteger(usage.completion_tokens ?? usage.completionTokens)
  const totalTokens = toSafeInteger(usage.total_tokens ?? usage.totalTokens) || promptTokens + completionTokens
  if (!promptTokens && !completionTokens && !totalTokens) return null
  const cacheReadTokens = extractCacheReadTokensClient(usage)
  const details = usage.prompt_tokens_details && typeof usage.prompt_tokens_details === 'object'
    ? usage.prompt_tokens_details as { cache_write_tokens?: unknown; cacheWriteTokens?: unknown }
    : null
  const cacheCreationTokens = toSafeInteger(
    usage.cache_creation_input_tokens
    ?? usage.cacheCreationInputTokens
    ?? details?.cache_write_tokens
    ?? details?.cacheWriteTokens
    ?? usage.cache_write_tokens
    ?? usage.cacheWriteTokens
  )

  const normalized = {
    promptTokens,
    completionTokens,
    totalTokens
  }
  return {
    ...normalized,
    costText: buildCostText(normalized),
    ...(cacheReadTokens ? { cacheReadTokens } : {}),
    ...(cacheCreationTokens ? { cacheCreationTokens } : {})
  }
}

// 缓存命中率人话化（2026-07-07）：相对「输入 token」算百分比（缓存只作用于输入侧，不掺输出）；
// 没有缓存数据（非订阅桥 provider）时返回空串，调用方按「不显示这段」处理。
export function formatCacheHitHint(inputTokens: number, cacheReadTokens: number | undefined): string {
  const input = Math.max(0, Math.round(Number(inputTokens) || 0))
  const hit = Math.max(0, Math.round(Number(cacheReadTokens) || 0))
  if (!input || !hit) return ''
  const percent = Math.round((hit / input) * 100)
  return `输入缓存命中 ${percent}%`
}

export function recordAiTokenUsage(
  usage: AiTokenUsage | null | undefined,
  model = '',
  meta: AiUsageRecordMeta = {}
) {
  if (!usage) return
  const safeModel = String(model || 'AI').trim() || 'AI'
  const row: AiUsageLedgerRow = {
    id: makeUsageId(),
    createdAt: new Date().toISOString(),
    usageLabel: String(meta.usageLabel || '模型调用'),
    placeLabel: String(meta.placeLabel || '未标明'),
    placeType: meta.placeType || 'other',
    model: safeModel,
    presetName: String(meta.presetName || ''),
    promptTokens: usage.promptTokens,
    completionTokens: usage.completionTokens,
    totalTokens: usage.totalTokens || usage.promptTokens + usage.completionTokens
  }
  const rows = [row, ...aiUsageLedger.value].slice(0, MAX_LEDGER_ROWS)
  aiUsageLedger.value = persistAiUsageLedger(rows)
}

export function resetAiUsageLedger() {
  aiUsageLedger.value = []
  persistAiUsageLedger([])
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(getLocalWorkspaceStorageKey(LEGACY_STORAGE_KEY))
    localStorage.removeItem(STORAGE_KEY)
    localStorage.removeItem(LEGACY_STORAGE_KEY)
  }
}

export function useAiUsageLedger() {
  return aiUsageLedger
}

export function useAiUsagePricePerMillion() {
  return aiUsagePricePerMillion
}

export function updateAiUsagePricePerMillion(value: number) {
  const nextValue = Math.max(0, Number.isFinite(Number(value)) ? Number(value) : 0)
  aiUsagePricePerMillion.value = nextValue
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(getLocalWorkspaceStorageKey(PRICE_STORAGE_KEY), String(nextValue))
  }
}

export function calculateAiUsageCostCny(totalTokens: number, pricePerMillion = aiUsagePricePerMillion.value): number {
  const price = Number(pricePerMillion || 0)
  if (!price) return 0
  return (Number(totalTokens || 0) / 1_000_000) * price
}

export function formatAiUsageLabel(usage: AiTokenUsage | null | undefined): string {
  if (!usage) return ''
  const total = usage.totalTokens || usage.promptTokens + usage.completionTokens
  const tokenText = `${total.toLocaleString('zh-CN')} tokens`
  if (!usage.costText) return tokenText
  return `${tokenText} · ${usage.costText}`
}
