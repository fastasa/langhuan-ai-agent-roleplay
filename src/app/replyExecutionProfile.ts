import type {
  ReplyOrchestrationRoute,
  ReplyOrchestrationRouteDecision
} from './replyOrchestrationRoute'

export const REPLY_EXECUTION_PROFILE_SCHEMA_VERSION = 'reply-execution-profile/v2' as const

export type ReplyOrchestrationDepth = 'reuse' | 'full' | 'bypass'
export type ReplyBackend = 'personality' | 'normal_recall' | 'mixed' | 'pure_prompt' | 'focused_action'
export type ReplyPlanningPolicy = 'direct' | 'direct_personality_rerank' | 'candidate_rerank' | 'single_plan' | 'per_speaker' | 'focused_action_plan' | 'none'
export type ReplyContextPolicy = 'projection_tail' | 'recall_on_demand' | 'role_projection_tail' | 'action_context'
export type ReplyPostRoundPolicy = 'projection_only' | 'orchestration_managed' | 'none'

export interface ReplyExecutionProfileInput {
  route: ReplyOrchestrationRoute
  hasPersonalityModel: boolean
  /** 同轮角色后端不一致时只用于轮级画像；每条角色消息仍记录自己的实际后端。 */
  mixedBackends?: boolean
  /** 纯提示轮完全绕过 ReplyWorkflow。 */
  purePrompt: boolean
  /** 聚焦动作走独立动作管线，并在成功后运行专用轮后统筹。 */
  focusedAction?: boolean
}

export interface ReplyExecutionProfile {
  readonly schemaVersion: typeof REPLY_EXECUTION_PROFILE_SCHEMA_VERSION
  readonly orchestrationDepth: ReplyOrchestrationDepth
  readonly replyBackend: ReplyBackend
  readonly planningPolicy: ReplyPlanningPolicy
  readonly contextPolicy: ReplyContextPolicy
  readonly postRoundPolicy: ReplyPostRoundPolicy
  /** 仅供日志和审计，不是用户可见回复文案。 */
  readonly auditLabel: string
  readonly basis: Readonly<{
    route: ReplyOrchestrationRoute
    hasPersonalityModel: boolean
    mixedBackends: boolean
    purePrompt: boolean
    focusedAction: boolean
  }>
}

export interface ReplyExecutionAudit {
  readonly replyExecutionProfile: ReplyExecutionProfile
  readonly roundReplyExecutionProfile?: ReplyExecutionProfile
  readonly replyOrchestrationDecision?: ReplyOrchestrationRouteDecision
}

export interface ReplyBackendComposition {
  readonly hasPersonalityModel: boolean
  readonly mixedBackends: boolean
}

/** 按本轮真正选中的发言者计算后端构成；空集合不会凭会话候选臆测 mixed。 */
export function resolveReplyBackendComposition(
  personalityModelFlags: readonly boolean[]
): ReplyBackendComposition {
  const normalized = personalityModelFlags.map((value) => value === true)
  const personalityCount = normalized.filter(Boolean).length
  return Object.freeze({
    hasPersonalityModel: personalityCount > 0,
    mixedBackends: personalityCount > 0 && personalityCount < normalized.length
  })
}

function createAuditLabel(input: {
  orchestrationDepth: ReplyOrchestrationDepth
  replyBackend: ReplyBackend
  planningPolicy: ReplyPlanningPolicy
  contextPolicy: ReplyContextPolicy
  postRoundPolicy: ReplyPostRoundPolicy
  purePrompt: boolean
  focusedAction: boolean
}): string {
  return [
    REPLY_EXECUTION_PROFILE_SCHEMA_VERSION,
    `depth=${input.orchestrationDepth}`,
    `backend=${input.replyBackend}`,
    `planning=${input.planningPolicy}`,
    `context=${input.contextPolicy}`,
    `post=${input.postRoundPolicy}`,
    `pure=${input.purePrompt ? '1' : '0'}`,
    `focused=${input.focusedAction ? '1' : '0'}`
  ].join(';')
}

/**
 * 把“是否统筹、由谁回复、怎样规划、怎样供给上下文、轮后怎样维护”拆成正交维度。
 * 本函数只返回内部执行画像，不生成任何用户可见模式提示。
 */
export function resolveReplyExecutionProfile(input: ReplyExecutionProfileInput): ReplyExecutionProfile {
  const route: ReplyOrchestrationRoute = input.route === 'reuse' ? 'reuse' : 'orchestrate'
  const hasPersonalityModel = input.hasPersonalityModel === true
  const mixedBackends = input.mixedBackends === true
  const purePrompt = input.purePrompt === true
  const focusedAction = input.focusedAction === true
  const orchestrationDepth: ReplyOrchestrationDepth = focusedAction || purePrompt
    ? 'bypass'
    : route === 'reuse'
      ? 'reuse'
      : 'full'
  const replyBackend: ReplyBackend = focusedAction
    ? 'focused_action'
    : purePrompt
      ? 'pure_prompt'
      : mixedBackends
        ? 'mixed'
        : hasPersonalityModel
          ? 'personality'
          : 'normal_recall'
  const planningPolicy: ReplyPlanningPolicy = focusedAction
    ? 'focused_action_plan'
    : purePrompt
      ? 'none'
      : mixedBackends
        ? 'per_speaker'
        : orchestrationDepth === 'reuse'
          ? replyBackend === 'personality' ? 'direct_personality_rerank' : 'direct'
          : replyBackend === 'personality'
            ? 'candidate_rerank'
            : 'single_plan'
  const contextPolicy: ReplyContextPolicy = focusedAction
    ? 'action_context'
    : purePrompt
      ? 'role_projection_tail'
      : orchestrationDepth === 'reuse'
        ? 'projection_tail'
        : 'recall_on_demand'
  const postRoundPolicy: ReplyPostRoundPolicy = focusedAction
    ? 'orchestration_managed'
    : purePrompt
      ? 'none'
      : orchestrationDepth === 'reuse'
        ? 'projection_only'
        : 'orchestration_managed'
  const basis = Object.freeze({ route, hasPersonalityModel, mixedBackends, purePrompt, focusedAction })
  const auditLabel = createAuditLabel({
    orchestrationDepth,
    replyBackend,
    planningPolicy,
    contextPolicy,
    postRoundPolicy,
    purePrompt,
    focusedAction
  })

  return Object.freeze({
    schemaVersion: REPLY_EXECUTION_PROFILE_SCHEMA_VERSION,
    orchestrationDepth,
    replyBackend,
    planningPolicy,
    contextPolicy,
    postRoundPolicy,
    auditLabel,
    basis
  })
}

/**
 * 把轮级计划画像收束成单条角色消息的实际执行回执。混合群聊保留 round 画像，同时按当前 speaker
 * 记录真实人格/普通后端；自动路由的理由、置信度与依赖比较原样随回执持久化。
 */
export function buildReplyExecutionAudit(input: {
  roundProfile?: ReplyExecutionProfile | null
  routeDecision?: ReplyOrchestrationRouteDecision | null
  defaultRoute: ReplyOrchestrationRoute
  actualHasPersonalityModel: boolean
  purePrompt: boolean
  focusedAction?: boolean
}): ReplyExecutionAudit {
  const actual = resolveReplyExecutionProfile({
    route: input.roundProfile?.basis.route ?? input.defaultRoute,
    hasPersonalityModel: input.actualHasPersonalityModel,
    purePrompt: input.purePrompt,
    focusedAction: input.focusedAction
  })
  return Object.freeze({
    replyExecutionProfile: actual,
    ...(input.roundProfile && input.roundProfile.auditLabel !== actual.auditLabel
      ? { roundReplyExecutionProfile: input.roundProfile }
      : {}),
    ...(input.routeDecision ? { replyOrchestrationDecision: input.routeDecision } : {})
  })
}
