import { describe, expect, it, vi } from 'vitest'
import { createXingyiCurtainSceneTool } from '../../../src/app/xingyiCurtainSceneTools.ts'

function call(args) {
  return { toolName: 'updateCurtainScene', args, expectation: '' }
}

const target = {
  sessionId: 'session_1',
  targetId: 'group_1',
  label: '北门故事',
  session: { id: 'session_1' }
}

describe('xingyiCurtainSceneTools（星依当前帷幕直改）', () => {
  it('没有活动聊天会话时明确失败，不伪造成功', async () => {
    const tool = createXingyiCurtainSceneTool({
      confirmWrite: vi.fn(async () => true),
      resolveCurrentSession: () => null,
      updateCurtainScene: vi.fn()
    })

    const result = await tool.execute(call({ targetTime: '黄昏' }), { turnIndex: 0 })

    expect(result.status).toBe('error')
    expect(result.content).toContain('当前没有可修改的聊天会话')
  })

  it('确认卡绑定发起时的会话；取消后不写入', async () => {
    const confirmWrite = vi.fn(async () => false)
    const updateCurtainScene = vi.fn()
    const tool = createXingyiCurtainSceneTool({
      confirmWrite,
      resolveCurrentSession: () => target,
      updateCurtainScene
    })

    const result = await tool.execute(call({
      targetTime: '霜月初七，黄昏将尽',
      locationLarge: '博瑞利尔王国',
      locationMiddle: '博瑞利尔城',
      locationSmall: '北门广场'
    }), { turnIndex: 0 })

    expect(confirmWrite).toHaveBeenCalledWith(expect.objectContaining({
      title: '修改当前会话帷幕',
      lines: expect.arrayContaining(['会话：北门故事', '目标地点：博瑞利尔王国 / 博瑞利尔城 / 北门广场'])
    }))
    expect(updateCurtainScene).not.toHaveBeenCalled()
    expect(result.content).toContain('取消')
  })

  it('确认后把同一目标与规范调用交给正式写入接缝', async () => {
    const updateCurtainScene = vi.fn(async (_target, toolCall) => ({
      changed: true,
      notice: '帷幕已更新。',
      patch: { virtualLocation: toolCall.targetLocation }
    }))
    const tool = createXingyiCurtainSceneTool({
      confirmWrite: vi.fn(async () => true),
      resolveCurrentSession: () => target,
      updateCurtainScene
    })

    const result = await tool.execute(call({
      targetTime: '霜月初七，黄昏将尽',
      targetLocation: '博瑞利尔王国 / 博瑞利尔城 / 北门广场',
      reason: '设置故事开场'
    }), { turnIndex: 0 })

    expect(updateCurtainScene).toHaveBeenCalledWith(target, expect.objectContaining({
      tool: 'updateCurtainScene',
      targetTime: '霜月初七，黄昏将尽',
      targetLocation: '博瑞利尔王国 / 博瑞利尔城 / 北门广场'
    }))
    expect(result.content).toBe('帷幕已更新。')
  })
})
