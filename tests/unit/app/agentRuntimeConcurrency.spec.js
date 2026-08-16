import { describe, expect, it, vi } from 'vitest'
import { runAgentRuntime as runAgentRuntimeBase } from '../../../src/app/agentRuntime/runtime.ts'
import { ToolRegistry } from '../../../src/app/agentRuntime/toolRegistry.ts'

const runAgentRuntime = (input) => runAgentRuntimeBase({ ...input, taskTodoMode: 'disabled' })

// 批次1b：runAgentRuntime 同轮多 toolCall 并发执行路径。
// 验收：并发执行（真并行）、结果保序、单项失败并发池重试，以及未命中白名单时退回串行。

function makeModelOutput(count) {
  return () => ({
    stage: 'plan-generation',
    toolCalls: Array.from({ length: count }, (_, index) => ({
      callId: `call_plan_${index + 1}`,
      toolName: 'plan',
      stage: 'plan-generation',
      args: { index: index + 1 },
      expectation: `生成第 ${index + 1} 个计划。`
    })),
    done: true
  })
}

describe('agentRuntime 批次 1b 同轮并发', () => {
  it('白名单内多 toolCall 整批并发执行（真并行）且结果保序', async () => {
    let active = 0
    let maxActive = 0
    const registry = new ToolRegistry([
      {
        name: 'plan',
        brief: '生成计划',
        execute: async (toolCall) => {
          active += 1
          maxActive = Math.max(maxActive, active)
          await new Promise((resolve) => setTimeout(resolve, 5))
          active -= 1
          return { content: `plan:${toolCall.args.index}`, details: { index: toolCall.args.index } }
        }
      }
    ])

    const { transcript } = await runAgentRuntime({
      agentName: 'TestAgent',
      messages: [],
      toolRegistry: registry,
      initialActiveTools: ['plan'],
      budget: { maxTurns: 1, maxToolCalls: 10 },
      concurrency: { limit: 3, tools: ['plan'] },
      callModel: makeModelOutput(3)
    })

    // 3 个同时在跑 → 证明真并行（串行时 maxActive 恒为 1）
    expect(maxActive).toBe(3)
    // 结果保序：toolResults 顺序与 toolCalls 顺序一致
    expect(transcript.turns[0].toolResults.map((result) => result.callId)).toEqual([
      'call_plan_1',
      'call_plan_2',
      'call_plan_3'
    ])
    expect(transcript.turns[0].toolResults.map((result) => result.content)).toEqual([
      'plan:1',
      'plan:2',
      'plan:3'
    ])
    expect(transcript.turns[0].toolResults.every((result) => result.status === 'success')).toBe(true)
  })

  it('单项失败时由并发池退避重试，其它项不受影响', async () => {
    const attempts = { call_plan_1: 0, call_plan_2: 0 }
    const registry = new ToolRegistry([
      {
        name: 'plan',
        brief: '生成计划',
        execute: (toolCall) => {
          attempts[toolCall.callId] += 1
          // 第 2 个计划首次失败（retryable），第二次成功；第 1 个一次成功
          if (toolCall.callId === 'call_plan_2' && attempts[toolCall.callId] === 1) {
            return {
              content: '上游限流',
              status: 'error',
              error: { type: 'TOOL_RUNTIME_ERROR', message: '上游限流', retryable: true }
            }
          }
          return { content: `plan:${toolCall.args.index}`, details: {} }
        }
      }
    ])

    const { transcript } = await runAgentRuntime({
      agentName: 'TestAgent',
      messages: [],
      toolRegistry: registry,
      initialActiveTools: ['plan'],
      budget: { maxTurns: 1, maxToolCalls: 10 },
      concurrency: { limit: 3, tools: ['plan'], retries: 1, retryDelayMs: 0 },
      callModel: makeModelOutput(2)
    })

    expect(attempts.call_plan_1).toBe(1)
    expect(attempts.call_plan_2).toBe(2) // 重试一次
    expect(transcript.turns[0].toolResults.map((result) => result.status)).toEqual(['success', 'success'])
    expect(transcript.turns[0].toolResults[1].content).toBe('plan:2')
  })

  it('重试次数耗尽后以结构化失败收口，不伪造成功', async () => {
    const execute = vi.fn(() => ({
      content: '持续失败',
      status: 'error',
      error: { type: 'TOOL_RUNTIME_ERROR', message: '持续失败', retryable: true }
    }))
    const registry = new ToolRegistry([{ name: 'plan', brief: '生成计划', execute }])

    const { transcript } = await runAgentRuntime({
      agentName: 'TestAgent',
      messages: [],
      toolRegistry: registry,
      initialActiveTools: ['plan'],
      budget: { maxTurns: 1, maxToolCalls: 10 },
      concurrency: { limit: 2, tools: ['plan'], retries: 1, retryDelayMs: 0 },
      callModel: makeModelOutput(2)
    })

    // 每项尝试 2 次（首次 + 重试 1）
    expect(execute).toHaveBeenCalledTimes(4)
    expect(transcript.turns[0].toolResults.map((result) => result.status)).toEqual(['error', 'error'])
    expect(transcript.turns[0].toolResults.map((result) => result.error?.type)).toEqual([
      'TOOL_RUNTIME_ERROR',
      'TOOL_RUNTIME_ERROR'
    ])
  })

  it('并非全部命中白名单时退回串行执行', async () => {
    let active = 0
    let maxActive = 0
    const registry = new ToolRegistry([
      {
        name: 'plan',
        brief: '生成计划',
        execute: async (toolCall) => {
          active += 1
          maxActive = Math.max(maxActive, active)
          await new Promise((resolve) => setTimeout(resolve, 5))
          active -= 1
          return { content: `plan:${toolCall.args.index}`, details: {} }
        }
      },
      { name: 'other', brief: '别的工具', execute: () => ({ content: 'other:ok', details: {} }) }
    ])

    const { transcript } = await runAgentRuntime({
      agentName: 'TestAgent',
      messages: [],
      toolRegistry: registry,
      initialActiveTools: ['plan', 'other'],
      budget: { maxTurns: 1, maxToolCalls: 10 },
      concurrency: { limit: 3, tools: ['plan'] }, // other 不在白名单 → 退回串行
      callModel: () => ({
        stage: 'plan-generation',
        toolCalls: [
          { callId: 'call_plan_1', toolName: 'plan', stage: 'plan-generation', args: { index: 1 }, expectation: 'p1' },
          { callId: 'call_other', toolName: 'other', stage: 'plan-generation', args: {}, expectation: 'o' }
        ],
        done: true
      })
    })

    // 串行：同一时刻最多 1 个在跑
    expect(maxActive).toBe(1)
    expect(transcript.turns[0].toolResults.map((result) => result.callId)).toEqual(['call_plan_1', 'call_other'])
  })

  it('并发批中 requestRetry 不中断本批，全部结果落账后再走下一轮', async () => {
    const { HookRegistry } = await import('../../../src/app/agentRuntime/hookRegistry.ts')
    const registry = new ToolRegistry([
      { name: 'plan', brief: '生成计划', execute: (toolCall) => ({ content: `plan:${toolCall.args.index}`, details: {} }) }
    ])
    // afterToolResult 对第 1 个计划请求重试；并发批应仍把两个结果都落账，再于下一轮重试
    const hookRegistry = new HookRegistry([
      {
        id: 'retry-first',
        lifecycle: 'afterToolResult',
        priority: 10,
        appliesTo: { toolName: 'plan' },
        run: ({ toolResult }) => {
          if (toolResult.callId !== 'call_plan_1') return
          return {
            summary: 'retry first plan',
            requestRetry: { callId: toolResult.callId, toolName: 'plan', errorType: 'EXPECTATION_MISMATCH', reason: '重试第一项' }
          }
        }
      }
    ])

    const callModel = vi.fn((request) => {
      if (request.turnIndex === 0) return makeModelOutput(2)()
      return { toolCalls: [], done: true }
    })

    const { transcript } = await runAgentRuntime({
      agentName: 'TestAgent',
      messages: [],
      toolRegistry: registry,
      hookRegistry,
      initialActiveTools: ['plan'],
      budget: { maxTurns: 2, maxToolCalls: 10 },
      concurrency: { limit: 3, tools: ['plan'] },
      callModel
    })

    // 第一轮两个结果都已落账（不被 retry 中断）
    expect(transcript.turns[0].toolResults.map((result) => result.callId)).toEqual(['call_plan_1', 'call_plan_2'])
    // requestRetry 触发了下一轮模型调用
    expect(callModel).toHaveBeenCalledTimes(2)
    expect(transcript.turns[0].nextTurnPatches.some((patch) => patch.requestRetry?.callId === 'call_plan_1')).toBe(true)
  })
})
