<template>
  <main class="data-manage-page" aria-label="数据管理">
    <section class="data-manage-page__filters" aria-label="智能活动筛选">
      <div class="data-manage-page__filter-group">
        <span class="data-manage-page__filter-label">时间范围</span>
        <div class="data-manage-page__segmented" role="group" aria-label="时间范围">
          <button
            v-for="option in rangeOptions"
            :key="option.value"
            type="button"
            :class="{ active: activeRange === option.value }"
            @click="activeRange = option.value"
          >
            {{ option.label }}
          </button>
        </div>
      </div>
      <div class="data-manage-page__filter-group">
        <span class="data-manage-page__filter-label">活动类型</span>
        <div class="data-manage-page__segmented data-manage-page__segmented--wrap" role="group" aria-label="活动类型">
          <button
            v-for="option in typeOptions"
            :key="option.value"
            type="button"
            :class="{ active: activeType === option.value }"
            @click="activeType = option.value"
          >
            {{ option.label }}
          </button>
        </div>
      </div>
      <div class="data-manage-page__filter-group">
        <span class="data-manage-page__filter-label">会话</span>
        <select v-model="activeSessionId" class="data-manage-page__select" aria-label="会话筛选">
          <option value="all">全部会话</option>
          <option v-for="session in sessionOptions" :key="session.id" :value="session.id">
            {{ session.label }}
          </option>
        </select>
      </div>
      <div class="data-manage-page__filter-group">
        <span class="data-manage-page__filter-label">状态</span>
        <div class="data-manage-page__segmented" role="group" aria-label="状态">
          <button
            v-for="option in statusOptions"
            :key="option.value"
            type="button"
            :class="{ active: activeStatus === option.value }"
            @click="activeStatus = option.value"
          >
            {{ option.label }}
          </button>
        </div>
      </div>
    </section>

    <section class="data-manage-page__summary" aria-label="消耗概览">
      <div>
        <span>总消耗 tokens</span>
        <strong>{{ formatNumber(summary.totalTokens) }}</strong>
      </div>
      <div>
        <span>总活动数</span>
        <strong>{{ formatNumber(summary.activityCount) }}</strong>
      </div>
      <div>
        <span>平均单次活动消耗</span>
        <strong>{{ formatNumber(summary.averageTokens) }}</strong>
      </div>
      <div>
        <span>涉及会话</span>
        <strong>{{ formatNumber(summarySessionCount) }}</strong>
      </div>
    </section>

    <section class="data-manage-page__table-shell" aria-label="智能活动消耗轮次">
      <table class="data-manage-page__table">
        <thead>
          <tr>
            <th>会话 / 轮次</th>
            <th>输入 tokens</th>
            <th>输出 tokens</th>
            <th>总消耗 tokens</th>
            <th>状态</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading">
            <td colspan="5" class="data-manage-page__empty">正在读取 AI 消耗台账</td>
          </tr>
          <tr v-else-if="errorMessage">
            <td colspan="5" class="data-manage-page__empty data-manage-page__empty--error">
              {{ errorMessage }}
            </td>
          </tr>
          <template v-else>
            <template v-for="group in usageGroups" :key="group.id">
              <tr class="data-manage-page__round-row" @click="toggleGroup(group.id)">
                <td>
                  <button type="button" class="data-manage-page__round-toggle" :class="{ open: isGroupOpen(group.id) }" @click.stop="toggleGroup(group.id)">
                    ›
                  </button>
                  <span class="data-manage-page__target">{{ group.sessionLabel }}</span>
                  <span class="data-manage-page__target-sub">{{ group.label }} · {{ formatDateTime(group.createdAt) }} · {{ group.rows.length }} 条</span>
                </td>
                <td>{{ formatNumber(group.inputTokens) }}</td>
                <td>{{ formatNumber(group.outputTokens) }}</td>
                <td><strong>{{ formatNumber(group.totalTokens) }}</strong></td>
                <td>
                  <span class="data-manage-page__status" :class="`data-manage-page__status--${resolveStatusKind(group.status)}`">
                    {{ formatStatus(group.status) }}
                  </span>
                </td>
              </tr>
              <tr v-if="isGroupOpen(group.id)" class="data-manage-page__detail-row">
                <td colspan="5">
                  <table class="data-manage-page__detail-table" aria-label="轮次内明细">
                    <thead>
                      <tr>
                        <th>时间</th>
                        <th>会话</th>
                        <th>归属</th>
                        <th>活动类型</th>
                        <th>调用场景</th>
                        <th>模型</th>
                        <th>输入</th>
                        <th title="仅 Claude Code 订阅桥会有值：命中缓存/新建缓存各消耗多少 token">缓存命中</th>
                        <th>输出</th>
                        <th>总消耗</th>
                        <th>状态</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="row in group.rows" :key="row.id">
                        <td>{{ formatDateTime(row.createdAt) }}</td>
                        <td>{{ row.sessionLabel || '未记录会话' }}</td>
                        <td>{{ resolveUnitKindLabel(row) }}</td>
                        <td>{{ resolveAiUsageFeatureLabel(row.feature) }}</td>
                        <td>{{ row.usageLabel || row.placeLabel || '未记录场景' }}</td>
                        <td>{{ row.model || '未记录模型' }}</td>
                        <td>{{ formatNumber(row.inputTokens) }}</td>
                        <td>{{ formatCacheHit(row) }}</td>
                        <td>{{ formatNumber(row.outputTokens) }}</td>
                        <td><strong>{{ formatNumber(row.totalTokens) }}</strong></td>
                        <td>{{ formatStatus(row.status) }}</td>
                      </tr>
                    </tbody>
                  </table>
                </td>
              </tr>
            </template>
          </template>
          <tr v-if="!loading && !errorMessage && usageGroups.length === 0">
            <td colspan="5" class="data-manage-page__empty">当前筛选下还没有 AI 消耗记录</td>
          </tr>
        </tbody>
      </table>
    </section>
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { API } from '../../../config/api'
import { formatCacheHitHint } from '../../../utils/aiUsage'
import {
  AI_USAGE_FEATURE_LABELS,
  normalizeAiUsageFeature,
  resolveAiUsageFeatureLabel,
  type AiUsageFeature
} from '../../../../shared/aiUsageFeatures'

type RangeFilter = 'today' | 'yesterday' | '7d' | '30d'
type TypeFilter = 'all' | AiUsageFeature
type StatusFilter = 'all' | 'success' | 'failed' | 'estimated'

type UsageLedgerItem = {
  id: string
  createdAt: string
  feature: AiUsageFeature
  sessionId: string
  sessionLabel: string
  roundId: string
  sessionRoundIndex: number
  unitKind: string
  usageLabel: string
  placeLabel: string
  model: string
  presetName: string
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheCreationTokens: number
  totalTokens: number
  status: string
  errorCode: string
  userEmail: string
  userDisplayName: string
  userId: string
}

type UsageSessionOption = {
  id: string
  label: string
  activityCount: number
  totalTokens: number
}

type UsageRoundGroup = {
  id: string
  label: string
  sessionLabel: string
  createdAt: string
  inputTokens: number
  outputTokens: number
  totalTokens: number
  status: string
  rows: UsageLedgerItem[]
}

type UsageSummary = {
  activityCount: number
  inputTokens: number
  outputTokens: number
  totalTokens: number
  averageTokens: number
  userCount: number
}

type UsageLedgerResponseItem = {
  id?: unknown
  created_at?: unknown
  createdAt?: unknown
  feature?: unknown
  session_id?: unknown
  sessionId?: unknown
  session_label?: unknown
  sessionLabel?: unknown
  round_id?: unknown
  roundId?: unknown
  session_round_index?: unknown
  sessionRoundIndex?: unknown
  unit_kind?: unknown
  unitKind?: unknown
  usage_label?: unknown
  usageLabel?: unknown
  place_label?: unknown
  placeLabel?: unknown
  model?: unknown
  preset_name?: unknown
  presetName?: unknown
  input_tokens?: unknown
  inputTokens?: unknown
  output_tokens?: unknown
  outputTokens?: unknown
  cache_read_tokens?: unknown
  cacheReadTokens?: unknown
  cache_creation_tokens?: unknown
  cacheCreationTokens?: unknown
  status?: unknown
  error_code?: unknown
  errorCode?: unknown
  user_email?: unknown
  userEmail?: unknown
  user_display_name?: unknown
  userDisplayName?: unknown
  user_id?: unknown
  userId?: unknown
}

const activeRange = ref<RangeFilter>('today')
const activeType = ref<TypeFilter>('all')
const activeStatus = ref<StatusFilter>('all')
const activeSessionId = ref('all')
const loading = ref(false)
const errorMessage = ref('')
const usageRows = ref<UsageLedgerItem[]>([])
const sessionOptions = ref<UsageSessionOption[]>([])
const expandedGroupIds = ref<Set<string>>(new Set())
const summary = ref<UsageSummary>({
  activityCount: 0,
  inputTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
  averageTokens: 0,
  userCount: 0
})
let requestSerial = 0

const rangeOptions: Array<{ value: RangeFilter; label: string }> = [
  { value: 'today', label: '今天' },
  { value: 'yesterday', label: '昨天' },
  { value: '7d', label: '最近七天' },
  { value: '30d', label: '最近一月' }
]

const typeOptions: Array<{ value: TypeFilter; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'role_message', label: AI_USAGE_FEATURE_LABELS.role_message },
  { value: 'narration', label: AI_USAGE_FEATURE_LABELS.narration },
  { value: 'narration_debug', label: AI_USAGE_FEATURE_LABELS.narration_debug },
  { value: 'write_back', label: AI_USAGE_FEATURE_LABELS.write_back },
  { value: 'event_candidate', label: AI_USAGE_FEATURE_LABELS.event_candidate },
  { value: 'agent', label: AI_USAGE_FEATURE_LABELS.agent },
  { value: 'embedding', label: AI_USAGE_FEATURE_LABELS.embedding },
  { value: 'other', label: AI_USAGE_FEATURE_LABELS.other }
]

const statusOptions: Array<{ value: StatusFilter; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'success', label: '成功' },
  { value: 'failed', label: '失败' },
  { value: 'estimated', label: '预估' }
]

const summarySessionCount = computed(() => {
  if (activeSessionId.value !== 'all' && usageRows.value.length) return 1
  const visibleSessions = new Set(usageRows.value.map((row) => row.sessionId).filter(Boolean))
  return visibleSessions.size || sessionOptions.value.length
})

// 消耗溯源（2026-07-07 用户拍板口径）：同一 round_id 聚成一组=该轮总消耗（首次生成 + 重生成/纠偏/精修
// 等返工全并入）；跨轮操作（op:… 单元 id，如批量投影）各自成组。旧「时间差拆第 N 次生成」启发式已退役，
// 返工语义由每行 unit_kind 标注（组内「归属」列可见）。
const usageGroups = computed<UsageRoundGroup[]>(() => {
  const groups = new Map<string, UsageRoundGroup>()
  for (const row of usageRows.value) {
    const groupId = row.roundId || `usage:${row.id}`
    const existing = groups.get(groupId)
    if (!existing) {
      groups.set(groupId, {
        id: groupId,
        label: formatRoundLabel(row),
        sessionLabel: row.sessionLabel || '未记录会话',
        createdAt: row.createdAt,
        inputTokens: row.inputTokens,
        outputTokens: row.outputTokens,
        totalTokens: row.totalTokens,
        status: row.status,
        rows: [row]
      })
      continue
    }
    existing.rows.push(row)
    existing.inputTokens += row.inputTokens
    existing.outputTokens += row.outputTokens
    existing.totalTokens += row.totalTokens
    if (new Date(row.createdAt).getTime() > new Date(existing.createdAt).getTime()) existing.createdAt = row.createdAt
    existing.status = mergeGroupStatus(existing.status, row.status)
  }
  const list = [...groups.values()]
  // 轮组若含返工消耗，在标题上直接点名（一眼看出该轮总账里有返工成分）。
  for (const group of list) {
    const reworkLabels = [...new Set(
      group.rows
        .map((row) => REWORK_UNIT_KIND_LABELS[row.unitKind] || '')
        .filter(Boolean)
    )]
    if (reworkLabels.length) group.label = `${group.label} · 含${reworkLabels.join('/')}`
  }
  return list.sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
})

function formatNumber(value: number) {
  return Number(value || 0).toLocaleString('zh-CN')
}

// 缓存命中/新建都是 0 时（非 Claude Code 订阅桥的调用）显示占位符，避免一堆 0 干扰阅读。
// 百分比相对该行 inputTokens 算（缓存只作用于输入侧），与坞、编剧卡同一口径（formatCacheHitHint）。
function formatCacheHit(row: UsageLedgerItem) {
  if (!row.cacheReadTokens && !row.cacheCreationTokens) return '—'
  const parts = []
  if (row.cacheReadTokens) {
    const hint = formatCacheHitHint(row.inputTokens, row.cacheReadTokens)
    parts.push(hint ? `命中${formatNumber(row.cacheReadTokens)}（${hint.replace('输入缓存命中 ', '')}）` : `命中${formatNumber(row.cacheReadTokens)}`)
  }
  if (row.cacheCreationTokens) parts.push(`新建${formatNumber(row.cacheCreationTokens)}`)
  return parts.join(' / ')
}

function formatDateTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value || '未知'
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

function resolveStatusKind(value: string) {
  const status = String(value || '').toLowerCase()
  if (status === 'success') return 'success'
  if (status === 'estimated') return 'estimated'
  return 'failed'
}

function formatStatus(value: string) {
  const status = String(value || '').toLowerCase()
  if (status === 'success') return '成功'
  if (status === 'estimated') return '预估'
  if (status === 'failed' || status === 'error') return '失败'
  return status || '未知'
}

function mergeGroupStatus(left: string, right: string) {
  const statuses = [left, right].map((item) => String(item || '').toLowerCase())
  if (statuses.some((item) => item === 'failed' || item === 'error')) return 'failed'
  if (statuses.every((item) => item === 'estimated')) return 'estimated'
  if (statuses.some((item) => item === 'estimated')) return 'estimated'
  return 'success'
}

// 消耗单元类型 → 展示名（与服务端 unit_kind 取值联动：round/返工三类/跨轮操作类；旧数据空串）。
const UNIT_KIND_LABELS: Record<string, string> = {
  round: '发送轮',
  regenerate: '重生成',
  correction: '纠偏',
  precision_edit: '精修',
  batch_projection: '批量投影',
  projection: '消息投影',
  agent_task: 'Agent 任务',
  image_caption: '图片转述'
}

// 轮组标题里点名的返工类型（round 本体不算返工）。
const REWORK_UNIT_KIND_LABELS: Record<string, string> = {
  regenerate: '重生成',
  correction: '纠偏',
  precision_edit: '精修'
}

// op:<kind>:… 单元 id 的操作名（unit_kind 缺失时的兜底解析）。
const OP_KIND_LABELS: Record<string, string> = {
  batch_projection: '批量投影',
  projection_writeback: '投影写轨迹',
  improvised_extraction: '即兴角色提取',
  image_caption: '图片转述'
}

function resolveUnitKindLabel(row: UsageLedgerItem) {
  return UNIT_KIND_LABELS[row.unitKind] || (row.unitKind ? row.unitKind : '—')
}

function formatOperationUnitLabel(row: UsageLedgerItem) {
  if (UNIT_KIND_LABELS[row.unitKind]) return UNIT_KIND_LABELS[row.unitKind]
  const opKind = String(row.roundId || '').split(':')[1] || ''
  return OP_KIND_LABELS[opKind] || 'Agent 操作'
}

function formatRoundLabel(row: UsageLedgerItem) {
  // op:… 是跨轮操作单元，不是消息轮，直接显示操作名。
  if (String(row.roundId || '').startsWith('op:')) return formatOperationUnitLabel(row)
  if (row.sessionRoundIndex > 0) return `第 ${row.sessionRoundIndex} 轮`
  if (!row.roundId) return row.usageLabel || '未记录轮次'
  const parts = String(row.roundId || '').split(':')
  const last = parts[parts.length - 1]
  return last && /^\d+$/.test(last) ? `轮次 ${last}` : '本轮对话'
}

function isGroupOpen(groupId: string) {
  return expandedGroupIds.value.has(groupId)
}

function toggleGroup(groupId: string) {
  const next = new Set(expandedGroupIds.value)
  if (next.has(groupId)) next.delete(groupId)
  else next.add(groupId)
  expandedGroupIds.value = next
}

function normalizeLedgerItem(item: UsageLedgerResponseItem): UsageLedgerItem {
  const inputTokens = Number(item.input_tokens ?? item.inputTokens ?? 0)
  const outputTokens = Number(item.output_tokens ?? item.outputTokens ?? 0)
  return {
    id: String(item.id || ''),
    createdAt: String(item.created_at ?? item.createdAt ?? ''),
    feature: normalizeAiUsageFeature(item.feature),
    sessionId: String(item.session_id ?? item.sessionId ?? ''),
    sessionLabel: String(item.session_label ?? item.sessionLabel ?? ''),
    roundId: String(item.round_id ?? item.roundId ?? ''),
    sessionRoundIndex: Number(item.session_round_index ?? item.sessionRoundIndex ?? 0),
    unitKind: String(item.unit_kind ?? item.unitKind ?? ''),
    usageLabel: String(item.usage_label ?? item.usageLabel ?? ''),
    placeLabel: String(item.place_label ?? item.placeLabel ?? ''),
    model: String(item.model || ''),
    presetName: String(item.preset_name ?? item.presetName ?? ''),
    inputTokens,
    outputTokens,
    cacheReadTokens: Number(item.cache_read_tokens ?? item.cacheReadTokens ?? 0),
    cacheCreationTokens: Number(item.cache_creation_tokens ?? item.cacheCreationTokens ?? 0),
    totalTokens: inputTokens + outputTokens,
    status: String(item.status || ''),
    errorCode: String(item.error_code ?? item.errorCode ?? ''),
    userEmail: String(item.user_email ?? item.userEmail ?? ''),
    userDisplayName: String(item.user_display_name ?? item.userDisplayName ?? ''),
    userId: String(item.user_id ?? item.userId ?? '')
  }
}

function normalizeSessionOptions(value: unknown): UsageSessionOption[] {
  const rows = Array.isArray(value) ? value : []
  return rows
    .map((item) => {
      const record = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>
      const id = String(record.session_id ?? record.sessionId ?? '').trim()
      const label = String(record.session_label ?? record.sessionLabel ?? '').trim()
      if (!id) return null
      return {
        id,
        label: label || '未命名会话',
        activityCount: Number(record.activity_count ?? record.activityCount ?? 0),
        totalTokens: Number(record.total_tokens ?? record.totalTokens ?? 0)
      }
    })
    .filter((item): item is UsageSessionOption => Boolean(item))
}

function normalizeSummary(value: unknown): UsageSummary {
  const source = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>
  return {
    activityCount: Number(source.activityCount || 0),
    inputTokens: Number(source.inputTokens || 0),
    outputTokens: Number(source.outputTokens || 0),
    totalTokens: Number(source.totalTokens || 0),
    averageTokens: Number(source.averageTokens || 0),
    userCount: Number(source.userCount || 0)
  }
}

async function loadUsageLedger() {
  const serial = ++requestSerial
  loading.value = true
  errorMessage.value = ''
  const query = new URLSearchParams()
  query.set('range', activeRange.value)
  query.set('limit', '200')
  if (activeType.value !== 'all') query.set('feature', activeType.value)
  if (activeStatus.value !== 'all') query.set('status', activeStatus.value)
  if (activeSessionId.value !== 'all') query.set('sessionId', activeSessionId.value)
  try {
    const response = await fetch(`${API.AI_USAGE}?${query.toString()}`)
    if (!response.ok) throw new Error(await response.text() || `HTTP ${response.status}`)
    const payload = await response.json()
    if (serial !== requestSerial) return
    usageRows.value = Array.isArray(payload?.items) ? payload.items.map(normalizeLedgerItem) : []
    sessionOptions.value = normalizeSessionOptions(payload?.sessions)
    if (activeSessionId.value !== 'all' && !sessionOptions.value.some((item) => item.id === activeSessionId.value)) {
      activeSessionId.value = 'all'
    }
    expandedGroupIds.value = new Set()
    summary.value = normalizeSummary(payload?.summary)
  } catch (error) {
    if (serial !== requestSerial) return
    usageRows.value = []
    sessionOptions.value = []
    expandedGroupIds.value = new Set()
    summary.value = normalizeSummary(null)
    errorMessage.value = error instanceof Error ? `读取 AI 消耗台账失败：${error.message}` : '读取 AI 消耗台账失败'
  } finally {
    if (serial === requestSerial) loading.value = false
  }
}

onMounted(loadUsageLedger)

watch([activeRange, activeType, activeStatus, activeSessionId], () => {
  void loadUsageLedger()
})
</script>

<style scoped>
.data-manage-page {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px 32px 22px;
  overflow: hidden;
  color: var(--morandi-text);
}

.data-manage-page__filters {
  display: flex;
  align-items: center;
  gap: 24px;
  flex-wrap: wrap;
  padding: 0 0 8px;
}

.data-manage-page__filter-group {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.data-manage-page__filter-label {
  color: var(--morandi-text-light);
  font-size: 0.82rem;
  white-space: nowrap;
}

.data-manage-page__segmented {
  display: inline-flex;
  border: 1px solid var(--morandi-border);
  border-radius: 8px;
  overflow: hidden;
  background: color-mix(in srgb, var(--morandi-card) 40%, transparent);
}

.data-manage-page__segmented--wrap {
  flex-wrap: wrap;
  overflow: visible;
}

.data-manage-page__segmented button {
  min-height: 32px;
  border: 0;
  border-right: 1px solid var(--morandi-border);
  padding: 0 16px;
  background: transparent;
  color: var(--morandi-text-light);
  font-size: 0.82rem;
  cursor: pointer;
}

.data-manage-page__segmented button:last-child {
  border-right: 0;
}

.data-manage-page__segmented button.active {
  background: rgba(113, 133, 111, 0.12);
  color: var(--morandi-text);
  font-weight: 600;
}

.data-manage-page__select {
  min-height: 32px;
  max-width: 220px;
  border: 1px solid var(--morandi-border);
  border-radius: 8px;
  padding: 0 30px 0 10px;
  background: color-mix(in srgb, var(--morandi-card) 40%, transparent);
  color: var(--morandi-text);
  font-size: 0.82rem;
}

.data-manage-page__summary {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  border: 1px solid var(--morandi-border);
  border-radius: 8px;
  background: color-mix(in srgb, var(--morandi-card) 38%, transparent);
}

.data-manage-page__summary div {
  min-width: 0;
  padding: 18px 22px;
  border-right: 1px solid var(--morandi-border);
}

.data-manage-page__summary div:last-child {
  border-right: 0;
}

.data-manage-page__summary span {
  display: block;
  color: var(--morandi-text-light);
  font-size: 0.78rem;
}

.data-manage-page__summary strong {
  display: block;
  margin-top: 8px;
  font-size: 1.1rem;
  letter-spacing: 0;
}

.data-manage-page__table-shell {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  border: 1px solid var(--morandi-border);
  border-radius: 8px;
  background: color-mix(in srgb, var(--morandi-card) 34%, transparent);
}

.data-manage-page__table {
  width: 100%;
  border-collapse: collapse;
  min-width: 760px;
  font-size: 0.84rem;
}

.data-manage-page__table th,
.data-manage-page__table td {
  padding: 12px 16px;
  border-bottom: 1px solid rgba(130, 120, 105, 0.16);
  text-align: left;
  white-space: nowrap;
}

.data-manage-page__table th {
  position: sticky;
  top: 0;
  z-index: 1;
  background: color-mix(in srgb, var(--morandi-card) 94%, transparent);
  color: var(--morandi-text);
  font-weight: 600;
}

.data-manage-page__table tbody tr:hover {
  background: rgba(113, 133, 111, 0.08);
}

.data-manage-page__round-row {
  cursor: pointer;
}

.data-manage-page__round-row td:first-child {
  min-width: 280px;
}

.data-manage-page__round-toggle {
  width: 24px;
  height: 24px;
  margin-right: 8px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--morandi-text-light);
  font-size: 1.1rem;
  line-height: 1;
  cursor: pointer;
  transition: transform 0.16s ease, background 0.16s ease;
}

.data-manage-page__round-toggle.open {
  transform: rotate(90deg);
}

.data-manage-page__round-toggle:hover,
.data-manage-page__round-toggle:focus-visible {
  background: rgba(113, 133, 111, 0.1);
  outline: none;
}

.data-manage-page__detail-row td {
  padding: 0;
  background: color-mix(in srgb, var(--morandi-card) 24%, transparent);
}

.data-manage-page__detail-table {
  width: 100%;
  border-collapse: collapse;
  min-width: 980px;
  font-size: 0.78rem;
}

.data-manage-page__detail-table th,
.data-manage-page__detail-table td {
  padding: 10px 12px;
  border-bottom: 1px solid rgba(130, 120, 105, 0.12);
  text-align: left;
  white-space: nowrap;
}

.data-manage-page__detail-table th {
  position: static;
  color: var(--morandi-text-light);
  font-weight: 600;
  background: transparent;
}

.data-manage-page__target,
.data-manage-page__target-sub {
  display: block;
}

.data-manage-page__target-sub {
  margin-top: 3px;
  color: var(--morandi-text-light);
  font-size: 0.76rem;
}

.data-manage-page__empty {
  color: var(--morandi-text-light);
  text-align: center;
}

.data-manage-page__empty--error {
  color: #9b5757;
}

.data-manage-page__status {
  display: inline-flex;
  align-items: center;
  min-height: 22px;
  padding: 0 8px;
  border: 1px solid rgba(113, 133, 111, 0.22);
  border-radius: 999px;
  color: var(--morandi-text-light);
  font-size: 0.76rem;
}

.data-manage-page__status--success {
  background: rgba(113, 133, 111, 0.1);
  color: var(--morandi-text);
}

.data-manage-page__status--estimated {
  background: rgba(153, 132, 92, 0.12);
  color: #796747;
}

.data-manage-page__status--failed {
  background: rgba(155, 87, 87, 0.1);
  border-color: rgba(155, 87, 87, 0.22);
  color: #9b5757;
}

@media (max-width: 900px) {
  .data-manage-page {
    padding: 20px 18px;
  }

  .data-manage-page__summary {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .data-manage-page__summary div:nth-child(2) {
    border-right: 0;
  }

  .data-manage-page__summary div:nth-child(-n + 2) {
    border-bottom: 1px solid var(--morandi-border);
  }
}
</style>
