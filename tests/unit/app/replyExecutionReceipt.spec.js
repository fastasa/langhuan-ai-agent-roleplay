import { describe, expect, it } from 'vitest'
import {
  buildReplyExecutionReceipt,
  REPLY_EXECUTION_RECEIPT_SCHEMA_VERSION
} from '../../../src/app/replyExecutionReceipt.ts'
import { resolveReplyExecutionProfile } from '../../../src/app/replyExecutionProfile.ts'

function createRouteDecision() {
  return {
    route: 'reuse',
    reason: '同一情境下自然续接',
    confidence: 0.93,
    reusedScenario: {
      code: 'daily_chat',
      anchor: { messageId: '100' },
      dependencySnapshot: {
        fingerprint: 'fp-1',
        values: { curtain: 3, presence: 'v2' }
      }
    },
    dependencyComparison: {
      status: 'unchanged',
      reason: '依赖未变化',
      comparedKeys: ['curtain', 'presence'],
      changedKeys: [],
      unknownKeys: []
    }
  }
}

describe('replyExecutionReceipt', () => {
  it('构造稳定、无 failure 字段的成功回执', () => {
    const receipt = buildReplyExecutionReceipt({
      state: 'completed',
      defaultRoute: 'orchestrate',
      actualHasPersonalityModel: false,
      purePrompt: false,
      messageId: 42,
      promptLogId: '  prompt-1  ',
      completedStages: ['projection', 'compose']
    })

    expect(receipt).toMatchObject({
      schemaVersion: REPLY_EXECUTION_RECEIPT_SCHEMA_VERSION,
      state: 'completed',
      messageId: 42,
      promptLogId: 'prompt-1',
      completedStages: ['projection', 'compose'],
      replyExecutionAudit: {
        replyExecutionProfile: {
          orchestrationDepth: 'full',
          replyBackend: 'normal_recall',
          planningPolicy: 'single_plan'
        }
      }
    })
    expect(receipt).not.toHaveProperty('failure')
  })

  it('失败回执保留逐 speaker 实际后端、轮级 mixed 画像和路由证据', () => {
    const roundProfile = resolveReplyExecutionProfile({
      route: 'reuse',
      hasPersonalityModel: true,
      mixedBackends: true,
      purePrompt: false
    })
    const routeDecision = createRouteDecision()
    const receipt = buildReplyExecutionReceipt({
      state: 'failed',
      roundProfile,
      routeDecision,
      defaultRoute: 'orchestrate',
      actualHasPersonalityModel: true,
      purePrompt: false,
      messageId: 77,
      promptLogId: 'prompt-2',
      failureStage: 'final_reply_generation',
      error: new Error('模型连接中断'),
      completedStages: ['projection', 'plan', 'review']
    })

    expect(receipt).toMatchObject({
      state: 'failed',
      failure: { stage: 'final_reply_generation', message: '模型连接中断' },
      replyExecutionAudit: {
        replyExecutionProfile: {
          replyBackend: 'personality',
          planningPolicy: 'direct_personality_rerank'
        },
        roundReplyExecutionProfile: {
          replyBackend: 'mixed',
          planningPolicy: 'per_speaker'
        },
        replyOrchestrationDecision: {
          route: 'reuse',
          dependencyComparison: { status: 'unchanged' }
        }
      }
    })
  })

  it('复制并冻结可变输入，外部修改不会污染回执', () => {
    const completedStages = ['projection']
    const routeDecision = createRouteDecision()
    const receipt = buildReplyExecutionReceipt({
      state: 'failed',
      defaultRoute: 'reuse',
      actualHasPersonalityModel: false,
      purePrompt: false,
      routeDecision,
      completedStages,
      failureStage: '',
      error: null
    })

    completedStages.push('compose')
    routeDecision.reason = '已被外部修改'
    routeDecision.dependencyComparison.comparedKeys.push('promptPreset')

    expect(receipt.completedStages).toEqual(['projection'])
    expect(receipt.replyExecutionAudit.replyOrchestrationDecision.reason).toBe('同一情境下自然续接')
    expect(receipt.replyExecutionAudit.replyOrchestrationDecision.dependencyComparison.comparedKeys).toEqual(['curtain', 'presence'])
    expect(receipt.failure).toEqual({ stage: 'unknown', message: 'Unknown failure' })
    expect(Object.isFrozen(receipt)).toBe(true)
    expect(Object.isFrozen(receipt.completedStages)).toBe(true)
    expect(Object.isFrozen(receipt.failure)).toBe(true)
    expect(Object.isFrozen(receipt.replyExecutionAudit)).toBe(true)
    expect(Object.isFrozen(receipt.replyExecutionAudit.replyOrchestrationDecision)).toBe(true)
    expect(Object.isFrozen(receipt.replyExecutionAudit.replyOrchestrationDecision.dependencyComparison.comparedKeys)).toBe(true)
  })

  it('纯提示与聚焦动作仍由相同回执协议表达，并规范化无效消息 id', () => {
    const pure = buildReplyExecutionReceipt({
      state: 'completed',
      defaultRoute: 'orchestrate',
      actualHasPersonalityModel: true,
      purePrompt: true,
      messageId: -1
    })
    const focused = buildReplyExecutionReceipt({
      state: 'failed',
      defaultRoute: 'orchestrate',
      actualHasPersonalityModel: true,
      purePrompt: false,
      focusedAction: true,
      messageId: Number.NaN,
      failureStage: 'focused_action_plan',
      error: { code: 'PLAN_FAILED' }
    })

    expect(pure.messageId).toBe(0)
    expect(pure.replyExecutionAudit.replyExecutionProfile).toMatchObject({
      replyBackend: 'pure_prompt',
      contextPolicy: 'role_projection_tail'
    })
    expect(focused.messageId).toBe(0)
    expect(focused.replyExecutionAudit.replyExecutionProfile).toMatchObject({
      replyBackend: 'focused_action',
      planningPolicy: 'focused_action_plan'
    })
    expect(focused.failure.message).toBe('{"code":"PLAN_FAILED"}')
  })
})
