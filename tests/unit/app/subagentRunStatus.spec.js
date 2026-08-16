import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  appendSubagentRunTimeline,
  beginSubagentRun,
  endSubagentRun,
  getSubagentRunStatus,
  listAllSubagentRunStatuses,
  formatSubagentRunDuration,
  settleSubagentRunTimelineTool,
  subagentRunTick,
  resetSubagentRunStatusForTest
} from '../../../src/app/subagentRunStatus.ts'

// subagent 运行状态（2026-07-07 范式优化批次3·由编剧专属 scriptwriterRunStatus 泛化）：纯内存响应式实况，
// (sessionId, subagentId) 键控；埋点=runSubagent（subagentSpec）；消费方=提调带剧本入口 + DirectorScriptPanel 状态条 + sticky 卡。
describe('subagentRunStatus · subagent 运行实况（批次3 泛化）', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    resetSubagentRunStatusForTest()
  })
  afterEach(() => {
    resetSubagentRunStatusForTest()
    vi.useRealTimers()
  })

  it('begin → running（带开始时刻）；end 成功 → done + 耗时', () => {
    beginSubagentRun('s1', 'scriptwriter')
    const running = getSubagentRunStatus('s1', 'scriptwriter')
    expect(running.state).toBe('running')
    expect(running.startedAt).toBeGreaterThan(0)
    vi.advanceTimersByTime(2300)
    endSubagentRun('s1', 'scriptwriter', { ok: true })
    const done = getSubagentRunStatus('s1', 'scriptwriter')
    expect(done.state).toBe('done')
    expect(done.durationMs).toBe(2300)
    expect(done.error).toBeUndefined()
  })

  it('end 失败 → error + 原因钳制归一；未 begin 的 end 是 no-op', () => {
    endSubagentRun('sX', 'scriptwriter', { ok: false, error: '不该出现' })
    expect(getSubagentRunStatus('sX', 'scriptwriter')).toBeNull()
    beginSubagentRun('s1', 'scriptwriter')
    endSubagentRun('s1', 'scriptwriter', { ok: false, error: '  上游\n超时  ' })
    const failed = getSubagentRunStatus('s1', 'scriptwriter')
    expect(failed.state).toBe('error')
    expect(failed.error).toBe('上游 超时')
  })

  it('活秒表：有运行中的 subagent 才跳（500ms 自增）；全部结束后停', () => {
    const before = subagentRunTick.value
    vi.advanceTimersByTime(2000)
    expect(subagentRunTick.value).toBe(before) // 没人运行不跳
    beginSubagentRun('s1', 'scriptwriter')
    vi.advanceTimersByTime(1500)
    expect(subagentRunTick.value).toBe(before + 3)
    endSubagentRun('s1', 'scriptwriter', { ok: true })
    const stopped = subagentRunTick.value
    vi.advanceTimersByTime(2000)
    expect(subagentRunTick.value).toBe(stopped)
  })

  it('键控互不串：同会话不同 subagent、不同会话同 subagent 各自实况', () => {
    beginSubagentRun('s1', 'scriptwriter')
    beginSubagentRun('s1', 'other-agent')
    beginSubagentRun('s2', 'scriptwriter')
    endSubagentRun('s1', 'scriptwriter', { ok: true })
    expect(getSubagentRunStatus('s1', 'scriptwriter').state).toBe('done')
    expect(getSubagentRunStatus('s1', 'other-agent').state).toBe('running')
    expect(getSubagentRunStatus('s2', 'scriptwriter').state).toBe('running')
  })

  it('内部信息流留存（编剧卡）：begin 带 input、end 成功带 output；失败时 input 保留、无 output', () => {
    beginSubagentRun('s1', 'scriptwriter', { input: '【当前剧本】…\n【提调带来的本轮信息】用户点名让望舒出场' })
    const running = getSubagentRunStatus('s1', 'scriptwriter')
    expect(running.input).toContain('用户点名让望舒出场')
    expect(running.input).toContain('\n') // 保留换行（展开区 pre-wrap 原样显示）
    expect(running.output).toBeUndefined()
    endSubagentRun('s1', 'scriptwriter', { ok: true, output: '{"guidance":"本轮让望舒登场","script":{}}' })
    const done = getSubagentRunStatus('s1', 'scriptwriter')
    expect(done.input).toContain('用户点名让望舒出场') // end 不丢 begin 留存的入参
    expect(done.output).toContain('本轮让望舒登场')
    // 失败路径：input 保留、output 不写
    beginSubagentRun('s2', 'scriptwriter', { input: '第二次入参' })
    endSubagentRun('s2', 'scriptwriter', { ok: false, error: '上游超时' })
    const failed = getSubagentRunStatus('s2', 'scriptwriter')
    expect(failed.input).toBe('第二次入参')
    expect(failed.output).toBeUndefined()
    expect(failed.error).toBe('上游超时')
  })

  it('运行条展示元数据由 runner 自描述，按当前会话全量读取并在结束后保留', () => {
    const presentation = {
      label: '设问',
      icon: 'list-checks',
      runningVerb: '制卷中',
      title: '塞西莉亚人格问卷'
    }
    beginSubagentRun('jianxin-session', 'personality-question-author:task-1', {
      input: '【后台制卷任务】',
      presentation
    })
    beginSubagentRun('other-session', 'personality-question-author:task-2', {
      presentation: { ...presentation, title: '其它会话问卷' }
    })

    expect(listAllSubagentRunStatuses('jianxin-session')).toEqual([
      expect.objectContaining({
        subagentId: 'personality-question-author:task-1',
        status: expect.objectContaining({ state: 'running', presentation })
      })
    ])
    endSubagentRun('jianxin-session', 'personality-question-author:task-1', { ok: true, output: '已交卷' })
    expect(getSubagentRunStatus('jianxin-session', 'personality-question-author:task-1').presentation)
      .toEqual(presentation)
  })

  it('内部信息流长度钳制：input/output 超上限裁到 20000 字', () => {
    beginSubagentRun('s1', 'scriptwriter', { input: 'x'.repeat(30000) })
    endSubagentRun('s1', 'scriptwriter', { ok: true, output: 'y'.repeat(30000) })
    const done = getSubagentRunStatus('s1', 'scriptwriter')
    expect(done.input.length).toBe(20000)
    expect(done.output.length).toBe(20000)
  })

  it('⑤formatSubagentRunDuration：<100ms 显示 <0.1s（毫秒级工具不再显示成疑似坏了的 0.0s）；60s 内一位小数、超过用 m+s', () => {
    expect(formatSubagentRunDuration(99)).toBe('<0.1s')
    expect(formatSubagentRunDuration(100)).toBe('0.1s')
    expect(formatSubagentRunDuration(2340)).toBe('2.3s')
    expect(formatSubagentRunDuration(65000)).toBe('1m05s')
    expect(formatSubagentRunDuration(-5)).toBe('<0.1s') // 负数钳 0，仍 <100ms
  })

  it('usage 原样落卡（缓存命中进运行卡·2026-07-12）：cacheReadTokens/cacheCreationTokens 不丢', () => {
    beginSubagentRun('s1', 'huiyu:1')
    endSubagentRun('s1', 'huiyu:1', {
      ok: true,
      usage: { promptTokens: 1000, completionTokens: 200, cacheReadTokens: 800, cacheCreationTokens: 50 }
    })
    const done = getSubagentRunStatus('s1', 'huiyu:1')
    expect(done.usage).toEqual({ promptTokens: 1000, completionTokens: 200, cacheReadTokens: 800, cacheCreationTokens: 50 })
  })

  // ---------- 工作流时间线（批G·2026-07-12） ----------

  it('timeline 追加：带 at 时间戳；未 begin 时 no-op；end 后保留供回看', () => {
    appendSubagentRunTimeline('sX', 'huiyu:1', { kind: 'turn', label: '第 1 轮' })
    expect(getSubagentRunStatus('sX', 'huiyu:1')).toBeNull()
    beginSubagentRun('s1', 'huiyu:1')
    appendSubagentRunTimeline('s1', 'huiyu:1', { kind: 'turn', label: '第 1 轮' })
    appendSubagentRunTimeline('s1', 'huiyu:1', { kind: 'tool', label: 'mapDraw', detail: '画临澜城' })
    const running = getSubagentRunStatus('s1', 'huiyu:1')
    expect(running.timeline).toHaveLength(2)
    expect(running.timeline[0]).toMatchObject({ kind: 'turn', label: '第 1 轮' })
    expect(running.timeline[1]).toMatchObject({ kind: 'tool', label: 'mapDraw', detail: '画临澜城' })
    expect(running.timeline[1].at).toBeGreaterThan(0)
    endSubagentRun('s1', 'huiyu:1', { ok: true, output: 'x' })
    expect(getSubagentRunStatus('s1', 'huiyu:1').timeline).toHaveLength(2)
  })

  it('timeline 封顶：只保留最近 80 条（淘汰最早的）', () => {
    beginSubagentRun('s1', 'huiyu:1')
    for (let index = 0; index < 85; index += 1) {
      appendSubagentRunTimeline('s1', 'huiyu:1', { kind: 'tool', label: `t${index}` })
    }
    const timeline = getSubagentRunStatus('s1', 'huiyu:1').timeline
    expect(timeline).toHaveLength(80)
    expect(timeline[0].label).toBe('t5')
    expect(timeline[79].label).toBe('t84')
  })

  it('settle：最近一条同名未定态工具行落定 success/error；找不到退化为追加已定态条目', () => {
    beginSubagentRun('s1', 'huiyu:1')
    appendSubagentRunTimeline('s1', 'huiyu:1', { kind: 'tool', label: 'mapDraw' })
    appendSubagentRunTimeline('s1', 'huiyu:1', { kind: 'tool', label: 'auditMap' })
    settleSubagentRunTimelineTool('s1', 'huiyu:1', 'mapDraw', 'success')
    settleSubagentRunTimelineTool('s1', 'huiyu:1', 'auditMap', 'error')
    let timeline = getSubagentRunStatus('s1', 'huiyu:1').timeline
    expect(timeline[0]).toMatchObject({ label: 'mapDraw', status: 'success' })
    expect(timeline[1]).toMatchObject({ label: 'auditMap', status: 'error' })
    // 没有对应未定行：退化追加，保证结果不丢
    settleSubagentRunTimelineTool('s1', 'huiyu:1', 'ghostTool', 'error')
    timeline = getSubagentRunStatus('s1', 'huiyu:1').timeline
    expect(timeline).toHaveLength(3)
    expect(timeline[2]).toMatchObject({ kind: 'tool', label: 'ghostTool', status: 'error' })
    // 退化追加无起点可算：不带耗时
    expect(timeline[2].durationMs).toBeUndefined()
  })

  it('耗时回填（批I）：工具行 settle 按 at 差值；轮行在新轮标记/end 时回填总时长且不覆盖已回填值', () => {
    beginSubagentRun('s1', 'huiyu:1')
    appendSubagentRunTimeline('s1', 'huiyu:1', { kind: 'turn', label: '第 1 轮' })
    appendSubagentRunTimeline('s1', 'huiyu:1', { kind: 'tool', label: 'mapDraw' })
    vi.advanceTimersByTime(2300)
    settleSubagentRunTimelineTool('s1', 'huiyu:1', 'mapDraw', 'success')
    let timeline = getSubagentRunStatus('s1', 'huiyu:1').timeline
    expect(timeline[1].durationMs).toBe(2300)
    expect(timeline[0].durationMs).toBeUndefined() // 轮行未换轮不回填
    vi.advanceTimersByTime(700)
    appendSubagentRunTimeline('s1', 'huiyu:1', { kind: 'turn', label: '第 2 轮' })
    timeline = getSubagentRunStatus('s1', 'huiyu:1').timeline
    expect(timeline[0].durationMs).toBe(3000) // 第1轮总时长=2300+700
    expect(timeline[2].durationMs).toBeUndefined()
    vi.advanceTimersByTime(500)
    endSubagentRun('s1', 'huiyu:1', { ok: true })
    timeline = getSubagentRunStatus('s1', 'huiyu:1').timeline
    expect(timeline[2].durationMs).toBe(500) // 末轮在 end 回填
    expect(timeline[0].durationMs).toBe(3000) // 已回填的不被 end 覆盖
  })
})
