import type { ChatReplyPipelineMode } from './chatReplyPipelineMode'
import type { ReplyExecutionProfile } from './replyExecutionProfile'
import type { ReplyOrchestrationRouteDecision } from './replyOrchestrationRoute'

export type ChatTurnReplyMode = ChatReplyPipelineMode | 'fast_reply' | 'session_temporary_entity_narration'

export type ChatTurnInputKind =
  | 'plain_user_message'
  | 'slash_command'
  | 'session_temporary_entity_narration'
  | 'pure_prompt_reply'
  | 'focused_action'
  | 'user_message_regenerate'

export type ChatTurnStage =
  | 'input_routing'
  | 'user_message_persist'
  | 'pre_reply_context'
  | 'dynamic_world_progression'
  | 'speaker_plan'
  | 'speaker_gate'
  | 'recall_context'
  | 'final_prompt'
  | 'reply_generation'
  | 'reply_persist'
  | 'message_post_analysis'
  | 'round_post_effect'
  | 'post_round_orchestration'
  | 'audit'
  | 'finalize'

export type ChatTurnFeatureId =
  | 'input_command_routing'
  | 'user_message_persist'
  | 'session_temporary_entity_narration'
  | 'user_input_environment_prelude'
  | 'post_user_input_environment_narration'
  | 'narrative_seed_background_evolution'
  | 'group_speaker_plan'
  | 'character_location_gate'
  | 'role_brain_recall'
  | 'message_projection'
  | 'projection_context'
  | 'context_compression'
  | 'reply_plan_orchestration'
  | 'personality_candidate_plan_tree'
  | 'personality_narration_subagent'
  | 'personality_reranker'
  | 'projection_trajectory_writeback'
  | 'final_outbound_prompt'
  | 'assistant_reply_persist'
  | 'prompt_log_binding'
  | 'recall_activity_log_binding'
  | 'role_output_environment_narration'
  | 'character_location_arrangement'
  | 'auto_write_trace'
  | 'virtual_scene_location_scan'
  | 'probability_narration'
  | 'narration_score_debug'
  | 'pure_prompt_reply'
  | 'generation_attempt'
  | 'fast_reply_speaker_plan'
  | 'focused_action_narration'
  | 'post_round_orchestration'

export type ChatTurnPolicyKind = 'context' | 'gate' | 'effect' | 'audit' | 'generation' | 'persist'
export type ChatTurnGranularity = 'turn' | 'speaker' | 'message' | 'round'
export type ChatTurnFailurePolicy =
  | 'stop_turn'
  | 'skip_speaker'
  | 'continue_with_audit'
  | 'continue_silent'
  | 'fire_and_forget'

export interface TurnContext {
  sessionId: string
  targetId: string
  speakerTargetId?: string
  inputMessageId?: number
  taskRunId?: string
  generationAttemptId?: string
  replyMode: ChatTurnReplyMode
  /** 正交执行画像：统筹深度、回复后端、规划、上下文与轮后策略；只用于执行/审计。 */
  replyExecutionProfile?: ReplyExecutionProfile
  /** 自动路由原始判定；与执行画像一起写入生成产物，供事后核对理由和依赖比较。 */
  replyOrchestrationDecision?: ReplyOrchestrationRouteDecision
  roundId?: string
  abortSignal?: AbortSignal
}

export interface TurnSpeakerPlan {
  speakerTargetId: string
  speakerName?: string
  replyMode: ChatTurnReplyMode
  forced?: boolean
  probability?: number
}

export interface TurnPlan {
  inputKind: ChatTurnInputKind
  replyMode: ChatTurnReplyMode
  speakers: TurnSpeakerPlan[]
  preReplyStages: ChatTurnFeatureId[]
  speakerStages: ChatTurnFeatureId[]
  postRoundStages: ChatTurnFeatureId[]
  auditStages: ChatTurnFeatureId[]
}

export interface ReplyModePolicy {
  mode: ChatTurnReplyMode
  label: string
  enabledFeatures: ChatTurnFeatureId[]
  disabledFeatures: ChatTurnFeatureId[]
  runtimeDisabledFeatures: ChatTurnFeatureId[]
  promptOptions: {
    skipPrepareRecall?: boolean
    forceEmptyRecall?: boolean
    suppressCurrentUserInputTemplate?: boolean
    purePrompt?: boolean
  }
  notes: string[]
}

export interface JudgePolicy {
  id: ChatTurnFeatureId
  title: string
  stage: ChatTurnStage
  kind: ChatTurnPolicyKind
  granularity: ChatTurnGranularity
  canBlockReply: boolean
  canWriteTruth: boolean
  truthWrites: string[]
  failurePolicy: ChatTurnFailurePolicy
  enabledIn: Partial<Record<ChatTurnReplyMode, boolean>>
  sourceRefs: string[]
  notes: string[]
}
