import { ref } from 'vue'
import type { PublicRecallMilestone, RecallActivityEvent, RecallActivityStatus, RecallPipelineResult } from '../types/docBrain'

/** 单次召回追踪记录 */
export interface RecallTraceEntry {
  id: string
  timestamp: string
  characterName: string
  result: RecallPipelineResult
}

export interface RecallActivityRun {
  id: string
  characterName: string
  status: RecallActivityStatus
  startedAt: string
  completedAt?: string
  events: RecallActivityEvent[]
  publicMilestones?: PublicRecallMilestone[]
  result?: RecallPipelineResult
  error?: string
}

export interface PersistedRecallActivityRun extends RecallActivityRun {
  persistedLogId?: string
}

export interface RecallActivityPanelBinding {
  sessionId: string
  messageId: number
}

export type RecallActivityPanelInvalidationMode = 'restart' | 'delete'

/** 全局召回追踪历史（最多保留 20 条） */
const recallTraceHistory = ref<RecallTraceEntry[]>([])

/** 最近一次召回追踪 */
const latestRecallTrace = ref<RecallTraceEntry | null>(null)
const activeRecallActivity = ref<PersistedRecallActivityRun | null>(null)
const currentRecallActivity = ref<PersistedRecallActivityRun | null>(null)
const recallActivityHistory = ref<PersistedRecallActivityRun[]>([])
const recallActivityRunsById = ref<Record<string, PersistedRecallActivityRun>>({})
const recallActivitySidebarOpen = ref(false)
const recallActivityPanelBinding = ref<RecallActivityPanelBinding | null>(null)

function cloneRecallActivity(run: RecallActivityRun | null): PersistedRecallActivityRun | null {
  return run
    ? {
        ...run,
        events: Array.isArray(run.events) ? run.events.map((event) => ({ ...event })) : [],
        publicMilestones: Array.isArray(run.publicMilestones) ? run.publicMilestones.map((item) => ({ ...item })) : undefined
      }
    : null
}

function setRunPublicMilestones(run: PersistedRecallActivityRun | null, milestones: PublicRecallMilestone[]): void {
  if (!run) return
  run.publicMilestones = milestones.map((item) => ({ ...item }))
}

function upsertRecallActivityEvent(run: PersistedRecallActivityRun, event: RecallActivityEvent): void {
  const existingIndex = run.events.findIndex((item) => item.id === event.id)
  if (existingIndex >= 0) {
    run.events[existingIndex] = {
      ...run.events[existingIndex],
      ...event
    }
    return
  }
  run.events.push(event)
}

function clonePersistedRecallActivity(run: PersistedRecallActivityRun | null): PersistedRecallActivityRun | null {
  return cloneRecallActivity(run)
}

function recordRecallActivityRun(run: PersistedRecallActivityRun): void {
  recallActivityRunsById.value = {
    ...recallActivityRunsById.value,
    [run.id]: run
  }
}

/** 写入一条召回追踪记录 */
export function pushRecallTrace(entry: RecallTraceEntry): void {
  recallTraceHistory.value.unshift(entry)
  latestRecallTrace.value = entry
  if (recallTraceHistory.value.length > 20) {
    recallTraceHistory.value = recallTraceHistory.value.slice(0, 20)
  }
}

export function startRecallActivity(input: { id: string; characterName: string; startedAt?: string }): void {
  const run: RecallActivityRun = {
    id: input.id,
    characterName: input.characterName,
    status: 'running',
    startedAt: input.startedAt || new Date().toISOString(),
    events: []
  }
  activeRecallActivity.value = run
  recordRecallActivityRun(run)
  if (!recallActivityPanelBinding.value && !recallActivitySidebarOpen.value) {
    currentRecallActivity.value = run
  }
}

export function appendRecallActivityEvent(event: RecallActivityEvent): void {
  const active = activeRecallActivity.value
  if (!active || active.id !== event.runId) return
  upsertRecallActivityEvent(active, event)
  recordRecallActivityRun(active)
  const current = currentRecallActivity.value
  if (current && current.id === event.runId) {
    upsertRecallActivityEvent(current, event)
  }
}

export function updateRecallActivityPublicMilestones(runId: string, milestones: PublicRecallMilestone[]): void {
  const active = activeRecallActivity.value
  if (active && active.id === runId) {
    setRunPublicMilestones(active, milestones)
    recordRecallActivityRun(active)
  }
  const current = currentRecallActivity.value
  if (current && current.id === runId) {
    setRunPublicMilestones(current, milestones)
  }
  recallActivityHistory.value = recallActivityHistory.value.map((item) => {
    if (item.id !== runId) return item
    return {
      ...item,
      publicMilestones: milestones.map((milestone) => ({ ...milestone }))
    }
  })
}

export function completeRecallActivity(result: RecallPipelineResult): void {
  const active = activeRecallActivity.value
  if (!active) return
  active.status = 'completed'
  active.completedAt = new Date().toISOString()
  active.result = result
  recordRecallActivityRun(active)
  if (currentRecallActivity.value?.id === active.id) {
    currentRecallActivity.value = active
  }
  recallActivityHistory.value.unshift({ ...active, events: [...active.events] })
  if (recallActivityHistory.value.length > 20) {
    recallActivityHistory.value = recallActivityHistory.value.slice(0, 20)
  }
}

export function getCurrentRecallActivitySnapshot(): PersistedRecallActivityRun | null {
  const current = activeRecallActivity.value
  if (!current) return null
  return {
    ...current,
    events: current.events.map((event) => ({ ...event })),
    publicMilestones: Array.isArray(current.publicMilestones) ? current.publicMilestones.map((item) => ({ ...item })) : undefined
  }
}

export function setCurrentRecallActivity(run: RecallActivityRun | null): void {
  currentRecallActivity.value = cloneRecallActivity(run)
}

export function showActiveRecallActivityInPanel(): void {
  currentRecallActivity.value = cloneRecallActivity(activeRecallActivity.value)
}

export function getRecallActivityByRunId(runId: string): PersistedRecallActivityRun | null {
  const normalizedRunId = String(runId || '').trim()
  if (!normalizedRunId) return null
  const active = activeRecallActivity.value
  if (active?.id === normalizedRunId) return clonePersistedRecallActivity(active)
  const current = currentRecallActivity.value
  if (current?.id === normalizedRunId) return clonePersistedRecallActivity(current)
  const recorded = recallActivityRunsById.value[normalizedRunId]
  if (recorded) return clonePersistedRecallActivity(recorded)
  const historical = recallActivityHistory.value.find((item) => item.id === normalizedRunId) || null
  return clonePersistedRecallActivity(historical)
}

export function showRecallActivityRunInPanel(runId: string): boolean {
  const run = getRecallActivityByRunId(runId)
  if (!run) return false
  currentRecallActivity.value = run
  return true
}

export function setRecallActivityPanelBinding(binding: RecallActivityPanelBinding | null): void {
  recallActivityPanelBinding.value = binding
    ? {
        sessionId: String(binding.sessionId || ''),
        messageId: Number(binding.messageId || 0)
      }
    : null
}

export function clearRecallActivityIfBoundToOtherSession(sessionId: string): void {
  const binding = recallActivityPanelBinding.value
  if (!binding || binding.sessionId === sessionId) return
  currentRecallActivity.value = null
  recallActivityPanelBinding.value = null
}

export function invalidateRecallActivityPanelForMessages(input: {
  sessionId?: string
  messageIds: Array<number | string | null | undefined>
  mode?: RecallActivityPanelInvalidationMode
}): void {
  const binding = recallActivityPanelBinding.value
  if (!binding) return

  const sessionId = String(input.sessionId || '').trim()
  if (sessionId && binding.sessionId !== sessionId) return

  const messageIds = new Set(
    input.messageIds
      .map((item) => Number(item || 0))
      .filter((item) => Number.isInteger(item) && item > 0)
  )
  if (!messageIds.has(binding.messageId)) return

  currentRecallActivity.value = null
  recallActivityPanelBinding.value = null
  if ((input.mode || 'restart') === 'delete') {
    recallActivitySidebarOpen.value = false
  }
}

export function markCurrentRecallActivityPersisted(logId: string): void {
  const active = activeRecallActivity.value
  if (!active || !logId) return
  active.persistedLogId = logId
  recordRecallActivityRun(active)
  if (currentRecallActivity.value?.id === active.id) {
    currentRecallActivity.value.persistedLogId = logId
  }
}

export function failRecallActivity(error: unknown): void {
  const active = activeRecallActivity.value
  if (!active) return
  active.status = 'failed'
  active.completedAt = new Date().toISOString()
  active.error = error instanceof Error ? error.message : String(error)
  recordRecallActivityRun(active)
  if (currentRecallActivity.value?.id === active.id) {
    currentRecallActivity.value = active
  }
  recallActivityHistory.value.unshift({ ...active, events: [...active.events] })
  if (recallActivityHistory.value.length > 20) {
    recallActivityHistory.value = recallActivityHistory.value.slice(0, 20)
  }
}

export function setRecallActivitySidebarOpen(value: boolean): void {
  recallActivitySidebarOpen.value = value
  if (!value) {
    recallActivityPanelBinding.value = null
  }
}

/** 清空召回追踪历史 */
export function clearRecallTrace(): void {
  recallTraceHistory.value = []
  latestRecallTrace.value = null
  activeRecallActivity.value = null
  currentRecallActivity.value = null
  recallActivityHistory.value = []
  recallActivityRunsById.value = {}
  recallActivitySidebarOpen.value = false
  recallActivityPanelBinding.value = null
}

/** 供组件消费的响应式状态 */
export function useRecallTraceState() {
  return {
    history: recallTraceHistory,
    latest: latestRecallTrace,
    activeActivity: activeRecallActivity,
    activity: currentRecallActivity,
    activityHistory: recallActivityHistory,
    activityRunsById: recallActivityRunsById,
    panelBinding: recallActivityPanelBinding,
    sidebarOpen: recallActivitySidebarOpen,
    setSidebarOpen: setRecallActivitySidebarOpen
  }
}
