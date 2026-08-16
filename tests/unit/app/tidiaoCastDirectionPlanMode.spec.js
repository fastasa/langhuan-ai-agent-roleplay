import { describe, expect, it } from 'vitest'
import {
  createAddCastDirectionTool,
  createReviseCastDirectionTool
} from '../../../src/app/tidiaoGlobalTools.ts'

// 提调回复链路串行压缩提速·批B（2026-07-13）：人格模型按需直通道。
// 提调定方向时可判 planMode='direct' 并同轮直写 plan（该角色跳过演员机三段，计划直送单计划管道）；
// personality/缺省=现状全链路。判断权=提调（工具 brief），路由=硬代码（execute 里的分流），
// 非法枚举值一律当 personality 兜底（拿不准走慢路径，不放模型走出坏路径）。

const call = (tool, args) => tool.execute({ kind: 'toolCall', callId: 'c1', toolName: tool.name, stage: 't', args, expectation: '', requestedAtTurn: 0 }, { turnIndex: 0 })

function buildDecisionContext() {
  return {
    candidateSet: new Set(['c1', 'c2']),
    candidateNameById: new Map([['c1', '星依'], ['c2', '元英']]),
    excludedSet: new Set(),
    state: { scenarioCode: '', scenarioBody: '', cast: [], finished: false, finishSituation: '', finishUnfinished: '' },
    onCastAdded: () => {},
    onCastRevised: () => {}
  }
}

describe('批B·addCastDirection planMode 分流', () => {
  it('direct + plan：正常 push，cast 条目带 planMode/plan', async () => {
    const ctx = buildDecisionContext()
    const result = await call(createAddCastDirectionTool(ctx), {
      characterId: 'c1',
      direction: '星依温柔问候',
      planMode: 'direct',
      plan: '星依会笑着凑近，语气软软地打招呼，眼神里带点期待'
    })
    expect(result.status).not.toBe('error')
    expect(ctx.state.cast).toEqual([{
      characterId: 'c1',
      direction: '星依温柔问候',
      planMode: 'direct',
      plan: '星依会笑着凑近，语气软软地打招呼，眼神里带点期待'
    }])
  })

  it('direct 缺 plan：拒绝（INVALID_ARGUMENT），不 push', async () => {
    const ctx = buildDecisionContext()
    const result = await call(createAddCastDirectionTool(ctx), {
      characterId: 'c1',
      direction: '星依温柔问候',
      planMode: 'direct'
    })
    expect(result.status).toBe('error')
    expect(result.error?.type).toBe('INVALID_ARGUMENT')
    expect(result.content).toContain('plan')
    expect(ctx.state.cast).toEqual([])
  })

  it('缺省 planMode：push 旧形状（不带 planMode/plan 字段，零回归）', async () => {
    const ctx = buildDecisionContext()
    await call(createAddCastDirectionTool(ctx), { characterId: 'c1', direction: '星依接话' })
    expect(ctx.state.cast).toEqual([{ characterId: 'c1', direction: '星依接话' }])
    expect(ctx.state.cast[0]).not.toHaveProperty('planMode')
    expect(ctx.state.cast[0]).not.toHaveProperty('plan')
  })

  it('非法 planMode 值：当 personality 处理（不报错，不带 planMode 字段）', async () => {
    const ctx = buildDecisionContext()
    const result = await call(createAddCastDirectionTool(ctx), {
      characterId: 'c1',
      direction: '星依接话',
      planMode: '瞎写的枚举值'
    })
    expect(result.status).not.toBe('error')
    expect(ctx.state.cast).toEqual([{ characterId: 'c1', direction: '星依接话' }])
  })

  it('personality + plan：plan 字段被忽略，不进 cast 条目（plan 只在 direct 才有意义）', async () => {
    const ctx = buildDecisionContext()
    await call(createAddCastDirectionTool(ctx), {
      characterId: 'c1',
      direction: '星依接话',
      planMode: 'personality',
      plan: '不该出现的计划'
    })
    expect(ctx.state.cast).toEqual([{ characterId: 'c1', direction: '星依接话' }])
  })
})

describe('批B·reviseCastDirection 对 direct 条目的 plan 同步约束', () => {
  it('direct 条目改方向不带 plan：拒绝，要求同步重写 plan', async () => {
    const ctx = buildDecisionContext()
    await call(createAddCastDirectionTool(ctx), {
      characterId: 'c1',
      direction: '星依温柔问候',
      planMode: 'direct',
      plan: '星依笑着打招呼'
    })
    const result = await call(createReviseCastDirectionTool(ctx), {
      characterId: 'c1',
      direction: '星依态度转为强硬质问'
    })
    expect(result.status).toBe('error')
    expect(result.content).toContain('plan')
    // 拒绝时原条目不应被改动
    expect(ctx.state.cast[0]).toEqual({
      characterId: 'c1',
      direction: '星依温柔问候',
      planMode: 'direct',
      plan: '星依笑着打招呼'
    })
  })

  it('direct 条目改方向带 plan：direction 与 plan 同步更新', async () => {
    const ctx = buildDecisionContext()
    await call(createAddCastDirectionTool(ctx), {
      characterId: 'c1',
      direction: '星依温柔问候',
      planMode: 'direct',
      plan: '星依笑着打招呼'
    })
    const result = await call(createReviseCastDirectionTool(ctx), {
      characterId: 'c1',
      direction: '星依态度转为强硬质问',
      plan: '星依收起笑容，语气转硬地追问对方'
    })
    expect(result.status).not.toBe('error')
    expect(ctx.state.cast[0]).toEqual({
      characterId: 'c1',
      direction: '星依态度转为强硬质问',
      planMode: 'direct',
      plan: '星依收起笑容，语气转硬地追问对方'
    })
  })

  it('personality 条目传 plan：忽略（不报错、不写入 entry，因为 entry 本没有 planMode/plan 字段）', async () => {
    const ctx = buildDecisionContext()
    await call(createAddCastDirectionTool(ctx), { characterId: 'c1', direction: '星依温柔问候' })
    const result = await call(createReviseCastDirectionTool(ctx), {
      characterId: 'c1',
      direction: '星依态度转为强硬质问',
      plan: '不该生效的计划'
    })
    expect(result.status).not.toBe('error')
    expect(ctx.state.cast[0]).toEqual({ characterId: 'c1', direction: '星依态度转为强硬质问' })
  })
})
