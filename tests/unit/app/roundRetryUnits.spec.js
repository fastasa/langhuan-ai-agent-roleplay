import { describe, expect, it, vi } from 'vitest'
import {
  registerRoundRetryUnit,
  listRoundRetryUnits,
  takeRoundRetryUnit,
  clearRoundRetryUnits,
  runWithAutoRetry
} from '../../../src/app/roundRetryUnits.ts'

function actorUnit(overrides = {}) {
  return {
    id: 'actor:char_1',
    kind: 'actor',
    label: '张元英 消息生成',
    sessionId: 'sess_retry',
    anchorMessageId: 100,
    lastError: '供应商 500',
    attempts: 1,
    payload: { kind: 'actor', speakerTargetId: 'char_1', userText: '喝吧' },
    ...overrides
  }
}

describe('roundRetryUnits 注册表（真机五验④·轮内失败单元）', () => {
  it('登记 → 列出摘要（不含 payload）→ take 取出即移除', () => {
    clearRoundRetryUnits('sess_retry')
    registerRoundRetryUnit(actorUnit())
    const listed = listRoundRetryUnits('sess_retry')
    expect(listed).toHaveLength(1)
    expect(listed[0]).toMatchObject({ id: 'actor:char_1', kind: 'actor', label: '张元英 消息生成', lastError: '供应商 500' })
    expect('payload' in listed[0]).toBe(false)
    const taken = takeRoundRetryUnit('sess_retry', 'actor:char_1')
    expect(taken?.payload).toMatchObject({ kind: 'actor', speakerTargetId: 'char_1' })
    expect(listRoundRetryUnits('sess_retry')).toHaveLength(0)
  })

  it('同 id 重复登记=覆盖并累计 attempts；不同轮锚登记=自动清旧轮残留', () => {
    clearRoundRetryUnits('sess_retry')
    registerRoundRetryUnit(actorUnit())
    registerRoundRetryUnit(actorUnit({ lastError: '第二次还是 500' }))
    let listed = listRoundRetryUnits('sess_retry')
    expect(listed).toHaveLength(1)
    expect(listed[0].attempts).toBe(2)
    expect(listed[0].lastError).toBe('第二次还是 500')
    // 新一轮（锚变）：旧轮单元自动清掉，注册表只描述当前这一轮。
    registerRoundRetryUnit(actorUnit({ id: 'narration:env:0', kind: 'narration', anchorMessageId: 200 }))
    listed = listRoundRetryUnits('sess_retry')
    expect(listed).toHaveLength(1)
    expect(listed[0].id).toBe('narration:env:0')
    // 按轮锚过滤：旧锚查询不命中（防跨轮残留误列）。
    expect(listRoundRetryUnits('sess_retry', 100)).toHaveLength(0)
    expect(listRoundRetryUnits('sess_retry', 200)).toHaveLength(1)
    clearRoundRetryUnits('sess_retry')
  })

  it('clearRoundRetryUnits(sessionId, keepAnchor)：只清不属于该轮锚的旧轮残留', () => {
    clearRoundRetryUnits('sess_retry2')
    registerRoundRetryUnit(actorUnit({ sessionId: 'sess_retry2', anchorMessageId: 300 }))
    clearRoundRetryUnits('sess_retry2', 300)
    expect(listRoundRetryUnits('sess_retry2')).toHaveLength(1)
    clearRoundRetryUnits('sess_retry2', 400)
    expect(listRoundRetryUnits('sess_retry2')).toHaveLength(0)
  })
})

describe('runWithAutoRetry 自动重试缓冲（真机五验④）', () => {
  it('首次失败 → 缓冲后自动重试成功；onRetry 收到通知', async () => {
    let calls = 0
    const onRetry = vi.fn()
    const result = await runWithAutoRetry(async () => {
      calls += 1
      if (calls === 1) throw new Error('供应商抖动')
      return 'ok'
    }, { delayMs: 1, onRetry })
    expect(result).toBe('ok')
    expect(calls).toBe(2)
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('重试次数用尽仍失败 → 抛最后一次错误', async () => {
    let calls = 0
    await expect(runWithAutoRetry(async () => {
      calls += 1
      throw new Error(`第${calls}次失败`)
    }, { retries: 2, delayMs: 1 })).rejects.toThrow('第3次失败')
    expect(calls).toBe(3)
  })

  it('AbortError 永不重试（用户主动停下不算易失败环节）', async () => {
    let calls = 0
    await expect(runWithAutoRetry(async () => {
      calls += 1
      const err = new Error('已取消')
      err.name = 'AbortError'
      throw err
    }, { delayMs: 1 })).rejects.toThrow('已取消')
    expect(calls).toBe(1)
  })

  it('shouldAbort 为真 → 不再重试，原错误上抛', async () => {
    let calls = 0
    await expect(runWithAutoRetry(async () => {
      calls += 1
      throw new Error('软停中')
    }, { delayMs: 1, shouldAbort: () => true })).rejects.toThrow('软停中')
    expect(calls).toBe(1)
  })
})
