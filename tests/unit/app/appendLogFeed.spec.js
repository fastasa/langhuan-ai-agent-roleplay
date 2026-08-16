import { afterEach, describe, expect, it } from 'vitest'
import {
  activeAgentAppendLog,
  beginAppendLog,
  getAppendLogErrors,
  getAppendLogEvents,
  searchAppendLog
} from '../../../src/app/agentState/appendLog.ts'
import { feedAppendLogFromFidelityEvent } from '../../../src/app/agentState/appendLogFeed.ts'
import { ToolRegistry } from '../../../src/app/agentRuntime/toolRegistry.ts'

afterEach(() => { activeAgentAppendLog.value = null })

const registry = new ToolRegistry([
  { name: 'recallSemantic', brief: '', fieldLifecycle: { hits: 'searchable' }, execute: () => ({ content: '' }) }
])

describe('feedAppendLogFromFidelityEvent（R3-2/3/5 统一喂入）', () => {
  it('assistant-message / tool-call / tool-result 分发进 log；结果透传 fieldLifecycle', () => {
    beginAppendLog({ runId: 'r1', sessionId: 's1' })
    feedAppendLogFromFidelityEvent({ kind: 'assistant-message', content: '{"thought":"判定情境"}', turnIndex: 0 }, registry)
    feedAppendLogFromFidelityEvent({ kind: 'tool-call', toolCall: { kind: 'toolCall', callId: 'c1', toolName: 'recallSemantic', stage: 'plan-generation', args: { query: '宾馆' } }, turnIndex: 1 }, registry)
    feedAppendLogFromFidelityEvent({ kind: 'tool-result', toolResult: { kind: 'toolResult', callId: 'c1', toolName: 'recallSemantic', stage: 'plan-generation', status: 'success', content: '命中', details: { hits: [1] } }, turnIndex: 1 }, registry)
    const events = getAppendLogEvents('r1')
    expect(events.map((e) => e.type)).toEqual(['message', 'toolCall', 'toolResult'])
    // R3-3：结果事件带上工具静态 fieldLifecycle（hits=searchable）。
    expect(events[2].lifecycle).toEqual({ hits: 'searchable' })
  })

  it('R3-5：工具报错/被拦 → toolResult 事件 + 额外一条 error 事件（定位哪一步/哪个工具/第几轮/什么错）', () => {
    beginAppendLog({ runId: 'r1', sessionId: 's1' })
    feedAppendLogFromFidelityEvent({
      kind: 'tool-result',
      toolResult: { kind: 'toolResult', callId: 'c1', toolName: 'fetchUnitDetail', stage: 'plan-generation', status: 'error', content: '未找到单位 X', details: {}, error: { type: 'TOOL_RUNTIME_ERROR', message: '未找到单位 X', retryable: false } },
      turnIndex: 3
    }, registry)
    const events = getAppendLogEvents('r1')
    expect(events.map((e) => e.type)).toEqual(['toolResult', 'error'])
    const errors = getAppendLogErrors('r1')
    expect(errors).toHaveLength(1)
    expect(errors[0].toolName).toBe('fetchUnitDetail')
    expect(errors[0].stage).toBe('plan-generation')
    expect(errors[0].turnIndex).toBe(3)
    expect(errors[0].error.message).toBe('未找到单位 X')
  })

  it('error 缺省时兜底构造（status=error 但无 error 字段）', () => {
    beginAppendLog({ runId: 'r1', sessionId: 's1' })
    feedAppendLogFromFidelityEvent({
      kind: 'tool-result',
      toolResult: { kind: 'toolResult', callId: 'c1', toolName: 'x', stage: 'plan-generation', status: 'error', content: '炸了', details: {} },
      turnIndex: 1
    }, registry)
    const errors = getAppendLogErrors('r1')
    expect(errors).toHaveLength(1)
    expect(errors[0].error.type).toBe('TOOL_RUNTIME_ERROR')
    expect(errors[0].error.message).toBe('炸了')
  })

  it('无活动 log 时零副作用（不抛错）', () => {
    expect(() => feedAppendLogFromFidelityEvent({ kind: 'assistant-message', content: 'x', turnIndex: 0 })).not.toThrow()
  })

  // R1-C 主/子 state 隔离（只 merge 结论）：演员事件标 origin='actor'·仍进保真层供审计/检索·投影另过滤。
  it('R1-C：origin=actor 透传——演员事件打标且仍 append 进保真层（审计/检索保留）', () => {
    beginAppendLog({ runId: 'r1', sessionId: 's1' })
    // 提调本人事件：不传 origin → 缺省（无 origin 字段）。
    feedAppendLogFromFidelityEvent({ kind: 'assistant-message', content: '提调决策', turnIndex: 0 }, registry)
    // 演员事件：传 origin='actor' → 消息/工具调用/工具结果/报错全打标。
    feedAppendLogFromFidelityEvent({ kind: 'assistant-message', content: '演员思路', turnIndex: 1 }, registry, 'actor')
    feedAppendLogFromFidelityEvent({ kind: 'tool-call', toolCall: { kind: 'toolCall', callId: 'c1', toolName: 'recallSemantic', args: { query: '料' } }, turnIndex: 1 }, registry, 'actor')
    feedAppendLogFromFidelityEvent({ kind: 'tool-result', toolResult: { kind: 'toolResult', callId: 'c1', toolName: 'recallSemantic', status: 'error', content: '演员取料失败', details: {}, error: { type: 'TOOL_RUNTIME_ERROR', message: '演员取料失败', retryable: false } }, turnIndex: 1 }, registry, 'actor')
    const events = getAppendLogEvents('r1')
    // 全部事件都还在保真层（审计保留）：提调 message + 演员 message/toolCall/toolResult/error。
    expect(events.map((e) => e.type)).toEqual(['message', 'message', 'toolCall', 'toolResult', 'error'])
    // 提调事件无 origin；演员四件套全标 'actor'。
    expect(events[0].origin).toBeUndefined()
    expect(events[1].origin).toBe('actor')
    expect(events[2].origin).toBe('actor')
    expect(events[3].origin).toBe('actor')
    expect(events[4].origin).toBe('actor') // 报错事件也随 origin 打标
    // 演员事件仍可被检索搜回（保留演员自审计）。
    expect(searchAppendLog('演员取料失败', { runId: 'r1' }).length).toBeGreaterThan(0)
  })
})
