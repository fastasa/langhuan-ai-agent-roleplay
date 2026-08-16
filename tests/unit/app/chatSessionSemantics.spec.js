import { describe, expect, it } from 'vitest'
import { normalizeChatSession, resolveChatSessionTargetId } from '../../../src/repositories/chatRepository.ts'
import { resolveChatSessionByTargetId } from '../../../src/app/chatCurrentState.ts'

describe('chat session semantics', () => {
  it('保留 session.id，同时单独规范 targetId', () => {
    const session = normalizeChatSession({
      id: 'session_42',
      target_id: 'group_group_team_1',
      target_type: 'group',
      loaded_summary_ids: []
    })

    expect(session.id).toBe('session_42')
    expect(session.target_id).toBe('group_team_1')
    expect(session.targetId).toBe('group_team_1')
  })

  it('按 targetId 查找当前会话时不会再把 session.id 当成 targetId', () => {
    const session = normalizeChatSession({
      id: 'session_42',
      target_id: 'char_1',
      target_type: 'character',
      loaded_summary_ids: []
    })

    const resolved = resolveChatSessionByTargetId({
      targetId: 'char_1',
      currentChatTarget: '',
      workspaceCurrentTarget: '',
      currentSession: null,
      chatSessions: {
        session_42: session
      },
      normalizeTargetId: (value) => String(value || '')
    })

    expect(resolveChatSessionTargetId(resolved)).toBe('char_1')
    expect(resolved?.id).toBe('session_42')
  })

  it('旧地点镜像带层级分隔符时会回填为三段地点', () => {
    const session = normalizeChatSession({
      id: 'session_legacy_location',
      target_id: 'char_1',
      target_type: 'character',
      virtualLocation: '维斯珂 / 博瑞利尔 / 柜台后',
      loaded_summary_ids: []
    })

    expect(session.virtualLocationLarge).toBe('维斯珂')
    expect(session.virtualLocationMiddle).toBe('博瑞利尔')
    expect(session.virtualLocationSmall).toBe('柜台后')
    expect(session.virtualLocation).toBe('维斯珂 / 博瑞利尔 / 柜台后')
  })
})
