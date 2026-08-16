import { describe, expect, it } from 'vitest'
import { shouldBypassLegacyQuickJudgesForCapsTrace } from '../../../src/app/chatSpeakerGates.ts'

describe('chatSpeakerGates', () => {
  it('bypasses legacy quick judges only when CAPS trace exists', () => {
    expect(shouldBypassLegacyQuickJudgesForCapsTrace(null)).toBe(false)
    expect(shouldBypassLegacyQuickJudgesForCapsTrace({ runId: 'trace_1' })).toBe(true)
  })
})
