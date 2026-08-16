import { describe, expect, it, vi } from 'vitest'
import {
  createXingyiDispatchZaoceStatusDesignTool,
  XINGYI_ZAOCE_STATUS_DESIGN_TOOL_NAME
} from '../../../src/app/xingyiZaoceStatusDesignTools.ts'

function activeSession() {
  return {
    sessionId: 'session_1',
    sessionTitle: '卡维安会话',
    characterOptions: []
  }
}

describe('dispatchZaoceStatusDesign', () => {
  it('只把准确目标、人话要求和受控关注类型交给造册，不暴露 presentation JSON', async () => {
    const confirmWrite = vi.fn(async () => ({ status: 'confirmed' }))
    const dispatch = vi.fn(async () => ({
      ok: true,
      summary: '已增加人口构成与资源比较。',
      panels: ['卡维安诸部']
    }))
    const tool = createXingyiDispatchZaoceStatusDesignTool({
      getSessionContext: activeSession,
      confirmWrite,
      dispatch
    })

    expect(tool.name).toBe(XINGYI_ZAOCE_STATUS_DESIGN_TOOL_NAME)
    expect(tool.schema.properties).not.toHaveProperty('presentation')
    expect(tool.brief).toContain('先用 listStatusSystem')
    expect(tool.brief).toContain('不提交')

    const result = await tool.execute({
      args: {
        panel: '卡维安诸部',
        directive: '人口按性别和年龄切换，木材煤炭做资源比较，经济总值作为指标。',
        focus: ['composition', 'resources']
      }
    })

    expect(confirmWrite).toHaveBeenCalledWith(expect.objectContaining({
      title: '派遣造册重构状态总览',
      lines: expect.arrayContaining(['目标状态栏：卡维安诸部'])
    }))
    expect(dispatch).toHaveBeenCalledWith(activeSession(), {
      panel: '卡维安诸部',
      directive: '人口按性别和年龄切换，木材煤炭做资源比较，经济总值作为指标。',
      focus: ['composition', 'resources']
    })
    expect(result.acted).toBe(true)
    expect(result.content).toContain('造册已完成「卡维安诸部」')
    expect(result.content).toContain('总览/数据')
  })

  it('没有确认通道时拒绝派发，非法关注类型在模型调用前被 schema 校验拒绝', async () => {
    const dispatch = vi.fn()
    const tool = createXingyiDispatchZaoceStatusDesignTool({ getSessionContext: activeSession, dispatch })
    const missingConfirm = await tool.execute({ args: { panel: '卡维安诸部', directive: '做人口图表' } })
    expect(missingConfirm.status).toBe('error')
    expect(dispatch).not.toHaveBeenCalled()
    expect(tool.validateArgs({ panel: '卡维安诸部', directive: '做人口图表', focus: ['script'] })).toContain('不支持')
  })

  it('造册失败如实回报，不把未交稿说成已经完成', async () => {
    const tool = createXingyiDispatchZaoceStatusDesignTool({
      getSessionContext: activeSession,
      confirmWrite: vi.fn(async () => ({ status: 'confirmed' })),
      dispatch: vi.fn(async () => ({ ok: false, summary: '', panels: [], error: '目标状态栏不存在' }))
    })
    const result = await tool.execute({ args: { panel: '不存在', directive: '做人口图表' } })
    expect(result.status).toBe('error')
    expect(result.content).toContain('目标状态栏不存在')
    expect(result.content).not.toContain('已完成')
  })
})
