import { beforeEach, describe, expect, it, vi } from 'vitest'

const { addHistoryMock } = vi.hoisted(() => ({
  addHistoryMock: vi.fn()
}))

vi.mock('../../../server/application/shared/dbUtils.js', () => ({
  addHistory: addHistoryMock
}))

import { createWorkspaceTaskFacadeService } from '../../../server/application/workspace/workspaceTaskFacadeService.js'

describe('workspaceTaskFacadeService', () => {
  beforeEach(() => {
    addHistoryMock.mockReset()
  })

  it('routes task log writes through injected repository', () => {
    const insertTaskLog = vi.fn()
    const service = createWorkspaceTaskFacadeService(undefined, {
      taskRepository: {
        getTasks: vi.fn(() => []),
        insertTask: vi.fn(),
        updateTask: vi.fn(),
        deleteTask: vi.fn(),
        insertTaskLog,
        getTaskLogs: vi.fn(() => []),
        insertDailyReport: vi.fn(),
        getDailyReports: vi.fn(() => []),
        updateDailyReport: vi.fn()
      },
      logger: { error: vi.fn() }
    })

    const result = service.addTaskLog({ taskId: 'task_1', taskTitle: '整理', timerMarks: [{ type: 'start' }] })

    expect(result.ok).toBe(true)
    expect(insertTaskLog).toHaveBeenCalled()
  })

  it('adds task and records history', () => {
    const insertTask = vi.fn()
    const updateTask = vi.fn()
    const service = createWorkspaceTaskFacadeService(undefined, {
      taskRepository: {
        getTasks: vi.fn(() => []),
        insertTask,
        updateTask,
        deleteTask: vi.fn(),
        insertTaskLog: vi.fn(),
        getTaskLogs: vi.fn(() => []),
        insertDailyReport: vi.fn(),
        getDailyReports: vi.fn(() => []),
        updateDailyReport: vi.fn()
      },
      logger: { error: vi.fn() }
    })

    const result = service.addTask({ id: 'task_1', title: '整理书桌' })

    expect(result.ok).toBe(true)
    expect(insertTask).toHaveBeenCalled()
    expect(updateTask).toHaveBeenCalled()
    expect(addHistoryMock).toHaveBeenCalledWith('新增任务', '整理书桌')
  })
})
