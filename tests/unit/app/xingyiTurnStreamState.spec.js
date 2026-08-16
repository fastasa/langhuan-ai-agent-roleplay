import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  appendXingyiTurnStreamEntry,
  beginXingyiTurnStream,
  clearXingyiTurnStream,
  drainXingyiTurnStreamEntries,
  endXingyiTurnStream,
  feedXingyiTurnStreamProgress,
  markXingyiTurnIfNew,
  resetXingyiTurnStreamForTest,
  settleXingyiTurnStreamTool,
  xingyiTurnStreamState
} from '../../../src/app/xingyiTurnStreamState.ts'

// 星依当轮工作流实况（批G·2026-07-12）：onProgress 事件 → 模块级 reactive 流水；
// 映射语义与 subagentLoop 的运行卡 timeline 同构（轮次标记/工具行落定/detail 钳 120）。

describe('xingyiTurnStreamState · 星依当轮工作流', () => {
  beforeEach(() => resetXingyiTurnStreamForTest())

  it('begin 前不收事件；begin 后轮次标记+工具行 running→落定；end 只熄 running 保留流水', () => {
    feedXingyiTurnStreamProgress({ kind: 'tool-start', stage: 's', toolName: 'listWorlds', turnIndex: 0 })
    expect(xingyiTurnStreamState.entries).toHaveLength(0)

    beginXingyiTurnStream()
    expect(xingyiTurnStreamState.running).toBe(true)
    feedXingyiTurnStreamProgress({ kind: 'thought', stage: 's', toolName: '', thought: '先看看', turnIndex: 0 })
    feedXingyiTurnStreamProgress({ kind: 'tool-start', stage: 's', toolName: 'listWorlds', detail: '全部世界', turnIndex: 0 })
    feedXingyiTurnStreamProgress({ kind: 'tool-result', stage: 's', toolName: 'listWorlds', status: 'success', turnIndex: 0 })
    feedXingyiTurnStreamProgress({ kind: 'tool-start', stage: 's', toolName: 'dispatchMapWork', turnIndex: 1 })
    feedXingyiTurnStreamProgress({ kind: 'tool-result', stage: 's', toolName: 'dispatchMapWork', status: 'error', turnIndex: 1 })

    const labels = xingyiTurnStreamState.entries.map((e) => `${e.kind}:${e.label}${e.status ? ':' + e.status : ''}`)
    expect(labels).toEqual([
      'turn:第 1 轮',
      'tool:listWorlds:success',
      'turn:第 2 轮',
      'tool:dispatchMapWork:error'
    ])
    expect(xingyiTurnStreamState.entries[1].detail).toBe('全部世界')

    endXingyiTurnStream()
    expect(xingyiTurnStreamState.running).toBe(false)
    expect(xingyiTurnStreamState.entries).toHaveLength(4) // 结束保留供回看
  })

  it('新一轮 begin 清空上一轮；detail 保留全文；封顶 80 条', () => {
    beginXingyiTurnStream()
    feedXingyiTurnStreamProgress({ kind: 'tool-start', stage: 's', toolName: 'a', detail: 'y'.repeat(300), turnIndex: 0 })
    expect(xingyiTurnStreamState.entries.find((e) => e.kind === 'tool').detail).toHaveLength(300)

    beginXingyiTurnStream()
    expect(xingyiTurnStreamState.entries).toHaveLength(0) // 新一轮清空

    for (let index = 0; index < 85; index += 1) {
      feedXingyiTurnStreamProgress({ kind: 'tool-start', stage: 's', toolName: `t${index}`, turnIndex: 0 })
    }
    // 85 工具行 + 1 轮次标记 = 86 → 封顶 80，最早的被淘汰
    expect(xingyiTurnStreamState.entries).toHaveLength(80)
    expect(xingyiTurnStreamState.entries[79].label).toBe('t84')
  })

  it('耗时回填（批I）：工具行 settle 差值；轮行在换轮/end 时回填', () => {
    vi.useFakeTimers()
    try {
      beginXingyiTurnStream()
      feedXingyiTurnStreamProgress({ kind: 'tool-start', stage: 's', toolName: 'a', turnIndex: 0 })
      vi.advanceTimersByTime(1200)
      feedXingyiTurnStreamProgress({ kind: 'tool-result', stage: 's', toolName: 'a', status: 'success', turnIndex: 0 })
      const toolA = xingyiTurnStreamState.entries.find((e) => e.kind === 'tool' && e.label === 'a')
      expect(toolA.durationMs).toBe(1200)
      vi.advanceTimersByTime(300)
      feedXingyiTurnStreamProgress({ kind: 'tool-start', stage: 's', toolName: 'b', turnIndex: 1 })
      const turns = xingyiTurnStreamState.entries.filter((e) => e.kind === 'turn')
      expect(turns[0].durationMs).toBe(1500) // 第1轮=1200+300，换轮时回填
      expect(turns[1].durationMs).toBeUndefined()
      vi.advanceTimersByTime(400)
      endXingyiTurnStream()
      const turnsAfterEnd = xingyiTurnStreamState.entries.filter((e) => e.kind === 'turn')
      expect(turnsAfterEnd[1].durationMs).toBe(400) // 末轮在 end 回填
      expect(turnsAfterEnd[0].durationMs).toBe(1500) // 已回填的不被覆盖
    } finally {
      vi.useRealTimers()
    }
  })

  // 耗时归因错位修复（2026-07-12）：markXingyiTurnIfNew/appendXingyiTurnStreamEntry/settleXingyiTurnStreamTool
  // 是导出给 xingyiAgentHarness.ts 的模型调用前置埋点原语（与 subagentLoop.ts 的
  // markTimelineTurnIfNew/appendSubagentRunTimeline/settleSubagentRunTimelineTool 同构）。
  describe('模型调用前置埋点原语（markXingyiTurnIfNew/appendXingyiTurnStreamEntry/settleXingyiTurnStreamTool）', () => {
    it('running=false（未 begin）时三者均 no-op', () => {
      markXingyiTurnIfNew(0)
      appendXingyiTurnStreamEntry({ kind: 'tool', label: '模型思考' })
      settleXingyiTurnStreamTool('模型思考', 'success')
      expect(xingyiTurnStreamState.entries).toHaveLength(0)
    })

    it('running=true 时：markXingyiTurnIfNew 同 turnIndex 重复调用不重复 append（即 onProgress 兜底不会与前置埋点重复打轮标记）', () => {
      beginXingyiTurnStream()
      markXingyiTurnIfNew(0)
      markXingyiTurnIfNew(0)
      markXingyiTurnIfNew(0)
      expect(xingyiTurnStreamState.entries.filter((e) => e.kind === 'turn')).toHaveLength(1)
      markXingyiTurnIfNew(1)
      expect(xingyiTurnStreamState.entries.filter((e) => e.kind === 'turn')).toHaveLength(2)
    })

    it('append「模型思考」未定行 → settle success，带耗时；同轮再 append 一条不去重', () => {
      vi.useFakeTimers()
      try {
        beginXingyiTurnStream()
        markXingyiTurnIfNew(0)
        appendXingyiTurnStreamEntry({ kind: 'tool', label: '模型思考' })
        vi.advanceTimersByTime(50)
        settleXingyiTurnStreamTool('模型思考', 'success')
        const first = xingyiTurnStreamState.entries.find((e) => e.kind === 'tool' && e.label === '模型思考')
        expect(first.status).toBe('success')
        expect(first.durationMs).toBe(50)
        // 同轮结构化重试再调模型：再 append 一条「模型思考」不去重，settle 为 error
        appendXingyiTurnStreamEntry({ kind: 'tool', label: '模型思考' })
        settleXingyiTurnStreamTool('模型思考', 'error')
        const thinkEntries = xingyiTurnStreamState.entries.filter((e) => e.kind === 'tool' && e.label === '模型思考')
        expect(thinkEntries).toHaveLength(2)
        expect(thinkEntries[1].status).toBe('error')
      } finally {
        vi.useRealTimers()
      }
    })
  })

  // 过程流内联持久化计划（批J·2026-07-13）：drain 收编给消息落库、clear 切会话防串台。
  describe('drainXingyiTurnStreamEntries / clearXingyiTurnStream（内联持久化收编+防串台）', () => {
    it('drain 返回全部条目且单例清空；running 不受影响', () => {
      beginXingyiTurnStream()
      markXingyiTurnIfNew(0)
      appendXingyiTurnStreamEntry({ kind: 'tool', label: 'listWorlds', status: 'success' })
      expect(xingyiTurnStreamState.entries).toHaveLength(2)

      const drained = drainXingyiTurnStreamEntries()
      expect(drained.map((e) => e.label)).toEqual(['第 1 轮', 'listWorlds'])
      expect(xingyiTurnStreamState.entries).toHaveLength(0)
      expect(xingyiTurnStreamState.running).toBe(true) // drain 不动 running
    })

    it('drain 后新条目继续积累（分段语义：一次 run 产出多条消息各自收编自己那一段）', () => {
      beginXingyiTurnStream()
      appendXingyiTurnStreamEntry({ kind: 'tool', label: 'a' })
      drainXingyiTurnStreamEntries()

      appendXingyiTurnStreamEntry({ kind: 'tool', label: 'b' })
      expect(xingyiTurnStreamState.entries.map((e) => e.label)).toEqual(['b'])

      const drainedAgain = drainXingyiTurnStreamEntries()
      expect(drainedAgain.map((e) => e.label)).toEqual(['b'])
      expect(xingyiTurnStreamState.entries).toHaveLength(0)
    })

    it('空单例 drain 返回空数组，不报错', () => {
      expect(drainXingyiTurnStreamEntries()).toEqual([])
    })

    it('clear 清空 entries 且熄灭 running', () => {
      beginXingyiTurnStream()
      appendXingyiTurnStreamEntry({ kind: 'tool', label: 'a' })
      expect(xingyiTurnStreamState.entries).toHaveLength(1)

      clearXingyiTurnStream()
      expect(xingyiTurnStreamState.entries).toHaveLength(0)
      expect(xingyiTurnStreamState.running).toBe(false)
    })
  })
})
