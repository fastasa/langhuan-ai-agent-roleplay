// 架构审查批C·目标1：人在环上 halt 原语。工具返回 awaitingUser 信封时，引擎以
// terminalReason='awaiting-user' 在步骤边界收束本 loop、把信封透出到 pendingInteraction——
// 答复由消费方（如提调纠偏 askUser，见 tidiaoCorrectionLoop.ts）喂进新 loop 续接，不像 blocking 模式
// 那样在工具内部 await 用户。见 src/app/agentRuntime/interactionContract.ts 头注释三种投递模式说明。
import { describe, expect, it, vi } from 'vitest'
import { runAgentRuntime as runAgentRuntimeBase } from '../../../src/app/agentRuntime/runtime.ts'
import { ToolRegistry } from '../../../src/app/agentRuntime/toolRegistry.ts'

const runAgentRuntime = (input) => runAgentRuntimeBase({ ...input, taskTodoMode: 'disabled' })

describe('agentRuntime · halt 原语（架构审查批C）', () => {
  it('工具返回 awaitingUser（success）→ loop 以 awaiting-user 收束、pendingInteraction 透出、该工具结果已进 messages', async () => {
    const registry = new ToolRegistry([
      {
        name: 'askSomething',
        brief: '示例 halt 工具',
        execute: () => ({
          content: '已记录你的问题，本轮先停下来等用户答复。',
          details: { kind: 'demo' },
          awaitingUser: {
            kind: 'choice',
            title: '要选哪个？',
            options: [{ label: 'A' }, { label: 'B' }],
            recommended: 'A',
            source: { agent: 'test-agent', toolName: 'askSomething' }
          }
        })
      }
    ])
    const model = vi.fn(() => ({
      toolCalls: [{ callId: 'c1', toolName: 'askSomething', args: {} }],
      done: false
    }))

    const result = await runAgentRuntime({
      agentName: 'TestAgent',
      messages: [{ role: 'user', content: 'start' }],
      toolRegistry: registry,
      initialActiveTools: ['askSomething'],
      budget: { maxTurns: 5, maxToolCalls: 5 },
      callModel: model
    })

    expect(result.transcript.terminalReason).toBe('awaiting-user')
    expect(result.pendingInteraction).toEqual({
      kind: 'choice',
      title: '要选哪个？',
      options: [{ label: 'A' }, { label: 'B' }],
      recommended: 'A',
      source: { agent: 'test-agent', toolName: 'askSomething' }
    })
    // 模型只被调用一轮——halt 请求即收束，不会给模型下一轮机会（与旧「holder+halt hook」机制行为等价）。
    expect(model).toHaveBeenCalledTimes(1)
    // 工具结果已正常落定进 history/messages（模型若真续跑下一轮本能看到这条结果）。
    expect(result.transcript.turns[0].toolResults[0]).toMatchObject({
      callId: 'c1',
      status: 'success',
      content: '已记录你的问题，本轮先停下来等用户答复。'
    })
    const toolResultMessage = result.messages.find(
      (message) => message.role === 'user' && message.content.includes('已记录你的问题，本轮先停下来等用户答复。')
    )
    expect(toolResultMessage).toBeTruthy()
  })

  it('awaitingUser 但结果 status=error 时不触发 halt：loop 正常继续', async () => {
    const registry = new ToolRegistry([
      {
        name: 'flaky',
        brief: '错误结果误带 awaitingUser（防御性场景，不应触发收束）',
        execute: () => ({
          content: '出错了',
          status: 'error',
          error: { type: 'TOOL_RUNTIME_ERROR', message: '出错了', retryable: false },
          awaitingUser: {
            kind: 'choice',
            title: '不该生效',
            source: { agent: 'test-agent', toolName: 'flaky' }
          }
        })
      }
    ])
    const model = vi.fn()
      .mockImplementationOnce(() => ({ toolCalls: [{ callId: 'c1', toolName: 'flaky', args: {} }], done: false }))
      .mockImplementationOnce(() => ({ toolCalls: [], done: true }))

    const result = await runAgentRuntime({
      agentName: 'TestAgent',
      messages: [{ role: 'user', content: 'start' }],
      toolRegistry: registry,
      initialActiveTools: ['flaky'],
      budget: { maxTurns: 5, maxToolCalls: 5 },
      callModel: model
    })

    expect(result.transcript.terminalReason).toBe('done')
    expect(result.pendingInteraction).toBeUndefined()
    expect(model).toHaveBeenCalledTimes(2)
  })

  it('并发批路径防御：批内多个 awaitingUser 只认第一个（取 callId 序中最先落定的那条）', async () => {
    const registry = new ToolRegistry([
      {
        name: 'askA',
        brief: '第一个 halt 工具',
        execute: () => ({
          content: 'askA 已记录',
          awaitingUser: { kind: 'choice', title: '问题A', source: { agent: 'test-agent', toolName: 'askA' } }
        })
      },
      {
        name: 'askB',
        brief: '第二个 halt 工具（同批·理论到不了，防御性覆盖）',
        execute: () => ({
          content: 'askB 已记录',
          awaitingUser: { kind: 'choice', title: '问题B', source: { agent: 'test-agent', toolName: 'askB' } }
        })
      }
    ])
    const model = vi.fn(() => ({
      toolCalls: [
        { callId: 'c1', toolName: 'askA', args: {} },
        { callId: 'c2', toolName: 'askB', args: {} }
      ],
      done: false
    }))

    const result = await runAgentRuntime({
      agentName: 'TestAgent',
      messages: [{ role: 'user', content: 'start' }],
      toolRegistry: registry,
      initialActiveTools: ['askA', 'askB'],
      budget: { maxTurns: 5, maxToolCalls: 5 },
      concurrency: { limit: 2, tools: ['askA', 'askB'] },
      callModel: model
    })

    expect(result.transcript.terminalReason).toBe('awaiting-user')
    expect(result.pendingInteraction?.title).toBe('问题A')
    // 批内两条结果都照常处理完（不中断本批），只是引擎只采纳第一条作为 pendingInteraction。
    expect(result.transcript.turns[0].toolResults.map((r) => r.callId)).toEqual(['c1', 'c2'])
    expect(model).toHaveBeenCalledTimes(1)
  })
})
