import type {
  AgentRuntimeJournalAdapter,
  AgentRuntimeJournalRecovery,
  AgentRuntimeJournalEventEnvelope,
  RecoveredJournalToolState
} from '../app/agentRuntime/runtimeJournal'
import type { RunAgentRuntimeInput } from '../app/agentRuntime/runtime'
import {
  recoverAgentRuntimeJournal,
  verifyAgentRuntimeJournalEvent
} from '../app/agentRuntime/runtimeJournal'
import { API } from '../config/api'

type FetchLike = typeof fetch

export type PersistedAgentRuntimeJournalBinding = NonNullable<RunAgentRuntimeInput['journal']> & {
  initialSeq: number
  metadata: Record<string, unknown>
  /** 仅供显式恢复审计；不得据此自动重放工具。 */
  recovery: AgentRuntimeJournalRecovery | null
}

export type PersistedAgentRuntimeJournalRunStatus = 'incomplete' | 'completed' | 'all'

export interface PersistedAgentRuntimeJournalRunSummary {
  runId: string
  lastSeq: number
  lastTimestamp: string
  profileId: string | null
  runtimeVersion: string | null
  runCompleted: boolean
  pendingTools: RecoveredJournalToolState[]
  outcomeUnknownTools: RecoveredJournalToolState[]
  autoReplayAllowed: false
}

async function readError(response: Response, fallback: string): Promise<string> {
  try {
    const data = await response.json() as { error?: unknown }
    return String(data?.error || fallback)
  } catch {
    return fallback
  }
}

function parseRunSummary(value: unknown): PersistedAgentRuntimeJournalRunSummary | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  if (typeof record.runId !== 'string' || !record.runId.trim()) return null
  if (!Number.isInteger(record.lastSeq) || Number(record.lastSeq) <= 0) return null
  if (typeof record.lastTimestamp !== 'string' || !record.lastTimestamp) return null
  if (record.profileId !== null && typeof record.profileId !== 'string') return null
  if (record.runtimeVersion !== null && typeof record.runtimeVersion !== 'string') return null
  if (typeof record.runCompleted !== 'boolean') return null
  if (!Array.isArray(record.pendingTools) || !Array.isArray(record.outcomeUnknownTools)) return null
  if (record.autoReplayAllowed !== false) return null
  return {
    runId: record.runId,
    lastSeq: Number(record.lastSeq),
    lastTimestamp: record.lastTimestamp,
    profileId: record.profileId as string | null,
    runtimeVersion: record.runtimeVersion as string | null,
    runCompleted: record.runCompleted,
    pendingTools: record.pendingTools as unknown as RecoveredJournalToolState[],
    outcomeUnknownTools: record.outcomeUnknownTools as unknown as RecoveredJournalToolState[],
    autoReplayAllowed: false
  }
}

/** 只读发现最近 journal；返回值仅供恢复审计，不会自动重放任何工具。 */
export async function listPersistedAgentRuntimeJournalRuns(options: {
  status?: PersistedAgentRuntimeJournalRunStatus
  limit?: number
  fetchImpl?: FetchLike
} = {}): Promise<PersistedAgentRuntimeJournalRunSummary[]> {
  const request = options.fetchImpl || fetch
  const query = new URLSearchParams()
  query.set('status', options.status || 'incomplete')
  if (options.limit !== undefined) query.set('limit', String(options.limit))
  const response = await request(`${API.agentRuntimeJournalRuns}?${query.toString()}`)
  if (!response.ok) throw new Error(await readError(response, '读取 Agent runtime journal 运行列表失败'))
  const data = await response.json() as { runs?: unknown }
  if (!Array.isArray(data.runs)) throw new Error('Agent runtime journal 运行列表响应缺少 runs 数组')
  const runs = data.runs.map(parseRunSummary)
  if (runs.some((run) => !run)) throw new Error('Agent runtime journal 运行列表包含无效摘要')
  return runs as PersistedAgentRuntimeJournalRunSummary[]
}

/** 可直接传给 RunAgentRuntimeInput.journal；运行时仍只负责事件生成与顺序。 */
export function createPersistedAgentRuntimeJournalAdapter(options: {
  fetchImpl?: FetchLike
  /** 网络中断或 5xx 的额外重试次数；同 envelope 重发由服务端 checksum 幂等保护。 */
  appendRetries?: number
} = {}): AgentRuntimeJournalAdapter {
  const request = options.fetchImpl || fetch
  const appendRetries = Number.isInteger(options.appendRetries) && Number(options.appendRetries) >= 0
    ? Math.min(3, Number(options.appendRetries))
    : 1
  return {
    async append(event: AgentRuntimeJournalEventEnvelope) {
      const url = API.agentRuntimeJournalEvents(event.runId)
      const init = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(event)
      }
      let lastNetworkError: unknown = null
      for (let attempt = 0; attempt <= appendRetries; attempt += 1) {
        let response: Response
        try {
          response = await request(url, init)
        } catch (error) {
          lastNetworkError = error
          if (attempt < appendRetries) continue
          throw error
        }
        if (response.ok) return
        if (response.status >= 500 && attempt < appendRetries) continue
        throw new Error(await readError(response, '持久化 Agent runtime journal 失败'))
      }
      throw lastNetworkError || new Error('持久化 Agent runtime journal 失败')
    },
    async read(runId: string) {
      const response = await request(API.agentRuntimeJournalEvents(runId))
      if (!response.ok) throw new Error(await readError(response, '读取 Agent runtime journal 失败'))
      const data = await response.json() as { events?: unknown }
      if (!Array.isArray(data.events)) throw new Error('Agent runtime journal 响应缺少 events 数组')
      const events = data.events as AgentRuntimeJournalEventEnvelope[]
      if (events.some((event) => event.runId !== runId || !verifyAgentRuntimeJournalEvent(event))) {
        throw new Error('Agent runtime journal 响应包含无效事件')
      }
      return events
    }
  }
}

/**
 * 为 Harness 准备可直接传给 RunAgentRuntimeInput.journal 的绑定。
 * fresh 会确认 runId 尚无事件；resume 会从持久层恢复 lastSeq，但不会恢复消息或重放工具。
 */
export async function preparePersistedAgentRuntimeJournal(input: {
  runId: string
  mode?: 'fresh' | 'resume'
  metadata?: Record<string, unknown>
  fetchImpl?: FetchLike
  appendRetries?: number
}): Promise<PersistedAgentRuntimeJournalBinding> {
  const runId = String(input.runId || '').trim()
  if (!runId) throw new Error('准备 Agent runtime journal 需要非空 runId')
  const adapter = createPersistedAgentRuntimeJournalAdapter({
    ...(input.fetchImpl ? { fetchImpl: input.fetchImpl } : {}),
    ...(input.appendRetries == null ? {} : { appendRetries: input.appendRetries })
  })
  const events = await adapter.read!(runId)
  const mode = input.mode === 'resume' ? 'resume' : 'fresh'
  if (mode === 'fresh' && events.length > 0) {
    throw new Error(`Agent runtime journal runId 已存在，fresh 运行必须使用新的 runId：${runId}`)
  }
  if (mode === 'resume' && events.length === 0) {
    throw new Error(`Agent runtime journal 不存在，不能恢复：${runId}`)
  }
  const recovery = mode === 'resume' ? recoverAgentRuntimeJournal(events, runId) : null
  if (recovery?.runCompleted) {
    throw new Error(`Agent runtime journal 已完成，不能继续追加运行：${runId}`)
  }
  return Object.freeze({
    runId,
    adapter,
    initialSeq: recovery?.lastSeq || 0,
    metadata: Object.freeze({ ...(input.metadata || {}) }),
    recovery
  })
}
