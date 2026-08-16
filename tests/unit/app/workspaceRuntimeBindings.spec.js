/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick, ref } from 'vue'
import { useWorkspaceRuntimeStore } from '../../../src/app/workspaceRuntimeStore.js'
import { bindWorkspaceRuntimeSources } from '../../../src/app/workspaceRuntimeBindings.js'

describe('workspace runtime bindings', () => {
  it('不再把 runtime 待确认列表回写到旧 compat 镜像', async () => {
    setActivePinia(createPinia())

    const workspaceRuntimeStore = useWorkspaceRuntimeStore()
    bindWorkspaceRuntimeSources({
      workspaceRuntimeStore,
      taskStore: { tasks: [] },
      chatStore: { streamingJobs: [] },
      timerComposable: { activeTimers: ref([]) },
      streamingText: ref(''),
      currentStreamingSpeakerName: ref('')
    })

    await nextTick()

    expect(workspaceRuntimeStore.pendingTransactions).toHaveLength(0)

    workspaceRuntimeStore.replacePendingTransactions([{ id: 'pending_3', type: 'ticket' }])
    await nextTick()

    expect(workspaceRuntimeStore.pendingTransactions).toEqual([{ id: 'pending_3', type: 'ticket' }])
  })

  it('continues to normalize timer jobs and streaming jobs into runtime', async () => {
    setActivePinia(createPinia())

    const workspaceRuntimeStore = useWorkspaceRuntimeStore()

    bindWorkspaceRuntimeSources({
      workspaceRuntimeStore,
      taskStore: {
        tasks: [{
          id: 'task_1',
          title: '整理笔记',
          timerState: {
            isRunning: true,
            startTime: 1000,
            accumulatedTime: 30000,
            marks: [{ id: 'mark_1' }]
          }
        }]
      },
      chatStore: {},
      timerComposable: {
        activeTimers: ref([{
          id: 'timer_1',
          ticketId: 'ticket_1',
          ticketName: '电影票',
          paused: false,
          remainingMs: 60000,
          endTime: 61000
        }])
      },
      streamingText: ref('stream chunk'),
      currentStreamingSpeakerName: ref('星依')
    })

    await nextTick()

    expect(workspaceRuntimeStore.timerJobs).toHaveLength(2)
    expect(workspaceRuntimeStore.timerJobs[0].kind).toBe('ticket')
    expect(workspaceRuntimeStore.timerJobs[1].kind).toBe('task')
    expect(workspaceRuntimeStore.streamingJobs).toHaveLength(1)
    expect(workspaceRuntimeStore.streamingJobs[0].speakerName).toBe('星依')
    expect(workspaceRuntimeStore.streamingJobs[0].event).toBe('delta')
  })

  it('不会覆盖聊天域已经写入 runtime 的流式任务', async () => {
    setActivePinia(createPinia())

    const workspaceRuntimeStore = useWorkspaceRuntimeStore()
    workspaceRuntimeStore.replaceLocalStreamingMessages({
      session_1: [
        {
          _localStreamingKey: 'k1',
          content: '直接写入 runtime',
          name: '星依'
        }
      ]
    })

    bindWorkspaceRuntimeSources({
      workspaceRuntimeStore,
      taskStore: { tasks: [] },
      chatStore: {},
      timerComposable: { activeTimers: ref([]) },
      streamingText: ref(''),
      currentStreamingSpeakerName: ref('')
    })

    await nextTick()

    expect(workspaceRuntimeStore.streamingJobs).toHaveLength(1)
    expect(workspaceRuntimeStore.streamingJobs[0].content).toBe('直接写入 runtime')
    expect(workspaceRuntimeStore.streamingJobs[0].speakerName).toBe('星依')
  })

  it('stores runtime copies instead of reusing old timer item references', async () => {
    setActivePinia(createPinia())

    const workspaceRuntimeStore = useWorkspaceRuntimeStore()
    const activeTimers = ref([{
      id: 'timer_1',
      ticketId: 'ticket_1',
      ticketName: '电影票',
      paused: false,
      remainingMs: 60000,
      endTime: 61000
    }])

    bindWorkspaceRuntimeSources({
      workspaceRuntimeStore,
      taskStore: { tasks: [] },
      chatStore: {},
      timerComposable: { activeTimers },
      streamingText: ref(''),
      currentStreamingSpeakerName: ref('')
    })

    await nextTick()

    expect(workspaceRuntimeStore.timerJobs).toHaveLength(1)
    expect(workspaceRuntimeStore.timerJobs[0]).not.toBe(activeTimers.value[0])

    activeTimers.value[0].ticketName = '演出票'
    await nextTick()

    expect(workspaceRuntimeStore.timerJobs[0].ticketName).toBe('演出票')
  })

  it('兼容旧 timer_state 字段并映射到统一 runtime', async () => {
    setActivePinia(createPinia())

    const workspaceRuntimeStore = useWorkspaceRuntimeStore()

    bindWorkspaceRuntimeSources({
      workspaceRuntimeStore,
      taskStore: {
        tasks: [{
          id: 'task_legacy',
          title: '旧字段任务',
          timer_state: {
            isRunning: true,
            startTime: 2000,
            accumulatedTime: 45000,
            marks: [{ id: 'mark_legacy' }]
          }
        }]
      },
      chatStore: {},
      timerComposable: { activeTimers: ref([]) },
      streamingText: ref(''),
      currentStreamingSpeakerName: ref('')
    })

    await nextTick()

    expect(workspaceRuntimeStore.timerJobs).toHaveLength(1)
    expect(workspaceRuntimeStore.timerJobs[0].id).toBe('task:task_legacy')
    expect(workspaceRuntimeStore.timerJobs[0].kind).toBe('task')
    expect(workspaceRuntimeStore.timerJobs[0].taskTitle).toBe('旧字段任务')
    expect(workspaceRuntimeStore.timerJobs[0].accumulatedTime).toBe(45000)
    expect(workspaceRuntimeStore.timerJobs[0].markCount).toBe(1)
  })
})
