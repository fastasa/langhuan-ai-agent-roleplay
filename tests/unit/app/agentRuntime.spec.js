import { describe, expect, it, vi } from 'vitest'
import { runAgentRuntime as runAgentRuntimeBase } from '../../../src/app/agentRuntime/runtime.ts'
import { ToolRegistry } from '../../../src/app/agentRuntime/toolRegistry.ts'
import { HookRegistry } from '../../../src/app/agentRuntime/hookRegistry.ts'
import {
  findUnpairedToolCallIds,
  summarizeTranscriptToolStatuses
} from '../../../src/app/agentRuntime/transcript.ts'

const runAgentRuntime = (input) => runAgentRuntimeBase({ ...input, taskTodoMode: 'disabled' })

function makeRegistry() {
  return new ToolRegistry([
    {
      name: 'echo',
      brief: '返回输入文本',
      validateArgs: (args) => typeof args.text === 'string' && args.text.trim() ? null : 'echo.text 必须是非空字符串',
      execute: (toolCall) => ({
        content: `echo:${toolCall.args.text}`,
        details: { echoed: toolCall.args.text }
      })
    },
    {
      name: 'fail',
      brief: '测试异常工具',
      execute: () => {
        throw new Error('boom')
      }
    }
  ])
}

describe('agentRuntime 批次 1', () => {
  it('全 Agent 过程消息会立即上抛并自动续步，不需要业务入口逐个挂特判', async () => {
    const intermediate = vi.fn()
    const callModel = vi.fn()
      .mockResolvedValueOnce({ content: '第 1 批已经完成。下一步我将读取工作区摘要并核对总数。', toolCalls: [] })
      .mockResolvedValueOnce({ content: '已读取并核对完成，共 90 题。', toolCalls: [] })

    const { transcript } = await runAgentRuntime({
      agentName: 'AnyRuntimeAgent',
      messages: [{ role: 'user', content: '继续执行并汇总' }],
      toolRegistry: new ToolRegistry(),
      initialActiveTools: [],
      budget: { maxTurns: 4, maxToolCalls: 1 },
      callModel,
      onIntermediateMessage: intermediate
    })

    expect(callModel).toHaveBeenCalledTimes(2)
    expect(intermediate).toHaveBeenCalledTimes(1)
    expect(intermediate).toHaveBeenCalledWith({
      content: '第 1 批已经完成。下一步我将读取工作区摘要并核对总数。',
      turnIndex: 0
    })
    expect(callModel.mock.calls[1][0].messages).toEqual(expect.arrayContaining([
      expect.objectContaining({
        role: 'user',
        content: expect.stringContaining('你刚才发的是过程消息')
      })
    ]))
    expect(transcript.turns[0].hookEvents.some((event) => event.id === 'agent-process-message-continuation')).toBe(true)
    expect(transcript.turns[1].modelMessage.content).toBe('已读取并核对完成，共 90 题。')
  })

  it('正常最终答复不会被全 Agent 过程消息门误续轮', async () => {
    const callModel = vi.fn(async () => ({ content: '已经全部处理完成，共 90 题。', toolCalls: [] }))
    const intermediate = vi.fn()

    await runAgentRuntime({
      agentName: 'AnyRuntimeAgent',
      messages: [{ role: 'user', content: '汇总' }],
      toolRegistry: new ToolRegistry(),
      initialActiveTools: [],
      budget: { maxTurns: 4, maxToolCalls: 1 },
      callModel,
      onIntermediateMessage: intermediate
    })

    expect(callModel).toHaveBeenCalledTimes(1)
    expect(intermediate).not.toHaveBeenCalled()
  })

  it('promptSupplyTrace 原样进入 transcript，但不进入模型 messages/history', async () => {
    const trace = [{
      profileId: 'xingyi.global',
      skillId: 'xingyi.knowledge-topics',
      source: 'fixture://secret-trace-only',
      layer: '4',
      loadState: 'loaded',
      chars: 7,
      hash: 'fnv1a32:fixture',
      reason: 'test',
      selector: '测试主题'
    }]
    let modelRequest

    const { transcript } = await runAgentRuntime({
      agentName: 'TraceAgent',
      messages: [{ role: 'user', content: 'start' }],
      toolRegistry: new ToolRegistry(),
      initialActiveTools: [],
      promptSupplyTrace: trace,
      budget: { maxTurns: 1, maxToolCalls: 1 },
      callModel: (request) => {
        modelRequest = request
        return { content: 'done', toolCalls: [] }
      }
    })

    expect(transcript.promptSupplyTrace).toEqual(trace)
    expect(transcript.promptSupplyTrace).not.toBe(trace)
    expect(JSON.stringify(modelRequest.messages)).not.toContain('fixture://secret-trace-only')
    expect(JSON.stringify(modelRequest.history)).not.toContain('fixture://secret-trace-only')
  })

  it('执行注册工具并生成 callId 配对的结构化 transcript', async () => {
    const callModel = vi.fn(() => ({
      stage: 'plan-generation',
      toolCalls: [
        {
          callId: 'call_echo_1',
          toolName: 'echo',
          stage: 'plan-generation',
          args: { text: 'hello' },
          expectation: '返回 hello 的 echo 结果。'
        }
      ],
      done: true
    }))

    const { transcript } = await runAgentRuntime({
      agentName: 'TestAgent',
      messages: [{ role: 'user', content: 'start' }],
      toolRegistry: makeRegistry(),
      initialActiveTools: ['echo'],
      budget: { maxTurns: 3, maxToolCalls: 3 },
      callModel
    })

    expect(callModel).toHaveBeenCalledWith(expect.objectContaining({
      activeTools: ['echo'],
      history: [{ kind: 'chat', role: 'user', content: 'start' }],
      toolBriefs: [{ name: 'echo', brief: '返回输入文本' }],
      turnIndex: 0
    }))
    expect(transcript.turns).toHaveLength(1)
    expect(transcript.turns[0].toolCalls[0].callId).toBe('call_echo_1')
    expect(transcript.turns[0].toolResults[0]).toMatchObject({
      callId: 'call_echo_1',
      toolName: 'echo',
      status: 'success',
      content: 'echo:hello'
    })
    expect(transcript.history.map((message) => message.kind)).toEqual([
      'chat',
      'modelMessage',
      'toolCall',
      'toolResult'
    ])
    expect(findUnpairedToolCallIds(transcript)).toEqual([])
    expect(summarizeTranscriptToolStatuses(transcript)).toEqual({ 'echo:success': 1 })
  })

  it('批次G：onProgress 工具事件携带参数预览 / 结果摘要 / 错误信息', async () => {
    const events = []
    await runAgentRuntime({
      agentName: 'TestAgent',
      messages: [{ role: 'user', content: 'start' }],
      toolRegistry: makeRegistry(),
      initialActiveTools: ['echo', 'fail'],
      budget: { maxTurns: 1, maxToolCalls: 3 },
      callModel: () => ({
        toolCalls: [
          { callId: 'c1', toolName: 'echo', args: { text: 'hello' }, expectation: 'ok' },
          { callId: 'c2', toolName: 'fail', args: {}, expectation: 'ok' }
        ],
        done: true
      }),
      onProgress: (event) => events.push(event)
    })
    const echoStart = events.find((e) => e.kind === 'tool-start' && e.toolName === 'echo')
    expect(echoStart.detail).toBe('hello') // 参数预览：挑常见键名（text 回退首个非空字符串）
    const echoResult = events.find((e) => e.kind === 'tool-result' && e.toolName === 'echo')
    expect(echoResult.resultPreview).toBe('echo:hello') // 结果摘要
    const failResult = events.find((e) => e.kind === 'tool-result' && e.toolName === 'fail')
    expect(failResult.status).toBe('error')
    expect(failResult.errorMessage).toBe('boom') // 错误信息：报错也输出
  })

  it('未知工具和非 activeTools 工具都返回结构化 TOOL_NOT_FOUND', async () => {
    const { transcript } = await runAgentRuntime({
      agentName: 'TestAgent',
      messages: [],
      toolRegistry: makeRegistry(),
      initialActiveTools: ['echo'],
      budget: { maxTurns: 1, maxToolCalls: 3 },
      callModel: () => ({
        toolCalls: [
          { callId: 'call_fail_blocked', toolName: 'fail', args: {}, expectation: '不应该执行。' },
          { callId: 'call_missing', toolName: 'missing', args: {}, expectation: '不应该执行。' }
        ],
        done: true
      })
    })

    expect(transcript.turns[0].toolResults).toHaveLength(2)
    expect(transcript.turns[0].toolResults.map((result) => result.error?.type)).toEqual([
      'TOOL_NOT_FOUND',
      'TOOL_NOT_FOUND'
    ])
    expect(transcript.turns[0].toolResults.every((result) => result.status === 'blocked')).toBe(true)
  })

  it('参数错误和工具异常都以 ToolResultMessage 显式返回', async () => {
    const { transcript } = await runAgentRuntime({
      agentName: 'TestAgent',
      messages: [],
      toolRegistry: makeRegistry(),
      initialActiveTools: ['echo', 'fail'],
      budget: { maxTurns: 1, maxToolCalls: 4 },
      callModel: () => ({
        toolCalls: [
          { callId: 'call_bad_args', toolName: 'echo', args: { text: '' }, expectation: '参数错误。' },
          { callId: 'call_throw', toolName: 'fail', args: {}, expectation: '工具异常。' }
        ],
        done: true
      })
    })

    expect(transcript.turns[0].toolResults.map((result) => result.error?.type)).toEqual([
      'INVALID_ARGUMENT',
      'TOOL_RUNTIME_ERROR'
    ])
    expect(transcript.turns[0].toolResults[0].content).toContain('echo.text')
    expect(transcript.turns[0].toolResults[1].content).toBe('boom')
  })

  it('预算超限时生成 BUDGET_EXCEEDED toolResult，不伪造成功', async () => {
    const { transcript } = await runAgentRuntime({
      agentName: 'TestAgent',
      messages: [],
      toolRegistry: makeRegistry(),
      initialActiveTools: ['echo'],
      budget: { maxTurns: 1, maxToolCalls: 1 },
      callModel: () => ({
        toolCalls: [
          { callId: 'call_1', toolName: 'echo', args: { text: 'one' }, expectation: '成功。' },
          { callId: 'call_2', toolName: 'echo', args: { text: 'two' }, expectation: '被预算拦截。' }
        ],
        done: true
      })
    })

    expect(transcript.terminalReason).toBe('budget-exceeded')
    expect(transcript.turns[0].toolResults.map((result) => result.status)).toEqual(['success', 'blocked'])
    expect(transcript.turns[0].toolResults[1].error?.type).toBe('BUDGET_EXCEEDED')
  })

  it('abort 信号在模型调用前收束为 aborted transcript', async () => {
    const controller = new AbortController()
    controller.abort()
    const callModel = vi.fn()
    const { transcript } = await runAgentRuntime({
      agentName: 'TestAgent',
      messages: [],
      toolRegistry: makeRegistry(),
      initialActiveTools: ['echo'],
      budget: { maxTurns: 1, maxToolCalls: 1 },
      signal: controller.signal,
      callModel
    })

    expect(callModel).not.toHaveBeenCalled()
    expect(transcript.terminalReason).toBe('aborted')
    expect(transcript.turns).toEqual([])
  })

  it('工具结果直接作为结构化 toolResult 进入 runtime history，不再渲染为文本消息', async () => {
    const { transcript } = await runAgentRuntime({
      agentName: 'TestAgent',
      messages: [],
      toolRegistry: makeRegistry(),
      initialActiveTools: ['echo'],
      budget: { maxTurns: 1, maxToolCalls: 1 },
      callModel: () => ({
        toolCalls: [{ callId: 'call_echo_1', toolName: 'echo', args: { text: 'hello' }, expectation: '返回 hello。' }],
        done: true
      })
    })

    expect(transcript.history).toEqual([
      expect.objectContaining({ kind: 'modelMessage' }),
      expect.objectContaining({ kind: 'toolCall', callId: 'call_echo_1', toolName: 'echo' }),
      expect.objectContaining({ kind: 'toolResult', callId: 'call_echo_1', toolName: 'echo', content: 'echo:hello' })
    ])
    expect(JSON.stringify(transcript.history)).not.toContain('[工具结果]')
  })
})

describe('agentRuntime 导演模式（软停 / 超时 / 开放门禁，2026-06-20）', () => {
  it('shouldPause 在步骤边界软停：当前步跑完后收束为 paused-for-correction，不打断当前步', async () => {
    let turnSeen = 0
    const callModel = vi.fn(() => ({
      // 每轮都发一个工具调用且 done:false，让 loop 持续到被软停拦下
      toolCalls: [{ callId: `c_${turnSeen}`, toolName: 'echo', args: { text: 'step' }, expectation: 'ok' }],
      done: false
    }))
    let pauseChecks = 0
    const { transcript } = await runAgentRuntime({
      agentName: 'TestAgent',
      messages: [{ role: 'user', content: 'start' }],
      toolRegistry: makeRegistry(),
      initialActiveTools: ['echo'],
      budget: { maxTurns: 10, maxToolCalls: 10 },
      // 第 1 轮起点放行（返回 false），第 2 轮起点请求软停（返回 true）
      shouldPause: () => {
        pauseChecks += 1
        return pauseChecks > 1
      },
      callModel: (req) => {
        turnSeen = req.turnIndex
        return callModel()
      }
    })
    expect(transcript.terminalReason).toBe('paused-for-correction')
    // 第 0 轮（当前步）完整跑完：模型调用 + echo 工具结果都在；第 1 轮未启动（软停拦在步骤边界）。
    expect(transcript.turns).toHaveLength(1)
    expect(transcript.turns[0].toolResults[0]).toMatchObject({ toolName: 'echo', status: 'success', content: 'echo:step' })
    expect(callModel).toHaveBeenCalledTimes(1)
  })

  it('timeoutMs 超时在步骤边界收束为 timeout 并上抛 notice', async () => {
    const nowSpy = vi.spyOn(Date, 'now')
    // deadline 计算→0（deadline=1000）；第 0 轮起点→0（未超时）；第 1 轮起点→999999（超时）
    nowSpy.mockReturnValueOnce(0).mockReturnValueOnce(0).mockReturnValue(999999)
    const notices = []
    const { transcript } = await runAgentRuntime({
      agentName: 'TestAgent',
      messages: [{ role: 'user', content: 'start' }],
      toolRegistry: makeRegistry(),
      initialActiveTools: ['echo'],
      budget: { maxTurns: 10, maxToolCalls: 10 },
      timeoutMs: 1000,
      callModel: () => ({ toolCalls: [{ callId: 'c1', toolName: 'echo', args: { text: 'step' }, expectation: 'ok' }], done: false }),
      onProgress: (event) => { if (event.kind === 'notice') notices.push(event) }
    })
    nowSpy.mockRestore()
    expect(transcript.terminalReason).toBe('timeout')
    expect(transcript.turns).toHaveLength(1) // 第 0 轮跑完，第 1 轮起点超时拦下
    expect(notices.some((n) => n.thought.includes('超过 20 分钟'))).toBe(true)
  })

  // item6 退役 openToolGate：原「openToolGate 全可见全可调」测试随字段删除一并退役——所有 loop 改 deferred（按 activeTools 门控）。

  it('按阶段门禁拦截不在 activeTools 的工具', async () => {
    const { transcript } = await runAgentRuntime({
      agentName: 'TestAgent',
      messages: [],
      toolRegistry: makeRegistry(),
      initialActiveTools: ['echo'],
      budget: { maxTurns: 1, maxToolCalls: 3 },
      callModel: () => ({
        toolCalls: [{ callId: 'c_fail', toolName: 'fail', args: {}, expectation: '默认应被门禁拦下' }],
        done: true
      })
    })
    const result = transcript.turns[0].toolResults[0]
    expect(result.error?.type).toBe('TOOL_NOT_FOUND')
    expect(result.status).toBe('blocked')
  })
})

describe('R1-B B5 统一 toolsearch 延迟模式', () => {
  const buildRegistry = () => new ToolRegistry([
    {
      name: 'echo', brief: '返回输入文本',
      schema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
      validateArgs: (args) => (typeof args.text === 'string' && args.text.trim() ? null : 'echo.text 必填'),
      execute: (toolCall) => ({ content: `echo:${toolCall.args.text}` })
    },
    {
      name: 'recallBrain', brief: '召回角色大脑',
      // 接缝重构后 schema 是静态的（loop 在工厂期用当轮候选造好·不再 schemaFactory 运行时现造）。
      schema: { type: 'object', properties: { castList: { description: '甲（id=1）' } }, required: [] },
      execute: () => ({ content: 'recalled' })
    }
  ])

  it('延迟模式：toolBriefs 只下发已激活集（toolsearch·带 schema），其余走 toolCatalog（name+brief·推荐单标 recommended）', async () => {
    const seen = []
    await runAgentRuntime({
      agentName: 'B5', messages: [{ role: 'user', content: 'go' }],
      toolRegistry: buildRegistry(),
      initialActiveTools: [], // 推荐单不预激活·只 toolsearch 恒下发
      budget: { maxTurns: 1, maxToolCalls: 1 },
      deferredToolMode: true,
      recommendedTools: ['echo'],
      callModel: (req) => { seen.push(req); return { done: true, toolCalls: [] } }
    })
    // native 数组只含 toolsearch（initialActiveTools 空 → 无工具预激活带 schema）
    expect(seen[0].toolBriefs.map((b) => b.name)).toEqual(['toolsearch'])
    expect(seen[0].toolBriefs[0].schema).toBeTruthy()
    // 全局单目录 = 全部 B3 满足工具·name+brief·不带 schema·推荐单标 recommended（toolsearch 不入目录）
    expect(seen[0].toolCatalog).toEqual([
      { name: 'echo', brief: '返回输入文本', recommended: true },
      { name: 'recallBrain', brief: '召回角色大脑', recommended: false }
    ])
  })

  it('toolsearch 命中 → 激活进 activeTools → 下一轮带 schema 可调', async () => {
    const reqs = []
    const { transcript } = await runAgentRuntime({
      agentName: 'B5', messages: [{ role: 'user', content: 'go' }],
      toolRegistry: buildRegistry(),
      initialActiveTools: [],
      budget: { maxTurns: 3, maxToolCalls: 3 },
      deferredToolMode: true,
      recommendedTools: ['echo'],
      callModel: (req) => {
        reqs.push(req)
        if (req.turnIndex === 0) {
          return { done: false, toolCalls: [{ callId: 's1', toolName: 'toolsearch', args: { query: '召回 角色' }, expectation: '' }] }
        }
        return { done: true, toolCalls: [{ callId: 'r1', toolName: 'recallBrain', args: {}, expectation: '' }] }
      }
    })
    // 第 0 轮 toolsearch 命中 recallBrain（关键词匹配 name+brief）
    expect(transcript.turns[0].toolResults[0].details.activatedTools).toEqual(['recallBrain'])
    // 第 1 轮 recallBrain 已激活进 toolBriefs，带（工厂期造好的静态）schema
    const recallBrief = reqs[1].toolBriefs.find((b) => b.name === 'recallBrain')
    expect(recallBrief.schema.properties.castList.description).toBe('甲（id=1）')
    // 第 1 轮真正执行 recallBrain 成功（已激活·可调）
    expect(transcript.turns[1].toolResults[0]).toMatchObject({ toolName: 'recallBrain', status: 'success', content: 'recalled' })
  })

  it('提调缓存模式：首次命中后一次装载完整授权集并冻结，tool epoch 内序号从 0 重计', async () => {
    const reqs = []
    const { transcript } = await runAgentRuntime({
      agentName: 'TidiaoCacheEpoch',
      messages: [{ role: 'user', content: 'go' }],
      toolRegistry: buildRegistry(),
      initialActiveTools: ['echo'],
      budget: { maxTurns: 3, maxToolCalls: 3 },
      deferredToolMode: true,
      deferredToolEpochMode: 'full-authorized-after-first-search',
      recommendedTools: ['echo'],
      callModel: (req) => {
        reqs.push(req)
        if (req.turnIndex === 0) {
          return { done: false, toolCalls: [{ callId: 's1', toolName: 'toolsearch', args: { query: '召回 角色' }, expectation: '' }] }
        }
        if (req.turnIndex === 1) {
          return { done: false, toolCalls: [{ callId: 'e1', toolName: 'echo', args: { text: 'hi' }, expectation: '' }] }
        }
        return { done: true, toolCalls: [] }
      }
    })

    expect(transcript.turns[0].toolResults[0].details.activatedTools).toEqual(['echo', 'recallBrain'])
    expect(reqs[0]).toMatchObject({ toolEpoch: 0, toolEpochTurnIndex: 0 })
    expect(reqs[1]).toMatchObject({ toolEpoch: 1, toolEpochTurnIndex: 0 })
    expect(reqs[2]).toMatchObject({ toolEpoch: 1, toolEpochTurnIndex: 1 })
    expect(reqs[1].toolBriefs.map((brief) => brief.name)).toEqual(['echo', 'recallBrain', 'toolsearch'])
    expect(reqs[2].toolBriefs.map((brief) => brief.name)).toEqual(['echo', 'recallBrain', 'toolsearch'])
  })

  it('延迟模式：未激活工具直接调被 block（须先 toolsearch）', async () => {
    const { transcript } = await runAgentRuntime({
      agentName: 'B5', messages: [{ role: 'user', content: 'go' }],
      toolRegistry: buildRegistry(),
      initialActiveTools: [],
      budget: { maxTurns: 1, maxToolCalls: 2 },
      deferredToolMode: true,
      recommendedTools: ['echo'],
      callModel: () => ({ done: true, toolCalls: [{ callId: 'e1', toolName: 'echo', args: { text: 'hi' }, expectation: '' }] })
    })
    const result = transcript.turns[0].toolResults[0]
    expect(result.status).toBe('blocked')
    expect(result.error.type).toBe('TOOL_NOT_FOUND') // echo 未激活 → 当前不可调用
  })

  it('item6 共存：阶段机整体重写 activeTools 后，toolsearch + 已越权激活工具仍黏住可见可调', async () => {
    // 模拟演员阶段机：echo（充当某阶段收口工具）成功后把 activeTools 整体重写到下一阶段，
    // 故意只留 ['echo']、丢掉 toolsearch 与上一轮越权激活的 recallBrain——验证 runtime 黏性集把它们并回。
    const stageHook = new HookRegistry([
      {
        id: 'stage-rewrite-after-echo',
        lifecycle: 'afterToolResult',
        priority: 20,
        appliesTo: { toolName: 'echo', status: 'success' },
        run: () => ({ summary: '阶段收窄到下一步', activeTools: ['echo'] })
      }
    ])
    const reqs = []
    const { transcript } = await runAgentRuntime({
      agentName: 'B5', messages: [{ role: 'user', content: 'go' }],
      toolRegistry: buildRegistry(),
      hookRegistry: stageHook,
      initialActiveTools: ['echo'],
      budget: { maxTurns: 4, maxToolCalls: 4 },
      deferredToolMode: true,
      recommendedTools: ['echo'],
      callModel: (req) => {
        reqs.push(req)
        if (req.turnIndex === 0) return { done: false, toolCalls: [{ callId: 's1', toolName: 'toolsearch', args: { query: '召回 角色' }, expectation: '' }] }
        if (req.turnIndex === 1) return { done: false, toolCalls: [{ callId: 'e1', toolName: 'echo', args: { text: 'hi' }, expectation: '' }] }
        return { done: true, toolCalls: [{ callId: 'r1', toolName: 'recallBrain', args: {}, expectation: '' }] }
      }
    })
    // turn0 越权激活 recallBrain；turn1 echo 触发阶段整体重写 activeTools=['echo']；
    // 黏性集（toolsearch + recallBrain）必须并回 → turn2 仍可见且可调，证明阶段机×deferred 共存。
    const names = reqs[2].toolBriefs.map((b) => b.name)
    expect(names).toContain('toolsearch')
    expect(names).toContain('recallBrain')
    expect(transcript.turns[2].toolResults[0]).toMatchObject({ toolName: 'recallBrain', status: 'success' })
  })
})

describe('同错熔断（2026-07-06·弱模型原样重发同一失败调用）', () => {
  const failingCall = (turn) => ({
    callId: `call_${turn}`,
    toolName: 'echo',
    stage: 'run',
    args: { text: '' },
    expectation: ''
  })

  it('同一工具连续同签名报错第 2 次起：回执追加熔断提醒 + 参数 schema', async () => {
    const registry = new ToolRegistry([{
      name: 'echo',
      brief: '返回输入文本',
      schema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
      validateArgs: (args) => typeof args.text === 'string' && args.text.trim() ? null : 'echo.text 必须是非空字符串',
      execute: (toolCall) => ({ content: `echo:${toolCall.args.text}` })
    }])
    let turn = 0
    const { transcript } = await runAgentRuntime({
      agentName: 'TestAgent',
      messages: [{ role: 'user', content: 'start' }],
      toolRegistry: registry,
      initialActiveTools: ['echo'],
      budget: { maxTurns: 4, maxToolCalls: 6 },
      callModel: () => {
        turn += 1
        if (turn <= 3) return { stage: 'run', toolCalls: [failingCall(turn)], done: false }
        return { stage: 'run', toolCalls: [], done: true }
      }
    })
    const results = transcript.turns.flatMap((t) => t.toolResults)
    expect(results).toHaveLength(3)
    // 第 1 次：只有原始报错，不加熔断提醒。
    expect(results[0].content).not.toContain('熔断提醒')
    // 第 2/3 次：追加熔断提醒 + schema，且计数递增。
    expect(results[1].content).toContain('熔断提醒')
    expect(results[1].content).toContain('连续 2 次')
    expect(results[1].content).toContain('"required":["text"]')
    expect(results[2].content).toContain('连续 3 次')
    // error 结构不被改动（外层重试/审计语义零变化）。
    expect(results[1].error).toMatchObject({ type: 'INVALID_ARGUMENT', message: 'echo.text 必须是非空字符串' })
  })

  it('成功或换错误即复位：不误伤交替失败/成功的正常节奏', async () => {
    const registry = new ToolRegistry([{
      name: 'echo',
      brief: '返回输入文本',
      validateArgs: (args) => typeof args.text === 'string' && args.text.trim() ? null : 'echo.text 必须是非空字符串',
      execute: (toolCall) => ({ content: `echo:${toolCall.args.text}` })
    }])
    let turn = 0
    const { transcript } = await runAgentRuntime({
      agentName: 'TestAgent',
      messages: [{ role: 'user', content: 'start' }],
      toolRegistry: registry,
      initialActiveTools: ['echo'],
      budget: { maxTurns: 5, maxToolCalls: 6 },
      callModel: () => {
        turn += 1
        if (turn === 1) return { stage: 'run', toolCalls: [failingCall(1)], done: false }
        if (turn === 2) return { stage: 'run', toolCalls: [{ callId: 'call_ok', toolName: 'echo', stage: 'run', args: { text: 'hi' }, expectation: '' }], done: false }
        if (turn === 3) return { stage: 'run', toolCalls: [failingCall(3)], done: false }
        return { stage: 'run', toolCalls: [], done: true }
      }
    })
    const results = transcript.turns.flatMap((t) => t.toolResults)
    expect(results.map((r) => r.status)).toEqual(['error', 'success', 'error'])
    // 中间成功已复位计数：第 3 轮的失败仍算「第 1 次」，不加熔断提醒。
    expect(results[2].content).not.toContain('熔断提醒')
  })
})

// 重复读提醒（2026-07-06 真机八验「疯狂读原文」·同错熔断的姊妹）：同一工具+同签名参数的成功调用，
// 结果与上一次完全相同 → 回执追加提醒；结果有变化（如精修后再读）不提醒——区分「改后确认读」与「无意义重复读」。
describe('重复调用提醒（同参同结果·2026-07-06）', () => {
  const readCall = (id, ref) => ({ callId: id, toolName: 'readMsg', stage: 'run', args: { ref }, expectation: '' })

  it('同参数且结果完全相同的第 2 次成功调用：回执追加重复调用提醒；换参数不提醒', async () => {
    const registry = new ToolRegistry([{
      name: 'readMsg',
      brief: '读消息',
      execute: (toolCall) => ({ content: `【${toolCall.args.ref}】原文内容不变` })
    }])
    let turn = 0
    const { transcript } = await runAgentRuntime({
      agentName: 'TestAgent',
      messages: [{ role: 'user', content: 'start' }],
      toolRegistry: registry,
      initialActiveTools: ['readMsg'],
      budget: { maxTurns: 5, maxToolCalls: 8 },
      callModel: () => {
        turn += 1
        if (turn === 1) return { stage: 'run', toolCalls: [readCall('c1', '角色10')], done: false }
        if (turn === 2) return { stage: 'run', toolCalls: [readCall('c2', '角色10')], done: false } // ← 同参同结果：提醒
        if (turn === 3) return { stage: 'run', toolCalls: [readCall('c3', '角色11')], done: false } // ← 换参：不提醒
        return { stage: 'run', toolCalls: [], done: true }
      }
    })
    const results = transcript.turns.flatMap((t) => t.toolResults)
    expect(results.map((r) => r.status)).toEqual(['success', 'success', 'success'])
    expect(results[0].content).not.toContain('重复调用提醒')
    expect(results[1].content).toContain('重复调用提醒')
    expect(results[1].content).toContain('完全相同')
    expect(results[2].content).not.toContain('重复调用提醒')
  })

  it('同参数但结果有变化（如精修后再读）不提醒；失败结果不参与比对', async () => {
    let version = 0
    const registry = new ToolRegistry([{
      name: 'readMsg',
      brief: '读消息',
      execute: (toolCall) => {
        if (toolCall.args.ref === 'bad') return { content: '未找到', status: 'error', error: { type: 'INVALID_ARGUMENT', message: '未找到' } }
        version += 1
        return { content: `【角色10】v${version} 内容` }
      }
    }])
    let turn = 0
    const { transcript } = await runAgentRuntime({
      agentName: 'TestAgent',
      messages: [{ role: 'user', content: 'start' }],
      toolRegistry: registry,
      initialActiveTools: ['readMsg'],
      budget: { maxTurns: 5, maxToolCalls: 8 },
      callModel: () => {
        turn += 1
        if (turn === 1) return { stage: 'run', toolCalls: [readCall('c1', '角色10')], done: false }
        if (turn === 2) return { stage: 'run', toolCalls: [readCall('c2', '角色10')], done: false } // 内容变了（v1→v2）：不提醒
        if (turn === 3) return { stage: 'run', toolCalls: [readCall('c3', 'bad')], done: false } // 失败：不参与
        return { stage: 'run', toolCalls: [], done: true }
      }
    })
    const results = transcript.turns.flatMap((t) => t.toolResults)
    expect(results[1].content).not.toContain('重复调用提醒')
    expect(results[2].content).not.toContain('重复调用提醒')
  })
})
