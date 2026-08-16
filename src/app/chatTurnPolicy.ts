import { normalizeChatReplyPipelineMode, normalizeChatSessionReplyPipelineMode } from './chatReplyPipelineMode'
import type {
  ChatTurnFeatureId,
  ChatTurnReplyMode,
  JudgePolicy,
  ReplyModePolicy
} from './chatTurnTypes'

export const NORMAL_RECALL_REPLY_MODE_POLICY: ReplyModePolicy = {
  mode: 'normal_recall',
  label: 'normal recall',
  enabledFeatures: [
    'user_message_persist',
    'group_speaker_plan',
    'role_brain_recall',
    'message_projection',
    'projection_context',
    'context_compression',
    'reply_plan_orchestration',
    'personality_narration_subagent',
    'final_outbound_prompt',
    'assistant_reply_persist',
    'prompt_log_binding',
    'recall_activity_log_binding',
    'projection_trajectory_writeback',
    'generation_attempt',
    'narrative_seed_background_evolution'
  ],
  disabledFeatures: [
    'user_input_environment_prelude',
    'post_user_input_environment_narration',
    'character_location_gate',
    'role_output_environment_narration',
    'character_location_arrangement',
    'auto_write_trace',
    'virtual_scene_location_scan',
    'probability_narration',
    'narration_score_debug',
    'personality_candidate_plan_tree',
    'personality_reranker',
    'pure_prompt_reply',
    'session_temporary_entity_narration'
  ],
  runtimeDisabledFeatures: [],
  promptOptions: {
    skipPrepareRecall: false,
    forceEmptyRecall: false,
    suppressCurrentUserInputTemplate: false,
  },
  notes: [
    'Normal recall shares the unified ReplyWorkflow with personality_model since 2026-06-10: projection-first context, recall in parallel with scenario routing, single-plan orchestration (singlePlanOnly + skipReview, no expressionMix) and the narration subagent.',
    'Old environment prelude, location gate/arrangement, virtual scene scan, probability narration and narration score debug are fully retired; scene changes flow through projection context, the orchestrator and updateCurtainScene only.',
    'Post-reply writeback uses message projection plus projection trajectory writeback; the reply process timeline persists as reply_workflow_trace artifacts.'
  ]
}

export const PERSONALITY_MODEL_REPLY_MODE_POLICY: ReplyModePolicy = {
  mode: 'personality_model',
  label: 'personality model',
  enabledFeatures: [
    'user_message_persist',
    'group_speaker_plan',
    'message_projection',
    'projection_context',
    'role_brain_recall',
    'context_compression',
    'reply_plan_orchestration',
    'personality_candidate_plan_tree',
    'personality_narration_subagent',
    'personality_reranker',
    'final_outbound_prompt',
    'assistant_reply_persist',
    'prompt_log_binding',
    'recall_activity_log_binding',
    'projection_trajectory_writeback',
    'generation_attempt',
    'narrative_seed_background_evolution'
  ],
  disabledFeatures: [
    'user_input_environment_prelude',
    'post_user_input_environment_narration',
    'character_location_gate',
    'role_output_environment_narration',
    'character_location_arrangement',
    'auto_write_trace',
    'virtual_scene_location_scan',
    'probability_narration',
    'narration_score_debug',
    'pure_prompt_reply',
    'session_temporary_entity_narration'
  ],
  runtimeDisabledFeatures: [],
  promptOptions: {
    skipPrepareRecall: false,
    forceEmptyRecall: false,
    suppressCurrentUserInputTemplate: false,
  },
  notes: [
    'Personality model replies use message projections as the semantic context truth.',
    'Role-brain recall is limited to the current user input and must not reinsert old raw chat history.',
    'User, assistant and formal narration messages all enter projection; raw message content stays visible for UI and audit.'
  ]
}

export const PURE_PROMPT_REPLY_MODE_POLICY: ReplyModePolicy = {
  mode: 'pure_prompt',
  label: 'pure prompt',
  enabledFeatures: [
    'user_message_persist',
    'pure_prompt_reply',
    'final_outbound_prompt',
    'assistant_reply_persist',
    'prompt_log_binding',
    'generation_attempt'
  ],
  disabledFeatures: [
    'user_input_environment_prelude',
    'post_user_input_environment_narration',
    'narrative_seed_background_evolution',
    'group_speaker_plan',
    'character_location_gate',
    'role_brain_recall',
    'message_projection',
    'projection_context',
    'context_compression',
    'reply_plan_orchestration',
    'personality_candidate_plan_tree',
    'personality_narration_subagent',
    'personality_reranker',
    'projection_trajectory_writeback',
    'recall_activity_log_binding',
    'role_output_environment_narration',
    'character_location_arrangement',
    'auto_write_trace',
    'virtual_scene_location_scan',
    'probability_narration',
    'narration_score_debug',
    'session_temporary_entity_narration'
  ],
  runtimeDisabledFeatures: [],
  promptOptions: {
    skipPrepareRecall: true,
    forceEmptyRecall: true,
    suppressCurrentUserInputTemplate: true,
    purePrompt: true
  },
  notes: [
    'Pure prompt replies send visible chat history plus the current user input without recall or prompt-template assembly.',
    'Slash commands, recall, event-pool context, narration, location gates and post-round write effects are intentionally skipped.'
  ]
}

export const FAST_REPLY_MODE_POLICY: ReplyModePolicy = {
  mode: 'fast_reply',
  label: 'fast reply',
  enabledFeatures: [
    'user_message_persist',
    'fast_reply_speaker_plan',
    'message_projection',
    'projection_context',
    'role_brain_recall',
    'context_compression',
    'final_outbound_prompt',
    'assistant_reply_persist',
    'prompt_log_binding',
    'projection_trajectory_writeback',
    'generation_attempt',
    'post_round_orchestration'
  ],
  disabledFeatures: [
    'group_speaker_plan',
    'reply_plan_orchestration',
    'personality_candidate_plan_tree',
    'personality_narration_subagent',
    'personality_reranker',
    'pure_prompt_reply',
    'session_temporary_entity_narration'
  ],
  runtimeDisabledFeatures: [],
  promptOptions: {
    skipPrepareRecall: false,
    forceEmptyRecall: false,
    suppressCurrentUserInputTemplate: false
  },
  notes: [
    'Fast reply selects only formally present characters from the orchestration projection.',
    'Each selected character uses the normal role context and directPlan path; no pre-reply director plan or review runs.',
    'Persisted visible replies are followed by a durable post-round orchestration run.'
  ]
}

export const SESSION_TEMPORARY_ENTITY_NARRATION_POLICY: ReplyModePolicy = {
  mode: 'session_temporary_entity_narration',
  label: 'session temporary entity narration',
  enabledFeatures: [
    'user_message_persist',
    'session_temporary_entity_narration',
    'assistant_reply_persist',
    'prompt_log_binding'
  ],
  disabledFeatures: [
    'user_input_environment_prelude',
    'post_user_input_environment_narration',
    'narrative_seed_background_evolution',
    'group_speaker_plan',
    'character_location_gate',
    'role_brain_recall',
    'message_projection',
    'projection_context',
    'context_compression',
    'reply_plan_orchestration',
    'personality_candidate_plan_tree',
    'personality_narration_subagent',
    'personality_reranker',
    'projection_trajectory_writeback',
    'recall_activity_log_binding',
    'role_output_environment_narration',
    'character_location_arrangement',
    'auto_write_trace',
    'virtual_scene_location_scan',
    'probability_narration',
    'narration_score_debug',
    'generation_attempt'
  ],
  runtimeDisabledFeatures: [],
  promptOptions: {
    skipPrepareRecall: true,
    forceEmptyRecall: true,
    suppressCurrentUserInputTemplate: false,
  },
  notes: [
    'This is an input branch, not a character reply mode.',
    'It writes a narration message and prompt log without joining participants or role-brain recall.'
  ]
}

export const REPLY_MODE_POLICIES: Record<ChatTurnReplyMode, ReplyModePolicy> = {
  normal_recall: NORMAL_RECALL_REPLY_MODE_POLICY,
  personality_model: PERSONALITY_MODEL_REPLY_MODE_POLICY,
  pure_prompt: PURE_PROMPT_REPLY_MODE_POLICY,
  fast_reply: FAST_REPLY_MODE_POLICY,
  session_temporary_entity_narration: SESSION_TEMPORARY_ENTITY_NARRATION_POLICY
}

export const CHAT_TURN_JUDGE_POLICIES: JudgePolicy[] = [
  {
    id: 'user_input_environment_prelude',
    title: 'User input environment prelude',
    stage: 'pre_reply_context',
    kind: 'context',
    granularity: 'turn',
    canBlockReply: false,
    canWriteTruth: true,
    truthWrites: ['chat_sessions virtual scene fields', 'narration_debug audit messages'],
    failurePolicy: 'continue_with_audit',
    enabledIn: {
      normal_recall: false,
      personality_model: false,
      pure_prompt: false,
      session_temporary_entity_narration: false
    },
    sourceRefs: ['src/app/replyPlanOrchestratorHarness.ts'],
    notes: ['Retired 2026-06-10: scenario judgement moved into the ReplyPlanOrchestrator routing turn; runtime code removed.']
  },
  {
    id: 'narrative_seed_background_evolution',
    title: 'Narrative seed background evolution',
    stage: 'round_post_effect',
    kind: 'effect',
    granularity: 'round',
    canBlockReply: false,
    canWriteTruth: true,
    truthWrites: ['world_narrative_seeds/events', 'world_entities', 'deferredAgentEventQueue'],
    failurePolicy: 'fire_and_forget',
    enabledIn: {
      normal_recall: true,
      personality_model: true,
      pure_prompt: false,
      session_temporary_entity_narration: false
    },
    sourceRefs: ['src/app/narrativeSeedImpactAgent.ts'],
    notes: ['Batch 5 replacement for the retired event-candidate runtime: per-round hard-capped overdue scan, no timer, no reply blocking.']
  },
  {
    id: 'character_location_gate',
    title: 'Character location gate',
    stage: 'speaker_gate',
    kind: 'gate',
    granularity: 'speaker',
    canBlockReply: true,
    canWriteTruth: false,
    truthWrites: ['narration_debug audit messages', 'chat_prompt_logs'],
    failurePolicy: 'skip_speaker',
    enabledIn: {
      normal_recall: false,
      personality_model: false,
      pure_prompt: false,
      session_temporary_entity_narration: false
    },
    sourceRefs: ['src/app/replyPlanOrchestratorHarness.ts'],
    notes: ['Fully retired 2026-06-10 by decision: no speaker location gating before replies; runtime code removed.']
  },
  {
    id: 'role_brain_recall',
    title: 'Role-brain recall preparation',
    stage: 'recall_context',
    kind: 'effect',
    granularity: 'speaker',
    canBlockReply: false,
    canWriteTruth: true,
    truthWrites: ['recall priority marks', 'chat_recall_activity_logs'],
    failurePolicy: 'continue_with_audit',
    enabledIn: {
      normal_recall: true,
      personality_model: true,
      pure_prompt: false,
      session_temporary_entity_narration: false
    },
    sourceRefs: ['useChatMessageOps.ts:956-969', 'useGroupChatExecutor.ts:340-382'],
    notes: ['Retired CAPS final prompts are no longer assembled here.']
  },
  {
    id: 'message_projection',
    title: 'Message projection',
    stage: 'message_post_analysis',
    kind: 'effect',
    granularity: 'message',
    canBlockReply: false,
    canWriteTruth: true,
    truthWrites: ['chat_message_projections', 'chat_message_projection_visibility', 'chat_sessions virtual scene fields'],
    failurePolicy: 'continue_with_audit',
    enabledIn: {
      normal_recall: true,
      personality_model: true,
      pure_prompt: false,
      session_temporary_entity_narration: false
    },
    sourceRefs: ['server/application/workspace/workspaceChatAppService.ts'],
    notes: [
      'Projects user, assistant and formal narration messages into objective facts.',
      'Failures keep a red projection status and use cleaned text only as temporary context.'
    ]
  },
  {
    id: 'projection_context',
    title: 'Projection context',
    stage: 'recall_context',
    kind: 'context',
    granularity: 'speaker',
    canBlockReply: false,
    canWriteTruth: false,
    truthWrites: [],
    failurePolicy: 'continue_with_audit',
    enabledIn: {
      normal_recall: true,
      personality_model: true,
      pure_prompt: false,
      session_temporary_entity_narration: false
    },
    sourceRefs: ['server/application/workspace/workspaceChatAppService.ts'],
    notes: ['Reads only projections visible to the current reply character; raw message history is UI and audit material.']
  },
  {
    id: 'context_compression',
    title: 'Context compression',
    stage: 'final_prompt',
    kind: 'generation',
    granularity: 'speaker',
    canBlockReply: true,
    canWriteTruth: false,
    truthWrites: [],
    failurePolicy: 'stop_turn',
    enabledIn: {
      normal_recall: true,
      personality_model: true,
      pure_prompt: false,
      session_temporary_entity_narration: false
    },
    sourceRefs: ['src/app/personalityPlanOrchestrator.ts'],
    notes: ['Compresses visible projections and current-input recall units before candidate planning.']
  },
  {
    id: 'personality_candidate_plan_tree',
    title: 'Personality candidate plan tree',
    stage: 'final_prompt',
    kind: 'generation',
    granularity: 'speaker',
    canBlockReply: true,
    canWriteTruth: false,
    truthWrites: [],
    failurePolicy: 'stop_turn',
    enabledIn: {
      normal_recall: false,
      personality_model: true,
      pure_prompt: false,
      session_temporary_entity_narration: false
    },
    sourceRefs: ['src/app/personalityPlanOrchestrator.ts'],
    notes: ['Generates strategy-matrix controlled candidate batches; pressure defaults to 4 strategies x 3 intensities = 12 candidate plans.']
  },
  {
    id: 'personality_narration_subagent',
    title: 'Personality narration subagent',
    stage: 'final_prompt',
    kind: 'effect',
    granularity: 'speaker',
    canBlockReply: false,
    canWriteTruth: true,
    truthWrites: ['chat_messages narration rows'],
    failurePolicy: 'fire_and_forget',
    enabledIn: {
      normal_recall: true,
      personality_model: true,
      pure_prompt: false,
      session_temporary_entity_narration: false
    },
    sourceRefs: ['useChatSendPipeline.ts', 'personalityNarrationSubagent.ts'],
    notes: [
      'Starts after ReplyPlanOrchestrator resolves scenario, confirms enabled session narration profiles, then delegates actual narration writing to the existing narration generation chain.',
      'Enabled for normal_recall since 2026-06-10 (plan decision A): it replaces the retired probability narration and environment narration quick judges.'
    ]
  },
  {
    id: 'personality_reranker',
    title: 'Personality reranker',
    stage: 'final_prompt',
    kind: 'generation',
    granularity: 'speaker',
    canBlockReply: true,
    canWriteTruth: false,
    truthWrites: [],
    failurePolicy: 'stop_turn',
    enabledIn: {
      normal_recall: false,
      personality_model: true,
      pure_prompt: false,
      session_temporary_entity_narration: false
    },
    sourceRefs: ['src/app/personalityRerankerRouter.ts'],
    notes: ['Scores each candidate plan against the compressed situation; only the top three plans reach final reply generation.']
  },
  {
    id: 'projection_trajectory_writeback',
    title: 'Projection trajectory writeback',
    stage: 'round_post_effect',
    kind: 'effect',
    granularity: 'speaker',
    canBlockReply: false,
    canWriteTruth: true,
    truthWrites: ['character trajectory eventLeaf nodes', 'chat_message_projection_visibility', 'chat_projection_writeback_runs'],
    failurePolicy: 'continue_with_audit',
    enabledIn: {
      normal_recall: true,
      personality_model: true,
      pure_prompt: false,
      session_temporary_entity_narration: false
    },
    sourceRefs: ['server/application/workspace/workspaceChatAppService.ts'],
    notes: ['Runs per character when visible projections reach 23; handles the first 20 and keeps 3 as buffer.']
  },
  {
    id: 'role_output_environment_narration',
    title: 'Role output environment narration',
    stage: 'message_post_analysis',
    kind: 'effect',
    granularity: 'message',
    canBlockReply: false,
    canWriteTruth: true,
    truthWrites: ['chat_messages narration rows'],
    failurePolicy: 'continue_silent',
    enabledIn: {
      normal_recall: false,
      personality_model: false,
      pure_prompt: false,
      session_temporary_entity_narration: false
    },
    sourceRefs: ['src/app/personalityNarrationSubagent.ts'],
    notes: ['Retired 2026-06-10: narration is owned by the narration subagent and the formal narration chain; runtime code removed.']
  },
  {
    id: 'character_location_arrangement',
    title: 'Character location arrangement',
    stage: 'message_post_analysis',
    kind: 'effect',
    granularity: 'message',
    canBlockReply: false,
    canWriteTruth: true,
    truthWrites: ['character brain trace arrangement nodes', 'narration_debug audit messages'],
    failurePolicy: 'continue_with_audit',
    enabledIn: {
      normal_recall: false,
      personality_model: false,
      pure_prompt: false,
      session_temporary_entity_narration: false
    },
    sourceRefs: ['src/app/replyPlanOrchestratorHarness.ts'],
    notes: ['Fully retired 2026-06-10 by decision: location arrangement extraction/writes removed; future location features need a new projection-first plan.']
  },
  {
    id: 'auto_write_trace',
    title: 'Chat auto-write trace',
    stage: 'round_post_effect',
    kind: 'effect',
    granularity: 'message',
    canBlockReply: false,
    canWriteTruth: true,
    truthWrites: ['event pool batches', 'character trace candidates', 'soul candidates'],
    failurePolicy: 'fire_and_forget',
    enabledIn: {
      normal_recall: false,
      personality_model: false,
      pure_prompt: false,
      session_temporary_entity_narration: false
    },
    sourceRefs: ['useChatSendPipeline.ts:4843-4874', 'useGroupChatExecutor.ts:840-850'],
    notes: ['Retired event-pool auto-write path. Current normal recall uses projection_trajectory_writeback instead.']
  },
  {
    id: 'virtual_scene_location_scan',
    title: 'Virtual scene location scan',
    stage: 'round_post_effect',
    kind: 'effect',
    granularity: 'message',
    canBlockReply: false,
    canWriteTruth: true,
    truthWrites: ['chat_sessions virtual scene fields'],
    failurePolicy: 'fire_and_forget',
    enabledIn: {
      normal_recall: false,
      personality_model: false,
      pure_prompt: false,
      session_temporary_entity_narration: false
    },
    sourceRefs: ['src/app/replyPlanOrchestratorHarness.ts'],
    notes: ['Retired 2026-06-10: scene changes flow through projection context, the orchestrator and updateCurtainScene only; runtime code removed.']
  },
  {
    id: 'probability_narration',
    title: 'Probability narration',
    stage: 'round_post_effect',
    kind: 'effect',
    granularity: 'round',
    canBlockReply: false,
    canWriteTruth: true,
    truthWrites: ['chat_messages narration rows'],
    failurePolicy: 'continue_silent',
    enabledIn: {
      normal_recall: false,
      personality_model: false,
      pure_prompt: false,
      session_temporary_entity_narration: false
    },
    sourceRefs: ['src/app/personalityNarrationSubagent.ts'],
    notes: ['Retired 2026-06-10: end-of-round probability narration is replaced by the scenario-driven narration subagent; runtime code removed.']
  },
  {
    id: 'reply_plan_orchestration',
    title: 'Reply plan orchestration',
    stage: 'final_prompt',
    kind: 'generation',
    granularity: 'speaker',
    canBlockReply: true,
    canWriteTruth: true,
    truthWrites: ['chat_sessions virtual scene fields (updateCurtainScene)', 'chat_prompt_logs', 'chat_generation_attempt_artifacts'],
    failurePolicy: 'stop_turn',
    enabledIn: {
      normal_recall: true,
      personality_model: true,
      pure_prompt: false,
      session_temporary_entity_narration: false
    },
    sourceRefs: ['src/app/replyPlanOrchestratorHarness.ts', 'src/app/replyPlanAgent/hooks.ts'],
    notes: [
      'Shared ReplyWorkflow orchestration stage: scenario routing, scenario skill reading, optional curtain scene update and plan generation.',
      'personality_model: multi-plan batches + expressionMix + ReRanker review; normal_recall: singlePlanOnly + skipReview, no expressionMix, the single plan goes straight to final reply.'
    ]
  },
  {
    id: 'fast_reply_speaker_plan',
    title: 'Fast reply present-speaker plan',
    stage: 'speaker_plan',
    kind: 'generation',
    granularity: 'round',
    canBlockReply: true,
    canWriteTruth: false,
    truthWrites: [],
    failurePolicy: 'stop_turn',
    enabledIn: { fast_reply: true },
    sourceRefs: ['src/app/fastReplyPlanner.ts'],
    notes: ['Only formal present candidates may enter probability sampling; no unknown/offstage fallback.']
  },
  {
    id: 'focused_action_narration',
    title: 'Focused action narration write',
    stage: 'reply_generation',
    kind: 'generation',
    granularity: 'round',
    canBlockReply: true,
    canWriteTruth: true,
    truthWrites: ['chat_messages user input and focused_action narration'],
    failurePolicy: 'stop_turn',
    enabledIn: { normal_recall: true, personality_model: true, fast_reply: true },
    sourceRefs: ['src/app/focusedActionPrompt.ts', 'src/app/manualNarrationCommand.ts'],
    notes: ['One-shot input kind; it never permanently changes the session reply mode.']
  },
  {
    id: 'post_round_orchestration',
    title: 'Durable post-round fact reconciliation',
    stage: 'post_round_orchestration',
    kind: 'effect',
    granularity: 'round',
    canBlockReply: false,
    canWriteTruth: true,
    truthWrites: ['status panels', 'narrative seeds', 'curtain', 'presence and authorized world facts'],
    failurePolicy: 'continue_with_audit',
    enabledIn: { normal_recall: true, personality_model: true, fast_reply: true },
    sourceRefs: ['shared/postRoundOrchestration.ts', 'src/app/postRoundOrchestrationQueue.ts'],
    notes: ['Runs only after visible messages persist; unresolved runs are retried before the next session context is read.']
  }
]

const JUDGE_POLICY_BY_ID = new Map<ChatTurnFeatureId, JudgePolicy>(
  CHAT_TURN_JUDGE_POLICIES.map((policy) => [policy.id, policy])
)

export function normalizeChatTurnReplyMode(value: unknown): ChatTurnReplyMode {
  if (String(value ?? '').trim() === 'session_temporary_entity_narration') {
    return 'session_temporary_entity_narration'
  }
  if (normalizeChatSessionReplyPipelineMode(value) === 'fast_reply') return 'fast_reply'
  return normalizeChatReplyPipelineMode(value)
}

export function getReplyModePolicy(mode: unknown): ReplyModePolicy {
  return REPLY_MODE_POLICIES[normalizeChatTurnReplyMode(mode)]
}

export function getJudgePolicy(id: ChatTurnFeatureId): JudgePolicy | null {
  return JUDGE_POLICY_BY_ID.get(id) || null
}

export function isReplyFeatureEnabled(mode: unknown, featureId: ChatTurnFeatureId): boolean {
  const policy = getReplyModePolicy(mode)
  if (policy.disabledFeatures.includes(featureId)) return false
  if (policy.runtimeDisabledFeatures.includes(featureId)) return false
  return policy.enabledFeatures.includes(featureId)
}

export function isReplyFeatureRuntimeDisabled(mode: unknown, featureId: ChatTurnFeatureId): boolean {
  return getReplyModePolicy(mode).runtimeDisabledFeatures.includes(featureId)
}

export function listJudgePoliciesForMode(mode: unknown, options: { includeRuntimeDisabled?: boolean } = {}): JudgePolicy[] {
  const normalizedMode = normalizeChatTurnReplyMode(mode)
  return CHAT_TURN_JUDGE_POLICIES.filter((policy) => {
    if (policy.enabledIn[normalizedMode]) return true
    return Boolean(options.includeRuntimeDisabled && isReplyFeatureRuntimeDisabled(normalizedMode, policy.id))
  })
}
