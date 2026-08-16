// R3-2：runtime 保真事件上抛（onEvent → append log 源）。验证 loop 内 assistant 消息/工具调用/工具结果
// 一产生即以**原始对象**上抛（不截断、不折叠），且 onEvent 缺省时零开销（默认行为不变由其它 runtime 测试覆盖）。
import { describe, expect, it, vi } from 'vitest'
import { runAgentRuntime as runAgentRuntimeBase } from '../../../src/app/agentRuntime/runtime.ts'
import { ToolRegistry } from '../../../src/app/agentRuntime/toolRegistry.ts'

const runAgentRuntime = (input) => runAgentRuntimeBase({ ...input, taskTodoMode: 'disabled' })

function makeRegistry() {
  return new ToolRegistry([
    {
      name: 'echo',
      brief: '返回输入文本',
      validateArgs: (args) => typeof args.text === 'string' && args.text.trim() ? null : 'echo.text 必须是非空字符串',
      execute: (toolCall) => ({ content: `echo:${toolCall.args.text}`, details: { echoed: toolCall.args.text } })
    },
    {
      name: 'boom',
      brief: '测试异常工具',
      execute: () => { throw new Error('炸了') }
    }
  ])
}

describe('agentRuntime · R3-2 保真事件上抛', () => {
  it('成功工具：按序上抛 assistant-message → tool-call → tool-result，且带原始对象', async () => {
    const callModel = vi.fn(() => ({
      stage: 'plan',
      content: JSON.stringify({ stage: 'plan', done: true }),
      toolCalls: [{ callId: 'call_1', toolName: 'echo', stage: 'plan', args: { text: 'hi' } }],
      done: true
    }))
    const events = []
    await runAgentRuntime({
      agentName: 'T',
      messages: [{ role: 'user', content: 'start' }],
      toolRegistry: makeRegistry(),
      initialActiveTools: ['echo'],
      budget: { maxTurns: 2, maxToolCalls: 2 },
      callModel,
      onEvent: (event) => events.push(event)
    })

    expect(events.map((e) => e.kind)).toEqual(['assistant-message', 'tool-call', 'tool-result'])
    // assistant 消息保真原文（编排元数据 JSON）
    expect(events[0]).toMatchObject({ kind: 'assistant-message', turnIndex: 0 })
    expect(events[0].content).toContain('plan')
    // 工具调用保真原始入参
    expect(events[1].toolCall).toMatchObject({ callId: 'call_1', toolName: 'echo', args: { text: 'hi' } })
    // 工具结果保真 content+details（不截断）
    expect(events[2].toolResult).toMatchObject({ callId: 'call_1', toolName: 'echo', status: 'success', content: 'echo:hi' })
    expect(events[2].toolResult.details).toMatchObject({ echoed: 'hi' })
  })

  it('工具抛错：tool-result 事件携带 status=error 的原始结果（供 R3-5 报错诊断）', async () => {
    const callModel = vi.fn(() => ({
      stage: 'plan',
      content: JSON.stringify({ stage: 'plan', done: true }),
      toolCalls: [{ callId: 'call_x', toolName: 'boom', stage: 'plan', args: {} }],
      done: true
    }))
    const events = []
    await runAgentRuntime({
      agentName: 'T',
      messages: [{ role: 'user', content: 'start' }],
      toolRegistry: makeRegistry(),
      initialActiveTools: ['boom'],
      budget: { maxTurns: 2, maxToolCalls: 2 },
      callModel,
      onEvent: (event) => events.push(event)
    })

    const result = events.find((e) => e.kind === 'tool-result')
    expect(result).toBeTruthy()
    expect(result.toolResult.status).toBe('error')
    expect(result.toolResult.error?.message).toContain('炸了')
  })

  it('未传 onEvent：loop 正常跑完不抛错（默认零开销）', async () => {
    const callModel = vi.fn(() => ({
      stage: 'plan',
      content: JSON.stringify({ stage: 'plan', done: true }),
      toolCalls: [{ callId: 'call_1', toolName: 'echo', stage: 'plan', args: { text: 'hi' } }],
      done: true
    }))
    const { transcript } = await runAgentRuntime({
      agentName: 'T',
      messages: [{ role: 'user', content: 'start' }],
      toolRegistry: makeRegistry(),
      initialActiveTools: ['echo'],
      budget: { maxTurns: 2, maxToolCalls: 2 },
      callModel
    })
    expect(transcript.turns).toHaveLength(1)
    expect(transcript.turns[0].toolResults[0].status).toBe('success')
  })
})
