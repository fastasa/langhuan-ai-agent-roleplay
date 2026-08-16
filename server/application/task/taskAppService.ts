import { addHistory } from '../shared/dbUtils.js'
import { taskRepository } from '../../repositories/taskRepository.js'

export function createTaskAppService(repository = taskRepository) {
  return {
    getTasks() {
      return repository.getTasks()
    },
    addTask(payload: Record<string, any>) {
      const {
        id,
        title,
        name,
        type,
        status,
        pointsReward,
        reward,
        expReward,
        deadline,
        dueDate,
        description,
        desc,
        assignerName,
        from,
        publishNote,
        completionNote,
        timerState,
        category,
        orderIndex,
        createdAt
      } = payload
      const now = createdAt || new Date().toISOString()
      repository.insertTask({
        id,
        title: title || name || '',
        type: type || 'daily',
        status: status || 'active',
        pointsReward: Number(pointsReward ?? reward ?? 0),
        expReward: Number(expReward ?? reward ?? 10),
        deadline: deadline || dueDate || null,
        description: description || desc || '',
        assignerName: assignerName || from || '',
        publishNote: publishNote || '',
        completionNote: completionNote || '',
        timerState: JSON.stringify(timerState ?? { isRunning: false, startTime: null, accumulatedTime: 0, marks: [] }),
        category: category || '',
        orderIndex: Number(orderIndex ?? 0),
        createdAt: now
      })
      addHistory('ADD_TASK', title || name || '')
      return { ok: true, id }
    },
    updateTask(id: string, payload: Record<string, any>) {
      const {
        title,
        name,
        type,
        status,
        pointsReward,
        expReward,
        deadline,
        dueDate,
        description,
        desc,
        assignerName,
        from,
        publishNote,
        completionNote,
        timerState,
        category,
        orderIndex
      } = payload
      const toDb = (value: unknown) => value === undefined ? null : value
      repository.updateTask(id, {
        title: toDb(title ?? name),
        type: toDb(type),
        status: toDb(status),
        pointsReward: toDb(pointsReward),
        expReward: toDb(expReward),
        deadline: toDb(deadline ?? dueDate),
        description: toDb(description ?? desc),
        assignerName: toDb(assignerName ?? from),
        publishNote: toDb(publishNote),
        completionNote: toDb(completionNote),
        timerState: timerState !== undefined ? JSON.stringify(timerState ?? {}) : null,
        category: toDb(category),
        orderIndex: toDb(orderIndex)
      })
      return { ok: true }
    },
    deleteTask(id: string) {
      repository.deleteTask(id)
      return { ok: true }
    },
    addTaskLog(payload: Record<string, any>) {
      const { taskId, taskTitle, completedAt, durationSeconds, timerMarks, notes, expEarned } = payload
      repository.insertTaskLog({
        taskId: taskId ?? '',
        taskTitle: taskTitle ?? '',
        completedAt: completedAt ?? new Date().toISOString(),
        durationSeconds: durationSeconds ?? 0,
        timerMarks: JSON.stringify(timerMarks ?? []),
        notes: notes ?? '',
        expEarned: expEarned ?? 0
      })
      return { ok: true }
    },
    getTaskLogs() {
      return repository.getTaskLogs()
    },
    addDailyReport(payload: Record<string, any>) {
      const { date, content, tasksSummary, tomorrowTasks, name, cardColor, category } = payload
      repository.insertDailyReport({
        date,
        content,
        tasksSummary: tasksSummary ?? '',
        tomorrowTasks: JSON.stringify(tomorrowTasks ?? []),
        name: name ?? '',
        cardColor: cardColor ?? '',
        category: category ?? ''
      })
      addHistory('ADD_DAILY_REPORT', date ?? '')
      return { ok: true }
    },
    getDailyReports() {
      return repository.getDailyReports()
    },
    updateDailyReport(id: string, payload: Record<string, any>) {
      const { date, content, tasksSummary, tomorrowTasks, name, cardColor, category } = payload ?? {}
      repository.updateDailyReport(id, {
        date: date ?? null,
        content: content ?? null,
        tasksSummary: tasksSummary ?? null,
        tomorrowTasks: tomorrowTasks !== undefined ? JSON.stringify(tomorrowTasks) : null,
        name: name ?? null,
        cardColor: cardColor ?? null,
        category: category ?? null
      })
      return { ok: true }
    }
  }
}

export const taskAppService = createTaskAppService()
