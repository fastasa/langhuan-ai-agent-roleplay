import { describe, expect, it } from 'vitest'
import {
  createReadNarrationSkillTool,
  createConfirmNarrationCallTool,
  createReviseNarrationDirectionTool
} from '../../../src/app/tidiaoGlobalTools.ts'
import { buildNarrationBusinessContext } from '../../../src/app/personalityNarrationSubagent.ts'

// 2026-07-05 真机修：缺 profileId/profileIds 的报错必须带「可用清单」可执行口径——
// 旧文案只说「缺少」，模型连错 7 次盲重试烧掉大半统筹预算（报错必须给出可执行口径原则，同 07-04 generatedPrompt 修法）。

const PROFILES = [
  { id: 'np_env', name: '环境氛围', triggerDescription: '', content: '环境旁白正文', narrationKind: 'environment' },
  { id: 'np_event', name: '事件推进', triggerDescription: '', content: '事件旁白正文', narrationKind: 'event_push' }
]

const call = (tool, args) => tool.execute({ kind: 'toolCall', callId: 'c1', toolName: tool.name, stage: 't', args, expectation: '', requestedAtTurn: 0 }, { turnIndex: 0 })

describe('旁白两件套缺参报错带可用清单（可执行口径）', () => {
  it('readNarrationSkill 缺 profileId/profileIds：报错列出可用 skill 清单', async () => {
    const ctx = buildNarrationBusinessContext(PROFILES, 2)
    const result = await call(createReadNarrationSkillTool(ctx), {})
    expect(result.status).toBe('error')
    expect(result.content).toContain('缺少 profileId 或 profileIds')
    expect(result.content).toContain('可用：')
    expect(result.content).toContain('环境氛围')
    expect(result.content).toContain('事件推进')
  })

  it('confirmNarrationCall 缺 profileId/profileIds：报错列出可用 skill 清单', async () => {
    const ctx = buildNarrationBusinessContext(PROFILES, 2)
    const result = await call(createConfirmNarrationCallTool(ctx), { reason: '本轮需要事件推进', generatedPrompt: 'x'.repeat(60) })
    expect(result.status).toBe('error')
    expect(result.content).toContain('缺少 profileId 或 profileIds')
    expect(result.content).toContain('可用：')
    expect(result.content).toContain('事件推进')
  })

  it('schema 把 profileId 标 required（弱模型只按 required 填参）；执行层仍接受只传 profileIds', async () => {
    const ctx = buildNarrationBusinessContext(PROFILES, 2)
    for (const tool of [createReadNarrationSkillTool(ctx), createConfirmNarrationCallTool(ctx)]) {
      expect(tool.schema.required).toContain('profileId')
    }
    // 宽容口径不回归：只传 profileIds（不带 profileId）照样读成功。
    const read = await call(createReadNarrationSkillTool(ctx), { profileIds: ['np_event'] })
    expect(read.content).toContain('事件旁白正文')
  })

  it('narrationKind 兜底（同名陷阱修复）：只填 narrationKind 不填 profileId 时按内置同名 skill 解析', async () => {
    // 内置 skill 的 id 与 narrationKind 枚举同名（environment/appearance/event_push）——deepseek 真机连错 10+ 次的根因。
    const builtinProfiles = [
      { id: 'event_push', name: '事件推进', triggerDescription: '', content: '事件推进旁白正文', narrationKind: 'event_push' }
    ]
    const ctx = buildNarrationBusinessContext(builtinProfiles, 2)
    const read = await call(createReadNarrationSkillTool(ctx), { narrationKind: 'event_push' })
    expect(read.content).toContain('事件推进旁白正文')
    const confirmed = await call(createConfirmNarrationCallTool(ctx), {
      narrationKind: 'event_push',
      reason: '追兵逼近需要事件推进旁白',
      generatedPrompt: '写一段追兵脚步逼近废屋、驯兽系统金手指觉醒的事件推进旁白，感官细节侧重听觉与光效，200 字左右。'
    })
    expect(confirmed.content).toContain('已确认生成旁白')
    expect(ctx.calls[0].profileIds).toEqual(['event_push'])
  })

  it('narrationKind 兜底对不上自定义 skill 时：报「未知 id」并列可用清单（仍是可执行口径）', async () => {
    const ctx = buildNarrationBusinessContext(PROFILES, 2)
    const result = await call(createReadNarrationSkillTool(ctx), { narrationKind: 'event_push' })
    expect(result.status).toBe('error')
    expect(result.content).toContain('未知旁白 skill id')
    expect(result.content).toContain('可用：')
  })

  it('带对 profileId 的正常链路不受影响：先读后确认成功', async () => {
    const ctx = buildNarrationBusinessContext(PROFILES, 2)
    const read = await call(createReadNarrationSkillTool(ctx), { profileId: 'np_event' })
    expect(read.content).toContain('事件旁白正文')
    const confirmed = await call(createConfirmNarrationCallTool(ctx), {
      profileId: 'np_event',
      narrationKind: 'event_push',
      reason: '追兵逼近需要事件推进旁白',
      generatedPrompt: '写一段追兵脚步声逼近废屋、三人屏息的事件推进旁白，感官细节侧重听觉，200 字左右。'
    })
    expect(confirmed.content).toContain('已确认生成旁白')
    expect(ctx.calls).toHaveLength(1)
  })
})

// ── 旁白穿插（2026-07-06 用户拍板「旁白不必总在开头」）：insertAfter 锚点 → call.placement ──
import {
  buildDirectorNarrationInsertAfterResolver,
  isRoundStartNarrationCall,
  partitionInterleavedNarrationCalls
} from '../../../src/app/personalityNarrationSubagent.ts'
import { buildDirectorDecisionLoopSystemPrompt } from '../../../src/app/groupDirectorPass.ts'

const CANDIDATES = [{ characterId: 'c1', name: '星依' }, { characterId: 'c2', name: '元英' }]
const LONG_PROMPT = '承接元英刚才那句抱怨：写她放下茶杯、指尖敲桌沿的动作与窗外骤起的风，感官侧重听觉与触觉，约 120 字。'

describe('旁白穿插：insertAfter 锚点解析与 placement 落 call', () => {
  it('解析器：开场/收尾/角色名/characterId 四种锚点各解析正确；空串=不指定', () => {
    const resolve = buildDirectorNarrationInsertAfterResolver(CANDIDATES)
    expect(resolve('')).toEqual({})
    expect(resolve('开场').placement).toEqual({ anchor: 'round_start' })
    expect(resolve('收尾').placement).toEqual({ anchor: 'round_end' })
    expect(resolve('round_end').placement).toEqual({ anchor: 'round_end' })
    expect(resolve('元英').placement).toEqual({ anchor: 'after_speaker', speakerCharacterId: 'c2', speakerName: '元英' })
    expect(resolve('c1').placement).toEqual({ anchor: 'after_speaker', speakerCharacterId: 'c1', speakerName: '星依' })
  })

  it('解析器：锚点对不上候选 → error 带可用清单（可执行口径）', () => {
    const resolve = buildDirectorNarrationInsertAfterResolver(CANDIDATES)
    const result = resolve('不存在的人')
    expect(result.placement).toBeUndefined()
    expect(result.error).toContain('不存在的人')
    expect(result.error).toContain('开场')
    expect(result.error).toContain('收尾')
    expect(result.error).toContain('星依')
    expect(result.error).toContain('c2')
  })

  it('confirmNarrationCall：schema 声明 insertAfter；带解析器时锚点写进 call.placement', async () => {
    const ctx = buildNarrationBusinessContext(PROFILES, 2, undefined, buildDirectorNarrationInsertAfterResolver(CANDIDATES))
    const tool = createConfirmNarrationCallTool(ctx)
    expect(tool.schema.properties.insertAfter).toBeTruthy()
    await call(createReadNarrationSkillTool(ctx), { profileId: 'np_event' })
    const confirmed = await call(tool, {
      profileId: 'np_event', reason: '承接元英的抱怨引入变数', generatedPrompt: LONG_PROMPT, insertAfter: '元英'
    })
    expect(confirmed.content).toContain('已确认生成旁白')
    expect(ctx.calls[0].placement).toEqual({ anchor: 'after_speaker', speakerCharacterId: 'c2', speakerName: '元英' })
  })

  it('confirmNarrationCall：锚点无效 → INVALID_ARGUMENT 回执引导重发（不静默落开场·不 push call）', async () => {
    const ctx = buildNarrationBusinessContext(PROFILES, 2, undefined, buildDirectorNarrationInsertAfterResolver(CANDIDATES))
    await call(createReadNarrationSkillTool(ctx), { profileId: 'np_event' })
    const result = await call(createConfirmNarrationCallTool(ctx), {
      profileId: 'np_event', reason: '理由', generatedPrompt: LONG_PROMPT, insertAfter: '路人甲'
    })
    expect(result.status).toBe('error')
    expect(result.content).toContain('路人甲')
    expect(ctx.calls).toHaveLength(0)
  })

  it('无解析器（纠偏/演员/subagent loop）：insertAfter 原样忽略、不写 placement（纠偏楼层引用另走 onConfirmed args）', async () => {
    const ctx = buildNarrationBusinessContext(PROFILES, 2)
    await call(createReadNarrationSkillTool(ctx), { profileId: 'np_event' })
    const confirmed = await call(createConfirmNarrationCallTool(ctx), {
      profileId: 'np_event', reason: '理由充分的一条', generatedPrompt: LONG_PROMPT, insertAfter: '角色2'
    })
    expect(confirmed.content).toContain('已确认生成旁白')
    expect(ctx.calls[0].placement).toBeUndefined()
  })

  it('缺省不填 insertAfter：不写 placement（isRoundStartNarrationCall 按开场对待·与历史行为一致）', async () => {
    const ctx = buildNarrationBusinessContext(PROFILES, 2, undefined, buildDirectorNarrationInsertAfterResolver(CANDIDATES))
    await call(createReadNarrationSkillTool(ctx), { profileId: 'np_env' })
    await call(createConfirmNarrationCallTool(ctx), { profileId: 'np_env', reason: '开场铺环境', generatedPrompt: LONG_PROMPT })
    expect(ctx.calls[0].placement).toBeUndefined()
    expect(isRoundStartNarrationCall(ctx.calls[0])).toBe(true)
  })
})

describe('旁白穿插：round_start 子集判定与分段匹配（管线联动纯函数）', () => {
  const mk = (placement) => ({ placement })
  const roundStart = mk(undefined)
  const explicitStart = mk({ anchor: 'round_start' })
  const afterC1 = mk({ anchor: 'after_speaker', speakerCharacterId: 'c1' })
  const afterC2 = mk({ anchor: 'after_speaker', speakerCharacterId: 'c2' })
  const roundEnd = mk({ anchor: 'round_end' })

  it('isRoundStartNarrationCall：缺省/round_start=开场；after_speaker/round_end=穿插', () => {
    expect(isRoundStartNarrationCall(roundStart)).toBe(true)
    expect(isRoundStartNarrationCall(explicitStart)).toBe(true)
    expect(isRoundStartNarrationCall(afterC1)).toBe(false)
    expect(isRoundStartNarrationCall(roundEnd)).toBe(false)
  })

  it('partition：按锚点角色取本段旁白，其余留队列', () => {
    const { matched, rest } = partitionInterleavedNarrationCalls([afterC1, afterC2, roundEnd], 'c1')
    expect(matched).toEqual([afterC1])
    expect(rest).toEqual([afterC2, roundEnd])
  })

  it('partition 轮末段（speakerCharacterId=null）：round_end + 未消费的 after_speaker 兜底全收', () => {
    const { matched, rest } = partitionInterleavedNarrationCalls([afterC2, roundEnd], null)
    expect(matched).toEqual([afterC2, roundEnd])
    expect(rest).toEqual([])
  })
})

describe('分镜方向修改（2026-07-07）：reviseNarrationDirection', () => {
  const REASON = '据纠偏，这条旁白氛围应更浓烈'
  const NEW_PROMPT = '重写这段旁白：秋风卷起落叶拍打窗棂，屋内烛火摇曳，感官细节侧重听觉与光影明暗，约 150 字。'

  it('本轮还没有已确认旁白时：报错提示应先 confirmNarrationCall', async () => {
    const ctx = buildNarrationBusinessContext(PROFILES, 2)
    const result = await call(createReviseNarrationDirectionTool(ctx), { narrationIndex: 1, generatedPrompt: NEW_PROMPT })
    expect(result.status).toBe('error')
    expect(result.content).toContain('还没有已确认的旁白')
  })

  it('narrationIndex 超出范围：报错列出当前已确认旁白清单（可执行口径）', async () => {
    const ctx = buildNarrationBusinessContext(PROFILES, 2)
    await call(createReadNarrationSkillTool(ctx), { profileId: 'np_event' })
    await call(createConfirmNarrationCallTool(ctx), { profileId: 'np_event', reason: '事件推进', generatedPrompt: LONG_PROMPT })
    const result = await call(createReviseNarrationDirectionTool(ctx), { narrationIndex: 2, generatedPrompt: NEW_PROMPT })
    expect(result.status).toBe('error')
    expect(result.content).toContain('超出范围')
    expect(result.content).toContain('共 1 条')
    expect(result.content).toContain('旁白1')
  })

  it('generatedPrompt 太短：报错要求至少 40 字（同 confirmNarrationCall 口径）', async () => {
    const ctx = buildNarrationBusinessContext(PROFILES, 2)
    await call(createReadNarrationSkillTool(ctx), { profileId: 'np_event' })
    await call(createConfirmNarrationCallTool(ctx), { profileId: 'np_event', reason: '事件推进', generatedPrompt: LONG_PROMPT })
    const result = await call(createReviseNarrationDirectionTool(ctx), { narrationIndex: 1, generatedPrompt: '太短了' })
    expect(result.status).toBe('error')
    expect(result.content).toContain('至少 40 字')
  })

  it('新指令与旧指令相同：拒绝（没有实质变化，不允许空转调用）', async () => {
    const ctx = buildNarrationBusinessContext(PROFILES, 2)
    await call(createReadNarrationSkillTool(ctx), { profileId: 'np_event' })
    await call(createConfirmNarrationCallTool(ctx), { profileId: 'np_event', reason: '事件推进', generatedPrompt: LONG_PROMPT })
    const result = await call(createReviseNarrationDirectionTool(ctx), { narrationIndex: 1, generatedPrompt: LONG_PROMPT })
    expect(result.status).toBe('error')
    expect(result.content).toContain('没有实质变化')
  })

  it('正常改写：只改 generatedPrompt，placement/reason/narrationKind 不受影响；成功回执点名第几条', async () => {
    const resolver = buildDirectorNarrationInsertAfterResolver(CANDIDATES)
    const ctx = buildNarrationBusinessContext(PROFILES, 2, undefined, resolver)
    await call(createReadNarrationSkillTool(ctx), { profileId: 'np_event' })
    await call(createConfirmNarrationCallTool(ctx), {
      profileId: 'np_event', reason: '承接元英的抱怨引入变数', generatedPrompt: LONG_PROMPT, insertAfter: '元英'
    })
    const originalPlacement = ctx.calls[0].placement
    const originalReason = ctx.calls[0].reason
    const result = await call(createReviseNarrationDirectionTool(ctx), { narrationIndex: 1, generatedPrompt: NEW_PROMPT, reason: REASON })
    expect(result.content).toContain('已改第 1 条旁白')
    expect(ctx.calls[0].generatedPrompt).toBe(NEW_PROMPT)
    expect(ctx.calls[0].placement).toEqual(originalPlacement)
    expect(ctx.calls[0].reason).toBe(originalReason)
  })

  it('onRevised 回调：改写成功后携带 call/下标(0起)/reason', async () => {
    const revised = []
    const ctx = buildNarrationBusinessContext(PROFILES, 2, undefined, undefined, (call, index, reason) => revised.push({ call, index, reason }))
    await call(createReadNarrationSkillTool(ctx), { profileId: 'np_event' })
    await call(createConfirmNarrationCallTool(ctx), { profileId: 'np_event', reason: '事件推进', generatedPrompt: LONG_PROMPT })
    await call(createReviseNarrationDirectionTool(ctx), { narrationIndex: 1, generatedPrompt: NEW_PROMPT, reason: REASON })
    expect(revised).toHaveLength(1)
    expect(revised[0].index).toBe(0)
    expect(revised[0].reason).toBe(REASON)
    expect(revised[0].call.generatedPrompt).toBe(NEW_PROMPT)
  })
})

describe('旁白穿插：统筹纲领步骤 3 口径', () => {
  it('纲领写明旁白可开场/穿插承接/收尾，并给出 insertAfter 用法', () => {
    const prompt = buildDirectorDecisionLoopSystemPrompt(false, true, false)
    expect(prompt).toContain('旁白不是只能放在开头')
    expect(prompt).toContain('穿插在角色回复之间')
    expect(prompt).toContain('insertAfter')
    expect(prompt).toContain('收尾')
    expect(prompt).toContain('新人物进场或旧人物退场')
  })
})
