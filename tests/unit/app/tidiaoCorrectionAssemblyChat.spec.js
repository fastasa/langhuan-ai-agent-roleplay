import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../src/repositories/chatRepository.ts', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    fetchChatPersonalityModelObservationsBySessionId: vi.fn(async () => ({ projections: [] }))
  }
})

import { assembleTidiaoCorrectionContexts } from '../../../src/app/tidiaoCorrectionAssembly.ts'
import { clearTidiaoDirectorStreamRound } from '../../../src/app/tidiaoDirectorStreamState.ts'

describe('assembleTidiaoCorrectionContexts（提调自由对话）', () => {
  beforeEach(() => {
    clearTidiaoDirectorStreamRound()
  })

  it('允许用户消息作锚时，即使没有角色楼层也会装配正式提调轮', async () => {
    const source = {
      sessionId: 'session_1',
      targetId: 'char_1',
      session: { id: 'session_1', targetId: 'char_1' },
      messages: [
        { id: 201, role: 'user', content: '你能回答我吗？' },
        { id: 202, role: 'assistant', messageKind: 'narration_debug', content: '旧调试消息' }
      ],
      groups: [],
      characters: [{ id: 'char_1', name: '宋青黛' }]
    }

    const legacy = await assembleTidiaoCorrectionContexts(source, { targetMessageId: 201 })
    const chat = await assembleTidiaoCorrectionContexts(source, {
      targetMessageId: 201,
      allowUnanchoredChat: true
    })

    expect(legacy).toBeNull()
    expect(chat).not.toBeNull()
    expect(chat?.targetRoundAnchorMessageId).toBe(201)
    expect(chat?.targets).toEqual([])
    expect(chat?.targetMessage).toMatchObject({ id: 201, role: 'user' })
    expect(chat?.visibleHistory).toContain('你能回答我吗？')
    expect(chat?.visibleHistory).not.toContain('旧调试消息')
  })
})
