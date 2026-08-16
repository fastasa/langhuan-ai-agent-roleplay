import db from '../db.js'
import { toCamel } from '../application/shared/dbUtils.js'
import { getActiveUserId, getActiveWorkspaceId } from '../localWorkspace.js'

type TaskDb = Pick<typeof db, 'prepare'>

function getScopeParams() {
  return [getActiveUserId(), getActiveWorkspaceId()]
}

export function createTaskRepository(database: TaskDb = db) {
  return {
    getTasks() {
      return database.prepare('SELECT * FROM tasks ORDER BY created_at DESC').all().map(toCamel)
    },
    getTasksForSnapshot() {
      return database.prepare('SELECT * FROM tasks ORDER BY order_index').all().map(toCamel)
    },
    insertTask(row: {
      id: string
      title: string
      type: string
      status: string
      pointsReward: number
      expReward: number
      deadline: string | null
      description: string
      assignerName: string
      publishNote: string
      completionNote: string
      timerState: string
      category: string
      orderIndex: number
      createdAt: string
    }) {
      database.prepare(`
        INSERT INTO tasks (
          id, title, type, status, points_reward, exp_reward, deadline, description,
          assigner_name, publish_note, completion_note, timer_state, category, order_index, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        row.id,
        row.title,
        row.type,
        row.status,
        row.pointsReward,
        row.expReward,
        row.deadline,
        row.description,
        row.assignerName,
        row.publishNote,
        row.completionNote,
        row.timerState,
        row.category,
        row.orderIndex,
        row.createdAt
      )
    },
    updateTask(id: string, row: {
      title: unknown
      type: unknown
      status: unknown
      pointsReward: unknown
      expReward: unknown
      deadline: unknown
      description: unknown
      assignerName: unknown
      publishNote: unknown
      completionNote: unknown
      timerState: string | null
      category: unknown
      orderIndex: unknown
    }) {
      database.prepare(`
        UPDATE tasks
        SET title = COALESCE(?, title),
            type = COALESCE(?, type),
            status = COALESCE(?, status),
            points_reward = COALESCE(?, points_reward),
            exp_reward = COALESCE(?, exp_reward),
            deadline = COALESCE(?, deadline),
            description = COALESCE(?, description),
            assigner_name = COALESCE(?, assigner_name),
            publish_note = COALESCE(?, publish_note),
            completion_note = COALESCE(?, completion_note),
            timer_state = COALESCE(?, timer_state),
            category = COALESCE(?, category),
            order_index = COALESCE(?, order_index)
        WHERE id = ?
      `).run(
        row.title,
        row.type,
        row.status,
        row.pointsReward,
        row.expReward,
        row.deadline,
        row.description,
        row.assignerName,
        row.publishNote,
        row.completionNote,
        row.timerState,
        row.category,
        row.orderIndex,
        id
      )
    },
    deleteTask(id: string) {
      database.prepare('DELETE FROM tasks WHERE id = ?').run(id)
      database.prepare('DELETE FROM task_logs WHERE task_id = ?').run(id)
      database.prepare('DELETE FROM event_stack WHERE task_id = ?').run(id)
    },
    insertTaskLog(row: {
      taskId: string
      taskTitle: string
      completedAt: string
      durationSeconds: number
      timerMarks: string
      notes: string
      expEarned: number
    }) {
      database.prepare('INSERT INTO task_logs (task_id, task_title, completed_at, duration_seconds, timer_marks, notes, exp_earned) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
        row.taskId,
        row.taskTitle,
        row.completedAt,
        row.durationSeconds,
        row.timerMarks,
        row.notes,
        row.expEarned
      )
    },
    getTaskLogs() {
      return database.prepare('SELECT * FROM task_logs ORDER BY id DESC').all().map(toCamel)
    },
    insertDailyReport(row: {
      date: string
      content: string
      tasksSummary: string
      tomorrowTasks: string
      name: string
      cardColor: string
      category: string
    }) {
      database.prepare('INSERT INTO daily_reports (date, content, tasks_summary, tomorrow_tasks, name, card_color, category) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
        row.date,
        row.content,
        row.tasksSummary,
        row.tomorrowTasks,
        row.name,
        row.cardColor,
        row.category
      )
    },
    getDailyReports() {
      return database.prepare('SELECT * FROM daily_reports ORDER BY id DESC').all().map(toCamel)
    },
    replaceTasks(rows: Array<{
      id: string
      title: string
      type: string
      status: string
      pointsReward: number
      expReward: number
      deadline: string
      description: string
      assignerName: string
      publishNote: string
      completionNote: string
      timerState: string
      category: string
      orderIndex: number
    }>) {
      database.prepare('/* unscoped */ DELETE FROM tasks WHERE user_id = ? AND workspace_id = ?')
        .run(...getScopeParams())
      const stmt = database.prepare(`
        INSERT INTO tasks (
          id, title, type, status, points_reward, exp_reward, deadline, description,
          assigner_name, publish_note, completion_note, timer_state, category, order_index
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      rows.forEach((row) => {
        stmt.run(
          row.id,
          row.title,
          row.type,
          row.status,
          row.pointsReward,
          row.expReward,
          row.deadline,
          row.description,
          row.assignerName,
          row.publishNote,
          row.completionNote,
          row.timerState,
          row.category,
          row.orderIndex
        )
      })
    },
    replaceTaskLogs(rows: Array<{
      taskId: string
      taskTitle: string
      completedAt: string
      durationSeconds: number
      timerMarks: string
      notes: string
      expEarned: number
    }>) {
      database.prepare('/* unscoped */ DELETE FROM task_logs WHERE user_id = ? AND workspace_id = ?')
        .run(...getScopeParams())
      const stmt = database.prepare(`
        INSERT INTO task_logs (task_id, task_title, completed_at, duration_seconds, timer_marks, notes, exp_earned)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
      rows.forEach((row) => {
        stmt.run(
          row.taskId,
          row.taskTitle,
          row.completedAt,
          row.durationSeconds,
          row.timerMarks,
          row.notes,
          row.expEarned
        )
      })
    },
    replaceDailyReports(rows: Array<{
      date: string
      content: string
      tasksSummary: string
      tomorrowTasks: string
      name: string
      cardColor: string
      category: string
    }>) {
      database.prepare('/* unscoped */ DELETE FROM daily_reports WHERE user_id = ? AND workspace_id = ?')
        .run(...getScopeParams())
      const stmt = database.prepare(`
        INSERT INTO daily_reports (date, content, tasks_summary, tomorrow_tasks, name, card_color, category)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
      rows.forEach((row) => {
        stmt.run(
          row.date,
          row.content,
          row.tasksSummary,
          row.tomorrowTasks,
          row.name,
          row.cardColor,
          row.category
        )
      })
    },
    updateDailyReport(id: string, row: {
      date: string | null
      content: string | null
      tasksSummary: string | null
      tomorrowTasks: string | null
      name: string | null
      cardColor: string | null
      category: string | null
    }) {
      database.prepare(`
        UPDATE daily_reports
        SET date = COALESCE(?, date),
            content = COALESCE(?, content),
            tasks_summary = COALESCE(?, tasks_summary),
            tomorrow_tasks = COALESCE(?, tomorrow_tasks),
            name = COALESCE(?, name),
            card_color = COALESCE(?, card_color),
            category = COALESCE(?, category)
        WHERE id = ?
      `).run(
        row.date,
        row.content,
        row.tasksSummary,
        row.tomorrowTasks,
        row.name,
        row.cardColor,
        row.category,
        id
      )
    }
  }
}

export const taskRepository = createTaskRepository()
