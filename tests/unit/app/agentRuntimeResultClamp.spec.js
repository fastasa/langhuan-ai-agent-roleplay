// 架构审查批B·目标1：工具结果中央钳制。回灌模型 messages 的 content 超过阈值即截断+提示，
// 但 history / onEvent 保真事件必须拿到钳制前全文（钳制点只在 toolResultToChatMessage 一处）。
import { describe, expect, it } from 'vitest'
import { runAgentRuntime as runAgentRuntimeBase } from '../../../src/app/agentRuntime/runtime.ts'
import { ToolRegistry, DEFAULT_TOOL_RESULT_CLAMP_CHARS } from '../../../src/app/agentRuntime/toolRegistry.ts'

const runAgentRuntime = (input) => runAgentRuntimeBase({ ...input, taskTodoMode: 'disabled' })

/** 从 runAgentRuntime 返回的 messages 里取回灌的工具结果正文（非原生轮=role:'user' JSON 信封）。 */
function readToolResultChatContent(messages) {
  const message = messages.find((item) => item.role === 'user' && item.content.includes('"kind":"toolResult"'))
  expect(message).toBeTruthy()
  return JSON.parse(message.content).content
}

function runOnce(toolRegistry, toolName, onEvent, runtimeOptions = {}) {
  const usage = runtimeOptions.usage
  return runAgentRuntime({
    agentName: 'T',
    messages: [{ role: 'user', content: 'start' }],
    toolRegistry,
    initialActiveTools: [toolName],
    budget: { maxTurns: 1, maxToolCalls: 1 },
    callModel: () => ({
      toolCalls: [{ callId: 'c1', toolName, args: {} }],
      done: true,
      ...(usage ? { usage } : {})
    }),
    ...(runtimeOptions.contextPressure ? { contextPressure: runtimeOptions.contextPressure } : {}),
    ...(onEvent ? { onEvent } : {})
  })
}

describe('agentRuntime · 工具结果中央钳制（架构审查批B）', () => {
  it('超长结果按默认阈值截断，并追加中文截断提示（含原文长度）', async () => {
    const longText = 'A'.repeat(DEFAULT_TOOL_RESULT_CLAMP_CHARS + 1000)
    const registry = new ToolRegistry([
      { name: 'longResult', brief: '返回超长文本', execute: () => ({ content: longText }) }
    ])
    const { messages } = await runOnce(registry, 'longResult')
    const clamped = readToolResultChatContent(messages)
    expect(clamped.length).toBeLessThan(longText.length)
    expect(clamped.startsWith('A'.repeat(100))).toBe(true)
    expect(clamped).toContain('⚠️ 结果过长已在此截断')
    expect(clamped).toContain(`原文 ${longText.length} 字`)
    expect(clamped).toContain('searchDirectorMemory')
  })

  it('resultClampChars: null 时不截断，回灌全文', async () => {
    const longText = 'B'.repeat(DEFAULT_TOOL_RESULT_CLAMP_CHARS + 1000)
    const registry = new ToolRegistry([
      { name: 'unclampedResult', brief: '返回超长文本但声明不钳制', resultClampChars: null, execute: () => ({ content: longText }) }
    ])
    const { messages } = await runOnce(registry, 'unclampedResult')
    const content = readToolResultChatContent(messages)
    expect(content).toBe(longText)
    expect(content).not.toContain('已在此截断')
  })

  it('resultClampChars 自定义阈值：按该工具声明的更小阈值截断', async () => {
    const text = 'C'.repeat(200)
    const registry = new ToolRegistry([
      { name: 'customClampResult', brief: '自定义钳制阈值', resultClampChars: 50, execute: () => ({ content: text }) }
    ])
    const { messages } = await runOnce(registry, 'customClampResult')
    const clamped = readToolResultChatContent(messages)
    expect(clamped.startsWith('C'.repeat(50))).toBe(true)
    expect(clamped).toContain(`原文 ${text.length} 字`)
  })

  it('结果未超过阈值时原样返回，不追加提示', async () => {
    const shortText = 'short result'
    const registry = new ToolRegistry([
      { name: 'shortResult', brief: '短结果', execute: () => ({ content: shortText }) }
    ])
    const { messages } = await runOnce(registry, 'shortResult')
    expect(readToolResultChatContent(messages)).toBe(shortText)
  })

  it('保真事件（onEvent tool-result）拿到钳制前的完整原文，不受回灌 messages 截断影响', async () => {
    const longText = 'D'.repeat(DEFAULT_TOOL_RESULT_CLAMP_CHARS + 500)
    const registry = new ToolRegistry([
      { name: 'longResultForEvent', brief: '返回超长文本', execute: () => ({ content: longText }) }
    ])
    const events = []
    const { messages } = await runOnce(registry, 'longResultForEvent', (event) => events.push(event))
    // messages 侧确实被钳过
    expect(readToolResultChatContent(messages).length).toBeLessThan(longText.length)
    // onEvent 侧保真：tool-result 事件的 toolResult.content 是钳制前的完整原文
    const toolResultEvent = events.find((event) => event.kind === 'tool-result')
    expect(toolResultEvent).toBeTruthy()
    expect(toolResultEvent.toolResult.content).toBe(longText)
    expect(toolResultEvent.toolResult.content.length).toBe(longText.length)
  })

  it('只有显式配置且达到上下文压力时，超长表层改为 head+marker+tail；history/onEvent 仍保真', async () => {
    const longText = `${'H'.repeat(4200)}${'M'.repeat(5000)}${'T'.repeat(1200)}`
    // 10,400 字低于旧的 12,000 默认 clamp：若没有压力策略，本来会全文回灌。
    expect(longText.length).toBeLessThan(DEFAULT_TOOL_RESULT_CLAMP_CHARS)
    const registry = new ToolRegistry([{
      name: 'pressureResult',
      brief: '压力下折叠中间段',
      execute: () => ({ content: longText })
    }])
    const events = []
    const { messages, transcript } = await runOnce(
      registry,
      'pressureResult',
      (event) => events.push(event),
      {
        usage: { promptTokens: 900, cacheReadTokens: 700 },
        contextPressure: { contextWindowTokens: 1000, thresholdRatio: 0.8 }
      }
    )
    const surfaced = readToolResultChatContent(messages)

    expect(surfaced).toContain('工具结果因上下文压力折叠')
    expect(surfaced.startsWith('H'.repeat(100))).toBe(true)
    expect(surfaced.endsWith('T'.repeat(100))).toBe(true)
    expect(surfaced).not.toContain('M'.repeat(2000))
    expect(events.find((event) => event.kind === 'tool-result').toolResult.content).toBe(longText)
    expect(transcript.history.find((item) => item.kind === 'toolResult').content).toBe(longText)
  })

  it('显式压力策略但未到阈值时保持旧行为；resultClampChars:null 仍拥有最高兼容优先级', async () => {
    const text = `${'A'.repeat(4200)}${'B'.repeat(4200)}${'Z'.repeat(1000)}`
    const lowPressureRegistry = new ToolRegistry([{
      name: 'lowPressure', brief: '压力未达线', execute: () => ({ content: text })
    }])
    const low = await runOnce(lowPressureRegistry, 'lowPressure', null, {
      usage: { promptTokens: 100 },
      contextPressure: { contextWindowTokens: 100000, thresholdRatio: 0.8 }
    })
    expect(readToolResultChatContent(low.messages)).toBe(text)

    const noClampRegistry = new ToolRegistry([{
      name: 'noClampUnderPressure',
      brief: '压力下仍显式不裁剪',
      resultClampChars: null,
      execute: () => ({ content: text })
    }])
    const noClamp = await runOnce(noClampRegistry, 'noClampUnderPressure', null, {
      usage: { promptTokens: 900 },
      contextPressure: { contextWindowTokens: 1000, thresholdRatio: 0.8 }
    })
    expect(readToolResultChatContent(noClamp.messages)).toBe(text)
  })
})
