import { describe, expect, it } from 'vitest'
import {
  createAddCastDirectionTool,
  createReviseCastDirectionTool
} from '../../../src/app/tidiaoGlobalTools.ts'

// 分镜方向修改（2026-07-07·用户拍板「只有方向真的需要变时才修改分镜」）：
// reviseCastDirection 在 addCastDirection「只能定一次」的限制之外，新增「事后改已有方向」的能力——
// 仅当模型自己判断方向确实要变时调用，且必须是模型重新想清楚写出的新方向（不是用户纠偏原文）。

const call = (tool, args) => tool.execute({ kind: 'toolCall', callId: 'c1', toolName: tool.name, stage: 't', args, expectation: '', requestedAtTurn: 0 }, { turnIndex: 0 })

function buildDecisionContext(onCastRevised) {
  const revised = []
  return {
    ctx: {
      candidateSet: new Set(['c1', 'c2']),
      candidateNameById: new Map([['c1', '星依'], ['c2', '元英']]),
      excludedSet: new Set(),
      state: { scenarioCode: '', scenarioBody: '', cast: [], finished: false, finishSituation: '', finishUnfinished: '' },
      onCastAdded: (entry) => {},
      ...(onCastRevised !== false ? { onCastRevised: (entry) => revised.push(entry) } : {})
    },
    revised
  }
}

describe('分镜方向修改（2026-07-07）：reviseCastDirection', () => {
  it('该角色本轮还没定过方向：拒绝并提示应先 addCastDirection', async () => {
    const { ctx } = buildDecisionContext()
    const result = await call(createReviseCastDirectionTool(ctx), { characterId: 'c1', direction: '星依态度强硬' })
    expect(result.status).toBe('error')
    expect(result.content).toContain('还没定过方向')
    expect(result.content).toContain('addCastDirection')
  })

  it('新方向与原方向相同：拒绝（没有实质变化，防空转调用）', async () => {
    const { ctx } = buildDecisionContext()
    await call(createAddCastDirectionTool(ctx), { characterId: 'c1', direction: '星依温柔问候' })
    const result = await call(createReviseCastDirectionTool(ctx), { characterId: 'c1', direction: '星依温柔问候' })
    expect(result.status).toBe('error')
    expect(result.content).toContain('没有实质变化')
  })

  it('正常改写：state.cast 里该角色方向被原地替换（不是新增一条），回执点名角色', async () => {
    const { ctx } = buildDecisionContext()
    await call(createAddCastDirectionTool(ctx), { characterId: 'c1', direction: '星依温柔问候' })
    await call(createAddCastDirectionTool(ctx), { characterId: 'c2', direction: '元英冷淡回应' })
    const result = await call(createReviseCastDirectionTool(ctx), {
      characterId: 'c1',
      direction: '星依态度转为强硬质问',
      reason: '据纠偏，语气应更强硬'
    })
    expect(result.content).toContain('已改 星依 的本轮方向')
    expect(ctx.state.cast).toEqual([
      { characterId: 'c1', direction: '星依态度转为强硬质问' },
      { characterId: 'c2', direction: '元英冷淡回应' }
    ])
  })

  it('onCastRevised 回调：改写成功后携带 characterId/direction/label/reason', async () => {
    const { ctx, revised } = buildDecisionContext()
    await call(createAddCastDirectionTool(ctx), { characterId: 'c1', direction: '星依温柔问候' })
    await call(createReviseCastDirectionTool(ctx), { characterId: 'c1', direction: '星依态度转为强硬质问', reason: '据纠偏调整' })
    expect(revised).toEqual([{ characterId: 'c1', direction: '星依态度转为强硬质问', label: '星依', reason: '据纠偏调整' }])
  })

  it('缺 characterId 或 direction：validateArgs 挡在前面', () => {
    const { ctx } = buildDecisionContext()
    const tool = createReviseCastDirectionTool(ctx)
    expect(tool.validateArgs({ characterId: 'c1' })).toBeTruthy()
    expect(tool.validateArgs({ direction: 'x' })).toBeTruthy()
    expect(tool.validateArgs({ characterId: 'c1', direction: 'x' })).toBeNull()
  })

  it('reason 可省略：不传时回调 reason 为空串，决策流用兜底文案（accumulator 测试另锁）', async () => {
    const { ctx, revised } = buildDecisionContext()
    await call(createAddCastDirectionTool(ctx), { characterId: 'c1', direction: '星依温柔问候' })
    await call(createReviseCastDirectionTool(ctx), { characterId: 'c1', direction: '星依态度转为强硬质问' })
    expect(revised[0].reason).toBe('')
  })
})
