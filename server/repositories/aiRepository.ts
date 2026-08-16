import db from '../db.js'
import { decryptApiSecret } from '../security/localSecretCrypto.js'
import {
  AI_USAGE_FEATURES,
  getAiUsageFeatureFilterValues,
  normalizeAiUsageFeature,
  type AiUsageFeature
} from '../../shared/aiUsageFeatures.js'

type AiDb = Pick<typeof db, 'prepare'> & { _save?: () => void }

function decryptUserPreset(row: ApiPresetRecord | undefined): ApiPresetRecord | undefined {
  if (!row) return undefined
  return {
    ...row,
    api_key: decryptApiSecret(String(row.api_key || ''))
  }
}

export interface ApiPresetRecord {
  name: string
  provider_type?: string
  base_url: string
  api_key: string
  model: string
  available_models: string
  max_tokens?: number
  temperature?: number
  is_default: number
  fallback_preset: string
  // 识图标记（批2·输入框图片上传）：由用户在预设编辑 UI 手工勾选，不做模型名自动猜测。
  // aiAppService 的图片双通道分流单点读它决定内联 base64 还是拍平成文字。
  supports_vision?: number
}

export interface UsageSummaryRecord {
  spent_cents?: number
  tokens?: number
  requests?: number
  cache_read_tokens?: number
  cache_creation_tokens?: number
}

/** 缓存命中率公式（P2 批 E4·2026-07-12）：input_tokens 口径下，cache_read_tokens 恒是其子集
 *  （各 provider 方言归一时已保证——见 aiAppService.ts 的 extractCacheReadTokens 注释），
 *  故「未命中」= input_tokens 中不是 cache_read 的部分，命中率 = cache_read / input_tokens。
 *  input_tokens 为 0（无成功调用）时命中率记 0，不做 0/0。 */
function computeCacheHitRate(cacheReadTokens: number, inputTokens: number): number {
  if (!inputTokens || inputTokens <= 0) return 0
  return Math.max(0, Math.min(1, cacheReadTokens / inputTokens))
}

export interface RecentAiErrorSummaryRecord {
  error_count?: number
  latest_error_at?: string
}

export type AiUsageRangeFilter = 'today' | 'yesterday' | '7d' | '30d'

export type AiUsageStatusFilter = 'success' | 'failed' | 'estimated'

export interface AiUsageLedgerQuery {
  range?: AiUsageRangeFilter | string
  feature?: string
  status?: AiUsageStatusFilter | string
  userId?: string
  sessionId?: string
  limit?: number
  now?: Date
}

const ALLOWED_USAGE_RANGES = new Set(['today', 'yesterday', '7d', '30d'])
const ALLOWED_USAGE_STATUSES = new Set(['success', 'failed', 'estimated'])
const ALLOWED_USAGE_FEATURES = new Set(AI_USAGE_FEATURES)

function normalizeUsageRange(value: unknown): AiUsageRangeFilter {
  const text = String(value || '7d').trim()
  return ALLOWED_USAGE_RANGES.has(text) ? text as AiUsageRangeFilter : '7d'
}

function normalizeUsageStatus(value: unknown): AiUsageStatusFilter | '' {
  const text = String(value || '').trim()
  return ALLOWED_USAGE_STATUSES.has(text) ? text as AiUsageStatusFilter : ''
}

function normalizeUsageFeature(value: unknown) {
  const text = String(value || '').trim()
  if (!text || text === 'all') return ''
  const feature = normalizeAiUsageFeature(text)
  return ALLOWED_USAGE_FEATURES.has(feature) ? feature : ''
}

function normalizeUsageLimit(value: unknown) {
  return Math.max(1, Math.min(500, Math.floor(Number(value) || 100)))
}

function toSqlIso(date: Date) {
  return date.toISOString()
}

function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function addDays(date: Date, days: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function resolveUsageRangeBounds(range: AiUsageRangeFilter, now = new Date()) {
  const today = startOfLocalDay(now)
  if (range === 'yesterday') {
    const start = addDays(today, -1)
    return { start: toSqlIso(start), end: toSqlIso(today) }
  }
  const days = range === '30d' ? 30 : range === '7d' ? 7 : 1
  const start = addDays(today, -(days - 1))
  const end = addDays(today, 1)
  return { start: toSqlIso(start), end: toSqlIso(end) }
}

function buildUsageLedgerWhere(input: AiUsageLedgerQuery = {}) {
  const range = normalizeUsageRange(input.range)
  const bounds = resolveUsageRangeBounds(range, input.now)
  const clauses = ['datetime(ledger.created_at) >= datetime(?)', 'datetime(ledger.created_at) < datetime(?)']
  const params: Array<string | number> = [bounds.start, bounds.end]
  const feature = normalizeUsageFeature(input.feature)
  if (feature) {
    const featureValues = getAiUsageFeatureFilterValues(feature)
    clauses.push(`ledger.feature IN (${featureValues.map(() => '?').join(', ')})`)
    params.push(...featureValues)
  }
  const status = normalizeUsageStatus(input.status)
  if (status) {
    if (status === 'failed') {
      clauses.push("ledger.status IN ('failed', 'error')")
    } else {
      clauses.push('ledger.status = ?')
      params.push(status)
    }
  }
  const userId = String(input.userId || '').trim()
  if (userId) {
    clauses.push('ledger.user_id = ?')
    params.push(userId)
  }
  const sessionId = String(input.sessionId || '').trim()
  if (sessionId) {
    clauses.push('ledger.session_id = ?')
    params.push(sessionId)
  }
  return {
    range,
    feature,
    status,
    userId,
    sessionId,
    whereSql: clauses.join(' AND '),
    params
  }
}

function buildUsageSessionWhere(input: AiUsageLedgerQuery = {}) {
  return buildUsageLedgerWhere({ ...input, sessionId: '' })
}

function buildSessionRoundIndexes(database: AiDb, items: Array<Record<string, unknown>>) {
  const sessionKeys: Array<{ userId: string; sessionId: string }> = []
  const seenSessionKeys = new Set<string>()
  for (const item of items) {
    const userId = String(item.user_id || '').trim()
    const sessionId = String(item.session_id || '').trim()
    if (!sessionId) continue
    const key = `${userId}\u0000${sessionId}`
    if (seenSessionKeys.has(key)) continue
    seenSessionKeys.add(key)
    sessionKeys.push({ userId, sessionId })
  }
  const roundIndexes = new Map<string, number>()
  for (const key of sessionKeys) {
    const rows = database.prepare(`
      SELECT
        ledger.user_id,
        ledger.session_id,
        ledger.round_id,
        MIN(ledger.created_at) AS first_at
      FROM ai_usage_ledger AS ledger
      WHERE COALESCE(ledger.user_id, '') = ?
        AND ledger.session_id = ?
        AND COALESCE(ledger.round_id, '') <> ''
      GROUP BY ledger.user_id, ledger.session_id, ledger.round_id
      ORDER BY datetime(first_at) ASC, ledger.round_id ASC
    `).all(key.userId, key.sessionId) as Array<Record<string, unknown>>
    // op:… 操作单元不占轮次序号，也不挤占真实轮的顺位。
    const roundRows = rows.filter((row) => !isOperationUnitId(String(row.round_id || '').trim()))
    roundRows.forEach((row, index) => {
      const roundId = String(row.round_id || '').trim()
      if (!roundId) return
      roundIndexes.set(`${key.userId}\u0000${key.sessionId}\u0000${roundId}`, index + 1)
    })
  }
  return roundIndexes
}

// op:… 是跨轮操作单元 id（末段为时间戳），不是消息轮 id，不能按末段反解消息序号。
function isOperationUnitId(roundId: unknown) {
  return String(roundId || '').trim().startsWith('op:')
}

function readRoundMessageId(roundId: unknown) {
  const text = String(roundId || '').trim()
  if (isOperationUnitId(text)) return 0
  const last = text.split(':').pop() || ''
  const messageId = Number(last)
  return Number.isInteger(messageId) && messageId > 0 ? messageId : 0
}

function readChatMessageRoundIndex(database: AiDb, userId: string, sessionId: string, roundId: string) {
  const messageId = readRoundMessageId(roundId)
  if (!messageId || !sessionId) return 0
  try {
    const row = database.prepare(`
      SELECT COUNT(*) AS round_index
      FROM chat_messages
      WHERE COALESCE(user_id, '') = ?
        AND session_id = ?
        AND role = 'user'
        AND id <= ?
    `).get(userId, sessionId, messageId) as Record<string, unknown> | undefined
    return Number(row?.round_index || 0)
  } catch {
    return 0
  }
}

function attachSessionRoundIndexes(database: AiDb, items: Array<Record<string, unknown>>) {
  const roundIndexes = buildSessionRoundIndexes(database, items)
  const messageRoundIndexes = new Map<string, number>()
  return items.map((item) => {
    const userId = String(item.user_id || '').trim()
    const sessionId = String(item.session_id || '').trim()
    const roundId = String(item.round_id || '').trim()
    const roundKey = `${userId}\u0000${sessionId}\u0000${roundId}`
    if (!messageRoundIndexes.has(roundKey)) {
      messageRoundIndexes.set(roundKey, readChatMessageRoundIndex(database, userId, sessionId, roundId))
    }
    // 操作单元行不标轮次序号，由前端按 unit_kind 显示操作名。
    const sessionRoundIndex = isOperationUnitId(roundId)
      ? 0
      : messageRoundIndexes.get(roundKey) || roundIndexes.get(roundKey) || 0
    return {
      ...item,
      session_round_index: sessionRoundIndex
    }
  })
}

export function createAiRepository(database: AiDb = db) {
  return {
    getDefaultPreset() {
      return decryptUserPreset(database.prepare('SELECT * FROM api_presets WHERE is_default = 1 LIMIT 1').get() as ApiPresetRecord | undefined)
    },
    getPresetByName(name: string) {
      return decryptUserPreset(database.prepare('SELECT * FROM api_presets WHERE name = ?').get(name) as ApiPresetRecord | undefined)
    },
    summarizeUsage(userId: string, period: 'day' | 'month') {
      const dateExpr = period === 'day' ? "date('now')" : "strftime('%Y-%m', 'now')"
      const row = database.prepare(`
        SELECT
          COUNT(*) AS requests,
          COALESCE(SUM(estimated_cost_cents), 0) AS spent_cents,
          COALESCE(SUM(input_tokens + output_tokens), 0) AS tokens,
          COALESCE(SUM(input_tokens), 0) AS input_tokens_sum,
          COALESCE(SUM(cache_read_tokens), 0) AS cache_read_tokens,
          COALESCE(SUM(cache_creation_tokens), 0) AS cache_creation_tokens
        FROM ai_usage_ledger
        WHERE user_id = ?
          AND status = 'success'
          AND ${period === 'day' ? 'date(created_at)' : "strftime('%Y-%m', created_at)"} = ${dateExpr}
      `).get(userId) as UsageSummaryRecord & { input_tokens_sum?: number } | undefined
      const cacheReadTokens = Number(row?.cache_read_tokens || 0)
      const cacheCreationTokens = Number(row?.cache_creation_tokens || 0)
      return {
        spentCents: Number(row?.spent_cents || 0),
        tokens: Number(row?.tokens || 0),
        requests: Number(row?.requests || 0),
        cacheReadTokens,
        cacheCreationTokens,
        cacheHitRate: computeCacheHitRate(cacheReadTokens, Number(row?.input_tokens_sum || 0))
      }
    },
    summarizeRecentErrors(userId: string, sinceIso: string) {
      const row = database.prepare(`
        SELECT
          COUNT(*) AS error_count,
          MAX(created_at) AS latest_error_at
        FROM ai_usage_ledger
        WHERE user_id = ?
          AND status = 'error'
          AND datetime(created_at) >= datetime(?)
      `).get(userId, sinceIso) as RecentAiErrorSummaryRecord | undefined
      return {
        errorCount: Number(row?.error_count || 0),
        latestErrorAt: String(row?.latest_error_at || '')
      }
    },
    listUsageLedger(input: number | AiUsageLedgerQuery = {}) {
      const query = typeof input === 'number' ? { limit: input } : input
      const filter = buildUsageLedgerWhere(query)
      const limit = normalizeUsageLimit(query.limit)
      return database.prepare(`
        SELECT ledger.*, '' AS user_email, '本地工作区' AS user_display_name
        FROM ai_usage_ledger AS ledger
        WHERE ${filter.whereSql}
        ORDER BY datetime(ledger.created_at) DESC
        LIMIT ?
      `).all(...filter.params, limit)
    },
    queryUsageLedger(input: AiUsageLedgerQuery = {}) {
      const filter = buildUsageLedgerWhere(input)
      const limit = normalizeUsageLimit(input.limit)
      const rawItems = database.prepare(`
        SELECT
          ledger.*,
          COALESCE(NULLIF(chat_sessions.title, ''), NULLIF(ledger.session_label, ''), NULLIF(chat_sessions.target_id, ''), '') AS session_label,
          '' AS user_email,
          '本地工作区' AS user_display_name
        FROM ai_usage_ledger AS ledger
        LEFT JOIN chat_sessions ON chat_sessions.id = ledger.session_id
          AND COALESCE(chat_sessions.user_id, '') = COALESCE(ledger.user_id, '')
        WHERE ${filter.whereSql}
        ORDER BY datetime(ledger.created_at) DESC
        LIMIT ?
      `).all(...filter.params, limit) as Array<Record<string, unknown>>
      const items = attachSessionRoundIndexes(database, rawItems)
      const summaryRow = database.prepare(`
        SELECT
          COUNT(*) AS activity_count,
          COALESCE(SUM(ledger.input_tokens), 0) AS input_tokens,
          COALESCE(SUM(ledger.output_tokens), 0) AS output_tokens,
          COALESCE(SUM(ledger.input_tokens + ledger.output_tokens), 0) AS total_tokens,
          COALESCE(SUM(ledger.cache_read_tokens), 0) AS cache_read_tokens,
          COALESCE(SUM(ledger.cache_creation_tokens), 0) AS cache_creation_tokens,
          COALESCE(SUM(ledger.estimated_cost_cents), 0) AS estimated_cost_cents,
          COUNT(DISTINCT ledger.user_id) AS user_count
        FROM ai_usage_ledger AS ledger
        WHERE ${filter.whereSql}
      `).get(...filter.params) as Record<string, unknown> | undefined
      const activityCount = Number(summaryRow?.activity_count || 0)
      const cacheReadTokens = Number(summaryRow?.cache_read_tokens || 0)
      const cacheCreationTokens = Number(summaryRow?.cache_creation_tokens || 0)
      return {
        filters: {
          range: filter.range,
          feature: filter.feature,
          status: filter.status,
          userId: filter.userId,
          sessionId: filter.sessionId,
          limit
        },
        summary: {
          activityCount,
          inputTokens: Number(summaryRow?.input_tokens || 0),
          outputTokens: Number(summaryRow?.output_tokens || 0),
          totalTokens: Number(summaryRow?.total_tokens || 0),
          averageTokens: activityCount ? Math.round(Number(summaryRow?.total_tokens || 0) / activityCount) : 0,
          estimatedCostCents: Number(summaryRow?.estimated_cost_cents || 0),
          userCount: Number(summaryRow?.user_count || 0),
          // 缓存命中可观测化（P2 批 E4）：cache_read_tokens 是 input_tokens 的子集（见 aiAppService.ts
          // extractCacheReadTokens 注释），命中率 = cache_read / input_tokens，input_tokens 为 0 时记 0。
          cacheReadTokens,
          cacheCreationTokens,
          cacheHitRate: computeCacheHitRate(cacheReadTokens, Number(summaryRow?.input_tokens || 0))
        },
        items
      }
    },
    /** 提调坞·某一轮总消耗（round_id 精确匹配，不受 range 时间窗限制——返工并原轮后，round 可能横跨很久）。
     *  round_id 本身已是 `round:sessionId:锚消息id` 全局唯一键，无需再传 sessionId 二次收窄。
     *  userId 传入时按固定本地作用域过滤；留空时只用于内部汇总。 */
    getUsageTotalsByRoundId(roundId: string, userId = '') {
      const rid = String(roundId || '').trim()
      const emptyProfile = () => ({
        inputTokens: 0,
        cacheReadTokens: 0,
        callCount: 0,
        warmInputTokens: 0,
        warmCacheReadTokens: 0,
        warmCallCount: 0
      })
      const empty = {
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
        callCount: 0,
        profiles: {
          directorRound: emptyProfile(),
          postRound: emptyProfile()
        }
      }
      if (!rid) return empty
      const uid = String(userId || '').trim()
      const clauses = ['round_id = ?']
      const params: Array<string> = [rid]
      if (uid) {
        clauses.push('COALESCE(user_id, \'\') = ?')
        params.push(uid)
      }
      const rows = database.prepare(`
        SELECT
          input_tokens,
          output_tokens,
          cache_read_tokens,
          cache_creation_tokens,
          profile_id,
          provider_kind,
          harness_run_id,
          model,
          tool_epoch,
          tool_epoch_turn_index,
          created_at
        FROM ai_usage_ledger
        WHERE ${clauses.join(' AND ')}
        ORDER BY datetime(created_at) ASC, rowid ASC
      `).all(...params) as Array<Record<string, unknown>>
      const profiles = {
        directorRound: emptyProfile(),
        postRound: emptyProfile()
      }
      const seenWarmKeys = new Set<string>()
      let inputTokens = 0
      let outputTokens = 0
      let cacheReadTokens = 0
      let cacheCreationTokens = 0
      for (const row of rows) {
        const rowInput = Number(row.input_tokens || 0)
        const rowOutput = Number(row.output_tokens || 0)
        const rowCacheRead = Number(row.cache_read_tokens || 0)
        inputTokens += rowInput
        outputTokens += rowOutput
        cacheReadTokens += rowCacheRead
        cacheCreationTokens += Number(row.cache_creation_tokens || 0)
        const profileId = String(row.profile_id || '')
        const profile = profileId === 'tidiao.director-round'
          ? profiles.directorRound
          : profileId === 'tidiao.post-round'
            ? profiles.postRound
            : null
        if (!profile) continue
        profile.inputTokens += rowInput
        profile.cacheReadTokens += rowCacheRead
        profile.callCount += 1
        const warmKey = [
          profileId,
          String(row.harness_run_id || ''),
          String(row.provider_kind || ''),
          String(row.model || ''),
          Number(row.tool_epoch || 0)
        ].join('\u0000')
        const epochTurnIndex = Number(row.tool_epoch_turn_index || 0)
        const isWarm = epochTurnIndex >= 1 && seenWarmKeys.has(warmKey)
        if (isWarm) {
          profile.warmInputTokens += rowInput
          profile.warmCacheReadTokens += rowCacheRead
          profile.warmCallCount += 1
        }
        seenWarmKeys.add(warmKey)
      }
      return {
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
        cacheReadTokens,
        cacheCreationTokens,
        callCount: rows.length,
        profiles
      }
    },
    listUsageLedgerSessions(input: AiUsageLedgerQuery = {}) {
      const filter = buildUsageSessionWhere(input)
      return database.prepare(`
        SELECT
          ledger.session_id,
          COALESCE(NULLIF(MAX(chat_sessions.title), ''), NULLIF(MAX(ledger.session_label), ''), NULLIF(MAX(chat_sessions.target_id), ''), '') AS session_label,
          COUNT(*) AS activity_count,
          COALESCE(SUM(ledger.input_tokens + ledger.output_tokens), 0) AS total_tokens,
          MAX(ledger.created_at) AS latest_at
        FROM ai_usage_ledger AS ledger
        LEFT JOIN chat_sessions ON chat_sessions.id = ledger.session_id
          AND COALESCE(chat_sessions.user_id, '') = COALESCE(ledger.user_id, '')
        WHERE ${filter.whereSql}
          AND COALESCE(ledger.session_id, '') <> ''
        GROUP BY ledger.session_id
        ORDER BY datetime(latest_at) DESC
      `).all(...filter.params) as Array<Record<string, unknown>>
    },
    insertUsageLedger(row: {
      id: string
      userId: string
      presetId: string
      presetName: string
      feature: string | AiUsageFeature
      sessionId?: string
      sessionLabel?: string
      roundId?: string
      unitKind?: string
      usageLabel?: string
      placeLabel?: string
      profileId?: string
      providerKind?: string
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
      model: string
      inputTokens: number
      outputTokens: number
      cacheReadTokens?: number
      cacheCreationTokens?: number
      estimatedCostCents: number
      status: string
      errorCode?: string
    }) {
      database.prepare(`
        INSERT INTO ai_usage_ledger (
          id, user_id, preset_id, preset_name, feature, session_id, session_label, round_id, unit_kind, usage_label, place_label,
          profile_id, provider_kind, harness_run_id, model_turn_index, tool_epoch, tool_epoch_turn_index, prompt_rebuild,
          active_tool_names_hash, tool_schema_hash, system_hash, message_prefix_hash, request_envelope_hash, first_diff_source, model,
          input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens, estimated_cost_cents, status, error_code, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        row.id,
        row.userId,
        row.presetId,
        row.presetName,
        normalizeAiUsageFeature(row.feature),
        row.sessionId || '',
        row.sessionLabel || '',
        row.roundId || '',
        row.unitKind || '',
        row.usageLabel || '',
        row.placeLabel || '',
        row.profileId || '',
        row.providerKind || '',
        row.harnessRunId || '',
        row.modelTurnIndex || 0,
        row.toolEpoch || 0,
        row.toolEpochTurnIndex || 0,
        row.promptRebuild ? 1 : 0,
        row.activeToolNamesHash || '',
        row.toolSchemaHash || '',
        row.systemHash || '',
        row.messagePrefixHash || '',
        row.requestEnvelopeHash || '',
        row.firstDiffSource || '',
        row.model,
        row.inputTokens,
        row.outputTokens,
        row.cacheReadTokens || 0,
        row.cacheCreationTokens || 0,
        row.estimatedCostCents,
        row.status,
        row.errorCode || '',
        new Date().toISOString()
      )
      database._save?.()
    }
  }
}

export const aiRepository = createAiRepository()
