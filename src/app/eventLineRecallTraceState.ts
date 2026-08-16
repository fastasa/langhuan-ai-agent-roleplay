import { ref } from 'vue'
import type { RecallActivityEvent, RecallActivityStatus, RecallPipelineResult } from '../types/docBrain'
import type { RecallActivityRun } from './recallTraceState'

const eventLineRecallActivity = ref<RecallActivityRun | null>(null)
const eventLineRecallSidebarOpen = ref(false)

function cloneEvent(event: RecallActivityEvent): RecallActivityEvent {
  return { ...event }
}

function upsertEvent(run: RecallActivityRun, event: RecallActivityEvent): void {
  const existingIndex = run.events.findIndex((item) => item.id === event.id)
  if (existingIndex >= 0) {
    run.events[existingIndex] = {
      ...run.events[existingIndex],
      ...cloneEvent(event)
    }
    return
  }
  run.events.push(cloneEvent(event))
}

function ensureEventLineRecallActivity(input: { runId: string; characterName?: string; startedAt?: string }): RecallActivityRun {
  if (!eventLineRecallActivity.value || eventLineRecallActivity.value.id !== input.runId) {
    eventLineRecallActivity.value = {
      id: input.runId,
      characterName: input.characterName || '事件线召回',
      status: 'running',
      startedAt: input.startedAt || new Date().toISOString(),
      events: [],
      result: {
        compressedContext: '',
        confirmedIds: [],
        readDecisions: {},
        roundsCompleted: 0,
        rounds: []
      }
    }
  }
  return eventLineRecallActivity.value
}

function buildResultFromEvents(events: RecallActivityEvent[]): RecallPipelineResult {
  const confirmedIds = Array.from(new Set(events.flatMap((event) => {
    const output = event.output && typeof event.output === 'object' && !Array.isArray(event.output)
      ? event.output as Record<string, unknown>
      : {}
    const confirmed = Array.isArray(output.confirmed)
      ? output.confirmed
      : Array.isArray(output.confirmedDocumentIds)
        ? output.confirmedDocumentIds
        : []
    return confirmed.map((item) => String(item || '').trim()).filter(Boolean)
  })))
  return {
    compressedContext: '',
    confirmedIds,
    readDecisions: {},
    roundsCompleted: events.length,
    rounds: [],
    activityEvents: events
  }
}

export function openEventLineRecallSidebar(): void {
  eventLineRecallSidebarOpen.value = true
}

export function closeEventLineRecallSidebar(): void {
  eventLineRecallSidebarOpen.value = false
}

export function startEventLineRecallActivity(input: { runId: string; characterName?: string }): void {
  eventLineRecallActivity.value = {
    id: input.runId,
    characterName: input.characterName || '事件线召回',
    status: 'running',
    startedAt: new Date().toISOString(),
    events: [],
    result: {
      compressedContext: '',
      confirmedIds: [],
      readDecisions: {},
      roundsCompleted: 0,
      rounds: []
    }
  }
}

export function appendEventLineRecallActivityEvent(event: RecallActivityEvent): void {
  const run = ensureEventLineRecallActivity({ runId: event.runId, startedAt: event.startedAt })
  upsertEvent(run, event)
  run.status = event.status === 'failed' ? 'failed' : run.status
  run.result = buildResultFromEvents(run.events)
}

export function completeEventLineRecallActivity(): void {
  const run = eventLineRecallActivity.value
  if (!run) return
  run.status = 'completed'
  run.completedAt = new Date().toISOString()
  run.result = buildResultFromEvents(run.events)
}

export function failEventLineRecallActivity(error: unknown): void {
  const run = eventLineRecallActivity.value
  if (!run) return
  run.status = 'failed'
  run.completedAt = new Date().toISOString()
  run.error = error instanceof Error ? error.message : String(error)
  run.result = buildResultFromEvents(run.events)
}

export function setEventLineRecallStatus(status: RecallActivityStatus): void {
  const run = eventLineRecallActivity.value
  if (!run) return
  run.status = status
}

export function clearEventLineRecallActivity(): void {
  eventLineRecallActivity.value = null
}

export function useEventLineRecallTraceState() {
  return {
    activity: eventLineRecallActivity,
    sidebarOpen: eventLineRecallSidebarOpen,
    openSidebar: openEventLineRecallSidebar,
    closeSidebar: closeEventLineRecallSidebar
  }
}
