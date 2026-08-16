import { computed, watch, type Ref } from 'vue'
import type { WorkspaceStreamingEvent } from '../types/workspace'
import type { TaskItemViewModel } from '../types/panelContracts'
import type {
  RuntimeTimerJob,
  useWorkspaceRuntimeStore
} from './workspaceRuntimeStore'

type RuntimeBindingDeps = {
  workspaceRuntimeStore: ReturnType<typeof useWorkspaceRuntimeStore>
  taskStore: {
    tasks?: TaskItemViewModel[] | Ref<TaskItemViewModel[]>
  }
  chatStore?: unknown
  timerComposable: {
    activeTimers?: Ref<Array<{
      id?: string | number
      ticketId?: string | number
      ticketName?: string
      paused?: boolean
      remainingMs?: number
      endTime?: number
    }>>
  }
  streamingText: Ref<string>
  currentStreamingSpeakerName: Ref<string>
}

type TaskTimerStateCarrier = {
  timerState?: unknown
  timer_state?: unknown
}

function readTaskList(tasks: TaskItemViewModel[] | Ref<TaskItemViewModel[]> | undefined) {
  if (tasks && typeof tasks === 'object' && 'value' in tasks) {
    return Array.isArray(tasks.value) ? tasks.value : []
  }
  return Array.isArray(tasks) ? tasks : []
}

function normalizeTaskTimerState(timerState: unknown) {
  const state = timerState && typeof timerState === 'object'
    ? timerState as Record<string, unknown>
    : {}
  return {
    isRunning: Boolean(state.isRunning),
    startTime: typeof state.startTime === 'number' ? state.startTime : null,
    accumulatedTime: Number(state.accumulatedTime || 0),
    markCount: Array.isArray(state.marks) ? state.marks.length : 0
  }
}

export function bindWorkspaceRuntimeSources({
  workspaceRuntimeStore,
  taskStore,
  chatStore,
  timerComposable,
  streamingText,
  currentStreamingSpeakerName
}: RuntimeBindingDeps) {
  const timerJobsSource = computed<RuntimeTimerJob[]>(() => {
    const ticketTimerJobs = Array.isArray(timerComposable?.activeTimers?.value)
      ? timerComposable.activeTimers.value.map((timer) => ({
          id: String(timer.id),
          kind: 'ticket',
          ticketId: String(timer.ticketId || ''),
          ticketName: String(timer.ticketName || ''),
          paused: Boolean(timer.paused),
          remainingMs: Number(timer.remainingMs || 0),
          endTime: Number(timer.endTime || 0)
        }))
      : []

    const taskList = readTaskList(taskStore?.tasks)
    const taskTimerJobs = taskList
      .filter((task) => {
            const timerState = normalizeTaskTimerState(
              (task as TaskTimerStateCarrier | undefined)?.timerState
              ?? (task as TaskTimerStateCarrier | undefined)?.timer_state
            )
            return Boolean(timerState.isRunning || timerState.accumulatedTime > 0)
          })
          .map((task) => {
            const timerState = normalizeTaskTimerState(
              (task as TaskTimerStateCarrier | undefined)?.timerState
              ?? (task as TaskTimerStateCarrier | undefined)?.timer_state
            )
            return {
              id: `task:${task.id}`,
              kind: 'task',
              taskId: String(task.id || ''),
              taskTitle: String(task.title || ''),
              isRunning: timerState.isRunning,
              startTime: timerState.startTime,
              accumulatedTime: timerState.accumulatedTime,
              markCount: timerState.markCount
            }
          })

    return [...ticketTimerJobs, ...taskTimerJobs]
  })

  const streamingJobsSource = computed(() => {
    const hasChatRuntimeStreaming = Object.values(workspaceRuntimeStore.localStreamingMessages || {})
      .some((messages) => Array.isArray(messages) && messages.length > 0)
    if (hasChatRuntimeStreaming) return []
    const text = String(streamingText.value || '').trim()
    if (!text) return []
    return [{
      id: 'active-chat-stream',
      commandId: 'active-chat-stream',
      event: 'delta',
      sessionId: 'active-chat-stream',
      targetId: 'active-chat-stream',
      speakerName: String(currentStreamingSpeakerName.value || ''),
      content: text,
      updatedAt: Date.now()
    }] as Array<WorkspaceStreamingEvent & { id: string }>
  })

  workspaceRuntimeStore.replaceTimerJobs(timerJobsSource.value)
  workspaceRuntimeStore.replaceStreamingJobs(streamingJobsSource.value)

  watch(timerJobsSource, (nextValue) => {
    workspaceRuntimeStore.replaceTimerJobs(nextValue)
  }, { deep: true })

  watch(streamingJobsSource, (nextValue) => {
    workspaceRuntimeStore.replaceStreamingJobs(nextValue)
  }, { deep: true })
}
