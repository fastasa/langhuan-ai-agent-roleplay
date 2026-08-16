import { describe, expect, it, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useWorkspaceRuntimeStore } from '../../../src/app/workspaceRuntimeStore.ts'

describe('workspaceRuntimeStore chat runtime', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('集中管理聊天运行态基础字段', () => {
    const state = useWorkspaceRuntimeStore()

    state.isGenerating = true
    state.currentMessageModel = 'gpt-test'
    state.stopRequested = true

    expect(state.isGenerating).toBe(true)
    expect(state.currentMessageModel).toBe('gpt-test')
    expect(state.stopRequested).toBe(true)
  })

  it('登记、完成、失败和停止单条聊天任务', () => {
    const state = useWorkspaceRuntimeStore()
    const controller = new AbortController()

    const normalRun = state.startChatTaskRun({
      id: 'run_normal',
      taskKind: 'normalMessage',
      targetId: 'session_1',
      abortController: controller
    })
    const polishRun = state.startChatTaskRun({
      id: 'run_polish',
      taskKind: 'narrationPolish',
      targetId: 'session_1'
    })

    expect(normalRun.taskKind).toBe('normalMessage')
    expect(polishRun.taskKind).toBe('narrationPolish')
    expect(state.isGenerating).toBe(true)
    expect(state.runningChatTaskRuns).toHaveLength(2)

    state.completeChatTaskRun('run_normal')

    expect(state.isChatTaskRunActive('run_normal')).toBe(false)
    expect(state.isGenerating).toBe(true)

    state.failChatTaskRun('run_polish', new Error('模型失败'))

    expect(state.isGenerating).toBe(false)
    expect(state.chatTaskRuns.find((run) => run.id === 'run_polish').error).toBe('模型失败')
  })

  it('停止前台任务不会清空其他运行任务', () => {
    const state = useWorkspaceRuntimeStore()
    const firstController = new AbortController()
    const secondController = new AbortController()

    state.startChatTaskRun({
      id: 'run_first',
      taskKind: 'normalMessage',
      abortController: firstController
    })
    state.startChatTaskRun({
      id: 'run_second',
      taskKind: 'narrationGenerate',
      abortController: secondController
    })

    const stoppedRun = state.stopForegroundChatTaskRun()

    expect(stoppedRun.id).toBe('run_second')
    expect(secondController.signal.aborted).toBe(true)
    expect(firstController.signal.aborted).toBe(false)
    expect(state.isGenerating).toBe(true)
    expect(state.runningChatTaskRuns.map((run) => run.id)).toEqual(['run_first'])
    expect(state.foregroundChatTaskRun.id).toBe('run_first')
  })

  it('多条旁白生成任务可以按完成顺序独立收尾', () => {
    const state = useWorkspaceRuntimeStore()

    state.startChatTaskRun({
      id: 'run_environment',
      taskKind: 'narrationGenerate',
      label: '环境旁白生成',
      targetId: 'char_1',
      sessionId: 'session_1'
    })
    state.startChatTaskRun({
      id: 'run_appearance',
      taskKind: 'narrationGenerate',
      label: '人物旁白生成',
      targetId: 'char_1',
      sessionId: 'session_1'
    })

    state.completeChatTaskRun('run_appearance')

    expect(state.isChatTaskRunActive('run_appearance')).toBe(false)
    expect(state.isChatTaskRunActive('run_environment')).toBe(true)
    expect(state.foregroundChatTaskRun.id).toBe('run_environment')
    expect(state.runningChatTaskRuns.map((run) => run.id)).toEqual(['run_environment'])

    state.completeChatTaskRun('run_environment')

    expect(state.isGenerating).toBe(false)
    expect(state.chatTaskRuns.find((run) => run.id === 'run_appearance')?.status).toBe('completed')
    expect(state.chatTaskRuns.find((run) => run.id === 'run_environment')?.status).toBe('completed')
  })

  it('旧 isGenerating 写入会映射到兼容任务池', () => {
    const state = useWorkspaceRuntimeStore()

    state.isGenerating = true

    expect(state.chatTaskRuns.find((run) => run.id === 'legacy:chat-generation')?.status).toBe('running')
    expect(state.isGenerating).toBe(true)

    state.isGenerating = false

    expect(state.chatTaskRuns.find((run) => run.id === 'legacy:chat-generation')?.status).toBe('completed')
    expect(state.isGenerating).toBe(false)
  })

  it('会从流式消息和待补回消息生成运行态任务视图', () => {
    const state = useWorkspaceRuntimeStore()
    state.replaceLocalStreamingMessages({
      char_1: [
        { _localStreamingKey: 'k1', content: '正在回复', name: '星依' }
      ]
    })
    state.replacePendingPersistedMessages({
      char_1: [
        { id: 99, content: '待补回消息' }
      ]
    })

    expect(state.streamingJobs).toHaveLength(1)
    expect(state.streamingJobs[0].speakerName).toBe('星依')
    expect(state.pendingMessageReconcileJobs).toHaveLength(1)
    expect(state.pendingMessageReconcileJobs[0].messageId).toBe(99)
  })
})
