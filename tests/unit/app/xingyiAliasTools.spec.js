import { describe, expect, it, vi } from 'vitest'
import {
  createListAliasesTool,
  createReadUserProfileTool,
  createUpsertAliasTool,
  createDeleteAliasTool,
  createSwitchAliasTool,
  createXingyiAliasTools
} from '../../../src/app/xingyiAliasTools.ts'

/** 两个样例马甲：字段齐全的林小雨 + 只有 name/desc 的夜刃（覆盖空字段展示）。 */
function makeAliases() {
  return [
    { id: 'alias_1', name: '林小雨', gender: '女', age: '17', desc: '高中生侦探' },
    { id: 'alias_2', name: '夜刃', desc: '赏金猎人' }
  ]
}

function makeProvider(aliases = makeAliases(), boundAliasId = null) {
  return {
    getUserProfile: vi.fn(() => ({
      displayName: '沈一', name: '沈志雄', gender: '男', age: '22',
      appearance: '男，身高173，短黑发，深棕色眼睛。', desc: '用户资料简介', avatarPath: '/avatars/u.png'
    })),
    listAliases: vi.fn(() => aliases),
    createAlias: vi.fn(async () => {}),
    updateAlias: vi.fn(async () => {}),
    deleteAlias: vi.fn(async () => {}),
    bindSessionAlias: vi.fn(async () => {}),
    getActiveSessionBoundAliasId: vi.fn(() => boundAliasId)
  }
}

describe('readUserProfile（只读）', () => {
  it('区分用户昵称与角色扮演姓名，返回完整资料但不暴露头像路径', async () => {
    const provider = makeProvider()
    const result = await createReadUserProfileTool({ provider }).execute({ args: {} }, { turnIndex: 0 })
    expect(result.content).toContain('用户昵称：沈一')
    expect(result.content).toContain('角色扮演姓名：沈志雄')
    expect(result.content).toContain('外貌与身材：男，身高173')
    expect(result.content).toContain('头像：已设置')
    expect(result.content).not.toContain('/avatars/u.png')
  })
})

describe('listAliases（只读）', () => {
  it('digest：列出全部马甲摘要，并按 getActiveSessionBoundAliasId 三态显示当前会话身份', async () => {
    const aliases = makeAliases()

    // 三态①：绑定 alias_1 → 「当前会话身份：马甲「林小雨」」
    let provider = makeProvider(aliases, 'alias_1')
    let result = await createListAliasesTool({ provider }).execute({ args: {} }, { turnIndex: 0 })
    expect(result.status).not.toBe('error')
    expect(result.content).toContain('林小雨')
    expect(result.content).toContain('夜刃')
    expect(result.content).toContain('当前会话身份：马甲「林小雨」')

    // 三态②：绑定空串 → 默认身份
    provider = makeProvider(aliases, '')
    result = await createListAliasesTool({ provider }).execute({ args: {} }, { turnIndex: 0 })
    expect(result.content).toContain('默认身份')

    // 三态③：null → 没有打开中的会话
    provider = makeProvider(aliases, null)
    result = await createListAliasesTool({ provider }).execute({ args: {} }, { turnIndex: 0 })
    expect(result.content).toContain('没有打开中的会话')
  })

  it('detail（args.alias）：返回完整字段行，空字段显示（空）', async () => {
    const provider = makeProvider()
    const tool = createListAliasesTool({ provider })
    const result = await tool.execute({ args: { alias: '林小雨' } }, { turnIndex: 0 })
    expect(result.status).not.toBe('error')
    expect(result.content).toContain('性别：女')
    expect(result.content).toContain('年龄：17')
    expect(result.content).toContain('简介：高中生侦探')
    expect(result.content).toContain('外貌：（空）')
    expect(result.content).toContain('性格：（空）')
  })

  it('args.alias 不存在：status===error，content 列出现有马甲候选', async () => {
    const provider = makeProvider()
    const tool = createListAliasesTool({ provider })
    const result = await tool.execute({ args: { alias: '不存在' } }, { turnIndex: 0 })
    expect(result.status).toBe('error')
    expect(result.content).toContain('林小雨')
    expect(result.content).toContain('夜刃')
  })
})

describe('upsertAlias（写·confirmWrite 硬门）', () => {
  it('create 成功：confirmWrite 标题含新建马甲，createAlias 收到 id 前缀+name+各字段', async () => {
    const provider = makeProvider()
    const confirmWrite = vi.fn(async () => true)
    const tool = createUpsertAliasTool({ provider, confirmWrite })
    const result = await tool.execute(
      { args: { mode: 'create', name: '苍月', gender: '女', desc: '流浪法师' } },
      { turnIndex: 0 }
    )
    expect(result.status).not.toBe('error')
    expect(confirmWrite).toHaveBeenCalledTimes(1)
    expect(confirmWrite.mock.calls[0][0].title).toContain('新建马甲「苍月」')
    expect(provider.createAlias).toHaveBeenCalledTimes(1)
    const created = provider.createAlias.mock.calls[0][0]
    expect(created.id).toMatch(/^alias_/)
    expect(created.name).toBe('苍月')
    expect(created.gender).toBe('女')
    expect(created.desc).toBe('流浪法师')
    expect(result.content).toContain('已新建马甲')
  })

  it('create 未给 name/appearance：默认继承角色扮演姓名与用户外貌', async () => {
    const provider = makeProvider()
    const tool = createUpsertAliasTool({ provider, confirmWrite: vi.fn(async () => true) })
    const result = await tool.execute({ args: { mode: 'create', desc: '现代世界里的自己' } }, { turnIndex: 0 })
    expect(result.status).not.toBe('error')
    expect(provider.createAlias).toHaveBeenCalledWith(expect.objectContaining({
      name: '沈志雄',
      appearance: '男，身高173，短黑发，深棕色眼睛。'
    }))
  })

  it('create 撞同名（name=林小雨）：INVALID_ARGUMENT 提示改用 mode=update，不弹确认不写库', async () => {
    const provider = makeProvider()
    const confirmWrite = vi.fn(async () => true)
    const tool = createUpsertAliasTool({ provider, confirmWrite })
    const result = await tool.execute({ args: { mode: 'create', name: '林小雨' } }, { turnIndex: 0 })
    expect(result.status).toBe('error')
    expect(result.error.type).toBe('INVALID_ARGUMENT')
    expect(result.content).toContain('mode=update')
    expect(confirmWrite).not.toHaveBeenCalled()
    expect(provider.createAlias).not.toHaveBeenCalled()
  })

  it('update：alias=夜刃 只给 personality → updateAlias 只收到该字段', async () => {
    const provider = makeProvider()
    const confirmWrite = vi.fn(async () => true)
    const tool = createUpsertAliasTool({ provider, confirmWrite })
    const result = await tool.execute(
      { args: { mode: 'update', alias: '夜刃', personality: '冷酷寡言' } },
      { turnIndex: 0 }
    )
    expect(result.status).not.toBe('error')
    expect(provider.updateAlias).toHaveBeenCalledWith('alias_2', { personality: '冷酷寡言' })
  })

  it('update：name 给空串（清空名称）被拦截，不弹确认', async () => {
    const provider = makeProvider()
    const confirmWrite = vi.fn(async () => true)
    const tool = createUpsertAliasTool({ provider, confirmWrite })
    const result = await tool.execute({ args: { mode: 'update', alias: '夜刃', name: '' } }, { turnIndex: 0 })
    expect(result.status).toBe('error')
    expect(result.content).toContain('名称不能清空')
    expect(confirmWrite).not.toHaveBeenCalled()
  })

  it('validateArgs：create 可缺 name（由用户资料默认）/ update 缺 alias或字段 / mode 非法会拦截', () => {
    const provider = makeProvider()
    const tool = createUpsertAliasTool({ provider, confirmWrite: vi.fn(async () => true) })
    expect(tool.validateArgs({ mode: 'create' })).toBeNull()
    expect(tool.validateArgs({ mode: 'update', personality: 'x' })).toContain('alias')
    expect(tool.validateArgs({ mode: 'update', alias: '夜刃' })).toContain('字段')
    expect(tool.validateArgs({ mode: 'other' })).toContain('mode')
    expect(tool.validateArgs({ mode: 'create', name: '苍月' })).toBeNull()
  })

  it('confirmWrite 缺失：status===error，content 含确认通道未接入，不写库', async () => {
    const provider = makeProvider()
    const tool = createUpsertAliasTool({ provider })
    const result = await tool.execute({ args: { mode: 'create', name: '苍月' } }, { turnIndex: 0 })
    expect(result.status).toBe('error')
    expect(result.content).toContain('确认通道未接入')
    expect(provider.createAlias).not.toHaveBeenCalled()
  })

  it('用户取消（confirmWrite 返回 false）：非 error 成功态，content 含取消，createAlias 未被调用', async () => {
    const provider = makeProvider()
    const confirmWrite = vi.fn(async () => false)
    const tool = createUpsertAliasTool({ provider, confirmWrite })
    const result = await tool.execute({ args: { mode: 'create', name: '苍月' } }, { turnIndex: 0 })
    expect(result.status).not.toBe('error')
    expect(result.content).toContain('取消')
    expect(provider.createAlias).not.toHaveBeenCalled()
  })

  it('用户提交修改意见：本次不写库，意见原样回给星依继续修订', async () => {
    const provider = makeProvider()
    const confirmWrite = vi.fn(async () => ({ status: 'answered', answer: '名字改成阿雄，外貌保持不变' }))
    const tool = createUpsertAliasTool({ provider, confirmWrite })
    const result = await tool.execute({ args: { mode: 'create', name: '苍月' } }, { turnIndex: 0 })
    expect(result.status).not.toBe('error')
    expect(result.content).toContain('名字改成阿雄')
    expect(result.details).toMatchObject({ needsRevision: true })
    expect(provider.createAlias).not.toHaveBeenCalled()
  })
})

describe('deleteAlias（写·confirmWrite 硬门）', () => {
  it('成功：confirmWrite 标题含删除马甲、行含不可恢复；deleteAlias 收到目标 id', async () => {
    const provider = makeProvider()
    const confirmWrite = vi.fn(async () => true)
    const tool = createDeleteAliasTool({ provider, confirmWrite })
    const result = await tool.execute({ args: { alias: '夜刃' } }, { turnIndex: 0 })
    expect(result.status).not.toBe('error')
    expect(confirmWrite).toHaveBeenCalledTimes(1)
    const request = confirmWrite.mock.calls[0][0]
    expect(request.title).toContain('删除马甲')
    expect(request.lines.join('\n')).toContain('不可恢复')
    expect(provider.deleteAlias).toHaveBeenCalledWith('alias_2')
  })

  it('alias 解析失败：status===error，content 带候选，不写库', async () => {
    const provider = makeProvider()
    const confirmWrite = vi.fn(async () => true)
    const tool = createDeleteAliasTool({ provider, confirmWrite })
    const result = await tool.execute({ args: { alias: '不存在' } }, { turnIndex: 0 })
    expect(result.status).toBe('error')
    expect(result.content).toContain('林小雨')
    expect(result.content).toContain('夜刃')
    expect(provider.deleteAlias).not.toHaveBeenCalled()
  })
})

describe('switchAlias（写·confirmWrite 硬门）', () => {
  it('活动会话切马甲：不给 session 走 getSessionContext，bindSessionAlias 收到会话 id 与马甲 id', async () => {
    const provider = makeProvider()
    const confirmWrite = vi.fn(async () => true)
    const getSessionContext = vi.fn(() => ({ sessionId: 's1', sessionTitle: '测试会话', characterOptions: [] }))
    const tool = createSwitchAliasTool({ provider, confirmWrite, getSessionContext })
    const result = await tool.execute({ args: { alias: '林小雨' } }, { turnIndex: 0 })
    expect(result.status).not.toBe('error')
    expect(getSessionContext).toHaveBeenCalled()
    expect(provider.bindSessionAlias).toHaveBeenCalledWith('s1', 'alias_1')
    expect(result.content).toContain('测试会话')
    expect(result.content).toContain('林小雨')
  })

  it('useDefault=true：bindSessionAlias 收到空串，确认卡与结果都含默认身份', async () => {
    const provider = makeProvider()
    const confirmWrite = vi.fn(async () => true)
    const getSessionContext = vi.fn(() => ({ sessionId: 's1', sessionTitle: '测试会话', characterOptions: [] }))
    const tool = createSwitchAliasTool({ provider, confirmWrite, getSessionContext })
    const result = await tool.execute({ args: { useDefault: true } }, { turnIndex: 0 })
    expect(result.status).not.toBe('error')
    expect(provider.bindSessionAlias).toHaveBeenCalledWith('s1', '')
    expect(confirmWrite.mock.calls[0][0].lines.join('\n')).toContain('默认身份')
    expect(result.content).toContain('默认身份')
  })

  it('validateArgs：alias 与 useDefault 都缺 / 都给 时拦截，任一单给放行', () => {
    const provider = makeProvider()
    const tool = createSwitchAliasTool({ provider, confirmWrite: vi.fn(async () => true) })
    expect(tool.validateArgs({})).toBeTruthy()
    expect(tool.validateArgs({ alias: '林小雨', useDefault: true })).toBeTruthy()
    expect(tool.validateArgs({ alias: '林小雨' })).toBeNull()
    expect(tool.validateArgs({ useDefault: true })).toBeNull()
  })

  it('给 session 参数：resolveSessionContext 被调用并用其返回的 sessionId；解析不到给 error 含没有找到会话', async () => {
    const provider = makeProvider()
    const confirmWrite = vi.fn(async () => true)
    const resolveSessionContext = vi.fn(async (identifier) => (
      identifier === '目标会话' ? { sessionId: 's2', sessionTitle: '目标会话', characterOptions: [] } : null
    ))
    const tool = createSwitchAliasTool({ provider, confirmWrite, resolveSessionContext })

    const result = await tool.execute({ args: { alias: '林小雨', session: '目标会话' } }, { turnIndex: 0 })
    expect(result.status).not.toBe('error')
    expect(resolveSessionContext).toHaveBeenCalledWith('目标会话')
    expect(provider.bindSessionAlias).toHaveBeenCalledWith('s2', 'alias_1')

    const missResult = await tool.execute({ args: { alias: '林小雨', session: '不存在的会话' } }, { turnIndex: 0 })
    expect(missResult.status).toBe('error')
    expect(missResult.content).toContain('没有找到会话')
  })

  it('无活动会话（getSessionContext 返回 null 且不给 session）：非 error，content 含没有打开中的会话', async () => {
    const provider = makeProvider()
    const confirmWrite = vi.fn(async () => true)
    const getSessionContext = vi.fn(() => null)
    const tool = createSwitchAliasTool({ provider, confirmWrite, getSessionContext })
    const result = await tool.execute({ args: { alias: '林小雨' } }, { turnIndex: 0 })
    expect(result.status).not.toBe('error')
    expect(result.content).toContain('没有打开中的会话')
    expect(confirmWrite).not.toHaveBeenCalled()
    expect(provider.bindSessionAlias).not.toHaveBeenCalled()
  })

  it('confirmWrite 返回 false：bindSessionAlias 未被调用', async () => {
    const provider = makeProvider()
    const confirmWrite = vi.fn(async () => false)
    const getSessionContext = vi.fn(() => ({ sessionId: 's1', sessionTitle: '测试会话', characterOptions: [] }))
    const tool = createSwitchAliasTool({ provider, confirmWrite, getSessionContext })
    const result = await tool.execute({ args: { alias: '林小雨' } }, { turnIndex: 0 })
    expect(result.status).not.toBe('error')
    expect(result.content).toContain('取消')
    expect(provider.bindSessionAlias).not.toHaveBeenCalled()
  })
})

describe('createXingyiAliasTools（用户资料读取 + 马甲四件套装配）', () => {
  it('五件工具齐全且命名稳定（浮坞 aliasManage 接缝装配口径）', () => {
    const provider = makeProvider()
    const tools = createXingyiAliasTools({ provider, confirmWrite: vi.fn(async () => true) })
    expect(tools.map((tool) => tool.name)).toEqual(['readUserProfile', 'listAliases', 'upsertAlias', 'deleteAlias', 'switchAlias'])
    for (const tool of tools) expect(tool.schema).toBeTruthy()
  })
})
