import { describe, expect, it } from 'vitest'
import { resolveChatMessageSpeakerName } from '../../../src/app/chatMessageSpeaker'

describe('chatMessageSpeaker', () => {
  it('keeps the saved user message name after alias changes', () => {
    const message = { role: 'user', name: '旧马甲', content: '之前说的话' }

    expect(resolveChatMessageSpeakerName(message, { userFallbackName: '新马甲' })).toBe('旧马甲')
  })

  it('uses the current alias only when old user messages have no saved name', () => {
    const message = { role: 'user', content: '旧数据没有名字' }

    expect(resolveChatMessageSpeakerName(message, { userFallbackName: '当前马甲' })).toBe('当前马甲')
  })

  it('keeps assistant names independent from user alias fallback', () => {
    const message = { role: 'assistant', memberName: '星依' }

    expect(resolveChatMessageSpeakerName(message, { userFallbackName: '当前马甲', assistantFallbackName: '默认角色' })).toBe('星依')
  })
})
