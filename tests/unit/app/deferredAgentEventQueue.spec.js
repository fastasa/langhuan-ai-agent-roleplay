import { beforeEach, describe, expect, it } from 'vitest'
import {
  ackDeferredAgentEvents,
  activateDeferredAgentRun,
  claimDeferredAgentEvents,
  closeDeferredAgentRun,
  enqueueDeferredScriptwriterReport,
  enqueueDeferredWorldEvolutionReport,
  listDeferredAgentEvents,
  releaseDeferredAgentEvents,
  renderDeferredScriptwriterEvents
} from '../../../src/app/deferredAgentEventQueue.ts'

const report = {
  confirmedFacts: [{ fact: '用户已经进入钟楼', evidence: '本轮消息' }],
  candidateJudgments: [{ judgment: '钟声伏笔可能触发', seedIds: ['seed_clock'] }],
  suggestedActions: [{ action: '读取种子详情后再决定是否推进' }]
}

beforeEach(() => localStorage.clear())

describe('deferredAgentEventQueue', () => {
  it('claim -> ack 单次消费并保留审计记录', () => {
    const event = enqueueDeferredScriptwriterReport({ sessionId: 's1', originRunId: 'r1', sourceCallId: 'c1', payload: report })
    activateDeferredAgentRun('s1', 'r1')
    expect(claimDeferredAgentEvents('s1', 'r1').map((item) => item.id)).toEqual([event.id])
    ackDeferredAgentEvents('s1', 'r1', [event.id])
    expect(claimDeferredAgentEvents('s1', 'r1')).toEqual([])
    expect(listDeferredAgentEvents('s1')[0]).toMatchObject({ status: 'consumed', consumedByRunId: 'r1' })
  })

  it('模型失败 release 后同轮可重试，切会话和陈旧 runId 不能抢占', () => {
    const event = enqueueDeferredScriptwriterReport({ sessionId: 's1', originRunId: 'old', sourceCallId: 'c1', payload: report })
    activateDeferredAgentRun('s1', 'new')
    expect(claimDeferredAgentEvents('s1', 'old')).toEqual([])
    expect(claimDeferredAgentEvents('s2', 'new')).toEqual([])
    expect(claimDeferredAgentEvents('s1', 'new')).toHaveLength(1)
    releaseDeferredAgentEvents('s1', 'new', [event.id])
    expect(claimDeferredAgentEvents('s1', 'new')).toHaveLength(1)
    closeDeferredAgentRun('s1', 'new')
    expect(listDeferredAgentEvents('s1')[0].status).toBe('pending')
  })

  it('渲染严格区分事实、候选判断和建议动作', () => {
    const event = enqueueDeferredScriptwriterReport({ sessionId: 's1', originRunId: 'r1', sourceCallId: 'c1', payload: report })
    const block = renderDeferredScriptwriterEvents([event])
    expect(block).toContain('已确认事实')
    expect(block).toContain('候选判断（不是事实')
    expect(block).toContain('建议动作（不是已执行结果')
    expect(block).toContain('seed_clock')
  })

  it('当前帷幕相关的后台演化以已落账高优先回报进入下一活动轮', () => {
    const event = enqueueDeferredWorldEvolutionReport({
      sessionId: 's1', originRunId: 'r1', sourceCallId: 'evolve_1',
      payload: { effects: [{ seedId: 'seed_clock', summary: '钟楼已经封闭', evidence: '世界时间到期' }] }
    })
    activateDeferredAgentRun('s1', 'r2')
    const claimed = claimDeferredAgentEvents('s1', 'r2')
    expect(claimed).toHaveLength(1)
    expect(claimed[0]).toMatchObject({ id: event.id, kind: 'world_evolution_report' })
    const block = renderDeferredScriptwriterEvents(claimed)
    expect(block).toContain('已经写入世界真值')
    expect(block).toContain('高优先处理')
    expect(block).toContain('钟楼已经封闭')
  })
})
