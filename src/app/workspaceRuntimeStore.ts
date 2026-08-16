import { defineStore } from 'pinia'
import { computed, reactive, ref } from 'vue'
import type {
  WorkspaceCommandMetadata,
  WorkspaceCommandResult,
  WorkspaceCommandError,
  WorkspaceStreamingEvent
} from '../types/workspace'
import type { ChatMessage } from '../types'
import type {
  TransactionOperationViewModel
} from '../types/panelContracts'

export type WorkspaceHydrationSource =
  | 'bootstrap'
  | 'session-restore'
  | 'import'
  | 'archive-restore'
  | 'unknown'

export type WorkspaceHydrationStage =
  | 'idle'
  | 'booting'
  | 'hydrating'
  | 'syncing'
  | 'importing'
  | 'recovering'
  | 'ready'
  | 'error'

export type WorkspaceCommandState =
  | 'accepted'
  | 'running'
  | 'committed'
  | 'rolledBack'
  | 'cancelled'

export type WorkspaceFeedbackType = 'idle' | 'info' | 'success' | 'error' | 'warning'

export type WorkspaceAgentTaskNoticeStatus = 'running' | 'waiting' | 'success' | 'error'

export type WorkspaceAgentTaskNoticeStepStatus = 'running' | 'waiting' | 'success' | 'error' | 'info'

export type WorkspaceAgentTaskNoticeStep = {
  id: string
  label: string
  status: WorkspaceAgentTaskNoticeStepStatus
  detail: string
  updatedAt: number
}

export type WorkspaceAgentTaskNotice = {
  id: string
  title: string
  message: string
  status: WorkspaceAgentTaskNoticeStatus
  sourceLabel: string
  sourceCharacterId: string
  error: string
  startedAt: number
  updatedAt: number
  finishedAt: number | null
  steps: WorkspaceAgentTaskNoticeStep[]
}

export type WorkspaceActiveCommandRecord = WorkspaceCommandMetadata & {
  state: WorkspaceCommandState
  updatedAt: number
  finishedAt: number | null
  warnings: string[]
  retryable: boolean
  error: string
  snapshotVersion: string | null
}

export type ChatTaskKind = 'normalMessage' | 'narrationPolish' | 'narrationGenerate' | 'tidiaoDispatch'

export type ChatTaskRunStatus = 'running' | 'completed' | 'failed' | 'stopped'

export type ChatTaskRun = {
  id: string
  taskKind: ChatTaskKind
  status: ChatTaskRunStatus
  label: string
  targetId: string
  sessionId: string
  abortController: AbortController | null
  stopRequested: boolean
  startedAt: number
  updatedAt: number
  finishedAt: number | null
  error: string
  /** 子代理/模型运行结果给验收与诊断使用；不参与业务真值，也不持久化到状态栏。 */
  metrics: Record<string, number | string | boolean | null> | null
}

type StartChatTaskRunInput = {
  id?: string
  taskKind: ChatTaskKind
  label?: string
  targetId?: string
  sessionId?: string
  abortController?: AbortController | null
  foreground?: boolean
}

type RuntimeEntityWithId = {
  id: string
  [key: string]: unknown
}

type RuntimeStreamingJob = WorkspaceStreamingEvent & {
  id: string
}

type RuntimeChatMessage = ChatMessage & {
  _localStreamingKey?: string
  name?: string
  memberName?: string
}

export type RuntimeMessageBucket = Record<string, RuntimeChatMessage[]>

export type RuntimeTimerJob = {
  id: string
  kind?: string
  ticketId?: string
  ticketName?: string
  paused?: boolean
  remainingMs?: number
  endTime?: number
  taskId?: string
  taskTitle?: string
  isRunning?: boolean
  startTime?: number | null
  accumulatedTime?: number
  markCount?: number
}

export type RuntimePendingTransaction = TransactionOperationViewModel & {
  id: string
}

type RuntimePendingMessageReconcileJob = {
  id: string
  targetId: string
  sessionId: string
  messageId?: number
  updatedAt: number
}

type WorkspaceFeedbackToast = {
  visible: boolean
  message: string
  type: WorkspaceFeedbackType
  duration: number
  updatedAt: number
}

type WorkspaceFeedbackBanner = {
  visible: boolean
  title: string
  message: string
  ticketName: string
  type: WorkspaceFeedbackType
  updatedAt: number
}

type WorkspaceBlockingFeedback = {
  visible: boolean
  message: string
  scope: 'global' | 'local'
  updatedAt: number
}

type WorkspaceAgentTaskNoticeInput = {
  id?: string
  title: string
  message?: string
  sourceLabel?: string
  step?: string
  sourceCharacterId?: string
}

export const useWorkspaceRuntimeStore = defineStore('workspaceRuntime', () => {
  const hydration = reactive({
    stage: 'idle' as WorkspaceHydrationStage,
    source: 'unknown' as WorkspaceHydrationSource,
    message: '',
    error: '',
    updatedAt: 0
  })

  const externalStreamingJobs = ref<RuntimeStreamingJob[]>([])
  const localStreamingMessages = ref<RuntimeMessageBucket>({})
  const pendingPersistedMessages = ref<RuntimeMessageBucket>({})
  const chatTaskRuns = ref<ChatTaskRun[]>([])
  const foregroundTaskId = ref<string | null>(null)
  const legacyAbortController = ref<AbortController | null>(null)
  const currentMessageModel = ref('')
  const legacyStopRequested = ref(false)
  const timerJobs = ref<RuntimeTimerJob[]>([])
  const syncJobs = ref<any[]>([])
  const pendingTransactions = ref<RuntimePendingTransaction[]>([])
  const activeCommands = ref<WorkspaceActiveCommandRecord[]>([])
  const agentTaskNotice = ref<WorkspaceAgentTaskNotice | null>(null)

  const streamingJobs = computed<RuntimeStreamingJob[]>(() => {
    const jobs: RuntimeStreamingJob[] = []
    Object.entries(localStreamingMessages.value || {}).forEach(([targetId, messages]) => {
      ;(Array.isArray(messages) ? messages : []).forEach((message, index) => {
        const localKey = String(message?._localStreamingKey || index)
        jobs.push({
          id: `${targetId}::${localKey}`,
          commandId: `stream:${targetId}:${localKey}`,
          event: 'delta',
          targetId,
          sessionId: targetId,
          speakerName: String(message?.name || message?.memberName || ''),
          content: String(message?.content || ''),
          updatedAt: Date.now()
        })
      })
    })
    return [...jobs, ...cloneRuntimeList(externalStreamingJobs.value)]
  })

  const pendingMessageReconcileJobs = computed<RuntimePendingMessageReconcileJob[]>(() => {
    const jobs: RuntimePendingMessageReconcileJob[] = []
    Object.entries(pendingPersistedMessages.value || {}).forEach(([targetId, messages]) => {
      ;(Array.isArray(messages) ? messages : []).forEach((message, index) => {
        jobs.push({
          id: `${targetId}::${String(message?.id || index)}`,
          targetId,
          sessionId: targetId,
          messageId: typeof message?.id === 'number' ? message.id : undefined,
          updatedAt: Date.now()
        })
      })
    })
    return jobs
  })

  const runningChatTaskRuns = computed<ChatTaskRun[]>(() => {
    return chatTaskRuns.value.filter((run) => run.status === 'running')
  })

  const hasRunningChatTasks = computed(() => runningChatTaskRuns.value.length > 0)

  const foregroundChatTaskRun = computed<ChatTaskRun | null>(() => {
    const foregroundId = foregroundTaskId.value
    if (foregroundId) {
      const foregroundRun = chatTaskRuns.value.find((run) => run.id === foregroundId && run.status === 'running')
      if (foregroundRun) return foregroundRun
    }
    return runningChatTaskRuns.value[runningChatTaskRuns.value.length - 1] || null
  })

  const isGenerating = computed({
    get: () => hasRunningChatTasks.value,
    set: (value: boolean) => {
      if (value) {
        ensureLegacyChatTaskRun()
        return
      }
      finishLegacyChatTaskRuns('completed')
    }
  })

  const currentAbortController = computed({
    get: () => foregroundChatTaskRun.value?.abortController || legacyAbortController.value,
    set: (controller: AbortController | null) => {
      legacyAbortController.value = controller
      const foregroundRun = foregroundChatTaskRun.value
      if (foregroundRun) {
        updateChatTaskRun(foregroundRun.id, { abortController: controller })
      }
    }
  })

  const stopRequested = computed({
    get: () => legacyStopRequested.value || Boolean(foregroundChatTaskRun.value?.stopRequested),
    set: (value: boolean) => {
      legacyStopRequested.value = Boolean(value)
      if (!value) {
        chatTaskRuns.value = chatTaskRuns.value.map((run) => (
          run.status === 'running'
            ? { ...run, stopRequested: false, updatedAt: Date.now() }
            : run
        ))
      }
    }
  })

  const localArchiveActionState = reactive({
    phase: 'idle',
    slotName: '',
    message: '',
    type: 'idle' as 'idle' | 'info' | 'success' | 'error'
  })

  const feedbackCenter = reactive({
    toast: {
      visible: false,
      message: '',
      type: 'idle' as WorkspaceFeedbackType,
      duration: 3000,
      updatedAt: 0
    } as WorkspaceFeedbackToast,
    banner: {
      visible: false,
      title: '',
      message: '',
      ticketName: '',
      type: 'idle' as WorkspaceFeedbackType,
      updatedAt: 0
    } as WorkspaceFeedbackBanner,
    blocking: {
      visible: false,
      message: '',
      scope: 'global' as 'global' | 'local',
      updatedAt: 0
    } as WorkspaceBlockingFeedback
  })

  let toastTimer: ReturnType<typeof setTimeout> | null = null
  let agentTaskNoticeTimer: ReturnType<typeof setTimeout> | null = null

  function rebuildSyncJobs() {
    const jobs: Array<{
      id: string
      phase: string
      message: string
      type: 'idle' | 'info' | 'success' | 'error'
      updatedAt: number
      source?: WorkspaceHydrationSource
    }> = []

    const isHydrationSyncSource = hydration.source === 'import' || hydration.source === 'archive-restore'
    if (isHydrationSyncSource && isHydrating.value) {
      jobs.push({
        id: `hydration:${hydration.source}`,
        phase: hydration.stage,
        message: hydration.message || (hydration.source === 'import' ? '正在导入工作区...' : '正在下载并应用本机服务数据...'),
        type: 'info',
        updatedAt: hydration.updatedAt,
        source: hydration.source
      })
    } else if (isHydrationSyncSource && hydration.stage === 'error' && hydration.error) {
      jobs.push({
        id: `hydration:${hydration.source}:error`,
        phase: 'error',
        message: hydration.error,
        type: 'error',
        updatedAt: hydration.updatedAt,
        source: hydration.source
      })
    }

    if (localArchiveActionState.phase !== 'idle') {
      jobs.push({
        id: localArchiveActionState.slotName || 'local-archive',
        phase: localArchiveActionState.phase,
        message: localArchiveActionState.message,
        type: localArchiveActionState.type,
        updatedAt: Date.now()
      })
    }

    syncJobs.value = jobs
  }

  const isHydrating = computed(() => {
    return hydration.stage === 'booting'
      || hydration.stage === 'hydrating'
      || hydration.stage === 'syncing'
      || hydration.stage === 'importing'
      || hydration.stage === 'recovering'
  })

  function setHydrationStage(
    stage: WorkspaceHydrationStage,
    source: WorkspaceHydrationSource,
    message = '',
    error = ''
  ) {
    hydration.stage = stage
    hydration.source = source
    hydration.message = message
    hydration.error = error
    hydration.updatedAt = Date.now()
    rebuildSyncJobs()
  }

  function beginHydration(source: WorkspaceHydrationSource, message = '') {
    const stage: WorkspaceHydrationStage =
      source === 'session-restore'
        ? 'recovering'
        : source === 'import'
          ? 'importing'
          : source === 'archive-restore'
            ? 'syncing'
            : 'hydrating'
    setHydrationStage(stage, source, message)
  }

  function finishHydration(source: WorkspaceHydrationSource, message = '') {
    setHydrationStage('ready', source, message)
  }

  function failHydration(source: WorkspaceHydrationSource, error: string) {
    setHydrationStage('error', source, '', error)
  }

  function setLocalArchiveAction(
    phase: string,
    message: string,
    type: 'idle' | 'info' | 'success' | 'error' = 'info',
    slotName = ''
  ) {
    localArchiveActionState.phase = phase
    localArchiveActionState.message = message
    localArchiveActionState.type = type
    localArchiveActionState.slotName = slotName
    rebuildSyncJobs()
  }

  function resetLocalArchiveAction() {
    setLocalArchiveAction('idle', '', 'idle', '')
  }

  function startChatTaskRun(input: StartChatTaskRunInput) {
    const now = Date.now()
    const runId = String(input.id || `chat-task:${now}:${Math.random().toString(36).slice(2, 8)}`)
    const existingIndex = chatTaskRuns.value.findIndex((run) => run.id === runId)
    const nextRun: ChatTaskRun = {
      id: runId,
      taskKind: input.taskKind,
      status: 'running',
      label: String(input.label || formatChatTaskLabel(input.taskKind)).trim(),
      targetId: String(input.targetId || ''),
      sessionId: String(input.sessionId || input.targetId || ''),
      abortController: input.abortController || new AbortController(),
      stopRequested: false,
      startedAt: existingIndex >= 0 ? chatTaskRuns.value[existingIndex].startedAt : now,
      updatedAt: now,
      finishedAt: null,
      error: '',
      metrics: null
    }
    if (existingIndex >= 0) {
      chatTaskRuns.value[existingIndex] = {
        ...chatTaskRuns.value[existingIndex],
        ...nextRun
      }
    } else {
      chatTaskRuns.value.push(nextRun)
    }
    if (input.foreground !== false) {
      foregroundTaskId.value = runId
      legacyAbortController.value = nextRun.abortController
      legacyStopRequested.value = false
    }
    return nextRun
  }

  function updateChatTaskRun(runId: string, patch: Partial<Omit<ChatTaskRun, 'id' | 'startedAt'>>) {
    const normalizedId = String(runId || '')
    const index = chatTaskRuns.value.findIndex((run) => run.id === normalizedId)
    if (index < 0) return null
    chatTaskRuns.value[index] = {
      ...chatTaskRuns.value[index],
      ...patch,
      updatedAt: Date.now()
    }
    return chatTaskRuns.value[index]
  }

  function completeChatTaskRun(runId: string) {
    return finishChatTaskRun(runId, 'completed')
  }

  function failChatTaskRun(runId: string, error: unknown) {
    return finishChatTaskRun(runId, 'failed', formatAgentTaskNoticeError(error))
  }

  function stopChatTaskRun(runId: string) {
    const normalizedId = String(runId || '')
    const run = chatTaskRuns.value.find((item) => item.id === normalizedId && item.status === 'running')
    if (!run) return null
    if (run.abortController && !run.abortController.signal.aborted) {
      run.abortController.abort()
    }
    legacyStopRequested.value = true
    return finishChatTaskRun(normalizedId, 'stopped', '', true)
  }

  function stopForegroundChatTaskRun() {
    const foregroundRun = foregroundChatTaskRun.value
    if (!foregroundRun) return null
    return stopChatTaskRun(foregroundRun.id)
  }

  /** 停止一切（2026-07-06 用户拍板）：停掉全部 running 聊天任务（前台+并行旁白+外部提调轮），逐个 abort；返回停掉的数量。 */
  function stopAllChatTaskRuns() {
    const running = chatTaskRuns.value.filter((run) => run.status === 'running')
    running.forEach((run) => stopChatTaskRun(run.id))
    return running.length
  }

  function isChatTaskRunActive(runId: string) {
    const normalizedId = String(runId || '')
    return chatTaskRuns.value.some((run) => run.id === normalizedId && run.status === 'running')
  }

  function finishChatTaskRun(
    runId: string,
    status: Exclude<ChatTaskRunStatus, 'running'>,
    error = '',
    stopWasRequested = false
  ) {
    const normalizedId = String(runId || '')
    const index = chatTaskRuns.value.findIndex((run) => run.id === normalizedId)
    if (index < 0) return null
    const now = Date.now()
    const currentRun = chatTaskRuns.value[index]
    const nextRun: ChatTaskRun = {
      ...currentRun,
      status,
      stopRequested: stopWasRequested || currentRun.stopRequested,
      error: status === 'failed' ? error : '',
      abortController: null,
      updatedAt: now,
      finishedAt: now
    }
    chatTaskRuns.value[index] = nextRun
    if (foregroundTaskId.value === normalizedId) {
      const nextForeground = chatTaskRuns.value
        .filter((run) => run.status === 'running')
        .sort((left, right) => left.startedAt - right.startedAt)
      const latestForeground = nextForeground[nextForeground.length - 1]
      foregroundTaskId.value = latestForeground?.id || null
      legacyAbortController.value = latestForeground?.abortController || null
    }
    if (!hasRunningChatTasks.value) {
      legacyAbortController.value = null
      currentMessageModel.value = ''
    }
    return nextRun
  }

  function ensureLegacyChatTaskRun() {
    const existingLegacyRun = chatTaskRuns.value.find((run) => run.id === 'legacy:chat-generation' && run.status === 'running')
    if (existingLegacyRun) return existingLegacyRun
    return startChatTaskRun({
      id: 'legacy:chat-generation',
      taskKind: 'normalMessage',
      label: '角色回复',
      abortController: legacyAbortController.value,
      foreground: true
    })
  }

  function finishLegacyChatTaskRuns(status: Exclude<ChatTaskRunStatus, 'running'>) {
    chatTaskRuns.value
      .filter((run) => run.id === 'legacy:chat-generation' && run.status === 'running')
      .forEach((run) => {
        finishChatTaskRun(run.id, status)
      })
  }

  function formatChatTaskLabel(taskKind: ChatTaskKind) {
    if (taskKind === 'narrationPolish') return '旁白润色'
    if (taskKind === 'narrationGenerate') return '旁白生成'
    if (taskKind === 'tidiaoDispatch') return '提调纠偏'
    return '角色回复'
  }

  function showToast(message: string, type: WorkspaceFeedbackType = 'info', duration = 3000) {
    feedbackCenter.toast.visible = true
    feedbackCenter.toast.message = message
    feedbackCenter.toast.type = type
    feedbackCenter.toast.duration = duration
    feedbackCenter.toast.updatedAt = Date.now()
    if (toastTimer) clearTimeout(toastTimer)
    toastTimer = setTimeout(() => {
      hideToast()
    }, duration)
  }

  function hideToast() {
    feedbackCenter.toast.visible = false
    feedbackCenter.toast.updatedAt = Date.now()
    if (toastTimer) {
      clearTimeout(toastTimer)
      toastTimer = null
    }
  }

  function showBanner(payload: {
    title?: string
    message: string
    ticketName?: string
    type?: WorkspaceFeedbackType
  }) {
    feedbackCenter.banner.visible = true
    feedbackCenter.banner.title = payload.title || '票据计时完成'
    feedbackCenter.banner.message = payload.message
    feedbackCenter.banner.ticketName = payload.ticketName || ''
    feedbackCenter.banner.type = payload.type || 'info'
    feedbackCenter.banner.updatedAt = Date.now()
  }

  function hideBanner() {
    feedbackCenter.banner.visible = false
    feedbackCenter.banner.updatedAt = Date.now()
  }

  function setBlockingFeedback(message: string, scope: 'global' | 'local' = 'global') {
    feedbackCenter.blocking.visible = Boolean(message)
    feedbackCenter.blocking.message = message
    feedbackCenter.blocking.scope = scope
    feedbackCenter.blocking.updatedAt = Date.now()
  }

  function clearBlockingFeedback() {
    feedbackCenter.blocking.visible = false
    feedbackCenter.blocking.message = ''
    feedbackCenter.blocking.updatedAt = Date.now()
  }

  function startAgentTaskNotice(payload: WorkspaceAgentTaskNoticeInput) {
    const now = Date.now()
    const noticeId = String(payload.id || `agent-task:${now}`)
    if (agentTaskNoticeTimer) {
      clearTimeout(agentTaskNoticeTimer)
      agentTaskNoticeTimer = null
    }
    agentTaskNotice.value = {
      id: noticeId,
      title: String(payload.title || 'Agent 正在执行').trim() || 'Agent 正在执行',
      message: String(payload.message || payload.step || '正在准备任务').trim() || '正在准备任务',
      status: 'running',
      sourceLabel: String(payload.sourceLabel || '').trim(),
      sourceCharacterId: String(payload.sourceCharacterId || '').trim(),
      error: '',
      startedAt: now,
      updatedAt: now,
      finishedAt: null,
      steps: [
        createAgentTaskNoticeStep(payload.step || payload.message || '任务已开始', 'running', '', now)
      ]
    }
    return noticeId
  }

  function updateAgentTaskNotice(payload: { id?: string; message?: string; step?: string; detail?: string; status?: WorkspaceAgentTaskNoticeStepStatus }) {
    if (!agentTaskNotice.value) return
    if (payload.id && String(payload.id) !== agentTaskNotice.value.id) return
    const now = Date.now()
    const message = String(payload.message || payload.step || '').trim()
    agentTaskNotice.value = {
      ...agentTaskNotice.value,
      status: payload.status === 'waiting' ? 'waiting' : agentTaskNotice.value.status,
      message: message || agentTaskNotice.value.message,
      updatedAt: now,
      steps: [
        ...agentTaskNotice.value.steps,
        createAgentTaskNoticeStep(payload.step || payload.message || '状态已更新', payload.status || 'running', payload.detail || '', now)
      ]
    }
  }

  function completeAgentTaskNotice(payload: { id?: string; message?: string; step?: string; detail?: string } = {}) {
    if (!agentTaskNotice.value) return
    if (payload.id && String(payload.id) !== agentTaskNotice.value.id) return
    const now = Date.now()
    agentTaskNotice.value = {
      ...agentTaskNotice.value,
      status: 'success',
      message: String(payload.message || payload.step || '任务已完成').trim() || '任务已完成',
      error: '',
      updatedAt: now,
      finishedAt: now,
      steps: [
        ...agentTaskNotice.value.steps,
        createAgentTaskNoticeStep(payload.step || payload.message || '任务已完成', 'success', payload.detail || '', now)
      ]
    }
    if (agentTaskNoticeTimer) clearTimeout(agentTaskNoticeTimer)
    agentTaskNoticeTimer = setTimeout(() => {
      dismissAgentTaskNotice(agentTaskNotice.value?.id)
    }, 5000)
  }

  function failAgentTaskNotice(payload: { id?: string; message?: string; step?: string; error?: unknown; detail?: string }) {
    if (!agentTaskNotice.value) return
    if (payload.id && String(payload.id) !== agentTaskNotice.value.id) return
    const now = Date.now()
    const errorMessage = formatAgentTaskNoticeError(payload.error || payload.detail || payload.message)
    agentTaskNotice.value = {
      ...agentTaskNotice.value,
      status: 'error',
      message: String(payload.message || payload.step || '任务失败').trim() || '任务失败',
      error: errorMessage,
      updatedAt: now,
      finishedAt: now,
      steps: [
        ...agentTaskNotice.value.steps,
        createAgentTaskNoticeStep(payload.step || payload.message || '任务失败', 'error', errorMessage, now)
      ]
    }
    if (agentTaskNoticeTimer) {
      clearTimeout(agentTaskNoticeTimer)
      agentTaskNoticeTimer = null
    }
  }

  function dismissAgentTaskNotice(id?: string) {
    if (id && agentTaskNotice.value && String(id) !== agentTaskNotice.value.id) return
    if (agentTaskNoticeTimer) {
      clearTimeout(agentTaskNoticeTimer)
      agentTaskNoticeTimer = null
    }
    agentTaskNotice.value = null
  }

  function createAgentTaskNoticeStep(
    label: unknown,
    status: WorkspaceAgentTaskNoticeStepStatus,
    detail: unknown,
    updatedAt: number
  ): WorkspaceAgentTaskNoticeStep {
    return {
      id: `step:${updatedAt}:${Math.random().toString(36).slice(2, 8)}`,
      label: String(label || '状态已更新').trim() || '状态已更新',
      status,
      detail: String(detail || '').trim(),
      updatedAt
    }
  }

  function formatAgentTaskNoticeError(error: unknown) {
    if (error instanceof Error) return error.message || error.name || '未知错误'
    const message = String(error || '').trim()
    return message || '没有记录具体失败原因。'
  }

  function cloneRuntimeList<T extends { id: string }>(items: T[]): T[] {
    return items.map((item) => ({ ...item })) as T[]
  }

  function replacePendingTransactions(nextTransactions: RuntimePendingTransaction[]) {
    pendingTransactions.value = cloneRuntimeList(Array.isArray(nextTransactions) ? nextTransactions : [])
  }

  function upsertPendingTransaction(nextTransaction: RuntimePendingTransaction) {
    if (!nextTransaction?.id) return
    const normalized = { ...nextTransaction, id: String(nextTransaction.id) }
    const index = pendingTransactions.value.findIndex((item) => String(item.id) === normalized.id)
    if (index >= 0) {
      pendingTransactions.value[index] = { ...pendingTransactions.value[index], ...normalized }
      return
    }
    pendingTransactions.value.push(normalized)
  }

  function removePendingTransaction(transactionId: string) {
    const normalizedId = String(transactionId || '')
    pendingTransactions.value = pendingTransactions.value.filter((item) => String(item.id) !== normalizedId)
  }

  function replaceTimerJobs(nextJobs: RuntimeTimerJob[]) {
    timerJobs.value = cloneRuntimeList(Array.isArray(nextJobs) ? nextJobs : [])
  }

  function upsertTimerJob(nextJob: RuntimeTimerJob) {
    if (!nextJob?.id) return
    const normalized = { ...nextJob, id: String(nextJob.id) }
    const index = timerJobs.value.findIndex((item) => String(item.id) === normalized.id)
    if (index >= 0) {
      timerJobs.value[index] = { ...timerJobs.value[index], ...normalized }
      return
    }
    timerJobs.value.push(normalized)
  }

  function removeTimerJob(jobId: string) {
    const normalizedId = String(jobId || '')
    timerJobs.value = timerJobs.value.filter((item) => String(item.id) !== normalizedId)
  }

  function replaceStreamingJobs(nextJobs: RuntimeStreamingJob[]) {
    externalStreamingJobs.value = cloneRuntimeList(Array.isArray(nextJobs) ? nextJobs : [])
  }

  function upsertStreamingJob(nextJob: RuntimeStreamingJob) {
    if (!nextJob?.id) return
    const normalized = { ...nextJob, id: String(nextJob.id) }
    const index = externalStreamingJobs.value.findIndex((item) => String(item.id) === normalized.id)
    if (index >= 0) {
      externalStreamingJobs.value[index] = { ...externalStreamingJobs.value[index], ...normalized }
      return
    }
    externalStreamingJobs.value.push(normalized)
  }

  function removeStreamingJob(jobId: string) {
    const normalizedId = String(jobId || '')
    externalStreamingJobs.value = externalStreamingJobs.value.filter((item) => String(item.id) !== normalizedId)
  }

  function replaceLocalStreamingMessages(nextBuckets: RuntimeMessageBucket | null | undefined) {
    localStreamingMessages.value = nextBuckets && typeof nextBuckets === 'object'
      ? Object.fromEntries(
          Object.entries(nextBuckets).map(([targetId, messages]) => [
            String(targetId || ''),
            (Array.isArray(messages) ? messages : []).map((message) => ({ ...message }))
          ])
        )
      : {}
  }

  function replacePendingPersistedMessages(nextBuckets: RuntimeMessageBucket | null | undefined) {
    pendingPersistedMessages.value = nextBuckets && typeof nextBuckets === 'object'
      ? Object.fromEntries(
          Object.entries(nextBuckets).map(([targetId, messages]) => [
            String(targetId || ''),
            (Array.isArray(messages) ? messages : []).map((message) => ({ ...message }))
          ])
        )
      : {}
  }

  function clearChatRuntimeTarget(targetId: string) {
    const normalizedTargetId = String(targetId || '')
    if (!normalizedTargetId) return
    delete localStreamingMessages.value[normalizedTargetId]
    delete pendingPersistedMessages.value[normalizedTargetId]
  }

  function trackCommand(
    metadata: WorkspaceCommandMetadata,
    state: WorkspaceCommandState,
    extras: Partial<Pick<WorkspaceActiveCommandRecord, 'warnings' | 'retryable' | 'error' | 'snapshotVersion'>> = {}
  ) {
    const now = Date.now()
    const next: WorkspaceActiveCommandRecord = {
      ...metadata,
      state,
      updatedAt: now,
      finishedAt: state === 'committed' || state === 'rolledBack' || state === 'cancelled' ? now : null,
      warnings: Array.isArray(extras.warnings) ? extras.warnings : [],
      retryable: Boolean(extras.retryable),
      error: extras.error || '',
      snapshotVersion: extras.snapshotVersion ?? null
    }
    const index = activeCommands.value.findIndex((item) => item.commandId === metadata.commandId)
    if (index >= 0) {
      activeCommands.value[index] = {
        ...activeCommands.value[index],
        ...next,
        warnings: next.warnings.length ? next.warnings : activeCommands.value[index].warnings,
        error: next.error || activeCommands.value[index].error,
        retryable: next.retryable || activeCommands.value[index].retryable,
        snapshotVersion: next.snapshotVersion ?? activeCommands.value[index].snapshotVersion,
        finishedAt: next.finishedAt ?? activeCommands.value[index].finishedAt
      }
      return
    }
    activeCommands.value.push(next)
  }

  function markCommand(type: string, state: WorkspaceCommandState) {
    trackCommand({
      commandId: `${type}:${Date.now()}`,
      type,
      target: 'unknown',
      optimistic: false,
      issuedAt: Date.now(),
      rollbackPolicy: { mode: 'manual' },
      resumePolicy: { mode: 'none' },
      feedbackPolicy: { mode: 'silent' }
    }, state)
  }

  function syncCommandResult(
    metadata: WorkspaceCommandMetadata,
    result: WorkspaceCommandResult<unknown> | WorkspaceCommandError
  ) {
    trackCommand(metadata, result.state, {
      warnings: result.warnings,
      retryable: result.retryable,
      error: result.ok ? '' : (result.error || result.message),
      snapshotVersion: result.snapshotVersion ?? null
    })
  }

  return {
    hydration,
    isHydrating,
    streamingJobs,
    localStreamingMessages,
    pendingPersistedMessages,
    pendingMessageReconcileJobs,
    chatTaskRuns,
    runningChatTaskRuns,
    hasRunningChatTasks,
    foregroundTaskId,
    foregroundChatTaskRun,
    isGenerating,
    currentAbortController,
    currentMessageModel,
    stopRequested,
    timerJobs,
    syncJobs,
    pendingTransactions,
    activeCommands,
    agentTaskNotice,
    localArchiveActionState,
    feedbackCenter,
    setHydrationStage,
    beginHydration,
    finishHydration,
    failHydration,
    setLocalArchiveAction,
    resetLocalArchiveAction,
    showToast,
    hideToast,
    showBanner,
    hideBanner,
    setBlockingFeedback,
    clearBlockingFeedback,
    startChatTaskRun,
    updateChatTaskRun,
    completeChatTaskRun,
    failChatTaskRun,
    stopChatTaskRun,
    stopForegroundChatTaskRun,
    stopAllChatTaskRuns,
    isChatTaskRunActive,
    startAgentTaskNotice,
    updateAgentTaskNotice,
    completeAgentTaskNotice,
    failAgentTaskNotice,
    dismissAgentTaskNotice,
    replacePendingTransactions,
    upsertPendingTransaction,
    removePendingTransaction,
    replaceTimerJobs,
    upsertTimerJob,
    removeTimerJob,
    replaceStreamingJobs,
    upsertStreamingJob,
    removeStreamingJob,
    replaceLocalStreamingMessages,
    replacePendingPersistedMessages,
    clearChatRuntimeTarget,
    markCommand,
    trackCommand,
    syncCommandResult
  }
})
