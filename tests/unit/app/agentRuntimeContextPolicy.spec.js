import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  AGENT_RUNTIME_CONTEXT_POLICY_DEFAULTS,
  buildAgentRuntimeContextPolicy
} from '../../../src/app/agentRuntimeContextPolicy.ts'

const FORMAL_HARNESS_FILES = [
  'agentHarnessShared.ts',
  'groupDirectorHarness.ts',
  'personalityNarrationSubagent.ts',
  'replyPlanOrchestratorHarness.ts',
  'subagentLoop.ts',
  'tidiaoCorrectionLoop.ts',
  'xingyiAgentHarness.ts'
]

function readAppSource(fileName) {
  return readFileSync(resolve(process.cwd(), 'src/app', fileName), 'utf8')
}

describe('agentRuntimeContextPolicy', () => {
  it('为正式 Agent 提供保守、确定且不改写 Prompt 的默认策略', () => {
    const input = {
      scope: 'test.profile',
      messages: [
        { role: 'system', content: '既有系统提示正文' },
        { role: 'user', content: '已有任务目标' }
      ]
    }
    const first = buildAgentRuntimeContextPolicy(input)
    const second = buildAgentRuntimeContextPolicy(input)

    expect(first).toEqual(second)
    expect(first).toMatchObject({
      contextWindowTokens: 32_768,
      thresholdRatio: 0.78,
      reserveTokens: 4_096,
      toolResultPruning: {
        enabled: true,
        thresholdChars: 8_192,
        headChars: 4_096,
        tailChars: 1_024
      },
      semanticCompaction: {
        enabled: true,
        goal: '已有任务目标',
        recentTailItems: 12
      }
    })
    expect(first.semanticCompaction?.runId).toMatch(/^test\.profile:[0-9a-f]{8}$/)
    expect(JSON.stringify(first)).not.toContain('既有系统提示正文')
    expect(AGENT_RUNTIME_CONTEXT_POLICY_DEFAULTS.contextWindowTokens).toBe(32_768)
  })

  it('接受正式运行 id、已有目标与容量 override，同时校正越界配置', () => {
    const policy = buildAgentRuntimeContextPolicy({
      scope: 'test.profile',
      runId: 'formal-run-1',
      goal: '调用方已有目标',
      override: {
        contextWindowTokens: 65_536,
        thresholdRatio: 0.75,
        reserveTokens: 80_000,
        toolResultPruning: { enabled: false },
        semanticCompaction: { recentTailItems: 20 }
      }
    })

    expect(policy.contextWindowTokens).toBe(65_536)
    expect(policy.thresholdRatio).toBe(0.75)
    expect(policy.reserveTokens).toBe(65_536)
    expect(policy.toolResultPruning?.enabled).toBe(false)
    expect(policy.semanticCompaction).toMatchObject({
      enabled: true,
      runId: 'formal-run-1',
      goal: '调用方已有目标',
      recentTailItems: 20
    })
  })

  it('七个正式调用层都显式接入统一上下文压力策略', () => {
    for (const fileName of FORMAL_HARNESS_FILES) {
      const source = readAppSource(fileName)
      expect(source, fileName).toContain("from './agentRuntimeContextPolicy'")
      expect(source, fileName).toContain('contextPressure: buildAgentRuntimeContextPolicy({')
    }
  })

  it('固定两轮的 submit 宽限环继续测压，但不重复创建语义 checkpoint', () => {
    const source = readAppSource('subagentLoop.ts')
    expect(source.match(/runAgentRuntime\(\{/g)).toHaveLength(2)
    expect(source.match(/contextPressure: buildAgentRuntimeContextPolicy\(\{/g)).toHaveLength(2)
    expect(source).toContain('runId: graceJournalPreparation.runId')
    expect(source).toContain('override: { semanticCompaction: { enabled: false } }')
    expect(source).toContain('不再重复建立语义 checkpoint')
  })

  it('服务端日记 mini agent 保持短任务兼容，不为一次性结果额外建立 checkpoint', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'server/services/xingyiDiaryService.ts'),
      'utf8'
    )
    expect(source).toContain('mini agent')
    expect(source).toContain('maxTurns: 6')
    expect(source).toContain('maxToolCalls: 12')
    expect(source).not.toContain('buildAgentRuntimeContextPolicy')
  })
})
