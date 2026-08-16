import { describe, it, expect, beforeEach } from 'vitest'
import {
  acquireModelSlot,
  attachReleaseToResponse,
  __resetModelConcurrencyGates,
  __getModelConcurrencyGateState
} from '../../../server/application/ai/modelConcurrencyGate.ts'

const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms))

describe('server modelConcurrencyGate', () => {
  beforeEach(() => {
    __resetModelConcurrencyGates()
  })

  it('在途令牌数永不超过 per-call 上限，超出的排队', async () => {
    const key = 'deepseek'
    const r1 = await acquireModelSlot(key, 2)
    const r2 = await acquireModelSlot(key, 2)
    expect(__getModelConcurrencyGateState(key)).toEqual({ limit: 2, active: 2, waiting: 0 })

    let third = null
    acquireModelSlot(key, 2).then((release) => { third = release })
    await tick()
    expect(third).toBeNull()
    expect(__getModelConcurrencyGateState(key).waiting).toBe(1)

    r1()
    await tick()
    expect(third).not.toBeNull()
    expect(__getModelConcurrencyGateState(key)).toEqual({ limit: 2, active: 2, waiting: 0 })
    r2(); third()
    await tick()
    expect(__getModelConcurrencyGateState(key).active).toBe(0)
  })

  it('下次取令牌传入更大的上限会立即放行排队者（配置变更即生效）', async () => {
    const key = 'x'
    const r1 = await acquireModelSlot(key, 1) // active=1
    let second = null
    acquireModelSlot(key, 1).then((r) => { second = r }) // 排队
    await tick()
    expect(second).toBeNull()

    // 配置改大：下一次 acquire 传入 limit=2，drain 立即放行已排队的 second（active=2）
    let third = null
    acquireModelSlot(key, 2).then((r) => { third = r }) // 自身排在 second 之后
    await tick()
    expect(second).not.toBeNull()       // 被 drain 放行
    expect(third).toBeNull()            // r1 仍持有，active=2 已满，third 继续排队
    expect(__getModelConcurrencyGateState(key).limit).toBe(2)

    r1()
    await tick()
    expect(third).not.toBeNull()        // r1 释放后 third 补位
    second(); third()
    await tick()
    expect(__getModelConcurrencyGateState(key).active).toBe(0)
  })

  it('不同预设各自独立计数', async () => {
    const ra = await acquireModelSlot('a', 1)
    let aWaited = null
    acquireModelSlot('a', 1).then((r) => { aWaited = r })
    const rb = await acquireModelSlot('b', 1)
    await tick()
    expect(aWaited).toBeNull()
    expect(__getModelConcurrencyGateState('b').active).toBe(1)
    ra(); rb()
    await tick()
    aWaited?.()
  })

  it('释放幂等；非法上限回退默认 6', async () => {
    const r = await acquireModelSlot('idem', 0)
    expect(__getModelConcurrencyGateState('idem').limit).toBe(6)
    expect(__getModelConcurrencyGateState('idem').active).toBe(1)
    r(); r(); r()
    expect(__getModelConcurrencyGateState('idem').active).toBe(0)
  })

  it('压测：limit=3 并发 20，峰值不超过 3', async () => {
    const key = 'stress'
    let active = 0
    let peak = 0
    const tasks = Array.from({ length: 20 }, async () => {
      const release = await acquireModelSlot(key, 3)
      active += 1
      peak = Math.max(peak, active)
      await tick(5)
      active -= 1
      release()
    })
    await Promise.all(tasks)
    expect(peak).toBeLessThanOrEqual(3)
    expect(__getModelConcurrencyGateState(key).active).toBe(0)
  })

  it('attachReleaseToResponse：body 读完后释放令牌', async () => {
    const key = 'resp'
    const release = await acquireModelSlot(key, 1)
    expect(__getModelConcurrencyGateState(key).active).toBe(1)

    const wrapped = attachReleaseToResponse(new Response('hello-world'), release)
    // 读完 body 前仍持有
    expect(__getModelConcurrencyGateState(key).active).toBe(1)
    const text = await wrapped.text()
    expect(text).toBe('hello-world')
    // 读完即释放
    expect(__getModelConcurrencyGateState(key).active).toBe(0)
  })

  it('attachReleaseToResponse：取消流也会释放令牌', async () => {
    const key = 'cancel'
    const release = await acquireModelSlot(key, 1)
    const wrapped = attachReleaseToResponse(new Response('streamed-body'), release)
    await wrapped.body.cancel('abort')
    await tick()
    expect(__getModelConcurrencyGateState(key).active).toBe(0)
  })

  it('attachReleaseToResponse：上游 body 空闲超时即断流并归还令牌（根治卡死）', async () => {
    const key = 'idle-stall'
    const release = await acquireModelSlot(key, 1)
    // 构造「发一块后永不再发、也不收尾」的 stalled 上游流（模拟拿到响应头后断流）。
    const stalledBody = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('partial'))
        // 之后永不 enqueue / close → 永久 stall
      }
    })
    const wrapped = attachReleaseToResponse(new Response(stalledBody), release, 50)
    const reader = wrapped.body.getReader()
    const first = await reader.read()
    expect(new TextDecoder().decode(first.value)).toBe('partial')
    // 第一块之后上游静默 → 50ms 空闲超时触发：下一次 read reject、令牌归还，不再永久挂。
    await expect(reader.read()).rejects.toMatchObject({ name: 'AbortError' })
    await tick()
    expect(__getModelConcurrencyGateState(key).active).toBe(0)
  })

  it('attachReleaseToResponse：正常读完不被空闲超时误伤（计时每块重置）', async () => {
    const key = 'idle-ok'
    const release = await acquireModelSlot(key, 1)
    const wrapped = attachReleaseToResponse(new Response('hello-world'), release, 50)
    const text = await wrapped.text()
    expect(text).toBe('hello-world')
    expect(__getModelConcurrencyGateState(key).active).toBe(0)
  })

  it('attachReleaseToResponse：无 body 立即释放', async () => {
    const key = 'nobody'
    const release = await acquireModelSlot(key, 1)
    const empty = new Response(null, { status: 204 })
    attachReleaseToResponse(empty, release)
    expect(__getModelConcurrencyGateState(key).active).toBe(0)
  })

  // 批次 F 前置补强：排队取令牌可被取消，取消后出队、不滞留占位。
  it('排队期间被 abort：出队并拒绝，不占用令牌', async () => {
    const key = 'abort-queue'
    const r1 = await acquireModelSlot(key, 1) // active=1，占满
    const controller = new AbortController()
    let rejected = null
    const queued = acquireModelSlot(key, 1, controller.signal).catch((err) => { rejected = err })
    await tick()
    expect(__getModelConcurrencyGateState(key).waiting).toBe(1)

    controller.abort()
    await queued
    expect(rejected).not.toBeNull()
    expect(rejected.name).toBe('AbortError')
    // 出队后等待数归零、在途仍只有 r1，未泄漏令牌
    expect(__getModelConcurrencyGateState(key)).toEqual({ limit: 1, active: 1, waiting: 0 })

    r1()
    await tick()
    expect(__getModelConcurrencyGateState(key).active).toBe(0)
  })

  it('传入已 abort 的 signal：立即拒绝，不入队', async () => {
    const key = 'pre-aborted'
    const controller = new AbortController()
    controller.abort()
    await expect(acquireModelSlot(key, 2, controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
    expect(__getModelConcurrencyGateState(key)).toBeNull()
  })

  it('取消一个排队者不影响其后排队者正常补位', async () => {
    const key = 'abort-mixed'
    const r1 = await acquireModelSlot(key, 1)
    const controller = new AbortController()
    acquireModelSlot(key, 1, controller.signal).catch(() => {}) // 排队者 A（将被取消）
    let bGot = null
    acquireModelSlot(key, 1).then((r) => { bGot = r }) // 排队者 B
    await tick()
    expect(__getModelConcurrencyGateState(key).waiting).toBe(2)

    controller.abort() // A 出队
    await tick()
    expect(__getModelConcurrencyGateState(key).waiting).toBe(1)

    r1() // 释放 → B 补位
    await tick()
    expect(bGot).not.toBeNull()
    expect(__getModelConcurrencyGateState(key)).toEqual({ limit: 1, active: 1, waiting: 0 })
    bGot()
    await tick()
    expect(__getModelConcurrencyGateState(key).active).toBe(0)
  })
})
