// 地图严谨协作与运行卡计划批2·星依「派采风」工具回归：session 三态解析（当前活动会话/显式指定/未接入未定位）
// + dispatch 执行转发 + acted 修正位透传（与派绘舆 xingyiMapDispatchTools.spec.js 同构）。
import { describe, expect, it, vi } from 'vitest'
import { createXingyiDispatchResearchTool } from '../../../src/app/xingyiResearchDispatchTools.ts'

const SESSION = { sessionId: 'session_1', sessionTitle: '午后茶会', characterOptions: [{ id: 'char_1', name: '薇尔莉特' }] }

function callArgs(overrides = {}) {
  return { task: '查元英的佩剑来历', instructions: '查佩剑名字与来历，以文档库或角色大脑有明确出处为准', ...overrides }
}

describe('createXingyiDispatchResearchTool（星依派采风·地图严谨协作与运行卡计划批2）', () => {
  it('validateArgs：缺 task/instructions 报错', () => {
    const tool = createXingyiDispatchResearchTool({ dispatch: vi.fn() })
    expect(tool.validateArgs({ instructions: 'x' })).toMatch(/task/)
    expect(tool.validateArgs({ task: 'x' })).toMatch(/instructions/)
    expect(tool.validateArgs(callArgs())).toBeNull()
  })

  it('没有活动会话、也没给 session 参数：报错如实说明，不调用 dispatch', async () => {
    const dispatch = vi.fn()
    const tool = createXingyiDispatchResearchTool({ dispatch })
    const result = await tool.execute({ args: callArgs() })
    expect(result.status).toBe('error')
    expect(result.content).toContain('listChatContacts')
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('给了 session 参数但 resolveSessionContext 未接入：报错，不调用 dispatch', async () => {
    const dispatch = vi.fn()
    const tool = createXingyiDispatchResearchTool({ dispatch })
    const result = await tool.execute({ args: callArgs({ session: '午后茶会' }) })
    expect(result.status).toBe('error')
    expect(result.content).toContain('未接入')
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('resolveSessionContext 解析不到目标会话：报错，不调用 dispatch', async () => {
    const dispatch = vi.fn()
    const resolveSessionContext = vi.fn(async () => null)
    const tool = createXingyiDispatchResearchTool({ dispatch, resolveSessionContext })
    const result = await tool.execute({ args: callArgs({ session: '不存在的对话' }) })
    expect(result.status).toBe('error')
    expect(result.content).toContain('没有找到会话')
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('缺省（不给 session）：走 getSessionContext 当前活动会话，把完整上下文转发给 dispatch', async () => {
    const dispatch = vi.fn(async () => ({
      content: '采风任务已交稿',
      ok: true,
      details: { coverage: [{ item: '佩剑来历', status: 'found' }] }
    }))
    const tool = createXingyiDispatchResearchTool({ dispatch, getSessionContext: () => SESSION })
    const result = await tool.execute({ args: callArgs() })
    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(dispatch.mock.calls[0][0]).toEqual(SESSION)
    expect(dispatch.mock.calls[0][1]).toMatchObject({ task: '查元英的佩剑来历' })
    expect(result.content).toBe('采风任务已交稿')
    expect(result.acted).toBe(true)
    expect(result.details).toMatchObject({ kind: 'caifengDispatch', ok: true })
  })

  it('给了 session 参数：走 resolveSessionContext 解析到目标会话再转发给 dispatch', async () => {
    const dispatch = vi.fn(async () => ({ content: '钻取失败：超时', ok: false, details: { error: '钻取超时（5 分钟）' } }))
    const resolveSessionContext = vi.fn(async (identifier) => (identifier === '午后茶会' ? SESSION : null))
    const tool = createXingyiDispatchResearchTool({ dispatch, resolveSessionContext })
    const result = await tool.execute({ args: callArgs({ session: '午后茶会' }) })
    expect(resolveSessionContext).toHaveBeenCalledWith('午后茶会')
    expect(dispatch.mock.calls[0][0]).toEqual(SESSION)
    expect(result.acted).toBe(false)
    expect(result.details).toMatchObject({ ok: false })
  })

  it('focus 可选：给了就透传给 dispatch，不给则不带该字段', async () => {
    const dispatch = vi.fn(async () => ({ content: 'ok', ok: true }))
    const tool = createXingyiDispatchResearchTool({ dispatch, getSessionContext: () => SESSION })
    await tool.execute({ args: callArgs({ focus: '先搜投影再读原文' }) })
    expect(dispatch.mock.calls[0][1]).toMatchObject({ focus: '先搜投影再读原文' })
    dispatch.mockClear()
    await tool.execute({ args: callArgs() })
    expect(dispatch.mock.calls[0][1]).not.toHaveProperty('focus')
  })

  // ── closingNote 预写收尾话（2026-07-12 用户拍板·省一轮模型调用）──

  it('closingNote：完全成功（dispatch ok:true）且模型传了 closingNote → 结果透传 closingNote', async () => {
    const dispatch = vi.fn(async () => ({ content: '采风任务已交稿', ok: true, details: { coverage: [] } }))
    const tool = createXingyiDispatchResearchTool({ dispatch, getSessionContext: () => SESSION })
    const result = await tool.execute({ args: callArgs({ closingNote: '资料已经帮用户查好啦～' }) })
    expect(result.closingNote).toBe('资料已经帮用户查好啦～')
  })

  it('closingNote：完全成功但模型没传 closingNote → 结果不带该字段', async () => {
    const dispatch = vi.fn(async () => ({ content: '采风任务已交稿', ok: true }))
    const tool = createXingyiDispatchResearchTool({ dispatch, getSessionContext: () => SESSION })
    const result = await tool.execute({ args: callArgs() })
    expect(result.closingNote).toBeUndefined()
  })

  it('closingNote：钻取失败/没交稿（ok:false）即使模型传了也不透传（安全底线）', async () => {
    const dispatch = vi.fn(async () => ({ content: '钻取失败：超时', ok: false, details: { error: '钻取超时（5 分钟）' } }))
    const tool = createXingyiDispatchResearchTool({ dispatch, getSessionContext: () => SESSION })
    const result = await tool.execute({ args: callArgs({ closingNote: '不该出现的收尾话' }) })
    expect(result.closingNote).toBeUndefined()
  })

  it('closingNote：会话未定位等 error 分支不透传（连 dispatch 都没调用）', async () => {
    const dispatch = vi.fn()
    const tool = createXingyiDispatchResearchTool({ dispatch })
    const result = await tool.execute({ args: callArgs({ closingNote: '不该出现的收尾话' }) })
    expect(result.status).toBe('error')
    expect(result.closingNote).toBeUndefined()
    expect(dispatch).not.toHaveBeenCalled()
  })
})
