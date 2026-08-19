import { describe, expect, it } from 'vitest'
import {
  AGENT_RUNTIME_ERROR_TYPES,
  AGENT_RUNTIME_LIFECYCLES,
  REPLY_PLAN_AGENT_STAGES
} from '../../../src/app/agentRuntime/types.ts'
import {
  REPLY_PLAN_AGENT_BATCH0_SCHEDULER_FIXTURE,
  REPLY_PLAN_AGENT_BATCH0_TRANSCRIPT_FIXTURE
} from '../../../src/app/replyPlanAgent/batch0TranscriptFixture.ts'

describe('agent runtime 批次 0 协议 fixture', () => {
  it('冻结生命周期、错误类型与回复计划阶段枚举', () => {
    expect(AGENT_RUNTIME_LIFECYCLES).toEqual([
      'beforeModelCall',
      'afterModelMessage',
      'beforeToolCall',
      'afterToolResult',
      'beforeNextTurn',
      'afterTurn',
      'onError',
      'onTerminate'
    ])
    expect(AGENT_RUNTIME_ERROR_TYPES).toEqual([
      'INVALID_ARGUMENT',
      'TOOL_NOT_FOUND',
      'TOOL_TIMEOUT',
      'TOOL_RUNTIME_ERROR',
      'EXPECTATION_MISMATCH',
      'BUDGET_EXCEEDED',
      'MODEL_OUTPUT_INVALID',
      'ABORTED',
      'HOOK_RUNTIME_ERROR'
    ])
    expect(REPLY_PLAN_AGENT_STAGES).toContain('scenario-routing')
    expect(REPLY_PLAN_AGENT_STAGES).toContain('plan-review')
    expect(REPLY_PLAN_AGENT_STAGES).not.toContain('plan-synthesis') // 批次4 去融合
    expect(REPLY_PLAN_AGENT_STAGES).toContain('final-reply-prep')
  })

  it('用结构化 transcript 表达 read -> generate -> review 全链路（批次4 去融合，评审为终点）', () => {
    const transcript = REPLY_PLAN_AGENT_BATCH0_TRANSCRIPT_FIXTURE
    const allCalls = transcript.turns.flatMap((turn) => turn.toolCalls)
    const allResults = transcript.turns.flatMap((turn) => turn.toolResults)
    const resultIds = new Set(allResults.map((result) => result.callId))

    expect(transcript.kind).toBe('agentTranscript')
    expect(allCalls.map((call) => call.toolName)).toEqual([
      'readScenarioSkill',
      'generatePlanBatch',
      'reviewPlanCandidates'
    ])
    for (const call of allCalls) {
      expect(call.callId).toBeTruthy()
      expect(call.expectation).toBeTruthy()
      expect(resultIds.has(call.callId)).toBe(true)
    }
    for (const result of allResults) {
      const call = allCalls.find((item) => item.callId === result.callId)
      expect(result.toolName).toBe(call.toolName)
      expect(result.stage).toBe(call.stage)
      expect(result.content).toBeTruthy()
      expect(result.details).toBeTruthy()
    }
  })

  it('activeTools 同时约束下一轮提示与实际工具 schema 暴露', () => {
    const transcript = REPLY_PLAN_AGENT_BATCH0_TRANSCRIPT_FIXTURE
    expect(transcript.initialActiveTools).toEqual(['readScenarioSkill'])

    const transitions = transcript.turns.map((turn) => ({
      current: turn.activeTools,
      next: turn.nextTurnPatches[0]?.activeTools ?? []
    }))
    expect(transitions).toEqual([
      { current: ['readScenarioSkill'], next: ['generatePlanBatch'] },
      { current: ['generatePlanBatch'], next: ['reviewPlanCandidates'] },
      { current: ['reviewPlanCandidates'], next: [] }
    ])
  })

  it('把 ReplyTaskScheduler 明确放在 AgentRuntime 外层', () => {
    const scheduler = REPLY_PLAN_AGENT_BATCH0_SCHEDULER_FIXTURE
    expect(scheduler.boundary).toBe('outside-agent-runtime')
    expect(scheduler.tasks.map((task) => task.source)).toEqual([
      'new-user-message',
      'role-message-retry'
    ])
    expect(scheduler.note).toContain('单个 ReplyTask 内部才进入 AgentRuntime')
  })
})
