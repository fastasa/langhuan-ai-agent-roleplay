import { createTaskRepository } from '../taskRepository.js'

type TaskRepository = ReturnType<typeof createTaskRepository>

export function readTaskSnapshotPartition(taskRepository: TaskRepository) {
  return {
    tasks: taskRepository.getTasksForSnapshot(),
    taskLogs: taskRepository.getTaskLogs(),
    dailyReports: taskRepository.getDailyReports()
  }
}
