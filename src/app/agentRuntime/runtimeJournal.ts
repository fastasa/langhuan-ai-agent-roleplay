/** Append-only, provider-independent journal for the generic Agent runtime. */

export const AGENT_RUNTIME_JOURNAL_SCHEMA_VERSION = 1 as const

export const AGENT_RUNTIME_JOURNAL_EVENT_KINDS = [
  'run.started',
  'assistant.completed',
  'tool.started',
  'tool.completed',
  'tool.failed',
  'tool.timed_out',
  'semantic_compaction.created',
  'run.completed'
] as const

export type AgentRuntimeJournalEventKind = typeof AGENT_RUNTIME_JOURNAL_EVENT_KINDS[number]

export type JournalJsonValue =
  | null
  | boolean
  | number
  | string
  | JournalJsonValue[]
  | { [key: string]: JournalJsonValue }

export interface AgentRuntimeJournalEventEnvelope {
  schemaVersion: typeof AGENT_RUNTIME_JOURNAL_SCHEMA_VERSION
  runId: string
  seq: number
  kind: AgentRuntimeJournalEventKind
  timestamp: string
  /** Present on assistant/tool/run terminal events; safe to persist as a resume checkpoint. */
  completionAnchor?: string
  payload: { [key: string]: JournalJsonValue }
  checksum: string
}

export interface AgentRuntimeJournalAdapter {
  append: (event: AgentRuntimeJournalEventEnvelope) => void | Promise<void>
  /** Optional read side used only by explicit recovery/audit calls. Runtime never auto-resumes. */
  read?: (runId: string) => readonly AgentRuntimeJournalEventEnvelope[] | Promise<readonly AgentRuntimeJournalEventEnvelope[]>
}

/**
 * Thin bridge for an existing append/process-trace persistence sink. The runtime owns envelope
 * creation and ordering; the host only supplies where one complete envelope is stored/read.
 */
export function createAgentRuntimeJournalCallbackAdapter(input: {
  append: (event: AgentRuntimeJournalEventEnvelope) => void | Promise<void>
  read?: (runId: string) => readonly AgentRuntimeJournalEventEnvelope[] | Promise<readonly AgentRuntimeJournalEventEnvelope[]>
}): AgentRuntimeJournalAdapter {
  return {
    append: input.append,
    ...(input.read ? { read: input.read } : {})
  }
}

export interface AgentRuntimeJournalAppendFailure {
  runId: string
  seq: number
  kind: AgentRuntimeJournalEventKind
  checksum: string
  message: string
}

export interface AgentRuntimeJournalRecorder {
  append: (
    kind: AgentRuntimeJournalEventKind,
    payload?: Record<string, unknown>,
    options?: { completionAnchor?: boolean }
  ) => AgentRuntimeJournalEventEnvelope
  flush: () => Promise<void>
  snapshot: () => {
    runId: string
    lastSeq: number
    appendFailures: AgentRuntimeJournalAppendFailure[]
  }
}

function positiveInteger(value: unknown, fallback = 0): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : fallback
}

function snapshotJsonValue(value: unknown, seen = new WeakSet<object>()): JournalJsonValue {
  if (value == null) return null
  if (typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number') return Number.isFinite(value) ? value : String(value)
  if (typeof value === 'bigint') return value.toString()
  if (typeof value === 'undefined') return null
  if (typeof value === 'function' || typeof value === 'symbol') return `[unsupported:${typeof value}]`
  if (value instanceof Date) return value.toISOString()
  if (typeof value !== 'object') return String(value)
  if (seen.has(value)) return '[circular]'
  seen.add(value)
  if (Array.isArray(value)) {
    const out = value.map((item) => snapshotJsonValue(item, seen))
    seen.delete(value)
    return out
  }
  const out: Record<string, JournalJsonValue> = {}
  for (const key of Object.keys(value as Record<string, unknown>).sort(compareText)) {
    const member = (value as Record<string, unknown>)[key]
    if (typeof member === 'undefined') continue
    out[key] = snapshotJsonValue(member, seen)
  }
  seen.delete(value)
  return out
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function stableStringify(value: unknown): string {
  return JSON.stringify(snapshotJsonValue(value))
}

function fnv1a32(text: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

function checksumCore(
  event: Omit<AgentRuntimeJournalEventEnvelope, 'checksum'>
): string {
  return `fnv1a32:${fnv1a32(stableStringify(event))}`
}

export function createAgentRuntimeJournalEvent(input: {
  runId: string
  seq: number
  kind: AgentRuntimeJournalEventKind
  timestamp: string
  payload?: Record<string, unknown>
  completionAnchor?: boolean
}): AgentRuntimeJournalEventEnvelope {
  const runId = String(input.runId || '').trim()
  if (!runId) throw new Error('Agent runtime journal 需要非空 runId')
  const seq = positiveInteger(input.seq)
  if (!seq) throw new Error('Agent runtime journal 需要正整数 seq')
  const base: Omit<AgentRuntimeJournalEventEnvelope, 'checksum'> = {
    schemaVersion: AGENT_RUNTIME_JOURNAL_SCHEMA_VERSION,
    runId,
    seq,
    kind: input.kind,
    timestamp: new Date(input.timestamp).toISOString(),
    ...(input.completionAnchor ? { completionAnchor: `${runId}:${seq}:${input.kind}` } : {}),
    payload: snapshotJsonValue(input.payload ?? {}) as { [key: string]: JournalJsonValue }
  }
  return { ...base, checksum: checksumCore(base) }
}

export function verifyAgentRuntimeJournalEvent(event: AgentRuntimeJournalEventEnvelope): boolean {
  if (!event || event.schemaVersion !== AGENT_RUNTIME_JOURNAL_SCHEMA_VERSION) return false
  if (!AGENT_RUNTIME_JOURNAL_EVENT_KINDS.includes(event.kind)) return false
  if (!String(event.runId || '').trim() || positiveInteger(event.seq) !== event.seq) return false
  const { checksum, ...base } = event
  return checksum === checksumCore(base)
}

export function createAgentRuntimeJournalRecorder(input: {
  runId: string
  adapter: AgentRuntimeJournalAdapter
  initialSeq?: number
  now?: () => string | number | Date
  onAppendFailure?: (failure: AgentRuntimeJournalAppendFailure) => void
}): AgentRuntimeJournalRecorder {
  const runId = String(input.runId || '').trim()
  if (!runId) throw new Error('Agent runtime journal recorder 需要非空 runId')
  let seq = positiveInteger(input.initialSeq)
  let pending = Promise.resolve()
  const appendFailures: AgentRuntimeJournalAppendFailure[] = []

  const append: AgentRuntimeJournalRecorder['append'] = (kind, payload = {}, options = {}) => {
    seq += 1
    const nowValue = input.now?.() ?? Date.now()
    const event = createAgentRuntimeJournalEvent({
      runId,
      seq,
      kind,
      timestamp: nowValue instanceof Date ? nowValue.toISOString() : new Date(nowValue).toISOString(),
      payload,
      completionAnchor: options.completionAnchor === true
    })
    pending = pending
      .then(() => input.adapter.append(event))
      .catch((error) => {
        const failure: AgentRuntimeJournalAppendFailure = {
          runId,
          seq: event.seq,
          kind: event.kind,
          checksum: event.checksum,
          message: error instanceof Error ? error.message : String(error)
        }
        appendFailures.push(failure)
        try {
          input.onAppendFailure?.(failure)
        } catch {
          // Journal diagnostics are fail-soft too; they can never terminate the primary Agent run.
        }
      })
    return event
  }

  return {
    append,
    flush: async () => { await pending },
    snapshot: () => ({
      runId,
      lastSeq: seq,
      appendFailures: appendFailures.map((failure) => ({ ...failure }))
    })
  }
}

export interface RecoveredJournalToolState {
  callId: string
  toolName: string
  startedSeq: number
  terminalSeq: number | null
  status: 'pending' | 'completed' | 'failed' | 'timed_out'
  outcomeUnknown: boolean
  mayHaveSideEffects: boolean
  completionAnchor: string | null
  /** Recovery is audit-only. The runtime never replays a recovered call automatically. */
  autoReplayAllowed: false
}

export interface AgentRuntimeJournalRecovery {
  schemaVersion: typeof AGENT_RUNTIME_JOURNAL_SCHEMA_VERSION
  runId: string | null
  lastSeq: number
  runCompleted: boolean
  terminalReason: string | null
  runMetadata: JournalJsonValue | null
  completionAnchors: string[]
  semanticCompactions: JournalJsonValue[]
  tools: RecoveredJournalToolState[]
  pendingTools: RecoveredJournalToolState[]
  outcomeUnknownTools: RecoveredJournalToolState[]
  rejectedEvents: Array<{ index: number; reason: string }>
  /** Explicit safety contract: callers may inspect and reconcile, never blindly replay. */
  autoReplayAllowed: false
}

function journalText(payload: Record<string, JournalJsonValue>, key: string): string {
  return typeof payload[key] === 'string' ? payload[key] as string : ''
}

function journalBoolean(payload: Record<string, JournalJsonValue>, key: string): boolean {
  return payload[key] === true
}

export function recoverAgentRuntimeJournal(
  events: readonly AgentRuntimeJournalEventEnvelope[],
  expectedRunId?: string
): AgentRuntimeJournalRecovery {
  const tools = new Map<string, RecoveredJournalToolState>()
  const rejectedEvents: Array<{ index: number; reason: string }> = []
  const completionAnchors: string[] = []
  const normalizedExpectedRunId = String(expectedRunId || '').trim()
  let runId: string | null = normalizedExpectedRunId || null
  let lastSeq = 0
  let runCompleted = false
  let terminalReason: string | null = null
  let runMetadata: JournalJsonValue | null = null
  const semanticCompactions: JournalJsonValue[] = []

  events.forEach((event, index) => {
    if (!verifyAgentRuntimeJournalEvent(event)) {
      rejectedEvents.push({ index, reason: 'checksum-or-schema-invalid' })
      return
    }
    if (runId && event.runId !== runId) {
      rejectedEvents.push({ index, reason: 'run-id-mismatch' })
      return
    }
    if (event.seq <= lastSeq) {
      rejectedEvents.push({ index, reason: 'non-monotonic-seq' })
      return
    }
    runId = event.runId
    lastSeq = event.seq
    if (event.completionAnchor) completionAnchors.push(event.completionAnchor)
    if (event.kind === 'run.started' && event.payload.metadata != null) {
      runMetadata = snapshotJsonValue(event.payload.metadata)
    }
    if (event.kind === 'run.completed') {
      runCompleted = true
      terminalReason = journalText(event.payload, 'terminalReason') || null
    }
    if (event.kind === 'semantic_compaction.created' && event.payload.record != null) {
      semanticCompactions.push(snapshotJsonValue(event.payload.record))
    }
    if (event.kind === 'tool.started') {
      const callId = journalText(event.payload, 'callId')
      const toolName = journalText(event.payload, 'toolName')
      if (!callId || !toolName) return
      tools.set(callId, {
        callId,
        toolName,
        startedSeq: event.seq,
        terminalSeq: null,
        status: 'pending',
        outcomeUnknown: journalBoolean(event.payload, 'mayHaveSideEffects'),
        mayHaveSideEffects: journalBoolean(event.payload, 'mayHaveSideEffects'),
        completionAnchor: null,
        autoReplayAllowed: false
      })
      return
    }
    if (
      event.kind !== 'tool.completed'
      && event.kind !== 'tool.failed'
      && event.kind !== 'tool.timed_out'
    ) return
    const callId = journalText(event.payload, 'callId')
    const toolName = journalText(event.payload, 'toolName')
    if (!callId || !toolName) return
    const prior = tools.get(callId)
    const status = event.kind === 'tool.completed'
      ? 'completed'
      : event.kind === 'tool.timed_out'
        ? 'timed_out'
        : 'failed'
    tools.set(callId, {
      callId,
      toolName,
      startedSeq: prior?.startedSeq ?? event.seq,
      terminalSeq: event.seq,
      status,
      outcomeUnknown: journalBoolean(event.payload, 'outcomeUnknown'),
      mayHaveSideEffects: prior?.mayHaveSideEffects ?? journalBoolean(event.payload, 'mayHaveSideEffects'),
      completionAnchor: event.completionAnchor ?? null,
      autoReplayAllowed: false
    })
  })

  const toolStates = Array.from(tools.values()).sort((left, right) => left.startedSeq - right.startedSeq)
  return {
    schemaVersion: AGENT_RUNTIME_JOURNAL_SCHEMA_VERSION,
    runId,
    lastSeq,
    runCompleted,
    terminalReason,
    runMetadata,
    completionAnchors,
    semanticCompactions,
    tools: toolStates.map((tool) => ({ ...tool })),
    pendingTools: toolStates.filter((tool) => tool.status === 'pending').map((tool) => ({ ...tool })),
    outcomeUnknownTools: toolStates.filter((tool) => tool.outcomeUnknown).map((tool) => ({ ...tool })),
    rejectedEvents,
    autoReplayAllowed: false
  }
}

export async function recoverAgentRuntimeJournalFromAdapter(
  adapter: AgentRuntimeJournalAdapter,
  runId: string
): Promise<AgentRuntimeJournalRecovery> {
  if (!adapter.read) throw new Error('当前 Agent runtime journal adapter 不支持 read')
  const events = await adapter.read(runId)
  return recoverAgentRuntimeJournal(events, runId)
}
