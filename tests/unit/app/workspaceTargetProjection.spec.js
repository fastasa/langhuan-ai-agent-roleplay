import { describe, expect, it, vi } from 'vitest'
import { createWorkspaceTargetProjection } from '../../../src/app/workspaceTargetProjection.js'

describe('workspace target projection', () => {
  it('prefers the snapshot workspace target before falling back to session order', () => {
    const projection = createWorkspaceTargetProjection({
      chatStore: {
        getWorkspaceCurrentTarget: () => ''
      },
      charStore: {
        characters: [{ id: 'char_current' }, { id: 'char_server' }],
        groups: [],
        crowds: []
      }
    })

    const targetId = projection.pickBootstrapTarget({
      workspaceTarget: 'char_current',
      chatSessions: [{ id: 'char_server', target_id: 'char_server' }]
    }, 'char_server')

    expect(targetId).toBe('char_current')
  })

  it('prefers the remembered current target when it is still valid', () => {
    const projection = createWorkspaceTargetProjection({
      chatStore: {
        getWorkspaceCurrentTarget: () => ''
      },
      charStore: {
        characters: [{ id: 'char_server' }],
        groups: [{ id: 'team_1' }],
        crowds: [{ id: 'crowd_1' }]
      }
    })

    const targetId = projection.pickBootstrapTarget({
      chatSessions: [{ id: 'char_server', target_id: 'char_server' }]
    }, 'group_team_1')

    expect(targetId).toBe('group_team_1')
  })

  it('uses the remembered target only when the snapshot target is unavailable', () => {
    const projection = createWorkspaceTargetProjection({
      chatStore: {
        getWorkspaceCurrentTarget: () => '',
        switchChat: vi.fn(async () => {})
      },
      charStore: {
        characters: [{ id: 'char_local' }],
        groups: [],
        crowds: []
      }
    })

    const targetId = projection.pickBootstrapTarget({
      chatSessions: [{ id: 'char_local', target_id: 'char_local' }]
    }, 'char_missing')

    expect(targetId).toBe('char_local')
  })

  it('restores the selected target through the chat switch entry', async () => {
    const switchChat = vi.fn(async () => {})
    const projection = createWorkspaceTargetProjection({
      chatStore: {
        getWorkspaceCurrentTarget: () => '',
        switchChat
      },
      charStore: {
        characters: [{ id: 'char_1' }],
        groups: [],
        crowds: []
      }
    })

    await projection.restoreBootstrapTarget({
      chatSessions: [{ id: 'char_1', target_id: 'char_1' }]
    }, '')

    expect(switchChat).toHaveBeenCalledWith('char_1')
  })

  it('restores the selected session before falling back to target selection', async () => {
    const switchChat = vi.fn(async () => {})
    const switchSession = vi.fn(async () => {})
    const projection = createWorkspaceTargetProjection({
      chatStore: {
        getWorkspaceCurrentTarget: () => '',
        switchChat,
        switchSession
      },
      charStore: {
        characters: [{ id: 'char_1' }],
        groups: [],
        crowds: []
      }
    })

    await projection.restoreBootstrapTarget({
      workspaceTarget: 'char_1',
      workspaceSessionId: 'session_2',
      chatSessions: [
        { id: 'session_1', target_id: 'char_1' },
        { id: 'session_2', target_id: 'char_1' }
      ]
    }, '')

    expect(switchSession).toHaveBeenCalledWith('session_2')
    expect(switchChat).not.toHaveBeenCalled()
  })

  it('会优先读取聊天分组入口里的工作区当前目标', () => {
    const projection = createWorkspaceTargetProjection({
      chatStore: {
        current: {
          getWorkspaceCurrentTarget: () => 'char_grouped'
        },
        getWorkspaceCurrentTarget: () => ''
      },
      charStore: {
        characters: [{ id: 'char_grouped' }],
        groups: [],
        crowds: []
      }
    })

    const targetId = projection.pickBootstrapTarget({
      chatSessions: []
    }, '')

    expect(targetId).toBe('char_grouped')
  })
})
