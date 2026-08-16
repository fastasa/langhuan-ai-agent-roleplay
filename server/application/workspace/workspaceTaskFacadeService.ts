import { addHistory } from '../shared/dbUtils.js'
import db from '../../db.js'
import { logger as defaultLogger } from '../../logger.js'
import { createTaskRepository } from '../../repositories/taskRepository.js'

type WorkspaceTaskFacadeDb = Pick<typeof db, 'prepare'>

type WorkspaceTaskFacadeDeps = {
  taskRepository?: ReturnType<typeof createTaskRepository>
  logger?: Pick<typeof defaultLogger, 'error'>
}

export function createWorkspaceTaskFacadeService(
  database: WorkspaceTaskFacadeDb = db,
  deps: WorkspaceTaskFacadeDeps = {}
) {
  const taskRepository = deps.taskRepository ?? createTaskRepository(database)
  const serviceLogger = deps.logger ?? defaultLogger

  return {
    getTasks() {
      return taskRepository.getTasks()
    },
    addTask(payload: Record<string, any>) {
      const {
        id, title, type, status, pointsReward, expReward, deadline, description, orderIndex,
        assignerName, publishNote, completionNote, timerState, category
      } = payload
      taskRepository.insertTask({
        id,
        title,
        description: description ?? '',
        status: status ?? 'active',
        priority: type ?? 'daily',
        dueDate: deadline ?? '',
        createdAt: new Date().toISOString()
      })
      taskRepository.updateTask(id, {
        title: title ?? null,
        type: type ?? 'daily',
        status: status ?? 'active',
        pointsReward: pointsReward ?? 0,
        expReward: expReward ?? 10,
        deadline: deadline ?? '',
        description: description ?? '',
        assignerName: assignerName ?? '',
        publishNote: publishNote ?? '',
        completionNote: completionNote ?? '',
        timerState: timerState ? JSON.stringify(timerState) : '',
        category: category ?? '',
        orderIndex: orderIndex ?? 0
      })
      addHistory('新增任务', title)
      return { ok: true as const }
    },
    updateTask(id: string, payload: Record<string, any>) {
      try {
        const {
          title, name, type, status, pointsReward, expReward, deadline, description, desc, orderIndex,
          assignerName, publishNote, completionNote, timerState, category
        } = payload ?? {}
        const toDb = (value: unknown) => value === undefined ? null : value
        const normalizedTimerState = timerState === undefined ? null : JSON.stringify(timerState ?? '')

        taskRepository.updateTask(id, {
          title: toDb(title ?? name),
          type: toDb(type),
          status: toDb(status),
          pointsReward: toDb(pointsReward),
          expReward: toDb(expReward),
          deadline: toDb(deadline),
          description: toDb(description ?? desc),
          assignerName: toDb(assignerName),
          publishNote: toDb(publishNote),
          completionNote: toDb(completionNote),
          timerState: normalizedTimerState,
          category: toDb(category),
          orderIndex: toDb(orderIndex)
        })
        return { ok: true as const }
      } catch (error) {
        serviceLogger.error('鏇存柊浠诲姟澶辫触:', error)
        return { ok: false as const, status: 500, error: '鏇存柊浠诲姟澶辫触' }
      }
    },
    deleteTask(id: string) {
      taskRepository.deleteTask(id)
      return { ok: true as const }
    },
    addTaskLog(payload: Record<string, any>) {
      const { taskId, taskTitle, completedAt, durationSeconds, timerMarks, notes, expEarned } = payload
      taskRepository.insertTaskLog({
        taskId: taskId ?? '',
        taskTitle,
        completedAt: completedAt ?? new Date().toISOString(),
        durationSeconds: durationSeconds ?? 0,
        timerMarks: JSON.stringify(timerMarks ?? []),
        notes: notes ?? '',
        expEarned: expEarned ?? 0
      })
      return { ok: true as const }
    },
    getTaskLogs() {
      return taskRepository.getTaskLogs()
    },
    addDailyReport(payload: Record<string, any>) {
      const { date, content, tasksSummary, tomorrowTasks, name, cardColor, category } = payload
      taskRepository.insertDailyReport({
        date,
        content,
        tasksSummary: tasksSummary ?? '',
        tomorrowTasks: JSON.stringify(tomorrowTasks ?? []),
        name: name ?? '',
        cardColor: cardColor ?? '',
        category: category ?? ''
      })
      return { ok: true as const }
    },
    getDailyReports() {
      return taskRepository.getDailyReports()
    },
    updateDailyReport(id: string, payload: Record<string, any>) {
      const { date, content, tasksSummary, tomorrowTasks, name, cardColor, category } = payload ?? {}
      taskRepository.updateDailyReport(id, {
        date: date ?? null,
        content: content ?? null,
        tasksSummary: tasksSummary ?? null,
        tomorrowTasks: tomorrowTasks !== undefined ? JSON.stringify(tomorrowTasks ?? []) : null,
        name: name ?? null,
        cardColor: cardColor ?? null,
        category: category ?? null
      })
      return { ok: true as const }
    }
  }
}

export const workspaceTaskFacadeService = createWorkspaceTaskFacadeService()
