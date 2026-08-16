import { describe, expect, it } from 'vitest'
import {
  collectCapsNetworkGroupSpeakers,
  resolveFinalGroupReplyOrder,
  resolvePlannedGroupSpeakerViews
} from '../../../src/app/chatSpeakerPlanner.ts'

describe('chatSpeakerPlanner', () => {
  it('builds planned speaker view models from known characters', () => {
    expect(resolvePlannedGroupSpeakerViews({
      replyOrder: [{ characterId: 'char_1' }, { characterId: 'missing' }],
      characters: [{ id: 'char_1', name: '星依' }]
    })).toEqual([{ id: 'char_1', name: '星依' }])
  })

  it('uses the explicit planned order when it exists', () => {
    const finalOrder = resolveFinalGroupReplyOrder({
      plannedReplyOrder: [{ characterId: 'char_2', mustReply: false, probability: 0.2 }],
      groupMembers: [{ characterId: 'char_1', probability: 100 }],
      normalizeReplyProbability: (value) => Number(value),
      random: () => 0.1
    })

    expect(finalOrder).toEqual([{ characterId: 'char_2', mustReply: true, probability: 1 }])
  })

  it('falls back to the first candidate when probability filters out everyone', () => {
    const finalOrder = resolveFinalGroupReplyOrder({
      plannedReplyOrder: [{ characterId: 'char_1', mustReply: false, probability: 0 }],
      groupMembers: [],
      normalizeReplyProbability: (value) => Number(value),
      random: () => 1
    })

    expect(finalOrder).toEqual([{ characterId: 'char_1', mustReply: true, probability: 1 }])
  })

  it('does not collect CAPS speakers after CAPS reply mode retirement', () => {
    expect(collectCapsNetworkGroupSpeakers([
      { characterId: 'char_1' },
      { characterId: 'char_2' },
      { characterId: '' }
    ], (characterId) => characterId === 'char_2' ? 'caps_network' : 'normal_recall')).toEqual([])
  })
})
