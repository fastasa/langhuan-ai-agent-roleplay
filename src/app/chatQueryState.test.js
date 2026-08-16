import { describe, expect, it } from 'vitest'
import { createChatQueryState } from './chatQueryState.ts'

const box = (value) => ({ value })
const normalizeTargetId = (targetId) => String(targetId || '').trim()

describe('createChatQueryState', () => {
  it('reads the active session from session state instead of target lookup', () => {
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
    const queryState = createChatQueryState({
      currentChatTarget: box('char_zhang'),
      workspaceCurrentTarget: box('char_zhang'),
      currentSession: box(currentSingleSession),
      sessionMessagesCache: box({}),
      pendingPersistedMessages: box({}),
      localStreamingMessages: box({}),
      chatSessions: box({
        [legacyDualSession.id]: legacyDualSession,
        [currentSingleSession.id]: currentSingleSession
      }),
      normalizeTargetId,
      normalizeMessageForTarget: (_targetId, message) => message
    })

    const currentSession = queryState.getCurrentSession()

    expect(currentSession?.id).toBe('session_new_single')
    expect(currentSession?.participants).toHaveLength(1)
  })
})
