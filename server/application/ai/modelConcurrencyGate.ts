/**
 * 服务端模型并发令牌池（按预设 key 共享）。
 *
 * 这是所有"服务端 → 模型供应商"调用的唯一咽喉处的并发闸：聊天回复代理、消息投影、
 * 起标题、AI 新闻等全部经由 callAIWithFallback 汇聚到这里。按预设（端点/凭据）取令牌，
 * 取不到就排队，确保同一预设的总在途请求数永不超过该预设配置的 max_concurrency，
 * 从根上避免"投影 + 新消息加起来撑爆供应商并发"导致的报错。
 *
 * 上限随每次取令牌传入（直接来自 preset.max_concurrency），配置改了下次调用即生效；
 * 调大上限会立刻放行已排队的等待者。与 waitForAiOutboundInterval 节流叠加、互不干扰。
 */

const DEFAULT_CONCURRENCY_LIMIT = 6

// 排队/间隔等待被取消时抛出的错误：name='AbortError'，与 fetch/AbortController 约定一致，
// 便于上游按 err.name === 'AbortError' 判定取消而非真实失败。
export function createGateAbortError(message = '请求已取消'): Error {
  const error = new Error(message)
  error.name = 'AbortError'
  return error
}

interface GateState {
  limit: number
  active: number
  waiters: Array<() => void>
}

const gates = new Map<string, GateState>()

function normalizeLimit(value: unknown): number {
  const next = Number(value)
  if (!Number.isFinite(next) || next <= 0) return DEFAULT_CONCURRENCY_LIMIT
  return Math.max(1, Math.min(64, Math.trunc(next)))
}

function getGate(key: string): GateState {
  let gate = gates.get(key)
  if (!gate) {
    gate = { limit: DEFAULT_CONCURRENCY_LIMIT, active: 0, waiters: [] }
    gates.set(key, gate)
  }
  return gate
}

// 在不超过上限的前提下，依序唤醒排队的等待者（唤醒即占用令牌）。
function drain(gate: GateState): void {
  while (gate.active < gate.limit && gate.waiters.length > 0) {
    const wake = gate.waiters.shift()
    if (!wake) break
    gate.active += 1
    wake()
  }
}

/**
 * 取得一个令牌，返回幂等释放函数。达到上限时排队，直到有令牌释放。
 * @param key    令牌池 key（端点与凭据的组合）
 * @param limit  该预设当前并发上限（每次取令牌都会刷新，配置变更即时生效）
 * @param signal 可选取消信号：排队期间被 abort（用户取消/超时）则移出队列并拒绝，
 *               不再滞留占位（批次 F 前置补强：删客户端节流前服务端排队须可取消）。
 */
export function acquireModelSlot(key: string, limit?: unknown, signal?: AbortSignal): Promise<() => void> {
  if (signal?.aborted) return Promise.reject(createGateAbortError())
  const gate = getGate(key)
  gate.limit = normalizeLimit(limit)
  // 上限可能被调大，先放行已排队且现在能放行的等待者。
  drain(gate)

  return new Promise<() => void>((resolve, reject) => {
    let settled = false
    const onAbort = () => {
      if (settled) return
      settled = true
      // 仍在排队 → 移出等待队列（未占用令牌，无需归还）。
      const index = gate.waiters.indexOf(grant)
      if (index >= 0) gate.waiters.splice(index, 1)
      reject(createGateAbortError())
    }
    const grant = () => {
      if (settled) return
      settled = true
      signal?.removeEventListener('abort', onAbort)
      let released = false
      resolve(() => {
        if (released) return
        released = true
        gate.active -= 1
        if (gate.active < 0) gate.active = 0
        drain(gate)
      })
    }
    if (gate.active < gate.limit) {
      gate.active += 1
      grant()
      return
    }
    gate.waiters.push(grant) // 令牌由 drain 唤醒时自增
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

/**
 * body 流式转发期间「上游零字节静默」的容忍上限（毫秒）。超过即判定上游 stall：
 * 断上游连接、向下游 error、并归还令牌。
 *
 * 根因背景（2026-06-30）：服务端请求超时只覆盖「排队 + 等到响应头」这一段，拿到响应头后被显式清掉
 * （见 aiAppService createRequestTimeout 的清理时机），所以上游一旦在「回了 header 之后」断流/不收尾，
 * 既没有超时兜底、令牌又持有到 body 读完才还 → 客户端 `await response.text()` 永久挂、并发槽被永久占用。
 * 多旁白真并行抢同一令牌池时尤其容易踩响。这里给 body 转发补一道「空闲超时」watchdog 根治。
 *
 * 默认 120s：健康流即便慢首字/思考模型也不会整整 2 分钟零字节，故绝不误杀正常生成；真卡死则在 2 分钟内
 * 被斩断、释放并发槽、让下游请求自然结束。可按调用传入覆盖（测试用小值）。
 */
const BODY_IDLE_TIMEOUT_MS = 120_000

/**
 * 把令牌释放绑定到 Response 的 body 生命周期：body 读完 / 取消 / 出错 / 空闲超时时释放。
 * 上游 Response 由调用方（路由/投影）读取消费，令牌必须持有到读完（流式尤其重要），
 * 故在这里包一层透传流，对调用方零改动。无 body 时立即释放。
 * idleTimeoutMs：单次「等下一块字节」的最长静默时间，超过即判定 stall 并断流归还（缺省 BODY_IDLE_TIMEOUT_MS）。
 */
export function attachReleaseToResponse(
  upstream: Response,
  release: () => void,
  idleTimeoutMs: number = BODY_IDLE_TIMEOUT_MS
): Response {
  let released = false
  const safeRelease = () => {
    if (released) return
    released = true
    release()
  }
  if (!upstream.body) {
    safeRelease()
    return upstream
  }
  const reader = upstream.body.getReader()
  const idleMs = Number(idleTimeoutMs)
  const idleEnabled = Number.isFinite(idleMs) && idleMs > 0
  let idleTimer: ReturnType<typeof setTimeout> | null = null
  // 空闲超时已触发：标记后让仍在飞的那次 read 的后续处理一律早返回，避免把已 error 的流又 enqueue/close。
  let stalled = false
  const clearIdle = () => {
    if (idleTimer) {
      clearTimeout(idleTimer)
      idleTimer = null
    }
  }
  const passthrough = new ReadableStream({
    async pull(controller) {
      if (stalled) return
      // 读下一块前先武装空闲计时：本次 read 在 idleMs 内还没拿到任何字节 → 判定上游 stall。
      if (idleEnabled) {
        clearIdle()
        idleTimer = setTimeout(() => {
          stalled = true
          idleTimer = null
          try {
            controller.error(createGateAbortError('上游响应流空闲超时（疑似卡死），已断开并归还并发槽'))
          } catch {
            // controller 可能已关闭/出错，忽略。
          }
          void reader.cancel('idle-timeout').catch(() => {})
          safeRelease()
        }, idleMs)
      }
      try {
        const { done, value } = await reader.read()
        clearIdle()
        if (stalled) return
        if (done) {
          controller.close()
          safeRelease()
          return
        }
        controller.enqueue(value)
      } catch (error) {
        clearIdle()
        if (stalled) return
        controller.error(error)
        safeRelease()
      }
    },
    cancel(reason) {
      clearIdle()
      safeRelease()
      return reader.cancel(reason)
    }
  })
  return new Response(passthrough, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: upstream.headers
  })
}

// ===== 测试辅助 =====
export function __resetModelConcurrencyGates(): void {
  gates.clear()
}

export function __getModelConcurrencyGateState(
  key: string
): { limit: number; active: number; waiting: number } | null {
  const gate = gates.get(key)
  if (!gate) return null
  return { limit: gate.limit, active: gate.active, waiting: gate.waiters.length }
}
