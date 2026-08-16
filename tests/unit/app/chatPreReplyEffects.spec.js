import { describe, expect, it, vi } from 'vitest'
import { runChatPreReplyEffects } from '../../../src/app/chatPreReplyEffects.ts'

// 2026-06-10 起旧 user_input_environment_prelude 已随回复工作流统一退场：
// 本入口只保留动态世界推进，环境/情境判断由 ReplyPlanOrchestrator 接管。
describe('chatPreReplyEffects', () => {
  it('runs dynamic progression with the session id', async () => {
    const dynamic = vi.fn(async () => undefined)

    await runChatPreReplyEffects({
      targetId: 'char_1',
      userText: '你好',
      sessionId: 'session_1',
      runDynamicWorldDueProgressionBeforeReply: dynamic
    })

    expect(dynamic).toHaveBeenCalledWith('session_1')
  })

  it('reports and rethrows dynamic progression failures', async () => {
    const error = new Error('dynamic failed')
    const onDynamicWorldProgressionError = vi.fn()

    await expect(runChatPreReplyEffects({
      targetId: 'char_1',
      userText: '你好',
      sessionId: 'session_1',
      runDynamicWorldDueProgressionBeforeReply: vi.fn(async () => { throw error }),
      onDynamicWorldProgressionError
    })).rejects.toThrow(error)

    expect(onDynamicWorldProgressionError).toHaveBeenCalledWith(error)
  })
})
