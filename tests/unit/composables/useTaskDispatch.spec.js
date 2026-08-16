import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { executeTaskDispatchCommand, useTaskDispatch } from '../../../src/composables/app/useTaskDispatch.ts'

const { fetchChatContextForTaskDispatch } = vi.hoisted(() => ({
  fetchChatContextForTaskDispatch: vi.fn()
}))

vi.mock('../../../src/repositories/chatRepository.ts', () => ({
  fetchChatContextForTaskDispatch
}))

function createTaskDispatchDeps() {
  const toast = vi.fn()
  const callAI = vi.fn(async () => [
    '任务名称：整理书桌',
    '任务备注：把桌面和抽屉整理好',
    '任务分类：生活',
    '经验：20',
    '奖励：3'
  ].join('\n'))
  const addTask = vi.fn(async () => {})

  return {
    toast,
    callAI,
    addTask,
    api: useTaskDispatch({
      taskAssignerChar: ref('char_1'),
      taskLoadContact: ref('char_2'),
      isRequestingTask: ref(false),
      currentTaskTab: ref('daily'),
      charStore: {
        getCharacter: () => ({
          id: 'char_1',
          name: '星依',
          defaultPreset: 'main'
        })
      },
      settingStore: {
        defaultPreset: { name: 'main' },
        getCurrentApiConfig: () => ({ name: 'main', model: 'gpt-test' })
      },
      taskStore: {
        addTask
      },
      chatStore: {
        smallSummaries: [{ id: 'summary_1', name: '今天', content: '一起整理房间' }],
        bigSummaries: [],
        summaryLibrary: []
      },
      buildSystemPrompt: () => '你是星依',
      callAI,
      toast
    })
  }
}

describe('useTaskDispatch', () => {
  it('派发任务时会通过仓储层读取聊天上下文', async () => {
    fetchChatContextForTaskDispatch.mockResolvedValueOnce({
      session: { loadedSummaryIds: ['summary_1'] },
      messages: [
        { role: 'user', content: '我今天想整理一下房间' },
        { role: 'assistant', content: '可以先从书桌开始' }
      ]
    })

    const { api, addTask, toast } = createTaskDispatchDeps()

    await api.dispatchAITask()

    expect(fetchChatContextForTaskDispatch).toHaveBeenCalledWith('char_2')
    expect(addTask).toHaveBeenCalledTimes(1)
    expect(toast).toHaveBeenCalledWith('已派发任务：整理书桌', 'success')
  })

  it('上下文读取失败时仍继续派发任务', async () => {
    fetchChatContextForTaskDispatch.mockRejectedValueOnce(new Error('读取任务上下文失败'))

    const { api, addTask, callAI, toast } = createTaskDispatchDeps()

    await api.dispatchAITask()

    expect(callAI).toHaveBeenCalledTimes(1)
    expect(addTask).toHaveBeenCalledTimes(1)
    expect(toast).toHaveBeenCalledWith('已派发任务：整理书桌', 'success')
  })

  it('显式命令入口会复用同一套任务派发逻辑', async () => {
    fetchChatContextForTaskDispatch.mockResolvedValueOnce({
      session: { loadedSummaryIds: ['summary_1'] },
      messages: [{ role: 'user', content: '帮我安排一下今天的学习任务' }]
    })

    const { addTask, toast, callAI } = createTaskDispatchDeps()
    const deps = {
      taskAssignerChar: ref('char_1'),
      taskLoadContact: ref('char_2'),
      isRequestingTask: ref(false),
      currentTaskTab: ref('daily'),
      charStore: {
        getCharacter: () => ({ id: 'char_1', name: '星依', defaultPreset: 'main' })
      },
      settingStore: {
        defaultPreset: { name: 'main' },
        getCurrentApiConfig: () => ({ name: 'main', model: 'gpt-test' })
      },
      taskStore: { addTask },
      chatStore: {
        smallSummaries: [{ id: 'summary_1', name: '今天', content: '一起整理房间' }],
        bigSummaries: [],
        summaryLibrary: []
      },
      buildSystemPrompt: () => '你是星依',
      callAI,
      toast
    }

    await executeTaskDispatchCommand(deps)

    expect(addTask).toHaveBeenCalledTimes(1)
    expect(toast).toHaveBeenCalledWith('已派发任务：整理书桌', 'success')
  })
})
