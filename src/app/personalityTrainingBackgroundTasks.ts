import { reactive } from 'vue'

export type PersonalityTrainingBackgroundTaskKind = 'questionnaire_generation' | 'evaluation'
export type PersonalityTrainingBackgroundTaskStatus = 'running' | 'succeeded' | 'failed' | 'cancelled'

export type PersonalityTrainingBackgroundTaskProgress = {
  stage?: string
  done?: number
  total?: number
  label?: string
}

export type PersonalityTrainingBackgroundTaskSnapshot = {
  key: string
  taskId: string
  kind: PersonalityTrainingBackgroundTaskKind
  characterId: string
  resourceId: string
  status: PersonalityTrainingBackgroundTaskStatus
  progress: PersonalityTrainingBackgroundTaskProgress | null
  error: string
  startedAt: string
  finishedAt: string
  /** 正式执行者；为空表示旧的应用级任务。 */
  workerAgentName?: string
  /** 后台回执只投递到派遣瞬间钉死的原会话。 */
  notification?: {
    sessionId: string
    status: 'pending' | 'delivered' | 'failed'
    error: string
    deliveredAt: string
  } | null
}

type TaskUpdate = {
  progress?: PersonalityTrainingBackgroundTaskProgress | null
}

type TaskRunner<T> = (update: (patch: TaskUpdate) => void) => Promise<T>

// 出题与浏览器本地评测属于应用级运行任务，不属于弹窗生命周期。
// Map 只保存运行态视图；正式结果仍分别落到数据集、评测指标和训练任务台账。
const taskSnapshots = reactive(new Map<string, PersonalityTrainingBackgroundTaskSnapshot>())
const taskPromises = new Map<string, Promise<unknown>>()
let taskSequence = 0

function normalizeKeyPart(value: unknown) {
  return encodeURIComponent(String(value || '').trim() || 'unknown')
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

export function buildPersonalityTrainingBackgroundTaskKey(
  kind: PersonalityTrainingBackgroundTaskKind,
  characterId: string,
  ...resourceIds: string[]
) {
  return ['personality-training', kind, characterId, ...resourceIds]
    .map(normalizeKeyPart)
    .join(':')
}

export function getPersonalityTrainingBackgroundTask(key: string) {
  return taskSnapshots.get(key) || null
}

export function listPersonalityTrainingBackgroundTasks(characterId?: string) {
  const normalizedCharacterId = String(characterId || '').trim()
  return [...taskSnapshots.values()].filter((task) => (
    !normalizedCharacterId || task.characterId === normalizedCharacterId
  ))
}

export function clearPersonalityTrainingBackgroundTask(key: string) {
  if (taskSnapshots.get(key)?.status === 'running') return false
  return taskSnapshots.delete(key)
}

export function runPersonalityTrainingBackgroundTask<T>(input: {
  key: string
  kind: PersonalityTrainingBackgroundTaskKind
  characterId: string
  resourceId: string
  workerAgentName?: string
  notification?: {
    sessionId: string
    deliver(event: {
      snapshot: PersonalityTrainingBackgroundTaskSnapshot
      result?: T
      error?: unknown
    }): Promise<void> | void
  }
  run: TaskRunner<T>
}): Promise<T> {
  const existing = taskSnapshots.get(input.key)
  const existingPromise = taskPromises.get(input.key)
  if (existing?.status === 'running' && existingPromise) return existingPromise as Promise<T>

  taskSequence += 1
  const taskId = `${input.kind}-${Date.now()}-${taskSequence}`
  taskSnapshots.set(input.key, {
    key: input.key,
    taskId,
    kind: input.kind,
    characterId: String(input.characterId || '').trim(),
    resourceId: String(input.resourceId || '').trim(),
    status: 'running',
    progress: null,
    error: '',
    startedAt: new Date().toISOString(),
    finishedAt: '',
    ...(String(input.workerAgentName || '').trim()
      ? { workerAgentName: String(input.workerAgentName).trim() }
      : {}),
    notification: input.notification
      ? {
          sessionId: String(input.notification.sessionId || '').trim(),
          status: 'pending',
          error: '',
          deliveredAt: ''
        }
      : null
  })

  const update = (patch: TaskUpdate) => {
    const current = taskSnapshots.get(input.key)
    if (!current || current.taskId !== taskId || current.status !== 'running') return
    taskSnapshots.set(input.key, {
      ...current,
      ...(patch.progress !== undefined ? { progress: patch.progress } : {})
    })
  }

  const deliverNotification = async (payload: { result?: T; error?: unknown }) => {
    if (!input.notification) return
    const current = taskSnapshots.get(input.key)
    if (!current || current.taskId !== taskId) return
    try {
      await input.notification.deliver({ snapshot: current, ...payload })
      const latest = taskSnapshots.get(input.key)
      if (latest?.taskId === taskId) {
        taskSnapshots.set(input.key, {
          ...latest,
          notification: {
            sessionId: String(input.notification.sessionId || '').trim(),
            status: 'delivered',
            error: '',
            deliveredAt: new Date().toISOString()
          }
        })
      }
    } catch (error) {
      const latest = taskSnapshots.get(input.key)
      if (latest?.taskId === taskId) {
        taskSnapshots.set(input.key, {
          ...latest,
          notification: {
            sessionId: String(input.notification.sessionId || '').trim(),
            status: 'failed',
            error: errorMessage(error),
            deliveredAt: ''
          }
        })
      }
    }
  }

  const promise = Promise.resolve()
    .then(() => input.run(update))
    .then(async (result) => {
      const current = taskSnapshots.get(input.key)
      if (current?.taskId === taskId) {
        taskSnapshots.set(input.key, {
          ...current,
          status: 'succeeded',
          error: '',
          finishedAt: new Date().toISOString()
        })
      }
      await deliverNotification({ result })
      return result
    }, async (error) => {
      const current = taskSnapshots.get(input.key)
      if (current?.taskId === taskId) {
        taskSnapshots.set(input.key, {
          ...current,
          status: error instanceof Error && error.name === 'AbortError' ? 'cancelled' : 'failed',
          error: errorMessage(error),
          finishedAt: new Date().toISOString()
        })
      }
      await deliverNotification({ error })
      throw error
    })
    .finally(() => {
      if (taskPromises.get(input.key) === promise) taskPromises.delete(input.key)
    })

  taskPromises.set(input.key, promise)
  return promise
}
