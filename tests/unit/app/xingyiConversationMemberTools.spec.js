/** @vitest-environment node */
import { describe, expect, it, vi } from 'vitest'
import {
  createXingyiAddCharactersToConversationTool,
  createXingyiConversationMemberTools,
  createXingyiCreateCharacterVersionTool,
  createXingyiListCharacterVersionsTool,
  createXingyiRemoveCharactersFromConversationTool,
  createXingyiSetConversationMemberProbabilitiesTool,
  createXingyiSwitchConversationCharacterVersionTool
} from '../../../src/app/xingyiConversationMemberTools.ts'

function buildContext(overrides = {}) {
  let members = [
    {
      participantId: 'p1', characterId: 'char_1', name: '惊雨', displayOrder: 0, replyProbability: 80,
      role: 'member', characterStateMode: 'independent_snapshot', characterBranchId: 'branch_1'
    },
    {
      participantId: 'p2', characterId: 'char_2', name: '奥黛丽', displayOrder: 1, replyProbability: 40,
      role: 'member', characterStateMode: 'follow_main', characterBranchId: ''
    }
  ]
  let versions = [
    { id: 'snap_1', characterId: 'char_1', label: '初遇', snapshotKind: 'manual', activeBranchCount: 0, createdAt: '2026-07-01T00:00:00.000Z' }
  ]
  const provider = {
    listCharacters: () => [
      { id: 'char_1', name: '惊雨' },
      { id: 'char_2', name: '奥黛丽' },
      { id: 'char_3', name: '弥生' }
    ],
    readMembers: vi.fn(async () => members.map((item) => ({ ...item }))),
    replaceMembers: vi.fn(async (_sessionId, next) => { members = next.map((item) => ({ ...item })) }),
    listCharacterVersions: vi.fn(async () => versions.map((item) => ({ ...item }))),
    createCharacterVersion: vi.fn(async (characterId, label) => {
      const version = {
        id: 'snap_new', characterId, label: label || '手工快照', snapshotKind: 'manual', activeBranchCount: 0,
        createdAt: '2026-07-22T00:00:00.000Z'
      }
      versions = [version, ...versions]
      return version
    }),
    ...overrides.provider
  }
  return {
    provider,
    getSessionContext: () => ({
      sessionId: 'session_1', sessionTitle: '雨夜茶会',
      characterOptions: members.map((item) => ({ id: item.characterId, name: item.name, participantId: item.participantId }))
    }),
    confirmWrite: Object.prototype.hasOwnProperty.call(overrides, 'confirmWrite')
      ? overrides.confirmWrite
      : vi.fn(async () => true),
    readState: () => ({ members, versions })
  }
}

describe('星依会话角色管理工具', () => {
  it('统一装配成员增删、概率和版本五类能力', () => {
    expect(createXingyiConversationMemberTools(buildContext()).map((tool) => tool.name)).toEqual([
      'addCharactersToConversation',
      'removeCharactersFromConversation',
      'setConversationMemberProbabilities',
      'listCharacterVersions',
      'createCharacterVersion',
      'switchConversationCharacterVersion'
    ])
  })

  it('批量加入时只确认一次，并保留原成员的概率与独立分支', async () => {
    const ctx = buildContext()
    const tool = createXingyiAddCharactersToConversationTool(ctx)
    const result = await tool.execute({ args: {
      characters: ['弥生', '奥黛丽'], probabilities: [{ character: '弥生', probability: 25 }]
    } }, { turnIndex: 0 })

    expect(result.status).not.toBe('error')
    expect(ctx.confirmWrite).toHaveBeenCalledOnce()
    expect(ctx.provider.replaceMembers).toHaveBeenCalledOnce()
    expect(ctx.readState().members).toEqual([
      expect.objectContaining({ characterId: 'char_1', replyProbability: 80, characterBranchId: 'branch_1' }),
      expect.objectContaining({ characterId: 'char_2', replyProbability: 40 }),
      expect.objectContaining({ characterId: 'char_3', replyProbability: 25, characterStateMode: 'follow_main' })
    ])
    expect(result.details.skippedCharacterIds).toEqual(['char_2'])
  })

  it('移出独立副本成员时在确认卡警示分支删除，但保留角色和历史消息语义', async () => {
    const ctx = buildContext()
    const result = await createXingyiRemoveCharactersFromConversationTool(ctx).execute({ args: {
      characters: ['惊雨']
    } }, { turnIndex: 0 })

    expect(result.status).not.toBe('error')
    expect(ctx.confirmWrite.mock.calls[0][0].lines.join('\n')).toContain('独立副本分支')
    expect(ctx.readState().members.map((item) => item.characterId)).toEqual(['char_2'])
    expect(result.details.deletedIndependentBranchCharacterIds).toEqual(['char_1'])
    expect(result.content).toContain('角色主资料与历史消息仍保留')
  })

  it('禁止移出最后一名正式角色', async () => {
    const ctx = buildContext({
      provider: {
        readMembers: vi.fn(async () => [{
          participantId: 'p1', characterId: 'char_1', name: '惊雨', displayOrder: 0, replyProbability: 100,
          role: 'member', characterStateMode: 'follow_main', characterBranchId: ''
        }])
      }
    })
    const result = await createXingyiRemoveCharactersFromConversationTool(ctx).execute({ args: {
      characters: ['惊雨']
    } }, { turnIndex: 0 })
    expect(result.status).toBe('error')
    expect(result.content).toContain('至少保留一名')
    expect(ctx.confirmWrite).not.toHaveBeenCalled()
    expect(ctx.provider.replaceMembers).not.toHaveBeenCalled()
  })

  it('批量发言概率允许设置为 0，并保持未列出成员原值', async () => {
    const ctx = buildContext()
    const result = await createXingyiSetConversationMemberProbabilitiesTool(ctx).execute({ args: {
      probabilities: [
        { character: '惊雨', probability: 0 },
        { character: '奥黛丽', probability: 65 }
      ]
    } }, { turnIndex: 0 })

    expect(result.status).not.toBe('error')
    expect(ctx.readState().members).toEqual([
      expect.objectContaining({ characterId: 'char_1', replyProbability: 0 }),
      expect.objectContaining({ characterId: 'char_2', replyProbability: 65 })
    ])
    expect(ctx.confirmWrite.mock.calls[0][0].lines).toEqual(['惊雨：80% → 0%', '奥黛丽：40% → 65%'])
  })

  it('能列出版本并为角色当前主线创建手工版本', async () => {
    const ctx = buildContext()
    const listed = await createXingyiListCharacterVersionsTool(ctx).execute({ args: { character: '惊雨' } }, { turnIndex: 0 })
    expect(listed.content).toContain('初遇')
    expect(listed.content).toContain('snap_1')

    const created = await createXingyiCreateCharacterVersionTool(ctx).execute({ args: {
      character: '惊雨', label: '雨夜之后'
    } }, { turnIndex: 0 })
    expect(created.status).not.toBe('error')
    expect(ctx.provider.createCharacterVersion).toHaveBeenCalledWith('char_1', '雨夜之后')
    expect(created.details.version.id).toBe('snap_new')
  })

  it('按快照切换会话独立副本，并可切回跟随主线', async () => {
    const ctx = buildContext()
    const toSnapshot = await createXingyiSwitchConversationCharacterVersionTool(ctx).execute({ args: {
      character: '惊雨', mode: 'snapshot', version: '初遇'
    } }, { turnIndex: 0 })
    expect(toSnapshot.status).not.toBe('error')
    expect(ctx.readState().members[0]).toMatchObject({
      characterId: 'char_1', characterStateMode: 'independent_snapshot', sourceSnapshotId: 'snap_1'
    })

    const toMain = await createXingyiSwitchConversationCharacterVersionTool(ctx).execute({ args: {
      character: '惊雨', mode: 'follow_main'
    } }, { turnIndex: 0 })
    expect(toMain.status).not.toBe('error')
    expect(ctx.confirmWrite.mock.calls[1][0].lines.join('\n')).toContain('无法恢复')
    expect(ctx.readState().members[0]).toMatchObject({
      characterId: 'char_1', characterStateMode: 'follow_main', characterBranchId: '', sourceSnapshotId: ''
    })
  })
})
