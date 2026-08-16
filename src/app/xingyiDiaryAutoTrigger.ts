import { API } from '../config/api'

export interface XingyiDiaryAutoGenerateResult {
  generatedDates: string[]
  latestReadyDateStr: string
}

export interface XingyiDiaryAutoTrigger {
  start: () => void
  stop: () => void
  checkNow: () => Promise<XingyiDiaryAutoGenerateResult | null>
}

interface XingyiDiaryAutoTriggerOptions {
  isEligible: () => boolean
  intervalMs?: number
  onError?: (error: unknown) => void
  request?: () => Promise<XingyiDiaryAutoGenerateResult>
}

async function requestDueGeneration(): Promise<XingyiDiaryAutoGenerateResult> {
  const response = await fetch(API.XINGYI_DIARY_AUTO_GENERATE_DUE, { method: 'POST' })
  const data = await response.json().catch(() => ({})) as {
    generatedDates?: unknown
    latestReadyDateStr?: unknown
    error?: unknown
  }
  if (!response.ok) {
    throw new Error(String(data.error || `星依日记自动补生成失败（HTTP ${response.status}）`))
  }
  return {
    generatedDates: Array.isArray(data.generatedDates)
      ? data.generatedDates.map((item) => String(item))
      : [],
    latestReadyDateStr: String(data.latestReadyDateStr || '')
  }
}

/**
 * 本地网页活跃信号：首次打开、窗口重新聚焦、标签页重新可见，以及页面持续打开时每分钟检查一次。
 * 多种信号只共享一个在途请求；日期与幂等真值全部留在服务端，本模块不自行推算“该生成哪一天”。
 */
export function createXingyiDiaryAutoTrigger(options: XingyiDiaryAutoTriggerOptions): XingyiDiaryAutoTrigger {
  const intervalMs = options.intervalMs ?? 60_000
  const request = options.request ?? requestDueGeneration
  let intervalId: number | null = null
  let inFlight: Promise<XingyiDiaryAutoGenerateResult | null> | null = null

  const checkNow = (): Promise<XingyiDiaryAutoGenerateResult | null> => {
    if (!options.isEligible()) return Promise.resolve(null)
    if (inFlight) return inFlight
    inFlight = request()
      .catch((error) => {
        options.onError?.(error)
        return null
      })
      .finally(() => {
        inFlight = null
      })
    return inFlight
  }

  const handleFocus = () => { void checkNow() }
  const handleVisibilityChange = () => {
    if (!document.hidden) void checkNow()
  }

  const start = () => {
    if (intervalId !== null) return
    window.addEventListener('focus', handleFocus)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    intervalId = window.setInterval(() => { void checkNow() }, intervalMs)
    void checkNow()
  }

  const stop = () => {
    if (intervalId === null) return
    window.clearInterval(intervalId)
    intervalId = null
    window.removeEventListener('focus', handleFocus)
    document.removeEventListener('visibilitychange', handleVisibilityChange)
  }

  return { start, stop, checkNow }
}
