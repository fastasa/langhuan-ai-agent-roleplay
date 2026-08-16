import { beforeEach, describe, expect, it, vi } from 'vitest'

const { addHistoryMock } = vi.hoisted(() => ({
  addHistoryMock: vi.fn()
}))

vi.mock('../../../server/application/shared/dbUtils.js', () => ({
  addHistory: addHistoryMock
}))

import { createWorkspaceCharacterFacadeService } from '../../../server/application/workspace/workspaceCharacterFacadeService.js'
import { withDataScope } from '../../../server/localWorkspace.js'

describe('workspaceCharacterFacadeService', () => {
  beforeEach(() => {
    addHistoryMock.mockReset()
  })

  function createService(overrides = {}) {
    return createWorkspaceCharacterFacadeService(undefined, {
      resolveCharacterAvatarPath: vi.fn((id, value) => value ? `/${String(value).replace(/^\/+/, '')}` : `/avatars/${id}.png`),
      saveAvatarDataUri: vi.fn((dataUri, fileName) => `avatars/${fileName}.png`),
      ...overrides
    })
  }

  it('rejects invalid character payload before writing', () => {
    const service = createService({
      logger: { error: vi.fn() },
      characterRepository: {
        getCharacters: vi.fn(() => []),
        insertCharacter: vi.fn(),
        getCharacterById: vi.fn(),
        updateCharacter: vi.fn(),
        deleteCharacter: vi.fn()
      }
    })

    const result = service.addCharacter({ id: '', name: '' })

    expect(result.ok).toBe(false)
    expect(result.status).toBe(400)
  })

  it('routes workspace base writes through injected character repository', () => {
    const patchCharacterGroup = vi.fn()
    const patchGroup = vi.fn()
    const patchCrowd = vi.fn()
    const patchAlias = vi.fn()
    const service = createService({
      characterRepository: {
        getCharacters: vi.fn(() => []),
        insertCharacter: vi.fn(),
        getCharacterById: vi.fn(),
        updateCharacter: vi.fn(),
        deleteCharacter: vi.fn(),
        insertCharacterGroup: vi.fn(),
        patchCharacterGroup,
        deleteCharacterGroup: vi.fn(),
        insertGroup: vi.fn(),
        patchGroup,
        deleteGroup: vi.fn(),
        insertCrowd: vi.fn(),
        patchCrowd,
        deleteCrowd: vi.fn(),
        insertAlias: vi.fn(),
        patchAlias,
        deleteAlias: vi.fn(),
        patchUserProfile: vi.fn(),
        listCharacterAvatarPaths: vi.fn(() => []),
        updateCharacterAvatarPath: vi.fn()
      }
    })

    expect(service.updateCharacterGroup('group_1', { name: '同学', orderIndex: 2 }).ok).toBe(true)
    expect(patchCharacterGroup).toHaveBeenCalledWith('group_1', {
      name: '同学',
      order_index: 2
    })

    expect(service.updateGroup('chat_1', { members: ['a'], orderIndex: 5 }).ok).toBe(true)
    expect(patchGroup).toHaveBeenCalledWith('chat_1', {
      members: JSON.stringify(['a']),
      order_index: 5
    })

    expect(service.updateCrowd('crowd_1', { defaultPreset: 'warm' }).ok).toBe(true)
    expect(patchCrowd).toHaveBeenCalledWith('crowd_1', {
      default_preset: 'warm'
    })

    expect(service.updateAlias('alias_1', { affections: { dad: 100 } }).ok).toBe(true)
    expect(patchAlias).toHaveBeenCalledWith('alias_1', {
      affections: JSON.stringify({ dad: 100 })
    })
  })

  it('routes user profile updates through injected character repository', () => {
    const patchUserProfile = vi.fn()
    const service = createService({
      logger: { error: vi.fn() },
      characterRepository: {
        getCharacters: vi.fn(() => []),
        insertCharacter: vi.fn(),
        getCharacterById: vi.fn(),
        updateCharacter: vi.fn(),
        deleteCharacter: vi.fn(),
        insertCharacterGroup: vi.fn(),
        patchCharacterGroup: vi.fn(),
        deleteCharacterGroup: vi.fn(),
        insertGroup: vi.fn(),
        patchGroup: vi.fn(),
        deleteGroup: vi.fn(),
        insertCrowd: vi.fn(),
        patchCrowd: vi.fn(),
        deleteCrowd: vi.fn(),
        insertAlias: vi.fn(),
        patchAlias: vi.fn(),
        deleteAlias: vi.fn(),
        patchUserProfile,
        listCharacterAvatarPaths: vi.fn(() => []),
        updateCharacterAvatarPath: vi.fn()
      }
    })

    const result = service.updateUserProfile({ name: '星依', desc: '认真学习' })

    expect(result.ok).toBe(true)
    expect(patchUserProfile).toHaveBeenCalledWith({
      name: '星依',
      '"desc"': '认真学习'
    })
  })

  it('persists user profile data-uri avatar and returns the saved profile payload', () => {
    const patchUserProfile = vi.fn()
    const saveAvatarDataUri = vi.fn(() => 'avatars/user_profile_saved.png')
    const service = createService({
      saveAvatarDataUri,
      characterRepository: {
        getUserProfile: vi.fn(() => ({ name: '旧用户', avatarPath: 'avatars/old.png' })),
        patchUserProfile,
        listCharacterAvatarPaths: vi.fn(() => []),
        updateCharacterAvatarPath: vi.fn()
      }
    })

    const result = withDataScope({
      userId: 'ordinary-user',
      role: 'user',
      workspaceId: 'default'
    }, () => service.updateUserProfile({
      name: '用户',
      avatarPath: 'data:image/png;base64,AAAA',
      desc: '会刷新验证'
    }))

    expect(result.ok).toBe(true)
    expect(saveAvatarDataUri).toHaveBeenCalledWith('data:image/png;base64,AAAA', 'user_profile_local')
    expect(patchUserProfile).toHaveBeenCalledWith(expect.objectContaining({
      name: '用户',
      avatar_path: 'avatars/user_profile_saved.png',
      '"desc"': '会刷新验证'
    }))
    expect(result).toEqual(expect.objectContaining({
      ok: true,
      data: expect.objectContaining({
        ok: true,
        avatarPath: 'avatars/user_profile_saved.png'
      })
    }))
  })

  it('sends data-uri avatars through the governed upload ledger path', () => {
    const insertGroup = vi.fn()
    const saveAvatarDataUri = vi.fn(() => 'avatars/group_uploaded.png')
    const service = createService({
      saveAvatarDataUri,
      characterRepository: {
        getCharacters: vi.fn(() => []),
        insertGroup,
        listCharacterAvatarPaths: vi.fn(() => []),
        updateCharacterAvatarPath: vi.fn()
      }
    })

    const result = service.addGroup({
      id: 'group_1',
      name: '群聊',
      avatarPath: 'data:image/png;base64,AAAA',
      members: []
    })

    expect(result.ok).toBe(true)
    expect(saveAvatarDataUri).toHaveBeenCalledWith(
      'data:image/png;base64,AAAA',
      expect.stringMatching(/^group_\d+$/)
    )
    expect(insertGroup).toHaveBeenCalledWith('group_1', '群聊', '👥', 'avatars/group_uploaded.png', '[]', 0)
  })

  it('routes avatar path repair through injected character repository', () => {
    const updateCharacterAvatarPath = vi.fn()
    const service = createService({
      characterRepository: {
        getCharacters: vi.fn(() => []),
        insertCharacter: vi.fn(),
        getCharacterById: vi.fn(),
        updateCharacter: vi.fn(),
        deleteCharacter: vi.fn(),
        insertCharacterGroup: vi.fn(),
        patchCharacterGroup: vi.fn(),
        deleteCharacterGroup: vi.fn(),
        insertGroup: vi.fn(),
        patchGroup: vi.fn(),
        deleteGroup: vi.fn(),
        insertCrowd: vi.fn(),
        patchCrowd: vi.fn(),
        deleteCrowd: vi.fn(),
        insertAlias: vi.fn(),
        patchAlias: vi.fn(),
        deleteAlias: vi.fn(),
        patchUserProfile: vi.fn(),
        listCharacterAvatarPaths: vi.fn(() => [
          { id: 'char_1', avatar_path: 'avatars/char_1.jpg' }
        ]),
        updateCharacterAvatarPath
      }
    })

    service.repairCharacterAvatarPaths()

    expect(updateCharacterAvatarPath).toHaveBeenCalledWith('char_1', '/avatars/char_1.jpg')
  })

  it('preserves existing brain data when contact updates carry empty brain fields', () => {
    const updateCharacter = vi.fn()
    const service = createService({
      characterRepository: {
        getCharacters: vi.fn(() => []),
        insertCharacter: vi.fn(),
        getCharacterById: vi.fn(() => ({
          id: 'char_1',
          name: '惊雨',
          emoji: 'x',
          groupId: 'default',
          brainDocuments: '{"node_1":"正文"}',
          brainCognitionNodes: '[{"id":"node_1"}]',
          brainTraceNodes: '[{"id":"trace_1"}]'
        })),
        updateCharacter,
        deleteCharacter: vi.fn(),
        listCharacterAvatarPaths: vi.fn(() => []),
        updateCharacterAvatarPath: vi.fn()
      }
    })

    const result = service.updateCharacter('char_1', {
      groupId: 'group_1',
      brainDocuments: {},
      brainCognitionNodes: [],
      brainTraceNodes: []
    })

    expect(result.ok).toBe(true)
    const params = updateCharacter.mock.calls[0][1]
    expect(params[28]).toBe('{"node_1":"正文"}')
    expect(params[29]).toBe('[{"id":"node_1"}]')
    expect(params[30]).toBe('[{"id":"trace_1"}]')
  })

  it('allows explicit brain node clears from governed brain commands', () => {
    const updateCharacter = vi.fn()
    const service = createService({
      characterRepository: {
        getCharacters: vi.fn(() => []),
        insertCharacter: vi.fn(),
        getCharacterById: vi.fn(() => ({
          id: 'char_1',
          name: '惊雨',
          emoji: 'x',
          groupId: 'default',
          brainCognitionNodes: '[{"id":"node_1"}]',
          brainTraceNodes: '[{"id":"trace_1"}]'
        })),
        updateCharacter,
        deleteCharacter: vi.fn(),
        listCharacterAvatarPaths: vi.fn(() => []),
        updateCharacterAvatarPath: vi.fn()
      }
    })

    const result = service.updateCharacter('char_1', {
      __allowBrainClear: true,
      brainCognitionNodes: [],
      brainTraceNodes: []
    })

    expect(result.ok).toBe(true)
    const params = updateCharacter.mock.calls[0][1]
    expect(params[29]).toBe('[]')
    expect(params[30]).toBe('[]')
  })

  it('persists character reply pipeline override and retires legacy CAPS override', () => {
    const insertCharacter = vi.fn()
    const updateCharacter = vi.fn()
    const service = createService({
      characterRepository: {
        getCharacters: vi.fn(() => []),
        insertCharacter,
        getCharacterById: vi.fn(() => ({
          id: 'char_1',
          name: '惊雨',
          emoji: 'x',
          groupId: 'default',
          replyPipelineModeOverride: 'caps_network'
        })),
        updateCharacter,
        deleteCharacter: vi.fn(),
        listCharacterAvatarPaths: vi.fn(() => []),
        updateCharacterAvatarPath: vi.fn()
      }
    })

    expect(service.addCharacter({
      id: 'char_1',
      name: '惊雨',
      replyPipelineModeOverride: 'normal'
    }).ok).toBe(true)
    expect(insertCharacter.mock.calls[0][0][23]).toBe('normal_recall')

    expect(service.updateCharacter('char_1', { name: '惊雨' }).ok).toBe(true)
    expect(updateCharacter.mock.calls[0][1][22]).toBe('follow_session')
  })

  it('persists personality kernel as a derived character field', () => {
    const updateCharacter = vi.fn()
    const kernel = {
      characterId: 'char_1',
      version: 1,
      sourceTextHash: 'hash_a',
      stableSummary: '稳定摘要',
      guardDimensions: [],
      reactionPolicies: []
    }
    const service = createService({
      characterRepository: {
        getCharacters: vi.fn(() => []),
        insertCharacter: vi.fn(),
        getCharacterById: vi.fn(() => ({
          id: 'char_1',
          name: '惊雨',
          emoji: 'x',
          groupId: 'default'
        })),
        updateCharacter,
        deleteCharacter: vi.fn(),
        listCharacterAvatarPaths: vi.fn(() => []),
        updateCharacterAvatarPath: vi.fn()
      }
    })

    const result = service.updateCharacter('char_1', {
      personalityKernel: kernel
    })

    expect(result.ok).toBe(true)
    const params = updateCharacter.mock.calls[0][1]
    expect(params.at(-1)).toBe(JSON.stringify(kernel))
  })

  it('keeps empty personality kernel as an empty column value', () => {
    const insertCharacter = vi.fn()
    const service = createService({
      characterRepository: {
        getCharacters: vi.fn(() => []),
        insertCharacter,
        getCharacterById: vi.fn(),
        updateCharacter: vi.fn(),
        deleteCharacter: vi.fn(),
        listCharacterAvatarPaths: vi.fn(() => []),
        updateCharacterAvatarPath: vi.fn()
      }
    })

    const result = service.addCharacter({
      id: 'char_1',
      name: '惊雨'
    })

    expect(result.ok).toBe(true)
    const params = insertCharacter.mock.calls[0][0]
    expect(params.at(-1)).toBe('')
  })

  it('protects default character group from deletion', () => {
    const service = createService({
      characterRepository: {
        deleteCharacterGroup: vi.fn(),
        listCharacterAvatarPaths: vi.fn(() => []),
        updateCharacterAvatarPath: vi.fn()
      }
    })

    const result = service.deleteCharacterGroup('default')

    expect(result.ok).toBe(false)
    expect(result.status).toBe(400)
  })
})
