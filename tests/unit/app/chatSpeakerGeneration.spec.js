import { describe, expect, it } from 'vitest'
import { createEmptySingleChatRunResult } from '../../../src/app/chatSpeakerGeneration.ts'

describe('chatSpeakerGeneration', () => {
  it('creates an empty single chat result', () => {
    expect(createEmptySingleChatRunResult()).toEqual({
      assistantMessageIds: [],
      firstMessageId: 0,
      firstContent: ''
    })
  })

})
