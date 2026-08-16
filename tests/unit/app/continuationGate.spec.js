/**
 * @vitest-environment node
 * 连续工作护栏·共享内核（内核统一批）回归锁：
 * 空转未结束→注入续做提示并续轮 / 已结束不拦 / 有工具调用不拦 / 超次不拦 / onNudge 旁路回调。
 */
import { describe, it, expect } from 'vitest'
import { createEmptyTurnContinuationGate } from '../../../src/app/agentRuntime/continuationGate'

describe('createEmptyTurnContinuationGate', () => {
  it('空转且未结束、未超次 → 注入续做提示（continuation patch）', () => {
    const gate = createEmptyTurnContinuationGate({ maxNudges: 2, isFinished: () => false, buildNudge: () => 'CONTINUE' })
    const r1 = gate.run({ modelToolCalls: [], modelMessage: { content: '稍等' } })
    expect(r1.injectMessages).toHaveLength(1)
    expect(r1.injectMessages[0]).toMatchObject({ role: 'user', content: 'CONTINUE' })
    // 第二次仍在预算内 → 继续注入
    const r2 = gate.run({ modelToolCalls: [] })
    expect(r2.injectMessages).toHaveLength(1)
    // 第三次超过 maxNudges → 不再拦（防死循环，按原语义收束）
    const r3 = gate.run({ modelToolCalls: [] })
    expect(r3).toBeUndefined()
  })

  it('已结束（isFinished=true）→ 不拦', () => {
    const gate = createEmptyTurnContinuationGate({ maxNudges: 3, isFinished: () => true, buildNudge: () => 'C' })
    expect(gate.run({ modelToolCalls: [], modelMessage: { content: '做完啦' } })).toBeUndefined()
  })

  it('本轮有工具调用 → 不拦（在干活）', () => {
    const gate = createEmptyTurnContinuationGate({ maxNudges: 3, isFinished: () => false, buildNudge: () => 'C' })
    expect(gate.run({ modelToolCalls: [{ toolName: 'searchWorldText' }] })).toBeUndefined()
  })

  it('onNudge 旁路回调收到注入文案与次数', () => {
    const notes = []
    const gate = createEmptyTurnContinuationGate({
      maxNudges: 2,
      isFinished: () => false,
      buildNudge: (_event, index) => `N${index}`,
      onNudge: (note, index) => notes.push(`${index}:${note}`)
    })
    gate.run({ modelToolCalls: [] })
    gate.run({ modelToolCalls: [] })
    expect(notes).toEqual(['1:N1', '2:N2'])
  })
})
