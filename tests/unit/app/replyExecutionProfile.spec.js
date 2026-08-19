import { describe, expect, it } from 'vitest'
import {
  buildReplyExecutionAudit,
  REPLY_EXECUTION_PROFILE_SCHEMA_VERSION,
  resolveReplyBackendComposition,
  resolveReplyExecutionProfile
} from '../../../src/app/replyExecutionProfile.ts'

describe('replyExecutionProfile', () => {
  it.each([
    {
      route: 'reuse', hasPersonalityModel: true, purePrompt: false,
      expected: {
        orchestrationDepth: 'reuse', replyBackend: 'personality', planningPolicy: 'direct_personality_rerank',
        contextPolicy: 'projection_tail', postRoundPolicy: 'projection_only'
      }
    },
    {
      route: 'reuse', hasPersonalityModel: false, purePrompt: false,
      expected: {
        orchestrationDepth: 'reuse', replyBackend: 'normal_recall', planningPolicy: 'direct',
        contextPolicy: 'projection_tail', postRoundPolicy: 'projection_only'
      }
    },
    {
      route: 'orchestrate', hasPersonalityModel: true, purePrompt: false,
      expected: {
        orchestrationDepth: 'full', replyBackend: 'personality', planningPolicy: 'candidate_rerank',
        contextPolicy: 'recall_on_demand', postRoundPolicy: 'orchestration_managed'
      }
    },
    {
      route: 'orchestrate', hasPersonalityModel: false, purePrompt: false,
      expected: {
        orchestrationDepth: 'full', replyBackend: 'normal_recall', planningPolicy: 'single_plan',
        contextPolicy: 'recall_on_demand', postRoundPolicy: 'orchestration_managed'
      }
    }
  ])('按 route 与人格模型拆出正交执行维度：$route / personality=$hasPersonalityModel', ({ route, hasPersonalityModel, purePrompt, expected }) => {
    expect(resolveReplyExecutionProfile({ route, hasPersonalityModel, purePrompt })).toMatchObject(expected)
  })

  it('purePrompt 如实记录完全绕过 ReplyWorkflow', () => {
    const pure = resolveReplyExecutionProfile({
      route: 'orchestrate',
      hasPersonalityModel: true,
      purePrompt: true
    })
    expect(pure).toMatchObject({
      orchestrationDepth: 'bypass',
      replyBackend: 'pure_prompt',
      planningPolicy: 'none',
      contextPolicy: 'role_projection_tail',
      postRoundPolicy: 'none'
    })
  })

  it('focused action 如实记录独立动作管线和专用轮后统筹', () => {
    expect(resolveReplyExecutionProfile({
      route: 'orchestrate',
      hasPersonalityModel: true,
      purePrompt: false,
      focusedAction: true
    })).toMatchObject({
      orchestrationDepth: 'bypass',
      replyBackend: 'focused_action',
      planningPolicy: 'focused_action_plan',
      contextPolicy: 'action_context',
      postRoundPolicy: 'orchestration_managed'
    })
  })

  it('混合群聊使用轮级 mixed/per_speaker，避免把首位角色后端冒充整轮后端', () => {
    expect(resolveReplyExecutionProfile({
      route: 'reuse',
      hasPersonalityModel: true,
      mixedBackends: true,
      purePrompt: false
    })).toMatchObject({
      orchestrationDepth: 'reuse',
      replyBackend: 'mixed',
      planningPolicy: 'per_speaker'
    })
  })

  it('只按本轮实际发言者计算后端构成，而不是按会话全部候选误报 mixed', () => {
    expect(resolveReplyBackendComposition([true])).toEqual({
      hasPersonalityModel: true,
      mixedBackends: false
    })
    expect(resolveReplyBackendComposition([false])).toEqual({
      hasPersonalityModel: false,
      mixedBackends: false
    })
    expect(resolveReplyBackendComposition([true, false])).toEqual({
      hasPersonalityModel: true,
      mixedBackends: true
    })
    expect(resolveReplyBackendComposition([])).toEqual({
      hasPersonalityModel: false,
      mixedBackends: false
    })
  })

  it('把混合轮级画像收束成逐 speaker 实际回执并保留路由证据', () => {
    const roundProfile = resolveReplyExecutionProfile({
      route: 'reuse',
      hasPersonalityModel: true,
      mixedBackends: true,
      purePrompt: false
    })
    const routeDecision = {
      route: 'reuse',
      reason: '同一情境下的自然续话',
      confidence: 0.92,
      reusedScenario: { code: 'daily_chat' },
      dependencyComparison: {
        status: 'unchanged', reason: '依赖未变化', comparedKeys: ['curtain'],
        changedKeys: [], unknownKeys: []
      }
    }
    const audit = buildReplyExecutionAudit({
      roundProfile,
      routeDecision,
      defaultRoute: 'orchestrate',
      actualHasPersonalityModel: false,
      purePrompt: false
    })

    expect(audit.replyExecutionProfile).toMatchObject({
      replyBackend: 'normal_recall',
      planningPolicy: 'direct'
    })
    expect(audit.roundReplyExecutionProfile).toBe(roundProfile)
    expect(audit.replyOrchestrationDecision).toBe(routeDecision)
    expect(Object.isFrozen(audit)).toBe(true)
  })

  it('稳定输出 schemaVersion、basis 与固定顺序 audit label', () => {
    const profile = resolveReplyExecutionProfile({
      route: 'orchestrate',
      hasPersonalityModel: true,
      purePrompt: false
    })
    expect(profile.schemaVersion).toBe(REPLY_EXECUTION_PROFILE_SCHEMA_VERSION)
    expect(profile.basis).toEqual({
      route: 'orchestrate',
      hasPersonalityModel: true,
      mixedBackends: false,
      purePrompt: false,
      focusedAction: false
    })
    expect(profile.auditLabel).toBe(
      'reply-execution-profile/v2;depth=full;backend=personality;planning=candidate_rerank;context=recall_on_demand;post=orchestration_managed;pure=0;focused=0'
    )
    expect(resolveReplyExecutionProfile({
      route: 'orchestrate',
      hasPersonalityModel: true,
      purePrompt: false
    })).toEqual(profile)
  })

  it('normal_recall 只是内部后端标识，不产生用户可见模式提示', () => {
    const profile = resolveReplyExecutionProfile({
      route: 'reuse',
      hasPersonalityModel: false,
      purePrompt: false
    })
    expect(profile.replyBackend).toBe('normal_recall')
    expect(JSON.stringify(profile)).not.toContain('普通召回')
    expect(profile).not.toHaveProperty('userMessage')
    expect(profile).not.toHaveProperty('notice')
  })

  it('返回冻结结果，避免审计画像在下游被静默改写', () => {
    const profile = resolveReplyExecutionProfile({
      route: 'reuse',
      hasPersonalityModel: true,
      purePrompt: false
    })
    expect(Object.isFrozen(profile)).toBe(true)
    expect(Object.isFrozen(profile.basis)).toBe(true)
  })
})
