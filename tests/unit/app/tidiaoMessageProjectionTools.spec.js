import { describe, expect, it } from 'vitest'
import {
  createTidiaoMessageProjectionContext,
  renderDirectorProjectionRecentContext,
  runTidiaoReadMessageProjection,
  runTidiaoMarkReproject
} from '../../../src/app/tidiaoMessageProjectionTools.ts'

function sampleMessages() {
  return [
    { id: 1, role: 'user', content: '今晚天气不错' },
    { id: 2, role: 'assistant', name: '阿澈', content: '是啊，凉风正好。要不要出去走走？' },
    { id: 3, role: 'assistant', messageKind: 'narration', content: '窗外月色清冷。' }
  ]
}

function sampleProjectionMap() {
  return new Map([
    [2, {
      objectiveFact: '阿澈邀请对方出去散步。',
      startEnv: { time: '夜晚', location: '屋内' },
      endEnv: { time: '夜晚', location: '屋内' },
      changed: { time: false, location: false },
      status: 'complete'
    }]
    // 旁白（messageId 3）故意不给投影，验证 hasProjection=false
  ])
}

describe('createTidiaoMessageProjectionContext / 读投影', () => {
  it('按楼层读到角色消息的当前投影事实与环境', () => {
    const ctx = createTidiaoMessageProjectionContext(sampleMessages(), sampleProjectionMap())
    const { read } = runTidiaoReadMessageProjection({ ref: '角色1' }, ctx)
    expect(read.matched).toBe(true)
    expect(read.messageId).toBe(2)
    expect(read.speakerName).toBe('阿澈')
    expect(read.hasProjection).toBe(true)
    expect(read.objectiveFact).toBe('阿澈邀请对方出去散步。')
    expect(read.startEnvText).toContain('夜晚')
    expect(read.changedText).toBe('无时间/地点变化')
  })

  it('消息没有投影时 hasProjection=false、事实为空', () => {
    const ctx = createTidiaoMessageProjectionContext(sampleMessages(), sampleProjectionMap())
    const { read } = runTidiaoReadMessageProjection({ ref: '旁白1' }, ctx)
    expect(read.matched).toBe(true)
    expect(read.messageId).toBe(3)
    expect(read.hasProjection).toBe(false)
    expect(read.objectiveFact).toBe('')
  })

  it('楼层越界返回 matched:false + total（供模型自纠）', () => {
    const ctx = createTidiaoMessageProjectionContext(sampleMessages(), sampleProjectionMap())
    const { read } = runTidiaoReadMessageProjection({ ref: '角色9' }, ctx)
    expect(read.matched).toBe(false)
    expect(read.total).toBe(1)
  })

  it('无法解析楼层引用返回 read:null', () => {
    const ctx = createTidiaoMessageProjectionContext(sampleMessages(), sampleProjectionMap())
    const { read } = runTidiaoReadMessageProjection({ ref: '随便写写' }, ctx)
    expect(read).toBeNull()
  })
})

describe('标记重投 / collectReprojectTargets', () => {
  it('标记某条 → collectReprojectTargets 带回 messageId/ref', () => {
    const ctx = createTidiaoMessageProjectionContext(sampleMessages(), sampleProjectionMap())
    const { mark } = runTidiaoMarkReproject({ ref: '角色1' }, ctx)
    expect(mark.matched).toBe(true)
    expect(mark.messageId).toBe(2)
    const targets = ctx.collectReprojectTargets()
    expect(targets).toEqual([{ messageId: 2, ref: '角色1', speakerName: '阿澈' }])
  })

  it('同一条标记多次只算一条（按 messageId 去重）', () => {
    const ctx = createTidiaoMessageProjectionContext(sampleMessages(), sampleProjectionMap())
    runTidiaoMarkReproject({ ref: '角色1' }, ctx)
    runTidiaoMarkReproject({ ref: '角色1' }, ctx)
    runTidiaoMarkReproject({ ref: '旁白1' }, ctx)
    const targets = ctx.collectReprojectTargets()
    expect(targets.map((t) => t.messageId).sort()).toEqual([2, 3])
  })

  it('楼层越界不计入重投目标', () => {
    const ctx = createTidiaoMessageProjectionContext(sampleMessages(), sampleProjectionMap())
    const { mark } = runTidiaoMarkReproject({ ref: '角色9' }, ctx)
    expect(mark.matched).toBe(false)
    expect(ctx.collectReprojectTargets()).toEqual([])
  })
})

describe('renderDirectorProjectionRecentContext（批次4-投影 A·投影态开局上下文）', () => {
  it('角色楼层喂客观事实投影；用户消息保留「用户（扮演X）」原文标签', () => {
    const messages = sampleMessages()
    const ctx = createTidiaoMessageProjectionContext(messages, sampleProjectionMap())
    const text = renderDirectorProjectionRecentContext(messages, ctx)
    // 角色1（messageId 2·阿澈）有投影 → 喂客观事实，不喂原文台词
    expect(text).toContain('角色1·阿澈：阿澈邀请对方出去散步。')
    expect(text).not.toContain('凉风正好')
    // 用户消息无投影 → 保留原文标签
    expect(text).toContain('用户：今晚天气不错')
  })

  it('楼层尚无投影事实 → 兜底回退原文截断（不让提调失明）', () => {
    const messages = sampleMessages()
    const ctx = createTidiaoMessageProjectionContext(messages, sampleProjectionMap())
    const text = renderDirectorProjectionRecentContext(messages, ctx)
    // 旁白1（messageId 3）故意无投影 → 回退原文
    expect(text).toContain('旁白1·旁白：窗外月色清冷。')
  })

  it('只渲染最近 maxMessages 条窗口', () => {
    const messages = [
      { id: 1, role: 'assistant', name: '甲', content: '第一句' },
      { id: 2, role: 'assistant', name: '乙', content: '第二句' },
      { id: 3, role: 'assistant', name: '丙', content: '第三句' }
    ]
    const ctx = createTidiaoMessageProjectionContext(messages, new Map())
    const text = renderDirectorProjectionRecentContext(messages, ctx, 2)
    expect(text).not.toContain('第一句')
    expect(text).toContain('第二句')
    expect(text).toContain('第三句')
  })
})
