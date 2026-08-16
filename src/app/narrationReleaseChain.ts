/** 旁白保序落库链（串行压缩批C1·2026-07-13）：生成并行、落库按 claim 顺序串行——
 *  持久序（服务端按消息 id ASC）必须与编排声明序一致，落库这一步不能乱序；生成（callAI 等耗时操作）
 *  可以并行——先生成完的也要等前面所有槽位都「落库完成」（调用 done()）后才允许自己落库（wait() 才 resolve）。
 *  用法：claim() 按调用顺序拿到一个槽位；落库前 await gate.wait()，落库尝试结束后（无论成功/失败）必须调
 *  gate.done()（放在 finally 里）——否则后继槽位会永久卡死。 */
export interface NarrationReleaseChainGate {
  /** 落库前调用：等前面所有槽位都已 done() 才 resolve。 */
  wait(): Promise<void>
  /** 落库尝试结束后调用（无论成功/失败都必须调用一次）：放行下一槽位。重复调用是安全的（只生效一次）。 */
  done(): void
}

export function createNarrationReleaseChain(): { claim(): NarrationReleaseChainGate } {
  // tail：上一个槽位的完成信号；每次 claim 都把 tail 换成自己的完成 promise，形成一条链。
  let tail: Promise<void> = Promise.resolve()
  return {
    claim(): NarrationReleaseChainGate {
      const wait = tail
      let doneCalled = false
      let resolveDone: () => void = () => {}
      tail = new Promise<void>((resolve) => { resolveDone = resolve })
      return {
        wait: () => wait,
        done: () => {
          if (doneCalled) return
          doneCalled = true
          resolveDone()
        }
      }
    }
  }
}
