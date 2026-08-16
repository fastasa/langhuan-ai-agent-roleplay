// closingNote 预写收尾话收束（2026-07-12 用户拍板）：派发类工具（星依派绘舆/派采风/派提调纠偏）耗时几分钟，
// 原引擎「工具执行完必然再调一次模型」的强制收尾轮，专为这类工具换一句常常只有几个字的收尾话，是账单上最大的
// 浪费项。改良方案：模型在发起派发那一轮就把收尾话预写好（工具参数 closingNote），派发**完全成功**时引擎直接
// 用这段预写文案收束本轮、不再多跑一轮；失败/被驳回/需追问时不使用（安全底线：收尾话永远不能在失败时误报成功）。
import { describe, expect, it, vi } from 'vitest'
import { runAgentRuntime as runAgentRuntimeBase } from '../../../src/app/agentRuntime/runtime.ts'
import { ToolRegistry } from '../../../src/app/agentRuntime/toolRegistry.ts'

const runAgentRuntime = (input) => runAgentRuntimeBase({ ...input, taskTodoMode: 'disabled' })

describe('agentRuntime · closingNote 预写收尾话收束', () => {
  it('①单工具成功带 closingNote → loop 收束、模型只被调用一次、closingNote 成为最终 assistant 输出且进 history/messages', async () => {
    const registry = new ToolRegistry([
      {
        name: 'dispatchThing',
        brief: '示例派发工具',
        execute: () => ({
          content: '派发任务已交稿',
          details: { ok: true },
          closingNote: '已经帮用户办好啦～'
        })
      }
    ])
    const model = vi.fn(() => ({
      toolCalls: [{ callId: 'c1', toolName: 'dispatchThing', args: {} }],
      done: false
    }))

    const result = await runAgentRuntime({
      agentName: 'TestAgent',
      messages: [{ role: 'user', content: 'start' }],
      toolRegistry: registry,
      initialActiveTools: ['dispatchThing'],
      budget: { maxTurns: 5, maxToolCalls: 5 },
      callModel: model
    })

    // 省的正是这一轮：模型只被调用了一次（正常情况下工具执行完还要再调一轮换收尾话）。
    expect(model).toHaveBeenCalledTimes(1)
    expect(result.transcript.terminalReason).toBe('closing-note')

    // 原始工具调用轮保持保真：工具调用/结果都还在，未被覆盖。
    expect(result.transcript.turns[0].toolCalls).toHaveLength(1)
    expect(result.transcript.turns[0].toolResults[0]).toMatchObject({
      callId: 'c1',
      status: 'success',
      content: '派发任务已交稿',
      closingNote: '已经帮用户办好啦～'
    })

    // 新增的收尾 turn：没有工具调用，modelMessage.content 就是 closingNote（与真实模型「零工具轮」回复同形状）。
    const lastTurn = result.transcript.turns[result.transcript.turns.length - 1]
    expect(lastTurn.toolCalls).toEqual([])
    expect(lastTurn.toolResults).toEqual([])
    expect(lastTurn.modelMessage).toMatchObject({ kind: 'modelMessage', role: 'assistant', content: '已经帮用户办好啦～' })

    // messages 末尾补了一条纯文本 assistant 消息（与正常模型收尾回复走同一条回灌路径）。
    const lastMessage = result.messages[result.messages.length - 1]
    expect(lastMessage).toEqual({ role: 'assistant', content: '已经帮用户办好啦～' })

    // history 末尾同步补了一条 modelMessage（供审计/检索）。
    const lastHistory = result.transcript.history[result.transcript.history.length - 1]
    expect(lastHistory).toMatchObject({ kind: 'modelMessage', role: 'assistant', content: '已经帮用户办好啦～' })
  })

  it('②同轮多个工具调用：closingNote 被忽略，loop 正常继续到下一轮模型调用', async () => {
    const registry = new ToolRegistry([
      { name: 'a', brief: 'a', execute: () => ({ content: 'a done', closingNote: '不该生效A' }) },
      { name: 'b', brief: 'b', execute: () => ({ content: 'b done' }) }
    ])
    const model = vi.fn()
      .mockImplementationOnce(() => ({
        toolCalls: [
          { callId: 'c1', toolName: 'a', args: {} },
          { callId: 'c2', toolName: 'b', args: {} }
        ],
        done: false
      }))
      .mockImplementationOnce(() => ({ toolCalls: [], done: true }))

    const result = await runAgentRuntime({
      agentName: 'TestAgent',
      messages: [{ role: 'user', content: 'start' }],
      toolRegistry: registry,
      initialActiveTools: ['a', 'b'],
      budget: { maxTurns: 5, maxToolCalls: 5 },
      callModel: model
    })

    expect(model).toHaveBeenCalledTimes(2)
    expect(result.transcript.terminalReason).toBe('done')
    // 没有多出收尾 turn：只有两个真实模型轮（第二轮零工具调用自然收束）。
    expect(result.transcript.turns).toHaveLength(2)
  })

  it('③error 结果携带 closingNote：忽略，loop 正常继续（安全底线：失败不能误报成功）', async () => {
    const registry = new ToolRegistry([
      {
        name: 'flaky',
        brief: '出错工具误带 closingNote（防御性场景，不应触发收束）',
        execute: () => ({
          content: '出错了',
          status: 'error',
          error: { type: 'TOOL_RUNTIME_ERROR', message: '出错了', retryable: false },
          closingNote: '不该生效'
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

    expect(model).toHaveBeenCalledTimes(2)
    expect(result.transcript.terminalReason).toBe('done')
    expect(result.transcript.turns).toHaveLength(2)
  })

  it('④不带 closingNote：行为与现状逐字节一致（防回归）——照旧再调一轮模型收尾', async () => {
    const registry = new ToolRegistry([
      {
        name: 'dispatchThing',
        brief: '示例派发工具（不带 closingNote）',
        execute: () => ({ content: '派发任务已交稿', details: { ok: true } })
      }
    ])
    const model = vi.fn()
      .mockImplementationOnce(() => ({ toolCalls: [{ callId: 'c1', toolName: 'dispatchThing', args: {} }], done: false }))
      .mockImplementationOnce(() => ({ toolCalls: [], content: '好啦，办好啦～', done: true }))

    const result = await runAgentRuntime({
      agentName: 'TestAgent',
      messages: [{ role: 'user', content: 'start' }],
      toolRegistry: registry,
      initialActiveTools: ['dispatchThing'],
      budget: { maxTurns: 5, maxToolCalls: 5 },
      callModel: model
    })

    expect(model).toHaveBeenCalledTimes(2)
    expect(result.transcript.terminalReason).toBe('done')
    expect(result.transcript.turns).toHaveLength(2)
    const lastTurn = result.transcript.turns[result.transcript.turns.length - 1]
    expect(lastTurn.modelMessage.content).toBe('好啦，办好啦～')
  })
})
