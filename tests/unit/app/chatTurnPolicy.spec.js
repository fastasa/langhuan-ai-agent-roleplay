import { describe, expect, it } from 'vitest'
import {
  getReplyModePolicy,
  isReplyFeatureEnabled,
  listJudgePoliciesForMode,
  normalizeChatTurnReplyMode
} from '../../../src/app/chatTurnPolicy.ts'

describe('chatTurnPolicy', () => {
  it('normalizes temporary entity narration as an input branch', () => {
    expect(normalizeChatTurnReplyMode('session_temporary_entity_narration')).toBe('session_temporary_entity_narration')
    expect(getReplyModePolicy('session_temporary_entity_narration').enabledFeatures).toEqual([
      'user_message_persist',
      'session_temporary_entity_narration',
      'assistant_reply_persist',
      'prompt_log_binding'
    ])
  })

  it('keeps normal recall using recall plus projection-first context and writeback', () => {
    expect(isReplyFeatureEnabled('normal_recall', 'role_brain_recall')).toBe(true)
    expect(isReplyFeatureEnabled('normal_recall', 'message_projection')).toBe(true)
    expect(isReplyFeatureEnabled('normal_recall', 'projection_context')).toBe(true)
    expect(isReplyFeatureEnabled('normal_recall', 'projection_trajectory_writeback')).toBe(true)
    expect(isReplyFeatureEnabled('normal_recall', 'dynamic_world_due_progression')).toBe(false)
    expect(isReplyFeatureEnabled('normal_recall', 'narrative_seed_background_evolution')).toBe(true)
    expect(isReplyFeatureEnabled('normal_recall', 'auto_write_trace')).toBe(false)
  })

  it('joins normal recall into the shared ReplyWorkflow: orchestration + narration subagent on, old quick judges retired', () => {
    expect(isReplyFeatureEnabled('normal_recall', 'context_compression')).toBe(true)
    expect(isReplyFeatureEnabled('normal_recall', 'reply_plan_orchestration')).toBe(true)
    expect(isReplyFeatureEnabled('normal_recall', 'personality_narration_subagent')).toBe(true)
    // 普通召回单计划：不进多计划候选树、不进 ReRanker 评审。
    expect(isReplyFeatureEnabled('normal_recall', 'personality_candidate_plan_tree')).toBe(false)
    expect(isReplyFeatureEnabled('normal_recall', 'personality_reranker')).toBe(false)
    // 2026-06-10 退场：环境前置、地点门禁/安排、场景扫描、概率旁白、旁白评分调试。
    expect(isReplyFeatureEnabled('normal_recall', 'user_input_environment_prelude')).toBe(false)
    expect(isReplyFeatureEnabled('normal_recall', 'character_location_gate')).toBe(false)
    expect(isReplyFeatureEnabled('normal_recall', 'character_location_arrangement')).toBe(false)
    expect(isReplyFeatureEnabled('normal_recall', 'role_output_environment_narration')).toBe(false)
    expect(isReplyFeatureEnabled('normal_recall', 'virtual_scene_location_scan')).toBe(false)
    expect(isReplyFeatureEnabled('normal_recall', 'probability_narration')).toBe(false)
    expect(isReplyFeatureEnabled('normal_recall', 'narration_score_debug')).toBe(false)
  })

  it('normalizes retired CAPS reply mode values to normal recall policy', () => {
    expect(normalizeChatTurnReplyMode('caps_network')).toBe('normal_recall')
    const policy = getReplyModePolicy('caps_network')

    expect(policy.promptOptions).toMatchObject({
      skipPrepareRecall: false,
      forceEmptyRecall: false,
      suppressCurrentUserInputTemplate: false
    })
    expect(policy.mode).toBe('normal_recall')
    expect(isReplyFeatureEnabled('caps_network', 'character_location_gate')).toBe(false)
    expect(isReplyFeatureEnabled('caps_network', 'character_location_arrangement')).toBe(false)
    expect(isReplyFeatureEnabled('caps_network', 'projection_trajectory_writeback')).toBe(true)
    expect(isReplyFeatureEnabled('caps_network', 'auto_write_trace')).toBe(false)
  })

  it('keeps pure prompt replies away from all context and write effects', () => {
    const policy = getReplyModePolicy('pure_prompt')

    expect(policy.promptOptions).toMatchObject({
      skipPrepareRecall: true,
      forceEmptyRecall: true,
      suppressCurrentUserInputTemplate: true,
      purePrompt: true
    })
    expect(isReplyFeatureEnabled('pure_prompt', 'pure_prompt_reply')).toBe(true)
    expect(isReplyFeatureEnabled('pure_prompt', 'role_brain_recall')).toBe(false)
    expect(isReplyFeatureEnabled('pure_prompt', 'dynamic_world_due_progression')).toBe(false)
    expect(isReplyFeatureEnabled('pure_prompt', 'narrative_seed_background_evolution')).toBe(false)
    expect(isReplyFeatureEnabled('pure_prompt', 'probability_narration')).toBe(false)
    expect(isReplyFeatureEnabled('pure_prompt', 'auto_write_trace')).toBe(false)
  })

  it('registers personality model as projection-first reply mode', () => {
    const policy = getReplyModePolicy('personality_model')

    expect(policy.promptOptions).toMatchObject({
      skipPrepareRecall: false
    })
    expect(isReplyFeatureEnabled('personality_model', 'message_projection')).toBe(true)
    expect(isReplyFeatureEnabled('personality_model', 'projection_context')).toBe(true)
    expect(isReplyFeatureEnabled('personality_model', 'context_compression')).toBe(true)
    expect(isReplyFeatureEnabled('personality_model', 'personality_candidate_plan_tree')).toBe(true)
    expect(isReplyFeatureEnabled('personality_model', 'personality_narration_subagent')).toBe(true)
    expect(isReplyFeatureEnabled('personality_model', 'personality_reranker')).toBe(true)
    expect(isReplyFeatureEnabled('personality_model', 'projection_trajectory_writeback')).toBe(true)
    expect(isReplyFeatureEnabled('personality_model', 'role_brain_recall')).toBe(true)
    expect(isReplyFeatureEnabled('personality_model', 'user_input_environment_prelude')).toBe(false)
    expect(isReplyFeatureEnabled('personality_model', 'virtual_scene_location_scan')).toBe(false)
  })

  it('lists active policies for retired CAPS values as normal recall', () => {
    const normalIds = listJudgePoliciesForMode('normal_recall').map((policy) => policy.id)
    const capsIds = listJudgePoliciesForMode('caps_network').map((policy) => policy.id)
    const personalityIds = listJudgePoliciesForMode('personality_model').map((policy) => policy.id)

    expect(normalIds).toContain('role_brain_recall')
    expect(normalIds).toContain('reply_plan_orchestration')
    expect(normalIds).toContain('personality_narration_subagent')
    expect(normalIds).not.toContain('dynamic_world_due_progression')
    expect(normalIds).toContain('narrative_seed_background_evolution')
    expect(normalIds).not.toContain('personality_tide_affect_gate')
    // 2026-06-10 退场的旧快判不再出现在普通召回的活动 judge 列表里。
    expect(normalIds).not.toContain('character_location_gate')
    expect(normalIds).not.toContain('character_location_arrangement')
    expect(normalIds).not.toContain('user_input_environment_prelude')
    expect(normalIds).not.toContain('role_output_environment_narration')
    expect(normalIds).not.toContain('virtual_scene_location_scan')
    expect(normalIds).not.toContain('probability_narration')

    expect(capsIds).toEqual(normalIds)
    expect(capsIds).toContain('projection_trajectory_writeback')
    expect(capsIds).not.toContain('auto_write_trace')

    expect(personalityIds).toContain('message_projection')
    expect(personalityIds).toContain('reply_plan_orchestration')
    expect(personalityIds).toContain('personality_narration_subagent')
    expect(personalityIds).toContain('personality_reranker')
    expect(personalityIds).not.toContain('virtual_scene_location_scan')
  })
})
