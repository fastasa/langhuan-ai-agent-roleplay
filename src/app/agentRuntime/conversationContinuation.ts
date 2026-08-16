import {
  normalizeAgentTaskTodoSnapshot,
  type AgentTaskTodoSnapshot
} from './taskTodo'
import type { AgentConversationModelSelection } from '../agentConversationModelSelection'

const STORAGE_KEY = 'langhuan.agentConversationContinuation.v1'
const MAX_CONVERSATIONS = 80

interface StoredAgentConversationContinuation {
  taskTodo: AgentTaskTodoSnapshot | null
  deferredActiveTools: string[]
  modelSelection: AgentConversationModelSelection | null
  updatedAt: number
}

export interface AgentConversationContinuation {
  taskTodo: AgentTaskTodoSnapshot | null
  deferredActiveTools: string[]
  modelSelection: AgentConversationModelSelection | null
}

let loaded = false
const records = new Map<string, StoredAgentConversationContinuation>()

function normalizeSessionId(value: unknown): string {
  return String(value ?? '').trim().slice(0, 160)
}

function normalizeToolNames(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return Array.from(new Set(
    value
      .map((item) => String(item ?? '').trim())
      .filter((item) => /^[A-Za-z][A-Za-z0-9._:-]{0,119}$/.test(item))
  )).slice(0, 160)
}

function cloneTaskTodo(snapshot: AgentTaskTodoSnapshot | null): AgentTaskTodoSnapshot | null {
  if (!snapshot) return null
  return { ...snapshot, items: snapshot.items.map((item) => ({ ...item })) }
}

/**
 * 会话续接只保留仍需继续的任务。
 * completed / empty 快照仍可供当前 runtime 做终态判断和回执，但不再留在输入框卡片或本机续接缓存。
 */
function normalizeRetainedTaskTodo(value: unknown): AgentTaskTodoSnapshot | null {
  const snapshot = normalizeAgentTaskTodoSnapshot(value)
  return snapshot?.state === 'active' ? snapshot : null
}

function normalizeStoredModelSelection(value: unknown): AgentConversationModelSelection | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  const slotId = String(record.slotId || '').trim()
  if (slotId !== 'fast' && slotId !== 'balanced' && slotId !== 'smart') return null
  const effort = String(record.effort || '').trim()
  if (effort && !/^[A-Za-z0-9._:-]{1,64}$/.test(effort)) return null
  return { slotId, effort }
}

function readStorage(): Storage | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage
  } catch {
    return null
  }
}

function ensureLoaded(): void {
  if (loaded) return
  loaded = true
  const storage = readStorage()
  if (!storage) return
  try {
    const parsed = JSON.parse(storage.getItem(STORAGE_KEY) || '{}') as Record<string, unknown>
    for (const [sessionId, rawRecord] of Object.entries(parsed)) {
      const key = normalizeSessionId(sessionId)
      if (!key || !rawRecord || typeof rawRecord !== 'object') continue
      const record = rawRecord as Partial<StoredAgentConversationContinuation>
      records.set(key, {
        taskTodo: normalizeRetainedTaskTodo(record.taskTodo),
        deferredActiveTools: normalizeToolNames(record.deferredActiveTools),
        modelSelection: normalizeStoredModelSelection(record.modelSelection),
        updatedAt: Number.isFinite(Number(record.updatedAt)) ? Number(record.updatedAt) : 0
      })
    }
  } catch {
    // 本机续接缓存损坏时放弃恢复，不影响正式聊天消息与业务权限。
  }
}

function persist(): void {
  const storage = readStorage()
  if (!storage) return
  try {
    const newest = Array.from(records.entries())
      .sort((left, right) => right[1].updatedAt - left[1].updatedAt)
      .slice(0, MAX_CONVERSATIONS)
    records.clear()
    for (const [sessionId, record] of newest) records.set(sessionId, record)
    storage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(newest)))
  } catch {
    // localStorage 不可用时仍保留本次应用运行期的内存续接。
  }
}

function getOrCreate(sessionId: string): StoredAgentConversationContinuation | null {
  ensureLoaded()
  const key = normalizeSessionId(sessionId)
  if (!key) return null
  const existing = records.get(key)
  if (existing) return existing
  const created: StoredAgentConversationContinuation = {
    taskTodo: null,
    deferredActiveTools: [],
    modelSelection: null,
    updatedAt: Date.now()
  }
  records.set(key, created)
  return created
}

export function readAgentConversationContinuation(sessionId: string): AgentConversationContinuation {
  ensureLoaded()
  const record = records.get(normalizeSessionId(sessionId))
  return {
    taskTodo: cloneTaskTodo(record?.taskTodo ?? null),
    deferredActiveTools: [...(record?.deferredActiveTools ?? [])],
    modelSelection: record?.modelSelection ? { ...record.modelSelection } : null
  }
}

export function saveAgentConversationTaskTodo(
  sessionId: string,
  snapshot: AgentTaskTodoSnapshot
): AgentTaskTodoSnapshot | null {
  const retained = normalizeRetainedTaskTodo(snapshot)
  const record = getOrCreate(sessionId)
  if (!record) return cloneTaskTodo(retained)
  record.taskTodo = retained
  record.updatedAt = Date.now()
  persist()
  return cloneTaskTodo(retained)
}

export function saveAgentConversationDeferredTools(sessionId: string, toolNames: readonly string[]): void {
  const record = getOrCreate(sessionId)
  if (!record) return
  record.deferredActiveTools = normalizeToolNames(toolNames)
  record.updatedAt = Date.now()
  persist()
}

export function saveAgentConversationModelSelection(
  sessionId: string,
  selection: AgentConversationModelSelection
): void {
  const record = getOrCreate(sessionId)
  if (!record) return
  record.modelSelection = normalizeStoredModelSelection(selection)
  record.updatedAt = Date.now()
  persist()
}

export function clearAgentConversationContinuation(sessionId: string): void {
  ensureLoaded()
  if (!records.delete(normalizeSessionId(sessionId))) return
  persist()
}

/** 测试专用：同时清理模块内存与浏览器本机缓存。 */
export function resetAgentConversationContinuationsForTest(): void {
  loaded = true
  records.clear()
  try {
    readStorage()?.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
}
