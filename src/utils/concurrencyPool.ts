/**
 * 通用并发池（滑动窗口 + 限流 + 失败重试退避）。
 *
 * 背景：浏览器对同域 HTTP/1.1 并发连接上限 ≈6，且上游高峰期可能偶发 429。
 * 回复链路的计划生成需要「最多 N 个并行、一个完成立刻补下一个、单项失败可退避重试、
 * 单项失败不拖垮其它、结果保序」——本工具就是这套基础设施。
 *
 * 用于把调用方给出的并行任务限制在明确的有界并发量内。
 */

export interface ConcurrencyPoolOptions {
  /** 最大并发（<=0 视为 1）。回复链路计划生成建议 5~6（受浏览器同域连接数限制）。 */
  limit: number
  /** 每项失败的最大重试次数（默认 0，即只尝试 1 次；总尝试数 = retries + 1）。 */
  retries?: number
  /** 首次重试基准延迟，指数退避（默认 500ms；delay = base * 2^(attempt-1)）。 */
  retryDelayMs?: number
  /** 退避上限（默认 8000ms）。 */
  retryMaxDelayMs?: number
  /** 取消信号：aborted 后不再启动新任务，剩余项标记 rejected。 */
  signal?: AbortSignal
  /** 自定义是否对该错误重试（默认所有错误都重试，直到次数耗尽）。 */
  shouldRetry?: (error: unknown, attempt: number) => boolean
  /** 重试前回调（用于日志/进度）。 */
  onRetry?: (info: { index: number; attempt: number; error: unknown; delayMs: number }) => void
}

export interface ConcurrencyPoolItemResult<R> {
  index: number
  status: 'fulfilled' | 'rejected'
  value?: R
  error?: unknown
  /** 实际尝试次数（含首次）。 */
  attempts: number
}

function createAbortError(): Error {
  const error = new Error('并发池已取消')
  error.name = 'AbortError'
  return error
}

function delayWithAbort(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) {
    if (signal?.aborted) return Promise.reject(createAbortError())
    return Promise.resolve()
  }
  return new Promise<void>((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer)
      reject(createAbortError())
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    if (signal) {
      if (signal.aborted) { clearTimeout(timer); reject(createAbortError()); return }
      signal.addEventListener('abort', onAbort, { once: true })
    }
  })
}

/**
 * 以最多 `limit` 的并发跑完 `items`，每项交给 `worker` 处理。
 * 一个 worker 完成立刻领取下一项（滑动窗口）。单项失败按退避重试；
 * 单项最终失败不影响其它项。返回与 items 等长、保序的结果数组（allSettled 语义）。
 */
export async function runWithConcurrencyPool<T, R>(
  items: T[],
  worker: (item: T, index: number) => Promise<R>,
  options: ConcurrencyPoolOptions
): Promise<Array<ConcurrencyPoolItemResult<R>>> {
  const limit = Math.max(1, Math.floor(options.limit || 1))
  const retries = Math.max(0, Math.floor(options.retries ?? 0))
  const baseDelay = Math.max(0, options.retryDelayMs ?? 500)
  const maxDelay = Math.max(baseDelay, options.retryMaxDelayMs ?? 8000)
  const results: Array<ConcurrencyPoolItemResult<R>> = new Array(items.length)
  let cursor = 0

  async function runOne(index: number): Promise<void> {
    let attempt = 0
    // eslint-disable-next-line no-constant-condition
    while (true) {
      if (options.signal?.aborted) {
        results[index] = { index, status: 'rejected', error: createAbortError(), attempts: attempt }
        return
      }
      attempt += 1
      try {
        const value = await worker(items[index], index)
        results[index] = { index, status: 'fulfilled', value, attempts: attempt }
        return
      } catch (error) {
        const canRetry =
          attempt <= retries &&
          !options.signal?.aborted &&
          (options.shouldRetry ? options.shouldRetry(error, attempt) : true)
        if (!canRetry) {
          results[index] = { index, status: 'rejected', error, attempts: attempt }
          return
        }
        const delayMs = Math.min(maxDelay, baseDelay * Math.pow(2, attempt - 1))
        options.onRetry?.({ index, attempt, error, delayMs })
        try {
          await delayWithAbort(delayMs, options.signal)
        } catch {
          // 退避等待期间被取消：按失败收口
          results[index] = { index, status: 'rejected', error, attempts: attempt }
          return
        }
      }
    }
  }

  async function consumer(): Promise<void> {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const index = cursor
      if (index >= items.length) return
      cursor += 1
      await runOne(index)
    }
  }

  const consumerCount = Math.min(limit, items.length)
  await Promise.all(Array.from({ length: consumerCount }, () => consumer()))
  return results
}
