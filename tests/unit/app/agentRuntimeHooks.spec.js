import { describe, expect, it, vi } from 'vitest'
import { HookRegistry } from '../../../src/app/agentRuntime/hookRegistry.ts'
import { runAgentRuntime as runAgentRuntimeBase } from '../../../src/app/agentRuntime/runtime.ts'
import { ToolRegistry } from '../../../src/app/agentRuntime/toolRegistry.ts'

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
      name: 'other',
      brief: '下一阶段工具',
      execute: () => ({ content: 'other:ok', details: {} })
    }
  ])
}

describe('HookRegistry 批次 2', () => {
  it('afterToolResult hooks 按 priority 顺序 patch toolResult 并写入 hookEvents/history', async () => {
    const hookRegistry = new HookRegistry([
      {
        id: 'append-first',
        lifecycle: 'afterToolResult',
        priority: 20,
        appliesTo: { toolName: 'echo', status: 'success' },
        run: ({ toolResult }) => ({
          summary: 'first patch',
          patchToolResult: {
            content: `${toolResult.content}|first`,
            details: { first: true }
          }
        })
      },
      {
        id: 'append-second',
        lifecycle: 'afterToolResult',
        priority: 30,
        appliesTo: { toolName: 'echo', status: 'success' },
        run: ({ toolResult }) => ({
          summary: 'second patch',
          patchToolResult: {
            content: `${toolResult.content}|second`,
            details: { second: true }
          }
        })
      }
    ])

    const { transcript } = await runAgentRuntime({
      agentName: 'TestAgent',
      messages: [],
      toolRegistry: makeRegistry(),
      hookRegistry,
      initialActiveTools: ['echo'],
      budget: { maxTurns: 1, maxToolCalls: 2 },
      callModel: () => ({
        toolCalls: [{ callId: 'call_echo', toolName: 'echo', args: { text: 'hi' }, expectation: '返回 hi。' }],
        done: true
      })
    })

    expect(transcript.turns[0].toolResults[0]).toMatchObject({
      callId: 'call_echo',
      content: 'echo:hi|first|second',
      details: { echoed: 'hi', first: true, second: true }
    })
    expect(transcript.turns[0].hookEvents.map((event) => event.id)).toEqual(['append-first', 'append-second'])
    expect(transcript.history.map((message) => message.kind)).toEqual([
      'modelMessage',
      'toolCall',
      'toolResult',
      'hookEvent',
      'hookEvent'
    ])
  })

  it('beforeToolCall hook 可以阻止工具执行并生成结构化 blocked toolResult', async () => {
    const execute = vi.fn(() => ({ content: 'should-not-run', details: {} }))
    const toolRegistry = new ToolRegistry([
      { name: 'echo', brief: '返回输入文本', execute }
    ])
    const hookRegistry = new HookRegistry([
      {
        id: 'block-echo',
        lifecycle: 'beforeToolCall',
        priority: 10,
        appliesTo: { stage: 'plan-generation', toolName: 'echo' },
        run: () => ({
          summary: 'block unsafe call',
          blockToolCall: {
            message: '当前阶段禁止执行 echo',
            errorType: 'EXPECTATION_MISMATCH',
            details: { reason: 'stage gate' }
          }
        })
      }
    ])

    const { transcript } = await runAgentRuntime({
      agentName: 'TestAgent',
      messages: [],
      toolRegistry,
      hookRegistry,
      initialActiveTools: ['echo'],
      budget: { maxTurns: 1, maxToolCalls: 2 },
      callModel: () => ({
        stage: 'plan-generation',
        toolCalls: [{ callId: 'call_blocked', toolName: 'echo', stage: 'plan-generation', args: { text: 'hi' }, expectation: '不应执行。' }],
        done: true
      })
    })

    expect(execute).not.toHaveBeenCalled()
    expect(transcript.turns[0].toolResults[0]).toMatchObject({
      callId: 'call_blocked',
      status: 'blocked',
      content: '当前阶段禁止执行 echo',
      error: { type: 'EXPECTATION_MISMATCH' }
    })
    expect(transcript.turns[0].hookEvents[0]).toMatchObject({
      id: 'block-echo',
      effects: expect.arrayContaining(['blockToolCall', 'writeTrace'])
    })
  })

  it('beforeNextTurn hook 可以注入 NextTurnPatch 并更新下一轮 activeTools', async () => {
    const callModel = vi.fn(({ turnIndex }) => {
      if (turnIndex === 0) {
        return {
          toolCalls: [{ callId: 'call_echo', toolName: 'echo', args: { text: 'hi' }, expectation: '返回 hi。' }],
          done: false
        }
      }
      return { toolCalls: [], done: true }
    })
    const hookRegistry = new HookRegistry([
      {
        id: 'advance-tools',
        lifecycle: 'beforeNextTurn',
        priority: 10,
        run: () => ({
          summary: 'advance to other',
          activeTools: ['other'],
          injectMessages: [
            {
              role: 'user',
              purpose: 'stage-instruction',
              content: '下一轮只允许调用 other。'
            }
          ]
        })
      }
    ])

    const { transcript } = await runAgentRuntime({
      agentName: 'TestAgent',
      messages: [],
      toolRegistry: makeRegistry(),
      hookRegistry,
      initialActiveTools: ['echo'],
      budget: { maxTurns: 2, maxToolCalls: 2 },
      callModel
    })

    expect(callModel.mock.calls[0][0].activeTools).toEqual(['echo'])
    expect(callModel.mock.calls[1][0].activeTools).toEqual(['other'])
    expect(transcript.turns[0].nextTurnPatches[0]).toMatchObject({
      sourceHookId: 'advance-tools',
      activeTools: ['other'],
      injectMessages: [{ role: 'user', purpose: 'stage-instruction', content: '下一轮只允许调用 other。' }]
    })
    expect(transcript.history.some((message) => message.kind === 'nextTurnPatch')).toBe(true)
  })

  it('hook appliesTo 支持 status 和 errorType 匹配错误结果并注入修复提示', async () => {
    const hookRegistry = new HookRegistry([
      {
        id: 'repair-invalid-args',
        lifecycle: 'afterToolResult',
        priority: 10,
        appliesTo: { toolName: 'echo', status: 'error', errorType: 'INVALID_ARGUMENT' },
        run: ({ toolResult }) => ({
          summary: 'inject repair prompt',
          injectMessages: [
            {
              role: 'user',
              purpose: 'error-repair',
              content: `修正参数后重试：${toolResult.error.message}`
            }
          ],
          requestRetry: {
            callId: toolResult.callId,
            toolName: toolResult.toolName,
            errorType: 'INVALID_ARGUMENT',
            reason: '参数为空'
          }
        })
      }
    ])

    const { transcript } = await runAgentRuntime({
      agentName: 'TestAgent',
      messages: [],
      toolRegistry: makeRegistry(),
      hookRegistry,
      initialActiveTools: ['echo'],
      budget: { maxTurns: 1, maxToolCalls: 2 },
      callModel: () => ({
        toolCalls: [{ callId: 'call_bad_args', toolName: 'echo', args: { text: '' }, expectation: '应返回参数错误。' }],
        done: true
      })
    })

    expect(transcript.turns[0].hookEvents.map((event) => event.id)).toEqual(['repair-invalid-args'])
    expect(transcript.turns[0].nextTurnPatches[0]).toMatchObject({
      sourceHookId: 'repair-invalid-args',
      requestRetry: {
        callId: 'call_bad_args',
        toolName: 'echo',
        errorType: 'INVALID_ARGUMENT',
        reason: '参数为空'
      }
    })
  })
})
