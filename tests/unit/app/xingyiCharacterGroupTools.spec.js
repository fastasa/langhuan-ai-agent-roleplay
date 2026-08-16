/** @vitest-environment node */
import { describe, expect, it, vi } from 'vitest'
import {
  createAssignCharactersToGroupTool,
  createCreateCharacterGroupTool,
  createDeleteCharacterGroupTool,
  createListCharacterGroupsTool,
  createMoveCharacterGroupTool,
  createRenameCharacterGroupTool
} from '../../../src/app/xingyiCharacterGroupTools'

function makeContext(overrides = {}) {
  const groups = [
    { id: 'default', name: '默认', orderIndex: 0 },
    { id: 'friends', name: '朋友', orderIndex: 1 },
    { id: 'work', name: '同事', orderIndex: 2 }
  ]
  const characters = [
    { id: 'c1', name: '星依', groupId: 'default' },
    { id: 'c2', name: '惊雨', groupId: 'friends' },
    { id: 'c3', name: '小满', groupId: 'friends' }
  ]
  return {
    provider: {
      listGroups: () => groups,
      listCharacters: () => characters,
      createGroup: vi.fn(async () => {}),
      updateGroup: vi.fn(async () => {}),
      deleteGroup: vi.fn(async () => {}),
      assignCharacters: vi.fn(async () => {}),
      moveGroup: vi.fn(async () => {}),
      ...overrides.provider
    },
    confirmWrite: Object.prototype.hasOwnProperty.call(overrides, 'confirmWrite')
      ? overrides.confirmWrite
      : vi.fn(async () => true)
  }
}

describe('xingyiCharacterGroupTools', () => {
  it('列出全部组名/id和组内角色名/id，也保留空组', async () => {
    const result = await createListCharacterGroupsTool(makeContext()).execute({ args: {} })
    expect(result.content).toContain('默认（groupId=default')
    expect(result.content).toContain('星依（id=c1）')
    expect(result.content).toContain('朋友（groupId=friends')
    expect(result.content).toContain('惊雨（id=c2）')
    expect(result.content).toContain('同事（groupId=work，0 个角色）')
    expect(result.content).toContain('（空组）')
  })

  it('创建组走确认门并生成稳定前缀 id', async () => {
    const ctx = makeContext()
    const result = await createCreateCharacterGroupTool(ctx).execute({ args: { name: '家人' } })
    expect(ctx.confirmWrite).toHaveBeenCalledOnce()
    expect(ctx.provider.createGroup).toHaveBeenCalledOnce()
    const created = ctx.provider.createGroup.mock.calls[0][0]
    expect(created.name).toBe('家人')
    expect(created.id).toMatch(/^character_group_/)
    expect(result.content).toContain('已创建')
  })

  it('拒绝同名组，不进入确认和写入', async () => {
    const ctx = makeContext()
    const result = await createCreateCharacterGroupTool(ctx).execute({ args: { name: '朋友' } })
    expect(result.error?.type).toBe('INVALID_ARGUMENT')
    expect(ctx.confirmWrite).not.toHaveBeenCalled()
    expect(ctx.provider.createGroup).not.toHaveBeenCalled()
  })

  it('按组 id 重命名并拒绝重名', async () => {
    const ctx = makeContext()
    await createRenameCharacterGroupTool(ctx).execute({ args: { group: 'friends', name: '挚友' } })
    expect(ctx.provider.updateGroup).toHaveBeenCalledWith('friends', { name: '挚友' })

    const duplicate = await createRenameCharacterGroupTool(ctx).execute({ args: { group: 'friends', name: '同事' } })
    expect(duplicate.error?.type).toBe('INVALID_ARGUMENT')
  })

  it('默认组不可删除，普通组删除回执声明释放成员', async () => {
    const ctx = makeContext()
    const rejected = await createDeleteCharacterGroupTool(ctx).execute({ args: { group: 'default' } })
    expect(rejected.content).toContain('不可删除')
    expect(ctx.provider.deleteGroup).not.toHaveBeenCalled()

    const deleted = await createDeleteCharacterGroupTool(ctx).execute({ args: { group: '朋友' } })
    expect(ctx.provider.deleteGroup).toHaveBeenCalledWith('friends')
    expect(deleted.content).toContain('2 个组内角色已移回默认组')
  })

  it('批量按角色名/id跨组移动，并跳过已在目标组的角色', async () => {
    const ctx = makeContext()
    const result = await createAssignCharactersToGroupTool(ctx).execute({
      args: { characters: ['星依', 'c2'], group: '朋友' }
    })
    expect(ctx.provider.assignCharacters).toHaveBeenCalledWith(['c1'], 'friends')
    expect(result.content).toContain('1 个角色')
  })

  it('移回 default 与分组排序都走正式 provider', async () => {
    const ctx = makeContext()
    await createAssignCharactersToGroupTool(ctx).execute({ args: { characters: ['惊雨'], group: 'default' } })
    expect(ctx.provider.assignCharacters).toHaveBeenCalledWith(['c2'], 'default')

    await createMoveCharacterGroupTool(ctx).execute({ args: { group: '朋友', direction: 'down' } })
    expect(ctx.provider.moveGroup).toHaveBeenCalledWith('friends', 1)
  })

  it('缺确认通道时所有写操作硬拒绝', async () => {
    const ctx = makeContext({ confirmWrite: null })
    const result = await createCreateCharacterGroupTool(ctx).execute({ args: { name: '家人' } })
    expect(result.status).toBe('error')
    expect(ctx.provider.createGroup).not.toHaveBeenCalled()
  })
})
