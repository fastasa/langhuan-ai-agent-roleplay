// 批次3a·会话级外部装配入口回归：单例守门（聊天轮在跑/外部轮并发都拒绝）+
// 按 sessionId 完整装配跑通纠偏 loop（direct-edit 即时上抛）+ 决策流走现役 attempt/artifact 持久化。
import { beforeEach, describe, expect, it, vi } from 'vitest'

const repositoryMocks = vi.hoisted(() => ({
  fetchChatSessionBundleById: vi.fn(),
  fetchChatPersonalityModelObservationsBySessionId: vi.fn(),
  fetchLatestChatPromptLogBySessionMessageId: vi.fn(),
  fetchLatestChatPromptLogByMessageId: vi.fn(),
  createChatGenerationAttemptBySessionId: vi.fn(),
  updateChatGenerationAttemptBySessionId: vi.fn(),
  createChatGenerationAttemptArtifactBySessionId: vi.fn()
}))

vi.mock('../../../src/repositories/chatRepository.ts', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    fetchChatSessionBundleById: repositoryMocks.fetchChatSessionBundleById,
    fetchChatPersonalityModelObservationsBySessionId: repositoryMocks.fetchChatPersonalityModelObservationsBySessionId,
    fetchLatestChatPromptLogBySessionMessageId: repositoryMocks.fetchLatestChatPromptLogBySessionMessageId,
    fetchLatestChatPromptLogByMessageId: repositoryMocks.fetchLatestChatPromptLogByMessageId,
    createChatGenerationAttemptBySessionId: repositoryMocks.createChatGenerationAttemptBySessionId,
    updateChatGenerationAttemptBySessionId: repositoryMocks.updateChatGenerationAttemptBySessionId,
    createChatGenerationAttemptArtifactBySessionId: repositoryMocks.createChatGenerationAttemptArtifactBySessionId
  }
})

import {
  createTidiaoSessionCorrectionRunner,
  __resetTidiaoSessionCorrectionRunnerForTest
} from '../../../src/app/tidiaoSessionCorrectionRunner.ts'
import { activeTidiaoDirectorStreamRound } from '../../../src/app/tidiaoDirectorStreamState.ts'
import { clearAppendLog } from '../../../src/app/agentState/appendLog.ts'

const SESSION_ID = 'session_char_1'

function scriptedToolsModel(outsList) {
  let turn = 0
  return vi.fn(async () => {
    const out = outsList[Math.min(turn, outsList.length - 1)]
    turn += 1
    const { toolCalls = [], ...meta } = out
    return {
      content: JSON.stringify(meta),
      toolCalls: toolCalls.map((tc, i) => ({ id: `call_${turn}_${i}`, type: 'function', function: { name: tc.tool, arguments: JSON.stringify(tc.args || {}) } }))
    }
  })
}

function baseDeps(overrides = {}) {
  return {
    hasRunningChatRound: () => false,
    callAIWithTools: scriptedToolsModel([{ thought: '收尾', done: true }]),
    loadAgentConfig: () => null,
    readUserAddressName: () => '用户',
    getTargetName: () => '薇尔莉特',
    ...overrides
  }
}

beforeEach(() => {
  __resetTidiaoSessionCorrectionRunnerForTest()
  activeTidiaoDirectorStreamRound.value = null
  clearAppendLog()
  repositoryMocks.fetchChatSessionBundleById.mockReset().mockResolvedValue({
    session: { id: SESSION_ID, targetId: 'char_1', targetType: 'char' },
    participants: [],
    messages: [
      { id: 9001, role: 'user', content: '今晚天气不错' },
      { id: 9002, role: 'assistant', content: '是啊，凉风正好。', memberTargetId: 'char_1' }
    ]
  })
  repositoryMocks.fetchChatPersonalityModelObservationsBySessionId.mockReset()
    .mockResolvedValue({ projections: [], visibility: [], traces: [] })
  repositoryMocks.fetchLatestChatPromptLogBySessionMessageId.mockReset().mockResolvedValue(null)
  repositoryMocks.fetchLatestChatPromptLogByMessageId.mockReset().mockResolvedValue(null)
  repositoryMocks.createChatGenerationAttemptBySessionId.mockReset().mockResolvedValue({ id: 'attempt_ext_1' })
  repositoryMocks.updateChatGenerationAttemptBySessionId.mockReset().mockResolvedValue({})
  repositoryMocks.createChatGenerationAttemptArtifactBySessionId.mockReset().mockResolvedValue({})
})

describe('createTidiaoSessionCorrectionRunner', () => {
  it('单例守门①：聊天提调轮在跑 → busy 拒绝、不取会话不起 loop', async () => {
    const deps = baseDeps({ hasRunningChatRound: () => true })
    const runner = createTidiaoSessionCorrectionRunner(deps)
    const result = await runner.runCorrectionForSession({ sessionId: SESSION_ID, targetMessageId: 9002, instruction: '改一下' })
    expect(result.ok).toBe(false)
    expect(result.busy).toBe(true)
    expect(repositoryMocks.fetchChatSessionBundleById).not.toHaveBeenCalled()
    expect(deps.callAIWithTools).not.toHaveBeenCalled()
  })

  it('单例守门②：外部轮并发第二发 → busy 拒绝（第一发照常完成）', async () => {
    let releaseModel
    const gate = new Promise((resolve) => { releaseModel = resolve })
    const deps = baseDeps({
      callAIWithTools: vi.fn(async () => {
        await gate
        return { content: JSON.stringify({ thought: '收尾', done: true }), toolCalls: [] }
      })
    })
    const runner = createTidiaoSessionCorrectionRunner(deps)
    const first = runner.runCorrectionForSession({ sessionId: SESSION_ID, targetMessageId: 9002, instruction: '改一下' })
    // 等第一发跑进 loop（模型挂起中）再发第二发。
    await vi.waitFor(() => expect(deps.callAIWithTools).toHaveBeenCalled())
    const second = await runner.runCorrectionForSession({ sessionId: SESSION_ID, targetMessageId: 9002, instruction: '再改' })
    expect(second.ok).toBe(false)
    expect(second.busy).toBe(true)
    releaseModel()
    const firstResult = await first
    expect(firstResult.ok).toBe(true)
  })

  it('按 sessionId 完整装配：direct-edit 跑通，edits 带回、onEditCommitted 即时上抛、决策流走 attempt/artifact 落库', async () => {
    const deps = baseDeps({
      callAIWithTools: scriptedToolsModel([
        { thought: '把凉风正好改成夜色正好', toolCalls: [{ tool: 'editChatMessage', args: { ref: '角色1', oldText: '凉风正好', newText: '夜色正好' } }], done: false },
        { thought: '改好了', toolCalls: [], done: true }
      ])
    })
    const runner = createTidiaoSessionCorrectionRunner(deps)
    const committed = []
    const result = await runner.runCorrectionForSession({
      sessionId: SESSION_ID,
      targetMessageId: 9002,
      instruction: '把凉风正好改成夜色正好',
      onEditCommitted: (commit) => { committed.push(commit) }
    })

    expect(result.ok).toBe(true)
    expect(result.strategy).toBe('direct-edit')
    expect(result.edits).toHaveLength(1)
    expect(result.edits[0].content).toContain('夜色正好')
    expect(committed).toHaveLength(1)
    expect(committed[0].messageId).toBe(9002)
    expect(result.anchorMessageId).toBe(9001)
    // 导演带轮级载体在本外部轮 runId 上（对聊天 UI 呈现与聊天轮同语义）。
    expect(result.runId).toBeTruthy()
    // 决策流持久化走现役通道：attempt 建 + artifact 落（含收尾 flush）。
    expect(repositoryMocks.createChatGenerationAttemptBySessionId).toHaveBeenCalledWith(SESSION_ID, expect.objectContaining({
      anchorMessageId: 9001,
      tidiaoRunId: result.runId
    }))
    expect(repositoryMocks.createChatGenerationAttemptArtifactBySessionId).toHaveBeenCalledWith(SESSION_ID, expect.objectContaining({
      id: `tidiao_stream_${result.runId}`
    }))
    // 收尾后互斥标记复位：可再次下发。
    const again = await runner.runCorrectionForSession({ sessionId: SESSION_ID, targetMessageId: 9002, instruction: '再看一眼', userInstruction: '' })
    expect(again.busy || false).toBe(false)
  })

  it('停止统一：registerChatTaskRun 注入时登记聊天任务（label=提调纠偏·带 controller），成功轮 complete 收尾', async () => {
    const events = []
    let capturedInput = null
    const registerChatTaskRun = vi.fn((taskInput) => {
      capturedInput = taskInput
      // 模拟装配方按 isChatTaskRunActive 守门：已收尾后 complete/fail 都是 no-op。
      let active = true
      return {
        complete: () => { if (active) { active = false; events.push('complete') } },
        fail: () => { if (active) { active = false; events.push('fail') } },
        stop: () => { if (active) { active = false; events.push('stop') } }
      }
    })
    const runner = createTidiaoSessionCorrectionRunner(baseDeps({ registerChatTaskRun }))
    const result = await runner.runCorrectionForSession({ sessionId: SESSION_ID, targetMessageId: 9002, instruction: '改一下' })

    expect(result.ok).toBe(true)
    expect(registerChatTaskRun).toHaveBeenCalledTimes(1)
    expect(capturedInput.label).toBe('提调纠偏')
    expect(capturedInput.targetId).toBe('char_1')
    expect(capturedInput.sessionId).toBe(SESSION_ID)
    expect(capturedInput.abortController).toBeInstanceOf(AbortController)
    // 成功轮只 complete 一次；finally 的泄漏兜底 fail 被守门挡住不生效。
    expect(events).toEqual(['complete'])
  })

  it('停止统一：abort 登记任务的 controller（=abortChat 停止一切）→ 本轮立即中止并 stop 收尾', async () => {
    const events = []
    let capturedController = null
    const registerChatTaskRun = vi.fn(({ abortController }) => {
      capturedController = abortController
      let active = true
      return {
        complete: () => { if (active) { active = false; events.push('complete') } },
        fail: () => { if (active) { active = false; events.push('fail') } },
        stop: () => { if (active) { active = false; events.push('stop') } }
      }
    })
    // 第一发：模型调用挂起，收到 signal abort 才以 AbortError 拒绝（与真实 AI 通道同语义）；后续发直接收尾。
    const callAIWithTools = vi.fn((messages, options) => {
      if (callAIWithTools.mock.calls.length > 1) {
        return Promise.resolve({ content: JSON.stringify({ thought: '收尾', done: true }), toolCalls: [] })
      }
      return new Promise((resolve, reject) => {
        const signal = options?.signal
        const rejectAborted = () => {
          const error = new Error('生成已停止')
          error.name = 'AbortError'
          reject(error)
        }
        if (signal?.aborted) {
          rejectAborted()
          return
        }
        signal?.addEventListener('abort', rejectAborted, { once: true })
      })
    })
    const runner = createTidiaoSessionCorrectionRunner(baseDeps({ registerChatTaskRun, callAIWithTools }))
    const pending = runner.runCorrectionForSession({ sessionId: SESSION_ID, targetMessageId: 9002, instruction: '改一下' })
    await vi.waitFor(() => expect(callAIWithTools).toHaveBeenCalled())
    expect(capturedController).toBeInstanceOf(AbortController)
    capturedController.abort()

    const result = await pending
    expect(result.ok).toBe(false)
    expect(result.busy).toBe(false)
    expect(String(result.message)).toContain('已停止')
    expect(events).toEqual(['stop'])
    // 停止后互斥标记复位：可再次下发。
    const again = await runner.runCorrectionForSession({ sessionId: SESSION_ID, targetMessageId: 9002, instruction: '再来' })
    expect(again.busy || false).toBe(false)
  })

  it('停止=中断保留（2026-07-08）：外部轮停止时已有决策内容 → 带转 correcting 挂起（半成品保留·flush 落库），不清带', async () => {
    const events = []
    let capturedController = null
    const registerChatTaskRun = vi.fn(({ abortController }) => {
      capturedController = abortController
      let active = true
      return {
        complete: () => { if (active) { active = false; events.push('complete') } },
        fail: () => { if (active) { active = false; events.push('fail') } },
        stop: () => { if (active) { active = false; events.push('stop') } }
      }
    })
    // 第一发：真做一处改动（产生决策/工具内容）；第二发挂起等 abort（与真实 AI 通道同语义）。
    const callAIWithTools = vi.fn((messages, options) => {
      if (callAIWithTools.mock.calls.length === 1) {
        return Promise.resolve({
          content: JSON.stringify({ thought: '先改一处', done: false }),
          toolCalls: [{ id: 'call_1_0', type: 'function', function: { name: 'editChatMessage', arguments: JSON.stringify({ ref: '角色1', oldText: '凉风正好', newText: '夜色正好' }) } }]
        })
      }
      return new Promise((resolve, reject) => {
        const signal = options?.signal
        const rejectAborted = () => {
          const error = new Error('生成已停止')
          error.name = 'AbortError'
          reject(error)
        }
        if (signal?.aborted) {
          rejectAborted()
          return
        }
        signal?.addEventListener('abort', rejectAborted, { once: true })
      })
    })
    const runner = createTidiaoSessionCorrectionRunner(baseDeps({ registerChatTaskRun, callAIWithTools }))
    const pending = runner.runCorrectionForSession({ sessionId: SESSION_ID, targetMessageId: 9002, instruction: '改一下' })
    await vi.waitFor(() => expect(callAIWithTools.mock.calls.length).toBeGreaterThanOrEqual(2))
    capturedController.abort()

    const result = await pending
    expect(result.ok).toBe(false)
    expect(result.busy).toBe(false)
    expect(String(result.message)).toContain('已保留')
    expect(String(result.message)).toContain('继续')
    expect(events).toEqual(['stop'])
    // 带转 correcting 挂起：半成品决策原地保留（不清带、不降权）。
    expect(activeTidiaoDirectorStreamRound.value).not.toBeNull()
    expect(activeTidiaoDirectorStreamRound.value.stream.phase).toBe('correcting')
    expect(activeTidiaoDirectorStreamRound.value.stream.decisions.length).toBeGreaterThan(0)
    // flush 落库走现役 attempt/artifact 通道（刷新可复原）。
    expect(repositoryMocks.createChatGenerationAttemptArtifactBySessionId).toHaveBeenCalled()
  })

  it('会话不存在 → 非 busy 失败结果（不抛异常·3b 工具可如实回报）', async () => {
    repositoryMocks.fetchChatSessionBundleById.mockResolvedValue({ session: null, messages: [] })
    const runner = createTidiaoSessionCorrectionRunner(baseDeps())
    const result = await runner.runCorrectionForSession({ sessionId: 'session_missing', targetMessageId: 1, instruction: 'x' })
    expect(result.ok).toBe(false)
    expect(result.busy).toBe(false)
    expect(String(result.message)).toContain('session_missing')
  })
})
