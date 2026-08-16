/**
 * @vitest-environment jsdom
 */
// useWorkspaceAgentController 单测（地图与剧本工作区专业Agent计划批B；修复批G去掉死代码 confirmWrite）：
// 覆盖 send() 的 running 守卫、abort 静默收尾（不推错误气泡）、runner 真实错误推错误气泡、
// stop() 对 pendingInteraction/pendingMapDraftReview 的清理。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useWorkspaceAgentController } from '../../../src/composables/useWorkspaceAgentController.ts'
import { createScopeConfirmWriteChannel, createScopeMapDraftReviewChannel, resetWorkspaceAgentScopeStateForTest } from '../../../src/app/workspaceAgentScopeState.ts'
import { resetAgentConversationContinuationsForTest } from '../../../src/app/agentRuntime/conversationContinuation.ts'

function mockFetchOnce(bundle) {
  return vi.fn(async () => ({ ok: true, json: async () => bundle }))
}

// send() 修复后会先 ensure 会话（BUG2）：多数 send 测试需要一个"ensure 成功"的通用 fetch 桩。
function stubEnsureFetch(sessionId = 'session_default') {
  const fetchMock = mockFetchOnce({ session: { id: sessionId }, messages: [] })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('useWorkspaceAgentController', () => {
  beforeEach(() => {
    resetWorkspaceAgentScopeStateForTest()
    resetAgentConversationContinuationsForTest()
  })
  afterEach(() => {
    resetWorkspaceAgentScopeStateForTest()
    resetAgentConversationContinuationsForTest()
    vi.unstubAllGlobals()
  })

  it('send()：无 sessionId 时先 ensure 会话，成功后用户消息与回复都落库（BUG2）', async () => {
    const runner = vi.fn(async () => ({ reply: '收到' }))
    const fetchMock = vi.fn(async (url) => {
      if (String(url).includes('/workspace-agent/ensure')) {
        return { ok: true, json: async () => ({ session: { id: 'session_a' }, messages: [] }) }
      }
      return { ok: true, json: async () => ({ id: 1 }) }
    })
    vi.stubGlobal('fetch', fetchMock)
    const controller = useWorkspaceAgentController('scriptwriter:world_a', 'scriptwriter', 'world_a', '编剧', runner)

    await controller.send('第一句话')

    expect(runner).toHaveBeenCalledTimes(1)
    expect(controller.state.sessionId).toBe('session_a')
    expect(controller.state.messages.map((m) => m.content)).toEqual(['第一句话', '收到'])
    // ensure 一次 + 用户消息落库 + 助手回复落库
    const persistCalls = fetchMock.mock.calls.filter(([url]) => String(url).includes('session_a'))
    expect(persistCalls).toHaveLength(2)
  })

  it('send()：runner 写入共享信息流后，回复内联收编并随 assistant 消息落库', async () => {
    const fetchMock = vi.fn(async (url) => {
      if (String(url).includes('/workspace-agent/ensure')) {
        return { ok: true, json: async () => ({ session: { id: 'session_stream' }, messages: [] }) }
      }
      return { ok: true, json: async () => ({ id: 1 }) }
    })
    vi.stubGlobal('fetch', fetchMock)
    const runner = vi.fn(async ({ turnStream }) => {
      await turnStream.trackModelCall(0, async () => ({ content: 'ok' }))
      turnStream.feedProgress({ kind: 'tool-start', turnIndex: 0, toolName: 'readScene', detail: '{"id":"scene_1"}' })
      turnStream.feedProgress({ kind: 'tool-result', turnIndex: 0, toolName: 'readScene', status: 'success' })
      return { reply: '场景已经读完。' }
    })
    const controller = useWorkspaceAgentController(
      'scriptwriter:world_stream', 'scriptwriter', 'world_stream', '编剧', runner
    )

    await controller.send('看看场景')

    const reply = controller.state.messages.at(-1)
    expect(reply.turnStream.map((item) => item.label)).toEqual(['第 1 轮', '模型思考', 'readScene'])
    expect(reply.turnStream.every((item) => item.durationMs !== undefined)).toBe(true)
    expect(controller.state.turnStream.entries).toEqual([])

    const assistantPersist = fetchMock.mock.calls.find(([, init]) => {
      if (init?.method !== 'POST') return false
      const body = JSON.parse(String(init.body || '{}'))
      return body.role === 'assistant'
    })
    const assistantBody = JSON.parse(String(assistantPersist[1].body))
    expect(JSON.parse(assistantBody.turn_stream_json).map((item) => item.label)).toEqual([
      '第 1 轮', '模型思考', 'readScene'
    ])
  })

  it('send()：runner 可把过程消息立刻显示并落库，随后继续写最终回复', async () => {
    const fetchMock = vi.fn(async (url) => {
      if (String(url).includes('/workspace-agent/ensure')) {
        return { ok: true, json: async () => ({ session: { id: 'session_interim' }, messages: [] }) }
      }
      return { ok: true, json: async () => ({ id: 1 }) }
    })
    vi.stubGlobal('fetch', fetchMock)
    const runner = vi.fn(async ({ emitInterimMessage }) => {
      await emitInterimMessage('先核对最后一批题目，马上继续。')
      return { reply: '核对完成，共 90 题。' }
    })
    const controller = useWorkspaceAgentController(
      'personality_trainer:char_1', 'personality_trainer', 'char_1', '人格训练师', runner
    )

    await controller.send('核对并汇总')

    expect(controller.state.messages.map((item) => item.content)).toEqual([
      '核对并汇总',
      '先核对最后一批题目，马上继续。',
      '核对完成，共 90 题。'
    ])
    const persistedAssistantBodies = fetchMock.mock.calls
      .filter(([, init]) => init?.method === 'POST')
      .map(([, init]) => JSON.parse(String(init.body || '{}')))
      .filter((body) => body.role === 'assistant')
    expect(persistedAssistantBodies.map((body) => body.content)).toEqual([
      '先核对最后一批题目，马上继续。',
      '核对完成，共 90 题。'
    ])
  })

  it('loadOrEnsureSession：历史 assistant 的 turn_stream_json 通过共享解析器恢复', async () => {
    const stored = JSON.stringify([
      { kind: 'turn', label: '第 1 轮', at: 100, durationMs: 80 },
      { kind: 'tool', label: '模型思考', at: 100, durationMs: 80, status: 'success' }
    ])
    vi.stubGlobal('fetch', mockFetchOnce({
      session: { id: 'session_history_stream' },
      messages: [{ role: 'assistant', content: '旧回复', turnStreamJson: stored }]
    }))
    const controller = useWorkspaceAgentController(
      'cartographer:world_history:sheet_1', 'cartographer', 'world_history:sheet_1', '舆图师', vi.fn()
    )

    await controller.loadOrEnsureSession()

    expect(controller.state.messages).toEqual([{
      role: 'assistant',
      content: '旧回复',
      turnStream: [
        { kind: 'turn', label: '第 1 轮', at: 100, durationMs: 80 },
        { kind: 'tool', label: '模型思考', at: 100, durationMs: 80, status: 'success' }
      ]
    }])
  })

  it('send()：ensure 未完成时发起（mock fetch 延迟），消息最终落库且乐观气泡不被整表替换吞掉（BUG2）', async () => {
    let resolveEnsure
    const ensureGate = new Promise((resolve) => { resolveEnsure = resolve })
    const fetchMock = vi.fn(async (url) => {
      if (String(url).includes('/workspace-agent/ensure')) {
        await ensureGate
        return { ok: true, json: async () => ({ session: { id: 'session_slow' }, messages: [{ role: 'assistant', content: '历史回复', id: 1 }] }) }
      }
      return { ok: true, json: async () => ({ id: 2 }) }
    })
    vi.stubGlobal('fetch', fetchMock)
    const runner = vi.fn(async () => ({ reply: '新回复' }))
    const controller = useWorkspaceAgentController('scriptwriter:world_slow', 'scriptwriter', 'world_slow', '编剧', runner)

    // 模拟 Shell onMounted 的 fire-and-forget ensure 与用户立即发送并发
    void controller.loadOrEnsureSession()
    const sendPromise = controller.send('抢跑消息')
    await Promise.resolve()
    // ensure 未回包期间乐观气泡还没推（先等 ensure），且不会重复发起 ensure（in-flight 去重）
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes('/workspace-agent/ensure'))).toHaveLength(1)

    resolveEnsure()
    await sendPromise

    // 整表替换发生在乐观 push 之前：历史回复与本轮消息都在，乐观气泡没被吞
    expect(controller.state.messages.map((m) => m.content)).toEqual(['历史回复', '抢跑消息', '新回复'])
    // 用户消息与助手回复都以 session_slow 落库
    const persistCalls = fetchMock.mock.calls.filter(([url]) => String(url).includes('session_slow'))
    expect(persistCalls).toHaveLength(2)
  })

  it('send()：ensure 失败时不发送、不调 runner，错误以气泡报给用户（BUG2 失败分支）', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('网络断了') }))
    const runner = vi.fn(async () => ({ reply: '不该出现' }))
    const controller = useWorkspaceAgentController('scriptwriter:world_fail', 'scriptwriter', 'world_fail', '编剧', runner)

    await controller.send('这句发不出去')

    expect(runner).not.toHaveBeenCalled()
    const lastMessage = controller.state.messages.at(-1)
    expect(lastMessage.role).toBe('assistant')
    expect(lastMessage.content).toContain('网络断了')
    expect(controller.state.running).toBe(false)
    expect(controller.state.abortController).toBeNull()
  })

  it('send()：running 期间重复调用被忽略（不会并发跑两轮）', async () => {
    stubEnsureFetch('session_b')
    let resolveRunner
    const runner = vi.fn(() => new Promise((resolve) => { resolveRunner = resolve }))
    const controller = useWorkspaceAgentController('scriptwriter:world_b', 'scriptwriter', 'world_b', '编剧', runner)

    const first = controller.send('第一轮')
    expect(controller.state.running).toBe(true)
    await controller.send('第二轮（应被忽略）')
    // ensure 前置后 runner 要等几个微任务才启动，等到它被调到再继续
    await vi.waitFor(() => expect(runner).toHaveBeenCalledTimes(1))

    expect(runner).toHaveBeenCalledTimes(1)
    resolveRunner({ reply: '完成' })
    await first
    expect(controller.state.running).toBe(false)
  })

  it('stop() 触发 abort：runner 抛 AbortError 时静默收尾，不推错误气泡', async () => {
    stubEnsureFetch('session_c')
    const runner = vi.fn(({ signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => {
        const error = new Error('aborted')
        error.name = 'AbortError'
        reject(error)
      })
    }))
    const controller = useWorkspaceAgentController('scriptwriter:world_c', 'scriptwriter', 'world_c', '编剧', runner)

    const sendPromise = controller.send('这句话会被打断')
    await vi.waitFor(() => expect(runner).toHaveBeenCalledTimes(1))
    controller.stop()
    await sendPromise

    expect(controller.state.running).toBe(false)
    expect(controller.state.messages.map((m) => m.content)).toEqual(['这句话会被打断'])
  })

  it('stop 后补充消息续接同一会话 TODO 与已发现工具，新建会话才清空当前视图', async () => {
    const fetchMock = vi.fn(async (url) => {
      if (String(url).includes('/workspace-agent/ensure')) {
        return { ok: true, json: async () => ({ session: { id: 'session_continue' }, messages: [] }) }
      }
      if (String(url).includes('/workspace-agent/new')) {
        return { ok: true, json: async () => ({ session: { id: 'session_new' }, messages: [] }) }
      }
      return { ok: true, json: async () => ({ id: 1 }) }
    })
    vi.stubGlobal('fetch', fetchMock)
    let call = 0
    const runner = vi.fn(async (input) => {
      call += 1
      if (call === 1) {
        input.onTaskTodoChange({
          taskId: 'task-continue',
          revision: 1,
          state: 'active',
          changeKind: 'created',
          createdAt: 1,
          updatedAt: 1,
          items: [{ id: 'todo-1', text: '继续写入', acceptance: '正文已写入', status: 'in_progress' }]
        })
        input.onDeferredActiveToolsChange(['writeTarget'])
        return { reply: '', terminalReason: 'aborted' }
      }
      expect(input.initialTaskTodo.taskId).toBe('task-continue')
      expect(input.initialDeferredActiveTools).toEqual(['writeTarget'])
      input.onTaskTodoChange({
        taskId: 'task-continue',
        revision: 2,
        state: 'completed',
        changeKind: 'completed',
        createdAt: 1,
        updatedAt: 2,
        items: [{ id: 'todo-1', text: '继续写入', acceptance: '正文已写入', status: 'completed' }]
      })
      return { reply: '续接完成' }
    })
    const controller = useWorkspaceAgentController(
      'scriptwriter:world_continue',
      'scriptwriter',
      'world_continue',
      '编剧',
      runner
    )

    await controller.send('先做一半')
    await controller.send('继续，并补充月份名称')
    expect(controller.state.taskTodo).toBeNull()
    expect(controller.state.deferredActiveTools).toEqual(['writeTarget'])

    await controller.newSession()
    expect(controller.state.sessionId).toBe('session_new')
    expect(controller.state.taskTodo).toBeNull()
    expect(controller.state.deferredActiveTools).toEqual([])
  })

  it('runner 抛真实错误时推送错误气泡，不吞掉失败', async () => {
    stubEnsureFetch('session_d')
    const runner = vi.fn(async () => { throw new Error('模型调用失败') })
    const controller = useWorkspaceAgentController('scriptwriter:world_d', 'scriptwriter', 'world_d', '编剧', runner)

    await controller.send('测试失败分支')

    const lastMessage = controller.state.messages.at(-1)
    expect(lastMessage.role).toBe('assistant')
    expect(lastMessage.content).toContain('模型调用失败')
  })

  // confirmWrite 已从 controller 移除（修复批G：从未被消费的死导出——两个弹窗
  // ScriptWorkspaceDialog/MapViewerDialog 一直直接调用
  // workspaceAgentScopeState.ts::createScopeConfirmWriteChannel 独立工厂，不经过 controller）。
  // 请求投影到 pendingInteraction 并由 resolve 落定的行为，仍由下面的 stop() 用例间接覆盖。

  it('stop()：清理挂起的 pendingInteraction 为 dismissed（而不是永久悬挂）', async () => {
    const controller = useWorkspaceAgentController('scriptwriter:world_f', 'scriptwriter', 'world_f', '编剧', vi.fn())
    const channel = createScopeConfirmWriteChannel('scriptwriter:world_f', 'scriptwriter', 'world_f')
    const answerPromise = channel({ title: '修改种子', lines: [] })

    controller.stop()
    const answer = await answerPromise

    expect(answer).toEqual({ status: 'dismissed' })
    expect(controller.state.pendingInteraction).toBeNull()
  })

  it('loadOrEnsureSession 成功后消息持久化会调用 createChatMessageBySessionId', async () => {
    vi.stubGlobal('fetch', mockFetchOnce({ session: { id: 'script_session_1' }, messages: [] }))
    const runner = vi.fn(async () => ({ reply: '好的' }))
    const controller = useWorkspaceAgentController('scriptwriter:world_g', 'scriptwriter', 'world_g', '编剧', runner)
    await controller.loadOrEnsureSession()

    const persistFetch = vi.fn(async () => ({ ok: true, json: async () => ({ id: 1 }) }))
    vi.stubGlobal('fetch', persistFetch)

    await controller.send('落库测试')

    expect(persistFetch).toHaveBeenCalledWith(
      expect.stringContaining('script_session_1'),
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('stop()：取消挂起的地图草稿审阅（resolve cancelled），runner 正常收尾归位（BUG1）', async () => {
    stubEnsureFetch('session_map')
    const scopeKey = 'cartographer:world_m:sheet_1'
    const reviewDraft = createScopeMapDraftReviewChannel(scopeKey, 'cartographer', 'world_m:sheet_1')
    let capturedResolution = null
    // 模拟舆图师 runner：paintArmor 走到审阅门挂起等待，取消后正常返回（不抛错）
    const runner = vi.fn(async () => {
      capturedResolution = await reviewDraft({
        kind: 'map-final-draft-review', worldId: 'world_m', sheetId: 'sheet_1', baseRevision: 'rev1', title: '确认新地形', items: []
      })
      return { reply: capturedResolution.status === 'cancelled' ? '已按取消收尾' : '已提交' }
    })
    const controller = useWorkspaceAgentController(scopeKey, 'cartographer', 'world_m:sheet_1', '舆图师', runner)

    const sendPromise = controller.send('画一条山脉')
    await vi.waitFor(() => expect(controller.state.pendingMapDraftReview).not.toBeNull())

    controller.stop()

    expect(controller.state.pendingMapDraftReview).toBeNull()
    await sendPromise
    expect(capturedResolution).toEqual({ status: 'cancelled' })
    // runner 收尾后运行态归位（send 的 finally 只在 abortController 仍属本轮时清理；stop 已提前归位）
    expect(controller.state.running).toBe(false)
    expect(controller.state.abortController).toBeNull()
  })
})
