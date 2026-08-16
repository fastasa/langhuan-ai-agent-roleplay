import { describe, expect, it, vi } from 'vitest'
import {
  buildFinalOutboundPrompt
} from '../../../src/app/chatPromptAssemblyStages.ts'

describe('chatPromptAssemblyStages', () => {
  it('builds final outbound prompt from the refreshed source messages', async () => {
    const sourceMessages = [{ id: 1, role: 'user', content: '你好' }]
    const buildChatMessages = vi.fn(async () => [{ role: 'user', content: 'final' }])

    const messages = await buildFinalOutboundPrompt({
      buildChatMessages,
      targetId: 'session_1',
      userText: '你好',
      sourceMessages,
      speakerTargetId: 'char_1',
      options: { skipPrepareRecall: true }
    })

    expect(messages).toHaveLength(1)
    expect(messages[0].role).toBe('user')
    expect(messages[0].content).toContain('final')
    expect(messages[0].content).toContain('[消息投影]')
    expect(messages[0].content).toContain('（正文）：直接顶格写')
    expect(buildChatMessages).toHaveBeenCalledWith(
      'session_1',
      '你好',
      sourceMessages,
      'char_1',
      { skipPrepareRecall: true }
    )
  })

  it('builds pure prompt messages from visible history without calling the normal prompt builder', async () => {
    const buildChatMessages = vi.fn(async () => [{ role: 'system', content: 'should not appear' }])

    const messages = await buildFinalOutboundPrompt({
      buildChatMessages,
      targetId: 'session_1',
      userText: '/整理角色 星依',
      sourceMessages: [
        { id: 1, role: 'user', content: 'old' },
        { id: 2, role: 'assistant', content: 'reply' },
        { id: 3, role: 'assistant', content: 'debug', messageKind: 'narration_debug' },
        { id: 4, role: 'assistant', content: 'hidden', autoWriteHidden: true },
        { id: 5, role: 'user', content: '/整理角色 星依' }
      ],
      speakerTargetId: 'char_1',
      options: { purePrompt: true }
    })

    expect(messages).toEqual([
      { role: 'user', content: 'old' },
      { role: 'assistant', content: 'reply' },
      { role: 'user', content: '/整理角色 星依' }
    ])
    expect(messages.map((message) => message.content).join('\n')).not.toContain('【消息投影】')
    expect(buildChatMessages).not.toHaveBeenCalled()
  })

  it('builds personality model final prompt from projection context instead of raw history', async () => {
    const buildChatMessages = vi.fn(async () => [{ role: 'system', content: 'should not appear' }])

    const messages = await buildFinalOutboundPrompt({
      buildChatMessages,
      targetId: 'session_1',
      userText: '继续。',
      sourceMessages: [
        { id: 1, role: 'user', content: '旧长历史原文' },
        { id: 2, role: 'assistant', content: '旧回复原文' }
      ],
      speakerTargetId: 'char_xingyi',
      options: {
        personalityModelContext: {
          characterName: '星依',
          characterIdentity: '星依是聪明、挑剔的女儿。',
          promptLibrarySystemPrompt: '你只能扮演星依。',
          compressedContext: '投影事实：用户在书房询问星依下一步。',
          topPlans: [
            { content: '先指出风险。' },
            { content: '再给建议。' },
            { content: '最后追问缺口。' }
          ],
          currentUserInput: '继续。'
        }
      }
    })

    const text = messages.map((message) => message.content).join('\n')
    expect(text).toContain('投影事实')
    expect(text).toContain('你只能扮演星依。')
    expect(text).toContain('先指出风险')
    expect(text).toContain('继续。')
    expect(text).toContain('[消息投影]')
    expect(text).not.toContain('旧长历史原文')
    expect(text).not.toContain('旧回复原文')
    expect(buildChatMessages).not.toHaveBeenCalled()
  })

  it('renders single-plan final prompt for normal recall workflow (no top-three wording, no expression mix)', async () => {
    const messages = await buildFinalOutboundPrompt({
      buildChatMessages: vi.fn(async () => []),
      targetId: 'session_1',
      userText: '继续。',
      sourceMessages: [],
      speakerTargetId: 'char_xingyi',
      options: {
        personalityModelContext: {
          characterName: '星依',
          characterIdentity: '星依是聪明、挑剔的女儿。',
          compressedContext: '投影事实：用户在书房询问星依下一步。',
          topPlans: [{ content: '先指出风险，再给建议。' }],
          expressionMix: null,
          currentUserInput: '继续。'
        }
      }
    })

    const text = messages.map((message) => message.content).join('\n')
    expect(text).toContain('【回复计划】')
    expect(text).not.toContain('【前三计划】')
    expect(text).not.toContain('【表达占比】')
    expect(text).toContain('先指出风险')
    expect(text).toContain('[消息投影]')
  })
})
