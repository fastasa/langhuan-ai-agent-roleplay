import { describe, expect, it } from 'vitest'
import { createRequestEnvelopeDiagnosticTracker } from '../../../src/app/agentRuntime/requestEnvelopeDiagnostics.ts'

function requestEnvelope(overrides = {}) {
  return {
    model: { presetName: '编排模型', model: 'gpt-test', modelUsageSlotId: 'smart' },
    tools: [{
      type: 'function',
      function: {
        name: 'readScenarioSkill',
        description: '读取情境',
        parameters: { type: 'object', properties: { code: { type: 'string' } } }
      }
    }],
    toolChoice: 'auto',
    thinking: 'disabled',
    messages: [
      { role: 'system', content: '稳定系统协议' },
      { role: 'user', content: '继续。' }
    ],
    activeToolNames: ['readScenarioSkill'],
    ...overrides
  }
}

describe('requestEnvelopeDiagnostics', () => {
  it('首轮标 cold_start，同一规范化信封后续标 none 且指纹保持稳定', () => {
    const tracker = createRequestEnvelopeDiagnosticTracker()
    const first = tracker.capture(requestEnvelope())
    const second = tracker.capture(requestEnvelope({
      model: { modelUsageSlotId: 'smart', model: 'gpt-test', presetName: '编排模型' },
      tools: [{
        function: {
          parameters: { properties: { code: { type: 'string' } }, type: 'object' },
          description: '读取情境',
          name: 'readScenarioSkill'
        },
        type: 'function'
      }]
    }))

    expect(first.firstDiffSource).toBe('cold_start')
    expect(second.firstDiffSource).toBe('none')
    expect(second).toMatchObject({
      activeToolNamesHash: first.activeToolNamesHash,
      toolSchemaHash: first.toolSchemaHash,
      systemHash: first.systemHash,
      messagePrefixHash: first.messagePrefixHash,
      requestEnvelopeHash: first.requestEnvelopeHash
    })
    for (const hash of [
      first.activeToolNamesHash,
      first.toolSchemaHash,
      first.systemHash,
      first.messagePrefixHash,
      first.requestEnvelopeHash
    ]) {
      expect(hash).toMatch(/^fnv1a32:[0-9a-f]{8}$/)
    }
  })

  it('工具名变化优先归因 tools，schema 单独变化归因 tool_schema', () => {
    const namesTracker = createRequestEnvelopeDiagnosticTracker()
    namesTracker.capture(requestEnvelope())
    const namesChanged = namesTracker.capture(requestEnvelope({
      activeToolNames: ['readScenarioSkill', 'readStatus']
    }))
    expect(namesChanged.firstDiffSource).toBe('tools')

    const schemaTracker = createRequestEnvelopeDiagnosticTracker()
    schemaTracker.capture(requestEnvelope())
    const schemaChanged = schemaTracker.capture(requestEnvelope({
      tools: [{
        type: 'function',
        function: {
          name: 'readScenarioSkill',
          description: '读取情境和状态',
          parameters: { type: 'object', properties: { code: { type: 'string' } } }
        }
      }]
    }))
    expect(schemaChanged.firstDiffSource).toBe('tool_schema')
  })

  it('系统段变化归因 system，普通历史变化归因 messages', () => {
    const systemTracker = createRequestEnvelopeDiagnosticTracker()
    systemTracker.capture(requestEnvelope())
    const systemChanged = systemTracker.capture(requestEnvelope({
      messages: [
        { role: 'system', content: '发生变化的系统协议' },
        { role: 'user', content: '继续。' }
      ]
    }))
    expect(systemChanged.firstDiffSource).toBe('system')

    const messagesTracker = createRequestEnvelopeDiagnosticTracker()
    messagesTracker.capture(requestEnvelope())
    const messagesChanged = messagesTracker.capture(requestEnvelope({
      messages: [
        { role: 'system', content: '稳定系统协议' },
        { role: 'user', content: '换一个问题。' }
      ]
    }))
    expect(messagesChanged.firstDiffSource).toBe('messages')
  })

  it('本地 envelope hash 会随请求内容变化，但不把它解释成供应商 cache hit', () => {
    const tracker = createRequestEnvelopeDiagnosticTracker()
    const first = tracker.capture(requestEnvelope())
    const second = tracker.capture(requestEnvelope({
      messages: [
        { role: 'system', content: '稳定系统协议' },
        { role: 'user', content: '另一条消息。' }
      ]
    }))

    expect(second.requestEnvelopeHash).not.toBe(first.requestEnvelopeHash)
    expect(second).not.toHaveProperty('cacheHit')
  })
})
