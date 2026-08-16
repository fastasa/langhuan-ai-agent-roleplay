import { describe, it, expect } from 'vitest'
import { createNarrationReleaseChain } from '../../../src/app/narrationReleaseChain'

/** 造一个「可外部控制何时 resolve」的 deferred，模拟生成耗时不同、完成顺序打乱。 */
function createDeferred() {
  let resolve
  const promise = new Promise((res) => { resolve = res })
  return { promise, resolve }
}

describe('narrationReleaseChain', () => {
  it('单槽（唯一 claim）：wait() 立即 resolve，不阻塞', async () => {
    const chain = createNarrationReleaseChain()
    const gate = chain.claim()
    const order = []
    await gate.wait()
    order.push('waited')
    gate.done()
    expect(order).toEqual(['waited'])
  })

  it('按 claim 序释放：后 claim 的 wait 必须等前面所有 claim 都 done() 才 resolve', async () => {
    const chain = createNarrationReleaseChain()
    const gateA = chain.claim()
    const gateB = chain.claim()
    const gateC = chain.claim()
    const order = []

    const taskA = (async () => {
      await gateA.wait()
      order.push('A-persist')
      gateA.done()
    })()
    const taskB = (async () => {
      await gateB.wait()
      order.push('B-persist')
      gateB.done()
    })()
    const taskC = (async () => {
      await gateC.wait()
      order.push('C-persist')
      gateC.done()
    })()

    await Promise.all([taskC, taskB, taskA])
    expect(order).toEqual(['A-persist', 'B-persist', 'C-persist'])
  })

  it('乱序完成时序：即使各槽「生成」耗时不同（B 最先算完、A 最后），落库仍按 claim 序执行', async () => {
    const chain = createNarrationReleaseChain()
    const gateA = chain.claim()
    const gateB = chain.claim()
    const gateC = chain.claim()
    const genA = createDeferred()
    const genB = createDeferred()
    const genC = createDeferred()
    const order = []

    const run = (label, gate, generation) => (async () => {
      await generation.promise // 模拟并行生成（各自耗时不同，先完成的先到这里）
      await gate.wait() // 落库前必须等前序槽位落库完成
      order.push(label)
      gate.done()
    })()

    const tasks = Promise.all([
      run('A', gateA, genA),
      run('B', gateB, genB),
      run('C', gateC, genC)
    ])
    // B 先「生成」完，A 最后完；即便如此，落库顺序仍必须=claim 声明序 A→B→C。
    genB.resolve()
    await Promise.resolve()
    genC.resolve()
    await Promise.resolve()
    genA.resolve()
    await tasks
    expect(order).toEqual(['A', 'B', 'C'])
  })

  it('错误路径：某槽在 wait() 之后、持久化抛错，只要 finally 里调用了 done()，后继槽正常放行不阻塞', async () => {
    const chain = createNarrationReleaseChain()
    const gateA = chain.claim()
    const gateB = chain.claim()
    const order = []

    const taskA = (async () => {
      await gateA.wait()
      try {
        order.push('A-attempt')
        throw new Error('落库失败')
      } catch (error) {
        order.push(`A-error:${error.message}`)
      } finally {
        gateA.done()
      }
    })()
    const taskB = (async () => {
      await gateB.wait()
      order.push('B-persist')
      gateB.done()
    })()

    await Promise.all([taskA, taskB])
    expect(order).toEqual(['A-attempt', 'A-error:落库失败', 'B-persist'])
  })

  it('done() 重复调用是安全的（不会二次 resolve 或抛错）', async () => {
    const chain = createNarrationReleaseChain()
    const gateA = chain.claim()
    const gateB = chain.claim()
    gateA.done()
    gateA.done()
    gateA.done()
    await expect(gateB.wait()).resolves.toBeUndefined()
  })
})
