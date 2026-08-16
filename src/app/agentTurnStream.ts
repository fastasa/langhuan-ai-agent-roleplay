/**
 * Agent 对话信息流唯一协议与状态机。
 *
 * 行为以星依浮坞 2026-07-13 现役 turn stream 为权威抽取：模型轮、工具开始/落定、耗时、
 * 停止收束、回复收编和历史回放都走本模块。它只记录运行过程，不承载任何业务事实。
 */
import { reactive } from 'vue'
import type { AgentRuntimeProgressEvent } from './agentRuntime/runtime'

export interface AgentTurnStreamEntry {
  kind: 'turn' | 'tool'
  label: string
  detail?: string
  status?: 'success' | 'error'
  at: number
  durationMs?: number
}

export interface AgentTurnStreamState {
  running: boolean
  entries: AgentTurnStreamEntry[]
  /** 状态机内部游标；属于运行真值，不进入消息持久化。 */
  lastTurnIndex: number
}

export interface AgentTurnStreamController {
  state: AgentTurnStreamState
  begin(): void
  end(): void
  clear(): void
  drain(): AgentTurnStreamEntry[]
  markTurnIfNew(turnIndex: number): void
  append(entry: Omit<AgentTurnStreamEntry, 'at'>): void
  settleTool(toolName: string, status: 'success' | 'error'): void
  settleAllOpen(status: 'success' | 'error'): void
  feedProgress(event: AgentRuntimeProgressEvent): void
  trackModelCall<T>(turnIndex: number, call: () => Promise<T>): Promise<T>
}

export const AGENT_TURN_STREAM_MODEL_THINKING_LABEL = '模型思考'
export const AGENT_TURN_STREAM_MAX_ENTRIES = 80

export function createAgentTurnStreamState(): AgentTurnStreamState {
  return reactive({ running: false, entries: [], lastTurnIndex: -1 }) as AgentTurnStreamState
}

export function createAgentTurnStreamController(
  state: AgentTurnStreamState = createAgentTurnStreamState()
): AgentTurnStreamController {
  function backfillOpenTurnDuration(now: number): void {
    for (let index = state.entries.length - 1; index >= 0; index -= 1) {
      const item = state.entries[index]
      if (item.kind !== 'turn') continue
      if (item.durationMs === undefined) {
        state.entries[index] = { ...item, durationMs: Math.max(0, now - item.at) }
      }
      return
    }
  }

  function pushEntry(entry: Omit<AgentTurnStreamEntry, 'at'>): void {
    const now = Date.now()
    if (entry.kind === 'turn') backfillOpenTurnDuration(now)
    state.entries.push({ ...entry, at: now })
    const overflow = state.entries.length - AGENT_TURN_STREAM_MAX_ENTRIES
    if (overflow > 0) state.entries.splice(0, overflow)
  }

  function begin(): void {
    state.entries.splice(0, state.entries.length)
    state.lastTurnIndex = -1
    state.running = true
  }

  function end(): void {
    backfillOpenTurnDuration(Date.now())
    state.running = false
  }

  function clear(): void {
    state.entries.splice(0, state.entries.length)
    state.lastTurnIndex = -1
    state.running = false
  }

  function drain(): AgentTurnStreamEntry[] {
    // 收编发生在 finally/end 之前，先补齐末轮耗时，避免最后一轮历史回放缺 durationMs。
    backfillOpenTurnDuration(Date.now())
    return state.entries.splice(0, state.entries.length)
  }

  function markTurnIfNew(turnIndex: number): void {
    if (!state.running || turnIndex === state.lastTurnIndex) return
    state.lastTurnIndex = turnIndex
    pushEntry({ kind: 'turn', label: `第 ${turnIndex + 1} 轮` })
  }

  function append(entry: Omit<AgentTurnStreamEntry, 'at'>): void {
    if (!state.running) return
    pushEntry(entry)
  }

  function settleTool(toolName: string, status: 'success' | 'error'): void {
    if (!state.running) return
    for (let index = state.entries.length - 1; index >= 0; index -= 1) {
      const item = state.entries[index]
      if (item.kind === 'tool' && item.label === toolName && !item.status) {
        state.entries[index] = { ...item, status, durationMs: Math.max(0, Date.now() - item.at) }
        return
      }
    }
    pushEntry({ kind: 'tool', label: toolName, status })
  }

  function settleAllOpen(status: 'success' | 'error'): void {
    const now = Date.now()
    for (let index = 0; index < state.entries.length; index += 1) {
      const item = state.entries[index]
      if (item.kind === 'tool' && !item.status) {
        state.entries[index] = { ...item, status, durationMs: Math.max(0, now - item.at) }
      } else if (item.kind === 'turn' && item.durationMs === undefined) {
        state.entries[index] = { ...item, durationMs: Math.max(0, now - item.at) }
      }
    }
  }

  function feedProgress(event: AgentRuntimeProgressEvent): void {
    markTurnIfNew(event.turnIndex)
    if (event.kind === 'tool-start') {
      const detail = String(event.detail || '')
      append({ kind: 'tool', label: event.toolName, ...(detail ? { detail } : {}) })
    } else if (event.kind === 'tool-result') {
      settleTool(event.toolName, event.status === 'success' ? 'success' : 'error')
    }
  }

  async function trackModelCall<T>(turnIndex: number, call: () => Promise<T>): Promise<T> {
    markTurnIfNew(turnIndex)
    append({ kind: 'tool', label: AGENT_TURN_STREAM_MODEL_THINKING_LABEL })
    try {
      const result = await call()
      settleTool(AGENT_TURN_STREAM_MODEL_THINKING_LABEL, 'success')
      return result
    } catch (error) {
      settleTool(AGENT_TURN_STREAM_MODEL_THINKING_LABEL, 'error')
      throw error
    }
  }

  return { state, begin, end, clear, drain, markTurnIfNew, append, settleTool, settleAllOpen, feedProgress, trackModelCall }
}

function normalizeEntry(value: unknown): AgentTurnStreamEntry | null {
  if (!value || typeof value !== 'object') return null
  const row = value as Record<string, unknown>
  const kind = row.kind === 'turn' || row.kind === 'tool' ? row.kind : null
  const label = typeof row.label === 'string' ? row.label.trim() : ''
  const at = Number(row.at)
  if (!kind || !label || !Number.isFinite(at)) return null
  const status = row.status === 'success' || row.status === 'error' ? row.status : undefined
  const detail = typeof row.detail === 'string' && row.detail ? row.detail : undefined
  const duration = Number(row.durationMs)
  const durationMs = Number.isFinite(duration) && duration >= 0 ? duration : undefined
  return { kind, label, at, ...(detail ? { detail } : {}), ...(status ? { status } : {}), ...(durationMs !== undefined ? { durationMs } : {}) }
}

/** 服务端 `turn_stream_json` 读侧唯一适配器；脏条目丢弃，消息正文不受影响。 */
export function parseAgentTurnStream(raw: unknown): AgentTurnStreamEntry[] | undefined {
  let value = raw
  if (typeof raw === 'string') {
    if (!raw) return undefined
    try { value = JSON.parse(raw) } catch { return undefined }
  }
  if (!Array.isArray(value)) return undefined
  const entries = value.map(normalizeEntry).filter((item): item is AgentTurnStreamEntry => item !== null)
    .slice(-AGENT_TURN_STREAM_MAX_ENTRIES)
  return entries.length ? entries : undefined
}

export function serializeAgentTurnStream(entries: readonly AgentTurnStreamEntry[] | undefined): string | undefined {
  if (!entries?.length) return undefined
  return JSON.stringify(entries.slice(-AGENT_TURN_STREAM_MAX_ENTRIES))
}
