import { describe, expect, it, vi } from 'vitest'
import { createTaskAppService } from '../../../server/application/task/taskAppService.ts'

describe('taskAppService', () => {
  it('passes normalized task log payload to repository', () => {
    const insertTaskLog = vi.fn()
    const service = createTaskAppService({ insertTaskLog })

    service.addTaskLog({
      taskId: 'task_1',
      taskTitle: '整理书桌',
      durationSeconds: 120,
      timerMarks: [{ type: 'start' }],
      notes: '已完成',
      expEarned: 10
    })

    expect(insertTaskLog).toHaveBeenCalledWith({
      taskId: 'task_1',
      taskTitle: '整理书桌',
      completedAt: expect.any(String),
      durationSeconds: 120,
      timerMarks: JSON.stringify([{ type: 'start' }]),
      notes: '已完成',
      expEarned: 10
    })
  })

  it('passes normalized daily report payload to repository', () => {
    const updateDailyReport = vi.fn()
    const service = createTaskAppService({ updateDailyReport })

    service.updateDailyReport('3', {
      content: '今天很充实',
      tomorrowTasks: ['继续整理'],
      name: '4月3日',
      category: '日记'
    })

    expect(updateDailyReport).toHaveBeenCalledWith('3', {
      date: null,
      content: '今天很充实',
      tasksSummary: null,
      tomorrowTasks: JSON.stringify(['继续整理']),
      name: '4月3日',
      cardColor: null,
      category: '日记'
    })
  })
})
