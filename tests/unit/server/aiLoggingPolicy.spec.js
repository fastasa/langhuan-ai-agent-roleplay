import { describe, expect, it } from 'vitest'
import {
  formatAiMessageForFullLog,
  normalizeAiSpeakerLine,
  shouldLogFullAiMessages,
  summarizeAiMessageForLog
} from '../../../server/security/aiLoggingPolicy.js'

describe('ai logging policy', () => {
  it('keeps full message logging behind an explicit flag', () => {
    expect(shouldLogFullAiMessages({})).toBe(false)
    expect(shouldLogFullAiMessages({ AI_LOG_FULL_MESSAGES: 'false' })).toBe(false)
    expect(shouldLogFullAiMessages({ AI_LOG_FULL_MESSAGES: 'true' })).toBe(true)
  })

  it('summarizes messages without leaking visible content by default', () => {
    const summary = summarizeAiMessageForLog({
      role: 'user',
      name: '用户',
      content: '这里有私人设定和 sk-secret-1234567890\n第二行'
    })

    expect(summary).toContain('role=user')
    expect(summary).toContain('name=用户')
    expect(summary).toContain('length=')
    expect(summary).toContain('sha256=')
    expect(summary).not.toContain('私人设定')
    expect(summary).not.toContain('sk-secret')
    expect(summary).not.toContain('第二行')
  })

  it('strips thinking blocks before full-log formatting helpers', () => {
    const full = formatAiMessageForFullLog('<think>hidden</think>\n【回复】可见回复')
    expect(full).toContain('可见回复')
    expect(full).not.toContain('hidden')

    const speakerLine = normalizeAiSpeakerLine({
      role: 'assistant',
      name: '星依',
      content: '<think>hidden</think>星依：可见回复'
    })
    expect(speakerLine).toBe('星依：可见回复')
  })
})
