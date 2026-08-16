/**
 * 提调异步 Agent 事件收件箱。
 *
 * 这是运行时事实，不是世界剧情事实：事件持久在 localStorage，避免刷新、切会话或后台任务迟到时
 * 只靠内存碰运气；消费采用 claim -> ack，两步之间模型调用失败会 release，保证单次成功投递且可审计。
 */

import { getLocalWorkspaceStorageKey } from './localWorkspace'

export const DEFERRED_AGENT_EVENT_STORAGE_KEY = 'langhuan:deferred-agent-events:v1'

export type DeferredAgentEventStatus = 'pending' | 'claimed' | 'consumed' | 'failed'

export interface DeferredScriptwriterReport {
  confirmedFacts: Array<{ fact: string; evidence?: string }>
  candidateJudgments: Array<{ judgment: string; reason?: string; seedIds?: string[] }>
  suggestedActions: Array<{ action: string; reason?: string; seedIds?: string[] }>
}

export interface DeferredWorldEvolutionReport {
  effects: Array<{ seedId: string; summary: string; evidence?: string }>
}

export interface DeferredAgentEvent {
  id: string
  kind: 'scriptwriter_report' | 'world_evolution_report'
  sessionId: string
  originRunId: string
  sourceCallId: string
  payloadVersion: 1
  payload: DeferredScriptwriterReport | DeferredWorldEvolutionReport
  status: DeferredAgentEventStatus
  createdAt: number
  claimedAt?: number
  claimedByRunId?: string
  consumedAt?: number
  consumedByRunId?: string
  failedAt?: number
  error?: string
}

const ACTIVE_RUN_PREFIX = 'langhuan:deferred-agent-active-run:v1:'
const CLAIM_TTL_MS = 10 * 60 * 1000
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000
const MAX_EVENTS = 300

function storage(): Storage | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage } catch { return null }
}

function eventStorageKey(): string {
  return getLocalWorkspaceStorageKey(DEFERRED_AGENT_EVENT_STORAGE_KEY)
}

function activeRunStorageKey(sessionId: string): string {
  return getLocalWorkspaceStorageKey(`${ACTIVE_RUN_PREFIX}${sessionId}`)
}

function readAll(): DeferredAgentEvent[] {
  const raw = storage()?.getItem(eventStorageKey())
  if (!raw) return []
  try {
    const value = JSON.parse(raw)
    return Array.isArray(value) ? value.filter((item) => item && typeof item === 'object') : []
  } catch {
    return []
  }
}

function writeAll(events: DeferredAgentEvent[]): void {
  const target = storage()
  if (!target) return
  const now = Date.now()
  const retained = events
    .filter((event) => event.status === 'pending' || event.status === 'claimed' || now - Number(event.consumedAt || event.failedAt || event.createdAt) < RETENTION_MS)
    .slice(-MAX_EVENTS)
  target.setItem(eventStorageKey(), JSON.stringify(retained))
}

function makeEventId(): string {
  const random = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2)
  return `deferred_${Date.now()}_${random}`
}

export function enqueueDeferredScriptwriterReport(input: {
  sessionId: string
  originRunId: string
  sourceCallId: string
  payload: DeferredScriptwriterReport
}): DeferredAgentEvent {
  const event: DeferredAgentEvent = {
    id: makeEventId(),
    kind: 'scriptwriter_report',
    sessionId: String(input.sessionId || ''),
    originRunId: String(input.originRunId || ''),
    sourceCallId: String(input.sourceCallId || ''),
    payloadVersion: 1,
    payload: input.payload,
    status: 'pending',
    createdAt: Date.now()
  }
  writeAll([...readAll(), event])
  return event
}

export function enqueueDeferredWorldEvolutionReport(input: {
  sessionId: string
  originRunId: string
  sourceCallId: string
  payload: DeferredWorldEvolutionReport
}): DeferredAgentEvent {
  const event: DeferredAgentEvent = {
    id: makeEventId(),
    kind: 'world_evolution_report',
    sessionId: String(input.sessionId || ''),
    originRunId: String(input.originRunId || ''),
    sourceCallId: String(input.sourceCallId || ''),
    payloadVersion: 1,
    payload: input.payload,
    status: 'pending',
    createdAt: Date.now()
  }
  writeAll([...readAll(), event])
  return event
}

export function markDeferredAgentEventFailed(input: {
  sessionId: string
  originRunId: string
  sourceCallId: string
  error: string
}): void {
  const now = Date.now()
  const event: DeferredAgentEvent = {
    id: makeEventId(),
    kind: 'scriptwriter_report',
    sessionId: String(input.sessionId || ''),
    originRunId: String(input.originRunId || ''),
    sourceCallId: String(input.sourceCallId || ''),
    payloadVersion: 1,
    payload: { confirmedFacts: [], candidateJudgments: [], suggestedActions: [] },
    status: 'failed',
    createdAt: now,
    failedAt: now,
    error: String(input.error || '异步 Agent 未交稿')
  }
  writeAll([...readAll(), event])
}

export function activateDeferredAgentRun(sessionId: string, runId: string): void {
  storage()?.setItem(activeRunStorageKey(sessionId), runId)
}

export function closeDeferredAgentRun(sessionId: string, runId: string): void {
  const target = storage()
  const key = activeRunStorageKey(sessionId)
  if (target?.getItem(key) === runId) target.removeItem(key)
  releaseDeferredAgentEvents(sessionId, runId)
}

export function claimDeferredAgentEvents(sessionId: string, runId: string): DeferredAgentEvent[] {
  const target = storage()
  if (!target || target.getItem(activeRunStorageKey(sessionId)) !== runId) return []
  const now = Date.now()
  const events = readAll()
  const claimed: DeferredAgentEvent[] = []
  for (const event of events) {
    if (event.sessionId !== sessionId) continue
    const staleClaim = event.status === 'claimed' && now - Number(event.claimedAt || 0) >= CLAIM_TTL_MS
    if (event.status !== 'pending' && !staleClaim) continue
    event.status = 'claimed'
    event.claimedAt = now
    event.claimedByRunId = runId
    claimed.push({ ...event })
  }
  if (claimed.length) writeAll(events)
  return claimed
}

export function ackDeferredAgentEvents(sessionId: string, runId: string, eventIds: string[]): void {
  if (!eventIds.length) return
  const ids = new Set(eventIds)
  const now = Date.now()
  const events = readAll()
  for (const event of events) {
    if (event.sessionId !== sessionId || event.status !== 'claimed' || event.claimedByRunId !== runId || !ids.has(event.id)) continue
    event.status = 'consumed'
    event.consumedAt = now
    event.consumedByRunId = runId
  }
  writeAll(events)
}

export function releaseDeferredAgentEvents(sessionId: string, runId: string, eventIds?: string[]): void {
  const ids = eventIds ? new Set(eventIds) : null
  const events = readAll()
  let changed = false
  for (const event of events) {
    if (event.sessionId !== sessionId || event.status !== 'claimed' || event.claimedByRunId !== runId || (ids && !ids.has(event.id))) continue
    event.status = 'pending'
    delete event.claimedAt
    delete event.claimedByRunId
    changed = true
  }
  if (changed) writeAll(events)
}

export function listDeferredAgentEvents(sessionId: string): DeferredAgentEvent[] {
  return readAll().filter((event) => event.sessionId === sessionId).map((event) => ({ ...event }))
}

export function renderDeferredScriptwriterEvents(events: DeferredAgentEvent[]): string {
  if (!events.length) return ''
  const hasWorldEvolution = events.some((event) => event.kind === 'world_evolution_report')
  const sections = events.map((event, index) => {
    if (event.kind === 'world_evolution_report') {
      const payload = event.payload as DeferredWorldEvolutionReport
      const effects = (Array.isArray(payload.effects) ? payload.effects : [])
        .map((item) => `- ${item.summary}${item.evidence ? `（依据：${item.evidence}）` : ''}〔seedId: ${item.seedId}〕`)
      return [
        `### 世界后台演化 ${index + 1}（eventId=${event.id}）`,
        '这些变化已经写入世界真值，且与当前帷幕直接相关；请在本轮统筹时高优先处理，但不要强制生成旁白：',
        ...(effects.length ? effects : ['- 无'])
      ].join('\n')
    }
    const payload = event.payload as DeferredScriptwriterReport
    const facts = payload.confirmedFacts.map((item) => `- ${item.fact}${item.evidence ? `（依据：${item.evidence}）` : ''}`)
    const judgments = payload.candidateJudgments.map((item) => `- ${item.judgment}${item.reason ? `（理由：${item.reason}）` : ''}${item.seedIds?.length ? `〔seedIds: ${item.seedIds.join(', ')}〕` : ''}`)
    const actions = payload.suggestedActions.map((item) => `- ${item.action}${item.reason ? `（理由：${item.reason}）` : ''}${item.seedIds?.length ? `〔seedIds: ${item.seedIds.join(', ')}〕` : ''}`)
    return [
      `### 回报 ${index + 1}（eventId=${event.id}）`,
      '已确认事实（只能引用有依据且已经发生的内容）：',
      ...(facts.length ? facts : ['- 无']),
      '候选判断（不是事实，需由你复核）：',
      ...(judgments.length ? judgments : ['- 无']),
      '建议动作（不是已执行结果）：',
      ...(actions.length ? actions : ['- 无'])
    ].join('\n')
  })
  const heading = hasWorldEvolution ? '【异步 Agent 回报】' : '【异步编剧回报】'
  const closing = hasWorldEvolution
    ? '编剧候选不是事实；世界后台演化条目已经落账。请据当前轮次状态决定后续工具调用，不要把远处变化强塞成当前旁白。'
    : '这些回报刚刚到达。它们不是同步工具返回，也不得改写已经发生的事实；请据当前轮次状态决定是否调整后续工具调用。'
  return `${heading}\n${sections.join('\n\n')}\n\n${closing}`
}
