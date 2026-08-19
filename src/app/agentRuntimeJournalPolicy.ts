import type { RunAgentRuntimeInput } from './agentRuntime/runtime'
import type {
  AgentRuntimeJournalAdapter,
  AgentRuntimeJournalEventEnvelope
} from './agentRuntime/runtimeJournal'
import { preparePersistedAgentRuntimeJournal } from '../repositories/agentRuntimeJournalRepository'

type FetchLike = typeof fetch
export type AgentRuntimeJournalConfig = NonNullable<RunAgentRuntimeInput['journal']>

const MAX_PERSISTED_RUN_ID_CHARS = 240
const MAX_GENERATED_RUN_ID_CHARS = 220
const DEFAULT_REQUEST_TIMEOUT_MS = 2_000

export interface AgentRuntimeJournalDigests {
  /** 只能透传调用方已经持有的值；本模块不会从 Prompt 正文重新计算。 */
  personaDigest?: unknown
  promptSupplyDigest?: unknown
  toolCatalogDigest?: unknown
}

export type AgentRuntimeJournalPreparationAudit = {
  status: 'enabled' | 'disabled-test' | 'prepare-failed' | 'append-failed'
  stage: 'test-guard' | 'prepare' | 'append'
  runId: string
  profileId: string
  runtimeVersion: string
  message?: string
}

export interface PrepareAgentRuntimeJournalForHarnessInput {
  profileId: string
  runtimeVersion: string
  /** 现有 session/director/subagent/task/speaker 标识；只用于可读寻址，不进入 Prompt。 */
  traceIds?: readonly unknown[]
  /** grace 等从主 runId 派生的独立逻辑运行可显式传入。 */
  runId?: string
  /** 仅供确定性测试；正式路径缺省使用 crypto.randomUUID。 */
  uniqueToken?: string
  digests?: AgentRuntimeJournalDigests
  fetchImpl?: FetchLike
  appendRetries?: number
  requestTimeoutMs?: number
  onAudit?: (audit: AgentRuntimeJournalPreparationAudit) => void
}

export interface PreparedAgentRuntimeJournalForHarness {
  /** 即使测试禁用或准备失败也返回，供 semanticCompaction 使用同一运行身份。 */
  runId: string
  journal?: AgentRuntimeJournalConfig
  audit: AgentRuntimeJournalPreparationAudit
}

let fallbackUniqueCounter = 0

function text(value: unknown): string {
  return String(value ?? '').trim()
}

function readableRunIdPart(value: unknown, maxChars = 48): string {
  return text(value)
    .replace(/\s+/g, '-')
    .replace(/[^\p{L}\p{N}._-]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxChars)
}

function uniqueToken(): string {
  try {
    const value = globalThis.crypto?.randomUUID?.()
    if (value) return value
  } catch {
    /* fall through to a process-local emergency token */
  }
  fallbackUniqueCounter += 1
  return `${Date.now().toString(36)}-${fallbackUniqueCounter.toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export function buildAgentRuntimeJournalRunId(
  input: Pick<PrepareAgentRuntimeJournalForHarnessInput, 'profileId' | 'runtimeVersion' | 'traceIds' | 'runId' | 'uniqueToken'>
): string {
  const explicit = text(input.runId)
  if (explicit) {
    if (explicit.length > MAX_PERSISTED_RUN_ID_CHARS) {
      throw new Error(`Agent runtime journal runId 超过 ${MAX_PERSISTED_RUN_ID_CHARS} 字符`)
    }
    return explicit
  }

  const suffix = readableRunIdPart(input.uniqueToken, 64) || uniqueToken()
  const prefixParts = [
    'agent-runtime',
    readableRunIdPart(input.profileId),
    readableRunIdPart(input.runtimeVersion),
    ...(input.traceIds || []).map((value) => readableRunIdPart(value)).filter(Boolean)
  ].filter(Boolean)
  const prefixBudget = Math.max(1, MAX_GENERATED_RUN_ID_CHARS - suffix.length - 1)
  const prefix = prefixParts.join(':').slice(0, prefixBudget).replace(/[:._-]+$/g, '') || 'agent-runtime'
  return `${prefix}:${suffix}`
}

function digest(value: unknown): string | undefined {
  const normalized = text(value)
  return normalized || undefined
}

function buildMetadata(input: PrepareAgentRuntimeJournalForHarnessInput): Record<string, unknown> {
  const personaDigest = digest(input.digests?.personaDigest)
  const promptSupplyDigest = digest(input.digests?.promptSupplyDigest)
  const toolCatalogDigest = digest(input.digests?.toolCatalogDigest)
  return {
    profileId: text(input.profileId),
    runtimeVersion: text(input.runtimeVersion),
    ...(personaDigest ? { personaDigest } : {}),
    ...(promptSupplyDigest ? { promptSupplyDigest } : {}),
    ...(toolCatalogDigest ? { toolCatalogDigest } : {})
  }
}

function emitAudit(
  input: PrepareAgentRuntimeJournalForHarnessInput,
  audit: AgentRuntimeJournalPreparationAudit,
  warn = false
): void {
  try {
    input.onAudit?.(audit)
  } catch {
    /* journal diagnostics must never break the primary Agent */
  }
  if (warn) console.warn('[agent-runtime-journal] 持久化已降级，不影响本次 Agent 任务', audit)
}

function timedFetch(request: FetchLike, timeoutMs: number): FetchLike {
  return (async (resource: RequestInfo | URL, init?: RequestInit) => {
    const controller = new AbortController()
    const timeout = globalThis.setTimeout(() => controller.abort(), timeoutMs)
    try {
      return await request(resource, { ...(init || {}), signal: controller.signal })
    } finally {
      globalThis.clearTimeout(timeout)
    }
  }) as FetchLike
}

function circuitBreakingAdapter(
  adapter: AgentRuntimeJournalAdapter,
  input: PrepareAgentRuntimeJournalForHarnessInput,
  runId: string
): AgentRuntimeJournalAdapter {
  let appendDisabled = false
  return {
    async append(event: AgentRuntimeJournalEventEnvelope) {
      if (appendDisabled) return
      try {
        await adapter.append(event)
      } catch (error) {
        appendDisabled = true
        const audit: AgentRuntimeJournalPreparationAudit = {
          status: 'append-failed',
          stage: 'append',
          runId,
          profileId: text(input.profileId),
          runtimeVersion: text(input.runtimeVersion),
          message: error instanceof Error ? error.message : String(error)
        }
        emitAudit(input, audit, true)
        // 首次失败仍交给 runtime recorder 生成 journal-error；runtime 本身是 fail-soft。
        throw error
      }
    },
    ...(adapter.read ? { read: adapter.read.bind(adapter) } : {})
  }
}

/**
 * 正式 Harness 的 journal 门面：只装配运行时持久配置，不读写或改写任何 Prompt。
 * 测试环境若未显式注入 fetch，会直接禁用，避免 jsdom/Node 对相对 URL 发起真实请求。
 */
export async function prepareAgentRuntimeJournalForHarness(
  input: PrepareAgentRuntimeJournalForHarnessInput
): Promise<PreparedAgentRuntimeJournalForHarness> {
  const runId = buildAgentRuntimeJournalRunId(input)
  const baseAudit = {
    runId,
    profileId: text(input.profileId),
    runtimeVersion: text(input.runtimeVersion)
  }
  if (import.meta.env.MODE === 'test' && !input.fetchImpl) {
    const audit: AgentRuntimeJournalPreparationAudit = {
      ...baseAudit,
      status: 'disabled-test',
      stage: 'test-guard'
    }
    emitAudit(input, audit)
    return { runId, audit }
  }

  try {
    const request = timedFetch(
      input.fetchImpl || fetch,
      Math.max(100, Math.trunc(Number(input.requestTimeoutMs) || DEFAULT_REQUEST_TIMEOUT_MS))
    )
    const binding = await preparePersistedAgentRuntimeJournal({
      runId,
      mode: 'fresh',
      metadata: buildMetadata(input),
      fetchImpl: request,
      ...(input.appendRetries == null ? {} : { appendRetries: input.appendRetries })
    })
    const audit: AgentRuntimeJournalPreparationAudit = {
      ...baseAudit,
      status: 'enabled',
      stage: 'prepare'
    }
    emitAudit(input, audit)
    return {
      runId,
      journal: {
        runId,
        adapter: circuitBreakingAdapter(binding.adapter, input, runId),
        initialSeq: binding.initialSeq,
        metadata: binding.metadata
      },
      audit
    }
  } catch (error) {
    const audit: AgentRuntimeJournalPreparationAudit = {
      ...baseAudit,
      status: 'prepare-failed',
      stage: 'prepare',
      message: error instanceof Error ? error.message : String(error)
    }
    emitAudit(input, audit, true)
    return { runId, audit }
  }
}
