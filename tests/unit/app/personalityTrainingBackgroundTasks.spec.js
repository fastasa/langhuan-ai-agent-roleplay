import { describe, expect, it, vi } from 'vitest'

import {
  buildPersonalityTrainingBackgroundTaskKey,
  clearPersonalityTrainingBackgroundTask,
  getPersonalityTrainingBackgroundTask,
  runPersonalityTrainingBackgroundTask
} from '../../../src/app/personalityTrainingBackgroundTasks'

describe('personalityTrainingBackgroundTasks', () => {
  it('任务不依赖弹窗可见态，并持续记录进度与完成状态', async () => {
    const key = buildPersonalityTrainingBackgroundTaskKey('questionnaire_generation', 'char_1', 'dataset_1')
    let release
    const pending = new Promise((resolve) => { release = resolve })

    const task = runPersonalityTrainingBackgroundTask({
      key,
      kind: 'questionnaire_generation',
      characterId: 'char_1',
      resourceId: 'dataset_1',
      run: async (update) => {
        update({ progress: { stage: 'training_batch', done: 2, total: 10, label: '训练题已落库 20/90' } })
        await pending
        return 'done'
      }
    })

    await Promise.resolve()
    expect(getPersonalityTrainingBackgroundTask(key)).toMatchObject({
      status: 'running',
      characterId: 'char_1',
      resourceId: 'dataset_1',
      progress: { done: 2, total: 10 }
    })

    release()
    await expect(task).resolves.toBe('done')
    expect(getPersonalityTrainingBackgroundTask(key)?.status).toBe('succeeded')
    expect(clearPersonalityTrainingBackgroundTask(key)).toBe(true)
  })

  it('同一角色同一资源的运行中任务只启动一次', async () => {
    const key = buildPersonalityTrainingBackgroundTaskKey('evaluation', 'char_2', 'version_1', 'eval_1')
    let starts = 0
    let release
    const pending = new Promise((resolve) => { release = resolve })
    const spec = {
      key,
      kind: 'evaluation',
      characterId: 'char_2',
      resourceId: 'version_1:eval_1',
      run: async () => {
        starts += 1
        await pending
        return 0.75
      }
    }

    const first = runPersonalityTrainingBackgroundTask(spec)
    const second = runPersonalityTrainingBackgroundTask(spec)
    expect(first).toBe(second)
    expect(starts).toBe(0)

    release()
    await expect(first).resolves.toBe(0.75)
    expect(starts).toBe(1)
    clearPersonalityTrainingBackgroundTask(key)
  })

  it('后台任务完成后投递原会话回报，通知失败不反向伪造任务失败', async () => {
    const key = buildPersonalityTrainingBackgroundTaskKey('questionnaire_generation', 'char_notice', 'dataset_notice')
    const deliver = vi.fn(async ({ snapshot, result }) => {
      expect(snapshot.status).toBe('succeeded')
      expect(result).toBe('卷已落库')
    })
    const task = runPersonalityTrainingBackgroundTask({
      key,
      kind: 'questionnaire_generation',
      characterId: 'char_notice',
      resourceId: 'dataset_notice',
      workerAgentName: '设问',
      notification: { sessionId: 'session-origin', deliver },
      run: async () => '卷已落库'
    })
    await expect(task).resolves.toBe('卷已落库')
    expect(deliver).toHaveBeenCalledTimes(1)
    expect(getPersonalityTrainingBackgroundTask(key)).toMatchObject({
      status: 'succeeded',
      workerAgentName: '设问',
      notification: {
        sessionId: 'session-origin',
        status: 'delivered'
      }
    })
    clearPersonalityTrainingBackgroundTask(key)
  })
})
