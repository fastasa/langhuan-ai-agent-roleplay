import { describe, expect, it } from 'vitest'
import { runAgentRuntime as runAgentRuntimeBase } from '../../../src/app/agentRuntime/runtime.ts'
import { ToolRegistry } from '../../../src/app/agentRuntime/toolRegistry.ts'
import { buildSemanticCompactionRecord } from '../../../src/app/agentRuntime/semanticCompaction.ts'
import { recoverAgentRuntimeJournal } from '../../../src/app/agentRuntime/runtimeJournal.ts'

const runAgentRuntime = (input) => runAgentRuntimeBase({ ...input, taskTodoMode: 'disabled' })

describe('agentRuntime · semantic compaction record', () => {
  it('保留目标、关键结论、未决工具和尾部锚点，但不改写输入 history', () => {
    const history = [
      { kind: 'chat', role: 'user', content: '完成地图修复' },
      { kind: 'modelMessage', role: 'assistant', content: '已确认河流坐标。' },
      {
        kind: 'toolCall', callId: 'write-1', toolName: 'writeMap', stage: 'write', args: { x: 1 },
        expectation: '写入地图', requestedAtTurn: 1
      }
    ]
    const before = structuredClone(history)
    const record = buildSemanticCompactionRecord({
      runId: 'compact-1', history,
      pressure: {
        projectedTokens: 900, pressureTokens: 950, pressureRatio: 0.95,
        contextWindowTokens: 1000, thresholdTokens: 800, source: 'provider-anchor'
      },
      sideEffectToolNames: new Set(['writeMap']),
      now: '2026-08-18T10:00:00.000Z'
    })

    expect(record.goal).toBe('完成地图修复')
    expect(record.keyConclusions).toEqual(['已确认河流坐标。'])
    expect(record.unresolvedTools).toEqual([expect.objectContaining({
      callId: 'write-1', toolName: 'writeMap', outcomeUnknown: true, autoReplayAllowed: false
    })])
    expect(record.recentTailAnchor).toMatchObject({ startIndex: 0, endIndex: 2, itemCount: 3 })
    expect(record.fullHistoryRetained).toBe(true)
    expect(record.injectedIntoPrompt).toBe(false)
    expect(history).toEqual(before)
  })

  it('达到压力线时 runtime 只产出结构化记录和 journal 事件，不把摘要注入模型 messages/history', async () => {
    const requests = []
    const journal = []
    const fidelity = []
    const initialMessages = [
      { role: 'system', content: 'existing system prompt' },
      { role: 'user', content: '请完成既定目标' }
    ]
    const result = await runAgentRuntime({
      agentName: 'CompactionAgent',
      messages: initialMessages,
      toolRegistry: new ToolRegistry(),
      initialActiveTools: [],
      budget: { maxTurns: 1, maxToolCalls: 0 },
      contextPressure: {
        contextWindowTokens: 1,
        toolResultPruning: { enabled: false },
        semanticCompaction: {
          goal: '既定目标',
          keyConclusions: ['事实 A 已确认'],
          recentTailItems: 4
        }
      },
      journal: {
        runId: 'compact-runtime',
        adapter: { append: (event) => { journal.push(event) } },
        now: () => '2026-08-18T10:00:00.000Z'
      },
      onEvent: (event) => fidelity.push(event),
      callModel: (request) => {
        requests.push(request)
        return { content: '最终答复', toolCalls: [], done: true }
      }
    })

    expect(result.semanticCompactions).toHaveLength(1)
    expect(result.semanticCompactions[0]).toMatchObject({
      goal: '既定目标', keyConclusions: ['事实 A 已确认'],
      fullHistoryRetained: true, injectedIntoPrompt: false
    })
    expect(fidelity.some((event) => event.kind === 'semantic-compaction')).toBe(true)
    expect(journal.some((event) => event.kind === 'semantic_compaction.created')).toBe(true)
    expect(recoverAgentRuntimeJournal(journal, 'compact-runtime').semanticCompactions).toHaveLength(1)
    expect(requests[0].messages).toEqual(initialMessages)
    expect(result.transcript.history.some((item) => item.kind === 'chat' && item.content.includes('semantic-compaction'))).toBe(false)
    expect(result.messages.some((message) => message.content.includes('事实 A 已确认'))).toBe(false)
  })
})
