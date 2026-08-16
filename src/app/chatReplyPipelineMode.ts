export type ChatReplyPipelineMode = 'normal_recall' | 'pure_prompt' | 'personality_model'
export type ChatSessionReplyPipelineMode = ChatReplyPipelineMode | 'fast_reply'
export type CharacterReplyPipelineModeOverride = 'follow_session' | Exclude<ChatReplyPipelineMode, 'pure_prompt'>
export type ResolvedReplyPipelineMode = ChatReplyPipelineMode
/** 回复工作流模式：共用 ReplyWorkflow 编排框架的两种回复模式；pure_prompt 不进入工作流，不在此类型内。 */
export type ReplyWorkflowMode = Exclude<ChatReplyPipelineMode, 'pure_prompt'>

export const DEFAULT_CHAT_REPLY_PIPELINE_MODE: ChatReplyPipelineMode = 'normal_recall'
export const DEFAULT_CHAT_SESSION_REPLY_PIPELINE_MODE: ChatSessionReplyPipelineMode = 'normal_recall'
export const DEFAULT_CHARACTER_REPLY_PIPELINE_MODE_OVERRIDE: CharacterReplyPipelineModeOverride = 'follow_session'

export function normalizeChatReplyPipelineMode(value: unknown): ChatReplyPipelineMode {
  const raw = String(value ?? '').trim().toLowerCase()
  if (raw === 'pure_prompt' || raw === 'pure' || raw === 'clean_prompt' || raw === 'direct_prompt') return 'pure_prompt'
  if (raw === 'personality_model' || raw === 'personality' || raw === 'message_projection' || raw === 'projection_model') return 'personality_model'
  if (raw === 'caps_network' || raw === 'caps' || raw === 'caps-direct' || raw === 'caps_direct') return 'normal_recall'
  if (raw === 'normal_recall' || raw === 'normal' || raw === 'recall' || raw === 'legacy_recall') return 'normal_recall'
  return DEFAULT_CHAT_REPLY_PIPELINE_MODE
}

export function normalizeChatSessionReplyPipelineMode(value: unknown): ChatSessionReplyPipelineMode {
  const raw = String(value ?? '').trim().toLowerCase()
  if (raw === 'fast_reply' || raw === 'fast' || raw === 'quick_reply') return 'fast_reply'
  return normalizeChatReplyPipelineMode(value)
}

export function resolveSessionReplyPipelineMode(session?: Record<string, unknown> | null): ChatSessionReplyPipelineMode {
  const camelMode = normalizeChatSessionReplyPipelineMode(session?.replyPipelineMode)
  const snakeMode = normalizeChatSessionReplyPipelineMode(session?.reply_pipeline_mode)
  if (camelMode === 'pure_prompt' || snakeMode === 'pure_prompt') return 'pure_prompt'
  if (camelMode === 'fast_reply' || snakeMode === 'fast_reply') return 'fast_reply'
  return normalizeChatSessionReplyPipelineMode(session?.replyPipelineMode ?? session?.reply_pipeline_mode)
}

export function normalizeCharacterReplyPipelineModeOverride(value: unknown): CharacterReplyPipelineModeOverride {
  const raw = String(value ?? '').trim().toLowerCase()
  if (!raw || raw === 'follow' || raw === 'follow_session' || raw === 'session' || raw === 'default') {
    return DEFAULT_CHARACTER_REPLY_PIPELINE_MODE_OVERRIDE
  }
  if (raw === 'personality_model' || raw === 'personality' || raw === 'message_projection' || raw === 'projection_model') return 'personality_model'
  if (raw === 'caps_network' || raw === 'caps' || raw === 'caps-direct' || raw === 'caps_direct') return 'follow_session'
  if (raw === 'normal_recall' || raw === 'normal' || raw === 'recall' || raw === 'legacy_recall') return 'normal_recall'
  return DEFAULT_CHARACTER_REPLY_PIPELINE_MODE_OVERRIDE
}

/** 角色是否已上传人格模型（ONNX 包路径非空）：人格模型链路能否真跑的唯一判据。 */
export function hasCharacterPersonalityModel(character?: Record<string, unknown> | null): boolean {
  return Boolean(String(character?.personalityModelPath ?? character?.personality_model_path ?? '').trim())
}

/**
 * 配置态模式（不含无模型兜底）：只反映会话/角色配置本身。
 * 仅用于「配置了人格模型但已回退」的可见提示；派发、投影写回等一律吃 resolveReplyPipelineMode 的有效模式。
 */
export function resolveConfiguredReplyPipelineMode(input: {
  session?: Record<string, unknown> | null
  character?: Record<string, unknown> | null
}): ResolvedReplyPipelineMode {
  const sessionMode = resolveSessionReplyPipelineMode(input.session)
  if (sessionMode === 'pure_prompt') return 'pure_prompt'
  // fast_reply 是会话轮级编排方式，不是单角色生成 profile。命中角色仍复用 normal_recall
  // 的正式上下文与正文生成，只由外层提供 directPlan 跳过计划/评审。
  if (sessionMode === 'fast_reply') return 'normal_recall'
  const override = normalizeCharacterReplyPipelineModeOverride(
    input.character?.replyPipelineModeOverride ?? input.character?.reply_pipeline_mode_override
  )
  if (override !== 'follow_session') return override
  return sessionMode
}

export function resolveReplyPipelineMode(input: {
  session?: Record<string, unknown> | null
  character?: Record<string, unknown> | null
}): ResolvedReplyPipelineMode {
  const configured = resolveConfiguredReplyPipelineMode(input)
  // 无模型兜底（用户 2026-07-06 拍板，取代旧「门禁跳过该角色」）：选了人格模型链路但该角色
  // 没上传 ONNX 模型（含角色解析失败）→ 有效模式回退普通召回。提调编排派发、单聊/群聊工作流、
  // 重放与投影写回都消费这里的有效模式，回退在此单点收敛。
  if (configured === 'personality_model' && !hasCharacterPersonalityModel(input.character)) return 'normal_recall'
  return configured
}

export function isCapsNetworkReplyMode(
  session: Record<string, unknown> | null | undefined,
  character?: Record<string, unknown> | null | undefined
): boolean {
  void session
  void character
  return false
}

export function isPersonalityModelReplyMode(
  session: Record<string, unknown> | null | undefined,
  character?: Record<string, unknown> | null | undefined
): boolean {
  return resolveReplyPipelineMode({ session, character }) === 'personality_model'
}
