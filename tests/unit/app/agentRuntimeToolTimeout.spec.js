// 架构审查批B·目标2：单工具执行超时。execute 卡死时 runtime 不能死等——超时不 throw，
// 回落成错误型工具结果，loop 正常继续；longRunning:true 的工具（等用户交互/派发子agent）完全免超时。
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_TOOL_EXECUTE_TIMEOUT_MS, runAgentRuntime as runAgentRuntimeBase } from '../../../src/app/agentRuntime/runtime.ts'
import { ToolRegistry } from '../../../src/app/agentRuntime/toolRegistry.ts'

const runAgentRuntime = (input) => runAgentRuntimeBase({ ...input, taskTodoMode: 'disabled' })

function runOnce(toolRegistry, toolName) {
  return runAgentRuntime({
    agentName: 'T',
    messages: [{ role: 'user', content: 'start' }],
    toolRegistry,
    initialActiveTools: [toolName],
    budget: { maxTurns: 1, maxToolCalls: 1 },
    callModel: () => ({
      toolCalls: [{ callId: 'c1', toolName, args: {} }],
      done: true
    })
  })
}

describe('agentRuntime · 单工具执行超时（架构审查批B）', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('永不 resolve 的 execute 在 fake timers 下按默认超时回退成错误结果，loop 正常收尾', async () => {
    vi.useFakeTimers()
    const registry = new ToolRegistry([
      { name: 'hang', brief: '永不返回的工具', execute: () => new Promise(() => {}) }
    ])
    const runPromise = runOnce(registry, 'hang')
    await vi.advanceTimersByTimeAsync(DEFAULT_TOOL_EXECUTE_TIMEOUT_MS)
    const { transcript } = await runPromise

    expect(transcript.terminalReason).toBe('done')
    const result = transcript.turns[0].toolResults[0]
    expect(result.status).toBe('error')
    expect(result.error.type).toBe('TOOL_RUNTIME_ERROR')
    expect(result.error.message).toContain('工具执行超时')
    expect(result.error.message).toContain('hang')
    expect(result.details).toMatchObject({ timedOut: true, timeoutMs: DEFAULT_TOOL_EXECUTE_TIMEOUT_MS })
  })

  it('longRunning:true 的工具不受默认超时影响：超过阈值仍继续等待直到真正完成', async () => {
    vi.useFakeTimers()
    const registry = new ToolRegistry([
      {
        name: 'slowButLongRunning',
        brief: '故意跑得比默认超时还久，但标了 longRunning',
        longRunning: true,
        execute: () => new Promise((resolve) => {
          setTimeout(() => resolve({ content: 'done-late' }), DEFAULT_TOOL_EXECUTE_TIMEOUT_MS + 5000)
        })
      }
    ])
    const runPromise = runOnce(registry, 'slowButLongRunning')
    // 先推进到「若不是 longRunning 就该超时」的那一刻：不应提前拿到超时错误结果。
    await vi.advanceTimersByTimeAsync(DEFAULT_TOOL_EXECUTE_TIMEOUT_MS)
    // 再推进到工具真正完成的时间点。
    await vi.advanceTimersByTimeAsync(6000)
    const { transcript } = await runPromise

    const result = transcript.turns[0].toolResults[0]
    expect(result.status).toBe('success')
    expect(result.content).toBe('done-late')
  })

  it('正常完成的工具不受影响，且超时定时器会被清理（不残留待触发计时器）', async () => {
    vi.useFakeTimers()
    const registry = new ToolRegistry([
      { name: 'fast', brief: '立即返回', execute: () => ({ content: 'ok' }) }
    ])
    const { transcript } = await runOnce(registry, 'fast')

    expect(transcript.turns[0].toolResults[0]).toMatchObject({ status: 'success', content: 'ok' })
    // 定时器必须在 execute 落定后清理：不清理会残留一个待触发的超时计时器。
    expect(vi.getTimerCount()).toBe(0)
  })

  it('工具执行期间抛异步错误（非超时）仍归为 TOOL_RUNTIME_ERROR，不误判成超时', async () => {
    vi.useFakeTimers()
    const registry = new ToolRegistry([
      { name: 'throwsAsync', brief: '异步抛错', execute: async () => { throw new Error('炸了') } }
    ])
    const { transcript } = await runOnce(registry, 'throwsAsync')

    const result = transcript.turns[0].toolResults[0]
    expect(result.status).toBe('error')
    expect(result.error.message).toBe('炸了')
    expect(result.details?.timedOut).toBeUndefined()
  })
})
