import type { AgentRuntimeHistoryMessage, ToolCallMessage, ToolResultMessage } from './types'

export const AGENT_SEMANTIC_COMPACTION_SCHEMA_VERSION = 1 as const

export interface SemanticCompactionPressureSnapshot {
  projectedTokens: number
  pressureTokens: number
  pressureRatio: number
  contextWindowTokens: number
  thresholdTokens: number
  source: 'provider-anchor' | 'local-estimate'
}

export interface SemanticCompactionUnresolvedTool {
  callId: string
  toolName: string
  stage: string
  requestedAtTurn: number
  outcomeUnknown: boolean
  autoReplayAllowed: false
}

export interface SemanticCompactionRecord {
  schemaVersion: typeof AGENT_SEMANTIC_COMPACTION_SCHEMA_VERSION
  id: string
  runId: string
  createdAt: string
  reason: 'context-pressure'
  goal: string
  goalSource: 'provided' | 'first-user-message' | 'unavailable'
  keyConclusions: string[]
  conclusionSource: 'provided' | 'assistant-history' | 'unavailable'
  unresolvedTools: SemanticCompactionUnresolvedTool[]
  recentTailAnchor: {
    startIndex: number
    endIndex: number
    itemCount: number
    checksum: string
    kinds: string[]
  }
  pressure: SemanticCompactionPressureSnapshot
  fullHistoryRetained: true
  injectedIntoPrompt: false
}

function compactText(value: unknown, maxChars = 2000): string {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim()
  if (text.length <= maxChars) return text
  return `${text.slice(0, maxChars)}…`
}

function firstUserGoal(history: readonly AgentRuntimeHistoryMessage[]): string {
  for (const item of history) {
    if (item.kind === 'chat' && item.role === 'user') return compactText(item.content)
  }
  return ''
}

function assistantConclusions(history: readonly AgentRuntimeHistoryMessage[]): string[] {
  const conclusions: string[] = []
  for (let index = history.length - 1; index >= 0 && conclusions.length < 5; index -= 1) {
    const item = history[index]
    if (item.kind !== 'modelMessage') continue
    const text = compactText(item.content)
    if (text && !conclusions.includes(text)) conclusions.unshift(text)
  }
  return conclusions
}

function unresolvedTools(
  history: readonly AgentRuntimeHistoryMessage[],
  sideEffectToolNames: ReadonlySet<string>
): SemanticCompactionUnresolvedTool[] {
  const calls = new Map<string, ToolCallMessage>()
  const resolved = new Set<string>()
  for (const item of history) {
    if (item.kind === 'toolCall') calls.set(item.callId, item)
    if (item.kind === 'toolResult') resolved.add(item.callId)
  }
  return Array.from(calls.values())
    .filter((call) => !resolved.has(call.callId))
    .map((call) => ({
      callId: call.callId,
      toolName: call.toolName,
      stage: String(call.stage || ''),
      requestedAtTurn: call.requestedAtTurn,
      outcomeUnknown: sideEffectToolNames.has(call.toolName),
      autoReplayAllowed: false as const
    }))
}

function historyKind(item: AgentRuntimeHistoryMessage): string {
  if (item.kind === 'chat') return `chat:${item.role}`
  if (item.kind === 'modelMessage') return 'assistant'
  if (item.kind === 'toolCall') return `tool-call:${item.toolName}`
  if (item.kind === 'toolResult') return `tool-result:${item.toolName}:${item.status}`
  return item.kind
}

function fnv1a32(text: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

function tailFingerprint(item: AgentRuntimeHistoryMessage): unknown {
  if (item.kind === 'chat') return { kind: item.kind, role: item.role, content: item.content }
  if (item.kind === 'modelMessage') return { kind: item.kind, role: item.role, content: item.content }
  if (item.kind === 'toolCall') {
    return {
      kind: item.kind,
      callId: item.callId,
      toolName: item.toolName,
      argKeys: Object.keys(item.args ?? {}).sort()
    }
  }
  if (item.kind === 'toolResult') {
    return {
      kind: item.kind,
      callId: item.callId,
      toolName: item.toolName,
      status: item.status,
      content: item.content
    }
  }
  return { kind: item.kind, id: 'id' in item ? item.id : '' }
}

export function buildSemanticCompactionRecord(input: {
  runId: string
  history: readonly AgentRuntimeHistoryMessage[]
  pressure: SemanticCompactionPressureSnapshot
  goal?: string
  keyConclusions?: readonly string[]
  sideEffectToolNames?: ReadonlySet<string>
  recentTailItems?: number
  now?: string | number | Date
}): SemanticCompactionRecord {
  const runId = String(input.runId || '').trim() || 'untracked-run'
  const providedGoal = compactText(input.goal)
  const inferredGoal = providedGoal ? '' : firstUserGoal(input.history)
  const goal = providedGoal || inferredGoal
  const suppliedConclusions = (input.keyConclusions ?? []).map((item) => compactText(item)).filter(Boolean)
  const inferredConclusions = suppliedConclusions.length ? [] : assistantConclusions(input.history)
  const keyConclusions = suppliedConclusions.length ? suppliedConclusions : inferredConclusions
  const recentTailItems = Number.isFinite(input.recentTailItems) && Number(input.recentTailItems) > 0
    ? Math.trunc(Number(input.recentTailItems))
    : 12
  const startIndex = Math.max(0, input.history.length - recentTailItems)
  const tail = input.history.slice(startIndex)
  const tailChecksum = `fnv1a32:${fnv1a32(JSON.stringify(tail.map(tailFingerprint)))}`
  const nowValue = input.now ?? Date.now()
  const createdAt = new Date(nowValue).toISOString()

  return {
    schemaVersion: AGENT_SEMANTIC_COMPACTION_SCHEMA_VERSION,
    id: `semantic-compaction:${runId}:${input.history.length}:${tailChecksum.slice(-8)}`,
    runId,
    createdAt,
    reason: 'context-pressure',
    goal,
    goalSource: providedGoal ? 'provided' : inferredGoal ? 'first-user-message' : 'unavailable',
    keyConclusions,
    conclusionSource: suppliedConclusions.length
      ? 'provided'
      : inferredConclusions.length
        ? 'assistant-history'
        : 'unavailable',
    unresolvedTools: unresolvedTools(input.history, input.sideEffectToolNames ?? new Set()),
    recentTailAnchor: {
      startIndex,
      endIndex: Math.max(-1, input.history.length - 1),
      itemCount: tail.length,
      checksum: tailChecksum,
      kinds: tail.map(historyKind)
    },
    pressure: { ...input.pressure },
    fullHistoryRetained: true,
    injectedIntoPrompt: false
  }
}

/** Helper for callers recovering an unfinished in-memory transcript without replaying it. */
export function listUnresolvedHistoryTools(
  history: readonly AgentRuntimeHistoryMessage[],
  sideEffectToolNames: ReadonlySet<string> = new Set()
): SemanticCompactionUnresolvedTool[] {
  return unresolvedTools(history, sideEffectToolNames)
}

/** Narrow helper used by journal mapping without importing runtime implementation details. */
export function toolResultOutcomeUnknown(result: ToolResultMessage): boolean {
  return result.details?.outcomeUnknown === true || result.error?.details?.outcomeUnknown === true
}
