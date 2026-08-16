import { describe, it, expect, vi } from 'vitest'
import { runWithConcurrencyPool } from '../../../src/utils/concurrencyPool.js'

const tick = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

describe('runWithConcurrencyPool', () => {
  it('并发数不超过 limit，且全部完成、结果保序', async () => {
    let active = 0
    let peak = 0
    const worker = async (item) => {
      active += 1
      peak = Math.max(peak, active)
      await tick(10)
      active -= 1
      return `ok-${item}`
    }
    const items = Array.from({ length: 10 }, (_, i) => i)
    const results = await runWithConcurrencyPool(items, worker, { limit: 3 })
    expect(peak).toBeLessThanOrEqual(3)
    expect(results).toHaveLength(10)
    expect(results.every((r) => r.status === 'fulfilled')).toBe(true)
    expect(results.map((r) => r.value)).toEqual(items.map((i) => `ok-${i}`))
  })

  it('乱序完成仍按 items 顺序返回结果', async () => {
    const items = [{ id: 'a', delay: 30 }, { id: 'b', delay: 5 }, { id: 'c', delay: 15 }]
    const worker = async (item) => {
      await tick(item.delay)
      return item.id
    }
    const results = await runWithConcurrencyPool(items, worker, { limit: 3 })
    expect(results.map((r) => r.value)).toEqual(['a', 'b', 'c'])
  })

  it('单项失败可重试并最终成功，attempts 计数正确', async () => {
    const seen = {}
    const worker = async (item, i) => {
      seen[i] = (seen[i] || 0) + 1
      if (seen[i] < 3) throw new Error('transient')
      return 'recovered'
    }
    const results = await runWithConcurrencyPool([0], worker, { limit: 1, retries: 2, retryDelayMs: 0 })
    expect(results[0].status).toBe('fulfilled')
    expect(results[0].value).toBe('recovered')
    expect(results[0].attempts).toBe(3)
  })

  it('重试次数耗尽后标记 rejected，不抛错', async () => {
    const worker = async () => { throw new Error('always') }
    const results = await runWithConcurrencyPool([0], worker, { limit: 1, retries: 2, retryDelayMs: 0 })
    expect(results[0].status).toBe('rejected')
    expect(results[0].attempts).toBe(3)
    expect(String(results[0].error?.message)).toContain('always')
  })

  it('shouldRetry 返回 false 时不重试', async () => {
    let calls = 0
    const worker = async () => { calls += 1; throw new Error('nope') }
    const results = await runWithConcurrencyPool([0], worker, { limit: 1, retries: 5, retryDelayMs: 0, shouldRetry: () => false })
    expect(calls).toBe(1)
    expect(results[0].status).toBe('rejected')
    expect(results[0].attempts).toBe(1)
  })

  it('单项失败不拖垮其它项', async () => {
    const worker = async (item) => {
      if (item === 1) throw new Error('boom')
      return item * 10
    }
    const results = await runWithConcurrencyPool([0, 1, 2], worker, { limit: 2, retries: 0 })
    expect(results.map((r) => r.status)).toEqual(['fulfilled', 'rejected', 'fulfilled'])
    expect(results[0].value).toBe(0)
    expect(results[2].value).toBe(20)
  })

  it('onRetry 在每次重试前回调', async () => {
    const onRetry = vi.fn()
    let calls = 0
    const worker = async () => { calls += 1; if (calls < 2) throw new Error('x'); return 'ok' }
    await runWithConcurrencyPool([0], worker, { limit: 1, retries: 3, retryDelayMs: 0, onRetry })
    expect(onRetry).toHaveBeenCalledTimes(1)
    expect(onRetry.mock.calls[0][0]).toMatchObject({ index: 0, attempt: 1 })
  })

  it('已取消的 signal 直接把所有项标记 rejected', async () => {
    const controller = new AbortController()
    controller.abort()
    const worker = vi.fn(async () => 'ok')
    const results = await runWithConcurrencyPool([0, 1], worker, { limit: 2, signal: controller.signal })
    expect(results.every((r) => r.status === 'rejected')).toBe(true)
    expect(worker).not.toHaveBeenCalled()
  })

  it('limit 大于 items 长度时正常完成', async () => {
    const worker = async (item) => item + 1
    const results = await runWithConcurrencyPool([0, 1], worker, { limit: 10 })
    expect(results.map((r) => r.value)).toEqual([1, 2])
  })
})
