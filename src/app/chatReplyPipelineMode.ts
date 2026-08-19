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
  // 2026-08-18：快速/人格不再是会话级互斥开关。旧值统一迁到自动链路：
  // 每轮由续接轻判决定是否直通；角色有已安装人格模型时默认走人格 profile，否则普通召回。
  if (raw === 'fast_reply' || raw === 'fast' || raw === 'quick_reply') return 'normal_recall'
  if (raw === 'personality_model' || raw === 'personality' || raw === 'message_projection' || raw === 'projection_model') return 'normal_recall'
  return normalizeChatReplyPipelineMode(value)
}

export function resolveSessionReplyPipelineMode(session?: Record<string, unknown> | null): ChatSessionReplyPipelineMode {
  const camelMode = normalizeChatSessionReplyPipelineMode(session?.replyPipelineMode)
  const snakeMode = normalizeChatSessionReplyPipelineMode(session?.reply_pipeline_mode)
  if (camelMode === 'pure_prompt' || snakeMode === 'pure_prompt') return 'pure_prompt'
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
 * 配置态 profile：纯净回复优先；角色显式覆盖其次；未覆盖时按人格模型是否安装自动选择。
 * 是否走稳定续话直通不属于本函数，由 replyOrchestrationRoute 单独判定。
 */
export function resolveConfiguredReplyPipelineMode(input: {
  session?: Record<string, unknown> | null
  character?: Record<string, unknown> | null
}): ResolvedReplyPipelineMode {
  const sessionMode = resolveSessionReplyPipelineMode(input.session)
  if (sessionMode === 'pure_prompt') return 'pure_prompt'
  const override = normalizeCharacterReplyPipelineModeOverride(
    input.character?.replyPipelineModeOverride ?? input.character?.reply_pipeline_mode_override
  )
  if (override !== 'follow_session') return override
  // 自动 profile：人格模型是否已安装是默认选择的唯一依据。是否跳过复杂统筹由独立的
  // replyOrchestrationRoute 轻判决定，不再把「快速」混进角色生成 profile。
  return hasCharacterPersonalityModel(input.character) ? 'personality_model' : 'normal_recall'
}

export function resolveReplyPipelineMode(input: {
  session?: Record<string, unknown> | null
  character?: Record<string, unknown> | null
}): ResolvedReplyPipelineMode {
  const configured = resolveConfiguredReplyPipelineMode(input)
  // 显式强制人格模型但模型缺失时仍安全回普通召回；自动选择本身不会进入这个分支。
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
