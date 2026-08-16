type PerformanceMeta = Record<string, unknown>

const DEFAULT_SLOW_THRESHOLD_MS = 16

export function measureSync<T>(
  label: string,
  task: () => T,
  meta: PerformanceMeta = {},
  slowThresholdMs = DEFAULT_SLOW_THRESHOLD_MS
): T {
  const startedAt = now()
  try {
    return task()
  } finally {
    reportDuration(label, startedAt, meta, slowThresholdMs)
  }
}

export async function measureAsync<T>(
  label: string,
  task: () => Promise<T>,
  meta: PerformanceMeta = {},
  slowThresholdMs = DEFAULT_SLOW_THRESHOLD_MS
): Promise<T> {
  const startedAt = now()
  try {
    return await task()
  } finally {
    reportDuration(label, startedAt, meta, slowThresholdMs)
  }
}

export function reportDuration(
  label: string,
  startedAt: number,
  meta: PerformanceMeta = {},
  slowThresholdMs = DEFAULT_SLOW_THRESHOLD_MS
) {
  const durationMs = now() - startedAt
  if (!shouldReportPerformance(durationMs, slowThresholdMs)) return
  const rounded = Math.round(durationMs * 10) / 10
  const metaText = safeStringify(meta)
  console.debug(`[perf] ${label} ${rounded}ms ${metaText}`)
}

export function scheduleIdleTask(task: () => void, timeout = 1200) {
  if (typeof window === 'undefined') return
  const requestIdleCallback = window.requestIdleCallback
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(() => task(), { timeout })
    return
  }
  window.setTimeout(task, Math.min(timeout, 250))
}

function now() {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now()
  }
  return Date.now()
}

function shouldReportPerformance(durationMs: number, slowThresholdMs: number) {
  if (durationMs < slowThresholdMs) return false
  if (typeof import.meta !== 'undefined' && import.meta.env?.DEV) return true
  if (typeof localStorage === 'undefined') return false
  return localStorage.getItem('langhuan:perf') === '1'
}

function safeStringify(value: unknown) {
  try {
    return JSON.stringify(value ?? {})
  } catch {
    return '{}'
  }
}
