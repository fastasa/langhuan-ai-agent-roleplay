import { describe, expect, it } from 'vitest'
import { ref } from 'vue'
import { applyResolvedTaskState, normalizeTaskTimerState, resolveTaskState } from '../../../src/repositories/taskRepository.ts'

describe('taskRepository', () => {
  it('统一整理任务快照中的计时器状态', () => {
    const resolved = resolveTaskState({
      tasks: [{
        id: 'task_1',
        title: '测试任务',
        timer_state: {
          isRunning: true,
          startTime: 123,
          accumulatedTime: 456,
          marks: [{ id: 'mark_1' }]
        }
      }],
      recentMarkTypes: ['专注']
    })

    expect(resolved.tasks[0].timerState).toEqual({
      isRunning: true,
      startTime: 123,
      accumulatedTime: 456,
      marks: [{ id: 'mark_1' }]
    })
    expect(resolved.recentMarkTypes).toEqual(['专注'])
  })

  it('缺失计时器时补默认值', () => {
    expect(normalizeTaskTimerState(null)).toEqual({
      isRunning: false,
      startTime: null,
      accumulatedTime: 0,
      marks: []
    })
  })

  it('统一把解析后的任务状态写回 store 目标', () => {
    const target = {
      tasks: ref([]),
      taskLogs: ref([{ id: 'log_old' }]),
      dailyReports: ref([{ id: 'report_old' }]),
      recentMarkTypes: ref(['旧标记']),
      userLevel: ref({ level: 1, exp: 0, expToNext: 100, totalExp: 0, pointsBonus: 0 }),
      dailyActivity: ref({ date: 'today', completedCount: 0, targetCount: 3 })
    }

    applyResolvedTaskState(target, resolveTaskState({
      tasks: [{ id: 'task_1', title: '测试任务' }],
      userLevel: { level: 2 },
      dailyActivity: { completedCount: 1 }
    }))

    expect(target.tasks.value).toHaveLength(1)
    expect(target.taskLogs.value).toEqual([{ id: 'log_old' }])
    expect(target.userLevel.value.level).toBe(2)
    expect(target.dailyActivity.value.completedCount).toBe(1)
  })
})
