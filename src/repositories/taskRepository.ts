import { API } from '../config/api'
import type { DailyActivity, DailyReport, Task, TaskLog, TimerState, UserLevel } from '../types'

export interface ResolvedTaskState {
  tasks: Task[]
  taskLogs: TaskLog[]
  dailyReports: DailyReport[]
  recentMarkTypes: string[]
  userLevel: Partial<UserLevel> | null
  dailyActivity: Partial<DailyActivity> | null
  hasTaskLogs: boolean
  hasDailyReports: boolean
  hasRecentMarkTypes: boolean
}

export interface TaskStoreStateTarget {
  tasks: { value: Task[] }
  taskLogs: { value: TaskLog[] }
  dailyReports: { value: DailyReport[] }
  recentMarkTypes: { value: string[] }
  userLevel: { value: UserLevel }
  dailyActivity: { value: DailyActivity }
}

export function normalizeTaskTimerState(timerState: unknown): TimerState {
  if (timerState && typeof timerState === 'object') {
    const state = timerState as Partial<TimerState>
    return {
      isRunning: Boolean(state.isRunning),
      startTime: typeof state.startTime === 'number' ? state.startTime : null,
      accumulatedTime: typeof state.accumulatedTime === 'number' ? state.accumulatedTime : 0,
      marks: Array.isArray(state.marks) ? state.marks : []
    }
  }
  return {
    isRunning: false,
    startTime: null,
    accumulatedTime: 0,
    marks: []
  }
}

export function resolveTaskState(input: unknown): ResolvedTaskState {
  const data = input && typeof input === 'object' ? input as Record<string, unknown> : {}

  return {
    tasks: Array.isArray(data.tasks)
      ? (data.tasks as Task[]).map((task) => ({
          ...task,
          timerState: normalizeTaskTimerState(task.timerState || task.timer_state)
        }))
      : [],
    taskLogs: Array.isArray(data.taskLogs) ? data.taskLogs as TaskLog[] : [],
    dailyReports: Array.isArray(data.dailyReports) ? data.dailyReports as DailyReport[] : [],
    recentMarkTypes: Array.isArray(data.recentMarkTypes) ? data.recentMarkTypes as string[] : [],
    userLevel: data.userLevel && typeof data.userLevel === 'object' ? data.userLevel as Partial<UserLevel> : null,
    dailyActivity: data.dailyActivity && typeof data.dailyActivity === 'object' ? data.dailyActivity as Partial<DailyActivity> : null,
    hasTaskLogs: Array.isArray(data.taskLogs),
    hasDailyReports: Array.isArray(data.dailyReports),
    hasRecentMarkTypes: Array.isArray(data.recentMarkTypes)
  }
}

export function applyResolvedTaskState(target: TaskStoreStateTarget, resolved: ResolvedTaskState): void {
  target.tasks.value = resolved.tasks
  target.taskLogs.value = resolved.hasTaskLogs ? resolved.taskLogs : target.taskLogs.value
  target.dailyReports.value = resolved.hasDailyReports ? resolved.dailyReports : target.dailyReports.value
  target.recentMarkTypes.value = resolved.hasRecentMarkTypes ? resolved.recentMarkTypes : target.recentMarkTypes.value

  if (resolved.userLevel) {
    target.userLevel.value = { ...target.userLevel.value, ...resolved.userLevel }
  }
  if (resolved.dailyActivity) {
    target.dailyActivity.value = { ...target.dailyActivity.value, ...resolved.dailyActivity }
  }
}

async function readJson<T>(response: Response, fallbackMessage: string): Promise<T> {
  if (!response.ok) {
    throw new Error(fallbackMessage)
  }
  return await response.json() as T
}

async function sendJson(url: string, method: string, body: unknown, fallbackMessage: string): Promise<Response> {
  const response = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  if (!response.ok) {
    throw new Error(fallbackMessage)
  }
  return response
}

export async function createTaskRecord(task: Task): Promise<void> {
  await sendJson(API.TASKS, 'POST', task, '添加任务失败')
}

export async function updateTaskRecord(id: string, changes: Partial<Task>): Promise<void> {
  await sendJson(`${API.TASKS}/${encodeURIComponent(id)}`, 'PUT', changes, '更新任务失败')
}

export async function deleteTaskRecord(id: string): Promise<void> {
  const response = await fetch(`${API.TASKS}/${encodeURIComponent(id)}`, { method: 'DELETE' })
  if (!response.ok) {
    throw new Error('删除任务失败')
  }
}

export async function saveTaskUserLevel(payload: {
  userLevel: UserLevel
  dailyActivity: DailyActivity
}): Promise<void> {
  await sendJson(API.CONFIG, 'PUT', payload, '保存等级信息失败')
}

export async function createTaskLogRecord(log: Record<string, unknown>): Promise<void> {
  await sendJson(API.TASK_LOGS, 'POST', log, '保存任务留档失败')
}

export async function fetchTaskLogs(): Promise<TaskLog[]> {
  const response = await fetch(API.TASK_LOGS)
  return await readJson<TaskLog[]>(response, '加载任务留档失败')
}

export async function createDailyReportRecord(report: DailyReport): Promise<void> {
  await sendJson(API.DAILY_REPORTS, 'POST', report, '添加每日报告失败')
}

export async function fetchDailyReports(): Promise<DailyReport[]> {
  const response = await fetch(API.DAILY_REPORTS)
  return await readJson<DailyReport[]>(response, '加载每日报告失败')
}

export async function updateDailyReportRecord(id: string, changes: Partial<DailyReport>): Promise<void> {
  await sendJson(`${API.DAILY_REPORTS}/${encodeURIComponent(id)}`, 'PUT', changes, '更新每日报告失败')
}
