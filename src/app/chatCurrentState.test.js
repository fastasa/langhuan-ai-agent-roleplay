import { describe, expect, it } from 'vitest'
import { resolveChatSessionByTargetId } from './chatCurrentState.ts'

const normalizeTargetId = (targetId) => String(targetId || '').trim()

describe('resolveChatSessionByTargetId', () => {
  it('prefers the active session when multiple sessions share the same target', () => {
    const legacyDualSession = {
      id: 'char_zhang',
      targetId: 'char_zhang',
      target_id: 'char_zhang',
      conversationAvatarPath: 'avatars/old-dual.png',
      participants: [
        { participantTargetId: 'char_zhang', participant_target_id: 'char_zhang', participantType: 'char', participant_type: 'char' },
        { participantTargetId: 'char_xueyun', participant_target_id: 'char_xueyun', participantType: 'char', participant_type: 'char' }
      ]
    }
    const currentSingleSession = {
      id: 'session_new_single',
      targetId: 'char_zhang',
      target_id: 'char_zhang',
      conversationAvatarPath: '',
      participants: [
        { participantTargetId: 'char_zhang', participant_target_id: 'char_zhang', participantType: 'char', participant_type: 'char' }
      ]
    }

    const resolved = resolveChatSessionByTargetId({
      targetId: 'char_zhang',
      currentChatTarget: 'char_zhang',
      workspaceCurrentTarget: 'char_zhang',
      currentSession: currentSingleSession,
      chatSessions: {
        [legacyDualSession.id]: legacyDualSession,
        [currentSingleSession.id]: currentSingleSession
      },
      normalizeTargetId
    })

    expect(resolved?.id).toBe('session_new_single')
    expect(resolved?.participants).toHaveLength(1)
    expect(resolved?.conversationAvatarPath).toBe('')
  })
})
