import { describe, it, expect, vi, beforeEach } from 'vitest'

// 模拟投影仓储：可控的投影行 + 记录单条投影调用。
const state = {
  projections: [],
  runCalls: []
}

vi.mock('../../../src/repositories/chatRepository.ts', () => ({
  fetchChatPersonalityModelObservationsBySessionId: vi.fn(async () => ({
    projections: state.projections,
    visibility: [],
    traces: []
  })),
  runChatMessageProjectionBySessionId: vi.fn(async (sessionId, messageId) => {
    state.runCalls.push({ sessionId, messageId })
    return { status: 'complete' }
  })
}))

import { useSessionProjectionBatch } from '../../../src/composables/app/useSessionProjectionBatch.ts'

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

// 文本消息默认可投影；用 messageKind 排除系统/旁白调试。
const msg = (id, extra = {}) => ({ id, role: 'assistant', content: `内容${id}`, ...extra })

describe('useSessionProjectionBatch', () => {
  beforeEach(() => {
    state.projections = []
    state.runCalls = []
  })

  function setup(messages) {
    const toast = vi.fn()
    const batch = useSessionProjectionBatch({
      sessionId: () => 's1',
      messages: () => messages,
      isProjectionMode: () => true,
      toast
    })
    return { batch, toast }
  }

  it('筛出"该投影且未成功投影"的消息，排除已成功/系统/旁白调试/空内容', async () => {
    state.projections = [
      { messageId: 1, status: 'complete', objectiveFact: '已投影事实' }, // 已成功 → 排除
      { messageId: 2, status: 'failed', objectiveFact: '' }              // 失败 → 仍算未投影
    ]
    const messages = [
      msg(1),                                   // 已成功投影 → 排除
      msg(2),                                   // 失败 → 计入
      msg(3),                                   // 无投影行 → 计入
      msg(4, { messageKind: 'system' }),        // 系统 → 排除
      msg(5, { messageKind: 'narration_debug' }), // 旁白调试 → 排除
      msg(6, { content: '   ' })                // 空内容 → 排除
    ]
    const { batch } = setup(messages)
    await flush() // 等 immediate watch 的 reload 完成
    expect(batch.unprojectedCount.value).toBe(2)
    expect(batch.hasUnprojected.value).toBe(true)
  })

  it('runBatch 对每条未投影消息调用单条投影，并汇总成功 toast', async () => {
    state.projections = []
    const messages = [msg(10), msg(11), msg(12)]
    const { batch, toast } = setup(messages)
    await flush()
    expect(batch.unprojectedCount.value).toBe(3)

    await batch.runBatch()
    const projectedIds = state.runCalls.map((c) => c.messageId).sort((a, b) => a - b)
    expect(projectedIds).toEqual([10, 11, 12])
    expect(state.runCalls.every((c) => c.sessionId === 's1')).toBe(true)
    expect(batch.running.value).toBe(false)
    // 最后一条 toast 是完成汇总
    const lastToast = toast.mock.calls.at(-1)
    expect(String(lastToast?.[0])).toContain('批量投影完成')
  })

  it('没有未投影消息时 runBatch 直接提示，不发起投影', async () => {
    state.projections = [{ messageId: 20, status: 'complete', objectiveFact: 'x' }]
    const { batch, toast } = setup([msg(20)])
    await flush()
    expect(batch.hasUnprojected.value).toBe(false)

    await batch.runBatch()
    expect(state.runCalls).toHaveLength(0)
    expect(toast).toHaveBeenCalledWith('没有需要投影的消息', 'info')
  })
})
