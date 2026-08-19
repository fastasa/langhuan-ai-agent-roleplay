import {
  AGENT_RUNTIME_JOURNAL_EVENT_KINDS,
  AGENT_RUNTIME_JOURNAL_SCHEMA_VERSION,
  recoverAgentRuntimeJournal,
  type AgentRuntimeJournalRecovery,
  type AgentRuntimeJournalEventEnvelope,
  verifyAgentRuntimeJournalEvent
} from '../../../src/app/agentRuntime/runtimeJournal.js'
import {
  agentRuntimeJournalRepository,
  createAgentRuntimeJournalRepository,
  type AgentRuntimeJournalRunStatusFilter
} from '../../repositories/agentRuntimeJournalRepository.js'

type Repository = ReturnType<typeof createAgentRuntimeJournalRepository>
type Scope = { userId: string; workspaceId: string }

export const AGENT_RUNTIME_JOURNAL_LIMITS = Object.freeze({
  runIdChars: 240,
  completionAnchorChars: 360,
  payloadBytes: 256 * 1024,
  payloadDepth: 20,
  payloadNodes: 20_000,
  payloadKeyChars: 240,
  payloadStringBytes: 128 * 1024,
  maxSeq: 2_147_483_647,
  defaultListLimit: 20,
  maxListLimit: 100
})

export interface AgentRuntimeJournalRunSummary {
  runId: string
  lastSeq: number
  lastTimestamp: string
  profileId: string | null
  runtimeVersion: string | null
  runCompleted: boolean
  pendingTools: AgentRuntimeJournalRecovery['pendingTools']
  outcomeUnknownTools: AgentRuntimeJournalRecovery['outcomeUnknownTools']
  /** 发现接口只供人工/宿主恢复审计，绝不授权自动重放。 */
  autoReplayAllowed: false
}

const EVENT_KEYS = new Set([
  'schemaVersion',
  'runId',
  'seq',
  'kind',
  'timestamp',
  'completionAnchor',
  'payload',
  'checksum'
])

function fail(status: number, error: string) {
  return { ok: false as const, status, error }
}

function validBoundedText(value: unknown, maxChars: number): value is string {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= maxChars
    && value === value.trim()
    && !/[\u0000-\u001f\u007f]/.test(value)
}

function parseRunStatus(value: unknown): AgentRuntimeJournalRunStatusFilter | null {
  if (value === undefined || value === null || value === '') return 'incomplete'
  return value === 'incomplete' || value === 'completed' || value === 'all' ? value : null
}

function parseListLimit(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return AGENT_RUNTIME_JOURNAL_LIMITS.defaultListLimit
  const normalized = typeof value === 'number' ? String(value) : value
  if (typeof normalized !== 'string' || !/^[1-9]\d*$/.test(normalized)) return null
  const parsed = Number(normalized)
  return Number.isSafeInteger(parsed) && parsed <= AGENT_RUNTIME_JOURNAL_LIMITS.maxListLimit
    ? parsed
    : null
}

function metadataText(metadata: AgentRuntimeJournalRecovery['runMetadata'], key: string): string | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null
  const value = (metadata as Record<string, unknown>)[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function buildRunSummary(
  runId: string,
  events: AgentRuntimeJournalEventEnvelope[]
): AgentRuntimeJournalRunSummary | null {
  const recovery = recoverAgentRuntimeJournal(events, runId)
  if (recovery.rejectedEvents.length > 0 || recovery.runId !== runId || recovery.lastSeq <= 0) return null
  const lastEvent = events.find((event) => event.seq === recovery.lastSeq)
  if (!lastEvent) return null
  return {
    runId,
    lastSeq: recovery.lastSeq,
    lastTimestamp: lastEvent.timestamp,
    profileId: metadataText(recovery.runMetadata, 'profileId'),
    runtimeVersion: metadataText(recovery.runMetadata, 'runtimeVersion'),
    runCompleted: recovery.runCompleted,
    pendingTools: recovery.pendingTools.map((tool) => ({ ...tool })),
    outcomeUnknownTools: recovery.outcomeUnknownTools.map((tool) => ({ ...tool })),
    autoReplayAllowed: false
  }
}

function validatePayload(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 'payload 必须是 JSON 对象'
  let nodes = 0
  const visit = (member: unknown, depth: number): string | null => {
    nodes += 1
    if (nodes > AGENT_RUNTIME_JOURNAL_LIMITS.payloadNodes) return 'payload 节点数量超过限制'
    if (depth > AGENT_RUNTIME_JOURNAL_LIMITS.payloadDepth) return 'payload 嵌套深度超过限制'
    if (member === null || typeof member === 'boolean') return null
    if (typeof member === 'number') return Number.isFinite(member) ? null : 'payload 包含非有限数字'
    if (typeof member === 'string') {
      return Buffer.byteLength(member, 'utf8') <= AGENT_RUNTIME_JOURNAL_LIMITS.payloadStringBytes
        ? null
        : 'payload 单个字符串超过限制'
    }
    if (Array.isArray(member)) {
      for (const item of member) {
        const error = visit(item, depth + 1)
        if (error) return error
      }
      return null
    }
    if (!member || typeof member !== 'object') return 'payload 包含非 JSON 值'
    const prototype = Object.getPrototypeOf(member)
    if (prototype !== Object.prototype && prototype !== null) return 'payload 包含非普通对象'
    for (const [key, item] of Object.entries(member as Record<string, unknown>)) {
      if (!key || key.length > AGENT_RUNTIME_JOURNAL_LIMITS.payloadKeyChars || /[\u0000-\u001f\u007f]/.test(key)) {
        return 'payload 字段名非法或超过限制'
      }
      if (key === '__proto__' || key === 'prototype' || key === 'constructor') {
        return 'payload 包含不允许的对象字段名'
      }
      const error = visit(item, depth + 1)
      if (error) return error
    }
    return null
  }
  const error = visit(value, 0)
  if (error) return error
  let serialized = ''
  try { serialized = JSON.stringify(value) } catch { return 'payload 不能序列化为 JSON' }
  return Buffer.byteLength(serialized, 'utf8') <= AGENT_RUNTIME_JOURNAL_LIMITS.payloadBytes
    ? null
    : 'payload 超过 256 KiB 限制'
}

function validateEvent(raw: unknown, routeRunId: string): { event: AgentRuntimeJournalEventEnvelope } | { error: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { error: '事件必须是 JSON 对象' }
  const record = raw as Record<string, unknown>
  const extraKeys = Object.keys(record).filter((key) => !EVENT_KEYS.has(key))
  if (extraKeys.length) return { error: `事件包含未知字段：${extraKeys.sort().join(', ')}` }
  if (record.schemaVersion !== AGENT_RUNTIME_JOURNAL_SCHEMA_VERSION) return { error: 'schemaVersion 不受支持' }
  if (!validBoundedText(record.runId, AGENT_RUNTIME_JOURNAL_LIMITS.runIdChars)) return { error: 'runId 非法或超过限制' }
  if (record.runId !== routeRunId) return { error: 'URL runId 与事件 runId 不一致' }
  if (!Number.isInteger(record.seq) || Number(record.seq) <= 0 || Number(record.seq) > AGENT_RUNTIME_JOURNAL_LIMITS.maxSeq) {
    return { error: 'seq 必须是范围内的正整数' }
  }
  if (!AGENT_RUNTIME_JOURNAL_EVENT_KINDS.includes(record.kind as AgentRuntimeJournalEventEnvelope['kind'])) {
    return { error: '事件 kind 不受支持' }
  }
  if (typeof record.timestamp !== 'string' || record.timestamp.length > 64) return { error: 'timestamp 非法' }
  try {
    if (new Date(record.timestamp).toISOString() !== record.timestamp) return { error: 'timestamp 必须是标准 ISO 时间' }
  } catch {
    return { error: 'timestamp 必须是标准 ISO 时间' }
  }
  if (record.completionAnchor !== undefined
    && !validBoundedText(record.completionAnchor, AGENT_RUNTIME_JOURNAL_LIMITS.completionAnchorChars)) {
    return { error: 'completionAnchor 非法或超过限制' }
  }
  if (typeof record.checksum !== 'string' || !/^fnv1a32:[0-9a-f]{8}$/.test(record.checksum)) {
    return { error: 'checksum 格式非法' }
  }
  const payloadError = validatePayload(record.payload)
  if (payloadError) return { error: payloadError }
  const event = record as unknown as AgentRuntimeJournalEventEnvelope
  if (!verifyAgentRuntimeJournalEvent(event)) return { error: 'checksum 与事件内容不匹配' }
  return { event }
}

export function createAgentRuntimeJournalAppService(repository: Repository = agentRuntimeJournalRepository) {
  return {
    append(scope: Scope, routeRunIdValue: unknown, rawEvent: unknown) {
      if (!scope.userId || !scope.workspaceId) return fail(400, '缺少正式数据作用域')
      if (!validBoundedText(routeRunIdValue, AGENT_RUNTIME_JOURNAL_LIMITS.runIdChars)) return fail(400, 'runId 非法或超过限制')
      const validated = validateEvent(rawEvent, routeRunIdValue)
      if ('error' in validated) return fail(400, validated.error)
      const event = validated.event
      const existing = repository.findByRunSeq(scope.userId, scope.workspaceId, event.runId, event.seq)
      if (existing) {
        if (existing.checksum !== event.checksum) return fail(409, '同一 runId + seq 已存在不同 checksum 的事件')
        return { ok: true as const, status: 200, data: { event: existing, idempotent: true } }
      }
      try {
        const inserted = repository.append(scope.userId, scope.workspaceId, event)
        return { ok: true as const, status: 201, data: { event: inserted, idempotent: false } }
      } catch (error) {
        const raced = repository.findByRunSeq(scope.userId, scope.workspaceId, event.runId, event.seq)
        if (raced?.checksum === event.checksum) {
          return { ok: true as const, status: 200, data: { event: raced, idempotent: true } }
        }
        if (raced) return fail(409, '同一 runId + seq 已存在不同 checksum 的事件')
        throw error
      }
    },
    read(scope: Scope, runIdValue: unknown) {
      if (!scope.userId || !scope.workspaceId) return fail(400, '缺少正式数据作用域')
      if (!validBoundedText(runIdValue, AGENT_RUNTIME_JOURNAL_LIMITS.runIdChars)) return fail(400, 'runId 非法或超过限制')
      return {
        ok: true as const,
        status: 200,
        data: { events: repository.listByRun(scope.userId, scope.workspaceId, runIdValue) }
      }
    },
    list(scope: Scope, statusValue?: unknown, limitValue?: unknown) {
      if (!scope.userId || !scope.workspaceId) return fail(400, '缺少正式数据作用域')
      const status = parseRunStatus(statusValue)
      if (!status) return fail(400, 'status 只支持 incomplete、completed 或 all')
      const limit = parseListLimit(limitValue)
      if (!limit) return fail(400, `limit 必须是 1-${AGENT_RUNTIME_JOURNAL_LIMITS.maxListLimit} 的整数`)
      const summaries: AgentRuntimeJournalRunSummary[] = []
      for (const head of repository.listRecentRunHeads(scope.userId, scope.workspaceId, status, limit)) {
        try {
          const summary = buildRunSummary(
            head.runId,
            repository.listByRun(scope.userId, scope.workspaceId, head.runId)
          )
          if (!summary) continue
          if (status === 'incomplete' && summary.runCompleted) continue
          if (status === 'completed' && !summary.runCompleted) continue
          summaries.push(summary)
        } catch {
          // 单条持久记录损坏时不让整个发现接口失败；recover 校验不通过的 run 不进入结果。
        }
      }
      summaries.sort((left, right) => right.lastTimestamp.localeCompare(left.lastTimestamp)
        || right.lastSeq - left.lastSeq
        || left.runId.localeCompare(right.runId))
      return {
        ok: true as const,
        status: 200,
        data: { runs: summaries.slice(0, limit) }
      }
    }
  }
}

export const agentRuntimeJournalAppService = createAgentRuntimeJournalAppService()
