import { describe, expect, it } from 'vitest'
import {
  createChatRecallActivityLogBySessionId,
  isMultiCharacterChatSession,
  normalizeChatMessageForTarget,
  normalizeChatSessionCharacterParticipants
} from './chatRepository'
import { decodeRecallActivityLogValue, isEncodedRecallActivityLogEnvelope } from '../../shared/recallActivityLogCodec.ts'

function createMessage(patch = {}) {
  return {
    id: 1,
    session_id: 'session_1',
    role: 'assistant',
    content: 'hello',
    time: '12:00',
    image: '',
    model: '',
    created_at: '2026-05-05T00:00:00.000Z',
    ...patch
  }
}

describe('normalizeChatMessageForTarget', () => {
  it('uses member_name as the assistant display name for group sessions', () => {
    const message = normalizeChatMessageForTarget(
      'group_family',
      createMessage({ name: '', member_name: '陈星依' })
    )

    expect(message.name).toBe('陈星依')
    expect(message.memberName).toBe('陈星依')
    expect(message.member_name).toBe('陈星依')
  })
})

describe('chat session participants', () => {
  it('derives ordered character participants from the current session', () => {
    const participants = normalizeChatSessionCharacterParticipants({
      participants: [
        { participantTargetId: 'char_b', participantType: 'char', displayOrder: 2, replyProbability: 60 },
        { participantTargetId: 'group_old', participantType: 'group', displayOrder: 1 },
        { participantTargetId: 'char_a', participantType: 'char', displayOrder: 0, replyProbability: 100 },
        { participantTargetId: 'char_a', participantType: 'char', displayOrder: 3, replyProbability: 20 }
      ]
    })

    expect(participants).toEqual([
      expect.objectContaining({ characterId: 'char_a', probability: 100, displayOrder: 0 }),
      expect.objectContaining({ characterId: 'char_b', probability: 60, displayOrder: 2 })
    ])
  })

  it('uses session participants before legacy group target ids when deciding multi character mode', () => {
    expect(isMultiCharacterChatSession({
      participants: [
        { participantTargetId: 'char_a', participantType: 'char' },
        { participantTargetId: 'char_b', participantType: 'char' }
      ]
    }, 'char_a')).toBe(true)

    expect(isMultiCharacterChatSession({
      participants: [
        { participantTargetId: 'char_a', participantType: 'char' }
      ]
    }, 'group_old')).toBe(false)

    expect(isMultiCharacterChatSession({ participants: [] }, 'group_old')).toBe(true)
  })
})

describe('chat recall activity log repository', () => {
  it('compresses large recall activity logs before sending them to the server', async () => {
    const originalFetch = globalThis.fetch
    let sentBody = ''
    globalThis.fetch = async (_url, init) => {
      sentBody = String(init?.body || '')
      return {
        ok: true,
        json: async () => ({
          id: 'recall_log_1',
          sessionId: 'session_1',
          activity: decodeRecallActivityLogValue(JSON.parse(sentBody).activity),
          createdAt: '2026-05-25T00:00:00.000Z'
        })
      }
    }
    const repeatedText = '张元英保持沉默，观察车外警笛。'.repeat(500)
    const activity = {
      id: 'run_large',
      status: 'completed',
      events: Array.from({ length: 24 }, (_, index) => ({
        id: `event_${index}`,
        status: 'completed',
        output: { confirmed: [{ id: `unit_${index}`, title: '确认单位', contentText: repeatedText }] },
        metrics: { confirmedUnits: [{ id: `unit_${index}`, title: '确认单位', contentText: repeatedText }] }
      }))
    }

    try {
      const result = await createChatRecallActivityLogBySessionId('session_1', {
        speakerName: '星依',
        targetId: 'char_xingyi',
        activity
      })

      const payload = JSON.parse(sentBody)
      expect(isEncodedRecallActivityLogEnvelope(payload.activity)).toBe(true)
      expect(sentBody.length).toBeLessThan(JSON.stringify({ activity }).length / 2)
      expect(result.activity).toEqual(activity)
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})
