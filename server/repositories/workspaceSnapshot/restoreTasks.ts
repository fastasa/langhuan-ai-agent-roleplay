import { createTaskRepository } from '../taskRepository.js'
import { getLocalDateKey, toJson, toNum, toText } from './shared.js'
import { getActiveUserId, getActiveWorkspaceId } from '../../localWorkspace.js'

type TaskRepository = ReturnType<typeof createTaskRepository>

function getScopeParams() {
  return [getActiveUserId(), getActiveWorkspaceId()]
}

export function applyTaskSnapshotPartition(database: any, taskRepository: TaskRepository, payload: Record<string, any>) {
  if (Array.isArray(payload.tasks)) {
    taskRepository.replaceTasks(payload.tasks.map((item: any, index: number) => ({
      id: toText(item?.id || `task_${index}`),
      title: toText(item?.title ?? item?.name, ''),
      type: toText(item?.type, 'daily'),
      status: toText(item?.status, 'active'),
      pointsReward: toNum(item?.pointsReward ?? item?.points_reward, 0),
      expReward: toNum(item?.expReward ?? item?.exp_reward, 10),
      deadline: toText(item?.deadline, ''),
      description: toText(item?.description ?? item?.desc, ''),
      assignerName: toText(item?.assignerName ?? item?.assigner_name, ''),
      publishNote: toText(item?.publishNote ?? item?.publish_note, ''),
      completionNote: toText(item?.completionNote ?? item?.completion_note, ''),
      timerState: toJson(item?.timerState ?? item?.timer_state, {}),
      category: toText(item?.category, ''),
      orderIndex: toNum(item?.orderIndex, index)
    })))
  }

  if (Array.isArray(payload.taskLogs)) {
    taskRepository.replaceTaskLogs(payload.taskLogs.map((item: any) => ({
      taskId: toText(item?.taskId ?? item?.task_id, ''),
      taskTitle: toText(item?.taskTitle ?? item?.task_title, ''),
      completedAt: toText(item?.completedAt ?? item?.completed_at, new Date().toISOString()),
      durationSeconds: toNum(item?.durationSeconds ?? item?.duration_seconds, 0),
      timerMarks: toJson(item?.timerMarks ?? item?.timer_marks, []),
      notes: toText(item?.notes, ''),
      expEarned: toNum(item?.expEarned ?? item?.exp_earned, 0)
    })))
  }

  if (Array.isArray(payload.dailyReports)) {
    taskRepository.replaceDailyReports(payload.dailyReports.map((item: any) => ({
      date: toText(item?.date, ''),
      content: toText(item?.content, ''),
      tasksSummary: toText(item?.tasksSummary ?? item?.tasks_summary, ''),
      tomorrowTasks: toJson(item?.tomorrowTasks ?? item?.tomorrow_tasks, []),
      name: toText(item?.name, ''),
      cardColor: toText(item?.cardColor ?? item?.card_color, ''),
      category: toText(item?.category, '')
    })))
  }

  if (Array.isArray(payload.customTags)) {
    database.prepare('/* unscoped */ DELETE FROM custom_tags WHERE user_id = ? AND workspace_id = ?')
      .run(...getScopeParams())
    const stmt = database.prepare('INSERT INTO custom_tags (id, name, color) VALUES (?, ?, ?)')
    payload.customTags.forEach((item: any, index: number) => {
      stmt.run(
        toText(item?.id || `tag_${index}`),
        toText(item?.name || '未命名标签'),
        toText(item?.color || '#8b7355')
      )
    })
  }

  if (Array.isArray(payload.eventStack)) {
    database.prepare('/* unscoped */ DELETE FROM event_stack WHERE user_id = ? AND workspace_id = ?')
      .run(...getScopeParams())
    const stmt = database.prepare(`
      INSERT INTO event_stack (
        id, date, task_id, task_name, task_type, status, exp_reward, duration_seconds, time_axis, notes,
        tickets_used, tickets_exchanged, points_delta, money_delta, time_blocks,
        real_location, real_weather, real_time, timeline_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    payload.eventStack.forEach((item: any, index: number) => {
      stmt.run(
        toText(item?.id || `event_${index}`),
        toText(item?.date, getLocalDateKey()),
        toText(item?.taskId ?? item?.task_id, ''),
        toText(item?.taskName ?? item?.task_name, '未命名事件'),
        toText(item?.taskType ?? item?.task_type, 'resource'),
        toText(item?.status, ''),
        toNum(item?.expReward ?? item?.exp_reward, 0),
        toNum(item?.durationSeconds ?? item?.duration_seconds, 0),
        toText(item?.timeAxis ?? item?.time_axis, ''),
        toText(item?.notes, ''),
        toJson(item?.ticketsUsed ?? item?.tickets_used, {}),
        toJson(item?.ticketsExchanged ?? item?.tickets_exchanged, {}),
        toNum(item?.pointsDelta ?? item?.points_delta, 0),
        toNum(item?.moneyDelta ?? item?.money_delta, 0),
        toJson(item?.timeBlocks ?? item?.time_blocks, null),
        toText(item?.realLocation ?? item?.real_location, ''),
        toText(item?.realWeather ?? item?.real_weather, ''),
        toText(item?.realTime ?? item?.real_time, ''),
        toJson(item?.timelineJson ?? item?.timeline_json, [])
      )
    })
  }
}
