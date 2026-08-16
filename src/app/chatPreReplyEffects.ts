// 旧 user_input_environment_prelude（用户输入环境前置判断）已随回复工作流统一退场（2026-06-10）：
// 环境/情境判断由 ReplyPlanOrchestrator 情境判定与投影上下文接管，本入口只保留动态世界推进。
export interface RunChatPreReplyEffectsInput {
  targetId: string
  userText: string
  sessionId: string
  runDynamicWorldDueProgressionBeforeReply: (sessionId: string) => Promise<unknown>
  onDynamicWorldProgressionError?: (error: unknown) => void
}

export async function runChatPreReplyEffects(input: RunChatPreReplyEffectsInput): Promise<void> {
  try {
    await input.runDynamicWorldDueProgressionBeforeReply(input.sessionId)
  } catch (error) {
    input.onDynamicWorldProgressionError?.(error)
    throw error
  }
}
