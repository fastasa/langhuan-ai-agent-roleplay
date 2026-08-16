import { describe, expect, it } from 'vitest'
import {
  NARRATIVE_SCRIPTWRITER_SUBMIT_TOOL_NAME,
  runNarrativeScriptwriterAnalysis
} from '../../../src/app/narrativeScriptwriterSubagent.ts'

describe('NarrativeScriptwriterAgent', () => {
  it('只交三栏分析，不预写 nextBeat；结构化交稿即收束', async () => {
    let firstMessages = null
    const result = await runNarrativeScriptwriterAnalysis({
      brief: '用户已经进入钟楼',
      contextBlock: '【world.narrative_seeds】\nseed_clock｜钟楼午夜关闭｜候选判断'
    }, {
      sessionId: 'session_a', sourceCallId: 'call_a', tools: [],
      callModel: async ({ messages }) => {
        firstMessages = messages
        return {
          content: '交稿',
          toolCalls: [{
            id: 'submit_1', type: 'function', function: {
              name: NARRATIVE_SCRIPTWRITER_SUBMIT_TOOL_NAME,
              arguments: JSON.stringify({
                confirmedFacts: [{ fact: '用户已经进入钟楼', evidence: 'brief' }],
                candidateJudgments: [{ judgment: '午夜机关可能接近触发', seedIds: ['seed_clock'] }],
                suggestedActions: [{ action: '先读取 seed_clock 详情核对时间条件' }]
              })
            }
          }]
        }
      }
    })
    expect(result.ok).toBe(true)
    expect(result.report.confirmedFacts[0].fact).toBe('用户已经进入钟楼')
    const system = firstMessages.find((message) => message.role === 'system').content
    expect(system).toContain('不是预写用户下一步')
    expect(system).toContain('不是重写 arc/threads/nextBeat')
    expect(firstMessages.find((message) => message.role === 'user').content).toContain('【统一原始可见上下文】')
  })

  it('统一原始可见上下文为空时按 manifest abort 边界拒绝启动', async () => {
    let modelCalls = 0
    const result = await runNarrativeScriptwriterAnalysis({ brief: '测试', contextBlock: '' }, {
      sessionId: 'session_a', sourceCallId: 'call_empty', tools: [],
      callModel: async () => {
        modelCalls += 1
        return { content: '', toolCalls: [] }
      }
    })
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining('上下文为空') })
    expect(modelCalls).toBe(0)
  })
})
